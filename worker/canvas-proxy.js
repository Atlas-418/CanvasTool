// No fixed allowlist: different schools/resellers host Canvas under their
// own domains (instructure.com, k12.com, or something else entirely).
// Still block obviously-not-a-public-Canvas-instance targets (localhost,
// bare IPs, private/link-local ranges) so this can't be used as a generic
// SSRF proxy into internal networks.
const BLOCKED_DOMAIN = /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/i;
const VALID_HOSTNAME = /^[a-z0-9]([a-z0-9-]{0,62}\.)+[a-z]{2,}$/i;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, X-Canvas-Domain",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "GET") {
      return new Response("Only GET is supported", {
        status: 405,
        headers: CORS_HEADERS,
      });
    }

    const domain = request.headers.get("X-Canvas-Domain") || "";
    if (!VALID_HOSTNAME.test(domain) || BLOCKED_DOMAIN.test(domain)) {
      return new Response("Missing or invalid X-Canvas-Domain header", {
        status: 400,
        headers: CORS_HEADERS,
      });
    }

    const incomingUrl = new URL(request.url);
    const targetUrl = `https://${domain}${incomingUrl.pathname}${incomingUrl.search}`;

    const authorization = request.headers.get("Authorization") || "";

    const canvasResponse = await fetch(targetUrl, {
      headers: { Authorization: authorization },
    });

    const responseHeaders = new Headers(canvasResponse.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(key, value);
    }

    return new Response(canvasResponse.body, {
      status: canvasResponse.status,
      headers: responseHeaders,
    });
  },
};
