/**
 * karpenter 리소스 조회의 파싱 규칙을 검증한다.
 *
 * 이 화면은 필드가 없는 경우가 정상이다. NodePool에는 ami가 없고 EC2NodeClass에는
 * weight가 없으며, weight와 Ready condition은 있을 수도 없을 수도 있다. 빈 값을
 * 0이나 빈 문자열로 잘못 채우면 화면에서 알아채기 어려우므로 목업으로 확인한다.
 * 노드 수는 NodePool status에 없어서 노드 label로 세는데, 조회 실패(-)와 0개를
 * 구분하지 못하면 "노드가 하나도 없다"고 잘못 읽히므로 함께 검증한다.
 * 버전도 label이 없으면 image tag로 폴백하므로 같은 이유로 검증한다.
 *
 * 실행: npm test (dist/를 읽으므로 build가 먼저 돈다)
 *
 * kubectl 자리에 mock 데이터를 뱉는 셸 스크립트를 두고 실제 조회 경로를 그대로 돈다.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "akbun-k8supgradeview-test-"));

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
const { getKarpenterResources, getKarpenterVersions } = require("../dist/main/kubectl.js");

const NODE_POOLS = {
  items: [
    {
      metadata: { name: "default", creationTimestamp: "2026-07-01T00:00:00Z" },
      spec: { weight: 50 },
      status: { conditions: [{ type: "Ready", status: "True" }] },
    },
    // weight도 Ready condition도 없는 NodePool
    { metadata: { name: "spot", creationTimestamp: "2026-07-02T00:00:00Z" }, spec: {} },
  ],
};

const EC2_NODE_CLASSES = {
  items: [
    { metadata: { name: "default" }, spec: { amiSelectorTerms: [{ alias: "al2023@latest" }] } },
    { metadata: { name: "legacy" }, spec: { amiFamily: "AL2" } },
    { metadata: { name: "bare" }, spec: {} },
  ],
};

// default nodepool 노드 2개, 다른 nodepool 노드 1개, karpenter가 만들지 않은 노드 1개
const NODES = {
  items: [
    { metadata: { name: "n1", labels: { "karpenter.sh/nodepool": "default" } } },
    { metadata: { name: "n2", labels: { "karpenter.sh/nodepool": "default" } } },
    { metadata: { name: "n3", labels: { "karpenter.sh/nodepool": "other" } } },
    { metadata: { name: "n4", labels: { "eks.amazonaws.com/nodegroup": "managed" } } },
  ],
};

/**
 * mock 데이터를 뱉는 가짜 kubectl을 만들어 settings에 등록한다.
 * responses의 값이 문자열이면 그 리소스 조회를 실패시킨다.
 */
function useFakeKubectl(responses) {
  const cases = Object.entries(responses)
    .map(([resource, value]) =>
      typeof value === "string"
        ? `  ${resource}) echo ${JSON.stringify(value)} >&2; exit 1 ;;`
        : `  ${resource}) cat <<'JSON'\n${JSON.stringify(value)}\nJSON\n  ;;`
    )
    .join("\n");
  const script = `#!/bin/bash\ncase "$2" in\n${cases}\n  *) echo '{"items":[]}' ;;\nesac\n`;

  const scriptPath = path.join(workDir, "fake-kubectl");
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  saveSettings({
    kubectlCommand: scriptPath,
    karpenterNamespace: "karpenter",
    karpenterPodLabelSelector: "app.kubernetes.io/name=karpenter",
    karpenterLogSinceMinutes: 15,
  });
}

const ALL_OK = {
  "nodepools.karpenter.sh": NODE_POOLS,
  "ec2nodeclasses.karpenter.k8s.aws": EC2_NODE_CLASSES,
  nodes: NODES,
};

test.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

test("없는 필드는 -로 채운다", async () => {
  useFakeKubectl(ALL_OK);
  const { nodePools, ec2NodeClasses } = await getKarpenterResources();

  const [withWeight, withoutWeight] = nodePools;
  assert.strictEqual(withWeight.weight, "50");
  assert.strictEqual(withoutWeight.weight, "-", "weight가 없으면 -여야 한다");
  assert.strictEqual(withWeight.ami, "-", "NodePool에는 ami가 없다");
  assert.strictEqual(withWeight.ready, "True");
  assert.strictEqual(withoutWeight.ready, "-", "Ready condition이 없으면 -여야 한다");

  const [terms, family, bare] = ec2NodeClasses;
  assert.strictEqual(terms.ami, "alias=al2023@latest");
  assert.strictEqual(family.ami, "AL2", "amiSelectorTerms가 없으면 amiFamily를 쓴다");
  assert.strictEqual(bare.ami, "-");
  assert.strictEqual(terms.weight, "-", "EC2NodeClass에는 weight가 없다");
});

test("nodes는 그 NodePool이 만든 노드만 센다", async () => {
  useFakeKubectl(ALL_OK);
  const { nodePools } = await getKarpenterResources();

  assert.strictEqual(nodePools[0].nodes, "2", "default nodepool 노드만 세야 한다");
  assert.strictEqual(nodePools[1].nodes, "0", "노드가 없으면 0이다");
});

test("노드 조회가 실패하면 nodes는 0이 아니라 -다", async () => {
  useFakeKubectl({ ...ALL_OK, nodes: "connection refused" });
  const { nodePools } = await getKarpenterResources();

  for (const nodePool of nodePools) {
    assert.strictEqual(nodePool.nodes, "-", "조회 실패를 0개로 보여주면 안 된다");
  }
});

test("한쪽 CRD 조회가 실패해도 다른 쪽 목록은 그대로 나온다", async () => {
  useFakeKubectl({ ...ALL_OK, "ec2nodeclasses.karpenter.k8s.aws": "CRD not found" });
  const result = await getKarpenterResources();

  assert.strictEqual(result.nodePools.length, 2);
  assert.strictEqual(result.nodePoolsError, "");
  assert.deepStrictEqual(result.ec2NodeClasses, []);
  assert.match(result.ec2NodeClassesError, /CRD not found/);
});

test("버전은 label을 먼저 보고 없으면 image tag를 쓴다", async () => {
  useFakeKubectl({
    deployments: {
      items: [
        {
          metadata: { name: "karpenter", labels: { "app.kubernetes.io/version": "1.0.5" } },
          spec: { template: { spec: { containers: [{ image: "public.ecr.aws/karpenter:0.37.0" }] } } },
        },
        // label이 없어 image tag로 폴백한다. registry port의 :5000을 tag로 읽으면 안 된다.
        {
          metadata: { name: "karpenter-old" },
          spec: { template: { spec: { containers: [{ image: "registry:5000/karpenter:1.1.0" }] } } },
        },
        // tag 없이 digest만 있는 image
        {
          metadata: { name: "karpenter-digest" },
          spec: { template: { spec: { containers: [{ image: "public.ecr.aws/karpenter@sha256:abc" }] } } },
        },
      ],
    },
  });
  const { versions, error } = await getKarpenterVersions();

  assert.strictEqual(error, "");
  assert.strictEqual(versions[0].version, "1.0.5", "label을 먼저 써야 한다");
  assert.strictEqual(versions[1].version, "1.1.0", "registry port를 tag로 읽으면 안 된다");
  assert.strictEqual(versions[2].version, "-", "tag가 없으면 -여야 한다");
});

test("deployment 조회가 실패해도 에러만 담고 던지지 않는다", async () => {
  useFakeKubectl({ deployments: "forbidden" });
  const { versions, error } = await getKarpenterVersions();

  assert.deepStrictEqual(versions, []);
  assert.match(error, /forbidden/);
});

test("age는 NodePool의 creationTimestamp를 그대로 넘긴다", async () => {
  useFakeKubectl(ALL_OK);
  const { nodePools } = await getKarpenterResources();

  assert.strictEqual(nodePools[0].creationTimestamp, "2026-07-01T00:00:00Z");
});
