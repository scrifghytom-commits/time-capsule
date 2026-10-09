/* ================= 工具 ================= */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const store = {
  get: () => JSON.parse(localStorage.getItem('tc_letters') || '[]'),
  set: l => localStorage.setItem('tc_letters', JSON.stringify(l)),
  add: it => { const l = store.get(); l.push(it); store.set(l); },
  update: (id, patch) => {
    const l = store.get(); const i = l.findIndex(x => x.id === id);
    if (i > -1) { l[i] = { ...l[i], ...patch }; store.set(l); }
  }
};
const trash = {
  get: () => JSON.parse(localStorage.getItem('tc_trash') || '[]'),
  set: l => localStorage.setItem('tc_trash', JSON.stringify(l)),
  add: it => { const l = trash.get(); l.push(it); trash.set(l); }
};

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2400);
}
function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fmtDateShort(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function timeLeft(ms) {
  if (ms <= 0) return '可解锁';
  const s = Math.floor(ms/1000), d = Math.floor(s/86400),
        h = Math.floor(s%86400/3600), m = Math.floor(s%3600/60), sec = s%60;
  if (d > 0) return `${d}天 ${h}时 ${m}分`;
  if (h > 0) return `${h}时 ${m}分`;
  return `${m}分 ${sec}秒`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ================= 加密 ================= */
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}
async function encrypt(text, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { salt: [...salt], iv: [...iv], data: [...new Uint8Array(buf)] };
}
async function decrypt(payload, password) {
  const key = await deriveKey(password, new Uint8Array(payload.salt));
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(payload.iv) },
    key, new Uint8Array(payload.data)
  );
  return new TextDecoder().decode(buf);
}
// 双人：用两个密码拼接加密（两个都对才能解密）
function combineDualKey(p1, p2) { return p1 + '||DUAL||' + p2; }

/* ================= 主题 ================= */
(function(){
  const saved = localStorage.getItem('theme') || 'light';
  document.documentElement.dataset.theme = saved;
  $('#theme-toggle').textContent = saved === 'dark' ? '☀️' : '🌙';
})();
$('#theme-toggle').onclick = () => {
  const cur = document.documentElement.dataset.theme;
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('theme', next);
  $('#theme-toggle').textContent = next === 'dark' ? '☀️' : '🌙';
};

/* ================= 视图 ================= */
$$('.tab').forEach(t => t.onclick = () => switchView(t.dataset.view));
function switchView(name) {
  $$('.tab').forEach(x => x.classList.toggle('active', x.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'list') renderList();
  if (name === 'trash') renderTrash();
}

/* ================= 写信：祝福语 ================= */
let selectedBlessing = '见字如面';
$$('#blessing-chips .chip').forEach(c => c.onclick = () => {
  $$('#blessing-chips .chip').forEach(x => x.classList.remove('active'));
  c.classList.add('active');
  selectedBlessing = c.dataset.b;
  $('#blessing-preview').textContent = selectedBlessing;
  $('#blessing-preview').style.display = selectedBlessing ? 'block' : 'none';
  $('#blessing-custom').value = '';
});
$('#blessing-custom').addEventListener('input', e => {
  const v = e.target.value;
  if (v) {
    $$('#blessing-chips .chip').forEach(x => x.classList.remove('active'));
    selectedBlessing = v;
    $('#blessing-preview').textContent = v;
    $('#blessing-preview').style.display = 'block';
  } else {
    $('#blessing-preview').style.display = 'none';
  }
});

/* ================= 写信：标签 ================= */
let selectedTags = new Set();
const tagStore = {
  get: () => JSON.parse(localStorage.getItem('tc_tags') || '["💌 给未来的自己","🎂 纪念日","🌱 目标","💭 心情"]'),
  set: t => localStorage.setItem('tc_tags', JSON.stringify(t))
};
function renderTagChips() {
  const box = $('#tag-chips');
  const tags = tagStore.get();
  box.innerHTML = tags.map(t =>
    `<button type="button" class="chip${selectedTags.has(t)?' active':''}" data-t="${escapeHtml(t)}">${escapeHtml(t)}</button>`
  ).join('');
  $$('#tag-chips .chip').forEach(c => c.onclick = () => {
    const t = c.dataset.t;
    if (selectedTags.has(t)) selectedTags.delete(t); else selectedTags.add(t);
    c.classList.toggle('active');
    renderFilterTagOptions();
  });
  renderFilterTagOptions();
}
$('#add-tag-btn').onclick = () => {
  const t = prompt('输入新标签（最多 12 字）');
  if (!t || !t.trim()) return;
  const v = t.trim().slice(0, 12);
  const tags = tagStore.get();
  if (tags.includes(v)) return toast('标签已存在');
  tags.push(v); tagStore.set(tags);
  renderTagChips();
  toast('已创建标签');
};
renderTagChips();

/* ================= 写信：图片 ================= */
let images = []; // base64 数组
$('#add-image').onclick = () => $('#image-input').click();
$('#image-input').onchange = e => {
  const files = [...e.target.files];
  files.forEach(f => {
    if (f.size > 1.5 * 1024 * 1024) return toast(`图片 ${f.name} 超过 1.5MB`);
    const r = new FileReader();
    r.onload = ev => { images.push(ev.target.result); renderImages(); };
    r.readAsDataURL(f);
  });
  e.target.value = '';
};
function renderImages() {
  $('#image-strip').innerHTML = images.map((src, i) =>
    `<div class="image-item"><img src="${src}"><button data-i="${i}">×</button></div>`
  ).join('');
  $$('#image-strip button').forEach(b => b.onclick = () => {
    images.splice(+b.dataset.i, 1); renderImages();
  });
}

/* ================= 写信：日期/字数/强度/双人 ================= */
$('#content').addEventListener('input', e => {
  $('#char-count').textContent = e.target.value.length;
  autoSaveDraft();
});
$('#signature').addEventListener('input', autoSaveDraft);
$('#blessing-custom').addEventListener('input', autoSaveDraft);

// 落款日期显示当前
function updateSignatureDate() {
  const now = new Date();
  $('#signature-date').textContent = `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
}
updateSignatureDate();

$('#toggle-exact').onclick = () => {
  const ex = $('#exact-date'), hidden = ex.classList.contains('hidden');
  if (hidden) {
    $('#days').classList.add('hidden');
    ex.classList.remove('hidden');
    $('#toggle-exact').textContent = '天数';
    const d = new Date(); d.setMinutes(d.getMinutes() + 5);
    ex.value = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  } else {
    $('#days').classList.remove('hidden');
    ex.classList.add('hidden');
    $('#toggle-exact').textContent = '精确时间';
  }
};
$('#toggle-pwd').onclick = () => {
  const p = $('#password');
  p.type = p.type === 'password' ? 'text' : 'password';
  $('#toggle-pwd').textContent = p.type === 'password' ? '显示' : '隐藏';
};
$('#password').addEventListener('input', e => {
  const v = e.target.value; let s = 0;
  if (v.length >= 4) s++;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  const bar = $('#strength-bar');
  bar.className = s > 0 ? 's' + Math.min(s, 4) : '';
});
$('#dual-mode').onchange = e => {
  $('#dual-fields').classList.toggle('hidden', !e.target.checked);
};

/* ================= 草稿自动保存 ================= */
let draftTimer = null;
function autoSaveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const draft = {
      content: $('#content').value,
      signature: $('#signature').value,
      blessing: selectedBlessing,
      tags: [...selectedTags],
      images,
      savedAt: Date.now()
    };
    localStorage.setItem('tc_draft', JSON.stringify(draft));
    $('#draft-status') && ($('#draft-status').textContent = '已保存 ' + new Date().toLocaleTimeString());
  }, 800);
}
function loadDraft() {
  const d = JSON.parse(localStorage.getItem('tc_draft') || 'null');
  if (!d) return;
  if (d.content) { $('#content').value = d.content; $('#char-count').textContent = d.content.length; }
  if (d.signature) $('#signature').value = d.signature;
  if (d.blessing) {
    selectedBlessing = d.blessing;
    $('#blessing-preview').textContent = d.blessing;
    $$('#blessing-chips .chip').forEach(x => x.classList.toggle('active', x.dataset.b === d.blessing));
    if (!$$('#blessing-chips .chip.active').length) $('#blessing-custom').value = d.blessing;
  }
  if (d.tags) { selectedTags = new Set(d.tags); renderTagChips(); }
  if (d.images) { images = d.images; renderImages(); }
  if (d.savedAt) toast('已恢复草稿');
}
loadDraft();

/* ================= 上锁 ================= */
$('#lock-btn').onclick = async () => {
  const content = $('#content').value.trim();
  const password = $('#password').value;
  const hint = $('#hint').value.trim();
  const signature = $('#signature').value.trim();
  const useExact = !$('#exact-date').classList.contains('hidden');
  const isDual = $('#dual-mode').checked;

  if (!content) return toast('请先写信内容');
  if (password.length < 4) return toast('密码至少 4 位');

  let pwd2 = '';
  if (isDual) {
    pwd2 = $('#password2').value;
    if (pwd2.length < 4) return toast('第二人密码至少 4 位');
  }

  let unlockAt;
  if (useExact) {
    const v = $('#exact-date').value;
    if (!v) return toast('请选择解锁时间');
    unlockAt = new Date(v).getTime();
  } else {
    const days = parseInt($('#days').value) || 7;
    unlockAt = Date.now() + days * 86400000;
  }
  if (unlockAt <= Date.now()) return toast('解锁时间必须晚于现在');

  const btn = $('#lock-btn'); btn.disabled = true; btn.textContent = '加密中…';
  try {
    const key = isDual ? combineDualKey(password, pwd2) : password;
    const payload = {
      blessing: selectedBlessing,
      content,
      images,
      signature,
      writtenAt: Date.now()
    };
    const enc = await encrypt(JSON.stringify(payload), key);

    const item = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      unlockAt,
      hint,
      tag: [...selectedTags].join(','),
      isDual,
      recipient: null,
      pinned: false,
      enc
    };
    if (isDual) item.hint2 = $('#hint2').value.trim();
    store.add(item);

    // 清空草稿与表单
    localStorage.removeItem('tc_draft');
    resetWriteForm();
    toast('🔒 已封存，到时候见');
    switchView('list');
  } catch (e) {
    toast('加密失败：' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '🔒 上锁封存';
  }
};

function resetWriteForm() {
  $('#content').value = ''; $('#password').value = ''; $('#hint').value = '';
  $('#password2').value = ''; $('#hint2').value = '';
  $('#signature').value = '';
  $('#char-count').textContent = '0';
  $('#dual-mode').checked = false; $('#dual-fields').classList.add('hidden');
  selectedTags.clear(); renderTagChips();
  selectedBlessing = '见字如面';
  $$('#blessing-chips .chip').forEach(x => x.classList.toggle('active', x.dataset.b === '见字如面'));
  $('#blessing-preview').textContent = '见字如面';
  images = []; renderImages();
  $('#strength-bar').className = '';
}

/* ================= 列表渲染 ================= */
let searchTerm = '';
let filterTag = '';
let filterStatus = '';
let filterSort = 'unlock-asc';
let selectMode = false;
const selectedIds = new Set();

$('#search').addEventListener('input', e => { searchTerm = e.target.value.toLowerCase(); renderList(); });
$('#filter-tag').addEventListener('change', e => { filterTag = e.target.value; renderList(); });
$('#filter-status').addEventListener('change', e => { filterStatus = e.target.value; renderList(); });
$('#filter-sort').addEventListener('change', e => { filterSort = e.target.value; renderList(); });

function renderFilterTagOptions() {
  const sel = $('#filter-tag');
  const cur = sel.value;
  const tags = new Set();
  store.get().forEach(it => (it.tag || '').split(',').forEach(t => t && tags.add(t)));
  tagStore.get().forEach(t => tags.add(t));
  sel.innerHTML = '<option value="">全部标签</option>' +
    [...tags].map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  sel.value = cur;
}

function renderList() {
  let list = store.get();
  const total = list.length;
  $('#badge').textContent = total || '';
  $('#trash-badge').textContent = trash.get().length || '';

  // 搜索
  if (searchTerm) {
    list = list.filter(it => {
      const keys = [it.hint, it.tag, it.hint2].filter(Boolean).join(' ').toLowerCase();
      return keys.includes(searchTerm);
    });
  }
  // 标签筛选
  if (filterTag) {
    list = list.filter(it => (it.tag || '').split(',').includes(filterTag));
  }
  // 状态筛选
  if (filterStatus) {
    list = list.filter(it => {
      const ready = Date.now() >= it.unlockAt;
      return filterStatus === 'ready' ? ready : !ready;
    });
  }
  // 排序：置顶优先
  list.sort((a, b) => {
    if ((b.pinned?1:0) !== (a.pinned?1:0)) return (b.pinned?1:0) - (a.pinned?1:0);
    if (filterSort === 'unlock-asc') return a.unlockAt - b.unlockAt;
    if (filterSort === 'unlock-desc') return b.unlockAt - a.unlockAt;
    return b.createdAt - a.createdAt;
  });

  const box = $('#letters');
  $('#empty').style.display = list.length ? 'none' : 'block';

  box.innerHTML = list.map(item => {
    const left = item.unlockAt - Date.now();
    const ready = left <= 0;
    const totalMs = item.unlockAt - item.createdAt;
    const progress = Math.min(100, Math.max(0, ((totalMs - left) / totalMs) * 100));
    const tags = (item.tag || '').split(',').filter(Boolean);
    const selected = selectedIds.has(item.id);
    return `
      <div class="letter ${item.pinned?'pinned':''} ${selected?'selected':''}" data-id="${item.id}">
        ${selectMode ? `<div class="letter-check"><input type="checkbox" ${selected?'checked':''}></div>` : ''}
        <div class="letter-tools">
          <button data-act="pin" title="${item.pinned?'取消置顶':'置顶'}">${item.pinned?'📌':'📍'}</button>
          <button data-act="share" title="分享">🔗</button>
          <button data-act="trash" title="删除">🗑️</button>
        </div>
        <div class="letter-head">
          <div class="letter-title">
            ${item.isDual ? '👥' : ''} ${ready ? '💌 可以打开了' : '🔒 封存中'}
          </div>
          <div>${tags.map(t => `<span class="letter-tag">${escapeHtml(t)}</span>`).join(' ')}</div>
        </div>
        <div class="letter-preview">
          ${item.hint ? '提示：' + escapeHtml(item.hint) : '（无提示）'}
          ${item.isDual ? ' · 双人信件' : ''}
        </div>
        <div class="progress"><i style="width:${progress}%"></i></div>
        <div class="letter-meta">
          <span>解锁：${fmtDate(item.unlockAt)}</span>
          <span class="letter-status ${ready ? 'status-ready' : 'status-locked'}">
            ${ready ? '可打开' : timeLeft(left)}
          </span>
        </div>
      </div>`;
  }).join('');

  // 事件绑定
  $$('.letter').forEach(el => {
    const id = el.dataset.id;
    el.addEventListener('click', e => {
      if (e.target.closest('.letter-tools')) return;
      if (selectMode) {
        const cb = el.querySelector('input[type=checkbox]');
        if (cb) cb.checked = !cb.checked;
        if (cb && cb.checked) selectedIds.add(id); else selectedIds.delete(id);
        updateBulkBar();
        return;
      }
      openLetter(id);
    });
  });
  $$('.letter-tools button').forEach(btn => btn.onclick = e => {
    e.stopPropagation();
    const id = btn.closest('.letter').dataset.id;
    const act = btn.dataset.act;
    if (act === 'pin') {
      const it = store.get().find(x => x.id === id);
      store.update(id, { pinned: !it.pinned });
      renderList();
      toast(it.pinned ? '已取消置顶' : '已置顶');
    }
    if (act === 'trash') moveToTrash(id);
    if (act === 'share') shareLetter(id);
  });
}

/* ================= 批量操作 ================= */
document.addEventListener('keydown', e => {
  if (e.key === 'Shift' && !selectMode) {
    // 长按 Shift 进入多选（可选）
  }
});
// 双击标题栏进入多选？（简化：在列表头部加个隐藏入口——通过长按卡片）
let longPressTimer = null;
document.addEventListener('touchstart', e => {
  const card = e.target.closest('.letter');
  if (!card || selectMode) return;
  longPressTimer = setTimeout(() => {
    selectMode = true;
    selectedIds.add(card.dataset.id);
    renderList(); updateBulkBar();
    toast('已进入多选模式');
  }, 600);
});
document.addEventListener('touchend', () => clearTimeout(longPressTimer));
document.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const card = e.target.closest('.letter');
  if (!card || selectMode) return;
  longPressTimer = setTimeout(() => {
    selectMode = true;
    selectedIds.add(card.dataset.id);
    renderList(); updateBulkBar();
    toast('已进入多选模式');
  }, 700);
});
document.addEventListener('mouseup', () => clearTimeout(longPressTimer));

function updateBulkBar() {
  const bar = $('#bulk-bar');
  if (selectMode && selectedIds.size >= 0) {
    bar.classList.remove('hidden');
    $('#bulk-count').textContent = selectedIds.size;
  } else {
    bar.classList.add('hidden');
  }
}
$('#bulk-cancel').onclick = () => {
  selectMode = false; selectedIds.clear();
  $('#bulk-bar').classList.add('hidden');
  renderList();
};
$('#bulk-delete').onclick = () => {
  if (!selectedIds.size) return;
  if (!confirm(`删除 ${selectedIds.size} 封信？可在回收站恢复`)) return;
  const all = store.get();
  const remaining = [], deleted = [];
  all.forEach(it => {
    if (selectedIds.has(it.id)) { it.deletedAt = Date.now(); deleted.push(it); }
    else remaining.push(it);
  });
  store.set(remaining);
  const t = trash.get(); trash.set(t.concat(deleted));
  selectedIds.clear(); selectMode = false;
  $('#bulk-bar').classList.add('hidden');
  renderList(); renderTrash();
  toast('已移入回收站');
};

/* ================= 移入回收站 ================= */
function moveToTrash(id) {
  const all = store.get();
  const it = all.find(x => x.id === id);
  if (!it) return;
  if (!confirm('删除这封信？可在回收站恢复')) return;
  store.set(all.filter(x => x.id !== id));
  it.deletedAt = Date.now();
  trash.add(it);
  renderList(); renderTrash();
  toast('已移入回收站');
}

/* ================= 回收站渲染 ================= */
function renderTrash() {
  const list = trash.get().sort((a, b) => b.deletedAt - a.deletedAt);
  const box = $('#trash-list');
  $('#trash-empty').style.display = list.length ? 'none' : 'block';
  $('#trash-badge').textContent = list.length || '';
  box.innerHTML = list.map(it => `
    <div class="letter" data-id="${it.id}">
      <div class="letter-head">
        <div class="letter-title">🗑️ ${it.hint ? escapeHtml(it.hint) : '（无提示）'}</div>
      </div>
      <div class="letter-preview">删除于 ${fmtDate(it.deletedAt)} · 解锁 ${fmtDate(it.unlockAt)}</div>
      <div class="letter-tools" style="opacity:1;position:static;justify-content:flex-end;margin-top:10px">
        <button data-act="restore">恢复</button>
        <button data-act="purge">彻底删除</button>
      </div>
    </div>
  `).join('');
  $$('#trash-list button').forEach(btn => btn.onclick = () => {
    const id = btn.closest('.letter').dataset.id;
    if (btn.dataset.act === 'restore') {
      const all = trash.get();
      const it = all.find(x => x.id === id);
      if (!it) return;
      delete it.deletedAt;
      store.add(it);
      trash.set(all.filter(x => x.id !== id));
      renderTrash(); renderList();
      toast('已恢复');
    } else {
      if (!confirm('彻底删除？无法恢复')) return;
      trash.set(trash.get().filter(x => x.id !== id));
      renderTrash();
      toast('已彻底删除');
    }
  });
}
$('#empty-trash').onclick = () => {
  if (!trash.get().length) return;
  if (!confirm('清空回收站？所有信件将永久删除')) return;
  trash.set([]);
  renderTrash();
  toast('已清空');
};

/* ================= 打开信件 ================= */
let timer = null, flipTimer = null;
function openLetter(id) {
  const item = store.get().find(x => x.id === id);
  if (!item) return;
  const ready = Date.now() >= item.unlockAt;

  if (!ready) {
    // 未到时间 → 翻牌倒计时弹窗
    showFlipModal(item);
    return;
  }

  // 已到时间 → 密码验证弹窗
  $('#modal').classList.remove('hidden');
  renderUnlockModal(item);
}
function renderUnlockModal(item) {
  const body = $('#modal-body');
  if (item.isDual) {
    body.innerHTML = `
      <h2>👥 双人信件</h2>
      <p class="m-sub">需要两个密码都正确才能打开</p>
      <div class="field"><span>第一人密码</span>
        <input type="password" id="pwd1" placeholder="密码 1"></div>
      <div class="field"><span>第二人密码</span>
        <input type="password" id="pwd2" placeholder="密码 2"></div>
      ${item.hint ? `<p class="m-sub">提示1：${escapeHtml(item.hint)}</p>` : ''}
      ${item.hint2 ? `<p class="m-sub">提示2：${escapeHtml(item.hint2)}</p>` : ''}
      <div id="err-box"></div>
      <button class="primary-btn" style="margin-top:14px" id="unlock-btn">解锁阅读</button>
      <button class="danger-btn" id="delete-btn">删除这封信</button>
    `;
    $('#unlock-btn').onclick = () => tryUnlock(item);
    $('#pwd1').focus();
    ['pwd1','pwd2'].forEach(id => $('#'+id).addEventListener('keydown', e => {
      if (e.key === 'Enter') tryUnlock(item);
    }));
  } else {
    body.innerHTML = `
      <h2>💌 一封信</h2>
      <p class="m-sub">写于 ${fmtDate(item.createdAt)}</p>
      <div class="field"><span>输入密码解锁</span>
        <input type="password" id="pwd1" placeholder="密码" autofocus></div>
      ${item.hint ? `<p class="m-sub">提示：${escapeHtml(item.hint)}</p>` : ''}
      <div id="err-box"></div>
      <button class="primary-btn" style="margin-top:14px" id="unlock-btn">解锁阅读</button>
      <button class="danger-btn" id="delete-btn">删除这封信</button>
    `;
    $('#unlock-btn').onclick = () => tryUnlock(item);
    $('#pwd1').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(item); });
  }
  $('#delete-btn').onclick = () => { closeModal(); moveToTrash(item.id); };
}

async function tryUnlock(item) {
  const p1 = $('#pwd1').value;
  const p2 = item.isDual ? $('#pwd2').value : '';
  if (!p1 || (item.isDual && !p2)) return showError('请输入完整密码');
  const btn = $('#unlock-btn'); btn.disabled = true; btn.textContent = '解密中…';
  try {
    const key = item.isDual ? combineDualKey(p1, p2) : p1;
    const text = await decrypt(item.enc, key);
    const payload = JSON.parse(text);
    playEnvelopeAnimation(payload, item);
  } catch (e) {
    btn.disabled = false; btn.textContent = '解锁阅读';
    showError('密码错误，请重试');
  }
}

function showError(msg) {
  const box = $('#err-box');
  if (!box) return toast(msg);
  box.innerHTML = `<div class="error-msg">${escapeHtml(msg)}</div>`;
  setTimeout(() => { box.innerHTML = ''; }, 2600);
}

/* ================= 信封展开动画 + 内容展示 ================= */
function playEnvelopeAnimation(payload, item) {
  $('#modal-body').innerHTML = `
    <div class="envelope-stage">
      <div class="envelope" id="env">
        <div class="envelope-letter">信纸展开中…</div>
      </div>
    </div>
    <p class="envelope-hint">点击信封展开</p>
  `;
  const env = $('#env');
  env.onclick = () => {
    if (env.classList.contains('open')) return;
    env.classList.add('open');
    setTimeout(() => showLetterContent(payload, item), 1200);
  };
  // 自动展开
  setTimeout(() => { if (!env.classList.contains('open')) env.click(); }, 500);
}

function showLetterContent(payload, item) {
  const imagesHtml = (payload.images || []).map(src => `<img src="${src}">`).join('');
  $('#modal-body').innerHTML = `
    <h2>💌 你的信</h2>
    <p class="m-sub">写于 ${fmtDate(payload.writtenAt || item.createdAt)}</p>
    <div class="letter-content" id="letter-text">
      ${payload.blessing ? `<div class="content-blessing">${escapeHtml(payload.blessing)}</div>` : ''}
      <div id="typed-text"></div>
      ${imagesHtml}
      <div class="content-sign">—— ${escapeHtml(payload.signature || '佚名')}</div>
      <div class="content-date">${fmtDate(payload.writtenAt || item.createdAt)}</div>
    </div>
    <div class="letter-tools-row" style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="ghost-btn" id="copy-btn" style="flex:1">复制</button>
      <button class="ghost-btn" id="pdf-btn" style="flex:1">导出 PDF</button>
      <button class="ghost-btn" id="img-btn" style="flex:1">导出图片</button>
      <button class="ghost-btn" id="share-btn" style="flex:1">分享给 TA</button>
    </div>
    <button class="danger-btn" id="delete-btn">删除这封信</button>
  `;
  // 打字机
  const el = $('#typed-text');
  const text = payload.content || '';
  let i = 0;
  const speed = Math.max(6, Math.min(35, 1200 / text.length));
  (function type() {
    if (i >= text.length) return;
    el.textContent += text[i++];
    setTimeout(type, speed);
  })();

  // 复制
  $('#copy-btn').onclick = () => {
    const full = [payload.blessing, payload.content, `—— ${payload.signature||'佚名'}`, fmtDate(payload.writtenAt)].filter(Boolean).join('\n');
    navigator.clipboard.writeText(full).then(() => toast('已复制'));
  };
  // PDF
  $('#pdf-btn').onclick = () => exportPDF(payload, item);
  // 图片
  $('#img-btn').onclick = () => exportImage(payload, item);
  // 分享
  $('#share-btn').onclick = () => shareLetter(item.id);
  // 删除
  $('#delete-btn').onclick = () => { closeModal(); moveToTrash(item.id); };
}

/* ================= PDF 导出 ================= */
async function exportPDF(payload, item) {
  toast('生成 PDF 中…');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const margin = 60;
  let y = margin;

  doc.setFont('times', 'normal');
  doc.setFontSize(16);
  if (payload.blessing) {
    doc.text(payload.blessing, 105, y); y += 26;
  }
  doc.setFontSize(12);
  const contentLines = doc.splitTextToSize(payload.content || '', 595 - margin*2);
  contentLines.forEach(line => {
    if (y > 780) { doc.addPage(); y = margin; }
    doc.text(line, margin, y); y += 20;
  });
  if (payload.images && payload.images.length) {
    for (const src of payload.images) {
      try {
        const img = await loadImage(src);
        const maxW = 595 - margin*2;
        const ratio = img.height / img.width;
        let w = maxW, h = w * ratio;
        if (h > 400) { h = 400; w = h / ratio; }
        if (y + h > 800) { doc.addPage(); y = margin; }
        doc.addImage(src, 'JPEG', margin, y, w, h);
        y += h + 16;
      } catch(e){}
    }
  }
  if (y > 750) { doc.addPage(); y = margin; }
  y += 20;
  doc.setFontSize(11);
  doc.text(`—— ${payload.signature || '佚名'}`, 595 - margin, y, { align: 'right' }); y += 18;
  doc.setTextColor(120);
  doc.text(fmtDate(payload.writtenAt || item.createdAt), 595 - margin, y, { align: 'right' });
  doc.text(`导出时间：${fmtDate(Date.now())}`, 595 - margin, y + 16, { align: 'right' });

  doc.save(`时光信_${fmtDateShort(Date.now())}.pdf`);
  toast('PDF 已导出');
}
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => res(img); img.onerror = rej; img.src = src;
  });
}

/* ================= 图片导出 ================= */
async function exportImage(payload, item) {
  toast('生成图片中…');
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:fixed;left:-9999px;top:0;width:640px;padding:40px;
    background:#fffdf8;font-family:"Noto Serif SC",serif;color:#3a3128;line-height:1.9`;
  wrap.innerHTML = `
    ${payload.blessing ? `<div style="color:#8b6f47;letter-spacing:3px;font-size:18px;margin-bottom:16px;font-weight:600">${escapeHtml(payload.blessing)}</div>` : ''}
    <div style="white-space:pre-wrap;font-size:15px">${escapeHtml(payload.content)}</div>
    ${(payload.images||[]).map(s => `<img src="${s}" style="max-width:100%;border-radius:8px;margin:10px 0">`).join('')}
    <div style="text-align:right;margin-top:26px;color:#8a7d6b;font-style:italic">—— ${escapeHtml(payload.signature||'佚名')}</div>
    <div style="text-align:right;color:#8a7d6b;font-size:13px">${fmtDate(payload.writtenAt||item.createdAt)}</div>
    <div style="text-align:right;color:#aaa;font-size:12px;margin-top:6px">导出时间：${fmtDate(Date.now())}</div>
  `;
  document.body.appendChild(wrap);
  try {
    const canvas = await html2canvas(wrap, { backgroundColor: '#fffdf8', scale: 2 });
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `时光信_${fmtDateShort(Date.now())}.png`;
    a.click();
    toast('图片已导出');
  } catch (e) { toast('导出失败'); }
  document.body.removeChild(wrap);
}

/* ================= 分享 ================= */
async function shareLetter(id) {
  const item = store.get().find(x => x.id === id);
  if (!item) return;
  if (item.isDual) {
    return toast('双人信件不支持分享链接');
  }
  const data = {
    v: 1,
    unlockAt: item.unlockAt,
    hint: item.hint,
    enc: item.enc,
    isDual: false,
    createdAt: item.createdAt
  };
  const packed = btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  const url = `${location.origin}${location.pathname.replace('index.html','')}share.html#${packed}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('分享链接已复制到剪贴板');
  } catch(e) {
    prompt('复制分享链接：', url);
  }
}

/* ================= 翻牌倒计时 ================= */
function showFlipModal(item) {
  $('#flip-modal').classList.remove('hidden');
  $('#flip-sub').textContent = `这封信将在 ${fmtDate(item.unlockAt)} 解锁`;
  $('#flip-hint').textContent = item.hint ? '提示：' + item.hint : '';
  $('#flip-close').onclick = () => {
    $('#flip-modal').classList.add('hidden');
    clearInterval(flipTimer);
  };
  const render = () => {
    const ms = item.unlockAt - Date.now();
    if (ms <= 0) {
      clearInterval(flipTimer);
      $('#flip-clock').innerHTML = '<div style="font-size:22px;color:#27ae60">✨ 可以打开了，请刷新列表</div>';
      return;
    }
    const s = Math.floor(ms/1000);
    const d = Math.floor(s/86400);
    const h = Math.floor(s%86400/3600);
    const m = Math.floor(s%3600/60);
    const sec = s%60;
    const units = [
      {v:d, l:'天'}, {v:h, l:'时'}, {v:m, l:'分'}, {v:sec, l:'秒'}
    ];
    const html = units.map(u => {
      const cur = String(u.v).padStart(2,'0');
      const old = $(`[data-u="${u.l}"]`);
      const changed = old && old.dataset.v !== cur;
      return `<div class="flip-unit"><span class="num" data-u="${u.l}" data-v="${cur}" style="${changed?'animation:none':''}">${cur}</span><span class="lab">${u.l}</span></div>`;
    }).join('');
    $('#flip-clock').innerHTML = html;
    // 重新触发动画
    $$('#flip-clock .num').forEach(el => {
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = 'flipIn .35s';
    });
  };
  render();
  clearInterval(flipTimer);
  flipTimer = setInterval(render, 1000);
}

/* ================= 导出 / 导入 ================= */
$('#export-btn').onclick = () => {
  const data = { letters: store.get(), trash: trash.get(), tags: tagStore.get(), exportedAt: Date.now() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `timecapsule-${fmtDateShort(Date.now())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('已导出备份');
};
$('#import-btn').onclick = () => $('#import-file').click();
$('#import-file').onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result);
      const letters = obj.letters || (Array.isArray(obj) ? obj : []);
      const cur = store.get();
      const ids = new Set(cur.map(x => x.id));
      let added = 0;
      letters.forEach(x => { if (!ids.has(x.id)) { cur.push(x); added++; } });
      store.set(cur);
      if (obj.trash) {
        const t = trash.get();
        const tids = new Set(t.map(x => x.id));
        obj.trash.forEach(x => { if (!tids.has(x.id)) t.push(x); });
        trash.set(t);
      }
      if (obj.tags) {
        const tags = new Set([...tagStore.get(), ...obj.tags]);
        tagStore.set([...tags]);
      }
      renderTagChips(); renderList(); renderTrash();
      toast(`导入完成，新增 ${added} 封`);
    } catch (e) { toast('导入失败：' + e.message); }
  };
  r.readAsText(f);
  e.target.value = '';
};

/* ================= 关闭弹窗 ================= */
function closeModal() {
  $('#modal').classList.add('hidden');
  clearInterval(timer);
}
$('#modal-close').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
$('#flip-modal').onclick = e => {
  if (e.target.id === 'flip-modal') {
    $('#flip-modal').classList.add('hidden');
    clearInterval(flipTimer);
  }
};
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal();
    $('#flip-modal').classList.add('hidden');
    clearInterval(flipTimer);
  }
});

/* ================= 初始化 ================= */
renderList();
renderTrash();
setInterval(() => {
  if ($('#view-list').classList.contains('active')) renderList();
}, 60000);
