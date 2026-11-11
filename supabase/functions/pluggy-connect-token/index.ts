// Gera um Connect Token da Pluggy para a pessoa logada abrir o Pluggy Connect no app.
// O Client ID e o Client Secret ficam só aqui (segredos do Supabase); o app recebe
// apenas um token temporário, amarrado ao id do usuário (clientUserId).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, http, json } from "../_shared/http.ts";

const PLUGGY = "https://api.pluggy.ai";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const clientId = Deno.env.get("PLUGGY_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("PLUGGY_CLIENT_SECRET") || "";
    if (!clientId || !clientSecret) {
      return json({ ok: false, erro: "A conexão com bancos ainda não foi configurada no servidor." }, 503);
    }

    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: who, error } = await sb.auth.getUser(token);
    if (error || !who?.user) return json({ ok: false, erro: "Entre na sua conta para conectar um banco." }, 401);

    let itemId: string | undefined;
    try {
      itemId = (await req.json())?.itemId || undefined; // para reautorizar uma conexão existente
    } catch {
      // corpo vazio
    }

    const auth = await http(`${PLUGGY}/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret }),
    });
    const ct = await http(`${PLUGGY}/connect_token`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-KEY": auth.apiKey },
      body: JSON.stringify({ itemId, options: { clientUserId: who.user.id, avoidDuplicates: true } }),
    });
    return json({ ok: true, accessToken: ct.accessToken });
  } catch (e) {
    const s = (e as { status?: number }).status;
    const msg = s === 401 || s === 403 ? "A Pluggy recusou as credenciais configuradas no servidor." : `Não foi possível iniciar a conexão: ${(e as Error).message}`;
    return json({ ok: false, erro: msg }, 500);
  }
});
