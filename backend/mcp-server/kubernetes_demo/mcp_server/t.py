mport os

import json

from typing import Optional, List

from pathlib import Path

from contextlib import asynccontextmanager



from pydantic import BaseModel, Field

from dotenv import load_dotenv

from kubernetes import client, config

from mcp.server.fastmcp import FastMCP, Context



# Define settings model for Kubernetes configuration

class KubeSettings(BaseModel):

"""Settings for the Kubernetes MCP server."""

kubeconfig_path: Optional[str] = None

in_cluster: bool = False

namespace: str = "default"



# Load environment based on PROFILE

def load_env_config():

profile = os.environ.get("PROFILE", "local")

env_file = f".env.{profile}"



if os.path.exists(env_file):

load_dotenv(env_file)

print(f"Loaded environment from {env_file}")

else:

print(f"Warning: Environment file {env_file} not found")



return KubeSettings(

kubeconfig_path=os.environ.get("KUBECONFIG"),

in_cluster=(profile != "local"),

namespace=os.environ.get("NAMESPACE", "default")

)



# Server lifespan to initialize Kubernetes client

@asynccontextmanager

async def server_lifespan(app: FastMCP):

"""Initialize Kubernetes client during server startup"""

settings = load_env_config()



try:

if settings.in_cluster:

config.load_incluster_config()

print("Using in-cluster Kubernetes configuration")

else:

kubeconfig = settings.kubeconfig_path

if not kubeconfig:

# Look for default kubeconfig location

home = str(Path.home())

default_kubeconfig = os.path.join(home, '.kube', 'config')

if os.path.exists(default_kubeconfig):

kubeconfig = default_kubeconfig



if kubeconfig:

config.load_kube_config(kubeconfig)

print(f"Using Kubernetes config from: {kubeconfig}")

else:

raise ValueError("No kubeconfig found")



# Test API connection

v1 = client.CoreV1Api()

version = v1.get_api_resources()

print(f"Successfully connected to Kubernetes API (v{version.api_version})")



yield {"api_client": client.ApiClient(), "settings": settings}

except Exception as e:

print(f"Error initializing Kubernetes client: {e}")

yield {}



# Pydantic models for input validation

class PodSpec(BaseModel):

name: str = Field(description="Name of the pod")

image: str = Field(description="Container image to use")

namespace: Optional[str] = Field(None, description="Kubernetes namespace (defaults to configured namespace)")



class ServiceSpec(BaseModel):

name: str = Field(description="Name of the service")

selector_app: str = Field(description="App label selector for pods")

port: int = Field(description="Service port")

target_port: int = Field(description="Target port on the pod")

service_type: str = Field(default="ClusterIP", description="Service type (ClusterIP, NodePort, LoadBalancer)")

namespace: Optional[str] = Field(None, description="Kubernetes namespace (defaults to configured namespace)")



# Helper function to get default namespace from context

def get_namespace(ctx: Context, namespace: Optional[str] = None) -> str:

if namespace:

return namespace



if ctx and ctx.request_context.lifespan_context and "settings" in ctx.request_context.lifespan_context:

return ctx.request_context.lifespan_context["settings"].namespace



return "default"



# Create the MCP server

mcp = FastMCP(

"Kubernetes Manager",

instructions="Manage Kubernetes resources including pods and services",

dependencies=["kubernetes", "python-dotenv"],

lifespan=server_lifespan,

)



# Resources

@mcp.resource("cluster://info")

def get_cluster_info(ctx: Context) -> str:

"""Get basic information about the current Kubernetes cluster"""

try:

v1 = client.CoreV1Api()

version_info = v1.get_api_resources()



# Try to get node information

try:

nodes = v1.list_node()

node_count = len(nodes.items)

node_names = [node.metadata.name for node in nodes.items]

except:

node_count = 0

node_names = []



# Get namespaces

try:

namespaces = v1.list_namespace()

namespace_names = [ns.metadata.name for ns in namespaces.items]

except:

namespace_names = []



# Get default namespace from context

default_namespace = "default"

if ctx.request_context.lifespan_context and "settings" in ctx.request_context.lifespan_context:

default_namespace = ctx.request_context.lifespan_context["settings"].namespace



return json.dumps({

"api_version": version_info.api_version,

"node_count": node_count,

"nodes": node_names,

"namespaces": namespace_names,

"default_namespace": default_namespace

}, indent=2)

except Exception as e:

return f"Error getting cluster info: {str(e)}"



@mcp.resource("namespaces://list")

def list_namespaces() -> str:

"""List all namespaces in the cluster"""

try:

v1 = client.CoreV1Api()

namespaces = v1.list_namespace()

return json.dumps([ns.metadata.name for ns in namespaces.items], indent=2)

except Exception as e:

return f"Error listing namespaces: {str(e)}"



@mcp.resource("namespace://{namespace}/pods")

def get_namespace_pods(namespace: str) -> str:

"""List all pods in the specified namespace"""

try:

v1 = client.CoreV1Api()

pods = v1.list_namespaced_pod(namespace)



result = []

for pod in pods.items:

status = pod.status.phase

result.append({

"name": pod.metadata.name,

"status": status,

"node": pod.spec.node_name if pod.spec.node_name else "None"

})



return json.dumps(result, indent=2)

except Exception as e:

return f"Error getting pods in namespace {namespace}: {str(e)}"



@mcp.resource("namespace://{namespace}/services")

def get_namespace_services(namespace: str) -> str:

"""List all services in the specified namespace"""

try:

v1 = client.CoreV1Api()

services = v1.list_namespaced_service(namespace)



result = []

for svc in services.items:

ports = [{"port": port.port, "targetPort": port.target_port} for port in svc.spec.ports]

result.append({

"name": svc.metadata.name,

"type": svc.spec.type,

"clusterIP": svc.spec.cluster_ip,

"ports": ports

})



return json.dumps(result, indent=2)

except Exception as e:

return f"Error getting services in namespace {namespace}: {str(e)}"



# Tools for querying Kubernetes

@mcp.tool()

async def list_pods(namespace: Optional[str] = None, ctx: Context = None) -> str:

"""List all pods in the specified namespace"""

actual_namespace = get_namespace(ctx, namespace)



if ctx:

await ctx.info(f"Listing pods in namespace {actual_namespace}")



v1 = client.CoreV1Api()



try:

pods = v1.list_namespaced_pod(actual_namespace)



result = []

for i, pod in enumerate(pods.items):

status = pod.status.phase

ready = sum(1 for c in pod.status.container_statuses if c.ready) if pod.status.container_statuses else 0

total = len(pod.status.container_statuses) if pod.status.container_statuses else 0



result.append(f"Pod: {pod.metadata.name}, Status: {status}, Ready: {ready}/{total}")



if ctx:

await ctx.report_progress(i+1, len(pods.items))



if not result:

return f"No pods found in namespace {actual_namespace}"



return "\n".join(result)

except Exception as e:

if ctx:

await ctx.error(f"Error listing pods: {str(e)}")

return f"Error listing pods: {str(e)}"



@mcp.tool()

async def list_services(namespace: Optional[str] = None, ctx: Context = None) -> str:

"""List all services in the specified namespace"""

actual_namespace = get_namespace(ctx, namespace)



if ctx:

await ctx.info(f"Listing services in namespace {actual_namespace}")



v1 = client.CoreV1Api()



try:

services = v1.list_namespaced_service(actual_namespace)



result = []

for svc in services.items:

ports = [f"{port.port}:{port.target_port}" for port in svc.spec.ports]

result.append(f"Service: {svc.metadata.name}, Type: {svc.spec.type}, Ports: {', '.join(ports)}")



if not result:

return f"No services found in namespace {actual_namespace}"



return "\n".join(result)

except Exception as e:

if ctx:

await ctx.error(f"Error listing services: {str(e)}")

return f"Error listing services: {str(e)}"



@mcp.tool()

async def get_pod_details(name: str, namespace: Optional[str] = None, ctx: Context = None) -> str:

"""Get detailed information about a specific pod"""

actual_namespace = get_namespace(ctx, namespace)



if ctx:

await ctx.info(f"Getting details for pod {name} in namespace {actual_namespace}")



v1 = client.CoreV1Api()



try:

pod = v1.read_namespaced_pod(name=name, namespace=actual_namespace)



details = {

"name": pod.metadata.name,

"namespace": pod.metadata.namespace,

"status": pod.status.phase,

"ip": pod.status.pod_ip,

"node": pod.spec.node_name if pod.spec.node_name else None,

"containers": [

{

"name": container.name,

"image": container.image,

"ready": any(cs.name == container.name and cs.ready for cs in pod.status.container_statuses) if pod.status.container_statuses else False

}

for container in pod.spec.containers

]

}



return json.dumps(details, indent=2)

except client.exceptions.ApiException as e:

if e.status == 404:

return f"Pod {name} not found in namespace {actual_namespace}"

if ctx:

await ctx.error(f"API error: {str(e)}")

return f"API error: {str(e)}"

except Exception as e:

if ctx:

await ctx.error(f"Error getting pod details: {str(e)}")

return f"Error getting pod details: {str(e)}"



# Tools for creating Kubernetes resources

@mcp.tool()

async def create_pod(spec: PodSpec, ctx: Context = None) -> str:

"""Create a new pod with the specified parameters"""

actual_namespace = get_namespace(ctx, spec.namespace)



if ctx:

await ctx.info(f"Creating pod {spec.name} in namespace {actual_namespace}")



v1 = client.CoreV1Api()



pod_manifest = {

"apiVersion": "v1",

"kind": "Pod",

"metadata": {"name": spec.name},

"spec": {

"containers": [

{

"name": spec.name,

"image": spec.image,

}

]

}

}



try:

v1.create_namespaced_pod(namespace=actual_namespace, body=pod_manifest)

return f"Pod {spec.name} created successfully in namespace {actual_namespace}"

except Exception as e:

if ctx:

await ctx.error(f"Error creating pod: {str(e)}")

return f"Error creating pod: {str(e)}"



@mcp.tool()

async def create_service(spec: ServiceSpec, ctx: Context = None) -> str:

"""Create a new service with the specified parameters"""

actual_namespace = get_namespace(ctx, spec.namespace)



if ctx:

await ctx.info(f"Creating service {spec.name} in namespace {actual_namespace}")



v1 = client.CoreV1Api()



service_manifest = {

"apiVersion": "v1",

"kind": "Service",

"metadata": {"name": spec.name},

"spec": {

"selector": {"app": spec.selector_app},

"type": spec.service_type,

"ports": [{"port": spec.port, "targetPort": spec.target_port}]

}

}



try:

v1.create_namespaced_service(namespace=actual_namespace, body=service_manifest)

return f"Service {spec.name} created successfully in namespace {actual_namespace}"

except Exception as e:

if ctx:

await ctx.error(f"Error creating service: {str(e)}")

return f"Error creating service: {str(e)}"



@mcp.tool()

async def delete_pod(name: str, namespace: Optional[str] = None, ctx: Context = None) -> str:

"""Delete a pod by name in the specified namespace"""

actual_namespace = get_namespace(ctx, namespace)



if ctx:

await ctx.info(f"Deleting pod {name} in namespace {actual_namespace}")



v1 = client.CoreV1Api()



try:

v1.delete_namespaced_pod(name=name, namespace=actual_namespace)

return f"Pod {name} deleted successfully from namespace {actual_namespace}"

except client.exceptions.ApiException as e:

if e.status == 404:

return f"Pod {name} not found in namespace {actual_namespace}"

if ctx:

await ctx.error(f"API error: {str(e)}")

return f"API error: {str(e)}"

except Exception as e:

if ctx:

await ctx.error(f"Error deleting pod: {str(e)}")

return f"Error deleting pod: {str(e)}"



@mcp.tool()

async def delete_service(name: str, namespace: Optional[str] = None, ctx: Context = None) -> str:

"""Delete a service by name in the specified namespace"""

actual_namespace = get_namespace(ctx, namespace)



if ctx:

await ctx.info(f"Deleting service {name} in namespace {actual_namespace}")



v1 = client.CoreV1Api()



try:

v1.delete_namespaced_service(name=name, namespace=actual_namespace)

return f"Service {name} deleted successfully from namespace {actual_namespace}"

except client.exceptions.ApiException as e:

if e.status == 404:

return f"Service {name} not found in namespace {actual_namespace}"

if ctx:

await ctx.error(f"API error: {str(e)}")

return f"API error: {str(e)}"

except Exception as e:

if ctx:

await ctx.error(f"Error deleting service: {str(e)}")

return f"Error deleting service: {str(e)}"



# Kind-specific tools

@mcp.tool()

async def get_kind_node_ports(ctx: Context = None) -> str:

"""Get NodePort services with their external URLs for Kind clusters"""

if ctx:

await ctx.info("Fetching NodePort services for Kind cluster")



v1 = client.CoreV1Api()



try:

# Get all services across all namespaces

services = v1.list_service_for_all_namespaces()



# Filter for NodePort services

nodeport_services = []

for svc in services.items:

if svc.spec.type == "NodePort":

for port in svc.spec.ports:

if port.node_port:

nodeport_services.append({

"name": svc.metadata.name,

"namespace": svc.metadata.namespace,

"port": port.port,

"nodePort": port.node_port,

"url": f"http://localhost:{port.node_port}"

})



if not nodeport_services:

return "No NodePort services found in the cluster"



return json.dumps(nodeport_services, indent=2)

except Exception as e:

if ctx:

await ctx.error(f"Error getting NodePort services: {str(e)}")

return f"Error getting NodePort services: {str(e)}"



# Main function to run the MCP server

def main():

mcp.run()



if __name__ == "__main__":

main()
