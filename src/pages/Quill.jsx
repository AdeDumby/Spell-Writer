import { useMemo, useState } from "react";
import Glyph from "../components/Glyph.jsx";
import Binary from "../components/Binary.jsx";
import ColorControls from "../components/ColorControls.jsx";
import ExportMenu from "../components/ExportMenu.jsx";
import {
  LAYOUTS,
  binaryOf,
  decodeBinary,
  makeParts,
  resolveColors,
  toBin,
  uid,
  widthOf,
} from "../lib/spell.js";
import { useStore } from "../store.jsx";

export default function Quill() {
  const { data, draft, setDraft, saveSpell, resetDraft, setPage } = useStore();
  const { categories, spells } = data;

  const layout = draft.layout ?? data.defaultLayout;
  const parts = useMemo(() => makeParts(categories, draft.selection), [categories, draft.selection]);
  const binary = binaryOf(parts);
  const scheme = draft.colors ?? data.defaultColors;
  const colors = useMemo(() => resolveColors(parts, scheme), [parts, scheme]);
  const existing = spells.find((s) => s.id === draft.editingId);

  const [showGaps, setShowGaps] = useState(true);
  const [decodeText, setDecodeText] = useState("");
  const [decodeError, setDecodeError] = useState("");

  const patch = (p) => setDraft((d) => ({ ...d, ...p }));

  const save = (asNew) => {
    const now = Date.now();
    const keepId = existing && !asNew;
    saveSpell({
      id: keepId ? existing.id : uid(),
      name: draft.name.trim() || `Spell ${spells.length + (keepId ? 0 : 1)}`,
      notes: draft.notes,
      layout,
      colors: scheme,
      parts,
      createdAt: keepId ? existing.createdAt : now,
      updatedAt: now,
    });
    resetDraft();
    setPage("spellbook");
  };

  const decode = () => {
    const result = decodeBinary(categories, decodeText);
    if (result.error) return setDecodeError(result.error);
    setDecodeError("");
    patch({ selection: result.selection });
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h2>Quill</h2>
          <p className="hint">
            {existing ? `Editing “${existing.name}”` : "Write a new spell"} — pick a field for each
            category and the glyph is drawn as you go.
          </p>
        </div>
        <div className="toolbar">
          {(existing || draft.name || Object.keys(draft.selection).length > 0) && (
            <button onClick={resetDraft}>Clear</button>
          )}
          {existing && <button onClick={() => save(true)}>Save as new copy</button>}
          <button className="primary" onClick={() => save(false)}>
            {existing ? "Update spell" : "Save to Spellbook"}
          </button>
        </div>
      </header>

      <div className="two-col">
        <section className="card">
          <label className="stack">
            <span className="label">Name</span>
            <input
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder={`Spell ${spells.length + 1}`}
            />
          </label>

          <div className="selects">
            {categories.map((c, ci) => {
              const idx = Math.min(draft.selection[c.id] ?? 0, c.fields.length - 1);
              const w = widthOf(c);
              return (
                <label key={c.id} className="stack">
                  <span className="label" style={{ color: colors[ci] }}>
                    {c.name}
                  </span>
                  <select
                    value={idx}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        selection: { ...d.selection, [c.id]: Number(e.target.value) },
                      }))
                    }
                  >
                    {c.fields.map((f, i) => (
                      <option key={i} value={i}>
                        {toBin(i, w)} · {f}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>

          <label className="stack">
            <span className="label">Notes</span>
            <textarea
              rows={4}
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              placeholder="Incantation, cost, side effects…"
            />
          </label>
        </section>

        <section className="card">
          <Binary parts={parts} colors={colors} />
          <div className="toolbar">
            <div className="seg">
              {Object.entries(LAYOUTS).map(([key, l]) => (
                <button
                  key={key}
                  className={key === layout ? "on" : ""}
                  onClick={() => patch({ layout: key })}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={showGaps}
                onChange={(e) => setShowGaps(e.target.checked)}
              />
              show gaps
            </label>
            <ExportMenu
              getSpell={() => ({
                name: draft.name.trim() || `Spell ${spells.length + (existing ? 0 : 1)}`,
                notes: draft.notes,
                layout,
                colors: scheme,
                parts,
                showGaps,
                updatedAt: Date.now(),
              })}
            />
          </div>

          <div className="colors-row">
            <div className="colors-head">
              <span className="label">Colours</span>
              {draft.colors && (
                <button className="link" onClick={() => patch({ colors: null })} title="Use the default from Settings">
                  Use default
                </button>
              )}
            </div>
            <ColorControls scheme={scheme} categories={categories} onChange={(colors) => patch({ colors })} />
          </div>

          <Glyph parts={parts} layout={layout} colors={colors} showGaps={showGaps} />

          <div className="decode">
            <input
              value={decodeText}
              onChange={(e) => setDecodeText(e.target.value)}
              placeholder={`Paste ${binary.length} bits to decode a spell`}
              spellCheck={false}
            />
            <button onClick={decode}>Decode</button>
          </div>
          {decodeError && <p className="err">{decodeError}</p>}
        </section>
      </div>
    </div>
  );
}
