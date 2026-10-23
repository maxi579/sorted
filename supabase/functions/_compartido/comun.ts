// Lo que comparten las funciones del servidor: CORS, respuestas JSON, usuario logueado y cliente de Claude.

import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClient } from 'npm:@supabase/supabase-js@2';

export const claude = new Anthropic(); // toma ANTHROPIC_API_KEY de los secretos de Supabase
export const MODELO = 'claude-opus-5-5';
// Si el modelo rechaza un pedido, la API lo reintenta sola con el modelo de respaldo recomendado
export const RESPALDO = { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const };

// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los define Supabase en cada función
const URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function responder(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

// La clave pública de la app la puede sacar cualquiera: para no gastar la clave de IA en pedidos anónimos,
// exigimos la sesión de un usuario real. Devuelve el usuario y un cliente que ve solo sus datos (RLS).
export async function usuarioDelPedido(pedido: Request) {
  const token = pedido.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const cliente = createClient(URL, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await cliente.auth.getUser(token);
  return error || !data.user ? null : { usuario: data.user, cliente };
}

// Cliente con permisos de administrador: solo para lo que no hace un usuario (mails entrantes, límites de uso)
export function clienteServicio() {
  return createClient(URL, SERVICIO, { auth: { persistSession: false } });
}

// Primer bloque de texto de una respuesta de Claude
export function textoDe(respuesta: Anthropic.Beta.BetaMessage) {
  const bloque = respuesta.content.find((b) => b.type === 'text');
  return bloque && bloque.type === 'text' ? bloque.text : null;
}

// Mensaje de error amable según lo que haya fallado al llamar a Claude
export function errorDeClaude(error: unknown, que: string) {
  if (error instanceof Anthropic.RateLimitError) return responder({ error: 'Hay mucha gente usando esto ahora. Probá en unos minutos.' }, 429);
  if (error instanceof Anthropic.AuthenticationError) {
    console.error('ANTHROPIC_API_KEY inválida o sin configurar');
    return responder({ error: `${que} no está bien configurado.` }, 500);
  }
  if (error instanceof Anthropic.APIError) {
    console.error(`Error de la API de Claude (${error.status}):`, error.message);
    return responder({ error: 'Algo falló. Probá de nuevo en un rato.' }, 502);
  }
  console.error(error);
  return responder({ error: 'Algo falló. Probá de nuevo en un rato.' }, 500);
}

export const CATEGORIAS = [
  'Comida y salidas',
  'Supermercado',
  'Transporte',
  'Servicios',
  'Compras',
  'Salud',
  'Entretenimiento',
  'Educación',
  'Otros',
];
