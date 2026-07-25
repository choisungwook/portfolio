/**
 * 목록(library.json)이 디스크의 실제 파일과 어긋나지 않는지 검증한다.
 *
 * 파일은 앱 밖에서 지워지거나 옮겨진다. 목록에만 남은 경로를 그대로 읽으면
 * 재생 화면이 빈 채로 열리므로, 파일 열기 전 검사(missing)와 홈 새로고침
 * 정리(prune)가 실제로 도는지 확인한다.
 *
 * 실행: npm test (dist/를 읽으므로 build가 먼저 돈다)
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { Library } = require("../dist/main/library.js");

/** 빈 userData 디렉터리와 그 안의 Library를 만든다. */
function makeLibrary() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "akbun-shadowing-player-test-"));
  return { dir, library: new Library(dir) };
}

function makeAudioFile(dir, name) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, "audio");
  return filePath;
}

test("missing은 사라진 파일만 참이다", () => {
  const { dir, library } = makeLibrary();
  try {
    const alive = makeAudioFile(dir, "alive.mp3");
    const gone = makeAudioFile(dir, "gone.mp3");
    library.add([alive, gone]);
    fs.rmSync(gone);

    assert.strictEqual(library.missing(alive), false);
    assert.strictEqual(library.missing(gone), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("prune은 사라진 파일만 목록에서 지운다", () => {
  const { dir, library } = makeLibrary();
  try {
    const alive = makeAudioFile(dir, "alive.mp3");
    const gone = makeAudioFile(dir, "gone.mp3");
    library.add([alive, gone]);
    fs.rmSync(gone);

    const items = library.prune();

    assert.deepStrictEqual(
      items.map((item) => item.path),
      [alive],
      "살아 있는 파일만 남아야 한다",
    );
    // 다시 읽어도 지워진 상태여야 한다. prune이 저장하지 않으면 여기서 걸린다.
    assert.strictEqual(new Library(dir).list().length, 1, "prune 결과가 저장되지 않았다");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("prune은 사라진 파일이 없으면 목록을 그대로 둔다", () => {
  const { dir, library } = makeLibrary();
  try {
    library.add([makeAudioFile(dir, "a.mp3"), makeAudioFile(dir, "b.mp3")]);
    assert.strictEqual(library.prune().length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("폴더로 불러온 파일만 folder를 가진다", () => {
  const { dir, library } = makeLibrary();
  try {
    const folder = path.join(dir, "lesson");
    fs.mkdirSync(folder);
    const inFolder = makeAudioFile(folder, "one.mp3");
    const single = makeAudioFile(dir, "single.mp3");

    library.add([inFolder], folder);
    library.add([single]);

    const byPath = Object.fromEntries(library.list().map((item) => [item.path, item.folder]));
    assert.strictEqual(byPath[inFolder], folder);
    assert.strictEqual(byPath[single], undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("파일 열기는 목록에 없거나 사라진 파일을 막는다", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "../dist/main/main.js"), "utf-8");
  const readHandler = mainSource.slice(mainSource.indexOf('"audio:read"'));

  assert.match(readHandler, /library\.has\(/, "목록에 없는 파일 검사가 사라졌다");
  assert.match(readHandler, /library\.missing\(/, "파일 존재 검사가 사라졌다");
});
