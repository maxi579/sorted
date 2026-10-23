import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { colores, radios } from '../constants/tema';
import { useDatos } from '../lib/contextoDatos';
import { formatearMonto } from '../lib/finanzas';
import { useIndicadores } from '../lib/indicadores';
import { leerRecibo } from '../lib/leerRecibo';
import { mismoRecibo, NOMBRE_TIPO, nombrePeriodo, nombreRecibo, tipoDe, sueldoActual, sueldoContraInflacion, type ReciboLeido } from '../lib/sueldos';
import type { ReciboSueldo } from '../lib/tipos';
import { useAviso } from './Toast';
import { confirmar, Texto as Text } from './ui';

const porcentaje = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1);

/** Cargar recibos de sueldo: la IA los lee, el sueldo se actualiza solo y se compara contra la inflación */
export default function RecibosSueldo({ onSueldo }: { onSueldo: (sueldo: number) => void }) {
  const datos = useDatos();
  const aviso = useAviso();
  const indicadores = useIndicadores();
  const [recibos, setRecibos] = useState<ReciboSueldo[]>([]);
  const [progreso, setProgreso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setRecibos(await datos.recibos.listar().catch(() => []));
  }, [datos]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  async function elegir() {
    const resultado = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (resultado.canceled || !resultado.assets?.length) return;

    const archivos = resultado.assets;
    const todos: ReciboLeido[] = [...recibos];
    let nuevos = 0;
    let repetidos = 0;
    const errores: string[] = [];
    for (const [i, archivo] of archivos.entries()) {
      setProgreso(archivos.length > 1 ? `Leyendo ${i + 1} de ${archivos.length}…` : 'Leyendo el recibo…');
      try {
        const recibo = await leerRecibo(archivo, datos.esDemo);
        if (todos.some((r) => mismoRecibo(r, recibo))) {
          repetidos++;
          continue;
        }
        await datos.recibos.crear(recibo);
        todos.push(recibo);
        nuevos++;
      } catch (e) {
        errores.push(archivos.length > 1 ? `${archivo.name}: ${(e as Error).message}` : (e as Error).message);
      }
    }
    setProgreso(null);
    await cargar();

    // El sueldo de la app pasa a ser el neto del último mes con recibo
    const actual = sueldoActual(todos);
    let mensaje = '';
    if (nuevos > 0 && actual) {
      const { sueldo } = await datos.perfil();
      if (sueldo !== actual.neto) {
        await datos.guardarSueldo(actual.neto);
        onSueldo(actual.neto);
        mensaje = actual.estimado
          ? `Con lo que cargaste de ${nombrePeriodo(actual.periodo)}, calculo que cobrás unos ${formatearMonto(actual.neto)} por mes. Cuando cargues el resto del mes, lo ajusto.`
          : `Tu sueldo quedó en ${formatearMonto(actual.neto)} (${nombrePeriodo(actual.periodo)}) ✓`;
      } else mensaje = nuevos === 1 ? 'Recibo guardado ✓' : `${nuevos} recibos guardados ✓`;
    } else if (repetidos > 0 && errores.length === 0) mensaje = repetidos === 1 ? 'Ese recibo ya estaba cargado.' : 'Esos recibos ya estaban cargados.';
    if (mensaje) aviso(mensaje, nuevos > 0 ? undefined : 'info');
    if (errores.length) aviso(errores.join('\n'), 'error');
  }

  function borrar(recibo: ReciboSueldo) {
    confirmar('Borrar recibo', `¿Borrar el recibo de ${nombreRecibo(recibo)}?`, 'Borrar', async () => {
      await datos.recibos.borrar(recibo.id).catch((e) => aviso((e as Error).message, 'error'));
      cargar();
    });
  }

  const comparacion = sueldoContraInflacion(recibos, indicadores.serieInflacion, indicadores.inflacionMensual);
  // Del más nuevo al más viejo (las quincenas de un mismo mes, la segunda arriba)
  const ordenados = [...recibos]
    .sort((a, b) => b.periodo.localeCompare(a.periodo) || (b.desde ?? '').localeCompare(a.desde ?? ''))
    .slice(0, 8);

  return (
    <View style={styles.contenedor}>
      <Pressable style={({ pressed }) => [styles.boton, pressed && { opacity: 0.8 }]} onPress={elegir} disabled={progreso !== null}>
        {progreso ? <ActivityIndicator color={colores.primario} size="small" /> : <Ionicons name="document-text" size={20} color={colores.primario} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.textoBoton}>{progreso ?? 'Cargar recibos de sueldo'}</Text>
          {!progreso && <Text style={styles.detalle}>PDF o foto. Podés elegir varios y actualizo tu sueldo solo.</Text>}
        </View>
      </Pressable>

      {comparacion && (
        <View style={[styles.comparacion, comparacion.real < 0 && { borderColor: colores.peligro }]}>
          <Text style={styles.textoComparacion}>
            Desde {nombrePeriodo(comparacion.desde)} tu sueldo {comparacion.suba >= 0 ? 'subió' : 'bajó'} {porcentaje(comparacion.suba)} y los precios{' '}
            {porcentaje(comparacion.inflacion)}.{' '}
            {Math.abs(comparacion.real) < 0.005
              ? 'Tu sueldo te alcanza para lo mismo que antes.'
              : comparacion.real > 0
                ? `Hoy te alcanza para un ${porcentaje(comparacion.real)} más 👏`
                : `Hoy te alcanza para un ${porcentaje(comparacion.real)} menos.`}
          </Text>
        </View>
      )}

      {ordenados.map((r) => (
        <View key={r.id} style={styles.fila}>
          <View style={{ flex: 1 }}>
            <Text style={styles.periodo}>
              {conMayuscula(nombreRecibo(r))}
              {tipoDe(r) !== 'sueldo' ? ` · ${NOMBRE_TIPO[tipoDe(r)]}` : ''}
            </Text>
            {r.empleador !== '' && <Text style={styles.detalle}>{r.empleador}</Text>}
          </View>
          <Text style={styles.neto}>{formatearMonto(r.neto, r.moneda)}</Text>
          <Pressable onPress={() => borrar(r)} hitSlop={10} accessibilityLabel={`Borrar recibo de ${nombreRecibo(r)}`}>
            <Ionicons name="close" size={18} color={colores.textoTenue} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  contenedor: { gap: 10, marginBottom: 28, marginTop: -14 },
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colores.primario,
    borderRadius: radios.grande,
    padding: 14,
  },
  textoBoton: { color: colores.primario, fontWeight: '700', fontSize: 15 },
  detalle: { color: colores.textoSecundario, fontSize: 13, marginTop: 2 },
  comparacion: { backgroundColor: colores.superficie, borderRadius: radios.grande, borderWidth: 1, borderColor: colores.primario, padding: 14 },
  textoComparacion: { color: colores.texto, fontSize: 15, lineHeight: 21 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 4 },
  periodo: { color: colores.texto, fontSize: 15, fontWeight: '600' },
  neto: { color: colores.texto, fontSize: 15, fontWeight: '700' },
});
