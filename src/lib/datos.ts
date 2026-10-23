import AsyncStorage from '@react-native-async-storage/async-storage';
import { nuevoId } from './ids';
import { supabase } from './supabase';
import type { Activo, Aporte, Conteo, Fijo, GastoGuardado, MedioPago, Meta, PagoFijo, ReciboSueldo, Retiro, Sugerencia, Tono } from './tipos';

// Todo el acceso a datos pasa por acá. Las pantallas no saben si los datos
// vienen de Supabase o del modo demo: solo usan una FuenteDatos.

export type Perfil = {
  nombre: string | null;
  sueldo: number | null;
  tono: Tono;
  /** Código de la dirección de mail para reenviar pagos (ver Ajustes) */
  codigoMail?: string | null;
};
export type GastoConMedio = GastoGuardado & { tarjetas: { nombre: string } | null; pendiente?: boolean };
export type FilaGasto = Omit<GastoGuardado, 'id'> & { id?: string; texto_original?: string };
export type FilaMedio = Omit<MedioPago, 'id'>;
type SinId<T> = Omit<T, 'id'> & { id?: string };
export type FilaFijo = SinId<Fijo>;
export type FilaPagoFijo = SinId<PagoFijo>;
export type FilaRetiro = SinId<Retiro>;
export type FilaActivo = SinId<Activo>;
export type FilaSugerencia = SinId<Sugerencia>;
export type FilaMeta = SinId<Meta>;
export type FilaAporte = SinId<Aporte>;
export type FilaRecibo = SinId<ReciboSueldo>;
/** El momento del conteo lo pone la base */
export type FilaConteo = { id?: string; monto: number };

/** Listar, crear, cambiar y borrar: lo mismo para fijos, retiros, activos... */
export interface Coleccion<T, F> {
  listar(): Promise<T[]>;
  crear(fila: F): Promise<void>;
  actualizar(id: string, cambios: Partial<F>): Promise<void>;
  borrar(id: string): Promise<void>;
}

/** 'pendiente' = no había internet: quedó guardado en el celular y se sube solo después */
export type ResultadoGuardado = 'guardado' | 'pendiente';

export interface FuenteDatos {
  esDemo: boolean;
  perfil(): Promise<Perfil>;
  guardarSueldo(sueldo: number): Promise<void>;
  guardarTono(tono: Tono): Promise<void>;
  /** Todos los gastos, del más nuevo al más viejo */
  gastos(): Promise<GastoConMedio[]>;
  crearGasto(fila: FilaGasto): Promise<ResultadoGuardado>;
  actualizarGasto(id: string, fila: FilaGasto): Promise<void>;
  borrarGasto(id: string): Promise<void>;
  medios(): Promise<MedioPago[]>;
  crearMedio(fila: FilaMedio): Promise<void>;
  actualizarMedio(id: string, fila: FilaMedio): Promise<void>;
  borrarMedio(id: string): Promise<void>;
  fijos: Coleccion<Fijo, FilaFijo>;
  pagosFijos: Coleccion<PagoFijo, FilaPagoFijo>;
  retiros: Coleccion<Retiro, FilaRetiro>;
  activos: Coleccion<Activo, FilaActivo>;
  sugerencias: Coleccion<Sugerencia, FilaSugerencia>;
  conteos: Coleccion<Conteo, FilaConteo>;
  metas: Coleccion<Meta, FilaMeta>;
  aportes: Coleccion<Aporte, FilaAporte>;
  recibos: Coleccion<ReciboSueldo, FilaRecibo>;
  /** Para mandarle al celular el aviso de un pago que llegó por mail */
  guardarPushToken(token: string): Promise<void>;
  salir(): Promise<void>;
}

// Supabase devuelve { data, error }: lo convertimos en "devuelve data o lanza un error"
function revisar<T>({ data, error }: { data: T; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data;
}

// Supabase devuelve las columnas numeric como texto: las pasamos a número
function aNumeros<T>(campos: string[]) {
  return (fila: Record<string, unknown>) => {
    const copia: Record<string, unknown> = { ...fila };
    for (const campo of campos) if (copia[campo] !== null && copia[campo] !== undefined) copia[campo] = Number(copia[campo]);
    return copia as T;
  };
}

function coleccionRemota<T, F>(tabla: string, convertir: (fila: Record<string, unknown>) => T, orden = 'creado_en'): Coleccion<T, F> {
  return {
    async listar() {
      const filas = revisar(await supabase.from(tabla).select('*').order(orden, { ascending: false }));
      return ((filas ?? []) as Record<string, unknown>[]).map(convertir);
    },
    async crear(fila) {
      revisar(await supabase.from(tabla).insert({ ...fila, id: (fila as { id?: string }).id ?? nuevoId() }));
    },
    async actualizar(id, cambios) {
      revisar(await supabase.from(tabla).update(cambios as Record<string, unknown>).eq('id', id));
    },
    async borrar(id) {
      revisar(await supabase.from(tabla).delete().eq('id', id));
    },
  };
}

const fuenteRemota: FuenteDatos = {
  esDemo: false,

  async perfil() {
    // codigo_mail viene de la migración 001: si todavía no se corrió, leemos el perfil sin esa columna
    let respuesta = await supabase.from('perfiles').select('nombre, sueldo, tono_asistente, codigo_mail').single();
    if (respuesta.error && /codigo_mail/.test(respuesta.error.message)) {
      respuesta = (await supabase.from('perfiles').select('nombre, sueldo, tono_asistente').single()) as typeof respuesta;
    }
    const fila = revisar(respuesta);
    return {
      nombre: fila?.nombre ?? null,
      sueldo: fila?.sueldo ? Number(fila.sueldo) : null,
      tono: (fila?.tono_asistente as Tono) ?? 'directo',
      codigoMail: fila?.codigo_mail ?? null,
    };
  },

  async guardarSueldo(sueldo) {
    const { data } = await supabase.auth.getUser();
    revisar(await supabase.from('perfiles').update({ sueldo }).eq('id', data.user!.id));
  },

  async guardarTono(tono) {
    const { data } = await supabase.auth.getUser();
    revisar(await supabase.from('perfiles').update({ tono_asistente: tono }).eq('id', data.user!.id));
  },

  async gastos() {
    const filas = revisar(
      await supabase
        .from('gastos')
        .select('*, tarjetas(nombre)')
        .order('fecha_compra', { ascending: false })
        .order('creado_en', { ascending: false })
    );
    return (filas ?? []) as GastoConMedio[];
  },

  async crearGasto(fila) {
    revisar(await supabase.from('gastos').insert(fila));
    return 'guardado';
  },

  async actualizarGasto(id, fila) {
    revisar(await supabase.from('gastos').update(fila).eq('id', id));
  },

  async borrarGasto(id) {
    revisar(await supabase.from('gastos').delete().eq('id', id));
  },

  async medios() {
    return (revisar(await supabase.from('tarjetas').select('*').order('creado_en')) ?? []) as MedioPago[];
  },

  async crearMedio(fila) {
    revisar(await supabase.from('tarjetas').insert(fila));
  },

  async actualizarMedio(id, fila) {
    revisar(await supabase.from('tarjetas').update(fila).eq('id', id));
  },

  async borrarMedio(id) {
    revisar(await supabase.from('tarjetas').delete().eq('id', id));
  },

  fijos: coleccionRemota<Fijo, FilaFijo>('fijos', aNumeros(['monto'])),
  pagosFijos: coleccionRemota<PagoFijo, FilaPagoFijo>('pagos_fijos', aNumeros(['monto']), 'mes'),
  retiros: coleccionRemota<Retiro, FilaRetiro>('retiros', aNumeros(['monto']), 'fecha'),
  activos: coleccionRemota<Activo, FilaActivo>(
    'activos',
    aNumeros(['monto_inicial', 'cantidad', 'tna', 'plazo_dias', 'valor_actual', 'depreciacion_anual'])
  ),
  sugerencias: coleccionRemota<Sugerencia, FilaSugerencia>('sugerencias', aNumeros(['monto'])),
  conteos: coleccionRemota<Conteo, FilaConteo>('conteos_efectivo', aNumeros(['monto'])),
  metas: coleccionRemota<Meta, FilaMeta>('metas_ahorro', aNumeros(['objetivo', 'ahorro_mensual'])),
  aportes: coleccionRemota<Aporte, FilaAporte>('aportes_ahorro', aNumeros(['monto']), 'fecha'),
  recibos: coleccionRemota<ReciboSueldo, FilaRecibo>('recibos_sueldo', aNumeros(['bruto', 'neto']), 'periodo'),

  async guardarPushToken(token) {
    const { data } = await supabase.auth.getUser();
    revisar(await supabase.from('perfiles').update({ push_token: token }).eq('id', data.user!.id));
  },

  async salir() {
    await supabase.auth.signOut();
  },
};

// ---------- Funcionar sin conexión ----------

const CLAVES = {
  perfil: 'cache-perfil',
  gastos: 'cache-gastos',
  medios: 'cache-medios',
  cola: 'gastos-sin-subir',
  fijos: 'cache-fijos',
  pagosFijos: 'cache-pagos-fijos',
  retiros: 'cache-retiros',
  activos: 'cache-activos',
  sugerencias: 'cache-sugerencias',
  conteos: 'cache-conteos',
  metas: 'cache-metas',
  aportes: 'cache-aportes',
  recibos: 'cache-recibos',
  // La conversación con el asistente con IA (la guarda la pantalla de chat)
  chat: 'chat-ia',
  // El bloqueo con Face ID / huella es de este dispositivo y de esta cuenta
  bloqueo: 'bloqueo-biometrico',
};
const SIN_CONEXION = 'No hay internet. Probá de nuevo cuando tengas conexión.';

function esErrorDeConexion(e: unknown) {
  return /network|fetch|timeout|abort|conexi/i.test(String((e as Error)?.message ?? e));
}

function conTiempoLimite<T>(promesa: Promise<T>, ms = 8000): Promise<T> {
  return Promise.race([promesa, new Promise<T>((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), ms))]);
}

async function leer<T>(clave: string): Promise<T | null> {
  try {
    const texto = await AsyncStorage.getItem(clave);
    return texto ? (JSON.parse(texto) as T) : null;
  } catch {
    return null;
  }
}

function guardar(clave: string, valor: unknown) {
  return AsyncStorage.setItem(clave, JSON.stringify(valor)).catch(() => {});
}

// Pide al servidor; si no hay internet, devuelve lo último que se guardó en el celular
async function conRespaldo<T>(clave: string, pedido: () => Promise<T>): Promise<T> {
  try {
    const valor = await conTiempoLimite(pedido());
    guardar(clave, valor);
    return valor;
  } catch (e) {
    if (!esErrorDeConexion(e)) throw e;
    const guardado = await leer<T>(clave);
    if (guardado !== null) return guardado;
    throw new Error(SIN_CONEXION);
  }
}

// Para escribir: si no hay internet, el mensaje de error es claro
async function escribir<T>(pedido: () => Promise<T>): Promise<T> {
  try {
    return await conTiempoLimite(pedido());
  } catch (e) {
    throw esErrorDeConexion(e) ? new Error(SIN_CONEXION) : e;
  }
}

type GastoEnCola = GastoConMedio & { texto_original?: string };

function aFila({ tarjetas: _t, pendiente: _p, ...fila }: GastoEnCola): FilaGasto {
  return fila;
}

function esDuplicado(e: unknown) {
  return /duplicate key|23505/i.test(String((e as Error)?.message ?? e));
}

// Lee con respaldo en el celular y escribe con un mensaje claro si no hay internet
function conCache<T, F>(clave: string, base: Coleccion<T, F>): Coleccion<T, F> {
  return {
    listar: () => conRespaldo(clave, base.listar),
    crear: (fila) => escribir(() => base.crear(fila)),
    actualizar: (id, cambios) => escribir(() => base.actualizar(id, cambios)),
    borrar: (id) => escribir(() => base.borrar(id)),
  };
}

function crearFuenteSupabase(base: FuenteDatos): FuenteDatos {
  let subiendo: Promise<void> | null = null;

  // Intenta subir los gastos que se cargaron sin internet
  function subirPendientes() {
    subiendo ??= (async () => {
      const cola = (await leer<GastoEnCola[]>(CLAVES.cola)) ?? [];
      const listos = new Set<string>();
      for (const gasto of cola) {
        try {
          await conTiempoLimite(base.crearGasto(aFila(gasto)));
        } catch (e) {
          if (esErrorDeConexion(e)) break;
          // Duplicado = ya se había subido. Cualquier otro error: el servidor no lo acepta, no tiene sentido reintentar
          if (!esDuplicado(e)) console.warn('Se descartó un gasto que el servidor rechazó:', (e as Error).message);
        }
        listos.add(gasto.id);
      }
      // Volvemos a leer la cola: mientras subíamos se pudo haber agregado otro gasto
      if (listos.size > 0) await cambiarCola((actual) => actual.filter((g) => !listos.has(g.id)));
    })().finally(() => {
      subiendo = null;
    });
    return subiendo;
  }

  async function cambiarCola(cambio: (cola: GastoEnCola[]) => GastoEnCola[]) {
    const cola = (await leer<GastoEnCola[]>(CLAVES.cola)) ?? [];
    await guardar(CLAVES.cola, cambio(cola));
  }

  async function nombreDelMedio(id: string | null) {
    if (!id) return null;
    const medios = (await leer<MedioPago[]>(CLAVES.medios)) ?? [];
    const medio = medios.find((m) => m.id === id);
    return medio ? { nombre: medio.nombre } : null;
  }

  async function estaEnCola(id: string) {
    return ((await leer<GastoEnCola[]>(CLAVES.cola)) ?? []).some((g) => g.id === id);
  }

  return {
    ...base,

    perfil: () => conRespaldo(CLAVES.perfil, base.perfil),
    medios: () => conRespaldo(CLAVES.medios, base.medios),

    async gastos() {
      await subirPendientes().catch(() => {});
      const [lista, cola] = await Promise.all([
        conRespaldo(CLAVES.gastos, base.gastos),
        leer<GastoEnCola[]>(CLAVES.cola),
      ]);
      const pendientes = (cola ?? []).map((g) => ({ ...g, pendiente: true }));
      return [...pendientes, ...lista].sort((a, b) => b.fecha_compra.localeCompare(a.fecha_compra));
    },

    async crearGasto(fila) {
      const conId = { ...fila, id: fila.id ?? nuevoId() };
      try {
        await conTiempoLimite(base.crearGasto(conId));
        return 'guardado';
      } catch (e) {
        if (!esErrorDeConexion(e)) throw e;
        const tarjetas = await nombreDelMedio(conId.tarjeta_id);
        await cambiarCola((cola) => [...cola, { ...(conId as GastoGuardado), tarjetas, texto_original: fila.texto_original }]);
        return 'pendiente';
      }
    },

    async actualizarGasto(id, fila) {
      if (await estaEnCola(id)) {
        const tarjetas = await nombreDelMedio(fila.tarjeta_id);
        return cambiarCola((cola) => cola.map((g) => (g.id === id ? { ...g, ...fila, id, tarjetas } : g)));
      }
      return escribir(() => base.actualizarGasto(id, fila));
    },

    async borrarGasto(id) {
      if (await estaEnCola(id)) return cambiarCola((cola) => cola.filter((g) => g.id !== id));
      return escribir(() => base.borrarGasto(id));
    },

    guardarSueldo: (sueldo) => escribir(() => base.guardarSueldo(sueldo)),
    guardarTono: (tono) => escribir(() => base.guardarTono(tono)),
    crearMedio: (fila) => escribir(() => base.crearMedio(fila)),
    actualizarMedio: (id, fila) => escribir(() => base.actualizarMedio(id, fila)),
    borrarMedio: (id) => escribir(() => base.borrarMedio(id)),
    fijos: conCache(CLAVES.fijos, base.fijos),
    pagosFijos: conCache(CLAVES.pagosFijos, base.pagosFijos),
    retiros: conCache(CLAVES.retiros, base.retiros),
    activos: conCache(CLAVES.activos, base.activos),
    sugerencias: conCache(CLAVES.sugerencias, base.sugerencias),
    conteos: conCache(CLAVES.conteos, base.conteos),
    metas: conCache(CLAVES.metas, base.metas),
    aportes: conCache(CLAVES.aportes, base.aportes),
    recibos: conCache(CLAVES.recibos, base.recibos),
    guardarPushToken: (token) => escribir(() => base.guardarPushToken(token)),

    // Al salir se borra todo lo guardado en el celular: si lo usa otra persona, no ve tus datos
    async salir() {
      await AsyncStorage.multiRemove(Object.values(CLAVES)).catch(() => {});
      await base.salir();
    },
  };
}

export const fuenteSupabase = crearFuenteSupabase(fuenteRemota);
