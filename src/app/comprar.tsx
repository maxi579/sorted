import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useAviso } from '../components/Toast';
import { Boton, Chip, Encabezado, Entrada as TextInput, Texto as Text } from '../components/ui';
import { colores, colorSegunPorcentaje, radios } from '../constants/tema';
import { veredicto, type Nivel } from '../lib/asistente';
import { useDatos } from '../lib/contextoDatos';
import type { Perfil } from '../lib/datos';
import { evaluarCompra } from '../lib/decision';
import { diasEntre, formatearDia, formatearMes, formatearMonto, tarjetasParaHoy } from '../lib/finanzas';
import { formatearEntradaMonto, leerMonto } from '../lib/formato';
import { mesDeInflacion, useIndicadores } from '../lib/indicadores';
import type { GastoGuardado, MedioPago } from '../lib/tipos';
import { Objetivo, useRecorridoSeccion } from '../components/Tutorial';

const OPCIONES_CUOTAS = [1, 3, 6, 9, 12, 18, 24];
const EFECTIVO = 'efectivo';

const ESTILO_NIVEL: Record<Nivel, { icono: keyof typeof Ionicons.glyphMap; color: string }> = {
  si: { icono: 'checkmark-circle', color: colores.primario },
  cuidado: { icono: 'alert-circle', color: colores.advertencia },
  no: { icono: 'close-circle', color: colores.peligro },
  sinSueldo: { icono: 'help-circle', color: colores.textoSecundario },
};

// Porcentajes: "2,5" → 2.5
const leerPorcentaje = (texto: string) => Number(texto.replace(',', '.')) || 0;

export default function Comprar() {
  const ayuda = useRecorridoSeccion('comprar');
  const datos = useDatos();
  const aviso = useAviso();
  const indicadores = useIndicadores();
  const [precio, setPrecio] = useState('');
  const [cuotas, setCuotas] = useState(1);
  const [medioId, setMedioId] = useState<string | null>(null);
  const [masOpciones, setMasOpciones] = useState(false);
  const [descuento, setDescuento] = useState('');
  const [totalCuotas, setTotalCuotas] = useState('');
  const [inflacionTexto, setInflacionTexto] = useState<string | null>(null);
  const [verMeses, setVerMeses] = useState(false);
  const [medios, setMedios] = useState<MedioPago[]>([]);
  const [gastos, setGastos] = useState<GastoGuardado[]>([]);
  const [perfil, setPerfil] = useState<Perfil>({ nombre: null, sueldo: null, tono: 'directo' });

  useFocusEffect(
    useCallback(() => {
      Promise.all([datos.medios(), datos.gastos(), datos.perfil()])
        .then(([todos, guardados, nuevoPerfil]) => {
          setMedios(todos);
          setGastos(guardados);
          setPerfil(nuevoPerfil);
          // Arranca con la tarjeta que más conviene hoy
          setMedioId((actual) => {
            if (actual === EFECTIVO || todos.some((m) => m.id === actual)) return actual;
            return tarjetasParaHoy(todos)[0]?.medio.id ?? EFECTIVO;
          });
        })
        .catch((e) => aviso(e.message, 'error'));
    }, [datos, aviso])
  );

  const hoy = useMemo(() => new Date(), []);
  const opcionesTarjeta = useMemo(() => tarjetasParaHoy(medios, hoy), [medios, hoy]);
  const mejor = opcionesTarjeta[0] ?? null;
  const medio = medios.find((m) => m.id === medioId) ?? null;
  const esCredito = medio?.tipo === 'credito';
  const inflacionPorcentaje = inflacionTexto ?? (indicadores.inflacionMensual * 100).toFixed(1).replace('.', ',');

  const respuesta = useMemo(() => {
    const precioN = leerMonto(precio);
    if (!(precioN > 0)) return null;
    return evaluarCompra({
      precio: precioN,
      cuotas: esCredito ? cuotas : 1,
      medio: esCredito ? medio : null,
      descuentoContado: leerPorcentaje(descuento),
      totalEnCuotas: totalCuotas ? leerMonto(totalCuotas) : null,
      inflacionMensual: leerPorcentaje(inflacionPorcentaje) / 100,
      dolarTarjeta: indicadores.dolarTarjeta,
      sueldo: perfil.sueldo,
      gastos,
      hoy,
    });
  }, [precio, cuotas, medio, esCredito, descuento, totalCuotas, inflacionPorcentaje, indicadores.dolarTarjeta, perfil.sueldo, gastos, hoy]);

  const estilo = respuesta ? ESTILO_NIVEL[respuesta.nivel] : null;
  const opcionElegida = opcionesTarjeta.find((o) => o.medio.id === medioId);
  const diasDeMas = mejor && opcionElegida ? mejor.dias - opcionElegida.dias : 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Encabezado titulo="¿Lo compro?" subtitulo="Poné el precio y te digo si te conviene." volver ayuda={ayuda} />

      <Objetivo id="comprar-datos">
        <View style={styles.tarjeta}>
          <Text style={styles.pregunta}>¿Cuánto cuesta?</Text>
          <View style={styles.cajaPrecio}>
            <Text style={styles.signo}>$</Text>
            <TextInput
              style={styles.inputPrecio}
              value={precio}
              onChangeText={(v) => setPrecio(formatearEntradaMonto(v))}
              placeholder="0"
              keyboardType="decimal-pad"
            />
          </View>

          <Text style={styles.pregunta}>¿Con qué lo pagarías?</Text>
          <View style={styles.chips}>
            {opcionesTarjeta.map((o, i) => (
              <Chip
                key={o.medio.id}
                etiqueta={i === 0 && opcionesTarjeta.length > 1 ? `⭐ ${o.medio.nombre}` : o.medio.nombre}
                activo={medioId === o.medio.id}
                onPress={() => setMedioId(o.medio.id)}
              />
            ))}
            <Chip
              etiqueta="Efectivo o débito"
              activo={!esCredito}
              onPress={() => {
                setMedioId(EFECTIVO);
                setCuotas(1);
              }}
            />
          </View>
          {opcionesTarjeta.length > 1 && <Text style={styles.ayuda}>⭐ = la tarjeta que más tarde pagás si comprás hoy</Text>}
          {opcionesTarjeta.length === 0 && (
            <Text style={styles.ayuda}>Para ver cuotas, agregá una tarjeta de crédito en Ajustes.</Text>
          )}

          {esCredito && (
            <>
              <Text style={styles.pregunta}>¿En cuántas cuotas?</Text>
              <View style={styles.chips}>
                {OPCIONES_CUOTAS.map((n) => (
                  <Chip key={n} etiqueta={n === 1 ? '1 pago' : `${n}`} activo={cuotas === n} onPress={() => setCuotas(n)} />
                ))}
              </View>
            </>
          )}

          <Pressable style={styles.masOpciones} onPress={() => setMasOpciones(!masOpciones)}>
            <Text style={styles.masOpcionesTexto}>{masOpciones ? 'Menos opciones' : 'Más opciones (descuentos, recargos, inflación)'}</Text>
            <Ionicons name={masOpciones ? 'chevron-up' : 'chevron-down'} size={16} color={colores.primario} />
          </Pressable>

          {masOpciones && (
            <Animated.View entering={FadeIn}>
              <Campo
                etiqueta="Descuento si pagás en efectivo o en un pago (%)"
                valor={descuento}
                onCambio={setDescuento}
                placeholder="Ej: 10"
              />
              {esCredito && cuotas > 1 && (
                <Campo
                  etiqueta="Total a pagar en cuotas, si tiene recargo"
                  valor={totalCuotas}
                  onCambio={(v) => setTotalCuotas(formatearEntradaMonto(v))}
                  placeholder="Igual al precio"
                />
              )}
              <Campo
                etiqueta="Inflación por mes que esperás (%)"
                valor={inflacionPorcentaje}
                onCambio={setInflacionTexto}
                placeholder="2"
              />
              <Text style={styles.ayuda}>
                {indicadores.ultimaInflacion
                  ? `Usamos el promedio de los últimos 3 meses del INDEC (en ${mesDeInflacion(indicadores.ultimaInflacion.mes)} fue ${String(indicadores.ultimaInflacion.valor).replace('.', ',')}%).`
                  : 'Sin datos del INDEC por ahora: usamos 2% por mes.'}
              </Text>
            </Animated.View>
          )}
        </View>
      </Objetivo>

      {!respuesta && (
        <View style={styles.vacio}>
          <Ionicons name="bag-handle-outline" size={40} color={colores.textoTenue} />
          <Text style={styles.vacioTexto}>Escribí el precio de lo que querés comprar y te respondo al instante.</Text>
        </View>
      )}

      {respuesta && estilo && (
        <Animated.View entering={FadeInDown.springify()}>
          <View style={[styles.veredicto, { borderColor: estilo.color }]}>
            <Ionicons name={estilo.icono} size={44} color={estilo.color} />
            <Text style={[styles.veredictoTitulo, { color: estilo.color }]}>{veredicto(respuesta.nivel, perfil.tono)}</Text>
            {respuesta.porcentajePeorMes !== null ? (
              <Text style={styles.veredictoTexto}>
                Tu mes más cargado sería {formatearMes(respuesta.peorMes.fecha, hoy)}: {formatearMonto(Math.round(respuesta.peorMes.despues))}, el{' '}
                {respuesta.porcentajePeorMes.toFixed(0)}% de tu sueldo.
              </Text>
            ) : (
              <>
                <Text style={styles.veredictoTexto}>Para saber si te alcanza necesito saber cuánto cobrás por mes.</Text>
                <Boton titulo="Cargar mi sueldo" variante="secundario" onPress={() => router.push('/ajustes')} estilo={{ marginTop: 12, alignSelf: 'stretch' }} />
              </>
            )}
          </View>

          <Text style={styles.seccion}>Lo que tenés que saber</Text>
          <View style={styles.datos}>
            <Dato
              icono="cash-outline"
              texto={
                respuesta.cuotas > 1
                  ? `Pagarías ${respuesta.cuotas} cuotas de ${formatearMonto(Math.round(respuesta.montoCuota))}.`
                  : `Pagarías ${formatearMonto(Math.round(respuesta.totalAPagar))} en un pago.`
              }
            />
            <Dato
              icono="calendar-outline"
              texto={
                esCredito
                  ? `${respuesta.cuotas > 1 ? 'La primera cuota la' : 'Lo'} pagás el ${formatearDia(respuesta.primerPago)} (dentro de ${diasEntre(hoy, respuesta.primerPago)} días).`
                  : 'Lo pagás hoy.'
              }
            />
            {respuesta.comparacion && (
              <Dato
                icono={respuesta.comparacion.convieneCuotas ? 'trending-down-outline' : 'pricetag-outline'}
                destacado
                texto={
                  respuesta.comparacion.convieneCuotas
                    ? `Te conviene en cuotas. Con la inflación, esas cuotas equivalen hoy a ${formatearMonto(Math.round(respuesta.comparacion.valorHoyCuotas))}: ahorrás unos ${formatearMonto(Math.round(respuesta.comparacion.diferencia))}.`
                    : `Te conviene pagar en un pago: ahorrás unos ${formatearMonto(Math.round(respuesta.comparacion.diferencia))} comparado con las cuotas.`
                }
              />
            )}
            {respuesta.cuotas > 1 && respuesta.libertadDespues && (
              <Dato
                icono="flag-outline"
                texto={
                  respuesta.libertadAntes && respuesta.libertadAntes.getTime() === respuesta.libertadDespues.getTime()
                    ? `Seguís terminando de pagar tus cuotas en ${formatearMes(respuesta.libertadDespues, hoy)}.`
                    : `Terminarías de pagar tus cuotas en ${formatearMes(respuesta.libertadDespues, hoy)}${respuesta.libertadAntes ? ` (hoy: ${formatearMes(respuesta.libertadAntes, hoy)})` : ''}.`
                }
              />
            )}
            {esCredito && mejor && diasDeMas > 0 && (
              <Dato
                icono="card-outline"
                texto={`Si la pagás con la ${mejor.medio.nombre}, la pagás ${diasDeMas} días más tarde.`}
              />
            )}
          </View>

          <Pressable style={styles.masOpciones} onPress={() => setVerMeses(!verMeses)}>
            <Text style={styles.masOpcionesTexto}>{verMeses ? 'Ocultar mes por mes' : 'Ver cómo quedan los próximos meses'}</Text>
            <Ionicons name={verMeses ? 'chevron-up' : 'chevron-down'} size={16} color={colores.primario} />
          </Pressable>
          {verMeses && (
            <Animated.View entering={FadeIn}>
              <View style={styles.filaMesTitulo}>
                <Text style={[styles.columnaMes, styles.tituloColumna]}>Mes</Text>
                <Text style={[styles.columnaValor, styles.tituloColumna]}>Sin comprar</Text>
                <Text style={[styles.columnaValor, styles.tituloColumna]}>Comprando</Text>
              </View>
              {respuesta.meses.map((mes) => {
                const p = perfil.sueldo ? (mes.despues / perfil.sueldo) * 100 : null;
                return (
                  <View key={mes.fecha.toISOString()} style={styles.filaMes}>
                    <Text style={styles.columnaMes}>{formatearMes(mes.fecha, hoy)}</Text>
                    <Text style={[styles.columnaValor, styles.antes]}>{formatearMonto(Math.round(mes.antes))}</Text>
                    <Text style={[styles.columnaValor, styles.despues, { color: colorSegunPorcentaje(p) }]}>
                      {formatearMonto(Math.round(mes.despues))}
                    </Text>
                  </View>
                );
              })}
            </Animated.View>
          )}
        </Animated.View>
      )}
    </ScrollView>
  );
}

function Dato({ icono, texto, destacado }: { icono: keyof typeof Ionicons.glyphMap; texto: string; destacado?: boolean }) {
  return (
    <View style={styles.dato}>
      <Ionicons name={icono} size={20} color={colores.primario} style={{ marginTop: 1 }} />
      <Text style={[styles.datoTexto, destacado && styles.datoDestacado]}>{texto}</Text>
    </View>
  );
}

type PropsCampo = { etiqueta: string; valor: string; onCambio: (v: string) => void; placeholder: string };

function Campo({ etiqueta, valor, onCambio, placeholder }: PropsCampo) {
  return (
    <View>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <TextInput style={styles.input} value={valor} onChangeText={onCambio} placeholder={placeholder} keyboardType="decimal-pad" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  tarjeta: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 16, borderWidth: 1, borderColor: colores.borde },
  pregunta: { color: colores.texto, fontSize: 17, fontWeight: '700', marginTop: 16, marginBottom: 10 },
  cajaPrecio: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.fondo,
    borderRadius: radios.medio,
    borderWidth: 1,
    borderColor: colores.borde,
    paddingHorizontal: 16,
  },
  signo: { color: colores.textoSecundario, fontSize: 28, fontWeight: '700', marginRight: 6 },
  inputPrecio: { flex: 1, color: colores.texto, fontSize: 30, fontWeight: '700', paddingVertical: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ayuda: { color: colores.textoTenue, fontSize: 13, marginTop: 8, lineHeight: 19 },
  masOpciones: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, paddingVertical: 4 },
  masOpcionesTexto: { color: colores.primario, fontSize: 15, fontWeight: '600' },
  etiqueta: { color: colores.textoSecundario, fontSize: 14, marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: colores.fondo, color: colores.texto, borderRadius: radios.chico, padding: 13, fontSize: 16, borderWidth: 1, borderColor: colores.borde },
  vacio: { alignItems: 'center', gap: 10, paddingVertical: 32, paddingHorizontal: 20 },
  vacioTexto: { color: colores.textoTenue, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  veredicto: {
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    padding: 20,
    marginTop: 20,
    borderWidth: 2,
    alignItems: 'center',
    gap: 6,
  },
  veredictoTitulo: { fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: -0.5 },
  veredictoTexto: { color: colores.textoChip, fontSize: 16, textAlign: 'center', lineHeight: 23 },
  seccion: { color: colores.texto, fontSize: 18, fontWeight: 'bold', marginTop: 26, marginBottom: 10 },
  datos: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 16, gap: 14, borderWidth: 1, borderColor: colores.borde },
  dato: { flexDirection: 'row', gap: 12 },
  datoTexto: { color: colores.textoChip, fontSize: 16, lineHeight: 23, flex: 1 },
  datoDestacado: { color: colores.texto, fontWeight: '600' },
  filaMesTitulo: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 10, marginBottom: 6 },
  tituloColumna: { color: colores.textoTenue, fontSize: 12, fontWeight: '600' },
  filaMes: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderRadius: radios.chico,
    padding: 12,
    marginBottom: 6,
  },
  columnaMes: { color: colores.texto, fontSize: 15, fontWeight: '600', flex: 1.1 },
  columnaValor: { flex: 1, textAlign: 'right' },
  antes: { color: colores.textoSecundario, fontSize: 15 },
  despues: { fontSize: 15, fontWeight: '700' },
});
