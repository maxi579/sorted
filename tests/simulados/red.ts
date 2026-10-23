// Reemplaza a fetch en los tests para que ninguno salga a internet.
// Cada URL tiene una respuesta preparada; las respuestas se pueden cambiar entre un pedido y otro.
import { mock } from 'node:test';

/** cuerpo: lo que devuelve el JSON · estado: código HTTP · Error: no hay conexión · 'colgada': nunca responde, solo corta si la abortan */
export type Respuesta = { cuerpo?: unknown; estado?: number } | Error | 'colgada';

export function simularRed(respuestas: Record<string, Respuesta>) {
  const pedidos: string[] = [];
  mock.method(globalThis, 'fetch', (url: string | URL, opciones?: { signal?: AbortSignal }) => {
    pedidos.push(String(url));
    const respuesta = respuestas[String(url)];
    if (!respuesta) return Promise.reject(new Error(`Pedido inesperado: ${url}`));
    if (respuesta instanceof Error) return Promise.reject(respuesta);
    if (respuesta === 'colgada') {
      return new Promise((_, rechazar) =>
        opciones?.signal?.addEventListener('abort', () => rechazar(new DOMException('The operation was aborted', 'AbortError')))
      );
    }
    return Promise.resolve(new Response(JSON.stringify(respuesta.cuerpo ?? null), { status: respuesta.estado ?? 200 }));
  });
  return { pedidos, respuestas };
}
