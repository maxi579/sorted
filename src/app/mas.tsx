import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTutorial } from '../components/Tutorial';
import { Encabezado, Texto as Text } from '../components/ui';
import { colores, radios } from '../constants/tema';

type Opcion = { icono: keyof typeof Ionicons.glyphMap; titulo: string; detalle: string; destino: Href };

// Lo que no entra en la barra de abajo, agrupado para que se encuentre fácil
const GRUPOS: { titulo: string; opciones: Opcion[] }[] = [
  {
    titulo: 'Tu plata',
    opciones: [
      { icono: 'calendar', titulo: 'Cuotas', detalle: 'Lo que tenés que pagar, mes por mes', destino: '/cuotas' },
      { icono: 'cash', titulo: 'Efectivo', detalle: 'Tu billetera y lo que pagás en mano', destino: '/efectivo' },
      { icono: 'flag', titulo: 'Ahorros', detalle: 'Tus metas y cuánto te falta', destino: '/ahorros' },
      { icono: 'calculator', titulo: '¿Cuánto me rinde?', detalle: 'Plazo fijo, billeteras e inflación', destino: '/rendimiento' },
      { icono: 'trending-up', titulo: 'Activos', detalle: 'Lo que tenés y cuánto vale hoy', destino: '/activos' },
      { icono: 'bag-check', titulo: '¿Lo compro?', detalle: 'Te digo si te conviene antes de comprar', destino: '/comprar' },
      { icono: 'download', titulo: 'Exportar a PDF', detalle: 'Tus gastos, listos para guardar o compartir', destino: '/exportar' },
    ],
  },
  {
    titulo: 'Anotar más rápido',
    opciones: [
      { icono: 'flash', titulo: 'Anotar sin esfuerzo', detalle: 'Siri, mails de pagos y notificaciones', destino: '/automatico' },
      { icono: 'mail-unread', titulo: 'Pagos para revisar', detalle: 'Los que encontré solos', destino: '/revisar' },
      { icono: 'document-text', titulo: 'Revisar el resumen', detalle: 'Subí el PDF de la tarjeta', destino: '/resumen' },
    ],
  },
  {
    titulo: 'Configuración',
    opciones: [{ icono: 'settings', titulo: 'Ajustes', detalle: 'Sueldo, tarjetas, avisos y tu cuenta', destino: '/ajustes' }],
  },
];

export default function Mas() {
  const { empezar } = useTutorial();

  // El recorrido arranca en Inicio
  function verRecorrido() {
    router.navigate('/');
    setTimeout(empezar, 600);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <Encabezado titulo="Más" />
      {GRUPOS.map((grupo) => (
        <View key={grupo.titulo} style={styles.grupo}>
          <Text style={styles.tituloGrupo}>{grupo.titulo}</Text>
          <View style={styles.caja}>
            {grupo.opciones.map((opcion, i) => (
              <Pressable
                key={opcion.titulo}
                style={({ pressed }) => [styles.opcion, i > 0 && styles.conBorde, pressed && { opacity: 0.7 }]}
                onPress={() => router.push(opcion.destino)}
              >
                <View style={styles.icono}>
                  <Ionicons name={opcion.icono} size={20} color={colores.primario} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.titulo}>{opcion.titulo}</Text>
                  <Text style={styles.detalle}>{opcion.detalle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colores.textoTenue} />
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      <Pressable style={({ pressed }) => [styles.recorrido, pressed && { opacity: 0.7 }]} onPress={verRecorrido}>
        <Ionicons name="school" size={20} color={colores.primario} />
        <Text style={styles.textoRecorrido}>Ver el recorrido guiado de nuevo</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  grupo: { marginBottom: 22 },
  tituloGrupo: { color: colores.textoSecundario, fontSize: 15, fontWeight: '600', marginBottom: 8 },
  caja: { backgroundColor: colores.superficie, borderRadius: radios.grande, borderWidth: 1, borderColor: colores.borde, paddingHorizontal: 14 },
  opcion: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  conBorde: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colores.borde },
  icono: { width: 40, height: 40, borderRadius: radios.chico, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center' },
  titulo: { color: colores.texto, fontSize: 16, fontWeight: '600' },
  detalle: { color: colores.textoSecundario, fontSize: 13, marginTop: 2 },
  recorrido: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colores.primario,
    borderRadius: radios.grande,
    padding: 14,
  },
  textoRecorrido: { color: colores.primario, fontSize: 15, fontWeight: '600' },
});
