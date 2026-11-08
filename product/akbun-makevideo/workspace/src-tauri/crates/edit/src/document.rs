//! The project the app is editing, and everything that has been done to it.
//!
//! One of these is the single copy of the edit. The page holds a rendering of
//! it and the playback engine reads it, but neither owns it, so there is no
//! second model to fall out of step with the first.
//!
//! Two things come out of that ownership beyond undo. The engine can ask what
//! is on the timeline at any moment rather than being handed a snapshot taken
//! when a render was requested — which is what it needs in order to decide,
//! frame by frame, what to decode. And every change bumps a [revision], so
//! anything slow that finishes later can tell whether the timeline it started
//! from is still the timeline.
//!
//! [revision]: Document::revision

use crate::command::{Applied, Ids};
use crate::{Command, Project, ProjectSettings};
use serde::Serialize;

/// How many undo steps are kept. Deep enough that nobody reaches the end of it
/// in a session, shallow enough that a runaway loop of edits cannot grow the
/// history without limit.
const HISTORY_LIMIT: usize = 200;

/// One undo step: what happened, and what puts it back.
struct Entry {
    label: &'static str,
    /// The command as it actually happened, ids and all, so redo reproduces
    /// this step rather than something that merely resembles it.
    applied: Command,
    inverse: Command,
}

pub struct Document {
    project: Project,
    ids: Ids,
    revision: u64,
    undo: Vec<Entry>,
    redo: Vec<Entry>,
}

/// What the page draws from. Everything it needs to render the timeline and to
/// grey out the two menu items, and nothing it has to work out for itself.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentState {
    pub project: Project,
    pub revision: u64,
    pub can_undo: bool,
    pub can_redo: bool,
    /// "Move clip", for "Undo Move clip". Empty when there is nothing to undo.
    pub undo_label: String,
    pub redo_label: String,
}

impl Document {
    pub fn new(settings: ProjectSettings) -> Document {
        Document::opened(Project::new(settings))
    }

    /// A project read back from disk. It is repaired rather than refused, its
    /// id counter is pushed past whatever is already in it, and the history
    /// starts empty: undo goes back through this session, not through the
    /// sessions that made the file.
    pub fn opened(mut project: Project) -> Document {
        project.repair();
        let mut ids = Ids::default();
        for marker in &project.markers {
            ids.observe(&marker.id);
        }
        for transition in &project.transitions {
            ids.observe(&transition.id);
        }
        for track in &project.tracks {
            ids.observe(&track.id);
            for clip in &track.clips {
                ids.observe(&clip.id);
                if let Some(group) = &clip.link_group {
                    ids.observe(group);
                }
            }
            for item in &track.visual_items {
                ids.observe(&item.id);
            }
        }
        Document {
            project,
            ids,
            revision: 0,
            undo: Vec::new(),
            redo: Vec::new(),
        }
    }

    pub fn restore_checkpoint(&mut self, project: Project) -> Result<(), String> {
        project.validate()?;
        let revision = self.revision + 1;
        *self = Self::opened(project);
        self.revision = revision;
        Ok(())
    }

    pub fn project(&self) -> &Project {
        &self.project
    }

    /// Bumped by every change. A render or an export that takes minutes records
    /// this when it starts, and comparing it afterwards is the only honest way
    /// to answer "was the timeline edited while that was running".
    pub fn revision(&self) -> u64 {
        self.revision
    }

    pub fn can_undo(&self) -> bool {
        !self.undo.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo.is_empty()
    }

    pub fn state(&self) -> DocumentState {
        DocumentState {
            project: self.project.clone(),
            revision: self.revision,
            can_undo: self.can_undo(),
            can_redo: self.can_redo(),
            undo_label: self
                .undo
                .last()
                .map(|entry| entry.label.into())
                .unwrap_or_default(),
            redo_label: self
                .redo
                .last()
                .map(|entry| entry.label.into())
                .unwrap_or_default(),
        }
    }

    /// Apply one command as one undo step.
    ///
    /// Either the whole thing lands and the invariants still hold, or nothing
    /// changes and the reason comes back. There is no third outcome: a project
    /// that is half way through an edit is a project whose owner cannot tell
    /// how many times to press undo.
    pub fn apply(&mut self, command: Command) -> Result<(), String> {
        let label = command.label();
        self.apply_labeled(command, label)
    }

    fn apply_labeled(&mut self, command: Command, label: &'static str) -> Result<(), String> {
        let Applied { resolved, inverse } = command.perform(&mut self.project, &mut self.ids)?;

        // The invariants are checked here rather than inside each command,
        // because the middle of a transaction is allowed to look wrong: two
        // clips swapping places pass through a state where they overlap.
        if let Err(error) = self.project.validate() {
            let _ = inverse.perform(&mut self.project, &mut self.ids);
            return Err(error);
        }
        if inverse.is_nothing() {
            // A split that crossed no clip, or a transaction of no-ops. Leaving
            // it out of the history is what keeps undo from having steps in it
            // that visibly do nothing.
            return Ok(());
        }

        self.redo.clear();
        self.undo.push(Entry {
            label,
            applied: resolved,
            inverse,
        });
        if self.undo.len() > HISTORY_LIMIT {
            self.undo.remove(0);
        }
        self.revision += 1;
        Ok(())
    }

    /// Convenience for the common shape: several commands, one undo step.
    pub fn apply_all(&mut self, commands: Vec<Command>) -> Result<(), String> {
        match commands.len() {
            1 => self.apply(commands.into_iter().next().expect("just checked")),
            _ => self.apply(Command::Transaction { commands }),
        }
    }

    /// Several generated commands kept as one explicitly named history step.
    pub fn apply_all_named(
        &mut self,
        label: &'static str,
        commands: Vec<Command>,
    ) -> Result<(), String> {
        self.apply_labeled(Command::Transaction { commands }, label)
    }

    /// What a file turned out to be, once something could measure it.
    ///
    /// This is not an edit and does not go on the undo stack: nobody asked for
    /// it and there is nothing to take back. It exists because with no ffprobe
    /// installed an import has no length to report, so the page measures the
    /// file with a media element and says so here.
    ///
    /// The catch is that clips were already cut from a guess of five seconds.
    /// If the file turns out to be shorter, those clips now reach past the end
    /// of it, so they are pulled back — and when that happens the history goes
    /// with them, because the states it holds were cut against a length that
    /// was never true.
    pub fn describe_asset(
        &mut self,
        asset_id: &str,
        duration_ms: u64,
        width: u32,
        height: u32,
    ) -> Result<(), String> {
        let index = self
            .project
            .asset_index(asset_id)
            .ok_or("that asset is not in this project")?;
        let asset = &mut self.project.assets[index];
        if asset.duration_ms == 0 {
            asset.duration_ms = duration_ms;
        }
        if width > 0 {
            asset.width = width;
            asset.height = height;
        }
        let before = self.project.clone();
        self.project.repair();
        if self.project != before {
            self.undo.clear();
            self.redo.clear();
        }
        self.revision += 1;
        Ok(())
    }

    pub fn undo(&mut self) -> Result<(), String> {
        let Some(entry) = self.undo.pop() else {
            return Err("there is nothing to undo".into());
        };
        let applied = entry
            .inverse
            .perform(&mut self.project, &mut self.ids)
            .map_err(|error| format!("that edit cannot be undone: {error}"))?;
        self.redo.push(Entry {
            label: entry.label,
            // Redoing replays the command as it happened, which is why the
            // filled in version was kept. The inverse is recomputed from the
            // state it will actually be undoing next time.
            applied: entry.applied,
            inverse: applied.resolved,
        });
        self.revision += 1;
        Ok(())
    }

    pub fn redo(&mut self) -> Result<(), String> {
        let Some(entry) = self.redo.pop() else {
            return Err("there is nothing to redo".into());
        };
        let Applied { resolved, inverse } = entry
            .applied
            .clone()
            .perform(&mut self.project, &mut self.ids)
            .map_err(|error| format!("that edit cannot be redone: {error}"))?;
        self.undo.push(Entry {
            label: entry.label,
            applied: resolved,
            inverse,
        });
        self.revision += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests;
