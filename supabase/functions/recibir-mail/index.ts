// Recibe los mails de pagos que el usuario reenvía (Mercado Pago, bancos), saca el monto, el comercio y la fecha
// con Claude, y los deja en "Pagos para revisar". Si el celular está registrado, le manda un aviso.
//
// Funciona con el "inbound" de Postmark (https://postmarkapp.com/inbound-email), que recibe los mails
// en una dirección tipo abc123@inbound.postmarkapp.com y los manda a esta función como JSON.
// Cada usuario usa abc123+SUCODIGO@inbound.postmarkapp.com: Postmark separa el código en "MailboxHash".
//
// Desplegar:   npx supabase functions deploy recibir-mail --no-verify-jwt
// Secretos:    npx supabase secrets set MAIL_SECRETO=<una clave larga al azar>
// En Postmark: webhook de inbound → https://<proyecto>.supabase.co/functions/v1/recibir-mail?clave=<MAIL_SECRETO>
// En la app:   EXPO_PUBLIC_MAIL_PAGOS=abc123@inbound.postmarkapp.com
//
// El mail completo no se guarda: solo el pago detectado y una línea del texto original.

import { claude, clienteServicio, MODELO, RESPALDO, responder, textoDe } from '../_compartido/comun.ts';

const SECRETO = Deno.env.get('MAIL_SECRETO') ?? '';
const LARGO_MAXIMO = 60_000;

type MailEntrante = {
  From?: string;
  FromName?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  MailboxHash?: string;
  Date?: string;
};

const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['es_pago', 'descripcion', 'monto', 'moneda', 'fecha', 'fuente', 'resumen'],
  properties: {
    es_pago: { type: 'boolean', description: 'true solo si el mail confirma un pago, compra, débito o transferencia que hizo el usuario' },
    descripcion: { type: 'string', description: 'Comercio o destinatario, corto: "Café Martínez", "Juan Pérez"' },
    monto: { type: 'number', description: 'Importe pagado, positivo, sin separadores' },
    moneda: { type: 'string', enum: ['ARS', 'USD'] },
    fecha: { type: 'string', description: 'Fecha del pago AAAA-MM-DD, o "" si no figura' },
    fuente: { type: 'string', description: 'Quién manda el aviso: "Mercado Pago", "Galicia", "Ualá"...' },
    resumen: { type: 'string', description: 'Una línea que describa el pago, ej. "Pagaste $ 8.500 a Café Martínez"' },
  },
};

const INSTRUCCIONES = `Este es un mail que un usuario argentino reenvió a Sorted, su app de gastos. Puede ser el aviso de un pago (Mercado Pago, un banco, una billetera, una tarjeta) o cualquier otra cosa.

Decidí si confirma un gasto que hizo el usuario: un pago, una compra con tarjeta, un débito automático o una transferencia que él envió. NO es un gasto: dinero recibido, reintegros, devoluciones, promociones, resúmenes de cuenta, códigos de seguridad, newsletters.

Si es un gasto, extraé el comercio o destinatario, el monto (los montos argentinos usan punto para miles y coma para decimales), la moneda y la fecha. Si no es un gasto, poné es_pago en false y el resto vacío (monto 0).`;

// Gmail, al agregar una dirección de reenvío, manda un mail con un código para confirmarla
function codigoDeGmail(mail: MailEntrante) {
  if (!/forwarding-noreply@google\.com/i.test(mail.From ?? '')) return null;
  const texto = `${mail.Subject ?? ''}\n${mail.TextBody ?? ''}`;
  return texto.match(/(?:c[oó]digo de confirmaci[oó]n|confirmation code)\D{0,40}(\d{6,12})/i)?.[1] ?? texto.match(/\b(\d{9})\b/)?.[1] ?? null;
}

function textoPlano(mail: MailEntrante) {
  const texto =
    mail.TextBody?.trim() ||
    (mail.HtmlBody ?? '')
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  return `De: ${mail.FromName ?? ''} <${mail.From ?? ''}>\nAsunto: ${mail.Subject ?? ''}\nFecha del mail: ${mail.Date ?? ''}\n\n${texto}`;
}

async function avisarAlCelular(token: string, titulo: string, cuerpo: string) {
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: token, title: titulo, body: cuerpo, data: { url: '/revisar' }, sound: 'default' }),
    });
  } catch (e) {
    console.error('No se pudo mandar el aviso:', e);
  }
}

const hoyArgentina = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });

Deno.serve(async (pedido) => {
  if (pedido.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405);
  if (!SECRETO || new URL(pedido.url).searchParams.get('clave') !== SECRETO) return responder({ error: 'No autorizado.' }, 401);

  const mail = (await pedido.json().catch(() => null)) as MailEntrante | null;
  const codigo = mail?.MailboxHash?.trim();
  // A partir de acá respondemos siempre 200: si no, Postmark reintenta el mismo mail
  if (!mail || !codigo) return responder({ ok: true, ignorado: 'sin código' });

  const admin = clienteServicio();
  const { data: perfil } = await admin.from('perfiles').select('id, push_token').eq('codigo_mail', codigo).maybeSingle();
  if (!perfil) return responder({ ok: true, ignorado: 'código desconocido' });

  const verificacion = codigoDeGmail(mail);
  if (verificacion) {
    await admin.from('sugerencias').insert({
      usuario_id: perfil.id,
      origen: 'mail',
      descripcion: verificacion,
      fecha: hoyArgentina(),
      fuente: 'Gmail',
      texto_original: 'Código para confirmar el reenvío',
      estado: 'verificacion',
    });
    if (perfil.push_token) await avisarAlCelular(perfil.push_token, '📩 Llegó el código de Gmail', 'Abrí Ajustes en la app para copiarlo.');
    return responder({ ok: true });
  }

  try {
    const respuesta = await claude.beta.messages.create({
      model: MODELO,
      max_tokens: 4000,
      ...RESPALDO,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
      messages: [{ role: 'user', content: `${INSTRUCCIONES}\n\n<mail>\n${textoPlano(mail).slice(0, LARGO_MAXIMO)}\n</mail>` }],
    });
    const texto = respuesta.stop_reason === 'end_turn' ? textoDe(respuesta) : null;
    if (!texto) return responder({ ok: true, ignorado: 'no se pudo leer' });

    const pago = JSON.parse(texto) as { es_pago: boolean; descripcion: string; monto: number; moneda: string; fecha: string; fuente: string; resumen: string };
    if (!pago.es_pago || !(pago.monto > 0)) return responder({ ok: true, ignorado: 'no es un pago' });

    const descripcion = pago.descripcion.trim() || 'Pago';
    await admin.from('sugerencias').insert({
      usuario_id: perfil.id,
      origen: 'mail',
      descripcion,
      monto: pago.monto,
      moneda: pago.moneda === 'USD' ? 'USD' : 'ARS',
      fecha: /^\d{4}-\d{2}-\d{2}$/.test(pago.fecha) ? pago.fecha : hoyArgentina(),
      fuente: pago.fuente.trim() || null,
      texto_original: pago.resumen.trim().slice(0, 200) || null,
      estado: 'pendiente',
    });

    if (perfil.push_token) {
      const monto = `${pago.moneda === 'USD' ? 'US$' : '$'} ${pago.monto.toLocaleString('es-AR')}`;
      await avisarAlCelular(perfil.push_token, `💸 ${monto} en ${descripcion}`, '¿Lo anotamos? Tocá para revisarlo.');
    }
    return responder({ ok: true });
  } catch (error) {
    // Error de la IA: lo registramos y respondemos 200 igual (un reintento de Postmark daría el mismo error)
    console.error('No se pudo procesar el mail:', error);
    return responder({ ok: true, ignorado: 'error al procesar' });
  }
});
