// Mientras escribís: "600000" → "600.000" y "1234,5" → "1.234,5" (coma para decimales)
export function formatearEntradaMonto(texto: string) {
  const limpio = texto.replace(/[^\d,]/g, '');
  const [entero, ...decimales] = limpio.split(',');
  const sinCerosAdelante = entero.replace(/^0+(?=\d)/, '');
  const conPuntos = sinCerosAdelante.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimales.length > 0 ? `${conPuntos},${decimales.join('').slice(0, 2)}` : conPuntos;
}

// Para guardar: "600.000" → 600000 y "1.234,5" → 1234.5
export function leerMonto(texto: string) {
  return Number(texto.replace(/\./g, '').replace(',', '.'));
}

// Para mostrar un número guardado en un campo: 600000 → "600.000"
export function montoATexto(valor: number) {
  return formatearEntradaMonto(String(valor).replace('.', ','));
}
// '2026-10-05' → '05/10/2026'
export function fechaParaMostrar(fecha: string) {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

// '5/10/2026' o '05/10/26' → '2026-10-05', o null si no es una fecha válida
export function leerFecha(texto: string): string | null {
  const partes = texto.trim().split(/[/.-]/).map(Number);
  if (partes.length !== 3 || partes.some((n) => !Number.isInteger(n))) return null;
  let [dia, mes, anio] = partes;
  if (anio < 100) anio += 2000;
  const fecha = new Date(anio, mes - 1, dia);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) return null;
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
