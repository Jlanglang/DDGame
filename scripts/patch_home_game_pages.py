# -*- coding: utf-8 -*-
from pathlib import Path

d = "d" + "iv"
p = Path(__file__).resolve().parent.parent / "index.html"
text = p.read_text(encoding="utf-8")

idx_app = text.find(f'  <{d} id="app"')
idx_menu = text.find(f'  <{d} id="menu-modal"')
idx_level = text.find(f'  <{d} id="level-picker"')
if idx_app < 0 or idx_level < 0:
    raise SystemExit("markers not found")

# drop menu-modal block
if idx_menu >= 0 and idx_menu < idx_level:
    text_before = text[:idx_app]
    text_after = text[idx_level:]
else:
    idx_end_app = text.find(f'  </{d}>\n\n  <{d} id="level-picker"')
    text_before = text[:idx_app]
    text_after = text[idx_level:]

lines = []
lines.append(f'  <{d} id="app" class="app-shell">')
lines.append(f'    <section id="home-page" class="page page--home" aria-label="首页">')
lines.append(f'      <header class="home-header">')
lines.append('        <h1 class="home-title"><span class="home-title-icon" aria-hidden="true">🫘</span>豆豆大挑战</h1>')
lines.append('        <button id="btn-sound" type="button" class="btn-sound" aria-label="音效开关" title="音效">🔊</button>')
lines.append("      </header>")
lines.append(f'      <{d} id="home-menu" class="home-menu">')
lines.append('        <p id="home-hint" class="home-hint">选关或快速开始 · 每局随机表情包</p>')
lines.append(f'        <{d} class="mode-select" role="group" aria-label="游戏模式">')
lines.append('          <p class="mode-select-title">游戏模式</p>')
lines.append(f'          <{d} id="mode-list" class="mode-list"></{d}>')
lines.append(f"        </{d}>")
lines.append(f'        <{d} id="daily-card" class="daily-card hidden"></{d}>')
lines.append(f'        <{d} class="home-actions">')
lines.append('          <button type="button" id="btn-quick-start" class="home-btn home-btn--primary">快速开始</button>')
lines.append('          <button type="button" id="btn-pick-level" class="home-btn">选关</button>')
lines.append(f"        </{d}>")
lines.append(f'        <{d} class="home-toolbar">')
lines.append('          <button type="button" id="btn-achievements" class="toolbar-btn">成就</button>')
lines.append('          <button type="button" id="btn-gallery" class="toolbar-btn">图鉴</button>')
lines.append(f"        </{d}>")
lines.append(f"      </{d}>")
lines.append('      <section id="sub-panel" class="sub-panel hidden" aria-hidden="true">')
lines.append(f'        <{d} class="sub-panel-head">')
lines.append('          <h2 id="sub-panel-title"></h2>')
lines.append('          <button type="button" id="btn-sub-back" class="toolbar-btn">返回</button>')
lines.append(f"        </{d}>")
lines.append(f'        <{d} id="sub-panel-body" class="sub-panel-body"></{d}>')
lines.append("      </section>")
lines.append('      <p id="error-msg" class="error-msg hidden"></p>')
lines.append("    </section>")
lines.append("")
lines.append(f'    <section id="game-page" class="page page--game hidden" aria-label="游戏" aria-hidden="true">')
lines.append('      <header class="header game-header">')
lines.append(f'        <{d} id="combo-hud" class="combo-hud hidden">连击 x0</{d}>')
lines.append(f'        <{d} class="stats">')
lines.append('          <span id="level-label">第 1 关</span>')
lines.append('          <span id="moves-label">步数: 0</span>')
lines.append('          <span id="timer-label">时间: 0s</span>')
lines.append(f"        </{d}>")
lines.append(f'        <{d} class="header-actions">')
lines.append('          <button id="btn-hint" type="button" class="btn-hint hidden" title="提示">💡<span id="hint-count"></span></button>')
lines.append('          <button id="btn-sound-game" type="button" class="btn-sound" aria-label="音效开关" title="音效">🔊</button>')
lines.append('          <button id="btn-menu" type="button" class="btn-menu">选关</button>')
lines.append('          <button id="btn-home" type="button" class="btn-home">首页</button>')
lines.append(f"        </{d}>")
lines.append("      </header>")
lines.append(f'      <{d} id="board-viewport" class="board-viewport">')
lines.append(f'        <{d} id="board-scaler" class="board-scaler">')
lines.append('          <main id="board" class="board" aria-label="游戏棋盘"></main>')
lines.append(f"        </{d}>")
lines.append(f"      </{d}>")
lines.append("    </section>")
lines.append(f"  </{d}>")
lines.append("")

new_block = "\n".join(lines)
# fix accidental motion in lines - the script uses d=div correctly now
new_block = new_block.replace("<motion", "<div").replace("</motion>", "</div>")

text = text[:idx_app] + new_block + text[idx_level:]
p.write_text(text, encoding="utf-8")
print("ok")
