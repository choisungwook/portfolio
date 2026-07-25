/**
 * GitHub Release로 배포한 최신 버전을 확인하고, 원하면 dmg를 받아 앱을 교체한다.
 * 이 저장소의 release가 바이너리 저장소이고, tag는 akbun-shadowing-player-v{버전} 형식이다.
 *
 * 서명이 없어 Squirrel.Mac 자동 업데이트는 쓸 수 없다. 대신 dmg를 직접 받아
 * .app 번들을 통째로 바꾼다. 앱이 fetch로 받은 파일에는 quarantine 속성이 붙지 않아
 * Gatekeeper 검사를 거치지 않는다는 점을 이용한다.
 * 자세한 배경은 knowledge/decisions/2026-07-update-download-and-swap.md에 있다.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

const RELEASES_API = "https://api.github.com/repos/choisungwook/portfolio/releases";
const TAG_PREFIX = "akbun-shadowing-player-v";

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

/** dmg를 임시 디렉터리로 받아 저장한 경로를 돌려준다. */
export async function downloadDmg(dmgUrl: string): Promise<string> {
  const response = await fetch(dmgUrl);
  if (!response.ok) throw new Error(`dmg 내려받기 실패: ${response.status}`);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "akbun-shadowing-player-"));
  const dmgPath = path.join(dir, path.basename(new URL(dmgUrl).pathname));
  await fs.writeFile(dmgPath, new Uint8Array(await response.arrayBuffer()));
  return dmgPath;
}

/**
 * 앱이 종료되기를 기다렸다가 .app 번들을 교체하고 다시 실행하는 스크립트다.
 * 실행 중인 자기 자신을 덮어쓸 수 없으므로 앱 밖에서 돌려야 한다.
 * 교체에 실패하면 옮겨 둔 이전 번들을 되돌린다.
 */
const SWAP_SCRIPT = `#!/bin/bash
set -u
APP="$1"; DMG="$2"; PID="$3"
while kill -0 "$PID" 2>/dev/null; do sleep 0.3; done

MOUNT=$(mktemp -d)
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT" || exit 1
NEW=$(find "$MOUNT" -maxdepth 1 -name '*.app' | head -1)
if [ -z "$NEW" ]; then hdiutil detach "$MOUNT" -quiet; exit 1; fi

rm -rf "$APP.old"
mv "$APP" "$APP.old" || { hdiutil detach "$MOUNT" -quiet; exit 1; }
if ditto "$NEW" "$APP"; then
  rm -rf "$APP.old"
else
  rm -rf "$APP"
  mv "$APP.old" "$APP"
  hdiutil detach "$MOUNT" -quiet
  exit 1
fi

hdiutil detach "$MOUNT" -quiet
# 앱이 직접 받은 파일이라 quarantine이 붙지 않지만, dmg에 남아 있던 속성을 확실히 지운다.
xattr -cr "$APP"
open "$APP"
rm -rf "$(dirname "$DMG")"
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
