import { LAYOUTS, colorFor } from "../lib/spell.js";

// Colours for the "paper" theme: dark sepia ink, a crimson wax-red start dot.
const INK = "#2b1d14";
const WAX = "#8f1d1d";

/**
 * Draws a spell. For every bit: 1 = a line between two nodes, 0 = a gap.
 * It only needs the spell's `parts` (bits per category) and a layout name,
 * so it works for saved spells and for the one being written in the Quill.
 *
 * theme "dark"  (default): the card used on screen and in PNG / JPG / SVG exports.
 * theme "paper": no background, drawn like pen-and-ink on parchment (used for the PDF).
 */
export default function Glyph({
  parts,
  layout,
  colors,
  showGaps = true,
  theme = "dark",
  svgRef,
  className = "glyph",
}) {
  const paper = theme === "paper";
  // `colors` is one colour per category; fall back to the built-in palette.
  const colorAt = (ci) => colors?.[ci] ?? colorFor(ci);
  const widths = parts.map((p) => p.bits.length);
  const geo = (LAYOUTS[layout] ?? LAYOUTS.line).build(widths);
  const bitMeta = parts.flatMap((p, ci) =>
    p.bits.split("").map((b) => ({ value: b === "1", ci }))
  );

  const lines = (
    <>
      {geo.bits.map((d, i) =>
        bitMeta[i].value ? (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={colorAt(bitMeta[i].ci)}
            strokeWidth={geo.strokeFor ? geo.strokeFor(bitMeta[i].ci) : 5}
            strokeLinecap="round"
            strokeOpacity={paper ? 0.9 : geo.strokeFor ? 0.92 : 1}
          />
        ) : (
          showGaps && (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={paper ? INK : "#fff"}
              strokeOpacity={paper ? 0.3 : 0.14}
              strokeWidth="2"
              strokeDasharray="1 9"
              strokeLinecap="round"
            />
          )
        )
      )}
      {geo.nodes.map((n, i) => {
        if (paper) {
          // Inked dots; the start dot is a wax-red seal.
          return n.start ? (
            <circle key={i} cx={n.x} cy={n.y} r="8.5" fill={WAX} stroke={INK} strokeWidth="2" />
          ) : (
            <circle key={i} cx={n.x} cy={n.y} r="4" fill={INK} fillOpacity="0.85" />
          );
        }
        return n.start ? (
          // The starting dot (top of the ring in the Superposed layout) stands out.
          // The white ring keeps it visible even when the spell itself is coloured gold.
          <circle key={i} cx={n.x} cy={n.y} r="8" fill="#ffd166" stroke="#fff" strokeWidth="2.5" />
        ) : (
          <circle key={i} cx={n.x} cy={n.y} r="5" fill="#0b0d17" stroke="#fff" strokeOpacity="0.6" />
        );
      })}
    </>
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
      {paper ? (
        <>
          {/* A faint wobble so the lines look drawn by hand rather than ruled. */}
          <defs>
            <filter id="ink" x="-4%" y="-4%" width="108%" height="108%">
              <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
            </filter>
          </defs>
          <g filter="url(#ink)">{lines}</g>
        </>
      ) : (
        <>
          <rect width={geo.w} height={geo.h} fill="#0b0d17" rx="14" />
          {lines}
        </>
      )}
    </svg>
  );
}
