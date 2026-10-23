import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colores, radios } from '../constants/tema';
import { Texto } from './ui';

type TipoAviso = 'exito' | 'error' | 'info';
type Aviso = { id: number; texto: string; tipo: TipoAviso };
type MostrarAviso = (texto: string, tipo?: TipoAviso) => void;

const ContextoAvisos = createContext<MostrarAviso>(() => {});

// Cualquier pantalla puede hacer: const aviso = useAviso(); aviso('Listo!');
export function useAviso() {
  return useContext(ContextoAvisos);
}

const ICONO: Record<TipoAviso, keyof typeof Ionicons.glyphMap> = {
  exito: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};

const COLOR: Record<TipoAviso, string> = {
  exito: colores.primario,
  error: colores.error,
  info: colores.textoChip,
};

export function ProveedorAvisos({ children }: { children: ReactNode }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const mostrar = useCallback<MostrarAviso>((texto, tipo = 'exito') => {
    if (temporizador.current) clearTimeout(temporizador.current);
    if (tipo === 'info') Haptics.selectionAsync();
    else Haptics.notificationAsync(tipo === 'error' ? Haptics.NotificationFeedbackType.Error : Haptics.NotificationFeedbackType.Success);
    setAviso({ id: Date.now(), texto, tipo });
    temporizador.current = setTimeout(() => setAviso(null), 3800);
  }, []);

  return (
    <ContextoAvisos.Provider value={mostrar}>
      {children}
      {aviso && (
        <Animated.View
          key={aviso.id}
          entering={FadeInUp.springify()}
          exiting={FadeOutUp}
          pointerEvents="none"
          style={[styles.contenedor, { top: insets.top + 8 }]}
        >
          <View style={[styles.aviso, { borderColor: COLOR[aviso.tipo] }]}>
            <Ionicons name={ICONO[aviso.tipo]} size={22} color={COLOR[aviso.tipo]} />
            <Texto style={styles.texto}>{aviso.texto}</Texto>
          </View>
        </Animated.View>
      )}
    </ContextoAvisos.Provider>
  );
}

const styles = StyleSheet.create({
  contenedor: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colores.superficie,
    borderWidth: 1,
    borderRadius: radios.grande,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: colores.sombra,
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  texto: { color: colores.texto, fontSize: 15, fontWeight: '600', flexShrink: 1 },
});