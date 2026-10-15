/* 搭建确认页：四步（核对 → 放什么 → 配色 → 使用方式与确认），确认后把结果交回 Codex。 */
(function () {
  'use strict';
  var esc = window.Previews.esc;
  var $ = function (id) { return document.getElementById(id); };
  var GROUP_ORDER = ['首页', '每天用', '生意', '内容', '资料'];
  var STATUS = { recommended: ['t-rec', '推荐'], optional: ['t-opt', '可选'], lacking: ['t-lack', '资料不够'], later: ['t-later', '稍后接数据'] };
  var NEXT_LABEL = ['都对，下一步', '下一步：挑配色', '下一步', '确认，开始搭建'];

  var rec = null;
  var state = { step: 0, fixes: {}, wants: {}, mods: {}, active: null, theme: null, boot: null, view: null, mode: 'manual', autostart: false };

  /* ---------- 读取推荐 ---------- */
  function load() {
    return fetch('/api/recommendations', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .catch(function () { return fetch('../example/recommendations.json').then(function (r) { if (!r.ok) throw new Error(); return r.json(); }); });
  }

  function init(data) {
    rec = data;
    (rec.wants || []).forEach(function (w) { state.wants[w.id] = !!w.selected; });
    (rec.modules || []).forEach(function (m) { state.mods[m.id] = !!m.selected || !!m.locked; });
    var firstRec = (rec.modules || [])[0];
    state.active = firstRec ? firstRec.id : null;
    var t = (rec.themes || []).filter(function (x) { return x.recommended; })[0] || (rec.themes || [])[0];
    state.theme = t ? t.id : null;
    // 推荐中的时间、auto 文案和旧结果都不构成自动运行授权；新一轮从手动开始。
    state.view = rec.schedule && rec.schedule.view.default;
    if (!Object.prototype.hasOwnProperty.call(VIEW, state.view)) state.view = '0830';
    $('logo').textContent = (rec.boss.call || '工').slice(0, 1);
    $('loading').hidden = true;
    $('footbar').hidden = false;
    renderRead(); renderPick(); renderThemes(); renderFinal();
    go(0);
  }

  /* ---------- 公共 ---------- */
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }
  // 重画一块以后把焦点放回刚才那个按钮，键盘用户不用从页面开头重新按 Tab
  function refocus(sel) { var el = document.querySelector(sel); if (el) el.focus({ preventScroll: true }); }
  function attr(name, value) { return '[' + name + '="' + (window.CSS && CSS.escape ? CSS.escape(value) : value) + '"]'; }
  function selectedMods() { return rec.modules.filter(function (m) { return state.mods[m.id]; }); }
  function themeObj() { return rec.themes.filter(function (t) { return t.id === state.theme; })[0] || rec.themes[0]; }
  function srcChips(arr) { return (arr && arr.length) ? '<div class="src">' + arr.map(function (s) { return '<code>' + esc(s) + '</code>'; }).join('') + '</div>' : ''; }

  function go(n) {
    state.step = n;
    document.querySelectorAll('.step').forEach(function (s) { s.hidden = Number(s.dataset.step) !== n; });
    document.querySelectorAll('#stepper li').forEach(function (li) {
      var i = Number(li.dataset.step);
      li.classList.toggle('on', i === n); li.classList.toggle('done', i < n);
    });
    $('progress').style.width = Math.min(100, (n / 4) * 100) + '%';
    $('back').hidden = n === 0 || n === 4;
    $('next').hidden = n === 4;
    $('next').textContent = NEXT_LABEL[n] || '下一步';
    $('footbar').hidden = n === 4;
    if (n === 1) { renderDetail(); fitList(); }
    if (n === 2) renderThemes();
    if (n === 3) renderFinal();
    updateSum();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    $('main').focus({ preventScroll: true });
  }

  function updateSum() {
    var s = '';
    if (state.step === 0) s = '改了 <b>' + Object.keys(state.fixes).length + '</b> 处';
    if (state.step === 1) s = '放进 <b>' + selectedMods().length + '</b> 个模块';
    if (state.step === 2) s = '配色：<b>' + esc(themeObj().name) + '</b>';
    if (state.step === 3) { var p = plan(); s = esc(p.title) + (state.mode === 'manual' ? '' : ' · ' + (state.autostart ? '开机自启' : '不自启')); }
    $('footSum').innerHTML = s;
  }

  /* ---------- 第一步：核对 ---------- */
  // 老板改过的一块：改后的句子标出来，下面一行灰色小字划掉改前的说法（只截出改动的那一段，前后各带几个字）
  var CTX = 10;
  function fixedHtml(before, after) {
    var a = Array.from(before), b = Array.from(after), p = 0, s = 0, word = /[0-9A-Za-z]/;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    // 不把一个数字或英文词从中间劈开（“10/20”改成“10/24”时整段标出来）
    while (p > 0 && word.test(a[p - 1]) && (word.test(a[p] || '') || word.test(b[p] || ''))) p--;
    while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    while (s > 0 && word.test(a[a.length - s]) && (word.test(a[a.length - s - 1] || '') || word.test(b[b.length - s - 1] || ''))) s--;
    var head = a.slice(0, p).join(''), tail = a.slice(a.length - s).join('');
    var gone = a.slice(p, a.length - s).join(''), added = b.slice(p, b.length - s).join('');
    var mark = function (str, tag) { // 空格留在标记外面，划线和底色只盖住字
      var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(str);
      return esc(m[1]) + (m[2] ? '<' + tag + '>' + esc(m[2]) + '</' + tag + '>' : '') + esc(m[3]);
    };
    var hb = Array.from(head), ta = Array.from(tail);
    // 前后各带几个字，碰到句号就停，读起来是半句完整的话
    var STOP = '。；！？\n';
    var near = hb.slice(-CTX), cut = -1, end = -1;
    near.forEach(function (ch, i) { if (STOP.indexOf(ch) >= 0) cut = i; });
    var ctxHead = (cut >= 0 ? '' : hb.length > CTX ? '…' : '') + near.slice(cut + 1).join('');
    var after = ta.slice(0, CTX);
    after.some(function (ch, i) { if (STOP.indexOf(ch) >= 0) { end = i; return true; } return false; });
    var ctxTail = end >= 0 ? after.slice(0, end + 1).join('') : after.join('') + (ta.length > CTX ? '…' : '');
    return '<div class="px">' + esc(head) + mark(added, 'ins') + esc(tail) + '</div>' +
      '<div class="was"><span class="was-k">改前</span>' + (gone.trim() ? esc(ctxHead) + mark(gone, 'del') + esc(ctxTail) : esc(ctxHead + ctxTail) + '（标出的那段是新加的）') + '</div>';
  }

  function renderRead() {
    $('h0').textContent = rec.boss.call + '，先看看我读懂的你';
    $('profile').innerHTML = rec.profile.map(function (p) {
      var fixed = state.fixes[p.id] != null;
      return '<div class="prow' + (fixed ? ' fixed' : '') + '" data-id="' + esc(p.id) + '">' +
        '<div class="pt">' + esc(p.title) + '</div><div>' + (fixed ? fixedHtml(p.text, state.fixes[p.id]) : '<div class="px">' + esc(p.text) + '</div>') + srcChips(p.sources) + '</div>' +
        '<button type="button" class="btn sm ghost edit" data-edit="' + esc(p.id) + '">改一下</button></div>';
    }).join('');
    $('notes').innerHTML = (rec.notes || []).length ? '<h2 style="font-size:15px;font-weight:600;margin:6px 0 2px">我注意到的</h2>' + rec.notes.map(function (n) {
      return '<div class="note' + (n.level === 'warn' ? ' warn' : '') + '"><span class="ic">' + (n.level === 'warn' ? '!' : 'i') + '</span><div><p>' + esc(n.text) + '</p>' + srcChips(n.sources) + '</div></div>';
    }).join('') : '';
    if (!rec.kb) {
      // 空白起步：复述来自刚才的对话，不是知识库
      $('lead0').textContent = '下面是你刚才在对话里说的、跟搭工作台有关的内容。哪句不对，点“改一下”直接改；都对就点下一步。';
      $('readSide').innerHTML = '<h2>还没有知识库</h2><p class="quiet">这次先搭一个空白的工作台：上面两块是你刚才在对话里说的。客户、项目可以边用边录。</p>' +
        '<div class="safe">以后建好知识库，对 Codex 说“工作台接上我的知识库”，客户和项目会对上，不用重搭。</div>';
      return;
    }
    var kb = rec.kb;
    $('readSide').innerHTML = '<h2>资料概览</h2><div class="big">' + esc(kb.files || '—') + '<small>个文件</small></div>' +
      (kb.layers ? '<ul>' + kb.layers.map(function (l) { return '<li><span>' + esc(l.name) + '</span><span>' + esc(l.count) + '</span></li>'; }).join('') + '</ul>' : '') +
      '<p class="quiet">从 <code>' + esc(kb.entry || 'AGENTS.md') + '</code> 读起；每条复述的出处写在左边。</p>' +
      '<div class="safe">你的资料原文不改：工作台的程序和数据另放在“工作台”文件夹，入口 AGENTS.md 里只加一小段“工作台在哪”（先问过你）。</div>';
  }

  $('profile').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    var row = b.closest('.prow'), id = row.dataset.id;
    var item = rec.profile.filter(function (p) { return p.id === id; })[0];
    if (b.dataset.edit) {
      row.classList.add('editing');
      var cur = state.fixes[id] != null ? state.fixes[id] : item.text;
      row.children[1].innerHTML = '<textarea aria-label="改成什么">' + esc(cur) + '</textarea><div class="ed-acts"><button type="button" class="btn sm pri" data-save="1">保存</button><button type="button" class="btn sm" data-cancel="1">取消</button></div>';
      row.querySelector('textarea').focus();
      b.hidden = true;
    } else if (b.dataset.save) {
      var v = row.querySelector('textarea').value.trim();
      if (v && v !== item.text) { state.fixes[id] = v; toast('记下了，搭的时候按你改的来'); } else delete state.fixes[id];
      renderRead(); updateSum(); refocus('#profile ' + attr('data-edit', id));
    } else if (b.dataset.cancel) { renderRead(); refocus('#profile ' + attr('data-edit', id)); }
  });

  /* ---------- 第二步：放什么 ---------- */
  function renderPick() {
    $('wantsBox').hidden = !(rec.wants || []).length; // 没写“最想先看到”的选项，就不显示这一行
    $('wants').innerHTML = (rec.wants || []).map(function (w) {
      return '<button type="button" class="chip" aria-pressed="' + !!state.wants[w.id] + '" data-want="' + esc(w.id) + '">' + esc(w.label) + '</button>';
    }).join('');
    var groups = {};
    rec.modules.forEach(function (m) { (groups[m.group] = groups[m.group] || []).push(m); });
    var order = GROUP_ORDER.concat(Object.keys(groups).filter(function (g) { return GROUP_ORDER.indexOf(g) < 0; }));
    $('modList').innerHTML = order.filter(function (g) { return groups[g]; }).map(function (g) {
      return '<div class="grp"><h3>' + esc(g) + '</h3><div class="grp-items">' + groups[g].map(function (m) {
        var st = STATUS[m.status] || STATUS.optional;
        return '<div class="mrow' + (state.mods[m.id] ? ' on' : '') + (m.locked ? ' locked' : '') + (state.active === m.id ? ' active' : '') + '" role="option" tabindex="0" aria-selected="' + (state.active === m.id) + '" data-mod="' + esc(m.id) + '">' +
          '<button type="button" class="box" aria-label="' + (state.mods[m.id] ? '不放' : '放进') + esc(m.name) + '" data-toggle="' + esc(m.id) + '"></button>' +
          '<div><div class="mt">' + esc(m.name) + '<span class="tag ' + st[0] + '">' + st[1] + '</span></div><div class="mw">' + esc(m.why) + '</div></div></div>';
      }).join('') + '</div></div>';
    }).join('') + '<label class="custom"><span>还想要别的？用一句话说</span><input id="customReq" type="text" placeholder="例如：门店会员生日提醒" value="' + esc(state.custom || '') + '"></label>';
    $('customReq').addEventListener('input', function (e) { state.custom = e.target.value; });
    fitList();
  }

  // 模块列表是单独滚动的框（电脑宽度时贴在顶部）。页面还没往下滚时它的顶在更下面，
  // 按固定高度算底部会压在底栏下面：按它现在离窗口顶多远、底栏多高，算出这一刻放得下的高度
  function fitList() {
    var el = $('modList');
    if (!el || typeof window.getComputedStyle !== 'function' || typeof el.getBoundingClientRect !== 'function') return; // 测试里的假窗口没有这些
    if (state.step !== 1 || window.getComputedStyle(el).position !== 'sticky') { el.style.maxHeight = ''; return; }
    var foot = document.querySelector('.footbar');
    var room = window.innerHeight - el.getBoundingClientRect().top - (foot ? foot.offsetHeight : 0) - 16;
    el.style.maxHeight = Math.max(240, Math.round(room)) + 'px';
  }
  // 滚动、改窗口大小时，等这一帧排好版再算（直接在事件里算，有时拿到的是滚动前的位置）
  var fitQueued = false;
  function fitSoon() {
    if (fitQueued) return;
    fitQueued = true;
    (window.requestAnimationFrame || setTimeout)(function () { fitQueued = false; fitList(); });
  }
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('scroll', fitSoon, { passive: true });
    window.addEventListener('resize', fitSoon);
  }

  function renderDetail() {
    var m = rec.modules.filter(function (x) { return x.id === state.active; })[0];
    if (!m) { $('modDetail').innerHTML = ''; return; }
    var st = STATUS[m.status] || STATUS.optional;
    var on = !!state.mods[m.id];
    var ribbon = m.status === 'later' ? '<div class="ribbon">这个模块要接数据，下面是接上以后的样子；先把框架搭好，稍后接上。' + (m.needs ? '要用到：' + esc(m.needs) + '。' : '') + '</div>' :
      m.status === 'lacking' ? '<div class="ribbon lack">现在资料不够，搭出来会是空的。' + (m.needs ? '需要：' + esc(m.needs) + '。' : '') + '</div>' : '';
    $('modDetail').innerHTML = '<div class="md-head"><h2>' + esc(m.name) + '</h2><span class="tag ' + st[0] + '">' + st[1] + '</span>' +
      (m.locked ? '<span class="quiet toggle">基础版自带</span>' : '<button type="button" class="btn ' + (on ? '' : 'pri') + ' toggle" data-toggle="' + esc(m.id) + '">' + (on ? '不放这个' : '放进工作台') + '</button>') + '</div>' +
      '<p class="md-why">' + esc(m.why) + '</p>' +
      (m.uses && m.uses.length ? '<div class="md-uses">' + m.uses.map(function (u) { return '<span>用到你的 ' + esc(u) + '</span>'; }).join('') + '</div>' : '') + ribbon +
      window.Previews.render(m, selectedMods().concat(on ? [] : [m]), themeObj(), { boss: rec.boss.call });
  }

  function toggleMod(id) {
    var m = rec.modules.filter(function (x) { return x.id === id; })[0];
    if (!m || m.locked) return;
    state.mods[id] = !state.mods[id];
    if (state.mods[id] && m.status === 'lacking') toast('资料不够，搭出来先是空的；补资料后自动有内容');
    state.active = id;
    renderPick(); renderDetail(); updateSum();
  }

  $('modList').addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle]');
    if (t) { var tid = t.dataset.toggle; toggleMod(tid); refocus('#modList ' + attr('data-toggle', tid)); return; }
    var row = e.target.closest('[data-mod]');
    if (row) { state.active = row.dataset.mod; renderPick(); renderDetail(); }
  });
  $('modList').addEventListener('keydown', function (e) {
    // 勾选框是按钮，Enter / 空格交给按钮自己（勾上或勾掉）；只有落在整行上时才是“看这个模块”
    if (e.target.closest('button, input')) return;
    var row = e.target.closest('[data-mod]');
    if (!row || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault(); state.active = row.dataset.mod; renderPick(); renderDetail();
    refocus('#modList ' + attr('data-mod', state.active));
  });
  $('modDetail').addEventListener('click', function (e) {
    var t = e.target.closest('[data-toggle]');
    if (t) { toggleMod(t.dataset.toggle); refocus('#modDetail [data-toggle]'); }
  });
  $('wants').addEventListener('click', function (e) {
    var c = e.target.closest('[data-want]'); if (!c) return;
    var id = c.dataset.want; state.wants[id] = !state.wants[id];
    var w = rec.wants.filter(function (x) { return x.id === id; })[0];
    if (state.wants[id] && w && w.module && !state.mods[w.module]) {
      state.mods[w.module] = true; state.active = w.module;
      var m = rec.modules.filter(function (x) { return x.id === w.module; })[0];
      if (m) toast('已把“' + m.name + '”放进来');
    }
    renderPick(); renderDetail(); updateSum(); refocus('#wants ' + attr('data-want', id));
  });

  /* ---------- 第三步：配色 ---------- */
  function renderThemes() {
    var home = rec.modules.filter(function (m) { return m.id === 'today'; })[0] || rec.modules[0];
    $('themes').innerHTML = rec.themes.map(function (t) {
      var p = t.palette;
      return '<button type="button" class="theme" role="radio" aria-checked="' + (state.theme === t.id) + '" data-theme="' + esc(t.id) + '">' +
        window.Previews.render(home, selectedMods(), t, { compact: true, boss: rec.boss.call }) +
        '<div class="tn"><div><b>' + esc(t.name) + (t.recommended ? ' <span class="tag t-rec">推荐</span>' : '') + '</b><small>' + esc(t.fit) + '</small></div>' +
        '<span class="sw"><i style="background:' + esc(p.primary) + '"></i><i style="background:' + esc(p.sidebar) + '"></i><i style="background:' + esc(p.background) + '"></i></span></div></button>';
    }).join('');
  }
  $('themes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-theme]'); if (!b) return;
    state.theme = b.dataset.theme; renderThemes(); updateSum(); refocus('#themes ' + attr('data-theme', state.theme));
  });

  /* ---------- 第四步：使用方式与确认 ---------- */
  var VIEW = { boot: null, '0830': '08:30', '0900': '09:00', '1130': '11:30' };
  function plan() {
    if (state.mode === 'manual') return { prepare: null, notify: null, title: '手动打开、不提醒、不自启', text: '需要时手动启动并打开工作台；提醒总开关关闭，不创建开机自启或 AI 定时任务。以后想开提醒，可以再改。' };
    var notify = VIEW[state.view];
    var runtime = state.autostart ? '已选择开机自启：登录后启动工作台服务。' : '不设开机自启：需要你手动启动工作台服务。';
    return { prepare: null, notify: notify, title: notify ? '每天 ' + notify + ' 提醒你看' : '服务启动 5 分钟后提醒你看', text: runtime + '只有电脑开着、未睡眠且工作台服务正在运行才会提醒；关闭网页后可能使用电脑系统通知。不会自动生成 AI 定时任务。' };
  }

  // 旧推荐的 auto 可能写着“都开”，只展示导航和数据位置，不沿用提醒/自启建议。
  function displayAuto() { return (rec.auto || []).filter(function (a) { return a.label === '导航' || a.label === '数据位置' || a.label === '数据放哪'; }); }

  function radioChips(q, key) {
    return '<h2>' + esc(q.question) + '</h2>' + (q.hint ? '<p class="hint">' + esc(q.hint) + '</p>' : '') +
      '<div class="chips" role="radiogroup">' + q.options.map(function (o) {
        return '<button type="button" class="chip" role="radio" aria-checked="' + (state[key] === o.id) + '" data-' + key + '="' + esc(o.id) + '">' + esc(o.label) + '</button>';
      }).join('') + '</div>';
  }

  function renderFinal() {
    $('qMode').innerHTML = radioChips({ question: '平时怎么用？', options: [
      { id: 'manual', label: '手动打开、不提醒、不自启' },
      { id: 'reminders', label: '开启提醒' }
    ] }, 'mode');
    $('qView').hidden = state.mode === 'manual';
    $('qAutostart').hidden = state.mode === 'manual';
    $('qView').innerHTML = radioChips({ question: '什么时候提醒看汇总？', options: [
      { id: 'boot', label: '服务启动 5 分钟后' }, { id: '0830', label: '8:30' },
      { id: '0900', label: '9:00' }, { id: '1130', label: '11:30' }
    ] }, 'view');
    $('qAutostart').innerHTML = '<h2>要让工作台随开机自动启动吗？</h2><p class="hint">开启提醒不等于开机自启。默认由你手动启动服务。</p><div class="chips" role="radiogroup">' +
      '<button type="button" class="chip" role="radio" aria-checked="' + !state.autostart + '" data-autostart="off">不自启，我手动启动</button>' +
      '<button type="button" class="chip" role="radio" aria-checked="' + state.autostart + '" data-autostart="on">开机自动启动</button></div>';
    var p = plan();
    $('plan').innerHTML = '<span>按你的选择</span><b>' + esc(p.title) + '</b><p>' + esc(p.text) + '</p>';
    $('auto').innerHTML = displayAuto().map(function (a) { return '<li><span><b>' + esc(a.label) + '</b>：' + esc(a.value) + '</span></li>'; }).join('');
    $('doneOpen').textContent = state.mode === 'manual' ? '搭好后按说明手动启动并打开；不需要允许通知。' : '搭好后按说明打开工作台；需要浏览器通知时，点“开启提醒”并允许。';
    var t = themeObj();
    $('summary').innerHTML = selectedMods().map(function (m) { return '<span>' + esc(m.name) + '</span>'; }).join('') +
      (state.custom ? '<span>另外想要：' + esc(state.custom) + '</span>' : '') +
      '<span class="sw"><i style="background:' + esc(t.palette.primary) + '"></i>配色：' + esc(t.name) + '</span>';
  }
  $('qMode').addEventListener('click', function (e) { var b = e.target.closest('[data-mode]'); if (b) { state.mode = b.dataset.mode; if (state.mode === 'manual') state.autostart = false; renderFinal(); updateSum(); refocus('#qMode ' + attr('data-mode', state.mode)); } });
  $('qAutostart').addEventListener('click', function (e) { var b = e.target.closest('[data-autostart]'); if (b && state.mode === 'reminders') { state.autostart = b.dataset.autostart === 'on'; renderFinal(); updateSum(); refocus('#qAutostart ' + attr('data-autostart', b.dataset.autostart)); } });
  $('qView').addEventListener('click', function (e) { var b = e.target.closest('[data-view]'); if (b) { state.view = b.dataset.view; renderFinal(); updateSum(); refocus('#qView ' + attr('data-view', state.view)); } });

  /* ---------- 确认 ---------- */
  function result() {
    var p = plan();
    return {
      schema: 'boss-workbench-confirm/2',
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      boss: rec.boss,
      profile_fixes: Object.keys(state.fixes).map(function (id) {
        var item = rec.profile.filter(function (x) { return x.id === id; })[0];
        return { id: id, title: item ? item.title : id, text: state.fixes[id] };
      }),
      extra: $('extra').value.trim(),
      wants: (rec.wants || []).filter(function (w) { return state.wants[w.id]; }).map(function (w) { return w.label; }),
      modules: selectedMods().map(function (m) { return { id: m.id, name: m.name, status: m.status }; }),
      custom_request: (state.custom || '').trim(),
      theme: state.theme,
      schedule: { mode: state.mode, notifications_enabled: state.mode === 'reminders', autostart_enabled: state.autostart, boot: null, view: state.mode === 'manual' ? null : state.view, prepare_at: p.prepare, notify_at: p.notify, plan: p.title },
      auto: displayAuto()
    };
  }

  function submit() {
    var btn = $('next'); btn.disabled = true; btn.textContent = '正在交给 Codex…';
    $('sendFail').hidden = true;
    var body = JSON.stringify(result());
    fetch('/api/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function () { $('doneLead').textContent = '你的选择已经交给 Codex，它会接着把工作台搭起来。'; go(4); })
      .catch(function () {
        if (location.protocol === 'file:') { $('doneLead').textContent = '（演示页面：没有连着 Codex，选择没有真正提交。）'; go(4); return; }
        showSendFail(JSON.stringify(result(), null, 2));
      })
      .then(function () { btn.disabled = false; btn.textContent = NEXT_LABEL[state.step] || '下一步'; });
  }

  // 交不上去（确认页服务已经关了）：选择不丢，给老板一段文字复制回 Codex
  function showSendFail(text) {
    var box = $('sendFail');
    box.innerHTML = '<b>没交上去</b><p>这个页面和 Codex 断开了。你的选择都还在：点“复制”，回到 Codex 对话框里粘贴发出去，它照样接着搭。</p>' +
      '<textarea readonly rows="5" aria-label="你的选择"></textarea><div><button type="button" class="btn sm pri" id="copyResult">复制</button></div>';
    box.querySelector('textarea').value = text;
    box.hidden = false;
    $('copyResult').addEventListener('click', function () {
      var ta = box.querySelector('textarea');
      var done = function () { toast('复制好了，去 Codex 里粘贴'); };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () { ta.select(); document.execCommand('copy'); done(); });
      else { ta.select(); document.execCommand('copy'); done(); }
    });
    $('copyResult').focus();
  }

  // 页面开着时每分钟打个招呼，确认页服务就不会因为“没人用”自己关掉；连不上就提示
  function heartbeat() {
    if (location.protocol === 'file:') return;
    fetch('/api/health', { cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(); $('offline').hidden = true; })
      .catch(function () { if (state.step < 4) $('offline').hidden = false; });
  }
  setInterval(heartbeat, 60 * 1000);

  $('next').addEventListener('click', function () { if (state.step < 3) go(state.step + 1); else submit(); });
  $('back').addEventListener('click', function () { if (state.step > 0) go(state.step - 1); });

  load().then(init).catch(function () { $('loading').textContent = '没读到推荐内容。请回到 Codex，让它重新打开确认页。'; });

  // 演示截图用：?step=2&active=clients 直接打开某一步；还能加 theme=wood、edit=people（用 demo_fix 演示改一下）
  var q = new URLSearchParams(location.search);
  if (q.get('step')) {
    var wait = setInterval(function () {
      if (!rec) return; clearInterval(wait);
      if (q.get('active')) state.active = q.get('active');
      if (q.get('theme')) state.theme = q.get('theme');
      if (q.get('edit')) {
        // 演示“改一下”：用 profile 里的 demo_fix 当老板改后的文字（只给演示截图用，正式流程不读这个字段）
        var demo = rec.profile.filter(function (p) { return p.id === q.get('edit'); })[0];
        if (demo) state.fixes[demo.id] = demo.demo_fix || demo.text + '（老板改过）';
      }
      renderRead(); renderPick(); go(Number(q.get('step')));
    }, 50);
  }
})();
