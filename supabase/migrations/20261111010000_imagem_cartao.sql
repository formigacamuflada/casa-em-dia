-- Imagem real do cartão (como no Apple Pay): a pessoa envia uma foto da frente
-- do próprio cartão e ela vira a face do cartão no app.
--
-- Privacidade igual à dos cartões:
--   * cartão pessoal -> só o dono vê a imagem
--   * cartão da casa -> os dois veem
-- O arquivo fica num bucket privado; o app usa links assinados que expiram.
-- Caminho do arquivo: <casa_id>/<user_id>/<aleatório>.webp (ou .jpg no iPhone)

alter table public.cartoes
  add column if not exists imagem text check (imagem is null or char_length(imagem) <= 200);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cartoes', 'cartoes', false, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Ver: só se um cartão visível para a pessoa aponta para este arquivo.
-- A consulta em public.cartoes passa pelas regras de RLS dos próprios cartões.
create policy cartoes_img_ver on storage.objects for select to authenticated
  using (
    bucket_id = 'cartoes'
    and exists (select 1 from public.cartoes c where c.imagem = storage.objects.name)
  );

-- Enviar: só dentro da pasta da própria casa e do próprio usuário.
create policy cartoes_img_enviar on storage.objects for insert to authenticated
  with check (
    bucket_id = 'cartoes'
    and (storage.foldername(name))[1] = public.minha_casa()::text
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Apagar: só o que a própria pessoa enviou.
create policy cartoes_img_apagar on storage.objects for delete to authenticated
  using (
    bucket_id = 'cartoes'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
