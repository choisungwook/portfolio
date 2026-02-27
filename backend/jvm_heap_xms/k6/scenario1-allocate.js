import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

/**
 * 시나리오 1: allocate & release 부하 테스트
 *
 * 대량의 객체를 할당하고 즉시 해제하는 패턴.
 * Xms < Xmx 환경에서는 힙이 작은 크기에서 시작하므로
 * 할당 시마다 힙 확장(heap resizing)과 GC가 빈번하게 발생한다.
 *
 * 비교 대상:
 *   - Xms == Xmx (port 30081): 힙 리사이징 없음 → 안정적인 응답 시간
 *   - Xms < Xmx  (port 30082): 힙 리사이징 발생 → 응답 시간 불안정, p99 증가
 *
 * 사용법:
 *   k6 run --env TARGET=http://localhost:30081 k6/scenario1-allocate.js
 *   k6 run --env TARGET=http://localhost:30082 k6/scenario1-allocate.js
 */

const BASE_URL = __ENV.TARGET || 'http://localhost:8080';

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp-up
    { duration: '1m',  target: 50 },   // sustained load
    { duration: '30s', target: 100 },  // peak load
    { duration: '30s', target: 0 },    // ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<3000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'],
  },
};

export default function () {
  // sizeMb=10, count=50 → 반복적으로 10MB 배열 50회 할당/해제
  const res = http.get(`${BASE_URL}/allocate?sizeMb=10&count=50`);
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response has elapsedMs': (r) => JSON.parse(r.body).elapsedMs !== undefined,
  });
  sleep(0.1);
}
