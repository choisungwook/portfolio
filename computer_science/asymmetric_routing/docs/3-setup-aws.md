# AWS lab setup

Two VPCs joined by a peering connection, three EC2 hosts, and a private NAT gateway that only exists in the second half of the hands-on.

## Topology

```text
  VPC A 10.0.0.0/16 (+ secondary 100.64.0.0/16)      VPC B 10.1.0.0/16
    client   10.0.1.x  eth0                            server 10.1.1.x
             10.0.3.x  eth1                              |
    probe    10.0.2.x                                     |
    private NAT gw 100.64.1.x  ─── peering ───────────────┘

  VPC B route table: 100.64.0.0/16 -> peering
                     (no route for 10.0.0.0/16, on purpose)
```

Every host runs `python3 -m http.server` on port 8080 and carries tcpdump. Remote access is SSM Session Manager, so nothing opens port 22.

## Cost

Roughly USD 0.10 per hour: three `t4g.small` instances, plus about USD 0.045 per hour once the private NAT gateway exists. The peering connection itself is free. Destroy the lab when you finish.

## Requirements

Terraform 1.11 or newer, AWS credentials for a personal account, and the Session Manager plugin for the AWS CLI. The default region is `ap-northeast-2`.

## Up

Run from the `terraform/` directory. The first apply builds the broken path, which is where the hands-on starts.

```sh
terraform init && terraform apply
```

Two useful outputs come back: `session_manager` has a ready-made command per host, and `addresses` has the private addresses every step refers to.

The second half of the hands-on switches the forward path by re-applying with one variable changed. This creates the private NAT gateway and takes about two minutes.

```sh
terraform apply -var forward_path=pnat
```

## Down

```sh
terraform destroy
```

If the last apply used `-var forward_path=pnat`, pass the same variable to destroy so Terraform sees the same resource set.

```sh
terraform destroy -var forward_path=pnat
```
