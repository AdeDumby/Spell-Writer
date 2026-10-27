# Spell Writer

A desktop app (Electron + Vite + React) for writing spells as binary glyphs.

| Page | What it does |
| --- | --- |
| **Spellbook** | Every saved spell, with its glyph, binary and fields. Search, switch representation, export SVG, open in the Quill, delete. |
| **Quill** | Write a spell: pick one field per category, watch the binary and glyph update, save it. You can also paste a binary string to decode it. |
| **Settings** | Edit categories, their fields, order and bit width. Default representation, backup export/import, reset. |

## Run it

```bash
npm install
npm run dev      # Vite dev server + Electron window with hot reload
```

Other scripts:

```bash
npm start        # build the web app, then open it in Electron
npm run dist     # build an installer into ./release (via electron-builder)
```

Node 18+ is required.

## Where the data lives

Everything is stored in one file, `spellbook.json`, in Electron's per-user data folder
(`%APPDATA%/spell-writer` on Windows, `~/Library/Application Support/spell-writer` on macOS,
`~/.config/spell-writer` on Linux). Use **Settings → Export backup** to copy it elsewhere.

## How spells are encoded

- Each category's bit width is `ceil(log2(number of fields))` (minimum 1). You can widen it in Settings.
- A field's value is its position in the list, starting at 0.
- A spell is the concatenation of every category's bits, in category order.
- A saved spell keeps its own snapshot of bits and labels, so editing the categories later never rewrites it.

## Representations

| Name | How a spell is drawn |
| --- | --- |
| **Line** | One row of dots; bit = 1 draws the segment to the next dot, bit = 0 leaves a gap. |
| **Circle** | The same, wrapped around a ring. |
| **Rows** | One row per category. |
| **Superposed** | All categories share one ring of dots and every one starts on the top dot (drawn in gold). Category #1 links neighbouring dots, #2 skips every other dot, #3 hops 3 dots, and so on. Bit *j* of category *k* is the chord from dot *j·k* to dot *(j+1)·k*, wrapping around. The ring has `max(bits × step)` dots (at least 3), so a 3-bit category in 2nd position needs 6. |

## Colours

Every spell has a colour scheme, shown in the Quill under the representation picker:

- **Palette**: the built-in colour per category.
- **Custom**: pick a colour for each category (starts from the palette, so nothing jumps when you switch).
- **Mono**: one colour for the whole spell, from a colour picker or a few presets.

New spells start from the default scheme in **Settings → Default colours**; **Use default** in the Quill returns to it.
A saved spell keeps its own scheme, so changing the default never recolours your Spellbook.

## Exporting

**Export ▾** (in the Quill and on every Spellbook card) saves a spell as:

| Format | What you get |
| --- | --- |
| **PNG** | The glyph, ~2000 px wide, with transparent rounded corners. |
| **JPG** | The same on a dark backdrop, smaller file. |
| **PDF** | One portrait A4 page written like a page from a spellbook (see below). |
| **SVG** | The glyph as a vector image. |

The PDF page has a parchment background (generated on the fly, so every spell gets its own sheet), a thin border,
calligraphic lettering (Pinyon Script and IM Fell English Italic, both bundled under the SIL Open Font Licence in
`src/assets/fonts`), and the glyph redrawn in pen and ink: your colours darkened to ink tones, with a wax-red dot where
the Superposed layout starts. Top to bottom it reads:

1. the **title**,
2. the **preamble** (a short opening, written in the Quill's *Preamble* box),
3. the **categories**, written out as a ledger with the label and its value at the same size (long values wrap onto
   more lines, they are never cut), with the glyph beside them on the right (or across the very top for *Line*),
4. the **description** (the Quill's *Description* box), opened with a drop cap.

Only what a person would write is on it: no bit strings, no representation names, no dates. Empty preamble or
description are simply left out.

Notes: characters the fonts cannot draw (e.g. CJK, emoji) are left out of the PDF. The writing shrinks a little (down to 82%) when a page is full. Only if that is not enough is the description
shortened with "…", so a spell always fits on a single page. PNG, JPG and SVG keep the on-screen dark look. Exports use the colours and the
"show gaps" setting you see on screen.

## Adding a new representation

Open `src/lib/spell.js` and add an entry to `LAYOUTS`. It receives the width of each category and returns
node positions plus one SVG path per bit (drawn when the bit is 1, left as a gap when it is 0).
It then appears everywhere automatically.

## Layout

```
electron/main.cjs      window, file storage, import/export dialogs
electron/preload.cjs   the small API exposed to the page (window.api)
src/store.jsx          app state + auto-save
src/lib/spell.js       data model, encoding/decoding, representations
src/lib/platform.js    Electron API wrapper (falls back to localStorage in a browser)
src/lib/export.js      PNG / JPG / PDF / SVG rendering (PDF page design lives here)
src/lib/paper.js       procedural parchment texture
src/lib/pdfFonts.js    calligraphy fonts for the PDF (loaded only on PDF export)
src/pages/             Spellbook, Quill, Settings
src/components/        Glyph (SVG), Binary
```
