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
  const rows = 18;
  const modules = 152;
  const moduleW = 3;
  const rowH = 4;
  const x0 = 12;
  const y0 = 8;

  for (let row = 0; row < rows; row += 1) {
    const y = y0 + row * rowH;

    // PDF417-like start/stop guard texture. Deliberately non-standard.
    ctx.fillRect(x0, y, 3, rowH - 1);
    ctx.fillRect(x0 + 6, y, 2, rowH - 1);
    ctx.fillRect(x0 + modules * moduleW - 9, y, 2, rowH - 1);
    ctx.fillRect(x0 + modules * moduleW - 4, y, 3, rowH - 1);

    let x = x0 + 14;
    while (x < x0 + modules * moduleW - 18) {
      const i = row * modules + Math.floor((x - x0) / moduleW);
      const run = bitAt(seed, i) ? 1 + (i % 4) : 1 + (i % 3);
      if (bitAt(seed, i + row)) {
        ctx.fillRect(x, y, Math.min(run * moduleW, x0 + modules * moduleW - 18 - x), rowH - 1);
      }
      x += run * moduleW + (bitAt(seed, i + 13) ? moduleW : 0);
    }
  }
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

const drawPostal = (ctx: CanvasRenderingContext2D, seed: string, kind: BarcodeKind) => {
  let y = 14;
  const x0 = 34;
  for (let i = 0; i < 72; i += 1) {
    const tall = bitAt(seed, i);
    const asc = kind === "imb" && bitAt(seed, i + 17);
    const desc = kind === "imb" && bitAt(seed, i + 29);
    const x = x0 + (i % 4) * 6;
    const barY = y + (asc ? 0 : 9);
    const height = kind === "imb"
      ? (asc && desc ? 38 : tall ? 30 : 20)
      : tall ? 38 : 18;
    ctx.fillRect(x, barY, 2, height);
    if (i % 4 === 3) y += 9;
  }
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
    postnet: [92, 720],
    imb: [92, 720],
  };
  const [width, height] = dimensions[kind];
  const { canvas, ctx } = createCanvas(width, height);

  if (kind === "pdf417") {
    drawPdf417(ctx, text);
  } else if (kind === "code128") {
    drawLinear(ctx, `${payload.serialNumber}|${payload.documentId}|${text}`);
  } else if (kind === "upc") {
    const numeric = `${payload.serialNumber}${payload.documentId}`.replace(/\D/g, "").padEnd(12, "0").slice(0, 12);
    drawLinear(ctx, numeric, numeric);
  } else {
    drawPostal(ctx, `${payload.zipCode}${payload.deliveryPoint}${payload.documentId}${text}`, kind);
    ctx.save();
    ctx.translate(12, height - 16);
    ctx.rotate(-Math.PI / 2);
    ctx.font = "500 12px ui-monospace, monospace";
    ctx.fillText(`${payload.zipCode || "00000"} ${payload.deliveryPoint || "00"}`, 0, 0);
    ctx.restore();
  }

  return canvas.toDataURL("image/png");
};
