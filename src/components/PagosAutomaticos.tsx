import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { colores, radios } from '../constants/tema';
import { useDatos } from '../lib/contextoDatos';
import { lectorConPermiso, lectorDisponible, pedirPermisoLector } from '../lib/notificaciones';
import type { Sugerencia } from '../lib/tipos';
import { useAviso } from './Toast';
import { Texto as Text } from './ui';

// La dirección base del servicio que recibe mails (por ejemplo, la "inbound address" de Postmark).
// Cada usuario usa la suya con su código: base+codigo@dominio
const MAIL_BASE = process.env.EXPO_PUBLIC_MAIL_PAGOS ?? '';

export function direccionDeMail(codigo: string | null | undefined) {
  if (!codigo || !MAIL_BASE.includes('@')) return null;
  const [usuario, dominio] = MAIL_BASE.split('@');
  return `${usuario}+${codigo}@${dominio}`;
}

export default function PagosAutomaticos() {
  const datos = useDatos();
  const aviso = useAviso();
  const [direccion, setDireccion] = useState<string | null>(null);
  const [verificacion, setVerificacion] = useState<Sugerencia | null>(null);
  const [guiaAbierta, setGuiaAbierta] = useState(false);
  const [permisoLector, setPermisoLector] = useState(lectorConPermiso());

  const cargar = useCallback(async () => {
    if (datos.esDemo) return;
    try {
      const [perfil, sugerencias] = await Promise.all([datos.perfil(), datos.sugerencias.listar()]);
      setDireccion(direccionDeMail(perfil.codigoMail));
      setVerificacion(sugerencias.find((s) => s.estado === 'verificacion') ?? null);
    } catch {
      // Sin conexión: se muestra lo que haya
    }
  }, [datos]);

  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

  useEffect(() => {
    // Al volver de la configuración del celular, revisamos si dio el permiso
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') {
        setPermisoLector(lectorConPermiso());
        cargar();
      }
    });
    return () => suscripcion.remove();
  }, [cargar]);

  async function copiar(texto: string, mensaje: string) {
    await Clipboard.setStringAsync(texto);
    aviso(mensaje);
  }

  async function listoVerificacion() {
    if (!verificacion) return;
    setVerificacion(null);
    await datos.sugerencias.borrar(verificacion.id).catch(() => {});
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={styles.caja}>
        <Pressable style={styles.encabezado} onPress={() => setGuiaAbierta(!guiaAbierta)}>
          <View style={styles.icono}>
            <Ionicons name="mail" size={20} color={colores.primario} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.titulo}>Reenviar los mails de pagos</Text>
            <Text style={styles.detalle}>Mercado Pago y tu banco te mandan un mail por cada pago: yo lo leo y te pregunto si lo anoto.</Text>
          </View>
          <Ionicons name={guiaAbierta ? 'chevron-up' : 'chevron-down'} size={20} color={colores.textoTenue} />
        </Pressable>

        {guiaAbierta && (
          <View style={styles.cuerpo}>
            {datos.esDemo ? (
              <Text style={styles.nota}>Disponible cuando entrás con tu cuenta.</Text>
            ) : !direccion ? (
              <Text style={styles.nota}>Esta función todavía no está activada en el servidor.</Text>
            ) : (
              <>
                <Text style={styles.paso}>Tu dirección (es solo tuya, no la compartas):</Text>
                <Pressable style={({ pressed }) => [styles.direccion, pressed && { opacity: 0.7 }]} onPress={() => copiar(direccion, 'Dirección copiada 📋')}>
                  <Text style={styles.textoDireccion} numberOfLines={1}>
                    {direccion}
                  </Text>
                  <Ionicons name="copy-outline" size={18} color={colores.primario} />
                </Pressable>

                {verificacion && (
                  <View style={styles.verificacion}>
                    <Text style={styles.titulo}>📩 Gmail te mandó un código</Text>
                    <Pressable onPress={() => copiar(verificacion.descripcion, 'Código copiado 📋')}>
                      <Text style={styles.codigo}>{verificacion.descripcion}</Text>
                    </Pressable>
                    <Text style={styles.nota}>Pegalo en Gmail, donde agregaste la dirección de reenvío.</Text>
                    <Pressable onPress={listoVerificacion} hitSlop={8}>
                      <Text style={styles.listo}>Listo, ya lo puse</Text>
                    </Pressable>
                  </View>
                )}

                <Text style={styles.subtitulo}>Cómo activarlo en Gmail (una sola vez, desde la compu):</Text>
                <Text style={styles.paso}>1. Abrí Gmail → ⚙️ Configuración → Ver toda la configuración → Reenvío y correo POP/IMAP.</Text>
                <Text style={styles.paso}>2. Tocá “Agregar una dirección de reenvío” y pegá tu dirección.</Text>
                <Text style={styles.paso}>3. Gmail manda un código de confirmación: te va a aparecer acá arriba. Copialo y pegalo en Gmail.</Text>
                <Text style={styles.paso}>
                  4. Andá a “Filtros y direcciones bloqueadas” → Crear filtro. En “De” poné: mercadopago.com OR el dominio de tu banco (por
                  ejemplo galicia.com.ar).
                </Text>
                <Text style={styles.paso}>5. Elegí “Reenviar a” tu dirección y guardá. ¡Listo! Los pagos te van a llegar solos.</Text>
                <Text style={styles.nota}>
                  🔒 Solo leo los mails que vos reenviás. No guardo el mail completo: saco el monto, el comercio y la fecha.
                </Text>
              </>
            )}
          </View>
        )}
      </View>

      {lectorDisponible && (
        <View style={styles.caja}>
          <View style={styles.encabezado}>
            <View style={styles.icono}>
              <Ionicons name="notifications" size={20} color={colores.primario} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.titulo}>Detectar pagos en las notificaciones</Text>
              <Text style={styles.detalle}>
                {permisoLector
                  ? 'Activo ✓ Cuando pagues con una billetera, te pregunto si lo anoto.'
                  : 'Cuando Mercado Pago, Ualá o tu banco te avisen de un pago, te pregunto si lo anoto. Solo miro las que tienen un monto, y nada sale del celular.'}
              </Text>
            </View>
          </View>
          {!permisoLector && (
            <Pressable style={({ pressed }) => [styles.boton, pressed && { opacity: 0.8 }]} onPress={pedirPermisoLector}>
              <Text style={styles.textoBoton}>Dar permiso</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  caja: { backgroundColor: colores.superficie, borderRadius: radios.grande, borderWidth: 1, borderColor: colores.borde, padding: 14 },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icono: { width: 40, height: 40, borderRadius: radios.chico, backgroundColor: colores.primarioSuave, alignItems: 'center', justifyContent: 'center' },
  titulo: { color: colores.texto, fontSize: 16, fontWeight: '600' },
  detalle: { color: colores.textoSecundario, fontSize: 13, marginTop: 2, lineHeight: 18 },
  cuerpo: { marginTop: 14, gap: 8 },
  subtitulo: { color: colores.texto, fontSize: 15, fontWeight: '700', marginTop: 8 },
  paso: { color: colores.textoChip, fontSize: 14, lineHeight: 20 },
  nota: { color: colores.textoSecundario, fontSize: 13, lineHeight: 19 },
  direccion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colores.fondo,
    borderRadius: radios.chico,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: 12,
  },
  textoDireccion: { color: colores.primario, fontSize: 14, flex: 1 },
  verificacion: { backgroundColor: colores.primarioSuave, borderRadius: radios.chico, padding: 12, gap: 6 },
  codigo: { color: colores.texto, fontSize: 24, fontWeight: '800', letterSpacing: 2 },
  listo: { color: colores.primario, fontWeight: '700', fontSize: 14 },
  boton: { backgroundColor: colores.primario, borderRadius: radios.medio, padding: 12, alignItems: 'center', marginTop: 12 },
  textoBoton: { color: colores.sobrePrimario, fontWeight: '700', fontSize: 15 },
});
