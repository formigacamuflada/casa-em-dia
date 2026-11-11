import "./styles.css";
import { createApi } from "./api.js";
import { ic } from "./icons.js";
import {
  CATEGORIAS, CAT_CURTA, acerto, addYM, contasDoMes, curYM, daysIn, historicoMoradia,
  metaResumo, moradia, parseMoney, round2, sobra, statusConta, sum,
} from "./calc.js";

const api = window.__CASA_API__ || createApi();
const BASE = import.meta.env.BASE_URL || "./";
const img = (n) => `${BASE}img/${n}.webp`;

/* ------------------------------------------------------------------ estado */
const S = {
  session: null,
  data: null,
  month: curYM(),
  route: "inicio",
  filtro: "todas",
  syncing: false,
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
function money(n, cls = "big") {
  const neg = Number(n) < 0;
  const v = num(Math.abs(Number(n) || 0));
  return `<div class="${cls}${neg ? " neg" : ""}"><span class="cur">${neg ? "−" : ""}R$</span><span>${v}</span></div>`;
}

/* ------------------------------------------------------------------ pessoas */
const D = () => S.data;
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
function toast(msg, err = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast${err ? " err" : ""}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), err ? 6000 : 3000);
}
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
  try {
    S.data = await api.loadAll();
  } catch (e) {
    renderFatal(erroMsg(e));
    return;
  }
  if (S.data.semCasa) {
    renderOnboarding();
    return;
  }
  renderShell();
  route();
  if (unsub) unsub();
  unsub = api.subscribe(() => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(reload, 350);
  });
  refreshMercado();
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
function renderLoading() {
  document.body.innerHTML = `<div class="auth"><div class="auth-card"><div class="auth-brand">${brandMark()}<h1>Casa em Dia</h1></div><div class="skeleton" aria-label="Carregando"></div></div></div><div id="toast" hidden></div><div id="tip" class="tip" hidden></div>`;
}
function renderFatal(msg) {
  document.body.innerHTML = `<div class="auth"><div class="auth-card"><div class="auth-brand">${brandMark()}<h1>Casa em Dia</h1></div><div class="banner err">${ic("alerta")}<div class="grow">${esc(msg)}</div><button class="btn btn-sm" id="retry">Tentar de novo</button></div></div></div><div id="toast" hidden></div><div id="tip" class="tip" hidden></div>`;
  $("#retry").onclick = start;
}
const brandMark = () => `<span class="brand-mark">${ic("casa")}</span>`;

function renderAuth(modo) {
  document.body.classList.add("is-auth");
  const titulos = { entrar: "Entrar", criar: "Criar conta", esqueci: "Recuperar senha", nova: "Nova senha" };
  const textos = {
    entrar: "Use o e-mail e a senha da sua conta.",
    criar: "Cada um cria a própria conta. Depois um cria a casa e o outro entra com o código de convite.",
    esqueci: "Enviamos um link para você criar uma senha nova.",
    nova: "Digite a nova senha da sua conta.",
  };
  document.body.innerHTML = `
  <div class="auth"><div class="auth-card">
    <div class="auth-brand">${brandMark()}<h1>Casa em Dia</h1></div>
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
    <div class="auth-brand">${brandMark()}<h1>Bem-vindo ao Casa em Dia</h1></div>
    <p class="muted">Um de vocês cria a casa. O outro entra com o código de convite que aparece em Ajustes.</p>
    <div class="onb-grid">
      <form class="card" id="fCriar">
        <div class="card-head"><img class="ill" src="${img("sofa")}" alt="" width="44" height="44"><div class="grow"><h2>Criar a casa</h2><p class="sub">Você será a pessoa 1</p></div></div>
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
  ["casa", "Casa", "Casa", "casa"],
  ["minhas", "Minhas contas", "Minhas", "carteira"],
  ["cartoes", "Cartões", "Cartões", "cartao"],
  ["investimentos", "Investimentos", "Investir", "invest"],
];
function renderShell() {
  document.body.innerHTML = `
  <div class="app">
    <aside class="side" aria-label="Navegação">
      <div class="brand">${brandMark()}<span>Casa em Dia</span></div>
      <nav class="nav" aria-label="Seções">
        ${NAV.map(([r, label, , icon]) => `<a href="#${r}" data-route="${r}">${ic(icon)}<span>${label}</span></a>`).join("")}
        <div class="nav-sep"></div>
        <a href="#ajustes" data-route="ajustes">${ic("ajustes")}<span>Ajustes</span></a>
      </nav>
      <div class="side-foot" id="sideMe"></div>
    </aside>
    <div class="main-col">
      <header class="top">
        <div class="month">
          <button class="icon-btn" data-act="mes-ant" aria-label="Mês anterior">${ic("esq")}</button>
          <div class="month-label" id="monthLabel" aria-live="polite"></div>
          <button class="icon-btn" data-act="mes-prox" aria-label="Próximo mês">${ic("dir")}</button>
          <button class="btn btn-ghost btn-sm" data-act="mes-hoje" id="hojeBtn" hidden>Mês atual</button>
        </div>
        <div class="top-right">
          <a class="icon-btn only-compact" href="#ajustes" aria-label="Ajustes">${ic("ajustes")}</a>
          <button class="btn btn-primary lancar" data-act="lancar" aria-label="Lançar">${ic("mais")}<span class="btn-label">Lançar</span></button>
        </div>
      </header>
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

function route() {
  const h = location.hash.replace("#", "");
  S.route = ROUTES.includes(h) ? h : "inicio";
  render();
  $("#main")?.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", route);

function render() {
  if (!$("#main") || !D() || D().semCasa) return;
  document.querySelectorAll("[data-route]").forEach((a) =>
    a.dataset.route === S.route ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"),
  );
  $("#monthLabel").textContent = mesNome(S.month);
  $("#hojeBtn").hidden = S.month === curYM();
  const me = eu();
  $("#sideMe").innerHTML = me
    ? `<div class="me-card">${avatar(me.vaga)}<div class="who"><strong>${esc(nome(me.vaga, { voce: false }))}</strong><span>Pessoa ${me.vaga === "a" ? "1" : "2"} da casa</span></div></div>`
    : "";
  const pages = { inicio: pInicio, casa: pCasa, minhas: pMinhas, cartoes: pCartoes, investimentos: pInvest, ajustes: pAjustes };
  $("#main").innerHTML = `<div class="page">${pages[S.route]()}</div>`;
  document.title = S.route === "inicio" ? "Casa em Dia" : `${{ casa: "Casa", minhas: "Minhas contas", cartoes: "Cartões", investimentos: "Investimentos", ajustes: "Ajustes" }[S.route]} · Casa em Dia`;
}

/* ------------------------------------------------------------------ blocos */
function pageHead(titulo, sub, acoes = "") {
  return `<div class="page-head"><div><h1>${titulo}</h1>${sub ? `<p>${sub}</p>` : ""}</div>${acoes ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${acoes}</div>` : ""}</div>`;
}
function cardHead(icone, titulo, sub, escopo, extra = "") {
  return `<div class="card-head">${icone ? ill(icone) : ""}<div class="grow"><h2>${titulo}</h2>${sub ? `<p class="sub">${sub}</p>` : ""}</div>${extra}${escopo ? badge(escopo) : ""}</div>`;
}
const vazio = (icone, titulo, texto, botao = "") =>
  `<div class="empty">${icone ? `<img class="ill" src="${img(icone)}" alt="" width="72" height="72" loading="lazy">` : ""}<h3>${titulo}</h3><p>${texto}</p>${botao}</div>`;

function blocoSobra() {
  const v = minhaVaga();
  const s = sobra(D(), S.month, v);
  if (s.renda === null) {
    return `<section class="card s7 m6 t12">${cardHead("pote", "Sobra prevista", mesNome(S.month), "pessoal")}
      ${vazio("", "Informe sua renda", "Com a renda, o app mostra quanto sobra depois da sua metade da casa, das suas contas pessoais e do dia a dia.", `<button class="btn btn-primary btn-sm" data-act="renda" data-vaga="${v}">Informar renda</button>`)}</section>`;
  }
  const base = Math.max(s.renda, 1);
  const linha = (lbl, val, sinal, cls = "") =>
    `<div class="flow-row ${cls}"><span class="lbl">${lbl}</span><span class="val">${sinal}${brl(val)}</span><div class="track"><div class="fill" style="width:${Math.min(100, (Math.abs(val) / base) * 100).toFixed(1)}%"></div></div></div>`;
  const livre = s.renda > 0 ? (s.resto / s.renda) * 100 : 0;
  return `<section class="card s7 m6 t12">${cardHead("pote", "Sobra prevista", mesNome(S.month), "pessoal")}
    <div>${money(s.resto)}<p class="big-sub">${s.resto >= 0 ? `${pct(livre, 0)} da sua renda fica livre neste mês` : "As contas do mês passam da sua renda"}</p></div>
    <div class="flow">
      ${linha("Sua renda", s.renda, "")}
      ${linha("Sua metade da casa", s.casa, "− ")}
      ${linha("Suas contas pessoais", s.pessoais, "− ")}
      ${linha(`Dia a dia <button class="link-btn" data-act="diadia">ajustar</button>`, s.diaDia, "− ")}
      ${linha("Sobra", Math.max(0, s.resto), "", "total")}
    </div></section>`;
}

function blocoAcerto(span = "s5 m6 t12") {
  const a = acerto(D(), S.month);
  const feito = D().acertos.find((x) => x.mes === S.month);
  let corpo;
  if (!a.itens.length) {
    corpo = vazio("", "Nenhuma conta da casa neste mês", "Lance as contas da casa e diga quem paga cada uma. O app calcula quem faz o Pix no fim do mês.", `<button class="btn btn-primary btn-sm" data-act="nova-conta" data-escopo="casa">Nova conta da casa</button>`);
  } else {
    const msg = a.de
      ? `${a.de === minhaVaga() ? "<strong>Você</strong> faz" : `<strong>${esc(nome(a.de))}</strong> faz`} um Pix de <strong class="num">${brl(a.valor)}</strong> para ${a.para === minhaVaga() ? "você" : `<strong>${esc(nome(a.para))}</strong>`}`
      : "Cada um pagou exatamente a sua metade. Não há acerto neste mês.";
    const pa = a.total ? (a.pagou.a / a.total) * 100 : 50;
    const mudou = feito && a.de && Math.abs(Number(feito.valor) - a.valor) > 0.009;
    corpo = `
      <div class="settle">${a.de ? `${avatar(a.de)}<span class="arrow">${ic("seta")}</span>${avatar(a.para)}` : ""}<p class="msg">${msg}</p></div>
      <div class="split">
        <div class="split-bar" role="img" aria-label="${esc(nome("a", { voce: false }))} pagou ${brl(a.pagou.a)}, ${esc(nome("b", { voce: false }))} pagou ${brl(a.pagou.b)}">
          ${a.pagou.a > 0 ? `<div class="seg" style="width:${pa}%;background:var(--pa)" data-tip="${esc(nome("a"))}: ${brl(a.pagou.a)}"></div>` : ""}
          ${a.pagou.b > 0 ? `<div class="seg" style="width:${100 - pa}%;background:var(--pb)" data-tip="${esc(nome("b"))}: ${brl(a.pagou.b)}"></div>` : ""}
          <div class="mid" title="Metade"></div>
        </div>
        <div class="split-legend"><span class="k"><span class="dot a"></span>${esc(nome("a"))} pagou <span class="num">${brl(a.pagou.a)}</span></span><span class="k"><span class="dot b"></span>${esc(nome("b"))} pagou <span class="num">${brl(a.pagou.b)}</span></span></div>
      </div>
      <dl class="kv"><dt>Total da casa</dt><dd>${brl(a.total)}</dd><dt>Metade de cada um</dt><dd>${brl(a.metade)}</dd></dl>
      ${a.de ? (feito ? `<div class="banner${mudou ? " warn" : ""}">${ic(mudou ? "alerta" : "ok")}<div class="grow">${mudou ? `Acerto de ${brl(feito.valor)} feito em ${dataBR(feito.feito_em)}, mas as contas mudaram depois.` : `Acerto feito em ${dataBR(feito.feito_em)}.`}</div><button class="btn btn-sm" data-act="acerto-desfazer">Desfazer</button></div>` : `<button class="btn btn-primary" data-act="acerto-feito">Marcar acerto como feito</button>`) : ""}`;
  }
  return `<section class="card ${span}">${cardHead("canecas", "Acerto do mês", "Divisão 50/50 das contas da casa", "casa")}${corpo}</section>`;
}

function linhaConta(i, opts = {}) {
  const st = statusConta(i, S.month);
  const stTxt = { paga: "Paga", atrasada: "Atrasada", hoje: "Vence hoje", aberta: "" }[st];
  const stCls = { paga: "done", atrasada: "late", hoje: "today", aberta: "" }[st];
  const tabela = i.tipo === "cartao" ? "cartoes" : "contas";
  const quem = i.escopo === "casa" ? `<span class="chip">${avatar(i.pagador === "b" ? "b" : "a", true)}${esc(nome(i.pagador === "b" ? "b" : "a"))}</span>` : `<span class="lock-note">${ic("cadeado", "sm")}Pessoal</span>`;
  return `<div class="bill${i.pago ? " paid" : ""}">
    <label class="check"><input type="checkbox" ${i.pago ? "checked" : ""} data-pago data-tabela="${tabela}" data-id="${i.id}" aria-label="${esc(i.nome)} paga"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" style="stroke-width:2.5"/></svg></label>
    <div class="name"><strong>${esc(i.nome)}</strong><div class="meta">${opts.semDia ? "" : `<span>Dia ${String(i.dia).padStart(2, "0")}</span>`}${quem}<span>${esc(CAT_CURTA[i.categoria] || "Outros")}</span>${stTxt ? `<span class="state ${stCls}">${stTxt}</span>` : ""}</div></div>
    <span class="val">${brl(i.valorMes)}</span>
    <div class="row-actions"><button class="icon-btn" data-act="${i.tipo === "cartao" ? "edit-cartao" : "edit-conta"}" data-id="${i.id}" aria-label="Editar ${esc(i.nome)}">${ic("lapis", "sm")}</button></div>
  </div>`;
}

function listaPorDia(itens) {
  const grupos = new Map();
  for (const i of itens) {
    const d = Math.min(i.dia, daysIn(S.month));
    if (!grupos.has(d)) grupos.set(d, []);
    grupos.get(d).push(i);
  }
  return [...grupos.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([d, list]) => `<div class="day-group"><div class="day-label">Dia ${String(d).padStart(2, "0")} · ${diaSemana(S.month, d)}</div>${list.map((i) => linhaConta(i, { semDia: true })).join("")}</div>`)
    .join("");
}

function blocoVencimentos() {
  const casa = contasDoMes(D(), S.month, "casa");
  const minhas = contasDoMes(D(), S.month, "pessoal");
  let itens = S.filtro === "casa" ? casa : S.filtro === "minhas" ? minhas : [...casa, ...minhas];
  itens = itens.slice().sort((a, b) => Number(a.pago) - Number(b.pago) || a.dia - b.dia);
  const total = sum(itens.map((i) => i.valorMes));
  const pagas = itens.filter((i) => i.pago).length;
  const visiveis = itens.slice(0, 9);
  const seg = `<div class="seg-ctl" role="group" aria-label="Filtrar contas">${[["todas", "Todas"], ["casa", "Da casa"], ["minhas", "Minhas"]]
    .map(([k, l]) => `<button data-act="filtro" data-v="${k}" aria-pressed="${S.filtro === k}">${l}</button>`)
    .join("")}</div>`;
  return `<section class="card s7 m12 t12">
    ${cardHead("envelope", "Contas do mês", itens.length ? `<span class="num">${brl(total)}</span> · ${pagas} de ${itens.length} pagas` : "", "")}
    <div>${seg}</div>
    ${itens.length ? `<div class="bills">${listaPorDia(visiveis)}</div>${itens.length > visiveis.length ? `<a class="link-btn" href="#${S.filtro === "minhas" ? "minhas" : "casa"}">Ver as ${itens.length} contas</a>` : ""}` : vazio("", "Nada para pagar neste filtro", "As contas da casa aparecem para os dois. As pessoais, só para quem lançou.", `<button class="btn btn-primary btn-sm" data-act="lancar">Lançar conta</button>`)}
  </section>`;
}

const COR_CARTAO = {
  petroleo: ["#1e5f67", false],
  grafite: ["#2b3236", false],
  ambar: ["#d39b45", true],
  vinho: ["#7a2e3a", false],
  noite: ["#23345c", false],
  oliva: ["#56643a", false],
};
const corDe = (c) => COR_CARTAO[c] || COR_CARTAO.petroleo;

function todosCartoes() {
  const proprios = D().cartoes.map((c) => ({ ...c, origemTipo: "manual" }));
  const usados = new Set(D().cartoes.map((c) => c.origem?.accountId).filter(Boolean));
  const importados = (D().importacao?.cartoes || [])
    .filter((c) => !usados.has(c.id))
    .map((c) => ({ importado: true, ...c }));
  return { proprios, importados };
}

function blocoCartoesResumo() {
  const { proprios, importados } = todosCartoes();
  const linhas = proprios
    .map((c) => {
      const f = c.faturas?.[S.month];
      const usado = c.limite ? Math.min(100, ((Number(f) || 0) / c.limite) * 100) : null;
      return `<div class="cc-mini"><span class="cc-swatch" style="background:${corDe(c.cor)[0]}"></span>
        <div style="min-width:0"><strong style="font-weight:550">${esc(c.apelido || c.banco)}</strong><div class="meta faint" style="font-size:12.5px">${c.escopo === "casa" ? "Da casa" : "Pessoal"} · vence dia ${c.vencimento}</div>
        ${usado !== null ? `<div class="meter" style="height:6px;margin-top:6px" data-tip="${pct(usado, 0)} do limite"><div class="fill" style="width:${usado}%"></div></div>` : ""}</div>
        <span class="num" style="font-weight:600">${f != null ? brl(f) : `<button class="link-btn" data-act="fatura" data-id="${c.id}">Informar fatura</button>`}</span></div>`;
    })
    .join("");
  const imp = importados
    .map((c) => `<div class="cc-mini"><span class="cc-swatch" style="background:var(--border-strong)"></span><div style="min-width:0"><strong style="font-weight:550">${esc(c.nome)}</strong><div class="faint" style="font-size:12.5px">Open Finance · vence ${dataBR(c.vencimento)}</div></div><span class="num" style="font-weight:600">${brl(c.fatura)}</span></div>`)
    .join("");
  return `<section class="card s5 m12 t12">${cardHead("cartoes", "Cartões", `Faturas de ${mesNome(S.month).toLowerCase()}`, "")}
    ${linhas || imp ? `<div class="cc-list">${linhas}${imp}</div><a class="link-btn" href="#cartoes">Ver cartões</a>` : vazio("", "Nenhum cartão ainda", "Cadastre os cartões de vocês. Os da casa aparecem para os dois; os pessoais, só para o dono.", `<button class="btn btn-primary btn-sm" data-act="novo-cartao">Novo cartão</button>`)}</section>`;
}

function blocoMoradia(span = "s4 m6 t6") {
  const mo = moradia(D(), S.month);
  let corpo;
  if (!mo.itens.length) {
    corpo = vazio("", "Sem custos de moradia", "Lance aluguel, condomínio, luz, água e internet como contas da casa para ver o peso da moradia na renda do casal.");
  } else {
    const p = mo.pct;
    corpo = `${money(mo.total)}
      ${p !== null ? `<div><div class="meter"><div class="fill${p > 30 ? " over" : ""}" style="width:${Math.min(100, (p / 60) * 100)}%"></div><div class="ref" style="left:50%"></div></div>
        <div class="meter-legend"><span>0%</span><span>30%</span><span>60%</span></div>
        <p class="big-sub">${pct(p)} da renda do casal. Uma referência comum é até 30%.</p></div>` : `<p class="big-sub">Informe a renda dos dois em Ajustes para ver o percentual.</p>`}
      <dl class="kv">${mo.itens.map((i) => `<dt>${esc(i.nome)}</dt><dd>${brl(i.valorMes)}</dd>`).join("")}</dl>`;
  }
  return `<section class="card ${span}">${cardHead("sofa", "Moradia", "Quanto custa morar", "casa")}${corpo}</section>`;
}

function blocoMetas(span = "s4 m6 t6", completo = false) {
  const metas = D().metas;
  const corpo = metas.length
    ? metas
        .map((m) => {
          const r = metaResumo(m, D().aportes);
          return `<div style="display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><strong style="font-weight:600">${esc(m.nome)}</strong><span class="num faint" style="font-size:13px">${r.pct !== null ? pct(r.pct, 0) : ""}</span></div>
          <div class="meter"><div class="fill" style="width:${r.pct ?? 0}%"></div></div>
          <div class="faint" style="font-size:13px">${brl(r.guardado)}${r.alvo ? ` de ${brl(r.alvo)}` : ""}${m.prazo ? ` · até ${mesCurtoAno(m.prazo)}` : ""}</div>
          ${r.alvo === null ? `<p style="font-size:13.5px">Defina o valor da meta para ver quanto guardar por mês. <button class="link-btn" data-act="edit-meta" data-id="${m.id}">Definir valor</button></p>` : r.porMes ? `<p style="font-size:13.5px">Faltam <span class="num">${brl(r.falta)}</span>: guardar <strong class="num">${brl(r.porMes)}</strong> por mês.</p>` : ""}
          ${completo ? `<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sm" data-act="aporte" data-id="${m.id}">Registrar aporte</button><button class="btn btn-ghost btn-sm" data-act="edit-meta" data-id="${m.id}">Editar</button></div>` : ""}
        </div>`;
        })
        .join('<div style="height:1px;background:var(--border)"></div>')
    : vazio("", "Nenhuma meta do casal", "Crie metas como a entrada do apartamento ou uma reserva de emergência e registrem os aportes.");
  return `<section class="card ${span}">${cardHead("alvo", "Metas do casal", "", "casa")}${corpo}<div><button class="btn btn-sm" data-act="nova-meta">${ic("mais", "sm")}Nova meta</button></div></section>`;
}

/* ---- gráficos ---- */
function lineChart(serie, { fmt = (v) => num(v), unidade = "", h = 160 } = {}) {
  if (!serie || serie.length < 2) return `<p class="faint">Sem histórico ainda.</p>`;
  const W = 560;
  const H = h;
  const padL = 40;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const vals = serie.map((p) => p[1]);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const span = hi - lo || 1;
  lo -= span * 0.12;
  hi += span * 0.12;
  const x = (i) => padL + (i * (W - padL - padR)) / (serie.length - 1);
  const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const ticks = [lo + (hi - lo) * 0.15, lo + (hi - lo) * 0.5, lo + (hi - lo) * 0.85];
  const pts = serie.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`);
  const step = Math.ceil(serie.length / 6);
  const id = `c${Math.random().toString(36).slice(2, 8)}`;
  return `<div class="chart" data-chart="${id}" data-serie='${esc(JSON.stringify(serie))}' data-unid="${esc(unidade)}">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de linha, ${serie.length} meses">
      ${ticks.map((t) => `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}"/><text class="axis-txt" x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t)}</text>`).join("")}
      ${serie.map((p, i) => (i % step === 0 || i === serie.length - 1 ? `<text class="axis-txt" x="${x(i)}" y="${H - 4}" text-anchor="middle">${mesCurtoAno(p[0])}</text>` : "")).join("")}
      <path class="area" d="M${pts[0]} L${pts.join(" L")} L${x(serie.length - 1)},${H - padB} L${padL},${H - padB}Z"/>
      <polyline class="line" points="${pts.join(" ")}"/>
      <circle class="end" cx="${x(serie.length - 1)}" cy="${y(vals[vals.length - 1])}" r="4.5"/>
      <line class="cross" x1="0" x2="0" y1="${padT}" y2="${H - padB}" visibility="hidden"/>
      <circle class="end hov" r="4" visibility="hidden"/>
      <rect x="${padL}" y="0" width="${W - padL - padR}" height="${H}" fill="transparent" data-hit="1"/>
    </svg>
    <details style="margin-top:6px"><summary class="faint" style="font-size:12.5px;cursor:pointer">Ver dados em tabela</summary>
      <div class="table-wrap"><table class="t"><thead><tr><th>Mês</th><th class="r">Valor</th></tr></thead><tbody>${serie
        .slice()
        .reverse()
        .map((p) => `<tr><td>${mesCurtoAno(p[0])}</td><td class="r">${fmt(p[1])}${unidade}</td></tr>`)
        .join("")}</tbody></table></div></details>
  </div>`;
}
document.addEventListener("pointermove", (e) => {
  const hit = e.target.closest?.("[data-hit]");
  document.querySelectorAll(".chart .cross[visibility=visible]").forEach((l) => {
    if (!hit || !l.closest(".chart").contains(hit)) {
      l.setAttribute("visibility", "hidden");
      l.parentNode.querySelector(".hov").setAttribute("visibility", "hidden");
    }
  });
  if (!hit) return;
  const box = hit.closest(".chart");
  const svg = box.querySelector("svg");
  const serie = JSON.parse(box.dataset.serie);
  const vb = svg.viewBox.baseVal;
  const r = svg.getBoundingClientRect();
  const px = ((e.clientX - r.left) / r.width) * vb.width;
  const padL = 40;
  const padR = 12;
  const i = Math.max(0, Math.min(serie.length - 1, Math.round(((px - padL) / (vb.width - padL - padR)) * (serie.length - 1))));
  const xs = padL + (i * (vb.width - padL - padR)) / (serie.length - 1);
  const poly = box.querySelector("polyline").getAttribute("points").split(" ")[i].split(",");
  const cross = box.querySelector(".cross");
  cross.setAttribute("x1", xs);
  cross.setAttribute("x2", xs);
  cross.setAttribute("visibility", "visible");
  const hov = box.querySelector(".hov");
  hov.setAttribute("cx", poly[0]);
  hov.setAttribute("cy", poly[1]);
  hov.setAttribute("visibility", "visible");
  const t = tip();
  t.textContent = `${mesCurtoAno(serie[i][0])}: ${num(serie[i][1])}${box.dataset.unid}`;
  t.hidden = false;
  t.style.left = `${Math.min(window.innerWidth - 140, e.clientX + 12)}px`;
  t.style.top = `${e.clientY - 40}px`;
});

function spark(serie) {
  if (!serie || serie.length < 2) return "";
  const s = serie.slice(-12);
  const vals = s.map((p) => p[1]);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const W = 64;
  const H = 26;
  const x = (i) => 2 + (i * (W - 6)) / (s.length - 1);
  const y = (v) => 3 + (1 - (v - lo) / (hi - lo || 1)) * (H - 6);
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" style="overflow:visible"><polyline points="${s.map((p, i) => `${x(i)},${y(p[1])}`).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(s.length - 1)}" cy="${y(vals[vals.length - 1])}" r="3" fill="var(--accent)"/></svg>`;
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
      ${st("cdi", "CDI", (v) => pct(v, 2))}
      ${st("dolar", "Dólar PTAX", (v) => `R$ ${num(v, 2)}`, m.series?.dolar)}
    </div>
    <p class="source">Atualizado em ${horaBR(D().mercado.atualizado_em)}</p></section>`;
}

/* ------------------------------------------------------------------ páginas */
function pInicio() {
  const sub = `Resumo de ${mesNome(S.month).toLowerCase()} para você e ${esc(nome(outra(), { voce: false }))}`;
  return `${pageHead("Visão geral", sub)}${bannerConvite()}
  <div class="grid">${blocoSobra()}${blocoAcerto()}${blocoVencimentos()}${blocoCartoesResumo()}${blocoMoradia()}${blocoMetas()}${blocoMercadoResumo()}</div>`;
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
    : vazio("envelope", "Nenhuma conta da casa neste mês", "Aluguel, condomínio, luz, internet, mercado: tudo o que é dos dois entra aqui, com quem paga cada conta.", `<button class="btn btn-primary btn-sm" data-act="nova-conta" data-escopo="casa">Nova conta da casa</button>`);
  const hist = historicoMoradia(D(), S.month);
  const maxH = Math.max(...hist.map((h) => h[1]), 1);
  return `${pageHead("Casa", "Tudo nesta página é visto pelos dois.", `<button class="btn btn-primary" data-act="nova-conta" data-escopo="casa">${ic("mais", "sm")}Nova conta da casa</button>`)}
  <div class="grid">
    <section class="card s7 m12 t12">${cardHead("envelope", "Contas da casa", mesNome(S.month), "casa")}${lista}</section>
    ${blocoAcerto("s5 m12 t12")}
    ${blocoRenda()}
    ${blocoMoradia("s4 m6 t6")}
    <section class="card s4 m6 t6">${cardHead("", "Moradia nos últimos 12 meses", "", "")}
      ${hist.some((h) => h[1] > 0) ? `<div><div class="hist">${hist.map((h) => `<div class="b${h[0] === S.month ? " cur" : ""}" style="height:${Math.max(2, (h[1] / maxH) * 100)}%" data-tip="${mesCurtoAno(h[0])}: ${brl(h[1])}"></div>`).join("")}</div><div class="hist-axis">${hist.map((h, i) => `<span>${i % 3 === 0 || i === hist.length - 1 ? mesNome(h[0], true) : ""}</span>`).join("")}</div></div>` : `<p class="faint">O histórico se forma conforme os meses passam.</p>`}
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

function pMinhas() {
  const itens = contasDoMes(D(), S.month, "pessoal");
  const total = sum(itens.map((i) => i.valorMes));
  const g = D().gastos.find((x) => x.mes === S.month);
  const imp = D().importacao;
  const maxCat = g ? Math.max(...(g.por_categoria || []).map((c) => c.total), 1) : 1;
  const saldoTotal = imp ? sum((imp.contas || []).map((c) => c.saldo)) : 0;
  return `${pageHead("Minhas contas", "Só você vê esta página.", `<button class="btn btn-primary" data-act="nova-conta" data-escopo="pessoal">${ic("mais", "sm")}Nova conta pessoal</button>`)}
  <div class="grid">
    <section class="card s7 m12 t12">${cardHead("cadeado", "Contas pessoais", mesNome(S.month), "pessoal")}
      ${itens.length ? `<div class="bills">${itens.map((i) => linhaConta(i)).join("")}</div><div class="list-foot"><span class="muted">${itens.filter((i) => i.pago).length} de ${itens.length} pagas</span><strong class="num">${brl(total)}</strong></div>` : vazio("", "Nenhuma conta pessoal neste mês", "Academia, curso, ajuda à família: o que é só seu fica aqui e não aparece para a outra pessoa.", `<button class="btn btn-primary btn-sm" data-act="nova-conta" data-escopo="pessoal">Nova conta pessoal</button>`)}
    </section>
    <section class="card s5 m12 t12">${cardHead("pote", "Dia a dia", "Quanto você reserva por mês para gastos soltos", "pessoal")}
      ${money(D().prefs?.dia_a_dia || 0)}<div><button class="btn btn-sm" data-act="diadia">Ajustar valor</button></div>
    </section>
    <section class="card s7 m12 t12">${cardHead("envelope", "Gastos do mês nos bancos", imp ? `Open Finance · atualizado em ${horaBR(imp.atualizado_em)}` : "Open Finance", "pessoal", `<button class="btn btn-sm" data-act="sync" ${S.syncing ? "disabled" : ""}>${ic("atualizar", "sm")}${S.syncing ? "Sincronizando…" : "Sincronizar"}</button>`)}
      ${g ? `<dl class="kv"><dt>Saídas</dt><dd>${brl(g.saidas)}</dd><dt>Entradas</dt><dd>${brl(g.entradas)}</dd></dl>
        <div class="hbars">${(g.por_categoria || []).slice(0, 8).map((c) => `<div class="hbar"><span>${esc(c.categoria)}</span><span class="val">${brl(c.total)}</span><div class="track"><div class="fill" style="width:${((c.total / maxCat) * 100).toFixed(1)}%" data-tip="${esc(c.categoria)}: ${brl(c.total)}"></div></div></div>`).join("")}</div>
        ${(g.maiores || []).length ? `<div class="table-wrap"><table class="t"><thead><tr><th>Maiores gastos</th><th>Data</th><th class="r">Valor</th></tr></thead><tbody>${g.maiores.slice(0, 6).map((t) => `<tr><td>${esc(t.descricao)}</td><td class="faint">${dataBR(t.data)}</td><td class="r">${brl(Math.abs(t.valor))}</td></tr>`).join("")}</tbody></table></div>` : ""}
        ${(g.assinaturas || []).length ? `<div><p style="font-weight:600;font-size:14px;margin-bottom:6px">Prováveis assinaturas</p><dl class="kv">${g.assinaturas.slice(0, 6).map((a) => `<dt>${esc(a.descricao)}</dt><dd>${brl(a.valor)}</dd>`).join("")}</dl></div>` : ""}
        <p class="source">Pagamentos de fatura, transferências entre contas próprias, aplicações e resgates ficam de fora.</p>`
        : D().itens.length ? vazio("", "Ainda sem gastos importados deste mês", "Toque em Sincronizar para buscar as transações no Meu Pluggy.") : vazio("", "Conecte seus bancos", "Autorize pelo app do banco (Open Finance). O app busca extratos, cartões e investimentos, e só você vê.", `<button class="btn btn-primary btn-sm" data-act="conectar-banco">Conectar banco</button>`)}
    </section>
    <section class="card s5 m12 t12">${cardHead("pote", "Saldos nas contas", imp ? `Atualizado em ${horaBR(imp.atualizado_em)}` : "", "pessoal")}
      ${imp && (imp.contas || []).length ? `${money(saldoTotal)}<dl class="kv">${imp.contas.map((c) => `<dt>${esc(c.nome)}${c.final ? ` ··${esc(c.final)}` : ""}</dt><dd>${brl(c.saldo)}</dd>`).join("")}</dl>` : `<p class="faint">Os saldos aparecem depois da primeira sincronização com o Meu Pluggy.</p>`}
    </section>
  </div>`;
}

function faceCartao(c) {
  const [cor, claro] = corDe(c.cor);
  return `<div class="cc-face${claro ? " light-ink" : ""}" style="background:${cor}">
    <div class="top-line"><div><div class="bank">${esc(c.banco)}</div>${c.apelido ? `<div class="nick">${esc(c.apelido)}</div>` : ""}</div><span class="tag">${c.escopo === "casa" ? "Da casa" : "Pessoal"}</span></div>
    <span class="chip-shape" aria-hidden="true"></span>
    <div class="bottom-line"><span>${c.final ? `•••• ${esc(c.final)}` : ""}</span><span>${esc(c.bandeira || "")}</span></div></div>`;
}

function pCartoes() {
  const { proprios, importados } = todosCartoes();
  const bloco = (c) => {
    const f = c.faturas?.[S.month];
    const usado = c.limite && f != null ? Math.min(100, (Number(f) / c.limite) * 100) : null;
    const pago = Boolean(c.pagos?.[S.month]);
    return `<section class="card">${faceCartao(c)}
      <dl class="kv"><dt>Fatura de ${mesNome(S.month, true)}</dt><dd>${f != null ? brl(f) : "—"} <button class="link-btn" data-act="fatura" data-id="${c.id}">${f != null ? "editar" : "informar"}</button></dd>
      <dt>Vencimento</dt><dd>dia ${c.vencimento}</dd>${c.fechamento ? `<dt>Fechamento</dt><dd>dia ${c.fechamento}</dd>` : ""}
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
      ${todos.length ? `${money(total)}
        <div class="hbars">${classes.map(([c, v]) => `<div class="hbar"><span>${esc(c)}</span><span class="val">${brl(v)} · ${pct((v / (total || 1)) * 100, 0)}</span><div class="track"><div class="fill" style="width:${((v / (classes[0][1] || 1)) * 100).toFixed(1)}%" data-tip="${esc(c)}: ${brl(v)}"></div></div></div>`).join("")}</div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Investimento</th><th>Classe</th><th class="r">Valor</th><th class="r">12 meses</th><th>Vence</th><th></th></tr></thead><tbody>
        ${todos.map((v) => `<tr><td>${esc(v.nome)}<div class="faint" style="font-size:12px">${esc(v.instituicao || "")}${v.origem === "openfinance" ? " · Open Finance" : ""}</div></td><td>${esc(v.classe || "")}</td><td class="r">${brl(v.valor)}</td><td class="r">${v.rentab_12m != null ? pct(v.rentab_12m, 2) : "—"}</td><td>${v.vencimento ? dataBR(v.vencimento) : "—"}</td><td class="r">${v.origem === "manual" ? `<button class="icon-btn" data-act="edit-inv" data-id="${v.id}" aria-label="Editar ${esc(v.nome)}">${ic("lapis", "sm")}</button>` : ""}</td></tr>`).join("")}
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
      <div class="s6 t12"><p style="font-weight:600;font-size:14px;margin-bottom:8px">Selic efetiva (% a.a., média do mês)</p>${lineChart(m.series?.selic, { unidade: "%" })}</div>
      <div class="s6 t12"><p style="font-weight:600;font-size:14px;margin-bottom:8px">IPCA acumulado em 12 meses (%)</p>${lineChart(m.series?.ipca12m, { unidade: "%" })}</div>
      <div class="s6 t12"><p style="font-weight:600;font-size:14px;margin-bottom:8px">Dólar (R$, média do mês)</p>${lineChart(m.series?.dolar, { fmt: (v) => num(v, 2) })}</div>
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
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary btn-sm" data-act="conectar-banco">${ic("mais", "sm")}Conectar banco</button><button class="btn btn-ghost btn-sm" data-act="add-item">Usar Item ID</button>${D().itens.length ? `<button class="btn btn-sm" data-act="sync" ${S.syncing ? "disabled" : ""}>${ic("atualizar", "sm")}${S.syncing ? "Sincronizando…" : "Sincronizar agora"}</button>` : ""}</div>
      ${D().importacao ? `<p class="source">Última sincronização: ${horaBR(D().importacao.atualizado_em)}${(D().importacao.falhas || []).length ? ` · ${D().importacao.falhas.length} aviso(s)` : ""}</p>` : ""}
    </section>
    ${ios ? `<section class="card s6 t12">${cardHead("", "Instalar no iPhone", "", "")}<p class="muted" style="font-size:14px">No Safari, toque em Compartilhar e depois em <strong>Adicionar à Tela de Início</strong>. O app abre em tela cheia, com ícone próprio.</p></section>` : ""}
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
  d.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => d.close()));
  if (!d.open) d.showModal();
  setTimeout(() => form.querySelector("input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select")?.focus(), 30);
}
sheetCloseOnBackdrop();
function sheetCloseOnBackdrop() {
  document.addEventListener("click", (e) => {
    const d = sheet();
    if (d?.open && e.target === d) d.close();
  });
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

function formConta({ id, escopo } = {}) {
  const c = id ? D().contas.find((x) => x.id === id) : null;
  const esc0 = c?.escopo || escopo || "casa";
  const ym = S.month;
  const valorMes = c ? (c.valores?.[ym] ?? null) : null;
  const corpo = `
    ${c ? `<div>${badge(esc0)}</div>` : `<div class="field"><span class="lab">Tipo de conta</span><div class="choice">
      <label><input type="radio" name="escopo" value="casa" ${esc0 === "casa" ? "checked" : ""}><span>Da casa<small>Os dois veem</small></span></label>
      <label><input type="radio" name="escopo" value="pessoal" ${esc0 === "pessoal" ? "checked" : ""}><span>Pessoal<small>Só você vê</small></span></label></div></div>`}
    ${fText("nome", "Nome", c?.nome || "", 'maxlength="80" placeholder="Ex.: Aluguel"')}
    <div class="row2">${fMoney("valor", c?.recorrente ? "Valor mensal" : "Valor", c?.valor)}${fDia("dia", "Dia do vencimento", c?.dia || "")}</div>
    ${c?.recorrente ? fMoney("valorMes", `Valor só em ${mesNome(ym).toLowerCase()}`, valorMes, "Para contas que mudam todo mês, como luz. Deixe em branco para usar o valor mensal.") : ""}
    <div class="field"><label for="f_cat">Categoria</label><select class="inp" id="f_cat" name="categoria">${CATEGORIAS.map(([k, l]) => `<option value="${k}" ${(c?.categoria || "outros") === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
    ${c ? "" : `<div class="field"><span class="lab">Repete?</span><div class="choice"><label><input type="radio" name="rec" value="1" checked><span>Todo mês</span></label><label><input type="radio" name="rec" value="0"><span>Só em ${mesNome(ym).toLowerCase()}</span></label></div></div>`}
    <div id="pagadorBox" ${esc0 === "pessoal" ? "hidden" : ""}>${fPagador(c?.pagador || minhaVaga() || "a")}</div>
    ${c ? confirmBlock(c.recorrente ? "Apagar esta conta de todos os meses, inclusive o histórico?" : "Apagar esta conta?", c.recorrente ? `<button type="submit" class="btn btn-sm" value="encerrar">Só encerrar a partir de ${mesNome(ym, true)}</button>` : "") : ""}`;
  const rodape = `${c ? `<button type="button" class="btn btn-danger left" data-act="ask-del">${ic("lixo", "sm")}Apagar</button>` : ""}<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary" value="salvar">Salvar</button>`;
  openSheet(c ? "Editar conta" : "Nova conta", corpo, rodape, guard(async (fd, acao, form) => {
    if (acao === "apagar") return act(() => api.apagar("contas", c.id), "Conta apagada.");
    if (acao === "encerrar") return act(() => api.salvar("contas", { fim: addYM(ym, -1), atualizado_em: new Date().toISOString() }, c.id), `Conta encerrada a partir de ${mesNome(ym).toLowerCase()}.`);
    const nomeV = String(fd.get("nome") || "").trim();
    if (!nomeV) return fieldErr(form, "nome", "Dê um nome para a conta."), false;
    const valor = readMoney(fd, form, "valor", { required: true });
    const dia = readDia(fd, form, "dia");
    const escopoV = c ? c.escopo : fd.get("escopo");
    const row = { nome: nomeV, valor, dia, categoria: fd.get("categoria"), pagador: escopoV === "casa" ? fd.get("pagador") || "a" : null };
    if (c) {
      const vm = c.recorrente ? readMoney(fd, form, "valorMes") : undefined;
      return act(async () => {
        await api.salvar("contas", { ...row, atualizado_em: new Date().toISOString() }, c.id);
        if (c.recorrente && vm !== (c.valores?.[ym] ?? null)) await api.valorMes("contas", c.id, ym, vm);
      }, "Conta salva.");
    }
    const rec = fd.get("rec") === "1";
    return act(() => api.salvar("contas", { ...row, escopo: escopoV, recorrente: rec, inicio: ym, mes: rec ? null : ym }), escopoV === "casa" ? "Conta da casa lançada." : "Conta pessoal lançada.");
  }));
  sheet().querySelectorAll("input[name=escopo]").forEach((r) => (r.onchange = () => ($("#pagadorBox").hidden = r.value === "pessoal" && r.checked)));
}

function formCartao({ id, escopo } = {}) {
  const c = id ? D().cartoes.find((x) => x.id === id) : null;
  const esc0 = c?.escopo || escopo || "pessoal";
  const ym = S.month;
  const corpo = `
    ${c ? `<div>${badge(esc0)}</div>` : `<div class="field"><span class="lab">De quem é o cartão</span><div class="choice">
      <label><input type="radio" name="escopo" value="casa" ${esc0 === "casa" ? "checked" : ""}><span>Da casa<small>Os dois veem, a fatura entra no acerto</small></span></label>
      <label><input type="radio" name="escopo" value="pessoal" ${esc0 === "pessoal" ? "checked" : ""}><span>Meu<small>Só você vê</small></span></label></div></div>`}
    <div class="row2">${fText("banco", "Banco", c?.banco || "", 'maxlength="40" placeholder="Ex.: Nubank"')}${fText("apelido", "Apelido (opcional)", c?.apelido || "", 'maxlength="40" placeholder="Ex.: Cartão do mercado"')}</div>
    <div class="row2">${fText("final", "Últimos 4 dígitos (opcional)", c?.final || "", 'inputmode="numeric" maxlength="4" pattern="\\d{4}"')}
      <div class="field"><label for="f_band">Bandeira</label><select class="inp" id="f_band" name="bandeira">${["", "Visa", "Mastercard", "Elo", "American Express", "Hipercard", "Outra"].map((b) => `<option value="${b}" ${(c?.bandeira || "") === b ? "selected" : ""}>${b || "Não informar"}</option>`).join("")}</select></div></div>
    <div class="field"><span class="lab">Cor</span><div class="swatches">${Object.entries(COR_CARTAO).map(([k, [cor]]) => `<label title="${k}"><input type="radio" name="cor" value="${k}" ${(c?.cor || "petroleo") === k ? "checked" : ""}><span style="background:${cor}"></span><span class="sr-only">${k}</span></label>`).join("")}</div></div>
    <div class="row2">${fDia("vencimento", "Dia do vencimento", c?.vencimento || "")}${fDia("fechamento", "Dia do fechamento (opcional)", c?.fechamento || "")}</div>
    <div class="row2">${fMoney("limite", "Limite (opcional)", c?.limite)}${fMoney("fatura", `Fatura de ${mesNome(ym, true)}`, c?.faturas?.[ym])}</div>
    <label class="toggle"><input type="checkbox" name="somar" ${c ? (c.somar_nas_contas ? "checked" : "") : "checked"}> Somar a fatura nas contas do mês</label>
    <div id="pagadorBox" ${esc0 === "pessoal" ? "hidden" : ""}>${fPagador(c?.pagador || minhaVaga() || "a")}</div>
    ${c ? confirmBlock("Apagar este cartão e o histórico de faturas?") : ""}`;
  const rodape = `${c ? `<button type="button" class="btn btn-danger left" data-act="ask-del">${ic("lixo", "sm")}Apagar</button>` : ""}<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary" value="salvar">Salvar</button>`;
  openSheet(c ? "Editar cartão" : "Novo cartão", corpo, rodape, guard(async (fd, acao, form) => {
    if (acao === "apagar") return act(() => api.apagar("cartoes", c.id), "Cartão apagado.");
    const banco = String(fd.get("banco") || "").trim();
    if (!banco) return fieldErr(form, "banco", "Informe o banco do cartão."), false;
    const final = String(fd.get("final") || "").trim();
    if (final && !/^\d{4}$/.test(final)) return fieldErr(form, "final", "Use só os 4 últimos números."), false;
    const vencimento = readDia(fd, form, "vencimento");
    const fechamento = readDia(fd, form, "fechamento", false);
    const limite = readMoney(fd, form, "limite");
    const fatura = readMoney(fd, form, "fatura");
    const escopoV = c ? c.escopo : fd.get("escopo");
    const row = {
      banco, apelido: String(fd.get("apelido") || "").trim(), final: final || null, bandeira: fd.get("bandeira") || null,
      cor: fd.get("cor") || "petroleo", vencimento, fechamento, limite, somar_nas_contas: fd.get("somar") === "on",
      pagador: escopoV === "casa" ? fd.get("pagador") || "a" : null,
    };
    if (c) {
      return act(async () => {
        await api.salvar("cartoes", { ...row, atualizado_em: new Date().toISOString() }, c.id);
        if (fatura !== (c.faturas?.[ym] ?? null)) await api.valorMes("cartoes", c.id, ym, fatura);
      }, "Cartão salvo.");
    }
    return act(() => api.salvar("cartoes", { ...row, escopo: escopoV, faturas: fatura != null ? { [ym]: fatura } : {}, origem: S.origemCartao || null }), "Cartão cadastrado.");
  }));
  sheet().querySelectorAll("input[name=escopo]").forEach((r) => (r.onchange = () => ($("#pagadorBox").hidden = r.value === "pessoal" && r.checked)));
}

function formFatura(id) {
  const c = D().cartoes.find((x) => x.id === id);
  const ym = S.month;
  openSheet(`Fatura de ${mesNome(ym).toLowerCase()}`, `<p class="muted">${esc(c.apelido || c.banco)}${c.final ? ` ··${esc(c.final)}` : ""}</p>${fMoney("fatura", "Valor da fatura", c.faturas?.[ym], "Deixe em branco para remover a fatura deste mês.")}`,
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
    <div class="row2">${fMoney("alvo", "Valor da meta", m?.alvo)}<div class="field"><label for="f_prazo">Prazo (mês)</label><input class="inp" id="f_prazo" name="prazo" type="month" value="${esc(m?.prazo || "")}"></div></div>
    ${fMoney("inicial", "Já guardado antes", m?.inicial ?? "", "Os aportes registrados depois somam a este valor.")}
    ${m ? confirmBlock("Apagar a meta e os aportes registrados?") : ""}`;
  const rodape = `${m ? `<button type="button" class="btn btn-danger left" data-act="ask-del">${ic("lixo", "sm")}Apagar</button>` : ""}<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary" value="salvar">Salvar</button>`;
  openSheet(m ? "Editar meta" : "Nova meta do casal", corpo, rodape, guard(async (fd, acao, form) => {
    if (acao === "apagar") return act(() => api.apagar("metas", m.id), "Meta apagada.");
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
  const hoje = new Date().toISOString().slice(0, 10);
  openSheet(`Aporte em ${esc(m.nome)}`, `${fMoney("valor", "Valor", "")}
    <div class="field"><label for="f_data">Data</label><input class="inp" id="f_data" name="data" type="date" value="${hoje}"></div>
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
    <div class="row2">${fText("rentab", "Rentabilidade em 12 meses, % (opcional)", v?.rentab_12m != null ? num(v.rentab_12m) : "", 'inputmode="decimal"')}<div class="field"><label for="f_venc">Vencimento (opcional)</label><input class="inp" id="f_venc" name="vencimento" type="date" value="${esc(v?.vencimento || "")}"></div></div>
    ${fText("liquidez", "Liquidez (opcional)", v?.liquidez || "", 'maxlength="30" placeholder="Ex.: diária, D+30, no vencimento"')}
    ${v ? confirmBlock("Apagar este investimento?") : ""}`;
  const rodape = `${v ? `<button type="button" class="btn btn-danger left" data-act="ask-del">${ic("lixo", "sm")}Apagar</button>` : ""}<button type="button" class="btn" data-close>Cancelar</button><button type="submit" class="btn btn-primary" value="salvar">Salvar</button>`;
  openSheet(v ? "Editar investimento" : "Novo investimento", corpo, rodape, guard(async (fd, acao, form) => {
    if (acao === "apagar") return act(() => api.apagar("investimentos", v.id), "Investimento apagado.");
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
    toast(`Sincronizado: ${r.contas} contas, ${r.cartoes} cartões, ${r.investimentos} investimentos.`);
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
    case "lancar": return formConta({ escopo: S.route === "minhas" ? "pessoal" : "casa" });
    case "nova-conta": return formConta({ escopo: t.dataset.escopo });
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
document.addEventListener("keydown", (e) => {
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
