// Camada de dados: Supabase (login, banco com RLS, tempo real e funções).
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://dxizuewsqkymogbeanlh.supabase.co";
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

// No app do Windows, os links de e-mail abrem a versão web.
const PAGES_URL = "https://formigacamuflada.github.io/casa-em-dia/";
const retorno = () => (window.__TAURI_INTERNALS__ || location.protocol !== "https:" ? PAGES_URL : location.origin + location.pathname);

function fail(error) {
  if (error) throw error;
}

export function createApi() {
  if (!SUPABASE_KEY) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  // Links assinados das imagens dos cartões, reaproveitados até perto de expirar
  // (assim a imagem não é baixada de novo a cada atualização em tempo real).
  const links = new Map();
  const VALIDADE = 12 * 3600;
  async function assinar(paths) {
    const agora = Date.now();
    const faltam = paths.filter((p) => !(links.get(p)?.ate > agora + 3600 * 1000));
    if (faltam.length) {
      const { data } = await sb.storage.from("cartoes").createSignedUrls(faltam, VALIDADE);
      for (const r of data || []) if (r.signedUrl && !r.error) links.set(r.path, { url: r.signedUrl, ate: agora + VALIDADE * 1000 });
    }
    return Object.fromEntries(paths.map((p) => [p, links.get(p)?.url || null]));
  }

  const rows = async (q) => {
    const { data, error } = await q;
    fail(error);
    return data || [];
  };

  return {
    auth: {
      async session() {
        const { data } = await sb.auth.getSession();
        return data.session;
      },
      onChange(cb) {
        return sb.auth.onAuthStateChange((event, session) => cb(event, session));
      },
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        fail(error);
      },
      async signUp(email, password) {
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: retorno() } });
        fail(error);
        return Boolean(data.session);
      },
      async reset(email) {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: retorno() });
        fail(error);
      },
      async newPassword(password) {
        const { error } = await sb.auth.updateUser({ password });
        fail(error);
      },
      // Preferências pequenas da pessoa (ex.: não mostrar o guia de novo), guardadas na conta.
      async salvarMeta(data) {
        const { error } = await sb.auth.updateUser({ data });
        fail(error);
      },
      async signOut() {
        await sb.auth.signOut();
      },
    },

    async loadAll() {
      const membros = await rows(sb.from("membros").select("*").order("vaga"));
      const mercado = await rows(sb.from("mercado").select("*").eq("id", "atual"));
      if (!membros.length) return { semCasa: true, membros: [], mercado: mercado[0] || null };
      const [casas, contas, cartoes, metas, aportes, acertos, invest, prefs, imp, gastos, itens, avisos] = await Promise.all([
        rows(sb.from("casas").select("*")),
        rows(sb.from("contas").select("*")),
        rows(sb.from("cartoes").select("*").order("criado_em")),
        rows(sb.from("metas").select("*").order("criado_em")),
        rows(sb.from("aportes").select("*").order("data")),
        rows(sb.from("acertos").select("*")),
        rows(sb.from("investimentos").select("*").order("valor", { ascending: false })),
        rows(sb.from("preferencias").select("*")),
        rows(sb.from("importacoes").select("*")),
        rows(sb.from("gastos_mensais").select("*").order("mes")),
        rows(sb.from("pluggy_itens").select("*").order("criado_em")),
        // Avisos: se a migração ainda não chegou ao banco, o app segue sem o sininho.
        sb.from("avisos").select("*").order("criado_em", { ascending: false }).limit(60).then((r) => (r.error ? [] : r.data || [])),
      ]);
      const comImagem = cartoes.filter((c) => c.imagem).map((c) => c.imagem);
      if (comImagem.length) {
        try {
          const u = await assinar(comImagem);
          for (const c of cartoes) if (c.imagem) c.imagem_url = u[c.imagem];
        } catch {
          /* sem imagem: o cartão aparece com o desenho padrão */
        }
      }
      return {
        semCasa: false,
        casa: casas[0] || null,
        membros,
        contas,
        cartoes,
        metas,
        aportes,
        acertos,
        invest,
        prefs: prefs[0] || null,
        importacao: imp[0] || null,
        gastos,
        itens,
        avisos,
        mercado: mercado[0] || null,
      };
    },

    subscribe(onChange) {
      const tabelas = [
        "membros", "casas", "contas", "cartoes", "metas", "aportes", "acertos",
        "investimentos", "preferencias", "importacoes", "gastos_mensais", "mercado", "avisos",
      ];
      let ch = sb.channel("casa-em-dia");
      for (const t of tabelas) ch = ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => onChange(t));
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },

    async criarCasa(apelido) {
      const { error } = await sb.rpc("criar_casa", { p_apelido: apelido });
      fail(error);
    },
    async entrarNaCasa(codigo, apelido) {
      const { error } = await sb.rpc("entrar_na_casa", { p_codigo: codigo, p_apelido: apelido });
      fail(error);
    },
    async sairDaCasa() {
      const { error } = await sb.rpc("sair_da_casa");
      fail(error);
    },
    async novoCodigo() {
      const { data, error } = await sb.rpc("novo_codigo_convite");
      fail(error);
      return data;
    },
    async salvar(tabela, row, id) {
      const q = id ? sb.from(tabela).update(row).eq("id", id) : sb.from(tabela).insert(row);
      const { error } = await q;
      fail(error);
    },
    async enviarImagemCartao(casaId, userId, blob) {
      const ext = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/png" ? "png" : "webp";
      const path = `${casaId}/${userId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await sb.storage.from("cartoes").upload(path, blob, { contentType: blob.type || "image/webp", upsert: false });
      fail(error);
      return path;
    },
    async apagarImagemCartao(path) {
      if (!path) return;
      links.delete(path);
      await sb.storage.from("cartoes").remove([path]).catch(() => {});
    },
    async apagar(tabela, id) {
      const { error } = await sb.from(tabela).delete().eq("id", id);
      fail(error);
    },
    async marcarPago(tabela, id, mes, pago) {
      const { error } = await sb.rpc("marcar_pago", { p_tabela: tabela, p_id: id, p_mes: mes, p_pago: pago });
      fail(error);
    },
    async valorMes(tabela, id, mes, valor) {
      const { error } = await sb.rpc("definir_valor_mes", { p_tabela: tabela, p_id: id, p_mes: mes, p_valor: valor });
      fail(error);
    },
    async salvarMembro(id, patch) {
      const { error } = await sb.from("membros").update(patch).eq("id", id);
      fail(error);
    },
    async salvarPrefs(userId, patch) {
      const { error } = await sb.from("preferencias").upsert({ user_id: userId, ...patch, atualizado_em: new Date().toISOString() });
      fail(error);
    },
    async marcarAcerto(row) {
      const { error } = await sb.from("acertos").upsert(row);
      fail(error);
    },
    // ids: lista de avisos; sem ids, marca todos os não lidos.
    async marcarLidos(ids) {
      let q = sb.from("avisos").update({ lido_em: new Date().toISOString() }).is("lido_em", null);
      if (ids) q = q.in("id", ids);
      const { error } = await q;
      fail(error);
    },
    async desfazerAcerto(casaId, mes) {
      const { error } = await sb.from("acertos").delete().eq("casa_id", casaId).eq("mes", mes);
      fail(error);
    },
    async addItem(itemId, apelido) {
      const { error } = await sb.from("pluggy_itens").insert({ item_id: itemId, apelido });
      fail(error);
    },
    async removeItem(itemId) {
      const { error } = await sb.from("pluggy_itens").delete().eq("item_id", itemId);
      fail(error);
    },
    async atualizarMercado(forcar = false) {
      const { data, error } = await sb.functions.invoke("mercado", { body: { forcar } });
      fail(error);
      return data;
    },
    async connectToken(itemId) {
      const { data, error } = await sb.functions.invoke("pluggy-connect-token", { body: itemId ? { itemId } : {} });
      if (error) {
        let msg = error.message;
        try {
          const body = await error.context?.json?.();
          if (body?.erro) msg = body.erro;
        } catch {
          /* mantém a mensagem original */
        }
        throw new Error(msg);
      }
      return data.accessToken;
    },
    async sincronizarBancos() {
      const { data, error } = await sb.functions.invoke("pluggy-sync", { body: {} });
      if (error) {
        let msg = error.message;
        try {
          const body = await error.context?.json?.();
          if (body?.erro) msg = body.erro;
        } catch {
          /* mantém a mensagem original */
        }
        throw new Error(msg);
      }
      return data;
    },
  };
}
