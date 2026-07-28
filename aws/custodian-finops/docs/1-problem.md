# 1. Why the cost dashboard does not lower the bill

A cost dashboard answers how much was spent. It does not answer who has to act, or by when. That gap is where FinOps work actually lives, and it is a gap a report cannot close.

## What the report leaves open

A typical monthly finding in a lab or dev account looks like this.

| Finding | What the dashboard shows | What it does not show |
|---|---|---|
| EC2 up 20 percent | The line went up | Which instances, and whether anyone still uses them |
| 40 percent of spend untagged | An "untagged" slice | Who to ask |
| EBS steady while EC2 fell | Two flat lines | That volumes outlived the instances they belonged to |

Each row needs the same three things before money moves: a rule that says what counts as waste, a way to reach the person responsible, and a deadline after which something happens anyway. Humans supply all three today, once a month, by hand.

## Why the manual loop stalls

The loop is: export the report, find owners, message them, wait, follow up, give up. It stalls because following up is unrewarding work, and because the person who wrote the report usually has no authority to stop anything.

Two failure modes follow from that.

- Nothing is ever deleted, because deletion needs certainty nobody has.
- Or something is deleted too fast, an incident follows, and the whole practice loses its mandate.

The interesting design question is not "how do we find waste". Finding it is easy. It is: how do you take an action that is safe enough to be automated, and still strong enough to change behaviour.

## What Cloud Custodian actually offers

Custodian is a rules engine that turns a YAML policy into boto3 calls. The part worth studying is not the YAML. It is that the engine gives you an action between "report" and "delete": writing a deadline onto the resource itself as a tag.

That single action is what makes the loop automatable. The resource carries its own state, so the engine stays stateless, the grace period is visible to the owner in the console, and fixing the tag cancels the deadline without anyone filing a ticket.

The rest of this hands-on works out how that is built, and what it costs you. Continue with [2-principle.md](./2-principle.md).
