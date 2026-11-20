import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.LITELLM_BASE_URL || 'http://localhost:4000';
const API_KEY = __ENV.LITELLM_API_KEY || 'sk-local-litellm-test';
const MODEL = __ENV.LITELLM_MODEL || 'local-qwen';
const MODE = __ENV.MODE || 'closed';

export const options =
  MODE === 'open'
    ? {
        scenarios: {
          open_loop: {
            executor: 'constant-arrival-rate',
            rate: 2,
            timeUnit: '1s',
            duration: '15s',
            preAllocatedVUs: 8,
            maxVUs: 20,
          },
        },
      }
    : {
        scenarios: {
          closed_loop: {
            executor: 'constant-vus',
            vus: 2,
            duration: '15s',
          },
        },
      };

export default function () {
  const payload = JSON.stringify({
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: `[${MODE}-${__VU}-${__ITER}] 마이크로서비스에서 API Gateway가 하는 역할을 3문장으로 설명해 주세요.`,
      },
    ],
    max_tokens: 90,
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
  });
}
