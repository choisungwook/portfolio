/**
 * 활성 context의 이름이 아니라 그 context가 가리키는 cluster 이름을 읽는다.
 *
 * 실행: npm test (dist/를 읽으므로 build가 먼저 돈다)
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "akbun-k8supgradeview-cluster-test-"));

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
const { getCurrentCluster } = require("../dist/main/kubectl.js");

Module._resolveFilename = resolveFilename;
delete require.cache["electron-stub"];

const argsPath = path.join(workDir, "args.txt");

function useRecordingKubectl(clusterName) {
  const scriptPath = path.join(workDir, "fake-kubectl");
  const script = `#!/bin/bash\necho "$@" > ${JSON.stringify(argsPath)}\nprintf '%s\\n' ${JSON.stringify(clusterName)}\n`;
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  saveSettings({
    kubectlCommand: scriptPath,
    karpenterNamespace: "karpenter",
    karpenterPodLabelSelector: "app.kubernetes.io/name=karpenter",
    karpenterLogSinceMinutes: 15,
  });
}

test.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

test("현재 context가 가리키는 cluster 이름을 읽는다", async () => {
  useRecordingKubectl("production-cluster");

  assert.strictEqual(await getCurrentCluster(), "production-cluster");
  assert.strictEqual(
    fs.readFileSync(argsPath, "utf8").trim(),
    "config view --minify --output jsonpath={.contexts[0].context.cluster}"
  );
});
