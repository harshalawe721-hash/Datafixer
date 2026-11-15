// Renders pins.json -> images/pin-XX.png (1000x1500, Pinterest 2:3) + pins.csv
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SITE = 'mydatafixer.com', LINK = 'https://mydatafixer.com';
const pins = JSON.parse(fs.readFileSync(path.join(__dirname, 'pins.json'), 'utf8'));

const THEMES = {
  navy:   { bg:'#0F1B3D', bg2:'#1B2B5C', fg:'#FFFFFF', muted:'#B8C3E6', accent:'#2DD4BF', card:'#FFFFFF', cardFg:'#0F1B3D', pill:'#2DD4BF', pillFg:'#0F1B3D' },
  teal:   { bg:'#0D9488', bg2:'#14B8A6', fg:'#FFFFFF', muted:'#D5F5F0', accent:'#FDE68A', card:'#FFFFFF', cardFg:'#0F1B3D', pill:'#0F1B3D', pillFg:'#FFFFFF' },
  cream:  { bg:'#FFF8EC', bg2:'#FDEBCB', fg:'#0F1B3D', muted:'#4A5578', accent:'#0D9488', card:'#FFFFFF', cardFg:'#0F1B3D', pill:'#0F1B3D', pillFg:'#FFFFFF' },
  amber:  { bg:'#F59E0B', bg2:'#FBBF24', fg:'#1A1205', muted:'#4A3510', accent:'#0F1B3D', card:'#FFFFFF', cardFg:'#0F1B3D', pill:'#0F1B3D', pillFg:'#FFFFFF' },
  purple: { bg:'#3B1F7A', bg2:'#5B34B0', fg:'#FFFFFF', muted:'#D9CCF7', accent:'#FBBF24', card:'#FFFFFF', cardFg:'#0F1B3D', pill:'#FBBF24', pillFg:'#1A1205' },
};
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const vis = s => esc(s).replace(/^ +| +$/g, m => '<span class="sp">'+'·'.repeat(m.length)+'</span>');

const logo = t => `<div class="logo"><div class="mark"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="${t.pillFg}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 10v10"/><path d="M12.5 15.5l2 2 4-4"/></svg></div><span>MyData<b>Fixer</b></span></div>`;

function table(cols, rows, bad, kind) {
  const isBad = (r,c) => bad && bad.some(([a,b]) => a===r && b===c);
  return `<table class="tbl ${kind}"><thead><tr>${cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r,i)=>`<tr>${r.map((v,j)=>`<td class="${kind==='before'&&isBad(i,j)?'bad':''}${kind==='after'&&String(v).startsWith('⚠')?' warn':''}">${kind==='before'?vis(v):esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function body(p, t) {
  switch (p.type) {
    case 'hero': return `<div class="hero">
      <h1>${esc(p.title)}</h1><p class="sub">${esc(p.sub)}</p>
      <div class="mock"><div class="mbar"><i></i><i></i><i></i><span>${esc(p.file||'customers.csv')}</span></div>
        <div class="mrow"><span class="dot r"></span>Duplicate rows<b>Fixed</b></div>
        <div class="mrow"><span class="dot r"></span>Extra spaces<b>Fixed</b></div>
        <div class="mrow"><span class="dot r"></span>Mixed date formats<b>Fixed</b></div>
        <div class="mrow"><span class="dot r"></span>Missing values<b>Flagged</b></div>
        <div class="mprog"><div></div></div><div class="mdone">✓ Your clean file is ready</div></div></div>`;
    case 'steps': return `<h1>${esc(p.title)}</h1><div class="steps">${p.steps.map(([a,b],i)=>`<div class="step"><div class="num">${i+1}</div><div><h3>${esc(a)}</h3><p>${esc(b)}</p></div></div>`).join('<div class="conn"></div>')}</div>`;
    case 'ba': return `<h1>${esc(p.title)}</h1><div class="ba">
      <div class="lab bad">✗ Before</div>${table(p.cols,p.before,p.bad,'before')}
      <div class="arrow">↓</div>
      <div class="lab good">✓ After MyDataFixer</div>${table(p.afterCols||p.cols,p.after,null,'after')}</div>`;
    case 'list': return `<h1>${esc(p.title)}</h1><div class="list ${p.items.length>6?'tight':''}">${p.items.map(it=>`<div class="li"><span class="ck">✓</span>${esc(it)}</div>`).join('')}</div>`;
    case 'problem': return `<div class="prob"><div class="q">“</div><h1 class="big">${esc(p.title)}</h1><div class="ans"><div class="anslab">The fix</div>${esc(p.answer)}</div></div>`;
    case 'tip': return `<h1>${esc(p.title)}</h1><div class="tip"><p>${esc(p.body)}</p><div class="fix"><span class="ck">✓</span>${esc(p.fix)}</div></div>`;
    case 'cta': return `<div class="hero cta"><h1 class="big">${esc(p.title)}</h1><p class="sub">${esc(p.sub)}</p>
      <div class="chips">${p.steps.map((s,i)=>`<div class="chip"><b>${i+1}</b>${esc(s)}</div>`).join('<span class="carr">→</span>')}</div>
      <div class="bigurl">${SITE}</div></div>`;
  }
}

function html(p, t, n) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:1000px;height:1500px;font-family:Inter,sans-serif;color:${t.fg};background:${t.bg};overflow:hidden;position:relative}
  .bgdeco{position:absolute;inset:0;background:radial-gradient(circle at 92% 6%, ${t.bg2} 0 230px, transparent 231px),radial-gradient(circle at 4% 96%, ${t.bg2} 0 170px, transparent 171px);opacity:.9}
  .wrap{position:relative;height:100%;padding:72px 76px 175px;display:flex;flex-direction:column}
  .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:48px}
  .logo{display:flex;align-items:center;gap:16px;font:600 34px 'Inter Display',Inter;letter-spacing:-.5px}
  .logo b{font-weight:800;color:${t.accent}}
  .mark{width:60px;height:60px;border-radius:16px;background:${t.pill};display:grid;place-items:center}
  .kicker{display:inline-block;align-self:flex-start;font:700 26px Inter;text-transform:uppercase;letter-spacing:2.5px;color:${t.accent};margin-bottom:26px}
  h1{font:800 72px/1.06 'Inter Display',Inter;letter-spacing:-2px;margin-bottom:38px;text-wrap:balance}
  h1.big{font-size:96px;letter-spacing:-3px}
  .main{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0;padding-bottom:20px}
  .sub{font:500 36px/1.4 Inter;color:${t.muted};margin-bottom:56px;text-wrap:pretty}
  .foot{position:relative;display:flex;justify-content:space-between;align-items:center;padding:34px 76px 70px}
  .url{font:700 38px 'Inter Display',Inter;letter-spacing:-.5px}
  .btn{background:${t.pill};color:${t.pillFg};font:800 32px Inter;padding:24px 40px;border-radius:999px}
  .card{background:${t.card};color:${t.cardFg};border-radius:28px;box-shadow:0 24px 60px rgba(0,0,0,.22)}
  /* mock */
  .mock{background:#fff;color:#0F1B3D;border-radius:28px;box-shadow:0 30px 70px rgba(0,0,0,.25);padding:0 0 34px;overflow:hidden}
  .mbar{background:#EEF1F7;padding:20px 26px;display:flex;align-items:center;gap:10px;font:600 26px 'JetBrains Mono';color:#4A5578}
  .mbar i{width:16px;height:16px;border-radius:50%;background:#CBD2E1}.mbar span{margin-left:14px}
  .mrow{display:flex;align-items:center;gap:20px;padding:22px 36px;font:600 32px Inter;border-bottom:2px solid #F1F3F8}
  .mrow b{margin-left:auto;color:#0D9488;font-size:28px;background:#DDF7F2;padding:8px 20px;border-radius:999px}
  .dot{width:16px;height:16px;border-radius:50%;background:#14B8A6}
  .mprog{margin:30px 36px 16px;height:18px;background:#EEF1F7;border-radius:9px;overflow:hidden}.mprog div{height:100%;width:100%;background:linear-gradient(90deg,#14B8A6,#2DD4BF)}
  .mdone{padding:0 36px;font:700 30px Inter;color:#0D9488}
  /* steps */
  .steps{display:flex;flex-direction:column}
  .step{display:flex;gap:34px;align-items:center;background:${t.card};color:${t.cardFg};border-radius:26px;padding:30px 36px;box-shadow:0 18px 44px rgba(0,0,0,.16)}
  .num{flex:none;width:92px;height:92px;border-radius:24px;background:${t.pill};color:${t.pillFg};font:800 50px 'Inter Display';display:grid;place-items:center}
  .step h3{font:800 44px 'Inter Display';letter-spacing:-1px;margin-bottom:6px}.step p{font:500 30px/1.3 Inter;color:#4A5578}
  .conn{width:6px;height:30px;margin-left:79px;background:${t.accent};border-radius:3px}
  /* before after */
  .ba{display:flex;flex-direction:column}
  .lab{align-self:flex-start;font:800 28px Inter;padding:10px 24px;border-radius:999px;margin-bottom:14px}
  .lab.bad{background:#FEE2E2;color:#B91C1C}.lab.good{background:#D1FAE5;color:#047857}
  .tbl{width:100%;border-collapse:separate;border-spacing:0;background:#fff;color:#0F1B3D;border-radius:22px;overflow:hidden;box-shadow:0 16px 40px rgba(0,0,0,.18);font:500 30px 'JetBrains Mono'}
  .tbl th{background:#EEF1F7;text-align:left;padding:13px 28px;font:700 24px Inter;text-transform:uppercase;letter-spacing:1.5px;color:#4A5578}
  .tbl td{padding:12px 28px;border-top:2px solid #F1F3F8;white-space:pre}
  .tbl td.bad{background:#FEF2F2;color:#B91C1C}.tbl td .sp{color:#F87171}
  .tbl.after td{color:#065F46}.tbl td.warn{color:#B45309;background:#FFFBEB}
  .arrow{align-self:center;font:800 56px Inter;color:${t.accent};margin:6px 0 2px;line-height:1}
  /* list */
  .list{display:flex;flex-direction:column;gap:22px}.list.tight{gap:16px}
  .li{display:flex;align-items:center;gap:26px;background:${t.card};color:${t.cardFg};border-radius:22px;padding:26px 32px;font:700 38px Inter;box-shadow:0 14px 34px rgba(0,0,0,.14)}
  .list.tight .li{padding:20px 30px;font-size:35px}
  .ck{flex:none;width:52px;height:52px;border-radius:50%;background:#14B8A6;color:#fff;display:grid;place-items:center;font:800 30px Inter}
  /* problem */
  .prob{display:flex;flex-direction:column;justify-content:center}
  .q{font:800 240px/0.7 'Inter Display';color:${t.accent};height:120px}
  .ans{background:${t.card};color:${t.cardFg};border-radius:28px;padding:40px 44px;font:600 38px/1.4 Inter;box-shadow:0 24px 60px rgba(0,0,0,.2)}
  .anslab{font:800 24px Inter;text-transform:uppercase;letter-spacing:2px;color:#0D9488;margin-bottom:12px}
  /* tip */
  .tip{background:${t.card};color:${t.cardFg};border-radius:28px;padding:48px 48px;box-shadow:0 24px 60px rgba(0,0,0,.2)}
  .tip p{font:500 40px/1.45 Inter;margin-bottom:40px}
  .fix{display:flex;gap:24px;align-items:flex-start;background:#DDF7F2;border-radius:20px;padding:30px;font:700 36px/1.35 Inter;color:#065F46}
  /* cta */
  .cta{display:flex;flex-direction:column;justify-content:center}
  .chips{display:flex;align-items:center;gap:14px;margin-bottom:70px}
  .chip{background:${t.card};color:${t.cardFg};border-radius:999px;padding:18px 26px 18px 18px;font:800 32px Inter;display:flex;gap:16px;align-items:center}
  .chip b{width:50px;height:50px;border-radius:50%;background:#0F1B3D;color:#fff;display:grid;place-items:center;font-size:28px}
  .carr{font:800 44px Inter;color:${t.accent}}
  .bigurl{font:800 76px 'Inter Display';letter-spacing:-2px;background:${t.pill};color:${t.pillFg};align-self:flex-start;padding:26px 44px;border-radius:26px}
  </style></head><body><div class="bgdeco"></div>
  <div class="wrap"><div class="top">${logo(t)}</div>
  <div class="main"><div class="kicker">${esc(p.kicker)}</div>${body(p,t)}</div></div>
  <div class="foot" style="position:absolute;left:0;right:0;bottom:0"><div class="url">${SITE}</div><div class="btn">${p.type==='cta'?'Start now →':'Try it →'}</div></div>
  </body></html>`;
}

(async () => {
  const out = path.join(__dirname, 'images'); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 1500 }, deviceScaleFactor: 1 });
  const csv = [['Title','Media URL','Pinterest board','Thumbnail','Description','Link','Publish date','Keywords']];
  const overflow = [];
  for (let i = 0; i < pins.length; i++) {
    const p = pins[i], t = THEMES[p.theme], n = String(i+1).padStart(2,'0');
    await page.setContent(html(p, t, n));
    await page.evaluate(() => document.fonts.ready);
    const ov = await page.evaluate(() => { const m=document.querySelector('.main').getBoundingClientRect(); const f=document.querySelector('.foot').getBoundingClientRect(); let maxB=0; document.querySelectorAll('.main *').forEach(e=>{maxB=Math.max(maxB,e.getBoundingClientRect().bottom)}); return maxB > f.top - 10 ? Math.round(maxB - f.top) : 0; });
    if (ov) overflow.push(`pin-${n}: +${ov}px`);
    await page.screenshot({ path: path.join(out, `pin-${n}.png`) });
    const desc = `${p.desc} Try it at ${SITE} ${p.tags.map(x=>'#'+x).join(' ')}`;
    csv.push([p.title, `<upload-url>/pin-${n}.png`, 'MyDataFixer – Data Cleaning Tips', '', desc, LINK, '', p.tags.join(',')]);
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'pins.csv'), csv.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n') + '\n');
  console.log('rendered', pins.length, overflow.length ? 'OVERFLOW: ' + overflow.join(', ') : 'no overflow');
})();
