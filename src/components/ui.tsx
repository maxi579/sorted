import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colores, espacios, fuentes, radios } from '../constants/tema';
import { Objetivo } from './Foco';

const PressableAnimado = Animated.createAnimatedComponent(Pressable);

// Cada grosor de letra es un archivo de fuente distinto: elegimos el que corresponde
const FAMILIA_POR_PESO: Record<string, string> = {
  normal: fuentes.regular,
  '400': fuentes.regular,
  '500': fuentes.medio,
  '600': fuentes.semi,
  bold: fuentes.bold,
  '700': fuentes.bold,
  '800': fuentes.extra,
  '900': fuentes.extra,
};

// Igual que Text, pero con nuestra fuente según el fontWeight del estilo
export function Texto({ style, ...props }: TextProps) {
  const { fontWeight, ...resto } = StyleSheet.flatten(style) ?? {};
  const familia = FAMILIA_POR_PESO[String(fontWeight ?? '400')] ?? fuentes.regular;
  return <RNText {...props} style={[{ fontFamily: familia }, resto]} />;
}

// Igual que TextInput, pero con nuestra fuente y el color de placeholder del tema
export function Entrada({ style, ...props }: TextInputProps) {
  return (
    <RNTextInput
      placeholderTextColor={colores.textoTenue}
      selectionColor={colores.primario}
      cursorColor={colores.primario}
      keyboardAppearance="dark"
      {...props}
      style={[{ fontFamily: fuentes.regular }, style]}
    />
  );
}

type Variante = 'primario' | 'secundario' | 'peligro';

type PropsBoton = { titulo: string; onPress: () => void; variante?: Variante; cargando?: boolean; estilo?: ViewStyle };

export function Boton({ titulo, onPress, variante = 'primario', cargando = false, estilo }: PropsBoton) {
  const escala = useSharedValue(1);
  const estiloAnimado = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }));
  const colorTexto =
    variante === 'primario' ? colores.sobrePrimario : variante === 'peligro' ? colores.peligro : colores.texto;

  return (
    <PressableAnimado
      onPressIn={() => escala.set(withSpring(0.96))}
      onPressOut={() => escala.set(withSpring(1))}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      disabled={cargando}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: cargando, busy: cargando }}
      style={[styles.boton, styles[variante], estiloAnimado, estilo]}
    >
      {cargando ? <ActivityIndicator color={colorTexto} /> : <Texto style={[styles.textoBoton, { color: colorTexto }]}>{titulo}</Texto>}
    </PressableAnimado>
  );
}

type PropsChip = { etiqueta: string; activo: boolean; onPress: () => void };

export function Chip({ etiqueta, activo, onPress }: PropsChip) {
  return (
    <Pressable
      style={({ pressed }) => [styles.chip, activo && styles.chipActivo, pressed && styles.presionado]}
      hitSlop={espacios.xs}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
    >
      <Texto style={[styles.textoChip, activo && styles.textoChipActivo]}>{etiqueta}</Texto>
    </Pressable>
  );
}

type PropsCampo = TextInputProps & { etiqueta: string; contenedor?: ViewStyle };

export function Campo({ etiqueta, contenedor, style, ...props }: PropsCampo) {
  return (
    <View style={contenedor}>
      <Etiqueta>{etiqueta}</Etiqueta>
      <Entrada accessibilityLabel={etiqueta} style={[styles.input, style]} {...props} />
    </View>
  );
}

export function Etiqueta({ children }: { children: ReactNode }) {
  return <Texto style={styles.etiqueta}>{children}</Texto>;
}

export function Tarjeta({ children, estilo }: { children: ReactNode; estilo?: ViewStyle }) {
  return <View style={[styles.tarjeta, estilo]}>{children}</View>;
}

// Título grande de cada pantalla, con espacio para el notch del celular.
// volver: muestra "← Volver" (para las pantallas que no tienen pestaña propia)
// ayuda: muestra un ❓ a la derecha del título que abre la explicación de la sección
export function Encabezado({ titulo, subtitulo, volver = false, ayuda }: { titulo: string; subtitulo?: string; volver?: boolean; ayuda?: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + espacios.m, marginBottom: espacios.xl }}>
      {volver && (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))}
          hitSlop={12}
          style={({ pressed }) => [styles.volver, pressed && styles.presionado]}
          accessibilityLabel="Volver"
        >
          <Ionicons name="chevron-back" size={20} color={colores.primario} />
          <Texto style={styles.textoVolver}>Volver</Texto>
        </Pressable>
      )}
      <View style={styles.filaTitulo}>
        <Texto style={[styles.tituloGrande, { flex: 1 }]} accessibilityRole="header">
          {titulo}
        </Texto>
        {ayuda && (
          <Objetivo id="boton-ayuda">
            <Pressable onPress={ayuda} hitSlop={12} style={({ pressed }) => [styles.ayuda, pressed && styles.presionado]} accessibilityLabel="Cómo funciona esta sección">
              <Ionicons name="help-circle-outline" size={28} color={colores.textoSecundario} />
            </Pressable>
          </Objetivo>
        )}
      </View>
      {subtitulo && <Texto style={styles.subtituloGrande}>{subtitulo}</Texto>}
    </View>
  );
}

// Pregunta antes de una acción destructiva. En la web Alert no muestra botones, así que usamos confirm().
export function confirmar(titulo: string, mensaje: string, textoAccion: string, accion: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${titulo}\n\n${mensaje}`)) accion();
    return;
  }
  Alert.alert(titulo, mensaje, [
    { text: 'Cancelar', style: 'cancel' },
    { text: textoAccion, style: 'destructive', onPress: accion },
  ]);
}

const styles = StyleSheet.create({
  boton: { minHeight: 50, borderRadius: radios.medio, paddingHorizontal: espacios.xl, alignItems: 'center', justifyContent: 'center' },
  primario: { backgroundColor: colores.primario },
  secundario: { backgroundColor: colores.superficieAlta },
  peligro: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colores.peligro },
  presionado: { opacity: 0.75 },
  textoBoton: { fontWeight: 'bold', fontSize: 16 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: espacios.l, borderRadius: 999, borderWidth: 1, borderColor: colores.borde },
  chipActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  textoChip: { color: colores.textoChip, fontSize: 14, fontWeight: '600' },
  textoChipActivo: { color: colores.sobrePrimario },
  etiqueta: { color: colores.textoSecundario, fontSize: 13, fontWeight: '500', marginTop: espacios.l, marginBottom: espacios.s },
  input: {
    backgroundColor: colores.superficieAlta,
    color: colores.texto,
    borderRadius: radios.chico,
    minHeight: 50,
    paddingHorizontal: espacios.m,
    paddingVertical: espacios.m,
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tarjeta: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: espacios.l, borderWidth: 1, borderColor: colores.borde },
  filaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ayuda: { padding: 2 },
  volver: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 8, marginLeft: -4 },
  textoVolver: { color: colores.primario, fontSize: 16, fontWeight: '600' },
  tituloGrande: { color: colores.texto, fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
  subtituloGrande: { color: colores.textoSecundario, fontSize: 15, marginTop: espacios.xs },
});