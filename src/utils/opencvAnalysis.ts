import { loadOpenCV } from "./inpainting";

export interface OpenCVDetectionResult {
  faces: Array<{ x: number; y: number; width: number; height: number; confidence: number }>;
  text: Array<{ x: number; y: number; width: number; height: number; content: string }>;
  signatures: Array<{ x: number; y: number; width: number; height: number }>;
  codes: Array<{ x: number; y: number; width: number; height: number; type: string }>;
  backgrounds: Array<{ type: string; color: string }>;
  components: string[];
}

type NormalizedRect = { x: number; y: number; width: number; height: number };

declare global {
  interface Window {
    cv: any;
  }
}

let faceCascadePromise: Promise<void> | null = null;

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function toNormalizedRect(rect: { x: number; y: number; width: number; height: number }, width: number, height: number): NormalizedRect {
  return {
    x: clamp(rect.x / width),
    y: clamp(rect.y / height),
    width: clamp(rect.width / width),
    height: clamp(rect.height / height),
  };
}

function intersectionOverUnion(a: NormalizedRect, b: NormalizedRect) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function dedupeRects<T extends NormalizedRect>(rects: T[], threshold = 0.35) {
  return rects.reduce<T[]>((acc, rect) => {
    const hasOverlap = acc.some((existing) => intersectionOverUnion(existing, rect) > threshold);
    if (!hasOverlap) acc.push(rect);
    return acc;
  }, []);
}

async function fileToImage(file: File): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(error);
    };
    img.src = url;
  });
}

function createCanvasFromImage(img: HTMLImageElement) {
  const maxDimension = 1600;
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Failed to create analysis canvas");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function ensureFaceCascade(cv: any) {
  if (!faceCascadePromise) {
    faceCascadePromise = (async () => {
      const cascadeName = "haarcascade_frontalface_default.xml";
      try {
        cv.FS_unlink(`/${cascadeName}`);
      } catch {}
      const response = await fetch(`/${cascadeName}`);
      if (!response.ok) {
        throw new Error("Failed to load face cascade");
      }
      const data = new Uint8Array(await response.arrayBuffer());
      cv.FS_createDataFile("/", cascadeName, data, true, false, false);
    })();
  }

  await faceCascadePromise;
}

async function detectFaces(cv: any, gray: any, width: number, height: number) {
  await ensureFaceCascade(cv);

  const classifier = new cv.CascadeClassifier();
  classifier.load("haarcascade_frontalface_default.xml");

  const facesVector = new cv.RectVector();
  const minFaceSize = new cv.Size(Math.max(30, Math.round(width * 0.08)), Math.max(30, Math.round(height * 0.08)));
  classifier.detectMultiScale(gray, facesVector, 1.1, 4, 0, minFaceSize);

  const results: Array<{ x: number; y: number; width: number; height: number; confidence: number }> = [];

  for (let i = 0; i < facesVector.size(); i++) {
    const rect = facesVector.get(i);
    const normalized = toNormalizedRect(rect, width, height);
    const area = normalized.width * normalized.height;
    if (area > 0.01 && area < 0.5) {
      results.push({
        ...normalized,
        confidence: clamp(0.55 + area, 0.55, 0.95),
      });
    }
  }

  classifier.delete();
  facesVector.delete();
  minFaceSize.delete();

  return dedupeRects(results, 0.25);
}

function detectText(cv: any, gray: any, width: number, height: number) {
  const binary = new cv.Mat();
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(23, 5));
  const morphed = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
  cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 21, 12);
  cv.morphologyEx(binary, morphed, cv.MORPH_CLOSE, kernel);
  cv.findContours(morphed, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const results: Array<{ x: number; y: number; width: number; height: number; content: string }> = [];

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const rect = cv.boundingRect(contour);
    const area = rect.width * rect.height;
    const ratio = rect.width / Math.max(rect.height, 1);

    if (
      area > width * height * 0.00035 &&
      area < width * height * 0.04 &&
      rect.height > 8 &&
      rect.height < height * 0.08 &&
      ratio > 2.2 &&
      rect.width < width * 0.7 &&
      rect.y > height * 0.02 &&
      rect.y < height * 0.82
    ) {
      const normalized = toNormalizedRect(rect, width, height);
      results.push({
        ...normalized,
        content: "Detected text",
      });
    }
    contour.delete();
  }

  binary.delete();
  kernel.delete();
  morphed.delete();
  contours.delete();
  hierarchy.delete();

  return dedupeRects(results, 0.24).map((rect) => ({
    ...rect,
    content: "Detected text",
  }));
}

function detectSignatures(cv: any, gray: any, width: number, height: number) {
  const thresholded = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.threshold(gray, thresholded, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
  cv.Canny(thresholded, edges, 40, 120);
  cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  const results: NormalizedRect[] = [];

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const rect = cv.boundingRect(contour);
    const area = rect.width * rect.height;
    const ratio = rect.width / Math.max(rect.height, 1);
    const inSignatureBand = rect.y > height * 0.58;

    if (
      inSignatureBand &&
      area > width * height * 0.00015 &&
      area < width * height * 0.015 &&
      ratio > 2.8 &&
      rect.height < height * 0.08 &&
      rect.width < width * 0.35
    ) {
      results.push(toNormalizedRect(rect, width, height));
    }
    contour.delete();
  }

  thresholded.delete();
  edges.delete();
  contours.delete();
  hierarchy.delete();

  return dedupeRects(results, 0.35);
}

function detectBackground(cv: any, src: any) {
  const mean = cv.mean(src);
  const color = `rgb(${Math.round(mean[0])}, ${Math.round(mean[1])}, ${Math.round(mean[2])})`;
  const brightness = (mean[0] + mean[1] + mean[2]) / 3;
  return [{
    type: brightness > 180 ? "light" : brightness < 70 ? "dark" : "mixed",
    color,
  }];
}

export async function analyzeImageWithOpenCV(file: File): Promise<OpenCVDetectionResult> {
  await loadOpenCV();

  if (!window.cv || !window.cv.Mat) {
    throw new Error("OpenCV.js is not available");
  }

  const cv = window.cv;
  const img = await fileToImage(file);
  const { canvas, ctx } = createCanvasFromImage(img);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const src = cv.matFromImageData(imageData);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const faces = await detectFaces(cv, gray, canvas.width, canvas.height);
  const text = detectText(cv, gray.clone(), canvas.width, canvas.height);
  const signatures = detectSignatures(cv, gray.clone(), canvas.width, canvas.height);
  const backgrounds = detectBackground(cv, src);

  src.delete();
  gray.delete();

  const components = [
    ...(faces.length ? ["faces"] : []),
    ...(text.length ? ["text"] : []),
    ...(signatures.length ? ["signatures"] : []),
    ...(backgrounds.length ? ["background"] : []),
  ];

  return {
    faces: faces.map((face) => ({
      ...face,
      x: face.x * 100,
      y: face.y * 100,
      width: face.width * 100,
      height: face.height * 100,
    })),
    text: text.map((item) => ({
      ...item,
      x: item.x * 100,
      y: item.y * 100,
      width: item.width * 100,
      height: item.height * 100,
    })),
    signatures: signatures.map((sig) => ({
      x: sig.x * 100,
      y: sig.y * 100,
      width: sig.width * 100,
      height: sig.height * 100,
    })),
    codes: [],
    backgrounds,
    components,
  };
}
