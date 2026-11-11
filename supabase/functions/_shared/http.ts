// Utilidades compartilhadas pelas funções do Casa em Dia.

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

export class UserError extends Error {}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const r2 = (n: unknown): number | null =>
  n === null || n === undefined || Number.isNaN(Number(n)) ? null : Math.round(Number(n) * 100) / 100;
export const day = (v: unknown): string | null => (v ? String(v).slice(0, 10) : null);
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const addDays = (iso: string, n: number) => {
  const dt = new Date(`${iso}T12:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
export const monthOf = (iso: string) => String(iso).slice(0, 7);

export async function http(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number; retries?: number } = {},
): Promise<any> {
  const { method = "GET", headers = {}, body, timeoutMs = 25000, retries = 1 } = opts;
  for (let attempt = 0; ; attempt++) {
    let res: Response;
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
      throw new UserError(`Sem resposta de ${new URL(url).host}: ${(e as Error).message}`);
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    const text = await res.text();
    let data: any;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} em ${new URL(url).host}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return data;
  }
}
