import { strict as assert } from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, test } from 'node:test'
import { exitCodeOf } from '../src/cli/command.ts'
import { COMMANDS } from '../src/cli/commands/index.ts'
import { EXIT_CODES, KeychainError, type ErrorCode } from '../src/core/errors.ts'
import { PASSWORD, cli, encodings, pw, useTempHome } from './helpers.ts'

const SECRET = 'ghp_CliSecretValue_0123456789'

describe('commands with --password-stdin', () => {
  test('init, set, get, list, edit, rm, verify, passwd and audit work end to end', () => {
    useTempHome()
    assert.equal(cli(['init', '--password-stdin'], pw()).status, 0)
    assert.equal(cli(['set', 'github/token', '--tag', 'github', '--description', 'repo read', '--password-stdin'], pw(SECRET)).status, 0)

    const got = cli(['get', 'github/token', '--password-stdin'], pw())
    assert.equal(got.status, 0, got.stderr)
    assert.equal(got.stdout, `${SECRET}\n`)

    const listed = JSON.parse(cli(['list', '--json']).stdout)
    assert.equal(listed.verified, false)
    assert.deepEqual(listed.entries.map((entry: { name: string }) => entry.name), ['github/token'])

    assert.equal(cli(['edit', 'github/token', '--ai-access', 'reveal', '--rename', 'github/pat', '--password-stdin'], pw()).status, 0)
    assert.equal(cli(['get', 'github/pat', '--password-stdin'], pw()).stdout, `${SECRET}\n`)
    assert.equal(cli(['verify', '--password-stdin'], pw()).status, 0)

    const multi = 'line one\nline two'
    assert.equal(cli(['set', 'multi/line', '--password-stdin'], pw(multi)).status, 0)
    assert.equal(cli(['get', 'multi/line', '--password-stdin'], pw()).stdout, `${multi}\n`)

    const changed = cli(['passwd', '--password-stdin'], `${PASSWORD}\nan even longer root password\n`)
    assert.equal(changed.status, 0, changed.stderr)
    assert.equal(cli(['get', 'github/pat', '--password-stdin'], pw()).status, 4)
    assert.equal(cli(['rm', 'github/pat', '--password-stdin'], 'an even longer root password\n').status, 0)
    assert.equal(cli(['get', 'github/pat', '--password-stdin'], 'an even longer root password\n').status, 7)

    const audit = JSON.parse(cli(['audit', '--json']).stdout) as { op: string }[]
    assert.deepEqual(
      audit.map((line) => line.op),
      ['create', 'reveal', 'update', 'rename', 'reveal', 'create', 'reveal', 'passwd', 'delete', 'reveal'],
    )
  })

  test('a wrong password exits 4 and a missing vault exits 1', () => {
    useTempHome()
    assert.equal(cli(['get', 'x', '--password-stdin'], pw()).status, 1)
    cli(['init', '--password-stdin'], pw())
    const wrong = cli(['get', 'x', '--password-stdin'], 'not the password at all\n')
    assert.equal(wrong.status, 4)
    assert.match(wrong.stderr, /^BAD_PASSWORD: .+\n$/)
  })

  test('[critical] no command accepts a password or a value as an argument', () => {
    useTempHome()
    cli(['init', '--password-stdin'], pw())
    const attempts = [
      ['set', 'k', SECRET],
      ['set', 'k', '--value', SECRET],
      ['init', '--password', PASSWORD],
      ['unlock', '--password', PASSWORD],
      ['get', 'k', PASSWORD],
      ['passwd', PASSWORD, 'new password here'],
      ['rm', 'k', '--password', PASSWORD],
    ]
    for (const args of attempts) {
      const run = cli(args, '')
      assert.equal(run.status, 2, `${args.join(' ')}: ${run.stderr}`)
      assert.match(run.stderr, /^USAGE: /)
      for (const form of [SECRET, PASSWORD]) assert.ok(!run.stderr.includes(form), 'the rejected input is echoed')
    }
    for (const command of COMMANDS) {
      for (const option of command.options) assert.ok(!/password$|^value$|secret/.test(option.name), `${command.name} --${option.name}`)
    }
  })

  test('[critical] secrets, the password and the key appear nowhere but in the stdout of get', () => {
    const home = useTempHome()
    const outputs: string[] = []
    const run = (args: string[], input?: string) => {
      const result = cli(args, input)
      outputs.push(args[0] === 'get' ? result.stderr : result.stdout + result.stderr)
      return result
    }
    run(['init', '--password-stdin'], pw())
    run(['set', 'a/key', '--password-stdin'], pw(SECRET))
    run(['get', 'a/key', '--password-stdin'], pw())
    run(['get', 'a/key'], '')
    run(['list'])
    run(['list', '--json'])
    run(['status', '--json'])
    run(['edit', 'a/key', '--description', 'd', '--password-stdin'], pw())
    run(['verify', '--password-stdin'], pw())
    run(['unlock', '--password-stdin'], pw())
    run(['status'])
    run(['list'])
    run(['get', 'a/key'], '')
    run(['run', '--env', 'V=a/key', '--', process.execPath, '-e', 'console.log(process.env.V); console.error(process.env.V)'])
    run(['run', '--env', 'V=a/key', '--', process.execPath, '-e', 'process.exit(3)'])
    run(['lock'])
    run(['passwd', '--password-stdin'], `${PASSWORD}\nsecond root password here\n`)
    run(['rm', 'a/key', '--password-stdin'], 'second root password here\n')
    run(['audit'])
    run(['audit', '--json'])

    const files = readdirSync(home).filter((name) => name.startsWith('audit'))
    const haystacks = [...outputs, ...files.map((name) => readFileSync(join(home, name), 'utf8'))]
    const vault = JSON.parse(readFileSync(join(home, 'vault.json.bak'), 'utf8'))
    const needles = [...encodings(SECRET), ...encodings(PASSWORD), vault.wrapped_key.ciphertext]
    for (const haystack of haystacks) {
      for (const needle of needles) assert.ok(!haystack.includes(needle), `found a secret form in: ${haystack.slice(0, 120)}`)
    }
  })
})

describe('help', () => {
  const visible = COMMANDS.filter((command) => !command.hidden)
  const SECTIONS = ['Usage:', 'What it does:', 'Needs:', 'Arguments:', 'Examples:', 'Exit codes:', 'If it fails:']

  test('every command has the seven sections in order, two examples, and 80 columns at most', () => {
    useTempHome()
    for (const command of visible) {
      const run = cli([command.name, '--help'])
      assert.equal(run.status, 0, command.name)
      const lines = run.stdout.split('\n')
      const positions = SECTIONS.map((section) => lines.indexOf(section))
      assert.ok(positions.every((position) => position >= 0), `${command.name} is missing a section`)
      assert.deepEqual(positions, [...positions].sort((a, b) => a - b), `${command.name} sections out of order`)
      assert.ok(command.examples.length >= 2, `${command.name} needs two examples`)
      for (const line of lines) assert.ok(line.length <= 80, `${command.name}: ${line}`)
    }
    for (const line of cli(['--help']).stdout.split('\n')) assert.ok(line.length <= 80, line)
  })

  test('help --json lists the same commands the parser accepts', () => {
    const table = JSON.parse(cli(['help', '--json']).stdout) as { commands: { name: string }[] }
    assert.deepEqual(table.commands.map((command) => command.name), visible.map((command) => command.name))
    for (const command of visible) assert.notEqual(cli([command.name, '--help']).status, 2)
  })

  test('a usage error is one line naming the mistake and the help command, exit 2', () => {
    const run = cli(['list', '--bogus'])
    assert.equal(run.status, 2)
    assert.equal(run.stderr, 'USAGE: unknown option --bogus. Run: akbun-keychain list --help\n')
  })
})

test('every error code maps to the exit code in the interfaces table', () => {
  const expected: Record<string, number> = {
    LOCKED: 3, BAD_TOKEN: 3, DENIED: 4, BAD_PASSWORD: 4, NOT_FOUND: 7, EXISTS: 8, INVALID: 2, USAGE: 2,
    INTEGRITY: 5, LOCK_TIMEOUT: 6, SPAWN_FAILED: 125, TIMEOUT: 124, NOT_INITIALIZED: 1, ALREADY_INITIALIZED: 8, UNEXPECTED: 1,
  }
  assert.deepEqual(Object.keys(EXIT_CODES).sort(), Object.keys(expected).sort())
  for (const code of Object.keys(EXIT_CODES) as ErrorCode[]) {
    assert.equal(exitCodeOf(new KeychainError(code, 'x')), expected[code], code)
  }
})

test('every error printed by the CLI is one line: code, what happened, what to do', () => {
  useTempHome()
  const failures = [
    cli(['get', 'x', '--password-stdin'], pw()),
    cli(['run', '--env', 'A=b', '--', 'true']),
    cli(['init', '--password-stdin'], 'short\n'),
  ]
  for (const failure of failures) {
    assert.match(failure.stderr, /^[A-Z_]+: [^\n]+: [^\n]+\n$/, failure.stderr)
  }
})
