use crate::{Command, Document, DocumentState, Project, VisualContent};

pub fn validate(commands: &[Command]) -> Result<(), String> {
    if commands.is_empty() || commands.len() > 256 {
        return Err("An edit proposal needs 1–256 operations.".into());
    }
    for command in commands {
        let allowed = match command {
            Command::AddTrack { .. }
            | Command::AddClip { .. }
            | Command::InsertSource { .. }
            | Command::MoveClip { .. }
            | Command::TrimClip { .. }
            | Command::SplitAt { .. }
            | Command::RemoveClip { .. }
            | Command::RemoveRanges { .. }
            | Command::SetClipGain { .. }
            | Command::SetClipPlayback { .. }
            | Command::SetClipVolumeKeyframe { .. }
            | Command::SetVisualKeyframe { .. }
            | Command::SetVisualTransform { .. }
            | Command::SetVisualTiming { .. }
            | Command::RemoveVisualItem { .. }
            | Command::SetSubtitleStyle { .. }
            | Command::AddTransition { .. }
            | Command::AddMarker { .. } => true,
            Command::AddOverlayVisualItem { content, .. }
            | Command::AddVisualItem { content, .. }
            | Command::SetVisualContent { content, .. } => {
                !matches!(content, VisualContent::Adjustment { .. })
            }
            _ => false,
        };
        if !allowed {
            return Err("This operation is not available to AI editing.".into());
        }
    }
    Ok(())
}

pub fn preview(project: &Project, commands: Vec<Command>) -> Result<DocumentState, String> {
    validate(&commands)?;
    let mut preview = Document::opened(project.clone());
    preview.apply_all(commands)?;
    Ok(preview.state())
}

pub fn apply(
    document: &mut Document,
    expected: &Project,
    revision: u64,
    commands: Vec<Command>,
) -> Result<DocumentState, String> {
    if document.revision() != revision || document.project() != expected {
        return Err("The project changed. Request a new edit proposal.".into());
    }
    preview(expected, commands.clone())?;
    document.apply_all_named("AI edit", commands)?;
    Ok(document.state())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ProjectSettings;

    fn marker() -> Command {
        Command::AddMarker {
            frame: 10,
            name: "Hook".into(),
            color: "#2f6df0".into(),
            id: None,
        }
    }

    #[test]
    fn preview_is_detached_and_apply_is_one_undo() {
        let mut doc = Document::new(ProjectSettings::default());
        let before = doc.project().clone();
        assert_eq!(
            preview(&before, vec![marker(), marker()])
                .unwrap()
                .project
                .markers
                .len(),
            2
        );
        assert!(doc.project().markers.is_empty());
        apply(&mut doc, &before, 0, vec![marker(), marker()]).unwrap();
        doc.undo().unwrap();
        assert_eq!(*doc.project(), before);
    }

    #[test]
    fn rejects_stale_or_different_project_and_file_commands() {
        let mut doc = Document::new(ProjectSettings::default());
        let before = doc.project().clone();
        doc.apply(marker()).unwrap();
        assert!(apply(&mut doc, &before, 0, vec![marker()]).is_err());
        let mut other = before.clone();
        other.settings.width += 2;
        let mut fresh = Document::opened(other);
        assert!(apply(&mut fresh, &before, 0, vec![marker()]).is_err());
        assert!(validate(&[Command::AddAssets { assets: vec![] }]).is_err());
        assert!(validate(&[Command::Transaction {
            commands: vec![marker()]
        }])
        .is_err());
    }

    #[test]
    fn invalid_batch_leaves_document_untouched() {
        let mut doc = Document::new(ProjectSettings::default());
        let before = doc.project().clone();
        let bad = Command::RemoveClip {
            clip_id: "missing".into(),
        };
        assert!(apply(&mut doc, &before, 0, vec![marker(), bad]).is_err());
        assert_eq!(*doc.project(), before);
        assert!(!doc.can_undo());
    }
}

#[cfg(test)]
mod astra_fixture_tests {
    use super::*;

    #[test]
    fn astra_generated_motion_graphic_round_trips_through_the_editor() {
        let commands: Vec<Command> =
            serde_json::from_str(include_str!("../fixtures/astra-motion.json")).unwrap();
        let mut doc = Document::new(crate::ProjectSettings::default());
        let before = doc.state();
        let after = apply(&mut doc, &before.project, 0, commands).unwrap();
        let title = after
            .project
            .tracks
            .iter()
            .flat_map(|t| &t.visual_items)
            .find(|item| item.id == "hello-title-1")
            .unwrap();
        assert_eq!(title.transform_at(0).opacity, 0.0);
        assert_eq!(title.transform_at(15).opacity, 1.0);
        doc.undo().unwrap();
        assert_eq!(*doc.project(), before.project);
        doc.redo().unwrap();
        assert_eq!(*doc.project(), after.project);
        if let Ok(path) = std::env::var("MAKEVIDEO_QA_SNAPSHOT") {
            std::fs::write(
                path,
                serde_json::to_vec(&serde_json::json!({"before": before, "after": after})).unwrap(),
            )
            .unwrap();
        }
    }
}
