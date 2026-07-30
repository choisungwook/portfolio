interface AwsProfile {
  name: string;
  region: string;
  roleArn: string;
  sourceProfile: string;
  ssoSession: string;
  hasCredentials: boolean;
}

interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

interface Api {
  listProfiles(): Promise<AwsProfile[]>;
  runCommand(command: string, profile: string): Promise<RunResult>;
}

declare const api: Api;

let selectedProfile = "";
let running = false;

function element<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** profile을 고르기 전이거나 실행 중이면 실행 버튼을 잠근다. */
function syncRunButton(): void {
  const button = element<HTMLButtonElement>("run-button");
  button.disabled = running || selectedProfile === "";
  button.textContent = running ? "실행 중…" : "실행";
}

function showSelectedProfile(): void {
  const badge = element<HTMLSpanElement>("selected-profile");
  if (selectedProfile === "") {
    badge.textContent = "profile을 고른다";
    badge.classList.remove("chosen");
    return;
  }
  badge.textContent = selectedProfile;
  badge.classList.add("chosen");
}

/** role_arn이 있으면 role 기반 profile임을 목록에서 바로 알 수 있게 보여준다. */
function profileDetailText(profile: AwsProfile): string {
  const parts: string[] = [];
  if (profile.roleArn !== "") parts.push(profile.roleArn);
  if (profile.ssoSession !== "") parts.push(`sso: ${profile.ssoSession}`);
  if (profile.region !== "") parts.push(profile.region);
  if (parts.length === 0 && profile.hasCredentials) parts.push("access key");
  return parts.join(" · ");
}

function renderProfiles(profiles: AwsProfile[]): void {
  const list = element<HTMLUListElement>("profile-list");
  const empty = element<HTMLParagraphElement>("profile-empty");
  list.textContent = "";
  empty.classList.toggle("hidden", profiles.length > 0);

  for (const profile of profiles) {
    const item = document.createElement("li");
    item.className = "profile-item";
    item.classList.toggle("active", profile.name === selectedProfile);

    const name = document.createElement("div");
    name.className = "profile-name";
    name.textContent = profile.name;
    item.appendChild(name);

    const detail = profileDetailText(profile);
    if (detail !== "") {
      const detailElement = document.createElement("div");
      detailElement.className = "profile-detail";
      detailElement.textContent = detail;
      item.appendChild(detailElement);
    }

    item.addEventListener("click", () => {
      selectedProfile = profile.name;
      showSelectedProfile();
      syncRunButton();
      for (const other of list.querySelectorAll(".profile-item")) {
        other.classList.toggle("active", other === item);
      }
    });
    list.appendChild(item);
  }
}

async function refreshProfiles(): Promise<void> {
  const profiles = await api.listProfiles();
  // 목록에서 사라진 profile을 계속 골라 둔 상태로 두지 않는다.
  if (!profiles.some((p) => p.name === selectedProfile)) {
    selectedProfile = "";
    showSelectedProfile();
    syncRunButton();
  }
  renderProfiles(profiles);
}

function showResult(result: RunResult): void {
  element<HTMLParagraphElement>("result-placeholder").classList.add("hidden");

  const meta = element<HTMLDivElement>("result-meta");
  meta.classList.remove("hidden");
  const status = element<HTMLSpanElement>("result-status");
  status.textContent = result.exitCode === 0 ? "성공 (exit 0)" : `실패 (exit ${result.exitCode})`;
  status.className = `result-status ${result.exitCode === 0 ? "success" : "failure"}`;
  element<HTMLSpanElement>("result-duration").textContent = `${result.durationMs}ms`;

  const stdoutBlock = element<HTMLDivElement>("stdout-block");
  stdoutBlock.classList.toggle("hidden", result.stdout === "");
  element<HTMLPreElement>("stdout-output").textContent = result.stdout;

  const stderrBlock = element<HTMLDivElement>("stderr-block");
  stderrBlock.classList.toggle("hidden", result.stderr === "");
  element<HTMLPreElement>("stderr-output").textContent = result.stderr;

  // 성공했는데 출력이 없는 명령어(예: aws s3 rm)도 결과가 비어 보이지 않게 한다.
  if (result.stdout === "" && result.stderr === "") {
    stdoutBlock.classList.remove("hidden");
    element<HTMLPreElement>("stdout-output").textContent = "(출력 없음)";
  }
}

/** IPC 검증 에러 등 실행 자체가 실패한 경우를 stderr 형태로 보여준다. */
function showError(message: string): void {
  showResult({ stdout: "", stderr: message, exitCode: -1, durationMs: 0 });
}

async function runCommand(): Promise<void> {
  if (running || selectedProfile === "") return;
  const command = element<HTMLTextAreaElement>("command-input").value;

  running = true;
  syncRunButton();
  try {
    showResult(await api.runCommand(command, selectedProfile));
  } catch (error) {
    showError(String(error));
  } finally {
    running = false;
    syncRunButton();
  }
}

function init(): void {
  element<HTMLButtonElement>("refresh-profiles").addEventListener("click", () => {
    void refreshProfiles();
  });
  element<HTMLButtonElement>("run-button").addEventListener("click", () => {
    void runCommand();
  });
  element<HTMLTextAreaElement>("command-input").addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void runCommand();
    }
  });
  syncRunButton();
  void refreshProfiles();
}

init();
