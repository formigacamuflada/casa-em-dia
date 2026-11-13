// Tutorial de cada aba: 7 a 10 passos com destaque no próprio app (o resto da tela escurece).
// Abre sozinho na primeira visita a cada aba; "Ver mais tarde" volta na próxima abertura
// do app; "Concluir" marca a aba como vista; "Não mostrar tutoriais" desliga todos.
import "./tour.css";
import { ic } from "./icons.js";

const T = (titulo) => ({ titulo }); // alvo: card pelo título (h2)
const S = (sel) => ({ sel }); // alvo: seletor CSS

export const TOURS = {
  inicio: {
    nome: "Visão geral",
    passos: [
      { alvo: S(".top .month"), titulo: "Tudo é do mês escolhido", texto: "As setas trocam o mês e <b>Mês atual</b> volta para hoje. Saldo, contas, divisão e gastos mudam juntos com o mês." },
      { alvo: T("Saldo previsto"), titulo: "Saldo previsto: só você vê", texto: "Quanto deve sobrar do seu salário no mês: salário − sua parte da casa − suas contas pessoais − dia a dia. É uma previsão, não o saldo do banco." },
      { alvo: S(".c-saldo .sb-legend"), fallback: T("Saldo previsto"), titulo: "Dia a dia: real × orçamento", texto: "Vale o <b>maior</b> entre o seu orçamento e o gasto real dos bancos. No começo do mês o saldo reserva o orçamento inteiro; se você passar dele, passa a usar o real. Toque em <b>ajustar</b> para mudar o orçamento." },
      { alvo: T("Divisão da casa"), titulo: "Divisão da casa", texto: "Soma as contas da casa, mostra quanto cada um pagou e <b>quem faz o Pix</b> para cada um ficar com a sua parte. Em <b>ajustar</b>: igual, pela renda ou personalizada (arrastando a barrinha). Depois do Pix, <b>Marcar feito</b>." },
      { alvo: T("Moradia"), titulo: "Peso da moradia", texto: "Quanto da renda vai para aluguel, condomínio e contas de consumo da casa. Alterne entre <b>Só meu salário</b> e <b>Salário do casal</b>; a marca de 30% é a referência comum." },
      { alvo: T("Contas a pagar"), titulo: "Contas a pagar", texto: "Contas da casa e as suas pessoais do mês. Toque no <b>círculo</b> para marcar como paga. As bolinhas de dia filtram a lista." },
      { alvo: T("Contas a pagar"), titulo: "Fatura vence no mês seguinte", texto: "Fatura de cartão é das <b>compras do mês</b> e vence no mês seguinte: aparece no fim da lista com a data (ex.: 07/12) e só fica atrasada depois dela." },
      { alvo: T("Metas do casal"), titulo: "Metas do casal", texto: "Os dois veem. Mostra quanto já foi guardado e quanto falta por mês para chegar no prazo. Aportes se registram em <b>Investimentos</b>." },
      { alvo: T("Mercado"), titulo: "Mercado", texto: "Selic, IPCA, juro real e dólar, do Banco Central. Serve de contexto para metas e investimentos." },
      { alvo: S(".top .lancar"), titulo: "Lançar e avisos", texto: "<b>Lançar</b> cria uma conta: <b>Da casa</b> (os dois veem e entra na divisão) ou <b>Pessoal</b> (só você). O <b>sininho</b> ao lado mostra o que a outra pessoa mudou." },
    ],
  },
  casa: {
    nome: "Nossa casa",
    passos: [
      { alvo: T("Contas da casa"), titulo: "Tudo aqui os dois veem", texto: "Aluguel, condomínio, luz, mercado da casa… Cada conta mostra <b>quem paga</b> (a bolinha de cada um). Toque no círculo quando pagar." },
      { alvo: S("#main .page-head .btn-primary"), titulo: "Nova conta da casa", texto: "Escolha se <b>repete todo mês</b> ou é só deste mês, o dia do vencimento e quem paga." },
      { alvo: S("#main .bills .row-actions .icon-btn"), fallback: T("Contas da casa"), titulo: "Conta que muda de valor", texto: "No lápis, conta como a luz tem o campo <b>valor só deste mês</b>: muda o mês atual sem mexer nos outros. Só quem lançou pode torná-la pessoal." },
      { alvo: T("Divisão da casa"), titulo: "Quem devolve quanto", texto: "Compara o que cada um pagou com a parte de cada um (igual, pela renda ou personalizada, em <b>ajustar</b>) e diz quem faz o Pix. Fatura de cartão da casa entra pelo <b>mês das compras</b>. Depois do Pix, <b>Marcar feito</b>." },
      { alvo: T("Renda do casal"), titulo: "Renda do casal", texto: "Cada um informa e edita a <b>própria</b> renda; os dois veem. Ela alimenta o Saldo previsto e o peso da moradia." },
      { alvo: T("Moradia"), titulo: "Peso da moradia", texto: "Quanto da renda vai para aluguel, condomínio e contas de consumo. Alterne entre <b>Só meu salário</b> e <b>Salário do casal</b>; a marca de 30% é a referência comum." },
      { alvo: T("Moradia nos últimos 12 meses"), titulo: "Histórico de 12 meses", texto: "Uma barra por mês com o total de moradia. Passe o dedo ou o mouse para ver o valor de cada mês." },
    ],
  },
  minhas: {
    nome: "Minhas contas",
    passos: [
      { alvo: T("Contas pessoais"), titulo: "Contas pessoais: só você vê", texto: "Academia, assinaturas, fatura do seu cartão… Não entram na divisão da casa, mas entram no seu Saldo previsto." },
      { alvo: S("#main .bills .bill"), fallback: T("Contas pessoais"), titulo: "Pagar e editar", texto: "O <b>círculo</b> marca como paga; o <b>lápis</b> edita. Fatura de cartão mostra <b>Vence dd/mm</b> porque vence no mês seguinte." },
      { alvo: T("Dia a dia"), titulo: "Dia a dia: real × orçamento", texto: "Quanto você já gastou nos bancos contra o seu orçamento. A barra fica laranja se passar; aí o Saldo previsto usa o gasto real." },
      { alvo: S("#main .dd-fora"), fallback: T("Dia a dia"), titulo: "Fora do dia a dia", texto: "O que foi tirado do gasto real por já estar contado em outro lugar: contas que você lançou, compras de cartão com fatura nas contas e Pix para a outra pessoa da casa. Abra para conferir." },
      { alvo: T("Gastos do mês nos bancos"), titulo: "Gastos dos bancos", texto: "Todas as saídas do mês por <b>Grupos</b> ou <b>Categorias</b>. Toque num grupo para ver as transações." },
      { alvo: S("#main [data-act=sync]"), fallback: T("Gastos do mês nos bancos"), titulo: "Sincronizar", texto: "O Meu Pluggy busca os bancos <b>uma vez por dia</b>; Sincronizar traz para cá o que ele já tem. Compra de hoje pode só aparecer amanhã." },
      { alvo: S("#main .gx-extra"), fallback: T("Gastos do mês nos bancos"), titulo: "Prováveis assinaturas", texto: "Palpite do app: mesma cobrança em meses seguidos. Se é gasto fixo, <b>Virar conta</b>; se não é assinatura, pode ignorar." },
      { alvo: T("Saldos nas contas"), titulo: "Saldos nas contas", texto: "Saldo atual de cada conta conectada, só para consulta. Ele <b>não entra</b> no cálculo do Saldo previsto." },
    ],
  },
  cartoes: {
    nome: "Cartões",
    passos: [
      { alvo: S("#main .cc-grid .card"), fallback: S("#main .page-head"), titulo: "Da casa ou seus", texto: "Cartão <b>da casa</b>: os dois veem e a fatura entra na divisão. <b>Meus cartões</b>: só você vê." },
      { alvo: S("#main .cc-grid .card .kv"), fallback: S("#main .page-head"), titulo: "Fatura por competência", texto: "A fatura de um mês são as <b>compras daquele mês</b>, com vencimento no mês seguinte. Use <b>informar/editar</b> para ajustar o valor." },
      { alvo: S("#main .cc-grid .card [data-act=edit-cartao]"), fallback: S("#main .page-head"), titulo: "Somar nas contas do mês", texto: "Em <b>Editar</b>, com <b>Somar a fatura nas contas do mês</b> marcado, a fatura entra em Contas a pagar e no saldo, e as compras desse cartão saem do dia a dia — nada conta duas vezes." },
      { alvo: S("#main .cc-grid .card .toggle"), fallback: S("#main .page-head"), titulo: "Fatura paga", texto: "Marque quando pagar. Ela fica como paga em Contas a pagar e, se for da casa, aparece assim para os dois." },
      { alvo: S("#main .cc-grid .card .meter"), fallback: S("#main .cc-grid .card"), titulo: "Limite usado", texto: "Com o limite informado, a barra mostra quanto da fatura do mês já ocupa o limite e quanto sobra livre." },
      { alvo: S("#main .cc-grid .card [data-act=edit-cartao]"), fallback: S("#main .page-head"), titulo: "Imagem do seu cartão", texto: "Em <b>Editar → Escolher imagem</b> você usa a foto da frente do seu cartão, como no Apple Pay. Dá para arrastar e dar zoom no recorte." },
      { alvo: T("Encontrados no Open Finance"), fallback: S("#main .page-head .btn-primary"), titulo: "Cartões do banco", texto: "Os cartões que chegaram pelo Meu Pluggy aparecem aqui. <b>Usar no app</b> cria o cartão já preenchido; ou cadastre à mão em <b>Novo cartão</b>." },
    ],
  },
  investimentos: {
    nome: "Investimentos",
    passos: [
      { alvo: T("Minha carteira"), titulo: "Carteira: só você vê", texto: "Soma o que veio do banco (Open Finance) com o que você lançou à mão. A outra pessoa da casa não vê nada daqui." },
      { alvo: S("#main .alloc-bar"), fallback: T("Minha carteira"), titulo: "Peso de cada classe", texto: "A barra e a legenda mostram quanto está em CDB, Tesouro, ações, FII… Passe o mouse ou o dedo para ver o valor." },
      { alvo: S("#main .table-wrap"), fallback: T("Minha carteira"), titulo: "Coluna 12 meses", texto: "Vem do banco quando ele informa; senão é calculada pelo indexador (CDI, Selic, IPCA) ou desde a aplicação — o texto embaixo diz qual. Tudo antes do IR." },
      { alvo: S("#main .page-head .btn-primary"), titulo: "Novo investimento", texto: "Lance o que não vem pelo banco (cripto, corretoras não conectadas). Só os lançados à mão podem ser editados aqui; os do banco atualizam sozinhos." },
      { alvo: T("Metas do casal"), titulo: "Metas do casal", texto: "Os dois veem. Defina valor e prazo e o app diz <b>quanto guardar por mês</b>." },
      { alvo: S("#main [data-act=aporte]"), fallback: T("Metas do casal"), titulo: "Registrar aporte", texto: "Cada vez que guardar dinheiro para a meta, registre o aporte: ele soma ao guardado e recalcula quanto falta." },
      { alvo: T("Cenário econômico"), titulo: "Cenário", texto: "Selic, IPCA, dólar e projeções do Focus, direto do Banco Central. É contexto para decidir, não recomendação de investimento." },
    ],
  },
  ajustes: {
    nome: "Ajustes",
    passos: [
      { alvo: T("Pessoas da casa"), titulo: "Pessoas da casa", texto: "Aqui fica o <b>código de convite</b> para a outra pessoa entrar na casa." },
      { alvo: S("#main [data-act=ask-sair-casa]"), fallback: T("Pessoas da casa"), titulo: "Sair da casa", texto: "Pede confirmação e explica antes o que é apagado. Investimentos, dia a dia e bancos conectados continuam com você." },
      { alvo: T("Quem vê o quê"), titulo: "Quem vê o quê", texto: "Casa, renda, metas e acerto: os dois. Pessoal, dia a dia, investimentos e bancos: só quem lançou — garantido pelo banco de dados, não só pela tela." },
      { alvo: T("Meus valores"), titulo: "Seus valores", texto: "Sua renda (os dois veem) e o orçamento do dia a dia (só você). Os dois alimentam o Saldo previsto." },
      { alvo: T("Bancos (Meu Pluggy)"), titulo: "Conectar bancos", texto: "<b>Conectar banco → MeuPluggy</b> e entre com o <b>seu</b> login do meu.pluggy.ai. <b>Como conectar</b> abre o passo a passo com telas." },
      { alvo: T("Bancos (Meu Pluggy)"), titulo: "Sincronizar e Avançado", texto: "<b>Sincronizar agora</b> traz o que o Meu Pluggy já buscou (ele atualiza os bancos 1× por dia). <b>Avançado → Usar Item ID</b> é só para suporte." },
      { alvo: T("Tutoriais"), titulo: "Rever os tutoriais", texto: "Abra o passo a passo de qualquer aba quando quiser (no computador também pelo <b>?</b> no topo). Aqui você liga ou desliga a abertura automática." },
      { alvo: T("Aparência"), titulo: "Aparência", texto: "Automático segue o claro/escuro do celular ou do computador; ou fixe Claro ou Escuro. Vale só neste aparelho." },
    ],
  },
};

/* ---------- preferências ---------- */
const KEY = (uid) => `casa-tour:${uid || "anon"}`;
function lerLocal(uid) {
  try { return JSON.parse(localStorage.getItem(KEY(uid)) || "{}"); } catch { return {}; }
}
function gravarLocal(uid, v) {
  try { localStorage.setItem(KEY(uid), JSON.stringify(v)); } catch { /* sem armazenamento */ }
}
export function estadoTour(user) {
  const m = user?.user_metadata?.tour || {};
  const l = lerLocal(user?.id);
  return { off: Boolean(m.off || l.off), vistos: new Set([...(m.vistos || []), ...(l.vistos || [])]) };
}
// Grava no aparelho e devolve o estado novo para o app salvar na conta.
export function salvarTour(user, patch, onSalvar) {
  const e = estadoTour(user);
  const novo = { off: patch.off ?? e.off, vistos: [...new Set([...e.vistos, ...(patch.vistos || [])])] };
  gravarLocal(user?.id, novo);
  onSalvar?.(novo);
  return novo;
}
// Sobe quando os passos mudam bastante: quem já tinha concluído vê a versão nova uma vez.
const VERSAO = 2;
const chaveVisto = (rota) => `${rota}@${VERSAO}`;
const adiados = new Set(); // "Ver mais tarde" nesta abertura do app
export function deveMostrar(user, rota) {
  if (!TOURS[rota] || adiados.has(rota)) return false;
  const e = estadoTour(user);
  return !e.off && !e.vistos.has(chaveVisto(rota));
}

/* ---------- alvo ---------- */
function acharAlvo(a) {
  if (!a) return null;
  if (a.sel) return document.querySelector(a.sel);
  const t = a.titulo.toLowerCase();
  return [...document.querySelectorAll("#main section.card")].find((c) => (c.querySelector(".ctop h2")?.textContent || "").trim().toLowerCase().startsWith(t)) || null;
}
const visivel = (el) => el && el.getClientRects().length > 0;

/* ---------- janela ---------- */
let atual = null;
export function abrirTour(rota, { user, onSalvar } = {}) {
  const tour = TOURS[rota];
  if (!tour) return;
  fecharTour(true);
  const n = tour.passos.length;
  const e0 = estadoTour(user);
  const raiz = document.createElement("div");
  raiz.className = "tour";
  raiz.innerHTML = `<div class="tour-veu"></div><div class="tour-furo" aria-hidden="true"></div>
    <div class="tour-pop" role="dialog" aria-modal="true" aria-labelledby="tourTit">
      <div class="tour-top"><span class="tour-k">${tour.nome} · <span id="tourN"></span></span><button type="button" class="icon-btn" data-t="tarde" aria-label="Fechar (ver mais tarde)">${ic("x", "sm")}</button></div>
      <h3 id="tourTit"></h3><p id="tourTxt"></p>
      <div class="tour-nav"><div class="guia-dots">${tour.passos.map((p, k) => `<button type="button" data-t="ir" data-i="${k}" aria-label="Passo ${k + 1}"></button>`).join("")}</div>
        <div class="tour-btns"><button type="button" class="btn btn-sm" data-t="voltar">${ic("esq", "sm")}</button><button type="button" class="btn btn-primary btn-sm" data-t="prox"></button></div></div>
      <div class="tour-foot"><label class="toggle tour-off"><span class="check"><input type="checkbox" data-t="off" ${e0.off ? "checked" : ""}><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 9.5 17 19 7.5" style="stroke-width:2.5"/></svg></span>Não mostrar tutoriais</label>
        <button type="button" class="btn btn-ghost btn-sm" data-t="tarde">Ver mais tarde</button></div>
    </div>`;
  document.body.append(raiz);
  const furo = raiz.querySelector(".tour-furo");
  const pop = raiz.querySelector(".tour-pop");
  let i = 0;
  let alvo = null;

  const posicionar = () => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const celular = vw <= 640;
    if (alvo && visivel(alvo)) {
      const r = alvo.getBoundingClientRect();
      const pad = 8;
      const top = Math.max(4, r.top - pad);
      const h = Math.min(vh - 8, r.bottom + pad) - top;
      Object.assign(furo.style, { display: "block", left: `${Math.max(4, r.left - pad)}px`, top: `${top}px`, width: `${Math.min(vw - 8, r.width + pad * 2)}px`, height: `${Math.max(24, h)}px` });
      if (celular) return pop.classList.add("baixo");
      pop.classList.remove("baixo");
      const pw = pop.offsetWidth;
      const ph = pop.offsetHeight;
      let y = r.bottom + 14;
      if (y + ph > vh - 12) y = r.top - ph - 14;
      if (y < 12) y = Math.max(12, Math.min(vh - ph - 12, r.top + 12));
      let x = r.left + Math.min(24, r.width / 2) ;
      x = Math.max(12, Math.min(vw - pw - 12, x));
      Object.assign(pop.style, { left: `${x}px`, top: `${y}px` });
    } else {
      furo.style.display = "none";
      pop.classList.toggle("baixo", celular);
      if (!celular) Object.assign(pop.style, { left: `${(vw - pop.offsetWidth) / 2}px`, top: `${(vh - pop.offsetHeight) / 2}px` });
    }
  };

  const ir = (k) => {
    i = Math.max(0, Math.min(n - 1, k));
    const p = tour.passos[i];
    alvo = acharAlvo(p.alvo);
    if (!visivel(alvo)) alvo = acharAlvo(p.fallback);
    raiz.querySelector("#tourN").textContent = `${i + 1} de ${n}`;
    raiz.querySelector("#tourTit").textContent = p.titulo;
    raiz.querySelector("#tourTxt").innerHTML = p.texto;
    raiz.querySelectorAll(".guia-dots button").forEach((b, j) => b.setAttribute("aria-selected", String(j === i)));
    raiz.querySelector("[data-t=voltar]").disabled = i === 0;
    raiz.querySelector("[data-t=prox]").innerHTML = i === n - 1 ? `${ic("ok", "sm")}Concluir` : `Próximo${ic("dir", "sm")}`;
    pop.classList.remove("entra");
    void pop.offsetWidth;
    pop.classList.add("entra");
    if (alvo && visivel(alvo)) {
      const r = alvo.getBoundingClientRect();
      const barra0 = document.querySelector(".top")?.getBoundingClientRect().bottom || 0;
      const fora = r.top < barra0 + 4 || r.bottom > window.innerHeight - (window.innerWidth <= 640 ? 280 : 20);
      if (fora) {
        const barra = document.querySelector(".top")?.getBoundingClientRect().bottom || 0;
        const celular = window.innerWidth <= 640;
        const y = celular
          ? window.scrollY + r.top - barra - 12
          : window.scrollY + r.top - Math.max(barra + 12, (window.innerHeight - r.height) / 2);
        window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
        setTimeout(posicionar, 420);
      }
    }
    posicionar();
    raiz.querySelector("[data-t=prox]").focus({ preventScroll: true });
  };

  const salvar = (patch) => salvarTour(user, patch, onSalvar);

  raiz.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-t]");
    if (!b) return;
    const t = b.dataset.t;
    if (t === "tarde") { adiados.add(rota); fecharTour(); }
    else if (t === "voltar") ir(i - 1);
    else if (t === "ir") ir(Number(b.dataset.i));
    else if (t === "prox") {
      if (i < n - 1) return ir(i + 1);
      salvar({ vistos: [chaveVisto(rota)] });
      fecharTour();
    }
  });
  raiz.querySelector("[data-t=off]").addEventListener("change", (ev) => salvar({ off: ev.target.checked }));
  const tecla = (ev) => {
    if (ev.key === "Escape") { adiados.add(rota); fecharTour(); }
    else if (ev.key === "ArrowRight") ir(i + 1);
    else if (ev.key === "ArrowLeft") ir(i - 1);
  };
  const reposiciona = () => posicionar();
  document.addEventListener("keydown", tecla, true);
  window.addEventListener("resize", reposiciona);
  window.addEventListener("scroll", reposiciona, { passive: true, capture: true });
  atual = { raiz, limpar: () => {
    document.removeEventListener("keydown", tecla, true);
    window.removeEventListener("resize", reposiciona);
    window.removeEventListener("scroll", reposiciona, { capture: true });
  } };
  ir(0);
}
export function fecharTour(imediato = false) {
  if (!atual) return;
  const { raiz, limpar } = atual;
  atual = null;
  limpar();
  if (imediato) return raiz.remove();
  raiz.classList.add("sai");
  setTimeout(() => raiz.remove(), 200);
}
export const tourAberto = () => Boolean(atual);
