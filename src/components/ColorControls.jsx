import { COLOR_MODES, MONO_PRESETS, colorFor, resolveColors } from "../lib/spell.js";

/**
 * Pick how a spell is coloured:
 *   Palette -> the built-in colour per category
 *   Custom  -> choose a colour for each category
 *   Mono    -> one colour for the whole spell
 * `categories` is any list of { id, name }. Fully controlled via `scheme` / `onChange`.
 */
export default function ColorControls({ scheme, categories, onChange }) {
  const set = (patch) => onChange({ ...scheme, ...patch });

  const setMode = (mode) => {
    if (mode === "custom") {
      // Start from what's on screen now, so switching modes doesn't change anything until you pick.
      const shown = resolveColors(categories, { ...scheme, mode: "auto" });
      const custom = Object.fromEntries(
        categories.map((c, i) => [c.id, scheme.custom[c.id] ?? shown[i]])
      );
      onChange({ ...scheme, mode, custom });
    } else {
      set({ mode });
    }
  };

  return (
    <div className="colors">
      <div className="seg" role="group" aria-label="Colour mode">
        {Object.entries(COLOR_MODES).map(([key, label]) => (
          <button key={key} className={key === scheme.mode ? "on" : ""} onClick={() => setMode(key)}>
            {label}
          </button>
        ))}
      </div>

      {scheme.mode === "custom" && (
        <div className="swatches">
          {categories.map((c, i) => (
            <label key={c.id} className="swatch" title={`Colour for ${c.name}`}>
              <input
                type="color"
                value={scheme.custom[c.id] ?? colorFor(i)}
                onChange={(e) => set({ custom: { ...scheme.custom, [c.id]: e.target.value } })}
              />
              <span>{c.name}</span>
            </label>
          ))}
          <button className="link" onClick={() => set({ custom: {} })}>
            Reset to palette
          </button>
        </div>
      )}

      {scheme.mode === "mono" && (
        <div className="swatches">
          <label className="swatch" title="Spell colour">
            <input type="color" value={scheme.mono} onChange={(e) => set({ mono: e.target.value })} />
            <span>Spell colour</span>
          </label>
          {MONO_PRESETS.map((c) => (
            <button
              key={c}
              className={`dot ${scheme.mono.toLowerCase() === c ? "on" : ""}`}
              style={{ background: c }}
              onClick={() => set({ mono: c })}
              aria-label={`Use ${c}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
