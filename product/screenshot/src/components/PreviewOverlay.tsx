import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { saveImageToFile } from "../utils/screenshot";

interface PreviewOverlayProps {
  imageData: string;
  onEdit: () => void;
  onClose: () => void;
}

export default function PreviewOverlay({
  imageData,
  onEdit,
  onClose,
}: PreviewOverlayProps) {
  const handleCopy = async () => {
    try {
      const base64Only = imageData.split(",")[1] || imageData;
      await writeText(base64Only);

      alert("Image data copied to clipboard!");
    } catch (err) {
      console.error("Copy failed:", err);
      alert("Failed to copy to clipboard");
    }
  };

  const handleSave = async () => {
    try {
      const filePath = await save({
        filters: [
          {
            name: "PNG Image",
            extensions: ["png"],
          },
        ],
        defaultPath: `screenshot_${Date.now()}.png`,
      });

      if (filePath) {
        await saveImageToFile(imageData, filePath);
        alert(`Saved to ${filePath}`);
      }
    } catch (err) {
      console.error("Save failed:", err);
      alert("Failed to save file");
    }
  };

  return (
    <div className="preview-overlay">
      <div className="preview-container">
        <div className="preview-header">
          <h2>Screenshot Preview</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="preview-image-wrapper">
          <img src={imageData} alt="Screenshot" className="preview-image" />
        </div>
        <div className="preview-actions">
          <button className="action-btn copy-btn" onClick={handleCopy}>
            Copy
          </button>
          <button className="action-btn save-btn" onClick={handleSave}>
            Save
          </button>
          <button className="action-btn edit-btn" onClick={onEdit}>
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
