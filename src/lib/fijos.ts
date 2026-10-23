import type { FuenteDatos } from './datos';
import { calcularPrimerMesCuota, diasEntre, formatearFecha } from './finanzas';
import { nuevoId } from './ids';
import type { Categoria, Fijo, GastoGuardado, MedioPago, PagoFijo } from './tipos';

// Gastos fijos y suscripciones: lo que se paga todos los meses.
// Cuando se paga uno, se anota como un gasto común (así entra en categorías, cuotas y totales)
// y queda registrado en pagos_fijos para no volver a pedirlo ese mes.

export type EstadoFijo = 'pagado' | 'vencido' | 'hoy' | 'proximo' | 'pendiente';

export type FijoDelMes = {
  fijo: Fijo;
  vence: Date;
  /** Días hasta el vencimiento (negativo si ya pasó) */
  dias: number;
  pago: PagoFijo | null;
  estado: EstadoFijo;
};

const DIAS_PROXIMO = 5;

// '2026-10-01' para cualquier día de octubre de 2026
export function mesDe(fecha: Date) {
  return formatearFecha(new Date(fecha.getFullYear(), fecha.getMonth(), 1));
}

// El día del mes sin pasarse del último (el 31 en febrero es el 28 o 29)
export function vencimientoDelMes(dia: number, referencia: Date) {
  const ultimo = new Date(referencia.getFullYear(), referencia.getMonth() + 1, 0).getDate();
  return new Date(referencia.getFullYear(), referencia.getMonth(), Math.min(dia, ultimo));
}

// Cada fijo activo con su vencimiento de este mes y si ya se pagó, ordenados por fecha
export function fijosDelMes(fijos: Fijo[], pagos: PagoFijo[], hoy = new Date()): FijoDelMes[] {
  const mes = mesDe(hoy);
  return fijos
    .filter((f) => f.activo)
    .map((fijo) => {
      const vence = vencimientoDelMes(fijo.dia, hoy);
      const dias = diasEntre(hoy, vence);
      const pago = pagos.find((p) => p.fijo_id === fijo.id && p.mes === mes) ?? null;
      let estado: EstadoFijo;
      if (pago) estado = 'pagado';
      else if (dias < 0) estado = 'vencido';
      else if (dias === 0) estado = 'hoy';
      else if (dias <= DIAS_PROXIMO) estado = 'proximo';
      else estado = 'pendiente';
      return { fijo, vence, dias, pago, estado };
    })
    .sort((a, b) => a.vence.getTime() - b.vence.getTime());
}

// Lo que falta pagar este mes de los fijos (los dólares, al dólar tarjeta si lo tenemos).
// Los de monto variable que todavía no llegaron no suman, pero se cuentan aparte.
export function pendienteDeFijos(delMes: FijoDelMes[], dolar: number | null) {
  let total = 0;
  let sinMonto = 0;
  for (const { fijo, pago } of delMes) {
    if (pago) continue;
    if (fijo.monto === null) sinMonto++;
    else total += enPesos(fijo.monto, fijo.moneda, dolar);
  }
  return { total, sinMonto };
}

// Cuánto se va por mes en fijos y cuánto de eso son suscripciones
export function totalMensualFijos(fijos: Fijo[], dolar: number | null) {
  let total = 0;
  let suscripciones = 0;
  let cantidadSuscripciones = 0;
  for (const fijo of fijos) {
    if (!fijo.activo || fijo.monto === null) continue;
    const monto = enPesos(fijo.monto, fijo.moneda, dolar);
    total += monto;
    if (fijo.tipo === 'suscripcion') {
      suscripciones += monto;
      cantidadSuscripciones++;
    }
  }
  return { total, suscripciones, cantidadSuscripciones };
}

function enPesos(monto: number, moneda: 'ARS' | 'USD', dolar: number | null) {
  return moneda === 'USD' ? monto * (dolar ?? 0) : monto;
}

// Los débitos automáticos que ya vencieron este mes y todavía no se anotaron
export function debitosParaAnotar(fijos: Fijo[], pagos: PagoFijo[], hoy = new Date()): FijoDelMes[] {
  return fijosDelMes(fijos, pagos, hoy).filter(
    ({ fijo, pago, dias }) => fijo.debito_automatico && fijo.monto !== null && !pago && dias <= 0
  );
}

// El gasto que se anota al pagar un fijo
export function gastoDeFijo(fijo: Fijo, monto: number, fecha: Date, medios: MedioPago[]): Omit<GastoGuardado, 'id'> {
  const medio = medios.find((m) => m.id === fijo.tarjeta_id) ?? null;
  return {
    descripcion: fijo.descripcion,
    categoria: fijo.categoria ?? (fijo.tipo === 'suscripcion' ? 'Entretenimiento' : 'Servicios'),
    monto_total: monto,
    moneda: fijo.moneda,
    cantidad_cuotas: 1,
    tarjeta_id: medio?.id ?? null,
    fecha_compra: formatearFecha(fecha),
    primer_mes_cuota: calcularPrimerMesCuota(fecha, medio),
  };
}

// Marca un fijo como pagado: anota el gasto y registra el pago del mes
export async function pagarFijo(datos: FuenteDatos, fijo: Fijo, monto: number, fecha: Date, medios: MedioPago[]) {
  const gastoId = nuevoId();
  await datos.crearGasto({ ...gastoDeFijo(fijo, monto, fecha, medios), id: gastoId });
  await datos.pagosFijos.crear({ fijo_id: fijo.id, mes: mesDe(fecha), monto, gasto_id: gastoId });
}

// Deshace un pago: borra el registro y el gasto que se había anotado
export async function deshacerPago(datos: FuenteDatos, pago: PagoFijo) {
  await datos.pagosFijos.borrar(pago.id);
  if (pago.gasto_id) await datos.borrarGasto(pago.gasto_id).catch(() => {});
}

// Un gasto de un pago con el mismo nombre que el fijo, anotado en el mes de "fecha" (ej. Netflix anotado a mano)
export function gastoYaAnotado(fijo: Fijo, gastos: GastoGuardado[], fecha: Date) {
  const nombre = normalizarDescripcion(fijo.descripcion);
  const prefijo = mesDe(fecha).slice(0, 7);
  return gastos.find((g) => g.cantidad_cuotas === 1 && g.fecha_compra.startsWith(prefijo) && normalizarDescripcion(g.descripcion) === nombre) ?? null;
}

// Anota solos los débitos automáticos que ya vencieron. Si el usuario ya lo había anotado a mano ese mes,
// no lo duplica: solo lo marca como pagado con ese gasto. Devuelve los nombres de lo que anotó.
export async function anotarDebitos(datos: FuenteDatos, fijos: Fijo[], pagos: PagoFijo[], medios: MedioPago[], gastos: GastoGuardado[], hoy = new Date()) {
  const anotados: string[] = [];
  for (const { fijo, vence } of debitosParaAnotar(fijos, pagos, hoy)) {
    const existente = gastoYaAnotado(fijo, gastos, vence);
    if (existente) {
      await datos.pagosFijos.crear({ fijo_id: fijo.id, mes: mesDe(vence), monto: Number(existente.monto_total), gasto_id: existente.id });
      continue;
    }
    await pagarFijo(datos, fijo, fijo.monto!, vence, medios);
    anotados.push(fijo.descripcion);
  }
  return anotados;
}

// ---------- Detectar gastos que se repiten todos los meses ----------

export type Recurrente = {
  descripcion: string;
  monto: number;
  moneda: 'ARS' | 'USD';
  categoria: Categoria;
  dia: number;
  tarjeta_id: string | null;
  meses: number;
};

const SUSCRIPCIONES_CONOCIDAS = /netflix|spotify|hbo|max\b|disney|prime|youtube|apple|icloud|google one|paramount|star\+|crunchyroll|chatgpt|claude|gym|gimnasio/;

// "Netflix 10/26" → "netflix": sin mayúsculas, acentos, números ni signos
export function normalizarDescripcion(texto: string) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pareceSuscripcion(descripcion: string) {
  return SUSCRIPCIONES_CONOCIDAS.test(normalizarDescripcion(descripcion));
}

// Gastos de un pago que aparecen en al menos 2 de los últimos 4 meses y todavía no son fijos.
// Ej: si anotaste "Netflix" en agosto y en septiembre, te propone agregarlo.
export function detectarRecurrentes(gastos: GastoGuardado[], fijos: Fijo[], hoy = new Date()): Recurrente[] {
  const desde = formatearFecha(new Date(hoy.getFullYear(), hoy.getMonth() - 3, 1));
  const yaFijos = new Set(fijos.map((f) => normalizarDescripcion(f.descripcion)));
  const grupos = new Map<string, GastoGuardado[]>();

  for (const gasto of gastos) {
    if (gasto.cantidad_cuotas !== 1 || gasto.fecha_compra < desde) continue;
    const clave = normalizarDescripcion(gasto.descripcion);
    if (!clave || yaFijos.has(clave)) continue;
    grupos.set(clave, [...(grupos.get(clave) ?? []), gasto]);
  }

  const resultado: Recurrente[] = [];
  for (const lista of grupos.values()) {
    const meses = new Set(lista.map((g) => g.fecha_compra.slice(0, 7)));
    if (meses.size < 2) continue;
    // El más nuevo manda: es el monto y el día más actualizados
    const ultimo = [...lista].sort((a, b) => b.fecha_compra.localeCompare(a.fecha_compra))[0];
    resultado.push({
      descripcion: ultimo.descripcion,
      monto: Number(ultimo.monto_total),
      moneda: ultimo.moneda,
      categoria: (ultimo.categoria ?? 'Otros') as Categoria,
      dia: Number(ultimo.fecha_compra.slice(8, 10)),
      tarjeta_id: ultimo.tarjeta_id,
      meses: meses.size,
    });
  }
  return resultado.sort((a, b) => b.meses - a.meses || b.monto - a.monto);
}
