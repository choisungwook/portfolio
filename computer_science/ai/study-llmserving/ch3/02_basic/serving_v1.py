"""v1: one request = one prompt = one inference call."""

import logging
import multiprocessing as mp
import os
import threading
import time
import uuid
from datetime import datetime
from queue import Queue
from typing import Any

import torch
import uvicorn
from fastapi import Depends, FastAPI
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_NAME = os.getenv("MODEL_NAME", "facebook/opt-125m")
DEVICE = os.getenv("DEVICE", "cpu")
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "20"))


class IsoTimeFormatter(logging.Formatter):
  def formatTime(self, record, datefmt=None):
    return datetime.fromtimestamp(record.created).astimezone().isoformat(timespec="milliseconds")


def configure_logging() -> logging.Logger:
  logger = logging.getLogger("ch03.serving_v1")
  if logger.handlers:
    return logger
  handler = logging.StreamHandler()
  handler.setFormatter(
    IsoTimeFormatter(
      "%(asctime)s component=%(component)s event=%(event)s pid=%(process)d %(message)s"
    )
  )
  logger.addHandler(handler)
  logger.setLevel(logging.INFO)
  logger.propagate = False
  return logger


LOGGER = configure_logging()


def log_event(component: str, event: str, **fields: Any) -> None:
  details = " ".join(f"{key}={value}" for key, value in fields.items())
  LOGGER.info(details, extra={"component": component, "event": event})


class QueueMetrics:
  def __init__(self):
    self.queued_tasks = mp.Value("i", 0)
    self.processing_tasks = mp.Value("i", 0)
    self.completed_tasks = mp.Value("i", 0)

  @staticmethod
  def _change(counter, amount: int) -> int:
    with counter.get_lock():
      counter.value += amount
      return counter.value

  def enqueue(self) -> int:
    return self._change(self.queued_tasks, 1)

  def start_processing(self) -> tuple[int, int]:
    queued = self._change(self.queued_tasks, -1)
    processing = self._change(self.processing_tasks, 1)
    return queued, processing

  def complete(self) -> tuple[int, int]:
    processing = self._change(self.processing_tasks, -1)
    completed = self._change(self.completed_tasks, 1)
    return processing, completed

  def snapshot(self) -> dict[str, int]:
    return {
      "queued_tasks": self.queued_tasks.value,
      "processing_tasks": self.processing_tasks.value,
      "completed_tasks": self.completed_tasks.value,
      "pending_tasks": self.queued_tasks.value + self.processing_tasks.value,
    }


class ModelManager:
  def load_model(self, model_name: str):
    log_event("model_manager", "model_load_started", model=model_name)
    model = AutoModelForCausalLM.from_pretrained(model_name)
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
      tokenizer.pad_token = tokenizer.eos_token
    log_event("model_manager", "model_load_completed", model=model_name)
    return model, tokenizer


class ModelWorker:
  def __init__(self, model_name: str, device: str):
    self.device = device
    self.model, self.tokenizer = ModelManager().load_model(model_name)
    self.model.to(self.device)
    self.model.eval()
    log_event("model_worker", "worker_ready", model=model_name, device=device)

  def generate(self, prompts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    started = time.perf_counter()
    texts = [p["prompt"] for p in prompts]
    inputs = self.tokenizer(
      texts, return_tensors="pt", padding=True, truncation=True, max_length=512
    ).to(self.device)
    with torch.no_grad():
      outputs = self.model.generate(
        inputs.input_ids,
        attention_mask=inputs.attention_mask,
        max_new_tokens=MAX_NEW_TOKENS,
        do_sample=False,
        pad_token_id=self.tokenizer.eos_token_id,
      )
    decoded = self.tokenizer.batch_decode(outputs, skip_special_tokens=True)
    min_processing_seconds = max(p.get("min_processing_seconds", 0) for p in prompts)
    remaining_seconds = min_processing_seconds - (time.perf_counter() - started)
    if remaining_seconds > 0:
      log_event(
        "model_worker",
        "minimum_processing_delay_started",
        delay_seconds=round(remaining_seconds, 3),
      )
      time.sleep(remaining_seconds)
    return [
      {"request_id": prompt["request_id"], "generated_text": text}
      for prompt, text in zip(prompts, decoded, strict=True)
    ]

  @staticmethod
  def run(
    model_name: str,
    device: str,
    task_queue: mp.Queue,
    result_queue: mp.Queue,
    queue_metrics: QueueMetrics,
  ):
    worker = ModelWorker(model_name, device)
    result_queue.put(("ready", "", []))
    while True:
      task = task_queue.get()
      if task is None:
        log_event("model_worker", "worker_stopped")
        break
      batch_id, prompts = task
      request_ids = ",".join(prompt["request_id"] for prompt in prompts)
      queued, processing = queue_metrics.start_processing()
      log_event(
        "model_worker",
        "task_started",
        batch_id=batch_id,
        request_ids=request_ids,
        queued_tasks=queued,
        processing_tasks=processing,
      )
      results = worker.generate(prompts)
      processing, completed = queue_metrics.complete()
      log_event(
        "model_worker",
        "task_completed",
        batch_id=batch_id,
        request_ids=request_ids,
        processing_tasks=processing,
        completed_tasks=completed,
      )
      result_queue.put(("complete", batch_id, results))


class ModelExecutor:
  def __init__(self):
    self.task_queue = mp.Queue()
    self.result_queue = mp.Queue()
    self.queue_metrics = QueueMetrics()
    self.worker_process = None
    self.result_dispatcher = None
    self.pending_results: dict[str, Queue] = {}
    self.pending_lock = threading.Lock()

  def setup_worker(self, model_name: str, device: str):
    log_event("model_executor", "worker_starting", model=model_name, device=device)
    self.worker_process = mp.Process(
      target=ModelWorker.run,
      args=(model_name, device, self.task_queue, self.result_queue, self.queue_metrics),
      daemon=True,
    )
    self.worker_process.start()
    self.result_queue.get()
    self.result_dispatcher = threading.Thread(target=self._dispatch_results, daemon=True)
    self.result_dispatcher.start()
    log_event("model_executor", "worker_ready", worker_pid=self.worker_process.pid)

  def _dispatch_results(self):
    while True:
      result_type, batch_id, results = self.result_queue.get()
      if result_type == "stop":
        return
      with self.pending_lock:
        waiter = self.pending_results.pop(batch_id, None)
      if waiter is None:
        log_event("model_executor", "orphan_result", batch_id=batch_id)
        continue
      waiter.put(results)
      log_event("model_executor", "result_dispatched", batch_id=batch_id)

  def execute_batch(self, prompts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not prompts:
      return []
    batch_id = str(uuid.uuid4())
    request_ids = ",".join(prompt["request_id"] for prompt in prompts)
    waiter: Queue = Queue(maxsize=1)
    with self.pending_lock:
      self.pending_results[batch_id] = waiter
    queued = self.queue_metrics.enqueue()
    log_event(
      "model_executor",
      "task_enqueued",
      batch_id=batch_id,
      request_ids=request_ids,
      queued_tasks=queued,
    )
    self.task_queue.put((batch_id, prompts))
    results = waiter.get()
    log_event("model_executor", "result_received", batch_id=batch_id, request_ids=request_ids)
    return results

  def queue_state(self) -> dict[str, Any]:
    return {
      **self.queue_metrics.snapshot(),
      "worker_alive": bool(self.worker_process and self.worker_process.is_alive()),
      "worker_pid": self.worker_process.pid if self.worker_process else None,
    }

  def shutdown(self):
    if self.worker_process and self.worker_process.is_alive():
      log_event("model_executor", "worker_stopping", worker_pid=self.worker_process.pid)
      self.task_queue.put(None)
      self.worker_process.join(timeout=5)
      if self.worker_process.is_alive():
        self.worker_process.terminate()
      self.result_queue.put(("stop", "", []))


class LLMEngine:
  def __init__(self):
    log_event("llm_engine", "initializing")
    self.model_executor = ModelExecutor()
    self.model_executor.setup_worker(MODEL_NAME, DEVICE)
    log_event("llm_engine", "ready")

  def basic_generate(self, prompt: str, request_id: str, min_processing_seconds: float = 0) -> str:
    log_event(
      "llm_engine",
      "generation_started",
      request_id=request_id,
      min_processing_seconds=min_processing_seconds,
    )
    request = {
      "request_id": request_id,
      "prompt": prompt,
      "min_processing_seconds": min_processing_seconds,
    }
    results = self.model_executor.execute_batch([request])
    log_event("llm_engine", "generation_completed", request_id=request_id)
    return results[0]["generated_text"]

  def queue_state(self) -> dict[str, Any]:
    return self.model_executor.queue_state()


app = FastAPI(title="ch03 v1 - single request")
_llm = None
_llm_lock = threading.Lock()


def get_llm() -> LLMEngine:
  global _llm
  if _llm is None:
    with _llm_lock:
      if _llm is None:
        _llm = LLMEngine()
  return _llm


class GenerateRequest(BaseModel):
  prompt: str
  min_processing_seconds: float = Field(default=0, ge=0, le=60)


class GenerateResponse(BaseModel):
  generated_text: str


@app.post("/basic_generate", response_model=GenerateResponse)
def basic_generate(request: GenerateRequest, llm: LLMEngine = Depends(get_llm)):
  request_id = str(uuid.uuid4())
  log_event("api_server", "request_received", request_id=request_id, path="/basic_generate")
  generated_text = llm.basic_generate(request.prompt, request_id, request.min_processing_seconds)
  log_event("api_server", "response_sent", request_id=request_id, path="/basic_generate")
  return GenerateResponse(generated_text=generated_text)


@app.get("/queue_state")
async def queue_state(llm: LLMEngine = Depends(get_llm)):
  return llm.queue_state()


@app.get("/healthz")
async def healthz():
  return {"status": "ok", "model": MODEL_NAME, "device": DEVICE}


if __name__ == "__main__":
  mp.set_start_method("spawn", force=True)
  get_llm()
  uvicorn.run(app, host="0.0.0.0", port=8000)
