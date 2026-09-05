import {
  aiRuntimeDirectory,
  aiSendRpc,
  aiStartServer,
  aiStopServer,
  isDesktopRuntime,
  onAiServerMessage,
  onAiServerState,
} from "./bridge";
import type {
  AiConnection,
  AiMessage,
  AiSettings,
  AiTurnInput,
} from "./types";

interface RpcResponse {
  id?: number;
  method?: string;
  result?: unknown;
  error?: { message?: string };
  params?: Record<string, unknown>;
}

interface PendingRpc {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: number;
}

interface PendingTurn {
  threadId: string;
  turnId: string;
  text: string;
  error: string;
  stopped: boolean;
  itemPhases: Map<string, string>;
  itemTexts: Map<string, string>;
  onDelta: (text: string) => void;
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: number;
}

const DEVELOPER_INSTRUCTIONS = [
  "You are embedded in akbun-pdf, a desktop PDF reader.",
  "Do not run shell commands, inspect files, browse the web, modify files, call tools, or delegate work.",
  "The client provides extracted text and rendered page images as the only document context.",
  "Summarize only what those inputs support and cite PDF page numbers, not source file paths.",
  "Return plain text or Markdown suitable for a chat panel.",
].join(" ");

export class CodexClient {
  private pendingRpc = new Map<number, PendingRpc>();
  private nextRpcId = 1;
  private listenersReady: Promise<unknown> | null = null;
  private connectionPromise: Promise<AiConnection> | null = null;
  private connection: AiConnection = {
    state: "checking",
    label: "Codex 확인 중",
    detail: "Codex CLI와 ChatGPT 인증을 확인하고 있습니다.",
    version: "",
  };
  private threadId = "";
  private threadConversationId = "";
  private pendingTurn: PendingTurn | null = null;
  private isolatedConfig: Promise<Record<string, unknown>> | null = null;

  constructor(private onConnection: (connection: AiConnection) => void) {}

  currentConnection(): AiConnection {
    return this.connection;
  }

  async connect(force = false): Promise<AiConnection> {
    if (!isDesktopRuntime()) {
      return this.setConnection({
        state: "unavailable",
        label: "데스크톱 앱 필요",
        detail: "Codex 연결은 데스크톱 앱에서 사용할 수 있습니다.",
        version: "",
      });
    }
    if (this.connectionPromise && !force) return this.connectionPromise;
    if (force) {
      this.rejectAll(new Error("Codex 연결을 새로고침했습니다."), false);
      await aiStopServer();
      this.connectionPromise = null;
      this.threadId = "";
      this.threadConversationId = "";
      this.isolatedConfig = null;
    }
    this.connectionPromise = this.openConnection().catch((error) => {
      this.connectionPromise = null;
      return this.setConnection({
        state: "unavailable",
        label: connectionErrorLabel(error),
        detail: cleanError(error),
        version: "",
      });
    });
    return this.connectionPromise;
  }

  resetThread(): void {
    this.threadId = "";
    this.threadConversationId = "";
  }

  async runTurn(
    conversationId: string,
    settings: AiSettings,
    history: AiMessage[],
    input: AiTurnInput[],
    onDelta: (text: string) => void,
  ): Promise<string> {
    if (this.pendingTurn) throw new Error("이미 AI 응답을 생성하고 있습니다.");
    const threadId = await this.ensureThread(conversationId, settings, history);
    const runtime = await aiRuntimeDirectory();
    return new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (!this.pendingTurn) return;
        this.pendingTurn = null;
        reject(new Error("AI 응답 시간이 15분을 초과했습니다."));
      }, 15 * 60 * 1000);
      this.pendingTurn = {
        threadId,
        turnId: "",
        text: "",
        error: "",
        stopped: false,
        itemPhases: new Map(),
        itemTexts: new Map(),
        onDelta,
        resolve,
        reject,
        timer,
      };
      void this.rpc("turn/start", {
        threadId,
        input,
        cwd: runtime,
        approvalPolicy: "never",
        sandboxPolicy: {
          type: "workspaceWrite",
          writableRoots: [runtime],
          networkAccess: false,
        },
        model: settings.model,
        effort: settings.effort,
        summary: "concise",
      }, 60_000).then((result) => {
        const turn = (result as { turn?: { id?: string } })?.turn;
        const pending = this.pendingTurn;
        if (!pending) return;
        const shouldInterrupt = pending.stopped && !pending.turnId && Boolean(turn?.id);
        pending.turnId = turn?.id ?? pending.turnId;
        if (shouldInterrupt) {
          void this.rpc("turn/interrupt", {
            threadId: pending.threadId,
            turnId: pending.turnId,
          });
        }
      }).catch((error) => this.failTurn(error));
    });
  }

  async stopTurn(): Promise<void> {
    const pending = this.pendingTurn;
    if (!pending) return;
    pending.stopped = true;
    if (pending.turnId) {
      await this.rpc("turn/interrupt", {
        threadId: pending.threadId,
        turnId: pending.turnId,
      });
    }
  }

  private async openConnection(): Promise<AiConnection> {
    this.setConnection({
      state: "checking",
      label: "Codex 확인 중",
      detail: "Codex CLI와 ChatGPT 인증을 확인하고 있습니다.",
      version: "",
    });
    await this.installListeners();
    const server = await aiStartServer();
    await this.rpc("initialize", {
      clientInfo: { name: "akbun_pdf", title: "akbun-pdf", version: "0.4.0" },
      capabilities: { experimentalApi: true },
    });
    await this.notify("initialized", {});
    const [accountResult] = await Promise.all([
      this.rpc("account/read", { refreshToken: false }),
      this.rpc("model/list", { limit: 20, includeHidden: false }),
    ]);
    const account = (accountResult as { account?: { type?: string; planType?: string } })?.account;
    if (account?.type !== "chatgpt") {
      const apiKey = account?.type === "apiKey" || account?.type === "apikey";
      return this.setConnection({
        state: "unavailable",
        label: apiKey ? "API key 인증은 지원하지 않음" : "ChatGPT 로그인 필요",
        detail: apiKey
          ? "Codex CLI에서 ChatGPT 계정으로 로그인해 주세요."
          : "codex login으로 ChatGPT 계정에 로그인해 주세요.",
        version: server.version,
      });
    }
    const plan = account.planType ? ` · ChatGPT ${account.planType}` : "";
    return this.setConnection({
      state: "available",
      label: `연결됨${plan}`,
      detail: `${server.version}의 ChatGPT 인증을 사용합니다.`,
      version: server.version,
    });
  }

  private async ensureThread(
    conversationId: string,
    settings: AiSettings,
    history: AiMessage[],
  ): Promise<string> {
    const connection = await this.connect();
    if (connection.state !== "available") throw new Error(connection.label);
    if (this.threadId && this.threadConversationId === conversationId) return this.threadId;
    const runtime = await aiRuntimeDirectory();
    const config = await this.readIsolatedConfig(runtime);
    const result = await this.rpc("thread/start", {
      model: settings.model,
      cwd: runtime,
      approvalPolicy: "never",
      sandbox: "workspace-write",
      personality: "friendly",
      serviceName: "akbun_pdf",
      baseInstructions: baseInstructions(settings.systemPrompt),
      developerInstructions: DEVELOPER_INSTRUCTIONS,
      ephemeral: true,
      config,
    });
    const threadId = (result as { thread?: { id?: string } })?.thread?.id;
    if (!threadId) throw new Error("Codex가 대화를 만들지 못했습니다.");
    this.threadId = threadId;
    this.threadConversationId = conversationId;
    const items = historyItems(history);
    if (items.length > 0) {
      await this.rpc("thread/inject_items", { threadId, items });
    }
    return threadId;
  }

  private readIsolatedConfig(runtime: string): Promise<Record<string, unknown>> {
    if (this.isolatedConfig) return this.isolatedConfig;
    this.isolatedConfig = this.rpc("config/read", { cwd: runtime, includeLayers: false })
      .then((result) => {
        const config = (result as { config?: { mcp_servers?: Record<string, unknown> } })?.config;
        const servers = Object.keys(config?.mcp_servers ?? {});
        return {
          web_search: "disabled",
          project_doc_max_bytes: 0,
          include_apps_instructions: false,
          include_collaboration_mode_instructions: false,
          include_permissions_instructions: false,
          features: {
            apps: false,
            plugins: false,
            multi_agent: false,
            memories: false,
            hooks: false,
            goals: false,
            shell_tool: false,
            unified_exec: false,
          },
          tools: { view_image: false },
          memories: { generate_memories: false, use_memories: false },
          mcp_servers: Object.fromEntries(servers.map((name) => [name, { enabled: false }])),
        };
      });
    return this.isolatedConfig;
  }

  private installListeners(): Promise<unknown> {
    if (!this.listenersReady) {
      this.listenersReady = Promise.all([
        onAiServerMessage((message) => this.handleMessage(message)),
        onAiServerState(() => {
          this.rejectAll(new Error("Codex App Server가 종료됐습니다."));
          this.connectionPromise = null;
          this.setConnection({
            state: "unavailable",
            label: "Codex 연결 끊김",
            detail: "연결 상태를 새로고침해 주세요.",
            version: "",
          });
        }),
      ]);
    }
    return this.listenersReady;
  }

  private handleMessage(value: unknown): void {
    if (!value || typeof value !== "object") return;
    const message = value as RpcResponse;
    if (message.id !== undefined && !message.method) {
      const pending = this.pendingRpc.get(message.id);
      if (!pending) return;
      window.clearTimeout(pending.timer);
      this.pendingRpc.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message ?? "Codex 요청 실패"));
      else pending.resolve(message.result);
      return;
    }
    if (message.id !== undefined && message.method) {
      void aiSendRpc({
        id: message.id,
        error: { code: -32601, message: "This client does not support server requests." },
      });
      return;
    }
    this.handleNotification(message.method ?? "", message.params ?? {});
  }

  private handleNotification(method: string, params: Record<string, unknown>): void {
    const pending = this.pendingTurn;
    if (!pending) return;
    if (params.threadId && params.threadId !== pending.threadId) return;
    const turn = params.turn as { id?: string; status?: string; error?: { message?: string } } | undefined;
    const item = params.item as { id?: string; type?: string; phase?: string; text?: string } | undefined;
    if (method === "turn/started" && turn?.id) {
      pending.turnId = turn.id;
      if (pending.stopped) {
        void this.rpc("turn/interrupt", {
          threadId: pending.threadId,
          turnId: pending.turnId,
        });
      }
    }
    if (method === "item/started" && item?.type === "agentMessage" && item.id) {
      pending.itemPhases.set(item.id, item.phase ?? "final_answer");
    }
    if (method === "item/agentMessage/delta") this.appendDelta(params);
    if (method === "item/completed" && item?.type === "agentMessage" && item.id) {
      pending.itemPhases.set(item.id, item.phase ?? "final_answer");
      if (!item.phase || item.phase === "final_answer") {
        pending.text = item.text ?? pending.itemTexts.get(item.id) ?? pending.text;
        pending.onDelta(pending.text);
      }
    }
    if (method === "error") {
      const error = params.error as { message?: string } | undefined;
      pending.error = error?.message ?? "AI 요청 실패";
    }
    if (method === "turn/completed" && turn) this.completeTurn(turn);
  }

  private appendDelta(params: Record<string, unknown>): void {
    const pending = this.pendingTurn;
    if (!pending) return;
    const itemId = typeof params.itemId === "string" ? params.itemId : "agent";
    const delta = typeof params.delta === "string" ? params.delta : "";
    const text = (pending.itemTexts.get(itemId) ?? "") + delta;
    pending.itemTexts.set(itemId, text);
    if (pending.itemPhases.get(itemId) === "commentary") return;
    pending.text = text;
    pending.onDelta(text);
  }

  private completeTurn(turn: { id?: string; status?: string; error?: { message?: string } }): void {
    const pending = this.pendingTurn;
    if (!pending || (pending.turnId && turn.id && pending.turnId !== turn.id)) return;
    window.clearTimeout(pending.timer);
    this.pendingTurn = null;
    if (pending.stopped || turn.status === "interrupted") {
      pending.reject(new Error("AI 응답을 중지했습니다."));
    } else if (pending.error || turn.status === "failed") {
      pending.reject(new Error(pending.error || turn.error?.message || "AI 요청 실패"));
    } else {
      pending.resolve(pending.text || "응답 내용이 없습니다.");
    }
  }

  private failTurn(error: unknown): void {
    const pending = this.pendingTurn;
    if (!pending) return;
    window.clearTimeout(pending.timer);
    this.pendingTurn = null;
    pending.reject(error instanceof Error ? error : new Error(String(error)));
  }

  private rpc(method: string, params: Record<string, unknown>, timeoutMs = 30_000): Promise<unknown> {
    const id = this.nextRpcId;
    this.nextRpcId += 1;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pendingRpc.delete(id);
        reject(new Error(`${method} 요청 시간이 초과됐습니다.`));
      }, timeoutMs);
      this.pendingRpc.set(id, { resolve, reject, timer });
      void aiSendRpc({ method, id, params }).catch((error) => {
        window.clearTimeout(timer);
        this.pendingRpc.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private notify(method: string, params: Record<string, unknown>): Promise<void> {
    return aiSendRpc({ method, params });
  }

  private rejectAll(error: Error, stopServer = true): void {
    for (const pending of this.pendingRpc.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pendingRpc.clear();
    this.failTurn(error);
    if (stopServer) void aiStopServer();
  }

  private setConnection(connection: AiConnection): AiConnection {
    this.connection = connection;
    this.onConnection(connection);
    return connection;
  }
}

function baseInstructions(systemPrompt: string): string {
  return [
    "You are the AI assistant inside akbun-pdf.",
    "The user explicitly approves which PDF pages are sent before every summary.",
    "Treat page numbers, extracted text, and attached page images as the complete document context.",
    "Apply the user-configured system prompt below to every response.",
    `<USER_SYSTEM_PROMPT>${systemPrompt.slice(0, 20_000)}</USER_SYSTEM_PROMPT>`,
  ].join("\n");
}

function historyItems(messages: AiMessage[]): unknown[] {
  let remaining = 300_000;
  const selected: AiMessage[] = [];
  for (const message of [...messages].reverse()) {
    if (message.text.length > remaining) break;
    selected.push(message);
    remaining -= message.text.length;
  }
  return selected.reverse().map((message) => ({
    type: "message",
    role: message.role,
    content: [{
      type: message.role === "user" ? "input_text" : "output_text",
      text: message.text,
    }],
  }));
}

function connectionErrorLabel(error: unknown): string {
  const text = String(error);
  if (text.includes("codex_cli_not_found")) return "Codex CLI를 찾을 수 없음";
  return "Codex 연결 실패";
}

function cleanError(error: unknown): string {
  return String(error).replace(/^Error:\s*/, "").replace(/^[a-z_]+:\s*/i, "");
}
