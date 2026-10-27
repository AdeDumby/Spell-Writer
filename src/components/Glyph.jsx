import { LAYOUTS, colorFor } from "../lib/spell.js";

/**
 * Draws a spell. For every bit: 1 = a line between two nodes, 0 = a gap.
 * It only needs the spell's `parts` (bits per category) and a layout name,
 * so it works for saved spells and for the one being written in the Quill.
 */
export default function Glyph({ parts, layout, showGaps = true, svgRef, className = "glyph" }) {
  const widths = parts.map((p) => p.bits.length);
  const geo = (LAYOUTS[layout] ?? LAYOUTS.line).build(widths);
  const bitMeta = parts.flatMap((p, ci) =>
    p.bits.split("").map((b) => ({ value: b === "1", ci }))
  );

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${geo.w} ${geo.h}`}
      width={geo.w}
      height={geo.h}
      className={className}
    >
      <rect width={geo.w} height={geo.h} fill="#0b0d17" rx="14" />
      {geo.bits.map((d, i) =>
        bitMeta[i].value ? (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={colorFor(bitMeta[i].ci)}
            strokeWidth={geo.strokeFor ? geo.strokeFor(bitMeta[i].ci) : 5}
            strokeLinecap="round"
            strokeOpacity={geo.strokeFor ? 0.92 : 1}
          />
        ) : (
          showGaps && (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="#fff"
              strokeOpacity="0.14"
              strokeWidth="2"
              strokeDasharray="1 9"
              strokeLinecap="round"
            />
          )
        )
      )}
      {geo.nodes.map((n, i) =>
        n.start ? (
          // The starting dot (top of the ring in the Superposed layout) stands out.
          <circle key={i} cx={n.x} cy={n.y} r="8" fill="#ffd166" stroke="#0b0d17" strokeWidth="2" />
        ) : (
          <circle key={i} cx={n.x} cy={n.y} r="5" fill="#0b0d17" stroke="#fff" strokeOpacity="0.6" />
        )
      )}
    </svg>
  );
}
