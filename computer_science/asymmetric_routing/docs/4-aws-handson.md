# AWS hands-on: return paths and the private NAT gateway

VPC routing is stateless, so AWS never rejects a packet for taking an odd path. What AWS does reject is a packet whose source address does not belong where it came from, and what AWS cannot do is invent a return route nobody configured. Both are asymmetric routing problems wearing cloud clothes.

Build the environment first: [3-setup-aws.md](3-setup-aws.md).

## Part 1. Asymmetry inside one host

The client has two ENIs in two subnets. Traffic arriving on the second one has to be answered from the second one, and nothing about the OS default route knows that.

Open a session on the client and look at what Amazon Linux already set up.

```sh
ip rule list
ip route show table $(ip rule list | awk '/from 10.0.3./ {print $NF; exit}')
```

`amazon-ec2-net-utils` created a policy routing rule saying that packets sourced from the eth1 address must use eth1's own table. AL2023 ships this precisely because the naive behaviour is broken. Confirm the naive behaviour by removing it.

Note the rule first, then delete it.

```sh
ETH1=$(ip -4 -o addr show dev eth1 | awk '{print $4}' | cut -d/ -f1)
TABLE=$(ip rule list | awk -v ip="$ETH1" '$0 ~ "from "ip {print $NF; exit}')
sudo ip rule del from "$ETH1" lookup "$TABLE"
```

Start a capture on the client, then send a request from the probe host to the client's eth1 address.

```sh
# on the client
sudo tcpdump -i any -nn "port 8080"

# on the probe, in another session
curl --max-time 5 http://<client eth1 address>:8080/
```

The capture shows the SYN arriving on eth1 and the SYN-ACK leaving on **eth0**, carrying eth1's source address. The probe receives nothing and curl times out. The packet was not lost in transit: the VPC discarded it, because an ENI may only send traffic whose source is one of its own addresses. That check is the same source and destination check people turn off for NAT instances, and here it is doing exactly its job.

Put the rule back.

```sh
sudo ip rule add from "$ETH1" lookup "$TABLE"
curl --max-time 5 http://<client eth1 address>:8080/   # from the probe, now succeeds
```

The lesson carries beyond AWS. Any multi-homed host answers from whatever interface its route table picks, and the address it puts in the reply is decided separately from the interface it leaves by. Policy routing is how you tie the two together.

## Part 2. A return path that does not exist

VPC B routes `100.64.0.0/16` back over the peering connection and nothing else. It has no route for `10.0.0.0/16`. This is not an artificial setup: it is what you get when the other side runs out of route table entries, refuses to accept your CIDR, or already uses it.

From the client, reach the server directly. Terraform built this path on the first apply.

```sh
curl --max-time 5 http://<server address>:8080/
```

It hangs. Watch both ends to see where it dies.

```sh
# on the server
sudo tcpdump -i any -nn "port 8080"

# on the client
sudo tcpdump -i any -nn "host <server address>"
```

The server receives the SYN and answers with a SYN-ACK. The client sees its own SYN go out and retransmit, and never sees the answer. The request path is fine; only the return path is missing. A one-way capture like this is the clearest evidence you can collect, and it immediately rules out security groups: a security group denial would stop the SYN before the server ever saw it.

## Part 3. Let the private NAT gateway pick the source address

The server VPC will route `100.64.0.0/16` back. So make the traffic come from there.

```sh
terraform apply -var forward_path=pnat
```

This creates a private NAT gateway in the `100.64.1.0/24` subnet and repoints the client subnet's route for `10.1.0.0/16` at it. Retry from the client.

```sh
curl --max-time 5 http://<server address>:8080/
```

It succeeds. Watch the server side to see why.

```sh
sudo tcpdump -i any -nn "port 8080"
```

The source address is now the NAT gateway's, not the client's. Compare it with `terraform output private_nat_gateway_ip`. The server replies to an address VPC B has a route for, the reply reaches the NAT gateway, and the gateway maps it back to the client.

A private NAT gateway is a NAT gateway without an elastic IP. It performs source NAT toward private destinations only, which makes it the AWS-managed version of the `MASQUERADE` rule from the local lab.

## What the NAT gateway actually bought

It did not repair a routing table. It changed the question from "will the other side route my CIDR back" to "will the other side route one small CIDR I chose back", and made the answer to that question a single route entry. That is the reason `100.64.0.0/10` shows up in this pattern so often: RFC 6598 space is unlikely to collide with anything the other network already uses, so it is the easiest CIDR to get accepted.

The same property is why the pattern works for genuinely overlapping VPCs, where peering cannot be used at all and a transit gateway carries the traffic instead.

The trade-off matches the local lab exactly. The NAT gateway is stateful, so both directions must now pass through it. Any future route change that lets replies bypass it breaks the flow, and the server can no longer identify clients by address. Symmetry is not free; it is bought with a chokepoint.

## Cleanup

Teardown is in [3-setup-aws.md](3-setup-aws.md). Remember to pass `-var forward_path=pnat` if that was the last apply.
