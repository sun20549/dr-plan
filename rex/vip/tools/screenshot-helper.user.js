// ==UserScript==
// @name         📸 對帳單截圖助手 ・ 投資型專區
// @namespace    https://rex1688.com/rex/vip/
// @version      2.0.0
// @description  在保險經代網上拖選區域截圖 + 自動命名 + 直接存到 vip/assets/img/cases/
// @author       鼎綸恩宇 ・ Cowork
// @match        *://*.chubblife.com.tw/*
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
  let counters = JSON.parse(localStorage.getItem(COUNTER_KEY) || '{}');
  let lastCaseId = localStorage.getItem('vip-shot-last-case') || '';
  let dirHandle = null;
  let pendingBlob = null;  // 暫存區域截圖等待命名

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
      const tx = db.transaction('handles', 'readonly');
      const req = tx.objectStore('handles').get('cases-dir');
      return new Promise(resolve => {
        req.onsuccess = async () => {
          const h = req.result;
          if (h) {
            try {
              const perm = await h.queryPermission({ mode: 'readwrite' });
              if (perm === 'granted') { dirHandle = h; updateUi(); return resolve(true); }
              // 需要使用者授權，等他下次點按鈕
              dirHandle = h;
              updateUi(true);
            } catch (e) {}
          }
          resolve(false);
        };
        req.onerror = () => resolve(false);
      });
    } catch (e) { return false; }
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
      font-size: 13px; font-weight: 900; letter-spacing: 1.5px;
      cursor: pointer; transition: all 0.2s;
      font-family: inherit; box-sizing: border-box;
    }
    #vip-shot-panel .btn-region {
      background: linear-gradient(135deg, #F05A28, #D04618); color: #fff;
      margin-top: 12px; box-shadow: 0 4px 12px rgba(240,90,40,0.35);
    }
    #vip-shot-panel .btn-region:hover { transform: translateY(-2px); }
    #vip-shot-panel .btn-full {
      background: #fff; color: #0D2A3A; border: 1.5px solid #EAE5DC;
      margin-top: 8px;
    }
    #vip-shot-panel .btn-full:hover { border-color: #F05A28; color: #F05A28; }
    #vip-shot-panel .btn-folder {
      background: #fff; color: #0D2A3A; border: 1.5px solid #EAE5DC;
      margin-top: 8px;
    }
    #vip-shot-panel .btn-folder:hover { border-color: #F05A28; color: #F05A28; }
    #vip-shot-panel .btn-folder.connected {
      background: linear-gradient(135deg, #2E8B57, #1a6b3a); color: #fff; border: none;
    }
    #vip-shot-panel .status {
      font-size: 11px; color: #888; margin-top: 10px;
      letter-spacing: 0.5px; line-height: 1.5;
    }
    #vip-shot-panel .status.ok { color: #2E8B57; font-weight: 700; }
    #vip-shot-panel .close {
      background: transparent !important; border: none !important;
      color: #888 !important; width: auto !important; padding: 0 !important;
      font-size: 18px !important; box-shadow: none !important; cursor: pointer;
    }
    #vip-shot-panel .preview-img {
      width: 100%; max-height: 200px; object-fit: contain;
      border-radius: 10px; border: 1.5px solid #EAE5DC;
      margin-top: 8px; background: #FAF7F2;
      display: block;
    }
    #vip-shot-panel .hint {
      font-size: 11px; color: #888; letter-spacing: 0.5px;
      margin-top: 4px; line-height: 1.5;
    }

    /* 區域選擇 Overlay */
    #vip-shot-overlay {
      position: fixed; inset: 0;
      z-index: 2147483640;
      cursor: crosshair;
      background: rgba(13,42,58,0.4);
    }
    #vip-shot-overlay::before {
      content: '🎯 拖曳選取對帳單區域 ・ ESC 取消';
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      background: rgba(13,42,58,0.95); color: #fff;
      padding: 10px 20px; border-radius: 50px;
      font-size: 13px; letter-spacing: 1px; font-weight: 700;
      font-family: 'Noto Sans TC', -apple-system, sans-serif;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      pointer-events: none;
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
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    #vip-shot-loading .txt {
      font-size: 15px; letter-spacing: 2px; font-weight: 700;
    }
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
    <h3>📸 對帳單截圖 <button class="close" id="vsf-close">✕</button></h3>
    <div class="row">▸ 案例編號</div>
    <input type="text" id="vsf-case" placeholder="例：u0033" maxlength="6" autocomplete="off">
    <div class="filename" id="vsf-filename">u0033-1.jpg</div>

    <button class="action btn-region" id="vsf-region">🎯 拖曳選取區域 (Alt+S)</button>
    <button class="action btn-full" id="vsf-full">📄 截整頁 (Alt+Shift+S)</button>

    <div class="row">▸ 儲存位置</div>
    <button class="action btn-folder" id="vsf-folder">📁 連結 cases 資料夾</button>
    <div class="status" id="vsf-status">資料夾未連結 ・ 將以下載提供</div>
  `;
  document.body.appendChild(panel);

  // ─── 元素參考 ───
  const caseInput = panel.querySelector('#vsf-case');
  const filenameEl = panel.querySelector('#vsf-filename');
  const statusEl = panel.querySelector('#vsf-status');
  const regionBtn = panel.querySelector('#vsf-region');
  const fullBtn = panel.querySelector('#vsf-full');
  const folderBtn = panel.querySelector('#vsf-folder');
  const badgeEl = fab.querySelector('#vsf-badge');

  // ─── 通用功能 ───
  function getCaseId() { return (caseInput.value || '').trim().toLowerCase(); }
  function getNextIndex(cid) { return (counters[cid] || 0) + 1; }
  function updateFilename() {
    const cid = getCaseId();
    if (!/^[a-z]\d{4}$/.test(cid)) {
      filenameEl.textContent = '請輸入案例編號';
      badgeEl.textContent = '—';
      return;
    }
    const idx = getNextIndex(cid);
    filenameEl.textContent = `${cid}-${idx}.jpg`;
    badgeEl.textContent = `${cid.toUpperCase()} #${idx}`;
  }
  function updateUi(needsReauth = false) {
    if (dirHandle) {
      const label = needsReauth ? '⚠ 需重新授權' : `✓ 已連結「${dirHandle.name}」`;
      statusEl.textContent = label;
      statusEl.classList.toggle('ok', !needsReauth);
      folderBtn.textContent = needsReauth ? '🔓 重新授權資料夾' : `📁 已連結 ・ ${dirHandle.name}`;
      folderBtn.classList.toggle('connected', !needsReauth);
    } else {
      statusEl.textContent = '資料夾未連結 ・ 將以下載提供';
      statusEl.classList.remove('ok');
      folderBtn.textContent = '📁 連結 cases 資料夾';
      folderBtn.classList.remove('connected');
    }
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
  function showLoading(msg = '處理中...') {
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
    if (cid && dirHandle && /^[a-z]\d{4}$/.test(cid)) probeExisting(cid);
  });
  updateFilename();

  fab.addEventListener('click', () => {
    panel.classList.toggle('show');
    if (panel.classList.contains('show')) {
      caseInput.focus();
      caseInput.select();
    }
  });
  panel.querySelector('#vsf-close').addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.remove('show');
  });

  // ─── 連結資料夾 ───
  folderBtn.addEventListener('click', async () => {
    if (!window.showDirectoryPicker) {
      toast('此瀏覽器不支援直接存檔，將改用下載', 'warn');
      return;
    }
    try {
      // 如果已有 handle 但需重新授權
      if (dirHandle) {
        const perm = await dirHandle.requestPermission({ mode: 'readwrite' });
        if (perm === 'granted') { updateUi(); toast('✓ 已重新授權', 'ok'); return; }
      }
      const h = await window.showDirectoryPicker({ id: 'vip-cases-img', mode: 'readwrite' });
      dirHandle = h;
      await saveDirHandle(h);
      updateUi();
      toast('✓ 資料夾已連結 ・ 下次自動記住', 'ok', 3000);
      const cid = getCaseId();
      if (cid && /^[a-z]\d{4}$/.test(cid)) await probeExisting(cid);
    } catch (e) {
      if (e.name !== 'AbortError') toast('連結失敗：' + e.message, 'err');
    }
  });

  async function probeExisting(cid) {
    if (!dirHandle) return;
    let maxN = 0;
    for (let i = 1; i <= 20; i++) {
      let found = false;
      for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
        try {
          await dirHandle.getFileHandle(`${cid}-${i}.${ext}`);
          found = true; break;
        } catch (e) {}
      }
      if (!found) break;
      maxN = i;
    }
    if (maxN > 0) {
      counters[cid] = maxN;
      localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
      updateFilename();
      toast(`${cid} 已有 ${maxN} 張 ・ 新截圖從 ${maxN + 1} 開始`, 'warn', 3500);
    }
  }

  // ─── 拖曳選取區域 ───
  function startRegionSelection() {
    const cid = getCaseId();
    if (!/^[a-z]\d{4}$/.test(cid)) {
      toast('⚠ 先輸入案例編號才能截圖', 'err');
      panel.classList.add('show');
      caseInput.focus();
      return;
    }

    panel.classList.remove('show');
    fab.style.display = 'none';

    const overlay = document.createElement('div');
    overlay.id = 'vip-shot-overlay';
    document.body.appendChild(overlay);

    let startX, startY;
    let rectEl = null;
    let sizeTagEl = null;
    let isDragging = false;

    const cleanup = () => {
      overlay.remove();
      if (rectEl) rectEl.remove();
      if (sizeTagEl) sizeTagEl.remove();
      fab.style.display = '';
    };

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        document.removeEventListener('keydown', escHandler);
        toast('已取消選取', 'warn', 1500);
      }
    };
    document.addEventListener('keydown', escHandler);

    overlay.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      rectEl = document.createElement('div');
      rectEl.id = 'vip-shot-rect';
      rectEl.style.left = startX + 'px';
      rectEl.style.top = startY + 'px';
      rectEl.style.width = '0px';
      rectEl.style.height = '0px';
      document.body.appendChild(rectEl);

      sizeTagEl = document.createElement('div');
      sizeTagEl.id = 'vip-shot-size-tag';
      document.body.appendChild(sizeTagEl);
    });

    overlay.addEventListener('mousemove', (e) => {
      if (!isDragging || !rectEl) return;
      const x = Math.min(startX, e.clientX);
      const y = Math.min(startY, e.clientY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      rectEl.style.left = x + 'px';
      rectEl.style.top = y + 'px';
      rectEl.style.width = w + 'px';
      rectEl.style.height = h + 'px';
      sizeTagEl.textContent = `${w} × ${h}`;
      sizeTagEl.style.left = (x + w + 6) + 'px';
      sizeTagEl.style.top = y + 'px';
    });

    overlay.addEventListener('mouseup', async (e) => {
      if (!isDragging || !rectEl) return;
      isDragging = false;
      document.removeEventListener('keydown', escHandler);

      const endX = e.clientX;
      const endY = e.clientY;
      const vpX = Math.min(startX, endX);
      const vpY = Math.min(startY, endY);
      const w = Math.abs(endX - startX);
      const h = Math.abs(endY - startY);

      cleanup();

      if (w < 30 || h < 30) {
        toast('選取範圍太小 ・ 至少 30×30', 'err');
        return;
      }

      // viewport → document 座標
      const docX = vpX + window.scrollX;
      const docY = vpY + window.scrollY;

      await captureAndSave(docX, docY, w, h);
    });
  }

  // ─── 擷取並儲存 ───
  async function captureAndSave(x, y, w, h, fullPage = false) {
    const cid = getCaseId();
    if (!/^[a-z]\d{4}$/.test(cid)) {
      toast('案例編號格式錯誤', 'err');
      return;
    }
    const idx = getNextIndex(cid);
    const fname = `${cid}-${idx}.jpg`;

    showLoading(fullPage ? '截取整頁中...' : `擷取 ${w}×${h} 區域中...`);

    try {
      const opts = {
        scale: window.devicePixelRatio || 1,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        allowTaint: true,
      };
      if (!fullPage) {
        opts.x = x; opts.y = y;
        opts.width = w; opts.height = h;
        opts.windowWidth = document.documentElement.scrollWidth;
        opts.windowHeight = document.documentElement.scrollHeight;
      }
      const canvas = await html2canvas(document.documentElement, opts);
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
      const sizeKB = (blob.size / 1024).toFixed(0);

      hideLoading();

      if (dirHandle) {
        try {
          // 確保有寫入權限
          const perm = await dirHandle.queryPermission({ mode: 'readwrite' });
          if (perm !== 'granted') {
            const newPerm = await dirHandle.requestPermission({ mode: 'readwrite' });
            if (newPerm !== 'granted') throw new Error('使用者未授權');
          }
          const fh = await dirHandle.getFileHandle(fname, { create: true });
          const writable = await fh.createWritable();
          await writable.write(blob);
          await writable.close();
          counters[cid] = idx;
          localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
          updateFilename();
          toast(`✓ <strong>${fname}</strong> 已存到 cases 資料夾<br>${sizeKB}KB ・ ${w || canvas.width}×${h || canvas.height}`, 'ok', 3500);
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
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ─── 按鈕事件 ───
  regionBtn.addEventListener('click', () => startRegionSelection());
  fullBtn.addEventListener('click', () => {
    const cid = getCaseId();
    if (!/^[a-z]\d{4}$/.test(cid)) {
      toast('⚠ 先輸入案例編號', 'err');
      caseInput.focus();
      return;
    }
    panel.classList.remove('show');
    captureAndSave(0, 0, 0, 0, true);
  });

  // ─── 鍵盤快捷鍵 ───
  document.addEventListener('keydown', e => {
    // Alt+S → 區域選取
    if (e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      const cid = getCaseId();
      if (!/^[a-z]\d{4}$/.test(cid)) {
        panel.classList.add('show');
        caseInput.focus(); caseInput.select();
        toast('先輸入案例編號，再按 Alt+S', 'warn');
      } else {
        startRegionSelection();
      }
    }
    // Alt+Shift+S → 全頁
    if (e.altKey && e.shiftKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      const cid = getCaseId();
      if (!/^[a-z]\d{4}$/.test(cid)) {
        panel.classList.add('show');
        caseInput.focus(); caseInput.select();
      } else {
        captureAndSave(0, 0, 0, 0, true);
      }
    }
  });

  // 載入時還原 dirHandle
  restoreDirHandle();

  console.log('[VIP 截圖助手 v2] 已就緒 ・ Alt+S 區域 / Alt+Shift+S 整頁');
})();
