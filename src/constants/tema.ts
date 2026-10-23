// Valores del sistema de diseño. La explicación de cada uno está en DESIGN.md
export const colores = {
  fondo: '#101614',
  superficie: '#18201D',
  superficieAlta: '#212B27',
  borde: '#2C3833',
  texto: '#EEF3F0',
  textoSecundario: '#A3B1AA',
  textoTenue: '#7E8C86',
  textoChip: '#D5DED9',
  primario: '#5FD49A',
  primarioSuave: 'rgba(95, 212, 154, 0.14)',
  sobrePrimario: '#0B1A12',
  // Bloque destacado (hero del Inicio): texto sobre el degradé verde
  primarioTexto: '#A6EBC6',
  primarioTextoClaro: '#D3F2E1',
  primarioBorde: 'rgba(166, 235, 198, 0.2)',
  advertencia: '#F2B544',
  // Avisos en ámbar (modo demo, sugerencias, datos que faltan)
  advertenciaFondo: 'rgba(242, 181, 68, 0.08)',
  advertenciaBorde: 'rgba(242, 181, 68, 0.35)',
  advertenciaTexto: '#F7D58C',
  peligro: '#F0685A',
  error: '#F0685A',
  // Fondo oscuro detrás de modales y del recorrido guiado
  velo: 'rgba(6, 10, 8, 0.6)',
  veloFuerte: 'rgba(6, 10, 8, 0.8)',
  sombra: '#000000',
};

// Degradés de las tarjetas destacadas
export const degradados = {
  hero: ['#1A4433', '#14352A', '#112620'] as const,
  login: ['#14352A', '#101614'] as const,
  logo: ['#1C2924', '#101614'] as const,
  logoVerdes: ['#7FE0B0', '#5FD49A', '#3FBF82'] as const,
};

// chico: inputs e íconos · medio: botones · grande: tarjetas y filas · enorme: bloque principal y hojas
export const radios = { chico: 10, medio: 16, grande: 16, enorme: 24 };

export const espacios = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 28, xxxl: 40 };

export const tipografia = {
  titulo: { fontSize: 28, fontWeight: '700', color: colores.texto, letterSpacing: -0.4 },
  seccion: { fontSize: 17, fontWeight: '700', color: colores.texto },
  cuerpo: { fontSize: 16, color: colores.texto },
  secundario: { fontSize: 15, color: colores.textoSecundario },
} as const;

export const fuentes = {
  regular: 'PlusJakartaSans_400Regular',
  medio: 'PlusJakartaSans_500Medium',
  semi: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extra: 'PlusJakartaSans_800ExtraBold',
};

// Verde, ámbar o coral según qué parte del sueldo está comprometida
export function colorSegunPorcentaje(porcentaje: number | null) {
  if (porcentaje === null || porcentaje < 50) return colores.primario;
  return porcentaje < 80 ? colores.advertencia : colores.peligro;
}
