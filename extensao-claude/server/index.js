#!/usr/bin/env node
/**
 * Finanças do casal: servidor MCP somente leitura.
 *
 * - Open Finance pelo Meu Pluggy: conexões, contas, transações, resumo de gastos,
 *   faturas de cartão e investimentos.
 * - Dados públicos do Banco Central: séries do SGS, pesquisa Focus e PTAX.
 *
 * Nenhuma ferramenta movimenta dinheiro. A Pluggy só recebe POST /auth e GET.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const VERSION = "1.0.0";
const PLUGGY = "https://api.pluggy.ai";
const SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.";
const OLINDA = "https://olinda.bcb.gov.br/olinda/servico";

/* ------------------------------------------------------------------ config */

function cfg(name) {
  const v = String(process.env[name] || "").trim();
  // Campo opcional deixado em branco pode chegar como o placeholder literal.
  return v.startsWith("${") ? "" : v;
}
const CLIENT_ID = cfg("PLUGGY_CLIENT_ID");
const CLIENT_SECRET = cfg("PLUGGY_CLIENT_SECRET");
const ITEM_IDS = [...new Set(cfg("PLUGGY_ITEM_IDS").split(/[\s,;]+/).filter(Boolean))];

/* ----------------------------------------------------------------- helpers */

class UserError extends Error {}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? null : Math.round(Number(n) * 100) / 100);
const day = (v) => (v ? String(v).slice(0, 10) : null);
const last4 = (s) => {
  const digits = String(s || "").replace(/\D/g, "");
  return digits ? digits.slice(-4) : null;
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const isoToBr = (iso) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const brToIso = (br) => {
  const [d, m, y] = String(br).split("/");
  return `${y}-${m}-${d}`;
};
const addDays = (iso, n) => {
  const dt = new Date(`${iso}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const monthOf = (iso) => String(iso).slice(0, 7);

function assertIso(v, campo) {
  if (!v) return;
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
  if (!ok) throw new UserError(`${campo} precisa ser uma data válida no formato AAAA-MM-DD.`);
}

async function http(url, { method = "GET", headers = {}, body, timeoutMs = 25000, retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { accept: "application/json", ...headers },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (attempt < retries) {
        await sleep(800 * (attempt + 1));
        continue;
      }
      const why = e && e.name === "TimeoutError" ? "tempo esgotado" : e && e.message ? e.message : String(e);
      throw new UserError(`Sem resposta de ${new URL(url).host} (${why}). Verifique a conexão com a internet e tente de novo.`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} em ${new URL(url).host}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
}

/* ------------------------------------------------------------------ pluggy */

let apiKey = null;
let apiKeyAt = 0;

async function pluggyKey(force = false) {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new UserError(
      "A Pluggy ainda não está configurada. No Claude Desktop, abra Configurações → Extensões → Finanças do casal e preencha o Client ID e o Client Secret da sua aplicação em dashboard.pluggy.ai."
    );
  }
  if (!force && apiKey && Date.now() - apiKeyAt < 100 * 60 * 1000) return apiKey; // a chave vale 2 horas
  try {
    const data = await http(`${PLUGGY}/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }),
    });
    if (!data || !data.apiKey) throw new UserError("A Pluggy não devolveu a chave de acesso.");
    apiKey = data.apiKey;
    apiKeyAt = Date.now();
    return apiKey;
  } catch (e) {
    if (e.status === 400 || e.status === 401 || e.status === 403) {
      throw new UserError(
        "A Pluggy recusou o Client ID ou o Client Secret. Gere um novo Client Secret em dashboard.pluggy.ai (ele só aparece uma vez) e atualize a extensão."
      );
    }
    throw e;
  }
}

async function pluggy(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, String(v)])
  ).toString();
  const url = `${PLUGGY}/${path}${qs ? `?${qs}` : ""}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const key = await pluggyKey(attempt > 0);
    try {
      return await http(url, { headers: { "X-API-KEY": key } });
    } catch (e) {
      if ((e.status === 401 || e.status === 403) && attempt === 0) continue;
      if (e.status === 404) throw new UserError(`A Pluggy não encontrou o recurso pedido (${path}). Confira o Item ID ou o ID da conta.`);
      throw e;
    }
  }
  throw new UserError("A Pluggy recusou o acesso mesmo com uma chave nova.");
}

function needItems() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new UserError(
      "A Pluggy ainda não está configurada. No Claude Desktop, abra Configurações → Extensões → Finanças do casal e preencha o Client ID e o Client Secret da sua aplicação em dashboard.pluggy.ai."
    );
  }
  if (!ITEM_IDS.length) {
    throw new UserError(
      "Nenhum Item ID configurado. Em dashboard.pluggy.ai → Applications → sua aplicação → Demo, copie o id de cada item em Connected Items (um por banco) e cole nas configurações da extensão, separados por vírgula."
    );
  }
  return ITEM_IDS;
}

async function itemsInfo() {
  const ids = needItems();
  return Promise.all(
    ids.map(async (id) => {
      try {
        const it = await pluggy(`items/${encodeURIComponent(id)}`);
        return { id, ok: true, item: it };
      } catch (e) {
        return { id, ok: false, erro: e.message };
      }
    })
  );
}

function connectorName(item) {
  return (item && item.connector && item.connector.name) || null;
}

async function allAccounts({ tipo } = {}) {
  const infos = await itemsInfo();
  const out = [];
  const falhas = [];
  for (const info of infos) {
    if (!info.ok) {
      falhas.push({ itemId: info.id, erro: info.erro });
      continue;
    }
    try {
      const page = await pluggy("accounts", { itemId: info.id, type: tipo });
      for (const a of page.results || []) out.push({ account: a, item: info.item });
    } catch (e) {
      falhas.push({ itemId: info.id, erro: e.message });
    }
  }
  return { contas: out, falhas };
}

function mapAccount({ account: a, item }) {
  const base = {
    id: a.id,
    itemId: a.itemId,
    conexao: connectorName(item),
    nome: a.marketingName || a.name,
    nomeOriginal: a.name,
    tipo: a.type === "CREDIT" ? "cartao" : a.subtype === "SAVINGS_ACCOUNT" ? "poupanca" : "conta_corrente",
    final: last4(a.number),
    saldo: r2(a.balance),
    moeda: a.currencyCode,
  };
  if (a.type === "CREDIT" && a.creditData) {
    const c = a.creditData;
    base.cartao = {
      bandeira: c.brand,
      nivel: c.level,
      limite: r2(c.creditLimit),
      limiteDisponivel: r2(c.availableCreditLimit),
      faturaAtual: r2(a.balance),
      fechamento: day(c.balanceCloseDate),
      vencimento: day(c.balanceDueDate),
      pagamentoMinimo: r2(c.minimumPayment),
      status: c.status,
    };
  }
  if (a.type === "BANK" && a.bankData) {
    const b = a.bankData;
    base.conta = {
      saldoContabil: r2(b.closingBalance),
      investidoAutomatico: r2(b.automaticallyInvestedBalance),
      limiteChequeEspecial: r2(b.overdraftContractedLimit),
      chequeEspecialUsado: r2(b.overdraftUsedLimit),
      caixinhas: Array.isArray(b.reservedBalances)
        ? b.reservedBalances.map((rb) => ({
            nome: rb.name,
            valor: r2((rb.availableAmounts || []).reduce((s, x) => s + (Number(x.amount) || 0), 0)),
          }))
        : null,
    };
  }
  return base;
}

let categoryMap = null;
async function categories() {
  if (categoryMap) return categoryMap;
  categoryMap = new Map();
  try {
    const r = await pluggy("categories");
    for (const c of r.results || []) {
      categoryMap.set(c.id, { nome: c.descriptionTranslated || c.description, pai: c.parentDescription || null });
    }
  } catch {
    // Sem tradução: seguimos com o texto da própria transação.
  }
  return categoryMap;
}

async function txForAccount(accountId, from, to, cap) {
  const out = [];
  let page = 1;
  let totalPages = 1;
  do {
    const r = await pluggy("transactions", { accountId, from, to, pageSize: 500, page });
    out.push(...(r.results || []));
    totalPages = r.totalPages || 1;
    page += 1;
  } while (page <= totalPages && out.length < cap);
  return out.slice(0, cap);
}

const INTERNAL_CATEGORY =
  /(same person|mesma titularidade|transfer[eê]ncias? (entre contas|pr[oó]prias?)|credit card payment|pagamento de (fatura|cart[aã]o)|^investments?$|^investimentos?$|aplica[cç][aã]o|resgate)/i;
const INTERNAL_DESCRIPTION =
  /(pagamento (de )?fatura|pgto\.? ?fat|pag\.? fatura|pagto cart|pagamento cart[aã]o|aplica[cç][aã]o|resgate|transf(er[eê]ncia)?\.? (entre contas|mesma tit))/i;

function mapTx(t, contaInfo, cats) {
  const valorAbs = Math.abs(Number(t.amount) || 0);
  const valor = t.type === "DEBIT" ? -valorAbs : valorAbs;
  const cat = (t.categoryId && cats.get(t.categoryId)) || null;
  const categoria = (cat && cat.nome) || t.category || "Sem categoria";
  const cc = t.creditCardMetadata || null;
  const interna = INTERNAL_CATEGORY.test(t.category || "") || INTERNAL_CATEGORY.test(categoria) || INTERNAL_DESCRIPTION.test(t.description || "");
  return {
    id: t.id,
    data: day(t.date),
    descricao: t.description,
    comerciante: (t.merchant && (t.merchant.name || t.merchant.businessName)) || null,
    valor: r2(valor),
    tipo: t.type === "DEBIT" ? "saida" : "entrada",
    categoria,
    categoriaPai: cat ? cat.pai : null,
    status: t.status || "POSTED",
    contaId: t.accountId,
    conta: contaInfo ? contaInfo.nome : null,
    cartao: contaInfo ? contaInfo.tipo === "cartao" : false,
    parcela: cc && cc.totalInstallments ? `${cc.installmentNumber || "?"}/${cc.totalInstallments}` : null,
    faturaPrevista: cc ? cc.billForecastDate || null : null,
    movimentoInterno: interna,
  };
}

async function collectTransactions({ de, ate, contaId, limite }) {
  assertIso(de, "de");
  assertIso(ate, "ate");
  const hoje = todayISO();
  const from = de || addDays(hoje, -30);
  const to = ate || hoje;
  if (from > to) throw new UserError("A data inicial (de) precisa ser anterior à final (ate).");
  const cap = Math.min(Math.max(Number(limite) || 500, 1), 5000);
  const { contas, falhas } = await allAccounts();
  const mapped = contas.map(mapAccount);
  const alvo = contaId ? mapped.filter((c) => c.id === contaId) : mapped;
  if (contaId && !alvo.length) throw new UserError(`Conta ${contaId} não encontrada nos itens configurados.`);
  const cats = await categories();
  const out = [];
  for (const conta of alvo) {
    try {
      const txs = await txForAccount(conta.id, from, to, cap);
      for (const t of txs) out.push(mapTx(t, conta, cats));
    } catch (e) {
      falhas.push({ contaId: conta.id, erro: e.message });
    }
  }
  out.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
  return { periodo: { de: from, ate: to }, transacoes: out.slice(0, cap), truncado: out.length > cap, falhas, contas: alvo };
}

const TYPE_PT = {
  FIXED_INCOME: "Renda fixa",
  MUTUAL_FUND: "Fundos",
  EQUITY: "Ações e FIIs",
  ETF: "ETFs",
  SECURITY: "Previdência",
  COE: "COE",
  OTHER: "Outros",
};
const SUBTYPE_PT = {
  TREASURY: "Tesouro Direto",
  CDB: "CDB",
  LCI: "LCI",
  LCA: "LCA",
  CRI: "CRI",
  CRA: "CRA",
  LC: "LC",
  DEBENTURES: "Debêntures",
  CORPORATE_DEBT: "Crédito privado",
  STOCK: "Ações",
  REAL_ESTATE_FUND: "FII",
  BDR: "BDR",
  ETF: "ETF",
  RETIREMENT: "Previdência",
  FIXED_INCOME_FUND: "Fundo de renda fixa",
  MULTIMARKET_FUND: "Fundo multimercado",
  STOCK_FUND: "Fundo de ações",
  INVESTMENT_FUND: "Fundo de investimento",
  STRUCTURED_NOTE: "COE",
};

/* --------------------------------------------------------------------- bcb */

async function sgs(code, { de, ate, ultimos } = {}) {
  const c = Number(code);
  if (!Number.isInteger(c) || c <= 0) throw new UserError("Código de série inválido.");
  const url = ultimos
    ? `${SGS}${c}/dados/ultimos/${Math.min(Math.max(Number(ultimos), 1), 20)}?formato=json`
    : `${SGS}${c}/dados?formato=json&dataInicial=${isoToBr(de)}&dataFinal=${isoToBr(ate)}`;
  let rows;
  try {
    rows = await http(url);
  } catch (e) {
    if (e.status === 404 || e.status === 400) throw new UserError(`O SGS não tem dados da série ${c} nesse período.`);
    throw e;
  }
  if (!Array.isArray(rows)) throw new UserError(`Resposta inesperada do SGS para a série ${c}.`);
  return rows.map((r) => ({ data: brToIso(r.data), valor: Number(String(r.valor).replace(",", ".")) }));
}

async function latestSgs(code, label, unidade) {
  const rows = await sgs(code, { ultimos: 20 });
  const hoje = todayISO();
  const vigentes = rows.filter((r) => r.data <= hoje);
  const last = vigentes[vigentes.length - 1] || rows[rows.length - 1];
  return {
    indicador: label,
    serie: Number(code),
    valor: last ? last.valor : null,
    data: last ? last.data : null,
    unidade,
    fonte: `${SGS}${code}/dados`,
  };
}

const FOCUS_ALIASES = {
  ipca: "IPCA",
  selic: "Selic",
  cambio: "Câmbio",
  "câmbio": "Câmbio",
  dolar: "Câmbio",
  pib: "PIB Total",
  "pib total": "PIB Total",
  igpm: "IGP-M",
  "igp-m": "IGP-M",
};

async function focusAnual(indicadores, anos) {
  const inds = indicadores.map((i) => FOCUS_ALIASES[String(i).toLowerCase()] || i);
  const filtro = `(${inds.map((i) => `Indicador eq '${i.replace(/'/g, "''")}'`).join(" or ")}) and (${anos
    .map((a) => `DataReferencia eq '${a}'`)
    .join(" or ")}) and baseCalculo eq 0`;
  const params = new URLSearchParams({
    $top: String(Math.min(inds.length * anos.length * 10, 400)),
    $filter: filtro,
    $orderby: "Data desc",
    $format: "json",
    $select: "Indicador,Data,DataReferencia,Media,Mediana,Minimo,Maximo,numeroRespondentes",
  });
  const url = `${OLINDA}/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?${params.toString().replace(/\+/g, "%20")}`;
  const data = await http(url, { timeoutMs: 30000 });
  const rows = (data && data.value) || [];
  const porChave = new Map();
  for (const r of rows) {
    const k = `${r.Indicador}|${r.DataReferencia}`;
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k).push(r);
  }
  const out = [];
  for (const [k, list] of porChave) {
    list.sort((a, b) => (a.Data < b.Data ? 1 : -1));
    const atual = list[0];
    const ref = list.find((x) => x.Data <= addDays(atual.Data, -28)) || null;
    const [indicador, ano] = k.split("|");
    out.push({
      indicador,
      ano,
      mediana: atual.Mediana,
      media: r2(atual.Media),
      minimo: atual.Minimo,
      maximo: atual.Maximo,
      respondentes: atual.numeroRespondentes,
      data: atual.Data,
      medianaHa4Semanas: ref ? ref.Mediana : null,
    });
  }
  out.sort((a, b) => (a.indicador === b.indicador ? a.ano.localeCompare(b.ano) : a.indicador.localeCompare(b.indicador)));
  return { expectativas: out, fonte: `${OLINDA}/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais` };
}

async function ptax(moeda = "USD", dataIso) {
  const base = dataIso || todayISO();
  assertIso(base, "data");
  const m = String(moeda || "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(m)) throw new UserError("Moeda deve ter 3 letras, como USD ou EUR.");
  for (let back = 0; back < 10; back++) {
    const iso = addDays(base, -back);
    const [y, mo, d] = iso.split("-");
    const mdY = `${mo}-${d}-${y}`;
    const url =
      m === "USD"
        ? `${OLINDA}/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${mdY}'&$format=json`
        : `${OLINDA}/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda='${m}'&@dataCotacao='${mdY}'&$format=json`;
    const data = await http(url);
    const vals = (data && data.value) || [];
    if (vals.length) {
      const fechamento = vals.find((v) => /fechamento/i.test(v.tipoBoletim || "")) || vals[vals.length - 1];
      return {
        moeda: m,
        compra: fechamento.cotacaoCompra,
        venda: fechamento.cotacaoVenda,
        boletim: fechamento.tipoBoletim || "Fechamento",
        dataHora: fechamento.dataHoraCotacao,
        fonte: `${OLINDA}/PTAX/versao/v1/odata`,
      };
    }
  }
  throw new UserError(`Sem cotação PTAX de ${m} nos 10 dias até ${base}.`);
}

/* ---------------------------------------------------------------- server */

const server = new McpServer(
  { name: "financas-casal", version: VERSION },
  {
    instructions:
      "Ferramentas somente leitura. Pluggy (Meu Pluggy, Open Finance): pluggy_status, pluggy_contas, pluggy_transacoes, pluggy_gastos_resumo, pluggy_faturas e pluggy_investimentos. Banco Central: bcb_indicadores, bcb_serie, bcb_focus e bcb_ptax. Valores em reais; nas transações, saídas são negativas e entradas positivas. O resumo de gastos já tira pagamento de fatura, transferência entre contas próprias, aplicação e resgate (movimentoInterno). A Meu Pluggy atualiza os bancos cerca de uma vez a cada 24 horas e a autorização vale um ano (veja pluggy_status). Nenhuma ferramenta movimenta dinheiro; nunca peça senha de banco.",
  }
);

function tool(fn) {
  return async (args) => {
    try {
      const out = await fn(args || {});
      return { content: [{ type: "text", text: JSON.stringify(out) }] };
    } catch (e) {
      const msg = e instanceof UserError ? e.message : `Falha: ${e && e.message ? e.message : String(e)}`;
      return { isError: true, content: [{ type: "text", text: msg }] };
    }
  };
}

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use AAAA-MM-DD");

server.registerTool(
  "pluggy_status",
  {
    title: "Conexões do Open Finance",
    description:
      "Mostra cada conexão (item) configurada no Meu Pluggy: banco, status, última atualização, próxima sincronização e quando a autorização expira.",
    inputSchema: {},
    annotations: RO,
  },
  tool(async () => {
    const infos = await itemsInfo();
    const hoje = todayISO();
    return {
      conexoes: infos.map((i) => {
        if (!i.ok) return { itemId: i.id, ok: false, erro: i.erro };
        const it = i.item;
        const expira = day(it.consentExpiresAt);
        return {
          itemId: i.id,
          ok: true,
          conexao: connectorName(it),
          status: it.status,
          execucao: it.executionStatus,
          ultimaAtualizacao: it.lastUpdatedAt || null,
          proximaSincronizacao: it.nextAutoSyncAt || null,
          autorizacaoExpiraEm: expira,
          diasParaExpirar: expira ? Math.round((Date.parse(expira) - Date.parse(hoje)) / 86400000) : null,
          erro: it.error ? it.error.message || it.error.code || "erro" : null,
        };
      }),
    };
  })
);

server.registerTool(
  "pluggy_contas",
  {
    title: "Contas e cartões",
    description:
      "Lista contas correntes, poupanças e cartões de crédito de todas as conexões, com saldo e, nos cartões, limite, fatura atual, fechamento e vencimento.",
    inputSchema: {},
    annotations: RO,
  },
  tool(async () => {
    const { contas, falhas } = await allAccounts();
    const mapped = contas.map(mapAccount);
    const bancarias = mapped.filter((c) => c.tipo !== "cartao");
    return {
      atualizadoEm: new Date().toISOString(),
      saldoTotalContas: r2(bancarias.reduce((s, c) => s + (c.saldo || 0), 0)),
      contas: mapped,
      falhas,
    };
  })
);

server.registerTool(
  "pluggy_transacoes",
  {
    title: "Transações",
    description:
      "Transações de um período (padrão: últimos 30 dias) em todas as contas e cartões, ou só numa conta. Saídas negativas, entradas positivas; 'movimentoInterno' marca pagamento de fatura, transferência entre contas próprias, aplicação e resgate.",
    inputSchema: {
      de: isoDate.optional().describe("Data inicial, AAAA-MM-DD"),
      ate: isoDate.optional().describe("Data final, AAAA-MM-DD"),
      contaId: z.string().optional().describe("ID de uma conta de pluggy_contas, para filtrar"),
      limite: z.number().int().min(1).max(5000).optional().describe("Máximo de transações (padrão 500)"),
    },
    annotations: RO,
  },
  tool(async (a) => {
    const r = await collectTransactions(a);
    return { periodo: r.periodo, quantidade: r.transacoes.length, truncado: r.truncado, transacoes: r.transacoes, falhas: r.falhas };
  })
);

server.registerTool(
  "pluggy_gastos_resumo",
  {
    title: "Resumo de gastos",
    description:
      "Soma entradas e saídas de um período por categoria, por mês e por conta; lista os maiores gastos e prováveis assinaturas. Tira movimentos internos (pagamento de fatura, transferência entre contas próprias, aplicação, resgate) a menos que incluirInternos seja true.",
    inputSchema: {
      de: isoDate.optional().describe("Data inicial, AAAA-MM-DD (padrão: início do mês atual)"),
      ate: isoDate.optional().describe("Data final, AAAA-MM-DD (padrão: hoje)"),
      incluirInternos: z.boolean().optional().describe("Somar também os movimentos internos"),
    },
    annotations: RO,
  },
  tool(async (a) => {
    const hoje = todayISO();
    const de = a.de || `${hoje.slice(0, 7)}-01`;
    const ate = a.ate || hoje;
    const r = await collectTransactions({ de, ate, limite: 5000 });
    const considerar = r.transacoes.filter((t) => a.incluirInternos || !t.movimentoInterno);
    const internos = r.transacoes.filter((t) => t.movimentoInterno);
    const saidas = considerar.filter((t) => t.valor < 0);
    const entradas = considerar.filter((t) => t.valor > 0);
    const soma = (list) => r2(list.reduce((s, t) => s + Math.abs(t.valor), 0));
    const totalSaidas = soma(saidas);

    const porCategoria = new Map();
    for (const t of saidas) {
      const k = t.categoria || "Sem categoria";
      const cur = porCategoria.get(k) || { categoria: k, total: 0, quantidade: 0 };
      cur.total += Math.abs(t.valor);
      cur.quantidade += 1;
      porCategoria.set(k, cur);
    }
    const categorias = [...porCategoria.values()]
      .map((c) => ({ ...c, total: r2(c.total), percentual: totalSaidas ? r2((c.total / totalSaidas) * 100) : 0 }))
      .sort((x, y) => y.total - x.total);

    const porMes = new Map();
    for (const t of considerar) {
      const k = monthOf(t.data);
      const cur = porMes.get(k) || { mes: k, saidas: 0, entradas: 0 };
      if (t.valor < 0) cur.saidas += Math.abs(t.valor);
      else cur.entradas += t.valor;
      porMes.set(k, cur);
    }
    const meses = [...porMes.values()].map((m) => ({ mes: m.mes, saidas: r2(m.saidas), entradas: r2(m.entradas) })).sort((x, y) => x.mes.localeCompare(y.mes));

    const porConta = new Map();
    for (const t of saidas) {
      const k = t.conta || t.contaId;
      porConta.set(k, (porConta.get(k) || 0) + Math.abs(t.valor));
    }

    const norm = (s) => String(s || "").toLowerCase().replace(/[0-9*#./-]+/g, " ").replace(/\s+/g, " ").trim();
    const grupos = new Map();
    for (const t of saidas) {
      const k = norm(t.comerciante || t.descricao);
      if (!k) continue;
      const g = grupos.get(k) || { descricao: t.comerciante || t.descricao, meses: new Set(), valores: [] };
      g.meses.add(monthOf(t.data));
      g.valores.push(Math.abs(t.valor));
      grupos.set(k, g);
    }
    const recorrentes = [...grupos.values()]
      .filter((g) => g.meses.size >= 2)
      .map((g) => {
        const media = g.valores.reduce((s, v) => s + v, 0) / g.valores.length;
        const variacao = Math.max(...g.valores) - Math.min(...g.valores);
        return { descricao: g.descricao, meses: g.meses.size, valorMedio: r2(media), variacao: r2(variacao) };
      })
      .filter((g) => g.variacao <= Math.max(5, g.valorMedio * 0.15))
      .sort((x, y) => y.valorMedio - x.valorMedio)
      .slice(0, 20);

    return {
      periodo: r.periodo,
      saidas: totalSaidas,
      entradas: soma(entradas),
      resultado: r2(soma(entradas) - totalSaidas),
      quantidade: considerar.length,
      porCategoria: categorias,
      porMes: meses,
      porConta: [...porConta.entries()].map(([conta, total]) => ({ conta, total: r2(total) })).sort((x, y) => y.total - x.total),
      maioresGastos: saidas
        .slice()
        .sort((x, y) => x.valor - y.valor)
        .slice(0, 15)
        .map((t) => ({ data: t.data, descricao: t.descricao, comerciante: t.comerciante, valor: t.valor, categoria: t.categoria, conta: t.conta, parcela: t.parcela })),
      provaveisAssinaturas: recorrentes,
      movimentosInternosExcluidos: a.incluirInternos ? null : { quantidade: internos.length, total: soma(internos) },
      semCategoria: saidas.filter((t) => t.categoria === "Sem categoria").length,
      falhas: r.falhas,
    };
  })
);

server.registerTool(
  "pluggy_faturas",
  {
    title: "Faturas do cartão",
    description: "Faturas de cartão de crédito (vencimento, fechamento, total, mínimo e pagamentos). Sem contaId, traz as dos cartões de todas as conexões.",
    inputSchema: {
      contaId: z.string().optional().describe("ID do cartão em pluggy_contas"),
      quantidade: z.number().int().min(1).max(24).optional().describe("Faturas por cartão, das mais recentes (padrão 6)"),
    },
    annotations: RO,
  },
  tool(async (a) => {
    const { contas, falhas } = await allAccounts({ tipo: "CREDIT" });
    const cartoes = contas.map(mapAccount).filter((c) => c.tipo === "cartao" && (!a.contaId || c.id === a.contaId));
    if (a.contaId && !cartoes.length) throw new UserError(`Cartão ${a.contaId} não encontrado.`);
    const n = a.quantidade || 6;
    const out = [];
    for (const c of cartoes) {
      try {
        const r = await pluggy("bills", { accountId: c.id, pageSize: 50 });
        const faturas = (r.results || [])
          .slice()
          .sort((x, y) => (day(x.dueDate) < day(y.dueDate) ? 1 : -1))
          .slice(0, n)
          .map((b) => ({
            id: b.id,
            vencimento: day(b.dueDate),
            fechamento: day(b.billClosingDate),
            total: r2(b.totalAmount),
            minimo: r2(b.minimumPaymentAmount),
            pagamentos: (b.payments || []).map((p) => ({ data: day(p.paymentDate), valor: r2(p.amount), modo: p.paymentMode })),
            encargos: (b.financeCharges || []).map((f) => ({ tipo: f.type, valor: r2(f.amount) })),
          }));
        out.push({ cartaoId: c.id, cartao: c.nome, final: c.final, faturas });
      } catch (e) {
        falhas.push({ contaId: c.id, erro: e.message });
      }
    }
    return { cartoes: out, falhas };
  })
);

server.registerTool(
  "pluggy_investimentos",
  {
    title: "Investimentos",
    description:
      "Posições de investimento de todas as conexões (renda fixa, Tesouro, fundos, ações, FIIs, previdência), com saldo, valor aplicado, rentabilidade e vencimento, mais totais por tipo.",
    inputSchema: {},
    annotations: RO,
  },
  tool(async () => {
    const infos = await itemsInfo();
    const posicoes = [];
    const falhas = infos.filter((i) => !i.ok).map((i) => ({ itemId: i.id, erro: i.erro }));
    for (const info of infos.filter((i) => i.ok)) {
      try {
        let page = 1;
        let totalPages = 1;
        do {
          const r = await pluggy("investments", { itemId: info.id, pageSize: 500, page });
          for (const v of r.results || []) {
            if (v.status === "TOTAL_WITHDRAWAL") continue;
            posicoes.push({
              id: v.id,
              conexao: connectorName(info.item),
              nome: v.name,
              classe: SUBTYPE_PT[v.subtype] || TYPE_PT[v.type] || v.type,
              tipo: TYPE_PT[v.type] || v.type,
              subtipo: v.subtype,
              instituicao: (v.institution && v.institution.name) || null,
              emissor: v.issuer,
              saldo: r2(v.balance),
              valorBruto: r2(v.amount),
              aplicado: r2(v.amountOriginal),
              resultado: r2(v.amountProfit),
              taxa: v.rate,
              indexador: v.rateType,
              taxaPrefixadaAnual: v.fixedAnnualRate,
              rentabilidadeMes: v.lastMonthRate,
              rentabilidade12m: v.lastTwelveMonthsRate,
              rentabilidadeAno: v.annualRate,
              vencimento: day(v.dueDate),
              compra: day(v.purchaseDate),
              dataReferencia: day(v.date),
              isentoIR: v.taxExempt === true ? true : v.taxExempt === false ? false : null,
              status: v.status,
            });
          }
          totalPages = r.totalPages || 1;
          page += 1;
        } while (page <= totalPages);
      } catch (e) {
        falhas.push({ itemId: info.id, erro: e.message });
      }
    }
    const total = r2(posicoes.reduce((s, p) => s + (p.saldo || 0), 0));
    const porTipo = new Map();
    for (const p of posicoes) porTipo.set(p.tipo, (porTipo.get(p.tipo) || 0) + (p.saldo || 0));
    return {
      atualizadoEm: new Date().toISOString(),
      total,
      porTipo: [...porTipo.entries()].map(([tipo, valor]) => ({ tipo, valor: r2(valor), percentual: total ? r2((valor / total) * 100) : 0 })).sort((x, y) => y.valor - x.valor),
      posicoes: posicoes.sort((x, y) => (y.saldo || 0) - (x.saldo || 0)),
      falhas,
    };
  })
);

server.registerTool(
  "bcb_indicadores",
  {
    title: "Indicadores do Banco Central",
    description:
      "Retrato atual: meta Selic (série 432), CDI anualizado (4389), IPCA do mês (433), IPCA em 12 meses (13522), dólar PTAX de venda (1) e as medianas do Focus para IPCA, Selic, câmbio e PIB do ano atual e do próximo.",
    inputSchema: {},
    annotations: RO,
  },
  tool(async () => {
    const ano = Number(todayISO().slice(0, 4));
    const pedidos = [
      latestSgs(432, "Meta Selic (Copom)", "% a.a."),
      latestSgs(4389, "CDI anualizado (base 252)", "% a.a."),
      latestSgs(433, "IPCA do mês", "%"),
      latestSgs(13522, "IPCA acumulado em 12 meses", "%"),
      latestSgs(1, "Dólar comercial (PTAX venda)", "R$"),
    ];
    const resultados = await Promise.allSettled([...pedidos, focusAnual(["IPCA", "Selic", "Câmbio", "PIB Total"], [String(ano), String(ano + 1)])]);
    const indicadores = [];
    const falhas = [];
    resultados.slice(0, 5).forEach((r) => (r.status === "fulfilled" ? indicadores.push(r.value) : falhas.push(r.reason && r.reason.message)));
    const focus = resultados[5].status === "fulfilled" ? resultados[5].value : null;
    if (resultados[5].status !== "fulfilled") falhas.push(resultados[5].reason && resultados[5].reason.message);
    return { consultadoEm: new Date().toISOString(), indicadores, focus, falhas };
  })
);

server.registerTool(
  "bcb_serie",
  {
    title: "Série temporal do SGS",
    description:
      "Qualquer série do SGS do Banco Central pelo código (ex.: 432 meta Selic, 11 Selic diária, 12 CDI diário, 4389 CDI anualizado, 433 IPCA mensal, 13522 IPCA 12 meses, 189 IGP-M mensal, 1 dólar PTAX venda). Informe 'ultimos' (até 20) ou um período 'de'/'ate'; agregar='mensal' devolve o último valor de cada mês.",
    inputSchema: {
      codigo: z.number().int().positive().describe("Código da série no SGS"),
      de: isoDate.optional(),
      ate: isoDate.optional(),
      ultimos: z.number().int().min(1).max(20).optional(),
      agregar: z.enum(["nenhum", "mensal"]).optional(),
    },
    annotations: RO,
  },
  tool(async (a) => {
    let rows;
    if (a.ultimos) rows = await sgs(a.codigo, { ultimos: a.ultimos });
    else {
      const ate = a.ate || todayISO();
      const de = a.de || addDays(ate, -365);
      if (de > ate) throw new UserError("A data inicial precisa ser anterior à final.");
      rows = await sgs(a.codigo, { de, ate });
    }
    if (a.agregar === "mensal") {
      const porMes = new Map();
      for (const r of rows) porMes.set(monthOf(r.data), r);
      rows = [...porMes.values()];
    }
    return { serie: a.codigo, quantidade: rows.length, dados: rows.slice(-1000), fonte: `${SGS}${a.codigo}/dados` };
  })
);

server.registerTool(
  "bcb_focus",
  {
    title: "Expectativas do Focus",
    description:
      "Medianas mais recentes da pesquisa Focus (Banco Central) para indicadores anuais, com a leitura de 4 semanas antes para ver a tendência. Indicadores: IPCA, Selic, Câmbio, PIB Total, IGP-M.",
    inputSchema: {
      indicadores: z.array(z.string()).min(1).max(5).optional().describe("Padrão: IPCA, Selic, Câmbio e PIB Total"),
      anos: z.array(z.string().regex(/^\d{4}$/)).min(1).max(4).optional().describe("Padrão: ano atual e próximo"),
    },
    annotations: RO,
  },
  tool(async (a) => {
    const ano = Number(todayISO().slice(0, 4));
    return focusAnual(a.indicadores || ["IPCA", "Selic", "Câmbio", "PIB Total"], a.anos || [String(ano), String(ano + 1)]);
  })
);

server.registerTool(
  "bcb_ptax",
  {
    title: "Cotação PTAX",
    description: "Cotação PTAX de fechamento (compra e venda) de uma moeda numa data; volta até 10 dias se a data não tiver boletim.",
    inputSchema: {
      moeda: z.string().length(3).optional().describe("Código da moeda, ex.: USD, EUR (padrão USD)"),
      data: isoDate.optional().describe("AAAA-MM-DD (padrão: hoje)"),
    },
    annotations: RO,
  },
  tool(async (a) => ptax(a.moeda || "USD", a.data))
);

const transport = new StdioServerTransport();
await server.connect(transport);
