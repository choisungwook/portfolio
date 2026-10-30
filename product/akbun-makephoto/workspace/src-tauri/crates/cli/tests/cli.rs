//! Drives the CLI the way an agent would, against a throwaway catalog.

use std::ffi::OsString;
use std::path::Path;

fn run(catalog: &Path, args: &[&str]) -> i32 {
    let mut argv: Vec<OsString> = vec!["makephoto".into(), "--catalog".into(), catalog.into()];
    argv.extend(args.iter().map(OsString::from));
    makephoto_cli::run(argv)
}

#[test]
fn import_tag_edit_auto_export() {
    let dir = tempfile::tempdir().unwrap();
    let photos = dir.path().join("photos");
    std::fs::create_dir(&photos).unwrap();
    let original = photos.join("a.jpg");
    image::RgbImage::from_fn(120, 80, |x, _| image::Rgb([x as u8 + 40, 90, 60])).save(&original).unwrap();
    let before = std::fs::read(&original).unwrap();
    let catalog = dir.path().join("catalog.json");
    let store = makephoto_core::catalog::Store::new(&catalog);

    assert_eq!(run(&catalog, &["import", photos.to_str().unwrap()]), 0);
    assert_eq!(store.read().unwrap().photos.len(), 1);

    assert_eq!(run(&catalog, &["tag", "1", "--add", "trip"]), 0);
    assert_eq!(run(&catalog, &["rate", "4", "1"]), 0);
    assert_eq!(run(&catalog, &["edit", "1", "--set", "exposure=0.5", "--look", "golden-hour", "--crop", "0.1,0.1,0.8,0.8"]), 0);
    let photo = store.read().unwrap().photos[0].clone();
    assert_eq!((photo.tags.clone(), photo.rating), (vec!["trip".to_string()], 4));
    assert_eq!(photo.edit.exposure, 0.5);
    assert_eq!(photo.edit.look.as_deref(), Some("golden-hour"));

    // Bad input is refused and changes nothing.
    assert_eq!(run(&catalog, &["edit", "1", "--set", "sharpness=3"]), 1);
    assert_eq!(run(&catalog, &["edit", "1", "--look", "nope"]), 1);
    assert_eq!(run(&catalog, &["edit", "9", "--set", "exposure=1"]), 1);
    assert_eq!(store.read().unwrap().photos[0].edit.exposure, 0.5);

    assert_eq!(run(&catalog, &["auto", "1", "--kind", "brightness", "--dry-run"]), 0);
    assert_eq!(store.read().unwrap().photos[0].edit.exposure, 0.5);
    assert_eq!(run(&catalog, &["auto", "1", "--kind", "contrast"]), 0);

    let out = dir.path().join("out");
    assert_eq!(run(&catalog, &["export", "1", "--dir", out.to_str().unwrap()]), 0);
    assert!(out.join("a.jpg").exists());

    // Render refuses to write over the original even with --force.
    assert_eq!(run(&catalog, &["render", "1", "--out", original.to_str().unwrap(), "--force"]), 1);
    assert_eq!(std::fs::read(&original).unwrap(), before);

    assert_eq!(run(&catalog, &["remove", "1"]), 0);
    assert!(store.read().unwrap().photos.is_empty());
    assert!(original.exists());
}

#[test]
fn only_known_words_select_the_cli() {
    assert!(makephoto_cli::is_cli_invocation(Some("list")));
    assert!(!makephoto_cli::is_cli_invocation(Some("-psn_0_12345")));
    assert!(!makephoto_cli::is_cli_invocation(None));
}
