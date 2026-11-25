// Draws every image on the profile README, light + dark, desktop + phone. No outside services:
// activity is read from local git history - only dates, hours and the commit type prefix
// (feat/fix/...) of my own commits. No repo names, messages or code leave the machine.
// Run: node scripts/render.mjs   (env: GIT_ROOTS="~/Desktop", GIT_EMAILS="a@b.com,c@d.com")
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, statSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ROOTS = (process.env.GIT_ROOTS || `${homedir()}/Desktop`).split(',').map(r => r.replace(/^~/, homedir()));
const EMAILS = (process.env.GIT_EMAILS || 'mustafasinanovic2003@gmail.com').split(',');
const SKIP = new Set(['node_modules', '.worktrees', 'dist', '.angular', 'coverage']);
const ICONS = JSON.parse(readFileSync(new URL('./icons.json', import.meta.url), 'utf8'));

// ================= data =================
function findRepos(dir, depth = 0, out = []) {
    if (depth > 4 || !existsSync(dir)) return out;
    if (existsSync(join(dir, '.git')) && statSync(join(dir, '.git')).isDirectory()) return out.push(dir), out;
    for (const name of readdirSync(dir)) {
        if (SKIP.has(name) || name.startsWith('.')) continue;
        const p = join(dir, name);
        try { if (statSync(p).isDirectory()) findRepos(p, depth + 1, out); } catch { /* unreadable */ }
    }
    return out;
}

const TYPES = { feat: 'Features', fix: 'Fixes', refactor: 'Refactors', perf: 'Refactors', style: 'Polish', chore: 'Upkeep', test: 'Upkeep', docs: 'Upkeep', ci: 'Upkeep', build: 'Upkeep' };
const seen = new Set();
const perDay = new Map();
const perHour = Array(24).fill(0);
const perType = new Map();
const repos = new Set();
const since = new Date(Date.now() - 371 * 864e5).toISOString().slice(0, 10);
for (const repo of ROOTS.flatMap(r => findRepos(r))) {
    let log = '';
    try {
        log = execFileSync('git', ['-C', repo, 'log', '--all', '--no-merges', `--since=${since}`, ...EMAILS.map(e => `--author=${e}`), '--format=%H\t%ad\t%s', '--date=format:%Y-%m-%d %H'], { encoding: 'utf8', maxBuffer: 64 << 20 });
    } catch { continue; }
    for (const line of log.split('\n').filter(Boolean)) {
        const [sha, when, subject = ''] = line.split('\t');
        if (seen.has(sha)) continue;
        seen.add(sha);
        const [date, hour] = when.split(' ');
        perDay.set(date, (perDay.get(date) || 0) + 1);
        perHour[+hour]++;
        const prefix = (subject.match(/^([a-z]+)[(!:]/i)?.[1] || '').toLowerCase();
        const type = TYPES[prefix] || 'Other';
        perType.set(type, (perType.get(type) || 0) + 1);
        repos.add(repo);
    }
}

const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');
const start = new Date(today); start.setUTCDate(start.getUTCDate() - start.getUTCDay() - 52 * 7);
const days = [];
for (let d = new Date(start); d <= today; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, count: perDay.get(iso) || 0 });
}
const yearDays = days.slice(-365);
const total = yearDays.reduce((s, d) => s + d.count, 0);
const last30 = days.slice(-30);
const total30 = last30.reduce((s, d) => s + d.count, 0);
const activeDays = yearDays.filter(d => d.count).length;
let longest = 0, run = 0;
for (const d of yearDays) { run = d.count ? run + 1 : 0; longest = Math.max(longest, run); }
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count) current++;
    else if (i === days.length - 1) continue; // today isn't over yet
    else break;
}
const weeklyAll = [];
for (let i = days.length - 7 * 52; i < days.length; i += 7) weeklyAll.push(days.slice(i, i + 7).reduce((s, d) => s + d.count, 0));
const peakHour = perHour.indexOf(Math.max(...perHour));
const typeOrder = ['Features', 'Fixes', 'Refactors', 'Polish', 'Upkeep', 'Other'];
const typed = typeOrder.map(k => [k, perType.get(k) || 0]).filter(([, v]) => v);
const typedTotal = typed.reduce((s, [, v]) => s + v, 0) || 1;

// ================= drawing =================
const fmt = n => n.toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const hh = h => `${String(h).padStart(2, '0')}:00`;

const THEMES = {
    dark: { bg: '#0b0f17', surface: '#111724', line: '#1f2738', text: '#eef2f8', muted: '#8691a6', faint: '#4a5468', accent: '#5b86ff', green: '#2fd77f', amber: '#ffb547', pink: '#ff5c8a', violet: '#a78bfa', scale: ['#161d2b', '#1b3270', '#2950d6', '#5b86ff', '#b4c8ff'] },
    light: { bg: '#fbfaf7', surface: '#ffffff', line: '#e7e4dc', text: '#14171f', muted: '#5d6474', faint: '#a9adb6', accent: '#2148d8', green: '#0e9f57', amber: '#d98a00', pink: '#e0336b', violet: '#7c5cf0', scale: ['#efede7', '#cdd8fa', '#87a2f2', '#3d65e6', '#1a37a8'] },
};
const SANS = `font-family="'Inter','Segoe UI',-apple-system,Helvetica,Arial,sans-serif"`;
const MONO = `font-family="'JetBrains Mono','SFMono-Regular',Menlo,Consolas,monospace"`;
const CSS = `<style>
.in{opacity:0;animation:in .8s cubic-bezier(.2,.7,.2,1) forwards}
.pop{opacity:0;transform-box:fill-box;transform-origin:center;animation:pop .5s cubic-bezier(.2,1.5,.4,1) forwards}
.bar{transform-box:fill-box;transform-origin:bottom;transform:scaleY(0);animation:bar .9s cubic-bezier(.2,1.2,.3,1) forwards}
.drop{opacity:0;animation:drop .7s cubic-bezier(.2,1.4,.4,1) forwards}
.fade{opacity:0;animation:fade .8s ease forwards}
.flick{transform-box:fill-box;transform-origin:bottom;animation:flick 1.2s ease-in-out infinite alternate}
@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:none}}
@keyframes bar{to{transform:scaleY(1)}}
@keyframes drop{from{opacity:0;transform:translateY(-26px)}to{opacity:1;transform:none}}
@keyframes fade{to{opacity:1}}
@keyframes flick{0%{transform:scale(1,1) rotate(-3deg)}50%{transform:scale(.92,1.08) rotate(2deg)}100%{transform:scale(1.04,.94) rotate(-1deg)}}
@media (prefers-reduced-motion:reduce){.in,.pop,.bar,.drop,.fade,.flick{animation:none;opacity:1;transform:none}}
</style>`;

const T = (x, y, s, o = {}) => {
    const { size = 14, weight = 400, fill, anchor = 'start', mono = false, ls = 0, cls = '', delay } = o;
    return `<text${cls ? ` class="${cls}"` : ''}${delay !== undefined ? ` style="animation-delay:${delay}s"` : ''} x="${x}" y="${y}" ${mono ? MONO : SANS} font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls ? ` letter-spacing="${ls}"` : ''}>${esc(s)}</text>`;
};
function doc(t, w, h, title, body, { bare = false } = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${CSS}
${bare ? '' : `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="18" fill="${t.surface}" stroke="${t.line}"/>`}
${body}</svg>`;
}
function lum(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function icon(t, key, x, y, size) {
    const i = ICONS[key];
    if (!i) return '';
    const a = lum(i.hex) + 0.05, b = lum(t.surface) + 0.05;
    const fill = Math.max(a, b) / Math.min(a, b) < 2.2 ? t.text : i.hex;
    return `<g transform="translate(${x} ${y}) scale(${size / 24})"><path d="${i.path}" fill="${fill}"/></g>`;
}
// A number that counts up from 0 (frames swapped with SMIL <set>, so it works inside <img>).
function countUp(x, y, value, o, { dur = 1.4, begin = 0.2, frames = 18, format = fmt } = {}) {
    let out = '';
    for (let i = 1; i <= frames; i++) {
        const p = 1 - (1 - i / frames) ** 3;
        const v = i === frames ? value : Math.round(value * p);
        const on = (begin + (dur * (i - 1)) / frames).toFixed(3), off = (begin + (dur * i) / frames).toFixed(3);
        out += `<g opacity="0"><set attributeName="opacity" to="1" begin="${on}s"/>${i < frames ? `<set attributeName="opacity" to="0" begin="${off}s"/>` : ''}${T(x, y, format(v), o)}</g>`;
    }
    return out;
}
function smooth(pts) {
    let p = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) { const [px, py] = pts[i - 1], [x, y] = pts[i], cx = ((px + x) / 2).toFixed(1); p += ` C${cx},${py.toFixed(1)} ${cx},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`; }
    return p;
}

// ---------- hero ----------
function letters(word, x, y, size, fill, delay0) {
    const spans = [...word].map((ch, i) => `<tspan fill-opacity="0">${esc(ch)}<animate attributeName="fill-opacity" from="0" to="1" begin="${(delay0 + i * 0.07).toFixed(2)}s" dur=".35s" fill="freeze"/></tspan>`).join('');
    return `<text class="drop" style="animation-delay:${delay0}s" x="${x}" y="${y}" ${SANS} font-size="${size}" font-weight="800" letter-spacing="${-size / 32}" fill="${fill}">${spans}</text>`;
}
function hero(t, W, phone) {
    const h = phone ? 340 : 320;
    const weeks = phone ? weeklyAll.slice(-26) : weeklyAll;
    const max = Math.max(1, ...weeks), bw = W / weeks.length, barMax = phone ? 64 : 78;
    const barRects = (fill, cls) => weeks.map((v, i) => {
        const bh = Math.max(3, (v / max) * barMax);
        return `<rect${cls ? ` class="${cls}" style="animation-delay:${(0.6 + i * 0.018).toFixed(3)}s"` : ''} x="${(i * bw + 1.2).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 2.4).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${fill}"/>`;
    }).join('');
    const lastX = Math.min(W - 20, (weeks.length - 1) * bw + bw / 2), lastY = h - Math.max(3, (weeks.at(-1) / max) * barMax);
    const nameSize = phone ? 44 : 58, nx = phone ? 26 : 42;
    const tagLines = phone ? ['I build web apps that feel instant,', 'and ship them every day.'] : ['I build web apps that feel instant, and ship them every day.'];
    const tagY = phone ? 202 : 236, charW = 6.95;
    const typeDur = 2.6, totalChars = tagLines.join('').length;
    let tStart = 1.4, typed = '';
    const caretSteps = [];
    tagLines.forEach((line, li) => {
        const d = (typeDur * line.length) / totalChars, y = tagY + li * 22, wpx = line.length * charW + 4;
        const steps = 24;
        const widths = Array.from({ length: steps + 1 }, (_, i) => ((wpx * i) / steps).toFixed(0)).join(';');
        typed += `<clipPath id="ty${li}"><rect x="${nx + 2}" y="${y - 16}" width="0" height="24"><animate attributeName="width" values="${widths}" begin="${tStart.toFixed(2)}s" dur="${d.toFixed(2)}s" calcMode="discrete" fill="freeze"/></rect></clipPath>
<g clip-path="url(#ty${li})">${T(nx + 2, y, line, { size: 16, fill: t.muted })}</g>`;
        caretSteps.push({ y, start: tStart, d, wpx });
        tStart += d;
    });
    const caret = caretSteps.map((c, i) => {
        const xs = Array.from({ length: 25 }, (_, k) => (nx + 2 + (c.wpx * k) / 24 + 2).toFixed(0)).join(';');
        const last = i === caretSteps.length - 1;
        return `<rect x="${nx + 2}" y="${c.y - 14}" width="2" height="18" fill="${t.accent}" opacity="0"><set attributeName="opacity" to="1" begin="${c.start.toFixed(2)}s"/>${last ? '' : `<set attributeName="opacity" to="0" begin="${(c.start + c.d).toFixed(2)}s"/>`}<animate attributeName="x" values="${xs}" begin="${c.start.toFixed(2)}s" dur="${c.d.toFixed(2)}s" calcMode="discrete" fill="freeze"/>${last ? `<animate attributeName="fill-opacity" values="1;0;1" dur="1s" begin="${(c.start + c.d).toFixed(2)}s" repeatCount="indefinite"/>` : ''}</rect>`;
    }).join('');
    const badgeX = phone ? nx : W - 222, badgeY = phone ? 248 : 40;
    return doc(t, W, h, `Mustafa Sinanović, full-stack developer in Sarajevo. ${fmt(total)} commits in the last year.`, `
<defs>
<clipPath id="c"><rect x="1" y="1" width="${W - 2}" height="${h - 2}" rx="17"/></clipPath>
<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="46"/></filter>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}" stop-opacity=".7"/><stop offset="1" stop-color="${t.accent}" stop-opacity=".12"/></linearGradient>
<linearGradient id="name" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${phone ? 260 : 420}" y2="0" spreadMethod="reflect">
  <stop offset="0" stop-color="${t.accent}"/><stop offset=".5" stop-color="${t.green}"/><stop offset="1" stop-color="${t.accent}"/>
  <animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="${phone ? 520 : 840} 0" dur="6s" repeatCount="indefinite"/>
</linearGradient>
<linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<mask id="bars">${barRects('#fff')}</mask>
<pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" fill="${t.faint}" opacity=".35"/></pattern>
</defs>
<g clip-path="url(#c)">
  <rect width="${W}" height="${h}" fill="url(#dots)"/>
  <circle r="${phone ? 110 : 150}" fill="${t.accent}" opacity=".32" filter="url(#blur)"><animate attributeName="cx" values="${W * 0.75};${W * 0.9};${W * 0.7};${W * 0.75}" dur="14s" repeatCount="indefinite"/><animate attributeName="cy" values="60;140;90;60" dur="11s" repeatCount="indefinite"/></circle>
  <circle r="${phone ? 90 : 120}" fill="${t.green}" opacity=".18" filter="url(#blur)"><animate attributeName="cx" values="${W * 0.14};${W * 0.3};${W * 0.07};${W * 0.14}" dur="16s" repeatCount="indefinite"/><animate attributeName="cy" values="${h};${h - 80};${h - 20};${h}" dur="12s" repeatCount="indefinite"/></circle>
  ${barRects('url(#sky)', 'bar')}
  <g mask="url(#bars)"><rect x="-260" y="${h - 90}" width="220" height="90" fill="url(#sweep)" opacity=".55"><animate attributeName="x" from="-260" to="${W + 40}" dur="3.2s" begin="2.4s" repeatCount="indefinite"/></rect></g>
  <circle class="fade" style="animation-delay:1.8s" cx="${lastX}" cy="${lastY - 8}" r="4" fill="${t.green}"/>
  <circle cx="${lastX}" cy="${lastY - 8}" r="4" fill="none" stroke="${t.green}" stroke-width="2"><animate attributeName="r" values="4;16" dur="1.8s" repeatCount="indefinite"/><animate attributeName="opacity" values=".9;0" dur="1.8s" repeatCount="indefinite"/></circle>
</g>
${T(nx + 2, phone ? 50 : 62, phone ? 'SARAJEVO · FULL-STACK' : 'SARAJEVO  ·  FULL-STACK DEVELOPER', { size: 12, weight: 600, fill: t.muted, ls: 2.4, cls: 'fade' })}
${letters('Mustafa', nx, phone ? 104 : 124, nameSize, t.text, 0.15)}
${letters('Sinanović', nx, phone ? 152 : 184, nameSize, 'url(#name)', 0.55)}
${typed}${caret}
<g class="fade" style="animation-delay:1s">
<rect x="${badgeX}" y="${badgeY}" width="182" height="30" rx="15" fill="${t.bg}" fill-opacity=".8" stroke="${t.line}"/>
<circle cx="${badgeX + 18}" cy="${badgeY + 15}" r="4.5" fill="${t.green}"><animate attributeName="opacity" values="1;.25;1" dur="1.6s" repeatCount="indefinite"/></circle>
${T(badgeX + 30, badgeY + 19.5, `${fmt(weeklyAll.at(-1))} commits this week`, { size: 11.5, weight: 600, fill: t.text })}
</g>`);
}

// ---------- tools ----------
const CORE = ['angular', 'typescript', 'node', 'aws', 'graphql', 'sass'];
const MORE = ['react', 'rxjs', 'tailwind', 'vite', 'express', 'python', 'dynamodb', 'postgres', 'mongodb', 'docker', 'vitest', 'sentry', 'git'];
const NAME = { typescript: 'TypeScript', node: 'Node.js', aws: 'AWS', sass: 'SCSS', graphql: 'GraphQL', angular: 'Angular' };
function stack(t, W, phone) {
    const cols = phone ? 3 : 6, gap = phone ? 10 : 14, pad = phone ? 20 : 32;
    const tw = (W - 2 * pad - gap * (cols - 1)) / cols, th = phone ? 88 : 104, isz = phone ? 42 : 52;
    let y = 62;
    const core = CORE.map((k, i) => {
        const x = pad + (i % cols) * (tw + gap), yy = y + Math.floor(i / cols) * (th + gap);
        return `<g class="pop" style="animation-delay:${(i * 0.08).toFixed(2)}s"><title>${esc(NAME[k] || ICONS[k].title)}</title><rect x="${x}" y="${yy}" width="${tw}" height="${th}" rx="16" fill="${t.bg}" stroke="${t.line}"/>${icon(t, k, x + tw / 2 - isz / 2, yy + th / 2 - isz / 2, isz)}</g>`;
    }).join('');
    y += Math.ceil(CORE.length / cols) * (th + gap) + 12;
    const per = phone ? 7 : MORE.length, sz = phone ? 24 : 26;
    const rows = Math.ceil(MORE.length / per);
    let more = `<line x1="${pad}" x2="${W - pad}" y1="${y}" y2="${y}" stroke="${t.line}"/>`;
    y += 24;
    const step = (W - 2 * pad - sz) / (per - 1);
    MORE.forEach((k, i) => {
        const r = Math.floor(i / per), c = i % per;
        more += `<g class="pop" style="animation-delay:${(0.5 + i * 0.05).toFixed(2)}s"><title>${esc(ICONS[k]?.title || k)}</title>${icon(t, k, pad + c * step, y + r * (sz + 20), sz)}</g>`;
    });
    const h = y + rows * (sz + 20) + 4;
    return doc(t, W, h, `Daily: ${CORE.map(k => ICONS[k].title).join(', ')}. Also: ${MORE.map(k => ICONS[k]?.title).join(', ')}.`, `
${T(pad, 40, 'Daily drivers', { size: 15, weight: 700, fill: t.text })}${phone ? '' : T(W - pad, 40, 'what I reach for first', { size: 12, fill: t.muted, anchor: 'end' })}
${core}${more}`);
}

// ---------- activity: count-up numbers, flame streak, sparkline, wave heatmap ----------
function activity(t, W, phone) {
    const pad = phone ? 20 : 32;
    const colW = phone ? (W - 2 * pad) / 3 : 190;
    const numSize = phone ? 26 : 34;
    const nums = [[total, 'commits / year', t.accent], [current, current === longest ? 'day streak · best' : 'day streak', t.text], [activeDays, 'days shipped', t.text]];
    let head = nums.map(([v, l, c], i) => {
        const x = pad + i * colW;
        const flame = i === 1 ? `<g transform="translate(${x + fmt(v).length * numSize * 0.6 + 4} ${74 - numSize * 0.72}) scale(${numSize / 34})"><g class="flick"><path d="M8 0C9 5 14 7 14 13a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4 1-7 1-10z" fill="${t.amber}"/><path d="M8 9c1 2 3 3 3 5a3 3 0 0 1-6 0c0-1 1-2 1-3 1 1 2 0 2-2z" fill="${t.pink}" opacity=".9"/></g></g>` : '';
        return `<g>${countUp(x, 74, v, { size: numSize, weight: 800, fill: c, ls: -1 }, { begin: 0.2 + i * 0.15 })}${flame}${T(x, 96, l, { size: phone ? 11 : 12, fill: t.muted })}</g>`;
    }).join('');
    if (!phone) head += [1, 2].map(i => `<line x1="${pad + i * colW - 18}" x2="${pad + i * colW - 18}" y1="46" y2="100" stroke="${t.line}"/>`).join('');

    const sx0 = phone ? pad : W - pad - 220, sx1 = W - pad, sy0 = phone ? 124 : 46, sy1 = phone ? 168 : 92;
    const m = Math.max(1, ...last30.map(d => d.count));
    const pts = last30.map((d, i) => [sx0 + (i / 29) * (sx1 - sx0), sy1 - (d.count / m) * (sy1 - sy0)]);
    const path = smooth(pts);
    const len = 1400;
    const spark = `<defs><linearGradient id="sa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}" stop-opacity=".28"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></linearGradient></defs>
<path class="fade" style="animation-delay:1.2s" d="${path} L${sx1},${sy1} L${sx0},${sy1} Z" fill="url(#sa)"/>
<path d="${path}" fill="none" stroke="${t.accent}" stroke-width="2" stroke-linecap="round" stroke-dasharray="${len}" stroke-dashoffset="${len}"><animate attributeName="stroke-dashoffset" from="${len}" to="0" begin=".3s" dur="1.6s" fill="freeze"/></path>
<circle class="pop" style="animation-delay:1.8s" cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="3.5" fill="${t.green}"/>
${T(sx1, sy1 + 18, `${fmt(total30)} in the last 30 days`, { size: 12, fill: t.muted, anchor: 'end' })}`;

    const allWeeks = [];
    for (let i = 0; i < days.length; i += 7) allWeeks.push(days.slice(i, i + 7));
    const weeks = phone ? allWeeks.slice(-26) : allWeeks;
    const nz = days.map(d => d.count).filter(Boolean).sort((a, b) => a - b);
    const q = p => nz[Math.floor(p * (nz.length - 1))] || 1;
    const cuts = [q(0.25), q(0.5), q(0.8)];
    const lvl = c => (c === 0 ? 0 : c <= cuts[0] ? 1 : c <= cuts[1] ? 2 : c <= cuts[2] ? 3 : 4);
    const x0 = phone ? pad + 22 : 58, divY = phone ? 206 : 128, y0 = divY + 40, g = 3;
    const cell = Math.floor((W - pad - x0) / weeks.length) - g;
    let cells = '', months = '', lastM = -1;
    weeks.forEach((wk, wi) => {
        wk.forEach((d, di) => { cells += `<rect class="pop" style="animation-delay:${(0.4 + (wi + di) * 0.022).toFixed(3)}s" x="${x0 + wi * (cell + g)}" y="${y0 + di * (cell + g)}" width="${cell}" height="${cell}" rx="2.5" fill="${t.scale[lvl(d.count)]}"><title>${d.count} commits · ${d.date}</title></rect>`; });
        const mo = new Date(wk[0].date + 'T00:00:00Z').getUTCMonth();
        const nextNew = [1, 2].some(k => weeks[wi + k] && new Date(weeks[wi + k][0].date + 'T00:00:00Z').getUTCMonth() !== mo);
        if (mo !== lastM && !nextNew && wi < weeks.length - 2) { months += T(x0 + wi * (cell + g), y0 - 10, new Date(Date.UTC(2000, mo, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), { size: 11, fill: t.muted }); lastM = mo; }
    });
    const dows = ['Mon', 'Wed', 'Fri'].map((l, i) => T(x0 - 8, y0 + (1 + i * 2) * (cell + g) + cell - 2, phone ? l[0] : l, { size: 10, fill: t.faint, anchor: 'end' })).join('');
    const ly = y0 + 7 * (cell + g) + 22;
    const lc = 10, lx = W - pad - 5 * (lc + 4) + 4;
    const legend = t.scale.map((c, i) => `<rect x="${lx + i * (lc + 4)}" y="${ly - lc + 1}" width="${lc}" height="${lc}" rx="2.5" fill="${c}"/>`).join('');
    const h = ly + 26;
    return doc(t, W, h, `${fmt(total)} commits in the last 12 months, ${current}-day streak, ${activeDays} active days, ${fmt(total30)} in the last 30 days`, `
${head}${spark}
<line x1="${pad}" x2="${W - pad}" y1="${divY}" y2="${divY}" stroke="${t.line}"/>
${months}${dows}${cells}
${T(phone ? pad : x0, ly, phone ? `From my git history · ${fmtDate(today.toISOString().slice(0, 10))}` : `Counted from my own git history, private work included · updated ${fmtDate(today.toISOString().slice(0, 10))}`, { size: 11, fill: t.faint })}
${T(lx - 8, ly, 'less', { size: 11, fill: t.faint, anchor: 'end' })}${legend}`);
}

// ---------- rhythm: 24h clock + what I ship ----------
function rhythm(t, W, phone) {
    const pad = phone ? 20 : 32;
    const cx = phone ? W / 2 : pad + 170, cy = phone ? 190 : 186, r0 = 58, rMax = phone ? 62 : 70;
    const hm = Math.max(1, ...perHour);
    let clock = `<circle cx="${cx}" cy="${cy}" r="${r0 - 8}" fill="${t.bg}" stroke="${t.line}"/>`;
    for (let hr = 0; hr < 24; hr++) {
        const a = (hr / 24) * Math.PI * 2 - Math.PI / 2;
        const len = 4 + (perHour[hr] / hm) * rMax;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        const x1 = cx + c * r0, y1 = cy + s * r0, x2 = cx + c * (r0 + len), y2 = cy + s * (r0 + len);
        const peak = hr === peakHour, b = (0.3 + hr * 0.04).toFixed(2);
        clock += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${peak ? t.green : t.accent}" stroke-opacity="${peak ? 1 : (0.35 + 0.65 * (perHour[hr] / hm)).toFixed(2)}" stroke-width="${phone ? 7 : 8}" stroke-linecap="round"><title>${hh(hr)}: ${fmt(perHour[hr])} commits</title><animate attributeName="x2" from="${x1.toFixed(1)}" to="${x2.toFixed(1)}" begin="${b}s" dur=".7s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1"/><animate attributeName="y2" from="${y1.toFixed(1)}" to="${y2.toFixed(1)}" begin="${b}s" dur=".7s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1"/></line>`;
        if (hr % 6 === 0) {
            const lr = r0 - 20;
            clock += T((cx + c * lr).toFixed(1), (cy + s * lr + 4).toFixed(1), String(hr).padStart(2, '0'), { size: 10, fill: t.faint, anchor: 'middle', mono: true });
        }
    }
    const pa = (peakHour / 24) * 360;
    clock += `<g transform="translate(${cx} ${cy})"><g><animateTransform attributeName="transform" type="rotate" from="0" to="${pa + 360}" begin=".3s" dur="1.8s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1"/><line x1="0" y1="0" x2="0" y2="${-(r0 - 26)}" stroke="${t.green}" stroke-width="2.5" stroke-linecap="round"/></g><circle r="4" fill="${t.green}"/></g>`;
    const clockHead = `${T(pad, 40, 'When I code', { size: 15, weight: 700, fill: t.text })}${T(phone ? W - pad : W / 2 - 44, 40, `peak ${hh(peakHour)}–${hh((peakHour + 1) % 24)}`, { size: 12, fill: t.green, anchor: 'end', weight: 600 })}`;

    const colors = { Features: t.accent, Fixes: t.green, Refactors: t.violet, Polish: t.pink, Upkeep: t.amber, Other: t.faint };
    const dx = phone ? W / 2 : W / 2 + 110, dy = phone ? 448 : 186, R = 64, sw = 20, C = 2 * Math.PI * R;
    let acc = 0, ring = `<circle cx="${dx}" cy="${dy}" r="${R}" fill="none" stroke="${t.line}" stroke-width="${sw}"/>`;
    typed.forEach(([k, v], i) => {
        const frac = v / typedTotal, seg = Math.max(0.1, frac * C - 3);
        ring += `<circle cx="${dx}" cy="${dy}" r="${R}" fill="none" stroke="${colors[k]}" stroke-width="${sw}" stroke-dasharray="0 ${C.toFixed(1)}" stroke-dashoffset="${(-acc * C).toFixed(1)}" transform="rotate(-90 ${dx} ${dy})"><title>${k}: ${Math.round(frac * 100)}%</title><animate attributeName="stroke-dasharray" from="0 ${C.toFixed(1)}" to="${seg.toFixed(1)} ${C.toFixed(1)}" begin="${(0.4 + i * 0.25).toFixed(2)}s" dur=".8s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1"/></circle>`;
        acc += frac;
    });
    const top = typed.reduce((a, b) => (b[1] > a[1] ? b : a));
    ring += countUp(dx, dy + 6, Math.round((top[1] / typedTotal) * 100), { size: 26, weight: 800, fill: t.text, anchor: 'middle' }, { begin: 0.4, format: v => `${v}%` });
    ring += T(dx, dy + 24, top[0].toLowerCase(), { size: 11, fill: t.muted, anchor: 'middle' });
    const lx = phone ? pad + 8 : dx + R + 36, ly0 = phone ? dy + R + 46 : dy - ((typed.length - 1) * 22) / 2 + 4;
    const legend = typed.map(([k, v], i) => {
        const x = phone ? lx + (i % 2) * ((W - 2 * pad) / 2) : lx, y = phone ? ly0 + Math.floor(i / 2) * 24 : ly0 + i * 22;
        return `<g class="in" style="animation-delay:${(0.5 + i * 0.12).toFixed(2)}s"><rect x="${x}" y="${y - 9}" width="10" height="10" rx="3" fill="${colors[k]}"/>${T(x + 18, y, k, { size: 12.5, fill: t.text })}${T(x + (phone ? 150 : 140), y, `${Math.round((v / typedTotal) * 100)}%`, { size: 12.5, fill: t.muted, anchor: 'end', weight: 600 })}</g>`;
    }).join('');
    const shipHead = T(phone ? pad : W / 2 + 4, phone ? 330 : 40, 'What I ship', { size: 15, weight: 700, fill: t.text });
    const h = phone ? ly0 + Math.ceil(typed.length / 2) * 24 + 8 : 340;
    const divider = phone ? `<line x1="${pad}" x2="${W - pad}" y1="300" y2="300" stroke="${t.line}"/>` : `<line x1="${W / 2 - 20}" x2="${W / 2 - 20}" y1="28" y2="${h - 28}" stroke="${t.line}"/>`;
    return doc(t, W, h, `Most commits between ${hh(peakHour)} and ${hh((peakHour + 1) % 24)}. ${typed.map(([k, v]) => `${k} ${Math.round((v / typedTotal) * 100)}%`).join(', ')}.`, `${clockHead}${clock}${divider}${shipHead}${ring}${legend}`);
}

// ---------- projects ----------
const PROJECTS = [
    { id: 'techstars', name: 'BiH real estate prices', desc: 'Scrapes apartment listings across Bosnia and predicts fair prices.', icons: ['typescript', 'react', 'python'], hue: 'accent', link: 'https://github.com/musss2003/techstars' },
    { id: 'price-predictor-app', name: 'Price model lab', desc: 'Cleaning, features and training behind the price prediction.', icons: ['python', 'jupyter', 'scikit'], hue: 'green', link: 'https://github.com/musss2003/price-predictor-app' },
    { id: 'chat-app', name: 'Real-time chat', desc: 'Instant rooms and presence over WebSockets.', icons: ['react', 'node', 'socketio'], hue: 'violet', link: 'https://github.com/musss2003/chat-app-client' },
    { id: 'iot-smart-light', name: 'Smart light', desc: 'A Raspberry Pi serving a page that drives an LED over Wi-Fi.', icons: ['raspberrypi', 'python'], hue: 'amber', link: 'https://github.com/musss2003/iot-smart-light' },
];
function wrap(s, n) {
    const out = [''];
    for (const w of s.split(' ')) (out.at(-1) + ' ' + w).trim().length > n ? out.push(w) : (out[out.length - 1] = (out.at(-1) + ' ' + w).trim());
    return out;
}
function project(t, p, W) {
    const h = 196, c = t[p.hue];
    const icons = p.icons.map((k, i) => `<g class="pop" style="animation-delay:${(0.1 + i * 0.1).toFixed(2)}s"><rect x="${24 + i * 46}" y="24" width="38" height="38" rx="11" fill="${t.bg}" stroke="${t.line}"/>${icon(t, k, 24 + i * 46 + 9, 33, 20)}</g>`).join('');
    const lines = wrap(p.desc, 46).map((l, i) => T(24, 132 + i * 20, l, { size: 13.5, fill: t.muted })).join('');
    return doc(t, W, h, `${p.name}: ${p.desc}`, `
<defs><radialGradient id="pg" cx="1" cy="0" r="1"><stop offset="0" stop-color="${c}" stop-opacity=".22"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient></defs>
<rect x="1" y="1" width="${W - 2}" height="${h - 2}" rx="17" fill="url(#pg)"/>
${icons}
${T(W - 24, 48, '↗', { size: 18, fill: t.faint, anchor: 'end' })}
<g class="in" style="animation-delay:.25s">${T(24, 100, p.name, { size: 18, weight: 700, fill: t.text, ls: -0.3 })}${lines}</g>`);
}

function label(t, W, s, note) {
    return doc(t, W, 46, s, `${T(4, 32, s, { size: 20, weight: 800, fill: t.text, ls: -0.4 })}${note ? T(W - 4, 32, note, { size: 12, fill: t.muted, anchor: 'end' }) : ''}`, { bare: true });
}

// ================= output =================
mkdirSync('assets', { recursive: true });
for (const f of readdirSync('assets')) if (f.endsWith('.svg')) rmSync(`assets/${f}`);
for (const [name, t] of Object.entries(THEMES)) {
    for (const [suffix, W, phone] of [['', 860, false], ['-phone', 420, true]]) {
        const out = (f, s) => writeFileSync(`assets/${f}${suffix}-${name}.svg`, s);
        out('hero', hero(t, W, phone));
        out('stack', stack(t, W, phone));
        out('activity', activity(t, W, phone));
        out('rhythm', rhythm(t, W, phone));
        out('label-stack', label(t, W, 'Tools'));
        out('label-activity', label(t, W, 'How often I ship'));
        out('label-rhythm', label(t, W, 'How I work'));
        out('label-projects', label(t, W, 'Things I built', phone ? '' : 'outside work'));
    }
    for (const p of PROJECTS) writeFileSync(`assets/project-${p.id}-${name}.svg`, project(t, p, 420));
}
console.log(`repos ${repos.size}, year ${total}, 30d ${total30}, streak ${current}/${longest}, peak ${peakHour}h, types ${typed.map(([k, v]) => `${k}:${v}`).join(' ')}`);
