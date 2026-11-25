// Draws every image on the profile README (light + dark). No outside services: activity is read
// from local git history (only dates of my own commits - no repo names, messages or code).
// Run: node scripts/render.mjs   (env: GIT_ROOTS="~/Desktop", GIT_EMAILS="a@b.com,c@d.com")
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const ROOTS = (process.env.GIT_ROOTS || `${homedir()}/Desktop`).split(',').map(r => r.replace(/^~/, homedir()));
const EMAILS = (process.env.GIT_EMAILS || 'mustafasinanovic2003@gmail.com').split(',');
const SKIP = new Set(['node_modules', '.worktrees', 'dist', '.angular', 'coverage']);

// ---------- data ----------
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

const seen = new Set();
const perDay = new Map();
const perRepoActive = new Set();
const since = new Date(Date.now() - 371 * 864e5).toISOString().slice(0, 10);
for (const repo of ROOTS.flatMap(r => findRepos(r))) {
    let log = '';
    try {
        log = execFileSync('git', ['-C', repo, 'log', '--all', '--no-merges', `--since=${since}`, ...EMAILS.map(e => `--author=${e}`), '--format=%H %ad', '--date=short'], { encoding: 'utf8', maxBuffer: 64 << 20 });
    } catch { continue; }
    for (const line of log.split('\n').filter(Boolean)) {
        const [sha, date] = line.split(' ');
        if (seen.has(sha)) continue;
        seen.add(sha);
        perDay.set(date, (perDay.get(date) || 0) + 1);
        perRepoActive.add(repo);
    }
}

// 53 weeks ending this week (Sunday-first, like GitHub).
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
const best = yearDays.reduce((m, d) => (d.count > m.count ? d : m), yearDays[0]);
let longest = 0, run = 0;
for (const d of yearDays) { run = d.count ? run + 1 : 0; longest = Math.max(longest, run); }
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count) current++;
    else if (i === days.length - 1) continue; // today isn't over yet
    else break;
}
const weekdayShare = Math.round((yearDays.filter(d => { const w = new Date(d.date + 'T00:00:00Z').getUTCDay(); return w > 0 && w < 6; }).reduce((s, d) => s + d.count, 0) / Math.max(1, total)) * 100);

// ---------- drawing ----------
import { readFileSync } from 'node:fs';
const ICONS = JSON.parse(readFileSync(new URL('./icons.json', import.meta.url), 'utf8'));

const fmt = n => n.toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// Ink blue + signal green, on warm-neutral paper / deep ink.
const THEMES = {
    dark: { bg: '#0b0f17', surface: '#111724', line: '#1f2738', text: '#eef2f8', muted: '#8691a6', faint: '#4a5468', accent: '#5b86ff', green: '#2fd77f', scale: ['#161d2b', '#1b3270', '#2950d6', '#5b86ff', '#b4c8ff'] },
    light: { bg: '#fbfaf7', surface: '#ffffff', line: '#e7e4dc', text: '#14171f', muted: '#5d6474', faint: '#a9adb6', accent: '#2148d8', green: '#0e9f57', scale: ['#efede7', '#cdd8fa', '#87a2f2', '#3d65e6', '#1a37a8'] },
};
const SANS = `font-family="'Inter','Segoe UI',-apple-system,Helvetica,Arial,sans-serif"`;
const MONO = `font-family="'JetBrains Mono','SFMono-Regular',Menlo,Consolas,monospace"`;
const W = 860;
const CSS = `<style>
.in{animation:in .8s cubic-bezier(.2,.7,.2,1) both}
.grow{transform-box:fill-box;transform-origin:bottom;animation:grow .9s cubic-bezier(.2,.7,.2,1) both}
.draw{stroke-dasharray:2000;stroke-dashoffset:2000;animation:draw 1.6s ease-out .2s forwards}
@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes draw{to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){.in,.grow{animation:none}.draw{animation:none;stroke-dashoffset:0}}
</style>`;

const T = (x, y, s, o = {}) => {
    const { size = 14, weight = 400, fill, anchor = 'start', mono = false, ls = 0, op = 1 } = o;
    return `<text x="${x}" y="${y}" ${mono ? MONO : SANS} font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${ls ? ` letter-spacing="${ls}"` : ''}${op < 1 ? ` opacity="${op}"` : ''}>${esc(s)}</text>`;
};
function doc(t, w, h, title, body, { bare = false } = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${CSS}
${bare ? '' : `<rect x=".5" y=".5" width="${w - 1}" height="${h - 1}" rx="18" fill="${t.surface}" stroke="${t.line}"/>`}
${body}</svg>`;
}

// Brand color, unless it would vanish on this background (Express, GitHub-black, etc.).
function lum(hex) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function iconColor(t, hex) {
    const a = lum(hex) + 0.05, b = lum(t.surface) + 0.05;
    return Math.max(a, b) / Math.min(a, b) < 2.2 ? t.text : hex;
}
function icon(t, key, x, y, size) {
    const i = ICONS[key];
    if (!i) return '';
    return `<g transform="translate(${x} ${y}) scale(${size / 24})"><path d="${i.path}" fill="${iconColor(t, i.hex)}"/></g>`;
}

// ---- hero: name over a skyline of my real weekly commits ----
function hero(t) {
    const h = 300;
    const weeks = [];
    for (let i = days.length - 7 * 52; i < days.length; i += 7) weeks.push(days.slice(i, i + 7).reduce((s, d) => s + d.count, 0));
    const max = Math.max(1, ...weeks);
    const bw = W / weeks.length;
    const bars = weeks.map((v, i) => {
        const bh = Math.max(2, (v / max) * 64);
        const last = i === weeks.length - 1;
        return `<rect class="grow" style="animation-delay:${i * 12}ms" x="${(i * bw + 1).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="1.5" fill="${last ? t.green : 'url(#sky)'}"/>`;
    }).join('');
    const thisWeek = weeks.at(-1);
    return doc(t, W, h, `Mustafa Sinanović, full-stack developer in Sarajevo. ${fmt(total)} commits in the last year.`, `
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${t.accent}" stop-opacity=".08"/></linearGradient>
<clipPath id="c"><rect x="1" y="1" width="${W - 2}" height="${h - 2}" rx="17"/></clipPath></defs>
<g clip-path="url(#c)">${bars}</g>
<g class="in">
${T(44, 64, 'SARAJEVO  ·  FULL-STACK DEVELOPER', { size: 12, weight: 600, fill: t.muted, ls: 2.4 })}
${T(42, 122, 'Mustafa', { size: 54, weight: 800, fill: t.text, ls: -1.5 })}
${T(42, 178, 'Sinanović', { size: 54, weight: 800, fill: t.accent, ls: -1.5 })}
${T(44, 212, 'I build web apps that feel instant, and ship them every day.', { size: 16, fill: t.muted })}
</g>
<g class="in" style="animation-delay:.5s">
<rect x="${W - 222}" y="40" width="182" height="30" rx="15" fill="${t.bg}" fill-opacity=".85" stroke="${t.line}"/>
<circle cx="${W - 204}" cy="55" r="4.5" fill="${t.green}"><animate attributeName="opacity" values="1;.3;1" dur="2.2s" repeatCount="indefinite"/></circle>
${T(W - 192, 59.5, `${fmt(thisWeek)} commits this week`, { size: 11.5, weight: 600, fill: t.text })}
</g>`);
}

// ---- stack: daily drivers big, the rest as a quiet row ----
const CORE = ['angular', 'typescript', 'node', 'aws', 'graphql', 'sass'];
const MORE = ['react', 'rxjs', 'tailwind', 'vite', 'express', 'python', 'dynamodb', 'postgres', 'mongodb', 'docker', 'vitest', 'sentry', 'git'];
const SHORT = { typescript: 'TypeScript', node: 'Node.js', aws: 'AWS', sass: 'SCSS', graphql: 'GraphQL', angular: 'Angular' };
function stack(t) {
    const gap = 14, tw = (W - 64 - gap * (CORE.length - 1)) / CORE.length, th = 112;
    const core = CORE.map((k, i) => {
        const x = 32 + i * (tw + gap), y = 64;
        return `<g class="in" style="animation-delay:${i * 60}ms"><rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="14" fill="${t.bg}" stroke="${t.line}"/>
${icon(t, k, x + tw / 2 - 20, y + 22, 40)}${T(x + tw / 2, y + 92, SHORT[k] || ICONS[k].title, { size: 13, weight: 600, fill: t.text, anchor: 'middle' })}</g>`;
    }).join('');
    const sz = 26, step = (W - 64 - sz) / (MORE.length - 1);
    const more = MORE.map((k, i) => `<g class="in" style="animation-delay:${400 + i * 40}ms"><title>${esc(ICONS[k]?.title || k)}</title>${icon(t, k, 32 + i * step, 232, sz)}</g>`).join('');
    return doc(t, W, 284, `Daily: ${CORE.map(k => ICONS[k].title).join(', ')}. Also: ${MORE.map(k => ICONS[k]?.title).join(', ')}.`, `
${T(32, 42, 'Daily drivers', { size: 15, weight: 700, fill: t.text })}${T(W - 32, 42, 'what I reach for first', { size: 12, fill: t.muted, anchor: 'end' })}
${core}
<line x1="32" x2="${W - 32}" y1="206" y2="206" stroke="${t.line}"/>
${T(32, 224, '', { fill: t.muted })}${more}`);
}

// ---- projects ----
const PROJECTS = [
    { id: 'techstars', name: 'BiH real estate prices', desc: 'Scrapes apartment listings across Bosnia and predicts fair prices.', icons: ['typescript', 'react', 'python'], hue: 'accent' },
    { id: 'price-predictor-app', name: 'Price model lab', desc: 'Cleaning, features and training behind the price prediction.', icons: ['python', 'jupyter', 'scikit'], hue: 'green' },
    { id: 'chat-app', name: 'Real-time chat', desc: 'Instant rooms and presence over WebSockets.', icons: ['react', 'node', 'socketio'], hue: 'accent' },
    { id: 'iot-smart-light', name: 'Smart light', desc: 'A Raspberry Pi serving a page that drives an LED over Wi-Fi.', icons: ['raspberrypi', 'python'], hue: 'green' },
];
function wrap(s, n) {
    const out = [''];
    for (const w of s.split(' ')) (out.at(-1) + ' ' + w).trim().length > n ? out.push(w) : (out[out.length - 1] = (out.at(-1) + ' ' + w).trim());
    return out;
}
function project(t, p) {
    const w = 420, h = 196, c = t[p.hue];
    const icons = p.icons.map((k, i) => `<g><rect x="${24 + i * 46}" y="24" width="38" height="38" rx="11" fill="${t.bg}" stroke="${t.line}"/>${icon(t, k, 24 + i * 46 + 9, 33, 20)}</g>`).join('');
    const lines = wrap(p.desc, 46).map((l, i) => T(24, 132 + i * 20, l, { size: 13.5, fill: t.muted })).join('');
    return doc(t, w, h, `${p.name}: ${p.desc}`, `
<rect x="1" y="1" width="${w - 2}" height="4" rx="2" fill="${c}" opacity=".9"/>
<g class="in">${icons}
${T(w - 24, 48, '↗', { size: 18, fill: t.faint, anchor: 'end' })}
${T(24, 100, p.name, { size: 18, weight: 700, fill: t.text, ls: -0.3 })}
${lines}</g>`);
}

// ---- activity: headline numbers, 30-day line, year heatmap ----
function activity(t) {
    const nums = [
        [fmt(total), 'commits, last 12 months'],
        [`${current}`, `day streak${current === longest ? ' · my longest' : ` · best ${longest}`}`],
        [`${activeDays}`, 'days I shipped'],
    ];
    const head = nums.map(([v, l], i) => {
        const x = 32 + i * 190;
        return `<g class="in" style="animation-delay:${i * 80}ms">${T(x, 74, v, { size: 34, weight: 800, fill: i === 0 ? t.accent : t.text, ls: -1 })}${T(x, 96, l, { size: 12, fill: t.muted })}</g>`;
    }).join('') + nums.slice(1).map((_, i) => `<line x1="${32 + (i + 1) * 190 - 18}" x2="${32 + (i + 1) * 190 - 18}" y1="46" y2="100" stroke="${t.line}"/>`).join('');

    // 30-day sparkline, top right
    const sx0 = W - 32 - 220, sx1 = W - 32, sy0 = 46, sy1 = 92;
    const m = Math.max(1, ...last30.map(d => d.count));
    const pts = last30.map((d, i) => [sx0 + (i / 29) * (sx1 - sx0), sy1 - (d.count / m) * (sy1 - sy0)]);
    let path = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) { const [px, py] = pts[i - 1], [x, y] = pts[i], cx = ((px + x) / 2).toFixed(1); path += ` C${cx},${py.toFixed(1)} ${cx},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`; }
    const spark = `<defs><linearGradient id="sa" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}" stop-opacity=".28"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></linearGradient></defs>
<path d="${path} L${sx1},${sy1} L${sx0},${sy1} Z" fill="url(#sa)"/><path class="draw" d="${path}" fill="none" stroke="${t.accent}" stroke-width="2" stroke-linecap="round"/>
<circle cx="${pts.at(-1)[0]}" cy="${pts.at(-1)[1]}" r="3.5" fill="${t.green}"/>
${T(sx1, 110, `${fmt(total30)} in the last 30 days`, { size: 12, fill: t.muted, anchor: 'end' })}`;

    // heatmap
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    const nz = days.map(d => d.count).filter(Boolean).sort((a, b) => a - b);
    const q = p => nz[Math.floor(p * (nz.length - 1))] || 1;
    const cuts = [q(0.25), q(0.5), q(0.8)];
    const lvl = c => (c === 0 ? 0 : c <= cuts[0] ? 1 : c <= cuts[1] ? 2 : c <= cuts[2] ? 3 : 4);
    const x0 = 58, y0 = 168, cell = Math.floor((W - 32 - x0) / weeks.length) - 3, g = 3;
    let cells = '', months = '', lastM = -1;
    weeks.forEach((wk, wi) => {
        wk.forEach((d, di) => { cells += `<rect x="${x0 + wi * (cell + g)}" y="${y0 + di * (cell + g)}" width="${cell}" height="${cell}" rx="2.5" fill="${t.scale[lvl(d.count)]}"><title>${d.count} commits · ${d.date}</title></rect>`; });
        const mo = new Date(wk[0].date + 'T00:00:00Z').getUTCMonth();
        if (mo !== lastM && wi < weeks.length - 2) { months += T(x0 + wi * (cell + g), y0 - 10, new Date(Date.UTC(2000, mo, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), { size: 11, fill: t.muted }); lastM = mo; }
    });
    const dows = ['Mon', 'Wed', 'Fri'].map((l, i) => T(x0 - 10, y0 + (1 + i * 2) * (cell + g) + cell - 2, l, { size: 10, fill: t.faint, anchor: 'end' })).join('');
    const ly = y0 + 7 * (cell + g) + 22;
    const lx = W - 32 - 5 * (cell + 4) + 4;
    const legend = t.scale.map((c, i) => `<rect x="${lx + i * (cell + 4)}" y="${ly - cell + 2}" width="${cell}" height="${cell}" rx="2.5" fill="${c}"/>`).join('');
    const h = ly + 30;
    return doc(t, W, h, `${fmt(total)} commits in the last 12 months, ${current}-day streak, ${activeDays} active days, ${fmt(total30)} in the last 30 days`, `
${head}${spark}
<line x1="32" x2="${W - 32}" y1="128" y2="128" stroke="${t.line}"/>
<g class="in" style="animation-delay:.3s">${months}${dows}${cells}</g>
${T(x0, ly, `Counted from my own git history, private work included · updated ${fmtDate(today.toISOString().slice(0, 10))}`, { size: 11, fill: t.faint })}
${T(lx - 8, ly, 'less', { size: 11, fill: t.faint, anchor: 'end' })}${legend}${T(W - 32 + 2, ly, '', { fill: t.faint })}`);
}

function label(t, s, note) {
    return doc(t, W, 46, s, `${T(4, 32, s, { size: 20, weight: 800, fill: t.text, ls: -0.4 })}${note ? T(W - 4, 32, note, { size: 12, fill: t.muted, anchor: 'end' }) : ''}`, { bare: true });
}

mkdirSync('assets', { recursive: true });
for (const f of readdirSync('assets')) if (f.endsWith('.svg')) writeFileSync(`assets/${f}`, ''), execFileSync('rm', [`assets/${f}`]);
for (const [name, t] of Object.entries(THEMES)) {
    const out = (f, s) => writeFileSync(`assets/${f}-${name}.svg`, s);
    out('hero', hero(t)); out('stack', stack(t)); out('activity', activity(t));
    out('label-stack', label(t, 'Tools')); out('label-projects', label(t, 'Things I built', 'outside work'));
    out('label-activity', label(t, 'How often I ship'));
    for (const p of PROJECTS) out(`project-${p.id}`, project(t, p));
}
console.log(`repos ${perRepoActive.size}, year ${total}, 30d ${total30}, streak ${current}/${longest}`);
