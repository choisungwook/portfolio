/** 분석 결과를 텍스트로 만든다. CLI 리포트가 쓴다. */

import * as analyzer from "./analyzer";
import { HeapObject, HeapSnapshot } from "./model";

/** 바이트 수를 사람이 읽기 좋은 단위로 바꾼다. */
export function formatSize(size: number): string {
  if (size < 1024) return `${size} B`;
  let value = size / 1024;
  for (const unit of ["KB", "MB", "GB", "TB"]) {
    if (value < 1024) return `${value.toFixed(1)} ${unit}`;
    value /= 1024;
  }
  return `${value.toFixed(1)} PB`;
}

/** 히스토그램, GC root 경로, 큰 객체, 스레드 스택을 묶은 리포트를 만든다. */
export function renderReport(
  snapshot: HeapSnapshot,
  topN: number = analyzer.DEFAULT_TOP_N,
  largeMin: number = analyzer.DEFAULT_LARGE_OBJECT_MIN,
): string {
  const stats = analyzer.classHistogram(snapshot);
  analyzer.computeRetained(snapshot, stats, topN);
  const large = analyzer.findLargeObjects(snapshot, largeMin);
  const referrers = analyzer.buildReferrers(snapshot);
  return [
    renderHistogram(stats.slice(0, topN)),
    renderGcPaths(snapshot, referrers, large.slice(0, 5)),
    renderLargeObjects(large, largeMin),
    renderThreads(snapshot),
  ].join("\n\n");
}

/** GC root 경로를 들여쓰기된 줄 목록으로 만든다. */
export function renderPath(steps: analyzer.PathStep[] | null): string[] {
  if (!steps || steps.length === 0) {
    return ["  (GC root에서 도달할 수 없음 — 이미 수집 대상)"];
  }
  return steps.map(
    (step, i) => `${"  ".repeat(i)}${step.refName} → ${step.className} (0x${step.objId.toString(16)})`,
  );
}

/** 스레드별 스택 프레임 목록을 만든다. */
export function renderThreads(snapshot: HeapSnapshot): string {
  const lines = ["== 스레드 스택 =="];
  if (snapshot.threads.length === 0) lines.push("스레드 정보가 없다.");
  for (const thread of snapshot.threads) {
    lines.push(`\n"${thread.name}" (serial ${thread.serial})`);
    if (thread.frames.length > 0) {
      lines.push(...thread.frames.map((frame) => `  at ${frame}`));
    } else {
      lines.push("  (스택 정보 없음)");
    }
  }
  return lines.join("\n");
}

function renderHistogram(stats: analyzer.ClassStat[]): string {
  const lines = [
    `== 클래스별 메모리 사용 top ${stats.length} ==`,
    `${"class".padEnd(52)} ${"count".padStart(10)} ${"shallow".padStart(12)} ${"retained(근사)".padStart(14)}`,
  ];
  for (const stat of stats) {
    const retained = stat.retained !== null ? formatSize(stat.retained) : "-";
    lines.push(
      `${stat.name.padEnd(52)} ${stat.count.toLocaleString("en-US").padStart(10)}` +
        ` ${formatSize(stat.shallow).padStart(12)} ${retained.padStart(14)}`,
    );
  }
  return lines.join("\n");
}

function renderGcPaths(
  snapshot: HeapSnapshot, referrers: analyzer.Referrers, targets: HeapObject[],
): string {
  const lines = ["== 상위 객체의 GC root 경로 =="];
  if (targets.length === 0) lines.push("표시할 객체가 없다.");
  for (const obj of targets) {
    lines.push(`\n[${obj.className} 0x${obj.objId.toString(16)}, ${formatSize(obj.shallowSize)}]`);
    lines.push(...renderPath(analyzer.pathToGcRoot(snapshot, referrers, obj.objId)));
  }
  return lines.join("\n");
}

function renderLargeObjects(targets: HeapObject[], minSize: number): string {
  const lines = [`== ${formatSize(minSize)} 이상 단일 객체 (${targets.length}개) ==`];
  if (targets.length === 0) lines.push("없음");
  for (const obj of targets) {
    lines.push(
      `  ${formatSize(obj.shallowSize).padStart(12)}  ${obj.className}  (0x${obj.objId.toString(16)})`,
    );
  }
  return lines.join("\n");
}
