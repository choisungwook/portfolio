import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10, // Number of virtual users
  duration: '30s', // Duration of the test
  // thresholds: {
  //   http_req_failed: ['rate<0.01'], // http errors should be less than 1%
  //   http_req_duration: ['p(95)<200'], // 95% of requests should be below 200ms
  // },
};

const BASE_URL = 'http://localhost:30080';

export default function () {
  const res = http.get(`${BASE_URL}/hello`);

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(1); // Wait for 1 second between requests
}
