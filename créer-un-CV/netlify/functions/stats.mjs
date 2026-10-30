import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "cv_admin";
const SESSION_SECONDS = 8 * 60 * 60;
const EVENT_TYPES = new Set(["visit", "link_click", "cv_modified", "download"]);
const NO_STORE = "no-store";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": NO_STORE,
      ...extraHeaders
    }
  });
}

function timingSafeTextEqual(left, right) {
  const leftHash = createHmac("sha256", "cv-statistics-compare").update(left).digest();
  const rightHash = createHmac("sha256", "cv-statistics-compare").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function adminConfiguration() {
  const username = process.env.CV_ADMIN_USERNAME;
  const password = process.env.CV_ADMIN_PASSWORD;
  const sessionSecret = process.env.CV_ADMIN_SESSION_SECRET;
  if (!username || !password || password.length < 16 || !sessionSecret || sessionSecret.length < 32) {
    return null;
  }
  return { username, password, sessionSecret };
}

function signSession(expiration, secret) {
  return createHmac("sha256", secret).update("admin:" + expiration).digest("base64url");
}

function cookieValue(request) {
  const cookies = request.headers.get("cookie") || "";
  const entry = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(COOKIE_NAME + "="));
  return entry ? entry.slice(COOKIE_NAME.length + 1) : "";
}

function isAdmin(request, secret) {
  const [expirationText, suppliedSignature] = cookieValue(request).split(".");
  const expiration = Number(expirationText);
  if (!Number.isSafeInteger(expiration) || expiration <= Math.floor(Date.now() / 1000) || !suppliedSignature) {
    return false;
  }
  const expected = signSession(expiration, secret);
  const supplied = Buffer.from(suppliedSignature);
  const actual = Buffer.from(expected);
  return supplied.length === actual.length && timingSafeEqual(supplied, actual);
}

function cookieHeader(request, value, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return COOKIE_NAME + "=" + value + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=" + maxAge + secure;
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 2048) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function validSessionId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function trackEvent(request) {
  const body = await readJson(request);
  if (!body || !EVENT_TYPES.has(body.type)) return json({ error: "Événement invalide." }, 400);
  if (!validSessionId(body.sessionId)) {
    return json({ error: "Session invalide." }, 400);
  }

  const day = new Date().toISOString().slice(0, 10);
  const store = getStore("cv-statistics");
  await store.set("events/" + day + "/" + body.type + "/" + body.sessionId, "1");
  return json({ ok: true }, 202);
}

async function readStats() {
  const store = getStore("cv-statistics");
  const totals = { visit: 0, link_click: 0, cv_modified: 0, download: 0 };
  for await (const page of store.list({ prefix: "events/", paginate: true })) {
    for (const blob of page.blobs) {
      const match = /^events\/\d{4}-\d{2}-\d{2}\/(visit|link_click|cv_modified|download)\//.exec(blob.key);
      if (match) totals[match[1]] += 1;
    }
  }
  return {
    visits: totals.visit,
    linkClicks: totals.link_click,
    modifiedSessions: totals.cv_modified,
    downloads: totals.download
  };
}

export default async function handler(request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const origin = request.headers.get("origin");
  if (origin && origin !== url.origin) return json({ error: "Origine refusée." }, 403);

  try {
    if (request.method === "POST" && action === "track") {
      return await trackEvent(request);
    }

    const config = adminConfiguration();
    if (!config) return json({ error: "Configuration administrateur manquante ou trop faible." }, 503);

    if (request.method === "POST" && action === "login") {
      const body = await readJson(request);
      if (!body || typeof body.username !== "string" || typeof body.password !== "string" ||
          body.username.length > 128 || body.password.length > 256) {
        return json({ error: "Identifiants invalides." }, 400);
      }
      if (!timingSafeTextEqual(body.username, config.username) || !timingSafeTextEqual(body.password, config.password)) {
        return json({ error: "Identifiant ou mot de passe incorrect." }, 401);
      }
      const expiration = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
      const token = expiration + "." + signSession(expiration, config.sessionSecret);
      return json({ ok: true }, 200, {
        "Set-Cookie": cookieHeader(request, token, SESSION_SECONDS)
      });
    }

    if (request.method === "GET" && action === "stats") {
      if (!isAdmin(request, config.sessionSecret)) return json({ error: "Authentification requise." }, 401);
      return json(await readStats());
    }

    if (request.method === "POST" && action === "logout") {
      return json({ ok: true }, 200, { "Set-Cookie": cookieHeader(request, "", 0) });
    }

    return json({ error: "Route introuvable." }, 404);
  } catch (error) {
    console.error("Erreur du service de statistiques.", error);
    return json({ error: "Le service de statistiques est temporairement indisponible." }, 500);
  }
}
