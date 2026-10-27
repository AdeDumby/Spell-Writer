/* ------------------------------------------------------------------ */
/*  Data model                                                         */
/*                                                                     */
/*  category = { id, name, fields: string[], bits: number | null }     */
/*    A field's value is its index in the list, written in binary.     */
/*    `bits` can only widen a category; the minimum is ceil(log2(n)).  */
/*                                                                     */
/*  spell = { id, name, notes, layout, colors, createdAt, updatedAt,  */
/*            parts: [{ categoryId, category, field, bits }] }         */
/*    A spell stores its own snapshot (labels + bits), so editing the  */
/*    categories later never changes a spell that is already written.  */
/*                                                                     */
/*  colors (a "scheme") = { mode, mono, custom }                       */
/*    mode "auto"   -> built-in palette, one hue per category          */
/*    mode "custom" -> custom[categoryId], falling back to the palette */
/*    mode "mono"   -> every category uses the single `mono` colour    */
/* ------------------------------------------------------------------ */

export const uid = () => Math.random().toString(36).slice(2, 9);
export const mk = (name, fields, bits = null) => ({ id: uid(), name, fields, bits });

export const defaultCategories = () => [
  mk("Level", ["Level 0", "Level 1", "Level 2", "Level 3", "Level 4", "Level 5"]),
  mk("Type", ["Attack", "Defense", "Heal", "Summon"]),
  mk("Element", ["Fire", "Water", "Earth", "Air", "Lightning", "Ice", "Light", "Dark"]),
  mk("Size", ["Tiny", "Small", "Medium", "Large"]),
  mk("Distance", ["Touch", "Short", "Medium", "Long"]),
  mk("Speed", ["Slow", "Normal", "Fast", "Instant"]),
];

export const autoBits = (n) => Math.max(1, Math.ceil(Math.log2(Math.max(n, 1))));
export const widthOf = (c) => Math.max(autoBits(c.fields.length), c.bits || 0);
export const toBin = (v, w) => v.toString(2).padStart(w, "0");

/* ------------------------------------------------------------------ */
/*  Colours                                                            */
/* ------------------------------------------------------------------ */

// Colours are plain #rrggbb strings so they can go straight into <input type="color">.
const hslToHex = (h, s, l) => {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return (
    "#" +
    [f(0), f(8), f(4)]
      .map((x) => Math.round(x * 255).toString(16).padStart(2, "0"))
      .join("")
  );
};

/** The built-in palette: one hue per category position. */
export const colorFor = (i) => hslToHex((i * 57 + 200) % 360, 85, 66);

export const COLOR_MODES = { auto: "Palette", custom: "Custom", mono: "Mono" };
export const DEFAULT_MONO = "#9fb0ff";
export const MONO_PRESETS = ["#9fb0ff", "#ffffff", "#ffd166", "#ff6b6b", "#6bffb8", "#c084fc"];

export const defaultScheme = () => ({ mode: "auto", mono: DEFAULT_MONO, custom: {} });

const isHex = (v) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);

/** Make any stored/imported value into a valid colour scheme. */
export function normalizeScheme(raw) {
  const base = defaultScheme();
  if (!raw || typeof raw !== "object") return base;
  const custom = {};
  if (raw.custom && typeof raw.custom === "object") {
    for (const [id, v] of Object.entries(raw.custom)) if (isHex(v)) custom[id] = v;
  }
  return {
    mode: COLOR_MODES[raw.mode] ? raw.mode : base.mode,
    mono: isHex(raw.mono) ? raw.mono : base.mono,
    custom,
  };
}

/**
 * One colour per item, in order. Works for spell parts ({ categoryId }) and for
 * categories ({ id }), so the whole UI colours things the same way.
 */
export function resolveColors(items, scheme) {
  const s = scheme ?? defaultScheme();
  return items.map((item, i) => {
    if (s.mode === "mono") return s.mono;
    if (s.mode === "custom") return s.custom[item.categoryId ?? item.id] ?? colorFor(i);
    return colorFor(i);
  });
}

export const moveItem = (arr, i, d) => {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const a = [...arr];
  [a[i], a[j]] = [a[j], a[i]];
  return a;
};

/* ------------------------------------------------------------------ */
/*  Building and reading spells                                        */
/* ------------------------------------------------------------------ */

export const makeParts = (categories, selection) =>
  categories.map((c) => {
    const idx = Math.min(selection[c.id] ?? 0, Math.max(c.fields.length - 1, 0));
    return {
      categoryId: c.id,
      category: c.name,
      field: c.fields[idx] ?? "",
      bits: toBin(idx, widthOf(c)),
    };
  });

export const binaryOf = (parts) => parts.map((p) => p.bits).join("");

/** Turn a saved spell's parts back into a { categoryId: fieldIndex } selection. */
export const selectionFromParts = (categories, parts) => {
  const selection = {};
  let missing = 0;
  for (const c of categories) {
    const p = parts.find((x) => x.categoryId === c.id);
    const v = p ? parseInt(p.bits, 2) : NaN;
    if (Number.isInteger(v) && v < c.fields.length) selection[c.id] = v;
    else missing++;
  }
  const unmatched = parts.filter((p) => !categories.some((c) => c.id === p.categoryId)).length;
  return { selection, problems: missing + unmatched };
};

/** Decode a pasted binary string using the current categories. */
export function decodeBinary(categories, text) {
  const s = text.replace(/\s+/g, "");
  const total = categories.reduce((n, c) => n + widthOf(c), 0);
  if (!/^[01]+$/.test(s)) return { error: "Use only 0 and 1." };
  if (s.length !== total) return { error: `Expected ${total} bits, got ${s.length}.` };
  let pos = 0;
  const selection = {};
  for (const c of categories) {
    const w = widthOf(c);
    const v = parseInt(s.slice(pos, pos + w), 2);
    pos += w;
    if (v >= c.fields.length) return { error: `${c.name}: value ${v} has no matching field.` };
    selection[c.id] = v;
  }
  return { selection };
}

/** Clean up anything loaded from disk or imported from a backup. */
export function normalizeData(raw) {
  const fallbackCats = defaultCategories();
  if (!raw || typeof raw !== "object") {
    return { categories: fallbackCats, defaultLayout: "line", defaultColors: defaultScheme(), spells: [] };
  }

  const categories =
    Array.isArray(raw.categories) && raw.categories.length
      ? raw.categories.map((c) => ({
          id: typeof c?.id === "string" && c.id ? c.id : uid(),
          name: String(c?.name ?? "Category"),
          fields: Array.isArray(c?.fields) && c.fields.length ? c.fields.map(String) : ["Option A"],
          bits: Number.isInteger(c?.bits) ? c.bits : null,
        }))
      : fallbackCats;

  const spells = (Array.isArray(raw.spells) ? raw.spells : [])
    .filter(
      (s) =>
        s &&
        typeof s.id === "string" &&
        Array.isArray(s.parts) &&
        s.parts.every((p) => p && typeof p.bits === "string" && /^[01]+$/.test(p.bits))
    )
    .map((s) => ({
      id: s.id,
      name: String(s.name ?? "Untitled spell"),
      notes: String(s.notes ?? ""),
      layout: LAYOUTS[s.layout] ? s.layout : "line",
      colors: normalizeScheme(s.colors),
      createdAt: Number(s.createdAt) || Date.now(),
      updatedAt: Number(s.updatedAt) || Date.now(),
      parts: s.parts.map((p) => ({
        categoryId: String(p.categoryId ?? ""),
        category: String(p.category ?? ""),
        field: String(p.field ?? ""),
        bits: p.bits,
      })),
    }));

  return {
    categories,
    defaultLayout: LAYOUTS[raw.defaultLayout] ? raw.defaultLayout : "line",
    defaultColors: normalizeScheme(raw.defaultColors),
    spells,
  };
}

/* ------------------------------------------------------------------ */
/*  Representations                                                    */
/*  Each one turns the list of category widths into geometry:          */
/*  { w, h, nodes: [{x,y}], bits: [svg path per bit] }                 */
/*  Bit i = 1 -> draw bits[i]; bit i = 0 -> leave a gap.               */
/*  `pdfSide` ("top" | "right", default "right") says where the glyph  */
/*  goes on an exported PDF page. Add your own entry to LAYOUTS.       */
/* ------------------------------------------------------------------ */

const STEP = 44;
const PAD = 40;
const seg = (a, b) => `M ${a.x} ${a.y} L ${b.x} ${b.y}`;

export const LAYOUTS = {
  line: {
    label: "Line",
    pdfSide: "top", // PDF: glyph across the top of the page
    build(widths) {
      const n = widths.reduce((s, x) => s + x, 0);
      const pts = Array.from({ length: n + 1 }, (_, k) => ({ x: PAD + k * STEP, y: 60 }));
      return {
        w: PAD * 2 + n * STEP,
        h: 120,
        nodes: pts,
        bits: Array.from({ length: n }, (_, i) => seg(pts[i], pts[i + 1])),
      };
    },
  },

  circle: {
    label: "Circle",
    pdfSide: "right", // PDF: glyph on the right, details on the left
    build(widths) {
      const n = widths.reduce((s, x) => s + x, 0);
      const r = Math.max(90, n * 14);
      const c = r + PAD;
      const pts = Array.from({ length: n }, (_, k) => {
        const a = -Math.PI / 2 + (2 * Math.PI * k) / Math.max(n, 1);
        return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
      });
      const bits = Array.from({ length: n }, (_, i) => {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        return n === 1 ? "" : `M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}`;
      });
      return { w: c * 2, h: c * 2, nodes: pts, bits };
    },
  },

  rows: {
    label: "Rows",
    pdfSide: "right",
    build(widths) {
      const rowH = 56;
      const maxW = Math.max(...widths, 1);
      const nodes = [];
      const bits = [];
      widths.forEach((w, r) => {
        const y = PAD / 2 + rowH / 2 + r * rowH;
        const pts = Array.from({ length: w + 1 }, (_, k) => ({ x: PAD + k * STEP, y }));
        nodes.push(...pts);
        for (let i = 0; i < w; i++) bits.push(seg(pts[i], pts[i + 1]));
      });
      return { w: PAD * 2 + maxW * STEP, h: PAD + Math.max(widths.length, 1) * rowH, nodes, bits };
    },
  },

  /*
   * Superposed: every category is drawn on the SAME ring of dots.
   *   - Category #k (1-based) hops k dots at a time: #1 links neighbours, #2 skips every other dot,
   *     #3 skips two dots, and so on.
   *   - Bit j of a category is the chord from dot (j*k) to dot ((j+1)*k), wrapping around the ring.
   *   - Every category starts on the top dot (dot 0), which is drawn in its own colour.
   *   - A category with b bits and step k travels b*k dots, so the ring needs max(b*k) dots
   *     (e.g. 8 permutations = 3 bits at step 2 -> 6 dots). The ring never has fewer than 3.
   */
  superposed: {
    label: "Superposed",
    pdfSide: "right",
    build(widths) {
      const N = Math.max(3, ...widths.map((b, i) => b * (i + 1)));
      const r = Math.max(110, N * 14);
      const c = r + PAD;
      const nodes = Array.from({ length: N }, (_, k) => {
        const a = -Math.PI / 2 + (2 * Math.PI * k) / N;
        return { x: c + r * Math.cos(a), y: c + r * Math.sin(a), start: k === 0 };
      });

      const bits = [];
      widths.forEach((b, ci) => {
        const step = ci + 1;
        for (let j = 0; j < b; j++) {
          const from = nodes[(j * step) % N];
          const to = nodes[((j + 1) * step) % N];
          if (from === to) {
            // The hop lands back on the same dot: draw a small loop pointing outwards.
            const ux = (from.x - c) / r;
            const uy = (from.y - c) / r;
            const lr = 14;
            const qx = from.x + ux * lr * 2;
            const qy = from.y + uy * lr * 2;
            bits.push(
              `M ${from.x} ${from.y} A ${lr} ${lr} 0 1 1 ${qx} ${qy} A ${lr} ${lr} 0 1 1 ${from.x} ${from.y}`
            );
          } else {
            bits.push(seg(from, to));
          }
        }
      });

      return {
        w: c * 2,
        h: c * 2,
        nodes,
        bits,
        // Earlier categories are drawn thicker and underneath, so where chords overlap
        // every category stays visible.
        strokeFor: (ci) => Math.max(2.5, 7.5 - ci * 1.1),
      };
    },
  },
};
