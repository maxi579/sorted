// Borra la cuenta del usuario que lo pide y, con ella, todos sus datos.
// Todas las tablas apuntan a auth.users con "on delete cascade": al borrar el usuario se borra todo lo suyo.
//
// Desplegar:   npx supabase functions deploy borrar-cuenta
//
// Solo borra la cuenta de quien manda el pedido (la sesión se verifica acá): nadie puede borrar la de otro.

import { clienteServicio, CORS, responder, usuarioDelPedido } from '../_compartido/comun.ts';

Deno.serve(async (pedido) => {
  if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (pedido.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405);
  const sesion = await usuarioDelPedido(pedido);
  if (!sesion) return responder({ error: 'Tenés que iniciar sesión.' }, 401);

  const { error } = await clienteServicio().auth.admin.deleteUser(sesion.usuario.id);
  if (error) {
    console.error('No se pudo borrar la cuenta:', error.message);
    return responder({ error: 'No se pudo borrar la cuenta. Probá de nuevo en un rato.' }, 500);
  }
  return responder({ ok: true });
});
