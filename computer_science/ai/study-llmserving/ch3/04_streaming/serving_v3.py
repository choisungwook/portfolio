"""v3: token-level streaming (SSE) on top of batching."""

import asyncio
import json
import multiprocessing as mp
import os
import threading
import time
import uuid
from queue import Queue
from typing import Any

import torch
import uvicorn
from fastapi import Depends, FastAPI
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_NAME = os.getenv("MODEL_NAME", "facebook/opt-125m")
DEVICE = os.getenv("DEVICE", "cpu")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "4"))
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "20"))


class Sequence:
  def __init__(self, seq_id: str, prompt: str, client_stream, loop):
    self.id = seq_id
    self.prompt = prompt
    self.output: list[str] = []
    self.finished = False
    self.client_stream = client_stream
    self.loop = loop
    self.token_count = 0


class WorkloadManager:
  def __init__(self, batch_size: int = BATCH_SIZE):
    self.batch_size = batch_size
    self.incoming_queue: Queue[Sequence] = Queue()
    self.active_sequences: list[Sequence] = []
    self.sequence_map: dict[str, Sequence] = {}
    self.lock = threading.Lock()

  def add_streaming_request(self, prompt: str, client_stream, loop) -> str:
    sequence = Sequence(str(uuid.uuid4()), prompt, client_stream, loop)
    with self.lock:
      self.sequence_map[sequence.id] = sequence
    self.incoming_queue.put(sequence)
    return sequence.id

  def get_next_batch(self) -> list[Sequence]:
    with self.lock:
      while len(self.active_sequences) < self.batch_size and not self.incoming_queue.empty():
        self.active_sequences.append(self.incoming_queue.get())
      return list(self.active_sequences)

  def get_sequence(self, seq_id: str) -> Sequence | None:
    with self.lock:
      return self.sequence_map.get(seq_id)

  def update_sequence_output(self, seq_id: str, token: str):
    with self.lock:
      sequence = self.sequence_map.get(seq_id)
      if sequence is None:
        return
      sequence.output.append(token)
      sequence.prompt += token
      sequence.token_count += 1

  def remove_finished_sequence(self, seq_id: str):
    with self.lock:
      sequence = self.sequence_map.pop(seq_id, None)
      if sequence and sequence in self.active_sequences:
        self.active_sequences.remove(sequence)

  def snapshot(self) -> dict[str, Any]:
    with self.lock:
      return {
        "batch_size": self.batch_size,
        "active": [{"id": s.id[:8], "tokens": s.token_count} for s in self.active_sequences],
        "waiting": self.incoming_queue.qsize(),
      }


class ModelWorker:
  def __init__(self, model_name: str, device: str):
    self.device = device
    self.model = AutoModelForCausalLM.from_pretrained(model_name).to(device).eval()
    self.tokenizer = AutoTokenizer.from_pretrained(model_name)
    if self.tokenizer.pad_token is None:
      self.tokenizer.pad_token = self.tokenizer.eos_token

  def generate_forward_batch(self, prompts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    encoded = self.tokenizer(
      [p["prompt"] for p in prompts],
      return_tensors="pt",
      padding=True,
      truncation=True,
      max_length=512,
    ).to(self.device)
    with torch.no_grad():
      outputs = self.model(
        input_ids=encoded.input_ids, attention_mask=encoded.attention_mask, use_cache=False
      )
      next_token_logits = outputs.logits[:, -1, :]
      next_token = torch.multinomial(
        torch.softmax(next_token_logits / 0.7, dim=-1), num_samples=1
      ).squeeze(-1)

    results = []
    for i, prompt_data in enumerate(prompts):
      token = self.tokenizer.decode(next_token[i].unsqueeze(0), skip_special_tokens=True)
      results.append(
        {
          "request_id": prompt_data["request_id"],
          "token": token,
          "is_finished": next_token[i].item() == self.tokenizer.eos_token_id,
        }
      )
    return results

  @staticmethod
  def run(model_name: str, device: str, task_queue: mp.Queue, result_queue: mp.Queue):
    worker = ModelWorker(model_name, device)
    result_queue.put(("ready", []))
    while True:
      task = task_queue.get()
      if task is None:
        break
      prompts, _ = task
      result_queue.put(("stream", worker.generate_forward_batch(prompts)))


class ModelExecutor:
  def __init__(self):
    self.task_queue = mp.Queue()
    self.result_queue = mp.Queue()
    self.worker_process = None

  def setup_worker(self, model_name: str, device: str):
    self.worker_process = mp.Process(
      target=ModelWorker.run,
      args=(model_name, device, self.task_queue, self.result_queue),
      daemon=True,
    )
    self.worker_process.start()
    self.result_queue.get()

  def execute_forward_batch(self, prompts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not prompts:
      return []
    self.task_queue.put((prompts, True))
    result_type, results = self.result_queue.get()
    if result_type != "stream":
      raise RuntimeError(f"unexpected result type: {result_type}")
    return results


class LLMEngine:
  def __init__(self):
    self.workload_manager = WorkloadManager()
    self.model_executor = ModelExecutor()
    self.model_executor.setup_worker(MODEL_NAME, DEVICE)
    self.max_tokens = MAX_TOKENS
    self.thread = threading.Thread(target=self.requests_processing_loop, daemon=True)
    self.thread.start()

  def requests_processing_loop(self):
    while True:
      try:
        active_sequences = self.workload_manager.get_next_batch()
        if not active_sequences:
          time.sleep(0.02)
          continue

        prompts = [{"prompt": s.prompt, "request_id": s.id} for s in active_sequences]
        results = self.model_executor.execute_forward_batch(prompts)

        for result in results:
          sequence = self.workload_manager.get_sequence(result["request_id"])
          if sequence is None:
            continue
          if result["is_finished"] or sequence.token_count >= self.max_tokens:
            asyncio.run_coroutine_threadsafe(sequence.client_stream.put(None), sequence.loop)
            sequence.finished = True
            self.workload_manager.remove_finished_sequence(result["request_id"])
          else:
            payload = json.dumps({"token": result["token"], "sequence_id": result["request_id"]})
            asyncio.run_coroutine_threadsafe(sequence.client_stream.put(payload), sequence.loop)
            self.workload_manager.update_sequence_output(result["request_id"], result["token"])
      except Exception as exc:
        print(f"processing loop error: {exc}")
        time.sleep(0.1)

  async def event_generator(self, loop, prompt: str):
    queue: asyncio.Queue = asyncio.Queue()
    seq_id = self.workload_manager.add_streaming_request(prompt, queue, loop)
    try:
      while True:
        data = await queue.get()
        if data is None:
          break
        yield f"data: {data}\n\n"
    finally:
      self.workload_manager.remove_finished_sequence(seq_id)


app = FastAPI(title="ch03 v3 - streaming with batching")
_llm = None


def get_llm() -> LLMEngine:
  global _llm
  if _llm is None:
    _llm = LLMEngine()
  return _llm


class GenerateRequest(BaseModel):
  prompt: str


@app.post("/generate_stream")
async def generate_stream(request: GenerateRequest, llm: LLMEngine = Depends(get_llm)):
  async def event_stream():
    loop = asyncio.get_event_loop()
    async for chunk in llm.event_generator(loop, request.prompt):
      yield chunk

  return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/batch_state")
async def batch_state(llm: LLMEngine = Depends(get_llm)):
  return llm.workload_manager.snapshot()


@app.get("/healthz")
async def healthz():
  return {"status": "ok", "model": MODEL_NAME, "device": DEVICE, "batch_size": BATCH_SIZE}


if __name__ == "__main__":
  mp.set_start_method("spawn", force=True)
  get_llm()
  uvicorn.run(app, host="0.0.0.0", port=8000)
