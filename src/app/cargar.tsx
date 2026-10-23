import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import FormularioGasto from '../components/FormularioGasto';
import { useAviso } from '../components/Toast';
import { Objetivo } from '../components/Tutorial';
import { Boton, Encabezado, Entrada as TextInput, Tarjeta, Texto as Text } from '../components/ui';
import { colores, radios } from '../constants/tema';
import { programarRecordatorios } from '../lib/avisos';
import { categoriaAprendida } from '../lib/aprendizaje';
import { elegirFoto, leerComprobante, type Comprobante } from '../lib/comprobante';
import { useDatos } from '../lib/contextoDatos';
import { fechaParaMostrar, montoATexto } from '../lib/formato';
import { fechaDesdeTexto, prepararGasto, type ValoresGasto } from '../lib/gastos';
import { interpretarGasto } from '../lib/interpretarGasto';
import type { GastoGuardado, MedioPago } from '../lib/tipos';

const EJEMPLOS = ['pizza 18 lucas con mp', 'zapas 120k en 6 cuotas con visa', 'super 45.300 con master', 'uber 7500 efectivo'];

// Valores del formulario a partir de lo que escribió (o dictó) la persona
// historial: si ya anotó algo parecido, usa la categoría que eligió esa vez
function valoresDesdeTexto(entrada: string, medios: MedioPago[], historial: GastoGuardado[] = []): ValoresGasto {
  const resultado = interpretarGasto(entrada, medios);
  return {
    descripcion: resultado.descripcion,
    montoTexto: resultado.monto ? montoATexto(resultado.monto) : '',
    cuotasTexto: String(resultado.cuotas),
    moneda: resultado.moneda,
    medioId: resultado.medioId,
    categoria: categoriaAprendida(resultado.descripcion, historial) ?? resultado.categoria,
  };
}

export default function Cargar() {
  const datos = useDatos();
  const aviso = useAviso();
  // Siri / Atajos abren la app con sorted://cargar?texto=café 3500 con mp (y &guardar=si para guardarlo directo)
  const parametros = useLocalSearchParams<{ texto?: string; guardar?: string }>();
  const [texto, setTexto] = useState('');
  const [medios, setMedios] = useState<MedioPago[] | null>(null);
  const [historial, setHistorial] = useState<GastoGuardado[]>([]);
  const [valores, setValores] = useState<ValoresGasto | null>(null);
  const [guardando, setGuardando] = useState(false);
  const ultimoTextoExterno = useRef<string | null>(null);
  // Lo que leyó el escáner: la fecha del ticket y si es una factura de servicio
  const [escaneado, setEscaneado] = useState<Comprobante | null>(null);
  const [escaneando, setEscaneando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      datos.gastos().then(setHistorial).catch(() => {});
      datos.medios().then(setMedios).catch((e) => {
        setMedios([]);
        aviso(e.message, 'error');
      });
    }, [datos, aviso])
  );

  // Cuando llega un texto desde Siri, esperamos a tener las tarjetas para reconocer "con visa"
  useEffect(() => {
    const externo = parametros.texto?.trim();
    if (!externo || !medios || ultimoTextoExterno.current === externo) return;
    ultimoTextoExterno.current = externo;
    const nuevos = valoresDesdeTexto(externo, medios, historial);
    setTexto(externo);
    setEscaneado(null);
    setValores(nuevos);
    router.setParams({ texto: undefined, guardar: undefined });
    if (parametros.guardar === 'si' && nuevos.montoTexto) guardar(nuevos, externo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parametros.texto, medios]);

  function interpretar(entrada = texto) {
    if (!entrada.trim()) return aviso('Escribí tu gasto primero 🙂', 'info');
    setEscaneado(null);
    setValores(valoresDesdeTexto(entrada, medios ?? [], historial));
  }

  async function escanear(origen: 'camara' | 'galeria') {
    try {
      const foto = await elegirFoto(origen);
      if (!foto) return;
      setEscaneando(true);
      const comprobante = await leerComprobante(foto, datos.esDemo);
      // El medio de pago lo adivinamos como con el texto ("mercado pago" en la descripción, etc.)
      const adivinado = valoresDesdeTexto(comprobante.descripcion, medios ?? []);
      setTexto('');
      setEscaneado(comprobante);
      setValores({
        descripcion: comprobante.descripcion,
        montoTexto: comprobante.monto ? montoATexto(comprobante.monto) : '',
        cuotasTexto: String(comprobante.cuotas),
        moneda: comprobante.moneda,
        medioId: adivinado.medioId,
        categoria: categoriaAprendida(comprobante.descripcion, historial) ?? comprobante.categoria,
      });
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
    setEscaneando(false);
  }

  // Factura de servicio: en vez de anotarla como gasto, la agregamos a Fijos para pagarla y que avise cada mes
  async function agregarAFijos() {
    if (!escaneado || !valores) return;
    try {
      await datos.fijos.crear({
        descripcion: valores.descripcion.trim() || escaneado.descripcion,
        categoria: valores.categoria,
        tipo: 'servicio',
        monto: null,
        moneda: valores.moneda,
        dia: escaneado.vencimiento ? Number(escaneado.vencimiento.slice(8, 10)) : 10,
        tarjeta_id: valores.medioId,
        debito_automatico: false,
        activo: true,
      });
      setValores(null);
      setEscaneado(null);
      aviso('Agregado a tus fijos. Pagalo desde ahí 🧾');
      router.push('/fijos');
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
  }

  async function guardar(aGuardar = valores, textoOriginal = texto) {
    if (!aGuardar) return;
    // Si vino de un ticket escaneado, usamos la fecha del ticket (si no es del futuro)
    const fechaTicket = escaneado?.fecha ? fechaDesdeTexto(escaneado.fecha) : null;
    const fecha = fechaTicket && fechaTicket <= new Date() ? fechaTicket : new Date();
    const preparado = prepararGasto(aGuardar, medios ?? [], fecha);
    if (preparado.error) return aviso(preparado.error, 'error');

    setGuardando(true);
    try {
      const resultado = await datos.crearGasto({ ...preparado.fila, texto_original: textoOriginal });
      setValores(null);
      setTexto('');
      setEscaneado(null);
      // Ya anotó algo hoy: esta noche no hace falta recordárselo
      if (!datos.esDemo) programarRecordatorios(true).catch(() => {});
      if (resultado === 'pendiente') aviso('Anotado en el celular. Se sube solo cuando haya internet 📶', 'info');
      else aviso('Listo, anotado 👌');
    } catch (e) {
      aviso(`No se pudo guardar: ${(e as Error).message}`, 'error');
    }
    setGuardando(false);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Encabezado titulo="¿En qué gastaste?" subtitulo="Escribilo como te salga y la app lo entiende." />

      <Objetivo id="caja-gasto">
      <View style={styles.cajaEntrada}>
        <Ionicons name="chatbubble-ellipses-outline" size={20} color={colores.primario} style={{ marginTop: 2 }} />
        <TextInput
          style={styles.inputPrincipal}
          placeholder="Ej: zapas 120k en 6 cuotas"
          value={texto}
          onChangeText={setTexto}
          multiline
          onSubmitEditing={() => interpretar()}
        />
      </View>
      </Objetivo>
      <Boton titulo="Siguiente" onPress={() => interpretar()} estilo={{ marginTop: 12 }} />

      {!valores && (
        <Objetivo id="escaner">
        <View style={styles.escaner}>
          {escaneando ? (
            <View style={styles.leyendo}>
              <ActivityIndicator color={colores.primario} />
              <Text style={styles.resumenTexto}>Leyendo el comprobante...</Text>
            </View>
          ) : (
            <>
              <Text style={styles.resumenTitulo}>¿Tenés el ticket o el comprobante?</Text>
              <Text style={styles.resumenTexto}>Sacale una foto o elegí la captura de Mercado Pago, y lo anoto yo.</Text>
              <View style={styles.botonesEscaner}>
                <Pressable style={({ pressed }) => [styles.botonEscaner, pressed && { opacity: 0.7 }]} onPress={() => escanear('camara')}>
                  <Ionicons name="camera" size={20} color={colores.primario} />
                  <Text style={styles.textoEscaner}>Sacar foto</Text>
                </Pressable>
                <Pressable style={({ pressed }) => [styles.botonEscaner, pressed && { opacity: 0.7 }]} onPress={() => escanear('galeria')}>
                  <Ionicons name="images" size={20} color={colores.primario} />
                  <Text style={styles.textoEscaner}>Elegir captura</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
        </Objetivo>
      )}

      {!valores && (
        <View style={{ marginTop: 24 }}>
          <Text style={styles.etiquetaEjemplos}>Probá con un ejemplo</Text>
          <View style={styles.ejemplos}>
            {EJEMPLOS.map((ejemplo) => (
              <Pressable
                key={ejemplo}
                style={({ pressed }) => [styles.ejemplo, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  setTexto(ejemplo);
                  interpretar(ejemplo);
                }}
              >
                <Text style={styles.textoEjemplo}>“{ejemplo}”</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {!valores && (
        <Pressable style={({ pressed }) => [styles.resumen, pressed && { opacity: 0.8 }]} onPress={() => router.push('/resumen')}>
          <View style={styles.resumenIcono}>
            <Ionicons name="document-text" size={22} color={colores.primario} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.resumenTitulo}>¿Te olvidaste de anotar algo?</Text>
            <Text style={styles.resumenTexto}>Subí el resumen de tu tarjeta y te digo qué gastos te faltan.</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colores.textoTenue} />
        </Pressable>
      )}

      {valores && (
        <Animated.View entering={FadeInDown.springify()}>
          <Tarjeta estilo={{ marginTop: 20 }}>
            <View style={styles.encabezadoResultado}>
              <Ionicons name="sparkles" size={16} color={colores.primario} />
              <Text style={styles.tituloResultado}>
                {escaneado ? 'Esto leí del comprobante. Revisalo y tocá Guardar.' : 'Esto entendí. Revisalo y tocá Guardar.'}
              </Text>
            </View>
            {escaneado?.fecha && <Text style={styles.fechaTicket}>Fecha del ticket: {fechaParaMostrar(escaneado.fecha)}</Text>}
            {escaneado?.tipo === 'factura_servicio' && (
              <Pressable style={({ pressed }) => [styles.factura, pressed && { opacity: 0.8 }]} onPress={agregarAFijos}>
                <Ionicons name="repeat" size={18} color={colores.advertencia} />
                <Text style={styles.textoFactura}>
                  Es una factura de servicio{escaneado.vencimiento ? ` (vence el ${fechaParaMostrar(escaneado.vencimiento)})` : ''}. ¿Todavía no la
                  pagaste? Tocá acá y la agrego a Fijos para avisarte todos los meses.
                </Text>
              </Pressable>
            )}
            <FormularioGasto
              valores={valores}
              onCambio={setValores}
              medios={medios ?? []}
              onGuardar={() => guardar()}
              onCancelar={() => {
                setValores(null);
                setEscaneado(null);
              }}
              guardando={guardando}
            />
          </Tarjeta>
        </Animated.View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  cajaEntrada: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    padding: 16,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  inputPrincipal: { flex: 1, color: colores.texto, fontSize: 17, minHeight: 64, textAlignVertical: 'top', padding: 0 },
  etiquetaEjemplos: { color: colores.textoTenue, fontSize: 13, marginBottom: 10 },
  ejemplos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ejemplo: {
    backgroundColor: colores.superficie,
    borderRadius: radios.chico,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  textoEjemplo: { color: colores.textoChip, fontSize: 14 },
  resumen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    padding: 16,
    marginTop: 28,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  resumenIcono: { width: 44, height: 44, borderRadius: radios.chico, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center' },
  resumenTitulo: { color: colores.texto, fontSize: 16, fontWeight: '700' },
  resumenTexto: { color: colores.textoSecundario, fontSize: 14, marginTop: 2, lineHeight: 20 },
  escaner: {
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  leyendo: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  botonesEscaner: { flexDirection: 'row', gap: 10, marginTop: 12 },
  botonEscaner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colores.primarioSuave,
    borderRadius: radios.medio,
    paddingVertical: 12,
  },
  textoEscaner: { color: colores.primario, fontWeight: '700', fontSize: 15 },
  fechaTicket: { color: colores.textoSecundario, fontSize: 13, marginTop: 6 },
  factura: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colores.advertenciaFondo,
    borderColor: colores.advertenciaBorde,
    borderWidth: 1,
    borderRadius: radios.chico,
    padding: 12,
    marginTop: 10,
  },
  textoFactura: { color: colores.textoChip, fontSize: 14, lineHeight: 20, flex: 1 },
  encabezadoResultado: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tituloResultado: { color: colores.primario, fontSize: 14, fontWeight: '600' },
});
