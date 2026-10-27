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
// Pinyon Script's lowercase is shorter than IM Fell's, so it is set larger to look the same size next to it.
const SCRIPT_MATCH = 0.437 / 0.356;

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

/** Greedy word wrap that lets the first lines be narrower (room for a drop cap); very long words are broken. */
function wrapText(doc, text, widthFor) {
  const lines = [];
  for (const para of text.split("\n")) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (doc.getTextWidth(word) > widthFor(lines.length)) {
        // A single word wider than the column: break it by letters instead of overflowing.
        if (line) {
          lines.push(line);
          line = "";
        }
        let chunk = "";
        for (const ch of word) {
          if (chunk && doc.getTextWidth(chunk + ch) > widthFor(lines.length)) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        line = chunk;
        continue;
      }
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
 *   - "line" glyphs (pdfSide: "top")      -> glyph across the top, then the title
 *   - everything else (pdfSide: "right")  -> title first; the glyph sits on the right of the categories
 *   - order: title, preamble, categories (label and value at one size, long values wrap), description
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

  // ----- measuring ----------------------------------------------------------------------------
  // The page is laid out first, at a text scale (1 = full size). If the content does not fit, the scale
  // shrinks a little and everything is measured again. Fields are never cut: they wrap onto more lines.
  const preamble = pdfSafe(spell.preamble).trim();
  const notes = pdfSafe(spell.notes).trim();
  const parts = spell.parts;
  const PAGE_BOTTOM = PH - 22;

  // Title (does not depend on the scale): script, centred, on one line if it fits, otherwise two.
  let titleSize = 40;
  let titleLines = [];
  const titleText = pdfSafe(spell.name) || "Untitled";
  for (const sz of [40, 34, 29, 24, 20]) {
    titleSize = sz;
    setScript(sz);
    titleLines = doc.splitTextToSize(titleText, innerW);
    if (titleLines.length === 1) break;
  }
  if (titleLines.length > 2) {
    titleLines = titleLines.slice(0, 2);
    titleLines[1] = fitText(titleLines[1] + " …", innerW);
  }
  const titleLead = titleSize * 0.3528 * 1.05;
  const titleH = titleLead * (titleLines.length + 0.15);

  const dropCap = !!notes && /\p{L}/u.test(notes[0]);
  const fitGlyph = (maxW, maxH) => {
    const f = Math.min(maxW / gw, maxH / gh);
    return { dw: gw * f, dh: gh * f };
  };

  const plan = (s, trimDescription) => {
    const gs = Math.min(1, Math.max(0.62, s)); // the glyph shrinks more slowly than the text, and never grows
    const P = { s };

    // Details: one entry per category, label and value at the same size.
    const colW = glyphOnTop ? innerW : 82;
    const ds = 15 * s; // labels (italic)
    const vs = ds * SCRIPT_MATCH; // values (script), optically the same size as the labels
    const lead = vs * 0.3528 * 1.2;
    setItalic(ds);
    const natural = Math.max(0, ...parts.map((p) => doc.getTextWidth(pdfSafe(p.category))));
    const labelW = Math.min(colW * 0.5, Math.max(colW * 0.3, natural + 5));
    const valueW = colW - labelW - 1;
    P.rows = parts.map((p) => {
      setItalic(ds);
      const labelLines = wrapText(doc, pdfSafe(p.category), () => labelW - 3);
      setScript(vs);
      const valueLines = wrapText(doc, pdfSafe(p.field) || "—", () => valueW);
      const n = Math.max(labelLines.length, valueLines.length, 1);
      return { labelLines, valueLines, h: n * lead + 3.4 * s };
    });
    Object.assign(P, { colW, ds, vs, lead, labelW });
    const detailsH = P.rows.reduce((a, r) => a + r.h, 0);

    // Header: [glyph on top] flourish, title, preamble.
    let y;
    if (glyphOnTop) {
      const g = fitGlyph(innerW, 105 * gs);
      P.glyph = { x: M + (innerW - g.dw) / 2, y: 16, ...g };
      P.flourishTop = 16 + g.dh + 7;
      P.titleTop = P.flourishTop + 7;
      y = P.titleTop + titleH + 4;
    } else {
      P.titleTop = 18;
      P.flourishTop = P.titleTop + titleH + 2.5;
      y = P.flourishTop + 8;
    }
    P.preSize = 13.5 * s;
    P.preLead = 6.1 * s;
    P.preLines = [];
    if (preamble) {
      setItalic(P.preSize);
      P.preLines = wrapText(doc, preamble, () => innerW - 24);
      P.preTop = y;
      y += P.preLines.length * P.preLead + 5;
    } else if (glyphOnTop) {
      y += 1;
    }

    // The pair: details on the left, glyph on the right (or details alone under a top glyph).
    P.pairTop = y;
    let pairH = detailsH;
    if (!glyphOnTop) {
      const gx = M + colW + 6;
      const boxW = PW - M - gx;
      const g = fitGlyph(boxW * gs, 400);
      P.glyph = { x: gx + (boxW - g.dw) / 2, y, ...g };
      pairH = Math.max(detailsH, g.dh);
    }

    // The description follows the categories.
    P.descFlourish = y + pairH + 11;
    P.descLines = [];
    P.end = y + pairH;
    if (notes) {
      P.descSize = 12.5 * s;
      P.descLead = 6.3 * s;
      P.capSize = 46 * s;
      P.capW = 0;
      if (dropCap) {
        setScript(P.capSize);
        P.capW = doc.getTextWidth(notes[0]) + 5.5 * s;
      }
      setItalic(P.descSize);
      const body = dropCap ? notes.slice(1).replace(/^\s+/, "") : notes;
      let lines = wrapText(doc, body, (i) => (dropCap && i < 2 ? innerW - P.capW : innerW));
      P.descTop = P.descFlourish + 10.5 * Math.max(s, 0.7);
      // Last resort only (see below): shorten the description to what is left of the page.
      const room = Math.floor((PAGE_BOTTOM - 3 - P.descTop) / P.descLead) + 1;
      const keep = Math.max(room, 6);
      if (trimDescription && lines.length > keep) {
        lines = lines.slice(0, keep);
        lines[keep - 1] = fitText(lines[keep - 1] + " …", innerW);
      }
      P.descLines = lines;
      P.end = P.descTop + (Math.max(lines.length, 2) - 1) * P.descLead + 3;
    }
    return P;
  };

  // First choice: keep everything, shrinking the writing a little if the page needs it (never below 82%).
  // Only if that is still not enough is the description shortened, and the fields are never cut.
  const SCALES = [1, 0.94, 0.88, 0.82, 0.76, 0.7, 0.64, 0.58, 0.52, 0.46, 0.4];
  let P;
  for (const sc of SCALES.filter((v) => v >= 0.82)) {
    P = plan(sc, false);
    if (P.end <= PAGE_BOTTOM) break;
  }
  if (P.end > PAGE_BOTTOM) {
    for (const sc of SCALES) {
      P = plan(sc, true);
      if (P.end <= PAGE_BOTTOM) break;
    }
  }
  const s = P.s;

  // ----- drawing ------------------------------------------------------------------------------
  if (P.glyph) doc.addImage(glyphPng, "PNG", P.glyph.x, P.glyph.y, P.glyph.dw, P.glyph.dh, undefined, "FAST");

  flourish(doc, cx, P.flourishTop, 46);
  setScript(titleSize);
  doc.setTextColor(...INK);
  titleLines.forEach((ln, i) =>
    doc.text(ln, cx, P.titleTop + titleLead * 0.8 + i * titleLead, { align: "center" })
  );

  if (P.preLines.length) {
    setItalic(P.preSize);
    doc.setTextColor(...INK);
    P.preLines.forEach((ln, i) => doc.text(ln, cx, P.preTop + P.preLead * 0.8 + i * P.preLead, { align: "center" }));
  }

  // Categories, written out as a ledger: label and value at the same size, long values wrap.
  doc.setLineWidth(0.2).setDrawColor(...SEPIA).setLineDashPattern([0.3, 1.3], 0);
  let ry = P.pairTop;
  for (const r of P.rows) {
    const base = ry + 0.5 * s + P.lead * 0.82;
    setItalic(P.ds);
    doc.setTextColor(...SEPIA);
    r.labelLines.forEach((ln, i) => doc.text(ln, M, base + i * P.lead));
    setScript(P.vs);
    doc.setTextColor(...INK);
    r.valueLines.forEach((ln, i) => doc.text(ln, M + P.labelW, base + i * P.lead));
    doc.line(M, ry + r.h - 0.6 * s, M + P.colW, ry + r.h - 0.6 * s);
    ry += r.h;
  }
  doc.setLineDashPattern([], 0);

  // The description, after the categories, opened with a drop cap.
  if (P.descLines.length) {
    flourish(doc, cx, P.descFlourish, 30 * Math.max(s, 0.7));
    if (dropCap) {
      setScript(P.capSize);
      doc.setTextColor(...INK).text(notes[0], M - 1.2, P.descTop + P.descLead + 2.4 * s);
    }
    setItalic(P.descSize);
    doc.setTextColor(...INK);
    P.descLines.forEach((ln, i) => doc.text(ln, M + (dropCap && i < 2 ? P.capW : 0), P.descTop + i * P.descLead));
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
