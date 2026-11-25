/* 游戏主程序：界面、动画、输入、关卡与存档 */
(function () {
  "use strict";

  const ROWS = 8,
    COLS = 8,
    TOTAL_LEVELS = 30;
  const STORE_KEY = "bingfen-progress-v1";
  const COLOR_NAMES = ["红心", "橙糖", "黄星", "绿宝石", "蓝钻", "紫水滴"];
  const STAR_RATIOS = [1, 1.4, 1.8];

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

  // ---------------- 关卡配置（按关卡号生成，难度逐步上升） ----------------
  function levelConfig(n) {
    const colors = n <= 4 ? 5 : 6;
    const moves = Math.max(16, 26 - Math.floor((n - 1) / 3));
    const perMove = (colors === 5 ? 70 : 55) + n * 2;
    const target = Math.round((moves * perMove) / 50) * 50;
    const goals = [];
    if (n >= 3)
      goals.push({
        color: (n * 2) % colors,
        count: Math.round(moves * (0.5 + n * 0.012)),
      });
    if (n >= 10)
      goals.push({
        color: (n * 2 + 3) % colors,
        count: Math.round(moves * (0.35 + n * 0.01)),
      });
    return { n: n, colors: colors, moves: moves, target: target, goals: goals };
  }

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
        for (const k in tw.to) tw.obj[k] = tw.to[k];
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
    shake: 0,
  };

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
  function spawnParticles(r, c, color, n) {
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
          color >= 0
            ? pal[color].base
            : pal[Math.floor(Math.random() * pal.length)].base,
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
    [G.beams, G.flashes, G.zaps, G.floats].forEach(function (list) {
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
    const spr = Render.getSprite(t.color, t.special, cell * dpr);
    const size = cell * s;
    const x = pad + (t.x + 0.5) * cell - size / 2;
    const y = pad + (t.y + 0.5) * cell - size / 2;
    ctx.globalAlpha = Math.max(0, Math.min(1, t.a));
    ctx.drawImage(spr, x, y, size, size);
    ctx.globalAlpha = 1;
  }

  function draw(time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, boardPx, boardPx);
    if (G.shake > 0)
      ctx.translate(
        (Math.random() - 0.5) * G.shake * cell * 0.25,
        (Math.random() - 0.5) * G.shake * cell * 0.25,
      );

    // 棋盘底
    ctx.beginPath();
    Render.roundRect(ctx, 0, 0, boardPx, boardPx, boardPx * 0.04);
    ctx.fillStyle = "rgba(20, 8, 45, 0.55)";
    ctx.fill();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
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
      }
    }
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

    if (!G.grid) return;

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

    // 彩虹球闪电
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
    if (!M3.inBounds(G.grid, b.r, b.c)) return;
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
      let clear,
        creates = [],
        triggered = [];
      if (pending) {
        clear = pending.clear;
        triggered = pending.triggered || [];
        pending = null;
      } else {
        const groups = M3.groupRuns(M3.findRuns(G.grid));
        if (!groups.length) break;
        const plan = M3.planMatches(G.grid, groups, preferred);
        clear = plan.clear;
        creates = plan.creates;
      }
      preferred = null;
      triggered = triggered.concat(M3.expandSpecials(G.grid, clear));
      combo++;
      await animClear(clear, creates, triggered, combo);
      if (session !== G.session) return;
      const moves = M3.applyGravity(G.grid);
      const added = M3.refill(G.grid, G.level.colors, Math.random);
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

  async function animClear(clear, creates, triggered, combo) {
    let hasBomb = false,
      big = false;
    triggered.forEach(function (tr) {
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
    else if (triggered.length) Sfx.zap();
    Sfx.match(combo);

    const gained =
      clear.size * 20 * combo + creates.length * 100 + triggered.length * 60;
    G.score += gained;

    let sr = 0,
      sc = 0;
    clear.forEach(function (p) {
      sr += p[0];
      sc += p[1];
    });
    floatText(sr / clear.size, sc / clear.size, "+" + gained, combo);

    const promises = [];
    clear.forEach(function (p) {
      const t = G.grid[p[0]][p[1]];
      if (!t) return;
      G.grid[p[0]][p[1]] = null;
      if (t.color >= 0) G.collected[t.color] = (G.collected[t.color] || 0) + 1;
      spawnParticles(p[0], p[1], t.color);
      G.dying.push(t);
      promises.push(
        tween(t, { s: 0, a: 0 }, 0.24, Ease.inBack).then(function () {
          const i = G.dying.indexOf(t);
          if (i >= 0) G.dying.splice(i, 1);
        }),
      );
    });

    creates.forEach(function (cr) {
      const nt = M3.makeTile(cr.color, cr.special);
      nt.x = cr.c;
      nt.y = cr.r;
      nt.s = 0;
      nt.a = 1;
      G.grid[cr.r][cr.c] = nt;
      promises.push(tween(nt, { s: 1 }, 0.32, Ease.outBack, 0.12));
    });
    if (creates.length) {
      Sfx.create();
      if (
        creates.some(function (c) {
          return c.special === "rainbow";
        })
      )
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
    M3.shuffle(G.grid, G.level.colors, Math.random);
    const ps = [];
    G.grid.forEach(function (row, r) {
      row.forEach(function (t, c) {
        ps.push(tween(t, { x: c, y: r }, 0.45, Ease.inOutQuad));
      });
    });
    await Promise.all(ps);
  }

  function goalsMet() {
    if (G.score < G.level.target) return false;
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
        const r = Math.floor(Math.random() * ROWS),
          c = Math.floor(Math.random() * COLS);
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
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r: r, c: c };
  }

  canvas.addEventListener("pointerdown", function (e) {
    Sfx.unlock();
    e.preventDefault();
    if (!G.playing || G.busy || G.over) return;
    const cellPos = cellFromEvent(e);
    if (!cellPos) return;
    resetIdle();
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

  function endDrag(e) {
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
  function showScreen(id) {
    document.querySelectorAll(".screen").forEach(function (s) {
      s.classList.toggle("active", s.id === id);
    });
    G.playing = id === "game";
    if (id === "game") requestAnimationFrame(resize);
    if (id === "home") buildLevelGrid();
  }

  let goalEls = [];
  function buildGoals() {
    const box = $("#goals");
    box.innerHTML = "";
    goalEls = [];
    const sc = document.createElement("div");
    sc.className = "goal goal-score";
    sc.innerHTML = "目标分 <b>" + G.level.target + "</b>";
    box.appendChild(sc);
    goalEls.push({ el: sc, score: true });
    G.level.goals.forEach(function (g) {
      const el = document.createElement("div");
      el.className = "goal";
      const cv = document.createElement("canvas");
      el.appendChild(cv);
      const cnt = document.createElement("span");
      cnt.className = "count";
      el.appendChild(cnt);
      box.appendChild(el);
      Render.drawIcon(cv, g.color);
      goalEls.push({ el: el, cnt: cnt, goal: g });
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
      const left = Math.max(0, g.goal.count - (G.collected[g.goal.color] || 0));
      g.cnt.textContent = left;
      g.el.classList.toggle("done", left === 0);
    });
  }

  function startLevel(n) {
    hideModal();
    G.session = (G.session || 0) + 1;
    tweens = [];
    G.level = levelConfig(n);
    G.grid = M3.createBoard(ROWS, COLS, G.level.colors);
    placeTilesInstant();
    G.score = 0;
    G.shownScore = 0;
    G.movesLeft = G.level.moves;
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
    $("#hudScore").textContent = "0";
    showScreen("game");
    buildGoals();
    updateHud();
    showIntro();
  }

  function goalText() {
    const lines = [
      "在 " + G.level.moves + " 步内完成：",
      "· 得分达到 " + G.level.target,
    ];
    G.level.goals.forEach(function (g) {
      lines.push("· 消除" + COLOR_NAMES[g.color] + " " + g.count + " 个");
    });
    return lines.join("\n");
  }

  function showIntro() {
    G.busy = true;
    showModal({
      title: "第 " + G.level.n + " 关",
      text: goalText(),
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
    showModal({
      title: n === TOTAL_LEVELS ? "全部通关！" : "过关！",
      stars: stars,
      text: "得分 " + G.score + (isBest ? "（新纪录）" : "\n最高 " + d.best[n]),
      buttons: buttons,
    });
  }

  function showLose() {
    const n = G.level.n;
    const missing = [];
    if (G.score < G.level.target)
      missing.push("还差 " + (G.level.target - G.score) + " 分");
    G.level.goals.forEach(function (g) {
      const left = g.count - (G.collected[g.color] || 0);
      if (left > 0) missing.push(COLOR_NAMES[g.color] + "还差 " + left + " 个");
    });
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
        "<li>在步数内完成目标即可过关，分数越高星星越多。</li>" +
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
    const grid = $("#levelGrid");
    grid.innerHTML = "";
    const d = Save.data;
    for (let i = 1; i <= TOTAL_LEVELS; i++) {
      const b = document.createElement("button");
      b.className = "level-btn";
      const locked = i > d.unlocked;
      if (locked) b.classList.add("locked");
      if (i === d.unlocked) b.classList.add("current");
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
    $("#btnContinue").textContent =
      d.unlocked > 1
        ? "继续第 " + Math.min(d.unlocked, TOTAL_LEVELS) + " 关"
        : "开始游戏";
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
  window.__game = { G: G, startLevel: startLevel, levelConfig: levelConfig };
})();
