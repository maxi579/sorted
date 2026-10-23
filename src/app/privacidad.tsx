import { ScrollView, StyleSheet } from 'react-native';
import { PoliticaPrivacidad } from '../components/Privacidad';
import { Encabezado } from '../components/ui';
import { colores } from '../constants/tema';

export default function Privacidad() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <Encabezado titulo="Privacidad" subtitulo="Qué hacemos con tus datos, sin letra chica" volver />
      <PoliticaPrivacidad />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 48 },
});
