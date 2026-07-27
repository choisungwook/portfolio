/**
 * Karpenter over-provisioning manifest를 만든다.
 *
 * over-provisioning은 우선순위가 음수인 placeholder 파드를 미리 띄워 노드를 확보해 두는
 * 방법이다. 실제 워크로드가 뜨면 kube-scheduler가 이 파드를 밀어내고 그 자리에 들어가며,
 * 밀려난 placeholder가 Pending이 되면서 Karpenter가 다음 노드를 만든다. 업그레이드처럼
 * 노드가 한꺼번에 빠지는 작업에서 노드 provisioning 대기 시간을 줄이려고 쓴다.
 *
 * 문자열만 만들고 클러스터에는 손대지 않는다. 적용은 사용자가 kubectl apply로 한다.
 */

export interface OverprovisionOptions {
  namespaces: string[];
  cpuRequest: string;
  cpuLimit: string;
  replicas: number;
  image: string;
}

/** placeholder를 밀어낼 수 있게 우선순위를 음수로 둔다. 기본 우선순위는 0이다. */
export const PRIORITY_CLASS_NAME = "karpenter-overprovisioning";
export const PRIORITY_VALUE = -1;
export const DEPLOYMENT_NAME = "karpenter-overprovisioning";

/**
 * placeholder 컨테이너 image. 아무 일도 하지 않고 종료 신호만 기다리면 되므로
 * Kubernetes가 쓰는 pause image를 그대로 쓴다. Karpenter 문서와 blueprint의
 * over-provisioning 예제도 같은 image를 쓴다.
 */
export const DEFAULT_PAUSE_IMAGE = "registry.k8s.io/pause:3.10";

const NAMESPACE_PATTERN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
// kubectl이 받는 CPU 수량 표기. 1, 0.5, 500m을 허용한다.
const CPU_PATTERN = /^(\d+(\.\d+)?|\d+m)$/;
// image에 공백이나 줄바꿈이 들어오면 YAML 구조가 깨지므로 눈에 보이는 문자만 받는다.
const IMAGE_PATTERN = /^\S+$/;

const MAX_REPLICAS = 1000;

function assertNamespaces(namespaces: string[]): void {
  if (namespaces.length === 0) {
    throw new Error("namespace를 하나 이상 선택해야 한다");
  }
  for (const namespace of namespaces) {
    if (!NAMESPACE_PATTERN.test(namespace)) {
      throw new Error(`namespace 이름이 잘못되었다: ${namespace}`);
    }
  }
  if (new Set(namespaces).size !== namespaces.length) {
    throw new Error("같은 namespace가 여러 번 선택되었다");
  }
}

function assertCpu(label: string, value: string): void {
  if (!CPU_PATTERN.test(value)) {
    throw new Error(`${label}가 잘못되었다: 1, 0.5, 500m 같은 형식이어야 한다`);
  }
}

function assertReplicas(replicas: number): void {
  if (!Number.isInteger(replicas) || replicas < 1 || replicas > MAX_REPLICAS) {
    throw new Error(`replica가 잘못되었다: 1에서 ${MAX_REPLICAS} 사이의 정수여야 한다`);
  }
}

function assertImage(image: string): void {
  if (!IMAGE_PATTERN.test(image)) {
    throw new Error("image가 잘못되었다: 공백 없는 문자열이어야 한다");
  }
}

/**
 * cpu 수량을 비교 가능한 수로 바꾼다. 500m과 0.5가 같은 값이라 단위를 맞춰야
 * request와 limit의 크기를 견줄 수 있다.
 */
function cpuToNumber(value: string): number {
  return value.endsWith("m") ? Number(value.slice(0, -1)) / 1000 : Number(value);
}

/**
 * request가 limit보다 크면 kubelet이 파드를 거부한다. 만들 때 막지 않으면
 * apply한 뒤에야 알게 되므로 여기서 먼저 걸러 낸다.
 */
function assertCpuRange(cpuRequest: string, cpuLimit: string): void {
  if (cpuToNumber(cpuRequest) > cpuToNumber(cpuLimit)) {
    throw new Error("cpu request가 limit보다 클 수 없다");
  }
}

function validate(options: OverprovisionOptions): void {
  assertNamespaces(options.namespaces);
  assertCpu("cpu request", options.cpuRequest);
  assertCpu("cpu limit", options.cpuLimit);
  assertCpuRange(options.cpuRequest, options.cpuLimit);
  assertReplicas(options.replicas);
  assertImage(options.image);
}

/**
 * PriorityClass는 cluster scope 리소스라 namespace마다 만들 수 없다.
 * 선택한 namespace가 몇 개든 맨 앞에 한 번만 넣는다.
 */
function priorityClassYaml(): string {
  return [
    "apiVersion: scheduling.k8s.io/v1",
    "kind: PriorityClass",
    "metadata:",
    `  name: ${PRIORITY_CLASS_NAME}`,
    "  labels:",
    `    app.kubernetes.io/name: ${PRIORITY_CLASS_NAME}`,
    `value: ${PRIORITY_VALUE}`,
    "globalDefault: false",
    'description: "Karpenter over-provisioning placeholder. 실제 워크로드가 이 파드를 밀어낸다."',
  ].join("\n");
}

/**
 * namespace 하나의 placeholder Deployment.
 *
 * terminationGracePeriodSeconds를 0으로 두는 이유는 이 파드가 밀려날 때 기다릴 일이
 * 없기 때문이다. 기본값 30초를 두면 실제 워크로드가 그만큼 늦게 뜬다.
 */
function deploymentYaml(namespace: string, options: OverprovisionOptions): string {
  return [
    "apiVersion: apps/v1",
    "kind: Deployment",
    "metadata:",
    `  name: ${DEPLOYMENT_NAME}`,
    `  namespace: ${namespace}`,
    "  labels:",
    `    app.kubernetes.io/name: ${DEPLOYMENT_NAME}`,
    "spec:",
    `  replicas: ${options.replicas}`,
    "  selector:",
    "    matchLabels:",
    `      app.kubernetes.io/name: ${DEPLOYMENT_NAME}`,
    "  template:",
    "    metadata:",
    "      labels:",
    `        app.kubernetes.io/name: ${DEPLOYMENT_NAME}`,
    "    spec:",
    `      priorityClassName: ${PRIORITY_CLASS_NAME}`,
    "      terminationGracePeriodSeconds: 0",
    "      containers:",
    "        - name: pause",
    `          image: ${options.image}`,
    "          resources:",
    "            requests:",
    `              cpu: "${options.cpuRequest}"`,
    "            limits:",
    `              cpu: "${options.cpuLimit}"`,
  ].join("\n");
}

/**
 * 선택한 namespace 수만큼 Deployment를 만들고 --- 로 이어 붙인다.
 * 맨 앞의 PriorityClass까지 한 문서로 나와야 kubectl apply -f - 한 번으로 끝난다.
 */
export function buildOverprovisionYaml(options: OverprovisionOptions): string {
  validate(options);
  const documents = [
    priorityClassYaml(),
    ...options.namespaces.map((namespace) => deploymentYaml(namespace, options)),
  ];
  return `${documents.join("\n---\n")}\n`;
}
