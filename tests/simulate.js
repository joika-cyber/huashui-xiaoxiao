// 粗略估算：随机挑可行步，每关大约能拿多少分，用来校准关卡目标分
// 运行：node tests/simulate.js
const M3 = require("../js/logic.js");

function playOnce(nColors, moves) {
  const g = M3.createBoard(8, 8, nColors);
  let score = 0;
  for (let m = 0; m < moves; m++) {
    const mv = M3.findPossibleMove(g);
    if (!mv) {
      M3.shuffle(g, nColors);
      m--;
      continue;
    }
    M3.swapCells(g, mv[0], mv[1]);
    let pending = M3.activateSwap(g, mv[0], mv[1]);
    let combo = 0,
      pref = [mv[1], mv[0]];
    while (true) {
      let clear,
        creates = [];
      if (pending) {
        clear = pending.clear;
        pending = null;
      } else {
        const groups = M3.groupRuns(M3.findRuns(g));
        if (!groups.length) break;
        const plan = M3.planMatches(g, groups, pref);
        clear = plan.clear;
        creates = plan.creates;
      }
      pref = null;
      M3.expandSpecials(g, clear);
      combo++;
      score += clear.size * 20 * combo;
      clear.forEach((p) => {
        g[p[0]][p[1]] = null;
      });
      creates.forEach((cr) => {
        g[cr.r][cr.c] = M3.makeTile(cr.color, cr.special);
        score += 100;
      });
      M3.applyGravity(g);
      M3.refill(g, nColors, Math.random);
    }
    if (!M3.findPossibleMove(g)) M3.shuffle(g, nColors);
  }
  return score;
}

for (const [colors, moves] of [
  [5, 25],
  [6, 25],
  [6, 20],
  [6, 16],
]) {
  const scores = [];
  for (let i = 0; i < 200; i++) scores.push(playOnce(colors, moves));
  scores.sort((a, b) => a - b);
  const pct = (p) => scores[Math.floor(p * (scores.length - 1))];
  console.log(
    `${colors}色 ${moves}步  P10=${pct(0.1)}  中位=${pct(0.5)}  P90=${pct(0.9)}`,
  );
}
