# Native project trash

## Decision

- 프로젝트 삭제는 Rust에서 운영체제 네이티브 휴지통 API 사용
- macOS는 NSFileManager, Windows는 IFileOperation 사용
- Finder·Explorer 자동화, 셸 명령, 웹뷰 파일 시스템 API 사용 금지
- 기본 삭제 대상은 관리형 프로젝트 폴더 전체
- 설정을 끄면 `project.akbunvideo` 작업 파일만 삭제
- 확인창에서 실제 삭제 대상과 유지 대상을 구분해 안내

## Reason

- Windows와 macOS 모두 운영체제의 복구 가능한 삭제 동작 유지
- 권한 요청과 셸 환경 차이 없이 동일한 Rust command 제공
- workspace 바로 아래의 검증된 관리형 프로젝트만 삭제 대상으로 제한
- 외부 원본 미디어는 프로젝트 폴더 밖에 있으므로 항상 유지

## Tradeoffs

- 폴더 삭제 시 프로젝트 파일, 프록시, 렌더를 함께 휴지통으로 이동
- 작업 파일만 삭제하면 프로젝트 폴더, 프록시, 렌더 유지
- Browse로 연 외부 프로젝트는 무관한 상위 폴더 보호를 위해 삭제 불가
