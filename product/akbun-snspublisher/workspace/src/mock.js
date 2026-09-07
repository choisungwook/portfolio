/**
 * Mock posts until drafts live in D1. Times are UTC; the page shows them in local time.
 * @type {import('./schedule.js').Post[]}
 */
export const posts = [
  {
    id: 'p1',
    body: '이번 주에 읽은 글 세 편을 정리했어요. Cloudflare Access 뒤에 Worker를 두는 구조가 생각보다 단순합니다.',
    scheduledAt: '2026-09-08T00:00:00Z',
    channels: { x: 'scheduled', linkedin: 'scheduled', threads: 'scheduled' },
  },
  {
    id: 'p2',
    body: '새 제품 스크린샷. 초안 하나를 채널마다 다르게 덧쓰는 화면입니다.',
    scheduledAt: '2026-09-09T03:30:00Z',
    channels: { instagram: 'scheduled', threads: 'scheduled' },
  },
  {
    id: 'p3',
    body: '지난주 발행분. LinkedIn은 성공, X는 토큰 만료로 실패.',
    scheduledAt: '2026-09-03T09:00:00Z',
    channels: { linkedin: 'published', x: 'failed' },
  },
  {
    id: 'p4',
    body: '아직 시각을 정하지 않은 초안. 캘린더에는 나오지 않고 대기열 끝에 붙어요.',
    scheduledAt: null,
    channels: {},
  },
  {
    id: 'p5',
    body: '발행 중인 글. 스케줄러가 집어 간 뒤 결과를 기다리는 상태입니다.',
    scheduledAt: '2026-09-07T02:00:00Z',
    channels: { threads: 'publishing', x: 'published' },
  },
];
