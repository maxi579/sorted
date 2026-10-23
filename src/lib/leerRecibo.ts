import type { ReciboLeido } from './sueldos';
import { supabase } from './supabase';

export type ArchivoRecibo = { uri: string; name: string; mimeType?: string | null; file?: File };

/** Manda el recibo a la IA. En el modo demo devuelve uno de ejemplo. */
export async function leerRecibo(archivo: ArchivoRecibo, esDemo: boolean): Promise<ReciboLeido> {
  if (esDemo) {
    await new Promise((r) => setTimeout(r, 1200));
    const hoy = new Date();
    const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`;
    return { periodo, desde: null, hasta: null, empleador: 'Empresa de ejemplo', bruto: 2_050_000, neto: 1_620_000, moneda: 'ARS', tipo: 'sueldo' };
  }
  const formulario = new FormData();
  if (archivo.file) formulario.append('archivo', archivo.file);
  // En el celular, React Native sube el archivo a partir de su uri
  else formulario.append('archivo', { uri: archivo.uri, name: archivo.name, type: archivo.mimeType ?? 'application/pdf' } as unknown as Blob);

  const { data, error } = await supabase.functions.invoke('leer-recibo', { body: formulario });
  if (error) {
    const estado = (error as { context?: { status?: number } }).context?.status;
    if (estado === 404) throw new Error('La lectura de recibos todavía no está activada.');
    let detalle: string | undefined;
    try {
      detalle = (await (error as { context?: Response }).context?.json())?.error;
    } catch {
      detalle = undefined;
    }
    throw new Error(detalle ?? 'No pude leer el recibo. Probá de nuevo en un rato.');
  }
  return data.recibo as ReciboLeido;
}
