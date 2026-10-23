// Lee un recibo de sueldo (PDF o foto) con Claude y devuelve el período, el empleador, el bruto y el neto.
// El período es exacto (desde/hasta): hay quien cobra por quincena o por semana y tiene varios recibos por mes.
// También se distingue el tipo: en un mismo mes puede haber sueldo, vacaciones, aguinaldo, ajustes...
//
// Desplegar:   npx supabase functions deploy leer-recibo
// Clave de IA: la misma que leer-comprobante (ANTHROPIC_API_KEY en los secretos de Supabase)
//
// El archivo no se guarda en ningún lado: se lee, se manda a Claude y se descarta.

import { encodeBase64 } from 'jsr:@std/encoding/base64';
import { claude, CORS, errorDeClaude, MODELO, RESPALDO, responder, textoDe, usuarioDelPedido } from '../_compartido/comun.ts';

const TAMANIO_MAXIMO = 8 * 1024 * 1024;

const TIPOS = ['sueldo', 'vacaciones', 'aguinaldo', 'ajuste', 'final'];

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['es_recibo', 'empleador', 'desde', 'hasta', 'bruto', 'neto', 'moneda', 'tipo'],
  properties: {
    es_recibo: { type: 'boolean', description: 'false si no es un recibo de sueldo' },
    empleador: { type: 'string', description: 'Nombre corto de la empresa empleadora: "Techint", "Banco Nación"' },
    desde: { type: 'string', description: 'Primer día del período liquidado, AAAA-MM-DD' },
    hasta: { type: 'string', description: 'Último día del período liquidado, AAAA-MM-DD' },
    bruto: { type: 'number', description: 'Total de haberes (remuneración bruta), 0 si no figura' },
    neto: { type: 'number', description: 'Neto a cobrar' },
    moneda: { type: 'string', enum: ['ARS', 'USD'] },
    tipo: { type: 'string', enum: TIPOS, description: 'Qué liquida el recibo' },
  },
};

const INSTRUCCIONES = `Este archivo es (probablemente) un recibo de sueldo argentino.

Extraé:
- empleador: la empresa, corto y como lo diría una persona (no la razón social completa con S.A.).
- desde y hasta: el período liquidado, no la fecha de pago. Formato AAAA-MM-DD.
  - Sueldo mensual ("Período: 09/2026", "Septiembre 2026"): del primer al último día del mes (2026-09-01 a 2026-09-30).
  - Quincena ("1ra quincena 09/2026", "01/09 al 15/09"): del 1 al 15; la segunda, del 16 al último día del mes.
  - Semana o cualquier otro período: las fechas que figuren.
- bruto: el total de haberes o remuneración bruta.
- neto: el neto a cobrar ("Neto a cobrar", "Total neto", "Son pesos..."). Los montos argentinos usan punto para miles y coma para decimales ("$ 1.234.567,89" es 1234567.89).
- tipo: qué liquida el recibo. En un mismo mes puede haber varios.
  - "sueldo": el sueldo del período (mes, quincena o semana), aunque además traiga horas extra, premios o el SAC.
  - "vacaciones": la liquidación de vacaciones pagada aparte (por adelantado). Las fechas son las de los días de vacaciones.
  - "aguinaldo": solo el SAC / medio aguinaldo.
  - "ajuste": retroactivos, diferencias por paritaria, liquidaciones complementarias de meses anteriores.
  - "final": liquidación final por renuncia o despido.

Si no es un recibo de sueldo, poné es_recibo en false y el resto vacío (montos 0, fechas "").`;

type Recibo = { es_recibo: boolean; empleador: string; desde: string; hasta: string; bruto: number; neto: number; moneda: 'ARS' | 'USD'; tipo: string };

const esFecha = (f: string) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(f);

// Tipo de archivo según sus primeros bytes (no confiamos en lo que dice el celular)
function tipoDeArchivo(b: Uint8Array) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'application/pdf';
  return null;
}

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
    return responder({ error: 'Mandá el recibo de sueldo.' }, 400);
  }
  if (archivo.size > TAMANIO_MAXIMO) return responder({ error: 'El archivo es muy grande (máximo 8 MB).' }, 413);

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = tipoDeArchivo(bytes);
  if (!tipo) return responder({ error: 'Mandá el recibo en PDF o una foto (JPG o PNG).' }, 400);

  const adjunto =
    tipo === 'application/pdf'
      ? ({ type: 'document', source: { type: 'base64', media_type: tipo, data: encodeBase64(bytes) } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: tipo, data: encodeBase64(bytes) } } as const);

  try {
    const respuesta = await claude.beta.messages.create({
      model: MODELO,
      max_tokens: 4000,
      ...RESPALDO,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: [adjunto, { type: 'text', text: INSTRUCCIONES }] }],
    });

    if (respuesta.stop_reason === 'refusal' || respuesta.stop_reason === 'max_tokens') return responder({ error: 'No pude leer este recibo.' }, 422);
    const texto = textoDe(respuesta);
    if (!texto) return responder({ error: 'No pude leer el recibo.' }, 502);

    const r = JSON.parse(texto) as Recibo;
    if (!r.es_recibo) return responder({ error: 'No parece un recibo de sueldo.' }, 422);
    if (!esFecha(r.desde) || !esFecha(r.hasta) || r.hasta < r.desde || !(r.neto > 0)) {
      return responder({ error: 'No encontré el período o el neto en el recibo.' }, 422);
    }
    return responder({
      recibo: {
        // El mes al que corresponde: el del último día liquidado
        periodo: `${r.hasta.slice(0, 7)}-01`,
        desde: r.desde,
        hasta: r.hasta,
        empleador: r.empleador.trim(),
        bruto: Number.isFinite(r.bruto) && r.bruto > 0 ? r.bruto : null,
        neto: r.neto,
        moneda: r.moneda === 'USD' ? 'USD' : 'ARS',
        tipo: TIPOS.includes(r.tipo) ? r.tipo : 'sueldo',
      },
    });
  } catch (error) {
    return errorDeClaude(error, 'La lectura de recibos');
  }
});
