/* ------------------------------------------------------------------ */
/*  A procedural sheet of old paper, drawn on a canvas.                */
/*  No image files: soft stains, fibres, speckles, grain and darker    */
/*  edges, all from a seeded random generator, so the same spell       */
/*  always gets the same sheet.                                        */
/* ------------------------------------------------------------------ */

function seededRandom(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function makePaperCanvas(width, height, seed = 1) {
  const rand = seededRandom(seed);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // Warm cream base.
  ctx.fillStyle = "#efe2c3";
  ctx.fillRect(0, 0, width, height);

  // Cloudy stains: small random patches stretched over the page and smoothed, at three scales.
  const clouds = (cells, alpha, [r, g, b]) => {
    const cw = cells;
    const ch = Math.max(2, Math.round((cells * height) / width));
    const small = document.createElement("canvas");
    small.width = cw;
    small.height = ch;
    const sctx = small.getContext("2d");
    const img = sctx.createImageData(cw, ch);
    for (let i = 0; i < cw * ch; i++) {
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = Math.round(rand() * 255 * alpha);
    }
    sctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(small, 0, 0, width, height);
  };
  clouds(4, 0.3, [196, 152, 88]);
  clouds(9, 0.2, [170, 128, 72]);
  clouds(26, 0.1, [214, 190, 142]);
  clouds(70, 0.05, [150, 112, 64]);

  // Fibres: tiny curved hairs, mostly darker, a few pale.
  ctx.lineCap = "round";
  const fibres = Math.round((width * height) / 1500);
  for (let i = 0; i < fibres; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const len = 5 + rand() * 26;
    const ang = rand() * Math.PI * 2;
    const bend = (rand() - 0.5) * 8;
    const light = rand() < 0.25;
    ctx.strokeStyle = light
      ? `rgba(255, 250, 232, ${0.1 + rand() * 0.18})`
      : `rgba(112, 82, 44, ${0.05 + rand() * 0.11})`;
    ctx.lineWidth = 0.4 + rand() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(ang) * len * 0.5 + bend,
      y + Math.sin(ang) * len * 0.5 - bend,
      x + Math.cos(ang) * len,
      y + Math.sin(ang) * len
    );
    ctx.stroke();
  }

  // Speckles ("foxing") and a few larger faint stains.
  const specks = Math.round((width * height) / 14000);
  for (let i = 0; i < specks; i++) {
    ctx.fillStyle = `rgba(104, 70, 34, ${0.08 + rand() * 0.22})`;
    ctx.beginPath();
    ctx.arc(rand() * width, rand() * height, 0.5 + rand() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 5; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = width * (0.04 + rand() * 0.09);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(150, 105, 50, ${0.06 + rand() * 0.07})`);
    grad.addColorStop(1, "rgba(150, 105, 50, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Fine grain: a little random brightness on every pixel.
  const px = ctx.getImageData(0, 0, width, height);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 16;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n * 0.9;
  }
  ctx.putImageData(px, 0, 0);

  // Aged, darker edges and corners.
  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.38,
    width / 2,
    height / 2,
    Math.hypot(width, height) * 0.54
  );
  vignette.addColorStop(0, "rgba(120, 76, 28, 0)");
  vignette.addColorStop(1, "rgba(120, 76, 28, 0.42)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const edge = Math.round(Math.min(width, height) * 0.035);
  [
    [0, 0, 0, edge, 0, 0, width, edge],
    [0, height, 0, height - edge, 0, height - edge, width, edge],
    [0, 0, edge, 0, 0, 0, edge, height],
    [width, 0, width - edge, 0, width - edge, 0, edge, height],
  ].forEach(([x0, y0, x1, y1, rx, ry, rw, rh]) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, "rgba(96, 58, 20, 0.3)");
    g.addColorStop(1, "rgba(96, 58, 20, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  });

  return canvas;
}

/**
 * A leather book cover, drawn on a canvas: the cover colour with pebbled grain, a slightly darker spine on the
 * left, worn edges and a soft vignette. Seeded, so a book always gets the same cover.
 */
export function makeLeatherCanvas(width, height, color = "#5a1f1f", seed = 1) {
  const rand = seededRandom(seed);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  // Uneven tone, like hide.
  const blot = (alpha, rgb, count, size) => {
    for (let i = 0; i < count; i++) {
      const x = rand() * width;
      const y = rand() * height;
      const r = size * (0.5 + rand());
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb}, ${alpha * (0.4 + rand() * 0.6)})`);
      g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  };
  blot(0.35, "0, 0, 0", 26, width * 0.22);
  blot(0.18, "255, 230, 190", 20, width * 0.16);

  // Pebbled grain: tiny light and dark bumps.
  const bumps = Math.round((width * height) / 260);
  for (let i = 0; i < bumps; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const r = 0.8 + rand() * 1.9;
    ctx.fillStyle = rand() < 0.5 ? `rgba(0,0,0,${0.06 + rand() * 0.14})` : `rgba(255,235,200,${0.03 + rand() * 0.07})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Scratches and scuffs.
  ctx.lineCap = "round";
  for (let i = 0; i < Math.round(width / 6); i++) {
    const x = rand() * width;
    const y = rand() * height;
    const len = 6 + rand() * 40;
    const a = rand() * Math.PI;
    ctx.strokeStyle = `rgba(255, 230, 190, ${0.03 + rand() * 0.06})`;
    ctx.lineWidth = 0.5 + rand() * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }

  // Spine on the left: a darker band with a bright ridge.
  const spine = width * 0.07;
  const sg = ctx.createLinearGradient(0, 0, spine * 1.6, 0);
  sg.addColorStop(0, "rgba(0,0,0,0.5)");
  sg.addColorStop(0.7, "rgba(0,0,0,0.12)");
  sg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, spine * 1.6, height);
  ctx.fillStyle = "rgba(255, 220, 170, 0.12)";
  ctx.fillRect(spine, 0, 2, height);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(spine + 2, 0, 3, height);

  // Worn, darker edges.
  const v = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.hypot(width, height) * 0.55);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, width, height);

  return canvas;
}
