import { getMcpAccess } from "./server/auth";
import { handleApi } from "./server/http";
import { createPantryMcpHandler } from "./server/mcp";
import {
  assertDatabaseHealthy,
  countEventTombstones,
  pruneInventoryEvents,
} from "./server/repository";
import type { PantryEnv } from "./server/types";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
].join("; ");

function secured(response: Response, includeCsp = false): Response {
  const result = new Response(response.body, response);
  result.headers.set("X-Content-Type-Options", "nosniff");
  result.headers.set("Referrer-Policy", "no-referrer");
  result.headers.set("Permissions-Policy", "camera=(), geolocation=(), microphone=()");
  result.headers.set("X-Frame-Options", "DENY");
  if (includeCsp) result.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return result;
}

function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      error: { code: "unauthorized", message: "A valid bearer token is required" },
    }),
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "WWW-Authenticate": 'Bearer realm="pantry-pulse-mcp"',
      },
    },
  );
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const startedAt = Date.now();
    const requestId = request.headers.get("CF-Ray") ?? crypto.randomUUID();
    const url = new URL(request.url);
    let response: Response;

    try {
      if (url.pathname === "/health") {
        try {
          await assertDatabaseHealthy(env.DB);
          response = Response.json({
            status: "ok",
            service: "pantry-pulse",
            time: new Date().toISOString(),
          });
        } catch (error) {
          console.error("D1 health check failed", error);
          response = Response.json(
            { status: "unavailable", service: "pantry-pulse" },
            { status: 503 },
          );
        }
      } else if (url.pathname.startsWith("/api/")) {
        response = await handleApi(request, env);
      } else if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
        const access = await getMcpAccess(request, env);
        if (!access) {
          response = unauthorized();
        } else {
          response = await createPantryMcpHandler(env, access)(request, env, ctx);
        }
      } else {
        response = secured(await env.ASSETS.fetch(request), true);
      }
    } catch (error) {
      console.error("Unhandled Pantry Pulse request error", {
        requestId,
        pathname: url.pathname,
        error,
      });
      response = Response.json(
        { error: { code: "internal_error", message: "Unexpected server error" } },
        { status: 500 },
      );
    }

    response = secured(response);
    response.headers.set("X-Request-ID", requestId);
    console.info("request", {
      requestId,
      method: request.method,
      pathname: url.pathname,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  },
  scheduled(_controller, env, ctx): void {
    ctx.waitUntil(
      pruneInventoryEvents(env.DB).then(async (removed) => {
        const tombstoneCount = await countEventTombstones(env.DB);
        console.info("inventory event retention", { removed, retentionDays: 90, tombstoneCount });
      }),
    );
  },
} satisfies ExportedHandler<PantryEnv>;
