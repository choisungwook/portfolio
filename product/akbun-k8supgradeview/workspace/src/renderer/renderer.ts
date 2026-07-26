interface NodeInfo {
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

interface PodInfo {
  namespace: string;
  name: string;
  status: string;
  nodeName: string;
  creationTimestamp: string;
}

interface AppSettings {
  kubectlCommand: string;
}

interface Api {
  getNodes(): Promise<NodeInfo[]>;
  getPods(nodeName?: string): Promise<PodInfo[]>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
}

declare const api: Api;

type NodeFilterKind = "all" | "karpenter" | "managed" | "cordoned";

let allNodes: NodeInfo[] = [];
let allPods: PodInfo[] = [];
let nodeFilter: NodeFilterKind = "all";
let selectedNode = "";

function $(selector: string): HTMLElement {
  return document.querySelector(selector) as HTMLElement;
}

function showError(message: string): void {
  const banner = $("#error-banner");
  banner.textContent = message;
  banner.classList.remove("hidden");
}

function clearError(): void {
  $("#error-banner").classList.add("hidden");
}

// kubectl과 비슷한 형식으로 age를 표시한다. 예: 45s, 30m, 12h, 5d
function formatAge(creationTimestamp: string): string {
  if (!creationTimestamp) return "";
  const seconds = Math.floor((Date.now() - Date.parse(creationTimestamp)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 172800) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function statusClass(status: string): string {
  if (status === "Ready" || status === "Running" || status === "Succeeded") return "status-ready";
  if (status.includes("SchedulingDisabled") || status === "Pending" || status === "Terminating") {
    return "status-warning";
  }
  return "status-error";
}

function appendCell(row: HTMLTableRowElement, text: string, className?: string): void {
  const cell = row.insertCell();
  cell.textContent = text;
  if (className) cell.className = className;
}

function matchesFilter(node: NodeInfo): boolean {
  if (nodeFilter === "karpenter") return node.isKarpenter;
  if (nodeFilter === "managed") return node.isManagedNodeGroup;
  if (nodeFilter === "cordoned") return node.unschedulable;
  return true;
}

function renderNodes(): void {
  const tbody = $("#node-table tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";
  const nodes = allNodes.filter(matchesFilter);
  $("#node-empty").classList.toggle("hidden", nodes.length > 0);

  for (const node of nodes) {
    const row = tbody.insertRow();
    row.dataset.name = node.name;
    if (node.name === selectedNode) row.classList.add("selected");
    appendCell(row, node.name);
    appendCell(row, node.internalIp);
    appendCell(row, node.version);
    appendCell(row, node.status, statusClass(node.status));
    appendCell(row, formatAge(node.creationTimestamp));
    appendCell(row, node.group);
    row.addEventListener("click", () => selectNode(node.name));
  }
}

async function selectNode(nodeName: string): Promise<void> {
  selectedNode = nodeName;
  renderNodes();
  const panel = $("#node-pods-panel");
  panel.classList.remove("hidden");
  $("#node-pods-title").textContent = `${nodeName}의 파드`;

  try {
    clearError();
    const pods = await api.getPods(nodeName);
    renderNodePods(pods);
  } catch (error) {
    showError(String(error));
  }
}

function renderNodePods(pods: PodInfo[]): void {
  const tbody = $("#node-pod-table tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";
  for (const pod of pods) {
    const row = tbody.insertRow();
    appendCell(row, pod.namespace);
    appendCell(row, pod.name);
    appendCell(row, pod.status, statusClass(pod.status));
    appendCell(row, formatAge(pod.creationTimestamp));
  }
}

async function refreshNodes(): Promise<void> {
  try {
    clearError();
    allNodes = await api.getNodes();
    renderNodes();
  } catch (error) {
    showError(String(error));
  }
}

function renderNamespaceOptions(): void {
  const select = $("#namespace-filter") as HTMLSelectElement;
  const current = select.value;
  const namespaces = [...new Set(allPods.map((p) => p.namespace))].sort();
  select.innerHTML = '<option value="">모든 namespace</option>';
  for (const namespace of namespaces) {
    const option = document.createElement("option");
    option.value = namespace;
    option.textContent = namespace;
    select.appendChild(option);
  }
  select.value = namespaces.includes(current) ? current : "";
}

function renderPods(): void {
  const namespace = ($("#namespace-filter") as HTMLSelectElement).value;
  const search = ($("#pod-search") as HTMLInputElement).value.trim().toLowerCase();
  const tbody = $("#pod-table tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";

  const pods = allPods.filter(
    (pod) =>
      (!namespace || pod.namespace === namespace) &&
      (!search || pod.name.toLowerCase().includes(search))
  );
  $("#pod-empty").classList.toggle("hidden", pods.length > 0);

  for (const pod of pods) {
    const row = tbody.insertRow();
    appendCell(row, pod.namespace);
    appendCell(row, pod.name);
    appendCell(row, pod.status, statusClass(pod.status));
    appendCell(row, pod.nodeName);
    appendCell(row, formatAge(pod.creationTimestamp));
  }
}

async function refreshPods(): Promise<void> {
  try {
    clearError();
    allPods = await api.getPods();
    renderNamespaceOptions();
    renderPods();
  } catch (error) {
    showError(String(error));
  }
}

function activateTab(tab: string): void {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", (button as HTMLElement).dataset.tab === tab);
  });
  document.querySelectorAll(".tab").forEach((section) => {
    section.classList.toggle("active", section.id === `tab-${tab}`);
  });
  if (tab === "pods" && allPods.length === 0) void refreshPods();
}

async function loadSettingsForm(): Promise<void> {
  try {
    const settings = await api.getSettings();
    ($("#kubectl-command") as HTMLInputElement).value = settings.kubectlCommand;
  } catch (error) {
    showError(String(error));
  }
}

async function submitSettings(): Promise<void> {
  try {
    const kubectlCommand = ($("#kubectl-command") as HTMLInputElement).value;
    const saved = await api.saveSettings({ kubectlCommand });
    ($("#kubectl-command") as HTMLInputElement).value = saved.kubectlCommand;
    const badge = $("#settings-saved");
    badge.classList.remove("hidden");
    setTimeout(() => badge.classList.add("hidden"), 2000);
  } catch (error) {
    showError(String(error));
  }
}

function registerEventHandlers(): void {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => activateTab((button as HTMLElement).dataset.tab ?? ""));
  });
  document.querySelectorAll(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      nodeFilter = ((button as HTMLElement).dataset.filter ?? "all") as NodeFilterKind;
      document.querySelectorAll(".filter-button").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      renderNodes();
    });
  });
  $("#refresh-nodes").addEventListener("click", () => void refreshNodes());
  $("#refresh-pods").addEventListener("click", () => void refreshPods());
  $("#namespace-filter").addEventListener("change", renderPods);
  $("#pod-search").addEventListener("input", renderPods);
  $("#save-settings").addEventListener("click", () => void submitSettings());
}

registerEventHandlers();
void loadSettingsForm();
void refreshNodes();
