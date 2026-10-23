-- CONTEOS_EFECTIVO: cuánta plata había en la billetera cada vez que el usuario la contó.
-- Con el último conteo, los retiros y los gastos en efectivo se calcula cuánto debería haber.

create table conteos_efectivo (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users on delete cascade,
  monto numeric(14,2) not null check (monto >= 0),
  creado_en timestamptz not null default now()
);

create index on conteos_efectivo (usuario_id, creado_en desc);

alter table conteos_efectivo enable row level security;

create policy "Cada usuario gestiona sus conteos" on conteos_efectivo
  for all using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
