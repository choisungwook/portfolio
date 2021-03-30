#!/bin/sh
namespace="jmeter"
master_pod=$(kubectl get pods -n ${namespace} -ljmeter_role=master -o jsonpath='{.items[*].metadata.name}')
servers=$(kubectl get pods -n jmeter -ljmeter_role=server -o jsonpath='{.items[*].status.podIP}' | tr ' ' ',')
jmx="$1"
if [ ! -f "$jmx" ];
then
    echo "Please check that jmx is exist"
    exit
fi

kubectl cp "$jmx" -n $namespace "$master_pod:/$jmx"

# execute script.jmx
kubectl exec -ti -n $namespace $master_pod -- jmeter -n -t /$jmx -Dserver.rmi.ssl.disable=true -R $servers
