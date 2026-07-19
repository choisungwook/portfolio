/** GUI 없이 텍스트 리포트를 출력하는 CLI. CI 스모크 테스트에도 쓴다. */

import { parseHprof } from "./core/parser";
import { renderReport } from "./core/report";

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("사용법: node dist/cli.js <dump.hprof>");
    process.exitCode = 2;
    return;
  }
  console.log(renderReport(parseHprof(path)));
}

main();
