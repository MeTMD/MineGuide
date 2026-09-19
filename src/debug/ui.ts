export const DEBUG_UI_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MineGuide Agent Trace</title>
<style>
  :root {
    --bg: #ffffff; --panel: #f7f8fa; --border: #e3e6ea; --text: #1f2328; --muted: #6b7280;
    --input: #8b93a7; --model: #7c5cff; --model-lite: #c4b5fd; --tools: #f59e0b;
    --ok: #16a34a; --err: #dc2626; --ctx: #0d9488; --user: #2563eb;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.5 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; color: var(--text); background: var(--bg); }
  header { display: flex; align-items: center; gap: 16px; padding: 10px 16px; border-bottom: 1px solid var(--border); background: var(--panel); position: sticky; top: 0; z-index: 5; }
  header .stat { display: flex; flex-direction: column; line-height: 1.2; }
  header .stat b { font-size: 15px; }
  header .stat span { color: var(--muted); font-size: 11px; }
  header .grow { flex: 1; }
  .chip { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; border: 1px solid var(--border); }
  .chip.ok { color: var(--ok); border-color: var(--ok); }
  .chip.err { color: var(--err); border-color: var(--err); }
  nav button, header button, header select, header input { font: inherit; font-size: 12px; padding: 3px 10px; border: 1px solid var(--border); background: #fff; border-radius: 6px; cursor: pointer; color: var(--text); }
  nav button.active { background: var(--model); color: #fff; border-color: var(--model); }
  main { padding: 12px 16px 40px; }
  .lanes { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .lane { display: grid; grid-template-columns: 64px 1fr; align-items: center; border-bottom: 1px solid var(--border); height: 34px; }
  .lane:last-child { border-bottom: 0; }
  .lane .name { padding-left: 10px; color: var(--muted); font-size: 11px; }
  .track { position: relative; height: 100%; overflow: hidden; cursor: grab; }
  .lanes.dragging .track { cursor: grabbing; }
  .lanehint { color: var(--muted); font-size: 11px; margin-bottom: 4px; }
  .lanehint span { cursor: pointer; text-decoration: underline; }
  .block { position: absolute; top: 6px; height: 22px; border-radius: 4px; opacity: .9; cursor: pointer; }
  .block:hover { opacity: 1; outline: 1px solid #00000022; }
  .block.input { background: var(--input); }
  .block.model { background: var(--model); }
  .block.model .ttft { position: absolute; inset: 0 auto 0 0; background: var(--model-lite); border-radius: 4px 0 0 4px; }
  .block.tools { background: var(--tools); }
  .block.error { background: var(--err); }
  .block.sel { outline: 2px solid #111; z-index: 2; }
  .columns { display: flex; gap: 12px; margin-top: 12px; align-items: flex-start; }
  .stream { flex: 1; min-width: 0; max-height: calc(100vh - 220px); overflow: auto; border: 1px solid var(--border); border-radius: 8px; }
  .card { padding: 7px 10px; border-bottom: 1px solid var(--border); cursor: pointer; }
  .card:last-child { border-bottom: 0; }
  .card:hover { background: var(--panel); }
  .card.sel { background: #eef2ff; }
  .card .tag { display: inline-block; min-width: 74px; font-size: 10px; font-weight: 700; text-align: center; padding: 1px 6px; border-radius: 4px; margin-right: 8px; }
  .tag.tool { background: #fff7ed; color: #b45309; border: 1px solid #fed7aa; }
  .tag.assistant { background: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe; }
  .tag.context { background: #ecfeff; color: #0e7490; border: 1px solid #a5f3fc; }
  .tag.user { background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; }
  .tag.error { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  .card .meta { color: var(--muted); font-size: 11px; }
  .card .body { margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .detail { width: 420px; flex: 0 0 420px; max-height: calc(100vh - 220px); overflow: auto; border: 1px solid var(--border); border-radius: 8px; }
  .detail .head { padding: 8px 10px; border-bottom: 1px solid var(--border); display: flex; gap: 8px; align-items: center; background: var(--panel); position: sticky; top: 0; }
  .detail .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
  .detail .tabs button { border: 0; border-radius: 0; background: transparent; padding: 6px 12px; }
  .detail .tabs button.active { color: var(--model); border-bottom: 2px solid var(--model); }
  .detail .pane { padding: 10px; }
  .kv { display: grid; grid-template-columns: 110px 1fr; gap: 4px 8px; font-size: 12px; }
  .kv dt { color: var(--muted); }
  .kv dd { margin: 0; }
  .preview .msg { border-left: 3px solid var(--border); padding: 4px 8px; margin-bottom: 6px; }
  .preview .msg.system { border-color: var(--ctx); }
  .preview .msg.user { border-color: var(--user); }
  .preview .msg.assistant { border-color: var(--model); }
  .preview .msg.tool { border-color: var(--tools); }
  .preview .role { font-size: 10px; color: var(--muted); text-transform: uppercase; }
  .reason { color: var(--muted); white-space: pre-wrap; }
  pre { margin: 0; white-space: pre-wrap; word-break: break-all; font: 11px/1.45 Consolas, monospace; }
  .logtable { width: 100%; border-collapse: collapse; }
  .logtable td { border-bottom: 1px solid var(--border); padding: 3px 6px; vertical-align: top; font-size: 12px; }
  .logtable .lv { font-weight: 700; width: 52px; }
  .lv.debug { color: var(--muted); } .lv.info { color: #0369a1; } .lv.warn { color: #b45309; } .lv.error { color: var(--err); }
  .empty { color: var(--muted); padding: 16px; text-align: center; }
  .hint { color: var(--muted); font-size: 11px; }
</style>
</head>
<body>
<header>
  <div class="stat"><b id="stat-duration">-</b><span>Duration</span></div>
  <div class="stat"><b id="stat-turns">0</b><span>Turns</span></div>
  <div class="stat"><b id="stat-calls">0</b><span>Calls</span></div>
  <div class="stat"><b id="stat-model">-</b><span>Model</span></div>
  <div class="grow"></div>
  <span id="conn" class="chip">Connecting…</span>
  <nav>
    <button id="tab-pipeline" class="active">Pipeline</button>
    <button id="tab-logs">Logs</button>
  </nav>
  <input id="filter" placeholder="Filter text…">
  <select id="kind-filter">
    <option value="all">All</option>
    <option value="input">Input</option>
    <option value="assistant">Assistant</option>
    <option value="tool">Tool</option>
    <option value="error">Error</option>
  </select>
  <select id="log-level">
    <option value="debug">debug+</option>
    <option value="info">info+</option>
    <option value="warn">warn+</option>
    <option value="error">error</option>
  </select>
  <button id="pause">Pause</button>
  <button id="clear">Clear</button>
</header>
<main>
  <div id="pipeline-view">
    <div class="lanehint"><span id="zoom-reset">Reset view</span> · Wheel to zoom · Drag to pan · Double-click to reset</div>
    <div class="lanes">
      <div class="lane"><div class="name">Input</div><div class="track" id="lane-input"></div></div>
      <div class="lane"><div class="name">Model</div><div class="track" id="lane-model"></div></div>
      <div class="lane"><div class="name">Tools</div><div class="track" id="lane-tools"></div></div>
    </div>
    <div class="columns">
      <div class="stream" id="stream"></div>
      <div class="detail" id="detail"></div>
    </div>
  </div>
  <div id="logs-view" style="display:none">
    <div class="stream" style="max-height:calc(100vh - 140px)"><table class="logtable"><tbody id="logs"></tbody></table></div>
  </div>
</main>
<script>
(function () {
  var params = new URLSearchParams(location.search);
  var token = params.get('token') || '';
  var state = {
    pipelineIds: [], pipeline: new Map(), logs: [], config: null,
    selected: null, paused: false, tab: 'pipeline', filter: '', kind: 'all', logLevel: 'debug',
    model: null, derived: null, detailTab: 'summary', view: { start: 0, end: 1 }, follow: true
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }
  function pad(x, n) { x = String(x); while (x.length < n) x = '0' + x; return x; }
  function fmtTime(at) {
    var d = new Date(at);
    return pad(d.getHours(), 2) + ':' + pad(d.getMinutes(), 2) + ':' + pad(d.getSeconds(), 2) + '.' + pad(d.getMilliseconds(), 3);
  }
  function fmtDur(ms) { return ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' s'; }
  function api(path) { return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token); }

  function applyState(data) {
    state.config = data.config;
    state.model = data.config;
    state.pipelineIds = [];
    state.pipeline = new Map();
    data.pipeline.forEach(function (r) { state.pipeline.set(r.id, r); state.pipelineIds.push(r.id); });
    state.logs = data.logs;
    document.getElementById('stat-model').textContent = data.config.model || '-';
    render();
  }

  function onRecord(r) {
    if (r.kind === 'log') {
      state.logs.push(r);
      if (state.logs.length > 500) state.logs.shift();
    } else {
      state.pipeline.set(r.id, r);
      state.pipelineIds.push(r.id);
    }
    render();
  }

  function derive() {
    var reqs = {}, tools = {}, turns = {}, outputs = [], errors = [];
    var list = state.pipelineIds.map(function (id) { return state.pipeline.get(id); }).filter(Boolean);
    list.forEach(function (r) {
      if (r.kind === 'turn_start') { var t = turns[r.turn] || (turns[r.turn] = { turn: r.turn }); t.start = r.at; t.source = r.source; t.inputText = r.inputText; t.id = r.id; }
      else if (r.kind === 'turn_end') { var t2 = turns[r.turn] || (turns[r.turn] = { turn: r.turn }); t2.end = r.at; }
      else if (r.kind === 'request_start') { var q = reqs[r.requestId] || (reqs[r.requestId] = { requestId: r.requestId }); q.turn = r.turn; q.step = r.step; q.start = r.at; q.model = r.model; q.thinking = r.thinking; q.effort = r.reasoningEffort; q.messages = r.messages; q.startId = r.id; }
      else if (r.kind === 'request_first_token') { var q1 = reqs[r.requestId] || (reqs[r.requestId] = { requestId: r.requestId }); q1.firstToken = r.at; }
      else if (r.kind === 'request_end') { var q2 = reqs[r.requestId] || (reqs[r.requestId] = { requestId: r.requestId }); q2.end = r.at; q2.status = r.status; q2.durationMs = r.durationMs; q2.generationMs = r.generationMs; q2.content = r.content; q2.reasoning = r.reasoning; q2.toolCalls = r.toolCalls; q2.usage = r.usage; q2.finishReason = r.finishReason; q2.error = r.error; q2.endId = r.id; }
      else if (r.kind === 'tool_start') { var g = tools[r.callId] || (tools[r.callId] = { callId: r.callId }); g.turn = r.turn; g.step = r.step; g.requestId = r.requestId; g.name = r.name; g.arguments = r.arguments; g.start = r.at; g.startId = r.id; }
      else if (r.kind === 'tool_end') { var g2 = tools[r.callId] || (tools[r.callId] = { callId: r.callId }); g2.end = r.at; g2.status = r.status; g2.result = r.result; g2.durationMs = r.durationMs; g2.endId = r.id; }
      else if (r.kind === 'output') { outputs.push(r); }
      else if (r.kind === 'error') { errors.push(r); }
    });
    var reqList = Object.keys(reqs).map(function (k) { return reqs[k]; });
    var toolList = Object.keys(tools).map(function (k) { return tools[k]; });
    var turnList = Object.keys(turns).map(function (k) { return turns[k]; });
    var t0 = Infinity, t1 = -Infinity, inProgress = false;
    list.forEach(function (r) { t0 = Math.min(t0, r.at); t1 = Math.max(t1, r.at); });
    reqList.forEach(function (q) { if (!q.end) inProgress = true; });
    toolList.forEach(function (g) { if (!g.end) inProgress = true; });
    if (!isFinite(t0)) t0 = Date.now();
    if (!isFinite(t1)) t1 = t0;
    return { list: list, reqs: reqs, reqList: reqList, toolList: toolList, turnList: turnList, outputs: outputs, errors: errors, t0: t0, t1: t1, inProgress: inProgress, count: list.length };
  }

  function laneBlock(left, width, cls, title, kind, id) {
    if (left > 1 || left + width < 0) return '';
    return '<div class="block ' + cls + '" data-kind="' + kind + '" data-id="' + id + '" title="' + esc(title) + '" style="left:' + (left * 100) + '%;width:' + Math.max(width * 100, 0.4) + '%"></div>';
  }

  function makeScale(t0, t1) {
    var span = Math.max(t1 - t0, 1);
    var c = 1000;
    var denom = Math.log1p(span / c);
    return {
      pos: function (at) { return denom <= 0 ? 0 : Math.log1p(Math.max(at - t0, 0) / c) / denom; }
    };
  }

  function renderTimeline(d) {
    var now = Date.now();
    var t1 = d.inProgress ? Math.max(d.t1, now) : d.t1;
    var posFn = makeScale(d.t0, t1).pos;
    var view = state.view;
    var vw = Math.max(view.end - view.start, 1e-6);
    function left(at) { return (posFn(at) - view.start) / vw; }
    function width(a, b) { return Math.max(posFn(b) - posFn(a), 0) / vw; }
    var inputHtml = '', modelHtml = '', toolsHtml = '';
    d.turnList.forEach(function (t) {
      if (t.start == null) return;
      inputHtml += laneBlock(left(t.start), width(t.start, t.start + 400), 'input' + (isSel('turn', t.turn) ? ' sel' : ''), 'Turn ' + t.turn + ' (' + t.source + '): ' + clip(t.inputText, 80), 'turn', t.turn);
    });
    d.outputs.forEach(function (o) {
      inputHtml += laneBlock(left(o.at), width(o.at, o.at + 400), 'input' + (isSel('turn', o.turn) ? ' sel' : ''), 'Output: ' + clip(o.text, 80), 'turn', o.turn);
    });
    d.reqList.forEach(function (q) {
      if (q.start == null) return;
      var end = q.end || now;
      var l = left(q.start), w = width(q.start, end);
      if (l > 1 || l + w < 0) return;
      var cls = 'model' + (q.status === 'error' ? ' error' : '') + (isSel('request', q.requestId) ? ' sel' : '');
      var ttft = q.firstToken ? width(q.start, q.firstToken) : 0;
      modelHtml += '<div class="block ' + cls + '" data-kind="request" data-id="' + q.requestId + '" title="Request #' + q.requestId + ' Turn ' + q.turn + ' Step ' + q.step + '" style="left:' + (l * 100) + '%;width:' + Math.max(w * 100, 0.5) + '%"><div class="ttft" style="width:' + (ttft * 100) + '%"></div></div>';
    });
    d.toolList.forEach(function (g) {
      if (g.start == null) return;
      var cls = 'tools' + (g.status === 'error' ? ' error' : '') + (isSel('tool', g.callId) ? ' sel' : '');
      toolsHtml += laneBlock(left(g.start), width(g.start, g.end || now), cls, g.name + ' ' + clip(g.arguments, 60), 'tool', g.callId);
    });
    document.getElementById('lane-input').innerHTML = inputHtml;
    document.getElementById('lane-model').innerHTML = modelHtml;
    document.getElementById('lane-tools').innerHTML = toolsHtml;
  }

  function isSel(kind, id) { return state.selected && state.selected.kind === kind && String(state.selected.id) === String(id); }

  function buildCards(d) {
    var items = [];
    d.turnList.forEach(function (t) {
      var tag = t.source === 'announce' ? 'context' : (t.source === 'command' ? 'tool' : 'user');
      var label = t.source === 'announce' ? 'CONTEXT' : (t.source === 'command' ? 'COMMAND' : 'USER');
      items.push({ id: t.id, kind: 'turn', ref: t.turn, cat: 'input', tag: tag, label: label, title: 'Turn ' + t.turn, body: t.inputText, search: t.inputText });
    });
    d.reqList.forEach(function (q) {
      if (q.endId == null) return;
      var meta = q.usage ? (q.usage.completion + ' tok (r' + q.usage.reasoning + '/c' + (q.usage.completion - q.usage.reasoning) + ')') : '';
      items.push({ id: q.endId, kind: 'request', ref: q.requestId, cat: 'assistant', tag: q.status === 'error' ? 'error' : 'assistant', label: q.status === 'error' ? 'ERROR' : 'ASSISTANT', title: 'Turn ' + q.turn + ' · Step ' + q.step, body: q.content || '(silent)', meta: meta, search: q.content + ' ' + q.reasoning });
    });
    d.toolList.forEach(function (g) {
      if (g.endId == null) return;
      items.push({ id: g.endId, kind: 'tool', ref: g.callId, cat: 'tool', tag: g.status === 'error' ? 'error' : 'tool', label: 'TOOL', title: g.name, body: g.arguments + ' → ' + g.result, search: g.name + ' ' + g.arguments + ' ' + g.result });
    });
    d.outputs.forEach(function (o) {
      items.push({ id: o.id, kind: 'turn', ref: o.turn, cat: 'assistant', tag: 'assistant', label: 'OUTPUT', title: 'Turn ' + o.turn, body: o.text, search: o.text });
    });
    d.errors.forEach(function (e) {
      items.push({ id: e.id, kind: 'error', ref: e.id, cat: 'error', tag: 'error', label: 'ERROR', title: e.scope, body: e.message, search: e.message });
    });
    items.sort(function (a, b) { return a.id - b.id; });
    return items;
  }

  function renderStream(d) {
    var items = buildCards(d);
    var filter = state.filter.toLowerCase();
    var html = '';
    var shown = 0;
    items.forEach(function (it) {
      if (state.kind !== 'all' && it.cat !== state.kind) return;
      if (filter && it.search.toLowerCase().indexOf(filter) < 0) return;
      shown += 1;
      html += '<div class="card' + (isSel(it.kind, it.ref) ? ' sel' : '') + '" data-kind="' + it.kind + '" data-id="' + it.ref + '">' +
        '<span class="tag ' + it.tag + '">' + it.label + '</span>' +
        '<span class="meta">' + esc(it.title) + (it.meta ? ' · ' + esc(it.meta) : '') + '</span>' +
        '<div class="body">' + esc(clip(it.body, 220)) + '</div></div>';
    });
    var stream = document.getElementById('stream');
    var keep = stream.scrollTop;
    stream.innerHTML = html || '<div class="empty">No events</div>';
    if (state.follow && !state.paused) {
      stream.scrollTop = stream.scrollHeight;
    } else {
      stream.scrollTop = keep;
    }
  }

  function renderDetail(d) {
    var el = document.getElementById('detail');
    if (!state.selected) { el.innerHTML = '<div class="empty">Select an event to inspect</div>'; return; }
    var kind = state.selected.kind, id = state.selected.id;
    var model = state.model || {};
    var html = '';
    if (kind === 'request') {
      var q = d.reqs[id];
      if (!q) { el.innerHTML = '<div class="empty">Request data unavailable</div>'; return; }
      var contentTokens = q.usage ? (q.usage.completion - q.usage.reasoning) : 0;
      var throughput = q.generationMs > 0 && q.usage ? (contentTokens / (q.generationMs / 1000)).toFixed(1) + ' tok/s' : '-';
      var ttft = q.firstToken ? fmtDur(q.firstToken - q.start) : '-';
      html += '<div class="head"><span class="tag assistant">ASSISTANT</span><span class="meta">Turn ' + q.turn + ' · Step ' + q.step + '</span></div>';
      html += detailTabs();
      html += '<div class="pane" data-pane="summary">' +
        '<div class="hint">Source</div><div><a href="#" data-goto="request" data-id="' + q.requestId + '">Request #' + q.requestId + '</a></div>' +
        '<div class="hint" style="margin-top:8px">Status</div><div><span class="chip ' + (q.status === 'error' ? 'err' : 'ok') + '">' + (q.status || 'running') + (q.finishReason ? ' · ' + esc(q.finishReason) : '') + '</span></div>' +
        '<div class="hint" style="margin-top:8px">Tokens</div><dl class="kv">' +
        '<dt>Total</dt><dd>' + (q.usage ? q.usage.total : '-') + '</dd>' +
        '<dt>Prompt</dt><dd>' + (q.usage ? q.usage.prompt + ' (cache ' + q.usage.cached + '/' + q.usage.cacheMiss + ')' : '-') + '</dd>' +
        '<dt>Completion</dt><dd>' + (q.usage ? q.usage.completion : '-') + '</dd>' +
        '<dt>Content</dt><dd>' + (q.usage ? contentTokens : '-') + '</dd></dl>' +
        '<div class="hint" style="margin-top:8px">Request Timing</div><dl class="kv">' +
        '<dt>Started</dt><dd>' + fmtTime(q.start) + '</dd>' +
        '<dt>Total duration</dt><dd>' + (q.durationMs != null ? fmtDur(q.durationMs) : '-') + '</dd>' +
        '<dt>TTFT</dt><dd>' + ttft + '</dd>' +
        '<dt>Generation</dt><dd>' + (q.generationMs != null ? fmtDur(q.generationMs) : '-') + '</dd>' +
        '<dt>Throughput</dt><dd>' + throughput + '</dd></dl>' +
        '<div class="hint" style="margin-top:8px">Model</div><div>' + esc(q.model || model.model || '') + ' · thinking ' + esc(q.thinking || '') + ' · ' + esc(q.effort || '') + '</div>' +
        (q.error ? '<div class="hint" style="margin-top:8px">Error</div><div style="color:var(--err)">' + esc(q.error) + '</div>' : '') +
        '</div>';
      html += '<div class="pane preview" data-pane="preview">' + renderMessages(q.messages) + '</div>';
      html += '<div class="pane" data-pane="raw"><pre>' + esc(JSON.stringify({ request: state.pipeline.get(q.startId), response: state.pipeline.get(q.endId) }, null, 2)) + '</pre></div>';
    } else if (kind === 'tool') {
      var g = null;
      d.toolList.forEach(function (x) { if (String(x.callId) === String(id)) g = x; });
      if (!g) { el.innerHTML = '<div class="empty">Tool data unavailable</div>'; return; }
      html += '<div class="head"><span class="tag tool">TOOL</span><span class="meta">' + esc(g.name) + ' · Turn ' + g.turn + ' · Step ' + g.step + '</span></div>';
      html += detailTabs(['summary', 'raw']);
      html += '<div class="pane" data-pane="summary"><dl class="kv">' +
        '<dt>Status</dt><dd><span class="chip ' + (g.status === 'error' ? 'err' : 'ok') + '">' + (g.status || 'running') + '</span></dd>' +
        '<dt>Duration</dt><dd>' + (g.durationMs != null ? fmtDur(g.durationMs) : '-') + '</dd>' +
        '<dt>Source</dt><dd><a href="#" data-goto="request" data-id="' + g.requestId + '">Request #' + g.requestId + '</a></dd>' +
        '<dt>Arguments</dt><dd><pre>' + esc(g.arguments) + '</pre></dd>' +
        '<dt>Result</dt><dd><pre>' + esc(g.result) + '</pre></dd></dl></div>';
      html += '<div class="pane" data-pane="raw"><pre>' + esc(JSON.stringify({ start: state.pipeline.get(g.startId), end: state.pipeline.get(g.endId) }, null, 2)) + '</pre></div>';
    } else if (kind === 'error') {
      var errRec = state.pipeline.get(id);
      html += '<div class="head"><span class="tag error">ERROR</span></div><div class="pane"><pre>' + esc(JSON.stringify(errRec, null, 2)) + '</pre></div>';
    } else {
      var t = null;
      d.turnList.forEach(function (x) { if (String(x.turn) === String(id)) t = x; });
      if (!t) { el.innerHTML = '<div class="empty">Event unavailable</div>'; return; }
      html += '<div class="head"><span class="tag ' + (t.source === 'announce' ? 'context' : 'user') + '">TURN ' + t.turn + '</span><span class="meta">' + esc(t.source || '') + '</span></div>';
      html += '<div class="pane"><dl class="kv"><dt>Started</dt><dd>' + fmtTime(t.start) + '</dd>' +
        '<dt>Duration</dt><dd>' + (t.end != null ? fmtDur(t.end - t.start) : 'running') + '</dd></dl>' +
        '<div class="hint" style="margin-top:8px">Input</div><pre>' + esc(t.inputText) + '</pre></div>';
    }
    el.innerHTML = html;
    applyDetailTab();
  }

  function detailTabs(names) {
    var tabs = names || ['summary', 'preview', 'raw'];
    var labels = { summary: 'Summary', preview: 'Preview', raw: 'Raw' };
    var html = '<div class="tabs">';
    tabs.forEach(function (name) {
      html += '<button data-tab="' + name + '"' + (state.detailTab === name ? ' class="active"' : '') + '>' + labels[name] + '</button>';
    });
    return html + '</div>';
  }

  function applyDetailTab() {
    var el = document.getElementById('detail');
    el.querySelectorAll('button[data-tab]').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === state.detailTab); });
    el.querySelectorAll('.pane').forEach(function (p) { p.style.display = p.dataset.pane === state.detailTab ? '' : 'none'; });
  }

  function renderMessages(messages) {
    if (!messages || !messages.length) return '<div class="empty">No messages</div>';
    var html = '';
    messages.forEach(function (m) {
      var role = m.role || '?';
      var text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      var extra = '';
      if (m.reasoning_content) extra += '<div class="reason">' + esc(clip(m.reasoning_content, 600)) + '</div>';
      if (m.tool_calls) extra += '<pre>' + esc(JSON.stringify(m.tool_calls)) + '</pre>';
      html += '<div class="msg ' + role + '"><div class="role">' + role + '</div>' + extra + '<div>' + esc(text) + '</div></div>';
    });
    return html;
  }

  function renderHeader(d) {
    var t1 = d.inProgress ? Date.now() : d.t1;
    document.getElementById('stat-duration').textContent = d.count ? fmtDur(t1 - d.t0) : '-';
    document.getElementById('stat-turns').textContent = d.turnList.length;
    document.getElementById('stat-calls').textContent = d.toolList.length;
  }

  function renderLogs() {
    var order = { debug: 10, info: 20, warn: 30, error: 40 };
    var min = order[state.logLevel] || 10;
    var filter = state.filter.toLowerCase();
    var html = '';
    state.logs.forEach(function (r) {
      if ((order[r.level] || 0) < min) return;
      var text = '[' + r.level + '] ' + r.module + ' - ' + r.message;
      if (filter && text.toLowerCase().indexOf(filter) < 0) return;
      var ctx = [];
      if (r.context && r.context.turn != null) ctx.push('turn ' + r.context.turn);
      if (r.context && r.context.step != null) ctx.push('step ' + r.context.step);
      if (r.context && r.context.requestId != null) ctx.push('req #' + r.context.requestId);
      html += '<tr><td>' + fmtTime(r.at) + '</td><td class="lv ' + r.level + '">' + r.level + '</td><td>' + esc(r.module) + '</td><td>' + esc(r.message) + '</td><td class="hint">' + esc(ctx.join(' ')) + '</td></tr>';
    });
    document.getElementById('logs').innerHTML = html || '<tr><td class="empty">No logs</td></tr>';
  }

  function render() {
    var d = derive();
    state.derived = d;
    state.model = state.config;
    renderHeader(d);
    if (state.tab === 'pipeline') {
      renderTimeline(d);
      renderStream(d);
      renderDetail(d);
    } else {
      renderLogs();
    }
  }

  function select(kind, id) {
    state.selected = { kind: kind, id: id };
    state.follow = false;
    render();
    var card = document.querySelector('#stream .card.sel');
    if (card) card.scrollIntoView({ block: 'nearest' });
  }

  document.getElementById('stream').addEventListener('click', function (e) {
    var card = e.target.closest('.card');
    if (card) select(card.dataset.kind, card.dataset.id);
  });
  document.getElementById('detail').addEventListener('click', function (e) {
    var tab = e.target.closest('button[data-tab]');
    if (tab) {
      state.detailTab = tab.dataset.tab;
      applyDetailTab();
      return;
    }
    var link = e.target.closest('a[data-goto]');
    if (link) { e.preventDefault(); select(link.dataset.goto, link.dataset.id); }
  });
  var lanesEl = document.querySelector('.lanes');
  var drag = null;
  var suppressClick = false;

  function trackRect() { return document.getElementById('lane-input').getBoundingClientRect(); }
  function refreshTimeline() { if (state.derived) renderTimeline(state.derived); }
  function clampView() {
    var width = state.view.end - state.view.start;
    if (width >= 1) { state.view.start = 0; state.view.end = 1; return; }
    if (width < 0.02) {
      var mid = (state.view.start + state.view.end) / 2;
      state.view.start = mid - 0.01;
      state.view.end = mid + 0.01;
    }
    if (state.view.start < 0) { state.view.end -= state.view.start; state.view.start = 0; }
    if (state.view.end > 1) { state.view.start -= state.view.end - 1; state.view.end = 1; }
    if (state.view.start < 0) { state.view.start = 0; }
  }
  function resetView() { state.view.start = 0; state.view.end = 1; refreshTimeline(); }

  lanesEl.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; return; }
    var block = e.target.closest('.block');
    if (block) select(block.dataset.kind, block.dataset.id);
  });
  lanesEl.addEventListener('wheel', function (e) {
    e.preventDefault();
    var rect = trackRect();
    var width = state.view.end - state.view.start;
    var axis = state.view.start + ((e.clientX - rect.left) / rect.width) * width;
    var next = Math.max(0.02, Math.min(width * Math.exp(e.deltaY * 0.0015), 1));
    state.view.start = axis - (axis - state.view.start) * (next / width);
    state.view.end = state.view.start + next;
    clampView();
    refreshTimeline();
  }, { passive: false });
  lanesEl.addEventListener('mousedown', function (e) {
    drag = { x: e.clientX, v0: state.view.start, v1: state.view.end, moved: false };
    lanesEl.classList.add('dragging');
    e.preventDefault();
  });
  lanesEl.addEventListener('dblclick', function () { resetView(); });
  document.getElementById('zoom-reset').addEventListener('click', function () { resetView(); });
  window.addEventListener('mousemove', function (e) {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) > 3) drag.moved = true;
    var rect = trackRect();
    var delta = ((e.clientX - drag.x) / rect.width) * (drag.v1 - drag.v0);
    state.view.start = drag.v0 - delta;
    state.view.end = drag.v1 - delta;
    clampView();
    refreshTimeline();
  });
  window.addEventListener('mouseup', function () {
    if (!drag) return;
    suppressClick = drag.moved;
    drag = null;
    lanesEl.classList.remove('dragging');
  });
  document.getElementById('tab-pipeline').addEventListener('click', function () { state.tab = 'pipeline'; toggleTabs(); render(); });
  document.getElementById('tab-logs').addEventListener('click', function () { state.tab = 'logs'; toggleTabs(); render(); });
  document.getElementById('filter').addEventListener('input', function (e) { state.filter = e.target.value; render(); });
  document.getElementById('kind-filter').addEventListener('change', function (e) { state.kind = e.target.value; render(); });
  document.getElementById('log-level').addEventListener('change', function (e) { state.logLevel = e.target.value; render(); });
  document.getElementById('pause').addEventListener('click', function (e) { state.paused = !state.paused; if (!state.paused) state.follow = true; e.target.textContent = state.paused ? 'Resume' : 'Pause'; });
  document.getElementById('clear').addEventListener('click', function () {
    fetch(api('/api/clear'), { method: 'POST' }).then(function () {
      state.pipelineIds = []; state.pipeline = new Map(); state.logs = []; state.selected = null; state.follow = true; render();
    });
  });

  function toggleTabs() {
    document.getElementById('tab-pipeline').classList.toggle('active', state.tab === 'pipeline');
    document.getElementById('tab-logs').classList.toggle('active', state.tab === 'logs');
    document.getElementById('pipeline-view').style.display = state.tab === 'pipeline' ? '' : 'none';
    document.getElementById('logs-view').style.display = state.tab === 'logs' ? '' : 'none';
  }

  setInterval(function () {
    var d = derive();
    if (d.inProgress && !state.paused && state.tab === 'pipeline') render();
  }, 500);

  fetch(api('/api/state')).then(function (res) {
    if (!res.ok) throw new Error('unauthorized');
    return res.json();
  }).then(function (data) {
    applyState(data);
    var last = 0;
    state.pipelineIds.forEach(function (id) { if (id > last) last = id; });
    state.logs.forEach(function (r) { if (r.id > last) last = r.id; });
    openStream(last);
  }).catch(function () {
    setConn('err', 'Invalid token');
  });

  function openStream(lastId) {
    var es = new EventSource(api('/api/events') + '&lastEventId=' + lastId);
    var names = ['turn_start', 'request_start', 'request_first_token', 'request_end', 'tool_start', 'tool_end', 'turn_end', 'output', 'error', 'log'];
    names.forEach(function (name) {
      es.addEventListener(name, function (e) {
        try { onRecord(JSON.parse(e.data)); } catch (err) { /* ignore */ }
      });
    });
    es.onopen = function () { setConn('ok', 'Live'); };
    es.onerror = function () { setConn('err', 'Disconnected (reconnecting)'); };
  }

  function setConn(cls, text) {
    var el = document.getElementById('conn');
    el.className = 'chip ' + cls;
    el.textContent = text;
  }
})();
</script>
</body>
</html>
`;
