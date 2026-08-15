import threading
from queue import Queue

from serving_v1 import GenerateRequest, ModelExecutor, QueueMetrics, app


def test_queue_metrics_track_task_lifecycle():
  """Track queued, processing, and completed task counts."""
  metrics = QueueMetrics()

  assert metrics.snapshot() == {
    "queued_tasks": 0,
    "processing_tasks": 0,
    "completed_tasks": 0,
    "pending_tasks": 0,
  }

  metrics.enqueue()
  assert metrics.snapshot()["queued_tasks"] == 1

  metrics.start_processing()
  assert metrics.snapshot()["processing_tasks"] == 1

  metrics.complete()
  assert metrics.snapshot() == {
    "queued_tasks": 0,
    "processing_tasks": 0,
    "completed_tasks": 1,
    "pending_tasks": 0,
  }


def test_queue_state_endpoint_is_registered():
  """Expose queue metrics through the API."""
  paths = {route.path for route in app.routes}

  assert "/queue_state" in paths


def test_generate_request_accepts_queue_observation_delay():
  """Allow a bounded educational delay for observing queued tasks."""
  request = GenerateRequest(prompt="Explain model queues", min_processing_seconds=15)

  assert request.min_processing_seconds == 15


def test_result_dispatcher_matches_out_of_order_batches():
  """Deliver each worker result to the HTTP thread waiting for its batch ID."""
  executor = ModelExecutor()
  first = Queue(maxsize=1)
  second = Queue(maxsize=1)
  executor.pending_results = {"first": first, "second": second}
  dispatcher = threading.Thread(target=executor._dispatch_results)
  dispatcher.start()

  executor.result_queue.put(("complete", "second", [{"request_id": "2"}]))
  executor.result_queue.put(("complete", "first", [{"request_id": "1"}]))

  assert second.get(timeout=1)[0]["request_id"] == "2"
  assert first.get(timeout=1)[0]["request_id"] == "1"

  executor.result_queue.put(("stop", "", []))
  dispatcher.join(timeout=1)
