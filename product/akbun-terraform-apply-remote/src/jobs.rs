use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

/// Counts in-flight webhook jobs so shutdown can drain them.
///
/// A terraform apply killed halfway is the worst outcome a deploy can
/// cause, so the server refuses to exit while a job is running (up to a
/// drain timeout). Each job holds a JobGuard; dropping it decrements the
/// counter and wakes waiters.
pub struct JobTracker {
  count: Mutex<usize>,
  idle: Condvar,
}

pub struct JobGuard {
  tracker: Arc<JobTracker>,
}

impl JobTracker {
  pub fn new() -> JobTracker {
    JobTracker { count: Mutex::new(0), idle: Condvar::new() }
  }

  pub fn begin(tracker: &Arc<JobTracker>) -> JobGuard {
    *tracker.count.lock().unwrap() += 1;
    JobGuard { tracker: tracker.clone() }
  }

  pub fn active(&self) -> usize {
    *self.count.lock().unwrap()
  }

  /// Blocks until no job is running or the timeout passes.
  /// Returns true when fully drained.
  pub fn wait_idle(&self, timeout: Duration) -> bool {
    let count = self.count.lock().unwrap();
    let (count, _) = self.idle.wait_timeout_while(count, timeout, |c| *c > 0).unwrap();
    *count == 0
  }
}

impl Drop for JobGuard {
  fn drop(&mut self) {
    let mut count = self.tracker.count.lock().unwrap();
    *count -= 1;
    if *count == 0 {
      self.tracker.idle.notify_all();
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::time::Instant;

  #[test]
  fn guard_counts_and_releases() {
    let tracker = Arc::new(JobTracker::new());
    assert_eq!(tracker.active(), 0);
    let a = JobTracker::begin(&tracker);
    let b = JobTracker::begin(&tracker);
    assert_eq!(tracker.active(), 2);
    drop(a);
    assert_eq!(tracker.active(), 1);
    drop(b);
    assert_eq!(tracker.active(), 0);
  }

  #[test]
  fn wait_idle_returns_immediately_when_idle() {
    let tracker = Arc::new(JobTracker::new());
    assert!(tracker.wait_idle(Duration::from_millis(1)));
  }

  #[test]
  fn wait_idle_times_out_while_a_job_runs() {
    let tracker = Arc::new(JobTracker::new());
    let _guard = JobTracker::begin(&tracker);
    let start = Instant::now();
    assert!(!tracker.wait_idle(Duration::from_millis(50)));
    assert!(start.elapsed() >= Duration::from_millis(50));
  }

  #[test]
  fn wait_idle_wakes_when_the_last_job_finishes() {
    let tracker = Arc::new(JobTracker::new());
    let guard = JobTracker::begin(&tracker);
    let worker = {
      let tracker = tracker.clone();
      std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(30));
        drop(guard);
        tracker.active()
      })
    };
    assert!(tracker.wait_idle(Duration::from_secs(5)));
    worker.join().unwrap();
  }
}
