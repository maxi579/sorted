// Lee la foto de un ticket, una factura de servicio o la captura de un comprobante (Mercado Pago, transferencia...)
// con Claude y devuelve el gasto listo para anotar.
//
// Desplegar:   npx supabase functions deploy leer-comprobante
// Clave de IA: la misma que leer-resumen (ANTHROPIC_API_KEY en los secretos de Supabase)
//
// La imagen no se guarda en ningún lado: se lee, se manda a Claude y se descarta.

import { encodeBase64 } from 'jsr:@std/encoding/base64';
import { CATEGORIAS, claude, CORS, errorDeClaude, MODELO, RESPALDO, responder, textoDe, usuarioDelPedido } from '../_compartido/comun.ts';

const TAMANIO_MAXIMO = 8 * 1024 * 1024;

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['es_comprobante', 'tipo', 'descripcion', 'monto', 'moneda', 'fecha', 'cuotas', 'categoria', 'vencimiento'],
  properties: {
    es_comprobante: { type: 'boolean', description: 'false si la imagen no es un ticket, factura ni comprobante de pago' },
    tipo: { type: 'string', enum: ['compra', 'factura_servicio', 'transferencia', 'otro'] },
    descripcion: { type: 'string', description: 'Comercio o servicio, corto y legible: "Coto", "Edenor", "Farmacity"' },
    monto: { type: 'number', description: 'Total a pagar o pagado, positivo, sin separadores. 0 si no se ve.' },
    moneda: { type: 'string', enum: ['ARS', 'USD'] },
    fecha: { type: 'string', description: 'Fecha de la compra o del pago, AAAA-MM-DD, o "" si no figura' },
    cuotas: { type: 'integer', description: 'Cantidad de cuotas si dice "3 cuotas", "6 c/s interés"... Si no, 1.' },
    categoria: { type: 'string', enum: CATEGORIAS },
    vencimiento: { type: 'string', description: 'Solo facturas de servicio: primer vencimiento AAAA-MM-DD, o ""' },
  },
};

const INSTRUCCIONES = `Esta imagen es (probablemente) un comprobante de un gasto en Argentina: un ticket de compra, una factura de un servicio (luz, gas, agua, internet, celular, expensas...) o la captura de un pago en una billetera o banco (Mercado Pago, Ualá, MODO, transferencia).

Extraé el gasto:
- descripcion: el comercio o la empresa del servicio, corto y como lo diría una persona (no la razón social completa).
- monto: el total. En facturas de servicio, el total a pagar del período. Los montos argentinos usan punto para miles y coma para decimales ("$ 12.345,67" es 12345.67).
- moneda: USD solo si el total está en dólares.
- fecha: la de la compra o el pago. Si el año tiene dos dígitos, completalo (26 → 2026).
- tipo: "factura_servicio" para facturas de servicios con vencimiento; "transferencia" para transferencias a personas; "compra" para el resto.
- categoria: la que mejor encaje.

Si la imagen no es un comprobante, poné es_comprobante en false y el resto con valores vacíos (monto 0, cuotas 1, categoria "Otros").`;

type Comprobante = {
  es_comprobante: boolean;
  tipo: 'compra' | 'factura_servicio' | 'transferencia' | 'otro';
  descripcion: string;
  monto: number;
  moneda: 'ARS' | 'USD';
  fecha: string;
  cuotas: number;
  categoria: string;
  vencimiento: string;
};

// Tipo de archivo según sus primeros bytes (no confiamos en lo que dice el celular)
function tipoDeArchivo(b: Uint8Array) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  return null;
}

const fechaValida = (f: string) => (/^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null);

Deno.serve(async (pedido) => {
  if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (pedido.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405);
  if (!(await usuarioDelPedido(pedido))) return responder({ error: 'Tenés que iniciar sesión.' }, 401);

  let archivo: File;
  try {
    const campo = (await pedido.formData()).get('archivo');
    if (!(campo instanceof File)) throw new Error('falta el archivo');
    archivo = campo;
  } catch {
    return responder({ error: 'Mandá la foto del comprobante.' }, 400);
  }
  if (archivo.size > TAMANIO_MAXIMO) return responder({ error: 'La imagen es muy grande (máximo 8 MB).' }, 413);

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = tipoDeArchivo(bytes);
  if (!tipo) return responder({ error: 'Mandá una foto (JPG o PNG) o un PDF.' }, 400);

  const adjunto =
    tipo === 'application/pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: tipo, data: encodeBase64(bytes) } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: tipo, data: encodeBase64(bytes) } } as const);

  try {
    const respuesta = await claude.beta.messages.create({
      model: MODELO,
      max_tokens: 8000,
      ...RESPALDO,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: [adjunto, { type: 'text', text: INSTRUCCIONES }] }],
    });

    if (respuesta.stop_reason === 'refusal') return responder({ error: 'No pude leer este comprobante.' }, 422);
    if (respuesta.stop_reason === 'max_tokens') return responder({ error: 'No pude leer este comprobante.' }, 422);
    const texto = textoDe(respuesta);
    if (!texto) return responder({ error: 'No pude leer el comprobante.' }, 502);

    const c = JSON.parse(texto) as Comprobante;
    if (!c.es_comprobante) return responder({ error: 'No parece un ticket ni un comprobante. Probá con otra foto.' }, 422);
    return responder({
      comprobante: {
        tipo: c.tipo,
        descripcion: c.descripcion.trim() || 'Gasto',
        monto: Number.isFinite(c.monto) && c.monto > 0 ? c.monto : null,
        moneda: c.moneda === 'USD' ? 'USD' : 'ARS',
        fecha: fechaValida(c.fecha),
        cuotas: Number.isInteger(c.cuotas) && c.cuotas >= 1 && c.cuotas <= 72 ? c.cuotas : 1,
        categoria: CATEGORIAS.includes(c.categoria) ? c.categoria : 'Otros',
        vencimiento: fechaValida(c.vencimiento),
      },
    });
  } catch (error) {
    return errorDeClaude(error, 'La lectura de comprobantes');
  }
});
