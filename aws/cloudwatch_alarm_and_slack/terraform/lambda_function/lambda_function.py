import json
import os
import urllib.request
from typing import TypedDict, List, Optional

class SNSMessageTriggerDimension(TypedDict):
  value: str
  name: str

class SNSMessageTrigger(TypedDict):
  MetricName: str
  Namespace: str
  StatisticType: str
  Statistic: str
  Unit: Optional[str]
  Dimensions: List[SNSMessageTriggerDimension]
  Period: int
  EvaluationPeriods: int
  ComparisonOperator: str
  Threshold: float
  TreatMissingData: str
  EvaluateLowSampleCountPercentile: str

class SNSMessagePayload(TypedDict):
  AlarmName: str
  AlarmDescription: Optional[str]
  AWSAccountId: str
  NewStateValue: str # ALARM, OK, INSUFFICIENT_DATA
  NewStateReason: str
  StateChangeTime: str
  Region: str
  AlarmArn: str
  OldStateValue: str
  Trigger: SNSMessageTrigger

def lambda_handler(event, context):
  """
  Handles an SNS event triggered by a CloudWatch alarm and sends a notification to Slack.
  """
  print("Event received:", json.dumps(event))

  SLACK_WEBHOOK_URL = os.environ.get('SLACK_WEBHOOK_URL')
  if not SLACK_WEBHOOK_URL:
    print("ERROR: SLACK_WEBHOOK_URL environment variable not set.")
    return {'statusCode': 500, 'body': json.dumps({'error': 'SLACK_WEBHOOK_URL not set'})}

  try:
    # Extract message from SNS
    sns_message_str = event['Records'][0]['Sns']['Message']
    sns_message: SNSMessagePayload = json.loads(sns_message_str)

    alarm_name = sns_message.get('AlarmName', 'N/A')
    alarm_description = sns_message.get('AlarmDescription', 'N/A')
    new_state_value = sns_message.get('NewStateValue', 'N/A') # ALARM, OK, INSUFFICIENT_DATA
    new_state_reason = sns_message.get('NewStateReason', 'N/A')
    region = sns_message.get('Region', 'N/A')
    aws_account_id = sns_message.get('AWSAccountId', 'N/A')
    timestamp = event['Records'][0]['Sns'].get('Timestamp', 'N/A')

    # Determine message color and status based on alarm state
    if new_state_value == "ALARM":
      color = "danger"  # Red for alarms
      status_emoji = ":rotating_light:" # Siren emoji
      status_text = "TRIGGERED"
    elif new_state_value == "OK":
      color = "good"    # Green for resolved alarms
      status_emoji = ":white_check_mark:" # Checkmark emoji
      status_text = "RESOLVED"
    else:
      color = "warning" # Yellow for other states
      status_emoji = ":warning:" # Warning emoji
      status_text = new_state_value # e.g., INSUFFICIENT_DATA

    # Construct Slack message payload
    slack_message = {
      "attachments": [
        {
          "color": color,
          "fallback": f"{status_emoji} CloudWatch Alarm {status_text}: {alarm_name}",
          "blocks": [
            {
              "type": "header",
              "text": {
                "type": "plain_text",
                "text": f"{status_emoji} CloudWatch Alarm: {status_text}",
                "emoji": True
              }
            },
            {
              "type": "section",
              "fields": [
                {"type": "mrkdwn", "text": f"*Alarm Name:*\\n{alarm_name}"},
                {"type": "mrkdwn", "text": f"*Region:*\\n{region}"},
                {"type": "mrkdwn", "text": f"*Account ID:*\\n{aws_account_id}"},
                {"type": "mrkdwn", "text": f"*Timestamp:*\\n{timestamp}"}
              ]
            },
            {
              "type": "section",
              "text": {
                "type": "mrkdwn",
                "text": f"*Description:*\\n{alarm_description}"
              }
            },
            {
              "type": "section",
              "text": {
                "type": "mrkdwn",
                "text": f"*Details:*\\n```{new_state_reason}```"
              }
            },
            {
              "type": "context",
              "elements": [
                {
                  "type": "mrkdwn",
                  "text": f"Alarm ARN: {sns_message.get('AlarmArn', 'N/A')}"
                }
              ]
            }
          ]
        }
      ]
    }

    # Send message to Slack
    req = urllib.request.Request(
      SLACK_WEBHOOK_URL,
      data=json.dumps(slack_message).encode('utf-8'),
      headers={'Content-Type': 'application/json'}
    )
    print("Sending message to Slack:", json.dumps(slack_message))
    with urllib.request.urlopen(req) as response:
      response_body = response.read().decode('utf-8')
      print("Slack API response:", response.status, response_body)
      if response.status == 200 and response_body == "ok":
        print("Message posted to Slack successfully.")
        return {'statusCode': 200, 'body': json.dumps({'message': 'Notification sent to Slack'})}
      else:
        print(f"Error sending to Slack: {response.status} - {response_body}")
        return {'statusCode': response.status, 'body': json.dumps({'error': 'Failed to send to Slack', 'details': response_body})}

  except Exception as e:
    print(f"Error processing event: {e}")
    # Send a basic error to Slack if possible
    try:
      error_message = {
        "text": f":x: Error processing CloudWatch Alarm notification for Lambda: {str(e)}"
      }
      req = urllib.request.Request(
        SLACK_WEBHOOK_URL,
        data=json.dumps(error_message).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
      )
      urllib.request.urlopen(req)
    except Exception as slack_err:
      print(f"Failed to send error notification to Slack: {slack_err}")

    return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}

# For local testing (simulate an SNS event)
if __name__ == '__main__':
  # Example ALARM event
  test_event_alarm = {
    "Records": [
      {
        "EventSource": "aws:sns",
        "EventVersion": "1.0",
        "EventSubscriptionArn": "arn:aws:sns:ap-northeast-2:123456789012:cloudwatch-alarm-demo-rds-alarms-topic:xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "Sns": {
          "Type": "Notification",
          "MessageId": "some-message-id",
          "TopicArn": "arn:aws:sns:ap-northeast-2:123456789012:cloudwatch-alarm-demo-rds-alarms-topic",
          "Subject": 'ALARM: \\"cloudwatch-alarm-demo-cpu-utilization-high\\" in Asia Pacific (Seoul)',
          "Message": '{"AlarmName":"cloudwatch-alarm-demo-cpu-utilization-high","AlarmDescription":"Alarm when RDS CPU utilization exceeds 80%","AWSAccountId":"123456789012","NewStateValue":"ALARM","NewStateReason":"Threshold Crossed: 1 out of the last 1 datapoints [90.0 (20/05/24 10:05:00)] was greater than or equal to the threshold (80.0) (minimum 1 datapoint for OK -> ALARM transition).","StateChangeTime":"2024-05-20T10:10:00.000+0000","Region":"Asia Pacific (Seoul)","AlarmArn":"arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:cloudwatch-alarm-demo-cpu-utilization-high","OldStateValue":"OK","Trigger":{"MetricName":"CPUUtilization","Namespace":"AWS/RDS","StatisticType":"Statistic","Statistic":"AVERAGE","Unit":null,"Dimensions":[{"value":"cloudwatch-alarm-demo","name":"DBClusterIdentifier"}],"Period":300,"EvaluationPeriods":1,"ComparisonOperator":"GreaterThanOrEqualToThreshold","Threshold":80.0,"TreatMissingData":"- TreatMissingData: missing","EvaluateLowSampleCountPercentile":""}}',
          "Timestamp": "2024-05-20T10:10:00.000Z",
          "SignatureVersion": "1",
          "Signature": "EXAMPLE_SIGNATURE",
          "SigningCertUrl": "EXAMPLE_CERT_URL",
          "UnsubscribeUrl": "EXAMPLE_UNSUBSCRIBE_URL",
          "MessageAttributes": {}
        }
      }
    ]
  }
  # Example OK event
  test_event_ok = {
    "Records": [
      {
        "EventSource": "aws:sns",
        "EventVersion": "1.0",
        "EventSubscriptionArn": "arn:aws:sns:ap-northeast-2:123456789012:cloudwatch-alarm-demo-rds-alarms-topic:xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "Sns": {
          "Type": "Notification",
          "MessageId": "some-other-message-id",
          "TopicArn": "arn:aws:sns:ap-northeast-2:123456789012:cloudwatch-alarm-demo-rds-alarms-topic",
          "Subject": 'OK: \\"cloudwatch-alarm-demo-cpu-utilization-high\\" in Asia Pacific (Seoul)',
          "Message": '{"AlarmName":"cloudwatch-alarm-demo-cpu-utilization-high","AlarmDescription":"Alarm when RDS CPU utilization exceeds 80%","AWSAccountId":"123456789012","NewStateValue":"OK","NewStateReason":"Threshold Crossed: 1 out of the last 1 datapoints [10.0 (20/05/24 10:15:00)] was not greater than or equal to the threshold (80.0) (minimum 1 datapoint for ALARM -> OK transition).","StateChangeTime":"2024-05-20T10:20:00.000+0000","Region":"Asia Pacific (Seoul)","AlarmArn":"arn:aws:cloudwatch:ap-northeast-2:123456789012:alarm:cloudwatch-alarm-demo-cpu-utilization-high","OldStateValue":"ALARM","Trigger":{"MetricName":"CPUUtilization","Namespace":"AWS/RDS","StatisticType":"Statistic","Statistic":"AVERAGE","Unit":null,"Dimensions":[{"value":"cloudwatch-alarm-demo","name":"DBClusterIdentifier"}],"Period":300,"EvaluationPeriods":1,"ComparisonOperator":"GreaterThanOrEqualToThreshold","Threshold":80.0,"TreatMissingData":"- TreatMissingData: missing","EvaluateLowSampleCountPercentile":""}}',
          "Timestamp": "2024-05-20T10:20:00.000Z",
          "SignatureVersion": "1",
          "Signature": "EXAMPLE_SIGNATURE_OK",
          "SigningCertUrl": "EXAMPLE_CERT_URL_OK",
          "UnsubscribeUrl": "EXAMPLE_UNSUBSCRIBE_URL_OK",
          "MessageAttributes": {}
        }
      }
    ]
  }

  print("--- Testing ALARM event ---")
  lambda_handler(test_event_alarm, None)
  print("\\n--- Testing OK event ---")
  lambda_handler(test_event_ok, None)
