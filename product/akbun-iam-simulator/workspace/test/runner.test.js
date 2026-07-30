// aws 명령어 검증 규칙을 확인한다. 실제 aws CLI 실행은 테스트하지 않는다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { assertAwsCommand, buildPath } = require("../dist/main/runner.js");

test("assertAwsCommand는 aws로 시작하는 명령어를 허용한다", () => {
  assert.doesNotThrow(() => assertAwsCommand("aws sts get-caller-identity"));
  assert.doesNotThrow(() => assertAwsCommand("  aws s3 ls  "));
  assert.doesNotThrow(() => assertAwsCommand("aws iam list-roles\n  --max-items 5"));
});

test("assertAwsCommand는 빈 입력과 aws가 아닌 명령어를 거부한다", () => {
  assert.throws(() => assertAwsCommand(""));
  assert.throws(() => assertAwsCommand("   "));
  assert.throws(() => assertAwsCommand(null));
  assert.throws(() => assertAwsCommand("kubectl get pods"));
  // 앞 토큰이 정확히 aws여야 한다. awsx 같은 유사 명령어는 거부한다.
  assert.throws(() => assertAwsCommand("awsx s3 ls"));
});

test("buildPath는 homebrew 경로를 없을 때만 뒤에 붙인다", () => {
  assert.equal(buildPath("/usr/bin"), "/usr/bin:/opt/homebrew/bin:/usr/local/bin");
  assert.equal(
    buildPath("/usr/bin:/opt/homebrew/bin"),
    "/usr/bin:/opt/homebrew/bin:/usr/local/bin",
  );
  assert.equal(buildPath(undefined), "/opt/homebrew/bin:/usr/local/bin");
});
