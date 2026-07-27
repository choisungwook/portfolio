/**
 * 파드 describe가 실행하는 kubectl 명령과 IPC 인자 검증을 확인한다.
 *
 * describe 결과는 파싱 없이 화면에 그대로 붙으므로 값이 틀리면 눈으로 보인다.
 * 대신 어느 namespace의 어느 파드를 물었는지가 어긋나면 다른 파드의 상태를 보고
 * 판단하게 되므로, 넘어간 인자를 기록해 확인한다.
 *
 * 실행: npm test (dist/를 읽으므로 build가 먼저 돈다)
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "akbun-k8supgradeview-describe-test-"));

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
const { describePod } = require("../dist/main/kubectl.js");

Module._resolveFilename = resolveFilename;
delete require.cache["electron-stub"];

const argsPath = path.join(workDir, "args.txt");

/** 받은 인자를 기록하고 describe 결과를 흉내내는 가짜 kubectl. */
function useRecordingKubectl(exitCode = 0) {
  const scriptPath = path.join(workDir, "fake-kubectl");
  const script =
    `#!/bin/bash\necho "$@" > ${JSON.stringify(argsPath)}\n` +
    (exitCode === 0
      ? 'printf "Name:  nginx\\nStatus:  Running\\n\\n"\nexit 0\n'
      : `echo "pods \\"nginx\\" not found" >&2\nexit ${exitCode}\n`);
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  saveSettings({
    kubectlCommand: scriptPath,
    karpenterNamespace: "karpenter",
    karpenterPodLabelSelector: "app.kubernetes.io/name=karpenter",
    karpenterLogSinceMinutes: 15,
  });
}

function recordedArgs() {
  return fs.readFileSync(argsPath, "utf8").trim();
}

test.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

test("describe는 kubectl describe pod <이름> -n <namespace>를 실행한다", async () => {
  useRecordingKubectl();
  await describePod("default", "nginx");

  assert.strictEqual(recordedArgs(), "describe pod nginx -n default");
});

test("describe 결과는 원문 그대로 돌려주고 끝의 빈 줄만 자른다", async () => {
  useRecordingKubectl();

  assert.strictEqual(await describePod("default", "nginx"), "Name:  nginx\nStatus:  Running");
});

test("kubectl이 실패하면 stderr를 담아 던진다", async () => {
  useRecordingKubectl(1);

  await assert.rejects(() => describePod("default", "nginx"), /not found/);
});

/**
 * 이름 검증은 main.ts의 IPC 경계에 있다. 그 함수는 export하지 않으므로
 * -로 시작하는 값을 막는 규칙이 파드에도 걸려 있는지 코드로 확인한다.
 * 이 값을 그냥 넘기면 kubectl이 이름이 아니라 옵션으로 읽는다.
 */
test("describe-pod IPC는 namespace와 파드 이름을 검증한다", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "dist", "main", "main.js"), "utf8");
  const handler = source.slice(source.indexOf('"kubectl:describe-pod"'));

  assert.match(handler.slice(0, 400), /assertResourceName\(namespace/);
  assert.match(handler.slice(0, 400), /assertResourceName\(name/);
});
