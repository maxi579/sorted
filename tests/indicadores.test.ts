import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { fallas, guardado, reiniciarAlmacenamiento } from './simulados/almacenamiento';
import { simularRed, type Respuesta } from './simulados/red';

const CLAVE = 'indicadores-v2';
const URL_TARJETA = 'https://dolarapi.com/v1/dolares/tarjeta';
const URL_BLUE = 'https://dolarapi.com/v1/dolares/blue';
const URL_INFLACION = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';
const HORA = 60 * 60 * 1000;
const ahora = new Date(2026, 9, 9, 12, 0); // 9 de octubre de 2026

// Cada prueba usa su propia copia del módulo: así no comparten lo que guarda en memoria ni la descarga en curso
let copias = 0;
async function cargar() {
  return (await import(`../src/lib/indicadores.ts?prueba=${copias++}`)) as typeof import('../src/lib/indicadores');
}

const inflacion = [
  { fecha: '2026-04-30', valor: 2.8 },
  { fecha: '2026-05-31', valor: 2.1 },
  { fecha: '2026-06-30', valor: 1.5 },
  { fecha: '2026-07-31', valor: 3.0 },
  { fecha: '2026-08-31', valor: 1.8 },
];

// Lo que contestan las tres APIs cuando todo anda bien
function red(cambios: Record<string, Respuesta> = {}) {
  return simularRed({
    [URL_TARJETA]: { cuerpo: { compra: 1500, venta: 1650 } },
    [URL_BLUE]: { cuerpo: { compra: 1380, venta: 1400 } },
    [URL_INFLACION]: { cuerpo: inflacion },
    ...cambios,
  });
}

const sinConexion = () => new Error('Network request failed');
const todoCaido = { [URL_TARJETA]: sinConexion(), [URL_BLUE]: sinConexion(), [URL_INFLACION]: sinConexion() };

const porDefecto = { dolarTarjeta: null, dolarBlue: null, inflacionMensual: 0.02, ultimaInflacion: null, serieInflacion: [], actualizado: null };

// Lo que quedó guardado en el celular en una descarga anterior
function dejarGuardado(extra: Record<string, unknown> = {}) {
  const viejo = {
    dolarTarjeta: 1500,
    dolarBlue: 1300,
    inflacionMensual: 0.03,
    ultimaInflacion: { mes: '2026-07-31', valor: 3 },
    serieInflacion: [{ fecha: '2026-07-31', valor: 3 }],
    actualizado: ahora.getTime() - HORA,
    ...extra,
  };
  guardado.set(CLAVE, JSON.stringify(viejo));
  return viejo;
}

const casi = (real: number, esperado: number) => assert.ok(Math.abs(real - esperado) < 1e-12, `${real} no es ${esperado}`);

// Deja avanzar las promesas hasta que la descarga haya salido a la red (con su temporizador de 8 segundos ya puesto)
async function esperarPedidos(pedidos: string[], cantidad: number) {
  for (let i = 0; i < 100 && pedidos.length < cantidad; i++) await Promise.resolve();
  assert.equal(pedidos.length, cantidad);
}

describe('dólar tarjeta e inflación', () => {
  beforeEach(() => {
    reiniciarAlmacenamiento();
    mock.timers.enable({ apis: ['Date', 'setTimeout'], now: ahora.getTime() });
  });
  afterEach(() => {
    mock.restoreAll();
    mock.timers.reset();
  });

  it('trae el dólar tarjeta (venta), el blue (compra) y la inflación del INDEC', async () => {
    const { pedidos } = red();
    const { obtenerIndicadores } = await cargar();
    const r = await obtenerIndicadores();
    assert.deepEqual(pedidos.sort(), [URL_BLUE, URL_INFLACION, URL_TARJETA].sort());
    assert.equal(r.dolarTarjeta, 1650); // lo que cuesta pagar con tarjeta, no lo que te dan
    assert.equal(r.dolarBlue, 1380); // lo que te dan por tus dólares, no lo que cuestan
    assert.deepEqual(r.ultimaInflacion, { mes: '2026-08-31', valor: 1.8 });
    assert.equal(r.serieInflacion.length, 5);
    assert.equal(r.actualizado, ahora.getTime());
  });

  it('la inflación mensual estimada es el promedio de los últimos 3 meses, como fracción', async () => {
    red();
    const { obtenerIndicadores } = await cargar();
    casi((await obtenerIndicadores()).inflacionMensual, (1.5 + 3.0 + 1.8) / 3 / 100);
  });

  it('de la serie de inflación guarda solo los últimos 36 meses', async () => {
    const tresAnios = Array.from({ length: 40 }, (_, i) => ({ fecha: `mes-${i + 1}`, valor: i + 1 }));
    red({ [URL_INFLACION]: { cuerpo: tresAnios } });
    const { obtenerIndicadores } = await cargar();
    const r = await obtenerIndicadores();
    assert.equal(r.serieInflacion.length, 36);
    assert.deepEqual([r.serieInflacion[0].valor, r.serieInflacion[35].valor], [5, 40]);
    assert.deepEqual(r.ultimaInflacion, { mes: 'mes-40', valor: 40 });
    casi(r.inflacionMensual, (38 + 39 + 40) / 3 / 100);
  });

  it('convierte en números lo que llega como texto', async () => {
    red({
      [URL_TARJETA]: { cuerpo: { venta: '1650.5' } },
      [URL_BLUE]: { cuerpo: { compra: '1380' } },
      [URL_INFLACION]: { cuerpo: inflacion.map((m) => ({ ...m, valor: String(m.valor) })) },
    });
    const { obtenerIndicadores } = await cargar();
    const r = await obtenerIndicadores();
    assert.deepEqual([r.dolarTarjeta, r.dolarBlue], [1650.5, 1380]);
    assert.deepEqual(r.ultimaInflacion, { mes: '2026-08-31', valor: 1.8 });
    assert.ok(r.serieInflacion.every((m) => typeof m.valor === 'number'));
  });

  describe('cuando no hay datos nuevos', () => {
    it('sin internet y sin nada guardado quedan los valores por defecto (inflación del 2%) y no se guarda nada', async () => {
      red(todoCaido);
      const { obtenerIndicadores } = await cargar();
      assert.deepEqual(await obtenerIndicadores(), porDefecto);
      assert.equal(guardado.has(CLAVE), false);
    });

    it('un error del servidor cuenta como no tener internet, aunque la respuesta traiga algo que parezca válido', async () => {
      red({
        [URL_TARJETA]: { estado: 503, cuerpo: { venta: 1650 } },
        [URL_BLUE]: { estado: 500, cuerpo: { compra: 1380 } },
        [URL_INFLACION]: { estado: 404, cuerpo: inflacion },
      });
      const { obtenerIndicadores } = await cargar();
      assert.deepEqual(await obtenerIndicadores(), porDefecto);
    });

    it('descarta cotizaciones en cero o que no son números', async () => {
      red({ [URL_TARJETA]: { cuerpo: { venta: 0 } }, [URL_BLUE]: { cuerpo: { compra: 'n/d' } }, [URL_INFLACION]: { cuerpo: 'mantenimiento' } });
      const { obtenerIndicadores } = await cargar();
      assert.deepEqual(await obtenerIndicadores(), porDefecto);
    });

    it('con menos de 3 meses de inflación no cambia la estimada, pero sí actualiza el dólar', async () => {
      red({ [URL_INFLACION]: { cuerpo: inflacion.slice(0, 2) } });
      const { obtenerIndicadores } = await cargar();
      const r = await obtenerIndicadores();
      assert.equal(r.dolarTarjeta, 1650);
      assert.equal(r.inflacionMensual, 0.02);
      assert.equal(r.ultimaInflacion, null);
      assert.deepEqual(r.serieInflacion, []);
    });

    it('si una API falla actualiza lo que sí llegó y conserva el resto', async () => {
      const viejo = dejarGuardado({ actualizado: ahora.getTime() - 7 * HORA });
      red({ [URL_TARJETA]: sinConexion(), [URL_INFLACION]: { estado: 500 } });
      const { obtenerIndicadores } = await cargar();
      const r = await obtenerIndicadores();
      assert.deepEqual(r, { ...viejo, dolarBlue: 1380, actualizado: ahora.getTime() });
      assert.deepEqual(JSON.parse(guardado.get(CLAVE)!), r);
    });

    it('sin internet usa lo último guardado aunque esté vencido, sin pisarlo', async () => {
      const viejo = dejarGuardado({ actualizado: ahora.getTime() - 30 * HORA });
      red(todoCaido);
      const { obtenerIndicadores } = await cargar();
      assert.deepEqual(await obtenerIndicadores(), viejo);
      assert.deepEqual(JSON.parse(guardado.get(CLAVE)!), viejo);
    });

    it('una API que no responde en 8 segundos se corta y se usa lo que sí llegó', async () => {
      const { pedidos } = red({ [URL_TARJETA]: 'colgada' });
      const { obtenerIndicadores } = await cargar();
      const pendiente = obtenerIndicadores();
      await esperarPedidos(pedidos, 3);
      mock.timers.tick(8000);
      const r = await pendiente;
      assert.equal(r.dolarTarjeta, null);
      assert.equal(r.dolarBlue, 1380);
      assert.equal(r.actualizado, ahora.getTime() + 8000);
    });
  });

  describe('lo guardado en el celular', () => {
    it('guarda lo descargado y no vuelve a pedirlo mientras tenga menos de 6 horas', async () => {
      const { pedidos } = red();
      const { obtenerIndicadores } = await cargar();
      const primero = await obtenerIndicadores();
      assert.deepEqual(JSON.parse(guardado.get(CLAVE)!), primero);

      mock.timers.tick(6 * HORA - 1);
      assert.equal(await obtenerIndicadores(), primero);
      assert.equal(pedidos.length, 3);
    });

    it('a las 6 horas justas lo guardado ya está vencido y se descarga de nuevo', async () => {
      const { pedidos, respuestas } = red();
      const { obtenerIndicadores } = await cargar();
      await obtenerIndicadores();

      mock.timers.tick(6 * HORA);
      respuestas[URL_TARJETA] = { cuerpo: { venta: 1700 } };
      const r = await obtenerIndicadores();
      assert.equal(pedidos.length, 6);
      assert.equal(r.dolarTarjeta, 1700);
      assert.equal(r.actualizado, ahora.getTime() + 6 * HORA);
    });

    it('al abrir la app usa lo guardado sin salir a internet si es reciente', async () => {
      const viejo = dejarGuardado({ actualizado: ahora.getTime() - (6 * HORA - 60_000) });
      const { pedidos } = red();
      const { obtenerIndicadores } = await cargar();
      assert.deepEqual(await obtenerIndicadores(), viejo);
      assert.equal(pedidos.length, 0);
    });

    it('lo guardado hace 6 horas justas se descarga de nuevo', async () => {
      dejarGuardado({ actualizado: ahora.getTime() - 6 * HORA });
      const { pedidos } = red();
      const { obtenerIndicadores } = await cargar();
      assert.equal((await obtenerIndicadores()).dolarTarjeta, 1650);
      assert.equal(pedidos.length, 3);
    });

    it('lo guardado por una versión anterior de la app se completa con los campos que le faltan', async () => {
      guardado.set(CLAVE, JSON.stringify({ dolarTarjeta: 1500, inflacionMensual: 0.03, ultimaInflacion: null, actualizado: ahora.getTime() - HORA }));
      const { pedidos } = red();
      const { obtenerIndicadores } = await cargar();
      const r = await obtenerIndicadores();
      assert.equal(pedidos.length, 0);
      assert.equal(r.dolarTarjeta, 1500);
      assert.equal(r.dolarBlue, null);
      assert.deepEqual(r.serieInflacion, []);
    });

    it('ignora lo guardado si está roto y descarga de nuevo', async () => {
      guardado.set(CLAVE, '{esto no es json');
      red();
      const { obtenerIndicadores } = await cargar();
      assert.equal((await obtenerIndicadores()).dolarTarjeta, 1650);
    });

    it('si no se puede leer el celular, descarga igual', async () => {
      fallas.leer = true;
      red();
      const { obtenerIndicadores } = await cargar();
      assert.equal((await obtenerIndicadores()).dolarTarjeta, 1650);
    });

    it('si no se puede guardar en el celular, devuelve igual lo descargado', async () => {
      fallas.guardar = true;
      red();
      const { obtenerIndicadores } = await cargar();
      assert.equal((await obtenerIndicadores()).dolarTarjeta, 1650);
      assert.equal(guardado.has(CLAVE), false);
    });
  });

  describe('pedidos repetidos', () => {
    it('dos pedidos a la vez comparten una sola descarga', async () => {
      const { pedidos } = red();
      const { obtenerIndicadores } = await cargar();
      const [a, b] = await Promise.all([obtenerIndicadores(), obtenerIndicadores()]);
      assert.equal(pedidos.length, 3);
      assert.equal(a, b);
    });

    it('si la descarga falló, la próxima vez vuelve a intentar en vez de dar por buenos los valores por defecto', async () => {
      const { pedidos, respuestas } = red(todoCaido);
      const { obtenerIndicadores } = await cargar();
      assert.deepEqual(await obtenerIndicadores(), porDefecto);

      respuestas[URL_TARJETA] = { cuerpo: { venta: 1650 } };
      respuestas[URL_BLUE] = { cuerpo: { compra: 1380 } };
      respuestas[URL_INFLACION] = { cuerpo: inflacion };
      assert.equal((await obtenerIndicadores()).dolarTarjeta, 1650);
      assert.equal(pedidos.length, 6);
    });
  });

  it('dice el nombre del mes de una fecha de inflación', async () => {
    const { mesDeInflacion } = await cargar();
    assert.equal(mesDeInflacion('2026-08-31'), 'agosto');
    assert.equal(mesDeInflacion('2026-01-31'), 'enero');
    assert.equal(mesDeInflacion('2025-12-31'), 'diciembre');
  });
});
