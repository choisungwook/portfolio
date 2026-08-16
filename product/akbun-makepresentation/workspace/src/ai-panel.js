'use strict';

(() => {
  const A = globalThis.makepresentationAi;
  const $ = (id) => document.getElementById(id);
  const rpcPending = new Map();
  let callbacks = {};
  let nextRpcId = 1;
  let listenersReady = null;
  let connectionPromise = null;
  let isolatedConfigPromise = null;
  let connection = {
    state: 'checking',
    account: null,
    capabilities: { imageGeneration: false },
    server: null,
    detail: 'Looking for Codex CLI and ChatGPT authentication.',
  };
  let sessions = [];
  let currentSession = null;
  let currentImageRoot = '';
  let selectedMode = 'text';
  let threadId = null;
  let pendingTurn = null;
  let persistChain = Promise.resolve();
  let persistTimer = null;
  let interruptedSessionsFinalized = false;

  const DEVELOPER_INSTRUCTIONS = [
    'You are embedded in akbun-makepresentation, a desktop slide editor.',
    'Do not run shell commands, inspect files, use web search, modify files, call MCP tools, or delegate work.',
    'The client labels every request as TEXT MODE, IMAGE MODE, or SLIDE MODE.',
    'In TEXT MODE, return text only and do not call a tool.',
    'In IMAGE MODE, use only the built-in image generation tool and save exactly one image.',
    'In SLIDE MODE, return only the JSON required by the supplied output schema.',
  ].join(' ');

  function setConnection(next) {
    connection = { ...connection, ...next };
    renderConnection();
  }

  function connectionLabel() {
    if (connection.state === 'available') {
      const plan = connection.account?.planType ? ` · ChatGPT ${connection.account.planType}` : '';
      return `Available${plan}`;
    }
    if (!window.api.isDesktop) return 'Desktop app required';
    if (connection.detail.includes('codex_cli_not_found')) return 'Codex CLI not found';
    if (isApiKeyAuth(connection.account?.type)) {
      return 'API key authentication is disabled';
    }
    if (connection.account && connection.account.type !== 'chatgpt') {
      return 'ChatGPT subscription authentication required';
    }
    if (connection.state === 'checking') return 'Checking Codex…';
    return 'ChatGPT login required';
  }

  function isApiKeyAuth(type) {
    return type === 'apiKey' || type === 'apikey';
  }

  function renderConnection() {
    const available = connection.state === 'available';
    const state = available ? 'available' : connection.state === 'checking' ? 'checking' : 'unavailable';
    $('ai-connection-banner').dataset.state = state;
    $('ai-connection-text').textContent = connectionLabel();
    $('settings-ai-status').dataset.state = state;
    $('settings-ai-status-title').textContent = connectionLabel();
    $('settings-ai-status-detail').textContent = available
      ? `Connected through ${connection.server?.version || 'Codex CLI'}. Logging out of Codex disables AI here.`
      : connection.detail.replace(/^[a-z_]+:\s*/i, '') || 'Run codex login with a ChatGPT account.';
    const imageButton = $('ai-mode-picker').querySelector('[data-ai-mode="image"]');
    const imageUnavailable = available && !connection.capabilities.imageGeneration;
    imageButton.disabled = !!pendingTurn || imageUnavailable;
    imageButton.title = imageUnavailable
      ? 'Image generation is not available for this Codex account or model provider.'
      : '';
    if (imageButton.disabled && selectedMode === 'image') selectMode('text');
  }

  async function installListeners() {
    if (listenersReady) return listenersReady;
    listenersReady = Promise.all([
      window.api.onAiServerMessage(handleServerMessage),
      window.api.onAiServerState(() => {
        rejectRpcRequests(new Error('Codex App Server stopped.'));
        connectionPromise = null;
        isolatedConfigPromise = null;
        setConnection({ state: 'unavailable', detail: 'Codex App Server stopped.' });
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

  async function sendRpcMessage(message) {
    await window.api.aiSendRpc(message);
  }

  function rpc(method, params = {}, timeoutMs = 30_000) {
    const id = nextRpcId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        rpcPending.delete(id);
        reject(new Error(`${method} timed out.`));
      }, timeoutMs);
      rpcPending.set(id, { resolve, reject, timer });
      sendRpcMessage({ method, id, params }).catch((error) => {
        clearTimeout(timer);
        rpcPending.delete(id);
        reject(error);
      });
    });
  }

  function notify(method, params = {}) {
    return sendRpcMessage({ method, params });
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
      void sendRpcMessage({
        id: message.id,
        error: { code: -32601, message: 'This client does not support server requests.' },
      });
      return;
    }
    handleNotification(message.method, message.params || {});
  }

  function handleNotification(method, params) {
    if (method === 'account/updated') {
      if (params.authMode === 'chatgpt') {
        void refreshStatus();
      } else {
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
    if (!window.api.isDesktop) {
      setConnection({ state: 'unavailable', detail: 'AI integration needs the desktop app.' });
      return connection;
    }
    if (connectionPromise && !forceRefresh) return connectionPromise;
    connectionPromise = (async () => {
      setConnection({ state: 'checking', detail: 'Looking for Codex CLI and ChatGPT authentication.' });
      await installListeners();
      const server = await window.api.aiStartServer();
      const initialized = await rpc('initialize', {
        clientInfo: {
          name: 'akbun_makepresentation',
          title: 'akbun-makepresentation',
          version: '0.16.0',
        },
        capabilities: { experimentalApi: true },
      });
      void initialized;
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
      setConnection({ state: 'unavailable', detail: String(error) });
      return connection;
    });
    return connectionPromise;
  }

  async function refreshStatus() {
    if (!window.api.isDesktop) return connect();
    if (!connection.server) return connect();
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
      setConnection({ state: 'unavailable', detail: String(error) });
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
      const session = A.normalizeSession(loaded.session);
      session.status = 'readonly';
      session.readonlyReason = 'app_closed';
      for (const message of session.messages) {
        if (message.status === 'streaming') message.status = 'stopped';
      }
      session.updatedAt = new Date().toISOString();
      await window.api.aiSaveSession(session.id, session);
    }
  }

  function renderSessionList() {
    const container = $('ai-session-list');
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
      detail.textContent = 'Start a conversation to generate text, images, or a new slide.';
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
    if (!readonly) {
      refreshSlideTargets();
      $('ai-prompt').focus();
    }
  }

  function newConversation() {
    if (sessions.length >= A.MAX_SESSIONS) {
      $('ai-list-status').textContent = 'Delete a conversation before starting a new one.';
      return;
    }
    currentSession = null;
    currentImageRoot = '';
    threadId = null;
    pendingTurn = null;
    selectedMode = 'text';
    selectMode('text');
    $('ai-prompt').value = '';
    $('ai-chat-title').textContent = 'New conversation';
    $('ai-chat-meta').textContent = 'Created when you send the first message';
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
    const sure = await window.api.ask(`Delete “${summary?.title || 'this conversation'}” and its images?`, {
      title: 'Delete AI conversation',
      kind: 'warning',
    });
    if (!sure) return;
    try {
      await window.api.aiDeleteSession(id);
      await loadSessionList();
    } catch (error) {
      $('ai-list-status').textContent = `Cannot delete conversation: ${error}`;
    }
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
    status.textContent = message.status === 'stopped'
      ? 'Stopped'
      : message.status === 'streaming'
        ? 'Streaming…'
        : message.status === 'error'
          ? 'Error'
          : message.mode;
    label.append(speaker, status);
    const body = document.createElement('p');
    body.className = 'ai-message-body';
    body.textContent = message.text || (message.status === 'streaming' ? 'Working…' : '');
    article.append(label, body);
    for (const image of message.images) article.append(imageNode(image));
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

  function imagePath(image) {
    if (image.path) return image.path;
    if (!currentImageRoot) return '';
    const separator = currentImageRoot.includes('\\') ? '\\' : '/';
    return `${currentImageRoot}${separator}${image.fileName}`;
  }

  function imageNode(image) {
    const card = document.createElement('div');
    card.className = 'ai-image-card';
    const path = imagePath(image);
    const element = document.createElement('img');
    element.src = window.api.aiImageUrl(path);
    element.alt = 'AI-generated image';
    const actions = document.createElement('div');
    actions.className = 'ai-image-actions';
    for (const [action, label] of [
      ['copy', 'Copy image'],
      ['save', 'Save'],
      ['insert', 'Insert into slide'],
    ]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.imageAction = action;
      button.dataset.imageId = image.id;
      button.textContent = label;
      actions.append(button);
    }
    card.append(element, actions);
    return card;
  }

  function renderMessages() {
    const container = $('ai-messages');
    container.replaceChildren();
    for (const message of currentSession?.messages || []) {
      container.append(messageNode(message));
    }
    if (currentSession?.readonlyReason === 'limit') {
      $('ai-readonly-notice').textContent =
        'This conversation reached 128 MiB. Delete another conversation if needed, then start a new one.';
    } else {
      $('ai-readonly-notice').textContent =
        'This conversation is read-only. Start a new conversation to continue.';
    }
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
      button.setAttribute('aria-selected', String(active));
    }
    $('ai-slide-target-row').hidden = selectedMode !== 'slide';
    if (selectedMode === 'slide') refreshSlideTargets();
  }

  function refreshSlideTargets() {
    const select = $('ai-slide-target');
    const selected = Number(select.value);
    const slides = callbacks.listSlides?.() || [];
    select.replaceChildren();
    for (const item of slides) {
      const option = document.createElement('option');
      option.value = String(item.index);
      option.textContent = item.label;
      select.append(option);
    }
    const current = callbacks.currentSlideIndex?.() || 0;
    select.value = String(slides.some((item) => item.index === selected) ? selected : current);
  }

  function setStreaming(streaming) {
    $('btn-ai-send').hidden = streaming;
    $('btn-ai-stop').hidden = !streaming;
    $('btn-ai-stop').disabled = false;
    $('ai-prompt').disabled = streaming;
    for (const button of $('ai-mode-picker').querySelectorAll('button')) button.disabled = streaming;
    $('ai-slide-target').disabled = streaming;
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
      serviceName: 'akbun_makepresentation',
      baseInstructions: A.baseInstructions(callbacks.systemPrompts?.()),
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
          mcp_servers: Object.fromEntries(
            servers.map((name) => [name, { enabled: false }])
          ),
        };
      });
    return isolatedConfigPromise;
  }

  async function sendPrompt() {
    if (pendingTurn || currentSession?.status === 'readonly') return;
    const prompt = $('ai-prompt').value.trim();
    if (!prompt) return;
    try {
      const activeThreadId = await ensureThread();
      let slideTarget = null;
      if (selectedMode === 'slide') {
        const index = Number($('ai-slide-target').value);
        slideTarget = callbacks.captureSlide?.(index);
        if (!slideTarget) throw new Error('The selected slide is no longer available.');
      }
      if (!currentSession) {
        const id = A.cryptoId();
        currentSession = A.createSession(id, prompt, selectedMode);
        $('ai-chat-title').textContent = currentSession.title;
      } else {
        currentSession.messages.push(A.createMessage('user', selectedMode, prompt));
      }
      await persist();
      const assistant = A.createMessage('assistant', selectedMode, '', 'streaming');
      currentSession.messages.push(assistant);
      const messageIndex = currentSession.messages.length - 1;
      pendingTurn = {
        mode: selectedMode,
        messageIndex,
        turnId: null,
        itemPhases: new Map(),
        itemTexts: new Map(),
        finalText: '',
        imagePromises: [],
        error: null,
        stopRequested: false,
        slideTarget,
        capacityBytes: 0,
        bodyNode: null,
      };
      pendingTurn.capacityBytes = A.byteLength(snapshotForSave(currentSession)) +
        currentSession.assetBytes;
      $('ai-prompt').value = '';
      setStreaming(true);
      renderMessages();

      const runtime = await window.api.aiRuntimeDirectory();
      let text = `TEXT MODE. Return text only. User request: ${prompt}`;
      let outputSchema;
      if (selectedMode === 'image') {
        text = `$imagegen IMAGE MODE. Generate exactly one image for this request: ${prompt}`;
      } else if (selectedMode === 'slide') {
        text = `SLIDE MODE. ${A.slidePrompt(
          prompt,
          slideTarget.slide,
          callbacks.deckSize?.(),
          slideTarget.index + 1
        )}`;
        outputSchema = A.SLIDE_OUTPUT_SCHEMA;
      }
      const params = {
        threadId: activeThreadId,
        input: [{ type: 'text', text }],
        cwd: runtime,
        approvalPolicy: 'never',
        sandboxPolicy: {
          type: 'workspaceWrite',
          writableRoots: [runtime],
          networkAccess: false,
        },
      };
      if (outputSchema) params.outputSchema = outputSchema;
      const requestedTurn = pendingTurn;
      const result = await rpc('turn/start', params, 60_000);
      requestedTurn.turnId = result?.turn?.id || requestedTurn.turnId;
      if (requestedTurn.stopRequested && requestedTurn.turnId) {
        await rpc('turn/interrupt', {
          threadId: activeThreadId,
          turnId: requestedTurn.turnId,
        });
      }
    } catch (error) {
      if (String(error).includes('session_limit_exceeded') && currentSession) {
        await reachSessionLimit('Conversation reached 128 MiB.');
        setStreaming(false);
        renderMessages();
        return;
      }
      if (String(error).includes('session_count_limit')) {
        currentSession = null;
        setStreaming(false);
        showList();
        $('ai-list-status').textContent = 'Delete a conversation before starting a new one.';
        return;
      }
      if (pendingTurn) {
        const message = currentSession.messages[pendingTurn.messageIndex];
        message.text = String(error);
        message.status = 'error';
        pendingTurn = null;
        await persist().catch(handlePersistenceError);
      }
      setStreaming(false);
      $('ai-turn-status').textContent = String(error).replace(/^Error:\s*/, '');
      renderMessages();
    }
  }

  function appendAgentDelta(params) {
    if (!pendingTurn) return;
    const itemId = params.itemId || 'agent';
    const text = (pendingTurn.itemTexts.get(itemId) || '') + (params.delta || '');
    pendingTurn.itemTexts.set(itemId, text);
    const phase = pendingTurn.itemPhases.get(itemId);
    if (phase === 'commentary') return;
    pendingTurn.finalText = text;
    if (pendingTurn.mode === 'slide') return;
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
    const container = $('ai-messages');
    container.scrollTop = container.scrollHeight;
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
      const image = await window.api.aiAttachImage(
        session.id,
        item.savedPath,
        A.cryptoId()
      );
      const message = session.messages[turn.messageIndex];
      message.images.push(image);
      session.assetBytes += image.sizeBytes;
      turn.capacityBytes += image.sizeBytes;
      if (currentSession === session) renderMessages();
      await persist(session);
    } catch (error) {
      if (String(error).includes('session_limit_exceeded')) {
        const detail = 'Image could not be saved because the conversation would exceed 128 MiB.';
        if (currentSession === session) {
          await reachSessionLimit(detail);
        } else {
          session.status = 'readonly';
          session.readonlyReason = 'limit';
          turn.stopRequested = true;
          const message = session.messages[turn.messageIndex];
          message.status = 'error';
          message.text = detail;
          await persist(session).catch(() => {});
        }
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
    } else if (completed.mode === 'slide') {
      finishSlideMessage(completed, message);
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

  function finishSlideMessage(completed, message) {
    const patch = A.parseSlidePatch(completed.finalText, completed.slideTarget.slide.shapes.length);
    if (!patch) {
      message.status = 'error';
      message.text = 'The slide response was invalid, so no slide was changed.';
      return;
    }
    try {
      const newSlideNumber = callbacks.applySlidePatch?.(completed.slideTarget, patch);
      message.status = 'complete';
      message.text = `${patch.summary}\n\nCreated slide ${newSlideNumber} from slide ${completed.slideTarget.index + 1}.`;
    } catch (error) {
      message.status = 'error';
      message.text = `The original slide was preserved. ${error}`;
    }
  }

  async function stopTurn() {
    if (!pendingTurn) return;
    if (pendingTurn.stopRequested) return;
    pendingTurn.stopRequested = true;
    $('btn-ai-stop').disabled = true;
    $('ai-turn-status').textContent = 'Stopping…';
    const message = currentSession.messages[pendingTurn.messageIndex];
    message.status = 'stopped';
    renderMessages();
    await persist().catch(handlePersistenceError);
    try {
      if (pendingTurn.turnId) {
        await rpc('turn/interrupt', { threadId, turnId: pendingTurn.turnId });
      }
    } catch (error) {
      $('ai-turn-status').textContent = `Stop failed: ${error}`;
      pendingTurn = null;
      setStreaming(false);
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

  async function handleImageAction(action, id) {
    const image = findImage(id);
    if (!image) return;
    const path = imagePath(image);
    try {
      if (action === 'save') {
        const extension = image.fileName.split('.').pop().toLowerCase();
        const destination = await window.api.pickSave(image.fileName, extension);
        if (destination) await window.api.aiCopyImage(path, destination);
      } else if (action === 'copy') {
        const response = await fetch(window.api.aiImageUrl(path));
        const blob = await response.blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      } else if (action === 'insert') {
        await callbacks.insertImage?.(path, window.api.aiImageUrl(path));
      }
      $('ai-turn-status').textContent = action === 'insert' ? 'Inserted into the current slide.' : 'Done.';
    } catch (error) {
      $('ai-turn-status').textContent = `${action} failed: ${error}`;
    }
  }

  function setRightPanel(name) {
    const inspector = name !== 'ai';
    $('props').hidden = !inspector;
    $('ai-panel').hidden = inspector;
    for (const button of $('right-panel-tabs').querySelectorAll('[data-right-panel]')) {
      const active = button.dataset.rightPanel === (inspector ? 'inspector' : 'ai');
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    }
    if (!inspector) {
      void loadSessionList();
      void connect();
    }
  }

  function wireEvents() {
    $('right-panel-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-right-panel]');
      if (button) setRightPanel(button.dataset.rightPanel);
    });
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
      const open = event.target.closest('[data-session-id]');
      const remove = event.target.closest('[data-delete-session]');
      if (open) void openSavedSession(open.dataset.sessionId);
      else if (remove) void deleteSession(remove.dataset.deleteSession);
    });
    $('ai-messages').addEventListener('click', (event) => {
      const copy = event.target.closest('[data-copy-message]');
      const image = event.target.closest('[data-image-action]');
      if (copy) void copyText(copy.dataset.copyMessage);
      else if (image) void handleImageAction(image.dataset.imageAction, image.dataset.imageId);
    });
  }

  async function initialize(options) {
    callbacks = options || {};
    wireEvents();
    renderConnection();
    renderSessionList();
    await loadSessionList();
    await connect();
  }

  globalThis.makepresentationAiPanel = { initialize, refreshStatus, setRightPanel };
})();
