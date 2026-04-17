import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const latencyTrend = new Trend("product_latency_ms");
const cacheHitRate = new Rate("cache_hit_rate");

const BASE_NO_WARMUP = __ENV.NO_WARMUP_URL || "http://localhost:30080";
const BASE_WITH_WARMUP = __ENV.WITH_WARMUP_URL || "http://localhost:30081";

export const options = {
  scenarios: {
    no_warmup: {
      executor: "constant-rate",
      rate: 20,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 50,
      exec: "testNoWarmup",
    },
    with_warmup: {
      executor: "constant-rate",
      rate: 20,
      timeUnit: "1s",
      duration: "60s",
      preAllocatedVUs: 50,
      exec: "testWithWarmup",
    },
  },
  thresholds: {
    "product_latency_ms{variant:with-warmup}": ["p(99)<50"],
    "product_latency_ms{variant:no-warmup}": ["p(99)<200"],
  },
};

function randomProductId() {
  return Math.floor(Math.random() * 100) + 1;
}

export function testNoWarmup() {
  const id = randomProductId();
  const res = http.get(`${BASE_NO_WARMUP}/products/${id}`, {
    tags: { variant: "no-warmup" },
  });
  check(res, { "status 200": (r) => r.status === 200 });

  const body = res.json();
  latencyTrend.add(body.latency_ms || 0, { variant: "no-warmup" });
  cacheHitRate.add(body.cache === "hit", { variant: "no-warmup" });
  sleep(0.1);
}

export function testWithWarmup() {
  const id = randomProductId();
  const res = http.get(`${BASE_WITH_WARMUP}/products/${id}`, {
    tags: { variant: "with-warmup" },
  });
  check(res, { "status 200": (r) => r.status === 200 });

  const body = res.json();
  latencyTrend.add(body.latency_ms || 0, { variant: "with-warmup" });
  cacheHitRate.add(body.cache === "hit", { variant: "with-warmup" });
  sleep(0.1);
}
