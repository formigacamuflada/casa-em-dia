// Recebe os avisos da Pluggy (item atualizado, transações novas) e sincroniza sozinho
// os dados do dono daquela conexão. O endereço leva uma assinatura derivada do
// Client Secret; sem ela, a chamada é recusada.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { assinaturaWebhook, sincronizarUsuario } from "../_shared/pluggy.ts";

const EVENTOS = new Set(["item/updated", "item/created", "transactions/created", "transactions/updated"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const s = new URL(req.url).searchParams.get("s") || "";
  const esperado = await assinaturaWebhook();
  if (!esperado || s !== esperado) return new Response("forbidden", { status: 403 });

  let corpo: { event?: string; itemId?: string; id?: string } = {};
  try {
    corpo = await req.json();
  } catch {
    return new Response("ok");
  }
  const itemId = corpo.itemId || corpo.id;
  if (!itemId || !EVENTOS.has(String(corpo.event))) return new Response("ok");

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: dono } = await admin.from("pluggy_itens").select("user_id").eq("item_id", itemId).maybeSingle();
  if (!dono) return new Response("ok");

  // Evita sincronizar duas vezes seguidas quando chegam vários avisos juntos.
  const { data: ultima } = await admin.from("importacoes").select("atualizado_em").eq("user_id", dono.user_id).maybeSingle();
  if (ultima && Date.now() - Date.parse(ultima.atualizado_em) < 2 * 60 * 1000) return new Response("ok");

  const tarefa = sincronizarUsuario(admin, dono.user_id).catch((e) => console.error("webhook sync", e?.message));
  // Responde já; a sincronização segue em segundo plano.
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(tarefa);
  else await tarefa;
  return new Response("ok");
});
