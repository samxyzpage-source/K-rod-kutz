#!/usr/bin/env node
/**
 * bundle.js — builds a single self-contained HTML file from kicker/index.html by
 * inlining every local stylesheet and script (in document order). External
 * resources (the Google Font link) are kept as-is. No minification, no
 * transforms: the bundle runs exactly the same code as the multi-file site.
 *
 *   node kicker/tools/bundle.js                      # → kicker/dist/kicker.html (full document)
 *   node kicker/tools/bundle.js --fragment out.html  # body-only fragment (no doctype/html/head/body tags)
 *
 * The fragment mode is for hosts that wrap the content in their own document
 * skeleton; it emits <title>, <style> blocks, the app markup and the scripts.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const fragment = args.includes('--fragment');
const outArg = args.filter((a) => !a.startsWith('--'))[0];
const OUT = outArg ? path.resolve(outArg) : path.join(ROOT, 'dist', fragment ? 'kicker.fragment.html' : 'kicker.html');

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function read(rel) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    console.warn('bundle: skipping missing ' + rel);
    return null;
  }
  return fs.readFileSync(file, 'utf8');
}

/** Inline <link rel="stylesheet" href="local.css"> and <script src="local.js"></script>. */
let out = html
  .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"':]+)["'][^>]*>/g, (m, href) => {
    const css = read(href);
    return css === null ? '' : '<style data-src="' + href + '">\n' + css + '\n</style>';
  })
  .replace(/<script\b[^>]*src=["']([^"':]+)["'][^>]*>\s*<\/script>/g, (m, src) => {
    const js = read(src);
    if (js === null) return '';
    // a literal "</script>" inside the source would end the inline block early
    return '<script data-src="' + src + '">\n' + js.replace(/<\/script/gi, '<\\/script') + '\n</script>';
  });

if (fragment) {
  // keep only what belongs inside <body>, plus <title> and the head's <style>/<link>/<meta theme-color>
  const head = (out.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i) || ['', ''])[1];
  const body = (out.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i) || ['', out])[1];
  const keep = [];
  const title = head.match(/<title>[\s\S]*?<\/title>/i); if (title) keep.push(title[0]);
  const links = head.match(/<link\b[^>]*>/gi) || []; links.forEach((l) => { if (!/rel=["']icon["']/i.test(l)) keep.push(l); });
  const styles = head.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []; styles.forEach((s) => keep.push(s));
  const headScripts = head.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || []; headScripts.forEach((s) => keep.push(s));
  out = keep.join('\n') + '\n' + body;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, out);
console.log('bundle: wrote ' + path.relative(process.cwd(), OUT) + ' (' + Math.round(out.length / 1024) + ' KB)');
