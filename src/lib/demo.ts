import type { Coleccion, FilaGasto, FuenteDatos, GastoConMedio } from './datos';
import { calcularPrimerMesCuota, formatearFecha } from './finanzas';
import { mesDe } from './fijos';
import type { Activo, Aporte, Categoria, Conteo, Fijo, MedioPago, Meta, PagoFijo, Retiro, Sugerencia, Tono } from './tipos';

// Modo demo: los mismos datos que tendría un usuario real, pero en memoria.
// Sirve para probar la app sin cuenta (y para mostrarla en el portfolio).

type GastoEjemplo = { descripcion: string; categoria: Categoria; monto: number; cuotas?: number; medio: string | null; haceDias: number; moneda?: 'ARS' | 'USD' };

// Los cierres se calculan desde hoy para que la demo siempre muestre los avisos:
// la Visa cierra mañana y la Master a mitad de mes que viene.
function crearMedios(): MedioPago[] {
  const enDias = (dias: number) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + dias);
    return Math.min(fecha.getDate(), 28);
  };
  const cierreVisa = enDias(1);
  const cierreMaster = enDias(15);
  const vencimiento = (cierre: number) => ((cierre + 9) % 28) + 1;
  return [
    { id: 'visa', nombre: 'Visa Galicia', banco: 'Galicia', tipo: 'credito', red: 'visa', dia_cierre: cierreVisa, dia_vencimiento: vencimiento(cierreVisa) },
    { id: 'master', nombre: 'Master BBVA', banco: 'BBVA', tipo: 'credito', red: 'mastercard', dia_cierre: cierreMaster, dia_vencimiento: vencimiento(cierreMaster) },
    { id: 'mp', nombre: 'Mercado Pago', banco: 'Mercado Pago', tipo: 'debito', red: null, dia_cierre: null, dia_vencimiento: null },
  ];
}

const GASTOS: GastoEjemplo[] = [
  { descripcion: 'Super Coto', categoria: 'Supermercado', monto: 48_350, medio: 'visa', haceDias: 0 },
  { descripcion: 'Uber al centro', categoria: 'Transporte', monto: 7_800, medio: 'mp', haceDias: 0 },
  { descripcion: 'Pizza con amigos', categoria: 'Comida y salidas', monto: 18_500, medio: 'mp', haceDias: 1 },
  { descripcion: 'Zapatillas', categoria: 'Compras', monto: 189_000, cuotas: 6, medio: 'visa', haceDias: 2 },
  { descripcion: 'Café con medialunas', categoria: 'Comida y salidas', monto: 9_200, medio: 'mp', haceDias: 2 },
  { descripcion: 'Farmacia', categoria: 'Salud', monto: 23_400, medio: 'master', haceDias: 3 },
  { descripcion: 'Empanadas', categoria: 'Comida y salidas', monto: 14_000, medio: 'mp', haceDias: 4 },
  { descripcion: 'Netflix', categoria: 'Entretenimiento', monto: 11_999, medio: 'visa', haceDias: 5 },
  { descripcion: 'Luz', categoria: 'Servicios', monto: 32_700, medio: 'mp', haceDias: 6 },
  { descripcion: 'Curso de inglés', categoria: 'Educación', monto: 95_000, cuotas: 3, medio: 'master', haceDias: 9 },
  { descripcion: 'Nafta', categoria: 'Transporte', monto: 40_000, medio: 'visa', haceDias: 11 },
  { descripcion: 'Sushi', categoria: 'Comida y salidas', monto: 34_000, medio: 'master', haceDias: 14 },
  { descripcion: 'Spotify', categoria: 'Entretenimiento', monto: 5, medio: 'visa', haceDias: 18, moneda: 'USD' },
  { descripcion: 'Verdulería', categoria: 'Supermercado', monto: 12_000, medio: null, haceDias: 2 },
  { descripcion: 'Gimnasio', categoria: 'Salud', monto: 28_000, medio: 'mp', haceDias: 8 },
  { descripcion: 'Gimnasio', categoria: 'Salud', monto: 26_000, medio: 'mp', haceDias: 38 },
  { descripcion: 'Netflix', categoria: 'Entretenimiento', monto: 11_999, medio: 'visa', haceDias: 35 },
  { descripcion: 'Spotify', categoria: 'Entretenimiento', monto: 5, medio: 'visa', haceDias: 48, moneda: 'USD' },
  { descripcion: 'Celular', categoria: 'Compras', monto: 960_000, cuotas: 12, medio: 'visa', haceDias: 40 },
  { descripcion: 'Heladera', categoria: 'Compras', monto: 720_000, cuotas: 9, medio: 'master', haceDias: 75 },
];

function crearGastosIniciales(medios: MedioPago[]): GastoConMedio[] {
  return GASTOS.map((g, i) => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - g.haceDias);
    const medio = medios.find((m) => m.id === g.medio) ?? null;
    return {
      id: `demo-${i}`,
      descripcion: g.descripcion,
      categoria: g.categoria,
      monto_total: g.monto,
      moneda: g.moneda ?? 'ARS',
      cantidad_cuotas: g.cuotas ?? 1,
      fecha_compra: formatearFecha(fecha),
      primer_mes_cuota: calcularPrimerMesCuota(fecha, medio),
      tarjeta_id: medio?.id ?? null,
      tarjetas: medio ? { nombre: medio.nombre } : null,
    };
  });
}

const haceDias = (dias: number) => {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  return formatearFecha(fecha);
};

// El día del mes de hoy más (o menos) algunos días, sin salirse de 1 a 28
const diaCercano = (delta: number) => Math.min(Math.max(new Date().getDate() + delta, 1), 28);

function crearFijos(): Fijo[] {
  return [
    { id: 'f-luz', descripcion: 'Luz', categoria: 'Servicios', tipo: 'servicio', monto: null, moneda: 'ARS', dia: diaCercano(3), tarjeta_id: 'mp', debito_automatico: false, activo: true },
    { id: 'f-alquiler', descripcion: 'Alquiler', categoria: 'Servicios', tipo: 'servicio', monto: 450_000, moneda: 'ARS', dia: diaCercano(6), tarjeta_id: null, debito_automatico: false, activo: true },
    { id: 'f-internet', descripcion: 'Internet', categoria: 'Servicios', tipo: 'servicio', monto: 24_500, moneda: 'ARS', dia: diaCercano(-2), tarjeta_id: 'visa', debito_automatico: false, activo: true },
    { id: 'f-netflix', descripcion: 'Netflix', categoria: 'Entretenimiento', tipo: 'suscripcion', monto: 11_999, moneda: 'ARS', dia: diaCercano(-5), tarjeta_id: 'visa', debito_automatico: true, activo: true },
    { id: 'f-spotify', descripcion: 'Spotify', categoria: 'Entretenimiento', tipo: 'suscripcion', monto: 5, moneda: 'USD', dia: diaCercano(10), tarjeta_id: 'visa', debito_automatico: true, activo: true },
  ];
}

function crearActivos(): Activo[] {
  const base = { cantidad: null, tna: null, plazo_dias: null, valor_actual: null, depreciacion_anual: null };
  return [
    { ...base, id: 'a-usd', nombre: 'Ahorro en dólares', tipo: 'dolares', monto_inicial: 1_100_000, fecha_inicio: haceDias(150), cantidad: 1_000 },
    { ...base, id: 'a-pf', nombre: 'Plazo fijo Galicia', tipo: 'plazo_fijo', monto_inicial: 1_000_000, fecha_inicio: haceDias(12), tna: 32, plazo_dias: 30 },
    { ...base, id: 'a-mp', nombre: 'Mercado Pago', tipo: 'remunerada', monto_inicial: 350_000, fecha_inicio: haceDias(60), tna: 28 },
    { ...base, id: 'a-cel', nombre: 'Celular', tipo: 'bien', monto_inicial: 960_000, fecha_inicio: haceDias(40), depreciacion_anual: 25 },
  ];
}

// El 1 de enero que viene, para la meta de vacaciones
const proximoEnero = () => `${new Date().getFullYear() + 1}-01-15`;

function crearMetas(): Meta[] {
  return [
    { id: 'm-vacaciones', nombre: 'Vacaciones', emoji: '🏖️', objetivo: 1_500_000, fecha_objetivo: proximoEnero(), activo_id: 'a-mp', ahorro_mensual: 150_000, dia_aporte: 5 },
    { id: 'm-emergencia', nombre: 'Fondo de emergencia', emoji: '🛟', objetivo: 1_500_000, fecha_objetivo: null, activo_id: 'a-pf', ahorro_mensual: 50_000, dia_aporte: null },
  ];
}

function crearAportes(): Aporte[] {
  const aporte = (meta: string, monto: number, dias: number, automatico = false): Aporte => ({ id: `ap-${meta}-${dias}`, meta_id: meta, monto, fecha: haceDias(dias), automatico });
  return [
    aporte('m-vacaciones', 150_000, 66, true),
    aporte('m-vacaciones', 150_000, 36, true),
    aporte('m-vacaciones', 100_000, 20),
    aporte('m-emergencia', 400_000, 90),
    aporte('m-emergencia', 50_000, 40),
  ];
}

function crearSugerencias(): Sugerencia[] {
  return [
    { id: 's-1', origen: 'mail', descripcion: 'Café Martínez', monto: 8_500, moneda: 'ARS', fecha: haceDias(0), fuente: 'Mercado Pago', texto_original: 'Pagaste $ 8.500 a Café Martínez', estado: 'pendiente' },
    { id: 's-2', origen: 'notificacion', descripcion: 'Farmacity', monto: 15_200, moneda: 'ARS', fecha: haceDias(1), fuente: 'Ualá', texto_original: 'Compraste $15.200 en Farmacity', estado: 'pendiente' },
  ];
}

// Una colección en memoria con la misma forma que las de Supabase
function coleccionDemo<T extends { id: string }, F>(iniciales: T[], prefijo: string): Coleccion<T, F> {
  let filas = iniciales;
  let siguiente = 1;
  return {
    async listar() {
      return filas.map((f) => ({ ...f }));
    },
    async crear(fila) {
      const id = (fila as { id?: string }).id ?? `${prefijo}-${siguiente++}`;
      // Como en la base real: cada fila nueva sabe cuándo se cargó (lo usa el conteo de la billetera)
      filas = [{ creado_en: new Date().toISOString(), ...(fila as object), id } as unknown as T, ...filas];
    },
    async actualizar(id, cambios) {
      filas = filas.map((f) => (f.id === id ? { ...f, ...cambios } : f));
    },
    async borrar(id) {
      filas = filas.filter((f) => f.id !== id);
    },
  };
}

export function crearFuenteDemo(alSalir: () => void): FuenteDatos {
  let medios = crearMedios();
  let gastos = crearGastosIniciales(medios);
  let sueldo: number | null = 1_500_000;
  let tono: Tono = 'amable';
  let siguienteId = 1;

  const conMedio = (id: string, fila: FilaGasto): GastoConMedio => {
    const medio = medios.find((m) => m.id === fila.tarjeta_id);
    return { ...fila, id, tarjetas: medio ? { nombre: medio.nombre } : null };
  };
  const ordenar = () => gastos.sort((a, b) => b.fecha_compra.localeCompare(a.fecha_compra));
  // El internet de este mes ya está pagado, para que se vea un fijo tildado
  const pagos: PagoFijo[] = [{ id: 'p-internet', fijo_id: 'f-internet', mes: mesDe(new Date()), monto: 24_500, gasto_id: null }];
  const retiros: Retiro[] = [{ id: 'r-1', monto: 60_000, fecha: haceDias(3), nota: 'Cajero Galicia' }];
  // Contó la billetera hace 4 días: con el retiro y la verdulería, debería tener $ 93.000
  const conteos: Conteo[] = [{ id: 'c-1', monto: 45_000, creado_en: new Date(Date.now() - 4 * 86_400_000).toISOString() }];

  return {
    esDemo: true,
    async perfil() {
      return { nombre: 'Invitado', sueldo, tono };
    },
    async guardarSueldo(valor) {
      sueldo = valor;
    },
    async guardarTono(valor) {
      tono = valor;
    },
    async gastos() {
      return gastos.map((g) => ({ ...g }));
    },
    async crearGasto(fila) {
      gastos.unshift({ ...conMedio(fila.id ?? `nuevo-${siguienteId++}`, fila), creado_en: new Date().toISOString() });
      ordenar();
      return 'guardado';
    },
    async actualizarGasto(id, fila) {
      gastos = gastos.map((g) => (g.id === id ? conMedio(id, fila) : g));
      ordenar();
    },
    async borrarGasto(id) {
      gastos = gastos.filter((g) => g.id !== id);
    },
    async medios() {
      return medios.map((m) => ({ ...m }));
    },
    async crearMedio(fila) {
      medios.push({ ...fila, id: `medio-${siguienteId++}` });
    },
    async actualizarMedio(id, fila) {
      medios = medios.map((m) => (m.id === id ? { ...fila, id } : m));
      gastos = gastos.map((g) => (g.tarjeta_id === id ? { ...g, tarjetas: { nombre: fila.nombre } } : g));
    },
    async borrarMedio(id) {
      medios = medios.filter((m) => m.id !== id);
      gastos = gastos.map((g) => (g.tarjeta_id === id ? { ...g, tarjeta_id: null, tarjetas: null } : g));
    },
    fijos: coleccionDemo(crearFijos(), 'fijo'),
    pagosFijos: coleccionDemo(pagos, 'pago'),
    retiros: coleccionDemo(retiros, 'retiro'),
    activos: coleccionDemo(crearActivos(), 'activo'),
    sugerencias: coleccionDemo(crearSugerencias(), 'sugerencia'),
    metas: coleccionDemo(crearMetas(), 'meta'),
    aportes: coleccionDemo(crearAportes(), 'aporte'),
    recibos: coleccionDemo([], 'recibo'),
    conteos: {
      ...coleccionDemo(conteos, 'conteo'),
      async crear(fila) {
        conteos.unshift({ id: fila.id ?? `conteo-${siguienteId++}`, monto: fila.monto, creado_en: new Date().toISOString() });
      },
    },
    async guardarPushToken() {},
    async salir() {
      alSalir();
    },
  };
}
