import { diasEntre } from './finanzas';
import { fechaDesdeTexto } from './gastos';
import type { Activo, TipoActivo } from './tipos';

// Activos: cuánto vale hoy lo que tenés y cuánto rindió, en pesos y descontando la inflación.
// Solo calcula con los datos que cargaste y cotizaciones públicas: no recomienda inversiones.

export const TIPOS_ACTIVO: { valor: TipoActivo; nombre: string; emoji: string; ayuda: string }[] = [
  { valor: 'dolares', nombre: 'Dólares', emoji: '💵', ayuda: 'Se valúan solos con el dólar blue (compra).' },
  { valor: 'plazo_fijo', nombre: 'Plazo fijo', emoji: '🏦', ayuda: 'Con la tasa (TNA) y los días, calculo cuánto cobrás.' },
  { valor: 'remunerada', nombre: 'Cuenta que paga interés', emoji: '📲', ayuda: 'Mercado Pago, Ualá, Naranja X... con su TNA.' },
  { valor: 'fci', nombre: 'Fondo común', emoji: '📊', ayuda: 'Actualizá cuánto vale cada tanto.' },
  { valor: 'acciones', nombre: 'Acciones o CEDEARs', emoji: '📈', ayuda: 'Actualizá cuánto vale cada tanto.' },
  { valor: 'cripto', nombre: 'Cripto', emoji: '🪙', ayuda: 'Actualizá cuánto vale cada tanto.' },
  { valor: 'bien', nombre: 'Un bien (auto, celular...)', emoji: '🚗', ayuda: 'Pierde valor con los años: decime cuánto por año.' },
  { valor: 'otro', nombre: 'Otro', emoji: '✨', ayuda: 'Actualizá cuánto vale cada tanto.' },
];

export function infoTipo(tipo: TipoActivo) {
  return TIPOS_ACTIVO.find((t) => t.valor === tipo) ?? TIPOS_ACTIVO[TIPOS_ACTIVO.length - 1];
}

export type MesInflacion = { fecha: string; valor: number };

// Inflación acumulada entre dos fechas, usando el dato del INDEC de cada mes.
// Los meses sin dato publicado (el actual, por ejemplo) usan la inflación estimada.
export function inflacionAcumulada(serie: MesInflacion[], desde: Date, hasta: Date, porDefecto: number) {
  const porMes = new Map(serie.map((m) => [m.fecha.slice(0, 7), Number(m.valor) / 100]));
  let factor = 1;
  let cursor = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  while (diasEntre(cursor, hasta) > 0) {
    const inicioMes = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const finMes = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const finTramo = diasEntre(finMes, hasta) > 0 ? finMes : hasta;
    const fraccion = diasEntre(cursor, finTramo) / diasEntre(inicioMes, finMes);
    const clave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    factor *= Math.pow(1 + (porMes.get(clave) ?? porDefecto), fraccion);
    cursor = finTramo;
  }
  return factor - 1;
}

export type Valuacion = {
  valorHoy: number;
  ganancia: number;
  /** Rendimiento en pesos como fracción (0.1 = 10%), o null si no hay monto inicial */
  rendimiento: number | null;
  /** Rendimiento descontando la inflación, o null si no se puede calcular */
  rendimientoReal: number | null;
  /** Solo plazo fijo: cuándo vence y cuánto cobrás */
  vencimiento: { fecha: Date; valor: number; vencido: boolean } | null;
  /** El valor no se actualiza solo: conviene cargarlo de nuevo cada tanto */
  manual: boolean;
};

type Contexto = { hoy: Date; dolar: number | null; serieInflacion: MesInflacion[]; inflacionMensual: number };

export function valuarActivo(activo: Activo, ctx: Contexto): Valuacion {
  const inicio = fechaDesdeTexto(activo.fecha_inicio);
  const dias = Math.max(diasEntre(inicio, ctx.hoy), 0);
  const monto = Number(activo.monto_inicial);
  let valorHoy = monto;
  let vencimiento: Valuacion['vencimiento'] = null;
  let manual = false;

  switch (activo.tipo) {
    case 'dolares':
      if (activo.cantidad && ctx.dolar) valorHoy = activo.cantidad * ctx.dolar;
      break;
    case 'plazo_fijo': {
      const tna = (activo.tna ?? 0) / 100;
      const plazo = activo.plazo_dias ?? 30;
      valorHoy = monto * (1 + (tna * Math.min(dias, plazo)) / 365);
      const fecha = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + plazo);
      vencimiento = { fecha, valor: monto * (1 + (tna * plazo) / 365), vencido: dias >= plazo };
      break;
    }
    case 'remunerada':
      valorHoy = monto * Math.pow(1 + (activo.tna ?? 0) / 100 / 365, dias);
      break;
    case 'bien':
      valorHoy = monto * Math.pow(1 - (activo.depreciacion_anual ?? 0) / 100, dias / 365);
      break;
    default:
      valorHoy = activo.valor_actual ?? monto;
      manual = true;
  }

  const rendimiento = monto > 0 ? valorHoy / monto - 1 : null;
  const inflacion = inflacionAcumulada(ctx.serieInflacion, inicio, ctx.hoy, ctx.inflacionMensual);
  const rendimientoReal = rendimiento === null ? null : (1 + rendimiento) / (1 + inflacion) - 1;
  return { valorHoy, ganancia: valorHoy - monto, rendimiento, rendimientoReal, vencimiento, manual };
}

// '0.1234' → '+12,3%'
export function formatearPorcentaje(fraccion: number) {
  const signo = fraccion > 0 ? '+' : '';
  return `${signo}${(fraccion * 100).toLocaleString('es-AR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
}
