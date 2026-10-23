import { formatearFecha } from './finanzas';

// Entiende las notificaciones de billeteras y bancos ("Pagaste $ 8.500 en Café Martínez")
// y las convierte en un pago para sugerir. Todo se procesa en el celular.

export type NotificacionLeida = { paquete: string; titulo: string; texto: string; cuando: number };

export type PagoDetectado =
  | { tipo: 'gasto'; descripcion: string; monto: number; moneda: 'ARS' | 'USD'; fecha: string; fuente: string | null; original: string }
  | { tipo: 'retiro'; monto: number; fecha: string; fuente: string | null; original: string }
  /** Cobró el sueldo: la app actualiza solo el sueldo del perfil */
  | { tipo: 'sueldo'; monto: number; fecha: string; fuente: string | null; original: string };

const APPS: Record<string, string> = {
  'com.mercadopago.wallet': 'Mercado Pago',
  'ar.com.bancar.uala': 'Ualá',
  'com.playdigital.modo': 'MODO',
  'com.brubank': 'Brubank',
  'com.naranjax.app': 'Naranja X',
  'ar.com.galicia': 'Galicia',
  'com.santander.app': 'Santander',
  'ar.com.bbva.net': 'BBVA',
};

// Si no conocemos la app, buscamos el nombre en el texto
const NOMBRES = [
  ['mercado pago', 'Mercado Pago'],
  ['ualá', 'Ualá'],
  ['uala', 'Ualá'],
  ['naranja x', 'Naranja X'],
  ['modo', 'MODO'],
  ['brubank', 'Brubank'],
  ['cuenta dni', 'Cuenta DNI'],
  ['galicia', 'Galicia'],
  ['santander', 'Santander'],
  ['bbva', 'BBVA'],
  ['macro', 'Macro'],
  ['nación', 'Banco Nación'],
  ['personal pay', 'Personal Pay'],
] as const;

const MONTO = /(US\$|U\$S|USD|\$)\s?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i;
const GASTO = /(pagaste|compraste|consumo|compra (aprobada|realizada)|pago (aprobado|realizado)|d[eé]bito|transferiste|enviaste|le pagaste|se debit)/i;
const RETIRO = /(extra(ji|c)|retir(aste|o de efectivo)|sacaste)/i;
const SUELDO = /(sueldo|haberes|acreditaci[oó]n de (tu )?(sueldo|haberes)|pago de n[oó]mina)/i;
const INGRESO = /(recibiste|te (transfiri|envi|pag|deposit)|acredit|reintegro|devoluci|cobraste|ingres(ó|o) (dinero|plata)|rendimiento|ganaste)/i;

// "$ 8.500,50" → 8500.5 ; "$8500" → 8500 ; "$ 1.234" → 1234
export function leerImporte(texto: string): number {
  const limpio = texto.trim();
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(limpio)) return Number(limpio.replace(/\./g, '').replace(',', '.'));
  return Number(limpio.replace(',', '.'));
}

function fuenteDe(n: NotificacionLeida) {
  if (APPS[n.paquete]) return APPS[n.paquete];
  const texto = `${n.titulo} ${n.texto}`.toLowerCase();
  return NOMBRES.find(([clave]) => texto.includes(clave))?.[1] ?? null;
}

// El comercio suele venir después del monto: "... $ 8.500 en Café Martínez" o "... a Juan Pérez"
function comercioDe(texto: string, finMonto: number) {
  const resto = texto.slice(finMonto);
  const encontrado = resto.match(/^\s*(?:en|a|para)\s+(.{2,40}?)(?=[.,!\n]|\s+con\s|\s+el\s+d[ií]a|$)/i);
  if (encontrado) return encontrado[1].trim();
  const antes = texto.match(/(?:en|a)\s+(.{2,40}?)\s+(?:por|de)\s+(?:US\$|U\$S|USD|\$)/i);
  return antes ? antes[1].trim() : null;
}

export function interpretarNotificacion(n: NotificacionLeida): PagoDetectado | null {
  const original = [n.titulo, n.texto].filter(Boolean).join(' · ');
  const texto = `${n.titulo}. ${n.texto}`;
  const monto = texto.match(MONTO);
  if (!monto || monto.index === undefined) return null;
  const valor = leerImporte(monto[2]);
  if (!(valor > 0)) return null;

  const fecha = formatearFecha(new Date(n.cuando));
  const fuente = fuenteDe(n);
  // El sueldo es plata que entra, pero sirve: actualiza solo el sueldo del perfil
  if (SUELDO.test(texto) && monto[1] === '$') return { tipo: 'sueldo', monto: valor, fecha, fuente, original };
  if (INGRESO.test(texto)) return null;
  if (RETIRO.test(texto)) return { tipo: 'retiro', monto: valor, fecha, fuente, original };
  if (!GASTO.test(texto)) return null;

  const moneda = monto[1] === '$' ? 'ARS' : 'USD';
  // El monto puede aparecer en el título y en el texto: probamos después de cada uno
  let comercio: string | null = null;
  for (const otro of texto.matchAll(new RegExp(MONTO.source, 'gi'))) {
    comercio = comercioDe(texto, (otro.index ?? 0) + otro[0].length);
    if (comercio) break;
  }
  return { tipo: 'gasto', descripcion: comercio ?? (fuente ? `Pago con ${fuente}` : 'Pago'), monto: valor, moneda, fecha, fuente, original };
}
