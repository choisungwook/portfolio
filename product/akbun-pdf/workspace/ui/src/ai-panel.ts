import {
  aiAppendMessage,
  aiClearRequest,
  aiCreateConversation,
  aiDeleteConversation,
  aiListConversations,
  aiLoadConversation,
  aiLoadSettings,
  aiRenameConversation,
  aiSavePageImage,
  aiSaveSettings,
} from "./bridge";
import { CodexClient } from "./ai-rpc";
import {
  applyPageSelection,
  formatPageSelection,
  parsePageRange,
} from "./ai-selection";
import { AI_MODELS, defaultAiSettings, SUMMARY_SYSTEM_PROMPT } from "./ai-settings";
import type {
  AiConnection,
  AiConversation,
  AiConversationMeta,
  AiMessage,
  AiModel,
  AiSettings,
  AiTurnInput,
  DocumentState,
  SummaryPageInput,
} from "./types";
import type { PdfViewer } from "./viewer";

const SUMMARY_BATCH_SIZE = 6;

export class AiPanel {
  private state: DocumentState;
  private settings: AiSettings = defaultAiSettings();
  private conversations: AiConversationMeta[] = [];
  private currentConversation: AiConversation | null = null;
  private selectedPages = new Set<number>();
  private selectionAnchor = 0;
  private selectionMode = false;
  private busy = false;
  private stopRequested = false;
  private streamingText = "";
  private thumbnailGeneration = 0;
  private client = new CodexClient((connection) => this.renderConnection(connection));

  constructor(
    initialState: DocumentState,
    private viewer: PdfViewer,
  ) {
    this.state = initialState;
  }

  async init(): Promise<void> {
    this.settings = await aiLoadSettings();
    await this.loadConversationList();
    this.fillSettingsFields();
    this.renderMessages();
    this.updateDocument(this.state);
    this.wireEvents();
  }

  updateDocument(state: DocumentState): void {
    this.state = state;
    document.querySelectorAll<HTMLButtonElement>("[data-summary-control]").forEach((button) => {
      button.disabled = state.phase !== "ready" || this.busy;
    });
  }

  private wireEvents(): void {
    document.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const action = target.closest<HTMLElement>("[data-ai-action]")?.dataset.aiAction;
      if (action) void this.handleAction(action);
      const scope = target.closest<HTMLElement>("[data-ai-scope]")?.dataset.aiScope;
      if (scope) this.applyScope(scope);
      const page = Number(target.closest<HTMLElement>("[data-ai-page]")?.dataset.aiPage ?? 0);
      if (page) this.selectPage(page, event as MouseEvent);
      const openId = target.closest<HTMLElement>("[data-open-conversation]")?.dataset.openConversation;
      if (openId) void this.openConversation(openId);
      const renameId = target.closest<HTMLElement>("[data-rename-conversation]")?.dataset.renameConversation;
      if (renameId) void this.renameConversation(renameId);
      const deleteId = target.closest<HTMLElement>("[data-delete-conversation]")?.dataset.deleteConversation;
      if (deleteId) void this.deleteConversation(deleteId);
      const copyId = target.closest<HTMLElement>("[data-copy-ai-message]")?.dataset.copyAiMessage;
      if (copyId) void this.copyMessage(copyId);
    });
    element<HTMLFormElement>("[data-role='ai-composer']").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.sendChat();
    });
    element<HTMLFormElement>("[data-role='ai-settings-form']").addEventListener("submit", (event) => {
      event.preventDefault();
      void this.saveSettings();
    });
    element<HTMLInputElement>("[data-role='ai-page-range']").addEventListener("input", () => {
      const field = element<HTMLInputElement>("[data-role='ai-page-range']");
      const parsed = parsePageRange(field.value, this.state.pageCount);
      field.setAttribute("aria-invalid", String(!parsed));
      if (!parsed) {
        this.selectedPages.clear();
        this.renderPageSelection();
        this.markScope("direct");
        return;
      }
      this.selectedPages = new Set(parsed);
      this.selectionAnchor = parsed.at(-1) ?? 0;
      this.renderPageSelection();
      this.markScope("direct");
    });
    element<HTMLTextAreaElement>("[data-role='ai-input']").addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void this.sendChat();
      }
    });
  }

  private async handleAction(action: string): Promise<void> {
    if (action === "open") await this.showAi();
    if (action === "show-outline") this.showOutline();
    if (action === "settings") await this.openSettings();
    if (action === "close-settings") element<HTMLDialogElement>("[data-role='ai-settings-dialog']").close();
    if (action === "refresh") await this.client.connect(true);
    if (action === "use-summary-prompt") {
      element<HTMLTextAreaElement>("[data-role='ai-system-prompt']").value = SUMMARY_SYSTEM_PROMPT;
    }
    if (action === "conversations") await this.openConversations();
    if (action === "close-conversations") element<HTMLDialogElement>("[data-role='ai-conversations-dialog']").close();
    if (action === "new-conversation") this.newConversation();
    if (action === "select-pages") await this.openPageSelector();
    if (action === "close-pages") element<HTMLDialogElement>("[data-role='ai-pages-dialog']").close();
    if (action === "selection-mode") this.toggleSelectionMode();
    if (action === "confirm-pages") this.openSummaryConfirmation();
    if (action === "cancel-summary") element<HTMLDialogElement>("[data-role='ai-confirm-dialog']").close();
    if (action === "run-summary") await this.runSummary();
    if (action === "stop") await this.stop();
  }

  private async showAi(): Promise<void> {
    element<HTMLElement>("[data-role='outline-view']").hidden = true;
    element<HTMLElement>("[data-role='ai-panel']").hidden = false;
    document.body.classList.add("ai-panel-open");
    this.markContextTab("AI");
    await this.client.connect();
  }

  private showOutline(): void {
    element<HTMLElement>("[data-role='outline-view']").hidden = false;
    element<HTMLElement>("[data-role='ai-panel']").hidden = true;
    document.body.classList.remove("ai-panel-open");
    this.markContextTab("목차");
  }

  private markContextTab(label: string): void {
    document.querySelectorAll<HTMLButtonElement>(".context-tab").forEach((button) => {
      const active = button.textContent?.trim() === label;
      button.classList.toggle("context-tab--active", active);
      button.setAttribute("aria-selected", String(active));
    });
  }

  private async openSettings(): Promise<void> {
    this.fillSettingsFields();
    element<HTMLDialogElement>("[data-role='ai-settings-dialog']").showModal();
    await this.client.connect();
  }

  private fillSettingsFields(): void {
    const model = element<HTMLSelectElement>("[data-role='ai-model']");
    model.replaceChildren(...AI_MODELS.map((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.label;
      return option;
    }));
    model.value = this.settings.model;
    element<HTMLTextAreaElement>("[data-role='ai-system-prompt']").value = this.settings.systemPrompt;
  }

  private async saveSettings(): Promise<void> {
    const model = element<HTMLSelectElement>("[data-role='ai-model']").value as AiModel;
    const systemPrompt = element<HTMLTextAreaElement>("[data-role='ai-system-prompt']").value.trim();
    if (!systemPrompt) {
      element<HTMLTextAreaElement>("[data-role='ai-system-prompt']").focus();
      return;
    }
    this.settings = await aiSaveSettings({
      ...this.settings,
      model,
      systemPrompt,
    });
    this.client.resetThread();
    element<HTMLDialogElement>("[data-role='ai-settings-dialog']").close();
  }

  private renderConnection(connection: AiConnection): void {
    for (const prefix of ["ai-connection", "ai-settings-status"]) {
      const container = element<HTMLElement>(`[data-role='${prefix}']`);
      container.dataset.state = connection.state;
      element<HTMLElement>(`[data-role='${prefix}-label']`).textContent = connection.label;
      element<HTMLElement>(`[data-role='${prefix}-detail']`).textContent = connection.detail;
    }
  }

  private async loadConversationList(): Promise<void> {
    this.conversations = await aiListConversations();
    this.renderConversationList();
  }

  private async openConversations(): Promise<void> {
    await this.loadConversationList();
    element<HTMLDialogElement>("[data-role='ai-conversations-dialog']").showModal();
  }

  private renderConversationList(): void {
    const list = element<HTMLElement>("[data-role='ai-conversation-list']");
    if (this.conversations.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ai-conversation-empty";
      empty.textContent = "저장한 대화가 없습니다.";
      list.replaceChildren(empty);
      return;
    }
    list.replaceChildren(...this.conversations.map((conversation) => {
      const row = document.createElement("div");
      row.className = "ai-conversation-row";
      const open = document.createElement("button");
      open.className = "ai-conversation-open";
      open.type = "button";
      open.dataset.openConversation = conversation.id;
      const title = document.createElement("strong");
      title.textContent = conversation.title;
      const meta = document.createElement("span");
      meta.textContent = `${formatDate(conversation.updatedAt)} · ${conversation.messageCount}개 메시지`;
      open.append(title, meta);
      const rename = smallAction("이름 변경", "renameConversation", conversation.id);
      const remove = smallAction("삭제", "deleteConversation", conversation.id, true);
      row.append(open, rename, remove);
      return row;
    }));
  }

  private newConversation(): void {
    this.currentConversation = null;
    this.client.resetThread();
    this.streamingText = "";
    element<HTMLElement>("[data-role='ai-conversation-title']").textContent = "새 대화";
    element<HTMLElement>("[data-role='ai-conversation-meta']").textContent = "메시지를 보내면 JSONL로 저장됩니다.";
    element<HTMLTextAreaElement>("[data-role='ai-input']").value = "";
    this.renderMessages();
  }

  private async openConversation(id: string): Promise<void> {
    this.currentConversation = await aiLoadConversation(id);
    this.client.resetThread();
    this.streamingText = "";
    this.renderMessages();
    this.renderConversationHeader();
    element<HTMLDialogElement>("[data-role='ai-conversations-dialog']").close();
    await this.showAi();
  }

  private async renameConversation(id: string): Promise<void> {
    const current = this.conversations.find((item) => item.id === id);
    const title = window.prompt("대화 이름", current?.title ?? "새 대화")?.trim();
    if (!title) return;
    const meta = await aiRenameConversation(id, title);
    if (this.currentConversation?.meta.id === id) {
      this.currentConversation.meta = meta;
      this.renderConversationHeader();
    }
    await this.loadConversationList();
  }

  private async deleteConversation(id: string): Promise<void> {
    const current = this.conversations.find((item) => item.id === id);
    if (!window.confirm(`“${current?.title ?? "이 대화"}”를 삭제할까요?`)) return;
    await aiDeleteConversation(id);
    if (this.currentConversation?.meta.id === id) this.newConversation();
    await this.loadConversationList();
  }

  private renderConversationHeader(): void {
    const meta = this.currentConversation?.meta;
    element<HTMLElement>("[data-role='ai-conversation-title']").textContent = meta?.title ?? "새 대화";
    element<HTMLElement>("[data-role='ai-conversation-meta']").textContent = meta
      ? `${meta.messageCount}개 메시지 · ${formatDate(meta.updatedAt)}`
      : "메시지를 보내면 JSONL로 저장됩니다.";
  }

  private renderMessages(): void {
    const container = element<HTMLElement>("[data-role='ai-messages']");
    const messages = this.currentConversation?.messages ?? [];
    if (messages.length === 0 && !this.streamingText) {
      const empty = element<HTMLElement>("[data-role='ai-empty']").cloneNode(true);
      container.replaceChildren(empty);
      return;
    }
    const nodes = messages.map((message) => messageNode(message));
    if (this.busy) nodes.push(streamingNode(this.streamingText));
    container.replaceChildren(...nodes);
    container.scrollTop = container.scrollHeight;
  }

  private renderStreaming(text: string): void {
    this.streamingText = text;
    const body = document.querySelector<HTMLElement>("[data-streaming-message] .ai-message__body");
    if (body) body.textContent = text || "응답을 준비하고 있습니다…";
    else this.renderMessages();
    const container = element<HTMLElement>("[data-role='ai-messages']");
    container.scrollTop = container.scrollHeight;
  }

  private async sendChat(): Promise<void> {
    if (this.busy) return;
    const input = element<HTMLTextAreaElement>("[data-role='ai-input']");
    const text = input.value.trim();
    if (!text) return;
    await this.showAi();
    const conversation = await this.ensureConversation(text.slice(0, 42));
    const history = [...conversation.messages];
    const user = createMessage("user", text, []);
    await this.appendMessage(user);
    input.value = "";
    await this.generateResponse(
      history,
      [{ type: "text", text }],
      async () => undefined,
    );
  }

  private async openPageSelector(): Promise<void> {
    if (this.state.phase !== "ready") return;
    this.selectedPages = new Set([this.state.currentPage]);
    this.selectionAnchor = this.state.currentPage;
    this.selectionMode = false;
    const range = element<HTMLInputElement>("[data-role='ai-page-range']");
    range.value = String(this.state.currentPage);
    range.setAttribute("aria-invalid", "false");
    element<HTMLButtonElement>("[data-ai-action='selection-mode']").setAttribute("aria-pressed", "false");
    this.renderPageGrid();
    this.markScope("current");
    element<HTMLDialogElement>("[data-role='ai-pages-dialog']").showModal();
  }

  private renderPageGrid(): void {
    const generation = this.thumbnailGeneration + 1;
    this.thumbnailGeneration = generation;
    const grid = element<HTMLElement>("[data-role='ai-page-grid']");
    const cards = Array.from({ length: this.state.pageCount }, (_, index) => {
      const page = index + 1;
      const card = document.createElement("button");
      card.className = "ai-page-card";
      card.type = "button";
      card.dataset.aiPage = String(page);
      card.setAttribute("aria-selected", String(this.selectedPages.has(page)));
      const canvas = document.createElement("canvas");
      const label = document.createElement("span");
      label.textContent = `${page}페이지`;
      card.append(canvas, label);
      return card;
    });
    grid.replaceChildren(...cards);
    if (!this.viewer.hasDocument()) {
      cards.forEach((card) => card.querySelector("canvas")?.remove());
      this.renderPageSelection();
      return;
    }
    void (async () => {
      for (let index = 0; index < cards.length; index += 1) {
        if (generation !== this.thumbnailGeneration) return;
        const canvas = cards[index].querySelector("canvas");
        if (canvas) {
          try {
            await this.viewer.renderPickerThumbnail(canvas, index + 1, 110);
          } catch {
            canvas.remove();
          }
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    })();
    this.renderPageSelection();
  }

  private applyScope(scope: string): void {
    if (scope === "current") {
      this.selectedPages = new Set([this.state.currentPage]);
      this.selectionAnchor = this.state.currentPage;
      const field = element<HTMLInputElement>("[data-role='ai-page-range']");
      field.value = String(this.state.currentPage);
      field.setAttribute("aria-invalid", "false");
    }
    if (scope === "all") {
      this.selectedPages = new Set(
        Array.from({ length: this.state.pageCount }, (_, index) => index + 1),
      );
      this.selectionAnchor = 1;
      const field = element<HTMLInputElement>("[data-role='ai-page-range']");
      field.value = `1-${this.state.pageCount}`;
      field.setAttribute("aria-invalid", "false");
    }
    if (scope === "direct") {
      const field = element<HTMLInputElement>("[data-role='ai-page-range']");
      const parsed = parsePageRange(field.value, this.state.pageCount);
      field.setAttribute("aria-invalid", String(!parsed));
      this.selectedPages = new Set(parsed ?? []);
      field.focus();
      field.select();
    }
    this.markScope(scope);
    this.renderPageSelection();
  }

  private markScope(scope: string): void {
    document.querySelectorAll<HTMLButtonElement>("[data-ai-scope]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.aiScope === scope));
    });
  }

  private selectPage(page: number, event: MouseEvent): void {
    const result = applyPageSelection(
      this.selectedPages,
      page,
      this.selectionAnchor,
      this.state.pageCount,
      {
        shiftKey: event.shiftKey,
        toggleKey: event.ctrlKey || event.metaKey,
        selectionMode: this.selectionMode,
      },
    );
    this.selectedPages = result.pages;
    this.selectionAnchor = result.anchor;
    const field = element<HTMLInputElement>("[data-role='ai-page-range']");
    field.value = directRangeValue(this.selectedPages);
    field.setAttribute("aria-invalid", String(this.selectedPages.size === 0));
    this.markScope("direct");
    this.renderPageSelection();
  }

  private toggleSelectionMode(): void {
    this.selectionMode = !this.selectionMode;
    element<HTMLButtonElement>("[data-ai-action='selection-mode']")
      .setAttribute("aria-pressed", String(this.selectionMode));
  }

  private renderPageSelection(): void {
    document.querySelectorAll<HTMLElement>("[data-ai-page]").forEach((card) => {
      card.setAttribute("aria-selected", String(this.selectedPages.has(Number(card.dataset.aiPage))));
    });
    element<HTMLElement>("[data-role='ai-page-selection']").textContent =
      `${formatPageSelection(this.selectedPages)} · ${this.selectedPages.size}장`;
    element<HTMLButtonElement>("[data-ai-action='confirm-pages']").disabled =
      this.selectedPages.size === 0;
  }

  private openSummaryConfirmation(): void {
    if (this.selectedPages.size === 0) return;
    element<HTMLDialogElement>("[data-role='ai-pages-dialog']").close();
    element<HTMLElement>("[data-role='ai-confirm-document']").textContent = this.state.title;
    element<HTMLElement>("[data-role='ai-confirm-pages']").textContent =
      `${formatPageSelection(this.selectedPages)} · ${this.selectedPages.size}장`;
    element<HTMLElement>("[data-role='ai-confirm-model']").textContent =
      `${modelLabel(this.settings.model)} · ${this.settings.effort}`;
    element<HTMLDialogElement>("[data-role='ai-confirm-dialog']").showModal();
  }

  private async runSummary(): Promise<void> {
    if (this.busy || this.selectedPages.size === 0) return;
    element<HTMLDialogElement>("[data-role='ai-confirm-dialog']").close();
    await this.showAi();
    const pages = [...this.selectedPages].sort((left, right) => left - right);
    const title = `${this.state.title} 요약`;
    const conversation = await this.ensureConversation(title.slice(0, 80));
    const history = [...conversation.messages];
    const user = createMessage("user", `${formatPageSelection(pages)} 요약`, pages);
    await this.appendMessage(user);
    const requestId = cryptoId();
    await this.generateResponse(history, [], async (onDelta) => {
      const summaries: string[] = [];
      const batches = chunks(pages, SUMMARY_BATCH_SIZE);
      for (let index = 0; index < batches.length; index += 1) {
        if (this.stopRequested) throw new Error("AI 응답을 중지했습니다.");
        this.setProgress(`페이지 준비 및 요약 ${index + 1}/${batches.length}`);
        const inputs = await this.prepareSummaryBatch(requestId, batches[index], index, batches.length);
        const output = await this.client.runTurn(
          conversation.meta.id,
          this.settings,
          history,
          inputs,
          batches.length === 1 ? onDelta : () => undefined,
        );
        summaries.push(output);
      }
      if (summaries.length === 1) return summaries[0];
      this.setProgress(`${summaries.length}개 묶음을 최종 요약하는 중`);
      return this.client.runTurn(
        conversation.meta.id,
        this.settings,
        history,
        [{ type: "text", text: finalSummaryPrompt(this.state.title, pages, summaries) }],
        onDelta,
      );
    }, () => aiClearRequest(requestId));
  }

  private async prepareSummaryBatch(
    requestId: string,
    pages: number[],
    batchIndex: number,
    batchCount: number,
  ): Promise<AiTurnInput[]> {
    const pageInputs: Array<Pick<SummaryPageInput, "page" | "text">> = [];
    const imagePaths: string[] = [];
    for (const page of pages) {
      if (this.stopRequested) throw new Error("AI 응답을 중지했습니다.");
      this.setProgress(`${page}페이지 텍스트와 이미지를 준비하는 중`);
      const input = await this.viewer.summaryInput(page);
      imagePaths.push(await aiSavePageImage(requestId, page, input.imageDataUrl));
      pageInputs.push({ page: input.page, text: input.text });
    }
    return [
      { type: "text", text: batchSummaryPrompt(this.state.title, pageInputs, batchIndex, batchCount) },
      ...imagePaths.map((path) => ({ type: "localImage" as const, path })),
    ];
  }

  private async generateResponse(
    history: AiMessage[],
    directInput: AiTurnInput[],
    work: (onDelta: (text: string) => void) => Promise<string | void>,
    cleanup: () => Promise<void> = async () => undefined,
  ): Promise<void> {
    const conversation = this.currentConversation;
    if (!conversation) return;
    this.setBusy(true);
    try {
      const response = directInput.length > 0
        ? await this.client.runTurn(
          conversation.meta.id,
          this.settings,
          history,
          directInput,
          (text) => this.renderStreaming(text),
        )
        : await work((text) => this.renderStreaming(text));
      if (this.stopRequested) throw new Error("AI 응답을 중지했습니다.");
      await this.appendMessage(createMessage("assistant", response || "응답 내용이 없습니다.", []));
    } catch (error) {
      await this.appendMessage(createMessage("assistant", `오류: ${cleanError(error)}`, []));
    } finally {
      await cleanup().catch(() => undefined);
      this.setBusy(false);
    }
  }

  private async ensureConversation(title: string): Promise<AiConversation> {
    if (this.currentConversation) return this.currentConversation;
    const now = new Date().toISOString();
    this.currentConversation = await aiCreateConversation(cryptoId(), title || "새 대화", now);
    this.renderConversationHeader();
    await this.loadConversationList();
    return this.currentConversation;
  }

  private async appendMessage(message: AiMessage): Promise<void> {
    const conversation = this.currentConversation;
    if (!conversation) return;
    conversation.meta = await aiAppendMessage(conversation.meta.id, message);
    conversation.messages.push(message);
    this.renderConversationHeader();
    this.renderMessages();
    await this.loadConversationList();
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    this.stopRequested = false;
    this.streamingText = "";
    element<HTMLTextAreaElement>("[data-role='ai-input']").disabled = busy;
    element<HTMLButtonElement>("[data-role='ai-send']").hidden = busy;
    element<HTMLButtonElement>("[data-role='ai-stop']").hidden = !busy;
    document.querySelectorAll<HTMLButtonElement>("[data-summary-control]").forEach((button) => {
      button.disabled = busy || this.state.phase !== "ready";
    });
    if (!busy) this.setProgress("");
    this.renderMessages();
  }

  private setProgress(text: string): void {
    const progress = element<HTMLElement>("[data-role='ai-progress']");
    progress.textContent = text;
    progress.hidden = !text;
  }

  private async stop(): Promise<void> {
    this.stopRequested = true;
    this.setProgress("중지하는 중");
    await this.client.stopTurn();
  }

  private async copyMessage(id: string): Promise<void> {
    const message = this.currentConversation?.messages.find((item) => item.id === id);
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message.text);
    } catch {
      return;
    }
  }
}

function element<T extends Element>(selector: string): T {
  const match = document.querySelector<T>(selector);
  if (!match) throw new Error(`missing element: ${selector}`);
  return match;
}

function createMessage(role: "user" | "assistant", text: string, pages: number[]): AiMessage {
  return {
    id: cryptoId(),
    role,
    text,
    createdAt: new Date().toISOString(),
    pages,
  };
}

function cryptoId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function messageNode(message: AiMessage): HTMLElement {
  const article = document.createElement("article");
  article.className = "ai-message";
  article.dataset.role = message.role;
  const label = document.createElement("div");
  label.className = "ai-message__label";
  label.textContent = message.role === "user" ? "나" : "AI";
  const body = document.createElement("p");
  body.className = "ai-message__body";
  body.textContent = message.text;
  const actions = document.createElement("div");
  actions.className = "ai-message__actions";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.dataset.copyAiMessage = message.id;
  copy.textContent = "복사";
  actions.append(copy);
  article.append(label, body, actions);
  return article;
}

function streamingNode(text: string): HTMLElement {
  const message = createMessage("assistant", text || "응답을 준비하고 있습니다…", []);
  const node = messageNode(message);
  node.dataset.streamingMessage = "true";
  node.querySelector(".ai-message__actions")?.remove();
  return node;
}

function smallAction(label: string, dataName: string, id: string, danger = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = `button${danger ? " button--danger" : ""}`;
  button.type = "button";
  button.dataset[dataName] = id;
  button.textContent = label;
  return button;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("ko-KR");
}

function modelLabel(model: AiModel): string {
  return AI_MODELS.find((item) => item.id === model)?.label ?? model;
}

function directRangeValue(pages: Iterable<number>): string {
  return formatPageSelection(pages).replace(/페이지$/, "").replace("선택 없음", "");
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function batchSummaryPrompt(
  title: string,
  pages: Array<Pick<SummaryPageInput, "page" | "text">>,
  batchIndex: number,
  batchCount: number,
): string {
  const contents = pages.flatMap((page, index) => [
    `<PAGE number="${page.page}" attachedImage="${index + 1}">`,
    page.text || "(추출된 텍스트 없음. 첨부된 페이지 이미지를 읽어 요약)",
    "</PAGE>",
  ]);
  return [
    `문서 “${title}”의 요약 대상 ${batchIndex + 1}/${batchCount} 묶음입니다.`,
    `대상 페이지: ${formatPageSelection(pages.map((page) => page.page))}`,
    "각 PAGE의 추출 텍스트와 같은 순서의 첨부 이미지를 함께 읽고, 페이지 번호를 근거로 표시해 요약하세요.",
    "이 요청에 포함되지 않은 페이지 내용은 추측하지 마세요.",
    "",
    ...contents,
  ].join("\n");
}

function finalSummaryPrompt(title: string, pages: number[], summaries: string[]): string {
  return [
    `문서 “${title}”의 ${formatPageSelection(pages)} 전체 요약을 작성하세요.`,
    "아래 묶음별 요약에서 중복을 제거하고 문서의 흐름, 핵심 주장, 근거, 수치, 결정, 후속 조치를 보존하세요.",
    "페이지 번호 근거를 유지하고 묶음 자체에 대해서는 언급하지 마세요.",
    "",
    ...summaries.flatMap((summary, index) => [
      `<BATCH number="${index + 1}">`,
      summary,
      "</BATCH>",
    ]),
  ].join("\n");
}

function cleanError(error: unknown): string {
  return String(error).replace(/^Error:\s*/, "");
}
