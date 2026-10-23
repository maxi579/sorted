import { diasEntre, proximoCierre } from './finanzas';
import type { GastoGuardado, MedioPago, Tono } from './tipos';

// El asistente arma sus consejos con reglas y tus datos (sin IA):
// responde al instante, funciona sin internet y nunca inventa números.

export const TONOS: { valor: Tono; nombre: string; emoji: string; descripcion: string }[] = [
  { valor: 'amable', nombre: 'Amable', emoji: '🤗', descripcion: 'Te habla con calma y te da ánimo' },
  { valor: 'directo', nombre: 'Directo', emoji: '🙂', descripcion: 'Te dice las cosas claras y cortas' },
  { valor: 'estricto', nombre: 'Estricto', emoji: '🧐', descripcion: 'Te cuida el bolsillo sin vueltas' },
];

export function emojiDe(tono: Tono) {
  return TONOS.find((t) => t.valor === tono)?.emoji ?? '🙂';
}

export type Consejo = { icono: 'wallet' | 'calendar' | 'restaurant' | 'cash' | 'receipt' | 'speedometer' | 'pulse' | 'flag'; texto: string };

type Contexto = {
  tono: Tono;
  hoy: Date;
  /** % del sueldo que ya está ocupado este mes, o null si no cargó el sueldo */
  porcentaje: number | null;
  medios: MedioPago[];
  gastos: GastoGuardado[];
  /** Gastos fijos sin pagar que vencen pronto (días: 0 = hoy, negativo = vencido) */
  fijosPorVencer?: { descripcion: string; dias: number }[];
  /** Efectivo que sacaste y todavía no anotaste en qué lo gastaste */
  efectivoSinAnotar?: number;
  /** Una categoría que este mes va más rápido de lo que se suele gastar */
  presupuestoPasado?: { categoria: string; porcentaje: number };
  /** Una categoría en la que esta semana se gastó mucho más que lo normal */
  semanaInusual?: { categoria: string; veces: number };
  /** Una meta de ahorro a la que este mes todavía no se le separó nada (pasado el día 20) */
  ahorroSinSeparar?: string;
};

type Frases = Record<Tono, string>;

export function consejos(ctx: Contexto): Consejo[] {
  const { tono, hoy } = ctx;
  const lista: Consejo[] = [];
  const decir = (icono: Consejo['icono'], frases: Frases) => lista.push({ icono, texto: frases[tono] });

  // 1. Cómo viene el mes
  if (ctx.porcentaje === null) {
    decir('cash', {
      amable: 'Contame cuánto cobrás por mes (en Ajustes) y te voy diciendo cómo venís 😊',
      directo: 'Cargá tu sueldo en Ajustes para saber cómo venís.',
      estricto: 'Sin tu sueldo no puedo controlarte. Cargalo en Ajustes.',
    });
  } else {
    const p = Math.round(ctx.porcentaje);
    if (p >= 80) {
      decir('wallet', {
        amable: `Este mes ya tenés ocupado casi todo el sueldo (${p}%). Si podés, dejá las compras nuevas para más adelante 💚`,
        directo: `Ojo: el ${p}% de tu sueldo ya está ocupado este mes. Frená las compras grandes.`,
        estricto: `${p}% del sueldo ya está gastado. Nada de compras nuevas este mes.`,
      });
    } else if (p >= 50) {
      decir('wallet', {
        amable: `Vas bien, pero ya usaste el ${p}% del sueldo. Cuidá lo que queda 💚`,
        directo: `Llevás el ${p}% del sueldo ocupado. Todavía hay margen, con cuidado.`,
        estricto: `${p}% ya está ocupado. Cada compra nueva, pensala dos veces.`,
      });
    } else {
      decir('wallet', {
        amable: `¡Vas muy bien! Solo el ${p}% de tu sueldo está ocupado este mes 🎉`,
        directo: `Vas bien: el ${p}% del sueldo está ocupado.`,
        estricto: `${p}% ocupado. Bien, pero no te relajes.`,
      });
    }
  }

  // 2. Una tarjeta cierra hoy o mañana
  for (const medio of ctx.medios) {
    const cierre = proximoCierre(medio, hoy);
    if (!cierre) continue;
    const dias = diasEntre(hoy, cierre);
    if (dias > 1) continue;
    const cuando = dias === 0 ? 'Hoy' : 'Mañana';
    const desde = dias === 0 ? 'mañana' : 'pasado mañana';
    decir('calendar', {
      amable: `${cuando} cierra tu ${medio.nombre}. Si podés esperar a ${desde} para comprar con ella, la pagás un mes más tarde 😉`,
      directo: `${cuando} cierra tu ${medio.nombre}: lo que compres desde ${desde} lo pagás un mes después.`,
      estricto: `${cuando} cierra tu ${medio.nombre}. Si no es urgente, esperá a ${desde}.`,
    });
    break;
  }

  // 3. Un gasto fijo vence pronto o ya venció
  const fijo = ctx.fijosPorVencer?.[0];
  if (fijo) {
    const cuando = fijo.dias < 0 ? 'ya venció' : fijo.dias === 0 ? 'vence hoy' : fijo.dias === 1 ? 'vence mañana' : `vence en ${fijo.dias} días`;
    decir('receipt', {
      amable: `${fijo.descripcion} ${cuando}. Cuando lo pagues, marcalo en Fijos así no te preocupás 😊`,
      directo: `${fijo.descripcion} ${cuando}. Marcalo en Fijos cuando lo pagues.`,
      estricto: `${fijo.descripcion} ${cuando}. Pagalo y marcalo, no acumules recargos.`,
    });
  }

  // 4. Una categoría va más rápido de lo normal este mes (presupuesto automático)
  if (ctx.presupuestoPasado) {
    const { categoria } = ctx.presupuestoPasado;
    const p = Math.round(ctx.presupuestoPasado.porcentaje * 100);
    decir('speedometer', p >= 100
      ? {
          amable: `En ${categoria} ya gastaste lo que solés gastar en todo el mes (${p}%). Si podés, aflojá un poquito 💚`,
          directo: `${categoria}: ya llegaste al ${p}% de lo que gastás normalmente en un mes.`,
          estricto: `${categoria}: ${p}% de lo habitual y el mes no terminó. Cortá ahí.`,
        }
      : {
          amable: `En ${categoria} vas más rápido que otros meses: ya usaste el ${p}% de lo que solés gastar 👀`,
          directo: `${categoria} va más rápido de lo normal: ${p}% de lo habitual.`,
          estricto: `${categoria} viene acelerado: ${p}% de lo habitual. Frená.`,
        });
  }

  // 5. Una semana fuera de lo común
  if (ctx.semanaInusual) {
    const { categoria, veces } = ctx.semanaInusual;
    const cuanto = veces >= 3 ? `${Math.floor(veces)} veces más` : 'el doble';
    decir('pulse', {
      amable: `Esta semana gastaste ${cuanto} de lo normal en ${categoria}. ¿Pasó algo especial? 🙂`,
      directo: `Esta semana: ${cuanto} de lo normal en ${categoria}.`,
      estricto: `${cuanto} de lo normal en ${categoria} esta semana. Revisalo.`,
    });
  }

  // 6. Una meta de ahorro sin separar este mes
  if (ctx.ahorroSinSeparar) {
    decir('flag', {
      amable: `Este mes todavía no separaste nada para ${ctx.ahorroSinSeparar}. ¿Le ponemos algo, aunque sea poquito? 💚`,
      directo: `Este mes no separaste nada para ${ctx.ahorroSinSeparar}.`,
      estricto: `${ctx.ahorroSinSeparar}: cero este mes. Separá antes de gastar.`,
    });
  }

  // 7. Efectivo que no se anotó
  if (ctx.efectivoSinAnotar && ctx.efectivoSinAnotar >= 1000) {
    const monto = `$\u00A0${Math.round(ctx.efectivoSinAnotar).toLocaleString('es-AR')}`;
    decir('cash', {
      amable: `Tenés ${monto} en efectivo sin anotar. ¿Te acordás en qué los gastaste? 🤔`,
      directo: `${monto} de efectivo sin anotar. Anotalos en Efectivo.`,
      estricto: `Faltan ${monto} de efectivo por anotar. Lo que no se anota, se escapa.`,
    });
  }

  // 8. Muchas salidas a comer esta semana
  const salidas = ctx.gastos.filter((g) => {
    if (g.categoria !== 'Comida y salidas') return false;
    const [a, m, d] = g.fecha_compra.split('-').map(Number);
    const dias = diasEntre(new Date(a, m - 1, d), hoy);
    return dias >= 0 && dias < 7;
  }).length;
  // (si ya avisamos que esta semana se gastó de más en comida, no lo repetimos)
  if (salidas >= 3 && ctx.semanaInusual?.categoria !== 'Comida y salidas') {
    decir('restaurant', {
      amable: `Esta semana comiste afuera ${salidas} veces. ¡Disfrutalo, pero ojo con el bolsillo! 🍕`,
      directo: `${salidas} gastos en comida y salidas esta semana.`,
      estricto: `${salidas} veces comida afuera en 7 días. Esta semana, a cocinar en casa.`,
    });
  }

  return lista.slice(0, 3);
}

export type Nivel = 'si' | 'cuidado' | 'no' | 'sinSueldo';

export function nivelSegunPorcentaje(porcentaje: number | null): Nivel {
  if (porcentaje === null) return 'sinSueldo';
  return porcentaje < 50 ? 'si' : porcentaje < 80 ? 'cuidado' : 'no';
}

// Título grande de la respuesta a "¿Lo compro?"
export function veredicto(nivel: Nivel, tono: Tono): string {
  const frases: Record<Nivel, Frases> = {
    si: { amable: '¡Sí, podés comprarlo! 🎉', directo: 'Sí, podés', estricto: 'Podés, si de verdad lo necesitás' },
    cuidado: { amable: 'Podés, pero con cuidado', directo: 'Con cuidado', estricto: 'Mejor esperá' },
    no: { amable: 'Mejor esperá un poquito', directo: 'Mejor no', estricto: 'No. Te deja sin margen' },
    sinSueldo: {
      amable: 'Contame tu sueldo y te digo',
      directo: 'Cargá tu sueldo para saberlo',
      estricto: 'Sin tu sueldo no puedo decidir',
    },
  };
  return frases[nivel][tono];
}
