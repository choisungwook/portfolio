/**
 * 파형 드래그로 만든 구간이 재생을 막지 않는지 검증한다.
 *
 * 드래그를 곡 밖에서 놓으면 양 끝이 같은 값으로 잘려 0길이 구간이 나온다.
 * 이 구간이 renderer의 반복 조건(currentTime >= loopB)에 들어가면 재생 헤드가
 * 그 지점에 묶여 재생이 멈춘 것처럼 보인다. 캔버스를 띄우지 않고 확인할 수 있게
 * 컴파일 결과에 가드가 남아 있는지만 본다.
 *
 * 실행: npm test (dist/를 읽으므로 build가 먼저 돈다)
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const waveformSource = fs.readFileSync(
  path.join(__dirname, "../dist/renderer/waveform.js"),
  "utf-8",
);

test("0길이 구간을 버리는 가드가 남아 있다", () => {
  assert.match(waveformSource, /MIN_LOOP_SEC/, "최소 구간 길이 기준이 사라졌다");

  const mouseUp = waveformSource.slice(waveformSource.indexOf("onMouseUp"));
  assert.match(mouseUp, /MIN_LOOP_SEC/, "mouseup에서 최소 길이를 검사하지 않는다");
});

test("최소 구간 길이는 0보다 크다", () => {
  const declared = waveformSource.match(/MIN_LOOP_SEC\s*=\s*([\d.]+)/);

  assert.ok(declared, "MIN_LOOP_SEC 선언을 찾을 수 없다");
  assert.ok(Number(declared[1]) > 0, "0길이 구간을 그대로 통과시킨다");
});
