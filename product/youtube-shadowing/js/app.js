/**
 * Main app: routing between views, event binding, keyboard shortcuts.
 */
(function () {
  // DOM elements
  const mainView = document.getElementById('mainView');
  const playerView = document.getElementById('playerView');
  const urlForm = document.getElementById('urlForm');
  const urlInput = document.getElementById('urlInput');
  const btnNewVideo = document.getElementById('btnNewVideo');
  const navBrand = document.getElementById('navBrand');
  const btnPlayPause = document.getElementById('btnPlayPause');
  const btnRecord = document.getElementById('btnRecord');
  const btnStopRecord = document.getElementById('btnStopRecord');
  const recordingTime = document.getElementById('recordingTime');
  const recordingsList = document.getElementById('recordingsList');

  let recordingTimer = null;

  // --- View switching ---
  function showMain() {
    mainView.classList.remove('hidden');
    playerView.classList.add('hidden');
    urlInput.value = '';
    urlInput.focus();
  }

  function showPlayer() {
    mainView.classList.add('hidden');
    playerView.classList.remove('hidden');
  }

  // --- URL form submit ---
  urlForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    const videoId = PlayerModule.extractVideoId(url);
    if (!videoId) {
      alert('올바른 YouTube URL을 입력해주세요.');
      return;
    }

    showPlayer();
    await PlayerModule.init(videoId);
    updatePlayButton();
  });

  // --- Navigation ---
  btnNewVideo.addEventListener('click', showMain);
  navBrand.addEventListener('click', showMain);

  // --- Play/Pause ---
  btnPlayPause.addEventListener('click', () => {
    PlayerModule.togglePlay();
  });

  PlayerModule.onStateChange(() => {
    updatePlayButton();
  });

  function updatePlayButton() {
    btnPlayPause.textContent = PlayerModule.isPlaying() ? '⏸' : '▶';
  }

  // --- Seek buttons ---
  document.querySelectorAll('[data-seek]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const seconds = parseInt(btn.dataset.seek, 10);
      PlayerModule.seek(seconds);
    });
  });

  // --- Speed buttons ---
  document.querySelectorAll('[data-speed]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const speed = parseFloat(btn.dataset.speed);
      PlayerModule.setSpeed(speed);
      updateSpeedButtons(speed);
    });
  });

  function updateSpeedButtons(activeSpeed) {
    document.querySelectorAll('[data-speed]').forEach((btn) => {
      const speed = parseFloat(btn.dataset.speed);
      btn.classList.toggle('active', speed === activeSpeed);
    });
  }

  // --- Recording ---
  btnRecord.addEventListener('click', async () => {
    try {
      await RecorderModule.start();
      btnRecord.classList.add('hidden');
      btnStopRecord.classList.remove('hidden');
      recordingTime.classList.remove('hidden');
      recordingTimer = setInterval(() => {
        recordingTime.textContent = RecorderModule.getElapsedTime();
      }, 200);
    } catch (err) {
      alert('마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크를 허용해주세요.');
    }
  });

  btnStopRecord.addEventListener('click', async () => {
    const recording = await RecorderModule.stop();
    clearInterval(recordingTimer);
    btnStopRecord.classList.add('hidden');
    btnRecord.classList.remove('hidden');
    recordingTime.classList.add('hidden');
    recordingTime.textContent = '00:00';

    if (recording) {
      addRecordingItem(recording);
    }
  });

  function addRecordingItem(recording) {
    const item = document.createElement('div');
    item.className = 'recording-item';
    item.innerHTML = `
      <span class="recording-label">녹음 ${recording.index}</span>
      <span style="color: var(--text-dim); font-size: 0.8rem;">${recording.timestamp}</span>
      <audio controls src="${recording.url}"></audio>
      <button class="btn btn-download">⬇ 다운로드</button>
    `;
    item.querySelector('.btn-download').addEventListener('click', () => {
      RecorderModule.download(recording);
    });
    recordingsList.appendChild(item);
  }

  // --- Keyboard shortcuts ---
  document.addEventListener('keydown', (e) => {
    // Ignore if typing in input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    // Ignore if player view is not active
    if (playerView.classList.contains('hidden')) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        PlayerModule.togglePlay();
        updatePlayButton();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        PlayerModule.seek(e.shiftKey ? -1 : -5);
        break;
      case 'ArrowRight':
        e.preventDefault();
        PlayerModule.seek(e.shiftKey ? 1 : 5);
        break;
      case 'Minus':
      case 'NumpadSubtract': {
        e.preventDefault();
        const slower = PlayerModule.getNextSpeed(-1);
        PlayerModule.setSpeed(slower);
        updateSpeedButtons(slower);
        break;
      }
      case 'Equal':
      case 'NumpadAdd': {
        e.preventDefault();
        const faster = PlayerModule.getNextSpeed(1);
        PlayerModule.setSpeed(faster);
        updateSpeedButtons(faster);
        break;
      }
      case 'KeyR':
        e.preventDefault();
        if (RecorderModule.getIsRecording()) {
          btnStopRecord.click();
        } else {
          btnRecord.click();
        }
        break;
    }
  });

  // --- Init ---
  urlInput.focus();
})();
