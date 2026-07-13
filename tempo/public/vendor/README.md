# Vendored third-party bundles

These files are committed, pre-built browser bundles served as static assets.
The app has **no build step** — nothing here is compiled at deploy time. They
are cached by the service worker so client-side features keep working offline.

## chrono.min.js — natural-language date parsing

- **Library:** [chrono-node](https://github.com/wanasit/chrono) v2.10.0 (MIT).
- **What it exposes:** `window.TempoChrono.parse(text, refDate, opts)` using the
  British-English casual parser (`chrono.en.GB`), so `3/4` reads as 3 April and
  phrases like "tomorrow 3pm", "next fri", "in 2 weeks" resolve correctly.
- **Why vendored:** parsing happens on the device during quick-capture, so it
  must work offline (operating rule 8 — no network dependency on core task
  creation). Bundling client-side keeps that promise. English-only keeps it
  light (~45 KB min / ~13 KB gzip).

### How to reproduce / update

```bash
mkdir chrono-build && cd chrono-build && npm init -y
npm install chrono-node@2 esbuild
cat > entry.js <<'EOF'
import { en } from 'chrono-node';
window.TempoChrono = { parse: (text, ref, opts) => en.GB.parse(text, ref, opts) };
EOF
npx esbuild entry.js --bundle --minify --format=iife --outfile=chrono.min.js
# then copy chrono.min.js to tempo/public/vendor/
```

chrono-node is intentionally **not** a runtime dependency in `package.json` —
the server never parses dates; only this vendored browser bundle does.
