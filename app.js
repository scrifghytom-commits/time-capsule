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

/* Base64URL 编解码 */
function b64uEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64uDecode(s) {
  s = s.replace(/-/g,'+').replace(/_/g,'/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
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
function combineDualKey(p1, p2) { return p1 + '||DUAL||' + p2; }

/* 时间密钥：由信件 id + createdAt 派生，用于到期自动解密 */
function timeKeyFor(item) {
  return 'TIMEKEY::' + item.id + '::' + item.createdAt;
}

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

/* ================= 祝福语 ================= */
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

/* ================= 标签 ================= */
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

/* ================= 图片 ================= */
let images = [];
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

/* ================= 正文编辑器 ================= */
const editor = $('#letter-editor');

function editorGetText() {
  // 只取编辑器的直接子元素，避免 p / div 被重复选中
  const blocks = [...editor.children].filter(el =>
    el.nodeType === 1 && /^(P|DIV)$/.test(el.tagName)
  );
  if (blocks.length) {
    return blocks.map(b => {
      const clone = b.cloneNode(true);
      clone.querySelectorAll('img').forEach(img => img.remove());
      clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
      return clone.textContent.replace(/\u00A0/g, '');
    }).join('\n');
  }
  const clone = editor.cloneNode(true);
  clone.querySelectorAll('img').forEach(img => img.remove());
  clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  return clone.textContent.replace(/\u00A0/g, '');
}

function editorSetText(text) {
  editor.innerHTML = '';
  const lines = String(text || '').split(/\n/);
  lines.forEach(l => {
    const p = document.createElement('p');
    p.textContent = l || '\u00A0';
    editor.appendChild(p);
  });
}

/* 回车 */
editor.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    range.deleteContents();
    range.insertNode(p);
    range.setStart(p, 0); range.collapse(true);
    sel.removeAllRanges(); sel.addRange(range);
  }
});

/* 输入 */
editor.addEventListener('input', () => {
  const len = editorGetText().replace(/\u00A0/g,'').length;
  $('#char-count').textContent = len;
  autoSaveDraft();
});

/* 粘贴：强制纯文本 */
editor.addEventListener('paste', e => {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  if (!text) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  sel.deleteFromDocument();
  const lines = text.split(/\r?\n/);
  const range = sel.getRangeAt(0);
  lines.forEach((line, i) => {
    if (i > 0) {
      const p = document.createElement('p');
      p.textContent = line || '\u00A0';
      range.insertNode(p);
      range.setStartAfter(p);
    } else {
      range.insertNode(document.createTextNode(line));
      range.setStartAfter(range.endContainer);
    }
  });
  sel.removeAllRanges();
  editor.dispatchEvent(new Event('input'));
});

/* 拖入图片：走 images 数组，不进编辑器 */
editor.addEventListener('drop', e => {
  const files = e.dataTransfer && e.dataTransfer.files;
  if (!files || !files.length) return;
  const imgs = [...files].filter(f => f.type.startsWith('image/'));
  if (!imgs.length) return;
  e.preventDefault();
  imgs.forEach(f => {
    if (f.size > 1.5 * 1024 * 1024) return toast(`图片 ${f.name} 超过 1.5MB`);
    const r = new FileReader();
    r.onload = ev => { images.push(ev.target.result); renderImages(); };
    r.readAsDataURL(f);
  });
});

/* ================= 落款日期 ================= */
function updateSignatureDate() {
  const now = new Date();
  $('#signature-date').textContent =
    `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')}`;
}
updateSignatureDate();

/* ================= 参数交互 ================= */
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

/* ================= 草稿 ================= */
let draftTimer = null;
function autoSaveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    const draft = {
      content: editorGetText(),
      signature: $('#signature').value,
      blessing: selectedBlessing,
      tags: [...selectedTags],
      images,
      savedAt: Date.now()
    };
    localStorage.setItem('tc_draft', JSON.stringify(draft));
  }, 800);
}
function loadDraft() {
  const d = JSON.parse(localStorage.getItem('tc_draft') || 'null');
  if (!d) return;
  if (d.content) {
    editorSetText(d.content);
    $('#char-count').textContent = d.content.replace(/\n/g,'').length;
  }
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
  const content = editorGetText().trim();
  const password = $('#password').value;
  const hint = $('#hint').value.trim();
  const signature = $('#signature').value.trim();
  const useExact = !$('#exact-date').classList.contains('hidden');
  const isDual = $('#dual-mode').checked;

  if (!content) return toast('请先写信内容');
  if (!password || password.length < 4) return toast('密码不能为空，且至少 4 位');

  let pwd2 = '';
  if (isDual) {
    pwd2 = $('#password2').value;
    if (!pwd2 || pwd2.length < 4) return toast('第二人密码不能为空，且至少 4 位');
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
    const paragraphs = content.split(/\n/).map(s => s.replace(/\u00A0/g,''));
    const payload = {
      blessing: selectedBlessing,
      paragraphs,
      images,
      signature,
      writtenAt: Date.now()
    };

    // 先生成 id 和 createdAt，用于派生时间密钥
    const id = crypto.randomUUID();
    const createdAt = Date.now();

    // 用户密码加密（用于提前打开）
    const enc = await encrypt(JSON.stringify(payload), key);

    // 时间密钥加密（用于到期自动解锁）
    const autoEnc = await encrypt(JSON.stringify(payload), 'TIMEKEY::' + id + '::' + createdAt);

    const item = {
      id,
      createdAt,
      unlockAt,
      hint,
      tag: [...selectedTags].join(','),
      isDual,
      recipient: null,
      pinned: false,
      enc,
      autoEnc
    };
    if (isDual) item.hint2 = $('#hint2').value.trim();
    store.add(item);

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
  editor.innerHTML = '';
  $('#password').value = ''; $('#hint').value = '';
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

/* ================= 列表 ================= */
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
  $('#badge').textContent = list.length || '';
  $('#trash-badge').textContent = trash.get().length || '';

  if (searchTerm) {
    list = list.filter(it => {
      const keys = [it.hint, it.tag, it.hint2].filter(Boolean).join(' ').toLowerCase();
      return keys.includes(searchTerm);
    });
  }
  if (filterTag) list = list.filter(it => (it.tag || '').split(',').includes(filterTag));
  if (filterStatus) {
    list = list.filter(it => {
      const ready = Date.now() >= it.unlockAt;
      return filterStatus === 'ready' ? ready : !ready;
    });
  }
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
          <div class="letter-title">${item.isDual ? '👥' : ''} ${ready ? '💌 可以打开了' : '🔒 封存中'}</div>
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

  $$('.letter').forEach(el => {
    const id = el.dataset.id;
    el.addEventListener('click', e => {
      if (e.target.closest('.letter-tools')) return;
      if (selectMode) {
        const cb = el.querySelector('input[type=checkbox]');
        if (cb) cb.checked = !cb.checked;
        if (cb && cb.checked) selectedIds.add(id); else selectedIds.delete(id);
        updateBulkBar();
        renderList();
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

/* ================= 批量 ================= */
let longPressTimer = null;
function startLongPress(card) {
  longPressTimer = setTimeout(() => {
    selectMode = true;
    selectedIds.add(card.dataset.id);
    renderList(); updateBulkBar();
    toast('已进入多选模式');
  }, 700);
}
document.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const card = e.target.closest('.letter');
  if (!card || selectMode) return;
  startLongPress(card);
});
document.addEventListener('touchstart', e => {
  const card = e.target.closest('.letter');
  if (!card || selectMode) return;
  startLongPress(card);
});
document.addEventListener('mouseup', () => clearTimeout(longPressTimer));
document.addEventListener('touchend', () => clearTimeout(longPressTimer));

function updateBulkBar() {
  const bar = $('#bulk-bar');
  if (selectMode) {
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

/* ================= 回收站 ================= */
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
  if (!ready) showFlipModal(item);
  else autoOpenLetter(item);
}

/* 已到时间：自动解密展示，无需密码 */
async function autoOpenLetter(item) {
  $('#modal').classList.remove('hidden');
  $('#modal-body').innerHTML = `
    <h2>💌 ${item.isDual?'双人信件':'一封信'}</h2>
    <p class="m-sub">写于 ${fmtDate(item.createdAt)} · 已到解锁时间</p>
    <div id="err-box"></div>
    <div style="text-align:center;padding:30px 0;color:var(--muted)">正在打开…</div>
  `;
  try {
    const text = await decrypt(item.autoEnc, timeKeyFor(item));
    const payload = JSON.parse(text);
    playEnvelopeAnimation(payload, item);
  } catch (e) {
    // 兼容旧数据：没有 autoEnc 时回退到密码验证
    showPasswordFallback(item);
  }
}

/* 兼容旧数据：显示密码输入 */
function showPasswordFallback(item) {
  $('#modal-body').innerHTML = `
    <h2>💌 ${item.isDual?'双人信件':'一封信'}</h2>
    <p class="m-sub">写于 ${fmtDate(item.createdAt)} · 已到解锁时间</p>
    ${item.isDual ? `
      <div class="field"><span>第一人密码</span>
        <input type="password" id="pwd1" placeholder="密码 1"></div>
      <div class="field"><span>第二人密码</span>
        <input type="password" id="pwd2" placeholder="密码 2"></div>
      ${item.hint ? `<p class="m-sub">提示1：${escapeHtml(item.hint)}</p>` : ''}
      ${item.hint2 ? `<p class="m-sub">提示2：${escapeHtml(item.hint2)}</p>` : ''}
    ` : `
      <div class="field"><span>输入密码查看内容</span>
        <input type="password" id="pwd1" placeholder="密码" autofocus></div>
      ${item.hint ? `<p class="m-sub">提示：${escapeHtml(item.hint)}</p>` : ''}
    `}
    <div id="err-box"></div>
    <button class="primary-btn" style="margin-top:14px" id="unlock-btn">打开信件</button>
    <button class="danger-btn" id="delete-btn">删除这封信</button>
  `;
  $('#unlock-btn').onclick = () => tryUnlock(item);
  ['pwd1','pwd2'].forEach(id => {
    const el = $('#'+id);
    if (el) el.addEventListener('keydown', e => { if (e.key==='Enter') tryUnlock(item); });
  });
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
    btn.disabled = false; btn.textContent = '打开信件';
    showError('密码错误，请重试');
  }
}

function showError(msg) {
  const box = $('#err-box');
  if (!box) return toast(msg);
  box.innerHTML = `<div class="error-msg">${escapeHtml(msg)}</div>`;
  setTimeout(() => { box.innerHTML = ''; }, 2600);
}

/* ================= 信封动画 ================= */
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
  setTimeout(() => { if (!env.classList.contains('open')) env.click(); }, 500);
}

/* ================= 内容展示 ================= */
function showLetterContent(payload, item) {
  const paragraphs = payload.paragraphs || [payload.content || ''];
  const parasHtml = paragraphs
    .map(p => `<p>${escapeHtml(p) || '&nbsp;'}</p>`).join('');
  const imagesHtml = (payload.images || []).map(src => `<img src="${src}">`).join('');
  const writtenAt = payload.writtenAt || item.createdAt;

  $('#modal-body').innerHTML = `
    <h2>💌 你的信</h2>
    <p class="m-sub">写于 ${fmtDate(writtenAt)}</p>
    <div class="letter-content" id="letter-text">
      ${payload.blessing ? `<div class="content-blessing">${escapeHtml(payload.blessing)}</div>` : ''}
      <div id="typed-wrap">${parasHtml}</div>
      ${imagesHtml}
      <div class="content-sign">—— ${escapeHtml(payload.signature || '佚名')}</div>
      <div class="content-date">${fmtDate(writtenAt)}</div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="ghost-btn" id="copy-btn" style="flex:1">复制</button>
      <button class="ghost-btn" id="pdf-btn" style="flex:1">导出 PDF</button>
      <button class="ghost-btn" id="img-btn" style="flex:1">导出图片</button>
      <button class="ghost-btn" id="share-btn" style="flex:1">分享给 TA</button>
    </div>
    <button class="danger-btn" id="delete-btn">删除这封信</button>
  `;

  $('#copy-btn').onclick = () => {
    const full = [payload.blessing, paragraphs.join('\n'),
      `—— ${payload.signature||'佚名'}`, fmtDate(writtenAt)]
      .filter(Boolean).join('\n');
    navigator.clipboard.writeText(full).then(() => toast('已复制'));
  };
  $('#pdf-btn').onclick = () => exportPDF(payload, item);
  $('#img-btn').onclick = () => exportImage(payload, item);
  $('#share-btn').onclick = () => shareLetter(item.id);
  $('#delete-btn').onclick = () => { closeModal(); moveToTrash(item.id); };
}

/* ================= PDF（浏览器打印） ================= */
function exportPDF(payload, item) {
  const writtenAt = payload.writtenAt || item.createdAt;
  const paragraphs = payload.paragraphs || [payload.content || ''];
  const parasHtml = paragraphs
    .map(p => `<p style="text-indent:2em;margin:0 0 8px;line-height:1.9">${escapeHtml(p) || '&nbsp;'}</p>`)
    .join('');
  const imagesHtml = (payload.images || [])
    .map(s => `<img src="${s}" style="max-width:100%;margin:10px 0;border-radius:6px">`)
    .join('');

  const html = `
    <div style="padding:20mm 18mm;font-family:'Noto Serif SC','Songti SC',serif;color:#222">
      ${payload.blessing ? `<div style="color:#8b6f47;letter-spacing:3px;font-size:16px;margin-bottom:16px;font-weight:600">${escapeHtml(payload.blessing)}</div>` : ''}
      <div style="font-size:14px">${parasHtml}</div>
      ${imagesHtml}
      <div style="text-align:right;margin-top:26px;color:#666;font-style:italic">—— ${escapeHtml(payload.signature||'佚名')}</div>
      <div style="text-align:right;color:#888;font-size:12px">写信时间：${fmtDate(writtenAt)}</div>
      <div style="text-align:right;color:#aaa;font-size:11px;margin-top:4px">导出时间：${fmtDate(Date.now())}</div>
    </div>
  `;
  const area = $('#print-area');
  area.innerHTML = html;
  const oldTitle = document.title;
  document.title = `时光信_${fmtDateShort(Date.now())}`;
  window.print();
  setTimeout(() => {
    document.title = oldTitle;
    area.innerHTML = '';
  }, 500);
  toast('在打印窗口选择"另存为 PDF"');
}

/* ================= 图片导出 ================= */
async function exportImage(payload, item) {
  toast('生成图片中…');
  const writtenAt = payload.writtenAt || item.createdAt;
  const paragraphs = payload.paragraphs || [payload.content || ''];
  const parasHtml = paragraphs
    .map(p => `<p style="text-indent:2em;margin:0 0 8px">${escapeHtml(p) || '&nbsp;'}</p>`)
    .join('');
  const wrap = document.createElement('div');
  wrap.style.cssText = `position:fixed;left:-9999px;top:0;width:640px;padding:40px;
    background:#fffdf8;font-family:"Noto Serif SC",serif;color:#3a3128;line-height:1.9`;
  wrap.innerHTML = `
    ${payload.blessing ? `<div style="color:#8b6f47;letter-spacing:3px;font-size:18px;margin-bottom:16px;font-weight:600">${escapeHtml(payload.blessing)}</div>` : ''}
    <div style="font-size:15px">${parasHtml}</div>
    ${(payload.images||[]).map(s => `<img src="${s}" style="max-width:100%;border-radius:8px;margin:10px 0">`).join('')}
    <div style="text-align:right;margin-top:26px;color:#8a7d6b;font-style:italic">—— ${escapeHtml(payload.signature||'佚名')}</div>
    <div style="text-align:right;color:#8a7d6b;font-size:13px">写信时间：${fmtDate(writtenAt)}</div>
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
  if (item.isDual) return toast('双人信件不支持分享链接');
  const data = {
    v: 1,
    unlockAt: item.unlockAt,
    hint: item.hint,
    enc: item.enc,
    autoEnc: item.autoEnc,
    createdAt: item.createdAt,
    timeKey: timeKeyFor(item)
  };
  const packed = b64uEncode(JSON.stringify(data));
  const base = location.origin + location.pathname.replace(/[^/]*$/, '');
  const url = `${base}share.html#${packed}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('分享链接已复制到剪贴板');
  } catch(e) {
    prompt('复制分享链接：', url);
  }
}

/* ================= 翻牌倒计时（只翻变化数字） ================= */
const flipCache = {};
function showFlipModal(item) {
  $('#flip-modal').classList.remove('hidden');
  $('#flip-sub').textContent = `这封信将在 ${fmtDate(item.unlockAt)} 解锁`;
  $('#flip-hint').textContent = item.hint ? '提示：' + item.hint : '';
  $('#flip-close').onclick = () => {
    $('#flip-modal').classList.add('hidden');
    clearInterval(flipTimer);
  };

  // 提前解锁区
  let earlyZone = $('#early-zone');
  if (!earlyZone) {
    earlyZone = document.createElement('div');
    earlyZone.id = 'early-zone';
    $('#flip-clock').parentNode.appendChild(earlyZone);
  }
  earlyZone.innerHTML = `
    <div style="margin-top:18px;text-align:left;border-top:1px dashed var(--line);padding-top:16px">
      <p class="m-sub" style="margin-bottom:8px">🔑 想提前打开？输入密码即可</p>
      <div class="field">
        <input type="password" id="early-pwd1" placeholder="${item.isDual?'第一人密码':'密码'}">
      </div>
      ${item.isDual ? `<div class="field"><input type="password" id="early-pwd2" placeholder="第二人密码"></div>` : ''}
      <div id="early-err"></div>
      <button class="ghost-btn" id="early-open" style="width:100%;margin-top:10px">提前解锁</button>
    </div>
  `;
  $('#early-open').onclick = async () => {
    const p1 = $('#early-pwd1').value;
    const p2 = item.isDual ? $('#early-pwd2').value : '';
    if (!p1 || (item.isDual && !p2)) {
      $('#early-err').innerHTML = '<div class="error-msg">请输入完整密码</div>';
      setTimeout(()=>$('#early-err').innerHTML='',2600); return;
    }
    try {
      const key = item.isDual ? combineDualKey(p1, p2) : p1;
      const text = await decrypt(item.enc, key);
      const payload = JSON.parse(text);
      $('#flip-modal').classList.add('hidden');
      clearInterval(flipTimer);
      $('#modal').classList.remove('hidden');
      playEnvelopeAnimation(payload, item);
    } catch(e) {
      $('#early-err').innerHTML = '<div class="error-msg">密码错误</div>';
      setTimeout(()=>$('#early-err').innerHTML='',2600);
    }
  };

  renderFlipClock(item);
  clearInterval(flipTimer);
  flipTimer = setInterval(() => renderFlipClock(item), 1000);
}

function renderFlipClock(item) {
  const ms = item.unlockAt - Date.now();
  const clock = $('#flip-clock');
  if (ms <= 0) {
    clearInterval(flipTimer);
    clock.innerHTML = '<div style="font-size:20px;color:#27ae60;padding:16px">✨ 可以打开了，请关闭后查看</div>';
    // 自动关闭并打开信件
    setTimeout(() => {
      $('#flip-modal').classList.add('hidden');
      autoOpenLetter(item);
    }, 1200);
    return;
  }
  const s = Math.floor(ms/1000);
  const units = [
    { k:'d', v:Math.floor(s/86400),      l:'天' },
    { k:'h', v:Math.floor(s%86400/3600), l:'时' },
    { k:'m', v:Math.floor(s%3600/60),    l:'分' },
    { k:'s', v:s%60,                     l:'秒' }
  ];
  if (!clock.dataset.built) {
    clock.innerHTML = units.map(u => `
      <div class="flip-unit">
        <span class="flip-digits" data-k="${u.k}"></span>
        <span class="lab">${u.l}</span>
      </div>
    `).join('');
    clock.dataset.built = '1';
    Object.keys(flipCache).forEach(k => delete flipCache[k]);
  }
  units.forEach(u => {
    const str = String(u.v).padStart(2, '0');
    const prev = flipCache[u.k] || ['', ''];
    const digitsBox = clock.querySelector(`[data-k="${u.k}"]`);
    str.split('').forEach((ch, i) => {
      let el = digitsBox.children[i];
      if (!el) {
        el = document.createElement('span');
        el.className = 'flip-digit';
        el.innerHTML = '<span class="d"></span>';
        digitsBox.appendChild(el);
      }
      const d = el.querySelector('.d');
      if (prev[i] !== ch) {
        d.textContent = ch;
        el.classList.remove('flip');
        void el.offsetWidth;
        el.classList.add('flip');
      }
    });
    flipCache[u.k] = str.split('');
  });
}

/* ================= 导出/导入 ================= */
$('#export-btn').onclick = () => {
  const data = {
    letters: store.get(),
    trash: trash.get(),
    tags: tagStore.get(),
    exportedAt: Date.now()
  };
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
