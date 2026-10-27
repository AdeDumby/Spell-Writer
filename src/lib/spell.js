/* ------------------------------------------------------------------ */
/*  Data model                                                         */
/*                                                                     */
/*  category = { id, name, fields: string[], bits: number | null }     */
/*    A field's value is its index in the list, written in binary.     */
/*    `bits` can only widen a category; the minimum is ceil(log2(n)).  */
/*                                                                     */
/*  spell = { id, name, notes, layout, createdAt, updatedAt,           */
/*            parts: [{ categoryId, category, field, bits }] }         */
/*    A spell stores its own snapshot (labels + bits), so editing the  */
/*    categories later never changes a spell that is already written.  */
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
export const colorFor = (i) => `hsl(${(i * 57 + 200) % 360} 85% 66%)`;

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
    return { categories: fallbackCats, defaultLayout: "line", spells: [] };
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
    spells,
  };
}

/* ------------------------------------------------------------------ */
/*  Representations                                                    */
/*  Each one turns the list of category widths into geometry:          */
/*  { w, h, nodes: [{x,y}], bits: [svg path per bit] }                 */
/*  Bit i = 1 -> draw bits[i]; bit i = 0 -> leave a gap.               */
/*  Add your own by adding an entry to LAYOUTS.                        */
/* ------------------------------------------------------------------ */

const STEP = 44;
const PAD = 40;
const seg = (a, b) => `M ${a.x} ${a.y} L ${b.x} ${b.y}`;

export const LAYOUTS = {
  line: {
    label: "Line",
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
};
