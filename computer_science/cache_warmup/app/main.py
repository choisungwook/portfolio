import time
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from prometheus_client import Histogram, Counter, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

LATENCY = Histogram(
  "request_latency_seconds",
  "Request latency",
  ["endpoint", "cache_status"],
  buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0],
)
REQUEST_COUNT = Counter(
  "request_total",
  "Total requests",
  ["endpoint", "cache_status"],
)

cache: dict[str, dict] = {}

PRODUCTS = {
  str(i): {
    "id": i,
    "name": f"Product-{i}",
    "price": round(10.0 + i * 1.5, 2),
    "description": f"Detailed description for product {i}",
  }
  for i in range(1, 101)
}


def simulate_db_query(product_id: str) -> dict | None:
  time.sleep(0.05)
  return PRODUCTS.get(product_id)


def warmup_cache():
  for pid, product in PRODUCTS.items():
    cache[pid] = product


@asynccontextmanager
async def lifespan(app: FastAPI):
  if app.state.enable_warmup:
    warmup_cache()
  yield
  cache.clear()


app = FastAPI(lifespan=lifespan)
app.state.enable_warmup = False


@app.get("/products/{product_id}")
async def get_product(product_id: str):
  start = time.perf_counter()

  if product_id in cache:
    latency = time.perf_counter() - start
    LATENCY.labels(endpoint="/products", cache_status="hit").observe(latency)
    REQUEST_COUNT.labels(endpoint="/products", cache_status="hit").inc()
    return {"data": cache[product_id], "cache": "hit", "latency_ms": round(latency * 1000, 2)}

  product = await asyncio.to_thread(simulate_db_query, product_id)
  if not product:
    return {"error": "not found"}, 404

  cache[product_id] = product
  latency = time.perf_counter() - start
  LATENCY.labels(endpoint="/products", cache_status="miss").observe(latency)
  REQUEST_COUNT.labels(endpoint="/products", cache_status="miss").inc()
  return {"data": product, "cache": "miss", "latency_ms": round(latency * 1000, 2)}


@app.get("/health")
async def health():
  return {"status": "ok", "cache_size": len(cache)}


@app.post("/admin/warmup")
async def manual_warmup():
  warmup_cache()
  return {"status": "warmed", "cache_size": len(cache)}


@app.post("/admin/clear-cache")
async def clear_cache():
  cache.clear()
  return {"status": "cleared"}


@app.get("/metrics")
async def metrics():
  return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
