{{- define "tcp-echo-envoy.name" -}}
tcp-echo-envoy
{{- end -}}

{{- define "tcp-echo-envoy.fullname" -}}
{{- default (include "tcp-echo-envoy.name" .) .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "tcp-echo-envoy.labels" -}}
app.kubernetes.io/name: {{ include "tcp-echo-envoy.name" . }}
app.kubernetes.io/component: proxy
app.kubernetes.io/part-of: k8s-haproxy-tcp
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "tcp-echo-envoy.selectorLabels" -}}
app.kubernetes.io/name: {{ include "tcp-echo-envoy.name" . }}
app.kubernetes.io/component: proxy
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
