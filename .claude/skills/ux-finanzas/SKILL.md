---
name: ux-finanzas
description: Patrones de UX para mostrar y cargar plata en Sorted (app-gastos) — montos, cuotas, porcentaje del sueldo, gráficos de meses, comparativas contado vs cuotas, entrada de importes y borrados. Usala cuando diseñes o cambies cualquier pantalla que muestre montos, cuotas, proyecciones o gráficos (Inicio, Fijos, Cargar, Cuotas, Ahorros, Efectivo, ¿Lo compro?, Activos, Ajustes), junto con la skill sistema-diseno.
---

# UX de finanzas — Sorted

La pregunta que la app responde siempre es: **"¿cuánto me queda / cuánto tengo comprometido?"**.
Cada pantalla tiene que contestarla en menos de 2 segundos de mirada.

## Jerarquía de una pantalla con plata

1. **Un número protagonista** (hero): el que responde la pregunta de esa pantalla. Grande (`tipografia.hero`, 34/800), arriba.
2. **Contexto inmediato** debajo: barra de % del sueldo + "te quedan $X". El color viene de `colorSegunPorcentaje()`.
3. **Detalle** después: lista o gráfico. Nunca dos números del mismo tamaño compitiendo.

Si la pantalla tiene un hero, no repetir el mismo dato en otro lado con otro formato.

## Montos

- Siempre `formatearMonto()` de `src/lib/finanzas.ts`. Nunca concatenar `$` a mano.
- En pantalla, redondear a pesos enteros (`Math.round`) salvo USD o cuotas chicas.
- **ARS y USD nunca se suman.** USD va en una línea aparte, más chica, en `textoSecundario`: `+ US$ 120`.
- `fontVariant: ['tabular-nums']` en montos de listas, tablas y comparativas.
- Montos en listas: alineados a la derecha, 16/600, `texto`. El color se reserva para estado
  (verde = a favor / ahorro, rojo = te pasás), no para decorar.
- En el hero, el símbolo puede ir más chico/tenue que la cifra para que la cifra lea primero.

## Cuotas

- Formato canónico: `3 de 12` en el detalle, y `12 × $ 10.000` cuando se describe la compra.
- Mostrar el progreso de la cuota cuando suma (mini barra o "faltan 9").
- "Pago único" en vez de "1 de 1".
- Mes de la primera cuota explícito al cargar con tarjeta de crédito ("Primera cuota en noviembre"),
  porque depende del cierre y es la parte que la gente no entiende.

## Porcentaje del sueldo

- Si no hay sueldo cargado: no mostrar barra vacía; mostrar un llamado a la acción que lleve a Ajustes.
- Umbrales fijos 50 / 80 (`colorSegunPorcentaje`). Por encima de 100%, la barra se llena y el texto lo dice
  ("Te pasás por $X"), no muestra "te quedan $0".
- El porcentaje se redondea a entero; nunca decimales.

## Gráficos (pantalla Cuotas y similares)

- Barras verticales por mes, la seleccionada en `primario`, el resto en `borde`.
- Mostrar el valor del mes seleccionado arriba de su barra o en un título debajo (ya existe el patrón).
- Si hay sueldo, dibujar una **línea de referencia** horizontal a la altura del sueldo (y opcional a 80%)
  para que se vea qué mes se acerca al límite. Las barras que superan 80% van en `advertencia`/`peligro`.
- Etiquetas de mes cortas ("Nov"), 13px, `textoSecundario`; la seleccionada en `primario` y 700.
- Animar la altura de las barras al entrar y al cambiar datos (`withTiming`, ~500ms, escalonado 30ms).
- Tap en barra: `Haptics.selectionAsync()` + `accessibilityLabel="Noviembre: $ 230.000"`.
- Para gráficos más complejos que barras simples, preferir `react-native-svg` (instalar con `npx expo install`)
  antes que una librería de charts pesada.

## Comparativas (Simular: contado vs cuotas)

- **El veredicto primero**, en una frase con color: "Conviene en cuotas" (verde) / "Conviene contado" (amarillo).
- Debajo, las dos opciones lado a lado con el mismo formato y tamaño; la ganadora marcada (borde o check), no la perdedora tachada.
- "Antes → después" en una fila: antes en `textoSecundario`, flecha en `textoTenue`, después en el color de estado.
- Explicar la cuenta en una línea en lenguaje llano ("en plata de hoy, con 2% de inflación por mes").
- Recalcular en vivo mientras se escribe; si falta un dato, mostrar el esqueleto del resultado con guiones, no hacerlo desaparecer.

## Entrada de montos

- Teclado `decimal-pad` (montos) o `number-pad` (cuotas, días).
- Formatear con separador de miles **mientras se escribe** (`1.200.000`) y parsear con la misma regla
  de `src/lib/formato.ts` (`formatearEntradaMonto` al escribir, `leerMonto` al guardar).
- Prefijo `$` / `US$` visible dentro del input, según la moneda elegida.
- Atajos útiles como chips: cantidad de cuotas comunes (1, 3, 6, 12) en vez de obligar a tipear.
- Validación al lado del campo, en `error`, con qué hacer ("Poné un monto mayor a 0"), no un Alert.

## Carga rápida (pantalla Cargar)

- El input de texto libre es la estrella: grande, con foco automático al entrar a la pestaña.
- Ejemplos tocables como chips debajo ("pizza 18 lucas con mp") que rellenan el input.
- Al interpretar, mostrar la tarjeta de resultado con animación de entrada y los campos detectados resaltados.
- Al guardar: haptic de éxito + toast/confirmación que se va sola, y el input listo para el próximo gasto.

## Borrar y editar

- Borrado siempre confirmado con el nombre ("¿Eliminar \"Zapas\"?") y explicando la consecuencia
  ("También se quitan sus cuotas de la proyección").
- Usar `confirmar()` de `ui.tsx` (funciona en web). Donde la acción se repite mucho (marcar un fijo como pagado), ofrecer "Deshacer" en la fila, como hace Fijos.
- La acción destructiva va separada y abajo, nunca al lado de "Guardar".
- Swipe en ítems de lista para borrar/editar es bienvenido, pero el tap para editar tiene que seguir funcionando.

## Fechas

- Agrupar listas por día: "Hoy", "Ayer", "Lunes 5 oct". Total del día a la derecha del encabezado.
- Meses en español, minúscula dentro de frases ("en noviembre"), capitalizados como etiqueta ("Nov").
