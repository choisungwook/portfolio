export type TaskType = 'ops_read' | 'ops_change' | 'code' | 'research' | 'security_review'
export type TaskStatus = 'draft' | 'ready' | 'running' | 'needs_approval' | 'needs_auth' | 'review' | 'done' | 'failed'
export type Outcome = 'done' | 'failed' | 'needs_approval' | 'needs_auth' | 'review' | 'stale'
export type Severity = 'critical' | 'high' | 'normal'
export type AlertKind = 'approval_required' | 'security_finding' | 'prod_touch' | 'worker_flag'
  | 'auth_required' | 'failed' | 'stale_repeat' | 'budget_exceeded' | 'review_ready' | 'proposal_pending' | 'handoff_received'
  | 'team_message' | 'team_paused'
export type EventKind = 'claimed' | 'tool_call' | 'tool_result' | 'permission_request' | 'approved' | 'denied'
  | 'auth_required' | 'progress' | 'error' | 'finished' | 'cancel_requested' | 'tamper_blocked'
  | 'run_requested' | 'handoff_received' | 'handoff_accepted'

export interface TaskData {
  title?: string
  intent: string
  cautions?: string
  access_skill?: string      // name of the user's own skill that logs in to the target account
  target_profile?: string    // AWS profile for target-account commands
  repo?: string              // cwd for code tasks
  output_path?: string       // under outputs/
  auto_accept_handoffs?: boolean
  assignee?: string          // team agent that asked for this task; its result is posted to that agent's inbox
  review_of?: string         // security_review: id of the code task
  base_commit?: string       // code: HEAD before the run
  max_turns?: number
  max_budget_usd?: number
}

export interface Task {
  id: string; type: TaskType; status: TaskStatus; priority: number
  lock_key: string | null; claimed_by: string | null; heartbeat_at: number | null
  session_id: string | null; data: TaskData; created_at: number; updated_at: number
}

export interface RunStats { turns?: number; input_tokens?: number; output_tokens?: number; cost_usd?: number; tool_calls?: number }

export interface WorkerResult {
  outcome: Outcome
  summary: string                                   // 1-3 lines
  stats: RunStats
  alerts: { severity: Severity; message: string }[] // items the user must check
  followups: { type: TaskType; intent: string }[]
  budget_exceeded?: boolean
  auth_scope?: 'target' | 'inference'               // set when outcome is needs_auth
  tampered?: boolean                                // the gate stopped a call that reached taskq itself
}

export interface SimilarTask { task_id: string; text: string }   // a finished run that shares words with the task

export interface TaskHandoff {
  id: number
  task_id: string
  run_id: string | null
  output_path: string | null
  summary: string | null
  accepted_via: 'auto' | 'manual'
}

export interface HandoffRecord {
  id: number
  source_task_id: string
  target_task_id: string
  run_id: string | null
  output_path: string | null
  summary: string | null
  created_at: number
  accepted_at: number | null
  accepted_via: TaskHandoff['accepted_via'] | null
  status: 'pending' | 'accepted' | 'superseded'
}

export interface WorkerContext {
  task: Task
  runId: string
  resumeSessionId: string | null
  similar: SimilarTask[]                                          // up to 3, from memory/similar.ts
  handoffs: TaskHandoff[]
  access_skill_path?: string                                      // registered folder of task.data.access_skill
  signal: AbortSignal
  emit(kind: EventKind, payload: Record<string, unknown>): void   // masked and stored by the runner
  onSession(sessionId: string): void                              // stored on tasks and runs
  patchData(patch: Partial<TaskData>): void
  requestApproval(req: { tool: string; input: unknown; reason?: string }): Promise<boolean>
}

export type Worker = (ctx: WorkerContext) => Promise<WorkerResult>
