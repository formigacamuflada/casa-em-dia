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
    categoria: "cartao",
    pagador: cartao.pagador,
    pago: pagoNoMes(cartao, ym),
    ref: cartao,
  };
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
  return out.sort((a, b) => a.dia - b.dia || a.nome.localeCompare(b.nome, "pt-BR"));
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

export function sobra(state, ym, vaga) {
  const membro = state.membros.find((m) => m.vaga === vaga);
  const renda = membro && membro.renda != null ? Number(membro.renda) : null;
  const casa = acerto(state, ym).metade;
  const pessoais = sum(contasDoMes(state, ym, "pessoal").map((i) => i.valorMes));
  const diaDia = Number(state.prefs?.dia_a_dia || 0);
  const resto = renda === null ? null : round2(renda - casa - pessoais - diaDia);
  return { renda, casa, pessoais, diaDia, resto };
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
  const atual = ymOf(hoje);
  if (ym < atual) return "atrasada";
  if (ym > atual) return "aberta";
  const dia = Math.min(item.dia, daysIn(ym));
  if (dia < hoje.getDate()) return "atrasada";
  if (dia === hoje.getDate()) return "hoje";
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
