import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../src/config.ts'
import type { Db } from '../src/db/open.ts'
import { createFromInput } from '../src/db/tasks.ts'

// A demo repository and a code task working in its own worktree with a few changes, for the task detail's workspace.
// It is a draft: the demo must hold no ready task.
export function seedWorkspace(db: Db, config: Config, home: string): void {
  const repo = join(home, 'src', 'demo-app')
  mkdirSync(repo, { recursive: true })
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.email=demo@example.com', '-c', 'user.name=demo', ...args], { stdio: 'ignore' })
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'README.md'), '# demo-app\n\nRetries: 5\n')
  writeFileSync(join(repo, 'export.ts'), 'export const RETRIES = 5\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-q', '-m', 'init')
  git(repo, 'remote', 'add', 'origin', 'https://github.com/example/demo-app.git')
  const task = createFromInput(db, {
    type: 'code', status: 'draft', priority: 0, lock_key: null, depends_on: [],
    data: { title: 'Stop the export job after 3 retries', intent: 'Lower the export retry limit to 3 and document it', repo },
  }, 'coder', config)
  const tree = task.data.repo!
  writeFileSync(join(tree, 'export.ts'), 'export const RETRIES = 3\n')
  writeFileSync(join(tree, 'README.md'), '# demo-app\n\nRetries: 3 (the job stops after the third failure)\n')
  git(tree, 'commit', '-q', '-am', 'Lower export retries to 3')
  writeFileSync(join(tree, 'CHANGELOG.md'), '- export retries 5 -> 3\n')
}
