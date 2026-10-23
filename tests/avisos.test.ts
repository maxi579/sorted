import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { formatearFecha } from '../src/lib/finanzas';
import type { Fijo, MedioPago, PagoFijo } from '../src/lib/tipos';
import { guardado, reiniciarAlmacenamiento } from './simulados/almacenamiento';
import {
  cantidadDeLlamadas,
  estado,
  programadas,
  reiniciarNotificaciones,
  scheduleNotificationAsync,
  tocarNotificacion,
} from './simulados/notificaciones';
import { Platform } from './simulados/react-native';

const CIERRES = 'avisos-cierre-activados';
const RECORDATORIO = 'recordatorio-activado';
const EFECTIVO = 'recordatorio-efectivo';
const FRECUENCIA = 'recordatorio-efectivo-frecuencia';

const visa: MedioPago = { id: 'v', nombre: 'Visa', banco: null, tipo: 'credito', red: 'visa', dia_cierre: 24, dia_vencimiento: 5 };
const master: MedioPago = { id: 'm', nombre: 'Master', banco: null, tipo: 'credito', red: 'mastercard', dia_cierre: 10, dia_vencimiento: 20 };
const hoy = new Date(2026, 9, 9, 12, 0); // viernes 9 de octubre de 2026, mediodía

function fijo(extra: Partial<Fijo>): Fijo {
  return {
    id: 'f',
    descripcion: 'Luz',
    categoria: 'Servicios',
    tipo: 'servicio',
    monto: 30_000,
    moneda: 'ARS',
    dia: 15,
    tarjeta_id: null,
    debito_automatico: false,
    activo: true,
    ...extra,
  };
}

// Cada prueba usa su propia copia del módulo: así no comparten el estado interno ni el sistema operativo con el que se cargó
let copias = 0;
async function cargar(sistema = 'android') {
  Platform.OS = sistema;
  return (await import(`../src/lib/avisos.ts?prueba=${copias++}`)) as typeof import('../src/lib/avisos');
}

const ponerHora = (fecha: Date) => mock.timers.setTime(fecha.getTime());
const horaDe = (fecha: Date) => `${formatearFecha(fecha)} ${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`;
const ids = () => programadas().map((p) => p.identifier);
// [identificador, cuándo suena] de cada aviso programado, en el orden en que se programaron
const avisos = () => programadas().map((p) => [p.identifier, horaDe(p.trigger.date!)]);
const sembrar = (...identificadores: string[]) =>
  Promise.all(identificadores.map((identifier) => scheduleNotificationAsync({ identifier, content: { title: 'viejo', body: '' }, trigger: { type: 'date' } })));

describe('avisos', () => {
  beforeEach(() => {
    reiniciarAlmacenamiento();
    reiniciarNotificaciones();
    Platform.OS = 'android';
    mock.timers.enable({ apis: ['Date'], now: hoy.getTime() });
  });
  afterEach(() => {
    mock.timers.reset();
  });

  describe('cierre de tarjetas', () => {
    beforeEach(() => {
      guardado.set(CIERRES, 'si');
    });

    it('avisa a las 10 del día anterior al cierre, durante los próximos 3 cierres', async () => {
      const { programarAvisosCierre } = await cargar();
      await programarAvisosCierre([visa]);
      assert.deepEqual(avisos(), [
        ['cierre-v-2026-10-24', '2026-10-23 10:00'],
        ['cierre-v-2026-11-24', '2026-11-23 10:00'],
        ['cierre-v-2026-12-24', '2026-12-23 10:00'],
      ]);
    });

    it('el aviso dice qué tarjeta cierra y suena en el canal de avisos', async () => {
      const { programarAvisosCierre } = await cargar();
      await programarAvisosCierre([visa]);
      const [aviso] = programadas();
      assert.equal(aviso.content.title, 'Mañana cierra tu Visa 💳');
      assert.equal(aviso.content.body, 'Si podés esperar a pasado mañana para comprar con esta tarjeta, la pagás un mes más tarde.');
      assert.deepEqual(aviso.trigger, { type: 'date', date: new Date(2026, 9, 23, 10, 0), channelId: 'avisos' });
    });

    it('si el aviso de este cierre ya pasó (o es justo la hora), empieza por el cierre del mes que viene', async () => {
      const { programarAvisosCierre } = await cargar();
      for (const ahora of [new Date(2026, 9, 23, 10, 0), new Date(2026, 9, 23, 23, 59), new Date(2026, 9, 24, 9, 0)]) {
        reiniciarNotificaciones();
        ponerHora(ahora);
        await programarAvisosCierre([visa]);
        assert.deepEqual(ids(), ['cierre-v-2026-11-24', 'cierre-v-2026-12-24'], horaDe(ahora));
      }
      reiniciarNotificaciones();
      ponerHora(new Date(2026, 9, 23, 9, 59));
      await programarAvisosCierre([visa]);
      assert.deepEqual(ids(), ['cierre-v-2026-10-24', 'cierre-v-2026-11-24', 'cierre-v-2026-12-24']);
    });

    it('un cierre el día 1 avisa el último día del mes anterior, también al cambiar de año', async () => {
      const { programarAvisosCierre } = await cargar();
      await programarAvisosCierre([{ ...visa, dia_cierre: 1 }]);
      assert.deepEqual(avisos(), [
        ['cierre-v-2026-11-01', '2026-10-31 10:00'],
        ['cierre-v-2026-12-01', '2026-11-30 10:00'],
        ['cierre-v-2027-01-01', '2026-12-31 10:00'],
      ]);
    });

    it('un cierre el 31 cae el último día de cada mes', async () => {
      const { programarAvisosCierre } = await cargar();
      ponerHora(new Date(2027, 1, 3, 12, 0));
      await programarAvisosCierre([{ ...visa, dia_cierre: 31 }]);
      assert.deepEqual(avisos(), [
        ['cierre-v-2027-02-28', '2027-02-27 10:00'],
        ['cierre-v-2027-03-31', '2027-03-30 10:00'],
        ['cierre-v-2027-04-30', '2027-04-29 10:00'],
      ]);
    });

    it('cada tarjeta tiene sus propios avisos, y si el de mañana ya no llega a tiempo lo saltea', async () => {
      const { programarAvisosCierre } = await cargar();
      await programarAvisosCierre([visa, master]);
      // La Master cierra mañana (10 de octubre) y hoy ya son más de las 10 del día anterior
      assert.deepEqual(ids(), [
        'cierre-v-2026-10-24',
        'cierre-v-2026-11-24',
        'cierre-v-2026-12-24',
        'cierre-m-2026-11-10',
        'cierre-m-2026-12-10',
      ]);
      assert.equal(programadas()[3].content.title, 'Mañana cierra tu Master 💳');
    });

    it('no avisa de tarjetas de débito ni de créditos sin día de cierre o de vencimiento', async () => {
      const { programarAvisosCierre } = await cargar();
      await programarAvisosCierre([
        { ...visa, id: 'd', tipo: 'debito' },
        { ...visa, id: 'x', dia_cierre: null },
        { ...visa, id: 'y', dia_vencimiento: null },
      ]);
      assert.deepEqual(ids(), []);
    });

    it('al reprogramar reemplaza los avisos de cierre anteriores y no toca los otros tipos de aviso', async () => {
      const { programarAvisosCierre } = await cargar();
      await sembrar('cierre-viejo-2026-10-01', 'vence-f-2026-10-15', 'recordatorio-2026-10-10', 'resumen-2026-10-11', 'efectivo-diario');
      await programarAvisosCierre([visa]);
      await programarAvisosCierre([visa]);
      assert.deepEqual(ids().sort(), [
        'cierre-v-2026-10-24',
        'cierre-v-2026-11-24',
        'cierre-v-2026-12-24',
        'efectivo-diario',
        'recordatorio-2026-10-10',
        'resumen-2026-10-11',
        'vence-f-2026-10-15',
      ]);
    });

    it('con los avisos apagados no programa nada ni cancela lo que había', async () => {
      const { programarAvisosCierre } = await cargar();
      guardado.set(CIERRES, 'no');
      await sembrar('cierre-viejo-2026-10-01');
      await programarAvisosCierre([visa]);
      assert.deepEqual(ids(), ['cierre-viejo-2026-10-01']);
      assert.equal(cantidadDeLlamadas('cancelScheduledNotificationAsync'), 0);
    });
  });

  describe('activar y desactivar los avisos', () => {
    it('al activarlos pide permiso, deja el interruptor en "si" y programa los cierres', async () => {
      const { activarAvisos, avisosActivados } = await cargar();
      assert.equal(await avisosActivados(), false);
      assert.equal(await activarAvisos([visa]), true);
      assert.equal(guardado.get(CIERRES), 'si');
      assert.equal(await avisosActivados(), true);
      assert.equal(cantidadDeLlamadas('requestPermissionsAsync'), 1);
      assert.equal(programadas().length, 3);
    });

    it('si ya tenía permiso no lo vuelve a pedir', async () => {
      const { activarAvisos } = await cargar();
      estado.permisoActual = true;
      assert.equal(await activarAvisos([visa]), true);
      assert.equal(cantidadDeLlamadas('requestPermissionsAsync'), 0);
    });

    it('si la persona no da permiso devuelve false y no deja nada activado ni programado', async () => {
      const { activarAvisos, avisosActivados } = await cargar();
      estado.permisoAlPedir = false;
      assert.equal(await activarAvisos([visa]), false);
      assert.equal(guardado.has(CIERRES), false);
      assert.equal(await avisosActivados(), false);
      assert.deepEqual(ids(), []);
    });

    it('en Android crea el canal de avisos antes de pedir permiso (Android 13+ no muestra el pedido sin canal)', async () => {
      const { activarAvisos } = await cargar('android');
      await activarAvisos([visa]);
      assert.deepEqual(estado.canales, ['avisos']);
      assert.ok(estado.llamadas.indexOf('setNotificationChannelAsync') < estado.llamadas.indexOf('requestPermissionsAsync'));
    });

    it('en iOS no hace falta ningún canal', async () => {
      const { activarAvisos } = await cargar('ios');
      assert.equal(await activarAvisos([visa]), true);
      assert.deepEqual(estado.canales, []);
    });

    it('configura cómo se muestran los avisos una sola vez', async () => {
      const { activarAvisos, programarAvisosCierre } = await cargar();
      await activarAvisos([visa]);
      await programarAvisosCierre([visa]);
      assert.equal(cantidadDeLlamadas('setNotificationHandler'), 1);
    });

    it('al desactivarlos cancela los cierres y los vencimientos, y deja los demás avisos', async () => {
      const { desactivarAvisos, avisosActivados } = await cargar();
      guardado.set(CIERRES, 'si');
      await sembrar('cierre-v-2026-10-24', 'vence-f-2026-10-15', 'recordatorio-2026-10-10', 'efectivo-semanal');
      await desactivarAvisos();
      assert.equal(guardado.get(CIERRES), 'no');
      assert.equal(await avisosActivados(), false);
      assert.deepEqual(ids().sort(), ['efectivo-semanal', 'recordatorio-2026-10-10']);
    });

    it('en la web no existen los avisos: nada se pide, se guarda ni se programa', async () => {
      const web = await cargar('web');
      guardado.set(CIERRES, 'si');
      guardado.set(RECORDATORIO, 'si');
      guardado.set(EFECTIVO, 'si');
      assert.equal(web.avisosDisponibles, false);
      assert.equal(await web.avisosActivados(), false);
      assert.equal(await web.recordatorioActivado(), false);
      assert.equal(await web.recordatorioEfectivoActivado(), false);
      assert.equal(await web.activarAvisos([visa]), false);
      assert.equal(await web.activarRecordatorio(false), false);
      assert.equal(await web.activarRecordatorioEfectivo('diario'), false);
      await web.programarAvisosCierre([visa]);
      await web.programarAvisosVencimiento([fijo({})], []);
      await web.programarResumenSemanal(1000, 1000);
      await web.programarRecordatorios(false);
      await web.desactivarAvisos();
      await web.desactivarRecordatorio();
      await web.desactivarRecordatorioEfectivo();
      web.escucharToques(() => {})();
      assert.deepEqual(estado.llamadas, []);
      assert.equal(estado.oyentes.size, 0);
      assert.equal(guardado.get(CIERRES), 'si'); // desactivar tampoco escribe nada
    });
  });

  describe('recordatorio de la noche', () => {
    beforeEach(() => {
      guardado.set(RECORDATORIO, 'si');
    });

    it('programa un recordatorio por noche a las 21, desde hoy y durante 14 días', async () => {
      const { programarRecordatorios } = await cargar();
      await programarRecordatorios(false);
      const lista = avisos();
      assert.equal(lista.length, 14);
      assert.deepEqual(lista[0], ['recordatorio-2026-10-09', '2026-10-09 21:00']);
      assert.deepEqual(lista[1], ['recordatorio-2026-10-10', '2026-10-10 21:00']);
      assert.deepEqual(lista[13], ['recordatorio-2026-10-22', '2026-10-22 21:00']);
      assert.ok(lista.every(([, cuando]) => cuando.endsWith(' 21:00')));
      assert.equal(new Set(ids()).size, 14);
    });

    it('el recordatorio invita a anotar y abre la pantalla de cargar gastos', async () => {
      const { programarRecordatorios } = await cargar();
      await programarRecordatorios(false);
      const [recordatorio] = programadas();
      assert.equal(recordatorio.content.title, '¿Gastaste algo hoy? 📝');
      assert.equal(recordatorio.content.body, 'Anotalo en 10 segundos así no se te escapa nada.');
      assert.deepEqual(recordatorio.content.data, { url: '/cargar' });
      assert.equal(recordatorio.trigger.type, 'date');
      assert.equal(recordatorio.trigger.channelId, 'avisos');
    });

    it('si ya anotó un gasto hoy, empieza mañana', async () => {
      const { programarRecordatorios } = await cargar();
      await programarRecordatorios(true);
      const lista = avisos();
      assert.equal(lista.length, 13);
      assert.deepEqual(lista[0], ['recordatorio-2026-10-10', '2026-10-10 21:00']);
      assert.deepEqual(lista[12], ['recordatorio-2026-10-22', '2026-10-22 21:00']);
    });

    it('al anotar un gasto el recordatorio de hoy se cancela y los de los otros días quedan', async () => {
      const { programarRecordatorios } = await cargar();
      await programarRecordatorios(false);
      assert.ok(ids().includes('recordatorio-2026-10-09'));
      await programarRecordatorios(true);
      assert.equal(ids().includes('recordatorio-2026-10-09'), false);
      assert.equal(ids().length, 13);
    });

    it('si ya pasaron las 21 (o son las 21 en punto), hoy no hay recordatorio', async () => {
      const { programarRecordatorios } = await cargar();
      for (const ahora of [new Date(2026, 9, 9, 21, 0), new Date(2026, 9, 9, 23, 30)]) {
        reiniciarNotificaciones();
        ponerHora(ahora);
        await programarRecordatorios(false);
        assert.equal(ids().length, 13, horaDe(ahora));
        assert.equal(ids()[0], 'recordatorio-2026-10-10', horaDe(ahora));
      }
      reiniciarNotificaciones();
      ponerHora(new Date(2026, 9, 9, 20, 59));
      await programarRecordatorios(false);
      assert.equal(ids()[0], 'recordatorio-2026-10-09');
    });

    it('los 14 días cruzan el fin de mes', async () => {
      const { programarRecordatorios } = await cargar();
      ponerHora(new Date(2026, 9, 25, 12, 0));
      await programarRecordatorios(false);
      const lista = ids();
      assert.equal(lista[6], 'recordatorio-2026-10-31');
      assert.equal(lista[7], 'recordatorio-2026-11-01');
      assert.equal(lista[13], 'recordatorio-2026-11-07');
    });

    it('al reprogramar no se duplican y los otros tipos de aviso no se tocan', async () => {
      const { programarRecordatorios } = await cargar();
      await sembrar('cierre-v-2026-10-24', 'resumen-2026-10-11', 'efectivo-semanal', 'recordatorio-2026-09-01');
      await programarRecordatorios(false);
      await programarRecordatorios(false);
      assert.equal(ids().filter((id) => id.startsWith('recordatorio-')).length, 14);
      assert.equal(ids().includes('recordatorio-2026-09-01'), false);
      assert.deepEqual(ids().filter((id) => !id.startsWith('recordatorio-')).sort(), ['cierre-v-2026-10-24', 'efectivo-semanal', 'resumen-2026-10-11']);
    });

    it('con el recordatorio apagado no programa nada', async () => {
      const { programarRecordatorios } = await cargar();
      guardado.set(RECORDATORIO, 'no');
      await programarRecordatorios(false);
      assert.deepEqual(ids(), []);
    });

    it('al activarlo pide permiso, lo deja en "si" y programa las noches', async () => {
      const { activarRecordatorio, recordatorioActivado } = await cargar();
      guardado.set(RECORDATORIO, 'no');
      assert.equal(await recordatorioActivado(), false);
      assert.equal(await activarRecordatorio(false), true);
      assert.equal(await recordatorioActivado(), true);
      assert.equal(cantidadDeLlamadas('requestPermissionsAsync'), 1);
      assert.equal(ids().length, 14);
    });

    it('al activarlo después de anotar un gasto hoy, no suena hoy', async () => {
      const { activarRecordatorio } = await cargar();
      await activarRecordatorio(true);
      assert.equal(ids().length, 13);
      assert.equal(ids().includes('recordatorio-2026-10-09'), false);
    });

    it('si no da permiso devuelve false y el recordatorio sigue apagado', async () => {
      const { activarRecordatorio, recordatorioActivado } = await cargar();
      guardado.delete(RECORDATORIO);
      estado.permisoAlPedir = false;
      assert.equal(await activarRecordatorio(false), false);
      assert.equal(await recordatorioActivado(), false);
      assert.equal(guardado.has(RECORDATORIO), false);
      assert.deepEqual(ids(), []);
    });

    it('al desactivarlo cancela solo los recordatorios de la noche', async () => {
      const { desactivarRecordatorio, programarRecordatorios, recordatorioActivado } = await cargar();
      await sembrar('cierre-v-2026-10-24', 'efectivo-diario');
      await programarRecordatorios(false);
      await desactivarRecordatorio();
      assert.equal(guardado.get(RECORDATORIO), 'no');
      assert.equal(await recordatorioActivado(), false);
      assert.deepEqual(ids().sort(), ['cierre-v-2026-10-24', 'efectivo-diario']);
    });
  });

  describe('vencimiento de gastos fijos', () => {
    beforeEach(() => {
      guardado.set(CIERRES, 'si');
    });

    it('avisa a las 10 del día anterior al vencimiento, este mes y el que viene', async () => {
      const { programarAvisosVencimiento } = await cargar();
      await programarAvisosVencimiento([fijo({})], []);
      assert.deepEqual(avisos(), [
        ['vence-f-2026-10-15', '2026-10-14 10:00'],
        ['vence-f-2026-11-15', '2026-11-14 10:00'],
      ]);
    });

    it('dice cuánto es y abre la pantalla de fijos; si el monto cambia cada mes, pide cargarlo', async () => {
      const { programarAvisosVencimiento } = await cargar();
      await programarAvisosVencimiento([fijo({ id: 'luz', descripcion: 'Luz' }), fijo({ id: 'gas', descripcion: 'Gas', monto: null }), fijo({ id: 'spotify', descripcion: 'Spotify', monto: 10, moneda: 'USD' })], []);
      const por = (id: string) => programadas().find((p) => p.identifier.startsWith(`vence-${id}-`))!;
      assert.equal(por('luz').content.title, 'Mañana vence Luz 🧾');
      assert.equal(por('luz').content.body, 'Son $ 30.000. Cuando lo pagues, marcalo en Fijos.');
      assert.equal(por('gas').content.body, 'Cargá el monto de la factura y marcalo como pagado.');
      assert.equal(por('spotify').content.body, 'Son US$ 10. Cuando lo pagues, marcalo en Fijos.');
      assert.deepEqual(por('luz').content.data, { url: '/fijos' });
    });

    it('saltea los fijos pausados, los que se debitan solos y el mes que ya está pagado', async () => {
      const { programarAvisosVencimiento } = await cargar();
      const fijos = [
        fijo({ id: 'luz' }),
        fijo({ id: 'pausado', activo: false }),
        fijo({ id: 'netflix', debito_automatico: true }),
        fijo({ id: 'gas', dia: 20 }),
      ];
      const pagos: PagoFijo[] = [{ id: 'p', fijo_id: 'gas', mes: '2026-10-01', monto: 20_000, gasto_id: null }];
      await programarAvisosVencimiento(fijos, pagos);
      assert.deepEqual(ids(), ['vence-luz-2026-10-15', 'vence-luz-2026-11-15', 'vence-gas-2026-11-20']);
    });

    it('un pago de otro fijo o de otro mes no cuenta como pagado', async () => {
      const { programarAvisosVencimiento } = await cargar();
      const pagos: PagoFijo[] = [
        { id: 'a', fijo_id: 'otro', mes: '2026-10-01', monto: 1, gasto_id: null },
        { id: 'b', fijo_id: 'f', mes: '2026-09-01', monto: 1, gasto_id: null },
      ];
      await programarAvisosVencimiento([fijo({})], pagos);
      assert.deepEqual(ids(), ['vence-f-2026-10-15', 'vence-f-2026-11-15']);
    });

    it('si el aviso de este mes ya pasó (o es justo la hora), solo queda el del mes que viene', async () => {
      const { programarAvisosVencimiento } = await cargar();
      for (const ahora of [new Date(2026, 9, 9, 10, 0), new Date(2026, 9, 9, 12, 0)]) {
        reiniciarNotificaciones();
        ponerHora(ahora);
        await programarAvisosVencimiento([fijo({ dia: 10 })], []); // vence mañana, y el aviso era hoy a las 10
        assert.deepEqual(avisos(), [['vence-f-2026-11-10', '2026-11-09 10:00']], horaDe(ahora));
      }
      reiniciarNotificaciones();
      ponerHora(new Date(2026, 9, 9, 9, 59));
      await programarAvisosVencimiento([fijo({ dia: 10 })], []);
      assert.deepEqual(ids(), ['vence-f-2026-10-10', 'vence-f-2026-11-10']);
    });

    it('al cambiar de año sigue en enero', async () => {
      const { programarAvisosVencimiento } = await cargar();
      ponerHora(new Date(2026, 11, 20, 12, 0));
      await programarAvisosVencimiento([fijo({ dia: 5 })], []);
      assert.deepEqual(avisos(), [['vence-f-2027-01-05', '2027-01-04 10:00']]);
    });

    it('al reprogramar reemplaza los vencimientos anteriores y no toca los cierres', async () => {
      const { programarAvisosVencimiento } = await cargar();
      await sembrar('vence-viejo-2026-10-01', 'cierre-v-2026-10-24');
      await programarAvisosVencimiento([fijo({})], []);
      assert.deepEqual(ids().sort(), ['cierre-v-2026-10-24', 'vence-f-2026-10-15', 'vence-f-2026-11-15']);
    });

    it('con los avisos apagados no programa nada', async () => {
      const { programarAvisosVencimiento } = await cargar();
      guardado.set(CIERRES, 'no');
      await programarAvisosVencimiento([fijo({})], []);
      assert.deepEqual(ids(), []);
    });
  });

  describe('resumen del domingo', () => {
    beforeEach(() => {
      guardado.set(CIERRES, 'si');
    });

    it('se programa para el próximo domingo a las 19 con lo gastado y lo que queda del mes', async () => {
      const { programarResumenSemanal } = await cargar();
      await programarResumenSemanal(45_000, 120_000);
      assert.deepEqual(avisos(), [['resumen-2026-10-11', '2026-10-11 19:00']]);
      const [resumen] = programadas();
      assert.equal(resumen.content.title, 'Tu semana en un vistazo 📊');
      assert.equal(resumen.content.body, 'En los últimos 7 días gastaste $ 45.000. Te quedan $ 120.000 para el mes.');
      assert.deepEqual(resumen.content.data, { url: '/' });
    });

    it('un domingo antes de las 19 es hoy; desde las 19 en punto, el domingo siguiente', async () => {
      const { programarResumenSemanal } = await cargar();
      for (const [ahora, esperado] of [
        [new Date(2026, 9, 11, 10, 0), ['resumen-2026-10-11', '2026-10-11 19:00']],
        [new Date(2026, 9, 11, 18, 59), ['resumen-2026-10-11', '2026-10-11 19:00']],
        [new Date(2026, 9, 11, 19, 0), ['resumen-2026-10-18', '2026-10-18 19:00']],
        [new Date(2026, 9, 11, 22, 0), ['resumen-2026-10-18', '2026-10-18 19:00']],
        [new Date(2026, 9, 12, 8, 0), ['resumen-2026-10-18', '2026-10-18 19:00']],
      ] as [Date, string[]][]) {
        reiniciarNotificaciones();
        ponerHora(ahora);
        await programarResumenSemanal(1000, null);
        assert.deepEqual(avisos(), [esperado], horaDe(ahora));
      }
    });

    it('redondea los montos y no dice que quedan menos de $0', async () => {
      const { programarResumenSemanal } = await cargar();
      await programarResumenSemanal(45_000.6, -5_000);
      assert.equal(programadas()[0].content.body, 'En los últimos 7 días gastaste $ 45.001. Te quedan $ 0 para el mes.');
    });

    it('sin presupuesto no habla de lo que queda del mes', async () => {
      const { programarResumenSemanal } = await cargar();
      await programarResumenSemanal(45_000, null);
      assert.equal(programadas()[0].content.body, 'En los últimos 7 días gastaste $ 45.000.');
    });

    it('al reabrir la app reemplaza el resumen anterior en vez de sumar otro', async () => {
      const { programarResumenSemanal } = await cargar();
      await sembrar('resumen-2026-10-04', 'cierre-v-2026-10-24');
      await programarResumenSemanal(1000, null);
      await programarResumenSemanal(2000, null);
      assert.deepEqual(ids().sort(), ['cierre-v-2026-10-24', 'resumen-2026-10-11']);
      assert.match(programadas().find((p) => p.identifier.startsWith('resumen-'))!.content.body, /\$ 2\.000\./);
    });

    it('con los avisos apagados no programa nada', async () => {
      const { programarResumenSemanal } = await cargar();
      guardado.set(CIERRES, 'no');
      await programarResumenSemanal(1000, 1000);
      assert.deepEqual(ids(), []);
    });
  });

  describe('contar la billetera', () => {
    it('todos los días a las 21', async () => {
      const { activarRecordatorioEfectivo, frecuenciaEfectivo, recordatorioEfectivoActivado } = await cargar();
      assert.equal(await activarRecordatorioEfectivo('diario'), true);
      assert.equal(await recordatorioEfectivoActivado(), true);
      assert.equal(await frecuenciaEfectivo(), 'diario');
      assert.equal(guardado.get(FRECUENCIA), 'diario');
      assert.deepEqual(ids(), ['efectivo-diario']);
      const [aviso] = programadas();
      assert.deepEqual(aviso.trigger, { type: 'daily', hour: 21, minute: 0, channelId: 'avisos' });
      assert.equal(aviso.content.title, '¿Cuánta plata tenés en la billetera? 💵');
      assert.deepEqual(aviso.content.data, { url: '/efectivo?contar=si' });
    });

    it('o los domingos a las 20', async () => {
      const { activarRecordatorioEfectivo, frecuenciaEfectivo } = await cargar();
      assert.equal(await activarRecordatorioEfectivo('semanal'), true);
      assert.equal(await frecuenciaEfectivo(), 'semanal');
      assert.deepEqual(ids(), ['efectivo-semanal']);
      assert.deepEqual(programadas()[0].trigger, { type: 'weekly', weekday: 1, hour: 20, minute: 0, channelId: 'avisos' }); // 1 = domingo
    });

    it('cambiar la frecuencia reemplaza el aviso anterior', async () => {
      const { activarRecordatorioEfectivo } = await cargar();
      await activarRecordatorioEfectivo('diario');
      await activarRecordatorioEfectivo('semanal');
      assert.deepEqual(ids(), ['efectivo-semanal']);
    });

    it('si no se eligió ninguna frecuencia (o está rota), es semanal', async () => {
      const { frecuenciaEfectivo } = await cargar();
      assert.equal(await frecuenciaEfectivo(), 'semanal');
      guardado.set(FRECUENCIA, 'cada tanto');
      assert.equal(await frecuenciaEfectivo(), 'semanal');
    });

    it('si no da permiso devuelve false y no cambia nada', async () => {
      const { activarRecordatorioEfectivo, recordatorioEfectivoActivado } = await cargar();
      estado.permisoAlPedir = false;
      assert.equal(await activarRecordatorioEfectivo('diario'), false);
      assert.equal(await recordatorioEfectivoActivado(), false);
      assert.equal(guardado.has(FRECUENCIA), false);
      assert.deepEqual(ids(), []);
    });

    it('al desactivarlo cancela solo el aviso de la billetera', async () => {
      const { activarRecordatorioEfectivo, desactivarRecordatorioEfectivo, recordatorioEfectivoActivado } = await cargar();
      await sembrar('recordatorio-2026-10-10');
      await activarRecordatorioEfectivo('diario');
      await desactivarRecordatorioEfectivo();
      assert.equal(guardado.get(EFECTIVO), 'no');
      assert.equal(await recordatorioEfectivoActivado(), false);
      assert.deepEqual(ids(), ['recordatorio-2026-10-10']);
    });
  });

  describe('tocar un aviso', () => {
    const respuesta = (url: unknown) => ({ notification: { request: { content: { data: { url } } } } });

    it('abre la pantalla del aviso con el que se abrió la app, una sola vez', async () => {
      const { escucharToques } = await cargar();
      estado.ultimaRespuesta = respuesta('/fijos');
      const abiertas: string[] = [];
      escucharToques((url) => abiertas.push(url))();
      escucharToques((url) => abiertas.push(url))();
      assert.deepEqual(abiertas, ['/fijos']);
    });

    it('mientras escucha abre la pantalla de cada aviso que toca la persona, e ignora los que no traen una', async () => {
      const { escucharToques } = await cargar();
      const abiertas: string[] = [];
      const dejarDeEscuchar = escucharToques((url) => abiertas.push(url));
      tocarNotificacion('/cargar');
      tocarNotificacion(undefined);
      tocarNotificacion(42);
      tocarNotificacion('/efectivo?contar=si');
      assert.deepEqual(abiertas, ['/cargar', '/efectivo?contar=si']);

      dejarDeEscuchar();
      tocarNotificacion('/fijos');
      assert.deepEqual(abiertas, ['/cargar', '/efectivo?contar=si']);
      assert.equal(estado.oyentes.size, 0);
    });
  });
});
