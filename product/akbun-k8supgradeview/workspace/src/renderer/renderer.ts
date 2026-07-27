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
  nodeClassName: string;
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
  copyText(text: string): Promise<void>;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
}

declare const api: Api;

type NodeFilterKind = "all" | "karpenter" | "managed" | "cordoned";

type PodSortKey = "namespace" | "status";
type SortDirection = "asc" | "desc";

interface PodSort {
  key: PodSortKey;
  direction: SortDirection;
}

let allNodes: NodeInfo[] = [];
let allPods: PodInfo[] = [];
let nodeFilter: NodeFilterKind = "all";
// 정렬을 고르기 전에는 kubectl이 준 순서를 그대로 둔다.
let podSort: PodSort | null = null;
let podOnlyNotRunning = false;
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

const ERROR_KEYWORD_PATTERN = /error/gi;

/**
 * error 키워드만 빨갛게 칠한다. 조각을 textContent로만 넣으므로 로그나 event 본문이
 * HTML로 해석되지 않는다. 대소문자를 가리지 않아야 Error와 error를 함께 잡는다.
 */
function appendErrorHighlighted(target: HTMLElement, text: string): void {
  let lastIndex = 0;
  for (const match of text.matchAll(ERROR_KEYWORD_PATTERN)) {
    const start = match.index ?? 0;
    target.appendChild(document.createTextNode(text.slice(lastIndex, start)));
    const keyword = document.createElement("span");
    keyword.className = "error-keyword";
    keyword.textContent = match[0];
    target.appendChild(keyword);
    lastIndex = start + match[0].length;
  }
  target.appendChild(document.createTextNode(text.slice(lastIndex)));
}

function appendHighlightedCell(
  row: HTMLTableRowElement,
  text: string,
  className?: string
): HTMLTableCellElement {
  const cell = row.insertCell();
  appendErrorHighlighted(cell, text);
  if (className) cell.className = className;
  return cell;
}

/** 복사에 성공하면 버튼 글자를 잠깐 바꿔 눌렸다는 것을 알린다. */
async function copyToClipboard(text: string, button: HTMLButtonElement): Promise<void> {
  try {
    clearError();
    await api.copyText(text);
    button.textContent = "복사됨";
    setTimeout(() => {
      button.textContent = "복사";
    }, 1500);
  } catch (error) {
    showError(String(error));
  }
}

/** 노드 이름은 kubectl 명령에 그대로 붙여 쓰는 값이라 이름 옆에 복사 버튼을 둔다. */
function appendNameCellWithCopy(row: HTMLTableRowElement, name: string): void {
  const cell = row.insertCell();
  cell.className = "name-cell";
  const box = document.createElement("div");
  box.className = "name-box";
  cell.appendChild(box);

  const label = document.createElement("span");
  label.textContent = name;
  box.appendChild(label);

  const button = document.createElement("button");
  button.className = "copy-button";
  button.textContent = "복사";
  button.title = `${name} 복사`;
  // 행 클릭은 파드 조회다. 복사할 때 그 동작까지 함께 돌지 않게 막는다.
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    void copyToClipboard(name, button);
  });
  box.appendChild(button);
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
    appendNameCellWithCopy(row, node.name);
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

const RUNNING_STATUS = "Running";

/**
 * 업그레이드 중에는 정상인 파드보다 Running에서 벗어난 파드를 먼저 봐야 한다.
 * Pending, CrashLoopBackOff처럼 상태 이름이 여럿이라 낱낱이 고르게 하는 대신
 * Running이 아닌 것만 남기는 토글 하나로 둔다.
 */
function matchesPodStatusFilter(pod: PodInfo): boolean {
  return !podOnlyNotRunning || pod.status !== RUNNING_STATUS;
}

/**
 * namespace와 status를 알파벳 순으로 정렬한다. 같은 값이 몰려 있는 칸이라
 * 두 번째 기준으로 pod 이름을 써야 새로고침할 때마다 순서가 흔들리지 않는다.
 */
function comparePods(a: PodInfo, b: PodInfo, sort: PodSort): number {
  const order = a[sort.key].localeCompare(b[sort.key]) || a.name.localeCompare(b.name);
  return sort.direction === "asc" ? order : -order;
}

function sortPods(pods: PodInfo[]): PodInfo[] {
  if (!podSort) return pods;
  const sort = podSort;
  return [...pods].sort((a, b) => comparePods(a, b, sort));
}

/** 어느 칼럼으로 어느 방향인지 헤더에 화살표로 남긴다. */
function renderPodSortIndicators(): void {
  document.querySelectorAll("#pod-table th[data-sort-key]").forEach((header) => {
    const active = podSort?.key === (header as HTMLElement).dataset.sortKey;
    header.classList.toggle("sorted", active);
    const arrow = header.querySelector(".sort-arrow") as HTMLElement;
    arrow.textContent = active ? (podSort?.direction === "asc" ? "▲" : "▼") : "";
  });
}

/** 같은 칼럼을 다시 누르면 방향만 뒤집고, 다른 칼럼이면 오름차순부터 시작한다. */
function togglePodSort(key: PodSortKey): void {
  const direction: SortDirection =
    podSort?.key === key && podSort.direction === "asc" ? "desc" : "asc";
  podSort = { key, direction };
  renderPods();
}

function renderPods(): void {
  const namespace = ($("#namespace-filter") as HTMLSelectElement).value;
  const search = ($("#pod-search") as HTMLInputElement).value.trim().toLowerCase();
  const tbody = $("#pod-table tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";
  renderPodSortIndicators();

  const pods = sortPods(
    allPods.filter(
      (pod) =>
        (!namespace || pod.namespace === namespace) &&
        (!search || pod.name.toLowerCase().includes(search)) &&
        matchesPodStatusFilter(pod)
    )
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

  // reason과 message에 섞여 있는 error를 눈으로 먼저 찾도록 그 낱말만 빨갛게 칠한다.
  for (const event of events) {
    const row = tbody.insertRow();
    appendCell(row, formatEventTime(event.timestamp));
    appendCell(row, event.type, event.type === "Warning" ? "status-warning" : "");
    appendHighlightedCell(row, event.reason);
    appendHighlightedCell(row, event.object);
    appendCell(row, String(event.count));
    appendHighlightedCell(row, event.message, "message-cell");
  }
}

function createLogBlock(log: PodLog): HTMLElement {
  const block = document.createElement("section");
  block.className = "log-block";

  const title = document.createElement("h3");
  appendErrorHighlighted(title, log.podName);
  block.appendChild(title);

  const body = document.createElement("pre");
  if (log.error) {
    body.className = "log-error";
    body.textContent = log.error;
  } else {
    appendErrorHighlighted(body, log.text || "해당 기간에 남은 로그가 없습니다.");
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

const NO_VALUE = "-";
const UNLINKED_GROUP = "연결된 NodePool 없음";

function renderNodePools(nodePools: NodePoolInfo[], error: string): void {
  const tbody = prepareResourceTable("nodepool", nodePools.length, error);
  for (const nodePool of nodePools) {
    const row = tbody.insertRow();
    appendCell(row, nodePool.name);
    appendCell(row, nodePool.nodeClassName || NO_VALUE);
    appendCell(row, nodePool.ami);
    appendCell(row, nodePool.weight);
    appendCell(row, nodePool.nodes);
    appendCell(row, nodePool.ready, readyClass(nodePool.ready));
    appendCell(row, formatAge(nodePool.creationTimestamp));
  }
}

interface Ec2NodeClassGroup {
  nodePoolName: string;
  // 이 그룹을 만든 NodePool의 nodeClassRef 이름. 참조가 없으면 빈 문자열이다.
  nodeClassName: string;
  resources: KarpenterResource[];
}

/**
 * EC2NodeClass를 그 클래스를 참조하는 NodePool 이름으로 묶는다. 업그레이드 때는
 * "이 NodePool이 지금 어떤 AMI로 노드를 띄우는가"를 봐야 하는데, 두 목록을 따로 두면
 * nodeClassRef를 눈으로 이어야 한다. 그룹으로 묶어 그 연결을 화면이 대신 보여준다.
 *
 * 이름은 클러스터 안에서 유일하므로 이름으로 찾는 map을 한 번 만들어 쓴다.
 * 한 EC2NodeClass를 여러 NodePool이 참조하면 같은 클래스가 여러 그룹에 나온다.
 * 어느 NodePool도 참조하지 않는 클래스는 맨 뒤에 따로 묶는다. NodePool 조회가 실패했을
 * 때도 이 묶음으로 떨어져 EC2NodeClass 목록 자체는 그대로 보인다.
 */
function groupEc2NodeClasses(
  nodePools: NodePoolInfo[],
  resources: KarpenterResource[]
): Ec2NodeClassGroup[] {
  const byName = new Map(resources.map((resource) => [resource.name, resource]));
  const linked = new Set<string>();
  const groups: Ec2NodeClassGroup[] = [];

  for (const nodePool of nodePools) {
    const matched = byName.get(nodePool.nodeClassName);
    if (matched) linked.add(matched.name);
    groups.push({
      nodePoolName: nodePool.name,
      nodeClassName: nodePool.nodeClassName,
      resources: matched ? [matched] : [],
    });
  }

  const unlinked = resources.filter((resource) => !linked.has(resource.name));
  if (unlinked.length > 0) {
    groups.push({ nodePoolName: UNLINKED_GROUP, nodeClassName: "", resources: unlinked });
  }
  return groups;
}

/** 그룹 이름을 표 안에 한 줄로 넣어 어디부터 어느 NodePool의 것인지 구분한다. */
function appendGroupHeaderRow(
  tbody: HTMLTableSectionElement,
  title: string,
  columns: number
): void {
  const row = tbody.insertRow();
  row.className = "group-row";
  const cell = row.insertCell();
  cell.colSpan = columns;
  cell.textContent = title;
}

/**
 * 그룹이 빈 이유는 둘이다. 참조 자체가 없거나, 참조가 가리키는 클래스를 못 찾았거나다.
 * 앞은 NodePool 설정이 덜 된 것이고 뒤는 이름이 어긋난 것이라 손볼 곳이 다르므로 나눠 적는다.
 */
function appendEmptyGroupRow(
  tbody: HTMLTableSectionElement,
  nodeClassName: string,
  columns: number
): void {
  const row = tbody.insertRow();
  const cell = row.insertCell();
  cell.colSpan = columns;
  cell.className = "empty";
  cell.textContent = nodeClassName
    ? `참조하는 EC2NodeClass ${nodeClassName}을 찾지 못했습니다.`
    : "참조하는 EC2NodeClass가 지정되어 있지 않습니다.";
}

function renderEc2NodeClasses(
  nodePools: NodePoolInfo[],
  resources: KarpenterResource[],
  error: string
): void {
  const tbody = prepareResourceTable("ec2nodeclass", resources.length, error);
  // 클래스가 하나도 없으면 표 아래 안내만 남긴다. 그룹까지 그리면 없다는 안내와 겹쳐 보인다.
  if (resources.length === 0) return;

  for (const group of groupEc2NodeClasses(nodePools, resources)) {
    appendGroupHeaderRow(tbody, group.nodePoolName, 3);
    if (group.resources.length === 0) {
      appendEmptyGroupRow(tbody, group.nodeClassName, 3);
      continue;
    }
    for (const resource of group.resources) {
      const row = tbody.insertRow();
      appendCell(row, resource.name);
      appendCell(row, resource.ami);
      appendCell(row, resource.weight);
    }
  }
}

async function refreshKarpenterResources(): Promise<void> {
  try {
    clearError();
    const result = await api.getKarpenterResources();
    renderNodePools(result.nodePools, result.nodePoolsError);
    renderEc2NodeClasses(result.nodePools, result.ec2NodeClasses, result.ec2NodeClassesError);
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
  document.querySelectorAll("#pod-table th[data-sort-key]").forEach((header) => {
    header.addEventListener("click", () =>
      togglePodSort((header as HTMLElement).dataset.sortKey as PodSortKey)
    );
  });
  $("#pod-status-filter").addEventListener("click", () => {
    podOnlyNotRunning = !podOnlyNotRunning;
    $("#pod-status-filter").classList.toggle("active", podOnlyNotRunning);
    renderPods();
  });
  $("#save-settings").addEventListener("click", () => void submitSettings());
}

registerEventHandlers();
void loadSettingsForm();
void refreshNodes();
