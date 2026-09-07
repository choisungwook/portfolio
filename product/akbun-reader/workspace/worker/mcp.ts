import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { version } from '../package.json';
import type { Env } from './index';
import { documents, getDocument } from './documents';
import { HttpError, readJson, tags } from './http';
import { listTags } from './tags';

const tagSchema = z.array(z.string().trim().min(1).max(80)).max(30);
const idSchema = z.string().uuid();
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export async function mcp(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { allow: 'POST', 'cache-control': 'no-store' } });
  }
  const input = await readJson(request);
  const server = new McpServer({ name: 'akbun-reader', version });
  async function result(action: () => Promise<unknown>) {
    try {
      return { content: [{ type: 'text' as const, text: JSON.stringify(await action()) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text' as const, text: error instanceof HttpError ? error.message : '도구 실행에 실패했습니다.' }] };
    }
  }
  function api(path: string, method: string, body: unknown) {
    return new Request(new URL(`/api/documents${path}`, request.url), {
      method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
  }
  server.registerTool('search_documents', {
    description: '제목·URL·본문에서 문서 검색. offset으로 다음 페이지 조회.',
    inputSchema: { query: z.string().max(200).default(''), offset: z.number().int().min(0).max(1000000).default(0) },
    annotations: readOnly,
  }, ({ query, offset }) => result(async () => {
    const rows = await env.DB.prepare(`SELECT id, title, normalized_url, location, tags_json FROM documents
      WHERE instr(lower(title), lower(?)) > 0 OR instr(lower(normalized_url), lower(?)) > 0
      OR instr(lower(body), lower(?)) > 0 ORDER BY created_at DESC, id DESC LIMIT 51 OFFSET ?`)
      .bind(query, query, query, offset).all();
    return { documents: rows.results.slice(0, 50).map(({ tags_json, ...row }) => ({ ...row, tags: JSON.parse(String(tags_json)) })),
      next_offset: rows.results.length > 50 ? offset + 50 : null };
  }));
  server.registerTool('get_document', {
    description: '문서 번호로 본문과 메타데이터 조회.', inputSchema: { id: idSchema }, annotations: readOnly,
  }, ({ id }) => result(() => getDocument(id, env)));
  server.registerTool('save_url', {
    description: 'URL 저장. 같은 URL은 기존 문서 반환, 본문 추출은 비동기 실행.',
    inputSchema: { url: z.string().min(1).max(4000), title: z.string().min(1).max(500).optional(), tags: tagSchema.default([]) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, input => result(async () => {
    const response = await documents(api('', 'POST', input), env, ctx);
    return response.json();
  }));
  server.registerTool('add_tags', {
    description: '기존 태그를 유지하며 추가. version은 get_document 결과 사용. 충돌 시 다시 조회.',
    inputSchema: { id: idSchema, version: z.number().int().positive(), tags: tagSchema },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, ({ id, version, tags: added }) => result(async () => {
    const current = await getDocument(id, env);
    if (current.version !== version) throw new HttpError(409, '문서가 변경되었습니다. 다시 조회하세요.');
    const response = await documents(api(`/${id}`, 'PATCH', { version, tags: tags([...new Set([...current.tags, ...added])]) }), env, ctx);
    return response.json();
  }));
  server.registerTool('list_tags', {
    description: '보관함의 태그와 문서 수 조회.', inputSchema: {}, annotations: readOnly,
  }, () => result(() => listTags(env)));
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(request, { parsedBody: input });
    response.headers.set('cache-control', 'no-store');
    return response;
  } finally {
    await server.close();
  }
}
