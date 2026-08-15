"""Measure throughput vs batch size without the HTTP layer.

Runs model.generate() directly so the batching effect is isolated from
queueing and web-framework overhead.
"""

import argparse
import os
import time

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

PROMPTS = [
  "Hello, I am",
  "The weather is",
  "I want to",
  "The best way to",
  "The most efficient way to",
  "Kubernetes is",
  "A GPU is useful because",
  "Model serving means",
]


def run(model, tokenizer, device, prompts, max_new_tokens):
  inputs = tokenizer(
    prompts, return_tensors="pt", padding=True, truncation=True, max_length=512
  ).to(device)
  started = time.perf_counter()
  with torch.no_grad():
    model.generate(
      inputs.input_ids,
      attention_mask=inputs.attention_mask,
      max_new_tokens=max_new_tokens,
      do_sample=False,
      pad_token_id=tokenizer.eos_token_id,
    )
  if device == "cuda":
    torch.cuda.synchronize()
  return time.perf_counter() - started


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument("--model", default=os.getenv("MODEL_NAME", "facebook/opt-125m"))
  parser.add_argument("--device", default=os.getenv("DEVICE", "cpu"))
  parser.add_argument("--total", type=int, default=32)
  parser.add_argument("--max-new-tokens", type=int, default=32)
  parser.add_argument("--batch-sizes", default="1,2,4,8,16")
  args = parser.parse_args()

  tokenizer = AutoTokenizer.from_pretrained(args.model)
  if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
  model = AutoModelForCausalLM.from_pretrained(args.model).to(args.device).eval()

  workload = [PROMPTS[i % len(PROMPTS)] for i in range(args.total)]
  run(model, tokenizer, args.device, workload[:2], 4)

  print(f"model={args.model} device={args.device} total_prompts={args.total}")
  print(f"{'batch':>6} {'batches':>8} {'wall(s)':>9} {'prompt/s':>10} {'speedup':>8}")
  baseline = None
  for batch_size in [int(b) for b in args.batch_sizes.split(",")]:
    elapsed = 0.0
    batches = 0
    for start in range(0, len(workload), batch_size):
      elapsed += run(
        model, tokenizer, args.device, workload[start : start + batch_size], args.max_new_tokens
      )
      batches += 1
    rate = len(workload) / elapsed
    baseline = baseline or rate
    print(f"{batch_size:>6} {batches:>8} {elapsed:>9.2f} {rate:>10.2f} {rate / baseline:>7.2f}x")


if __name__ == "__main__":
  main()
