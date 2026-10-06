// Sincronização do progresso (Netlify Functions + Netlify Blobs).
// POST /api/sync  {id, itens}  -> mescla com o que está salvo e devolve o resultado mesclado.
// GET  /api/sync?id=...        -> devolve o que está salvo.
import { getStore } from "@netlify/blobs";

const ID = /^[a-f0-9]{64}$/;
const MAX = 3 * 1024 * 1024; // 3 MB

export function mesclarItens(atuais, novos) {
  const out = { ...atuais };
  for (const k of Object.keys(novos || {})) {
    if (!(k.startsWith("tcema-") || k.startsWith("disc-"))) continue;
    if (k === "tcema-todos-ultimo" || k === "tcema-cloud-secret" || k === "tcema-cloud-ultima") continue;
    const inc = novos[k], atu = out[k];
    if (typeof inc !== "string") continue;
    if (k.startsWith("disc-")) {
      if (!atu || inc.length > atu.length) out[k] = inc;
      continue;
    }
    try {
      const b = JSON.parse(inc);
      const a = atu ? JSON.parse(atu) : { ans: {}, flag: {} };
      a.ans = a.ans || {}; a.flag = a.flag || {};
      for (const q of Object.keys(b.ans || {})) {
        const x = a.ans[q], y = b.ans[q];
        if (!x || (y && (y.t || 0) > (x.t || 0))) a.ans[q] = y;
      }
      for (const q of Object.keys(b.flag || {})) a.flag[q] = 1;
      out[k] = JSON.stringify(a);
    } catch (e) { /* ignora item inválido */ }
  }
  return out;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  const store = getStore("tcema-progresso");
  const url = new URL(req.url);
  if (req.method === "GET") {
    const id = url.searchParams.get("id") || "";
    if (!ID.test(id)) return json({ erro: "id inválido" }, 400);
    const v = await store.get(id, { type: "json" });
    return json(v || { itens: {} });
  }
  if (req.method === "POST") {
    const texto = await req.text();
    if (texto.length > MAX) return json({ erro: "dados grandes demais" }, 413);
    let corpo;
    try { corpo = JSON.parse(texto); } catch { return json({ erro: "JSON inválido" }, 400); }
    if (!ID.test(corpo.id || "") || typeof corpo.itens !== "object" || corpo.itens === null)
      return json({ erro: "requisição inválida" }, 400);
    const atual = (await store.get(corpo.id, { type: "json" })) || { itens: {} };
    const itens = mesclarItens(atual.itens || {}, corpo.itens);
    await store.setJSON(corpo.id, { atualizado: new Date().toISOString(), itens });
    return json({ ok: true, itens });
  }
  return json({ erro: "método não permitido" }, 405);
};

export const config = { path: "/api/sync" };
