import { execFile } from "child_process";
import { loadSettings } from "./settings";

export interface NodeInfo {
  name: string;
  internalIp: string;
  version: string;
  status: string;
  creationTimestamp: string;
  unschedulable: boolean;
  isKarpenter: boolean;
  isManagedNodeGroup: boolean;
  group: string;
}

export interface PodInfo {
  namespace: string;
  name: string;
  status: string;
  nodeName: string;
  creationTimestamp: string;
}

export interface EventInfo {
  timestamp: string;
  type: string;
  reason: string;
  object: string;
  message: string;
  count: number;
}

export interface PodLog {
  podName: string;
  // log 본문. 조회에 실패하면 빈 문자열이고 error에 이유가 담긴다.
  text: string;
  error: string;
}

/** 화면이 EC2NodeClass에서 보는 값은 이름과 어떤 AMI를 쓰는지 둘뿐이다. */
export interface Ec2NodeClassInfo {
  name: string;
  ami: string;
}

export interface NodePoolInfo {
  name: string;
  weight: string;
  // 이 NodePool이 만든 노드 수. 노드 조회가 실패하면 "-"다.
  nodes: string;
  ready: string;
  creationTimestamp: string;
  // 이 NodePool이 참조하는 EC2NodeClass 이름. 참조가 없으면 빈 문자열이다.
  nodeClassName: string;
}

export interface KarpenterResources {
  nodePools: NodePoolInfo[];
  // NodePool 또는 EC2NodeClass CRD가 없는 클러스터도 있으므로 조회 실패를 값으로 담는다.
  nodePoolsError: string;
  ec2NodeClasses: Ec2NodeClassInfo[];
  ec2NodeClassesError: string;
}

export interface KarpenterVersion {
  deployment: string;
  version: string;
  image: string;
}

export interface KarpenterVersions {
  versions: KarpenterVersion[];
  // deployment 조회 권한이 없어도 event와 log는 봐야 하므로 실패를 값으로 담는다.
  error: string;
}

export interface KarpenterLogs {
  namespace: string;
  labelSelector: string;
  sinceMinutes: number;
  logs: PodLog[];
}

const KARPENTER_LABELS = ["karpenter.sh/nodepool", "karpenter.sh/provisioner-name"];
const MANAGED_NODEGROUP_LABEL = "eks.amazonaws.com/nodegroup";

// 설정된 kubectl 명령("tsh kubectl" 등)을 공백으로 나눠 shell 없이 실행한다.
function runKubectl(args: string[]): Promise<string> {
  const parts = loadSettings().kubectlCommand.split(/\s+/).filter(Boolean);
  const command = parts[0];
  const commandArgs = [...parts.slice(1), ...args];

  return new Promise((resolve, reject) => {
    execFile(
      command,
      commandArgs,
      { maxBuffer: 64 * 1024 * 1024, env: process.env },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr.trim() || error.message));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

function nodeStatus(node: any): string {
  const conditions: any[] = node.status?.conditions ?? [];
  const ready = conditions.find((c) => c.type === "Ready");
  const base = ready?.status === "True" ? "Ready" : "NotReady";
  return node.spec?.unschedulable ? `${base},SchedulingDisabled` : base;
}

function internalIp(node: any): string {
  const addresses: any[] = node.status?.addresses ?? [];
  return addresses.find((a) => a.type === "InternalIP")?.address ?? "";
}

function nodeGroup(labels: Record<string, string>): string {
  for (const label of KARPENTER_LABELS) {
    if (labels[label]) return labels[label];
  }
  return labels[MANAGED_NODEGROUP_LABEL] ?? "";
}

function toNodeInfo(node: any): NodeInfo {
  const labels: Record<string, string> = node.metadata?.labels ?? {};
  return {
    name: node.metadata?.name ?? "",
    internalIp: internalIp(node),
    version: node.status?.nodeInfo?.kubeletVersion ?? "",
    status: nodeStatus(node),
    creationTimestamp: node.metadata?.creationTimestamp ?? "",
    unschedulable: Boolean(node.spec?.unschedulable),
    isKarpenter: KARPENTER_LABELS.some((label) => labels[label]),
    isManagedNodeGroup: Boolean(labels[MANAGED_NODEGROUP_LABEL]),
    group: nodeGroup(labels),
  };
}

function podStatus(pod: any): string {
  if (pod.metadata?.deletionTimestamp) return "Terminating";
  const waiting = (pod.status?.containerStatuses ?? []).find((c: any) => c.state?.waiting);
  return waiting?.state?.waiting?.reason ?? pod.status?.phase ?? "Unknown";
}

function toPodInfo(pod: any): PodInfo {
  return {
    namespace: pod.metadata?.namespace ?? "",
    name: pod.metadata?.name ?? "",
    status: podStatus(pod),
    nodeName: pod.spec?.nodeName ?? "",
    creationTimestamp: pod.metadata?.creationTimestamp ?? "",
  };
}

export async function getNodes(): Promise<NodeInfo[]> {
  const stdout = await runKubectl(["get", "nodes", "-o", "json"]);
  const items: any[] = JSON.parse(stdout).items ?? [];
  return items.map(toNodeInfo);
}

/**
 * 노드의 schedule 가능 여부를 바꾼다. cordon과 uncordon은 반대 동작이라
 * 하나의 함수로 두고 boolean으로 가른다. 화면의 버튼도 같은 이유로 하나다.
 */
export async function setNodeCordon(nodeName: string, cordon: boolean): Promise<void> {
  await runKubectl([cordon ? "cordon" : "uncordon", nodeName]);
}

/** over-provisioning manifest를 만들 대상 목록. 고를 수 있으면 되므로 이름만 돌려준다. */
export async function getNamespaces(): Promise<string[]> {
  const stdout = await runKubectl(["get", "namespaces", "-o", "json"]);
  const items: any[] = JSON.parse(stdout).items ?? [];
  return items
    .map((item) => item.metadata?.name ?? "")
    .filter(Boolean)
    .sort((a: string, b: string) => a.localeCompare(b));
}

export async function getPods(nodeName?: string): Promise<PodInfo[]> {
  const args = ["get", "pods", "--all-namespaces", "-o", "json"];
  if (nodeName) {
    args.push("--field-selector", `spec.nodeName=${nodeName}`);
  }
  const stdout = await runKubectl(args);
  const items: any[] = JSON.parse(stdout).items ?? [];
  return items.map(toPodInfo);
}

// core/v1 Event와 events.k8s.io/v1 Event의 필드 이름이 달라 둘 다 읽는다.
function eventTimestamp(event: any): string {
  return (
    event.lastTimestamp ??
    event.series?.lastObservedTime ??
    event.eventTime ??
    event.firstTimestamp ??
    event.metadata?.creationTimestamp ??
    ""
  );
}

function eventObject(event: any): string {
  const target = event.involvedObject ?? event.regarding ?? {};
  if (!target.kind) return target.name ?? "";
  return `${target.kind}/${target.name ?? ""}`;
}

function toEventInfo(event: any): EventInfo {
  return {
    timestamp: eventTimestamp(event),
    type: event.type ?? "",
    reason: event.reason ?? "",
    object: eventObject(event),
    message: (event.message ?? event.note ?? "").trim(),
    count: event.count ?? event.series?.count ?? event.deprecatedCount ?? 1,
  };
}

/** 정렬용 시각. 비었거나 읽을 수 없는 값이 NaN이 되어 정렬을 흐트러뜨리지 않게 0으로 맞춘다. */
function eventSortKey(timestamp: string): number {
  const parsed = Date.parse(timestamp);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** karpenter namespace의 event를 오래된 것부터 시간순으로 돌려준다. */
export async function getKarpenterEvents(): Promise<EventInfo[]> {
  const namespace = loadSettings().karpenterNamespace;
  const stdout = await runKubectl(["get", "events", "-n", namespace, "-o", "json"]);
  const items: any[] = JSON.parse(stdout).items ?? [];
  return items
    .map(toEventInfo)
    .sort((a, b) => eventSortKey(a.timestamp) - eventSortKey(b.timestamp));
}

async function getPodNames(namespace: string, labelSelector: string): Promise<string[]> {
  const stdout = await runKubectl([
    "get",
    "pods",
    "-n",
    namespace,
    "-l",
    labelSelector,
    "-o",
    "json",
  ]);
  const items: any[] = JSON.parse(stdout).items ?? [];
  return items.map((pod) => pod.metadata?.name ?? "").filter(Boolean);
}

/** pod 하나의 log. 한 pod가 실패해도 나머지 pod의 log는 보여줘야 하므로 에러를 값으로 담는다. */
async function getPodLog(
  namespace: string,
  podName: string,
  sinceMinutes: number
): Promise<PodLog> {
  try {
    const text = await runKubectl([
      "logs",
      podName,
      "-n",
      namespace,
      "--all-containers=true",
      "--timestamps",
      `--since=${sinceMinutes}m`,
    ]);
    return { podName, text: text.trimEnd(), error: "" };
  } catch (error) {
    return { podName, text: "", error: String(error instanceof Error ? error.message : error) };
  }
}

const NO_VALUE = "-";

/** amiSelectorTerms의 항목을 alias=al2023@latest 같은 한 줄 표기로 만든다. */
function amiTermText(term: Record<string, any>): string {
  return Object.entries(term)
    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`)
    .join(" ");
}

/**
 * EC2NodeClass가 어떤 AMI를 쓰는지 한 칸에 담는다.
 * amiSelectorTerms를 우선 보고, 없으면 예전 필드인 amiFamily를 쓴다.
 */
function amiText(spec: any): string {
  const terms: any[] = spec?.amiSelectorTerms ?? [];
  if (terms.length > 0) return terms.map(amiTermText).join(", ");
  return spec?.amiFamily ?? NO_VALUE;
}

/** status.conditions의 Ready 상태. condition이 아직 없으면 -다. */
function readyStatus(item: any): string {
  const conditions: any[] = item.status?.conditions ?? [];
  return conditions.find((condition) => condition.type === "Ready")?.status ?? NO_VALUE;
}

function toEc2NodeClass(item: any): Ec2NodeClassInfo {
  return {
    name: item.metadata?.name ?? "",
    ami: amiText(item.spec ?? {}),
  };
}

/**
 * NodePool이 어떤 EC2NodeClass를 쓰는지는 template의 nodeClassRef에 있다.
 * 이 이름이 두 리소스를 잇는 유일한 값이라 화면의 그룹 기준이 된다.
 */
function nodeClassName(spec: any): string {
  return spec?.template?.spec?.nodeClassRef?.name ?? "";
}

/** 만든 노드 수는 NodePool status에 없어서 노드 목록을 세어 채운다. */
function toNodePool(item: any, nodeCounts: Map<string, number> | null): NodePoolInfo {
  const spec = item.spec ?? {};
  const name = item.metadata?.name ?? "";
  return {
    name,
    weight: spec.weight === undefined ? NO_VALUE : String(spec.weight),
    nodes: nodeCounts ? String(nodeCounts.get(name) ?? 0) : NO_VALUE,
    ready: readyStatus(item),
    creationTimestamp: item.metadata?.creationTimestamp ?? "",
    nodeClassName: nodeClassName(spec),
  };
}

/** CRD가 없는 클러스터도 있으므로 실패를 던지지 않고 에러 메시지와 함께 돌려준다. */
async function getResourceItems(resource: string): Promise<{ items: any[]; error: string }> {
  try {
    const stdout = await runKubectl(["get", resource, "-o", "json"]);
    return { items: JSON.parse(stdout).items ?? [], error: "" };
  } catch (error) {
    return { items: [], error: String(error instanceof Error ? error.message : error) };
  }
}

/**
 * NodePool 이름별 노드 수. NodePool status에는 노드 수가 없어서 노드 label로 센다.
 * 노드 조회가 실패하면 0과 구분하려고 null을 돌려준다.
 */
async function countNodesByNodePool(): Promise<Map<string, number> | null> {
  try {
    const counts = new Map<string, number>();
    for (const node of await getNodes()) {
      if (!node.isKarpenter) continue;
      counts.set(node.group, (counts.get(node.group) ?? 0) + 1);
    }
    return counts;
  } catch {
    return null;
  }
}

/** NodePool과 EC2NodeClass 목록. 둘 다 cluster scope 리소스라 namespace를 쓰지 않는다. */
export async function getKarpenterResources(): Promise<KarpenterResources> {
  const [nodePools, ec2NodeClasses, nodeCounts] = await Promise.all([
    getResourceItems("nodepools.karpenter.sh"),
    getResourceItems("ec2nodeclasses.karpenter.k8s.aws"),
    countNodesByNodePool(),
  ]);
  return {
    nodePools: nodePools.items.map((item) => toNodePool(item, nodeCounts)),
    nodePoolsError: nodePools.error,
    ec2NodeClasses: ec2NodeClasses.items.map(toEc2NodeClass),
    ec2NodeClassesError: ec2NodeClasses.error,
  };
}

/**
 * image 문자열에서 tag를 뽑는다. registry에 port가 붙어 있으면(host:5000/karpenter)
 * 마지막 / 뒤에서만 :를 찾아야 tag와 port를 혼동하지 않는다.
 */
function imageTag(image: string): string {
  const name = image.split("@")[0];
  const lastSlash = name.lastIndexOf("/");
  const colon = name.indexOf(":", lastSlash + 1);
  return colon === -1 ? "" : name.slice(colon + 1);
}

function containerImage(deployment: any): string {
  const containers: any[] = deployment.spec?.template?.spec?.containers ?? [];
  return containers[0]?.image ?? "";
}

/** helm chart가 붙이는 app.kubernetes.io/version label을 먼저 보고, 없으면 image tag를 쓴다. */
function toKarpenterVersion(deployment: any): KarpenterVersion {
  const image = containerImage(deployment);
  const labelVersion = deployment.metadata?.labels?.["app.kubernetes.io/version"];
  return {
    deployment: deployment.metadata?.name ?? "",
    version: labelVersion || imageTag(image) || NO_VALUE,
    image: image || NO_VALUE,
  };
}

/** karpenter deployment에서 읽은 버전. label selector는 pod 조회와 같은 설정을 쓴다. */
export async function getKarpenterVersions(): Promise<KarpenterVersions> {
  const settings = loadSettings();
  try {
    const stdout = await runKubectl([
      "get",
      "deployments",
      "-n",
      settings.karpenterNamespace,
      "-l",
      settings.karpenterPodLabelSelector,
      "-o",
      "json",
    ]);
    const items: any[] = JSON.parse(stdout).items ?? [];
    return { versions: items.map(toKarpenterVersion), error: "" };
  } catch (error) {
    return { versions: [], error: String(error instanceof Error ? error.message : error) };
  }
}

/** label selector로 찾은 karpenter pod들의 최근 log를 모은다. */
export async function getKarpenterLogs(): Promise<KarpenterLogs> {
  const settings = loadSettings();
  const namespace = settings.karpenterNamespace;
  const labelSelector = settings.karpenterPodLabelSelector;
  const sinceMinutes = settings.karpenterLogSinceMinutes;

  const podNames = await getPodNames(namespace, labelSelector);
  const logs = await Promise.all(
    podNames.map((podName) => getPodLog(namespace, podName, sinceMinutes))
  );
  return { namespace, labelSelector, sinceMinutes, logs };
}
