import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useBloqueo } from '../components/Bloqueo';
import FormularioMedioPago from '../components/FormularioMedioPago';
import RecibosSueldo from '../components/RecibosSueldo';
import { useAviso } from '../components/Toast';
import { confirmar, Encabezado, Entrada as TextInput, Texto as Text } from '../components/ui';
import { colores, radios } from '../constants/tema';
import { TONOS } from '../lib/asistente';
import {
  activarAvisos,
  activarRecordatorio,
  avisosActivados,
  avisosDisponibles,
  desactivarAvisos,
  desactivarRecordatorio,
  programarAvisosCierre,
  programarAvisosVencimiento,
  recordatorioActivado,
} from '../lib/avisos';
import { useDatos } from '../lib/contextoDatos';
import { formatearFecha, formatearMonto } from '../lib/finanzas';
import { formatearEntradaMonto, leerMonto, montoATexto } from '../lib/formato';
import { mesDeInflacion, useIndicadores } from '../lib/indicadores';
import { soloDemo, supabase } from '../lib/supabase';
import type { MedioPago, Tono } from '../lib/tipos';
import { Objetivo, useRecorridoSeccion } from '../components/Tutorial';

export default function Ajustes() {
  const ayuda = useRecorridoSeccion('ajustes');
  const datos = useDatos();
  const aviso = useAviso();
  const indicadores = useIndicadores();
  const [medios, setMedios] = useState<MedioPago[]>([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [sueldoTexto, setSueldoTexto] = useState('');
  const [tono, setTono] = useState<Tono>('directo');
  const [avisos, setAvisos] = useState(false);
  const [recordatorio, setRecordatorio] = useState(false);
  const bloqueo = useBloqueo();
  const [cambiandoBloqueo, setCambiandoBloqueo] = useState(false);

  useEffect(() => {
    avisosActivados().then(setAvisos);
    recordatorioActivado().then(setRecordatorio);
  }, []);

  const cargar = useCallback(async () => {
    try {
      const [perfil, lista] = await Promise.all([datos.perfil(), datos.medios()]);
      if (perfil.sueldo) setSueldoTexto(montoATexto(perfil.sueldo));
      setTono(perfil.tono);
      setMedios(lista);
      return lista;
    } catch (e) {
      aviso((e as Error).message, 'error');
      return null;
    }
  }, [datos, aviso]);

  // Recarga al volver a la pestaña, por si cambió algo en otra pantalla
  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  // Cada vez que cambian las tarjetas, reprograma los avisos de cierre
  async function recargarMedios() {
    const lista = await cargar();
    if (lista && !datos.esDemo) programarAvisosCierre(lista).catch(() => {});
  }

  async function guardarSueldo() {
    const sueldo = leerMonto(sueldoTexto);
    if (!(sueldo > 0)) return aviso('Escribí cuánto cobrás por mes', 'error');
    try {
      await datos.guardarSueldo(sueldo);
      aviso('Sueldo guardado ✓');
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
  }

  async function elegirTono(nuevo: Tono) {
    const anterior = tono;
    setTono(nuevo);
    try {
      await datos.guardarTono(nuevo);
    } catch (e) {
      setTono(anterior);
      aviso((e as Error).message, 'error');
    }
  }

  async function cambiarAvisos(activar: boolean) {
    if (!activar) {
      await desactivarAvisos();
      setAvisos(false);
      return aviso('Listo, no te voy a avisar', 'info');
    }
    const ok = await activarAvisos(medios);
    setAvisos(ok);
    if (ok) {
      Promise.all([datos.fijos.listar(), datos.pagosFijos.listar()])
        .then(([fijos, pagos]) => programarAvisosVencimiento(fijos, pagos))
        .catch(() => {});
      aviso('Te aviso un día antes de cada cierre y vencimiento 🔔');
    }
    else aviso('No tengo permiso para avisarte. Activalo en la configuración del celular.', 'error');
  }

  async function cambiarBloqueo(activar: boolean) {
    setCambiandoBloqueo(true);
    try {
      await bloqueo.cambiar(activar);
      aviso(activar ? `Listo: Sorted te pide ${bloqueo.biometria?.nombre ?? 'Face ID'} al abrirla 🔒` : 'Bloqueo apagado', activar ? undefined : 'info');
    } catch (e) {
      aviso((e as Error).message, 'error');
    }
    setCambiandoBloqueo(false);
  }

  function borrarCuenta() {
    confirmar(
      'Borrar mi cuenta',
      'Se borran tu cuenta y todos tus datos: gastos, cuotas, fijos, ahorros, todo. No se puede deshacer.',
      'Borrar todo',
      async () => {
        const { error } = await supabase.functions.invoke('borrar-cuenta');
        if (error) return aviso('No se pudo borrar la cuenta. Probá de nuevo en un rato.', 'error');
        await datos.salir().catch(() => supabase.auth.signOut({ scope: 'local' }));
      }
    );
  }

  async function cambiarRecordatorio(activar: boolean) {
    if (!activar) {
      await desactivarRecordatorio();
      setRecordatorio(false);
      return aviso('Listo, no te voy a recordar', 'info');
    }
    const hoy = formatearFecha(new Date());
    const anotoHoy = (await datos.gastos().catch(() => [])).some((g) => g.fecha_compra === hoy);
    const ok = await activarRecordatorio(anotoHoy);
    setRecordatorio(ok);
    if (ok) aviso('Te aviso a las 21 h los días que no anotes nada 📝');
    else aviso('No tengo permiso para avisarte. Activalo en la configuración del celular.', 'error');
  }

  function confirmarBorrado(medio: MedioPago) {
    confirmar(
      'Borrar tarjeta',
      `¿Borrar "${medio.nombre}"? Los gastos que hiciste con ella no se borran.`,
      'Borrar',
      async () => {
        try {
          await datos.borrarMedio(medio.id);
          aviso('Tarjeta borrada');
          recargarMedios();
        } catch (e) {
          aviso((e as Error).message, 'error');
        }
      }
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contenido} keyboardShouldPersistTaps="handled">
      <Encabezado titulo="Ajustes" subtitulo="Tu sueldo, tus tarjetas y los avisos" volver ayuda={ayuda} />

      <Objetivo id="ajustes-sueldo">
        <Text style={styles.seccion}>¿Cuánto cobrás por mes?</Text>
        <Text style={styles.pista}>Lo uso para decirte qué parte de tu sueldo ya está ocupada.</Text>
        <View style={styles.filaSueldo}>
          <TextInput
            style={styles.inputSueldo}
            value={sueldoTexto}
            onChangeText={(v) => setSueldoTexto(formatearEntradaMonto(v))}
            placeholder="Ej: 600.000"
            keyboardType="number-pad"
          />
          <Pressable style={({ pressed }) => [styles.botonSueldo, pressed && { opacity: 0.8 }]} onPress={guardarSueldo}>
            <Text style={styles.textoBotonSueldo}>Guardar</Text>
          </Pressable>
        </View>
        <RecibosSueldo onSueldo={(sueldo) => setSueldoTexto(montoATexto(sueldo))} />
      </Objetivo>

      <Objetivo id="ajustes-tarjetas">
        <Text style={styles.seccion}>Tus tarjetas y billeteras</Text>
        {medios.length > 0 && <Text style={styles.pista}>Tocá una para cambiarla.</Text>}
        {medios.length === 0 && !mostrarFormulario && (
          <Text style={styles.pista}>Agregá las tarjetas con las que pagás. Así sé cuándo vence cada cuota.</Text>
        )}
      </Objetivo>

      {medios.map((medio) =>
        editandoId === medio.id ? (
          <FormularioMedioPago
            key={medio.id}
            medio={medio}
            onGuardado={() => {
              setEditandoId(null);
              aviso('Cambios guardados ✓');
              recargarMedios();
            }}
            onCancelar={() => setEditandoId(null)}
          />
        ) : (
          <Pressable
            key={medio.id}
            style={({ pressed }) => [styles.tarjeta, pressed && { opacity: 0.7 }]}
            onPress={() => {
              setMostrarFormulario(false);
              setEditandoId(medio.id);
            }}
          >
            <View style={styles.iconoMedio}>
              <Ionicons name={medio.tipo === 'credito' ? 'card' : 'wallet'} size={20} color={colores.primario} />
            </View>
            <View style={styles.info}>
              <Text style={styles.nombre}>{medio.nombre}</Text>
              <Text style={styles.detalle}>
                {medio.tipo === 'credito' ? 'Crédito' : 'Débito'}
                {medio.banco && medio.banco !== medio.nombre ? ` de ${medio.banco}` : ''}
              </Text>
              {medio.tipo === 'credito' && (
                <Text style={styles.detalle}>
                  Cierra el {medio.dia_cierre} y vence el {medio.dia_vencimiento}
                </Text>
              )}
            </View>
            <Pressable onPress={() => confirmarBorrado(medio)} hitSlop={12} accessibilityLabel={`Borrar ${medio.nombre}`}>
              <Ionicons name="trash-outline" size={22} color={colores.textoTenue} />
            </Pressable>
          </Pressable>
        )
      )}

      {mostrarFormulario ? (
        <FormularioMedioPago
          onGuardado={() => {
            setMostrarFormulario(false);
            aviso('Tarjeta agregada ✓');
            recargarMedios();
          }}
          onCancelar={() => setMostrarFormulario(false)}
        />
      ) : (
        <Pressable
          style={({ pressed }) => [styles.botonAgregar, pressed && { opacity: 0.7 }]}
          onPress={() => {
            setEditandoId(null);
            setMostrarFormulario(true);
          }}
        >
          <Ionicons name="add" size={20} color={colores.primario} />
          <Text style={styles.textoAgregar}>Agregar tarjeta o billetera</Text>
        </Pressable>
      )}

      <Text style={[styles.seccion, styles.separada]}>¿Cómo querés que te hable el asistente?</Text>
      <View style={{ gap: 8 }}>
        {TONOS.map((t) => (
          <Pressable
            key={t.valor}
            style={({ pressed }) => [styles.tono, tono === t.valor && styles.tonoActivo, pressed && { opacity: 0.8 }]}
            onPress={() => elegirTono(t.valor)}
          >
            <Text style={styles.tonoEmoji}>{t.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>{t.nombre}</Text>
              <Text style={styles.detalle}>{t.descripcion}</Text>
            </View>
            <Ionicons
              name={tono === t.valor ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={tono === t.valor ? colores.primario : colores.textoTenue}
            />
          </Pressable>
        ))}
      </View>

      {avisosDisponibles && (
        <>
          <Text style={[styles.seccion, styles.separada]}>Avisos</Text>
          <View style={styles.tarjeta}>
            <View style={styles.iconoMedio}>
              <Ionicons name="moon" size={20} color={colores.primario} />
            </View>
            <View style={styles.info}>
              <Text style={styles.nombre}>Recordarme a la noche</Text>
              <Text style={styles.detalle}>
                {datos.esDemo ? 'No disponible en el modo de prueba.' : 'A las 21 h, solo los días que no anotaste ningún gasto.'}
              </Text>
            </View>
            <Switch
              value={recordatorio}
              onValueChange={cambiarRecordatorio}
              disabled={datos.esDemo}
              trackColor={{ true: colores.primario, false: colores.borde }}
              thumbColor={colores.texto}
            />
          </View>
          <View style={styles.tarjeta}>
            <View style={styles.iconoMedio}>
              <Ionicons name="notifications" size={20} color={colores.primario} />
            </View>
            <View style={styles.info}>
              <Text style={styles.nombre}>Avisarme antes del cierre y vencimientos</Text>
              <Text style={styles.detalle}>
                {datos.esDemo
                  ? 'No disponible en el modo de prueba.'
                  : 'Un día antes de que cierre cada tarjeta y de que venza cada gasto fijo.'}
              </Text>
            </View>
            <Switch
              value={avisos}
              onValueChange={cambiarAvisos}
              disabled={datos.esDemo}
              trackColor={{ true: colores.primario, false: colores.borde }}
              thumbColor={colores.texto}
            />
          </View>
        </>
      )}

      <Text style={[styles.seccion, styles.separada]}>Privacidad y seguridad</Text>
      <View style={styles.tarjeta}>
        <View style={styles.iconoMedio}>
          <Ionicons name={bloqueo.biometria?.icono ?? 'lock-closed'} size={20} color={colores.primario} />
        </View>
        <View style={styles.info}>
          <Text style={styles.nombre}>Pedir {bloqueo.biometria?.nombre ?? 'Face ID o huella'} al abrir</Text>
          <Text style={styles.detalle}>
            {datos.esDemo
              ? 'No disponible en el modo de prueba.'
              : bloqueo.biometria?.disponible
                ? 'Así nadie más puede abrir la app desde tu celular.'
                : 'Tu celular no tiene Face ID ni huella configurados.'}
          </Text>
        </View>
        <Switch
          value={bloqueo.activo}
          onValueChange={cambiarBloqueo}
          disabled={datos.esDemo || cambiandoBloqueo || (!bloqueo.biometria?.disponible && !bloqueo.activo)}
          trackColor={{ true: colores.primario, false: colores.borde }}
          thumbColor={colores.texto}
        />
      </View>
      <Pressable style={({ pressed }) => [styles.tarjeta, pressed && { opacity: 0.8 }]} onPress={() => router.push('/privacidad')}>
        <View style={styles.iconoMedio}>
          <Ionicons name="shield-checkmark" size={20} color={colores.primario} />
        </View>
        <View style={styles.info}>
          <Text style={styles.nombre}>Cómo cuidamos tus datos</Text>
          <Text style={styles.detalle}>Qué se guarda, qué no y dónde.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colores.textoTenue} />
      </Pressable>

      <Text style={[styles.seccion, styles.separada]}>Datos de hoy</Text>
      <View style={styles.datosHoy}>
        <Text style={styles.detalleGrande}>
          Dólar tarjeta: {indicadores.dolarTarjeta ? formatearMonto(indicadores.dolarTarjeta) : 'sin datos'}
        </Text>
        <Text style={styles.detalleGrande}>
          Inflación{' '}
          {indicadores.ultimaInflacion
            ? `de ${mesDeInflacion(indicadores.ultimaInflacion.mes)}: ${String(indicadores.ultimaInflacion.valor).replace('.', ',')}%`
            : ': sin datos (uso 2% por mes)'}
        </Text>
        <Text style={styles.fuente}>Se actualizan solos (fuentes: DolarApi y ArgentinaDatos, con datos del INDEC).</Text>
      </View>

      <Pressable style={({ pressed }) => [styles.botonSalir, pressed && { opacity: 0.7 }]} onPress={() => datos.salir()}>
        <Text style={styles.textoSalir}>{soloDemo ? 'Volver a empezar la prueba' : datos.esDemo ? 'Salir del modo de prueba' : 'Cerrar sesión'}</Text>
      </Pressable>
      {!datos.esDemo && (
        <Pressable onPress={borrarCuenta} hitSlop={10} style={styles.borrarCuenta}>
          <Text style={styles.textoBorrarCuenta}>Borrar mi cuenta</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: 20, paddingTop: 0, paddingBottom: 40 },
  seccion: { color: colores.texto, fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  separada: { marginTop: 32 },
  pista: { color: colores.textoTenue, fontSize: 14, marginBottom: 12, lineHeight: 20 },
  filaSueldo: { flexDirection: 'row', gap: 10, marginBottom: 28 },
  inputSueldo: {
    flex: 1,
    backgroundColor: colores.superficie,
    color: colores.texto,
    borderRadius: radios.grande,
    padding: 14,
    fontSize: 18,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  botonSueldo: { backgroundColor: colores.primario, borderRadius: radios.medio, paddingHorizontal: 20, justifyContent: 'center' },
  textoBotonSueldo: { color: colores.sobrePrimario, fontWeight: 'bold', fontSize: 16 },
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  iconoMedio: { width: 40, height: 40, borderRadius: radios.chico, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, marginLeft: 12, marginRight: 8 },
  nombre: { color: colores.texto, fontSize: 16, fontWeight: '600' },
  detalle: { color: colores.textoSecundario, fontSize: 13, marginTop: 2 },
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
  tono: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colores.superficie,
    borderRadius: radios.grande,
    padding: 14,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  tonoActivo: { borderColor: colores.primario, backgroundColor: colores.superficieAlta },
  tonoEmoji: { fontSize: 28 },
  datosHoy: { backgroundColor: colores.superficie, borderRadius: radios.grande, padding: 16, gap: 8, borderWidth: 1, borderColor: colores.borde },
  detalleGrande: { color: colores.textoChip, fontSize: 15 },
  fuente: { color: colores.textoTenue, fontSize: 12, marginTop: 4 },
  botonSalir: { marginTop: 40, alignItems: 'center', padding: 14, borderRadius: radios.medio, borderWidth: 1, borderColor: colores.peligro },
  borrarCuenta: { alignSelf: 'center', marginTop: 22, padding: 6 },
  textoBorrarCuenta: { color: colores.textoTenue, fontSize: 14, textDecorationLine: 'underline' },
  textoSalir: { color: colores.peligro, fontWeight: 'bold', fontSize: 16 },
});
