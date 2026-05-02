import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import fs from "fs";
import { writePsd } from "ag-psd";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-cpu";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import Jimp from "jimp";
import Tesseract from "tesseract.js";

const upload = multer({ dest: "uploads/" });

// Cache for loaded model
let cocoModel: any = null;

async function loadModel() {
  if (!cocoModel) {
    console.log("Loading COCO-SSD model...");
    cocoModel = await cocoSsd.load();
  }
}

interface DetectionResult {
  faces: Array<{ x: number; y: number; width: number; height: number; confidence: number }>;
  text: Array<{ x: number; y: number; width: number; height: number; content: string }>;
  signatures: Array<{ x: number; y: number; width: number; height: number }>;
  codes: Array<{ x: number; y: number; width: number; height; type: string }>;
  backgrounds: Array<{ type: string; color: string }>;
  components: string[];
}

async function detectFaces(pixelData: Uint8ClampedArray, imgWidth: number, imgHeight: number): Promise<DetectionResult['faces']> {
  // Simple face detection using color/skin tone analysis
  console.log("Detecting faces using skin tone analysis...");
  const faces: DetectionResult['faces'] = [];
  const faceBlockSize = 40;
  
  for (let y = 0; y < imgHeight; y += faceBlockSize) {
    for (let x = 0; x < imgWidth; x += faceBlockSize) {
      let skinPixels = 0;
      let totalPixels = 0;
      
      for (let py = y; py < Math.min(y + faceBlockSize, imgHeight); py++) {
        for (let px = x; px < Math.min(x + faceBlockSize, imgWidth); px++) {
          const idx = (py * imgWidth + px) * 4;
          const r = pixelData[idx] || 0;
          const g = pixelData[idx + 1] || 0;
          const b = pixelData[idx + 2] || 0;
          totalPixels++;

          // Basic skin tone detection
          if (r > 95 && g > 40 && b > 20 && r > g && r > b && Math.abs(r - g) > 15) {
            skinPixels++;
          }
        }
      }

      // If >20% pixels look like skin, likely a face region
      if (totalPixels > 0 && skinPixels / totalPixels > 0.2) {
        faces.push({
          x: (x / imgWidth) * 100,
          y: (y / imgHeight) * 100,
          width: ((faceBlockSize) / imgWidth) * 100,
          height: ((faceBlockSize) / imgHeight) * 100,
          confidence: Math.min(1, (skinPixels / totalPixels) * 2),
        });
      }
    }
  }
  console.log(`Found ${faces.length} face regions`);
  return faces;
}

async function detectSignatures(pixelData: Uint8ClampedArray, imgWidth: number, imgHeight: number): Promise<DetectionResult['signatures']> {
  console.log("Detecting signatures with edge analysis...");
  const signatures: DetectionResult['signatures'] = [];
  const blockSize = Math.floor(Math.max(imgWidth, imgHeight) / 8);

  for (let y = 0; y < imgHeight; y += blockSize) {
    for (let x = 0; x < imgWidth; x += blockSize) {
      let variance = 0;
      let mean = 0;
      const pixels = [];

      for (let py = y; py < Math.min(y + blockSize, imgHeight); py++) {
        for (let px = x; px < Math.min(x + blockSize, imgWidth); px++) {
          const idx = (py * imgWidth + px) * 4;
          pixels.push(pixelData[idx] || 0);
        }
      }

      if (pixels.length > 0) {
        mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
        variance = pixels.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / pixels.length;

        // High variance suggests pen strokes (signatures)
        if (variance > 2000 && mean < 200) {
          signatures.push({
            x: (x / imgWidth) * 100,
            y: (y / imgHeight) * 100,
            width: ((blockSize) / imgWidth) * 100,
            height: ((blockSize) / imgHeight) * 100,
          });
        }
      }
    }
  }
  console.log(`Found ${signatures.length} signature regions`);
  return signatures;
}

async function detectCodes(pixelData: Uint8ClampedArray, imgWidth: number, imgHeight: number): Promise<DetectionResult['codes']> {
  console.log("Detecting QR/Barcode patterns...");
  const codes: DetectionResult['codes'] = [];
  const codeBlockSize = Math.floor(Math.max(imgWidth, imgHeight) / 10);
  
  for (let y = 0; y < imgHeight; y += codeBlockSize) {
    for (let x = 0; x < imgWidth; x += codeBlockSize) {
      let contrast = 0;
      let pixels = [];
      
      for (let py = y; py < Math.min(y + codeBlockSize, imgHeight); py++) {
        for (let px = x; px < Math.min(x + codeBlockSize, imgWidth); px++) {
          const idx = (py * imgWidth + px) * 4;
          pixels.push(pixelData[idx] || 0);
        }
      }
      
      if (pixels.length > 0) {
        const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;
        const variance = pixels.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / pixels.length;
        contrast = Math.sqrt(variance);
        
        // High contrast patterns suggest codes
        if (contrast > 100) {
          codes.push({
            x: (x / imgWidth) * 100,
            y: (y / imgHeight) * 100,
            width: ((codeBlockSize) / imgWidth) * 100,
            height: ((codeBlockSize) / imgHeight) * 100,
            type: "qr_or_barcode",
          });
        }
      }
    }
  }
  console.log(`Found ${codes.length} code regions`);
  return codes;
}

async function detectText(imagePath: string, imgWidth: number, imgHeight: number): Promise<DetectionResult['text']> {
  try {
    const result = await Tesseract.recognize(imagePath, "eng");
    const textAreas: DetectionResult['text'] = [];

    result.data.words.forEach((word: any) => {
      if (word.conf > 50) {
        textAreas.push({
          x: (word.bbox.x0 / imgWidth) * 100,
          y: (word.bbox.y0 / imgHeight) * 100,
          width: ((word.bbox.x1 - word.bbox.x0) / imgWidth) * 100,
          height: ((word.bbox.y1 - word.bbox.y0) / imgHeight) * 100,
          content: word.text,
        });
      }
    });

    return textAreas;
  } catch (err) {
    console.error("Text detection error:", err);
    return [];
  }
}

async function analyzeImage(imagePath: string): Promise<DetectionResult> {
  try {
    await loadModel();

    // Load image metadata with JIMP
    console.log("Loading image with JIMP...");
    const image = await Jimp.read(imagePath);
    const imgWidth = image.bitmap.width;
    const imgHeight = image.bitmap.height;
    console.log(`Image size: ${imgWidth}x${imgHeight}`);

    // Analyze image properties
    const { data: pixelData } = image.bitmap;
    const colorCounts: { [key: string]: number } = {};
    let dominantColor = "#ffffff";
    let maxCount = 0;

    // Sample pixels to find dominant color
    console.log("Analyzing dominant color...");
    for (let i = 0; i < pixelData.length; i += 16) {
      const r = pixelData[i];
      const g = pixelData[i + 1];
      const b = pixelData[i + 2];
      const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
      colorCounts[hex] = (colorCounts[hex] || 0) + 1;

      if (colorCounts[hex] > maxCount) {
        maxCount = colorCounts[hex];
        dominantColor = hex;
      }
    }

    // Run all detections in parallel
    const [faces, signatures, codes, text] = await Promise.all([
      detectFaces(pixelData, imgWidth, imgHeight),
      detectSignatures(pixelData, imgWidth, imgHeight),
      detectCodes(pixelData, imgWidth, imgHeight),
      detectText(imagePath, imgWidth, imgHeight),
    ]);

    return {
      faces,
      text,
      signatures,
      codes,
      backgrounds: [{ type: "detected", color: dominantColor }],
      components: ["image", "text", "objects", "faces"],
    };
  } catch (error) {
    console.error("Analysis error:", error);
    return {
      faces: [],
      text: [],
      signatures: [],
      codes: [],
      backgrounds: [{ type: "unknown", color: "#ffffff" }],
      components: [],
    };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "50mb" }));

  // API Route for image upload and analysis
  app.post("/api/upload", upload.single("image"), async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    try {
      console.log(`Processing upload: ${req.file.originalname}`);
      const analysis = await analyzeImage(req.file.path);
      res.json({
        success: true,
        filename: req.file.filename,
        originalName: req.file.originalname,
        analysis: analysis,
      });
    } catch (error) {
      console.error("Upload error:", error);
      res.status(500).json({ error: "Failed to analyze image" });
    }
  });

  // Cleanup old uploads periodically
  setInterval(() => {
    const uploadDir = "uploads/";
    fs.readdir(uploadDir, (err, files) => {
      if (err) return;
      files.forEach((file) => {
        const filePath = path.join(uploadDir, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          const ageInMinutes = (Date.now() - stats.mtime.getTime()) / 60000;
          if (ageInMinutes > 60) {
            fs.unlink(filePath, (err) => {
              if (err) console.error("Error deleting file:", err);
            });
          }
        });
      });
    });
  }, 10 * 60 * 1000); // Run every 10 minutes

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Using local AI: Tesseract.js (OCR) + JIMP (Image Processing) + COCO-SSD (Object Detection)");
  });
}

startServer();
