import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.TARGET_URL || 'http://app-no-warmup:8080';
const SEARCH_PATHS = [
  '/products/search?category=electronics&minPrice=200000&maxPrice=1800000&page=0&size=25',
  '/products/search?category=electronics&minPrice=800000&maxPrice=1800000&page=1&size=25',
  '/products/search?category=books&minPrice=10000&maxPrice=90000&page=0&size=25',
  '/products/search?category=clothing&minPrice=20000&maxPrice=250000&page=0&size=25',
  '/products/search?category=furniture&minPrice=50000&maxPrice=1800000&page=0&size=25',
  '/products/search?category=beauty&minPrice=5000&maxPrice=250000&page=0&size=25',
];

export const options = {
  scenarios: {
    startup_burst: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '3s', target: 40 },
        { duration: '12s', target: 40 },
        { duration: '3s', target: 0 },
      ],
      gracefulRampDown: '0s',
      exec: 'startupBurst',
      tags: { app: 'no-warmup' },
    },
  },
  thresholds: {
    'http_req_duration{endpoint:products-search}': ['p(95)<2000'],
    checks: ['rate>0.99'],
  },
};

function nextPath() {
  return SEARCH_PATHS[(__VU + __ITER) % SEARCH_PATHS.length];
}

export function startupBurst() {
  const res = http.get(`${BASE_URL}${nextPath()}`, {
    tags: { endpoint: 'products-search' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
