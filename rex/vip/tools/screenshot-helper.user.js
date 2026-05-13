// ==UserScript==
// @name         📸 對帳單截圖助手 ・ 投資型專區
// @namespace    https://rex1688.com/rex/vip/
// @version      1.0.0
// @description  在保險經代網上一鍵截圖 + 自動命名 + 直接存到 vip/assets/img/cases/ 資料夾
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

  // ─── 配置 ───
  const STORAGE_KEY = 'vip-shot-helper';
  const COUNTER_KEY = 'vip-shot-counters';
  let counters = JSON.parse(localStorage.getItem(COUNTER_KEY) || '{}');
  let lastCaseId = localStorage.getItem('vip-shot-last-case') || '';
  let dirHandle = null; // File System Access API handle

  // 嘗試從 IndexedDB 還原資料夾 handle（永久授權）
  async function restoreDirHandle() {
    try {
      const db = await openDb();
      const tx = db.transaction('handles', 'readonly');
      const store = tx.objectStore('handles');
      const req = store.get('cases-dir');
      return new Promise((resolve) => {
        req.onsuccess = async () => {
          const h = req.result;
          if (h) {
            try {
              const perm = await h.queryPermission({ mode: 'readwrite' });
              if (perm === 'granted') { dirHandle = h; updateUi(); return resolve(true); }
            } catch (e) {}
          }
          resolve(false);
        };
        req.onerror = () => resolve(false);
      });
    } catch (e) { return false; }
  }
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

  // ─── UI ───
  const css = `
    #vip-shot-fab {
      position: fixed; right: 20px; bottom: 20px;
      z-index: 2147483647;
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
      width: 320px; background: #fff; border-radius: 18px;
      box-shadow: 0 24px 64px rgba(0,0,0,0.3);
      z-index: 2147483646;
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
    #vip-shot-panel .vsf-row {
      font-size: 11px; color: #6b7680; letter-spacing: 1px;
      margin: 8px 0 4px; font-weight: 900;
    }
    #vip-shot-panel input {
      width: 100%; padding: 10px 14px; border: 2px solid #EAE5DC;
      border-radius: 10px; font-size: 16px; font-weight: 900;
      font-family: 'Bebas Neue', monospace; letter-spacing: 3px;
      color: #0D2A3A; text-transform: lowercase;
      box-sizing: border-box;
    }
    #vip-shot-panel input:focus { outline: none; border-color: #F05A28; box-shadow: 0 0 0 4px rgba(240,90,40,0.15); }
    #vip-shot-panel .vsf-filename {
      text-align: center; margin: 10px 0;
      font-family: 'Bebas Neue', monospace; font-size: 18px;
      color: #F05A28; letter-spacing: 1.5px;
      background: #FDE8DF; padding: 10px; border-radius: 10px;
    }
    #vip-shot-panel button {
      width: 100%; padding: 12px; border: none; border-radius: 12px;
      font-size: 13px; font-weight: 900; letter-spacing: 1.5px;
      cursor: pointer; transition: all 0.2s;
      font-family: inherit;
    }
    #vip-shot-panel .vsf-primary {
      background: linear-gradient(135deg, #F05A28, #D04618); color: #fff;
      margin-top: 12px; box-shadow: 0 4px 12px rgba(240,90,40,0.35);
    }
    #vip-shot-panel .vsf-primary:hover { transform: translateY(-2px); }
    #vip-shot-panel .vsf-secondary {
      background: #fff; color: #0D2A3A; border: 1.5px solid #EAE5DC;
      margin-top: 8px;
    }
    #vip-shot-panel .vsf-secondary:hover { border-color: #F05A28; color: #F05A28; }
    #vip-shot-panel .vsf-status {
      font-size: 11px; color: #888; margin-top: 10px;
      letter-spacing: 0.5px; line-height: 1.5;
    }
    #vip-shot-panel .vsf-status.ok { color: #2E8B57; font-weight: 700; }
    #vip-shot-panel .vsf-close {
      background: transparent !important; border: none !important;
      color: #888 !important; width: auto !important; padding: 0 !important;
      font-size: 18px !important; box-shadow: none !important;
      margin: 0 !important;
    }
    #vip-shot-toast {
      position: fixed; right: 20px; bottom: 80px;
      background: #0D2A3A; color: #fff; padding: 12px 20px;
      border-radius: 12px; font-size: 13px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      z-index: 2147483647;
      animation: vsf-toast-in 0.3s;
      font-family: 'Noto Sans TC', -apple-system, sans-serif;
      max-width: 320px;
    }
    #vip-shot-toast.err { border-left: 4px solid #C8203A; }
    #vip-shot-toast.ok { border-left: 4px solid #2E8B57; }
    #vip-shot-toast.warn { border-left: 4px solid #E8A020; }
    @keyframes vsf-toast-in { from { opacity:0; transform: translateX(20px); } to {opacity:1; transform:translateX(0);} }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const fab = document.createElement('button');
  fab.id = 'vip-shot-fab';
  fab.innerHTML = '📸 截圖此頁 <span class="badge" id="vsf-badge">—</span>';
  document.body.appendChild(fab);

  const panel = document.createElement('div');
  panel.id = 'vip-shot-panel';
  panel.innerHTML = `
    <h3>📸 對帳單截圖 <button class="vsf-close" id="vsf-close">✕</button></h3>
    <div class="vsf-row">▸ 案例編號</div>
    <input type="text" id="vsf-case" placeholder="例：u0033" maxlength="6" autocomplete="off">
    <div class="vsf-filename" id="vsf-filename">u0033-1.jpg</div>
    <button class="vsf-primary" id="vsf-capture">📸 擷取整頁畫面</button>
    <button class="vsf-secondary" id="vsf-connect">📁 連結 cases 資料夾</button>
    <div class="vsf-status" id="vsf-status">資料夾未連結 ・ 將以下載方式提供檔案</div>
  `;
  document.body.appendChild(panel);

  // ─── Logic ───
  const caseInput = panel.querySelector('#vsf-case');
  const filenameEl = panel.querySelector('#vsf-filename');
  const statusEl = panel.querySelector('#vsf-status');
  const captureBtn = panel.querySelector('#vsf-capture');
  const connectBtn = panel.querySelector('#vsf-connect');
  const badgeEl = fab.querySelector('#vsf-badge');

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
  function updateUi() {
    if (dirHandle) {
      statusEl.textContent = `✓ 已連結資料夾「${dirHandle.name}」`;
      statusEl.classList.add('ok');
      connectBtn.textContent = '📁 重新選擇資料夾';
    } else {
      statusEl.textContent = '資料夾未連結 ・ 將以下載方式提供';
      statusEl.classList.remove('ok');
    }
  }

  function toast(msg, type = 'ok', dur = 2400) {
    const old = document.getElementById('vip-shot-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'vip-shot-toast';
    t.className = type;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), dur);
  }

  caseInput.value = lastCaseId;
  caseInput.addEventListener('input', updateFilename);
  caseInput.addEventListener('change', () => {
    localStorage.setItem('vip-shot-last-case', caseInput.value.trim().toLowerCase());
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

  connectBtn.addEventListener('click', async () => {
    if (!window.showDirectoryPicker) {
      toast('此瀏覽器不支援直接存檔，將改用下載', 'warn');
      return;
    }
    try {
      const h = await window.showDirectoryPicker({ id: 'vip-cases-img', mode: 'readwrite' });
      dirHandle = h;
      await saveDirHandle(h);
      // 探測既存檔案
      const cid = getCaseId();
      if (cid && /^[a-z]\d{4}$/.test(cid)) {
        await probeExisting(cid);
      }
      updateUi();
      toast('✓ 資料夾已連結，下次自動記住', 'ok', 3000);
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
      toast(`${cid} 已有 ${maxN} 張，新貼上會從第 ${maxN + 1} 張開始`, 'warn', 4000);
    }
  }

  captureBtn.addEventListener('click', async () => {
    const cid = getCaseId();
    if (!/^[a-z]\d{4}$/.test(cid)) {
      toast('案例編號格式錯誤（範例：u0033）', 'err');
      caseInput.focus();
      return;
    }
    const idx = getNextIndex(cid);
    const fname = `${cid}-${idx}.jpg`;

    captureBtn.textContent = '⏳ 截取中...';
    captureBtn.disabled = true;

    try {
      // 暫時隱藏我們的 UI 避免被截進去
      fab.style.display = 'none';
      panel.style.display = 'none';
      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(document.documentElement, {
        scale: window.devicePixelRatio || 1,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight
      });

      // 復原 UI
      fab.style.display = '';
      panel.style.display = '';

      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
      const sizeKB = (blob.size / 1024).toFixed(0);

      if (dirHandle) {
        try {
          const fh = await dirHandle.getFileHandle(fname, { create: true });
          const w = await fh.createWritable();
          await w.write(blob);
          await w.close();
          counters[cid] = idx;
          localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
          updateFilename();
          toast(`✓ ${fname} 已存（${sizeKB}KB）`, 'ok', 3500);
        } catch (e) {
          toast('存檔失敗，改用下載：' + e.message, 'warn');
          downloadBlob(fname, blob);
        }
      } else {
        downloadBlob(fname, blob);
        counters[cid] = idx;
        localStorage.setItem(COUNTER_KEY, JSON.stringify(counters));
        updateFilename();
        toast(`✓ ${fname} 已下載 ・ 請拖到 cases 資料夾（${sizeKB}KB）`, 'warn', 4500);
      }
      panel.classList.remove('show');
    } catch (e) {
      fab.style.display = '';
      panel.style.display = '';
      toast('截圖失敗：' + e.message, 'err', 4000);
    } finally {
      captureBtn.textContent = '📸 擷取整頁畫面';
      captureBtn.disabled = false;
    }
  });

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // 鍵盤快捷鍵：Alt+S 截圖
  document.addEventListener('keydown', e => {
    if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      panel.classList.add('show');
      caseInput.focus(); caseInput.select();
    }
  });

  // 載入時嘗試還原 dirHandle
  restoreDirHandle();

  console.log('[VIP 截圖助手] 已就緒。按右下角按鈕或 Alt+S 開啟');
})();
