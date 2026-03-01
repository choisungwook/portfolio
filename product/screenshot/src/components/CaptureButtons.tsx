import { useState } from "react";
import { captureFullScreen, captureRegion } from "../utils/screenshot";

interface CaptureButtonsProps {
  onCapture: (imageData: string) => void;
}

export default function CaptureButtons({ onCapture }: CaptureButtonsProps) {
  const [isCapturing, setIsCapturing] = useState(false);

  const handleFullCapture = async () => {
    try {
      setIsCapturing(true);
      const imageData = await captureFullScreen();
      onCapture(imageData);
    } catch (err) {
      console.error("Full screenshot failed:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRegionCapture = async () => {
    try {
      setIsCapturing(true);
      const imageData = await captureRegion();
      onCapture(imageData);
    } catch (err) {
      console.error("Region screenshot failed:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="capture-buttons">
      <h1>ScreenCapture</h1>
      <p className="subtitle">Take screenshots easily</p>
      <div className="button-group">
        <button
          className="capture-btn full-btn"
          onClick={handleFullCapture}
          disabled={isCapturing}
        >
          <span className="btn-icon">🖥</span>
          <span className="btn-text">Full Screen</span>
        </button>
        <button
          className="capture-btn region-btn"
          onClick={handleRegionCapture}
          disabled={isCapturing}
        >
          <span className="btn-icon">⬒</span>
          <span className="btn-text">Select Region</span>
        </button>
      </div>
      {isCapturing && <p className="status">Capturing...</p>}
    </div>
  );
}
