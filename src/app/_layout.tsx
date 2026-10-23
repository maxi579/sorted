import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';
import { Ionicons } from '@expo/vector-icons';
import type { Session } from '@supabase/supabase-js';
import { useFonts } from 'expo-font';
import { router, Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View, type ColorValue } from 'react-native';
import PantallaLogin from '../components/PantallaLogin';
import { ProveedorAvisos } from '../components/Toast';
import { Objetivo, ProveedorTutorial } from '../components/Tutorial';
import { colores, fuentes } from '../constants/tema';
import * as Linking from 'expo-linking';
import { escucharToques } from '../lib/avisos';
import { sesionDesdeLink, traeSesion } from '../lib/ingresoSocial';
import { ProveedorBloqueo } from '../components/Bloqueo';
import { ProveedorDatos } from '../lib/contextoDatos';
import { fuenteSupabase } from '../lib/datos';
import { crearFuenteDemo } from '../lib/demo';
import { soloDemo, supabase } from '../lib/supabase';

export default function Layout() {
  const [sesion, setSesion] = useState<Session | null>(null);
  const [cargando, setCargando] = useState(!soloDemo);
  const [modoDemo, setModoDemo] = useState(soloDemo);
  const [errorIngreso, setErrorIngreso] = useState<string | null>(null);
  const [fuentesListas] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (soloDemo) return;
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      setCargando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => setSesion(nuevaSesion));
    return () => data.subscription.unsubscribe();
  }, []);

  // Al volver de Google la sesión llega en el link: en la web, en la dirección de la página;
  // en el celular, normalmente la atrapa la ventana de Google, y si no, llega como link a la app.
  useEffect(() => {
    if (soloDemo) return;
    const atender = (url: string | null) => {
      if (!url || !traeSesion(url)) return;
      sesionDesdeLink(url).catch((e) => setErrorIngreso((e as Error).message));
    };
    if (Platform.OS === 'web') {
      const url = window.location.href;
      // Sacamos los datos de la dirección para que no queden a la vista ni en el historial
      if (traeSesion(url)) window.history.replaceState(null, '', window.location.pathname);
      atender(url);
      return;
    }
    Linking.getInitialURL().then(atender);
    const suscripcion = Linking.addEventListener('url', ({ url }) => atender(url));
    return () => suscripcion.remove();
  }, []);

  // Tocar el recordatorio de la noche abre directo la pantalla para anotar
  const listo = !cargando && (sesion !== null || modoDemo);
  useEffect(() => {
    if (!listo) return;
    return escucharToques((url) => router.push(url as Parameters<typeof router.push>[0]));
  }, [listo]);

  // Cada vez que se entra al modo demo arranca con los datos de ejemplo desde cero.
  // En la versión solo demo, "salir" vuelve a empezar con los datos originales.
  const [reinicios, setReinicios] = useState(0);
  const fuente = useMemo(
    () => (modoDemo ? crearFuenteDemo(() => (soloDemo ? setReinicios((n) => n + 1) : setModoDemo(false))) : fuenteSupabase),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modoDemo, reinicios]
  );

  let contenido;
  if (cargando || !fuentesListas) {
    contenido = (
      <View style={{ flex: 1, backgroundColor: colores.fondo, justifyContent: 'center' }}>
        <ActivityIndicator color={colores.primario} size="large" />
      </View>
    );
  } else if (!sesion && !modoDemo) {
    contenido = <PantallaLogin onProbarDemo={() => setModoDemo(true)} errorInicial={errorIngreso} />;
  } else {
    contenido = (
      <ProveedorDatos fuente={fuente}>
        <ProveedorTutorial listo>
        <Tabs
          // "Volver" sigue el historial real (de Ahorros vuelve a Más), no salta siempre a Inicio
          backBehavior="history"
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: colores.fondo },
            tabBarActiveTintColor: colores.primario,
            tabBarInactiveTintColor: colores.textoTenue,
            tabBarStyle: styles.barra,
            tabBarLabelStyle: { fontFamily: fuentes.semi, fontSize: 11, lineHeight: 14 },
          }}
        >
          <Tabs.Screen name="index" options={{ title: 'Inicio', tabBarIcon: icono('home') }} />
          <Tabs.Screen name="fijos" options={{ title: 'Fijos', tabBarIcon: icono('repeat', 'pestana-fijos') }} />
          <Tabs.Screen
            name="cargar"
            options={{
              title: 'Cargar',
              tabBarLabel: () => null,
              tabBarIcon: () => (
                <Objetivo id="pestana-cargar">
                  <View style={styles.botonCargar}>
                    <Ionicons name="add" size={26} color={colores.sobrePrimario} accessibilityLabel="Cargar gasto" />
                  </View>
                </Objetivo>
              ),
            }}
          />
          <Tabs.Screen name="chat" options={{ title: 'Asistente', tabBarIcon: icono('chatbubbles', 'pestana-asistente') }} />
          <Tabs.Screen name="mas" options={{ title: 'Más', tabBarIcon: icono('grid', 'pestana-mas') }} />
          {/* Pantallas sin pestaña: se abren desde "Más" o desde Inicio */}
          <Tabs.Screen name="cuotas" options={{ href: null, title: 'Cuotas' }} />
          <Tabs.Screen name="comprar" options={{ href: null, title: '¿Lo compro?' }} />
          <Tabs.Screen name="ajustes" options={{ href: null, title: 'Ajustes' }} />
          <Tabs.Screen name="resumen" options={{ href: null, title: 'Revisar resumen' }} />
          <Tabs.Screen name="efectivo" options={{ href: null, title: 'Efectivo' }} />
          <Tabs.Screen name="activos" options={{ href: null, title: 'Activos' }} />
          <Tabs.Screen name="ahorros" options={{ href: null, title: 'Ahorros' }} />
          <Tabs.Screen name="rendimiento" options={{ href: null, title: '¿Cuánto me rinde?' }} />
          <Tabs.Screen name="revisar" options={{ href: null, title: 'Pagos para revisar' }} />
          <Tabs.Screen name="automatico" options={{ href: null, title: 'Anotar sin esfuerzo' }} />
          <Tabs.Screen name="privacidad" options={{ href: null, title: 'Privacidad' }} />
          <Tabs.Screen name="exportar" options={{ href: null, title: 'Exportar a PDF' }} />
        </Tabs>
        </ProveedorTutorial>
      </ProveedorDatos>
    );
    // Face ID / huella al abrir (solo con cuenta: el modo de prueba no tiene nada que proteger)
    if (!modoDemo) contenido = <ProveedorBloqueo onSalir={() => fuente.salir()}>{contenido}</ProveedorBloqueo>;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <ProveedorAvisos>{contenido}</ProveedorAvisos>
    </SafeAreaProvider>
  );
}

// Ícono relleno en la pestaña activa y de contorno en las demás.
// Con objetivo, el recorrido guiado puede iluminar esa pestaña.
function icono(nombre: 'home' | 'repeat' | 'chatbubbles' | 'grid', objetivo?: string) {
  function IconoPestana({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) {
    const dibujo = <Ionicons name={focused ? nombre : `${nombre}-outline`} color={color} size={size - 1} />;
    return objetivo ? <Objetivo id={objetivo}>{dibujo}</Objetivo> : dibujo;
  }
  return IconoPestana;
}

const styles = StyleSheet.create({
  barra: {
    backgroundColor: colores.superficie,
    // Sin borde ni sombra arriba: se veía como una línea blanca sobre la barra
    borderTopWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
    // En la web no hay área segura abajo: le damos un poco más de alto para que entren los textos
    // En el iPhone con la web agregada a la pantalla de inicio, suma el espacio de la rayita de abajo
    ...(Platform.OS === 'web' && {
      height: 'calc(62px + env(safe-area-inset-bottom))' as unknown as number,
      paddingBottom: 'max(6px, env(safe-area-inset-bottom))' as unknown as number,
    }),
  },
  // Pastilla sólida, sin halo: se distingue por forma y color, no por brillo
  botonCargar: {
    width: 56,
    height: 40,
    borderRadius: 999,
    marginTop: 8,
    backgroundColor: colores.primario,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
