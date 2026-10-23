-- Gastos fijos y suscripciones, efectivo, activos, pagos detectados (mail / notificaciones) y límite del asistente con IA.
-- Correr una vez en el SQL Editor de Supabase, después de schema.sql.

-- PERFILES: dirección de mail para reenviar pagos y token para mandar avisos al celular
alter table perfiles
  add column codigo_mail text unique default substr(md5(random()::text || clock_timestamp()::text), 1, 10),
  add column push_token text;

-- FIJOS: lo que se paga todos los meses (luz, gas, alquiler, Netflix...)
create table fijos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  descripcion text not null,
  categoria text,
  tipo text not null default 'servicio' check (tipo in ('servicio', 'suscripcion')),
  monto numeric(14,2) check (monto > 0),            -- null = cambia cada mes
  moneda text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  dia smallint not null check (dia between 1 and 31),
  tarjeta_id uuid references tarjetas on delete set null,
  debito_automatico boolean not null default false,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

-- PAGOS_FIJOS: qué fijo se pagó en qué mes (y el gasto que se anotó)
create table pagos_fijos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  fijo_id uuid not null references fijos on delete cascade,
  mes date not null,                                 -- primer día del mes
  monto numeric(14,2) not null check (monto > 0),
  gasto_id uuid references gastos on delete set null,
  creado_en timestamptz not null default now(),
  unique (fijo_id, mes)
);

-- RETIROS: plata en efectivo que sacaste del cajero
create table retiros (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  monto numeric(14,2) not null check (monto > 0),
  fecha date not null default current_date,
  nota text,
  creado_en timestamptz not null default now()
);

-- ACTIVOS: dólares, plazos fijos, fondos, bienes...
create table activos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  nombre text not null,
  tipo text not null check (tipo in ('dolares', 'plazo_fijo', 'remunerada', 'fci', 'acciones', 'cripto', 'bien', 'otro')),
  monto_inicial numeric(16,2) not null check (monto_inicial >= 0),
  fecha_inicio date not null default current_date,
  cantidad numeric(16,4),
  tna numeric(7,3),
  plazo_dias integer,
  valor_actual numeric(16,2),
  depreciacion_anual numeric(6,2),
  creado_en timestamptz not null default now()
);

-- SUGERENCIAS: pagos detectados en mails reenviados o notificaciones, para que el usuario los confirme
create table sugerencias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  origen text not null check (origen in ('mail', 'notificacion')),
  descripcion text not null,
  monto numeric(14,2),
  moneda text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  fecha date not null default current_date,
  fuente text,
  texto_original text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'descartada', 'verificacion')),
  creado_en timestamptz not null default now()
);

-- USO_IA: cuántos mensajes le mandó cada usuario al asistente por día (lo escribe solo la función del servidor)
create table uso_ia (
  usuario_id uuid not null references auth.users on delete cascade,
  dia date not null default current_date,
  mensajes integer not null default 0,
  primary key (usuario_id, dia)
);

create index on fijos (usuario_id);
create index on pagos_fijos (usuario_id);
create index on retiros (usuario_id);
create index on activos (usuario_id);
create index on sugerencias (usuario_id, estado);

alter table fijos enable row level security;
alter table pagos_fijos enable row level security;
alter table retiros enable row level security;
alter table activos enable row level security;
alter table sugerencias enable row level security;
alter table uso_ia enable row level security;  -- sin políticas: solo la función del servidor (service role) lo toca

create policy "Cada usuario gestiona sus fijos" on fijos
  for all using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy "Cada usuario gestiona sus pagos de fijos" on pagos_fijos
  for all using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy "Cada usuario gestiona sus retiros" on retiros
  for all using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy "Cada usuario gestiona sus activos" on activos
  for all using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy "Cada usuario gestiona sus sugerencias" on sugerencias
  for all using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

-- Que el usuario no pueda cambiarse el código de mail a mano (lo usaría para recibir pagos de otro)
create function public.proteger_codigo_mail()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.codigo_mail is distinct from old.codigo_mail and (select auth.role()) <> 'service_role' then
    new.codigo_mail := old.codigo_mail;
  end if;
  return new;
end;
$$;

create trigger codigo_mail_fijo
  before update on perfiles
  for each row execute function public.proteger_codigo_mail();
