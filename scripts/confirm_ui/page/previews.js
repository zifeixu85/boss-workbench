/* 模块预览渲染：按 recommendations.json 里每个模块的 preview 数据，画出搭好以后大概的样子。
   所有文字都先转义；颜色来自所选配色。 */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function tone(t) { return t ? ' ' + esc(t) : ''; }
  function list(arr, fn) { return (arr || []).map(fn).join(''); }

  function styleVars(p) {
    return [
      '--p-bg:' + p.background, '--p-side:' + p.sidebar, '--p-side-fg:' + (p.sidebarFg || p.fg), '--p-card:' + p.card,
      '--p-primary:' + p.primary, '--p-primary-fg:' + p.primaryFg, '--p-fg:' + p.fg, '--p-muted:' + p.muted,
      '--p-border:' + p.border, '--p-accent:' + p.accent, '--p-accent-fg:' + p.accentFg
    ].map(esc).join(';');
  }

  var R = {};

  R.today = function (d) {
    return '<div class="pv-h"><div><small>' + esc(d.date) + '</small><b>' + esc(d.greeting) + '</b></div><span class="pv-btn">记一笔</span></div>' +
      (d.focus ? '<div class="pv-focus"><div><small>现在最该处理的一件事</small><b>' + esc(d.focus.title) + '</b><small>' + esc(d.focus.text) + '</small></div></div>' : '') +
      '<div class="pv-kpis">' + list(d.kpis, function (k) {
        return '<div class="pv-kpi' + tone(k.tone) + '"><small>' + esc(k.label) + '</small><b>' + esc(k.value) + '<em>' + esc(k.unit) + '</em></b><i>' + esc(k.note) + '</i></div>';
      }) + '</div>' +
      '<div class="pv-two"><div class="pv-card"><h4>今天的安排<span>' + (d.agenda || []).length + ' 个</span></h4>' +
      list(d.agenda, function (a) { return '<div class="pv-row"><span class="tm">' + esc(a.time) + '</span><span class="bar"></span><div class="tx">' + esc(a.title) + '<div class="mt">' + esc(a.meta) + '</div></div></div>'; }) +
      '</div><div class="pv-card"><h4>该跟进<span>客户</span></h4>' +
      list(d.contacts, function (c) { return '<div class="pv-row"><div class="tx">' + esc(c.name) + '<div class="mt">' + esc(c.note) + '</div></div><span class="r pv-tag warn">' + esc(c.when) + '</span></div>'; }) +
      '</div></div>' +
      '<div class="pv-card"><h4>今天要做<span>打勾就算完成</span></h4>' +
      list(d.todos, function (t) { return '<div class="pv-row"><span class="pv-chk"></span><div class="tx">' + esc(t.title) + '</div><span class="r pv-tag' + tone(t.tone) + '">' + esc(t.due) + '</span></div>'; }) + '</div>';
  };

  R.tasks = function (d) {
    return '<div class="pv-h"><div><small>日常</small><b>待办与日程</b></div><span class="pv-btn">新建待办</span></div>' +
      '<div class="pv-week">' + list(d.week, function (w) {
        return '<div class="pv-day' + (w.today ? ' today' : '') + '"><small>' + esc(w.day) + '</small>' + list(w.items, function (i) { return '<p>' + esc(i) + '</p>'; }) + '</div>';
      }) + '</div>' +
      '<div class="pv-card"><h4>这周到期<span>拖到别的日子就改了截止</span></h4>' +
      list(d.todos, function (t) { return '<div class="pv-row"><span class="pv-chk"></span><div class="tx">' + esc(t.title) + '</div><span class="pv-tag muted">' + esc(t.tag) + '</span><span class="r pv-tag' + tone(t.tone) + '">' + esc(t.due) + '</span></div>'; }) + '</div>';
  };

  R.clients = function (d) {
    var det = d.detail || {};
    return '<div class="pv-h"><div><small>客户</small><b>客户跟进</b></div><span class="pv-btn">记一笔跟进</span></div>' +
      '<div class="pv-board">' + list(d.stages, function (s) {
        return '<div class="pv-col"><h5>' + esc(s.name) + ' · ' + (s.items || []).length + '</h5>' + list(s.items, function (c) {
          return '<div class="pv-cc"><b>' + esc(c.name) + '</b><small>' + esc(c.meta) + '</small><span class="pv-tag' + tone(c.tone) + '">' + esc(c.when) + '</span></div>';
        }) + '</div>';
      }) + '</div>' +
      '<div class="pv-drawer"><div style="display:flex;align-items:baseline;gap:8px"><b class="n">' + esc(det.name) + '</b><small style="color:var(--p-muted)">' + esc(det.contact) + '</small></div>' +
      '<div class="pv-two"><div class="pv-kv">' + list(det.facts, function (f) { return '<span>' + esc(f[0]) + '</span><div>' + esc(f[1]) + '</div>'; }) + '</div>' +
      '<div class="pv-tl">' + list(det.timeline, function (t) { return '<div><b>' + esc(t.date) + '</b>' + esc(t.text) + '</div>'; }) + '</div></div>' +
      (det.care ? '<div class="pv-care">关怀建议 · ' + esc(det.care) + '</div>' : '') + '</div>';
  };

  R.projects = function (d) {
    return '<div class="pv-h"><div><small>生意</small><b>项目</b></div><span class="pv-btn">新建项目</span></div><div class="pv-proj">' +
      list(d.items, function (p) {
        var steps = (p.steps || []).map(function (s, i) { return '<span class="' + (i < p.at ? 'on' : i === p.at ? 'now' : '') + '" title="' + esc(s) + '"></span>'; }).join('');
        return '<div class="pv-card"><h4>' + esc(p.name) + '<span>' + esc(p.due) + '</span></h4><div class="pv-steps">' + steps + '</div>' +
          '<div class="pv-row"><div class="tx"><span class="mt">现在：' + esc((p.steps || [])[p.at] || '') + '</span> · 下一步：' + esc(p.next) + '</div></div></div>';
      }) + '</div>';
  };

  R.biz = function (d) {
    var max = Math.max.apply(null, d.bars || [1]);
    return '<div class="pv-h"><div><small>经营 · 汇总</small><b>昨天卖得怎么样</b></div><span class="pv-btn">分平台看</span></div>' +
      '<div class="pv-kpis">' + list(d.kpis, function (k) { return '<div class="pv-kpi' + tone(k.tone) + '"><small>' + esc(k.label) + '</small><b>' + esc(k.value) + '</b><i>' + esc(k.note) + '</i></div>'; }) + '</div>' +
      '<div class="pv-two"><div class="pv-card"><h4>近 15 天成交<span>按平台叠加</span></h4><div class="pv-chart">' +
      list(d.bars, function (b) { return '<i style="height:' + Math.round(b / max * 100) + '%"></i>'; }) + '</div></div>' +
      '<div class="pv-card"><h4>分平台<span>比前一天</span></h4><table class="pv-tbl">' +
      list(d.platforms, function (p) { return '<tr><td>' + esc(p.name) + (p.warn ? ' <span class="pv-tag danger">' + esc(p.warn) + '</span>' : '') + '</td><td class="n">' + esc(p.gmv) + '</td><td class="n ' + (p.down ? 'down' : 'up') + '">' + esc(p.delta) + '</td></tr>'; }) +
      '</table></div></div>';
  };

  R.content = function (d) {
    var ph = d.phone || {};
    return '<div class="pv-h"><div><small>内容 · 小红书</small><b>今天写什么</b></div><span class="pv-btn">开始创作</span></div>' +
      '<div class="pv-split"><div style="display:grid;gap:8px"><div class="pv-card"><h4>今日选题<span>早上已备好 10 个</span></h4>' +
      list(d.topics, function (t, i) { return '<div class="pv-row"><span class="tm">' + (i + 1) + '</span><div class="tx">' + esc(t) + '</div></div>'; }) + '</div>' +
      '<div class="pv-card"><h4>创作时在旁边和 AI 对话<span>展示数据时不出现</span></h4><div class="pv-chat"><p class="me">这篇口吻再轻松点，标题多给几个</p><p class="ai">按你的账号定位和写法卡改好了，标题给了 3 个备选，右边是手机上的样子。</p></div></div></div>' +
      '<div class="pv-phone"><div class="pv-cover">' + esc(ph.cover) + '</div><b>' + esc(ph.title) + '</b><p>' + esc(ph.text) + '</p><em>' + esc(ph.tags) + '</em></div></div>';
  };

  R.list = function (d) {
    return '<div class="pv-h"><div><b>' + esc(d.title) + '</b></div></div><div class="pv-card">' +
      list(d.items, function (i) { return '<div class="pv-row"><div class="tx">' + esc(i.title) + '<div class="mt">' + esc(i.meta) + '</div></div></div>'; }) + '</div>';
  };

  R.kb = function (d) {
    var doc = d.doc || {};
    return '<div class="pv-h"><div><small>资料</small><b>知识库</b></div></div><div class="pv-split"><div class="pv-card pv-tree">' +
      list(d.tree, function (t) { return '<div class="' + (t.on ? 'on' : '') + '"><span>' + esc(t.name) + (t.note ? ' <small>' + esc(t.note) + '</small>' : '') + '</span><small>' + esc(t.count) + ' 份</small></div>'; }) +
      '</div><div class="pv-card pv-doc"><h4>' + esc(doc.title) + '<span>只读</span></h4>' + list(doc.lines, function (l) { return '<p>' + esc(l) + '</p>'; }) + '</div></div>';
  };

  R.empty = function (d) {
    return '<div class="pv-empty"><b>' + esc(d.title) + '</b><span>' + esc(d.text) + '</span></div>';
  };

  /**
   * 画一个带侧栏的小工作台窗口
   * @param {object} mod 当前模块（含 preview）
   * @param {Array} navMods 侧栏里要显示的模块（已选的）
   * @param {object} theme 配色（含 palette）
   * @param {object} opts { compact, boss }
   */
  function window_(mod, navMods, theme, opts) {
    opts = opts || {};
    var p = theme.palette;
    var render = R[(mod.preview || {}).kind] || R.empty;
    var nav = list(navMods, function (m) { return '<div class="pv-nav' + (m.id === mod.id ? ' on' : '') + '">' + esc(m.name) + '</div>'; });
    return '<div class="pv' + (p.dark ? ' dark' : '') + (opts.compact ? ' compact' : '') + '" style="' + styleVars(p) + '">' +
      (opts.compact ? '' : '<div class="pv-chrome"><i></i><i></i><i></i><span>127.0.0.1 · ' + esc(opts.boss || '') + '的工作台</span></div>') +
      '<div class="pv-app"><div class="pv-side"><div class="pv-logo"><i>' + esc((opts.boss || '工').slice(0, 1)) + '</i><span>' + (opts.compact ? '' : '工作台') + '</span></div>' + nav + '</div>' +
      '<div class="pv-main k-' + esc((mod.preview || {}).kind || 'empty') + '">' + render(mod.preview || { title: mod.name, text: '' }) + '</div></div></div>';
  }

  window.Previews = { render: window_, esc: esc };
})();
