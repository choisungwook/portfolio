import sse from 'k6/x/sse';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.LITELLM_BASE_URL || 'http://localhost:4000';
const API_KEY = __ENV.LITELLM_API_KEY || 'sk-local-litellm-test';
const MODEL = __ENV.LITELLM_MODEL || 'local-qwen';

const llmTtft = new Trend('llm_ttft', true);
const llmTpot = new Trend('llm_tpot', true);
const llmE2e = new Trend('llm_e2e', true);
const llmChunks = new Counter('llm_token_chunks');

export const options = {
  scenarios: {
    open_loop_sse: {
      executor: 'constant-arrival-rate',
      rate: 1,
      timeUnit: '2s',
      duration: '12s',
      preAllocatedVUs: 4,
      maxVUs: 10,
    },
  },
};

export default function () {
  const payload = JSON.stringify({
    model: MODEL,
    messages: [
      {
        role: 'user',
        content: `[sse-${__VU}-${__ITER}] 쿠버네티스 Pod와 Deployment의 차이를 4문장으로 설명해 주세요.`,
      },
    ],
    max_tokens: 100,
    temperature: 0.2,
    stream: true,
  });

  const params = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: payload,
  };

  const reqStart = Date.now();
  let firstTokenTime = null;
  let lastTokenTime = null;
  let tokenCount = 0;

  const res = sse.open(`${BASE_URL}/v1/chat/completions`, params, function (client) {
    client.on('event', function (event) {
      if (!event.data || event.data === '[DONE]') {
        client.close();
        return;
      }

      try {
        const parsed = JSON.parse(event.data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          const now = Date.now();
          if (firstTokenTime === null) {
            firstTokenTime = now;
            llmTtft.add(firstTokenTime - reqStart);
          }
          lastTokenTime = now;
          tokenCount += 1;
          llmChunks.add(1);
        }
      } catch (_err) {
        // 비JSON keep-alive 라인은 무시한다.
      }
    });

    client.on('error', function (e) {
      console.error(`SSE error: ${e.error()}`);
    });
  });

  const e2eMs = Date.now() - reqStart;
  llmE2e.add(e2eMs);
  if (firstTokenTime !== null && lastTokenTime !== null && tokenCount > 1) {
    llmTpot.add((lastTokenTime - firstTokenTime) / (tokenCount - 1));
  }

  check(res, {
    'status is 200': (r) => r && r.status === 200,
  });
}
