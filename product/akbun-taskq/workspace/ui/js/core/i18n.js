// UI language. English is written in the markup and the code; Korean comes from this table. Static text carries
// data-i18n (text), data-i18n-placeholder or data-i18n-title with a key; code calls t(key, english). A key missing here
// shows the English text, so a new string never breaks the page.
const KO = {
  'nav.calendar': '캘린더', 'nav.board': 'task 상태보드',
  'nav.bots': 'Bots', 'nav.wiki': '위키', 'nav.shared': '공용 폴더', 'nav.search': '검색',
  'bots.add': 'bot 추가', 'bots.paused': '멈춤', 'bots.pause': '전체 멈추기', 'bots.resume': '전체 다시 켜기',
  'bots.working': '작업 중', 'bots.disabled': '꺼진 bot', 'bots.settings': '설정',
  'chat.message': '메시지', 'chat.send': '보내기', 'chat.attach': '추가', 'chat.working': '작업 중', 'chat.esc': 'esc로 중단',
  'chat.stop': '중단', 'chat.find': '대화에서 찾기', 'chat.drop': '여기에 놓으면 첨부됩니다', 'chat.empty': '아직 대화가 없습니다.',
  'chat.cancelled': '취소됨', 'chat.to': '받는 쪽', 'chat.scheduled': '예약', 'chat.queued': '대기', 'chat.queued_idle': '개 메시지가 빈 turn 자리를 기다립니다',
  'compose.saved': '저장됨, 다음 turn부터 적용', 'compose.model_default': '기본 모델', 'compose.effort_default': '기본 effort', 'compose.fallback': '내장 목록',
  'compose.refresh': 'skill과 plugin을 다시 읽고 모델·명령 목록을 새로 불러오기', 'compose.commands': '명령', 'compose.model': '모델', 'compose.effort': 'Effort',
  'compose.permission': '권한', 'compose.reloaded': '다시 읽음',
  'wf.list': '워크플로', 'wf.runs': '실행 기록', 'wf.new': '새 워크플로', 'wf.empty': '아직 워크플로가 없습니다. 워크플로는 bot이 순서대로 실행하는 단계 목록입니다. task에 지정하고 task를 bot에게 맡기세요.',
  'wf.steps': '단계', 'wf.never': '실행 안 됨', 'wf.run_count': '회 실행', 'wf.run_with': 'bot으로 실행', 'wf.edit': '편집', 'wf.delete': '삭제',
  'wf.delete_confirm': '워크플로 삭제', 'wf.delete_note': '실행 기록은 삭제됨 표시로 남고, 실행 중인 bot에게 알립니다.', 'wf.deleted': '삭제됨', 'wf.told': '알린 bot',
  'wf.name': '이름', 'wf.description': '설명', 'wf.add_step': '단계 추가', 'wf.cancel': '취소', 'wf.keys': '저장 ⌘S · 취소 Esc · 단계 추가 Alt+1–4', 'wf.save': '저장', 'wf.saved': '저장됨', 'wf.kind': '종류',
  'wf.kind.do': '실행', 'wf.kind.check': '검증(증거 필요)', 'wf.kind.handoff': '다른 bot에 넘김', 'wf.kind.approval': '사용자 승인',
  'wf.to': '받는 bot', 'wf.remove_step': '단계 삭제', 'wf.step_name': '단계', 'wf.instructions': 'bot에게 주는 지시', 'wf.needs': '먼저 끝나야 하는 단계',
  'wf.no_runs': '아직 실행이 없습니다.', 'wf.col.status': '상태', 'wf.col.workflow': '워크플로', 'wf.col.bot': 'bot', 'wf.col.task': 'task',
  'wf.col.started': '시작', 'wf.col.duration': '걸린 시간', 'wf.deleted_badge': '삭제됨', 'wf.cancel_run': '실행 취소', 'wf.cancelled': '취소됨',
  'wf.deleted_since': '워크플로가 삭제됨, 이 실행은 시작할 때의 사본으로 진행', 'wf.evidence': '증거', 'wf.approve': '승인', 'wf.reject': '거절',
  'wf.approve_note': 'bot에게 남길 말(선택)', 'wf.reject_note': '거절 이유(bot에게 전달)', 'wf.workflow': '워크플로', 'wf.none': '없음',
  'wf.status.running': '실행 중', 'wf.status.succeeded': '성공', 'wf.status.failed': '실패', 'wf.status.cancelled': '취소됨',
  'wf.status.pending': '대기', 'wf.status.skipped': '건너뜀', 'wf.needs_bot': '워크플로는 bot만 실행합니다. 맡을 bot을 고르세요.',
  'ws.title': '작업 공간', 'ws.copied': '복사됨', 'ws.kind.worktree': 'Worktree', 'ws.kind.repo': '저장소', 'ws.kind.folder': '폴더',
  'ws.removed': '삭제됨', 'ws.path': '경로', 'ws.copy': '복사', 'ws.branch': '브랜치', 'ws.base': '기준', 'ws.source': '원본 저장소', 'ws.commits': '커밋',
  'ws.vscode': 'VS Code로 열기', 'ws.folder': '폴더 열기', 'ws.pr': 'Pull request', 'ws.compare': '비교 / PR 열기', 'ws.remove': 'worktree 삭제',
  'ws.remove_confirm': 'worktree 폴더를 지울까요? 브랜치에는 커밋한 내용만 남습니다.',
  'ws.discard_confirm': 'worktree에 커밋하지 않은 변경이 있습니다. 지우면 그 변경은 되돌릴 수 없게 사라집니다. 그래도 지울까요?', 'ws.changes': '바뀐 파일', 'ws.no_changes': '아직 바뀐 파일이 없습니다.',
  'wiki.export': 'zip으로 내보내기', 'wiki.import': '가져오기…', 'wiki.folder_path': '또는 폴더 절대 경로', 'wiki.batch': '이름(선택)',
  'wiki.pick_zip': 'zip이나 파일 올리기…', 'wiki.start_import': '가져오기', 'wiki.need_source': 'zip을 올리거나 폴더 경로를 입력하세요',
  'wiki.export_started': '내보내기를 시작했습니다', 'wiki.import_started': '가져오기를 시작했습니다',
  'job.queued': '대기', 'job.running': '진행 중', 'job.cancelled': '취소됨', 'job.done': '완료', 'job.failed': '실패',
  'job.cancel': '취소', 'job.resume': '마지막 단계부터 다시', 'job.download': '내려받기', 'job.pages': '페이지', 'job.skipped': '건너뜀',
  'plugins.mcp': 'bot용 MCP server', 'plugins.mcp_hint': '모든 bot(Claude, OpenAI, Kiro)에게 stdio로 시작되는 명령입니다. bot 게이트 밖에서 내 권한으로 실행되므로 믿는 server만 등록하고, 키는 여기가 아니라 환경 변수에 둡니다.',
  'plugins.openai_hint': 'OpenAI bot은 같은 skill을 씁니다(필요할 때 read_skill 도구로 SKILL.md를 읽음). 아래 MCP server도 씁니다. Claude Code plugin은 OpenAI Agents SDK에서 동작하지 않습니다.',
  'wf.canvas': 'workflow 캔버스', 'wf.zoom_in': '확대', 'wf.zoom_out': '축소', 'wf.fit': '화면에 맞추기', 'wf.arrange': '자동 정렬',
  'wf.port_in': '여기에 연결을 놓으세요', 'wf.port_out': '다음 단계로 끌어 연결', 'wf.loop': '그렇게 연결하면 순환이 생깁니다', 'wf.inspector': '단계',
  'wf.help': '노드를 끌어 옮깁니다. 오른쪽 점에서 다른 노드로 끌면 그 노드가 뒤에 실행됩니다. 연결선을 누르고 Delete로 지웁니다.',
  'wf.discard': '바꾼 내용을 버릴까요?', 'wf.edge_selected': '연결을 골랐습니다. Delete로 지웁니다.', 'wf.pick_node': '편집할 단계를 고르세요.',
  'wf.bad_id': 'id는 겹치지 않는 영문 소문자, 숫자, 하이픈이어야 합니다', 'wf.first': '처음에 실행',
  'settings.usage': '사용량', 'usage.today': '오늘', 'usage.7d': '최근 7일', 'usage.30d': '최근 30일', 'usage.all': '전체',
  'usage.hint': 'bot 세션마다 토큰과 비용을 SDK별로 보여 줍니다. OpenAI 비용은 taskq.config.json의 단가로 추정하고, ChatGPT 구독은 turn별 금액이 없으며, Kiro는 kiro-cli가 알려 줄 때 credit으로 보입니다.',
  'usage.task_runs': '작업 실행(Claude)', 'usage.none': '이 기간에 bot turn이 없습니다.', 'usage.bot': 'bot', 'usage.model': '모델', 'usage.session': '세션',
  'usage.turns': 'turn', 'usage.in': '입력', 'usage.out': '출력', 'usage.cost': '비용', 'usage.last': '마지막', 'usage.plan': '구독',
  'kiro.hint': 'Kiro bot은 AWS IAM Identity Center 세션을 씁니다. SSO start URL과 region을 넣고 로그인하면 kiro-cli가 브라우저에서 승인할 코드를 보여 주고 세션을 보관합니다. taskq는 토큰을 저장하지 않습니다.',
  'kiro.sign_in': 'AWS SSO로 로그인', 'kiro.check': '상태 확인', 'kiro.open': '열기:', 'kiro.enter': '에서 코드 입력:', 'kiro.waiting': 'kiro-cli를 기다리는 중…',
  'kiro.pending': '브라우저에서 승인하기를 기다립니다. 승인한 뒤 연결 테스트를 누르세요.', 'kiro.signed_in': '로그인됨', 'kiro.signed_out': '로그인 안 됨',
  'update.progress': '설치 진행률', 'update.downloading': '내려받는 중…', 'update.unpacking': '압축 푸는 중…', 'chat.files_short': '파일', 'side.changes': '변경 사항', 'side.background': '백그라운드 작업', 'side.finished': '종료됨 {n}개', 'window.close': '닫기', 'window.minimize': '내리기', 'window.minimized': '내린 창', 'chat.ran': '실행함', 'chat.ran_tools': '실행됨 도구 {n}개', 'chat.turn_failed': 'turn 실패', 'chat.no_reason': '이유 없음', 'chat.send_failed': '보내지 못함', 'chat.wont_answer': '아직 대답할 수 없음',
  'settings.review': '주간 점검', 'review.hint': 'bot이 돌았는지, 잘 됐는지, 없어도 되는지 봅니다. 자기 결과를 스스로 검토하면 놓치는 것이 있어서, 최근 결과 몇 개를 직접 확인하도록 골라 둡니다.',
  'review.prune': '끌까요?', 'review.nothing': '정리할 것이 없습니다. 모두 한 번 이상 돌았고 잘 됐습니다.', 'review.turn_off': '끄기', 'review.bots': 'bot',
  'review.turns': 'turn', 'review.success': '성공률', 'review.tasks': '작업 완료 / 실패', 'review.last': '마지막 turn', 'review.when': '언제',
  'review.runs': '실행', 'review.ok': '성공 / 실패', 'review.last_run': '마지막 실행', 'review.spot': '직접 확인할 결과', 'review.no_spot': '이 기간에 bot 결과가 없습니다.', 'review.open_task': '작업 열기',
  'connections.save': '저장', 'connections.saved': '저장했습니다. 다음 turn부터 적용됩니다', 'connections.key_saved': '저장됨. 비워 두면 그대로 유지합니다', 'connections.key_env': '비워 두면 환경 변수 ANTHROPIC_API_KEY를 씁니다', 'connections.key_env_openai': '비워 두면 환경 변수 OPENAI_API_KEY를 씁니다', 'connections.key_removed': '저장된 key를 지웠습니다', 'connections.profiles': '이 컴퓨터의 프로파일', 'connections.no_profiles': '~/.aws/config에 AWS 프로파일이 없습니다.',
  'settings.connections': '연결', 'connections.hint': 'bot이 모델에 닿는 방법입니다. 타입마다 여기서 고른 방식으로 로그인하고, bot은 만들 때 자기 인증 방식을 고릅니다. 저장하면 연결 테스트를 함께 실행합니다. 대답하지 않는 bot은 보통 이 테스트가 실패합니다.',
  'connections.ok': '연결됨', 'connections.error': '실패', 'connections.unused': '쓰는 bot 없음', 'connections.used_by': '쓰는 bot', 'connections.last': '마지막 turn',
  'connections.last_ok': '마지막 응답', 'connections.never': '없음', 'connections.checked': '확인',
  'connections.paused': 'bot이 일시정지됐습니다', 'connections.title': '연결', 'connections.answering': '대답할 수 있음', 'connections.why': '대답하지 않는 이유',
  'connections.waiting': '기다리는 메시지', 'connections.open': '연결 설정 열기',
  'ctx.context': 'context', 'ctx.unknown': '아직 context 크기를 모릅니다', 'ctx.title': '마지막 turn 뒤 context가 찬 정도',
  'perm.auto': '자동', 'perm.acceptEdits': '편집 허용', 'perm.default': '묻기(거부)', 'perm.dontAsk': '허용된 도구만', 'perm.plan': '계획(읽기 전용)', 'perm.bypass': '권한 무시',
  'header.new_task': '새 작업', 'header.settings': '설정', 'header.search': '검색', 'header.search_runs': '지난 실행 검색',
  'settings.title': '설정', 'settings.appearance': '화면', 'settings.language': '언어', 'settings.theme': '테마',
  'settings.theme.system': '시스템', 'settings.theme.dark': '다크', 'settings.theme.light': '라이트', 'settings.font': '글꼴', 'settings.size': '크기',
  'ask.ok': '확인', 'ask.cancel': '취소',
  'settings.save': '저장', 'settings.queue': '큐', 'settings.update': '업데이트', 'update.check': '다시 확인', 'update.checking': '확인 중…', 'update.current': '설치됨', 'update.latest': '최신', 'update.available': '새 버전이 있습니다.', 'update.none': '최신 버전입니다.', 'update.notes': '릴리스 노트', 'update.install': '설치', 'update.installed': '설치됨:', 'update.restart': 'taskq를 다시 시작하면(taskq run을 멈추고 다시 실행) 새 버전이 적용됩니다.', 'settings.autorun': '맡은 bot이 없는 작업을 자동으로 실행',
  'settings.folders': '폴더', 'settings.folder.shared': '공용 폴더', 'settings.folder.sessions': '세션 대화 기록', 'settings.folder.home': 'taskq 데이터 폴더',
  'settings.sessions.intro': 'bot 런타임마다 대화를 저장하는 곳이 다릅니다. bot 하나의 기록은 그 bot 메뉴의 세션 폴더 열기로 엽니다.',
  'settings.sessions.claude': 'task와 Claude bot. 사용자의 Claude Code와 같은 폴더이며, taskq 세션은 실행한 폴더 이름의 하위 폴더에 따로 생깁니다.',
  'settings.sessions.codex': 'ChatGPT 요금제로 로그인한 OpenAI bot.', 'settings.sessions.kiro': 'Kiro bot. kiro-cli가 모든 대화를 이 폴더의 data.sqlite3에 저장합니다.',
  'settings.sessions.openai': 'API key로 쓰는 OpenAI bot은 로컬 기록이 없고 OpenAI가 대화를 보관합니다. Bedrock으로 쓰는 OpenAI bot은 taskq 데이터 폴더의 team/<bot>/.openai-history.json에 저장합니다.',
  'settings.sessions.none': '아직 없음',
  'plugins.used_by': '사용 중:', 'plugins.unused': '쓰는 bot 없음', 'plugins.install': '설치', 'plugins.installing': '설치 중…', 'plugins.installed': '설치됨', 'plugins.no_source': '설치할 수 없음',
  'plugins.installed_toast': '설치됨. 모든 Claude bot이 다음 turn부터 씁니다.', 'plugins.add_by_path': '경로로 추가', 'plugins.add_mcp': 'MCP server 추가',
  'settings.open': '열기', 'settings.skills': 'bot용 skill', 'settings.plugins': 'bot용 plugin', 'settings.add': '추가', 'settings.update': '업데이트',
  'menu.open': '대화 열기', 'menu.settings': '설정…', 'menu.memory': '메모리…', 'menu.reload_skills': 'skill 다시 불러오기',
  'menu.reload_plugins': 'plugin 다시 불러오기', 'menu.new_session': '새 세션 시작', 'menu.cancel': '진행 중인 작업 취소',
  'menu.session_folder': '세션 폴더 열기', 'menu.disable': '끄기', 'menu.enable': '켜기', 'menu.delete': '삭제…',
  'memory.title': '메모리', 'memory.hint': 'bot이 매 turn 읽는 자기 메모입니다. bot도 memory_write로 고칩니다.',
  'search.none': '찾은 항목이 없습니다.', 'search.all': '전체', 'search.messages': '대화', 'search.tasks': '작업', 'search.needs_me': '주의 필요', 'search.recent': '최근 항목',
  'search.open_tasks': '열린 작업', 'search.actions': '작업 메뉴', 'search.unread': '읽지 않음', 'search.run': '지난 실행',
  'shared.title': '공용 폴더', 'shared.hint': '모든 bot이 같은 경로로 읽고 쓰는 폴더입니다. 첨부한 파일은 attachments/ 아래에 저장됩니다.',
  'shared.upload': '파일 올리기', 'shared.open': 'Finder/탐색기에서 열기', 'shared.empty': '비어 있습니다.',
  'shared.view_list': '목록', 'shared.view_details': '자세히', 'shared.view_icons': '아이콘', 'shared.sort_name': '이름', 'shared.sort_kind': '종류',
  'shared.sort_size': '크기', 'shared.sort_modified': '수정한 날짜', 'shared.asc': '오름차순', 'shared.desc': '내림차순', 'shared.folder': '폴더', 'shared.file': '파일',
  'chat.files': '이 대화의 파일', 'chat.no_files': '이 대화에 아직 파일이 없습니다.', 'chat.browser': '브라우저', 'chat.go': '이동', 'chat.new_tab': '새 탭', 'chat.also_sent': '함께 보냄:', 'chat.not_sent_to': '보내지 못함:', 'chat.at_hint': '@로 bot·파일', 'compose.mention_bot': '이 bot에게도 보냄', 'chat.own_origin': 'taskq 자체는 이 창에서 열지 않습니다',
  'chat.add_files': '파일 또는 사진 추가', 'chat.add_folder': '폴더 추가', 'chat.slash': '슬래시 명령어',
  'file.open': '열기', 'file.open_hint': '이 컴퓨터에서 연결된 앱으로 열기', 'file.in_shared': '공용 폴더에서 보기', 'file.download': '내려받기', 'file.close': '닫기',
  'file.no_preview': '이 종류의 파일은 여기서 미리 볼 수 없습니다. 앱으로 열거나 공용 폴더에서 찾으세요.', 'file.too_big': '미리 보기에는 너무 큽니다. 앱으로 여세요.',
  'task.title': '제목', 'task.attach': '파일 첨부', 'task.drop': '파일을 끌어다 놓거나 붙여넣으세요',
  'nav.plugins': '플러그인', 'nav.workflows': '워크플로', 'plugins.hint': '여기 등록한 것은 모든 bot이 타입에 맞게 함께 씁니다(plugin은 Claude bot만). 업데이트는 git 저장소를 받고 bot을 다시 불러옵니다.',
  'plugins.official': '공식 marketplace', 'plugins.anthropic_only': 'Anthropic 것만', 'plugins.filter': '거르기', 'plugins.remove': '삭제',
  'plugins.official_hint': '설치하면 marketplace가 적어 둔 commit의 plugin을 taskq 데이터 폴더에 받아 위 목록에 등록합니다. 모든 Claude bot이 다음 turn부터 불러옵니다. 다시 설치하면 업데이트됩니다.',
  'wiki.search': '위키 검색', 'panel.must_check': '확인 필요', 'panel.queue_paused': '큐 멈춤', 'panel.pending': '승인 대기', 'wiki.title': '위키',
  'plugins.kiro_hint': 'Kiro bot은 같은 skill(kiro-cli에 skill:// resource로 전달)과 아래 MCP server를 씁니다. Claude Code plugin은 Kiro에서 불러오지 않습니다.',
  'plugins.skills_hint': 'Agent skill 폴더(SKILL.md 포함). 모든 bot이 불러옵니다.',
  'plugins.plugins_hint': 'Claude Code plugin 폴더(.claude-plugin/plugin.json 포함): skill, 명령, hook, MCP server를 함께 담습니다. 모든 Claude bot이 불러옵니다.',
  'bot.agent_type': 'Agent type',
  'bot.auth': '인증 방식',
  'bot.auth.claude.api': 'SDK (Anthropic API key)',
  'bot.auth.claude.subscription': '구독 (로그인한 Claude Code)',
  'bot.auth.claude.bedrock': 'AWS Bedrock',
  'bot.auth.openai.api': 'SDK (OpenAI API key)',
  'bot.auth.openai.chatgpt': '구독 (ChatGPT 요금제, Codex CLI)',
  'bot.auth.openai.bedrock': 'AWS Bedrock',
  'bot.auth.kiro.sso': 'AWS IAM Identity Center (kiro-cli)',
  'connections.test': '연결 테스트',
  'connections.clear': '지우기',
  'connections.testing': '테스트 중…',
  'connections.cleared': '지웠습니다',
  'connections.claude_sub': '이 컴퓨터에 로그인한 Claude Code(claude login)를 씁니다.',
  'connections.openai_sub': '이 컴퓨터에 로그인한 Codex CLI(codex login, Sign in with ChatGPT)를 씁니다.',
}

let language = 'ko'

export function currentLanguage() {
  return language
}

export function t(key, english) {
  return language === 'ko' ? KO[key] ?? english : english
}

export function applyLanguage(next, root = document) {
  language = next === 'en' ? 'en' : 'ko'
  document.documentElement.lang = language
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.dataset.en ??= node.textContent
    node.textContent = t(node.dataset.i18n, node.dataset.en)
  }
  for (const node of root.querySelectorAll('[data-i18n-placeholder]')) {
    node.dataset.enPlaceholder ??= node.getAttribute('placeholder') ?? ''
    node.setAttribute('placeholder', t(node.dataset.i18nPlaceholder, node.dataset.enPlaceholder))
  }
  for (const node of root.querySelectorAll('[data-i18n-title]')) {
    node.dataset.enTitle ??= node.getAttribute('title') ?? node.getAttribute('aria-label') ?? ''
    const text = t(node.dataset.i18nTitle, node.dataset.enTitle)
    node.setAttribute('title', text)
    node.setAttribute('aria-label', text)
  }
}

// Korean words for statuses, outcomes and alert kinds; vocab.label() uses them when the language is Korean.
export const KO_WORDS = {
  draft: '초안', ready: '대기', running: '실행 중', done: '완료', failed: '실패', cancelled: '취소됨',
  needs_approval: '승인 대기', needs_auth: '로그인 필요', review: '확인 대기', stale: '중단됨',
  ops_read: '계정 조회', ops_change: '계정 변경', code: '코드', research: '조사', security_review: '보안 리뷰',
  critical: '치명', high: '높음', normal: '보통',
  approval_required: '승인 필요', security_finding: '보안 지적', prod_touch: '운영 오류', worker_flag: 'agent가 표시함',
  auth_required: '로그인 필요', stale_repeat: '반복 중단', budget_exceeded: '예산 초과', review_ready: '확인 대기',
  proposal_pending: '제안 대기', handoff_received: '인계 도착', team_message: 'bot 메시지', team_paused: 'bot 멈춤',
}
