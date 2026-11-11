// Importa, somente leitura, os dados do Meu Pluggy (Open Finance) da pessoa logada.
// Grava em tabelas que só o dono enxerga (importacoes e gastos_mensais).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, json, UserError } from "../_shared/http.ts";
import { sincronizarUsuario } from "../_shared/pluggy.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
    const { data: who, error } = await anon.auth.getUser(token);
    if (error || !who?.user) return json({ ok: false, erro: "Entre na sua conta para sincronizar." }, 401);
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const r = await sincronizarUsuario(admin, who.user.id);
    return json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof UserError ? e.message : `Falha na sincronização: ${(e as Error).message}`;
    return json({ ok: false, erro: msg }, e instanceof UserError ? 400 : 500);
  }
});
