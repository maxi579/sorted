-- RECIBOS POR QUINCENA O SEMANA: un recibo ya no es "el del mes", sino el de un período exacto (desde/hasta).
-- Así dos quincenas del mismo mes y la misma empresa no se toman como el mismo recibo repetido.

alter table recibos_sueldo add column desde date, add column hasta date;

-- Los que ya estaban eran del mes completo
update recibos_sueldo
  set desde = periodo, hasta = (periodo + interval '1 month' - interval '1 day')::date
  where desde is null;

alter table recibos_sueldo add constraint recibos_sueldo_rango check (hasta >= desde);

-- El mismo recibo = misma empresa, mismo tipo, mismo período exacto y mismo neto
alter table recibos_sueldo drop constraint if exists recibos_sueldo_usuario_id_periodo_empleador_aguinaldo_key;
alter table recibos_sueldo add constraint recibos_sueldo_unico unique (usuario_id, empleador, aguinaldo, desde, hasta, neto);
