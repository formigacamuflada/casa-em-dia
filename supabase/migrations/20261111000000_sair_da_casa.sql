-- Sair da casa.
--
-- Caso comum: a pessoa criou uma casa por engano e quer entrar no convite da
-- outra. Regras:
--   * se ela está sozinha na casa, a casa inteira é apagada (contas, cartões,
--     metas, aportes e acertos dela vão junto);
--   * se a outra pessoa também está na casa, só a vaga de quem sai fica livre;
--     as contas e cartões pessoais de quem saiu são apagados (ninguém mais
--     conseguiria vê-los) e o que é da casa fica para quem continua.
-- Investimentos, dia a dia e bancos conectados são da pessoa, não da casa, e
-- continuam com ela.

create or replace function public.sair_da_casa()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membro membros%rowtype;
  v_outros int;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta antes de sair da casa.';
  end if;
  select * into v_membro from membros where user_id = auth.uid() for update;
  if v_membro.id is null then
    raise exception 'Você não faz parte de nenhuma casa.';
  end if;

  select count(*) into v_outros from membros
    where casa_id = v_membro.casa_id and user_id is not null and user_id <> auth.uid();

  if v_outros = 0 then
    delete from casas where id = v_membro.casa_id;
    return;
  end if;

  delete from contas where casa_id = v_membro.casa_id and escopo = 'pessoal' and dono_id = auth.uid();
  delete from cartoes where casa_id = v_membro.casa_id and escopo = 'pessoal' and dono_id = auth.uid();
  update membros
    set user_id = null, entrou_em = null, renda = null
    where id = v_membro.id;
  -- Código novo: quem saiu não consegue voltar com o código antigo.
  update casas
    set codigo_convite = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
    where id = v_membro.casa_id;
end;
$$;

-- Entrar pelo convite ocupa qualquer vaga livre (antes só a 'b'), para que a
-- vaga de quem saiu possa ser preenchida de novo.
create or replace function public.entrar_na_casa(p_codigo text, p_apelido text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_casa uuid;
  v_membro uuid;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta antes de usar o convite.';
  end if;
  if exists (select 1 from membros where user_id = auth.uid()) then
    raise exception 'Você já faz parte de uma casa. Para usar este convite, vá em Ajustes e toque em Sair da casa.';
  end if;
  select id into v_casa from casas where codigo_convite = upper(trim(p_codigo));
  if v_casa is null then
    raise exception 'Código de convite não encontrado. Confira as 8 letras e números.';
  end if;
  select id into v_membro from membros
    where casa_id = v_casa and user_id is null
    order by vaga
    limit 1
    for update;
  if v_membro is null then
    raise exception 'Esta casa já tem duas pessoas.';
  end if;
  update membros
    set user_id = auth.uid(),
        entrou_em = now(),
        apelido = case when nullif(trim(p_apelido), '') is not null then trim(p_apelido) else apelido end
    where id = v_membro;
  return v_casa;
end;
$$;

create or replace function public.criar_casa(p_apelido text default '')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_casa uuid;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta antes de criar a casa.';
  end if;
  if exists (select 1 from membros where user_id = auth.uid()) then
    raise exception 'Você já faz parte de uma casa. Para trocar de casa, vá em Ajustes e toque em Sair da casa.';
  end if;
  insert into casas default values returning id into v_casa;
  insert into membros (casa_id, user_id, vaga, apelido, entrou_em)
    values (v_casa, auth.uid(), 'a', coalesce(nullif(trim(p_apelido), ''), ''), now());
  insert into membros (casa_id, vaga) values (v_casa, 'b');
  return v_casa;
end;
$$;

revoke all on function public.sair_da_casa() from public, anon;
grant execute on function public.sair_da_casa() to authenticated;
