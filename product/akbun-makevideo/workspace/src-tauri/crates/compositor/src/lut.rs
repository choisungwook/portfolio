use std::fs;

#[derive(Clone, Debug)]
pub struct Lut {
    size: usize,
    domain_min: [f32; 3],
    domain_max: [f32; 3],
    values: Vec<[f32; 4]>,
}

impl Lut {
    pub fn identity() -> Lut {
        Lut {
            size: 2,
            domain_min: [0.0, 0.0, 0.0],
            domain_max: [1.0, 1.0, 1.0],
            values: vec![
                [0.0, 0.0, 0.0, 1.0],
                [1.0, 0.0, 0.0, 1.0],
                [0.0, 1.0, 0.0, 1.0],
                [1.0, 1.0, 0.0, 1.0],
                [0.0, 0.0, 1.0, 1.0],
                [1.0, 0.0, 1.0, 1.0],
                [0.0, 1.0, 1.0, 1.0],
                [1.0, 1.0, 1.0, 1.0],
            ],
        }
    }
    pub fn from_cube_file(path: &str) -> Result<Lut, String> {
        let text =
            fs::read_to_string(path).map_err(|error| format!("cannot read LUT {path}: {error}"))?;
        Lut::from_cube(&text)
    }

    pub fn from_cube(text: &str) -> Result<Lut, String> {
        let mut size = None;
        let mut domain_min = [0.0, 0.0, 0.0];
        let mut domain_max = [1.0, 1.0, 1.0];
        let mut values = Vec::new();
        for raw in text.lines() {
            let line = raw.split('#').next().unwrap_or("").trim();
            if line.is_empty() || line.starts_with("TITLE") {
                continue;
            }
            let words: Vec<&str> = line.split_whitespace().collect();
            match words.first().copied() {
                Some("LUT_3D_SIZE") => {
                    if words.len() != 2 {
                        return Err("LUT_3D_SIZE needs one value".into());
                    }
                    size = Some(
                        words[1]
                            .parse::<usize>()
                            .map_err(|_| "LUT_3D_SIZE is not a number")?,
                    );
                }
                Some("DOMAIN_MIN") => domain_min = triplet(&words[1..], "DOMAIN_MIN")?,
                Some("DOMAIN_MAX") => domain_max = triplet(&words[1..], "DOMAIN_MAX")?,
                Some(word) if word.parse::<f32>().is_ok() => {
                    let sample = triplet(&words, "LUT sample")?;
                    values.push([sample[0], sample[1], sample[2], 1.0]);
                }
                Some(word) => return Err(format!("unsupported cube directive {word}")),
                _ => {}
            }
        }
        let size = size.ok_or("cube LUT has no LUT_3D_SIZE")?;
        if size < 2 {
            return Err("LUT_3D_SIZE must be at least 2".into());
        }
        if domain_min
            .iter()
            .zip(domain_max)
            .any(|(min, max)| min >= &max)
        {
            return Err("LUT domain maximum must exceed its minimum".into());
        }
        let expected = size.checked_pow(3).ok_or("LUT_3D_SIZE is too large")?;
        if values.len() != expected {
            return Err(format!(
                "cube LUT needs {expected} samples, got {}",
                values.len()
            ));
        }
        Ok(Lut {
            size,
            domain_min,
            domain_max,
            values,
        })
    }

    pub fn sample(&self, colour: [f32; 3]) -> [f32; 3] {
        let mut points = [(0usize, 0usize, 0.0); 3];
        for index in 0..3 {
            let normalized = ((colour[index] - self.domain_min[index])
                / (self.domain_max[index] - self.domain_min[index]))
                .clamp(0.0, 1.0);
            let value = normalized * (self.size - 1) as f32;
            let low = value.floor() as usize;
            points[index] = (low, (low + 1).min(self.size - 1), value - low as f32);
        }
        let mut output = [0.0; 3];
        for z in 0..2 {
            for y in 0..2 {
                for x in 0..2 {
                    let weight = axis(points[0].2, x) * axis(points[1].2, y) * axis(points[2].2, z);
                    let sample = self.values[self.index(points[0], points[1], points[2], x, y, z)];
                    for channel in 0..3 {
                        output[channel] += sample[channel] * weight;
                    }
                }
            }
        }
        output
    }

    pub fn size(&self) -> u32 {
        self.size as u32
    }

    pub fn domain_min(&self) -> [f32; 3] {
        self.domain_min
    }

    pub fn domain_max(&self) -> [f32; 3] {
        self.domain_max
    }

    pub fn texture_bytes(&self) -> &[u8] {
        // Arrays of four f32 values are contiguous and have no padding.
        unsafe {
            std::slice::from_raw_parts(
                self.values.as_ptr().cast::<u8>(),
                self.values.len() * std::mem::size_of::<[f32; 4]>(),
            )
        }
    }

    fn index(
        &self,
        x: (usize, usize, f32),
        y: (usize, usize, f32),
        z: (usize, usize, f32),
        xi: usize,
        yi: usize,
        zi: usize,
    ) -> usize {
        let x = if xi == 0 { x.0 } else { x.1 };
        let y = if yi == 0 { y.0 } else { y.1 };
        let z = if zi == 0 { z.0 } else { z.1 };
        z * self.size * self.size + y * self.size + x
    }
}

fn axis(value: f32, high: usize) -> f32 {
    if high == 0 {
        1.0 - value
    } else {
        value
    }
}

fn triplet(words: &[&str], name: &str) -> Result<[f32; 3], String> {
    if words.len() != 3 {
        return Err(format!("{name} needs three values"));
    }
    let values = [
        words[0]
            .parse()
            .map_err(|_| format!("{name} has an invalid number"))?,
        words[1]
            .parse()
            .map_err(|_| format!("{name} has an invalid number"))?,
        words[2]
            .parse()
            .map_err(|_| format!("{name} has an invalid number"))?,
    ];
    if values.iter().any(|value: &f32| !value.is_finite()) {
        return Err(format!("{name} must contain finite numbers"));
    }
    Ok(values)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_and_interpolates_a_cube() {
        let lut = Lut::from_cube(
            "LUT_3D_SIZE 2\n0e0 0e0 0e0\n1e0 0e0 0e0\n0e0 1e0 0e0\n1e0 1e0 0e0\n0e0 0e0 1e0\n1e0 0e0 1e0\n0e0 1e0 1e0\n1e0 1e0 1e0\n",
        )
        .unwrap();
        assert_eq!(lut.sample([0.25, 0.5, 0.75]), [0.25, 0.5, 0.75]);
    }
}
