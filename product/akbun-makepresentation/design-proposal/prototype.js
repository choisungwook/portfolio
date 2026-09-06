'use strict';

(() => {
  const ui = globalThis.proposalI18n;
  const kindNames = { text: 'Text', rect: 'Rectangle', ellipse: 'Ellipse', arrow: 'Arrow', line: 'Line', code: 'Code', image: 'Image', pen: 'Pen', callout: 'Speech bubble' };
  const toolNames = { select: 'Select', rect: 'Rectangle', ellipse: 'Ellipse', callout: 'Speech bubble', line: 'Line', arrow: 'Arrow', pen: 'Pen', text: 'Text' };

  function textShape(text, x, y, w, h, size, color = '#252525') {
    return Object.assign(L.createShape('text', x, y, { fontSize: size, textColor: color, stroke: 'none' }), { text, w, h });
  }

  function nodeShape(text, x, y, w, h) {
    return Object.assign(L.createShape('rect', x, y, {
      fill: '#f1f4f7', stroke: '#7c8995', strokeWidth: 2, fontSize: 36, textColor: '#253441',
    }), { text, w, h });
  }

  function arrowShape(x, y, width) {
    return Object.assign(L.createShape('arrow', x, y, { stroke: '#6a747c', strokeWidth: 3 }), { w: width, h: 0 });
  }

  function slideRatioLabel() {
    let width = Math.round(deckSize().width);
    let height = Math.round(deckSize().height);
    const originalWidth = width;
    const originalHeight = height;
    while (height) [width, height] = [height, width % height];
    return `${originalWidth / width}:${originalHeight / width}`;
  }

  function createExampleDeck() {
    const intro = [
      textShape('쿠버네티스 네트워크', 145, 295, 1630, 110, 92),
      textShape('요청이 애플리케이션에 도착하는 과정', 150, 462, 1600, 85, 40, '#66717b'),
      textShape('개념과 흐름을 그림으로 이해하기', 150, 820, 1500, 60, 30, '#66717b'),
    ];
    intro[0].bold = true;
    const flow = [
      textShape('요청이 Pod에 도착하기까지', 130, 105, 1650, 115, 76),
      textShape('Service는 요청을 전달할 Pod를 찾아줍니다.', 134, 244, 1650, 75, 34, '#65717c'),
      nodeShape('Ingress', 150, 440, 410, 150),
      nodeShape('Service', 755, 440, 410, 150),
      nodeShape('Pod', 1360, 440, 410, 150),
      arrowShape(575, 515, 162), arrowShape(1180, 515, 162),
      textShape('외부 요청을 받아', 150, 648, 450, 60, 29, '#65717c'),
      textShape('대상으로 연결하고', 755, 648, 450, 60, 29, '#65717c'),
      textShape('애플리케이션이 응답', 1360, 648, 450, 60, 29, '#65717c'),
      textShape('예시: HTTP 요청을 처리하는 기본 구성', 135, 920, 1600, 60, 28, '#707981'),
    ];
    flow[0].bold = true;
    const summary = [
      textShape('각 구성 요소의 역할', 130, 110, 1650, 110, 76),
      textShape('Ingress', 150, 345, 400, 70, 46), textShape('외부 HTTP 요청의 진입점', 620, 350, 1100, 70, 38),
      textShape('Service', 150, 515, 400, 70, 46), textShape('Pod에 접근할 수 있는 주소 제공', 620, 520, 1100, 70, 38),
      textShape('Pod', 150, 685, 400, 70, 46), textShape('애플리케이션 실행', 620, 690, 1100, 70, 38),
    ];
    summary[0].bold = true;
    const end = [textShape('핵심 정리', 130, 120, 1600, 100, 76), textShape('각 구성 요소가 맡는 역할을 구분합니다.\n요청이 지나가는 순서를 따라가 봅니다.\n문제가 생긴 지점부터 흐름을 확인합니다.', 145, 365, 1630, 500, 44)];
    end[0].bold = true;
    return { slideWidth: 1920, slideHeight: 1080, slides: [intro, summary, flow, end].map((shapes) => ({ background: '#ffffff', shapes })) };
  }

  const heading = document.createElement('div');
  heading.className = 'slide-list-heading proposal-only';
  heading.textContent = 'Slides';
  $('slides').prepend(heading);
  const stageHint = document.createElement('div');
  stageHint.className = 'stage-caption proposal-only';
  stageHint.textContent = 'Double-click to edit text · Drag to move · ⌘Z to undo';
  $('stage').append(stageHint);
  const statusDetail = document.createElement('span');
  statusDetail.className = 'status-detail proposal-only';
  statusDetail.dataset.i18nDynamic = '';
  $('document-state').dataset.i18nDynamic = '';
  $('props-hint').dataset.i18nDynamic = '';
  $('proposal-panel').dataset.i18nDynamic = '';
  $('statusbar').prepend(statusDetail);
  const emptyHelp = document.createElement('div');
  emptyHelp.className = 'empty-help proposal-only';
  emptyHelp.innerHTML = '<strong>Slide</strong><p>Select text or a shape to see its properties.</p><dl><dt>Aspect ratio</dt><dd>16:9</dd><dt>Size</dt><dd>1920 × 1080</dd></dl><p>Choose the Text tool above to add text.</p>';
  $('props').append(emptyHelp);
  const textHeading = document.createElement('strong');
  textHeading.className = 'props-section-heading proposal-only';
  textHeading.textContent = 'Text';
  $('props-text').prepend(textHeading);

  for (const button of document.querySelectorAll('#toolbar button[data-tool]')) {
    const label = document.createElement('span');
    label.className = 'tool-label proposal-only';
    label.textContent = toolNames[button.dataset.tool];
    button.append(label);
    button.setAttribute('aria-label', toolNames[button.dataset.tool]);
  }

  const originalRenderProps = renderProps;
  renderProps = function renderProposalProps() {
    originalRenderProps();
    const shape = selectedShape();
    $('props').classList.toggle('is-empty', !shape);
    emptyHelp.hidden = !!shape;
    $('props-hint').textContent = state.selection.length > 1
      ? ui.t('{count} selected', { count: state.selection.length })
      : shape ? `${ui.t(kindNames[shape.kind] || 'Object')}${shape.text ? '  ' + shape.text.slice(0, 18) : ''}${shape.locked ? ' (' + ui.t('Locked') + ')' : ''}` : ui.t('Select a shape to edit its properties.');
    statusDetail.textContent = ui.t('Slide {current} of {total}', { current: state.current + 1, total: state.deck.slides.length });
    $('document-state').textContent = ui.t(state.dirty ? 'Unsaved changes' : 'Example document');
    emptyHelp.querySelector('dl').lastElementChild.textContent = `${deckSize().width} × ${deckSize().height}`;
    emptyHelp.querySelector('dd').textContent = slideRatioLabel();
    ui.schedule();
  };

  const originalRenderThumbs = renderThumbs;
  renderThumbs = function renderProposalThumbs() {
    originalRenderThumbs();
    for (const element of $('thumbs').children) {
      const entry = state.deck.slides[Number(element.dataset.slide)];
      const name = entry.shapes.find((shape) => shape.kind === 'text')?.text.split('\n')[0] || ui.t('Blank slide');
      const caption = document.createElement('span');
      caption.className = 'thumb-caption proposal-only';
      caption.textContent = name;
      element.append(caption);
      element.setAttribute('aria-label', `${Number(element.dataset.slide) + 1}. ${name}`);
    }
  };

  function showProposal() {
    document.body.classList.add('proposal');
    $('show-proposal').setAttribute('aria-pressed', 'true');
    $('show-original').setAttribute('aria-pressed', 'false');
    renderAll();
  }

  function showOriginal() {
    document.body.classList.remove('proposal');
    $('show-proposal').setAttribute('aria-pressed', 'false');
    $('show-original').setAttribute('aria-pressed', 'true');
    renderAll();
  }

  $('show-proposal').addEventListener('click', showProposal);
  $('show-original').addEventListener('click', showOriginal);
  $('show-rationale').addEventListener('click', () => $('rationale-dialog').showModal());
  $('proposal-save').addEventListener('click', () => $('desktop-notice').showModal());
  $('proposal-export').addEventListener('click', () => $('desktop-notice').showModal());
  $('proposal-present').addEventListener('click', enterPresent);
  const compactViewport = matchMedia('(max-width: 760px)');
  function updatePanelButton() {
    const active = document.body.classList.contains(compactViewport.matches ? 'panel-open' : 'panel-collapsed');
    $('proposal-panel').textContent = ui.t(compactViewport.matches ? (active ? 'Close panel' : 'Open panel') : (active ? 'Show panel' : 'Hide panel'));
    $('proposal-panel').setAttribute('aria-pressed', String(active));
  }
  $('proposal-panel').addEventListener('click', () => {
    document.body.classList.toggle(compactViewport.matches ? 'panel-open' : 'panel-collapsed');
    updatePanelButton();
  });
  compactViewport.addEventListener('change', updatePanelButton);
  updatePanelButton();

  const originalUpdateTitle = updateTitle;
  updateTitle = function updateProposalTitle() {
    originalUpdateTitle();
    $('document-state').textContent = ui.t(state.dirty ? 'Unsaved changes' : 'Example document');
  };

  document.addEventListener('proposal-language-change', () => {
    renderAll();
    updatePanelButton();
  });

  state.deck = createExampleDeck();
  state.current = 2;
  state.dirty = false;
  setSlideSelection([2]);
  selectOnly(3);
  resetHistory();
  showProposal();
})();
