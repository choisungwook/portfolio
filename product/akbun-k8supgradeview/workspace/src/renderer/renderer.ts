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

interface EventInfo {
  timestamp: string;
  type: string;
  reason: string;
  object: string;
  message: string;
  count: number;
}

interface PodLog {
  podName: string;
  text: string;
  error: string;
}

interface KarpenterVersion {
  deployment: string;
  version: string;
  image: string;
}

interface KarpenterVersions {
  versions: KarpenterVersion[];
  error: string;
}

interface KarpenterLogs {
  namespace: string;
  labelSelector: string;
  sinceMinutes: number;
  logs: PodLog[];
}

interface KarpenterResource {
  name: string;
  ami: string;
  weight: string;
}

interface NodePoolInfo extends KarpenterResource {
  nodes: string;
  ready: string;
  creationTimestamp: string;
}

interface KarpenterResources {
  nodePools: NodePoolInfo[];
  nodePoolsError: string;
  ec2NodeClasses: KarpenterResource[];
  ec2NodeClassesError: string;
}

interface AppSettings {
  kubectlCommand: string;
  karpenterNamespace: string;
  karpenterPodLabelSelector: string;
  karpenterLogSinceMinutes: number;
}

interface Api {
  getNodes(): Promise<NodeInfo[]>;
  getPods(nodeName?: string): Promise<PodInfo[]>;
  setNodeCordon(nodeName: string, cordon: boolean): Promise<boolean>;
  getKarpenterEvents(): Promise<EventInfo[]>;
  getKarpenterLogs(): Promise<KarpenterLogs>;
  getKarpenterVersions(): Promise<KarpenterVersions>;
  getKarpenterResources(): Promise<KarpenterResources>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
}

declare const api: Api;

type NodeFilterKind = "all" | "karpenter" | "managed" | "cordoned";

let allNodes: NodeInfo[] = [];
let allPods: PodInfo[] = [];
let nodeFilter: NodeFilterKind = "all";
let selectedNode = "";
let karpenterLoaded = false;
let nodePoolsLoaded = false;

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

/**
 * cordon과 uncordon을 버튼 하나로 둔다. 노드의 unschedulable 값이 곧 버튼의 상태라
 * 두 버튼을 각각 활성/비활성으로 관리할 때보다 어긋날 여지가 없다.
 */
function appendCordonCell(row: HTMLTableRowElement, node: NodeInfo): void {
  const cell = row.insertCell();
  const button = document.createElement("button");
  button.className = "cordon-button";
  button.textContent = node.unschedulable ? "Uncordon" : "Cordon";
  // 행 클릭은 파드 조회다. 버튼을 눌렀을 때 그 동작까지 함께 돌지 않게 막는다.
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    void toggleCordon(node, button);
  });
  cell.appendChild(button);
}

/** 실행 중에는 버튼을 잠가 같은 노드에 명령이 겹쳐 돌지 않게 한다. */
async function toggleCordon(node: NodeInfo, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  try {
    clearError();
    // 취소하면 클러스터 상태가 그대로이므로 다시 조회하지 않는다.
    if (await api.setNodeCordon(node.name, !node.unschedulable)) await refreshNodes();
  } catch (error) {
    showError(String(error));
  } finally {
    button.disabled = false;
  }
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
    appendCordonCell(row, node);
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

// event는 언제 일어났는지가 중요하므로 age 대신 로컬 시각을 그대로 보여준다.
function formatEventTime(timestamp: string): string {
  if (!timestamp) return "";
  const time = new Date(timestamp);
  if (Number.isNaN(time.getTime())) return timestamp;
  const pad = (value: number) => String(value).padStart(2, "0");
  const date = `${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
  return `${date} ${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}`;
}

function renderKarpenterEvents(events: EventInfo[]): void {
  const tbody = $("#karpenter-event-table tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";
  $("#karpenter-event-empty").classList.toggle("hidden", events.length > 0);

  for (const event of events) {
    const row = tbody.insertRow();
    appendCell(row, formatEventTime(event.timestamp));
    appendCell(row, event.type, event.type === "Warning" ? "status-warning" : "");
    appendCell(row, event.reason);
    appendCell(row, event.object);
    appendCell(row, String(event.count));
    const message = row.insertCell();
    message.textContent = event.message;
    message.className = "message-cell";
  }
}

function createLogBlock(log: PodLog): HTMLElement {
  const block = document.createElement("section");
  block.className = "log-block";

  const title = document.createElement("h3");
  title.textContent = log.podName;
  block.appendChild(title);

  const body = document.createElement("pre");
  if (log.error) {
    body.className = "log-error";
    body.textContent = log.error;
  } else {
    body.textContent = log.text || "해당 기간에 남은 로그가 없습니다.";
  }
  block.appendChild(body);
  return block;
}

function renderKarpenterLogs(result: KarpenterLogs): void {
  const container = $("#karpenter-logs");
  container.innerHTML = "";
  $("#karpenter-log-empty").classList.toggle("hidden", result.logs.length > 0);
  for (const log of result.logs) {
    container.appendChild(createLogBlock(log));
  }
  $("#karpenter-scope").textContent =
    `namespace ${result.namespace} / label ${result.labelSelector} / 최근 ${result.sinceMinutes}분`;
}

function renderKarpenterVersions(result: KarpenterVersions): void {
  const tbody = prepareResourceTable("karpenter-version", result.versions.length, result.error);
  for (const version of result.versions) {
    const row = tbody.insertRow();
    appendCell(row, version.deployment);
    appendCell(row, version.version);
    appendCell(row, version.image);
  }
}

async function refreshKarpenter(): Promise<void> {
  try {
    clearError();
    const [versions, events, logs] = await Promise.all([
      api.getKarpenterVersions(),
      api.getKarpenterEvents(),
      api.getKarpenterLogs(),
    ]);
    renderKarpenterVersions(versions);
    renderKarpenterEvents(events);
    renderKarpenterLogs(logs);
    karpenterLoaded = true;
  } catch (error) {
    showError(String(error));
  }
}

function renderResourceError(selector: string, message: string): void {
  const paragraph = $(selector);
  paragraph.textContent = message;
  paragraph.classList.toggle("hidden", !message);
}

// Ready condition이 아직 없으면 "-"라 좋고 나쁨을 말할 수 없으므로 색을 주지 않는다.
function readyClass(ready: string): string {
  if (ready === "True") return "status-ready";
  if (ready === "False") return "status-error";
  return "";
}

/** 조회 자체가 실패했으면 비었다는 안내 대신 에러만 보여준다. */
function prepareResourceTable(
  prefix: string,
  count: number,
  error: string
): HTMLTableSectionElement {
  renderResourceError(`#${prefix}-error`, error);
  $(`#${prefix}-empty`).classList.toggle("hidden", count > 0 || Boolean(error));
  const tbody = $(`#${prefix}-table tbody`) as HTMLTableSectionElement;
  tbody.innerHTML = "";
  return tbody;
}

function renderNodePools(nodePools: NodePoolInfo[], error: string): void {
  const tbody = prepareResourceTable("nodepool", nodePools.length, error);
  for (const nodePool of nodePools) {
    const row = tbody.insertRow();
    appendCell(row, nodePool.name);
    appendCell(row, nodePool.ami);
    appendCell(row, nodePool.weight);
    appendCell(row, nodePool.nodes);
    appendCell(row, nodePool.ready, readyClass(nodePool.ready));
    appendCell(row, formatAge(nodePool.creationTimestamp));
  }
}

function renderEc2NodeClasses(resources: KarpenterResource[], error: string): void {
  const tbody = prepareResourceTable("ec2nodeclass", resources.length, error);
  for (const resource of resources) {
    const row = tbody.insertRow();
    appendCell(row, resource.name);
    appendCell(row, resource.ami);
    appendCell(row, resource.weight);
  }
}

async function refreshKarpenterResources(): Promise<void> {
  try {
    clearError();
    const result = await api.getKarpenterResources();
    renderNodePools(result.nodePools, result.nodePoolsError);
    renderEc2NodeClasses(result.ec2NodeClasses, result.ec2NodeClassesError);
    nodePoolsLoaded = true;
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
  if (tab === "karpenter" && !karpenterLoaded) void refreshKarpenter();
  if (tab === "nodepools" && !nodePoolsLoaded) void refreshKarpenterResources();
}

function fillSettingsForm(settings: AppSettings): void {
  ($("#kubectl-command") as HTMLInputElement).value = settings.kubectlCommand;
  ($("#karpenter-namespace") as HTMLInputElement).value = settings.karpenterNamespace;
  ($("#karpenter-label-selector") as HTMLInputElement).value = settings.karpenterPodLabelSelector;
  ($("#karpenter-log-since") as HTMLInputElement).value = String(settings.karpenterLogSinceMinutes);
}

async function loadSettingsForm(): Promise<void> {
  try {
    fillSettingsForm(await api.getSettings());
  } catch (error) {
    showError(String(error));
  }
}

function readSettingsForm(): AppSettings {
  return {
    kubectlCommand: ($("#kubectl-command") as HTMLInputElement).value,
    karpenterNamespace: ($("#karpenter-namespace") as HTMLInputElement).value,
    karpenterPodLabelSelector: ($("#karpenter-label-selector") as HTMLInputElement).value,
    karpenterLogSinceMinutes: Number(($("#karpenter-log-since") as HTMLInputElement).value),
  };
}

async function submitSettings(): Promise<void> {
  try {
    const saved = await api.saveSettings(readSettingsForm());
    fillSettingsForm(saved);
    // 조회 대상이 바뀌었을 수 있으므로 karpenter 탭들을 다시 열 때 새로 불러오게 한다.
    karpenterLoaded = false;
    nodePoolsLoaded = false;
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
  $("#refresh-karpenter").addEventListener("click", () => void refreshKarpenter());
  $("#refresh-nodepools").addEventListener("click", () => void refreshKarpenterResources());
  $("#namespace-filter").addEventListener("change", renderPods);
  $("#pod-search").addEventListener("input", renderPods);
  $("#save-settings").addEventListener("click", () => void submitSettings());
}

registerEventHandlers();
void loadSettingsForm();
void refreshNodes();
