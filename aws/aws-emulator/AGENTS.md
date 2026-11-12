# AWS Emulator 핸즈온

AWS Emulator를 Docker로 띄워 같은 boto3 코드를 emulator와 실제 AWS에서 비교하고, 한계와 `aws-emulator` skill의 호환성 점검을 확인하는 workspace다.

글로벌 규칙은 @../../AGENTS.md를 따른다.

## knowledge

이 workspace의 결정 이유는 `knowledge/index.md`에 있다. 고치기 전에 읽고, 어긋나는 concept는 고치거나 지운다. 새로 얻은 결정과 절차는 같은 곳에 남긴다. 형식은 [.claude/rules/knowledge.md](../../.claude/rules/knowledge.md)를 따른다.

## 수정할 때

- 문서의 출력은 v1.0.322(commit `7753983c`) 실측값이다. emulator는 하루에 여러 번 release되므로, 다시 실행해 값이 바뀌면 버전과 함께 고친다
- `app/`에는 호환성 점검 대상인 앱만 둔다. 실험 스크립트는 `probes/`에 둔다. `app/`에 파일이 늘면 점검의 item과 판정이 바뀐다
- `app/.aws-emulator/`는 점검 산출물이라 commit하지 않는다
