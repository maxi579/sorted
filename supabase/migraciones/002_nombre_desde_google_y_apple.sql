-- Al entrar con Google o Apple el nombre no viene en "nombre" (como en el registro con email)
-- sino en "full_name" o "name". El perfil nuevo toma el primero que encuentre.

create or replace function public.crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'nombre', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', '')
    )
  );
  return new;
end;
$$;
