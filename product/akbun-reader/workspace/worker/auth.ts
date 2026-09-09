import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from './index';

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

export type Identity = 'browser' | 'token' | 'read-token';

export async function authenticate(request: Request, env: Env): Promise<Identity | null> {
  const authorization = request.headers.get('authorization');
  if (authorization) {
    if (!/^Bearer [a-f0-9]{64}$/.test(authorization)) return null;
    const token = await env.DB.prepare('SELECT scope FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL')
      .bind(await hashToken(authorization.slice(7))).first<{ scope: string }>();
    if (!token) return null;
    return token.scope === 'read' ? 'read-token' : 'token';
  }
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD || !env.ACCESS_OWNER_SUB) return null;
  try {
    const issuer = `https://${env.ACCESS_TEAM_DOMAIN}`;
    if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN)) return null;
    let keys = keySets.get(issuer);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
      keySets.set(issuer, keys);
    }
    const { payload } = await jwtVerify(request.headers.get('Cf-Access-Jwt-Assertion') ?? '', keys, {
      issuer, audience: env.ACCESS_AUD, algorithms: ['RS256'], requiredClaims: ['exp', 'sub'],
    });
    return payload.sub === env.ACCESS_OWNER_SUB ? 'browser' : null;
  } catch {
    return null;
  }
}
