/** 합성 hprof를 파싱해 4가지 분석 기능을 검증한다. */

import { beforeAll, describe, expect, it } from "vitest";
import * as analyzer from "../src/core/analyzer";
import { HeapSnapshot } from "../src/core/model";
import { normalizeClassName, parseHprofBuffer } from "../src/core/parser";
import { renderReport } from "../src/core/report";
import * as synthetic from "../src/tools/synthetic";

let snapshot: HeapSnapshot;

beforeAll(() => {
  snapshot = parseHprofBuffer(synthetic.buildSample());
});

describe("클래스별 히스토그램", () => {
  it("byte[]가 1위이고 개수와 크기가 맞는다", () => {
    const stats = analyzer.classHistogram(snapshot);
    expect(stats[0].name).toBe("byte[]");
    expect(stats[0].count).toBe(2);
    expect(stats[0].shallow).toBeGreaterThanOrEqual(
      synthetic.BIG_ARRAY_LEN + synthetic.SMALL_ARRAY_LEN,
    );
  });

  it("retained 근사값이 참조 그래프를 반영한다", () => {
    const stats = analyzer.classHistogram(snapshot);
    analyzer.computeRetained(snapshot, stats);
    const byName = new Map(stats.map((stat) => [stat.name, stat]));
    expect(byName.get("byte[]")!.retained).toBeGreaterThanOrEqual(
      synthetic.BIG_ARRAY_LEN + synthetic.SMALL_ARRAY_LEN,
    );
    expect(byName.get("com.example.CacheHolder")!.retained).toBeGreaterThanOrEqual(
      synthetic.BIG_ARRAY_LEN,
    );
  });
});

describe("큰 단일 객체 탐지", () => {
  it("1MB 이상 객체만 찾는다", () => {
    const large = analyzer.findLargeObjects(snapshot);
    expect(large.map((obj) => obj.objId)).toEqual([synthetic.O_BIG_BYTES]);
  });
});

describe("GC root 경로", () => {
  it("2MB byte[]에서 root까지의 사슬을 찾는다", () => {
    const referrers = analyzer.buildReferrers(snapshot);
    const steps = analyzer.pathToGcRoot(snapshot, referrers, synthetic.O_BIG_BYTES);
    expect(steps).not.toBeNull();
    expect(steps![0].refName).toMatch(/^GC root/);
    expect(steps![steps!.length - 1].objId).toBe(synthetic.O_BIG_BYTES);
    expect(steps![steps!.length - 1].className).toBe("byte[]");
  });

  it("도달 불가능한 객체는 null을 돌려준다", () => {
    const lone: HeapSnapshot = {
      idSize: 8,
      classes: new Map(),
      objects: new Map([[1, { objId: 1, className: "Lonely", shallowSize: 16, refs: [] }]]),
      roots: [{ objId: 99, kind: "unknown" }],
      threads: [],
    };
    expect(analyzer.pathToGcRoot(lone, analyzer.buildReferrers(lone), 1)).toBeNull();
  });
});

describe("스레드 스택", () => {
  it("main 스레드와 프레임을 복원한다", () => {
    const threads = new Map(snapshot.threads.map((thread) => [thread.name, thread]));
    expect(threads.has("main")).toBe(true);
    expect(threads.get("main")!.frames).toEqual([
      "com.example.CacheHolder.run(CacheHolder.java:42)",
    ]);
  });
});

describe("텍스트 리포트", () => {
  it("네 섹션이 모두 렌더링된다", () => {
    const text = renderReport(snapshot);
    expect(text).toContain("클래스별 메모리 사용");
    expect(text).toContain("byte[]");
    expect(text).toContain("GC root");
    expect(text).toContain('"main"');
  });
});

describe("클래스 이름 정규화", () => {
  it("JVM 내부 표기를 자바 표기로 바꾼다", () => {
    expect(normalizeClassName("[B")).toBe("byte[]");
    expect(normalizeClassName("[[I")).toBe("int[][]");
    expect(normalizeClassName("[Ljava/lang/String;")).toBe("java.lang.String[]");
    expect(normalizeClassName("java/util/HashMap")).toBe("java.util.HashMap");
  });
});
