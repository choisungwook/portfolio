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
mod tests {
    use super::*;
    use crate::{
        Asset, AssetKind, Clip, Command, Edge, ProjectSettings, Rate, TrackKind, VisualContent,
        VisualTransform,
    };

    fn asset(id: &str, kind: AssetKind, duration_ms: u64) -> Asset {
        Asset {
            id: id.into(),
            path: format!("/media/{id}"),
            name: id.into(),
            kind,
            duration_ms,
            width: 1920,
            height: 1080,
            has_audio: true,
        }
    }

    /// A project with one ten second video imported and nothing on the
    /// timeline. Ten seconds at 30 is 300 frames, which is the number every
    /// expectation below is written against.
    fn document() -> Document {
        let mut document = Document::new(ProjectSettings::default());
        document
            .apply(Command::AddAssets {
                assets: vec![asset("v", AssetKind::Video, 10_000)],
            })
            .unwrap();
        document
    }

    fn video_track(document: &Document) -> String {
        document.project().tracks[0].id.clone()
    }

    fn audio_track(document: &Document) -> String {
        document.project().tracks[1].id.clone()
    }

    fn add(document: &mut Document, start: i64) -> String {
        let track = video_track(document);
        document
            .apply(Command::AddClip {
                track_id: track.clone(),
                asset_id: "v".into(),
                start,
                id: None,
                link_group: None,
            })
            .unwrap();
        document
            .project()
            .track(&track)
            .unwrap()
            .clips
            .iter()
            .find(|clip| clip.start == start || clip.end_frame() > start)
            .map(|clip| clip.id.clone())
            .expect("the clip that was just added")
    }

    fn add_linked(document: &mut Document, start: i64) -> (String, String) {
        let video = video_track(document);
        let audio = audio_track(document);
        document
            .apply_all(vec![
                Command::AddClip {
                    track_id: video.clone(),
                    asset_id: "v".into(),
                    start,
                    id: None,
                    link_group: Some("g1".into()),
                },
                Command::AddClip {
                    track_id: audio.clone(),
                    asset_id: "v".into(),
                    start,
                    id: None,
                    link_group: Some("g1".into()),
                },
            ])
            .unwrap();
        (
            document.project().track(&video).unwrap().clips[0]
                .id
                .clone(),
            document.project().track(&audio).unwrap().clips[0]
                .id
                .clone(),
        )
    }

    fn clips(document: &Document) -> Vec<Clip> {
        document.project().tracks[0].clips.clone()
    }

    #[test]
    fn a_dropped_clip_takes_the_length_of_its_source() {
        let mut document = document();
        add(&mut document, 75);
        let clips = clips(&document);
        assert_eq!(clips.len(), 1);
        assert_eq!(
            (clips[0].start, clips[0].in_point, clips[0].out_point),
            (75, 0, 300)
        );
    }

    #[test]
    fn a_track_that_cannot_play_an_asset_refuses_it() {
        let mut document = document();
        document
            .apply(Command::AddAssets {
                assets: vec![asset("still", AssetKind::Image, 0)],
            })
            .unwrap();
        let audio = audio_track(&document);
        let error = document
            .apply(Command::AddClip {
                track_id: audio,
                asset_id: "still".into(),
                start: 0,
                id: None,
                link_group: None,
            })
            .unwrap_err();
        assert!(error.contains("will not take"), "{error}");
        assert!(document.project().tracks[1].clips.is_empty());
    }

    #[test]
    fn undo_puts_a_moved_clip_back_on_the_track_it_came_from() {
        let mut document = document();
        let clip = add(&mut document, 0);
        let audio = audio_track(&document);
        document
            .apply(Command::MoveClip {
                clip_id: clip.clone(),
                track_id: audio.clone(),
                start: 120,
            })
            .unwrap();
        assert_eq!(document.project().track(&audio).unwrap().clips.len(), 1);

        document.undo().unwrap();
        assert!(document.project().track(&audio).unwrap().clips.is_empty());
        let back = &clips(&document)[0];
        assert_eq!((back.id.as_str(), back.start), (clip.as_str(), 0));
    }

    #[test]
    fn redo_reproduces_the_same_clips_rather_than_new_ones() {
        let mut document = document();
        add(&mut document, 0);
        document
            .apply(Command::SplitAt {
                frame: 150,
                clip_id: None,
                ids: Vec::new(),
                link_groups: Vec::new(),
            })
            .unwrap();
        let after_split: Vec<String> = clips(&document)
            .iter()
            .map(|clip| clip.id.clone())
            .collect();
        assert_eq!(after_split.len(), 2);

        document.undo().unwrap();
        assert_eq!(clips(&document).len(), 1);
        document.redo().unwrap();
        let again: Vec<String> = clips(&document)
            .iter()
            .map(|clip| clip.id.clone())
            .collect();
        assert_eq!(again, after_split, "redo has to hand back the same ids");
        // And the cut is still where it was, on both halves.
        assert_eq!(clips(&document)[0].out_point, 150);
        assert_eq!(clips(&document)[1].in_point, 150);
    }

    #[test]
    fn undo_and_redo_walk_the_whole_history_both_ways() {
        let mut document = document();
        let clip = add(&mut document, 0);
        document
            .apply(Command::TrimClip {
                clip_id: clip.clone(),
                edge: Edge::End,
                frame: 200,
            })
            .unwrap();
        document
            .apply(Command::RemoveClip { clip_id: clip })
            .unwrap();
        assert!(clips(&document).is_empty());

        let mut steps = 0;
        while document.can_undo() {
            document.undo().unwrap();
            steps += 1;
        }
        // The import is an undo step too, so walking all the way back empties
        // the asset library as well as the timeline.
        assert_eq!(steps, 4);
        assert!(document.project().assets.is_empty());
        while document.can_redo() {
            document.redo().unwrap();
        }
        assert_eq!(document.project().assets.len(), 1);
        assert!(
            clips(&document).is_empty(),
            "and forward to after the delete"
        );
    }

    #[test]
    fn a_new_edit_throws_away_the_redo_branch() {
        let mut document = document();
        add(&mut document, 0);
        document.undo().unwrap();
        assert!(document.can_redo());
        add(&mut document, 90);
        assert!(!document.can_redo());
    }

    #[test]
    fn a_split_that_crosses_nothing_is_not_an_undo_step() {
        let mut document = document();
        add(&mut document, 0);
        let before = document.revision();
        document
            .apply(Command::SplitAt {
                frame: 100_000,
                clip_id: None,
                ids: Vec::new(),
                link_groups: Vec::new(),
            })
            .unwrap();
        assert_eq!(
            document.revision(),
            before,
            "nothing happened, so nothing to undo"
        );
    }

    #[test]
    fn ripple_delete_closes_the_gap_and_undo_opens_it_again() {
        let mut document = document();
        let first = add(&mut document, 0);
        add(&mut document, 300);
        add(&mut document, 600);
        assert_eq!(
            clips(&document)
                .iter()
                .map(|clip| clip.start)
                .collect::<Vec<_>>(),
            [0, 300, 600]
        );

        document
            .apply(Command::RippleDelete { clip_id: first })
            .unwrap();
        assert_eq!(
            clips(&document)
                .iter()
                .map(|clip| clip.start)
                .collect::<Vec<_>>(),
            [0, 300]
        );
        document.undo().unwrap();
        assert_eq!(
            clips(&document)
                .iter()
                .map(|clip| clip.start)
                .collect::<Vec<_>>(),
            [0, 300, 600]
        );
    }

    #[test]
    fn a_transaction_that_fails_half_way_changes_nothing() {
        let mut document = document();
        let clip = add(&mut document, 0);
        let before = serde_json::to_string(document.project()).unwrap();
        let revision = document.revision();

        let error = document
            .apply(Command::Transaction {
                commands: vec![
                    Command::MoveClip {
                        clip_id: clip.clone(),
                        track_id: video_track(&document),
                        start: 600,
                    },
                    // No such track, so the whole thing has to come back.
                    Command::MoveClip {
                        clip_id: clip,
                        track_id: "nowhere".into(),
                        start: 0,
                    },
                ],
            })
            .unwrap_err();

        assert!(error.contains("not in this project"), "{error}");
        assert_eq!(serde_json::to_string(document.project()).unwrap(), before);
        assert_eq!(document.revision(), revision);
        assert_eq!(
            document.state().undo_label,
            "Add clip",
            "a failed edit is not an undo step"
        );
    }

    #[test]
    fn an_edit_that_breaks_an_invariant_is_refused_whole() {
        let mut document = document();
        let clip = add(&mut document, 0);
        let before = serde_json::to_string(document.project()).unwrap();
        // Restoring is a primitive with no clamping of its own, which is
        // exactly why the document validates afterwards: this is the shape a
        // bug in a future command would take.
        let error = document
            .apply(Command::RestoreClips {
                entries: vec![crate::ClipAt {
                    track_id: video_track(&document),
                    clip: Clip {
                        id: clip,
                        asset_id: "v".into(),
                        link_group: None,
                        start: 0,
                        in_point: 0,
                        out_point: 9_000,
                        volume: 1.0,
                        opacity: 1.0,
                    },
                }],
            })
            .unwrap_err();
        assert!(error.contains("past the end"), "{error}");
        assert_eq!(serde_json::to_string(document.project()).unwrap(), before);
    }

    #[test]
    fn a_trim_stops_at_the_clip_next_door_instead_of_overlapping_it() {
        let mut document = document();
        let first = add(&mut document, 0);
        add(&mut document, 300);
        document
            .apply(Command::TrimClip {
                clip_id: first,
                edge: Edge::End,
                frame: 500,
            })
            .unwrap();
        assert_eq!(clips(&document)[0].end_frame(), 300);
        assert!(document.project().validate().is_ok());
    }

    #[test]
    fn a_trim_may_not_reach_past_the_end_of_the_source() {
        let mut document = document();
        let clip = add(&mut document, 0);
        document
            .apply(Command::TrimClip {
                clip_id: clip.clone(),
                edge: Edge::Start,
                frame: 90,
            })
            .unwrap();
        document
            .apply(Command::TrimClip {
                clip_id: clip,
                edge: Edge::End,
                frame: 999_999,
            })
            .unwrap();
        // 300 frames of source, 90 taken off the front, so the tail is at 300.
        assert_eq!(clips(&document)[0].end_frame(), 300);
        assert_eq!(clips(&document)[0].in_point, 90);
    }

    #[test]
    fn changing_the_timebase_holds_the_cut_where_it_was_in_time() {
        let mut document = document();
        let clip = add(&mut document, 0);
        document
            .apply(Command::TrimClip {
                clip_id: clip,
                edge: Edge::End,
                frame: 150,
            })
            .unwrap();
        let settings = ProjectSettings {
            rate: Rate::fps(60),
            ..document.project().settings
        };
        document.apply(Command::SetSettings { settings }).unwrap();
        // Five seconds at 30 is five seconds at 60, which is 300 frames of it.
        assert_eq!(clips(&document)[0].out_point, 300);

        document.undo().unwrap();
        assert_eq!(document.project().rate(), Rate::fps(30));
        assert_eq!(
            clips(&document)[0].out_point,
            150,
            "and exactly back, not near it"
        );
    }

    #[test]
    fn removing_an_asset_takes_its_clips_and_undo_brings_both_back() {
        let mut document = document();
        add(&mut document, 0);
        add(&mut document, 300);
        document
            .apply(Command::RemoveAsset {
                asset_id: "v".into(),
            })
            .unwrap();
        assert!(document.project().assets.is_empty());
        assert!(clips(&document).is_empty());

        document.undo().unwrap();
        assert_eq!(document.project().assets.len(), 1);
        assert_eq!(clips(&document).len(), 2);
    }

    #[test]
    fn removing_a_track_takes_its_clips_and_undo_brings_them_back() {
        let mut document = document();
        document
            .apply(Command::AddTrack {
                track_kind: TrackKind::Video,
                id: None,
            })
            .unwrap();
        let second = document
            .project()
            .tracks_of(TrackKind::Video)
            .nth(1)
            .unwrap()
            .id
            .clone();
        document
            .apply(Command::AddClip {
                track_id: second.clone(),
                asset_id: "v".into(),
                start: 0,
                id: None,
                link_group: None,
            })
            .unwrap();
        document
            .apply(Command::RemoveTrack {
                track_id: second.clone(),
            })
            .unwrap();
        assert!(document.project().track(&second).is_none());

        document.undo().unwrap();
        let back = document
            .project()
            .track(&second)
            .expect("the track is back");
        assert_eq!(back.clips.len(), 1, "and so are the clips that were on it");
        assert_eq!(document.project().tracks[2].id, second, "in the same place");
    }

    #[test]
    fn only_the_last_track_of_a_kind_can_go() {
        let mut document = document();
        let first = video_track(&document);
        assert!(document
            .apply(Command::RemoveTrack {
                track_id: first.clone()
            })
            .is_err());
        document
            .apply(Command::AddTrack {
                track_kind: TrackKind::Video,
                id: None,
            })
            .unwrap();
        assert!(document
            .apply(Command::RemoveTrack { track_id: first })
            .is_err());
    }

    #[test]
    fn four_tracks_of_a_kind_is_as_many_as_there_are() {
        let mut document = document();
        for _ in 0..3 {
            document
                .apply(Command::AddTrack {
                    track_kind: TrackKind::Video,
                    id: None,
                })
                .unwrap();
        }
        let error = document
            .apply(Command::AddTrack {
                track_kind: TrackKind::Video,
                id: None,
            })
            .unwrap_err();
        assert!(error.contains("as many as"), "{error}");
    }

    #[test]
    fn several_commands_can_be_one_undo_step() {
        let mut document = document();
        let track = video_track(&document);
        document
            .apply_all(vec![
                Command::AddClip {
                    track_id: track.clone(),
                    asset_id: "v".into(),
                    start: 0,
                    id: None,
                    link_group: None,
                },
                Command::AddClip {
                    track_id: track,
                    asset_id: "v".into(),
                    start: 300,
                    id: None,
                    link_group: None,
                },
            ])
            .unwrap();
        assert_eq!(clips(&document).len(), 2);
        document.undo().unwrap();
        assert!(clips(&document).is_empty(), "both went, on one undo");
    }

    #[test]
    fn linked_clips_are_added_moved_and_undone_as_one_edit() {
        let mut document = document();
        let (video, audio) = add_linked(&mut document, 0);
        document
            .apply(Command::MoveClip {
                clip_id: video.clone(),
                track_id: video_track(&document),
                start: 60,
            })
            .unwrap();
        assert_eq!(document.project().clip(&video).unwrap().start, 60);
        assert_eq!(document.project().clip(&audio).unwrap().start, 60);

        document.undo().unwrap();
        assert_eq!(document.project().clip(&video).unwrap().start, 0);
        assert_eq!(document.project().clip(&audio).unwrap().start, 0);
        document.undo().unwrap();
        assert!(document.project().clip(&video).is_none());
        assert!(document.project().clip(&audio).is_none());
        document.redo().unwrap();
        assert_eq!(
            document
                .project()
                .clip(&video)
                .unwrap()
                .link_group
                .as_deref(),
            Some("g1")
        );
        assert_eq!(
            document
                .project()
                .clip(&audio)
                .unwrap()
                .link_group
                .as_deref(),
            Some("g1")
        );
    }

    #[test]
    fn linked_add_fails_whole_when_either_track_is_occupied() {
        let mut document = document();
        document
            .apply(Command::AddClip {
                track_id: audio_track(&document),
                asset_id: "v".into(),
                start: 0,
                id: None,
                link_group: None,
            })
            .unwrap();

        let error = document
            .apply_all(vec![
                Command::AddClip {
                    track_id: video_track(&document),
                    asset_id: "v".into(),
                    start: 0,
                    id: None,
                    link_group: Some("g1".into()),
                },
                Command::AddClip {
                    track_id: audio_track(&document),
                    asset_id: "v".into(),
                    start: 0,
                    id: None,
                    link_group: Some("g1".into()),
                },
            ])
            .unwrap_err();

        assert!(error.contains("no room"), "{error}");
        assert!(document
            .project()
            .track(&video_track(&document))
            .unwrap()
            .clips
            .is_empty());
        assert_eq!(
            document
                .project()
                .track(&audio_track(&document))
                .unwrap()
                .clips
                .len(),
            1
        );
    }

    #[test]
    fn a_linked_move_fails_whole_when_either_track_is_occupied() {
        let mut document = document();
        let (video, audio) = add_linked(&mut document, 0);
        document
            .apply(Command::AddClip {
                track_id: audio_track(&document),
                asset_id: "v".into(),
                start: 600,
                id: None,
                link_group: None,
            })
            .unwrap();
        let error = document
            .apply(Command::MoveClip {
                clip_id: video.clone(),
                track_id: video_track(&document),
                start: 600,
            })
            .unwrap_err();
        assert!(error.contains("no room"), "{error}");
        assert_eq!(document.project().clip(&video).unwrap().start, 0);
        assert_eq!(document.project().clip(&audio).unwrap().start, 0);
    }

    #[test]
    fn trim_split_and_delete_keep_linked_pairs_together() {
        let mut document = document();
        let (video, audio) = add_linked(&mut document, 0);
        document
            .apply(Command::TrimClip {
                clip_id: video.clone(),
                edge: Edge::End,
                frame: 240,
            })
            .unwrap();
        assert_eq!(document.project().clip(&video).unwrap().out_point, 240);
        assert_eq!(document.project().clip(&audio).unwrap().out_point, 240);

        document
            .apply(Command::SplitAt {
                frame: 120,
                clip_id: Some(video),
                ids: Vec::new(),
                link_groups: Vec::new(),
            })
            .unwrap();
        let right_video = document
            .project()
            .track(&video_track(&document))
            .unwrap()
            .clips[1]
            .clone();
        let right_audio = document
            .project()
            .track(&audio_track(&document))
            .unwrap()
            .clips[1]
            .clone();
        assert_eq!(right_video.link_group, right_audio.link_group);
        assert_ne!(right_video.link_group.as_deref(), Some("g1"));

        document
            .apply(Command::RemoveClip {
                clip_id: right_video.id.clone(),
            })
            .unwrap();
        assert!(document.project().clip(&right_video.id).is_none());
        assert!(document.project().clip(&right_audio.id).is_none());
        document.undo().unwrap();
        assert!(document.project().clip(&right_video.id).is_some());
        assert!(document.project().clip(&right_audio.id).is_some());
    }

    #[test]
    fn unlink_allows_one_side_to_move_and_link_restores_group_editing() {
        let mut document = document();
        let (video, audio) = add_linked(&mut document, 0);
        document
            .apply(Command::UnlinkClips {
                clip_id: video.clone(),
            })
            .unwrap();
        document
            .apply(Command::MoveClip {
                clip_id: video.clone(),
                track_id: video_track(&document),
                start: 30,
            })
            .unwrap();
        assert_eq!(document.project().clip(&video).unwrap().start, 30);
        assert_eq!(document.project().clip(&audio).unwrap().start, 0);
        document.undo().unwrap();
        document
            .apply(Command::LinkClips {
                clip_ids: vec![video.clone(), audio.clone()],
                link_group: None,
            })
            .unwrap();
        assert_eq!(
            document.project().clip(&video).unwrap().link_group,
            document.project().clip(&audio).unwrap().link_group
        );
    }

    #[test]
    fn the_revision_moves_on_every_change_including_undo() {
        let mut document = document();
        let start = document.revision();
        add(&mut document, 0);
        assert_eq!(document.revision(), start + 1);
        document.undo().unwrap();
        assert_eq!(document.revision(), start + 2, "undo is a change too");
        document.redo().unwrap();
        assert_eq!(document.revision(), start + 3);
    }

    #[test]
    fn opening_a_project_pushes_the_id_counter_past_what_is_in_it() {
        let text = r#"{
            "version": 2,
            "settings": {"width": 1920, "height": 1080, "rate": {"num": 30, "den": 1}},
            "assets": [{"id": "v", "path": "/m.mp4", "kind": "video", "durationMs": 10000, "hasAudio": true}],
            "tracks": [{"id": "t7", "kind": "video", "clips": [
                {"id": "c9", "assetId": "v", "start": 0, "in": 0, "out": 60}
            ]}]
        }"#;
        let mut document = Document::opened(serde_json::from_str(text).unwrap());
        document
            .apply(Command::AddClip {
                track_id: "t7".into(),
                asset_id: "v".into(),
                start: 120,
                id: None,
                link_group: None,
            })
            .unwrap();
        let made = &document.project().tracks[0].clips[1].id;
        assert_ne!(
            made, "c9",
            "a new clip may not land on an id already in use"
        );
        assert_eq!(made, "c10");
    }

    #[test]
    fn a_document_opened_from_disk_has_nothing_to_undo() {
        let document = Document::opened(Project::new(ProjectSettings::default()));
        assert!(!document.can_undo());
        assert!(!document.can_redo());
        assert_eq!(document.state().undo_label, "");
    }

    #[test]
    fn the_state_says_what_the_menu_should_read() {
        let mut document = document();
        let clip = add(&mut document, 0);
        document
            .apply(Command::MoveClip {
                clip_id: clip,
                track_id: video_track(&document),
                start: 90,
            })
            .unwrap();
        assert_eq!(document.state().undo_label, "Move clip");
        document.undo().unwrap();
        assert_eq!(document.state().redo_label, "Move clip");
    }

    #[test]
    fn a_command_survives_the_trip_through_json_the_page_sends_it_on() {
        let text = r#"{"op":"trimClip","clipId":"c1","edge":"start","frame":42}"#;
        let command: Command = serde_json::from_str(text).unwrap();
        assert_eq!(
            command,
            Command::TrimClip {
                clip_id: "c1".into(),
                edge: Edge::Start,
                frame: 42
            }
        );
        assert_eq!(serde_json::to_string(&command).unwrap(), text);

        // The fields the page leaves out are the ones the apply fills in.
        let split: Command = serde_json::from_str(r#"{"op":"splitAt","frame":10}"#).unwrap();
        assert_eq!(
            split,
            Command::SplitAt {
                frame: 10,
                clip_id: None,
                ids: Vec::new(),
                link_groups: Vec::new()
            }
        );
    }

    #[test]
    fn visual_item_edits_are_commands_with_undo_and_stable_ids() {
        let mut document = document();
        let track_id = video_track(&document);
        let initial = VisualTransform {
            x: 100.0,
            y: 80.0,
            width: 640.0,
            height: 360.0,
            rotation: 0.0,
            opacity: 1.0,
        };
        document
            .apply(Command::AddVisualItem {
                track_id: track_id.clone(),
                content: VisualContent::Text {
                    text: "title".into(),
                },
                start: 30,
                duration: 90,
                transform: initial,
                z_index: 2,
                id: None,
            })
            .unwrap();
        let item_id = document.project().tracks[0].visual_items[0].id.clone();
        assert_eq!(item_id, "i3");

        let moved = VisualTransform {
            x: 320.0,
            y: 180.0,
            width: 800.0,
            height: 450.0,
            rotation: 12.5,
            opacity: 0.6,
        };
        document
            .apply(Command::SetVisualTransform {
                item_id: item_id.clone(),
                transform: moved,
            })
            .unwrap();
        assert_eq!(
            document.project().visual_item(&item_id).unwrap().transform,
            moved
        );

        document.undo().unwrap();
        assert_eq!(
            document.project().visual_item(&item_id).unwrap().transform,
            initial
        );
        document.undo().unwrap();
        assert!(document.project().visual_item(&item_id).is_none());
        document.redo().unwrap();
        assert_eq!(document.project().tracks[0].visual_items[0].id, item_id);
    }

    #[test]
    fn invalid_visual_geometry_is_rejected_without_changing_the_project() {
        let mut document = document();
        let error = document
            .apply(Command::AddVisualItem {
                track_id: video_track(&document),
                content: VisualContent::Shape,
                start: 0,
                duration: 30,
                transform: VisualTransform {
                    x: 0.0,
                    y: 0.0,
                    width: 0.0,
                    height: 100.0,
                    rotation: 0.0,
                    opacity: 1.0,
                },
                z_index: 0,
                id: None,
            })
            .unwrap_err();
        assert!(error.contains("no area"), "{error}");
        assert!(document.project().tracks[0].visual_items.is_empty());
    }

    #[test]
    fn duplicate_visual_item_ids_are_rejected_without_changing_the_project() {
        let mut document = document();
        let track_id = video_track(&document);
        let command = Command::AddVisualItem {
            track_id,
            content: VisualContent::Shape,
            start: 0,
            duration: 30,
            transform: VisualTransform {
                x: 0.0,
                y: 0.0,
                width: 100.0,
                height: 100.0,
                rotation: 0.0,
                opacity: 1.0,
            },
            z_index: 0,
            id: Some("item".into()),
        };
        document.apply(command.clone()).unwrap();

        let error = document.apply(command).unwrap_err();

        assert!(error.contains("already in this project"), "{error}");
        assert_eq!(document.project().tracks[0].visual_items.len(), 1);
    }
}
