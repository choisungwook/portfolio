import http from 'k6/http';
import { check, sleep, fail } from 'k6';

/**
 * k6 스크립트: GET /users/{user_id}/posts 엔드포인트 부하 테스트
 *
 * 이 스크립트는 특정 사용자가 작성한 게시글 목록을 조회하는 API에 부하를 발생시킵니다.
 * 데이터베이스 인덱스 (posts.author_id) 적용 전/후 성능 비교에 사용될 수 있습니다.
 *
 * 사전 준비:
 * 1. Docker Compose 환경 실행 (FastAPI 앱, MySQL DB 등)
 * 2. MySQL DB에 사용자(users) 및 게시글(posts) 데이터 생성 완료
 * 3. 스크립트 내 MAX_USER_ID 값을 실제 생성된 사용자 수에 맞게 조정 (선택 사항)
 *
 * 실행 방법:
 * 1. (인덱스 X 테스트) MySQL에서 `DROP INDEX idx_posts_author_id ON posts;` 실행 (존재 시)
 * 2. 터미널에서 `k6 run loadtest_user_posts.js` 실행 및 결과 기록
  export K6_INFLUXDB_ORGANIZATION='my_org'
  export K6_INFLUXDB_BUCKET='k6_results'
  export K6_INFLUXDB_TOKEN='password1234'
 * 3. (인덱스 O 테스트) MySQL에서 `CREATE INDEX idx_posts_author_id ON posts(author_id);` 실행
 * 4. 터미널에서 `k6 run loadtest_user_posts.js` 실행 및 결과 기록
 * 5. 두 결과 비교 (특히 http_req_duration)
 */

// --- 설정 ---
const BASE_URL = 'http://localhost:8000'; // 로컬에서 실행 중인 FastAPI 앱 주소
const MAX_USER_ID = 1000; // 생성된 총 사용자 수 (generate_data.py의 NUM_USERS 값과 일치)
const POSTS_LIMIT = 50; // API 호출 시 가져올 게시글 수
// --- 설정 끝 ---

export const options = {
  // 부하 시나리오 설정 (예시)
  stages: [
    { duration: '10s', target: 3000 }, // 30초 동안 사용자를 N명까지 서서히 늘림 (Ramp-up)
    { duration: '10s', target: 3000 },  // 1분 동안 사용자 N명 유지 (Sustained load)
    { duration: '10s', target: 0 },  // 10초 동안 사용자 0명으로 줄임 (Ramp-down)
  ],
  // 성능 임계값 설정 (예시 - 필요에 따라 조정)
  thresholds: {
    // http_req_duration: ['p(95)<500'], // 95% 요청은 500ms 안에 처리되어야 함 (인덱스 없을 때 실패 예상)
    http_req_duration: ['p(95)<500'], // 임계값을 조금 더 넉넉하게 설정 (테스트 후 조정)
    http_req_failed: ['rate<0.01'],   // 요청 실패율은 1% 미만이어야 함
    checks: ['rate>0.99'],           // 성공적인 check 비율은 99% 이상이어야 함
  },
};

export default function () {
  // 1. 테스트할 무작위 사용자 ID 생성 (1 ~ MAX_USER_ID)
  if (MAX_USER_ID <= 0) {
    fail('MAX_USER_ID must be greater than 0'); // MAX_USER_ID 유효성 검사
  }
  const userId = Math.floor(Math.random() * MAX_USER_ID) + 1;

  // 2. API 요청 URL 구성
  const url = `${BASE_URL}/users/${userId}/posts?limit=${POSTS_LIMIT}`;

  // 3. HTTP GET 요청 보내기
  const params = {
    tags: { name: 'GetUserPosts' }, // k6 결과에서 이 요청을 식별하기 위한 태그
  };
  const res = http.get(url, params);

  // 4. 응답 검증 (Check)
  const checkRes = check(res, {
    'status is 200': (r) => r.status === 200,
    'response body is present': (r) => r.body != null,
    // 'response is an array': (r) => Array.isArray(r.json()), // 응답이 배열 형태인지 확인 (선택적)
  });

  // 5. 체크 실패 시 로그 남기기 (선택적)
  if (!checkRes) {
    console.error(`Request failed: ${res.status} ${res.body}`);
  }

  // 6. 다음 반복 전에 잠시 대기 (Think time)
  // 실제 사용자 행동을 모방하고 시스템에 과도한 부하를 순간적으로 주지 않기 위함
  sleep(1); // 1초 대기
}
