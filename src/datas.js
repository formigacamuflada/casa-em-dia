// Seletor de data no visual do app (substitui os seletores nativos, que mudam de
// sistema para sistema e nem aparecem no Safari do computador).
//   modo "mes": escolhe mês e ano (valor "AAAA-MM"), ex.: prazo de meta
//   modo "dia": escolhe o dia (valor "AAAA-MM-DD"), ex.: data de aporte
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pad = (n) => String(n).padStart(2, "0");
const hojeYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const SETA_E = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
const SETA_D = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const CAL = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></svg>';

function rotulo(modo, v) {
  if (!v) return "";
  const [a, m, d] = v.split("-").map(Number);
  if (!a || !m) return "";
  return modo === "mes" ? `${MESES[m - 1]} de ${a}` : `${d} de ${MESES[m - 1]} de ${a}`;
}

/** Campo de data. `min` (mesmo formato do valor) bloqueia datas anteriores. */
export function campoData({ name, label, value = "", modo = "dia", min = "", placeholder = "Escolher", hint = "" }) {
  const id = `dp_${name}`;
  return `<div class="field"><span class="lab" id="${id}_l">${label}</span>
    <div class="dp" data-modo="${modo}" data-min="${esc(min)}">
      <input type="hidden" name="${esc(name)}" value="${esc(value)}">
      <button type="button" class="inp dp-btn" aria-haspopup="dialog" aria-expanded="false" aria-labelledby="${id}_l ${id}_v">${CAL}<span id="${id}_v" class="dp-val${value ? "" : " vazio"}">${esc(rotulo(modo, value) || placeholder)}</span></button>
      <div class="dp-pop" role="dialog" aria-label="${esc(label)}" hidden></div>
    </div>${hint ? `<span class="hint">${hint}</span>` : ""}</div>`;
}

function desenhar(dp) {
  const modo = dp.dataset.modo;
  const val = dp.querySelector("input").value;
  const min = dp.dataset.min || "";
  const pop = dp.querySelector(".dp-pop");
  const hoje = hojeYMD();
  // "vista": ano (modo mês) ou ano-mês (modo dia) mostrado no momento
  let vista = dp.dataset.vista;
  if (!vista) vista = modo === "mes" ? (val || hoje).slice(0, 4) : (val || hoje).slice(0, 7);
  dp.dataset.vista = vista;
  let corpo;
  if (modo === "mes") {
    const ano = Number(vista);
    const atual = hoje.slice(0, 7);
    corpo = `<div class="dp-head"><button type="button" class="dp-nav" data-dp="prev" aria-label="Ano anterior">${SETA_E}</button><strong>${ano}</strong><button type="button" class="dp-nav" data-dp="next" aria-label="Próximo ano">${SETA_D}</button></div>
      <div class="dp-meses">${MESES.map((nm, i) => {
        const ym = `${ano}-${pad(i + 1)}`;
        const off = min && ym < min;
        return `<button type="button" class="dp-cel${ym === val ? " on" : ""}${ym === atual ? " hoje" : ""}" data-dp="pick" data-v="${ym}" ${off ? "disabled" : ""}>${nm.slice(0, 3)}</button>`;
      }).join("")}</div>
      <div class="dp-atalhos">${[[6, "6 meses"], [12, "1 ano"], [24, "2 anos"], [60, "5 anos"]].map(([k, t]) => {
        const d = new Date();
        d.setMonth(d.getMonth() + k, 1);
        return `<button type="button" class="chip" data-dp="pick" data-v="${d.getFullYear()}-${pad(d.getMonth() + 1)}">em ${t}</button>`;
      }).join("")}</div>`;
  } else {
    const [a, m] = vista.split("-").map(Number);
    const primeiro = new Date(a, m - 1, 1).getDay();
    const dias = new Date(a, m, 0).getDate();
    const cels = [];
    for (let i = 0; i < primeiro; i++) cels.push('<span class="dp-cel vazio"></span>');
    for (let d = 1; d <= dias; d++) {
      const ymd = `${a}-${pad(m)}-${pad(d)}`;
      const off = min && ymd < min;
      cels.push(`<button type="button" class="dp-cel${ymd === val ? " on" : ""}${ymd === hoje ? " hoje" : ""}" data-dp="pick" data-v="${ymd}" ${off ? "disabled" : ""}>${d}</button>`);
    }
    corpo = `<div class="dp-head"><button type="button" class="dp-nav" data-dp="prev" aria-label="Mês anterior">${SETA_E}</button><button type="button" class="dp-titulo" data-dp="anos">${MESES[m - 1]} ${a}</button><button type="button" class="dp-nav" data-dp="next" aria-label="Próximo mês">${SETA_D}</button></div>
      <div class="dp-semana">${SEMANA.map((s) => `<span>${s}</span>`).join("")}</div>
      <div class="dp-dias">${cels.join("")}</div>
      <div class="dp-atalhos"><button type="button" class="chip" data-dp="pick" data-v="${hoje}">Hoje</button></div>`;
  }
  pop.innerHTML = `${corpo}<div class="dp-foot">${val ? '<button type="button" class="link-btn" data-dp="limpar">Limpar</button>' : "<span></span>"}<button type="button" class="btn btn-sm" data-dp="fechar">Fechar</button></div>`;
}

function abrir(dp) {
  document.querySelectorAll(".dp.aberto").forEach((o) => o !== dp && fechar(o));
  dp.classList.add("aberto");
  delete dp.dataset.vista;
  desenhar(dp);
  dp.querySelector(".dp-pop").hidden = false;
  dp.querySelector(".dp-btn").setAttribute("aria-expanded", "true");
  dp.querySelector(".dp-cel.on, .dp-cel.hoje, .dp-cel:not([disabled])")?.focus({ preventScroll: true });
}
function fechar(dp) {
  dp.classList.remove("aberto");
  dp.querySelector(".dp-pop").hidden = true;
  dp.querySelector(".dp-btn").setAttribute("aria-expanded", "false");
}
function definir(dp, v) {
  const inp = dp.querySelector("input");
  inp.value = v;
  const lab = dp.querySelector(".dp-val");
  lab.textContent = rotulo(dp.dataset.modo, v) || "Escolher";
  lab.classList.toggle("vazio", !v);
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  inp.dispatchEvent(new Event("change", { bubbles: true }));
}

let ligado = false;
export function ligarDatas() {
  if (ligado) return;
  ligado = true;
  document.addEventListener("click", (e) => {
    const dp = e.target.closest?.(".dp");
    if (!dp) {
      document.querySelectorAll(".dp.aberto").forEach(fechar);
      return;
    }
    if (e.target.closest(".dp-btn")) return dp.classList.contains("aberto") ? fechar(dp) : abrir(dp);
    const b = e.target.closest("[data-dp]");
    if (!b) return;
    const acao = b.dataset.dp;
    const modo = dp.dataset.modo;
    if (acao === "pick") {
      definir(dp, b.dataset.v);
      fechar(dp);
      dp.querySelector(".dp-btn").focus();
    } else if (acao === "limpar") {
      definir(dp, "");
      fechar(dp);
    } else if (acao === "fechar") {
      fechar(dp);
    } else if (acao === "prev" || acao === "next") {
      const passo = acao === "prev" ? -1 : 1;
      if (modo === "mes") dp.dataset.vista = String(Number(dp.dataset.vista) + passo);
      else {
        const [a, m] = dp.dataset.vista.split("-").map(Number);
        const d = new Date(a, m - 1 + passo, 1);
        dp.dataset.vista = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      }
      desenhar(dp);
    } else if (acao === "anos") {
      // no modo dia, pular o ano rápido: avança 12 meses
      const [a, m] = dp.dataset.vista.split("-").map(Number);
      dp.dataset.vista = `${a + 1}-${pad(m)}`;
      desenhar(dp);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const dp = document.querySelector(".dp.aberto");
    if (!dp) return;
    e.stopPropagation();
    fechar(dp);
    dp.querySelector(".dp-btn").focus();
  }, true);
}
