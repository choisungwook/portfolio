import ipaddr from 'ipaddr.js';

export const MAX_HTML_BYTES = 256_000;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);

export function isPublicAddress(address: string): boolean {
  try { return ipaddr.parse(address).range() === 'unicast'; } catch { return false; }
}

export function publicUrl(input: string): URL {
  const url = new URL(input);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) throw new Error('blocked_url');
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (ipaddr.isValid(host)) {
    if (!isPublicAddress(host)) throw new Error('blocked_url');
  } else if (!host.includes('.') || /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(host) || !/^[a-z0-9.-]+$/.test(host)) {
    throw new Error('blocked_url');
  }
  url.hash = '';
  return url;
}

export async function limitedText(response: Response, maxBytes: number): Promise<string> {
  if (Number(response.headers.get('content-length')) > maxBytes) {
    await response.body?.cancel(); throw new Error('response_too_large');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('empty_body');
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('response_too_large');
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return chunks.join('');
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
}

async function checkDns(url: URL, signal: AbortSignal, fetcher: typeof fetch): Promise<void> {
  const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (ipaddr.isValid(hostname)) return;
  const results = await Promise.all(['A', 'AAAA'].map(async type => {
    const query = new URL('https://cloudflare-dns.com/dns-query');
    query.searchParams.set('name', hostname); query.searchParams.set('type', type);
    const response = await fetcher(query, { headers: { accept: 'application/dns-json' }, redirect: 'manual', signal });
    if (!response.ok) { await response.body?.cancel(); throw new Error('dns_failed'); }
    const result = JSON.parse(await limitedText(response, 16_000));
    if (result.Status !== 0 || (result.Answer !== undefined && !Array.isArray(result.Answer))) throw new Error('dns_failed');
    return (result.Answer ?? []) as { type: number; data: string }[];
  }));
  const addresses = results.flat().filter(answer => answer.type === 1 || answer.type === 28);
  if (!addresses.length || addresses.some(answer => !isPublicAddress(answer.data))) throw new Error('blocked_dns');
}

export interface FetchTextOptions { accept: string; mediaTypes: string[]; maxBytes: number; fetcher?: typeof fetch }

export async function fetchText(input: string, options: FetchTextOptions): Promise<string> {
  const fetcher = options.fetcher ?? fetch;
  const signal = AbortSignal.timeout(8_000);
  let url = publicUrl(input);
  for (let redirects = 0; redirects <= 3; redirects++) {
    await checkDns(url, signal, fetcher);
    const response = await fetcher(url, {
      headers: { accept: options.accept, 'user-agent': 'akbun-reader/0.6' },
      redirect: 'manual', signal,
    });
    if (redirectStatuses.has(response.status)) {
      await response.body?.cancel();
      const target = response.headers.get('location');
      if (!target || redirects === 3) throw new Error('redirect_limit');
      const next = publicUrl(new URL(target, url).href);
      if (url.protocol === 'https:' && next.protocol !== 'https:') throw new Error('blocked_url');
      url = next; continue;
    }
    if (!response.ok) { await response.body?.cancel(); throw new Error('http_error'); }
    const contentType = response.headers.get('content-type') ?? '';
    const charset = contentType.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1].toLowerCase();
    const mediaType = contentType.split(';')[0].trim().toLowerCase();
    if (!options.mediaTypes.includes(mediaType) || (charset && !['utf-8', 'utf8', 'us-ascii'].includes(charset))) {
      await response.body?.cancel(); throw new Error('unsupported_content');
    }
    return limitedText(response, options.maxBytes);
  }
  throw new Error('redirect_limit');
}

export function fetchHtml(input: string, fetcher: typeof fetch = fetch): Promise<string> {
  return fetchText(input, { accept: 'text/html', mediaTypes: ['text/html'], maxBytes: MAX_HTML_BYTES, fetcher });
}
