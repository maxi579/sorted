import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { colores, fuentes } from '../constants/tema';
import { Texto as Text } from './ui';

// El logo de Sorted: tres barras de mayor a menor ("ordenado"), igual que el ícono de la app
// (assets/marca/icono.svg). Dibujado con vistas para que se vea nítido en cualquier tamaño.

const VERDES = ['#34d399', '#22c58b', '#10b981'];
const LARGOS = [1, 0.72, 0.44];

export function SimboloSorted({ lado = 64 }: { lado?: number }) {
  const ancho = lado * 0.55;
  const alto = lado * 0.115;
  return (
    <LinearGradient colors={['#132238', '#0b1120']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.icono, { width: lado, height: lado, borderRadius: lado * 0.22 }]}>
      <View style={{ width: ancho, gap: lado * 0.065 }}>
        {LARGOS.map((largo, i) => (
          <View key={i} style={{ width: ancho * largo, height: alto, borderRadius: alto / 2, backgroundColor: VERDES[i] }} />
        ))}
      </View>
    </LinearGradient>
  );
}

// Símbolo + "Sorted" al lado
export function LogoSorted({ lado = 56 }: { lado?: number }) {
  return (
    <View style={styles.fila}>
      <SimboloSorted lado={lado} />
      <Text style={[styles.nombre, { fontSize: lado * 0.62 }]}>Sorted</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  icono: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.25)',
    shadowColor: colores.primario,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  nombre: { color: colores.texto, fontFamily: fuentes.extra, letterSpacing: -1 },
});
