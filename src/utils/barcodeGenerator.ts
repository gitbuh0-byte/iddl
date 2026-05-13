export type BarcodeKind = "pdf417" | "code128" | "upc" | "postnet" | "imb";

export interface BarcodePayload {
  fullName: string;
  dob: string;
  gender: string;
  licenseNumber: string;
  issueDate: string;
  expirationDate: string;
  address: string;
  licenseClass: string;
  restrictions: string;
  serialNumber: string;
  documentId: string;
  zipCode: string;
  deliveryPoint: string;
}

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36).toUpperCase();
};

const bitAt = (seed: string, index: number) => {
  const char = seed.charCodeAt(index % Math.max(1, seed.length)) || 71;
  return ((char * 1103515245 + index * 12345 + index ** 2) >>> 0) % 11 < 5;
};

const createCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create barcode canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#050505";
  return { canvas, ctx };
};

const drawQuietZone = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#050505";
};

export const buildBarcodePayload = (kind: BarcodeKind, payload: BarcodePayload) => {
  const base = [
    "SYNTHETIC_TEST_FIXTURE",
    kind.toUpperCase(),
    payload.fullName || "SAMPLE PERSON",
    payload.dob || "1990-01-01",
    payload.gender || "X",
    payload.licenseNumber || "TST-ID-000000",
    payload.issueDate || "2026-01-01",
    payload.expirationDate || "2028-01-01",
    payload.address || "123 TEST ST SAMPLE CITY ST 00000",
    payload.licenseClass || "TEST-C",
    payload.restrictions || "TEST ONLY",
    payload.serialNumber || "SERIAL-0001",
    payload.documentId || "DOC-TEST-0001",
    payload.zipCode || "00000",
    payload.deliveryPoint || "00",
  ].join("|");

  return `${base}|SYNHASH=${hashString(base)}|NON_DECODABLE_SAMPLE`;
};

const drawPdf417 = (ctx: CanvasRenderingContext2D, seed: string) => {
  const rows = 26;
  const modules = 235;
  const moduleW = 2;
  const rowH = 3;
  const x0 = 12;
  const y0 = 6;

  for (let row = 0; row < rows; row += 1) {
    const y = y0 + row * rowH;

    // PDF417-like start/stop guard texture. Deliberately non-standard.
    ctx.fillRect(x0, y, 2, rowH);
    ctx.fillRect(x0 + 4, y, 2, rowH);
    ctx.fillRect(x0 + 8, y, 2, rowH);
    ctx.fillRect(x0 + modules * moduleW - 12, y, 2, rowH);
    ctx.fillRect(x0 + modules * moduleW - 8, y, 2, rowH);
    ctx.fillRect(x0 + modules * moduleW - 4, y, 2, rowH);

    let x = x0 + 16;
    while (x < x0 + modules * moduleW - 18) {
      const i = row * modules + Math.floor((x - x0) / moduleW);
      const run = 1 + ((seed.charCodeAt(i % seed.length) + row + i) % 5);
      if (bitAt(seed, i + row) || i % 7 === 0) {
        ctx.fillRect(x, y, Math.min(run * moduleW, x0 + modules * moduleW - 18 - x), rowH);
      }
      x += run * moduleW + (bitAt(seed, i + 13) ? moduleW : moduleW * 2);
    }
  }

  // Extra dark side guards like scanned back-of-card PDF417 blocks.
  ctx.fillRect(4, 5, 3, 80);
  ctx.fillRect(486, 5, 3, 80);
};

const drawLinear = (ctx: CanvasRenderingContext2D, seed: string, numericLabel?: string) => {
  let x = 10;
  const y = 6;
  const height = numericLabel ? 54 : 32;

  for (let i = 0; i < 170; i += 1) {
    const wide = bitAt(seed, i + 7);
    const barW = wide ? 3 : 1;
    const gap = bitAt(seed, i + 19) ? 2 : 1;
    if (i % 3 !== 1 || bitAt(seed, i)) {
      ctx.fillRect(x, y, barW, height + (i % 11 === 0 ? 8 : 0));
    }
    x += barW + gap;
    if (x > 470) break;
  }

  if (numericLabel) {
    ctx.font = "700 12px ui-monospace, monospace";
    ctx.fillText(numericLabel, 14, 82);
  }
};

const drawPostnet = (ctx: CanvasRenderingContext2D, seed: string, label: string) => {
  ctx.fillStyle = "#1e3a8a";
  const baseline = 34;
  let x = 8;
  for (let i = 0; i < 62; i += 1) {
    const tall = bitAt(seed, i) || i === 0 || i === 61;
    const h = tall ? 27 : 14;
    ctx.fillRect(x, baseline - h, 2, h);
    x += 5;
  }
  ctx.font = "600 10px ui-monospace, monospace";
  ctx.fillText(label.replace(/\D/g, "").slice(0, 8) || "123456", 130, 48);
  ctx.fillStyle = "#050505";
};

const drawImb = (ctx: CanvasRenderingContext2D, seed: string, label: string) => {
  let x = 8;
  const mid = 50;
  for (let i = 0; i < 96; i += 1) {
    const asc = bitAt(seed, i + 11);
    const desc = bitAt(seed, i + 29);
    const full = bitAt(seed, i + 47);
    const y = full || asc ? 12 : mid - 4;
    const h = full ? 72 : asc && desc ? 58 : asc ? 42 : desc ? 42 : 24;
    ctx.fillRect(x, y, 3, h);
    x += bitAt(seed, i + 7) ? 6 : 5;
  }
  ctx.font = "700 28px ui-monospace, monospace";
  const digits = (label.replace(/\D/g, "").padEnd(24, "0").slice(0, 24).match(/.{1,4}/g) || []).join(" ");
  ctx.fillText(digits, 76, 138);
};

export const generateTestBarcodeDataUrl = (
  kind: BarcodeKind,
  payload: BarcodePayload
) => {
  const text = buildBarcodePayload(kind, payload);
  const dimensions: Record<BarcodeKind, [number, number]> = {
    pdf417: [492, 92],
    code128: [492, 48],
    upc: [492, 92],
    postnet: [320, 56],
    imb: [552, 152],
  };
  const [width, height] = dimensions[kind];
  const { canvas, ctx } = createCanvas(width, height);
  drawQuietZone(ctx, width, height);

  if (kind === "pdf417") {
    drawPdf417(ctx, text);
  } else if (kind === "code128") {
    drawLinear(ctx, `${payload.serialNumber}|${payload.documentId}|${text}`);
  } else if (kind === "upc") {
    const numeric = `${payload.serialNumber}${payload.documentId}`.replace(/\D/g, "").padEnd(12, "0").slice(0, 12);
    drawLinear(ctx, numeric, numeric);
  } else {
    const postalSeed = `${payload.zipCode}${payload.deliveryPoint}${payload.documentId}${text}`;
    if (kind === "postnet") {
      drawPostnet(ctx, postalSeed, `${payload.zipCode}${payload.deliveryPoint}`);
    } else {
      drawImb(ctx, postalSeed, `${payload.zipCode}${payload.deliveryPoint}${payload.documentId}`);
    }
  }

  return canvas.toDataURL("image/png");
};
