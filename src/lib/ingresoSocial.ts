import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Entrar con Google (celular y web) y con Apple (solo iPhone).
//
// Google: Supabase arma la dirección de Google; la abrimos en una ventana segura del sistema y,
// al terminar, Google vuelve a la app con la sesión en el link (sorted://#access_token=...).
// Apple: el iPhone muestra su propia hoja de "Iniciar sesión con Apple" y le pasamos el token a Supabase.

// En la web, si la ventana de Google se abrió como popup, esto la cierra al volver
// (no corre cuando la página se arma en el servidor, donde no hay window)
if (typeof window !== 'undefined') WebBrowser.maybeCompleteAuthSession();

const CLAVE_PEDIDO = 'ingreso-google-pedido';
const VIGENCIA_PEDIDO_MS = 10 * 60 * 1000;

// sorted:// en la app instalada, exp://.../--/ en Expo Go.
// En la web, la carpeta donde está publicada (https://maxi579.github.io/sorted/app/): Linking.createURL('/')
// devuelve solo el dominio, sin la carpeta, y Supabase no la acepta (manda a la dirección por defecto).
const direccionDeVuelta = () => (Platform.OS === 'web' ? new URL('./', window.location.href).href : Linking.createURL('/'));

export class IngresoCancelado extends Error {}

// Solo aceptamos una sesión que viene en un link si la app la pidió hace poco:
// así nadie puede meterte en otra cuenta mandándote un link armado.
async function marcarPedido() {
  const ahora = String(Date.now());
  if (Platform.OS === 'web') window.sessionStorage?.setItem(CLAVE_PEDIDO, ahora);
  else await AsyncStorage.setItem(CLAVE_PEDIDO, ahora);
}

async function consumirPedido() {
  let valor: string | null = null;
  if (Platform.OS === 'web') {
    valor = window.sessionStorage?.getItem(CLAVE_PEDIDO) ?? null;
    window.sessionStorage?.removeItem(CLAVE_PEDIDO);
  } else {
    valor = await AsyncStorage.getItem(CLAVE_PEDIDO);
    await AsyncStorage.removeItem(CLAVE_PEDIDO);
  }
  return valor !== null && Date.now() - Number(valor) < VIGENCIA_PEDIDO_MS;
}

// Los datos vuelven después del # (o del ?): access_token, refresh_token o un error
function parametrosDe(url: string) {
  const parametros = new URLSearchParams();
  for (const parte of [url.split('#')[1], url.split('?')[1]?.split('#')[0]]) {
    if (!parte) continue;
    new URLSearchParams(parte).forEach((valor, clave) => parametros.set(clave, valor));
  }
  return parametros;
}

export function traeSesion(url: string | null | undefined) {
  if (!url) return false;
  const p = parametrosDe(url);
  return p.has('access_token') || p.has('error_description');
}

// Crea la sesión a partir del link con el que volvió Google. Devuelve true si entró.
export async function sesionDesdeLink(url: string) {
  if (!traeSesion(url) || !(await consumirPedido())) return false;
  const p = parametrosDe(url);
  const error = p.get('error_description');
  if (error) throw new Error(error.replace(/\+/g, ' '));
  const { error: errorSesion } = await supabase.auth.setSession({
    access_token: p.get('access_token')!,
    refresh_token: p.get('refresh_token') ?? '',
  });
  if (errorSesion) throw errorSesion;
  return true;
}

export async function ingresarConGoogle() {
  const vuelta = direccionDeVuelta();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    // Siempre deja elegir la cuenta (útil si en el celular hay más de una)
    options: { redirectTo: vuelta, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) throw new Error(error?.message ?? 'No se pudo abrir Google.');
  await marcarPedido();

  // En la web vamos directo a Google; al volver, el layout ve el link y crea la sesión
  if (Platform.OS === 'web') {
    window.location.assign(data.url);
    return;
  }
  const resultado = await WebBrowser.openAuthSessionAsync(data.url, vuelta);
  if (resultado.type !== 'success') throw new IngresoCancelado();
  if (!(await sesionDesdeLink(resultado.url))) throw new Error('Google no devolvió la sesión. Probá de nuevo.');
}

export async function appleDisponible() {
  return Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync());
}

export async function ingresarConApple() {
  let credencial: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credencial = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new IngresoCancelado();
    throw e;
  }
  if (!credencial.identityToken) throw new Error('Apple no devolvió los datos para entrar.');

  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credencial.identityToken });
  if (error) throw error;

  // Apple manda el nombre solo la primera vez: lo guardamos para el "Hola, Máximo"
  const nombre = [credencial.fullName?.givenName, credencial.fullName?.familyName].filter(Boolean).join(' ');
  if (nombre && data.user) {
    await supabase.auth.updateUser({ data: { nombre, full_name: nombre } }).catch(() => {});
    await supabase.from('perfiles').update({ nombre }).eq('id', data.user.id).is('nombre', null);
  }
}
