import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useAviso } from '../components/Toast';
import { Boton, Campo, Chip, confirmar, Encabezado, Etiqueta, Texto as Text } from '../components/ui';
import { colores, radios, tipografia } from '../constants/tema';
import { formatearPorcentaje, infoTipo, TIPOS_ACTIVO, valuarActivo, type Valuacion } from '../lib/activos';
import { useDatos } from '../lib/contextoDatos';
import type { FilaActivo } from '../lib/datos';
import { deudaPendiente, formatearDia, formatearFecha, formatearMonto } from '../lib/finanzas';
import { fechaParaMostrar, formatearEntradaMonto, leerFecha, leerMonto, montoATexto } from '../lib/formato';
import { useIndicadores } from '../lib/indicadores';
import type { Activo, GastoGuardado, TipoActivo } from '../lib/tipos';
import { Objetivo, useRecorridoSeccion } from '../components/Tutorial';

type Valores = {
  nombre: string;
  tipo: TipoActivo;
  montoTexto: string;
  fechaTexto: string;
  cantidadTexto: string;
  tnaTexto: string;
  plazoTexto: string;
  valorActualTexto: string;
  depreciacionTexto: string;
};

const MANUALES: TipoActivo[] = ['fci', 'acciones', 'cripto', 'otro'];

function valoresVacios(): Valores {
  return {
    nombre: '',
    tipo: 'dolares',
    montoTexto: '',
    fechaTexto: fechaParaMostrar(formatearFecha(new Date())),
    cantidadTexto: '',
    tnaTexto: '',
    plazoTexto: '30',
    valorActualTexto: '',
    depreciacionTexto: '20',
  };
}

function valoresDesde(a: Activo): Valores {
  const texto = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));
  return {
    nombre: a.nombre,
    tipo: a.tipo,
    montoTexto: montoATexto(a.monto_inicial),
    fechaTexto: fechaParaMostrar(a.fecha_inicio),
    cantidadTexto: a.cantidad === null ? '' : montoATexto(a.cantidad),
    tnaTexto: texto(a.tna),
    plazoTexto: texto(a.plazo_dias),
    valorActualTexto: a.valor_actual === null ? '' : montoATexto(a.valor_actual),
    depreciacionTexto: texto(a.depreciacion_anual),
  };
}

function preparar(v: Valores): { error: string } | { fila: FilaActivo } {
  const monto = leerMonto(v.montoTexto);
  const fecha = leerFecha(v.fechaTexto);
  const numero = (t: string) => (t.trim() ? leerMonto(t) : null);
  if (!(monto >= 0) || !v.montoTexto.trim()) return { error: 'Escribí cuánto pusiste o pagaste, en pesos.' };
  if (!fecha) return { error: 'Revisá la fecha (día/mes/año).' };
  const fila: FilaActivo = {
    nombre: v.nombre.trim() || infoTipo(v.tipo).nombre,
    tipo: v.tipo,
    monto_inicial: monto,
    fecha_inicio: fecha,
    cantidad: v.tipo === 'dolares' ? numero(v.cantidadTexto) : null,
    tna: v.tipo === 'plazo_fijo' || v.tipo === 'remunerada' ? numero(v.tnaTexto) : null,
    plazo_dias: v.tipo === 'plazo_fijo' ? numero(v.plazoTexto) : null,
    valor_actual: MANUALES.includes(v.tipo) ? numero(v.valorActualTexto) : null,
    depreciacion_anual: v.tipo === 'bien' ? numero(v.depreciacionTexto) : null,
  };
  if (fila.tipo === 'dolares' && !(fila.cantidad! > 0)) return { error: '¿Cuántos dólares compraste?' };
  if ((fila.tipo === 'plazo_fijo' || fila.tipo === 'remunerada') && !(fila.tna! > 0)) return { error: 'Escribí la tasa (TNA), por ejemplo 32.' };
  if (fila.tipo === 'plazo_fijo' && !(fila.plazo_dias! > 0)) return { error: '¿A cuántos días es el plazo fijo?' };
  return { fila };
}

export default function Activos() {
  const ayuda = useRecorridoSeccion('activos');
  const datos = useDatos();
  const aviso = useAviso();
  const indicadores = useIndicadores();
  const [activos, setActivos] = useState<Activo[]>([]);
  const [gastos, setGastos] = useState<GastoGuardado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [editando, setEditando] = useState<{ id: string | null; valores: Valores } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const [lista, todos] = await Promise.all([datos.activos.listar(), datos.gastos()]);
      setActivos(lista);
      setGastos(todos);
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
  const valuados = activos.map((a) => ({ activo: a, valuacion: valuarActivo(a, contexto) }));
  const totalActivos = valuados.reduce((s, x) => s + x.valuacion.valorHoy, 0);
  const deuda = deudaPendiente(gastos, hoy, indicadores.inflacionMensual, indicadores.dolarTarjeta).total;
  const patrimonio = totalActivos - deuda;

  async function guardar() {
    if (!editando) return;
    const preparado = preparar(editando.valores);
    if ('error' in preparado) return setError(preparado.error);
    setError(null);
    setGuardando(true);
    try {
      if (editando.id) await datos.activos.actualizar(editando.id, preparado.fila);
      else await datos.activos.crear(preparado.fila);
      setEditando(null);
      aviso('Guardado ✓');
      cargar();
    } catch (e) {
      setError((e as Error).message);
    }
    setGuardando(false);
  }

  function borrar(id: string, nombre: string) {
    confirmar('Borrar activo', `¿Borrar "${nombre}"?`, 'Borrar', async () => {
      try {
        await datos.activos.borrar(id);
        setEditando(null);
        cargar();
      } catch (e) {
        aviso((e as Error).message, 'error');
      }
    });
  }

  const v = editando?.valores;
  const cambiar = (cambios: Partial<Valores>) => editando && setEditando({ ...editando, valores: { ...editando.valores, ...cambios } });

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.contenido}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colores.primario} />}
      >
        <Encabezado titulo="Activos" subtitulo="Lo que tenés, cuánto vale hoy y cuánto rindió" volver ayuda={ayuda} />

        <Objetivo id="activos-patrimonio">
          <View style={styles.patrimonio}>
            <Text style={styles.etiqueta}>Tu patrimonio</Text>
            <Text style={[styles.monto, patrimonio < 0 && { color: colores.peligro }]}>{formatearMonto(Math.round(patrimonio))}</Text>
            <View style={styles.filaDato}>
              <Text style={styles.dato}>Lo que tenés</Text>
              <Text style={styles.dato}>{formatearMonto(Math.round(totalActivos))}</Text>
            </View>
            <View style={styles.filaDato}>
              <Text style={styles.dato}>Lo que debés en cuotas</Text>
              <Text style={styles.dato}>− {formatearMonto(Math.round(deuda))}</Text>
            </View>
            {indicadores.dolarBlue && (
              <Text style={styles.fuente}>Dólares valuados al blue compra: {formatearMonto(indicadores.dolarBlue)}</Text>
            )}
          </View>
        </Objetivo>

        <Objetivo id="activos-calculadora">
          <Pressable style={({ pressed }) => [styles.calculadora, pressed && { opacity: 0.8 }]} onPress={() => router.push('/rendimiento')}>
            <Ionicons name="calculator" size={22} color={colores.primario} />
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>¿Cuánto me rinde?</Text>
              <Text style={styles.detalle}>Compará plazo fijo, billeteras y la inflación con tu plata</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colores.textoTenue} />
          </Pressable>
        </Objetivo>

        <Text style={[tipografia.seccion, styles.seccion]}>Lo que tenés</Text>
        {valuados.length === 0 && (
          <View style={styles.vacio}>
            <Ionicons name="trending-up" size={36} color={colores.textoTenue} />
            <Text style={styles.vacioTexto}>Agregá tus dólares, plazos fijos, la plata en Mercado Pago o cosas como el auto.</Text>
          </View>
        )}
        {valuados.map(({ activo, valuacion }) => (
          <TarjetaActivo key={activo.id} activo={activo} valuacion={valuacion} onPress={() => setEditando({ id: activo.id, valores: valoresDesde(activo) })} />
        ))}

        <Objetivo id="activos-agregar">
          <Pressable
            style={({ pressed }) => [styles.botonAgregar, pressed && { opacity: 0.7 }]}
            onPress={() => {
              setError(null);
              setEditando({ id: null, valores: valoresVacios() });
            }}
          >
            <Ionicons name="add" size={20} color={colores.primario} />
            <Text style={styles.textoAgregar}>Agregar activo</Text>
          </Pressable>
        </Objetivo>

        <Text style={styles.aclaracion}>
          Son cálculos con los datos que cargaste y cotizaciones públicas (DolarApi, INDEC). El rendimiento “real” descuenta la inflación desde
          que lo compraste. No es una recomendación de inversión.
        </Text>
      </ScrollView>

      <Modal visible={editando !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditando(null)}>
        <ScrollView style={styles.container} contentContainerStyle={styles.contenidoModal} keyboardShouldPersistTaps="handled">
          <Text style={tipografia.titulo}>{editando?.id ? 'Cambiar activo' : 'Nuevo activo'}</Text>
          {v && (
            <View>
              <Etiqueta>¿Qué es?</Etiqueta>
              <View style={styles.chips}>
                {TIPOS_ACTIVO.map((t) => (
                  <Chip key={t.valor} etiqueta={`${t.emoji} ${t.nombre}`} activo={v.tipo === t.valor} onPress={() => cambiar({ tipo: t.valor })} />
                ))}
              </View>
              <Text style={styles.ayuda}>{infoTipo(v.tipo).ayuda}</Text>

              <Campo etiqueta="Nombre" placeholder={infoTipo(v.tipo).nombre} value={v.nombre} onChangeText={(nombre) => cambiar({ nombre })} />
              <View style={styles.fila}>
                <Campo
                  etiqueta={v.tipo === 'bien' ? '¿Cuánto pagaste? ($)' : '¿Cuánto pusiste? ($)'}
                  contenedor={{ flex: 3 }}
                  value={v.montoTexto}
                  onChangeText={(t) => cambiar({ montoTexto: formatearEntradaMonto(t) })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                />
                <Campo
                  etiqueta="¿Cuándo?"
                  contenedor={{ flex: 2 }}
                  value={v.fechaTexto}
                  onChangeText={(fechaTexto) => cambiar({ fechaTexto })}
                  placeholder="dd/mm/aaaa"
                />
              </View>

              {v.tipo === 'dolares' && (
                <Campo
                  etiqueta="¿Cuántos dólares?"
                  value={v.cantidadTexto}
                  onChangeText={(t) => cambiar({ cantidadTexto: formatearEntradaMonto(t) })}
                  keyboardType="decimal-pad"
                  placeholder="Ej: 500"
                />
              )}
              {(v.tipo === 'plazo_fijo' || v.tipo === 'remunerada') && (
                <View style={styles.fila}>
                  <Campo
                    etiqueta="Tasa anual (TNA %)"
                    contenedor={{ flex: 1 }}
                    value={v.tnaTexto}
                    onChangeText={(tnaTexto) => cambiar({ tnaTexto })}
                    keyboardType="decimal-pad"
                    placeholder="Ej: 32"
                  />
                  {v.tipo === 'plazo_fijo' && (
                    <Campo
                      etiqueta="Plazo (días)"
                      contenedor={{ flex: 1 }}
                      value={v.plazoTexto}
                      onChangeText={(plazoTexto) => cambiar({ plazoTexto })}
                      keyboardType="number-pad"
                    />
                  )}
                </View>
              )}
              {MANUALES.includes(v.tipo) && (
                <Campo
                  etiqueta="¿Cuánto vale hoy? ($)"
                  value={v.valorActualTexto}
                  onChangeText={(t) => cambiar({ valorActualTexto: formatearEntradaMonto(t) })}
                  keyboardType="decimal-pad"
                  placeholder="Lo ves en la app del banco o broker"
                />
              )}
              {v.tipo === 'bien' && (
                <Campo
                  etiqueta="¿Cuánto pierde de valor por año? (%)"
                  value={v.depreciacionTexto}
                  onChangeText={(depreciacionTexto) => cambiar({ depreciacionTexto })}
                  keyboardType="decimal-pad"
                  placeholder="Celular ~25, auto ~10"
                />
              )}

              {error && <Text style={styles.error}>{error}</Text>}
              <View style={styles.fila}>
                <Boton titulo="Cancelar" variante="secundario" onPress={() => setEditando(null)} estilo={styles.botonFila} />
                <Boton titulo="Guardar" onPress={guardar} cargando={guardando} estilo={styles.botonFila} />
              </View>
              {editando?.id && (
                <Boton
                  titulo="Borrar este activo"
                  variante="peligro"
                  onPress={() => borrar(editando.id!, v.nombre)}
                  estilo={{ marginTop: 28 }}
                />
              )}
            </View>
          )}
        </ScrollView>
      </Modal>
    </View>
  );
}

function TarjetaActivo({ activo, valuacion, onPress }: { activo: Activo; valuacion: Valuacion; onPress: () => void }) {
  const info = infoTipo(activo.tipo);
  const color = (n: number | null) => (n === null ? colores.textoSecundario : n >= 0 ? colores.primario : colores.peligro);
  return (
    <Pressable style={({ pressed }) => [styles.item, pressed && { opacity: 0.8 }]} onPress={onPress}>
      <Text style={styles.emoji}>{info.emoji}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.nombre} numberOfLines={1}>
          {activo.nombre}
        </Text>
        <Text style={styles.detalle}>
          {info.nombre}
          {activo.tipo === 'dolares' && activo.cantidad ? ` · US$ ${activo.cantidad.toLocaleString('es-AR')}` : ''}
          {activo.tna ? ` · TNA ${String(activo.tna).replace('.', ',')}%` : ''}
        </Text>
        {valuacion.vencimiento && (
          <Text style={[styles.detalle, { color: valuacion.vencimiento.vencido ? colores.advertencia : colores.textoChip }]}>
            {valuacion.vencimiento.vencido ? 'Ya venció: ' : `Vence el ${formatearDia(valuacion.vencimiento.fecha)}: `}cobrás{' '}
            {formatearMonto(Math.round(valuacion.vencimiento.valor))}
          </Text>
        )}
        {valuacion.manual && activo.valor_actual === null && <Text style={styles.pista}>Tocá para cargar cuánto vale hoy</Text>}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.valor}>{formatearMonto(Math.round(valuacion.valorHoy))}</Text>
        {valuacion.rendimiento !== null && (
          <Text style={[styles.rendimiento, { color: color(valuacion.rendimiento) }]}>{formatearPorcentaje(valuacion.rendimiento)}</Text>
        )}
        {valuacion.rendimientoReal !== null && (
          <Text style={[styles.real, { color: color(valuacion.rendimientoReal) }]}>{formatearPorcentaje(valuacion.rendimientoReal)} real</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  contenidoModal: { padding: 20, paddingTop: 28, paddingBottom: 60 },
  patrimonio: { backgroundColor: colores.superficie, borderRadius: radios.enorme, padding: 20, borderWidth: 1, borderColor: colores.borde, gap: 6 },
  etiqueta: { color: colores.textoSecundario, fontSize: 15, fontWeight: '600' },
  monto: { color: colores.texto, fontSize: 36, fontWeight: '800', letterSpacing: -1, marginBottom: 6 },
  filaDato: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  dato: { color: colores.textoChip, fontSize: 14 },
  fuente: { color: colores.textoTenue, fontSize: 12, marginTop: 6 },
  seccion: { marginTop: 28, marginBottom: 12 },
  calculadora: {
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
  vacio: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  vacioTexto: { color: colores.textoTenue, fontSize: 15, textAlign: 'center', lineHeight: 22 },
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
  emoji: { fontSize: 28 },
  nombre: { color: colores.texto, fontSize: 16, fontWeight: '600' },
  detalle: { color: colores.textoSecundario, fontSize: 13, marginTop: 2 },
  pista: { color: colores.advertencia, fontSize: 12, marginTop: 3 },
  valor: { color: colores.texto, fontSize: 15, fontWeight: '700' },
  rendimiento: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  real: { fontSize: 12, marginTop: 1 },
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
    marginTop: 8,
  },
  textoAgregar: { color: colores.primario, fontWeight: '600', fontSize: 16 },
  aclaracion: { color: colores.textoTenue, fontSize: 12, lineHeight: 18, marginTop: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ayuda: { color: colores.primario, fontSize: 13, marginTop: 8 },
  fila: { flexDirection: 'row', gap: 10 },
  error: { color: colores.error, marginTop: 14, fontSize: 15, textAlign: 'center' },
  botonFila: { flex: 1, marginTop: 20 },
});
