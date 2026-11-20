import { ORCHESTRATOR, type BotSettings } from '../db/team.ts'

// A new bot runs in auto mode with no sandbox and no blocked commands; the user tightens it in its settings.
export const BOT_DEFAULTS: Omit<BotSettings, 'role' | 'description' | 'instructions'> = {
  charter_owns: '',
  charter_good: '',
  charter_never: '',
  ask_first: [],
  may_message_user: false,
  enabled: true,
  permission_mode: 'auto',
  sandbox: false,
  allowed_domains: [],
  blocked_commands: [],
  workdir: null,
  skills: [],
  mcp_servers: [],
  provider: null,
  plugins: [],
  model: null,
  effort: null,
  sdk: 'claude',
  hourly_turns: null,
  turn_max_turns: null,
}

// The only bot that exists from the start. The user talks to it first; it hands work to the bots the user created.
export const ORCHESTRATOR_BOT: BotSettings & { name: string; system: boolean } = {
  ...BOT_DEFAULTS,
  name: ORCHESTRATOR,
  system: true,
  role: 'orchestrator',
  may_message_user: true,
  description: 'Orchestrator. Takes the user\'s requests, splits them into tasks, gives each task to the bot whose description fits, and reports back.',
  instructions: [
    'You are the bot the user talks to first. Restate each request as a goal in one sentence.',
    'Split it into tasks with create_task and give each to the bot whose description fits (owner). If no bot fits, do the task yourself or tell the user which bot to create.',
    'Do not wait for replies inside a turn. Results arrive as new messages in a later turn.',
    'Report to the user only when something is finished, blocked, or needs the user\'s decision. Batch small updates into one message.',
    'Keep the wiki page projects/<topic> current for each running request: goal, who owns what, status, open questions.',
  ].join('\n'),
}

export const ROSTER = [ORCHESTRATOR_BOT]

// Starting points offered when the user creates a bot. Everything stays editable afterwards.
export const PRESETS: Record<string, Pick<BotSettings, 'role' | 'description' | 'instructions'>> = {
  planner: {
    role: 'planner',
    description: 'Scheduler. Turns a piece of work into tasks with order (depends_on) and priority, gives each to a bot, and reschedules failed tasks.',
    instructions: [
      'Create tasks with create_task. Put prerequisites in depends_on.',
      'Give each task to the bot that should do it (owner). Account-touching tasks are drafts the user promotes; say so.',
      'When a task fails, read its summary. Create a new task only if the cause is understood; otherwise report the cause.',
    ].join('\n'),
  },
  coder: {
    role: 'coder',
    description: 'Developer. Takes code tasks, changes the repository in its working directory, runs the tests, and reports what changed and how it was tested.',
    instructions: [
      'Start a task with start_task before working on it and end it with finish_task, including the test command and its output in the summary.',
      'Work only in your working directory. Record conventions you learn in the wiki page repos/<name>.',
    ].join('\n'),
  },
  reviewer: {
    role: 'reviewer',
    description: 'Code reviewer. Reviews changes and reports findings with file:line evidence and the impact of each.',
    instructions: [
      'Each finding names the location, what is wrong, the evidence and what breaks. Without all four it is a hypothesis; label it so.',
      'Do not report style preferences. Report "no findings" with the scope you checked when nothing is wrong.',
    ].join('\n'),
  },
  'doc-reviewer': {
    role: 'doc_reviewer',
    description: 'Document reviewer. Reviews documents and plans for claims without evidence, steps that cannot be reproduced and missing failure cases.',
    instructions: 'Report each finding with its location and the reason. Separate what you verified from what you assume.',
  },
}
