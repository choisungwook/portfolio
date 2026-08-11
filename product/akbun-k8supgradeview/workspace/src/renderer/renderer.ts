interface NodeInfo {
  name: string;
  internalIp: string;
  instanceType: string;
  capacityType: string;
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
  describeNode(name: string): Promise<string>;
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

type NodeFilterKind =
  | "all"
  | "karpenter"
  | "managed"
  | "spot"
  | "on-demand"
  | "cordoned";

let allNodes: NodeInfo[] = [];
let allPods: PodInfo[] = [];
// 노드 탭의 파드 표. 정렬만 바꿀 때 다시 조회하지 않고 그리려면 들고 있어야 한다.
let nodePods: PodInfo[] = [];
let nodeFilter: NodeFilterKind = "all";
let podOnlyNotRunning = false;
let podOnlyNotReady = false;
let allNodePools: NodePoolInfo[] = [];
let nodePoolsError = "";
let allEc2NodeClasses: Ec2NodeClassInfo[] = [];
let ec2NodeClassesError = "";
let allKarpenterEvents: EventInfo[] = [];
let allKarpenterVersions: KarpenterVersion[] = [];
let karpenterVersionsError = "";
let selectedNode = "";
let karpenterLoaded = false;
let nodePoolsLoaded = false;
let allNamespaces: string[] = [];
// 새로고침으로 목록이 바뀌어도 고른 값을 잃지 않도록 이름으로 들고 있는다.
const selectedNamespaces = new Set<string>();
let namespacesLoaded = false;

type SortDirection = "asc" | "desc";

/**
 * 칸의 값이 어떤 종류인지 정한다. 종류마다 견주는 방법이 달라야 화면에 보이는 대로
 * 정렬된다. text는 글자, natural은 숫자가 섞인 글자(v1.9와 v1.29, 2/2와 10/10),
 * number는 숫자, ip는 octet, age는 나이, time은 시각이다.
 */
type SortKind = "text" | "natural" | "number" | "ip" | "age" | "time";

interface SortState {
  key: string;
  direction: SortDirection;
}

interface SortColumn<T> {
  kind: SortKind;
  value(row: T): string;
}

/**
 * 표 하나의 정렬 규칙. columns의 key는 헤더의 data-sort-key와 같아야 하고,
 * tiebreak는 정렬 기준 값이 같을 때 쓰는 두 번째 기준이다. 두 번째 기준이 없으면
 * 같은 값이 몰려 있는 칸으로 정렬할 때 새로고침마다 순서가 흔들린다.
 */
interface SortSpec<T> {
  columns: Record<string, SortColumn<T>>;
  tiebreak(row: T): string;
}

const NO_VALUE = "-";

/**
 * 숫자와 시각 칸은 값이 없거나 읽을 수 없으면 크기로 견줄 수 없다. "-"는 0이 아니라
 * "모르는 값"이다. 글자 칸에서는 "-"도 그대로 견줄 수 있는 글자라 예외로 두지 않는다.
 */
function isUnknownValue(kind: SortKind, value: string): boolean {
  if (kind === "text" || kind === "natural") return false;
  if (!value || value === NO_VALUE) return true;
  if (kind === "number") return Number.isNaN(Number(value));
  if (kind === "ip") return false;
  return Number.isNaN(Date.parse(value));
}

/** 10.0.0.9가 10.0.0.10보다 앞에 오도록 octet을 하나씩 숫자로 견준다. */
function compareIps(left: string, right: string): number {
  const leftOctets = left.split(".");
  const rightOctets = right.split(".");
  for (let index = 0; index < 4; index += 1) {
    const order = Number(leftOctets[index] ?? 0) - Number(rightOctets[index] ?? 0);
    if (order) return order;
  }
  return 0;
}

function compareByKind(kind: SortKind, left: string, right: string): number {
  if (kind === "number") return Number(left) - Number(right);
  if (kind === "ip") return compareIps(left, right);
  if (kind === "natural") return left.localeCompare(right, undefined, { numeric: true });
  if (kind === "text") return left.localeCompare(right);
  // age는 시각이 최신일수록 나이가 어리다. 오름차순을 "어린 것부터"로 읽히게 뒤집는다.
  const order = Date.parse(left) - Date.parse(right);
  return kind === "age" ? -order : order;
}

/**
 * 모르는 값은 방향과 상관없이 늘 맨 뒤로 보내 정상 값들 사이에 끼지 않게 한다.
 * 원본 배열은 건드리지 않는다. 필터와 조회 결과를 그대로 두어야 정렬을 풀 수 있다.
 */
function sortRows<T>(rows: T[], spec: SortSpec<T>, state: SortState | null): T[] {
  const column = state ? spec.columns[state.key] : undefined;
  if (!state || !column) return rows;
  const direction = state.direction;
  return [...rows].sort((a, b) => {
    const left = column.value(a);
    const right = column.value(b);
    const leftUnknown = isUnknownValue(column.kind, left);
    const rightUnknown = isUnknownValue(column.kind, right);
    if (leftUnknown || rightUnknown) {
      if (leftUnknown && rightUnknown) return spec.tiebreak(a).localeCompare(spec.tiebreak(b));
      return leftUnknown ? 1 : -1;
    }
    const order =
      compareByKind(column.kind, left, right) || spec.tiebreak(a).localeCompare(spec.tiebreak(b));
    return direction === "asc" ? order : -order;
  });
}

interface SortController<T> {
  /** 그리기 직전에 불러 정렬된 사본을 받는다. */
  apply(rows: T[]): T[];
  /** 헤더의 화살표와 aria-sort를 지금 상태에 맞춘다. */
  refreshIndicators(): void;
  /** 헤더에 마우스와 키보드 처리를 붙인다. 시작할 때 한 번만 부른다. */
  register(): void;
}

/**
 * 표마다 정렬 상태와 헤더 처리를 되풀이하게 되므로 한 곳에 묶는다. render는 정렬이
 * 바뀔 때 그 표를 다시 그리는 함수다. 상태를 controller 안에 가둬 두어 표끼리 서로의
 * 정렬을 건드릴 수 없게 한다.
 */
function createSortController<T>(
  tableId: string,
  spec: SortSpec<T>,
  render: () => void
): SortController<T> {
  // 정렬을 고르기 전에는 kubectl이 준 순서를 그대로 둔다.
  let state: SortState | null = null;
  return {
    apply: (rows) => sortRows(rows, spec, state),
    refreshIndicators: () => renderSortIndicators(tableId, state),
    register: () =>
      registerSortHeaders(tableId, (key) => {
        state = { key, direction: nextDirection(state, key) };
        render();
      }),
  };
}

/**
 * 노드 필터는 하나만 켜지는 라디오다. karpenter와 managed는 노드를 만든 주체를,
 * spot과 on-demand는 그 노드를 산 방식을 가른다. 두 축이 섞이지 않게 버튼을
 * 하나씩 두고, 교집합(Karpenter의 spot 노드)은 Capacity 칼럼으로 정렬해서 본다.
 *
 * 순수 함수로 떼어 둔 이유는 표시 상태를 들고 있는 renderer 없이 테스트에서
 * 규칙만 확인하기 위함이다.
 */
function nodeMatchesFilter(node: NodeInfo, filter: NodeFilterKind): boolean {
  if (filter === "karpenter") return node.isKarpenter;
  if (filter === "managed") return node.isManagedNodeGroup;
  if (filter === "spot") return node.capacityType === "spot";
  if (filter === "on-demand") return node.capacityType === "on-demand";
  if (filter === "cordoned") return node.unschedulable;
  return true;
}

const NODE_SORT: SortSpec<NodeInfo> = {
  columns: {
    name: { kind: "text", value: (node) => node.name },
    internalIp: { kind: "ip", value: (node) => node.internalIp },
    instanceType: { kind: "text", value: (node) => node.instanceType },
    capacityType: { kind: "text", value: (node) => node.capacityType },
    version: { kind: "natural", value: (node) => node.version },
    status: { kind: "text", value: (node) => node.status },
    age: { kind: "age", value: (node) => node.creationTimestamp },
    group: { kind: "text", value: (node) => node.group },
  },
  tiebreak: (node) => node.name,
};

// 노드 탭의 파드 표와 Pods 탭의 파드 표는 같은 값을 보여주므로 규칙을 함께 쓴다.
// 노드 탭에 없는 Node 칸이 규칙에 남아 있어도 헤더가 없으면 쓰이지 않는다.
const POD_SORT: SortSpec<PodInfo> = {
  columns: {
    namespace: { kind: "text", value: (pod) => pod.namespace },
    name: { kind: "text", value: (pod) => pod.name },
    status: { kind: "text", value: (pod) => pod.status },
    ready: { kind: "natural", value: (pod) => pod.ready },
    nodeName: { kind: "text", value: (pod) => pod.nodeName },
    age: { kind: "age", value: (pod) => pod.creationTimestamp },
  },
  tiebreak: (pod) => `${pod.namespace}/${pod.name}`,
};

const KARPENTER_VERSION_SORT: SortSpec<KarpenterVersion> = {
  columns: {
    deployment: { kind: "text", value: (version) => version.deployment },
    version: { kind: "natural", value: (version) => version.version },
    image: { kind: "text", value: (version) => version.image },
  },
  tiebreak: (version) => version.deployment,
};

const KARPENTER_EVENT_SORT: SortSpec<EventInfo> = {
  columns: {
    timestamp: { kind: "time", value: (event) => event.timestamp },
    type: { kind: "text", value: (event) => event.type },
    reason: { kind: "text", value: (event) => event.reason },
    object: { kind: "text", value: (event) => event.object },
    count: { kind: "number", value: (event) => String(event.count) },
    message: { kind: "text", value: (event) => event.message },
  },
  tiebreak: (event) => `${event.timestamp} ${event.object} ${event.reason}`,
};

const NODEPOOL_SORT: SortSpec<NodePoolInfo> = {
  columns: {
    name: { kind: "text", value: (nodePool) => nodePool.name },
    nodeClassName: { kind: "text", value: (nodePool) => nodePool.nodeClassName || NO_VALUE },
    weight: { kind: "number", value: (nodePool) => nodePool.weight },
    nodes: { kind: "number", value: (nodePool) => nodePool.nodes },
    ready: { kind: "text", value: (nodePool) => nodePool.ready },
    age: { kind: "age", value: (nodePool) => nodePool.creationTimestamp },
  },
  tiebreak: (nodePool) => nodePool.name,
};

const EC2NODECLASS_SORT: SortSpec<Ec2NodeClassInfo> = {
  columns: {
    name: { kind: "text", value: (resource) => resource.name },
    ami: { kind: "text", value: (resource) => resource.ami },
  },
  tiebreak: (resource) => resource.name,
};

const nodeSort = createSortController("node-table", NODE_SORT, renderNodes);
const nodePodSort = createSortController("node-pod-table", POD_SORT, renderNodePods);
const podSort = createSortController("pod-table", POD_SORT, renderPods);
const karpenterVersionSort = createSortController(
  "karpenter-version-table",
  KARPENTER_VERSION_SORT,
  renderKarpenterVersions
);
const karpenterEventSort = createSortController(
  "karpenter-event-table",
  KARPENTER_EVENT_SORT,
  renderKarpenterEvents
);
const nodePoolSort = createSortController("nodepool-table", NODEPOOL_SORT, renderNodePools);
const ec2NodeClassSort = createSortController(
  "ec2nodeclass-table",
  EC2NODECLASS_SORT,
  renderEc2NodeClasses
);

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

/**
 * spot 노드는 AWS가 언제든 회수할 수 있어, 노드를 비우는 순서를 정할 때
 * on-demand와 다르게 다뤄야 한다. 그 구분을 색으로도 읽히게 한다. 모르는
 * 표기에는 색을 주지 않는다.
 */
function capacityClass(capacityType: string): string {
  if (capacityType === "spot") return "capacity-spot";
  if (capacityType === "on-demand") return "capacity-ondemand";
  return "";
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

/**
 * 이름 칸. 이름을 누르면 describe가 열리고, 옆의 버튼으로 이름만 복사한다.
 * 이름은 kubectl 명령에 그대로 붙여 쓰는 값이라 노드와 파드 모두 복사가 필요하다.
 */
function appendNameCell(row: HTMLTableRowElement, name: string, open: () => void): void {
  const cell = row.insertCell();
  cell.className = "name-cell";
  const box = document.createElement("div");
  box.className = "name-box";
  cell.appendChild(box);

  const nameButton = document.createElement("button");
  nameButton.className = "name-button";
  nameButton.textContent = name;
  nameButton.title = `${name} describe 보기`;
  // 행 클릭은 노드 선택(파드 조회)이다. 이름을 눌렀을 때 함께 돌지 않게 막는다.
  nameButton.addEventListener("click", (event) => {
    event.stopPropagation();
    open();
  });
  box.appendChild(nameButton);

  const copyButton = document.createElement("button");
  copyButton.className = "copy-button";
  copyButton.textContent = "복사";
  copyButton.title = `${name} 복사`;
  copyButton.addEventListener("click", (event) => {
    event.stopPropagation();
    void copyToClipboard(name, copyButton);
  });
  box.appendChild(copyButton);
}

/**
 * 사이드 패널이 보고 있는 대상. 새로고침 버튼이 같은 대상을 다시 읽는 데 쓴다.
 * 노드는 cluster scope라 namespace가 빈 문자열이다.
 */
let detailTarget: { kind: "pod" | "node"; namespace: string; name: string } | null = null;

/** 패널을 연 버튼. 닫을 때 그 자리로 focus를 되돌려 표에서 이어서 볼 수 있게 한다. */
let detailOpener: HTMLElement | null = null;

function closePodDetail(): void {
  detailTarget = null;
  $("#pod-detail-panel").classList.add("hidden");
  detailOpener?.focus();
  detailOpener = null;
}

function isSameTarget(kind: string, namespace: string, name: string): boolean {
  return (
    detailTarget?.kind === kind &&
    detailTarget.namespace === namespace &&
    detailTarget.name === name
  );
}

/**
 * describe는 한 번에 수십 줄이 나오고 클러스터가 멀면 몇 초가 걸린다.
 * 여는 즉시 대상과 조회 중임을 적어 두어 빈 화면을 보여주지 않는다.
 */
async function openDetail(kind: "pod" | "node", namespace: string, name: string): Promise<void> {
  detailTarget = { kind, namespace, name };
  $("#pod-detail-panel").classList.remove("hidden");
  // 표에 focus가 남아 있으면 키보드만 쓰는 경우 열린 패널에 닿을 수 없다.
  // 패널 안의 새로고침으로 다시 읽을 때는 이미 패널에 있으므로 focus를 건드리지 않는다.
  const active = document.activeElement as HTMLElement | null;
  if (active?.classList.contains("name-button")) {
    detailOpener = active;
    ($("#close-pod-detail") as HTMLButtonElement).focus();
  }
  $("#pod-detail-title").textContent = kind === "pod" ? `${namespace} / ${name}` : `node / ${name}`;
  const body = $("#pod-detail-body");
  body.className = "";
  body.textContent = "조회 중...";

  try {
    const text = kind === "pod" ? await api.describePod(namespace, name) : await api.describeNode(name);
    // 조회하는 동안 다른 대상을 눌렀으면 늦게 온 결과가 화면을 덮지 않게 버린다.
    if (!isSameTarget(kind, namespace, name)) return;
    body.textContent = "";
    appendErrorHighlighted(body, text);
  } catch (error) {
    if (!isSameTarget(kind, namespace, name)) return;
    // 상단 배너로 보내면 패널을 보는 동안 눈에 들어오지 않아 패널 안에 적는다.
    body.className = "detail-error";
    body.textContent = String(error instanceof Error ? error.message : error);
  }
}

function matchesFilter(node: NodeInfo): boolean {
  return nodeMatchesFilter(node, nodeFilter);
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
  nodeSort.refreshIndicators();
  const nodes = nodeSort.apply(allNodes.filter(matchesFilter));
  $("#node-empty").classList.toggle("hidden", nodes.length > 0);

  for (const node of nodes) {
    const row = tbody.insertRow();
    row.dataset.name = node.name;
    if (node.name === selectedNode) row.classList.add("selected");
    appendNameCell(row, node.name, () => void openDetail("node", "", node.name));
    appendCell(row, node.internalIp);
    appendCell(row, node.instanceType);
    appendCell(row, node.capacityType, capacityClass(node.capacityType));
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
    nodePods = await api.getPods(nodeName);
    renderNodePods();
  } catch (error) {
    showError(String(error));
  }
}

function renderNodePods(): void {
  const tbody = $("#node-pod-table tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";
  nodePodSort.refreshIndicators();
  for (const pod of nodePodSort.apply(nodePods)) {
    const row = tbody.insertRow();
    appendCell(row, pod.namespace);
    appendNameCell(row, pod.name, () => void openDetail("pod", pod.namespace, pod.name));
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
 * 어느 칼럼으로 어느 방향인지 헤더에 남긴다. 화살표와 색은 눈으로만 읽히므로
 * 같은 내용을 aria-sort로도 적어 스크린리더가 정렬 상태를 말할 수 있게 한다.
 */
function renderSortIndicators(tableId: string, sort: SortState | null): void {
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
function nextDirection(current: SortState | null, key: string): SortDirection {
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

function renderPods(): void {
  const namespace = ($("#namespace-filter") as HTMLSelectElement).value;
  const search = ($("#pod-search") as HTMLInputElement).value.trim().toLowerCase();
  const tbody = $("#pod-table tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";
  podSort.refreshIndicators();

  const pods = podSort.apply(
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
    appendNameCell(row, pod.name, () => void openDetail("pod", pod.namespace, pod.name));
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

function renderKarpenterEvents(): void {
  const tbody = $("#karpenter-event-table tbody") as HTMLTableSectionElement;
  tbody.innerHTML = "";
  karpenterEventSort.refreshIndicators();
  $("#karpenter-event-empty").classList.toggle("hidden", allKarpenterEvents.length > 0);

  // reason과 message에 섞여 있는 error를 눈으로 먼저 찾도록 그 낱말만 빨갛게 칠한다.
  for (const event of karpenterEventSort.apply(allKarpenterEvents)) {
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

function renderKarpenterVersions(): void {
  const tbody = prepareResourceTable(
    "karpenter-version",
    allKarpenterVersions.length,
    karpenterVersionsError
  );
  karpenterVersionSort.refreshIndicators();
  for (const version of karpenterVersionSort.apply(allKarpenterVersions)) {
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
    allKarpenterVersions = versions.versions;
    karpenterVersionsError = versions.error;
    allKarpenterEvents = events;
    renderKarpenterVersions();
    renderKarpenterEvents();
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

function renderNodePools(): void {
  const nodePools = nodePoolSort.apply(allNodePools);
  const tbody = prepareResourceTable("nodepool", nodePools.length, nodePoolsError);
  nodePoolSort.refreshIndicators();
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

function renderEc2NodeClasses(): void {
  const tbody = prepareResourceTable(
    "ec2nodeclass",
    allEc2NodeClasses.length,
    ec2NodeClassesError
  );
  ec2NodeClassSort.refreshIndicators();
  for (const resource of ec2NodeClassSort.apply(allEc2NodeClasses)) {
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
    allEc2NodeClasses = result.ec2NodeClasses;
    ec2NodeClassesError = result.ec2NodeClassesError;
    renderNodePools();
    renderEc2NodeClasses();
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
  // Pods 탭 토글도 모양을 맞추려고 filter-button을 함께 쓴다. 노드 필터는 하나만
  // 켜지는 라디오라 나머지의 active를 지우므로, data-filter가 있는 버튼으로 좁히지
  // 않으면 파드 토글을 누를 때 노드 필터가 전체로 되돌아간다.
  const nodeFilterButtons = document.querySelectorAll(".filter-button[data-filter]");
  nodeFilterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      nodeFilter = ((button as HTMLElement).dataset.filter ?? "all") as NodeFilterKind;
      nodeFilterButtons.forEach((b) => b.classList.remove("active"));
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
  for (const sort of [
    nodeSort,
    nodePodSort,
    podSort,
    karpenterVersionSort,
    karpenterEventSort,
    nodePoolSort,
    ec2NodeClassSort,
  ]) {
    sort.register();
  }
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
    if (detailTarget) void openDetail(detailTarget.kind, detailTarget.namespace, detailTarget.name);
  });
  $("#copy-pod-detail").addEventListener("click", () => {
    const button = $("#copy-pod-detail") as HTMLButtonElement;
    void copyToClipboard($("#pod-detail-body").textContent ?? "", button);
  });
  // 패널을 닫는 데 마우스를 쓰지 않아도 되게 Escape를 받는다.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && detailTarget) closePodDetail();
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
