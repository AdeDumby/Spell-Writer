import { useState } from "react";
import ColorControls from "../components/ColorControls.jsx";
import {
  LAYOUTS,
  autoBits,
  choiceCats,
  isText,
  mk,
  mkText,
  moveItem,
  resolveColors,
  toBin,
  widthOf,
} from "../lib/spell.js";
import { exportText, importText } from "../lib/platform.js";
import { useStore } from "../store.jsx";

export default function Settings() {
  const { data, setCategories, resetCategories, setDefaultLayout, setDefaultColors, replaceAll } = useStore();
  const { categories } = data;
  // Only choice categories are drawn in the glyph, so only they have a colour.
  const choice = choiceCats(categories);
  const choiceColors = resolveColors(choice, data.defaultColors);
  const colorOf = (c) => (isText(c) ? "#8a93b2" : choiceColors[choice.indexOf(c)]);
  const [message, setMessage] = useState("");

  const patchCat = (id, fn) => setCategories((cs) => cs.map((c) => (c.id === id ? fn(c) : c)));
  const totalBits = categories.reduce((n, c) => n + widthOf(c), 0);

  const exportBackup = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const where = await exportText(`spellbook-backup-${stamp}.json`, JSON.stringify(data, null, 2), "application/json");
    if (where) setMessage("Backup saved.");
  };

  const importBackup = async () => {
    const text = await importText();
    if (text == null) return;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || (!parsed.categories && !parsed.spells)) throw new Error("not a backup");
      if (
        !window.confirm(
          "Importing replaces your current categories and spells with the ones in the file. Continue?"
        )
      ) {
        return;
      }
      replaceAll(parsed);
      setMessage("Backup imported.");
    } catch {
      setMessage("That file isn't a valid Spell Writer backup.");
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h2>Settings</h2>
          <p className="hint">
            Choice categories are written left to right; a field's value is its position in the list
            (starting at 0). Text categories (like Pronunciation) are free text: they are written on the
            page but are not part of the binary. Spells already in your Spellbook keep what they were
            written with, so changing things here never rewrites them. Total width now: <b>{totalBits} bits</b>.
          </p>
        </div>
      </header>

      <div className="two-col">
        <section>
          {categories.map((c, ci) => (
            <div className={`cat card ${isText(c) ? "text-cat" : ""}`} key={c.id} style={{ borderLeftColor: colorOf(c) }}>
              <div className="cat-head">
                <input
                  className="name"
                  value={c.name}
                  onChange={(e) => patchCat(c.id, (x) => ({ ...x, name: e.target.value }))}
                />
                {isText(c) ? (
                  <span className="kind" title="Free text: not part of the binary">
                    free text
                  </span>
                ) : (
                  <label className="bits" title="The minimum is set by the number of fields">
                    bits
                    <input
                      type="number"
                      min={autoBits(c.fields.length)}
                      max={16}
                      value={widthOf(c)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        patchCat(c.id, (x) => ({ ...x, bits: v > autoBits(x.fields.length) ? v : null }));
                      }}
                    />
                  </label>
                )}
                <button onClick={() => setCategories((cs) => moveItem(cs, ci, -1))}>↑</button>
                <button onClick={() => setCategories((cs) => moveItem(cs, ci, 1))}>↓</button>
                <button
                  // There always has to be at least one choice category to draw.
                  disabled={categories.length < 2 || (!isText(c) && choice.length < 2)}
                  onClick={() => setCategories((cs) => cs.filter((x) => x.id !== c.id))}
                >
                  ✕
                </button>
              </div>

              {isText(c) ? (
                <p className="hint small">
                  Free text. Each spell gets its own “{c.name || "text"}” box in the Quill; it is written on the
                  page but never changes the binary or the glyph.
                </p>
              ) : (
                <>
              {c.fields.map((f, fi) => (
                <div className="field" key={fi}>
                  <code>{toBin(fi, widthOf(c))}</code>
                  <input
                    value={f}
                    onChange={(e) =>
                      patchCat(c.id, (x) => ({
                        ...x,
                        fields: x.fields.map((v, k) => (k === fi ? e.target.value : v)),
                      }))
                    }
                  />
                  <button onClick={() => patchCat(c.id, (x) => ({ ...x, fields: moveItem(x.fields, fi, -1) }))}>
                    ↑
                  </button>
                  <button onClick={() => patchCat(c.id, (x) => ({ ...x, fields: moveItem(x.fields, fi, 1) }))}>
                    ↓
                  </button>
                  <button
                    disabled={c.fields.length < 2}
                    onClick={() =>
                      patchCat(c.id, (x) => ({ ...x, fields: x.fields.filter((_, k) => k !== fi) }))
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                className="add"
                onClick={() =>
                  patchCat(c.id, (x) => ({ ...x, fields: [...x.fields, `Option ${x.fields.length + 1}`] }))
                }
              >
                + field
              </button>
                </>
              )}
            </div>
          ))}

          <div className="toolbar">
            <button
              className="add"
              onClick={() =>
                setCategories((cs) => [...cs, mk(`Category ${cs.length + 1}`, ["Option A", "Option B"])])
              }
            >
              + category
            </button>
            <button
              className="add"
              title="A free-text category such as Pronunciation, written on the page but not part of the binary"
              onClick={() =>
                setCategories((cs) => [
                  ...cs,
                  mkText(cs.some((c) => c.name === "Pronunciation") ? `Text ${cs.length + 1}` : "Pronunciation"),
                ])
              }
            >
              + text category
            </button>
          </div>
        </section>

        <aside>
          <div className="card">
            <h3>Default representation</h3>
            <p className="hint">Used for new spells. Each spell can still pick its own.</p>
            <div className="seg">
              {Object.entries(LAYOUTS).map(([key, l]) => (
                <button
                  key={key}
                  className={key === data.defaultLayout ? "on" : ""}
                  onClick={() => setDefaultLayout(key)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h3>Default colours</h3>
            <p className="hint">
              Used for new spells: the built-in palette, your own colour per category, or a single
              colour for everything. Each spell can still pick its own in the Quill, and spells already
              written keep the colours they were saved with.
            </p>
            <ColorControls
              scheme={data.defaultColors}
              categories={choice}
              onChange={setDefaultColors}
            />
          </div>

          <div className="card">
            <h3>Backup</h3>
            <p className="hint">Export or restore your categories and all spells as one file.</p>
            <div className="toolbar">
              <button onClick={exportBackup}>Export backup</button>
              <button onClick={importBackup}>Import backup</button>
            </div>
            {message && <p className="hint">{message}</p>}
          </div>

          <div className="card">
            <h3>Reset</h3>
            <p className="hint">Restore the default six categories. Your saved spells are not touched.</p>
            <button
              className="danger"
              onClick={() => {
                if (window.confirm("Replace your categories with the defaults?")) resetCategories();
              }}
            >
              Restore default categories
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
