# akbun-storyboard 사용자 매뉴얼

akbun-storyboard는 영상 한 편을 씬 단위로 계획하는 도구다. 씬마다 스케치나 사진, 내레이션, 화면에 보일 내용, 촬영·녹화 메모를 적고, 프로젝트 단위로 배경음악과 효과음, 아이디어, 댓글을 함께 관리한다. 사람은 브라우저 화면에서 편집하고, AI agent(Claude, Codex, Gemini)는 같은 데이터를 MCP나 CLI로 고친다. 누가 고치든 열려 있는 브라우저에 2초 안에 반영된다.

이 문서는 하고 싶은 일(시나리오)별로 따라 할 수 있게 썼다. 처음이라면 "설치와 첫 실행"과 "화면 구성"을 읽고, 그다음은 필요한 시나리오만 골라 읽으면 된다.

## 목차

- [설치와 첫 실행](#설치와-첫-실행)
- [화면 구성과 용어](#화면-구성과-용어)
- [시나리오 1. 빈 프로젝트에서 스토리보드 만들기](#시나리오-1-빈-프로젝트에서-스토리보드-만들기)
- [시나리오 2. 스킬이 만든 스토리보드를 가져와 다듬기](#시나리오-2-스킬이-만든-스토리보드를-가져와-다듬기)
- [시나리오 3. 아이패드 스케치나 사진을 씬에 붙이기](#시나리오-3-아이패드-스케치나-사진을-씬에-붙이기)
- [시나리오 4. 대본만 빠르게 읽고 고치기](#시나리오-4-대본만-빠르게-읽고-고치기)
- [시나리오 5. 배경음악과 효과음 목록 정리하기](#시나리오-5-배경음악과-효과음-목록-정리하기)
- [시나리오 6. 아이디어를 모아 두었다가 씬으로 만들기](#시나리오-6-아이디어를-모아-두었다가-씬으로-만들기)
- [시나리오 7. AI에게 수정을 맡기고 댓글로 리뷰하기](#시나리오-7-ai에게-수정을-맡기고-댓글로-리뷰하기)
- [시나리오 8. 프로젝트 저장, 열기, 삭제, 다른 컴퓨터로 옮기기](#시나리오-8-프로젝트-저장-열기-삭제-다른-컴퓨터로-옮기기)
- [시나리오 9. 디스크 용량 관리하기](#시나리오-9-디스크-용량-관리하기)
- [시나리오 10. 보드 전체를 문서로 추출해 AI나 동료에게 넘기기](#시나리오-10-보드-전체를-문서로-추출해-ai나-동료에게-넘기기)
- [CLI 빠른 참조](#cli-빠른-참조)
- [키보드와 작은 요령](#키보드와-작은-요령)
- [문제 해결](#문제-해결)

## 설치와 첫 실행

### 내려받기

[릴리스 페이지](https://github.com/choisungwook/portfolio/releases?q=akbun-storyboard)에서 내 컴퓨터에 맞는 압축 파일을 받는다.

| 컴퓨터 | 파일 |
|---|---|
| Apple Silicon Mac (M1 이후) | `akbun-storyboard-aarch64-apple-darwin.tar.gz` |
| Intel Mac | `akbun-storyboard-x86_64-apple-darwin.tar.gz` |
| Windows | `akbun-storyboard-x86_64-pc-windows-msvc.zip` |
| Linux | `akbun-storyboard-x86_64-unknown-linux-gnu.tar.gz` |

압축을 풀면 `akbun-storyboard` 파일 하나가 나온다. 웹 화면, AI용 MCP 서버, CLI, AI용 skill 문서가 모두 이 파일 안에 들어 있다.

### macOS에서 설치

압축을 푼 파일을 PATH에 있는 폴더로 옮긴다. 아래 명령은 `/usr/local/bin`에 두는 예시다.

```bash
sudo mv akbun-storyboard /usr/local/bin/
```

서명하지 않은 빌드라 macOS가 처음 실행을 막는다. 아래 명령으로 격리 표시를 한 번 지운다.

```bash
xattr -cr /usr/local/bin/akbun-storyboard
```

### Windows에서 설치

`akbun-storyboard.exe`를 원하는 폴더(예: `C:\Tools`)에 두고 그 폴더를 PATH에 추가한다. 처음 실행할 때 SmartScreen 경고가 나오면 "추가 정보"를 누르고 "실행"을 고른다.

### 실행

터미널에서 아래 명령을 실행하면 서버가 뜨고 브라우저가 열린다.

```bash
akbun-storyboard serve --open
```

터미널에 `serving http://127.0.0.1:4780/`이 보이면 정상이다. 브라우저가 자동으로 열리지 않으면 그 주소를 직접 연다. 서버를 끄려면 터미널에서 Ctrl+C를 누른다. 서버를 꺼도 데이터는 그대로 남는다.

### 데이터는 어디에 저장되나

| 무엇 | 기본 위치 |
|---|---|
| 프로젝트, 씬, 댓글 등 모든 글 | `~/.akbun-storyboard/storyboard.db` (Windows: `C:\Users\<이름>\.akbun-storyboard\`) |
| 스케치와 사진 파일 | `~/.akbun-storyboard/media/` |

이미지 폴더는 맨 위 메뉴 막대의 Settings에서 다른 곳으로 바꿀 수 있다. 시나리오 9를 본다. 데이터 폴더 전체를 바꾸고 싶으면 실행할 때 `--data` 옵션을 준다.

```bash
akbun-storyboard --data /Volumes/Work/storyboard serve --open
```

## 화면 구성과 용어

맨 위에 메뉴 막대(File, Edit, Export, View, Settings)가 있고, 그 아래 제목 줄, 다시 그 아래가 왼쪽부터 프로젝트 목록, 가운데 작업 영역, 오른쪽 인스펙터다.

| 메뉴 | 들어 있는 것 |
|---|---|
| File | 새 프로젝트, 프로젝트 열기·저장(.zip), storyboard.json 가져오기, 설정, 프로젝트 삭제 |
| Edit | 씬 추가, 선택한 씬 삭제, 배경음악·효과음·아이디어 추가 |
| Export | 보드 전체 Markdown(AI용), 클립보드 복사, 내레이션 대본, 촬영 목록 CSV, storyboard.json, 프로젝트 zip |
| View | Board, Script, Music, Ideas, Comments 전환, 프로젝트 목록·인스펙터 보이기 |
| Settings | 이미지 폴더와 디스크 용량 |

메뉴 제목을 누르면 열리고, 열린 상태에서 옆 제목으로 마우스를 옮기면 그 메뉴로 바뀐다. 바깥을 누르거나 Esc를 누르면 닫힌다.

| 위치 | 이름 | 하는 일 |
|---|---|---|
| 제목 줄 | 프로젝트 제목 | 눌러서 바로 이름을 바꾼다. 옆의 Saved는 저장 상태다 |
| 왼쪽 | 프로젝트 목록 | 프로젝트별 씬 수, 길이, 이미지 용량, 열린 댓글 수. 위쪽 아이콘으로 접고 편다 |
| 가운데 위 | 보기 탭 | Board, Script, Music, Ideas, Comments |
| 가운데 위 | 통계 | 씬 수, 전체 길이, 이미지 용량 |
| 가운데 위 오른쪽 | + Scene, 인스펙터 열기 | 씬 추가. 인스펙터를 숨겼을 때만 여는 아이콘이 보인다 |
| 오른쪽 | 인스펙터 | 선택한 것(씬, 음악, 아이디어)의 내용을 고친다. 아무것도 선택하지 않으면 프로젝트 정보가 나온다. 머리줄 오른쪽 아이콘으로 숨기고, 가운데 위 오른쪽 아이콘으로 다시 연다 |

이 문서에서 쓰는 용어는 다음과 같다.

| 용어 | 뜻 |
|---|---|
| 프로젝트 | 영상 한 편 |
| 파트 | 영상의 큰 구간. 예: 훅, 본론, 마무리. Board에서 파트별로 줄이 나뉜다 |
| 씬 | 컷 하나. 길이(초), 스케치, 내레이션, 화면 설명을 가진다. 번호와 시작 시각은 순서에서 자동으로 계산된다 |
| 비트(beats) | 씬 안을 초 단위로 쪼갠 메모. `0–2초 / 화면에서 일어나는 일 / 자막·소리` |
| BGM / SFX | 배경음악 / 효과음. Music 탭에서 씬 범위와 함께 관리한다 |
| 댓글 | 씬이나 프로젝트에 남기는 메모. AI는 열린 댓글을 요청으로 읽는다 |

### 인스펙터 읽는 법

씬을 선택하면 인스펙터 맨 위 카드에 자주 쓰는 것만 보인다. 이미지, 내레이션, 화면에 보일 내용, 파트, 길이, 상태다. 나머지는 접힌 섹션에 들어 있고, 접힌 상태에서도 제목 옆에 요약이 보인다.

| 섹션 | 들어 있는 것 |
|---|---|
| Comments | 이 씬의 댓글. 열린 댓글이 있으면 자동으로 펼쳐진다 |
| Shot & camera | 샷 종류, 카메라 움직임, 움직임 메모, 소스(화면 녹화·촬영 등), 오버레이 자막, 의도 |
| Voice & sound | 목소리 방식(none, live, adr), 후시녹음 이유, 효과음 메모 |
| Beats | 초 단위 비트 표 |
| Production & AI prompts | 스케치 프롬프트, 녹화 방법, AI 영상 생성 프롬프트 |

섹션을 펼치거나 접은 상태는 기억되므로, 자주 쓰는 섹션만 펼쳐 두면 된다. 입력하면 0.5초 뒤 자동 저장되고 맨 위에 Saved가 보인다. 따로 저장 버튼을 누를 필요는 없다.

## 시나리오 1. 빈 프로젝트에서 스토리보드 만들기

영상 아이디어만 있고 아무것도 없는 상태에서 시작하는 흐름이다.

1. File > New project를 누른다. 왼쪽 목록의 + 아이콘도 같다. Hook, Body, Wrap-up 세 파트가 있는 빈 프로젝트가 생긴다.
2. 맨 위 제목 칸을 눌러 영상 제목을 적는다.
3. 아무 씬도 선택하지 않은 상태(Esc)에서 인스펙터에 Core message(핵심 메시지 한 문장)와 Status를 적는다. 시청자, 의도 같은 기획 정보는 Plan 섹션에 있다.
4. 파트 이름을 바꾸거나 더하려면 Parts 섹션을 펼친다. 왼쪽 칸은 짧은 키(씬이 이 키로 파트를 가리킨다), 오른쪽 칸은 화면에 보이는 제목이다.
5. - Scene을 누른다. 선택한 씬이 있으면 그 바로 뒤에, 없으면 마지막 파트 끝에 5초짜리 씬이 생기고 인스펙터가 그 씬으로 바뀐다.
6. 인스펙터에서 내레이션, 화면에 보일 내용, 길이(Seconds)를 적는다. Part를 바꾸면 Board에서 그 파트 줄로 옮겨 간다.
7. 계속 + Scene으로 씬을 늘린다. 위쪽 통계에서 전체 길이가 바로 바뀌므로 목표 길이에 맞추기 쉽다.

순서를 바꾸고 싶으면 Board에서 카드를 끌어 다른 카드 위에 놓는다. 대상 카드의 왼쪽 절반에 놓으면 그 앞으로, 오른쪽 절반에 놓으면 그 뒤로 간다. 다른 파트의 카드 위에 놓으면 파트도 함께 바뀐다.

진행 상황은 Status로 표시한다. 카드 오른쪽 위 점 색이 바뀐다.

| Status | 점 색 | 쓰는 때 |
|---|---|---|
| todo | 회색 | 아직 손대지 않음 |
| sketched | 노랑 | 스케치가 붙음 |
| recorded | 파랑 | 녹화·촬영 끝 |
| done | 초록 | 편집까지 끝 |

씬을 지우려면 인스펙터 머리줄의 휴지통을 누른다. 확인 창이 한 번 뜨고, 그 씬에만 쓰던 이미지 파일도 함께 지워진다.

## 시나리오 2. 스킬이 만든 스토리보드를 가져와 다듬기

akbun-youtube-storyboard 스킬이 만든 `storyboard.json`과 `sketches/cut_NN.png`를 가져와 화면에서 고치고, 고친 결과를 다시 스킬에 넘기는 흐름이다. pptx는 읽기 좋지만 한 씬만 고치기 어렵다. 고치는 일은 여기서 하고, pptx는 스킬이 다시 만들게 한다.

1. File > Import storyboard.json…을 누른다.
2. `storyboard.json`의 절대 경로를 넣는다. 예: `/Users/me/storyboard-output/cdp-tistory/storyboard.json`. 같은 폴더의 `sketches/cut_01.png`부터 순서대로 씬 이미지로 붙는다.
3. 새 프로젝트가 생기고 Board에 파트별로 씬 카드가 보인다.
4. 화면에서 내레이션, 길이, 순서, 스케치를 고친다.
5. 다 고쳤으면 Export > storyboard.json for the storyboard skills…를 누르고 내보낼 경로를 넣는다. 그 경로에 `storyboard.json`이, 옆의 `sketches/`에 이미지가 써진다. 경로를 비우고 OK를 누르면 JSON 파일만 내려받는다.
6. 스킬에서 그 `storyboard.json`으로 `build`를 다시 돌려 pptx를 새로 만든다.

가져온 뒤 내보내면 원래 파일과 같은 형식이 나온다. 다만 댓글, 상태, 아이디어, 효과음(SFX) 항목은 스킬 형식에 없으므로 내보내지 않는다. 이것까지 보관하려면 시나리오 8의 "프로젝트 저장"을 쓴다.

같은 일을 터미널에서 할 때는 아래 명령을 쓴다.

```bash
akbun-storyboard project_import path=/Users/me/storyboard-output/cdp-tistory/storyboard.json
```

내보낼 때는 프로젝트 번호(id)와 경로를 준다. 번호는 `akbun-storyboard project_list`로 확인한다.

```bash
akbun-storyboard project_export id=1 path=/Users/me/storyboard-output/cdp-tistory/storyboard.json
```

## 시나리오 3. 아이패드 스케치나 사진을 씬에 붙이기

손으로 그린 스케치나 촬영 장소 사진을 씬에 붙이는 방법은 세 가지다. 지원하는 이미지는 png, jpg, gif, webp, heic다.

### 방법 A. 컴퓨터에서 파일을 끌어다 놓기

AirDrop이나 클라우드로 이미지를 컴퓨터에 옮긴 뒤, Board의 씬 카드나 인스펙터의 이미지 칸에 끌어다 놓는다. 이미지가 이미 있으면 새 이미지로 교체된다.

### 방법 B. 복사해서 붙여넣기

이미지를 복사(Cmd+C)한 뒤 씬을 선택하고 Cmd+V를 누른다. 스크린샷 도구에서 바로 복사한 이미지도 된다. Ideas 탭에서 붙여넣으면 이미지가 들어간 새 아이디어가 된다.

### 방법 C. 아이패드에서 바로 올리기

아이패드 브라우저로 스토리보드를 열어 사진을 찍거나 그림을 고른다. 컴퓨터와 아이패드가 같은 Wi-Fi에 있어야 한다.

1. 컴퓨터에서 실행 중인 서버를 Ctrl+C로 끄고, 네트워크 모드로 다시 켠다.

```bash
akbun-storyboard serve --host 0.0.0.0
```

1. 터미널에 `serving http://192.168.0.12:4780/?t=…` 같은 주소가 나온다. 끝의 `t=` 뒤 값이 이번 실행에만 쓰는 비밀 토큰이다.
2. 그 주소 전체를 아이패드 Safari에 입력한다. 주소를 메시지나 메모로 아이패드에 보내면 편하다.
3. 씬 카드를 누르고 인스펙터에서 Choose image(이미지가 있으면 Replace image)를 누른다. Safari가 사진 촬영, 사진 보관함, 파일 중에서 고르게 해 준다.
4. 컴퓨터 브라우저에도 2초 안에 이미지가 나타난다.

토큰이 없는 주소로 접속하면 거부된다. 서버를 다시 켜면 토큰이 바뀌므로 새 주소를 다시 열어야 한다. 이 모드에는 로그인이 없으니 집이나 사무실처럼 믿을 수 있는 네트워크에서만 쓴다. 작업이 끝나면 Ctrl+C로 끄고 평소처럼 `serve`로 다시 켠다.

### 이미지 교체와 제거

인스펙터 이미지 아래에 Replace image와 Remove 버튼, 오른쪽에 파일 크기가 있다. 교체하거나 제거하면 이전 이미지 파일은 디스크에서 바로 지워진다. 이미지를 누르면 새 탭에서 원본 크기로 볼 수 있다.

## 시나리오 4. 대본만 빠르게 읽고 고치기

녹음 전에 대본 흐름만 보고 싶을 때는 Script 탭을 연다.

1. Script 탭에는 씬이 한 줄씩 표로 나온다. 번호, 시각 범위, 파트, 화면 설명, 내레이션, 길이 순서다.
2. 화면 설명과 내레이션 칸을 눌러 바로 고친다. 입력하면 자동 저장된다.
3. 길이 칸을 바꾸면 아래 씬들의 시각 범위가 다시 계산된다.
4. 줄을 누르면 오른쪽 인스펙터에서 그 씬의 나머지 정보를 볼 수 있다.

내레이션은 공백을 뺀 글자 수 기준으로 1초에 7자 안쪽이면 그 길이 안에 편하게 읽힌다. 7초 씬이면 49자 정도다.

## 시나리오 5. 배경음악과 효과음 목록 정리하기

Music 탭은 배경음악(BGM)과 효과음(SFX)을 함께 관리한다. 위쪽에 두 줄짜리 타임라인이 있어서 영상 전체에서 음악이 어디에 깔리는지 한눈에 보인다.

### 배경음악 추가

1. Music 탭에서 + BGM을 누른다. 첫 씬부터 마지막 씬까지 덮는 항목이 생기고 인스펙터가 열린다.
2. Track title과 URL에 고른 곡을 적는다. 아직 곡을 고르지 않았으면 Mood, Genre, BPM만 적어 둔다.
3. From scene과 To scene으로 이 곡이 깔릴 씬 범위를 정한다. 두 번호 모두 포함이다. 곡이 바뀌는 지점은 파트 경계에 맞추면 자연스럽다.
4. 음원 사이트에서 찾을 때 쓸 영어 검색어는 Search & generation 섹션의 Search keywords에, AI 음악 생성에 넣을 문장은 Generation prompt에 적는다.

### 효과음 추가

1. 효과음을 넣을 씬을 Board에서 먼저 선택한 뒤 Music 탭에서 + SFX를 누른다. 그 씬 하나를 범위로 하는 효과음 항목이 생긴다.
2. Key에 짧은 이름(예: whoosh), Mood에 소리 설명(예: 짧은 스윕)을 적는다.

위쪽 All, BGM, SFX 버튼으로 목록을 거른다. 항목을 지우려면 인스펙터 머리줄의 휴지통을 누른다.

## 시나리오 6. 아이디어를 모아 두었다가 씬으로 만들기

아직 어느 영상에 들어갈지 모르는 생각이나 사진을 모아 두는 곳이 Ideas 탭이다.

1. Ideas 탭 위쪽에서 This project(지금 프로젝트)와 Inbox(어느 프로젝트에도 속하지 않음) 중 하나를 고른다.
2. 입력 칸에 아이디어를 적고, 필요하면 이미지를 첨부한 뒤 Add idea를 누른다. 이미지를 붙여넣기(Cmd+V)만 해도 아이디어가 생긴다.
3. 아이디어 카드를 누르면 인스펙터에서 글, 태그, 이미지를 고칠 수 있다.
4. 씬으로 쓸 때가 되면 카드의 → Scene을 누른다. 아이디어의 글과 이미지로 새 씬이 마지막 파트 끝에 생기고 Board로 이동한다. Inbox 아이디어였다면 지금 프로젝트로 옮겨진다.

## 시나리오 7. AI에게 수정을 맡기고 댓글로 리뷰하기

이 도구의 핵심 흐름이다. 사람은 화면에서 씬에 댓글로 요청을 남기고, AI는 그 댓글을 읽어 고친 뒤 댓글을 해결 처리하고 답을 남긴다. AI가 고치는 모습은 브라우저에서 실시간으로 보인다.

### AI 연결하기 (처음 한 번)

쓰는 도구에 맞는 것만 하면 된다. 설정 후에는 해당 앱을 다시 시작한다.

Claude Code는 아래 명령으로 MCP 서버를 모든 프로젝트에 등록한다.

```bash
claude mcp add akbun-storyboard -s user -- akbun-storyboard mcp
```

Claude Code가 이 도구를 잘 쓰도록 skill도 설치한다. skill 문서는 실행 파일 안에 들어 있어서 아래 명령이 꺼내 저장한다.

```bash
mkdir -p ~/.claude/skills/akbun-storyboard && akbun-storyboard skill > ~/.claude/skills/akbun-storyboard/SKILL.md
```

Claude Desktop은 `~/Library/Application Support/Claude/claude_desktop_config.json`(Windows는 `%APPDATA%\Claude\claude_desktop_config.json`)에 아래 내용을 넣는다. 데스크톱 앱은 터미널의 PATH를 모르므로 `command`에 실행 파일의 전체 경로를 쓴다. 경로는 터미널에서 `which akbun-storyboard`로 확인한다.

```json
{
  "mcpServers": {
    "akbun-storyboard": { "command": "/usr/local/bin/akbun-storyboard", "args": ["mcp"] }
  }
}
```

Codex는 아래 명령으로 MCP 서버를 등록한다.

```bash
codex mcp add akbun-storyboard -- akbun-storyboard mcp
```

Codex용 skill은 Codex의 skills 폴더에 저장한다.

```bash
mkdir -p ~/.codex/skills/akbun-storyboard && akbun-storyboard skill > ~/.codex/skills/akbun-storyboard/SKILL.md
```

Gemini CLI는 `~/.gemini/settings.json`에, Antigravity는 MCP 설정(Manage MCP servers → View raw config)에 아래 내용을 넣는다.

```json
{
  "mcpServers": {
    "akbun-storyboard": { "command": "akbun-storyboard", "args": ["mcp"] }
  }
}
```

skill을 지원하지 않는 agent는 `AGENTS.md`나 `GEMINI.md`에 "스토리보드 작업은 `akbun-storyboard skill`을 실행해 그 내용을 따른다" 한 줄을 넣으면 된다.

연결이 됐는지는 AI에게 "akbun-storyboard 프로젝트 목록 보여줘"라고 물어 확인한다. 프로젝트 이름과 씬 수가 나오면 된다.

### 댓글로 요청하고 AI가 처리하게 하기

1. 브라우저에서 고치고 싶은 씬을 선택하고 인스펙터의 Comments 섹션에 요청을 적는다. 예: "훅이 길다. 7초 안에 끝나게 내레이션을 줄여줘."
2. 프로젝트 전체에 대한 요청은 씬을 선택하지 않은 상태(Esc)에서 Comments에 적는다.
3. AI에게 이렇게 말한다. "akbun-storyboard에서 '티스토리' 프로젝트의 열린 댓글을 처리해줘."
4. AI가 씬을 고치면 브라우저 화면이 바로 바뀐다. 처리한 댓글은 Resolved로 표시되고(흐리게 보임), AI가 무엇을 했는지 답 댓글이 달린다. 답 댓글 앞의 동그라미 색으로 누가 썼는지 구분한다. me는 파랑, claude는 주황, codex는 초록, gemini는 하늘색이다.
5. 결과가 마음에 들지 않으면 그 씬에 다시 댓글을 남기고 3번을 반복한다.

전체 댓글은 Comments 탭에서 본다. Open과 All로 거르고, 댓글을 누르면 해당 씬으로 이동한다. 위쪽 탭의 숫자가 열린 댓글 수다.

### AI에게 맡기기 좋은 요청 예시

| 하고 싶은 일 | 이렇게 말한다 |
|---|---|
| 새 스토리보드 초안 | "akbun-storyboard에 'kubectl debug 입문' 프로젝트를 만들고 훅, 원리, 실습, 마무리 파트로 2분짜리 씬을 짜줘" |
| 대본 다듬기 | "3번 프로젝트의 내레이션을 씬 길이에 맞게 초당 7자 안으로 줄여줘" |
| 음악 목록 | "파트마다 배경음악 후보를 BGM으로 넣고 검색 키워드도 채워줘" |
| 검토만 받기 | "씬을 고치지 말고, 흐름상 어색한 씬마다 댓글로 의견만 남겨줘" |
| 스케치 확인 | "5번 씬 스케치를 보고 화면 설명과 맞는지 알려줘" |

AI가 지운 것을 되돌리는 기능은 없다. 중요한 작업 전에는 시나리오 8의 프로젝트 저장으로 백업해 두고, 처음에는 "고치지 말고 댓글로 제안만" 같은 요청으로 시작하면 안전하다.

## 시나리오 8. 프로젝트 저장, 열기, 삭제, 다른 컴퓨터로 옮기기

모든 변경은 자동으로 데이터베이스에 저장된다. 여기서 말하는 저장은 프로젝트를 zip 파일 하나로 꺼내 백업하거나 다른 컴퓨터로 옮기는 일이다. zip 안에는 `project.json`(기획 정보, 파트, 씬, 음악·효과음, 아이디어, 댓글, 상태)과 `media/`(씬과 아이디어에 붙은 모든 이미지)가 들어 있어서, 열면 이미지까지 그대로 돌아온다.

| 하고 싶은 일 | 메뉴 | 결과 |
|---|---|---|
| 백업, 다른 컴퓨터로 옮기기 | File > Save project (.zip) | 브라우저 다운로드 폴더에 `<제목>.zip`이 저장된다. Export > Project with images (.zip)도 같다 |
| 백업한 프로젝트 열기 | File > Open project (.zip)… | 파일 선택 창에서 zip을 고르면 새 프로젝트로 열린다. 기존 프로젝트를 덮어쓰지 않는다 |
| 스킬과 주고받기 | File > Import storyboard.json…, Export > storyboard.json… | 시나리오 2 참고 |
| 프로젝트 지우기 | File > Delete project… | 확인 후 씬, 댓글, 그 프로젝트만 쓰던 이미지 파일까지 지운다. 되돌릴 수 없다 |

다른 컴퓨터로 옮기는 순서는 다음과 같다.

1. 원래 컴퓨터에서 File > Save project (.zip)을 누른다. 다운로드 폴더에 zip이 생긴다.
2. zip 파일을 AirDrop, USB, 클라우드 등으로 새 컴퓨터에 옮긴다.
3. 새 컴퓨터에서 akbun-storyboard를 켜고 File > Open project (.zip)…으로 그 파일을 고른다.

zip은 이미지 크기만큼 크다. 이미지가 이미 압축된 형식(png, jpg)이라 zip으로 더 줄지 않으며, 40씬 프로젝트면 90MB 정도다. 1GB를 넘는 zip은 브라우저로 열 수 없으니 CLI를 쓴다.

터미널에서는 경로가 `.zip`으로 끝나면 zip 하나로, 그 밖의 경로는 폴더로 저장한다. AI에게 "1번 프로젝트를 zip으로 백업해줘"라고 해도 같은 명령을 쓴다.

```bash
akbun-storyboard project_save id=1 path=/Users/me/Backups/my-video.zip
```

zip이나 폴더를 새 프로젝트로 여는 명령이다.

```bash
akbun-storyboard project_load path=/Users/me/Backups/my-video.zip
```

프로젝트 사이를 오갈 때는 왼쪽 목록에서 고르면 된다. 프로젝트 목록과 인스펙터는 View 메뉴나 각 패널의 아이콘으로 숨기고 펼친다.

## 시나리오 9. 디스크 용량 관리하기

AI가 만든 스케치는 한 장에 2~3MB라서 40씬 프로젝트 하나가 100MB 가까이 될 수 있다. 용량은 세 곳에서 보인다.

| 위치 | 보이는 것 |
|---|---|
| 왼쪽 프로젝트 목록 | 프로젝트별 이미지 용량 |
| 가운데 위 통계 | 지금 프로젝트의 이미지 용량 |
| 인스펙터 이미지 아래 | 이미지 한 장의 크기 |
| Settings의 Storage | 데이터베이스 크기, 전체 이미지 수와 용량, 쓰지 않는 이미지, 프로젝트별 용량 |

### 이미지 폴더를 다른 디스크로 옮기기

1. 메뉴 막대의 Settings(또는 File > Settings…)를 누른다.
2. Image folder 칸에 새 폴더의 절대 경로를 넣는다. 예: `/Volumes/External/storyboard-media`. 폴더가 없으면 만들어진다.
3. Save를 누른다. 기존 이미지 파일이 모두 새 폴더로 옮겨진다.
4. 기본 위치로 되돌리려면 Default를 누른다. 이때도 파일이 다시 옮겨진다.

외장 디스크로 옮긴 뒤 그 디스크를 빼면 이미지가 보이지 않는다. 글은 데이터베이스에 그대로 있으니, 디스크를 다시 연결하면 돌아온다.

### 쓰지 않는 이미지 지우기

이미지를 교체하거나 씬·프로젝트를 지우면 쓰지 않게 된 이미지는 자동으로 지워진다. 그래도 업로드만 하고 어디에도 붙이지 않은 이미지가 남을 수 있다. 설정의 Storage에서 Unused images가 0보다 크면 Delete unused images를 눌러 정리한다. 막 올린 이미지가 실수로 지워지지 않도록, 올린 지 1분이 지나지 않은 이미지는 남긴다.

## 시나리오 10. 보드 전체를 문서로 추출해 AI나 동료에게 넘기기

보드에 쌓인 내용 전체를 한 문서로 꺼내는 방법이다. MCP를 연결하지 않은 AI(ChatGPT 웹, Gemini 웹 등)에 붙여 넣어 검토받거나, 녹음·촬영 준비물로 쓸 때 필요하다. 맨 위 Export 메뉴에 있다.

| 메뉴 | 파일 | 쓰는 때 |
|---|---|---|
| Full storyboard (.md) — for AI | `<제목>.md` | 기획 정보, 모든 씬의 모든 항목, 비트 표, 이미지 경로, 열린 댓글, 음악·효과음, 아이디어가 한 문서에 들어간다. AI에게 보드 전체를 보여 줄 때 |
| Copy full storyboard for AI | 클립보드 | 위와 같은 내용을 파일 없이 복사한다. 웹 AI 채팅창에 바로 붙여 넣을 때 |
| Narration script (.md) | `<제목>-narration.md` | 씬 순서대로 시각과 내레이션만 담는다. 초당 7자가 넘는 씬에는 `fast` 표시가 붙는다. 녹음할 때 프롬프터로 쓴다 |
| Shot list (.csv) | `<제목>-shotlist.csv` | 씬마다 한 줄씩 시각, 샷, 움직임, 소스, 화면, 내레이션, 상태, 이미지 경로. 엑셀이나 구글 시트로 열어 촬영 순서를 짤 때 |
| storyboard.json for the storyboard skills… | `storyboard.json` | 시나리오 2 참고 |

Markdown 문서의 씬 제목에는 `(id 12, todo)`처럼 씬의 고유 번호가 들어 있다. 웹 AI에게 문서를 주고 "고칠 씬의 id와 새 내레이션을 표로 달라"고 하면, 그 표를 MCP나 CLI를 쓰는 AI에게 넘겨 `scene_update id=12 ...`로 그대로 반영할 수 있다. 문서를 직접 고쳐서 다시 불러오는 기능은 없다. 고치는 일은 항상 화면이나 도구로 한다.

MCP가 연결된 AI는 메뉴 없이도 같은 문서를 직접 받는다. "akbun-storyboard 1번 프로젝트를 Markdown으로 전체 추출해서 흐름을 검토해줘"라고 하면 AI가 `project_render`를 호출한다. 터미널에서는 아래처럼 파일로 저장한다.

```bash
akbun-storyboard project_render id=1 format=markdown > storyboard.md
```

대본만 또는 촬영 목록만 필요하면 `format`을 바꾼다.

```bash
akbun-storyboard project_render id=1 format=narration > narration.md
```

## CLI 빠른 참조

서버를 켜지 않아도 터미널에서 모든 작업을 할 수 있다. 결과는 JSON으로 나온다. 명령은 `akbun-storyboard <작업 이름>` 뒤에 `키=값`을 이어 쓰는 형식이다. 숫자, null, 배열처럼 JSON으로 읽히는 값은 그대로 쓰이고, 나머지는 글자로 쓰인다. 띄어쓰기가 있는 값은 따옴표로 감싼다.

전체 작업 목록과 각 작업이 받는 값은 아래 명령으로 본다.

```bash
akbun-storyboard ops
```

자주 쓰는 명령은 아래 표와 같다.

| 하고 싶은 일 | 명령 |
|---|---|
| 프로젝트 목록 | `akbun-storyboard project_list` |
| 프로젝트 전체 보기 | `akbun-storyboard project_get id=1` |
| 씬 내레이션 고치기 | `akbun-storyboard scene_update id=12 narration="새 문장" dur=4.5` |
| 씬 추가(12번 씬 뒤) | `akbun-storyboard scene_add project_id=1 part=hook after_id=12 dur=5` |
| 씬 순서 바꾸기(맨 앞으로) | `akbun-storyboard scene_move id=12 after_id=null` |
| 이미지 붙이기 | `akbun-storyboard media_add path=/abs/sketch.png project_id=1` 다음 `akbun-storyboard scene_update id=12 media_id=<받은 id>` |
| 열린 댓글 보기 | `akbun-storyboard comment_list project_id=1 open_only=true` |
| 효과음 추가 | `akbun-storyboard music_add project_id=1 type=sfx key=whoosh from_scene=5 to_scene=5` |
| 용량 확인 | `akbun-storyboard storage_info` |
| 보드 전체 추출 | `akbun-storyboard project_render id=1 format=markdown` (narration, csv도 가능) |

`id`는 씬의 고유 번호이고, 화면에 보이는 Scene 번호(순서)와 다르다. `project_get` 결과에서 각 씬의 `id`와 `number`를 함께 볼 수 있다.

값이 복잡하면 JSON 한 덩어리로 넘겨도 된다.

```bash
akbun-storyboard comment_add '{"project_id":1,"scene_id":12,"author":"me","body":"여기 BGM을 낮춰줘"}'
```

## 키보드와 작은 요령

| 키·동작 | 하는 일 |
|---|---|
| ← → | Board에서 이전·다음 씬 선택 |
| Esc | 선택 해제. 인스펙터가 프로젝트 정보로 돌아간다 |
| Cmd+V (이미지) | 선택한 씬이나 아이디어의 이미지로 넣기. Ideas 탭에서는 새 아이디어 |
| 카드 끌기 | 순서 바꾸기. 카드의 왼쪽 절반은 앞, 오른쪽 절반은 뒤 |
| 이미지 파일 끌어다 놓기 | 카드나 인스펙터 이미지 칸에 놓으면 첨부 또는 교체 |
| 인스펙터 숨기기·열기 | 인스펙터 머리줄 오른쪽 아이콘으로 숨기고 가운데 위 오른쪽 아이콘으로 연다. 화면을 넓게 쓸 때 |

- 화면은 시스템의 라이트·다크 모드를 따른다.
- 입력 중에는 AI의 변경이 들어와도 입력하던 칸이 덮어써지지 않는다. 칸에서 나가면 최신 내용으로 다시 그린다.
- 같은 브라우저 탭을 여러 개 열어도 된다. 각 탭이 2초마다 변경을 확인한다.

## 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| macOS에서 "확인되지 않은 개발자" 경고로 실행이 안 됨 | `xattr -cr <파일 경로>`를 한 번 실행한다 |
| `bind 127.0.0.1:4780` 오류로 서버가 안 뜸 | 이미 서버가 켜져 있거나 다른 프로그램이 포트를 쓴다. 켜진 서버를 쓰거나 `--port 4781`처럼 다른 포트를 준다 |
| 브라우저에 `bad host`가 뜸 | `127.0.0.1`이나 `localhost`가 아닌 이름으로 접속했다. `http://127.0.0.1:4780/`으로 연다. 다른 기기에서 쓰려면 시나리오 3의 네트워크 모드를 쓴다 |
| 아이패드에서 `open the URL printed by…`가 뜸 | 토큰이 빠졌거나 서버를 다시 켜서 토큰이 바뀌었다. 터미널에 새로 찍힌 주소 전체를 연다 |
| 아이패드에서 아예 접속이 안 됨 | 같은 Wi-Fi인지, `--host 0.0.0.0`으로 켰는지 확인한다. macOS 방화벽이 연결을 묻는 창을 띄웠다면 허용한다 |
| AI가 고쳤다는데 화면이 그대로 | 다른 데이터 폴더를 보고 있을 수 있다. `--data`나 `AKBUN_STORYBOARD_DATA`를 서버와 AI 쪽에서 같게 맞춘다. 설정의 Storage 아래 Data 경로로 확인한다 |
| Claude Desktop에 도구가 안 보임 | 설정 파일의 `command`가 전체 경로인지 확인하고 앱을 완전히 종료 후 다시 연다 |
| AI가 스케치를 "볼" 수 없다고 함 | 1MB가 넘는 이미지는 MCP로 그림 대신 파일 경로를 넘긴다. Claude Code나 Codex처럼 파일을 읽을 수 있는 agent는 그 경로를 읽으면 된다 |
| 이미지 업로드가 거부됨 | png, jpg, gif, webp, heic만 받는다. 확장자가 아니라 파일 내용으로 판단한다 |
| 이미지가 깨져 보임 | 이미지 폴더를 외장 디스크로 옮긴 뒤 디스크가 빠졌을 수 있다. 설정에서 Image folder 경로를 확인한다 |
