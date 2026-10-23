import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { formatearFecha, formatearMonto, proximoCierre } from './finanzas';
import { mesDe, vencimientoDelMes } from './fijos';
import type { Fijo, MedioPago, PagoFijo } from './tipos';

// Avisos con notificaciones locales (las programa el mismo celular): no necesitan servidor y funcionan en Expo Go.
// - Cierre: un día antes del cierre de cada tarjeta, a las 10.
// - Resumen del domingo: lo gastado en la semana y lo que queda del mes (mismo interruptor que el cierre).
// - Vencimiento: un día antes de que venza cada gasto fijo que no se debita solo (mismo interruptor que el cierre).
// - Recordatorio: a la noche, solo los días en que no anotaste ningún gasto.
// - Billetera: todos los días o los domingos, para contar la plata y descubrir lo que se gastó sin anotar.

const CLAVES = { cierres: 'avisos-cierre-activados', recordatorio: 'recordatorio-activado', efectivo: 'recordatorio-efectivo' };
const MESES_DE_VENCIMIENTOS = 2;
const CANAL = 'avisos';
const MESES_DE_CIERRES = 3;
const DIAS_DE_RECORDATORIOS = 14;
const HORA_RECORDATORIO = 21;

export const avisosDisponibles = Platform.OS !== 'web';

let configurado = false;
function configurar() {
  if (configurado || !avisosDisponibles) return;
  configurado = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

// Pide permiso una sola vez. En Android 13+ el pedido no aparece hasta que exista un canal.
async function pedirPermiso() {
  configurar();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CANAL, { name: 'Avisos', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const actual = await Notifications.getPermissionsAsync();
  if (actual.granted) return true;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function estaActivado(clave: string) {
  if (!avisosDisponibles) return false;
  return (await AsyncStorage.getItem(clave)) === 'si';
}

// Borra solo los avisos de un tipo (cada aviso tiene un id que empieza con su tipo)
async function cancelarTipo(prefijo: string) {
  const programados = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    programados.filter((n) => n.identifier.startsWith(prefijo)).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
  );
}

// ---------- Cierre de tarjetas ----------

export const avisosActivados = () => estaActivado(CLAVES.cierres);

// Devuelve false si el usuario no dio permiso
export async function activarAvisos(medios: MedioPago[]) {
  if (!avisosDisponibles || !(await pedirPermiso())) return false;
  await AsyncStorage.setItem(CLAVES.cierres, 'si');
  await programarAvisosCierre(medios);
  return true;
}

export async function desactivarAvisos() {
  if (!avisosDisponibles) return;
  await AsyncStorage.setItem(CLAVES.cierres, 'no');
  await cancelarTipo('cierre-');
  await cancelarTipo('vence-');
}

// Reprograma los avisos de los próximos meses. Se llama cada vez que cambian las tarjetas.
export async function programarAvisosCierre(medios: MedioPago[]) {
  if (!(await avisosActivados())) return;
  configurar();
  await cancelarTipo('cierre-');

  const ahora = new Date();
  for (const medio of medios) {
    let referencia = new Date();
    for (let i = 0; i < MESES_DE_CIERRES; i++) {
      const cierre = proximoCierre(medio, referencia);
      if (!cierre) break;
      const aviso = new Date(cierre.getFullYear(), cierre.getMonth(), cierre.getDate() - 1, 10, 0);
      if (aviso > ahora) {
        await Notifications.scheduleNotificationAsync({
          identifier: `cierre-${medio.id}-${formatearFecha(cierre)}`,
          content: {
            title: `Mañana cierra tu ${medio.nombre} 💳`,
            body: 'Si podés esperar a pasado mañana para comprar con esta tarjeta, la pagás un mes más tarde.',
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: aviso, channelId: CANAL },
        });
      }
      referencia = new Date(cierre.getFullYear(), cierre.getMonth(), cierre.getDate() + 1);
    }
  }
}

// ---------- Vencimiento de gastos fijos ----------

// Reprograma los avisos de vencimiento de este mes y el que viene, salteando lo que ya está pagado.
export async function programarAvisosVencimiento(fijos: Fijo[], pagos: PagoFijo[]) {
  if (!(await avisosActivados())) return;
  configurar();
  await cancelarTipo('vence-');

  const ahora = new Date();
  for (const fijo of fijos) {
    if (!fijo.activo || fijo.debito_automatico) continue;
    for (let i = 0; i < MESES_DE_VENCIMIENTOS; i++) {
      const vence = vencimientoDelMes(fijo.dia, new Date(ahora.getFullYear(), ahora.getMonth() + i, 1));
      if (pagos.some((p) => p.fijo_id === fijo.id && p.mes === mesDe(vence))) continue;
      const aviso = new Date(vence.getFullYear(), vence.getMonth(), vence.getDate() - 1, 10, 0);
      if (aviso <= ahora) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `vence-${fijo.id}-${formatearFecha(vence)}`,
        content: {
          title: `Mañana vence ${fijo.descripcion} 🧾`,
          body: fijo.monto ? `Son ${formatearMonto(fijo.monto, fijo.moneda)}. Cuando lo pagues, marcalo en Fijos.` : 'Cargá el monto de la factura y marcalo como pagado.',
          data: { url: '/fijos' },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: aviso, channelId: CANAL },
      });
    }
  }
}

// ---------- Resumen del domingo ----------

// Domingo a las 19 h: "Esta semana gastaste $X. Te quedan $Y para el mes".
// Los números se calculan al abrir la app, así que se reprograma cada vez que se abre (mismo interruptor que el cierre).
export async function programarResumenSemanal(gastadoSemana: number, quedanEnElMes: number | null) {
  if (!(await avisosActivados())) return;
  configurar();
  await cancelarTipo('resumen-');
  const ahora = new Date();
  const domingo = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + ((7 - ahora.getDay()) % 7), 19, 0);
  if (domingo <= ahora) domingo.setDate(domingo.getDate() + 7);
  const resto = quedanEnElMes === null ? '' : ` Te quedan ${formatearMonto(Math.round(Math.max(quedanEnElMes, 0)))} para el mes.`;
  await Notifications.scheduleNotificationAsync({
    identifier: `resumen-${formatearFecha(domingo)}`,
    content: {
      title: 'Tu semana en un vistazo 📊',
      body: `En los últimos 7 días gastaste ${formatearMonto(Math.round(gastadoSemana))}.${resto}`,
      data: { url: '/' },
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: domingo, channelId: CANAL },
  });
}

// ---------- Contar la billetera ----------

export type FrecuenciaEfectivo = 'diario' | 'semanal';
const CLAVE_FRECUENCIA = 'recordatorio-efectivo-frecuencia';

export const recordatorioEfectivoActivado = () => estaActivado(CLAVES.efectivo);

export async function frecuenciaEfectivo(): Promise<FrecuenciaEfectivo> {
  return (await AsyncStorage.getItem(CLAVE_FRECUENCIA)) === 'diario' ? 'diario' : 'semanal';
}

// Todos los días a las 21 h, o los domingos a las 20 h
export async function activarRecordatorioEfectivo(frecuencia: FrecuenciaEfectivo) {
  if (!avisosDisponibles || !(await pedirPermiso())) return false;
  await AsyncStorage.multiSet([
    [CLAVES.efectivo, 'si'],
    [CLAVE_FRECUENCIA, frecuencia],
  ]);
  await cancelarTipo('efectivo-');
  await Notifications.scheduleNotificationAsync({
    identifier: `efectivo-${frecuencia}`,
    content: {
      title: '¿Cuánta plata tenés en la billetera? 💵',
      body: 'Contala en 10 segundos y te digo cuánto gastaste en efectivo, aunque no te acuerdes en qué.',
      data: { url: '/efectivo?contar=si' },
    },
    trigger:
      frecuencia === 'diario'
        ? { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 21, minute: 0, channelId: CANAL }
        : // 1 = domingo
          { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 1, hour: 20, minute: 0, channelId: CANAL },
  });
  return true;
}

export async function desactivarRecordatorioEfectivo() {
  if (!avisosDisponibles) return;
  await AsyncStorage.setItem(CLAVES.efectivo, 'no');
  await cancelarTipo('efectivo-');
}

// ---------- Recordatorio de la noche ----------

export const recordatorioActivado = () => estaActivado(CLAVES.recordatorio);

export async function activarRecordatorio(anotoHoy: boolean) {
  if (!avisosDisponibles || !(await pedirPermiso())) return false;
  await AsyncStorage.setItem(CLAVES.recordatorio, 'si');
  await programarRecordatorios(anotoHoy);
  return true;
}

export async function desactivarRecordatorio() {
  if (!avisosDisponibles) return;
  await AsyncStorage.setItem(CLAVES.recordatorio, 'no');
  await cancelarTipo('recordatorio-');
}

// Programa un recordatorio por noche para las próximas dos semanas, salteando hoy si ya anotó algo.
// Se llama al abrir la app y cada vez que se anota un gasto.
export async function programarRecordatorios(anotoHoy: boolean) {
  if (!(await recordatorioActivado())) return;
  configurar();
  await cancelarTipo('recordatorio-');

  const ahora = new Date();
  for (let dia = 0; dia < DIAS_DE_RECORDATORIOS; dia++) {
    if (dia === 0 && anotoHoy) continue;
    const cuando = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + dia, HORA_RECORDATORIO, 0);
    if (cuando <= ahora) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: `recordatorio-${formatearFecha(cuando)}`,
      content: {
        title: '¿Gastaste algo hoy? 📝',
        body: 'Anotalo en 10 segundos así no se te escapa nada.',
        data: { url: '/cargar' },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: cuando, channelId: CANAL },
    });
  }
}

let toqueInicialAtendido = false;

// Al tocar una notificación que trae una pantalla (data.url), abre esa pantalla.
// Devuelve una función para dejar de escuchar.
export function escucharToques(abrir: (url: string) => void) {
  if (!avisosDisponibles) return () => {};
  // La notificación que abrió la app se atiende una sola vez
  if (!toqueInicialAtendido) {
    toqueInicialAtendido = true;
    const url = Notifications.getLastNotificationResponse()?.notification.request.content.data?.url;
    if (typeof url === 'string') abrir(url);
  }
  const suscripcion = Notifications.addNotificationResponseReceivedListener((respuesta) => {
    const destino = respuesta.notification.request.content.data?.url;
    if (typeof destino === 'string') abrir(destino);
  });
  return () => suscripcion.remove();
}
