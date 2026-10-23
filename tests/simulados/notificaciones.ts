// Reemplaza a expo-notifications en los tests: en vez de programar notificaciones de verdad, las anota en memoria.
// Los tests importan este mismo archivo para ver qué quedó programado, cambiar los permisos o "tocar" una notificación.
// Los valores de los tipos de disparador son los de expo-notifications ~57 (node_modules/expo-notifications/build/Notifications.types.d.ts).

export const AndroidImportance = { DEFAULT: 5 } as const;
export const SchedulableTriggerInputTypes = { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly' } as const;

export type Pedido = {
  identifier: string;
  content: { title: string; body: string; data?: { url?: string } };
  trigger: { type: string; channelId?: string; date?: Date; hour?: number; minute?: number; weekday?: number };
};

export const estado = {
  programadas: new Map<string, Pedido>(),
  /** Lo que contesta getPermissionsAsync */
  permisoActual: false,
  /** Lo que contesta requestPermissionsAsync (lo que elige la persona en el cartel) */
  permisoAlPedir: true,
  /** Todo lo que se llamó, en orden */
  llamadas: [] as string[],
  canales: [] as string[],
  ultimaRespuesta: null as unknown,
  oyentes: new Set<(respuesta: unknown) => void>(),
};

export function reiniciarNotificaciones() {
  estado.programadas.clear();
  estado.permisoActual = false;
  estado.permisoAlPedir = true;
  estado.llamadas.length = 0;
  estado.canales.length = 0;
  estado.ultimaRespuesta = null;
  estado.oyentes.clear();
}

export const programadas = () => [...estado.programadas.values()];
export const cantidadDeLlamadas = (nombre: string) => estado.llamadas.filter((l) => l === nombre).length;

/** La persona toca una notificación que trae una pantalla: la oyen los listeners registrados */
export function tocarNotificacion(url: unknown) {
  const respuesta = { notification: { request: { content: { data: { url } } } } };
  for (const oyente of estado.oyentes) oyente(respuesta);
}

export function setNotificationHandler() {
  estado.llamadas.push('setNotificationHandler');
}

export async function setNotificationChannelAsync(id: string) {
  estado.llamadas.push('setNotificationChannelAsync');
  estado.canales.push(id);
}

export async function getPermissionsAsync() {
  estado.llamadas.push('getPermissionsAsync');
  return { granted: estado.permisoActual };
}

export async function requestPermissionsAsync() {
  estado.llamadas.push('requestPermissionsAsync');
  estado.permisoActual = estado.permisoAlPedir;
  return { granted: estado.permisoAlPedir };
}

// Igual que Expo: programar con un identificador que ya existe lo reemplaza
export async function scheduleNotificationAsync(pedido: Pedido) {
  estado.llamadas.push('scheduleNotificationAsync');
  estado.programadas.set(pedido.identifier, pedido);
  return pedido.identifier;
}

export async function getAllScheduledNotificationsAsync() {
  return programadas();
}

export async function cancelScheduledNotificationAsync(identificador: string) {
  estado.llamadas.push('cancelScheduledNotificationAsync');
  estado.programadas.delete(identificador);
}

export function getLastNotificationResponse() {
  return estado.ultimaRespuesta;
}

export function addNotificationResponseReceivedListener(oyente: (respuesta: unknown) => void) {
  estado.oyentes.add(oyente);
  return { remove: () => void estado.oyentes.delete(oyente) };
}
