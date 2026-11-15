// Option table for the text filters that may follow an aws call. An option missing from the table is denied, and so is
// an operand beyond the limit. Filters read stdin, so an operand is a file name in disguise. A value is never an
// operand and may not contain a slash or start with ~.

type Kind = 'digits' | 'list' | 'any'

interface Spec {
  flags: string[]                 // options that take no value
  values?: Record<string, Kind>   // options that take one value
  pairs?: string[]                // options that take a name and a value
  operands: number                // operands allowed
  patternOption?: string          // grep -e supplies the pattern, so one operand fewer
  shorthandCount?: boolean        // head and tail accept -N as -n N
}

const SPECS: Record<string, Spec> = {
  echo: { flags: [], operands: Infinity },
  head: { flags: [], values: { '-n': 'digits', '-c': 'digits' }, operands: 0, shorthandCount: true },
  tail: { flags: [], values: { '-n': 'digits', '-c': 'digits' }, operands: 0, shorthandCount: true },
  wc: { flags: ['-l', '-w', '-c', '-m'], operands: 0 },
  cut: { flags: [], values: { '-d': 'any', '-f': 'list', '-c': 'list' }, operands: 0 },
  sort: { flags: ['-n', '-r', '-u', '-f', '-b', '-h'], values: { '-k': 'any', '-t': 'any' }, operands: 0 },
  grep: {
    flags: ['-i', '-v', '-E', '-F', '-c', '-o', '-w', '-n', '-x'],
    values: { '-A': 'digits', '-B': 'digits', '-C': 'digits', '-m': 'digits', '-e': 'any' },
    operands: 1,
    patternOption: '-e',
  },
  tr: { flags: ['-d', '-s', '-c'], operands: 2 },
  jq: {
    flags: ['-r', '-c', '-s', '-e', '-M', '-S', '-j', '-a', '--raw-output', '--compact-output', '--slurp', '--exit-status', '--sort-keys'],
    pairs: ['--arg', '--argjson'],
    operands: 1,
  },
}

const VALUE_PATTERN: Record<Kind, RegExp> = { digits: /^\d+$/, list: /^[\d,-]+$/, any: /^.+$/s }

function valueOk(kind: Kind, value: string | undefined): boolean {
  if (value === undefined || value.includes('/') || value.startsWith('~')) return false
  return VALUE_PATTERN[kind].test(value)
}

export function filterAllowed(name: string, args: string[]): boolean {
  const spec = SPECS[name]
  if (!spec) return false
  if (name === 'jq' && args.some((arg) => /\benv\b/i.test(arg))) return false
  let operands = 0
  let patternGiven = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '-' || !arg.startsWith('-')) {
      if (arg.includes('/')) return false
      operands += 1
      continue
    }
    if (spec.flags.includes(arg)) continue
    if (spec.pairs?.includes(arg)) {
      if (!valueOk('any', args[i + 1]) || !valueOk('any', args[i + 2])) return false
      i += 2
      continue
    }
    const kind = spec.values?.[arg]
    if (kind !== undefined) {
      if (!valueOk(kind, args[i + 1])) return false
      i += 1
      if (arg === spec.patternOption) patternGiven = true
      continue
    }
    // Joined forms: -n5, -d, -fLIST, and head/tail's -5.
    const short = arg.slice(0, 2)
    const joined = spec.values?.[short]
    if (joined !== undefined && arg.length > 2) {
      if (!valueOk(joined, arg.slice(2))) return false
      if (short === spec.patternOption) patternGiven = true
      continue
    }
    if (!(spec.shorthandCount && /^-\d+$/.test(arg))) return false
  }
  return operands <= spec.operands - (patternGiven ? 1 : 0)
}
