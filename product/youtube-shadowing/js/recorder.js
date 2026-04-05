/**
 * MediaRecorder wrapper for shadowing recording/playback.
 * Recordings are stored as Blobs in memory (no backend needed).
 */
const RecorderModule = (() => {
  let mediaRecorder = null;
  let audioChunks = [];
  let stream = null;
  let recordings = [];
  let isRecording = false;
  let timerInterval = null;
  let startTime = 0;

  // Request microphone permission and get stream
  async function requestMic() {
    if (stream) return stream;
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    return stream;
  }

  // Start recording
  async function start() {
    const micStream = await requestMic();
    audioChunks = [];

    mediaRecorder = new MediaRecorder(micStream);
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      const timestamp = new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      recordings.push({ blob, url, timestamp, index: recordings.length + 1 });
      audioChunks = [];
    };

    mediaRecorder.start();
    isRecording = true;
    startTime = Date.now();
  }

  // Stop recording, returns the new recording
  function stop() {
    return new Promise((resolve) => {
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }
      const prevLength = recordings.length;
      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const timestamp = new Date().toLocaleTimeString('ko-KR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        const recording = { blob, url, timestamp, index: recordings.length + 1 };
        recordings.push(recording);
        audioChunks = [];
        isRecording = false;
        resolve(recording);
      };
      mediaRecorder.stop();
    });
  }

  function getIsRecording() {
    return isRecording;
  }

  function getRecordings() {
    return recordings;
  }

  function getElapsedTime() {
    if (!isRecording) return '00:00';
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const min = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const sec = String(elapsed % 60).padStart(2, '0');
    return `${min}:${sec}`;
  }

  // Create a download link for a recording
  function download(recording) {
    const a = document.createElement('a');
    a.href = recording.url;
    a.download = `shadowing-${recording.index}-${recording.timestamp.replace(/:/g, '')}.webm`;
    a.click();
  }

  return {
    start,
    stop,
    getIsRecording,
    getRecordings,
    getElapsedTime,
    download
  };
})();
