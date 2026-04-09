use anyhow::Result;
use crossterm::event::{self, KeyEvent};
use std::time::Duration;

pub enum Event {
    Key(KeyEvent),
    Tick,
}

pub struct EventHandler {
    tick_rate: Duration,
}

impl EventHandler {
    pub fn new(tick_rate_ms: u64) -> Self {
        Self {
            tick_rate: Duration::from_millis(tick_rate_ms),
        }
    }

    pub fn next(&self) -> Result<Event> {
        if event::poll(self.tick_rate)? {
            if let event::Event::Key(key) = event::read()? {
                if key.kind == event::KeyEventKind::Press {
                    return Ok(Event::Key(key));
                }
            }
        }
        Ok(Event::Tick)
    }
}
