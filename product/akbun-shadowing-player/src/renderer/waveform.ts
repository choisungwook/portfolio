/**
 * 파형 캔버스. 디코딩된 AudioBuffer에서 peak를 미리 계산해 두고,
 * 확대/스크롤 가능한 파형과 재생 헤드, 구간 반복(A-B) 영역을 그린다.
 *
 * 마우스 조작:
 * - 왼쪽 버튼을 누른 채 좌우로 끌면 파형이 스크롤된다.
 * - 끌지 않고 누르면(클릭) 그 지점부터 재생한다 (onSeek 콜백).
 */
class Waveform {
  /** peak 1블록이 담는 샘플 수. 그리기 성능과 해상도의 절충값. */
  private static readonly BLOCK_SAMPLES = 256;
  private static readonly MIN_PPS = 10;
  private static readonly MAX_PPS = 800;
  /** 이 픽셀 이상 움직이면 클릭이 아니라 드래그로 본다. */
  private static readonly DRAG_THRESHOLD_PX = 5;

  readonly duration: number;
  onSeek: ((timeSec: number) => void) | null = null;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** 블록별 [min, max] 를 번갈아 담는다. */
  private readonly peaks: Float32Array;
  private readonly blocksPerSecond: number;

  private pixelsPerSecond = 100;
  private viewStartSec = 0;
  private playheadSec = 0;
  private loopA: number | null = null;
  private loopB: number | null = null;

  /** style.css의 --wave-* 값을 캐시한다. canvas는 CSS를 못 쓰므로 직접 읽어 온다. */
  private colors = Waveform.readColors();

  private dragging = false;
  private dragMoved = false;
  private dragStartX = 0;
  private dragStartViewSec = 0;
  private readonly resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, buffer: AudioBuffer) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.duration = buffer.duration;
    this.peaks = Waveform.computePeaks(buffer);
    this.blocksPerSecond = buffer.sampleRate / Waveform.BLOCK_SAMPLES;
    this.bindMouse();
    this.resizeObserver = new ResizeObserver(() => this.resizeAndDraw());
    this.resizeObserver.observe(canvas.parentElement!);
    this.resizeAndDraw();
  }

  /** 등록한 리스너와 observer를 해제한다. 화면 전환으로 인스턴스를 버릴 때 호출한다. */
  dispose(): void {
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.resizeObserver.disconnect();
  }

  private static readColors(): Record<string, string> {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string): string => style.getPropertyValue(name).trim();
    return {
      fill: read("--wave-fill"),
      grid: read("--wave-grid"),
      gridText: read("--wave-grid-text"),
      loop: read("--wave-loop"),
      marker: read("--wave-marker"),
      playhead: read("--wave-playhead"),
    };
  }

  /** 테마가 바뀌면 캐시한 색을 다시 읽고 그린다. */
  refreshColors(): void {
    this.colors = Waveform.readColors();
    this.draw();
  }

  /** 채널을 평균 낸 모노 신호에서 블록별 min/max를 뽑는다. */
  private static computePeaks(buffer: AudioBuffer): Float32Array {
    const channels: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
    const blockCount = Math.ceil(buffer.length / Waveform.BLOCK_SAMPLES);
    const peaks = new Float32Array(blockCount * 2);
    for (let block = 0; block < blockCount; block++) {
      let min = 1;
      let max = -1;
      const start = block * Waveform.BLOCK_SAMPLES;
      const end = Math.min(start + Waveform.BLOCK_SAMPLES, buffer.length);
      for (let i = start; i < end; i++) {
        let sample = 0;
        for (const channel of channels) sample += channel[i];
        sample /= channels.length;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      peaks[block * 2] = min;
      peaks[block * 2 + 1] = max;
    }
    return peaks;
  }

  setPlayhead(timeSec: number): void {
    this.playheadSec = timeSec;
    this.draw();
  }

  setLoop(a: number | null, b: number | null): void {
    this.loopA = a;
    this.loopB = b;
    this.draw();
  }

  /** 재생 중 재생 헤드가 화면 밖으로 나가면 따라가도록 스크롤한다. */
  followPlayhead(): void {
    if (this.dragging) return;
    const viewWidthSec = this.viewWidthSec();
    const rightEdge = this.viewStartSec + viewWidthSec * 0.92;
    if (this.playheadSec > rightEdge || this.playheadSec < this.viewStartSec) {
      this.setViewStart(this.playheadSec - viewWidthSec * 0.08);
    }
  }

  zoom(factor: number): void {
    const centerSec = this.viewStartSec + this.viewWidthSec() / 2;
    this.pixelsPerSecond = Math.min(
      Waveform.MAX_PPS,
      Math.max(Waveform.MIN_PPS, this.pixelsPerSecond * factor),
    );
    this.setViewStart(centerSec - this.viewWidthSec() / 2);
    this.draw();
  }

  private viewWidthSec(): number {
    return this.canvas.clientWidth / this.pixelsPerSecond;
  }

  private setViewStart(sec: number): void {
    const maxStart = Math.max(0, this.duration - this.viewWidthSec());
    this.viewStartSec = Math.min(maxStart, Math.max(0, sec));
  }

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    this.dragging = true;
    this.dragMoved = false;
    this.dragStartX = event.clientX;
    this.dragStartViewSec = this.viewStartSec;
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.dragging) return;
    const dx = event.clientX - this.dragStartX;
    if (Math.abs(dx) > Waveform.DRAG_THRESHOLD_PX) this.dragMoved = true;
    if (!this.dragMoved) return;
    this.setViewStart(this.dragStartViewSec - dx / this.pixelsPerSecond);
    this.draw();
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.dragMoved) return;
    const rect = this.canvas.getBoundingClientRect();
    const timeSec = this.viewStartSec + (event.clientX - rect.left) / this.pixelsPerSecond;
    if (timeSec >= 0 && timeSec <= this.duration && this.onSeek) this.onSeek(timeSec);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const delta = event.deltaX !== 0 ? event.deltaX : event.deltaY;
    this.setViewStart(this.viewStartSec + delta / this.pixelsPerSecond);
    this.draw();
  };

  private bindMouse(): void {
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mouseup", this.onMouseUp);
    // preventDefault로 페이지 스크롤을 막아야 하므로 passive를 명시적으로 끈다.
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  private resizeAndDraw(): void {
    const parent = this.canvas.parentElement!;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = parent.clientWidth * ratio;
    this.canvas.height = parent.clientHeight * ratio;
    this.canvas.style.width = `${parent.clientWidth}px`;
    this.canvas.style.height = `${parent.clientHeight}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.setViewStart(this.viewStartSec);
    this.draw();
  }

  private draw(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.ctx.clearRect(0, 0, width, height);
    this.drawLoopRegion(height);
    this.drawBars(width, height);
    this.drawTimeGrid(width, height);
    this.drawMarker(this.loopA, this.colors.marker, height, "A");
    this.drawMarker(this.loopB, this.colors.marker, height, "B");
    this.drawMarker(this.playheadSec, this.colors.playhead, height, null);
  }

  private drawBars(width: number, height: number): void {
    const middle = height / 2;
    this.ctx.fillStyle = this.colors.fill;
    for (let x = 0; x < width; x++) {
      const t0 = this.viewStartSec + x / this.pixelsPerSecond;
      const t1 = t0 + 1 / this.pixelsPerSecond;
      const firstBlock = Math.floor(t0 * this.blocksPerSecond);
      const lastBlock = Math.min(
        Math.max(firstBlock + 1, Math.ceil(t1 * this.blocksPerSecond)),
        this.peaks.length / 2,
      );
      if (firstBlock >= this.peaks.length / 2) break;
      let min = 1;
      let max = -1;
      for (let block = firstBlock; block < lastBlock; block++) {
        if (this.peaks[block * 2] < min) min = this.peaks[block * 2];
        if (this.peaks[block * 2 + 1] > max) max = this.peaks[block * 2 + 1];
      }
      const top = middle - max * middle * 0.95;
      const bottom = middle - min * middle * 0.95;
      this.ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
    }
  }

  private drawTimeGrid(width: number, height: number): void {
    const stepSec = this.pickGridStep();
    this.ctx.fillStyle = this.colors.gridText;
    this.ctx.strokeStyle = this.colors.grid;
    this.ctx.font = "11px sans-serif";
    const first = Math.ceil(this.viewStartSec / stepSec) * stepSec;
    for (let t = first; t <= this.viewStartSec + width / this.pixelsPerSecond; t += stepSec) {
      const x = (t - this.viewStartSec) * this.pixelsPerSecond;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, height);
      this.ctx.stroke();
      this.ctx.fillText(formatTime(t), x + 4, 14);
    }
  }

  private pickGridStep(): number {
    const candidates = [0.5, 1, 2, 5, 10, 30, 60, 120, 300];
    for (const step of candidates) {
      if (step * this.pixelsPerSecond >= 70) return step;
    }
    return 600;
  }

  private drawLoopRegion(height: number): void {
    if (this.loopA === null || this.loopB === null) return;
    const x0 = (this.loopA - this.viewStartSec) * this.pixelsPerSecond;
    const x1 = (this.loopB - this.viewStartSec) * this.pixelsPerSecond;
    this.ctx.fillStyle = this.colors.loop;
    this.ctx.fillRect(x0, 0, x1 - x0, height);
  }

  private drawMarker(timeSec: number | null, color: string, height: number, label: string | null): void {
    if (timeSec === null) return;
    const x = (timeSec - this.viewStartSec) * this.pixelsPerSecond;
    if (x < 0 || x > this.canvas.clientWidth) return;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, 0, 2, height);
    if (label) {
      this.ctx.font = "bold 12px sans-serif";
      this.ctx.fillText(label, x + 5, height - 8);
    }
  }
}

/** 초를 m:ss 또는 h:mm:ss 문자열로 바꾼다. */
function formatTime(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const mmss = `${m}:${String(s).padStart(2, "0")}`;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : mmss;
}
