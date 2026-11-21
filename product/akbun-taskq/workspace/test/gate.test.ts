import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { decide, type GateContext } from '../src/worker/gate.ts'
import type { TaskType } from '../src/types.ts'

// A real temp tree: outputs/skills-link and outputs/dangling are symlinks that the gate must see through.
const base = mkdtempSync(join(tmpdir(), 'gate-test-'))
const home = join(base, 'home')
const outputs = join(home, 'outputs')
const repo = join(base, 'repo')
const dataDir = join(home, 'data')
const skills = join(base, 'skills')
for (const dir of [outputs, join(repo, 'src'), dataDir, skills]) mkdirSync(dir, { recursive: true })
symlinkSync(skills, join(outputs, 'skills-link'))
symlinkSync(join(base, 'missing'), join(outputs, 'dangling'))
symlinkSync(join(homedir(), '.ssh'), join(outputs, 'ssh-link'))
after(() => rmSync(base, { recursive: true, force: true }))

const ctxOf = (type: TaskType): GateContext => ({
  cwd: type === 'code' ? repo : outputs, outputs, repo, dataDir, profile: 'target',
})
const bash = (command: string, extra: Record<string, unknown> = {}) => ({ command, ...extra })
const sensitive = (...parts: string[]) => join(homedir(), ...parts)

type Row = [TaskType, string, Record<string, unknown>, 'allow' | 'deny' | 'ask', string?]

// Rows that guard an invariant. Their test names carry [critical].
const critical = new Set<unknown[]>()
const mark = (row: Row): Row => (critical.add(row), row)
const markAccess = <T extends unknown[]>(row: T): T => (critical.add(row), row)

const table: Row[] = [
  // every type: sandbox escape, MCP tools and sensitive or data paths
  ['research', 'Bash', bash('ls', { dangerouslyDisableSandbox: true }), 'deny'],
  ['code', 'Bash', bash('npm test', { dangerouslyDisableSandbox: true }), 'deny'],
  mark(['ops_change', 'Bash', bash('aws s3 ls', { dangerouslyDisableSandbox: true }), 'deny']),
  ['code', 'mcp__example__do', {}, 'deny'],
  ['ops_change', 'mcp__example__do', {}, 'deny'],
  ['research', 'Read', { file_path: sensitive('.aws', 'credentials') }, 'deny'],
  ['research', 'Read', { file_path: sensitive('.aws', 'config') }, 'deny'],
  ['research', 'Read', { file_path: sensitive('.ssh', 'config') }, 'deny'],
  ['research', 'Read', { file_path: sensitive('.gnupg', 'pubring.kbx') }, 'deny'],
  ['research', 'Read', { file_path: sensitive('.netrc') }, 'deny'],
  ['research', 'Read', { file_path: sensitive('.kube', 'config') }, 'deny'],
  ['research', 'Read', { file_path: sensitive('.docker', 'config.json') }, 'deny'],
  ['research', 'Read', { file_path: sensitive('.config', 'gh', 'hosts.yml') }, 'deny'],
  ['research', 'Read', { file_path: sensitive('.claude', 'settings.json') }, 'deny'],
  ['research', 'Read', { file_path: sensitive('.claude', 'skills', 'deploy', 'SKILL.md') }, 'allow', 'skills are readable'],
  ['research', 'Write', { file_path: sensitive('.claude', 'skills', 'deploy', 'SKILL.md') }, 'deny', 'skills are not writable'],
  ['research', 'Read', { file_path: join(dataDir, 'taskq.db') }, 'deny'],
  ['research', 'Grep', { pattern: 'x', path: dataDir }, 'deny'],
  ['research', 'Read', { file_path: join(home, 'taskq.config.json') }, 'deny'],
  ['code', 'Read', { file_path: join(repo, '.env') }, 'deny'],
  ['code', 'Read', { file_path: join(repo, '.env.production') }, 'deny'],
  ['code', 'Read', { file_path: join(repo, 'web', '.env') }, 'deny'],
  ['code', 'Read', { file_path: join(repo, 'secrets', 'credentials') }, 'deny'],
  ['code', 'Read', { file_path: join(repo, 'keys', 'id_rsa') }, 'deny'],
  ['code', 'Read', { file_path: join(repo, 'keys', 'id_ed25519') }, 'deny'],
  ['code', 'Read', { file_path: join(repo, 'tls', 'server.pem') }, 'deny'],
  ['code', 'Read', { file_path: join(repo, 'tls', 'server.key') }, 'deny'],
  ['code', 'Write', { file_path: join(repo, '.env') }, 'deny'],
  ['code', 'Read', { file_path: join(repo, 'src', 'credentials.ts') }, 'allow', 'a name must match exactly'],
  ['code', 'Read', { file_path: join(repo, 'src', 'a.ts') }, 'allow'],

  // paths resolve through symlinks on the deepest existing ancestor
  ['research', 'Read', { file_path: join(outputs, 'ssh-link', 'config') }, 'deny', 'symlink into ~/.ssh'],
  ['ops_change', 'Read', { file_path: join(outputs, 'ssh-link', 'config') }, 'deny', 'symlink into ~/.ssh'],
  ['research', 'Read', { file_path: join(outputs, 'skills-link', 'x.md') }, 'allow', 'research reads anywhere but sensitive'],
  ['research', 'Write', { file_path: join(outputs, 'skills-link', 'x.md') }, 'deny', 'symlink out of outputs'],
  ['security_review', 'Write', { file_path: join(outputs, 'skills-link', 'x.md') }, 'deny', 'symlink out of outputs'],
  ['security_review', 'Write', { file_path: join(outputs, 'dangling', 'x.md') }, 'deny', 'dangling symlink out of outputs'],
  mark(['ops_read', 'Read', { file_path: join(outputs, 'skills-link', 'x.md') }, 'deny', 'symlink out of cwd']),
  ['security_review', 'Write', { file_path: join(outputs, 'new-dir', 'x.md') }, 'allow', 'new path under outputs'],

  // ops_read: reads inside cwd or outputs, read-only aws, skills, nothing else
  ['ops_read', 'Read', { file_path: join(outputs, 'a.md') }, 'allow'],
  ['ops_read', 'Read', { file_path: join(repo, 'a.ts') }, 'deny'],
  ['ops_read', 'Grep', { pattern: 'x' }, 'allow'],
  ['ops_read', 'Glob', { pattern: '*.md' }, 'allow'],
  ['ops_read', 'Skill', { skill: 'aws-login' }, 'allow'],
  ['ops_read', 'Bash', bash('aws ec2 describe-instances --profile target | jq .'), 'allow'],
  ['ops_read', 'Bash', bash('aws ec2 describe-instances'), 'deny', 'no target profile'],
  mark(['ops_read', 'Bash', bash('aws ec2 terminate-instances --instance-ids i --profile target'), 'deny']),
  ['ops_read', 'Bash', bash('aws ec2 describe-instances | sh'), 'deny'],
  mark(['ops_read', 'Write', { file_path: join(outputs, 'a.md') }, 'deny']),
  mark(['ops_read', 'mcp__example__do', {}, 'deny']),
  mark(['ops_read', 'Read', { file_path: sensitive('.aws', 'credentials') }, 'deny']),
  ['ops_read', 'Edit', { file_path: join(outputs, 'a.md') }, 'deny'],
  ['ops_read', 'WebFetch', { url: 'https://example.com' }, 'deny'],
  ['ops_read', 'Agent', {}, 'deny'],
  mark(['ops_read', 'SomethingNew', {}, 'deny']),

  // ops_change: reads inside cwd or outputs and read-only aws pass; everything else asks
  ['ops_change', 'Read', { file_path: join(outputs, 'a.md') }, 'allow'],
  ['ops_change', 'Read', { file_path: join(repo, 'a.ts') }, 'ask'],
  ['ops_change', 'Skill', { skill: 'aws-login' }, 'allow'],
  ['ops_change', 'Bash', bash('aws s3 ls --profile target'), 'allow'],
  mark(['ops_change', 'Bash', bash('aws ec2 stop-instances --instance-ids i --profile target'), 'ask']),
  ['ops_change', 'Bash', bash('ls'), 'ask'],
  ['ops_change', 'Write', { file_path: join(outputs, 'a.md') }, 'ask'],
  ['ops_change', 'NotebookEdit', { notebook_path: join(outputs, 'a.ipynb') }, 'ask'],
  ['ops_change', 'Monitor', {}, 'ask'],
  ['ops_change', 'Agent', {}, 'ask'],
  ['ops_change', 'SomethingNew', {}, 'ask'],

  // security_review: reads in repo or outputs, writes only under outputs, one git read command
  ['security_review', 'Read', { file_path: join(repo, 'src', 'a.ts') }, 'allow'],
  ['security_review', 'Read', { file_path: join(base, 'other.txt') }, 'deny'],
  ['security_review', 'Read', { file_path: join(repo, '.env') }, 'deny'],
  ['security_review', 'Grep', { pattern: 'x', path: repo }, 'allow'],
  ['security_review', 'Grep', { pattern: 'x', path: join(base, 'other') }, 'deny'],
  ['security_review', 'Glob', { pattern: '**/*.ts', path: repo }, 'allow'],
  ['security_review', 'Write', { file_path: join(outputs, 'review.md') }, 'allow'],
  ['security_review', 'Write', { file_path: join(base, 'escape.md') }, 'deny'],
  ['security_review', 'Write', { file_path: join(outputs, '..', 'review.md') }, 'deny'],
  ['security_review', 'Write', {}, 'deny'],
  ['security_review', 'Edit', { file_path: join(outputs, 'review.md') }, 'deny'],
  ['security_review', 'Bash', bash(`git -C ${repo} diff --no-ext-diff --no-textconv --text abc123`), 'allow'],
  ['security_review', 'Bash', bash(`git -C ${repo} log --oneline abc123..HEAD`), 'allow'],
  ['security_review', 'Bash', bash(`git -C ${repo} show --no-ext-diff --no-textconv HEAD`), 'allow'],
  ['security_review', 'Bash', bash(`git -C ${repo} diff abc123`), 'deny', 'diff without the no-ext/no-textconv flags'],
  ['security_review', 'Bash', bash(`git -C ${repo} show HEAD`), 'deny', 'show without the flags'],
  ['security_review', 'Bash', bash(`git -C ${repo} diff --no-ext-diff --no-textconv --outp=${base}/x HEAD`), 'deny', 'abbreviated --output'],
  ['security_review', 'Bash', bash(`git -C ${repo} diff --no-ext-diff --no-textconv --output=${base}/x HEAD`), 'deny'],
  ['security_review', 'Bash', bash(`git -C ${repo} log --ext-diff -p`), 'deny', 'abbreviated --ext-diff'],
  ['security_review', 'Bash', bash(`git -C ${repo} log --textconv -p`), 'deny'],
  ['security_review', 'Bash', bash(`git -C ${repo} log -O/tmp/order`), 'deny'],
  ['security_review', 'Bash', bash(`git -C ${repo} log -pO/tmp/order`), 'deny', 'short flags bundled with -O'],
  ['security_review', 'Bash', bash(`git -C ${repo} log --no-index`), 'deny'],
  ['security_review', 'Bash', bash(`git -C ${repo} log | sh`), 'deny'],
  ['security_review', 'Bash', bash(`git -C ${repo} log && rm -rf x`), 'deny'],
  ['security_review', 'Bash', bash(`git -C ${repo} -c core.pager=x log`), 'deny'],
  ['security_review', 'Bash', bash(`git -C ${repo}/ log`), 'deny', 'repo must equal exactly'],
  ['security_review', 'Bash', bash(`git -C ${base}/other log`), 'deny', 'another repo'],
  ['security_review', 'Bash', bash('git log'), 'deny', 'no -C'],
  ['security_review', 'Bash', bash(`git -C ${repo} status`), 'deny'],
  ['security_review', 'Bash', bash('ls'), 'deny'],
  ['security_review', 'Bash', bash('aws s3 ls'), 'deny'],
  ['security_review', 'Skill', { skill: 'x' }, 'deny'],
  ['security_review', 'NotebookEdit', { notebook_path: join(outputs, 'a.ipynb') }, 'deny'],

  // research: reads anywhere except sensitive, writes only under outputs, network and shell allowed
  ['research', 'Write', { file_path: join(outputs, 'a.md') }, 'allow'],
  ['research', 'Write', { file_path: join(base, 'a.md') }, 'deny'],
  ['research', 'Edit', { file_path: join(base, 'a.md') }, 'deny'],
  ['research', 'Read', { file_path: '/etc/hosts' }, 'allow'],
  ['research', 'WebFetch', { url: 'https://example.com' }, 'allow'],
  ['research', 'WebSearch', { query: 'x' }, 'allow'],
  ['research', 'Bash', bash('ls'), 'allow'],
  ['research', 'Monitor', {}, 'deny'],
  ['research', 'NotebookEdit', { notebook_path: join(outputs, 'a.ipynb') }, 'deny'],
  ['research', 'Skill', { skill: 'x' }, 'deny', 'unknown to research'],

  // code: read and write inside the repo or outputs, shell allowed, no web or monitor
  ['code', 'Write', { file_path: join(repo, 'src', 'a.ts') }, 'allow'],
  ['code', 'Edit', { file_path: join(repo, 'src', 'a.ts') }, 'allow'],
  ['code', 'Write', { file_path: join(base, 'outside.ts') }, 'deny'],
  ['code', 'Read', { file_path: '/etc/hosts' }, 'deny'],
  ['code', 'Bash', bash('npm test'), 'allow'],
  ['code', 'WebFetch', { url: 'https://example.com' }, 'deny'],
  ['code', 'WebSearch', { query: 'x' }, 'deny'],
  ['code', 'Monitor', {}, 'deny'],
  ['code', 'SomethingNew', {}, 'deny'],

  // Glob and Grep: the pattern counts as a path when it has a slash or a tilde
  ['research', 'Glob', { pattern: '~/.a*/cred*' }, 'deny', 'glob into ~/.aws'],
  ['research', 'Glob', { pattern: '*/id_*', path: sensitive('.ssh') }, 'deny'],
  ['research', 'Grep', { pattern: 'aws_secret', path: '~/.a*' }, 'deny', 'home glob'],
  ['research', 'Grep', { pattern: 'x', path: sensitive('.ssh') }, 'deny'],
  ['research', 'Glob', { pattern: `${dataDir}/*.db` }, 'deny', 'glob into data'],
  ['research', 'Glob', { pattern: '**/*.md', path: outputs }, 'allow'],
  ['research', 'Glob', { pattern: '{.ssh,x}/config' }, 'allow', 'no home root'],
  ['code', 'Glob', { pattern: '**/*.ts' }, 'allow'],
  ['code', 'Glob', { pattern: '**/*' }, 'deny', 'can match .env in the repo'],
  ['code', 'Glob', { pattern: '~/.s[s]h/id_*' }, 'deny', 'character class into ~/.ssh'],
  ['code', 'Glob', { pattern: '~/.{ssh,aws}/*' }, 'deny', 'brace alternatives into ~/.ssh'],
  ['ops_read', 'Glob', { pattern: '~/.a*/*' }, 'deny'],
  // The worker returns its result through StructuredOutput; every type must allow it or every run fails.
  ['research', 'StructuredOutput', { outcome: 'done', summary: 'x' }, 'allow'],
  ['ops_read', 'StructuredOutput', { outcome: 'done', summary: 'x' }, 'allow'],
  ['security_review', 'StructuredOutput', { outcome: 'done', summary: 'x' }, 'allow'],
]

describe('decide table', () => {
  for (const row of table) {
    const [type, tool, input, expected, note] = row
    test(`${critical.has(row) ? '[critical] ' : ''}${type} ${tool} ${JSON.stringify(input).slice(0, 70)} -> ${expected}${note ? ` (${note})` : ''}`, () => {
      assert.equal(decide(type, tool, input, ctxOf(type)), expected)
    })
  }
})

// The registered access skill folder of a task: read-only for every type, reads allowed there, writes denied.
describe('access skill folder', () => {
  const skill = join(base, 'access', 'example-readonly')
  mkdirSync(skill, { recursive: true })
  mkdirSync(join(base, 'access', 'other'), { recursive: true })
  writeFileSync(join(skill, 'SKILL.md'), 'x')
  writeFileSync(join(base, 'access', 'other', 'SKILL.md'), 'x')
  writeFileSync(join(base, 'outside-secret.txt'), 'x')
  writeFileSync(join(skill, '.env'), 'x')
  symlinkSync(join(base, 'outside-secret.txt'), join(skill, 'leak'))
  const withSkill = (type: TaskType): GateContext => ({ ...ctxOf(type), accessSkill: skill })
  const file = (name: string) => ({ file_path: join(skill, name) })

  const rows: [TaskType, string, Record<string, unknown>, 'allow' | 'deny' | 'ask', boolean, string?][] = [
    ['ops_read', 'Read', file('SKILL.md'), 'allow', true, 'reads inside the skill folder'],
    ['ops_read', 'Read', file('SKILL.md'), 'deny', false, 'no access skill on this task'],
    ['ops_change', 'Read', file('SKILL.md'), 'allow', true],
    ['code', 'Grep', { pattern: 'x', path: skill }, 'allow', true],
    ['research', 'Glob', { pattern: '**/*.md', path: skill }, 'allow', true],
    ['security_review', 'Read', file('SKILL.md'), 'allow', true],
    ['ops_read', 'Read', { file_path: join(base, 'access', 'other', 'SKILL.md') }, 'deny', true, 'another skill folder'],
    ['ops_read', 'Read', file('.env'), 'deny', true, 'sensitive name inside the folder'],
    ['ops_read', 'Read', file('leak'), 'deny', true, 'symlink inside the folder pointing outside'],
    ['code', 'Read', file('leak'), 'deny', true, 'symlink inside the folder pointing outside'],
    ['ops_change', 'Read', file('leak'), 'ask', true, 'outside reads of ops_change ask'],
    ['research', 'Write', file('new.md'), 'deny', true],
    ['code', 'Write', file('new.md'), 'deny', true],
    ['code', 'Edit', file('SKILL.md'), 'deny', true],
    ['ops_read', 'Write', file('new.md'), 'deny', true],
    ['ops_change', 'Write', file('new.md'), 'deny', true, 'ask would be the default'],
    markAccess(['ops_change', 'Edit', file('SKILL.md'), 'deny', true]),
    ['security_review', 'Write', file('new.md'), 'deny', true],
    ['security_review', 'Edit', file('SKILL.md'), 'deny', true],
  ]
  for (const row of rows) {
    const [type, tool, input, expected, withAccess, note] = row
    test(`${critical.has(row) ? '[critical] ' : ''}${type} ${tool} ${JSON.stringify(input).slice(0, 60)} with access skill=${withAccess} -> ${expected}${note ? ` (${note})` : ''}`, () => {
      assert.equal(decide(type, tool, input, withAccess ? withSkill(type) : ctxOf(type)), expected)
    })
  }
})
