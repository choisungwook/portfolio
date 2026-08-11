/**
 * 표 정렬이 화면에 보이는 값의 종류에 맞게 순서를 정하는지 확인한다.
 *
 * 정렬은 칸의 종류(SortKind)마다 견주는 방법이 다르다. 버전, IP, 숫자, age는 글자로
 * 견주면 눈에 보이는 순서와 어긋나는 대표적인 칸이라, 종류를 잘못 붙이거나 비교를
 * 바꿀 때 조용히 틀린다. 그래서 종류별로 결과 순서를 기록해 확인한다.
 *
 * renderer는 module 없는 브라우저 script라 require할 수 없다. 첫 controller 선언
 * 앞까지가 DOM을 건드리지 않는 순수 부분이므로 그 조각만 떼어 평가한다.
 *
 * 실행: npm test (dist/를 읽으므로 build가 먼저 돈다)
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const rendererPath = path.join(__dirname, "..", "dist", "renderer", "renderer.js");
const source = fs.readFileSync(rendererPath, "utf8");
const marker = "const nodeSort =";
assert.ok(source.includes(marker), "정렬 controller 선언을 찾지 못했다");

// 규칙이 늘어도 테스트를 고치지 않도록 선언된 SortSpec을 이름으로 모두 꺼낸다.
const pureSource = source.slice(0, source.indexOf(marker));
const specNames = [...new Set([...pureSource.matchAll(/\b(\w+_SORT)\b/g)].map((m) => m[1]))];
assert.ok(specNames.length > 0, "정렬 규칙 선언을 찾지 못했다");

const sortModule = {};
new Function(
  "exports",
  `${pureSource}
  exports.sortRows = sortRows;
  ${specNames.map((name) => `exports["${name}"] = ${name};`).join("\n")}`
)(sortModule);

const { sortRows, NODE_SORT, POD_SORT, NODEPOOL_SORT, KARPENTER_EVENT_SORT } = sortModule;

const now = Date.now();
const at = (secondsAgo) => new Date(now - secondsAgo * 1000).toISOString();

function node(name, fields) {
  return {
    name,
    internalIp: "",
    capacityType: "",
    version: "",
    status: "Ready",
    creationTimestamp: "",
    unschedulable: false,
    isKarpenter: false,
    isManagedNodeGroup: false,
    group: "-",
    ...fields,
  };
}

function pod(name, fields) {
  return {
    namespace: "default",
    name,
    status: "Running",
    ready: "1/1",
    allReady: true,
    nodeName: "",
    creationTimestamp: "",
    ...fields,
  };
}

function nodePool(name, fields) {
  return {
    name,
    weight: "-",
    nodes: "-",
    ready: "-",
    creationTimestamp: "",
    nodeClassName: "",
    ...fields,
  };
}

const order = (rows, spec, key, direction) =>
  sortRows(rows, spec, { key, direction }).map((row) => row.name);

test("정렬을 고르지 않으면 조회한 순서를 그대로 둔다", () => {
  const pods = [pod("c"), pod("a"), pod("b")];
  assert.deepStrictEqual(sortRows(pods, POD_SORT, null), pods);
});

test("정렬은 원본 배열을 건드리지 않는다", () => {
  const pods = [pod("c"), pod("a")];
  sortRows(pods, POD_SORT, { key: "name", direction: "asc" });
  assert.deepStrictEqual(
    pods.map((p) => p.name),
    ["c", "a"]
  );
});

test("Internal IP는 octet을 수로 견준다", () => {
  const nodes = [
    node("b", { internalIp: "10.0.0.10" }),
    node("a", { internalIp: "10.0.0.9" }),
    node("c", { internalIp: "10.0.1.1" }),
  ];
  assert.deepStrictEqual(order(nodes, NODE_SORT, "internalIp", "asc"), ["a", "b", "c"]);
  assert.deepStrictEqual(order(nodes, NODE_SORT, "internalIp", "desc"), ["c", "b", "a"]);
});

test("Version은 숫자를 수로 읽어 v1.9가 v1.29보다 앞에 온다", () => {
  const nodes = [
    node("b", { version: "v1.29.6" }),
    node("a", { version: "v1.9.1" }),
    node("c", { version: "v1.10.0" }),
  ];
  assert.deepStrictEqual(order(nodes, NODE_SORT, "version", "asc"), ["a", "c", "b"]);
});

test("파드 Ready는 2/2가 10/10보다 앞에 온다", () => {
  const pods = [pod("b", { ready: "10/10" }), pod("a", { ready: "2/2" })];
  assert.deepStrictEqual(order(pods, POD_SORT, "ready", "asc"), ["a", "b"]);
});

test("Age 오름차순은 나이가 어린 것부터다", () => {
  const nodes = [
    node("old", { creationTimestamp: at(86400) }),
    node("young", { creationTimestamp: at(30) }),
  ];
  assert.deepStrictEqual(order(nodes, NODE_SORT, "age", "asc"), ["young", "old"]);
  assert.deepStrictEqual(order(nodes, NODE_SORT, "age", "desc"), ["old", "young"]);
});

test("Event의 Time 오름차순은 오래된 것부터다", () => {
  const events = [
    { timestamp: at(10), type: "Normal", reason: "new", object: "o", count: 1, message: "" },
    { timestamp: at(600), type: "Normal", reason: "old", object: "o", count: 1, message: "" },
  ];
  const reasons = sortRows(events, KARPENTER_EVENT_SORT, {
    key: "timestamp",
    direction: "asc",
  }).map((event) => event.reason);
  assert.deepStrictEqual(reasons, ["old", "new"]);
});

test("숫자 칸은 10이 9보다 뒤에 온다", () => {
  const nodePools = [nodePool("b", { weight: "9" }), nodePool("a", { weight: "10" })];
  assert.deepStrictEqual(order(nodePools, NODEPOOL_SORT, "weight", "asc"), ["b", "a"]);
});

test("숫자와 시각 칸의 모르는 값은 방향과 상관없이 맨 뒤에 둔다", () => {
  const nodePools = [
    nodePool("unknown"),
    nodePool("b", { weight: "9" }),
    nodePool("a", { weight: "10" }),
  ];
  assert.deepStrictEqual(order(nodePools, NODEPOOL_SORT, "weight", "asc"), ["b", "a", "unknown"]);
  assert.deepStrictEqual(order(nodePools, NODEPOOL_SORT, "weight", "desc"), ["a", "b", "unknown"]);

  const nodes = [node("noAge"), node("aged", { creationTimestamp: at(60) })];
  assert.deepStrictEqual(order(nodes, NODE_SORT, "age", "asc"), ["aged", "noAge"]);
  assert.deepStrictEqual(order(nodes, NODE_SORT, "age", "desc"), ["aged", "noAge"]);
});

test("정렬 기준 값이 같으면 이름으로 순서를 고정한다", () => {
  const pods = [
    pod("c", { namespace: "kube-system" }),
    pod("a", { namespace: "kube-system" }),
    pod("b", { namespace: "kube-system" }),
  ];
  assert.deepStrictEqual(order(pods, POD_SORT, "namespace", "asc"), ["a", "b", "c"]);
});

test("헤더의 data-sort-key는 모두 그 표의 정렬 규칙에 있다", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "dist", "renderer", "index.html"),
    "utf8"
  );
  const controllers = [...source.matchAll(/createSortController\(\s*"([^"]+)",\s*(\w+),/g)];
  assert.ok(controllers.length > 0, "정렬 controller를 찾지 못했다");

  for (const [, tableId, specName] of controllers) {
    // table에 나중에 class 같은 속성이 붙어도 id로만 찾는다.
    const table = html.match(new RegExp(`<table[^>]*\\bid="${tableId}"[^>]*>([\\s\\S]*?)</table>`));
    assert.ok(table, `${tableId} 표를 찾지 못했다`);
    const keys = [...table[1].matchAll(/data-sort-key="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(keys.length > 0, `${tableId}에 정렬 헤더가 없다`);
    const spec = sortModule[specName];
    assert.ok(spec, `${specName} 선언을 찾지 못했다`);
    for (const key of keys) {
      // 규칙에 없는 key를 헤더에 적으면 헤더를 눌러도 아무 일도 일어나지 않는다.
      assert.ok(spec.columns[key], `${tableId}의 ${key}가 ${specName}에 없다`);
    }
  }
});
