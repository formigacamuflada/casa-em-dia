-- Gastos do mês com mais detalhe: transações do mês (para abrir cada categoria)
-- e o estado de cada conexão do Meu Pluggy (quando o banco foi atualizado de fato).
-- As duas tabelas já são visíveis só para o dono (RLS em importacoes_dono e gastos_dono).
alter table public.gastos_mensais add column if not exists transacoes jsonb not null default '[]'::jsonb;
alter table public.importacoes add column if not exists itens jsonb not null default '[]'::jsonb;
