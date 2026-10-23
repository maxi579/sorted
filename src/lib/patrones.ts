import { diasEntre, formatearFecha } from './finanzas';
import { fechaDesdeTexto } from './gastos';
import type { Categoria, GastoGuardado } from './tipos';

// Lo que la app descubre sola mirando el historial: cuánto se suele gastar por categoría
// (un presupuesto que nadie tuvo que armar) y las semanas fuera de lo común.
// Cuenta las compras en pesos por fecha de compra, como "En qué gastaste" en Inicio.

const MESES_HISTORIAL = 3;

function enPesos(gastos: GastoGuardado[]) {
  return gastos.filter((g) => g.moneda === 'ARS');
}

export type PresupuestoCategoria = {
  categoria: Categoria;
  /** Lo que se suele gastar por mes (promedio de los últimos meses con gastos) */
  habitual: number;
  /** Lo gastado en lo que va del mes */
  gastado: number;
  /** gastado / habitual (1 = ya gastó lo de todo el mes) */
  porcentaje: number;
  /** Va más rápido de lo normal para la altura del mes, o ya se pasó */
  alerta: boolean;
};

/**
 * Presupuesto automático: para cada categoría, lo que se gastó en promedio en los últimos 3 meses completos.
 * Hacen falta al menos 2 meses con gastos para que tenga sentido; si no, devuelve una lista vacía.
 */
export function presupuestoAutomatico(gastos: GastoGuardado[], hoy = new Date()): PresupuestoCategoria[] {
  const porMes = new Map<string, Map<string, number>>();
  for (let i = 1; i <= MESES_HISTORIAL; i++) {
    porMes.set(formatearFecha(new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)).slice(0, 7), new Map());
  }
  const esteMes = formatearFecha(hoy).slice(0, 7);
  const actual = new Map<string, number>();

  // Las compras en cuotas (una heladera, un celular) no son "lo que se suele gastar": se siguen en Cuotas
  for (const g of enPesos(gastos).filter((x) => x.cantidad_cuotas === 1)) {
    const mes = g.fecha_compra.slice(0, 7);
    const categoria = g.categoria ?? 'Otros';
    const destino = mes === esteMes ? actual : porMes.get(mes);
    if (destino) destino.set(categoria, (destino.get(categoria) ?? 0) + Number(g.monto_total));
  }

  const mesesConDatos = [...porMes.values()].filter((m) => m.size > 0);
  if (mesesConDatos.length < 2) return [];

  const categorias = new Set(mesesConDatos.flatMap((m) => [...m.keys()]));
  const diasDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  const avanceDelMes = hoy.getDate() / diasDelMes;

  return [...categorias]
    .map((categoria) => {
      const habitual = mesesConDatos.reduce((s, m) => s + (m.get(categoria) ?? 0), 0) / mesesConDatos.length;
      const gastado = actual.get(categoria) ?? 0;
      const porcentaje = habitual > 0 ? gastado / habitual : 0;
      // Alerta: ya se pasó, o va 40% más rápido de lo normal (y ya gastó al menos la mitad)
      const alerta = porcentaje >= 1 || (porcentaje >= 0.5 && porcentaje > avanceDelMes * 1.4);
      return { categoria: categoria as Categoria, habitual, gastado, porcentaje, alerta };
    })
    .filter((p) => p.habitual > 0)
    .sort((a, b) => b.habitual - a.habitual);
}

export type SemanaInusual = { categoria: Categoria; estaSemana: number; normal: number };

/**
 * La categoría en la que esta semana (últimos 7 días) se gastó al menos el doble de lo normal
 * (promedio semanal de las 8 semanas anteriores), con una diferencia que valga la pena mencionar.
 */
export function semanaInusual(gastos: GastoGuardado[], hoy = new Date(), minimo = 10_000): SemanaInusual | null {
  const estaSemana = new Map<string, number>();
  const anteriores = new Map<string, number>();
  for (const g of enPesos(gastos)) {
    const dias = diasEntre(fechaDesdeTexto(g.fecha_compra), hoy);
    if (dias < 0 || dias >= 63) continue;
    const destino = dias < 7 ? estaSemana : anteriores;
    const categoria = g.categoria ?? 'Otros';
    destino.set(categoria, (destino.get(categoria) ?? 0) + Number(g.monto_total));
  }

  let peor: SemanaInusual | null = null;
  for (const [categoria, monto] of estaSemana) {
    const normal = (anteriores.get(categoria) ?? 0) / 8;
    if (normal <= 0 || monto < normal * 2 || monto - normal < minimo) continue;
    if (!peor || monto / normal > peor.estaSemana / peor.normal) peor = { categoria: categoria as Categoria, estaSemana: monto, normal };
  }
  return peor;
}

/** Lo gastado en los últimos 7 días (en pesos), para el resumen del domingo */
export function gastoUltimaSemana(gastos: GastoGuardado[], hoy = new Date()) {
  return enPesos(gastos)
    .filter((g) => {
      const dias = diasEntre(fechaDesdeTexto(g.fecha_compra), hoy);
      return dias >= 0 && dias < 7;
    })
    .reduce((s, g) => s + Number(g.monto_total), 0);
}
