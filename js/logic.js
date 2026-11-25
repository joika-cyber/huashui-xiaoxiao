/*
 * 三消核心逻辑（纯逻辑，不依赖 DOM，可在 Node 中测试）
 *
 * 棋盘状态 state = { grid, mask, jelly }
 *   grid[r][c]  = tile | null（mask 为 false 的格子是棋盘上的空洞，永远为 null）
 *   mask[r][c]  = true 表示可用格子；mask 为 null 表示整个矩形都可用
 *   jelly[r][c] = 0/1/2，果冻层数；为 null 表示本关没有果冻
 *
 * tile = { id, color, special, ice }
 *   color: 0..n-1；彩虹糖 color = -1；冰块 color = -2
 *   special: null | 'row' | 'col' | 'bomb' | 'rainbow'
 *   ice: 冰块剩余耐久（仅冰块有）。冰块不能交换、不参与匹配，会随重力下落，
 *        相邻格子发生消除或被特殊糖波及时耐久 -1，归零后碎掉
 */
(function (root) {
  "use strict";

  let nextId = 1;
  function makeTile(color, special) {
    return { id: nextId++, color: color, special: special || null };
  }
  function makeIce(hp) {
    const t = makeTile(-2, null);
    t.ice = hp || 1;
    return t;
  }

  function key(r, c) {
    return r + "," + c;
  }

  function inBounds(grid, r, c) {
    return r >= 0 && r < grid.length && c >= 0 && c < grid[0].length;
  }

  function playable(mask, r, c) {
    return !mask || mask[r][c];
  }

  function movable(t) {
    return !!t && !t.ice;
  }

  function randInt(rng, n) {
    return Math.floor(rng() * n);
  }

  // 可复现的随机数（关卡布局用）
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 找出所有横向/纵向连续 >=3 的同色段
  function findRuns(grid) {
    const rows = grid.length,
      cols = grid[0].length,
      runs = [];
    for (let r = 0; r < rows; r++) {
      let c = 0;
      while (c < cols) {
        const t = grid[r][c];
        if (!t || t.color < 0) {
          c++;
          continue;
        }
        let e = c + 1;
        while (e < cols && grid[r][e] && grid[r][e].color === t.color) e++;
        if (e - c >= 3) {
          const cells = [];
          for (let k = c; k < e; k++) cells.push([r, k]);
          runs.push({ dir: "h", color: t.color, cells: cells });
        }
        c = e;
      }
    }
    for (let c = 0; c < cols; c++) {
      let r = 0;
      while (r < rows) {
        const t = grid[r][c];
        if (!t || t.color < 0) {
          r++;
          continue;
        }
        let e = r + 1;
        while (e < rows && grid[e][c] && grid[e][c].color === t.color) e++;
        if (e - r >= 3) {
          const cells = [];
          for (let k = r; k < e; k++) cells.push([k, c]);
          runs.push({ dir: "v", color: t.color, cells: cells });
        }
        r = e;
      }
    }
    return runs;
  }

  // 把共享格子的段合并成组（用于识别 L / T 形）
  function groupRuns(runs) {
    const parent = runs.map(function (_, i) {
      return i;
    });
    function find(i) {
      return parent[i] === i ? i : (parent[i] = find(parent[i]));
    }
    const owner = new Map();
    runs.forEach(function (run, i) {
      run.cells.forEach(function (p) {
        const k = key(p[0], p[1]);
        if (owner.has(k)) parent[find(i)] = find(owner.get(k));
        else owner.set(k, i);
      });
    });
    const groups = new Map();
    runs.forEach(function (run, i) {
      const root = find(i);
      if (!groups.has(root))
        groups.set(root, { runs: [], cells: new Map(), color: run.color });
      const g = groups.get(root);
      g.runs.push(run);
      run.cells.forEach(function (p) {
        g.cells.set(key(p[0], p[1]), p);
      });
    });
    return Array.from(groups.values());
  }

  // 根据匹配组决定要消除的格子和要生成的特殊块
  // preferred: 优先放置特殊块的位置（通常是玩家交换的两个格子）
  function planMatches(grid, groups, preferred) {
    const clear = new Map();
    const creates = [];
    groups.forEach(function (g) {
      g.cells.forEach(function (p, k) {
        clear.set(k, p);
      });
      let longest = g.runs[0];
      g.runs.forEach(function (r) {
        if (r.cells.length > longest.cells.length) longest = r;
      });
      const maxLen = longest.cells.length;
      const hasH = g.runs.some(function (r) {
        return r.dir === "h";
      });
      const hasV = g.runs.some(function (r) {
        return r.dir === "v";
      });

      let special = null;
      if (maxLen >= 5) special = "rainbow";
      else if (hasH && hasV) special = "bomb";
      else if (maxLen === 4) special = longest.dir === "h" ? "row" : "col";
      if (!special) return;

      let pos = null;
      if (preferred) {
        for (let i = 0; i < preferred.length; i++) {
          const p = preferred[i];
          if (p && g.cells.has(key(p.r, p.c))) {
            pos = [p.r, p.c];
            break;
          }
        }
      }
      if (!pos && special === "bomb") {
        const count = new Map();
        g.runs.forEach(function (run) {
          run.cells.forEach(function (p) {
            const k = key(p[0], p[1]);
            count.set(k, (count.get(k) || 0) + 1);
            if (count.get(k) >= 2 && !pos) pos = p;
          });
        });
      }
      if (!pos) pos = longest.cells[Math.floor(longest.cells.length / 2)];
      creates.push({
        r: pos[0],
        c: pos[1],
        color: special === "rainbow" ? -1 : g.color,
        special: special,
      });
    });
    return { clear: clear, creates: creates };
  }

  function mostCommonColor(grid) {
    const count = {};
    let best = 0,
      bestN = -1;
    grid.forEach(function (row) {
      row.forEach(function (t) {
        if (t && t.color >= 0) {
          count[t.color] = (count[t.color] || 0) + 1;
          if (count[t.color] > bestN) {
            bestN = count[t.color];
            best = t.color;
          }
        }
      });
    });
    return best;
  }

  function cellsOfColor(grid, color) {
    const out = [];
    grid.forEach(function (row, r) {
      row.forEach(function (t, c) {
        if (t && t.color === color) out.push([r, c]);
      });
    });
    return out;
  }

  // 特殊块被触发时影响的格子
  function specialArea(grid, r, c, special) {
    const rows = grid.length,
      cols = grid[0].length,
      out = [];
    if (special === "row") {
      for (let k = 0; k < cols; k++) out.push([r, k]);
    } else if (special === "col") {
      for (let k = 0; k < rows; k++) out.push([k, c]);
    } else if (special === "bomb") {
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          if (inBounds(grid, r + dr, c + dc)) out.push([r + dr, c + dc]);
    } else if (special === "rainbow") {
      return cellsOfColor(grid, mostCommonColor(grid));
    }
    return out;
  }

  // 连锁触发：被消除格子里的特殊块会扩大消除范围
  function expandSpecials(grid, clear) {
    const queue = Array.from(clear.values());
    const seen = new Set();
    const triggered = [];
    while (queue.length) {
      const p = queue.shift();
      const k = key(p[0], p[1]);
      if (seen.has(k)) continue;
      seen.add(k);
      const t = grid[p[0]][p[1]];
      if (!t || !t.special || t.consumed) continue;
      t.consumed = true;
      const area = specialArea(grid, p[0], p[1], t.special);
      triggered.push({
        r: p[0],
        c: p[1],
        special: t.special,
        color: t.color,
        area: area,
      });
      area.forEach(function (q) {
        const qk = key(q[0], q[1]);
        if (!clear.has(qk)) clear.set(qk, q);
        queue.push(q);
      });
    }
    return triggered;
  }

  // 交换后的特殊组合。p、q 为交换后两块所在位置，q 为玩家拖动方块的落点
  // 返回 null 表示没有特殊组合，走普通匹配
  function activateSwap(grid, p, q) {
    const a = grid[p.r][p.c],
      b = grid[q.r][q.c];
    if (!movable(a) || !movable(b)) return null;
    const clear = new Map();
    const triggered = [];
    function add(cell) {
      clear.set(key(cell[0], cell[1]), cell);
    }

    const aR = a.special === "rainbow",
      bR = b.special === "rainbow";
    if (aR || bR) {
      const rb = aR ? a : b,
        other = aR ? b : a;
      const rbPos = aR ? p : q,
        otherPos = aR ? q : p;
      rb.consumed = true;
      add([rbPos.r, rbPos.c]);
      if (aR && bR) {
        // 两个彩虹糖：清空全盘
        b.consumed = true;
        const all = [];
        grid.forEach(function (row, r) {
          row.forEach(function (t, c) {
            if (t) {
              all.push([r, c]);
              add([r, c]);
            }
          });
        });
        triggered.push({
          r: q.r,
          c: q.c,
          special: "rainbow",
          color: -1,
          area: all,
        });
      } else {
        const targets = cellsOfColor(grid, other.color);
        if (other.special) {
          // 彩虹 + 特殊块：同色块全部变成该特殊块并引爆
          targets.forEach(function (cell) {
            const t = grid[cell[0]][cell[1]];
            if (!t.special) {
              t.special =
                other.special === "row" || other.special === "col"
                  ? Math.random() < 0.5
                    ? "row"
                    : "col"
                  : other.special;
            }
          });
        }
        targets.forEach(add);
        add([otherPos.r, otherPos.c]);
        triggered.push({
          r: rbPos.r,
          c: rbPos.c,
          special: "rainbow",
          color: other.color,
          area: targets,
        });
      }
      return { clear: clear, triggered: triggered };
    }

    if (a.special && b.special) {
      a.consumed = true;
      b.consumed = true;
      const rows = grid.length,
        cols = grid[0].length;
      const lineA = a.special === "row" || a.special === "col";
      const lineB = b.special === "row" || b.special === "col";
      const area = [];
      if (lineA && lineB) {
        for (let k = 0; k < cols; k++) area.push([q.r, k]);
        for (let k = 0; k < rows; k++) area.push([k, q.c]);
        triggered.push({
          r: q.r,
          c: q.c,
          special: "row",
          color: b.color,
          area: area,
        });
        triggered.push({
          r: q.r,
          c: q.c,
          special: "col",
          color: b.color,
          area: [],
        });
      } else if (!lineA && !lineB) {
        for (let dr = -2; dr <= 2; dr++)
          for (let dc = -2; dc <= 2; dc++)
            if (inBounds(grid, q.r + dr, q.c + dc))
              area.push([q.r + dr, q.c + dc]);
        triggered.push({
          r: q.r,
          c: q.c,
          special: "bomb",
          color: b.color,
          area: area,
          big: true,
        });
      } else {
        // 炸弹 + 直线：三行三列
        for (let d = -1; d <= 1; d++) {
          if (q.r + d >= 0 && q.r + d < rows) {
            for (let k = 0; k < cols; k++) area.push([q.r + d, k]);
            triggered.push({
              r: q.r + d,
              c: q.c,
              special: "row",
              color: b.color,
              area: [],
            });
          }
          if (q.c + d >= 0 && q.c + d < cols) {
            for (let k = 0; k < rows; k++) area.push([k, q.c + d]);
            triggered.push({
              r: q.r,
              c: q.c + d,
              special: "col",
              color: b.color,
              area: [],
            });
          }
        }
        triggered[0].area = area;
      }
      area.forEach(add);
      add([p.r, p.c]);
      add([q.r, q.c]);
      return { clear: clear, triggered: triggered };
    }
    return null;
  }

  // 执行消除：移除方块、削减果冻、敲击冰块（被波及或与被消除格相邻）
  function applyClear(state, clear) {
    const grid = state.grid,
      jelly = state.jelly;
    const removed = [],
      iceHits = [],
      jellyHits = [];
    const hitIce = new Set();

    function hitJelly(r, c) {
      if (jelly && jelly[r][c] > 0) {
        jelly[r][c]--;
        jellyHits.push({ r: r, c: c, left: jelly[r][c] });
      }
    }
    function hitIceAt(r, c) {
      const k = key(r, c);
      if (hitIce.has(k)) return;
      const t = grid[r][c];
      if (!t || !t.ice) return;
      hitIce.add(k);
      t.ice--;
      const destroyed = t.ice <= 0;
      if (destroyed) {
        grid[r][c] = null;
        hitJelly(r, c);
      }
      iceHits.push({ r: r, c: c, tile: t, destroyed: destroyed });
    }

    const cleared = [];
    clear.forEach(function (p) {
      const t = grid[p[0]][p[1]];
      if (!t) return;
      if (t.ice) {
        hitIceAt(p[0], p[1]);
        return;
      }
      grid[p[0]][p[1]] = null;
      removed.push({ r: p[0], c: p[1], tile: t });
      hitJelly(p[0], p[1]);
      cleared.push(p);
    });
    cleared.forEach(function (p) {
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].forEach(function (d) {
        const r = p[0] + d[0],
          c = p[1] + d[1];
        if (inBounds(grid, r, c)) hitIceAt(r, c);
      });
    });
    return { removed: removed, iceHits: iceHits, jellyHits: jellyHits };
  }

  // 一步结算：匹配/特殊组合 → 连锁 → 消除 → 生成特殊糖。不处理下落与补充
  // pending: activateSwap 的结果（交换触发的特殊组合），没有则传 null
  // 返回 null 表示没有可消除的
  function resolveStep(state, pending, preferred) {
    const grid = state.grid;
    let clear,
      creates = [],
      triggered = [];
    if (pending) {
      clear = pending.clear;
      triggered = pending.triggered || [];
    } else {
      const groups = groupRuns(findRuns(grid));
      if (!groups.length) return null;
      const plan = planMatches(grid, groups, preferred);
      clear = plan.clear;
      creates = plan.creates;
    }
    triggered = triggered.concat(expandSpecials(grid, clear));
    const res = applyClear(state, clear);
    const created = [];
    creates.forEach(function (cr) {
      if (grid[cr.r][cr.c]) return; // 同一格已被占用
      const t = makeTile(cr.color, cr.special);
      grid[cr.r][cr.c] = t;
      created.push({ r: cr.r, c: cr.c, tile: t });
    });
    return {
      clear: clear,
      triggered: triggered,
      removed: res.removed,
      iceHits: res.iceHits,
      jellyHits: res.jellyHits,
      created: created,
    };
  }

  function stepScore(step, combo) {
    return (
      step.removed.length * 20 * combo +
      step.created.length * 100 +
      step.triggered.length * 60 +
      step.iceHits.length * 40 +
      step.jellyHits.length * 40
    );
  }

  function playableRows(grid, mask, c) {
    const out = [];
    for (let r = 0; r < grid.length; r++) if (playable(mask, r, c)) out.push(r);
    return out;
  }

  // 重力下落（跨过空洞），返回移动记录
  function applyGravity(grid, mask) {
    const cols = grid[0].length,
      moves = [];
    for (let c = 0; c < cols; c++) {
      const rowsList = playableRows(grid, mask, c);
      let w = rowsList.length - 1;
      for (let i = rowsList.length - 1; i >= 0; i--) {
        const r = rowsList[i];
        const t = grid[r][c];
        if (t) {
          const to = rowsList[w];
          if (to !== r) {
            grid[to][c] = t;
            grid[r][c] = null;
            moves.push({ tile: t, c: c, fromR: r, toR: to });
          }
          w--;
        }
      }
    }
    return moves;
  }

  // 顶部补充新块，fromR 为负数表示从棋盘上方落下
  function refill(grid, nColors, rng, mask) {
    const cols = grid[0].length,
      added = [];
    for (let c = 0; c < cols; c++) {
      const rowsList = playableRows(grid, mask, c);
      const empty = rowsList.filter(function (r) {
        return !grid[r][c];
      });
      empty.forEach(function (r, i) {
        const t = makeTile(randInt(rng, nColors));
        grid[r][c] = t;
        added.push({ tile: t, c: c, fromR: i - empty.length, toR: r });
      });
    }
    return added;
  }

  function sameColor(grid, r, c, color) {
    return inBounds(grid, r, c) && grid[r][c] && grid[r][c].color === color;
  }

  function hasMatchAt(grid, r, c) {
    const t = grid[r][c];
    if (!t || t.color < 0) return false;
    const col = t.color;
    let h = 1,
      v = 1;
    for (let k = c - 1; sameColor(grid, r, k, col); k--) h++;
    for (let k = c + 1; sameColor(grid, r, k, col); k++) h++;
    for (let k = r - 1; sameColor(grid, k, c, col); k--) v++;
    for (let k = r + 1; sameColor(grid, k, c, col); k++) v++;
    return h >= 3 || v >= 3;
  }

  function swapCells(grid, a, b) {
    const t = grid[a.r][a.c];
    grid[a.r][a.c] = grid[b.r][b.c];
    grid[b.r][b.c] = t;
  }

  // 两格能否交换（都存在且不是冰块）
  function canSwap(grid, a, b) {
    return (
      inBounds(grid, a.r, a.c) &&
      inBounds(grid, b.r, b.c) &&
      movable(grid[a.r][a.c]) &&
      movable(grid[b.r][b.c])
    );
  }

  // 列出所有有效交换
  function findAllMoves(grid) {
    const rows = grid.length,
      cols = grid[0].length,
      out = [];
    const dirs = [
      [0, 1],
      [1, 0],
    ];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        for (let d = 0; d < dirs.length; d++) {
          const pa = { r: r, c: c },
            pb = { r: r + dirs[d][0], c: c + dirs[d][1] };
          if (!canSwap(grid, pa, pb)) continue;
          const a = grid[pa.r][pa.c],
            b = grid[pb.r][pb.c];
          if (
            a.special === "rainbow" ||
            b.special === "rainbow" ||
            (a.special && b.special)
          ) {
            out.push([pa, pb]);
            continue;
          }
          swapCells(grid, pa, pb);
          const ok =
            hasMatchAt(grid, pa.r, pa.c) || hasMatchAt(grid, pb.r, pb.c);
          swapCells(grid, pa, pb);
          if (ok) out.push([pa, pb]);
        }
      }
    }
    return out;
  }

  // 找一个可行的交换（用于提示和判断是否需要洗牌）
  function findPossibleMove(grid) {
    const all = findAllMoves(grid);
    return all.length ? all[0] : null;
  }

  // 给可用格子随机上色，避免现成的三连。保留冰块
  function fillNoMatches(grid, nColors, rng, mask) {
    const rows = grid.length,
      cols = grid[0].length;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!playable(mask, r, c)) {
          grid[r][c] = null;
          continue;
        }
        if (grid[r][c] && grid[r][c].ice) continue;
        let color,
          guard = 0;
        do {
          color = randInt(rng, nColors);
          guard++;
        } while (
          guard < 50 &&
          ((c >= 2 &&
            sameColor(grid, r, c - 1, color) &&
            sameColor(grid, r, c - 2, color)) ||
            (r >= 2 &&
              sameColor(grid, r - 1, c, color) &&
              sameColor(grid, r - 2, c, color)))
        );
        grid[r][c] = makeTile(color);
      }
    }
  }

  // opts: { mask, ice: [{ r, c, hp }] }
  function createBoard(rows, cols, nColors, rng, opts) {
    rng = rng || Math.random;
    opts = opts || {};
    for (let tries = 0; tries < 300; tries++) {
      const grid = [];
      for (let r = 0; r < rows; r++) grid.push(new Array(cols).fill(null));
      (opts.ice || []).forEach(function (ic) {
        if (playable(opts.mask, ic.r, ic.c)) grid[ic.r][ic.c] = makeIce(ic.hp);
      });
      fillNoMatches(grid, nColors, rng, opts.mask);
      if (findRuns(grid).length === 0 && findPossibleMove(grid)) return grid;
    }
    throw new Error("无法生成棋盘");
  }

  // 洗牌：冰块原地不动，其余方块（含特殊糖）打乱，直到无现成匹配且有可行步
  function shuffle(grid, nColors, rng, mask) {
    rng = rng || Math.random;
    const cells = [],
      tiles = [];
    grid.forEach(function (row, r) {
      row.forEach(function (t, c) {
        if (movable(t)) {
          cells.push([r, c]);
          tiles.push(t);
        }
      });
    });
    for (let tries = 0; tries < 300; tries++) {
      for (let i = tiles.length - 1; i > 0; i--) {
        const j = randInt(rng, i + 1);
        const tmp = tiles[i];
        tiles[i] = tiles[j];
        tiles[j] = tmp;
      }
      cells.forEach(function (p, i) {
        grid[p[0]][p[1]] = tiles[i];
      });
      if (findRuns(grid).length === 0 && findPossibleMove(grid)) return;
    }
    // 实在洗不出来就重新上色普通块
    for (let tries = 0; tries < 50; tries++) {
      fillNoMatches(grid, nColors, rng, mask);
      if (findPossibleMove(grid)) return;
    }
  }

  function countIce(grid) {
    let n = 0;
    grid.forEach(function (row) {
      row.forEach(function (t) {
        if (t && t.ice) n++;
      });
    });
    return n;
  }

  function countJelly(jelly) {
    if (!jelly) return 0;
    let n = 0;
    jelly.forEach(function (row) {
      row.forEach(function (v) {
        n += v;
      });
    });
    return n;
  }

  const api = {
    makeTile: makeTile,
    makeIce: makeIce,
    key: key,
    inBounds: inBounds,
    mulberry32: mulberry32,
    findRuns: findRuns,
    groupRuns: groupRuns,
    planMatches: planMatches,
    specialArea: specialArea,
    expandSpecials: expandSpecials,
    activateSwap: activateSwap,
    applyClear: applyClear,
    resolveStep: resolveStep,
    stepScore: stepScore,
    applyGravity: applyGravity,
    refill: refill,
    hasMatchAt: hasMatchAt,
    swapCells: swapCells,
    canSwap: canSwap,
    findAllMoves: findAllMoves,
    findPossibleMove: findPossibleMove,
    createBoard: createBoard,
    shuffle: shuffle,
    mostCommonColor: mostCommonColor,
    countIce: countIce,
    countJelly: countJelly,
  };
  root.M3 = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
