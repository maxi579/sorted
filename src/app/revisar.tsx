import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import FormularioGasto from '../components/FormularioGasto';
import { useAviso } from '../components/Toast';
import { Encabezado, Texto as Text } from '../components/ui';
import { colores, radios, tipografia } from '../constants/tema';
import { useDatos } from '../lib/contextoDatos';
import { formatearMonto } from '../lib/finanzas';
import { fechaParaMostrar, montoATexto } from '../lib/formato';
import { fechaDesdeTexto, prepararGasto, type ValoresGasto } from '../lib/gastos';
import { categoriaAprendida } from '../lib/aprendizaje';
import { interpretarGasto } from '../lib/interpretarGasto';
import { importarNotificaciones } from '../lib/notificaciones';
import type { GastoGuardado, MedioPago, Sugerencia } from '../lib/tipos';
import { useRecorridoSeccion } from '../components/Tutorial';

type Anotando = { sugerencia: Sugerencia; valores: ValoresGasto };

// Busca la billetera o banco de donde vino el pago entre los medios cargados ("Mercado Pago" → tu "Mercado Pago")
function medioDeLaFuente(fuente: string | null, medios: MedioPago[]) {
  if (!fuente) return null;
  const f = fuente.toLowerCase();
  return medios.find((m) => m.nombre.toLowerCase().includes(f) || (m.banco && f.includes(m.banco.toLowerCase())))?.id ?? null;
}

export default function Revisar() {
  const ayuda = useRecorridoSeccion('revisar');
  const datos = useDatos();
  const aviso = useAviso();
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [medios, setMedios] = useState<MedioPago[]>([]);
  const [historial, setHistorial] = useState<GastoGuardado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [anotando, setAnotando] = useState<Anotando | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      // En Android, primero traemos lo que juntó el lector de notificaciones
      await importarNotificaciones(datos).catch(() => 0);
      const [lista, listaMedios, listaGastos] = await Promise.all([datos.sugerencias.listar(), datos.medios(), datos.gastos()]);
      setSugerencias(lista.filter((s) => s.estado === 'pendiente'));
      setMedios(listaMedios);
      setHistorial(listaGastos);
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
    setCargando(false);
  }, [datos, aviso]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  function abrir(sugerencia: Sugerencia) {
    // El intérprete de texto adivina la categoría a partir del comercio
    const interpretado = interpretarGasto(sugerencia.descripcion, medios);
    setAnotando({
      sugerencia,
      valores: {
        descripcion: sugerencia.descripcion,
        montoTexto: sugerencia.monto ? montoATexto(sugerencia.monto) : '',
        cuotasTexto: '1',
        moneda: sugerencia.moneda,
        medioId: medioDeLaFuente(sugerencia.fuente, medios) ?? interpretado.medioId,
        categoria: categoriaAprendida(sugerencia.descripcion, historial) ?? interpretado.categoria,
      },
    });
  }

  async function guardar() {
    if (!anotando) return;
    const preparado = prepararGasto(anotando.valores, medios, fechaDesdeTexto(anotando.sugerencia.fecha));
    if (preparado.error) return aviso(preparado.error, 'error');
    setGuardando(true);
    try {
      await datos.crearGasto({ ...preparado.fila, texto_original: anotando.sugerencia.texto_original ?? undefined });
      await datos.sugerencias.actualizar(anotando.sugerencia.id, { estado: 'aceptada' });
      setAnotando(null);
      aviso('Anotado 👌');
      cargar();
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
    setGuardando(false);
  }

  async function descartar(sugerencia: Sugerencia) {
    setSugerencias((lista) => lista.filter((s) => s.id !== sugerencia.id));
    try {
      await datos.sugerencias.actualizar(sugerencia.id, { estado: 'descartada' });
    } catch (e) {
      aviso((e as Error).message, 'error');
      cargar();
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.contenido}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colores.primario} />}
      >
        <Encabezado titulo="Pagos para revisar" subtitulo="Los encontré en tus mails o notificaciones" volver ayuda={ayuda} />

        {sugerencias.length === 0 && !cargando && (
          <View style={styles.vacio}>
            <Ionicons name="checkmark-done-circle" size={40} color={colores.primario} />
            <Text style={styles.vacioTexto}>
              No hay nada para revisar.{'\n'}En Ajustes podés activar que te lleguen los pagos de Mercado Pago y tu banco solos.
            </Text>
          </View>
        )}

        {sugerencias.map((s) => (
          <View key={s.id} style={styles.item}>
            <View style={styles.icono}>
              <Ionicons name={s.origen === 'mail' ? 'mail' : 'notifications'} size={20} color={colores.primario} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre} numberOfLines={1}>
                {s.descripcion}
              </Text>
              <Text style={styles.detalle}>
                {fechaParaMostrar(s.fecha)}
                {s.fuente ? ` · ${s.fuente}` : ''}
              </Text>
              {s.texto_original && (
                <Text style={styles.original} numberOfLines={2}>
                  “{s.texto_original}”
                </Text>
              )}
              <View style={styles.botones}>
                <Pressable onPress={() => abrir(s)} style={({ pressed }) => [styles.botonChico, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.textoBotonChico}>Anotar</Text>
                </Pressable>
                <Pressable onPress={() => descartar(s)} hitSlop={8}>
                  <Text style={styles.textoNo}>No es un gasto</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.monto}>{s.monto ? formatearMonto(s.monto, s.moneda) : '¿?'}</Text>
          </View>
        ))}
      </ScrollView>

      <Modal visible={anotando !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAnotando(null)}>
        <ScrollView style={styles.container} contentContainerStyle={styles.contenidoModal} keyboardShouldPersistTaps="handled">
          <Text style={tipografia.titulo}>Anotar pago</Text>
          {anotando && (
            <FormularioGasto
              valores={anotando.valores}
              onCambio={(valores) => setAnotando({ ...anotando, valores })}
              medios={medios}
              onGuardar={guardar}
              onCancelar={() => setAnotando(null)}
              textoCancelar="Cancelar"
              guardando={guardando}
            />
          )}
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  contenidoModal: { padding: 20, paddingTop: 28, paddingBottom: 60 },
  vacio: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  vacioTexto: { color: colores.textoTenue, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  item: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  icono: { width: 40, height: 40, borderRadius: radios.chico, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center' },
  nombre: { color: colores.texto, fontSize: 16, fontWeight: '600' },
  detalle: { color: colores.textoSecundario, fontSize: 13, marginTop: 2 },
  original: { color: colores.textoTenue, fontSize: 13, marginTop: 6, fontStyle: 'italic' },
  botones: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  botonChico: { backgroundColor: colores.primario, borderRadius: radios.chico, paddingVertical: 7, paddingHorizontal: 14 },
  textoBotonChico: { color: colores.sobrePrimario, fontWeight: '700', fontSize: 14 },
  textoNo: { color: colores.textoSecundario, fontWeight: '600', fontSize: 14 },
  monto: { color: colores.texto, fontSize: 16, fontWeight: '700' },
});
