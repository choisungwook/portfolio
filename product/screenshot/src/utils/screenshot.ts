import { invoke } from "@tauri-apps/api/core";

export async function captureFullScreen(): Promise<string> {
  return await invoke<string>("capture_full_screenshot");
}

export async function captureRegion(): Promise<string> {
  return await invoke<string>("capture_region_screenshot");
}

export async function saveImageToFile(
  base64Data: string,
  filePath: string
): Promise<void> {
  await invoke("save_image_to_file", {
    base64Data,
    filePath,
  });
}

export async function saveEditedImage(
  base64Data: string,
  filePath: string
): Promise<void> {
  await invoke("save_edited_image", {
    base64Data,
    filePath,
  });
}
