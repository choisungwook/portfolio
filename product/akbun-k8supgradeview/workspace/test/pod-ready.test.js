/**
 * 파드 목록의 Ready 값이 kubectl get pods의 READY 칸과 같게 나오는지 확인한다.
 *
 * Ready는 status(phase)와 다른 값이다. Running인데 컨테이너가 Ready가 아닌 파드를
 * 화면에서 골라내는 것이 목적이라, 개수 표기와 allReady 판정이 어긋나면 필터가
 * 엉뚱한 줄을 남긴다. 그래서 값 자체를 기록해 확인한다.
 *
 * 실행: npm test (dist/를 읽으므로 build가 먼저 돈다)
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "akbun-k8supgradeview-ready-test-"));

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
const { getPods } = require("../dist/main/kubectl.js");

Module._resolveFilename = resolveFilename;
delete require.cache["electron-stub"];

/** 주어진 pod item 목록을 그대로 뱉는 가짜 kubectl. */
function useFakeKubectl(items) {
  const listPath = path.join(workDir, "pods.json");
  fs.writeFileSync(listPath, JSON.stringify({ items }));
  const scriptPath = path.join(workDir, "fake-kubectl");
  fs.writeFileSync(scriptPath, `#!/bin/bash\ncat ${JSON.stringify(listPath)}\n`, { mode: 0o755 });
  saveSettings({
    kubectlCommand: scriptPath,
    karpenterNamespace: "karpenter",
    karpenterPodLabelSelector: "app.kubernetes.io/name=karpenter",
    karpenterLogSinceMinutes: 15,
  });
}

/** container 개수와 ready 여부만 다른 pod을 만든다. 나머지 필드는 이 테스트와 무관하다. */
function pod(name, readyFlags) {
  return {
    metadata: { name, namespace: "default", creationTimestamp: "2026-07-27T00:00:00Z" },
    spec: { nodeName: "node-1", containers: readyFlags.map((_, i) => ({ name: `c${i}` })) },
    status: {
      phase: "Running",
      containerStatuses: readyFlags.map((ready, i) => ({ name: `c${i}`, ready })),
    },
  };
}

test.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

test("Ready는 준비된 컨테이너/전체 컨테이너로 센다", async () => {
  useFakeKubectl([pod("all-ready", [true, true]), pod("partial", [true, false])]);

  const pods = await getPods();

  assert.deepStrictEqual(
    pods.map((p) => p.ready),
    ["2/2", "1/2"]
  );
});

test("allReady는 컨테이너가 모두 Ready일 때만 true다", async () => {
  useFakeKubectl([pod("all-ready", [true, true]), pod("partial", [true, false]), pod("none", [false])]);

  const pods = await getPods();

  assert.deepStrictEqual(
    pods.map((p) => p.allReady),
    [true, false, false]
  );
});

/**
 * 아직 스케줄되지 않았거나 이미지가 안 받아진 파드는 containerStatuses가 비어 있다.
 * 이때도 전체 개수는 spec.containers에서 읽어야 0/0으로 뭉개지지 않는다.
 */
test("containerStatuses가 없으면 0/spec 컨테이너 수로 센다", async () => {
  useFakeKubectl([
    {
      metadata: { name: "pending", namespace: "default" },
      spec: { containers: [{ name: "c0" }, { name: "c1" }] },
      status: { phase: "Pending" },
    },
  ]);

  const [pending] = await getPods();

  assert.strictEqual(pending.ready, "0/2");
  assert.strictEqual(pending.allReady, false);
});
