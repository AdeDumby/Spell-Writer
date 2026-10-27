import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Glyph from "../components/Glyph.jsx";
import { LAYOUTS, binaryOf, resolveColors } from "./spell.js";
import { exportBinary } from "./platform.js";

/* ------------------------------------------------------------------ */
/*  Exporting a spell as PNG / JPG / PDF / SVG                         */
/*                                                                     */
/*  Everything takes a plain spell-like object:                        */
/*    { name, notes, layout, colors, parts, updatedAt, showGaps? }     */
/*  so it works for a saved spell and for the draft in the Quill.      */
/* ------------------------------------------------------------------ */

export const FORMATS = {
  png: { label: "PNG image", ext: "png", mime: "image/png", hint: "Transparent corners" },
  jpg: { label: "JPG image", ext: "jpg", mime: "image/jpeg", hint: "Smaller file" },
  pdf: { label: "PDF page", ext: "pdf", mime: "application/pdf", hint: "Glyph + details + description" },
  svg: { label: "SVG vector", ext: "svg", mime: "image/svg+xml", hint: "Scales without blur" },
};

const BG = "#0b0d17";

/** A filesystem-friendly name made from the spell's name. */
export const fileSlug = (name) =>
  String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "spell";

/* ---------------- the glyph as an image ---------------- */

/** The glyph as a standalone SVG string, rendered by the very same component the app uses. */
export function spellSvg(spell) {
  const colors = resolveColors(spell.parts, spell.colors);
  return renderToStaticMarkup(
    createElement(Glyph, {
      parts: spell.parts,
      layout: spell.layout,
      colors,
      showGaps: spell.showGaps ?? true,
    })
  );
}

const svgSize = (svg) => {
  const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
  if (!m) throw new Error("Could not read the glyph size");
  return { w: Number(m[1]), h: Number(m[2]) };
};

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not draw the glyph"));
    img.src = src;
  });

/** Draw the glyph onto a canvas, sharp at about `targetWidth` pixels wide. */
async function rasterize(svg, { targetWidth = 2000, background = null } = {}) {
  const { w, h } = svgSize(svg);
  const scale = Math.min(6, Math.max(2, targetWidth / w));
  const img = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d");
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return { canvas, w, h };
}

const canvasToBlob = (canvas, mime, quality) =>
  new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image"))), mime, quality)
  );

/* ---------------- PDF ---------------- */

// The built-in PDF fonts only cover Western European characters, so anything else becomes "?"
// rather than garbage. Curly quotes, dashes and ellipses are mapped to plain equivalents first.
const pdfSafe = (s) =>
  String(s ?? "")
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/\t/g, "    ")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\n -~ -ÿ]/g, "?");

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

// Palette colours are bright (made for a dark background); darken them so text stays readable on white.
function darken(hex, maxLightness = 0.38) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  l = Math.min(l, maxLightness);
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) return [l, l, l].map((v) => Math.round(v * 255));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)].map((v) => Math.round(v * 255));
}

/**
 * One A4 page.
 *   - "line" glyphs (pdfSide: "top")   -> portrait, glyph across the top, details below on the left.
 *   - everything else (pdfSide: "right") -> landscape, glyph on the right, details on the left.
 *   - The description is always written across the bottom.
 */
async function buildPdf(spell) {
  const { jsPDF } = await import("jspdf");
  const layout = LAYOUTS[spell.layout] ?? LAYOUTS.line;
  const glyphOnTop = (layout.pdfSide ?? "right") === "top";
  const colors = resolveColors(spell.parts, spell.colors);

  const svg = spellSvg(spell);
  const { canvas, w: gw, h: gh } = await rasterize(svg, { targetWidth: 2400 });
  const glyphPng = canvas.toDataURL("image/png");

  const doc = new jsPDF({ orientation: glyphOnTop ? "portrait" : "landscape", unit: "mm", format: "a4" });
  doc.setProperties({ title: pdfSafe(spell.name), creator: "Spell Writer" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 14;
  const INK = [22, 26, 44];
  const MUTED = [112, 120, 144];
  const RULE = [210, 214, 226];

  // Description zone along the bottom; glyph and details share what is above it.
  const descH = glyphOnTop ? 64 : 42;
  const descTop = PH - M - descH;
  const upperBottom = descTop - 7;

  // ----- glyph placement (centred inside its box, keeping its proportions) -----
  let box;
  let detailsX = M;
  let detailsW;
  let detailsTop;
  if (glyphOnTop) {
    box = { x: M, y: M, w: PW - 2 * M, h: 120 };
  } else {
    const leftW = 112;
    const gx = M + leftW + 10;
    box = { x: gx, y: M, w: PW - M - gx, h: upperBottom - M };
    detailsW = leftW;
    detailsTop = M;
  }
  const fit = Math.min(box.w / gw, box.h / gh);
  const dw = gw * fit;
  const dh = gh * fit;
  const gxPos = box.x + (box.w - dw) / 2;
  const gyPos = glyphOnTop ? box.y : box.y + (box.h - dh) / 2;
  doc.addImage(glyphPng, "PNG", gxPos, gyPos, dw, dh, undefined, "FAST");
  if (glyphOnTop) {
    detailsW = PW - 2 * M;
    detailsTop = gyPos + dh + 11;
  }
  const detailsRight = detailsX + detailsW;

  // Shorten text with "..." so it fits `max` mm in the font currently set on the document.
  const fitText = (text, max) => {
    let t = text;
    if (doc.getTextWidth(t) <= max) return t;
    while (t.length > 1 && doc.getTextWidth(t + "...") > max) t = t.slice(0, -1);
    return t + "...";
  };

  // ----- name and subtitle (two lines at most) -----
  let y = detailsTop;
  doc.setFont("helvetica", "bold").setFontSize(21).setTextColor(...INK);
  const allNameLines = doc.splitTextToSize(pdfSafe(spell.name), detailsW);
  const nameLines = allNameLines.slice(0, 2);
  if (allNameLines.length > 2) nameLines[1] = fitText(nameLines[1] + " ...", detailsW);
  doc.text(nameLines, detailsX, y + 6.5);
  y += 6.5 + (nameLines.length - 1) * 8.5;

  const bitCount = binaryOf(spell.parts).length;
  const date = new Date(spell.updatedAt || Date.now()).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
  doc.text(`${layout.label} representation · ${bitCount} bits · ${date}`, detailsX, y + 6);
  y += 14;

  // ----- the binary, one colour per category, wrapping if it is long -----
  doc.setFont("courier", "bold").setFontSize(13);
  const gap = doc.getTextWidth(" ") * 1.1;
  let bx = detailsX;
  let by = y + 4;
  spell.parts.forEach((p, i) => {
    const wBits = doc.getTextWidth(p.bits);
    if (bx > detailsX && bx + wBits > detailsRight) {
      bx = detailsX;
      by += 6.5;
    }
    doc.setTextColor(...darken(colors[i]));
    doc.text(p.bits, bx, by);
    bx += wBits + gap;
  });
  y = by + 8;

  // ----- details "written out loud": Category   Field   bits -----
  const bottom = upperBottom;
  const MIN_ROW = 5;
  const avail = bottom - y;
  let rows = spell.parts.length;
  let hidden = 0;
  if (rows * MIN_ROW > avail) {
    // Not enough room for everything: keep what fits and say how many are left out.
    rows = Math.max(1, Math.floor((avail - MIN_ROW) / MIN_ROW));
    hidden = spell.parts.length - rows;
  }
  const rowH = Math.min(8.6, avail / (rows + (hidden ? 1 : 0)));
  const catColW = Math.min(36, detailsW * 0.3);
  doc.setFont("courier", "bold").setFontSize(11);
  const bitsColW = Math.max(...spell.parts.map((p) => doc.getTextWidth(p.bits)), 8);
  const fieldMax = detailsW - 7 - catColW - bitsColW - 4;

  doc.setDrawColor(...RULE).setLineWidth(0.2);
  for (let i = 0; i < rows; i++) {
    const p = spell.parts[i];
    const top = y + i * rowH;
    const base = top + rowH * 0.64;
    doc.line(detailsX, top, detailsRight, top);

    doc.setFillColor(...hexToRgb(colors[i])).setDrawColor(...RULE);
    doc.rect(detailsX, top + rowH / 2 - 1.6, 3.2, 3.2, "FD");

    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...MUTED);
    doc.text(fitText(pdfSafe(p.category), catColW - 2), detailsX + 7, base);

    doc.setFont("helvetica", "bold").setFontSize(11).setTextColor(...INK);
    doc.text(fitText(pdfSafe(p.field) || "-", fieldMax), detailsX + 7 + catColW, base);

    doc.setFont("courier", "bold").setFontSize(11).setTextColor(...darken(colors[i]));
    doc.text(p.bits, detailsRight, base, { align: "right" });
  }
  const tableEnd = y + rows * rowH;
  doc.setDrawColor(...RULE).line(detailsX, tableEnd, detailsRight, tableEnd);
  if (hidden) {
    doc.setFont("helvetica", "italic").setFontSize(9).setTextColor(...MUTED);
    doc.text(`+ ${hidden} more ${hidden === 1 ? "category" : "categories"} not shown`, detailsX, tableEnd + 5.2);
  }

  // ----- description across the bottom -----
  doc.setDrawColor(...RULE).setLineWidth(0.3).line(M, descTop, PW - M, descTop);
  doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...MUTED);
  doc.text("DESCRIPTION", M, descTop + 6, { charSpace: 0.6 });

  const notes = pdfSafe(spell.notes).trim();
  const LINE = 4.9;
  const textTop = descTop + 12.5;
  const maxLines = Math.max(1, Math.floor((PH - M - textTop) / LINE) + 1);
  doc.setFont("helvetica", notes ? "normal" : "italic").setFontSize(10.5);
  doc.setTextColor(...(notes ? INK : MUTED));
  let lines = doc.splitTextToSize(notes || "No description.", PW - 2 * M);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = fitText(lines[maxLines - 1], PW - 2 * M - 4).replace(/\.\.\.$/, "") + "...";
  }
  doc.text(lines, M, textTop);

  return new Blob([doc.output("arraybuffer")], { type: "application/pdf" });
}

/* ---------------- public API ---------------- */

/** Render the spell in the given format and return it as a Blob. */
export async function renderSpell(spell, format) {
  switch (format) {
    case "svg":
      return new Blob([spellSvg(spell)], { type: FORMATS.svg.mime });
    case "png": {
      const { canvas } = await rasterize(spellSvg(spell), { targetWidth: 2000 });
      return canvasToBlob(canvas, FORMATS.png.mime);
    }
    case "jpg": {
      // JPG has no transparency, so the glyph's rounded corners get the same dark backdrop.
      const { canvas } = await rasterize(spellSvg(spell), { targetWidth: 2000, background: BG });
      return canvasToBlob(canvas, FORMATS.jpg.mime, 0.95);
    }
    case "pdf":
      return buildPdf(spell);
    default:
      throw new Error(`Unknown export format: ${format}`);
  }
}

/** Render and save. Returns the saved path (or file name), or null if the user cancelled. */
export async function exportSpell(spell, format) {
  const f = FORMATS[format];
  if (!f) throw new Error(`Unknown export format: ${format}`);
  const blob = await renderSpell(spell, format);
  return exportBinary(`${fileSlug(spell.name)}.${f.ext}`, blob, f.mime);
}
