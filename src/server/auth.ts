import { timingSafeEqual } from "node:crypto";
import type { McpAccess } from "./types";

const encoder = new TextEncoder();

async function secureEqual(candidate: string, expected: string): Promise<boolean> {
  const [candidateDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(candidate)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);

  return timingSafeEqual(new Uint8Array(candidateDigest), new Uint8Array(expectedDigest));
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");

  if (!authorization) return null;

  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());

  return match?.[1]?.trim() || null;
}

export async function hasAdminAccess(request: Request, env: Cloudflare.Env): Promise<boolean> {
  const candidate = bearerToken(request);

  return Boolean(candidate && env.ADMIN_TOKEN && (await secureEqual(candidate, env.ADMIN_TOKEN)));
}

export async function hasDeviceAccess(request: Request, env: Cloudflare.Env): Promise<boolean> {
  const candidate = bearerToken(request);

  return Boolean(candidate && env.DEVICE_TOKEN && (await secureEqual(candidate, env.DEVICE_TOKEN)));
}

export async function getMcpAccess(
  request: Request,
  env: Cloudflare.Env,
): Promise<McpAccess | null> {
  const candidate = bearerToken(request);

  if (!candidate) return null;

  if (env.MCP_WRITE_TOKEN && (await secureEqual(candidate, env.MCP_WRITE_TOKEN))) return "write";

  if (env.MCP_READ_TOKEN && (await secureEqual(candidate, env.MCP_READ_TOKEN))) return "read";

  return null;
}
