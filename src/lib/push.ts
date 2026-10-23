import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { FuenteDatos } from './datos';

// Registra el celular para recibir el aviso "Pagaste $8.500 en Café X, ¿lo anotamos?"
// cuando llega un mail reenviado. Necesita la app compilada con EAS (projectId) y que el usuario
// ya haya dado permiso de notificaciones (no lo pedimos acá para no molestar al abrir la app).
let registrado = false;

export async function registrarPush(datos: FuenteDatos) {
  if (registrado || datos.esDemo || Platform.OS === 'web') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return;
  try {
    if (!(await Notifications.getPermissionsAsync()).granted) return;
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    await datos.guardarPushToken(data);
    registrado = true;
  } catch {
    // Expo Go en Android no soporta avisos remotos: sin problema, los pagos igual aparecen al abrir la app
  }
}
