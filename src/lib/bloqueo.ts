import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

// Bloqueo con Face ID / huella al abrir la app.
// En el celular usa la biometría del sistema (si falla, deja usar el PIN del celular).
// En la web (por ejemplo instalada en el iPhone) usa una llave de acceso del dispositivo: el navegador pide
// Face ID o huella y nunca nos llega nada biométrico, solo un "sí, es la persona".
// Es una traba para que nadie abra la app con tu celular en la mano: tu cuenta sigue protegida por el login de Google.

const CLAVE = 'bloqueo-biometrico';

type Guardado = { activo: boolean; credencial?: string };

export type Biometria = { disponible: boolean; nombre: string; icono: 'scan' | 'finger-print' | 'lock-closed' };

// Las versiones viejas de la app instalada no traen el módulo: ahí no ofrecemos el bloqueo
const moduloNativo = Platform.OS !== 'web' && requireOptionalNativeModule('ExpoLocalAuthentication') !== null;

function nativo() {
  // Se carga recién acá para que la app no se rompa si el módulo no está
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-local-authentication') as typeof import('expo-local-authentication');
}

const NO_DISPONIBLE: Biometria = { disponible: false, nombre: 'Face ID o huella', icono: 'lock-closed' };

export async function biometriaDisponible(): Promise<Biometria> {
  try {
    if (Platform.OS === 'web') {
      const ok =
        typeof window !== 'undefined' &&
        'PublicKeyCredential' in window &&
        (await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
      if (!ok) return NO_DISPONIBLE;
      const apple = /iPhone|iPad|Macintosh/.test(navigator.userAgent);
      return { disponible: true, nombre: apple ? 'Face ID o Touch ID' : 'huella o rostro', icono: apple ? 'scan' : 'finger-print' };
    }
    if (!moduloNativo) return NO_DISPONIBLE;
    const auth = nativo();
    const [hardware, configurada, tipos] = await Promise.all([auth.hasHardwareAsync(), auth.isEnrolledAsync(), auth.supportedAuthenticationTypesAsync()]);
    if (!hardware || !configurada) return NO_DISPONIBLE;
    const cara = tipos.includes(auth.AuthenticationType.FACIAL_RECOGNITION);
    if (Platform.OS === 'ios') return cara ? { disponible: true, nombre: 'Face ID', icono: 'scan' } : { disponible: true, nombre: 'Touch ID', icono: 'finger-print' };
    return { disponible: true, nombre: tipos.includes(auth.AuthenticationType.FINGERPRINT) ? 'huella' : 'rostro', icono: 'finger-print' };
  } catch {
    return NO_DISPONIBLE;
  }
}

// Copia en memoria: en la web, Face ID tiene que pedirse en el mismo toque, sin esperar a leer el almacenamiento
let enMemoria: Guardado | null = null;

async function leer(): Promise<Guardado> {
  try {
    enMemoria = JSON.parse((await AsyncStorage.getItem(CLAVE)) ?? '{"activo":false}') as Guardado;
  } catch {
    enMemoria = { activo: false };
  }
  return enMemoria;
}

async function guardar(valor: Guardado) {
  enMemoria = valor;
  await AsyncStorage.setItem(CLAVE, JSON.stringify(valor));
}

export async function bloqueoActivado() {
  return (await leer()).activo;
}

// ---------- Web: llave de acceso del dispositivo (WebAuthn) ----------

const aleatorio = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const aTexto = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)));
const aBytes = (t: string) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));

async function crearLlaveWeb(): Promise<string> {
  const credencial = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Sorted' },
      user: { id: aleatorio(16), name: 'Bloqueo de Sorted', displayName: 'Bloqueo de Sorted' },
      challenge: aleatorio(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!credencial) throw new Error('No se pudo activar.');
  return aTexto(credencial.rawId);
}

async function verificarWeb(credencial: string) {
  const ok = await navigator.credentials.get({
    publicKey: {
      challenge: aleatorio(32),
      allowCredentials: [{ type: 'public-key', id: aBytes(credencial) }],
      userVerification: 'required',
      timeout: 60_000,
    },
  });
  return ok !== null;
}

// ---------- Lo que usa la app ----------

/** Pide Face ID / huella. Devuelve true si es la persona. */
export async function desbloquear(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      const { credencial } = enMemoria ?? (await leer());
      return credencial ? await verificarWeb(credencial) : false;
    }
    if (!moduloNativo) return true;
    const resultado = await nativo().authenticateAsync({ promptMessage: 'Desbloqueá Sorted', cancelLabel: 'Cancelar' });
    return resultado.success;
  } catch {
    return false;
  }
}

/** Lo prende pidiendo Face ID / huella una vez, para confirmar que anda. Tira un error entendible si no se pudo. */
export async function activarBloqueo() {
  if (Platform.OS === 'web') {
    let credencial: string;
    try {
      credencial = await crearLlaveWeb();
    } catch {
      throw new Error('No se pudo activar. Probá de nuevo.');
    }
    await guardar({ activo: true, credencial });
    return;
  }
  if (!(await desbloquear())) throw new Error('No se pudo verificar que seas vos.');
  await guardar({ activo: true });
}

export async function desactivarBloqueo() {
  enMemoria = { activo: false };
  await AsyncStorage.removeItem(CLAVE).catch(() => {});
}

/** Cuánto tiempo puede estar la app en segundo plano sin volver a pedir Face ID */
export const MARGEN_SEGUNDO_PLANO_MS = 60_000;
