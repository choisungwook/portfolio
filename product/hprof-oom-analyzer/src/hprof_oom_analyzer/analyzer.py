"""HeapSnapshot에서 OOM 원인 분석에 쓰는 통계를 계산한다."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass

from .model import HeapObject, HeapSnapshot

DEFAULT_TOP_N = 20
DEFAULT_LARGE_OBJECT_MIN = 1 << 20  # 1MB


@dataclass
class ClassStat:
  """클래스 하나의 히스토그램 항목. retained는 근사값이고 top-N만 계산한다."""

  name: str
  count: int = 0
  shallow: int = 0
  retained: int | None = None


@dataclass
class PathStep:
  """GC root 경로의 한 단계. ref_name은 이 객체를 가리킨 참조 이름이다."""

  obj_id: int
  class_name: str
  ref_name: str


def class_histogram(snapshot: HeapSnapshot) -> list[ClassStat]:
  """클래스별 객체 수와 shallow size 합계를 큰 순서로 돌려준다."""
  stats: dict[str, ClassStat] = {}
  for obj in snapshot.objects.values():
    stat = stats.setdefault(obj.class_name, ClassStat(name=obj.class_name))
    stat.count += 1
    stat.shallow += obj.shallow_size
  return sorted(stats.values(), key=lambda s: s.shallow, reverse=True)


def compute_retained(
  snapshot: HeapSnapshot, stats: list[ClassStat], top_n: int = DEFAULT_TOP_N,
) -> None:
  """상위 클래스의 retained size 근사값을 채운다.

  정확한 dominator tree 대신, 그 클래스 인스턴스를 전부 제거했을 때
  GC root에서 도달 가능한 바이트가 얼마나 줄어드는지로 근사한다.
  """
  base = _reachable_bytes(snapshot, exclude_class=None)
  for stat in stats[:top_n]:
    stat.retained = base - _reachable_bytes(snapshot, exclude_class=stat.name)


def _reachable_bytes(snapshot: HeapSnapshot, exclude_class: str | None) -> int:
  """GC root에서 도달 가능한 바이트 합. exclude_class 인스턴스는 없는 셈 친다."""
  total = 0
  seen: set[int] = set()
  queue = deque(root.obj_id for root in snapshot.roots)
  while queue:
    obj = snapshot.objects.get(queue.popleft())
    if obj is None or obj.obj_id in seen:
      continue
    seen.add(obj.obj_id)
    if obj.class_name == exclude_class:
      continue
    total += obj.shallow_size
    queue.extend(target for _, target in obj.refs)
  return total


def find_large_objects(
  snapshot: HeapSnapshot, min_size: int = DEFAULT_LARGE_OBJECT_MIN,
) -> list[HeapObject]:
  """shallow size가 min_size 이상인 단일 객체를 큰 순서로 돌려준다."""
  large = [obj for obj in snapshot.objects.values() if obj.shallow_size >= min_size]
  return sorted(large, key=lambda o: o.shallow_size, reverse=True)


def largest_instance_of(snapshot: HeapSnapshot, class_name: str) -> HeapObject | None:
  """해당 클래스에서 shallow size가 가장 큰 인스턴스를 돌려준다."""
  instances = (o for o in snapshot.objects.values() if o.class_name == class_name)
  return max(instances, key=lambda o: o.shallow_size, default=None)


def build_referrers(snapshot: HeapSnapshot) -> dict[int, list[tuple[int, str]]]:
  """객체 → 그 객체를 참조하는 (referrer id, 참조 이름) 목록 인덱스를 만든다."""
  referrers: dict[int, list[tuple[int, str]]] = {}
  for obj in snapshot.objects.values():
    for ref_name, target in obj.refs:
      referrers.setdefault(target, []).append((obj.obj_id, ref_name))
  return referrers


def path_to_gc_root(
  snapshot: HeapSnapshot,
  referrers: dict[int, list[tuple[int, str]]],
  obj_id: int,
) -> list[PathStep] | None:
  """객체를 GC root까지 붙잡는 최단 참조 사슬을 root → 객체 순서로 돌려준다."""
  root_kinds = {root.obj_id: root.kind for root in snapshot.roots}
  came_from: dict[int, tuple[int, str]] = {}
  seen = {obj_id}
  queue = deque([obj_id])
  while queue:
    current = queue.popleft()
    if current in root_kinds:
      return _rebuild_path(snapshot, came_from, root_kinds[current], current, obj_id)
    for referrer_id, ref_name in referrers.get(current, ()):
      if referrer_id not in seen:
        seen.add(referrer_id)
        came_from[referrer_id] = (current, ref_name)
        queue.append(referrer_id)
  return None


def _rebuild_path(
  snapshot: HeapSnapshot,
  came_from: dict[int, tuple[int, str]],
  root_kind: str,
  root_id: int,
  obj_id: int,
) -> list[PathStep]:
  steps = [PathStep(obj_id=root_id, class_name=_name_of(snapshot, root_id), ref_name=f"GC root ({root_kind})")]
  current = root_id
  while current != obj_id:
    child, ref_name = came_from[current]
    steps.append(PathStep(obj_id=child, class_name=_name_of(snapshot, child), ref_name=ref_name))
    current = child
  return steps


def _name_of(snapshot: HeapSnapshot, obj_id: int) -> str:
  obj = snapshot.objects.get(obj_id)
  return obj.class_name if obj else f"<unknown 0x{obj_id:x}>"
