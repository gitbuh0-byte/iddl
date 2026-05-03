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
import { loadOpenCV, createMask, removeMaskedRegionPreserveBackground } from "./utils/inpainting";
import { analyzeImageWithOpenCV } from "./utils/opencvAnalysis";
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

const REMOVABLE_LAYER_TYPES = new Set<Layer["type"]>(["face", "text", "signature", "code"]);
const isRemovableLayer = (layer: Layer) => REMOVABLE_LAYER_TYPES.has(layer.type);
const isCanvasEditableLayer = (layer: Layer) => !layer.locked && layer.type !== "background";
const getDefaultFontSize = (layer: Layer) => layer.fontSize || (layer.type === "signature" ? 38 : 28);

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<"add" | "edit" | "select" | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"png" | "jpg" | "psd" | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragMoved, setDragMoved] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const [currentDrag, setCurrentDrag] = useState<{ x: number, y: number } | null>(null);
  const [drawingLayer, setDrawingLayer] = useState<"face" | "text" | "signature" | "code" | null>(null);
  const [canvasPan, setCanvasPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [isZooming, setIsZooming] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [selectedLayerDrag, setSelectedLayerDrag] = useState<{
    layerId: string;
    origin: { x: number; y: number };
    start: { x: number; y: number };
    crop: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [viewMode, setViewMode] = useState<"editor" | "preview">("editor");
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [activeActionTool, setActiveActionTool] = useState<string | null>(null);
  const [canvasLayout, setCanvasLayout] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [layerResizeInfo, setLayerResizeInfo] = useState<{
    anchor: "nw" | "ne" | "se" | "sw";
    start: { x: number; y: number };
    layer: Layer;
    crop: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [baseImageDrag, setBaseImageDrag] = useState<{
    origin: { x: number; y: number };
    crop: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [baseImageResizeInfo, setBaseImageResizeInfo] = useState<{
    anchor: "nw" | "ne" | "se" | "sw";
    start: { x: number; y: number };
    crop: { x: number; y: number; width: number; height: number };
  } | null>(null);

  // Component removal state
  const [isRemovingText, setIsRemovingText] = useState(false);
  const [selectedComponentsToRemove, setSelectedComponentsToRemove] = useState<string[]>([]);
  const [isInpainting, setIsInpainting] = useState(false);
  const [openCVLoaded, setOpenCVLoaded] = useState(false);

  // DL Generator state
  const [selectedDLState, setSelectedDLState] = useState<StateCode>("CA");
  const [generatedDLPackages, setGeneratedDLPackages] = useState<DLPackage[]>([]);
  const [dlCopiedIndex, setDlCopiedIndex] = useState<{ index: number; field: "dlNumber" | "icn" | "dd" } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const activeActionTimerRef = useRef<number | null>(null);
  const zoomInteractionTimerRef = useRef<number | null>(null);
  const suppressCanvasSelectionUntilRef = useRef(0);

  const selectedFile = files.find(f => f.id === selectedFileId);
  const selectedLayer = selectedFile?.layers.find(l => l.id === selectedLayerId);
  const overlayInputRef = useRef<HTMLInputElement>(null);
  const [clipboardLayer, setClipboardLayer] = useState<Layer | null>(null);
  const [clipboardIsBaseImage, setClipboardIsBaseImage] = useState(false);
  const [selectedBaseImage, setSelectedBaseImage] = useState(false);
  const imageCache = useRef<Record<string, HTMLImageElement>>({});
  const canvasDimensionsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });

  const fontFamilies = [
    { label: "Inter", value: "Inter, system-ui, sans-serif" },
    { label: "Syne", value: "Syne, sans-serif" },
    { label: "Roboto", value: "Roboto, sans-serif" },
    { label: "Montserrat", value: "Montserrat, sans-serif" },
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

  const activeToolClass = (isActive: boolean) => {
    if (!isActive) return "tool-glow-idle";
    return "tool-glow-active";
  };

  const flashTool = (tool: string) => {
    setActiveActionTool(tool);
    if (activeActionTimerRef.current) window.clearTimeout(activeActionTimerRef.current);
    activeActionTimerRef.current = window.setTimeout(() => {
      setActiveActionTool((current) => (current === tool ? null : current));
    }, 1800);
  };

  useEffect(() => {
    return () => {
      if (activeActionTimerRef.current) window.clearTimeout(activeActionTimerRef.current);
      if (zoomInteractionTimerRef.current) window.clearTimeout(zoomInteractionTimerRef.current);
    };
  }, []);

  const keepZoomInteractionActive = () => {
    suppressCanvasSelectionUntilRef.current = Date.now() + 600;
    setIsZooming(true);
    if (zoomInteractionTimerRef.current) window.clearTimeout(zoomInteractionTimerRef.current);
    zoomInteractionTimerRef.current = window.setTimeout(() => {
      setIsZooming(false);
    }, 260);
  };

  const finishZoomInteraction = () => {
    suppressCanvasSelectionUntilRef.current = Date.now() + 250;
    if (zoomInteractionTimerRef.current) window.clearTimeout(zoomInteractionTimerRef.current);
    zoomInteractionTimerRef.current = window.setTimeout(() => {
      setIsZooming(false);
    }, 120);
  };

  const toolbarToolClass = (isActive: boolean) =>
    `relative grid place-items-center w-9 h-8 rounded-lg border px-0 transition-all duration-200 ${activeToolClass(isActive)}`;

  const toolbarActionClass = (isActive: boolean, minWidth = "min-w-[74px]") =>
    `relative inline-flex items-center justify-center gap-1.5 ${minWidth} h-9 px-2.5 rounded-xl border text-[8px] font-semibold uppercase tracking-[0.08em] transition-all duration-200 disabled:opacity-40 ${activeToolClass(isActive)}`;

  const menuToolClass = (isActive: boolean) =>
    `relative flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-xl text-[10px] font-semibold uppercase border transition-all duration-200 disabled:opacity-50 ${activeToolClass(isActive)}`;

  const clampCanvasPan = (pan: { x: number; y: number }, zoom = canvasZoom) => {
    const stage = stageRef.current;
    const parent = stage?.parentElement;
    if (!stage || !parent) return pan;

    const parentRect = parent.getBoundingClientRect();
    const scaledWidth = stage.offsetWidth * zoom;
    const scaledHeight = stage.offsetHeight * zoom;
    const minVisibleX = Math.min(scaledWidth, parentRect.width) * 0.3;
    const minVisibleY = Math.min(scaledHeight, parentRect.height) * 0.3;
    const maxX = Math.max(0, (scaledWidth + parentRect.width) / 2 - minVisibleX);
    const maxY = Math.max(0, (scaledHeight + parentRect.height) / 2 - minVisibleY);

    return {
      x: Math.max(-maxX, Math.min(maxX, pan.x)),
      y: Math.max(-maxY, Math.min(maxY, pan.y)),
    };
  };

  const updateCanvasZoom = (zoom: number) => {
    const nextZoom = Math.max(0.5, Math.min(3, Number(zoom.toFixed(2))));
    keepZoomInteractionActive();
    setIsDragging(false);
    setDragStart(null);
    setCurrentDrag(null);
    setSelectedLayerDrag(null);
    setLayerResizeInfo(null);
    setBaseImageDrag(null);
    setBaseImageResizeInfo(null);
    setIsPanning(false);
    setPanStart(null);
    setCanvasZoom(nextZoom);
    setCanvasPan((prev) => clampCanvasPan(prev, nextZoom));
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
    if (!isCanvasEditableLayer(layer)) return null;
    const rect = getLayerDisplayRect(layer);
    if (!rect) return null;
    const handleSize = 14;
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

  const getBaseCropHandleAtPoint = (x: number, y: number) => {
    if (!canvasLayout.width || !canvasLayout.height) return null;
    const handleSize = 14;
    const corners = {
      nw: { x: 0, y: 0 },
      ne: { x: canvasLayout.width, y: 0 },
      sw: { x: 0, y: canvasLayout.height },
      se: { x: canvasLayout.width, y: canvasLayout.height },
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
      textColor: "#ffffff",
      fontFamily: "Great Vibes, cursive",
      fontSize: 46,
      fontWeight: "400",
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
    setSelectedBaseImage(false);
  };

  const openOverlayImagePicker = () => {
    overlayInputRef.current?.click();
  };

  type HistorySnapshot = {
    files: ManagedFile[];
    selectedFileId: string | null;
    selectedLayerId: string | null;
    editMode: "add" | "edit" | "select" | null;
    drawingLayer: "face" | "text" | "signature" | "code" | null;
    isRemovingText: boolean;
    selectedComponentsToRemove: string[];
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
    selectedComponentsToRemove,
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
    setSelectedComponentsToRemove(snapshot.selectedComponentsToRemove);
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
      textColor: "#ffffff",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: 32,
      fontWeight: "600",
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
    setSelectedBaseImage(false);
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
      if (!selectedFileId) {
        setSelectedFileId(id);
        setSelectedLayerId(null);
        setSelectedBaseImage(true);
      }

      // Auto-analyze image
      analyzeImage(f, id);
    });
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const analyzeImage = async (file: File, fileId: string) => {
    try {
      let analysis: DetectionResult | null = null;

      try {
        analysis = await analyzeImageWithOpenCV(file) as DetectionResult;
      } catch (opencvError) {
        console.warn("OpenCV analysis unavailable, falling back to server analysis:", opencvError);
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();
        if (data.analysis) {
          analysis = data.analysis as DetectionResult;
        }
      }

      if (analysis) {
        
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

        if (analysis.backgrounds.length > 0) {
          layers.push({
            id: `background-${layerId++}`,
            name: `Background ${analysis.backgrounds[0].type}`,
            type: "background",
            x: 0,
            y: 0,
            width: 1,
            height: 1,
            visible: true,
            locked: true,
            opacity: 0.15,
          });
        }

        pushSnapshot();
        clearRedoStack();
        setFiles((prev: ManagedFile[]) => prev.map((f: ManagedFile) => 
          f.id === fileId 
            ? { ...f, layers, analysis, isAnalyzing: false, isAnalyzed: true, isCompleted: true }
            : f
        ));

        if (!selectedFileId || selectedFileId === fileId) {
          setSelectedLayerId(null);
          setSelectedBaseImage(true);
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

        // Store actual canvas dimensions for accurate coordinate calculations
        canvasDimensionsRef.current = { width: canvas.width, height: canvas.height };

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

            return;
          }

          if (selectedLayer?.id === layer.id && isCanvasEditableLayer(layer)) {
            return;
          }

          const shouldDrawDetectionMarker = !isZooming && isRemovingText && selectedComponentsToRemove.includes(layer.id);
          if (!shouldDrawDetectionMarker) {
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
        if (!isZooming && selectedBaseImage && !selectedLayer) {
          ctx.save();
          ctx.strokeStyle = "rgba(255,255,255,0.8)";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.strokeRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        }

        if (!isZooming && isDragging && dragStart && currentDrag && drawingLayer) {
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
  }, [selectedFile, selectedLayer, selectedBaseImage, isDragging, dragStart, currentDrag, drawingLayer, isRemovingText, selectedComponentsToRemove, isZooming]);

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
    setCanvasPan({ x: 0, y: 0 });
    setCanvasZoom(1);
    setIsPanning(false);
    setPanStart(null);
    setSelectedLayerDrag(null);
    setLayerResizeInfo(null);
    setBaseImageDrag(null);
    setBaseImageResizeInfo(null);
    setIsDragging(false);
    setDragStart(null);
    setCurrentDrag(null);
  }, [selectedFileId]);

  useEffect(() => {
    const updateLayout = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // CSS transforms affect getBoundingClientRect(), which would double-scale selection frames.
      const width = canvas.offsetWidth || canvas.clientWidth || canvasDimensionsRef.current.width;
      const height = canvas.offsetHeight || canvas.clientHeight || canvasDimensionsRef.current.height;
      if (!width || !height) return;

      setCanvasLayout((prev) =>
        Math.abs(prev.width - width) < 0.5 && Math.abs(prev.height - height) < 0.5
          ? prev
          : { width, height }
      );
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

    if (isZooming || Date.now() < suppressCanvasSelectionUntilRef.current) {
      return;
    }
    
    // Enable panning with middle mouse button or when right-clicking
    if (e.button === 1 || e.button === 2) { // middle or right mouse button
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }
    
    if (!canvasRef.current || !selectedFile) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    const displayX = x * canvasLayout.width;
    const displayY = y * canvasLayout.height;

    if (selectedBaseImage && !selectedLayer && !editMode) {
      const handle = getBaseCropHandleAtPoint(displayX, displayY);
      const fileCrop = selectedFile.crop || { x: 0, y: 0, width: 1, height: 1 };

      if (handle) {
        pushSnapshot();
        clearRedoStack();
        setBaseImageResizeInfo({
          anchor: handle,
          start: { x, y },
          crop: fileCrop,
        });
        setIsDragging(true);
      } else {
        setIsPanning(true);
        setPanStart({ x: e.clientX, y: e.clientY });
        setIsDragging(false);
      }

      setDragMoved(false);
      return;
    }

    const clickedLayer = getTopLayerAtPoint(displayX, displayY);
    
    if (clickedLayer) {
      setSelectedBaseImage(false);
      if (selectedLayerId !== clickedLayer.id) {
        setSelectedLayerId(clickedLayer.id);
      }
      if (isRemovingText && isRemovableLayer(clickedLayer)) {
        setSelectedComponentsToRemove((prev) => prev.includes(clickedLayer.id) ? prev : [...prev, clickedLayer.id]);
        setDragMoved(false);
        setIsDragging(false);
        return;
      }

      if (isCanvasEditableLayer(clickedLayer)) {
        const handle = getResizeHandleAtPoint(clickedLayer, displayX, displayY);
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
          setDragMoved(false);
          setIsDragging(true);
          return;
        }
      }

      if (!clickedLayer.locked) {
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
        setDragMoved(false);
        setIsDragging(true);
        return;
      }
    }

    if (editMode && drawingLayer) {
      setSelectedLayerId(null);
      setSelectedBaseImage(false);
      setDragStart({ x, y });
      setCurrentDrag({ x, y });
      setIsDragging(true);
      return;
    }

    if (!clickedLayer) {
      setSelectedLayerId(null);
      setSelectedBaseImage(true);

      if (!editMode) {
        const handle = getBaseCropHandleAtPoint(displayX, displayY);
        const fileCrop = selectedFile.crop || { x: 0, y: 0, width: 1, height: 1 };

        if (handle) {
          pushSnapshot();
          clearRedoStack();
          setBaseImageResizeInfo({
            anchor: handle,
            start: { x, y },
            crop: fileCrop,
          });
        } else {
          setIsPanning(true);
          setPanStart({ x: e.clientX, y: e.clientY });
        }

        setDragMoved(false);
        setIsDragging(Boolean(handle));
        return;
      }
    }

    return;
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();

    if (isZooming) return;
    
    // Handle canvas panning
    if (isPanning && panStart) {
      e.stopPropagation();
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      
      setCanvasPan(prev => clampCanvasPan({
        x: prev.x + deltaX,
        y: prev.y + deltaY
      }));
      
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }
    
    if (!isDragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setCurrentDrag({ x, y });

    // Use actual canvas dimensions for consistent calculations
    const actualWidth = canvasDimensionsRef.current.width || rect.width;
    const actualHeight = canvasDimensionsRef.current.height || rect.height;

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

      if ((original.type === "text" || original.type === "signature") && original.text) {
        const nextHeight = updates.height ?? original.height;
        const fontScale = nextHeight / Math.max(0.001, original.height);
        updates.fontSize = Math.max(8, Math.min(180, Math.round(getDefaultFontSize(original) * fontScale)));
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

    if (baseImageResizeInfo && selectedFile) {
      const dx = x - baseImageResizeInfo.start.x;
      const dy = y - baseImageResizeInfo.start.y;
      const original = baseImageResizeInfo.crop;
      const updates = { ...original };
      const minCropSize = 0.1;

      if (baseImageResizeInfo.anchor === "se") {
        updates.width = Math.max(minCropSize, Math.min(1 - original.x, original.width + dx * original.width));
        updates.height = Math.max(minCropSize, Math.min(1 - original.y, original.height + dy * original.height));
      } else if (baseImageResizeInfo.anchor === "sw") {
        const nextX = Math.max(0, Math.min(original.x + original.width - minCropSize, original.x + dx * original.width));
        updates.x = nextX;
        updates.width = Math.max(minCropSize, original.width - (nextX - original.x));
        updates.height = Math.max(minCropSize, Math.min(1 - original.y, original.height + dy * original.height));
      } else if (baseImageResizeInfo.anchor === "ne") {
        const nextY = Math.max(0, Math.min(original.y + original.height - minCropSize, original.y + dy * original.height));
        updates.y = nextY;
        updates.height = Math.max(minCropSize, original.height - (nextY - original.y));
        updates.width = Math.max(minCropSize, Math.min(1 - original.x, original.width + dx * original.width));
      } else if (baseImageResizeInfo.anchor === "nw") {
        const nextX = Math.max(0, Math.min(original.x + original.width - minCropSize, original.x + dx * original.width));
        const nextY = Math.max(0, Math.min(original.y + original.height - minCropSize, original.y + dy * original.height));
        updates.x = nextX;
        updates.y = nextY;
        updates.width = Math.max(minCropSize, original.width - (nextX - original.x));
        updates.height = Math.max(minCropSize, original.height - (nextY - original.y));
      }

      setFiles((prev) => prev.map((file) =>
        file.id === selectedFileId
          ? { ...file, crop: updates }
          : file
      ));
      return;
    }

    if (baseImageDrag && selectedFile) {
      const moveDistancePx = Math.hypot(
        (x - baseImageDrag.origin.x) * actualWidth,
        (y - baseImageDrag.origin.y) * actualHeight
      );
      if (!dragMoved && moveDistancePx < 6) {
        return;
      }
      if (!dragMoved) {
        setDragMoved(true);
      }

      const crop = baseImageDrag.crop;
      const nextX = Math.max(0, Math.min(1 - crop.width, crop.x + (x - baseImageDrag.origin.x) * crop.width));
      const nextY = Math.max(0, Math.min(1 - crop.height, crop.y + (y - baseImageDrag.origin.y) * crop.height));

      setFiles((prev) => prev.map((file) =>
        file.id === selectedFileId
          ? { ...file, crop: { ...crop, x: nextX, y: nextY } }
          : file
      ));
      return;
    }

    if (selectedLayerDrag && selectedFile) {
      const moveDistancePx = Math.hypot(
        (x - selectedLayerDrag.origin.x) * actualWidth,
        (y - selectedLayerDrag.origin.y) * actualHeight
      );
      if (!dragMoved && moveDistancePx < 6) {
        return;
      }
      if (!dragMoved) {
        setDragMoved(true);
      }

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
    if (isZooming) {
      setIsDragging(false);
      setDragStart(null);
      setCurrentDrag(null);
      setSelectedLayerDrag(null);
      setLayerResizeInfo(null);
      setBaseImageDrag(null);
      setBaseImageResizeInfo(null);
      setIsPanning(false);
      setPanStart(null);
      return;
    }

    if (isPanning) {
      setIsPanning(false);
      setPanStart(null);
      return;
    }
    
    if (selectedLayerDrag && !dragMoved) {
      setSelectedLayerDrag(null);
      setIsDragging(false);
      setDragStart(null);
      setCurrentDrag(null);
      return;
    }

    if (baseImageDrag && !dragMoved) {
      setBaseImageDrag(null);
      setIsDragging(false);
      setDragStart(null);
      setCurrentDrag(null);
      return;
    }

    if (baseImageDrag) {
      setBaseImageDrag(null);
      setIsDragging(false);
      setDragStart(null);
      setCurrentDrag(null);
      return;
    }

    if (baseImageResizeInfo) {
      setBaseImageResizeInfo(null);
      setIsDragging(false);
      setDragStart(null);
      setCurrentDrag(null);
      return;
    }

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
      if (isRemovingText && isRemovableLayer(newLayer)) {
        setSelectedComponentsToRemove((prev) => prev.includes(newLayer.id) ? prev : [...prev, newLayer.id]);
      }
    }

    setIsDragging(false);
    setDragStart(null);
    setCurrentDrag(null);
  };

  const handleCanvasWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.ctrlKey || e.metaKey) {
      const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
      updateCanvasZoom(canvasZoom + zoomDelta);
      return;
    }
  };

  const handleCanvasPanMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 2 && !editMode && !selectedLayer) return; // Right-click or no layer selected
    if (e.button === 0 && selectedLayer) return; // Left-click with selected layer - for selection/editing
    
    e.preventDefault();
    e.stopPropagation();
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleCanvasPanMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPanning || !panStart) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const deltaX = e.clientX - panStart.x;
    const deltaY = e.clientY - panStart.y;
    
    setCanvasPan(prev => clampCanvasPan({
      x: prev.x + deltaX,
      y: prev.y + deltaY
    }));
    
    setPanStart({ x: e.clientX, y: e.clientY });
  };

  const handleCanvasPanMouseUp = () => {
    setIsPanning(false);
    setPanStart(null);
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
      const maskCanvas = createMask(fullCanvas.width, fullCanvas.height, regions, 0);

      // Replace only the masked pixels with sampled background. This avoids large-region OpenCV warping.
      console.log("Starting background-preserving removal process...");
      const inpaintedCanvas = removeMaskedRegionPreserveBackground(fullCanvas, maskCanvas);

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

  const removeSelectedComponents = async () => {
    if (!selectedFile) return;

    const removalIds = selectedComponentsToRemove.length > 0
      ? selectedComponentsToRemove
      : selectedLayer && isRemovableLayer(selectedLayer)
        ? [selectedLayer.id]
        : [];

    if (removalIds.length === 0) return;
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

      // Get selected component layers to remove and inpaint.
      const componentLayers = selectedFile.layers.filter(
        l => isRemovableLayer(l) && removalIds.includes(l.id)
      );

      if (componentLayers.length === 0) {
        throw new Error("No valid removable components selected");
      }

      console.log(`Creating mask for ${componentLayers.length} selected components at full resolution...`);
      const maskCanvas = createMask(fullCanvas.width, fullCanvas.height, componentLayers, 0);

      // Replace only the masked pixels with sampled background. This avoids large-region OpenCV warping.
      console.log("Starting background-preserving removal process...");
      const inpaintedCanvas = removeMaskedRegionPreserveBackground(fullCanvas, maskCanvas);

      console.log("Inpainting complete, saving result...");
      
      // Convert inpainted canvas to data URL
      const inpaintedUrl = inpaintedCanvas.toDataURL("image/png", 1.0);
      
      // Update file with new inpainted URL and remove component layers
      pushSnapshot();
      clearRedoStack();
      setFiles((prev: ManagedFile[]) =>
        prev.map((f: ManagedFile) =>
          f.id === selectedFileId
            ? {
                ...f,
                inpaintedUrl: inpaintedUrl,
                layers: f.layers.filter(
                  (l: Layer) => !(isRemovableLayer(l) && removalIds.includes(l.id))
                ),
              }
            : f
        )
      );

      if (selectedLayer && removalIds.includes(selectedLayer.id)) setSelectedLayerId(null);
      setSelectedComponentsToRemove([]);
      setIsRemovingText(false);
      console.log("Component removal completed successfully");
    } catch (error) {
      console.error("Component removal error:", error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`Failed to remove selected component: ${errorMessage}`);
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
        <div data-theme={theme} className="h-screen bg-[var(--bg)] text-[var(--text)] font-sans selection:bg-blue-500/30 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-white/6 bg-[#08090d]/95 backdrop-blur-md z-50 shrink-0 shadow-[0_8px_30px_rgba(0,0,0,0.35)]">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 lg:flex-[0_0_auto]">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 border border-blue-300/20 flex items-center justify-center shadow-[0_10px_24px_rgba(37,99,235,0.35)]">
              <ImageIcon className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-[12px] tracking-tight block leading-none text-white">Photo Studio</span>
              <span className="text-[7px] text-neutral-500 uppercase tracking-[0.34em] font-mono">AI Editor</span>
            </div>
            <div className="hidden md:block h-8 w-px bg-white/8" />
            <div className="hidden md:inline-flex items-center gap-2 text-[7px] uppercase tracking-[0.22em] text-neutral-400">
              <span className={`inline-flex w-2 h-2 rounded-full ${openCVLoaded ? "bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.8)]" : "bg-amber-400"}`}></span>
              <span>{openCVLoaded ? "OpenCV Ready" : "Loading"}</span>
            </div>
          </div>

          <div className="flex items-center justify-center lg:flex-1">
            <div className="inline-flex items-center gap-1 rounded-xl border border-[#2d3952] bg-[#101722] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <button
                type="button"
                onClick={() => {
                  flashTool("view");
                  setViewMode(viewMode === "editor" ? "preview" : "editor");
                }}
                className={toolbarToolClass(activeActionTool === "view" || viewMode === "preview")}
                title={viewMode === "editor" ? "Switch to preview" : "Switch to editor"}
              >
                {viewMode === "editor" ? <Eye className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  flashTool("theme");
                  setTheme(theme === "dark" ? "light" : "dark");
                }}
                className={toolbarToolClass(activeActionTool === "theme")}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              </button>
              <div className="mx-1 h-5 w-px bg-white/8" />
              <button
                type="button"
                title="Pointer mode"
                onClick={() => {
                  flashTool("pointer");
                  setEditMode(null);
                  setDrawingLayer(null);
                  setIsRemovingText(false);
                  setSelectedComponentsToRemove([]);
                }}
                className={toolbarToolClass((!editMode && !isRemovingText) || activeActionTool === "pointer")}
              >
                <MousePointer2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Face region"
                onClick={() => { flashTool("face"); setEditMode("add"); setDrawingLayer("face"); }}
                className={toolbarToolClass((editMode === "add" && drawingLayer === "face") || activeActionTool === "face")}
              >
                <User className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Text region"
                onClick={() => { flashTool("text-region"); setEditMode("add"); setDrawingLayer("text"); }}
                className={toolbarToolClass((editMode === "add" && drawingLayer === "text") || activeActionTool === "text-region")}
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Erase component"
                onClick={() => { flashTool("signature-region"); setEditMode("add"); setDrawingLayer("signature"); }}
                className={toolbarToolClass((editMode === "add" && drawingLayer === "signature") || activeActionTool === "signature-region")}
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Code region"
                onClick={() => { flashTool("code-region"); setEditMode("add"); setDrawingLayer("code"); }}
                className={toolbarToolClass((editMode === "add" && drawingLayer === "code") || activeActionTool === "code-region")}
              >
                <Code className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                title="Remove selected component"
                onClick={() => {
                  flashTool("remove");
                  const nextIsRemoving = !isRemovingText;
                  setIsRemovingText(nextIsRemoving);
                  if (nextIsRemoving) {
                    const nextDrawingLayer = drawingLayer || (selectedLayer && isRemovableLayer(selectedLayer)
                      ? selectedLayer.type as "face" | "text" | "signature" | "code"
                      : "text");
                    setSelectedComponentsToRemove(selectedLayer && isRemovableLayer(selectedLayer) ? [selectedLayer.id] : []);
                    setEditMode("add");
                    setDrawingLayer(nextDrawingLayer);
                    setSelectedBaseImage(false);
                  } else {
                    setSelectedComponentsToRemove([]);
                    setEditMode(null);
                    setDrawingLayer(null);
                  }
                }}
                disabled={!selectedFile || !openCVLoaded}
                className={`${toolbarToolClass(isRemovingText || activeActionTool === "remove")} disabled:opacity-40`}
              >
                <Wand2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5 lg:flex-[0_0_auto]">
            <button
              type="button"
              onClick={() => {
                flashTool("undo");
                handleUndo();
              }}
              disabled={!canUndo}
              className={toolbarActionClass(activeActionTool === "undo", "min-w-[88px]")}
            >
              <ArrowLeft className="w-3 h-3" />
              Undo
            </button>
            <button
              type="button"
              onClick={() => {
                flashTool("redo");
                handleRedo();
              }}
              disabled={!canRedo}
              className={toolbarActionClass(activeActionTool === "redo", "min-w-[88px]")}
            >
              <ArrowRight className="w-3 h-3" />
              Redo
            </button>

            <button
              type="button"
              title="Add overlay image"
              onClick={() => {
                flashTool("upload-overlay");
                openOverlayImagePicker();
              }}
              disabled={!selectedFile}
              className={`relative grid place-items-center w-9 h-9 rounded-xl border transition-all duration-200 disabled:opacity-40 ${activeToolClass(activeActionTool === "upload-overlay")}`}
            >
              <Upload className="w-3.5 h-3.5" />
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  flashTool("more");
                  setShowHeaderMenu((prev) => !prev);
                }}
                className={`relative grid place-items-center w-9 h-9 rounded-xl border transition-all duration-200 ${activeToolClass(showHeaderMenu || activeActionTool === "more")}`}
                title="More actions"
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {showHeaderMenu && (
                <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-[#101010] border border-white/8 p-2 z-50 shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        flashTool("menu-text");
                        addTextLayer("New Text");
                      }}
                      disabled={!selectedFile}
                      className={menuToolClass(activeActionTool === "menu-text")}
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Text
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        flashTool("menu-sign");
                        addSignatureLayer();
                      }}
                      disabled={!selectedFile}
                      className={menuToolClass(activeActionTool === "menu-sign")}
                    >
                      <Eraser className="w-3.5 h-3.5" />
                      Sign
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        flashTool("menu-copy");
                        copyLayer();
                      }}
                      disabled={!selectedLayer && !selectedBaseImage}
                      className={menuToolClass(activeActionTool === "menu-copy")}
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        flashTool("menu-cut");
                        cutLayer();
                      }}
                      disabled={!selectedLayer && !selectedBaseImage}
                      className={menuToolClass(activeActionTool === "menu-cut")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Cut
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        flashTool("menu-paste");
                        pasteLayer();
                      }}
                      disabled={!clipboardLayer || !selectedFile}
                      className={menuToolClass(activeActionTool === "menu-paste")}
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
                      onClick={() => {
                        flashTool("menu-undo");
                        handleUndo();
                      }}
                      disabled={!canUndo}
                      className={menuToolClass(activeActionTool === "menu-undo")}
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Undo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        flashTool("menu-redo");
                        handleRedo();
                      }}
                      disabled={!canRedo}
                      className={menuToolClass(activeActionTool === "menu-redo")}
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Redo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        flashTool("menu-png");
                        exportAsset("png");
                      }}
                      disabled={!selectedFile || isExporting}
                      className={menuToolClass(activeActionTool === "menu-png" || exportFormat === "png")}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      PNG
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        flashTool("menu-jpg");
                        exportAsset("jpg");
                      }}
                      disabled={!selectedFile || isExporting}
                      className={menuToolClass(activeActionTool === "menu-jpg" || exportFormat === "jpg")}
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      JPG
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        flashTool("menu-psd");
                        exportAsset("psd");
                      }}
                      disabled={!selectedFile || isExporting}
                      className={menuToolClass(activeActionTool === "menu-psd" || exportFormat === "psd")}
                    >
                      <Download className="w-3.5 h-3.5" />
                      PSD
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                flashTool("png");
                exportAsset("png");
              }}
              disabled={!selectedFile || isExporting}
              className={toolbarActionClass(activeActionTool === "png" || exportFormat === "png")}
            >
              <ImageIcon className="w-3 h-3" />
              PNG
            </button>
            <button
              type="button"
              onClick={() => {
                flashTool("jpg");
                exportAsset("jpg");
              }}
              disabled={!selectedFile || isExporting}
              className={toolbarActionClass(activeActionTool === "jpg" || exportFormat === "jpg")}
            >
              <ImageIcon className="w-3 h-3" />
              JPG
            </button>
            <button
              type="button"
              onClick={() => {
                flashTool("psd");
                exportAsset("psd");
              }}
              disabled={!selectedFile || isExporting}
              className={toolbarActionClass(activeActionTool === "psd" || exportFormat === "psd")}
            >
              <Download className="w-3 h-3" />
              PSD
            </button>
            <button
              onClick={() => {
                flashTool("logout");
                sessionStorage.removeItem("isAuthenticated");
                setIsAuthenticated(false);
              }}
              className={`relative inline-flex items-center justify-center gap-1.5 min-w-[100px] h-9 px-2.5 rounded-xl border text-[8px] font-semibold uppercase tracking-[0.08em] transition-all ${activeActionTool === "logout" ? activeToolClass(true) : "border-red-500/20 bg-[#1a0909] text-red-300 hover:bg-red-950/40 hover:text-red-100"}`}
              title="Logout"
            >
              <LogOut className="w-3 h-3" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main UI */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden bg-[#060606] min-h-0">
        {/* Left Sidebar: File Browser - Hidden on small screens, toggle on md */}
        <div className={`${viewMode === "preview" ? "hidden" : "flex flex-col"} w-full lg:w-[248px] border-r border-white/6 bg-[#131b2d] shrink-0 max-h-[28vh] lg:max-h-none`}>
          <div className="px-4 py-3 border-b border-white/6 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-[0.35em] text-neutral-400 font-medium">Library</span>
            <span className="text-[9px] text-neutral-300 border border-white/8 rounded-md px-2 py-0.5 bg-[#151d2f]">{files.length}/4</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {files.map(file => (
              <div 
                key={file.id}
                onClick={() => {
                  setSelectedFileId(file.id);
                  setSelectedLayerId(null);
                  setSelectedBaseImage(true);
                }}
                className={`group relative aspect-[4/3] min-h-[128px] rounded-2xl overflow-hidden cursor-pointer border bg-[#101722] transition-all ${selectedFileId === file.id ? "border-blue-500 ring-2 ring-blue-500/30 shadow-[0_0_0_1px_rgba(59,130,246,0.35)]" : "border-white/10 hover:border-white/20"}`}
              >
                <img
                  src={file.originalUrl}
                  draggable={false}
                  className="block w-full h-full object-cover pointer-events-none select-none"
                  style={{ userSelect: "none", MozUserSelect: "none", msUserSelect: "none" }}
                />
                <div className="absolute inset-0 bg-neutral-950/30 opacity-0 group-hover:opacity-100 transition-opacity" />
                
                {file.isAnalyzed && (
                  <div className="absolute top-2 left-2 bg-green-500 text-white p-1 lg:p-1.5 rounded-md shadow-lg flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span className="text-[8px] font-bold">{file.layers.length}</span>
                  </div>
                )}

                {file.isAnalyzing && (
                  <div className="absolute inset-0 bg-neutral-950/80 flex items-center justify-center">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  </div>
                )}

                <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 p-2 opacity-0 group-hover:opacity-100 transition-all transform translate-y-1 group-hover:translate-y-0">
                  <span className="text-[8px] text-white font-bold truncate block">{file.name}</span>
                </div>

                <button 
                  onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                  className="absolute top-2 right-2 p-1 lg:p-1.5 bg-red-600/90 rounded-lg text-white opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 scale-90 hover:scale-100"
                >
                  <Trash2 className="w-2.5 h-2.5 lg:w-3 lg:h-3" />
                </button>
              </div>
            ))}

            {files.length < 4 && (
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full aspect-[4/3] min-h-[128px] rounded-2xl border border-dashed border-white/10 bg-[#101722] flex flex-col items-center justify-center gap-2.5 text-neutral-400 hover:text-blue-300 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all text-[8px] font-semibold uppercase tracking-[0.28em]"
              >
                <div className="p-3 rounded-3xl bg-[#1a2134] border border-white/5">
                  <Plus className="w-4 h-4" />
                </div>
                <span className="text-[8px] font-semibold">Upload</span>
              </button>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" accept="image/*" />
          <input type="file" ref={overlayInputRef} onChange={handleOverlaySelect} className="hidden" accept="image/*" />
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 bg-[#040404] relative overflow-hidden flex items-center justify-center p-4 lg:p-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.03)_0%,_transparent_60%)] pointer-events-none" />
          
          {selectedFile ? (
            <div 
              ref={stageRef}
              className="relative rounded-[28px] overflow-hidden bg-black border border-white/6 shadow-[0_30px_100px_rgba(0,0,0,0.65)] w-full max-w-[820px]"
              style={{ transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`, transformOrigin: "center center", transition: isPanning ? 'none' : 'transform 0.1s ease-out' }}
            >
              <canvas 
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleCanvasWheel}
                onContextMenu={(e) => e.preventDefault()}
                draggable={false}
                style={{ touchAction: "none", cursor: isPanning ? "grabbing" : editMode ? "crosshair" : "grab" }}
                className="w-full block h-auto"
              />
              {!isZooming && selectedLayer && isCanvasEditableLayer(selectedLayer) && canvasLayout.width > 0 && canvasLayout.height > 0 && (() => {
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
                        className="absolute w-2.5 h-2.5 rounded-full bg-blue-500 border border-blue-300/80 shadow-lg"
                        style={{ left: handle.left, top: handle.top, transform: "translate(-50%, -50%)" }}
                      />
                    ))}
                  </div>
                );
              })()}
              {!isZooming && selectedBaseImage && !selectedLayer && canvasLayout.width > 0 && canvasLayout.height > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0 border border-dashed border-white/70 rounded-[28px]" />
                  {[
                    { key: "nw", left: 0, top: 0 },
                    { key: "ne", left: canvasLayout.width, top: 0 },
                    { key: "sw", left: 0, top: canvasLayout.height },
                    { key: "se", left: canvasLayout.width, top: canvasLayout.height },
                  ].map((handle) => (
                    <div
                      key={handle.key}
                      className="absolute w-2.5 h-2.5 rounded-full bg-white border border-blue-300/80 shadow-lg"
                      style={{ left: handle.left, top: handle.top, transform: "translate(-50%, -50%)" }}
                    />
                  ))}
                </div>
              )}
              
              <AnimatePresence>
                {selectedFile.isAnalyzing && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-neutral-950/80 flex flex-col items-center justify-center z-20"
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
                    className="absolute inset-0 bg-neutral-950/80 flex flex-col items-center justify-center z-20"
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

            </div>
          ) : (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-neutral-900 border border-neutral-800 rounded-3xl flex items-center justify-center mx-auto relative group">
                <div className="absolute inset-0 bg-blue-500/10 blur-xl opacity-0 group-hover:opacity-100 transition-all rounded-full" />
                <ImageIcon className="w-6 h-6 text-neutral-800 group-hover:text-neutral-600 transition-colors" />
              </div>
              <div className="space-y-2">
                <h3 className="text-[13px] font-bold text-white tracking-tight">Upload Your Photo</h3>
                <p className="text-[8px] text-neutral-500 uppercase tracking-[0.18em] font-medium max-w-xs mx-auto leading-relaxed">
                  AI will automatically detect faces, text, signatures, codes, and backgrounds.
                </p>
              </div>
            </div>
          )}
          {selectedFile && (
            <div className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 px-3 pointer-events-none">
              <div className="px-3 py-1 bg-black/75 border border-white/8 rounded-full flex items-center gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] pointer-events-auto">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-[8px] font-semibold text-neutral-300 uppercase tracking-[0.25em]">Live Editor</span>
              </div>
              <div
                className="px-3 py-1.5 bg-black/80 border border-white/8 rounded-full flex items-center gap-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)] pointer-events-auto"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  keepZoomInteractionActive();
                }}
                onPointerUp={(e) => {
                  e.stopPropagation();
                  finishZoomInteraction();
                }}
                onPointerCancel={(e) => {
                  e.stopPropagation();
                  finishZoomInteraction();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onMouseUp={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onWheel={(e) => e.stopPropagation()}
              >
                <span className="text-[8px] font-semibold text-neutral-300 uppercase tracking-[0.22em] whitespace-nowrap">
                  Zoom {(canvasZoom * 100).toFixed(0)}%
                </span>
                <input
                  type="range"
                  min="50"
                  max="300"
                  step="5"
                  value={Math.round(canvasZoom * 100)}
                  onChange={(e) => updateCanvasZoom(Number(e.target.value) / 100)}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    keepZoomInteractionActive();
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    finishZoomInteraction();
                  }}
                  onPointerCancel={(e) => {
                    e.stopPropagation();
                    finishZoomInteraction();
                  }}
                  className="w-28 h-1 accent-blue-500 cursor-pointer"
                  aria-label="Canvas zoom"
                />
              </div>
              {(canvasPan.x !== 0 || canvasPan.y !== 0) && (
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCanvasPan({ x: 0, y: 0 });
                  }}
                  className="px-3 py-1 bg-black/75 border border-white/8 hover:border-white/14 rounded-full text-[8px] font-semibold text-neutral-300 uppercase tracking-[0.25em] transition-colors hover:text-neutral-200 pointer-events-auto"
                  title="Reset pan to center"
                >
                  Reset View
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar: Layers & Adjustments - Mobile optimized */}
        <div
          className={viewMode === "preview" ? "hidden" : "w-full lg:w-[284px] border-t lg:border-t-0 lg:border-l border-white/6 bg-[#131b2d] p-3 pr-2 pb-16 space-y-3 shrink-0 overflow-y-scroll overscroll-contain touch-pan-y max-h-[36vh] lg:max-h-none min-h-0 h-full"}
          style={{ scrollbarGutter: "stable" }}
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] font-semibold text-white tracking-tight">Detected Layers</span>
            <span className="text-[8px] text-neutral-500 font-mono">#{selectedFile?.layers.length || 0}</span>
          </div>

          {/* Adjustments */}
          {selectedFile && (
            <div className="space-y-2.5 rounded-[20px] border border-white/6 bg-[#0d0d0d] p-3">
              <h4 className="text-[9px] font-semibold text-neutral-500 uppercase tracking-[0.35em]">Adjustments</h4>
              
              <div className="space-y-2 lg:space-y-3">
                <div>
                  <label className="text-[8px] lg:text-[9px] font-bold text-neutral-500 uppercase mb-1 lg:mb-2 block">Brightness</label>
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
                    className="w-full h-1.5 bg-neutral-800 rounded-full accent-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[8px] lg:text-[9px] font-bold text-neutral-500 uppercase mb-1 lg:mb-2 block">Contrast</label>
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
                    className="w-full h-1.5 bg-neutral-800 rounded-full accent-blue-500"
                  />
                </div>
                <div>
                  <label className="text-[8px] lg:text-[9px] font-bold text-neutral-500 uppercase mb-1 lg:mb-2 block">Saturation</label>
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
                    className="w-full h-1.5 bg-neutral-800 rounded-full accent-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Base Image Controls */}
          {selectedBaseImage && selectedFile && !selectedLayer && (
            <div className="space-y-2.5 p-3 rounded-[20px] bg-[#0d0d0d] border border-white/6">
              <h4 className="text-[9px] font-semibold text-neutral-500 uppercase tracking-[0.22em]">Base Image Edit</h4>
              <div className="space-y-2.5">
                <div>
                  <label className="text-[9px] font-semibold text-neutral-500 uppercase mb-1 block">Crop X</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={selectedFile.crop?.x ?? 0}
                    onChange={(e) => updateFilesWithHistory(prev => prev.map(f => {
                      if (f.id !== selectedFileId) return f;
                      const crop = f.crop ?? { x: 0, y: 0, width: 1, height: 1 };
                      return { ...f, crop: { ...crop, x: Number(e.target.value) } };
                    }))}
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
                    onChange={(e) => updateFilesWithHistory(prev => prev.map(f => {
                      if (f.id !== selectedFileId) return f;
                      const crop = f.crop ?? { x: 0, y: 0, width: 1, height: 1 };
                      return { ...f, crop: { ...crop, y: Number(e.target.value) } };
                    }))}
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
                      onChange={(e) => updateFilesWithHistory(prev => prev.map(f => {
                        if (f.id !== selectedFileId) return f;
                        const crop = f.crop ?? { x: 0, y: 0, width: 1, height: 1 };
                        return { ...f, crop: { ...crop, width: Number(e.target.value) } };
                      }))}
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
                      onChange={(e) => updateFilesWithHistory(prev => prev.map(f => {
                        if (f.id !== selectedFileId) return f;
                        const crop = f.crop ?? { x: 0, y: 0, width: 1, height: 1 };
                        return { ...f, crop: { ...crop, height: Number(e.target.value) } };
                      }))}
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
                  className="w-full py-2 rounded-xl bg-blue-600/15 border border-blue-500/40 text-[10px] font-bold uppercase tracking-[0.16em] text-blue-200 hover:bg-blue-600/25"
                >
                  Reset Base Crop
                </button>
              </div>
            </div>
          )}

          {/* Layers List */}
          <div className="space-y-3">
            <div className="space-y-2 max-h-[32vh] overflow-y-auto pr-1 rounded-[20px] border border-white/6 bg-[#0d0d0d] p-2.5">
              {selectedFile?.layers.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#111111] border border-dashed border-white/10 flex flex-col items-center justify-center text-center">
                  <Layers className="w-7 h-7 text-neutral-700 mb-4" />
                  <p className="text-[10px] text-neutral-500 font-bold uppercase tracking-[0.18em]">No Layers Detected</p>
                  <p className="text-[8px] text-neutral-600 mt-2">Draw areas or upload a new photo</p>
                </div>
              ) : (
                selectedFile?.layers.map((layer: Layer) => (
                  <div 
                    key={layer.id}
                    onClick={() => {
                      setSelectedLayerId(layer.id);
                      setSelectedBaseImage(false);
                    }}
                    className={`group flex items-center gap-2 p-2 rounded-md transition-all border cursor-pointer ${
                      selectedLayer?.id === layer.id 
                        ? "bg-[var(--bg-secondary)] border-neutral-700/40" 
                        : "bg-[var(--bg-secondary)] border border-neutral-700/30 hover:border-neutral-600/40"
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${
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
                        face: <User className="w-3 h-3" />,
                        text: <FileText className="w-3 h-3" />,
                        signature: <Eraser className="w-3 h-3" />,
                        code: <Code className="w-3 h-3" />,
                        background: <ImageIcon className="w-3 h-3" />,
                        custom: <Square className="w-3 h-3" />,
                        image: <ImageIcon className="w-3 h-3" />,
                      }[layer.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-medium text-neutral-200 truncate block">{layer.name}</span>
                      <span className="text-[8px] text-neutral-500 font-sans">
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
                      className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="w-3 h-3" />
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
              <h4 className="text-[9px] font-bold text-neutral-500 uppercase tracking-[0.2em] flex items-center gap-1.5">
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
            <div className="p-3 rounded-[20px] bg-[#07150b] border border-emerald-500/30 space-y-2.5 shadow-[inset_0_1px_0_rgba(74,222,128,0.03)]">
              <h4 className="text-[10px] font-bold text-emerald-500 uppercase tracking-[0.28em] flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Edit History
              </h4>
              <p className="text-[8px] text-emerald-700">Image has been edited with inpainting</p>
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
                className="w-full py-2 px-3 rounded-xl text-[9px] font-bold uppercase tracking-[0.16em] transition-all border bg-[#151515] border-white/8 text-neutral-300 hover:text-white hover:border-white/12"
              >
                <RotateCcw className="w-3 h-3 inline mr-1" />
                Reset to Original
              </button>
            </div>
          )}

          {/* Component Removal Section */}
          {isRemovingText && selectedFile && (
            <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-700/50 space-y-4">
              <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-[0.2em] flex items-center gap-2">
                <Wand2 className="w-4 h-4" />
                Remove Component (Inpainting)
              </h4>
              
              <div className="space-y-3">
                <p className="text-[9px] text-amber-700">Drag over any face, text, signature, or code region, or select detected layers to remove and blend with the background:</p>
                
                <div className="space-y-2 max-h-[25vh] overflow-y-auto">
                  {selectedFile.layers.filter(isRemovableLayer).length === 0 ? (
                    <p className="text-[8px] text-neutral-600 italic">No removable layers yet. Drag a box over the component on the image.</p>
                  ) : (
                    selectedFile.layers
                      .filter(isRemovableLayer)
                      .map(layer => (
                        <label 
                          key={layer.id}
                          className="flex items-center gap-3 p-2 rounded-lg bg-neutral-800/30 hover:bg-neutral-800/50 transition-colors cursor-pointer"
                        >
                          <input 
                            type="checkbox"
                            checked={selectedComponentsToRemove.includes(layer.id)}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                              if (e.target.checked) {
                                setSelectedComponentsToRemove([...selectedComponentsToRemove, layer.id]);
                              } else {
                                setSelectedComponentsToRemove(selectedComponentsToRemove.filter(id => id !== layer.id));
                              }
                            }}
                            className="w-4 h-4 accent-amber-600"
                          />
                          <span className="text-[9px] font-bold text-neutral-300 flex-1">{layer.name}</span>
                          <span className="text-[7px] font-bold uppercase tracking-[0.16em] text-amber-600/70">{layer.type}</span>
                        </label>
                      ))
                  )}
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={removeSelectedComponents}
                    disabled={(selectedComponentsToRemove.length === 0 && !(selectedLayer && isRemovableLayer(selectedLayer))) || isInpainting}
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
                      setSelectedComponentsToRemove([]);
                      setEditMode(null);
                      setDrawingLayer(null);
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
          <div className="p-3 rounded-[20px] bg-[#0d0d0d] border border-white/6 space-y-3 overflow-visible">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-neutral-500" />
                <span className="text-[9px] font-semibold uppercase tracking-[0.32em] text-neutral-500">DL Number Generator</span>
              </div>
            </div>
            
            <div className="space-y-2">
              <div>
                <label className="text-[7px] font-medium text-neutral-500 mb-1.5 block uppercase tracking-[0.18em]">State</label>
                <select 
                  value={selectedDLState}
                  onChange={(e) => setSelectedDLState(e.target.value as StateCode)}
                  className="appearance-none relative z-30 w-full h-12 px-3 rounded-xl bg-[#151515] border border-white/8 text-[9px] font-medium text-neutral-200 focus:border-blue-500 focus:outline-none"
                >
                  {getAllStates().map((state) => (
                    <option key={state.stateCode} value={state.stateCode} className="text-[9px] text-neutral-300">
                      {state.state} ({state.stateCode}) - {state.format}
                    </option>
                  ))}
                </select>
              </div>

              <button 
                onClick={generateDLNumbers}
                className="w-full inline-flex items-center justify-center gap-1.5 h-12 rounded-xl text-[8px] font-semibold uppercase tracking-[0.16em] transition-all border border-blue-500/40 bg-blue-600/10 text-blue-200 hover:bg-blue-600/15"
              >
                <RefreshCw className="w-2.5 h-2.5" />
                Generate
              </button>

              {generatedDLPackages.length > 0 && (
                <div className="space-y-3 max-h-[40vh] overflow-y-auto border border-neutral-700/40 rounded-md bg-[var(--bg-secondary)] p-2">
                  <p className="text-[8px] text-neutral-500 font-semibold">Generated packages</p>
                  {generatedDLPackages.map((pkg: DLPackage, index: number) => (
                    <div 
                      key={index}
                      className="p-2 rounded-md bg-[var(--bg-secondary)] border border-neutral-700/50 hover:border-neutral-600 transition-all space-y-2"
                    >
                      {/* DL Number */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-[7px] text-neutral-600 uppercase font-bold mb-1">DL #</p>
                          <code className="text-[8px] font-mono text-neutral-300 break-all">
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
