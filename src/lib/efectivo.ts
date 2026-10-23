import { formatearFecha } from './finanzas';
import type { Conteo, GastoGuardado, Retiro } from './tipos';

// Efectivo: si sacaste $60.000 del cajero y anotaste $35.000 en gastos en efectivo,
// hay $25.000 que o los tenés en la billetera o te olvidaste de anotar.

export type BalanceEfectivo = {
  retirado: number;
  anotado: number;
  sinAnotar: number;
  /** Desde cuándo se cuenta: el primer retiro de la ventana, o null si no hubo retiros */
  desde: string | null;
};

export function balanceEfectivo(retiros: Retiro[], gastos: GastoGuardado[], hoy = new Date(), dias = 30): BalanceEfectivo {
  const limite = formatearFecha(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - dias));
  const recientes = retiros.filter((r) => r.fecha >= limite);
  if (recientes.length === 0) return { retirado: 0, anotado: 0, sinAnotar: 0, desde: null };

  const desde = recientes.reduce((min, r) => (r.fecha < min ? r.fecha : min), recientes[0].fecha);
  const retirado = recientes.reduce((suma, r) => suma + Number(r.monto), 0);
  const anotado = gastos
    .filter((g) => g.tarjeta_id === null && g.moneda === 'ARS' && g.fecha_compra >= desde)
    .reduce((suma, g) => suma + Number(g.monto_total), 0);
  return { retirado, anotado, sinAnotar: Math.max(retirado - anotado, 0), desde };
}

// ---------- Contar la billetera ----------
//
// Para los que pagan en efectivo y no se acuerdan de anotar: cada tanto cuentan la plata que tienen.
// Con el último conteo, lo que sacaron del cajero y lo que anotaron en efectivo, sabemos cuánto
// deberían tener. Si tienen menos, la diferencia es lo que gastaron sin anotar.

const TOLERANCIA = 500;

// ¿Esto pasó después del conteo? Usamos el momento en que se anotó; si no lo tenemos, la fecha (el mismo día no cuenta)
// (comparamos como fechas: la base y el celular escriben la hora en formatos distintos, y de noche en
// Argentina la fecha UTC ya es la del día siguiente)
function despuesDe(conteo: Conteo, item: { creado_en?: string }, fecha: string) {
  if (item.creado_en) return Date.parse(item.creado_en) > Date.parse(conteo.creado_en);
  return fecha > formatearFecha(new Date(conteo.creado_en));
}

/** Cuánto debería haber en la billetera según el último conteo, o null si nunca la contó */
export function saldoEsperado(conteos: Conteo[], retiros: Retiro[], gastos: GastoGuardado[]) {
  const ultimo = [...conteos].sort((a, b) => Date.parse(b.creado_en) - Date.parse(a.creado_en))[0];
  if (!ultimo) return null;
  const entro = retiros.filter((r) => despuesDe(ultimo, r, r.fecha)).reduce((s, r) => s + Number(r.monto), 0);
  const salio = gastos
    .filter((g) => g.tarjeta_id === null && g.moneda === 'ARS' && despuesDe(ultimo, g, g.fecha_compra))
    .reduce((s, g) => s + Number(g.monto_total), 0);
  return { ultimo, esperado: Number(ultimo.monto) + entro - salio };
}

export type ResultadoConteo =
  | { tipo: 'primero' }
  | { tipo: 'justo' }
  /** Tiene menos de lo esperado: gastó sin anotar */
  | { tipo: 'falta'; diferencia: number }
  /** Tiene más de lo esperado: le entró plata que no anotó */
  | { tipo: 'sobra'; diferencia: number };

export function compararConteo(esperado: number | null, actual: number): ResultadoConteo {
  if (esperado === null) return { tipo: 'primero' };
  const diferencia = Math.round(esperado - actual);
  if (Math.abs(diferencia) < TOLERANCIA) return { tipo: 'justo' };
  return diferencia > 0 ? { tipo: 'falta', diferencia } : { tipo: 'sobra', diferencia: -diferencia };
}
