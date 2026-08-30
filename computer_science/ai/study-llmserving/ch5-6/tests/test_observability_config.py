"""Verify GPU observability sampling and dashboard units."""

import json
from pathlib import Path

ROOT = Path(__file__).parents[1]


def dashboard_panel(panel_id: int) -> dict:
  """Return one provisioned Grafana panel by numeric ID."""
  dashboard_path = ROOT / "observability/grafana/dashboards/llm-serving.json"
  dashboard = json.loads(dashboard_path.read_text(encoding="utf-8"))
  return next(panel for panel in dashboard["panels"] if panel["id"] == panel_id)


def test_gpu_collection_intervals_capture_short_peaks() -> None:
  """Keep DCGM collection and Prometheus scraping at one second."""
  compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
  prometheus = (ROOT / "observability/prometheus.yml").read_text(encoding="utf-8")
  assert 'DCGM_EXPORTER_INTERVAL: "${DCGM_EXPORTER_INTERVAL_MS:-1000}"' in compose
  assert "scrape_interval: 1s" in prometheus


def test_gpu_vram_panel_uses_mib_and_rolling_peak() -> None:
  """Display DCGM MiB without losing short model-load peaks."""
  panel = dashboard_panel(11)
  assert panel["fieldConfig"]["defaults"]["unit"] == "mbytes"
  assert panel["targets"][0]["expr"] == "max(max_over_time(DCGM_FI_DEV_FB_USED[5s]))"


def test_gpu_utilization_panel_uses_rolling_peak() -> None:
  """Keep brief GPU busy samples visible in Grafana."""
  panel = dashboard_panel(12)
  assert panel["targets"][0]["expr"] == "max(max_over_time(DCGM_FI_DEV_GPU_UTIL[5s]))"


def test_handson_exposes_compose_commands_without_make_targets() -> None:
  """Keep environment and benchmark commands visible in every hands-on document."""
  for document_path in (ROOT / "docs/handson").glob("*.md"):
    document = document_path.read_text(encoding="utf-8")
    assert "make " not in document


def test_runtime_image_can_render_roofline_plot() -> None:
  """Install the plotting dependency used by the documented Compose command."""
  dockerfile = (ROOT / "docker/Dockerfile").read_text(encoding="utf-8")
  assert '"matplotlib>=3.10"' in dockerfile
