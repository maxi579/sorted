import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { FuenteDatos } from './datos';
import { interpretarNotificacion, type NotificacionLeida } from './interpretarNotificacion';

// Puente con el módulo nativo de Android (modules/lector-notificaciones) que lee las notificaciones
// de billeteras y bancos. Solo existe en la app instalada en Android: en Expo Go, iPhone o la web
// el módulo no está y todo esto queda apagado sin romper nada.

type ModuloLector = {
  tienePermiso(): boolean;
  abrirAjustesDePermiso(): void;
  /** Devuelve las notificaciones guardadas en el celular (JSON) */
  leerPendientes(): string;
  /** Borra las notificaciones guardadas, una vez que se procesaron */
  borrarPendientes(): void;
};

const modulo = Platform.OS === 'android' ? requireOptionalNativeModule<ModuloLector>('LectorNotificaciones') : null;

export const lectorDisponible = modulo !== null;

export function lectorConPermiso() {
  return modulo?.tienePermiso() ?? false;
}

export function pedirPermisoLector() {
  modulo?.abrirAjustesDePermiso();
}

// Convierte lo que juntó el lector en sugerencias (gastos) o retiros de efectivo. Devuelve cuántos encontró.
export async function importarNotificaciones(datos: FuenteDatos) {
  if (!modulo || datos.esDemo || !modulo.tienePermiso()) return 0;
  let leidas: NotificacionLeida[] = [];
  try {
    leidas = JSON.parse(modulo.leerPendientes() || '[]');
  } catch {
    return 0;
  }

  if (leidas.length === 0) return 0;

  // Si una importación anterior se cortó a mitad de camino, no duplicamos lo que ya se cargó
  const [sugerencias, retiros] = await Promise.all([datos.sugerencias.listar(), datos.retiros.listar()]);
  const yaCargadas = new Set(sugerencias.map((s) => `${s.fecha}|${s.texto_original}`));
  const retirosCargados = new Set(retiros.map((r) => `${r.fecha}|${r.monto}`));
  let encontrados = 0;
  for (const notificacion of leidas) {
    const pago = interpretarNotificacion(notificacion);
    if (!pago || yaCargadas.has(`${pago.fecha}|${pago.original}`)) continue;
    if (pago.tipo === 'sueldo') {
      // El sueldo nuevo reemplaza al anterior (si cambió más de un 1%)
      const { sueldo } = await datos.perfil();
      if (!sueldo || Math.abs(pago.monto - sueldo) / sueldo > 0.01) await datos.guardarSueldo(pago.monto);
      encontrados++;
      continue;
    }
    if (pago.tipo === 'retiro') {
      if (retirosCargados.has(`${pago.fecha}|${pago.monto}`)) continue;
      await datos.retiros.crear({ monto: pago.monto, fecha: pago.fecha, nota: pago.fuente ? `Detectado en ${pago.fuente}` : 'Detectado' });
    } else {
      await datos.sugerencias.crear({
        origen: 'notificacion',
        descripcion: pago.descripcion,
        monto: pago.monto,
        moneda: pago.moneda,
        fecha: pago.fecha,
        fuente: pago.fuente,
        texto_original: pago.original,
        estado: 'pendiente',
      });
    }
    encontrados++;
  }
  // Recién ahora las borramos: si algo falló arriba, quedan para la próxima
  modulo.borrarPendientes();
  return encontrados;
}
