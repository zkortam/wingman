export const PAGE_CSS = `
  *{box-sizing:border-box}
  body{margin:0;background:#eaeded;color:#0f1111;
    font:14px/1.5 "Amazon Ember",Arial,Helvetica,sans-serif}

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

  .wrap{max-width:1500px;margin:0 auto;padding:12px 20px 40px;display:grid;
    grid-template-columns:minmax(0,1fr) 400px;gap:20px;align-items:start}
  h1{font-size:24px;margin:6px 0 16px;font-weight:700}
  .card{background:#fff;border:1px solid #d5d9d9;border-radius:8px;
    box-shadow:0 1px 2px rgba(15,17,17,.06)}
  .card+.card{margin-top:16px}
  .card>h2{font-size:17px;margin:0;padding:13px 18px;border-bottom:1px solid #e7e7e7;font-weight:700}

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
  .meta{font-size:12.5px;color:#565959;margin:6px 0 0}
  .badge{display:inline-block;font-size:11.5px;font-weight:700;padding:2px 8px;border-radius:11px;margin-left:6px}
  .b-ok{background:#e7f6ec;color:#067d3e;border:1px solid #b6e0c4}
  .b-bad{background:#fdecea;color:#b12704;border:1px solid #f5c6c0}

  .chat{padding:16px 18px;min-height:210px;max-height:46vh;overflow-y:auto;background:#fff}
  .row{display:flex;margin-bottom:12px;gap:9px}
  .row.me{justify-content:flex-end}
  .av{width:28px;height:28px;border-radius:50%;flex:none;display:grid;place-items:center;
    font-size:12px;font-weight:700;background:#232f3e;color:#fff}
  .msg{max-width:74%;padding:9px 13px;border-radius:16px;font-size:14px;white-space:pre-wrap}
  .them{background:#f0f2f2;border-top-left-radius:4px}
  .me .msg{background:#007185;color:#fff;border-top-right-radius:4px}
  .stack{max-width:74%;min-width:0}
  .stack .msg{max-width:100%}
  .think{margin:0 0 6px;color:#565959;font-size:13px}
  .think summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:7px;
    user-select:none;width:fit-content;padding:2px 0}
  .think summary::-webkit-details-marker{display:none}
  .think summary:hover{color:#0f1111}
  .chev{width:0;height:0;border-left:5px solid currentColor;border-top:3.5px solid transparent;
    border-bottom:3.5px solid transparent;opacity:.7;transition:transform .15s ease}
  details.think[open] .chev{transform:rotate(90deg)}
  .pulse{width:6px;height:6px;border-radius:50%;background:#007185;animation:p 1.2s infinite}
  @keyframes p{0%,100%{opacity:.25}50%{opacity:1}}
  .think-body{margin:4px 0 8px 18px;padding:8px 10px;background:#f7f8f8;border:1px solid #e7e7e7;
    border-radius:8px;font-size:12.5px;color:#565959;line-height:1.45}
  .think-body code{font:12px ui-monospace,SFMono-Regular,Menlo,monospace;color:#0f1111}
  .welcome{color:#565959;padding:4px 0 8px}
  .welcome p{margin:0 0 12px}
  .chips{display:flex;flex-wrap:wrap;gap:8px}
  .chips button{background:#fff;border:1px solid #888c8c;border-radius:16px;padding:6px 12px;
    font-size:13px;cursor:pointer;color:#0f1111}
  .chips button:hover{background:#f0f2f2;border-color:#007185;color:#007185}
  .chips button:disabled{opacity:.55;cursor:not-allowed}

  .composer{border-top:1px solid #e7e7e7;padding:13px 18px;display:flex;gap:9px;background:#fff;border-radius:0 0 8px 8px}
  .composer input{flex:1;height:40px;padding:0 12px;font-size:14px;border:1px solid #888c8c;border-radius:8px;
    box-shadow:inset 0 1px 2px rgba(15,17,17,.12)}
  .composer input:focus{outline:none;border-color:#007185;box-shadow:0 0 0 3px #c8f3fa}
  .composer button{min-width:92px;height:40px;border:1px solid #a88734;border-radius:8px;cursor:pointer;
    background:linear-gradient(#f7dfa5,#f0c14b);font-size:14px;font-weight:500;color:#0f1111}
  .composer button:hover{background:linear-gradient(#f5d78e,#eeb933)}
  .composer button:disabled,.composer input:disabled{opacity:.55;cursor:not-allowed}

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
  .watch{border:1px solid #21262d;border-radius:7px;padding:10px 12px;margin-bottom:16px;background:#11161d}
  .watch.ok{border-color:#1c5b2c}
  .watch.bad{border-color:#9e6a03}
  .pair{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;margin:4px 0}
  .pair span{color:#8b949e}
  .pair code{color:#79c0ff;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .caps{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}
  .caps span{font:11px ui-monospace,SFMono-Regular,Menlo,monospace;border:1px solid #21262d;
    border-radius:4px;padding:3px 6px;color:#8b949e}
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
  .idle{color:#6e7681;font-size:12.5px;margin:0 0 16px}
  .rule{font:11.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:#8b949e;border:1px solid #21262d;
    border-radius:6px;padding:8px 10px;margin-bottom:6px;word-break:break-word}
  .rule.new{border-color:#1c5b2c;background:#0b2a13;color:#7ee787}
  .reset{background:none;border:1px solid #30363d;color:#8b949e;border-radius:6px;padding:5px 10px;
    font-size:11.5px;cursor:pointer;margin-top:6px}
  .reset:hover{color:#e6edf3;border-color:#8b949e}
  @media(max-width:1100px){.wrap{grid-template-columns:1fr}}
`;
