// UI language. English is written in the markup and the code; Korean comes from this table. Static text carries
// data-i18n (text), data-i18n-placeholder or data-i18n-title with a key; code calls t(key, english). A key missing here
// shows the English text, so a new string never breaks the page.
const KO = {
  'nav.calendar': '캘린더', 'nav.board': '보드', 'nav.graph': '그래프', 'nav.proposals': '제안',
  'nav.bots': 'Bots', 'nav.discussions': '토론', 'nav.wiki': '위키', 'nav.shared': '공용 폴더', 'nav.search': '검색',
  'bots.add': 'bot 추가', 'bots.off': '꺼짐', 'bots.paused': '멈춤', 'bots.running': '동작 중', 'bots.pause': '멈추기', 'bots.resume': '다시 켜기',
  'bots.working': '작업 중', 'bots.disabled': '꺼진 bot', 'bots.settings': '설정',
  'chat.message': '메시지', 'chat.send': '보내기', 'chat.attach': '파일 첨부', 'chat.working': '작업 중', 'chat.esc': 'esc로 중단',
  'chat.stop': '중단', 'chat.find': '대화에서 찾기', 'chat.drop': '여기에 놓으면 첨부됩니다', 'chat.empty': '아직 대화가 없습니다.',
  'chat.cancelled': '취소됨', 'chat.to': '받는 쪽', 'chat.scheduled': '예약', 'chat.queued': '대기', 'chat.queued_idle': '개 메시지가 빈 turn 자리를 기다립니다',
  'compose.saved': '저장됨, 다음 turn부터 적용', 'compose.model_default': '기본 모델', 'compose.effort_default': '기본 effort', 'compose.fallback': '내장 목록',
  'compose.refresh': 'skill과 plugin을 다시 읽고 모델·명령 목록을 새로 불러오기', 'compose.commands': '명령', 'compose.model': '모델', 'compose.effort': 'Effort',
  'compose.permission': '권한', 'compose.reloaded': '다시 읽음',
  'wf.list': '워크플로', 'wf.runs': '실행 기록', 'wf.new': '새 워크플로', 'wf.empty': '아직 워크플로가 없습니다. 워크플로는 bot이 순서대로 실행하는 단계 목록입니다. task에 지정하고 task를 bot에게 맡기세요.',
  'wf.steps': '단계', 'wf.never': '실행 안 됨', 'wf.run_count': '회 실행', 'wf.run_with': 'bot으로 실행', 'wf.edit': '편집', 'wf.delete': '삭제',
  'wf.delete_confirm': '워크플로 삭제', 'wf.delete_note': '실행 기록은 삭제됨 표시로 남고, 실행 중인 bot에게 알립니다.', 'wf.deleted': '삭제됨', 'wf.told': '알린 bot',
  'wf.name': '이름', 'wf.description': '설명', 'wf.add_step': '단계 추가', 'wf.cancel': '취소', 'wf.save': '저장', 'wf.saved': '저장됨', 'wf.kind': '종류',
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
  'ws.remove_confirm': 'worktree 폴더를 지울까요? 브랜치는 저장소에 남습니다.', 'ws.changes': '바뀐 파일', 'ws.no_changes': '아직 바뀐 파일이 없습니다.',
  'wiki.export': 'zip으로 내보내기', 'wiki.import': '가져오기…', 'wiki.folder_path': '또는 폴더 절대 경로', 'wiki.batch': '이름(선택)',
  'wiki.pick_zip': 'zip이나 파일 올리기…', 'wiki.start_import': '가져오기', 'wiki.need_source': 'zip을 올리거나 폴더 경로를 입력하세요',
  'wiki.export_started': '내보내기를 시작했습니다', 'wiki.import_started': '가져오기를 시작했습니다',
  'job.queued': '대기', 'job.running': '진행 중', 'job.cancelled': '취소됨', 'job.done': '완료', 'job.failed': '실패',
  'job.cancel': '취소', 'job.resume': '마지막 단계부터 다시', 'job.download': '내려받기', 'job.pages': '페이지', 'job.skipped': '건너뜀',
  'perm.auto': '자동', 'perm.acceptEdits': '편집 허용', 'perm.default': '묻기(거부)', 'perm.dontAsk': '허용된 도구만', 'perm.plan': '계획(읽기 전용)', 'perm.bypass': '권한 무시',
  'header.new_task': '새 작업', 'header.settings': '설정', 'header.search': '검색', 'header.search_runs': '지난 실행 검색',
  'settings.title': '설정', 'settings.appearance': '화면', 'settings.language': '언어', 'settings.theme': '테마',
  'settings.theme.system': '시스템', 'settings.theme.dark': '다크', 'settings.theme.light': '라이트', 'settings.font': '글꼴', 'settings.size': '크기',
  'settings.limits': '사용량 제한', 'settings.limits.hint': '전체 bot에 걸리는 제한과 bot별 기본값입니다. bot 설정에서 bot마다 따로 정할 수 있습니다.',
  'limit.daily_budget_usd': '하루 예산(USD)', 'limit.turns_per_hour_total': '전체 시간당 turn', 'limit.max_concurrent_turns': '동시에 일하는 bot',
  'limit.bot_turns_per_hour': 'bot별 시간당 turn(기본)', 'limit.turn_budget_usd': 'turn당 예산(기본, USD)', 'limit.turn_max_turns': 'turn당 모델 턴(기본)',
  'settings.save': '저장', 'settings.queue': '큐', 'settings.autorun': '맡은 bot이 없는 작업을 자동으로 실행',
  'settings.folders': '폴더', 'settings.folder.shared': '공용 폴더', 'settings.folder.sessions': '세션 대화 기록', 'settings.folder.home': 'taskq 데이터 폴더',
  'settings.open': '열기', 'settings.skills': 'bot용 skill', 'settings.plugins': 'bot용 plugin', 'settings.add': '추가', 'settings.update': '업데이트',
  'menu.open': '대화 열기', 'menu.settings': '설정…', 'menu.memory': '메모리…', 'menu.reload_skills': 'skill 다시 불러오기',
  'menu.reload_plugins': 'plugin 다시 불러오기', 'menu.new_session': '새 세션 시작', 'menu.cancel': '진행 중인 작업 취소',
  'menu.session_folder': '세션 폴더 열기', 'menu.disable': '끄기', 'menu.enable': '켜기', 'menu.delete': '삭제…',
  'memory.title': '메모리', 'memory.hint': 'bot이 매 turn 읽는 자기 메모입니다. bot도 memory_write로 고칩니다.',
  'search.title': '모든 bot 대화 검색', 'search.placeholder': '한글이나 영어로 검색', 'search.none': '찾은 대화가 없습니다.',
  'shared.title': '공용 폴더', 'shared.hint': '모든 bot이 같은 경로로 읽고 쓰는 폴더입니다. 첨부한 파일은 attachments/ 아래에 저장됩니다.',
  'shared.upload': '파일 올리기', 'shared.open': 'Finder/탐색기에서 열기', 'shared.empty': '비어 있습니다.',
  'task.attach': '파일 첨부', 'task.drop': '파일을 끌어다 놓거나 붙여넣으세요',
  'nav.plugins': '플러그인', 'nav.workflows': '워크플로', 'plugins.hint': '여기 등록한 skill과 plugin을 bot 설정에서 bot마다 고릅니다. 업데이트는 git 저장소를 받아 오고 쓰는 bot을 모두 다시 불러옵니다.',
  'plugins.official': '공식 marketplace', 'plugins.anthropic_only': 'Anthropic 것만', 'plugins.filter': '거르기', 'plugins.remove': '삭제',
  'plugins.official_hint': 'Anthropic 공식 marketplace의 plugin 목록입니다. 설치하지 않습니다. 쓰려면 받아서 위에 폴더를 등록하세요.',
  'wiki.search': '위키 검색', 'panel.must_check': '확인 필요', 'panel.pending': '승인 대기', 'discussions.title': '토론', 'wiki.title': '위키',
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
