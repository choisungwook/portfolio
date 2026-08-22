"""Build a Markdown comparison table from benchmark JSON files."""

import json
from pathlib import Path

RESULTS = Path("results")


def load_accuracy(name: str, model: str) -> str:
  """Return a formatted accuracy result or N/A."""
  path = RESULTS / f"accuracy-{name}-{model}.json"
  if not path.exists():
    return "N/A"
  result = json.loads(path.read_text(encoding="utf-8"))
  if not result["valid_comparison"]:
    return "N/A"
  return f"{result['accuracy'] * 100:.1f}%"


def build_rows() -> list[list[str]]:
  """Return one table row for every model, workload, and concurrency."""
  rows = []
  for path in sorted(RESULTS.glob("performance-*.json")):
    report = json.loads(path.read_text(encoding="utf-8"))
    model = report["model"]
    smoke = load_accuracy("smoke", model)
    gsm8k = load_accuracy("gsm8k", model)
    scheduler = report.get("scheduler", {})
    for result in report["results"]:
      peak = result["peak_vram_mib"]
      rows.append(
        [
          model,
          report["precision"],
          report["workload"],
          str(scheduler.get("max_num_seqs", "N/A")),
          str(scheduler.get("max_num_batched_tokens", "N/A")),
          str(result["concurrency"]),
          f"{result['ttft_p50_ms']:.1f}/{result['ttft_p95_ms']:.1f}",
          f"{result['tpot_p50_ms']:.1f}/{result['tpot_p95_ms']:.1f}",
          f"{result['e2e_p50_ms']:.1f}/{result['e2e_p95_ms']:.1f}",
          f"{result['rps']:.2f}",
          f"{result['output_tps']:.1f}",
          "N/A" if peak is None else f"{peak / 1024:.2f}",
          smoke,
          gsm8k,
        ]
      )
  return rows


def render_table(rows: list[list[str]]) -> str:
  """Render benchmark rows as a Markdown table."""
  header = (
    "| Model | Precision | Workload | Max seqs | Token budget | Concurrency | TTFT p50/p95 ms | "
    "TPOT p50/p95 ms | E2E p50/p95 ms | RPS | Output TPS | Peak VRAM GiB | "
    "Smoke accuracy | GSM8K-20 |"
  )
  divider = (
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | "
    "---: | ---: |"
  )
  lines = [header, divider]
  lines.extend("| " + " | ".join(row) + " |" for row in rows)
  return "\n".join(lines) + "\n"


def main() -> None:
  """Write the current benchmark summary."""
  table = render_table(build_rows())
  path = RESULTS / "summary.md"
  path.write_text("# Benchmark results\n\n" + table, encoding="utf-8")
  print(table)


if __name__ == "__main__":
  main()
