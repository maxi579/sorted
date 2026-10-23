import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { colores, radios } from '../constants/tema';
import { Texto as Text } from './ui';

// La política de privacidad, en criollo. Se muestra en Ajustes → Privacidad y desde la pantalla de ingreso.
// Si cambia lo que hace la app con los datos, actualizar este texto y la fecha.

export const ACTUALIZADA = '12 de octubre de 2026';
/** Mail para consultas de privacidad. Vacío: no se muestra. */
export const CONTACTO = '';

const RESUMEN: { icono: keyof typeof Ionicons.glyphMap; texto: string }[] = [
  { icono: 'card', texto: 'Nunca te pedimos números de tarjeta, códigos de seguridad ni claves del banco o de tus billeteras.' },
  { icono: 'person', texto: 'Tus datos son solo tuyos: cada cuenta ve únicamente lo suyo.' },
  { icono: 'ban', texto: 'No vendemos ni compartimos tus datos, y no hay publicidad.' },
  { icono: 'trash', texto: 'Podés borrar tu cuenta y todo lo tuyo cuando quieras, desde Ajustes.' },
];

const SECCIONES: { titulo: string; puntos: string[] }[] = [
  {
    titulo: 'Qué guardamos',
    puntos: [
      'Tu nombre y tu mail, para identificar tu cuenta. Si entrás con Google o Apple, solo nos pasan esos datos.',
      'Si entrás con mail y contraseña, la contraseña se guarda cifrada de una forma que nadie puede leer, ni siquiera nosotros.',
      'Lo que anotás: gastos, cuotas, fijos, efectivo, ahorros, activos y tu sueldo.',
      'De tus tarjetas, solo el nombre que les pongas, el banco y los días de cierre y vencimiento. Nunca el número.',
      'De tus recibos de sueldo, solo el mes, la empresa y los montos. El archivo no se guarda.',
      'Cuántos mensajes le mandaste al asistente cada día, para el límite diario.',
      'Si activás los avisos, un código para poder mandarte notificaciones al celular.',
    ],
  },
  {
    titulo: 'Notificaciones de pagos (Android)',
    puntos: [
      'Solo si vos lo activás. Las notificaciones se analizan en tu celular: se ignoran las que no tienen un monto.',
      'De las que tienen un monto, solo se guarda el aviso cuando es un pago, un cobro de sueldo o un retiro de efectivo, para que lo revises antes de anotarlo.',
      'Lo podés apagar cuando quieras desde los ajustes del celular.',
    ],
  },
  {
    titulo: 'Lo que queda solo en tu celular',
    puntos: [
      'La conversación con el asistente.',
      'Una copia de tus datos para que la app funcione sin internet.',
      'Face ID o huella: tu cara y tu huella nunca salen del celular. Ni siquiera la app las ve: el celular solo le confirma que sos vos.',
      'Todo esto se borra cuando cerrás sesión.',
    ],
  },
  {
    titulo: 'Inteligencia artificial',
    puntos: [
      'Cuando usás el asistente, escaneás un ticket o cargás un recibo de sueldo, mandamos lo necesario a Claude, la IA de Anthropic: tu mensaje, un resumen de tus gastos o el archivo.',
      'Anthropic no usa estos datos para entrenar su IA.',
      'Las fotos de los tickets y los recibos no se guardan: se leen y se descartan.',
    ],
  },
  {
    titulo: 'Dónde y cómo se guarda',
    puntos: [
      'En Supabase, un servicio de bases de datos en la nube. Los servidores pueden estar fuera de Argentina.',
      'Todo viaja cifrado y se guarda cifrado. Las reglas de la base no dejan que una cuenta lea los datos de otra.',
      'Usamos servicios conocidos para funcionar (Supabase para los datos, Google y Apple para el ingreso, Anthropic para la IA y Expo para los avisos al celular). Ninguno recibe tus datos para publicidad.',
    ],
  },
  {
    titulo: 'Tus derechos',
    puntos: [
      'Según la Ley 25.326 de Protección de Datos Personales, podés acceder a tus datos, corregirlos y pedir que se borren.',
      'Todo lo ves y lo corregís desde la app. Para borrar todo, entrá a Ajustes y tocá Borrar mi cuenta.',
    ],
  },
];

export function PoliticaPrivacidad() {
  return (
    <View>
      <View style={styles.resumen}>
        {RESUMEN.map((r) => (
          <View key={r.texto} style={styles.filaResumen}>
            <View style={styles.icono}>
              <Ionicons name={r.icono} size={18} color={colores.primario} />
            </View>
            <Text style={styles.textoResumen}>{r.texto}</Text>
          </View>
        ))}
      </View>

      {SECCIONES.map((s) => (
        <View key={s.titulo} style={styles.seccion}>
          <Text style={styles.titulo}>{s.titulo}</Text>
          {s.puntos.map((p) => (
            <View key={p} style={styles.punto}>
              <View style={styles.vineta} />
              <Text style={styles.texto}>{p}</Text>
            </View>
          ))}
        </View>
      ))}

      {CONTACTO !== '' && <Text style={styles.texto}>¿Dudas? Escribinos a {CONTACTO}.</Text>}
      <Text style={styles.fecha}>Actualizada el {ACTUALIZADA}.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  resumen: { backgroundColor: colores.superficie, borderRadius: radios.grande, borderWidth: 1, borderColor: colores.borde, padding: 16, gap: 14 },
  filaResumen: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icono: { width: 34, height: 34, borderRadius: radios.chico, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center' },
  textoResumen: { flex: 1, color: colores.texto, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  seccion: { marginTop: 28, gap: 10 },
  titulo: { color: colores.texto, fontSize: 18, fontWeight: 'bold' },
  punto: { flexDirection: 'row', gap: 10 },
  vineta: { width: 5, height: 5, borderRadius: 3, backgroundColor: colores.primario, marginTop: 9 },
  texto: { flex: 1, color: colores.textoChip, fontSize: 15, lineHeight: 22 },
  fecha: { color: colores.textoTenue, fontSize: 13, marginTop: 28 },
});
