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
  'chat.cancelled': '취소됨', 'chat.to': '받는 쪽', 'chat.scheduled': '예약',
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
