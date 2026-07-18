"""HPROF 바이너리 파서.

HPROF 1.0.2 형식에서 OOM 분석에 필요한 레코드만 해석한다.
문자열, 클래스, 힙 덤프(객체/배열/GC root), 스레드 스택을 읽고
나머지 레코드는 길이만큼 건너뛴다.
"""

from __future__ import annotations

import struct
from pathlib import Path

from .model import GcRoot, HeapObject, HeapSnapshot, JavaClass, JavaThread

TAG_UTF8 = 0x01
TAG_LOAD_CLASS = 0x02
TAG_FRAME = 0x04
TAG_TRACE = 0x05
TAG_START_THREAD = 0x0A
TAG_HEAP_DUMP = 0x0C
TAG_HEAP_DUMP_SEGMENT = 0x1C

SUB_CLASS_DUMP = 0x20
SUB_INSTANCE_DUMP = 0x21
SUB_OBJECT_ARRAY_DUMP = 0x22
SUB_PRIMITIVE_ARRAY_DUMP = 0x23
SUB_ROOT_THREAD_OBJECT = 0x08

TYPE_OBJECT = 2
PRIMITIVE_SIZES = {4: 1, 5: 2, 6: 4, 7: 8, 8: 1, 9: 2, 10: 4, 11: 8}
PRIMITIVE_NAMES = {
  4: "boolean", 5: "char", 6: "float", 7: "double",
  8: "byte", 9: "short", 10: "int", 11: "long",
}
PRIMITIVE_CODES = {
  "Z": "boolean", "C": "char", "F": "float", "D": "double",
  "B": "byte", "S": "short", "I": "int", "J": "long",
}

# 서브태그 → (root 종류, 추가 id 개수, 추가 u4 개수)
ROOT_SUBTAGS = {
  0xFF: ("unknown", 0, 0),
  0x01: ("JNI global", 1, 0),
  0x02: ("JNI local", 0, 2),
  0x03: ("java frame", 0, 2),
  0x04: ("native stack", 0, 1),
  0x05: ("sticky class", 0, 0),
  0x06: ("thread block", 0, 1),
  0x07: ("monitor used", 0, 0),
}

# 객체/배열 헤더 크기 근사값. 정확한 값은 JVM 설정에 따라 다르다.
OBJECT_HEADER = 16
ARRAY_HEADER = 20


class HprofParseError(Exception):
  """hprof 파일을 해석할 수 없을 때 발생한다."""


class _Reader:
  """빅 엔디안 바이트 버퍼 커서."""

  def __init__(self, data: bytes, id_size: int) -> None:
    self.data = data
    self.pos = 0
    self.id_size = id_size

  def u1(self) -> int:
    self.pos += 1
    return self.data[self.pos - 1]

  def u2(self) -> int:
    return self._unpack(">H", 2)

  def u4(self) -> int:
    return self._unpack(">I", 4)

  def i4(self) -> int:
    return self._unpack(">i", 4)

  def u8(self) -> int:
    return self._unpack(">Q", 8)

  def read_id(self) -> int:
    return self.u8() if self.id_size == 8 else self.u4()

  def read_bytes(self, size: int) -> bytes:
    self.pos += size
    return self.data[self.pos - size : self.pos]

  def skip(self, size: int) -> None:
    self.pos += size

  def eof(self) -> bool:
    return self.pos >= len(self.data)

  def _unpack(self, fmt: str, size: int) -> int:
    value = struct.unpack_from(fmt, self.data, self.pos)[0]
    self.pos += size
    return value


class HprofParser:
  """hprof 파일 전체를 파싱해 HeapSnapshot을 만든다."""

  def __init__(self, data: bytes) -> None:
    id_size, body_offset = _parse_header(data)
    self.reader = _Reader(data, id_size)
    self.reader.pos = body_offset
    self.snapshot = HeapSnapshot(id_size=id_size)
    self._init_state()

  def _init_state(self) -> None:
    self.strings: dict[int, str] = {}
    self.class_name_ids: dict[int, int] = {}
    self.serial_class_ids: dict[int, int] = {}
    self.raw_classes: dict[int, tuple] = {}
    self.raw_instances: list[tuple[int, int, bytes]] = []
    self.raw_object_arrays: list[tuple[int, int, list[int]]] = []
    self.frames: dict[int, tuple] = {}
    self.traces: dict[int, tuple[int, list[int]]] = {}
    self.start_threads: list[tuple[int, int, int]] = []
    self.thread_roots: list[tuple[int, int, int]] = []

  def parse(self) -> HeapSnapshot:
    """최상위 레코드를 순회해 스냅샷을 만든다."""
    reader = self.reader
    while not reader.eof():
      tag = reader.u1()
      reader.skip(4)  # timestamp offset
      length = reader.u4()
      end = reader.pos + length
      self._parse_record(tag, end)
      reader.pos = end
    self._finalize()
    return self.snapshot

  def _parse_record(self, tag: int, end: int) -> None:
    if tag == TAG_UTF8:
      self._parse_utf8(end)
    elif tag == TAG_LOAD_CLASS:
      self._parse_load_class()
    elif tag == TAG_FRAME:
      self._parse_frame()
    elif tag == TAG_TRACE:
      self._parse_trace()
    elif tag == TAG_START_THREAD:
      self._parse_start_thread()
    elif tag in (TAG_HEAP_DUMP, TAG_HEAP_DUMP_SEGMENT):
      self._parse_heap_dump(end)

  def _parse_utf8(self, end: int) -> None:
    string_id = self.reader.read_id()
    raw = self.reader.read_bytes(end - self.reader.pos)
    self.strings[string_id] = raw.decode("utf-8", errors="replace")

  def _parse_load_class(self) -> None:
    reader = self.reader
    serial = reader.u4()
    class_id = reader.read_id()
    reader.skip(4)  # stacktrace serial
    name_id = reader.read_id()
    self.class_name_ids[class_id] = name_id
    self.serial_class_ids[serial] = class_id

  def _parse_frame(self) -> None:
    reader = self.reader
    frame_id = reader.read_id()
    method_id = reader.read_id()
    reader.read_id()  # method signature
    source_id = reader.read_id()
    class_serial = reader.u4()
    line = reader.i4()
    self.frames[frame_id] = (method_id, source_id, class_serial, line)

  def _parse_trace(self) -> None:
    reader = self.reader
    serial = reader.u4()
    thread_serial = reader.u4()
    count = reader.u4()
    self.traces[serial] = (thread_serial, [reader.read_id() for _ in range(count)])

  def _parse_start_thread(self) -> None:
    reader = self.reader
    serial = reader.u4()
    obj_id = reader.read_id()
    reader.skip(4)  # stacktrace serial
    name_id = reader.read_id()
    self.start_threads.append((serial, obj_id, name_id))

  def _parse_heap_dump(self, end: int) -> None:
    reader = self.reader
    while reader.pos < end:
      subtag = reader.u1()
      if subtag in ROOT_SUBTAGS:
        self._parse_root(subtag)
      elif subtag == SUB_ROOT_THREAD_OBJECT:
        self._parse_thread_root()
      elif subtag == SUB_CLASS_DUMP:
        self._parse_class_dump()
      elif subtag == SUB_INSTANCE_DUMP:
        self._parse_instance_dump()
      elif subtag == SUB_OBJECT_ARRAY_DUMP:
        self._parse_object_array()
      elif subtag == SUB_PRIMITIVE_ARRAY_DUMP:
        self._parse_primitive_array()
      else:
        raise HprofParseError(f"지원하지 않는 heap dump 서브태그: 0x{subtag:02X}")

  def _parse_root(self, subtag: int) -> None:
    reader = self.reader
    kind, extra_ids, extra_u4s = ROOT_SUBTAGS[subtag]
    obj_id = reader.read_id()
    reader.skip(extra_ids * reader.id_size + extra_u4s * 4)
    self.snapshot.roots.append(GcRoot(obj_id=obj_id, kind=kind))

  def _parse_thread_root(self) -> None:
    reader = self.reader
    obj_id = reader.read_id()
    thread_serial = reader.u4()
    trace_serial = reader.u4()
    self.snapshot.roots.append(GcRoot(obj_id=obj_id, kind="thread object"))
    self.thread_roots.append((obj_id, thread_serial, trace_serial))

  def _parse_class_dump(self) -> None:
    reader = self.reader
    class_id = reader.read_id()
    reader.skip(4)  # stacktrace serial
    super_id = reader.read_id()
    reader.skip(5 * reader.id_size)  # loader, signers, protection domain, reserved x2
    instance_size = reader.u4()
    self._skip_constant_pool()
    statics = self._read_static_fields()
    fields = [(reader.read_id(), reader.u1()) for _ in range(reader.u2())]
    self.raw_classes[class_id] = (super_id, instance_size, statics, fields)

  def _skip_constant_pool(self) -> None:
    reader = self.reader
    for _ in range(reader.u2()):
      reader.skip(2)  # constant pool index
      reader.skip(self._value_size(reader.u1()))

  def _read_static_fields(self) -> list[tuple[int, int]]:
    reader = self.reader
    statics: list[tuple[int, int]] = []
    for _ in range(reader.u2()):
      name_id = reader.read_id()
      field_type = reader.u1()
      if field_type != TYPE_OBJECT:
        reader.skip(PRIMITIVE_SIZES[field_type])
        continue
      value = reader.read_id()
      if value:
        statics.append((name_id, value))
    return statics

  def _value_size(self, field_type: int) -> int:
    if field_type == TYPE_OBJECT:
      return self.reader.id_size
    return PRIMITIVE_SIZES[field_type]

  def _parse_instance_dump(self) -> None:
    reader = self.reader
    obj_id = reader.read_id()
    reader.skip(4)  # stacktrace serial
    class_id = reader.read_id()
    size = reader.u4()
    self.raw_instances.append((obj_id, class_id, reader.read_bytes(size)))

  def _parse_object_array(self) -> None:
    reader = self.reader
    obj_id = reader.read_id()
    reader.skip(4)  # stacktrace serial
    count = reader.u4()
    class_id = reader.read_id()
    elements = [reader.read_id() for _ in range(count)]
    self.raw_object_arrays.append((obj_id, class_id, elements))

  def _parse_primitive_array(self) -> None:
    reader = self.reader
    obj_id = reader.read_id()
    reader.skip(4)  # stacktrace serial
    count = reader.u4()
    elem_type = reader.u1()
    reader.skip(count * PRIMITIVE_SIZES[elem_type])
    size = ARRAY_HEADER + count * PRIMITIVE_SIZES[elem_type]
    name = PRIMITIVE_NAMES[elem_type] + "[]"
    self.snapshot.objects[obj_id] = HeapObject(obj_id=obj_id, class_name=name, shallow_size=size)

  def _finalize(self) -> None:
    self._build_classes()
    self._build_class_objects()
    self._build_instances()
    self._build_object_arrays()
    self._build_threads()

  def _class_name(self, class_id: int) -> str:
    name_id = self.class_name_ids.get(class_id)
    raw = self.strings.get(name_id, f"class-0x{class_id:x}")
    return normalize_class_name(raw)

  def _build_classes(self) -> None:
    for class_id, (super_id, instance_size, statics, fields) in self.raw_classes.items():
      self.snapshot.classes[class_id] = JavaClass(
        class_id=class_id,
        name=self._class_name(class_id),
        super_id=super_id,
        instance_size=instance_size,
        fields=[(self.strings.get(name_id, "?"), t) for name_id, t in fields],
        static_refs=[(self.strings.get(name_id, "?"), v) for name_id, v in statics],
      )

  def _build_class_objects(self) -> None:
    """클래스 객체를 힙 노드로 추가한다. static 필드 참조가 여기서 이어진다."""
    for java_class in self.snapshot.classes.values():
      self.snapshot.objects[java_class.class_id] = HeapObject(
        obj_id=java_class.class_id,
        class_name=f"class {java_class.name}",
        shallow_size=OBJECT_HEADER,
        refs=[(f"static {name}", v) for name, v in java_class.static_refs],
      )

  def _build_instances(self) -> None:
    for obj_id, class_id, data in self.raw_instances:
      java_class = self.snapshot.classes.get(class_id)
      name = java_class.name if java_class else self._class_name(class_id)
      self.snapshot.objects[obj_id] = HeapObject(
        obj_id=obj_id,
        class_name=name,
        shallow_size=OBJECT_HEADER + len(data),
        refs=self._instance_refs(class_id, data),
      )

  def _instance_refs(self, class_id: int, data: bytes) -> list[tuple[str, int]]:
    """필드 데이터에서 객체 참조만 뽑는다. 클래스 체인을 따라 필드 순서대로 읽는다."""
    refs: list[tuple[str, int]] = []
    pos = 0
    current = self.snapshot.classes.get(class_id)
    while current is not None:
      for name, field_type in current.fields:
        if field_type == TYPE_OBJECT:
          value = int.from_bytes(data[pos : pos + self.reader.id_size], "big")
          pos += self.reader.id_size
          if value:
            refs.append((name, value))
        else:
          pos += PRIMITIVE_SIZES[field_type]
      current = self.snapshot.classes.get(current.super_id)
    return refs

  def _build_object_arrays(self) -> None:
    for obj_id, class_id, elements in self.raw_object_arrays:
      refs = [(f"[{i}]", element) for i, element in enumerate(elements) if element]
      size = ARRAY_HEADER + len(elements) * self.reader.id_size
      self.snapshot.objects[obj_id] = HeapObject(
        obj_id=obj_id, class_name=self._class_name(class_id), shallow_size=size, refs=refs,
      )

  def _build_threads(self) -> None:
    threads: dict[int, JavaThread] = {}
    for serial, obj_id, name_id in self.start_threads:
      name = self.strings.get(name_id, f"thread-{serial}")
      threads[serial] = JavaThread(serial=serial, obj_id=obj_id, name=name)
    for obj_id, thread_serial, trace_serial in self.thread_roots:
      thread = threads.setdefault(
        thread_serial, JavaThread(serial=thread_serial, obj_id=obj_id, name=f"thread-{thread_serial}"),
      )
      thread.obj_id = obj_id
      thread.frames = self._resolve_frames(thread_serial, trace_serial)
    self.snapshot.threads = sorted(threads.values(), key=lambda t: t.serial)

  def _resolve_frames(self, thread_serial: int, trace_serial: int) -> list[str]:
    trace = self.traces.get(trace_serial)
    if trace is None:
      matches = (t for t in self.traces.values() if t[0] == thread_serial)
      trace = next(matches, None)
    if trace is None:
      return []
    return [self._format_frame(frame_id) for frame_id in trace[1]]

  def _format_frame(self, frame_id: int) -> str:
    frame = self.frames.get(frame_id)
    if frame is None:
      return f"<frame 0x{frame_id:x}>"
    method_id, source_id, class_serial, line = frame
    class_name = self._class_name(self.serial_class_ids.get(class_serial, 0))
    method = self.strings.get(method_id, "?")
    source = self.strings.get(source_id, "?")
    return f"{class_name}.{method}({source}{_line_suffix(line)})"


def _parse_header(data: bytes) -> tuple[int, int]:
  """헤더에서 identifier 크기와 본문 시작 위치를 읽는다."""
  nul = data.find(b"\x00")
  if nul < 0 or not data[:nul].startswith(b"JAVA PROFILE"):
    raise HprofParseError("hprof 파일이 아니다 (헤더 불일치)")
  id_size = struct.unpack_from(">I", data, nul + 1)[0]
  if id_size not in (4, 8):
    raise HprofParseError(f"지원하지 않는 identifier 크기: {id_size}")
  return id_size, nul + 1 + 4 + 8


def _line_suffix(line: int) -> str:
  if line > 0:
    return f":{line}"
  if line == -2:
    return ", compiled"
  if line == -3:
    return ", native"
  return ""


def normalize_class_name(raw: str) -> str:
  """JVM 내부 클래스 표기를 자바 소스 표기로 바꾼다. 예: [B → byte[]"""
  dims = 0
  name = raw
  while name.startswith("["):
    dims += 1
    name = name[1:]
  if dims and name.startswith("L") and name.endswith(";"):
    name = name[1:-1]
  elif dims and name in PRIMITIVE_CODES:
    name = PRIMITIVE_CODES[name]
  return name.replace("/", ".") + "[]" * dims


def parse_hprof(path: str | Path) -> HeapSnapshot:
  """hprof 파일을 읽어 HeapSnapshot을 만든다."""
  data = Path(path).read_bytes()
  return HprofParser(data).parse()
