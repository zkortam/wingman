export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amazoff.com Customer Service</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#eaeded;color:#0f1111;
    font:14px/1.5 "Amazon Ember",Arial,Helvetica,sans-serif}

  /* ---- Amazon chrome ---- */
  .nav{background:#131921;color:#fff;display:flex;align-items:center;gap:14px;padding:0 16px;height:60px}
  .logo{display:flex;flex-direction:column;padding:6px 8px;border:1px solid transparent;border-radius:3px;cursor:pointer}
  .logo:hover{border-color:#fff}
  .logo .word{font-size:23px;font-weight:700;letter-spacing:-.5px;line-height:.95}
  .logo .word span{color:#ff9900}
  .logo .tld{font-size:9px;color:#ccc;margin-left:1px}
  .searchbar{flex:1;display:flex;height:38px;border-radius:4px;overflow:hidden;max-width:820px}
  .searchbar select{border:0;background:#e6e6e6;font-size:12px;padding:0 8px;color:#0f1111}
  .searchbar input{flex:1;border:0;padding:0 10px;font-size:14px}
  .searchbar button{width:45px;border:0;background:#febd69;cursor:pointer;font-size:15px}
  .navitem{font-size:12px;color:#fff;cursor:pointer;padding:8px 6px;border:1px solid transparent;border-radius:3px;white-space:nowrap}
  .navitem:hover{border-color:#fff}
  .navitem b{display:block;font-size:13.5px}
  .cart{display:flex;align-items:flex-end;gap:3px;font-weight:700;font-size:13px}
  .cart .n{color:#f08804;font-size:16px;font-weight:700;margin-bottom:-2px}
  .subnav{background:#232f3e;color:#fff;display:flex;gap:6px;padding:0 16px;height:39px;align-items:center;font-size:14px}
  .subnav div{padding:6px 9px;border:1px solid transparent;border-radius:3px;cursor:pointer;white-space:nowrap}
  .subnav div:hover{border-color:#fff}
  .subnav .all{font-weight:700}
  .crumb{max-width:1500px;margin:0 auto;padding:14px 20px 0;font-size:13px;color:#565959}
  .crumb a{color:#007185;text-decoration:none}

  /* ---- layout ---- */
  .wrap{max-width:1500px;margin:0 auto;padding:12px 20px 40px;display:grid;
    grid-template-columns:minmax(0,1fr) 400px;gap:20px;align-items:start}
  h1{font-size:24px;margin:6px 0 16px;font-weight:700}
  .card{background:#fff;border:1px solid #d5d9d9;border-radius:8px;
    box-shadow:0 1px 2px rgba(15,17,17,.06)}
  .card+.card{margin-top:16px}
  .card>h2{font-size:17px;margin:0;padding:13px 18px;border-bottom:1px solid #e7e7e7;font-weight:700}

  /* ---- order ---- */
  .ordhead{display:flex;justify-content:space-between;gap:16px;padding:12px 18px;background:#f0f2f2;
    border-bottom:1px solid #d5d9d9;border-radius:8px 8px 0 0;font-size:12.5px;color:#565959}
  .ordhead b{display:block;color:#0f1111;font-size:13px}
  .ordbody{display:flex;gap:16px;padding:16px 18px;align-items:flex-start}
  .thumb{width:74px;height:74px;border-radius:6px;background:#f7f8f8;border:1px solid #e7e7e7;
    display:grid;place-items:center;font-size:32px;flex:none}
  .ordinfo{flex:1;min-width:0}
  .arriv{font-size:17px;font-weight:700;margin:0 0 3px}
  .arriv.bad{color:#b12704}
  .prod{color:#007185;font-size:14px;margin:0 0 8px}
  .status{font-size:13px;color:#565959}
  .badge{display:inline-block;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:11px;margin-left:6px}
  .b-ok{background:#e7f6ec;color:#067d3e;border:1px solid #b6e0c4}
  .b-bad{background:#fdecea;color:#b12704;border:1px solid #f5c6c0}

  /* ---- chat ---- */
  .chat{padding:16px 18px;min-height:210px;max-height:46vh;overflow-y:auto;background:#fff}
  .row{display:flex;margin-bottom:12px;gap:9px}
  .row.me{justify-content:flex-end}
  .av{width:28px;height:28px;border-radius:50%;flex:none;display:grid;place-items:center;
    font-size:12px;font-weight:700;background:#232f3e;color:#fff}
  .msg{max-width:74%;padding:9px 13px;border-radius:16px;font-size:14px;white-space:pre-wrap}
  .them{background:#f0f2f2;border-top-left-radius:4px}
  .me .msg{background:#007185;color:#fff;border-top-right-radius:4px}
  .msg.gone{opacity:.45;text-decoration:line-through}
  .tool{display:block;margin-top:6px;font:11.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:#565959}
  .fixnote{display:flex;gap:7px;align-items:center;font-size:12.5px;color:#8a6116;background:#fffbf2;
    border:1px solid #f2e2b8;border-radius:6px;padding:6px 10px;margin:-4px 0 12px 37px}
  .typing{display:flex;gap:9px;margin-bottom:12px}
  .dots{background:#f0f2f2;border-radius:16px;border-top-left-radius:4px;padding:13px 15px;display:flex;gap:4px}
  .dots i{width:6px;height:6px;border-radius:50%;background:#9b9b9b;animation:b 1.3s infinite}
  .dots i:nth-child(2){animation-delay:.18s}
  .dots i:nth-child(3){animation-delay:.36s}
  @keyframes b{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
  .waitnote{font-size:12px;color:#565959;margin:0 0 12px 37px}

  .composer{border-top:1px solid #e7e7e7;padding:13px 18px;display:flex;gap:9px;background:#fff;border-radius:0 0 8px 8px}
  .composer input{flex:1;height:40px;padding:0 12px;font-size:14px;border:1px solid #888c8c;border-radius:8px;
    box-shadow:inset 0 1px 2px rgba(15,17,17,.12)}
  .composer input:focus{outline:none;border-color:#007185;box-shadow:0 0 0 3px #c8f3fa}
  .composer button{min-width:92px;height:40px;border:1px solid #a88734;border-radius:8px;cursor:pointer;
    background:linear-gradient(#f7dfa5,#f0c14b);font-size:14px;font-weight:500;color:#0f1111}
  .composer button:hover{background:linear-gradient(#f5d78e,#eeb933)}
  .composer button:disabled,.composer input:disabled{opacity:.55;cursor:not-allowed}
  .try{padding:0 18px 14px;font-size:12.5px;color:#565959}
  .try b{color:#007185;font-weight:400;cursor:pointer;border-bottom:1px dotted #007185}

  /* ---- wingman rail ---- */
  .wm{background:#0d1117;border:1px solid #21262d;border-radius:8px;color:#e6edf3;overflow:hidden}
  .wm>h2{font-size:13px;padding:12px 16px;margin:0;border-bottom:1px solid #21262d;
    display:flex;align-items:center;gap:8px;letter-spacing:.02em}
  .wm>h2 .dot{width:7px;height:7px;border-radius:50%;background:#3fb950;box-shadow:0 0 7px #3fb950}
  .wm>h2 small{margin-left:auto;color:#7d8590;font-weight:400;font-size:11px}
  .wmbody{padding:14px 16px}
  .sec{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:#7d8590;margin:0 0 9px}
  .exp{border:1px dashed #30363d;border-radius:7px;padding:10px 12px;font-size:12.5px;color:#9aa4af;margin-bottom:16px}
  .exp code{color:#79c0ff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .exp .q{color:#e6edf3}
  .ev{border:1px solid #21262d;border-left:3px solid #d29922;border-radius:7px;padding:11px 13px;
    margin-bottom:10px;background:#11161d}
  .ev.ALERT{border-left-color:#a371f7}
  .ev.PERSONALIZE{border-left-color:#39c5cf}
  .ev .lane{font-size:9.5px;font-weight:700;letter-spacing:.12em;color:#d29922}
  .ev.ALERT .lane{color:#a371f7}
  .ev.PERSONALIZE .lane{color:#39c5cf}
  .ev h4{margin:5px 0;font-size:13px;font-weight:600}
  .ev p{margin:0;color:#8b949e;font-size:12px}
  .diff{margin-top:9px;font:11.5px ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b2a13;
    border:1px solid #1c5b2c;color:#7ee787;border-radius:6px;padding:8px 10px;white-space:pre-wrap;word-break:break-word}
  .idle{color:#6e7681;font-size:12.5px}
  .rule{font:11.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:#8b949e;border:1px solid #21262d;
    border-radius:6px;padding:8px 10px;margin-bottom:6px;word-break:break-word}
  .rule.new{border-color:#1c5b2c;background:#0b2a13;color:#7ee787}
  .reset{background:none;border:1px solid #30363d;color:#8b949e;border-radius:6px;padding:5px 10px;
    font-size:11.5px;cursor:pointer;margin-top:6px}
  .reset:hover{color:#e6edf3;border-color:#8b949e}
  @media(max-width:1100px){.wrap{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="nav">
  <div class="logo"><div class="word">amaz<span>off</span></div><div class="tld">.com</div></div>
  <div class="navitem">Deliver to Stevette<b>San Francisco 94107</b></div>
  <div class="searchbar">
    <select><option>All</option></select>
    <input placeholder="Search Amazoff" aria-label="Search">
    <button>&#128269;</button>
  </div>
  <div class="navitem">Returns<b>&amp; Orders</b></div>
  <div class="navitem cart"><span class="n">0</span> Cart</div>
</div>
<div class="subnav">
  <div class="all">&#9776; All</div><div>Today's Deals</div><div>Customer Service</div>
  <div>Registry</div><div>Gift Cards</div><div>Sell</div>
</div>
<div class="crumb"><a href="#">Your Account</a> &rsaquo; <a href="#">Your Orders</a> &rsaquo; Customer Service</div>

<div class="wrap">
  <main>
    <h1>Customer Service</h1>

    <section class="card" id="order"></section>

    <section class="card">
      <h2>Messaging assistant</h2>
      <div class="chat" id="chat"></div>
      <form class="composer" id="f">
        <input id="q" autocomplete="off" placeholder="Type your message" autofocus>
        <button id="send">Send</button>
      </form>
      <p class="try">Try <b data-fill="I need to reschedule my delivery to Friday">I need to reschedule my delivery to Friday</b>,
         then <b data-fill="No, I said reschedule it, not cancel it">No, I said reschedule it, not cancel it</b></p>
    </section>
  </main>

  <aside class="wm">
    <h2><span class="dot"></span> Wingman <small id="modelname">live</small></h2>
    <div class="wmbody">
      <div id="expect"></div>
      <p class="sec">Activity</p>
      <div id="events"></div>
      <p class="sec" style="margin-top:18px">Agent config &middot; rules</p>
      <div id="rules"></div>
      <button class="reset" id="reset">Reset demo</button>
    </div>
  </aside>
</div>

<script>
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
const $ = (id) => document.getElementById(id)
let baseRules = null
let busy = false

const DAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const niceDay = (iso) => {
  const d = new Date(iso + 'T00:00:00Z')
  return isNaN(d) ? iso : DAY[d.getUTCDay()] + ', ' + d.toLocaleDateString('en-US',{month:'long',day:'numeric',timeZone:'UTC'})
}

function renderOrder(o) {
  if (!o) { $('order').innerHTML = ''; return }
  const dead = o.status === 'CANCELLED'
  $('order').innerHTML = \`
    <div class="ordhead">
      <div>ORDER PLACED<b>August 19, 2026</b></div>
      <div>TOTAL<b>$128.40</b></div>
      <div>SHIP TO<b>Stevette Marsh</b></div>
      <div style="text-align:right">ORDER #<b>\${esc(o.id)}</b></div>
    </div>
    <div class="ordbody">
      <div class="thumb">&#128095;</div>
      <div class="ordinfo">
        <p class="arriv \${dead ? 'bad' : ''}">\${dead ? 'Order cancelled' : 'Arriving ' + esc(niceDay(o.deliveryDate))}</p>
        <p class="prod">\${esc(o.summary)}</p>
        <p class="status">\${dead ? 'Refund of $128.40 will be issued' : 'Shipped &mdash; on the way'}
          <span class="badge \${dead ? 'b-bad' : 'b-ok'}">\${o.status.replace('_',' ')}</span></p>
      </div>
    </div>\`
}

function renderChat(s) {
  let html = s.messages.map((m) => {
    if (m.role === 'customer')
      return \`<div class="row me"><div class="msg">\${esc(m.text)}</div></div>\`
    const note = m.superseded
      ? '<div class="fixnote">&#9889; Wingman caught this and corrected it below</div>' : ''
    return \`<div class="row"><div class="av">A</div><div class="msg them\${m.superseded ? ' gone' : ''}">\${esc(m.text)}\${
      m.tool ? \`<span class="tool">\${esc(m.tool)}()</span>\` : ''}</div></div>\${note}\`
  }).join('')

  if (busy) html += \`<div class="typing"><div class="av">A</div><div class="dots"><i></i><i></i><i></i></div></div>
    <p class="waitnote">Assistant is thinking, and Wingman is forming its expectation in parallel&hellip;</p>\`

  const chat = $('chat')
  chat.innerHTML = html
  chat.scrollTop = chat.scrollHeight
}

function render(s) {
  if (baseRules === null) baseRules = s.rules.length
  renderOrder(s.order)
  renderChat(s)

  $('expect').innerHTML = s.expectation
    ? \`<div class="exp">Wingman expected <code>\${esc(s.expectation.tool || 'no tool')}</code><br>
       from <span class="q">&ldquo;\${esc(s.expectation.utterance)}&rdquo;</span></div>\`
    : ''

  $('events').innerHTML = s.events.length
    ? s.events.map((e) => \`<div class="ev \${e.lane}"><div class="lane">\${e.lane}</div>
        <h4>\${esc(e.headline)}</h4><p>\${esc(e.detail)}</p>
        \${e.ruleAdded ? \`<div class="diff">+ \${esc(e.ruleAdded)}</div>\` : ''}</div>\`).join('')
    : '<p class="idle">Watching every turn. Nothing to report yet.</p>'

  const added = s.rules.length - baseRules
  $('rules').innerHTML = s.rules
    .map((r, i) => \`<div class="rule\${i < added ? ' new' : ''}">\${esc(r)}</div>\`).join('')
}

function setBusy(on) {
  busy = on
  $('send').disabled = on
  $('q').disabled = on
  $('send').textContent = on ? 'Sending' : 'Send'
}

async function send(text) {
  if (busy) return
  // Show the customer's own message straight away. The model round trip takes seconds,
  // and a UI that looks frozen for that long reads as broken.
  const optimistic = Object.assign({}, last, {
    messages: last.messages.concat([{ role: 'customer', text, tool: null }]),
  })
  setBusy(true)
  renderChat(optimistic)
  try {
    const r = await fetch('/api/chat', {method:'POST',headers:{'content-type':'application/json'},
      body: JSON.stringify({ text })})
    last = await r.json()
  } catch (e) {
    last.messages = last.messages.concat([{role:'agent',text:'Sorry, something went wrong. Please try again.',tool:null}])
  }
  setBusy(false)
  render(last)
}

let last = { messages: [], events: [], rules: [], order: null, expectation: null }

$('f').onsubmit = (e) => {
  e.preventDefault()
  const q = $('q')
  const text = q.value.trim()
  if (!text) return
  q.value = ''
  send(text)
}
document.querySelectorAll('[data-fill]').forEach((el) => {
  el.onclick = () => { $('q').value = el.dataset.fill; $('q').focus() }
})
$('reset').onclick = async () => {
  baseRules = null
  const r = await fetch('/api/reset', {method:'POST'})
  last = await r.json()
  render(last)
}
fetch('/api/state').then((r) => r.json()).then((s) => { last = s; render(s) })
</script>
</body>
</html>`;
