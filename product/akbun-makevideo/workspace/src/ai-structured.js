'use strict';

(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.makevideoAiStructured = factory();
})(globalThis, function () {
  function createClient(deps) {
    let workflowTurn = null;
    async function requestStructured(text, schema, images = []) {
      if (deps.hasPending() || workflowTurn) throw new Error('Finish or stop the current AI request first.');
      const task = { id: null, text: '', cancelled: false };
      const previousThreadId = deps.getThread();
      deps.setThread(null);
      workflowTurn = task;
      let timer;
      try {
        const activeThreadId = await deps.ensureThread();
        task.threadId = activeThreadId;
        if (task.cancelled) throw new Error('Request stopped.');
        if (!deps.connection().models.some((model) => (model.id || model.model) === 'gpt-6-astra')) {
          throw new Error('GPT-6 Astra is not available in your Codex account. Refresh models after checking your subscription.');
        }
        const result = new Promise((resolve, reject) => {
          task.resolve = resolve;
          task.reject = reject;
          timer = setTimeout(() => {
            void cancelStructured().catch(() => {});
            reject(new Error('Astra timed out. Try a smaller editing request.'));
          }, 240_000);
        });
        result.catch(() => {});
        const started = await deps.rpc('turn/start', {
          threadId: activeThreadId,
          model: 'gpt-6-astra',
          effort: 'high',
          input: [{ type: 'text', text: `TEXT MODE. Return structured data for the app to validate and present for user review. You do not execute edits yourself.\n${text}` }, ...images.map((url) => ({ type: 'image', url }))],
          outputSchema: schema,
          approvalPolicy: 'never',
        }, 60_000);
        task.id = started?.turn?.id || task.id;
        if (task.cancelled) await cancelStructured();
        return await result;
      } finally {
        clearTimeout(timer);
        if (task.id && !task.settled) await deps.rpc('turn/interrupt', { threadId: task.threadId, turnId: task.id }).catch(() => {});
        if (task.threadId && deps.connection().server) await deps.rpc('thread/archive', { threadId: task.threadId }, 5000).catch(() => {});
        if (workflowTurn === task) workflowTurn = null;
        deps.setThread(deps.connection().server ? previousThreadId : null);
      }
    }

    async function cancelStructured() {
      if (!workflowTurn) return;
      const task = workflowTurn;
      task.cancelled = true;
      task.reject?.(new Error('Request stopped.'));
      if (task.id) await deps.rpc('turn/interrupt', { threadId: task.threadId, turnId: task.id });
    }

    function handleNotification(method, params) {
      if (workflowTurn && (!params.threadId || params.threadId === deps.getThread())) {
        if (method === 'turn/started') workflowTurn.id = params.turn?.id;
        if (method === 'item/completed' && params.item?.type === 'agentMessage' && params.item.phase !== 'commentary') workflowTurn.text = params.item.text || '';
        if (method === 'turn/completed' && (!workflowTurn.id || workflowTurn.id === params.turn?.id)) {
          const turn = workflowTurn;
          turn.settled = true;
          if (params.turn?.status === 'completed') turn.resolve(turn.text);
          else turn.reject(new Error(params.turn?.error?.message || 'Request stopped.'));
        }
        return true;
      }
      return false;
    }
    function disconnected() { workflowTurn?.reject?.(new Error('Codex App Server stopped.')); }
    return { requestStructured, cancelStructured, handleNotification, disconnected, isBusy: () => Boolean(workflowTurn) };
  }
  return { createClient };
});
