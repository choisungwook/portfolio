import http from 'k6/http';
import { check, sleep } from 'k6';

/**
 * 시나리오 2: allocate & hold 부하 테스트
 *
 * 메모리를 할당한 뒤 일정 시간 유지하는 패턴.
 * 동시 요청이 늘어나면 힙 사용량이 누적된다.
 *
 * Xms < Xmx 환경에서는:
 *   - 초기 힙이 작아 빠르게 소진됨
 *   - 힙 확장과 GC가 동시에 발생하며 stop-the-world 시간이 길어짐
 *   - 응답 시간의 jitter(변동폭)가 크게 증가
 *
 * Xms == Xmx 환경에서는:
 *   - 처음부터 전체 힙이 확보되어 있어 리사이징이 없음
 *   - GC는 발생하지만 힙 확장으로 인한 추가 비용이 없음
 *   - 응답 시간이 상대적으로 안정적
 *
 * 사용법:
 *   k6 run --env TARGET=http://localhost:30081 k6/scenario2-hold.js
 *   k6 run --env TARGET=http://localhost:30082 k6/scenario2-hold.js
 */

const BASE_URL = __ENV.TARGET || 'http://localhost:8080';

export const options = {
  stages: [
    { duration: '30s', target: 30 },   // ramp-up
    { duration: '1m',  target: 80 },   // sustained load (동시에 80명이 메모리를 점유)
    { duration: '30s', target: 150 },  // peak load
    { duration: '30s', target: 0 },    // ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.10'],
  },
};

export default function () {
  // sizeMb=5, holdMs=500 → 5MB를 500ms 동안 유지
  const res = http.get(`${BASE_URL}/hold?sizeMb=5&holdMs=500`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has elapsedMs': (r) => {
      try {
        return JSON.parse(r.body).elapsedMs !== undefined;
      } catch {
        return false;
      }
    },
  });
  sleep(0.2);
}
