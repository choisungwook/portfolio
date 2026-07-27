# 3. AWS lab - measure what warm pool saves

Scale out has a time wall: alarm delay + instance provisioning + boot + user_data + app start. A warm pool keeps instances that already finished user_data in a Stopped state, so scale out skips provisioning and first boot. Stopped instances cost EBS only, no compute.

The terraform creates an internet-facing ALB, an ASG (t4g.small, min 1 / max 4) with a Stopped warm pool of 2, a CPU 50% target tracking policy, and optional pre-event scheduled actions. ALB ingress is restricted to your current IP.

## Apply

Create the stack from the terraform directory.

```bash
cd terraform && terraform init && terraform apply
```

Check the pool after apply. The two warm instances run user_data once, then stop.

```bash
aws autoscaling describe-warm-pool --auto-scaling-group-name event-capacity-lab
```

## Measure scale out with the pool

Raise desired capacity and time how long the new instance takes to reach InService.

```bash
aws autoscaling set-desired-capacity --auto-scaling-group-name event-capacity-lab --desired-capacity 2
aws autoscaling describe-scaling-activities --auto-scaling-group-name event-capacity-lab --max-items 3
```

The activity description says the instance was started from the warm pool. Compare the timestamps against a cold launch: set desired back to 1, delete the warm pool, and repeat.

```bash
aws autoscaling delete-warm-pool --auto-scaling-group-name event-capacity-lab
```

On this stack the gap is modest because user_data is small; on a real AMI with app download, JVM start, and config pulls, the gap is what decides whether auto scaling answers a spike in time.

## Trigger the target tracking policy

Open an SSM session on the InService instance and pin the CPU. The target tracking alarm needs ~3 minutes of datapoints before it scales - that delay is part of the time wall, and no warm pool removes it.

```bash
aws ssm start-session --target <instance-id>
stress-ng --cpu 0 --timeout 600
```

## Rehearse the pre-event schedule

Events start at a known time, so the primary answer is scheduled capacity, not reactive scaling. Set the two timestamps in terraform.tfvars (see terraform.tfvars.example) and apply; the ASG raises min/desired before the window and restores after. Reactive scaling stays on as the safety net for the part of the forecast that is wrong.

Two limits to verify while the stack is up, because they are the studysheet's warnings in the flesh:

- A warm-pool instance restarts with a cold JVM. The pool saves infrastructure time, not application warm-up.
- Nothing here helps RDS or Redis. Their vertical changes take minutes and possibly a failover, which is why DB spec review happens days before the event, not at scale-out time.

Destroy when done: [4-cleanup.md](./4-cleanup.md).
