# ADR

Decisions made while building this workspace, in "Decision - Reason" form following the repository [knowledge rules](../../../../../.claude/rules/knowledge.md).

## List

* [0001 Reproduce on EC2 with AL2 kernel 4.14](0001-reproduce-on-ec2-with-al2-kernel-4-14.md) - use an early Amazon Linux 2 AMI instead of macOS, Docker, or local VMs.
* [0002 Pair a legacy instance with a modern control](0002-legacy-plus-modern-contrast-instances.md) - provision kernel 4.14 and kernel 6.1 instances in one apply.
* [0003 Build the presentation as self-contained HTML](0003-html-presentation-from-design-spec.md) - implement the akbun deck style in HTML instead of pptx.
* [0004 Place the workspace under computer_science/jvm/](0004-workspace-under-computer-science-jvm.md) - group JVM hands-ons in one parent directory.
