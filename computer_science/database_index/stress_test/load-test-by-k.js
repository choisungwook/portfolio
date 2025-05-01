import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 200 }, // 30초간 VU 20명까지 증가
    { duration: '1m', target: 200 },  // 1분간 VU 20명 유지
    { duration: '10s', target: 0 },  // 10초간 VU 0명으로 감소
  ],
  // thresholds: {
  //   http_req_failed: ['rate<0.01'],   // HTTP 실패율 1% 미만
  //   http_req_duration: ['p(95)<500'], // 95% 요청이 500ms 이내 완료 (전체 요청 기준)
  //   // 'by_k_duration': ['p(95)<600'], // 이 테스트는 by-k만 있으므로 http_req_duration과 유사
  // },
};

// 테스트 대상 기본 URL (환경에 맞게 수정)
const BASE_URL = 'http://localhost:30081';

// 각 가상 사용자(VU)가 실행할 로직
export default function () {
  // ================================================================
  // ▼▼▼ 테스트할 k 값을 여기에서 직접 수정하세요 ▼▼▼
  // ================================================================
  const targetK = 4992833; // 테스트에 사용할 고정 k 값
  // ================================================================


  // --- /query/by-k 호출 ---
  const url = `${BASE_URL}/query/by-k?k=${targetK}`;
  const params = {
    headers: { 'Accept': 'application/json' },
    // tags: { name: 'QueryByKFixed' } // 태그
  };
  const res = http.get(url, params);

  // 응답 검증
  check(res, {
    '[/query/by-k fixed] status is 200': (r) => r.status === 200,
  });

  sleep(1); // 다음 반복 시작 전 1초 대기
}
