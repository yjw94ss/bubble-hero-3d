#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 three.js / css / game.js 内联进单文件 HTML，并做基本自检。"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
OUT_DIR = os.path.join(ROOT, 'dist')
OUT = os.path.join(OUT_DIR, '泡泡小勇士.html')


def read(p):
    with open(p, 'r', encoding='utf-8') as f:
        return f.read()


def main():
    tpl = read(os.path.join(SRC, 'index.tmpl.html'))
    css = read(os.path.join(SRC, 'style.css'))
    three = read(os.path.join(ROOT, 'assets', 'three.min.js'))
    game = read(os.path.join(SRC, 'game.js'))

    for name, code in (('three', three), ('game', game), ('css', css)):
        assert '</script' not in code.lower(), f'{name} 含有非法闭合标签'

    html = tpl.replace('/*__CSS__*/', css)
    html = html.replace('/*__THREE__*/', three)
    html = html.replace('/*__GAME__*/', game)

    # 标签配对自检
    for tag in ('script', 'style', 'div'):
        opens = len(re.findall(r'<' + tag + r'[\s>]', html))
        closes = len(re.findall(r'</' + tag + r'>', html))
        assert opens == closes, f'<{tag}> 未配对: {opens} vs {closes}'

    # 抽 <script> 内容跑 node --check
    tmp = os.path.join(ROOT, '.check.js')
    with open(tmp, 'w', encoding='utf-8') as f:
        f.write(game)
    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    os.remove(tmp)
    if r.returncode != 0:
        print(r.stderr)
        sys.exit('JS 语法检查失败')
    print('JS 语法检查通过')

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(html)

    # GitHub Pages 用的入口文件（内容完全一致）
    index = os.path.join(ROOT, 'index.html')
    with open(index, 'w', encoding='utf-8') as f:
        f.write(html)

    size = os.path.getsize(OUT) / 1024.0
    print(f'生成: {OUT}  ({size:.0f} KB)')
    print(f'生成: {index}  (Pages 入口)')
    # 外链自检
    bad = re.findall(r'(?:src|href)="(https?://[^"]+)"', html)
    if bad:
        print('⚠ 发现外部链接:', bad[:5])
    else:
        print('无外部依赖（可离线双击打开）')


if __name__ == '__main__':
    main()
