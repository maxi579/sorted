import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useAviso } from '../components/Toast';
import { Boton, Chip, Encabezado, Texto as Text } from '../components/ui';
import { estiloCategoria } from '../constants/categorias';
import { colores, radios } from '../constants/tema';
import { useDatos } from '../lib/contextoDatos';
import type { GastoConMedio } from '../lib/datos';
import { formatearMonto } from '../lib/finanzas';
import { movimientosDeEjemplo, revisarMovimientos, type MovimientoRevisado } from '../lib/conciliacion';
import { leerResumen } from '../lib/resumen';
import type { MedioPago } from '../lib/tipos';
import { Objetivo, useRecorridoSeccion } from '../components/Tutorial';

type Etapa = 'elegir' | 'leyendo' | 'revisar';

export default function Resumen() {
  const ayuda = useRecorridoSeccion('resumen');
  const datos = useDatos();
  const aviso = useAviso();
  const insets = useSafeAreaInsets();
  const [medios, setMedios] = useState<MedioPago[]>([]);
  const [gastos, setGastos] = useState<GastoConMedio[]>([]);
  const [medioId, setMedioId] = useState<string | null>(null);
  const [etapa, setEtapa] = useState<Etapa>('elegir');
  const [revisados, setRevisados] = useState<MovimientoRevisado[]>([]);
  const [elegidos, setElegidos] = useState<Set<number>>(new Set());
  const [verCargados, setVerCargados] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([datos.medios(), datos.gastos()])
        .then(([todos, lista]) => {
          const deCredito = todos.filter((m) => m.tipo === 'credito');
          setMedios(deCredito);
          setGastos(lista);
          setMedioId((actual) => actual ?? deCredito[0]?.id ?? null);
        })
        .catch((e) => aviso(e.message, 'error'));
    }, [datos, aviso])
  );

  const medio = medios.find((m) => m.id === medioId) ?? null;
  const faltantes = revisados.map((r, i) => ({ ...r, indice: i })).filter((r) => !r.cargado);
  const yaCargados = revisados.filter((r) => r.cargado);

  async function elegirArchivo() {
    if (!medio) return aviso('Primero elegí de qué tarjeta es el resumen', 'info');
    try {
      let movimientos;
      if (datos.esDemo) {
        setEtapa('leyendo');
        await new Promise((r) => setTimeout(r, 1500));
        movimientos = movimientosDeEjemplo();
      } else {
        const resultado = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
        if (resultado.canceled || !resultado.assets?.[0]) return;
        setEtapa('leyendo');
        movimientos = await leerResumen(resultado.assets[0]);
      }
      const lista = revisarMovimientos(movimientos, gastos, medio);
      setRevisados(lista);
      setElegidos(new Set(lista.flatMap((r, i) => (r.cargado ? [] : [i]))));
      setEtapa('revisar');
    } catch (e) {
      setEtapa('elegir');
      aviso((e as Error).message, 'error');
    }
  }

  function alternar(indice: number) {
    setElegidos((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(indice)) nuevo.delete(indice);
      else nuevo.add(indice);
      return nuevo;
    });
  }

  async function agregar() {
    setGuardando(true);
    let guardados = 0;
    let pendientes = 0;
    try {
      for (const indice of elegidos) {
        const resultado = await datos.crearGasto(revisados[indice].fila);
        if (resultado === 'pendiente') pendientes++;
        else guardados++;
      }
      aviso(
        pendientes > 0
          ? `Anotados ${guardados + pendientes}. Algunos se suben cuando haya internet 📶`
          : `¡Listo! Agregué ${guardados} gasto${guardados === 1 ? '' : 's'} 👌`
      );
      reiniciar();
      router.push('/');
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
    setGuardando(false);
  }

  function reiniciar() {
    setEtapa('elegir');
    setRevisados([]);
    setElegidos(new Set());
    setVerCargados(false);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <Pressable style={[styles.volver, { top: insets.top + 16 }]} onPress={() => (etapa === 'revisar' ? reiniciar() : router.back())} hitSlop={10}>
        <Ionicons name="chevron-back" size={20} color={colores.primario} />
        <Text style={styles.volverTexto}>Volver</Text>
      </Pressable>
      <Encabezado titulo="Revisar el resumen" subtitulo="Te muestro los gastos de la tarjeta que te olvidaste de anotar." volver ayuda={ayuda} />

      {etapa === 'elegir' && (
        <Objetivo id="resumen-subir">
          <View style={styles.tarjeta}>
            {medios.length === 0 ? (
              <>
                <Text style={styles.texto}>Para revisar un resumen, primero agregá tu tarjeta de crédito en Ajustes.</Text>
                <Boton titulo="Ir a Ajustes" variante="secundario" onPress={() => router.push('/ajustes')} estilo={{ marginTop: 14 }} />
              </>
            ) : (
              <>
                <Text style={styles.pregunta}>¿De qué tarjeta es el resumen?</Text>
                <View style={styles.chips}>
                  {medios.map((m) => (
                    <Chip key={m.id} etiqueta={m.nombre} activo={medioId === m.id} onPress={() => setMedioId(m.id)} />
                  ))}
                </View>

                <View style={styles.pasos}>
                  <Paso numero={1} texto="Descargá el resumen en PDF desde la app o la página de tu banco." />
                  <Paso numero={2} texto="Tocá el botón de abajo y elegí ese archivo." />
                  <Paso numero={3} texto="Te muestro lo que te faltaba anotar y lo agregás con un toque." />
                </View>

                <Boton titulo={datos.esDemo ? 'Probar con un resumen de ejemplo' : 'Elegir el PDF del resumen'} onPress={elegirArchivo} />
                <Text style={styles.privacidad}>
                  🔒 El resumen lo lee una inteligencia artificial (Claude) para encontrar las compras. No se guarda en ningún lado.
                </Text>
              </>
            )}
          </View>
        </Objetivo>
      )}

      {etapa === 'leyendo' && (
        <View style={styles.leyendo}>
          <ActivityIndicator size="large" color={colores.primario} />
          <Text style={styles.texto}>Leyendo tu resumen…</Text>
          <Text style={styles.ayuda}>Puede tardar hasta un minuto.</Text>
        </View>
      )}

      {etapa === 'revisar' && (
        <Animated.View entering={FadeInDown.springify()}>
          <View style={[styles.tarjeta, styles.resultado]}>
            <Ionicons name={faltantes.length ? 'search' : 'checkmark-circle'} size={36} color={colores.primario} />
            <Text style={styles.resultadoTitulo}>
              {faltantes.length === 0
                ? '¡Tenías todo anotado! 🎉'
                : `Te faltaba${faltantes.length === 1 ? '' : 'n'} ${faltantes.length} gasto${faltantes.length === 1 ? '' : 's'}`}
            </Text>
            <Text style={styles.ayuda}>
              Encontré {revisados.length} compra{revisados.length === 1 ? '' : 's'} en el resumen. {yaCargados.length} ya las tenías.
            </Text>
          </View>

          {faltantes.length > 0 && (
            <>
              <Text style={styles.seccion}>Marcá las que querés agregar</Text>
              {faltantes.map(({ movimiento, fila, indice }) => {
                const marcado = elegidos.has(indice);
                const { icono, color } = estiloCategoria(fila.categoria);
                return (
                  <Pressable
                    key={indice}
                    style={({ pressed }) => [styles.item, marcado && styles.itemMarcado, pressed && { opacity: 0.8 }]}
                    onPress={() => alternar(indice)}
                  >
                    <Ionicons name={marcado ? 'checkbox' : 'square-outline'} size={24} color={marcado ? colores.primario : colores.textoTenue} />
                    <View style={[styles.icono, { backgroundColor: `${color}1f` }]}>
                      <Ionicons name={icono} size={18} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.descripcion} numberOfLines={1}>{fila.descripcion}</Text>
                      <Text style={styles.detalle}>
                        {fechaCorta(movimiento.fecha)}
                        {fila.cantidad_cuotas > 1 ? ` · ${fila.cantidad_cuotas} cuotas de ${formatearMonto(Math.round(movimiento.monto), fila.moneda)}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.monto}>{formatearMonto(Math.round(fila.monto_total), fila.moneda)}</Text>
                  </Pressable>
                );
              })}
              <Boton
                titulo={elegidos.size === 0 ? 'Marcá al menos uno' : `Agregar ${elegidos.size} gasto${elegidos.size === 1 ? '' : 's'}`}
                onPress={agregar}
                cargando={guardando}
                estilo={{ marginTop: 12, opacity: elegidos.size === 0 ? 0.5 : 1 }}
              />
            </>
          )}

          {yaCargados.length > 0 && (
            <>
              <Pressable style={styles.verMas} onPress={() => setVerCargados(!verCargados)}>
                <Text style={styles.verMasTexto}>{verCargados ? 'Ocultar' : 'Ver'} las que ya tenías anotadas</Text>
                <Ionicons name={verCargados ? 'chevron-up' : 'chevron-down'} size={16} color={colores.primario} />
              </Pressable>
              {verCargados &&
                yaCargados.map(({ movimiento, cargado }, i) => (
                  <View key={i} style={[styles.item, styles.itemCargado]}>
                    <Ionicons name="checkmark-circle" size={22} color={colores.primario} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.descripcion} numberOfLines={1}>{cargado!.descripcion}</Text>
                      <Text style={styles.detalle}>En el resumen: {movimiento.descripcion}</Text>
                    </View>
                    <Text style={styles.detalle}>{formatearMonto(Math.round(movimiento.monto), movimiento.moneda)}</Text>
                  </View>
                ))}
            </>
          )}

          {faltantes.length === 0 && <Boton titulo="Volver al inicio" variante="secundario" onPress={() => router.push('/')} estilo={{ marginTop: 16 }} />}
        </Animated.View>
      )}
    </ScrollView>
  );
}

function Paso({ numero, texto }: { numero: number; texto: string }) {
  return (
    <View style={styles.paso}>
      <View style={styles.pasoNumero}>
        <Text style={styles.pasoNumeroTexto}>{numero}</Text>
      </View>
      <Text style={styles.pasoTexto}>{texto}</Text>
    </View>
  );
}

// '2026-10-05' → '5/10'
function fechaCorta(fecha: string) {
  const [, mes, dia] = fecha.split('-').map(Number);
  return `${dia}/${mes}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  volver: { flexDirection: 'row', alignItems: 'center', gap: 2, position: 'absolute', right: 20, zIndex: 1 },
  volverTexto: { color: colores.primario, fontSize: 15, fontWeight: '600' },
  tarjeta: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 18, borderWidth: 1, borderColor: colores.borde },
  pregunta: { color: colores.texto, fontSize: 17, fontWeight: '700', marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pasos: { gap: 12, marginVertical: 22 },
  paso: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  pasoNumero: { width: 26, height: 26, borderRadius: 13, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center' },
  pasoNumeroTexto: { color: colores.primario, fontSize: 14, fontWeight: '700' },
  pasoTexto: { color: colores.textoChip, fontSize: 15, lineHeight: 22, flex: 1 },
  privacidad: { color: colores.textoTenue, fontSize: 13, lineHeight: 19, marginTop: 14 },
  texto: { color: colores.texto, fontSize: 16, lineHeight: 23 },
  ayuda: { color: colores.textoSecundario, fontSize: 14, textAlign: 'center' },
  leyendo: { alignItems: 'center', gap: 12, paddingVertical: 60 },
  resultado: { alignItems: 'center', gap: 6 },
  resultadoTitulo: { color: colores.texto, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  seccion: { color: colores.texto, fontSize: 18, fontWeight: 'bold', marginTop: 24, marginBottom: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colores.superficie,
    borderRadius: radios.medio,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  itemMarcado: { borderColor: colores.primario },
  itemCargado: { opacity: 0.75 },
  icono: { width: 34, height: 34, borderRadius: radios.chico, alignItems: 'center', justifyContent: 'center' },
  descripcion: { color: colores.texto, fontSize: 15, fontWeight: '600' },
  detalle: { color: colores.textoSecundario, fontSize: 13, marginTop: 2 },
  monto: { color: colores.texto, fontSize: 15, fontWeight: '700' },
  verMas: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 22, marginBottom: 10 },
  verMasTexto: { color: colores.primario, fontSize: 15, fontWeight: '600' },
});
