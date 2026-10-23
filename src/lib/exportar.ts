import { estiloCategoria } from '../constants/categorias';
import type { GastoConMedio } from './datos';
import { formatearFecha, formatearMonto } from './finanzas';

// Exportar los gastos a un PDF: se arma una página HTML y el celular (o el navegador) la convierte en PDF (ver pdf.ts).

export type Periodo = 'este-mes' | 'mes-pasado' | 'tres-meses' | 'este-anio' | 'todo';

export const PERIODOS: { valor: Periodo; nombre: string }[] = [
  { valor: 'este-mes', nombre: 'Este mes' },
  { valor: 'mes-pasado', nombre: 'Mes pasado' },
  { valor: 'tres-meses', nombre: 'Últimos 3 meses' },
  { valor: 'este-anio', nombre: 'Este año' },
  { valor: 'todo', nombre: 'Todo' },
];

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export type Rango = { desde: string | null; hasta: string; titulo: string };

/** Fechas 'AAAA-MM-DD' (inclusive) y el título que va en el PDF */
export function rangoDePeriodo(periodo: Periodo, hoy: Date): Rango {
  const anio = hoy.getFullYear();
  const mes = hoy.getMonth();
  const hasta = formatearFecha(hoy);
  switch (periodo) {
    case 'este-mes':
      return { desde: formatearFecha(new Date(anio, mes, 1)), hasta, titulo: `${MESES[mes]} ${anio}` };
    case 'mes-pasado': {
      const inicio = new Date(anio, mes - 1, 1);
      return {
        desde: formatearFecha(inicio),
        hasta: formatearFecha(new Date(anio, mes, 0)),
        titulo: `${MESES[inicio.getMonth()]} ${inicio.getFullYear()}`,
      };
    }
    case 'tres-meses': {
      const inicio = new Date(anio, mes - 2, 1);
      return { desde: formatearFecha(inicio), hasta, titulo: `${MESES[inicio.getMonth()]} a ${MESES[mes]} ${anio}` };
    }
    case 'este-anio':
      return { desde: `${anio}-01-01`, hasta, titulo: `Año ${anio}` };
    case 'todo':
      return { desde: null, hasta, titulo: 'Todos tus gastos' };
  }
}

/** Los gastos comprados dentro del rango, del más nuevo al más viejo */
export function gastosDelRango(gastos: GastoConMedio[], rango: Rango) {
  return gastos
    .filter((g) => (rango.desde === null || g.fecha_compra >= rango.desde) && g.fecha_compra <= rango.hasta)
    .sort((a, b) => b.fecha_compra.localeCompare(a.fecha_compra));
}

/** Totales por moneda y, en pesos, por categoría (de mayor a menor) */
export function totalesDe(gastos: GastoConMedio[]) {
  let pesos = 0;
  let dolares = 0;
  const porCategoria = new Map<string, number>();
  for (const g of gastos) {
    if (g.moneda === 'USD') {
      dolares += g.monto_total;
      continue;
    }
    pesos += g.monto_total;
    const categoria = g.categoria ?? 'Otros';
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + g.monto_total);
  }
  const categorias = [...porCategoria.entries()].sort(([, a], [, b]) => b - a).map(([categoria, total]) => ({ categoria, total }));
  return { pesos, dolares, categorias };
}

// Lo que escribe la persona va a una página HTML: hay que escaparlo
const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const fechaCorta = (fecha: string) => `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(2, 4)}`;

/** La página que se convierte en PDF */
export function htmlDeGastos({ nombre, rango, gastos, generado }: { nombre: string | null; rango: Rango; gastos: GastoConMedio[]; generado: Date }) {
  const { pesos, dolares, categorias } = totalesDe(gastos);
  const maximo = categorias[0]?.total ?? 1;

  const filasCategorias = categorias
    .map(({ categoria, total }) => {
      const color = estiloCategoria(categoria).color;
      const parte = pesos > 0 ? Math.round((total / pesos) * 100) : 0;
      return `<tr>
        <td class="cat"><span class="punto" style="background:${color}"></span>${escapar(categoria)}</td>
        <td class="barra"><div style="width:${Math.max(2, (total / maximo) * 100)}%;background:${color}"></div></td>
        <td class="num">${parte}%</td>
        <td class="num fuerte">${formatearMonto(total)}</td>
      </tr>`;
    })
    .join('');

  const filasGastos = gastos
    .map((g) => {
      const cuotas = g.cantidad_cuotas > 1 ? `<span class="cuotas">${g.cantidad_cuotas} cuotas</span>` : '';
      return `<tr>
        <td class="fecha">${fechaCorta(g.fecha_compra)}</td>
        <td>${escapar(g.descripcion)} ${cuotas}<div class="sub">${escapar(g.categoria ?? 'Otros')} · ${escapar(g.tarjetas?.nombre ?? 'Efectivo')}</div></td>
        <td class="num fuerte">${formatearMonto(g.monto_total, g.moneda)}</td>
      </tr>`;
    })
    .join('');

  return `<!doctype html>
<html lang="es-AR"><head><meta charset="utf-8"><title>Sorted · ${escapar(rango.titulo)}</title>
<style>
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
  .marca { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
  .marca span { color: #059669; }
  h1 { font-size: 26px; margin: 18px 0 2px; text-transform: capitalize; }
  .de { color: #64748b; margin: 0 0 20px; }
  .totales { display: flex; gap: 12px; margin-bottom: 22px; }
  .caja { flex: 1; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; }
  .caja .etq { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .caja .valor { font-size: 20px; font-weight: 800; margin-top: 4px; }
  h2 { font-size: 15px; margin: 20px 0 8px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 7px 4px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
  tr { page-break-inside: avoid; }
  .cat { width: 32%; white-space: nowrap; }
  .punto { display: inline-block; width: 8px; height: 8px; border-radius: 4px; margin-right: 8px; }
  .barra { width: 38%; vertical-align: middle; }
  .barra div { height: 8px; border-radius: 4px; }
  .num { text-align: right; white-space: nowrap; }
  .fuerte { font-weight: 700; }
  .fecha { color: #64748b; width: 62px; white-space: nowrap; }
  .sub { color: #64748b; font-size: 11px; margin-top: 2px; }
  .cuotas { background: #ecfdf5; color: #047857; border-radius: 6px; padding: 1px 6px; font-size: 10px; font-weight: 700; margin-left: 4px; }
  .vacio { color: #64748b; padding: 24px 0; }
  .pie { color: #94a3b8; font-size: 10px; margin-top: 28px; }
</style></head>
<body>
  <div class="marca">Sorted<span>.</span></div>
  <h1>${escapar(rango.titulo)}</h1>
  <p class="de">${nombre ? `${escapar(nombre)} · ` : ''}${gastos.length} ${gastos.length === 1 ? 'gasto' : 'gastos'}</p>

  <div class="totales">
    <div class="caja"><div class="etq">Total en pesos</div><div class="valor">${formatearMonto(pesos)}</div></div>
    ${dolares > 0 ? `<div class="caja"><div class="etq">Total en dólares</div><div class="valor">${formatearMonto(dolares, 'USD')}</div></div>` : ''}
  </div>

  ${categorias.length ? `<h2>En qué se fue</h2><table>${filasCategorias}</table>` : ''}

  <h2>Gastos</h2>
  ${gastos.length ? `<table>${filasGastos}</table>` : '<p class="vacio">No anotaste gastos en este período.</p>'}

  <p class="pie">Las compras en cuotas figuran por su total, en la fecha de compra. Generado con Sorted el ${fechaCorta(formatearFecha(generado))}.</p>
</body></html>`;
}
