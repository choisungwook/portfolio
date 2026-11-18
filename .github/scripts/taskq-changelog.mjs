import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const product = 'product/akbun-taskq'
const workspace = `${product}/workspace`
const changelog = `${product}/CHANGELOG.md`
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

function versionNotes(content, version) {
  const sections = content.split(/^##[ \t]+/m).slice(1)
  const matches = sections.filter((section) => section.split('\n', 1)[0].trim() === version)
  if (matches.length > 1) throw new Error(`${changelog} has multiple sections for ${version}.`)
  const notes = matches[0]?.split('\n').slice(1).join('\n').trim() ?? ''
  return /^(?:### (?:Added|Changed|Fixed|Removed))[ \t]*\r?\n(?:[ \t]*\r?\n)*- \S/m.test(notes) ? notes : ''
}

export function checkChangelog(cwd, base, head) {
  const ancestor = gitOutput(['merge-base', base, head], cwd).trim()
  if (!gitOutput(['diff', '--name-only', ancestor, head, '--', ...codePaths], cwd).trim()) return
  const { version } = JSON.parse(gitOutput(['show', `${head}:${packageFile}`], cwd))
  const current = git(['show', `${head}:${changelog}`], cwd)
  const previous = git(['show', `${ancestor}:${changelog}`], cwd)
  const notes = versionNotes(current.stdout, version)
  if (!notes || notes === versionNotes(previous.stdout, version)) {
    throw new Error(`Update and commit the ## ${version} section in ${changelog} before publishing taskq changes.`)
  }
}

export function releaseNotes() {
  const { version } = JSON.parse(readFileSync(packageFile, 'utf8'))
  const notes = versionNotes(readFileSync(changelog, 'utf8'), version)
  if (!notes) throw new Error(`Add a non-empty ## ${version} section to ${changelog}.`)
  return notes
}
