'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.makevideoAiEditPanel = exported;
})(globalThis, function () {
  const $ = (id) => document.getElementById(id);
  let options = {};
  let selectedSection = 'conversations';
  let status = { id: 0, stage: 'idle', progress: 0, message: '' };
  let synchronizedJobId = 0;

  const PROVIDERS = {
    openai: {
      label: 'OpenAI transcription',
      endpoint: 'https://api.openai.com/v1',
      model: 'whisper-1',
      note: 'Uses timestamped verbose JSON. whisper-1 is the default because it exposes segment timestamps.',
    },
    litellm: {
      label: 'LiteLLM gateway',
      endpoint: 'http://127.0.0.1:4000/v1',
      model: 'whisper-1',
      note: 'Routes the OpenAI-compatible audio transcription endpoint to configured providers. LM Studio alone does not currently expose this endpoint.',
    },
    google: {
      label: 'Google Cloud Speech-to-Text',
      endpoint: 'https://speech.googleapis.com/v2/projects/PROJECT_ID/locations/global/recognizers/_',
      model: 'long',
      note: 'Uses v2 recognition in overlapping 55-second chunks. Replace PROJECT_ID and enter an OAuth bearer token for this session.',
    },
    azure: {
      label: 'Microsoft Azure Speech',
      endpoint: 'https://YOUR_RESOURCE.cognitiveservices.azure.com',
      model: 'fast-transcription',
      note: 'Uses the 2025-10-15 GA fast transcription API with phrase timestamps. Replace YOUR_RESOURCE and enter the resource key.',
    },
    custom: {
      label: 'Custom OpenAI-compatible endpoint',
      endpoint: 'http://127.0.0.1:8000/v1',
      model: 'whisper-1',
      note: 'The server must implement POST /audio/transcriptions and return verbose JSON segments with start and end timestamps.',
    },
  };

  function currentSettings() {
    return options.settings?.() || {};
  }

  function renderProvider() {
    const settings = currentSettings();
    const formProvider = $('as-transcription-provider')?.value
      || settings.transcriptionProvider
      || 'openai';
    const formPreset = PROVIDERS[formProvider] || PROVIDERS.custom;
    if ($('as-transcription-note')) $('as-transcription-note').textContent = formPreset.note;
    if ($('ai-edit-provider')) {
      const provider = settings.transcriptionProvider || 'openai';
      const preset = PROVIDERS[provider] || PROVIDERS.custom;
      const model = settings.transcriptionModel || preset.model;
      $('ai-edit-provider').textContent = `${preset.label} · ${model} · mono 16 kHz MP3`;
    }
  }

  function fillSettings() {
    renderProvider();
  }

  function chooseProvider(provider) {
    const preset = PROVIDERS[provider] || PROVIDERS.custom;
    $('as-transcription-endpoint').value = preset.endpoint;
    $('as-transcription-model').value = preset.model;
    renderProvider();
  }

  function projectRate() {
    const rate = options.project?.()?.settings?.rate || { num: 30, den: 1 };
    return Number(rate.num) / Math.max(1, Number(rate.den));
  }

  function captionItems() {
    const items = [];
    for (const track of options.project?.()?.tracks || []) {
      if (track.kind !== 'subtitle') continue;
      for (const item of track.visualItems || []) {
        if (item.content?.kind === 'text') items.push({ track, item });
      }
    }
    return items.sort((left, right) => left.item.start - right.item.start);
  }

  function timeInput(value, field, label) {
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.001';
    input.value = value.toFixed(3);
    input.dataset[field] = '';
    input.setAttribute('aria-label', label);
    return input;
  }

  function renderCaptions() {
    if (selectedSection !== 'captions') return;
    const list = $('caption-editor-list');
    if (!list) return;
    const captions = captionItems();
    const framesPerSecond = projectRate();
    list.replaceChildren();
    for (const { track, item } of captions) {
      const row = document.createElement('article');
      row.className = 'caption-editor-row';
      row.dataset.captionId = item.id;
      const heading = document.createElement('div');
      heading.className = 'caption-editor-heading';
      const trackName = document.createElement('span');
      trackName.textContent = track.name;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'small danger-text';
      remove.dataset.captionDelete = '';
      remove.textContent = 'Delete';
      heading.append(trackName, remove);
      const time = document.createElement('div');
      time.className = 'caption-editor-time';
      time.append(
        timeInput(item.start / framesPerSecond, 'captionStart', 'Caption start in seconds'),
        timeInput((item.start + item.duration) / framesPerSecond, 'captionEnd', 'Caption end in seconds'),
      );
      const text = document.createElement('textarea');
      text.rows = 2;
      text.dataset.captionText = '';
      text.setAttribute('aria-label', 'Caption text');
      text.value = item.content.text || '';
      row.append(heading, time, text);
      list.append(row);
    }
    $('caption-count').textContent = captions.length ? `${captions.length}` : '';
    $('caption-editor-empty').hidden = captions.length > 0;
  }

  function showSection(section) {
    selectedSection = section === 'captions' ? 'captions' : 'conversations';
    $('ai-conversations-view').hidden = selectedSection !== 'conversations';
    $('ai-captions-view').hidden = selectedSection !== 'captions';
    for (const button of document.querySelectorAll('[data-ai-section]')) {
      button.setAttribute('aria-pressed', String(button.dataset.aiSection === selectedSection));
    }
    if (selectedSection === 'captions') {
      renderProvider();
      renderCaptions();
    }
  }

  function showCurrentSection() {
    showSection(selectedSection);
  }

  function showCaptions(action = '') {
    showSection('captions');
    void refreshCredentialStatus();
    const target = action === 'silence' ? $('btn-ai-silence-remove') : $('btn-ai-caption-generate');
    target?.focus();
  }

  async function updateCaption(row) {
    const found = captionItems().find(({ item }) => item.id === row.dataset.captionId);
    if (!found) return;
    const framesPerSecond = projectRate();
    const start = Math.max(0, Math.round(Number(row.querySelector('[data-caption-start]').value) * framesPerSecond));
    const enteredEnd = Math.round(Number(row.querySelector('[data-caption-end]').value) * framesPerSecond);
    const end = Math.max(start + 1, enteredEnd);
    const text = row.querySelector('[data-caption-text]').value;
    await options.edit?.(
      { op: 'setVisualContent', itemId: found.item.id, content: { ...found.item.content, text } },
      { op: 'setVisualTiming', itemId: found.item.id, start, duration: end - start },
    );
    renderCaptions();
  }

  async function removeCaption(row) {
    await options.edit?.({ op: 'removeVisualItem', itemId: row.dataset.captionId });
    renderCaptions();
  }

  function isActive() {
    return ['queued', 'preprocessing', 'transcribing', 'analyzing', 'generating', 'applying'].includes(status.stage);
  }

  async function handleStatus(next) {
    status = next || status;
    const active = isActive();
    document.body.classList.toggle('ai-editing', active);
    $('btn-ai-caption-generate').disabled = active;
    $('btn-ai-silence-remove').disabled = active;
    $('btn-ai-edit-cancel').hidden = !active;
    $('menu-ai-cancel').disabled = !active;
    $('ai-edit-progress').hidden = !active;
    $('ai-edit-progress-bar').style.width = `${Math.round((status.progress || 0) * 100)}%`;
    $('ai-edit-status').textContent = status.message || '';
    if (!active && status.stage !== 'idle') $('ai-edit-summary').textContent = status.message || '';
    if (status.stage === 'done' && synchronizedJobId !== status.id) {
      synchronizedJobId = status.id;
      await options.syncDocument?.();
      renderCaptions();
    }
  }

  async function refreshCredentialStatus() {
    const provider = currentSettings().transcriptionProvider || 'openai';
    const result = await window.api.aiEditCredentialStatus(provider);
    $('ai-edit-credential').placeholder = result?.present
      ? 'Credential is set for this provider'
      : 'API key, gateway key, or OAuth token';
  }

  async function clearCredential() {
    const provider = currentSettings().transcriptionProvider || 'openai';
    await window.api.aiEditSetCredential(provider, '');
    $('ai-edit-credential').value = '';
    await refreshCredentialStatus();
  }

  async function startJob(kind) {
    try {
      const credential = $('ai-edit-credential').value.trim();
      const provider = currentSettings().transcriptionProvider || 'openai';
      if (credential) {
        await window.api.aiEditSetCredential(provider, credential);
        $('ai-edit-credential').value = '';
      }
      const next = kind === 'silence'
        ? await window.api.aiEditStartSilenceRemoval()
        : await window.api.aiEditStartCaptions();
      await handleStatus(next);
    } catch (error) {
      $('ai-edit-summary').textContent = String(error).replace(/^Error:\s*/, '');
    }
  }

  function wireEvents() {
    document.querySelector('.ai-section-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('[data-ai-section]');
      if (button) showSection(button.dataset.aiSection);
    });
    $('as-transcription-provider').addEventListener('change', (event) => {
      chooseProvider(event.target.value);
    });
    $('btn-ai-caption-generate').addEventListener('click', () => void startJob('captions'));
    $('btn-ai-silence-remove').addEventListener('click', () => void startJob('silence'));
    $('btn-ai-edit-cancel').addEventListener('click', () => void window.api.aiEditCancel());
    $('btn-ai-credential-clear').addEventListener('click', () => void clearCredential());
    $('caption-editor-list').addEventListener('change', (event) => {
      const row = event.target.closest('[data-caption-id]');
      if (row) void updateCaption(row);
    });
    $('caption-editor-list').addEventListener('click', (event) => {
      const row = event.target.closest('[data-caption-delete]')?.closest('[data-caption-id]');
      if (row) void removeCaption(row);
    });
  }

  async function initialize(settings) {
    options = settings || {};
    wireEvents();
    showCurrentSection();
    await window.api.onAiEditStatus((next) => void handleStatus(next));
    await handleStatus(await window.api.aiEditStatus());
    await refreshCredentialStatus();
  }

  return { initialize, fillSettings, showCurrentSection, showCaptions, renderCaptions };
});
