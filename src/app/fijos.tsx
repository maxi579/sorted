import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import FormularioFijo, { valoresDesdeFijo, valoresFijoVacios, type ValoresFijo } from '../components/FormularioFijo';
import { useAviso } from '../components/Toast';
import { Boton, Campo, confirmar, Encabezado, Texto as Text } from '../components/ui';
import { estiloCategoria } from '../constants/categorias';
import { colores, radios, tipografia } from '../constants/tema';
import { avisosDisponibles, programarAvisosVencimiento } from '../lib/avisos';
import { useDatos } from '../lib/contextoDatos';
import type { FilaFijo } from '../lib/datos';
import { formatearDia, formatearMonto } from '../lib/finanzas';
import {
  anotarDebitos,
  deshacerPago,
  detectarRecurrentes,
  fijosDelMes,
  normalizarDescripcion,
  pagarFijo,
  pareceSuscripcion,
  pendienteDeFijos,
  totalMensualFijos,
  type EstadoFijo,
  type FijoDelMes,
  type Recurrente,
} from '../lib/fijos';
import { formatearEntradaMonto, leerMonto, montoATexto } from '../lib/formato';
import { useIndicadores } from '../lib/indicadores';
import type { Fijo, GastoGuardado, MedioPago, PagoFijo } from '../lib/tipos';
import { Objetivo, useRecorridoSeccion } from '../components/Tutorial';

const CLAVE_DESCARTADOS = 'recurrentes-descartados';

const ESTADOS: Record<EstadoFijo, { texto: string; color: string }> = {
  pagado: { texto: 'Pagado', color: colores.primario },
  vencido: { texto: 'Vencido', color: colores.peligro },
  hoy: { texto: 'Vence hoy', color: colores.advertencia },
  proximo: { texto: 'Vence pronto', color: colores.advertencia },
  pendiente: { texto: 'Pendiente', color: colores.textoTenue },
};

type Formulario = { id: string | null; valores: ValoresFijo };
type Pagando = { item: FijoDelMes; montoTexto: string };

export default function Fijos() {
  const ayuda = useRecorridoSeccion('fijos');
  const datos = useDatos();
  const aviso = useAviso();
  const { dolarTarjeta } = useIndicadores();
  const [fijos, setFijos] = useState<Fijo[]>([]);
  const [pagos, setPagos] = useState<PagoFijo[]>([]);
  const [medios, setMedios] = useState<MedioPago[]>([]);
  const [gastos, setGastos] = useState<GastoGuardado[]>([]);
  const [descartados, setDescartados] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [pagando, setPagando] = useState<Pagando | null>(null);
  const [guardandoPago, setGuardandoPago] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      let [listaFijos, listaPagos, listaMedios, listaGastos] = await Promise.all([
        datos.fijos.listar(),
        datos.pagosFijos.listar(),
        datos.medios(),
        datos.gastos(),
      ]);
      // Los débitos automáticos que ya vencieron se anotan solos
      const anotados = await anotarDebitos(datos, listaFijos, listaPagos, listaMedios, listaGastos).catch(() => []);
      if (anotados.length > 0) aviso(`Anoté ${anotados.join(', ')} (débito automático) ✓`);
      // Pudo haber pagos nuevos (aunque no se haya anotado nada: un débito ya anotado a mano se marca como pagado)
      [listaPagos, listaGastos] = await Promise.all([datos.pagosFijos.listar(), anotados.length > 0 ? datos.gastos() : listaGastos]);
      setFijos(listaFijos);
      setPagos(listaPagos);
      setMedios(listaMedios);
      setGastos(listaGastos);
      if (!datos.esDemo) programarAvisosVencimiento(listaFijos, listaPagos).catch(() => {});
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
    setCargando(false);
  }, [datos, aviso]);

  useFocusEffect(
    useCallback(() => {
      cargar();
      AsyncStorage.getItem(CLAVE_DESCARTADOS)
        .then((t) => setDescartados(t ? JSON.parse(t) : []))
        .catch(() => {});
    }, [cargar])
  );

  const delMes = fijosDelMes(fijos, pagos);
  const pendiente = pendienteDeFijos(delMes, dolarTarjeta);
  const mensual = totalMensualFijos(fijos, dolarTarjeta);
  const recurrentes = detectarRecurrentes(gastos, fijos).filter((r) => !descartados.includes(normalizarDescripcion(r.descripcion)));

  async function guardarFijo(fila: FilaFijo) {
    if (formulario?.id) await datos.fijos.actualizar(formulario.id, fila);
    else await datos.fijos.crear(fila);
    setFormulario(null);
    aviso(formulario?.id ? 'Cambios guardados ✓' : `${fila.descripcion} agregado a tus fijos ✓`);
    cargar();
  }

  function borrarFijo(id: string, nombre: string) {
    confirmar('Borrar fijo', `¿Borrar "${nombre}"? Los gastos que ya se anotaron no se borran.`, 'Borrar', async () => {
      try {
        await datos.fijos.borrar(id);
        setFormulario(null);
        aviso('Fijo borrado');
        cargar();
      } catch (e) {
        aviso((e as Error).message, 'error');
      }
    });
  }

  function agregarRecurrente(r: Recurrente) {
    const suscripcion = pareceSuscripcion(r.descripcion);
    setFormulario({
      id: null,
      valores: {
        ...valoresFijoVacios(),
        descripcion: r.descripcion,
        tipo: suscripcion ? 'suscripcion' : 'servicio',
        montoTexto: montoATexto(r.monto),
        moneda: r.moneda,
        diaTexto: String(r.dia),
        medioId: r.tarjeta_id,
        debitoAutomatico: suscripcion,
        categoria: r.categoria,
      },
    });
  }

  async function descartarRecurrente(r: Recurrente) {
    const nuevos = [...descartados, normalizarDescripcion(r.descripcion)];
    setDescartados(nuevos);
    AsyncStorage.setItem(CLAVE_DESCARTADOS, JSON.stringify(nuevos)).catch(() => {});
  }

  async function confirmarPago() {
    if (!pagando) return;
    const monto = leerMonto(pagando.montoTexto);
    if (!(monto > 0)) return aviso('Escribí cuánto pagaste', 'error');
    setGuardandoPago(true);
    try {
      const { fijo } = pagando.item;
      await pagarFijo(datos, fijo, monto, new Date(), medios);
      // Si cambió el precio (Netflix aumentó), lo actualizamos solo para los meses que vienen
      if (fijo.monto !== null && Math.abs(monto - fijo.monto) / fijo.monto > 0.02) {
        await datos.fijos.actualizar(fijo.id, { monto });
        const subio = monto > fijo.monto;
        aviso(`${fijo.descripcion} ${subio ? 'aumentó' : 'bajó'} a ${formatearMonto(monto, fijo.moneda)}. Lo actualicé ✓`, subio ? 'info' : 'exito');
      } else {
        aviso(`${fijo.descripcion} pagado ✓`);
      }
      setPagando(null);
      cargar();
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
    setGuardandoPago(false);
  }

  function deshacer(item: FijoDelMes) {
    if (!item.pago) return;
    confirmar('Deshacer pago', `¿Marcar "${item.fijo.descripcion}" como no pagado? También se borra el gasto anotado.`, 'Deshacer', async () => {
      try {
        await deshacerPago(datos, item.pago!);
        cargar();
      } catch (e) {
        aviso((e as Error).message, 'error');
      }
    });
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.contenido}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={cargar} tintColor={colores.primario} />}
      >
        <Encabezado titulo="Fijos y suscripciones" subtitulo="Lo que pagás todos los meses, en un solo lugar" ayuda={ayuda} />

        {fijos.length > 0 && (
          <Objetivo id="fijos-resumen">
            <View style={styles.resumen}>
              <View style={styles.resumenFila}>
                <Text style={styles.resumenEtiqueta}>Falta pagar este mes</Text>
                <Text style={styles.resumenMonto}>{formatearMonto(Math.round(pendiente.total))}</Text>
              </View>
              {pendiente.sinMonto > 0 && (
                <Text style={styles.resumenNota}>
                  {pendiente.sinMonto === 1 ? '+ 1 factura que todavía no llegó' : `+ ${pendiente.sinMonto} facturas que todavía no llegaron`}
                </Text>
              )}
              <View style={styles.separador} />
              <Text style={styles.resumenDetalle}>Por mes se van {formatearMonto(Math.round(mensual.total))} en fijos</Text>
              {mensual.cantidadSuscripciones > 0 && (
                <Text style={styles.resumenDetalle}>
                  {mensual.cantidadSuscripciones} {mensual.cantidadSuscripciones === 1 ? 'suscripción' : 'suscripciones'}:{' '}
                  {formatearMonto(Math.round(mensual.suscripciones))} por mes ({formatearMonto(Math.round(mensual.suscripciones * 12))} al año)
                </Text>
              )}
            </View>
          </Objetivo>
        )}

        {recurrentes.slice(0, 3).map((r) => (
          <View key={r.descripcion} style={styles.detectado}>
            <Ionicons name="sparkles" size={18} color={colores.advertencia} />
            <View style={{ flex: 1 }}>
              <Text style={styles.detectadoTexto}>
                Parece que pagás <Text style={{ fontWeight: '700' }}>{r.descripcion}</Text> todos los meses (
                {formatearMonto(r.monto, r.moneda)}). ¿Lo agrego a tus fijos?
              </Text>
              <View style={styles.detectadoBotones}>
                <Pressable onPress={() => agregarRecurrente(r)} style={({ pressed }) => [styles.botonChico, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.textoBotonChico}>Sí, agregar</Text>
                </Pressable>
                <Pressable onPress={() => descartarRecurrente(r)} hitSlop={8}>
                  <Text style={styles.textoNo}>No</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ))}

        <Text style={[tipografia.seccion, styles.seccion]}>Este mes</Text>
        {delMes.length === 0 && (
          <View style={styles.vacio}>
            <Ionicons name="repeat" size={36} color={colores.textoTenue} />
            <Text style={styles.vacioTexto}>
              Agregá la luz, el gas, el alquiler, Netflix...{'\n'}Te aviso antes de que venzan y los sumo a lo que tenés que pagar.
            </Text>
          </View>
        )}
        {delMes.map((item) => {
          const { fijo, vence, estado } = item;
          const { icono, color } = estiloCategoria(fijo.categoria);
          const medio = medios.find((m) => m.id === fijo.tarjeta_id);
          const estilo = ESTADOS[estado];
          return (
            <Pressable
              key={fijo.id}
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.8 }]}
              onPress={() => setFormulario({ id: fijo.id, valores: valoresDesdeFijo(fijo) })}
            >
              <View style={[styles.icono, { backgroundColor: `${color}1f` }]}>
                <Ionicons name={icono} size={22} color={color} />
              </View>
              <View style={styles.info}>
                <Text style={styles.nombre} numberOfLines={1}>
                  {fijo.descripcion}
                </Text>
                <Text style={styles.detalle} numberOfLines={1}>
                  {fijo.debito_automatico ? 'Se debita' : 'Vence'} el {formatearDia(vence)}
                </Text>
                {medio && (
                  <Text style={styles.detalle} numberOfLines={1}>
                    {medio.nombre}
                  </Text>
                )}
                <Text style={[styles.estado, { color: estilo.color }]}>{estilo.texto}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 6 }}>
                <Text style={styles.monto}>
                  {item.pago
                    ? formatearMonto(item.pago.monto, fijo.moneda)
                    : fijo.monto
                      ? formatearMonto(fijo.monto, fijo.moneda)
                      : 'Falta el monto'}
                </Text>
                {item.pago ? (
                  <Pressable onPress={() => deshacer(item)} hitSlop={8}>
                    <Text style={styles.textoDeshacer}>Deshacer</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => setPagando({ item, montoTexto: fijo.monto ? montoATexto(fijo.monto) : '' })}
                    style={({ pressed }) => [styles.botonChico, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.textoBotonChico}>Pagar</Text>
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        })}

        <Pressable
          style={({ pressed }) => [styles.botonAgregar, pressed && { opacity: 0.7 }]}
          onPress={() => setFormulario({ id: null, valores: valoresFijoVacios() })}
        >
          <Ionicons name="add" size={20} color={colores.primario} />
          <Text style={styles.textoAgregar}>Agregar gasto fijo o suscripción</Text>
        </Pressable>

        {avisosDisponibles && fijos.length > 0 && (
          <Text style={styles.pista}>Si activás “Avisarme antes del cierre y vencimientos” en Ajustes, también te aviso un día antes de cada vencimiento.</Text>
        )}
      </ScrollView>

      <Modal visible={formulario !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFormulario(null)}>
        <ScrollView style={styles.container} contentContainerStyle={styles.contenidoModal} keyboardShouldPersistTaps="handled">
          <Text style={tipografia.titulo}>{formulario?.id ? 'Cambiar fijo' : 'Nuevo gasto fijo'}</Text>
          {formulario && (
            <FormularioFijo key={formulario.id ?? 'nuevo'} inicial={formulario.valores} medios={medios} onGuardar={guardarFijo} onCancelar={() => setFormulario(null)} />
          )}
          {formulario?.id && (
            <Boton
              titulo="Borrar este fijo"
              variante="peligro"
              onPress={() => borrarFijo(formulario.id!, formulario.valores.descripcion)}
              estilo={{ marginTop: 28 }}
            />
          )}
        </ScrollView>
      </Modal>

      <Modal visible={pagando !== null} animationType="fade" transparent onRequestClose={() => setPagando(null)}>
        <View style={styles.fondoModal}>
          <View style={styles.cajaPago}>
            <Text style={styles.tituloPago}>Pagar {pagando?.item.fijo.descripcion}</Text>
            <Campo
              etiqueta={pagando?.item.fijo.monto ? '¿Cuánto pagaste?' : '¿Cuánto vino la factura?'}
              value={pagando?.montoTexto ?? ''}
              onChangeText={(t) => pagando && setPagando({ ...pagando, montoTexto: formatearEntradaMonto(t) })}
              keyboardType="decimal-pad"
              placeholder="0"
              autoFocus
            />
            <Text style={styles.ayudaPago}>Lo anoto como gasto de hoy en {medios.find((m) => m.id === pagando?.item.fijo.tarjeta_id)?.nombre ?? 'efectivo'}.</Text>
            <View style={styles.filaBotones}>
              <Boton titulo="Cancelar" variante="secundario" onPress={() => setPagando(null)} estilo={{ flex: 1 }} />
              <Boton titulo="Listo, pagado" onPress={confirmarPago} cargando={guardandoPago} estilo={{ flex: 1 }} />
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
  resumen: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 16, borderWidth: 1, borderColor: colores.borde, gap: 4 },
  resumenFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  resumenEtiqueta: { color: colores.textoSecundario, fontSize: 15 },
  resumenMonto: { color: colores.texto, fontSize: 24, fontWeight: '800' },
  resumenNota: { color: colores.advertencia, fontSize: 13 },
  resumenDetalle: { color: colores.textoChip, fontSize: 14, lineHeight: 20 },
  separador: { height: StyleSheet.hairlineWidth, backgroundColor: colores.borde, marginVertical: 8 },
  detectado: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: colores.advertenciaFondo,
    borderColor: colores.advertenciaBorde,
    borderWidth: 1,
    borderRadius: radios.grande,
    padding: 14,
    marginTop: 14,
  },
  detectadoTexto: { color: colores.textoChip, fontSize: 15, lineHeight: 21 },
  detectadoBotones: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10 },
  seccion: { marginTop: 28, marginBottom: 12 },
  vacio: { alignItems: 'center', gap: 10, paddingVertical: 20 },
  vacioTexto: { color: colores.textoTenue, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  icono: { width: 44, height: 44, borderRadius: radios.chico, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, marginLeft: 12, marginRight: 8 },
  nombre: { color: colores.texto, fontSize: 16, fontWeight: '600' },
  detalle: { color: colores.textoSecundario, fontSize: 13, marginTop: 2 },
  estado: { fontSize: 12, fontWeight: '600', marginTop: 3 },
  monto: { color: colores.texto, fontSize: 15, fontWeight: '700' },
  botonChico: { backgroundColor: colores.primario, borderRadius: radios.chico, paddingVertical: 6, paddingHorizontal: 12 },
  textoBotonChico: { color: colores.sobrePrimario, fontWeight: '700', fontSize: 14 },
  textoNo: { color: colores.textoSecundario, fontWeight: '600', fontSize: 14 },
  textoDeshacer: { color: colores.textoTenue, fontSize: 13, textDecorationLine: 'underline' },
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
  pista: { color: colores.textoTenue, fontSize: 13, marginTop: 14, lineHeight: 19 },
  fondoModal: { flex: 1, backgroundColor: colores.velo, justifyContent: 'center', padding: 20 },
  cajaPago: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 20, borderWidth: 1, borderColor: colores.borde },
  tituloPago: { color: colores.texto, fontSize: 20, fontWeight: '700' },
  ayudaPago: { color: colores.textoSecundario, fontSize: 13, marginTop: 8 },
  filaBotones: { flexDirection: 'row', gap: 10, marginTop: 18 },
});
