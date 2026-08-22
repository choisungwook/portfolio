"""Load one Hugging Face model into CUDA and record memory."""

import gc
import json
import time
from dataclasses import asdict, dataclass
from pathlib import Path


@dataclass(frozen=True)
class LoadResult:
  """Store one CUDA model load result."""

  model_id: str
  loaded: bool
  expected_cuda_oom: bool
  elapsed_seconds: float
  peak_allocated_gib: float
  peak_reserved_gib: float
  error: str | None


def is_cuda_oom(error: BaseException) -> bool:
  """Return whether an exception represents CUDA memory exhaustion."""
  return "out of memory" in str(error).lower()


def load_model(model_id: str) -> LoadResult:
  """Load a BF16 model into one CUDA GPU and capture peak memory."""
  import torch
  from transformers import AutoModelForCausalLM

  if not torch.cuda.is_available():
    raise RuntimeError("CUDA is not available inside the container")

  torch.cuda.empty_cache()
  torch.cuda.reset_peak_memory_stats()
  started = time.perf_counter()
  error_message = None
  loaded = False
  expected_cuda_oom = False
  model = None

  try:
    model = AutoModelForCausalLM.from_pretrained(
      model_id,
      dtype=torch.bfloat16,
      low_cpu_mem_usage=True,
    )
    model.to("cuda")
    torch.cuda.synchronize()
    loaded = True
  except (RuntimeError, torch.OutOfMemoryError) as error:
    expected_cuda_oom = is_cuda_oom(error)
    error_message = str(error).splitlines()[0]

  peak_allocated = torch.cuda.max_memory_allocated() / 1024**3
  peak_reserved = torch.cuda.max_memory_reserved() / 1024**3
  del model
  gc.collect()
  torch.cuda.empty_cache()
  return LoadResult(
    model_id=model_id,
    loaded=loaded,
    expected_cuda_oom=expected_cuda_oom,
    elapsed_seconds=time.perf_counter() - started,
    peak_allocated_gib=peak_allocated,
    peak_reserved_gib=peak_reserved,
    error=error_message,
  )


def save_result(result: LoadResult, path: Path) -> None:
  """Persist one model load result as JSON."""
  path.parent.mkdir(parents=True, exist_ok=True)
  path.write_text(json.dumps(asdict(result), indent=2) + "\n", encoding="utf-8")
