-- RECIBOS DE SUELDO: lo que leyó la IA de cada recibo (no se guarda el archivo).
-- Sirven para actualizar el sueldo solo y para comparar cuánto subió contra la inflación.

create table recibos_sueldo (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  periodo date not null check (extract(day from periodo) = 1),   -- primer día del mes liquidado
  empleador text not null default '',
  bruto numeric(16,2) check (bruto > 0),
  neto numeric(16,2) not null check (neto > 0),
  moneda text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  aguinaldo boolean not null default false,                      -- SAC: no es el sueldo de todos los meses
  creado_en timestamptz not null default now(),
  unique (usuario_id, periodo, empleador, aguinaldo)
);

create index on recibos_sueldo (usuario_id, periodo);

alter table recibos_sueldo enable row level security;

create policy "Cada usuario gestiona sus recibos" on recibos_sueldo
  for all using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
