//! Read-only EC2 queries and the view model the page renders.
//!
//! Only list/describe calls live here, and nothing else in the app talks to
//! EC2, so the API surface of the whole product stays read-only by
//! construction.

use crate::creds::RoleCredentials;
use crate::error::{aws_error, CoreError};
use aws_sdk_ec2::types::{Instance, IpPermission, SecurityGroup, Volume};
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InstanceSummary {
    pub instance_id: String,
    pub name: Option<String>,
    pub state: Option<String>,
    pub instance_type: Option<String>,
    pub availability_zone: Option<String>,
    pub private_ip: Option<String>,
    pub public_ip: Option<String>,
    pub launch_time: Option<String>,
    /// "spot" for spot instances; the API omits it for on-demand.
    pub lifecycle: Option<String>,
    /// "spot" or "on-demand", the Capacity column. Derived from `lifecycle`
    /// here rather than in the page so the filter and the column cannot
    /// disagree about what an absent lifecycle means.
    pub capacity: String,
    /// The Karpenter NodePool that owns this instance, from its tags. None
    /// for anything Karpenter did not create.
    pub karpenter_node_pool: Option<String>,
}

/// The tag Karpenter puts on the instances it launches. The second name is
/// what pre-v1beta1 Karpenter used and still exists on long-lived nodes.
const KARPENTER_POOL_TAGS: [&str; 2] = ["karpenter.sh/nodepool", "karpenter.sh/provisioner-name"];

/// The EC2 API omits `instanceLifecycle` for on-demand instances, so absence
/// is the answer rather than missing data. Values other than spot (scheduled,
/// capacity-block) are shown as they come.
fn capacity_of(lifecycle: Option<&str>) -> String {
    match lifecycle {
        None => "on-demand".to_string(),
        Some(value) => value.to_string(),
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InstanceDetail {
    pub summary: InstanceSummary,
    pub details: Details,
    pub network: Network,
    pub storage: Vec<VolumeView>,
    pub security: Vec<SecurityGroupView>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Details {
    pub image_id: Option<String>,
    pub architecture: Option<String>,
    pub platform: Option<String>,
    pub key_name: Option<String>,
    pub iam_instance_profile: Option<String>,
    pub monitoring: Option<String>,
    pub tags: Vec<TagView>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TagView {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Network {
    pub vpc_id: Option<String>,
    pub subnet_id: Option<String>,
    pub availability_zone: Option<String>,
    pub private_ip: Option<String>,
    pub public_ip: Option<String>,
    pub private_dns: Option<String>,
    pub public_dns: Option<String>,
    pub interfaces: Vec<EniView>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EniView {
    pub eni_id: Option<String>,
    pub subnet_id: Option<String>,
    pub private_ip: Option<String>,
    pub public_ip: Option<String>,
    pub status: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VolumeView {
    pub device_name: Option<String>,
    pub volume_id: Option<String>,
    pub size_gib: Option<i32>,
    pub volume_type: Option<String>,
    pub iops: Option<i32>,
    pub throughput: Option<i32>,
    pub encrypted: Option<bool>,
    pub delete_on_termination: Option<bool>,
    pub root_device: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SecurityGroupView {
    pub group_id: Option<String>,
    pub group_name: Option<String>,
    pub description: Option<String>,
    pub ingress: Vec<RuleView>,
    pub egress: Vec<RuleView>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuleView {
    /// "-1" from the API means every protocol; the page renders it as "all".
    pub protocol: Option<String>,
    pub from_port: Option<i32>,
    pub to_port: Option<i32>,
    /// CIDR blocks and referenced security group ids, one entry per source.
    pub sources: Vec<String>,
}

fn ec2_client(region: &str, creds: &RoleCredentials, insecure: bool) -> aws_sdk_ec2::Client {
    let credentials = aws_credential_types::Credentials::new(
        creds.access_key_id.clone(),
        creds.secret_access_key.clone(),
        creds.session_token.clone(),
        None,
        "akbun-awsviewer-cli",
    );
    let mut builder = aws_sdk_ec2::Config::builder()
        .behavior_version(aws_sdk_ec2::config::BehaviorVersion::latest())
        .region(aws_sdk_ec2::config::Region::new(region.to_string()))
        .credentials_provider(credentials);
    if insecure {
        builder = builder.http_client(crate::http::insecure_http_client());
    }
    aws_sdk_ec2::Client::from_conf(builder.build())
}

pub async fn list_instances(
    region: &str,
    creds: &RoleCredentials,
    insecure: bool,
) -> Result<Vec<InstanceSummary>, CoreError> {
    let client = ec2_client(region, creds, insecure);
    let mut pages = client.describe_instances().into_paginator().send();
    let mut instances = Vec::new();
    while let Some(page) = pages.next().await {
        let page = page.map_err(aws_error)?;
        for reservation in page.reservations() {
            for instance in reservation.instances() {
                instances.push(map_summary(instance));
            }
        }
    }
    Ok(instances)
}

pub async fn instance_detail(
    region: &str,
    creds: &RoleCredentials,
    insecure: bool,
    instance_id: &str,
) -> Result<InstanceDetail, CoreError> {
    let client = ec2_client(region, creds, insecure);

    let described = client
        .describe_instances()
        .instance_ids(instance_id)
        .send()
        .await
        .map_err(aws_error)?;
    let instance = described
        .reservations()
        .iter()
        .flat_map(|r| r.instances())
        .next()
        .cloned()
        .ok_or_else(|| CoreError::Aws {
            message: format!("instance {instance_id} was not found"),
        })?;

    let volume_ids: Vec<String> = instance
        .block_device_mappings()
        .iter()
        .filter_map(|m| m.ebs().and_then(|e| e.volume_id()).map(str::to_string))
        .collect();
    let volumes = if volume_ids.is_empty() {
        Vec::new()
    } else {
        client
            .describe_volumes()
            .set_volume_ids(Some(volume_ids))
            .send()
            .await
            .map_err(aws_error)?
            .volumes()
            .to_vec()
    };

    let group_ids: Vec<String> = instance
        .security_groups()
        .iter()
        .filter_map(|g| g.group_id().map(str::to_string))
        .collect();
    let groups = if group_ids.is_empty() {
        Vec::new()
    } else {
        client
            .describe_security_groups()
            .set_group_ids(Some(group_ids))
            .send()
            .await
            .map_err(aws_error)?
            .security_groups()
            .to_vec()
    };

    Ok(map_detail(&instance, &volumes, &groups))
}

fn tag_value(instance: &Instance, key: &str) -> Option<String> {
    instance
        .tags()
        .iter()
        .find(|tag| tag.key() == Some(key))
        .and_then(|tag| tag.value())
        .map(str::to_string)
}

pub fn map_summary(instance: &Instance) -> InstanceSummary {
    let lifecycle = instance
        .instance_lifecycle()
        .map(|l| l.as_str().to_string());
    InstanceSummary {
        instance_id: instance.instance_id().unwrap_or_default().to_string(),
        name: tag_value(instance, "Name"),
        state: instance
            .state()
            .and_then(|s| s.name())
            .map(|n| n.as_str().to_string()),
        instance_type: instance.instance_type().map(|t| t.as_str().to_string()),
        availability_zone: instance
            .placement()
            .and_then(|p| p.availability_zone())
            .map(str::to_string),
        private_ip: instance.private_ip_address().map(str::to_string),
        public_ip: instance.public_ip_address().map(str::to_string),
        launch_time: instance
            .launch_time()
            .and_then(|t| t.fmt(aws_smithy_types::date_time::Format::DateTime).ok()),
        capacity: capacity_of(lifecycle.as_deref()),
        karpenter_node_pool: KARPENTER_POOL_TAGS
            .iter()
            .find_map(|tag| tag_value(instance, tag)),
        lifecycle,
    }
}

pub fn map_detail(
    instance: &Instance,
    volumes: &[Volume],
    groups: &[SecurityGroup],
) -> InstanceDetail {
    let root_device_name = instance.root_device_name().map(str::to_string);
    let storage = instance
        .block_device_mappings()
        .iter()
        .map(|mapping| {
            let device_name = mapping.device_name().map(str::to_string);
            let ebs = mapping.ebs();
            let volume_id = ebs.and_then(|e| e.volume_id()).map(str::to_string);
            let volume = volume_id
                .as_deref()
                .and_then(|id| volumes.iter().find(|v| v.volume_id() == Some(id)));
            VolumeView {
                root_device: device_name.is_some() && device_name == root_device_name,
                device_name,
                volume_id,
                size_gib: volume.and_then(|v| v.size()),
                volume_type: volume
                    .and_then(|v| v.volume_type())
                    .map(|t| t.as_str().to_string()),
                iops: volume.and_then(|v| v.iops()),
                throughput: volume.and_then(|v| v.throughput()),
                encrypted: volume.and_then(|v| v.encrypted()),
                delete_on_termination: ebs.and_then(|e| e.delete_on_termination()),
            }
        })
        .collect();

    InstanceDetail {
        summary: map_summary(instance),
        details: Details {
            image_id: instance.image_id().map(str::to_string),
            architecture: instance.architecture().map(|a| a.as_str().to_string()),
            platform: instance.platform_details().map(str::to_string),
            key_name: instance.key_name().map(str::to_string),
            iam_instance_profile: instance
                .iam_instance_profile()
                .and_then(|p| p.arn())
                .map(str::to_string),
            monitoring: instance
                .monitoring()
                .and_then(|m| m.state())
                .map(|s| s.as_str().to_string()),
            tags: instance
                .tags()
                .iter()
                .filter_map(|t| {
                    Some(TagView {
                        key: t.key()?.to_string(),
                        value: t.value().unwrap_or_default().to_string(),
                    })
                })
                .collect(),
        },
        network: Network {
            vpc_id: instance.vpc_id().map(str::to_string),
            subnet_id: instance.subnet_id().map(str::to_string),
            availability_zone: instance
                .placement()
                .and_then(|p| p.availability_zone())
                .map(str::to_string),
            private_ip: instance.private_ip_address().map(str::to_string),
            public_ip: instance.public_ip_address().map(str::to_string),
            private_dns: instance
                .private_dns_name()
                .filter(|s| !s.is_empty())
                .map(str::to_string),
            public_dns: instance
                .public_dns_name()
                .filter(|s| !s.is_empty())
                .map(str::to_string),
            interfaces: instance
                .network_interfaces()
                .iter()
                .map(|eni| EniView {
                    eni_id: eni.network_interface_id().map(str::to_string),
                    subnet_id: eni.subnet_id().map(str::to_string),
                    private_ip: eni.private_ip_address().map(str::to_string),
                    public_ip: eni
                        .association()
                        .and_then(|a| a.public_ip())
                        .map(str::to_string),
                    status: eni.status().map(|s| s.as_str().to_string()),
                    description: eni
                        .description()
                        .filter(|s| !s.is_empty())
                        .map(str::to_string),
                })
                .collect(),
        },
        storage,
        security: groups
            .iter()
            .map(|group| SecurityGroupView {
                group_id: group.group_id().map(str::to_string),
                group_name: group.group_name().map(str::to_string),
                description: group.description().map(str::to_string),
                ingress: group.ip_permissions().iter().map(map_rule).collect(),
                egress: group.ip_permissions_egress().iter().map(map_rule).collect(),
            })
            .collect(),
    }
}

fn map_rule(permission: &IpPermission) -> RuleView {
    let mut sources = Vec::new();
    for range in permission.ip_ranges() {
        if let Some(cidr) = range.cidr_ip() {
            sources.push(cidr.to_string());
        }
    }
    for range in permission.ipv6_ranges() {
        if let Some(cidr) = range.cidr_ipv6() {
            sources.push(cidr.to_string());
        }
    }
    for pair in permission.user_id_group_pairs() {
        if let Some(group_id) = pair.group_id() {
            sources.push(group_id.to_string());
        }
    }
    for prefix in permission.prefix_list_ids() {
        if let Some(id) = prefix.prefix_list_id() {
            sources.push(id.to_string());
        }
    }
    RuleView {
        protocol: permission.ip_protocol().map(str::to_string),
        from_port: permission.from_port(),
        to_port: permission.to_port(),
        sources,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aws_sdk_ec2::types::{
        EbsInstanceBlockDevice, GroupIdentifier, InstanceBlockDeviceMapping,
        InstanceNetworkInterface, InstanceNetworkInterfaceAssociation, InstanceState,
        InstanceStateName, InstanceType, IpRange, Placement, Tag, UserIdGroupPair, VolumeType,
    };

    fn sample_instance() -> Instance {
        Instance::builder()
            .instance_id("i-0123456789abcdef0")
            .instance_type(InstanceType::T4gSmall)
            .state(
                InstanceState::builder()
                    .name(InstanceStateName::Running)
                    .build(),
            )
            .placement(
                Placement::builder()
                    .availability_zone("ap-northeast-2a")
                    .build(),
            )
            .private_ip_address("10.0.1.10")
            .public_ip_address("54.180.1.2")
            .vpc_id("vpc-11112222")
            .subnet_id("subnet-33334444")
            .image_id("ami-55556666")
            .root_device_name("/dev/xvda")
            .tags(Tag::builder().key("Name").value("web-1").build())
            .tags(Tag::builder().key("Env").value("dev").build())
            .block_device_mappings(
                InstanceBlockDeviceMapping::builder()
                    .device_name("/dev/xvda")
                    .ebs(
                        EbsInstanceBlockDevice::builder()
                            .volume_id("vol-777")
                            .delete_on_termination(true)
                            .build(),
                    )
                    .build(),
            )
            .security_groups(
                GroupIdentifier::builder()
                    .group_id("sg-999")
                    .group_name("web")
                    .build(),
            )
            .network_interfaces(
                InstanceNetworkInterface::builder()
                    .network_interface_id("eni-abc")
                    .subnet_id("subnet-33334444")
                    .private_ip_address("10.0.1.10")
                    .association(
                        InstanceNetworkInterfaceAssociation::builder()
                            .public_ip("54.180.1.2")
                            .build(),
                    )
                    .build(),
            )
            .build()
    }

    #[test]
    fn summary_reads_the_name_tag() {
        let summary = map_summary(&sample_instance());
        assert_eq!(summary.instance_id, "i-0123456789abcdef0");
        assert_eq!(summary.name.as_deref(), Some("web-1"));
        assert_eq!(summary.state.as_deref(), Some("running"));
        assert_eq!(summary.instance_type.as_deref(), Some("t4g.small"));
        assert_eq!(
            summary.availability_zone.as_deref(),
            Some("ap-northeast-2a")
        );
        assert_eq!(summary.lifecycle, None);
    }

    #[test]
    fn summary_marks_spot_lifecycle() {
        let instance = Instance::builder()
            .instance_id("i-spot")
            .instance_lifecycle(aws_sdk_ec2::types::InstanceLifecycleType::Spot)
            .build();
        let summary = map_summary(&instance);
        assert_eq!(summary.lifecycle.as_deref(), Some("spot"));
        assert_eq!(summary.capacity, "spot");
    }

    // An absent lifecycle is the API saying on-demand, not missing data, so
    // the Capacity column says so instead of showing a dash.
    #[test]
    fn missing_lifecycle_reads_as_on_demand() {
        assert_eq!(map_summary(&sample_instance()).capacity, "on-demand");
        assert_eq!(capacity_of(None), "on-demand");
        assert_eq!(capacity_of(Some("capacity-block")), "capacity-block");
    }

    #[test]
    fn karpenter_node_pool_comes_from_the_tag() {
        let instance = Instance::builder()
            .instance_id("i-karpenter")
            .tags(
                Tag::builder()
                    .key("karpenter.sh/nodepool")
                    .value("default")
                    .build(),
            )
            .build();
        assert_eq!(
            map_summary(&instance).karpenter_node_pool.as_deref(),
            Some("default")
        );
    }

    #[test]
    fn legacy_provisioner_tag_still_counts_as_karpenter() {
        let instance = Instance::builder()
            .instance_id("i-old")
            .tags(
                Tag::builder()
                    .key("karpenter.sh/provisioner-name")
                    .value("legacy")
                    .build(),
            )
            .build();
        assert_eq!(
            map_summary(&instance).karpenter_node_pool.as_deref(),
            Some("legacy")
        );
    }

    #[test]
    fn instances_without_the_tag_have_no_node_pool() {
        assert_eq!(map_summary(&sample_instance()).karpenter_node_pool, None);
    }

    #[test]
    fn detail_joins_volumes_onto_device_mappings() {
        let volume = Volume::builder()
            .volume_id("vol-777")
            .size(30)
            .volume_type(VolumeType::Gp3)
            .iops(3000)
            .encrypted(true)
            .build();
        let detail = map_detail(&sample_instance(), &[volume], &[]);
        assert_eq!(detail.storage.len(), 1);
        let disk = &detail.storage[0];
        assert_eq!(disk.volume_id.as_deref(), Some("vol-777"));
        assert_eq!(disk.size_gib, Some(30));
        assert_eq!(disk.volume_type.as_deref(), Some("gp3"));
        assert_eq!(disk.encrypted, Some(true));
        assert_eq!(disk.delete_on_termination, Some(true));
        assert!(disk.root_device);
    }

    #[test]
    fn detail_maps_security_group_rules() {
        let group = SecurityGroup::builder()
            .group_id("sg-999")
            .group_name("web")
            .description("web tier")
            .ip_permissions(
                IpPermission::builder()
                    .ip_protocol("tcp")
                    .from_port(443)
                    .to_port(443)
                    .ip_ranges(IpRange::builder().cidr_ip("0.0.0.0/0").build())
                    .user_id_group_pairs(UserIdGroupPair::builder().group_id("sg-111").build())
                    .build(),
            )
            .ip_permissions_egress(IpPermission::builder().ip_protocol("-1").build())
            .build();
        let detail = map_detail(&sample_instance(), &[], &[group]);
        assert_eq!(detail.security.len(), 1);
        let sg = &detail.security[0];
        assert_eq!(sg.ingress.len(), 1);
        assert_eq!(sg.ingress[0].protocol.as_deref(), Some("tcp"));
        assert_eq!(sg.ingress[0].from_port, Some(443));
        assert_eq!(
            sg.ingress[0].sources,
            vec!["0.0.0.0/0".to_string(), "sg-111".to_string()]
        );
        assert_eq!(sg.egress[0].protocol.as_deref(), Some("-1"));
    }

    #[test]
    fn network_tab_carries_eni_association() {
        let detail = map_detail(&sample_instance(), &[], &[]);
        assert_eq!(detail.network.vpc_id.as_deref(), Some("vpc-11112222"));
        assert_eq!(detail.network.interfaces.len(), 1);
        assert_eq!(
            detail.network.interfaces[0].public_ip.as_deref(),
            Some("54.180.1.2")
        );
    }
}
