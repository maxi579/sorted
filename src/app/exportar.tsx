import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useAviso } from '../components/Toast';
import { Boton, Chip, Encabezado, Texto as Text } from '../components/ui';
import { estiloCategoria } from '../constants/categorias';
import { colores, radios } from '../constants/tema';
import { useDatos } from '../lib/contextoDatos';
import type { GastoConMedio } from '../lib/datos';
import { gastosDelRango, htmlDeGastos, PERIODOS, rangoDePeriodo, totalesDe, type Periodo } from '../lib/exportar';
import { formatearMonto } from '../lib/finanzas';
import { descargarPDF, puedeExportar } from '../lib/pdf';

export default function Exportar() {
  const datos = useDatos();
  const aviso = useAviso();
  const [gastos, setGastos] = useState<GastoConMedio[]>([]);
  const [nombre, setNombre] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('este-mes');
  const [armando, setArmando] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Promise.all([datos.gastos(), datos.perfil()])
        .then(([lista, perfil]) => {
          setGastos(lista);
          setNombre(perfil.nombre);
        })
        .catch((e) => aviso((e as Error).message, 'error'));
    }, [datos, aviso])
  );

  const rango = useMemo(() => rangoDePeriodo(periodo, new Date()), [periodo]);
  const elegidos = useMemo(() => gastosDelRango(gastos, rango), [gastos, rango]);
  const { pesos, dolares, categorias } = totalesDe(elegidos);

  async function descargar() {
    setArmando(true);
    try {
      await descargarPDF(htmlDeGastos({ nombre, rango, gastos: elegidos, generado: new Date() }), `Tus gastos · ${rango.titulo}`);
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
    setArmando(false);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido}>
      <Encabezado titulo="Exportar a PDF" subtitulo="Tus gastos, listos para guardar o compartir" volver />

      <View style={styles.chips}>
        {PERIODOS.map((p) => (
          <Chip key={p.valor} etiqueta={p.nombre} activo={periodo === p.valor} onPress={() => setPeriodo(p.valor)} />
        ))}
      </View>

      <View style={styles.vista}>
        <View style={styles.hoja}>
          <Text style={styles.marca}>
            Sorted<Text style={{ color: colores.primario }}>.</Text>
          </Text>
          <Text style={styles.titulo}>{rango.titulo}</Text>
          <Text style={styles.cantidad}>
            {elegidos.length} {elegidos.length === 1 ? 'gasto' : 'gastos'}
          </Text>
          <Text style={styles.total}>{formatearMonto(pesos)}</Text>
          {dolares > 0 && <Text style={styles.cantidad}>y {formatearMonto(dolares, 'USD')}</Text>}
          <View style={styles.categorias}>
            {categorias.slice(0, 4).map(({ categoria, total }) => (
              <View key={categoria} style={styles.categoria}>
                <View style={[styles.punto, { backgroundColor: estiloCategoria(categoria).color }]} />
                <Text style={styles.nombreCategoria}>{categoria}</Text>
                <Text style={styles.montoCategoria}>{formatearMonto(total)}</Text>
              </View>
            ))}
            {categorias.length > 4 && <Text style={styles.mas}>y {categorias.length - 4} categorías más</Text>}
          </View>
        </View>
      </View>

      <Text style={styles.pista}>Incluye el total, en qué se fue la plata por categoría y la lista completa con fecha, tarjeta y cuotas.</Text>

      {puedeExportar ? (
        <Boton titulo="Descargar PDF" onPress={descargar} cargando={armando} />
      ) : (
        <View style={styles.aviso}>
          <Ionicons name="download" size={20} color={colores.primario} />
          <Text style={styles.textoAviso}>Para descargar el PDF necesitás la última versión de la app.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 48 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  vista: { backgroundColor: colores.superficie, borderRadius: radios.grande, borderWidth: 1, borderColor: colores.borde, padding: 16, marginBottom: 14 },
  // Una "hoja" clara, como va a quedar el PDF
  hoja: { backgroundColor: '#ffffff', borderRadius: 12, padding: 18 },
  marca: { color: '#0f172a', fontSize: 16, fontWeight: '800' },
  titulo: { color: '#0f172a', fontSize: 22, fontWeight: '800', marginTop: 10, textTransform: 'capitalize' },
  cantidad: { color: '#64748b', fontSize: 13, marginTop: 2 },
  total: { color: '#0f172a', fontSize: 26, fontWeight: '800', marginTop: 12 },
  categorias: { marginTop: 14, gap: 8 },
  categoria: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  punto: { width: 8, height: 8, borderRadius: 4 },
  nombreCategoria: { flex: 1, color: '#334155', fontSize: 14 },
  montoCategoria: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  mas: { color: '#94a3b8', fontSize: 12 },
  pista: { color: colores.textoTenue, fontSize: 14, lineHeight: 20, marginBottom: 18 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 14 },
  textoAviso: { flex: 1, color: colores.textoChip, fontSize: 14 },
});
