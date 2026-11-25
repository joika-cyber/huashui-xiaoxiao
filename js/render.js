/* 方块绘制：用 Canvas 矢量画出原创的糖果造型，预渲染成贴图提高性能 */
(function (root) {
  "use strict";

  // 每种颜色：主色、亮色、暗色，以及造型
  const PALETTE = [
    { base: "#ff4d6d", light: "#ffb3c1", dark: "#a4133c", shape: "heart" },
    { base: "#ff9f1c", light: "#ffd8a8", dark: "#c45500", shape: "square" },
    { base: "#ffd60a", light: "#fff3b0", dark: "#b88a00", shape: "star" },
    { base: "#38d39f", light: "#b7f5dc", dark: "#127a58", shape: "hex" },
    { base: "#4cc9f0", light: "#c4f1ff", dark: "#1767a3", shape: "diamond" },
    { base: "#a25cff", light: "#dcc2ff", dark: "#5a189a", shape: "drop" },
  ];

  function shapePath(ctx, shape, cx, cy, R) {
    ctx.beginPath();
    if (shape === "heart") {
      const s = R * 1.05;
      ctx.moveTo(cx, cy + s * 0.85);
      ctx.bezierCurveTo(
        cx - s * 1.25,
        cy + s * 0.05,
        cx - s * 0.95,
        cy - s * 0.95,
        cx,
        cy - s * 0.4,
      );
      ctx.bezierCurveTo(
        cx + s * 0.95,
        cy - s * 0.95,
        cx + s * 1.25,
        cy + s * 0.05,
        cx,
        cy + s * 0.85,
      );
    } else if (shape === "square") {
      const s = R * 0.86,
        rr = R * 0.32;
      roundRect(ctx, cx - s, cy - s, s * 2, s * 2, rr);
    } else if (shape === "star") {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? R * 1.05 : R * 0.5;
        const x = cx + Math.cos(a) * rad,
          y = cy + Math.sin(a) * rad + R * 0.08;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (shape === "hex") {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        const x = cx + Math.cos(a) * R * 0.98,
          y = cy + Math.sin(a) * R * 0.98;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else if (shape === "diamond") {
      ctx.moveTo(cx, cy - R * 1.02);
      ctx.lineTo(cx + R * 0.85, cy);
      ctx.lineTo(cx, cy + R * 1.02);
      ctx.lineTo(cx - R * 0.85, cy);
      ctx.closePath();
    } else if (shape === "drop") {
      ctx.moveTo(cx, cy - R * 1.05);
      ctx.bezierCurveTo(
        cx + R * 0.5,
        cy - R * 0.45,
        cx + R * 0.92,
        cy + R * 0.05,
        cx + R * 0.92,
        cy + R * 0.3,
      );
      ctx.arc(cx, cy + R * 0.3, R * 0.92, 0, Math.PI, false);
      ctx.bezierCurveTo(
        cx - R * 0.92,
        cy + R * 0.05,
        cx - R * 0.5,
        cy - R * 0.45,
        cx,
        cy - R * 1.05,
      );
      ctx.closePath();
    } else {
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
    }
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGem(ctx, colorIdx, special, size) {
    const cx = size / 2,
      cy = size / 2,
      R = size * 0.38;

    if (special === "rainbow") {
      drawRainbow(ctx, cx, cy, R);
      return;
    }
    const p = PALETTE[colorIdx];

    if (special === "bomb") {
      // 外圈光晕
      const glow = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 1.35);
      glow.addColorStop(0, "rgba(255,255,255,0.55)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);
    }

    // 阴影
    ctx.save();
    ctx.translate(0, size * 0.035);
    shapePath(ctx, p.shape, cx, cy, R);
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fill();
    ctx.restore();

    // 主体渐变
    shapePath(ctx, p.shape, cx, cy, R);
    const grad = ctx.createLinearGradient(cx - R, cy - R, cx + R * 0.6, cy + R);
    grad.addColorStop(0, p.light);
    grad.addColorStop(0.45, p.base);
    grad.addColorStop(1, p.dark);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.strokeStyle = p.dark;
    ctx.stroke();

    // 条纹（直线特殊块）
    if (special === "row" || special === "col") {
      ctx.save();
      shapePath(ctx, p.shape, cx, cy, R);
      ctx.clip();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const w = R * 0.22;
      for (let i = -1; i <= 1; i++) {
        if (special === "row")
          ctx.fillRect(cx - R * 1.2, cy + i * R * 0.55 - w / 2, R * 2.4, w);
        else ctx.fillRect(cx + i * R * 0.55 - w / 2, cy - R * 1.2, w, R * 2.4);
      }
      ctx.restore();
    }

    // 高光
    ctx.save();
    shapePath(ctx, p.shape, cx, cy, R);
    ctx.clip();
    const hl = ctx.createRadialGradient(
      cx - R * 0.35,
      cy - R * 0.45,
      0,
      cx - R * 0.35,
      cy - R * 0.45,
      R * 0.75,
    );
    hl.addColorStop(0, "rgba(255,255,255,0.85)");
    hl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hl;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();

    if (special === "bomb") {
      // 包装纸效果：白色描边 + 中心小火花
      shapePath(ctx, p.shape, cx, cy, R * 1.12);
      ctx.lineWidth = size * 0.06;
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.setLineDash([size * 0.09, size * 0.06]);
      ctx.stroke();
      ctx.setLineDash([]);
      sparkle(ctx, cx, cy, R * 0.42, "#ffffff");
    }
  }

  function sparkle(ctx, x, y, r, color) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const rad = i % 2 === 0 ? r : r * 0.3;
      const px = x + Math.cos(a) * rad,
        py = y + Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawRainbow(ctx, cx, cy, R) {
    ctx.beginPath();
    ctx.arc(cx, cy + R * 0.08, R, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(
      cx - R * 0.3,
      cy - R * 0.3,
      R * 0.1,
      cx,
      cy,
      R,
    );
    g.addColorStop(0, "#5e4b8b");
    g.addColorStop(1, "#1a1033");
    ctx.fillStyle = g;
    ctx.fill();

    // 彩色小糖粒
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI * 2) / 12 + 0.2;
      const rad = i % 2 ? R * 0.62 : R * 0.35;
      ctx.beginPath();
      ctx.arc(
        cx + Math.cos(a) * rad,
        cy + Math.sin(a) * rad,
        R * 0.13,
        0,
        Math.PI * 2,
      );
      ctx.fillStyle = PALETTE[i % PALETTE.length].base;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.lineWidth = R * 0.1;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.stroke();

    const hl = ctx.createRadialGradient(
      cx - R * 0.4,
      cy - R * 0.45,
      0,
      cx - R * 0.4,
      cy - R * 0.45,
      R * 0.6,
    );
    hl.addColorStop(0, "rgba(255,255,255,0.7)");
    hl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
  }

  // 预渲染贴图缓存：key = color|special
  let cache = new Map();
  let cacheSize = 0;

  function getSprite(color, special, sizePx) {
    sizePx = Math.max(8, Math.round(sizePx));
    if (sizePx !== cacheSize) {
      cache = new Map();
      cacheSize = sizePx;
    }
    const k = color + "|" + (special || "");
    let cv = cache.get(k);
    if (!cv) {
      cv = document.createElement("canvas");
      cv.width = cv.height = sizePx;
      drawGem(cv.getContext("2d"), color, special, sizePx);
      cache.set(k, cv);
    }
    return cv;
  }

  function drawIcon(canvas, color, special) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cssSize = canvas.clientWidth || 32;
    canvas.width = canvas.height = Math.round(cssSize * dpr);
    const ctx = canvas.getContext("2d");
    drawGem(ctx, color, special || null, canvas.width);
  }

  root.Render = {
    PALETTE: PALETTE,
    getSprite: getSprite,
    drawIcon: drawIcon,
    roundRect: roundRect,
  };
})(window);
