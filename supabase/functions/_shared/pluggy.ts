// Lógica compartilhada da importação do Meu Pluggy (somente leitura).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { addDays, day, http, monthOf, r2, todayISO, UserError } from "./http.ts";
import { criarIndexadores, rentab12 } from "./rentab.ts";

const PLUGGY = "https://api.pluggy.ai";
const CLIENT_ID = Deno.env.get("PLUGGY_CLIENT_ID") || "";
const CLIENT_SECRET = Deno.env.get("PLUGGY_CLIENT_SECRET") || "";

let apiKey = "";
let apiKeyAt = 0;

async function pluggyKey(force = false) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new UserError("A integração com a Pluggy ainda não foi configurada no servidor (PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET).");
  }
  if (!force && apiKey && Date.now() - apiKeyAt < 100 * 60 * 1000) return apiKey;
  try {
    const data = await http(`${PLUGGY}/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
    });
    apiKey = data.apiKey;
    apiKeyAt = Date.now();
    return apiKey;
  } catch (e) {
    const s = (e as { status?: number }).status;
    if (s === 400 || s === 401 || s === 403) throw new UserError("A Pluggy recusou o Client ID ou o Client Secret configurados.");
    throw e;
  }
}

async function pluggy(path: string, params: Record<string, string | number | undefined> = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)]),
  ).toString();
  for (let attempt = 0; attempt < 2; attempt++) {
    const key = await pluggyKey(attempt > 0);
    try {
      return await http(`${PLUGGY}/${path}${qs ? `?${qs}` : ""}`, { headers: { "X-API-KEY": key } });
    } catch (e) {
      const s = (e as { status?: number }).status;
      if ((s === 401 || s === 403) && attempt === 0) continue;
      if (s === 404) throw new UserError(`A Pluggy não encontrou ${path}. Confira o Item ID.`);
      throw e;
    }
  }
}

const last4 = (s: unknown) => {
  const d = String(s || "").replace(/\D/g, "");
  return d ? d.slice(-4) : null;
};

const INTERNO_CATEGORIA =
  /(same person|mesma titularidade|transfer[eê]ncias? (entre contas|pr[oó]prias?)|credit card payment|pagamento de (fatura|cart[aã]o)|^investments?$|^investimentos?$|aplica[cç][aã]o|resgate)/i;
const INTERNO_DESCRICAO =
  /(pagamento (de )?fatura|pgto\.? ?fat|pag\.? fatura|pagto cart|pagamento cart[aã]o|aplica[cç][aã]o|resgate|transf(er[eê]ncia)?\.? (entre contas|mesma tit))/i;

const CLASSE: Record<string, string> = {
  TREASURY: "Tesouro Direto", CDB: "CDB", LCI: "LCI", LCA: "LCA", CRI: "CRI", CRA: "CRA", LC: "LC",
  DEBENTURES: "Debêntures", STOCK: "Ações", REAL_ESTATE_FUND: "FII", BDR: "BDR", ETF: "ETF",
  RETIREMENT: "Previdência", FIXED_INCOME_FUND: "Fundo de renda fixa", MULTIMARKET_FUND: "Fundo multimercado",
  STOCK_FUND: "Fundo de ações", INVESTMENT_FUND: "Fundo de investimento",
};
const TIPO: Record<string, string> = {
  FIXED_INCOME: "Renda fixa", MUTUAL_FUND: "Fundos", EQUITY: "Ações e FIIs", ETF: "ETFs",
  SECURITY: "Previdência", COE: "COE", OTHER: "Outros",
};

export async function sincronizar(itemIds: string[], userId: string) {
  const hoje = todayISO();
  const desde = `${monthOf(addDays(`${hoje.slice(0, 7)}-15`, -62))}-01`; // início de dois meses atrás
  const contas: any[] = [];
  const cartoes: any[] = [];
  const investimentos: any[] = [];
  const indexadores = criarIndexadores(hoje);
  const transacoes: any[] = [];
  const falhas: any[] = [];

  let categorias = new Map<string, string>();
  try {
    const r = await pluggy("categories");
    categorias = new Map((r.results || []).map((c: any) => [c.id, c.descriptionTranslated || c.description]));
  } catch {
    // segue sem tradução
  }

  for (const itemId of itemIds) {
    let item: any;
    try {
      item = await pluggy(`items/${encodeURIComponent(itemId)}`);
    } catch (e) {
      falhas.push({ itemId, erro: (e as Error).message });
      continue;
    }
    // Conexões feitas pelo app carregam o id de quem conectou; outra pessoa não pode usá-las.
    if (item?.clientUserId && item.clientUserId !== userId) {
      falhas.push({ itemId, erro: "Esta conexão pertence a outra pessoa." });
      continue;
    }
    const conexao = item?.connector?.name || null;
    try {
      const page = await pluggy("accounts", { itemId });
      for (const a of page.results || []) {
        const nome = a.marketingName || a.name;
        if (a.type === "CREDIT") {
          const c = a.creditData || {};
          cartoes.push({
            id: a.id, itemId, conexao, nome, final: last4(a.number), bandeira: c.brand || null,
            limite: r2(c.creditLimit), disponivel: r2(c.availableCreditLimit), fatura: r2(a.balance),
            fechamento: day(c.balanceCloseDate), vencimento: day(c.balanceDueDate), minimo: r2(c.minimumPayment),
          });
        } else {
          contas.push({
            id: a.id, itemId, conexao, nome, final: last4(a.number),
            tipo: a.subtype === "SAVINGS_ACCOUNT" ? "Poupança" : "Conta corrente", saldo: r2(a.balance),
          });
        }
        try {
          let p = 1;
          let total = 1;
          do {
            const r = await pluggy("transactions", { accountId: a.id, from: desde, to: hoje, pageSize: 500, page: p });
            for (const t of r.results || []) {
              const valor = (t.type === "DEBIT" ? -1 : 1) * Math.abs(Number(t.amount) || 0);
              const categoria = (t.categoryId && categorias.get(t.categoryId)) || t.category || "Sem categoria";
              transacoes.push({
                data: day(t.date), descricao: t.description,
                comerciante: t.merchant?.name || t.merchant?.businessName || null,
                valor: r2(valor), categoria, conta: nome,
                interno: INTERNO_CATEGORIA.test(t.category || "") || INTERNO_CATEGORIA.test(categoria) ||
                  INTERNO_DESCRICAO.test(t.description || ""),
              });
            }
            total = r.totalPages || 1;
            p += 1;
          } while (p <= total && p <= 20);
        } catch (e) {
          falhas.push({ conta: nome, erro: (e as Error).message });
        }
      }
    } catch (e) {
      falhas.push({ itemId, erro: (e as Error).message });
    }
    try {
      let p = 1;
      let total = 1;
      do {
        const r = await pluggy("investments", { itemId, pageSize: 500, page: p });
        for (const v of r.results || []) {
          if (v.status === "TOTAL_WITHDRAWAL") continue;
          const rt = await rentab12(v, indexadores);
          investimentos.push({
            id: v.id, conexao, nome: v.name, classe: CLASSE[v.subtype] || TIPO[v.type] || v.type,
            instituicao: v.institution?.name || v.issuer || conexao || "", valor: r2(v.balance),
            aplicado: r2(v.amountOriginal), rentab12m: rt ? r2(rt.valor) : null,
            rentabNota: rt?.nota || null, rentabFonte: rt?.fonte || null,
            indexador: v.rateType || null, taxa: v.rate ?? null, taxaPre: v.fixedAnnualRate ?? null,
            aplicadoEm: day(v.purchaseDate || v.issueDate),
            vencimento: day(v.dueDate), dataReferencia: day(v.date),
          });
        }
        total = r.totalPages || 1;
        p += 1;
      } while (p <= total && p <= 10);
    } catch (e) {
      falhas.push({ itemId, investimentos: true, erro: (e as Error).message });
    }
  }

  // Resumo por mês, sem movimentos internos.
  const meses = new Map<string, any[]>();
  for (const t of transacoes) {
    if (t.interno || !t.data) continue;
    const m = monthOf(t.data);
    if (!meses.has(m)) meses.set(m, []);
    meses.get(m)!.push(t);
  }
  const gastos = [...meses.entries()].map(([mes, list]) => {
    const saidas = list.filter((t) => t.valor < 0);
    const entradas = list.filter((t) => t.valor > 0);
    const totalSaidas = saidas.reduce((s, t) => s + Math.abs(t.valor), 0);
    const porCat = new Map<string, number>();
    for (const t of saidas) porCat.set(t.categoria, (porCat.get(t.categoria) || 0) + Math.abs(t.valor));
    return {
      mes,
      saidas: r2(totalSaidas),
      entradas: r2(entradas.reduce((s, t) => s + t.valor, 0)),
      por_categoria: [...porCat.entries()]
        .map(([categoria, total]) => ({ categoria, total: r2(total) }))
        .sort((a, b) => (b.total as number) - (a.total as number)),
      maiores: saidas
        .slice()
        .sort((a, b) => a.valor - b.valor)
        .slice(0, 10)
        .map((t) => ({ data: t.data, descricao: t.comerciante || t.descricao, valor: t.valor, categoria: t.categoria })),
    };
  });

  // Prováveis assinaturas: mesma descrição em 2+ meses com valor estável.
  const norm = (s: string) => String(s || "").toLowerCase().replace(/[0-9*#./-]+/g, " ").replace(/\s+/g, " ").trim();
  const grupos = new Map<string, { descricao: string; meses: Set<string>; valores: number[] }>();
  for (const t of transacoes) {
    if (t.interno || t.valor >= 0) continue;
    const k = norm(t.comerciante || t.descricao);
    if (!k) continue;
    const g = grupos.get(k) || { descricao: t.comerciante || t.descricao, meses: new Set(), valores: [] };
    g.meses.add(monthOf(t.data));
    g.valores.push(Math.abs(t.valor));
    grupos.set(k, g);
  }
  const assinaturas = [...grupos.values()]
    .filter((g) => g.meses.size >= 2)
    .map((g) => ({
      descricao: g.descricao,
      valor: r2(g.valores.reduce((s, v) => s + v, 0) / g.valores.length),
      variacao: Math.max(...g.valores) - Math.min(...g.valores),
    }))
    .filter((g) => g.variacao <= Math.max(5, (g.valor as number) * 0.15))
    .sort((a, b) => (b.valor as number) - (a.valor as number))
    .slice(0, 15)
    .map(({ descricao, valor }) => ({ descricao, valor }));

  return { contas, cartoes, investimentos, gastos, assinaturas, falhas };
}


// Assinatura do endereço do webhook, derivada do Client Secret (nenhum segredo novo).
export async function assinaturaWebhook(): Promise<string> {
  if (!CLIENT_SECRET) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(CLIENT_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("casa-em-dia/pluggy-webhook"));
  return [...new Uint8Array(sig)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function webhookUrl(): Promise<string | undefined> {
  const s = await assinaturaWebhook();
  return s ? `${Deno.env.get("SUPABASE_URL")}/functions/v1/pluggy-webhook?s=${s}` : undefined;
}

// Busca os dados de todas as conexões da pessoa e grava nas tabelas privadas dela.
export async function sincronizarUsuario(admin: SupabaseClient, userId: string) {
  const { data: itens, error } = await admin.from("pluggy_itens").select("item_id").eq("user_id", userId);
  if (error) throw error;
  if (!itens?.length) throw new UserError("Conecte pelo menos um banco em Ajustes.");
  const r = await sincronizar(itens.map((i: { item_id: string }) => i.item_id), userId);
  const agora = new Date().toISOString();
  const { error: e1 } = await admin.from("importacoes").upsert({
    user_id: userId, atualizado_em: agora, fonte: "Meu Pluggy",
    contas: r.contas, cartoes: r.cartoes, investimentos: r.investimentos, falhas: r.falhas,
  });
  if (e1) throw e1;
  if (r.gastos.length) {
    const { error: e2 } = await admin.from("gastos_mensais").upsert(
      r.gastos.map((g) => ({ user_id: userId, ...g, assinaturas: r.assinaturas, atualizado_em: agora })),
    );
    if (e2) throw e2;
  }
  return { atualizadoEm: agora, contas: r.contas.length, cartoes: r.cartoes.length, investimentos: r.investimentos.length, meses: r.gastos.length, falhas: r.falhas };
}
