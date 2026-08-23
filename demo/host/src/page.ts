export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amazoff support &middot; Wingman demo</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif;
       background:#08090c;color:#e8eaed}
  header{padding:18px 26px;border-bottom:1px solid #1c1f26;display:flex;align-items:center;gap:14px}
  header h1{font-size:15px;margin:0;font-weight:600;letter-spacing:.2px}
  header .sub{color:#7d848f;font-size:13px}
  header button{margin-left:auto;background:#16181e;color:#c9ced6;border:1px solid #262a33;
       border-radius:7px;padding:7px 13px;font-size:13px;cursor:pointer}
  header button:hover{background:#1d2027}
  main{display:grid;grid-template-columns:1fr 420px;height:calc(100vh - 61px)}
  .pane{padding:22px 26px;overflow-y:auto}
  .pane+.pane{border-left:1px solid #1c1f26;background:#0a0b0f}
  .label{font-size:11px;letter-spacing:.09em;text-transform:uppercase;color:#6b7280;margin:0 0 12px}

  .order{border:1px solid #23262e;border-radius:11px;padding:14px 16px;margin-bottom:20px;background:#0e1015}
  .order .row{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
  .order .id{font-weight:600}
  .order .sum{color:#8b929c;font-size:13px;margin-top:3px}
  .order .date{font-variant-numeric:tabular-nums}
  .pill{font-size:11px;font-weight:600;letter-spacing:.05em;padding:3px 9px;border-radius:20px}
  .PLACED,.IN_TRANSIT{background:#0f2e1c;color:#4ade80;border:1px solid #1c5334}
  .CANCELLED{background:#331416;color:#f87171;border:1px solid #5b2124}
  .DELIVERED{background:#16181e;color:#9ca3af;border:1px solid #262a33}

  .msg{margin:0 0 12px;display:flex}
  .msg.customer{justify-content:flex-end}
  .bubble{max-width:78%;padding:10px 14px;border-radius:14px;white-space:pre-wrap}
  .customer .bubble{background:#1d4ed8;color:#fff;border-bottom-right-radius:5px}
  .agent .bubble{background:#15181e;border:1px solid #23262e;border-bottom-left-radius:5px}
  .bubble.superseded{opacity:.4;text-decoration:line-through}
  .tool{display:block;font-size:11px;color:#79808b;margin-top:6px;font-family:ui-monospace,SFMono-Regular,monospace}
  .customer .tool{color:#bcd0ff}
  .strike-note{font-size:11px;color:#f59e0b;margin:-6px 0 12px;text-align:left}

  form{display:flex;gap:9px;margin-top:18px;position:sticky;bottom:0;background:#08090c;padding-top:10px}
  input{flex:1;background:#101318;border:1px solid #262a33;border-radius:9px;padding:11px 13px;
        color:#e8eaed;font-size:14px}
  input:focus{outline:none;border-color:#3b82f6}
  form button{background:#2563eb;border:0;color:#fff;border-radius:9px;padding:11px 18px;font-size:14px;
        font-weight:500;cursor:pointer}

  .ev{border:1px solid #23262e;border-left-width:3px;border-radius:9px;padding:12px 14px;margin-bottom:11px;background:#0e1015}
  .ev.FIX{border-left-color:#f59e0b}
  .ev.ALERT{border-left-color:#a855f7}
  .ev.PERSONALIZE{border-left-color:#22d3ee}
  .ev .lane{font-size:10px;font-weight:700;letter-spacing:.1em}
  .ev.FIX .lane{color:#f59e0b}
  .ev.ALERT .lane{color:#a855f7}
  .ev.PERSONALIZE .lane{color:#22d3ee}
  .ev h4{margin:5px 0 5px;font-size:13.5px;font-weight:600}
  .ev p{margin:0;color:#8b929c;font-size:12.5px}
  .diff{margin-top:9px;font-family:ui-monospace,SFMono-Regular,monospace;font-size:11.5px;
        background:#071a0f;border:1px solid #14432a;color:#86efac;border-radius:6px;padding:8px 10px;
        white-space:pre-wrap;word-break:break-word}
  .expect{border:1px dashed #2b3040;border-radius:9px;padding:11px 13px;margin-bottom:16px;
        font-size:12.5px;color:#9aa1ac}
  .expect code{color:#93c5fd;font-family:ui-monospace,SFMono-Regular,monospace}
  .empty{color:#5b626c;font-size:13px}
  .rules{margin-top:22px}
  .rule{font-size:12px;color:#8b929c;padding:7px 10px;border:1px solid #1e2229;border-radius:6px;
        margin-bottom:6px;font-family:ui-monospace,SFMono-Regular,monospace;word-break:break-word}
  .rule.added{border-color:#14432a;background:#071a0f;color:#86efac}
  .hint{color:#5b626c;font-size:12px;margin-top:10px}
  .hint b{color:#8b929c;font-weight:500}
</style>
</head>
<body>
<header>
  <h1>Amazoff</h1><span class="sub">Customer support</span>
  <button id="reset">Reset demo</button>
</header>
<main>
  <section class="pane">
    <p class="label">Your order</p>
    <div id="order"></div>
    <p class="label">Chat</p>
    <div id="chat"></div>
    <form id="f">
      <input id="q" autocomplete="off" placeholder="I need to reschedule my delivery to Friday" autofocus>
      <button>Send</button>
    </form>
    <p class="hint">Try: <b>I need to reschedule my delivery to Friday</b> &rarr; then <b>No, I said reschedule it, not cancel it</b></p>
  </section>
  <section class="pane">
    <p class="label">Wingman</p>
    <div id="expect"></div>
    <div id="events"></div>
    <div class="rules">
      <p class="label">Agent config &middot; rules</p>
      <div id="rules"></div>
    </div>
  </section>
</main>
<script>
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
let baseRules = null

function render(s) {
  if (baseRules === null) baseRules = s.rules.length
  const o = s.order
  document.getElementById('order').innerHTML = o ? \`
    <div class="order">
      <div class="row"><span class="id">\${esc(o.id)}</span><span class="pill \${o.status}">\${o.status.replace('_',' ')}</span></div>
      <div class="sum">\${esc(o.summary)}</div>
      <div class="row" style="margin-top:8px"><span class="sum">Delivery</span><span class="date">\${esc(o.deliveryDate)}</span></div>
    </div>\` : ''

  document.getElementById('chat').innerHTML = s.messages.map((m) => {
    const note = m.superseded ? '<p class="strike-note">Wingman replaced this turn</p>' : ''
    return \`<div class="msg \${m.role}"><div class="bubble\${m.superseded ? ' superseded' : ''}">\${esc(m.text)}\${
      m.tool ? \`<span class="tool">\${esc(m.tool)}()</span>\` : ''}</div></div>\${note}\`
  }).join('')

  document.getElementById('expect').innerHTML = s.expectation
    ? \`<div class="expect">Expected the agent to call <code>\${esc(s.expectation.tool || 'no tool')}</code><br>from &ldquo;\${esc(s.expectation.utterance)}&rdquo;</div>\`
    : ''

  document.getElementById('events').innerHTML = s.events.length
    ? s.events.map((e) => \`<div class="ev \${e.lane}">
        <div class="lane">\${e.lane}</div><h4>\${esc(e.headline)}</h4><p>\${esc(e.detail)}</p>
        \${e.ruleAdded ? \`<div class="diff">+ \${esc(e.ruleAdded)}</div>\` : ''}</div>\`).join('')
    : '<p class="empty">Watching. Nothing to report.</p>'

  const added = s.rules.length - baseRules
  document.getElementById('rules').innerHTML = s.rules
    .map((r, i) => \`<div class="rule\${i < added ? ' added' : ''}">\${esc(r)}</div>\`).join('')

  document.getElementById('chat').scrollIntoView({block:'end'})
}

async function post(path, body) {
  const r = await fetch(path, {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body||{})})
  render(await r.json())
}

document.getElementById('f').onsubmit = (e) => {
  e.preventDefault()
  const q = document.getElementById('q')
  if (!q.value.trim()) return
  const text = q.value; q.value = ''
  post('/api/chat', { text })
}
document.getElementById('reset').onclick = () => { baseRules = null; post('/api/reset') }
fetch('/api/state').then((r) => r.json()).then(render)
</script>
</body>
</html>`;
