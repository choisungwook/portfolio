"""테스트와 CI 스모크 테스트용 합성 hprof 파일 생성기.

작은 자바 힙을 흉내 낸다. main 스레드가 CacheHolder를 붙잡고,
CacheHolder의 cache 배열(Object[])이 2MB짜리 byte[]와
512KB짜리 byte[]를 물고 있는 구조다.
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

ID_SIZE = 8

# 문자열 id
S_OBJECT = 0x101
S_THREAD = 0x102
S_HOLDER = 0x103
S_OBJ_ARRAY = 0x104
S_CACHE = 0x105
S_HOLDER_FIELD = 0x106
S_MAIN = 0x107
S_RUN = 0x108
S_SOURCE = 0x109
S_INSTANCE = 0x10A

# 클래스 id
C_OBJECT = 0x1000
C_THREAD = 0x1001
C_HOLDER = 0x1002
C_OBJ_ARRAY = 0x1003

# 객체 id
O_THREAD = 0x2001
O_HOLDER = 0x2002
O_ARRAY = 0x2003
O_BIG_BYTES = 0x2004
O_SMALL_BYTES = 0x2005

FRAME_ID = 0x3001

BIG_ARRAY_LEN = 2 * 1024 * 1024
SMALL_ARRAY_LEN = 512 * 1024

TYPE_OBJECT = 2
TYPE_BYTE = 8


def write_sample(path: str | Path) -> None:
  """합성 hprof 파일을 path에 쓴다."""
  header = b"JAVA PROFILE 1.0.2\x00" + struct.pack(">IQ", ID_SIZE, 0)
  loads = (
    _load_class(1, C_OBJECT, S_OBJECT)
    + _load_class(2, C_THREAD, S_THREAD)
    + _load_class(3, C_HOLDER, S_HOLDER)
    + _load_class(4, C_OBJ_ARRAY, S_OBJ_ARRAY)
  )
  Path(path).write_bytes(header + _strings() + loads + _thread_records() + _heap_records())


def _id(value: int) -> bytes:
  return struct.pack(">Q", value)


def _u4(value: int) -> bytes:
  return struct.pack(">I", value)


def _u2(value: int) -> bytes:
  return struct.pack(">H", value)


def _u1(value: int) -> bytes:
  return struct.pack(">B", value)


def _record(tag: int, body: bytes) -> bytes:
  return struct.pack(">BII", tag, 0, len(body)) + body


def _utf8(string_id: int, text: str) -> bytes:
  return _record(0x01, _id(string_id) + text.encode())


def _load_class(serial: int, class_id: int, name_id: int) -> bytes:
  return _record(0x02, _u4(serial) + _id(class_id) + _u4(0) + _id(name_id))


def _strings() -> bytes:
  texts = {
    S_OBJECT: "java/lang/Object",
    S_THREAD: "java/lang/Thread",
    S_HOLDER: "com/example/CacheHolder",
    S_OBJ_ARRAY: "[Ljava/lang/Object;",
    S_CACHE: "cache",
    S_HOLDER_FIELD: "holder",
    S_MAIN: "main",
    S_RUN: "run",
    S_SOURCE: "CacheHolder.java",
    S_INSTANCE: "INSTANCE",
  }
  return b"".join(_utf8(string_id, text) for string_id, text in texts.items())


def _thread_records() -> bytes:
  frame = _record(0x04, _id(FRAME_ID) + _id(S_RUN) + _id(0) + _id(S_SOURCE) + _u4(3) + _u4(42))
  trace = _record(0x05, _u4(1) + _u4(1) + _u4(1) + _id(FRAME_ID))
  start = _record(0x0A, _u4(1) + _id(O_THREAD) + _u4(1) + _id(S_MAIN) + _id(0) + _id(0))
  return frame + trace + start


def _heap_records() -> bytes:
  body = b""
  body += _u1(0x08) + _id(O_THREAD) + _u4(1) + _u4(1)  # ROOT_THREAD_OBJECT
  body += _u1(0x05) + _id(C_HOLDER)  # ROOT_STICKY_CLASS
  body += _u1(0x20) + _class_dump(C_OBJECT, 0, [], [])
  body += _u1(0x20) + _class_dump(C_THREAD, C_OBJECT, [], [(S_HOLDER_FIELD, TYPE_OBJECT)])
  body += _u1(0x20) + _class_dump(C_HOLDER, C_OBJECT, [(S_INSTANCE, O_HOLDER)], [(S_CACHE, TYPE_OBJECT)])
  body += _u1(0x20) + _class_dump(C_OBJ_ARRAY, C_OBJECT, [], [])
  body += _u1(0x21) + _instance(O_THREAD, C_THREAD, _id(O_HOLDER))
  body += _u1(0x21) + _instance(O_HOLDER, C_HOLDER, _id(O_ARRAY))
  body += _u1(0x22) + _object_array(O_ARRAY, C_OBJ_ARRAY, [O_BIG_BYTES, O_SMALL_BYTES])
  body += _u1(0x23) + _byte_array(O_BIG_BYTES, BIG_ARRAY_LEN)
  body += _u1(0x23) + _byte_array(O_SMALL_BYTES, SMALL_ARRAY_LEN)
  return _record(0x1C, body) + _record(0x2C, b"")


def _class_dump(class_id: int, super_id: int, statics: list, fields: list) -> bytes:
  body = _id(class_id) + _u4(0) + _id(super_id) + _id(0) * 5 + _u4(16)
  body += _u2(0)  # constant pool
  body += _u2(len(statics))
  for name_id, value in statics:
    body += _id(name_id) + _u1(TYPE_OBJECT) + _id(value)
  body += _u2(len(fields))
  for name_id, field_type in fields:
    body += _id(name_id) + _u1(field_type)
  return body


def _instance(obj_id: int, class_id: int, field_data: bytes) -> bytes:
  return _id(obj_id) + _u4(0) + _id(class_id) + _u4(len(field_data)) + field_data


def _object_array(obj_id: int, class_id: int, elements: list[int]) -> bytes:
  body = _id(obj_id) + _u4(0) + _u4(len(elements)) + _id(class_id)
  return body + b"".join(_id(element) for element in elements)


def _byte_array(obj_id: int, length: int) -> bytes:
  return _id(obj_id) + _u4(0) + _u4(length) + _u1(TYPE_BYTE) + bytes(length)


if __name__ == "__main__":
  write_sample(sys.argv[1] if len(sys.argv) > 1 else "sample.hprof")
