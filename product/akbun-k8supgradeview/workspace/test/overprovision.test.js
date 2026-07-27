/**
 * over-provisioning manifest 생성 규칙을 검증한다.
 *
 * 이 결과물은 사용자가 그대로 복사해 클러스터에 apply한다. 문서 구분자를 빠뜨리거나
 * cluster scope인 PriorityClass를 namespace마다 만들면 apply가 실패하고, cpu request가
 * limit보다 큰 값이 나가면 파드가 뜨지 않는다. 화면만 보고는 알아채기 어려운 규칙이라
 * 여기서 문자열을 직접 확인한다.
 *
 * 실행: npm test (dist/를 읽으므로 build가 먼저 돈다)
 */

const test = require("node:test");
const assert = require("node:assert");

const {
  buildOverprovisionYaml,
  DEFAULT_PAUSE_IMAGE,
  DEPLOYMENT_NAME,
  PRIORITY_CLASS_NAME,
  PRIORITY_VALUE,
} = require("../dist/main/overprovision.js");

function options(overrides) {
  return {
    namespaces: ["default"],
    cpuRequest: "1",
    cpuLimit: "1",
    replicas: 2,
    image: DEFAULT_PAUSE_IMAGE,
    ...overrides,
  };
}

/** --- 로 나뉜 문서 목록. 앞뒤 빈 줄은 비교에 방해가 되므로 다듬는다. */
function documents(yaml) {
  return yaml
    .split("\n---\n")
    .map((document) => document.trim())
    .filter(Boolean);
}

test("선택한 namespace 수만큼 Deployment를 만들고 --- 로 잇는다", () => {
  const yaml = buildOverprovisionYaml(options({ namespaces: ["default", "argocd", "monitoring"] }));
  const parts = documents(yaml);

  // PriorityClass 1개 + namespace 3개
  assert.strictEqual(parts.length, 4);
  assert.match(parts[0], /^apiVersion: scheduling\.k8s\.io\/v1$/m);
  for (const [index, namespace] of ["default", "argocd", "monitoring"].entries()) {
    assert.match(parts[index + 1], /^kind: Deployment$/m);
    assert.match(parts[index + 1], new RegExp(`^  namespace: ${namespace}$`, "m"));
  }
});

test("PriorityClass는 cluster scope라 namespace가 여럿이어도 한 번만 나온다", () => {
  const yaml = buildOverprovisionYaml(options({ namespaces: ["a", "b", "c", "d"] }));
  const occurrences = yaml.match(/^kind: PriorityClass$/gm) ?? [];

  assert.strictEqual(occurrences.length, 1);
  // namespace 필드가 붙으면 cluster scope 리소스에 apply가 실패한다.
  assert.ok(!documents(yaml)[0].includes("namespace:"));
});

test("PriorityClass 우선순위는 음수여야 placeholder가 밀려난다", () => {
  const yaml = buildOverprovisionYaml(options());

  assert.ok(PRIORITY_VALUE < 0);
  assert.match(yaml, new RegExp(`^value: ${PRIORITY_VALUE}$`, "m"));
  assert.match(yaml, /^globalDefault: false$/m);
  // Deployment가 그 PriorityClass를 실제로 가리켜야 우선순위가 적용된다.
  assert.match(yaml, new RegExp(`^      priorityClassName: ${PRIORITY_CLASS_NAME}$`, "m"));
});

test("cpu request와 limit, replica가 입력값 그대로 들어간다", () => {
  const yaml = buildOverprovisionYaml(
    options({ cpuRequest: "500m", cpuLimit: "1", replicas: 5 })
  );

  assert.match(yaml, /^  replicas: 5$/m);
  assert.match(yaml, /^              cpu: "500m"$/m);
  assert.match(yaml, /^              cpu: "1"$/m);
});

test("replica는 namespace마다 각각 적용된다", () => {
  const yaml = buildOverprovisionYaml(options({ namespaces: ["a", "b"], replicas: 3 }));
  const occurrences = yaml.match(/^  replicas: 3$/gm) ?? [];

  assert.strictEqual(occurrences.length, 2);
});

test("pause image는 기본값을 쓰고 지정하면 그 값을 쓴다", () => {
  assert.match(buildOverprovisionYaml(options()), /^          image: registry\.k8s\.io\/pause:3\.10$/m);

  const custom = buildOverprovisionYaml(options({ image: "public.ecr.aws/eks-distro/pause:3.9" }));
  assert.match(custom, /^          image: public\.ecr\.aws\/eks-distro\/pause:3\.9$/m);
});

test("selector와 pod label이 같아야 Deployment가 파드를 소유한다", () => {
  const yaml = buildOverprovisionYaml(options());
  const labels = yaml.match(/app\.kubernetes\.io\/name: (\S+)/g) ?? [];

  // PriorityClass 1개 + Deployment의 metadata, selector, template 3개
  assert.strictEqual(labels.length, 4);
  for (const label of labels) {
    assert.strictEqual(label, `app.kubernetes.io/name: ${DEPLOYMENT_NAME}`);
  }
});

test("밀려날 때 기다리지 않도록 grace period가 0이다", () => {
  assert.match(buildOverprovisionYaml(options()), /^      terminationGracePeriodSeconds: 0$/m);
});

test("namespace를 고르지 않으면 만들지 않는다", () => {
  assert.throws(() => buildOverprovisionYaml(options({ namespaces: [] })), /하나 이상/);
});

test("cpu request가 limit보다 크면 만들지 않는다", () => {
  // 500m과 0.5가 같은 값이므로 단위를 맞춰 비교해야 한다.
  assert.throws(
    () => buildOverprovisionYaml(options({ cpuRequest: "600m", cpuLimit: "0.5" })),
    /limit보다 클 수 없다/
  );
  assert.doesNotThrow(() => buildOverprovisionYaml(options({ cpuRequest: "500m", cpuLimit: "0.5" })));
});

test("cpu와 replica 형식이 잘못되면 만들지 않는다", () => {
  assert.throws(() => buildOverprovisionYaml(options({ cpuRequest: "1cpu" })), /cpu request/);
  assert.throws(() => buildOverprovisionYaml(options({ cpuLimit: "" })), /cpu limit/);
  assert.throws(() => buildOverprovisionYaml(options({ replicas: 0 })), /replica/);
  assert.throws(() => buildOverprovisionYaml(options({ replicas: 1.5 })), /replica/);
});

/**
 * namespace 이름과 image는 사용자가 고르거나 적는 값이라 그대로 이어 붙이면
 * 줄바꿈 하나로 문서 구조가 바뀔 수 있다. 형식을 먼저 막는지 확인한다.
 */
test("YAML 구조를 깨는 값은 만들지 않는다", () => {
  assert.throws(
    () => buildOverprovisionYaml(options({ namespaces: ["default\n  evil: true"] })),
    /namespace 이름/
  );
  assert.throws(() => buildOverprovisionYaml(options({ namespaces: ["Default"] })), /namespace 이름/);
  assert.throws(() => buildOverprovisionYaml(options({ image: "pause:3.10\n  x: y" })), /image/);
  assert.throws(() => buildOverprovisionYaml(options({ namespaces: ["a", "a"] })), /여러 번/);
});
