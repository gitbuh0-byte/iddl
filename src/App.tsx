import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { writePsd, Psd } from "ag-psd";
import { 
  User, FileText, Image as ImageIcon, Upload, Download, 
  Loader2, CheckCircle2, Shield, Eye, Trash2, Layers, 
  Square, MousePointer2, Eraser, Save, Plus, RotateCcw,
  BarChart3, Zap, Smartphone, Code, CreditCard, Copy, RefreshCw, Wand2
} from "lucide-react";
import { generateMultipleDLPackages, getAllStates, StateCode, DLPackage } from "./utils/dlGenerator";
import { loadOpenCV, createMask, dilateMask, inpaintImage } from "./utils/inpainting";

interface DetectionResult {
  faces: Array<{ x: number; y: number; width: number; height: number; confidence: number }>;
  text: Array<{ x: number; y: number; width: number; height: number; content: string }>;
  signatures: Array<{ x: number; y: number; width: number; height: number }>;
  codes: Array<{ x: number; y: number; width: number; height: number; type: string }>;
  backgrounds: Array<{ type: string; color: string }>;
  components: string[];
}

interface Layer {
  id: string;
  name: string;
  type: "face" | "text" | "signature" | "code" | "background" | "custom";
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
}

interface ManagedFile {
  id: string;
  name: string;
  originalUrl: string;
  layers: Layer[];
  analysis: DetectionResult | null;
  isAnalyzing: boolean;
  isAnalyzed: boolean;
  isProcessing: boolean;
  isCompleted: boolean;
  adjustments: {
    brightness: number;
    contrast: number;
    saturation: number;
  };
}

export default function App() {
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<"add" | "edit" | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"png" | "jpg" | "psd" | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const [currentDrag, setCurrentDrag] = useState<{ x: number, y: number } | null>(null);
  const [drawingLayer, setDrawingLayer] = useState<"face" | "text" | "signature" | "code" | null>(null);

  // Text removal state
  const [isRemovingText, setIsRemovingText] = useState(false);
  const [selectedTextsToRemove, setSelectedTextsToRemove] = useState<string[]>([]);
  const [isInpainting, setIsInpainting] = useState(false);
  const [openCVLoaded, setOpenCVLoaded] = useState(false);

  // DL Generator state
  const [selectedDLState, setSelectedDLState] = useState<StateCode>("CA");
  const [generatedDLPackages, setGeneratedDLPackages] = useState<DLPackage[]>([]);
  const [dlCopiedIndex, setDlCopiedIndex] = useState<{ index: number; field: "dlNumber" | "icn" | "dd" } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const selectedFile = files.find(f => f.id === selectedFileId);
  const selectedLayer = selectedFile?.layers.find(l => l.id === selectedLayerId);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    if (selectedFiles.length === 0) return;

    selectedFiles.slice(0, 4 - files.length).forEach((f: File) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newFile: ManagedFile = {
        id,
        name: f.name,
        originalUrl: URL.createObjectURL(f),
        layers: [],
        analysis: null,
        isAnalyzing: true,
        isAnalyzed: false,
        isProcessing: false,
        isCompleted: false,
        adjustments: { brightness: 0, contrast: 0, saturation: 0 }
      };
      
      setFiles((prev: ManagedFile[]) => [...prev, newFile]);
      if (!selectedFileId) setSelectedFileId(id);

      // Auto-analyze image
      analyzeImage(f, id);
    });
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const analyzeImage = async (file: File, fileId: string) => {
    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (data.analysis) {
        const analysis = data.analysis as DetectionResult;
        
        // Convert percentage-based coordinates to normalized 0-1 range
        const layers: Layer[] = [];
        let layerId = 0;

        // Add face layers
        analysis.faces.forEach((face) => {
          layers.push({
            id: `face-${layerId++}`,
            name: `Face ${layerId}`,
            type: "face",
            x: face.x / 100,
            y: face.y / 100,
            width: face.width / 100,
            height: face.height / 100,
            confidence: face.confidence,
            visible: true,
            locked: false,
            opacity: 1,
          });
        });

        // Add text layers
        analysis.text.forEach((txt) => {
          layers.push({
            id: `text-${layerId++}`,
            name: `Text: "${txt.content.substring(0, 20)}"`,
            type: "text",
            x: txt.x / 100,
            y: txt.y / 100,
            width: txt.width / 100,
            height: txt.height / 100,
            visible: true,
            locked: false,
            opacity: 1,
          });
        });

        // Add signature layers
        analysis.signatures.forEach((sig) => {
          layers.push({
            id: `sig-${layerId++}`,
            name: `Signature ${layerId}`,
            type: "signature",
            x: sig.x / 100,
            y: sig.y / 100,
            width: sig.width / 100,
            height: sig.height / 100,
            visible: true,
            locked: false,
            opacity: 1,
          });
        });

        // Add code layers
        analysis.codes.forEach((code) => {
          layers.push({
            id: `code-${layerId++}`,
            name: `${code.type.toUpperCase()} Code`,
            type: "code",
            x: code.x / 100,
            y: code.y / 100,
            width: code.width / 100,
            height: code.height / 100,
            visible: true,
            locked: false,
            opacity: 1,
          });
        });

        setFiles((prev: ManagedFile[]) => prev.map((f: ManagedFile) => 
          f.id === fileId 
            ? { ...f, layers, analysis, isAnalyzing: false, isAnalyzed: true, isCompleted: true }
            : f
        ));

        if (!selectedLayerId && layers.length > 0) {
          setSelectedLayerId(layers[0].id);
        }
      }
    } catch (error) {
      console.error("Analysis error:", error);
      setFiles((prev: ManagedFile[]) => prev.map((f: ManagedFile) => 
        f.id === fileId 
          ? { ...f, isAnalyzing: false, isAnalyzed: false }
          : f
      ));
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev: ManagedFile[]) => prev.filter((f: ManagedFile) => f.id !== id));
    if (selectedFileId === id) setSelectedFileId(null);
  };

  // Canvas drawing logic
  useEffect(() => {
    if (!selectedFile || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // Redraw canvas whenever selected file or its layers change
    const drawCanvas = () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = selectedFile.originalUrl;
      
      img.onload = () => {
        const container = stageRef.current;
        if (!container) return;
        
        const ratio = img.width / img.height;
        const targetWidth = Math.min(container.clientWidth, 900);
        canvas.width = targetWidth;
        canvas.height = targetWidth / ratio;

        // Apply adjustments
        ctx.filter = `brightness(${1 + selectedFile.adjustments.brightness * 0.1}) contrast(${1 + selectedFile.adjustments.contrast * 0.1}) saturate(${1 + selectedFile.adjustments.saturation * 0.1})`;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.filter = "none";

        // Draw layers
        selectedFile.layers.forEach((layer: Layer) => {
          if (!layer.visible) return;

          const x = layer.x * canvas.width;
          const y = layer.y * canvas.height;
          const w = layer.width * canvas.width;
          const h = layer.height * canvas.height;

          ctx.globalAlpha = layer.opacity;
          const colors = {
            face: { fill: "rgba(59, 130, 246, 0.3)", stroke: "#3b82f6" },
            text: { fill: "rgba(239, 68, 68, 0.3)", stroke: "#ef4444" },
            signature: { fill: "rgba(168, 85, 247, 0.3)", stroke: "#a855f7" },
            code: { fill: "rgba(34, 197, 94, 0.3)", stroke: "#22c55e" },
            background: { fill: "rgba(234, 179, 8, 0.3)", stroke: "#eab308" },
            custom: { fill: "rgba(107, 114, 128, 0.3)", stroke: "#6b7280" },
          };

          const color = colors[layer.type as keyof typeof colors];
          ctx.fillStyle = color.fill;
          ctx.strokeStyle = color.stroke;
          ctx.lineWidth = selectedLayer?.id === layer.id ? 3 : 2;
          ctx.setLineDash(selectedLayer?.id === layer.id ? [0] : [5, 5]);

          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);

          // Label
          ctx.fillStyle = "white";
          ctx.font = "bold 10px Inter";
          ctx.fillText(layer.type.toUpperCase(), x + 5, y + 15);
          
          if (layer.confidence) {
            ctx.fillStyle = "#9ca3af";
            ctx.font = "9px Inter";
            ctx.fillText(`${(layer.confidence * 100).toFixed(0)}%`, x + 5, y + 28);
          }

          ctx.globalAlpha = 1;
        });

        // Draw new layer being created
        if (isDragging && dragStart && currentDrag && drawingLayer) {
          ctx.globalAlpha = 0.5;
          const fillColors: Record<string, string> = {
            face: "rgba(59, 130, 246, 0.3)",
            text: "rgba(239, 68, 68, 0.3)",
            signature: "rgba(168, 85, 247, 0.3)",
            code: "rgba(34, 197, 94, 0.3)",
          };
          ctx.fillStyle = fillColors[drawingLayer] || "rgba(107, 114, 128, 0.3)";
          const strokeColors: Record<string, string> = {
            face: "#3b82f6",
            text: "#ef4444",
            signature: "#a855f7",
            code: "#22c55e",
          };
          ctx.strokeStyle = strokeColors[drawingLayer] || "#6b7280";
          
          const dx = Math.min(dragStart.x, currentDrag.x) * canvas.width;
          const dy = Math.min(dragStart.y, currentDrag.y) * canvas.height;
          const dw = Math.abs(currentDrag.x - dragStart.x) * canvas.width;
          const dh = Math.abs(currentDrag.y - dragStart.y) * canvas.height;
          
          ctx.lineWidth = 2;
          ctx.fillRect(dx, dy, dw, dh);
          ctx.strokeRect(dx, dy, dw, dh);
          ctx.globalAlpha = 1;
        }
      };

      img.onerror = () => {
        console.error("Failed to load image:", selectedFile.originalUrl);
      };
    };

    drawCanvas();
  }, [selectedFile, selectedLayer, isDragging, dragStart, currentDrag, drawingLayer]);

  // Load OpenCV for text inpainting
  useEffect(() => {
    console.log('Starting OpenCV load...');
    loadOpenCV()
      .then(() => {
        console.log('✓ OpenCV promise resolved, setting openCVLoaded to true');
        setOpenCVLoaded(true);
      })
      .catch(err => {
        console.error("Failed to load OpenCV:", err);
        // Still allow the app to work with fallback
        setOpenCVLoaded(false);
      });
  }, []);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvasRef.current.width;
    const y = (e.clientY - rect.top) / canvasRef.current.height;
    
    setDragStart({ x, y });
    setCurrentDrag({ x, y });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / canvasRef.current.width;
    const y = (e.clientY - rect.top) / canvasRef.current.height;
    setCurrentDrag({ x, y });
  };

  const handleMouseUp = () => {
    if (!isDragging || !dragStart || !currentDrag || !editMode || !selectedFile || !drawingLayer) {
      setIsDragging(false);
      return;
    }

    const x = Math.min(dragStart.x, currentDrag.x);
    const y = Math.min(dragStart.y, currentDrag.y);
    const width = Math.abs(currentDrag.x - dragStart.x);
    const height = Math.abs(currentDrag.y - dragStart.y);

    if (width > 0.01 && height > 0.01) {
      const newLayer: Layer = {
        id: `layer-${Date.now()}`,
        name: `${drawingLayer.charAt(0).toUpperCase() + drawingLayer.slice(1)} ${selectedFile.layers.length + 1}`,
        type: drawingLayer as any,
        x,
        y,
        width,
        height,
        visible: true,
        locked: false,
        opacity: 1,
      };
      
      setFiles((prev: ManagedFile[]) => prev.map((f: ManagedFile) => 
        f.id === selectedFileId 
          ? { ...f, layers: [...f.layers, newLayer] }
          : f
      ));
      setSelectedLayerId(newLayer.id);
    }

    setIsDragging(false);
    setDragStart(null);
    setCurrentDrag(null);
  };

  const deleteLayer = async (layerId: string) => {
    if (!selectedFile || !canvasRef.current) return;
    
    const layer = selectedFile.layers.find(l => l.id === layerId);
    if (!layer) return;

    // Check if OpenCV is loaded for inpainting
    if (!openCVLoaded) {
      alert("OpenCV is still loading. Please try again in a moment.");
      return;
    }

    setIsInpainting(true);
    try {
      const canvas = canvasRef.current;
      
      // Validate canvas
      if (!canvas.width || !canvas.height) {
        throw new Error("Canvas dimensions are invalid. Please make sure an image is loaded.");
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");

      // Create mask from the layer area
      const regions = [{
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height
      }];

      console.log(`Creating mask for layer: ${layer.name}`);
      const maskCanvas = createMask(canvas.width, canvas.height, regions);
      
      console.log("Dilating mask...");
      const dilatedMask = dilateMask(maskCanvas, 2);

      // Perform inpainting
      console.log("Starting inpainting process...");
      const inpaintedCanvas = await inpaintImage({
        canvas,
        mask: dilatedMask,
        method: "telea",
      });

      console.log("Inpainting complete, updating canvas...");
      // Update canvas with inpainted result
      const inpaintedCtx = inpaintedCanvas.getContext("2d");
      const resultImageData = inpaintedCtx?.getImageData(
        0,
        0,
        inpaintedCanvas.width,
        inpaintedCanvas.height
      );

      if (resultImageData) {
        ctx.putImageData(resultImageData, 0, 0);
      } else {
        throw new Error("Failed to get inpainted image data");
      }

      // Remove layer from the layer list
      setFiles((prev: ManagedFile[]) =>
        prev.map((f: ManagedFile) =>
          f.id === selectedFileId
            ? {
                ...f,
                layers: f.layers.filter((l: Layer) => l.id !== layerId),
              }
            : f
        )
      );

      // Clear selection if deleted layer was selected
      if (selectedLayerId === layerId) setSelectedLayerId(null);

      console.log(`Successfully deleted and inpainted layer: ${layerId}`);
    } catch (error) {
      console.error("Layer deletion error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to delete component: ${errorMessage}`);
    } finally {
      setIsInpainting(false);
    }
  };

  const updateLayer = (layerId: string, updates: Partial<Layer>) => {
    setFiles((prev: ManagedFile[]) => prev.map((f: ManagedFile) => 
      f.id === selectedFileId 
        ? { 
            ...f, 
            layers: f.layers.map((l: Layer) => l.id === layerId ? { ...l, ...updates } : l)
          }
        : f
    ));
    console.log(`Updated layer: ${layerId}`, updates);
  };

  const removeSelectedTexts = async () => {
    if (!selectedFile || !canvasRef.current || selectedTextsToRemove.length === 0) return;
    if (!openCVLoaded) {
      alert("OpenCV is still loading. Please try again in a moment.");
      return;
    }

    setIsInpainting(true);
    try {
      const canvas = canvasRef.current;
      
      // Validate canvas
      if (!canvas.width || !canvas.height) {
        throw new Error("Canvas dimensions are invalid. Please make sure an image is loaded.");
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Failed to get canvas context");

      // Create mask from selected text layers
      const textLayers = selectedFile.layers.filter(
        l => l.type === "text" && selectedTextsToRemove.includes(l.id)
      );

      if (textLayers.length === 0) {
        throw new Error("No valid text layers selected");
      }

      console.log(`Creating mask for ${textLayers.length} text layers...`);
      const maskCanvas = createMask(canvas.width, canvas.height, textLayers);
      
      console.log("Dilating mask...");
      const dilatedMask = dilateMask(maskCanvas, 3);

      // Perform inpainting
      console.log("Starting inpainting process...");
      const inpaintedCanvas = await inpaintImage({
        canvas,
        mask: dilatedMask,
        method: "telea",
      });

      console.log("Inpainting complete, updating canvas...");
      // Update canvas with inpainted result
      const inpaintedCtx = inpaintedCanvas.getContext("2d");
      const resultImageData = inpaintedCtx?.getImageData(
        0,
        0,
        inpaintedCanvas.width,
        inpaintedCanvas.height
      );

      if (resultImageData) {
        ctx.putImageData(resultImageData, 0, 0);
      } else {
        throw new Error("Failed to get inpainted image data");
      }

      // Remove text layers from the layer list
      setFiles((prev: ManagedFile[]) =>
        prev.map((f: ManagedFile) =>
          f.id === selectedFileId
            ? {
                ...f,
                layers: f.layers.filter(
                  (l: Layer) => !(l.type === "text" && selectedTextsToRemove.includes(l.id))
                ),
              }
            : f
        )
      );

      setSelectedTextsToRemove([]);
      setIsRemovingText(false);
      console.log("Text removal completed successfully");
    } catch (error) {
      console.error("Text removal error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to remove text: ${errorMessage}`);
    } finally {
      setIsInpainting(false);
    }
  };

  const generateDLNumbers = () => {
    const newPackages = generateMultipleDLPackages(selectedDLState, 5);
    setGeneratedDLPackages(newPackages);
  };

  const copyToClipboard = (text: string, index: number, field: "dlNumber" | "icn" | "dd") => {
    navigator.clipboard.writeText(text);
    setDlCopiedIndex({ index, field });
    setTimeout(() => setDlCopiedIndex(null), 2000);
  };

  const exportAsset = async (format: "png" | "jpg" | "psd") => {
    if (!selectedFile || !canvasRef.current) return;
    setIsExporting(true);
    setExportFormat(format);

    try {
      const canvas = canvasRef.current;
      const fileName = selectedFile.name.split(".")[0];
      
      if (format === "png" || format === "jpg") {
        const link = document.createElement("a");
        link.download = `${fileName}_edited.${format === "jpg" ? "jpg" : "png"}`;
        link.href = canvas.toDataURL(`image/${format === "jpg" ? "jpeg" : "png"}`, format === "jpg" ? 0.9 : 1);
        link.click();
      } else if (format === "psd") {
        // Get high-res original
        const originalImg = new Image();
        originalImg.crossOrigin = "anonymous";
        originalImg.src = selectedFile.originalUrl;
        await new Promise(resolve => originalImg.onload = resolve);
        
        const originalCanvas = document.createElement("canvas");
        originalCanvas.width = originalImg.width;
        originalCanvas.height = originalImg.height;
        const octx = originalCanvas.getContext("2d");
        if (octx) octx.drawImage(originalImg, 0, 0);

        // Create PSD with layers
        const psd: Psd = {
          width: originalImg.width,
          height: originalImg.height,
          children: [
            {
              name: "Original Image",
              canvas: originalCanvas,
              hidden: true,
            },
            {
              name: "Edited Version",
              canvas: canvas,
            },
            {
              name: "Analysis Layers",
              opened: false,
              children: selectedFile.layers.map((layer, i) => {
                const layerCanvas = document.createElement("canvas");
                layerCanvas.width = originalImg.width;
                layerCanvas.height = originalImg.height;
                const lctx = layerCanvas.getContext("2d");
                if (lctx) {
                  const colors = {
                    face: "rgba(59, 130, 246, 0.6)",
                    text: "rgba(239, 68, 68, 0.6)",
                    signature: "rgba(168, 85, 247, 0.6)",
                    code: "rgba(34, 197, 94, 0.6)",
                    background: "rgba(234, 179, 8, 0.6)",
                    custom: "rgba(107, 114, 128, 0.6)",
                  };
                  lctx.fillStyle = colors[layer.type] || colors.custom;
                  lctx.fillRect(
                    layer.x * originalImg.width,
                    layer.y * originalImg.height,
                    layer.width * originalImg.width,
                    layer.height * originalImg.height
                  );
                }
                return {
                  name: layer.name,
                  canvas: layerCanvas,
                  opacity: Math.round(layer.opacity * 255),
                };
              })
            }
          ],
        };

        const psdData = writePsd(psd);
        const blob = new Blob([psdData], { type: "application/octet-stream" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fileName}_project.psd`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export Error:", err);
    } finally {
      setIsExporting(false);
      setExportFormat(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-100 font-sans selection:bg-blue-500/30 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="border-b border-neutral-800/50 bg-[#0a0a0a]/80 backdrop-blur-xl z-50 shrink-0">
        <div className="max-w-[1920px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <ImageIcon className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-lg tracking-tight block leading-none">Photo Studio</span>
              <span className="text-[9px] text-neutral-500 uppercase tracking-widest font-mono">AI-Powered Editor v1.0</span>
            </div>
            {/* OpenCV Status */}
            <div className="ml-4 pl-4 border-l border-neutral-700">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${openCVLoaded ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`}></div>
                <span className="text-[9px] text-neutral-400 uppercase font-mono">
                  {openCVLoaded ? 'OpenCV Ready' : 'Loading...'}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Layer Type Selector */}
            <div className="flex bg-neutral-900/50 rounded-lg p-1 border border-neutral-800">
              <button 
                onClick={() => { setEditMode("add"); setDrawingLayer("face"); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[9px] font-bold uppercase transition-all ${editMode === "add" && drawingLayer === "face" ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-neutral-400 hover:text-white"}`}
                title="Draw face area"
              >
                <User className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => { setEditMode("add"); setDrawingLayer("text"); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[9px] font-bold uppercase transition-all ${editMode === "add" && drawingLayer === "text" ? "bg-red-600 text-white shadow-lg shadow-red-500/20" : "text-neutral-400 hover:text-white"}`}
                title="Draw text area"
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => { setEditMode("add"); setDrawingLayer("signature"); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[9px] font-bold uppercase transition-all ${editMode === "add" && drawingLayer === "signature" ? "bg-purple-600 text-white shadow-lg shadow-purple-500/20" : "text-neutral-400 hover:text-white"}`}
                title="Draw signature area"
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => { setEditMode("add"); setDrawingLayer("code"); }}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[9px] font-bold uppercase transition-all ${editMode === "add" && drawingLayer === "code" ? "bg-green-600 text-white shadow-lg shadow-green-500/20" : "text-neutral-400 hover:text-white"}`}
                title="Draw code area"
              >
                <Code className="w-3.5 h-3.5" />
              </button>
              <div className="w-px bg-neutral-700 mx-1" />
              <button 
                onClick={() => setEditMode(null)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[9px] font-bold uppercase transition-all ${!editMode ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}
                title="Pointer mode"
              >
                <MousePointer2 className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setIsRemovingText(!isRemovingText)}
                disabled={!selectedFile || !openCVLoaded}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[9px] font-bold uppercase transition-all disabled:opacity-50 ${isRemovingText ? "bg-amber-600 text-white shadow-lg shadow-amber-500/20" : "text-neutral-400 hover:text-white"}`}
                title="Remove text with inpainting"
              >
                <Wand2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="h-6 w-px bg-neutral-800 mx-1" />

            {/* Export Buttons */}
            <div className="flex gap-2">
              <button 
                onClick={() => exportAsset("png")}
                disabled={!selectedFile || isExporting}
                className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-[9px] font-bold uppercase transition-all border border-neutral-700"
              >
                {isExporting && exportFormat === "png" ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                PNG
              </button>
              <button 
                onClick={() => exportAsset("jpg")}
                disabled={!selectedFile || isExporting}
                className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-[9px] font-bold uppercase transition-all border border-neutral-700"
              >
                {isExporting && exportFormat === "jpg" ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                JPG
              </button>
              <button 
                onClick={() => exportAsset("psd")}
                disabled={!selectedFile || isExporting}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-[9px] font-bold uppercase transition-all shadow-lg shadow-blue-500/20"
              >
                {isExporting && exportFormat === "psd" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                PSD
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main UI */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: File Browser */}
        <div className="w-72 border-r border-neutral-800/50 bg-[#080808] flex flex-col shrink-0">
          <div className="p-4 border-b border-neutral-800/50 flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em]">Photo Library</span>
            <span className="bg-neutral-900 border border-neutral-800 text-[10px] text-neutral-400 px-2 py-0.5 rounded font-mono">{files.length}/4</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {files.map(file => (
              <div 
                key={file.id}
                onClick={() => setSelectedFileId(file.id)}
                className={`group relative aspect-[14/9] rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${selectedFileId === file.id ? "border-blue-500 shadow-[0_0_20px_-5px_rgba(59,130,246,0.3)]" : "border-neutral-800 hover:border-neutral-700"}`}
              >
                <img src={file.originalUrl} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-neutral-950/40 opacity-0 group-hover:opacity-100 transition-opacity" />
                
                {file.isAnalyzed && (
                  <div className="absolute top-2 left-2 bg-green-500 text-white p-1.5 rounded-md shadow-lg flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span className="text-[8px] font-bold">{file.layers.length}</span>
                  </div>
                )}

                {file.isAnalyzing && (
                  <div className="absolute inset-0 bg-neutral-950/60 backdrop-blur-sm flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  </div>
                )}

                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 p-3 opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0">
                  <span className="text-[9px] text-white font-bold truncate block">{file.name}</span>
                </div>

                <button 
                  onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                  className="absolute top-2 right-2 p-1.5 bg-red-600/90 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 scale-90 hover:scale-100"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}

            {files.length < 4 && (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-[14/9] rounded-xl border-2 border-dashed border-neutral-800 flex flex-col items-center justify-center gap-2 text-neutral-600 hover:text-blue-500 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all text-[10px] font-black uppercase tracking-widest"
              >
                <div className="p-3 bg-neutral-900 rounded-xl">
                  <Plus className="w-5 h-5" />
                </div>
                Upload
              </button>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" accept="image/*" />
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 bg-[#050505] relative overflow-hidden flex items-center justify-center p-8 lg:p-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_#111_0%,_transparent_70%)] pointer-events-none" />
          
          {selectedFile ? (
            <div 
              ref={stageRef}
              className="relative rounded-3xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] overflow-hidden bg-neutral-900 border border-white/5 w-full max-w-5xl"
            >
              <canvas 
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className={`w-full block h-auto ${editMode ? "cursor-crosshair" : "cursor-default"}`}
              />
              
              <AnimatePresence>
                {selectedFile.isAnalyzing && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-neutral-950/80 backdrop-blur-xl flex flex-col items-center justify-center z-20"
                  >
                    <div className="relative">
                      <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                      <Zap className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-blue-500" />
                    </div>
                    <p className="mt-8 text-blue-400 font-black uppercase tracking-[0.6em] text-[10px]">Analyzing Image</p>
                    <div className="mt-8 w-64 h-1 bg-neutral-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 3, ease: "easeInOut" }}
                        className="h-full bg-gradient-to-r from-blue-600 to-indigo-400"
                      />
                    </div>
                  </motion.div>
                )}

                {isInpainting && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-neutral-950/80 backdrop-blur-xl flex flex-col items-center justify-center z-20"
                  >
                    <div className="relative">
                      <div className="w-20 h-20 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
                      <Wand2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-amber-500" />
                    </div>
                    <p className="mt-8 text-amber-400 font-black uppercase tracking-[0.6em] text-[10px]">Removing Component</p>
                    <div className="mt-8 w-64 h-1 bg-neutral-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 5, ease: "easeInOut", repeat: Infinity }}
                        className="h-full bg-gradient-to-r from-amber-600 to-orange-400"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="absolute bottom-4 left-4 flex gap-2">
                <div className="px-3 py-1 bg-black/60 backdrop-blur border border-white/10 rounded-full flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">Live Editor</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-6">
              <div className="w-24 h-24 bg-neutral-900 border border-neutral-800 rounded-3xl flex items-center justify-center mx-auto relative group">
                <div className="absolute inset-0 bg-blue-500/10 blur-xl opacity-0 group-hover:opacity-100 transition-all rounded-full" />
                <ImageIcon className="w-10 h-10 text-neutral-800 group-hover:text-neutral-600 transition-colors" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white tracking-tight">Upload Your Photo</h3>
                <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-medium max-w-xs mx-auto leading-relaxed">
                  AI will automatically detect faces, text, signatures, codes, and backgrounds.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Layers & Adjustments */}
        <div className="w-80 border-l border-neutral-800/50 bg-[#080808] p-6 space-y-8 shrink-0 overflow-y-auto">
          {/* Adjustments */}
          {selectedFile && (
            <div className="space-y-4">
              <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.2em]">Adjustments</h4>
              
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-bold text-neutral-500 uppercase mb-2 block">Brightness</label>
                  <input 
                    type="range" 
                    min="-10" 
                    max="10" 
                    value={selectedFile.adjustments.brightness}
                    onChange={(e) => setFiles(prev => prev.map(f => 
                      f.id === selectedFileId 
                        ? { ...f, adjustments: { ...f.adjustments, brightness: Number(e.target.value) } }
                        : f
                    ))}
                    className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-neutral-500 uppercase mb-2 block">Contrast</label>
                  <input 
                    type="range" 
                    min="-10" 
                    max="10" 
                    value={selectedFile.adjustments.contrast}
                    onChange={(e) => setFiles(prev => prev.map(f => 
                      f.id === selectedFileId 
                        ? { ...f, adjustments: { ...f.adjustments, contrast: Number(e.target.value) } }
                        : f
                    ))}
                    className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-neutral-500 uppercase mb-2 block">Saturation</label>
                  <input 
                    type="range" 
                    min="-10" 
                    max="10" 
                    value={selectedFile.adjustments.saturation}
                    onChange={(e) => setFiles(prev => prev.map(f => 
                      f.id === selectedFileId 
                        ? { ...f, adjustments: { ...f.adjustments, saturation: Number(e.target.value) } }
                        : f
                    ))}
                    className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Layers List */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.2em] flex items-center justify-between">
              Detected Layers
              <span className="text-neutral-700 font-mono italic">#{selectedFile?.layers.length || 0}</span>
            </h4>
            
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2">
              {selectedFile?.layers.length === 0 ? (
                <div className="p-6 rounded-2xl bg-neutral-900/30 border border-dashed border-neutral-800 flex flex-col items-center justify-center text-center">
                  <Layers className="w-6 h-6 text-neutral-700 mb-3" />
                  <p className="text-[9px] text-neutral-600 font-bold uppercase tracking-tight">No layers detected</p>
                  <p className="text-[8px] text-neutral-700 mt-1">Draw areas or upload a new photo</p>
                </div>
              ) : (
                selectedFile?.layers.map((layer: Layer) => (
                  <div 
                    key={layer.id}
                    onClick={() => setSelectedLayerId(layer.id)}
                    className={`group flex items-center gap-3 p-3 rounded-xl transition-all border cursor-pointer ${
                      selectedLayer?.id === layer.id 
                        ? "bg-neutral-800 border-neutral-700" 
                        : "bg-neutral-900/50 border-neutral-800 hover:border-neutral-700"
                    }`}
                  >
                    <div className={`p-2 rounded-lg flex-shrink-0 ${
                      {
                        face: "bg-blue-500/10 text-blue-500",
                        text: "bg-red-500/10 text-red-500",
                        signature: "bg-purple-500/10 text-purple-500",
                        code: "bg-green-500/10 text-green-500",
                        background: "bg-yellow-500/10 text-yellow-500",
                        custom: "bg-gray-500/10 text-gray-500",
                      }[layer.type]
                    }`}>
                      {{
                        face: <User className="w-4 h-4" />,
                        text: <FileText className="w-4 h-4" />,
                        signature: <Eraser className="w-4 h-4" />,
                        code: <Code className="w-4 h-4" />,
                        background: <ImageIcon className="w-4 h-4" />,
                        custom: <Square className="w-4 h-4" />,
                      }[layer.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-neutral-300 uppercase truncate block">{layer.name}</span>
                      <span className="text-[8px] text-neutral-600 font-mono">
                        {(layer.x * 100).toFixed(0)}%, {(layer.y * 100).toFixed(0)}%
                      </span>
                    </div>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        if (window.confirm(`Delete ${layer.name}? This will remove the component from the image using inpainting.`)) {
                          deleteLayer(layer.id);
                        }
                      }}
                      disabled={isInpainting}
                      className="opacity-0 group-hover:opacity-100 text-neutral-700 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Layer Properties */}
          {selectedLayer && (
            <div className="space-y-4 p-4 rounded-xl bg-neutral-900/30 border border-neutral-800">
              <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.2em]">Layer Properties</h4>
              
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Opacity</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={selectedLayer.opacity}
                    onChange={(e) => updateLayer(selectedLayer.id, { opacity: Number(e.target.value) })}
                    className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                  />
                  <span className="text-[8px] text-neutral-600">{(selectedLayer.opacity * 100).toFixed(0)}%</span>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => updateLayer(selectedLayer.id, { visible: !selectedLayer.visible })}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[9px] font-bold uppercase transition-all border ${
                      selectedLayer.visible
                        ? "bg-blue-600/20 border-blue-600 text-blue-400"
                        : "bg-neutral-800/50 border-neutral-700 text-neutral-600"
                    }`}
                  >
                    <Eye className="w-3 h-3" />
                    {selectedLayer.visible ? "Visible" : "Hidden"}
                  </button>
                  <button 
                    onClick={() => updateLayer(selectedLayer.id, { locked: !selectedLayer.locked })}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[9px] font-bold uppercase transition-all border ${
                      selectedLayer.locked
                        ? "bg-red-600/20 border-red-600 text-red-400"
                        : "bg-neutral-800/50 border-neutral-700 text-neutral-600"
                    }`}
                  >
                    <Shield className="w-3 h-3" />
                    {selectedLayer.locked ? "Locked" : "Unlocked"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Statistics */}
          {selectedFile?.isAnalyzed && (
            <div className="p-4 rounded-xl bg-neutral-900/30 border border-neutral-800 space-y-3">
              <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.2em] flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Detection Stats
              </h4>
              <div className="text-[9px] space-y-1 text-neutral-400">
                <div className="flex justify-between">
                  <span>Faces detected:</span>
                  <span className="font-bold">{selectedFile.analysis?.faces.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Text areas:</span>
                  <span className="font-bold">{selectedFile.analysis?.text.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Signatures:</span>
                  <span className="font-bold">{selectedFile.analysis?.signatures.length || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>QR/Barcodes:</span>
                  <span className="font-bold">{selectedFile.analysis?.codes.length || 0}</span>
                </div>
              </div>
            </div>
          )}

          {/* Text Removal Section */}
          {isRemovingText && selectedFile && (
            <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-700/50 space-y-4">
              <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-[0.2em] flex items-center gap-2">
                <Wand2 className="w-4 h-4" />
                Remove Text (Inpainting)
              </h4>
              
              <div className="space-y-3">
                <p className="text-[9px] text-amber-700">Select text layers to remove and fill with background:</p>
                
                <div className="space-y-2 max-h-[25vh] overflow-y-auto">
                  {selectedFile.layers.filter(l => l.type === "text").length === 0 ? (
                    <p className="text-[8px] text-neutral-600 italic">No text layers found</p>
                  ) : (
                    selectedFile.layers
                      .filter(l => l.type === "text")
                      .map(layer => (
                        <label 
                          key={layer.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-neutral-800/30 hover:bg-neutral-800/50 transition-colors cursor-pointer"
                        >
                          <input 
                            type="checkbox"
                            checked={selectedTextsToRemove.includes(layer.id)}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              if (e.target.checked) {
                                setSelectedTextsToRemove([...selectedTextsToRemove, layer.id]);
                              } else {
                                setSelectedTextsToRemove(selectedTextsToRemove.filter(id => id !== layer.id));
                              }
                            }}
                            className="w-4 h-4 accent-amber-600"
                          />
                          <span className="text-[9px] font-bold text-neutral-300 flex-1">{layer.name}</span>
                        </label>
                      ))
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={removeSelectedTexts}
                    disabled={selectedTextsToRemove.length === 0 || isInpainting}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[9px] font-bold uppercase transition-all border bg-amber-600/20 border-amber-600 text-amber-400 hover:bg-amber-600/30 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isInpainting ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3 h-3" />
                        Remove Selected
                      </>
                    )}
                  </button>
                  <button 
                    onClick={() => {
                      setIsRemovingText(false);
                      setSelectedTextsToRemove([]);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[9px] font-bold uppercase transition-all border bg-neutral-800/50 border-neutral-700 text-neutral-400 hover:text-neutral-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* DL Number Generator */}
          <div className="p-4 rounded-xl bg-neutral-900/30 border border-neutral-800 space-y-4">
            <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.2em] flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              DL Number Generator
            </h4>
            
            <div className="space-y-3">
              <div>
                <label className="text-[9px] font-bold text-neutral-500 uppercase mb-2 block">State</label>
                <select 
                  value={selectedDLState}
                  onChange={(e) => setSelectedDLState(e.target.value as StateCode)}
                  className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-[9px] font-bold text-neutral-300 focus:border-blue-600 focus:outline-none"
                >
                  {getAllStates().map((state) => (
                    <option key={state.stateCode} value={state.stateCode}>
                      {state.state} ({state.stateCode}) - {state.format}
                    </option>
                  ))}
                </select>
              </div>

              <button 
                onClick={generateDLNumbers}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-[9px] font-bold uppercase transition-all border bg-blue-600/20 border-blue-600 text-blue-400 hover:bg-blue-600/30"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Generate
              </button>

              {generatedDLPackages.length > 0 && (
                <div className="space-y-3 max-h-[40vh] overflow-y-auto">
                  <p className="text-[8px] text-neutral-600 uppercase font-bold">Generated Packages:</p>
                  {generatedDLPackages.map((pkg: DLPackage, index: number) => (
                    <div 
                      key={index}
                      className="p-3 rounded-lg bg-neutral-800/50 border border-neutral-700 hover:border-neutral-600 transition-all space-y-2"
                    >
                      {/* DL Number */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-[7px] text-neutral-600 uppercase font-bold mb-1">DL #</p>
                          <code className="text-[8px] font-mono text-neutral-300">
                            {pkg.dlNumber}
                          </code>
                        </div>
                        <button 
                          onClick={() => copyToClipboard(pkg.dlNumber, index, "dlNumber")}
                          className="flex-shrink-0 p-1.5 rounded text-neutral-600 hover:text-neutral-300 hover:bg-neutral-700 transition-colors"
                          title="Copy DL Number"
                        >
                          {dlCopiedIndex?.index === index && dlCopiedIndex?.field === "dlNumber" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* ICN */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-[7px] text-neutral-600 uppercase font-bold mb-1">ICN</p>
                          <code className="text-[8px] font-mono text-neutral-300">
                            {pkg.icn}
                          </code>
                        </div>
                        <button 
                          onClick={() => copyToClipboard(pkg.icn, index, "icn")}
                          className="flex-shrink-0 p-1.5 rounded text-neutral-600 hover:text-neutral-300 hover:bg-neutral-700 transition-colors"
                          title="Copy ICN"
                        >
                          {dlCopiedIndex?.index === index && dlCopiedIndex?.field === "icn" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      {/* DD */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-[7px] text-neutral-600 uppercase font-bold mb-1">DD</p>
                          <code className="text-[8px] font-mono text-neutral-300">
                            {pkg.dd}
                          </code>
                        </div>
                        <button 
                          onClick={() => copyToClipboard(pkg.dd, index, "dd")}
                          className="flex-shrink-0 p-1.5 rounded text-neutral-600 hover:text-neutral-300 hover:bg-neutral-700 transition-colors"
                          title="Copy DD"
                        >
                          {dlCopiedIndex?.index === index && dlCopiedIndex?.field === "dd" ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
