/** HeapSnapshot에서 OOM 원인 분석에 쓰는 통계를 계산한다. */

import { HeapObject, HeapSnapshot } from "./model";

export const DEFAULT_TOP_N = 20;
export const DEFAULT_LARGE_OBJECT_MIN = 1 << 20; // 1MB

/** 클래스 하나의 히스토그램 항목. retained는 근사값이고 top-N만 계산한다. */
export interface ClassStat {
  name: string;
  count: number;
  shallow: number;
  retained: number | null;
}

/** GC root 경로의 한 단계. refName은 이 객체를 가리킨 참조 이름이다. */
export interface PathStep {
  objId: number;
  className: string;
  refName: string;
}

/** 객체 → 그 객체를 참조하는 [referrer id, 참조 이름] 목록 인덱스. */
export type Referrers = Map<number, [number, string][]>;

/** 클래스별 객체 수와 shallow size 합계를 큰 순서로 돌려준다. */
export function classHistogram(snapshot: HeapSnapshot): ClassStat[] {
  const stats = new Map<string, ClassStat>();
  for (const obj of snapshot.objects.values()) {
    let stat = stats.get(obj.className);
    if (!stat) {
      stat = { name: obj.className, count: 0, shallow: 0, retained: null };
      stats.set(obj.className, stat);
    }
    stat.count += 1;
    stat.shallow += obj.shallowSize;
  }
  return [...stats.values()].sort((a, b) => b.shallow - a.shallow);
}

/**
 * 상위 클래스의 retained size 근사값을 채운다.
 *
 * 정확한 dominator tree 대신, 그 클래스 인스턴스를 전부 제거했을 때
 * GC root에서 도달 가능한 바이트가 얼마나 줄어드는지로 근사한다.
 */
export function computeRetained(
  snapshot: HeapSnapshot, stats: ClassStat[], topN: number = DEFAULT_TOP_N,
): void {
  const base = reachableBytes(snapshot, null);
  for (const stat of stats.slice(0, topN)) {
    stat.retained = base - reachableBytes(snapshot, stat.name);
  }
}

/** GC root에서 도달 가능한 바이트 합. excludeClass 인스턴스는 없는 셈 친다. */
function reachableBytes(snapshot: HeapSnapshot, excludeClass: string | null): number {
  let total = 0;
  const seen = new Set<number>();
  const queue = snapshot.roots.map((root) => root.objId);
  while (queue.length > 0) {
    const obj = snapshot.objects.get(queue.pop()!);
    if (!obj || seen.has(obj.objId)) continue;
    seen.add(obj.objId);
    if (obj.className === excludeClass) continue;
    total += obj.shallowSize;
    for (const [, target] of obj.refs) queue.push(target);
  }
  return total;
}

/** shallow size가 minSize 이상인 단일 객체를 큰 순서로 돌려준다. */
export function findLargeObjects(
  snapshot: HeapSnapshot, minSize: number = DEFAULT_LARGE_OBJECT_MIN,
): HeapObject[] {
  const large = [...snapshot.objects.values()].filter((obj) => obj.shallowSize >= minSize);
  return large.sort((a, b) => b.shallowSize - a.shallowSize);
}

/** 해당 클래스에서 shallow size가 가장 큰 인스턴스를 돌려준다. */
export function largestInstanceOf(snapshot: HeapSnapshot, className: string): HeapObject | null {
  let best: HeapObject | null = null;
  for (const obj of snapshot.objects.values()) {
    if (obj.className === className && (!best || obj.shallowSize > best.shallowSize)) {
      best = obj;
    }
  }
  return best;
}

/** 역참조 인덱스를 만든다. GC root 경로 탐색에 쓴다. */
export function buildReferrers(snapshot: HeapSnapshot): Referrers {
  const referrers: Referrers = new Map();
  for (const obj of snapshot.objects.values()) {
    for (const [refName, target] of obj.refs) {
      let list = referrers.get(target);
      if (!list) {
        list = [];
        referrers.set(target, list);
      }
      list.push([obj.objId, refName]);
    }
  }
  return referrers;
}

/** 객체를 GC root까지 붙잡는 최단 참조 사슬을 root → 객체 순서로 돌려준다. */
export function pathToGcRoot(
  snapshot: HeapSnapshot, referrers: Referrers, objId: number,
): PathStep[] | null {
  const rootKinds = new Map(snapshot.roots.map((root) => [root.objId, root.kind]));
  const cameFrom = new Map<number, [number, string]>();
  const seen = new Set([objId]);
  const queue = [objId];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const kind = rootKinds.get(current);
    if (kind !== undefined) return rebuildPath(snapshot, cameFrom, kind, current, objId);
    for (const [referrerId, refName] of referrers.get(current) ?? []) {
      if (!seen.has(referrerId)) {
        seen.add(referrerId);
        cameFrom.set(referrerId, [current, refName]);
        queue.push(referrerId);
      }
    }
  }
  return null;
}

function rebuildPath(
  snapshot: HeapSnapshot,
  cameFrom: Map<number, [number, string]>,
  rootKind: string,
  rootId: number,
  objId: number,
): PathStep[] {
  const steps: PathStep[] = [
    { objId: rootId, className: nameOf(snapshot, rootId), refName: `GC root (${rootKind})` },
  ];
  let current = rootId;
  while (current !== objId) {
    const [child, refName] = cameFrom.get(current)!;
    steps.push({ objId: child, className: nameOf(snapshot, child), refName });
    current = child;
  }
  return steps;
}

function nameOf(snapshot: HeapSnapshot, objId: number): string {
  return snapshot.objects.get(objId)?.className ?? `<unknown 0x${objId.toString(16)}>`;
}
