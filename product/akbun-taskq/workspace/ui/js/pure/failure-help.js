// What a failed task's detail says under "Why it failed": the likely cause and what to do, read from the last run's
// summary and the task's alerts. Each rule is a known failure taskq or the SDK reports; anything else gets the general
// steps. Both languages live here so the advice reads naturally in each, not as a word-for-word translation.
const RULES = [
  {
    test: /no valid structured result/i,
    ko: ['작업이 끝났지만 결과를 정해진 형식으로 돌려주지 못했습니다.', ['taskq 0.35.0 전에는 결과를 보고하는 도구를 taskq가 막아서 모든 작업이 이렇게 실패했습니다. 설정 > 업데이트에서 최신 버전으로 올린 뒤 다시 실행하세요.', '이미 최신이라면 Open run에서 마지막 도구 호출과 거부된 이유를 확인하세요.']],
    en: ['The run finished but did not hand back its result in the required form.', ['Before taskq 0.35.0, taskq blocked the tool that reports the result, so every run failed this way. Update in Settings > Update, then run it again.', 'If you are up to date, open the run and look at the last tool call and why it was refused.']],
  },
  {
    test: /login|sign.?in|credential|expired ?token|unauthori[sz]ed|\b401\b|auth_required/i,
    ko: ['모델이나 대상 계정에 로그인하지 못했습니다.', ['설정 > 연결에서 해당 런타임의 연결 테스트를 누르세요.', 'AWS라면 터미널에서 aws sso login(또는 Kiro는 AWS SSO로 로그인)을 다시 한 뒤 Resume이나 다시 실행을 누르세요.']],
    en: ['Signing in to the model or the target account failed.', ['Run the connection test for that runtime in Settings > Connections.', 'For AWS, sign in again (aws sso login, or Sign in with AWS SSO for Kiro), then Resume or run it again.']],
  },
  {
    test: /tamper|reached (the )?taskq|security_finding|outside the sandbox/i,
    ko: ['작업이 taskq 자신(데이터, 설정, 샌드박스)에 손대려 해서 멈췄습니다.', ['Open run에서 어떤 호출이 막혔는지 확인하세요.', '의도가 그런 일을 요구하지 않도록 고친 뒤 다시 실행하세요. 같은 호출이 반복되면 다른 bot에게 맡기세요.']],
    en: ['The run tried to touch taskq itself (its data, config or sandbox) and was stopped.', ['Open the run to see which call was blocked.', 'Change the intent so it does not ask for that, then run it again; if it repeats, give the task to another bot.']],
  },
  {
    test: /max.?turns|turn limit|budget/i,
    ko: ['정해진 모델 호출 횟수 안에 끝내지 못했습니다.', ['의도를 더 작은 단계로 나누거나 무엇을 하면 끝인지 분명히 적으세요.', '끝난 데까지의 결과를 의도에 적어 두고 Retry를 누르세요. 다시 실행은 언제나 새 세션입니다.']],
    en: ['The run did not finish within its model-turn limit.', ['Split the intent into smaller steps or say clearly when it is done.', 'Note in the intent what is already done and press Retry; a retry always starts a new session.']],
  },
  {
    test: /denied|approval (expired|timed out)|not approved/i,
    ko: ['필요한 승인이 거절되었거나 기다리다 만료되었습니다.', ['승인할 작업이라면 다시 실행하고 Must check에서 승인하세요.', '승인 없이 끝나야 한다면 의도에서 그 단계를 빼세요.']],
    en: ['An approval it needed was denied or expired.', ['If the step should happen, run it again and approve it under Must check.', 'If it should finish without that step, remove it from the intent.']],
  },
  {
    test: /stale|heartbeat|no longer running|interrupted/i,
    ko: ['실행하던 프로세스가 응답을 멈췄습니다(앱 종료, 잠자기, 재시작).', ['다시 실행하세요. 다시 실행은 언제나 새 세션이라, 끝난 부분은 의도에 적어 두면 됩니다.']],
    en: ['The process running it stopped answering (the app quit, slept or restarted).', ['Run it again; a retry always starts a new session, so note in the intent what is already done.']],
  },
  {
    test: /prompt is too long|context (window|length)|too many tokens/i,
    ko: ['대화가 모델이 받을 수 있는 길이를 넘었습니다.', ['첨부나 읽을 파일을 줄이고 의도를 짧게 하세요.']],
    en: ['The conversation grew past what the model accepts.', ['Attach or point it at fewer files and keep the intent short.']],
  },
]

const GENERAL = {
  ko: ['실패 이유를 알 수 있는 정보가 많지 않습니다.', ['Open run에서 이벤트와 마지막 도구 호출을 확인하세요.', '의도에 무엇을, 어디서, 언제 끝인지 구체적으로 적고 다시 실행하세요.', '같은 실패가 반복되면 담당 bot을 정해 그 bot에게 맡기세요.']],
  en: ['There is little to say why it failed.', ['Open the run and look at its events and last tool call.', 'Say in the intent what to do, where, and when it is done, then run it again.', 'If it keeps failing, pick an assigned bot and let it take the task.']],
}

export function failureHelp(task, language = 'en') {
  if (task.status !== 'failed') return null
  // The last run's own summary decides first; only alerts still open (not ones acknowledged on an earlier run) help.
  const summary = task.runs?.[0]?.summary ?? ''
  const open = (task.alerts ?? []).filter((a) => !a.acked_at).map((a) => `${a.kind} ${a.message}`).join('\n')
  const rule = RULES.find((r) => r.test.test(summary)) ?? RULES.find((r) => r.test.test(open))
  const [cause, steps] = (rule ?? GENERAL)[language === 'ko' ? 'ko' : 'en']
  return { cause, steps, detail: task.runs?.[0]?.summary ?? null }
}
