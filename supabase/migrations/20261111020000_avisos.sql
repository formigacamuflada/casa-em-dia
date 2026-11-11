-- Avisos (sininho): o que a outra pessoa mudou nas coisas da casa.
--
-- Cada mudança gera um aviso para cada outra pessoa da casa. Só entra o que os
-- dois já veem: contas e cartões da casa, metas, aportes, acertos e a casa em si
-- (renda, quem entrou ou saiu). Contas e cartões pessoais e investimentos nunca
-- geram aviso. Quem fez a mudança não recebe aviso dela.
--
-- Os avisos são escritos só pelos gatilhos (security definer); cada pessoa só lê
-- os próprios e só pode marcar como lido.

create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas (id) on delete cascade,
  destino_id uuid not null references auth.users (id) on delete cascade,
  autor_vaga text check (autor_vaga is null or autor_vaga in ('a', 'b')),
  autor_nome text not null default '',
  acao text not null,
  tabela text,
  ref text,
  dados jsonb not null default '{}'::jsonb,
  juntar text,
  criado_em timestamptz not null default now(),
  lido_em timestamptz
);
create index avisos_destino_idx on public.avisos (destino_id, criado_em desc);
create index avisos_juntar_idx on public.avisos (destino_id, juntar) where lido_em is null;

alter table public.avisos enable row level security;
create policy avisos_ver on public.avisos for select to authenticated
  using (destino_id = auth.uid() and casa_id = public.minha_casa());
create policy avisos_ler on public.avisos for update to authenticated
  using (destino_id = auth.uid() and casa_id = public.minha_casa())
  with check (destino_id = auth.uid() and casa_id = public.minha_casa());

revoke all on public.avisos from anon, authenticated;
grant select on public.avisos to authenticated;
grant update (lido_em) on public.avisos to authenticated;

-- Grava o aviso para as outras pessoas da casa.
-- p_juntar: mudanças repetidas na mesma coisa (marcar e desmarcar como paga,
-- por exemplo) atualizam o aviso ainda não lido em vez de criar outro.
create or replace function public.avisar(
  p_casa uuid, p_acao text, p_tabela text, p_ref text, p_dados jsonb,
  p_juntar text default null, p_vaga text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor uuid := auth.uid();
  v_vaga text := p_vaga;
  v_nome text := '';
  v_dest uuid;
begin
  -- Sem pessoa logada (sincronização dos bancos, tarefas do servidor): sem aviso.
  if v_autor is null or p_casa is null then return; end if;
  -- Casa sendo apagada (exclusão em cascata): sem aviso.
  if not exists (select 1 from casas where id = p_casa) then return; end if;
  if v_vaga is null then
    select vaga into v_vaga from membros where casa_id = p_casa and user_id = v_autor;
    if v_vaga is null then return; end if;
  end if;
  select apelido into v_nome from membros where casa_id = p_casa and vaga = v_vaga;

  for v_dest in
    select user_id from membros where casa_id = p_casa and user_id is not null and user_id <> v_autor
  loop
    if p_juntar is not null then
      update avisos
        set acao = p_acao, dados = p_dados, autor_nome = coalesce(v_nome, ''), criado_em = now()
        where destino_id = v_dest and juntar = p_juntar and lido_em is null
          and criado_em > now() - interval '15 minutes';
      if found then continue; end if;
    end if;
    insert into avisos (casa_id, destino_id, autor_vaga, autor_nome, acao, tabela, ref, dados, juntar)
    values (p_casa, v_dest, v_vaga, coalesce(v_nome, ''), p_acao, p_tabela, p_ref, coalesce(p_dados, '{}'::jsonb), p_juntar);
  end loop;

  -- Faxina: avisos com mais de 90 dias saem.
  delete from avisos where casa_id = p_casa and criado_em < now() - interval '90 days';
end;
$$;
revoke all on function public.avisar(uuid, text, text, text, jsonb, text, text) from public, anon, authenticated;

-- Contas e cartões (mesma estrutura: escopo, pagos e valores/faturas por mês).
create or replace function public.avisos_contas_cartoes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := tg_table_name;
  n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  r jsonb := coalesce(n, o);
  v_mapa text := case when t = 'contas' then 'valores' else 'faturas' end;
  v_nome text;
  v_base jsonb;
  v_ignorar text[] := array['pagos', 'valores', 'faturas', 'atualizado_em', 'criado_em', 'origem', 'escopo'];
  k text;
begin
  v_nome := case when t = 'contas' then r->>'nome' else coalesce(nullif(r->>'apelido', ''), r->>'banco') end;
  v_base := jsonb_build_object('nome', v_nome);

  if tg_op = 'INSERT' then
    if n->>'escopo' = 'casa' then
      perform avisar((n->>'casa_id')::uuid, 'criou', t, n->>'id',
        v_base || jsonb_build_object('valor', n->'valor', 'dia', coalesce(n->'dia', n->'vencimento')));
    end if;
    return null;
  end if;

  if tg_op = 'DELETE' then
    if o->>'escopo' = 'casa' then
      perform avisar((o->>'casa_id')::uuid, 'apagou', t, o->>'id', v_base);
    end if;
    return null;
  end if;

  -- UPDATE
  if o->>'escopo' = 'pessoal' and n->>'escopo' = 'casa' then
    perform avisar((n->>'casa_id')::uuid, 'dividiu', t, n->>'id', v_base);
    return null;
  end if;
  if o->>'escopo' = 'casa' and n->>'escopo' = 'pessoal' then
    perform avisar((n->>'casa_id')::uuid, 'tirou', t, n->>'id', v_base);
    return null;
  end if;
  if n->>'escopo' <> 'casa' then return null; end if;

  -- Paga / desmarcada, mês a mês.
  for k in
    select key from jsonb_object_keys(coalesce(n->'pagos', '{}')) as key
    where not coalesce(o->'pagos', '{}') ? key
  loop
    perform avisar((n->>'casa_id')::uuid, 'pago', t, n->>'id', v_base || jsonb_build_object('mes', k, 'pago', true),
      t || ':' || (n->>'id') || ':pago:' || k);
  end loop;
  for k in
    select key from jsonb_object_keys(coalesce(o->'pagos', '{}')) as key
    where not coalesce(n->'pagos', '{}') ? key
  loop
    perform avisar((n->>'casa_id')::uuid, 'pago', t, n->>'id', v_base || jsonb_build_object('mes', k, 'pago', false),
      t || ':' || (n->>'id') || ':pago:' || k);
  end loop;

  -- Valor do mês (conta variável) ou fatura do cartão.
  for k in
    select key from (
      select key from jsonb_object_keys(coalesce(n->v_mapa, '{}')) as key
      union
      select key from jsonb_object_keys(coalesce(o->v_mapa, '{}')) as key
    ) as todas
    where (n->v_mapa->key) is distinct from (o->v_mapa->key)
  loop
    perform avisar((n->>'casa_id')::uuid, 'valor_mes', t, n->>'id', v_base || jsonb_build_object('mes', k, 'valor', n->v_mapa->k),
      t || ':' || (n->>'id') || ':valor:' || k);
  end loop;

  -- Demais campos (nome, valor, dia, quem paga, limite...).
  if (n - v_ignorar) is distinct from (o - v_ignorar) then
    perform avisar((n->>'casa_id')::uuid, 'editou', t, n->>'id', v_base, t || ':' || (n->>'id') || ':editou');
  end if;
  return null;
end;
$$;

create trigger contas_avisos after insert or update or delete on public.contas
  for each row execute function public.avisos_contas_cartoes();
create trigger cartoes_avisos after insert or update or delete on public.cartoes
  for each row execute function public.avisos_contas_cartoes();

-- Metas.
create or replace function public.avisos_metas()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform avisar(new.casa_id, 'meta_criou', 'metas', new.id::text, jsonb_build_object('nome', new.nome, 'alvo', new.alvo));
  elsif tg_op = 'DELETE' then
    perform avisar(old.casa_id, 'meta_apagou', 'metas', old.id::text, jsonb_build_object('nome', old.nome));
  elsif (new.nome, new.alvo, new.prazo, new.inicial) is distinct from (old.nome, old.alvo, old.prazo, old.inicial) then
    perform avisar(new.casa_id, 'meta_editou', 'metas', new.id::text, jsonb_build_object('nome', new.nome), 'metas:' || new.id || ':editou');
  end if;
  return null;
end;
$$;
create trigger metas_avisos after insert or update or delete on public.metas
  for each row execute function public.avisos_metas();

-- Aportes nas metas.
create or replace function public.avisos_aportes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meta text;
  r aportes%rowtype := case when tg_op = 'DELETE' then old else new end;
begin
  select nome into v_meta from metas where id = r.meta_id;
  -- Meta apagada junto (cascata): o aviso da meta já basta.
  if v_meta is null then return null; end if;
  if tg_op = 'INSERT' then
    perform avisar(r.casa_id, 'aporte', 'aportes', r.meta_id::text, jsonb_build_object('meta', v_meta, 'valor', r.valor));
  elsif tg_op = 'DELETE' then
    perform avisar(r.casa_id, 'aporte_apagou', 'aportes', r.meta_id::text, jsonb_build_object('meta', v_meta, 'valor', r.valor));
  end if;
  return null;
end;
$$;
create trigger aportes_avisos after insert or delete on public.aportes
  for each row execute function public.avisos_aportes();

-- Acerto do mês.
create or replace function public.avisos_acertos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform avisar(old.casa_id, 'acerto_desfeito', 'acertos', old.mes, jsonb_build_object('mes', old.mes), 'acertos:' || old.mes);
  else
    perform avisar(new.casa_id, 'acerto', 'acertos', new.mes,
      jsonb_build_object('mes', new.mes, 'valor', new.valor, 'de', new.de, 'para', new.para), 'acertos:' || new.mes);
  end if;
  return null;
end;
$$;
create trigger acertos_avisos after insert or update or delete on public.acertos
  for each row execute function public.avisos_acertos();

-- Pessoas da casa: entrou, saiu, renda.
create or replace function public.avisos_membros()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.user_id is null and new.user_id is not null then
    perform avisar(new.casa_id, 'entrou', 'membros', new.vaga, '{}'::jsonb);
  elsif old.user_id is not null and new.user_id is null then
    perform avisar(new.casa_id, 'saiu', 'membros', new.vaga, '{}'::jsonb, null, old.vaga);
  elsif new.user_id is not null and new.renda is distinct from old.renda then
    perform avisar(new.casa_id, 'renda', 'membros', new.vaga, '{}'::jsonb, 'membros:' || new.vaga || ':renda');
  end if;
  return null;
end;
$$;
create trigger membros_avisos after update on public.membros
  for each row execute function public.avisos_membros();

alter publication supabase_realtime add table public.avisos;
