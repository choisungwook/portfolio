#!/usr/bin/env bash
# Bedrock 장부를 AWS 콘솔에서 보기 위한 CloudWatch 대시보드를 만든다.
# AWS는 Bedrock automatic dashboard(Token Counts by Model)를 이미 제공하지만
# 거기에는 캐시 token 위젯이 없다. 이 대시보드는 지표마다 위젯 하나를 두고
# 마지막 세 개에서만 지표를 섞는다. Grafana의 "4. 지표 하나에 패널 하나"와 짝이다.
# 대시보드 3개까지는 무료이고 그 뒤로는 개당 월 $3이다.
set -euo pipefail
REGION=${AWS_REGION_NAME:-us-east-1}
MODEL=${MODEL_ID:-global.anthropic.claude-sonnet-4-6}
NAME=${DASHBOARD_NAME:-bedrock-token-ledger}
M='"AWS/Bedrock"'

body=$(cat <<JSON
{"widgets":[
 {"type":"metric","x":0,"y":0,"width":12,"height":6,"properties":{
   "title":"호출 수 (Invocations) — 돈이 드는 것은 이쪽뿐이다",
   "region":"$REGION","stat":"Sum","period":60,"view":"timeSeries","stacked":false,
   "metrics":[[$M,"Invocations","ModelId","$MODEL"]]}},
 {"type":"metric","x":12,"y":0,"width":12,"height":6,"properties":{
   "title":"입력 token (InputTokenCount) — 캐시 token은 빠져 있다",
   "region":"$REGION","stat":"Sum","period":60,"view":"timeSeries","stacked":false,
   "metrics":[[$M,"InputTokenCount","ModelId","$MODEL"]]}},
 {"type":"metric","x":0,"y":6,"width":12,"height":6,"properties":{
   "title":"출력 token (OutputTokenCount) — 스트림을 끊어도 max_tokens까지 센다",
   "region":"$REGION","stat":"Sum","period":60,"view":"timeSeries","stacked":false,
   "metrics":[[$M,"OutputTokenCount","ModelId","$MODEL"]]}},
 {"type":"metric","x":12,"y":6,"width":12,"height":6,"properties":{
   "title":"캐시 쓰기 token (CacheWriteInputTokenCount) — 쿼터에 포함된다",
   "region":"$REGION","stat":"Sum","period":60,"view":"timeSeries","stacked":false,
   "metrics":[[$M,"CacheWriteInputTokenCount","ModelId","$MODEL"]]}},
 {"type":"metric","x":0,"y":12,"width":12,"height":6,"properties":{
   "title":"캐시 읽기 token (CacheReadInputTokenCount) — 쿼터에서 빠진다",
   "region":"$REGION","stat":"Sum","period":60,"view":"timeSeries","stacked":false,
   "metrics":[[$M,"CacheReadInputTokenCount","ModelId","$MODEL"]]}},
 {"type":"metric","x":12,"y":12,"width":12,"height":6,"properties":{
   "title":"입력 token 세 종류 (합쳐야 LiteLLM prompt_tokens가 된다)",
   "region":"$REGION","stat":"Sum","period":60,"view":"timeSeries","stacked":false,
   "metrics":[
     [$M,"InputTokenCount","ModelId","$MODEL",{"label":"InputTokenCount (캐시 제외)"}],
     [$M,"CacheWriteInputTokenCount","ModelId","$MODEL",{"label":"CacheWrite (쿼터에 포함)"}],
     [$M,"CacheReadInputTokenCount","ModelId","$MODEL",{"label":"CacheRead (쿼터 제외)"}]]}},
 {"type":"metric","x":0,"y":18,"width":12,"height":6,"properties":{
   "title":"쿼터에 잡히는 입력 = InputTokenCount + CacheWrite",
   "region":"$REGION","stat":"Sum","period":60,"view":"timeSeries",
   "metrics":[
     [{"expression":"m1+m2","label":"쿼터 기준 입력 token","id":"e1"}],
     [$M,"InputTokenCount","ModelId","$MODEL",{"id":"m1","visible":false}],
     [$M,"CacheWriteInputTokenCount","ModelId","$MODEL",{"id":"m2","visible":false}]]}},
 {"type":"metric","x":12,"y":18,"width":12,"height":6,"properties":{
   "title":"스트림 중단 확인용: 호출당 평균 출력 token",
   "region":"$REGION","stat":"Sum","period":60,"view":"timeSeries",
   "metrics":[
     [{"expression":"m1/m2","label":"출력 token / 호출","id":"e1"}],
     [$M,"OutputTokenCount","ModelId","$MODEL",{"id":"m1","visible":false}],
     [$M,"Invocations","ModelId","$MODEL",{"id":"m2","visible":false}]]}}
]}
JSON
)
aws cloudwatch put-dashboard --region "$REGION" --dashboard-name "$NAME" --dashboard-body "$body" --output text
echo "https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards/dashboard/$NAME"
