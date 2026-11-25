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
const fmt = n => n.toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtDate = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const THEMES = {
    dark: { card: '#0f1420', tile: '#141b2a', border: '#253047', text: '#e8edf7', muted: '#8a96ad', accent: '#4f7cff', accent2: '#1bd968', scale: ['#1a2233', '#173070', '#1d4ceb', '#4f7cff', '#a9c0ff'] },
    light: { card: '#ffffff', tile: '#f5f7fb', border: '#dde3ee', text: '#141a26', muted: '#5f6b80', accent: '#1d4ceb', accent2: '#0f9d58', scale: ['#edf0f6', '#c9d6fb', '#83a1f6', '#3c66ee', '#1a3db8'] },
};
const FONT = `font-family="'Segoe UI', Inter, -apple-system, Helvetica, Arial, sans-serif"`;
const MONO = `font-family="'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace"`;
const W = 840;
const STYLE = `<style>.f{animation:f .7s ease-out both}@keyframes f{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.f{animation:none}}</style>`;

function svg(t, w, h, title, body, { glow = false } = {}) {
    const defs = glow
        ? `<defs><radialGradient id="g1" cx="0.92" cy="0" r="0.8"><stop offset="0" stop-color="${t.accent}" stop-opacity=".35"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></radialGradient><radialGradient id="g2" cx="0" cy="1" r="0.7"><stop offset="0" stop-color="${t.accent2}" stop-opacity=".16"/><stop offset="1" stop-color="${t.accent2}" stop-opacity="0"/></radialGradient></defs>`
        : '';
    const wash = glow ? `<rect width="${w}" height="${h}" rx="16" fill="url(#g1)"/><rect width="${w}" height="${h}" rx="16" fill="url(#g2)"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${STYLE}${defs}
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="16" fill="${t.card}" stroke="${t.border}"/>${wash}
${body}</svg>`;
}
const text = (x, y, s, { size = 14, weight = 400, fill, anchor = 'start', mono = false, extra = '' } = {}) =>
    `<text x="${x}" y="${y}" ${mono ? MONO : FONT} font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" ${extra}>${esc(s)}</text>`;
function pill(t, x, y, label, { accent = false } = {}) {
    const w = Math.round(label.length * 7.2 + 24);
    return { w, s: `<rect x="${x}" y="${y}" width="${w}" height="28" rx="14" fill="${accent ? t.accent : t.tile}" fill-opacity="${accent ? 0.14 : 1}" stroke="${accent ? t.accent : t.border}" stroke-opacity="${accent ? 0.5 : 1}"/>${text(x + w / 2, y + 18.5, label, { size: 12.5, fill: accent ? t.accent : t.text, anchor: 'middle', weight: accent ? 600 : 500 })}` };
}

function hero(t) {
    const h = 230;
    const status = `<g class="f" style="animation-delay:.4s"><circle cx="48" cy="190" r="5" fill="${t.accent2}"><animate attributeName="opacity" values="1;.35;1" dur="2.4s" repeatCount="indefinite"/></circle>${text(62, 194.5, 'Shipping a sports & social platform · web, consoles, SSR', { size: 13, fill: t.muted })}</g>`;
    return svg(t, W, h, "Hi, I'm Mustafa. Full-stack developer from Sarajevo building fast, real-time web apps.", `
<g class="f">${text(40, 62, "HI, I'M", { size: 13, weight: 700, fill: t.accent, extra: 'letter-spacing="3"' })}
${text(38, 112, 'Mustafa Sinanović', { size: 46, weight: 800, fill: t.text })}
${text(40, 148, 'Full-stack developer · Sarajevo, Bosnia and Herzegovina', { size: 17, fill: t.muted })}</g>
${status}
<g class="f" style="animation-delay:.2s" transform="translate(${W - 210} 46)">
<rect width="170" height="132" rx="14" fill="${t.tile}" stroke="${t.border}"/>
${text(16, 30, '~/mustafa', { size: 12, fill: t.muted, mono: true })}
${text(16, 58, '$ ship --daily', { size: 13, fill: t.text, mono: true })}
${text(16, 82, `✓ ${fmt(total)} commits`, { size: 13, fill: t.accent2, mono: true })}
${text(16, 106, `✓ ${current}-day streak`, { size: 13, fill: t.accent2, mono: true })}
</g>`, { glow: true });
}

function about(t) {
    const rows = [
        ['now', 'Building the web app and admin, ads and compliance consoles of a sports & social platform'],
        ['focus', 'Angular (signals, SSR), real-time features, analytics, polished UI that matches the design'],
        ['backend', 'Node.js, TypeScript, AWS (AppSync, Lambda, DynamoDB, CloudFront, Amplify)'],
        ['side', 'Car rental tracker, a Quran app, ML price prediction for real estate in BiH'],
        ['style', 'Small focused commits, typed code, shipping to dev every day'],
    ];
    const h = 64 + rows.length * 34 + 16;
    const body = rows.map(([k, v], i) => `<g class="f" style="animation-delay:${i * 70}ms">${text(32, 72 + i * 34, k, { size: 13, weight: 600, fill: t.accent, mono: true })}${text(120, 72 + i * 34, v, { size: 14, fill: t.text })}</g>`).join('');
    return svg(t, W, h, rows.map(r => `${r[0]}: ${r[1]}`).join('. '), `${text(32, 38, 'whoami', { size: 16, weight: 700, fill: t.text, mono: true })}${body}`);
}

function stack(t) {
    const groups = [
        ['Frontend', ['Angular', 'TypeScript', 'React', 'RxJS', 'SCSS', 'Tailwind', 'Vite'], true],
        ['Backend', ['Node.js', 'Express', 'GraphQL', 'AppSync', 'Python'], false],
        ['Data & cloud', ['AWS', 'DynamoDB', 'PostgreSQL', 'MongoDB', 'Docker'], false],
        ['Quality', ['Vitest', 'Jasmine', 'Playwright', 'ESLint', 'Sentry'], false],
    ];
    let y = 62, body = '';
    groups.forEach(([label, items, accent], gi) => {
        body += `<g class="f" style="animation-delay:${gi * 80}ms">${text(32, y + 19, label, { size: 13, weight: 600, fill: t.muted })}`;
        let x = 150;
        for (const it of items) { const p = pill(t, x, y, it, { accent }); body += p.s; x += p.w + 8; }
        body += '</g>';
        y += 42;
    });
    return svg(t, W, y + 14, 'Stack: ' + groups.map(g => g[1].join(', ')).join('; '), `${text(32, 38, 'Stack', { size: 16, weight: 700, fill: t.text })}${body}`);
}

function stats(t) {
    const tiles = [
        [fmt(total), 'commits · last 12 months', true],
        [`${current} ${current === 1 ? 'day' : 'days'}`, 'current streak'],
        [`${longest} days`, 'longest streak'],
        [`${activeDays}`, 'active days'],
        [fmt(total30), 'commits · last 30 days'],
        [fmt(best.count), `best day · ${fmtDate(best.date)}`],
        [`${Math.round(total / Math.max(1, activeDays))}`, 'commits per active day'],
        [`${perRepoActive.size}`, 'projects shipped to'],
    ];
    const cols = 4, gap = 12, tw = (W - 64 - (cols - 1) * gap) / cols, th = 78;
    const body = tiles.map(([v, l, hl], i) => {
        const x = 32 + (i % cols) * (tw + gap), y = 58 + Math.floor(i / cols) * (th + gap);
        return `<g class="f" style="animation-delay:${i * 60}ms"><rect x="${x}" y="${y}" width="${tw}" height="${th}" rx="12" fill="${t.tile}" stroke="${t.border}"/>${text(x + 16, y + 38, v, { size: 26, weight: 800, fill: hl ? t.accent : t.text })}${text(x + 16, y + 60, l, { size: 12, fill: t.muted })}</g>`;
    }).join('');
    return svg(t, W, 58 + 2 * th + gap + 28, `${fmt(total)} commits in the last 12 months, current streak ${current} days, longest ${longest} days`,
        `${text(32, 38, 'Activity', { size: 16, weight: 700, fill: t.text })}${text(W - 32, 38, `${weekdayShare}% on weekdays · from local git, redrawn daily`, { size: 12, fill: t.muted, anchor: 'end' })}${body}`);
}

function heatmap(t) {
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    const nonzero = days.map(d => d.count).filter(Boolean).sort((a, b) => a - b);
    const q = p => nonzero[Math.floor(p * (nonzero.length - 1))] || 1;
    const cuts = [q(0.25), q(0.5), q(0.8)];
    const level = c => (c === 0 ? 0 : c <= cuts[0] ? 1 : c <= cuts[1] ? 2 : c <= cuts[2] ? 3 : 4);
    const cell = 11, gap = 3, x0 = 64, y0 = 74;
    let cells = '', months = '', lastMonth = -1;
    weeks.forEach((w, wi) => {
        w.forEach((d, di) => {
            cells += `<rect x="${x0 + wi * (cell + gap)}" y="${y0 + di * (cell + gap)}" width="${cell}" height="${cell}" rx="2.5" fill="${t.scale[level(d.count)]}"><title>${d.count} commits on ${d.date}</title></rect>`;
        });
        const m = new Date(w[0].date + 'T00:00:00Z').getUTCMonth();
        if (m !== lastMonth && wi < weeks.length - 2) {
            months += text(x0 + wi * (cell + gap), y0 - 10, new Date(Date.UTC(2000, m, 1)).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }), { size: 11, fill: t.muted });
            lastMonth = m;
        }
    });
    const dows = ['Mon', 'Wed', 'Fri'].map((l, i) => text(x0 - 10, y0 + (1 + i * 2) * (cell + gap) + 9, l, { size: 10, fill: t.muted, anchor: 'end' })).join('');
    const h = y0 + 7 * (cell + gap) + 44;
    const lx = W - 32 - 5 * (cell + 4);
    const legend = t.scale.map((c, i) => `<rect x="${lx + i * (cell + 4)}" y="${h - 32}" width="${cell}" height="${cell}" rx="2.5" fill="${c}"/>`).join('');
    return svg(t, W, h, `${fmt(total)} commits in the last year`, `${text(32, 38, `${fmt(total)} commits in the last year`, { size: 16, weight: 700, fill: t.text })}
<g class="f">${months}${dows}${cells}</g>${text(lx - 8, h - 22, 'Less', { size: 11, fill: t.muted, anchor: 'end' })}${legend}${text(W - 32 + 2, h - 22, '', { size: 11, fill: t.muted })}
${text(x0, h - 22, `Updated ${fmtDate(today.toISOString().slice(0, 10))}`, { size: 11, fill: t.muted })}`);
}

function line(t) {
    const h = 210, x0 = 32, x1 = W - 32, y0 = 66, y1 = h - 38;
    const max = Math.max(1, ...last30.map(d => d.count));
    const pts = last30.map((d, i) => [x0 + (i / (last30.length - 1)) * (x1 - x0), y1 - (d.count / max) * (y1 - y0)]);
    // Smooth curve through the points.
    let path = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
        const [px, py] = pts[i - 1], [x, y] = pts[i], cx = (px + x) / 2;
        path += ` C${cx.toFixed(1)},${py.toFixed(1)} ${cx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
    }
    const peak = pts.reduce((m, p, i) => (last30[i].count > last30[m].count ? i : m), 0);
    return svg(t, W, h, `${fmt(total30)} commits in the last 30 days`, `<defs><linearGradient id="a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.accent}" stop-opacity=".32"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></linearGradient></defs>
${text(32, 38, `${fmt(total30)} commits in the last 30 days`, { size: 16, weight: 700, fill: t.text })}
${[0.5, 1].map(f => `<line x1="${x0}" x2="${x1}" y1="${y1 - f * (y1 - y0)}" y2="${y1 - f * (y1 - y0)}" stroke="${t.border}" stroke-dasharray="3 5"/>`).join('')}
<line x1="${x0}" y1="${y1}" x2="${x1}" y2="${y1}" stroke="${t.border}"/>
<g class="f"><path d="${path} L${x1},${y1} L${x0},${y1} Z" fill="url(#a)"/><path d="${path}" fill="none" stroke="${t.accent}" stroke-width="2.5" stroke-linecap="round"/>
<circle cx="${pts[peak][0]}" cy="${pts[peak][1]}" r="5" fill="${t.card}" stroke="${t.accent}" stroke-width="2.5"/>
${text(Math.min(pts[peak][0], x1 - 60), pts[peak][1] - 12, `${last30[peak].count} · ${fmtDate(last30[peak].date)}`, { size: 11, weight: 600, fill: t.text, anchor: 'middle' })}</g>
${text(x0, h - 14, fmtDate(last30[0].date), { size: 11, fill: t.muted })}${text(x1, h - 14, fmtDate(last30.at(-1).date), { size: 11, fill: t.muted, anchor: 'end' })}`);
}

const PROJECTS = [
    { id: 'techstars', name: 'Real estate prices · BiH', desc: ['Price prediction for apartments in Bosnia', 'and Herzegovina, from scraped listings to a model.'], tags: ['TypeScript', 'ML', 'Scraping'] },
    { id: 'price-predictor-app', name: 'Price predictor', desc: ['Notebook pipeline: cleaning, features,', 'training and evaluating the price model.'], tags: ['Python', 'Jupyter', 'scikit-learn'] },
    { id: 'chat-app', name: 'Real-time chat', desc: ['Instant messaging with rooms and presence,', 'React client and a Socket.IO server.'], tags: ['React', 'Node.js', 'Socket.IO'] },
    { id: 'iot-smart-light', name: 'IoT smart light', desc: ['A Raspberry Pi web server that switches and', 'blinks an LED from any browser on Wi-Fi.'], tags: ['Raspberry Pi', 'Python', 'IoT'] },
];
function project(t, p) {
    const w = 412, h = 164;
    let x = 24, tags = '';
    for (const tg of p.tags) { const pl = pill(t, x, h - 46, tg); tags += pl.s; x += pl.w + 6; }
    return svg(t, w, h, `${p.name}: ${p.desc.join(' ')}`, `<g class="f">
<rect x="24" y="24" width="36" height="36" rx="10" fill="${t.accent}" fill-opacity=".14" stroke="${t.accent}" stroke-opacity=".45"/>
${text(42, 48, p.name[0], { size: 17, weight: 800, fill: t.accent, anchor: 'middle' })}
${text(72, 40, p.name, { size: 16, weight: 700, fill: t.text })}${text(72, 57, `musss2003/${p.id}`, { size: 11.5, fill: t.muted, mono: true })}
${text(w - 24, 44, '↗', { size: 18, fill: t.muted, anchor: 'end' })}
${text(24, 88, p.desc[0], { size: 13, fill: t.text })}${text(24, 106, p.desc[1], { size: 13, fill: t.text })}${tags}</g>`);
}

function label(t, s) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="44" viewBox="0 0 ${W} 44" role="img" aria-label="${esc(s)}"><title>${esc(s)}</title>
<rect x="0" y="20" width="4" height="18" rx="2" fill="${t.accent}"/>${text(14, 35, s, { size: 18, weight: 700, fill: t.text })}<line x1="${14 + s.length * 10 + 16}" x2="${W}" y1="29" y2="29" stroke="${t.border}"/></svg>`;
}

mkdirSync('assets', { recursive: true });
for (const [name, t] of Object.entries(THEMES)) {
    const out = (f, s) => writeFileSync(`assets/${f}-${name}.svg`, s);
    out('hero', hero(t)); out('about', about(t)); out('stack', stack(t));
    out('stats', stats(t)); out('heatmap', heatmap(t)); out('line', line(t));
    out('label-projects', label(t, 'What I build')); out('label-activity', label(t, 'Activity'));
    for (const p of PROJECTS) out(`project-${p.id}`, project(t, p));
}
console.log(`repos ${perRepoActive.size}, year ${total}, 30d ${total30}, streak ${current}/${longest}`);
