import type { FuenteDatos } from './datos';
import { diasEntre, formatearFecha } from './finanzas';
import { mesDe, vencimientoDelMes } from './fijos';
import { fechaDesdeTexto } from './gastos';
import type { Activo, Aporte, Meta } from './tipos';

// Ahorros: para qué se junta la plata (metas) y cuánto se separó (aportes).
// Si la meta está guardada en un activo que paga interés, los intereses se suman solos.

/** Lo que se separó en total para una meta (los retiros restan) */
export function saldoMeta(aportes: Aporte[], metaId: string) {
  return aportes.filter((a) => a.meta_id === metaId).reduce((s, a) => s + Number(a.monto), 0);
}

/**
 * Cuánto vale hoy lo ahorrado, con los intereses del lugar donde está guardado:
 * - cuenta que paga interés: interés diario desde cada aporte
 * - plazo fijo: interés simple hasta el plazo
 * - dólares: lo que subió o bajó el activo
 * - otro lugar o ninguno: lo que se separó, sin intereses
 */
export function valorMeta(aportes: Aporte[], metaId: string, activo: Activo | null, valorActivoHoy: number | null, hoy = new Date()) {
  const propios = aportes.filter((a) => a.meta_id === metaId);
  let valor = 0;
  for (const a of propios) {
    const monto = Number(a.monto);
    const dias = Math.max(diasEntre(fechaDesdeTexto(a.fecha), hoy), 0);
    if (!activo || monto < 0) valor += monto;
    else if (activo.tipo === 'remunerada') valor += monto * Math.pow(1 + (activo.tna ?? 0) / 100 / 365, dias);
    else if (activo.tipo === 'plazo_fijo') valor += monto * (1 + ((activo.tna ?? 0) / 100) * (Math.min(dias, activo.plazo_dias ?? 30) / 365));
    else if (activo.tipo === 'dolares' && valorActivoHoy && Number(activo.monto_inicial) > 0) valor += monto * (valorActivoHoy / Number(activo.monto_inicial));
    else valor += monto;
  }
  const separado = propios.reduce((s, a) => s + Number(a.monto), 0);
  return { valor, separado, intereses: valor - separado };
}

/** Meses completos que faltan hasta una fecha (mínimo 1) */
function mesesHasta(fecha: string, hoy: Date) {
  const destino = fechaDesdeTexto(fecha);
  const meses = (destino.getFullYear() - hoy.getFullYear()) * 12 + (destino.getMonth() - hoy.getMonth());
  return Math.max(meses, 1);
}

/** Cuánto hay que separar por mes para llegar al objetivo a tiempo (null si no tiene objetivo o fecha, 0 si ya llegó) */
export function cuantoPorMes(meta: Meta, valor: number, hoy = new Date()) {
  if (!meta.objetivo || !meta.fecha_objetivo) return null;
  const falta = Number(meta.objetivo) - valor;
  if (falta <= 0) return 0;
  return falta / mesesHasta(meta.fecha_objetivo, hoy);
}

/** Lo que se viene separando por mes: promedio de los últimos 3 meses (sin contar retiros) */
export function ritmoMensual(aportes: Aporte[], metaId: string, hoy = new Date()) {
  const desde = formatearFecha(new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1));
  const total = aportes.filter((a) => a.meta_id === metaId && a.fecha >= desde && Number(a.monto) > 0).reduce((s, a) => s + Number(a.monto), 0);
  return total / 3;
}

/** A este ritmo, en qué mes se llega al objetivo (null si no hay ritmo o no tiene objetivo) */
export function fechaEstimada(meta: Meta, valor: number, ritmo: number, hoy = new Date()) {
  if (!meta.objetivo || ritmo <= 0) return null;
  const falta = Number(meta.objetivo) - valor;
  if (falta <= 0) return hoy;
  const meses = Math.ceil(falta / ritmo);
  return new Date(hoy.getFullYear(), hoy.getMonth() + meses, 1);
}

/** Lo separado este mes para una meta */
export function aportadoEsteMes(aportes: Aporte[], metaId: string, hoy = new Date()) {
  const mes = mesDe(hoy).slice(0, 7);
  return aportes.filter((a) => a.meta_id === metaId && a.fecha.startsWith(mes) && Number(a.monto) > 0).reduce((s, a) => s + Number(a.monto), 0);
}

/**
 * "Págate primero": lo que falta separar este mes según lo planeado en cada meta.
 * Inicio lo descuenta de lo que te queda, para que no se gaste sin darte cuenta.
 */
export function reservaPendiente(metas: Meta[], aportes: Aporte[], hoy = new Date()) {
  return metas.reduce((s, m) => s + Math.max((Number(m.ahorro_mensual) || 0) - aportadoEsteMes(aportes, m.id, hoy), 0), 0);
}

/** Las metas con aporte automático cuyo día ya llegó este mes y todavía no se separó solo */
export function aportesParaHacer(metas: Meta[], aportes: Aporte[], hoy = new Date()) {
  const mes = mesDe(hoy).slice(0, 7);
  return metas.filter((m) => {
    if (!m.dia_aporte || !m.ahorro_mensual) return false;
    if (diasEntre(vencimientoDelMes(m.dia_aporte, hoy), hoy) < 0) return false;
    return !aportes.some((a) => a.meta_id === m.id && a.automatico && a.fecha.startsWith(mes));
  });
}

/**
 * Fondo de emergencia sugerido: 3 meses de lo que se va sí o sí por mes.
 * Usa los gastos fijos; si no hay, lo que se suele gastar por mes.
 */
export function fondoEmergenciaSugerido(fijosPorMes: number, gastoHabitualPorMes: number) {
  const base = fijosPorMes > 0 ? fijosPorMes : gastoHabitualPorMes;
  return base > 0 ? Math.round((base * 3) / 10_000) * 10_000 : null;
}

export const EMOJIS_META = ['✈️', '🛟', '🚗', '🏠', '🎓', '🎁', '💍', '💻', '🏖️', '💰'];

/** Separa solos los ahorros automáticos que ya tocaban este mes. Devuelve los nombres de las metas. */
export async function hacerAportesAutomaticos(datos: FuenteDatos, metas: Meta[], aportes: Aporte[], hoy = new Date()) {
  const hechos: string[] = [];
  for (const meta of aportesParaHacer(metas, aportes, hoy)) {
    await datos.aportes.crear({
      meta_id: meta.id,
      monto: Number(meta.ahorro_mensual),
      fecha: formatearFecha(vencimientoDelMes(meta.dia_aporte!, hoy)),
      automatico: true,
    });
    hechos.push(meta.nombre);
  }
  return hechos;
}
