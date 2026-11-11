-- Casa em Dia: esquema inicial.
--
-- Regra de privacidade (definida pelo casal):
--   * contas e cartões com escopo 'casa'     -> os dois veem e editam
--   * contas e cartões com escopo 'pessoal'  -> só quem lançou vê
--   * renda de cada um                       -> os dois veem
--   * investimentos, dia a dia, importações  -> só o dono vê
--   * metas, aportes e acertos               -> os dois veem
-- Tudo é garantido pelo banco (Row Level Security), não pelo app.


-- ---------------------------------------------------------------- casas

create table public.casas (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Nossa casa' check (char_length(nome) between 1 and 60),
  codigo_convite text not null unique
    default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  divisao text not null default '50/50',
  criado_em timestamptz not null default now()
);

-- Duas vagas por casa: 'a' (quem criou) e 'b' (quem entra pelo convite).
-- A vaga 'b' existe desde a criação, sem usuário, para a divisão funcionar
-- antes de a segunda pessoa entrar.
create table public.membros (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null references public.casas (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,
  vaga text not null check (vaga in ('a', 'b')),
  apelido text not null default '' check (char_length(apelido) <= 40),
  renda numeric(12, 2) check (renda is null or renda >= 0),
  entrou_em timestamptz,
  unique (casa_id, vaga)
);

-- Casa da pessoa logada. security definer evita recursão nas políticas.
create or replace function public.minha_casa()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select casa_id from public.membros where user_id = auth.uid() limit 1
$$;

create or replace function public.minha_vaga()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select vaga from public.membros where user_id = auth.uid() limit 1
$$;

alter table public.casas enable row level security;
alter table public.membros enable row level security;

create policy casas_ver on public.casas
  for select to authenticated using (id = public.minha_casa());
create policy casas_editar on public.casas
  for update to authenticated using (id = public.minha_casa()) with check (id = public.minha_casa());

create policy membros_ver on public.membros
  for select to authenticated using (casa_id = public.minha_casa());
-- Cada um edita a própria linha (renda, apelido); a vaga ainda vazia pode ser
-- preenchida por quem já está na casa (apelido e renda provisórios).
create policy membros_editar on public.membros
  for update to authenticated
  using (casa_id = public.minha_casa() and (user_id = auth.uid() or user_id is null))
  with check (casa_id = public.minha_casa() and (user_id = auth.uid() or user_id is null));

-- Criar casa: quem chama vira a vaga 'a'.
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
    raise exception 'Você já faz parte de uma casa.';
  end if;
  insert into casas default values returning id into v_casa;
  insert into membros (casa_id, user_id, vaga, apelido, entrou_em)
    values (v_casa, auth.uid(), 'a', coalesce(nullif(trim(p_apelido), ''), ''), now());
  insert into membros (casa_id, vaga) values (v_casa, 'b');
  return v_casa;
end;
$$;

-- Entrar pelo código de convite: ocupa a vaga 'b'.
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
    raise exception 'Você já faz parte de uma casa.';
  end if;
  select id into v_casa from casas where codigo_convite = upper(trim(p_codigo));
  if v_casa is null then
    raise exception 'Código de convite não encontrado. Confira as 8 letras e números.';
  end if;
  select id into v_membro from membros
    where casa_id = v_casa and vaga = 'b' and user_id is null
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

-- Gera um código novo (por exemplo, se o antigo vazou).
create or replace function public.novo_codigo_convite()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
begin
  update casas set codigo_convite = v_codigo where id = public.minha_casa();
  return v_codigo;
end;
$$;

-- ---------------------------------------------------------------- contas

create table public.contas (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null default public.minha_casa() references public.casas (id) on delete cascade,
  dono_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  escopo text not null check (escopo in ('casa', 'pessoal')),
  nome text not null check (char_length(nome) between 1 and 80),
  valor numeric(12, 2) not null check (valor >= 0),
  dia smallint not null check (dia between 1 and 31),
  categoria text not null default 'outros',
  recorrente boolean not null default true,
  inicio text not null check (inicio ~ '^\d{4}-\d{2}$'),
  fim text check (fim is null or fim ~ '^\d{4}-\d{2}$'),
  mes text check (mes is null or mes ~ '^\d{4}-\d{2}$'),
  pagador text check (pagador is null or pagador in ('a', 'b')),
  valores jsonb not null default '{}'::jsonb,
  pagos jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index contas_casa_idx on public.contas (casa_id);

-- ---------------------------------------------------------------- cartões

create table public.cartoes (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null default public.minha_casa() references public.casas (id) on delete cascade,
  dono_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  escopo text not null check (escopo in ('casa', 'pessoal')),
  banco text not null check (char_length(banco) between 1 and 40),
  apelido text not null default '' check (char_length(apelido) <= 40),
  final text check (final is null or final ~ '^\d{4}$'),
  bandeira text,
  cor text not null default 'petroleo',
  limite numeric(12, 2) check (limite is null or limite >= 0),
  fechamento smallint check (fechamento is null or fechamento between 1 and 31),
  vencimento smallint not null check (vencimento between 1 and 31),
  somar_nas_contas boolean not null default true,
  pagador text check (pagador is null or pagador in ('a', 'b')),
  faturas jsonb not null default '{}'::jsonb,
  pagos jsonb not null default '{}'::jsonb,
  origem jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index cartoes_casa_idx on public.cartoes (casa_id);

alter table public.contas enable row level security;
alter table public.cartoes enable row level security;

-- Mesma regra para contas e cartões.
create policy contas_ver on public.contas for select to authenticated
  using (casa_id = public.minha_casa() and (escopo = 'casa' or dono_id = auth.uid()));
create policy contas_criar on public.contas for insert to authenticated
  with check (casa_id = public.minha_casa() and dono_id = auth.uid());
create policy contas_editar on public.contas for update to authenticated
  using (casa_id = public.minha_casa() and (escopo = 'casa' or dono_id = auth.uid()))
  with check (casa_id = public.minha_casa() and (escopo = 'casa' or dono_id = auth.uid()));
create policy contas_apagar on public.contas for delete to authenticated
  using (casa_id = public.minha_casa() and (escopo = 'casa' or dono_id = auth.uid()));

create policy cartoes_ver on public.cartoes for select to authenticated
  using (casa_id = public.minha_casa() and (escopo = 'casa' or dono_id = auth.uid()));
create policy cartoes_criar on public.cartoes for insert to authenticated
  with check (casa_id = public.minha_casa() and dono_id = auth.uid());
create policy cartoes_editar on public.cartoes for update to authenticated
  using (casa_id = public.minha_casa() and (escopo = 'casa' or dono_id = auth.uid()))
  with check (casa_id = public.minha_casa() and (escopo = 'casa' or dono_id = auth.uid()));
create policy cartoes_apagar on public.cartoes for delete to authenticated
  using (casa_id = public.minha_casa() and (escopo = 'casa' or dono_id = auth.uid()));

-- Alterações atômicas por mês (security invoker: as políticas acima valem).
create or replace function public.marcar_pago(p_tabela text, p_id uuid, p_mes text, p_pago boolean)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_mes !~ '^\d{4}-\d{2}$' then raise exception 'Mês inválido.'; end if;
  if p_tabela = 'contas' then
    update contas set
      pagos = case when p_pago then pagos || jsonb_build_object(p_mes, jsonb_build_object('em', now(), 'por', public.minha_vaga()))
                   else pagos - p_mes end,
      atualizado_em = now()
    where id = p_id;
  elsif p_tabela = 'cartoes' then
    update cartoes set
      pagos = case when p_pago then pagos || jsonb_build_object(p_mes, jsonb_build_object('em', now(), 'por', public.minha_vaga()))
                   else pagos - p_mes end,
      atualizado_em = now()
    where id = p_id;
  else
    raise exception 'Tabela inválida.';
  end if;
end;
$$;

-- Valor de um mês específico (conta variável) ou fatura do cartão no mês.
create or replace function public.definir_valor_mes(p_tabela text, p_id uuid, p_mes text, p_valor numeric)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_mes !~ '^\d{4}-\d{2}$' then raise exception 'Mês inválido.'; end if;
  if p_valor is not null and p_valor < 0 then raise exception 'Valor não pode ser negativo.'; end if;
  if p_tabela = 'contas' then
    update contas set
      valores = case when p_valor is null then valores - p_mes else valores || jsonb_build_object(p_mes, p_valor) end,
      atualizado_em = now()
    where id = p_id;
  elsif p_tabela = 'cartoes' then
    update cartoes set
      faturas = case when p_valor is null then faturas - p_mes else faturas || jsonb_build_object(p_mes, p_valor) end,
      atualizado_em = now()
    where id = p_id;
  else
    raise exception 'Tabela inválida.';
  end if;
end;
$$;

-- ---------------------------------------------------------------- metas, aportes, acertos (os dois veem)

create table public.metas (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null default public.minha_casa() references public.casas (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  alvo numeric(14, 2) check (alvo is null or alvo > 0),
  prazo text check (prazo is null or prazo ~ '^\d{4}-\d{2}$'),
  inicial numeric(14, 2) not null default 0 check (inicial >= 0),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create table public.aportes (
  id uuid primary key default gen_random_uuid(),
  casa_id uuid not null default public.minha_casa() references public.casas (id) on delete cascade,
  meta_id uuid not null references public.metas (id) on delete cascade,
  valor numeric(14, 2) not null check (valor <> 0),
  data date not null default current_date,
  por text check (por is null or por in ('a', 'b')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);

create table public.acertos (
  casa_id uuid not null default public.minha_casa() references public.casas (id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  valor numeric(12, 2) not null,
  de text check (de is null or de in ('a', 'b')),
  para text check (para is null or para in ('a', 'b')),
  feito_em timestamptz not null default now(),
  feito_por uuid default auth.uid(),
  primary key (casa_id, mes)
);

alter table public.metas enable row level security;
alter table public.aportes enable row level security;
alter table public.acertos enable row level security;

create policy metas_casa on public.metas for all to authenticated
  using (casa_id = public.minha_casa()) with check (casa_id = public.minha_casa());
create policy aportes_casa on public.aportes for all to authenticated
  using (casa_id = public.minha_casa()) with check (casa_id = public.minha_casa());
create policy acertos_casa on public.acertos for all to authenticated
  using (casa_id = public.minha_casa()) with check (casa_id = public.minha_casa());

-- ---------------------------------------------------------------- privado

create table public.preferencias (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  dia_a_dia numeric(12, 2) not null default 0 check (dia_a_dia >= 0),
  atualizado_em timestamptz not null default now()
);

create table public.investimentos (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  classe text not null default 'Renda fixa',
  instituicao text not null default '',
  valor numeric(14, 2) not null check (valor >= 0),
  aplicado numeric(14, 2) check (aplicado is null or aplicado >= 0),
  rentab_12m numeric(8, 2),
  vencimento date,
  liquidez text not null default '',
  atualizado_em timestamptz not null default now()
);

-- Item IDs do Meu Pluggy de cada pessoa (um por banco).
create table public.pluggy_itens (
  item_id text primary key check (char_length(item_id) between 8 and 80),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  apelido text not null default '',
  criado_em timestamptz not null default now()
);

-- Escritas só pela função de sincronização (service role).
create table public.importacoes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  atualizado_em timestamptz not null default now(),
  fonte text not null default 'Meu Pluggy',
  contas jsonb not null default '[]'::jsonb,
  cartoes jsonb not null default '[]'::jsonb,
  investimentos jsonb not null default '[]'::jsonb,
  falhas jsonb not null default '[]'::jsonb
);

create table public.gastos_mensais (
  user_id uuid not null references auth.users (id) on delete cascade,
  mes text not null check (mes ~ '^\d{4}-\d{2}$'),
  saidas numeric(14, 2) not null default 0,
  entradas numeric(14, 2) not null default 0,
  por_categoria jsonb not null default '[]'::jsonb,
  maiores jsonb not null default '[]'::jsonb,
  assinaturas jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (user_id, mes)
);

alter table public.preferencias enable row level security;
alter table public.investimentos enable row level security;
alter table public.pluggy_itens enable row level security;
alter table public.importacoes enable row level security;
alter table public.gastos_mensais enable row level security;

create policy preferencias_dono on public.preferencias for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy investimentos_dono on public.investimentos for all to authenticated
  using (dono_id = auth.uid()) with check (dono_id = auth.uid());
create policy pluggy_itens_dono on public.pluggy_itens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy importacoes_dono on public.importacoes for select to authenticated
  using (user_id = auth.uid());
create policy gastos_dono on public.gastos_mensais for select to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------- mercado (dados públicos do Banco Central)

create table public.mercado (
  id text primary key default 'atual',
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.mercado enable row level security;
create policy mercado_ler on public.mercado for select to authenticated using (true);

-- ---------------------------------------------------------------- tempo real

alter publication supabase_realtime add table
  public.membros, public.casas, public.contas, public.cartoes, public.metas,
  public.aportes, public.acertos, public.investimentos, public.preferencias,
  public.importacoes, public.gastos_mensais, public.mercado;

-- ---------------------------------------------------------------- permissões de API

revoke all on function public.criar_casa(text) from public, anon;
revoke all on function public.entrar_na_casa(text, text) from public, anon;
revoke all on function public.novo_codigo_convite() from public, anon;
revoke all on function public.marcar_pago(text, uuid, text, boolean) from public, anon;
revoke all on function public.definir_valor_mes(text, uuid, text, numeric) from public, anon;
grant execute on function public.criar_casa(text) to authenticated;
grant execute on function public.entrar_na_casa(text, text) to authenticated;
grant execute on function public.novo_codigo_convite() to authenticated;
grant execute on function public.marcar_pago(text, uuid, text, boolean) to authenticated;
grant execute on function public.definir_valor_mes(text, uuid, text, numeric) to authenticated;
