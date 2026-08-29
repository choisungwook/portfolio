"""Draw the roofline of the measured GPU with this workload's points on it.

The roofline has two axes that are easy to mix up. The x axis is arithmetic
intensity, meaning how many operations the workload performs for every byte it
moves. The y axis is how many TFLOPS the GPU can actually deliver at that
intensity. The diagonal is the bandwidth ceiling and the flat part is the
compute ceiling; where they meet is the crossover point.
"""

import json
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

REPORT_PATH = Path("results/roofline-probe.json")
OUTPUT_PATH = Path("results/roofline.png")
CURVE_DECADES = [2**exponent for exponent in range(-2, 13)]


def roof_tflops(intensity: float, peak_tflops: float, bandwidth_gbps: float) -> float:
  """Return the highest TFLOPS the hardware allows at one arithmetic intensity."""
  bandwidth_limit = bandwidth_gbps * 1e9 * intensity / 1e12
  return min(peak_tflops, bandwidth_limit)


def draw_roof(axes, peak_tflops: float, bandwidth_gbps: float) -> None:
  """Draw the bandwidth ceiling and the compute ceiling."""
  ceiling = [roof_tflops(x, peak_tflops, bandwidth_gbps) for x in CURVE_DECADES]
  axes.plot(CURVE_DECADES, ceiling, color="#111111", linewidth=2, label="roofline (measured)")


def draw_crossover(axes, crossover: float, peak_tflops: float) -> None:
  """Mark the intensity where the bottleneck changes."""
  axes.axvline(crossover, color="#d62728", linestyle="--", linewidth=1.2)
  axes.text(
    crossover * 1.1,
    peak_tflops * 0.05,
    f"crossover\n{crossover:.0f} FLOPS/B",
    color="#d62728",
    fontsize=9,
  )


def draw_points(axes, points: list[dict], color: str, marker: str, label: str) -> None:
  """Plot measured workload points and label each one."""
  axes.scatter(
    [point["arithmetic_intensity"] for point in points],
    [point["achieved_tflops"] for point in points],
    color=color,
    marker=marker,
    s=55,
    zorder=3,
    label=label,
  )
  for index, point in enumerate(points):
    axes.annotate(
      point["label"],
      (point["arithmetic_intensity"], point["achieved_tflops"]),
      textcoords="offset points",
      xytext=(7, 6 if index % 2 else -12),
      fontsize=8,
      color=color,
    )


def build_figure(report: dict):
  """Compose the roofline figure from one probe report."""
  peak_tflops = report["peak_tflops_measured"]
  bandwidth_gbps = report["peak_gbps_measured"]
  figure, axes = plt.subplots(figsize=(9, 5.5))
  draw_roof(axes, peak_tflops, bandwidth_gbps)
  draw_crossover(axes, report["crossover_flops_per_byte"], peak_tflops)
  draw_points(axes, report["square_sweep"], "#1f77b4", "o", "square matmul (M=N=K)")
  draw_points(axes, report["llm_shape_sweep"], "#ff7f0e", "^", "LLM projection [s,h]x[h,h]")
  axes.set_xscale("log", base=2)
  axes.set_yscale("log", base=2)
  axes.set_xlabel("arithmetic intensity (FLOPS per byte moved)")
  axes.set_ylabel("achieved compute (TFLOPS)")
  axes.set_title(
    f"{report['device']}  |  measured peak {peak_tflops:.0f} TFLOPS, {bandwidth_gbps:.0f} GB/s"
  )
  axes.grid(True, which="both", linestyle=":", alpha=0.4)
  axes.legend(loc="lower right", fontsize=9)
  axes.text(
    0.02,
    0.02,
    "points far under the roof are kernel launch overhead, not bandwidth:\n"
    "the roofline is an upper bound, not a latency prediction",
    transform=axes.transAxes,
    fontsize=8,
    color="#555555",
  )
  figure.tight_layout()
  return figure


def main() -> None:
  """Read the probe report and write the roofline image."""
  report_path = Path(sys.argv[1]) if len(sys.argv) > 1 else REPORT_PATH
  if not report_path.exists():
    raise SystemExit(f"run benchmark.roofline_probe first: {report_path} is missing")
  report = json.loads(report_path.read_text(encoding="utf-8"))
  figure = build_figure(report)
  OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
  figure.savefig(OUTPUT_PATH, dpi=160)
  print(f"wrote {OUTPUT_PATH}")


if __name__ == "__main__":
  main()
