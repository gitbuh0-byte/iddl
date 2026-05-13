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
  return Math.abs(hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
};

const bitAt = (seed: string, index: number) => {
  const code = seed.charCodeAt(index % seed.length) || 31;
  return ((code * (index + 17) + index * 13) % 7) < 3;
};

const drawLabel = (ctx: CanvasRenderingContext2D, width: number, title: string, subtitle: string) => {
  ctx.fillStyle = "#ffffff";
  ctx.font = "700 20px ui-monospace, monospace";
  ctx.fillText(title, 24, 32);
  ctx.fillStyle = "#64748b";
  ctx.font = "700 11px ui-monospace, monospace";
  ctx.fillText(subtitle, 24, 52);
  ctx.fillStyle = "rgba(239,68,68,0.14)";
  ctx.font = "900 44px ui-monospace, monospace";
  ctx.translate(width / 2, 135);
  ctx.rotate(-0.12);
  ctx.textAlign = "center";
  ctx.fillText("SYNTHETIC TEST", 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.textAlign = "left";
};

const createCanvas = (width = 760, height = 280) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create barcode canvas");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(10, 10, width - 20, height - 20);
  ctx.fillStyle = "#ffffff";
  return { canvas, ctx };
};

export const buildBarcodePayload = (kind: BarcodeKind, payload: BarcodePayload) => {
  const base = [
    `TEST_ONLY=TRUE`,
    `KIND=${kind.toUpperCase()}`,
    `NAME=${payload.fullName || "SAMPLE PERSON"}`,
    `DOB=${payload.dob || "1990-01-01"}`,
    `GENDER=${payload.gender || "X"}`,
    `ID=${payload.licenseNumber || "TST-ID-000000"}`,
    `ISS=${payload.issueDate || "2026-01-01"}`,
    `EXP=${payload.expirationDate || "2028-01-01"}`,
    `ADDR=${payload.address || "123 TEST ST, SAMPLE CITY, ST 00000"}`,
    `CLASS=${payload.licenseClass || "TEST-C"}`,
    `RESTR=${payload.restrictions || "TEST ONLY"}`,
    `SERIAL=${payload.serialNumber || "SERIAL-0001"}`,
    `DOC=${payload.documentId || "DOC-TEST-0001"}`,
    `ZIP=${payload.zipCode || "00000"}`,
    `DP=${payload.deliveryPoint || "00"}`,
  ].join("|");

  return `${base}|TEST_HASH=${hashString(base)}|NOT_VALID_FOR_IDENTIFICATION`;
};

export const generateTestBarcodeDataUrl = (
  kind: BarcodeKind,
  payload: BarcodePayload
) => {
  const text = buildBarcodePayload(kind, payload);
  const { canvas, ctx } = createCanvas(kind === "postnet" || kind === "imb" ? 360 : 760, kind === "postnet" || kind === "imb" ? 520 : 280);
  const title = `${kind.toUpperCase()} TEST CODE`;
  drawLabel(ctx, canvas.width, title, "Synthetic QA fixture - not official or scannable as credential");
  ctx.fillStyle = "#ffffff";

  if (kind === "pdf417") {
    const rows = 12;
    const cols = 44;
    const x0 = 24;
    const y0 = 78;
    const cellW = 15;
    const cellH = 10;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (bitAt(text, row * cols + col)) {
          ctx.fillRect(x0 + col * cellW, y0 + row * cellH, cellW - 2, cellH - 1);
        }
      }
    }
  } else if (kind === "code128" || kind === "upc") {
    const seed = kind === "upc" ? `${payload.serialNumber}${payload.documentId}`.replace(/\D/g, "").padEnd(12, "0").slice(0, 12) : text;
    let x = 28;
    const y = 86;
    for (let i = 0; i < 96; i += 1) {
      const barW = bitAt(seed, i) ? 4 : 2;
      if (i % 2 === 0 || bitAt(seed, i + 5)) ctx.fillRect(x, y, barW, 108);
      x += barW + (bitAt(seed, i + 11) ? 3 : 2);
    }
    ctx.font = "700 18px ui-monospace, monospace";
    ctx.fillText(kind === "upc" ? seed : payload.documentId || "DOC-TEST-0001", 28, 226);
  } else {
    const seed = `${payload.zipCode}${payload.deliveryPoint}${payload.documentId}`.replace(/[^A-Z0-9]/gi, "");
    let y = 82;
    const x0 = 150;
    for (let i = 0; i < 72; i += 1) {
      const long = bitAt(seed || text, i);
      const width = kind === "imb" ? 4 : 3;
      const height = long ? 34 : 18;
      const x = x0 + (i % 4) * 12;
      ctx.fillRect(x, y, width, height);
      if (i % 4 === 3) y += 18;
    }
    ctx.font = "700 14px ui-monospace, monospace";
    ctx.fillText(`ZIP ${payload.zipCode || "00000"}-${payload.deliveryPoint || "00"}`, 32, canvas.height - 32);
  }

  ctx.fillStyle = "#38bdf8";
  ctx.font = "700 10px ui-monospace, monospace";
  const chunks = text.match(/.{1,82}/g) || [];
  chunks.slice(0, 2).forEach((line, index) => ctx.fillText(line, 24, canvas.height - 42 + index * 14));
  return canvas.toDataURL("image/png");
};
