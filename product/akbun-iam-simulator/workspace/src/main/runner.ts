import { exec } from "node:child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
  // 프로세스가 정상 종료하지 못하면(타임아웃 등) -1이다.
  exitCode: number;
  durationMs: number;
}

const TIMEOUT_MS = 120_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

/**
 * 입력이 aws 명령어인지 검증한다. 셸을 거쳐 실행하므로
 * 이 도구의 목적인 aws CLI 실행만 허용해 범위를 좁힌다.
 */
export function assertAwsCommand(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("명령어가 비어 있다: aws로 시작하는 명령어를 입력한다");
  }
  const firstToken = value.trim().split(/\s+/)[0];
  if (firstToken !== "aws") {
    throw new Error(`aws 명령어가 아니다: ${firstToken}. aws로 시작하는 명령어만 실행한다`);
  }
}

/**
 * macOS GUI 앱은 셸 초기화 파일을 거치지 않아 PATH에 homebrew 경로가 없다.
 * aws CLI가 흔히 설치되는 경로를 뒤에 붙인다.
 */
export function buildPath(basePath: string | undefined): string {
  const extras = ["/opt/homebrew/bin", "/usr/local/bin"];
  const parts = (basePath ?? "").split(":").filter((p) => p !== "");
  for (const extra of extras) {
    if (!parts.includes(extra)) parts.push(extra);
  }
  return parts.join(":");
}

/**
 * 고른 profile을 AWS_PROFILE로 넣고 aws 명령어를 셸로 실행한다.
 * 권한이 없으면 aws CLI가 AccessDenied를 stderr로 돌려주므로 실패도 결과로 담는다.
 */
export function runAwsCommand(command: string, profile: string): Promise<RunResult> {
  const startedAt = performance.now();
  const env = {
    ...process.env,
    PATH: buildPath(process.env.PATH),
    AWS_PROFILE: profile,
    // pager가 붙으면 프로세스가 안 끝난다.
    AWS_PAGER: "",
  };

  return new Promise((resolve) => {
    exec(command, { env, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER_BYTES }, (error, stdout, stderr) => {
      const durationMs = Math.round(performance.now() - startedAt);
      let exitCode = 0;
      let stderrText = stderr;
      if (error) {
        exitCode = typeof error.code === "number" ? error.code : -1;
        if (error.killed) {
          stderrText = `${stderr}\n${TIMEOUT_MS / 1000}초 안에 끝나지 않아 중단했다`.trim();
        }
      }
      resolve({ stdout, stderr: stderrText, exitCode, durationMs });
    });
  });
}
