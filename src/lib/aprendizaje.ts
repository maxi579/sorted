import { normalizarDescripcion } from './fijos';
import type { Categoria, GastoGuardado } from './tipos';

// La app aprende de lo que la persona ya hizo: si "Farmacity" lo puso en Salud,
// la próxima vez que anote Farmacity va solo a Salud. No guarda nada aparte: mira el historial.

const PALABRAS_VACIAS = new Set(['con', 'para', 'por', 'del', 'las', 'los', 'una', 'uno', 'pago', 'compra', 'cuotas', 'cuota']);

function palabrasClave(texto: string) {
  return normalizarDescripcion(texto)
    .split(' ')
    .filter((p) => p.length >= 4 && !PALABRAS_VACIAS.has(p));
}

/**
 * La categoría que la persona usó la última vez para algo parecido, o null si nunca anotó algo así.
 * Primero busca la misma descripción; si no, un gasto que comparta una palabra importante ("super coto" ↔ "coto").
 * gastos: del más nuevo al más viejo.
 */
export function categoriaAprendida(descripcion: string, gastos: GastoGuardado[]): Categoria | null {
  const clave = normalizarDescripcion(descripcion);
  if (!clave) return null;

  const igual = gastos.find((g) => g.categoria && normalizarDescripcion(g.descripcion) === clave);
  if (igual) return igual.categoria as Categoria;

  const palabras = palabrasClave(descripcion);
  if (palabras.length === 0) return null;
  const parecido = gastos.find((g) => g.categoria && palabrasClave(g.descripcion).some((p) => palabras.includes(p)));
  return (parecido?.categoria as Categoria) ?? null;
}
