// 运行：node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const M3 = require("../js/logic.js");

// 用字符串画棋盘：数字为颜色，R/C/B 后缀为特殊块，* 为彩虹球
function board(lines) {
  return lines.map(function (line) {
    return line
      .trim()
      .split(/\s+/)
      .map(function (s) {
        if (s === ".") return null;
        if (s === "*") return M3.makeTile(-1, "rainbow");
        const color = parseInt(s, 10);
        const suf = s.replace(/\d+/, "");
        const special = { R: "row", C: "col", B: "bomb" }[suf] || null;
        return M3.makeTile(color, special);
      });
  });
}

test("识别横向和纵向三连", function () {
  const g = board(["0 0 0 1", "2 3 1 4", "2 3 4 1", "2 1 3 4"]);
  const runs = M3.findRuns(g);
  assert.strictEqual(runs.length, 2);
  assert.deepStrictEqual(runs.map((r) => r.dir).sort(), ["h", "v"]);
});

test("四连生成直线特殊块，位置优先在交换格", function () {
  const g = board(["0 0 0 0 1", "2 3 1 4 2"]);
  const plan = M3.planMatches(g, M3.groupRuns(M3.findRuns(g)), [
    { r: 0, c: 1 },
  ]);
  assert.strictEqual(plan.clear.size, 4);
  assert.deepStrictEqual(plan.creates, [
    { r: 0, c: 1, color: 0, special: "row" },
  ]);
});

test("五连生成彩虹球，L 形生成炸弹", function () {
  const g1 = board(["1 1 1 1 1"]);
  const p1 = M3.planMatches(g1, M3.groupRuns(M3.findRuns(g1)));
  assert.strictEqual(p1.creates[0].special, "rainbow");

  const g2 = board(["2 0 0 0", "2 3 4 5", "2 4 5 3"]);
  // 第 0 列竖三 + 第 0 行横三（0 0 0）不共享格，不应合并
  assert.strictEqual(M3.groupRuns(M3.findRuns(g2)).length, 2);

  const g3 = board(["0 0 0", "0 3 4", "0 4 5"]);
  const p3 = M3.planMatches(g3, M3.groupRuns(M3.findRuns(g3)));
  assert.strictEqual(p3.creates.length, 1);
  assert.strictEqual(p3.creates[0].special, "bomb");
  assert.deepStrictEqual([p3.creates[0].r, p3.creates[0].c], [0, 0]);
});

test("被消除的直线特殊块会清整行并连锁炸弹", function () {
  const g = board(["0R 1 2B 3", "4  5 6  7", "8  9 1  2"]);
  const clear = new Map([["0,0", [0, 0]]]);
  const triggered = M3.expandSpecials(g, clear);
  assert.strictEqual(triggered.length, 2);
  // 整行 + 炸弹 3x3 范围（第 0、1 行的 1..3 列）
  assert.ok(clear.has("0,3"));
  assert.ok(clear.has("1,3"));
  assert.ok(!clear.has("2,0"));
});

test("彩虹球交换清除同色", function () {
  const g = board(["* 1 2", "1 3 1", "4 1 5"]);
  const res = M3.activateSwap(g, { r: 0, c: 0 }, { r: 0, c: 1 });
  assert.ok(res);
  // 4 个颜色 1 + 彩虹球本身
  assert.strictEqual(res.clear.size, 5);
  // 已被消耗的彩虹球不能再被连锁触发
  assert.strictEqual(M3.expandSpecials(g, res.clear).length, 0);
});

test("重力与补充后棋盘填满", function () {
  const g = board(["0 1", ". 2", "3 ."]);
  const moves = M3.applyGravity(g);
  // 第 0 列：0 下落 1 格；第 1 列：2、1 各下落 1 格
  assert.strictEqual(moves.length, 3);
  assert.strictEqual(g[0][0], null);
  assert.strictEqual(g[1][0].color, 0);
  assert.strictEqual(g[2][0].color, 3);
  assert.strictEqual(g[2][1].color, 2);
  const added = M3.refill(g, 5, Math.random);
  assert.strictEqual(added.length, 2);
  assert.ok(added.every((a) => a.fromR < 0));
  g.forEach((row) => row.forEach((t) => assert.ok(t)));
});

test("新棋盘无现成匹配且有可行步", function () {
  for (let i = 0; i < 50; i++) {
    const g = M3.createBoard(8, 8, 6);
    assert.strictEqual(M3.findRuns(g).length, 0);
    assert.ok(M3.findPossibleMove(g));
  }
});

test("洗牌后无现成匹配且有可行步", function () {
  const g = M3.createBoard(8, 8, 6);
  M3.shuffle(g, 6);
  assert.strictEqual(M3.findRuns(g).length, 0);
  assert.ok(M3.findPossibleMove(g));
});

// ---------------- 障碍与异形棋盘 ----------------

test("冰块：相邻消除敲一下，耐久归零才碎；不能交换、不参与匹配", function () {
  const g = board(["0 0 0", "4 5 1"]);
  g[1][1] = M3.makeIce(2);
  const state = { grid: g, mask: null, jelly: null };
  assert.strictEqual(M3.canSwap(g, { r: 1, c: 1 }, { r: 1, c: 2 }), false);
  const step = M3.resolveStep(state, null, null);
  assert.strictEqual(step.removed.length, 3);
  // 冰块与 3 个被消格相邻，但一步只扣 1 点
  assert.strictEqual(step.iceHits.length, 1);
  assert.strictEqual(g[1][1].ice, 1);
  assert.strictEqual(M3.countIce(g), 1);
});

test("冰块被特殊糖直接波及会碎，碎后削减下方果冻", function () {
  const g = board(["0R 1 2"]);
  g[0][2] = M3.makeIce(1);
  const jelly = [[0, 0, 1]];
  const state = { grid: g, mask: null, jelly: jelly };
  const step = M3.resolveStep(state, { clear: new Map([["0,0", [0, 0]]]), triggered: [] }, null);
  assert.ok(step.iceHits.some((h) => h.destroyed));
  assert.strictEqual(M3.countIce(g), 0);
  assert.strictEqual(M3.countJelly(jelly), 0);
});

test("果冻：消除其上方块时减一层", function () {
  const g = board(["0 0 0", "1 2 3"]);
  const jelly = [
    [2, 1, 0],
    [0, 0, 0],
  ];
  const step = M3.resolveStep({ grid: g, mask: null, jelly: jelly }, null, null);
  assert.strictEqual(step.jellyHits.length, 2);
  assert.deepStrictEqual(jelly[0], [1, 0, 0]);
});

test("空洞：下落跨过空洞，补充不会填进空洞", function () {
  const mask = [[true], [false], [true]];
  const g = [[M3.makeTile(0)], [null], [null]];
  const moves = M3.applyGravity(g, mask);
  assert.strictEqual(moves.length, 1);
  assert.strictEqual(moves[0].toR, 2);
  const added = M3.refill(g, 5, Math.random, mask);
  assert.strictEqual(added.length, 1);
  assert.strictEqual(g[1][0], null);
  assert.ok(g[0][0] && g[2][0]);
});

test("异形棋盘 + 冰块的新棋盘可玩，洗牌时冰块不动", function () {
  const mask = [];
  for (let r = 0; r < 8; r++) mask.push([...Array(8)].map((_, c) => !(r >= 3 && r <= 4 && c >= 3 && c <= 4)));
  const ice = [{ r: 0, c: 0, hp: 2 }, { r: 7, c: 7, hp: 1 }];
  for (let i = 0; i < 30; i++) {
    const g = M3.createBoard(8, 8, 6, Math.random, { mask: mask, ice: ice });
    assert.strictEqual(g[3][3], null);
    assert.strictEqual(M3.countIce(g), 2);
    assert.strictEqual(M3.findRuns(g).length, 0);
    assert.ok(M3.findPossibleMove(g));
    const iceTile = g[0][0];
    M3.shuffle(g, 6, Math.random, mask);
    assert.strictEqual(g[0][0], iceTile);
    assert.strictEqual(g[4][4], null);
  }
});
