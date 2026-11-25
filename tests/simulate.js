// 用一个"贪心"机器人把每关模拟玩若干次，统计过关率，用来校准关卡难度
// 运行：node tests/simulate.js [每关局数=20] [起始关=1] [结束关=100]
const M3 = require("../js/logic.js");
const Levels = require("../js/levels.js");

const GAMES = parseInt(process.argv[2] || "20", 10);
const FROM = parseInt(process.argv[3] || "1", 10);
const TO = parseInt(process.argv[4] || "100", 10);

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// 估算一步的价值（只看第一轮消除，不模拟连锁）
function evalMove(state, a, b, wantColors) {
  const g = state.grid;
  const ta = g[a.r][a.c],
    tb = g[b.r][b.c];
  if (
    ta.special === "rainbow" ||
    tb.special === "rainbow" ||
    (ta.special && tb.special)
  )
    return 25;
  M3.swapCells(g, a, b);
  const groups = M3.groupRuns(M3.findRuns(g));
  let v = 0;
  groups.forEach(function (gr) {
    if (gr.cells.size >= 4) v += 5;
    gr.cells.forEach(function (p) {
      const t = g[p[0]][p[1]];
      v += 1;
      if (wantColors.has(t.color)) v += 1.5;
      if (t.special) v += 5;
      if (state.jelly && state.jelly[p[0]][p[1]]) v += 10;
      DIRS.forEach(function (d) {
        const r = p[0] + d[0],
          c = p[1] + d[1];
        if (M3.inBounds(g, r, c) && g[r][c] && g[r][c].ice) v += 8;
      });
    });
  });
  M3.swapCells(g, a, b);
  return v + Math.random() * 0.5;
}

function playLevel(cfg) {
  const state = {
    grid: M3.createBoard(8, 8, cfg.colors, Math.random, {
      mask: cfg.mask,
      ice: cfg.ice,
    }),
    mask: cfg.mask,
    jelly: cfg.jelly ? cfg.jelly.map((r) => r.slice()) : null,
  };
  const collected = [];
  const wantColors = new Set(cfg.goals.map((g) => g.color));
  let score = 0;

  function done() {
    if (score < cfg.target) return false;
    if (state.jelly && M3.countJelly(state.jelly) > 0) return false;
    if (M3.countIce(state.grid) > 0) return false;
    return cfg.goals.every((g) => (collected[g.color] || 0) >= g.count);
  }

  for (let m = 0; m < cfg.moves; m++) {
    const all = M3.findAllMoves(state.grid);
    if (!all.length) {
      M3.shuffle(state.grid, cfg.colors, Math.random, state.mask);
      m--;
      continue;
    }
    let best = all[0],
      bestV = -1;
    all.forEach(function (mv) {
      const v = evalMove(state, mv[0], mv[1], wantColors);
      if (v > bestV) {
        bestV = v;
        best = mv;
      }
    });
    const a = best[0],
      b = best[1];
    M3.swapCells(state.grid, a, b);
    let pending = M3.activateSwap(state.grid, a, b);
    let pref = [b, a],
      combo = 0;
    while (true) {
      const step = M3.resolveStep(state, pending, pref);
      pending = null;
      pref = null;
      if (!step) break;
      combo++;
      score += M3.stepScore(step, combo);
      step.removed.forEach(function (x) {
        if (x.tile.color >= 0)
          collected[x.tile.color] = (collected[x.tile.color] || 0) + 1;
      });
      M3.applyGravity(state.grid, state.mask);
      M3.refill(state.grid, cfg.colors, Math.random, state.mask);
    }
    if (done()) return { win: true, left: cfg.moves - m - 1 };
  }
  return { win: false, left: 0 };
}

module.exports = { playLevel: playLevel };

if (require.main === module) {
const rows = [];
for (let n = FROM; n <= TO; n++) {
  const cfg = Levels.levelConfig(n);
  let wins = 0,
    left = 0;
  for (let i = 0; i < GAMES; i++) {
    const r = playLevel(cfg);
    if (r.win) {
      wins++;
      left += r.left;
    }
  }
  const tags = [];
  if (cfg.jelly) tags.push("果冻" + M3.countJelly(cfg.jelly));
  if (cfg.ice.length) tags.push("冰" + cfg.ice.reduce((s, x) => s + x.hp, 0));
  if (cfg.shape) tags.push(cfg.shape);
  if (cfg.goals.length) tags.push("收集");
  rows.push({ n, wins: wins / GAMES });
  console.log(
    `第${String(n).padStart(3)}关  ${cfg.moves}步  过关率 ${String(Math.round((wins / GAMES) * 100)).padStart(3)}%  ` +
      `平均剩余 ${wins ? (left / wins).toFixed(1) : "-"}  ${tags.join(" ")}`,
  );
}
for (let ch = 1; ch <= 5; ch++) {
  const r = rows.filter((x) => Math.ceil(x.n / 20) === ch);
  if (!r.length) continue;
  const avg = r.reduce((s, x) => s + x.wins, 0) / r.length;
  console.log(`第${ch}章 平均过关率 ${Math.round(avg * 100)}%`);
}
}
