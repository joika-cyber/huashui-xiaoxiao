# 划水消消

一个原创的网页三消小游戏，纯 HTML/CSS/JavaScript，不依赖任何第三方库。Windows、Mac、iPhone、iPad 都能玩。

- 100 关，分 5 章：糖果草地、果冻湖畔、冰雪山谷、迷宫花园、星空城堡
- 障碍玩法：果冻（在上面消除清掉）、冰块（不能移动，在旁边消除敲碎）、异形棋盘（缺口与空洞）
- 特殊糖：四连生成条纹糖，L/T 形生成炸弹糖，五连生成彩虹糖；两个特殊糖交换会触发组合效果
- 合成音效（无需音频文件），进度自动保存在本机浏览器里

**在线游玩：<https://joika-cyber.github.io/huashui-xiaoxiao/>**（手机、电脑浏览器都能打开）

## 分享给别的电脑（最简单）

```bash
python3 tools/build_single.py
```

会生成 `dist/划水消消.html` 这一个文件，大小约 100 KB。用微信、QQ、U 盘或邮件发到另一台电脑，**双击即可在浏览器里玩**，不用安装，也不用联网。

注意：游戏进度保存在各自电脑的浏览器里，换电脑后会从第 1 关开始。

## 在 iPhone / iPad 上玩

iOS 不能直接打开 HTML 附件来玩，需要通过网址访问：

1. **同一 Wi-Fi 下临时玩**：在 Mac 上进入本目录运行 `python3 -m http.server 8000`，iPhone 的 Safari 打开 `http://<Mac 的局域网 IP>:8000`，再点“分享 → 添加到主屏幕”。这种方式需要 Mac 开着，且不能离线。
2. **长期离线玩（推荐）**：把整个目录发布到 GitHub Pages 等 https 网站，在 Safari 打开后添加到主屏幕。首次打开后会缓存全部文件，之后断网也能玩。

## 本地开发

```bash
python3 -m http.server 8765     # 浏览器打开 http://localhost:8765
node --test tests/logic.test.js # 核心逻辑测试
node tests/simulate.js          # 机器人模拟每关过关率
node tools/calibrate.js         # 按目标过关率重新计算每关步数（改关卡布局后运行）
python3 tools/make_icons.py     # 重新生成图标
```

修改游戏文件后，需要把 `sw.js` 里的 `CACHE` 版本号加 1，已安装的设备才会更新。

## 目录

| 路径 | 说明 |
| --- | --- |
| `js/logic.js` | 三消核心规则（匹配、特殊糖、下落、洗牌），可在 Node 中测试 |
| `js/levels.js` | 100 关的布局、目标和步数 |
| `js/render.js` | 方块造型绘制 |
| `js/audio.js` | WebAudio 合成音效 |
| `js/game.js` | 界面、动画、触控、关卡、存档 |
| `sw.js` / `manifest.webmanifest` | PWA 离线缓存与安装配置 |
| `tools/` | 图标生成、单文件打包脚本 |
