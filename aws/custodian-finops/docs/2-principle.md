# 2. How custodian works

A policy is three parts: which resources to list, which of them to keep, and what to do to the ones that remain. Everything else in this document follows from those three.

## The pipeline

A policy that stops every running instance with no owner, annotated by part:

```yaml
policies:
  - name: ec2-missing-cost-tags
    resource: aws.ec2        # describe call
    filters:                 # every filter must pass, AND semantics
      - "State.Name": running
      - "tag:Owner": absent
    actions:                 # applied to whatever survived
      - stop
```

`resource` chooses the describe API. `filters` run in process on the returned JSON, so any field in the describe response is addressable, including nested paths like `State.Name`. `actions` run only on the survivors.

A policy with no `actions` block cannot change anything. That is the safest way to start, and it is what `policies/1-tag-audit.yml` does.

## The tag as a state machine

The action worth understanding is `mark-for-op`. It takes an operation and a delay:

```yaml
actions:
  - type: mark-for-op
    tag: c7n_tag_compliance
    op: stop
    days: 4
```

It writes one tag onto the resource:

```
c7n_tag_compliance = Resource does not meet policy: stop@2026/08/01
```

The paired filter `marked-for-op` reads that tag back and matches only once the date has passed. So the grace period is stored on the resource, not in custodian. Three consequences follow.

- Custodian keeps no database and no state file, which is why the same policy file runs identically from a laptop or from Lambda.
- The deadline is visible in the console to whoever owns the resource.
- Adding the missing tag lets a third policy remove the mark, so a fix cancels the deadline with no ticket and no human in the loop.

A FinOps policy set is therefore usually three policies per rule, not one: mark, unmark when fixed, act when expired. `policies/2-tag-enforce.yml` is exactly that shape.

## Where the policy runs

The same file runs in three modes, and the mode is a deployment decision, not a rewrite.

| Mode | Runs where | Fits |
|---|---|---|
| pull | your shell or CI, `custodian run` | writing and testing a rule |
| periodic | Lambda on an EventBridge schedule | tag enforcement, offhours |
| cloudtrail | Lambda on an API event | catching a resource at creation |

Start in pull mode with `--dryrun`. Move to periodic once the counts stop surprising you.

## What the four FinOps levers look like

| Lever | Filter that finds it | Files |
|---|---|---|
| Untagged spend | `tag:Owner: absent` | `1-tag-audit.yml`, `2-tag-enforce.yml` |
| Idle out of hours | `type: offhour` | `3-offhours.yml` |
| Orphaned resources | `State: available`, `AssociationId: absent` | `4-orphans.yml` |
| Oversized resources | `type: metrics` against CloudWatch | `5-rightsizing.yml` |

The first three read only the describe response, so they are cheap and exact. The fourth asks CloudWatch and is the only one that can be wrong about a resource that is genuinely needed but quiet, which is why its actions stop at tagging.

Run them next: [3-handson-local.md](./3-handson-local.md).
