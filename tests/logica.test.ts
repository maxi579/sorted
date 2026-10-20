import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { consejos } from '../src/lib/asistente';
import { limpiarDescripcion, revisarMovimientos } from '../src/lib/conciliacion';
import { evaluarCompra } from '../src/lib/decision';
import { deudaPendiente, diaDeLibertad, fechaDePago, proximoCierre, tarjetasParaHoy } from '../src/lib/finanzas';
import { interpretarGasto } from '../src/lib/interpretarGasto';
import type { GastoGuardado, MedioPago } from '../src/lib/tipos';

const visa: MedioPago = { id: 'v', nombre: 'Visa', banco: null, tipo: 'credito', red: 'visa', dia_cierre: 24, dia_vencimiento: 5 };
const master: MedioPago = { id: 'm', nombre: 'Master', banco: null, tipo: 'credito', red: 'mastercard', dia_cierre: 10, dia_vencimiento: 20 };
const hoy = new Date(2026, 9, 9); // 9 de octubre de 2026
const mismoDia = (a: Date | null, b: Date) => assert.equal(a?.toDateString(), b.toDateString());

function gasto(cuotas: number, primerMes: string, monto = 120_000, extra: Partial<GastoGuardado> = {}): GastoGuardado {
  return {
    id: String(Math.random()),
    descripcion: 'x',
    categoria: null,
    monto_total: monto,
    moneda: 'ARS',
    cantidad_cuotas: cuotas,
    primer_mes_cuota: primerMes,
    fecha_compra: '2026-10-01',
    tarjeta_id: 'v',
    ...extra,
  };
}

describe('fechas de pago', () => {
  it('antes del cierre entra en el resumen del mes; si vence después del cierre, se paga el mes siguiente', () => {
    mismoDia(fechaDePago(hoy, visa), new Date(2026, 10, 5));
    mismoDia(fechaDePago(hoy, master), new Date(2026, 9, 20));
  });
  it('después del cierre pasa al próximo resumen', () => {
    mismoDia(fechaDePago(new Date(2026, 9, 11), master), new Date(2026, 10, 20));
  });
  it('ordena las tarjetas de la que más tarde se paga a la que antes', () => {
    const opciones = tarjetasParaHoy([master, visa], hoy);
    assert.deepEqual(opciones.map((o) => [o.medio.id, o.dias]), [['v', 27], ['m', 11]]);
  });
  it('un cierre el 31 en febrero cae el último día del mes', () => {
    mismoDia(proximoCierre({ ...visa, dia_cierre: 31 }, new Date(2027, 1, 3)), new Date(2027, 1, 28));
  });
  it('el día del cierre todavía cuenta como este mes', () => {
    mismoDia(proximoCierre(visa, new Date(2026, 9, 24)), new Date(2026, 9, 24));
    mismoDia(proximoCierre(visa, new Date(2026, 9, 25)), new Date(2026, 10, 24));
  });
});

describe('cuotas pendientes', () => {
  it('día de libertad: 6 cuotas desde octubre terminan en marzo', () => {
    mismoDia(diaDeLibertad([gasto(6, '2026-10-01')], hoy), new Date(2027, 2, 1));
    assert.equal(diaDeLibertad([gasto(1, '2026-08-01')], hoy), null);
  });
  it('en plata de hoy, las cuotas valen menos con inflación', () => {
    assert.equal(Math.round(deudaPendiente([gasto(6, '2026-10-01')], hoy, 0, null).valorHoy), 120_000);
    const conInflacion = deudaPendiente([gasto(6, '2026-10-01')], hoy, 0.02, null).valorHoy;
    assert.ok(conInflacion > 110_000 && conInflacion < 120_000);
  });
  it('pasa los dólares a pesos al dólar tarjeta', () => {
    const deuda = deudaPendiente([gasto(1, '2026-10-01', 10, { moneda: 'USD' })], hoy, 0, 2000);
    assert.equal(deuda.total, 20_000);
  });
});

describe('¿Lo compro?', () => {
  const base = { descuentoContado: 0, totalEnCuotas: null, inflacionMensual: 0.02, dolarTarjeta: null, hoy };

  it('con poco comprometido dice que sí y que convienen las cuotas', () => {
    const r = evaluarCompra({ ...base, precio: 600_000, cuotas: 6, medio: visa, sueldo: 1_000_000, gastos: [] });
    assert.equal(r.nivel, 'si');
    assert.equal(Math.round(r.montoCuota), 100_000);
    assert.equal(r.comparacion?.convieneCuotas, true);
  });
  it('un mes que ya venía lleno no cuenta si la compra no cae ahí', () => {
    const r = evaluarCompra({ ...base, precio: 600_000, cuotas: 6, medio: visa, sueldo: 1_000_000, gastos: [gasto(1, '2026-10-01', 800_000)] });
    assert.equal(r.nivel, 'si');
    assert.equal(Math.round(r.porcentajePeorMes!), 10);
  });
  it('si la compra cae en meses cargados, dice que mejor no', () => {
    const r = evaluarCompra({ ...base, precio: 600_000, cuotas: 6, medio: visa, sueldo: 1_000_000, gastos: [gasto(6, '2026-11-01', 4_800_000)] });
    assert.equal(r.nivel, 'no');
    assert.equal(Math.round(r.porcentajePeorMes!), 90);
  });
  it('con buen descuento y sin inflación conviene pagar contado', () => {
    const r = evaluarCompra({ ...base, precio: 600_000, cuotas: 6, medio: visa, descuentoContado: 20, inflacionMensual: 0, sueldo: null, gastos: [] });
    assert.equal(r.comparacion?.convieneCuotas, false);
    assert.equal(r.nivel, 'sinSueldo');
  });
  it('en efectivo es un solo pago hoy, con el descuento', () => {
    const r = evaluarCompra({ ...base, precio: 50_000, cuotas: 6, medio: null, descuentoContado: 10, sueldo: 1_000_000, gastos: [] });
    assert.equal(r.cuotas, 1);
    assert.equal(r.totalAPagar, 45_000);
    mismoDia(r.primerPago, hoy);
  });
});

describe('asistente', () => {
  it('avisa del cierre de mañana y de muchas salidas a comer', () => {
    const comida = (fecha: string) => gasto(1, '2026-10-01', 1, { categoria: 'Comida y salidas', fecha_compra: fecha });
    const tips = consejos({
      tono: 'directo',
      hoy,
      porcentaje: 85,
      medios: [{ ...visa, dia_cierre: 10 }],
      gastos: [comida('2026-10-09'), comida('2026-10-05'), comida('2026-10-03'), comida('2026-10-01')],
    });
    assert.match(tips[0].texto, /85%/);
    assert.match(tips[1].texto, /Mañana cierra tu Visa/);
    assert.match(tips[2].texto, /^3 gastos/);
  });
});

describe('carga en lenguaje natural', () => {
  it('entiende monto, cuotas, tarjeta y categoría', () => {
    const r = interpretarGasto('zapas 120k en 6 cuotas con visa', [visa, master]);
    assert.deepEqual([r.monto, r.cuotas, r.medioId, r.categoria, r.descripcion], [120_000, 6, 'v', 'Compras', 'Zapas']);
  });
  it('entiende lucas, efectivo y dólares', () => {
    assert.equal(interpretarGasto('pizza 18 lucas', []).monto, 18_000);
    assert.equal(interpretarGasto('uber 7500 efectivo', [visa]).medioId, null);
    assert.equal(interpretarGasto('spotify 5 dolares', []).moneda, 'USD');
  });
});

describe('revisar el resumen', () => {
  const cargado = (descripcion: string, monto: number, cuotas: number, fecha: string) => ({
    ...gasto(cuotas, '2026-10-01', monto, { descripcion, fecha_compra: fecha }),
    tarjetas: null,
  });
  const yaCargados = [cargado('Super', 48_350, 1, '2026-10-08'), cargado('Zapas', 120_000, 6, '2026-10-02')];
  const mov = (fecha: string, descripcion: string, monto: number, cuota = 1, total = 1) =>
    ({ fecha, descripcion, monto, moneda: 'ARS' as const, cuota_actual: cuota, cuotas_totales: total });

  it('reconoce los que ya estaban (por total o por cuota, con fechas cercanas) y propone los que faltan', () => {
    const r = revisarMovimientos(
      [
        mov('2026-10-09', 'COTO SUC 45', 48_350), // mismo monto, un día de diferencia
        mov('2026-10-02', 'MERPAGO*ZAPATERIA', 20_000, 1, 6), // cuota de 20.000 de un total de 120.000
        mov('2026-10-05', 'YPF SERVICENTRO', 35_000), // no estaba
        mov('2026-09-01', 'COTO SUC 45', 48_350), // mismo monto pero un mes antes: no es el mismo
      ],
      yaCargados,
      visa
    );
    assert.deepEqual(r.map((x) => x.cargado?.descripcion ?? null), ['Super', 'Zapas', null, null]);
    assert.equal(r[2].fila.monto_total, 35_000);
    assert.equal(r[2].fila.tarjeta_id, 'v');
    assert.equal(r[2].fila.primer_mes_cuota, '2026-11-01'); // con la Visa (cierre 24, vence 5) se paga en noviembre
  });

  it('una compra en cuotas se carga por el total, con la fecha original', () => {
    const [r] = revisarMovimientos([mov('2026-08-15', 'MERPAGO*HELADERA', 80_000, 3, 9)], [], visa);
    assert.deepEqual([r.fila.monto_total, r.fila.cantidad_cuotas, r.fila.fecha_compra], [720_000, 9, '2026-08-15']);
  });

  it('no usa el mismo gasto cargado para dos renglones iguales', () => {
    const r = revisarMovimientos([mov('2026-10-08', 'COTO', 48_350), mov('2026-10-08', 'COTO', 48_350)], yaCargados, visa);
    assert.deepEqual(r.map((x) => x.cargado !== null), [true, false]);
  });

  it('limpia los nombres de los comercios', () => {
    assert.equal(limpiarDescripcion('MERPAGO*PIZZERIA  LA OLLA'), 'Pizzeria La Olla');
    assert.equal(limpiarDescripcion('NETFLIX.COM'), 'Netflix.com');
    assert.equal(limpiarDescripcion('YPF SERVICENTRO'), 'YPF Servicentro');
  });
});
