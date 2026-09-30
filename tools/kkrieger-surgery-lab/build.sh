#!/usr/bin/env bash
set -euo pipefail

UPSTREAM_ROOT="${1:-}"
if [[ -z "$UPSTREAM_ROOT" || ! -d "$UPSTREAM_ROOT/werkkzeug3_kkrieger/wasm" ]]; then
  echo "usage: $0 <kkrieger-wasm checkout>"
  exit 2
fi

EXPECTED_SHA="3bf0ff017372e640e966c2785a4d95a998cec242"
ACTUAL_SHA="$(git -C "$UPSTREAM_ROOT" rev-parse HEAD)"
[[ "$ACTUAL_SHA" == "$EXPECTED_SHA" ]] || { echo "unexpected upstream SHA $ACTUAL_SHA"; exit 3; }

ROOT="$UPSTREAM_ROOT/werkkzeug3_kkrieger"
WORK="$PWD/work/kkrieger-surgery-lab"
DIST="$WORK/dist"
PATCHED="$ROOT/wasm/build.surgery-lab.generated.sh"
rm -rf "$WORK"
mkdir -p "$WORK"

# Reuse the user-confirmed physical-iPhone portrait solution first, then add
# only the native operator surgery and mobile proof controls.
python3 tools/kkrieger-portrait-proof/patch-portrait-proof.py "$ROOT"
python3 tools/kkrieger-surgery-lab/patch-surgery-lab.py "$ROOT"

cp "$ROOT/wasm/build.sh" "$PATCHED"
python3 - "$PATCHED" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
s=p.read_text(encoding="utf-8")
needle='  -sENVIRONMENT=web\n'
if s.count(needle)<1: raise SystemExit("missing web flag")
s=s.replace(needle,needle+'  -sSINGLE_FILE=1\n',1)
for old,new in (
 ('--preload-file "$ROOT/data/kkrieger3383.kx@/kkrieger.kx"','--embed-file "$ROOT/data/kkrieger3383.kx@/kkrieger.kx"'),
 ('--preload-file "$ROOT/data/kkrieger_beta_conv.kx@/kkrieger_beta.kx"','--embed-file "$ROOT/data/kkrieger_beta_conv.kx@/kkrieger_beta.kx"'),
):
 if old not in s: raise SystemExit("missing preload "+old)
 s=s.replace(old,new,1)
p.write_text(s,encoding="utf-8")
PY
chmod +x "$PATCHED"

KK_RELEASE=1 KK_OBJDIR="$WORK/obj" KK_OUTDIR="$DIST" bash "$PATCHED" clean
HTML="$DIST/kkrieger.html"
test -s "$HTML"

mapfile -t sidecars < <(find "$DIST" -maxdepth 1 -type f ! -name kkrieger.html -printf '%f\n')
(( ${#sidecars[@]} == 0 )) || { printf 'unexpected sidecars: %s\n' "${sidecars[*]}"; exit 4; }

python3 - "$HTML" "$ROOT/LICENSE.txt" "$ROOT/wasm/mojoshader/LICENSE.txt" "$EXPECTED_SHA" <<'PY'
from pathlib import Path
import html,sys
hp,bp,mp,sha=Path(sys.argv[1]),Path(sys.argv[2]),Path(sys.argv[3]),sys.argv[4]
doc=hp.read_text(encoding="utf-8")
notice=f"""<template id="third-party-license-notices">
Krieger Surgery Lab provenance: https://github.com/MasonDye/kkrieger-wasm
Pinned source commit: {sha}
Native surgery target: KOp 219 inside weapon-0 optics graph rooted at KOp 224.
farbrausch/.theprodukkt:
{html.escape(bp.read_text(encoding="utf-8"))}
MojoShader:
{html.escape(mp.read_text(encoding="utf-8"))}
</template>"""
doc=doc.replace("</body>",notice+"\n</body>",1)
hp.write_text(doc,encoding="utf-8")
PY

cp "$HTML" "$WORK/index.html"
sha256sum "$WORK/index.html"
du -h "$WORK/index.html"
