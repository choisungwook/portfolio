/**
 * Cloudflare에 올릴 정적 산출물 dist-web/을 만든다.
 * tsc가 만든 renderer/web js와 static/을 한곳에 모으고 index.html의 script 경로를 웹 기준으로 바꾼다.
 */

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "dist-web");

/** 못 찾으면 빈 페이지가 배포되므로, 치환에 실패하면 빌드를 세운다. */
function replaceOnce(html, from, to) {
  if (!html.includes(from)) throw new Error(`index.html에서 찾지 못했다: ${from}`);
  return html.replace(from, to);
}

async function copyAssets() {
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(path.join(root, "static"), out, { recursive: true });
  await cp(path.join(root, "dist/renderer"), path.join(out, "renderer"), { recursive: true });
  await cp(path.join(root, "assets/icon.png"), path.join(out, "icon.png"));
}

/** 웹 전용 api.js를 쓰면서 설정 화면이 보여줄 버전을 package.json 값으로 박아 넣는다. */
async function writeWebApi() {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf-8"));
  const source = await readFile(path.join(root, "dist/web/api.js"), "utf-8");
  await mkdir(path.join(out, "web"), { recursive: true });
  await writeFile(path.join(out, "web/api.js"), source.replaceAll("__APP_VERSION__", manifest.version));
}

/** Electron은 static/에서, 웹은 사이트 루트에서 문서를 읽으므로 script와 아이콘 경로가 다르다. */
async function rewriteHtml() {
  const file = path.join(out, "index.html");
  let html = await readFile(file, "utf-8");
  html = replaceOnce(
    html,
    '<link rel="stylesheet" href="style.css" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
      '  <link rel="icon" href="icon.png" />\n' +
      '  <link rel="stylesheet" href="style.css" />',
  );
  html = replaceOnce(
    html,
    '<script src="../dist/renderer/waveform.js"></script>',
    '<script src="web/api.js"></script>\n  <script src="renderer/waveform.js"></script>',
  );
  html = replaceOnce(html, "../dist/renderer/renderer.js", "renderer/renderer.js");
  await writeFile(file, html);
}

await copyAssets();
await writeWebApi();
await rewriteHtml();
console.log(`dist-web/ 생성 완료: ${out}`);
