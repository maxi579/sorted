import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { leerBancos, type BancoPlazoFijo } from './rendimientos';

// Tasas de plazo fijo de cada banco, publicadas por el BCRA (vía ArgentinaDatos).
// Se guardan en el celular unas horas, igual que el dólar y la inflación.

const CLAVE = 'tasas-plazo-fijo-v1';
const VIGENCIA_MS = 6 * 60 * 60 * 1000;

type Guardado = { bancos: BancoPlazoFijo[]; actualizado: number };

async function descargar(): Promise<BancoPlazoFijo[]> {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), 8000);
  try {
    const respuesta = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo', { signal: control.signal });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return leerBancos(await respuesta.json());
  } finally {
    clearTimeout(temporizador);
  }
}

export async function obtenerTasas(): Promise<Guardado | null> {
  let guardado: Guardado | null = null;
  try {
    const texto = await AsyncStorage.getItem(CLAVE);
    guardado = texto ? JSON.parse(texto) : null;
  } catch {
    guardado = null;
  }
  if (guardado && Date.now() - guardado.actualizado < VIGENCIA_MS) return guardado;
  try {
    const bancos = await descargar();
    if (bancos.length === 0) return guardado;
    const nuevo = { bancos, actualizado: Date.now() };
    AsyncStorage.setItem(CLAVE, JSON.stringify(nuevo)).catch(() => {});
    return nuevo;
  } catch {
    // Sin internet: lo último que se descargó, aunque sea viejo
    return guardado;
  }
}

// En las pantallas: const { bancos, cargando } = useTasas();
export function useTasas() {
  const [estado, setEstado] = useState<{ bancos: BancoPlazoFijo[]; actualizado: number | null; cargando: boolean }>({
    bancos: [],
    actualizado: null,
    cargando: true,
  });
  useEffect(() => {
    let activo = true;
    obtenerTasas().then((r) => activo && setEstado({ bancos: r?.bancos ?? [], actualizado: r?.actualizado ?? null, cargando: false }));
    return () => {
      activo = false;
    };
  }, []);
  return estado;
}
