/**
 * 테스트와 CI 스모크 테스트용 합성 hprof 생성기.
 *
 * 작은 자바 힙을 흉내 낸다. main 스레드가 CacheHolder를 붙잡고,
 * CacheHolder의 cache 배열(Object[])이 2MB짜리 byte[]와
 * 512KB짜리 byte[]를 물고 있는 구조다.
 */

import { writeFileSync } from "node:fs";

const ID_SIZE = 8;

// 문자열 id
const S_OBJECT = 0x101;
const S_THREAD = 0x102;
const S_HOLDER = 0x103;
const S_OBJ_ARRAY = 0x104;
const S_CACHE = 0x105;
const S_HOLDER_FIELD = 0x106;
const S_MAIN = 0x107;
const S_RUN = 0x108;
const S_SOURCE = 0x109;
const S_INSTANCE = 0x10a;

// 클래스 id
const C_OBJECT = 0x1000;
const C_THREAD = 0x1001;
export const C_HOLDER = 0x1002;
const C_OBJ_ARRAY = 0x1003;

// 객체 id
export const O_THREAD = 0x2001;
export const O_HOLDER = 0x2002;
export const O_ARRAY = 0x2003;
export const O_BIG_BYTES = 0x2004;
export const O_SMALL_BYTES = 0x2005;

const FRAME_ID = 0x3001;

export const BIG_ARRAY_LEN = 2 * 1024 * 1024;
export const SMALL_ARRAY_LEN = 512 * 1024;

const TYPE_OBJECT = 2;
const TYPE_BYTE = 8;

/** 합성 hprof 전체를 Buffer로 만든다. */
export function buildSample(): Buffer {
  const header = Buffer.concat([
    Buffer.from("JAVA PROFILE 1.0.2\0", "latin1"),
    u4(ID_SIZE),
    u4(0),
    u4(0), // timestamp u8
  ]);
  const loads = Buffer.concat([
    loadClass(1, C_OBJECT, S_OBJECT),
    loadClass(2, C_THREAD, S_THREAD),
    loadClass(3, C_HOLDER, S_HOLDER),
    loadClass(4, C_OBJ_ARRAY, S_OBJ_ARRAY),
  ]);
  return Buffer.concat([header, strings(), loads, threadRecords(), heapRecords()]);
}

/** 합성 hprof 파일을 path에 쓴다. */
export function writeSample(path: string): void {
  writeFileSync(path, buildSample());
}

function id(value: number): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(value / 0x1_0000_0000), 0);
  buf.writeUInt32BE(value >>> 0, 4);
  return buf;
}

function u4(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value, 0);
  return buf;
}

function u2(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(value, 0);
  return buf;
}

function u1(value: number): Buffer {
  return Buffer.from([value]);
}

function record(tag: number, body: Buffer): Buffer {
  return Buffer.concat([u1(tag), u4(0), u4(body.length), body]);
}

function utf8(stringId: number, text: string): Buffer {
  return record(0x01, Buffer.concat([id(stringId), Buffer.from(text, "utf-8")]));
}

function loadClass(serial: number, classId: number, nameId: number): Buffer {
  return record(0x02, Buffer.concat([u4(serial), id(classId), u4(0), id(nameId)]));
}

function strings(): Buffer {
  const texts: [number, string][] = [
    [S_OBJECT, "java/lang/Object"],
    [S_THREAD, "java/lang/Thread"],
    [S_HOLDER, "com/example/CacheHolder"],
    [S_OBJ_ARRAY, "[Ljava/lang/Object;"],
    [S_CACHE, "cache"],
    [S_HOLDER_FIELD, "holder"],
    [S_MAIN, "main"],
    [S_RUN, "run"],
    [S_SOURCE, "CacheHolder.java"],
    [S_INSTANCE, "INSTANCE"],
  ];
  return Buffer.concat(texts.map(([stringId, text]) => utf8(stringId, text)));
}

function threadRecords(): Buffer {
  const frame = record(
    0x04,
    Buffer.concat([id(FRAME_ID), id(S_RUN), id(0), id(S_SOURCE), u4(3), u4(42)]),
  );
  const trace = record(0x05, Buffer.concat([u4(1), u4(1), u4(1), id(FRAME_ID)]));
  const start = record(
    0x0a,
    Buffer.concat([u4(1), id(O_THREAD), u4(1), id(S_MAIN), id(0), id(0)]),
  );
  return Buffer.concat([frame, trace, start]);
}

function heapRecords(): Buffer {
  const body = Buffer.concat([
    u1(0x08), id(O_THREAD), u4(1), u4(1), // ROOT_THREAD_OBJECT
    u1(0x05), id(C_HOLDER), // ROOT_STICKY_CLASS
    u1(0x20), classDump(C_OBJECT, 0, [], []),
    u1(0x20), classDump(C_THREAD, C_OBJECT, [], [[S_HOLDER_FIELD, TYPE_OBJECT]]),
    u1(0x20), classDump(C_HOLDER, C_OBJECT, [[S_INSTANCE, O_HOLDER]], [[S_CACHE, TYPE_OBJECT]]),
    u1(0x20), classDump(C_OBJ_ARRAY, C_OBJECT, [], []),
    u1(0x21), instance(O_THREAD, C_THREAD, id(O_HOLDER)),
    u1(0x21), instance(O_HOLDER, C_HOLDER, id(O_ARRAY)),
    u1(0x22), objectArray(O_ARRAY, C_OBJ_ARRAY, [O_BIG_BYTES, O_SMALL_BYTES]),
    u1(0x23), byteArray(O_BIG_BYTES, BIG_ARRAY_LEN),
    u1(0x23), byteArray(O_SMALL_BYTES, SMALL_ARRAY_LEN),
  ]);
  return Buffer.concat([record(0x1c, body), record(0x2c, Buffer.alloc(0))]);
}

function classDump(
  classId: number, superId: number, statics: [number, number][], fields: [number, number][],
): Buffer {
  const parts = [id(classId), u4(0), id(superId), id(0), id(0), id(0), id(0), id(0), u4(16)];
  parts.push(u2(0)); // constant pool
  parts.push(u2(statics.length));
  for (const [nameId, value] of statics) parts.push(id(nameId), u1(TYPE_OBJECT), id(value));
  parts.push(u2(fields.length));
  for (const [nameId, fieldType] of fields) parts.push(id(nameId), u1(fieldType));
  return Buffer.concat(parts);
}

function instance(objId: number, classId: number, fieldData: Buffer): Buffer {
  return Buffer.concat([id(objId), u4(0), id(classId), u4(fieldData.length), fieldData]);
}

function objectArray(objId: number, classId: number, elements: number[]): Buffer {
  const head = Buffer.concat([id(objId), u4(0), u4(elements.length), id(classId)]);
  return Buffer.concat([head, ...elements.map((element) => id(element))]);
}

function byteArray(objId: number, length: number): Buffer {
  return Buffer.concat([id(objId), u4(0), u4(length), u1(TYPE_BYTE), Buffer.alloc(length)]);
}
