import os
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, get_peft_model
from transformers import (
  AutoModelForCausalLM,
  AutoTokenizer,
  DataCollatorForLanguageModeling,
  Trainer,
  TrainingArguments,
)

BASE_MODEL_ID = os.environ.get("BASE_MODEL_ID", "Qwen/Qwen2.5-0.5B-Instruct")
TRAIN_DATASET_FILE = os.environ.get("TRAIN_DATASET_FILE", "/data/chapter5/loyalty_qa_train.jsonl")
EVAL_DATASET_FILE = os.environ.get("EVAL_DATASET_FILE", "/data/chapter5/loyalty_qa_val.jsonl")
MODEL_OUTPUT_DIR = Path(os.environ.get("MODEL_OUTPUT_DIR", "/model-assets"))
RUN_NAME = os.environ.get("RUN_NAME", "qwen25-myelite")
MAX_STEPS = int(os.environ.get("MAX_STEPS", "50"))
MAX_LENGTH = int(os.environ.get("MAX_LENGTH", "512"))


def load_json_dataset(path: str):
  return load_dataset("json", data_files=path, split="train")


def get_model_dtype():
  if torch.cuda.is_available():
    return torch.float16

  return torch.float32


def load_tokenizer():
  tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL_ID, trust_remote_code=True)
  if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

  return tokenizer


def load_model():
  model_options = {
    "torch_dtype": get_model_dtype(),
    "trust_remote_code": True,
  }

  if torch.cuda.is_available():
    model_options["device_map"] = "auto"

  model = AutoModelForCausalLM.from_pretrained(BASE_MODEL_ID, **model_options)
  model.config.use_cache = False
  model.gradient_checkpointing_enable()
  if hasattr(model, "enable_input_require_grads"):
    model.enable_input_require_grads()
  return model


def format_training_text(tokenizer, example: dict) -> str:
  messages = [
    {"role": "user", "content": example["prompt"]},
    {"role": "assistant", "content": example["response"]},
  ]
  return tokenizer.apply_chat_template(
    messages,
    tokenize=False,
    add_generation_prompt=False,
  )


def tokenize_dataset(tokenizer, dataset):
  def tokenize_example(example: dict) -> dict:
    text = format_training_text(tokenizer, example)
    tokens = tokenizer(
      text,
      truncation=True,
      max_length=MAX_LENGTH,
    )
    return tokens

  return dataset.map(tokenize_example, remove_columns=dataset.column_names)


def add_lora_adapter(model):
  config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=[
      "q_proj",
      "k_proj",
      "v_proj",
      "o_proj",
      "gate_proj",
      "up_proj",
      "down_proj",
    ],
    bias="none",
    lora_dropout=0.05,
    task_type="CAUSAL_LM",
  )
  return get_peft_model(model, config)


def move_inputs_to_device(inputs, device):
  if isinstance(inputs, torch.Tensor):
    return inputs.to(device)

  return {key: value.to(device) for key, value in inputs.items()}


def generate_with_inputs(model, inputs, **kwargs):
  if isinstance(inputs, torch.Tensor):
    return model.generate(inputs, **kwargs)

  return model.generate(**inputs, **kwargs)


def get_input_length(inputs) -> int:
  if isinstance(inputs, torch.Tensor):
    return inputs.shape[-1]

  return inputs["input_ids"].shape[-1]


def generate_text(model, tokenizer, prompt: str) -> str:
  messages = [{"role": "user", "content": prompt}]
  inputs = move_inputs_to_device(
    tokenizer.apply_chat_template(
      messages,
      tokenize=True,
      add_generation_prompt=True,
      return_tensors="pt",
    ),
    model.device,
  )

  with torch.no_grad():
    outputs = generate_with_inputs(
      model,
      inputs,
      max_new_tokens=100,
      repetition_penalty=1.15,
    )

  generated_tokens = outputs[0][get_input_length(inputs):]
  return tokenizer.decode(generated_tokens, skip_special_tokens=True)


def train_model(model, tokenizer, train_dataset, eval_dataset):
  trainer = Trainer(
    model=model,
    train_dataset=train_dataset,
    eval_dataset=eval_dataset,
    args=TrainingArguments(
      output_dir=f"/tmp/{RUN_NAME}",
      warmup_steps=2,
      per_device_train_batch_size=2,
      gradient_accumulation_steps=1,
      gradient_checkpointing=True,
      max_steps=MAX_STEPS,
      learning_rate=2.5e-5,
      fp16=torch.cuda.is_available(),
      logging_steps=10,
      save_strategy="steps",
      save_steps=25,
      eval_strategy="steps",
      eval_steps=25,
      do_eval=True,
      report_to="none",
    ),
    data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
  )
  trainer.train()
  return trainer


def save_model_artifacts(trainer, tokenizer) -> None:
  MODEL_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
  trainer.save_model(str(MODEL_OUTPUT_DIR))
  tokenizer.save_pretrained(str(MODEL_OUTPUT_DIR))


def main() -> None:
  tokenizer = load_tokenizer()
  train_dataset = tokenize_dataset(tokenizer, load_json_dataset(TRAIN_DATASET_FILE))
  eval_dataset = tokenize_dataset(tokenizer, load_json_dataset(EVAL_DATASET_FILE))
  model = add_lora_adapter(load_model())

  eval_prompt = "[MyElite Loyalty Program FAQ]: What is the maximum cashback I can earn?"
  print("Before fine-tuning:")
  print(generate_text(model, tokenizer, eval_prompt))

  trainer = train_model(model, tokenizer, train_dataset, eval_dataset)

  print("After fine-tuning:")
  print(generate_text(model, tokenizer, eval_prompt))

  save_model_artifacts(trainer, tokenizer)
  print(f"Saved model artifacts to {MODEL_OUTPUT_DIR}")


if __name__ == "__main__":
  main()
