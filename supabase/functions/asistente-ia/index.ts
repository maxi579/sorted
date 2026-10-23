// Asistente con IA: responde preguntas sobre los gastos del usuario ("¿cuánto gasté en Uber en septiembre?",
// "¿en qué puedo recortar?", "armame el informe del mes") consultando sus datos con herramientas.
//
// Desplegar:   npx supabase functions deploy asistente-ia
// Clave de IA: la misma que leer-resumen (ANTHROPIC_API_KEY en los secretos de Supabase)
//
// Los datos se leen con la sesión del usuario: las políticas de la base (RLS) garantizan que solo vea los suyos.
// Cada usuario tiene un límite de mensajes por día (tabla uso_ia) para cuidar el costo de la API.

import type Anthropic from 'npm:@anthropic-ai/sdk';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { claude, clienteServicio, CORS, errorDeClaude, MODELO, RESPALDO, responder, textoDe, usuarioDelPedido } from '../_compartido/comun.ts';

// Bajo mientras la app está en desarrollo, para cuidar el crédito de la API. Subirlo al lanzarla.
const MENSAJES_POR_DIA = 10;
const HISTORIAL_MAXIMO = 20;
const VUELTAS_MAXIMAS = 6;

const TONOS: Record<string, string> = {
  amable: 'Hablá con calidez y dale ánimo, sin retarlo.',
  directo: 'Sé claro y concreto, sin vueltas.',
  estricto: 'Sé firme: cuidale el bolsillo y decile las cosas como son, sin ser agresivo.',
};

const INSTRUCCIONES = `Sos el asistente de una app argentina para llevar los gastos, las cuotas de las tarjetas y los gastos fijos. Hablás en español rioplatense (vos), con frases cortas y palabras simples: muchos usuarios son personas mayores.

Cómo trabajar:
- Para cualquier número sobre los gastos del usuario, usá las herramientas. Nunca inventes ni estimes montos que podés consultar.
- Respondé corto: 2 a 6 oraciones o una lista breve. Usá montos con el formato argentino ($ 12.345).
- Si te piden un informe del mes, incluí: total gastado, las 3 categorías más grandes, comparación con el mes anterior, cuotas y fijos que vienen, y uno o dos consejos concretos basados en sus datos.
- Los montos de "cuotas" son el total de la compra; si la compra fue en cuotas, cada mes paga monto_total / cantidad_cuotas.
- Podés explicar conceptos financieros (qué es la TNA, cómo afecta la inflación a las cuotas) y comentar los números del usuario, pero no recomiendes comprar o vender inversiones, acciones, cripto ni productos financieros puntuales: no sos asesor financiero. Si te lo piden, decilo con amabilidad y sugerí consultar a un profesional.
- Si algo no se puede responder con los datos, decilo y sugerí qué cargar en la app.
- No uses markdown con títulos; como mucho viñetas con "•".

Acciones en la app:
- Si el usuario te pide hacer algo (anotar un gasto, agregar un fijo, marcar un fijo como pagado, crear una meta de ahorro, separar o sacar plata de una meta, anotar que sacó del cajero, o ir a una sección), usá la herramienta de esa acción. Podés proponer varias a la vez.
- Las acciones NO se hacen solas: le aparecen al usuario para que las confirme con un botón. Nunca digas que ya lo hiciste; decí algo como "Te lo dejo listo para confirmar 👇".
- Usá los nombres exactos de sus tarjetas, fijos y metas que figuran más abajo. Si no dice con qué pagó, dejá el medio vacío (efectivo).
- Los montos en Argentina: "3500" son tres mil quinientos, "18 lucas" o "18k" son 18.000, "1 palo" es 1.000.000.
- Si falta un dato imprescindible (por ejemplo el monto), preguntalo antes de proponer.`;

const HERRAMIENTAS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'buscar_gastos',
    description:
      'Busca gastos del usuario. Devuelve hasta 60 gastos (del más nuevo al más viejo), la cantidad total que coincide y la suma en pesos y en dólares. Usala para preguntas como "¿cuánto gasté en X?" o "¿qué compré en septiembre?".',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['desde', 'hasta', 'texto', 'categoria'],
      properties: {
        desde: { type: 'string', description: 'Fecha mínima de compra AAAA-MM-DD, o "" sin límite' },
        hasta: { type: 'string', description: 'Fecha máxima de compra AAAA-MM-DD, o "" sin límite' },
        texto: { type: 'string', description: 'Palabra a buscar en la descripción (ej. "uber"), o ""' },
        categoria: { type: 'string', description: 'Categoría exacta (ej. "Comida y salidas"), o ""' },
      },
    },
  },
  {
    name: 'totales_por_mes',
    description:
      'Total gastado por mes y por categoría (según la fecha de compra, en pesos; los dólares aparte) de los últimos N meses, incluido el actual. Usala para comparar meses o ver tendencias.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['meses'],
      properties: { meses: { type: 'integer', description: 'Cantidad de meses hacia atrás, de 1 a 12' } },
    },
  },
];

type Gasto = {
  descripcion: string;
  categoria: string | null;
  monto_total: number;
  moneda: 'ARS' | 'USD';
  cantidad_cuotas: number;
  fecha_compra: string;
  tarjetas: { nombre: string } | null;
};

const fecha = (f: string) => (/^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null);

async function buscarGastos(db: SupabaseClient, filtro: { desde: string; hasta: string; texto: string; categoria: string }) {
  let consulta = db
    .from('gastos')
    .select('descripcion, categoria, monto_total, moneda, cantidad_cuotas, fecha_compra, tarjetas(nombre)', { count: 'exact' })
    .order('fecha_compra', { ascending: false });
  if (fecha(filtro.desde)) consulta = consulta.gte('fecha_compra', filtro.desde);
  if (fecha(filtro.hasta)) consulta = consulta.lte('fecha_compra', filtro.hasta);
  if (filtro.texto.trim()) consulta = consulta.ilike('descripcion', `%${filtro.texto.trim().replace(/[%_]/g, '')}%`);
  if (filtro.categoria.trim()) consulta = consulta.eq('categoria', filtro.categoria.trim());
  const { data, count, error } = await consulta.limit(500);
  if (error) throw new Error(error.message);
  const gastos = (data ?? []) as unknown as Gasto[];
  const suma = (moneda: string) => gastos.filter((g) => g.moneda === moneda).reduce((s, g) => s + Number(g.monto_total), 0);
  return {
    cantidad: count ?? gastos.length,
    total_pesos: suma('ARS'),
    total_dolares: suma('USD'),
    gastos: gastos.slice(0, 60).map((g) => ({
      fecha: g.fecha_compra,
      descripcion: g.descripcion,
      categoria: g.categoria,
      monto_total: Number(g.monto_total),
      moneda: g.moneda,
      cuotas: g.cantidad_cuotas,
      medio: g.tarjetas?.nombre ?? 'Efectivo',
    })),
  };
}

async function totalesPorMes(db: SupabaseClient, meses: number) {
  const cantidad = Math.min(Math.max(Math.round(meses) || 1, 1), 12);
  const hoy = new Date();
  const desde = new Date(hoy.getFullYear(), hoy.getMonth() - (cantidad - 1), 1).toISOString().slice(0, 10);
  const { data, error } = await db.from('gastos').select('categoria, monto_total, moneda, fecha_compra').gte('fecha_compra', desde);
  if (error) throw new Error(error.message);
  const porMes: Record<string, { pesos: number; dolares: number; por_categoria: Record<string, number> }> = {};
  for (const g of data ?? []) {
    const mes = String(g.fecha_compra).slice(0, 7);
    porMes[mes] ??= { pesos: 0, dolares: 0, por_categoria: {} };
    if (g.moneda === 'USD') porMes[mes].dolares += Number(g.monto_total);
    else {
      porMes[mes].pesos += Number(g.monto_total);
      const categoria = g.categoria ?? 'Otros';
      porMes[mes].por_categoria[categoria] = (porMes[mes].por_categoria[categoria] ?? 0) + Number(g.monto_total);
    }
  }
  return porMes;
}

const CATEGORIAS_APP = ['Comida y salidas', 'Supermercado', 'Transporte', 'Servicios', 'Compras', 'Salud', 'Entretenimiento', 'Educación', 'Otros'];
const PANTALLAS = ['cargar', 'fijos', 'efectivo', 'ahorros', 'activos', 'rendimiento', 'cuotas', 'comprar', 'automatico', 'revisar', 'ajustes'];

// Herramientas que no hacen nada en el servidor: proponen una acción que el usuario confirma en la app
function accion(name: string, description: string, properties: Record<string, unknown>): Anthropic.Beta.BetaTool {
  return {
    name,
    description,
    strict: true,
    input_schema: { type: 'object', additionalProperties: false, required: Object.keys(properties), properties },
  };
}

const ACCIONES: Anthropic.Beta.BetaTool[] = [
  accion('anotar_gasto', 'Propone anotar un gasto.', {
    descripcion: { type: 'string', description: 'Qué compró, corto: "Café", "Super Coto"' },
    monto: { type: 'number', description: 'Total de la compra, positivo' },
    moneda: { type: 'string', enum: ['ARS', 'USD'] },
    cuotas: { type: 'integer', description: '1 si es en un pago' },
    medio: { type: 'string', description: 'Nombre exacto de la tarjeta o billetera, o "" si fue en efectivo' },
    categoria: { type: 'string', enum: CATEGORIAS_APP },
    fecha: { type: 'string', description: 'AAAA-MM-DD si no fue hoy, o ""' },
  }),
  accion('crear_fijo', 'Propone agregar un gasto fijo o suscripción que se paga todos los meses.', {
    descripcion: { type: 'string' },
    monto: { type: 'number', description: 'Monto por mes, o 0 si cambia cada mes (luz, gas)' },
    moneda: { type: 'string', enum: ['ARS', 'USD'] },
    dia: { type: 'integer', description: 'Día del mes en que vence o se debita (1 a 31)' },
    clase: { type: 'string', enum: ['servicio', 'suscripcion'], description: 'suscripcion para Netflix, Spotify, gimnasio...; servicio para luz, gas, alquiler...' },
    debito_automatico: { type: 'boolean', description: 'true si se debita solo de la tarjeta' },
    medio: { type: 'string', description: 'Nombre exacto de la tarjeta o billetera, o ""' },
  }),
  accion('pagar_fijo', 'Propone marcar como pagado un gasto fijo de este mes.', {
    fijo: { type: 'string', description: 'Nombre exacto del fijo' },
    monto: { type: 'number', description: 'Lo que pagó (positivo)' },
  }),
  accion('crear_meta', 'Propone crear una meta de ahorro.', {
    nombre: { type: 'string' },
    emoji: { type: 'string', description: 'Un emoji que la represente' },
    objetivo: { type: 'number', description: 'Cuánto quiere juntar, o 0 si no dijo' },
    fecha_objetivo: { type: 'string', description: 'AAAA-MM-DD, o "" si no dijo' },
    ahorro_mensual: { type: 'number', description: 'Cuánto quiere separar por mes, o 0' },
  }),
  accion('separar_ahorro', 'Propone anotar plata separada para una meta de ahorro (o sacada, con monto negativo).', {
    meta: { type: 'string', description: 'Nombre exacto de la meta' },
    monto: { type: 'number', description: 'Positivo si separó, negativo si sacó' },
  }),
  accion('anotar_retiro', 'Propone anotar plata en efectivo que sacó del cajero.', {
    monto: { type: 'number' },
    nota: { type: 'string', description: 'Por ejemplo "cajero Galicia", o ""' },
  }),
  accion('abrir_pantalla', 'Propone llevar al usuario a una sección de la app.', {
    pantalla: { type: 'string', enum: PANTALLAS },
  }),
];
const NOMBRES_ACCIONES = new Set(ACCIONES.map((a) => a.name));

async function ejecutar(db: SupabaseClient, herramienta: Anthropic.Beta.BetaToolUseBlock) {
  const entrada = herramienta.input as Record<string, unknown>;
  if (herramienta.name === 'buscar_gastos') {
    return buscarGastos(db, {
      desde: String(entrada.desde ?? ''),
      hasta: String(entrada.hasta ?? ''),
      texto: String(entrada.texto ?? ''),
      categoria: String(entrada.categoria ?? ''),
    });
  }
  if (herramienta.name === 'totales_por_mes') return totalesPorMes(db, Number(entrada.meses));
  throw new Error(`Herramienta desconocida: ${herramienta.name}`);
}

// Lo que el asistente sabe de entrada del usuario: perfil, tarjetas, fijos, activos y metas de ahorro
async function contextoDelUsuario(db: SupabaseClient) {
  const [perfil, tarjetas, fijos, activos, metas] = await Promise.all([
    db.from('perfiles').select('nombre, sueldo, tono_asistente').single(),
    db.from('tarjetas').select('nombre, tipo, dia_cierre, dia_vencimiento'),
    db.from('fijos').select('descripcion, tipo, monto, moneda, dia, debito_automatico').eq('activo', true),
    db.from('activos').select('nombre, tipo, monto_inicial, fecha_inicio, cantidad, tna, valor_actual'),
    db.from('metas_ahorro').select('nombre, objetivo, fecha_objetivo, ahorro_mensual'),
  ]);
  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'full' });
  return {
    tono: (perfil.data?.tono_asistente as string) ?? 'directo',
    texto: [
      `Hoy es ${hoy}.`,
      `Usuario: ${perfil.data?.nombre ?? 'sin nombre'}. Sueldo mensual: ${perfil.data?.sueldo ? `$ ${perfil.data.sueldo}` : 'no lo cargó'}.`,
      `Tarjetas y billeteras: ${JSON.stringify(tarjetas.data ?? [])}`,
      `Gastos fijos y suscripciones (monto null = cambia cada mes): ${JSON.stringify(fijos.data ?? [])}`,
      `Activos (montos en pesos): ${JSON.stringify(activos.data ?? [])}`,
      `Metas de ahorro: ${JSON.stringify(metas.data ?? [])}`,
    ].join('\n'),
  };
}

// Suma un mensaje al contador del día. Devuelve cuántos le quedan, o null si ya llegó al límite.
async function contarMensaje(usuarioId: string) {
  const admin = clienteServicio();
  const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  const { data } = await admin.from('uso_ia').select('mensajes').eq('usuario_id', usuarioId).eq('dia', dia).maybeSingle();
  const usados = data?.mensajes ?? 0;
  if (usados >= MENSAJES_POR_DIA) return null;
  await admin.from('uso_ia').upsert({ usuario_id: usuarioId, dia, mensajes: usados + 1 });
  return MENSAJES_POR_DIA - usados - 1;
}

type MensajeChat = { role: 'user' | 'assistant'; content: string };

function historialValido(cuerpo: unknown): MensajeChat[] | null {
  const mensajes = (cuerpo as { mensajes?: unknown })?.mensajes;
  if (!Array.isArray(mensajes) || mensajes.length === 0) return null;
  const limpios = mensajes
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string' && m.content.trim())
    .slice(-HISTORIAL_MAXIMO)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) }) as MensajeChat);
  // La conversación tiene que empezar y terminar con un mensaje del usuario
  while (limpios.length > 0 && limpios[0].role !== 'user') limpios.shift();
  return limpios.length > 0 && limpios[limpios.length - 1].role === 'user' ? limpios : null;
}

Deno.serve(async (pedido) => {
  if (pedido.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (pedido.method !== 'POST') return responder({ error: 'Método no permitido.' }, 405);
  const sesion = await usuarioDelPedido(pedido);
  if (!sesion) return responder({ error: 'Tenés que iniciar sesión.' }, 401);

  const historial = historialValido(await pedido.json().catch(() => null));
  if (!historial) return responder({ error: 'Escribí una pregunta.' }, 400);

  const restantes = await contarMensaje(sesion.usuario.id);
  if (restantes === null) {
    return responder({ error: `Llegaste a los ${MENSAJES_POR_DIA} mensajes de hoy. Mañana seguimos 🙂` }, 429);
  }

  try {
    const contexto = await contextoDelUsuario(sesion.cliente);
    // Las instrucciones fijas van primero y se cachean; los datos del usuario cambian y van después
    const sistema: Anthropic.Beta.BetaTextBlockParam[] = [
      { type: 'text', text: INSTRUCCIONES, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `${TONOS[contexto.tono] ?? TONOS.directo}\n\n${contexto.texto}` },
    ];
    const mensajes: Anthropic.Beta.BetaMessageParam[] = historial.map((m) => ({ role: m.role, content: m.content }));
    // Lo que el asistente propone hacer: la app se lo muestra al usuario para que lo confirme
    const acciones: Record<string, unknown>[] = [];

    for (let vuelta = 0; vuelta < VUELTAS_MAXIMAS; vuelta++) {
      const respuesta = await claude.beta.messages.create({
        model: MODELO,
        max_tokens: 8000,
        ...RESPALDO,
        output_config: { effort: 'low' },
        system: sistema,
        tools: [...HERRAMIENTAS, ...ACCIONES],
        messages: mensajes,
      });

      if (respuesta.stop_reason === 'refusal') return responder({ respuesta: 'Perdón, con eso no te puedo ayudar.', restantes, acciones: [] });
      if (respuesta.stop_reason !== 'tool_use') {
        const texto = textoDe(respuesta) ?? (acciones.length > 0 ? 'Te lo dejo listo para confirmar 👇' : 'No supe qué responder. ¿Me lo preguntás de otra forma?');
        return responder({ respuesta: texto, restantes, acciones });
      }

      // Claude pidió datos: corremos las herramientas y le devolvemos todos los resultados juntos
      mensajes.push({ role: 'assistant', content: respuesta.content });
      const pedidos = respuesta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = await Promise.all(
        pedidos.map(async (herramienta) => {
          // Las acciones no se ejecutan acá: se juntan para que el usuario las confirme en la app
          if (NOMBRES_ACCIONES.has(herramienta.name)) {
            acciones.push({ ...(herramienta.input as Record<string, unknown>), tipo: herramienta.name });
            return { type: 'tool_result', tool_use_id: herramienta.id, content: 'Listo: le mostré la propuesta al usuario para que la confirme. Todavía no está hecha.' };
          }
          try {
            return { type: 'tool_result', tool_use_id: herramienta.id, content: JSON.stringify(await ejecutar(sesion.cliente, herramienta)) };
          } catch (e) {
            return { type: 'tool_result', tool_use_id: herramienta.id, content: `Error: ${(e as Error).message}`, is_error: true };
          }
        })
      );
      mensajes.push({ role: 'user', content: resultados });
    }
    return responder({ respuesta: 'Me enredé buscando los datos. ¿Me lo preguntás de forma más concreta?', restantes, acciones });
  } catch (error) {
    return errorDeClaude(error, 'El asistente');
  }
});
