import { useEffect, useRef, useState, useCallback } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { saveEditedImage } from "../utils/screenshot";

type Tool = "rectangle" | "line" | "circle-number" | "text" | "arrow";

interface Annotation {
  type: Tool;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  text?: string;
  number?: number;
}

interface ImageEditorProps {
  imageData: string;
  onClose: () => void;
}

const COLORS = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#007AFF", "#AF52DE", "#FFFFFF", "#000000"];

export default function ImageEditor({ imageData, onClose }: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("rectangle");
  const [color, setColor] = useState("#FF3B30");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentPos, setCurrentPos] = useState({ x: 0, y: 0 });
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [numberCount, setNumberCount] = useState(1);
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [textPos, setTextPos] = useState({ x: 0, y: 0 });
  const [canvasScale, setCanvasScale] = useState(1);

  // Load background image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setBgImage(img);
      const canvas = canvasRef.current;
      if (canvas) {
        // Scale to fit in editor while maintaining aspect ratio
        const maxWidth = Math.min(img.width, window.innerWidth - 100);
        const maxHeight = Math.min(img.height, window.innerHeight - 200);
        const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);

        canvas.width = img.width;
        canvas.height = img.height;
        canvas.style.width = `${img.width * scale}px`;
        canvas.style.height = `${img.height * scale}px`;
        setCanvasScale(scale);
      }
    };
    img.src = imageData;
  }, [imageData]);

  const getCanvasCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: (e.clientX - rect.left) / canvasScale,
        y: (e.clientY - rect.top) / canvasScale,
      };
    },
    [canvasScale]
  );

  // Draw everything
  const drawAll = useCallback(
    (
      extraAnnotation?: Annotation | null
    ) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx || !bgImage) return;

      // Draw background
      ctx.drawImage(bgImage, 0, 0);

      // Draw all saved annotations
      const allAnnotations = extraAnnotation
        ? [...annotations, extraAnnotation]
        : annotations;

      for (const ann of allAnnotations) {
        drawAnnotation(ctx, ann);
      }
    },
    [bgImage, annotations]
  );

  useEffect(() => {
    drawAll();
  }, [drawAll]);

  const drawAnnotation = (ctx: CanvasRenderingContext2D, ann: Annotation) => {
    ctx.strokeStyle = ann.color;
    ctx.fillStyle = ann.color;
    ctx.lineWidth = 3;

    switch (ann.type) {
      case "rectangle": {
        const x = Math.min(ann.startX, ann.endX);
        const y = Math.min(ann.startY, ann.endY);
        const w = Math.abs(ann.endX - ann.startX);
        const h = Math.abs(ann.endY - ann.startY);
        ctx.strokeRect(x, y, w, h);
        break;
      }
      case "line": {
        ctx.beginPath();
        ctx.moveTo(ann.startX, ann.startY);
        ctx.lineTo(ann.endX, ann.endY);
        ctx.stroke();
        break;
      }
      case "arrow": {
        // Draw line
        ctx.beginPath();
        ctx.moveTo(ann.startX, ann.startY);
        ctx.lineTo(ann.endX, ann.endY);
        ctx.stroke();

        // Draw arrowhead
        const angle = Math.atan2(
          ann.endY - ann.startY,
          ann.endX - ann.startX
        );
        const headLen = 15;
        ctx.beginPath();
        ctx.moveTo(ann.endX, ann.endY);
        ctx.lineTo(
          ann.endX - headLen * Math.cos(angle - Math.PI / 6),
          ann.endY - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(ann.endX, ann.endY);
        ctx.lineTo(
          ann.endX - headLen * Math.cos(angle + Math.PI / 6),
          ann.endY - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.stroke();
        break;
      }
      case "circle-number": {
        const radius = 16;
        ctx.beginPath();
        ctx.arc(ann.startX, ann.startY, radius, 0, Math.PI * 2);
        ctx.fill();

        // Draw number text
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(ann.number || 1), ann.startX, ann.startY);
        break;
      }
      case "text": {
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";

        // Draw text background
        if (ann.text) {
          const metrics = ctx.measureText(ann.text);
          const padding = 4;
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(
            ann.startX - padding,
            ann.startY - padding,
            metrics.width + padding * 2,
            24 + padding * 2
          );
          ctx.fillStyle = ann.color;
          ctx.fillText(ann.text, ann.startX, ann.startY);
        }
        break;
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasCoords(e);

    if (tool === "text") {
      setTextPos(pos);
      setShowTextInput(true);
      return;
    }

    if (tool === "circle-number") {
      const annotation: Annotation = {
        type: "circle-number",
        startX: pos.x,
        startY: pos.y,
        endX: pos.x,
        endY: pos.y,
        color,
        number: numberCount,
      };
      setAnnotations((prev) => [...prev, annotation]);
      setNumberCount((prev) => prev + 1);
      return;
    }

    setIsDrawing(true);
    setStartPos(pos);
    setCurrentPos(pos);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const pos = getCanvasCoords(e);
    setCurrentPos(pos);

    // Draw preview
    const previewAnnotation: Annotation = {
      type: tool,
      startX: startPos.x,
      startY: startPos.y,
      endX: pos.x,
      endY: pos.y,
      color,
    };
    drawAll(previewAnnotation);
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    const annotation: Annotation = {
      type: tool,
      startX: startPos.x,
      startY: startPos.y,
      endX: currentPos.x,
      endY: currentPos.y,
      color,
    };
    setAnnotations((prev) => [...prev, annotation]);
  };

  const handleTextSubmit = () => {
    if (textInput.trim()) {
      const annotation: Annotation = {
        type: "text",
        startX: textPos.x,
        startY: textPos.y,
        endX: textPos.x,
        endY: textPos.y,
        color,
        text: textInput,
      };
      setAnnotations((prev) => [...prev, annotation]);
    }
    setTextInput("");
    setShowTextInput(false);
  };

  const handleUndo = () => {
    setAnnotations((prev) => {
      const newAnnotations = prev.slice(0, -1);
      // Recalculate number count
      const maxNum = newAnnotations
        .filter((a) => a.type === "circle-number")
        .reduce((max, a) => Math.max(max, a.number || 0), 0);
      setNumberCount(maxNum + 1);
      return newAnnotations;
    });
  };

  const handleClear = () => {
    setAnnotations([]);
    setNumberCount(1);
  };

  const getCanvasDataUrl = (): string => {
    const canvas = canvasRef.current;
    if (!canvas) return "";
    return canvas.toDataURL("image/png");
  };

  const handleCopy = async () => {
    try {
      const dataUrl = getCanvasDataUrl();
      const base64Only = dataUrl.split(",")[1] || dataUrl;
      await writeText(base64Only);
      alert("Image data copied to clipboard!");
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleSave = async () => {
    try {
      const dataUrl = getCanvasDataUrl();
      const filePath = await save({
        filters: [{ name: "PNG Image", extensions: ["png"] }],
        defaultPath: `screenshot_edited_${Date.now()}.png`,
      });
      if (filePath) {
        await saveEditedImage(dataUrl, filePath);
        alert(`Saved to ${filePath}`);
      }
    } catch (err) {
      console.error("Save failed:", err);
    }
  };

  return (
    <div className="editor-overlay">
      <div className="editor-container">
        <div className="editor-toolbar">
          <div className="tool-group">
            <button
              className={`tool-btn ${tool === "rectangle" ? "active" : ""}`}
              onClick={() => setTool("rectangle")}
              title="Rectangle"
            >
              ▭
            </button>
            <button
              className={`tool-btn ${tool === "line" ? "active" : ""}`}
              onClick={() => setTool("line")}
              title="Line"
            >
              ╱
            </button>
            <button
              className={`tool-btn ${tool === "arrow" ? "active" : ""}`}
              onClick={() => setTool("arrow")}
              title="Arrow"
            >
              →
            </button>
            <button
              className={`tool-btn ${tool === "circle-number" ? "active" : ""}`}
              onClick={() => setTool("circle-number")}
              title="Numbered Circle"
            >
              ①
            </button>
            <button
              className={`tool-btn ${tool === "text" ? "active" : ""}`}
              onClick={() => setTool("text")}
              title="Text"
            >
              T
            </button>
          </div>

          <div className="color-group">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`color-btn ${color === c ? "active" : ""}`}
                style={{ backgroundColor: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>

          <div className="action-group">
            <button className="tool-btn" onClick={handleUndo} title="Undo">
              ↩
            </button>
            <button className="tool-btn" onClick={handleClear} title="Clear All">
              ✕
            </button>
          </div>

          <div className="save-group">
            <button className="action-btn copy-btn" onClick={handleCopy}>
              Copy
            </button>
            <button className="action-btn save-btn" onClick={handleSave}>
              Save
            </button>
            <button className="action-btn close-editor-btn" onClick={onClose}>
              Done
            </button>
          </div>
        </div>

        <div className="editor-canvas-wrapper">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className="editor-canvas"
          />
        </div>

        {showTextInput && (
          <div
            className="text-input-popup"
            style={{
              left: textPos.x * canvasScale + 50,
              top: textPos.y * canvasScale + 100,
            }}
          >
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleTextSubmit();
                if (e.key === "Escape") {
                  setShowTextInput(false);
                  setTextInput("");
                }
              }}
              placeholder="Enter text..."
              autoFocus
            />
            <button onClick={handleTextSubmit}>OK</button>
          </div>
        )}
      </div>
    </div>
  );
}
