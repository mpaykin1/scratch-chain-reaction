"""Idempotently migrate the cinematic page to testable CSS/ES modules."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / "cinematic"
PAGE = ROOT / "index.html"
source = PAGE.read_text(encoding="utf-8")
if '<link rel="stylesheet" href="./style.css">' in source:
    print("MODULAR_ALREADY_DONE")
    raise SystemExit(0)
match = re.search(r"<style>(.*?)</style>", source, re.S)
assert match, "Expected original inline CSS"
css = match.group(1)
css = css.replace("will-change:left,top,transform", "will-change:transform")
css = re.sub(r"box-shadow:0 0 0 300vmax #030b16c9,", "box-shadow:", css)
css += """
[hidden]{display:none!important}
.modal-backdrop{position:absolute;inset:0;z-index:49;background:#030b16c9}
.history{max-height:165px;overflow:auto;margin-top:15px;font-size:13px;color:#d7ebfd}
.history li{margin:4px 0}
#undo:disabled{opacity:.4;cursor:not-allowed}
@media(prefers-reduced-motion:reduce){
 .atmosphere,.genie,.rotor,.spark{animation:none!important}
 .world-object{transition:none}
}
"""
(ROOT / "style.css").write_text(css, encoding="utf-8")
source = source.replace(match.group(0), '<link rel="stylesheet" href="./style.css">', 1)
source = source.replace(
    '<div class="sheet" id="choiceBox"',
    '<div class="modal-backdrop" id="modalBackdrop" hidden></div>'
    '<div class="sheet" id="choiceBox"', 1)
source = source.replace(
    '<button class="send" id="restart" type="button">Начать заново</button>',
    '<button class="send" id="restart" type="button">Начать заново</button>'
    '<button class="send" id="undo" type="button" disabled>↶ Отменить ход</button>', 1)
source = source.replace(
    '<p id="fullscreenHint"',
    '<section class="history" aria-label="История изменений">'
    '<h3>История мира</h3><ol id="historyLog"></ol></section>'
    '<p id="fullscreenHint"', 1)
source, changed = re.subn(
    r"<script>.*?</script>", '<script type="module" src="./src/main.mjs"></script>',
    source, count=1, flags=re.S)
assert changed == 1 and source.count('id="undo"') == 1
PAGE.write_text(source, encoding="utf-8")
print("MODULARIZED_CINEMATIC")
