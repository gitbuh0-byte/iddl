import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { writePsd, Psd } from "ag-psd";
import { 
  User, FileText, Image as ImageIcon, Upload, Download, 
  Loader2, CheckCircle2, Shield, Eye, Trash2, Layers, 
  Square, MousePointer2, Eraser, Save, Plus, RotateCcw,
  BarChart3, Zap, Smartphone, Code, CreditCard, Copy, Clipboard, RefreshCw, Wand2, LogOut, ArrowLeft, ArrowRight, Moon, Sun, MoreHorizontal
} from "lucide-react";
import { generateMultipleDLPackages, getAllStates, StateCode, DLPackage } from "./utils/dlGenerator";
import { loadOpenCV, createMask, dilateMask, inpaintImage } from "./utils/inpainting";
import { Login } from "./components/Login";

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
  type: "face" | "text" | "signature" | "code" | "background" | "custom" | "image";
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  visible: boolean;
  locked: boolean;
  opacity: number;
  text?: string;
  textColor?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  imageSrc?: string;
  crop?: { x: number; y: number; width: number; height: number };
}

interface ManagedFile {
  crop?: { x: number; y: number; width: number; height: number };
  id: string;
  name: string;
  originalUrl: string;
  inpaintedUrl: string | null; // Stores the inpainted/edited image
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
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
  const [selectedLayerDrag, setSelectedLayerDrag] = useState<{
    layerId: string;
    origin: { x: number; y: number };
    start: { x: number; y: number };
    crop: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [viewMode, setViewMode] = useState<"editor" | "preview">("editor");
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [canvasLayout, setCanvasLayout] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [layerResizeInfo, setLayerResizeInfo] = useState<{
    anchor: "nw" | "ne" | "se" | "sw";
    start: { x: number; y: number };
    layer: Layer;
    crop: { x: number; y: number; width: number; height: number };
  } | null>(null);

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
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const [clipboardLayer, setClipboardLayer] = useState<Layer | null>(null);
  const [clipboardIsBaseImage, setClipboardIsBaseImage] = useState(false);
  const [selectedBaseImage, setSelectedBaseImage] = useState(false);
  const imageCache = useRef<Record<string, HTMLImageElement>>({});

  const fontFamilies = [
    { label: "Orbitron", value: "Orbitron, sans-serif" },
    { label: "Space Mono", value: "Space Mono, monospace" },
    { label: "Audiowide", value: "Audiowide, sans-serif" },
    { label: "Michroma", value: "Michroma, sans-serif" },
    { label: "Major Mono Display", value: "Major Mono Display, monospace" },
    { label: "Electrolize", value: "Electrolize, sans-serif" },
    { label: "Pacifico (Signature)", value: "Pacifico, cursive" },
    { label: "Great Vibes (Signature)", value: "Great Vibes, cursive" },
    { label: "Caveat (Signature)", value: "Caveat, cursive" },
  ];

  const textStyles: Array<{ label: string; value: "normal" | "italic" | "oblique" }> = [
    { label: "Normal", value: "normal" },
    { label: "Italic", value: "italic" },
    { label: "Oblique", value: "oblique" },
  ];

  const fontWeights = [
    { label: "Regular", value: "400" },
    { label: "Medium", value: "500" },
    { label: "Semi Bold", value: "600" },
    { label: "Bold", value: "700" },
    { label: "Black", value: "900" },
  ];

  const updateSelectedLayer = (updates: Partial<Layer>) => {
    if (!selectedLayer) return;
    updateLayer(selectedLayer.id, updates);
  };

  const getLayerDisplayRect = (layer: Layer) => {
    if (!selectedFile || !canvasLayout.width || !canvasLayout.height) return null;
    const fileCrop = selectedFile.crop || { x: 0, y: 0, width: 1, height: 1 };
    const cropWidth = fileCrop.width || 1;
    const cropHeight = fileCrop.height || 1;
    const relativeX = (layer.x - fileCrop.x) / cropWidth;
    const relativeY = (layer.y - fileCrop.y) / cropHeight;
    const relativeW = layer.width / cropWidth;
    const relativeH = layer.height / cropHeight;

    return {
      x: relativeX * canvasLayout.width,
      y: relativeY * canvasLayout.height,
      width: relativeW * canvasLayout.width,
      height: relativeH * canvasLayout.height,
    };
  };

  const getTopLayerAtPoint = (x: number, y: number) => {
    if (!selectedFile) return null;
    return [...selectedFile.layers].reverse().find((layer) => {
      if (!layer.visible) return false;
      const rect = getLayerDisplayRect(layer);
      return rect ? x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height : false;
    }) || null;
  };

  const getResizeHandleAtPoint = (layer: Layer, x: number, y: number) => {
    const rect = getLayerDisplayRect(layer);
    if (!rect) return null;
    const handleSize = 12;
    const corners = {
      nw: { x: rect.x, y: rect.y },
      ne: { x: rect.x + rect.width, y: rect.y },
      sw: { x: rect.x, y: rect.y + rect.height },
      se: { x: rect.x + rect.width, y: rect.y + rect.height },
    } as const;

    for (const anchor of ["nw", "ne", "sw", "se"] as const) {
      const point = corners[anchor];
      if (Math.abs(x - point.x) <= handleSize && Math.abs(y - point.y) <= handleSize) {
        return anchor;
      }
    }
    return null;
  };

  const addSignatureLayer = (text = "Your Signature") => {
    if (!selectedFileId) return;
    const newLayer: Layer = {
      id: `signature-${Date.now()}`,
      name: "Signature Layer",
      type: "signature",
      x: 0.2,
      y: 0.2,
      width: 0.5,
      height: 0.15,
      visible: true,
      locked: false,
      opacity: 1,
      text,
      textColor: "#00f0ff",
      fontFamily: "Orbitron, sans-serif",
      fontSize: 46,
      fontWeight: "700",
      fontStyle: "normal",
    };

    pushSnapshot();
    clearRedoStack();
    setFiles((prev) => prev.map((f) =>
      f.id === selectedFileId
        ? { ...f, layers: [...f.layers, newLayer] }
        : f
    ));
    setSelectedLayerId(newLayer.id);
  };

  const openOverlayImagePicker = () => {
    overlayInputRef.current?.click();
  };

  type HistorySnapshot = {
    files: ManagedFile[];
    selectedFileId: string | null;
    selectedLayerId: string | null;
    editMode: "add" | "edit" | null;
    drawingLayer: "face" | "text" | "signature" | "code" | null;
    isRemovingText: boolean;
    selectedTextsToRemove: string[];
    isInpainting: boolean;
  };

  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);
  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;

  const cloneSnapshot = (snapshot: HistorySnapshot): HistorySnapshot => {
    return JSON.parse(JSON.stringify(snapshot));
  };

  const captureSnapshot = (): HistorySnapshot => cloneSnapshot({
    files,
    selectedFileId,
    selectedLayerId,
    editMode,
    drawingLayer,
    isRemovingText,
    selectedTextsToRemove,
    isInpainting,
  });

  const pushSnapshot = () => {
    setUndoStack((prev) => [...prev, captureSnapshot()]);
  };

  const clearRedoStack = () => {
    setRedoStack([]);
  };

  const restoreSnapshot = (snapshot: HistorySnapshot) => {
    setFiles(snapshot.files);
    setSelectedFileId(snapshot.selectedFileId);
    setSelectedLayerId(snapshot.selectedLayerId);
    setEditMode(snapshot.editMode);
    setDrawingLayer(snapshot.drawingLayer);
    setIsRemovingText(snapshot.isRemovingText);
    setSelectedTextsToRemove(snapshot.selectedTextsToRemove);
    setIsInpainting(snapshot.isInpainting);
  };

  const handleUndo = () => {
    if (!canUndo) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, captureSnapshot()]);
    restoreSnapshot(previous);
  };

  const handleRedo = () => {
    if (!canRedo) return;
    const nextState = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, captureSnapshot()]);
    restoreSnapshot(nextState);
  };

  const updateFilesWithHistory = (updater: (prev: ManagedFile[]) => ManagedFile[]) => {
    pushSnapshot();
    clearRedoStack();
    setFiles(updater);
  };

  const addTextLayer = (text = "New Text") => {
    if (!selectedFileId) return;
    const newLayer: Layer = {
      id: `text-${Date.now()}`,
      name: "Text Layer",
      type: "text",
      x: 0.1,
      y: 0.1,
      width: 0.35,
      height: 0.15,
      visible: true,
      locked: false,
      opacity: 1,
      text,
      textColor: "#00f0ff",
      fontFamily: "Space Mono, monospace",
      fontSize: 32,
      fontWeight: "700",
      fontStyle: "normal",
    };

    pushSnapshot();
    clearRedoStack();
    setFiles((prev) => prev.map((f) =>
      f.id === selectedFileId
        ? { ...f, layers: [...f.layers, newLayer] }
        : f
    ));
    setSelectedLayerId(newLayer.id);
  };

  const createImageLayer = (src: string) => {
    if (!selectedFileId) return;
    const newLayer: Layer = {
      id: `image-${Date.now()}`,
      name: "Overlay Image",
      type: "image",
      x: 0.1,
      y: 0.1,
      width: 0.4,
      height: 0.4,
      visible: true,
      locked: false,
      opacity: 1,
      imageSrc: src,
      crop: { x: 0, y: 0, width: 1, height: 1 },
    };

    pushSnapshot();
    clearRedoStack();
    setFiles((prev) => prev.map((f) =>
      f.id === selectedFileId
        ? { ...f, layers: [...f.layers, newLayer] }
        : f
    ));
    setSelectedLayerId(newLayer.id);
  };

  const handleOverlaySelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    createImageLayer(url);
    e.target.value = "";
  };

  const copyLayer = () => {
    if (selectedLayer) {
      setClipboardLayer(JSON.parse(JSON.stringify(selectedLayer)));
      setClipboardIsBaseImage(false);
      setSelectedBaseImage(false);
      return;
    }

    if (selectedBaseImage && selectedFile) {
      const baseImageSrc = selectedFile.inpaintedUrl || selectedFile.originalUrl;
      if (!baseImageSrc) return;
      const baseLayer: Layer = {
        id: `base-${Date.now()}`,
        name: "Background Image",
        type: "image",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        visible: true,
        locked: false,
        opacity: 1,
        imageSrc: baseImageSrc,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      };
      setClipboardLayer(baseLayer);
      setClipboardIsBaseImage(true);
    }
  };

  const cutLayer = () => {
    if (selectedLayer && selectedFile) {
      setClipboardLayer(JSON.parse(JSON.stringify(selectedLayer)));
      setClipboardIsBaseImage(false);
      pushSnapshot();
      clearRedoStack();
      setFiles((prev) => prev.map((f) =>
        f.id === selectedFileId
          ? { ...f, layers: f.layers.filter((layer) => layer.id !== selectedLayer.id) }
          : f
      ));
      setSelectedLayerId(null);
      return;
    }

    if (selectedBaseImage && selectedFile) {
      const baseImageSrc = selectedFile.inpaintedUrl || selectedFile.originalUrl;
      if (!baseImageSrc) return;
      const baseLayer: Layer = {
        id: `base-${Date.now()}`,
        name: "Background Image",
        type: "image",
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        visible: true,
        locked: false,
        opacity: 1,
        imageSrc: baseImageSrc,
        crop: { x: 0, y: 0, width: 1, height: 1 },
      };
      setClipboardLayer(baseLayer);
      setClipboardIsBaseImage(true);
      pushSnapshot();
      clearRedoStack();
      setFiles((prev) => prev.map((f) =>
        f.id === selectedFileId
          ? { ...f, crop: { x: 0, y: 0, width: 0, height: 0 } }
          : f
      ));
      setSelectedBaseImage(false);
    }
  };

  const pasteLayer = () => {
    if (!clipboardLayer || !selectedFileId) return;

    const pastedLayer = {
      ...JSON.parse(JSON.stringify(clipboardLayer)),
      id: `${clipboardLayer.id}-${Date.now()}`,
      x: Math.min(0.85, (clipboardLayer.x || 0) + 0.05),
      y: Math.min(0.85, (clipboardLayer.y || 0) + 0.05),
      name: `${clipboardLayer.name} Copy`,
    } as Layer;

    pushSnapshot();
    clearRedoStack();
    setFiles((prev) => prev.map((f) =>
      f.id === selectedFileId
        ? {
            ...f,
            layers: [...f.layers, pastedLayer],
            crop: clipboardIsBaseImage ? { x: 0, y: 0, width: 1, height: 1 } : f.crop,
          }
        : f
    ));
    setSelectedLayerId(pastedLayer.id);
    setClipboardIsBaseImage(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    if (selectedFiles.length === 0) return;

    pushSnapshot();
    clearRedoStack();

    selectedFiles.slice(0, 4 - files.length).forEach((f: File) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newFile: ManagedFile = {
        id,
        name: f.name,
        originalUrl: URL.createObjectURL(f),
        inpaintedUrl: null,
        crop: { x: 0, y: 0, width: 1, height: 1 },
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
            text: txt.content,
            textColor: "#ffffff",
            fontFamily: "Inter, system-ui, sans-serif",
            fontSize: 28,
            fontWeight: "600",
            fontStyle: "normal",
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

        pushSnapshot();
        clearRedoStack();
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
    pushSnapshot();
    clearRedoStack();
    setFiles((prev: ManagedFile[]) => prev.filter((f: ManagedFile) => f.id !== id));
    if (selectedFileId === id) setSelectedFileId(null);
  };

  // Check authentication on mount
  useEffect(() => {
    const isAuth = sessionStorage.getItem("isAuthenticated") === "true";
    setIsAuthenticated(isAuth);
  }, []);

  // Canvas drawing logic
  useEffect(() => {
    if (!selectedFile || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const getCachedImage = (src: string) => {
      if (!imageCache.current[src]) {
        const cached = new Image();
        cached.crossOrigin = "anonymous";
        cached.src = src;
        imageCache.current[src] = cached;
      }
      return imageCache.current[src];
    };

    // Redraw canvas whenever selected file or its layers change
    const drawCanvas = () => {
      const imageSrc = selectedFile.inpaintedUrl || selectedFile.originalUrl;
      if (!imageSrc) return;

      const img = getCachedImage(imageSrc);
      const renderCanvas = () => {
        if (!img.complete || img.naturalWidth === 0) return;

        const container = stageRef.current;
        if (!container) return;

        const ratio = img.width / img.height;
        const targetWidth = Math.min(container.clientWidth, 900);
        canvas.width = targetWidth;
        canvas.height = targetWidth / ratio;

        const fileCrop = selectedFile.crop || { x: 0, y: 0, width: 1, height: 1 };
        const cropWidth = fileCrop.width || 1;
        const cropHeight = fileCrop.height || 1;
        const sx = Math.max(0, Math.min(img.width, fileCrop.x * img.width));
        const sy = Math.max(0, Math.min(img.height, fileCrop.y * img.height));
        const sw = Math.max(1, Math.min(img.width - sx, cropWidth * img.width));
        const sh = Math.max(1, Math.min(img.height - sy, cropHeight * img.height));

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.filter = `brightness(${1 + selectedFile.adjustments.brightness * 0.1}) contrast(${1 + selectedFile.adjustments.contrast * 0.1}) saturate(${1 + selectedFile.adjustments.saturation * 0.1})`;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        ctx.filter = "none";

        // Draw layers
        selectedFile.layers.forEach((layer: Layer) => {
          if (!layer.visible) return;

          const relativeX = (layer.x - fileCrop.x) / cropWidth;
          const relativeY = (layer.y - fileCrop.y) / cropHeight;
          const relativeW = layer.width / cropWidth;
          const relativeH = layer.height / cropHeight;
          const x = relativeX * canvas.width;
          const y = relativeY * canvas.height;
          const w = relativeW * canvas.width;
          const h = relativeH * canvas.height;

          if (layer.type === "image" && layer.imageSrc) {
            const overlay = getCachedImage(layer.imageSrc);
            const drawOverlay = () => {
              if (!overlay.complete || overlay.naturalWidth === 0) return;
              const crop = layer.crop || { x: 0, y: 0, width: 1, height: 1 };
              const sx = crop.x * overlay.width;
              const sy = crop.y * overlay.height;
              const sw = crop.width * overlay.width;
              const sh = crop.height * overlay.height;

              ctx.save();
              ctx.globalAlpha = layer.opacity;
              ctx.drawImage(overlay, sx, sy, sw, sh, x, y, w, h);
              ctx.restore();
            };

            if (overlay.complete && overlay.naturalWidth > 0) {
              drawOverlay();
            } else {
              overlay.onload = () => {
                if (canvasRef.current) drawCanvas();
              };
            }
            return;
          }

          if ((layer.type === "text" || layer.type === "signature") && layer.text) {
            const fontFamily = layer.fontFamily || (layer.type === "signature" ? "Great Vibes" : "Inter");
            const fontSize = layer.fontSize || (layer.type === "signature" ? 38 : 28);
            const fontWeight = layer.fontWeight || "bold";
            const fontStyle = layer.fontStyle || "normal";
            const textColor = layer.textColor || "#ffffff";
            const text = layer.text;

            ctx.save();
            ctx.globalAlpha = layer.opacity;
            ctx.fillStyle = textColor;
            ctx.strokeStyle = "rgba(0,0,0,0.25)";
            ctx.lineWidth = 2;
            ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
            ctx.textBaseline = "top";
            ctx.textAlign = "left";
            const textX = x + 10;
            const textY = y + 10;
            ctx.strokeText(text, textX, textY);
            ctx.fillText(text, textX, textY);
            ctx.restore();

            if (selectedLayer?.id === layer.id) {
              ctx.strokeStyle = "rgba(255,255,255,0.8)";
              ctx.lineWidth = 2;
              ctx.setLineDash([5, 5]);
              ctx.strokeRect(x, y, w, h);
              ctx.setLineDash([]);
            }

            return;
          }

          ctx.globalAlpha = layer.opacity;
          const colors = {
            face: { fill: "rgba(59, 130, 246, 0.3)", stroke: "#3b82f6" },
            text: { fill: "rgba(239, 68, 68, 0.3)", stroke: "#ef4444" },
            signature: { fill: "rgba(168, 85, 247, 0.3)", stroke: "#a855f7" },
            code: { fill: "rgba(34, 197, 94, 0.3)", stroke: "#22c55e" },
            background: { fill: "rgba(234, 179, 8, 0.3)", stroke: "#eab308" },
            custom: { fill: "rgba(107, 114, 128, 0.3)", stroke: "#6b7280" },
          };

          const color = colors[layer.type as keyof typeof colors] || colors.custom;
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
        if (selectedBaseImage && !selectedLayer) {
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.8)";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.strokeRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }

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

      if (!img.complete || img.naturalWidth === 0) {
        img.onload = renderCanvas;
      }
      renderCanvas();

      img.onerror = () => {
        console.error("Failed to load image:", selectedFile.originalUrl);
      };
    };

    drawCanvas();
  }, [selectedFile, selectedLayer, selectedBaseImage, isDragging, dragStart, currentDrag, drawingLayer]);

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

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const updateLayout = () => {
      if (!canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      setCanvasLayout({ width: rect.width, height: rect.height });
    };

    updateLayout();
    window.addEventListener("resize", updateLayout);

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateLayout) : null;
    if (observer && canvasRef.current) observer.observe(canvasRef.current);

    return () => {
      window.removeEventListener("resize", updateLayout);
      if (observer && canvasRef.current) observer.disconnect();
    };
  }, [selectedFile]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!canvasRef.current || !selectedFile) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const clickedLayer = getTopLayerAtPoint(x * canvasLayout.width, y * canvasLayout.height);
    if (clickedLayer) {
      setSelectedBaseImage(false);
      if (selectedLayerId !== clickedLayer.id) {
        setSelectedLayerId(clickedLayer.id);
      }

      if (!clickedLayer.locked && clickedLayer.type === "image") {
        const handle = getResizeHandleAtPoint(clickedLayer, x * canvasLayout.width, y * canvasLayout.height);
        if (handle) {
          const fileCrop = selectedFile.crop || { x: 0, y: 0, width: 1, height: 1 };
          pushSnapshot();
          clearRedoStack();
          setLayerResizeInfo({
            anchor: handle,
            start: { x, y },
            layer: clickedLayer,
            crop: fileCrop,
          });
          setIsDragging(true);
          return;
        }
      }

      if (!editMode && !clickedLayer.locked) {
        const fileCrop = selectedFile.crop || { x: 0, y: 0, width: 1, height: 1 };
        const cropWidth = fileCrop.width || 1;
        const cropHeight = fileCrop.height || 1;
        const displayStartX = (clickedLayer.x - fileCrop.x) / cropWidth;
        const displayStartY = (clickedLayer.y - fileCrop.y) / cropHeight;

        pushSnapshot();
        clearRedoStack();
        setSelectedLayerDrag({
          layerId: clickedLayer.id,
          origin: { x, y },
          start: { x: displayStartX, y: displayStartY },
          crop: fileCrop,
        });
        setIsDragging(true);
        return;
      }
    }

    if (!clickedLayer) {
      setSelectedLayerId(null);
      setSelectedBaseImage(true);
    }

    if (!editMode || !drawingLayer) return;

    setDragStart({ x, y });
    setCurrentDrag({ x, y });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentDrag({ x, y });

    if (layerResizeInfo && selectedFile) {
      const fileCrop = layerResizeInfo.crop || selectedFile.crop || { x: 0, y: 0, width: 1, height: 1 };
      const cropWidth = fileCrop.width || 1;
      const cropHeight = fileCrop.height || 1;
      const dx = x - layerResizeInfo.start.x;
      const dy = y - layerResizeInfo.start.y;
      const original = layerResizeInfo.layer;
      const updates: Partial<Layer> = {};

      if (layerResizeInfo.anchor === "se") {
        updates.width = Math.max(0.05, original.width + dx * cropWidth);
        updates.height = Math.max(0.05, original.height + dy * cropHeight);
      } else if (layerResizeInfo.anchor === "sw") {
        updates.x = Math.min(1 - original.width, Math.max(0, original.x + dx * cropWidth));
        updates.width = Math.max(0.05, original.width - dx * cropWidth);
        updates.height = Math.max(0.05, original.height + dy * cropHeight);
      } else if (layerResizeInfo.anchor === "ne") {
        updates.y = Math.min(1 - original.height, Math.max(0, original.y + dy * cropHeight));
        updates.width = Math.max(0.05, original.width + dx * cropWidth);
        updates.height = Math.max(0.05, original.height - dy * cropHeight);
      } else if (layerResizeInfo.anchor === "nw") {
        updates.x = Math.min(1 - original.width, Math.max(0, original.x + dx * cropWidth));
        updates.y = Math.min(1 - original.height, Math.max(0, original.y + dy * cropHeight));
        updates.width = Math.max(0.05, original.width - dx * cropWidth);
        updates.height = Math.max(0.05, original.height - dy * cropHeight);
      }

      setFiles((prev) => prev.map((file) => {
        if (file.id !== selectedFileId) return file;
        return {
          ...file,
          layers: file.layers.map((layer) =>
            layer.id === layerResizeInfo.layer.id ? { ...layer, ...updates } : layer
          ),
        };
      }));
      return;
    }

    if (selectedLayerDrag && selectedFile) {
      const draggedLayer = selectedFile.layers.find((layer) => layer.id === selectedLayerDrag.layerId);
      if (!draggedLayer) return;

      const crop = selectedLayerDrag.crop || selectedFile.crop || { x: 0, y: 0, width: 1, height: 1 };
      const cropWidth = crop.width || 1;
      const cropHeight = crop.height || 1;
      const deltaX = x - selectedLayerDrag.origin.x;
      const deltaY = y - selectedLayerDrag.origin.y;
      const displayWidth = (draggedLayer.width || 0) / cropWidth;
      const displayHeight = (draggedLayer.height || 0) / cropHeight;
      const displayX = Math.max(0, Math.min(1 - displayWidth, selectedLayerDrag.start.x + deltaX));
      const displayY = Math.max(0, Math.min(1 - displayHeight, selectedLayerDrag.start.y + deltaY));
      const updatedLayerX = crop.x + displayX * cropWidth;
      const updatedLayerY = crop.y + displayY * cropHeight;

      setFiles((prev) => prev.map((file) => {
        if (file.id !== selectedFileId) return file;
        return {
          ...file,
          layers: file.layers.map((layer) =>
            layer.id === selectedLayerDrag.layerId ? { ...layer, x: updatedLayerX, y: updatedLayerY } : layer
          ),
        };
      }));

      return;
    }
  };

  const handleMouseUp = () => {
    if (selectedLayerDrag) {
      setSelectedLayerDrag(null);
      setIsDragging(false);
      setDragStart(null);
      setCurrentDrag(null);
      return;
    }

    if (layerResizeInfo) {
      setLayerResizeInfo(null);
      setIsDragging(false);
      setDragStart(null);
      setCurrentDrag(null);
      return;
    }

    if (!isDragging || !dragStart || !currentDrag || !editMode || !selectedFile || !drawingLayer) {
      setIsDragging(false);
      setDragStart(null);
      setCurrentDrag(null);
      return;
    }

    const x = Math.min(dragStart.x, currentDrag.x);
    const y = Math.min(dragStart.y, currentDrag.y);
    const width = Math.abs(currentDrag.x - dragStart.x);
    const height = Math.abs(currentDrag.y - dragStart.y);
    const fileCrop = selectedFile.crop || { x: 0, y: 0, width: 1, height: 1 };

    if (width > 0.01 && height > 0.01) {
      const xOriginal = fileCrop.x + x * fileCrop.width;
      const yOriginal = fileCrop.y + y * fileCrop.height;
      const widthOriginal = width * fileCrop.width;
      const heightOriginal = height * fileCrop.height;
      const newLayer: Layer = {
        id: `layer-${Date.now()}`,
        name: `${drawingLayer.charAt(0).toUpperCase() + drawingLayer.slice(1)} ${selectedFile.layers.length + 1}`,
        type: drawingLayer as any,
        x: xOriginal,
        y: yOriginal,
        width: widthOriginal,
        height: heightOriginal,
        visible: true,
        locked: false,
        opacity: 1,
      };
      
      pushSnapshot();
      clearRedoStack();
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
    if (!selectedFile) return;
    
    const layer = selectedFile.layers.find(l => l.id === layerId);
    if (!layer) return;

    // Check if OpenCV is loaded for inpainting
    if (!openCVLoaded) {
      alert("OpenCV is still loading. Please try again in a moment.");
      return;
    }

    setIsInpainting(true);
    try {
      // Load the current image (original or inpainted)
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = selectedFile.inpaintedUrl || selectedFile.originalUrl;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // Create a full-resolution canvas with the current image
      const fullCanvas = document.createElement("canvas");
      fullCanvas.width = img.width;
      fullCanvas.height = img.height;
      const fullCtx = fullCanvas.getContext("2d");
      if (!fullCtx) throw new Error("Failed to get full canvas context");
      fullCtx.drawImage(img, 0, 0);

      // Create mask from the layer area
      const regions = [{
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height
      }];

      console.log(`Creating mask for layer: ${layer.name} at full resolution`);
      const maskCanvas = createMask(fullCanvas.width, fullCanvas.height, regions);
      
      console.log("Dilating mask...");
      const dilatedMask = dilateMask(maskCanvas, 2);

      // Perform inpainting on full resolution
      console.log("Starting inpainting process...");
      const inpaintedCanvas = await inpaintImage({
        canvas: fullCanvas,
        mask: dilatedMask,
        method: "telea",
      });

      console.log("Inpainting complete, saving result...");
      
      // Convert inpainted canvas to data URL
      const inpaintedUrl = inpaintedCanvas.toDataURL("image/png", 1.0);
      
      // Update file with new inpainted URL and remove the layer
      pushSnapshot();
      clearRedoStack();
      setFiles((prev: ManagedFile[]) =>
        prev.map((f: ManagedFile) =>
          f.id === selectedFileId
            ? {
                ...f,
                inpaintedUrl: inpaintedUrl,
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
    updateFilesWithHistory((prev: ManagedFile[]) => prev.map((f: ManagedFile) => 
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
    if (!selectedFile || selectedTextsToRemove.length === 0) return;
    if (!openCVLoaded) {
      alert("OpenCV is still loading. Please try again in a moment.");
      return;
    }

    setIsInpainting(true);
    try {
      // Load the current image (original or inpainted)
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = selectedFile.inpaintedUrl || selectedFile.originalUrl;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // Create a full-resolution canvas with the current image
      const fullCanvas = document.createElement("canvas");
      fullCanvas.width = img.width;
      fullCanvas.height = img.height;
      const fullCtx = fullCanvas.getContext("2d");
      if (!fullCtx) throw new Error("Failed to get full canvas context");
      fullCtx.drawImage(img, 0, 0);

      // Get text layers to remove
      const textLayers = selectedFile.layers.filter(
        l => l.type === "text" && selectedTextsToRemove.includes(l.id)
      );

      if (textLayers.length === 0) {
        throw new Error("No valid text layers selected");
      }

      console.log(`Creating mask for ${textLayers.length} text layers at full resolution...`);
      const maskCanvas = createMask(fullCanvas.width, fullCanvas.height, textLayers);
      
      console.log("Dilating mask...");
      const dilatedMask = dilateMask(maskCanvas, 3);

      // Perform inpainting on full resolution
      console.log("Starting inpainting process...");
      const inpaintedCanvas = await inpaintImage({
        canvas: fullCanvas,
        mask: dilatedMask,
        method: "telea",
      });

      console.log("Inpainting complete, saving result...");
      
      // Convert inpainted canvas to data URL
      const inpaintedUrl = inpaintedCanvas.toDataURL("image/png", 1.0);
      
      // Update file with new inpainted URL and remove text layers
      pushSnapshot();
      clearRedoStack();
      setFiles((prev: ManagedFile[]) =>
        prev.map((f: ManagedFile) =>
          f.id === selectedFileId
            ? {
                ...f,
                inpaintedUrl: inpaintedUrl,
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
                    image: "rgba(102, 204, 255, 0.6)",
                  };
                  lctx.fillStyle = colors[layer.type as keyof typeof colors] || colors.custom;
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
    <>
      {!isAuthenticated ? (
        <Login onLoginSuccess={() => setIsAuthenticated(true)} />
      ) : (
        <div data-theme={theme} className="min-h-screen bg-[var(--bg)] text-[var(--text)] font-sans selection:bg-blue-500/30 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-[var(--panel-border)] bg-[var(--surface)]/80 backdrop-blur-xl z-50 shrink-0">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-4 sm:py-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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
          
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setViewMode(viewMode === "editor" ? "preview" : "editor")}
              className="flex items-center gap-1 bg-neutral-800/80 border border-neutral-700 text-neutral-200 px-2 py-1 rounded-full text-[8px] font-bold uppercase transition hover:bg-neutral-700"
              title={viewMode === "editor" ? "Switch to preview" : "Switch to editor"}
            >
              {viewMode === "editor" ? <Eye className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
              <span>{viewMode === "editor" ? "Preview" : "Editor"}</span>
            </button>

            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex items-center gap-1 bg-neutral-800/80 border border-neutral-700 text-neutral-200 px-2 py-1 rounded-full text-[8px] font-bold uppercase transition hover:bg-neutral-700"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
              <span>{theme === "dark" ? "Light" : "Dark"}</span>
            </button>

            <div className="flex items-center gap-1 bg-[var(--panel)] rounded-full p-1 border border-[var(--panel-border)]">
              <button
                title="Pointer mode"
                onClick={() => setEditMode(null)}
                className={`p-1 rounded-full transition ${!editMode ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}
              >
                <MousePointer2 className="w-4 h-4" />
              </button>
              <button
                title="Face region"
                onClick={() => { setEditMode("add"); setDrawingLayer("face"); }}
                className={`p-1 rounded-full transition ${editMode === "add" && drawingLayer === "face" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"}`}
              >
                <User className="w-4 h-4" />
              </button>
              <button
                title="Text region"
                onClick={() => { setEditMode("add"); setDrawingLayer("text"); }}
                className={`p-1 rounded-full transition ${editMode === "add" && drawingLayer === "text" ? "bg-red-600 text-white" : "text-neutral-400 hover:text-white"}`}
              >
                <FileText className="w-4 h-4" />
              </button>
              <button
                title="Signature region"
                onClick={() => { setEditMode("add"); setDrawingLayer("signature"); }}
                className={`p-1 rounded-full transition ${editMode === "add" && drawingLayer === "signature" ? "bg-purple-600 text-white" : "text-neutral-400 hover:text-white"}`}
              >
                <Eraser className="w-4 h-4" />
              </button>
              <button
                title="Code region"
                onClick={() => { setEditMode("add"); setDrawingLayer("code"); }}
                className={`p-1 rounded-full transition ${editMode === "add" && drawingLayer === "code" ? "bg-green-600 text-white" : "text-neutral-400 hover:text-white"}`}
              >
                <Code className="w-4 h-4" />
              </button>
              <button
                title="Remove text"
                onClick={() => setIsRemovingText(!isRemovingText)}
                disabled={!selectedFile || !openCVLoaded}
                className={`p-1 rounded-full transition disabled:opacity-50 ${isRemovingText ? "bg-amber-600 text-white" : "text-neutral-400 hover:text-white"}`}
              >
                <Wand2 className="w-4 h-4" />
              </button>
            </div>

            <button
              title="Add overlay image"
              onClick={openOverlayImagePicker}
              disabled={!selectedFile}
              className="p-2 rounded-full bg-neutral-800/80 border border-neutral-700 text-neutral-200 transition hover:bg-neutral-700"
            >
              <Upload className="w-4 h-4" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowHeaderMenu((prev) => !prev)}
                className="p-2 rounded-full bg-neutral-800/80 border border-neutral-700 text-neutral-200 transition hover:bg-neutral-700"
                title="More actions"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showHeaderMenu && (
                <div className="absolute right-0 mt-2 w-60 rounded-3xl bg-[var(--surface)] border border-[var(--panel-border)] shadow-2xl p-2 z-50">
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => addTextLayer("New Text")}
                      disabled={!selectedFile}
                      className="flex items-center gap-2 px-2 py-2 rounded-xl bg-neutral-900/80 text-[10px] font-bold uppercase border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Text
                    </button>
                    <button
                      type="button"
                      onClick={() => addSignatureLayer()}
                      disabled={!selectedFile}
                      className="flex items-center gap-2 px-2 py-2 rounded-xl bg-neutral-900/80 text-[10px] font-bold uppercase border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      <Eraser className="w-3.5 h-3.5" />
                      Sign
                    </button>
                    <button
                      type="button"
                      onClick={copyLayer}
                      disabled={!selectedLayer && !selectedBaseImage}
                      className="flex items-center gap-2 px-2 py-2 rounded-xl bg-neutral-900/80 text-[10px] font-bold uppercase border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={cutLayer}
                      disabled={!selectedLayer && !selectedBaseImage}
                      className="flex items-center gap-2 px-2 py-2 rounded-xl bg-neutral-900/80 text-[10px] font-bold uppercase border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Cut
                    </button>
                    <button
                      type="button"
                      onClick={pasteLayer}
                      disabled={!clipboardLayer || !selectedFile}
                      className="flex items-center gap-2 px-2 py-2 rounded-xl bg-neutral-900/80 text-[10px] font-bold uppercase border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                      Paste
                    </button>
                    {selectedBaseImage && !selectedLayer && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400 text-emerald-200 text-[10px] font-semibold uppercase">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-400" />
                        Background image selected
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={!canUndo}
                      className="flex items-center gap-2 px-2 py-2 rounded-xl bg-neutral-900/80 text-[10px] font-bold uppercase border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Undo
                    </button>
                    <button
                      type="button"
                      onClick={handleRedo}
                      disabled={!canRedo}
                      className="flex items-center gap-2 px-2 py-2 rounded-xl bg-neutral-900/80 text-[10px] font-bold uppercase border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Redo
                    </button>
                    <button
                      type="button"
                      onClick={() => exportAsset("png")}
                      disabled={!selectedFile || isExporting}
                      className="flex items-center gap-2 px-2 py-2 rounded-xl bg-neutral-900/80 text-[10px] font-bold uppercase border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      PNG
                    </button>
                    <button
                      type="button"
                      onClick={() => exportAsset("jpg")}
                      disabled={!selectedFile || isExporting}
                      className="flex items-center gap-2 px-2 py-2 rounded-xl bg-neutral-900/80 text-[10px] font-bold uppercase border border-neutral-700 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      JPG
                    </button>
                    <button
                      type="button"
                      onClick={() => exportAsset("psd")}
                      disabled={!selectedFile || isExporting}
                      className="flex items-center gap-2 px-2 py-2 rounded-xl bg-blue-600 text-[10px] font-bold uppercase border border-blue-500 text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PSD
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                sessionStorage.removeItem("isAuthenticated");
                setIsAuthenticated(false);
              }}
              className="p-2 rounded-full bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 transition border border-red-500/30"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                sessionStorage.removeItem("isAuthenticated");
                setIsAuthenticated(false);
              }}
              className="flex items-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 hover:text-red-300 px-3 py-2 rounded-lg text-[9px] font-bold uppercase transition-all border border-red-500/30 ml-2"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main UI */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Sidebar: File Browser */}
        <div className={viewMode === "preview" ? "hidden" : "w-full lg:w-72 border-r border-[var(--panel-border)] bg-[var(--surface)] flex flex-col shrink-0"}>
          <div className="p-4 border-b border-neutral-800/50 flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em]">Photo Library</span>
            <span className="bg-[var(--panel)] border border-[var(--panel-border)] text-[10px] text-[var(--muted)] px-2 py-0.5 rounded font-mono">{files.length}/4</span>
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
          <input type="file" ref={overlayInputRef} onChange={handleOverlaySelect} className="hidden" accept="image/*" />
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 bg-[var(--bg)] relative overflow-hidden flex items-center justify-center p-4 lg:p-8">
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
                draggable={false}
                style={{ touchAction: "none", WebkitUserDrag: "none" }}
                className={`w-full block h-auto ${editMode ? "cursor-crosshair" : "cursor-default"}`}
              />
              {selectedLayer?.type === "image" && canvasLayout.width > 0 && canvasLayout.height > 0 && (() => {
                const rect = getLayerDisplayRect(selectedLayer);
                if (!rect) return null;
                const handles = [
                  { key: "nw", left: rect.x, top: rect.y },
                  { key: "ne", left: rect.x + rect.width, top: rect.y },
                  { key: "sw", left: rect.x, top: rect.y + rect.height },
                  { key: "se", left: rect.x + rect.width, top: rect.y + rect.height },
                ];

                return (
                  <div className="absolute inset-0 pointer-events-none">
                    <div
                      className="absolute rounded-xl border border-blue-500/70"
                      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
                    />
                    {handles.map((handle) => (
                      <div
                        key={handle.key}
                        className="absolute w-3 h-3 rounded-full bg-blue-500 border-2 border-white shadow-lg"
                        style={{ left: handle.left, top: handle.top, transform: "translate(-50%, -50%)" }}
                      />
                    ))}
                  </div>
                );
              })()}
              
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
        <div className={viewMode === "preview" ? "hidden" : "w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-[var(--panel-border)] bg-[var(--surface)] p-4 lg:p-6 space-y-8 shrink-0 overflow-y-auto"}>
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
                    onChange={(e) => updateFilesWithHistory(prev => prev.map(f => 
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
                    onChange={(e) => updateFilesWithHistory(prev => prev.map(f => 
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
                    onChange={(e) => updateFilesWithHistory(prev => prev.map(f => 
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

          {/* Base Image Controls */}
          {selectedBaseImage && selectedFile && !selectedLayer && (
            <div className="space-y-4 p-4 rounded-2xl bg-neutral-900/30 border border-neutral-800">
              <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.2em]">Base Image Edit</h4>
              <div className="space-y-3">
                <div>
                  <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Crop X</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedFile.crop?.x ?? 0}
                    onChange={(e) => updateFilesWithHistory(prev => prev.map(f =>
                      f.id === selectedFileId
                        ? { ...f, crop: { ...f.crop, x: Number(e.target.value) } }
                        : f
                    ))}
                    className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                  />
                  <span className="text-[8px] text-neutral-600">{((selectedFile.crop?.x ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Crop Y</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedFile.crop?.y ?? 0}
                    onChange={(e) => updateFilesWithHistory(prev => prev.map(f =>
                      f.id === selectedFileId
                        ? { ...f, crop: { ...f.crop, y: Number(e.target.value) } }
                        : f
                    ))}
                    className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                  />
                  <span className="text-[8px] text-neutral-600">{((selectedFile.crop?.y ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Crop Width</label>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.01"
                      value={selectedFile.crop?.width ?? 1}
                      onChange={(e) => updateFilesWithHistory(prev => prev.map(f =>
                        f.id === selectedFileId
                          ? { ...f, crop: { ...f.crop, width: Number(e.target.value) } }
                          : f
                      ))}
                      className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                    />
                    <span className="text-[8px] text-neutral-600">{((selectedFile.crop?.width ?? 1) * 100).toFixed(0)}%</span>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Crop Height</label>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.01"
                      value={selectedFile.crop?.height ?? 1}
                      onChange={(e) => updateFilesWithHistory(prev => prev.map(f =>
                        f.id === selectedFileId
                          ? { ...f, crop: { ...f.crop, height: Number(e.target.value) } }
                          : f
                      ))}
                      className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                    />
                    <span className="text-[8px] text-neutral-600">{((selectedFile.crop?.height ?? 1) * 100).toFixed(0)}%</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateFilesWithHistory(prev => prev.map(f =>
                    f.id === selectedFileId
                      ? { ...f, crop: { x: 0, y: 0, width: 1, height: 1 } }
                      : f
                  ))}
                  className="w-full py-2 rounded-xl bg-blue-600/15 border border-blue-500 text-[10px] font-bold uppercase text-blue-200 hover:bg-blue-600/25"
                >
                  Reset Base Crop
                </button>
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
                <div className="p-6 rounded-2xl bg-[var(--panel)]/80 border border-dashed border-[var(--panel-border)] flex flex-col items-center justify-center text-center">
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
                        : "bg-[var(--panel)]/90 border-[var(--panel-border)] hover:border-[var(--text)]/20"
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
                        image: "bg-cyan-500/10 text-cyan-500",
                      }[layer.type]
                    }`}>
                      {{
                        face: <User className="w-4 h-4" />,
                        text: <FileText className="w-4 h-4" />,
                        signature: <Eraser className="w-4 h-4" />,
                        code: <Code className="w-4 h-4" />,
                        background: <ImageIcon className="w-4 h-4" />,
                        custom: <Square className="w-4 h-4" />,
                        image: <ImageIcon className="w-4 h-4" />,
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

                <div className="space-y-4 pt-2 border-t border-neutral-800/70">
                  {selectedLayer.type === "text" || selectedLayer.type === "signature" ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Text</label>
                        <textarea
                          value={selectedLayer.text || ""}
                          onChange={(e) => updateSelectedLayer({ text: e.target.value })}
                          className="w-full min-h-[80px] p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-[11px] text-neutral-200 focus:outline-none focus:border-blue-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Font</label>
                          <select
                            value={selectedLayer.fontFamily || fontFamilies[0].value}
                            onChange={(e) => updateSelectedLayer({ fontFamily: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-[10px] text-neutral-200 focus:outline-none focus:border-blue-500"
                          >
                            {fontFamilies.map((font) => (
                              <option key={font.value} value={font.value}>{font.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Color</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={selectedLayer.textColor || "#ffffff"}
                              onChange={(e) => updateSelectedLayer({ textColor: e.target.value })}
                              className="w-12 h-10 p-0 border border-neutral-700 rounded-lg cursor-pointer"
                            />
                            <span className="text-[10px] text-neutral-300 font-mono">{selectedLayer.textColor || "#ffffff"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Size</label>
                          <input
                            type="range"
                            min="12"
                            max="120"
                            value={selectedLayer.fontSize || 28}
                            onChange={(e) => updateSelectedLayer({ fontSize: Number(e.target.value) })}
                            className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                          />
                          <span className="text-[8px] text-neutral-600">{selectedLayer.fontSize || 28}px</span>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Weight</label>
                          <select
                            value={selectedLayer.fontWeight || "600"}
                            onChange={(e) => updateSelectedLayer({ fontWeight: e.target.value })}
                            className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-[10px] text-neutral-200 focus:outline-none focus:border-blue-500"
                          >
                            {fontWeights.map((weight) => (
                              <option key={weight.value} value={weight.value}>{weight.label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Style</label>
                          <select
                            value={selectedLayer.fontStyle || "normal"}
                            onChange={(e) => updateSelectedLayer({ fontStyle: e.target.value as "normal" | "italic" | "oblique" })}
                            className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-[10px] text-neutral-200 focus:outline-none focus:border-blue-500"
                          >
                            {textStyles.map((style) => (
                              <option key={style.value} value={style.value}>{style.label}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {selectedLayer.type === "image" ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Overlay Image</label>
                        <button
                          onClick={openOverlayImagePicker}
                          className="w-full py-2 px-3 rounded-xl bg-neutral-800 border border-neutral-700 text-[10px] font-bold uppercase text-neutral-200 hover:bg-neutral-700"
                        >Replace Image</button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Crop X</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={selectedLayer.crop?.x ?? 0}
                            onChange={(e) => {
                            const crop = selectedLayer.crop || { x: 0, y: 0, width: 1, height: 1 };
                            updateSelectedLayer({ crop: { ...crop, x: Number(e.target.value) } });
                          }}
                            className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                          />
                          <span className="text-[8px] text-neutral-600">{((selectedLayer.crop?.x ?? 0) * 100).toFixed(0)}%</span>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Crop Y</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={selectedLayer.crop?.y ?? 0}
                            onChange={(e) => {
                            const crop = selectedLayer.crop || { x: 0, y: 0, width: 1, height: 1 };
                            updateSelectedLayer({ crop: { ...crop, y: Number(e.target.value) } });
                          }}
                            className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                          />
                          <span className="text-[8px] text-neutral-600">{((selectedLayer.crop?.y ?? 0) * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Crop Width</label>
                          <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.01"
                            value={selectedLayer.crop?.width ?? 1}
                            onChange={(e) => {
                            const crop = selectedLayer.crop || { x: 0, y: 0, width: 1, height: 1 };
                            updateSelectedLayer({ crop: { ...crop, width: Number(e.target.value) } });
                          }}
                            className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                          />
                          <span className="text-[8px] text-neutral-600">{((selectedLayer.crop?.width ?? 1) * 100).toFixed(0)}%</span>
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Crop Height</label>
                          <input
                            type="range"
                            min="0.1"
                            max="1"
                            step="0.01"
                            value={selectedLayer.crop?.height ?? 1}
                            onChange={(e) => {
                            const crop = selectedLayer.crop || { x: 0, y: 0, width: 1, height: 1 };
                            updateSelectedLayer({ crop: { ...crop, height: Number(e.target.value) } });
                          }}
                            className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                          />
                          <span className="text-[8px] text-neutral-600">{((selectedLayer.crop?.height ?? 1) * 100).toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-3">
                    <div>
                      <label className="text-[9px] font-bold text-neutral-500 uppercase mb-1 block">Position & Size</label>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[8px] uppercase tracking-[0.2em] text-neutral-500">X</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.005"
                            value={selectedLayer.x}
                            onChange={(e) => updateSelectedLayer({ x: Number(e.target.value) })}
                            className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                          />
                          <span className="text-[8px] text-neutral-600">{(selectedLayer.x * 100).toFixed(1)}%</span>
                        </div>
                        <div>
                          <label className="text-[8px] uppercase tracking-[0.2em] text-neutral-500">Y</label>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.005"
                            value={selectedLayer.y}
                            onChange={(e) => updateSelectedLayer({ y: Number(e.target.value) })}
                            className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                          />
                          <span className="text-[8px] text-neutral-600">{(selectedLayer.y * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 pt-3">
                        <div>
                          <label className="text-[8px] uppercase tracking-[0.2em] text-neutral-500">Width</label>
                          <input
                            type="range"
                            min="0.05"
                            max="1"
                            step="0.005"
                            value={selectedLayer.width}
                            onChange={(e) => updateSelectedLayer({ width: Number(e.target.value) })}
                            className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                          />
                          <span className="text-[8px] text-neutral-600">{(selectedLayer.width * 100).toFixed(1)}%</span>
                        </div>
                        <div>
                          <label className="text-[8px] uppercase tracking-[0.2em] text-neutral-500">Height</label>
                          <input
                            type="range"
                            min="0.05"
                            max="1"
                            step="0.005"
                            value={selectedLayer.height}
                            onChange={(e) => updateSelectedLayer({ height: Number(e.target.value) })}
                            className="w-full h-1 bg-neutral-800 rounded-full accent-blue-500"
                          />
                          <span className="text-[8px] text-neutral-600">{(selectedLayer.height * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
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

          {/* Image Editing Status */}
          {selectedFile && selectedFile.inpaintedUrl && (
            <div className="p-4 rounded-xl bg-green-900/20 border border-green-700/50 space-y-3">
              <h4 className="text-[10px] font-bold text-green-600 uppercase tracking-[0.2em] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Edit History
              </h4>
              <p className="text-[8px] text-green-700">Image has been edited with inpainting</p>
              <button 
                onClick={() => {
                  pushSnapshot();
                  clearRedoStack();
                  setFiles((prev: ManagedFile[]) =>
                    prev.map((f: ManagedFile) =>
                      f.id === selectedFileId
                        ? { ...f, inpaintedUrl: null }
                        : f
                    )
                  );
                  console.log("Reset to original image");
                }}
                className="w-full py-2 px-3 rounded-lg text-[9px] font-bold uppercase transition-all border bg-neutral-800/50 border-neutral-700 text-neutral-400 hover:text-neutral-300 hover:border-neutral-600"
              >
                <RotateCcw className="w-3 h-3 inline mr-1" />
                Reset to Original
              </button>
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
          <div className="p-4 rounded-xl bg-[var(--panel)]/80 border border-[var(--panel-border)] space-y-4">
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
      )}
    </>
  );
}
