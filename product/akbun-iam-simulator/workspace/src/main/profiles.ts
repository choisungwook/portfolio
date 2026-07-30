import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export interface AwsProfile {
  name: string;
  // 아래 값들은 config에 없으면 빈 문자열이다. 화면은 빈 값을 -로 그린다.
  region: string;
  roleArn: string;
  sourceProfile: string;
  ssoSession: string;
  // credentials 파일에 access key가 있는 profile인가.
  hasCredentials: boolean;
}

interface IniSection {
  name: string;
  entries: Record<string, string>;
}

/**
 * AWS config/credentials가 쓰는 단순 INI를 파싱한다.
 * 섹션 헤더와 key = value만 다루고 주석(#, ;)과 빈 줄은 버린다.
 */
export function parseIni(text: string): IniSection[] {
  const sections: IniSection[] = [];
  let current: IniSection | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;

    const header = line.match(/^\[(.+)\]$/);
    if (header) {
      current = { name: header[1].trim(), entries: {} };
      sections.push(current);
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1 || current === null) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key !== "") current.entries[key] = value;
  }
  return sections;
}

/** config 파일의 섹션 이름은 "profile <이름>" 형식이고 default만 예외다. */
function configSectionToProfileName(sectionName: string): string | null {
  if (sectionName === "default") return "default";
  const match = sectionName.match(/^profile\s+(.+)$/);
  return match ? match[1] : null;
}

/**
 * config와 credentials 본문을 합쳐 profile 목록을 만든다.
 * 두 파일 중 한쪽에만 있는 profile도 목록에 넣는다. default가 맨 앞, 나머지는 이름순이다.
 */
export function mergeProfiles(configText: string, credentialsText: string): AwsProfile[] {
  const byName = new Map<string, AwsProfile>();

  const emptyProfile = (name: string): AwsProfile => ({
    name,
    region: "",
    roleArn: "",
    sourceProfile: "",
    ssoSession: "",
    hasCredentials: false,
  });

  for (const section of parseIni(configText)) {
    const name = configSectionToProfileName(section.name);
    if (name === null) continue;
    const profile = byName.get(name) ?? emptyProfile(name);
    profile.region = section.entries["region"] ?? profile.region;
    profile.roleArn = section.entries["role_arn"] ?? profile.roleArn;
    profile.sourceProfile = section.entries["source_profile"] ?? profile.sourceProfile;
    profile.ssoSession = section.entries["sso_session"] ?? profile.ssoSession;
    byName.set(name, profile);
  }

  for (const section of parseIni(credentialsText)) {
    const profile = byName.get(section.name) ?? emptyProfile(section.name);
    if (section.entries["aws_access_key_id"] !== undefined) profile.hasCredentials = true;
    byName.set(section.name, profile);
  }

  return [...byName.values()].sort((a, b) => {
    if (a.name === "default") return -1;
    if (b.name === "default") return 1;
    return a.name.localeCompare(b.name);
  });
}

/** 파일이 없으면 빈 문자열로 취급한다. 두 파일 다 없으면 빈 목록이 된다. */
async function readFileOrEmpty(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

/** ~/.aws/config와 ~/.aws/credentials에서 profile 목록을 읽는다. */
export async function loadProfiles(): Promise<AwsProfile[]> {
  const awsDir = path.join(os.homedir(), ".aws");
  const [configText, credentialsText] = await Promise.all([
    readFileOrEmpty(path.join(awsDir, "config")),
    readFileOrEmpty(path.join(awsDir, "credentials")),
  ]);
  return mergeProfiles(configText, credentialsText);
}
