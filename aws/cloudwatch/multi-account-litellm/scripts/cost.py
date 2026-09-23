"""방안별 월 비용 추정기.

ap-northeast-2 단가(2026-09 AWS Price List API)와 로컬 lab 측정값으로 방안마다 월 비용을 계산한다.
가정은 Workload에, 측정값은 Measured에 모여 있다. 값을 바꿔 가며 어느 규모에서 순위가 바뀌는지 본다.

사용법:
  uv run scripts/cost.py
  uv run scripts/cost.py --prod-replicas 6 --prod-combos 300 --viewers 30
  uv run scripts/cost.py --slim
"""

import argparse
from dataclasses import dataclass, replace

SECONDS_PER_MONTH = 30 * 24 * 3600
HOURS_PER_MONTH = 730
GB = 1024**3

# ap-northeast-2, USD. 2026-09 AWS Price List API 기준
PRICE = {
  "cw_custom_metric": [(10_000, 0.30), (240_000, 0.10), (750_000, 0.05), (float("inf"), 0.02)],
  "cw_custom_metric_free": 10,
  "cw_logs_ingest_gb": 0.76,
  "cw_logs_storage_gb": 0.0314,
  "cw_logs_insights_gb": 0.0076,
  "cw_otlp_ingest_gb": 0.50,
  "amp_ingest_per_10m": [(2_000_000_000, 0.90), (250_000_000_000, 0.35), (float("inf"), 0.16)],
  "amp_ingest_free_samples": 40_000_000,
  "amp_storage_gb": 0.03,
  "amp_storage_free_gb": 10,
  "amg_editor": 9.0,
  "amg_viewer": 5.0,
  "fargate_arm_vcpu_hour": 0.03725,
  "fargate_arm_gb_hour": 0.00409,
  "efs_standard_gb": 0.33,
  "lb_hour": 0.0225,
  "alb_lcu_hour": 0.008,
  "privatelink_endpoint_az_hour": 0.013,
  "privatelink_gb": 0.01,
}


@dataclass(frozen=True)
class Workload:
  """사용 규모 가정. 계정별 replica 수와 replica 하나가 보는 key×model 조합 수가 metric 양을 정한다."""

  dev_replicas: int = 1
  prod_replicas: int = 3
  dev_combos: int = 15
  prod_combos: int = 60
  teams: int = 10
  models: int = 6
  scrape_interval_s: int = 30
  dev_log_gb_per_day: float = 0.2
  prod_log_gb_per_day: float = 1.0
  log_storage_ratio: float = 0.2
  log_scan_gb_per_month: float = 500
  retention_days: int = 90
  editors: int = 2
  viewers: int = 10
  privatelink_azs: int = 2


@dataclass(frozen=True)
class Measured:
  """LiteLLM v1.102.1 로컬 lab 측정값. 조합은 요청이 성공한 key×model 쌍이다. 방법은 docs/9-cost.md에 있다."""

  base_series_per_replica: int = 28
  series_per_combo: int = 89
  otlp_bytes_per_sample: float = 91
  remote_write_bytes_per_sample: float = 8
  emf_bytes_per_combo_scrape: float = 3_200
  vm_bytes_per_sample: float = 1.0
  amp_bytes_per_sample: float = 2.0


def tiered(amount: float, tiers: list[tuple[float, float]]) -> float:
  """구간별 단가를 누적 적용한다. tiers는 (구간 크기, 단가) 목록이다."""
  total, remaining = 0.0, amount
  for size, unit_price in tiers:
    used = min(remaining, size)
    total += used * unit_price
    remaining -= used
    if remaining <= 0:
      break
  return total


def fargate_monthly(vcpu: float, memory_gb: float) -> float:
  """ARM Fargate task 하나의 월 비용."""
  hourly = vcpu * PRICE["fargate_arm_vcpu_hour"] + memory_gb * PRICE["fargate_arm_gb_hour"]
  return hourly * HOURS_PER_MONTH


def replica_combos(w: Workload) -> list[int]:
  """replica마다 보는 조합 수 목록. replica 하나가 series를 따로 낸다."""
  return [w.dev_combos] * w.dev_replicas + [w.prod_combos] * w.prod_replicas


def total_series(w: Workload, m: Measured) -> int:
  """모든 replica의 active series 합."""
  return sum(m.base_series_per_replica + m.series_per_combo * c for c in replica_combos(w))


def samples_per_month(w: Workload, m: Measured) -> float:
  """한 달 동안 저장소에 들어가는 sample 수."""
  return total_series(w, m) * SECONDS_PER_MONTH / w.scrape_interval_s


def common_costs(w: Workload) -> dict[str, float]:
  """방안과 무관하게 드는 비용. LiteLLM 로그는 모든 방안이 CloudWatch Logs에 그대로 둔다."""
  ingest_gb = (w.dev_log_gb_per_day + w.prod_log_gb_per_day) * 30
  stored_gb = (w.dev_log_gb_per_day + w.prod_log_gb_per_day) * w.retention_days * w.log_storage_ratio
  return {
    "LiteLLM 로그 수집": ingest_gb * PRICE["cw_logs_ingest_gb"],
    "LiteLLM 로그 보관(90일)": stored_gb * PRICE["cw_logs_storage_gb"],
    "로그 조회(Logs Insights)": w.log_scan_gb_per_month * PRICE["cw_logs_insights_gb"],
    "계정별 수집기 task 2개": 2 * fargate_monthly(0.25, 0.5),
  }


def emf_costs(w: Workload, m: Measured) -> dict[str, float]:
  """방안 1·2. counter 5개를 model·team·전체 세 dimension 조합으로 CloudWatch custom metric에 올린다."""
  metrics_per_account = 5 * (w.models + w.teams + 1)
  billable = 2 * max(metrics_per_account - PRICE["cw_custom_metric_free"], 0)
  scrapes = SECONDS_PER_MONTH / w.scrape_interval_s
  emf_gb = sum(replica_combos(w)) * m.emf_bytes_per_combo_scrape * scrapes / GB
  return {
    "LiteLLM custom metric": tiered(billable, PRICE["cw_custom_metric"]),
    "EMF 로그 수집": emf_gb * PRICE["cw_logs_ingest_gb"],
  }


def selfhosted_costs(w: Workload, m: Measured) -> dict[str, float]:
  """방안 3. VictoriaMetrics + Grafana on Fargate, EFS, Grafana ALB, remote write용 NLB·PrivateLink."""
  samples = samples_per_month(w, m)
  stored_gb = samples * m.vm_bytes_per_sample * (w.retention_days / 30) / GB
  write_gb = samples * m.remote_write_bytes_per_sample / GB
  alb = (PRICE["lb_hour"] + 0.5 * PRICE["alb_lcu_hour"]) * HOURS_PER_MONTH
  return {
    "VictoriaMetrics task(1vCPU/2GB)": fargate_monthly(1, 2),
    "Grafana task(0.5vCPU/1GB)": fargate_monthly(0.5, 1),
    "EFS": (stored_gb + 1) * PRICE["efs_standard_gb"],
    "Grafana ALB": alb,
    "remote write NLB": PRICE["lb_hour"] * HOURS_PER_MONTH,
    "PrivateLink endpoint(2계정)": 2 * w.privatelink_azs * PRICE["privatelink_endpoint_az_hour"] * HOURS_PER_MONTH,
    "PrivateLink 처리량": write_gb * PRICE["privatelink_gb"],
  }


def amp_costs(w: Workload, m: Measured) -> dict[str, float]:
  """AMP 수집·보관. 쿼리 비용은 월 200B sample 무료 구간 안이라고 가정한다."""
  samples = samples_per_month(w, m)
  billable_samples = max(samples - PRICE["amp_ingest_free_samples"], 0)
  stored_gb = samples * m.amp_bytes_per_sample * (w.retention_days / 30) / GB
  return {
    "AMP 수집": tiered(billable_samples / 10_000_000, [(s / 10_000_000, p) for s, p in PRICE["amp_ingest_per_10m"]]),
    "AMP 보관": max(stored_gb - PRICE["amp_storage_free_gb"], 0) * PRICE["amp_storage_gb"],
  }


def amg_costs(w: Workload) -> dict[str, float]:
  """AMG 사용자 license. 그 달에 로그인한 사용자만 과금된다."""
  return {"AMG license": w.editors * PRICE["amg_editor"] + w.viewers * PRICE["amg_viewer"]}


def grafana_on_fargate_costs() -> dict[str, float]:
  """AMG 대신 Grafana를 직접 띄울 때. viewer 수와 무관하다."""
  alb = (PRICE["lb_hour"] + 0.5 * PRICE["alb_lcu_hour"]) * HOURS_PER_MONTH
  return {"Grafana task + ALB": fargate_monthly(0.5, 1) + alb}


def otlp_costs(w: Workload, m: Measured) -> dict[str, float]:
  """추가 방안 A. CloudWatch OTLP 수집. 15개월 보관이 포함되고 콘솔 PromQL 조회는 무료다."""
  gb = samples_per_month(w, m) * m.otlp_bytes_per_sample / GB
  return {"CloudWatch OTLP 수집": gb * PRICE["cw_otlp_ingest_gb"]}


def option_costs(w: Workload, m: Measured) -> dict[str, dict[str, float]]:
  """방안 이름 → 항목별 월 비용. 공통 비용은 따로 계산한다."""
  return {
    "1. 계정별 CloudWatch": emf_costs(w, m),
    "2. OAM 중앙 CloudWatch": emf_costs(w, m),
    "3. VictoriaMetrics+Grafana": selfhosted_costs(w, m),
    "4. AMP+AMG": {**amp_costs(w, m), **amg_costs(w)},
    "A. CloudWatch OTLP+PromQL": otlp_costs(w, m),
    "B. AMP+Grafana(Fargate)": {**amp_costs(w, m), **grafana_on_fargate_costs()},
  }


def print_report(title: str, w: Workload, m: Measured) -> None:
  """시나리오 하나의 가정, 공통 비용, 방안별 비용을 Markdown 표로 출력한다."""
  print(f"## {title}\n")
  print(f"- replica: dev {w.dev_replicas}, prod {w.prod_replicas} / 조합(key×model): dev {w.dev_combos}, prod {w.prod_combos}")
  print(f"- active series {total_series(w, m):,}개, 월 sample {samples_per_month(w, m) / 1e9:.2f}B개 (scrape {w.scrape_interval_s}s)")
  print(f"- viewer {w.viewers}명, editor {w.editors}명\n")
  common = common_costs(w)
  print("| 공통 항목 | 월 USD |\n|---|---:|")
  for name, cost in common.items():
    print(f"| {name} | {cost:,.1f} |")
  print(f"| **공통 합계** | **{sum(common.values()):,.1f}** |\n")
  print("| 방안 | 항목 | 방안 추가 비용 | 공통 포함 합계 |\n|---|---|---:|---:|")
  for option, items in option_costs(w, m).items():
    detail = ", ".join(f"{k} {v:,.1f}" for k, v in items.items())
    extra = sum(items.values())
    print(f"| {option} | {detail} | {extra:,.1f} | {extra + sum(common.values()):,.1f} |")
  print()


SLIM_SERIES_PER_COMBO = 52


def parse_args() -> argparse.Namespace:
  """자주 바꾸는 가정만 인자로 받는다."""
  parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
  parser.add_argument("--slim", action="store_true", help="histogram 4종과 client_ip·user_agent label을 뺀 설정의 측정값을 쓴다")
  parser.add_argument("--prod-replicas", type=int)
  parser.add_argument("--prod-combos", type=int)
  parser.add_argument("--dev-combos", type=int)
  parser.add_argument("--viewers", type=int)
  parser.add_argument("--scrape-interval", type=int, dest="scrape_interval_s")
  return parser.parse_args()


def main() -> None:
  """인자가 없으면 기준·대규모 두 시나리오를, 규모 인자가 있으면 그 값으로 한 시나리오를 출력한다."""
  parsed = parse_args()
  measured = Measured(series_per_combo=SLIM_SERIES_PER_COMBO) if parsed.slim else Measured()
  overrides = {k: v for k, v in vars(parsed).items() if v is not None and k != "slim"}
  if overrides:
    print_report("사용자 지정", replace(Workload(), **overrides), measured)
    return
  print_report("기준 시나리오", Workload(), measured)
  print_report("대규모 시나리오", Workload(prod_replicas=6, prod_combos=300, dev_combos=40, viewers=30, editors=4), measured)


if __name__ == "__main__":
  main()
