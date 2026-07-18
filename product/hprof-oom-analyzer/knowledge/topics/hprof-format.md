---
type: Topic
title: hprof 포맷 요약
description: 파서(src/core/parser.ts)가 해석하는 HPROF 1.0.2 레코드 구조와 참조 그래프 구성 방식.
tags: [jvm, hprof, binary-format]
timestamp: 2026-07-18T00:00:00Z
---

## 파일 구조

빅 엔디안. 헤더는 null 종료 문자열 "JAVA PROFILE 1.0.2" + u4 identifier 크기(4 또는 8) + u8 타임스탬프다. 이후 레코드가 이어진다: u1 tag + u4 시간 오프셋 + u4 길이 + 본문. 길이 필드 덕분에 모르는 태그는 통째로 건너뛸 수 있다.

## 파서가 해석하는 레코드

| tag | 이름 | 내용 |
|---|---|---|
| 0x01 | UTF8 | 문자열 id → 텍스트. 클래스·필드·메서드 이름의 원천 |
| 0x02 | LOAD_CLASS | class serial, class 객체 id, 이름 문자열 id |
| 0x04 | FRAME | 스택 프레임: 메서드/소스 문자열 id, class serial, 라인 번호(-2 compiled, -3 native) |
| 0x05 | TRACE | trace serial, thread serial, 프레임 id 목록 |
| 0x0A | START_THREAD | thread serial, 스레드 객체 id, 이름 문자열 id |
| 0x0C, 0x1C | HEAP_DUMP(_SEGMENT) | 서브레코드 나열. 아래 표 참조 |

heap dump 서브레코드는 길이 필드가 없어서 종류별 구조를 알아야만 파싱을 진행할 수 있다. 모르는 서브태그를 만나면 그 지점에서 실패해야 한다(건너뛰기 불가).

| subtag | 이름 | 비고 |
|---|---|---|
| 0x01~0x08, 0xFF | GC ROOT 계열 | 0x08(THREAD_OBJ)은 thread serial과 trace serial을 함께 담아 스레드 복원에 쓴다 |
| 0x20 | CLASS_DUMP | super id, instance 크기, constant pool, static 필드(값 포함), instance 필드 선언(이름+타입만) |
| 0x21 | INSTANCE_DUMP | 필드 값 raw 바이트. 해석하려면 클래스 체인의 필드 선언 순서가 필요해 2-pass로 처리한다 |
| 0x22 | OBJECT_ARRAY_DUMP | 요소 id 목록 |
| 0x23 | PRIMITIVE_ARRAY_DUMP | 요소 타입 코드 + raw 데이터. 내용은 버리고 크기만 취한다 |

basic type 코드: 2=object, 4=boolean, 5=char, 6=float, 7=double, 8=byte, 9=short, 10=int, 11=long.

## 참조 그래프 구성 방식

- instance 필드 raw 바이트는 "자기 클래스 필드 → super 클래스 필드" 순서로 놓여 있다. CLASS_DUMP를 모두 읽은 뒤 클래스 체인을 따라가며 object 타입 필드 위치의 id만 뽑아 edge로 만든다.
- 클래스 자체도 힙 노드로 추가하고 static object 필드를 edge로 잇는다. static 캐시가 원인인 OOM은 이 edge 없이는 GC root 경로가 나오지 않는다.
- 스레드 스택은 ROOT_THREAD_OBJ의 trace serial → TRACE → FRAME → LOAD_CLASS/UTF8 순으로 역참조해 "클래스.메서드(소스:라인)" 문자열로 복원한다.

## 한계

- Android(ART)는 0x89 이후 확장 서브태그를 쓰므로 지원하지 않는다.
- OOM 시점 자동 덤프(HeapDumpOnOutOfMemoryError)는 스택 정보를 포함하지만, jmap 수동 덤프는 TRACE가 비어 있을 수 있다.
