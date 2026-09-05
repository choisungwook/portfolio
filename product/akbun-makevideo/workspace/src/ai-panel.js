'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.makevideoAiPanel = exported;
})(globalThis, function () {
  const A = globalThis.makevideoAiLib;
  const rpcPending = new Map();
  const $ = (id) => document.getElementById(id);
  let options = {};
  let nextRpcId = 1;
  let listenersReady = null;
  let connectionPromise = null;
  let isolatedConfigPromise = null;
  let sessions = [];
  let currentSession = null;
  let currentImageRoot = '';
  let selectedMode = 'text';
  let threadId = null;
  let pendingTurn = null;
  let persistChain = Promise.resolve();
  let persistTimer = null;
  let interruptedSessionsFinalized = false;
  let connection = {
    state: 'checking',
    account: null,
    capabilities: { imageGeneration: false },
    server: null,
    detail: 'Looking for Codex CLI and ChatGPT authentication.',
  };

  const DEVELOPER_INSTRUCTIONS = [
    'You are embedded in akbun-makevideo, a desktop video editor.',
    'Do not run shell commands, inspect files, use web search, modify files, call MCP tools, or delegate work.',
    'The client labels every request as TEXT MODE or IMAGE MODE.',
    'In TEXT MODE, return text only and do not call a tool.',
    'In IMAGE MODE, use only the built-in image generation capability and save exactly one image.',
  ].join(' ');

  function isApiKeyAuth(type) {
    return type === 'apiKey' || type === 'apikey';
  }

  function connectionLabel() {
    if (connection.state === 'available') {
      const plan = connection.account?.planType ? ` · ChatGPT ${connection.account.planType}` : '';
      return `Available${plan}`;
    }
    if (!window.api.available) return 'Desktop app required';
    if (connection.detail.includes('codex_cli_not_found')) return 'Codex CLI not found';
    if (isApiKeyAuth(connection.account?.type)) return 'API key authentication is disabled';
    if (connection.account && connection.account.type !== 'chatgpt') {
      return 'ChatGPT subscription authentication required';
    }
    if (connection.state === 'checking') return 'Checking Codex…';
    return 'ChatGPT login required';
  }

  function setConnection(next) {
    connection = { ...connection, ...next };
    renderConnection();
  }

  function renderConnection() {
    const available = connection.state === 'available';
    const state = available ? 'available' : connection.state === 'checking' ? 'checking' : 'unavailable';
    for (const status of [$('ai-connection-banner'), $('settings-ai-status')].filter(Boolean)) {
      status.dataset.state = state;
    }
    if ($('ai-connection-text')) $('ai-connection-text').textContent = connectionLabel();
    if ($('settings-ai-status-title')) $('settings-ai-status-title').textContent = connectionLabel();
    if ($('settings-ai-status-detail')) {
      $('settings-ai-status-detail').textContent = available
        ? `Connected through ${connection.server?.version || 'Codex CLI'}. Logging out of Codex disables AI here.`
        : connection.detail.replace(/^[a-z_]+:\s*/i, '') || 'Run codex login with a ChatGPT account.';
    }
    const imageButton = $('ai-mode-picker')?.querySelector('[data-ai-mode="image"]');
    if (imageButton) {
      const unavailable = available && !connection.capabilities.imageGeneration;
      imageButton.disabled = Boolean(pendingTurn) || unavailable;
      imageButton.title = unavailable ? 'Image generation is unavailable for this account.' : '';
      if (unavailable && selectedMode === 'image') selectMode('text');
    }
  }

  async function installListeners() {
    if (listenersReady) return listenersReady;
    listenersReady = Promise.all([
      window.api.onAiServerMessage(handleServerMessage),
      window.api.onAiServerState(() => {
        rejectRpcRequests(new Error('Codex App Server stopped.'));
        connectionPromise = null;
        isolatedConfigPromise = null;
        threadId = null;
        void finishStoppedServer();
        setConnection(A.disconnectedConnection('Codex App Server stopped.'));
      }),
    ]);
    return listenersReady;
  }

  function rejectRpcRequests(error) {
    for (const pending of rpcPending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    rpcPending.clear();
  }

  function rpc(method, params = {}, timeoutMs = 30_000) {
    const id = nextRpcId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        rpcPending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, timeoutMs);
      rpcPending.set(id, { resolve, reject, timer });
      window.api.aiSendRpc({ method, id, params }).catch((error) => {
        clearTimeout(timer);
        rpcPending.delete(id);
        reject(error);
      });
    });
  }

  function notify(method, params = {}) {
    return window.api.aiSendRpc({ method, params });
  }

  function handleServerMessage(message) {
    if (!message || typeof message !== 'object') return;
    if (message.id != null && !message.method) {
      const pending = rpcPending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      rpcPending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'Codex request failed.'));
      else pending.resolve(message.result);
      return;
    }
    if (message.id != null && message.method) {
      void window.api.aiSendRpc({
        id: message.id,
        error: { code: -32601, message: 'This client does not support server requests.' },
      });
      return;
    }
    handleNotification(message.method, message.params || {});
  }

  function handleNotification(method, params) {
    if (method === 'account/updated') {
      if (params.authMode === 'chatgpt') void refreshStatus();
      else {
        const account = params.authMode ? { type: params.authMode } : null;
        setConnection({
          state: 'unavailable',
          account,
          detail: isApiKeyAuth(account?.type)
            ? 'API key authentication is disabled for this app.'
            : 'Run codex login with a ChatGPT account.',
        });
      }
      return;
    }
    if (!pendingTurn) return;
    if (params.threadId && params.threadId !== threadId) return;
    if (method === 'turn/started' && params.turn?.id) {
      pendingTurn.turnId = params.turn.id;
    } else if (method === 'item/started' && params.item?.type === 'agentMessage') {
      pendingTurn.itemPhases.set(params.item.id, params.item.phase || 'final_answer');
    } else if (method === 'item/agentMessage/delta') {
      appendAgentDelta(params);
    } else if (method === 'item/completed') {
      completeItem(params.item || {});
    } else if (method === 'turn/completed') {
      void completeTurn(params.turn || {});
    } else if (method === 'error') {
      pendingTurn.error = params.error?.message || 'AI request failed.';
    }
  }

  async function connect(forceRefresh = false) {
    if (!window.api.available) {
      setConnection({ state: 'unavailable', detail: 'AI integration needs the desktop app.' });
      return connection;
    }
    if (connectionPromise && !forceRefresh) return connectionPromise;
    connectionPromise = (async () => {
      setConnection({ state: 'checking', detail: 'Looking for Codex CLI and ChatGPT authentication.' });
      await installListeners();
      const server = await window.api.aiStartServer();
      await rpc('initialize', {
        clientInfo: {
          name: 'akbun_makevideo',
          title: 'akbun-makevideo',
          version: options.version?.() || '0.0.0',
        },
        capabilities: { experimentalApi: true },
      });
      await notify('initialized', {});
      const [accountResult, capabilities] = await Promise.all([
        rpc('account/read', { refreshToken: false }),
        rpc('modelProvider/capabilities/read', {}),
      ]);
      const account = accountResult?.account || null;
      const available = account?.type === 'chatgpt';
      setConnection({
        state: available ? 'available' : 'unavailable',
        account,
        capabilities: capabilities || { imageGeneration: false },
        server,
        detail: available
          ? ''
          : isApiKeyAuth(account?.type)
            ? 'API key authentication is disabled for this app.'
            : 'Run codex login with a ChatGPT account.',
      });
      return connection;
    })().catch((error) => {
      connectionPromise = null;
      setConnection(A.disconnectedConnection(error));
      return connection;
    });
    return connectionPromise;
  }

  async function refreshStatus() {
    if (!connection.server) return connect(true);
    try {
      setConnection({ state: 'checking', detail: 'Refreshing ChatGPT authentication.' });
      const [accountResult, capabilities] = await Promise.all([
        rpc('account/read', { refreshToken: false }),
        rpc('modelProvider/capabilities/read', {}),
      ]);
      const account = accountResult?.account || null;
      setConnection({
        state: account?.type === 'chatgpt' ? 'available' : 'unavailable',
        account,
        capabilities,
        detail: account?.type === 'chatgpt'
          ? ''
          : isApiKeyAuth(account?.type)
            ? 'API key authentication is disabled for this app.'
            : 'Run codex login with a ChatGPT account.',
      });
    } catch (error) {
      connectionPromise = null;
      setConnection(A.disconnectedConnection(error));
    }
    return connection;
  }

  function formatSize(bytes) {
    const value = Number(bytes) || 0;
    return value < 1024 * 1024
      ? `${Math.max(1, Math.round(value / 1024))} KiB`
      : `${(value / (1024 * 1024)).toFixed(1)} MiB`;
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
  }

  async function loadSessionList() {
    try {
      sessions = await window.api.aiListSessions();
      if (!interruptedSessionsFinalized) {
        await finalizeInterruptedSessions();
        interruptedSessionsFinalized = true;
        sessions = await window.api.aiListSessions();
      }
      renderSessionList();
    } catch (error) {
      sessions = [];
      $('ai-list-status').textContent = `Cannot load conversations: ${error}`;
      renderSessionList();
    }
  }

  async function finalizeInterruptedSessions() {
    for (const summary of sessions.filter((item) => item.status === 'active')) {
      const loaded = await window.api.aiLoadSession(summary.id);
      if (!loaded?.session) continue;
      const session = A.restoreInterruptedSession(loaded.session);
      await window.api.aiSaveSession(session.id, session);
    }
  }

  function renderSessionList() {
    const container = $('ai-session-list');
    if (!container) return;
    container.replaceChildren();
    $('btn-ai-new').disabled = sessions.length >= A.MAX_SESSIONS;
    $('ai-list-status').textContent = sessions.length >= A.MAX_SESSIONS
      ? 'Delete a conversation before starting a new one.'
      : `${sessions.length} of ${A.MAX_SESSIONS} conversations saved`;
    if (!sessions.length) {
      const empty = document.createElement('div');
      empty.className = 'ai-session-empty';
      const title = document.createElement('strong');
      title.textContent = 'No conversations yet';
      const detail = document.createElement('span');
      detail.textContent = 'Ask for editing advice, narration, captions, or a still image.';
      empty.append(title, detail);
      container.append(empty);
      return;
    }
    for (const summary of sessions) {
      const row = document.createElement('div');
      row.className = 'ai-session-row';
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'ai-session-open';
      open.dataset.sessionId = summary.id;
      const title = document.createElement('strong');
      title.textContent = summary.title;
      const meta = document.createElement('span');
      meta.textContent = `${formatDate(summary.updatedAt)} · ${formatSize(summary.sizeBytes)}`;
      open.append(title, meta);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ai-session-delete';
      remove.dataset.deleteSession = summary.id;
      remove.textContent = 'Delete';
      row.append(open, remove);
      container.append(row);
    }
  }

  function showList() {
    $('ai-list-view').hidden = false;
    $('ai-chat-view').hidden = true;
    currentSession = null;
    currentImageRoot = '';
    threadId = null;
    pendingTurn = null;
    void loadSessionList();
  }

  function showChat(readonly) {
    $('ai-list-view').hidden = true;
    $('ai-chat-view').hidden = false;
    $('ai-composer').hidden = readonly;
    $('ai-readonly-notice').hidden = !readonly;
    $('ai-chat-title').textContent = currentSession?.title || 'New conversation';
    $('ai-chat-meta').textContent = readonly
      ? `Read-only · ${formatSize(currentSession?.sizeBytes)}`
      : 'Active conversation';
    renderMessages();
    if (!readonly) $('ai-prompt').focus();
  }

  function newConversation() {
    if (sessions.length >= A.MAX_SESSIONS) return;
    currentSession = null;
    currentImageRoot = '';
    threadId = null;
    pendingTurn = null;
    selectMode('text');
    $('ai-prompt').value = '';
    showChat(false);
  }

  async function openSavedSession(id) {
    try {
      const loaded = await window.api.aiLoadSession(id);
      currentSession = A.normalizeSession(loaded.session);
      currentSession.status = 'readonly';
      currentImageRoot = loaded.imageRoot || '';
      showChat(true);
    } catch (error) {
      $('ai-list-status').textContent = `Cannot open conversation: ${error}`;
    }
  }

  async function deleteSession(id) {
    const summary = sessions.find((item) => item.id === id);
    const confirmed = await window.api.ask(
      `Delete “${summary?.title || 'this conversation'}” and its generated images?`,
      { title: 'Delete AI conversation', kind: 'warning' }
    );
    if (!confirmed) return;
    try {
      await window.api.aiDeleteSession(id);
      await loadSessionList();
    } catch (error) {
      $('ai-list-status').textContent = `Cannot delete conversation: ${error}`;
    }
  }

  function imagePath(image) {
    if (image.path) return image.path;
    if (!currentImageRoot) return '';
    const separator = currentImageRoot.includes('\\') ? '\\' : '/';
    return `${currentImageRoot}${separator}${image.fileName}`;
  }

  function messageNode(message) {
    const article = document.createElement('article');
    article.className = 'ai-message';
    article.dataset.role = message.role;
    article.dataset.messageId = message.id;
    const label = document.createElement('div');
    label.className = 'ai-message-label';
    const speaker = document.createElement('span');
    speaker.textContent = message.role === 'user' ? 'You' : 'AI';
    const status = document.createElement('span');
    status.textContent = message.status === 'streaming'
      ? 'Streaming…'
      : message.status === 'stopped'
        ? 'Stopped'
        : message.status === 'error' ? 'Error' : message.mode;
    label.append(speaker, status);
    const body = document.createElement('p');
    body.className = 'ai-message-body';
    body.textContent = message.text || (message.status === 'streaming' ? 'Working…' : '');
    article.append(label, body);
    for (const image of message.images) {
      const card = document.createElement('div');
      card.className = 'ai-image-card';
      const element = document.createElement('img');
      element.src = window.api.aiImageUrl(imagePath(image));
      element.alt = 'AI-generated still image';
      const save = document.createElement('button');
      save.type = 'button';
      save.dataset.saveImage = image.id;
      save.textContent = 'Save image…';
      card.append(element, save);
      article.append(card);
    }
    const actions = document.createElement('div');
    actions.className = 'ai-message-actions';
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.dataset.copyMessage = message.id;
    copy.textContent = 'Copy';
    copy.disabled = !message.text;
    actions.append(copy);
    article.append(actions);
    return article;
  }

  function renderMessages() {
    const container = $('ai-messages');
    container.replaceChildren();
    for (const message of currentSession?.messages || []) container.append(messageNode(message));
    $('ai-readonly-notice').textContent = currentSession?.readonlyReason === 'limit'
      ? 'This conversation reached 128 MiB. Start a new conversation after deleting one if needed.'
      : 'This conversation is read-only. Start a new conversation to continue.';
    bindPendingMessageBody();
    container.scrollTop = container.scrollHeight;
  }

  function bindPendingMessageBody() {
    if (!pendingTurn) return;
    const message = currentSession?.messages[pendingTurn.messageIndex];
    const article = Array.from($('ai-messages').children)
      .find((node) => node.dataset.messageId === message?.id);
    pendingTurn.bodyNode = article?.querySelector('.ai-message-body') || null;
  }

  function selectMode(mode) {
    selectedMode = A.MODES.has(mode) ? mode : 'text';
    for (const button of $('ai-mode-picker').querySelectorAll('[data-ai-mode]')) {
      const active = button.dataset.aiMode === selectedMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    }
  }

  function setStreaming(streaming) {
    $('btn-ai-send').hidden = streaming;
    $('btn-ai-stop').hidden = !streaming;
    $('btn-ai-stop').disabled = false;
    $('ai-prompt').disabled = streaming;
    for (const button of $('ai-mode-picker').querySelectorAll('button')) button.disabled = streaming;
    $('ai-turn-status').textContent = streaming ? 'Generating…' : '';
    if (!streaming) renderConnection();
  }

  function snapshotForSave(session) {
    const snapshot = structuredClone(session);
    for (const message of snapshot.messages) {
      for (const image of message.images) delete image.path;
    }
    return snapshot;
  }

  function persist(session = currentSession) {
    if (!session?.id) return Promise.resolve(0);
    session.updatedAt = new Date().toISOString();
    const snapshot = snapshotForSave(session);
    persistChain = persistChain.catch(() => {}).then(async () => {
      const size = await window.api.aiSaveSession(session.id, snapshot);
      session.sizeBytes = size;
      if (session === currentSession) {
        if (pendingTurn) pendingTurn.capacityBytes = Math.max(pendingTurn.capacityBytes, size);
        $('ai-chat-meta').textContent = session.status === 'readonly'
          ? `Read-only · ${formatSize(size)}`
          : `Active · ${formatSize(size)}`;
      }
      return size;
    });
    return persistChain;
  }

  function schedulePersist() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void persist().catch(handlePersistenceError);
    }, 350);
  }

  function handlePersistenceError(error) {
    if (String(error).includes('session_limit_exceeded')) {
      void reachSessionLimit('Conversation reached 128 MiB.');
      return;
    }
    $('ai-turn-status').textContent = `Save failed: ${error}`;
  }

  async function ensureThread() {
    if (threadId) return threadId;
    const status = await refreshStatus();
    if (status.state !== 'available') throw new Error(connectionLabel());
    const runtime = await window.api.aiRuntimeDirectory();
    const config = await isolatedThreadConfig(runtime);
    const result = await rpc('thread/start', {
      cwd: runtime,
      approvalPolicy: 'never',
      sandbox: 'workspace-write',
      personality: 'friendly',
      serviceName: 'akbun_makevideo',
      baseInstructions: A.baseInstructions(),
      developerInstructions: DEVELOPER_INSTRUCTIONS,
      ephemeral: true,
      config,
    });
    threadId = result?.thread?.id;
    if (!threadId) throw new Error('Codex did not create a conversation.');
    return threadId;
  }

  function isolatedThreadConfig(runtime) {
    if (isolatedConfigPromise) return isolatedConfigPromise;
    isolatedConfigPromise = rpc('config/read', { cwd: runtime, includeLayers: false })
      .then((result) => {
        const servers = Object.keys(result?.config?.mcp_servers || {});
        return {
          web_search: 'disabled',
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
            skill_mcp_dependency_install: false,
          },
          tools: { view_image: false },
          memories: { generate_memories: false, use_memories: false },
          mcp_servers: Object.fromEntries(servers.map((name) => [name, { enabled: false }])),
        };
      });
    return isolatedConfigPromise;
  }

  async function startTurn(activeThreadId, text) {
    const runtime = await window.api.aiRuntimeDirectory();
    const requestedTurn = pendingTurn;
    const result = await rpc('turn/start', {
      threadId: activeThreadId,
      input: [{ type: 'text', text }],
      cwd: runtime,
      approvalPolicy: 'never',
      sandboxPolicy: {
        type: 'workspaceWrite',
        writableRoots: [runtime],
        networkAccess: false,
      },
    }, 60_000);
    requestedTurn.turnId = result?.turn?.id || requestedTurn.turnId;
    if (requestedTurn.stopRequested && requestedTurn.turnId) {
      await rpc('turn/interrupt', { threadId: activeThreadId, turnId: requestedTurn.turnId });
    }
  }

  async function sendPrompt() {
    if (pendingTurn || currentSession?.status === 'readonly') return;
    const prompt = $('ai-prompt').value.trim();
    if (!prompt) return;
    try {
      const activeThreadId = await ensureThread();
      if (!currentSession) {
        currentSession = A.createSession(A.cryptoId(), prompt, selectedMode);
        $('ai-chat-title').textContent = currentSession.title;
      } else {
        currentSession.messages.push(A.createMessage('user', selectedMode, prompt));
      }
      await persist();
      const assistant = A.createMessage('assistant', selectedMode, '', 'streaming');
      currentSession.messages.push(assistant);
      pendingTurn = {
        mode: selectedMode,
        messageIndex: currentSession.messages.length - 1,
        turnId: null,
        itemPhases: new Map(),
        itemTexts: new Map(),
        finalText: '',
        imagePromises: [],
        error: null,
        stopRequested: false,
        capacityBytes: A.byteLength(snapshotForSave(currentSession)) + currentSession.assetBytes,
        bodyNode: null,
      };
      $('ai-prompt').value = '';
      setStreaming(true);
      renderMessages();
      await startTurn(activeThreadId, A.composeTurn(selectedMode, prompt, options.project?.()));
    } catch (error) {
      if (String(error).includes('session_limit_exceeded') && currentSession) {
        await reachSessionLimit('Conversation reached 128 MiB.');
      } else if (String(error).includes('session_count_limit')) {
        currentSession = null;
        showList();
        $('ai-list-status').textContent = 'Delete a conversation before starting a new one.';
      } else {
        if (pendingTurn) {
          const message = currentSession.messages[pendingTurn.messageIndex];
          message.text = String(error);
          message.status = 'error';
          pendingTurn = null;
          await persist().catch(handlePersistenceError);
        }
        $('ai-turn-status').textContent = String(error).replace(/^Error:\s*/, '');
      }
      setStreaming(false);
      renderMessages();
    }
  }

  function appendAgentDelta(params) {
    if (!pendingTurn) return;
    const itemId = params.itemId || 'agent';
    const text = (pendingTurn.itemTexts.get(itemId) || '') + (params.delta || '');
    pendingTurn.itemTexts.set(itemId, text);
    if (pendingTurn.itemPhases.get(itemId) === 'commentary') return;
    pendingTurn.finalText = text;
    const message = currentSession.messages[pendingTurn.messageIndex];
    const delta = params.delta || '';
    if (!A.canAppendText(pendingTurn.capacityBytes, delta)) {
      void reachSessionLimit('Conversation reached 128 MiB.');
      return;
    }
    pendingTurn.capacityBytes += A.encodedJsonTextBytes(delta);
    message.text += delta;
    if (!pendingTurn.bodyNode?.isConnected) bindPendingMessageBody();
    if (pendingTurn.bodyNode) pendingTurn.bodyNode.textContent = message.text;
    $('ai-messages').scrollTop = $('ai-messages').scrollHeight;
    schedulePersist();
  }

  function completeItem(item) {
    if (!pendingTurn) return;
    if (item.type === 'agentMessage') {
      pendingTurn.itemPhases.set(item.id, item.phase || 'final_answer');
      if (!item.phase || item.phase === 'final_answer') {
        pendingTurn.finalText = item.text || pendingTurn.itemTexts.get(item.id) || pendingTurn.finalText;
      }
    } else if (item.type === 'imageGeneration' && item.savedPath) {
      const turn = pendingTurn;
      const session = currentSession;
      const promise = attachGeneratedImage(item, turn, session);
      turn.imagePromises.push(promise);
    }
  }

  async function attachGeneratedImage(item, turn, session) {
    try {
      const image = await window.api.aiAttachImage(session.id, item.savedPath, A.cryptoId());
      const message = session.messages[turn.messageIndex];
      message.images.push(image);
      session.assetBytes += image.sizeBytes;
      turn.capacityBytes += image.sizeBytes;
      if (currentSession === session) renderMessages();
      await persist(session);
    } catch (error) {
      if (String(error).includes('session_limit_exceeded')) {
        if (currentSession === session) await reachSessionLimit('Generated image exceeds the 128 MiB conversation limit.');
      } else {
        turn.error = `Image save failed: ${error}`;
      }
    }
  }

  async function completeTurn(turn) {
    const completed = pendingTurn;
    if (!completed) return;
    if (completed.turnId && turn.id && completed.turnId !== turn.id) return;
    await Promise.allSettled(completed.imagePromises);
    if (pendingTurn !== completed) return;
    const message = currentSession.messages[completed.messageIndex];
    const interrupted = completed.stopRequested || turn.status === 'interrupted';
    if (currentSession.status === 'readonly' && currentSession.readonlyReason === 'limit') {
      message.status = message.status === 'error' ? 'error' : 'stopped';
    } else if (interrupted) {
      message.status = 'stopped';
    } else if (completed.error || turn.status === 'failed') {
      message.status = 'error';
      message.text = completed.error || turn.error?.message || 'AI request failed.';
    } else if (completed.mode === 'image' && !message.images.length) {
      message.status = 'error';
      message.text = completed.finalText || 'Image generation did not return a saved image.';
    } else {
      message.status = 'complete';
      message.text = completed.finalText || message.text ||
        (message.images.length ? 'Image generated.' : 'No response received.');
    }
    pendingTurn = null;
    setStreaming(false);
    renderMessages();
    await persist().catch(handlePersistenceError);
  }

  async function finishStoppedServer() {
    if (!pendingTurn || !currentSession) return;
    const message = currentSession.messages[pendingTurn.messageIndex];
    message.status = 'stopped';
    pendingTurn = null;
    setStreaming(false);
    renderMessages();
    await persist().catch(handlePersistenceError);
  }

  async function stopTurn() {
    if (!pendingTurn || pendingTurn.stopRequested) return;
    pendingTurn.stopRequested = true;
    $('btn-ai-stop').disabled = true;
    $('ai-turn-status').textContent = 'Stopping…';
    const message = currentSession.messages[pendingTurn.messageIndex];
    message.status = 'stopped';
    renderMessages();
    await persist().catch(handlePersistenceError);
    if (pendingTurn?.turnId) {
      try {
        await rpc('turn/interrupt', { threadId, turnId: pendingTurn.turnId });
      } catch (error) {
        $('ai-turn-status').textContent = `Stop failed: ${error}`;
        pendingTurn = null;
        setStreaming(false);
      }
    }
  }

  async function reachSessionLimit(detail) {
    if (!currentSession || currentSession.status === 'readonly') return;
    currentSession.status = 'readonly';
    currentSession.readonlyReason = 'limit';
    if (pendingTurn) {
      pendingTurn.stopRequested = true;
      pendingTurn.error = detail;
      const message = currentSession.messages[pendingTurn.messageIndex];
      message.status = pendingTurn.mode === 'image' ? 'error' : 'stopped';
      if (pendingTurn.mode === 'image') message.text = detail;
      if (pendingTurn.turnId) {
        void rpc('turn/interrupt', { threadId, turnId: pendingTurn.turnId }).catch(() => {});
      }
    }
    $('ai-turn-status').textContent = detail;
    renderMessages();
    await persist().catch(() => {});
  }

  async function closeConversation() {
    if (pendingTurn) await stopTurn();
    if (currentSession?.id && currentSession.status !== 'readonly') {
      currentSession.status = 'readonly';
      currentSession.readonlyReason = 'closed';
      await persist().catch(handlePersistenceError);
    }
    showList();
  }

  async function copyText(messageId) {
    const message = currentSession?.messages.find((item) => item.id === messageId);
    if (!message?.text) return;
    try {
      await navigator.clipboard.writeText(message.text);
      $('ai-turn-status').textContent = 'Copied.';
    } catch (error) {
      $('ai-turn-status').textContent = `Copy failed: ${error}`;
    }
  }

  function findImage(id) {
    return currentSession?.messages.flatMap((message) => message.images)
      .find((image) => image.id === id);
  }

  async function saveImage(id) {
    const image = findImage(id);
    if (!image) return;
    try {
      const destination = await window.api.pickAiImageSave(image.fileName);
      if (!destination) return;
      await window.api.aiCopyImage(imagePath(image), destination);
      $('ai-turn-status').textContent = 'Image saved.';
    } catch (error) {
      $('ai-turn-status').textContent = `Save failed: ${error}`;
    }
  }

  function wireEvents() {
    $('btn-ai-new').addEventListener('click', newConversation);
    $('btn-ai-back').addEventListener('click', closeConversation);
    $('btn-ai-send').addEventListener('click', sendPrompt);
    $('btn-ai-stop').addEventListener('click', stopTurn);
    $('btn-ai-refresh').addEventListener('click', refreshStatus);
    $('ai-prompt').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        void sendPrompt();
      }
    });
    $('ai-mode-picker').addEventListener('click', (event) => {
      const button = event.target.closest('[data-ai-mode]');
      if (button && !button.disabled) selectMode(button.dataset.aiMode);
    });
    $('ai-session-list').addEventListener('click', (event) => {
      const openButton = event.target.closest('[data-session-id]');
      const deleteButton = event.target.closest('[data-delete-session]');
      if (openButton) void openSavedSession(openButton.dataset.sessionId);
      else if (deleteButton) void deleteSession(deleteButton.dataset.deleteSession);
    });
    $('ai-messages').addEventListener('click', (event) => {
      const copy = event.target.closest('[data-copy-message]');
      const image = event.target.closest('[data-save-image]');
      if (copy) void copyText(copy.dataset.copyMessage);
      else if (image) void saveImage(image.dataset.saveImage);
    });
  }

  async function open() {
    await loadSessionList();
    await connect();
  }

  async function initialize(settings) {
    options = settings || {};
    wireEvents();
    renderConnection();
    renderSessionList();
    await loadSessionList();
  }

  return { initialize, open, refreshStatus };
});
