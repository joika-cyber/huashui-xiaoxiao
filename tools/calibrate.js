// 关卡难度校准：对每一关用二分法找出最少步数，使贪心机器人的过关率达到目标曲线，
// 结果写回 js/levels.js 的 CALIBRATED 表。
// 运行：node tools/calibrate.js [每次局数=80]
const fs = require("fs");
const path = require("path");
const M3 = require("../js/logic.js");
const Levels = require("../js/levels.js");
const { playLevel } = require("../tests/simulate.js");

const GAMES = parseInt(process.argv[2] || "80", 10);
const FILE = path.join(__dirname, "..", "js", "levels.js");

// 目标过关率（机器人）：每章开头宽松、章末收紧，越往后的章节整体越难
function targetRate(n) {
  const ch = Math.ceil(n / 20);
  const t = ((n - 1) % 20) / 19;
  if (n <= 2) return 0.97;
  return 0.88 - 0.06 * (ch - 1) - 0.25 * t;
}

function winRate(n, moves) {
  const cfg = Levels.levelConfig(n, moves);
  let w = 0;
  for (let i = 0; i < GAMES; i++) if (playLevel(cfg).win) w++;
  return w / GAMES;
}

const result = [];
for (let n = 1; n <= Levels.TOTAL; n++) {
  const goal = targetRate(n);
  let lo = 10,
    hi = 45;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (winRate(n, mid) >= goal) hi = mid;
    else lo = mid + 1;
  }
  lo = Math.max(lo + 2, n <= 5 ? 20 : 15); // 给真人留一点余量
  result.push(lo);
  const cfg = Levels.levelConfig(n, lo);
  console.log(
    `第${n}关 → ${lo} 步（目标过关率 ${Math.round(goal * 100)}%，目标分 ${cfg.target}）`,
  );
}

const src = fs.readFileSync(FILE, "utf8");
const out = src.replace(
  /\/\*CALIBRATED-START\*\/[\s\S]*?\/\*CALIBRATED-END\*\//,
  "/*CALIBRATED-START*/[" + result.join(",") + "]/*CALIBRATED-END*/",
);
fs.writeFileSync(FILE, out);
console.log("已写入", FILE);
void M3;
