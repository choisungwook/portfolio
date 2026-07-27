/**
 * cordon / uncordon이 실행하는 kubectl 명령을 검증한다.
 *
 * 이 기능만 클러스터 상태를 바꾼다. 조회는 틀리면 화면에서 바로 보이지만 여기서
 * subcommand를 반대로 넘기면 노드를 열려다 닫는다. 그래서 실제 실행 경로를 그대로
 * 돌면서 넘어간 인자를 기록해 확인한다.
 *
 * 실행: npm test (dist/를 읽으므로 build가 먼저 돈다)
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "akbun-k8supgradeview-cordon-test-"));

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
const { setNodeCordon } = require("../dist/main/kubectl.js");

Module._resolveFilename = resolveFilename;
delete require.cache["electron-stub"];

const argsPath = path.join(workDir, "args.txt");

/** 받은 인자를 한 줄로 남기는 가짜 kubectl. exitCode가 0이 아니면 실패를 흉내낸다. */
function useRecordingKubectl(exitCode = 0) {
  const scriptPath = path.join(workDir, "fake-kubectl");
  const script = `#!/bin/bash\necho "$@" > ${JSON.stringify(argsPath)}\n`
    + (exitCode === 0 ? "exit 0\n" : `echo "node not found" >&2\nexit ${exitCode}\n`);
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

test("cordon은 kubectl cordon <노드>를 실행한다", async () => {
  useRecordingKubectl();
  await setNodeCordon("ip-10-0-0-1", true);

  assert.strictEqual(recordedArgs(), "cordon ip-10-0-0-1");
});

test("uncordon은 kubectl uncordon <노드>를 실행한다", async () => {
  useRecordingKubectl();
  await setNodeCordon("ip-10-0-0-1", false);

  assert.strictEqual(recordedArgs(), "uncordon ip-10-0-0-1");
});

test("설정된 kubectl 명령의 앞부분 인자를 유지한다", async () => {
  useRecordingKubectl();
  const settings = require("../dist/main/settings.js").loadSettings();
  saveSettings({ ...settings, kubectlCommand: `${settings.kubectlCommand} --context prod` });
  await setNodeCordon("ip-10-0-0-1", true);

  assert.strictEqual(recordedArgs(), "--context prod cordon ip-10-0-0-1");
});

test("kubectl이 실패하면 stderr를 담아 던진다", async () => {
  useRecordingKubectl(1);

  await assert.rejects(() => setNodeCordon("ip-10-0-0-9", true), /node not found/);
});
