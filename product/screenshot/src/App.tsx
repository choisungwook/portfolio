import { useState } from "react";
import CaptureButtons from "./components/CaptureButtons";
import PreviewOverlay from "./components/PreviewOverlay";
import ImageEditor from "./components/ImageEditor";
import "./App.css";

type AppView = "home" | "preview" | "editor";

function App() {
  const [view, setView] = useState<AppView>("home");
  const [capturedImage, setCapturedImage] = useState<string>("");

  const handleCapture = (imageData: string) => {
    setCapturedImage(imageData);
    setView("preview");
  };

  const handleEdit = () => {
    setView("editor");
  };

  const handleClose = () => {
    setView("home");
    setCapturedImage("");
  };

  return (
    <div className="app">
      {view === "home" && <CaptureButtons onCapture={handleCapture} />}

      {view === "preview" && capturedImage && (
        <PreviewOverlay
          imageData={capturedImage}
          onEdit={handleEdit}
          onClose={handleClose}
        />
      )}

      {view === "editor" && capturedImage && (
        <ImageEditor imageData={capturedImage} onClose={handleClose} />
      )}
    </div>
  );
}

export default App;
