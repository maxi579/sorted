---
name: sistema-diseno
description: "Sistema de diseño de Sorted (app-gastos): colores, tipografía Plus Jakarta Sans, espaciado, radios y componentes de ui.tsx. Usala SIEMPRE antes de crear o modificar cualquier pantalla o componente en src/app o src/components, aunque el cambio parezca chico (un color, un texto, un botón)."
---

# Sistema de diseño — Sorted

La fuente de verdad es **`DESIGN.md`** en la raíz. Los valores viven en `src/constants/tema.ts`
y los componentes base en `src/components/ui.tsx`.

## Reglas duras

1. **Nada de hex ni rgba sueltos** fuera de `tema.ts` y `categorias.ts`. Si falta un color, se agrega a
   `colores` con nombre semántico. Excepciones documentadas: `exportar.tsx` (hoja de PDF), botón de Google y `Logo.tsx`.
2. **Texto siempre con `Texto` / `Entrada`** de `ui.tsx` (las pantallas los importan como `Texto as Text` y
   `Entrada as TextInput`). Nunca `Text`/`TextInput` de `react-native`: se pierde la fuente.
3. **Reusá antes de crear**: `Encabezado`, `Boton` (primario / secundario / peligro), `Chip`, `Campo`,
   `Etiqueta`, `Tarjeta`, `confirmar()` y `useAviso()` de `Toast.tsx`. Si un patrón aparece en 2+ pantallas, va a `ui.tsx`.
4. **Radios** con `radios.chico/medio/grande/enorme` y **espacios** con `espacios.*`. Círculos: mitad del ancho.
5. **% del sueldo** con `colorSegunPorcentaje()`.
6. **Categorías** con `estiloCategoria()` de `constants/categorias.ts`.

## Interacción

- Áreas táctiles ≥ 44pt (`hitSlop` en íconos sueltos).
- Todo `Pressable` propio: respuesta visual al presionar, `accessibilityRole` y `accessibilityLabel` si no tiene texto.
- Haptics: selección (chips, pestañas), impacto liviano (botones), éxito/error (los da `useAviso`).
- Destructivo: `confirmar()` (funciona en web y en el celular).

## Voz y forma

- Voseo rioplatense, frases cortas, sin jerga.
- Emojis en la voz (avisos, recorrido) sí; como ícono de la interfaz no: Ionicons.
- Sin etiquetas en MAYÚSCULAS; metadatos en dos niveles en vez de "A · B · C".
- `…` en vez de `...` en placeholders y estados de carga.

## Antes de terminar un cambio de UI

- [ ] `grep -rnE "'#[0-9a-fA-F]{3,8}'|rgba\(" src/app src/components` sin resultados nuevos
- [ ] Sin `Text`/`TextInput` importados de `react-native`
- [ ] Estados de carga, vacío y error resueltos
- [ ] `npx tsc --noEmit`, `npx expo lint` y `npm test` sin errores
- [ ] Mirarla en la demo web: `EXPO_PUBLIC_SOLO_DEMO=true npx expo start --web` a ~375px de ancho

Para patrones de plata (montos, cuotas, gráficos, comparativas) ver la skill `ux-finanzas`.
