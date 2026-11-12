// Regras de cálculo do mês: contas que valem no mês, acerto 50/50 e sobra.

export const CATEGORIAS = [
  ["moradia", "Moradia (aluguel, condomínio, IPTU)"],
  ["consumo", "Luz, água, gás e internet"],
  ["mercado", "Mercado"],
  ["transporte", "Transporte"],
  ["saude", "Saúde"],
  ["educacao", "Educação"],
  ["lazer", "Lazer"],
  ["assinaturas", "Assinaturas"],
  ["reserva", "Reserva e metas"],
  ["outros", "Outros"],
];
export const CAT_CURTA = {
  moradia: "Moradia",
  consumo: "Luz, água e internet",
  mercado: "Mercado",
  transporte: "Transporte",
  saude: "Saúde",
  educacao: "Educação",
  lazer: "Lazer",
  assinaturas: "Assinaturas",
  reserva: "Reserva",
  outros: "Outros",
  cartao: "Fatura de cartão",
};
export const MORADIA = new Set(["moradia", "consumo"]);

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
export const sum = (list) => round2(list.reduce((s, v) => s + (Number(v) || 0), 0));

export const ymOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
export const curYM = () => ymOf(new Date());
export function addYM(ym, k) {
  const [y, m] = ym.split("-").map(Number);
  return ymOf(new Date(y, m - 1 + k, 1));
}
export function daysIn(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export function vale(conta, ym) {
  if (!conta) return false;
  if (conta.recorrente) return (conta.inicio || "0000-00") <= ym && (!conta.fim || ym <= conta.fim);
  return conta.mes === ym;
}
export function valorNoMes(conta, ym) {
  const v = conta.valores && conta.valores[ym];
  return v !== undefined && v !== null ? Number(v) : Number(conta.valor || 0);
}
export const pagoNoMes = (item, ym) => Boolean(item.pagos && item.pagos[ym]);

// Fatura de cartão vira uma conta do mês quando o cartão soma nas contas.
// Faturas são por competência: a "fatura de novembro" são as compras de novembro,
// que vencem no dia do vencimento do mês seguinte (venceYM).
function faturaComoConta(cartao, ym) {
  const f = cartao.faturas && cartao.faturas[ym];
  if (!cartao.somar_nas_contas || f === undefined || f === null) return null;
  return {
    id: cartao.id,
    tipo: "cartao",
    escopo: cartao.escopo,
    nome: `Fatura ${cartao.apelido || cartao.banco}`,
    valorMes: Number(f),
    dia: Number(cartao.vencimento) || 10,
    venceYM: addYM(ym, 1),
    categoria: "cartao",
    pagador: cartao.pagador,
    pago: pagoNoMes(cartao, ym),
    ref: cartao,
  };
}

// Ordem de vencimento dentro do mês: o que vence no mês seguinte (faturas) vem depois.
export const venceNoMesSeguinte = (item, ym) => Boolean(item.venceYM && item.venceYM !== ym);
export const ordemDia = (item, ym) => (venceNoMesSeguinte(item, ym) ? 100 : 0) + Number(item.dia || 0);
// Dias de hoje até o vencimento (negativo = já passou).
export function diasAteVencer(item, ym, hoje = new Date()) {
  const vYM = item.venceYM || ym;
  const [y, m] = vYM.split("-").map(Number);
  const d = Math.min(Number(item.dia) || 1, daysIn(vYM));
  const alvo = new Date(y, m - 1, d);
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - h) / 86400000);
}

export function contasDoMes(state, ym, escopo) {
  const out = [];
  for (const c of state.contas) {
    if (c.escopo !== escopo || !vale(c, ym)) continue;
    out.push({
      id: c.id,
      tipo: "conta",
      escopo: c.escopo,
      nome: c.nome,
      valorMes: valorNoMes(c, ym),
      dia: c.dia,
      categoria: c.categoria,
      pagador: c.pagador,
      pago: pagoNoMes(c, ym),
      ref: c,
    });
  }
  for (const k of state.cartoes) {
    if (k.escopo !== escopo) continue;
    const f = faturaComoConta(k, ym);
    if (f) out.push(f);
  }
  return out.sort((a, b) => ordemDia(a, ym) - ordemDia(b, ym) || a.nome.localeCompare(b.nome, "pt-BR"));
}

export function acerto(state, ym) {
  const itens = contasDoMes(state, ym, "casa");
  const total = sum(itens.map((i) => i.valorMes));
  const pagou = { a: 0, b: 0 };
  for (const i of itens) pagou[i.pagador === "b" ? "b" : "a"] += i.valorMes;
  const metade = round2(total / 2);
  const diff = round2(pagou.a - total / 2);
  let de = null;
  let para = null;
  let valor = 0;
  if (diff > 0.004) {
    de = "b";
    para = "a";
    valor = diff;
  } else if (diff < -0.004) {
    de = "a";
    para = "b";
    valor = -diff;
  }
  return { itens, total, metade, pagou: { a: round2(pagou.a), b: round2(pagou.b) }, de, para, valor: round2(valor) };
}

/* ---- gasto real do dia a dia (bancos via Meu Pluggy) ----
   Das saídas do mês nos bancos, tira o que já está contado em outro lugar do Saldo previsto:
   - compras de cartão cuja fatura do mês já entra nas contas (pessoais ou da casa);
   - pagamentos que batem com uma conta lançada (pessoal, ou da casa paga por você);
   - Pix/transferência para a outra pessoa da casa (acerto).
   Pagamento de fatura, transferências entre contas próprias, aplicações e resgates já
   chegam marcados como internos pelo servidor e nem entram em `transacoes`. */
export const normTxt = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const PALAVRA_FRACA = new Set(["conta", "pagamento", "pagto", "compra", "enviado", "recebido", "transferencia", "brasil", "ltda", "mensal", "fatura", "debito", "credito"]);
const palavras = (s) => new Set(normTxt(s).split(" ").filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !PALAVRA_FRACA.has(w)));
export function parecido(a, b) {
  const pa = palavras(a);
  for (const w of palavras(b)) if (pa.has(w)) return true;
  return false;
}
// Mesmo valor (até 5 centavos) ou valor próximo (até 5%) com alguma palavra em comum no nome.
export function bate(valorConta, nomeConta, valorTx, descTx) {
  const a = Math.abs(Number(valorConta) || 0);
  const b = Math.abs(Number(valorTx) || 0);
  if (!a || !b) return false;
  if (Math.abs(a - b) <= 0.05) return true;
  return Math.abs(a - b) <= Math.max(1, a * 0.05) && parecido(nomeConta, descTx);
}

export function gastoReal(state, ym, vaga) {
  const g = (state.gastos || []).find((x) => x.mes === ym);
  if (!g || !Array.isArray(g.transacoes)) return null;
  const txs = g.transacoes.filter((t) => Number(t.valor) < 0);

  // Cartões do app com fatura contada neste mês → nomes/ids das contas de cartão na Pluggy.
  const impCartoes = state.importacao?.cartoes || [];
  const cartaoIds = new Set();
  const cartaoNomes = new Set();
  const cartoesContados = [];
  for (const k of state.cartoes || []) {
    if (!k.somar_nas_contas || !k.faturas || k.faturas[ym] == null) continue;
    const imp =
      impCartoes.find((c) => k.origem?.accountId && c.id === k.origem.accountId) ||
      impCartoes.find((c) => k.final && c.final === k.final);
    if (!imp) continue;
    cartaoIds.add(imp.id);
    cartaoNomes.add(imp.nome);
    cartoesContados.push(k.apelido || k.banco || imp.nome);
  }

  // Contas lançadas que saem do seu bolso: pessoais + da casa pagas por você.
  const candidatas = [
    ...contasDoMes(state, ym, "pessoal").filter((i) => i.tipo === "conta"),
    ...contasDoMes(state, ym, "casa").filter((i) => i.tipo === "conta" && i.pagador === vaga),
  ];
  const outra = (state.membros || []).find((m) => m.vaga !== vaga);
  const nomeOutra = normTxt(outra?.apelido || outra?.nome || "").split(" ")[0] || "";

  const fora = { cartao: [], conta: [], acerto: [] };
  const usadas = new Set();
  const contaDaTx = new Map();
  // 1º passe: valor exato; 2º: valor próximo + nome parecido (evita roubar o par de outra conta).
  for (const exato of [true, false]) {
    for (const c of candidatas) {
      if (usadas.has(c.id)) continue;
      const i = txs.findIndex((t, k) => !contaDaTx.has(k) && !(t.cartao && (cartaoIds.has(t.contaId) || cartaoNomes.has(t.conta))) &&
        (exato ? Math.abs(Math.abs(t.valor) - c.valorMes) <= 0.05 : bate(c.valorMes, c.nome, t.valor, t.descricao)));
      if (i >= 0) {
        contaDaTx.set(i, c);
        usadas.add(c.id);
      }
    }
  }
  let total = 0;
  txs.forEach((t, k) => {
    const v = Math.abs(Number(t.valor) || 0);
    if (t.cartao && (cartaoIds.has(t.contaId) || cartaoNomes.has(t.conta))) return fora.cartao.push({ ...t, motivo: "fatura já contada" });
    if (contaDaTx.has(k)) return fora.conta.push({ ...t, motivo: contaDaTx.get(k).nome });
    const txt = normTxt(`${t.descricao} ${t.categoria} ${t.grupo}`);
    if (nomeOutra.length >= 3 && /transf|pix|ted|doc/.test(txt) && normTxt(t.descricao).split(" ").includes(nomeOutra)) {
      return fora.acerto.push({ ...t, motivo: "transferência para a outra pessoa da casa" });
    }
    total += v;
  });
  const tot = (l) => sum(l.map((t) => Math.abs(t.valor)));
  return {
    total: round2(total),
    fora,
    foraTotal: round2(tot(fora.cartao) + tot(fora.conta) + tot(fora.acerto)),
    cartoesContados,
    atualizado: g.atualizado_em || null,
  };
}

export function sobra(state, ym, vaga) {
  const membro = state.membros.find((m) => m.vaga === vaga);
  const renda = membro && membro.renda != null ? Number(membro.renda) : null;
  const casa = acerto(state, ym).metade;
  const pessoais = sum(contasDoMes(state, ym, "pessoal").map((i) => i.valorMes));
  const diaOrc = Number(state.prefs?.dia_a_dia || 0);
  const real = gastoReal(state, ym, vaga);
  // Real × orçamento: no começo do mês vale o orçamento; se o gasto real passar dele, vale o real.
  const diaDia = real ? Math.max(diaOrc, real.total) : diaOrc;
  const resto = renda === null ? null : round2(renda - casa - pessoais - diaDia);
  return { renda, casa, pessoais, diaDia, diaOrc, diaReal: real ? real.total : null, real, resto };
}

export function moradia(state, ym) {
  const itens = contasDoMes(state, ym, "casa").filter((i) => MORADIA.has(i.categoria));
  const total = sum(itens.map((i) => i.valorMes));
  const rendas = state.membros.map((m) => (m.renda == null ? null : Number(m.renda)));
  const rendaCasal = rendas.every((r) => r !== null) ? sum(rendas) : null;
  return { itens, total, rendaCasal, pct: rendaCasal ? (total / rendaCasal) * 100 : null };
}

export function historicoMoradia(state, ym, n = 12) {
  const out = [];
  for (let k = n - 1; k >= 0; k--) {
    const m = addYM(ym, -k);
    out.push([m, moradia(state, m).total]);
  }
  return out;
}

export function statusConta(item, ym, hoje = new Date()) {
  if (item.pago) return "paga";
  const d = diasAteVencer(item, ym, hoje);
  if (d < 0) return "atrasada";
  if (d === 0) return "hoje";
  return "aberta";
}

export function metaResumo(meta, aportes, hoje = new Date()) {
  const guardado = round2(Number(meta.inicial || 0) + sum(aportes.filter((a) => a.meta_id === meta.id).map((a) => a.valor)));
  const alvo = meta.alvo != null ? Number(meta.alvo) : null;
  const falta = alvo !== null ? Math.max(0, round2(alvo - guardado)) : null;
  let meses = null;
  if (meta.prazo) {
    const [y, m] = meta.prazo.split("-").map(Number);
    meses = (y - hoje.getFullYear()) * 12 + (m - (hoje.getMonth() + 1)) + 1;
  }
  const porMes = falta !== null && meses && meses > 0 ? round2(falta / meses) : null;
  return { guardado, alvo, falta, meses, porMes, pct: alvo ? Math.min(100, (guardado / alvo) * 100) : null };
}

export function parseMoney(v) {
  if (typeof v === "number") return v;
  let s = String(v ?? "").replace(/[R$\s ]/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? round2(n) : NaN;
}
