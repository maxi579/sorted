import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { colores, radios } from '../constants/tema';
import { Contexto, useTutorial, type Rect } from './Foco';
import { Boton, Texto as Text } from './ui';

export { Objetivo, useTutorial } from './Foco';

// Recorrido guiado: oscurece la pantalla, ilumina un solo lugar y solo deja tocar ahí.
//
// - Cada lugar que se puede iluminar se envuelve en <Objetivo id="...">.
// - Los pasos "info" explican algo y se avanza con "Siguiente" (lo iluminado no se puede tocar).
// - Los pasos "tocar" piden tocar lo iluminado de verdad; avanzan cuando la app llega a la pantalla esperada.

type Paso = {
  /** Lo que se ilumina; sin objetivo, el mensaje aparece en el centro */
  objetivo?: string;
  titulo: string;
  texto: string;
  /** Si está, hay que tocar lo iluminado y el paso avanza al llegar a esta pantalla */
  avanzaEn?: string;
};

const PRINCIPAL: Paso[] = [
  { titulo: '¡Hola! 👋', texto: 'Te muestro cómo usar Sorted en un minuto. Vas a ir tocando donde te indique.' },
  {
    objetivo: 'resumen-mes',
    titulo: 'Tu mes, de un vistazo',
    texto: 'Acá ves cuánto tenés que pagar este mes: cuotas, gastos y fijos. La barra te dice qué parte del sueldo ya está ocupada.',
  },
  { objetivo: 'pestana-cargar', titulo: 'Anotar un gasto', texto: 'Tocá el botón verde + para anotar un gasto.', avanzaEn: '/cargar' },
  {
    objetivo: 'caja-gasto',
    titulo: 'Escribilo como te salga',
    texto: 'Por ejemplo "café 3500 con mercado pago" o "zapas 120k en 6 cuotas con visa". La app entiende el monto, las cuotas y la tarjeta.',
  },
  {
    objetivo: 'escaner',
    titulo: '¿Tenés el ticket?',
    texto: 'Sacale una foto o elegí la captura del comprobante, y el gasto se arma solo.',
  },
  { objetivo: 'pestana-fijos', titulo: 'Lo de todos los meses', texto: 'Tocá Fijos.', avanzaEn: '/fijos' },
  {
    titulo: 'Fijos y suscripciones',
    texto: 'Cargá una vez la luz, el gas, el alquiler o Netflix. Te aviso antes de que venzan y los que se debitan solos se anotan sin que hagas nada.',
  },
  { objetivo: 'pestana-asistente', titulo: 'Tu asistente', texto: 'Tocá Asistente.', avanzaEn: '/chat' },
  {
    titulo: 'Preguntale lo que quieras',
    texto: 'Por ejemplo "¿cuánto gasté en el súper este mes?" o "armame el informe del mes". Responde con tus números.',
  },
  { objetivo: 'pestana-mas', titulo: 'Todo lo demás', texto: 'Tocá Más.', avanzaEn: '/mas' },
  {
    titulo: 'Más herramientas',
    texto: 'Acá están tus cuotas, el efectivo, ¿Cuánto me rinde?, las formas de anotar sin esfuerzo y los ajustes.',
  },
  { titulo: '¡Listo! 🎉', texto: 'Ya sabés lo principal. Si querés ver este recorrido de nuevo, está en Más. Y en cada sección, el ❓ te explica cómo funciona.' },
];

// El último paso de cada sección: dónde volver a verlo
const AYUDA: Paso = { objetivo: 'boton-ayuda', titulo: '¿Te olvidaste algo?', texto: 'Tocá este ❓ cuando quieras y te lo vuelvo a mostrar.' };

// Un recorrido corto por sección: se muestra la primera vez que se entra y con el ❓ del encabezado.
// Si lo que se ilumina no entra en la pantalla, el mensaje aparece en el centro.
const RECORRIDOS = {
  principal: PRINCIPAL,
  activos: [
    { titulo: 'Activos 💼', texto: 'Acá anotás todo lo que tenés que vale plata: dólares, un plazo fijo, la plata que rinde en Mercado Pago, un auto o un celular.' },
    { objetivo: 'activos-patrimonio', titulo: 'Tu patrimonio', texto: 'Es lo que tenés menos lo que todavía debés en cuotas. La foto de cómo estás parado de verdad.' },
    { objetivo: 'activos-calculadora', titulo: '¿Cuánto me rinde?', texto: 'Si tenés una plata y no sabés qué hacer con ella, acá comparás plazo fijo, billeteras e inflación.' },
    { objetivo: 'activos-agregar', titulo: 'Agregar un activo', texto: 'Abajo de todo está "Agregar activo": elegís qué es, cuánto pusiste y cuándo. Los dólares, plazos fijos y cuentas se actualizan solos.' },
    { titulo: '¿Qué es el rendimiento "real"?', texto: 'Es lo que ganaste descontando la inflación. "+5% real" quiere decir que hoy podés comprar más que antes; "-5% real", que podés comprar menos aunque tengas más pesos.' },
    AYUDA,
  ],
  ahorros: [
    { titulo: 'Ahorros 🎯', texto: 'Acá anotás para qué estás juntando plata: unas vacaciones, un auto, un fondo para emergencias. Activos te dice dónde está tu plata; Ahorros, para qué es.' },
    { objetivo: 'ahorros-total', titulo: 'Lo que tenés ahorrado', texto: 'Con los intereses incluidos. Lo que planeás separar cada mes lo reservo en Inicio, así no te lo gastás sin darte cuenta.' },
    { objetivo: 'ahorros-emergencia', titulo: 'Tu fondo de emergencia', texto: 'Te sugiero cuánto tener guardado por si un mes no cobrás o surge algo: lo que se te va en 3 meses.' },
    { titulo: 'Cada meta', texto: 'Tiene su barra de progreso y te dice cuánto separar por mes para llegar a tiempo. Tocá "Separar" cada vez que guardes plata, o elegí un día y lo separo solo.' },
    { objetivo: 'ahorros-agregar', titulo: 'Creá una meta', texto: 'Ponele nombre, cuánto querés juntar y dónde la guardás. Si es en Mercado Pago o un plazo fijo, sumo los intereses solo.' },
    AYUDA,
  ],
  rendimiento: [
    { objetivo: 'rend-datos', titulo: 'Tu plata y el tiempo', texto: 'Poné cuánta plata tenés y por cuánto tiempo la querés dejar.' },
    { objetivo: 'rend-inflacion', titulo: 'Para no perder', texto: 'Esto es lo que vas a necesitar al final para comprar lo mismo que hoy, con la inflación de los últimos meses.' },
    { objetivo: 'rend-resultados', titulo: 'Las opciones, lado a lado', texto: 'Plazo fijo con la mejor tasa del día y en tu banco, y dejarla quieta. En verde le gana a la inflación, en rojo pierde.' },
    { titulo: 'Sumá tu billetera', texto: 'Más abajo podés elegir tu banco y poner la tasa que te paga Mercado Pago u otra app, para compararla también.' },
    { titulo: 'Es una comparación', texto: 'Son cuentas con tasas públicas del Banco Central. No es un consejo: las tasas cambian, consultá con tu banco antes de decidir.' },
    AYUDA,
  ],
  efectivo: [
    { titulo: 'Efectivo 💵', texto: 'Para lo que pagás en mano: el kiosco, la verdulería, el colectivo. Son los gastos que más se olvidan.' },
    { objetivo: 'ef-billetera', titulo: 'Contá tu billetera', texto: 'Cada tanto contá la plata que tenés. La próxima vez que cuentes, te digo cuánto gastaste aunque no te acuerdes en qué. Si sacás del cajero, avisame acá.' },
    { objetivo: 'ef-rapidos', titulo: 'Anotar en dos toques', texto: 'Tocá un botón, poné el monto y listo.' },
    { titulo: 'Te lo recuerdo', texto: 'Más abajo podés activar un aviso para contar la billetera todos los días o los domingos.' },
    AYUDA,
  ],
  cuotas: [
    { titulo: 'Cuotas 📅', texto: 'Acá ves, mes por mes, cuánto vas a pagar por lo que ya compraste en cuotas.' },
    { objetivo: 'cuotas-resumen', titulo: 'Lo que ya está comprometido', texto: 'Cada compra cae en el resumen que corresponde según el cierre de tu tarjeta. La app lo calcula sola.' },
    { titulo: 'Tu día de libertad', texto: 'Es el mes en que terminás de pagar todas las cuotas. Cada compra nueva en cuotas lo puede correr para adelante.' },
    AYUDA,
  ],
  comprar: [
    { titulo: '¿Lo compro? 🛍️', texto: 'Antes de comprar algo, te digo si te conviene según tu sueldo y lo que ya tenés comprometido.' },
    { objetivo: 'comprar-datos', titulo: 'Contame la compra', texto: 'Poné el precio, en cuántas cuotas y con qué tarjeta. Te respondo "sí", "con cuidado" o "mejor no".' },
    { titulo: '¿Contado o cuotas?', texto: 'También te muestro cuánto valen las cuotas en plata de hoy, con la inflación, y con qué tarjeta conviene pagar.' },
    AYUDA,
  ],
  automatico: [
    { titulo: 'Anotar sin esfuerzo ⚡', texto: 'Formas de que los gastos se anoten casi solos. Activá las que te sirvan.' },
    { objetivo: 'auto-voz', titulo: 'Con la voz', texto: 'En iPhone, armás una vez un atajo y después le decís a Siri "café 3500 con mercado pago".' },
    { objetivo: 'auto-pagos', titulo: 'Pagos que llegan solos', texto: 'Reenviá los mails de pagos de Mercado Pago y tu banco, o en Android dejame leer las notificaciones de pagos. Te pregunto antes de anotar.' },
    AYUDA,
  ],
  revisar: [
    { titulo: 'Pagos para revisar 📬', texto: 'Acá aparecen los pagos que encontré solo en tus mails o notificaciones.' },
    { titulo: 'Vos decidís', texto: 'Tocá "Anotar" para guardarlo (podés cambiarlo antes) o "No es un gasto" para descartarlo.' },
    AYUDA,
  ],
  resumen: [
    { titulo: 'Revisar el resumen 📄', texto: 'Subí el PDF del resumen de tu tarjeta. Una IA lo lee y lo compara con lo que ya anotaste.' },
    { objetivo: 'resumen-subir', titulo: 'Solo lo que falta', texto: 'Te muestro únicamente lo que te olvidaste de anotar, y lo agregás con un toque. Lo que ya estaba no se duplica.' },
    AYUDA,
  ],
  fijos: [
    { titulo: 'Fijos y suscripciones 🔁', texto: 'La luz, el gas, el alquiler, Netflix... Cargalos una vez y te olvidás.' },
    { objetivo: 'fijos-resumen', titulo: 'Lo que falta pagar', texto: 'Cuánto te falta pagar este mes de tus fijos, y cuánto se te va por mes en suscripciones.' },
    { titulo: 'Te aviso y te los anoto', texto: 'Te aviso un día antes de cada vencimiento. Los que se debitan solos (como Netflix) los anoto yo, y si cambian de precio los actualizo.' },
    { titulo: 'Agregá uno', texto: 'Más abajo está "Agregar gasto fijo o suscripción". Y si anotás lo mismo varios meses, te propongo agregarlo.' },
    AYUDA,
  ],
  ajustes: [
    { objetivo: 'ajustes-sueldo', titulo: 'Tu sueldo', texto: 'Con tu sueldo te digo qué parte del mes ya está ocupada. Si cargás tus recibos, lo actualizo solo y te digo si le ganó a la inflación.' },
    { objetivo: 'ajustes-tarjetas', titulo: 'Tus tarjetas', texto: 'Cargá el cierre y el vencimiento de cada tarjeta: así sé en qué mes cae cada cuota y cuál conviene usar hoy.' },
    { titulo: 'Tono y avisos', texto: 'Más abajo elegís cómo te habla el asistente y qué recordatorios querés.' },
    AYUDA,
  ],
} satisfies Record<string, Paso[]>;

export type NombreRecorrido = keyof typeof RECORRIDOS;
type EnCurso = { nombre: NombreRecorrido; paso: number };

const claveVisto = (nombre: NombreRecorrido) => (nombre === 'principal' ? 'tutorial-visto-v1' : `recorrido-visto-${nombre}`);
const marcarVisto = (nombre: NombreRecorrido) => AsyncStorage.setItem(claveVisto(nombre), 'si').catch(() => {});

const MARGEN = 8;

export function ProveedorTutorial({ children, listo }: { children: ReactNode; listo: boolean }) {
  const ruta = usePathname();
  const [enCurso, setEnCurso] = useState<EnCurso | null>(null);
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [version, setVersion] = useState(0);

  // La primera vez que la persona llega a Inicio, arranca solo el recorrido principal
  useEffect(() => {
    if (!listo || ruta !== '/') return;
    let cancelado = false;
    const temporizador = setTimeout(async () => {
      const visto = await AsyncStorage.getItem(claveVisto('principal')).catch(() => 'si');
      if (!visto && !cancelado) setEnCurso((actual) => actual ?? { nombre: 'principal', paso: 0 });
    }, 1200);
    return () => {
      cancelado = true;
      clearTimeout(temporizador);
    };
  }, [listo, ruta]);

  const terminar = useCallback(() => {
    setEnCurso((actual) => {
      if (actual) marcarVisto(actual.nombre);
      return null;
    });
  }, []);

  const avanzar = useCallback(() => {
    setEnCurso((actual) => {
      if (!actual) return null;
      if (actual.paso + 1 >= RECORRIDOS[actual.nombre].length) {
        marcarVisto(actual.nombre);
        return null;
      }
      return { ...actual, paso: actual.paso + 1 };
    });
    setVersion((v) => v + 1);
  }, []);

  const pasos: Paso[] | null = enCurso ? RECORRIDOS[enCurso.nombre] : null;
  const actual = enCurso && pasos ? pasos[enCurso.paso] : null;

  // Los pasos "tocar" avanzan cuando la persona llega a la pantalla que se le pidió
  // (se actualiza mientras se dibuja, como recomienda React para estado que depende de otro)
  if (enCurso && pasos && actual?.avanzaEn && ruta === actual.avanzaEn) {
    setEnCurso(enCurso.paso + 1 >= pasos.length ? null : { ...enCurso, paso: enCurso.paso + 1 });
    setVersion((v) => v + 1);
  }

  const registrar = useCallback((id: string, rect: Rect) => {
    setRects((previos) => {
      const viejo = previos[id];
      if (viejo && viejo.x === rect.x && viejo.y === rect.y && viejo.ancho === rect.ancho && viejo.alto === rect.alto) return previos;
      return { ...previos, [id]: rect };
    });
  }, []);

  const empezar = useCallback((nombre: string = 'principal') => {
    if (!(nombre in RECORRIDOS)) return;
    setRects({});
    setEnCurso({ nombre: nombre as NombreRecorrido, paso: 0 });
    setVersion((v) => v + 1);
  }, []);

  const valor = useMemo(
    () => ({ activo: enCurso !== null, version, objetivoActual: actual?.objetivo ?? null, registrar, empezar }),
    [enCurso, version, actual, registrar, empezar]
  );

  return (
    <Contexto.Provider value={valor}>
      {children}
      {actual && enCurso && pasos && (
        <Capa
          paso={actual}
          numero={enCurso.paso}
          total={pasos.length}
          rect={actual.objetivo ? (rects[actual.objetivo] ?? null) : null}
          onSiguiente={avanzar}
          onSaltar={terminar}
        />
      )}
    </Contexto.Provider>
  );
}

// En cada sección: const ayuda = useRecorridoSeccion('activos'); → <Encabezado ayuda={ayuda} />
// La primera vez que la sección está en pantalla, arranca sola (si no hay otro recorrido en curso).
export function useRecorridoSeccion(nombre: Exclude<NombreRecorrido, 'principal'>) {
  const { activo, empezar } = useTutorial();
  useFocusEffect(
    useCallback(() => {
      if (activo) return;
      let cancelado = false;
      const temporizador = setTimeout(() => {
        AsyncStorage.getItem(claveVisto(nombre))
          .then((visto) => !visto && !cancelado && empezar(nombre))
          .catch(() => {});
      }, 900);
      return () => {
        cancelado = true;
        clearTimeout(temporizador);
      };
    }, [nombre, activo, empezar])
  );
  return useCallback(() => empezar(nombre), [empezar, nombre]);
}

// Un pedazo de la sombra oscura: no deja tocar lo que hay abajo
function Bloque({ estilo }: { estilo: ViewStyle }) {
  return <Pressable style={[styles.sombra, estilo]} onPress={() => {}} accessible={false} />;
}

type PropsCapa = { paso: Paso; numero: number; total: number; rect: Rect | null; onSiguiente: () => void; onSaltar: () => void };

function Capa({ paso, numero, total, rect: enPantalla, onSiguiente, onSaltar }: PropsCapa) {
  const { width, height } = useWindowDimensions();
  // Los objetivos se miden respecto de la pantalla entera; la capa puede no empezar en (0, 0)
  // (barra de estado, navegador, web instalada). Medimos dónde empieza y lo restamos: el recuadro cae justo.
  const capa = useRef<View>(null);
  const [origen, setOrigen] = useState({ x: 0, y: 0 });
  const medirOrigen = useCallback(() => {
    capa.current?.measureInWindow((x, y) => setOrigen((o) => (o.x === x && o.y === y ? o : { x, y })));
  }, []);
  const medido = enPantalla && { ...enPantalla, x: enPantalla.x - origen.x, y: enPantalla.y - origen.y };
  // Si lo que hay que iluminar quedó fuera de la pantalla (más abajo), mostramos el mensaje en el centro
  const visible = medido && medido.y < height - 20 && medido.y + medido.alto > 20;
  const rect = visible ? { ...medido, alto: Math.min(medido.alto, height - medido.y) } : null;
  // Si en 1,5 s no se pudo medir lo que hay que iluminar, el mensaje sale igual en el centro (nunca se traba)
  const [sinPaciencia, setSinPaciencia] = useState<number | null>(null);
  useEffect(() => {
    const temporizador = setTimeout(() => setSinPaciencia(numero), 1500);
    return () => clearTimeout(temporizador);
  }, [numero]);
  const esperandoObjetivo = !!paso.objetivo && !medido && sinPaciencia !== numero;
  // Las pestañas de abajo: recuadro más grande, que abarque el ícono y el nombre (más fácil de ver y tocar)
  const esPestana = paso.objetivo?.startsWith('pestana-');
  const margen = esPestana ? 14 : MARGEN;
  const extraAbajo = esPestana ? 16 : 0;
  const hueco = rect && {
    x: Math.max(rect.x - margen, 0),
    y: Math.max(rect.y - margen, 0),
    ancho: Math.min(rect.ancho + margen * 2, width),
    alto: Math.min(rect.alto + margen * 2 + extraAbajo, height - Math.max(rect.y - margen, 0)),
  };
  const ultimo = numero === total - 1;

  // El mensaje va abajo de lo iluminado si está en la mitad de arriba, y arriba si no
  const globoAbajo = !hueco || hueco.y + hueco.alto / 2 < height / 2;
  const posicionGlobo: ViewStyle = !hueco
    ? { top: height * 0.3 }
    : globoAbajo
      ? { top: Math.min(hueco.y + hueco.alto + 12, height - 260) }
      : { bottom: Math.max(height - hueco.y + 12, 24) };

  return (
    <View ref={capa} onLayout={medirOrigen} collapsable={false} style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {!hueco ? (
        <Bloque estilo={{ top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : (
        <>
          <Bloque estilo={{ left: 0, right: 0, top: 0, height: hueco.y }} />
          <Bloque estilo={{ left: 0, right: 0, top: hueco.y + hueco.alto, bottom: 0 }} />
          <Bloque estilo={{ left: 0, width: hueco.x, top: hueco.y, height: hueco.alto }} />
          <Bloque estilo={{ left: hueco.x + hueco.ancho, right: 0, top: hueco.y, height: hueco.alto }} />
          {/* En los pasos que solo explican, lo iluminado tampoco se puede tocar */}
          {!paso.avanzaEn && (
            <Pressable
              style={{ position: 'absolute', left: hueco.x, top: hueco.y, width: hueco.ancho, height: hueco.alto }}
              onPress={() => {}}
              accessible={false}
            />
          )}
          <View
            pointerEvents="none"
            style={[styles.marco, { left: hueco.x, top: hueco.y, width: hueco.ancho, height: hueco.alto }]}
          />
        </>
      )}

      {!esperandoObjetivo && (
        <Animated.View key={numero} entering={globoAbajo ? FadeInDown.springify() : FadeIn} style={[styles.globo, posicionGlobo]}>
          <Text style={styles.contador}>
            {numero + 1} de {total}
          </Text>
          <Text style={styles.titulo}>{paso.titulo}</Text>
          <Text style={styles.texto}>{paso.texto}</Text>
          <View style={styles.acciones}>
            {!ultimo ? (
              <Pressable onPress={onSaltar} hitSlop={10}>
                <Text style={styles.saltar}>Saltar recorrido</Text>
              </Pressable>
            ) : (
              <View />
            )}
            {paso.avanzaEn ? (
              <Text style={styles.indicacion}>👆 Tocá lo iluminado</Text>
            ) : (
              <Boton titulo={ultimo ? 'Terminar' : numero === 0 ? 'Empezar' : 'Siguiente'} onPress={onSiguiente} estilo={styles.botonSiguiente} />
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sombra: { position: 'absolute', backgroundColor: colores.veloFuerte },
  marco: { position: 'absolute', borderRadius: radios.grande, borderWidth: 2, borderColor: colores.primario },
  globo: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: colores.superficieAlta,
    borderRadius: radios.grande,
    borderWidth: 1,
    borderColor: colores.primario,
    padding: 18,
    maxWidth: 480,
    alignSelf: 'center',
  },
  contador: { color: colores.primario, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  titulo: { color: colores.texto, fontSize: 19, fontWeight: '800' },
  texto: { color: colores.textoChip, fontSize: 16, lineHeight: 23, marginTop: 6 },
  acciones: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 12 },
  saltar: { color: colores.textoSecundario, fontSize: 14, textDecorationLine: 'underline' },
  indicacion: { color: colores.primario, fontSize: 15, fontWeight: '700' },
  botonSiguiente: { paddingHorizontal: 22, paddingVertical: 11 },
});
