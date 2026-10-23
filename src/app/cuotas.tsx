import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { useAviso } from '../components/Toast';
import { Encabezado, Texto as Text } from '../components/ui';
import { colores, colorSegunPorcentaje, radios } from '../constants/tema';
import { useDatos } from '../lib/contextoDatos';
import type { GastoConMedio } from '../lib/datos';
import { deudaPendiente, diaDeLibertad, formatearMes, formatearMonto, proyectarCuotas, totalEnPesos, type MesProyectado } from '../lib/finanzas';
import { useIndicadores } from '../lib/indicadores';
import { Objetivo, useRecorridoSeccion } from '../components/Tutorial';

export default function Cuotas() {
  const ayuda = useRecorridoSeccion('cuotas');
  const datos = useDatos();
  const aviso = useAviso();
  const { dolarTarjeta, inflacionMensual } = useIndicadores();
  const [meses, setMeses] = useState<MesProyectado[]>([]);
  const [gastos, setGastos] = useState<GastoConMedio[]>([]);
  const [sueldo, setSueldo] = useState<number | null>(null);
  const [seleccionado, setSeleccionado] = useState(0);

  useFocusEffect(
    useCallback(() => {
      Promise.all([datos.perfil(), datos.gastos()])
        .then(([perfil, lista]) => {
          setSueldo(perfil.sueldo);
          setGastos(lista);
          setMeses(proyectarCuotas(lista, new Date()));
        })
        .catch((e) => aviso(e.message, 'error'));
    }, [datos, aviso])
  );

  if (meses.length === 0) return <View style={styles.container} />;

  const hoy = new Date();
  const mesActual = meses[0];
  const mesElegido = meses[seleccionado];
  const totalMes = (mes: MesProyectado) => totalEnPesos(mes, dolarTarjeta);
  const porcentaje = sueldo ? (totalMes(mesActual) / sueldo) * 100 : null;
  const colorEstado = colorSegunPorcentaje(porcentaje);
  const maximo = Math.max(...meses.map(totalMes), 1);
  const totalSeisMeses = meses.reduce((suma, m) => suma + totalMes(m), 0);
  const deuda = deudaPendiente(gastos, hoy, inflacionMensual, dolarTarjeta);
  const libertad = diaDeLibertad(gastos, hoy);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <Encabezado titulo="Cuotas" subtitulo="Lo que ya tenés que pagar, mes por mes" volver ayuda={ayuda} />

      <Objetivo id="cuotas-resumen">
        <View style={styles.resumen}>
          <Text style={styles.etiqueta}>Este mes tenés que pagar</Text>
          <Text style={styles.montoGrande}>{formatearMonto(Math.round(mesActual.ars))}</Text>
          {mesActual.usd > 0 && (
            <Text style={styles.dolares}>
              y {formatearMonto(mesActual.usd, 'USD')}
              {dolarTarjeta ? ` (unos ${formatearMonto(Math.round(mesActual.usd * dolarTarjeta))} al dólar tarjeta)` : ''}
            </Text>
          )}

          {porcentaje !== null ? (
            <>
              <View style={styles.barraFondo}>
                <View style={[styles.barraRelleno, { width: `${Math.min(porcentaje, 100)}%`, backgroundColor: colorEstado }]} />
              </View>
              <Text style={[styles.porcentaje, { color: colorEstado }]}>
                Es el {porcentaje.toFixed(0)}% de tu sueldo · te quedan {formatearMonto(Math.round(Math.max(sueldo! - totalMes(mesActual), 0)))}
              </Text>
            </>
          ) : (
            <Text style={styles.aviso}>Cargá tu sueldo en Ajustes para ver qué porcentaje representa.</Text>
          )}
        </View>
      </Objetivo>

      <View style={styles.encabezadoGrafico}>
        <Text style={styles.seccion}>Próximos 6 meses</Text>
        <Text style={styles.totalSeis}>{formatearMonto(Math.round(totalSeisMeses))}</Text>
      </View>
      <View style={styles.tarjetaGrafico}>
        <View style={styles.grafico}>
          {meses.map((mes, i) => (
            <Pressable
              key={i}
              style={styles.columna}
              onPress={() => {
                Haptics.selectionAsync();
                setSeleccionado(i);
              }}
            >
              <Text style={[styles.valorBarra, i === seleccionado && { color: colores.primario }]} numberOfLines={1}>
                {abreviar(totalMes(mes))}
              </Text>
              <View style={styles.zonaBarra}>
                <Barra proporcion={totalMes(mes) / maximo} activa={i === seleccionado} indice={i} />
              </View>
              <Text style={[styles.mes, i === seleccionado && styles.mesSeleccionado]}>{mes.etiqueta}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.ayuda}>Tocá un mes para ver qué cuotas se pagan.</Text>

      {deuda.total > 0 && (
        <View style={styles.deuda}>
          <Text style={styles.etiqueta}>En total te queda por pagar</Text>
          <Text style={styles.montoMediano}>{formatearMonto(Math.round(deuda.total))}</Text>
          <View style={styles.deudaFila}>
            <Ionicons name="trending-down-outline" size={18} color={colores.primario} style={{ marginTop: 2 }} />
            <Text style={styles.deudaTexto}>
              Con la inflación, la plata pierde valor cada mes. Por eso esas cuotas, en plata de hoy, son unos{' '}
              <Text style={styles.deudaDestacado}>{formatearMonto(Math.round(deuda.valorHoy))}</Text>.
            </Text>
          </View>
          {libertad && (
            <View style={styles.deudaFila}>
              <Ionicons name="flag-outline" size={18} color={colores.primario} style={{ marginTop: 2 }} />
              <Text style={styles.deudaTexto}>
                Terminás de pagar todo en <Text style={styles.deudaDestacado}>{formatearMes(libertad, hoy)}</Text>. ¡Tu día de libertad! 🏁
              </Text>
            </View>
          )}
        </View>
      )}

      <Text style={styles.seccion}>
        {mesElegido.etiqueta}: {formatearMonto(Math.round(mesElegido.ars))}
        {mesElegido.usd > 0 ? ` + ${formatearMonto(mesElegido.usd, 'USD')}` : ''}
      </Text>
      {mesElegido.cuotas.length === 0 && <Text style={styles.aviso}>Nada comprometido este mes.</Text>}
      {mesElegido.cuotas.map((c, i) => (
        <Animated.View key={`${seleccionado}-${c.gastoId}-${i}`} entering={FadeIn.delay(i * 30)} style={styles.item}>
          <View style={styles.itemIcono}>
            <Ionicons name={c.total > 1 ? 'layers-outline' : 'card-outline'} size={18} color={colores.primario} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemNombre}>{c.descripcion}</Text>
            {c.total > 1 ? (
              <View style={styles.progresoFila}>
                <View style={styles.progresoFondo}>
                  <View style={[styles.progreso, { width: `${(c.numero / c.total) * 100}%` }]} />
                </View>
                <Text style={styles.itemDetalle}>
                  {c.numero}/{c.total}
                </Text>
              </View>
            ) : (
              <Text style={styles.itemDetalle}>Pago único</Text>
            )}
          </View>
          <Text style={styles.itemMonto}>{formatearMonto(Math.round(c.monto), c.moneda)}</Text>
        </Animated.View>
      ))}
    </ScrollView>
  );
}

// Barra del gráfico que crece con un resorte al aparecer o al cambiar de valor
function Barra({ proporcion, activa, indice }: { proporcion: number; activa: boolean; indice: number }) {
  const alto = useSharedValue(0);
  useEffect(() => {
    alto.value = withDelay(indice * 60, withSpring(proporcion, { damping: 14 }));
  }, [proporcion, indice, alto]);
  const estilo = useAnimatedStyle(() => ({ height: `${Math.max(alto.value * 100, 3)}%` }));
  return <Animated.View style={[styles.barra, activa && styles.barraSeleccionada, estilo]} />;
}

// 1.250.000 → "1,3M" · 85.000 → "85k"
function abreviar(valor: number) {
  if (valor >= 1_000_000) return `${(valor / 1_000_000).toFixed(1).replace('.', ',')}M`;
  if (valor >= 1_000) return `${Math.round(valor / 1_000)}k`;
  return valor > 0 ? String(Math.round(valor)) : '–';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  resumen: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 20, borderWidth: 1, borderColor: colores.borde },
  etiqueta: { color: colores.textoSecundario, fontSize: 14 },
  montoGrande: { color: colores.texto, fontSize: 36, fontWeight: '800', marginTop: 4, letterSpacing: -1.2 },
  dolares: { color: colores.textoSecundario, fontSize: 15, marginTop: 2 },
  barraFondo: { height: 10, backgroundColor: colores.fondo, borderRadius: 5, marginTop: 16, overflow: 'hidden' },
  barraRelleno: { height: '100%', borderRadius: 5 },
  porcentaje: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  aviso: { color: colores.textoTenue, fontSize: 14, marginTop: 10 },
  encabezadoGrafico: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalSeis: { color: colores.textoSecundario, fontSize: 14, fontWeight: '600' },
  seccion: { color: colores.texto, fontSize: 18, fontWeight: 'bold', marginTop: 28, marginBottom: 12 },
  ayuda: { color: colores.textoTenue, fontSize: 13, marginTop: 8 },
  deuda: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 18, marginTop: 20, gap: 10, borderWidth: 1, borderColor: colores.borde },
  montoMediano: { color: colores.texto, fontSize: 28, fontWeight: '800', letterSpacing: -0.8, marginTop: -6 },
  deudaFila: { flexDirection: 'row', gap: 10 },
  deudaTexto: { color: colores.textoChip, fontSize: 15, lineHeight: 22, flex: 1 },
  deudaDestacado: { color: colores.texto, fontWeight: '700' },
  tarjetaGrafico: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 16, borderWidth: 1, borderColor: colores.borde },
  grafico: { flexDirection: 'row', gap: 10, height: 180 },
  columna: { flex: 1, alignItems: 'center' },
  valorBarra: { color: colores.textoTenue, fontSize: 11, fontWeight: '600', marginBottom: 6 },
  zonaBarra: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  barra: { backgroundColor: colores.superficieAlta, borderRadius: radios.chico },
  barraSeleccionada: { backgroundColor: colores.primario },
  mes: { color: colores.textoTenue, fontSize: 13, marginTop: 8 },
  mesSeleccionado: { color: colores.primario, fontWeight: 'bold' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  itemIcono: { width: 36, height: 36, borderRadius: radios.chico, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center' },
  itemNombre: { color: colores.texto, fontSize: 15, fontWeight: '600' },
  itemDetalle: { color: colores.textoSecundario, fontSize: 12, marginTop: 2 },
  progresoFila: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  progresoFondo: { flex: 1, maxWidth: 110, height: 4, backgroundColor: colores.fondo, borderRadius: 2, overflow: 'hidden' },
  progreso: { height: '100%', backgroundColor: colores.primario, borderRadius: 2 },
  itemMonto: { color: colores.texto, fontSize: 15, fontWeight: '700' },
});
