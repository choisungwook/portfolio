import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

/**
 * 시나리오 3: 혼합 부하 테스트
 *
 * allocate + hold를 동시에 호출하여 실제 워크로드에 가까운 상황을 재현한다.
 * 이 시나리오에서 Xms/Xmx 차이가 가장 극적으로 드러난다.
 *
 * Xms < Xmx: 힙 확장 + 메모리 점유가 겹치면서 Full GC가 발생할 수 있음
 * Xms == Xmx: 힙이 이미 확보되어 있으므로 GC만 관리하면 됨
 *
 * 사용법:
 *   k6 run --env TARGET=http://localhost:30081 k6/scenario3-mixed.js
 *   k6 run --env TARGET=http://localhost:30082 k6/scenario3-mixed.js
 */

const BASE_URL = __ENV.TARGET || 'http://localhost:8080';

export const options = {
  scenarios: {
    allocate: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '1m',  target: 40 },
        { duration: '30s', target: 60 },
        { duration: '30s', target: 0 },
      ],
      exec: 'allocateTest',
    },
    hold: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 15 },
        { duration: '1m',  target: 30 },
        { duration: '30s', target: 50 },
        { duration: '30s', target: 0 },
      ],
      exec: 'holdTest',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.10'],
  },
};

export function allocateTest() {
  const res = http.get(`${BASE_URL}/allocate?sizeMb=10&count=30`);
  check(res, {
    'allocate: status 200': (r) => r.status === 200,
  });
  sleep(0.1);
}

export function holdTest() {
  const res = http.get(`${BASE_URL}/hold?sizeMb=5&holdMs=300`);
  check(res, {
    'hold: status 200': (r) => r.status === 200,
  });
  sleep(0.2);
}
