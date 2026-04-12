import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.TARGET_URL || 'http://localhost:8081';
const SEARCH_PATHS = [
  '/products/search?category=electronics&minPrice=200000&maxPrice=1800000&page=0&size=25',
  '/products/search?category=books&minPrice=10000&maxPrice=90000&page=0&size=25',
  '/products/search?category=clothing&minPrice=20000&maxPrice=250000&page=0&size=25',
  '/products/search?category=furniture&minPrice=50000&maxPrice=1800000&page=0&size=25',
];

export const options = {
  stages: [
    { duration: '5s', target: 10 },
    { duration: '10s', target: 25 },
    { duration: '5s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{endpoint:products-search}': ['p(95)<2000'],
    checks: ['rate>0.99'],
  },
};

function nextPath() {
  return SEARCH_PATHS[__ITER % SEARCH_PATHS.length];
}

export default function () {
  const res = http.get(`${BASE_URL}${nextPath()}`, {
    tags: { endpoint: 'products-search' },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  sleep(0.2);
}
