import { useEffect, useState, type JSX } from 'react'

interface CliStatus {
  git: boolean
  gh: boolean
}

/**
 * 앱 상단 고정 안내 배너.
 * 이 앱은 git CLI로 동작하고 PR 조회에만 gh CLI를 쓴다는 것을 알리고,
 * 설치가 안 된 도구가 있으면 경고 스타일로 강조한다.
 */
export default function CliNoticeBar(): JSX.Element {
  const [status, setStatus] = useState<CliStatus | null>(null)

  useEffect(() => {
    window.gitdesktop.checkCliTools().then((result) => {
      if (result.ok) setStatus(result.data)
    })
  }, [])

  const missing = status ? !status.git || !status.gh : false

  return (
    <div className={missing ? 'notice-bar notice-warn' : 'notice-bar'}>
      <strong>⚠ 이 앱은 git CLI가 필요합니다. GitHub PR 보기를 쓰려면 gh CLI 설치와 gh auth login도 필요합니다.</strong>
      {status && !status.git && <em className="notice-missing">git 미설치</em>}
      {status && !status.gh && <em className="notice-missing">gh 미설치 (PR 보기 사용 불가)</em>}
      {status && status.git && status.gh && <em className="notice-ok">git ✓ gh ✓</em>}
    </div>
  )
}
