# DESIGN.md — Sorted

App de gastos, cuotas, fijos y ahorros para Argentina. Modo **Operate**: la persona entra a anotar
o a ver cuánto tiene comprometido, y se va. Escaneo rápido, consistencia y gestos nativos pesan más
que la expresión; la marca vive en los detalles.

La pregunta que responde cada pantalla: **¿cuánto tengo comprometido y cuánto me queda?**

## Dirección

Oscura y verde, como siempre ("plata bajo control"), pero con identidad propia en vez de la paleta
por defecto de Tailwind:

- Neutros **grafito con tinte verde**, no slate azulado.
- Verde **menta** suave, no esmeralda saturado.
- Ámbar y coral para estados, en lugar de amarillo y rojo puros.
- Plus Jakarta Sans en toda la app, a través de `Texto` / `Entrada`.
- Sin halos de color ni sombras decorativas: la profundidad sale de fondo → superficie → superficie alta.

## Color (`src/constants/tema.ts`)

| Token | Valor | Uso |
|---|---|---|
| `fondo` | `#101614` | Fondo de pantalla |
| `superficie` | `#18201D` | Tarjetas, filas, barra de pestañas |
| `superficieAlta` | `#212B27` | Inputs, botón secundario, elementos elevados |
| `borde` | `#2C3833` | Bordes de tarjetas, separadores, chips inactivos |
| `texto` | `#EEF3F0` | Texto principal y montos |
| `textoSecundario` | `#A3B1AA` | Etiquetas y detalles (7.5:1 sobre superficie) |
| `textoTenue` | `#7E8C86` | Metadatos, placeholders, chevrons (4.7:1 sobre superficie) |
| `textoChip` | `#D5DED9` | Texto de chips inactivos |
| `primario` | `#5FD49A` | Acción principal, selección, estado sano |
| `primarioSuave` | menta al 14% | Fondo de íconos y estados activos suaves |
| `sobrePrimario` | `#0B1A12` | Texto e íconos sobre `primario` |
| `primarioTexto` / `primarioTextoClaro` / `primarioBorde` | | Texto y separadores sobre el degradé del hero |
| `advertencia` + `advertenciaFondo` / `advertenciaBorde` / `advertenciaTexto` | `#F2B544` | 50–80% del sueldo, modo demo, sugerencias |
| `peligro` / `error` | `#F0685A` | Destructivo, >80% del sueldo, errores |
| `velo` / `veloFuerte` | | Fondo detrás de modales y del recorrido guiado |

Categorías (`constants/categorias.ts`): mismos tonos de siempre con luminosidad pareja y menos saturación.

Excepciones deliberadas, con hex propios: la vista previa del PDF (`exportar.tsx`, imita papel impreso),
el botón de Google (colores de marca de Google) y el logo (`Logo.tsx`, tiene que coincidir con el ícono de la app).

## Tipografía

| Rol | Tamaño / peso |
|---|---|
| Título de pantalla (`Encabezado`) | 28 / 700, tracking -0.4 |
| Monto protagonista | 34–40 / 800 |
| Sección (`tipografia.seccion`) | 17 / 700 |
| Fila / nombre | 16 / 600 |
| Cuerpo | 15–16 / 400 |
| Etiqueta / detalle | 13 / 500 |

Sin etiquetas en MAYÚSCULAS. Metadatos en dos niveles (nombre arriba, detalle abajo) en vez de tiras unidas con "·".

## Espacio y forma

- `espacios`: 4 · 8 · 12 · 16 · 20 · 28 · 40.
- `radios`: `chico` 10 (inputs, cuadrados de ícono) · `medio` 16 (botones) · `grande` 16 (tarjetas, filas) · `enorme` 24 (hero, hojas). Los círculos usan la mitad de su ancho.
- Botones e inputs miden 50 de alto; chips 40 visibles + 4 de margen táctil.

## Estructura

- Pestañas: Inicio, Fijos, **Cargar** (pastilla verde en el centro, sin halo), Asistente y Más. El resto se abre desde Más o desde Inicio, con "Volver".
- Cada pantalla arranca con `Encabezado` (título grande, subtítulo, ayuda opcional).

## Interacción

- Áreas táctiles ≥ 44pt. `Boton` y `Chip` ya tienen rol, estado y haptics para lectores de pantalla.
- Avisos con `useAviso()` (`Toast.tsx`); destructivo con `confirmar()` de `ui.tsx`.
- Emojis: sí en la voz (avisos, recorrido, metas y tonos del asistente); no como íconos de la interfaz (usar Ionicons).
