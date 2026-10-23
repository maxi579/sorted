import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useAviso } from '../components/Toast';
import { Objetivo, useRecorridoSeccion } from '../components/Tutorial';
import { Boton, Campo, Chip, confirmar, Encabezado, Etiqueta, Texto as Text } from '../components/ui';
import { colores, radios, tipografia } from '../constants/tema';
import { infoTipo, valuarActivo } from '../lib/activos';
import {
  aportadoEsteMes,
  cuantoPorMes,
  EMOJIS_META,
  fechaEstimada,
  fondoEmergenciaSugerido,
  hacerAportesAutomaticos,
  reservaPendiente,
  ritmoMensual,
  valorMeta,
} from '../lib/ahorros';
import { useDatos } from '../lib/contextoDatos';
import type { FilaMeta } from '../lib/datos';
import { formatearFecha, formatearMes, formatearMonto } from '../lib/finanzas';
import { totalMensualFijos } from '../lib/fijos';
import { fechaParaMostrar, formatearEntradaMonto, leerFecha, leerMonto, montoATexto } from '../lib/formato';
import { useIndicadores } from '../lib/indicadores';
import { presupuestoAutomatico } from '../lib/patrones';
import type { Activo, Aporte, Fijo, GastoGuardado, Meta } from '../lib/tipos';

type ValoresMeta = {
  nombre: string;
  emoji: string;
  objetivoTexto: string;
  fechaTexto: string;
  activoId: string | null;
  mensualTexto: string;
  diaTexto: string;
};

const vacia = (nombre = '', emoji = '💰', objetivo?: number): ValoresMeta => ({
  nombre,
  emoji,
  objetivoTexto: objetivo ? montoATexto(objetivo) : '',
  fechaTexto: '',
  activoId: null,
  mensualTexto: '',
  diaTexto: '',
});

function desdeMeta(m: Meta): ValoresMeta {
  return {
    nombre: m.nombre,
    emoji: m.emoji,
    objetivoTexto: m.objetivo ? montoATexto(m.objetivo) : '',
    fechaTexto: m.fecha_objetivo ? fechaParaMostrar(m.fecha_objetivo) : '',
    activoId: m.activo_id,
    mensualTexto: m.ahorro_mensual ? montoATexto(m.ahorro_mensual) : '',
    diaTexto: m.dia_aporte ? String(m.dia_aporte) : '',
  };
}

function preparar(v: ValoresMeta): { error: string } | { fila: FilaMeta } {
  if (!v.nombre.trim()) return { error: 'Ponele un nombre, por ejemplo "Vacaciones".' };
  const objetivo = v.objetivoTexto.trim() ? leerMonto(v.objetivoTexto) : null;
  if (objetivo !== null && !(objetivo > 0)) return { error: 'Revisá cuánto querés juntar.' };
  const fecha = v.fechaTexto.trim() ? leerFecha(v.fechaTexto) : null;
  if (v.fechaTexto.trim() && !fecha) return { error: 'Revisá la fecha (día/mes/año).' };
  const mensual = v.mensualTexto.trim() ? leerMonto(v.mensualTexto) : null;
  if (mensual !== null && !(mensual > 0)) return { error: 'Revisá cuánto querés separar por mes.' };
  const dia = v.diaTexto.trim() ? Number(v.diaTexto) : null;
  if (dia !== null && (!Number.isInteger(dia) || dia < 1 || dia > 31)) return { error: 'El día tiene que ser del 1 al 31.' };
  if (dia !== null && mensual === null) return { error: 'Para separarlo solo, decime cuánto por mes.' };
  return {
    fila: {
      nombre: v.nombre.trim(),
      emoji: v.emoji,
      objetivo,
      fecha_objetivo: fecha,
      activo_id: v.activoId,
      ahorro_mensual: mensual,
      dia_aporte: dia,
    },
  };
}

type Separando = { meta: Meta; sacar: boolean; montoTexto: string };

export default function Ahorros() {
  const ayuda = useRecorridoSeccion('ahorros');
  const datos = useDatos();
  const aviso = useAviso();
  const indicadores = useIndicadores();
  const [metas, setMetas] = useState<Meta[]>([]);
  const [aportes, setAportes] = useState<Aporte[]>([]);
  const [activos, setActivos] = useState<Activo[]>([]);
  const [fijos, setFijos] = useState<Fijo[]>([]);
  const [gastos, setGastos] = useState<GastoGuardado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState<{ id: string | null; valores: ValoresMeta } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [separando, setSeparando] = useState<Separando | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      let [listaMetas, listaAportes, listaActivos, listaFijos, listaGastos] = await Promise.all([
        datos.metas.listar(),
        datos.aportes.listar(),
        datos.activos.listar(),
        datos.fijos.listar().catch(() => []),
        datos.gastos(),
      ]);
      // Los ahorros automáticos del mes se separan solos
      const hechos = await hacerAportesAutomaticos(datos, listaMetas, listaAportes).catch(() => []);
      if (hechos.length > 0) {
        aviso(`Separé el ahorro del mes para ${hechos.join(', ')} ✓`);
        listaAportes = await datos.aportes.listar();
      }
      setMetas(listaMetas);
      setAportes(listaAportes);
      setActivos(listaActivos);
      setFijos(listaFijos);
      setGastos(listaGastos);
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

  const hoy = new Date();
  const contexto = { hoy, dolar: indicadores.dolarBlue, serieInflacion: indicadores.serieInflacion, inflacionMensual: indicadores.inflacionMensual };
  const detalle = metas.map((meta) => {
    const activo = activos.find((a) => a.id === meta.activo_id) ?? null;
    const valorActivo = activo ? valuarActivo(activo, contexto).valorHoy : null;
    const { valor, intereses } = valorMeta(aportes, meta.id, activo, valorActivo, hoy);
    const porMes = cuantoPorMes(meta, valor, hoy);
    // Si planeó cuánto separar por mes, estimamos con eso; si no, con lo que viene separando
    const estimada = fechaEstimada(meta, valor, Number(meta.ahorro_mensual) || ritmoMensual(aportes, meta.id, hoy), hoy);
    return { meta, activo, valor, intereses, porMes, estimada, esteMes: aportadoEsteMes(aportes, meta.id, hoy) };
  });
  const total = detalle.reduce((s, d) => s + d.valor, 0);
  const totalIntereses = detalle.reduce((s, d) => s + d.intereses, 0);
  const pendiente = reservaPendiente(metas, aportes, hoy);
  const planeado = metas.reduce((s, m) => s + (Number(m.ahorro_mensual) || 0), 0);
  const tieneEmergencia = metas.some((m) => m.emoji === '🛟' || /emergencia/i.test(m.nombre));
  const gastoHabitual = presupuestoAutomatico(gastos, hoy).reduce((s, p) => s + p.habitual, 0);
  const sugerido = tieneEmergencia ? null : fondoEmergenciaSugerido(totalMensualFijos(fijos, indicadores.dolarTarjeta).total, gastoHabitual);
  const disponibles = activos.filter((a) => a.tipo !== 'bien');

  async function guardarMeta() {
    if (!editando) return;
    const preparado = preparar(editando.valores);
    if ('error' in preparado) return setError(preparado.error);
    setError(null);
    setGuardando(true);
    try {
      if (editando.id) await datos.metas.actualizar(editando.id, preparado.fila);
      else await datos.metas.crear(preparado.fila);
      setEditando(null);
      aviso(editando.id ? 'Cambios guardados ✓' : `${preparado.fila.emoji} ${preparado.fila.nombre} creada ✓`);
      cargar();
    } catch (e) {
      setError((e as Error).message);
    }
    setGuardando(false);
  }

  function borrarMeta(id: string, nombre: string) {
    confirmar('Borrar meta', `¿Borrar "${nombre}"? Se borra también lo que anotaste que separaste (la plata no se toca).`, 'Borrar', async () => {
      try {
        await datos.metas.borrar(id);
        setEditando(null);
        cargar();
      } catch (e) {
        aviso((e as Error).message, 'error');
      }
    });
  }

  async function confirmarSeparar() {
    if (!separando) return;
    const monto = leerMonto(separando.montoTexto);
    if (!(monto > 0)) return aviso('Escribí el monto', 'error');
    setGuardando(true);
    try {
      await datos.aportes.crear({
        meta_id: separando.meta.id,
        monto: separando.sacar ? -monto : monto,
        fecha: formatearFecha(new Date()),
        automatico: false,
      });
      aviso(separando.sacar ? 'Anotado que sacaste plata' : `Separaste ${formatearMonto(monto)} para ${separando.meta.nombre} 💪`);
      setSeparando(null);
      cargar();
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
    setGuardando(false);
  }

  const v = editando?.valores;
  const cambiar = (cambios: Partial<ValoresMeta>) => editando && setEditando({ ...editando, valores: { ...editando.valores, ...cambios } });

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.contenido}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colores.primario} />}
      >
        <Encabezado titulo="Ahorros" subtitulo="Para qué estás juntando plata y cuánto te falta" volver ayuda={ayuda} />

        <Objetivo id="ahorros-total">
          <View style={styles.total}>
            <Text style={styles.etiqueta}>Tenés ahorrado</Text>
            <Text style={styles.monto}>{formatearMonto(Math.round(total))}</Text>
            {totalIntereses > 1 && <Text style={styles.intereses}>+{formatearMonto(Math.round(totalIntereses))} de intereses</Text>}
            {planeado > 0 && (
              <View style={styles.reserva}>
                <Ionicons name="lock-closed" size={16} color={colores.primario} />
                <Text style={styles.textoReserva}>
                  {pendiente > 0
                    ? `Este mes te falta separar ${formatearMonto(Math.round(pendiente))}. Ya lo reservé en Inicio para que no lo gastes.`
                    : `Este mes ya separaste lo que planeaste (${formatearMonto(Math.round(planeado))}) 🎉`}
                </Text>
              </View>
            )}
          </View>
        </Objetivo>

        {sugerido && (
          <Objetivo id="ahorros-emergencia">
            <Pressable
              style={({ pressed }) => [styles.sugerencia, pressed && { opacity: 0.85 }]}
              onPress={() => {
                setError(null);
                setEditando({ id: null, valores: vacia('Fondo de emergencia', '🛟', sugerido) });
              }}
            >
              <Text style={styles.emojiGrande}>🛟</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.nombre}>Armá tu fondo de emergencia</Text>
                <Text style={styles.detalle}>
                  Te sugiero {formatearMonto(sugerido)}: lo que se te va en 3 meses. Por si un mes no cobrás o surge algo.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colores.textoTenue} />
            </Pressable>
          </Objetivo>
        )}

        <Text style={[tipografia.seccion, styles.seccion]}>Tus metas</Text>
        {detalle.length === 0 && (
          <View style={styles.vacio}>
            <Ionicons name="flag-outline" size={36} color={colores.textoTenue} />
            <Text style={styles.vacioTexto}>Creá una meta: unas vacaciones, un auto, cambiar el celular...</Text>
          </View>
        )}
        {detalle.map(({ meta, activo, valor, intereses, porMes, estimada, esteMes }) => {
          const progreso = meta.objetivo ? Math.min(valor / Number(meta.objetivo), 1) : null;
          return (
            <Pressable
              key={meta.id}
              style={({ pressed }) => [styles.meta, pressed && { opacity: 0.85 }]}
              onPress={() => {
                setError(null);
                setEditando({ id: meta.id, valores: desdeMeta(meta) });
              }}
            >
              <View style={styles.filaMeta}>
                <Text style={styles.emojiGrande}>{meta.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nombre}>{meta.nombre}</Text>
                  <Text style={styles.detalle}>
                    {formatearMonto(Math.round(valor))}
                    {meta.objetivo ? ` de ${formatearMonto(Number(meta.objetivo))}` : ''}
                    {meta.fecha_objetivo ? ` · para ${formatearMes(new Date(meta.fecha_objetivo + 'T12:00:00'), hoy)}` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => setSeparando({ meta, sacar: false, montoTexto: meta.ahorro_mensual ? montoATexto(Number(meta.ahorro_mensual)) : '' })} style={({ pressed }) => [styles.botonChico, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.textoBotonChico}>Separar</Text>
                </Pressable>
              </View>
              {progreso !== null && (
                <View style={styles.barraFondo}>
                  <View style={[styles.barra, { width: `${progreso * 100}%` }]} />
                </View>
              )}
              <Text style={styles.pista}>
                {progreso !== null && progreso >= 1
                  ? '¡Llegaste! 🎉'
                  : porMes
                    ? `Para llegar a tiempo, separá ${formatearMonto(Math.round(porMes / 1000) * 1000)} por mes`
                    : estimada
                      ? `A este ritmo llegás en ${formatearMes(estimada, hoy)}`
                      : meta.objetivo
                        ? 'Separá algo este mes para ver cuándo llegás'
                        : 'Ahorro sin un monto fijo'}
              </Text>
              {/* Dónde está guardada y cuánto rinde, arriba; el aporte del mes, abajo */}
              <Text style={styles.donde}>
                {activo ? `${infoTipo(activo.tipo).emoji} Guardada en ${activo.nombre}` : '💵 Guardada sin intereses'}
                {intereses > 1 && <Text style={styles.interesesMeta}>{`  +${formatearMonto(Math.round(intereses))} de intereses`}</Text>}
              </Text>
              {meta.ahorro_mensual ? (
                <Text style={styles.donde}>
                  Este mes: {formatearMonto(Math.round(esteMes))} de {formatearMonto(Number(meta.ahorro_mensual))}
                  {meta.dia_aporte ? `, se separa solo el ${meta.dia_aporte}` : ''}
                </Text>
              ) : null}
            </Pressable>
          );
        })}

        <Objetivo id="ahorros-agregar">
          <Pressable
            style={({ pressed }) => [styles.botonAgregar, pressed && { opacity: 0.7 }]}
            onPress={() => {
              setError(null);
              setEditando({ id: null, valores: vacia() });
            }}
          >
            <Ionicons name="add" size={20} color={colores.primario} />
            <Text style={styles.textoAgregar}>Nueva meta de ahorro</Text>
          </Pressable>
        </Objetivo>
      </ScrollView>

      <Modal visible={editando !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditando(null)}>
        <ScrollView style={styles.container} contentContainerStyle={styles.contenidoModal} keyboardShouldPersistTaps="handled">
          <Text style={tipografia.titulo}>{editando?.id ? 'Cambiar meta' : 'Nueva meta'}</Text>
          {v && (
            <View>
              <Etiqueta>Elegí un ícono</Etiqueta>
              <View style={styles.chips}>
                {EMOJIS_META.map((e) => (
                  <Pressable key={e} onPress={() => cambiar({ emoji: e })} style={[styles.emoji, v.emoji === e && styles.emojiActivo]}>
                    <Text style={{ fontSize: 22 }}>{e}</Text>
                  </Pressable>
                ))}
              </View>
              <Campo etiqueta="¿Para qué estás ahorrando?" value={v.nombre} onChangeText={(nombre) => cambiar({ nombre })} placeholder="Ej: Vacaciones" />
              <View style={styles.fila}>
                <Campo
                  etiqueta="¿Cuánto querés juntar?"
                  contenedor={{ flex: 3 }}
                  value={v.objetivoTexto}
                  onChangeText={(t) => cambiar({ objetivoTexto: formatearEntradaMonto(t) })}
                  keyboardType="decimal-pad"
                  placeholder="Opcional"
                />
                <Campo
                  etiqueta="¿Para cuándo?"
                  contenedor={{ flex: 2 }}
                  value={v.fechaTexto}
                  onChangeText={(fechaTexto) => cambiar({ fechaTexto })}
                  placeholder="dd/mm/aaaa"
                />
              </View>

              <Etiqueta>¿Dónde la guardás?</Etiqueta>
              <View style={styles.chips}>
                {disponibles.map((a) => (
                  <Chip key={a.id} etiqueta={`${infoTipo(a.tipo).emoji} ${a.nombre}`} activo={v.activoId === a.id} onPress={() => cambiar({ activoId: a.id })} />
                ))}
                <Chip etiqueta="💵 Sin intereses" activo={v.activoId === null} onPress={() => cambiar({ activoId: null })} />
              </View>
              <Text style={styles.ayuda}>
                {disponibles.length === 0
                  ? 'Si la guardás en Mercado Pago o un plazo fijo, agregalo primero en Activos y sumo los intereses solo.'
                  : 'Si está en una cuenta que paga interés o en un plazo fijo, sumo los intereses solo.'}
              </Text>

              <View style={styles.fila}>
                <Campo
                  etiqueta="¿Cuánto por mes?"
                  contenedor={{ flex: 3 }}
                  value={v.mensualTexto}
                  onChangeText={(t) => cambiar({ mensualTexto: formatearEntradaMonto(t) })}
                  keyboardType="decimal-pad"
                  placeholder="Opcional"
                />
                <Campo
                  etiqueta="Separarlo solo el día"
                  contenedor={{ flex: 2 }}
                  value={v.diaTexto}
                  onChangeText={(diaTexto) => cambiar({ diaTexto })}
                  keyboardType="number-pad"
                  maxLength={2}
                  placeholder="Ej: 5"
                />
              </View>
              <Text style={styles.ayuda}>
                Lo que pongas por mes lo reservo en Inicio para que no lo gastes. Si elegís un día (el que cobrás), lo anoto solo ese día.
              </Text>

              {error && <Text style={styles.error}>{error}</Text>}
              <View style={styles.fila}>
                <Boton titulo="Cancelar" variante="secundario" onPress={() => setEditando(null)} estilo={styles.botonFila} />
                <Boton titulo="Guardar" onPress={guardarMeta} cargando={guardando} estilo={styles.botonFila} />
              </View>
              {editando?.id && (
                <Boton titulo="Borrar esta meta" variante="peligro" onPress={() => borrarMeta(editando.id!, v.nombre)} estilo={{ marginTop: 28 }} />
              )}
            </View>
          )}
        </ScrollView>
      </Modal>

      <Modal visible={separando !== null} animationType="fade" transparent onRequestClose={() => setSeparando(null)}>
        <View style={styles.fondoModal}>
          <View style={styles.cajaModal}>
            <Text style={styles.tituloModal}>
              {separando?.meta.emoji} {separando?.meta.nombre}
            </Text>
            <View style={[styles.chips, { marginTop: 12 }]}>
              <Chip etiqueta="Separé plata" activo={!separando?.sacar} onPress={() => separando && setSeparando({ ...separando, sacar: false })} />
              <Chip etiqueta="Saqué plata" activo={!!separando?.sacar} onPress={() => separando && setSeparando({ ...separando, sacar: true })} />
            </View>
            <Campo
              etiqueta={separando?.sacar ? '¿Cuánto sacaste?' : '¿Cuánto separaste?'}
              value={separando?.montoTexto ?? ''}
              onChangeText={(t) => separando && setSeparando({ ...separando, montoTexto: formatearEntradaMonto(t) })}
              keyboardType="decimal-pad"
              placeholder="0"
              autoFocus
            />
            <View style={styles.fila}>
              <Boton titulo="Cancelar" variante="secundario" onPress={() => setSeparando(null)} estilo={styles.botonFila} />
              <Boton titulo="Listo" onPress={confirmarSeparar} cargando={guardando} estilo={styles.botonFila} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  contenidoModal: { padding: 20, paddingTop: 28, paddingBottom: 60 },
  total: { backgroundColor: colores.superficie, borderRadius: radios.enorme, padding: 20, borderWidth: 1, borderColor: colores.borde },
  etiqueta: { color: colores.textoSecundario, fontSize: 15, fontWeight: '600' },
  monto: { color: colores.texto, fontSize: 36, fontWeight: '800', letterSpacing: -1, marginTop: 2 },
  intereses: { color: colores.primario, fontSize: 14, fontWeight: '600', marginTop: 2 },
  reserva: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colores.borde,
  },
  textoReserva: { color: colores.textoChip, fontSize: 14, lineHeight: 20, flex: 1 },
  sugerencia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    borderWidth: 1,
    borderColor: colores.primario,
    padding: 14,
    marginTop: 14,
  },
  seccion: { marginTop: 28, marginBottom: 12 },
  vacio: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  vacioTexto: { color: colores.textoTenue, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  meta: {
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colores.borde,
    gap: 8,
  },
  filaMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emojiGrande: { fontSize: 30 },
  nombre: { color: colores.texto, fontSize: 16, fontWeight: '700' },
  detalle: { color: colores.textoSecundario, fontSize: 13, marginTop: 2, lineHeight: 18 },
  barraFondo: { height: 8, backgroundColor: colores.fondo, borderRadius: 4, overflow: 'hidden' },
  barra: { height: '100%', backgroundColor: colores.primario, borderRadius: 4 },
  pista: { color: colores.textoChip, fontSize: 14 },
  donde: { color: colores.textoSecundario, fontSize: 13, lineHeight: 18, marginTop: 2 },
  interesesMeta: { color: colores.primario, fontWeight: '600' },
  botonChico: { backgroundColor: colores.primario, borderRadius: radios.chico, paddingVertical: 7, paddingHorizontal: 12 },
  textoBotonChico: { color: colores.sobrePrimario, fontWeight: '700', fontSize: 14 },
  botonAgregar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colores.primario,
    borderRadius: radios.grande,
    padding: 16,
    marginTop: 4,
  },
  textoAgregar: { color: colores.primario, fontWeight: '600', fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emoji: { width: 46, height: 46, borderRadius: radios.chico, borderWidth: 1, borderColor: colores.borde, alignItems: 'center', justifyContent: 'center' },
  emojiActivo: { borderColor: colores.primario, backgroundColor: colores.primarioSuave },
  fila: { flexDirection: 'row', gap: 10 },
  ayuda: { color: colores.textoSecundario, fontSize: 13, marginTop: 8, lineHeight: 18 },
  error: { color: colores.error, marginTop: 14, fontSize: 15, textAlign: 'center' },
  botonFila: { flex: 1, marginTop: 20 },
  fondoModal: { flex: 1, backgroundColor: colores.velo, justifyContent: 'center', padding: 20 },
  cajaModal: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 20, borderWidth: 1, borderColor: colores.borde },
  tituloModal: { color: colores.texto, fontSize: 20, fontWeight: '700' },
});
