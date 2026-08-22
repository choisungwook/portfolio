"""Test benchmark aggregation and answer parsing."""

from benchmark.accuracy_common import extract_last_number, matches_answer, normalize_answer
from benchmark.benchmark_batch_strategies import (
  RequestSpec,
  build_dynamic_plans,
  render_strategy_table,
)
from benchmark.common import RequestMetric, metric_summary, percentile
from benchmark.summary import render_table


def test_percentile_and_metric_summary() -> None:
  metrics = [
    RequestMetric(ttft_ms=10, tpot_ms=2, e2e_ms=20, output_tokens=4),
    RequestMetric(ttft_ms=20, tpot_ms=4, e2e_ms=40, output_tokens=6),
  ]
  result = metric_summary(metrics, elapsed_seconds=2)
  assert percentile([10, 20], 0.5) == 15
  assert result["rps"] == 1
  assert result["output_tps"] == 5


def test_accuracy_answer_parsing() -> None:
  assert normalize_answer(" Paris! ") == "paris"
  assert matches_answer("The final answer is Paris.", ["Paris"])
  assert extract_last_number("work 1,200 then answer -42.5") == "-42.5"


def test_summary_table_contains_required_columns() -> None:
  table = render_table([])
  assert "Max seqs" in table
  assert "Token budget" in table
  assert "TTFT p50/p95 ms" in table
  assert "TPOT p50/p95 ms" in table
  assert "Smoke accuracy" in table
  assert "GSM8K-20" in table


def test_dynamic_batch_plans_flush_by_size_and_delay() -> None:
  requests = [
    RequestSpec(index, "test", arrival, 32)
    for index, arrival in enumerate([0, 5, 10, 40, 45, 50, 55, 60])
  ]
  plans = build_dynamic_plans(requests, batch_size=4, max_delay_ms=20)
  assert [plan.dispatch_ms for plan in plans] == [20, 55, 80]
  assert [[request.index for request in plan.requests] for plan in plans] == [
    [0, 1, 2],
    [3, 4, 5, 6],
    [7],
  ]


def test_batch_strategy_table_contains_comparison_metrics() -> None:
  result = {
    "strategy": "continuous",
    "admission_p95_ms": 1.0,
    "ttft_p95_ms": 2.0,
    "e2e_p95_ms": 3.0,
    "rps": 4.0,
    "output_tps": 5.0,
    "peak_vram_mib": None,
  }
  table = render_strategy_table([result])
  assert "Admission p95 ms" in table
  assert "continuous" in table
  assert "N/A" in table
