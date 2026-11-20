// Every API route as a named operation, so the CLI (`taskq api <name>`) and the MCP server (tool `taskq_<name>`) offer
// everything the UI can do, from one table. An operation calls the route in this process (local-api.ts): the same
// validation and the same effects as the UI, without a running server or its token.
// test/ops-coverage.test.ts fails when a route has no operation here.

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface Operation {
  name: string
  method: Method
  path: string          // with :params, filled from the arguments of the same name
  description: string   // what it does and the main fields; other arguments go to the query (GET) or the JSON body
}

const op = (name: string, method: Method, path: string, description: string): Operation => ({ name, method, path, description })

export const OPERATIONS: Operation[] = [
  // tasks
  op('tasks_list', 'GET', '/tasks', 'List tasks. Fields: status.'),
  op('task_create', 'POST', '/tasks', 'Create a task. Fields: type (research|code|ops_read|ops_change), intent, title, status (draft|ready), priority, lock_key, repo (a git repository or a folder), worktree (false keeps a code task in the repository itself; default: its own worktree), output_path, access_skill, target_profile, depends_on [ids], attachments [shared paths], workflow_id.'),
  op('task_get', 'GET', '/tasks/:id', 'One task with its runs, events, owner and workflow.'),
  op('task_update', 'PATCH', '/tasks/:id', 'Change a task. Fields: status (ready), priority, intent, title, cautions, workflow_id (null removes it).'),
  op('task_approve', 'POST', '/tasks/:id/approve', 'Approve the pending request of a task.'),
  op('task_deny', 'POST', '/tasks/:id/deny', 'Deny the pending request of a task.'),
  op('task_resume', 'POST', '/tasks/:id/resume', 'Resume a task that waits for login.'),
  op('task_done', 'POST', '/tasks/:id/done', 'Mark a reviewed task done.'),
  op('task_cancel', 'POST', '/tasks/:id/cancel', 'Cancel a running or waiting task; it shows as cancelled.'),
  op('task_run', 'POST', '/tasks/:id/run', 'Run a task now, once, outside the queue order (needs the running taskq).'),
  op('task_retry', 'POST', '/tasks/:id/retry', 'Put a failed or cancelled task back to ready.'),
  op('task_handoff_mode', 'POST', '/tasks/:id/handoff-mode', 'Set whether the task accepts incoming handoffs on its own. Fields: auto_accept (boolean).'),
  op('task_workspace', 'GET', '/tasks/:id/workspace', 'Where the task works: repository, folder or its own worktree (path, branch, changed files, commits ahead), the pull request or compare link and a VS Code link.'),
  op('task_workspace_diff', 'GET', '/tasks/:id/workspace/diff', 'The diff of one changed file of the task\'s worktree against its base. Fields: file.'),
  op('task_workspace_remove', 'POST', '/tasks/:id/workspace/remove', 'Remove the task\'s worktree folder; its branch stays in the repository.'),
  op('repos_list', 'GET', '/repos', 'Repositories to pick for a task: trustedRepos, git repositories under bots.readRoots, and ones recent tasks used.'),
  op('path_check', 'GET', '/paths/check', 'Whether a path exists and is a git repository (with its branch and origin). Fields: path.'),
  op('task_set_owner', 'POST', '/bots/tasks/:id/owner', 'Give a task to a bot, or back to the user. Fields: owner (bot name or null).'),
  // runs, events, queue
  op('runs_list', 'GET', '/runs', 'Past runs. Fields: from, to (unix seconds), task_id, outcome.'),
  op('run_get', 'GET', '/runs/:id', 'One run with its summary and stats.'),
  op('events_list', 'GET', '/events', 'Task events. Fields: task_id, run_id, after, order (asc|desc), limit.'),
  op('stats_daily', 'GET', '/stats/daily', 'Runs and cost per day.'),
  op('lock_keys', 'GET', '/lock-keys', 'Lock keys in use.'),
  op('search', 'GET', '/search', 'Search past runs. Fields: q.'),
  op('graph', 'GET', '/graph', 'Tasks and their dependencies as a graph.'),
  op('queue_status', 'GET', '/queue', 'Whether the queue is paused and what runs.'),
  op('queue_pause', 'POST', '/queue/pause', 'Pause the queue. Fields: reason.'),
  op('queue_resume', 'POST', '/queue/resume', 'Resume the queue.'),
  op('alerts_list', 'GET', '/alerts', 'Alerts that need attention.'),
  op('alert_ack', 'POST', '/alerts/:id/ack', 'Acknowledge an alert.'),
  op('approvals_list', 'GET', '/approvals', 'Requests waiting for approval.'),
  op('handoffs_list', 'GET', '/handoffs', 'Handoffs between tasks. Fields: task_id.'),
  op('handoff_accept', 'POST', '/handoffs/:id/accept', 'Accept a handoff.'),
  op('proposals_list', 'GET', '/proposals', 'Memory proposals from past runs.'),
  op('proposal_apply', 'POST', '/proposals/:id/apply', 'Apply a memory proposal.'),
  op('proposal_reject', 'POST', '/proposals/:id/reject', 'Reject a memory proposal.'),
  // bots
  op('bots_list', 'GET', '/bots', 'Every bot with its settings, whether it works now, queued messages and owned tasks; open discussions and recent turns.'),
  op('bot_presets', 'GET', '/bots/presets', 'Role presets for a new bot.'),
  op('bot_create', 'POST', '/bots', 'Create a bot. Fields: name, preset or role/description/instructions, sdk (claude|openai), model, effort, permission_mode, sandbox, allowed_domains, blocked_commands, workdir, skills, plugins, limits.'),
  op('file_open', 'POST', '/open-file', 'Open a file of the shared folder with its default app on this machine, or reveal its folder. Fields: path (relative to the shared folder), reveal (true opens the folder).'),
  op('file_preview', 'POST', '/shared/preview', 'A short-lived URL (/preview/<ticket>/<name>) that serves an HTML file of the shared folder, and the files beside it, sandboxed for the UI preview. Fields: path.'),
  op('bot_get', 'GET', '/bots/:name', 'One bot\'s settings.'),
  op('bot_turn_errors', 'GET', '/bots/:name/turn-errors', 'A bot\'s failed turns, newest first: id, outcome, error, ended_at. Fields: name, limit (default 50).'),
  op('bot_update', 'PUT', '/bots/:name', 'Change a bot\'s settings; only the fields given change. Same fields as bot_create, plus enabled.'),
  op('bot_delete', 'DELETE', '/bots/:name', 'Delete a bot (not taskq). Its running turn is cancelled; its tasks go back to the user as drafts.'),
  op('bot_cancel', 'POST', '/bots/:name/cancel', 'Stop the bot\'s running turn; its running task becomes cancelled.'),
  op('bot_reload', 'POST', '/bots/:name/reload', 'Reload the bot\'s skills and plugins. Fields: kind (skill|plugin|all).'),
  op('bot_reset', 'POST', '/bots/:name/reset', 'Start a new session on the bot\'s next turn.'),
  op('bot_catalog', 'GET', '/bots/:name/catalog', 'Models, effort levels, permission modes and slash commands for this bot. Fields: refresh (1).'),
  op('bot_memory_get', 'GET', '/bots/:name/memory', 'The bot\'s memory text.'),
  op('bot_memory_set', 'PUT', '/bots/:name/memory', 'Replace the bot\'s memory. Fields: memory.'),
  op('bot_messages', 'GET', '/bots/messages', 'Messages of a bot\'s conversation. Fields: agent, limit.'),
  op('bot_send', 'POST', '/bots/messages', 'Send a message to a bot as the user. Fields: to (default taskq), body, attachments [shared paths]. A bot that is working takes it into its running turn.'),
  op('bot_messages_read', 'POST', '/bots/messages/read', 'Mark messages to the user as read. Fields: agent (only that bot\'s).'),
  op('bot_search', 'GET', '/bots/search', 'Search every bot conversation (Korean and English). Fields: q.'),
  op('bot_thread_close', 'POST', '/bots/threads/:id/close', 'Close a discussion.'),
  op('bots_pause', 'POST', '/bots/pause', 'Pause every bot. Fields: reason.'),
  op('bots_resume', 'POST', '/bots/resume', 'Resume the bots.'),
  op('wiki_list', 'GET', '/bots/wiki', 'Wiki pages, or a search. Fields: q.'),
  op('wiki_page', 'GET', '/bots/wiki/page', 'One wiki page with its history and links. Fields: slug.'),
  op('wiki_export', 'POST', '/bots/wiki/export', 'Export the whole wiki as a zip (deflate level 9) into shared/exports/, as a background job. Follow it with job_get.'),
  op('wiki_import', 'POST', '/bots/wiki/import', 'Import documents into the wiki as a background job: each file becomes pages bots can search (long documents split by section, links kept, an index page). Fields: source (a zip or folder: a path in the shared folder or an absolute path), name (batch name).'),
  op('jobs_list', 'GET', '/jobs', 'Background jobs (wiki export and import) with progress. Fields: kind, limit.'),
  op('job_get', 'GET', '/jobs/:id', 'One job: status, steps done of total, what it is doing, result or error.'),
  op('job_cancel', 'POST', '/jobs/:id/cancel', 'Cancel a job; a running one stops after its current step and keeps its checkpoint.'),
  op('job_resume', 'POST', '/jobs/:id/resume', 'Resume a cancelled or failed job from its last checkpoint.'),
  // workflows
  op('workflows_list', 'GET', '/workflows', 'Workflows with their steps and last run. Fields: deleted (1 includes deleted).'),
  op('workflow_create', 'POST', '/workflows', 'Create a workflow. Fields: name, description, definition { steps: [{ id, name, kind (do|check|handoff|approval), instructions, needs [step ids], to (bot, for handoff) }] }.'),
  op('workflow_get', 'GET', '/workflows/:id', 'One workflow by id or name.'),
  op('workflow_update', 'PUT', '/workflows/:id', 'Replace a workflow. Same fields as workflow_create.'),
  op('workflow_delete', 'DELETE', '/workflows/:id', 'Delete a workflow. Runs keep their copy and show it deleted; bots running it are told.'),
  op('workflow_run', 'POST', '/workflows/:id/run', 'Start a run executed by a bot. Fields: bot, task_id.'),
  op('workflow_runs', 'GET', '/workflow-runs', 'Run history with the bot that ran each. Fields: workflow, bot, task, limit.'),
  op('workflow_run_get', 'GET', '/workflow-runs/:id', 'One run with every step\'s status, output and evidence.'),
  op('workflow_run_cancel', 'POST', '/workflow-runs/:id/cancel', 'Cancel a running workflow run; the bot is told.'),
  op('workflow_step_approve', 'POST', '/workflow-runs/:id/steps/:step/approve', 'Answer an approval step. Fields: approved (boolean), note.'),
  // files
  op('file_upload', 'POST', '/files', 'Put a file in the shared folder under attachments/. Fields: name, data (base64). The CLI takes file=<path> instead.'),
  op('shared_list', 'GET', '/shared', 'List the shared folder. Fields: dir.'),
  op('shared_read', 'GET', '/shared/file', 'Read a file of the shared folder. Fields: path.'),
  op('open_folder', 'POST', '/open-folder', 'Open a folder in the desktop file manager. Fields: target (shared|home|sessions|bot|task), bot, task_id.'),
  // settings and plugins
  op('update_check', 'GET', '/update', 'Whether a newer akbun-taskq release exists (current, latest, update_available, can_install and why not).'),
  op('update_install', 'POST', '/update', 'Download the latest release build for this machine and replace the running binary; restart taskq to use it. Only for the single-file binary.'),
  op('settings_get', 'GET', '/settings', 'Settings: appearance, limits, folders, registered skills and plugins.'),
  op('settings_limits', 'POST', '/settings/limits', 'Change usage limits. Fields: turns_per_hour_total, max_concurrent_turns, bot_turns_per_hour, turn_max_turns, session_max_tokens.'),
  op('settings_appearance', 'POST', '/settings/appearance', 'Change appearance. Fields: font_family, font_size, language (ko|en), theme (system|dark|light).'),
  op('settings_queue_autorun', 'POST', '/settings/queue-autorun', 'Whether the queue runs unowned ready tasks on its own. Fields: enabled.'),
  op('settings_desktop_notifications', 'POST', '/settings/desktop-notifications', 'Turn desktop notifications on or off. Fields: enabled.'),
  op('plugins_catalog', 'GET', '/plugins/catalog', 'The official plugin marketplace (listed, not installed).'),
  op('bot_skill_add', 'POST', '/bot-skills', 'Register a skill folder for bots. Fields: path.'),
  op('bot_skill_update', 'POST', '/bot-skills/:name/update', 'Update a registered skill (git pull) and reload the bots that use it.'),
  op('bot_skill_remove', 'DELETE', '/bot-skills/:name', 'Unregister a skill; bots stop loading it.'),
  op('bot_plugin_add', 'POST', '/bot-plugins', 'Register a plugin folder for bots. Fields: path.'),
  op('bot_plugin_update', 'POST', '/bot-plugins/:name/update', 'Update a registered plugin (git pull) and reload the bots that use it.'),
  op('bot_plugin_remove', 'DELETE', '/bot-plugins/:name', 'Unregister a plugin; bots stop loading it.'),
  op('bot_mcp_add', 'POST', '/bot-mcp-servers', 'Register an MCP server for bots of both SDKs, started over stdio. Fields: name, command, args [strings], description.'),
  op('bot_mcp_remove', 'DELETE', '/bot-mcp-servers/:name', 'Unregister an MCP server; bots stop loading it.'),
  op('kiro_status', 'GET', '/kiro/status', 'Kiro sign-in: the saved AWS SSO start URL and region, a login in progress, and kiro-cli whoami.'),
  op('kiro_login', 'POST', '/kiro/login', 'Sign Kiro in with AWS IAM Identity Center (device flow). Fields: start_url, region. Answers the URL and code to approve in a browser.'),
  op('connections', 'GET', '/connections', 'How bots reach their models: each connection (Claude provider, OpenAI API key, Bedrock, ChatGPT plan, Kiro) with its check, the bots on it and its last turn, plus whether bots are on or paused. Fields: refresh (1 reruns the checks).'),
  op('connection_settings', 'GET', '/connection-settings', 'How Claude and OpenAI-on-Bedrock bots sign in: claude_provider, claude_region, claude_profile, bedrock_profile, bedrock_region.'),
  op('connection_settings_set', 'PUT', '/connection-settings', 'Change how bots sign in; the server applies it within pollSec. Fields: claude_provider (bedrock|api_key|subscription), claude_region, claude_profile, bedrock_profile (empty uses AWS_BEARER_TOKEN_BEDROCK), bedrock_region.'),
  op('aws_profiles', 'GET', '/aws/profiles', 'AWS profiles on this machine: name, kind (sso|role|keys|process|other), region.'),
  op('bot_connection', 'GET', '/bots/:name/connection', 'One bot\'s connection, its last turn, waiting messages, and the first reason it would not answer. Fields: name, refresh.'),
  op('bot_approvals', 'GET', '/bot-approvals', 'Calls bots are waiting to run until the user approves them (ask-first rules and irreversible commands).'),
  op('bot_approval_decide', 'POST', '/bot-approvals/:id', 'Approve or deny a bot\'s waiting call; an approved call runs once. Fields: id, approve (true|false).'),
  op('routines', 'GET', '/routines', 'Routines: work bots do on a schedule (cron) or a trigger (task_failed, task_created, webhook). Fields: bot.'),
  op('routine_create', 'POST', '/routines', 'Create a routine. Fields: bot, name, prompt, schedule (5-field cron, local time) or trigger (task_failed|task_created|webhook).'),
  op('routine_enable', 'POST', '/routines/:id', 'Turn a routine on or off. Fields: id, enabled.'),
  op('routine_delete', 'DELETE', '/routines/:id', 'Delete a routine. Fields: id.'),
  op('routine_fire', 'POST', '/routines/:id/fire', 'Fire a webhook routine now; the bot gets text along. Fields: id, text.'),
  op('goals', 'GET', '/goals', 'Goals given to the bots: objective, done-when, status, summary.'),
  op('goal_create', 'POST', '/goals', 'Give the bots an objective; the orchestrator splits it and closes it when done. Fields: objective, done_when.'),
  op('goal_close', 'POST', '/goals/:id/close', 'Close a goal yourself. Fields: id, status (done|dropped), summary.'),
  op('review', 'GET', '/review', 'Weekly review: turns and success per bot, runs per routine, what to prune, and results to check by hand. Fields: days (1-90, default 7).'),
  op('task_save_workflow', 'POST', '/tasks/:id/save-workflow', 'Save a task that ended done as a workflow draft (its intent, the last run\'s summary, commands and files). Fields: id.'),
  op('usage', 'GET', '/usage', 'Tokens and cost per SDK (and OpenAI provider), per bot session, and for one-off task runs. Fields: period (today|7d|30d|all).'),
  op('access_skills_discover', 'GET', '/skills/discover', 'Skill folders found on this machine that can be registered as access skills.'),
  op('access_skill_add', 'POST', '/access-skills', 'Register an access skill (logs in to a target account). Fields: path.'),
  op('access_skill_remove', 'DELETE', '/access-skills/:name', 'Unregister an access skill.'),
]

export function findOperation(name: string): Operation | undefined {
  return OPERATIONS.find((o) => o.name === name)
}

export function pathParams(path: string): string[] {
  return [...path.matchAll(/:(\w+)/g)].map((m) => m[1])
}
