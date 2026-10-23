<img src="assets/marca/icono.svg" width="72" alt="Sorted" />

# Sorted — tu plata, en orden

🇬🇧 [Read in English](README.md)

App móvil para llevar el control de gastos con tarjeta en Argentina: **cuánto tenés comprometido en cuotas cada mes, qué parte de tu sueldo se lleva y si te conviene pagar contado o en cuotas** con la inflación.

Hecha con **Expo (React Native) + TypeScript + Supabase**. Funciona en iOS, Android y web.

🔗 **Probala online (modo demo, sin cuenta):** [maxi579.github.io/sorted](https://maxi579.github.io/sorted/)

## Funcionalidades

**Para decidir antes de comprar**
- **¿Lo compro?** — ponés el precio y la app responde *sí / con cuidado / mejor no*, mirando tu sueldo y lo que ya tenés comprometido en los meses que toca la compra. Además te dice cuánto es cada cuota, cuándo pagás la primera, si conviene contado o cuotas (en plata de hoy, con la inflación) y cómo cambia tu día de libertad.
- **La mejor tarjeta para hoy** — según el cierre y vencimiento de cada tarjeta, cuál te da más días hasta pagar.
- **Día de libertad** — el mes en que terminás de pagar todas tus cuotas.

**Para entender tu mes**
- **Carga en lenguaje natural**: escribís *"zapas 120k en 6 cuotas con visa"* y la app detecta monto, cuotas, moneda, tarjeta y categoría.
- **Cuotas proyectadas** por resumen, % del sueldo con semáforo y total pendiente **en plata de hoy**.
- **Asistente con personalidad** (amable, directo o estricto) que da consejos con tus datos: cómo venís, cierres de tarjeta y vencimientos que se vienen, efectivo sin anotar, muchas salidas a comer… Funciona con reglas, sin IA: es instantáneo, gratis y nunca inventa números.
- **Asistente con IA (chat)**: le preguntás *"¿cuánto gasté en Uber en septiembre?"* o *"armame el informe del mes"* y responde consultando tus datos reales. Límite de 10 mensajes por día por usuario mientras está en desarrollo.
- **Avisos antes del cierre** de cada tarjeta (notificaciones locales, sin servidor).
- **Dólar tarjeta e inflación del INDEC automáticos** (DolarApi y ArgentinaDatos), guardados en el celular.

**Gastos fijos, efectivo y patrimonio**
- **Fijos y suscripciones**: luz, gas, alquiler, Netflix… se cargan una vez. Los de monto fijo se suman solos a lo que tenés que pagar; los que cambian (luz, gas) te piden el monto cuando llega la factura. Aviso un día antes del vencimiento, botón de *pagado* y total anual de suscripciones.
- **Débitos automáticos**: las suscripciones que se debitan solas se anotan el día que vencen (sin duplicar si ya las anotaste a mano).
- **Detecta lo que se repite**: si anotaste "Spotify" dos meses seguidos, te propone agregarlo como fijo.
- **Efectivo**: anotás lo que sacás del cajero y la app te dice cuánto de esa plata todavía no anotaste; botones rápidos (kiosco, verdulería, colectivo) y recordatorio los domingos.
- **Activos y patrimonio**: dólares (valuados al blue), plazos fijos, cuentas que pagan interés, fondos, cripto y bienes que se desvalorizan. Muestra cuánto vale hoy, el rendimiento y el rendimiento **real** (descontando la inflación del INDEC), y tu patrimonio menos lo que debés en cuotas. No recomienda inversiones.

**Para que no se te escape ningún gasto**
- **Escáner de tickets**: sacás una foto del ticket, la factura o la captura del comprobante de Mercado Pago, y la IA (Claude) arma el gasto. Si es una factura de servicio, ofrece agregarla a Fijos.
- **Anotar con Siri**: guía para armar un Atajo de iPhone. Le decís *"café 3500 con mercado pago"* y queda anotado (también desde el botón de acción).
- **Pagos que llegan solos (iPhone y Android)**: reenviás los mails de pagos de Mercado Pago y tu banco a una dirección propia; la IA saca monto, comercio y fecha, y aparecen en *Pagos para revisar* (con aviso al celular).
- **Notificaciones de billeteras (Android)**: con permiso, la app detecta las notificaciones de pagos de Mercado Pago, Ualá o tu banco y te pregunta si las anota. Todo se procesa en el celular.
- **Recordatorio a la noche**: a las 21 h, solo los días en que no anotaste nada. Al tocarlo se abre directo la pantalla para anotar.
- **Revisar el resumen de la tarjeta**: subís el PDF, una IA (Claude) lee las compras y la app las compara con lo que ya tenías — te muestra solo lo que te faltaba y lo agregás con un toque. Reconoce compras en cuotas y no duplica lo ya cargado.

**Pensada para cualquiera**
- Lenguaje simple, primeros pasos guiados y explicaciones donde hacen falta (pensada para que la usen también personas mayores).
- **Funciona sin internet**: muestra lo último guardado y los gastos nuevos se suben solos cuando vuelve la conexión, sin duplicarse.
- **Modo demo** para probarla sin cuenta.

## Stack

| | |
|---|---|
| App | Expo SDK 57, React Native, Expo Router, TypeScript |
| UI | Reanimated, expo-linear-gradient, expo-haptics, expo-notifications |
| Datos externos | DolarApi, ArgentinaDatos (INDEC) |
| IA | Claude (Anthropic) vía Supabase Edge Function |
| Tests | node:test |
| Backend | Supabase (Auth + PostgreSQL con Row Level Security) |

## Arquitectura

```
src/
├── app/            # Pantallas (Expo Router): inicio, cargar, cuotas, comprar (¿Lo compro?), ajustes, resumen, fijos, efectivo, activos, chat (IA), revisar (pagos detectados)
├── components/     # UI reutilizable, formularios, login, toasts
├── constants/      # Tema (colores, tipografía) y estilos por categoría
└── lib/
    ├── interpretarGasto.ts  # Parser de lenguaje natural → gasto
    ├── finanzas.ts          # Cuotas, fechas de pago, día de libertad, valor presente
    ├── decision.ts          # "¿Lo compro?": junta todo en una respuesta
    ├── asistente.ts         # Consejos según tus datos y el tono elegido
    ├── indicadores.ts       # Dólar tarjeta e inflación, con caché
    ├── avisos.ts            # Avisos de cierre y recordatorio de la noche
    ├── conciliacion.ts      # Compara el resumen de la tarjeta con lo cargado
    ├── resumen.ts           # Manda el PDF a la función que lo lee
    ├── datos.ts             # Acceso a datos: Supabase + caché y cola sin conexión
    ├── fijos.ts             # Gastos fijos: vencimientos, débitos automáticos, detectar lo que se repite
    ├── efectivo.ts          # Retiros del cajero contra gastos en efectivo
    ├── activos.ts           # Valuación de activos y rendimiento real con la inflación
    ├── interpretarNotificacion.ts  # Notificaciones de billeteras → pago detectado
    ├── notificaciones.ts    # Puente con el módulo nativo de Android
    ├── comprobante.ts       # Escáner: foto → función del servidor
    ├── chatIA.ts            # Chat con el asistente con IA
    └── demo.ts              # Misma interfaz con datos en memoria (modo demo)
tests/                       # Tests de la lógica (npm test)
supabase/schema.sql          # Tablas, índices y políticas RLS
supabase/functions/leer-resumen/  # Edge Function: lee el PDF del resumen con Claude
supabase/functions/leer-comprobante/  # Lee tickets y comprobantes con Claude
supabase/functions/asistente-ia/      # Chat con herramientas sobre los datos del usuario
supabase/functions/recibir-mail/      # Mails de pagos reenviados → pagos para revisar
supabase/migraciones/                 # Cambios a la base posteriores a schema.sql
modules/lector-notificaciones/        # Módulo nativo de Android que lee notificaciones de pagos
```

Las pantallas no hablan directo con Supabase: usan una `FuenteDatos`, así el modo demo y el modo real comparten todo el código de la interfaz.

## Correrlo

```bash
npm install
# crear .env.local con:
# EXPO_PUBLIC_SUPABASE_URL=...
# EXPO_PUBLIC_SUPABASE_KEY=...
npx expo start
```

Escaneá el QR con **Expo Go** o abrí la versión web con `w`. Los tests de la lógica se corren con `npm test`.

### Activar la lectura de resúmenes (opcional)

La lectura del PDF corre en una Edge Function de Supabase que llama a la API de Claude (Claude Opus 5.5, con salida JSON estructurada). Solo la pueden usar usuarios logueados y el PDF no se guarda.

```bash
npx supabase login
npx supabase link --project-ref TU_PROJECT_REF
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy leer-resumen
```

Cada resumen leído consume créditos de la API de Anthropic (unos pocos centavos de dólar por resumen). En el modo demo se usa un resumen de ejemplo, sin llamar a la API.

### Activar las funciones nuevas (fijos, efectivo, activos, IA, mails)

1. **Base de datos**: en el SQL Editor de Supabase, corré [`supabase/migraciones/001_fijos_efectivo_activos_sugerencias.sql`](supabase/migraciones/001_fijos_efectivo_activos_sugerencias.sql). Con eso ya andan Fijos, Efectivo y Activos.
2. **Escáner y asistente con IA** (usan la misma `ANTHROPIC_API_KEY`):
   ```bash
   npx supabase functions deploy leer-comprobante
   npx supabase functions deploy asistente-ia
   ```
3. **Pagos por mail** (opcional): creá una cuenta en [Postmark](https://postmarkapp.com) y activá *Inbound*. Te da una dirección tipo `abc123@inbound.postmarkapp.com`.
   ```bash
   npx supabase secrets set MAIL_SECRETO=una-clave-larga-al-azar
   npx supabase functions deploy recibir-mail --no-verify-jwt
   ```
   En Postmark, poné como webhook de inbound `https://TU_PROYECTO.supabase.co/functions/v1/recibir-mail?clave=una-clave-larga-al-azar`, y en `.env.local` agregá `EXPO_PUBLIC_MAIL_PAGOS=abc123@inbound.postmarkapp.com`.
4. **Avisos al celular y notificaciones de Android**: necesitan la app compilada (no Expo Go). El lector de notificaciones es un módulo nativo propio ([`modules/lector-notificaciones`](modules/lector-notificaciones)):
   ```bash
   npx eas-cli@latest build --profile development --platform android
   ```
   En iPhone el lector no existe (Apple no lo permite): ahí se usan los mails reenviados, el escáner y Siri.

### Entrar con Google y Apple

1. Correr [`supabase/migraciones/002_nombre_desde_google_y_apple.sql`](supabase/migraciones/002_nombre_desde_google_y_apple.sql) (el perfil toma el nombre de la cuenta de Google o Apple).
2. **Google**: en Google Cloud Console, crear un *ID de cliente de OAuth* de tipo *Aplicación web* con el URI de redireccionamiento `https://TU_PROYECTO.supabase.co/auth/v1/callback`, y pegar el Client ID y el Client Secret en Supabase → Authentication → Providers → Google.
3. **Apple** (solo iPhone, inicio de sesión nativo): en Supabase → Authentication → Providers → Apple, agregar en *Client IDs* el bundle ID de la app y `host.exp.Exponent` para probar con Expo Go. Requiere una cuenta de Apple Developer.
4. En Supabase → Authentication → URL Configuration → Redirect URLs, agregar `sorted://**`, `appgastos://**` (direcciones viejas), `exp://**` y la dirección de la demo web.

### Publicar la demo web

```bash
EXPO_NO_DOTENV=1 EXPO_PUBLIC_SOLO_DEMO=true EXPO_BASE_URL=/sorted npx expo export --platform web
```

Genera `dist/` con la app en modo demo y sin datos de Supabase, lista para GitHub Pages. La base de datos se crea con [`supabase/schema.sql`](supabase/schema.sql).

---

Hecho por [Máximo Nuñez](https://maxi579.github.io).
