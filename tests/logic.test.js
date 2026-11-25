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
