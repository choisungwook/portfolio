---
type: Decision
title: Obsidian 테마 소스는 모노repo, community 목록은 mirror repo
description: Obsidian community 디렉터리는 repo root의 manifest.json만 읽으므로 소스는 여기 두고 release가 전용 repo로 복사한다.
tags: [obsidian, release, workflow]
timestamp: 2026-09-10T00:00:00Z
---

## 결정

테마 소스는 `product/akbun-obsidian-theme/workspace/`에 두고, master push release가 `manifest.json`과 `theme.css`를 이 저장소 release에 첨부한다. 같은 단계가 `OBSIDIAN_THEME_REPO_TOKEN` secret이 있을 때만 `choisungwook/akbun-obsidian-theme` root로 파일을 복사하고 `<version>` tag의 release를 만든다.

## 이유

- Obsidian 자체는 `.obsidian/themes/<name>/`에 두 파일만 있으면 되므로 수동 설치와 release 다운로드는 모노repo로 충분하다.
- community 디렉터리는 default branch HEAD의 repo root `manifest.json`을 읽고, `version`과 같은 tag의 release에서 두 파일을 받으며, 등록 항목의 repo 필드는 `owner/repo`뿐이라 하위 경로를 줄 수 없다.
- 두 파일짜리 제품을 위해 소스를 밖으로 옮기면 이 저장소의 규칙과 workflow를 잃는다. mirror는 release 단계가 만들므로 손으로 어긋날 일이 없다.

## Citations

1. Obsidian developer docs, Themes, Submit your theme
2. obsidianmd/obsidian-releases community-css-themes.json의 repo 필드 형식
