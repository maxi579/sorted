import type { FuenteDatos } from './datos';
import { formatearFecha, formatearMonto } from './finanzas';
import { normalizarDescripcion, pagarFijo } from './fijos';
import { montoATexto } from './formato';
import { fechaDesdeTexto, prepararGasto } from './gastos';
import { CATEGORIAS, type Categoria, type MedioPago } from './tipos';

// Acciones que propone el asistente con IA ("anotame un café de 3500 con mp").
// No se hacen solas: el chat las muestra como tarjetas y se ejecutan recién cuando la persona toca Confirmar,
// con el mismo código que usa el resto de la app (funciona sin internet y en el modo demo).

export type Accion =
  | { tipo: 'anotar_gasto'; descripcion: string; monto: number; moneda: 'ARS' | 'USD'; cuotas: number; medio: string; categoria: string; fecha: string }
  | { tipo: 'crear_fijo'; descripcion: string; monto: number; moneda: 'ARS' | 'USD'; dia: number; clase: 'servicio' | 'suscripcion'; debito_automatico: boolean; medio: string }
  | { tipo: 'pagar_fijo'; fijo: string; monto: number }
  | { tipo: 'crear_meta'; nombre: string; emoji: string; objetivo: number; fecha_objetivo: string; ahorro_mensual: number }
  | { tipo: 'separar_ahorro'; meta: string; monto: number }
  | { tipo: 'anotar_retiro'; monto: number; nota: string }
  | { tipo: 'abrir_pantalla'; pantalla: string };

export type EstadoAccion = 'pendiente' | 'hecha' | 'cancelada';
export type AccionPropuesta = { accion: Accion; estado: EstadoAccion };

const PANTALLAS: Record<string, string> = {
  cargar: 'Anotar un gasto',
  fijos: 'Fijos',
  efectivo: 'Efectivo',
  ahorros: 'Ahorros',
  activos: 'Activos',
  rendimiento: '¿Cuánto me rinde?',
  cuotas: 'Cuotas',
  comprar: '¿Lo compro?',
  automatico: 'Anotar sin esfuerzo',
  revisar: 'Pagos para revisar',
  ajustes: 'Ajustes',
};

const TIPOS = ['anotar_gasto', 'crear_fijo', 'pagar_fijo', 'crear_meta', 'separar_ahorro', 'anotar_retiro', 'abrir_pantalla'];

/** Se queda solo con las acciones que la app sabe hacer y que tienen datos razonables (vienen de la IA: no confiamos a ciegas) */
export function accionesValidas(crudas: unknown): Accion[] {
  if (!Array.isArray(crudas)) return [];
  return crudas.filter((a): a is Accion => {
    if (!a || typeof a !== 'object' || !TIPOS.includes((a as { tipo: string }).tipo)) return false;
    const x = a as Record<string, unknown>;
    const montoOk = (m: unknown, permitirCero = false, permitirNegativo = false) =>
      typeof m === 'number' && Number.isFinite(m) && (m > 0 || (permitirCero && m === 0) || (permitirNegativo && m < 0)) && Math.abs(m) < 1e12;
    switch (x.tipo) {
      case 'anotar_gasto':
        return typeof x.descripcion === 'string' && montoOk(x.monto) && Number.isInteger(x.cuotas) && (x.cuotas as number) >= 1 && (x.cuotas as number) <= 72;
      case 'crear_fijo':
        return typeof x.descripcion === 'string' && x.descripcion.trim() !== '' && montoOk(x.monto, true) && Number.isInteger(x.dia) && (x.dia as number) >= 1 && (x.dia as number) <= 31;
      case 'pagar_fijo':
        return typeof x.fijo === 'string' && montoOk(x.monto);
      case 'crear_meta':
        return typeof x.nombre === 'string' && x.nombre.trim() !== '' && montoOk(x.objetivo, true) && montoOk(x.ahorro_mensual, true);
      case 'separar_ahorro':
        return typeof x.meta === 'string' && montoOk(x.monto, false, true);
      case 'anotar_retiro':
        return montoOk(x.monto);
      case 'abrir_pantalla':
        return typeof x.pantalla === 'string' && x.pantalla in PANTALLAS;
      default:
        return false;
    }
  });
}

/** Busca por nombre (sin mayúsculas ni acentos, y aceptando nombres parecidos: "visa" → "Visa Galicia") */
export function buscarPorNombre<T>(lista: T[], nombre: string, nombreDe: (x: T) => string): T | null {
  const buscado = normalizarDescripcion(nombre);
  if (!buscado) return null;
  return (
    lista.find((x) => normalizarDescripcion(nombreDe(x)) === buscado) ??
    lista.find((x) => normalizarDescripcion(nombreDe(x)).includes(buscado) || buscado.includes(normalizarDescripcion(nombreDe(x)))) ??
    null
  );
}

const categoriaValida = (c: string): Categoria => ((CATEGORIAS as readonly string[]).includes(c) ? (c as Categoria) : 'Otros');

/** La acción en una línea, para la tarjeta del chat */
export function describirAccion(a: Accion): { icono: string; titulo: string; detalle: string } {
  switch (a.tipo) {
    case 'anotar_gasto':
      return {
        icono: 'receipt',
        titulo: 'Anotar gasto',
        detalle: [
          a.descripcion || 'Gasto',
          formatearMonto(a.monto, a.moneda),
          a.cuotas > 1 ? `${a.cuotas} cuotas` : null,
          a.medio || 'Efectivo',
          categoriaValida(a.categoria),
          a.fecha ? fechaCorta(a.fecha) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    case 'crear_fijo':
      return {
        icono: 'repeat',
        titulo: a.clase === 'suscripcion' ? 'Agregar suscripción' : 'Agregar gasto fijo',
        detalle: [
          a.descripcion,
          a.monto > 0 ? formatearMonto(a.monto, a.moneda) : 'monto variable',
          `el día ${a.dia}`,
          a.debito_automatico ? 'se debita solo' : null,
          a.medio || null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    case 'pagar_fijo':
      return { icono: 'checkmark-circle', titulo: 'Marcar como pagado', detalle: `${a.fijo} · ${formatearMonto(a.monto)}` };
    case 'crear_meta':
      return {
        icono: 'flag',
        titulo: 'Crear meta de ahorro',
        detalle: [
          `${a.emoji || '💰'} ${a.nombre}`,
          a.objetivo > 0 ? formatearMonto(a.objetivo) : null,
          a.fecha_objetivo ? `para ${fechaCorta(a.fecha_objetivo)}` : null,
          a.ahorro_mensual > 0 ? `${formatearMonto(a.ahorro_mensual)} por mes` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    case 'separar_ahorro':
      return a.monto >= 0
        ? { icono: 'add-circle', titulo: 'Separar para tu ahorro', detalle: `${a.meta} · ${formatearMonto(a.monto)}` }
        : { icono: 'remove-circle', titulo: 'Sacar de tu ahorro', detalle: `${a.meta} · ${formatearMonto(-a.monto)}` };
    case 'anotar_retiro':
      return { icono: 'cash', titulo: 'Anotar que sacaste del cajero', detalle: [formatearMonto(a.monto), a.nota || null].filter(Boolean).join(' · ') };
    case 'abrir_pantalla':
      return { icono: 'arrow-forward-circle', titulo: 'Ir a', detalle: PANTALLAS[a.pantalla] ?? a.pantalla };
  }
}

function fechaCorta(fecha: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}` : fecha;
}

/**
 * Hace la acción. Devuelve un mensaje corto para mostrar, o lanza un error entendible.
 * abrir_pantalla no se hace acá: la pantalla del chat navega con la ruta que devuelve `destino`.
 */
export async function ejecutarAccion(a: Accion, datos: FuenteDatos): Promise<{ mensaje: string; destino?: string }> {
  const hoy = new Date();
  switch (a.tipo) {
    case 'anotar_gasto': {
      const medios = await datos.medios();
      const medio = a.medio ? buscarPorNombre(medios, a.medio, (m: MedioPago) => m.nombre) : null;
      if (a.medio && !medio) throw new Error(`No encontré la tarjeta "${a.medio}". Anotalo desde el +.`);
      const fecha = a.fecha && /^\d{4}-\d{2}-\d{2}$/.test(a.fecha) && fechaDesdeTexto(a.fecha) <= hoy ? fechaDesdeTexto(a.fecha) : hoy;
      const preparado = prepararGasto(
        {
          descripcion: a.descripcion,
          montoTexto: montoATexto(a.monto),
          cuotasTexto: String(a.cuotas),
          moneda: a.moneda,
          medioId: medio?.id ?? null,
          categoria: categoriaValida(a.categoria),
        },
        medios,
        fecha
      );
      if (preparado.error) throw new Error(preparado.error);
      const resultado = await datos.crearGasto({ ...preparado.fila, texto_original: `Asistente: ${a.descripcion}` });
      return { mensaje: resultado === 'pendiente' ? 'Anotado. Se sube cuando haya internet 📶' : 'Anotado ✓' };
    }
    case 'crear_fijo': {
      const medios = await datos.medios();
      const medio = a.medio ? buscarPorNombre(medios, a.medio, (m: MedioPago) => m.nombre) : null;
      const tipo = a.clase === 'suscripcion' ? 'suscripcion' : 'servicio';
      await datos.fijos.crear({
        descripcion: a.descripcion.trim(),
        categoria: tipo === 'suscripcion' ? 'Entretenimiento' : 'Servicios',
        tipo,
        monto: a.monto > 0 ? a.monto : null,
        moneda: a.moneda,
        dia: a.dia,
        tarjeta_id: medio?.id ?? null,
        debito_automatico: a.debito_automatico && a.monto > 0,
        activo: true,
      });
      return { mensaje: `${a.descripcion} agregado a tus fijos ✓` };
    }
    case 'pagar_fijo': {
      const [fijos, medios] = await Promise.all([datos.fijos.listar(), datos.medios()]);
      const fijo = buscarPorNombre(fijos, a.fijo, (f) => f.descripcion);
      if (!fijo) throw new Error(`No encontré el fijo "${a.fijo}".`);
      await pagarFijo(datos, fijo, a.monto, hoy, medios);
      return { mensaje: `${fijo.descripcion} pagado ✓` };
    }
    case 'crear_meta': {
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(a.fecha_objetivo) ? a.fecha_objetivo : null;
      await datos.metas.crear({
        nombre: a.nombre.trim(),
        emoji: a.emoji?.trim() || '💰',
        objetivo: a.objetivo > 0 ? a.objetivo : null,
        fecha_objetivo: fecha,
        activo_id: null,
        ahorro_mensual: a.ahorro_mensual > 0 ? a.ahorro_mensual : null,
        dia_aporte: null,
      });
      return { mensaje: `Meta "${a.nombre}" creada ✓`, destino: '/ahorros' };
    }
    case 'separar_ahorro': {
      const metas = await datos.metas.listar();
      const meta = buscarPorNombre(metas, a.meta, (m) => m.nombre);
      if (!meta) throw new Error(`No encontré la meta "${a.meta}".`);
      await datos.aportes.crear({ meta_id: meta.id, monto: a.monto, fecha: formatearFecha(hoy), automatico: false });
      return { mensaje: a.monto >= 0 ? `Separaste ${formatearMonto(a.monto)} para ${meta.nombre} 💪` : `Anotado que sacaste de ${meta.nombre}` };
    }
    case 'anotar_retiro':
      await datos.retiros.crear({ monto: a.monto, fecha: formatearFecha(hoy), nota: a.nota?.trim() || null });
      return { mensaje: 'Anotado 💵' };
    case 'abrir_pantalla':
      return { mensaje: '', destino: `/${a.pantalla}` };
  }
}
