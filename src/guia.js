// Guia "Como conectar seus bancos": janela com passos e telas ilustradas
// (desenhadas em HTML, sem dados reais) do Meu Pluggy até o login final.
import "./guia.css";
import { ic } from "./icons.js";

// "Não mostrar novamente" fica na conta (vale no celular e no PC) e também no aparelho,
// para valer já antes de a conta responder. "Ver mais tarde" não grava nada: o guia volta
// na próxima vez que o app abrir.
const GUIA_KEY = "casa-guia-pluggy-nunca";
const chave = (uid) => `${GUIA_KEY}:${uid || "anon"}`;
export function guiaDesligado(user) {
  if (user?.user_metadata?.guia_pluggy === "nunca") return true;
  try { return localStorage.getItem(chave(user?.id)) === "1"; } catch { return false; }
}
function lembrar(uid, nunca) {
  try {
    if (nunca) localStorage.setItem(chave(uid), "1");
    else localStorage.removeItem(chave(uid));
  } catch { /* sem armazenamento */ }
}

/* ------------------------------------------------ telas ilustradas */
const navegador = (url, corpo, escuro = true) =>
  `<div class="gm-win${escuro ? " gm-dark" : ""}"><div class="gm-bar"><i></i><i></i><i></i><span class="gm-url">${ic("cadeado", "sm")}${url}</span></div><div class="gm-page">${corpo}</div></div>`;
const marcaMeu = `<span class="gm-meu">meu.<b>pluggy</b></span>`;
const banco = (sigla, cor, nome, extra = "") =>
  `<div class="gm-bank"><span class="gm-blogo" style="background:${cor}">${sigla}</span><span class="gm-bname">${nome}</span>${extra}</div>`;
const widget = (corpo, demo = true) =>
  `<div class="gm-widget"><div class="gm-wtop"><span class="gm-plogo"><svg viewBox="0 0 24 14" aria-hidden="true"><circle cx="7" cy="7" r="5.2"/><circle cx="17" cy="7" r="5.2"/></svg>pluggy</span><span class="gm-wx">${ic("x", "sm")}</span></div><div class="gm-wbody">${corpo}</div>${demo ? `<div class="gm-demo">Aplicação demo. Proibido o uso comercial.</div>` : ""}</div>`;

const TELA = {
  conta: () =>
    navegador(
      "meu.pluggy.ai",
      `<div class="gm-center">${marcaMeu}<div class="gm-card"><div class="gm-h">Criar conta</div><div class="gm-in"><span>seu@email.com</span></div><div class="gm-in"><span>••••••••</span></div><div class="gm-btn gm-red gm-alvo">Criar conta</div></div><p class="gm-mini">Grátis · uso pessoal</p></div>`,
    ),
  bancos: () =>
    navegador(
      "meu.pluggy.ai/connections",
      `<div class="gm-top">${marcaMeu}<span class="gm-tabs"><em>Overview</em><em class="on">Conexões</em></span></div>
       <div class="gm-row-h"><span>Suas conexões</span><span class="gm-btn gm-red gm-sm gm-alvo">${ic("mais", "sm")}Nova conexão</span></div>
       <div class="gm-banks">${banco("in", "#ff7a00", "Inter", '<span class="gm-ok">Conectado</span>')}${banco("nu", "#820ad1", "Nubank", '<span class="gm-ok">Conectado</span>')}${banco("bb", "#f8d117;color:#1b3a8c", "Banco do Brasil", '<span class="gm-wait">Autorizando…</span>')}</div>
       <div class="gm-redir">${ic("link", "sm")}Você autoriza no app do banco (Open Finance)</div>`,
    ),
  abrir: () =>
    `<div class="gm-app"><div class="gm-appcard"><div class="gm-apph">Bancos (Meu Pluggy)</div><div class="gm-appbtns"><span class="gm-abtn gm-alvo">${ic("mais", "sm")}Conectar banco</span><span class="gm-ghost">Usar Item ID</span></div></div>
     <div class="gm-float">${widget(`<div class="gm-wh"><b>Demo</b> usa a Pluggy para se conectar às suas contas</div><div class="gm-wline"></div><div class="gm-wline short"></div><div class="gm-btn gm-red gm-full">Continuar</div>`)}</div></div>`,
  buscar: () =>
    `<div class="gm-solo">${widget(`<div class="gm-wh2">Escolha a instituição</div><div class="gm-search"><svg class="i sm" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/></svg><span>MeuPluggy</span><i class="gm-caret"></i></div>
      <div class="gm-list"><div class="gm-li gm-alvo"><span class="gm-blogo gm-mp">mp</span><span><b>MeuPluggy</b><small>Suas contas do meu.pluggy.ai</small></span>${ic("dir", "sm")}</div><div class="gm-li gm-dim"><span class="gm-blogo" style="background:#ff7a00">in</span><span>Inter<small>Não escolha o banco direto</small></span></div></div>`)}</div>`,
  login: () =>
    `<div class="gm-solo">${widget(`<div class="gm-wh2"><span class="gm-blogo gm-mp gm-xs">mp</span>Entrar no MeuPluggy</div><div class="gm-lab">E-mail do meu.pluggy.ai</div><div class="gm-in gm-light"><span>seu@email.com</span></div><div class="gm-lab">Senha</div><div class="gm-in gm-light"><span>••••••••</span></div><div class="gm-btn gm-red gm-full gm-alvo">Conectar</div>`)}</div>`,
};

const PASSOS = [
  {
    tela: "conta",
    titulo: "Crie sua conta no Meu Pluggy",
    texto: "É gratuito e fica no seu nome. Cada pessoa da casa cria a própria conta.",
    extra: `<a class="btn btn-sm" href="https://meu.pluggy.ai/" target="_blank" rel="noopener">${ic("link", "sm")}Abrir meu.pluggy.ai</a>`,
  },
  {
    tela: "bancos",
    titulo: "Conecte seus bancos lá",
    texto: "Em <b>Conexões → Nova conexão</b>, escolha o banco e autorize pelo app dele. Até 5 bancos, todos no seu CPF.",
    dica: "Se o banco der erro no computador, faça pelo celular: o app do banco abre direto.",
  },
  {
    tela: "abrir",
    titulo: "Aqui, toque em Conectar banco",
    texto: "Fica em <b>Ajustes → Bancos</b>. Abre a janela da Pluggy: toque em <b>Continuar</b>.",
    dica: "O aviso “Demo” é normal: é o modo gratuito, para uso pessoal.",
  },
  {
    tela: "buscar",
    titulo: "Procure por MeuPluggy",
    texto: "Na lista de instituições, escolha <b>MeuPluggy</b>, não o seu banco. Cada vez que você conecta, vem <b>um banco</b> do seu Meu Pluggy.",
  },
  {
    tela: "login",
    titulo: "Entre com o login do Meu Pluggy",
    texto: "Use o mesmo e-mail e senha do meu.pluggy.ai e autorize o banco. As contas, os cartões e os investimentos dele aparecem aqui, só para você.",
    dica: "Tem mais de um banco? Repita os passos 3 a 5 para cada um. O app só lê os dados, nunca movimenta dinheiro.",
  },
];

/* ------------------------------------------------ janela */
export function abrirGuiaPluggy({ user, onConectar, onNunca } = {}) {
  const uid = user?.id;
  const nuncaAntes = guiaDesligado(user);
  document.getElementById("guiaPluggy")?.remove();
  const d = document.createElement("dialog");
  d.id = "guiaPluggy";
  d.className = "guia";
  d.setAttribute("aria-labelledby", "guiaTit");
  const n = PASSOS.length;
  d.innerHTML = `<div class="guia-in">
    <div class="guia-head"><div><p class="guia-kicker">Como conectar seus bancos</p><p class="guia-cont" id="guiaCont" aria-live="polite"></p></div><button type="button" class="icon-btn" data-g="fechar" aria-label="Fechar">${ic("x")}</button></div>
    <div class="guia-trilho" id="guiaTrilho">${PASSOS.map((p, i) => `<section class="guia-passo" aria-hidden="${i ? "true" : "false"}"><div class="guia-tela" aria-hidden="true">${TELA[p.tela]()}</div><div class="guia-txt"><h2 ${i === 0 ? 'id="guiaTit"' : ""}><span class="guia-n">${i + 1}</span>${p.titulo}</h2><p>${p.texto}</p>${p.dica ? `<p class="guia-dica">${p.dica}</p>` : ""}${p.extra ? `<div class="guia-extra">${p.extra}</div>` : ""}</div></section>`).join("")}</div>
    <div class="guia-nav"><div class="guia-dots" role="tablist" aria-label="Passos">${PASSOS.map((p, i) => `<button type="button" role="tab" data-g="ir" data-i="${i}" aria-label="Passo ${i + 1}: ${p.titulo}"></button>`).join("")}</div>
      <div class="guia-btns"><button type="button" class="btn btn-sm" data-g="voltar">${ic("esq", "sm")}Voltar</button><button type="button" class="btn btn-primary btn-sm" data-g="prox"></button></div></div>
    <div class="guia-foot"><label class="toggle guia-nunca"><span class="check"><input type="checkbox" data-g="nunca" ${nuncaAntes ? "checked" : ""}><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" style="stroke-width:2.5"/></svg></span>Não mostrar novamente</label>
      <button type="button" class="btn btn-ghost btn-sm" data-g="tarde">Ver mais tarde</button></div>
  </div>`;
  document.body.append(d);
  let i = 0;
  const trilho = d.querySelector("#guiaTrilho");
  const ir = (k) => {
    i = Math.max(0, Math.min(n - 1, k));
    trilho.style.setProperty("--g", i);
    d.querySelectorAll(".guia-passo").forEach((s, j) => {
      s.setAttribute("aria-hidden", j === i ? "false" : "true");
      s.inert = j !== i;
      s.classList.toggle("on", j === i);
    });
    d.querySelectorAll(".guia-dots button").forEach((b, j) => b.setAttribute("aria-selected", String(j === i)));
    d.querySelector("#guiaCont").textContent = `Passo ${i + 1} de ${n}`;
    d.querySelector("[data-g=voltar]").disabled = i === 0;
    const prox = d.querySelector("[data-g=prox]");
    prox.innerHTML = i === n - 1 ? `${ic("mais", "sm")}Conectar banco` : `Próximo${ic("dir", "sm")}`;
  };
  const fechar = () => {
    if (!d.open || d.classList.contains("sai")) return;
    d.classList.add("sai");
    setTimeout(() => { d.close(); d.remove(); }, 180);
  };
  d.addEventListener("click", (e) => {
    if (e.target === d) return fechar();
    const b = e.target.closest("[data-g]");
    if (!b) return;
    const g = b.dataset.g;
    if (g === "fechar" || g === "tarde") fechar();
    else if (g === "ir") ir(Number(b.dataset.i));
    else if (g === "voltar") ir(i - 1);
    else if (g === "prox") {
      if (i < n - 1) return ir(i + 1);
      fechar();
      onConectar?.();
    }
  });
  d.querySelector("[data-g=nunca]").addEventListener("change", (e) => {
    lembrar(uid, e.target.checked);
    onNunca?.(e.target.checked);
  });
  d.addEventListener("cancel", (e) => { e.preventDefault(); fechar(); });
  d.addEventListener("keydown", (e) => {
    if (e.target.closest?.("input, textarea")) return;
    if (e.key === "ArrowRight") ir(i + 1);
    if (e.key === "ArrowLeft") ir(i - 1);
  });
  // Deslizar no celular.
  let x0 = null;
  trilho.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  trilho.addEventListener("touchend", (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 48) ir(i + (dx < 0 ? 1 : -1));
  });
  ir(0);
  d.showModal();
  d.querySelector("[data-g=prox]").focus();
  return d;
}
