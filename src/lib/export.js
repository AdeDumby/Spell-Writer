import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Glyph from "../components/Glyph.jsx";
import { LAYOUTS, binaryOf, resolveColors } from "./spell.js";
import { exportBinary } from "./platform.js";
import { hashSeed, makePaperCanvas } from "./paper.js";

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
  pdf: { label: "PDF page", ext: "pdf", mime: "application/pdf", hint: "A page for your spellbook" },
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

/**
 * The glyph as a standalone SVG string, rendered by the very same component the app uses.
 * `theme` is "dark" (on-screen look) or "paper" (pen-and-ink, used inside the PDF).
 */
export function spellSvg(spell, { theme = "dark", colors } = {}) {
  return renderToStaticMarkup(
    createElement(Glyph, {
      parts: spell.parts,
      layout: spell.layout,
      colors: colors ?? resolveColors(spell.parts, spell.colors),
      showGaps: spell.showGaps ?? true,
      theme,
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

// The PDF fonts cover Latin letters with accents and typographic punctuation (curly quotes, dashes, ellipsis).
// Characters they cannot draw (CJK, emoji...) are left out, so a page never shows blank boxes or stray "?".
const pdfSafe = (s) =>
  String(s ?? "")
    .replace(/\t/g, "    ")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\n\u0020-\u007E\u00A0-\u00FF\u0152\u0153\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u20AC]/g, "")
    .replace(/[ \u00A0]{2,}/g, " ")
    .replace(/ +\n/g, "\n")
    .trim();

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");

// Palette colours are bright (made for a dark screen); darken them so they read like ink on paper.
function darken(hex, maxLightness = 0.36) {
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

const INK = [43, 29, 20]; // dark sepia
const SEPIA = [124, 90, 56]; // softer brown for labels and rules

/** A cubic bezier from (x0,y0) to (x1,y1). */
const bezier = (doc, x0, y0, c1x, c1y, c2x, c2y, x1, y1) =>
  doc.lines([[c1x - x0, c1y - y0, c2x - x0, c2y - y0, x1 - x0, y1 - y0]], x0, y0, [1, 1], "S");

/** A small hand-drawn-looking divider: a diamond in the middle with a wave and a dot on each side. */
function flourish(doc, cx, y, halfWidth) {
  doc.setDrawColor(...SEPIA).setFillColor(...INK).setLineWidth(0.3);
  doc.lines([[2, 2.4], [-2, 2.4], [-2, -2.4], [2, -2.4]], cx - 2, y, [1, 1], "F", true);
  for (const dir of [1, -1]) {
    const a = cx + dir * 4.5;
    const m = cx + dir * halfWidth * 0.5;
    const e = cx + dir * halfWidth;
    bezier(doc, a, y, cx + dir * halfWidth * 0.16, y - 2.6, cx + dir * halfWidth * 0.3, y + 2.6, m, y);
    bezier(doc, m, y, cx + dir * halfWidth * 0.68, y - 2.8, cx + dir * halfWidth * 0.84, y + 2.4, e, y - 0.4);
    doc.circle(e + dir * 1.2, y - 0.4, 0.55, "F");
  }
}

/** Greedy word wrap that lets the first lines be narrower (room for a drop cap). */
function wrapText(doc, text, widthFor) {
  const lines = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const trial = line ? `${line} ${word}` : word;
      if (line && doc.getTextWidth(trial) > widthFor(lines.length)) {
        lines.push(line);
        line = word;
      } else {
        line = trial;
      }
    }
    lines.push(line);
  }
  return lines;
}

/**
 * One portrait A4 page, written like a page from a spellbook:
 *   - parchment background, a thin border, calligraphic lettering
 *   - "line" glyphs (pdfSide: "top")      -> glyph across the top, then the title and the details
 *   - everything else (pdfSide: "right")  -> title at the top, details on the left, glyph on the right
 *   - the description runs along the bottom, opened with a drop cap
 * Only what a person would write is on the page: no bit strings, no representation names, no dates.
 */
async function buildPdf(spell) {
  const { jsPDF } = await import("jspdf");
  const { registerFonts, SCRIPT, ITALIC } = await import("./pdfFonts.js");
  const layout = LAYOUTS[spell.layout] ?? LAYOUTS.line;
  const glyphOnTop = (layout.pdfSide ?? "right") === "top";

  // Ink colours: the spell's own colours, darkened to read on paper.
  const inks = resolveColors(spell.parts, spell.colors).map((c) => darken(c));
  const inkHex = inks.map(rgbToHex);

  const svg = spellSvg(spell, { theme: "paper", colors: inkHex });
  const { canvas, w: gw, h: gh } = await rasterize(svg, { targetWidth: 2400 });
  const glyphPng = canvas.toDataURL("image/png");
  const paperJpg = makePaperCanvas(1240, 1754, hashSeed(`${spell.name}|${binaryOf(spell.parts)}`)).toDataURL(
    "image/jpeg",
    0.82
  );

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  registerFonts(doc);
  doc.setProperties({ title: pdfSafe(spell.name), creator: "Spell Writer" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 19; // text margin
  const innerW = PW - 2 * M;
  const cx = PW / 2;

  // Parchment and a double border, like a ruled page.
  doc.addImage(paperJpg, "JPEG", 0, 0, PW, PH, undefined, "FAST");
  doc.setDrawColor(...SEPIA).setLineWidth(0.6).rect(7.5, 7.5, PW - 15, PH - 15);
  doc.setLineWidth(0.2).rect(9.2, 9.2, PW - 18.4, PH - 18.4);

  const setScript = (size) => doc.setFont(SCRIPT, "normal").setFontSize(size);
  const setItalic = (size) => doc.setFont(ITALIC, "normal").setFontSize(size);
  const fitText = (text, max) => {
    let t = text;
    if (doc.getTextWidth(t) <= max) return t;
    while (t.length > 1 && doc.getTextWidth(t + "…") > max) t = t.slice(0, -1);
    return t.trimEnd() + "…";
  };

  // ----- the description, laid out first so the page can make room for it -----
  const notes = pdfSafe(spell.notes).trim();
  const LH = 6.3; // line height
  const DESC_PAD = 11; // flourish and breathing room above the text
  const MAX_DESC = 98;
  let dropCap = false;
  let capW = 0;
  let descLines = [];
  if (notes) {
    dropCap = /\p{L}/u.test(notes[0]);
    if (dropCap) {
      setScript(46);
      capW = doc.getTextWidth(notes[0]) + 5.5;
    }
    setItalic(12.5);
    const body = dropCap ? notes.slice(1).replace(/^\s+/, "") : notes;
    descLines = wrapText(doc, body, (i) => (dropCap && i < 2 ? innerW - capW : innerW));
    const maxLines = Math.floor((MAX_DESC - DESC_PAD) / LH) + 1;
    if (descLines.length > maxLines) {
      descLines = descLines.slice(0, maxLines);
      descLines[maxLines - 1] = fitText(descLines[maxLines - 1] + " \u2026", innerW);
    }
  }
  // The text hugs the bottom of the page; a short description just leaves more room above.
  const descH = notes ? DESC_PAD + (Math.max(descLines.length, 2) - 1) * LH + 6 : 0;
  const descTop = PH - 22 - descH;
  const upperBottom = notes ? descTop - 9 : PH - 26;

  // ----- title (script, centred; shrinks to fit on one line, else two) -----
  const drawTitle = (yTop) => {
    const name = pdfSafe(spell.name) || "Untitled";
    let size = 40;
    let lines;
    for (const s of [40, 34, 29]) {
      size = s;
      setScript(s);
      lines = doc.splitTextToSize(name, innerW);
      if (lines.length === 1) break;
    }
    if (lines.length > 2) {
      lines = lines.slice(0, 2);
      lines[1] = fitText(lines[1] + " \u2026", innerW);
    }
    setScript(size);
    const lead = size * 0.3528 * 1.05;
    lines.forEach((ln, i) => doc.text(ln, cx, yTop + lead * 0.8 + i * lead, { align: "center" }));
    return yTop + lead * (lines.length + 0.15);
  };

  // ----- the details, written out like a ledger: Label ... Value -----
  const ROW_MAX = 12.5;
  const drawDetails = (x, yTop, w, bottom) => {
    const n = spell.parts.length;
    const avail = bottom - yTop;
    const MIN_ROW = 7;
    let rows = n;
    let hidden = 0;
    if (n * MIN_ROW > avail) {
      rows = Math.max(1, Math.floor(avail / MIN_ROW) - 1);
      hidden = n - rows;
    }
    const rowH = Math.min(ROW_MAX, avail / (rows + (hidden ? 1 : 0)));
    const f = Math.min(1, rowH / 11);
    const labelW = Math.min(40, w * 0.36);
    const valueMax = w - 6 - labelW;
    doc.setLineWidth(0.2).setDrawColor(...SEPIA).setLineDashPattern([0.3, 1.3], 0);
    for (let i = 0; i < rows; i++) {
      const p = spell.parts[i];
      const base = yTop + i * rowH + rowH * 0.72;
      doc.setFillColor(...inks[i]).circle(x + 1.2, base - 1.6, 1.15, "F");
      setItalic(11.5 * f);
      doc.setTextColor(...SEPIA).text(fitText(pdfSafe(p.category), labelW - 2), x + 5, base);
      setScript(19 * f);
      doc.setTextColor(...INK).text(fitText(pdfSafe(p.field) || "\u2014", valueMax), x + 5 + labelW, base + 0.4);
      doc.line(x, base + 2.2, x + w, base + 2.2);
    }
    doc.setLineDashPattern([], 0);
    if (hidden) {
      setItalic(10);
      doc.setTextColor(...SEPIA).text(`\u2026 and ${hidden} more`, x + 5, yTop + rows * rowH + 4.5);
    }
  };

  // The glyph keeps its proportions, centred sideways in its box and aligned to the top of it.
  const placeGlyph = (box) => {
    const fit = Math.min(box.w / gw, box.h / gh);
    const dw = gw * fit;
    const dh = gh * fit;
    doc.addImage(glyphPng, "PNG", box.x + (box.w - dw) / 2, box.y, dw, dh, undefined, "FAST");
    return { dw, dh };
  };

  if (glyphOnTop) {
    // Glyph first, then flourish, title and details.
    const { dh } = placeGlyph({ x: M, y: 24, w: innerW, h: 105 });
    let y = 24 + dh + 7;
    flourish(doc, cx, y, 46);
    y = drawTitle(y + 7) + 5;
    drawDetails(M, y, innerW, upperBottom);
  } else {
    // Title, flourish, then details on the left and the glyph on the right.
    let y = drawTitle(21);
    flourish(doc, cx, y + 3, 46);
    y += 15;
    const leftW = 74;
    const gx = M + leftW + 6;
    const box = { x: gx, w: PW - M - gx, h: upperBottom - y };
    const dh = gh * Math.min(box.w / gw, box.h / gh);
    const detailsH = Math.min(spell.parts.length * ROW_MAX, upperBottom - y);
    // Sit the pair a little below the flourish when there is spare room, so the page feels balanced.
    const top = y + Math.max(0, (upperBottom - y - Math.max(dh, detailsH)) * 0.4);
    drawDetails(M, top, leftW, upperBottom);
    placeGlyph({ ...box, y: top });
  }

  // ----- the description, opened with a drop cap -----
  if (notes) {
    flourish(doc, cx, descTop, 30);
    const textTop = descTop + DESC_PAD;
    if (dropCap) {
      setScript(46);
      doc.setTextColor(...INK).text(notes[0], M - 1.2, textTop + LH + 2.4);
    }
    setItalic(12.5);
    doc.setTextColor(...INK);
    descLines.forEach((ln, i) => doc.text(ln, M + (dropCap && i < 2 ? capW : 0), textTop + i * LH));
  }

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
