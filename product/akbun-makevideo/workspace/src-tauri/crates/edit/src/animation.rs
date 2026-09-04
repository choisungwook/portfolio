use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Easing {
    #[default]
    Linear,
    EaseIn,
    EaseOut,
    EaseInOut,
    Hold,
}

impl Easing {
    fn apply(self, amount: f32) -> f32 {
        let amount = amount.clamp(0.0, 1.0);
        match self {
            Easing::Linear => amount,
            Easing::EaseIn => amount * amount,
            Easing::EaseOut => 1.0 - (1.0 - amount) * (1.0 - amount),
            Easing::EaseInOut => {
                if amount < 0.5 {
                    2.0 * amount * amount
                } else {
                    1.0 - (-2.0 * amount + 2.0).powi(2) / 2.0
                }
            }
            Easing::Hold => 0.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Keyframe {
    pub frame: i64,
    pub value: f32,
    #[serde(default)]
    pub easing: Easing,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyframeTrack {
    #[serde(default)]
    pub keyframes: Vec<Keyframe>,
}

impl KeyframeTrack {
    pub fn value_at(&self, frame: i64, fallback: f32) -> f32 {
        let Some(first) = self.keyframes.first() else {
            return fallback;
        };
        if frame <= first.frame {
            return first.value;
        }
        for pair in self.keyframes.windows(2) {
            let [left, right] = pair else { continue };
            if frame > right.frame {
                continue;
            }
            if frame == right.frame {
                return right.value;
            }
            let span = (right.frame - left.frame).max(1) as f32;
            let amount = left.easing.apply((frame - left.frame) as f32 / span);
            return left.value + (right.value - left.value) * amount;
        }
        self.keyframes
            .last()
            .map(|key| key.value)
            .unwrap_or(fallback)
    }

    pub fn set(&mut self, keyframe: Keyframe) -> Option<Keyframe> {
        match self
            .keyframes
            .binary_search_by_key(&keyframe.frame, |entry| entry.frame)
        {
            Ok(index) => Some(std::mem::replace(&mut self.keyframes[index], keyframe)),
            Err(index) => {
                self.keyframes.insert(index, keyframe);
                None
            }
        }
    }

    pub fn remove(&mut self, frame: i64) -> Option<Keyframe> {
        self.keyframes
            .binary_search_by_key(&frame, |entry| entry.frame)
            .ok()
            .map(|index| self.keyframes.remove(index))
    }

    pub fn shift_frames(&mut self, delta: i64) {
        for keyframe in &mut self.keyframes {
            keyframe.frame = keyframe.frame.saturating_add(delta);
        }
    }

    pub fn map_frames(&mut self, mut map: impl FnMut(i64) -> i64) {
        for keyframe in &mut self.keyframes {
            keyframe.frame = map(keyframe.frame);
        }
        self.keyframes.sort_by_key(|keyframe| keyframe.frame);
        self.keyframes.dedup_by_key(|keyframe| keyframe.frame);
    }

    pub fn retain_frames(&mut self, start: i64, end: i64) {
        self.keyframes
            .retain(|keyframe| start <= keyframe.frame && keyframe.frame < end);
    }

    pub fn repair(&mut self, min_frame: i64, max_frame: i64, min: f32, max: f32) {
        self.keyframes.retain(|key| key.value.is_finite());
        self.keyframes.sort_by_key(|key| key.frame);
        self.keyframes.dedup_by_key(|key| key.frame);
        for key in &mut self.keyframes {
            key.frame = key.frame.clamp(min_frame, max_frame);
            key.value = key.value.clamp(min, max);
        }
        self.keyframes.sort_by_key(|key| key.frame);
        self.keyframes.dedup_by_key(|key| key.frame);
    }

    pub fn is_valid(&self, min_frame: i64, max_frame: i64, min: f32, max: f32) -> bool {
        self.keyframes
            .windows(2)
            .all(|pair| pair[0].frame < pair[1].frame)
            && self.keyframes.iter().all(|key| {
                (min_frame..=max_frame).contains(&key.frame)
                    && key.value.is_finite()
                    && (min..=max).contains(&key.value)
            })
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualAnimation {
    #[serde(default)]
    pub x: KeyframeTrack,
    #[serde(default)]
    pub y: KeyframeTrack,
    #[serde(default)]
    pub width: KeyframeTrack,
    #[serde(default)]
    pub height: KeyframeTrack,
    #[serde(default)]
    pub rotation: KeyframeTrack,
    #[serde(default)]
    pub opacity: KeyframeTrack,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VisualProperty {
    X,
    Y,
    Width,
    Height,
    Rotation,
    Opacity,
}

impl VisualAnimation {
    pub fn track(&self, property: VisualProperty) -> &KeyframeTrack {
        match property {
            VisualProperty::X => &self.x,
            VisualProperty::Y => &self.y,
            VisualProperty::Width => &self.width,
            VisualProperty::Height => &self.height,
            VisualProperty::Rotation => &self.rotation,
            VisualProperty::Opacity => &self.opacity,
        }
    }

    pub fn track_mut(&mut self, property: VisualProperty) -> &mut KeyframeTrack {
        match property {
            VisualProperty::X => &mut self.x,
            VisualProperty::Y => &mut self.y,
            VisualProperty::Width => &mut self.width,
            VisualProperty::Height => &mut self.height,
            VisualProperty::Rotation => &mut self.rotation,
            VisualProperty::Opacity => &mut self.opacity,
        }
    }

    pub fn shift_frames(&mut self, delta: i64) {
        self.for_each_track_mut(|track| track.shift_frames(delta));
    }

    pub fn map_frames(&mut self, map: impl Fn(i64) -> i64 + Copy) {
        self.for_each_track_mut(|track| track.map_frames(map));
    }

    pub fn retain_frames(&mut self, start: i64, end: i64) {
        self.for_each_track_mut(|track| track.retain_frames(start, end));
    }

    fn for_each_track_mut(&mut self, mut apply: impl FnMut(&mut KeyframeTrack)) {
        apply(&mut self.x);
        apply(&mut self.y);
        apply(&mut self.width);
        apply(&mut self.height);
        apply(&mut self.rotation);
        apply(&mut self.opacity);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(easing: Easing) -> KeyframeTrack {
        KeyframeTrack {
            keyframes: vec![
                Keyframe {
                    frame: 10,
                    value: 0.0,
                    easing,
                },
                Keyframe {
                    frame: 20,
                    value: 100.0,
                    easing: Easing::Linear,
                },
            ],
        }
    }

    #[test]
    fn linear_interpolation_uses_project_frames() {
        assert_eq!(track(Easing::Linear).value_at(15, -1.0), 50.0);
    }

    #[test]
    fn hold_keeps_the_left_value_until_the_next_keyframe() {
        assert_eq!(track(Easing::Hold).value_at(19, -1.0), 0.0);
        assert_eq!(track(Easing::Hold).value_at(20, -1.0), 100.0);
    }

    #[test]
    fn an_empty_track_keeps_the_static_value() {
        assert_eq!(KeyframeTrack::default().value_at(30, 0.75), 0.75);
    }

    #[test]
    fn timeline_edits_move_rescale_and_trim_keyframes() {
        let mut track = track(Easing::Linear);
        track.shift_frames(5);
        track.map_frames(|frame| frame / 2);
        track.retain_frames(8, 13);
        assert_eq!(
            track
                .keyframes
                .iter()
                .map(|keyframe| keyframe.frame)
                .collect::<Vec<_>>(),
            vec![12]
        );
    }
}
