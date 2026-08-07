# Knowledge Update Log

## 2026-08-07

* **Creation**: [move 클로저가 필드 이름을 대면 Send는 wrapper에 남고 클로저는 필드만 가져간다](topics/move-closure-captures-the-field-not-the-wrapper.md) topic 기록. akbun-makevideo의 release 빌드가 unsafe impl Send를 붙여 둔 wrapper를 두고 안쪽 NonNull을 지목하며 실패해, 원인이 wrapper가 아니라 edition 2021의 캡처 단위였다는 것을 남긴다.
* **Creation**: [업데이트 서명 불일치는 서명과 pubkey의 key ID를 뽑아 갈라낸다](topics/tauri-updater-key-id-mismatch.md) topic 기록. akbun-makevideo의 업데이트 실패를 짐작으로 재배포하지 않고 판정하려다, 읽을 수 없는 secret을 두고도 minisign key ID로 서명한 키와 신뢰하는 키를 비교할 수 있다는 것을 알게 되어 남긴다.
* **Creation**: [늦은 프레임은 그리지 않고 건너뛰며, 디코더를 되돌리지 않는다](decisions/2026-08-late-frames-are-skipped-not-drawn.md) 결정 기록. akbun-makevideo의 프레임 소스와 오디오 클럭을 화면에 잇는 단계에서, 판정을 하네스에만 맡긴 덕에 눈으로는 찾지 못했을 결함 세 가지를 찾은 것을 함께 남긴다.
* **Creation**: [재생 시각의 기준은 오디오 출력이고 영상이 그것을 따라간다](decisions/2026-08-audio-is-the-master-clock.md) 결정 기록. akbun-makevideo에 오디오 엔진을 넣으면서, seek가 함수 호출이 아니라 메시지라 요청 직후에도 링버퍼는 이전 위치로 가득 차 있다는 것과, 링버퍼를 비울 수 있는 쪽이 소비자뿐이라 seek가 정리되는 동안에도 재생 쪽이 계속 버퍼를 요청해야 한다는 것을 함께 남긴다.

## 2026-08-06

* **Creation**: [멀티 제품 저장소의 What's Changed는 제품 접두사로 이전 tag를 고정한다](decisions/2026-08-whats-changed-previous-tag-scoped.md) 결정 기록. akbun-requesthttp의 release workflow를 makepresentation에서 복사하다가, generate-notes의 이전 tag 자동 선택이 멀티 제품 저장소에서는 남의 제품 tag를 고른다는 것을 알게 되어 남긴다.

## 2026-08-04

* **Creation**: [계측 하네스는 자기 지연과 재시작 지연을 대상의 실패로 세지 않는다](decisions/2026-08-harness-does-not-count-its-own-delay.md) 결정 기록. akbun-makevideo의 프레임 공급 계측을 만들면서, 처음 나온 300 프레임 중 126개 지연이 대부분 하네스의 sleep 오차와 seek 재충전이었다는 것을 알게 되어 남긴다.
* **Creation**: [브라우저에서 SVG를 PNG로 내보내려면 다이어그램을 더 단순하게 그린다](decisions/2026-08-svg-to-png-needs-a-plainer-svg.md) 결정 기록. akbun-rendermermaid의 PNG 저장을 만들다가 mermaid 기본값으로는 글자가 하나도 없는 PNG가 나온다는 것을 알게 되면서, 미리보기 품질을 먼저 포기해야 저장물이 맞는다는 것까지 함께 남긴다.
* **Creation**: [편집 모델은 backend가 소유하고 편집은 역연산을 가진 명령으로 표현한다](decisions/2026-08-edit-model-owned-by-the-backend.md) 결정 기록. akbun-makevideo의 편집 모델을 Rust로 옮기면서, 소유권을 옮긴 진짜 이유가 정리가 아니라 재생 엔진이라는 것과 "드래그는 다음 프레임에 답해야 한다"는 이전 근거를 버리지 않고 드래그만 페이지에 남긴 경계를 함께 남긴다.
* **Creation**: [영상 편집 도구의 시간은 프레임 수와 두 정수 rate로 표현한다](decisions/2026-08-rational-time-model.md) 결정 기록. akbun-makevideo에 29.97과 23.976을 넣으려다 frame rate가 u32라 표현할 방법 자체가 없다는 것을 알게 되면서, 밀리초 왕복이 정확할 것이라 기대했다가 반 프레임 양자화를 다시 배운 것까지 함께 남긴다.
* **Update**: [서명 없는 데스크톱 앱의 자동 업데이트는 dmg를 받아 번들을 교체한다](decisions/2026-07-unsigned-desktop-app-self-update.md)에 규칙의 자리를 옮긴 이유를 추가했다. akbun-gitdesktop에 업데이트를 넣으면서, 제품 생성 명령에만 있던 요구사항이 이미 있는 앱에는 한 번도 닿지 않는다는 것을 알게 되어 stack 규칙으로 올린다.

## 2026-08-03

* **Creation**: [화살표 선분은 둥근 마감을 쓰지 않고 머리 길이를 화살표 길이로 제한한다](decisions/2026-08-arrow-shaft-square-cap.md) 결정 기록. akbun-makepresentation에서 화살표 끝에 점이 붙는다는 보고를 받고 고치다가, 같은 판단이 akbun-screenshot Issue #617의 ADR에만 남아 있어 두 번째로 만난 것을 알게 되면서 남긴다.

## 2026-08-02

* **Creation**: [pptx import는 OOXML을 직접 파싱하고 검증은 생성기가 다른 corpus로 한다](decisions/2026-08-pptx-import-parses-ooxml-directly.md) 결정 기록. PowerPoint 덱 import가 깨지던 akbun-makepresentation을 고치면서, 단일 샘플 검증이 흰 배경과 16:9에 과적합해 두 구멍을 놓쳤던 경험을 함께 남긴다.
* **Creation**: [hidden 속성으로 감추는 패널은 자기 display 규칙에 조용히 진다](topics/hidden-attribute-loses-to-display.md) topic 기록. akbun-makepresentation에 폰트 선택을 넣다가 속성 패널이 처음부터 한 번도 감춰지지 않았다는 것을 발견하면서 남긴다.
* **Update**: [Tauri 앱의 썸네일은 webview가 그리고 Rust는 바이트만 저장한다](decisions/2026-08-thumbnails-in-the-webview.md)에 canvas taint 지뢰를 추가했다. asset protocol은 다른 origin이라 crossOrigin 없이 그리면 toBlob이 실패하고, 첫 출시 버전의 썸네일 캐시가 이것 때문에 통째로 동작하지 않았다.
* **Creation**: [핸즈온은 terraform으로 기반까지만 만들고 학습 대상은 console에서 조작한다](decisions/2026-08-handson-terraform-base-console-operation.md) 결정 기록. ECS quickstart 핸즈온을 만들며 정한 경계와, console에서 만든 service가 terraform state 밖에 있어 ECS Exec을 CLI로만 켤 수 있었던 비용을 함께 남긴다.

## 2026-08-01

* **Creation**: [Tauri 앱의 썸네일은 webview가 그리고 Rust는 바이트만 저장한다](decisions/2026-08-thumbnails-in-the-webview.md) 결정 기록. akbun-folderview에 썸네일 캐시를 넣어 외장하드 시작 멈춤을 고치면서 남긴다.

## 2026-07-31

* **Creation**: [PR body 형식의 기준은 pull request template 하나다](decisions/2026-07-pr-body-format-in-template.md) 결정 기록. PR body를 Decisions와 Implementation으로 바꾸면서 형식이 네 파일에 흩어져 있던 문제를 함께 정리한다.
* **Creation**: [Electron 메뉴바 앱은 창 정리와 메뉴바 공간에서 조용히 실패한다](topics/electron-menubar-silent-failures.md) topic 기록. akbun-screenshot의 프리뷰 창이 화면 밖으로 밀려나던 버그를 고치면서 남기고, tray가 안 보일 때의 정확한 판정 기준을 아래 topic으로 연결한다.
* **Creation**: [macOS 메뉴바 status item은 넓은 자리 차지로만 가릴 수 있고, 노치 뒤에서는 좌표가 있어도 그려지지 않는다](topics/macos-menubar-status-items.md) topic 작성. akbun-mactaskbar를 만들며 실측한 제약과 우회 방법을 남기고, 같은 날 Swift로 다시 만들면서 노치 아래 배치와 네이티브 측정값을 더한다.
* **Creation**: [서명 없는 데스크톱 앱의 자동 업데이트는 dmg를 받아 번들을 교체한다](decisions/2026-07-unsigned-desktop-app-self-update.md) 결정 기록. 세 번째 제품에 같은 구현을 포팅하면서 제품 생성 규칙으로 옮긴다.

## 2026-07-29

* **Creation**: [GitHub App installation tokens as the recommended auth for the terraform bot](decisions/2026-07-github-app-tokens-for-terraform-bot.md) 결정 기록. akbun-terraform-apply-remote에 GitHub App 인증과 import 명령을 추가하면서 남긴다.
* **Creation**: [Deploys drain in-flight runs and hand state over via disk](decisions/2026-07-deploy-drain-and-persisted-takeover.md) 결정 기록. akbun-terraform-apply-remote에 graceful drain, 상태 영속화, EC2/ECS 배포 스택을 추가하면서 남긴다.
* **Creation**: [Apply only the saved plan file, never a fresh plan](decisions/2026-07-terraform-apply-saved-plan.md) 결정 기록. akbun-terraform-apply-remote 제품을 만들면서 남긴다.
* **Creation**: [Rust with a small synchronous stack for the terraform PR server](decisions/2026-07-rust-sync-stack-for-webhook-server.md) 결정 기록. 같은 작업에서 기술 스택 선택 이유를 남긴다.

## 2026-07-28

* **Creation**: [규칙 문서는 도구 중립으로 쓰고 상시 로드 비용으로 정리한다](decisions/2026-07-agents-md-tool-neutral.md) 결정 기록. AGENTS.md 정리와 `.claude/rules/terraform.md`의 코드 템플릿 제거와 함께 남긴다.
* **Update**: [ElastiCache는 Valkey + RBAC/IAM 기본](decisions/2026-07-elasticache-valkey-rbac.md)에서 terraform 규칙의 HCL 패턴을 가리키던 문장을 갱신했다. 해당 HCL 블록이 규칙 문장으로 대체됐다.

## 2026-07-27

* **Creation**: [Karpenter over-provisioning은 음수 우선순위 placeholder로 노드를 미리 잡아 둔다](topics/karpenter-overprovisioning.md) topic 작성. akbun-k8supgradeview에 over-provisioning manifest 생성 기능을 넣으면서 남긴다.

## 2026-07-25

* **Creation**: [Electron 릴리스 빌드는 macOS만](decisions/2026-07-electron-release-macos-only.md) 결정 기록. akbun-gitdesktop 릴리스 workflow의 Windows checkout 실패 수정과 함께 남긴다.
* **Creation**: [릴리스 버전은 태그에서 계산한다](decisions/2026-07-release-version-from-tags.md) 결정 기록. akbun-gitdesktop 릴리스 workflow를 태그 기반 patch 자동 증가로 바꾸면서 남긴다.
* **Creation**: [릴리스는 빌드 성공 뒤에 tag, tag 뒤에 release](decisions/2026-07-build-before-tag-and-release.md) 결정 기록. akbun-shadowing-player 릴리스 workflow의 job 순서를 바꾸면서 남긴다.

## 2026-07-11

* **Creation**: [ElastiCache는 Valkey + RBAC/IAM 기본](decisions/2026-07-elasticache-valkey-rbac.md) 결정 기록. `.claude/rules/terraform.md`에 ElastiCache 규칙(Valkey 엔진, RBAC user group, IAM 인증, TLS/암호화) 추가와 함께 남긴다.

## 2026-07-10

* **Initialization**: OKF 0.1 기반 knowledge 번들 생성.
* **Creation**: [OKF 기반 knowledge 번들 도입](decisions/2026-07-adopt-okf-knowledge-bundle.md) 결정 기록.
* **Creation**: [AGENTS.md 단일 진입점](decisions/2026-07-agents-md-single-entrypoint.md) 결정 기록.
* **Creation**: [Issue는 PR 생성 시점에 작성](decisions/2026-07-issue-at-pr-time.md) 결정 기록.
* **Creation**: [새 핸즈온 추가 절차](playbooks/add-new-hands-on.md) playbook 작성.
* **Creation**: [OKF v0.1 스펙 사본](references/okf-spec-0.1.md) 저장. 외부 링크 의존을 제거하고 로컬 사본을 참조한다.
