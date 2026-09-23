//! Prints what the tray would show on this machine, without Tauri.
//! cargo run -p usage-core --example print

use usage_core::collect::{Collector, Env};
use usage_core::{format, settings::Settings};

fn main() {
    let now = chrono::Utc::now().timestamp_millis();
    let sections = Collector::default().collect(&Settings::default(), &Env::from_process(), now);
    println!("{}", format::title(&sections));
    for section in &sections {
        println!("{}", section.name);
        for line in format::lines(section, now) {
            println!("    {line}");
        }
    }
}
