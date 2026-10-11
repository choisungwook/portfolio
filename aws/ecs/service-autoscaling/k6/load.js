// Fixed request rate, independent of response time, so requests per task per minute is predictable.
// RATE=30 -> 1800 requests/minute -> 3 tasks at the 600 target.
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export const options = {
  scenarios: {
    load: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 30),
      timeUnit: '1s',
      duration: __ENV.DURATION || '10m',
      preAllocatedVUs: 20,
      // Room for extra VUs when latency rises, so the rate does not silently drop.
      maxVUs: 100,
    },
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/`);
  check(res, { 'status 200': (r) => r.status === 200 });
}
