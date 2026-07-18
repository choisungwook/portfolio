"""분석 결과를 텍스트로 만든다. CLI 리포트와 GUI가 함께 쓴다."""

from __future__ import annotations

from . import analyzer
from .model import HeapSnapshot


def format_size(size: int) -> str:
  """바이트 수를 사람이 읽기 좋은 단위로 바꾼다."""
  if size < 1024:
    return f"{size} B"
  value = size / 1024
  for unit in ("KB", "MB", "GB", "TB"):
    if value < 1024:
      return f"{value:,.1f} {unit}"
    value /= 1024
  return f"{value:,.1f} PB"


def render_report(
  snapshot: HeapSnapshot,
  top_n: int = analyzer.DEFAULT_TOP_N,
  large_min: int = analyzer.DEFAULT_LARGE_OBJECT_MIN,
) -> str:
  """히스토그램, GC root 경로, 큰 객체, 스레드 스택을 묶은 리포트를 만든다."""
  stats = analyzer.class_histogram(snapshot)
  analyzer.compute_retained(snapshot, stats, top_n)
  large = analyzer.find_large_objects(snapshot, large_min)
  referrers = analyzer.build_referrers(snapshot)
  sections = [
    _render_histogram(stats[:top_n]),
    _render_gc_paths(snapshot, referrers, large[:5]),
    _render_large_objects(large, large_min),
    render_threads(snapshot),
  ]
  return "\n\n".join(sections)


def render_path(steps: list[analyzer.PathStep] | None) -> list[str]:
  """GC root 경로를 들여쓰기된 줄 목록으로 만든다."""
  if not steps:
    return ["  (GC root에서 도달할 수 없음 — 이미 수집 대상)"]
  return [
    f"{'  ' * i}{step.ref_name} → {step.class_name} (0x{step.obj_id:x})"
    for i, step in enumerate(steps)
  ]


def render_threads(snapshot: HeapSnapshot) -> str:
  """스레드별 스택 프레임 목록을 만든다."""
  lines = ["== 스레드 스택 =="]
  if not snapshot.threads:
    lines.append("스레드 정보가 없다.")
  for thread in snapshot.threads:
    lines.append(f'\n"{thread.name}" (serial {thread.serial})')
    if thread.frames:
      lines.extend(f"  at {frame}" for frame in thread.frames)
    else:
      lines.append("  (스택 정보 없음)")
  return "\n".join(lines)


def _render_histogram(stats: list[analyzer.ClassStat]) -> str:
  lines = [
    f"== 클래스별 메모리 사용 top {len(stats)} ==",
    f"{'class':<52} {'count':>10} {'shallow':>12} {'retained(근사)':>14}",
  ]
  for stat in stats:
    retained = format_size(stat.retained) if stat.retained is not None else "-"
    lines.append(
      f"{stat.name:<52} {stat.count:>10,} {format_size(stat.shallow):>12} {retained:>14}"
    )
  return "\n".join(lines)


def _render_gc_paths(snapshot, referrers, targets) -> str:
  lines = ["== 상위 객체의 GC root 경로 =="]
  if not targets:
    lines.append("표시할 객체가 없다.")
  for obj in targets:
    lines.append(f"\n[{obj.class_name} 0x{obj.obj_id:x}, {format_size(obj.shallow_size)}]")
    lines.extend(render_path(analyzer.path_to_gc_root(snapshot, referrers, obj.obj_id)))
  return "\n".join(lines)


def _render_large_objects(targets, min_size: int) -> str:
  lines = [f"== {format_size(min_size)} 이상 단일 객체 ({len(targets)}개) =="]
  if not targets:
    lines.append("없음")
  for obj in targets:
    lines.append(f"  {format_size(obj.shallow_size):>12}  {obj.class_name}  (0x{obj.obj_id:x})")
  return "\n".join(lines)
