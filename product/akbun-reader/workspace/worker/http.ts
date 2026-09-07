export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export async function readJson(request: Request | Response): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    throw new HttpError(415, 'JSON 형식으로 요청하세요.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '요청 본문이 없습니다.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 128_000) { await reader.cancel(); throw new HttpError(413, '본문은 128KB 이하로 입력하세요.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new HttpError(400, '올바른 JSON 객체가 필요합니다.'); }
}

export function text(value: unknown, name: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new HttpError(400, `${name}: 1~${max}자 문자열이 필요합니다.`);
  }
  return value.trim();
}

export function tags(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 30) throw new HttpError(400, '태그는 30개 이하 배열이어야 합니다.');
  return [...new Set(value.map(item => text(item, '태그', 80).normalize('NFC')))];
}
