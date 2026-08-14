/* ============================================================
   PyLearn admin-shared.js
   - 主题切换（替代每页内联的 tt()）
   - 通知铃铛下拉（自动在 .top-actions 里找到铃铛按钮注入面板）
   - 顶部/工具栏搜索（过滤 .table 里的 .t-row）
   - 表头列排序（点击 .t-head > div 切换升/降序）
   仅 mockup 阶段使用，正式实现走 Server Component + 表单提交
   ============================================================ */
(function () {
  'use strict';

  /* -------- CSS 注入（一次性） -------- */
  var SHARED_CSS = [
    '/* 通知 */',
    '.dot{position:absolute;top:7px;right:7px;width:8px;height:8px;border-radius:50%;background:var(--danger);border:2px solid var(--bg)}',
    '.notif-wrap{position:relative}',
    '.notif{position:absolute;right:0;top:calc(100% + 8px);width:340px;border:1px solid var(--border);border-radius:12px;background:var(--card);box-shadow:0 12px 32px -8px rgba(15,23,42,.22);overflow:hidden;opacity:0;visibility:hidden;transform:translateY(-6px);transition:opacity .18s,transform .18s,visibility .18s;z-index:40}',
    'html.dark .notif{box-shadow:0 12px 32px -8px rgba(0,0,0,.6)}',
    '.notif.open{opacity:1;visibility:visible;transform:none}',
    '.notif-head{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--border)}',
    '.notif-head b{font-size:14px;font-weight:600}',
    '.notif-head button{font-size:12px;color:var(--primary);font-weight:500;cursor:pointer}',
    '.notif-list{max-height:340px;overflow-y:auto}',
    '.notif-item{display:flex;gap:11px;padding:13px 16px;border-bottom:1px solid var(--border);transition:background .18s}',
    '.notif-item:last-child{border-bottom:none}',
    '.notif-item:hover{background:var(--surface)}',
    'html.dark .notif-item:hover{background:color-mix(in srgb,var(--surface) 60%,transparent)}',
    '.notif-item .ni{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0}',
    '.notif-item .nb{flex:1;min-width:0}',
    '.notif-item .nb p{font-size:13px;font-weight:500;line-height:1.4}',
    '.notif-item .nb span{display:block;font-size:11.5px;color:var(--muted);margin-top:2px;line-height:1.5}',
    '.notif-item .nb em{display:block;font-style:normal;font-size:11px;color:var(--subtle);margin-top:4px}',
    '.notif-item.unread{background:color-mix(in srgb,var(--primary-subtle) 30%,transparent)}',
    '.notif-foot{padding:11px 16px;border-top:1px solid var(--border);background:var(--surface);text-align:center}',
    'html.dark .notif-foot{background:color-mix(in srgb,var(--surface) 60%,transparent)}',
    '.notif-foot a{font-size:12.5px;color:var(--primary);font-weight:500}',
    '/* 搜索空态 */',
    '.t-empty{padding:36px 20px;text-align:center;color:var(--muted);font-size:13px}',
    '.t-empty svg{font-size:24px;color:var(--subtle);margin-bottom:8px;display:block;margin-inline:auto}',
    '/* 列排序 */',
    '.t-head > div[data-sort]{cursor:pointer;user-select:none;transition:color .15s}',
    '.t-head > div[data-sort]:hover{color:var(--primary)}',
    '.sort-arrow{display:inline-block;margin-left:4px;font-size:10px;opacity:.35;transition:opacity .15s,transform .15s}',
    '.t-head > div[data-sort].on .sort-arrow{opacity:1;color:var(--primary)}',
    '.t-head > div[data-sort].on.desc .sort-arrow{transform:rotate(180deg)}'
  ].join('\n');

  function injectCSS() {
    if (document.getElementById('admin-shared-css')) return;
    var s = document.createElement('style');
    s.id = 'admin-shared-css';
    s.textContent = SHARED_CSS;
    document.head.appendChild(s);
  }

  /* -------- 主题切换 -------- */
  function initTheme() {
    document.querySelectorAll('[id="use-theme"]').forEach(function (sun) {
      var btn = sun.closest('.icon-btn');
      if (!btn || btn.dataset.themeBound) return;
      btn.dataset.themeBound = '1';
      btn.addEventListener('click', function () {
        var d = document.documentElement.classList.toggle('dark');
        sun.setAttribute('href', d ? '#i-moon' : '#i-sun');
        localStorage.setItem('theme', d ? 'dark' : 'light');
      });
    });
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark');
      document.querySelectorAll('[id="use-theme"]').forEach(function (sun) {
        sun.setAttribute('href', '#i-moon');
      });
    }
  }

  /* -------- 通知铃铛 -------- */
  var NOTIF_HTML =
    '<div class="notif-head">' +
      '<b>通知</b><button data-read-all>全部标为已读</button>' +
    '</div>' +
    '<div class="notif-list">' +
      '<a class="notif-item unread" href="admin-judge-queue.html">' +
        '<div class="ni ic-d"><svg><use href="#i-warn"/></svg></div>' +
        '<div class="nb"><p>评测出现 2 个系统错误</p><span>容器启动超时 · cgroup v2 控制器未挂载</span><em>4 分钟前</em></div>' +
      '</a>' +
      '<a class="notif-item unread" href="admin-students-classes.html">' +
        '<div class="ni ic-w"><svg><use href="#i-class"/></svg></div>' +
        '<div class="nb"><p>高三(3)班仍未分配任课教师</p><span>开学已 3 天，该班无法下发作业</span><em>今天 09:12</em></div>' +
      '</a>' +
      '<a class="notif-item" href="admin-students-import.html">' +
        '<div class="ni ic-p"><svg><use href="#i-upload"/></svg></div>' +
        '<div class="nb"><p>高一(2)班学生导入完成</p><span>46 名 · 初始密码已生成，可导出分发</span><em>1 小时前</em></div>' +
      '</a>' +
      '<a class="notif-item" href="admin-teachers.html">' +
        '<div class="ni ic-s"><svg><use href="#i-check"/></svg></div>' +
        '<div class="nb"><p>新增 2 位教师账号</p><span>张明远 · 李雪</span><em>今天</em></div>' +
      '</a>' +
    '</div>' +
    '<div class="notif-foot"><a href="admin-settings.html#s-notify">通知设置</a></div>';

  function initBell() {
    // 已存在的 .notif（dashboard 旧版内联）跳过，避免重复注入
    if (document.querySelector('.notif-wrap')) return;

    document.querySelectorAll('.top-actions .icon-btn').forEach(function (btn) {
      var use = btn.querySelector('svg use');
      if (!use || use.getAttribute('href') !== '#i-bell') return;
      if (btn.dataset.bellBound) return;
      btn.dataset.bellBound = '1';

      // 加未读小红点
      if (!btn.querySelector('.dot')) {
        var dot = document.createElement('span');
        dot.className = 'dot';
        btn.appendChild(dot);
      }

      var wrap = document.createElement('div');
      wrap.className = 'notif-wrap';
      btn.parentNode.insertBefore(wrap, btn);
      wrap.appendChild(btn);

      var notif = document.createElement('div');
      notif.className = 'notif';
      notif.innerHTML = NOTIF_HTML;
      wrap.appendChild(notif);

      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        notif.classList.toggle('open');
      });
    });

    document.addEventListener('click', function (e) {
      if (e.target.closest('.notif-wrap')) return;
      document.querySelectorAll('.notif.open').forEach(function (n) { n.classList.remove('open'); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      document.querySelectorAll('.notif.open').forEach(function (n) { n.classList.remove('open'); });
    });

    // 全部已读
    document.addEventListener('click', function (e) {
      if (!e.target.matches('[data-read-all]')) return;
      document.querySelectorAll('.notif-item.unread').forEach(function (it) { it.classList.remove('unread'); });
      document.querySelectorAll('.notif-wrap .dot').forEach(function (d) { d.style.display = 'none'; });
    });
  }

  /* -------- 搜索过滤 -------- */
  function initSearch() {
    var inputs = document.querySelectorAll('.search input, .tb-search input');
    inputs.forEach(function (input) {
      if (input.dataset.searchBound) return;
      input.dataset.searchBound = '1';

      input.addEventListener('input', function () {
        var q = input.value.trim().toLowerCase();
        // 找同页面唯一的 .table（搜索就近第一个）
        var table = input.closest('.search, .tb-search')
          ? (document.querySelector('.content .table') || document.querySelector('.table'))
          : null;
        if (!table) return;
        var rows = table.querySelectorAll(':scope > .t-row');
        var visible = 0;
        rows.forEach(function (row) {
          var hit = !q || row.textContent.toLowerCase().indexOf(q) >= 0;
          row.style.display = hit ? '' : 'none';
          if (hit) visible++;
        });
        toggleEmpty(table, visible === 0);
      });
    });
  }

  function toggleEmpty(table, show) {
    var existing = table.querySelector(':scope > .t-empty');
    if (!show) { if (existing) existing.remove(); return; }
    if (existing) return;
    var div = document.createElement('div');
    div.className = 't-empty';
    div.innerHTML = '<svg><use href="#i-search"/></svg>没有匹配的结果 · 试试更短的关键词';
    table.appendChild(div);
  }

  /* -------- 列排序 -------- */
  function initSort() {
    document.querySelectorAll('.t-head').forEach(function (head) {
      if (head.dataset.sortBound) return;
      head.dataset.sortBound = '1';

      var cols = Array.from(head.children);
      cols.forEach(function (th, idx) {
        // 最后一列（操作）和显式 data-sort="no" 的不参与
        if (idx === cols.length - 1) return;
        if (th.dataset.sort === 'no') return;
        th.setAttribute('data-sort', '');
        var arrow = document.createElement('span');
        arrow.className = 'sort-arrow';
        arrow.textContent = '▲';
        th.appendChild(arrow);

        th.addEventListener('click', function () {
          var wasOn = th.classList.contains('on');
          var desc = wasOn && th.classList.contains('asc');
          // 清除其他列高亮
          cols.forEach(function (c) {
            c.classList.remove('on', 'asc', 'desc');
          });
          th.classList.add('on');
          th.classList.add(desc ? 'desc' : 'asc');

          var table = head.parentElement;
          var rows = Array.from(table.querySelectorAll(':scope > .t-row'));
          rows.sort(function (a, b) {
            var av = cellValue(a.children[idx]);
            var bv = cellValue(b.children[idx]);
            var an = parseFloat(av.num), bn = parseFloat(bv.num);
            if (!isNaN(an) && !isNaN(bn) && av.isNum && bv.isNum) {
              return desc ? bn - an : an - bn;
            }
            return desc ? bv.text.localeCompare(av.text, 'zh') : av.text.localeCompare(bv.text, 'zh');
          });
          rows.forEach(function (r) { table.appendChild(r); });
        });
      });
    });
  }

  function cellValue(cell) {
    if (!cell) return { text: '', num: NaN, isNum: false };
    var text = cell.textContent.trim();
    // 提取首个数字串（如 "6 班" → 6, "83%" → 83, "1/3" → 1, "2024" → 2024）
    var m = text.match(/-?\d+(\.\d+)?/);
    if (m) {
      var n = parseFloat(m[0]);
      // 整段就由数字组成（含千分位）才算纯数字
      var pure = text.replace(/[\s,，]/g, '').match(/^-?\d+(\.\d+)?(%)?$/);
      return { text: text, num: n, isNum: !!pure };
    }
    return { text: text, num: NaN, isNum: false };
  }

  function cellValue(cell) {
    if (!cell) return { text: '', num: NaN, isNum: false };
    var text = cell.textContent.trim();
    // 提取首个数字串（如 "6 班" → 6, "83%" → 83, "1/3" → 1, "2024" → 2024）
    var m = text.match(/-?\d+(\.\d+)?/);
    if (m) {
      var n = parseFloat(m[0]);
      // 整段就由数字组成（含千分位）才算纯数字
      var pure = text.replace(/[\s,，]/g, '').match(/^-?\d+(\.\d+)?(%)?$/);
      return { text: text, num: n, isNum: !!pure };
    }
    return { text: text, num: NaN, isNum: false };
  }

  /* -------- 通用模态对话框 -------- */
  var MODAL_CSS = [
    '.mask{position:fixed;inset:0;background:rgba(15,23,42,.45);backdrop-filter:blur(2px);',
    '     display:flex;align-items:center;justify-content:center;z-index:100;',
    '     opacity:0;visibility:hidden;transition:opacity .2s,visibility .2s;padding:20px}',
    'html.dark .mask{background:rgba(0,0,0,.6)}',
    '.mask.open{opacity:1;visibility:visible}',
    '.dlg{background:var(--card);border-radius:14px;width:100%;max-width:440px;',
    '     box-shadow:0 24px 48px -12px rgba(15,23,42,.3);transform:translateY(8px) scale(.98);',
    '     transition:transform .2s}',
    'html.dark .dlg{box-shadow:0 24px 48px -12px rgba(0,0,0,.7)}',
    '.mask.open .dlg{transform:none}',
    '.dlg-hd{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 14px}',
    '.dlg-ic{width:34px;height:34px;border-radius:9px;display:flex;align-items:center;',
    '        justify-content:center;font-size:17px;flex-shrink:0}',
    '.dlg-hd h3{font-size:15.5px;font-weight:600;flex:1;line-height:1.35;padding-top:6px}',
    '.dlg-bd{padding:0 20px 6px;font-size:13.5px;color:var(--muted);line-height:1.65}',
    '.dlg-bd p+p{margin-top:8px}',
    '.dlg-bd code{font-family:"SF Mono",Menlo,Consolas,monospace;font-size:12px;',
    '            background:var(--surface);padding:1px 6px;border-radius:4px;color:var(--fg)}',
    'html.dark .dlg-bd code{background:var(--border)}',
    '.dlg-bd .imp{color:var(--danger);font-weight:500}',
    '.dlg-ft{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px 18px}',
    '.dlg.danger .dlg-ic{background:var(--danger-subtle);color:var(--danger)}',
    '.dlg.danger .dlg-hd h3{color:var(--danger)}',
    /* 表单字段 */
    '.dlg-fm{display:flex;flex-direction:column;gap:14px;padding:0 20px 6px}',
    '.dlg-fm label{font-size:12.5px;color:var(--muted);font-weight:500}',
    '.dlg-fm label b{display:block;color:var(--fg);font-size:13px;font-weight:500;margin-bottom:5px}',
    '.dlg-fm input,.dlg-fm textarea,.dlg-fm select{',
    '  width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:8px;',
    '  background:var(--surface);font-size:14px;outline:none;transition:.18s;color:var(--fg);',
    '  font-family:inherit;resize:vertical}',
    '.dlg-fm input:focus,.dlg-fm textarea:focus,.dlg-fm select:focus{',
    '  border-color:var(--primary);background:var(--card)}',
    '.dlg-fm textarea{min-height:80px}',
    '.dlg-fm-field{display:flex;flex-direction:column;gap:6px}',
    '.dlg-fm-field label b{display:flex;align-items:center;gap:4px}',
    '.dlg-fm-req{color:var(--danger);font-weight:600}',
    '.dlg-fm-hint{font-size:12px;color:var(--muted);line-height:1.5}',
    '.dlg-fm-err{font-size:12px;color:var(--danger);display:none}',
    '.dlg-fm-field.has-err input,.dlg-fm-field.has-err select,.dlg-fm-field.has-err textarea{',
    '  border-color:var(--danger);background:color-mix(in srgb,var(--danger-subtle) 30%,var(--surface))}',
    '.dlg-fm-field.has-err .dlg-fm-err{display:block}',
    '.dlg-fm-row{display:flex;gap:12px}',
    '.dlg-fm-row .dlg-fm-field{flex:1}',
    '.dlg-fm-foot{margin-top:6px;padding-top:12px;border-top:1px solid var(--border);',
    '             font-size:12px;color:var(--muted);line-height:1.5}'
  ].join('');

  function appendCSS(css) {
    var s = document.getElementById('admin-shared-css');
    if (s) s.textContent += '\n' + css;
    else injectCSS() || appendCSS(css);
  }
  function ensureModalCSS() {
    if (document.getElementById('modal-css')) return;
    var s = document.getElementById('admin-shared-css');
    if (s) {
      s.textContent += '\n' + MODAL_CSS;
    } else {
      // 页面没有 admin-shared-css 容器：直接建一个 style 标签塞进去
      var n = document.createElement('style');
      n.id = 'admin-shared-css';
      n.textContent = MODAL_CSS;
      document.head.appendChild(n);
    }
    var marker = document.createElement('meta');
    marker.id = 'modal-css';
    document.head.appendChild(marker);
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderBody(body) {
    if (!body) return '';
    if (Array.isArray(body)) return body.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
    if (typeof body === 'string' && body.indexOf('\n') >= 0) {
      return body.split('\n').map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
    }
    return '<p>' + esc(body) + '</p>';
  }

  var modalSeq = 0;

  function buildModal(opts) {
    var id = 'modal-' + (++modalSeq);
    var danger = !!opts.danger;
    var html =
      '<div class="mask" id="' + id + '">' +
        '<div class="dlg ' + (danger ? 'danger' : '') + '" role="dialog">' +
          '<div class="dlg-hd">' +
            '<div class="dlg-ic">' +
              '<svg><use href="#' + (danger ? 'i-warn' : 'i-info') + '"/></svg>' +
            '</div>' +
            '<h3>' + esc(opts.title || '请确认') + '</h3>' +
          '</div>' +
          (opts.form ? '<div class="dlg-fm">' + opts.form + '</div>' : '') +
          (opts.body ? '<div class="dlg-bd">' + renderBody(opts.body) + '</div>' : '') +
          '<div class="dlg-ft">' +
            '<button class="btn-ghost" data-cancel>' + esc(opts.cancelText || '取消') + '</button>' +
            '<button class="' + (danger ? 'btn-danger' : 'btn') + '" data-confirm>' +
              esc(opts.confirmText || '确认') +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    var wrap = document.createElement('div');
    wrap.innerHTML = html;
    var mask = wrap.firstChild;
    document.body.appendChild(mask);
    requestAnimationFrame(function () { mask.classList.add('open'); });
    return mask;
  }

  function destroyModal(mask) {
    mask.classList.remove('open');
    setTimeout(function () { mask.remove(); }, 200);
  }

  /* -------- Modal.form：表单弹窗 -------- */
  function renderField(f) {
    var id = 'fld-' + f.name + '-' + (++modalSeq);
    var html = '<div class="dlg-fm-field" data-field="' + esc(f.name) + '">';
    var labelText = esc(f.label || f.name);
    var reqMark = f.required ? ' <span class="dlg-fm-req">*</span>' : '';
    html += '<label for="' + id + '"><b>' + labelText + reqMark + '</b></label>';
    var type = f.type || 'text';
    var common = 'name="' + esc(f.name) + '" id="' + id + '"' +
      (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') +
      (f.required ? ' required' : '') +
      (f.disabled || f.readonly ? ' disabled' : '') +
      (f.readonly ? ' readonly' : '') +
      (f.maxlength ? ' maxlength="' + f.maxlength + '"' : '') +
      (f.minlength ? ' minlength="' + f.minlength + '"' : '') +
      (f.pattern ? ' pattern="' + esc(f.pattern.source) + '"' : '') +
      (f.autocomplete ? ' autocomplete="' + esc(f.autocomplete) + '"' : '');
    if (type === 'select') {
      html += '<select ' + common + '>';
      (f.options || []).forEach(function (o) {
        var sel = String(o.value) === String(f.value) ? ' selected' : '';
        html += '<option value="' + esc(o.value) + '"' + sel + (o.disabled ? ' disabled' : '') + '>' + esc(o.label) + '</option>';
      });
      html += '</select>';
    } else if (type === 'textarea') {
      html += '<textarea ' + common + '>' + esc(f.value || '') + '</textarea>';
    } else {
      html += '<input type="' + esc(type) + '" value="' + esc(f.value || '') + '" ' + common + '>';
    }
    if (f.hint) html += '<div class="dlg-fm-hint">' + esc(f.hint) + '</div>';
    html += '<div class="dlg-fm-err"></div>';
    html += '</div>';
    return html;
  }

  function getFieldValues(mask, fields) {
    var values = {};
    fields.forEach(function (f) {
      var el = mask.querySelector('[name="' + cssEscape(f.name) + '"]');
      values[f.name] = el ? el.value : '';
    });
    return values;
  }

  function setFieldError(mask, name, msg) {
    var wrap = mask.querySelector('[data-field="' + cssEscape(name) + '"]');
    if (!wrap) return;
    wrap.classList.add('has-err');
    wrap.querySelector('.dlg-fm-err').textContent = msg;
  }

  function clearErrors(mask) {
    mask.querySelectorAll('.dlg-fm-field.has-err').forEach(function (w) {
      w.classList.remove('has-err');
    });
  }

  function defaultValidate(fields, values) {
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i], v = values[f.name];
      var sv = v == null ? '' : String(v);
      if (f.required && !sv.trim()) return { field: f.name, msg: '不能为空' };
      if (f.maxlength && sv.length > f.maxlength) return { field: f.name, msg: '不能超过 ' + f.maxlength + ' 字' };
      if (f.minlength && sv.trim().length < f.minlength) return { field: f.name, msg: '至少 ' + f.minlength + ' 字' };
      if (f.pattern && sv && !f.pattern.test(sv)) return { field: f.name, msg: '格式不正确' };
    }
    return null;
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  var Modal = {
    confirm: function (opts) {
      ensureModalCSS();
      opts = opts || {};
      var mask = buildModal(opts);
      var onKey = function (e) {
        if (e.key === 'Escape') {
          destroyModal(mask);
          document.removeEventListener('keydown', onKey);
        }
      };
      mask.addEventListener('click', function (e) {
        if (e.target === mask) {
          destroyModal(mask);
          document.removeEventListener('keydown', onKey);
          return;
        }
        if (e.target.closest('[data-cancel]')) {
          destroyModal(mask);
          document.removeEventListener('keydown', onKey);
          return;
        }
        if (e.target.closest('[data-confirm]')) {
          var ret = opts.onConfirm && opts.onConfirm(mask);
          if (ret !== false) {
            destroyModal(mask);
            document.removeEventListener('keydown', onKey);
          }
        }
      });
      document.addEventListener('keydown', onKey);
      return { close: function () {
        destroyModal(mask);
        document.removeEventListener('keydown', onKey);
      }};
    },
    form: function (opts) {
      ensureModalCSS();
      opts = opts || {};
      var fields = opts.fields || [];
      var fieldHtml = '<div class="dlg-fm">' + fields.map(renderField).join('') + '</div>';
      var danger = !!opts.danger;
      var submitText = opts.submitText || '保存';
      var cancelText = opts.cancelText || '取消';
      var html =
        '<div class="mask"><div class="dlg">' +
          '<div class="dlg-hd">' +
            (opts.icon === false ? '' :
              '<div class="dlg-ic"><svg><use href="#' + (danger ? 'i-warn' : 'i-edit') + '"/></svg></div>') +
            '<h3>' + esc(opts.title || '请填写') + '</h3>' +
          '</div>' +
          fieldHtml +
          (opts.foot ? '<div class="dlg-fm-foot">' + esc(opts.foot) + '</div>' : '') +
          '<div class="dlg-ft">' +
            '<button class="btn-ghost" type="button" data-cancel>' + esc(cancelText) + '</button>' +
            '<button class="' + (danger ? 'btn-danger' : 'btn') + '" type="submit" data-confirm>' +
              esc(submitText) +
            '</button>' +
          '</div>' +
        '</div></div>';
      var wrap = document.createElement('div');
      wrap.innerHTML = html;
      var mask = wrap.firstChild;
      document.body.appendChild(mask);
      var dlg = mask.querySelector('.dlg');
      // Mark form layout on dlg for keyboard submit
      var onKey = function (e) {
        if (e.key === 'Escape') {
          destroyModal(mask);
          document.removeEventListener('keydown', onKey);
        } else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
          // Submit form on Enter (unless in textarea)
          e.preventDefault();
          dlg.querySelector('[data-confirm]').click();
        }
      };
      mask.addEventListener('click', function (e) {
        if (e.target === mask) {
          destroyModal(mask);
          document.removeEventListener('keydown', onKey);
          return;
        }
        if (e.target.closest('[data-cancel]')) {
          destroyModal(mask);
          document.removeEventListener('keydown', onKey);
          return;
        }
        if (e.target.closest('[data-confirm]')) {
          clearErrors(mask);
          var values = getFieldValues(mask, fields);
          var err = opts.validate ? opts.validate(values) : defaultValidate(fields, values);
          if (err) {
            setFieldError(mask, err.field, err.msg);
            var firstErr = mask.querySelector('.has-err input, .has-err select, .has-err textarea');
            if (firstErr) firstErr.focus();
            return;
          }
          var ret = opts.onSubmit && opts.onSubmit(values, mask);
          if (ret !== false) {
            destroyModal(mask);
            document.removeEventListener('keydown', onKey);
          }
        }
      });
      document.addEventListener('keydown', onKey);
      // Focus first input
      requestAnimationFrame(function () {
        mask.classList.add('open');
        var firstInput = mask.querySelector('input:not([disabled]):not([type=hidden]), select, textarea');
        if (firstInput) {
          firstInput.focus();
          if (firstInput.select && firstInput.value) firstInput.select();
        }
      });
      return { close: function () {
        destroyModal(mask);
        document.removeEventListener('keydown', onKey);
      }};
    },
    open: function (id) {
      var m = document.getElementById(id);
      if (m) {
        ensureModalCSS();
        m.classList.add('open');
      }
    },
    close: function (id) {
      var m = document.getElementById(id);
      if (m) m.classList.remove('open');
    }
  };

  /* 暴露给页面内联脚本：手动预加载 modal CSS（用于自定义弹窗） */
  Modal.ensureCSS = ensureModalCSS;

  /* -------- 全局 toast -------- */
  var TOAST_CSS = [
    '.toast{position:fixed;left:50%;bottom:32px;transform:translate(-50%,20px);opacity:0;',
    '       pointer-events:none;display:flex;align-items:center;gap:8px;',
    '       padding:11px 18px;border-radius:10px;background:var(--fg);color:var(--bg);',
    '       font-size:13.5px;font-weight:500;',
    '       box-shadow:0 8px 24px -6px rgba(15,23,42,.35);transition:.25s;z-index:200}',
    'html.dark .toast{box-shadow:0 8px 24px -6px rgba(0,0,0,.6)}',
    '.toast.show{opacity:1;transform:translate(-50%,0)}'
  ].join('');

  function ensureToastCSS() {
    if (document.getElementById('toast-css')) return;
    var s = document.getElementById('admin-shared-css');
    if (s) s.textContent += '\n' + TOAST_CSS;
    var marker = document.createElement('meta');
    marker.id = 'toast-css';
    document.head.appendChild(marker);
  }

  function toast(msg) {
    ensureToastCSS();
    var box = document.getElementById('__toast');
    if (!box) {
      box = document.createElement('div');
      box.id = '__toast';
      box.className = 'toast';
      box.innerHTML = '<svg><use href="#i-check"/></svg><span></span>';
      document.body.appendChild(box);
    }
    box.querySelector('span').textContent = msg;
    box.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { box.classList.remove('show'); }, 2200);
  }

  /* -------- data-confirm 自动绑定 -------- */
  function initConfirm() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-confirm-title]');
      if (!btn) return;
      // 行内按钮需要阻止冒泡到外层 <a class="t-row">
      e.preventDefault();
      e.stopPropagation();
      Modal.confirm({
        title: btn.dataset.confirmTitle,
        body: btn.dataset.confirmBody || '',
        confirmText: btn.dataset.confirmText || '确认',
        cancelText: btn.dataset.confirmCancel || '取消',
        danger: btn.dataset.confirmDanger !== undefined,
        onConfirm: function () {
          // 真实实现走 API；mockup 阶段统一 toast
          toast(btn.dataset.confirmToast || '操作完成');
        }
      });
    });
  }

  /* -------- 暴露给页面内联 onclick 用 -------- */
  window.Modal = Modal;
  window.toast = toast;

  /* -------- 启动 -------- */
  function boot() {
    injectCSS();
    initTheme();
    initBell();
    initSearch();
    initSort();
    initConfirm();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
