import { filterAllowed } from './filter-args.ts'

// Pure check for Bash in ops_read and ops_change. Deny by default: the text may not use shell expansion, redirection
// or globbing outside quotes, the first segment must be an aws read, and every segment must be an aws read or a text filter.

const REJECTED = new Set(['$', '`', '<', '>', '(', ')', '&', '{', '}', '*', '?', '[', ']', '\\', '\n', '\r'])
const SENSITIVE_PATH = /credentials|\.aws\/|\.ssh|\.env\b|id_rsa/
const GLOBAL_VALUE = new Set(['--profile', '--region', '--output', '--query', '--page-size', '--max-items', '--color'])
const GLOBAL_FLAG = new Set(['--no-cli-pager', '--no-paginate'])
// aws-cli accepts any unambiguous prefix of an option name, so these are matched by prefix too (3+ characters after the dashes).
const DENIED_OPTIONS = [
  '--endpoint-url', '--ca-bundle', '--debug', '--cli-input-json', '--cli-input-yaml', '--with-decryption', '--no-verify-ssl', '--cli-binary-format',
]
const SECRET_SERVICES = new Set(['kms', 'sso', 'sso-oidc'])
// ponytail: secret words are a denylist with a known ceiling (an unlisted secret-returning verb gets through); upgrade path is a per-service allow-list.
const SECRET_WORDS = /credential|password|token|secret|login|session|object|presign/
const SECRET_PAIRS = new Set(['lambda get-function', 'lambda get-function-configuration', 'cognito-idp get-user', 'ec2 get-password-data'])
// Verbs that write their result to a file named by a positional argument. Also a denylist: an unlisted one gets through.
const OUTPUT_VERBS = /^(get-(job-output|snapshot-block|media|clip|object)|get-.*(-output|-block|-media|-data-export))$/
// Reads that the secret-word denylist refuses but that return no secret. They still pass the option and output checks.
const ALLOWED_PAIRS = new Set([
  'logs filter-log-events', 'logs get-log-events', 'cloudtrail lookup-events', 'secretsmanager list-secrets', 'secretsmanager describe-secret',
  's3api list-objects-v2', 's3api list-objects', 's3api list-buckets', 'iam get-account-password-policy', 'iam get-account-summary',
])

// Splits on ; && || | outside quotes. Returns null when the text uses syntax the gate does not allow.
export function splitSegments(command: string): string[][] | null {
  const segments: string[][] = []
  let tokens: string[] = []
  let current = ''
  let started = false
  let quote: string | null = null
  const endToken = () => {
    if (started) tokens.push(current)
    current = ''
    started = false
  }
  const endSegment = () => {
    endToken()
    segments.push(tokens)
    tokens = []
  }
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]
    if (quote) {
      if (ch === quote) quote = null
      else if (quote === '"' && (ch === '$' || ch === '`' || ch === '\\')) return null
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      started = true
    } else if (ch === '&' && command[i + 1] === '&') {
      endSegment()
      i += 1
    } else if (ch === '|') {
      endSegment()
      if (command[i + 1] === '|') i += 1
    } else if (ch === ';') {
      endSegment()
    } else if (ch === ' ' || ch === '\t') {
      endToken()
    } else if (REJECTED.has(ch)) {
      return null
    } else {
      current += ch
      started = true
    }
  }
  if (quote) return null
  endSegment()
  return segments.filter((segment) => segment.length > 0)
}

// profile: when given, every aws segment must name exactly this profile and no other.
export function isReadOnlyAws(command: string, opts: { profile?: string } = {}): boolean {
  const segments = splitSegments(command)
  if (!segments || segments.length === 0 || segments[0][0] !== 'aws') return false
  return segments.every((tokens) => segmentAllowed(tokens, opts.profile))
}

function segmentAllowed(tokens: string[], profile: string | undefined): boolean {
  if (tokens.some((token) => token.startsWith('~') || SENSITIVE_PATH.test(token))) return false
  const [first, ...rest] = tokens
  if (first === 'aws') return awsAllowed(rest) && profileAllowed(rest, profile)
  return filterAllowed(first, rest)
}

function deniedOption(arg: string): boolean {
  if (!arg.startsWith('--')) return false
  const name = arg.split('=')[0]
  return DENIED_OPTIONS.some((option) => arg.startsWith(option) || (name.length >= 5 && option.startsWith(name)))
}

function awsAllowed(args: string[]): boolean {
  let i = 0
  while (i < args.length && args[i].startsWith('-')) {
    const [flag, inline] = [args[i].split('=')[0], args[i].includes('=')]
    if (GLOBAL_VALUE.has(flag)) i += inline ? 1 : 2
    else if (GLOBAL_FLAG.has(flag) && !inline) i += 1
    else return false
  }
  const [service, verb] = args.slice(i)
  if (!service || !verb) return false
  if (args.some((arg) => deniedOption(arg) || arg.includes('file://') || arg.includes('fileb://'))) return false
  if (OUTPUT_VERBS.test(verb)) return false
  // A bare positional right after the verb names a resource or a file; only an s3 URL is allowed, and only for s3 ls.
  const next = args[i + 2]
  if (next !== undefined && !next.startsWith('--') && !(service === 's3' && verb === 'ls' && next.startsWith('s3://'))) return false
  if (SECRET_SERVICES.has(service)) return false
  if (service === 's3') return verb === 'ls'
  if (service === 'sts') return verb === 'get-caller-identity'
  if (service === 'configure') return verb === 'list'
  if (ALLOWED_PAIRS.has(`${service} ${verb}`)) return true
  if (!/^(describe|list|get)-/.test(verb) || SECRET_WORDS.test(verb)) return false
  return !SECRET_PAIRS.has(`${service} ${verb}`)
}

// Matches --profile by exact value. Abbreviations of --profile count too, so a second, shorter flag cannot switch the profile.
function profileAllowed(args: string[], profile: string | undefined): boolean {
  if (profile === undefined) return true
  let found = 0
  for (let i = 0; i < args.length; i++) {
    const name = args[i].split('=')[0]
    const isProfile = name.length >= 5 && ('--profile'.startsWith(name) || args[i].startsWith('--profile'))
    if (!isProfile) continue
    const inline = args[i].includes('=')
    const value = inline ? args[i].slice(args[i].indexOf('=') + 1) : args[i + 1]
    if (value !== profile) return false
    found += 1
    if (!inline) i += 1
  }
  return found > 0
}
