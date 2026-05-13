// ==UserScript==
// @name         📸 對帳單截圖助手 ・ 投資型專區
// @namespace    https://rex1688.com/rex/vip/
// @version      3.1.0
// @description  拖曳選取 / 自動定位 / 教學模式 ・ 自動命名 + 直接存到 vip/assets/img/cases/
// @author       鼎綸恩宇 ・ Cowork
// @match        *://*.chubblife.com.tw/*
// @match        *://*.chubblife-vul.com.tw/*
// @match        *://*.chubb.com/*
// @match        *://*.kgilife.com.tw/*
// @match        *://*.yuantalife.com/*
// @match        *://*.yuantalife.com.tw/*
// @match        *://*.bnpparibascardif.com.tw/*
// @match        *://*.cardif.com.tw/*
// @match        *://localhost/*
// @grant        none
// @require      https://html2canvas.hertzen.com/dist/html2canvas.min.js
// @run-at       document-idle
// ==/UserScript==

/* eslint-disable */
(function() {
  'use strict';

  // ─── 狀態 ───
  const COUNTER_KEY = 'vip-shot-counters';
  const SELECTORS_KEY = 'vip-shot-selectors';
  let counters = JSON.parse(localStorage.getItem(COUNTER_KEY) || '{}');
  let selectors = JSON.parse(localStorage.getItem(SELECTORS_KEY) || '{}');
  let lastCaseId = localStorage.getItem('vip-shot-last-case') || '';
  let dirHandle = null;
  const HOST = location.hostname;

  // IndexedDB for dirHandle 持久化
  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('vip-shot', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('handles');
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e);
    });
  }
  async function saveDirHandle(h) {
    const db = await openDb();
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(h, 'cases-dir');
    return new Promise(r => tx.oncomplete = r);
  }
  async function restoreDirHandle() {
    try {
      const db = await openDb();
      const req = db.transaction('handles', 'readonly').objectStore('handles').get('cases-dir');
      return new Promise(resolve => {
        req.onsuccess = async () => {
          const h = req.result;
          if (h) {
            try {
              const perm = await h.queryPermission({ mode: 'readwrite' });
              if (perm === 'granted') { dirHandle = h; updateUi(); return resolve(true); }
              dirHandle = h; updateUi(true);
            } catch (e) {}
          }
          resolve(false);
        };
        req.onerror = () => resolve(false);
      });
    } catch (e) { return false; }
  }

  // ─── 學習 / 選擇器工具 ───
  function getSelectorFor(el) {
    if (!el || el === document.body) return null;
    // 優先用 ID（如果唯一）
    if (el.id) {
      try {
        if (document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) {
          return `#${CSS.escape(el.id)}`;
        }
      } catch (e) {}
    }
    // 否則用路徑（最多 6 層）
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && parts.length < 6) {
      let part = cur.tagName.toLowerCase();
      if (cur.id) {
        try {
          part = `#${CSS.escape(cur.id)}`;
          parts.unshift(part);
          break;
        } catch (e) {}
      }
      // 加上 class
      if (cur.className && typeof cur.className === 'string') {
        const classes = cur.className.trim().split(/\s+/)
          .filter(c => c && !c.includes('vip-shot') && c.length < 30)
          .slice(0, 2);
        if (classes.length) {
          try { part += '.' + classes.map(c => CSS.escape(c)).join('.'); } catch (e) {}
        }
      }
      // 加上 nth-of-type 防歧義
      if (cur.parentElement) {
        const siblings = Array.from(cur.parentElement.children).filter(c => c.tagName === cur.tagName);
        if (siblings.length > 1) {
          const idx = siblings.indexOf(cur) + 1;
          part += `:nth-of-type(${idx})`;
        }
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }
  function saveSelector(sel) {
    selectors[HOST] = { selector: sel, learnedAt: Date.now() };
    localStorage.setItem(SELECTORS_KEY, JSON.stringify(selectors));
    updateUi();
  }
  function clearSelector() {
    delete selectors[HOST];
    localStorage.setItem(SELECTORS_KEY, JSON.stringify(selectors));
    updateUi();
  }
  function getLearnedSelector() {
    return selectors[HOST]?.selector || null;
  }

  // ─── CSS ───
  const css = `
    #vip-shot-fab {
      position: fixed; right: 20px; bottom: 20px;
      z-index: 2147483646;
      display: flex; align-items: center; gap: 8px;
      background: linear-gradient(135deg, #F05A28 0%, #D04618 100%);
      color: #fff; padding: 12px 20px; border: none;
      border-radius: 50px; cursor: pointer;
      font-size: 14px; font-weight: 900; letter-spacing: 1px;
      box-shadow: 0 8px 28px rgba(240,90,40,0.55);
      font-family: 'Noto Sans TC', -apple-system, sans-serif;
      transition: all 0.25s;
    }
    #vip-shot-fab:hover { transform: translateY(-2px); box-shadow: 0 12px 36px rgba(240,90,40,0.7); }
    #vip-shot-fab .badge {
      background: rgba(255,255,255,0.25); padding: 2px 8px; border-radius: 12px;
      font-size: 11px; font-family: 'Bebas Neue', monospace; letter-spacing: 1px;
    }
    #vip-shot-fab.learned { background: linear-gradient(135deg, #2E8B57 0%, #1a6b3a 100%); box-shadow: 0 8px 28px rgba(46,139,87,0.55); }
    #vip-shot-fab.learned:hover { box-shadow: 0 12px 36px rgba(46,139,87,0.7); }
    #vip-shot-panel {
      position: fixed; right: 20px; bottom: 80px;
      width: 340px; background: #fff; border-radius: 18px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.3);
      z-index: 2147483645;
      padding: 20px; display: none;
      font-family: 'Noto Sans TC', -apple-system, sans-serif;
      color: #0D2A3A;
    }
    #vip-shot-panel.show { display: block; animation: vsf-in 0.25s; }
    @keyframes vsf-in { from { opacity:0; transform: translateY(8px); } to {opacity:1; transform:translateY(0);} }
    #vip-shot-panel h3 {
      font-size: 15px; font-weight: 900; letter-spacing: 1px;
      margin: 0 0 12px; color: #0D2A3A;
      display: flex; justify-content: space-between; align-items: center;
    }
    #vip-shot-panel .row {
      font-size: 11px; color: #6b7680; letter-spacing: 1px;
      margin: 12px 0 6px; font-weight: 900;
    }
    #vip-shot-panel input {
      width: 100%; padding: 10px 14px; border: 2px solid #EAE5DC;
      border-radius: 10px; font-size: 16px; font-weight: 900;
      font-family: 'Bebas Neue', monospace; letter-spacing: 3px;
      color: #0D2A3A; text-transform: lowercase;
      box-sizing: border-box;
    }
    #vip-shot-panel input:focus { outline: none; border-color: #F05A28; box-shadow: 0 0 0 4px rgba(240,90,40,0.15); }
    #vip-shot-panel .filename {
      text-align: center; margin: 10px 0;
      font-family: 'Bebas Neue', monospace; font-size: 18px;
      color: #F05A28; letter-spacing: 1.5px;
      background: #FDE8DF; padding: 10px; border-radius: 10px;
    }
    #vip-shot-panel button.action {
      width: 100%; padding: 12px; border: none; border-radius: 12px;
      font-size: 13px; font-weight: 900; letter-spacing: 1.2px;
      cursor: pointer; transition: all 0.2s;
      font-family: inherit; box-sizing: border-box;
    }
    #vip-shot-panel .btn-auto {
      background: linear-gradient(135deg, #2E8B57, #1a6b3a); color: #fff;
      margin-top: 12px; box-shadow: 0 4px 12px rgba(46,139,87,0.35);
    }
    #vip-shot-panel .btn-auto:hover { transform: translateY(-2px); }
    #vip-shot-panel .btn-auto[disabled] { opacity: 0.5; cursor: not-allowed; background: #888; }
    #vip-shot-panel .btn-region {
      background: linear-gradient(135deg, #F05A28, #D04618); color: #fff;
      margin-top: 8px; box-shadow: 0 4px 12px rgba(240,90,40,0.35);
    }
    #vip-shot-panel .btn-region:hover { transform: translateY(-2px); }
    #vip-shot-panel .btn-teach {
      background: #fff; color: #0D2A3A; border: 1.5px solid #E8A020;
      margin-top: 8px;
    }
    #vip-shot-panel .btn-teach:hover { background: #E8A020; color: #fff; }
    #vip-shot-panel .btn-clear-learn {
      background: #fff; color: #C8203A; border: 1.5px solid #EAE5DC;
      margin-top: 6px;
      font-size: 11px !important; padding: 8px !important;
    }
    #vip-shot-panel .btn-clear-learn:hover { border-color: #C8203A; }
    #vip-shot-panel .btn-folder {
      background: #fff; color: #0D2A3A; border: 1.5px solid #EAE5DC;
      margin-top: 8px;
    }
    #vip-shot-panel .btn-folder:hover { border-color: #F05A28; color: #F05A28; }
    #vip-shot-panel .btn-folder.connected {
      background: linear-gradient(135deg, #2E8B57, #1a6b3a); color: #fff; border: none;
    }
    #vip-shot-panel .status {
      font-size: 11px; color: #888; margin-top: 8px;
      letter-spacing: 0.5px; line-height: 1.5;
    }
    #vip-shot-panel .status.ok { color: #2E8B57; font-weight: 700; }
    #vip-shot-panel .close {
      background: transparent !important; border: none !important;
      color: #888 !important; width: auto !important; padding: 0 !important;
      font-size: 18px !important; box-shadow: none !important; cursor: pointer;
    }
    #vip-shot-panel .learn-status {
      background: linear-gradient(135deg, rgba(46,139,87,0.08), rgba(46,139,87,0.04));
      border: 1.5px solid rgba(46,139,87,0.3);
      padding: 10px 12px; border-radius: 10px;
      margin-top: 8px;
      font-size: 11px; color: #2E8B57;
      letter-spacing: 0.5px; line-height: 1.5;
    }
    #vip-shot-panel .learn-status.empty {
      background: linear-gradient(135deg, rgba(232,160,32,0.08), rgba(232,160,32,0.04));
      border-color: rgba(232,160,32,0.3); color: #d68b15;
    }
    #vip-shot-panel .learn-status code {
      background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 3px;
      font-size: 10px; word-break: break-all;
    }

    /* 教學模式 hover 高亮 */
    .vip-shot-teach-hover {
      outline: 3px solid #E8A020 !important;
      outline-offset: 2px !important;
      background: rgba(232,160,32,0.08) !important;
      cursor: crosshair !important;
    }

    /* 自動定位閃光 */
    @keyframes vipShotPulse {
      0%, 100% { outline-color: rgba(46,139,87,0.8); box-shadow: 0 0 0 0 rgba(46,139,87,0.4); }
      50% { outline-color: rgba(46,139,87,1); box-shadow: 0 0 0 20px rgba(46,139,87,0); }
    }
    .vip-shot-auto-target {
      outline: 3px solid #2E8B57 !important;
      outline-offset: 2px !important;
      animation: vipShotPulse 1s 2 !important;
    }

    /* 教學模式提示橫條 */
    #vip-shot-teach-banner {
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      background: linear-gradient(135deg, #E8A020, #d68b15); color: #fff;
      padding: 12px 24px; border-radius: 50px;
      font-size: 14px; font-weight: 900; letter-spacing: 1px;
      font-family: 'Noto Sans TC', -apple-system, sans-serif;
      box-shadow: 0 8px 24px rgba(232,160,32,0.5);
      z-index: 2147483646; pointer-events: none;
      border: 2px solid rgba(255,255,255,0.4);
    }

    /* 區域選擇 Overlay */
    #vip-shot-overlay {
      position: fixed; inset: 0; z-index: 2147483640;
      cursor: crosshair; background: rgba(13,42,58,0.4);
    }
    #vip-shot-overlay::before {
      content: '🎯 拖曳選取對帳單區域 ・ ESC 取消';
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      background: rgba(13,42,58,0.95); color: #fff;
      padding: 10px 20px; border-radius: 50px;
      font-size: 13px; letter-spacing: 1px; font-weight: 700;
      font-family: 'Noto Sans TC', -apple-system, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3); pointer-events: none;
      border: 1px solid rgba(232,160,32,0.5);
    }
    #vip-shot-rect {
      position: fixed; pointer-events: none;
      border: 2px solid #F05A28;
      background: rgba(240,90,40,0.12);
      box-shadow: 0 0 0 99999px rgba(13,42,58,0.4);
    }
    #vip-shot-size-tag {
      position: fixed; pointer-events: none;
      background: #F05A28; color: #fff;
      padding: 3px 10px; border-radius: 6px;
      font-family: 'Bebas Neue', monospace;
      font-size: 13px; letter-spacing: 1px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }

    /* Toast */
    #vip-shot-toast {
      position: fixed; right: 20px; bottom: 80px;
      background: #0D2A3A; color: #fff; padding: 12px 20px;
      border-radius: 12px; font-size: 13px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      z-index: 2147483647;
      animation: vsf-toast-in 0.3s;
      font-family: 'Noto Sans TC', -apple-system, sans-serif;
      max-width: 320px; line-height: 1.5;
    }
    #vip-shot-toast.err { border-left: 4px solid #C8203A; }
    #vip-shot-toast.ok { border-left: 4px solid #2E8B57; }
    #vip-shot-toast.warn { border-left: 4px solid #E8A020; }
    @keyframes vsf-toast-in { from { opacity:0; transform: translateX(20px); } to {opacity:1; transform:translateX(0);} }

    /* Loading */
    #vip-shot-loading {
      position: fixed; inset: 0; z-index: 2147483647;
      background: rgba(13,42,58,0.85); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-family: 'Noto Sans TC', sans-serif;
      flex-direction: column; gap: 18px;
    }
    #vip-shot-loading .spinner {
      width: 56px; height: 56px;
      border: 4px solid rgba(255,255,255,0.15);
      border-top-color: #E8A020;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    #vip-shot-loading .txt { font-size: 15px; letter-spacing: 2px; font-weight: 700; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ─── 主按鈕 + 面板 ───
  const fab = document.createElement('button');
  fab.id = 'vip-shot-fab';
  fab.innerHTML = '📸 截圖 <span class="badge" id="vsf-badge">—</span>';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.id = 'vip-shot-panel';
  panel.innerHTML = `
    <h3>📸 對帳單截圖 v3 <button class="close" id="vsf-close">✕</button></h3>
    <div class="row">▸ 案例編號</div>
    <input type="text" id="vsf-case" placeholder="例：u0033" maxlength="6" autocomplete="off">
    <div class="row">▸ 建置月份</div>
    <input type="month" id="vsf-date" style="font-size:14px; letter-spacing:1px;">
    <div class="filename" id="vsf-filename">u0033-202605-1.jpg</div>

    <button class="action btn-auto" id="vsf-auto" disabled>🤖 自動定位 + 截圖 (Alt+A)</button>
    <div class="learn-status empty" id="vsf-learn">尚未教學此網站 ・ 先用「教學模式」標出對帳單位置</div>

    <button class="action btn-teach" id="vsf-teach">🎓 教學：標出對帳單位置</button>
    <button class="action btn-region" id="vsf-region">🎯 拖曳選取 (Alt+S)</button>

    <button class="action btn-clear-learn" id="vsf-clear-learn" style="display:none;">✕ 清除此網站的教學記憶</button>

    <div class="row">▸ 儲存位置</div>
    <button class="action btn-folder" id="vsf-folder">📁 連結 cases 資料夾</button>
    <div class="status" id="vsf-status">資料夾未連結 ・ 將以下載提供</div>
  `;
  document.body.appendChild(panel);

  // ─── 元素 ───
  const caseInput = panel.querySelector('#vsf-case');
  const dateInput = panel.querySelector('#vsf-date');
  const filenameEl = panel.querySelector('#vsf-filename');
  const statusEl = panel.querySelector('#vsf-status');
  const autoBtn = panel.querySelector('#vsf-auto');
  const teachBtn = panel.querySelector('#vsf-teach');
  const regionBtn = panel.querySelector('#vsf-region');
  const clearLearnBtn = panel.querySelector('#vsf-clear-learn');
  const folderBtn = panel.querySelector('#vsf-folder');
  const learnStatusEl = panel.querySelector('#vsf-learn');
  const badgeEl = fab.querySelector('#vsf-badge');

  // ─── 通用 ───
  function getCaseId() { return (caseInput.value || '').trim().toLowerCase(); }
  function getYearMonth() {
    const v = dateInput.value;
    return v ? v.replace('-', '') : null;
  }
  function getCounterKey() {
    const cid = getCaseId();
    const ym = getYearMonth();
    return ym ? `${cid}-${ym}` : cid;
  }
  function getNextIndex() { return (counters[getCounterKey()] || 0) + 1; }
  function updateFilename() {
    const cid = getCaseId();
    const ym = getYearMonth();
    if (!/^[a-z]\d{4}$/.test(cid)) {
      filenameEl.textContent = '請輸入案例編號';
      badgeEl.textContent = '—';
      return;
    }
    const idx = getNextIndex();
    filenameEl.textContent = ym ? `${cid}-${ym}-${idx}.jpg` : `${cid}-${idx}.jpg`;
    badgeEl.textContent = ym ? `${cid.toUpperCase()} ${ym} #${idx}` : `${cid.toUpperCase()} #${idx}`;
  }
  // 預設本月
  (function initDate() {
    const t = new Date();
    dateInput.value = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0');
  })();
  dateInput.addEventListener('change', updateFilename);
  function updateUi(needsReauth = false) {
    // dirHandle 狀態
    if (dirHandle) {
      statusEl.textContent = needsReauth ? '⚠ 需重新授權' : `✓ 已連結「${dirHandle.name}」`;
      statusEl.classList.toggle('ok', !needsReauth);
      folderBtn.textContent = needsReauth ? '🔓 重新授權資料夾' : `📁 已連結 ・ ${dirHandle.name}`;
      folderBtn.classList.toggle('connected', !needsReauth);
    } else {
      statusEl.textContent = '資料夾未連結 ・ 將以下載提供';
      statusEl.classList.remove('ok');
      folderBtn.textContent = '📁 連結 cases 資料夾';
      folderBtn.classList.remove('connected');
    }
    // 教學狀態
    const sel = getLearnedSelector();
    if (sel) {
      learnStatusEl.classList.remove('empty');
      learnStatusEl.innerHTML = `✓ 已學習 <strong>${HOST}</strong><br><code>${sel.length > 60 ? sel.slice(0, 60) + '…' : sel}</code>`;
      autoBtn.disabled = false;
      teachBtn.textContent = '🎓 重新教學（取代目前記憶）';
      clearLearnBtn.style.display = 'block';
      fab.classList.add('learned');
      fab.innerHTML = '✨ 已就緒 <span class="badge" id="vsf-badge">' + badgeEl.textContent + '</span>';
    } else {
      learnStatusEl.classList.add('empty');
      learnStatusEl.innerHTML = `尚未教學 <strong>${HOST}</strong> ・ 請按「教學模式」`;
      autoBtn.disabled = true;
      teachBtn.textContent = '🎓 教學：標出對帳單位置';
      clearLearnBtn.style.display = 'none';
      fab.classList.remove('learned');
      fab.innerHTML = '📸 截圖 <span class="badge">' + badgeEl.textContent + '</span>';
    }
    // 重新繫結 badge
    badgeEl.parentNode || (fab.querySelector('.badge') && (Object.defineProperty(window, '__vsfBadge', { value: fab.querySelector('.badge'), configurable: true })));
  }
  function toast(msg, type = 'ok', dur = 2600) {
    const old = document.getElementById('vip-shot-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'vip-shot-toast';
    t.className = type;
    t.innerHTML = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), dur);
  }
  function showLoading(msg) {
    const old = document.getElementById('vip-shot-loading');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'vip-shot-loading';
    el.innerHTML = `<div class="spinner"></div><div class="txt">${msg}</div>`;
    document.body.appendChild(el);
  }
  function hideLoading() {
    const el = document.getElementById('vip-shot-loading');
    if (el) el.remove();
  }

  // ─── 初始化 ───
  caseInput.value = lastCaseId;
  caseInput.addEventListener('input', updateFilename);
  caseInput.addEventListener('change', () => {
    const cid = caseInput.value.trim().toLowerCase();
    localStorage.setItem('vip-shot-last-case', cid);
    if (cid && dirHandle && /^[a-z]\d{4}$/.test(cid)) probeExisting();
  });
  updateFilename();

  fab.addEventListener('click', () => {
    panel.classList.toggle('show');
    if (panel.classList.contains('show')) { caseInput.focus(); caseInput.select(); }
  });
  panel.querySelector('#vsf-close').addEventListener('click', e => {
    e.stopPropagation(); panel.classList.remove('show');
  });

  // ─── 連結資料夾 ───
  folderBtn.addEventListener('click', async () => {
    if (!window.showDirectoryPicker) {
      toast('此瀏覽器不支援直接存檔，將改用下載', 'warn'); return;
    }
    try {
      if (dirHandle) {
        const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') { updateUi(); toast('✓ 已重新授權', 'ok'); return; }
      }
      const h = await window.showDirectoryPicker({ id: 'vip-cases-img', mode: 'readwrite' });
      dirHandle = h;
      await saveDirHandle(h);
      updateUi();
      toast('✓ 資料夾已連結 ・ 下次自動記住', 'ok', 3000);
      if (/^[a-z]\d{4}$/.test(getCaseId())) await probeExisting();
    } catch (e) {
      if (e.name !== 'AbortError') toast('連結失敗：' + e.message, 'err');
    }
  });

  async function probeExisting() {
    if (!dirHandle) return;
    const cid = getCaseId();
    const ym = getYearMonth();
    if (!/^[a-z]\d{4}$/.test(cid)) return;
    const prefix = ym ? `${cid}-${ym}-` : `${cid}-`;
    const key = getCounterKey();
    let maxN = 0;
    for (let i = 1; i <= 20; i++) {
      let found = false;
      for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
        try { await dirHandle.getFileHandle(`${prefix}${i}.${ext}`); found = true; break; } catch (e) {}
      }
      if (!found) break;
      maxN = i;
    }
    if (maxN > 0) {
      counters[key] = maxN;
      localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
      updateFilename();
      toast(`${prefix}* 已有 ${maxN} 張 ・ 從第 ${maxN + 1} 開始`, 'warn', 3500);
    }
  }

  // ─── 教學模式（點選元素）───
  function startTeachMode() {
    panel.classList.remove('show');
    fab.style.display = 'none';

    const banner = document.createElement('div');
    banner.id = 'vip-shot-teach-banner';
    banner.textContent = '🎓 教學模式 ・ 把滑鼠移到對帳單區塊上 → 點擊確認 ・ ESC 取消';
    document.body.appendChild(banner);

    let hoverEl = null;

    const onMouseMove = (e) => {
      const el = e.target;
      if (!el || el === document.body || el.id === 'vip-shot-fab' || el.id === 'vip-shot-panel') return;
      if (hoverEl && hoverEl !== el) hoverEl.classList.remove('vip-shot-teach-hover');
      hoverEl = el;
      el.classList.add('vip-shot-teach-hover');
    };

    const cleanup = () => {
      if (hoverEl) hoverEl.classList.remove('vip-shot-teach-hover');
      banner.remove();
      fab.style.display = '';
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
    };

    const onClick = (e) => {
      // 不能點到我們自己的 UI
      if (e.target.closest('#vip-shot-fab') || e.target.closest('#vip-shot-panel')) return;
      e.preventDefault();
      e.stopPropagation();
      const el = e.target;
      const sel = getSelectorFor(el);
      if (!sel) { toast('無法產生選擇器，請選別的元素', 'err'); return; }
      // 驗證
      let matched = null;
      try { matched = document.querySelectorAll(sel); } catch (err) {}
      if (!matched || matched.length === 0) {
        toast('選擇器無法找回元素，請改選父層', 'err');
        return;
      }
      saveSelector(sel);
      cleanup();
      const rect = el.getBoundingClientRect();
      toast(`✓ 已學會 <strong>${HOST}</strong> 的對帳單位置<br>區域 ${Math.round(rect.width)}×${Math.round(rect.height)} ・ 之後按 <strong>Alt+A</strong> 自動截`, 'ok', 5000);
    };

    const onKey = (e) => {
      if (e.key === 'Escape') { cleanup(); toast('已取消教學', 'warn', 1500); }
    };

    // 用 capture phase 才能搶在原網頁的 onclick 之前
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
  }
  teachBtn.addEventListener('click', startTeachMode);

  clearLearnBtn.addEventListener('click', () => {
    if (confirm(`要清除 ${HOST} 的教學記憶嗎？`)) {
      clearSelector();
      toast('已清除教學記憶', 'warn');
    }
  });

  // ─── 自動定位 + 截圖 ───
  async function autoCapture() {
    const cid = getCaseId();
    if (!/^[a-z]\d{4}$/.test(cid)) {
      toast('⚠ 先輸入案例編號', 'err');
      panel.classList.add('show'); caseInput.focus();
      return;
    }
    const sel = getLearnedSelector();
    if (!sel) {
      toast('⚠ 尚未教學此網站 ・ 請先按「🎓 教學」', 'err', 4000);
      panel.classList.add('show');
      return;
    }
    let target = null;
    try { target = document.querySelector(sel); } catch (e) {}
    if (!target) {
      toast(`❌ 找不到對帳單區域 (selector: ${sel.slice(0, 50)}…)<br>請重新教學`, 'err', 5000);
      panel.classList.add('show');
      return;
    }
    panel.classList.remove('show');

    // 滾動到目標附近
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await new Promise(r => setTimeout(r, 600));

    // 視覺強調目標
    target.classList.add('vip-shot-auto-target');
    await new Promise(r => setTimeout(r, 200));

    // 取得最新 bounding rect（滾動後）
    const rect = target.getBoundingClientRect();
    const docX = rect.left + window.scrollX;
    const docY = rect.top + window.scrollY;
    const w = rect.width;
    const h = rect.height;

    target.classList.remove('vip-shot-auto-target');

    if (w < 30 || h < 30) {
      toast('目標元素太小 ・ 請重新教學選更大的容器', 'err');
      return;
    }

    await captureAndSave(docX, docY, w, h, false);
  }
  autoBtn.addEventListener('click', autoCapture);

  // ─── 拖曳選取 ───
  function startRegionSelection() {
    const cid = getCaseId();
    if (!/^[a-z]\d{4}$/.test(cid)) {
      toast('⚠ 先輸入案例編號才能截圖', 'err');
      panel.classList.add('show'); caseInput.focus();
      return;
    }
    panel.classList.remove('show');
    fab.style.display = 'none';

    const overlay = document.createElement('div');
    overlay.id = 'vip-shot-overlay';
    document.body.appendChild(overlay);

    let startX, startY, rectEl = null, sizeTagEl = null, isDragging = false;

    const cleanup = () => {
      overlay.remove();
      if (rectEl) rectEl.remove();
      if (sizeTagEl) sizeTagEl.remove();
      fab.style.display = '';
    };
    const escHandler = (e) => {
      if (e.key === 'Escape') { cleanup(); document.removeEventListener('keydown', escHandler); toast('已取消選取', 'warn', 1500); }
    };
    document.addEventListener('keydown', escHandler);

    overlay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true; startX = e.clientX; startY = e.clientY;
      rectEl = document.createElement('div'); rectEl.id = 'vip-shot-rect';
      rectEl.style.left = startX + 'px'; rectEl.style.top = startY + 'px';
      rectEl.style.width = '0px'; rectEl.style.height = '0px';
      document.body.appendChild(rectEl);
      sizeTagEl = document.createElement('div'); sizeTagEl.id = 'vip-shot-size-tag';
      document.body.appendChild(sizeTagEl);
    });
    overlay.addEventListener('mousemove', (e) => {
      if (!isDragging || !rectEl) return;
      const x = Math.min(startX, e.clientX), y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
      rectEl.style.left = x + 'px'; rectEl.style.top = y + 'px';
      rectEl.style.width = w + 'px'; rectEl.style.height = h + 'px';
      sizeTagEl.textContent = `${w} × ${h}`;
      sizeTagEl.style.left = (x + w + 6) + 'px'; sizeTagEl.style.top = y + 'px';
    });
    overlay.addEventListener('mouseup', async (e) => {
      if (!isDragging || !rectEl) return;
      isDragging = false;
      document.removeEventListener('keydown', escHandler);
      const vpX = Math.min(startX, e.clientX), vpY = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX), h = Math.abs(e.clientY - startY);
      cleanup();
      if (w < 30 || h < 30) { toast('選取範圍太小', 'err'); return; }
      await captureAndSave(vpX + window.scrollX, vpY + window.scrollY, w, h, false);
    });
  }
  regionBtn.addEventListener('click', startRegionSelection);

  // ─── 擷取並儲存 ───
  async function captureAndSave(x, y, w, h, fullPage = false) {
    const cid = getCaseId();
    const ym = getYearMonth();
    if (!/^[a-z]\d{4}$/.test(cid)) { toast('案例編號格式錯誤', 'err'); return; }
    const idx = getNextIndex();
    const fname = ym ? `${cid}-${ym}-${idx}.jpg` : `${cid}-${idx}.jpg`;

    showLoading(fullPage ? '截取整頁中...' : `擷取區域中...`);

    try {
      const opts = {
        scale: window.devicePixelRatio || 1,
        useCORS: true, logging: false,
        backgroundColor: '#ffffff', allowTaint: true,
      };
      if (!fullPage) {
        opts.x = x; opts.y = y; opts.width = w; opts.height = h;
        opts.windowWidth = document.documentElement.scrollWidth;
        opts.windowHeight = document.documentElement.scrollHeight;
      }
      const canvas = await html2canvas(document.documentElement, opts);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
      const sizeKB = (blob.size / 1024).toFixed(0);
      hideLoading();

      if (dirHandle) {
        try {
          const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
          if (perm !== 'granted') {
            const newPerm = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (newPerm !== 'granted') throw new Error('使用者未授權');
          }
          const fh = await dirHandle.getFileHandle(fname, { create: true });
          const writable = await fh.createWritable();
          await writable.write(blob); await writable.close();
          counters[getCounterKey()] = idx;
          localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
          updateFilename();
          toast(`✓ <strong>${fname}</strong> 已存到 cases 資料夾<br>${sizeKB}KB ・ ${Math.round(w) || canvas.width}×${Math.round(h) || canvas.height}`, 'ok', 3500);
        } catch (e) {
          toast('存檔失敗，改下載：' + e.message, 'warn');
          downloadBlob(fname, blob);
        }
      } else {
        downloadBlob(fname, blob);
        counters[cid] = idx;
        localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
        updateFilename();
        toast(`✓ <strong>${fname}</strong> 已下載<br>請拖到 cases 資料夾 ・ ${sizeKB}KB`, 'warn', 4500);
      }
    } catch (e) {
      hideLoading();
      toast('截圖失敗：' + e.message, 'err', 4000);
    }
  }

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ─── 鍵盤快捷鍵 ───
  document.addEventListener('keydown', e => {
    // Alt+A → 自動定位（推薦主用）
    if (e.altKey && !e.shiftKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      autoCapture();
    }
    // Alt+S → 拖曳選取（彈性，未教學時備用）
    if (e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      const cid = getCaseId();
      if (!/^[a-z]\d{4}$/.test(cid)) {
        panel.classList.add('show'); caseInput.focus(); caseInput.select();
        toast('先輸入案例編號', 'warn');
      } else { startRegionSelection(); }
    }
    // Alt+T → 進入教學模式
    if (e.altKey && !e.shiftKey && (e.key === 't' || e.key === 'T')) {
      e.preventDefault();
      startTeachMode();
    }
  });

  // 還原 dirHandle 並更新 UI
  restoreDirHandle();
  updateUi();

  console.log('[VIP 截圖助手 v3] 已就緒');
  console.log('  Alt+A → 自動定位（教學後可用）');
  console.log('  Alt+S → 拖曳選取');
  console.log('  Alt+T → 進入教學模式');
})();
