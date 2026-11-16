import { homedir } from 'node:os'
import { join } from 'node:path'
import type { PermissionMode, SandboxSettings } from '@anthropic-ai/claude-agent-sdk'
import type { Config } from '../../config.ts'
import type { Task } from '../../types.ts'

export interface Profile {
  permissionMode: PermissionMode
  allowedTools?: string[]
  cwd: string
  additionalDirectories: string[]
  settingSources: ('user' | 'project')[]
  sandbox: SandboxSettings
}

const READ_TOOLS = ['Read', 'Grep', 'Glob']

export function outputsOf(config: Config): string {
  return join(config.home, 'outputs')
}

// Per-type SDK options from the design's Worker table. The PreToolUse hook (gate.ts) is the policy: a hook deny holds in
// every mode and the hook reads the path and the command text. allowedTools only spares the prompt for calls the gate allows.
export function profileFor(task: Task, config: Config): Profile {
  const outputs = outputsOf(config)
  const plain = (permissionMode: PermissionMode, allowedTools: string[] | undefined, cwd: string, allowWrite: string[] = config.sandbox.allowWrite): Profile => ({
    permissionMode, allowedTools, cwd, additionalDirectories: [], settingSources: ['user'], sandbox: sandboxFor(config, allowWrite),
  })
  switch (task.type) {
    case 'research': {
      const mode: PermissionMode = config.autoMode ? 'auto' : 'acceptEdits'
      const allowed = config.autoMode ? undefined : [...READ_TOOLS, 'WebFetch', 'WebSearch', 'Write', 'Edit']
      return plain(mode, allowed, outputs, [outputs])
    }
    case 'code': {
      const repo = requireRepo(task)
      const mode: PermissionMode = config.autoMode ? 'auto' : 'acceptEdits'
      const allowed = config.autoMode ? undefined : [
        ...READ_TOOLS, 'Edit', 'Write', 'Bash(git diff *)', 'Bash(git status)', 'Bash(git log *)', 'Bash(npm test)', 'Bash(npm run *)',
      ]
      const profile = plain(mode, allowed, repo, [repo, ...config.sandbox.allowWrite])
      return config.trustedRepos.includes(repo) ? { ...profile, settingSources: ['user', 'project'] } : profile
    }
    case 'security_review': {
      const repo = requireRepo(task)
      return {
        ...plain('dontAsk', [...READ_TOOLS, 'Bash(git -C * diff *)', 'Bash(git -C * log *)', 'Bash(git -C * show *)', 'Write'], outputs, [outputs]),
        additionalDirectories: [repo],
      }
    }
    case 'ops_read':
      return plain('dontAsk', [...READ_TOOLS, 'Skill', 'Bash(aws *)'], outputs)
    case 'ops_change':
      // No bare Bash: every Bash call reaches canUseTool and waits for the user.
      return plain('default', [...READ_TOOLS, 'Skill'], outputs)
  }
}

// The data directory and the credential directories are denied for reads. ~/.aws stays readable: aws commands need its config.
function sandboxFor(config: Config, allowWrite: string[]): SandboxSettings {
  const home = homedir()
  return {
    enabled: config.sandbox.enabled,
    failIfUnavailable: true,
    allowUnsandboxedCommands: false,
    filesystem: {
      allowWrite,
      denyRead: [
        join(config.home, 'data'), join(config.home, 'taskq.config.json'),
        join(home, '.ssh'), join(home, '.gnupg'), join(home, '.netrc'), join(home, '.kube'), join(home, '.docker'), join(home, '.config', 'gh'),
      ],
    },
    network: { allowedDomains: config.sandbox.allowedDomains },
  }
}

function requireRepo(task: Task): string {
  if (!task.data.repo) throw new Error(`${task.type} task needs a repo`)
  return task.data.repo
}
