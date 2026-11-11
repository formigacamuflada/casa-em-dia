// Atualiza o retrato do mercado com dados públicos do Banco Central.
// Fontes: SGS (api.bcb.gov.br) e Olinda (Focus e PTAX). Chamado pelo app quando
// os dados têm mais de 12 horas e por um agendamento diário no GitHub Actions.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { addDays, corsHeaders, http, json, monthOf, todayISO } from "../_shared/http.ts";

const SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.";
const OLINDA = "https://olinda.bcb.gov.br/olinda/servico";
const FRESH_MS = 12 * 60 * 60 * 1000;

const isoToBr = (iso: string) => iso.split("-").reverse().join("/");
const brToIso = (br: string) => String(br).split("/").reverse().join("-");

async function sgs(code: number, de: string, ate: string) {
  const rows = await http(`${SGS}${code}/dados?formato=json&dataInicial=${isoToBr(de)}&dataFinal=${isoToBr(ate)}`);
  if (!Array.isArray(rows)) throw new Error(`Resposta inesperada do SGS ${code}`);
  return rows.map((r: any) => ({ data: brToIso(r.data), valor: Number(String(r.valor).replace(",", ".")) }));
}

function ultimoAte(rows: { data: string; valor: number }[], hoje: string) {
  const vigentes = rows.filter((r) => r.data <= hoje);
  return vigentes[vigentes.length - 1] || null;
}

function mensal(rows: { data: string; valor: number }[]) {
  const porMes = new Map<string, number>();
  for (const r of rows) porMes.set(monthOf(r.data), r.valor);
  return [...porMes.entries()];
}

async function focus(anos: string[]) {
  const inds = ["IPCA", "Selic", "Câmbio", "PIB Total"];
  const filtro = `(${inds.map((i) => `Indicador eq '${i}'`).join(" or ")}) and (${anos
    .map((a) => `DataReferencia eq '${a}'`)
    .join(" or ")}) and baseCalculo eq 0`;
  const params = new URLSearchParams({
    $top: "200",
    $filter: filtro,
    $orderby: "Data desc",
    $format: "json",
    $select: "Indicador,Data,DataReferencia,Mediana",
  });
  const data = await http(
    `${OLINDA}/Expectativas/versao/v1/odata/ExpectativasMercadoAnuais?${params.toString().replace(/\+/g, "%20")}`,
    { timeoutMs: 30000 },
  );
  const rows: any[] = data?.value || [];
  const grupos = new Map<string, any[]>();
  for (const r of rows) {
    const k = `${r.Indicador}|${r.DataReferencia}`;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(r);
  }
  let dataRef = "";
  const itens = [];
  for (const [k, list] of grupos) {
    list.sort((a, b) => (a.Data < b.Data ? 1 : -1));
    const atual = list[0];
    const ref = list.find((x) => x.Data <= addDays(atual.Data, -28));
    if (atual.Data > dataRef) dataRef = atual.Data;
    const [indicador, ano] = k.split("|");
    itens.push({ indicador, ano, mediana: atual.Mediana, ha4: ref ? ref.Mediana : null });
  }
  return { data: dataRef, itens };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  let force = false;
  try {
    force = Boolean((await req.json())?.forcar);
  } catch {
    // corpo vazio
  }

  const { data: atual } = await admin.from("mercado").select("atualizado_em").eq("id", "atual").maybeSingle();
  if (!force && atual && Date.now() - Date.parse(atual.atualizado_em) < FRESH_MS) {
    return json({ ok: true, atualizado: false, atualizadoEm: atual.atualizado_em });
  }

  const hoje = todayISO();
  const ano = Number(hoje.slice(0, 4));
  const inicio24 = `${ano - 2}-${hoje.slice(5, 7)}-01`;
  const recente = addDays(hoje, -45);
  // PTAX diária desde o início do mês (ou 15 dias, o que vier antes), para
  // mostrar o mês corrente no gráfico: a série mensal 3698 só traz meses fechados.
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const desdeDolar = inicioMes < addDays(hoje, -15) ? inicioMes : addDays(hoje, -15);

  const [selicMeta, cdi, ipcaMes, ipca12, dolarDia, selicMes, ipca12Hist, dolarMes, fx] = await Promise.allSettled([
    sgs(432, recente, addDays(hoje, 60)),
    sgs(4389, recente, hoje),
    sgs(433, addDays(hoje, -120), hoje),
    sgs(13522, addDays(hoje, -120), hoje),
    sgs(1, desdeDolar, hoje),
    sgs(4189, inicio24, hoje),
    sgs(13522, inicio24, hoje),
    sgs(3698, inicio24, hoje),
    focus([String(ano), String(ano + 1)]),
  ]);

  const ok = <T>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
  const falhas = [selicMeta, cdi, ipcaMes, ipca12, dolarDia, selicMes, ipca12Hist, dolarMes, fx]
    .filter((r) => r.status === "rejected")
    .map((r) => String((r as PromiseRejectedResult).reason?.message || r));

  const ind = (rows: any, serie: number, rotulo: string, unidade: string) => {
    const u = rows ? ultimoAte(rows, hoje) : null;
    return u ? { valor: u.valor, data: u.data, serie, rotulo, unidade } : null;
  };

  // Mês corrente do dólar: média parcial das PTAX diárias já publicadas.
  const serieDolar = ok(dolarMes) ? mensal(ok(dolarMes)!) : [];
  let dolarParcial: { mes: string; ate: string; dias: number } | null = null;
  const diasMes = (ok(dolarDia) || []).filter((r) => r.data.startsWith(hoje.slice(0, 7)) && r.data <= hoje);
  if (serieDolar.length && diasMes.length && !serieDolar.some(([m]) => m === hoje.slice(0, 7))) {
    const media = diasMes.reduce((s, r) => s + r.valor, 0) / diasMes.length;
    serieDolar.push([hoje.slice(0, 7), Math.round(media * 10000) / 10000]);
    dolarParcial = { mes: hoje.slice(0, 7), ate: diasMes[diasMes.length - 1].data, dias: diasMes.length };
  }

  const dados = {
    indicadores: {
      selic: ind(ok(selicMeta), 432, "Meta Selic", "% a.a."),
      cdi: ind(ok(cdi), 4389, "CDI", "% a.a."),
      ipcaMes: ind(ok(ipcaMes), 433, "IPCA do mês", "%"),
      ipca12m: ind(ok(ipca12), 13522, "IPCA em 12 meses", "%"),
      dolar: ind(ok(dolarDia), 1, "Dólar PTAX (venda)", "R$"),
    },
    focus: ok(fx),
    series: {
      selic: ok(selicMes) ? mensal(ok(selicMes)!) : [],
      ipca12m: ok(ipca12Hist) ? mensal(ok(ipca12Hist)!) : [],
      dolar: serieDolar,
    },
    parcial: { dolar: dolarParcial },
    fontes: [
      { nome: "Banco Central, SGS (séries 432, 4389, 433, 13522, 1, 4189 e 3698)", url: "https://www3.bcb.gov.br/sgspub" },
      { nome: "Banco Central, pesquisa Focus", url: "https://www.bcb.gov.br/publicacoes/focus" },
    ],
    falhas,
  };

  // Não sobrescreve um retrato bom com um retrato vazio.
  if (!dados.indicadores.selic && !dados.indicadores.ipca12m && !dados.focus) {
    return json({ ok: false, erro: "O Banco Central não respondeu agora.", falhas }, 502);
  }

  const agora = new Date().toISOString();
  const { error } = await admin.from("mercado").upsert({ id: "atual", dados, atualizado_em: agora });
  if (error) return json({ ok: false, erro: error.message }, 500);
  return json({ ok: true, atualizado: true, atualizadoEm: agora, falhas });
});
