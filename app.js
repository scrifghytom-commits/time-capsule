/* ============ 工具函数 ============ */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const store = {
  get: () => JSON.parse(localStorage.getItem('timecapsules') || '[]'),
  set: l => localStorage.setItem('timecapsules', JSON.stringify(l)),
  add: item => { const l = store.get(); l.push(item); store.set(l); },
  update: (id, patch) => {
    const l = store.get(); const i = l.findIndex(x => x.id === id);
    if (i > -1) { l[i] = { ...l[i], ...patch }; store.set(l); }
  },
  remove: id => store.set(store.get().filter(x => x.id !== id))
};

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function timeLeft(ms) {
  if (ms <= 0) return '可解锁';
  const s = Math.floor(ms/1000), d = Math.floor(s/86400),
        h = Math.floor(s%86400/3600), m = Math.floor(s%3600/60), sec = s%60;
  if (d > 0) return `${d}天 ${h}时 ${m}分`;
  if (h > 0) return `${h}时 ${m}分 ${sec}秒`;
  return `${m}分 ${sec}秒`;
}

/* ============ 加密 ============ */
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

/* ============ 主题 ============ */
(function initTheme(){
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

/* ============ 视图切换 ============ */
$$('.tab').forEach(t => t.onclick = () => switchView(t.dataset.view));
function switchView(name) {
  $$('.tab').forEach(x => x.classList.toggle('active', x.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'list') renderList();
}

/* ============ 写信 ============ */
let selectedTag = '';
$('#content').addEventListener('input', e => {
  $('#char-count').textContent = e.target.value.length;
});

$$('.tag').forEach(t => t.onclick = () => {
  if (t.classList.contains('active')) {
    t.classList.remove('active'); selectedTag = '';
  } else {
    $$('.tag').forEach(x => x.classList.remove('active'));
    t.classList.add('active'); selectedTag = t.dataset.tag;
  }
});

// 精确时间切换
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

// 密码显示
$('#toggle-pwd').onclick = () => {
  const p = $('#password');
  p.type = p.type === 'password' ? 'text' : 'password';
  $('#toggle-pwd').textContent = p.type === 'password' ? '显示' : '隐藏';
};

// 密码强度
$('#password').addEventListener('input', e => {
  const v = e.target.value;
  let s = 0;
  if (v.length >= 4) s++;
  if (v.length >= 8) s++;
  if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++;
  if (/\d/.test(v)) s++;
  if (/[^A-Za-z0-9]/.test(v)) s++;
  const bar = $('#strength-bar');
  bar.className = s > 0 ? 's' + Math.min(s, 4) : '';
});

// 上锁
$('#lock-btn').onclick = async () => {
  const content = $('#content').value.trim();
  const password = $('#password').value;
  const hint = $('#hint').value.trim();
  const useExact = !$('#exact-date').classList.contains('hidden');

  if (!content) return toast('请先写信内容');
  if (password.length < 4) return toast('密码至少 4 位');

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
    const enc = await encrypt(content, password);
    store.add({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      unlockAt,
      hint,
      tag: selectedTag,
      enc
    });
    // 重置
    $('#content').value = ''; $('#password').value = ''; $('#hint').value = '';
    $('#char-count').textContent = '0';
    $$('.tag').forEach(x => x.classList.remove('active')); selectedTag = '';
    toast('🔒 已封存，到时候见');
    switchView('list');
  } catch (e) {
    toast('加密失败：' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '🔒 上锁封存';
  }
};

/* ============ 列表渲染 ============ */
function renderList() {
  const list = store.get().sort((a, b) => a.unlockAt - b.unlockAt);
  const box = $('#letters');
  $('#empty').style.display = list.length ? 'none' : 'block';
  $('#badge').textContent = list.length || '';

  box.innerHTML = list.map(item => {
    const left = item.unlockAt - Date.now();
    const ready = left <= 0;
    const total = item.unlockAt - item.createdAt;
    const progress = Math.min(100, Math.max(0, ((total - left) / total) * 100));
    return `
      <div class="letter" data-id="${item.id}">
        <div class="letter-head">
          <div class="letter-title">${ready ? '💌 可以打开了' : '🔒 封存中'}</div>
          ${item.tag ? `<span class="letter-tag">${item.tag}</span>` : ''}
        </div>
        <div class="letter-preview">${item.hint ? '提示：' + escapeHtml(item.hint) : '（无提示）'}</div>
        <div class="progress"><i style="width:${progress}%"></i></div>
        <div class="letter-meta">
          <span>解锁：${fmtDate(item.unlockAt)}</span>
          <span class="letter-status ${ready ? 'status-ready' : 'status-locked'}">
            ${ready ? '可打开' : timeLeft(left)}
          </span>
        </div>
      </div>`;
  }).join('');

  $$('.letter').forEach(el => el.onclick = () => openLetter(el.dataset.id));
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

/* ============ 打开信件弹窗 ============ */
let timer = null;
function openLetter(id) {
  const item = store.get().find(x => x.id === id);
  if (!item) return;
  const ready = Date.now() >= item.unlockAt;

  $('#modal').classList.remove('hidden');
  renderModal(item, ready);

  clearInterval(timer);
  if (!ready) {
    timer = setInterval(() => {
      const left = item.unlockAt - Date.now();
      if (left <= 0) { clearInterval(timer); renderModal(item, true); }
      else {
        const cd = $('#modal .countdown');
        if (cd) cd.textContent = timeLeft(left);
      }
    }, 1000);
  }
}

function renderModal(item, ready) {
  const body = $('#modal-body');
  if (!ready) {
    body.innerHTML = `
      <h2>🔒 还没到时间</h2>
      <p class="m-sub">这封信将在 ${fmtDate(item.unlockAt)} 解锁</p>
      <div class="countdown">${timeLeft(item.unlockAt - Date.now())}</div>
      ${item.hint ? `<p class="m-sub">提示：${escapeHtml(item.hint)}</p>` : ''}
      <div class="field">
        <span>可以提前输入密码（可选）</span>
        <input type="password" id="early-pwd" placeholder="密码">
      </div>
      <button class="ghost-btn" style="margin-top:12px;width:100%" id="delete-btn">删除这封信</button>
    `;
  } else {
    body.innerHTML = `
      <h2>💌 一封信</h2>
      <p class="m-sub">写于 ${fmtDate(item.createdAt)}</p>
      <div class="field">
        <span>输入密码解锁</span>
        <input type="password" id="open-pwd" placeholder="密码" autofocus>
      </div>
      <button class="primary-btn" style="margin-top:14px" id="unlock-btn">解锁阅读</button>
      <button class="danger-btn" id="delete-btn">删除这封信</button>
    `;
    $('#unlock-btn').onclick = () => tryUnlock(item);
    $('#open-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(item); });
  }
  $('#delete-btn').onclick = () => {
    if (confirm('确定删除这封信？无法恢复')) {
      store.remove(item.id); closeModal(); renderList(); toast('已删除');
    }
  };
}

async function tryUnlock(item) {
  const pwd = $('#open-pwd').value;
  if (!pwd) return toast('请输入密码');
  const btn = $('#unlock-btn'); btn.disabled = true; btn.textContent = '解密中…';
  try {
    const text = await decrypt(item.enc, pwd);
    // 打字机效果
    $('#modal-body').innerHTML = `
      <h2>💌 你的信</h2>
      <p class="m-sub">写于 ${fmtDate(item.createdAt)} · ${item.tag || ''}</p>
      <div class="letter-content" id="letter-text"></div>
      <button class="ghost-btn" style="width:100%" id="copy-btn">复制内容</button>
      <button class="danger-btn" id="delete-btn">删除这封信</button>
    `;
    const el = $('#letter-text');
    let i = 0;
    const speed = Math.max(8, Math.min(40, 1200 / text.length));
    const type = () => {
      if (i >= text.length) return;
      el.textContent += text[i++];
      setTimeout(type, speed);
    };
    type();

    $('#copy-btn').onclick = () => {
      navigator.clipboard.writeText(text).then(() => toast('已复制'));
    };
    $('#delete-btn').onclick = () => {
      if (confirm('确定删除这封信？无法恢复')) {
        store.remove(item.id); closeModal(); renderList(); toast('已删除');
      }
    };
  } catch (e) {
    btn.disabled = false; btn.textContent = '解锁阅读';
    toast('密码错误，或信件已损坏');
  }
}

function closeModal() {
  $('#modal').classList.add('hidden');
  clearInterval(timer);
}
$('#modal-close').onclick = closeModal;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* ============ 导入 / 导出 ============ */
$('#export-btn').onclick = () => {
  const data = store.get();
  if (!data.length) return toast('信箱为空');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `timecapsule-${new Date().toISOString().slice(0,10)}.json`;
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
      const arr = JSON.parse(r.result);
      if (!Array.isArray(arr)) throw new Error('格式错误');
      const cur = store.get();
      const ids = new Set(cur.map(x => x.id));
      let added = 0;
      arr.forEach(x => { if (!ids.has(x.id)) { cur.push(x); added++; } });
      store.set(cur);
      renderList();
      toast(`导入完成，新增 ${added} 封`);
    } catch (e) {
      toast('导入失败：' + e.message);
    }
  };
  r.readAsText(f);
  e.target.value = '';
};

/* ============ 初始化 ============ */
renderList();
// 每分钟刷新倒计时显示
setInterval(() => {
  if ($('#view-list').classList.contains('active')) renderList();
}, 60000);
