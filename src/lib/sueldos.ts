import { inflacionAcumulada, type MesInflacion } from './activos';
import type { ReciboSueldo, TipoRecibo } from './tipos';

// Recibos de sueldo: la IA los lee, la app actualiza el sueldo sola y compara cuánto subió contra la inflación.
// Hay quien cobra por mes, por quincena o por semana: cada recibo tiene su período exacto (desde/hasta)
// y el sueldo de un mes es la suma de lo que se cobró en ese mes.

export type ReciboLeido = Omit<ReciboSueldo, 'id'>;

/** Lo que es el sueldo del mes. Aguinaldo, ajustes y liquidación final son pagos de una vez. */
const SON_SUELDO: TipoRecibo[] = ['sueldo', 'vacaciones'];

/** Tipo del recibo (los guardados en el celular antes de que existiera el tipo tenían "aguinaldo") */
export const tipoDe = (r: ReciboLeido): TipoRecibo => r.tipo ?? ((r as { aguinaldo?: boolean }).aguinaldo ? 'aguinaldo' : 'sueldo');

export const NOMBRE_TIPO: Record<TipoRecibo, string> = {
  sueldo: 'sueldo',
  vacaciones: 'vacaciones',
  aguinaldo: 'aguinaldo',
  ajuste: 'ajuste o retroactivo',
  final: 'liquidación final',
};

const diasDelMes = (periodo: string) => {
  const [anio, mes] = periodo.split('-').map(Number);
  return new Date(anio, mes, 0).getDate();
};
const finDeMes = (periodo: string) => `${periodo.slice(0, 8)}${String(diasDelMes(periodo)).padStart(2, '0')}`;

/** Período exacto del recibo (los cargados antes de que existiera desde/hasta eran del mes completo) */
export function rangoDe(r: ReciboLeido) {
  return { desde: r.desde ?? r.periodo, hasta: r.hasta ?? finDeMes(r.periodo) };
}

/** Mismo recibo = misma empresa, mismo tipo, mismo período exacto y mismo neto (en un mes puede haber varios distintos) */
export function mismoRecibo(a: ReciboLeido, b: ReciboLeido) {
  const ra = rangoDe(a);
  const rb = rangoDe(b);
  return (
    a.empleador.toLowerCase() === b.empleador.toLowerCase() &&
    tipoDe(a) === tipoDe(b) &&
    ra.desde === rb.desde &&
    ra.hasta === rb.hasta &&
    Math.abs(a.neto - b.neto) < 1
  );
}

/** Con este porcentaje del mes cubierto por recibos, el mes se considera completo (las semanas no siempre cierran justo) */
const MES_COMPLETO = 0.85;

export type SueldoDelMes = {
  periodo: string;
  /** Lo que se cobró de verdad en ese mes */
  cobrado: number;
  /** Qué parte del mes cubren los recibos (1 = completo) */
  cobertura: number;
  completo: boolean;
  /** El sueldo del mes: lo cobrado si está completo; si no, lo que daría el mes entero a ese ritmo */
  mensual: number;
};

/**
 * Sueldo de cada mes (sumando quincenas, semanas, vacaciones y empleadores), en pesos.
 * Sin aguinaldos, ajustes ni liquidaciones finales. Del más viejo al más nuevo.
 */
export function sueldosPorMes(recibos: ReciboLeido[]): SueldoDelMes[] {
  const meses = new Map<string, { cobrado: number; dias: Set<string> }>();
  for (const r of recibos) {
    if (!SON_SUELDO.includes(tipoDe(r)) || r.moneda !== 'ARS') continue;
    const mes = meses.get(r.periodo) ?? { cobrado: 0, dias: new Set<string>() };
    mes.cobrado += r.neto;
    // Días del mes que cubre este recibo (lo que cae en otro mes no cuenta para este)
    const { desde, hasta } = rangoDe(r);
    const inicio = desde > r.periodo ? desde : r.periodo;
    const fin = hasta < finDeMes(r.periodo) ? hasta : finDeMes(r.periodo);
    for (let d = Number(inicio.slice(8, 10)); inicio <= fin && d <= Number(fin.slice(8, 10)); d++) mes.dias.add(`${r.empleador}|${d}`);
    meses.set(r.periodo, mes);
  }
  return [...meses.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, { cobrado, dias }]) => {
      // Con varios empleadores, la cobertura es la del que más días cubre
      const porEmpleador = new Map<string, number>();
      for (const clave of dias) {
        const empleador = clave.slice(0, clave.lastIndexOf('|'));
        porEmpleador.set(empleador, (porEmpleador.get(empleador) ?? 0) + 1);
      }
      const cobertura = Math.min(1, Math.max(0, ...porEmpleador.values()) / diasDelMes(periodo));
      const completo = cobertura >= MES_COMPLETO;
      return { periodo, cobrado, cobertura, completo, mensual: completo || cobertura === 0 ? cobrado : Math.round(cobrado / cobertura) };
    });
}

const mesAnterior = (periodo: string) => {
  const [anio, mes] = periodo.split('-').map(Number);
  const d = new Date(anio, mes - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

/**
 * El sueldo de hoy. Si el último mes está completo, ese. Si todavía falta una quincena,
 * el mes anterior completo; y si no hay, una estimación con lo cargado (estimado: true).
 */
export function sueldoActual(recibos: ReciboLeido[]) {
  const meses = sueldosPorMes(recibos);
  const ultimo = meses[meses.length - 1];
  if (!ultimo) return null;
  if (ultimo.completo) return { periodo: ultimo.periodo, neto: ultimo.cobrado, estimado: false };
  const anterior = meses.find((m) => m.periodo === mesAnterior(ultimo.periodo) && m.completo);
  if (anterior) return { periodo: anterior.periodo, neto: anterior.cobrado, estimado: false };
  return { periodo: ultimo.periodo, neto: ultimo.mensual, estimado: true };
}

const primeroDelMesSiguiente = (periodo: string) => {
  const [anio, mes] = periodo.split('-').map(Number);
  return new Date(anio, mes, 1);
};

/**
 * Cuánto subió el sueldo entre el primer y el último mes completo, y cuánto subieron los precios en esos meses.
 * null si hay menos de dos meses completos para comparar.
 */
export function sueldoContraInflacion(recibos: ReciboLeido[], serie: MesInflacion[], inflacionPorDefecto: number) {
  const meses = sueldosPorMes(recibos).filter((m) => m.completo);
  if (meses.length < 2) return null;
  const primero = meses[0];
  const ultimo = meses[meses.length - 1];
  const suba = ultimo.cobrado / primero.cobrado - 1;
  const inflacion = inflacionAcumulada(serie, primeroDelMesSiguiente(primero.periodo), primeroDelMesSiguiente(ultimo.periodo), inflacionPorDefecto);
  // Poder de compra: cuánto más (o menos) alcanza el sueldo de hoy comparado con el primero
  const real = (1 + suba) / (1 + inflacion) - 1;
  return { desde: primero.periodo, hasta: ultimo.periodo, suba, inflacion, real };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-09-01' → 'septiembre 2026' */
export function nombrePeriodo(periodo: string) {
  const [anio, mes] = periodo.split('-').map(Number);
  return `${MESES[mes - 1]} ${anio}`;
}

/** Cómo se muestra un recibo: 'septiembre 2026', '1ª quincena de septiembre 2026', 'del 1 al 7 de septiembre 2026' */
export function nombreRecibo(r: ReciboLeido) {
  const { desde, hasta } = rangoDe(r);
  const mes = nombrePeriodo(r.periodo);
  const diaDesde = Number(desde.slice(8, 10));
  const diaHasta = Number(hasta.slice(8, 10));
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  if (mismoMes && diaDesde === 1 && hasta === finDeMes(r.periodo)) return mes;
  if (mismoMes && diaDesde === 1 && diaHasta === 15) return `1ª quincena de ${mes}`;
  if (mismoMes && diaDesde === 16 && hasta === finDeMes(r.periodo)) return `2ª quincena de ${mes}`;
  if (mismoMes) return `del ${diaDesde} al ${diaHasta} de ${mes}`;
  return `del ${diaDesde}/${Number(desde.slice(5, 7))} al ${diaHasta}/${Number(hasta.slice(5, 7))} (${mes})`;
}
