/** 힙 스냅샷 데이터 모델. */

/** CLASS_DUMP 레코드에서 읽은 클래스 정보. fields는 [필드 이름, basic type] 쌍이다. */
export interface JavaClass {
  classId: number;
  name: string;
  superId: number;
  instanceSize: number;
  fields: [string, number][];
  staticRefs: [string, number][];
}

/** 힙에 있는 노드 하나. 인스턴스, 배열, 클래스 객체를 모두 표현한다.
 * refs는 [참조 이름, 대상 객체 id] 쌍이다. */
export interface HeapObject {
  objId: number;
  className: string;
  shallowSize: number;
  refs: [string, number][];
}

/** GC root 항목. kind는 root 종류(thread object, sticky class 등)다. */
export interface GcRoot {
  objId: number;
  kind: string;
}

/** 스레드와 덤프 시점의 스택 프레임. */
export interface JavaThread {
  serial: number;
  objId: number;
  name: string;
  frames: string[];
}

/** hprof 파일 하나를 파싱한 결과. */
export interface HeapSnapshot {
  idSize: number;
  classes: Map<number, JavaClass>;
  objects: Map<number, HeapObject>;
  roots: GcRoot[];
  threads: JavaThread[];
}
