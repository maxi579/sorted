import { accionesValidas, describirAccion, type Accion, type AccionPropuesta } from './accionesIA';
import { interpretarGasto } from './interpretarGasto';
import { supabase } from './supabase';
import type { MedioPago } from './tipos';

export type MensajeChat = { role: 'user' | 'assistant'; content: string; acciones?: AccionPropuesta[] };

const RESPUESTA_DEMO =
  'En el modo de prueba no me puedo conectar con la IA 🙂 Igual probá pedirme que anote un gasto, por ejemplo "anotame un café de 3500 con mercado pago". Con tu cuenta te respondo cualquier pregunta con tus datos reales.';

// Lo que se le manda al servidor: el texto, y si el asistente había propuesto acciones, qué pasó con cada una
function paraElServidor(historial: MensajeChat[]) {
  return historial.map(({ role, content, acciones }) => {
    if (!acciones?.length) return { role, content };
    const estados = acciones.map(({ accion, estado }) => {
      const { titulo, detalle } = describirAccion(accion);
      const resultado = estado === 'hecha' ? 'confirmada y hecha' : estado === 'cancelada' ? 'cancelada' : 'sin confirmar todavía';
      return `${titulo} (${detalle}): ${resultado}`;
    });
    return { role, content: `${content}\n[Acciones propuestas: ${estados.join('; ')}]` };
  });
}

// Modo demo: sin IA. Si el mensaje describe un gasto ("café 3500 con mp"), lo propone igual que el asistente real.
function respuestaDemo(texto: string, medios: MedioPago[]): { respuesta: string; acciones: Accion[] } {
  const interpretado = interpretarGasto(texto.replace(/^(anot[aá]me|anot[aá]|pon[eé]|agreg[aá])\s+(un|una)?\s*/i, ''), medios);
  if (interpretado.monto && interpretado.monto > 0) {
    const medio = medios.find((m) => m.id === interpretado.medioId);
    return {
      respuesta: 'Te lo dejo listo para confirmar 👇',
      acciones: [
        {
          tipo: 'anotar_gasto',
          descripcion: interpretado.descripcion,
          monto: interpretado.monto,
          moneda: interpretado.moneda,
          cuotas: interpretado.cuotas,
          medio: medio?.nombre ?? '',
          categoria: interpretado.categoria,
          fecha: '',
        },
      ],
    };
  }
  return { respuesta: RESPUESTA_DEMO, acciones: [] };
}

// Manda la conversación a la función del servidor. Devuelve la respuesta, las acciones propuestas y cuántos mensajes quedan hoy.
export async function preguntarIA(
  historial: MensajeChat[],
  esDemo: boolean,
  medios: MedioPago[] = []
): Promise<{ respuesta: string; acciones: Accion[]; restantes: number | null }> {
  if (esDemo) {
    await new Promise((r) => setTimeout(r, 700));
    const ultimo = historial[historial.length - 1]?.content ?? '';
    return { ...respuestaDemo(ultimo, medios), restantes: null };
  }
  const { data, error } = await supabase.functions.invoke('asistente-ia', { body: { mensajes: paraElServidor(historial) } });
  if (error) {
    const estado = (error as { context?: { status?: number } }).context?.status;
    if (estado === 404) throw new Error('El asistente con IA todavía no está activado.');
    let detalle: string | undefined;
    try {
      detalle = (await (error as { context?: Response }).context?.json())?.error;
    } catch {
      detalle = undefined;
    }
    throw new Error(detalle ?? 'No me pude conectar. Probá de nuevo en un rato.');
  }
  return {
    respuesta: String(data.respuesta ?? ''),
    acciones: accionesValidas(data.acciones),
    restantes: typeof data.restantes === 'number' ? data.restantes : null,
  };
}
