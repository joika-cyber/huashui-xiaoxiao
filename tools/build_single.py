"""把整个游戏打包成一个独立的 HTML 文件，方便拷到别的电脑双击就玩。
运行：python3 tools/build_single.py
输出：dist/划水消消.html
"""
import base64
import os
import re

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
OUT_DIR = os.path.join(ROOT, "dist")
OUT_FILE = os.path.join(OUT_DIR, "划水消消.html")


def read(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def data_uri(rel):
    with open(os.path.join(ROOT, rel), "rb") as f:
        return "data:image/png;base64," + base64.b64encode(f.read()).decode("ascii")


def main():
    html = read("index.html")

    # 内联样式表
    def inline_css(m):
        return "<style>\n" + read(m.group(1)) + "\n</style>"
    html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', inline_css, html)

    # 内联脚本
    def inline_js(m):
        code = read(m.group(1))
        if "</script" in code:
            raise SystemExit(m.group(1) + " 中含有 </script，无法内联")
        return "<script>\n" + code + "\n</script>"
    html = re.sub(r'<script src="([^"]+)"></script>', inline_js, html)

    # 图标转成内嵌数据；单文件模式下 manifest 用不上，去掉
    html = html.replace('href="icons/apple-touch-icon.png"', 'href="' + data_uri("icons/apple-touch-icon.png") + '"')
    html = html.replace('href="icons/icon-192.png"', 'href="' + data_uri("icons/icon-192.png") + '"')
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write(html)
    print("已生成", OUT_FILE, "（%.0f KB）" % (os.path.getsize(OUT_FILE) / 1024))


if __name__ == "__main__":
    main()
