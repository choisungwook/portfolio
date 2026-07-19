/** 합성 hprof 파일을 만드는 스크립트. CI 스모크 테스트가 쓴다. */

import { writeSample } from "./synthetic";

writeSample(process.argv[2] ?? "sample.hprof");
