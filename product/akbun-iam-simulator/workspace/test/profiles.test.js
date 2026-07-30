// 컴파일된 dist를 대상으로 profile 파싱을 검증한다. npm test가 빌드를 먼저 돈다.
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseIni, mergeProfiles } = require("../dist/main/profiles.js");

const CONFIG_TEXT = `
# 주석은 버린다
[default]
region = ap-northeast-2

[profile admin]
region = us-east-1
role_arn = arn:aws:iam::123456789012:role/admin
source_profile = default

[profile sso-dev]
sso_session = my-sso
region = ap-northeast-2
`;

const CREDENTIALS_TEXT = `
[default]
aws_access_key_id = AKIAEXAMPLE
aws_secret_access_key = secret

[cred-only]
aws_access_key_id = AKIAEXAMPLE2
aws_secret_access_key = secret2
`;

test("parseIni는 섹션과 key=value를 읽고 주석과 빈 줄을 버린다", () => {
  const sections = parseIni(CONFIG_TEXT);
  assert.equal(sections.length, 3);
  assert.equal(sections[0].name, "default");
  assert.equal(sections[0].entries.region, "ap-northeast-2");
  assert.equal(sections[1].name, "profile admin");
  assert.equal(sections[1].entries.role_arn, "arn:aws:iam::123456789012:role/admin");
});

test("mergeProfiles는 config와 credentials를 합치고 default를 맨 앞에 둔다", () => {
  const profiles = mergeProfiles(CONFIG_TEXT, CREDENTIALS_TEXT);
  assert.deepEqual(
    profiles.map((p) => p.name),
    ["default", "admin", "cred-only", "sso-dev"],
  );

  const byName = new Map(profiles.map((p) => [p.name, p]));
  assert.equal(byName.get("default").hasCredentials, true);
  assert.equal(byName.get("admin").roleArn, "arn:aws:iam::123456789012:role/admin");
  assert.equal(byName.get("admin").sourceProfile, "default");
  assert.equal(byName.get("admin").hasCredentials, false);
  assert.equal(byName.get("sso-dev").ssoSession, "my-sso");
  assert.equal(byName.get("cred-only").hasCredentials, true);
  assert.equal(byName.get("cred-only").region, "");
});

test("mergeProfiles는 두 파일이 모두 비어 있으면 빈 목록을 돌려준다", () => {
  assert.deepEqual(mergeProfiles("", ""), []);
});
