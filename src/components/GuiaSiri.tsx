import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colores, radios } from '../constants/tema';
import { useAviso } from './Toast';
import { Texto as Text } from './ui';

// Guía para armar un Atajo de iPhone que anota gastos con la voz:
// Siri dicta el texto, el Atajo abre sorted://cargar?texto=... y la app lo guarda.
export default function GuiaSiri() {
  const aviso = useAviso();
  const [abierta, setAbierta] = useState(false);
  // En Expo Go la dirección es exp://..., en la app instalada es sorted://
  const enlace = `${Linking.createURL('cargar')}?guardar=si&texto=`;

  async function copiar() {
    await Clipboard.setStringAsync(enlace);
    aviso('Enlace copiado 📋');
  }

  return (
    <View style={styles.caja}>
      <Pressable style={styles.encabezado} onPress={() => setAbierta(!abierta)}>
        <View style={styles.icono}>
          <Ionicons name="mic" size={20} color={colores.primario} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>Anotar con Siri (iPhone)</Text>
          <Text style={styles.detalle}>“Oye Siri, anotar gasto” → “café 3500 con mercado pago”</Text>
        </View>
        <Ionicons name={abierta ? 'chevron-up' : 'chevron-down'} size={20} color={colores.textoTenue} />
      </Pressable>

      {abierta && (
        <View style={styles.pasos}>
          <Paso n={1}>Abrí la app Atajos y tocá “+” para crear un atajo nuevo.</Paso>
          <Paso n={2}>Agregá la acción “Dictar texto” (idioma: español).</Paso>
          <Paso n={3}>Agregá “Codificar URL” y elegí como entrada el “Texto dictado”.</Paso>
          <Paso n={4}>Agregá “Abrir URLs” y pegá este enlace, con el “Texto codificado” al final:</Paso>
          <Pressable style={({ pressed }) => [styles.enlace, pressed && { opacity: 0.7 }]} onPress={copiar}>
            <Text style={styles.textoEnlace} numberOfLines={2}>
              {enlace}
            </Text>
            <Ionicons name="copy-outline" size={18} color={colores.primario} />
          </Pressable>
          <Paso n={5}>Ponele de nombre “Anotar gasto”. Ese nombre es lo que le decís a Siri.</Paso>
          <Text style={styles.nota}>
            💡 También lo podés poner en la pantalla de inicio, o en el botón de acción de los iPhone nuevos (Configuración → Botón de acción →
            Atajo). Si querés revisar antes de guardar, borrá “guardar=si&” del enlace.
          </Text>
        </View>
      )}
    </View>
  );
}

function Paso({ n, children }: { n: number; children: string }) {
  return (
    <View style={styles.paso}>
      <View style={styles.numero}>
        <Text style={styles.textoNumero}>{n}</Text>
      </View>
      <Text style={styles.textoPaso}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { backgroundColor: colores.superficie, borderRadius: radios.grande, borderWidth: 1, borderColor: colores.borde, padding: 14, marginBottom: 10 },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icono: { width: 40, height: 40, borderRadius: radios.chico, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center' },
  titulo: { color: colores.texto, fontSize: 16, fontWeight: '600' },
  detalle: { color: colores.textoSecundario, fontSize: 13, marginTop: 2 },
  pasos: { marginTop: 14, gap: 10 },
  paso: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  numero: { width: 22, height: 22, borderRadius: 11, backgroundColor: colores.primario, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  textoNumero: { color: colores.sobrePrimario, fontSize: 12, fontWeight: '800' },
  textoPaso: { color: colores.textoChip, fontSize: 15, lineHeight: 21, flex: 1 },
  enlace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colores.fondo,
    borderRadius: radios.chico,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 12,
    marginLeft: 32,
  },
  textoEnlace: { color: colores.primario, fontSize: 13, flex: 1 },
  nota: { color: colores.textoSecundario, fontSize: 13, lineHeight: 19, marginTop: 4 },
});
