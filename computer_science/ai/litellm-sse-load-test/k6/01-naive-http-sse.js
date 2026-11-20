import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.LITELLM_BASE_URL || 'http://localhost:4000';
const API_KEY = __ENV.LITELLM_API_KEY || 'sk-local-litellm-test';
const MODEL = __ENV.LITELLM_MODEL || 'local-qwen';

export const options = {
  vus: 2,
  iterations: 6,
};

export default function () {
  const payload = JSON.stringify({
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: `[req-${__VU}-${__ITER}] 쿠버네티스 Pod와 Deployment의 차이를 4문장으로 설명해 주세요.`,
      },
    ],
    max_tokens: 100,
    temperature: 0.2,
    stream: true,
  });

  const res = http.post(`${BASE_URL}/v1/chat/completions`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    timeout: '60s',
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'content-type is text/event-stream': (r) =>
      (r.headers['Content-Type'] || '').includes('text/event-stream'),
  });

  if (__VU === 1 && __ITER === 0) {
    const lines = res.body.split('\n').filter((l) => l.startsWith('data:'));
    console.log(
      `[샘플 1건] http_req_waiting(TTFB)=${res.timings.waiting.toFixed(1)}ms, ` +
        `http_req_receiving=${res.timings.receiving.toFixed(1)}ms, ` +
        `http_req_duration(E2E)=${res.timings.duration.toFixed(1)}ms, ` +
        `SSE data 라인 수=${lines.length}`
    );
  }
}
