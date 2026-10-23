<img src="assets/marca/icono.svg" width="72" alt="Sorted" />

# Sorted — your money, sorted

🇪🇸 [Leer en español](README.es.md)

A mobile app for managing credit card spending in Argentina, where buying in installments (*cuotas*) and high inflation are part of everyday life. It answers three questions: **how much of each month's salary is already committed to installments, which card to pay with today, and whether it's better to pay upfront or in installments** once inflation is taken into account.

Built with **Expo (React Native) + TypeScript + Supabase**. Runs on iOS, Android and the web. The UI is in Spanish.

🔗 **Try it online (demo mode, no account needed):** [maxi579.github.io/sorted](https://maxi579.github.io/sorted/)

## Features

**Decide before you buy**
- **"Should I buy it?"** (*¿Lo compro?*) — enter a price and the app answers *yes / careful / better not*, looking at your salary and what you already owe in the months the purchase would land on. It also tells you the installment amount, when the first payment is due, whether paying upfront or in installments is cheaper in today's money, and how your "freedom day" changes.
- **Best card for today** — based on each card's closing and due dates, which one gives you the most days before you pay.
- **Freedom day** — the month you'll finish paying off every installment.

**Understand your month**
- **Natural-language input:** type *"zapas 120k en 6 cuotas con visa"* ("sneakers 120k in 6 installments with visa") and the app extracts amount, installments, currency, card and category.
- **Installments projected** per statement, % of salary with a traffic-light indicator, and total remaining debt **in today's money**.
- **Assistant with a personality** (friendly, direct or strict) that gives tips from your own data: how the month is going, card closing dates coming up, too many takeout meals… Rule-based, no AI: instant, free, and it never makes up numbers.
- **Alerts before each card's closing date** (local notifications, no server).
- **AI assistant chat**: ask *"how much did I spend on Uber in September?"* or *"give me this month's report"* and Claude answers using your real data through tools (10 messages per user per day while in development).
- **Card exchange rate and official inflation (INDEC) fetched automatically** (DolarApi and ArgentinaDatos) and cached on the device.

**Fixed bills, cash and net worth**
- **Bills and subscriptions** (electricity, rent, Netflix…): entered once, added to what you owe each month, reminded the day before they're due, with a *paid* button. Bills that vary ask for the amount when they arrive. Auto-debited subscriptions are logged on their due date without duplicating manual entries, and recurring expenses are detected and suggested.
- **Cash**: log ATM withdrawals and the app tells you how much of that cash you haven't accounted for, with quick buttons and a Sunday reminder.
- **Assets and net worth**: dollars (valued at the blue rate), fixed-term deposits, interest-bearing wallets, funds, crypto and depreciating goods, with nominal and **inflation-adjusted** returns. No investment advice.

**Never miss an expense**
- **Receipt scanner**: photo of a receipt, a utility bill or a payment screenshot → Claude builds the expense.
- **Log with Siri**: a guided iPhone Shortcut — say *"café 3500 con mercado pago"* and it's saved.
- **Payments arrive on their own (iPhone and Android)**: forward payment emails from Mercado Pago and your bank to a personal address; Claude extracts amount, merchant and date into *Payments to review*, with a push notification.
- **Wallet notifications (Android)**: with permission, a native module detects payment notifications and suggests them. Processed on the device.
- **Nightly reminder:** at 9 PM, only on days you haven't logged anything. Tapping it opens the input screen.
- **Review your card statement:** upload the PDF, an AI (Claude) reads the purchases and the app compares them with what you already logged — it shows only what's missing so you can add it in one tap. It understands installment purchases and never duplicates what's already there.

**Built for everyone**
- Plain language, guided first steps and explanations where needed (designed so older relatives can use it too).
- **Works offline:** shows the last saved data, and new expenses sync automatically when the connection comes back, without duplicates.
- **Demo mode** to try it without an account.

## Stack

| | |
|---|---|
| App | Expo SDK 57, React Native, Expo Router, TypeScript |
| UI | Reanimated, expo-linear-gradient, expo-haptics, expo-notifications |
| External data | DolarApi, ArgentinaDatos (INDEC) |
| AI | Claude (Anthropic) via a Supabase Edge Function |
| Tests | node:test |
| Backend | Supabase (Auth + PostgreSQL with Row Level Security) |

## Architecture

The codebase is in Spanish: *gasto* = expense, *cuota* = installment, *tarjeta* = card, *resumen* = statement.

```
src/
├── app/            # Screens (Expo Router): home, add expense, installments, "should I buy it?", settings, statement review, bills, cash, assets, AI chat, payments to review
├── components/     # Reusable UI, forms, login, toasts
├── constants/      # Theme (colors, typography) and per-category styles
└── lib/
    ├── interpretarGasto.ts  # Natural language → expense parser
    ├── finanzas.ts          # Installments, payment dates, freedom day, present value
    ├── decision.ts          # "Should I buy it?": combines everything into one answer
    ├── asistente.ts         # Tips based on your data and the chosen tone
    ├── indicadores.ts       # Card exchange rate and inflation, cached
    ├── avisos.ts            # Closing-date alerts and the nightly reminder
    ├── conciliacion.ts      # Matches the card statement against logged expenses
    ├── resumen.ts           # Sends the PDF to the function that reads it
    ├── datos.ts             # Data access: Supabase + offline cache and upload queue
    ├── fijos.ts             # Bills: due dates, auto-debits, recurring detection
    ├── efectivo.ts          # ATM withdrawals vs. cash expenses
    ├── activos.ts           # Asset valuation and inflation-adjusted returns
    ├── interpretarNotificacion.ts  # Wallet notifications → detected payment
    ├── notificaciones.ts    # Bridge to the Android native module
    ├── comprobante.ts       # Scanner: photo → edge function
    ├── chatIA.ts            # AI assistant chat
    └── demo.ts              # Same interface backed by in-memory data (demo mode)
tests/                       # Logic tests (npm test)
supabase/schema.sql          # Tables, indexes and RLS policies
supabase/functions/leer-resumen/  # Edge Function: reads the statement PDF with Claude
supabase/functions/leer-comprobante/  # Reads receipts and payment screenshots with Claude
supabase/functions/asistente-ia/      # Tool-using chat over the user's data
supabase/functions/recibir-mail/      # Forwarded payment emails → payments to review
supabase/migraciones/                 # Database changes after schema.sql
modules/lector-notificaciones/        # Android native module that reads payment notifications
```

Screens never talk to Supabase directly: they use a `FuenteDatos` (data source) interface, so demo mode and real mode share all of the UI code.

## Running it

```bash
npm install
# create .env.local with:
# EXPO_PUBLIC_SUPABASE_URL=...
# EXPO_PUBLIC_SUPABASE_KEY=...
npx expo start
```

Scan the QR code with **Expo Go** or press `w` for the web version. Logic tests run with `npm test`.

### Enabling statement reading (optional)

PDF reading runs in a Supabase Edge Function that calls the Claude API (Claude Opus 5.5 with structured JSON output). Only signed-in users can call it — the function verifies the user's session, not just the app's public key — and the PDF is never stored.

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy leer-resumen
```

Each statement uses Anthropic API credits (a few cents per statement). Demo mode uses a sample statement and never calls the API.

### Enabling the new features (bills, cash, assets, AI, email)

1. **Database**: run [`supabase/migraciones/001_fijos_efectivo_activos_sugerencias.sql`](supabase/migraciones/001_fijos_efectivo_activos_sugerencias.sql) in the Supabase SQL Editor. Bills, Cash and Assets work after this.
2. **Receipt scanner and AI assistant** (same `ANTHROPIC_API_KEY`): `npx supabase functions deploy leer-comprobante` and `npx supabase functions deploy asistente-ia`.
3. **Email payments** (optional): enable [Postmark](https://postmarkapp.com) Inbound, set `MAIL_SECRETO` with `npx supabase secrets set`, deploy with `npx supabase functions deploy recibir-mail --no-verify-jwt`, point the inbound webhook to `https://YOUR_PROJECT.supabase.co/functions/v1/recibir-mail?clave=<MAIL_SECRETO>`, and add `EXPO_PUBLIC_MAIL_PAGOS=<your inbound address>` to `.env.local`.
4. **Push notifications and the Android notification reader** need a compiled app (not Expo Go): `npx eas-cli@latest build --profile development --platform android`. The reader is a local native module in [`modules/lector-notificaciones`](modules/lector-notificaciones). iOS doesn't allow reading other apps' notifications, so iPhone users get email forwarding, the scanner and Siri instead.

### Sign in with Google and Apple

Run `supabase/migraciones/002_nombre_desde_google_y_apple.sql`. For Google, create a *Web application* OAuth client in Google Cloud Console with redirect URI `https://YOUR_PROJECT.supabase.co/auth/v1/callback` and paste its Client ID and Secret into Supabase → Authentication → Providers → Google. For Apple (native, iPhone only), add the app's bundle ID (and `host.exp.Exponent` for Expo Go) to the Apple provider's *Client IDs*. Add `sorted://**`, `appgastos://**` (legacy), `exp://**` and the web demo URL to Authentication → URL Configuration → Redirect URLs.

### Building the web demo

```bash
EXPO_NO_DOTENV=1 EXPO_PUBLIC_SOLO_DEMO=true EXPO_BASE_URL=/sorted npx expo export --platform web
```

Generates `dist/` with the app in demo mode and no Supabase data, ready for static hosting. The database schema is in [`supabase/schema.sql`](supabase/schema.sql).

---

Built by [Máximo Nuñez](https://maxi579.github.io).
