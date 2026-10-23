import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import type { MesInflacion } from './activos';
import { MESES } from './finanzas';

// Dólar tarjeta e inflación, traídos de APIs públicas gratuitas.
// Se guardan en el celular: la app abre al instante y funciona sin internet.

export type Indicadores = {
  /** Dólar tarjeta (precio de venta), o null si nunca se pudo descargar */
  dolarTarjeta: number | null;
  /** Dólar blue (precio de compra): lo que te dan por tus dólares */
  dolarBlue: number | null;
  /** Inflación mensual estimada como fracción (0.02 = 2%): promedio de los últimos 3 meses */
  inflacionMensual: number;
  /** Último dato publicado por el INDEC, en % */
  ultimaInflacion: { mes: string; valor: number } | null;
  /** Inflación de cada mes de los últimos 3 años, para calcular rendimientos reales */
  serieInflacion: MesInflacion[];
  /** Cuándo se descargaron por última vez (ms), o null si son valores por defecto */
  actualizado: number | null;
};

// v2: se agregaron el dólar blue y la serie de inflación (los datos de v1 no los tienen)
const CLAVE = 'indicadores-v2';
const VIGENCIA_MS = 6 * 60 * 60 * 1000;
const POR_DEFECTO: Indicadores = {
  dolarTarjeta: null,
  dolarBlue: null,
  inflacionMensual: 0.02,
  ultimaInflacion: null,
  serieInflacion: [],
  actualizado: null,
};

let enMemoria: Indicadores | null = null;
let descargaEnCurso: Promise<Indicadores> | null = null;

async function pedirJson(url: string) {
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(), 8000);
  try {
    const respuesta = await fetch(url, { signal: control.signal });
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
    return await respuesta.json();
  } finally {
    clearTimeout(temporizador);
  }
}

async function descargar(anteriores: Indicadores): Promise<Indicadores> {
  const [dolar, blue, inflacion] = await Promise.allSettled([
    pedirJson('https://dolarapi.com/v1/dolares/tarjeta'),
    pedirJson('https://dolarapi.com/v1/dolares/blue'),
    pedirJson('https://api.argentinadatos.com/v1/finanzas/indices/inflacion'),
  ]);
  // Lo guardado con una versión anterior de la app puede no tener todos los campos
  const nuevos = { ...POR_DEFECTO, ...anteriores };
  let algunoNuevo = false;

  if (dolar.status === 'fulfilled' && Number(dolar.value?.venta) > 0) {
    nuevos.dolarTarjeta = Number(dolar.value.venta);
    algunoNuevo = true;
  }
  if (blue.status === 'fulfilled' && Number(blue.value?.compra) > 0) {
    nuevos.dolarBlue = Number(blue.value.compra);
    algunoNuevo = true;
  }
  if (inflacion.status === 'fulfilled' && Array.isArray(inflacion.value) && inflacion.value.length >= 3) {
    const ultimos: { fecha: string; valor: number }[] = inflacion.value.slice(-3);
    nuevos.inflacionMensual = ultimos.reduce((suma, m) => suma + Number(m.valor), 0) / 3 / 100;
    const ultimo = ultimos[ultimos.length - 1];
    nuevos.ultimaInflacion = { mes: ultimo.fecha, valor: Number(ultimo.valor) };
    nuevos.serieInflacion = inflacion.value.slice(-36).map((m: MesInflacion) => ({ fecha: m.fecha, valor: Number(m.valor) }));
    algunoNuevo = true;
  }
  if (!algunoNuevo) throw new Error('Sin conexión');
  nuevos.actualizado = Date.now();
  return nuevos;
}

export async function obtenerIndicadores(): Promise<Indicadores> {
  if (enMemoria?.actualizado && Date.now() - enMemoria.actualizado < VIGENCIA_MS) return enMemoria;
  if (descargaEnCurso) return descargaEnCurso;

  descargaEnCurso = (async () => {
    let guardados = enMemoria;
    if (!guardados) {
      try {
        const texto = await AsyncStorage.getItem(CLAVE);
        guardados = texto ? JSON.parse(texto) : null;
      } catch {
        guardados = null;
      }
    }
    if (guardados) guardados = { ...POR_DEFECTO, ...guardados };
    if (guardados?.actualizado && Date.now() - guardados.actualizado < VIGENCIA_MS) return guardados;

    try {
      const nuevos = await descargar(guardados ?? POR_DEFECTO);
      AsyncStorage.setItem(CLAVE, JSON.stringify(nuevos)).catch(() => {});
      return nuevos;
    } catch {
      return guardados ?? POR_DEFECTO;
    }
  })();

  try {
    enMemoria = await descargaEnCurso;
    return enMemoria;
  } finally {
    descargaEnCurso = null;
  }
}

// En las pantallas: const indicadores = useIndicadores();
export function useIndicadores() {
  const [indicadores, setIndicadores] = useState<Indicadores>(enMemoria ?? POR_DEFECTO);
  useEffect(() => {
    let activo = true;
    obtenerIndicadores().then((nuevos) => activo && setIndicadores(nuevos));
    return () => {
      activo = false;
    };
  }, []);
  return indicadores;
}

// '2026-08-31' → 'agosto'
export function mesDeInflacion(fecha: string) {
  return MESES[Number(fecha.slice(5, 7)) - 1];
}
