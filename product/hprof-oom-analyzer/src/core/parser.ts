/**
 * HPROF 바이너리 파서.
 *
 * HPROF 1.0.2 형식에서 OOM 분석에 필요한 레코드만 해석한다.
 * 문자열, 클래스, 힙 덤프(객체/배열/GC root), 스레드 스택을 읽고
 * 나머지 레코드는 길이만큼 건너뛴다.
 */

import { readFileSync } from "node:fs";
import { GcRoot, HeapObject, HeapSnapshot, JavaClass, JavaThread } from "./model";

const TAG_UTF8 = 0x01;
const TAG_LOAD_CLASS = 0x02;
const TAG_FRAME = 0x04;
const TAG_TRACE = 0x05;
const TAG_START_THREAD = 0x0a;
const TAG_HEAP_DUMP = 0x0c;
const TAG_HEAP_DUMP_SEGMENT = 0x1c;

const SUB_CLASS_DUMP = 0x20;
const SUB_INSTANCE_DUMP = 0x21;
const SUB_OBJECT_ARRAY_DUMP = 0x22;
const SUB_PRIMITIVE_ARRAY_DUMP = 0x23;
const SUB_ROOT_THREAD_OBJECT = 0x08;

export const TYPE_OBJECT = 2;

const PRIMITIVE_SIZES: Record<number, number> = {
  4: 1, 5: 2, 6: 4, 7: 8, 8: 1, 9: 2, 10: 4, 11: 8,
};
const PRIMITIVE_NAMES: Record<number, string> = {
  4: "boolean", 5: "char", 6: "float", 7: "double",
  8: "byte", 9: "short", 10: "int", 11: "long",
};
const PRIMITIVE_CODES: Record<string, string> = {
  Z: "boolean", C: "char", F: "float", D: "double",
  B: "byte", S: "short", I: "int", J: "long",
};

/** 서브태그 → [root 종류, 추가 id 개수, 추가 u4 개수] */
const ROOT_SUBTAGS: Record<number, [string, number, number]> = {
  0xff: ["unknown", 0, 0],
  0x01: ["JNI global", 1, 0],
  0x02: ["JNI local", 0, 2],
  0x03: ["java frame", 0, 2],
  0x04: ["native stack", 0, 1],
  0x05: ["sticky class", 0, 0],
  0x06: ["thread block", 0, 1],
  0x07: ["monitor used", 0, 0],
};

// 객체/배열 헤더 크기 근사값. 정확한 값은 JVM 설정에 따라 다르다.
const OBJECT_HEADER = 16;
const ARRAY_HEADER = 20;

/** hprof 파일을 해석할 수 없을 때 발생한다. */
export class HprofParseError extends Error {}

/** 빅 엔디안 바이트 버퍼 커서. */
class Reader {
  pos = 0;

  constructor(readonly data: Buffer, readonly idSize: number) {}

  u1(): number {
    return this.data[this.pos++];
  }

  u2(): number {
    const value = this.data.readUInt16BE(this.pos);
    this.pos += 2;
    return value;
  }

  u4(): number {
    const value = this.data.readUInt32BE(this.pos);
    this.pos += 4;
    return value;
  }

  i4(): number {
    const value = this.data.readInt32BE(this.pos);
    this.pos += 4;
    return value;
  }

  u8(): number {
    const value = readU8(this.data, this.pos);
    this.pos += 8;
    return value;
  }

  readId(): number {
    return this.idSize === 8 ? this.u8() : this.u4();
  }

  slice(size: number): Buffer {
    const value = this.data.subarray(this.pos, this.pos + size);
    this.pos += size;
    return value;
  }

  skip(size: number): void {
    this.pos += size;
  }

  eof(): boolean {
    return this.pos >= this.data.length;
  }
}

interface RawClass {
  superId: number;
  instanceSize: number;
  statics: [number, number][];
  fields: [number, number][];
}

/** hprof 파일 전체를 파싱해 HeapSnapshot을 만든다. */
export class HprofParser {
  private readonly reader: Reader;
  private readonly snapshot: HeapSnapshot;
  private readonly strings = new Map<number, string>();
  private readonly classNameIds = new Map<number, number>();
  private readonly serialClassIds = new Map<number, number>();
  private readonly rawClasses = new Map<number, RawClass>();
  private readonly rawInstances: { objId: number; classId: number; data: Buffer }[] = [];
  private readonly rawObjectArrays: { objId: number; classId: number; elements: number[] }[] = [];
  private readonly frames = new Map<number, { methodId: number; sourceId: number; classSerial: number; line: number }>();
  private readonly traces = new Map<number, { threadSerial: number; frameIds: number[] }>();
  private readonly startThreads: { serial: number; objId: number; nameId: number }[] = [];
  private readonly threadRoots: { objId: number; threadSerial: number; traceSerial: number }[] = [];

  constructor(data: Buffer) {
    const { idSize, bodyOffset } = parseHeader(data);
    this.reader = new Reader(data, idSize);
    this.reader.pos = bodyOffset;
    this.snapshot = { idSize, classes: new Map(), objects: new Map(), roots: [], threads: [] };
  }

  /** 최상위 레코드를 순회해 스냅샷을 만든다. */
  parse(): HeapSnapshot {
    const reader = this.reader;
    while (!reader.eof()) {
      const tag = reader.u1();
      reader.skip(4); // timestamp offset
      const length = reader.u4();
      const end = reader.pos + length;
      this.parseRecord(tag, end);
      reader.pos = end;
    }
    this.finalize();
    return this.snapshot;
  }

  private parseRecord(tag: number, end: number): void {
    if (tag === TAG_UTF8) this.parseUtf8(end);
    else if (tag === TAG_LOAD_CLASS) this.parseLoadClass();
    else if (tag === TAG_FRAME) this.parseFrame();
    else if (tag === TAG_TRACE) this.parseTrace();
    else if (tag === TAG_START_THREAD) this.parseStartThread();
    else if (tag === TAG_HEAP_DUMP || tag === TAG_HEAP_DUMP_SEGMENT) this.parseHeapDump(end);
  }

  private parseUtf8(end: number): void {
    const stringId = this.reader.readId();
    this.strings.set(stringId, this.reader.slice(end - this.reader.pos).toString("utf-8"));
  }

  private parseLoadClass(): void {
    const reader = this.reader;
    const serial = reader.u4();
    const classId = reader.readId();
    reader.skip(4); // stacktrace serial
    const nameId = reader.readId();
    this.classNameIds.set(classId, nameId);
    this.serialClassIds.set(serial, classId);
  }

  private parseFrame(): void {
    const reader = this.reader;
    const frameId = reader.readId();
    const methodId = reader.readId();
    reader.readId(); // method signature
    const sourceId = reader.readId();
    const classSerial = reader.u4();
    const line = reader.i4();
    this.frames.set(frameId, { methodId, sourceId, classSerial, line });
  }

  private parseTrace(): void {
    const reader = this.reader;
    const serial = reader.u4();
    const threadSerial = reader.u4();
    const count = reader.u4();
    const frameIds = Array.from({ length: count }, () => reader.readId());
    this.traces.set(serial, { threadSerial, frameIds });
  }

  private parseStartThread(): void {
    const reader = this.reader;
    const serial = reader.u4();
    const objId = reader.readId();
    reader.skip(4); // stacktrace serial
    const nameId = reader.readId();
    this.startThreads.push({ serial, objId, nameId });
  }

  private parseHeapDump(end: number): void {
    const reader = this.reader;
    while (reader.pos < end) {
      const subtag = reader.u1();
      if (subtag in ROOT_SUBTAGS) this.parseRoot(subtag);
      else if (subtag === SUB_ROOT_THREAD_OBJECT) this.parseThreadRoot();
      else if (subtag === SUB_CLASS_DUMP) this.parseClassDump();
      else if (subtag === SUB_INSTANCE_DUMP) this.parseInstanceDump();
      else if (subtag === SUB_OBJECT_ARRAY_DUMP) this.parseObjectArray();
      else if (subtag === SUB_PRIMITIVE_ARRAY_DUMP) this.parsePrimitiveArray();
      else throw new HprofParseError(`지원하지 않는 heap dump 서브태그: 0x${subtag.toString(16)}`);
    }
  }

  private parseRoot(subtag: number): void {
    const reader = this.reader;
    const [kind, extraIds, extraU4s] = ROOT_SUBTAGS[subtag];
    const objId = reader.readId();
    reader.skip(extraIds * reader.idSize + extraU4s * 4);
    this.snapshot.roots.push({ objId, kind });
  }

  private parseThreadRoot(): void {
    const reader = this.reader;
    const objId = reader.readId();
    const threadSerial = reader.u4();
    const traceSerial = reader.u4();
    this.snapshot.roots.push({ objId, kind: "thread object" });
    this.threadRoots.push({ objId, threadSerial, traceSerial });
  }

  private parseClassDump(): void {
    const reader = this.reader;
    const classId = reader.readId();
    reader.skip(4); // stacktrace serial
    const superId = reader.readId();
    reader.skip(5 * reader.idSize); // loader, signers, protection domain, reserved x2
    const instanceSize = reader.u4();
    this.skipConstantPool();
    const statics = this.readStaticFields();
    const fieldCount = reader.u2();
    const fields: [number, number][] = [];
    for (let i = 0; i < fieldCount; i++) fields.push([reader.readId(), reader.u1()]);
    this.rawClasses.set(classId, { superId, instanceSize, statics, fields });
  }

  private skipConstantPool(): void {
    const reader = this.reader;
    const count = reader.u2();
    for (let i = 0; i < count; i++) {
      reader.skip(2); // constant pool index
      reader.skip(this.valueSize(reader.u1()));
    }
  }

  private readStaticFields(): [number, number][] {
    const reader = this.reader;
    const statics: [number, number][] = [];
    const count = reader.u2();
    for (let i = 0; i < count; i++) {
      const nameId = reader.readId();
      const fieldType = reader.u1();
      if (fieldType !== TYPE_OBJECT) {
        reader.skip(PRIMITIVE_SIZES[fieldType]);
        continue;
      }
      const value = reader.readId();
      if (value) statics.push([nameId, value]);
    }
    return statics;
  }

  private valueSize(fieldType: number): number {
    return fieldType === TYPE_OBJECT ? this.reader.idSize : PRIMITIVE_SIZES[fieldType];
  }

  private parseInstanceDump(): void {
    const reader = this.reader;
    const objId = reader.readId();
    reader.skip(4); // stacktrace serial
    const classId = reader.readId();
    const size = reader.u4();
    this.rawInstances.push({ objId, classId, data: reader.slice(size) });
  }

  private parseObjectArray(): void {
    const reader = this.reader;
    const objId = reader.readId();
    reader.skip(4); // stacktrace serial
    const count = reader.u4();
    const classId = reader.readId();
    const elements = Array.from({ length: count }, () => reader.readId());
    this.rawObjectArrays.push({ objId, classId, elements });
  }

  private parsePrimitiveArray(): void {
    const reader = this.reader;
    const objId = reader.readId();
    reader.skip(4); // stacktrace serial
    const count = reader.u4();
    const elemType = reader.u1();
    reader.skip(count * PRIMITIVE_SIZES[elemType]);
    const shallowSize = ARRAY_HEADER + count * PRIMITIVE_SIZES[elemType];
    const className = `${PRIMITIVE_NAMES[elemType]}[]`;
    this.snapshot.objects.set(objId, { objId, className, shallowSize, refs: [] });
  }

  private finalize(): void {
    this.buildClasses();
    this.buildClassObjects();
    this.buildInstances();
    this.buildObjectArrays();
    this.buildThreads();
  }

  private className(classId: number): string {
    const nameId = this.classNameIds.get(classId);
    const raw = (nameId !== undefined && this.strings.get(nameId)) || `class-0x${classId.toString(16)}`;
    return normalizeClassName(raw);
  }

  private buildClasses(): void {
    for (const [classId, raw] of this.rawClasses) {
      this.snapshot.classes.set(classId, {
        classId,
        name: this.className(classId),
        superId: raw.superId,
        instanceSize: raw.instanceSize,
        fields: raw.fields.map(([nameId, type]) => [this.strings.get(nameId) ?? "?", type]),
        staticRefs: raw.statics.map(([nameId, value]) => [this.strings.get(nameId) ?? "?", value]),
      });
    }
  }

  /** 클래스 객체를 힙 노드로 추가한다. static 필드 참조가 여기서 이어진다. */
  private buildClassObjects(): void {
    for (const javaClass of this.snapshot.classes.values()) {
      this.snapshot.objects.set(javaClass.classId, {
        objId: javaClass.classId,
        className: `class ${javaClass.name}`,
        shallowSize: OBJECT_HEADER,
        refs: javaClass.staticRefs.map(([name, value]) => [`static ${name}`, value]),
      });
    }
  }

  private buildInstances(): void {
    for (const { objId, classId, data } of this.rawInstances) {
      const javaClass = this.snapshot.classes.get(classId);
      this.snapshot.objects.set(objId, {
        objId,
        className: javaClass ? javaClass.name : this.className(classId),
        shallowSize: OBJECT_HEADER + data.length,
        refs: this.instanceRefs(classId, data),
      });
    }
  }

  /** 필드 데이터에서 객체 참조만 뽑는다. 클래스 체인을 따라 필드 순서대로 읽는다. */
  private instanceRefs(classId: number, data: Buffer): [string, number][] {
    const refs: [string, number][] = [];
    const idSize = this.reader.idSize;
    let pos = 0;
    let current = this.snapshot.classes.get(classId);
    while (current) {
      for (const [name, fieldType] of current.fields) {
        if (fieldType === TYPE_OBJECT) {
          const value = idSize === 8 ? readU8(data, pos) : data.readUInt32BE(pos);
          pos += idSize;
          if (value) refs.push([name, value]);
        } else {
          pos += PRIMITIVE_SIZES[fieldType];
        }
      }
      current = this.snapshot.classes.get(current.superId);
    }
    return refs;
  }

  private buildObjectArrays(): void {
    for (const { objId, classId, elements } of this.rawObjectArrays) {
      const refs: [string, number][] = [];
      elements.forEach((element, i) => {
        if (element) refs.push([`[${i}]`, element]);
      });
      this.snapshot.objects.set(objId, {
        objId,
        className: this.className(classId),
        shallowSize: ARRAY_HEADER + elements.length * this.reader.idSize,
        refs,
      });
    }
  }

  private buildThreads(): void {
    const threads = new Map<number, JavaThread>();
    for (const { serial, objId, nameId } of this.startThreads) {
      const name = this.strings.get(nameId) ?? `thread-${serial}`;
      threads.set(serial, { serial, objId, name, frames: [] });
    }
    for (const { objId, threadSerial, traceSerial } of this.threadRoots) {
      let thread = threads.get(threadSerial);
      if (!thread) {
        thread = { serial: threadSerial, objId, name: `thread-${threadSerial}`, frames: [] };
        threads.set(threadSerial, thread);
      }
      thread.objId = objId;
      thread.frames = this.resolveFrames(threadSerial, traceSerial);
    }
    this.snapshot.threads = [...threads.values()].sort((a, b) => a.serial - b.serial);
  }

  private resolveFrames(threadSerial: number, traceSerial: number): string[] {
    let trace = this.traces.get(traceSerial);
    if (!trace) {
      trace = [...this.traces.values()].find((t) => t.threadSerial === threadSerial);
    }
    if (!trace) return [];
    return trace.frameIds.map((frameId) => this.formatFrame(frameId));
  }

  private formatFrame(frameId: number): string {
    const frame = this.frames.get(frameId);
    if (!frame) return `<frame 0x${frameId.toString(16)}>`;
    const className = this.className(this.serialClassIds.get(frame.classSerial) ?? 0);
    const method = this.strings.get(frame.methodId) ?? "?";
    const source = this.strings.get(frame.sourceId) ?? "?";
    return `${className}.${method}(${source}${lineSuffix(frame.line)})`;
  }
}

/**
 * u8을 number로 읽는다. 상위 32비트 x 2^32 + 하위 32비트 조합이라
 * 2^53을 넘는 id는 정밀도를 잃지만, 실제 힙 주소 범위에서는 문제가 없다.
 */
function readU8(data: Buffer, pos: number): number {
  return data.readUInt32BE(pos) * 0x1_0000_0000 + data.readUInt32BE(pos + 4);
}

/** 헤더에서 identifier 크기와 본문 시작 위치를 읽는다. */
function parseHeader(data: Buffer): { idSize: number; bodyOffset: number } {
  const nul = data.indexOf(0);
  if (nul < 0 || !data.subarray(0, nul).toString("latin1").startsWith("JAVA PROFILE")) {
    throw new HprofParseError("hprof 파일이 아니다 (헤더 불일치)");
  }
  const idSize = data.readUInt32BE(nul + 1);
  if (idSize !== 4 && idSize !== 8) {
    throw new HprofParseError(`지원하지 않는 identifier 크기: ${idSize}`);
  }
  return { idSize, bodyOffset: nul + 1 + 4 + 8 };
}

function lineSuffix(line: number): string {
  if (line > 0) return `:${line}`;
  if (line === -2) return ", compiled";
  if (line === -3) return ", native";
  return "";
}

/** JVM 내부 클래스 표기를 자바 소스 표기로 바꾼다. 예: [B → byte[] */
export function normalizeClassName(raw: string): string {
  let dims = 0;
  let name = raw;
  while (name.startsWith("[")) {
    dims += 1;
    name = name.slice(1);
  }
  if (dims && name.startsWith("L") && name.endsWith(";")) {
    name = name.slice(1, -1);
  } else if (dims && name in PRIMITIVE_CODES) {
    name = PRIMITIVE_CODES[name];
  }
  return name.replaceAll("/", ".") + "[]".repeat(dims);
}

/** hprof 버퍼를 파싱해 HeapSnapshot을 만든다. */
export function parseHprofBuffer(data: Buffer): HeapSnapshot {
  return new HprofParser(data).parse();
}

/** hprof 파일을 읽어 HeapSnapshot을 만든다. */
export function parseHprof(path: string): HeapSnapshot {
  return parseHprofBuffer(readFileSync(path));
}
