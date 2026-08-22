"""Test model load error classification without a GPU."""

from model_loader.common import is_cuda_oom


def test_cuda_oom_detection() -> None:
  assert is_cuda_oom(RuntimeError("CUDA out of memory"))
  assert not is_cuda_oom(RuntimeError("network timeout"))
