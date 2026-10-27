import { useMemo, useState } from "react";
import Glyph from "../components/Glyph.jsx";
import Binary from "../components/Binary.jsx";
import ExportMenu from "../components/ExportMenu.jsx";
import { LAYOUTS, binaryOf, resolveColors, selectionFromParts } from "../lib/spell.js";
import { useStore } from "../store.jsx";

function SpellCard({ spell, onEdit, onDelete, onLayout }) {
  const colors = resolveColors(spell.parts, spell.colors);

  return (
    <article className="card spell">
      <div className="spell-top">
        <h3>{spell.name}</h3>
        <span className="muted">{new Date(spell.updatedAt).toLocaleDateString()}</span>
      </div>

      <Glyph parts={spell.parts} layout={spell.layout} colors={colors} className="glyph thumb" />
      <Binary parts={spell.parts} colors={colors} size="sm" />

      <ul className="chips">
        {spell.parts.map((p, i) => (
          <li key={i} style={{ borderColor: colors[i] }}>
            <span className="muted">{p.category}</span> {p.field}
          </li>
        ))}
      </ul>

      {spell.preamble && <p className="preamble">{spell.preamble}</p>}
      {spell.notes && <p className="notes">{spell.notes}</p>}

      <div className="toolbar">
        <select value={spell.layout} onChange={(e) => onLayout(e.target.value)} aria-label="Representation">
          {Object.entries(LAYOUTS).map(([key, l]) => (
            <option key={key} value={key}>
              {l.label}
            </option>
          ))}
        </select>
        <button onClick={onEdit}>Open in Quill</button>
        <ExportMenu up getSpell={() => spell} />
        <button className="danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </article>
  );
}

export default function Spellbook() {
  const { data, setDraft, setPage, deleteSpell, patchSpell } = useStore();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...data.spells].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.notes.toLowerCase().includes(q) ||
        (s.preamble ?? "").toLowerCase().includes(q) ||
        binaryOf(s.parts).includes(q) ||
        s.parts.some((p) => p.field.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
    );
  }, [data.spells, query]);

  const edit = (spell) => {
    const { selection, problems } = selectionFromParts(data.categories, spell.parts);
    if (
      problems > 0 &&
      !window.confirm(
        "The categories have changed since this spell was written. Anything that no longer matches will " +
          "fall back to its first field in the Quill. Open it anyway?"
      )
    ) {
      return;
    }
    setDraft({
      editingId: spell.id,
      name: spell.name,
      preamble: spell.preamble ?? "",
      notes: spell.notes,
      selection,
      layout: spell.layout,
      colors: spell.colors,
    });
    setPage("quill");
  };

  const remove = (spell) => {
    if (window.confirm(`Delete “${spell.name}”? This can't be undone.`)) deleteSpell(spell.id);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h2>Spellbook</h2>
          <p className="hint">
            {data.spells.length} {data.spells.length === 1 ? "spell" : "spells"} written.
          </p>
        </div>
        <div className="toolbar">
          <input
            className="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, element, binary…"
          />
          <button
            className="primary"
            onClick={() => {
              setDraft({ editingId: null, name: "", preamble: "", notes: "", selection: {}, layout: null, colors: null });
              setPage("quill");
            }}
          >
            New spell
          </button>
        </div>
      </header>

      {data.spells.length === 0 ? (
        <div className="empty card">
          <p>Your spellbook is empty.</p>
          <button className="primary" onClick={() => setPage("quill")}>
            Write your first spell
          </button>
        </div>
      ) : shown.length === 0 ? (
        <p className="hint">No spell matches “{query}”.</p>
      ) : (
        <div className="grid">
          {shown.map((s) => (
            <SpellCard
              key={s.id}
              spell={s}
              onEdit={() => edit(s)}
              onDelete={() => remove(s)}
              onLayout={(layout) => patchSpell(s.id, { layout })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
