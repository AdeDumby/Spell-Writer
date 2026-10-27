import { colorFor } from "../lib/spell.js";

/** The spell's binary string, one colour per category (see resolveColors). */
export default function Binary({ parts, colors, size = "lg" }) {
  return (
    <div className={`binary ${size}`} aria-label="Spell binary">
      {parts.map((p, i) => (
        <span key={`${p.categoryId}-${i}`} style={{ color: colors?.[i] ?? colorFor(i) }} title={p.category}>
          {p.bits}
        </span>
      ))}
    </div>
  );
}
