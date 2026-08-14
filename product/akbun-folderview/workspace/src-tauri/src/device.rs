use folderview_library::DeviceLocation;
use std::path::Path;

#[cfg(windows)]
pub fn locate(path: &str) -> Result<DeviceLocation, String> {
    use std::ffi::OsStr;
    use std::iter;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        GetVolumeNameForVolumeMountPointW, GetVolumePathNameW,
    };

    let wide_path: Vec<u16> = OsStr::new(path)
        .encode_wide()
        .chain(iter::once(0))
        .collect();
    let mut mount = vec![0_u16; 32_768];
    let mount_ok =
        unsafe { GetVolumePathNameW(wide_path.as_ptr(), mount.as_mut_ptr(), mount.len() as u32) };
    if mount_ok == 0 {
        return Err(format!(
            "cannot identify the volume for {path}: {}",
            std::io::Error::last_os_error()
        ));
    }
    let mount_path = from_wide(&mount);

    let mut volume = vec![0_u16; 64];
    let volume_ok = unsafe {
        GetVolumeNameForVolumeMountPointW(mount.as_ptr(), volume.as_mut_ptr(), volume.len() as u32)
    };
    if volume_ok == 0 {
        return Err(format!(
            "cannot read the volume UUID for {path}: {}",
            std::io::Error::last_os_error()
        ));
    }

    Ok(DeviceLocation {
        id: from_wide(&volume)
            .trim_end_matches('\\')
            .to_ascii_lowercase(),
        mount_path,
    })
}

#[cfg(windows)]
fn from_wide(value: &[u16]) -> String {
    let length = value
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(value.len());
    String::from_utf16_lossy(&value[..length])
}

#[cfg(unix)]
pub fn locate(path: &str) -> Result<DeviceLocation, String> {
    use std::os::unix::fs::MetadataExt;

    let canonical = Path::new(path)
        .canonicalize()
        .map_err(|error| format!("cannot identify the device for {path}: {error}"))?;
    let mut mount = if canonical.is_file() {
        canonical.parent().unwrap_or(&canonical).to_path_buf()
    } else {
        canonical.clone()
    };
    let device = std::fs::metadata(&canonical)
        .map_err(|error| format!("cannot inspect {path}: {error}"))?
        .dev();

    while let Some(parent) = mount.parent() {
        let parent_device = std::fs::metadata(parent)
            .map_err(|error| format!("cannot inspect {parent:?}: {error}"))?
            .dev();
        if parent_device != device {
            break;
        }
        mount = parent.to_path_buf();
    }

    Ok(DeviceLocation {
        id: format!("unix-device-{device:x}"),
        mount_path: mount.to_string_lossy().to_string(),
    })
}

#[cfg(not(any(windows, unix)))]
pub fn locate(path: &str) -> Result<DeviceLocation, String> {
    let canonical = std::path::PathBuf::from(path)
        .canonicalize()
        .map_err(|error| format!("cannot identify the device for {path}: {error}"))?;
    Ok(DeviceLocation {
        id: format!("path:{}", canonical.to_string_lossy().to_ascii_lowercase()),
        mount_path: canonical.to_string_lossy().to_string(),
    })
}

pub fn matches(location: &DeviceLocation, expected_id: &str) -> bool {
    location.id == expected_id
}
