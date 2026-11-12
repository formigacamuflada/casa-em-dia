// Rentabilidade de 12 meses dos investimentos vindos do Open Finance.
// Ordem: (1) o número que o banco manda (lastTwelveMonthsRate); (2) para renda fixa
// com indexador, quanto o título rendeu nos últimos 12 meses pelo indexador real
// (CDI e Selic diários, IPCA 12m e IGP-M do Banco Central); (3) sem indexador
// (fundos, ações, FIIs), o resultado desde a aplicação (saldo ÷ valor aplicado).
import { addDays, http } from "./http.ts";

const SGS = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.";
const isoToBr = (iso: string) => iso.split("-").reverse().join("/");
const brToIso = (br: string) => String(br).split("/").reverse().join("-");
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

type Linha = { data: string; valor: number };
async function sgs(code: number, de: string, ate: string): Promise<Linha[]> {
  const rows = await http(`${SGS}${code}/dados?formato=json&dataInicial=${isoToBr(de)}&dataFinal=${isoToBr(ate)}`);
  if (!Array.isArray(rows)) throw new Error(`Resposta inesperada do SGS ${code}`);
  return rows.map((r: any) => ({ data: brToIso(r.data), valor: Number(String(r.valor).replace(",", ".")) }));
}

export type Rentab = { valor: number; nota: string; fonte: "banco" | "indexador" | "aplicacao" };

// Indexadores baixados só quando algum investimento precisa deles, uma vez por sincronização.
export function criarIndexadores(hoje: string) {
  const de = addDays(hoje, -365);
  const cache = new Map<string, Promise<any>>();
  const uma = <T>(k: string, f: () => Promise<T>): Promise<T | null> => {
    if (!cache.has(k)) cache.set(k, f().catch(() => null));
    return cache.get(k)!;
  };
  return {
    cdi: () => uma("cdi", () => sgs(12, de, hoje)), // % ao dia
    selic: () => uma("selic", () => sgs(11, de, hoje)), // % ao dia
    ipca12: () => uma("ipca", async () => (await sgs(13522, addDays(hoje, -150), hoje)).at(-1) || null),
    igpm12: () =>
      uma("igpm", async () => {
        const r = (await sgs(189, addDays(hoje, -400), hoje)).slice(-12);
        if (r.length < 12) return null;
        return { data: r[11].data, valor: (r.reduce((f, x) => f * (1 + x.valor / 100), 1) - 1) * 100 };
      }),
  };
}

// Normaliza a forma como a taxa vem (percentual ou fração).
const pctCdi = (r: number) => (r <= 3 ? r * 100 : r); // 1,1 → 110% do CDI
const pctAno = (r: number) => (r > 0 && r < 1 ? r * 100 : r); // 0,065 → 6,5% a.a.
const spreadCdi = (r: number) => (r > 0 && r < 0.1 ? r * 100 : r); // 0,01 → 1% a.a.

function indexador(v: any): string {
  const t = String(v.rateType || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (t.startsWith("CDI") || t === "DI") return "CDI";
  if (t.startsWith("SELIC")) return "SELIC";
  if (t.startsWith("IPCA")) return "IPCA";
  if (t.startsWith("IGPM")) return "IGPM";
  if (t.startsWith("PRE") || t === "FIXED" || t === "FIXEDRATE") return "PRE";
  return "";
}

export async function rentab12(v: any, idx: ReturnType<typeof criarIndexadores>): Promise<Rentab | null> {
  const banco = Number(v.lastTwelveMonthsRate);
  if (v.lastTwelveMonthsRate != null && Number.isFinite(banco) && banco !== 0) return { valor: banco, nota: "informado pelo banco", fonte: "banco" };

  const tipo = indexador(v);
  const rate = Number(v.rate);
  const pre = Number(v.fixedAnnualRate);
  const temPre = v.fixedAnnualRate != null && Number.isFinite(pre) && pre !== 0;

  if (tipo === "CDI" && Number.isFinite(rate) && rate > 0) {
    const dias = await idx.cdi();
    if (dias && dias.length > 200) {
      const p = pctCdi(rate) / 100;
      const s = temPre ? spreadCdi(pre) / 100 : 0;
      const f = dias.reduce((acc, d) => acc * (1 + (d.valor / 100) * p) * (1 + s) ** (1 / 252), 1);
      return { valor: (f - 1) * 100, nota: `${fmt(pctCdi(rate))}% do CDI${s ? ` + ${fmt(s * 100)}%` : ""}`, fonte: "indexador" };
    }
  }
  if (tipo === "SELIC") {
    const dias = await idx.selic();
    if (dias && dias.length > 200) {
      const s = temPre ? spreadCdi(pre) / 100 : 0;
      const f = dias.reduce((acc, d) => acc * (1 + d.valor / 100) * (1 + s) ** (1 / 252), 1);
      return { valor: (f - 1) * 100, nota: `Selic${s ? ` + ${fmt(s * 100)}%` : ""}`, fonte: "indexador" };
    }
  }
  if (tipo === "IPCA" || tipo === "IGPM") {
    const ind = tipo === "IPCA" ? await idx.ipca12() : await idx.igpm12();
    const x = temPre ? pctAno(pre) : Number.isFinite(rate) && rate > 0 && rate < 30 ? pctAno(rate) : 0;
    if (ind) {
      const nome = tipo === "IPCA" ? "IPCA" : "IGP-M";
      return {
        valor: ((1 + ind.valor / 100) * (1 + x / 100) - 1) * 100,
        nota: `${nome}${x ? ` + ${fmt(x)}%` : ""} · ${nome} até ${mesAno(ind.data)}`,
        fonte: "indexador",
      };
    }
  }
  if (tipo === "PRE") {
    const x = temPre ? pctAno(pre) : Number.isFinite(rate) ? pctAno(rate) : NaN;
    if (Number.isFinite(x) && x > 0) return { valor: x, nota: `prefixado ${fmt(x)}% a.a.`, fonte: "indexador" };
  }

  // Sem indexador: resultado desde a aplicação.
  const aplicado = Number(v.amountOriginal);
  const saldo = Number(v.balance);
  if (aplicado > 0 && Number.isFinite(saldo) && saldo > 0) {
    const desde = String(v.purchaseDate || v.issueDate || "").slice(0, 10);
    return {
      valor: (saldo / aplicado - 1) * 100,
      nota: desde ? `desde ${mesAno(desde)}` : "desde a aplicação",
      fonte: "aplicacao",
    };
  }
  return null;
}
