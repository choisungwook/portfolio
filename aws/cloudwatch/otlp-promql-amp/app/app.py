# LLM gateway를 흉내 내는 demo app. 스스로 요청을 만들어 counter와 histogram을 /metrics로 노출한다.
# 외부 호출이 없어 비용 없이 model·team·status 조합의 series가 쌓인다.
import random
import time

from prometheus_client import Counter, Histogram, start_http_server

MODELS = {"model-a": 0.4, "model-b": 1.2, "model-c": 2.5}
TEAMS = ["search", "chat", "batch"]
FAIL_RATE = 0.05

requests_total = Counter("demo_requests", "처리한 요청 수", ["model", "team", "status"])
tokens_total = Counter("demo_tokens", "사용한 token 수", ["model", "team"])
latency = Histogram(
    "demo_request_duration_seconds",
    "요청 처리 시간",
    ["model"],
    buckets=[0.25, 0.5, 1, 2, 4, 8],
)


def simulate() -> None:
    while True:
        model = random.choice(list(MODELS))
        team = random.choice(TEAMS)
        status = "500" if random.random() < FAIL_RATE else "200"
        requests_total.labels(model, team, status).inc()
        if status == "200":
            tokens_total.labels(model, team).inc(random.randint(100, 1000))
        latency.labels(model).observe(random.expovariate(1 / MODELS[model]))
        time.sleep(0.2)


if __name__ == "__main__":
    start_http_server(8000)
    simulate()
