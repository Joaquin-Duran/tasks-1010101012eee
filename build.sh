#!/usr/bin/env bash
# Concatenates src/ into index.html, in order, and refuses to write a broken file.
# The order matters: 01 opens <html><head>, 03 opens <body> and <script>,
# 12 closes </script></body></html>. Everything between is plain JS.
set -euo pipefail
cd "$(dirname "$0")"

PARTS=(
  src/01-head.html
  src/02-css.html
  src/03-body-and-core.html
  src/04-markdown-and-shared.js
  src/05-gantt.js
  src/06-planner-helpers.js
  src/07-phases-stack-activity.js
  src/08-myweek-where-timeline.js
  src/09-files-and-journey.js
  src/10-ideas.js
  src/11-modals.js
  src/12-render-and-wiring.js
)

for f in "${PARTS[@]}"; do
  [ -s "$f" ] || { echo "FAIL: $f is missing or empty"; exit 1; }
done

cat "${PARTS[@]}" > index.html

head -1 index.html | grep -q '<!DOCTYPE html>' || { echo "FAIL: no doctype"; exit 1; }
grep -q '</head>' index.html || { echo "FAIL: no </head>"; exit 1; }
grep -q '<body>'  index.html || { echo "FAIL: no <body>"; exit 1; }
tail -2 index.html | tr -d '\n' | grep -q '</html>' || { echo "FAIL: no </html>"; exit 1; }

# extract the script block and syntax-check it
python3 - <<'PY' > /tmp/gp_check.js
src = open('index.html').read()
s = src.index('<script>') + len('<script>')
e = src.rindex('</script>')
print(src[s:e])
PY
node --check /tmp/gp_check.js || { echo "FAIL: JS syntax error"; exit 1; }
rm -f /tmp/gp_check.js

if grep -q '—' index.html; then
  echo "WARN: em dashes present ($(grep -o '—' index.html | wc -l | tr -d ' ')). House style says none."
fi

echo "OK  $(wc -c < index.html | tr -d ' ') bytes  ->  index.html"
