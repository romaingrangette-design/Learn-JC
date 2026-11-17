/* Schémas des fiches mémo : chaque spec de questions.json (units[].fiche.schemas) devient un SVG.
   Utilisé par l'appli (onglet Fiches) et par la page d'impression des PDF. */
(function (root) {
  "use strict";
  const W = 640;
  const C = {
    ink: "var(--ink,#111816)", muted: "var(--muted,#6B7570)", green: "var(--green,#007A55)", dark: "var(--green-dark,#005C40)",
    soft: "var(--green-soft,#EEF6F2)", line: "var(--line,#E5E9E7)", gold: "var(--gold,#B7791F)", surface: "var(--surface,#FFFFFF)", bad: "var(--bad,#C4382E)"
  };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function wrap(text, max) {
    const words = String(text).split(" "), lines = []; let cur = "";
    words.forEach(w => { if ((cur + " " + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
    if (cur) lines.push(cur); return lines;
  }
  function t(x, y, s, o) {
    o = o || {};
    const lines = o.wrap ? wrap(s, o.wrap) : [String(s)], lh = (o.size || 14) * 1.2;
    const y0 = o.vcenter ? y - (lines.length - 1) * lh / 2 : y;
    return '<text x="' + x + '" y="' + y0 + '" text-anchor="' + (o.anchor || "start") + '" style="fill:' + (o.color || C.ink) + ';font-size:' + (o.size || 14) + 'px;font-weight:' + (o.weight || 400) + '">' +
      lines.map((l, i) => '<tspan x="' + x + '" dy="' + (i ? lh : 0) + '">' + esc(l) + '</tspan>').join("") + '</text>';
  }
  const rect = (x, y, w, h, fill, r, extra) => '<rect x="' + x + '" y="' + y + '" width="' + Math.max(0, w) + '" height="' + h + '" rx="' + (r || 0) + '" style="fill:' + fill + (extra || "") + '"/>';
  const lineEl = (x1, y1, x2, y2, col, w, dash) => '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" style="stroke:' + col + ';stroke-width:' + (w || 2) + (dash ? ';stroke-dasharray:' + dash : "") + '"/>';
  const arrow = (x1, y, x2, col) => lineEl(x1, y, x2 - 6, y, col, 2.5) + '<path d="M' + (x2 - 9) + ' ' + (y - 6) + ' L' + x2 + ' ' + y + ' L' + (x2 - 9) + ' ' + (y + 6) + 'Z" style="fill:' + col + '"/>';
  const svg = (h, body, label) => '<svg viewBox="0 0 ' + W + ' ' + h + '" width="100%" role="img" aria-label="' + esc(label) + '" xmlns="http://www.w3.org/2000/svg" style="font-family:inherit;display:block">' + body + '</svg>';

  const R = {
    bars(s) {
      const max = Math.max(...s.items.map(i => i[1])) || 1, row = 40, top = 6, lw = 200, bw = 300;
      let b = "";
      s.items.forEach((it, i) => {
        const y = top + i * row, w = Math.max(4, bw * it[1] / max);
        b += t(lw - 12, y + 21, it[0], {anchor: "end", size: it[0].length > 22 ? 12.5 : 14, weight: 700, color: C.ink, wrap: 26, vcenter: true});
        b += rect(lw, y + 10, bw, 14, C.soft, 7) + rect(lw, y + 10, w, 14, C.green, 7, ";opacity:" + (0.35 + 0.65 * (i + 1) / s.items.length));
        b += t(lw + w + 10, y + 22, it[2], {size: 14, weight: 600, color: C.ink});
      });
      return svg(top + s.items.length * row + 6, b, s.title);
    },
    quinz(s) {
      const x0 = 30, x1 = 610, days = 62, X = d => x0 + (x1 - x0) * (d - 1) / days, y = 70;
      let b = rect(X(16), y - 14, X(47) - X(16), 28, C.soft, 6) + lineEl(x0, y, x1, y, C.line, 3);
      [1, 16, 32, 47, 63].forEach(d => { b += lineEl(X(d), y - 18, X(d), y + 18, C.muted, 2); });
      b += t(X(1), y + 38, "1er", {anchor: "middle", size: 12, color: C.muted}) + t(X(16), y + 38, "16", {anchor: "middle", size: 12, color: C.muted}) +
           t(X(32), y + 38, "1er", {anchor: "middle", size: 12, color: C.muted}) + t(X(47), y + 38, "16", {anchor: "middle", size: 12, color: C.muted});
      b += t((X(1) + X(31)) / 2, y + 58, "Mois 1", {anchor: "middle", size: 13, weight: 700}) + t((X(32) + X(62)) / 2, y + 58, "Mois 2", {anchor: "middle", size: 13, weight: 700});
      b += t((X(16) + X(47)) / 2, y + 5, "l'argent rapporte", {anchor: "middle", size: 14, weight: 700, color: C.dark});
      const dep = X(s.depot), ret = X(31 + s.retrait);
      b += '<circle cx="' + dep + '" cy="' + y + '" r="8" style="fill:' + C.gold + '"/>' + t(dep, y - 30, "Versement le " + s.depot, {anchor: "middle", size: 13, weight: 700, color: C.gold});
      b += '<circle cx="' + ret + '" cy="' + y + '" r="8" style="fill:' + C.bad + '"/>' + t(ret, y - 30, "Retrait le " + s.retrait, {anchor: "middle", size: 13, weight: 700, color: C.bad});
      return svg(140, b, s.title);
    },
    timeline(s) {
      const x0 = 40, x1 = 600, y = 78, X = v => x0 + (x1 - x0) * v / s.max;
      let b = rect(x0, y - 2, x1 - x0, 4, C.line, 2);
      s.points.forEach((p, i) => {
        const x = X(p[0]), up = i % 2 === 0;
        b += '<circle cx="' + x + '" cy="' + y + '" r="' + (i === s.points.length - 1 ? 11 : 8) + '" style="fill:' + C.green + ';stroke:' + C.surface + ';stroke-width:3"/>';
        b += lineEl(x, up ? y - 12 : y + 12, x, up ? y - 26 : y + 26, C.line, 2);
        const anchor = x < 90 ? "start" : x > 550 ? "end" : "middle", tx = anchor === "start" ? x - 8 : anchor === "end" ? x + 8 : x;
        b += t(tx, up ? y - 50 : y + 44, p[1], {anchor, size: 14, weight: 600, color: C.ink});
        if (p[2]) b += t(tx, up ? y - 33 : y + 61, p[2], {anchor, size: 12, color: C.muted});
      });
      return svg(150, b, s.title);
    },
    segments(s) {
      const n = s.segs.length, gap = 4, w = (W - 20 - gap * (n - 1)) / n;
      let b = "";
      s.segs.forEach((g, i) => {
        const x = 10 + i * (w + gap), col = g[3] || C.green;
        b += t(x, 18, g[0], {size: 12.5, weight: 600, color: C.muted});
        b += rect(x, 28, w, 34, col, i === 0 ? 10 : i === n - 1 ? 10 : 3, ";opacity:" + (g[4] || 1));
        b += t(x + w / 2, 50, g[1], {anchor: "middle", size: 12.5, weight: 600, color: "#FFFFFF"});
        b += t(x + w / 2, 82, g[2], {anchor: "middle", size: 11.5, color: C.ink, wrap: 16});
      });
      b += t(W - 10, 18, s.end, {anchor: "end", size: 12.5, weight: 600, color: C.muted});
      return svg(126, b, s.title);
    },
    stack(s) {
      const row = 44, lw = 210, bw = 320, top = s.legend ? 34 : 6;
      let b = "";
      if (s.legend) s.legend.forEach((l, i) => { b += rect(lw + i * 170, 8, 14, 14, l[1], 3) + t(lw + 20 + i * 170, 20, l[0], {size: 12.5, color: C.muted}); });
      s.rows.forEach((r, i) => {
        const y = top + i * row; let x = lw;
        b += t(lw - 12, y + 24, r[0], {anchor: "end", size: 13.5, weight: 700, wrap: 26, vcenter: true});
        b += rect(lw, y + 8, bw, 24, C.soft, 6);
        r[1].forEach((v, k) => { const w = bw * v / s.max; if (w > 0) { b += rect(x, y + 8, w, 24, s.legend[k][1], 0); if (w > 40) b += t(x + w / 2, y + 25, v >= 1000 ? v.toLocaleString("fr-FR") + " €" : String(v).replace(".", ","), {anchor: "middle", size: 12, weight: 700, color: s.legend[k][1] === "#007A55" ? "#FFFFFF" : "#005C40"}); x += w; } });
        b += t(lw + bw + 10, y + 25, r[2], {size: 15, weight: 700, color: C.dark});
      });
      return svg(top + s.rows.length * row + 4, b, s.title);
    },
    flow(s) {
      const n = s.steps.length, gap = 26, w = (W - 20 - gap * (n - 1)) / n;
      let b = "";
      s.steps.forEach((st, i) => {
        const x = 10 + i * (w + gap);
        b += rect(x, 14, w, 104, C.surface, 12, ";stroke:" + (i === 0 ? C.green : C.line) + ";stroke-width:1.5");
        b += '<circle cx="' + (x + 22) + '" cy="34" r="11" style="fill:' + C.green + '"/>' + t(x + 22, 38.5, i + 1, {anchor: "middle", size: 12, weight: 700, color: "#FFFFFF"});
        b += t(x + w / 2, 66, st[0], {anchor: "middle", size: 15, weight: 600, color: C.ink, wrap: 14, vcenter: true});
        b += t(x + w / 2, 92, st[1], {anchor: "middle", size: 11.5, color: C.muted, wrap: 19});
        if (i < n - 1) b += arrow(x + w + 4, 64, x + w + gap - 4, C.muted);
      });
      return svg(128, b, s.title);
    },
    split(s) {
      let b = "";
      const box = (x, lines, strong) => {
        let r = rect(x, 10, 270, 140, strong ? C.surface : C.soft, 12, strong ? ";stroke:" + C.green + ";stroke-width:1.5" : "");
        r += t(x + 135, 40, lines[0], {anchor: "middle", size: 15, weight: 700, color: C.green});
        let yy = 70; lines.slice(1).forEach((l, i) => { const n = wrap(l, 30).length; r += t(x + 135, yy, l, {anchor: "middle", size: 14, weight: i === 0 ? 700 : 400, color: C.ink, wrap: 30}); yy += 26 + (n - 1) * 17; });
        return r;
      };
      b += box(10, s.left, true) + box(360, s.right, false);
      b += '<circle cx="320" cy="80" r="32" style="fill:' + C.surface + ';stroke:' + C.green + ';stroke-width:1.5"/>' + t(320, 85, s.pivot, {anchor: "middle", size: s.pivot.length > 6 ? 11.5 : 15, weight: 700, color: C.green});
      return svg(160, b, s.title);
    },
    tree(s) {
      let b = "";
      const cx = 320, cy = 120, bw = 200, bh = 56, ys = [16, 92, 168];
      s.nodes.forEach((n, i) => { const left = i < 3, x = left ? 10 + bw : 430, y = ys[i % 3] + bh / 2; b += lineEl(left ? cx - 85 : cx + 85, cy, x, y, C.line, 1.5); });
      b += rect(cx - 85, cy - 30, 170, 60, C.green, 30) + t(cx, cy + 5, s.center, {anchor: "middle", size: 15, weight: 700, color: "#FFFFFF", wrap: 14, vcenter: true});
      s.nodes.forEach((n, i) => {
        const x = i < 3 ? 10 : 430, y = ys[i % 3], first = i === 0;
        b += rect(x, y, bw, bh, first ? C.soft : C.surface, 12, ";stroke:" + (first ? C.green : C.line) + ";stroke-width:1.5");
        b += t(x + bw / 2, y + 23, n[0], {anchor: "middle", size: 14, weight: 600, color: C.ink});
        b += t(x + bw / 2, y + 43, n[1], {anchor: "middle", size: 13, weight: 600, color: C.green});
      });
      return svg(236, b, s.title);
    },
    gauge(s) {
      const x0 = 20, w = 600, p = w * s.part;
      let b = rect(x0, 40, w, 46, C.soft, 12) + rect(x0, 40, p, 46, C.green, 12) + rect(x0 + p - 12, 40, 12, 46, C.green, 0);
      b += t(x0 + p / 2, 70, Math.round(s.part * 100) + " %", {anchor: "middle", size: 18, weight: 700, color: "#FFFFFF"});
      b += t(x0 + p + (w - p) / 2, 70, Math.round((1 - s.part) * 100) + " %", {anchor: "middle", size: 18, weight: 700, color: C.dark});
      b += t(x0 + p / 2, 112, s.labels[0], {anchor: "middle", size: 14, weight: 700, color: C.green}) + t(x0 + p + (w - p) / 2, 112, s.labels[1], {anchor: "middle", size: 14, color: C.muted});
      b += t(x0, 26, "assurance emprunteur comprise · 25 ans maximum", {size: 12.5, color: C.muted});
      return svg(126, b, s.title);
    },
    quotite(s) {
      let b = "";
      s.cases.forEach((c, k) => {
        const x = 10 + k * 320, pct = k === 0 ? [50, 50] : [100, 100];
        b += rect(x, 8, 300, 172, k ? C.soft : C.surface, 16, ";stroke:" + C.line + ";stroke-width:2");
        b += t(x + 150, 36, c[0], {anchor: "middle", size: 17, weight: 700, color: C.dark});
        pct.forEach((v, i) => {
          const bx = x + 70 + i * 100, hMax = 80, hh = hMax * v / 100;
          b += rect(bx, 50, 60, hMax, C.line, 6) + rect(bx, 50 + hMax - hh, 60, hh, C.green, 6);
          b += t(bx + 30, 50 + hMax - hh / 2 + 5, v + " %", {anchor: "middle", size: 13, weight: 700, color: "#FFFFFF"});
          b += t(bx + 30, 146, "Emprunteur " + (i + 1), {anchor: "middle", size: 11, color: C.muted});
        });
        b += t(x + 150, 168, c[1], {anchor: "middle", size: 11.5, color: C.ink, wrap: 46});
      });
      return svg(190, b, s.title);
    },
    map(s) {
      const row = 40;
      let b = "";
      s.pairs.forEach((p, i) => {
        const y = 6 + i * row;
        b += rect(10, y, 250, 32, C.surface, 16, ";stroke:" + C.line + ";stroke-width:1.5") + t(135, y + 21, p[0], {anchor: "middle", size: 13.5, weight: 500});
        b += arrow(268, y + 16, 352, C.muted);
        b += rect(360, y, 270, 32, C.soft, 16) + t(495, y + 21, p[1], {anchor: "middle", size: 13.5, weight: 600, color: C.dark});
      });
      return svg(10 + s.pairs.length * row, b, s.title);
    },
    curve(s) {
      const pts = [1]; let c = 1;
      for (let i = 1; i <= 14; i++) { c = Math.max(0.5, Math.floor(c * 0.95 * 100 + 1e-9) / 100); pts.push(c); }
      const x0 = 60, x1 = 610, y0 = 40, y1 = 160, X = i => x0 + (x1 - x0) * i / 14, Y = v => y1 - (y1 - y0) * (v - 0.5) / 0.5;
      let b = "";
      [0.5, 0.75, 1].forEach(v => { b += lineEl(x0, Y(v), x1, Y(v), C.line, 1, "4 4") + t(x0 - 10, Y(v) + 5, v.toFixed(2).replace(".", ","), {anchor: "end", size: 12, color: C.muted}); });
      const path = pts.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join(" ");
      b += '<path d="' + path + ' L' + X(14) + ' ' + y1 + ' L' + X(0) + ' ' + y1 + 'Z" style="fill:' + C.soft + '"/>';
      b += '<path d="' + path + '" style="fill:none;stroke:' + C.green + ';stroke-width:3.5;stroke-linejoin:round"/>';
      [0, 5, 10, 13].forEach(i => { b += '<circle cx="' + X(i) + '" cy="' + Y(pts[i]) + '" r="6" style="fill:' + (i === 13 ? C.gold : C.green) + '"/>' + t(X(i), Y(pts[i]) - 12, pts[i].toFixed(2).replace(".", ","), {anchor: "middle", size: 13, weight: 700, color: i === 13 ? C.gold : C.dark}); });
      [0, 5, 10, 13].forEach(i => { b += t(X(i), y1 + 20, i, {anchor: "middle", size: 12, color: C.muted}); });
      b += t((x0 + x1) / 2, y1 + 40, s.xlabel, {anchor: "middle", size: 12.5, color: C.muted});
      b += t(x1, 22, "malus : × 1,25 par sinistre responsable", {anchor: "end", size: 12.5, weight: 700, color: C.bad});
      return svg(212, b, s.title);
    },
    pyramid(s) {
      const n = s.levels.length, h = 44, top = 8;
      let b = "";
      s.levels.forEach((l, i) => {
        const y = top + i * h, wTop = 180 + i * 120, wBot = 180 + (i + 1) * 120, cx = 320;
        const op = 0.35 + 0.65 * (i + 1) / n;
        b += '<path d="M' + (cx - wTop / 2) + ' ' + y + ' L' + (cx + wTop / 2) + ' ' + y + ' L' + (cx + wBot / 2) + ' ' + (y + h - 4) + ' L' + (cx - wBot / 2) + ' ' + (y + h - 4) + 'Z" style="fill:' + C.green + ';opacity:' + op + '"/>';
        b += t(cx, y + 18, l[0], {anchor: "middle", size: 14, weight: 700, color: i >= 2 ? "#FFFFFF" : C.dark});
        b += t(cx, y + 34, l[1], {anchor: "middle", size: 11.5, color: i >= 2 ? "#E0F1E7" : C.dark});
      });
      b += t(620, top + n * h + 10, "on commence par la base ↑", {anchor: "end", size: 12, color: C.muted});
      return svg(top + n * h + 16, b, s.title);
    }
  };
  function render(spec) { const f = R[spec.type]; return f ? f(spec) : ""; }
  const F = {render, types: Object.keys(R)};
  if (typeof module !== "undefined" && module.exports) module.exports = F; else root.Fiches = F;
})(typeof window !== "undefined" ? window : this);
