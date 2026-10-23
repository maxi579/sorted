-- TIPO DE RECIBO: en un mismo mes puede haber varios recibos (sueldo, vacaciones pagadas por adelantado,
-- aguinaldo, ajuste o retroactivo por paritaria, liquidación final). Solo sueldo y vacaciones son "el sueldo del mes".

alter table recibos_sueldo
  add column tipo text not null default 'sueldo'
  check (tipo in ('sueldo', 'vacaciones', 'aguinaldo', 'ajuste', 'final'));

update recibos_sueldo set tipo = 'aguinaldo' where aguinaldo;

alter table recibos_sueldo drop constraint if exists recibos_sueldo_unico;
alter table recibos_sueldo drop column aguinaldo;
alter table recibos_sueldo add constraint recibos_sueldo_unico unique (usuario_id, empleador, tipo, desde, hasta, neto);
