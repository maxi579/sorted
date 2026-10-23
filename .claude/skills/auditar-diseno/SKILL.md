---
name: auditar-diseno
description: Audita el diseño de una pantalla o de toda Sorted (app-gastos) contra el sistema de diseño y los patrones de finanzas, y devuelve una lista priorizada de problemas con archivo:línea y cómo arreglarlos. Usala cuando pidan "revisá el diseño", "qué mejorarías", "auditá la pantalla X", "pulí la UI" o antes de un rediseño.
---

# Auditoría de diseño — Sorted

Antes de empezar, cargá las skills `sistema-diseno` y `ux-finanzas`: son la vara contra la que se mide.

## 1. Alcance

- Si nombran una pantalla, auditá ese archivo de `src/app/` y los componentes que usa.
- Si no, auditá todas las de `src/app/` (empezando por las pestañas: `index`, `fijos`, `cargar`, `chat`, `mas`),
  más `PantallaLogin`, `Tutorial` y los formularios de `src/components/`.

## 2. Barrido automático (rápido, hacelo primero)

```bash
grep -rnE "'#[0-9a-fA-F]{3,8}'|rgba\(" src/app src/components  # colores hardcodeados (salvo exportar, Google y Logo)
grep -rnE "^\s+(Text|TextInput),?$|import \{[^}]*\b(Text|TextInput)\b[^}]*\} from 'react-native'" src/app src/components   # Text de react-native: la fuente no aplica
grep -rnE "(margin|padding)[A-Za-z]*: (1[13579]|[2-9][13579])\b" src/app src/components            # espaciados fuera de escala
grep -rn "error.message" src/app src/components                  # errores crudos al usuario
grep -rnL "accessibilityLabel" src/app                          # pantallas sin ninguna etiqueta accesible
```

Las pantallas importan `Texto as Text` desde `ui.tsx`: un `<Text>` en el JSX no es un problema por sí solo,
fijate de dónde viene el import.

## 3. Revisión manual por pantalla

Para cada pantalla, revisá en este orden y anotá cada hallazgo:

1. **Pregunta principal** — ¿se entiende en 2 segundos cuánto tengo comprometido / cuánto me queda?
   ¿Hay un único número protagonista?
2. **Jerarquía** — tamaños/pesos según la tabla de tipografía; ≤ 3 tamaños + hero.
3. **Consistencia** — mismos componentes (`Boton`, `Chip`, `Campo`, `Tarjeta`) y mismos radios/espaciados
   que el resto. Componentes duplicados localmente (ej. un `Campo` propio) cuentan como problema.
4. **Color** — tokens semánticos, `colorSegunPorcentaje`, `textoTenue` sólo donde corresponde (contraste).
5. **Estados** — cargando, vacío, error. ¿Qué ve el usuario la primera vez, sin datos?
6. **Interacción** — áreas táctiles ≥ 44, feedback al tocar, haptics, teclado correcto, el teclado no tapa el botón.
7. **Movimiento** — entradas, cambios de layout, números que cambian; respeta "reducir movimiento".
8. **Accesibilidad** — `accessibilityLabel`/`Role`/`State`, tamaño mínimo de texto, no depender sólo del color.
9. **Microcopy** — voseo, claridad, sin jerga, errores accionables.

## 4. Ver la app de verdad (si se puede)

```bash
EXPO_PUBLIC_SOLO_DEMO=true npx expo start --web
```

Es la demo con datos de ejemplo, sin login. Abrila en el navegador integrado a ~375px de ancho y sacá captura de cada pestaña.
Para saltear el recorrido guiado, poné en `localStorage` la clave `tutorial-visto-v1` (y `recorrido-visto-<sección>`) en `si`. Lo que se ve manda sobre
lo que dice el código (ej. una fuente que no carga, un texto que se corta).

## 5. Formato del reporte

Agrupá por severidad y ordená por impacto:

- **Alta** — rompe la consistencia de toda la app o la comprensión (fuente que no aplica, contraste ilegible,
  falta estado vacío/error, dato principal confuso).
- **Media** — inconsistencias visibles, interacción floja, componentes duplicados.
- **Baja** — pulido (micro-animaciones, copys, detalles de alineación).

Cada ítem: `archivo:línea` — qué pasa — por qué importa — arreglo concreto (qué token/componente usar).

Cerrá con un **plan de mejora en pasos** (primero fundaciones: tokens y componentes en `ui.tsx`;
después pantalla por pantalla de mayor a menor uso: Inicio → Cargar → Fijos → Asistente → Más y sus pantallas → Login)
y preguntá si se aplica. No reescribas pantallas sin que lo pidan.
