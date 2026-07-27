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
  ready: string;
  allReady: boolean;
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

interface Ec2NodeClassInfo {
  name: string;
  ami: string;
}

interface NodePoolInfo {
  name: string;
  weight: string;
  nodes: string;
  ready: string;
  creationTimestamp: string;
  nodeClassName: string;
}

interface KarpenterResources {
  nodePools: NodePoolInfo[];
  nodePoolsError: string;
  ec2NodeClasses: Ec2NodeClassInfo[];
  ec2NodeClassesError: string;
}

interface AppSettings {
  kubectlCommand: string;
  karpenterNamespace: string;
  karpenterPodLabelSelector: string;
  karpenterLogSinceMinutes: number;
}

interface OverprovisionOptions {
  namespaces: string[];
  cpuRequest: string;
  cpuLimit: string;
  replicas: number;
  image: string;
}

interface Api {
  getNodes(): Promise<NodeInfo[]>;
  getPods(nodeName?: string): Promise<PodInfo[]>;
  describePod(namespace: string, name: string): Promise<string>;
  getNamespaces(): Promise<string[]>;
  buildOverprovisionYaml(options: OverprovisionOptions): Promise<string>;
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
type NodePoolSortKey = "weight" | "nodes";
type SortDirection = "asc" | "desc";

interface PodSort {
  key: PodSortKey;
  direction: SortDirection;
}

interface NodePoolSort {
  key: NodePoolSortKey;
  direction: SortDirection;
}

let allNodes: NodeInfo[] = [];
let allPods: PodInfo[] = [];
let nodeFilter: NodeFilterKind = "all";
// 정렬을 고르기 전에는 kubectl이 준 순서를 그대로 둔다.
let podSort: PodSort | null = null;
let podOnlyNotRunning = false;
let podOnlyNotReady = false;
let nodePoolSort: NodePoolSort | null = null;
let allNodePools: NodePoolInfo[] = [];
let nodePoolsError = "";
let selectedNode = "";
let karpenterLoaded = false;
let nodePoolsLoaded = false;
let allNamespaces: string[] = [];
// 새로고침으로 목록이 바뀌어도 고른 값을 잃지 않도록 이름으로 들고 있는다.
const selectedNamespaces = new Set<string>();
let namespacesLoaded = false;

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

/** 사이드 패널이 보고 있는 파드. 새로고침 버튼이 같은 대상을 다시 읽는 데 쓴다. */
let detailPod: { namespace: string; name: string } | null = null;

/**
 * 파드 이름 칸을 눌러 describe를 여는 버튼으로 만든다. 표의 다른 칸은 그대로 두어
 * 어디를 눌러야 열리는지 한 곳으로 모은다.
 */
function appendPodNameCell(row: HTMLTableRowElement, pod: PodInfo): void {
  const cell = row.insertCell();
  const button = document.createElement("button");
  button.className = "pod-name-button";
  button.textContent = pod.name;
  button.title = `${pod.name} describe 보기`;
  button.addEventListener("click", (event) => {
    // 노드 탭의 파드 표는 행 클릭이 노드 선택이라 그 동작까지 함께 돌지 않게 막는다.
    event.stopPropagation();
    void openPodDetail(pod.namespace, pod.name);
  });
  cell.appendChild(button);
}

/** 패널을 연 버튼. 닫을 때 그 자리로 focus를 되돌려 표에서 이어서 볼 수 있게 한다. */
let detailOpener: HTMLElement | null = null;

function closePodDetail(): void {
  detailPod = null;
  $("#pod-detail-panel").classList.add("hidden");
  detailOpener?.focus();
  detailOpener = null;
}

/**
 * describe는 한 번에 수십 줄이 나오고 클러스터가 멀면 몇 초가 걸린다.
 * 여는 즉시 대상과 조회 중임을 적어 두어 빈 화면을 보여주지 않는다.
 */
async function openPodDetail(namespace: string, name: string): Promise<void> {
  detailPod = { namespace, name };
  $("#pod-detail-panel").classList.remove("hidden");
  // 표에 focus가 남아 있으면 키보드만 쓰는 경우 열린 패널에 닿을 수 없다.
  // 패널 안의 새로고침으로 다시 읽을 때는 이미 패널에 있으므로 focus를 건드리지 않는다.
  const active = document.activeElement as HTMLElement | null;
  if (active?.classList.contains("pod-name-button")) {
    detailOpener = active;
    ($("#close-pod-detail") as HTMLButtonElement).focus();
  }
  $("#pod-detail-title").textContent = `${namespace} / ${name}`;
  const body = $("#pod-detail-body");
  body.className = "";
  body.textContent = "조회 중...";

  try {
    const text = await api.describePod(namespace, name);
    // 조회하는 동안 다른 파드를 눌렀으면 늦게 온 결과가 화면을 덮지 않게 버린다.
    if (detailPod?.namespace !== namespace || detailPod.name !== name) return;
    body.textContent = "";
    appendErrorHighlighted(body, text);
  } catch (error) {
    if (detailPod?.namespace !== namespace || detailPod.name !== name) return;
    // 상단 배너로 보내면 패널을 보는 동안 눈에 들어오지 않아 패널 안에 적는다.
    body.className = "detail-error";
    body.textContent = String(error instanceof Error ? error.message : error);
  }
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
    appendPodNameCell(row, pod);
    appendCell(row, pod.status, statusClass(pod.status));
    appendCell(row, pod.ready, podReadyClass(pod));
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
 * Running이어도 컨테이너가 Ready가 아니면 서비스에 들어가 있지 않다. 상태 필터와
 * 따로 두어야 "Running인데 Ready가 아닌" 파드만 골라 볼 수 있다. 두 필터는 AND다.
 */
function matchesPodReadyFilter(pod: PodInfo): boolean {
  return !podOnlyNotReady || !pod.allReady;
}

/** Ready 칸도 상태처럼 색으로 먼저 읽히게 한다. 정상이 아닌 쪽만 눈에 띄면 된다. */
function podReadyClass(pod: PodInfo): string {
  return pod.allReady ? "status-ready" : "status-error";
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

/**
 * 어느 칼럼으로 어느 방향인지 헤더에 남긴다. 화살표와 색은 눈으로만 읽히므로
 * 같은 내용을 aria-sort로도 적어 스크린리더가 정렬 상태를 말할 수 있게 한다.
 */
function renderSortIndicators(tableId: string, sort: { key: string; direction: SortDirection } | null): void {
  document.querySelectorAll(`#${tableId} th[data-sort-key]`).forEach((header) => {
    const active = sort?.key === (header as HTMLElement).dataset.sortKey;
    const ascending = sort?.direction === "asc";
    header.classList.toggle("sorted", active);
    header.setAttribute("aria-sort", active ? (ascending ? "ascending" : "descending") : "none");
    const arrow = header.querySelector(".sort-arrow");
    if (arrow) arrow.textContent = active ? (ascending ? "▲" : "▼") : "";
  });
}

/** 같은 칼럼을 다시 누르면 방향만 뒤집고, 다른 칼럼이면 오름차순부터 시작한다. */
function nextDirection(current: { key: string; direction: SortDirection } | null, key: string): SortDirection {
  return current?.key === key && current.direction === "asc" ? "desc" : "asc";
}

/**
 * 정렬 헤더에 마우스와 키보드를 함께 붙인다. th는 원래 focus를 받지 않아
 * tabIndex를 주지 않으면 키보드만 쓰는 사용자가 정렬에 닿을 수 없다.
 * Enter와 Space를 모두 받는 이유는 버튼처럼 동작한다고 알렸기 때문이다.
 * Space는 기본 동작이 화면 스크롤이라 막는다.
 */
function registerSortHeaders(tableId: string, toggle: (key: string) => void): void {
  document.querySelectorAll(`#${tableId} th[data-sort-key]`).forEach((header) => {
    const key = (header as HTMLElement).dataset.sortKey ?? "";
    header.addEventListener("click", () => toggle(key));
    header.addEventListener("keydown", (event) => {
      const { key: pressed } = event as KeyboardEvent;
      if (pressed !== "Enter" && pressed !== " ") return;
      event.preventDefault();
      toggle(key);
    });
  });
}

function togglePodSort(key: PodSortKey): void {
  podSort = { key, direction: nextDirection(podSort, key) };
  renderPods();
}

function renderPods(): void {
  const namespace = ($("#namespace-filter") as HTMLSelectElement).value;
  const search = ($("#pod-search") as HTMLInputElement).value.trim().toLowerCase();
  const tbody = $("#pod-table tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";
  renderSortIndicators("pod-table", podSort);

  const pods = sortPods(
    allPods.filter(
      (pod) =>
        (!namespace || pod.namespace === namespace) &&
        (!search || pod.name.toLowerCase().includes(search)) &&
        matchesPodStatusFilter(pod) &&
        matchesPodReadyFilter(pod)
    )
  );
  $("#pod-empty").classList.toggle("hidden", pods.length > 0);

  for (const pod of pods) {
    const row = tbody.insertRow();
    appendCell(row, pod.namespace);
    appendPodNameCell(row, pod);
    appendCell(row, pod.status, statusClass(pod.status));
    appendCell(row, pod.ready, podReadyClass(pod));
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

/**
 * Weight와 Nodes는 숫자 칸이라 알파벳 순으로 정렬하면 10이 9보다 앞에 온다.
 * 값이 없으면 "-"인데, 이것은 0이 아니라 "모르는 값"이라 크기로 견줄 수 없다.
 * 방향과 상관없이 늘 맨 뒤로 보내 숫자들 사이에 끼지 않게 한다.
 */
function compareNodePools(a: NodePoolInfo, b: NodePoolInfo, sort: NodePoolSort): number {
  const left = a[sort.key];
  const right = b[sort.key];
  if (left === NO_VALUE || right === NO_VALUE) {
    if (left === right) return a.name.localeCompare(b.name);
    return left === NO_VALUE ? 1 : -1;
  }
  const order = Number(left) - Number(right) || a.name.localeCompare(b.name);
  return sort.direction === "asc" ? order : -order;
}

function sortNodePools(nodePools: NodePoolInfo[]): NodePoolInfo[] {
  if (!nodePoolSort) return nodePools;
  const sort = nodePoolSort;
  return [...nodePools].sort((a, b) => compareNodePools(a, b, sort));
}

function renderNodePools(): void {
  const nodePools = sortNodePools(allNodePools);
  const tbody = prepareResourceTable("nodepool", nodePools.length, nodePoolsError);
  renderSortIndicators("nodepool-table", nodePoolSort);
  for (const nodePool of nodePools) {
    const row = tbody.insertRow();
    appendCell(row, nodePool.name);
    appendCell(row, nodePool.nodeClassName || NO_VALUE);
    appendCell(row, nodePool.weight);
    appendCell(row, nodePool.nodes);
    appendCell(row, nodePool.ready, readyClass(nodePool.ready));
    appendCell(row, formatAge(nodePool.creationTimestamp));
  }
}

function toggleNodePoolSort(key: NodePoolSortKey): void {
  nodePoolSort = { key, direction: nextDirection(nodePoolSort, key) };
  renderNodePools();
}

/** 조회한 순서 그대로 이름과 AMI만 나열한다. */
function renderEc2NodeClasses(resources: Ec2NodeClassInfo[], error: string): void {
  const tbody = prepareResourceTable("ec2nodeclass", resources.length, error);
  for (const resource of resources) {
    const row = tbody.insertRow();
    appendCell(row, resource.name);
    appendCell(row, resource.ami);
  }
}

async function refreshKarpenterResources(): Promise<void> {
  try {
    clearError();
    const result = await api.getKarpenterResources();
    allNodePools = result.nodePools;
    nodePoolsError = result.nodePoolsError;
    renderNodePools();
    renderEc2NodeClasses(result.ec2NodeClasses, result.ec2NodeClassesError);
    nodePoolsLoaded = true;
  } catch (error) {
    showError(String(error));
  }
}

// pause image. 아무 일도 하지 않고 종료 신호만 기다리면 되므로 Kubernetes의 pause를 쓴다.
const DEFAULT_PAUSE_IMAGE = "registry.k8s.io/pause:3.10";

function renderNamespaceSelection(): void {
  const list = $("#namespace-list");
  list.innerHTML = "";
  $("#namespace-empty").classList.toggle("hidden", allNamespaces.length > 0);

  for (const namespace of allNamespaces) {
    const label = document.createElement("label");
    label.className = "checkbox-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = namespace;
    checkbox.checked = selectedNamespaces.has(namespace);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedNamespaces.add(namespace);
      else selectedNamespaces.delete(namespace);
      renderSelectedCount();
    });

    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(namespace));
    list.appendChild(label);
  }
  renderSelectedCount();
}

function renderSelectedCount(): void {
  $("#namespace-selected-count").textContent = `${selectedNamespaces.size}개 선택됨`;
}

async function refreshNamespaces(): Promise<void> {
  try {
    clearError();
    allNamespaces = await api.getNamespaces();
    // 사라진 namespace를 선택 상태로 남겨 두면 없는 대상의 manifest가 만들어진다.
    for (const namespace of [...selectedNamespaces]) {
      if (!allNamespaces.includes(namespace)) selectedNamespaces.delete(namespace);
    }
    renderNamespaceSelection();
    namespacesLoaded = true;
  } catch (error) {
    showError(String(error));
  }
}

function setAllNamespacesSelected(selected: boolean): void {
  selectedNamespaces.clear();
  if (selected) allNamespaces.forEach((namespace) => selectedNamespaces.add(namespace));
  renderNamespaceSelection();
}

/** 선택 순서가 아니라 목록 순서를 따라야 다시 만들 때 같은 결과가 나온다. */
function readOverprovisionOptions(): OverprovisionOptions {
  return {
    namespaces: allNamespaces.filter((namespace) => selectedNamespaces.has(namespace)),
    cpuRequest: ($("#overprovision-cpu-request") as HTMLInputElement).value.trim(),
    cpuLimit: ($("#overprovision-cpu-limit") as HTMLInputElement).value.trim(),
    replicas: Number(($("#overprovision-replicas") as HTMLInputElement).value),
    image: ($("#overprovision-image") as HTMLInputElement).value.trim(),
  };
}

/** 입력이 잘못됐다는 안내는 상단 배너가 아니라 만들기 버튼 아래에 붙여야 눈에 띈다. */
function showOverprovisionResult(yaml: string, message: string): void {
  const output = $("#overprovision-yaml");
  output.textContent = yaml;
  output.classList.toggle("hidden", !yaml);
  $("#copy-overprovision").classList.toggle("hidden", !yaml);
  renderResourceError("#overprovision-error", message);
}

async function generateOverprovisionYaml(): Promise<void> {
  try {
    clearError();
    showOverprovisionResult(await api.buildOverprovisionYaml(readOverprovisionOptions()), "");
  } catch (error) {
    // 검증 실패도 여기로 온다. 만들다 만 결과가 남으면 새 입력의 결과로 잘못 읽힌다.
    showOverprovisionResult("", String(error instanceof Error ? error.message : error));
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
  if (tab === "utilize" && !namespacesLoaded) void refreshNamespaces();
}

/** 값을 채워 두면 무엇을 적는 칸인지 설명 없이 알 수 있고 바로 만들어 볼 수 있다. */
function fillOverprovisionDefaults(): void {
  ($("#overprovision-cpu-request") as HTMLInputElement).value = "1";
  ($("#overprovision-cpu-limit") as HTMLInputElement).value = "1";
  ($("#overprovision-replicas") as HTMLInputElement).value = "2";
  ($("#overprovision-image") as HTMLInputElement).value = DEFAULT_PAUSE_IMAGE;
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
  registerSortHeaders("pod-table", (key) => togglePodSort(key as PodSortKey));
  registerSortHeaders("nodepool-table", (key) => toggleNodePoolSort(key as NodePoolSortKey));
  $("#pod-status-filter").addEventListener("click", () => {
    podOnlyNotRunning = !podOnlyNotRunning;
    const button = $("#pod-status-filter");
    button.classList.toggle("active", podOnlyNotRunning);
    // 눌린 상태를 색으로만 알리면 화면을 못 보는 사용자는 켜졌는지 알 수 없다.
    button.setAttribute("aria-pressed", String(podOnlyNotRunning));
    renderPods();
  });
  $("#pod-ready-filter").addEventListener("click", () => {
    podOnlyNotReady = !podOnlyNotReady;
    const button = $("#pod-ready-filter");
    button.classList.toggle("active", podOnlyNotReady);
    button.setAttribute("aria-pressed", String(podOnlyNotReady));
    renderPods();
  });
  $("#close-pod-detail").addEventListener("click", closePodDetail);
  $("#refresh-pod-detail").addEventListener("click", () => {
    if (detailPod) void openPodDetail(detailPod.namespace, detailPod.name);
  });
  $("#copy-pod-detail").addEventListener("click", () => {
    const button = $("#copy-pod-detail") as HTMLButtonElement;
    void copyToClipboard($("#pod-detail-body").textContent ?? "", button);
  });
  // 패널을 닫는 데 마우스를 쓰지 않아도 되게 Escape를 받는다.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && detailPod) closePodDetail();
  });
  $("#save-settings").addEventListener("click", () => void submitSettings());
  $("#refresh-namespaces").addEventListener("click", () => void refreshNamespaces());
  $("#select-all-namespaces").addEventListener("click", () => setAllNamespacesSelected(true));
  $("#clear-namespaces").addEventListener("click", () => setAllNamespacesSelected(false));
  $("#generate-overprovision").addEventListener("click", () => void generateOverprovisionYaml());
  $("#copy-overprovision").addEventListener("click", () => {
    const button = $("#copy-overprovision") as HTMLButtonElement;
    void copyToClipboard($("#overprovision-yaml").textContent ?? "", button);
  });
}

registerEventHandlers();
fillOverprovisionDefaults();
void loadSettingsForm();
void refreshNodes();
