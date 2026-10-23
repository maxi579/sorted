import { Ionicons } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { colores, degradados, radios } from '../constants/tema';
import { appleDisponible, IngresoCancelado, ingresarConApple, ingresarConGoogle } from '../lib/ingresoSocial';
import { supabase } from '../lib/supabase';
import { LogoSorted } from './Logo';
import { PoliticaPrivacidad } from './Privacidad';
import { Boton, Entrada, Texto as Text } from './ui';

const BENEFICIOS = [
  { icono: 'chatbubble-ellipses-outline', texto: 'Cargá gastos escribiendo como hablás' },
  { icono: 'calendar-outline', texto: 'Mirá tus cuotas de los próximos meses' },
  { icono: 'calculator-outline', texto: 'Sabé si te conviene contado o en cuotas' },
] as const;

type Props = { onProbarDemo: () => void; errorInicial?: string | null };

export default function PantallaLogin({ onProbarDemo, errorInicial = null }: Props) {
  const [modo, setModo] = useState<'ingresar' | 'registrarse'>('ingresar');
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conApple, setConApple] = useState(false);
  const [entrandoCon, setEntrandoCon] = useState<'google' | 'apple' | null>(null);
  const [verPrivacidad, setVerPrivacidad] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    appleDisponible().then(setConApple).catch(() => setConApple(false));
  }, []);

  const esRegistro = modo === 'registrarse';
  const mensajeError = error ?? errorInicial;

  async function entrarCon(proveedor: 'google' | 'apple') {
    setError(null);
    setEntrandoCon(proveedor);
    try {
      if (proveedor === 'google') await ingresarConGoogle();
      else await ingresarConApple();
    } catch (e) {
      if (!(e instanceof IngresoCancelado)) setError(traducirError((e as Error).message));
    }
    setEntrandoCon(null);
  }

  async function enviar() {
    setError(null);
    if (!email || !password || (esRegistro && !nombre)) {
      setError('Completá todos los campos.');
      return;
    }
    setCargando(true);
    const { error } = esRegistro
      ? await supabase.auth.signUp({ email, password, options: { data: { nombre } } })
      : await supabase.auth.signInWithPassword({ email, password });
    setCargando(false);
    if (error) setError(traducirError(error.message));
  }

  return (
    <LinearGradient colors={degradados.login} locations={[0, 0.55]} style={styles.fondo}>
      <KeyboardAvoidingView style={styles.fondo} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeInDown.springify()} style={styles.logo}>
            <LogoSorted />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).springify()}>
            <Text style={styles.titulo}>{esRegistro ? 'Creá tu cuenta' : 'Tu plata, clara.'}</Text>
            <Text style={styles.subtitulo}>Tarjetas, cuotas y gastos bajo control.</Text>
          </Animated.View>

          {!esRegistro && (
            <Animated.View entering={FadeInDown.delay(160).springify()} style={styles.beneficios}>
              {BENEFICIOS.map((b) => (
                <View key={b.texto} style={styles.beneficio}>
                  <View style={styles.beneficioIcono}>
                    <Ionicons name={b.icono} size={18} color={colores.primario} />
                  </View>
                  <Text style={styles.beneficioTexto}>{b.texto}</Text>
                </View>
              ))}
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.delay(240).springify()} style={styles.formulario}>
            {/* Entrar sin contraseña: lo más cómodo, sobre todo para personas mayores */}
            <Pressable
              style={({ pressed }) => [styles.botonGoogle, pressed && { opacity: 0.85 }]}
              onPress={() => entrarCon('google')}
              disabled={entrandoCon !== null}
              accessibilityLabel="Continuar con Google"
            >
              {entrandoCon === 'google' ? (
                <ActivityIndicator color="#1f1f1f" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#1f1f1f" />
                  <Text style={styles.textoGoogle}>Continuar con Google</Text>
                </>
              )}
            </Pressable>
            {conApple && (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
                cornerRadius={radios.medio}
                style={styles.botonApple}
                onPress={() => entrarCon('apple')}
              />
            )}

            <View style={styles.separador}>
              <View style={styles.linea} />
              <Text style={styles.separadorTexto}>o con tu email</Text>
              <View style={styles.linea} />
            </View>

            {esRegistro && <Entrada style={styles.input} placeholder="Tu nombre" value={nombre} onChangeText={setNombre} />}
            <Entrada
              style={styles.input}
              placeholder="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <Entrada style={styles.input} placeholder="Contraseña" value={password} onChangeText={setPassword} secureTextEntry />

            {mensajeError && <Text style={styles.error}>{mensajeError}</Text>}

            <Boton titulo={esRegistro ? 'Crear cuenta' : 'Ingresar'} onPress={enviar} cargando={cargando} estilo={{ marginTop: 4 }} />

            <Pressable
              onPress={() => {
                setModo(esRegistro ? 'ingresar' : 'registrarse');
                setError(null);
              }}
            >
              <Text style={styles.cambiarModo}>{esRegistro ? '¿Ya tenés cuenta? Ingresá' : '¿No tenés cuenta? Registrate'}</Text>
            </Pressable>

            <View style={styles.separador}>
              <View style={styles.linea} />
              <Text style={styles.separadorTexto}>o</Text>
              <View style={styles.linea} />
            </View>

            <Boton titulo="Probar con datos de ejemplo" variante="secundario" onPress={onProbarDemo} />

            <Pressable onPress={() => setVerPrivacidad(true)} hitSlop={8} style={styles.privacidad}>
              <Ionicons name="shield-checkmark-outline" size={15} color={colores.textoTenue} />
              <Text style={styles.textoPrivacidad}>Cómo cuidamos tus datos</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={verPrivacidad} animationType="slide" onRequestClose={() => setVerPrivacidad(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + 12 }]}>
          <View style={styles.barraModal}>
            <Text style={styles.tituloModal}>Privacidad</Text>
            <Pressable onPress={() => setVerPrivacidad(false)} hitSlop={12} accessibilityLabel="Cerrar">
              <Ionicons name="close" size={26} color={colores.texto} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 40 }}>
            <PoliticaPrivacidad />
          </ScrollView>
        </View>
      </Modal>
    </LinearGradient>
  );
}

function traducirError(mensaje: string) {
  if (mensaje.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (mensaje.includes('already registered')) return 'Ya existe una cuenta con ese email.';
  if (mensaje.includes('Password should be')) return 'La contraseña tiene que tener al menos 6 caracteres.';
  if (mensaje.includes('provider is not enabled') || mensaje.includes('Unsupported provider')) {
    return 'Esta forma de entrar todavía no está activada. Probá con tu email.';
  }
  if (mensaje.includes('valid email') || mensaje.includes('invalid')) return 'Revisá que el email esté bien escrito.';
  return mensaje;
}

const styles = StyleSheet.create({
  fondo: { flex: 1 },
  privacidad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 22 },
  textoPrivacidad: { color: colores.textoTenue, fontSize: 14 },
  modal: { flex: 1, backgroundColor: colores.fondo },
  barraModal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  tituloModal: { color: colores.texto, fontSize: 26, fontWeight: '800' },
  contenido: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingVertical: 60, maxWidth: 480, width: '100%', alignSelf: 'center' },
  logo: { marginBottom: 28 },
  titulo: { fontSize: 36, fontWeight: '800', color: colores.texto, letterSpacing: -1.2 },
  subtitulo: { fontSize: 16, color: colores.textoSecundario, marginTop: 6 },
  beneficios: { gap: 12, marginTop: 28 },
  beneficio: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  beneficioIcono: {
    width: 36,
    height: 36,
    borderRadius: radios.chico,
    backgroundColor: colores.primarioSuave,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beneficioTexto: { color: colores.textoChip, fontSize: 15, flex: 1 },
  formulario: { marginTop: 32 },
  botonGoogle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: radios.medio,
    height: 52,
  },
  textoGoogle: { color: '#1f1f1f', fontSize: 16, fontWeight: '600' },
  botonApple: { width: '100%', height: 52, marginTop: 12 },
  input: {
    backgroundColor: colores.superficie,
    color: colores.texto,
    borderRadius: radios.medio,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  error: { color: colores.error, textAlign: 'center', marginBottom: 12 },
  cambiarModo: { color: colores.primario, textAlign: 'center', marginTop: 18, fontSize: 15, fontWeight: '600' },
  separador: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 22 },
  linea: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colores.borde },
  separadorTexto: { color: colores.textoTenue, fontSize: 13 },
});
