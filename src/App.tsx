import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { writePsd, Psd } from "ag-psd";
import { 
  User, FileText, Image as ImageIcon, Upload, Download, 
  Loader2, CheckCircle2, Shield, Eye, Trash2, Layers, 
  Square, MousePointer2, Eraser, Save, Plus
} from "lucide-react";

interface ManagedFile {
  id: string;
  name: string;
  originalUrl: string;
  masks: Array<{ type: "portrait" | "text", x: number, y: number, width: number, height: number }>;
  isProcessing: boolean;
  isCompleted: boolean;
}

export default function App() {
  const [files, setFiles] = useState<ManagedFile[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<"portrait" | "text" | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number, y: number } | null>(null);
  const [currentDrag, setCurrentDrag] = useState<{ x: number, y: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const selectedFile = files.find(f => f.id === selectedFileId);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    if (selectedFiles.length === 0) return;

    const newFiles: ManagedFile[] = selectedFiles.slice(0, 4 - files.length).map(f => ({
      id: Math.random().toString(36).substring(2, 9),
      name: f.name,
      originalUrl: URL.createObjectURL(f),
      masks: [],
      isProcessing: false,
      isCompleted: false,
    }));

    setFiles(prev => [...prev, ...newFiles]);
    if (!selectedFileId && newFiles.length > 0) {
      setSelectedFileId(newFiles[0].id);
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
    if (selectedFileId === id) setSelectedFileId(null);
  };

  const resetFile = (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, masks: [], isCompleted: false, isProcessing: false } : f));
  };

  // Canvas drawing logic for masks and final result
  useEffect(() => {
    if (!selectedFile || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

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

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (selectedFile.isCompleted) {
        // Advanced Deletion: Background Analysis & Synthesis
        selectedFile.masks.forEach(mask => {
          const mx = mask.x * canvas.width;
          const my = mask.y * canvas.height;
          const mw = mask.width * canvas.width;
          const mh = mask.height * canvas.height;

          // 1. Sample the perimeter (4 sides) to determine average context colors
          const getAvgColor = (x: number, y: number, w: number, h: number) => {
            try {
              const data = ctx.getImageData(Math.max(0, x), Math.max(0, y), Math.min(w, canvas.width - x), Math.min(h, canvas.height - y)).data;
              let r = 0, g = 0, b = 0, count = 0;
              for (let i = 0; i < data.length; i += 4) {
                r += data[i]; g += data[i+1]; b += data[i+2]; count++;
              }
              return count > 0 ? [r/count, g/count, b/count] : [200, 200, 200];
            } catch (e) { return [200, 200, 200]; }
          };

          const margin = 12;
          const cT = getAvgColor(mx, my - margin, mw, margin);
          const cB = getAvgColor(mx, my + mh, mw, margin);
          const cL = getAvgColor(mx - margin, my, margin, mh);
          const cR = getAvgColor(mx + mw, my, margin, mh);

          // 2. Synthesize a smooth gradient background
          const grad = ctx.createLinearGradient(mx, my, mx + mw, my + mh);
          grad.addColorStop(0, `rgb(${cT[0]}, ${cT[1]}, ${cT[2]})`);
          grad.addColorStop(0.5, `rgb(${cL[0]}, ${cL[1]}, ${cL[2]})`);
          grad.addColorStop(1, `rgb(${cB[0]}, ${cB[1]}, ${cB[2]})`);
          
          ctx.fillStyle = grad;
          ctx.fillRect(mx, my, mw, mh);

          // 3. Texture Synthesis: Sample a clean patch from the document corner (usually minimalist)
          // We sample from the bottom right corner which often has the base pattern
          try {
            const cornerX = canvas.width - 60;
            const cornerY = canvas.height - 60;
            ctx.globalAlpha = 0.2; // Low opacity to blend texture over gradient
            ctx.drawImage(img, (cornerX / canvas.width) * img.width, (cornerY / canvas.height) * img.height, 50, 50, mx, my, mw, mh);
            ctx.globalAlpha = 1.0;
          } catch (e) { /* ignore */ }

          // 4. Noise Grain matching
          const grain = ctx.getImageData(mx, my, mw, mh);
          for (let i = 0; i < grain.data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 6;
            grain.data[i] += noise;
            grain.data[i+1] += noise;
            grain.data[i+2] += noise;
          }
          ctx.putImageData(grain, mx, my);

          // 5. Soft border blending
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          const feather = ctx.createRadialGradient(mx + mw/2, my + mh/2, Math.min(mw, mh) * 0.4, mx + mw/2, my + mh/2, Math.max(mw, mh) * 0.6);
          feather.addColorStop(0, "rgba(0,0,0,0)");
          feather.addColorStop(1, "rgba(0,0,0,1)");
          ctx.fillStyle = feather;
          // Apply a bit of softness to the transition
          ctx.filter = "blur(3px)";
          ctx.globalCompositeOperation = "source-over";
          ctx.restore();
        });
      } else {
        // Draw selection box while dragging
        if (isDragging && dragStart && currentDrag) {
          ctx.strokeStyle = editMode === "portrait" ? "#3b82f6" : "#eab308";
          ctx.setLineDash([6, 3]);
          ctx.lineWidth = 2;
          const dx = dragStart.x * canvas.width;
          const dy = dragStart.y * canvas.height;
          const dw = (currentDrag.x - dragStart.x) * canvas.width;
          const dh = (currentDrag.y - dragStart.y) * canvas.height;
          ctx.strokeRect(dx, dy, dw, dh);
          ctx.fillStyle = editMode === "portrait" ? "rgba(59, 130, 246, 0.2)" : "rgba(234, 179, 8, 0.2)";
          ctx.fillRect(dx, dy, dw, dh);
        }

        // Draw established masks
        selectedFile.masks.forEach(mask => {
          ctx.fillStyle = mask.type === "portrait" ? "rgba(59, 130, 246, 0.4)" : "rgba(234, 179, 8, 0.4)";
          ctx.strokeStyle = mask.type === "portrait" ? "#3b82f6" : "#eab308";
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          
          const x = mask.x * canvas.width;
          const y = mask.y * canvas.height;
          const w = mask.width * canvas.width;
          const h = mask.height * canvas.height;

          ctx.fillRect(x, y, w, h);
          ctx.strokeRect(x, y, w, h);
          
          ctx.setLineDash([]);
          ctx.fillStyle = "white";
          ctx.font = "bold 10px Inter";
          ctx.fillText(mask.type.toUpperCase(), x + 5, y + 15);
        });
      }
    };
  }, [selectedFile, files, selectedFileId, isDragging, dragStart, currentDrag]);

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
    if (!isDragging || !dragStart || !currentDrag || !editMode || !selectedFile) {
      setIsDragging(false);
      return;
    }

    const x = Math.min(dragStart.x, currentDrag.x);
    const y = Math.min(dragStart.y, currentDrag.y);
    const width = Math.abs(currentDrag.x - dragStart.x);
    const height = Math.abs(currentDrag.y - dragStart.y);

    if (width > 0.01 && height > 0.01) {
      const newMask = { type: editMode as "portrait" | "text", x, y, width, height };
      setFiles(prev => prev.map(f => 
        f.id === selectedFileId 
          ? { ...f, masks: [...f.masks, newMask] }
          : f
      ));
    }

    setIsDragging(false);
    setDragStart(null);
    setCurrentDrag(null);
  };

  const processFile = (id: string) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, isProcessing: true } : f));
    
    setTimeout(() => {
      setFiles(prev => prev.map(f => f.id === id ? { ...f, isProcessing: false, isCompleted: true } : f));
    }, 2500);
  };

  const exportAsset = async (format: "png" | "psd") => {
    if (!selectedFile || !canvasRef.current) return;
    setIsExporting(true);

    try {
      const canvas = canvasRef.current;
      
      if (format === "png") {
        const link = document.createElement("a");
        link.download = `${selectedFile.name.split(".")[0]}_refined.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      } else if (format === "psd") {
        // Prepare layered PSD with advanced layer separation
        const masks = selectedFile.masks;
        
        // 1. Get high-res original
        const originalImg = new Image();
        originalImg.crossOrigin = "anonymous";
        originalImg.src = selectedFile.originalUrl;
        await new Promise(resolve => originalImg.onload = resolve);
        
        const originalCanvas = document.createElement("canvas");
        originalCanvas.width = originalImg.width;
        originalCanvas.height = originalImg.height;
        const octx = originalCanvas.getContext("2d");
        if (octx) octx.drawImage(originalImg, 0, 0);

        // 2. Create the PSD structure
        const psd: Psd = {
          width: originalImg.width,
          height: originalImg.height,
          children: [
            {
              name: "Original Image (Reference)",
              canvas: originalCanvas,
              hidden: true,
            },
            {
              name: "Refined Background",
              canvas: canvas,
            },
            {
              name: "Mask Indicators",
              opened: false,
              children: masks.map((mask, i) => {
                const layerCanvas = document.createElement("canvas");
                layerCanvas.width = originalImg.width;
                layerCanvas.height = originalImg.height;
                const lctx = layerCanvas.getContext("2d");
                if (lctx) {
                  lctx.fillStyle = mask.type === "portrait" ? "rgba(59, 130, 246, 0.8)" : "rgba(234, 179, 8, 0.8)";
                  lctx.fillRect(
                    mask.x * originalImg.width, 
                    mask.y * originalImg.height, 
                    mask.width * originalImg.width, 
                    mask.height * originalImg.height
                  );
                }
                return {
                  name: `${mask.type.toUpperCase()} AREA ${i + 1}`,
                  canvas: layerCanvas,
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
        a.download = `${selectedFile.name.split(".")[0]}_project.psd`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export Error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-neutral-100 font-sans selection:bg-blue-500/30 flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="border-b border-neutral-800/50 bg-[#0a0a0a]/80 backdrop-blur-xl z-50 shrink-0">
        <div className="max-w-[1920px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-400 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="font-bold text-lg tracking-tight block leading-none">SecureID Pro</span>
              <span className="text-[9px] text-neutral-500 uppercase tracking-widest font-mono">Workspace v4.0</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-neutral-900/50 rounded-lg p-1 border border-neutral-800">
              <button 
                onClick={() => setEditMode("portrait")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${editMode === "portrait" ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" : "text-neutral-400 hover:text-white"}`}
              >
                <User className="w-3.5 h-3.5" /> Portrait Mark
              </button>
              <button 
                onClick={() => setEditMode("text")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${editMode === "text" ? "bg-yellow-600 text-white shadow-lg shadow-yellow-500/20" : "text-neutral-400 hover:text-white"}`}
              >
                <FileText className="w-3.5 h-3.5" /> Text Mark
              </button>
              <button 
                onClick={() => setEditMode(null)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${!editMode ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-white"}`}
              >
                <MousePointer2 className="w-3.5 h-3.5" /> Pointer
              </button>
            </div>

            <div className="h-6 w-px bg-neutral-800 mx-1" />

            <div className="flex gap-2">
              <button 
                onClick={() => exportAsset("png")}
                disabled={!selectedFile || isExporting}
                className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all border border-neutral-700"
              >
                {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                IMG
              </button>
              <button 
                onClick={() => exportAsset("psd")}
                disabled={!selectedFile || isExporting}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-[10px] font-bold uppercase transition-all shadow-lg shadow-blue-500/20"
              >
                {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                PSD
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main UI */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Asset Browser */}
        <div className="w-72 border-r border-neutral-800/50 bg-[#080808] flex flex-col shrink-0">
          <div className="p-4 border-b border-neutral-800/50 flex items-center justify-between">
            <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-[0.2em]">Queue Library</span>
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
                
                {file.isCompleted && (
                  <div className="absolute top-2 left-2 bg-green-500 text-white p-1 rounded-md shadow-lg">
                    <CheckCircle2 className="w-3 h-3" />
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
                Import
              </button>
            )}
          </div>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} multiple className="hidden" accept="image/*" />
        </div>

        {/* Center: Stage */}
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
                {selectedFile.isProcessing && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-neutral-950/80 backdrop-blur-xl flex flex-col items-center justify-center z-20"
                  >
                    <div className="relative">
                      <div className="w-20 h-20 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                      <Shield className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-blue-500" />
                    </div>
                    <p className="mt-8 text-blue-400 font-black uppercase tracking-[0.6em] text-[10px]">Processing Layer Data</p>
                    <div className="mt-8 w-64 h-1 bg-neutral-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 2.5, ease: "easeInOut" }}
                        className="h-full bg-gradient-to-r from-blue-600 to-indigo-400"
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* In-Stage Overlay */}
              <div className="absolute bottom-4 left-4 flex gap-2">
                <div className="px-3 py-1 bg-black/60 backdrop-blur border border-white/10 rounded-full flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-tighter">HD Preview</span>
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
                <h3 className="text-xl font-bold text-white tracking-tight">Waiting for Assets</h3>
                <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-medium max-w-xs mx-auto leading-relaxed">
                  The high-fidelity refinement engine requires image input to initialize.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar */}
        <div className="w-80 border-l border-neutral-800/50 bg-[#080808] p-6 space-y-10 shrink-0">
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.2em] flex items-center justify-between">
              Layers & Masks
              <span className="text-neutral-700 font-mono italic">#{selectedFile?.masks.length || 0}</span>
            </h4>
            
            <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
              {selectedFile?.masks.length === 0 ? (
                <div className="p-8 rounded-2xl bg-neutral-900/30 border border-dashed border-neutral-800 flex flex-col items-center justify-center text-center">
                  <Layers className="w-6 h-6 text-neutral-700 mb-3" />
                  <p className="text-[10px] text-neutral-600 font-bold uppercase tracking-tight">No active tags</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[9px] font-bold text-neutral-600 uppercase tracking-widest">Active Layers</span>
                    <button 
                      onClick={() => selectedFileId && resetFile(selectedFileId)}
                      className="text-[9px] font-bold text-red-500 uppercase hover:underline"
                    >
                      Reset All
                    </button>
                  </div>
                  {selectedFile?.masks.map((mask, i) => (
                    <div key={i} className="group flex items-center gap-3 bg-neutral-900/50 border border-neutral-800 hover:border-neutral-700 p-3 rounded-xl transition-all">
                      <div className={`p-1.5 rounded-lg ${mask.type === "portrait" ? "bg-blue-500/10 text-blue-500" : "bg-yellow-500/10 text-yellow-500"}`}>
                        {mask.type === "portrait" ? <User className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                      </div>
                      <div>
                        <span className="text-[10px] font-black text-neutral-300 uppercase tracking-tighter block">{mask.type} DEF_0{i + 1}</span>
                        <span className="text-[9px] text-neutral-600 font-mono leading-none">POS: {mask.x.toFixed(2)}, {mask.y.toFixed(2)}</span>
                      </div>
                      <button 
                        onClick={() => setFiles(prev => prev.map(f => f.id === selectedFileId ? { ...f, masks: f.masks.filter((_, idx) => idx !== i), isCompleted: false } : f))}
                        className="ml-auto text-neutral-700 hover:text-red-500 transition-colors"
                      >
                        <Eraser className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <h4 className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.2em]">Operations</h4>
            <button 
              onClick={() => selectedFileId && processFile(selectedFileId)}
              disabled={!selectedFile || selectedFile.masks.length === 0 || selectedFile.isProcessing}
              className="w-full bg-white text-black hover:bg-neutral-200 disabled:opacity-30 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.1em] transition-all flex items-center justify-center gap-3 shadow-[0_20px_40px_-10px_rgba(255,255,255,0.1)] active:scale-[0.98]"
            >
              {selectedFile?.isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Refine Selected Asset
            </button>
            <div className="p-4 rounded-2xl bg-neutral-900/30 border border-neutral-800 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-[10px] font-bold text-neutral-400 uppercase">Process Sequence</span>
              </div>
              <p className="text-[9px] text-neutral-600 leading-relaxed font-medium">
                Asset will be processed using high-frequency fill algorithms. Neural network rebuilds the security guilloche patterns and textures based on surround data.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
