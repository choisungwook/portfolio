"""Test benchmark aggregation and answer parsing."""

from benchmark.accuracy_common import extract_last_number, matches_answer, normalize_answer
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
  assert "TTFT p50/p95 ms" in table
  assert "TPOT p50/p95 ms" in table
  assert "Smoke accuracy" in table
  assert "GSM8K-20" in table
