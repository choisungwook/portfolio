"""v2: Sequence tracking + FIFO batching across requests."""

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
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_NAME = os.getenv("MODEL_NAME", "facebook/opt-125m")
DEVICE = os.getenv("DEVICE", "cpu")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "4"))
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "20"))


class Sequence:
  def __init__(self, seq_id: str, prompt: str, client_stream=None, loop=None):
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

  def add_request(self, prompt: str) -> str:
    sequence = Sequence(str(uuid.uuid4()), prompt)
    with self.lock:
      self.sequence_map[sequence.id] = sequence
    self.incoming_queue.put(sequence)
    return sequence.id

  def get_next_batch(self) -> list[Sequence]:
    with self.lock:
      while len(self.active_sequences) < self.batch_size and not self.incoming_queue.empty():
        self.active_sequences.append(self.incoming_queue.get())
      return list(self.active_sequences)

  def update_sequence_output(self, seq_id: str, text: str, is_finished: bool = False):
    with self.lock:
      sequence = self.sequence_map.get(seq_id)
      if sequence is None:
        return
      sequence.output.append(text)
      sequence.token_count += 1
      sequence.finished = is_finished

  def remove_active_sequence(self, seq_id: str):
    with self.lock:
      sequence = self.sequence_map.get(seq_id)
      if sequence and sequence in self.active_sequences:
        self.active_sequences.remove(sequence)

  def remove_finished_sequence(self, seq_id: str):
    with self.lock:
      sequence = self.sequence_map.pop(seq_id, None)
      if sequence and sequence in self.active_sequences:
        self.active_sequences.remove(sequence)

  def is_sequence_finished(self, seq_id: str) -> bool:
    with self.lock:
      sequence = self.sequence_map.get(seq_id)
      return bool(sequence and sequence.finished)

  def get_sequence(self, seq_id: str) -> Sequence | None:
    with self.lock:
      return self.sequence_map.get(seq_id)


class ModelWorker:
  def __init__(self, model_name: str, device: str):
    self.device = device
    self.model = AutoModelForCausalLM.from_pretrained(model_name).to(device).eval()
    self.tokenizer = AutoTokenizer.from_pretrained(model_name)
    if self.tokenizer.pad_token is None:
      self.tokenizer.pad_token = self.tokenizer.eos_token

  def generate(self, prompts: list[dict[str, Any]]) -> list[dict[str, Any]]:
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
    return [
      {"request_id": prompt["request_id"], "generated_text": text}
      for prompt, text in zip(prompts, decoded, strict=True)
    ]

  @staticmethod
  def run(model_name: str, device: str, task_queue: mp.Queue, result_queue: mp.Queue):
    worker = ModelWorker(model_name, device)
    result_queue.put(("ready", []))
    while True:
      task = task_queue.get()
      if task is None:
        break
      prompts, _ = task
      result_queue.put(("complete", worker.generate(prompts)))


class ModelExecutor:
  def __init__(self):
    self.task_queue = mp.Queue()
    self.result_queue = mp.Queue()
    self.worker_process = None
    self.batch_count = 0

  def setup_worker(self, model_name: str, device: str):
    self.worker_process = mp.Process(
      target=ModelWorker.run,
      args=(model_name, device, self.task_queue, self.result_queue),
      daemon=True,
    )
    self.worker_process.start()
    self.result_queue.get()

  def execute_batch(self, sequences: list[Sequence]) -> list[dict[str, Any]]:
    if not sequences:
      return []
    payload = [{"request_id": s.id, "prompt": s.prompt} for s in sequences]
    self.task_queue.put((payload, False))
    _, results = self.result_queue.get()
    self.batch_count += 1
    return results


class LLMEngine:
  def __init__(self):
    self.workload_manager = WorkloadManager()
    self.model_executor = ModelExecutor()
    self.model_executor.setup_worker(MODEL_NAME, DEVICE)
    self.batch_lock = threading.Lock()

  def _is_batch_finished(self, request_ids: list[str]) -> bool:
    return all(self.workload_manager.is_sequence_finished(i) for i in request_ids)

  def generate(self, prompts: list[str]) -> list[str]:
    request_ids = [self.workload_manager.add_request(p) for p in prompts]

    while not self._is_batch_finished(request_ids):
      with self.batch_lock:
        sequences = self.workload_manager.get_next_batch()
        if not sequences:
          time.sleep(0.02)
          continue
        results = self.model_executor.execute_batch(sequences)
        for result in results:
          self.workload_manager.remove_active_sequence(result["request_id"])
          self.workload_manager.update_sequence_output(
            result["request_id"], result["generated_text"], is_finished=True
          )

    generated_texts = []
    for request_id in request_ids:
      sequence = self.workload_manager.get_sequence(request_id)
      generated_texts.append(sequence.output[0] if sequence and sequence.output else "")
      self.workload_manager.remove_finished_sequence(request_id)
    return generated_texts

  def stats(self) -> dict[str, Any]:
    return {
      "batch_size": self.workload_manager.batch_size,
      "batches_executed": self.model_executor.batch_count,
      "active_sequences": len(self.workload_manager.active_sequences),
    }


app = FastAPI(title="ch03 v2 - batching")
_llm = None


def get_llm() -> LLMEngine:
  global _llm
  if _llm is None:
    _llm = LLMEngine()
  return _llm


class BatchGenerateRequest(BaseModel):
  prompts: list[str]


class BatchGenerateResponse(BaseModel):
  generated_texts: list[str]


@app.post("/generate", response_model=BatchGenerateResponse)
async def generate(request: BatchGenerateRequest, llm: LLMEngine = Depends(get_llm)):
  return BatchGenerateResponse(generated_texts=llm.generate(request.prompts))


@app.get("/stats")
async def stats(llm: LLMEngine = Depends(get_llm)):
  return llm.stats()


@app.get("/healthz")
async def healthz():
  return {"status": "ok", "model": MODEL_NAME, "device": DEVICE, "batch_size": BATCH_SIZE}


if __name__ == "__main__":
  mp.set_start_method("spawn", force=True)
  get_llm()
  uvicorn.run(app, host="0.0.0.0", port=8000)
