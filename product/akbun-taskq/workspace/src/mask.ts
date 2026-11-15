// Every persisted text passes through mask() or maskDeep(). Event payloads are masked leaf by leaf, never as JSON text,
// so an escaped quote in a value cannot break the stored JSON.
const SECRET_KEY = /pass(word)?|secret|token(?!s)|api[_-]?key|authorization|cookie/i

// Text longer than this is not scanned past the limit. The remainder is dropped, so a rule never sees more than this.
const SCAN_LIMIT = 20000

// Key-shaped names. Both ends are bounded and the word boundary anchors the start, so a long run of one keyword
// cannot backtrack into a cubic match (the old rule took about 20 s on 'token'.repeat(1600)).
const KEY = String.raw`\b[A-Za-z0-9_-]{0,40}(?:password|passwd|secret|token(?!s)|api[_-]?key)[A-Za-z0-9_-]{0,20}["']?\s*[:=]\s*`

type Rule = [RegExp, string | ((...groups: string[]) => string)]

const RULES: Rule[] = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY[A-Z ]*-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY[A-Z ]*-----|$)/g, '[REDACTED:private-key]'],
  [/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED:aws-key-id]'],
  [/(aws_secret_access_key|secret_access_key|secretAccessKey|aws_session_token|sessionToken)(["']?\s*[:=]\s*["']?|\s+)[A-Za-z0-9/+=_-]{16,}/gi, '$1$2[REDACTED]'],
  [/sk-ant-[A-Za-z0-9_-]{10,}/g, '[REDACTED:anthropic-key]'],
  [/sk-proj-[A-Za-z0-9_-]{10,}/g, '[REDACTED:openai-key]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[REDACTED:github-token]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED:github-token]'],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, '[REDACTED:gitlab-token]'],
  [/\bnpm_[A-Za-z0-9]{20,}/g, '[REDACTED:npm-token]'],
  [/\b(?:sk|rk)_live_[A-Za-z0-9]{10,}/g, '[REDACTED:stripe-key]'],
  [/\bxox[bp]-[A-Za-z0-9-]{10,}/g, '[REDACTED:slack-token]'],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, '[REDACTED:google-key]'],
  [/\bya29\.[A-Za-z0-9_-]{20,}/g, '[REDACTED:google-oauth]'],
  [/\beyJ[A-Za-z0-9_-]{5,}\.eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '[REDACTED:jwt]'],
  [/(\b(?:Set-)?Cookie\s*:)[^\n]*/gi, '$1 [REDACTED]'],
  [/(\bAuthorization["']?\s*[:=]\s*["']?)(?:(Basic|Bearer|Token|Digest)\s+)?[^\s"',;&}]+/gi,
    (_, head: string, scheme?: string) => `${head}${scheme ? `${scheme} ` : ''}[REDACTED]`],
  [/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]'],
  [/(?<![A-Za-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s/]*@/gi, '$1[REDACTED]@'],
  [/("(?:Account|UserId|Arn)"\s*:\s*")([^"]*)"/g, (_, head: string, body: string) =>
    `${head}${body.replace(/\b\d{8}(\d{4})\b/g, '********$1')}"`],
  [/(\baccount(?:[ _-]?id)?["']?(?:\s*[:=])?\s*["']?)(\d{8})(\d{4})(?!\d)/gi, '$1********$3'],
  [/(arn:aws[\w-]*:[^:\s]*:[^:\s]*:)\d{12}/g, '$1[ACCOUNT]'],
  [/(--(?:password|secret[-a-z]*|token)[ =])\S+/gi, '$1[REDACTED]'],
  [/((?:mysql|psql)\b[^\n]{0,200}?\s-p)(?!\s)\S+/g, '$1[REDACTED]'],
  [new RegExp(`(${KEY})(["'])((?:\\\\.|(?!\\2)[^\\n\\\\]){0,200})\\2?`, 'gi'), (_, head: string, quote: string) =>
    `${head}${quote}[REDACTED]${quote}`],
  [new RegExp(`(${KEY})(?![\\s"'])[^\\n"']{1,200}`, 'gi'), '$1[REDACTED]'],
]

function applyRules(text: string): string {
  return RULES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement as string), text)
}

export function mask(text: string): string {
  if (text.length <= SCAN_LIMIT) return applyRules(text)
  return `${applyRules(text.slice(0, SCAN_LIMIT))}…(+${text.length - SCAN_LIMIT} chars not stored)`
}

// Masks string leaves. Under a secret-looking key every string leaf below it is replaced whole, since its value may have
// no recognizable shape, and nested objects and arrays do not reopen the value.
export function maskDeep(value: unknown, key = '', hidden = false): unknown {
  const secret = hidden || SECRET_KEY.test(key)
  if (typeof value === 'string') return secret ? '[REDACTED]' : mask(value)
  if (Array.isArray(value)) return value.map((item) => maskDeep(item, key, secret))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, maskDeep(v, k, secret)]))
  }
  return value
}
