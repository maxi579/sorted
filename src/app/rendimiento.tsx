import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Campo, Chip, Encabezado, Etiqueta, Texto as Text } from '../components/ui';
import { colores, radios } from '../constants/tema';
import { formatearPorcentaje } from '../lib/activos';
import { formatearMonto } from '../lib/finanzas';
import { formatearEntradaMonto, leerMonto } from '../lib/formato';
import { useIndicadores } from '../lib/indicadores';
import {
  mejorBanco,
  montoParaNoPerder,
  nombreBanco,
  PLAZOS,
  simularCuentaRemunerada,
  simularPlazoFijo,
  tasaParaPlazo,
  type BancoPlazoFijo,
} from '../lib/rendimientos';
import { useTasas } from '../lib/tasas';
import { Objetivo, useRecorridoSeccion } from '../components/Tutorial';

const NOMBRE_PLAZO: Record<(typeof PLAZOS)[number], string> = { 30: '1 mes', 60: '2 meses', 90: '3 meses', 180: '6 meses', 365: '1 año' };

type Resultado = { clave: string; titulo: string; detalle: string; final: number; icono: keyof typeof Ionicons.glyphMap };

export default function Rendimiento() {
  const ayuda = useRecorridoSeccion('rendimiento');
  const { inflacionMensual } = useIndicadores();
  const { bancos, cargando, actualizado } = useTasas();
  const [montoTexto, setMontoTexto] = useState('500.000');
  const [dias, setDias] = useState<(typeof PLAZOS)[number]>(30);
  const [tnaCuentaTexto, setTnaCuentaTexto] = useState('');
  const [miBancoNombre, setMiBancoNombre] = useState<string | null>(null);
  const [eligiendoBanco, setEligiendoBanco] = useState(false);

  const monto = leerMonto(montoTexto);
  const valido = monto > 0;
  const paraNoPerder = montoParaNoPerder(monto, inflacionMensual, dias);
  const mejor = mejorBanco(bancos, dias);
  // Si no eligió banco, mostramos el Nación como referencia (es el más usado)
  const miBanco =
    bancos.find((b) => b.entidad === miBancoNombre) ?? (miBancoNombre === null ? bancos.find((b) => b.entidad.includes('NACION ARGENTINA')) : undefined);

  const resultados: Resultado[] = [];
  if (mejor) {
    resultados.push({
      clave: 'mejor',
      titulo: 'Plazo fijo con la tasa más alta de hoy',
      detalle: `${nombreBanco(mejor.banco.entidad)} · TNA ${(mejor.tna * 100).toFixed(1).replace('.', ',')}%${mejor.renovando ? ' · renovándolo cada mes' : ''}`,
      final: simularPlazoFijo(monto, mejor.tna, dias, mejor.renovando),
      icono: 'trophy',
    });
  }
  if (miBanco && miBanco.entidad !== mejor?.banco.entidad) {
    const { tna, renovando } = tasaParaPlazo(miBanco, dias);
    resultados.push({
      clave: 'mi-banco',
      titulo: `Plazo fijo en ${nombreBanco(miBanco.entidad)}`,
      detalle: `TNA ${(tna * 100).toFixed(1).replace('.', ',')}%${renovando ? ' · renovándolo cada mes' : ''}`,
      final: simularPlazoFijo(monto, tna, dias, renovando),
      icono: 'business',
    });
  }
  const tnaCuenta = leerMonto(tnaCuentaTexto);
  if (tnaCuenta > 0 && tnaCuenta < 200) {
    resultados.push({
      clave: 'cuenta',
      titulo: 'Cuenta que paga interés',
      detalle: `TNA ${String(tnaCuenta).replace('.', ',')}% · la podés sacar cuando quieras`,
      final: simularCuentaRemunerada(monto, tnaCuenta, dias),
      icono: 'phone-portrait',
    });
  }
  resultados.push({ clave: 'quieta', titulo: 'Dejarla quieta', detalle: 'En efectivo o en una cuenta que no paga interés', final: monto, icono: 'bed' });
  resultados.sort((a, b) => b.final - a.final);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
        <Encabezado titulo="¿Cuánto me rinde?" subtitulo="Compará qué pasa con tu plata en cada opción" volver ayuda={ayuda} />

        <Objetivo id="rend-datos">
          <Campo
            etiqueta="¿Cuánta plata?"
            value={montoTexto}
            onChangeText={(t) => setMontoTexto(formatearEntradaMonto(t))}
            keyboardType="decimal-pad"
            placeholder="Ej: 500.000"
          />
          <Etiqueta>¿Por cuánto tiempo?</Etiqueta>
          <View style={styles.chips}>
            {PLAZOS.map((p) => (
              <Chip key={p} etiqueta={NOMBRE_PLAZO[p]} activo={dias === p} onPress={() => setDias(p)} />
            ))}
          </View>
        </Objetivo>

        {valido && (
          <Objetivo id="rend-inflacion">
            <View style={styles.inflacion}>
              <Ionicons name="trending-up" size={18} color={colores.advertencia} />
              <Text style={styles.textoInflacion}>
                Para no perder contra la inflación, en {NOMBRE_PLAZO[dias]} tendrías que tener{' '}
                <Text style={{ fontWeight: '700' }}>{formatearMonto(Math.round(paraNoPerder))}</Text> (estimado con la inflación de los últimos meses).
              </Text>
            </View>
          </Objetivo>
        )}

        <Objetivo id="rend-resultados">
          {cargando ? (
            <View style={styles.cargando}>
              <ActivityIndicator color={colores.primario} />
              <Text style={styles.detalle}>Buscando las tasas de hoy...</Text>
            </View>
          ) : (
            valido &&
            resultados.map((r) => {
              const ganancia = r.final - monto;
              const real = r.final / paraNoPerder - 1;
              return (
                <View key={r.clave} style={styles.resultado}>
                  <View style={styles.icono}>
                    <Ionicons name={r.icono} size={20} color={colores.primario} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.titulo}>{r.titulo}</Text>
                    <Text style={styles.detalle}>{r.detalle}</Text>
                    <Text style={[styles.real, { color: Math.abs(real) < 0.001 ? colores.advertencia : real > 0 ? colores.primario : colores.peligro }]}>
                      {Math.abs(real) < 0.001
                        ? 'Empata con la inflación'
                        : `${real > 0 ? 'Le gana a la inflación' : 'Pierde contra la inflación'} (${formatearPorcentaje(real)})`}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.final}>{formatearMonto(Math.round(r.final))}</Text>
                    <Text style={styles.ganancia}>{ganancia > 0 ? `+${formatearMonto(Math.round(ganancia))}` : 'sin ganancia'}</Text>
                  </View>
                </View>
              );
            })
          )}
        </Objetivo>

        {!cargando && bancos.length === 0 && (
          <Text style={styles.aviso}>No pude traer las tasas de los bancos (¿hay internet?). Probá de nuevo en un rato.</Text>
        )}

        <Text style={[styles.subtitulo]}>Sumá tus opciones</Text>
        {bancos.length > 0 && (
          <Pressable style={({ pressed }) => [styles.opcion, pressed && { opacity: 0.7 }]} onPress={() => setEligiendoBanco(true)}>
            <Ionicons name="business-outline" size={20} color={colores.primario} />
            <Text style={styles.textoOpcion}>{miBanco ? `Tu banco: ${nombreBanco(miBanco.entidad)}` : 'Elegí tu banco'}</Text>
            <Ionicons name="chevron-forward" size={18} color={colores.textoTenue} />
          </Pressable>
        )}
        <Campo
          etiqueta="¿Tu billetera paga interés? Poné la tasa anual (TNA) que te muestra la app"
          value={tnaCuentaTexto}
          onChangeText={setTnaCuentaTexto}
          keyboardType="decimal-pad"
          placeholder="Ej: 28"
        />

        <Text style={styles.aclaracion}>
          Son cuentas con las tasas que publican los bancos en el BCRA (vía ArgentinaDatos)
          {actualizado ? `, actualizadas el ${new Date(actualizado).toLocaleDateString('es-AR')}` : ''}, y la inflación del INDEC. Las tasas
          cambian seguido y la inflación futura es una estimación. No es una recomendación de inversión: antes de decidir, consultá con tu banco.
        </Text>
      </ScrollView>

      <Modal visible={eligiendoBanco} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEligiendoBanco(false)}>
        <ScrollView style={styles.container} contentContainerStyle={styles.contenidoModal}>
          <Text style={styles.tituloModal}>Elegí tu banco</Text>
          {[...bancos]
            .sort((a, b) => nombreBanco(a.entidad).localeCompare(nombreBanco(b.entidad)))
            .map((b: BancoPlazoFijo) => (
              <Pressable
                key={b.entidad}
                style={({ pressed }) => [styles.banco, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  setMiBancoNombre(b.entidad);
                  setEligiendoBanco(false);
                }}
              >
                <Text style={styles.titulo}>{nombreBanco(b.entidad)}</Text>
                <Text style={styles.detalle}>TNA {(b.tna30 * 100).toFixed(1).replace('.', ',')}%</Text>
              </Pressable>
            ))}
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  contenidoModal: { padding: 20, paddingTop: 28, paddingBottom: 60 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  inflacion: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colores.advertenciaFondo,
    borderColor: colores.advertenciaBorde,
    borderWidth: 1,
    borderRadius: radios.grande,
    padding: 14,
    marginTop: 18,
    marginBottom: 6,
  },
  textoInflacion: { color: colores.textoChip, fontSize: 14, lineHeight: 20, flex: 1 },
  cargando: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 20 },
  resultado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  icono: { width: 40, height: 40, borderRadius: radios.chico, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center' },
  titulo: { color: colores.texto, fontSize: 15, fontWeight: '600' },
  detalle: { color: colores.textoSecundario, fontSize: 13, marginTop: 2 },
  real: { fontSize: 12, fontWeight: '600', marginTop: 4 },
  final: { color: colores.texto, fontSize: 16, fontWeight: '800' },
  ganancia: { color: colores.textoSecundario, fontSize: 12, marginTop: 2 },
  aviso: { color: colores.advertencia, fontSize: 14, marginTop: 12 },
  subtitulo: { color: colores.texto, fontSize: 17, fontWeight: '700', marginTop: 26, marginBottom: 8 },
  opcion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colores.superficie,
    borderRadius: radios.medio,
    padding: 14,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  textoOpcion: { color: colores.texto, fontSize: 15, flex: 1 },
  aclaracion: { color: colores.textoTenue, fontSize: 12, lineHeight: 18, marginTop: 22 },
  tituloModal: { color: colores.texto, fontSize: 24, fontWeight: '800', marginBottom: 14 },
  banco: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colores.borde },
});
