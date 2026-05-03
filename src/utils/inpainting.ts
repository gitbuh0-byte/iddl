/**
 * Image Inpainting Utility
 * Removes selected regions from images and fills them with background content
 * Using OpenCV.js for advanced inpainting
 */

declare global {
  interface Window {
    cv: any;
    onOpenCvReady: () => void;
  }
}

export interface InpaintingParams {
  canvas: HTMLCanvasElement;
  mask: HTMLCanvasElement; // Binary mask where white (255) indicates areas to inpaint
  method?: 'telea' | 'ns'; // OpenCV inpainting methods
}

/**
 * Simple blur-based inpainting (fallback method)
 * Blurs the region and blends it with surroundings for a smooth transition
 */
function blurInpaint(canvas: HTMLCanvasElement, mask: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  const maskCtx = mask.getContext('2d');
  
  if (!ctx || !maskCtx) throw new Error('Failed to get canvas context');

  // Create output canvas
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const outCtx = output.getContext('2d');
  if (!outCtx) throw new Error('Failed to create output context');

  // Copy original image
  outCtx.drawImage(canvas, 0, 0);

  // Apply multiple blur passes to inpainting region
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const maskData = maskCtx.getImageData(0, 0, mask.width, mask.height);
  
  const pixels = imageData.data;
  const maskPixels = maskData.data;

  // Find bounds of masked region
  let minX = canvas.width, maxX = 0, minY = canvas.height, maxY = 0;
  for (let i = 0; i < maskPixels.length; i += 4) {
    if (maskPixels[i + 3] > 128) { // Alpha > 128
      const pixelIndex = i / 4;
      const x = pixelIndex % canvas.width;
      const y = Math.floor(pixelIndex / canvas.width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  // Expand region slightly
  const expand = 10;
  minX = Math.max(0, minX - expand);
  minY = Math.max(0, minY - expand);
  maxX = Math.min(canvas.width, maxX + expand);
  maxY = Math.min(canvas.height, maxY + expand);

  // Apply Gaussian-like blur to masked region
  for (let pass = 0; pass < 3; pass++) {
    const tempData = outCtx.getImageData(minX, minY, maxX - minX, maxY - minY);
    const tempPixels = tempData.data;

    // Simple box blur
    const blurred = new Uint8ClampedArray(tempPixels.length);
    const kernelSize = 3;
    
    for (let i = 0; i < tempPixels.length; i += 4) {
      const pixelIdx = i / 4;
      const x = pixelIdx % (maxX - minX);
      const y = Math.floor(pixelIdx / (maxX - minX));

      let r = 0, g = 0, b = 0, a = 0, count = 0;

      for (let ky = -kernelSize; ky <= kernelSize; ky++) {
        for (let kx = -kernelSize; kx <= kernelSize; kx++) {
          const nx = x + kx;
          const ny = y + ky;
          if (nx >= 0 && nx < (maxX - minX) && ny >= 0 && ny < (maxY - minY)) {
            const idx = (ny * (maxX - minX) + nx) * 4;
            r += tempPixels[idx];
            g += tempPixels[idx + 1];
            b += tempPixels[idx + 2];
            a += tempPixels[idx + 3];
            count++;
          }
        }
      }

      blurred[i] = r / count;
      blurred[i + 1] = g / count;
      blurred[i + 2] = b / count;
      blurred[i + 3] = a / count;
    }

    tempData.data.set(blurred);
    outCtx.putImageData(tempData, minX, minY);
  }

  return output;
}

/**
 * Removes the masked pixels by sampling the nearest surrounding background.
 * Unlike OpenCV inpaint on large regions, this never writes outside the white mask.
 */
export function removeMaskedRegionPreserveBackground(
  canvas: HTMLCanvasElement,
  mask: HTMLCanvasElement
): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const maskCtx = mask.getContext('2d', { willReadFrequently: true });
  if (!ctx || !maskCtx) throw new Error('Failed to get canvas context');

  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const outCtx = output.getContext('2d', { willReadFrequently: true });
  if (!outCtx) throw new Error('Failed to create output context');
  outCtx.drawImage(canvas, 0, 0);

  const sourceData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const outputData = outCtx.getImageData(0, 0, output.width, output.height);
  const maskData = maskCtx.getImageData(0, 0, mask.width, mask.height);
  const source = sourceData.data;
  const pixels = outputData.data;
  const maskPixels = maskData.data;
  const masked = new Uint8Array(canvas.width * canvas.height);

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const pixelIndex = y * canvas.width + x;
      const maskIndex = pixelIndex * 4;
      if (maskPixels[maskIndex] > 128) {
        masked[pixelIndex] = 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) return output;

  const fallback = [0, 0, 0, 0];
  let fallbackCount = 0;
  const ringPadding = 12;
  const ringMinX = Math.max(0, minX - ringPadding);
  const ringMinY = Math.max(0, minY - ringPadding);
  const ringMaxX = Math.min(canvas.width - 1, maxX + ringPadding);
  const ringMaxY = Math.min(canvas.height - 1, maxY + ringPadding);

  for (let y = ringMinY; y <= ringMaxY; y++) {
    for (let x = ringMinX; x <= ringMaxX; x++) {
      const inSelectedBox = x >= minX && x <= maxX && y >= minY && y <= maxY;
      const pixelIndex = y * canvas.width + x;
      if (!inSelectedBox && !masked[pixelIndex]) {
        const i = pixelIndex * 4;
        fallback[0] += source[i];
        fallback[1] += source[i + 1];
        fallback[2] += source[i + 2];
        fallback[3] += source[i + 3];
        fallbackCount++;
      }
    }
  }

  if (fallbackCount > 0) {
    fallback[0] /= fallbackCount;
    fallback[1] /= fallbackCount;
    fallback[2] /= fallbackCount;
    fallback[3] /= fallbackCount;
  } else {
    fallback[3] = 255;
  }

  const getUnmaskedAverage = (x: number, y: number, radius = 3) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    let count = 0;

    for (let yy = Math.max(0, y - radius); yy <= Math.min(canvas.height - 1, y + radius); yy++) {
      for (let xx = Math.max(0, x - radius); xx <= Math.min(canvas.width - 1, x + radius); xx++) {
        const pixelIndex = yy * canvas.width + xx;
        if (masked[pixelIndex]) continue;
        const i = pixelIndex * 4;
        r += source[i];
        g += source[i + 1];
        b += source[i + 2];
        a += source[i + 3];
        count++;
      }
    }

    return count > 0 ? [r / count, g / count, b / count, a / count] : fallback;
  };

  const leftSamples: Array<number[] | null> = new Array(canvas.height).fill(null);
  const rightSamples: Array<number[] | null> = new Array(canvas.height).fill(null);
  const topSamples: Array<number[] | null> = new Array(canvas.width).fill(null);
  const bottomSamples: Array<number[] | null> = new Array(canvas.width).fill(null);

  for (let y = minY; y <= maxY; y++) {
    for (let sx = minX - 1; sx >= 0; sx--) {
      if (!masked[y * canvas.width + sx]) {
        leftSamples[y] = getUnmaskedAverage(sx, y);
        break;
      }
    }
    for (let sx = maxX + 1; sx < canvas.width; sx++) {
      if (!masked[y * canvas.width + sx]) {
        rightSamples[y] = getUnmaskedAverage(sx, y);
        break;
      }
    }
  }

  for (let x = minX; x <= maxX; x++) {
    for (let sy = minY - 1; sy >= 0; sy--) {
      if (!masked[sy * canvas.width + x]) {
        topSamples[x] = getUnmaskedAverage(x, sy);
        break;
      }
    }
    for (let sy = maxY + 1; sy < canvas.height; sy++) {
      if (!masked[sy * canvas.width + x]) {
        bottomSamples[x] = getUnmaskedAverage(x, sy);
        break;
      }
    }
  }

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const pixelIndex = y * canvas.width + x;
      if (!masked[pixelIndex]) continue;

      const candidates = [
        { color: leftSamples[y], weight: 1 / Math.max(1, x - minX + 1) },
        { color: rightSamples[y], weight: 1 / Math.max(1, maxX - x + 1) },
        { color: topSamples[x], weight: 1 / Math.max(1, y - minY + 1) },
        { color: bottomSamples[x], weight: 1 / Math.max(1, maxY - y + 1) },
      ].filter((candidate): candidate is { color: number[]; weight: number } => Boolean(candidate.color));

      let color = fallback;
      if (candidates.length > 0) {
        const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0);
        color = [0, 0, 0, 0];
        candidates.forEach((candidate) => {
          const factor = candidate.weight / totalWeight;
          color[0] += candidate.color[0] * factor;
          color[1] += candidate.color[1] * factor;
          color[2] += candidate.color[2] * factor;
          color[3] += candidate.color[3] * factor;
        });
      }

      const i = pixelIndex * 4;
      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
      pixels[i + 3] = color[3];
    }
  }

  // Smooth only the replaced pixels so the surrounding document remains untouched.
  for (let pass = 0; pass < 2; pass++) {
    const previous = new Uint8ClampedArray(pixels);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const pixelIndex = y * canvas.width + x;
        if (!masked[pixelIndex]) continue;

        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let count = 0;

        for (let yy = Math.max(0, y - 1); yy <= Math.min(canvas.height - 1, y + 1); yy++) {
          for (let xx = Math.max(0, x - 1); xx <= Math.min(canvas.width - 1, x + 1); xx++) {
            const i = (yy * canvas.width + xx) * 4;
            r += previous[i];
            g += previous[i + 1];
            b += previous[i + 2];
            a += previous[i + 3];
            count++;
          }
        }

        const i = pixelIndex * 4;
        pixels[i] = r / count;
        pixels[i + 1] = g / count;
        pixels[i + 2] = b / count;
        pixels[i + 3] = a / count;
      }
    }
  }

  outCtx.putImageData(outputData, 0, 0);
  return output;
}

/**
 * Inpaint an image region using OpenCV
 */
export async function inpaintImage(params: InpaintingParams): Promise<HTMLCanvasElement> {
  const { canvas, mask, method = 'telea' } = params;

  try {
    // Use OpenCV inpainting if available
    if (window.cv && window.cv.Mat && window.cv.inpaint) {
      return await inpaintImageWithOpenCV(canvas, mask, method);
    }

    // Fallback to blur-based inpainting
    console.warn('OpenCV not available, using fallback blur-based inpainting');
    return blurInpaint(canvas, mask);
  } catch (error) {
    console.error('Inpainting error:', error);
    // Last resort: try blur-based inpainting
    console.warn('Falling back to blur-based inpainting due to error:', error);
    try {
      return blurInpaint(canvas, mask);
    } catch (fallbackError) {
      console.error('Fallback blur inpainting also failed:', fallbackError);
      throw new Error(`Text removal failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * Inpaint using OpenCV.js
 */
async function inpaintImageWithOpenCV(
  canvas: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  method: 'telea' | 'ns'
): Promise<HTMLCanvasElement> {
  const cv = window.cv;

  // Convert canvas to Mat
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const src = cv.matFromImageData(imageData);

  if (src.empty()) {
    throw new Error('Failed to create source Mat from canvas');
  }

  const srcBGR = new cv.Mat();
  cv.cvtColor(src, srcBGR, cv.COLOR_RGBA2BGR);

  // Convert mask to Mat
  const maskCtx = mask.getContext('2d');
  if (!maskCtx) throw new Error('Failed to get mask context');

  const maskImageData = maskCtx.getImageData(0, 0, mask.width, mask.height);
  const maskMat = cv.matFromImageData(maskImageData);

  if (maskMat.empty()) {
    throw new Error('Failed to create mask Mat');
  }

  const maskGray = new cv.Mat();
  cv.cvtColor(maskMat, maskGray, cv.COLOR_RGBA2GRAY);

  // Perform inpainting
  const dst = new cv.Mat();
  const radius = 3;

  const inpaintMethod = method === 'ns' ? cv.INPAINT_NS : cv.INPAINT_TELEA;
  cv.inpaint(srcBGR, maskGray, dst, radius, inpaintMethod);

  // Convert result back to RGBA
  const dstRGBA = new cv.Mat();
  cv.cvtColor(dst, dstRGBA, cv.COLOR_BGR2RGBA);

  // Draw on output canvas
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  cv.imshow(outputCanvas, dstRGBA);

  // Cleanup
  src.delete();
  srcBGR.delete();
  maskMat.delete();
  maskGray.delete();
  dst.delete();
  dstRGBA.delete();

  return outputCanvas;
}

/**
 * Create a binary mask from a region
 */
export function createMask(
  width: number,
  height: number,
  regions: Array<{ x: number; y: number; width: number; height: number }>,
  padding = 0
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  // Start with black (0 = don't inpaint)
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, width, height);

  // Draw white regions to mark for inpainting
  ctx.fillStyle = 'white';
  regions.forEach(region => {
    const px = region.x * width;
    const py = region.y * height;
    const pw = region.width * width;
    const ph = region.height * height;

    // Keep mask bounds exact by default so inpainting never reaches beyond the selected area.
    const x0 = Math.max(0, px - padding);
    const y0 = Math.max(0, py - padding);
    const x1 = Math.min(width, px + pw + padding);
    const y1 = Math.min(height, py + ph + padding);

    ctx.fillRect(
      x0,
      y0,
      Math.max(0, x1 - x0),
      Math.max(0, y1 - y0)
    );
  });

  return canvas;
}

/**
 * Dilate the mask to ensure complete coverage
 */
export function dilateMask(mask: HTMLCanvasElement, iterations: number = 2): HTMLCanvasElement {
  try {
    if (!window.cv || !window.cv.Mat) {
      console.warn('OpenCV not available for mask dilation, returning original mask');
      return mask;
    }

    const cv = window.cv;
    const ctx = mask.getContext('2d');
    if (!ctx) throw new Error('Failed to get mask context');

    const maskImageData = ctx.getImageData(0, 0, mask.width, mask.height);
    const maskMat = cv.matFromImageData(maskImageData);

    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5));
    const dilated = new cv.Mat();
    cv.dilate(maskMat, dilated, kernel, new cv.Point(-1, -1), iterations);

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = mask.width;
    outputCanvas.height = mask.height;
    cv.imshow(outputCanvas, dilated);

    maskMat.delete();
    kernel.delete();
    dilated.delete();

    return outputCanvas;
  } catch (error) {
    console.warn('Mask dilation error, returning original mask:', error);
    return mask;
  }
}

/**
 * Load OpenCV.js with improved error handling and fallback
 */
export function loadOpenCV(): Promise<void> {
  return new Promise((resolve) => {
    if (window.cv && window.cv.Mat) {
      console.log('OpenCV.js already loaded');
      resolve();
      return;
    }

    console.log('Loading OpenCV.js...');

    // Try loading from CDN first
    const script = document.createElement('script');
    script.src = 'https://docs.opencv.org/4.5.5/opencv.js';
    script.async = true;

    let checkAttempts = 0;
    const maxAttempts = 200; // 20 seconds

    const checkLoaded = () => {
      checkAttempts++;

      if (window.cv && window.cv.Mat) {
        clearInterval(checkInterval);
        console.log('✓ OpenCV.js initialized successfully');
        resolve();
      } else if (checkAttempts >= maxAttempts) {
        clearInterval(checkInterval);
        console.warn('OpenCV.js load timeout, trying alternative CDN...');

        // Try alternative CDN
        const altScript = document.createElement('script');
        altScript.src = 'https://cdn.jsdelivr.net/npm/opencv.js@4.5.5/opencv.js';
        altScript.async = true;

        let altAttempts = 0;
        const altMaxAttempts = 200;

        const altCheckInterval = setInterval(() => {
          altAttempts++;

          if (window.cv && window.cv.Mat) {
            clearInterval(altCheckInterval);
            console.log('✓ OpenCV.js loaded from alternative CDN');
            resolve();
          } else if (altAttempts >= altMaxAttempts) {
            clearInterval(altCheckInterval);
            console.warn('Alternative CDN also failed, using blur-based fallback');
            resolve(); // Still resolve to allow blur-based inpainting
          }
        }, 100);

        altScript.onload = () => {
          console.log('Alternative OpenCV.js script loaded, waiting for initialization...');
        };

        altScript.onerror = () => {
          console.error('Failed to load OpenCV.js from alternative CDN');
          console.log('Using blur-based inpainting fallback');
          resolve();
        };

        document.head.appendChild(altScript);
      }
    };

    const checkInterval = setInterval(checkLoaded, 100);

    script.onload = () => {
      console.log('OpenCV.js script loaded, waiting for initialization...');
    };

    script.onerror = () => {
      console.error('Failed to load OpenCV.js from primary CDN, trying alternative...');

      // Try alternative immediately
      const altScript = document.createElement('script');
      altScript.src = 'https://cdn.jsdelivr.net/npm/opencv.js@4.5.5/opencv.js';
      altScript.async = true;

      let altAttempts = 0;
      const altMaxAttempts = 200;

      const altCheckInterval = setInterval(() => {
        altAttempts++;

        if (window.cv && window.cv.Mat) {
          clearInterval(altCheckInterval);
          console.log('✓ OpenCV.js loaded from alternative CDN');
          resolve();
        } else if (altAttempts >= altMaxAttempts) {
          clearInterval(altCheckInterval);
          console.warn('OpenCV.js load failed, using blur-based fallback');
          resolve();
        }
      }, 100);

      altScript.onload = () => {
        console.log('Alternative OpenCV.js script loaded, waiting for initialization...');
      };

      altScript.onerror = () => {
        console.error('Failed to load OpenCV.js from both CDNs');
        console.log('Using blur-based inpainting fallback');
        resolve();
      };

      document.head.appendChild(altScript);
    };

    document.head.appendChild(script);

    // 40 second total timeout
    setTimeout(() => {
      if (!window.cv || !window.cv.Mat) {
        console.warn('OpenCV.js load timeout, using fallback mode');
        resolve();
      }
    }, 40000);
  });
}
