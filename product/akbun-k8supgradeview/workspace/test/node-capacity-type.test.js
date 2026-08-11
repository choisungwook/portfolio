/**
 * 노드의 Capacity 칸과 spot / on-demand 필터를 확인한다.
 *
 * capacity type을 알려주는 label은 노드를 만든 주체마다 이름이 다르고, 값의 표기도
 * Karpenter는 on-demand, Managed NodeGroup은 ON_DEMAND로 서로 다르다. 정규화가
 * 틀리면 필터가 조용히 아무 노드도 고르지 못하므로 label별로 확인한다.
 *
 * 실행: npm test (dist/를 읽으므로 build가 먼저 돈다)
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "akbun-k8supgradeview-capacity-test-"));

// settings는 electron의 app.getPath만 쓴다. 테스트 임시 디렉터리를 주어 실제 앱 설정을 건드리지 않는다.
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === "electron") return "electron-stub";
  return resolveFilename.call(this, request, ...rest);
};
require.cache["electron-stub"] = {
  id: "electron-stub",
  filename: "electron-stub",
  loaded: true,
  exports: { app: { getPath: () => workDir } },
};

const { saveSettings } = require("../dist/main/settings.js");
const { getNodes } = require("../dist/main/kubectl.js");

Module._resolveFilename = resolveFilename;
delete require.cache["electron-stub"];

const NODES_JSON = {
  items: [
    {
      metadata: { name: "karpenter-spot", labels: { "karpenter.sh/capacity-type": "spot" } },
      spec: {},
      status: {},
    },
    {
      metadata: {
        name: "karpenter-ondemand",
        labels: { "karpenter.sh/capacity-type": "on-demand" },
      },
      spec: {},
      status: {},
    },
    {
      metadata: {
        name: "managed-ondemand",
        labels: { "eks.amazonaws.com/capacityType": "ON_DEMAND" },
      },
      spec: {},
      status: {},
    },
    {
      metadata: { name: "managed-spot", labels: { "eks.amazonaws.com/capacityType": "SPOT" } },
      spec: {},
      status: {},
    },
    {
      metadata: { name: "custom-label", labels: { "node.kubernetes.io/capacity-type": "spot" } },
      spec: {},
      status: {},
    },
    { metadata: { name: "no-label", labels: {} }, spec: {}, status: {} },
  ],
};

/** 주어진 stdout을 내보내는 가짜 kubectl. */
function useFakeKubectl(stdout) {
  const scriptPath = path.join(workDir, "fake-kubectl");
  fs.writeFileSync(path.join(workDir, "stdout.txt"), stdout);
  fs.writeFileSync(
    scriptPath,
    `#!/bin/bash\ncat ${JSON.stringify(path.join(workDir, "stdout.txt"))}\n`,
    { mode: 0o755 }
  );
  saveSettings({
    kubectlCommand: scriptPath,
    karpenterNamespace: "karpenter",
    karpenterPodLabelSelector: "app.kubernetes.io/name=karpenter",
    karpenterLogSinceMinutes: 15,
  });
}

const byName = (nodes) => Object.fromEntries(nodes.map((node) => [node.name, node]));

test.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

test("Karpenter label의 capacity type을 읽는다", async () => {
  useFakeKubectl(JSON.stringify(NODES_JSON));
  const nodes = byName(await getNodes());

  assert.strictEqual(nodes["karpenter-spot"].capacityType, "spot");
  assert.strictEqual(nodes["karpenter-ondemand"].capacityType, "on-demand");
});

test("Managed NodeGroup label의 ON_DEMAND는 on-demand로 맞춘다", async () => {
  useFakeKubectl(JSON.stringify(NODES_JSON));
  const nodes = byName(await getNodes());

  assert.strictEqual(nodes["managed-ondemand"].capacityType, "on-demand");
  assert.strictEqual(nodes["managed-spot"].capacityType, "spot");
});

test("직접 붙인 node.kubernetes.io label도 본다", async () => {
  useFakeKubectl(JSON.stringify(NODES_JSON));
  const nodes = byName(await getNodes());

  assert.strictEqual(nodes["custom-label"].capacityType, "spot");
});

test("label이 없으면 빈 문자열이라 화면에 아무것도 적히지 않는다", async () => {
  useFakeKubectl(JSON.stringify(NODES_JSON));
  const nodes = byName(await getNodes());

  assert.strictEqual(nodes["no-label"].capacityType, "");
});

// renderer는 module 없는 브라우저 script라 require할 수 없다. 필터 규칙은 표시 상태를
// 건드리지 않는 순수 함수라 그 선언까지의 조각만 떼어 평가한다.
const rendererPath = path.join(__dirname, "..", "dist", "renderer", "renderer.js");
const source = fs.readFileSync(rendererPath, "utf8");
const marker = "const nodeSort =";
assert.ok(source.includes(marker), "정렬 controller 선언을 찾지 못했다");

const filterModule = {};
new Function(
  "exports",
  `${source.slice(0, source.indexOf(marker))}
  exports.nodeMatchesFilter = nodeMatchesFilter;`
)(filterModule);
const { nodeMatchesFilter } = filterModule;

function node(name, fields) {
  return {
    name,
    internalIp: "",
    instanceType: "",
    capacityType: "",
    version: "",
    status: "Ready",
    creationTimestamp: "",
    unschedulable: false,
    isKarpenter: false,
    isManagedNodeGroup: false,
    group: "",
    ...fields,
  };
}

const picked = (filter, nodes) =>
  nodes.filter((row) => nodeMatchesFilter(row, filter)).map((row) => row.name);

const NODES = [
  node("karpenter-spot", { isKarpenter: true, capacityType: "spot" }),
  node("karpenter-ondemand", { isKarpenter: true, capacityType: "on-demand" }),
  node("managed-spot", { isManagedNodeGroup: true, capacityType: "spot" }),
  node("unknown-capacity", { capacityType: "" }),
  node("cordoned", { unschedulable: true, capacityType: "on-demand" }),
];

test("spot 필터는 노드를 만든 주체와 상관없이 spot 노드만 고른다", () => {
  assert.deepStrictEqual(picked("spot", NODES), ["karpenter-spot", "managed-spot"]);
});

test("on-demand 필터는 on-demand 노드만 고른다", () => {
  assert.deepStrictEqual(picked("on-demand", NODES), ["karpenter-ondemand", "cordoned"]);
});

test("capacity type을 모르는 노드는 spot도 on-demand도 아니다", () => {
  assert.ok(!nodeMatchesFilter(node("x", { capacityType: "" }), "spot"));
  assert.ok(!nodeMatchesFilter(node("x", { capacityType: "" }), "on-demand"));
});

test("기존 필터는 그대로 동작한다", () => {
  assert.deepStrictEqual(picked("karpenter", NODES), ["karpenter-spot", "karpenter-ondemand"]);
  assert.deepStrictEqual(picked("managed", NODES), ["managed-spot"]);
  assert.deepStrictEqual(picked("cordoned", NODES), ["cordoned"]);
  assert.strictEqual(picked("all", NODES).length, NODES.length);
});

/**
 * 버튼의 data-filter는 그대로 필터 값이 된다. 화면에만 버튼을 늘리면 아무것도
 * 걸러지지 않는 버튼이 생기므로 두 곳이 맞는지 확인한다.
 */
test("화면의 노드 필터 버튼은 모두 필터 규칙이 아는 값이다", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "dist", "renderer", "index.html"),
    "utf8"
  );
  const filters = [...html.matchAll(/class="filter-button[^"]*"\s+data-filter="([^"]+)"/g)].map(
    (match) => match[1]
  );

  assert.ok(filters.includes("spot"), "Spot 버튼이 없다");
  assert.ok(filters.includes("on-demand"), "On-Demand 버튼이 없다");
  for (const filter of filters) {
    if (filter === "all") continue;
    assert.ok(
      source.includes(`=== "${filter}"`),
      `${filter} 버튼을 nodeMatchesFilter가 다루지 않는다`
    );
  }
});
