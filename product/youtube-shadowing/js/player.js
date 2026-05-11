/**
 * YouTube IFrame Player API wrapper for shadowing controls.
 */
const PlayerModule = (() => {
  let player = null;
  let isReady = false;
  let onReadyCallback = null;
  let onStateChangeCallback = null;

  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

  // Load YouTube IFrame API script
  function loadAPI() {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) {
        resolve();
        return;
      }
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
      window.onYouTubeIframeAPIReady = resolve;
    });
  }

  // Extract video ID from various YouTube URL formats
  function extractVideoId(url) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  }

  // Initialize player with a video ID
  async function init(videoId, containerId = 'ytPlayer') {
    await loadAPI();

    // Destroy existing player
    if (player) {
      player.destroy();
      player = null;
      isReady = false;
    }

    return new Promise((resolve) => {
      player = new YT.Player(containerId, {
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          modestbranding: 1,
          rel: 0,
          fs: 1
        },
        events: {
          onReady: () => {
            isReady = true;
            if (onReadyCallback) onReadyCallback();
            resolve();
          },
          onStateChange: (event) => {
            if (onStateChangeCallback) onStateChangeCallback(event.data);
          }
        }
      });
    });
  }

  function play() {
    if (isReady) player.playVideo();
  }

  function pause() {
    if (isReady) player.pauseVideo();
  }

  function togglePlay() {
    if (!isReady) return;
    const state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }

  function isPlaying() {
    if (!isReady) return false;
    return player.getPlayerState() === YT.PlayerState.PLAYING;
  }

  function seek(seconds) {
    if (!isReady) return;
    const current = player.getCurrentTime();
    const target = Math.max(0, current + seconds);
    player.seekTo(target, true);
  }

  function setSpeed(rate) {
    if (isReady) player.setPlaybackRate(rate);
  }

  function getSpeed() {
    if (!isReady) return 1;
    return player.getPlaybackRate();
  }

  function getCurrentSpeed() {
    return getSpeed();
  }

  function getNextSpeed(direction) {
    const current = getSpeed();
    const idx = SPEEDS.indexOf(current);
    if (idx === -1) return current;
    const next = idx + direction;
    if (next >= 0 && next < SPEEDS.length) return SPEEDS[next];
    return current;
  }

  function onReady(cb) { onReadyCallback = cb; }
  function onStateChange(cb) { onStateChangeCallback = cb; }

  return {
    extractVideoId,
    init,
    play,
    pause,
    togglePlay,
    isPlaying,
    seek,
    setSpeed,
    getSpeed,
    getCurrentSpeed,
    getNextSpeed,
    onReady,
    onStateChange,
    SPEEDS
  };
})();
