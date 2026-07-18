/** preload가 노출하는 IPC 브리지 타입. 렌더러 전역에서 쓴다. */

interface ClassStatDto {
  name: string;
  count: number;
  shallow: number;
  retained: number | null;
}

interface LargeObjectDto {
  objId: number;
  className: string;
  shallowSize: number;
}

interface ThreadDto {
  serial: number;
  name: string;
  frames: string[];
}

interface PathStepDto {
  objId: number;
  className: string;
  refName: string;
}

interface AnalyzeResultDto {
  stats: ClassStatDto[];
  large: LargeObjectDto[];
  threads: ThreadDto[];
  objectCount: number;
  rootCount: number;
}

interface PathResultDto {
  target: LargeObjectDto;
  steps: PathStepDto[] | null;
}

interface Window {
  api: {
    openFile(): Promise<string | null>;
    analyze(path: string): Promise<AnalyzeResultDto>;
    pathToRoot(objId: number): Promise<PathResultDto | null>;
    largestPath(className: string): Promise<PathResultDto | null>;
  };
}
