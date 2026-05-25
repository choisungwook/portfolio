import json
import logging
import os
from pathlib import Path

import torch
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

app = FastAPI()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("uvicorn")

BASE_MODEL_ID = os.getenv("BASE_MODEL_ID", "Qwen/Qwen2.5-0.5B-Instruct")
MODEL_ASSETS_DIR = Path(os.getenv("MODEL_ASSETS_DIR", "/model-assets"))
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "100"))
REPETITION_PENALTY = float(os.getenv("REPETITION_PENALTY", "1.15"))


def get_model_dtype():
  if torch.cuda.is_available():
    return torch.float16

  return torch.float32


def load_tokenizer():
  tokenizer = AutoTokenizer.from_pretrained(MODEL_ASSETS_DIR, trust_remote_code=True)
  if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

  return tokenizer


def load_base_model():
  model_options = {
    "torch_dtype": get_model_dtype(),
    "trust_remote_code": True,
  }

  if torch.cuda.is_available():
    model_options["device_map"] = "auto"

  return AutoModelForCausalLM.from_pretrained(BASE_MODEL_ID, **model_options)


def load_fine_tuned_model():
  if not MODEL_ASSETS_DIR.exists():
    raise FileNotFoundError(f"Model assets directory does not exist: {MODEL_ASSETS_DIR}")

  base_model = load_base_model()
  model = PeftModel.from_pretrained(base_model, MODEL_ASSETS_DIR)
  model.eval()
  return model


tokenizer = load_tokenizer()
model = load_fine_tuned_model()


def move_inputs_to_device(inputs, device):
  if isinstance(inputs, torch.Tensor):
    return inputs.to(device)

  return {key: value.to(device) for key, value in inputs.items()}


def generate_with_inputs(inputs, **kwargs):
  if isinstance(inputs, torch.Tensor):
    return model.generate(inputs, **kwargs)

  return model.generate(**inputs, **kwargs)


def get_input_length(inputs) -> int:
  if isinstance(inputs, torch.Tensor):
    return inputs.shape[-1]

  return inputs["input_ids"].shape[-1]


def build_inputs(prompt: str):
  messages = [{"role": "user", "content": prompt}]
  return move_inputs_to_device(
    tokenizer.apply_chat_template(
      messages,
      tokenize=True,
      add_generation_prompt=True,
      return_tensors="pt",
    ),
    model.device,
  )


@app.post("/generate")
async def generate(request: Request):
  try:
    data = await request.json()
  except Exception as error:
    logger.error("Failed to parse JSON: %s", error)
    return JSONResponse(status_code=400, content={"error": "Invalid JSON"})

  logger.info("Request received: %s", json.dumps(data))
  prompt = data.get("prompt", "")

  if not prompt:
    return JSONResponse(status_code=400, content={"error": "No input text provided"})

  inputs = build_inputs(prompt)

  with torch.no_grad():
    outputs = generate_with_inputs(
      inputs,
      max_new_tokens=MAX_NEW_TOKENS,
      repetition_penalty=REPETITION_PENALTY,
    )

  generated_tokens = outputs[0][get_input_length(inputs):]
  response = tokenizer.decode(generated_tokens, skip_special_tokens=True)
  logger.info("Response: %s", response)

  return {"response": response}
