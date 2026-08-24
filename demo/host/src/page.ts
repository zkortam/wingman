import { PAGE_CSS } from "./page-css.js";

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amazoff.com Customer Service</title>
<style>
${PAGE_CSS}
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
    </section>
  </main>

  <aside class="wm">
    <h2><span class="dot"></span> Wingman <small id="modelname">live</small></h2>
    <div class="wmbody">
      <div id="wmfeed"></div>
      <button class="reset" id="reset">Reset demo</button>
    </div>
  </aside>
</div>

<script>
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
const $ = (id) => document.getElementById(id)
let baseRules = null
let busy = false
let phase = null

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
        \${o.tracking ? '<p class="meta">Tracking ' + esc(o.tracking) + (o.carrier ? ' · ' + esc(o.carrier) : '') + '</p>' : ''}
        \${o.address ? '<p class="meta">' + esc(o.address) + '</p>' : ''}
        \${o.instructions ? '<p class="meta">Note: ' + esc(o.instructions) + '</p>' : ''}
      </div>
    </div>\`
}

function thinkingBody(text) {
  const t = text.toLowerCase()
  if (/where|track|package|parcel/.test(t)) return 'Looking up where the parcel is.'
  if (/leave|door|porch|ring|bell|neighbor|instruction/.test(t)) return 'Updating the delivery note.'
  if (/human|person|supervisor|callback|talk to/.test(t)) return 'Connecting you with a person.'
  if (/reschedul|arriv|deliver|sooner|earlier|later|friday|aug|date/.test(t))
    return 'Working out how to change the delivery.'
  if (/cancel/.test(t)) return 'Working out how to cancel the order.'
  if (/return|refund/.test(t)) return 'Working out how to handle a return or refund.'
  return 'Working out how to handle this request.'
}

function reasoning(title, body, open) {
  return \`<details class="think"\${open ? ' open' : ''}>
    <summary><span class="chev"></span>\${open ? '<span class="pulse"></span>' : ''}<span>\${esc(title)}</span></summary>
    <div class="think-body">\${body}</div>
  </details>\`
}

function agentReasoning(m) {
  if (m.rescued) {
    const wrong = m.replacedTool ? '<code>' + esc(m.replacedTool) + '()</code>' : 'the wrong tool'
    const right = m.tool ? '<code>' + esc(m.tool) + '()</code>' : 'the right one'
    return reasoning('Wingman retried this',
      'The agent called ' + wrong + '. Wingman stepped in and ran ' + right + ' instead.',
      false)
  }
  if (!m.tool) return ''
  return reasoning('Used ' + m.tool,
    m.reason ? esc(m.reason) : 'Called <code>' + esc(m.tool) + '()</code>',
    false)
}

function welcome() {
  return \`<div class="welcome">
    <p>Ask about this order. I can track it, add a delivery note, or connect you to a person.</p>
    <div class="chips">
      <button type="button" data-send="Where's my package?">Where's my package?</button>
      <button type="button" data-send="Please leave it at the door and don't ring the bell">Leave it at the door</button>
      <button type="button" data-send="Can I talk to a person?">Talk to a person</button>
    </div>
  </div>\`
}

function renderChat(s) {
  if (!s.messages.length && !phase) {
    $('chat').innerHTML = welcome()
    return
  }
  let html = s.messages.map((m) => {
    if (m.role === 'customer')
      return \`<div class="row me"><div class="msg">\${esc(m.text)}</div></div>\`
    if (m.superseded && !(phase && phase.kind === 'fix')) return ''
    const think = agentReasoning(m)
    return \`<div class="row"><div class="av">A</div><div class="stack">\${think}
      <div class="msg them">\${esc(m.text)}</div></div></div>\`
  }).join('')

  if (phase) {
    html += \`<div class="row"><div class="av">A</div><div class="stack">\${
      reasoning(phase.title, phase.body, true)
    }</div></div>\`
  }

  const chat = $('chat')
  chat.innerHTML = html
  chat.scrollTop = chat.scrollHeight
}

function render(s) {
  if (baseRules === null) baseRules = s.rules.length
  renderOrder(s.order)
  renderChat(s)

  const added = s.rules.slice(0, Math.max(0, s.rules.length - baseRules))
  const caps = (s.capabilities || []).map((c) => '<span>' + esc(c) + '</span>').join('')
  let feed = caps ? '<p class="sec">This agent can</p><div class="caps">' + caps + '</div>' : ''
  const w = s.watch
  if (w && (w.expected || w.actual)) {
    const cls = w.matched === true ? 'ok' : w.matched === false ? 'bad' : ''
    const verdict = w.matched === true ? 'Match' : w.matched === false ? 'Mismatch' : 'Watching'
    feed += \`<div class="watch \${cls}"><p class="sec">Last turn · \${verdict}</p>
      <div class="pair"><span>Expected</span><code>\${esc(w.expected || 'none')}</code></div>
      <div class="pair"><span>Agent</span><code>\${esc(w.actual || 'none')}</code></div></div>\`
  } else {
    feed += '<p class="idle">Watching this chat. I step in if the agent misses.</p>'
  }
  if (s.expectation) {
    feed += \`<div class="exp">Expected <code>\${esc(s.expectation.tool || 'no tool')}</code>
      <span class="q">from “\${esc(s.expectation.utterance)}”</span></div>\`
  }
  feed += s.events.map((e) => \`<div class="ev \${e.lane}"><div class="lane">\${e.lane}</div>
      <h4>\${esc(e.headline)}</h4>
      \${e.ruleAdded ? \`<div class="diff">+ \${esc(e.ruleAdded)}</div>\` : ''}</div>\`).join('')
  if (added.length) {
    feed += '<p class="sec" style="margin-top:14px">Added to the agent</p>' +
      added.map((r) => \`<div class="rule new">\${esc(r)}</div>\`).join('')
  }
  $('wmfeed').innerHTML = feed
}

function setBusy(on) {
  busy = on
  $('send').disabled = on
  $('q').disabled = on
  $('send').textContent = on ? 'Sending' : 'Send'
}

async function send(text) {
  if (busy) return
  const before = last
  const optimistic = Object.assign({}, last, {
    messages: last.messages.concat([{ role: 'customer', text, tool: null }]),
  })
  const started = Date.now()
  setBusy(true)
  phase = { kind: 'think', title: 'Thinking', body: thinkingBody(text) }
  renderChat(optimistic)
  try {
    const r = await fetch('/api/chat', {method:'POST',headers:{'content-type':'application/json'},
      body: JSON.stringify({ text })})
    last = await r.json()
  } catch (e) {
    last.messages = last.messages.concat([{role:'agent',text:'Sorry, something went wrong. Please try again.',tool:null}])
  }

  const leftover = 1600 - (Date.now() - started)
  if (leftover > 0) await sleep(leftover)

  const rescuedNow = last.messages.filter((m) => m.rescued).length
  const rescuedBefore = before.messages.filter((m) => m.rescued).length
  if (rescuedNow > rescuedBefore) {
    const wrong = (before.messages.slice().reverse().find((m) => m.role === 'agent') || {}).tool
    phase = {
      kind: 'fix',
      title: 'Wingman is stepping in',
      body: 'The agent called <code>' + esc(wrong || 'the wrong tool') +
        '()</code>. Correcting the config and retrying with the tool that matches the request.',
    }
    render(Object.assign({}, last, { messages: optimistic.messages, order: before.order }))
    await sleep(2800)
  }

  phase = null
  setBusy(false)
  render(last)
}

let last = { messages: [], events: [], rules: [], order: null, expectation: null, watch: null, capabilities: [] }

$('chat').onclick = (e) => {
  const btn = e.target.closest('[data-send]')
  if (!btn || busy) return
  send(btn.getAttribute('data-send'))
}
$('f').onsubmit = (e) => {
  e.preventDefault()
  const q = $('q')
  const text = q.value.trim()
  if (!text) return
  q.value = ''
  send(text)
}
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
