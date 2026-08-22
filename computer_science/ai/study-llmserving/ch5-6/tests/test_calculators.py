"""Test deterministic Chapter 5 calculators."""

import pytest

from calculators.memory_budget import ModelShape, max_batch_size, total_kv_gib, weight_gib
from calculators.roofline import Accelerator, bottleneck, crossover_flops_per_byte


def test_weight_memory_uses_parameter_width() -> None:
  assert weight_gib(7, 2) == pytest.approx(13.0385, rel=1e-3)
  assert weight_gib(7, 0.5) == pytest.approx(3.2596, rel=1e-3)


def test_kv_cache_grows_with_batch_size() -> None:
  model = ModelShape(7.61, 28, 28, 4, 3584)
  one_request = total_kv_gib(model, 2, batch_size=1, sequence_length=4096)
  assert total_kv_gib(model, 2, batch_size=4, sequence_length=4096) == one_request * 4
  assert max_batch_size(one_request * 4, model, 2, sequence_length=4096) == 4


def test_roofline_classifies_both_sides() -> None:
  gpu = Accelerator("test", peak_tflops=100, memory_bandwidth_gbps=1000)
  assert crossover_flops_per_byte(gpu) == 100
  assert bottleneck(99, gpu) == "memory-bandwidth-bound"
  assert bottleneck(100, gpu) == "compute-bound"
