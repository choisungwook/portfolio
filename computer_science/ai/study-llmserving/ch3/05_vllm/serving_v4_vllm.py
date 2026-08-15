"""v4: delegate batching and scheduling to vLLM (library mode).

Ubuntu + NVIDIA GPU only. On Apple Silicon use compare_openai.py against a
remote or containerised vLLM server instead.
"""

import os

import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel
from vllm import LLM, SamplingParams

MODEL_NAME = os.getenv("MODEL_NAME", "facebook/opt-125m")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "20"))
MAX_NUM_SEQS = int(os.getenv("MAX_NUM_SEQS", "16"))
GPU_MEMORY_UTILIZATION = float(os.getenv("GPU_MEMORY_UTILIZATION", "0.6"))


class LLMEngine:
  def __init__(self):
    self.vllm_model = LLM(
      model=MODEL_NAME,
      max_num_seqs=MAX_NUM_SEQS,
      gpu_memory_utilization=GPU_MEMORY_UTILIZATION,
    )
    self.max_tokens = MAX_TOKENS

  def generate_vllm(self, prompts: list[str]) -> list[str]:
    sampling_params = SamplingParams(temperature=0.7, top_p=0.95, max_tokens=self.max_tokens)
    outputs = self.vllm_model.generate(prompts, sampling_params)
    return [output.outputs[0].text for output in outputs]


app = FastAPI(title="ch03 v4 - vLLM")
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


@app.post("/generate_vllm", response_model=BatchGenerateResponse)
async def generate_vllm(request: BatchGenerateRequest):
  return BatchGenerateResponse(generated_texts=get_llm().generate_vllm(request.prompts))


@app.get("/healthz")
async def healthz():
  return {"status": "ok", "model": MODEL_NAME, "max_num_seqs": MAX_NUM_SEQS}


if __name__ == "__main__":
  get_llm()
  uvicorn.run(app, host="0.0.0.0", port=8000)
