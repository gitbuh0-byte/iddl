import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import multer from "multer";
import fs from "fs";
import { writePsd } from "ag-psd";
import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-cpu";
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import { Jimp } from "jimp";
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
  console.log("Detecting faces using enhanced skin tone and shape analysis...");
  const faces: DetectionResult['faces'] = [];
  const blockSize = Math.floor(Math.max(imgWidth, imgHeight) / 20); // Smaller blocks for better detection

  // Create a skin probability map
  const skinMap = new Uint8Array(imgWidth * imgHeight);

  for (let y = 0; y < imgHeight; y++) {
    for (let x = 0; x < imgWidth; x++) {
      const idx = (y * imgWidth + x) * 4;
      const r = pixelData[idx] || 0;
      const g = pixelData[idx + 1] || 0;
      const b = pixelData[idx + 2] || 0;

      // Enhanced skin detection using multiple criteria
      const isSkin = (
        // Basic skin tone range
        r > 60 && g > 40 && b > 20 &&
        r > g && r > b &&
        Math.abs(r - g) > 10 &&
        // Additional checks for better accuracy
        (r / Math.max(g, b) > 1.1) &&
        (g / b > 0.8) &&
        // Exclude very bright/white pixels
        Math.max(r, g, b) < 240
      );

      skinMap[y * imgWidth + x] = isSkin ? 1 : 0;
    }
  }

  // Find connected skin regions
  for (let y = 0; y < imgHeight; y += blockSize) {
    for (let x = 0; x < imgWidth; x += blockSize) {
      let skinPixels = 0;
      let totalPixels = 0;
      let minX = x, maxX = x + blockSize, minY = y, maxY = y + blockSize;

      // Analyze block and expand to connected skin regions
      for (let py = y; py < Math.min(y + blockSize, imgHeight); py++) {
        for (let px = x; px < Math.min(x + blockSize, imgWidth); px++) {
          if (skinMap[py * imgWidth + px]) {
            skinPixels++;
            minX = Math.min(minX, px);
            maxX = Math.max(maxX, px);
            minY = Math.min(minY, py);
            maxY = Math.max(maxY, py);
          }
          totalPixels++;
        }
      }

      // Expand to find full face region
      if (skinPixels / totalPixels > 0.3) {
        // Grow region to include connected skin pixels
        let changed = true;
        while (changed && (maxX - minX < imgWidth * 0.3) && (maxY - minY < imgHeight * 0.3)) {
          changed = false;
          const newMinX = Math.max(0, minX - 5);
          const newMaxX = Math.min(imgWidth, maxX + 5);
          const newMinY = Math.max(0, minY - 5);
          const newMaxY = Math.min(imgHeight, maxY + 5);

          for (let py = newMinY; py < newMaxY; py++) {
            for (let px = newMinX; px < newMaxX; px++) {
              if (skinMap[py * imgWidth + px] && (px < minX || px >= maxX || py < minY || py >= maxY)) {
                minX = Math.min(minX, px);
                maxX = Math.max(maxX, px);
                minY = Math.min(minY, py);
                maxY = Math.max(maxY, py);
                changed = true;
              }
            }
          }
        }

        const width = maxX - minX;
        const height = maxY - minY;

        // Filter for reasonable face proportions (roughly square, not too small/large)
        if (width > 20 && height > 20 && width / height > 0.5 && width / height < 2.0) {
          faces.push({
            x: (minX / imgWidth) * 100,
            y: (minY / imgHeight) * 100,
            width: (width / imgWidth) * 100,
            height: (height / imgHeight) * 100,
            confidence: Math.min(1, (skinPixels / totalPixels) * 1.5),
          });
        }
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

    // Convert JIMP image to TensorFlow tensor for COCO-SSD
    const imageData = new Uint8Array(image.bitmap.data);
    const tfImage = tf.browser.fromPixels({
      data: imageData,
      width: imgWidth,
      height: imgHeight,
      channels: 4
    });

    // Run COCO-SSD object detection
    console.log("Running COCO-SSD object detection...");
    const predictions = await cocoModel.detect(tfImage, 0.4, 0.5); // threshold: 0.4, maxBoxes: 0.5

    console.log(`COCO-SSD detected ${predictions.length} objects`);

    // Process detections
    const faces: DetectionResult['faces'] = [];
    const text: DetectionResult['text'] = [];
    const signatures: DetectionResult['signatures'] = [];
    const codes: DetectionResult['codes'] = [];

    predictions.forEach((prediction: any) => {
      const bbox = prediction.bbox; // [x, y, width, height]
      const x = bbox[0] / imgWidth;
      const y = bbox[1] / imgHeight;
      const width = bbox[2] / imgWidth;
      const height = bbox[3] / imgHeight;

      const className = prediction.class.toLowerCase();

      if (className.includes('person') || className.includes('face')) {
        faces.push({
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: Math.min(1, width),
          height: Math.min(1, height),
          confidence: prediction.score,
        });
      } else if (className.includes('book') || className.includes('document') || className.includes('paper')) {
        // Could be text areas
        text.push({
          x: Math.max(0, x),
          y: Math.max(0, y),
          width: Math.min(1, width),
          height: Math.min(1, height),
          content: `${className} area`,
        });
      }
    });

    // Fallback to basic detection if COCO-SSD didn't find much
    if (faces.length === 0) {
      console.log("COCO-SSD found no faces, using fallback skin tone detection...");
      const pixelData = new Uint8ClampedArray(image.bitmap.data);
      const fallbackFaces = await detectFaces(pixelData, imgWidth, imgHeight);
      faces.push(...fallbackFaces);
    }

    // Analyze image properties for background and other components
    const pixelData = new Uint8ClampedArray(image.bitmap.data);
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

    // Run additional detections
    const [detectedSignatures, detectedCodes, detectedText] = await Promise.all([
      detectSignatures(pixelData, imgWidth, imgHeight),
      detectCodes(pixelData, imgWidth, imgHeight),
      detectText(imagePath, imgWidth, imgHeight),
    ]);

    signatures.push(...detectedSignatures);
    codes.push(...detectedCodes);
    text.push(...detectedText);

    // Clean up TensorFlow tensors
    tfImage.dispose();

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
