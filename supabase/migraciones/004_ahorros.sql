-- AHORROS: metas (para qué se junta la plata) y aportes (cuánto se separó y cuándo).
-- Cada meta puede estar guardada en un activo (Mercado Pago, plazo fijo...) para sumar sus intereses.

create table metas_ahorro (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  nombre text not null,
  emoji text not null default '💰',
  objetivo numeric(16,2) check (objetivo > 0),
  fecha_objetivo date,
  activo_id uuid references activos on delete set null,
  ahorro_mensual numeric(14,2) check (ahorro_mensual > 0),
  dia_aporte smallint check (dia_aporte between 1 and 31),
  creado_en timestamptz not null default now()
);

create table aportes_ahorro (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  meta_id uuid not null references metas_ahorro on delete cascade,
  monto numeric(16,2) not null check (monto <> 0),   -- negativo = se sacó plata
  fecha date not null default current_date,
  automatico boolean not null default false,
  creado_en timestamptz not null default now()
);

create index on metas_ahorro (usuario_id);
create index on aportes_ahorro (usuario_id);
create index on aportes_ahorro (meta_id);

alter table metas_ahorro enable row level security;
alter table aportes_ahorro enable row level security;

create policy "Cada usuario gestiona sus metas" on metas_ahorro
  for all using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy "Cada usuario gestiona sus aportes" on aportes_ahorro
  for all using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
