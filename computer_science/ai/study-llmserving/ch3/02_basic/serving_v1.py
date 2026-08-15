"""v1: one request = one prompt = one inference call."""

import multiprocessing as mp
import os
import uuid
from typing import Any

import torch
import uvicorn
from fastapi import Depends, FastAPI
from pydantic import BaseModel
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_NAME = os.getenv("MODEL_NAME", "facebook/opt-125m")
DEVICE = os.getenv("DEVICE", "cpu")
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "20"))


class ModelManager:
  def load_model(self, model_name: str):
    model = AutoModelForCausalLM.from_pretrained(model_name)
    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
      tokenizer.pad_token = tokenizer.eos_token
    return model, tokenizer


class ModelWorker:
  def __init__(self, model_name: str, device: str):
    self.device = device
    self.model, self.tokenizer = ModelManager().load_model(model_name)
    self.model.to(self.device)
    self.model.eval()

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

  def setup_worker(self, model_name: str, device: str):
    self.worker_process = mp.Process(
      target=ModelWorker.run,
      args=(model_name, device, self.task_queue, self.result_queue),
      daemon=True,
    )
    self.worker_process.start()
    self.result_queue.get()

  def execute_batch(self, prompts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not prompts:
      return []
    self.task_queue.put((prompts, False))
    _, results = self.result_queue.get()
    return results

  def shutdown(self):
    if self.worker_process and self.worker_process.is_alive():
      self.task_queue.put(None)
      self.worker_process.join(timeout=5)
      self.worker_process.terminate()


class LLMEngine:
  def __init__(self):
    self.model_executor = ModelExecutor()
    self.model_executor.setup_worker(MODEL_NAME, DEVICE)

  def basic_generate(self, prompt: str) -> str:
    request = {"request_id": str(uuid.uuid4()), "prompt": prompt}
    results = self.model_executor.execute_batch([request])
    return results[0]["generated_text"]


app = FastAPI(title="ch03 v1 - single request")
_llm = None


def get_llm() -> LLMEngine:
  global _llm
  if _llm is None:
    _llm = LLMEngine()
  return _llm


class GenerateRequest(BaseModel):
  prompt: str


class GenerateResponse(BaseModel):
  generated_text: str


@app.post("/basic_generate", response_model=GenerateResponse)
async def basic_generate(request: GenerateRequest, llm: LLMEngine = Depends(get_llm)):
  return GenerateResponse(generated_text=llm.basic_generate(request.prompt))


@app.get("/healthz")
async def healthz():
  return {"status": "ok", "model": MODEL_NAME, "device": DEVICE}


if __name__ == "__main__":
  mp.set_start_method("spawn", force=True)
  get_llm()
  uvicorn.run(app, host="0.0.0.0", port=8000)
