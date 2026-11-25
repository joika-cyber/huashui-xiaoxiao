/* 游戏主程序：界面、动画、输入、关卡与存档 */
(function () {
  "use strict";

  const ROWS = Levels.ROWS,
    COLS = Levels.COLS,
    TOTAL_LEVELS = Levels.TOTAL;
  const STORE_KEY = "bingfen-progress-v1"; // 沿用旧键名，保留已有进度
  const COLOR_NAMES = ["红心", "橙糖", "黄星", "绿宝石", "蓝钻", "紫水滴"];
  const STAR_RATIOS = [1, 1.4, 1.8];
  // 各章选关按钮配色：亮、暗、阴影
  const CH_BTN = [
    ["#8f5bff", "#6a2fd6", "#3f1a8a"],
    ["#ff6fae", "#d6337f", "#8a1a50"],
    ["#5bb8ff", "#2f7fd6", "#1a4a8a"],
    ["#4fd39a", "#22a06b", "#11603f"],
    ["#ffcc4d", "#e09b12", "#8a5a05"],
  ];

  const $ = function (s) {
    return document.querySelector(s);
  };

  // ---------------- 存档（localStorage 不可用时静默降级） ----------------
  const Save = {
    data: { unlocked: 1, stars: {}, best: {}, muted: false },
    load: function () {
      try {
        const s = localStorage.getItem(STORE_KEY);
        if (s) Object.assign(this.data, JSON.parse(s));
      } catch (e) {
        /* 隐私模式等情况下忽略 */
      }
    },
    save: function () {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
      } catch (e) {
        /* 忽略 */
      }
    },
  };

  // ---------------- 补间动画 ----------------
  const Ease = {
    linear: function (t) {
      return t;
    },
    outQuad: function (t) {
      return 1 - (1 - t) * (1 - t);
    },
    inOutQuad: function (t) {
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    },
    outBack: function (t) {
      const c1 = 1.70158,
        c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    inBack: function (t) {
      return 2.70158 * t * t * t - 1.70158 * t * t;
    },
    // 加速下落后轻微回弹
    fall: function (t) {
      if (t < 0.8) {
        const u = t / 0.8;
        return u * u;
      }
      const u = (t - 0.8) / 0.2;
      return 1 - Math.sin(u * Math.PI) * 0.06;
    },
    // 先放大再回到原状（冰块被敲）
    bump: function (t) {
      return Math.sin(t * Math.PI);
    },
  };

  let tweens = [];
  function tween(obj, to, dur, ease, delay) {
    return new Promise(function (resolve) {
      tweens.push({
        obj: obj,
        to: to,
        from: null,
        dur: dur,
        ease: ease || Ease.outQuad,
        delay: delay || 0,
        t: 0,
        resolve: resolve,
      });
    });
  }
  function updateTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      if (tw.t < tw.delay) continue;
      if (!tw.from) {
        tw.from = {};
        for (const k in tw.to) tw.from[k] = tw.obj[k];
      }
      const p = Math.min(1, (tw.t - tw.delay) / tw.dur);
      const e = tw.ease(p);
      for (const k in tw.to)
        tw.obj[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      if (p >= 1) {
        for (const k in tw.to)
          tw.obj[k] = tw.ease === Ease.bump ? tw.from[k] : tw.to[k];
        tweens.splice(i, 1);
        tw.resolve();
      }
    }
  }
  function sleep(sec) {
    return tween({ v: 0 }, { v: 1 }, sec, Ease.linear);
  }

  // ---------------- 游戏状态 ----------------
  const G = {
    level: null,
    state: null, // { grid, mask, jelly }
    grid: null,
    score: 0,
    shownScore: 0,
    movesLeft: 0,
    collected: [],
    busy: false,
    over: false,
    playing: false,
    selected: null,
    hint: null,
    idle: 0,
    dying: [],
    particles: [],
    beams: [],
    flashes: [],
    zaps: [],
    floats: [],
    splashes: [],
    shake: 0,
  };

  function isPlayable(r, c) {
    return (
      r >= 0 &&
      r < ROWS &&
      c >= 0 &&
      c < COLS &&
      (!G.state.mask || G.state.mask[r][c])
    );
  }

  // ---------------- 画布尺寸 ----------------
  const canvas = $("#board");
  const ctx = canvas.getContext("2d");
  let boardPx = 0,
    cell = 0,
    pad = 0,
    dpr = 1;

  function resize() {
    const wrap = $("#boardWrap");
    const size = Math.floor(Math.min(wrap.clientWidth, wrap.clientHeight, 640));
    if (size <= 0) return;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.style.width = canvas.style.height = size + "px";
    canvas.width = canvas.height = Math.round(size * dpr);
    boardPx = size;
    pad = size * 0.025;
    cell = (size - pad * 2) / COLS;
  }

  function cellCenter(r, c) {
    return { x: pad + (c + 0.5) * cell, y: pad + (r + 0.5) * cell };
  }

  // ---------------- 特效 ----------------
  function spawnParticles(r, c, color, n, fixedColor) {
    const p = cellCenter(r, c);
    const pal = Render.PALETTE;
    for (let i = 0; i < (n || 7); i++) {
      const a = Math.random() * Math.PI * 2,
        sp = cell * (2 + Math.random() * 4);
      G.particles.push({
        x: p.x,
        y: p.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - cell * 2,
        life: 0.5 + Math.random() * 0.3,
        max: 0.8,
        size: cell * (0.06 + Math.random() * 0.08),
        color:
          fixedColor ||
          (color >= 0
            ? pal[color].base
            : pal[Math.floor(Math.random() * pal.length)].base),
      });
    }
  }

  function floatText(r, c, text, combo) {
    const p = cellCenter(r, c);
    G.floats.push({
      x: p.x,
      y: p.y,
      text: text,
      life: 0.9,
      max: 0.9,
      scale: 1 + Math.min(combo - 1, 4) * 0.15,
    });
  }

  let toastTimer = 0;
  function toast(text, ms) {
    const el = $("#toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove("show");
    }, ms || 900);
  }

  function updateFx(dt) {
    G.particles = G.particles.filter(function (p) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += cell * 14 * dt;
      return p.life > 0;
    });
    [G.beams, G.flashes, G.zaps, G.floats, G.splashes].forEach(function (list) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life -= dt;
        if (list[i].life <= 0) list.splice(i, 1);
      }
    });
    G.floats.forEach(function (f) {
      f.y -= cell * 1.2 * dt;
    });
    G.shake = Math.max(0, G.shake - dt * 3);
  }

  // ---------------- 绘制 ----------------
  function drawTile(t, time) {
    if (!t || t.s <= 0.01 || t.a <= 0.01) return;
    let s = t.s;
    if (G.hint && (G.hint[0] === t || G.hint[1] === t))
      s *= 1 + 0.07 * Math.sin(time * 9);
    if (G.selected && G.grid[G.selected.r][G.selected.c] === t)
      s *= 1.1 + 0.03 * Math.sin(time * 10);
    const spr =
      t.ice !== undefined
        ? Render.getSprite(-2, "ice" + Math.max(1, t.ice), cell * dpr)
        : Render.getSprite(t.color, t.special, cell * dpr);
    const size = cell * s;
    const x = pad + (t.x + 0.5) * cell - size / 2;
    const y = pad + (t.y + 0.5) * cell - size / 2;
    ctx.globalAlpha = Math.max(0, Math.min(1, t.a));
    ctx.drawImage(spr, x, y, size, size);
    ctx.globalAlpha = 1;
  }

  function drawBoardBase() {
    const mask = G.state && G.state.mask;
    // 棋盘底：所有可用格子外扩后合成一个形状，一次填充避免重叠处变暗
    ctx.beginPath();
    if (!mask) {
      Render.roundRect(ctx, 0, 0, boardPx, boardPx, boardPx * 0.04);
    } else {
      const e = pad * 0.9;
      for (let r = 0; r < ROWS; r++)
        for (let c = 0; c < COLS; c++)
          if (mask[r][c])
            ctx.rect(
              pad + c * cell - e,
              pad + r * cell - e,
              cell + e * 2,
              cell + e * 2,
            );
    }
    ctx.fillStyle = "rgba(20, 8, 45, 0.55)";
    ctx.fill();

    const jelly = G.state && G.state.jelly;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (mask && !mask[r][c]) continue;
        ctx.beginPath();
        Render.roundRect(
          ctx,
          pad + c * cell + 1.5,
          pad + r * cell + 1.5,
          cell - 3,
          cell - 3,
          cell * 0.18,
        );
        ctx.fillStyle =
          (r + c) % 2 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.12)";
        ctx.fill();
        const j = jelly ? jelly[r][c] : 0;
        if (j > 0) {
          ctx.beginPath();
          Render.roundRect(
            ctx,
            pad + c * cell + 2.5,
            pad + r * cell + 2.5,
            cell - 5,
            cell - 5,
            cell * 0.2,
          );
          ctx.fillStyle =
            j >= 2 ? "rgba(255, 70, 165, 0.7)" : "rgba(255, 120, 190, 0.5)";
          ctx.fill();
          ctx.lineWidth = j >= 2 ? 2.5 : 1.5;
          ctx.strokeStyle = "rgba(255, 190, 225, 0.85)";
          ctx.stroke();
        }
      }
    }
  }

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, boardPx, boardPx);
    if (G.shake > 0)
      ctx.translate(
        (Math.random() - 0.5) * G.shake * cell * 0.25,
        (Math.random() - 0.5) * G.shake * cell * 0.25,
      );

    if (!G.state) return;
    drawBoardBase();

    // 果冻被清掉时的粉色涟漪
    G.splashes.forEach(function (s) {
      const k = s.life / s.max;
      const ctr = cellCenter(s.r, s.c);
      ctx.beginPath();
      ctx.arc(ctr.x, ctr.y, cell * (0.6 - k * 0.3), 0, Math.PI * 2);
      ctx.lineWidth = cell * 0.1 * k;
      ctx.strokeStyle = "rgba(255, 140, 200," + k + ")";
      ctx.stroke();
    });

    if (G.selected) {
      ctx.beginPath();
      Render.roundRect(
        ctx,
        pad + G.selected.c * cell + 2,
        pad + G.selected.r * cell + 2,
        cell - 4,
        cell - 4,
        cell * 0.18,
      );
      ctx.fillStyle = "rgba(255, 214, 10, 0.28)";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = "rgba(255, 214, 10, 0.9)";
      ctx.stroke();
    }

    // 方块（裁剪到棋盘内，新方块从上方滑入）
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad, pad, cell * COLS, cell * ROWS);
    ctx.clip();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) drawTile(G.grid[r][c], time);
    G.dying.forEach(function (t) {
      drawTile(t, time);
    });
    ctx.restore();

    // 直线光束
    G.beams.forEach(function (b) {
      const k = b.life / b.max;
      const ctr = cellCenter(b.r, b.c);
      const th = cell * (0.25 + 0.6 * k);
      ctx.globalAlpha = k;
      const grad =
        b.dir === "row"
          ? ctx.createLinearGradient(0, ctr.y - th / 2, 0, ctr.y + th / 2)
          : ctx.createLinearGradient(ctr.x - th / 2, 0, ctr.x + th / 2, 0);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, "rgba(255,255,255,1)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = grad;
      if (b.dir === "row") ctx.fillRect(pad, ctr.y - th / 2, cell * COLS, th);
      else ctx.fillRect(ctr.x - th / 2, pad, th, cell * ROWS);
      ctx.globalAlpha = 1;
    });

    // 炸弹冲击波
    G.flashes.forEach(function (f) {
      const k = f.life / f.max;
      const ctr = cellCenter(f.r, f.c);
      ctx.beginPath();
      ctx.arc(ctr.x, ctr.y, cell * f.rad * (1.2 - k * 0.7), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 240, 200," + 0.55 * k + ")";
      ctx.fill();
      ctx.lineWidth = cell * 0.12 * k;
      ctx.strokeStyle = "rgba(255,255,255," + k + ")";
      ctx.stroke();
    });

    // 彩虹糖闪电
    G.zaps.forEach(function (z) {
      const k = z.life / z.max;
      const from = cellCenter(z.r, z.c);
      ctx.lineWidth = cell * 0.08;
      ctx.strokeStyle = "rgba(255,255,255," + k + ")";
      ctx.shadowColor = "#ffd6ff";
      ctx.shadowBlur = 10;
      z.targets.forEach(function (p) {
        const to = cellCenter(p[0], p[1]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        const mx = (from.x + to.x) / 2 + (Math.random() - 0.5) * cell * 0.6;
        const my = (from.y + to.y) / 2 + (Math.random() - 0.5) * cell * 0.6;
        ctx.lineTo(mx, my);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
      });
      ctx.shadowBlur = 0;
    });

    G.particles.forEach(function (p) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    G.floats.forEach(function (f) {
      const k = f.life / f.max;
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font =
        "900 " +
        Math.round(cell * 0.5 * f.scale) +
        'px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(90, 20, 70, 0.9)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = "#fff6b0";
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    });
  }

  // ---------------- 主循环 ----------------
  let lastTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    updateTweens(dt);
    updateFx(dt);
    if (G.playing) {
      // 分数滚动
      if (G.shownScore !== G.score) {
        G.shownScore += (G.score - G.shownScore) * Math.min(1, dt * 10);
        if (Math.abs(G.score - G.shownScore) < 1) G.shownScore = G.score;
        $("#hudScore").textContent = Math.round(G.shownScore);
      }
      // 闲置 5 秒提示
      if (!G.busy && !G.over && !G.hint) {
        G.idle += dt;
        if (G.idle > 5) {
          const mv = M3.findPossibleMove(G.grid);
          if (mv) G.hint = [G.grid[mv[0].r][mv[0].c], G.grid[mv[1].r][mv[1].c]];
        }
      }
      draw(now / 1000);
    }
    requestAnimationFrame(frame);
  }

  function resetIdle() {
    G.idle = 0;
    G.hint = null;
  }

  // ---------------- 核心流程 ----------------
  function placeTilesInstant() {
    G.grid.forEach(function (row, r) {
      row.forEach(function (t, c) {
        if (!t) return;
        t.x = c;
        t.y = r;
        t.s = 1;
        t.a = 1;
      });
    });
  }

  function animSwap(a, b) {
    const ta = G.grid[a.r][a.c],
      tb = G.grid[b.r][b.c];
    M3.swapCells(G.grid, a, b);
    return Promise.all([
      tween(ta, { x: b.c, y: b.r }, 0.16, Ease.inOutQuad),
      tween(tb, { x: a.c, y: a.r }, 0.16, Ease.inOutQuad),
    ]);
  }

  async function attemptSwap(a, b) {
    if (G.busy || G.over) return;
    if (!M3.canSwap(G.grid, a, b)) {
      // 冰块或空洞不能交换
      if (isPlayable(b.r, b.c) && G.grid[b.r][b.c] && G.grid[b.r][b.c].ice) {
        Sfx.invalid();
        const t = G.grid[b.r][b.c];
        tween(t, { s: 1.12 }, 0.2, Ease.bump);
      }
      return;
    }
    G.busy = true;
    G.selected = null;
    resetIdle();
    const session = G.session;
    Sfx.swap();
    await animSwap(a, b);
    if (session !== G.session) return;

    // a 位置现在是被换过来的方块，b 是玩家拖动的方块
    const activation = M3.activateSwap(G.grid, a, b);
    if (!activation && M3.findRuns(G.grid).length === 0) {
      Sfx.invalid();
      await animSwap(a, b);
      if (session !== G.session) return;
      G.busy = false;
      return;
    }
    G.movesLeft--;
    updateHud();
    await cascade(activation, [b, a], session);
    if (session !== G.session) return;
    G.busy = false;
    await checkEnd(session);
  }

  async function cascade(initial, preferred, session) {
    let combo = 0;
    let pending = initial;
    while (true) {
      const step = M3.resolveStep(G.state, pending, preferred);
      pending = null;
      preferred = null;
      if (!step) break;
      combo++;
      await animStep(step, combo);
      if (session !== G.session) return;
      const moves = M3.applyGravity(G.grid, G.state.mask);
      const added = M3.refill(
        G.grid,
        G.level.colors,
        Math.random,
        G.state.mask,
      );
      await animFall(moves, added);
      if (session !== G.session) return;
    }
    if (combo >= 3) {
      const words = [
        "",
        "",
        "",
        "漂亮！",
        "太棒了！",
        "超级连击！",
        "无敌了！",
      ];
      toast(words[Math.min(combo, words.length - 1)]);
    }
    if (!M3.findPossibleMove(G.grid)) await doShuffle(session);
  }

  // 播放一步结算的动画（逻辑已在 resolveStep 中完成）
  async function animStep(step, combo) {
    let hasBomb = false,
      big = false;
    step.triggered.forEach(function (tr) {
      if (tr.special === "row" || tr.special === "col") {
        G.beams.push({
          r: tr.r,
          c: tr.c,
          dir: tr.special,
          life: 0.45,
          max: 0.45,
        });
      } else if (tr.special === "bomb") {
        hasBomb = true;
        big = big || !!tr.big;
        G.flashes.push({
          r: tr.r,
          c: tr.c,
          rad: tr.big ? 2.8 : 1.8,
          life: 0.4,
          max: 0.4,
        });
        G.shake = Math.max(G.shake, tr.big ? 1 : 0.6);
      } else if (tr.special === "rainbow") {
        G.zaps.push({
          r: tr.r,
          c: tr.c,
          targets: tr.area,
          life: 0.5,
          max: 0.5,
        });
        G.shake = Math.max(G.shake, 0.5);
      }
    });
    if (hasBomb) Sfx.blast(big);
    else if (step.triggered.length) Sfx.zap();
    Sfx.match(combo);
    if (step.iceHits.length) Sfx.ice(step.iceHits.some((h) => h.destroyed));

    const gained = M3.stepScore(step, combo);
    G.score += gained;

    let sr = 0,
      sc = 0,
      n = 0;
    step.removed.forEach(function (x) {
      sr += x.r;
      sc += x.c;
      n++;
    });
    if (n) floatText(sr / n, sc / n, "+" + gained, combo);

    const promises = [];
    function fadeOut(t) {
      G.dying.push(t);
      promises.push(
        tween(t, { s: 0, a: 0 }, 0.24, Ease.inBack).then(function () {
          const i = G.dying.indexOf(t);
          if (i >= 0) G.dying.splice(i, 1);
        }),
      );
    }
    step.removed.forEach(function (x) {
      if (x.tile.color >= 0)
        G.collected[x.tile.color] = (G.collected[x.tile.color] || 0) + 1;
      spawnParticles(x.r, x.c, x.tile.color);
      fadeOut(x.tile);
    });
    step.iceHits.forEach(function (h) {
      spawnParticles(h.r, h.c, -1, h.destroyed ? 12 : 5, "#d8f4ff");
      if (h.destroyed) fadeOut(h.tile);
      else promises.push(tween(h.tile, { s: 1.15 }, 0.22, Ease.bump));
    });
    step.jellyHits.forEach(function (j) {
      G.splashes.push({ r: j.r, c: j.c, life: 0.45, max: 0.45 });
    });
    step.created.forEach(function (cr) {
      const nt = cr.tile;
      nt.x = cr.c;
      nt.y = cr.r;
      nt.s = 0;
      nt.a = 1;
      promises.push(tween(nt, { s: 1 }, 0.32, Ease.outBack, 0.12));
    });
    if (step.created.length) {
      Sfx.create();
      if (step.created.some((c) => c.tile.special === "rainbow"))
        toast("彩虹糖！");
    }

    updateHud();
    await Promise.all(promises);
  }

  function animFall(moves, added) {
    const ps = [];
    moves.forEach(function (m) {
      const d = Math.abs(m.toR - m.tile.y);
      ps.push(
        tween(m.tile, { y: m.toR }, 0.08 + 0.12 * Math.sqrt(d), Ease.fall),
      );
    });
    added.forEach(function (a) {
      const t = a.tile;
      t.x = a.c;
      t.y = a.fromR;
      t.s = 1;
      t.a = 1;
      ps.push(
        tween(
          t,
          { y: a.toR },
          0.08 + 0.12 * Math.sqrt(a.toR - a.fromR),
          Ease.fall,
        ),
      );
    });
    return Promise.all(ps);
  }

  async function doShuffle(session) {
    toast("没有可走的步了，洗牌！", 1200);
    Sfx.shuffle();
    await sleep(0.5);
    if (session !== G.session) return;
    M3.shuffle(G.grid, G.level.colors, Math.random, G.state.mask);
    const ps = [];
    G.grid.forEach(function (row, r) {
      row.forEach(function (t, c) {
        if (t) ps.push(tween(t, { x: c, y: r }, 0.45, Ease.inOutQuad));
      });
    });
    await Promise.all(ps);
  }

  function jellyLeft() {
    return M3.countJelly(G.state.jelly);
  }
  function iceLeft() {
    return M3.countIce(G.grid);
  }

  function goalsMet() {
    if (G.score < G.level.target) return false;
    if (G.level.jelly && jellyLeft() > 0) return false;
    if (G.level.ice.length && iceLeft() > 0) return false;
    return G.level.goals.every(function (g) {
      return (G.collected[g.color] || 0) >= g.count;
    });
  }

  function starsFor(score) {
    let s = 0;
    STAR_RATIOS.forEach(function (ratio) {
      if (score >= G.level.target * ratio) s++;
    });
    return s;
  }

  async function checkEnd(session) {
    if (G.over) return;
    if (goalsMet()) {
      G.over = true;
      updateHud();
      Sfx.win();
      toast("过关！", 1200);
      await sleep(1.0);
      // 剩余步数奖励
      while (G.movesLeft > 0) {
        if (session !== G.session) return;
        G.movesLeft--;
        G.score += 200;
        let r, c;
        do {
          r = Math.floor(Math.random() * ROWS);
          c = Math.floor(Math.random() * COLS);
        } while (!isPlayable(r, c));
        spawnParticles(r, c, -1, 10);
        floatText(r, c, "+200", 1);
        Sfx.tick();
        updateHud();
        await sleep(0.12);
      }
      await sleep(0.6);
      if (session !== G.session) return;
      showWin();
    } else if (G.movesLeft <= 0) {
      G.over = true;
      updateHud();
      await sleep(0.5);
      if (session !== G.session) return;
      Sfx.lose();
      showLose();
    }
  }

  // ---------------- 输入 ----------------
  let drag = null;

  function cellFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - pad,
      y = e.clientY - rect.top - pad;
    const c = Math.floor(x / cell),
      r = Math.floor(y / cell);
    if (!isPlayable(r, c)) return null;
    return { r: r, c: c };
  }

  canvas.addEventListener("pointerdown", function (e) {
    Sfx.unlock();
    e.preventDefault();
    if (!G.playing || G.busy || G.over) return;
    const cellPos = cellFromEvent(e);
    if (!cellPos) return;
    resetIdle();
    const t = G.grid[cellPos.r][cellPos.c];
    if (t && t.ice) {
      // 点到冰块：提示不能移动
      Sfx.invalid();
      tween(t, { s: 1.12 }, 0.2, Ease.bump);
      G.selected = null;
      return;
    }
    drag = { start: cellPos, x: e.clientX, y: e.clientY, moved: false };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (err) {
      /* 忽略 */
    }
  });

  canvas.addEventListener("pointermove", function (e) {
    if (!drag || drag.moved) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    const th = cell * 0.35;
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    drag.moved = true;
    const target =
      Math.abs(dx) > Math.abs(dy)
        ? { r: drag.start.r, c: drag.start.c + (dx > 0 ? 1 : -1) }
        : { r: drag.start.r + (dy > 0 ? 1 : -1), c: drag.start.c };
    G.selected = null;
    attemptSwap(drag.start, target);
  });

  function endDrag() {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved || G.busy || G.over) return;
    const cellPos = d.start;
    const sel = G.selected;
    if (
      sel &&
      Math.abs(sel.r - cellPos.r) + Math.abs(sel.c - cellPos.c) === 1
    ) {
      attemptSwap(sel, cellPos);
    } else if (sel && sel.r === cellPos.r && sel.c === cellPos.c) {
      G.selected = null;
    } else {
      G.selected = cellPos;
      Sfx.select();
    }
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", function () {
    drag = null;
  });

  // 阻止 iOS 双指缩放和页面回弹
  document.addEventListener("gesturestart", function (e) {
    e.preventDefault();
  });
  document.addEventListener(
    "touchmove",
    function (e) {
      if (!e.target.closest("#home")) e.preventDefault();
    },
    { passive: false },
  );

  // ---------------- 界面 ----------------
  const DEFAULT_BG = Levels.CHAPTERS[0].bg;
  function setBackground(bg) {
    document.body.style.background =
      "radial-gradient(120% 90% at 20% 0%, " +
      bg[0] +
      " 0%, " +
      bg[1] +
      " 55%, " +
      bg[2] +
      " 100%)";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", bg[1]);
  }

  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (s) {
      s.classList.toggle("active", s.id === id);
    });
    G.playing = id === "game";
    if (id === "game") requestAnimationFrame(resize);
    if (id === "home") {
      setBackground(DEFAULT_BG);
      buildLevelGrid();
    }
  }

  let goalEls = [];
  function addGoalChip(iconColor, iconSpecial, getLeft) {
    const el = document.createElement("div");
    el.className = "goal";
    const cv = document.createElement("canvas");
    el.appendChild(cv);
    const cnt = document.createElement("span");
    cnt.className = "count";
    el.appendChild(cnt);
    $("#goals").appendChild(el);
    Render.drawIcon(cv, iconColor, iconSpecial);
    goalEls.push({ el: el, cnt: cnt, left: getLeft });
  }

  function buildGoals() {
    const box = $("#goals");
    box.innerHTML = "";
    goalEls = [];
    const sc = document.createElement("div");
    sc.className = "goal goal-score";
    sc.textContent = "目标分 ";
    const b = document.createElement("b");
    b.textContent = G.level.target;
    sc.appendChild(b);
    box.appendChild(sc);
    goalEls.push({ el: sc, score: true });
    if (G.level.jelly) addGoalChip(0, "jelly", jellyLeft);
    if (G.level.ice.length) addGoalChip(-2, "ice2", iceLeft);
    G.level.goals.forEach(function (g) {
      addGoalChip(g.color, null, function () {
        return Math.max(0, g.count - (G.collected[g.color] || 0));
      });
    });
  }

  function updateHud() {
    if (!G.level) return;
    $("#hudLevel").textContent = G.level.n;
    $("#hudMoves").textContent = G.movesLeft;
    $(".stat-moves").classList.toggle("low", G.movesLeft <= 5 && !G.over);
    const maxScore = G.level.target * STAR_RATIOS[2];
    $("#progressFill").style.width =
      Math.min(100, (G.score / maxScore) * 100) + "%";
    STAR_RATIOS.forEach(function (ratio, i) {
      const el = $("#pstar" + (i + 1));
      el.style.left = (ratio / STAR_RATIOS[2]) * 100 - (i === 2 ? 3 : 0) + "%";
      el.classList.toggle("on", G.score >= G.level.target * ratio);
    });
    goalEls.forEach(function (g) {
      if (g.score) {
        g.el.classList.toggle("done", G.score >= G.level.target);
        return;
      }
      const left = g.left();
      g.cnt.textContent = left;
      g.el.classList.toggle("done", left === 0);
    });
  }

  function startLevel(n) {
    hideModal();
    G.session = (G.session || 0) + 1;
    tweens = [];
    G.level = Levels.levelConfig(n);
    const lv = G.level;
    G.state = {
      grid: M3.createBoard(ROWS, COLS, lv.colors, Math.random, {
        mask: lv.mask,
        ice: lv.ice,
      }),
      mask: lv.mask,
      jelly: lv.jelly
        ? lv.jelly.map(function (row) {
            return row.slice();
          })
        : null,
    };
    G.grid = G.state.grid;
    placeTilesInstant();
    G.score = 0;
    G.shownScore = 0;
    G.movesLeft = lv.moves;
    G.collected = [];
    G.busy = false;
    G.over = false;
    G.selected = null;
    resetIdle();
    G.dying = [];
    G.particles = [];
    G.beams = [];
    G.flashes = [];
    G.zaps = [];
    G.floats = [];
    G.splashes = [];
    $("#hudScore").textContent = "0";
    setBackground(Levels.CHAPTERS[lv.chapter - 1].bg);
    showScreen("game");
    buildGoals();
    updateHud();
    showIntro();
  }

  function goalText() {
    const lv = G.level;
    const lines = ["在 " + lv.moves + " 步内完成："];
    if (lv.jelly)
      lines.push("· 清除全部果冻（共 " + M3.countJelly(lv.jelly) + " 层）");
    if (lv.ice.length)
      lines.push("· 敲碎全部冰块（共 " + lv.ice.length + " 块）");
    lv.goals.forEach(function (g) {
      lines.push("· 消除" + COLOR_NAMES[g.color] + " " + g.count + " 个");
    });
    lines.push("· 得分达到 " + lv.target);
    return lines.join("\n");
  }

  function showIntro() {
    G.busy = true;
    const lv = G.level;
    const ch = Levels.CHAPTERS[lv.chapter - 1];
    showModal({
      title: "第 " + lv.n + " 关",
      text:
        (lv.intro ? lv.intro + "\n\n" : "") +
        "【" +
        ch.name +
        "】\n" +
        goalText(),
      buttons: [
        {
          label: "开始",
          cls: "btn-primary",
          onClick: function () {
            Sfx.unlock();
            hideModal();
            G.busy = false;
          },
        },
      ],
    });
  }

  function showWin() {
    const n = G.level.n;
    const stars = Math.max(1, starsFor(G.score));
    const d = Save.data;
    d.stars[n] = Math.max(d.stars[n] || 0, stars);
    const isBest = G.score > (d.best[n] || 0);
    d.best[n] = Math.max(d.best[n] || 0, G.score);
    if (n + 1 > d.unlocked && n < TOTAL_LEVELS) d.unlocked = n + 1;
    Save.save();
    const buttons = [
      {
        label: "选关",
        cls: "btn-ghost",
        onClick: function () {
          hideModal();
          showScreen("home");
        },
      },
      {
        label: "重玩",
        cls: "btn-secondary",
        onClick: function () {
          startLevel(n);
        },
      },
    ];
    if (n < TOTAL_LEVELS)
      buttons.push({
        label: "下一关",
        cls: "btn-primary",
        onClick: function () {
          startLevel(n + 1);
        },
      });
    let title = "过关！";
    let extra = "";
    if (n === TOTAL_LEVELS) {
      title = "全部通关！";
      extra = "\n王羊奶太强了！100 关全部拿下！";
    } else if (n % 20 === 0) {
      title = "第 " + n / 20 + " 章完成！";
      extra = "\n下一章：" + Levels.CHAPTERS[n / 20].name;
    }
    showModal({
      title: title,
      stars: stars,
      text:
        "得分 " +
        G.score +
        (isBest ? "（新纪录）" : "\n最高 " + d.best[n]) +
        extra,
      buttons: buttons,
    });
  }

  function showLose() {
    const n = G.level.n;
    const missing = [];
    if (G.level.jelly && jellyLeft() > 0)
      missing.push("果冻还剩 " + jellyLeft() + " 层");
    if (G.level.ice.length && iceLeft() > 0)
      missing.push("冰块还剩 " + iceLeft() + " 块");
    G.level.goals.forEach(function (g) {
      const left = g.count - (G.collected[g.color] || 0);
      if (left > 0) missing.push(COLOR_NAMES[g.color] + "还差 " + left + " 个");
    });
    if (G.score < G.level.target)
      missing.push("还差 " + (G.level.target - G.score) + " 分");
    showModal({
      title: "步数用完了",
      text: missing.join("，") + "\n再试一次吧！",
      buttons: [
        {
          label: "选关",
          cls: "btn-ghost",
          onClick: function () {
            hideModal();
            showScreen("home");
          },
        },
        {
          label: "再试一次",
          cls: "btn-primary",
          onClick: function () {
            startLevel(n);
          },
        },
      ],
    });
  }

  function showPause() {
    showModal({
      title: "暂停",
      text: goalText(),
      buttons: [
        {
          label: "选关",
          cls: "btn-ghost",
          onClick: function () {
            hideModal();
            showScreen("home");
          },
        },
        {
          label: "重新开始",
          cls: "btn-secondary",
          onClick: function () {
            startLevel(G.level.n);
          },
        },
        { label: "继续", cls: "btn-primary", onClick: hideModal },
      ],
    });
  }

  function showHelp() {
    showModal({
      title: "玩法说明",
      html:
        '<ul class="help-list">' +
        "<li>滑动或先后点击两个相邻方块进行交换，<b>三个或以上同色</b>连成一线即可消除。</li>" +
        "<li><b>四连</b>：生成条纹糖，引爆时清除整行或整列。</li>" +
        "<li><b>L 形 / T 形</b>：生成炸弹糖，引爆时清除周围 3×3。</li>" +
        "<li><b>五连</b>：生成彩虹糖，与任意方块交换可清除全部同色。</li>" +
        "<li>两个特殊糖互相交换会产生更强的组合效果。</li>" +
        "<li><b>果冻</b>：在果冻格上消除即可清掉一层。</li>" +
        "<li><b>冰块</b>：不能移动，在旁边消除或用特殊糖波及可敲掉一层。</li>" +
        "<li>在步数内完成全部目标即可过关，分数越高星星越多。</li>" +
        "</ul>",
      buttons: [{ label: "知道了", cls: "btn-primary", onClick: hideModal }],
    });
  }

  function showModal(opt) {
    $("#modalTitle").textContent = opt.title;
    const starsEl = $("#modalStars");
    starsEl.classList.toggle("hidden", opt.stars == null);
    Array.prototype.forEach.call(starsEl.children, function (s, i) {
      s.classList.remove("on");
      if (opt.stars != null && i < opt.stars) {
        void s.offsetWidth; // 重新触发动画
        s.classList.add("on");
      }
    });
    const text = $("#modalText");
    if (opt.html) text.innerHTML = opt.html;
    else text.textContent = opt.text || "";
    const btns = $("#modalButtons");
    btns.innerHTML = "";
    (opt.buttons || []).forEach(function (b) {
      const el = document.createElement("button");
      el.className = "btn " + (b.cls || "btn-ghost");
      el.textContent = b.label;
      el.addEventListener("click", function () {
        Sfx.unlock();
        b.onClick();
      });
      btns.appendChild(el);
    });
    $("#modal").classList.add("show");
    $("#modal").setAttribute("aria-hidden", "false");
  }

  function hideModal() {
    $("#modal").classList.remove("show");
    $("#modal").setAttribute("aria-hidden", "true");
  }

  function buildLevelGrid() {
    const root = $("#levelGrid");
    root.innerHTML = "";
    const d = Save.data;
    let currentChapterEl = null;
    Levels.CHAPTERS.forEach(function (ch, ci) {
      const from = ci * 20 + 1,
        to = ci * 20 + 20;
      const block = document.createElement("div");
      block.className = "chapter";
      const colors = CH_BTN[ci];
      block.style.setProperty("--btn1", colors[0]);
      block.style.setProperty("--btn2", colors[1]);
      block.style.setProperty("--btn3", colors[2]);
      if (from > d.unlocked) block.classList.add("locked-ch");

      let starSum = 0;
      for (let i = from; i <= to; i++) starSum += d.stars[i] || 0;
      const head = document.createElement("div");
      head.className = "chapter-head";
      const name = document.createElement("span");
      name.className = "chapter-name";
      const small = document.createElement("small");
      small.textContent = "第 " + (ci + 1) + " 章";
      name.appendChild(small);
      name.appendChild(document.createTextNode(ch.name));
      const stars = document.createElement("span");
      stars.className = "chapter-stars";
      stars.textContent = "★ " + starSum + " / 60";
      head.appendChild(name);
      head.appendChild(stars);
      block.appendChild(head);
      const desc = document.createElement("div");
      desc.className = "chapter-desc";
      desc.textContent = "第 " + from + "–" + to + " 关 · " + ch.desc;
      block.appendChild(desc);

      const grid = document.createElement("div");
      grid.className = "level-grid";
      for (let i = from; i <= to; i++) {
        const b = document.createElement("button");
        b.className = "level-btn";
        const locked = i > d.unlocked;
        if (locked) b.classList.add("locked");
        if (i === d.unlocked) {
          b.classList.add("current");
          currentChapterEl = block;
        }
        const st = d.stars[i] || 0;
        b.innerHTML =
          "<span>" +
          (locked ? "🔒" : i) +
          "</span>" +
          '<span class="stars">' +
          [1, 2, 3]
            .map(function (k) {
              return '<span class="' + (k <= st ? "on" : "") + '">★</span>';
            })
            .join("") +
          "</span>";
        if (!locked)
          b.addEventListener("click", function () {
            Sfx.unlock();
            startLevel(i);
          });
        else b.disabled = true;
        grid.appendChild(b);
      }
      block.appendChild(grid);
      root.appendChild(block);
    });
    $("#btnContinue").textContent =
      d.unlocked > 1
        ? "继续第 " + Math.min(d.unlocked, TOTAL_LEVELS) + " 关"
        : "开始游戏";
    // 滚动到当前章节
    if (currentChapterEl && d.unlocked > 20) {
      requestAnimationFrame(function () {
        currentChapterEl.scrollIntoView({ block: "start" });
      });
    }
  }

  function applyMute() {
    Sfx.muted = Save.data.muted;
    $("#btnSound").classList.toggle("muted", Save.data.muted);
    $("#btnSoundHome").textContent = "音效：" + (Save.data.muted ? "关" : "开");
  }
  function toggleMute() {
    Save.data.muted = !Save.data.muted;
    Save.save();
    applyMute();
    Sfx.unlock();
  }

  // ---------------- 启动 ----------------
  Save.load();
  applyMute();
  $("#btnContinue").addEventListener("click", function () {
    Sfx.unlock();
    startLevel(Math.min(Save.data.unlocked, TOTAL_LEVELS));
  });
  $("#btnHelp").addEventListener("click", showHelp);
  $("#btnSoundHome").addEventListener("click", toggleMute);
  $("#btnSound").addEventListener("click", toggleMute);
  $("#btnMenu").addEventListener("click", function () {
    if (!G.over) showPause();
  });
  window.addEventListener("resize", function () {
    if (G.playing) resize();
  });
  window.addEventListener("orientationchange", function () {
    setTimeout(resize, 200);
  });

  showScreen("home");
  requestAnimationFrame(frame);

  // 离线缓存（需 https 或 localhost）
  if (
    "serviceWorker" in navigator &&
    (location.protocol === "https:" ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1")
  ) {
    navigator.serviceWorker.register("sw.js").catch(function () {
      /* 忽略 */
    });
  }

  // 调试/测试用
  window.__game = {
    G: G,
    startLevel: startLevel,
    levelConfig: Levels.levelConfig,
    Save: Save,
  };
})();
