/*
 * 关卡配置：100 关，分 5 章，每章 20 关。
 * 布局由关卡号作为随机种子生成，每次进入同一关布局都一样。
 * 难度参数经 tests/simulate.js 的模拟对局校准。
 */
(function (root) {
  "use strict";

  const M3 =
    root.M3 || (typeof require !== "undefined" ? require("./logic.js") : null);
  const ROWS = 8,
    COLS = 8,
    TOTAL = 100;

  const CHAPTERS = [
    {
      name: "糖果草地",
      desc: "熟悉基本玩法",
      bg: ["#5b1f7a", "#2a1250", "#170a2e"],
    },
    {
      name: "果冻湖畔",
      desc: "清除全部果冻",
      bg: ["#8a1f5c", "#40102f", "#1c0718"],
    },
    {
      name: "冰雪山谷",
      desc: "敲碎全部冰块",
      bg: ["#1f5590", "#122c55", "#08142c"],
    },
    {
      name: "迷宫花园",
      desc: "形状各异的棋盘",
      bg: ["#1f7a5e", "#0f3d33", "#06201a"],
    },
    {
      name: "星空城堡",
      desc: "所有挑战大集合",
      bg: ["#3b2a8f", "#1b1257", "#0a0722"],
    },
  ];

  // 异形棋盘（x = 可用格，. = 空洞）
  const SHAPES = {
    corners: [
      "..xxxx..",
      ".xxxxxx.",
      "xxxxxxxx",
      "xxxxxxxx",
      "xxxxxxxx",
      "xxxxxxxx",
      ".xxxxxx.",
      "..xxxx..",
    ],
    hole: [
      "xxxxxxxx",
      "xxxxxxxx",
      "xxxxxxxx",
      "xxx..xxx",
      "xxx..xxx",
      "xxxxxxxx",
      "xxxxxxxx",
      "xxxxxxxx",
    ],
    hourglass: [
      "xxxxxxxx",
      "xxxxxxxx",
      ".xxxxxx.",
      "..xxxx..",
      "..xxxx..",
      ".xxxxxx.",
      "xxxxxxxx",
      "xxxxxxxx",
    ],
    notch: ["xxxxxxxx", "xxxxxxxx", "xxxxxxxx", ".xxxxxx.", ".xxxxxx.", "xxxxxxxx", "xxxxxxxx", "xxxxxxxx"],
    cross: [
      "..xxxx..",
      "..xxxx..",
      "xxxxxxxx",
      "xxxxxxxx",
      "xxxxxxxx",
      "xxxxxxxx",
      "..xxxx..",
      "..xxxx..",
    ],
    heart: [
      ".xx..xx.",
      "xxxxxxxx",
      "xxxxxxxx",
      "xxxxxxxx",
      "xxxxxxxx",
      ".xxxxxx.",
      "..xxxx..",
      "...xx...",
    ],
    steps: [
      "xxxxx...",
      "xxxxxx..",
      "xxxxxxx.",
      "xxxxxxxx",
      "xxxxxxxx",
      ".xxxxxxx",
      "..xxxxxx",
      "...xxxxx",
    ],
    window: [
      "xxxxxxxx",
      "x.xxxx.x",
      "xxxxxxxx",
      "xxx..xxx",
      "xxx..xxx",
      "xxxxxxxx",
      "x.xxxx.x",
      "xxxxxxxx",
    ],
  };
  const SHAPE_ORDER = [
    "corners",
    "hole",
    "hourglass",
    "notch",
    "cross",
    "steps",
    "window",
    "heart",
  ];

  function parseShape(name) {
    return SHAPES[name].map(function (row) {
      return row.split("").map(function (ch) {
        return ch === "x";
      });
    });
  }

  function fullMask() {
    const m = [];
    for (let r = 0; r < ROWS; r++) m.push(new Array(COLS).fill(true));
    return m;
  }

  function cellOn(mask, r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS && mask[r][c];
  }
  // 棋盘拐角格（横向和纵向都处在边缘）很难凑出匹配，不放果冻
  function isCorner(mask, r, c) {
    const hEdge = !cellOn(mask, r, c - 1) || !cellOn(mask, r, c + 1);
    const vEdge = !cellOn(mask, r - 1, c) || !cellOn(mask, r + 1, c);
    return hEdge && vEdge;
  }

  // 果冻图案：返回每格层数
  function jellyPattern(kind, mask, rng, layers) {
    const j = [];
    for (let r = 0; r < ROWS; r++) {
      j.push([]);
      for (let c = 0; c < COLS; c++) {
        let v = 0;
        if (kind === "center") v = r >= 2 && r <= 5 && c >= 2 && c <= 5 ? 1 : 0;
        else if (kind === "bottom") v = r >= 5 ? 1 : 0;
        else if (kind === "ring")
          v = ((r === 1 || r === 6) && c >= 1 && c <= 6) || ((c === 1 || c === 6) && r >= 1 && r <= 6) ? 1 : 0;
        else if (kind === "cross")
          v = r === 3 || r === 4 || c === 3 || c === 4 ? 1 : 0;
        else if (kind === "diagonal") v = r === c || r + c === 7 ? 1 : 0;
        else if (kind === "stripes") v = r % 2 === 1 ? 1 : 0;
        else if (kind === "random") v = rng() < 0.4 ? 1 : 0;
        else if (kind === "full") v = 1;
        if (v && layers === 2) v = r >= 2 && r <= 5 && c >= 2 && c <= 5 ? 2 : 1;
        if (!mask[r][c] || isCorner(mask, r, c)) v = 0;
        j[r].push(v);
      }
    }
    return j;
  }
  const JELLY_KINDS = [
    "center",
    "bottom",
    "cross",
    "ring",
    "diagonal",
    "stripes",
    "random",
    "full",
  ];

  function placeIce(count, hp2Ratio, mask, jelly, rng) {
    const cells = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (mask[r][c] && !(jelly && jelly[r][c] > 0)) cells.push([r, c]);
    // 打乱后取前 count 个
    for (let i = cells.length - 1; i > 0; i--) {
      const k = Math.floor(rng() * (i + 1));
      const tmp = cells[i];
      cells[i] = cells[k];
      cells[k] = tmp;
    }
    return cells.slice(0, Math.min(count, cells.length)).map(function (p) {
      return { r: p[0], c: p[1], hp: rng() < hp2Ratio ? 2 : 1 };
    });
  }

  function cellCount(mask) {
    let n = 0;
    mask.forEach(function (row) {
      row.forEach(function (v) {
        if (v) n++;
      });
    });
    return n;
  }

  function sumJelly(j) {
    let n = 0;
    if (j)
      j.forEach(function (row) {
        row.forEach(function (v) {
          n += v;
        });
      });
    return n;
  }

  // 难度系数：章内 0 → 1，用于在章节内逐步加难
  function levelConfig(n, movesOverride) {
    n = Math.max(1, Math.min(TOTAL, n));
    const chapter = Math.ceil(n / 20); // 1..5
    const inCh = (n - 1) % 20; // 0..19
    const rng = M3.mulberry32(n * 9973 + 7);
    const t = inCh / 19;

    let colors = n <= 4 || inCh === 0 ? 5 : 6;
    let mask = fullMask();
    let shape = null;
    let jelly = null;
    let ice = [];
    const goals = [];
    let intro = null;

    // ---- 布局 ----
    if (chapter === 4 || (chapter === 5 && n % 2 === 0) || n === TOTAL) {
      shape =
        n === TOTAL
          ? "heart"
          : SHAPE_ORDER[(n * 3 + chapter) % SHAPE_ORDER.length];
      mask = parseShape(shape);
    }

    const wantJelly =
      (chapter === 1 && n >= 16) ||
      chapter === 2 ||
      (chapter === 3 && n % 3 === 0) ||
      (chapter === 4 && n % 2 === 1) ||
      (chapter === 5 && n % 3 !== 1);
    const wantIce =
      chapter === 3 ||
      (chapter === 4 && n % 3 === 1) ||
      (chapter === 5 && n % 3 !== 2);

    if (wantJelly) {
      let kind;
      if (chapter === 1)
        kind = ["center", "bottom", "cross", "center", "diagonal"][n - 16];
      else kind = JELLY_KINDS[(n * 5) % JELLY_KINDS.length];
      const layers =
        (chapter === 2 && inCh >= 10) || chapter >= 4
          ? rng() < 0.5
            ? 2
            : 1
          : 1;
      jelly = jellyPattern(kind, mask, rng, layers);
      if (sumJelly(jelly) === 0) jelly = jellyPattern("center", mask, rng, 1);
    }
    if (wantIce) {
      const base =
        chapter === 3
          ? 5 + Math.round(t * 9)
          : 5 + Math.round(t * 6) + (chapter === 5 ? 3 : 0);
      const hp2 = chapter === 3 ? (inCh >= 10 ? 0.5 : 0) : 0.5;
      ice = placeIce(base, hp2, mask, jelly, rng);
    }

    // 普通关：收集颜色
    if (!jelly && !ice.length && n >= 3) {
      const tmpMoves = 26;
      goals.push({
        color: (n * 2) % colors,
        count: Math.round(tmpMoves * (0.5 + Math.min(n, 30) * 0.012)),
      });
      if (n >= 10)
        goals.push({
          color: (n * 2 + 3) % colors,
          count: Math.round(tmpMoves * (0.35 + Math.min(n, 30) * 0.01)),
        });
    }

    // ---- 步数 ----
    const cells = cellCount(mask);
    const jellyN = sumJelly(jelly);
    const iceHp = ice.reduce(function (s, x) {
      return s + x.hp;
    }, 0);
    let moves;
    if (jelly || ice.length) {
      moves = 12 + jellyN * TUNE.jelly + iceHp * TUNE.ice;
      moves *= 1 + ((64 - cells) / 64) * TUNE.shape; // 小棋盘更难消
      moves *= 1 - TUNE.hardness[chapter - 1] * t; // 章内越往后越紧
      if (colors === 5) moves *= 0.9;
      moves = Math.round(Math.max(14, Math.min(40, moves)));
    } else {
      moves = Math.max(18, 26 - Math.floor((n - 1) / 3));
      if (shape) moves += 3;
    }
    if (goals.length) {
      // 收集目标按实际步数缩放
      goals.forEach(function (g) {
        g.count = Math.max(8, Math.round((g.count * moves) / 26));
      });
    }
    // 用模拟校准过的步数覆盖估算值（见 tools/calibrate.js）
    if (movesOverride) moves = movesOverride;
    else if (CALIBRATED[n - 1]) moves = CALIBRATED[n - 1];

    // ---- 目标分 ----
    const obstacle = !!(jelly || ice.length);
    const perMove = obstacle
      ? 40 + chapter * 4
      : (colors === 5 ? 70 : 55) + Math.min(n, 40) * 2;
    const target = Math.round((moves * perMove * (cells / 64)) / 50) * 50;

    // ---- 新玩法提示 ----
    if (n === 16)
      intro =
        "新玩法：果冻！\n粉色的果冻铺在格子底下，在它上面消除就能清掉。\n清除全部果冻才能过关。";
    else if (n === 41)
      intro =
        "新玩法：冰块！\n冰块不能移动，在它旁边消除就能敲裂它，\n双层冰块要敲两次。敲碎全部冰块才能过关。";
    else if (n === 61)
      intro =
        "新玩法：异形棋盘！\n棋盘有了缺口和空洞，方块会从空洞上方直接落下。";
    else if (n === 81) intro = "最终章：所有挑战大集合！";
    else if (n === TOTAL) intro = "最后一关：爱心棋盘。\n王羊奶，冲鸭！";

    return {
      n: n,
      chapter: chapter,
      colors: colors,
      moves: moves,
      target: target,
      goals: goals,
      mask: shape ? mask : null,
      shape: shape,
      jelly: jelly,
      ice: ice,
      intro: intro,
    };
  }

  // 每关步数，由 tools/calibrate.js 自动生成，请勿手改
  // prettier-ignore
  const CALIBRATED = /*CALIBRATED-START*/[20,20,20,20,20,16,17,16,16,16,16,17,17,15,16,15,36,29,15,21,22,38,27,17,43,29,47,24,44,38,25,20,39,25,44,23,35,35,22,15,15,33,15,15,40,15,15,18,16,17,45,31,24,34,31,36,43,26,25,23,23,30,35,17,23,20,44,20,38,32,28,21,26,20,37,15,31,26,35,19,25,22,44,32,29,23,23,28,33,32,22,18,36,21,18,30,15,20,39,21]/*CALIBRATED-END*/

  // 估算步数用的参数（校准前的初始值）
  const TUNE = {
    jelly: 0.5, // 每层果冻给多少步
    ice: 1.0, // 每点冰块耐久给多少步
    shape: 0.6, // 空洞带来的额外步数比例
    hardness: [0.1, 0.15, 0.15, 0.2, 0.2], // 各章章末收紧比例
  };

  const api = {
    TOTAL: TOTAL,
    ROWS: ROWS,
    COLS: COLS,
    CHAPTERS: CHAPTERS,
    TUNE: TUNE,
    levelConfig: levelConfig,
  };
  root.Levels = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
