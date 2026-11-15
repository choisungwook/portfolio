//! Who hears what: the connections, their subscriptions and the replay tails.
//!
//! Everything here is decided under one lock and delivered by pushing a line
//! onto each connection's own queue, so it runs and tests without a socket. The
//! single lock is what gives an attach its guarantee: a viewer is subscribed and
//! handed the replay in one step, so no byte falls between the replay and the
//! live stream and none is sent twice.

use std::collections::{BTreeSet, HashMap, VecDeque};
use std::sync::mpsc::{sync_channel, Receiver, SyncSender};
use std::sync::{Arc, Mutex};

use crate::protocol::{event_line, reply_line, Event, Response};

pub type ConnId = u64;

/// Raw output kept per session for a view that attaches late.
const REPLAY_BYTES: usize = 256 * 1024;

/// Lines a connection may have waiting before it is considered stuck. Output
/// arrives in chunks of at most a few KB, so this is a bound in the tens of MB
/// rather than a rate limit.
const QUEUE_LINES: usize = 4096;

/// The most recent output of a session, oldest dropped first.
struct Ring {
    chunks: VecDeque<Vec<u8>>,
    len: usize,
}

impl Ring {
    fn push(&mut self, bytes: &[u8], cap: usize) {
        self.chunks.push_back(bytes.to_vec());
        self.len += bytes.len();
        while self.len > cap {
            let excess = self.len - cap;
            let Some(front) = self.chunks.front_mut() else {
                break;
            };
            if front.len() <= excess {
                self.len -= front.len();
                self.chunks.pop_front();
            } else {
                // Trim the oldest chunk rather than dropping it whole, so the
                // tail stays as close to the cap as the data allows.
                front.drain(..excess);
                self.len -= excess;
            }
        }
    }
}

struct Connection {
    queue: SyncSender<Arc<str>>,
    /// Called when the hub gives up on this connection, so whatever is blocked
    /// writing to it is released.
    close: Box<dyn Fn() + Send>,
}

struct Inner {
    next: ConnId,
    connections: HashMap<ConnId, Connection>,
    rings: HashMap<u32, Ring>,
    subscribers: HashMap<u32, BTreeSet<ConnId>>,
    /// Sessions to end when the connection that spawned them goes. Kept apart
    /// from `connections` because a connection can be dropped for being slow
    /// well before its reader notices, and the sessions must still be found.
    owned: HashMap<u32, ConnId>,
}

impl Inner {
    /// Queues a line. A connection that cannot take it is dropped, because the
    /// alternative is making everyone else wait for it.
    fn push(&mut self, conn: ConnId, line: &Arc<str>) {
        let Some(connection) = self.connections.get(&conn) else {
            return;
        };
        if connection.queue.try_send(Arc::clone(line)).is_err() {
            self.remove(conn, true);
        }
    }

    fn remove(&mut self, conn: ConnId, close: bool) {
        if let Some(connection) = self.connections.remove(&conn) {
            if close {
                (connection.close)();
            }
        }
        for subscribed in self.subscribers.values_mut() {
            subscribed.remove(&conn);
        }
    }

    fn subscribe(&mut self, conn: ConnId, session: u32) {
        self.subscribers.entry(session).or_default().insert(conn);
    }
}

pub struct Hub {
    inner: Mutex<Inner>,
    queue_lines: usize,
    replay_bytes: usize,
}

impl Default for Hub {
    fn default() -> Self {
        Self::with_limits(QUEUE_LINES, REPLAY_BYTES)
    }
}

impl Hub {
    pub fn with_limits(queue_lines: usize, replay_bytes: usize) -> Self {
        Self {
            inner: Mutex::new(Inner {
                next: 1,
                connections: HashMap::new(),
                rings: HashMap::new(),
                subscribers: HashMap::new(),
                owned: HashMap::new(),
            }),
            queue_lines,
            replay_bytes,
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        // A panic while holding this lock cannot leave the maps half-edited in
        // a way that matters more than losing every connection would.
        self.inner.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// Adds a connection. The receiver is its outbound queue, to be drained by
    /// whatever writes to it; `close` is called if the hub drops it for being
    /// too slow.
    pub fn register(
        &self,
        close: impl Fn() + Send + 'static,
    ) -> (ConnId, Receiver<Arc<str>>) {
        let (queue, lines) = sync_channel(self.queue_lines);
        let mut inner = self.lock();
        let id = inner.next;
        inner.next += 1;
        inner.connections.insert(
            id,
            Connection {
                queue,
                close: Box::new(close),
            },
        );
        (id, lines)
    }

    /// Forgets a connection and its subscriptions. The shells keep running,
    /// except the ones it spawned as owned, which are returned for the caller
    /// to end. Its queue is closed, so a writer draining it ends after the
    /// last line.
    pub fn unregister(&self, conn: ConnId) -> Vec<u32> {
        let mut inner = self.lock();
        inner.remove(conn, false);
        let mut owned: Vec<u32> = inner
            .owned
            .iter()
            .filter(|(_, owner)| **owner == conn)
            .map(|(session, _)| *session)
            .collect();
        owned.sort_unstable();
        for session in &owned {
            inner.owned.remove(session);
        }
        owned
    }

    pub fn connection_count(&self) -> usize {
        self.lock().connections.len()
    }

    pub fn subscriber_count(&self, session: u32) -> usize {
        self.lock().subscribers.get(&session).map_or(0, BTreeSet::len)
    }

    pub fn reply(&self, conn: ConnId, response: &Response) {
        let line: Arc<str> = reply_line(response).into();
        self.lock().push(conn, &line);
    }

    /// Runs `produce` and replies with its answer. When that is a new session,
    /// the connection is subscribed to it first, still under the lock, so the
    /// first bytes the shell prints cannot be published before this connection
    /// is listening, and the reply is queued ahead of them. `owned` makes the
    /// connection the session's owner, see [`Hub::unregister`].
    pub fn reply_subscribing(
        &self,
        conn: ConnId,
        owned: bool,
        produce: impl FnOnce() -> Response,
    ) {
        let mut inner = self.lock();
        let response = produce();
        if let Response::Spawned { session } = &response {
            inner.subscribe(conn, *session);
            if owned {
                inner.owned.insert(*session, conn);
            }
        }
        let line: Arc<str> = reply_line(&response).into();
        inner.push(conn, &line);
    }

    /// Subscribes `conn` to `session` and answers with the output so far.
    ///
    /// `lookup` says whether the session exists and how big it is. It runs
    /// under the lock, and a session is removed from the app before its exit is
    /// published, so a session that passes here is one whose exit this
    /// connection will still hear about.
    pub fn attach(
        &self,
        conn: ConnId,
        session: u32,
        lookup: impl FnOnce() -> Option<(u16, u16)>,
    ) {
        let mut inner = self.lock();
        let response = match lookup() {
            Some((cols, rows)) => {
                inner.subscribe(conn, session);
                Response::Attached {
                    session,
                    cols,
                    rows,
                    replay: inner
                        .rings
                        .get(&session)
                        .map(|ring| ring.chunks.iter().cloned().collect())
                        .unwrap_or_default(),
                }
            }
            None => Response::Error {
                message: format!("no session {session}"),
            },
        };
        let line: Arc<str> = reply_line(&response).into();
        inner.push(conn, &line);
    }

    pub fn detach(&self, conn: ConnId, session: u32) {
        if let Some(subscribed) = self.lock().subscribers.get_mut(&session) {
            subscribed.remove(&conn);
        }
    }

    /// Delivers a session's output or exit to whoever is attached, keeping the
    /// output for the next view. An exit also ends the session's bookkeeping.
    pub fn publish(&self, event: &Event) {
        let (session, ends) = match event {
            Event::Output { session, .. } => (*session, false),
            Event::Exited { session } => (*session, true),
            Event::State { .. } => return,
        };
        let Some(line) = event_line(event).map(Arc::<str>::from) else {
            return;
        };
        let mut inner = self.lock();
        if let Event::Output { bytes, .. } = event {
            inner
                .rings
                .entry(session)
                .or_insert_with(|| Ring {
                    chunks: VecDeque::new(),
                    len: 0,
                })
                .push(bytes, self.replay_bytes);
        }
        let attached: Vec<ConnId> = inner
            .subscribers
            .get(&session)
            .map(|subscribed| subscribed.iter().copied().collect())
            .unwrap_or_default();
        for conn in attached {
            inner.push(conn, &line);
        }
        if ends {
            inner.owned.remove(&session);
            inner.rings.remove(&session);
            inner.subscribers.remove(&session);
        }
    }

    /// Sends an event to every connection but one.
    pub fn broadcast_except(&self, except: ConnId, event: &Event) {
        let Some(line) = event_line(event).map(Arc::<str>::from) else {
            return;
        };
        let mut inner = self.lock();
        let everyone: Vec<ConnId> = inner
            .connections
            .keys()
            .copied()
            .filter(|conn| *conn != except)
            .collect();
        for conn in everyone {
            inner.push(conn, &line);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::protocol::Frame;
    use std::sync::atomic::{AtomicBool, Ordering};

    fn output(session: u32, bytes: &[u8]) -> Event {
        Event::Output {
            session,
            bytes: bytes.to_vec(),
        }
    }

    fn drain(lines: &Receiver<Arc<str>>) -> Vec<Frame> {
        lines
            .try_iter()
            .map(|line| serde_json::from_str(&line).expect("a frame"))
            .collect()
    }

    fn quiet() -> impl Fn() + Send + 'static {
        || {}
    }

    #[test]
    fn an_attach_sees_earlier_output_in_the_replay_and_later_output_live() {
        let hub = Hub::default();
        let (conn, lines) = hub.register(quiet());
        hub.publish(&output(1, b"before"));
        hub.attach(conn, 1, || Some((80, 24)));
        hub.publish(&output(1, b"after"));

        assert_eq!(
            drain(&lines),
            vec![
                Frame::Reply(Response::Attached {
                    session: 1,
                    cols: 80,
                    rows: 24,
                    replay: vec![b"before".to_vec()],
                }),
                Frame::Event(output(1, b"after")),
            ]
        );
    }

    #[test]
    fn output_is_never_missed_or_repeated_across_an_attach() {
        // The publisher runs flat out while a viewer attaches in the middle.
        // Whatever the interleaving, replay then live must read as the stream
        // from the start, once.
        let hub = Arc::new(Hub::with_limits(10_000, REPLAY_BYTES));
        let total: u32 = 5000;
        let publisher = {
            let hub = Arc::clone(&hub);
            std::thread::spawn(move || {
                for n in 0..total {
                    hub.publish(&output(1, &n.to_be_bytes()));
                }
            })
        };
        std::thread::sleep(std::time::Duration::from_millis(1));
        let (conn, lines) = hub.register(quiet());
        hub.attach(conn, 1, || Some((80, 24)));
        publisher.join().unwrap();

        let mut stream: Vec<u8> = Vec::new();
        for frame in drain(&lines) {
            match frame {
                Frame::Reply(Response::Attached { replay, .. }) => {
                    stream.extend(replay.concat());
                }
                Frame::Event(Event::Output { bytes, .. }) => stream.extend(bytes),
                other => panic!("unexpected {other:?}"),
            }
        }
        let expected: Vec<u8> = (0..total).flat_map(|n| n.to_be_bytes()).collect();
        assert_eq!(stream, expected);
    }

    #[test]
    fn the_replay_keeps_the_tail_and_drops_the_oldest() {
        let hub = Hub::with_limits(16, 10);
        let (conn, lines) = hub.register(quiet());
        hub.publish(&output(1, b"abcdef"));
        hub.publish(&output(1, b"ghijkl"));
        hub.attach(conn, 1, || Some((1, 1)));
        let Frame::Reply(Response::Attached { replay, .. }) = &drain(&lines)[0] else {
            panic!("expected attached");
        };
        assert_eq!(replay.concat(), b"cdefghijkl".to_vec());
    }

    #[test]
    fn a_connection_hears_only_the_sessions_it_attached() {
        let hub = Hub::default();
        let (a, a_lines) = hub.register(quiet());
        let (_b, b_lines) = hub.register(quiet());
        hub.attach(a, 1, || Some((80, 24)));
        drain(&a_lines);
        hub.publish(&output(1, b"x"));
        hub.publish(&output(2, b"y"));
        assert_eq!(drain(&a_lines), vec![Frame::Event(output(1, b"x"))]);
        assert!(drain(&b_lines).is_empty());

        hub.detach(a, 1);
        hub.publish(&output(1, b"z"));
        assert!(drain(&a_lines).is_empty());
    }

    #[test]
    fn attaching_to_a_session_that_is_not_there_is_an_error() {
        let hub = Hub::default();
        let (conn, lines) = hub.register(quiet());
        hub.attach(conn, 9, || None);
        assert_eq!(
            drain(&lines),
            vec![Frame::Reply(Response::Error {
                message: "no session 9".to_string()
            })]
        );
        assert_eq!(hub.subscriber_count(9), 0);
    }

    #[test]
    fn a_spawn_reply_comes_before_the_output_it_subscribed_for() {
        let hub = Hub::default();
        let (conn, lines) = hub.register(quiet());
        hub.reply_subscribing(conn, false, || Response::Spawned { session: 3 });
        hub.publish(&output(3, b"$ "));
        assert_eq!(
            drain(&lines),
            vec![
                Frame::Reply(Response::Spawned { session: 3 }),
                Frame::Event(output(3, b"$ ")),
            ]
        );
    }

    #[test]
    fn only_owned_sessions_are_handed_back_when_their_connection_goes() {
        let hub = Hub::default();
        let (conn, _lines) = hub.register(quiet());
        let (other, _other_lines) = hub.register(quiet());
        hub.reply_subscribing(conn, true, || Response::Spawned { session: 1 });
        hub.reply_subscribing(conn, false, || Response::Spawned { session: 2 });
        hub.reply_subscribing(conn, true, || Response::Spawned { session: 3 });
        hub.reply_subscribing(other, true, || Response::Spawned { session: 4 });
        // A session that ended on its own is not the connection's to end later.
        hub.publish(&Event::Exited { session: 3 });
        assert_eq!(hub.unregister(conn), vec![1]);
        assert_eq!(hub.unregister(conn), Vec::<u32>::new());
        assert_eq!(hub.unregister(other), vec![4]);
    }

    #[test]
    fn an_owned_session_is_still_found_after_a_slow_connection_was_dropped() {
        let hub = Hub::with_limits(1, 1024);
        let (conn, _never_read) = hub.register(quiet());
        hub.reply_subscribing(conn, true, || Response::Spawned { session: 1 });
        hub.publish(&output(1, b"a"));
        hub.publish(&output(1, b"b"));
        assert_eq!(hub.connection_count(), 0);
        assert_eq!(hub.unregister(conn), vec![1]);
    }

    #[test]
    fn an_exit_reaches_the_attached_and_ends_the_session_bookkeeping() {
        let hub = Hub::default();
        let (conn, lines) = hub.register(quiet());
        hub.publish(&output(1, b"bye"));
        hub.attach(conn, 1, || Some((80, 24)));
        drain(&lines);
        hub.publish(&Event::Exited { session: 1 });
        assert_eq!(drain(&lines), vec![Frame::Event(Event::Exited { session: 1 })]);
        assert_eq!(hub.subscriber_count(1), 0);
        // A later session reusing nothing: its replay starts empty.
        hub.attach(conn, 1, || Some((80, 24)));
        let Frame::Reply(Response::Attached { replay, .. }) = &drain(&lines)[0] else {
            panic!("expected attached");
        };
        assert!(replay.is_empty());
    }

    #[test]
    fn a_stuck_connection_is_dropped_without_holding_up_the_others() {
        let hub = Hub::with_limits(2, 1024);
        let closed = Arc::new(AtomicBool::new(false));
        let (stuck, _never_read) = hub.register({
            let closed = Arc::clone(&closed);
            move || closed.store(true, Ordering::SeqCst)
        });
        let (healthy, healthy_lines) = hub.register(quiet());
        hub.attach(stuck, 1, || Some((1, 1)));
        hub.attach(healthy, 1, || Some((1, 1)));
        drain(&healthy_lines);

        for n in 0..10u8 {
            hub.publish(&output(1, &[n]));
            // The healthy connection keeps up, as a real writer thread would.
            assert_eq!(drain(&healthy_lines).len(), 1);
        }
        assert!(closed.load(Ordering::SeqCst));
        assert_eq!(hub.connection_count(), 1);
        assert_eq!(hub.subscriber_count(1), 1);
    }

    #[test]
    fn state_goes_to_everyone_but_the_connection_that_caused_it() {
        let hub = Hub::default();
        let (a, a_lines) = hub.register(quiet());
        let (_b, b_lines) = hub.register(quiet());
        let event = Event::State {
            state: Default::default(),
        };
        hub.broadcast_except(a, &event);
        assert!(drain(&a_lines).is_empty());
        assert_eq!(drain(&b_lines), vec![Frame::Event(event)]);
    }

    #[test]
    fn unregistering_closes_the_queue_after_what_is_already_in_it() {
        let hub = Hub::default();
        let (conn, lines) = hub.register(quiet());
        hub.reply(conn, &Response::Ok);
        hub.unregister(conn);
        assert_eq!(lines.recv().unwrap().as_ref(), r#"{"reply":{"type":"ok"}}"#);
        assert!(lines.recv().is_err());
    }
}
