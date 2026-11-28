/* ============================================================
   server.js — zero-dependency static server + Quran Foundation
   OAuth2 client-credentials proxy.

   The browser never sees QF_CLIENT_SECRET. It calls this server's
   /api/qf/... routes; this server adds x-auth-token and x-client-id,
   retries once on 401, and forwards the JSON response.

   Run:  node server.js
   Env:  QF_CLIENT_ID, QF_CLIENT_SECRET, QF_ENV=prelive|production
   ============================================================ */

"use strict";

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const DEFAULT_ENV = "prelive";

const ENVIRONMENTS = {
  prelive: {
    auth: "https://prelive-oauth2.quran.foundation",
    api: "https://apis-prelive.quran.foundation"
  },
  production: {
    auth: "https://oauth2.quran.foundation",
    api: "https://apis.quran.foundation"
  }
};

const TOKEN_PATH = "/oauth2/token";
const TOKEN_SCOPES = [
  "content.quran.read",
  "content.translations.read",
  "content.tafsirs.read",
  "content.audio.read"
].join(" ");
const USER_AGENT = "quran-foundation-proxy/1.0 (+local-app)";
const CONTENT_PREFIX = "/content/api/v4/";
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;
const UPSTREAM_TIMEOUT_MS = 12000;
const API_CACHE_TTL_MS = 5 * 60 * 1000;
const AUDIO_BASE = "https://verses.quran.foundation/";

/* Some prelive reciter catalogs omit audio_files, and several famous
   reciters are not in the account at all. These public ayah-by-ayah
   locations keep every picker choice audible through this proxy.
   {code} is SSSAAA; {global} is the 1–6236 ayah index. */
const AUDIO_FALLBACKS = {
  "ar.alafasy":       ({ code }) => `${AUDIO_BASE}Alafasy/mp3/${code}.mp3`,
  "ar.husary":        ({ global }) => `https://cdn.islamic.network/quran/audio/128/ar.husary/${global}.mp3`,
  "ar.husarymujawwad": ({ global }) => `https://cdn.islamic.network/quran/audio/128/ar.husarymujawwad/${global}.mp3`,
  "ar.minshawi":      ({ code }) => `${AUDIO_BASE}Minshawi/Murattal/mp3/${code}.mp3`,
  "ar.hudhaify":      ({ global }) => `https://cdn.islamic.network/quran/audio/128/ar.hudhaify/${global}.mp3`,
  "ar.sudais":        ({ code }) => `${AUDIO_BASE}Sudais/mp3/${code}.mp3`,
  "ar.maher":         ({ global }) => `https://cdn.islamic.network/quran/audio/128/ar.mahermuaiqly/${global}.mp3`,
  "ar.ayyoub":        ({ global }) => `https://cdn.islamic.network/quran/audio/128/ar.muhammadayyoub/${global}.mp3`,
  "ar.shaatree":      ({ global }) => `https://cdn.islamic.network/quran/audio/128/ar.shaatree/${global}.mp3`,
  "ar.jibreel":       ({ global }) => `https://cdn.islamic.network/quran/audio/128/ar.muhammadjibreel/${global}.mp3`
};
/* Also keep the three QF catalog IDs usable when a caller supplies only
   `reciter` (for example an older bookmarked audio URL). */
AUDIO_FALLBACKS["7"] = AUDIO_FALLBACKS["ar.alafasy"];
AUDIO_FALLBACKS["6"] = AUDIO_FALLBACKS["ar.husary"];
AUDIO_FALLBACKS["9"] = AUDIO_FALLBACKS["ar.minshawi"];

/* The QF-provided Husary mirror is not reachable for every listener;
   use the known-good CDN fallback for that saved preference. */
const PREFER_FALLBACK = new Set(["ar.husary", "6"]);

function ayahAudioCode(verseKey) {
  const [surah, ayah] = String(verseKey).split(":").map(Number);
  return `${String(surah).padStart(3, "0")}${String(ayah).padStart(3, "0")}`;
}

/* Legacy localStorage reciter IDs are kept in the browser. Only these
   map to ayah-by-ayah QF recitation IDs; the rest use their CDN URL. */
const LEGACY_RECITERS = {
  "ar.alafasy": 7,
  "ar.husary": 6,
  "ar.minshawi": 9
};
const DEFAULT_RECITER_ID = LEGACY_RECITERS["ar.alafasy"];

/* ── Tiny .env loader (no dependency, no override of real env) ── */
function loadDotEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const QF_ENV = String(process.env.QF_ENV || DEFAULT_ENV).toLowerCase();
const qfConfig = ENVIRONMENTS[QF_ENV] || ENVIRONMENTS[DEFAULT_ENV];
const CLIENT_ID = String(process.env.QF_CLIENT_ID || "").trim();
const CLIENT_SECRET = String(process.env.QF_CLIENT_SECRET || "").trim();

const tokenState = {
  accessToken: null,
  expiresAt: 0,
  inflight: null
};
const apiCache = new Map();

/* ── Low-level HTTPS helper ─────────────────────────────────────── */
function requestJSON(url, options) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      target,
      {
        method: options.method || "GET",
        headers: Object.assign(
          { Accept: "application/json" },
          options.headers || {}
        ),
        timeout: options.timeout || UPSTREAM_TIMEOUT_MS
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = body ? JSON.parse(body) : null;
          } catch (err) {
            json = null;
          }
          resolve({ status: res.statusCode || 0, headers: res.headers, body, json });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Quran Foundation request timed out.")));
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/* ── OAuth2 client credentials ──────────────────────────────────── */
function tokenRequestBody() {
  /* Official client_credentials flow: HTTP Basic credentials and a
     URL-encoded body. The secret is never placed in a header named
     x-client-secret, in JSON, or in any response sent to the browser. */
  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");
  params.set("scope", TOKEN_SCOPES);
  return params.toString().replace(/\+/g, "%20");
}

async function fetchFreshToken() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "Quran Foundation credentials are missing. Set QF_CLIENT_ID and QF_CLIENT_SECRET."
    );
  }

  const body = tokenRequestBody();
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const res = await requestJSON(`${qfConfig.auth}${TOKEN_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
      "Authorization": `Basic ${basic}`,
      "Accept": "application/json",
      "User-Agent": USER_AGENT
    },
    body
  });

  const token = res.json && res.json.access_token;
  if (res.status < 200 || res.status >= 300 || !token) {
    const detail = res.json && (res.json.error_description || res.json.error || res.json.message);
    throw new Error(
      `Quran Foundation token request returned ${res.status || "no status"}.` +
      (detail ? ` ${String(detail).slice(0, 200)}` : "")
    );
  }

  const expiresIn = Number(res.json.expires_in || 3600);
  return {
    accessToken: String(token),
    expiresAt: Date.now() + Math.max(60, expiresIn) * 1000
  };
}

async function getAccessToken(forceRefresh) {
  if (!forceRefresh && tokenState.accessToken && Date.now() < tokenState.expiresAt - TOKEN_REFRESH_MARGIN_MS) {
    return tokenState.accessToken;
  }
  if (tokenState.inflight) return tokenState.inflight;

  tokenState.inflight = fetchFreshToken()
    .then((fresh) => {
      tokenState.accessToken = fresh.accessToken;
      tokenState.expiresAt = fresh.expiresAt;
      return fresh.accessToken;
    })
    .finally(() => {
      tokenState.inflight = null;
    });

  return tokenState.inflight;
}

function invalidateToken() {
  tokenState.accessToken = null;
  tokenState.expiresAt = 0;
}

/* ── Quran Foundation content proxy ─────────────────────────────── */
function proxyPathFromURL(pathname) {
  const marker = "/api/qf/";
  const at = pathname.indexOf(marker);
  if (at !== 0) return null;
  let suffix = pathname.slice(marker.length);
  if (!suffix) return null;

  /* Accept both /api/qf/content/api/v4/... and /api/qf/... shorthand. */
  if (!suffix.startsWith("content/api/v4/")) {
    suffix = `content/api/v4/${suffix.replace(/^\/+/, "")}`;
  }
  const full = `/${suffix.replace(/\/+/g, "/")}`;
  if (!full.startsWith(CONTENT_PREFIX)) return null;
  if (full.includes("/../") || full.includes("/./") || full.endsWith("/..")) return null;
  return full;
}

async function fetchContent(pathname, searchParams, isRetry) {
  const qfPath = proxyPathFromURL(pathname);
  if (!qfPath) {
    const err = new Error("Unsupported Quran Foundation route.");
    err.status = 400;
    throw err;
  }

  const cacheKey = `${qfPath}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const cached = apiCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() && !isRetry) return cached.payload;

  const token = await getAccessToken(Boolean(isRetry));
  const query = searchParams.toString();
  const url = `${qfConfig.api}${qfPath}${query ? `?${query}` : ""}`;
  const res = await requestJSON(url, {
    headers: {
      "x-auth-token": token,
      "x-client-id": CLIENT_ID,
      "User-Agent": USER_AGENT
    }
  });

  if (res.status === 401 && !isRetry) {
    invalidateToken();
    return fetchContent(pathname, searchParams, true);
  }

  /* QCF V4 word coordinates live in mushaf 19. Some prelive accounts
     do not expose it; serve the default word response instead so the
     browser never sees an upstream error or a blank reader. */
  if ((res.status === 404 || res.status >= 500) &&
      String(searchParams.get("mushaf")) === "19") {
    const fallback = new URLSearchParams(searchParams);
    fallback.delete("mushaf");
    return fetchContent(pathname, fallback, isRetry);
  }

  if (res.status < 200 || res.status >= 300) {
    const err = new Error(`Quran Foundation API returned ${res.status}.`);
    err.status = res.status >= 500 ? 502 : res.status;
    err.upstream = res.body.slice(0, 500);
    throw err;
  }

  const payload = res.json !== null
    ? res.json
    : { raw: res.body };
  apiCache.set(cacheKey, { payload, expiresAt: Date.now() + API_CACHE_TTL_MS });
  return payload;
}

/* ── Ayah audio resolver ────────────────────────────────────────── */
function normalizeAudioURL(value) {
  const url = String(value || "").trim();
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  return `${AUDIO_BASE}${url.replace(/^\/+/, "")}`;
}

async function resolveAyahAudio(searchParams) {
  const verseKey = String(searchParams.get("verse_key") || "").trim();
  const legacy = String(searchParams.get("legacy") || "").trim();
  const requested = Number(searchParams.get("reciter"));
  const global = Number(searchParams.get("global"));
  const safeGlobal = Number.isInteger(global) && global >= 1 && global <= 6236
    ? global : 1;
  let reciterId = Number.isInteger(requested) && requested > 0
    ? requested
    : (LEGACY_RECITERS[legacy] || 0);
  if (!reciterId && !AUDIO_FALLBACKS[legacy]) {
    reciterId = DEFAULT_RECITER_ID;
  }

  if (!/^\d{1,3}:\d{1,3}$/.test(verseKey)) {
    const err = new Error("A valid verse_key is required for audio.");
    err.status = 400;
    throw err;
  }

  const audioContext = { code: ayahAudioCode(verseKey), global: safeGlobal };
  let url = null;

  if (reciterId > 0 && !PREFER_FALLBACK.has(legacy)) {
    try {
      const params = new URLSearchParams();
      params.set("verse_key", verseKey);
      const payload = await fetchContent(
        `/api/qf/content/api/v4/quran/recitations/${reciterId}`, params, false
      );
      const files = payload && Array.isArray(payload.audio_files)
        ? payload.audio_files : [];
      const hit = files.find((file) =>
        String(file && file.verse_key) === verseKey) || files[0];
      url = normalizeAudioURL(hit && hit.url);
    } catch (err) {
      /* A catalog miss must not silence a reciter with a known CDN URL. */
      url = null;
    }
  }

  if ((!url || PREFER_FALLBACK.has(legacy)) && AUDIO_FALLBACKS[legacy]) {
    url = AUDIO_FALLBACKS[legacy](audioContext);
  }
  if (!url && AUDIO_FALLBACKS[reciterId]) {
    url = AUDIO_FALLBACKS[reciterId](audioContext);
  }
  if (!url) {
    const err = new Error("No audio file is available for this reciter and ayah.");
    err.status = 502;
    throw err;
  }
  return url;
}

/* ── Static files ───────────────────────────────────────────────── */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const DENIED_FILES = new Set(["server.js", ".env", ".env.example"]);

function sendJSON(res, status, payload, extraHeaders) {
  const body = JSON.stringify(payload);
  res.writeHead(status, Object.assign({
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  }, extraHeaders || {}));
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch (err) {
    res.writeHead(400);
    return res.end("Bad request");
  }
  if (decoded === "/") decoded = "/index.html";

  const filePath = path.resolve(ROOT, `.${decoded}`);
  const relative = path.relative(ROOT, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  if (DENIED_FILES.has(path.basename(filePath)) || path.basename(filePath).startsWith(".")) {
    res.writeHead(404);
    return res.end("Not found");
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Content-Length": stats.size,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff"
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ── HTTP server ────────────────────────────────────────────────── */
const server = http.createServer(async (req, res) => {
  let parsed;
  try {
    parsed = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  } catch (err) {
    return sendJSON(res, 400, { error: "Bad request" });
  }

  if (parsed.pathname === "/api/health") {
    return sendJSON(res, 200, {
      ok: true,
      environment: qfConfig === ENVIRONMENTS.production ? "production" : "prelive",
      credentialConfigured: Boolean(CLIENT_ID && CLIENT_SECRET)
    });
  }

  if (parsed.pathname === "/api/qf/audio") {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJSON(res, 405, { error: "Only GET requests are proxied." });
    }
    try {
      const url = await resolveAyahAudio(parsed.searchParams);
      res.writeHead(302, {
        "Location": url,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff"
      });
      return res.end();
    } catch (err) {
      const status = err.status || 502;
      return sendJSON(res, status, {
        error: err.message || "Quran Foundation audio proxy error.",
        environment: qfConfig === ENVIRONMENTS.production ? "production" : "prelive"
      });
    }
  }

  if (parsed.pathname.startsWith("/api/qf/")) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJSON(res, 405, { error: "Only GET requests are proxied." });
    }
    try {
      const payload = await fetchContent(parsed.pathname, parsed.searchParams, false);
      return sendJSON(res, 200, payload, {
        "Cache-Control": "private, max-age=300"
      });
    } catch (err) {
      const status = err.status || 502;
      return sendJSON(res, status, {
        error: err.message || "Quran Foundation proxy error.",
        environment: qfConfig === ENVIRONMENTS.production ? "production" : "prelive"
      });
    }
  }

  if (parsed.pathname.startsWith("/api/")) {
    return sendJSON(res, 404, { error: "Unknown API route." });
  }

  return serveStatic(req, res, parsed.pathname);
});

server.listen(PORT, () => {
  console.log(`Qur'an app: http://localhost:${PORT}`);
  console.log(`Quran Foundation environment: ${qfConfig === ENVIRONMENTS.production ? "production" : "prelive"}`);
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn("QF_CLIENT_ID / QF_CLIENT_SECRET are not set; /api/qf/* will fail until they are.");
  }
});
