import { check } from 'k6';
import http from 'k6/http';

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
    messages: [{
      role: 'user',
      content: `[req-${__VU}-${__ITER}] 쿠버네티스 Pod와 Deployment의 차이를 4문장으로 설명해 주세요.`,
    }],
    max_tokens: 100,
    temperature: 0.2,
    stream: false,
  });

  const response = http.post(`${BASE_URL}/v1/chat/completions`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    timeout: '60s',
  });

  check(response, {
    'status is 200': (res) => res.status === 200,
    'contains generated text': (res) =>
      res.status === 200 &&
      (res.headers['Content-Type'] || '').includes('application/json') &&
      Boolean(res.json('choices.0.message.content')),
  });
}
