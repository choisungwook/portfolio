import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkChangelog, git } from '../../.github/scripts/taskq-changelog.mjs'

function ref(name, cwd) {
  const result = git(['rev-parse', '--verify', '--quiet', '--end-of-options', `${name}^{commit}`], cwd)
  return result.status === 0 ? result.stdout.trim() : undefined
}

function flag(args, long, short) {
  const index = args.findIndex((arg) => arg === long || arg === short || arg.startsWith(`${long}=`))
  if (index === -1) return undefined
  const arg = args[index]
  return arg.startsWith(`${long}=`) ? arg.slice(long.length + 1) : args[index + 1]
}

function checkPush(args, cwd) {
  const base = ref('refs/remotes/origin/master', cwd) ?? ref('refs/heads/master', cwd)
  if (!base) return
  const positional = args.filter((arg, i) => !arg.startsWith('-') && !['--repo', '-o', '--push-option', '--receive-pack', '--exec'].includes(args[i - 1]))
  if (args.includes('--delete') || args.includes('-d')) return
  const target = flag(args, '--repo', '--repo')
  const refspecs = positional.slice(target ? 0 : 1).map((item) => item.replace(/^\+/, ''))
  const namespaces = []
  const wildcard = refspecs.some((item) => item.includes('*'))
  if (wildcard || refspecs.includes(':') || args.some((arg) => ['--all', '--branches', '--mirror'].includes(arg))) namespaces.push('refs/heads')
  if (wildcard || args.some((arg) => ['--tags', '--mirror'].includes(arg))) namespaces.push('refs/tags')
  const refs = namespaces.flatMap((ns) => git(['for-each-ref', '--format=%(refname)', ns], cwd).stdout.trim().split('\n').filter(Boolean))
  const candidates = refspecs.length || namespaces.length ? refspecs.map((item) => item.split(':', 1)[0]) : ['HEAD']
  for (const name of new Set([...candidates, ...refs])) {
    const head = name && ref(name, cwd)
    if (head) checkChangelog(cwd, base, head)
  }
}

function checkPr(args, cwd) {
  const branch = flag(args, '--base', '-B') ?? 'master'
  const base = ref(`refs/remotes/origin/${branch}`, cwd) ?? ref(`refs/heads/${branch}`, cwd)
  const name = flag(args, '--head', '-H')?.split(':').at(-1) ?? 'HEAD'
  const head = ref(name, cwd) ?? ref(`refs/remotes/origin/${name}`, cwd)
  if (base && head) checkChangelog(cwd, base, head)
}

function* shellCommands(command) {
  let args = []
  let end = -1
  for (const match of command.matchAll(/"(?:\\.|[^"\\])*"|'[^']*'|\\[^\n]|[;&|\n]+|[^\s;&|"'\x5c]+/g)) {
    const token = match[0]
    if (/^[;&|\n]+$/.test(token)) {
      if (args.length > 0) yield args
      args = []
    } else {
      const part = token.replace(/^(['"])(.*)\1$/s, '$2').replace(/^\\(.)$/s, '$1')
      if (args.length > 0 && match.index === end) args[args.length - 1] += part
      else args.push(part)
    }
    end = match.index + token.length
  }
  if (args.length > 0) yield args
}

try {
  const { cwd, tool_input: input } = JSON.parse(readFileSync(0, 'utf8'))
  const command = (input?.command ?? '').replace(/\\\r?\n/g, '')
  let directory = resolve(cwd, input?.workdir ?? '.')
  for (const args of shellCommands(command)) {
    if (args[0] === 'cd' && args[1]) directory = resolve(directory, args[1])
    const executable = args[0]?.split('/').at(-1)
    if (executable === 'git') {
      let workdir = directory
      let index = 1
      while (['-C', '-c'].includes(args[index]) && args[index + 1]) {
        if (args[index] === '-C') workdir = resolve(workdir, args[index + 1])
        index += 2
      }
      if (args[index] === 'push') checkPush(args.slice(index + 1), workdir)
    }
    if (executable === 'gh' && args[1] === 'pr' && args[2] === 'create') checkPr(args.slice(3), directory)
  }
} catch (error) {
  console.error(`taskq changelog check: ${error.message}`)
  process.exitCode = 2
}
