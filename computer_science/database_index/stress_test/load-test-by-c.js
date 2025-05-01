import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 200 }, // 30초간 VU 20명까지 증가
    { duration: '1m', target: 200 },  // 1분간 VU 20명 유지
    { duration: '10s', target: 0 },  // 10초간 VU 0명으로 감소
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],   // HTTP 실패율 1% 미만
    http_req_duration: ['p(95)<500'], // 95% 요청이 500ms 이내 완료 (전체 요청 기준)
     // 'by_c_duration': ['p(95)<600'], // 이 테스트는 by-c만 있으므로 http_req_duration과 유사
  },
};

// 테스트 대상 기본 URL (환경에 맞게 수정)
const BASE_URL = 'http://localhost:30081';

// 각 가상 사용자(VU)가 실행할 로직
export default function () {
  // ================================================================
  // ▼▼▼ 테스트할 c 값을 여기에서 직접 수정하세요 ▼▼▼
  // ================================================================
  // 테스트에 사용할 고정 c 값
  const targetC = '48390703010-86598864691-64637430453-07798453484-65476315040-54917348605-67647960754-09421474354-95135043463-63332944892';
  // ================================================================


  // --- /query/by-c 호출 ---
  const url = `${BASE_URL}/query/by-c?c=${encodeURIComponent(targetC)}`; // c 값 인코딩
  const params = {
    headers: { 'Accept': 'application/json' },
    // tags: { name: 'QueryByCFixed' } // 태그
  };
  const res = http.get(url, params);

  // 응답 검증
  check(res, {
    '[/query/by-c fixed] status is 200': (r) => r.status === 200,
  });
  // Trend('by_c_duration').add(res.timings.duration); // Custom metric 필요 시 주석 해제

  sleep(1); // 다음 반복 시작 전 1초 대기
}
