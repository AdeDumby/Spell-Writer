import { colorFor } from "../lib/spell.js";

/** The spell's binary string, one colour per category. */
export default function Binary({ parts, size = "lg" }) {
  return (
    <div className={`binary ${size}`} aria-label="Spell binary">
      {parts.map((p, i) => (
        <span key={`${p.categoryId}-${i}`} style={{ color: colorFor(i) }} title={p.category}>
          {p.bits}
        </span>
      ))}
    </div>
  );
}
