import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const latency = new Trend("product_latency_ms");

const BASE_NO_WARMUP = __ENV.NO_WARMUP_URL || "http://localhost:30080";
const BASE_WITH_WARMUP = __ENV.WITH_WARMUP_URL || "http://localhost:30081";

export const options = {
  scenarios: {
    no_warmup_spike: {
      executor: "ramping-rate",
      startRate: 5,
      timeUnit: "1s",
      stages: [
        { target: 5, duration: "10s" },
        { target: 100, duration: "5s" },
        { target: 100, duration: "30s" },
        { target: 5, duration: "10s" },
      ],
      preAllocatedVUs: 200,
      exec: "testNoWarmup",
    },
    with_warmup_spike: {
      executor: "ramping-rate",
      startRate: 5,
      timeUnit: "1s",
      stages: [
        { target: 5, duration: "10s" },
        { target: 100, duration: "5s" },
        { target: 100, duration: "30s" },
        { target: 5, duration: "10s" },
      ],
      preAllocatedVUs: 200,
      exec: "testWithWarmup",
    },
  },
};

function randomProductId() {
  return Math.floor(Math.random() * 100) + 1;
}

export function testNoWarmup() {
  const id = randomProductId();
  const res = http.get(`${BASE_NO_WARMUP}/products/${id}`);
  check(res, { "status 200": (r) => r.status === 200 });
  const body = res.json();
  latency.add(body.latency_ms || 0, { variant: "no-warmup" });
  sleep(0.05);
}

export function testWithWarmup() {
  const id = randomProductId();
  const res = http.get(`${BASE_WITH_WARMUP}/products/${id}`);
  check(res, { "status 200": (r) => r.status === 200 });
  const body = res.json();
  latency.add(body.latency_ms || 0, { variant: "with-warmup" });
  sleep(0.05);
}
