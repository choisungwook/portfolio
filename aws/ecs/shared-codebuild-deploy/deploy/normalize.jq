# describe-task-definition 응답을 Git JSON 형식으로 바꾼다. export와 diff가 같이 쓴다.
.taskDefinition
| del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
      .registeredAt, .registeredBy, .deregisteredAt)
| .containerDefinitions[0].image = "__IMAGE__"
| del(.. | select(. == [] or . == {}))
