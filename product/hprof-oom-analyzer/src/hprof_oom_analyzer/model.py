"""힙 스냅샷 데이터 모델."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class JavaClass:
  """CLASS_DUMP 레코드에서 읽은 클래스 정보."""

  class_id: int
  name: str
  super_id: int
  instance_size: int
  fields: list[tuple[str, int]]
  static_refs: list[tuple[str, int]]


@dataclass
class HeapObject:
  """힙에 있는 노드 하나. 인스턴스, 배열, 클래스 객체를 모두 표현한다."""

  obj_id: int
  class_name: str
  shallow_size: int
  refs: list[tuple[str, int]] = field(default_factory=list)


@dataclass
class GcRoot:
  """GC root 항목. kind는 root 종류(thread object, sticky class 등)다."""

  obj_id: int
  kind: str


@dataclass
class JavaThread:
  """스레드와 덤프 시점의 스택 프레임."""

  serial: int
  obj_id: int
  name: str
  frames: list[str] = field(default_factory=list)


@dataclass
class HeapSnapshot:
  """hprof 파일 하나를 파싱한 결과."""

  id_size: int
  classes: dict[int, JavaClass] = field(default_factory=dict)
  objects: dict[int, HeapObject] = field(default_factory=dict)
  roots: list[GcRoot] = field(default_factory=list)
  threads: list[JavaThread] = field(default_factory=list)
