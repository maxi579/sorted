import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { mejorBanco, simularPlazoFijo, tasaParaPlazo } from '../src/lib/rendimientos';
import { obtenerTasas } from '../src/lib/tasas';
import { fallas, guardado, reiniciarAlmacenamiento } from './simulados/almacenamiento';
import { simularRed, type Respuesta } from './simulados/red';

const CLAVE = 'tasas-plazo-fijo-v1';
const URL_TASAS = 'https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo';
const HORA = 60 * 60 * 1000;
const ahora = new Date(2026, 9, 9, 12, 0); // 9 de octubre de 2026

// Como los publica el BCRA vía ArgentinaDatos (tasas como fracción anual: 0.29 = 29%)
const publicadas = [
  {
    entidad: 'BANCO DE LA NACION ARGENTINA',
    tnaClientes: 0.29,
    tnaNoClientes: 0.27,
    tasas: [
      { plazoMinDias: 30, plazoMaxDias: 30, tna: 0.29 },
      { plazoMinDias: 90, plazoMaxDias: 90, tna: 0.34 },
      { plazoMinDias: 30, plazoMaxDias: 59, tna: 0.2 }, // un rango, no un plazo: se descarta
    ],
  },
  { entidad: 'BANCO CMF S.A.', tnaClientes: 0.31, tasas: [] },
  { entidad: 'SIN TASA', tnaClientes: null },
  { entidad: 'TASA IMPOSIBLE', tnaClientes: 31 },
];
const bancos = [
  { entidad: 'BANCO DE LA NACION ARGENTINA', tna30: 0.29, porPlazo: [{ dias: 30, tna: 0.29 }, { dias: 90, tna: 0.34 }] },
  { entidad: 'BANCO CMF S.A.', tna30: 0.31, porPlazo: [] },
];

const red = (respuesta: Respuesta = { cuerpo: publicadas }) => simularRed({ [URL_TASAS]: respuesta });

// Lo que quedó guardado en el celular en una descarga anterior
function dejarGuardado(extra: Record<string, unknown> = {}) {
  const viejo = { bancos: [{ entidad: 'BANCO VIEJO', tna30: 0.4, porPlazo: [] }], actualizado: ahora.getTime() - HORA, ...extra };
  guardado.set(CLAVE, JSON.stringify(viejo));
  return viejo;
}

describe('tasas de plazo fijo', () => {
  beforeEach(() => {
    reiniciarAlmacenamiento();
    mock.timers.enable({ apis: ['Date', 'setTimeout'], now: ahora.getTime() });
  });
  afterEach(() => {
    mock.restoreAll();
    mock.timers.reset();
  });

  it('descarga las tasas de cada banco, las pasa a nuestro formato y las guarda', async () => {
    const { pedidos } = red();
    const r = await obtenerTasas();
    assert.deepEqual(pedidos, [URL_TASAS]);
    assert.deepEqual(r, { bancos, actualizado: ahora.getTime() });
    assert.deepEqual(JSON.parse(guardado.get(CLAVE)!), r);
  });

  it('descarta los bancos sin nombre, sin tasa o con una tasa imposible', async () => {
    red({ cuerpo: [...publicadas, { entidad: '', tnaClientes: 0.3 }, { entidad: 'CERO', tnaClientes: 0 }, 'basura'] });
    assert.deepEqual((await obtenerTasas())?.bancos, bancos);
  });

  describe('lo guardado en el celular', () => {
    it('usa lo guardado sin salir a internet si tiene menos de 6 horas', async () => {
      const viejo = dejarGuardado({ actualizado: ahora.getTime() - (6 * HORA - 1) });
      const { pedidos } = red();
      assert.deepEqual(await obtenerTasas(), viejo);
      assert.equal(pedidos.length, 0);
    });

    it('a las 6 horas justas ya está vencido y se descarga de nuevo', async () => {
      dejarGuardado({ actualizado: ahora.getTime() - 6 * HORA });
      const { pedidos } = red();
      const r = await obtenerTasas();
      assert.equal(pedidos.length, 1);
      assert.deepEqual(r?.bancos, bancos);
      assert.equal(r?.actualizado, ahora.getTime());
    });

    it('lo guardado sin fecha se considera vencido', async () => {
      guardado.set(CLAVE, JSON.stringify({ bancos: [{ entidad: 'BANCO VIEJO', tna30: 0.4, porPlazo: [] }] }));
      const { pedidos } = red();
      assert.deepEqual((await obtenerTasas())?.bancos, bancos);
      assert.equal(pedidos.length, 1);
    });

    it('ignora lo guardado si está roto y descarga de nuevo', async () => {
      guardado.set(CLAVE, '{esto no es json');
      red();
      assert.deepEqual((await obtenerTasas())?.bancos, bancos);
    });

    it('si no se puede leer el celular, descarga igual', async () => {
      fallas.leer = true;
      red();
      assert.deepEqual((await obtenerTasas())?.bancos, bancos);
    });

    it('si no se puede guardar en el celular, devuelve igual lo descargado', async () => {
      fallas.guardar = true;
      red();
      assert.deepEqual((await obtenerTasas())?.bancos, bancos);
      assert.equal(guardado.has(CLAVE), false);
    });
  });

  describe('cuando no se pueden descargar', () => {
    it('sin internet usa las últimas tasas guardadas, aunque sean viejas, sin pisarlas', async () => {
      const viejo = dejarGuardado({ actualizado: ahora.getTime() - 40 * HORA });
      red(new Error('Network request failed'));
      assert.deepEqual(await obtenerTasas(), viejo);
      assert.deepEqual(JSON.parse(guardado.get(CLAVE)!), viejo);
    });

    it('sin internet y sin nada guardado no hay tasas', async () => {
      red(new Error('Network request failed'));
      assert.equal(await obtenerTasas(), null);
      assert.equal(guardado.has(CLAVE), false);
    });

    it('un error del servidor cuenta como no tener internet, aunque la respuesta traiga algo que parezca válido', async () => {
      const viejo = dejarGuardado({ actualizado: ahora.getTime() - 40 * HORA });
      red({ estado: 500, cuerpo: publicadas });
      assert.deepEqual(await obtenerTasas(), viejo);
      assert.deepEqual(JSON.parse(guardado.get(CLAVE)!), viejo);
    });

    it('si el servidor no contesta en 8 segundos, la corta y usa lo guardado', async () => {
      const viejo = dejarGuardado({ actualizado: ahora.getTime() - 40 * HORA });
      const { pedidos } = red('colgada');
      const pendiente = obtenerTasas();
      for (let i = 0; i < 100 && pedidos.length < 1; i++) await Promise.resolve();
      assert.equal(pedidos.length, 1);
      mock.timers.tick(8000);
      assert.deepEqual(await pendiente, viejo);
    });

    it('si no llega ningún banco válido, no pisa lo que había guardado', async () => {
      const viejo = dejarGuardado({ actualizado: ahora.getTime() - 40 * HORA });
      for (const cuerpo of [[], { error: 'mantenimiento' }, [{ entidad: 'SIN TASA', tnaClientes: 0 }]]) {
        red({ cuerpo });
        assert.deepEqual(await obtenerTasas(), viejo);
        assert.deepEqual(JSON.parse(guardado.get(CLAVE)!), viejo);
        mock.restoreAll();
      }
    });

    it('si no llega ningún banco válido y no había nada guardado, no hay tasas', async () => {
      red({ cuerpo: [] });
      assert.equal(await obtenerTasas(), null);
      assert.equal(guardado.has(CLAVE), false);
    });
  });

  it('las tasas descargadas alimentan al comparador de bancos', async () => {
    red();
    const r = await obtenerTasas();
    // A 30 días paga más el CMF; a 90 días Nación publica una tasa propia y pasa al frente
    assert.equal(mejorBanco(r!.bancos, 30)?.banco.entidad, 'BANCO CMF S.A.');
    assert.equal(mejorBanco(r!.bancos, 90)?.banco.entidad, 'BANCO DE LA NACION ARGENTINA');
    assert.deepEqual(tasaParaPlazo(r!.bancos[0], 90), { tna: 0.34, renovando: false });
    assert.ok(Math.abs(simularPlazoFijo(1_000_000, 0.34, 90, false) - 1_000_000 * (1 + (0.34 * 90) / 365)) < 1e-6);
  });
});
