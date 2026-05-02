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
  regions: Array<{ x: number; y: number; width: number; height: number }>
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

    // Add padding to regions
    const padding = 8;
    ctx.fillRect(
      Math.max(0, px - padding),
      Math.max(0, py - padding),
      Math.min(width, pw + padding * 2),
      Math.min(height, ph + padding * 2)
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
