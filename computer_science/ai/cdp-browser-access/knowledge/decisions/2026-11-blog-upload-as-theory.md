---
type: Decision
title: 블로그 업로드 시나리오는 실습 없이 설계 검토로 둔다
description: 시나리오 4는 실제 블로그에서 실행하지 않고, CDP 명세와 설치된 확장 번들에서 확인한 사실만 근거로 쓰고 편집기 구조는 추정으로 표시한다.
tags: [cdp, file-upload, blog-editor]
generated: { by: claude-code/claude-opus-5-5, at: 2026-11-14T00:00:00Z }
---

## 결정

시나리오 4(블로그 글·사진 업로드)는 실습 절차 대신 "이론상 절차"로 쓰고 출력을 싣지 않는다. 확인한 사실은 두 가지로 한정한다. 하나는 CDP 명세의 file chooser 관련 명령이고, 다른 하나는 [설치 파일 검증 결정](2026-11-verify-products-by-installed-files.md)과 같은 방식으로 확장 번들을 `grep`해 얻은 업로드 구현 차이다. Codex Chrome 확장은 `Page.setInterceptFileChooserDialog`와 `DOM.setFileInputFiles`를 쓰고, Claude in Chrome 확장의 `file_upload`는 페이지 안에서 `DataTransfer`로 `input.files`를 채운다. 네이버 블로그·티스토리·워드프레스 편집기 구조는 추정이라고 문서에 적는다.

## 이유

실습하려면 실제 블로그 계정과 로그인 세션이 필요하고, 공개 저장소에 계정이나 블로그 주소를 남길 수 없다. 편집기 화면은 예고 없이 바뀌어 선택자 단위 절차는 재현성을 약속하기 어렵다. 반면 OS 파일 선택창을 우회하는 원리는 편집기와 무관하게 CDP와 웹 API 수준에서 정해지므로 이론으로도 설명할 가치가 있다. 실습을 추가할 때는 로컬에 동작하는 공개 편집기(TinyMCE 데모, 로컬 워드프레스)로 하면 계정 없이 재현할 수 있다.
