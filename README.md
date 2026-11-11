# Casa em Dia

App de finanças do casal: contas da casa com divisão 50/50 e acerto no fim do mês, contas pessoais, cartões, moradia, investimentos, metas do casal e cenário econômico com dados do Banco Central.

- **iPhone e navegador:** https://formigacamuflada.github.io/casa-em-dia/. No Safari do iPhone, toque em Compartilhar e depois em **Adicionar à Tela de Início**.
- **Windows:** baixe o instalador `.exe` em [Releases](https://github.com/formigacamuflada/casa-em-dia/releases).

## Quem vê o quê

| Dado | Quem vê |
|---|---|
| Contas e cartões da casa, renda, metas, aportes, acerto | Os dois |
| Contas e cartões pessoais, dia a dia, investimentos, dados dos bancos | Só quem lançou |

A regra fica no banco de dados, com Row Level Security do Supabase (`supabase/migrations`), e não apenas na tela. A conta de uma pessoa não consegue ler, alterar nem apagar os dados pessoais da outra.

## Primeiro uso

1. Cada um cria a própria conta (e-mail e senha).
2. Um cria a casa. O código de convite aparece em **Ajustes**.
3. O outro escolhe **Entrar com convite** e digita o código.

## Bancos (Open Finance, somente leitura)

1. Conecte seus bancos no [Meu Pluggy](https://meu.pluggy.ai), autorizando no app de cada banco.
2. Em [dashboard.pluggy.ai](https://dashboard.pluggy.ai), crie uma aplicação. Em **Demo**, conecte pelo conector MeuPluggy e copie o **Item ID** de cada banco.
3. No GitHub (Settings → Secrets and variables → Actions), crie `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`. Depois rode a ação **Supabase (banco e funções)**.
4. No app, em **Ajustes → Bancos**, cole os Item IDs e toque em **Sincronizar**.

Cada pessoa cadastra os próprios Item IDs, e o resultado fica visível só para ela.

## Estrutura

```
src/                 app (Vite + JavaScript, sem framework)
src-tauri/           empacotamento para Windows (Tauri 2)
supabase/migrations  esquema e regras de privacidade
supabase/functions   mercado (Banco Central) e pluggy-sync (Open Finance)
extensao-claude/     extensão para o Claude Desktop (Pluggy + Banco Central)
.github/workflows    deploy do banco, do site e do instalador do Windows
```

## Publicação automática

| Ação | Quando roda | O que faz |
|---|---|---|
| Supabase (banco e funções) | push em `supabase/` | aplica as migrações, publica as funções e atualiza o mercado |
| App web | push em `main` | gera o site e publica no GitHub Pages |
| App do Windows | push em `main` | gera os instaladores `.exe` e `.msi` e anexa à release |
| Atualizar mercado | dias úteis, 10h17 | busca Selic, CDI, IPCA, dólar e Focus no Banco Central |

Segredos usados: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, e opcionalmente `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`. A chave pública (anon) do Supabase é obtida no build e protegida pelas regras do banco.

## Desenvolvimento

```bash
npm install
VITE_SUPABASE_ANON_KEY=... npm run dev     # site em http://localhost:5173
npm run tauri dev                          # janela do Windows (requer Rust)
```
