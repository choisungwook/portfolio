/**
 * 노드 표의 Instance Type 칸과 노드 describe가 실행하는 kubectl 명령을 확인한다.
 *
 * instance type은 label에서 읽는데, label 이름이 바뀐 적이 있고 EC2가 아닌 노드에는
 * 아예 없다. 값이 없을 때 빈 칸이 되는지까지 봐야 잘못된 타입을 보고 판단하지 않는다.
 *
 * 실행: npm test (dist/를 읽으므로 build가 먼저 돈다)
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "akbun-k8supgradeview-instance-test-"));

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
const { getNodes, describeNode } = require("../dist/main/kubectl.js");

Module._resolveFilename = resolveFilename;
delete require.cache["electron-stub"];

const argsPath = path.join(workDir, "args.txt");

const NODES_JSON = {
  items: [
    {
      metadata: { name: "current-label", labels: { "node.kubernetes.io/instance-type": "t3.medium" } },
      spec: {},
      status: {},
    },
    {
      metadata: { name: "legacy-label", labels: { "beta.kubernetes.io/instance-type": "m5.large" } },
      spec: {},
      status: {},
    },
    { metadata: { name: "no-label", labels: {} }, spec: {}, status: {} },
  ],
};

/** 받은 인자를 기록하고 주어진 stdout을 내보내는 가짜 kubectl. */
function useRecordingKubectl(stdout) {
  const scriptPath = path.join(workDir, "fake-kubectl");
  const script =
    `#!/bin/bash\necho "$@" > ${JSON.stringify(argsPath)}\n` +
    `cat ${JSON.stringify(path.join(workDir, "stdout.txt"))}\n`;
  fs.writeFileSync(path.join(workDir, "stdout.txt"), stdout);
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });
  saveSettings({
    kubectlCommand: scriptPath,
    karpenterNamespace: "karpenter",
    karpenterPodLabelSelector: "app.kubernetes.io/name=karpenter",
    karpenterLogSinceMinutes: 15,
  });
}

test.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

test("instance type은 현재 label을 읽고, 예전 label만 있어도 읽는다", async () => {
  useRecordingKubectl(JSON.stringify(NODES_JSON));
  const nodes = await getNodes();

  assert.strictEqual(nodes[0].instanceType, "t3.medium");
  assert.strictEqual(nodes[1].instanceType, "m5.large");
});

test("label이 없는 노드의 instance type은 빈 문자열이라 화면에 아무것도 적히지 않는다", async () => {
  useRecordingKubectl(JSON.stringify(NODES_JSON));
  const nodes = await getNodes();

  assert.strictEqual(nodes[2].instanceType, "");
});

test("노드 describe는 kubectl describe node <이름>을 실행한다", async () => {
  useRecordingKubectl("Name:  ip-10-0-0-1\n");
  await describeNode("ip-10-0-0-1");

  assert.strictEqual(fs.readFileSync(argsPath, "utf8").trim(), "describe node ip-10-0-0-1");
});

/**
 * 이름 검증은 main.ts의 IPC 경계에 있다. 그 함수는 export하지 않으므로
 * -로 시작하는 값을 막는 규칙이 노드에도 걸려 있는지 코드로 확인한다.
 */
test("describe-node IPC는 노드 이름을 검증한다", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "dist", "main", "main.js"), "utf8");
  const start = source.indexOf('"kubectl:describe-node"');
  assert.notStrictEqual(start, -1, "describe-node IPC 핸들러를 찾지 못했다");

  const next = source.indexOf("ipcMain.handle(", start);
  const handler = next === -1 ? source.slice(start) : source.slice(start, next);

  assert.match(handler, /assertResourceName\(name/);
});
