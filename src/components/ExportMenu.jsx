import { useEffect, useRef, useState } from "react";
import { FORMATS, exportSpell } from "../lib/export.js";

/**
 * "Export ▾" button with PNG / JPG / PDF / SVG.
 * `getSpell` is called at click time so it always exports what is on screen right now.
 * `up` opens the menu upwards (for buttons near the bottom of a card).
 */
export default function ExportMenu({ getSpell, up = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const [status, setStatus] = useState(null); // { ok: boolean, text: string }
  const root = useRef(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => root.current && !root.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Fade the confirmation away.
  useEffect(() => {
    if (!status) return undefined;
    const t = setTimeout(() => setStatus(null), status.ok ? 3500 : 8000);
    return () => clearTimeout(t);
  }, [status]);

  const run = async (format) => {
    setOpen(false);
    setBusy(format);
    setStatus(null);
    try {
      const where = await exportSpell(getSpell(), format);
      if (where) setStatus({ ok: true, text: `Saved ${FORMATS[format].label.split(" ")[0]}` });
    } catch (err) {
      console.error(err);
      setStatus({ ok: false, text: err?.message || "Export failed" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <span className="menu" ref={root}>
      <button onClick={() => setOpen((o) => !o)} disabled={!!busy} aria-haspopup="menu" aria-expanded={open}>
        {busy ? `Exporting ${busy.toUpperCase()}…` : "Export ▾"}
      </button>
      {open && (
        <div className={`menu-pop ${up ? "up" : ""}`} role="menu">
          {Object.entries(FORMATS).map(([key, f]) => (
            <button key={key} role="menuitem" onClick={() => run(key)}>
              <b>{f.label}</b>
              <span className="muted">{f.hint}</span>
            </button>
          ))}
        </div>
      )}
      {status && <span className={status.ok ? "export-ok" : "err export-err"}>{status.text}</span>}
    </span>
  );
}
