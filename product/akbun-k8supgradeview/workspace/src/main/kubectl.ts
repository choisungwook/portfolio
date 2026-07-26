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
