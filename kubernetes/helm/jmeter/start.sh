#!/bin/sh
namespace="jmeter"
master_pod=$(kubectl get pods -n ${namespace} -ljmeter_role=master -o jsonpath='{.items[*].metadata.name}')

jmx="$1"
if [ ! -f "$jmx" ];
then
    echo "Please check that jmx is exist"
    exit
fi

kubectl cp "$jmx" -n $namespace "$master_pod:/$jmx"

# execute script.jmx
kubectl exec -ti -n $namespace $master_pod -- /bin/bash /load_test "/$jmx"