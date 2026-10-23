// "¿Cuánto me rinde?": compara qué pasa con una plata en distintas opciones simples.
// Solo hace cuentas con tasas públicas (BCRA vía ArgentinaDatos) o la que carga la persona.
// No recomienda ninguna opción.

export type TasaPorPlazo = { dias: number; tna: number };

/** Un banco con su tasa de plazo fijo a 30 días y, si las publica, las de otros plazos (TNA como fracción) */
export type BancoPlazoFijo = { entidad: string; tna30: number; porPlazo: TasaPorPlazo[] };

export const PLAZOS = [30, 60, 90, 180, 365] as const;

// "BANCO DE LA NACION ARGENTINA" → "Banco de la Nacion Argentina", "BANCO CMF S.A." → "Banco CMF"
export function nombreBanco(entidad: string) {
  const menores = new Set(['de', 'del', 'la', 'las', 'los', 'y', 's.a.', 's.a.u.', 'sa', 'sau']);
  return entidad
    .toLowerCase()
    .split(/\s+/)
    .filter((p) => !['s.a.', 's.a.u.', 'sa', 'sau', 'cía.'].includes(p))
    // Las siglas sin vocales, como CMF, quedan en mayúsculas
    .map((p, i) => (i > 0 && menores.has(p) ? p : !/[aeiouáéíóú]/.test(p) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}

// La tasa para ese plazo si el banco la publica; si no, la de 30 días renovando cada mes
export function tasaParaPlazo(banco: BancoPlazoFijo, dias: number) {
  const exacta = banco.porPlazo.find((t) => t.dias === dias && t.tna > 0);
  return exacta ? { tna: exacta.tna, renovando: false } : { tna: banco.tna30, renovando: dias > 30 };
}

/** Cuánto cobrás al final de un plazo fijo. Si se renueva cada 30 días, se reinvierten los intereses. */
export function simularPlazoFijo(monto: number, tna: number, dias: number, renovando: boolean) {
  if (!renovando) return monto * (1 + (tna * dias) / 365);
  return monto * Math.pow(1 + (tna * 30) / 365, dias / 30);
}

/** Cuenta que paga interés todos los días (Mercado Pago, Ualá...). tnaPorcentaje: 28 = 28% anual */
export function simularCuentaRemunerada(monto: number, tnaPorcentaje: number, dias: number) {
  return monto * Math.pow(1 + tnaPorcentaje / 100 / 365, dias);
}

/** Cuánta plata vas a necesitar al final para comprar lo mismo que hoy, con una inflación mensual estimada */
export function montoParaNoPerder(monto: number, inflacionMensual: number, dias: number) {
  return monto * Math.pow(1 + inflacionMensual, dias / 30);
}

/** El banco con la mejor tasa para ese plazo */
export function mejorBanco(bancos: BancoPlazoFijo[], dias: number) {
  let mejor: { banco: BancoPlazoFijo; tna: number; renovando: boolean } | null = null;
  for (const banco of bancos) {
    const { tna, renovando } = tasaParaPlazo(banco, dias);
    const final = simularPlazoFijo(1, tna, dias, renovando);
    if (tna > 0 && (!mejor || final > simularPlazoFijo(1, mejor.tna, dias, mejor.renovando))) mejor = { banco, tna, renovando };
  }
  return mejor;
}

// Lo que devuelve ArgentinaDatos → nuestro formato, descartando datos que no tienen sentido
export function leerBancos(datos: unknown): BancoPlazoFijo[] {
  if (!Array.isArray(datos)) return [];
  return datos
    .map((d) => ({
      entidad: String(d?.entidad ?? ''),
      tna30: Number(d?.tnaClientes) || 0,
      porPlazo: Array.isArray(d?.tasas)
        ? d.tasas
            .filter((t: { plazoMinDias?: number; plazoMaxDias?: number }) => t?.plazoMinDias === t?.plazoMaxDias)
            .map((t: { plazoMinDias: number; tna: number }) => ({ dias: Number(t.plazoMinDias), tna: Number(t.tna) || 0 }))
        : [],
    }))
    .filter((b) => b.entidad && b.tna30 > 0 && b.tna30 < 2);
}
