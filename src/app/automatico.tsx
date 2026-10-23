import { Platform, ScrollView, StyleSheet } from 'react-native';
import GuiaSiri from '../components/GuiaSiri';
import PagosAutomaticos from '../components/PagosAutomaticos';
import { Encabezado, Texto as Text } from '../components/ui';
import { colores } from '../constants/tema';
import { Objetivo, useRecorridoSeccion } from '../components/Tutorial';

// Todo lo que sirve para anotar sin escribir: Siri, mails reenviados y notificaciones de billeteras
export default function Automatico() {
  const ayuda = useRecorridoSeccion('automatico');
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <Encabezado titulo="Anotar sin esfuerzo" subtitulo="Que los gastos se anoten casi solos" volver ayuda={ayuda} />

      <Text style={styles.seccion}>Con la voz</Text>
      {/* Siri y Atajos son de iPhone (en la web se muestra para la demo) */}
      <Objetivo id="auto-voz">
          {Platform.OS !== 'android' ? (
            <GuiaSiri />
          ) : (
            <Text style={styles.pista}>En Android, usá el lector de notificaciones de abajo: anota solo lo que pagás con billeteras.</Text>
          )}
      </Objetivo>

      <Text style={[styles.seccion, styles.separada]}>Pagos que llegan solos</Text>
      <Objetivo id="auto-pagos">
        <PagosAutomaticos />
      </Objetivo>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  seccion: { color: colores.texto, fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  separada: { marginTop: 28 },
  pista: { color: colores.textoTenue, fontSize: 14, lineHeight: 20 },
});
