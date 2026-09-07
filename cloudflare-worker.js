// Cloudflareダッシュボードの「Edit code」にこの内容をそのまま貼り付けてください。
// Google Books APIキーはこのコードに書かず、Worker の環境変数（Secret）
// "GOOGLE_BOOKS_API_KEY" として設定します。手順は案内メッセージを参照してください。
//
// 同じ検索クエリ（大文字小文字・前後の空白の違いは無視）は7日間キャッシュする。
// 書誌情報はほぼ変化しないため長めに設定し、人気の本は2回目以降Googleに
// 問い合わせないことで無料枠(1日1,000件)の実質的な余裕を増やす。
//
// ALLOWED_ORIGINSに載っていないOriginからのリクエストは拒否する。
// 注意："null"は許可しないこと。サンドボックス化されたiframeやdata:URIから
// fetch()すると、ブラウザは正規の挙動としてOriginを文字列"null"で送信するため、
// 第三者サイトが数行のHTMLで偽装できてしまう（無料枠の不正消費につながる）。
const ALLOWED_ORIGINS = [
  "https://masaki-32.github.io",
];

const CACHE_SECONDS = 604800; // 7日間。書誌情報はほぼ変化しないため長めに設定
// 検索ロジック（maxResults等）を変えた時は、この番号を上げること。
// 上げないと、変更前にキャッシュされた古い結果が最大7日間そのまま返り続けてしまう。
const CACHE_VERSION = "v2";

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    // レスポンス自体はクレデンシャルを使わないため誰から見ても同じ内容でよく、
    // Access-Control-Allow-Originは常に"*"で固定する（キャッシュがOriginを
    // 意識せず1つで済み、後段のOrigin検証だけで不正利用を防ぐ設計にする）。
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    // Originヘッダーが無い（curl等ブラウザ以外からの直接アクセス）場合も、
    // ブラウザから許可外サイト経由の場合も、まとめて拒否する。
    if (!origin || ALLOWED_ORIGINS.indexOf(origin) === -1) {
      return json({ error: "forbidden", message: "許可されていないOriginからのリクエストです" }, 403, cors);
    }

    const url = new URL(request.url);
    if (url.pathname !== "/search") {
      return json({ error: "not_found" }, 404, cors);
    }

    const rawQ = url.searchParams.get("q") || "";
    const q = rawQ.trim().toLowerCase();
    if (!q) {
      return json({ error: "missing query parameter q" }, 400, cors);
    }

    const cache = caches.default;
    const cacheKeyUrl = new URL(url.origin + url.pathname + "?v=" + CACHE_VERSION + "&q=" + encodeURIComponent(q));
    const cacheKey = new Request(cacheKeyUrl.toString(), { method: "GET" });
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    if (!env.GOOGLE_BOOKS_API_KEY) {
      return json({ error: "server_misconfigured", message: "GOOGLE_BOOKS_API_KEY が設定されていません" }, 500, cors);
    }

    const target =
      "https://www.googleapis.com/books/v1/volumes?maxResults=40&q=" +
      encodeURIComponent(q) +
      "&key=" +
      encodeURIComponent(env.GOOGLE_BOOKS_API_KEY);

    try {
      const res = await fetch(target);
      const data = await res.json();
      const response = json(data, res.status, cors, !data.error);
      if (!data.error) ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;
    } catch (e) {
      return json({ error: "upstream_error", message: String(e) }, 502, cors);
    }
  },
};

function json(obj, status, cors, cacheable) {
  const headers = Object.assign({ "Content-Type": "application/json" }, cors);
  if (cacheable) headers["Cache-Control"] = "public, max-age=" + CACHE_SECONDS;
  return new Response(JSON.stringify(obj), { status: status, headers: headers });
}
