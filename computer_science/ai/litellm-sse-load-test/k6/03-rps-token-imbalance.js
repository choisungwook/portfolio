import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';

const BASE_URL = __ENV.LITELLM_BASE_URL || 'http://localhost:4000';
const API_KEY = __ENV.LITELLM_API_KEY || 'sk-local-litellm-test';
const MODEL = __ENV.LITELLM_MODEL || 'local-qwen';

const shortDuration = new Trend('short_answer_duration', true);
const longDuration = new Trend('long_answer_duration', true);

export const options = {
  vus: 1,
  iterations: 6,
};

export default function () {
  const isLong = __ITER % 2 === 1;
  const maxTokens = isLong ? 180 : 20;
  const prompt = isLong
    ? `[long-${__ITER}] HTTP/1.1, HTTP/2, SSE, WebSocket의 차이를 항목별로 자세히 설명해 주세요.`
    : `[short-${__ITER}] HTTP 200 상태 코드의 뜻을 한 문장으로 답해 주세요.`;

  const payload = JSON.stringify({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
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

  check(res, { 'status is 200': (r) => r.status === 200 });

  if (isLong) {
    longDuration.add(res.timings.duration);
  } else {
    shortDuration.add(res.timings.duration);
  }
}
