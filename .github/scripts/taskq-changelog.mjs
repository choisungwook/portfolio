import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const product = 'product/akbun-taskq'
const workspace = `${product}/workspace`
// One folder per version: changelog/<version>/changelog.md holds the release notes (H1 title, then ## Added/Changed/
// Fixed/Removed/SDK), and learning_changelog.md beside it explains the code and architecture changes.
const changelogOf = (version) => `${product}/changelog/${version}/changelog.md`
const packageFile = `${workspace}/package.json`
const codePaths = [
  ...['src', 'ui', 'bin', 'scripts', 'package.json', 'package-lock.json', 'taskq.config.example.json'].map((path) => `${workspace}/${path}`),
  '.github/workflows/release-akbun-taskq.yml',
]

export function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.error) throw result.error
  return result
}

function gitOutput(args, cwd) {
  const result = git(args, cwd)
  if (result.status !== 0) throw new Error(result.stderr.trim() || 'Git comparison failed.')
  return result.stdout
}

// The file without its H1 title, when it lists at least one change; '' otherwise. GitHub shows the ## headings as is.
function versionNotes(content) {
  const notes = content.replace(/^# .*\r?\n/, '').trim()
  return /^(?:## (?:Added|Changed|Fixed|Removed))[ \t]*\r?\n(?:[ \t]*\r?\n)*- \S/m.test(notes) ? notes : ''
}

export function checkChangelog(cwd, base, head) {
  const ancestor = gitOutput(['merge-base', base, head], cwd).trim()
  if (!gitOutput(['diff', '--name-only', ancestor, head, '--', ...codePaths], cwd).trim()) return
  const { version } = JSON.parse(gitOutput(['show', `${head}:${packageFile}`], cwd))
  const changelog = changelogOf(version)
  const current = git(['show', `${head}:${changelog}`], cwd)
  const previous = git(['show', `${ancestor}:${changelog}`], cwd)
  const notes = current.status === 0 ? versionNotes(current.stdout) : ''
  if (!notes || notes === (previous.status === 0 ? versionNotes(previous.stdout) : '')) {
    throw new Error(`Update and commit ${changelog} before publishing taskq changes.`)
  }
}

export function releaseNotes() {
  const { version } = JSON.parse(readFileSync(packageFile, 'utf8'))
  const changelog = changelogOf(version)
  const notes = versionNotes(readFileSync(changelog, 'utf8'))
  if (!notes) throw new Error(`Add a non-empty ${changelog} with ## Added, Changed, Fixed or Removed.`)
  return notes
}
