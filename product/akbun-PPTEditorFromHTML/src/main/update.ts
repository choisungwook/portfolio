/**
 * GitHub Release로 배포한 최신 버전을 확인하고, 원하면 dmg를 받아 앱을 교체한다.
 * 배경은 knowledge/decisions/2026-07-release-update-renderer-conventions.md 참조.
 *
 * 서명이 없어 Squirrel.Mac 자동 업데이트는 쓸 수 없다. 대신 dmg를 직접 받아
 * .app 번들을 통째로 바꾼다. 앱이 fetch로 받은 파일에는 quarantine 속성이 붙지 않아
 * Gatekeeper 검사를 거치지 않는다는 점을 이용한다.
 */

import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const RELEASES_API = "https://api.github.com/repos/choisungwook/portfolio/releases";
const TAG_PREFIX = "akbun-PPTEditorFromHTML-v";

export interface UpdateCheck {
  current: string;
  latest: string | null;
  url: string | null;
  /** 현재 아키텍처에 맞는 dmg 내려받기 주소. 없으면 null. */
  dmgUrl: string | null;
  hasUpdate: boolean;
}

/** "0.2.0" 형식 두 개를 비교한다. a가 크면 양수. */
function compareVersion(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) - (right[i] ?? 0);
  }
  return 0;
}

/**
 * 현재 아키텍처에 맞는 dmg를 고른다.
 * electron-builder는 arm64에만 -arm64 접미사를 붙이고 x64는 접미사가 없다.
 */
function pickDmg(assets: { name: string; browser_download_url: string }[]): string | null {
  const dmgs = assets.filter((asset) => asset.name.endsWith(".dmg"));
  const wantArm = process.arch === "arm64";
  const match = dmgs.find((asset) => asset.name.includes("-arm64.") === wantArm);
  return match?.browser_download_url ?? null;
}

export async function checkUpdate(currentVersion: string): Promise<UpdateCheck> {
  const response = await fetch(RELEASES_API, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`GitHub API 응답 오류: ${response.status}`);

  const releases = (await response.json()) as {
    tag_name: string;
    html_url: string;
    assets: { name: string; browser_download_url: string }[];
  }[];
  const release = releases.find((entry) => entry.tag_name.startsWith(TAG_PREFIX));
  if (!release) {
    return { current: currentVersion, latest: null, url: null, dmgUrl: null, hasUpdate: false };
  }

  const latest = release.tag_name.slice(TAG_PREFIX.length);
  return {
    current: currentVersion,
    latest,
    url: release.html_url,
    dmgUrl: pickDmg(release.assets),
    hasUpdate: compareVersion(latest, currentVersion) > 0,
  };
}

/** 내려받기용 임시 디렉터리 접두사. 남은 디렉터리를 찾아 지울 때도 쓴다. */
const TEMP_PREFIX = "akbun-PPTEditorFromHTML-update-";

/**
 * dmg를 임시 디렉터리로 받아 저장한 경로를 돌려준다.
 * 받다가 실패하면 만든 디렉터리를 지운다. dmg가 100MB를 넘으므로
 * 메모리에 통째로 올리지 않고 스트림으로 흘려 쓴다.
 */
export async function downloadDmg(dmgUrl: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  try {
    const response = await fetch(dmgUrl);
    if (!response.ok) throw new Error(`dmg 내려받기 실패: ${response.status}`);
    if (!response.body) throw new Error("dmg 응답 본문이 비어 있다");
    const dmgPath = path.join(dir, path.basename(new URL(dmgUrl).pathname));
    await pipeline(Readable.fromWeb(response.body as ReadableStream), createWriteStream(dmgPath));
    return dmgPath;
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * 이전 시도가 중간에 끊겨 남은 임시 디렉터리를 지운다.
 * 교체 스크립트가 자기 작업 디렉터리를 지우지만, 앱이나 스크립트가 강제 종료되면
 * dmg가 그대로 남는다. 앱 시작 때 한 번 훑어 디스크에 쌓이지 않게 한다.
 */
export async function cleanupTempDirs(): Promise<void> {
  const tmpDir = os.tmpdir();
  const names = await fs.readdir(tmpDir);
  await Promise.all(
    names
      .filter((name) => name.startsWith(TEMP_PREFIX))
      .map((name) => fs.rm(path.join(tmpDir, name), { recursive: true, force: true })),
  );
}

/**
 * 앱이 종료되기를 기다렸다가 .app 번들을 교체하고 다시 실행하는 스크립트다.
 * 실행 중인 자기 자신을 덮어쓸 수 없으므로 앱 밖에서 돌려야 한다.
 * 교체에 실패하면 옮겨 둔 이전 번들을 되돌린다.
 *
 * mount 지점과 dmg를 담은 작업 디렉터리는 trap으로 지운다. 중간에 어느 단계가
 * 실패해도 마운트가 남거나 100MB짜리 dmg가 /tmp에 쌓이지 않게 하기 위함이다.
 */
export const SWAP_SCRIPT = `#!/bin/bash
set -u
APP="$1"; DMG="$2"; PID="$3"
WORK=$(dirname "$DMG")
MOUNT=""

cleanup() {
  if [ -n "$MOUNT" ]; then
    hdiutil detach "$MOUNT" -quiet 2>/dev/null || hdiutil detach "$MOUNT" -force -quiet 2>/dev/null
    rmdir "$MOUNT" 2>/dev/null
  fi
  # 실행 중인 이 스크립트도 WORK 안에 있다. 이미 열린 파일이라 지워도 계속 돈다.
  rm -rf "$WORK"
}
trap cleanup EXIT

while kill -0 "$PID" 2>/dev/null; do sleep 0.3; done

MOUNT=$(mktemp -d) || exit 1
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT" || exit 1
NEW=$(find "$MOUNT" -maxdepth 1 -name '*.app' | head -1)
[ -n "$NEW" ] || exit 1

rm -rf "$APP.old"
mv "$APP" "$APP.old" || exit 1
if ditto "$NEW" "$APP"; then
  rm -rf "$APP.old"
else
  rm -rf "$APP"
  mv "$APP.old" "$APP"
  exit 1
fi

# 앱이 직접 받은 파일이라 quarantine이 붙지 않지만, dmg에 남아 있던 속성을 확실히 지운다.
xattr -cr "$APP"
open "$APP"
`;

/**
 * 교체 스크립트를 앱과 분리된 프로세스로 띄운다.
 * 호출한 쪽은 곧바로 app.quit()을 해야 스크립트가 교체를 시작한다.
 */
export async function spawnSwap(appPath: string, dmgPath: string): Promise<void> {
  const scriptPath = path.join(path.dirname(dmgPath), "swap.sh");
  await fs.writeFile(scriptPath, SWAP_SCRIPT, { mode: 0o755 });
  const child = spawn("/bin/bash", [scriptPath, appPath, dmgPath, String(process.pid)], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
}
