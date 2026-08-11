//! Read-only CloudTrail event lookup.

use crate::creds::RoleCredentials;
use crate::error::{aws_error, CoreError};
use aws_sdk_cloudtrail::types::{Event, LookupAttribute, LookupAttributeKey};
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct EventSummary {
    pub event_id: Option<String>,
    pub event_name: Option<String>,
    pub event_time: Option<String>,
    pub event_source: Option<String>,
    pub username: Option<String>,
    pub resources: Vec<String>,
}

fn client(region: &str, creds: &RoleCredentials, insecure: bool) -> aws_sdk_cloudtrail::Client {
    let credentials = aws_credential_types::Credentials::new(
        creds.access_key_id.clone(),
        creds.secret_access_key.clone(),
        creds.session_token.clone(),
        None,
        "akbun-awsviewer-cli",
    );
    let mut builder = aws_sdk_cloudtrail::Config::builder()
        .behavior_version(aws_sdk_cloudtrail::config::BehaviorVersion::latest())
        .region(aws_sdk_cloudtrail::config::Region::new(region.to_string()))
        .credentials_provider(credentials);
    if insecure {
        builder = builder.http_client(crate::http::insecure_http_client());
    }
    aws_sdk_cloudtrail::Client::from_conf(builder.build())
}

pub async fn lookup_events(
    region: &str,
    creds: &RoleCredentials,
    insecure: bool,
    event_name: Option<&str>,
) -> Result<Vec<EventSummary>, CoreError> {
    let mut request = client(region, creds, insecure)
        .lookup_events()
        .max_results(20);
    if let Some(name) = event_name.map(str::trim).filter(|name| !name.is_empty()) {
        let attribute = LookupAttribute::builder()
            .attribute_key(LookupAttributeKey::EventName)
            .attribute_value(name)
            .build()
            .map_err(|error| CoreError::Aws {
                message: format!("invalid CloudTrail EventName filter: {error}"),
            })?;
        request = request.lookup_attributes(attribute);
    }
    let output = request.send().await.map_err(aws_error)?;
    let mut events: Vec<EventSummary> = output.events().iter().map(map_event).collect();
    events.sort_by(|left, right| right.event_time.cmp(&left.event_time));
    Ok(events)
}

fn map_event(event: &Event) -> EventSummary {
    EventSummary {
        event_id: event.event_id().map(str::to_string),
        event_name: event.event_name().map(str::to_string),
        event_time: event
            .event_time()
            .and_then(|time| time.fmt(aws_smithy_types::date_time::Format::DateTime).ok()),
        event_source: event.event_source().map(str::to_string),
        username: event.username().map(str::to_string),
        resources: event
            .resources()
            .iter()
            .filter_map(|resource| resource.resource_name().map(str::to_string))
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_event_fields_and_resources() {
        let event = Event::builder()
            .event_id("event-1")
            .event_name("GetParameter")
            .event_source("ssm.amazonaws.com")
            .username("developer")
            .resources(
                aws_sdk_cloudtrail::types::Resource::builder()
                    .resource_name("/app/database/url")
                    .build(),
            )
            .build();
        let summary = map_event(&event);
        assert_eq!(summary.event_name.as_deref(), Some("GetParameter"));
        assert_eq!(summary.resources, vec!["/app/database/url"]);
    }
}
