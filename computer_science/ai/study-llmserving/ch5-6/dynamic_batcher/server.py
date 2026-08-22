"""Serve a small language model with max batch size and max delay controls."""

import asyncio
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass

import torch
from fastapi import FastAPI
from prometheus_client import Counter, Gauge, Histogram, make_asgi_app
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer


def default_device() -> str:
  """Select the first available accelerator."""
  if torch.cuda.is_available():
    return "cuda"
  if torch.backends.mps.is_available():
    return "mps"
  return "cpu"


MODEL_ID = os.getenv("DYNAMIC_MODEL_ID", "Qwen/Qwen2.5-0.5B-Instruct")
DEVICE = os.getenv("DEVICE", default_device())
MAX_BATCH_SIZE = int(os.getenv("MAX_BATCH_SIZE", "4"))
MAX_DELAY_MS = int(os.getenv("MAX_DELAY_MS", "20"))
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "64"))
METRIC_LABELS = ["max_batch_size", "max_delay_ms"]
METRIC_VALUES = [str(MAX_BATCH_SIZE), str(MAX_DELAY_MS)]

REQUESTS = Counter("dynamic_requests_total", "Completed requests", METRIC_LABELS)
INPUT_TOKENS = Counter("dynamic_input_tokens_total", "Processed input tokens", METRIC_LABELS)
OUTPUT_TOKENS = Counter("dynamic_output_tokens_total", "Generated output tokens", METRIC_LABELS)
QUEUE_DEPTH = Gauge("dynamic_queue_depth", "Queued requests", METRIC_LABELS)
BATCH_SIZE = Histogram(
  "dynamic_batch_size",
  "Actual batch size",
  METRIC_LABELS,
  buckets=(1, 2, 4, 8, 16, 32),
)
QUEUE_DELAY = Histogram(
  "dynamic_queue_delay_seconds",
  "Time spent waiting for a batch",
  METRIC_LABELS,
  buckets=(0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1),
)
BATCH_DURATION = Histogram(
  "dynamic_batch_duration_seconds",
  "Model generation time per batch",
  METRIC_LABELS,
  buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30),
)
REQUEST_LATENCY = Histogram(
  "dynamic_request_latency_seconds",
  "End-to-end request latency",
  METRIC_LABELS,
  buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30),
)


class GenerateRequest(BaseModel):
  """Describe one generation request."""

  prompt: str


@dataclass
class PendingRequest:
  """Store a queued request and its completion future."""

  prompt: str
  enqueued_at: float
  future: asyncio.Future[dict[str, object]]


class ModelRunner:
  """Run one real Hugging Face model on CUDA or MPS."""

  def __init__(self) -> None:
    """Load the tokenizer and model into the selected device."""
    dtype = {
      "cuda": torch.bfloat16,
      "mps": torch.float16,
      "cpu": torch.float32,
    }[DEVICE]
    self.tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    self.tokenizer.pad_token = self.tokenizer.eos_token
    self.tokenizer.padding_side = "left"
    self.model = AutoModelForCausalLM.from_pretrained(MODEL_ID, dtype=dtype)
    self.model.to(DEVICE)
    self.model.eval()

  def generate(self, prompts: list[str]) -> tuple[list[str], list[int], list[int]]:
    """Generate one output per prompt as a true model batch."""
    encoded = self.tokenizer(prompts, return_tensors="pt", padding=True)
    input_tokens = encoded["attention_mask"].sum(dim=1).tolist()
    encoded = {name: tensor.to(DEVICE) for name, tensor in encoded.items()}
    with torch.inference_mode():
      generated = self.model.generate(
        **encoded,
        do_sample=False,
        max_new_tokens=MAX_NEW_TOKENS,
        pad_token_id=self.tokenizer.eos_token_id,
      )
    new_tokens = generated[:, encoded["input_ids"].shape[1] :]
    output_tokens = [int((tokens != self.tokenizer.pad_token_id).sum()) for tokens in new_tokens]
    texts = self.tokenizer.batch_decode(new_tokens, skip_special_tokens=True)
    return texts, [int(value) for value in input_tokens], output_tokens


class DynamicBatcher:
  """Collect requests until max batch size or max delay is reached."""

  def __init__(self, runner: ModelRunner) -> None:
    """Initialize an empty request queue."""
    self.runner = runner
    self.queue: asyncio.Queue[PendingRequest] = asyncio.Queue()

  async def submit(self, prompt: str) -> dict[str, object]:
    """Queue one prompt and wait for its generated result."""
    loop = asyncio.get_running_loop()
    future: asyncio.Future[dict[str, object]] = loop.create_future()
    pending = PendingRequest(prompt, time.perf_counter(), future)
    await self.queue.put(pending)
    QUEUE_DEPTH.labels(*METRIC_VALUES).set(self.queue.qsize())
    return await future

  async def run(self) -> None:
    """Continuously create and execute dynamic batches."""
    while True:
      first = await self.queue.get()
      batch = await self._collect(first)
      QUEUE_DEPTH.labels(*METRIC_VALUES).set(self.queue.qsize())
      await self._execute(batch)

  async def _collect(self, first: PendingRequest) -> list[PendingRequest]:
    """Collect requests until one dispatch condition is met."""
    batch = [first]
    deadline = first.enqueued_at + MAX_DELAY_MS / 1000
    while len(batch) < MAX_BATCH_SIZE:
      remaining = deadline - time.perf_counter()
      if remaining <= 0:
        break
      try:
        batch.append(await asyncio.wait_for(self.queue.get(), timeout=remaining))
      except TimeoutError:
        break
    return batch

  async def _execute(self, batch: list[PendingRequest]) -> None:
    """Execute one batch and complete every waiting future."""
    started = time.perf_counter()
    queue_delays = [started - request.enqueued_at for request in batch]
    texts, input_tokens, output_tokens = await asyncio.to_thread(
      self.runner.generate,
      [request.prompt for request in batch],
    )
    batch_duration = time.perf_counter() - started
    BATCH_SIZE.labels(*METRIC_VALUES).observe(len(batch))
    BATCH_DURATION.labels(*METRIC_VALUES).observe(batch_duration)
    for index, request in enumerate(batch):
      latency = time.perf_counter() - request.enqueued_at
      QUEUE_DELAY.labels(*METRIC_VALUES).observe(queue_delays[index])
      REQUEST_LATENCY.labels(*METRIC_VALUES).observe(latency)
      REQUESTS.labels(*METRIC_VALUES).inc()
      INPUT_TOKENS.labels(*METRIC_VALUES).inc(input_tokens[index])
      OUTPUT_TOKENS.labels(*METRIC_VALUES).inc(output_tokens[index])
      request.future.set_result(
        {
          "text": texts[index],
          "batch_size": len(batch),
          "queue_delay_ms": queue_delays[index] * 1000,
          "batch_duration_ms": batch_duration * 1000,
          "latency_ms": latency * 1000,
          "input_tokens": input_tokens[index],
          "output_tokens": output_tokens[index],
        }
      )


@asynccontextmanager
async def lifespan(app: FastAPI):
  """Load the model and run the batching loop for the app lifetime."""
  runner = await asyncio.to_thread(ModelRunner)
  batcher = DynamicBatcher(runner)
  app.state.batcher = batcher
  task = asyncio.create_task(batcher.run())
  yield
  task.cancel()


app = FastAPI(lifespan=lifespan)
app.mount("/metrics", make_asgi_app())


@app.get("/health")
async def health() -> dict[str, object]:
  """Return server readiness and active batching configuration."""
  return {
    "status": "ok",
    "model": MODEL_ID,
    "device": DEVICE,
    "max_batch_size": MAX_BATCH_SIZE,
    "max_delay_ms": MAX_DELAY_MS,
  }


@app.post("/generate")
async def generate(request: GenerateRequest) -> dict[str, object]:
  """Generate text through the dynamic batcher."""
  return await app.state.batcher.submit(request.prompt)
