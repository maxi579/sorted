import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inflacionAcumulada, valuarActivo } from '../src/lib/activos';
import {
  aportesParaHacer,
  cuantoPorMes,
  fechaEstimada,
  fondoEmergenciaSugerido,
  reservaPendiente,
  ritmoMensual,
  saldoMeta,
  valorMeta,
} from '../src/lib/ahorros';
import { categoriaAprendida } from '../src/lib/aprendizaje';
import { gastoUltimaSemana, presupuestoAutomatico, semanaInusual } from '../src/lib/patrones';
import { balanceEfectivo, compararConteo, saldoEsperado } from '../src/lib/efectivo';
import { anotarDebitos, debitosParaAnotar, detectarRecurrentes, fijosDelMes, gastoDeFijo, pendienteDeFijos, totalMensualFijos, vencimientoDelMes } from '../src/lib/fijos';
import { leerFecha } from '../src/lib/formato';
import { mismoRecibo, nombrePeriodo, nombreRecibo, sueldoActual, sueldoContraInflacion, sueldosPorMes, type ReciboLeido } from '../src/lib/sueldos';
import { gastosDelRango, htmlDeGastos, rangoDePeriodo, totalesDe } from '../src/lib/exportar';
import type { GastoConMedio } from '../src/lib/datos';
import { accionesValidas, buscarPorNombre, describirAccion } from '../src/lib/accionesIA';
import {
  leerBancos,
  mejorBanco,
  montoParaNoPerder,
  nombreBanco,
  simularCuentaRemunerada,
  simularPlazoFijo,
  tasaParaPlazo,
  type BancoPlazoFijo,
} from '../src/lib/rendimientos';
import { interpretarNotificacion, leerImporte } from '../src/lib/interpretarNotificacion';
import type { Activo, Aporte, Conteo, Fijo, GastoGuardado, MedioPago, Meta, PagoFijo, Retiro } from '../src/lib/tipos';

const hoy = new Date(2026, 9, 10); // 10 de octubre de 2026
const visa: MedioPago = { id: 'v', nombre: 'Visa', banco: null, tipo: 'credito', red: 'visa', dia_cierre: 24, dia_vencimiento: 5 };

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

function gasto(descripcion: string, fecha: string, monto = 10_000, extra: Partial<GastoGuardado> = {}): GastoGuardado {
  return {
    id: String(Math.random()),
    descripcion,
    categoria: 'Entretenimiento',
    monto_total: monto,
    moneda: 'ARS',
    cantidad_cuotas: 1,
    primer_mes_cuota: `${fecha.slice(0, 7)}-01`,
    fecha_compra: fecha,
    tarjeta_id: null,
    ...extra,
  };
}

describe('gastos fijos', () => {
  it('el día 31 en un mes de 30 días vence el 30', () => {
    assert.equal(vencimientoDelMes(31, new Date(2026, 10, 3)).getDate(), 30);
    assert.equal(vencimientoDelMes(31, new Date(2027, 1, 3)).getDate(), 28);
  });

  it('marca el estado de cada fijo del mes', () => {
    const fijos = [
      fijo({ id: 'pagado', dia: 1 }),
      fijo({ id: 'vencido', dia: 5 }),
      fijo({ id: 'hoy', dia: 10 }),
      fijo({ id: 'pronto', dia: 13 }),
      fijo({ id: 'lejos', dia: 28 }),
      fijo({ id: 'apagado', activo: false }),
    ];
    const pagos: PagoFijo[] = [{ id: 'p', fijo_id: 'pagado', mes: '2026-10-01', monto: 30_000, gasto_id: null }];
    const estados = fijosDelMes(fijos, pagos, hoy).map((f) => `${f.fijo.id}:${f.estado}`);
    assert.deepEqual(estados, ['pagado:pagado', 'vencido:vencido', 'hoy:hoy', 'pronto:proximo', 'lejos:pendiente']);
  });

  it('un pago del mes pasado no cuenta para este mes', () => {
    const pagos: PagoFijo[] = [{ id: 'p', fijo_id: 'f', mes: '2026-09-01', monto: 30_000, gasto_id: null }];
    assert.equal(fijosDelMes([fijo({ dia: 28 })], pagos, hoy)[0].estado, 'pendiente');
  });

  it('suma lo pendiente, pasa dólares a pesos y cuenta las facturas sin monto', () => {
    const delMes = fijosDelMes([fijo({ id: 'a' }), fijo({ id: 'b', monto: 10, moneda: 'USD' }), fijo({ id: 'c', monto: null })], [], hoy);
    assert.deepEqual(pendienteDeFijos(delMes, 1_500), { total: 45_000, sinMonto: 1 });
  });

  it('separa lo que se va en suscripciones', () => {
    const total = totalMensualFijos([fijo({}), fijo({ id: 'n', tipo: 'suscripcion', monto: 12_000 }), fijo({ id: 'x', monto: null })], null);
    assert.deepEqual(total, { total: 42_000, suscripciones: 12_000, cantidadSuscripciones: 1 });
  });

  it('anota solos solo los débitos automáticos con monto que ya vencieron y no se pagaron', () => {
    const fijos = [
      fijo({ id: 'netflix', debito_automatico: true, dia: 5 }),
      fijo({ id: 'futuro', debito_automatico: true, dia: 20 }),
      fijo({ id: 'manual', dia: 5 }),
      fijo({ id: 'yaPagado', debito_automatico: true, dia: 2 }),
    ];
    const pagos: PagoFijo[] = [{ id: 'p', fijo_id: 'yaPagado', mes: '2026-10-01', monto: 1, gasto_id: null }];
    assert.deepEqual(
      debitosParaAnotar(fijos, pagos, hoy).map((d) => d.fijo.id),
      ['netflix']
    );
  });

  it('no duplica un débito automático que ya se anotó a mano ese mes', async () => {
    const creados: string[] = [];
    const pagosCreados: { gasto_id: string | null }[] = [];
    const datos = {
      crearGasto: async (fila: { descripcion: string }) => {
        creados.push(fila.descripcion);
        return 'guardado';
      },
      pagosFijos: { crear: async (fila: { gasto_id: string | null }) => void pagosCreados.push(fila) },
    } as unknown as Parameters<typeof anotarDebitos>[0];
    const fijos = [fijo({ id: 'n', descripcion: 'Netflix', debito_automatico: true, dia: 5 }), fijo({ id: 's', descripcion: 'Spotify', debito_automatico: true, dia: 3 })];
    const gastos = [gasto('netflix', '2026-10-05', 12_000, { id: 'manual' }), gasto('Spotify', '2026-09-03')];
    const anotados = await anotarDebitos(datos, fijos, [], [], gastos, hoy);
    assert.deepEqual(anotados, ['Spotify']); // el de septiembre no cuenta para octubre
    assert.deepEqual(creados, ['Spotify']);
    assert.equal(pagosCreados.length, 2);
    assert.ok(pagosCreados.some((p) => p.gasto_id === 'manual')); // Netflix se marca pagado con el gasto que ya existía
  });

  it('el gasto de un fijo con tarjeta cae en el resumen que corresponde', () => {
    const g = gastoDeFijo(fijo({ tarjeta_id: 'v', tipo: 'suscripcion', categoria: null }), 12_000, new Date(2026, 9, 25), [visa]);
    assert.equal(g.primer_mes_cuota, '2026-12-01'); // compra después del cierre del 24 → resumen de noviembre que vence en diciembre
    assert.equal(g.categoria, 'Entretenimiento');
    assert.equal(g.tarjeta_id, 'v');
  });

  it('detecta gastos que se repiten en distintos meses y que todavía no son fijos', () => {
    const gastos = [
      gasto('Netflix', '2026-10-05', 12_000),
      gasto('NETFLIX ', '2026-09-05', 11_000),
      gasto('Spotify 10/26', '2026-10-02'),
      gasto('Spotify 09/26', '2026-09-02'),
      gasto('Luz', '2026-10-01'),
      gasto('Luz', '2026-09-01'),
      gasto('Heladera', '2026-10-03', 500_000, { cantidad_cuotas: 6 }),
      gasto('Heladera', '2026-09-03', 500_000, { cantidad_cuotas: 6 }),
      gasto('Cine', '2026-10-04'),
      gasto('Gimnasio', '2026-05-01'),
      gasto('Gimnasio', '2026-04-01'),
    ];
    const recurrentes = detectarRecurrentes(gastos, [fijo({ descripcion: 'Luz' })], hoy);
    assert.deepEqual(
      recurrentes.map((r) => r.descripcion).sort(),
      ['Netflix', 'Spotify 10/26']
    );
    assert.equal(recurrentes.find((r) => r.descripcion === 'Netflix')?.monto, 12_000); // usa el último monto
    assert.equal(recurrentes.find((r) => r.descripcion === 'Netflix')?.dia, 5);
  });
});

describe('efectivo', () => {
  const retiro = (monto: number, fecha: string): Retiro => ({ id: fecha, monto, fecha, nota: null });

  it('compara lo que sacaste con lo que anotaste en efectivo desde el primer retiro', () => {
    const gastos = [
      gasto('Verdulería', '2026-10-08', 12_000),
      gasto('Kiosco', '2026-10-09', 3_000),
      gasto('Antes del retiro', '2026-10-01', 50_000),
      gasto('Con tarjeta', '2026-10-09', 99_000, { tarjeta_id: 'v' }),
    ];
    assert.deepEqual(balanceEfectivo([retiro(40_000, '2026-10-07'), retiro(5_000, '2026-08-01')], gastos, hoy), {
      retirado: 40_000,
      anotado: 15_000,
      sinAnotar: 25_000,
      desde: '2026-10-07',
    });
  });

  it('sin retiros recientes no hay nada que reclamar', () => {
    assert.equal(balanceEfectivo([], [gasto('x', '2026-10-09')], hoy).sinAnotar, 0);
  });
});

describe('activos', () => {
  const ctx = { hoy, dolar: 1_200, serieInflacion: [], inflacionMensual: 0 };
  const activo = (extra: Partial<Activo>): Activo => ({
    id: 'a',
    nombre: 'x',
    tipo: 'otro',
    monto_inicial: 1_000_000,
    fecha_inicio: '2026-09-10',
    cantidad: null,
    tna: null,
    plazo_dias: null,
    valor_actual: null,
    depreciacion_anual: null,
    ...extra,
  });

  it('acumula la inflación de cada mes, proporcional a los días', () => {
    const serie = [
      { fecha: '2026-08-31', valor: 2 },
      { fecha: '2026-09-30', valor: 3 },
    ];
    const meses = inflacionAcumulada(serie, new Date(2026, 7, 1), new Date(2026, 9, 1), 0.05);
    assert.ok(Math.abs(meses - (1.02 * 1.03 - 1)) < 1e-9);
    // Medio octubre sin dato publicado: usa la estimada
    const medio = inflacionAcumulada(serie, new Date(2026, 9, 1), new Date(2026, 9, 16), 0.031);
    assert.ok(Math.abs(medio - (Math.pow(1.031, 15 / 31) - 1)) < 1e-9);
  });

  it('valúa los dólares con la cotización', () => {
    const v = valuarActivo(activo({ tipo: 'dolares', cantidad: 1_000 }), ctx);
    assert.equal(v.valorHoy, 1_200_000);
    assert.ok(Math.abs(v.rendimiento! - 0.2) < 1e-9);
  });

  it('calcula lo ganado del plazo fijo hasta hoy y lo que cobra al vencer', () => {
    const v = valuarActivo(activo({ tipo: 'plazo_fijo', tna: 36.5, plazo_dias: 60 }), ctx);
    assert.ok(Math.abs(v.valorHoy - 1_030_000) < 1e-6); // 30 días al 36,5% anual = 3%
    assert.ok(Math.abs(v.vencimiento!.valor - 1_060_000) < 1e-6);
    assert.equal(v.vencimiento!.vencido, false);
    assert.equal(v.vencimiento!.fecha.toDateString(), new Date(2026, 10, 9).toDateString());
  });

  it('descuenta la inflación para el rendimiento real', () => {
    const v = valuarActivo(activo({ valor_actual: 1_100_000 }), { ...ctx, inflacionMensual: 0.1 });
    assert.ok(Math.abs(v.rendimientoReal! - (1.1 / 1.1 - 1)) < 0.001); // un mes al 10%: ganó lo mismo que la inflación
    assert.equal(v.manual, true);
  });

  it('un bien pierde valor con los años', () => {
    const v = valuarActivo(activo({ tipo: 'bien', depreciacion_anual: 20, fecha_inicio: '2025-10-10' }), ctx);
    assert.ok(Math.abs(v.valorHoy - 800_000) < 1);
  });
});

describe('fechas escritas a mano', () => {
  it('entiende día/mes/año y rechaza fechas que no existen', () => {
    assert.equal(leerFecha('5/10/2026'), '2026-10-05');
    assert.equal(leerFecha('05-10-26'), '2026-10-05');
    assert.equal(leerFecha('31/02/2026'), null);
    assert.equal(leerFecha('hola'), null);
  });
});

describe('notificaciones de billeteras', () => {
  const cuando = new Date(2026, 9, 10, 12).getTime();
  const notif = (titulo: string, texto: string, paquete = 'com.mercadopago.wallet') => ({ paquete, titulo, texto, cuando });

  it('lee montos con formato argentino', () => {
    assert.equal(leerImporte('8.500'), 8500);
    assert.equal(leerImporte('1.234.567,89'), 1234567.89);
    assert.equal(leerImporte('8500'), 8500);
    assert.equal(leerImporte('99,90'), 99.9);
  });

  it('detecta un pago con el comercio, el monto y la billetera', () => {
    assert.deepEqual(interpretarNotificacion(notif('Pagaste $ 8.500', 'Pagaste $ 8.500 en Café Martínez.')), {
      tipo: 'gasto',
      descripcion: 'Café Martínez',
      monto: 8500,
      moneda: 'ARS',
      fecha: '2026-10-10',
      fuente: 'Mercado Pago',
      original: 'Pagaste $ 8.500 · Pagaste $ 8.500 en Café Martínez.',
    });
  });

  it('entiende consumos con tarjeta en dólares de apps que no conoce', () => {
    const pago = interpretarNotificacion(notif('Consumo aprobado', 'Compraste en NETFLIX por US$ 9,99 con tu tarjeta Galicia', 'com.otro.banco'));
    assert.equal(pago?.tipo, 'gasto');
    assert.equal(pago?.tipo === 'gasto' && pago.moneda, 'USD');
    assert.equal(pago?.tipo === 'gasto' && pago.descripcion, 'NETFLIX');
    assert.equal(pago?.fuente, 'Galicia');
  });

  it('ignora la plata que entra y las notificaciones sin monto', () => {
    assert.equal(interpretarNotificacion(notif('Recibiste dinero', 'Juan te transfirió $ 20.000')), null);
    assert.equal(interpretarNotificacion(notif('Tus rendimientos', 'Ganaste $ 1.200 en tu cuenta')), null);
    assert.equal(interpretarNotificacion(notif('Pagaste', 'Tu pago fue aprobado')), null);
    assert.equal(interpretarNotificacion(notif('Promo', 'Hasta $ 5.000 de descuento en el súper')), null);
  });

  it('detecta el cobro del sueldo (y no lo confunde con otra plata que entra)', () => {
    const sueldo = interpretarNotificacion(notif('Acreditación de haberes', 'Te depositamos tu sueldo de $ 1.250.000', 'com.otro.banco'));
    assert.equal(sueldo?.tipo, 'sueldo');
    assert.equal(sueldo?.monto, 1_250_000);
    assert.equal(interpretarNotificacion(notif('Recibiste dinero', 'Juan te transfirió $ 20.000')), null);
  });

  it('una extracción del cajero es un retiro de efectivo', () => {
    assert.equal(interpretarNotificacion(notif('Extracción', 'Extrajiste $ 50.000 en un cajero', 'com.otro'))?.tipo, 'retiro');
  });
});

describe('contar la billetera', () => {
  const conteo = (monto: number, creado_en: string): Conteo => ({ id: creado_en, monto, creado_en });

  it('sin conteos todavía no se puede comparar', () => {
    assert.equal(saldoEsperado([], [], []), null);
    assert.deepEqual(compararConteo(null, 10_000), { tipo: 'primero' });
  });

  it('suma lo que sacaste y resta lo que anotaste en efectivo desde el último conteo', () => {
    const conteos = [conteo(30_000, '2026-10-05T12:00:00Z'), conteo(45_000, '2026-10-07T12:00:00Z')];
    const retiros: Retiro[] = [
      { id: 'r1', monto: 60_000, fecha: '2026-10-08', nota: null, creado_en: '2026-10-08T15:00:00+00:00' },
      { id: 'r0', monto: 99_000, fecha: '2026-10-06', nota: null, creado_en: '2026-10-06T15:00:00+00:00' },
    ];
    const gastos = [
      gasto('Verdulería', '2026-10-08', 12_000, { creado_en: '2026-10-08T18:00:00+00:00' }),
      gasto('Con tarjeta', '2026-10-08', 50_000, { tarjeta_id: 'v', creado_en: '2026-10-08T18:00:00+00:00' }),
      gasto('Antes del conteo', '2026-10-07', 7_000, { creado_en: '2026-10-07T11:00:00+00:00' }),
    ];
    const resultado = saldoEsperado(conteos, retiros, gastos);
    assert.equal(resultado?.esperado, 45_000 + 60_000 - 12_000);
    assert.equal(resultado?.ultimo.monto, 45_000);
  });

  it('sin hora de carga (modo demo), usa la fecha y no cuenta lo del mismo día', () => {
    const resultado = saldoEsperado([conteo(10_000, '2026-10-07T15:00:00Z')], [], [gasto('x', '2026-10-07', 3_000), gasto('y', '2026-10-08', 2_000)]);
    assert.equal(resultado?.esperado, 8_000);
  });

  it('dice si falta plata (gastó sin anotar), si sobra o si está justo', () => {
    assert.deepEqual(compararConteo(93_000, 75_000), { tipo: 'falta', diferencia: 18_000 });
    assert.deepEqual(compararConteo(20_000, 30_000), { tipo: 'sobra', diferencia: 10_000 });
    assert.deepEqual(compararConteo(20_000, 19_800), { tipo: 'justo' });
  });
});

describe('¿cuánto me rinde?', () => {
  const nacion: BancoPlazoFijo = { entidad: 'BANCO DE LA NACION ARGENTINA', tna30: 0.1925, porPlazo: [{ dias: 90, tna: 0.2 }] };
  const otro: BancoPlazoFijo = { entidad: 'BANCO CMF S.A.', tna30: 0.235, porPlazo: [] };

  it('arma nombres de banco legibles', () => {
    assert.equal(nombreBanco('BANCO DE LA NACION ARGENTINA'), 'Banco de la Nacion Argentina');
    assert.equal(nombreBanco('BANCO CMF S.A.'), 'Banco CMF');
  });

  it('usa la tasa publicada para el plazo o renueva cada 30 días', () => {
    assert.deepEqual(tasaParaPlazo(nacion, 90), { tna: 0.2, renovando: false });
    assert.deepEqual(tasaParaPlazo(nacion, 180), { tna: 0.1925, renovando: true });
    assert.deepEqual(tasaParaPlazo(nacion, 30), { tna: 0.1925, renovando: false });
  });

  it('calcula plazo fijo simple y renovando', () => {
    assert.ok(Math.abs(simularPlazoFijo(1_000_000, 0.365, 30, false) - 1_030_000) < 1e-6);
    assert.ok(Math.abs(simularPlazoFijo(1_000_000, 0.365, 60, true) - 1_000_000 * 1.03 * 1.03) < 1e-6);
  });

  it('calcula la cuenta remunerada con interés diario y lo necesario para no perder contra la inflación', () => {
    assert.ok(Math.abs(simularCuentaRemunerada(100_000, 36.5, 1) - 100_100) < 1e-6);
    assert.ok(Math.abs(montoParaNoPerder(100_000, 0.02, 60) - 104_040) < 1e-6);
  });

  it('elige el banco que más paga al final del plazo', () => {
    assert.equal(mejorBanco([nacion, otro], 30)?.banco.entidad, 'BANCO CMF S.A.');
    assert.equal(mejorBanco([], 30), null);
  });

  it('descarta datos raros de la API', () => {
    const bancos = leerBancos([
      { entidad: 'A', tnaClientes: 0.2, tasas: [{ plazoMinDias: 60, plazoMaxDias: 60, tna: 0.21 }, { plazoMinDias: 30, plazoMaxDias: 59, tna: 0.3 }] },
      { entidad: 'B', tnaClientes: 0 },
      { entidad: '', tnaClientes: 0.3 },
      'basura',
    ]);
    assert.deepEqual(bancos, [{ entidad: 'A', tna30: 0.2, porPlazo: [{ dias: 60, tna: 0.21 }] }]);
    assert.deepEqual(leerBancos(null), []);
  });
});

describe('la app aprende sola', () => {
  it('repite la categoría que la persona usó antes para lo mismo o algo parecido', () => {
    const gastos = [
      gasto('Farmacity', '2026-10-05', 1, { categoria: 'Salud' }),
      gasto('Super Coto', '2026-10-04', 1, { categoria: 'Supermercado' }),
      gasto('Farmacity', '2026-09-01', 1, { categoria: 'Compras' }),
    ];
    assert.equal(categoriaAprendida('farmacity', gastos), 'Salud'); // la más reciente manda
    assert.equal(categoriaAprendida('Coto Palermo', gastos), 'Supermercado'); // comparten "coto"
    assert.equal(categoriaAprendida('Cine', gastos), null);
    assert.equal(categoriaAprendida('pago con mp', gastos), null); // palabras vacías no cuentan
  });

  it('arma un presupuesto con lo que se suele gastar y avisa si va más rápido', () => {
    const g = (cat: string, fecha: string, monto: number) => gasto('x', fecha, monto, { categoria: cat });
    const gastos = [
      g('Comida y salidas', '2026-07-10', 90_000),
      g('Comida y salidas', '2026-08-10', 100_000),
      g('Comida y salidas', '2026-09-10', 110_000),
      g('Supermercado', '2026-09-10', 200_000),
      g('Comida y salidas', '2026-10-05', 80_000), // a 10 de octubre ya gastó 80% de lo normal
      g('Supermercado', '2026-10-05', 20_000),
      gasto('Heladera', '2026-08-10', 900_000, { categoria: 'Compras', cantidad_cuotas: 12 }), // en cuotas: no cuenta
    ];
    const p = presupuestoAutomatico(gastos, hoy);
    const comida = p.find((x) => x.categoria === 'Comida y salidas')!;
    assert.equal(comida.habitual, 100_000);
    assert.equal(comida.alerta, true);
    const super_ = p.find((x) => x.categoria === 'Supermercado')!;
    assert.ok(Math.abs(super_.habitual - 200_000 / 3) < 1e-6); // en julio y agosto no gastó: cuenta como 0
    assert.equal(super_.alerta, false);
    assert.equal(p.find((x) => x.categoria === 'Compras'), undefined);
  });

  it('sin al menos 2 meses de historial no inventa un presupuesto', () => {
    assert.deepEqual(presupuestoAutomatico([gasto('x', '2026-09-10', 1000)], hoy), []);
  });

  it('detecta una semana fuera de lo común', () => {
    const g = (fecha: string, monto: number) => gasto('x', fecha, monto, { categoria: 'Comida y salidas' });
    const normales = ['2026-09-30', '2026-09-23', '2026-09-16', '2026-09-09', '2026-09-02', '2026-08-26', '2026-08-19', '2026-08-12'].map((f) => g(f, 10_000));
    assert.equal(semanaInusual([...normales, g('2026-10-08', 12_000)], hoy), null);
    assert.deepEqual(semanaInusual([...normales, g('2026-10-08', 35_000)], hoy), { categoria: 'Comida y salidas', estaSemana: 35_000, normal: 10_000 });
  });

  it('suma lo de los últimos 7 días', () => {
    assert.equal(gastoUltimaSemana([gasto('a', '2026-10-10', 5_000), gasto('b', '2026-10-04', 3_000), gasto('c', '2026-10-03', 9_000)], hoy), 8_000);
  });
});

describe('ahorros', () => {
  const meta = (extra: Partial<Meta> = {}): Meta => ({
    id: 'm',
    nombre: 'Vacaciones',
    emoji: '✈️',
    objetivo: 1_200_000,
    fecha_objetivo: '2027-01-15',
    activo_id: null,
    ahorro_mensual: 150_000,
    dia_aporte: null,
    ...extra,
  });
  const aporte = (monto: number, fecha: string, extra: Partial<Aporte> = {}): Aporte => ({ id: fecha + monto, meta_id: 'm', monto, fecha, automatico: false, ...extra });
  const mp: Activo = { id: 'mp', nombre: 'MP', tipo: 'remunerada', monto_inicial: 1, fecha_inicio: '2026-01-01', cantidad: null, tna: 36.5, plazo_dias: null, valor_actual: null, depreciacion_anual: null };

  it('suma lo separado, resta lo que se sacó y agrega los intereses de donde está guardado', () => {
    const aportes = [aporte(100_000, '2026-10-09'), aporte(-20_000, '2026-10-10'), aporte(5_000, '2026-10-10', { meta_id: 'otra' })];
    assert.equal(saldoMeta(aportes, 'm'), 80_000);
    const conInteres = valorMeta(aportes, 'm', mp, null, hoy);
    assert.ok(Math.abs(conInteres.valor - (100_000 * Math.pow(1.001, 1) - 20_000)) < 1e-6); // 1 día al 36,5% anual = 0,1%
    assert.ok(Math.abs(conInteres.intereses - 100) < 1e-6);
    assert.equal(valorMeta(aportes, 'm', null, null, hoy).intereses, 0);
  });

  it('dice cuánto separar por mes para llegar a tiempo y cuándo se llega a este ritmo', () => {
    assert.equal(cuantoPorMes(meta(), 300_000, hoy), 300_000); // faltan 900.000 en 3 meses (oct → ene)
    assert.equal(cuantoPorMes(meta(), 1_300_000, hoy), 0);
    assert.equal(cuantoPorMes(meta({ fecha_objetivo: null }), 0, hoy), null);
    const aportes = [aporte(90_000, '2026-08-05'), aporte(90_000, '2026-09-05'), aporte(90_000, '2026-10-05'), aporte(500_000, '2026-01-05')];
    assert.equal(ritmoMensual(aportes, 'm', hoy), 90_000);
    assert.equal(fechaEstimada(meta(), 300_000, 90_000, hoy)?.toDateString(), new Date(2027, 7, 1).toDateString()); // 900.000 / 90.000 = 10 meses
  });

  it('"págate primero": reserva lo que falta separar este mes', () => {
    const metas = [meta(), meta({ id: 'n', ahorro_mensual: 50_000 }), meta({ id: 'sin', ahorro_mensual: null })];
    const aportes = [aporte(100_000, '2026-10-02'), aporte(80_000, '2026-10-03', { meta_id: 'n' })];
    assert.equal(reservaPendiente(metas, aportes, hoy), 50_000); // a "m" le faltan 50.000; "n" ya se pasó
  });

  it('hace el aporte automático una vez por mes, cuando llega el día', () => {
    const metas = [meta({ dia_aporte: 5 }), meta({ id: 'futuro', dia_aporte: 20 })];
    assert.deepEqual(aportesParaHacer(metas, [], hoy).map((m) => m.id), ['m']);
    assert.deepEqual(aportesParaHacer(metas, [aporte(150_000, '2026-10-05', { automatico: true })], hoy), []);
  });

  it('sugiere un fondo de emergencia de 3 meses', () => {
    assert.equal(fondoEmergenciaSugerido(496_477, 0), 1_490_000);
    assert.equal(fondoEmergenciaSugerido(0, 300_000), 900_000);
    assert.equal(fondoEmergenciaSugerido(0, 0), null);
  });
});

describe('acciones del asistente', () => {
  it('descarta acciones inventadas o con datos raros', () => {
    const validas = accionesValidas([
      { tipo: 'anotar_gasto', descripcion: 'Café', monto: 3500, moneda: 'ARS', cuotas: 1, medio: '', categoria: 'Comida', fecha: '' },
      { tipo: 'anotar_gasto', descripcion: 'Café', monto: -5, moneda: 'ARS', cuotas: 1, medio: '', categoria: 'Comida', fecha: '' },
      { tipo: 'borrar_todo' },
      { tipo: 'crear_fijo', descripcion: 'Netflix', monto: 12000, moneda: 'ARS', dia: 40, clase: 'suscripcion', debito_automatico: true, medio: '' },
      { tipo: 'separar_ahorro', meta: 'Viaje', monto: -20000 },
      { tipo: 'abrir_pantalla', pantalla: 'ahorros' },
      { tipo: 'abrir_pantalla', pantalla: '../login' },
      null,
    ]);
    assert.deepEqual(
      validas.map((a) => a.tipo),
      ['anotar_gasto', 'separar_ahorro', 'abrir_pantalla']
    );
    assert.deepEqual(accionesValidas('nada'), []);
  });

  it('encuentra por nombre aunque no sea exacto', () => {
    const lista = [{ nombre: 'Visa Galicia' }, { nombre: 'Mercado Pago' }];
    assert.equal(buscarPorNombre(lista, 'mercado pago', (x) => x.nombre)?.nombre, 'Mercado Pago');
    assert.equal(buscarPorNombre(lista, 'visa', (x) => x.nombre)?.nombre, 'Visa Galicia');
    assert.equal(buscarPorNombre(lista, 'Amex', (x) => x.nombre), null);
    assert.equal(buscarPorNombre(lista, '', (x) => x.nombre), null);
  });

  it('describe la acción en una línea', () => {
    const fijo = describirAccion({ tipo: 'crear_fijo', descripcion: 'Netflix', monto: 0, moneda: 'ARS', dia: 5, clase: 'suscripcion', debito_automatico: false, medio: '' });
    assert.equal(fijo.titulo, 'Agregar suscripción');
    assert.match(fijo.detalle, /monto variable/);
    assert.equal(describirAccion({ tipo: 'separar_ahorro', meta: 'Viaje', monto: -1000 }).titulo, 'Sacar de tu ahorro');
  });
});

describe('recibos de sueldo', () => {
  const recibo = (periodo: string, neto: number, extra: Partial<ReciboLeido> = {}): ReciboLeido => ({
    periodo,
    desde: null,
    hasta: null,
    empleador: 'Acme',
    bruto: null,
    neto,
    moneda: 'ARS',
    tipo: 'sueldo',
    ...extra,
  });

  it('el sueldo es el neto del último mes, sumando empleadores y sin contar el aguinaldo', () => {
    const recibos = [
      recibo('2026-08-01', 1_000_000),
      recibo('2026-09-01', 1_100_000),
      recibo('2026-09-01', 300_000, { empleador: 'Freelance SRL' }),
      recibo('2026-12-01', 550_000, { tipo: 'aguinaldo' }),
      recibo('2026-09-01', 90_000, { tipo: 'ajuste' }),
    ];
    assert.deepEqual(sueldoActual(recibos), { periodo: '2026-09-01', neto: 1_400_000, estimado: false });
    assert.equal(sueldoActual([]), null);
  });

  it('reconoce un recibo repetido', () => {
    assert.ok(mismoRecibo(recibo('2026-09-01', 1), recibo('2026-09-01', 1, { empleador: 'ACME' })));
    assert.ok(!mismoRecibo(recibo('2026-09-01', 1), recibo('2026-09-01', 1, { tipo: 'aguinaldo' })));
  });

  it('cobrar por quincena: dos recibos del mismo mes no son el mismo recibo, y se suman', () => {
    const q = (desde: string, hasta: string, neto: number) => recibo(`${hasta.slice(0, 7)}-01`, neto, { desde, hasta });
    const primera = q('2026-09-01', '2026-09-15', 600_000);
    const segunda = q('2026-09-16', '2026-09-30', 600_000);
    assert.ok(!mismoRecibo(primera, segunda));
    assert.ok(mismoRecibo(primera, { ...primera }));
    assert.equal(nombreRecibo(primera), '1ª quincena de septiembre 2026');
    assert.equal(nombreRecibo(segunda), '2ª quincena de septiembre 2026');
    assert.equal(nombreRecibo(recibo('2026-09-01', 1)), 'septiembre 2026');

    // Septiembre completo
    assert.deepEqual(sueldoActual([primera, segunda]), { periodo: '2026-09-01', neto: 1_200_000, estimado: false });
    // Llegó la 1ª de octubre: el sueldo sigue siendo el de septiembre completo
    const octubre = q('2026-10-01', '2026-10-15', 650_000);
    assert.deepEqual(sueldoActual([primera, segunda, octubre]), { periodo: '2026-09-01', neto: 1_200_000, estimado: false });
    // Solo una quincena cargada: se estima el mes entero
    const solo = sueldoActual([octubre])!;
    assert.equal(solo.estimado, true);
    assert.equal(solo.neto, Math.round(650_000 / (15 / 31)));
    assert.equal(sueldosPorMes([primera, segunda])[0].completo, true);
  });

  it('mes con vacaciones: el recibo de vacaciones y el del sueldo se suman; el aguinaldo no', () => {
    const recibos = [
      recibo('2026-01-01', 700_000, { desde: '2026-01-01', hasta: '2026-01-14', tipo: 'vacaciones' }),
      recibo('2026-01-01', 650_000, { desde: '2026-01-15', hasta: '2026-01-31' }),
      recibo('2026-01-01', 400_000, { tipo: 'aguinaldo' }),
    ];
    const [enero] = sueldosPorMes(recibos);
    assert.equal(enero.completo, true);
    assert.equal(enero.cobrado, 1_350_000);
    assert.ok(!mismoRecibo(recibos[0], recibos[1]));
  });

  it('cobrar por semana: el mes se completa con las semanas', () => {
    const s = (desde: string, hasta: string) => recibo('2026-09-01', 250_000, { desde, hasta });
    const semanas = [s('2026-09-01', '2026-09-07'), s('2026-09-08', '2026-09-14'), s('2026-09-15', '2026-09-21'), s('2026-09-22', '2026-09-28')];
    const [mes] = sueldosPorMes(semanas);
    assert.equal(mes.completo, true);
    assert.equal(mes.cobrado, 1_000_000);
    assert.equal(nombreRecibo(semanas[1]), 'del 8 al 14 de septiembre 2026');
  });

  it('compara la suba del sueldo con la inflación de esos meses', () => {
    const serie = [
      { fecha: '2026-08-31', valor: 2 },
      { fecha: '2026-09-30', valor: 3 },
    ];
    const r = sueldoContraInflacion([recibo('2026-07-01', 1_000_000), recibo('2026-09-01', 1_100_000)], serie, 0.02)!;
    assert.equal(r.desde, '2026-07-01');
    assert.ok(Math.abs(r.suba - 0.1) < 1e-9);
    assert.ok(Math.abs(r.inflacion - (1.02 * 1.03 - 1)) < 1e-9);
    assert.ok(r.real > 0);
    assert.equal(sueldoContraInflacion([recibo('2026-07-01', 1)], serie, 0.02), null);
    assert.equal(nombrePeriodo('2026-09-01'), 'septiembre 2026');
  });
});

describe('exportar a PDF', () => {
  const gasto = (fecha: string, monto: number, extra: Partial<GastoConMedio> = {}): GastoConMedio => ({
    id: fecha + monto,
    descripcion: 'Algo',
    categoria: 'Supermercado',
    monto_total: monto,
    moneda: 'ARS',
    cantidad_cuotas: 1,
    primer_mes_cuota: null,
    fecha_compra: fecha,
    tarjeta_id: null,
    tarjetas: null,
    ...extra,
  });

  it('arma los rangos de cada período', () => {
    const hoy = new Date(2026, 9, 12);
    assert.deepEqual(rangoDePeriodo('este-mes', hoy), { desde: '2026-10-01', hasta: '2026-10-12', titulo: 'octubre 2026' });
    assert.deepEqual(rangoDePeriodo('mes-pasado', hoy), { desde: '2026-09-01', hasta: '2026-09-30', titulo: 'septiembre 2026' });
    assert.equal(rangoDePeriodo('mes-pasado', new Date(2026, 0, 5)).titulo, 'diciembre 2025');
    assert.equal(rangoDePeriodo('todo', hoy).desde, null);
  });

  it('filtra por fecha y suma por moneda y categoría', () => {
    const gastos = [
      gasto('2026-09-30', 5_000),
      gasto('2026-10-01', 10_000),
      gasto('2026-10-05', 30_000, { categoria: 'Compras' }),
      gasto('2026-10-06', 20, { moneda: 'USD' }),
    ];
    const elegidos = gastosDelRango(gastos, rangoDePeriodo('este-mes', new Date(2026, 9, 12)));
    assert.deepEqual(elegidos.map((g) => g.fecha_compra), ['2026-10-06', '2026-10-05', '2026-10-01']);
    const totales = totalesDe(elegidos);
    assert.equal(totales.pesos, 40_000);
    assert.equal(totales.dolares, 20);
    assert.deepEqual(totales.categorias.map((c) => c.categoria), ['Compras', 'Supermercado']);
  });

  it('escapa lo que escribió la persona', () => {
    const html = htmlDeGastos({
      nombre: 'Max',
      rango: rangoDePeriodo('todo', new Date(2026, 9, 12)),
      gastos: [gasto('2026-10-01', 100, { descripcion: '<script>alert(1)</script>' })],
      generado: new Date(2026, 9, 12),
    });
    assert.ok(!html.includes('<script>alert'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});
