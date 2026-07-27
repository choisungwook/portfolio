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

/** karpenter namespace의 event를 오래된 것부터 시간순으로 돌려준다. */
export async function getKarpenterEvents(): Promise<EventInfo[]> {
  const namespace = loadSettings().karpenterNamespace;
  const stdout = await runKubectl(["get", "events", "-n", namespace, "-o", "json"]);
  const items: any[] = JSON.parse(stdout).items ?? [];
  return items
    .map(toEventInfo)
    .sort((a, b) => Date.parse(a.timestamp || "0") - Date.parse(b.timestamp || "0"));
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
