import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useAviso } from '../components/Toast';
import { Boton, Campo, Chip, confirmar, Encabezado, Texto as Text } from '../components/ui';
import { estiloCategoria } from '../constants/categorias';
import { colores, radios, tipografia } from '../constants/tema';
import {
  activarRecordatorioEfectivo,
  avisosDisponibles,
  desactivarRecordatorioEfectivo,
  frecuenciaEfectivo,
  recordatorioEfectivoActivado,
  type FrecuenciaEfectivo,
} from '../lib/avisos';
import { useDatos } from '../lib/contextoDatos';
import { balanceEfectivo, compararConteo, saldoEsperado, type ResultadoConteo } from '../lib/efectivo';
import { formatearFecha, formatearMonto } from '../lib/finanzas';
import { formatearEntradaMonto, leerMonto } from '../lib/formato';
import { fechaDesdeTexto } from '../lib/gastos';
import type { Categoria, Conteo, GastoGuardado, Retiro } from '../lib/tipos';
import { Objetivo, useRecorridoSeccion } from '../components/Tutorial';

// Botones rápidos: un toque, el monto y listo
const RAPIDOS: { nombre: string; categoria: Categoria }[] = [
  { nombre: 'Kiosco', categoria: 'Comida y salidas' },
  { nombre: 'Verdulería', categoria: 'Supermercado' },
  { nombre: 'Colectivo / taxi', categoria: 'Transporte' },
  { nombre: 'Comida', categoria: 'Comida y salidas' },
  { nombre: 'Farmacia', categoria: 'Salud' },
  { nombre: 'Otro', categoria: 'Otros' },
];

type Carga =
  | { tipo: 'retiro' }
  | { tipo: 'gasto'; nombre: string; categoria: Categoria }
  /** Contar la billetera: primero el monto, después qué hacer con la diferencia */
  | { tipo: 'contar'; resultado: ResultadoConteo | null; actual: number };

export default function Efectivo() {
  const ayuda = useRecorridoSeccion('efectivo');
  const datos = useDatos();
  const aviso = useAviso();
  // El recordatorio abre esta pantalla con ?contar=si para ir directo a contar
  const { contar } = useLocalSearchParams<{ contar?: string }>();
  const [retiros, setRetiros] = useState<Retiro[]>([]);
  const [gastos, setGastos] = useState<GastoGuardado[]>([]);
  const [conteos, setConteos] = useState<Conteo[]>([]);
  const [cargando, setCargando] = useState(false);
  const [carga, setCarga] = useState<Carga | null>(null);
  const [montoTexto, setMontoTexto] = useState('');
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [recordatorio, setRecordatorio] = useState(false);
  const [frecuencia, setFrecuencia] = useState<FrecuenciaEfectivo>('semanal');

  useEffect(() => {
    recordatorioEfectivoActivado().then(setRecordatorio);
    frecuenciaEfectivo().then(setFrecuencia);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [listaRetiros, listaGastos, listaConteos] = await Promise.all([
        datos.retiros.listar(),
        datos.gastos(),
        datos.conteos.listar().catch(() => []),
      ]);
      setRetiros(listaRetiros);
      setGastos(listaGastos);
      setConteos(listaConteos);
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
    setCargando(false);
  }, [datos, aviso]);

  useFocusEffect(
    useCallback(() => {
      cargar();
      if (contar === 'si') {
        setMontoTexto('');
        setCarga({ tipo: 'contar', resultado: null, actual: 0 });
        router.setParams({ contar: undefined });
      }
    }, [cargar, contar])
  );

  const balance = balanceEfectivo(retiros, gastos);
  const billetera = saldoEsperado(conteos, retiros, gastos);
  const desdeGastos = billetera ? formatearFecha(new Date(billetera.ultimo.creado_en)) : balance.desde;
  const gastosEfectivo = gastos.filter((g) => g.tarjeta_id === null && desdeGastos && g.fecha_compra >= desdeGastos).slice(0, 10);

  function abrir(nueva: Carga) {
    setMontoTexto('');
    setNota(nueva.tipo === 'gasto' && nueva.nombre !== 'Otro' ? nueva.nombre : '');
    setCarga(nueva);
  }

  const hoy = () => formatearFecha(new Date());

  function filaGastoEfectivo(descripcion: string, categoria: Categoria, monto: number) {
    return {
      descripcion,
      categoria,
      monto_total: monto,
      moneda: 'ARS' as const,
      cantidad_cuotas: 1,
      tarjeta_id: null,
      fecha_compra: hoy(),
      primer_mes_cuota: `${hoy().slice(0, 7)}-01`,
    };
  }

  async function guardar() {
    if (!carga || carga.tipo === 'contar') return;
    const monto = leerMonto(montoTexto);
    if (!(monto > 0)) return aviso('Escribí el monto', 'error');
    setGuardando(true);
    try {
      if (carga.tipo === 'retiro') {
        await datos.retiros.crear({ monto, fecha: hoy(), nota: nota.trim() || null });
        aviso('Anotado 💵');
      } else {
        await datos.crearGasto(filaGastoEfectivo(nota.trim() || carga.nombre, carga.categoria, monto));
        aviso('Gasto en efectivo anotado 👌');
      }
      setCarga(null);
      cargar();
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
    setGuardando(false);
  }

  // Paso 1 del conteo: comparamos lo que tiene con lo que debería tener
  async function compararBilletera() {
    const actual = leerMonto(montoTexto);
    if (!montoTexto.trim() || !(actual >= 0)) return aviso('Escribí cuánta plata tenés', 'error');
    const resultado = compararConteo(billetera?.esperado ?? null, actual);
    if (resultado.tipo === 'primero' || resultado.tipo === 'justo') {
      await terminarConteo(actual, resultado.tipo === 'primero' ? 'Listo. La próxima vez que cuentes te digo cuánto gastaste 👌' : '¡Perfecto, tenés todo anotado! 🎉');
      return;
    }
    setCarga({ tipo: 'contar', resultado, actual });
  }

  // Último paso: guardar el conteo (después de anotar la diferencia, así no se cuenta dos veces)
  async function terminarConteo(actual: number, mensaje: string, antes?: () => Promise<unknown>) {
    setGuardando(true);
    try {
      if (antes) await antes();
      await datos.conteos.crear({ monto: actual });
      aviso(mensaje);
      setCarga(null);
      cargar();
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
    setGuardando(false);
  }

  function borrarRetiro(retiro: Retiro) {
    confirmar('Borrar retiro', `¿Borrar el retiro de ${formatearMonto(retiro.monto)}?`, 'Borrar', async () => {
      try {
        await datos.retiros.borrar(retiro.id);
        cargar();
      } catch (e) {
        aviso((e as Error).message, 'error');
      }
    });
  }

  async function cambiarRecordatorio(activar: boolean, nuevaFrecuencia = frecuencia) {
    if (!activar) {
      await desactivarRecordatorioEfectivo();
      setRecordatorio(false);
      return aviso('Listo, no te lo voy a recordar', 'info');
    }
    const ok = await activarRecordatorioEfectivo(nuevaFrecuencia);
    setRecordatorio(ok);
    setFrecuencia(nuevaFrecuencia);
    if (ok) aviso(nuevaFrecuencia === 'diario' ? 'Te lo recuerdo todos los días a las 21 h 💵' : 'Te lo recuerdo los domingos a las 20 h 💵');
    else aviso('No tengo permiso para avisarte. Activalo en la configuración del celular.', 'error');
  }

  const contando = carga?.tipo === 'contar' ? carga : null;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colores.primario} />}
      >
        <Encabezado titulo="Efectivo" subtitulo="Que no se te escape lo que pagás en mano" volver ayuda={ayuda} />

        <Objetivo id="ef-billetera">
          <View style={styles.billetera}>
            <View style={styles.filaTitulo}>
              <Ionicons name="wallet" size={22} color={colores.primario} />
              <Text style={styles.tituloBilletera}>Tu billetera</Text>
            </View>
            {billetera ? (
              <>
                <Text style={styles.etiqueta}>Según tus cuentas, deberías tener</Text>
                <Text style={styles.monto}>{formatearMonto(Math.round(Math.max(billetera.esperado, 0)))}</Text>
                <Text style={styles.detalle}>
                  La última vez que contaste tenías {formatearMonto(Number(billetera.ultimo.monto))} ({fechaCorta(formatearFecha(new Date(billetera.ultimo.creado_en)))}).
                </Text>
              </>
            ) : (
              <Text style={styles.explicacion}>
                ¿Pagás en efectivo y te olvidás de anotar? Contá cuánta plata tenés en la billetera. La próxima vez que la cuentes, te digo cuánto
                gastaste aunque no te acuerdes en qué.
              </Text>
            )}
            <Boton titulo="Contar mi billetera" onPress={() => abrir({ tipo: 'contar', resultado: null, actual: 0 })} estilo={{ marginTop: 14 }} />
            <Boton titulo="Saqué plata del cajero" variante="secundario" onPress={() => abrir({ tipo: 'retiro' })} estilo={{ marginTop: 10 }} />
          </View>
        </Objetivo>

        {!billetera && balance.sinAnotar > 0 && (
          <Text style={styles.aviso}>
            Sacaste {formatearMonto(Math.round(balance.retirado))} y anotaste {formatearMonto(Math.round(balance.anotado))}: hay{' '}
            {formatearMonto(Math.round(balance.sinAnotar))} que no sé en qué se fueron. Contá la billetera y lo resolvemos.
          </Text>
        )}

        <Text style={[tipografia.seccion, styles.seccion]}>Anotar un gasto en efectivo</Text>
        <Objetivo id="ef-rapidos">
          <View style={styles.rapidos}>
            {RAPIDOS.map((r) => {
              const { icono, color } = estiloCategoria(r.categoria);
              return (
                <Pressable
                  key={r.nombre}
                  style={({ pressed }) => [styles.rapido, pressed && { opacity: 0.7 }]}
                  onPress={() => abrir({ tipo: 'gasto', nombre: r.nombre, categoria: r.categoria })}
                >
                  <Ionicons name={icono} size={22} color={color} />
                  <Text style={styles.textoRapido}>{r.nombre}</Text>
                </Pressable>
              );
            })}
          </View>
        </Objetivo>

        {avisosDisponibles && (
          <View style={styles.tarjeta}>
            <View style={styles.filaInterruptor}>
              <Ionicons name="alarm-outline" size={22} color={colores.primario} />
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre}>Recordarme contar la billetera</Text>
                <Text style={styles.detalle}>{datos.esDemo ? 'No disponible en el modo de prueba.' : 'Te aviso para que la cuentes en 10 segundos.'}</Text>
              </View>
              <Switch
                value={recordatorio}
                onValueChange={(activar) => cambiarRecordatorio(activar)}
                disabled={datos.esDemo}
                trackColor={{ true: colores.primario, false: colores.borde }}
                thumbColor={colores.texto}
              />
            </View>
            {recordatorio && (
              <View style={styles.chips}>
                <Chip etiqueta="Todos los días (21 h)" activo={frecuencia === 'diario'} onPress={() => cambiarRecordatorio(true, 'diario')} />
                <Chip etiqueta="Los domingos (20 h)" activo={frecuencia === 'semanal'} onPress={() => cambiarRecordatorio(true, 'semanal')} />
              </View>
            )}
          </View>
        )}

        {retiros.length > 0 && (
          <>
            <Text style={[tipografia.seccion, styles.seccion]}>Retiros</Text>
            {retiros.slice(0, 10).map((r) => (
              <View key={r.id} style={[styles.tarjeta, styles.filaInterruptor]}>
                <Ionicons name="cash-outline" size={22} color={colores.primario} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>{formatearMonto(r.monto)}</Text>
                  <Text style={styles.detalle}>
                    {fechaCorta(r.fecha)}
                    {r.nota ? ` · ${r.nota}` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => borrarRetiro(r)} hitSlop={12} accessibilityLabel="Borrar retiro">
                  <Ionicons name="trash-outline" size={20} color={colores.textoTenue} />
                </Pressable>
              </View>
            ))}
          </>
        )}

        {gastosEfectivo.length > 0 && (
          <>
            <Text style={[tipografia.seccion, styles.seccion]}>Lo que anotaste en efectivo</Text>
            {gastosEfectivo.map((g) => (
              <View key={g.id} style={styles.filaGasto}>
                <Text style={styles.detalle}>
                  {fechaCorta(g.fecha_compra)} · {g.descripcion}
                </Text>
                <Text style={styles.nombre}>{formatearMonto(Number(g.monto_total))}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      <Modal visible={carga !== null} animationType="fade" transparent onRequestClose={() => setCarga(null)}>
        <View style={styles.fondoModal}>
          <View style={styles.cajaModal}>
            {contando && !contando.resultado && (
              <>
                <Text style={styles.tituloModal}>¿Cuánta plata tenés ahora en la billetera?</Text>
                <Text style={styles.ayudaModal}>Contá los billetes y escribí el total.</Text>
                <Campo
                  etiqueta="Total en la billetera"
                  value={montoTexto}
                  onChangeText={(t) => setMontoTexto(formatearEntradaMonto(t))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  autoFocus
                />
                <View style={styles.filaBotones}>
                  <Boton titulo="Cancelar" variante="secundario" onPress={() => setCarga(null)} estilo={{ flex: 1 }} />
                  <Boton titulo="Listo" onPress={compararBilletera} cargando={guardando} estilo={{ flex: 1 }} />
                </View>
              </>
            )}

            {contando?.resultado?.tipo === 'falta' && (
              <>
                <Text style={styles.tituloModal}>Gastaste {formatearMonto(contando.resultado.diferencia)} en efectivo que no anotaste</Text>
                <Text style={styles.ayudaModal}>¿En qué fue, más o menos? Si no te acordás, no pasa nada.</Text>
                <View style={styles.opciones}>
                  {RAPIDOS.filter((r) => r.nombre !== 'Otro').map((r) => (
                    <Chip
                      key={r.nombre}
                      etiqueta={r.nombre}
                      activo={false}
                      onPress={() => {
                        const r2 = contando.resultado as { diferencia: number };
                        terminarConteo(contando.actual, `Anotado: ${r.nombre} 👌`, () =>
                          datos.crearGasto(filaGastoEfectivo(r.nombre, r.categoria, r2.diferencia))
                        );
                      }}
                    />
                  ))}
                </View>
                <Boton
                  titulo="No me acuerdo, anotalo igual"
                  variante="secundario"
                  cargando={guardando}
                  onPress={() => {
                    const r2 = contando.resultado as { diferencia: number };
                    terminarConteo(contando.actual, 'Anotado como gastos varios 👌', () =>
                      datos.crearGasto(filaGastoEfectivo('Gastos varios en efectivo', 'Otros', r2.diferencia))
                    );
                  }}
                  estilo={{ marginTop: 16 }}
                />
              </>
            )}

            {contando?.resultado?.tipo === 'sobra' && (
              <>
                <Text style={styles.tituloModal}>Tenés {formatearMonto(contando.resultado.diferencia)} más de lo que esperaba</Text>
                <Text style={styles.ayudaModal}>¿Sacaste plata del cajero o te dieron plata que no anotaste?</Text>
                <Boton
                  titulo="Sí, anotalo como plata que entró"
                  cargando={guardando}
                  onPress={() => {
                    const r2 = contando.resultado as { diferencia: number };
                    terminarConteo(contando.actual, 'Anotado 💵', () => datos.retiros.crear({ monto: r2.diferencia, fecha: hoy(), nota: 'Plata que entró' }));
                  }}
                  estilo={{ marginTop: 16 }}
                />
                <Boton
                  titulo="No, me había equivocado antes"
                  variante="secundario"
                  onPress={() => terminarConteo(contando.actual, 'Listo, actualicé tu billetera 👌')}
                  estilo={{ marginTop: 10 }}
                />
              </>
            )}

            {carga && carga.tipo !== 'contar' && (
              <>
                <Text style={styles.tituloModal}>
                  {carga.tipo === 'retiro' ? '¿Cuánto sacaste?' : `¿Cuánto gastaste${carga.nombre !== 'Otro' ? ` en ${carga.nombre.toLowerCase()}` : ''}?`}
                </Text>
                <Campo
                  etiqueta="Monto"
                  value={montoTexto}
                  onChangeText={(t) => setMontoTexto(formatearEntradaMonto(t))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  autoFocus
                />
                <Campo
                  etiqueta={carga.tipo === 'retiro' ? 'Nota (opcional)' : '¿Qué fue?'}
                  value={nota}
                  onChangeText={setNota}
                  placeholder={carga.tipo === 'retiro' ? 'Ej: cajero Galicia' : 'Ej: verdulería'}
                />
                <View style={styles.filaBotones}>
                  <Boton titulo="Cancelar" variante="secundario" onPress={() => setCarga(null)} estilo={{ flex: 1 }} />
                  <Boton titulo="Guardar" onPress={guardar} cargando={guardando} estilo={{ flex: 1 }} />
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fechaCorta(fecha: string) {
  const d = fechaDesdeTexto(fecha);
  return `${d.getDate()} ${MESES_CORTOS[d.getMonth()]}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  billetera: { backgroundColor: colores.superficie, borderRadius: radios.enorme, padding: 18, borderWidth: 1, borderColor: colores.borde },
  filaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  tituloBilletera: { color: colores.texto, fontSize: 18, fontWeight: '700' },
  etiqueta: { color: colores.textoSecundario, fontSize: 14 },
  monto: { color: colores.texto, fontSize: 34, fontWeight: '800', letterSpacing: -1, marginTop: 2 },
  detalle: { color: colores.textoSecundario, fontSize: 13, marginTop: 4, lineHeight: 18 },
  explicacion: { color: colores.textoChip, fontSize: 15, lineHeight: 22 },
  aviso: { color: colores.advertencia, fontSize: 14, lineHeight: 20, marginTop: 12 },
  seccion: { marginTop: 28, marginBottom: 12 },
  rapidos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  rapido: {
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    gap: 6,
    backgroundColor: colores.superficie,
    borderRadius: radios.medio,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  textoRapido: { color: colores.textoChip, fontSize: 13, fontWeight: '600', textAlign: 'center' },
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  filaInterruptor: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  nombre: { color: colores.texto, fontSize: 15, fontWeight: '600' },
  filaGasto: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: 8 },
  fondoModal: { flex: 1, backgroundColor: colores.velo, justifyContent: 'center', padding: 20 },
  cajaModal: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 20, borderWidth: 1, borderColor: colores.borde },
  tituloModal: { color: colores.texto, fontSize: 20, fontWeight: '700', lineHeight: 26 },
  ayudaModal: { color: colores.textoSecundario, fontSize: 14, marginTop: 6, lineHeight: 20 },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
