import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import type { Categoria } from './tipos';

// Escáner: foto del ticket, factura o captura del comprobante → la IA la lee → gasto listo para guardar.

export type Comprobante = {
  tipo: 'compra' | 'factura_servicio' | 'transferencia' | 'otro';
  descripcion: string;
  monto: number | null;
  moneda: 'ARS' | 'USD';
  fecha: string | null;
  cuotas: number;
  categoria: Categoria;
  /** Solo facturas de servicio */
  vencimiento: string | null;
};

type Foto = { uri: string; file?: File };

// Abre la cámara o la galería. Devuelve null si la persona canceló o no dio permiso.
export async function elegirFoto(origen: 'camara' | 'galeria'): Promise<Foto | null> {
  if (origen === 'camara' && Platform.OS !== 'web') {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) throw new Error('Necesito permiso para usar la cámara. Activalo en la configuración del celular.');
  }
  const opciones: ImagePicker.ImagePickerOptions = { mediaTypes: 'images', quality: 0.8 };
  const resultado = origen === 'camara' ? await ImagePicker.launchCameraAsync(opciones) : await ImagePicker.launchImageLibraryAsync(opciones);
  if (resultado.canceled || !resultado.assets[0]) return null;
  const { uri, file } = resultado.assets[0];
  return { uri, file };
}

// Achica la foto y la pasa a JPEG: sube más rápido y la IA la lee igual de bien
async function prepararFoto(foto: Foto): Promise<Foto> {
  if (Platform.OS === 'web' && foto.file) return foto;
  const contexto = ImageManipulator.manipulate(foto.uri);
  contexto.resize({ width: 1600, height: null });
  const imagen = await contexto.renderAsync();
  const resultado = await imagen.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return { uri: resultado.uri };
}

const EJEMPLO: Comprobante = {
  tipo: 'compra',
  descripcion: 'Supermercado Día',
  monto: 23_450,
  moneda: 'ARS',
  fecha: null,
  cuotas: 1,
  categoria: 'Supermercado',
  vencimiento: null,
};

export async function leerComprobante(foto: Foto, esDemo: boolean): Promise<Comprobante> {
  if (esDemo) {
    await new Promise((r) => setTimeout(r, 1200));
    return EJEMPLO;
  }
  const lista = await prepararFoto(foto);
  const formulario = new FormData();
  if (lista.file) formulario.append('archivo', lista.file);
  // En el celular, React Native sube el archivo a partir de su uri
  else formulario.append('archivo', { uri: lista.uri, name: 'comprobante.jpg', type: 'image/jpeg' } as unknown as Blob);

  const { data, error } = await supabase.functions.invoke('leer-comprobante', { body: formulario });
  if (error) {
    const estado = (error as { context?: { status?: number } }).context?.status;
    if (estado === 404) throw new Error('El escáner todavía no está activado.');
    let detalle: string | undefined;
    try {
      detalle = (await (error as { context?: Response }).context?.json())?.error;
    } catch {
      detalle = undefined;
    }
    throw new Error(detalle ?? 'No pude leer la foto. Probá de nuevo en un rato.');
  }
  return data.comprobante as Comprobante;
}
