import type { Outcome, TaskData, TaskStatus, TaskType } from '../src/types.ts'

// Built by concatenation so this file holds no key-shaped literal. The masker must still redact it in stored output.
export const FAKE_SECRET = 'sk-ant-' + 'example' + 'Fake0123456789'

export const PENDING_REASON = 'Scale the example-prod worker pool before the batch window'

// One shell line per item. The single U+202E is there so the approval panel's bidi warning has something to show.
export const PENDING_COMMAND = [
  '#!/bin/sh',
  'set -eu',
  '# Scale the example-prod worker pool from four to six before the batch window.',
  '# Confirm the cluster name and the profile before running. Demo only: nothing runs.',
  'aws ecs update-service \\',
  '  --cluster example-prod-cluster \\',
  '  --service example-prod-worker \\',
  '  --desired-count 6 \\',
  '  --profile example-prod',
  '# Wait until the service reports the new desired count before the next step.',
  'aws ecs wait services-stable \\',
  '  --cluster example-prod-cluster \\',
  '  --services example-prod-worker \\',
  '  --profile example-prod',
  '# Verification (read only) ‮: compare desired and running counts.',
  'aws ecs describe-services \\',
  '  --cluster example-prod-cluster \\',
  '  --services example-prod-worker \\',
  '  --query "services[0].{desired:desiredCount,running:runningCount}" \\',
  '  --profile example-prod',
  '# Roll back with --desired-count 4 and the same flags if the 5xx rate rises.',
].join('\n')

export interface TaskSpec {
  key: string
  type: TaskType
  status: TaskStatus
  priority: number
  lockKey?: string
  createdDaysAgo: number
  data: TaskData
  repoName?: string
  reviewOf?: string
  deps?: { on: string; kind: 'blocks' | 'discovered_from' }[]
}

// Seeded in dependency order: a task is inserted after everything it names.
export const TASKS: TaskSpec[] = [
  {
    key: 'research-cost-survey', type: 'research', status: 'done', priority: 20, createdDaysAgo: 7,
    data: {
      title: 'Survey log ingestion costs',
      intent: 'Compare monthly log ingestion cost for example-dev and example-prod over the last 30 days and list the top three sources.',
      cautions: 'Read-only. Use the example-readonly skill only.', access_skill: 'example-readonly',
    },
  },
  {
    key: 'code-trim-logs', type: 'code', status: 'done', priority: 10, lockKey: 'example-service-repo', createdDaysAgo: 6,
    repoName: 'example-service',
    data: {
      title: 'Trim verbose request logs',
      intent: 'Lower the request log level in the example-service handlers and keep error paths unchanged.',
      cautions: 'Do not remove log fields that the alarm queries read.', base_commit: '0a1b2c3',
    },
    deps: [{ on: 'research-cost-survey', kind: 'blocks' }],
  },
  {
    key: 'security-review-trim-logs', type: 'security_review', status: 'review', priority: 5, createdDaysAgo: 5,
    repoName: 'example-service', reviewOf: 'code-trim-logs',
    data: {
      title: 'Review the log trim change',
      intent: 'Review the changes made by the trim task since base_commit for secrets and personal data in log output.',
      base_commit: '0a1b2c3',
    },
    deps: [{ on: 'code-trim-logs', kind: 'discovered_from' }],
  },
  {
    key: 'migrate-config-loader', type: 'code', status: 'running', priority: 15, lockKey: 'example-service-repo', createdDaysAgo: 1,
    repoName: 'example-service',
    data: {
      title: 'Move config loader to a typed schema',
      intent: 'Replace the untyped config loader in example-service with a schema-checked loader. Keep every existing key.',
      base_commit: '9d8e7f6',
    },
  },
  {
    key: 'ops-change-rollout', type: 'ops_change', status: 'draft', priority: 0, lockKey: 'example-dev-deploy', createdDaysAgo: 0.5,
    data: {
      title: 'Roll out trimmed log level to example-dev',
      intent: 'Deploy the trimmed log level to the example-dev worker service through the usual pipeline.',
      cautions: 'Dev only. Stop if the 5xx rate rises above the alarm threshold.', target_profile: 'example-dev',
    },
    deps: [{ on: 'code-trim-logs', kind: 'blocks' }, { on: 'migrate-config-loader', kind: 'blocks' }],
  },
  {
    key: 'research-cache-options', type: 'research', status: 'review', priority: 0, createdDaysAgo: 3,
    data: {
      title: 'Compare cache eviction options',
      intent: 'Compare LRU, LFU and TTL eviction for the example-service lookup cache and recommend one with reasons.',
    },
  },
  {
    key: 'ops-read-prod-services', type: 'ops_read', status: 'done', priority: 5, createdDaysAgo: 2,
    data: {
      title: 'List example-prod services',
      intent: 'List the ECS services in the example-prod cluster with desired and running counts.',
      access_skill: 'example-readonly', target_profile: 'example-prod',
    },
  },
  {
    key: 'ops-read-dev-bucket', type: 'ops_read', status: 'done', priority: 0, createdDaysAgo: 4,
    data: {
      title: 'Summarize example-dev bucket usage',
      intent: 'Summarize object count and storage per prefix in the example-dev bucket for the storage cost review.',
      access_skill: 'example-readonly', target_profile: 'example-dev',
    },
  },
  {
    key: 'ops-change-worker-scale', type: 'ops_change', status: 'draft', priority: 50, lockKey: 'example-prod-workers', createdDaysAgo: 0.02,
    data: {
      title: 'Scale example-prod worker pool to six',
      intent: 'Raise the desired count of the example-prod worker service from four to six before the batch window.',
      cautions: 'Prod. Read the exact command in the approval panel before approving.', target_profile: 'example-prod',
    },
  },
  {
    key: 'ops-change-rotate-params', type: 'ops_change', status: 'needs_auth', priority: 10, lockKey: 'example-dev-params', createdDaysAgo: 5,
    data: {
      title: 'Rotate example-dev parameter values',
      intent: 'Rotate the database password parameter for example-dev and restart the worker.',
      cautions: 'Never copy the parameter value into the summary.', target_profile: 'example-dev',
    },
  },
  {
    key: 'ops-change-alarm-thresholds', type: 'ops_change', status: 'failed', priority: 30, lockKey: 'example-prod-alarms', createdDaysAgo: 3,
    data: {
      title: 'Update example-prod alarm thresholds',
      intent: 'Raise the 5xx alarm threshold on example-prod from 1 percent to 2 percent for the batch window.',
      cautions: 'Prod alarm. Record the previous value in the summary.', target_profile: 'example-prod',
    },
  },
  {
    key: 'security-review-iam', type: 'security_review', status: 'failed', priority: 0, createdDaysAgo: 2,
    data: {
      title: 'Review IAM policy diff for example-dev roles',
      intent: 'Check the IAM policy diff for example-dev roles for wildcard actions and broad resources.',
      access_skill: 'example-readonly', target_profile: 'example-dev',
    },
  },
  {
    key: 'research-bucket-lifecycle', type: 'research', status: 'draft', priority: 0, createdDaysAgo: 0.5,
    data: {
      title: 'Notes on bucket lifecycle rules',
      intent: 'Collect lifecycle rule options for the example-dev bucket and note the tradeoffs.',
    },
  },
  {
    key: 'research-dashboard-metrics', type: 'research', status: 'done', priority: 0, createdDaysAgo: 3,
    data: {
      title: 'Metrics for the cost dashboard',
      intent: 'List the metrics the cost dashboard needs and where each one comes from.',
    },
  },
]

export type RunStart = { minAgo: number } | { daysAgo: number; hour: number }

export interface RunSpec {
  label?: string
  task: string
  start: RunStart
  durMin: number | null
  outcome: Outcome | null
  summary?: string
  flow?: 'auth' | 'approval' | 'secret' | 'pending'
}

// Today comes first (minutes before now), then the six days before it (hour of the local day).
export const RUN_SPECS: RunSpec[] = [
  { task: 'migrate-config-loader', start: { minAgo: 25 }, durMin: null, outcome: null },
  { label: 'pending', task: 'ops-change-worker-scale', start: { minAgo: 18 }, durMin: null, outcome: null, flow: 'pending' },
  { task: 'ops-read-prod-services', start: { minAgo: 200 }, durMin: 9, outcome: 'done', summary: 'Listed 3 example-prod services. Desired counts match the plan.' },
  { label: 'auth', task: 'ops-read-dev-bucket', start: { minAgo: 300 }, durMin: 12, outcome: 'needs_auth', flow: 'auth', summary: 'Sign-in to the example-dev profile expired. Log in and resume.' },
  { label: 'bucket', task: 'ops-read-dev-bucket', start: { minAgo: 150 }, durMin: 10, outcome: 'done', summary: 'Bucket usage for example-dev reviewed: 3 prefixes and a cost note.' },
  { label: 'approval', task: 'code-trim-logs', start: { minAgo: 110 }, durMin: 60, outcome: 'done', flow: 'approval', summary: 'Trimmed 14 request log calls. Unit tests pass; review the diff before rollout.' },
  { label: 'dashboard', task: 'research-dashboard-metrics', start: { minAgo: 240 }, durMin: 100, outcome: 'done', summary: 'Listed 9 metrics for the cost page with their sources.' },
  { label: 'prod-failed', task: 'ops-change-alarm-thresholds', start: { minAgo: 60 }, durMin: 5, outcome: 'failed', summary: 'Alarm API rejected the threshold change. Prod alarm is unchanged.' },
  { label: 'iam-failed', task: 'security-review-iam', start: { minAgo: 45 }, durMin: 10, outcome: 'failed', summary: 'Review stopped at the policy parser. Wildcard actions were not checked.' },
  { label: 'cache', task: 'research-cache-options', start: { minAgo: 400 }, durMin: 75, outcome: 'review', summary: 'Three eviction options compared. The recommendation waits for your review.' },
  { label: 'stale', task: 'migrate-config-loader', start: { daysAgo: 1, hour: 9.5 }, durMin: 15, outcome: 'stale', summary: 'Heartbeat lost after the laptop slept. Run marked stale.' },
  { task: 'ops-read-prod-services', start: { daysAgo: 1, hour: 9 }, durMin: 7, outcome: 'done', summary: 'Services listed. The worker cost line is within budget.' },
  { label: 'secret', task: 'security-review-trim-logs', start: { daysAgo: 1, hour: 16 }, durMin: 30, outcome: 'done', flow: 'secret', summary: 'Review found one debug line with a token-shaped value. Masked in the output.' },
  { task: 'ops-read-dev-bucket', start: { daysAgo: 1, hour: 18 }, durMin: 9, outcome: 'done', summary: 'Bucket listing done. Storage cost is about 12 dollars a month.' },
  { task: 'research-cost-survey', start: { daysAgo: 2, hour: 10 }, durMin: 80, outcome: 'done', summary: 'Ingestion cost is highest in example-dev debug logs, about 60 percent of the total.' },
  { task: 'ops-read-dev-bucket', start: { daysAgo: 2, hour: 15 }, durMin: 12, outcome: 'done', summary: 'Bucket prefixes checked. No oversized objects found.' },
  { label: 'codefail', task: 'code-trim-logs', start: { daysAgo: 2, hour: 13 }, durMin: 55, outcome: 'failed', summary: 'Tests failed in the export handler mock. Retry after the fix.' },
  { task: 'security-review-iam', start: { daysAgo: 2, hour: 11 }, durMin: 40, outcome: 'done', summary: 'Review checked the example-dev roles. One wildcard action flagged.' },
  { task: 'research-dashboard-metrics', start: { daysAgo: 3, hour: 11 }, durMin: 45, outcome: 'done', summary: 'Metrics draft reviewed with the owner.' },
  { task: 'ops-change-alarm-thresholds', start: { daysAgo: 3, hour: 16 }, durMin: 6, outcome: 'done', summary: 'Dry run of the threshold change on the dev alarm. Prod was not touched.' },
  { task: 'ops-read-prod-services', start: { daysAgo: 3, hour: 10 }, durMin: 8, outcome: 'done', summary: 'Services listed again. Desired counts unchanged.' },
  { task: 'ops-change-worker-scale', start: { daysAgo: 4, hour: 11 }, durMin: 9, outcome: 'done', summary: 'Dry run of the worker scale on example-dev. Plan only.' },
  { label: 'finding', task: 'security-review-trim-logs', start: { daysAgo: 4, hour: 16 }, durMin: 25, outcome: 'done', summary: 'Review of the trim change found no secret in the diff.' },
  { task: 'ops-read-dev-bucket', start: { daysAgo: 4, hour: 9 }, durMin: 14, outcome: 'done', summary: 'Bucket cost summary written to the outputs folder.' },
  { task: 'research-cost-survey', start: { daysAgo: 5, hour: 9 }, durMin: 20, outcome: 'stale', summary: 'Sandbox timed out before the cost query finished. Marked stale.' },
  { task: 'ops-change-rotate-params', start: { daysAgo: 5, hour: 13 }, durMin: 12, outcome: 'needs_auth', flow: 'auth', summary: 'Target login expired during the parameter read. Resume after login.' },
  { task: 'code-trim-logs', start: { daysAgo: 6, hour: 9 }, durMin: 70, outcome: 'done', summary: 'Trimmed request log calls in the handlers. Diff ready for review.' },
  { label: 'budget', task: 'research-dashboard-metrics', start: { daysAgo: 6, hour: 15 }, durMin: 30, outcome: 'failed', summary: 'Budget ran out before the dashboard list was complete.' },
  { task: 'ops-read-prod-services', start: { daysAgo: 6, hour: 13 }, durMin: 6, outcome: 'done', summary: 'Services listed. Account 111122223333 is masked in the output.' },
  { task: 'research-cost-survey', start: { daysAgo: 6, hour: 11 }, durMin: 40, outcome: 'done', summary: 'Cost baseline captured for the example-prod bucket.' },
]
