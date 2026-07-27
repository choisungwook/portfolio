# 4. Cleanup

Local stack: stop containers and drop volumes.

```bash
docker compose down -v
```

AWS stack: destroy everything the terraform created. The warm pool is deleted together with the ASG.

```bash
cd terraform && terraform destroy
```

Verify nothing is left billing: the ASG, ALB, and warm pool should all be gone.

```bash
aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names event-capacity-lab
aws elbv2 describe-load-balancers --names event-capacity-lab
```
