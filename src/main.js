import "./styles.css";
import "./theme.css";
import { logoAnimado, logoCompleto, logoSimbolo } from "./logo.js";
import { campoData, ligarDatas } from "./datas.js";
import { abrirGuiaPluggy, guiaDesligado } from "./guia.js";
ligarDatas();
import { createApi } from "./api.js";
import { ic } from "./icons.js";
import {
  CATEGORIAS, CAT_CURTA, acerto, addYM, contasDoMes, curYM, daysIn, historicoMoradia,
  bate, diasAteVencer, gastoReal, metaResumo, ordemDia, venceNoMesSeguinte, moradia, parseMoney, round2, sobra, statusConta, sum,
} from "./calc.js";

const api = window.__CASA_API__ || createApi();
const BASE = import.meta.env.BASE_URL || "./";
// A versão no endereço faz o navegador buscar de novo quando os ícones mudam.
const IMG_V = "2";
const img = (n) => `${BASE}img/${n}.webp?v=${IMG_V}`;

/* ------------------------------------------------------------------ estado */
const S = {
  session: null,
  data: null,
  month: curYM(),
  route: "inicio",
  filtro: "todas",
  syncing: false,
  diaSel: null,
  moradiaBase: "meu",
  gastosVisao: "grupo",
  gastoAberto: null,
  gastoTodas: false,
  ccSel: 0,
  range: {},
};
const ROUTES = ["inicio", "casa", "minhas", "cartoes", "investimentos", "ajustes"];

/* ------------------------------------------------------------------ util */
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (n) => BRL.format(Number(n) || 0);
const num = (n, d = 2) => new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
const pct = (n, d = 1) => `${num(n, d)}%`;
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const mesNome = (ym, curto = false) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return curto
    ? new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(d).replace(".", "")
    : capital(new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(d));
};
const mesCurtoAno = (ym) => `${mesNome(ym, true)}/${ym.slice(2, 4)}`;
const dataBR = (iso) => (iso ? new Date(String(iso).length <= 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("pt-BR") : "");
const horaBR = (iso) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const diaSemana = (ym, dia) => {
  const [y, m] = ym.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(new Date(y, m - 1, Math.min(dia, daysIn(ym)))).replace(".", "");
};
// Valor em destaque: "R$" discreto, inteiro forte, centavos menores (padrão de app financeiro).
function moneyParts(n) {
  const neg = Number(n) < 0;
  const [int, cents] = num(Math.abs(Number(n) || 0)).split(",");
  return `<span class="cur">${neg ? "−" : ""}R$</span><span class="int">${int}</span><span class="cents">,${cents}</span>`;
}
function money(n, cls = "big") {
  return `<div class="${cls}${Number(n) < 0 ? " neg" : ""}">${moneyParts(n)}</div>`;
}

/* ------------------------------------------------------------------ tema */
const TEMA_KEY = "casa-em-dia:tema";
function temaSalvo() {
  try { return localStorage.getItem(TEMA_KEY) || ""; } catch { return ""; }
}
function temaAtual() {
  const t = temaSalvo();
  if (t === "claro" || t === "escuro") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}
function aplicarTema(t) {
  if (t === "auto") {
    try { localStorage.removeItem(TEMA_KEY); } catch { /* sem armazenamento */ }
    t = null;
  } else if (t) {
    try { localStorage.setItem(TEMA_KEY, t); } catch { /* sem armazenamento: vale só nesta sessão */ }
  }
  const atual = t || TEMA_Q || temaAtual();
  document.documentElement.dataset.tema = atual;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", atual === "escuro" ? "#000000" : "#f3f2ef"));
  const escolha = temaSalvo() || "auto";
  document.querySelectorAll("[data-act=tema]").forEach((b) =>
    b.setAttribute("aria-pressed", String(b.closest(".tema-escolha") ? b.dataset.v === escolha : b.dataset.v === atual)),
  );
}
const TEMA_Q = { dark: "escuro", light: "claro" }[new URLSearchParams(location.search).get("tema")] || "";
{
  aplicarTema(TEMA_Q || null);
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener?.("change", () => { if (!temaSalvo()) aplicarTema(); });
}

/* ------------------------------------------------------------------ pessoas */
// Dados como a tela deve mostrar: sem os itens que estão no prazo do Desfazer.
let visCache = { data: null, ver: -1, out: null };
const D = () => {
  if (!lixeira.size || !S.data || S.data.semCasa) return S.data;
  if (visCache.data !== S.data || visCache.ver !== lixVer) {
    const out = { ...S.data };
    for (const [tabela, chaveDados] of Object.entries(DADOS_DA_TABELA)) {
      if (Array.isArray(out[chaveDados])) out[chaveDados] = out[chaveDados].filter((x) => !lixeira.has(`${tabela}:${x.id}`));
    }
    visCache = { data: S.data, ver: lixVer, out };
  }
  return visCache.out;
};
const meId = () => S.session?.user?.id;
const eu = () => D()?.membros.find((m) => m.user_id && m.user_id === meId()) || null;
const minhaVaga = () => eu()?.vaga || null;
const outra = () => (minhaVaga() === "a" ? "b" : "a");
function nome(vaga, { voce = true } = {}) {
  if (voce && vaga === minhaVaga()) return "Você";
  const m = D()?.membros.find((x) => x.vaga === vaga);
  return m?.apelido || (vaga === "a" ? "Pessoa 1" : "Pessoa 2");
}
const inicial = (vaga) => (nome(vaga, { voce: false }).trim()[0] || "?").toUpperCase();
const avatar = (vaga, sm = false) => `<span class="av ${vaga}${sm ? " sm" : ""}" aria-hidden="true">${esc(inicial(vaga))}</span>`;
const badge = (escopo) =>
  escopo === "casa"
    ? `<span class="badge shared">${ic("pessoas", "sm")}Os dois veem</span>`
    : `<span class="badge private">${ic("cadeado", "sm")}Só você vê</span>`;
const ill = (n) => `<img class="ill" src="${img(n)}" alt="" width="44" height="44" loading="lazy">`;

/* ------------------------------------------------------------------ toast & dica */
let toastTimer;
// acao opcional: { label, fn, ms } vira um botão dentro do aviso (ex.: Desfazer).
function toast(msg, err = false, acao = null) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  if (acao) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-act";
    b.textContent = acao.label;
    b.onclick = () => {
      clearTimeout(toastTimer);
      t.hidden = true;
      acao.fn();
    };
    t.append(b);
  }
  t.className = `toast${err ? " err" : ""}${acao ? " has-act" : ""}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), acao ? acao.ms || 7000 : err ? 6000 : 3000);
}

/* ---- avisos (sininho): o que a outra pessoa mudou nas coisas da casa ---- */
const avisosVistos = new Set();
const chaveAviso = (a) => `${a.id}|${a.criado_em}`;
const avisosNaoLidos = () => (D()?.avisos || []).filter((a) => !a.lido_em);
function mesAviso(ym) {
  if (!ym) return "";
  const t = mesNome(ym).toLowerCase();
  return ym.slice(0, 4) === curYM().slice(0, 4) ? t.split(" de ")[0] : t;
}
function tempoAviso(iso) {
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  if (d.toDateString() === hoje.toDateString()) return `há ${Math.floor(min / 60)} h`;
  if (d.toDateString() === ontem.toDateString()) return `ontem, ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}, ${hora}`;
}
// Frase do aviso (sem o nome de quem fez). Os nomes vêm de dados guardados na hora da mudança.
function fraseAviso(a) {
  const d = a.dados || {};
  const n = d.nome || "";
  const mes = mesAviso(d.mes);
  const cartao = a.tabela === "cartoes";
  const v = (x) => brl(Math.abs(Number(x) || 0));
  switch (a.acao) {
    case "criou": return cartao ? `cadastrou o cartão da casa ${n}` : `lançou a conta da casa ${n}${d.valor != null ? ` · ${v(d.valor)}` : ""}`;
    case "apagou": return cartao ? `apagou o cartão ${n}` : `apagou a conta ${n}`;
    case "editou": return cartao ? `editou o cartão ${n}` : `editou a conta ${n}`;
    case "pago":
      if (cartao) return d.pago ? `marcou a fatura de ${mes} do ${n} como paga` : `marcou a fatura de ${mes} do ${n} como não paga`;
      return d.pago ? `marcou ${n} como paga em ${mes}` : `marcou ${n} como não paga em ${mes}`;
    case "valor_mes":
      if (cartao) return d.valor == null ? `apagou a fatura de ${mes} do ${n}` : `informou a fatura de ${mes} do ${n}: ${v(d.valor)}`;
      return d.valor == null ? `voltou ${n} ao valor mensal em ${mes}` : `mudou o valor de ${n} em ${mes} para ${v(d.valor)}`;
    case "dividiu": return cartao ? `passou o cartão ${n} para a casa` : `passou a dividir ${n} com você`;
    case "tirou": return cartao ? `tirou o cartão ${n} da casa` : `tirou ${n} das contas da casa`;
    case "meta_criou": return `criou a meta ${n}`;
    case "meta_editou": return `editou a meta ${n}`;
    case "meta_apagou": return `apagou a meta ${n}`;
    case "aporte": return Number(d.valor) >= 0 ? `guardou ${v(d.valor)} na meta ${d.meta}` : `tirou ${v(d.valor)} da meta ${d.meta}`;
    case "aporte_apagou": return `apagou um aporte de ${v(d.valor)} da meta ${d.meta}`;
    case "acerto": return `marcou o acerto de ${mes} como feito`;
    case "acerto_desfeito": return `desfez o acerto de ${mes}`;
    case "renda": return "atualizou a renda";
    case "entrou": return "entrou na casa";
    case "saiu": return "saiu da casa";
    default: return "fez uma alteração";
  }
}
const autorAviso = (a) => a.autor_nome || (a.autor_vaga ? nome(a.autor_vaga, { voce: false }) : "Alguém");
const ROTA_AVISO = { contas: "casa", cartoes: "cartoes", metas: "investimentos", aportes: "investimentos", acertos: "casa", membros: "casa" };
function renderSino() {
  const btn = $("#sinoBtn");
  if (!btn) return;
  const n = avisosNaoLidos().length;
  const badge = $("#sinoN");
  badge.hidden = !n;
  badge.textContent = n > 9 ? "9+" : String(n);
  btn.classList.toggle("tem", n > 0);
  btn.setAttribute("aria-label", n ? `Avisos, ${n} não ${n === 1 ? "lido" : "lidos"}` : "Avisos");
  const pop = $("#avisosPop");
  if (!pop.hidden) pop.innerHTML = htmlAvisos();
}
function htmlAvisos() {
  const lista = D()?.avisos || [];
  const n = avisosNaoLidos().length;
  const quem = D()?.membros.some((m) => m.vaga === outra() && m.user_id) ? nome(outra(), { voce: false }) : "a outra pessoa";
  const itens = lista.length
    ? `<div class="av-list">${lista
        .map((a) => `<button class="av-item${a.lido_em ? "" : " novo"}" data-act="aviso" data-id="${a.id}">${a.autor_vaga ? avatar(a.autor_vaga, true) : ""}<span class="av-txt"><span><b>${esc(autorAviso(a))}</b> ${esc(fraseAviso(a))}</span><small>${tempoAviso(a.criado_em)}</small></span>${a.lido_em ? "" : `<i class="av-dot"><span class="sr-only">não lido</span></i>`}</button>`)
        .join("")}</div>`
    : `<div class="av-vazio">${ic("sino")}<p>Nenhum aviso ainda</p><span>Quando ${esc(quem)} mudar alguma coisa da casa, aparece aqui.</span></div>`;
  return `<div class="av-head"><strong>Avisos</strong>${n ? `<button class="link-btn" data-act="avisos-lidos">Marcar todos como lidos</button>` : ""}</div>${itens}`;
}
function abrirAvisos(abrir = $("#avisosPop")?.hidden) {
  const pop = $("#avisosPop");
  if (!pop) return;
  if (abrir) pop.innerHTML = htmlAvisos();
  pop.hidden = !abrir;
  $("#sinoBtn").setAttribute("aria-expanded", String(abrir));
  if (abrir) pop.querySelector(".av-item, .link-btn")?.focus({ preventScroll: true });
}
function marcarLidosLocal(ids) {
  const agora = new Date().toISOString();
  for (const a of S.data?.avisos || []) if (!a.lido_em && (!ids || ids.includes(a.id))) a.lido_em = agora;
  visCache.ver = -1;
  renderSino();
}
async function lerAvisos(ids) {
  marcarLidosLocal(ids);
  try {
    await api.marcarLidos(ids);
  } catch (e) {
    toast(erroMsg(e), true);
    reload();
  }
}
// Avisos que chegaram com o app aberto: um aviso curto embaixo, com "Ver".
function avisarNovos(antes) {
  const novos = (D()?.avisos || []).filter((a) => !a.lido_em && !antes.has(chaveAviso(a)));
  for (const a of D()?.avisos || []) avisosVistos.add(chaveAviso(a));
  if (!novos.length) return;
  const msg = novos.length === 1 ? `${autorAviso(novos[0])} ${fraseAviso(novos[0])}.` : `${autorAviso(novos[0])} fez ${novos.length} alterações.`;
  toast(msg, false, { label: "Ver", ms: 6000, fn: () => abrirAvisos(true) });
}

/* ---- apagar com Desfazer: o item some na hora e só é apagado no banco depois do prazo ---- */
const DESFAZER_MS = 7000;
const DADOS_DA_TABELA = { contas: "contas", cartoes: "cartoes", metas: "metas", investimentos: "invest" };
const lixeira = new Map(); // "tabela:id" -> { timer, commit }
let lixVer = 0;
function apagarComDesfazer(tabela, id, msg, depois) {
  const chave = `${tabela}:${id}`;
  const commit = async () => {
    const item = lixeira.get(chave);
    if (!item) return;
    clearTimeout(item.timer);
    lixeira.delete(chave);
    try {
      await api.apagar(tabela, id);
      if (depois) await depois();
    } catch (e) {
      console.error(e);
      toast(`Não consegui apagar: ${erroMsg(e)}`, true);
    }
    lixVer++;
    await reload();
  };
  lixeira.set(chave, { timer: setTimeout(commit, DESFAZER_MS), commit });
  lixVer++;
  render();
  toast(msg, false, {
    label: "Desfazer",
    ms: DESFAZER_MS,
    fn: () => {
      const item = lixeira.get(chave);
      if (!item) return;
      clearTimeout(item.timer);
      lixeira.delete(chave);
      lixVer++;
      render();
      toast("Pronto, voltou.");
    },
  });
  return true;
}
// Fechou o app no meio do prazo: tenta concluir as exclusões (se não der, o item continua lá).
window.addEventListener("pagehide", () => lixeira.forEach((v) => v.commit()));
function erroMsg(e) {
  const m = String(e?.message || e || "");
  if (/Failed to fetch|NetworkError|network/i.test(m)) return "Sem conexão. Confira a internet e tente de novo.";
  if (/row-level security|permission/i.test(m)) return "Você não tem permissão para alterar isso.";
  if (/Invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/Email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/User already registered/i.test(m)) return "Já existe uma conta com esse e-mail. Use Entrar.";
  if (/Password should be/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  return m || "Não foi possível concluir. Tente de novo.";
}
async function act(fn, ok) {
  try {
    await fn();
    if (ok) toast(ok);
    await reload();
    return true;
  } catch (e) {
    console.error(e);
    toast(erroMsg(e), true);
    return false;
  }
}

const tip = () => $("#tip");
document.addEventListener("pointermove", (e) => {
  const t = e.target.closest?.("[data-tip]");
  if (!t) {
    tip().hidden = true;
    return;
  }
  tip().textContent = t.dataset.tip;
  tip().hidden = false;
  const r = tip().getBoundingClientRect();
  tip().style.left = `${Math.min(window.innerWidth - r.width - 8, e.clientX + 12)}px`;
  tip().style.top = `${Math.max(8, e.clientY - r.height - 12)}px`;
});

/* ------------------------------------------------------------------ boot */
async function boot() {
  if (!api) {
    document.body.innerHTML = `<div class="auth"><div class="auth-card"><div class="banner err">${ic("alerta")}<div class="grow">Este build está sem a chave do Supabase (VITE_SUPABASE_ANON_KEY). Gere de novo pelo GitHub Actions.</div></div></div></div>`;
    return;
  }
  api.auth.onChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      S.session = session;
      renderAuth("nova");
      return;
    }
    const antes = S.session?.user?.id;
    S.session = session;
    if (event === "SIGNED_OUT") {
      S.data = null;
      renderAuth("entrar");
    } else if (session && session.user.id !== antes && event === "SIGNED_IN") {
      start();
    }
  });
  S.session = await api.auth.session();
  if (!S.session) renderAuth("entrar");
  else start();
}

let unsub = null;
let reloadTimer = null;
async function start() {
  document.body.classList.remove("is-auth");
  renderLoading();
  const inicio = Date.now();
  try {
    S.data = await api.loadAll();
  } catch (e) {
    renderFatal(erroMsg(e));
    return;
  }
  for (const a of S.data?.avisos || []) avisosVistos.add(chaveAviso(a));
  await fimDaAbertura(inicio);
  if (S.data.semCasa) {
    renderOnboarding();
    return;
  }
  renderShell();
  ultimaRota = null;
  route();
  if (unsub) unsub();
  unsub = api.subscribe(() => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(reload, 350);
  });
  refreshMercado();
  // Guia do Meu Pluggy: abre sozinho a cada abertura do app até a pessoa marcar
  // "Não mostrar novamente". "Ver mais tarde" = volta na próxima abertura.
  if (!guiaDesligado(S.session?.user)) {
    setTimeout(() => {
      if (S.data && !guiaDesligado(S.session?.user) && !document.querySelector("dialog[open]")) abrirGuia();
    }, 1800);
  }
}
function abrirGuia() {
  abrirGuiaPluggy({
    user: S.session?.user,
    onConectar: () => conectarBanco(),
    onNunca: async (nunca) => {
      try {
        await api.auth.salvarMeta({ guia_pluggy: nunca ? "nunca" : null });
      } catch (e) {
        console.error(e); // fica salvo pelo menos neste aparelho
      }
    },
  });
}
async function reload() {
  if (!S.session) return;
  try {
    const d = await api.loadAll();
    if (d.semCasa) {
      S.data = d;
      renderOnboarding();
      return;
    }
    const tinhaShell = Boolean($("#main"));
    S.data = d;
    if (!tinhaShell) renderShell();
    render();
    avisarNovos(new Set(avisosVistos));
  } catch (e) {
    console.error(e);
  }
}
async function refreshMercado() {
  const m = D()?.mercado;
  const velho = !m || Date.now() - Date.parse(m.atualizado_em) > 12 * 3600 * 1000;
  if (!velho) return;
  try {
    const r = await api.atualizarMercado(false);
    if (r?.atualizado) reload();
  } catch {
    /* sem rede ou função ainda não publicada: segue com o último retrato */
  }
}

/* ------------------------------------------------------------------ telas fora do app */
// A abertura sempre termina antes de o app aparecer: a marca se monta (~2,3 s),
// fica um instante e some com um fade. Com "reduzir movimento", não espera.
const ABERTURA_MS = 2700;
async function fimDaAbertura(inicio) {
  const tela = document.querySelector(".loading-screen");
  if (!tela || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const falta = ABERTURA_MS - (Date.now() - inicio);
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
  tela.classList.add("sai");
  await new Promise((r) => setTimeout(r, 320));
}
function renderLoading() {
  document.body.innerHTML = `<div class="loading-screen" role="status"><h1 class="sr-only">Casa em Dia</h1>${logoAnimado()}<span class="sr-only">Carregando</span></div><div id="toast" hidden></div><div id="tip" class="tip" hidden></div>`;
}
function renderFatal(msg) {
  document.body.innerHTML = `<div class="auth"><div class="auth-card"><div class="auth-brand"><h1 class="sr-only">Casa em Dia</h1>${logoCompleto("logo-auth")}</div><div class="banner err">${ic("alerta")}<div class="grow">${esc(msg)}</div><button class="btn btn-sm" id="retry">Tentar de novo</button></div></div></div><div id="toast" hidden></div><div id="tip" class="tip" hidden></div>`;
  $("#retry").onclick = start;
}
// A marca se monta na primeira vez que a tela de entrada aparece (não a cada troca de aba).
let entradaAnimada = false;
function renderAuth(modo) {
  const animarEntrada = !entradaAnimada;
  entradaAnimada = true;
  document.body.classList.add("is-auth");
  const titulos = { entrar: "Entrar", criar: "Criar conta", esqueci: "Recuperar senha", nova: "Nova senha" };
  const textos = {
    entrar: "Use o e-mail e a senha da sua conta.",
    criar: "Cada um cria a própria conta. Depois um cria a casa e o outro entra com o código de convite.",
    esqueci: "Enviamos um link para você criar uma senha nova.",
    nova: "Digite a nova senha da sua conta.",
  };
  document.body.innerHTML = `
  <div class="auth"><div class="auth-card${animarEntrada ? " entra" : ""}">
    <div class="auth-brand"><h1 class="sr-only">Casa em Dia</h1>${animarEntrada ? logoAnimado("logo-auth") : logoCompleto("logo-auth")}</div>
    <form class="card" id="authForm" novalidate>
      <div><h2 style="font-size:18px;font-weight:650">${titulos[modo]}</h2><p class="muted" style="margin-top:4px;font-size:14px">${textos[modo]}</p></div>
      ${modo !== "nova" ? `<div class="field"><label for="email">E-mail</label><input class="inp" id="email" type="email" autocomplete="email" required></div>` : ""}
      ${modo !== "esqueci" ? `<div class="field"><label for="senha">Senha</label><input class="inp" id="senha" type="password" minlength="6" autocomplete="${modo === "entrar" ? "current-password" : "new-password"}" required><span class="hint">${modo === "entrar" ? "" : "Pelo menos 6 caracteres."}</span></div>` : ""}
      <p class="err" id="authErr" role="alert" style="color:var(--danger);font-size:13.5px" hidden></p>
      <button class="btn btn-primary" type="submit">${{ entrar: "Entrar", criar: "Criar conta", esqueci: "Enviar link", nova: "Salvar senha" }[modo]}</button>
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
        ${modo === "entrar" ? `<button type="button" class="link-btn" data-modo="criar">Criar conta</button><button type="button" class="link-btn" data-modo="esqueci">Esqueci a senha</button>` : ""}
        ${modo === "criar" || modo === "esqueci" ? `<button type="button" class="link-btn" data-modo="entrar">Já tenho conta</button>` : ""}
      </div>
    </form>
    <p class="faint" style="font-size:12.5px">Os dados da casa ficam visíveis para os dois; o que é pessoal, só para quem lançou.</p>
  </div></div><div id="toast" hidden></div><div id="tip" class="tip" hidden></div>`;
  document.querySelectorAll("[data-modo]").forEach((b) => (b.onclick = () => renderAuth(b.dataset.modo)));
  $("#authForm").onsubmit = async (e) => {
    e.preventDefault();
    const email = $("#email")?.value.trim();
    const senha = $("#senha")?.value || "";
    const errEl = $("#authErr");
    const btn = e.target.querySelector("button[type=submit]");
    errEl.hidden = true;
    if (modo !== "nova" && !/^\S+@\S+\.\S+$/.test(email || "")) return showErr("Informe um e-mail válido.");
    if (modo !== "esqueci" && senha.length < 6) return showErr("A senha precisa ter pelo menos 6 caracteres.");
    btn.disabled = true;
    try {
      if (modo === "entrar") await api.auth.signIn(email, senha);
      if (modo === "criar") {
        const logado = await api.auth.signUp(email, senha);
        if (!logado) {
          renderAuth("entrar");
          toast("Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.");
        }
      }
      if (modo === "esqueci") {
        await api.auth.reset(email);
        toast("Se o e-mail tiver conta, o link chega em instantes.");
        renderAuth("entrar");
      }
      if (modo === "nova") {
        await api.auth.newPassword(senha);
        toast("Senha atualizada.");
        start();
      }
    } catch (err) {
      showErr(erroMsg(err));
    } finally {
      btn.disabled = false;
    }
    function showErr(m) {
      errEl.textContent = m;
      errEl.hidden = false;
    }
  };
  (document.querySelector("#email") || document.querySelector("#senha"))?.focus();
}

function renderOnboarding() {
  document.body.innerHTML = `
  <div class="auth"><div class="auth-card onb">
    <div class="auth-brand">${logoSimbolo("logo-auth-sim")}<h1>Bem-vindo ao Casa em Dia</h1></div>
    <p class="muted">Um de vocês cria a casa. O outro entra com o código de convite que aparece em Ajustes.</p>
    <div class="onb-grid">
      <form class="card" id="fCriar">
        <div class="card-head"><img class="ill" src="${img("casa")}" alt="" width="44" height="44"><div class="grow"><h2>Criar a casa</h2><p class="sub">Você será a pessoa 1</p></div></div>
        <div class="field"><label for="apA">Como quer ser chamado?</label><input class="inp" id="apA" maxlength="40" placeholder="Ex.: João" required></div>
        <button class="btn btn-primary" type="submit">Criar a casa</button>
      </form>
      <form class="card" id="fEntrar">
        <div class="card-head"><img class="ill" src="${img("canecas")}" alt="" width="44" height="44"><div class="grow"><h2>Entrar com convite</h2><p class="sub">Use o código de 8 caracteres</p></div></div>
        <div class="field"><label for="cod">Código de convite</label><input class="inp" id="cod" maxlength="8" autocapitalize="characters" autocomplete="off" required></div>
        <div class="field"><label for="apB">Como quer ser chamada(o)?</label><input class="inp" id="apB" maxlength="40" required></div>
        <button class="btn" type="submit">Entrar na casa</button>
      </form>
    </div>
    <button class="link-btn" id="sairOnb" style="align-self:flex-start">Sair desta conta</button>
  </div></div><div id="toast" hidden></div><div id="tip" class="tip" hidden></div>`;
  $("#fCriar").onsubmit = async (e) => {
    e.preventDefault();
    const ap = $("#apA").value.trim();
    if (!ap) return toast("Informe como quer ser chamado.", true);
    try {
      await api.criarCasa(ap);
      start();
    } catch (err) {
      toast(erroMsg(err), true);
    }
  };
  $("#fEntrar").onsubmit = async (e) => {
    e.preventDefault();
    const cod = $("#cod").value.trim();
    const ap = $("#apB").value.trim();
    if (cod.length !== 8) return toast("O código tem 8 letras e números.", true);
    if (!ap) return toast("Informe como quer ser chamada(o).", true);
    try {
      await api.entrarNaCasa(cod, ap);
      start();
    } catch (err) {
      toast(erroMsg(err), true);
    }
  };
  $("#sairOnb").onclick = () => api.auth.signOut();
}

/* ------------------------------------------------------------------ shell */
const NAV = [
  ["inicio", "Visão geral", "Início", "inicio"],
  ["casa", "Nossa casa", "Casa", "casa"],
  ["minhas", "Minhas contas", "Minhas", "carteira"],
  ["cartoes", "Cartões", "Cartões", "cartao"],
  ["investimentos", "Investimentos", "Investir", "invest"],
];
function renderShell() {
  document.body.innerHTML = `
  <div class="app">
    <aside class="side" aria-label="Navegação">
      <a class="brand" href="#inicio" aria-label="Casa em Dia, visão geral">${logoCompleto("logo-side")}</a>
      <div class="casa-row" id="sideBrand"></div>
      <nav class="nav" aria-label="Seções">
        <div class="nav-lbl">Menu</div>
        ${NAV.map(([r, label, , icon]) => `<a href="#${r}" data-route="${r}">${ic(icon)}<span>${label}</span></a>`).join("")}
        <div class="nav-lbl">Ajustes</div>
        <a href="#ajustes" data-route="ajustes">${ic("ajustes")}<span>Ajustes da casa</span></a>
      </nav>
      <div class="side-foot">
        <div class="tema-row"><span>${ic(temaAtual() === "escuro" ? "lua" : "sol", "sm")}Tema</span><div class="tema-ctl" role="group" aria-label="Tema"><button data-act="tema" data-v="claro" aria-label="Claro">${ic("sol", "sm")}</button><button data-act="tema" data-v="escuro" aria-label="Escuro">${ic("lua", "sm")}</button></div></div>
        <div id="sideMe"></div>
      </div>
    </aside>
    <div class="main-col">
      <header class="top"><div class="top-in">
        <div class="month">
          <button class="icon-btn" data-act="mes-ant" aria-label="Mês anterior">${ic("esq")}</button>
          <button class="icon-btn" data-act="mes-prox" aria-label="Próximo mês">${ic("dir")}</button>
          <div class="month-label" id="monthLabel" aria-live="polite"></div>
          <button class="btn btn-ghost btn-sm" data-act="mes-hoje" id="hojeBtn" hidden>Mês atual</button>
        </div>
        <div class="top-right">
          <button class="icon-btn only-compact" data-act="tema-troca" aria-label="Trocar tema">${ic(temaAtual() === "escuro" ? "sol" : "lua")}</button>
          <a class="icon-btn only-compact" href="#ajustes" aria-label="Ajustes">${ic("ajustes")}</a>
          <div class="sino-wrap">
            <button class="icon-btn sino" id="sinoBtn" data-act="avisos" aria-label="Avisos" aria-haspopup="dialog" aria-expanded="false" aria-controls="avisosPop">${ic("sino")}<span class="sino-n" id="sinoN" hidden></span></button>
            <div class="avisos-pop" id="avisosPop" role="dialog" aria-label="Avisos" hidden></div>
          </div>
          <button class="btn btn-primary lancar" data-act="lancar" aria-label="Lançar">${ic("mais")}<span class="btn-label">Lançar</span></button>
        </div>
      </div></header>
      <main id="main" tabindex="-1"></main>
    </div>
    <nav class="tabbar" aria-label="Seções">
      ${NAV.map(([r, , short, icon]) => `<a href="#${r}" data-route="${r}">${ic(icon)}<span>${short}</span></a>`).join("")}
    </nav>
  </div>
  <dialog class="sheet" id="sheet" aria-labelledby="sheetTitle"></dialog>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  <div id="tip" class="tip" role="tooltip" hidden></div>`;
}

let ultimaRota = null;
function route() {
  const h = location.hash.replace("#", "");
  S.route = ROUTES.includes(h) ? h : "inicio";
  render();
  $("#main")?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  if (S.route !== ultimaRota) animarEntrada(ultimaRota === null ? "abre" : "nav");
  ultimaRota = S.route;
}

/* ------------------------------------------------------- animação de entrada
   Na abertura (logado ou recém-entrado): blocos sobem em sequência, números
   contam do zero, barras crescem, linhas dos gráficos se desenham, ícones
   aparecem. Ao trocar de página, a mesma coisa mais curta e sem contagem.
   Atualizações em tempo real não animam (render() desliga a classe). */
const ITENS_ANIMADOS = ".gx-row, .bill, .todo-row, .mor-it, .meta-it, .cc-row, .day-pills > *, .stats > .stat, .who-list > *, .sb-legend > *, .kv > *, .hist-axis";
let fimAnima = null;
function animarEntrada(modo) {
  const raiz = document.documentElement;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const page = $("#main .page");
  if (!page) return;
  raiz.classList.remove("anima", "anima-nav");
  void raiz.offsetWidth; // reinicia as animações
  const cards = [...page.querySelectorAll(".card, .page-head, .banner")];
  const passo = modo === "abre" ? 75 : 45;
  cards.forEach((c, i) => {
    c.style.setProperty("--i", Math.min(i, 12));
    c.style.setProperty("--d", `${Math.min(i, 12) * passo}ms`);
    c.querySelectorAll(ITENS_ANIMADOS).forEach((it, j) => {
      it.classList.add("en-it");
      it.style.setProperty("--j", Math.min(j, 14));
    });
    c.querySelectorAll(".glass-bars .gb").forEach((b, j) => b.style.setProperty("--j", j));
  });
  raiz.classList.add("anima", modo === "nav" ? "anima-nav" : "anima-abre");
  if (modo === "abre") contarNumeros(page);
  clearTimeout(fimAnima);
  fimAnima = setTimeout(() => raiz.classList.remove("anima", "anima-nav", "anima-abre"), modo === "abre" ? 3200 : 2000);
}
function pararAnimacao() {
  clearTimeout(fimAnima);
  document.documentElement.classList.remove("anima", "anima-nav", "anima-abre");
  document.querySelectorAll(".contando").forEach((el) => el.classList.remove("contando"));
}
function contarNumeros(page) {
  const fmt = new Intl.NumberFormat("pt-BR");
  const alvos = [...page.querySelectorAll(".big .int")].slice(0, 30);
  const dados = alvos.map((el) => {
    const card = el.closest(".card");
    const atraso = parseFloat(card?.style.getPropertyValue("--d")) || 0;
    const cents = el.nextElementSibling?.classList.contains("cents") ? el.nextElementSibling : null;
    const inteiro = Number(el.textContent.replace(/\D/g, "")) || 0;
    const centavos = cents ? Number(cents.textContent.replace(/\D/g, "")) || 0 : 0;
    el.parentElement.classList.add("contando");
    return { el, cents, alvo: inteiro + centavos / 100, atraso: atraso + 150, txtInt: el.textContent, txtCents: cents?.textContent };
  });
  if (!dados.length) return;
  const dur = 1300;
  const t0 = performance.now();
  const ease = (t) => 1 - Math.pow(1 - t, 4);
  const passo = (agora) => {
    let vivos = 0;
    for (const d of dados) {
      if (!d.el.isConnected) continue;
      const t = Math.min(1, Math.max(0, (agora - t0 - d.atraso) / dur));
      if (t >= 1) {
        d.el.textContent = d.txtInt;
        if (d.cents) d.cents.textContent = d.txtCents;
        d.el.parentElement.classList.remove("contando");
        continue;
      }
      vivos++;
      const v = d.alvo * ease(t);
      d.el.textContent = fmt.format(Math.floor(v));
      if (d.cents) d.cents.textContent = `,${String(Math.floor((v % 1) * 100)).padStart(2, "0")}`;
    }
    if (vivos) requestAnimationFrame(passo);
  };
  requestAnimationFrame(passo);
}
window.addEventListener("hashchange", route);

function render() {
  if (!$("#main") || !D() || D().semCasa) return;
  pararAnimacao();
  document.querySelectorAll("[data-route]").forEach((a) =>
    a.dataset.route === S.route ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"),
  );
  const [mm, aa] = mesNome(S.month).split(" de ");
  $("#monthLabel").innerHTML = `${esc(mm)} <span>${esc(aa || "")}</span>`;
  $("#hojeBtn").hidden = S.month === curYM();
  const me = eu();
  const junta = D().membros.every((m) => m.user_id);
  $("#sideBrand").innerHTML = `<span class="pair">${avatar("a", true)}${avatar("b", true)}</span><div class="who"><strong>${esc(D().casa?.nome || "Casa em Dia")}</strong><span>Finanças em casal</span></div>`;
  $("#sideMe").innerHTML = me
    ? `<a class="me-card" href="#ajustes">${avatar(me.vaga)}<div class="who"><strong>${esc(nome(me.vaga, { voce: false }))}</strong><span class="${junta ? "ok" : "pend"}"><i></i>${junta ? "Casa compartilhada" : "Aguardando a outra pessoa"}</span></div></a>`
    : "";
  aplicarTema(temaSalvo() || null);
  renderSino();
  const pages = { inicio: pInicio, casa: pCasa, minhas: pMinhas, cartoes: pCartoes, investimentos: pInvest, ajustes: pAjustes };
  $("#main").innerHTML = `<div class="page">${pages[S.route]()}</div>`;
  document.title = S.route === "inicio" ? "Casa em Dia" : `${{ casa: "Casa", minhas: "Minhas contas", cartoes: "Cartões", investimentos: "Investimentos", ajustes: "Ajustes" }[S.route]} · Casa em Dia`;
}

/* ------------------------------------------------------------------ blocos */
function pageHead(titulo, sub, acoes = "") {
  return `<div class="page-head"><div><h1>${titulo}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${acoes ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${acoes}</div>` : ""}</div>`;
}
const ILL_ANTIGO = { pote: "carteira", envelope: "recibo", sofa: "casa", planta: "grafico" };
function cardHead(icone, titulo, sub, escopo, extra = "") {
  return `<div class="ctop"><div class="grow"><h2>${titulo}</h2>${sub ? `<p class="sub">${sub}</p>` : ""}</div>${extra}${escopo ? badge(escopo) : ""}${icone ? ill3d(ILL_ANTIGO[icone] || icone, 52) : ""}</div>`;
}
const vazio = (icone, titulo, texto, botao = "") =>
  `<div class="empty">${icone ? `<img class="ill" src="${img(icone)}" alt="" width="72" height="72" loading="lazy">` : ""}<h3>${titulo}</h3><p>${texto}</p>${botao}</div>`;

/* ---- ícones de tipo de conta ---- */
function iconeConta(nomeConta, cat) {
  const n = String(nomeConta || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/alugu|financiam|prestac|apartamento|imovel/.test(n)) return "chave";
  if (/condom/.test(n)) return "predio";
  if (/\bluz\b|energia|cemig|enel|light|celesc|copel/.test(n)) return "raio";
  if (/internet|wi-?fi|fibra|vivo|claro|tim\b|oi\b/.test(n)) return "wifi";
  if (/agua|copasa|sabesp|saneam/.test(n)) return "gota";
  if (/\bgas\b|comgas|botijao/.test(n)) return "chama";
  if (/iptu|imposto|taxa/.test(n)) return "doc";
  if (/obra|reforma|pedreiro/.test(n)) return "ferramenta";
  if (/seguro/.test(n)) return "escudo";
  if (/netflix|spotify|streaming|prime|disney|youtube|hbo|max\b/.test(n)) return "play";
  if (/reserva|poupanc|guardar|investir|aporte/.test(n)) return "cofre";
  return {
    moradia: "casa", consumo: "raio", mercado: "carrinho", transporte: "carro", saude: "saude", educacao: "livro",
    lazer: "festa", assinaturas: "play", reserva: "cofre", cartao: "cartao",
  }[cat] || "doc";
}
const tileIcon = (nomeConta, cat, extra = "") => `<span class="ico-tile ${extra}">${ic(iconeConta(nomeConta, cat), "sm")}</span>`;

/* ---- ilustrações 3D (um nome por função; troca de arquivo em um lugar só) ---- */
const ILL = {
  carteira: "carteira", calendario: "calendario", balanca: "balanca", cartoes: "cartoes", casa: "casa", cofre: "cofre",
  grafico: "grafico", bussola: "bussola", cadeado: "cadeado", canecas: "canecas", recibo: "recibo", alvo: "alvo",
};
const ill3d = (k, size = 64) => `<img class="ill3d" src="${img(ILL[k] || k)}" alt="" width="${size}" height="${size}" loading="lazy">`;

function cardTop(titulo, { sub = "", icone = "", escopo = "", extra = "" } = {}) {
  return `<div class="ctop"><div class="grow"><h2>${titulo}${sub ? ` <span class="csub">${sub}</span>` : ""}</h2>${extra}</div>${escopo ? badge(escopo) : ""}${icone ? ill3d(icone) : ""}</div>`;
}

/* ---- saldo previsto ---- */
function blocoSobra(span = "w2") {
  const v = minhaVaga();
  const s = sobra(D(), S.month, v);
  if (s.renda === null) {
    return `<section class="card ${span} c-saldo">${cardTop("Saldo previsto", { icone: "carteira", escopo: "pessoal" })}
      ${vazio("", "Informe sua renda", "Com a renda, o app mostra quanto sobra depois da sua metade da casa, das suas contas pessoais e do dia a dia.", `<button class="btn btn-primary btn-sm" data-act="renda" data-vaga="${v}">Informar renda</button>`)}</section>`;
  }
  const base = Math.max(s.renda, 1);
  const partes = [
    ["casa", "Sua metade da casa", s.casa],
    ["pess", "Contas pessoais", s.pessoais],
    ["dia", "Dia a dia", s.diaDia],
  ];
  const gasto = s.casa + s.pessoais + s.diaDia;
  const escala = Math.max(base, gasto);
  const livre = s.renda > 0 ? (s.resto / s.renda) * 100 : 0;
  const pctDe = (x) => (x / base) * 100;
  const segs = [...partes.map(([k, l, val]) => [k, l, val]), ["sobra", "Sobra", Math.max(0, s.resto)]]
    .filter(([, , val]) => val > 0)
    .map(([k, l, val]) => `<div class="sb-seg ${k}" style="flex:${(val / escala).toFixed(4)}" data-tip="${l}: ${brl(val)}"></div>`)
    .join("");
  return `<section class="card ${span} c-saldo">
    ${cardTop("Saldo previsto", { icone: "carteira", escopo: "pessoal" })}
    <div class="hero">
      ${money(s.resto, "big xl")}
      <div class="hero-side">
        <span class="pill ${s.resto >= 0 ? "pos" : "neg"}">${ic(s.resto >= 0 ? "sobe" : "desce", "sm")}${s.resto >= 0 ? `${pct(livre, 0)} do salário livre` : "Contas passam da renda"}</span>
        <span class="faint">valor estimado após pagar todas as contas</span>
      </div>
    </div>
    <div class="sb-bar" role="img" aria-label="Divisão da renda: metade da casa ${brl(s.casa)}, contas pessoais ${brl(s.pessoais)}, dia a dia ${brl(s.diaDia)}, sobra ${brl(Math.max(0, s.resto))}">${segs}</div>
    <div class="sb-legend">
      <div class="sbl"><span class="lg-l">Salário</span><span class="lg-v">${brl(s.renda)} <button class="icon-btn xs" data-act="renda" data-vaga="${v}" aria-label="Editar renda">${ic("lapis", "sm")}</button></span></div>
      ${partes.map(([k, l, val]) => `<div class="sbl"><span class="lg-l"><i class="dot ${k}"></i>${l}${k === "dia" ? ` <button class="link-btn" data-act="diadia">ajustar</button>` : ""}</span><span class="lg-v">− ${brl(val)} <small>· ${pct(pctDe(val), 0)}</small></span>${k === "dia" && s.diaReal != null ? `<span class="sbl-sub" data-tip="${esc(dicaDia(s))}">${s.diaReal > s.diaOrc ? `acima do orçamento de ${brl(s.diaOrc)}` : `gasto real: ${brl(s.diaReal)}`}</span>` : ""}</div>`).join("")}
      <div class="sbl total"><span class="lg-l"><i class="dot sobra"></i>= Sobra</span><span class="lg-v">${brl(s.resto)} <small>· ${pct(livre, 0)}</small></span></div>
    </div>
  </section>`;
}

// Explica qual valor do dia a dia entrou no Saldo previsto.
function dicaDia(s) {
  if (s.diaReal == null) return "";
  return s.diaReal > s.diaOrc
    ? `Você já gastou ${brl(s.diaReal)} nos bancos, mais que o orçamento de ${brl(s.diaOrc)}; o saldo usa o gasto real.`
    : `Gasto real nos bancos até agora: ${brl(s.diaReal)}. O saldo reserva o orçamento inteiro (${brl(s.diaOrc)}) até o gasto passar dele.`;
}

// "Dia 07" para o que vence no mês; "Vence 07/12" para fatura que vence no mês seguinte.
const rotuloDia = (i) => (venceNoMesSeguinte(i, S.month)
  ? `Vence ${String(i.dia).padStart(2, "0")}/${i.venceYM.slice(5, 7)}`
  : `Dia ${String(i.dia).padStart(2, "0")}`);

function linhaConta(i, opts = {}) {
  const st = statusConta(i, S.month);
  const stTxt = { paga: "Paga", atrasada: "Atrasada", hoje: "Vence hoje", aberta: "" }[st];
  const stCls = { paga: "done", atrasada: "late", hoje: "today", aberta: "" }[st];
  const tabela = i.tipo === "cartao" ? "cartoes" : "contas";
  const quem = i.escopo === "casa" ? `<span class="chip">${avatar(i.pagador === "b" ? "b" : "a", true)}${esc(nome(i.pagador === "b" ? "b" : "a"))}</span>` : `<span class="lock-note">${ic("cadeado", "sm")}Pessoal</span>`;
  return `<div class="bill${i.pago ? " paid" : ""}">
    ${tileIcon(i.nome, i.categoria)}
    <label class="check"><input type="checkbox" ${i.pago ? "checked" : ""} data-pago data-tabela="${tabela}" data-id="${i.id}" aria-label="${esc(i.nome)} paga"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" style="stroke-width:2.5"/></svg></label>
    <div class="name"><strong>${esc(i.nome)}</strong><div class="meta">${opts.semDia ? "" : `<span>${rotuloDia(i)}</span>`}${quem}<span>${esc(CAT_CURTA[i.categoria] || "Outros")}</span>${stTxt ? `<span class="state ${stCls}">${stTxt}</span>` : ""}</div></div>
    <span class="val">${brl(i.valorMes)}</span>
    <div class="row-actions"><button class="icon-btn" data-act="${i.tipo === "cartao" ? "edit-cartao" : "edit-conta"}" data-id="${i.id}" aria-label="Editar ${esc(i.nome)}">${ic("lapis", "sm")}</button></div>
  </div>`;
}

function listaPorDia(itens) {
  const grupos = new Map();
  for (const i of itens) {
    const prox = venceNoMesSeguinte(i, S.month);
    const vYM = prox ? i.venceYM : S.month;
    const d = Math.min(i.dia, daysIn(vYM));
    const k = (prox ? 100 : 0) + d;
    if (!grupos.has(k)) grupos.set(k, { d, vYM, prox, list: [] });
    grupos.get(k).list.push(i);
  }
  return [...grupos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, g]) => `<div class="day-group"><div class="day-label">${g.prox ? `Vence ${String(g.d).padStart(2, "0")}/${g.vYM.slice(5, 7)}` : `Dia ${String(g.d).padStart(2, "0")}`} · ${diaSemana(g.vYM, g.d)}</div>${g.list.map((i) => linhaConta(i, { semDia: true })).join("")}</div>`)
    .join("");
}


/* ---- contas a pagar ---- */
function blocoVencimentos(span = "w1") {
  const casa = contasDoMes(D(), S.month, "casa");
  const minhas = contasDoMes(D(), S.month, "pessoal");
  const todas = [...casa, ...minhas].sort((a, b) => ordemDia(a, S.month) - ordemDia(b, S.month) || Number(a.pago) - Number(b.pago));
  if (!todas.length) {
    return `<section class="card ${span} c-contas">${cardTop("Contas a pagar", { icone: "calendario" })}${vazio("", "Nada lançado neste mês", "As contas da casa aparecem para os dois. As pessoais, só para quem lançou.", `<button class="btn btn-primary btn-sm" data-act="lancar">Lançar conta</button>`)}</section>`;
  }
  const abertas = todas.filter((i) => !i.pago);
  const falta = sum(abertas.map((i) => i.valorMes));
  // Pílulas só com os dias deste mês; faturas que vencem no mês seguinte ficam no fim da lista.
  const noMes = todas.filter((i) => !venceNoMesSeguinte(i, S.month));
  const dias = [...new Set(noMes.map((i) => Math.min(i.dia, daysIn(S.month))))].sort((a, b) => a - b);
  const ehMesAtual = S.month === curYM();
  const prox = abertas.find((i) => !ehMesAtual || diasAteVencer(i, S.month) >= 0) || abertas[0];
  const sel = dias.includes(S.diaSel) ? S.diaSel : null;
  const lista = sel ? noMes.filter((i) => Math.min(i.dia, daysIn(S.month)) === sel) : todas;
  const emDias = prox && ehMesAtual ? Math.max(0, diasAteVencer(prox, S.month)) : null;
  const subProx = prox ? (venceNoMesSeguinte(prox, S.month) ? `· ${String(prox.dia).padStart(2, "0")}/${prox.venceYM.slice(5, 7)}` : `· dia ${String(prox.dia).padStart(2, "0")}`) : "";
  return `<section class="card ${span} c-contas com-lista">
    ${cardTop("Contas a pagar", { sub: subProx, icone: "calendario" })}
    <div>${money(falta, "big lg")}<p class="big-sub">${emDias !== null ? `${emDias === 0 ? "vence hoje" : `próxima em ${emDias} ${emDias === 1 ? "dia" : "dias"}`} · ` : ""}${todas.length - abertas.length} de ${todas.length} pagas</p></div>
    <div class="day-pills" role="group" aria-label="Filtrar por dia">${dias
      .map((d) => {
        const n = noMes.filter((i) => Math.min(i.dia, daysIn(S.month)) === d);
        const pend = n.some((i) => !i.pago);
        return `<button class="dp${sel === d ? " on" : ""}${pend ? "" : " done"}" data-act="dia-sel" data-v="${d}" aria-pressed="${sel === d}"><b>${String(d).padStart(2, "0")}</b><span class="dots">${n.slice(0, 5).map(() => "<i></i>").join("")}</span></button>`;
      })
      .join("")}</div>
    <div class="todo">${lista.map((i) => linhaTodo(i)).join("")}</div>
  </section>`;
}
function linhaTodo(i) {
  const st = statusConta(i, S.month);
  const tabela = i.tipo === "cartao" ? "cartoes" : "contas";
  const quem = i.escopo === "casa" ? `<i class="dot ${i.pagador === "b" ? "b" : "a"}" title="${esc(nome(i.pagador === "b" ? "b" : "a"))} paga"></i>` : `<span class="lock">${ic("cadeado", "sm")}</span>`;
  return `<div class="todo-row${i.pago ? " paid" : ""}">
    <label class="radio"><input type="checkbox" ${i.pago ? "checked" : ""} data-pago data-tabela="${tabela}" data-id="${i.id}" aria-label="${esc(i.nome)} paga"><span></span></label>
    <button class="todo-name" data-act="${i.tipo === "cartao" ? "edit-cartao" : "edit-conta"}" data-id="${i.id}">${esc(i.nome)} ${quem}${venceNoMesSeguinte(i, S.month) ? `<span class="state prox" title="${esc(rotuloDia(i))}">${String(i.dia).padStart(2, "0")}/${i.venceYM.slice(5, 7)}</span>` : ""}${st === "atrasada" ? `<span class="state late">Atrasada</span>` : st === "hoje" ? `<span class="state today">Hoje</span>` : ""}</button>
    <span class="val num">${brl(i.valorMes)}</span></div>`;
}

/* ---- divisão da casa ---- */
function blocoAcerto(span = "w1") {
  const a = acerto(D(), S.month);
  const feito = D().acertos.find((x) => x.mes === S.month);
  if (!a.itens.length) {
    return `<section class="card ${span} c-div">${cardTop("Divisão da casa", { icone: "balanca", escopo: "casa" })}${vazio("", "Nenhuma conta da casa neste mês", "Lance as contas da casa e diga quem paga cada uma. O app calcula quem faz o Pix no fim do mês.", `<button class="btn btn-primary btn-sm" data-act="nova-conta" data-escopo="casa">Nova conta da casa</button>`)}</section>`;
  }
  const pa = a.total ? (a.pagou.a / a.total) * 100 : 50;
  const mudou = feito && a.de && Math.abs(Number(feito.valor) - a.valor) > 0.009;
  const lbl = (x) => (x >= 12 ? `<span>${pct(x, 1)}</span>` : "");
  const quem = a.itens.slice().sort((x, y) => y.valorMes - x.valorMes);
  const msg = a.de
    ? `${a.de === minhaVaga() ? "Você devolve" : `${esc(nome(a.de))} te devolve`} <strong class="num">${brl(a.valor)}</strong> no Pix`
    : "Cada um pagou a sua metade. Sem acerto neste mês.";
  return `<section class="card ${span} c-div">
    ${cardTop("Divisão da casa", { icone: "balanca", escopo: "casa" })}
    <div><p class="lbl-sm">Total das contas</p>${money(a.total, "big lg")}</div>
    <div class="split">
      <div class="split-top"><span><i class="dot a"></i>${esc(nome("a"))} ${"a" === minhaVaga() ? "paga" : "paga"}<b class="num">${brl(a.pagou.a)}</b></span><span class="r">${esc(nome("b"))} paga<i class="dot b"></i><b class="num">${brl(a.pagou.b)}</b></span></div>
      <div class="split-bar" role="img" aria-label="${esc(nome("a", { voce: false }))} paga ${brl(a.pagou.a)}, ${esc(nome("b", { voce: false }))} paga ${brl(a.pagou.b)}">
        ${a.pagou.a > 0 ? `<div class="seg a" style="width:${pa}%" data-tip="${esc(nome("a"))}: ${brl(a.pagou.a)}">${lbl(pa)}</div>` : ""}
        ${a.pagou.b > 0 ? `<div class="seg b" style="width:${100 - pa}%" data-tip="${esc(nome("b"))}: ${brl(a.pagou.b)}">${lbl(100 - pa)}</div>` : ""}
        <div class="mid" title="Metade: ${brl(a.metade)}"></div>
      </div>
    </div>
    <div><p class="lbl-sm strong">Quem paga cada conta</p>
      <div class="who-list">${quem.slice(0, 7).map((i) => `<div class="wl"><span><i class="dot ${i.pagador === "b" ? "b" : "a"}"></i>${esc(i.nome)}</span><span class="num">${brl(i.valorMes)}</span></div>`).join("")}</div>
      ${quem.length > 7 ? `<a class="link-btn" href="#casa">Ver as ${quem.length} contas</a>` : ""}</div>
    <div class="settle-foot">
      ${a.de ? `<span class="pair">${avatar(a.de, true)}${ic("seta", "sm")}${avatar(a.para, true)}</span>` : `<span class="pair">${ic("ok", "sm")}</span>`}
      <p class="grow">${feito && a.de ? (mudou ? `Acerto de ${brl(feito.valor)} feito, mas as contas mudaram depois.` : `Acerto feito em ${dataBR(feito.feito_em)}.`) : msg}</p>
      ${a.de ? (feito ? `<button class="btn btn-sm" data-act="acerto-desfazer">Desfazer</button>` : `<button class="btn btn-sm" data-act="acerto-feito">Marcar feito</button>`) : ""}
    </div>
  </section>`;
}

/* ---- cartões ---- */
// Cores no espírito dos cartões reais dos bancos: [início, fim, tinta clara?]
const COR_CARTAO = {
  roxo: ["#9b2ee6", "#5b0aa3", false],
  laranja: ["#ff8a1f", "#e25d00", false],
  vermelho: ["#ec1c24", "#a30b10", false],
  grafite: ["#3b3f45", "#121417", false],
  preto: ["#1d1d1f", "#000000", false],
  azul: ["#1f5fd1", "#0b2f7a", false],
  marinho: ["#14306b", "#060f2b", false],
  verde: ["#11b85a", "#06733a", false],
  neon: ["#d6ff3a", "#9fd400", true],
  amarelo: ["#ffe14d", "#f2b705", true],
  prata: ["#e8ebef", "#b7bec7", true],
  dourado: ["#e6c27a", "#b4863a", true],
  rosa: ["#ff5c8a", "#c21e56", false],
  petroleo: ["#2b7b85", "#123e45", false],
  ambar: ["#e3ad5c", "#b07a26", true],
  vinho: ["#8f3445", "#4d1220", false],
  noite: ["#2e4478", "#111a36", false],
  oliva: ["#6b7a45", "#38421f", false],
};
const COR_BANCO = [
  [/nu ?bank|nubank|\bnu\b/, "roxo"], [/ita[uú]/, "laranja"], [/inter\b|banco inter/, "laranja"], [/santander/, "vermelho"],
  [/bradesco/, "vermelho"], [/c6/, "preto"], [/xp\b|xp invest/, "preto"], [/btg/, "marinho"], [/caixa/, "azul"],
  [/\bbb\b|banco do brasil/, "amarelo"], [/picpay/, "verde"], [/mercado ?pago/, "azul"], [/neon/, "azul"], [/next/, "verde"],
  [/sicoob|sicredi/, "verde"], [/porto/, "azul"], [/will/, "amarelo"], [/pan\b/, "azul"], [/original/, "verde"], [/safra/, "marinho"],
];
const corDoBanco = (banco) => (COR_BANCO.find(([r]) => r.test(String(banco || "").toLowerCase())) || [])[1] || null;
const corDe = (c) => COR_CARTAO[c] || COR_CARTAO.grafite;

const CHIP = `<svg class="cc-chip" viewBox="0 0 40 30" aria-hidden="true"><defs><linearGradient id="chipG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e3a8"/><stop offset=".5" stop-color="#d4ad55"/><stop offset="1" stop-color="#a77b2c"/></linearGradient></defs><rect x=".5" y=".5" width="39" height="29" rx="5" fill="url(#chipG)"/><path d="M14 .5v9M26 .5v9M14 20.5v9M26 20.5v9M.5 10h13.5M26 10h13.5M.5 20h13.5M26 20h13.5M14 9.5h12v11H14z" fill="none" stroke="#8a6220" stroke-opacity=".55" stroke-width="1"/></svg>`;
const NFC = `<svg class="cc-nfc" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7.5a6.5 6.5 0 0 1 0 9M11.5 5a10 10 0 0 1 0 14M15 3a13.5 13.5 0 0 1 0 18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

function faceCartao(c, { mini = false, status = "" } = {}) {
  const [c1, c2, claro] = corDe(c.cor);
  const f = c.faturas?.[S.month];
  const livre = c.limite != null ? Math.max(0, Number(c.limite) - (Number(f) || 0)) : null;
  const venc = c.vencimento ? `${String(c.vencimento).padStart(2, "0")}/${addYM(S.month, 1).slice(5, 7)}` : "—";
  const rodape = `<div class="cc-row bottom"><div><small>Vence</small><b>${venc}</b></div><div class="r"><small>${livre != null ? "Limite livre" : "Fatura"}</small><b>${livre != null ? brl(livre) : f != null ? brl(f) : "—"}</b></div></div>`;
  // Com a imagem real do cartão (como no Apple Pay): só a arte, com vencimento e limite livre embaixo.
  if (c.imagem_url) {
    return `<div class="cc-face foto${mini ? " mini" : ""}" style="background-image:url('${esc(c.imagem_url)}')" role="img" aria-label="${esc(c.banco || "Cartão")}${c.apelido ? ` ${esc(c.apelido)}` : ""}">${rodape}</div>`;
  }
  return `<div class="cc-face${claro ? " light-ink" : ""}${c.cor === "grafite" || c.cor === "preto" ? " brushed" : ""}${mini ? " mini" : ""}" style="--c1:${c1};--c2:${c2}">
    <div class="cc-row"><span class="cc-bank">${esc(c.banco || "Banco")}</span><span class="cc-tag">${status || (c.escopo === "casa" ? "Da casa" : "Pessoal")}</span></div>
    <div class="cc-mid">${CHIP}<span class="cc-nick">${esc((c.apelido || "").slice(0, 18))}</span>${NFC}</div>
    <div class="cc-row bottom"><div><small>Vence</small><b>${venc}</b></div><div class="cc-final">${c.final ? `•••• ${esc(c.final)}` : ""}${c.bandeira ? `<em>${esc(c.bandeira)}</em>` : ""}</div><div class="r"><small>${livre != null ? "Limite livre" : "Fatura"}</small><b>${livre != null ? brl(livre) : f != null ? brl(f) : "—"}</b></div></div>
  </div>`;
}

function todosCartoes() {
  const proprios = D().cartoes.map((c) => ({ ...c, origemTipo: "manual" }));
  const usados = new Set(D().cartoes.map((c) => c.origem?.accountId).filter(Boolean));
  const importados = (D().importacao?.cartoes || [])
    .filter((c) => !usados.has(c.id))
    .map((c) => ({ importado: true, ...c }));
  return { proprios, importados };
}

function blocoCartoesResumo(span = "w1") {
  const { proprios } = todosCartoes();
  if (!proprios.length) {
    return `<section class="card ${span} c-cc">${cardTop("Cartões", { icone: "cartoes" })}${vazio("", "Nenhum cartão ainda", "Cadastre os cartões de vocês. Os da casa aparecem para os dois; os pessoais, só para o dono.", `<button class="btn btn-primary btn-sm" data-act="novo-cartao">Novo cartão</button>`)}</section>`;
  }
  const i = Math.min(S.ccSel || 0, proprios.length - 1);
  const c = proprios[i];
  const f = c.faturas?.[S.month];
  const prox = [0, 1, 2].map((k) => addYM(S.month, k));
  const vals = prox.map((m) => c.faturas?.[m]);
  const conhecidos = vals.filter((v) => v != null).map(Number);
  const hi = Math.max(...conhecidos, 1);
  const yv = (v) => (v == null ? 80 : 78 - (Number(v) / hi) * 24);
  return `<section class="card ${span} c-cc">
    ${cardTop("Cartões", { icone: "cartoes" })}
    <div><p class="lbl-sm">Fatura de ${mesNome(S.month).split(" de ")[0].toLowerCase()}</p>${f != null ? money(f, "big lg") : `<div class="big lg faint">—</div>`}</div>
    <div class="cc-actions"><button class="btn btn-sm" data-act="fatura" data-id="${c.id}">${f != null ? "Ver fatura" : "Informar fatura"}</button>
      ${proprios.length > 1 ? `<div class="pager"><button class="icon-btn sm" data-act="cc-step" data-v="-1" aria-label="Cartão anterior">${ic("esq", "sm")}</button><button class="icon-btn sm" data-act="cc-step" data-v="1" aria-label="Próximo cartão">${ic("dir", "sm")}</button></div>` : ""}</div>
    <div class="cc-carousel">${proprios.map((k, j) => `<button class="cc-slot${j === i ? " on" : ""}" data-act="cc-sel" data-v="${j}" aria-label="${esc(k.apelido || k.banco)}">${faceCartao(k, { mini: true, status: k.pagos?.[S.month] ? "Paga" : "Aberta" })}</button>`).join("")}</div>
    <div><p class="lbl-xs">Próximas faturas</p>
      <div class="nf">
        <svg class="nf-line" viewBox="0 0 300 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${prox.map((_, k) => `${50 + k * 100},${yv(vals[k])}`).join(" ")} 300,${yv(vals[2])}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/></svg>
        ${prox.map((m, k) => `<div class="nf-box${k === 0 ? " on" : ""}"><span class="nf-m">${capital(mesNome(m, true))}${k ? ` ${m.slice(2, 4)}` : ""}</span>${k === 0 ? `<span class="nf-tag">Aberta</span>` : ""}<i class="nf-dot" style="top:${yv(vals[k])}%"></i><b class="num">${vals[k] != null ? brl(vals[k]) : "—"}</b></div>`).join("")}
      </div></div>
  </section>`;
}

/* ---- moradia ---- */
function blocoMoradia(span = "w1") {
  const mo = moradia(D(), S.month);
  if (!mo.itens.length) {
    return `<section class="card ${span} c-mor">${cardTop("Moradia", { icone: "casa", escopo: "casa" })}${vazio("", "Sem custos de moradia", "Lance aluguel, condomínio, luz, água e internet como contas da casa para ver o peso da moradia na renda.")}</section>`;
  }
  const meu = S.moradiaBase !== "casal";
  const me = eu();
  const minhaRenda = me?.renda != null ? Number(me.renda) : null;
  const fator = meu ? 0.5 : 1;
  const total = round2(mo.total * fator);
  const base = meu ? minhaRenda : mo.rendaCasal;
  const p = base ? (total / base) * 100 : null;
  const nivel = p === null ? "" : p <= 30 ? "ok" : p <= 40 ? "warn" : "over";
  return `<section class="card ${span} c-mor">
    ${cardTop("Moradia", { icone: "casa" })}
    <div><p class="lbl-sm">${meu ? "Quanto você gasta pra morar" : "Quanto vocês gastam pra morar"}</p>${money(total, "big lg")}
      ${p !== null ? `<p class="mor-ref ${nivel}">${ic(nivel === "ok" ? "ok" : "alerta", "sm")}<b>${pct(p, 0)} do salário${meu ? "" : " do casal"}</b><span class="faint">referência: até 30%</span></p>` : `<p class="big-sub">Informe a renda em Ajustes para ver o percentual.</p>`}</div>
    <div class="seg-ctl wide" role="group" aria-label="Base de cálculo"><button data-act="mor-base" data-v="meu" aria-pressed="${meu}">Só meu salário</button><button data-act="mor-base" data-v="casal" aria-pressed="${!meu}">Salário do casal</button></div>
    ${p !== null ? `<div class="mor-meter"><span class="mk" style="left:50%">30%</span><div class="track"><div class="fill ${nivel}" style="width:${Math.min(100, (p / 60) * 100).toFixed(1)}%"></div><i class="ref" style="left:50%"></i></div><div class="ends"><span>0%</span><span>60% do salário</span></div></div>` : ""}
    <div><p class="lbl-sm strong">O que entra na conta</p>
      <div class="mor-grid">${mo.itens.map((i) => `<div class="mor-it">${tileIcon(i.nome, i.categoria)}<div><span>${esc(i.nome)}</span><b class="num">${meu ? "≈ " : ""}${brl(i.valorMes * fator)}</b></div></div>`).join("")}</div></div>
  </section>`;
}

/* ---- metas ---- */
function blocoMetas(span = "w1", completo = false) {
  const metas = D().metas;
  const corpo = metas.length
    ? `<div class="metas">${metas
        .map((m) => {
          const r = metaResumo(m, D().aportes);
          return `<div class="meta-it">
          <div class="meta-h"><strong>${esc(m.nome)}</strong><span class="num">${r.pct !== null ? pct(r.pct, 0) : ""}</span></div>
          <div class="meter"><div class="fill" style="width:${r.pct ?? 0}%"></div></div>
          <div class="meta-s"><span class="num"><b>${brl(r.guardado)}</b>${r.alvo ? ` de ${brl(r.alvo)}` : ""}</span>${m.prazo ? `<span>até ${mesCurtoAno(m.prazo)}</span>` : ""}</div>
          ${r.alvo === null ? `<p class="meta-p">Defina o valor da meta para ver quanto guardar por mês. <button class="link-btn" data-act="edit-meta" data-id="${m.id}">Definir valor</button></p>` : r.porMes ? `<p class="meta-p">Guardar <strong class="num">${brl(r.porMes)}</strong> por mês para chegar lá.</p>` : ""}
          ${completo ? `<div class="meta-b"><button class="btn btn-sm" data-act="aporte" data-id="${m.id}">Registrar aporte</button><button class="btn btn-ghost btn-sm" data-act="edit-meta" data-id="${m.id}">Editar</button></div>` : ""}
        </div>`;
        })
        .join("")}</div>`
    : vazio("", "Nenhuma meta do casal", "Crie metas como a entrada do apartamento ou uma reserva de emergência e registrem os aportes.");
  return `<section class="card ${span} c-metas">${cardTop("Metas do casal", { icone: "cofre", escopo: "casa" })}${corpo}<div><button class="btn btn-sm" data-act="nova-meta">${ic("mais", "sm")}Nova meta</button></div></section>`;
}

/* ---- gráficos ---- */
/* ---- gráfico de linha no estilo Robinhood ----
   Sem grade nem eixo; linha com gradiente, área que some para baixo, brilho no ponto atual,
   linha tracejada no valor inicial do período e número grande que acompanha o dedo. */
const FMT = {
  pct: (v) => `${num(v, 2)}%`,
  brl: (v) => `R$ ${num(v, 2)}`,
};
const RANGES = [["6M", 6], ["1A", 12], ["2A", 24]];
function rhChart(serieTodo, { id, titulo, fmt = "pct", h = 190, rotuloFim = "", nota = "" }) {
  if (!serieTodo || serieTodo.length < 2) return `<div class="rh"><p class="rh-t faint">${titulo}</p><p class="faint">Sem histórico ainda.</p></div>`;
  const disp = RANGES.filter(([, k]) => k < serieTodo.length);
  const sel = S.range[id] || (serieTodo.length >= 24 ? "2A" : "1A");
  const n = (RANGES.find(([k]) => k === sel) || RANGES[2])[1];
  const serie = serieTodo.slice(-Math.min(n + 1, serieTodo.length));
  const vals = serie.map((p) => p[1]);
  const W = 600;
  const H = h;
  const padT = 34;
  const padB = 22;
  const padR = 10;
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const span = hi - lo || 1;
  lo -= span * 0.08;
  hi += span * 0.1;
  const x = (i) => (i * (W - padR)) / (serie.length - 1);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const pts = serie.map((p, i) => [x(i), y(p[1])]);
  const d = pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)},${b.toFixed(1)}`).join("");
  const [ex, ey] = pts[pts.length - 1];
  const sub = vals[vals.length - 1] < vals[0];
  const f = FMT[fmt];
  const delta = vals[vals.length - 1] - vals[0];
  const quando = { "6M": "em 6 meses", "1A": "em 12 meses", "2A": "em 2 anos" }[sel];
  const tag = rotuloFim || mesCurtoAno(serie[serie.length - 1][0]);
  const tw = tag.length * 7 + 18;
  const tx = Math.min(W - tw, Math.max(0, ex - tw / 2));
  const deltaTxt = (dv, q) =>
    `<span class="${dv > 0.0001 ? "up" : dv < -0.0001 ? "down" : ""}">${dv > 0.0001 ? "▲" : dv < -0.0001 ? "▼" : "•"} ${fmt === "pct" ? `${num(Math.abs(dv), 2)} p.p.` : `R$ ${num(Math.abs(dv), 2)}`}</span><span class="when">${q}</span>`;
  return `<div class="rh" data-rh="${id}" data-fmt="${fmt}" data-serie='${esc(JSON.stringify(serie))}' data-q="${esc(quando)}">
    <div class="rh-head"><p class="rh-t">${titulo}</p><div class="rh-v">${f(vals[vals.length - 1])}</div><div class="rh-d">${deltaTxt(delta, quando)}</div></div>
    <svg class="rh-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(titulo)}: ${f(vals[0])} em ${mesCurtoAno(serie[0][0])}, ${f(vals[vals.length - 1])} em ${mesCurtoAno(serie[serie.length - 1][0])}">
      <defs>
        <linearGradient id="${id}-ln" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--chart)" stop-opacity=".55"/><stop offset=".7" stop-color="var(--chart)"/><stop offset="1" stop-color="var(--chart-2)"/></linearGradient>
        <linearGradient id="${id}-ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--chart)" stop-opacity=".2"/><stop offset="1" stop-color="var(--chart)" stop-opacity="0"/></linearGradient>
        <radialGradient id="${id}-gl"><stop offset="0" stop-color="var(--chart-2)" stop-opacity=".22"/><stop offset=".4" stop-color="var(--chart-2)" stop-opacity=".07"/><stop offset="1" stop-color="var(--chart-2)" stop-opacity="0"/></radialGradient>
        <clipPath id="${id}-cl"><path d="${d}L${x(serie.length - 1)},${H - padB}L0,${H - padB}Z"/></clipPath>
        <filter id="${id}-bl" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="4"/></filter>
      </defs>
      <ellipse class="gl" cx="${ex}" cy="${ey}" rx="${W * 0.2}" ry="${H * 0.5}" fill="url(#${id}-gl)" clip-path="url(#${id}-cl)"/>
      <path class="ar" d="${d}L${x(serie.length - 1)},${H - padB}L0,${H - padB}Z" fill="url(#${id}-ar)"/>
      <line class="base" x1="0" x2="${W}" y1="${y(vals[0])}" y2="${y(vals[0])}"/>
      <line class="vline vl-fim" x1="${ex}" x2="${ex}" y1="${ey}" y2="${H - padB}"/>
      <path class="ln" d="${d}" stroke="url(#${id}-ln)" pathLength="1"/>
      <circle class="pt" cx="${ex}" cy="${ey}" r="7" fill="var(--chart-2)" filter="url(#${id}-bl)" opacity=".6"/>
      <circle class="pt" cx="${ex}" cy="${ey}" r="4.5" fill="var(--chart-2)"/>
      <g class="tag"><rect x="${tx}" y="2" width="${tw}" height="22" rx="11"/><text x="${tx + tw / 2}" y="17" text-anchor="middle">${esc(tag)}</text></g>
      <text class="ax" x="0" y="${H - 4}">${mesCurtoAno(serie[0][0])}</text>
      <g class="hov" visibility="hidden"><line class="vline" y1="${padT - 6}" y2="${H - padB}"/><circle r="5" fill="var(--surface)" stroke="var(--chart-2)" stroke-width="2.5"/></g>
      <rect class="hit" x="0" y="0" width="${W}" height="${H}" fill="transparent"/>
    </svg>
    <div class="rngs" role="group" aria-label="Período">${disp.map(([k]) => `<button data-act="rng" data-k="${id}" data-v="${k}" aria-pressed="${k === sel}">${k}</button>`).join("")}</div>
    ${nota ? `<p class="source">${nota}</p>` : ""}
  </div>`;
}
function rhScrub(e) {
  const box = e.target.closest?.(".rh[data-rh]");
  document.querySelectorAll(".rh[data-rh].scrub").forEach((b) => b !== box && rhReset(b));
  if (!box || !e.target.closest(".rh-svg")) return box && rhReset(box);
  const svg = box.querySelector(".rh-svg");
  const serie = JSON.parse(box.dataset.serie);
  const vb = svg.viewBox.baseVal;
  const r = svg.getBoundingClientRect();
  const px = ((e.clientX - r.left) / r.width) * vb.width;
  const i = Math.max(0, Math.min(serie.length - 1, Math.round((px / (vb.width - 10)) * (serie.length - 1))));
  const pts = svg.querySelector(".ln").getAttribute("d").slice(1).split("L").map((p) => p.split(",").map(Number));
  const [hx, hy] = pts[i];
  const g = svg.querySelector(".hov");
  g.setAttribute("visibility", "visible");
  g.querySelector("line").setAttribute("x1", hx);
  g.querySelector("line").setAttribute("x2", hx);
  g.querySelector("circle").setAttribute("cx", hx);
  g.querySelector("circle").setAttribute("cy", hy);
  const f = FMT[box.dataset.fmt];
  if (!box.dataset.v0) box.dataset.v0 = box.querySelector(".rh-v").textContent;
  if (!box.dataset.d0) box.dataset.d0 = box.querySelector(".rh-d").innerHTML;
  box.classList.add("scrub");
  box.querySelector(".rh-v").textContent = f(serie[i][1]);
  const dv = serie[i][1] - serie[0][1];
  box.querySelector(".rh-d").innerHTML = `<span class="${dv > 0.0001 ? "up" : dv < -0.0001 ? "down" : ""}">${dv > 0.0001 ? "▲" : dv < -0.0001 ? "▼" : "•"} ${box.dataset.fmt === "pct" ? `${num(Math.abs(dv), 2)} p.p.` : `R$ ${num(Math.abs(dv), 2)}`}</span><span class="when">${capital(mesNome(serie[i][0]).toLowerCase())}</span>`;
}
function rhReset(box) {
  box.classList.remove("scrub");
  box.querySelector(".hov")?.setAttribute("visibility", "hidden");
  if (box.dataset.v0) box.querySelector(".rh-v").textContent = box.dataset.v0;
  if (box.dataset.d0) box.querySelector(".rh-d").innerHTML = box.dataset.d0;
}
document.addEventListener("pointermove", rhScrub);
document.addEventListener("pointerdown", rhScrub);

// Minigráfico: mesma linguagem do gráfico grande (linha em gradiente, área que some para baixo).
let sparkN = 0;
function spark(serie) {
  if (!serie || serie.length < 2) return "";
  const s = serie.slice(-12);
  const vals = s.map((p) => p[1]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const W = 112;
  const H = 52;
  const id = `sp${++sparkN}`;
  const x = (i) => 3 + (i * (W - 9)) / (s.length - 1);
  const y = (v) => 5 + (1 - (v - lo) / (hi - lo || 1)) * (H * 0.55);
  const pts = s.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`);
  const ex = x(s.length - 1);
  const ey = y(vals[vals.length - 1]);
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <defs>
      <linearGradient id="${id}-l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--chart)" stop-opacity="0"/><stop offset=".3" stop-color="var(--chart)" stop-opacity=".8"/><stop offset=".75" stop-color="var(--chart)"/><stop offset="1" stop-color="var(--chart-2)"/></linearGradient>
      <linearGradient id="${id}-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--chart)" stop-opacity=".24"/><stop offset="1" stop-color="var(--chart)" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}-f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".4" stop-color="#fff"/></linearGradient>
      <mask id="${id}-m"><rect width="${W}" height="${H}" fill="url(#${id}-f)"/></mask>
    </defs>
    <path d="M${pts.join("L")}L${ex},${H}L${x(0)},${H}Z" fill="url(#${id}-a)" mask="url(#${id}-m)" class="ar"/>
    <polyline class="ln" pathLength="1" points="${pts.join(" ")}" fill="none" stroke="url(#${id}-l)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle class="pt" cx="${ex}" cy="${ey}" r="5" fill="var(--glow)"/><circle class="pt" cx="${ex}" cy="${ey}" r="2.8" fill="var(--chart-2)"/></svg>`;
}

/* Juro real ex-post, mês a mês: Selic do mês (anualizada) descontada do IPCA de 12 meses.
   (1 + Selic) / (1 + IPCA) − 1 — quanto a renda fixa rendeu acima da inflação. */
function serieJuroReal(series) {
  const ipca = new Map(series?.ipca12m || []);
  return (series?.selic || [])
    .filter(([mes]) => ipca.has(mes))
    .map(([mes, s]) => [mes, ((1 + s / 100) / (1 + ipca.get(mes) / 100) - 1) * 100]);
}
function statJuroReal(series) {
  const serie = serieJuroReal(series);
  if (!serie.length) return "";
  const [mes, v] = serie[serie.length - 1];
  return `<div class="stat" data-tip="Selic do mês descontada do IPCA de 12 meses: quanto a renda fixa rendeu acima da inflação"><div class="lbl">Juro real</div><div style="display:flex;align-items:center;gap:8px;justify-content:space-between"><div class="v">${pct(v, 2)}</div>${spark(serie)}</div><div class="d">Selic − IPCA · ${mesCurtoAno(mes)}</div></div>`;
}
function blocoMercadoResumo(span = "s4 m12 t12") {
  const m = D().mercado?.dados;
  if (!m) return `<section class="card ${span}">${cardHead("bussola", "Mercado", "Banco Central", "")}${vazio("", "Sem dados ainda", "O retrato do mercado é atualizado automaticamente uma vez por dia.")}</section>`;
  const ind = m.indicadores || {};
  const st = (k, lbl, fmtv, serie, ref) =>
    ind[k] ? `<div class="stat"><div class="lbl">${lbl}</div><div style="display:flex;align-items:center;gap:8px;justify-content:space-between"><div class="v">${fmtv(ind[k].valor)}</div>${spark(serie)}</div><div class="d">${ref || dataBR(ind[k].data)}</div></div>` : "";
  return `<section class="card ${span}">${cardHead("bussola", "Mercado", "Banco Central", "", `<a class="link-btn" href="#investimentos">Cenário</a>`)}
    <div class="stats">
      ${st("selic", "Meta Selic", (v) => pct(v, 2), m.series?.selic)}
      ${st("ipca12m", "IPCA em 12 meses", (v) => pct(v, 2), m.series?.ipca12m, ind.ipca12m ? `até ${mesCurtoAno(ind.ipca12m.data.slice(0, 7))}` : "")}
      ${statJuroReal(m.series)}
      ${st("dolar", "Dólar PTAX", (v) => `R$ ${num(v, 2)}`, m.series?.dolar)}
    </div>
    <p class="source">Atualizado em ${horaBR(D().mercado.atualizado_em)}</p></section>`;
}

/* ------------------------------------------------------------------ páginas */
function pInicio() {
  return `${bannerConvite()}
  <div class="dash">${blocoSobra("w2")}${blocoVencimentos("w1 tall")}${blocoAcerto("w1")}${blocoCartoesResumo("w1")}${blocoMoradia("w1")}${blocoMetas("w1")}${blocoMercadoResumo("w2")}</div>`;
}

function bannerConvite() {
  const b = D().membros.find((m) => !m.user_id);
  if (!b) return "";
  return `<div class="banner">${ic("pessoas")}<div class="grow">${esc(b.apelido || "A segunda pessoa")} ainda não entrou. Passe o código <strong class="num">${esc(D().casa?.codigo_convite)}</strong> para ela criar a conta e entrar na casa.</div><a class="btn btn-sm" href="#ajustes">Ver convite</a></div>`;
}

function pCasa() {
  const itens = contasDoMes(D(), S.month, "casa");
  const total = sum(itens.map((i) => i.valorMes));
  const lista = itens.length
    ? `<div class="bills">${itens.map((i) => linhaConta(i)).join("")}</div><div class="list-foot"><span class="muted">${itens.filter((i) => i.pago).length} de ${itens.length} pagas</span><strong class="num">${brl(total)}</strong></div>`
    : vazio("recibo", "Nenhuma conta da casa neste mês", "Aluguel, condomínio, luz, internet, mercado: tudo o que é dos dois entra aqui, com quem paga cada conta.", `<button class="btn btn-primary btn-sm" data-act="nova-conta" data-escopo="casa">Nova conta da casa</button>`);
  const hist = historicoMoradia(D(), S.month);
  const maxH = Math.max(...hist.map((h) => h[1]), 1);
  return `${pageHead("Nossa casa", "Tudo nesta página é visto pelos dois.", `<button class="btn btn-primary" data-act="nova-conta" data-escopo="casa">${ic("mais", "sm")}Nova conta da casa</button>`)}
  <div class="grid">
    <section class="card s7 m12 t12">${cardHead("envelope", "Contas da casa", mesNome(S.month), "casa")}${lista}</section>
    ${blocoAcerto("s5 m12 t12")}
    ${blocoRenda()}
    ${blocoMoradia("s4 m6 t6")}
    <section class="card s4 m6 t6">${cardHead("", "Moradia nos últimos 12 meses", "", "")}
      ${hist.some((h) => h[1] > 0) ? `<div><div class="glass-bars">${hist.map((h) => `<div class="gb${h[0] === S.month ? " cur" : ""}" style="height:${Math.max(2, (h[1] / maxH) * 100)}%" data-tip="${mesCurtoAno(h[0])}: ${brl(h[1])}"></div>`).join("")}</div><div class="hist-axis">${hist.map((h, i) => `<span>${i % 3 === 0 || i === hist.length - 1 ? mesNome(h[0], true) : ""}</span>`).join("")}</div></div>` : `<p class="faint">O histórico se forma conforme os meses passam.</p>`}
    </section>
  </div>`;
}

function blocoRenda() {
  const ms = D().membros;
  const total = ms.every((m) => m.renda != null) ? sum(ms.map((m) => m.renda)) : null;
  return `<section class="card s4 m12 t12">${cardHead("pote", "Renda do casal", "Visível para os dois", "casa")}
    <dl class="kv">${ms
      .map((m) => {
        const pode = m.user_id === meId() || !m.user_id;
        return `<dt><span class="chip">${avatar(m.vaga, true)}${esc(nome(m.vaga))}</span></dt><dd>${m.renda != null ? brl(m.renda) : "—"} ${pode ? `<button class="link-btn" data-act="renda" data-vaga="${m.vaga}">${m.renda != null ? "editar" : "informar"}</button>` : ""}</dd>`;
      })
      .join("")}<dt style="font-weight:600;color:var(--text)">Total</dt><dd>${total !== null ? brl(total) : "—"}</dd></dl></section>`;
}

/* ---------------------------------------------------- gastos do mês nos bancos
   Rosca segmentada (como no app do Meu Pluggy) + lista por grupo ou categoria.
   Grupo = categoria-mãe da Pluggy (ex.: Alimentação → Supermercado, Delivery). */
const COR_GASTO = ["#F5813A", "#4FC463", "#9B5CF0", "#E8559C", "#4F8EF7", "#E8B23A", "#3FB8A8"];
const COR_OUTROS = "#8B8F98";
function iconeGasto(nome) {
  const n = String(nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/supermerc|mercado|feira|hortifr|padaria|acougue/.test(n)) return "carrinho";
  if (/restaura|bares?\b|lanchon|aliment|delivery|comida|ifood|cafe/.test(n)) return "garfo";
  if (/viage|hotel|hosped|passage|aere|turism/.test(n)) return "aviao";
  if (/transport|uber|taxi|combust|estacion|pedag|veicul|carro|mobilid|onibus|metro/.test(n)) return "carro";
  if (/saude|farmac|drogar|medic|hospit|odonto|academia|bem-estar|otica/.test(n)) return "saude";
  if (/educa|curso|escola|faculd|livr/.test(n)) return "livro";
  if (/streaming|assinatura|digital|software|aplicativ/.test(n)) return "play";
  if (/lazer|entreten|cinema|show|esporte|jogo|evento|bar e balada/.test(n)) return "festa";
  if (/compra|vestu|roupa|eletron|loja|shopping|presente|beleza|cosmet/.test(n)) return "sacola";
  if (/aluguel|condom|moradia|casa|imovel|habitac/.test(n)) return "casa";
  if (/energia|eletric|\bluz\b/.test(n)) return "raio";
  if (/agua|saneam/.test(n)) return "gota";
  if (/internet|telefon|celular|telecom/.test(n)) return "wifi";
  if (/seguro/.test(n)) return "escudo";
  if (/imposto|tribut|governo|obrigac/.test(n)) return "doc";
  if (/transfer|pix|ted\b|doc\b/.test(n)) return "setas";
  if (/financ|tarifa|juros|banc|emprest|cartao|multa|iof|investim/.test(n)) return "cofre";
  return "carteira";
}
function brlCurto(v) {
  const a = Math.abs(Number(v) || 0);
  if (a >= 1e6) return `R$ ${num(a / 1e6, 1)} mi`;
  if (a >= 1e4) return `R$ ${num(a / 1e3, 0)} mil`;
  if (a >= 1e3) return `R$ ${num(a / 1e3, 1)} mil`;
  return brl(a);
}
function fatiasGastos(g, visao) {
  const cats = (g.por_categoria || []).map((c) => ({ ...c, grupo: c.grupo || c.categoria }));
  let itens;
  if (visao === "grupo") {
    const mapa = new Map();
    for (const c of cats) {
      const it = mapa.get(c.grupo) || { nome: c.grupo, total: 0, filhos: [] };
      it.total += c.total;
      it.filhos.push(c);
      mapa.set(c.grupo, it);
    }
    itens = [...mapa.values()];
  } else itens = cats.map((c) => ({ nome: c.categoria, total: c.total, filhos: [], grupo: c.grupo }));
  itens.sort((a, b) => b.total - a.total);
  const total = sum(itens.map((i) => i.total)) || 1;
  // Até 6 fatias com cor própria; o resto (e o que for menor que 3%) vira "Outros" na rosca.
  itens.forEach((it, i) => {
    it.pct = it.total / total;
    it.cor = i < 6 && it.pct >= 0.03 ? COR_GASTO[i] : COR_OUTROS;
  });
  const fortes = itens.filter((i) => i.cor !== COR_OUTROS);
  const resto = itens.filter((i) => i.cor === COR_OUTROS);
  const fatias = resto.length ? [...fortes, { nome: "Outros", total: sum(resto.map((i) => i.total)), cor: COR_OUTROS, outros: true }] : fortes;
  return { itens, fatias, total };
}
function roscaGastos(fatias, total) {
  // Espaço visível igual entre todas as fatias: cada fatia ocupa o traço + as duas pontas
  // arredondadas (SW/2 de cada lado); o que sobra do círculo depois dos espaços é dividido
  // na proporção dos valores. Fatia muito pequena vira um ponto, sem invadir a vizinha.
  const R = 84, SW = 17, C = 2 * Math.PI * R;
  const n = fatias.length;
  const ESPACO = n > 1 ? 9 : 0;
  const passo = n > 1 ? SW + ESPACO : 0; // ponta + espaço + ponta
  const util = Math.max(C - n * passo, 0);
  let pos = 0;
  const segs = fatias
    .map((f, i) => {
      const vis = n > 1 ? Math.max((f.total / total) * util, 0.01) : C;
      const ini = pos + passo / 2;
      pos += vis + passo;
      const s = `<circle class="dn-seg" style="--k:${i}" r="${R}" cx="110" cy="110" fill="none" stroke="${f.cor}" stroke-width="${SW}" stroke-linecap="${n > 1 ? "round" : "butt"}" stroke-dasharray="${vis.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-ini).toFixed(2)}" ${f.outros ? "" : `data-act="gasto-abre" data-v="${esc(f.nome)}"`} data-tip="${esc(f.nome)}: ${brl(f.total)} · ${Math.round((f.total / total) * 100)}%"/>`;
      return s;
    })
    .join("");
  return `<div class="donut"><svg viewBox="0 0 220 220" role="img" aria-label="Gastos do mês por ${S.gastosVisao === "grupo" ? "grupo" : "categoria"}"><g transform="rotate(-90 110 110)">${segs}</g></svg>
    <div class="dn-c"><strong>${brlCurto(total)}</strong><span>gastos esse mês</span></div></div>`;
}
function linhasTransacoes(lista, limite) {
  if (!lista.length) return "";
  const mostra = lista.slice(0, limite);
  return `<div class="gx-tx">${mostra
    .map((t) => `<div class="gx-t"><div><span>${esc(t.descricao)}</span><small>${dataBR(t.data)}${t.conta ? ` · ${esc(t.conta)}` : ""}${t.pendente ? " · a confirmar" : ""}</small></div><strong class="num">${brl(Math.abs(t.valor))}</strong></div>`)
    .join("")}</div>`;
}
function blocoGastosBancos(g, imp) {
  const bancosEm = (imp?.itens || []).map((i) => i.atualizadoEm).filter(Boolean).sort()[0];
  const sub = imp ? `Meu Pluggy · ${bancosEm ? `bancos atualizados em ${horaBR(bancosEm)}` : `sincronizado em ${horaBR(imp.atualizado_em)}`}` : "Open Finance";
  const btn = `<button class="btn btn-sm" data-act="sync" ${S.syncing ? "disabled" : ""}>${ic("atualizar", "sm")}${S.syncing ? "Sincronizando…" : "Sincronizar"}</button>`;
  const cab = cardHead("envelope", "Gastos do mês nos bancos", sub, "pessoal", btn);
  const aviso = `<p class="source">O Meu Pluggy busca os dados nos bancos uma vez por dia; Sincronizar traz para cá o que ele já tem. Pagamento de fatura, transferências entre contas próprias, aplicações e resgates ficam de fora.</p>`;
  const falhas = (imp?.falhas || []).length
    ? `<div class="gx-aviso">${ic("alerta", "sm")}<div>${imp.falhas.slice(0, 4).map((f) => `${f.conta ? `<b>${esc(f.conta)}</b>: ` : ""}${esc(f.erro || "Falha ao ler uma conexão")}`).join("<br>")}</div></div>`
    : "";
  if (!g || !(g.por_categoria || []).length) {
    const corpo = D().itens.length
      ? vazio("", "Ainda sem gastos importados deste mês", "Toque em Sincronizar para buscar as transações no Meu Pluggy.")
      : vazio("", "Conecte seus bancos", "Autorize pelo app do banco (Open Finance). O app busca extratos, cartões e investimentos, e só você vê.", `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center"><button class="btn btn-primary btn-sm" data-act="conectar-banco">Conectar banco</button><button class="btn btn-ghost btn-sm" data-act="guia-pluggy">Como conectar</button></div>`);
    return `<section class="card s7 m12 t12">${cab}${falhas}${corpo}${D().itens.length ? aviso : ""}</section>`;
  }
  const visao = S.gastosVisao;
  const { itens, fatias, total } = fatiasGastos(g, visao);
  const txs = g.transacoes || [];
  const linhas = itens
    .map((it) => {
      const aberto = S.gastoAberto === it.nome;
      const doItem = txs.filter((t) => (visao === "grupo" ? (t.grupo || t.categoria) === it.nome : t.categoria === it.nome));
      let dentro = "";
      if (aberto) {
        const filhos = visao === "grupo" && it.filhos.length > 1
          ? `<div class="gx-sub">${it.filhos
              .sort((a, b) => b.total - a.total)
              .map((c) => `<div class="gx-s"><span class="gx-i">${ic(iconeGasto(c.categoria), "sm")}</span><span class="gx-n">${esc(c.categoria)}</span><strong class="num">${brl(c.total)}</strong></div>`)
              .join("")}</div>`
          : "";
        const lim = S.gastoTodas ? 400 : 5;
        dentro = `<div class="gx-dentro">${filhos}${linhasTransacoes(doItem, lim)}${doItem.length > 5 ? `<button class="gx-mais" data-act="gasto-todas">${S.gastoTodas ? "Mostrar menos" : `Ver todas as ${doItem.length} transações`}</button>` : ""}</div>`;
      }
      return `<div class="gx-row${aberto ? " aberto" : ""}" style="--c:${it.cor}">
        <button class="gx-h" data-act="gasto-abre" data-v="${esc(it.nome)}" aria-expanded="${aberto}">
          <span class="gx-ic">${ic(iconeGasto(it.nome), "sm")}</span>
          <span class="gx-n"><b>${esc(it.nome)}</b><small>${Math.round(it.pct * 100)}%</small></span>
          <strong class="num">${brl(it.total)}</strong>${ic(aberto ? "cima" : "baixo", "sm")}
        </button>${dentro}</div>`;
    })
    .join("");
  const minhasContas = [
    ...contasDoMes(D(), S.month, "pessoal").filter((i) => i.tipo === "conta"),
    ...contasDoMes(D(), S.month, "casa").filter((i) => i.tipo === "conta" && i.pagador === minhaVaga()),
  ];
  const assin = (g.assinaturas || []).length
    ? `<div class="gx-extra"><p class="gx-tt">Prováveis assinaturas</p><p class="faint gx-tsub">Se é um gasto fixo, vire conta pessoal: ela entra nas Contas pessoais e sai do dia a dia.</p><dl class="kv gx-assin">${g.assinaturas.slice(0, 8).map((a, k) => {
        const ja = minhasContas.find((c) => bate(c.valorMes, c.nome, a.valor, a.descricao));
        return `<dt>${esc(a.descricao)}</dt><dd><span class="num">${brl(a.valor)}</span>${ja
          ? `<span class="gx-ja" data-tip="Já lançada como “${esc(ja.nome)}”">${ic("ok", "sm")}Conta</span>`
          : `<button class="link-btn" data-act="assin-conta" data-i="${k}">Virar conta</button>`}</dd>`;
      }).join("")}</dl></div>`
    : "";
  return `<section class="card s7 m12 t12 c-gastos">${cab}${falhas}
    <div class="gx">
      <div class="gx-l">${roscaGastos(fatias, total)}
        <dl class="kv gx-kv"><dt>Saídas</dt><dd>${brl(g.saidas)}</dd><dt>Entradas</dt><dd>${brl(g.entradas)}</dd></dl></div>
      <div class="gx-r">
        <div class="seg-ctl wide" role="group" aria-label="Agrupar gastos"><button data-act="gasto-visao" data-v="cat" aria-pressed="${visao === "cat"}">Categorias</button><button data-act="gasto-visao" data-v="grupo" aria-pressed="${visao === "grupo"}">Grupos</button></div>
        <div class="gx-list">${linhas}</div>
      </div>
    </div>${assin}${aviso}</section>`;
}

/* ---- Dia a dia: gasto real nos bancos × orçamento ---- */
function blocoDiaADia() {
  const orc = Number(D().prefs?.dia_a_dia || 0);
  const r = gastoReal(D(), S.month, minhaVaga());
  const cab = cardHead("pote", "Dia a dia", r ? "Gasto real nos bancos × seu orçamento" : "Quanto você reserva por mês para gastos soltos", "pessoal");
  const btn = `<div><button class="btn btn-sm" data-act="diadia">Ajustar orçamento</button></div>`;
  if (!r) return `<section class="card s5 m12 t12">${cab}${money(orc)}${btn}</section>`;
  const passou = r.total > orc;
  const pctUso = orc > 0 ? Math.min(100, (r.total / orc) * 100) : 100;
  const conta = Math.max(orc, r.total);
  const grupoFora = (lista, titulo) => (lista.length
    ? `<p class="dd-ft">${titulo} <span class="num">${brl(sum(lista.map((t) => Math.abs(t.valor))))}</span></p>${lista.map((t) => `<div class="dd-tx"><span>${esc(t.descricao || "")}${t.motivo && titulo.startsWith("Já lançad") ? ` <small>→ ${esc(t.motivo)}</small>` : ""}</span><span class="num">${brl(Math.abs(t.valor))}</span></div>`).join("")}`
    : "");
  const fora = r.foraTotal > 0
    ? `<details class="avancado dd-fora"><summary>${ic("dir", "sm")}Fora do dia a dia: ${brl(r.foraTotal)}</summary>
        <p class="faint">Já contado em outro lugar do Saldo previsto, para não entrar duas vezes.</p>
        ${grupoFora(r.fora.conta, "Já lançado como conta")}${grupoFora(r.fora.cartao, `Compras de cartão com fatura já nas contas${r.cartoesContados.length ? ` (${esc(r.cartoesContados.join(", "))})` : ""}`)}${grupoFora(r.fora.acerto, "Transferências para a outra pessoa da casa")}</details>`
    : "";
  return `<section class="card s5 m12 t12">${cab}
    <div class="dd-num">${money(r.total)}<span class="faint">de ${brl(orc)} de orçamento</span></div>
    <div class="meter${passou ? " over" : ""}"><div class="fill" style="width:${pctUso.toFixed(1)}%"></div></div>
    <p class="dd-nota">${passou
      ? `Passou ${brl(r.total - orc)} do orçamento. O Saldo previsto já usa o gasto real (${brl(conta)}).`
      : `Ainda cabem ${brl(orc - r.total)}. O Saldo previsto reserva o orçamento inteiro (${brl(orc)}) até o gasto passar dele.`}</p>
    ${fora}${btn}</section>`;
}

function pMinhas() {
  const itens = contasDoMes(D(), S.month, "pessoal");
  const total = sum(itens.map((i) => i.valorMes));
  const g = D().gastos.find((x) => x.mes === S.month);
  const imp = D().importacao;
  const saldoTotal = imp ? sum((imp.contas || []).map((c) => c.saldo)) : 0;
  return `${pageHead("Minhas contas", "Só você vê esta página.", `<button class="btn btn-primary" data-act="nova-conta" data-escopo="pessoal">${ic("mais", "sm")}Nova conta pessoal</button>`)}
  <div class="grid">
    <section class="card s7 m12 t12">${cardHead("cadeado", "Contas pessoais", mesNome(S.month), "pessoal")}
      ${itens.length ? `<div class="bills">${itens.map((i) => linhaConta(i)).join("")}</div><div class="list-foot"><span class="muted">${itens.filter((i) => i.pago).length} de ${itens.length} pagas</span><strong class="num">${brl(total)}</strong></div>` : vazio("", "Nenhuma conta pessoal neste mês", "Academia, curso, ajuda à família: o que é só seu fica aqui e não aparece para a outra pessoa.", `<button class="btn btn-primary btn-sm" data-act="nova-conta" data-escopo="pessoal">Nova conta pessoal</button>`)}
    </section>
    ${blocoDiaADia()}
    ${blocoGastosBancos(g, imp)}
    <section class="card s5 m12 t12">${cardHead("pote", "Saldos nas contas", imp ? `Atualizado em ${horaBR(imp.atualizado_em)}` : "", "pessoal")}
      ${imp && (imp.contas || []).length ? `${money(saldoTotal)}<dl class="kv">${imp.contas.map((c) => `<dt>${esc(c.nome)}${c.final ? ` ··${esc(c.final)}` : ""}</dt><dd>${brl(c.saldo)}</dd>`).join("")}</dl>` : `<p class="faint">Os saldos aparecem depois da primeira sincronização com o Meu Pluggy.</p>`}
    </section>
  </div>`;
}

function pCartoes() {
  const { proprios, importados } = todosCartoes();
  const bloco = (c) => {
    const f = c.faturas?.[S.month];
    const usado = c.limite && f != null ? Math.min(100, (Number(f) / c.limite) * 100) : null;
    const pago = Boolean(c.pagos?.[S.month]);
    return `<section class="card">${faceCartao(c)}
      <dl class="kv"><dt>Fatura de ${mesNome(S.month, true)}</dt><dd>${f != null ? brl(f) : "—"} <button class="link-btn" data-act="fatura" data-id="${c.id}">${f != null ? "editar" : "informar"}</button></dd>
      <dt>Vencimento</dt><dd>${String(c.vencimento).padStart(2, "0")}/${addYM(S.month, 1).slice(5, 7)}</dd>${c.fechamento ? `<dt>Fechamento</dt><dd>dia ${c.fechamento}</dd>` : ""}
      ${c.escopo === "casa" ? `<dt>Quem paga</dt><dd>${esc(nome(c.pagador === "b" ? "b" : "a"))}</dd>` : ""}
      ${c.limite ? `<dt>Limite</dt><dd>${brl(c.limite)}</dd>` : ""}</dl>
      ${usado !== null ? `<div><div class="meter"><div class="fill" style="width:${usado}%"></div></div><div class="meter-legend"><span>${pct(usado, 0)} do limite usado</span><span>${brl(c.limite - f)} livre</span></div></div>` : ""}
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap">
        ${f != null && c.somar_nas_contas ? `<label class="toggle"><span class="check"><input type="checkbox" ${pago ? "checked" : ""} data-pago data-tabela="cartoes" data-id="${c.id}"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" style="stroke-width:2.5"/></svg></span>Fatura paga</label>` : `<span class="faint" style="font-size:13px">${c.somar_nas_contas ? "Informe a fatura do mês" : "Não soma nas contas do mês"}</span>`}
        <button class="btn btn-ghost btn-sm" data-act="edit-cartao" data-id="${c.id}">${ic("lapis", "sm")}Editar</button></div></section>`;
  };
  const casa = proprios.filter((c) => c.escopo === "casa");
  const meus = proprios.filter((c) => c.escopo === "pessoal");
  return `${pageHead("Cartões", "As faturas entram nas contas do mês quando você quiser.", `<button class="btn btn-primary" data-act="novo-cartao">${ic("mais", "sm")}Novo cartão</button>`)}
    <div style="display:flex;align-items:center;gap:10px"><h2 style="font-size:17px;font-weight:600">Da casa</h2>${badge("casa")}</div>
    ${casa.length ? `<div class="cc-grid">${casa.map(bloco).join("")}</div>` : `<div class="card">${vazio("cartoes", "Nenhum cartão da casa", "Um cartão usado para as despesas dos dois aparece aqui para ambos, com a fatura entrando no acerto.", `<button class="btn btn-primary btn-sm" data-act="novo-cartao" data-escopo="casa">Novo cartão da casa</button>`)}</div>`}
    <div style="display:flex;align-items:center;gap:10px;margin-top:8px"><h2 style="font-size:17px;font-weight:600">Meus cartões</h2>${badge("pessoal")}</div>
    ${meus.length ? `<div class="cc-grid">${meus.map(bloco).join("")}</div>` : `<div class="card">${vazio("", "Nenhum cartão pessoal", "Seus cartões ficam visíveis só para você.", `<button class="btn btn-sm" data-act="novo-cartao" data-escopo="pessoal">Novo cartão pessoal</button>`)}</div>`}
    ${importados.length ? `<section class="card">${cardHead("", "Encontrados no Open Finance", "Toque em Usar no app para acompanhar a fatura aqui", "pessoal")}<div class="table-wrap"><table class="t"><thead><tr><th>Cartão</th><th class="r">Fatura atual</th><th class="r">Limite livre</th><th>Vencimento</th><th></th></tr></thead><tbody>${importados.map((c) => `<tr><td>${esc(c.nome)}${c.final ? ` ··${esc(c.final)}` : ""}</td><td class="r">${brl(c.fatura)}</td><td class="r">${c.disponivel != null ? brl(c.disponivel) : "—"}</td><td>${dataBR(c.vencimento)}</td><td class="r"><button class="btn btn-sm" data-act="usar-cartao" data-id="${esc(c.id)}">Usar no app</button></td></tr>`).join("")}</tbody></table></div></section>` : ""}`;
}

// Rentabilidade em 12 meses: número do banco, estimativa pelo indexador ou resultado desde a aplicação.
const DICA_RENTAB = {
  banco: "Rentabilidade dos últimos 12 meses informada pelo banco.",
  indexador: "Quanto o título rendeu nos últimos 12 meses pelo indexador (dados do Banco Central), antes do IR. Se você aplicou há menos de 12 meses, é a taxa do título no período, não o seu ganho.",
  aplicacao: "Sem indexador: resultado desde a aplicação (saldo ÷ valor aplicado), antes do IR.",
};
function celRentab(v) {
  if (v.rentab_12m == null || !Number.isFinite(Number(v.rentab_12m))) return "—";
  const n = Number(v.rentab_12m);
  const cor = n < 0 ? ' style="color:var(--neg)"' : "";
  const dica = DICA_RENTAB[v.rentabFonte] || "";
  return `<span class="num"${cor}${dica ? ` data-tip="${esc(dica)}"` : ""}>${n > 0 ? "+" : ""}${pct(n, 2)}</span>${v.rentabNota ? `<div class="faint" style="font-size:12px;white-space:nowrap">${esc(v.rentabNota)}</div>` : ""}`;
}

const CORES_CLASSE = ["var(--sg-sobra)", "var(--sg-pess)", "var(--sg-casa)", "var(--pb)", "var(--warn)", "#8b5cf6", "var(--text-3)"];
function pInvest() {
  const manuais = D().invest.map((v) => ({ ...v, origem: "manual" }));
  const imp = (D().importacao?.investimentos || []).map((v) => ({ ...v, rentab_12m: v.rentab12m, origem: "openfinance" }));
  const todos = [...manuais, ...imp];
  const total = sum(todos.map((v) => v.valor));
  const porClasse = new Map();
  for (const v of todos) porClasse.set(v.classe || "Outros", (porClasse.get(v.classe || "Outros") || 0) + Number(v.valor || 0));
  const classes = [...porClasse.entries()].sort((a, b) => b[1] - a[1]);
  const m = D().mercado?.dados;
  return `${pageHead("Investimentos", "A carteira é só sua. Metas e cenário são vistos pelos dois.", `<button class="btn btn-primary" data-act="novo-inv">${ic("mais", "sm")}Novo investimento</button>`)}
  <div class="grid">
    <section class="card s7 m12 t12">${cardHead("planta", "Minha carteira", todos.length ? `${todos.length} posições` : "", "pessoal")}
      ${todos.length ? `${money(total, "big xl")}
        <div class="alloc-bar" role="img" aria-label="Carteira por classe">${classes.map(([c, v], k) => `<i style="flex:${(v / (total || 1)).toFixed(4)};background:${CORES_CLASSE[k % CORES_CLASSE.length]}" data-tip="${esc(c)}: ${brl(v)}"></i>`).join("")}</div>
        <div class="alloc-legend">${classes.map(([c, v], k) => `<div class="sbl"><span class="lg-l"><i class="dot" style="background:${CORES_CLASSE[k % CORES_CLASSE.length]}"></i>${esc(c)}</span><span class="lg-v">${brl(v)} <small>· ${pct((v / (total || 1)) * 100, 0)}</small></span></div>`).join("")}</div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Investimento</th><th>Classe</th><th class="r">Valor</th><th class="r">12 meses</th><th>Vence</th><th></th></tr></thead><tbody>
        ${todos.map((v) => `<tr><td>${esc(v.nome)}<div class="faint" style="font-size:12px">${esc(v.instituicao || "")}${v.origem === "openfinance" ? " · Open Finance" : ""}</div></td><td>${esc(v.classe || "")}</td><td class="r">${brl(v.valor)}</td><td class="r">${celRentab(v)}</td><td>${v.vencimento ? dataBR(v.vencimento) : "—"}</td><td class="r">${v.origem === "manual" ? `<button class="icon-btn" data-act="edit-inv" data-id="${v.id}" aria-label="Editar ${esc(v.nome)}">${ic("lapis", "sm")}</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>
        ${m?.indicadores ? `<p class="source">Referências: CDI ${pct(m.indicadores.cdi?.valor ?? 0, 2)} a.a. · IPCA ${pct(m.indicadores.ipca12m?.valor ?? 0, 2)} em 12 meses.</p>` : ""}`
        : vazio("", "Nenhum investimento ainda", "Lance suas aplicações (Tesouro, CDB, fundos, ações, cripto) ou sincronize pelo Meu Pluggy. Ninguém mais vê esta carteira.", `<button class="btn btn-primary btn-sm" data-act="novo-inv">Novo investimento</button>`)}
    </section>
    ${blocoMetas("s5 m12 t12", true)}
    ${blocoCenario()}
  </div>`;
}

function blocoCenario() {
  const M = D().mercado;
  const m = M?.dados;
  if (!m) return `<section class="card s12">${cardHead("bussola", "Cenário econômico", "", "")}${vazio("", "Sem dados ainda", "Os dados do Banco Central chegam na primeira atualização diária.")}</section>`;
  const fx = m.focus?.itens || [];
  const f = (ind, ano) => fx.find((x) => x.indicador === ind && String(x.ano) === String(ano));
  const anos = [...new Set(fx.map((x) => String(x.ano)))].sort();
  const delta = (it, inv = false) => {
    if (!it || it.ha4 == null) return "";
    const d = round2(it.mediana - it.ha4);
    if (Math.abs(d) < 0.005) return `<span class="delta flat">estável</span>`;
    const up = d > 0;
    return `<span class="delta ${up !== inv ? "up" : "down"}">${ic(up ? "cima" : "baixo", "sm")}${num(Math.abs(d), 2)}</span>`;
  };
  const linhaF = (ind, rotulo, fmt, inv) =>
    `<tr><td>${rotulo}</td>${anos.map((a) => `<td class="r">${f(ind, a) ? fmt(f(ind, a).mediana) : "—"} ${delta(f(ind, a), inv)}</td>`).join("")}</tr>`;
  const notas = leitura(m);
  return `<section class="card s12">${cardHead("bussola", "Cenário econômico", `Banco Central · atualizado em ${horaBR(M.atualizado_em)}`, "")}
    <div class="grid" style="gap:20px">
      <div class="s6 t12">${rhChart(m.series?.selic, { id: "selic", titulo: "Selic efetiva · % a.a., média do mês" })}</div>
      <div class="s6 t12">${rhChart(m.series?.ipca12m, { id: "ipca", titulo: "IPCA acumulado em 12 meses", nota: "O IBGE divulga o IPCA de cada mês só no mês seguinte; o gráfico mostra o último mês publicado." })}</div>
      <div class="s6 t12">${rhChart(m.series?.dolar, { id: "dolar", titulo: "Dólar · média do mês", fmt: "brl", rotuloFim: m.parcial?.dolar ? `${mesCurtoAno(m.parcial.dolar.mes)} parcial` : "", nota: m.parcial?.dolar ? `${mesCurtoAno(m.parcial.dolar.mes)}: média parcial de ${m.parcial.dolar.dias === 1 ? "1 dia útil" : `${m.parcial.dolar.dias} dias úteis`}, até ${dataBR(m.parcial.dolar.ate)}.` : "" })}</div>
      <div class="s6 t12"><p style="font-weight:600;font-size:14px;margin-bottom:8px">Expectativas do mercado (Focus${m.focus?.data ? ` de ${dataBR(m.focus.data)}` : ""})</p>
        <div class="table-wrap"><table class="t focus-table"><thead><tr><th>Mediana</th>${anos.map((a) => `<th class="r">${a}</th>`).join("")}</tr></thead><tbody>
          ${linhaF("IPCA", "IPCA (%)", (v) => num(v, 2))}${linhaF("Selic", "Selic (% a.a.)", (v) => num(v, 2))}${linhaF("Câmbio", "Dólar (R$)", (v) => num(v, 2))}${linhaF("PIB Total", "PIB (%)", (v) => num(v, 2), true)}
        </tbody></table></div><p class="source" style="margin-top:6px">Setas: mudança em relação a 4 semanas antes.</p></div>
    </div>
    ${notas.length ? `<div><p style="font-weight:600;font-size:14px;margin-bottom:8px">O que os números mostram</p><ul class="notes">${notas.map((n) => `<li>${n}</li>`).join("")}</ul></div>` : ""}
    <p class="source">Fontes: ${(m.fontes || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.nome)}</a>`).join(" · ")}. Informação, não recomendação de investimento.</p>
  </section>`;
}

function leitura(m) {
  const out = [];
  const ind = m.indicadores || {};
  const fx = m.focus?.itens || [];
  const f = (i, a) => fx.find((x) => x.indicador === i && String(x.ano) === String(a));
  const anos = [...new Set(fx.map((x) => String(x.ano)))].sort();
  const [a1, a2] = anos;
  const mud = (it, fmt) => (it && it.ha4 != null && Math.abs(it.mediana - it.ha4) >= 0.005 ? ` (eram ${fmt(it.ha4)} há quatro semanas)` : "");
  if (ind.selic && f("Selic", a1)) {
    out.push(`A meta Selic está em ${pct(ind.selic.valor, 2)} a.a. O Focus projeta ${pct(f("Selic", a1).mediana, 2)} no fim de ${a1}${mud(f("Selic", a1), (v) => pct(v, 2))}${a2 && f("Selic", a2) ? ` e ${pct(f("Selic", a2).mediana, 2)} no fim de ${a2}${mud(f("Selic", a2), (v) => pct(v, 2))}` : ""}.`);
  }
  if (ind.ipca12m && f("IPCA", a1)) {
    out.push(`O IPCA somou ${pct(ind.ipca12m.valor, 2)} nos 12 meses até ${mesNome(ind.ipca12m.data.slice(0, 7)).toLowerCase()}. A projeção do Focus é ${pct(f("IPCA", a1).mediana, 2)} para ${a1}${mud(f("IPCA", a1), (v) => pct(v, 2))}${a2 && f("IPCA", a2) ? ` e ${pct(f("IPCA", a2).mediana, 2)} para ${a2}${mud(f("IPCA", a2), (v) => pct(v, 2))}` : ""}.`);
  }
  if (ind.dolar && f("Câmbio", a1)) {
    out.push(`O dólar PTAX fechou a R$ ${num(ind.dolar.valor, 4)} em ${dataBR(ind.dolar.data)}. O Focus projeta R$ ${num(f("Câmbio", a1).mediana, 2)} no fim de ${a1}${mud(f("Câmbio", a1), (v) => `R$ ${num(v, 2)}`)}.`);
  }
  if (f("PIB Total", a1)) {
    out.push(`Crescimento do PIB projetado: ${pct(f("PIB Total", a1).mediana, 2)} em ${a1}${mud(f("PIB Total", a1), (v) => pct(v, 2))}${a2 && f("PIB Total", a2) ? ` e ${pct(f("PIB Total", a2).mediana, 2)} em ${a2}` : ""}.`);
  }
  if (ind.selic && f("IPCA", a2 || a1)) {
    const ipcaE = f("IPCA", a2 || a1).mediana;
    const real = ((1 + ind.selic.valor / 100) / (1 + ipcaE / 100) - 1) * 100;
    out.push(`Com a Selic de hoje e o IPCA esperado para ${a2 || a1}, o juro real fica perto de ${pct(real, 1)} ao ano: é o quanto uma aplicação atrelada à Selic renderia acima da inflação se nada mudasse.`);
  }
  return out;
}

function pAjustes() {
  const casa = D().casa;
  const me = eu();
  const b = D().membros.find((m) => !m.user_id);
  const sozinho = D().membros.every((m) => !m.user_id || m.user_id === meId());
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches;
  return `${pageHead("Ajustes", "")}
  <div class="grid">
    <section class="card s6 t12">${cardHead("canecas", "Pessoas da casa", "", "casa")}
      <dl class="kv">${D().membros.map((m) => `<dt><span class="chip">${avatar(m.vaga, true)}${esc(nome(m.vaga, { voce: false }))}${m.user_id === meId() ? " (você)" : ""}</span></dt><dd>${m.user_id ? "Conectada" : "Aguardando convite"} ${m.user_id === meId() || !m.user_id ? `<button class="link-btn" data-act="apelido" data-vaga="${m.vaga}">renomear</button>` : ""}</dd>`).join("")}</dl>
      ${b && !b.user_id ? `<div class="banner"><div class="grow">Código de convite: <strong class="num" style="font-size:17px;letter-spacing:.08em">${esc(casa?.codigo_convite)}</strong><br><span class="muted" style="font-size:13px">A outra pessoa cria a conta, escolhe “Entrar com convite” e digita este código.</span></div><button class="btn btn-sm" data-act="copiar" data-v="${esc(casa?.codigo_convite)}">${ic("copiar", "sm")}Copiar</button></div><button class="link-btn" data-act="novo-codigo" style="align-self:flex-start">Gerar outro código</button>` : ""}
      <dl class="kv"><dt>Divisão</dt><dd>50/50 com acerto no fim do mês</dd></dl>
      <div><button class="btn btn-danger btn-sm" data-act="ask-sair-casa">${ic("sair", "sm")}Sair da casa</button></div>
      <div class="confirm" id="confirmSairCasa" hidden><p>${sozinho
        ? "Só você está nesta casa. Ao sair, a casa é apagada com as contas, cartões, metas e acertos lançados nela. Seus investimentos, dia a dia e bancos conectados continuam com você. Depois você pode criar outra casa ou entrar com um código de convite."
        : `Ao sair, ${esc(nome(outra(), { voce: false }))} continua na casa com as contas e cartões da casa. Suas contas e cartões pessoais desta casa são apagados. Seus investimentos, dia a dia e bancos conectados continuam com você.`}</p><div class="btns"><button type="button" class="btn btn-danger-solid btn-sm" data-act="sair-casa">Sair da casa</button><button type="button" class="btn btn-sm" data-act="cancel-sair-casa">Ficar</button></div></div>
    </section>
    <section class="card s6 t12">${cardHead("cadeado", "Quem vê o quê", "", "")}
      <ul class="notes">
        <li>Contas e cartões da casa, renda, metas e acerto: os dois veem.</li>
        <li>Contas e cartões pessoais, dia a dia, investimentos e dados dos bancos: só quem lançou.</li>
        <li>A regra é aplicada pelo banco de dados, não só pela tela: a conta de um não consegue ler os dados pessoais do outro.</li>
      </ul></section>
    <section class="card s6 t12">${cardHead("pote", "Meus valores", "", "")}
      <dl class="kv"><dt>Minha renda (os dois veem)</dt><dd>${me?.renda != null ? brl(me.renda) : "—"} <button class="link-btn" data-act="renda" data-vaga="${me?.vaga}">editar</button></dd>
      <dt>Dia a dia (só você vê)</dt><dd>${brl(D().prefs?.dia_a_dia || 0)} <button class="link-btn" data-act="diadia">editar</button></dd></dl></section>
    <section class="card s6 t12">${cardHead("envelope", "Bancos (Meu Pluggy)", "Somente leitura, só você vê", "pessoal")}
      ${D().itens.length ? `<dl class="kv">${D().itens.map((i) => `<dt>${esc(i.apelido || "Conexão")}<div class="faint num" style="font-size:12px">${esc(i.item_id)}</div></dt><dd><button class="btn btn-danger btn-sm" data-act="rm-item" data-id="${esc(i.item_id)}">Remover</button></dd>`).join("")}</dl>` : `<p class="muted" style="font-size:14px">Toque em Conectar banco, escolha o banco e autorize pelo app dele. O app só lê os dados, nunca movimenta dinheiro.</p>`}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" data-act="conectar-banco">${ic("mais", "sm")}Conectar banco</button><button class="btn btn-ghost btn-sm" data-act="guia-pluggy">${ic("livro", "sm")}Como conectar</button>${D().itens.length ? `<button class="btn btn-sm" data-act="sync" ${S.syncing ? "disabled" : ""}>${ic("atualizar", "sm")}${S.syncing ? "Sincronizando…" : "Sincronizar agora"}</button>` : ""}</div>
      <details class="avancado" data-avancado ${S.avancadoBancos ? "open" : ""}><summary>${ic("dir", "sm")}Avançado</summary>
        <p class="faint">Só para suporte: ligar uma conexão que já existe na Pluggy colando o Item ID dela. Conexões feitas assim não atualizam sozinhas; o normal é usar <strong>Conectar banco</strong>.</p>
        <div><button class="btn btn-ghost btn-sm" data-act="add-item">Usar Item ID</button></div></details>
      ${D().importacao ? `<p class="source">Última sincronização: ${horaBR(D().importacao.atualizado_em)}${(D().importacao.falhas || []).length ? ` · ${D().importacao.falhas.length} aviso(s)` : ""}</p>` : ""}
    </section>
    ${ios ? `<section class="card s6 t12">${cardHead("", "Instalar no iPhone", "", "")}<p class="muted" style="font-size:14px">No Safari, toque em Compartilhar e depois em <strong>Adicionar à Tela de Início</strong>. O app abre em tela cheia, com ícone próprio.</p></section>` : ""}
    <section class="card s6 t12">${cardHead("", "Aparência", "Vale só neste aparelho", "")}
      <div class="seg-ctl wide tema-escolha" role="group" aria-label="Tema">${[["auto", "Automático", "tema-auto"], ["claro", "Claro", "sol"], ["escuro", "Escuro", "lua"]]
        .map(([v, l, i]) => `<button data-act="tema" data-v="${v}" aria-pressed="${(temaSalvo() || "auto") === v}">${ic(i, "sm")}${l}</button>`).join("")}</div>
      <p class="tema-nota">Automático segue o modo claro ou escuro do celular ou do computador.</p></section>
    <section class="card s6 t12">${cardHead("", "Conta", esc(S.session?.user?.email || ""), "")}<div><button class="btn btn-sm" data-act="sair">${ic("sair", "sm")}Sair</button></div></section>
  </div>`;
}

/* ------------------------------------------------------------------ formulários */
const sheet = () => $("#sheet");
function openSheet(titulo, corpo, rodape, onSubmit) {
  const d = sheet();
  d.innerHTML = `<form class="sheet-in" novalidate><div class="sheet-head"><h2 id="sheetTitle">${titulo}</h2><button type="button" class="icon-btn" data-close aria-label="Fechar">${ic("x")}</button></div><div class="sheet-body">${corpo}</div><div class="sheet-foot">${rodape}</div></form>`;
  const form = d.querySelector("form");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = e.submitter || form.querySelector("[type=submit]");
    form.querySelectorAll(".err").forEach((x) => x.remove());
    form.querySelectorAll("[aria-invalid]").forEach((x) => x.removeAttribute("aria-invalid"));
    if (btn) btn.disabled = true;
    try {
      const ok = await onSubmit(fd, btn?.value, form);
      if (ok !== false) d.close();
    } finally {
      if (btn) btn.disabled = false;
    }
  };
  d.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => tentarFecharSheet()));
  // Marca o estado inicial depois que o formulário termina de montar (prévias, calendário etc.).
  folha = { form, inicial: null, extra: false };
  form.addEventListener("input", marcarExtra);
  form.addEventListener("change", marcarExtra);
  form.addEventListener("click", (e) => { if (e.target.closest?.("#ccImgRm")) folha.extra = true; });
  if (!d.open) d.showModal();
  setTimeout(() => {
    if (folha.form === form) folha.inicial = serialForm(form);
    form.querySelector("input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select")?.focus();
  }, 30);
}

/* ---- fechar o formulário sem perder o que foi digitado ---- */
let folha = { form: null, inicial: null, extra: false };
const serialForm = (form) =>
  JSON.stringify([...new FormData(form)].map(([k, v]) => [k, typeof v === "string" ? v : `${v.name}:${v.size}`]));
// Campos sem nome (imagem do cartão, zoom do recorte) não entram no FormData: qualquer mexida conta.
function marcarExtra(e) {
  if (e.isTrusted && e.target?.matches?.("input:not([name]), select:not([name]), textarea:not([name])")) folha.extra = true;
}
const sheetAlterada = () =>
  Boolean(folha.form && folha.inicial !== null && (folha.extra || serialForm(folha.form) !== folha.inicial));
function tentarFecharSheet() {
  const d = sheet();
  if (!d?.open) return;
  if (!sheetAlterada()) return d.close();
  const pe = d.querySelector(".sheet-foot");
  if (!pe || pe.querySelector(".discard")) return pe?.querySelector("[data-act=descartar]")?.focus();
  const barra = document.createElement("div");
  barra.className = "discard";
  barra.setAttribute("role", "alert");
  barra.innerHTML = `<p>Descartar o que você alterou?</p><div class="btns"><button type="button" class="btn btn-danger-solid btn-sm" data-act="descartar">Descartar</button><button type="button" class="btn btn-sm" data-act="continuar-editando">Continuar editando</button></div>`;
  const antes = [...pe.children];
  antes.forEach((x) => (x.hidden = true));
  pe.append(barra);
  const voltar = () => { barra.remove(); antes.forEach((x) => (x.hidden = false)); };
  barra.querySelector("[data-act=descartar]").onclick = () => { voltar(); d.close(); };
  barra.querySelector("[data-act=continuar-editando]").onclick = () => { voltar(); pe.querySelector("[type=submit]")?.focus(); };
  barra.querySelector("[data-act=continuar-editando]").focus();
}
sheetCloseOnBackdrop();
function sheetCloseOnBackdrop() {
  document.addEventListener("click", (e) => {
    const d = sheet();
    if (d?.open && e.target === d) tentarFecharSheet();
  });
  // Esc no formulário: mesma regra do botão Cancelar.
  document.addEventListener("cancel", (e) => {
    if (e.target !== sheet()) return;
    e.preventDefault();
    tentarFecharSheet();
  }, true);
}
function fieldErr(form, name, msg) {
  const el = form.querySelector(`[name="${name}"]`);
  if (!el) return toast(msg, true);
  el.setAttribute("aria-invalid", "true");
  const p = document.createElement("span");
  p.className = "err";
  p.textContent = msg;
  el.closest(".field").appendChild(p);
  el.focus();
}
const fMoney = (name, label, val, hint = "") =>
  `<div class="field"><label for="f_${name}">${label}</label><div class="money"><span>R$</span><input class="inp" id="f_${name}" name="${name}" inputmode="decimal" autocomplete="off" value="${val != null && val !== "" ? esc(num(val)) : ""}" placeholder="0,00"></div>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
const fText = (name, label, val = "", attrs = "", hint = "") =>
  `<div class="field"><label for="f_${name}">${label}</label><input class="inp" id="f_${name}" name="${name}" value="${esc(val)}" ${attrs}>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
const fDia = (name, label, val = "") =>
  `<div class="field"><label for="f_${name}">${label}</label><input class="inp" id="f_${name}" name="${name}" type="number" inputmode="numeric" min="1" max="31" value="${esc(val)}"></div>`;
const fPagador = (val) =>
  `<div class="field"><span class="lab">Quem paga</span><div class="choice">${["a", "b"].map((v) => `<label><input type="radio" name="pagador" value="${v}" ${val === v ? "checked" : ""}><span>${esc(nome(v))}</span></label>`).join("")}</div><span class="hint">O acerto no fim do mês divide tudo meio a meio.</span></div>`;
// Escolha Da casa / Pessoal. Sem padrão quando não dá para saber (evita expor conta pessoal por engano).
// Na edição, só quem lançou pode trocar (o banco também só deixa o dono tornar pessoal).
const nomeOutra = () => (D()?.membros.some((m) => m.vaga === outra()) ? nome(outra(), { voce: false }) : "A outra pessoa da casa");
function fEscopo(item, esc0, { titulo, casaTxt, pessoalTxt, pessoalLbl = "Pessoal", fem = true }) {
  if (item && item.dono_id !== meId()) {
    return `<div>${badge(item.escopo)}<span class="hint">${fem ? "Lançada" : "Lançado"} por ${esc(nomeOutra())}. Só quem lançou pode ${fem ? "torná-la" : "torná-lo"} pessoal.</span></div>`;
  }
  return `<div class="field"><span class="lab">${titulo}</span><div class="choice">
      <label><input type="radio" name="escopo" value="casa" ${esc0 === "casa" ? "checked" : ""}><span>Da casa<small>${casaTxt}</small></span></label>
      <label><input type="radio" name="escopo" value="pessoal" ${esc0 === "pessoal" ? "checked" : ""}><span>${pessoalLbl}<small>${pessoalTxt}</small></span></label></div>
      <span class="esc-aviso" id="escAviso" aria-live="polite"></span></div>`;
}
// Liga a escolha: mostra "Quem paga" só para conta da casa e avisa quando a edição muda quem vê.
function ligarEscopo(item, tipo, entra, sai) {
  sheet().querySelectorAll("input[name=escopo]").forEach((r) =>
    (r.onchange = () => {
      if (!r.checked) return;
      $("#pagadorBox").hidden = r.value !== "casa";
      const av = $("#escAviso");
      if (!av || !item) return;
      const outraP = nomeOutra();
      av.textContent =
        r.value === item.escopo ? ""
        : r.value === "casa" ? `${outraP} passa a ver ${tipo}, ${entra}`
        : `${outraP} deixa de ver ${tipo}, ${sai}`;
    }),
  );
}
function lerEscopo(fd, form, item, rotulo) {
  if (item && item.dono_id !== meId()) return item.escopo;
  const v = fd.get("escopo");
  if (v !== "casa" && v !== "pessoal") {
    fieldErr(form, "escopo", `Escolha se ${rotulo} é da casa ou pessoal.`);
    throw new Error("validacao");
  }
  return v;
}
const msgEscopo = (antes, depois) =>
  antes === depois ? "" : depois === "casa" ? ` Agora ${nomeOutra()} também vê.` : ` Agora só você vê.`;
const confirmBlock = (texto, extra = "") =>
  `<div class="confirm" id="confirmDel" hidden><p>${texto}</p><div class="btns"><button type="submit" class="btn btn-danger-solid btn-sm" value="apagar">Apagar</button>${extra}<button type="button" class="btn btn-sm" data-act="cancel-del">Manter</button></div></div>`;
function readMoney(fd, form, name, { required = false, label = "o valor" } = {}) {
  const raw = fd.get(name);
  const v = parseMoney(raw);
  if ((raw === null || String(raw).trim() === "") && !required) return null;
  if (v === null || Number.isNaN(v) || v < 0) {
    fieldErr(form, name, `Informe ${label} em reais, por exemplo 1.250,90.`);
    throw new Error("validacao");
  }
  return v;
}
function readDia(fd, form, name, required = true) {
  const raw = String(fd.get(name) || "").trim();
  if (!raw && !required) return null;
  const v = Number(raw);
  if (!Number.isInteger(v) || v < 1 || v > 31) {
    fieldErr(form, name, "Use um dia entre 1 e 31.");
    throw new Error("validacao");
  }
  return v;
}
const guard = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (e) {
    if (e.message === "validacao") return false;
    toast(erroMsg(e), true);
    return false;
  }
};

function formConta({ id, escopo, pre } = {}) {
  const c = id ? D().contas.find((x) => x.id === id) : null;
  const esc0 = c?.escopo || escopo || null;
  const ym = S.month;
  const valorMes = c ? (c.valores?.[ym] ?? null) : null;
  const corpo = `
    ${fEscopo(c, esc0, { titulo: "Tipo de conta", casaTxt: "Os dois veem", pessoalTxt: "Só você vê" })}
    ${fText("nome", "Nome", c?.nome || "", 'maxlength="80" placeholder="Ex.: Aluguel"')}
    <div class="row2">${fMoney("valor", c?.recorrente ? "Valor mensal" : "Valor", c?.valor)}${fDia("dia", "Dia do vencimento", c?.dia || "")}</div>
    ${c?.recorrente ? fMoney("valorMes", `Valor só em ${mesNome(ym).toLowerCase()}`, valorMes, "Para contas que mudam todo mês, como luz. Deixe em branco para usar o valor mensal.") : ""}
    <div class="field"><label for="f_cat">Categoria</label><select class="inp" id="f_cat" name="categoria">${CATEGORIAS.map(([k, l]) => `<option value="${k}" ${(c?.categoria || "outros") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    ${c ? "" : `<div class="field"><span class="lab">Repete?</span><div class="choice"><label><input type="radio" name="rec" value="1" checked><span>Todo mês</span></label><label><input type="radio" name="rec" value="0"><span>Só em ${mesNome(ym).toLowerCase()}</span></label></div></div>`}
    <div id="pagadorBox" ${esc0 !== "casa" ? "hidden" : ""}>${fPagador(c?.pagador || minhaVaga() || "a")}</div>
    ${c ? confirmBlock(c.recorrente ? "Apagar esta conta de todos os meses, inclusive o histórico?" : "Apagar esta conta?", c.recorrente ? `<button type="submit" class="btn btn-sm" value="encerrar">Só encerrar a partir de ${mesNome(ym, true)}</button>` : "") : ""}`;
  const rodape = `${c ? `<button type="button" class="btn btn-danger left" data-act="ask-del">${ic("lixo", "sm")}Apagar</button>` : ""}<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary" value="salvar">Salvar</button>`;
  openSheet(c ? "Editar conta" : "Nova conta", corpo, rodape, guard(async (fd, acao, form) => {
    if (acao === "apagar") return apagarComDesfazer("contas", c.id, `Conta "${c.nome}" apagada.`);
    if (acao === "encerrar") return act(() => api.salvar("contas", { fim: addYM(ym, -1), atualizado_em: new Date().toISOString() }, c.id), `Conta encerrada a partir de ${mesNome(ym).toLowerCase()}.`);
    const nomeV = String(fd.get("nome") || "").trim();
    if (!nomeV) return fieldErr(form, "nome", "Dê um nome para a conta."), false;
    const valor = readMoney(fd, form, "valor", { required: true });
    const dia = readDia(fd, form, "dia");
    const escopoV = lerEscopo(fd, form, c, "a conta");
    const row = { nome: nomeV, escopo: escopoV, valor, dia, categoria: fd.get("categoria"), pagador: escopoV === "casa" ? fd.get("pagador") || "a" : null };
    if (c) {
      const vm = c.recorrente ? readMoney(fd, form, "valorMes") : undefined;
      return act(async () => {
        await api.salvar("contas", { ...row, atualizado_em: new Date().toISOString() }, c.id);
        if (c.recorrente && vm !== (c.valores?.[ym] ?? null)) await api.valorMes("contas", c.id, ym, vm);
      }, `Conta salva.${msgEscopo(c.escopo, escopoV)}`);
    }
    const rec = fd.get("rec") === "1";
    return act(() => api.salvar("contas", { ...row, recorrente: rec, inicio: ym, mes: rec ? null : ym }), escopoV === "casa" ? "Conta da casa lançada." : "Conta pessoal lançada.");
  }));
  ligarEscopo(c, "esta conta", "e ela entra na divisão da casa em todos os meses.", "e ela sai da divisão da casa em todos os meses.");
  if (pre && !c) {
    const f = sheet().querySelector("form");
    if (pre.nome) f.nome.value = pre.nome;
    if (pre.valor != null) f.valor.value = num(pre.valor);
    if (pre.dia && f.dia) f.dia.value = pre.dia;
    if (pre.categoria) f.categoria.value = pre.categoria;
  }
}

function formCartao({ id, escopo } = {}) {
  const c = id ? D().cartoes.find((x) => x.id === id) : null;
  const esc0 = c?.escopo || escopo || "pessoal";
  const ym = S.month;
  const corpo = `
    <div class="cc-preview" id="ccPrev">${faceCartao(c || { banco: "Seu banco", apelido: "", cor: "grafite", escopo: esc0, vencimento: "" })}</div>
    <div class="cc-crop" id="ccCrop" hidden><div class="cc-crop-frame" id="ccFrame"><img id="ccCropImg" alt="" draggable="false"><div class="cc-row bottom"><div><small>Vence</small><b id="ccCropV">—</b></div><div class="r"><small>Limite livre</small><b id="ccCropL">—</b></div></div></div>
      <label class="cc-zoom"><span>Zoom</span><input type="range" id="ccZoom" min="1" max="3" step="0.01" value="1"></label><p class="hint">Arraste a imagem para enquadrar o cartão.</p></div>
    <div class="field"><span class="lab">Imagem real do cartão (opcional)</span>
      <div class="img-pick"><label class="btn btn-sm">${ic("cartao", "sm")}${c?.imagem ? "Trocar imagem" : "Escolher imagem"}<input type="file" id="ccFile" accept="image/*" hidden></label>${c?.imagem ? `<button type="button" class="btn btn-ghost btn-sm" id="ccImgRm">Remover imagem</button>` : ""}</div>
      <span class="hint">Uma foto ou imagem da <b>frente</b> do cartão, como no Apple Pay. De preferência sem o número completo, e nunca o verso com o código de segurança. ${esc0 === "casa" ? "Cartão da casa: os dois veem a imagem." : "Cartão pessoal: só você vê a imagem."}</span></div>
    ${fEscopo(c, esc0, { titulo: "De quem é o cartão", casaTxt: "Os dois veem, a fatura entra no acerto", pessoalTxt: "Só você vê", pessoalLbl: "Meu", fem: false })}
    <div class="row2">${fText("banco", "Banco", c?.banco || "", 'maxlength="40" placeholder="Ex.: Nubank"')}${fText("apelido", "Apelido (opcional)", c?.apelido || "", 'maxlength="40" placeholder="Ex.: Cartão do mercado"')}</div>
    <div class="row2">${fText("final", "Últimos 4 dígitos (opcional)", c?.final || "", 'inputmode="numeric" maxlength="4" pattern="\\d{4}"')}
      <div class="field"><label for="f_band">Bandeira</label><select class="inp" id="f_band" name="bandeira">${["", "Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Outra"].map((b) => `<option value="${b}" ${(c?.bandeira || "") === b ? "selected" : ""}>${b || "Não informar"}</option>`).join("")}</select></div></div>
    <div class="field"><span class="lab">Cor do cartão</span><div class="swatches">${Object.entries(COR_CARTAO).filter(([k]) => !["petroleo", "ambar", "vinho", "noite", "oliva"].includes(k) || c?.cor === k).map(([k, [c1, c2]]) => `<label title="${k}"><input type="radio" name="cor" value="${k}" ${(c?.cor || "grafite") === k ? "checked" : ""}><span style="background:linear-gradient(135deg, ${c1}, ${c2})"></span><span class="sr-only">${k}</span></label>`).join("")}</div><span class="hint">A cor é escolhida pelo nome do banco; toque em outra para trocar.</span></div>
    <div class="row2">${fDia("vencimento", "Dia do vencimento", c?.vencimento || "")}${fDia("fechamento", "Dia do fechamento (opcional)", c?.fechamento || "")}</div>
    <div class="row2">${fMoney("limite", "Limite (opcional)", c?.limite)}${fMoney("fatura", `Fatura de ${mesNome(ym, true)}`, c?.faturas?.[ym], `Compras de ${mesNome(ym).toLowerCase()}; vence em ${mesNome(addYM(ym, 1)).toLowerCase()}.`)}</div>
    <label class="toggle"><input type="checkbox" name="somar" ${c ? (c.somar_nas_contas ? "checked" : "") : "checked"}> Somar a fatura nas contas do mês</label>
    <div id="pagadorBox" ${esc0 === "pessoal" ? "hidden" : ""}>${fPagador(c?.pagador || minhaVaga() || "a")}</div>
    ${c ? confirmBlock("Apagar este cartão e o histórico de faturas?") : ""}`;
  const rodape = `${c ? `<button type="button" class="btn btn-danger left" data-act="ask-del">${ic("lixo", "sm")}Apagar</button>` : ""}<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary" value="salvar">Salvar</button>`;
  const corte = { img: null, zoom: 1, x: 0, y: 0, remover: false };
  openSheet(c ? "Editar cartão" : "Novo cartão", corpo, rodape, guard(async (fd, acao, form) => {
    if (acao === "apagar") return apagarComDesfazer("cartoes", c.id, "Cartão apagado.", () => api.apagarImagemCartao(c.imagem));
    const banco = String(fd.get("banco") || "").trim();
    if (!banco) return fieldErr(form, "banco", "Informe o banco do cartão."), false;
    const final = String(fd.get("final") || "").trim();
    if (final && !/^\d{4}$/.test(final)) return fieldErr(form, "final", "Use só os 4 últimos números."), false;
    const vencimento = readDia(fd, form, "vencimento");
    const fechamento = readDia(fd, form, "fechamento", false);
    const limite = readMoney(fd, form, "limite");
    const fatura = readMoney(fd, form, "fatura");
    const escopoV = lerEscopo(fd, form, c, "o cartão");
    const row = {
      banco, escopo: escopoV, apelido: String(fd.get("apelido") || "").trim(), final: final || null, bandeira: fd.get("bandeira") || null,
      cor: fd.get("cor") || "grafite", vencimento, fechamento, limite, somar_nas_contas: fd.get("somar") === "on",
      pagador: escopoV === "casa" ? fd.get("pagador") || "a" : null,
    };
    // Imagem: recorta no formato de cartão e envia antes de salvar o cartão.
    const blob = corte.img ? await recortarCartao(corte) : null;
    const novaImagem = blob ? await api.enviarImagemCartao(D().casa.id, meId(), blob) : undefined;
    if (novaImagem !== undefined) row.imagem = novaImagem;
    else if (corte.remover) row.imagem = null;
    const antiga = c?.imagem && (novaImagem !== undefined || corte.remover) ? c.imagem : null;
    if (c) {
      return act(async () => {
        await api.salvar("cartoes", { ...row, atualizado_em: new Date().toISOString() }, c.id);
        if (fatura !== (c.faturas?.[ym] ?? null)) await api.valorMes("cartoes", c.id, ym, fatura);
        if (antiga) await api.apagarImagemCartao(antiga);
      }, `Cartão salvo.${msgEscopo(c.escopo, escopoV)}`);
    }
    return act(() => api.salvar("cartoes", { ...row, faturas: fatura != null ? { [ym]: fatura } : {}, origem: S.origemCartao || null }), "Cartão cadastrado.");
  }));
  ligarEscopo(c, "este cartão", "e a fatura entra no acerto em todos os meses.", "e a fatura sai do acerto em todos os meses.");
  // Prévia ao vivo: o cartão na tela muda enquanto a pessoa digita.
  const form = sheet().querySelector("form");
  let corManual = Boolean(c);
  form.querySelectorAll("input[name=cor]").forEach((r) => r.addEventListener("change", () => (corManual = true)));
  const atualizar = () => {
    const fd = new FormData(form);
    const banco = String(fd.get("banco") || "").trim();
    if (!corManual) {
      const auto = corDoBanco(banco);
      const alvo = auto && form.querySelector(`input[name=cor][value="${auto}"]`);
      if (alvo) alvo.checked = true;
    }
    const lim = parseMoney(fd.get("limite"));
    const fat = parseMoney(fd.get("fatura"));
    const prev = {
      banco: banco || "Seu banco", apelido: String(fd.get("apelido") || "").trim(), final: String(fd.get("final") || "").replace(/\D/g, "").slice(0, 4),
      bandeira: fd.get("bandeira") || "", cor: form.querySelector("input[name=cor]:checked")?.value || "grafite",
      escopo: fd.get("escopo") || c?.escopo || "pessoal", vencimento: String(fd.get("vencimento") || "").trim(),
      limite: Number.isFinite(lim) ? lim : null, faturas: Number.isFinite(fat) ? { [S.month]: fat } : {},
    };
    if (!corte.remover && !corte.img && c?.imagem_url) prev.imagem_url = c.imagem_url;
    $("#ccPrev").innerHTML = faceCartao(prev);
    const lv = prev.limite != null ? Math.max(0, prev.limite - (Number(prev.faturas[S.month]) || 0)) : null;
    $("#ccCropV").textContent = prev.vencimento ? `${String(prev.vencimento).padStart(2, "0")}/${addYM(S.month, 1).slice(5, 7)}` : "—";
    $("#ccCropL").textContent = lv != null ? brl(lv) : "—";
  };
  form.addEventListener("input", atualizar);
  form.addEventListener("change", atualizar);
  ligarCorte(form, corte, atualizar, c);
  atualizar();
}

/* ---- recorte da imagem do cartão (formato 1,586:1, como um cartão de verdade) ---- */
const CC_W = 1012;
const CC_H = 638;
function ligarCorte(form, corte, atualizar, c) {
  const file = $("#ccFile");
  const frame = $("#ccFrame");
  const im = $("#ccCropImg");
  const zoom = $("#ccZoom");
  const posicionar = () => {
    const fw = frame.clientWidth;
    const fh = fw / (CC_W / CC_H);
    const base = Math.max(fw / corte.img.naturalWidth, fh / corte.img.naturalHeight);
    const w = corte.img.naturalWidth * base * corte.zoom;
    const h = corte.img.naturalHeight * base * corte.zoom;
    corte.x = Math.min(0, Math.max(fw - w, corte.x));
    corte.y = Math.min(0, Math.max(fh - h, corte.y));
    Object.assign(corte, { fw, fh, w, h });
    im.style.width = `${w}px`;
    im.style.height = `${h}px`;
    im.style.transform = `translate(${corte.x}px, ${corte.y}px)`;
  };
  file.onchange = () => {
    const f = file.files?.[0];
    if (!f) return;
    if (!/^image\//.test(f.type)) return toast("Escolha um arquivo de imagem.", true);
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      corte.img = img;
      corte.zoom = 1;
      corte.remover = false;
      im.src = url;
      $("#ccCrop").hidden = false;
      $("#ccPrev").hidden = true;
      requestAnimationFrame(() => {
        const fw = frame.clientWidth;
        const base = Math.max(fw / img.naturalWidth, fw / (CC_W / CC_H) / img.naturalHeight);
        corte.x = (fw - img.naturalWidth * base) / 2;
        corte.y = (fw / (CC_W / CC_H) - img.naturalHeight * base) / 2;
        posicionar();
      });
    };
    img.onerror = () => toast("Não consegui abrir essa imagem. Tente outra (JPG ou PNG).", true);
    img.src = url;
  };
  zoom.oninput = () => {
    const cx = corte.fw / 2 - corte.x;
    const cy = corte.fh / 2 - corte.y;
    const antes = corte.w;
    corte.zoom = Number(zoom.value);
    posicionar();
    const k = corte.w / antes;
    corte.x = corte.fw / 2 - cx * k;
    corte.y = corte.fh / 2 - cy * k;
    posicionar();
  };
  let drag = null;
  frame.onpointerdown = (e) => {
    if (!corte.img) return;
    drag = { x: e.clientX - corte.x, y: e.clientY - corte.y };
    frame.setPointerCapture(e.pointerId);
  };
  frame.onpointermove = (e) => {
    if (!drag) return;
    corte.x = e.clientX - drag.x;
    corte.y = e.clientY - drag.y;
    posicionar();
  };
  frame.onpointerup = frame.onpointercancel = () => (drag = null);
  const rm = $("#ccImgRm");
  if (rm) rm.onclick = () => {
    corte.remover = true;
    corte.img = null;
    $("#ccCrop").hidden = true;
    $("#ccPrev").hidden = false;
    rm.hidden = true;
    atualizar();
  };
}
function recortarCartao(corte) {
  const cv = document.createElement("canvas");
  cv.width = CC_W;
  cv.height = CC_H;
  const ctx = cv.getContext("2d");
  const k = CC_W / corte.fw;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(corte.img, corte.x * k, corte.y * k, corte.w * k, corte.h * k);
  const gerar = (tipo, q) => new Promise((ok) => cv.toBlob((b) => ok(b), tipo, q));
  // O Safari do iPhone pode não gerar WebP; nesse caso vai JPEG.
  return gerar("image/webp", 0.86).then((b) => (b && b.type === "image/webp" ? b : gerar("image/jpeg", 0.88))).then((b) => {
    if (!b) throw new Error("Não consegui preparar a imagem.");
    return b;
  });
}

function formFatura(id) {
  const c = D().cartoes.find((x) => x.id === id);
  const ym = S.month;
  openSheet(`Fatura de ${mesNome(ym).toLowerCase()}`, `<p class="muted">${esc(c.apelido || c.banco)}${c.final ? ` ··${esc(c.final)}` : ""}</p>${fMoney("fatura", "Valor da fatura", c.faturas?.[ym], `Compras de ${mesNome(ym).toLowerCase()}, com vencimento em ${mesNome(addYM(ym, 1)).toLowerCase()}. Deixe em branco para remover.`)}`,
    `<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button>`,
    guard(async (fd, _a, form) => act(() => api.valorMes("cartoes", c.id, ym, readMoney(fd, form, "fatura")), "Fatura salva.")));
}

function formRenda(vaga) {
  const m = D().membros.find((x) => x.vaga === vaga);
  openSheet(`Renda de ${esc(nome(vaga, { voce: false }))}`, `${fMoney("renda", "Renda mensal líquida", m?.renda, "O valor que cai na conta por mês. Os dois veem este número.")}`,
    `<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button>`,
    guard(async (fd, _a, form) => act(() => api.salvarMembro(m.id, { renda: readMoney(fd, form, "renda") }), "Renda salva.")));
}
function formApelido(vaga) {
  const m = D().membros.find((x) => x.vaga === vaga);
  openSheet("Nome na casa", fText("apelido", "Como chamar esta pessoa", m?.apelido || "", 'maxlength="40"'),
    `<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button>`,
    guard(async (fd, _a, form) => {
      const v = String(fd.get("apelido") || "").trim();
      if (!v) return fieldErr(form, "apelido", "Informe um nome."), false;
      return act(() => api.salvarMembro(m.id, { apelido: v }), "Nome salvo.");
    }));
}
function formDiaDia() {
  openSheet("Dia a dia", `<p class="muted">Quanto você reserva por mês para gastos soltos: lanches, transporte, lazer. Só você vê.</p>${fMoney("v", "Valor mensal", D().prefs?.dia_a_dia ?? 0)}`,
    `<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Salvar</button>`,
    guard(async (fd, _a, form) => act(() => api.salvarPrefs(meId(), { dia_a_dia: readMoney(fd, form, "v") || 0 }), "Valor salvo.")));
}
function formMeta(id) {
  const m = id ? D().metas.find((x) => x.id === id) : null;
  const corpo = `${fText("nome", "Nome da meta", m?.nome || "", 'maxlength="60" placeholder="Ex.: Entrada do apartamento"')}
    <div class="row2">${fMoney("alvo", "Valor da meta", m?.alvo)}${campoData({ name: "prazo", label: "Prazo", value: m?.prazo || "", modo: "mes", min: m?.prazo && m.prazo < curYM() ? "" : curYM(), placeholder: "Escolher mês" })}</div>
    ${fMoney("inicial", "Já guardado antes", m?.inicial ?? "", "Os aportes registrados depois somam a este valor.")}
    ${m ? confirmBlock("Apagar a meta e os aportes registrados?") : ""}`;
  const rodape = `${m ? `<button type="button" class="btn btn-danger left" data-act="ask-del">${ic("lixo", "sm")}Apagar</button>` : ""}<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary" value="salvar">Salvar</button>`;
  openSheet(m ? "Editar meta" : "Nova meta do casal", corpo, rodape, guard(async (fd, acao, form) => {
    if (acao === "apagar") return apagarComDesfazer("metas", m.id, "Meta apagada.");
    const nomeV = String(fd.get("nome") || "").trim();
    if (!nomeV) return fieldErr(form, "nome", "Dê um nome para a meta."), false;
    const alvo = readMoney(fd, form, "alvo");
    if (alvo === 0) return fieldErr(form, "alvo", "O valor da meta precisa ser maior que zero."), false;
    const row = { nome: nomeV, alvo, prazo: fd.get("prazo") || null, inicial: readMoney(fd, form, "inicial") || 0 };
    return act(() => api.salvar("metas", row, m?.id), "Meta salva.");
  }));
}
function formAporte(metaId) {
  const m = D().metas.find((x) => x.id === metaId);
  const agora = new Date();
  const hoje = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  openSheet(`Aporte em ${esc(m.nome)}`, `${fMoney("valor", "Valor", "")}
    ${campoData({ name: "data", label: "Data", value: hoje, modo: "dia" })}
    <div class="field"><span class="lab">Quem guardou</span><div class="choice">${["a", "b"].map((v) => `<label><input type="radio" name="por" value="${v}" ${v === (minhaVaga() || "a") ? "checked" : ""}><span>${esc(nome(v))}</span></label>`).join("")}</div></div>`,
    `<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Registrar</button>`,
    guard(async (fd, _a, form) => {
      const v = readMoney(fd, form, "valor", { required: true });
      if (!v) return fieldErr(form, "valor", "Informe um valor maior que zero."), false;
      return act(() => api.salvar("aportes", { meta_id: m.id, valor: v, data: fd.get("data") || hoje, por: fd.get("por") }), "Aporte registrado.");
    }));
}
const CLASSES = ["Tesouro Direto", "CDB", "LCI", "LCA", "Renda fixa", "Fundos", "Ações", "FII", "ETFs", "Cripto", "Previdência", "Poupança", "Outros"];
function formInv(id) {
  const v = id ? D().invest.find((x) => x.id === id) : null;
  const corpo = `${fText("nome", "Nome", v?.nome || "", 'maxlength="80" placeholder="Ex.: Tesouro Selic 2031"')}
    <div class="row2"><div class="field"><label for="f_cl">Classe</label><select class="inp" id="f_cl" name="classe">${CLASSES.map((c) => `<option ${(v?.classe || "Renda fixa") === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>${fText("instituicao", "Instituição", v?.instituicao || "", 'maxlength="60"')}</div>
    <div class="row2">${fMoney("valor", "Valor atual", v?.valor)}${fMoney("aplicado", "Valor aplicado (opcional)", v?.aplicado)}</div>
    <div class="row2">${fText("rentab", "Rentabilidade em 12 meses, % (opcional)", v?.rentab_12m != null ? num(v.rentab_12m) : "", 'inputmode="decimal"')}${campoData({ name: "vencimento", label: "Vencimento (opcional)", value: v?.vencimento || "", modo: "dia", placeholder: "Sem vencimento" })}</div>
    ${fText("liquidez", "Liquidez (opcional)", v?.liquidez || "", 'maxlength="30" placeholder="Ex.: diária, D+30, no vencimento"')}
    ${v ? confirmBlock("Apagar este investimento?") : ""}`;
  const rodape = `${v ? `<button type="button" class="btn btn-danger left" data-act="ask-del">${ic("lixo", "sm")}Apagar</button>` : ""}<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary" value="salvar">Salvar</button>`;
  openSheet(v ? "Editar investimento" : "Novo investimento", corpo, rodape, guard(async (fd, acao, form) => {
    if (acao === "apagar") return apagarComDesfazer("investimentos", v.id, "Investimento apagado.");
    const nomeV = String(fd.get("nome") || "").trim();
    if (!nomeV) return fieldErr(form, "nome", "Dê um nome para o investimento."), false;
    const r = String(fd.get("rentab") || "").trim();
    const rent = r ? parseMoney(r) : null;
    if (Number.isNaN(rent)) return fieldErr(form, "rentab", "Use um número, por exemplo 11,5."), false;
    const row = {
      nome: nomeV, classe: fd.get("classe"), instituicao: String(fd.get("instituicao") || "").trim(),
      valor: readMoney(fd, form, "valor", { required: true }), aplicado: readMoney(fd, form, "aplicado"), rentab_12m: rent,
      vencimento: fd.get("vencimento") || null, liquidez: String(fd.get("liquidez") || "").trim(), atualizado_em: new Date().toISOString(),
    };
    return act(() => api.salvar("investimentos", row, v?.id), "Investimento salvo.");
  }));
}
function formItem() {
  openSheet("Adicionar banco do Meu Pluggy", `<p class="muted" style="font-size:14px">Em dashboard.pluggy.ai, abra sua aplicação, vá em Demo e copie o id do item em Connected Items. Cada banco conectado no Meu Pluggy tem um item.</p>
    ${fText("item", "Item ID", "", 'autocomplete="off" spellcheck="false" placeholder="ex.: 8a1b2c3d-..."')}${fText("apelido", "Nome para lembrar", "", 'maxlength="40" placeholder="Ex.: Inter"')}`,
    `<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary">Adicionar</button>`,
    guard(async (fd, _a, form) => {
      const item = String(fd.get("item") || "").trim();
      if (item.length < 8) return fieldErr(form, "item", "Cole o Item ID completo."), false;
      return act(() => api.addItem(item, String(fd.get("apelido") || "").trim()), "Banco adicionado. Toque em Sincronizar.");
    }));
}

/* ------------------------------------------------------------------ Pluggy Connect */
async function sincronizarAgora() {
  S.syncing = true;
  render();
  try {
    const r = await api.sincronizarBancos();
    const mes = mesNome(curYM()).toLowerCase();
    const bancos = r.bancosAtualizadosEm ? ` O Meu Pluggy atualizou os bancos em ${horaBR(r.bancosAtualizadosEm)}.` : "";
    toast(`Sincronizado: ${r.gastosMes ?? 0} gastos em ${mes}, ${r.contas} contas, ${r.cartoes} cartões.${bancos}${(r.falhas || []).length ? ` ${r.falhas.length} aviso(s).` : ""}`);
  } catch (err) {
    toast(erroMsg(err), true);
  }
  S.syncing = false;
  await reload();
}
async function conectarBanco() {
  try {
    toast("Abrindo a conexão com o banco…");
    const [mod, token] = await Promise.all([import("pluggy-connect-sdk"), api.connectToken()]);
    const PluggyConnect = mod.PluggyConnect || mod.default;
    const pc = new PluggyConnect({
      connectToken: token,
      includeSandbox: false,
      onSuccess: async (dados) => {
        const item = dados?.item || dados;
        if (!item?.id) return;
        try {
          if (!D().itens.some((i) => i.item_id === item.id)) await api.addItem(item.id, item.connector?.name || "Banco");
          toast("Banco conectado. Buscando os dados…");
          await sincronizarAgora();
        } catch (err) {
          toast(erroMsg(err), true);
        }
      },
      onError: (err) => toast(`A conexão não foi concluída: ${err?.message || "tente de novo"}`, true),
    });
    await pc.init();
  } catch (err) {
    toast(erroMsg(err), true);
  }
}

document.addEventListener("toggle", (e) => {
  if (e.target?.matches?.("details[data-avancado]")) S.avancadoBancos = e.target.open;
}, true);

/* ------------------------------------------------------------------ ações */
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const a = t.dataset.act;
  const id = t.dataset.id;
  switch (a) {
    case "mes-ant": S.month = addYM(S.month, -1); return render();
    case "mes-prox": S.month = addYM(S.month, 1); return render();
    case "mes-hoje": S.month = curYM(); return render();
    case "filtro": S.filtro = t.dataset.v; return render();
    case "avisos": e.stopPropagation(); return abrirAvisos();
    case "avisos-lidos": return lerAvisos(null);
    case "aviso": {
      const a = (D().avisos || []).find((x) => x.id === id);
      abrirAvisos(false);
      if (!a) return;
      if (!a.lido_em) lerAvisos([id]);
      if (a.dados?.mes && /^\d{4}-\d{2}$/.test(a.dados.mes)) S.month = a.dados.mes;
      const rota = ROTA_AVISO[a.tabela] || "inicio";
      if (location.hash !== `#${rota}`) location.hash = rota;
      else render();
      return;
    }
    case "lancar": return formConta({ escopo: { minhas: "pessoal", casa: "casa" }[S.route] || null });
    case "nova-conta": return formConta({ escopo: t.dataset.escopo });
    case "assin-conta": {
      const a = (D().gastos.find((x) => x.mes === S.month)?.assinaturas || [])[Number(t.dataset.i)];
      if (!a) return;
      const nomeLimpo = String(a.descricao || "").replace(/\s+(BRA|BR|SAO PAULO|BELO HORIZON\w*)\b.*$/i, "").trim();
      return formConta({ escopo: "pessoal", pre: { nome: nomeLimpo.slice(0, 80), valor: a.valor, dia: a.dia, categoria: "assinaturas" } });
    }
    case "edit-conta": return formConta({ id });
    case "novo-cartao": S.origemCartao = null; return formCartao({ escopo: t.dataset.escopo });
    case "edit-cartao": return formCartao({ id });
    case "fatura": return formFatura(id);
    case "renda": return formRenda(t.dataset.vaga);
    case "apelido": return formApelido(t.dataset.vaga);
    case "diadia": return formDiaDia();
    case "nova-meta": return formMeta();
    case "edit-meta": return formMeta(id);
    case "aporte": return formAporte(id);
    case "novo-inv": return formInv();
    case "edit-inv": return formInv(id);
    case "add-item": return formItem();
    case "conectar-banco": return conectarBanco();
    case "guia-pluggy": return abrirGuia();
    case "rm-item": return act(() => api.removeItem(id), "Banco removido.");
    case "ask-del": { const c = $("#confirmDel"); if (c) { c.hidden = false; c.scrollIntoView({ block: "nearest" }); } return; }
    case "cancel-del": $("#confirmDel").hidden = true; return;
    case "ask-sair-casa": { const c = $("#confirmSairCasa"); c.hidden = false; c.scrollIntoView({ block: "nearest" }); return; }
    case "cancel-sair-casa": $("#confirmSairCasa").hidden = true; return;
    case "sair-casa": t.disabled = true; return act(() => api.sairDaCasa(), "Você saiu da casa.");
    case "acerto-feito": {
      const r = acerto(D(), S.month);
      return act(() => api.marcarAcerto({ casa_id: D().casa.id, mes: S.month, valor: r.valor, de: r.de, para: r.para }), "Acerto marcado como feito.");
    }
    case "acerto-desfazer": return act(() => api.desfazerAcerto(D().casa.id, S.month), "Acerto desfeito.");
    case "copiar":
      try { await navigator.clipboard.writeText(t.dataset.v); toast("Código copiado."); } catch { toast(`Código: ${t.dataset.v}`); }
      return;
    case "novo-codigo": return act(() => api.novoCodigo(), "Código novo gerado. O antigo deixou de valer.");
    case "sync": return sincronizarAgora();
    case "usar-cartao": {
      const c = (D().importacao?.cartoes || []).find((x) => x.id === id);
      if (!c) return;
      S.origemCartao = { tipo: "pluggy", accountId: c.id };
      formCartao({ escopo: "pessoal" });
      const f = sheet().querySelector("form");
      f.banco.value = c.conexao && !/meu ?pluggy/i.test(c.conexao) ? c.conexao : c.nome;
      f.apelido.value = c.nome;
      if (c.final) f.final.value = c.final;
      if (c.vencimento) f.vencimento.value = Number(c.vencimento.slice(8, 10));
      if (c.fechamento) f.fechamento.value = Number(c.fechamento.slice(8, 10));
      if (c.limite != null) f.limite.value = num(c.limite);
      if (c.fatura != null) f.fatura.value = num(c.fatura);
      return;
    }
    case "sair": return api.auth.signOut();
    case "tema": aplicarTema(t.dataset.v); return render();
    case "tema-troca": aplicarTema(temaAtual() === "escuro" ? "claro" : "escuro"); renderShell(); return render();
    case "dia-sel": S.diaSel = S.diaSel === Number(t.dataset.v) ? null : Number(t.dataset.v); return render();
    case "mor-base": S.moradiaBase = t.dataset.v; return render();
    case "gasto-visao": S.gastosVisao = t.dataset.v; S.gastoAberto = null; S.gastoTodas = false; return render();
    case "gasto-abre": S.gastoAberto = S.gastoAberto === t.dataset.v ? null : t.dataset.v; S.gastoTodas = false; return render();
    case "gasto-todas": S.gastoTodas = !S.gastoTodas; return render();
    case "cc-sel": {
      const n = todosCartoes().proprios.length;
      S.ccSel = ((Number(t.dataset.v) % n) + n) % n;
      return render();
    }
    case "cc-step": {
      const n = todosCartoes().proprios.length;
      if (!n) return;
      S.ccSel = (((S.ccSel || 0) + Number(t.dataset.v)) % n + n) % n;
      return render();
    }
    case "rng": S.range[t.dataset.k] = t.dataset.v; return render();
  }
});
document.addEventListener("change", async (e) => {
  const t = e.target;
  if (!t.matches?.("[data-pago]")) return;
  t.disabled = true;
  const ok = await act(() => api.marcarPago(t.dataset.tabela, t.dataset.id, S.month, t.checked));
  if (!ok) t.checked = !t.checked;
  t.disabled = false;
});
document.addEventListener("click", (e) => {
  const pop = $("#avisosPop");
  if (pop && !pop.hidden && !e.target.closest?.(".sino-wrap, .toast")) abrirAvisos(false);
});
document.addEventListener("keydown", (e) => {
  const pop = $("#avisosPop");
  if (e.key === "Escape" && pop && !pop.hidden) {
    abrirAvisos(false);
    $("#sinoBtn")?.focus();
    return;
  }
  if (e.target.closest?.("input, textarea, select, dialog")) return;
  if (!$("#main")) return;
  if (e.key === "ArrowLeft" && e.altKey) { S.month = addYM(S.month, -1); render(); }
  if (e.key === "ArrowRight" && e.altKey) { S.month = addYM(S.month, 1); render(); }
});

// No app do Windows, links externos abrem no navegador padrão.
document.addEventListener("click", (e) => {
  const a = e.target.closest?.('a[target="_blank"]');
  if (!a || !window.__TAURI_INTERNALS__) return;
  e.preventDefault();
  window.__TAURI_INTERNALS__.invoke("plugin:opener|open_url", { url: a.href }).catch(() => {});
});

if ("serviceWorker" in navigator && location.protocol === "https:" && !window.__TAURI_INTERNALS__) {
  navigator.serviceWorker.register(`${BASE}sw.js`).catch(() => {});
}

boot();
