import http from 'k6/http';
import { check } from 'k6';

// Ramp VUs against one endpoint and watch which resource saturates first.
// TARGET picks the bottleneck to probe:
//   /api/db          - Hikari pool and Tomcat threads fill up, CPU stays low
//   /api/cpu         - container CPU pins at 100%, pools stay idle
//   /api/product/1   - cache hit path; misses land on the DB when TTL expires
const target = __ENV.TARGET || '/api/db';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 30 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get(`${__ENV.BASE_URL || 'http://localhost:8080'}${target}`);
  check(res, { 'status is 200': (r) => r.status === 200 });
}
