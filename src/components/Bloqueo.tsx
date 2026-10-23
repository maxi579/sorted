import { Ionicons } from '@expo/vector-icons';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colores } from '../constants/tema';
import {
  activarBloqueo,
  biometriaDisponible,
  bloqueoActivado,
  desactivarBloqueo,
  desbloquear,
  MARGEN_SEGUNDO_PLANO_MS,
  type Biometria,
} from '../lib/bloqueo';
import { SimboloSorted } from './Logo';
import { Boton, Texto as Text } from './ui';

type ContextoBloqueo = { activo: boolean; biometria: Biometria | null; cambiar: (activo: boolean) => Promise<void> };

const Contexto = createContext<ContextoBloqueo>({ activo: false, biometria: null, cambiar: async () => {} });

export const useBloqueo = () => useContext(Contexto);

/**
 * Si el bloqueo está prendido, tapa la app con Face ID / huella al abrirla
 * y cuando volvés después de más de un minuto en segundo plano.
 */
export function ProveedorBloqueo({ children, onSalir }: PropsWithChildren<{ onSalir: () => void }>) {
  const [activo, setActivo] = useState(false);
  const [bloqueada, setBloqueada] = useState<boolean | null>(null); // null: todavía no sabemos
  const [biometria, setBiometria] = useState<Biometria | null>(null);
  const [probando, setProbando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const enSegundoPlanoDesde = useRef<number | null>(null);
  const insets = useSafeAreaInsets();

  const intentar = useCallback(async () => {
    setProbando(true);
    setFallo(false);
    const ok = await desbloquear();
    setProbando(false);
    if (ok) setBloqueada(false);
    else setFallo(true);
  }, []);

  useEffect(() => {
    biometriaDisponible().then(setBiometria);
    bloqueoActivado().then((prendido) => {
      setActivo(prendido);
      setBloqueada(prendido);
      // En el celular lo pedimos de una; en la web el navegador exige que la persona toque un botón
      if (prendido && Platform.OS !== 'web') intentar();
    });
  }, [intentar]);

  useEffect(() => {
    if (!activo) return;
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'background') enSegundoPlanoDesde.current = Date.now();
      if (estado !== 'active' || enSegundoPlanoDesde.current === null) return;
      const pasaron = Date.now() - enSegundoPlanoDesde.current;
      enSegundoPlanoDesde.current = null;
      if (pasaron > MARGEN_SEGUNDO_PLANO_MS) {
        setBloqueada(true);
        if (Platform.OS !== 'web') intentar();
      }
    });
    return () => suscripcion.remove();
  }, [activo, intentar]);

  const cambiar = useCallback(async (prender: boolean) => {
    if (prender) await activarBloqueo();
    else await desactivarBloqueo();
    setActivo(prender);
  }, []);

  // Si Face ID deja de andar (por ejemplo, se borró la llave), se puede salir y volver a entrar con Google
  async function salir() {
    await desactivarBloqueo();
    setActivo(false);
    setBloqueada(false);
    onSalir();
  }

  if (bloqueada === null) return <View style={styles.fondo} />;

  const nombre = biometria?.nombre ?? 'Face ID o huella';
  return (
    <Contexto.Provider value={{ activo, biometria, cambiar }}>
      {bloqueada ? (
        <Animated.View entering={FadeIn} style={[styles.fondo, styles.centro, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.centro}>
            <SimboloSorted lado={72} />
            <View style={styles.candado}>
              <Ionicons name={biometria?.icono ?? 'lock-closed'} size={22} color={colores.primario} />
            </View>
            <Text style={styles.titulo}>Sorted está bloqueada</Text>
            <Text style={styles.texto}>{fallo ? 'No te reconoció. Probá de nuevo.' : `Desbloqueala con ${nombre}.`}</Text>
          </View>
          <View style={styles.acciones}>
            <Boton titulo={`Desbloquear con ${nombre}`} onPress={intentar} cargando={probando} />
            <Pressable onPress={salir} hitSlop={10}>
              <Text style={styles.salir}>¿No funciona? Cerrar sesión y volver a entrar</Text>
            </Pressable>
          </View>
        </Animated.View>
      ) : (
        children
      )}
    </Contexto.Provider>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: colores.fondo },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  titulo: { color: colores.texto, fontSize: 24, fontWeight: '800', marginTop: 24, textAlign: 'center' },
  texto: { color: colores.textoSecundario, fontSize: 16, marginTop: 8, textAlign: 'center' },
  acciones: { alignSelf: 'stretch', gap: 18 },
  candado: { marginTop: -18, marginLeft: 56, width: 36, height: 36, borderRadius: 18, backgroundColor: colores.superficieAlta, borderWidth: 2, borderColor: colores.fondo, alignItems: 'center', justifyContent: 'center' },
  salir: { color: colores.textoTenue, fontSize: 14, textAlign: 'center' },
});
