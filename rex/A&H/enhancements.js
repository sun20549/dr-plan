/* ═══════════════════════════════════════════════════════════
 *  enhancements.js — 保險建議書系統 v3_21 加值功能模組
 *  Phase 2 (2026/05/13)
 *
 *  策略:Sidecar 模組 — 不修改主檔內部邏輯,只透過:
 *    1. DOM 注入(在 #personCard 後加需求分析卡片;在 #resultCard 後加分析結果)
 *    2. MutationObserver 監聽 #totalAnnual 文字變更
 *    3. localStorage 持久化使用者輸入
 *
 *  本檔包含的功能:
 *    A) 需求分析輸入面板(年收入/家庭/房貸等)
 *    B) 責任缺口分析(壽險、醫療、意外、教育金、退休)
 *    C) 保費佔收入比警示
 *    D) 理賠合計(壽險、醫療、意外)
 *    E) 稅務節稅提醒(24,000 扣除額)
 *    F) 首/續年費率對比 + 保證續保標示(注入到險種表格小標籤)
 *    G) 未滿 15 歲文件提醒
 *
 *  全部用全域變數讀取:document / window.INSURANCE_DB / window.AHShared
 * ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ── 設定常數 ──
  const LS_KEY = 'rexAH_needsInput_v1';
  const DEFAULT_INPUT = {
    income: 0,            // 年收入 (元)
    spouseIncome: 0,      // 配偶年收入 (元)
    childCount: 0,        // 子女人數
    childOldestAge: 0,    // 最大子女現齡
    mortgage: 0,          // 房貸餘額 (元)
    monthlyExp: 0,        // 月支出 (元)
    retireAge: 65,        // 預計退休年齡
    dependents: 0,        // 受扶養人數(配偶/父母,不含子女)
    expanded: false       // 面板是否展開
  };

  // 責任缺口建議倍率(業界常見值)
  const RECOMMENDED = {
    lifeIncomeMultiple: 10,        // 壽險 = 年收入 x 10(經典 DIME / 10x 原則)
    medicalReimbPerDay: 4000,      // 每日住院實支實付建議(元/日)
    medicalDailyPerDay: 3000,      // 每日定額住院日額建議(元/日)
    criticalIllnessMin: 1000000,   // 重大傷病一次金建議(元)
    accidentMultiple: 5,           // 意外失能 = 年收入 x 5
    eduFundPerChild: 3000000,      // 每位子女教育金(元)
    retireMedicalReserve: 2000000  // 退休後醫療準備金(元)
  };

  // 保費佔收入比門檻
  const PIR_THRESHOLDS = {
    tooLow: 5,    // < 5% : 可加保
    safe:   10,   // < 10% : 健康
    warn:   15    // < 15% : 警示;>= 15% : 危險
  };

  // ── 工具函式 ──
  const $  = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const fmt = n => {
    if (typeof n !== 'number' || !isFinite(n)) return n;
    return Math.round(n).toLocaleString();
  };

  // 「元」→「萬元」顯示
  const toWan = n => {
    if (!n || !isFinite(n)) return 0;
    return Math.round(n / 10000);
  };

  // 安全讀取 localStorage(載入失敗就用 default)
  function loadInput() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return Object.assign({}, DEFAULT_INPUT);
      const obj = JSON.parse(raw);
      return Object.assign({}, DEFAULT_INPUT, obj);
    } catch (e) {
      return Object.assign({}, DEFAULT_INPUT);
    }
  }
  function saveInput(input) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(input)); }
    catch (e) { /* 忽略 quota */ }
  }

  // ── 模組狀態 ──
  const enhState = {
    input: loadInput(),
    lastRows: [],
    lastTotal: 0
  };

  // ═══════════════════════════════════════════════════════════
  // 區塊 A:需求分析輸入面板(注入到 #personCard 之後)
  // ═══════════════════════════════════════════════════════════

  function buildNeedsInputCard() {
    const card = document.createElement('div');
    card.className = 'x-card no-print';
    card.id = 'needsInputCard';

    card.innerHTML = `
      <div class="x-card-header teal">
        <span><span class="xh-icon">📊</span>需求分析(可選填)</span>
        <button class="toggle-btn" id="needsToggleBtn" type="button">
          ${enhState.input.expanded ? '收合 ▲' : '展開 ▼'}
        </button>
      </div>
      <div class="x-card-body" id="needsBody" style="display:${enhState.input.expanded ? 'block' : 'none'};">
        <div class="needs-grid">
          <div class="needs-field">
            <label>年收入(元)</label>
            <input type="number" id="needs-income" min="0" step="10000" placeholder="例:1000000" value="${enhState.input.income || ''}">
          </div>
          <div class="needs-field">
            <label>配偶年收入(元)</label>
            <input type="number" id="needs-spouseIncome" min="0" step="10000" placeholder="例:800000" value="${enhState.input.spouseIncome || ''}">
          </div>
          <div class="needs-field">
            <label>月支出(元)</label>
            <input type="number" id="needs-monthlyExp" min="0" step="1000" placeholder="例:50000" value="${enhState.input.monthlyExp || ''}">
          </div>
          <div class="needs-field">
            <label>房貸餘額(元)</label>
            <input type="number" id="needs-mortgage" min="0" step="100000" placeholder="例:5000000" value="${enhState.input.mortgage || ''}">
          </div>
          <div class="needs-field">
            <label>子女人數</label>
            <input type="number" id="needs-childCount" min="0" max="10" placeholder="0" value="${enhState.input.childCount || 0}">
          </div>
          <div class="needs-field">
            <label>最大子女年齡</label>
            <input type="number" id="needs-childOldestAge" min="0" max="50" placeholder="0" value="${enhState.input.childOldestAge || 0}">
          </div>
          <div class="needs-field">
            <label>受扶養人數(配偶/父母)</label>
            <input type="number" id="needs-dependents" min="0" max="10" placeholder="0" value="${enhState.input.dependents || 0}">
          </div>
          <div class="needs-field">
            <label>預計退休年齡</label>
            <input type="number" id="needs-retireAge" min="40" max="100" placeholder="65" value="${enhState.input.retireAge || 65}">
          </div>
        </div>
        <div class="needs-hint">
          💡 此區資料僅用於試算「責任缺口」與「保費佔比警示」,不會上傳到伺服器,輸入會自動儲存於本機瀏覽器。
        </div>
      </div>
    `;
    return card;
  }

  function bindNeedsInputEvents() {
    const toggleBtn = document.getElementById('needsToggleBtn');
    const body = document.getElementById('needsBody');
    if (toggleBtn && body) {
      toggleBtn.addEventListener('click', () => {
        enhState.input.expanded = !enhState.input.expanded;
        body.style.display = enhState.input.expanded ? 'block' : 'none';
        toggleBtn.textContent = enhState.input.expanded ? '收合 ▲' : '展開 ▼';
        saveInput(enhState.input);
      });
    }

    // 各欄位變更時:讀值 → 儲存 → 重新渲染分析卡片
    const fields = [
      ['income', 'needs-income'],
      ['spouseIncome', 'needs-spouseIncome'],
      ['monthlyExp', 'needs-monthlyExp'],
      ['mortgage', 'needs-mortgage'],
      ['childCount', 'needs-childCount'],
      ['childOldestAge', 'needs-childOldestAge'],
      ['dependents', 'needs-dependents'],
      ['retireAge', 'needs-retireAge']
    ];
    fields.forEach(([key, id]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const v = Number(el.value) || 0;
        enhState.input[key] = v;
        saveInput(enhState.input);
        renderAnalysis();
      });
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 區塊 B+C+D+E:分析結果卡片(注入到 #resultCard 之後)
  // ═══════════════════════════════════════════════════════════

  function buildAnalysisCard() {
    const card = document.createElement('div');
    card.className = 'x-card';
    card.id = 'analysisCard';
    card.style.display = 'none';   // 一開始隱藏,等有商品後才顯示
    card.innerHTML = `
      <div class="x-card-header gold">
        <span><span class="xh-icon">🎯</span>保障缺口 ‧ 保費比例 ‧ 理賠合計</span>
        <span style="font-size:11px;font-weight:400;opacity:0.85;">業務員專業分析</span>
      </div>
      <div class="x-card-body" id="analysisBody"></div>
    `;
    return card;
  }

  // ── 從結果表格的 DOM 收集當前 rows ──
  function collectRowsFromDOM() {
    const tbody = document.getElementById('resultTbody');
    if (!tbody) return [];
    const rows = [];
    tbody.querySelectorAll('tr').forEach(tr => {
      if (tr.classList.contains('group-header') || tr.classList.contains('group-subtotal')) return;
      const tds = tr.querySelectorAll('td');
      if (tds.length < 7) return;
      // [險種名稱, 繳費期間, 保額/單位, 單位, 投保對象, 主/附, 保費]
      // 險種名稱裡有 (code) 的格式
      const nameTd = tds[0];
      const codeMatch = (nameTd.textContent || '').match(/\(([A-Z0-9_]+)\)/);
      const code = codeMatch ? codeMatch[1] : null;
      const period = (tds[1].textContent || '').trim();
      const amtNum = (tds[2].textContent || '').replace(/,/g, '').trim();
      const amtUnit = (tds[3].textContent || '').trim();
      const type = (tds[5].textContent || '').trim();
      const fee = parseInt((tds[6].textContent || '').replace(/[^0-9]/g, ''), 10) || 0;
      rows.push({ code, period, amtNum, amtUnit, type, fee, isWaiver: tr.classList.contains('waiver-row') });
    });
    return rows;
  }

  // ── 從 DOM 收集當前被保險人資訊 ──
  function collectInsuredFromDOM() {
    const age = parseInt(document.getElementById('insured-age')?.value, 10);
    const gender = document.getElementById('insured-gender')?.value || 'M';
    const job = parseInt(document.getElementById('insured-job')?.value, 10) || 1;
    return {
      age: isNaN(age) ? null : age,
      gender,
      job
    };
  }

  // ── 計算「目前已選保額合計」分類 ──
  // 用 window.AHShared.categorize5 + classifyItem 把 row 歸類到 life/medical/critical/cancer/accident
  function aggregateCurrentCoverage(rows) {
    const agg = {
      lifeDeath: 0,        // 壽險身故/喪葬保額
      accidentDeath: 0,    // 意外身故
      accidentDisability: 0, // 意外失能
      criticalLump: 0,     // 重大傷病一次金
      cancerLump: 0,       // 癌症一次金
      medicalDaily: 0,     // 住院日額(定額型)
      medicalReimb: 0,     // 住院實支實付雜費限額
      surgery: 0           // 住院手術
    };

    if (!window.INSURANCE_DB || !window.AHShared) return agg;

    const db = window.INSURANCE_DB;
    const benefitsLib = db.benefitsLib || {};
    const categorize5 = window.AHShared.categorize5;
    const classifyItem = window.AHShared.classifyItem;
    const calcBenefitValue = window.AHShared.calcBenefitValue;
    const convertProductClaims = window.AHShared.convertProductClaims;

    // 從 DOM 抓不到完整 product 物件,所以從 INSURANCE_DB 反查
    rows.forEach(r => {
      if (!r.code || r.isWaiver) return;
      // 在所有公司的主約/附約中找對應 code
      let product = null;
      for (const c of db.companies) {
        product = c.mainProducts?.find(p => p.code === r.code) ||
                  c.riderProducts?.find(p => p.code === r.code);
        if (product) break;
      }
      if (!product) return;

      const meta = categorize5(product);
      // 解析保額 — DOM 對 plan 模式商品會把「計劃」前綴拿掉,要還原
      let amount;
      if (product.amountMode === 'plan') {
        // DOM 顯示「一/二/3A/4A」等,calcBenefitValue 的 planMap key 是「計劃一/計劃3A」等
        amount = r.amtNum.startsWith('計劃') ? r.amtNum : ('計劃' + r.amtNum);
      } else if (product.amountMode === 'fixedAmount') {
        amount = Number(r.amtNum) || 0;
      } else {
        amount = Number(r.amtNum) || 0;
      }
      // 取 benefitsLib 對應 items;若沒有,用 convertProductClaims 兜底
      const benefitDef = benefitsLib[product.code] || convertProductClaims(product) || null;
      if (!benefitDef || !benefitDef.items) return;

      benefitDef.items.forEach(item => {
        const cls = classifyItem(item);
        const val = calcBenefitValue(item, product, amount);
        if (!val || val.type !== 'num') return;
        const n = val.val || 0;

        // 依 mainKey + cls.key 歸類
        if (meta.mainKey === 'accident') {
          if (cls.key === 'death') agg.accidentDeath = Math.max(agg.accidentDeath, n);
          else if (cls.key === 'disability') agg.accidentDisability = Math.max(agg.accidentDisability, n);
        } else if (meta.mainKey === 'life') {
          if (cls.key === 'death') agg.lifeDeath = Math.max(agg.lifeDeath, n);
        } else if (meta.mainKey === 'critical') {
          if (cls.key === 'critical') agg.criticalLump = Math.max(agg.criticalLump, n);
        } else if (meta.mainKey === 'cancer') {
          if (cls.key === 'critical') agg.cancerLump = Math.max(agg.cancerLump, n);
        } else if (meta.mainKey === 'medical') {
          if (cls.key === 'daily')     agg.medicalDaily += n;
          if (cls.key === 'reimburse') agg.medicalReimb += n;
          if (cls.key === 'surgery')   agg.surgery += n;
        }
      });
    });
    return agg;
  }

  // ── 計算建議保額 ──
  function computeRecommended(input, insured) {
    const income = (input.income || 0) + (input.spouseIncome || 0) * 0.5; // 配偶收入算半權重
    const childYearsToCollege = input.childCount > 0
      ? Math.max(0, 22 - (input.childOldestAge || 0))
      : 0;

    return {
      lifeDeath: input.income > 0
        ? input.income * RECOMMENDED.lifeIncomeMultiple
                  + (input.mortgage || 0)
                  + (input.childCount || 0) * RECOMMENDED.eduFundPerChild
        : 0,
      accidentDisability: input.income > 0
        ? input.income * RECOMMENDED.accidentMultiple
        : 0,
      criticalLump: RECOMMENDED.criticalIllnessMin,
      medicalReimb: RECOMMENDED.medicalReimbPerDay,
      medicalDaily: RECOMMENDED.medicalDailyPerDay,
      retireMedical: RECOMMENDED.retireMedicalReserve
    };
  }

  // ── 渲染:責任缺口卡片 ──
  function renderGapAnalysis(agg, rec, input) {
    const items = [];

    // 壽險缺口
    if (rec.lifeDeath > 0) {
      const have = agg.lifeDeath;
      const need = rec.lifeDeath;
      const gap = need - have;
      items.push(makeGapItem({
        icon: '🛡️',
        title: '壽險身故保障',
        have, need, gap,
        formula: `年收入${toWan(input.income)}萬 × 10倍 + 房貸${toWan(input.mortgage)}萬 + 教育金${input.childCount*300}萬`
      }));
    }

    // 意外失能
    if (rec.accidentDisability > 0) {
      const have = agg.accidentDisability;
      const need = rec.accidentDisability;
      const gap = need - have;
      items.push(makeGapItem({
        icon: '⚡',
        title: '意外失能保障',
        have, need, gap,
        formula: `年收入${toWan(input.income)}萬 × 5倍(主要勞動力中斷補償)`
      }));
    }

    // 重大傷病
    {
      const have = agg.criticalLump + agg.cancerLump;  // 重大傷病 + 癌症一次金合計
      const need = rec.criticalLump;
      const gap = need - have;
      items.push(makeGapItem({
        icon: '🎗️',
        title: '重大傷病一次金',
        have, need, gap,
        formula: '建議至少 100 萬作為治療緩衝金'
      }));
    }

    // 醫療日額
    {
      const have = agg.medicalDaily;
      const need = rec.medicalDaily;
      const gap = need - have;
      items.push(makeGapItem({
        icon: '🏥',
        title: '住院日額',
        have, need, gap,
        formula: '建議 3,000 元/日(雙人房差額參考)',
        unit: '元/日'
      }));
    }

    // 醫療實支實付
    {
      const have = agg.medicalReimb;
      const need = rec.medicalReimb;
      const gap = need - have;
      items.push(makeGapItem({
        icon: '💉',
        title: '住院實支實付',
        have, need, gap,
        formula: '建議 4,000 元/日(自付醫材/特殊療法緩衝)',
        unit: '元/日'
      }));
    }

    if (items.length === 0) return '';
    return `
      <div style="margin-top:6px;margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:10px;">
          📐 責任缺口分析
          <span style="font-size:11px;font-weight:400;color:var(--gray);margin-left:8px;">(基於您填寫的家庭/收入資料試算)</span>
        </div>
        <div class="gap-grid">${items.join('')}</div>
      </div>
    `;
  }

  function makeGapItem({ icon, title, have, need, gap, formula, unit }) {
    const pct = need > 0 ? Math.min(100, Math.round(have / need * 100)) : 0;
    let level, tagText;
    if (pct >= 100)      { level = 'ok';     tagText = '充足'; }
    else if (pct >= 60)  { level = 'warn';   tagText = '部分'; }
    else                 { level = 'danger'; tagText = '不足'; }
    const u = unit || '元';
    const gapDisplay = gap > 0 ? `差 ${fmt(gap)} ${u}` : '已達標 ✓';
    return `
      <div class="gap-item ${level}">
        <div class="gap-tag ${level}">${tagText}</div>
        <div class="gap-icon">${icon}</div>
        <div class="gap-title">${title}</div>
        <div class="gap-row"><span class="gr-label">建議</span><span class="gr-val">${fmt(need)} ${u}</span></div>
        <div class="gap-row"><span class="gr-label">已選</span><span class="gr-val">${fmt(have)} ${u}</span></div>
        <div class="gap-bar-wrap"><div class="gap-bar ${level}" style="width:${pct}%"></div></div>
        <div class="gap-row gap-result">
          <span class="gr-label">${pct}% 覆蓋</span>
          <span class="gr-val ${gap > 0 ? 'is-gap' : 'is-ok'}">${gapDisplay}</span>
        </div>
        <div style="font-size:10px;color:var(--gray);margin-top:6px;line-height:1.4;">${formula}</div>
      </div>
    `;
  }

  // ── 渲染:保費佔收入比 ──
  function renderPremiumIncomeRatio(total, input) {
    if (!input.income || input.income <= 0) return '';
    const ratio = total / input.income * 100;
    let level, msg;
    if (ratio < PIR_THRESHOLDS.tooLow) {
      level = 'ok';
      msg = `💡 保費佔比僅 ${ratio.toFixed(1)}%,在保障充足的前提下,可考慮加強重大傷病/失能保障。一般建議 5%~10%。`;
    } else if (ratio < PIR_THRESHOLDS.safe) {
      level = 'ok';
      msg = `✓ 保費佔收入比 ${ratio.toFixed(1)}%,處於健康區間(5%~10%),與保障規劃平衡良好。`;
    } else if (ratio < PIR_THRESHOLDS.warn) {
      level = 'warn';
      msg = `⚠️ 保費佔比 ${ratio.toFixed(1)}% 偏高(建議上限 10%),請評估是否有可調降的非必要保障。`;
    } else {
      level = 'danger';
      msg = `🚨 保費佔比達 ${ratio.toFixed(1)}%,超出健康上限(15%),保費負擔過重可能影響家庭現金流。建議檢視保額或繳法。`;
    }

    const width = Math.min(100, ratio / 20 * 100);  // 0~20% 映射到 0~100%
    return `
      <div class="pir-wrap">
        <div class="pir-top">
          <div class="pir-title">💰 保費佔年收入比</div>
          <div class="pir-value ${level}">${ratio.toFixed(1)} %</div>
        </div>
        <div class="pir-bar-wrap">
          <div class="pir-bar ${level}" style="width:${width}%"></div>
          <div class="pir-marker" style="left:${5/20*100}%" data-label="5%"></div>
          <div class="pir-marker" style="left:${10/20*100}%" data-label="10%"></div>
          <div class="pir-marker" style="left:${15/20*100}%" data-label="15%"></div>
        </div>
        <div style="height:14px;"></div>
        <div class="pir-msg ${level}">${msg}</div>
        <div style="font-size:11px;color:var(--gray);margin-top:6px;">
          年收入 NT$ ${fmt(input.income)} 元 ‧ 年繳保費 NT$ ${fmt(total)} 元
        </div>
      </div>
    `;
  }

  // ── 渲染:理賠合計 ──
  function renderClaimsSummary(agg) {
    const cells = [];
    if (agg.lifeDeath > 0)
      cells.push({ icon: '🛡️', label: '壽險身故', val: agg.lifeDeath, unit: '元' });
    if (agg.accidentDeath > 0)
      cells.push({ icon: '⚡', label: '意外身故', val: agg.accidentDeath, unit: '元' });
    if (agg.accidentDisability > 0)
      cells.push({ icon: '🦽', label: '意外失能', val: agg.accidentDisability, unit: '元' });
    if (agg.criticalLump > 0)
      cells.push({ icon: '🎗️', label: '重大傷病金', val: agg.criticalLump, unit: '元' });
    if (agg.cancerLump > 0)
      cells.push({ icon: '🌸', label: '癌症一次金', val: agg.cancerLump, unit: '元' });
    if (agg.medicalDaily > 0)
      cells.push({ icon: '🏥', label: '住院日額', val: agg.medicalDaily, unit: '元/日' });
    if (agg.medicalReimb > 0)
      cells.push({ icon: '💉', label: '實支實付', val: agg.medicalReimb, unit: '元/次' });
    if (agg.surgery > 0)
      cells.push({ icon: '🔬', label: '住院手術', val: agg.surgery, unit: '元/次' });

    if (cells.length === 0) return '';
    const html = cells.map(c => `
      <div class="claims-cell">
        <div class="cc-icon">${c.icon}</div>
        <div class="cc-label">${c.label}</div>
        <div class="cc-val">${fmt(c.val)}<span class="cc-unit">${c.unit}</span></div>
      </div>
    `).join('');
    return `
      <div style="margin-bottom:14px;">
        <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:6px;">
          📋 主要理賠合計
          <span style="font-size:11px;font-weight:400;color:var(--gray);margin-left:8px;">(跨公司彙整,同類取最高/加總)</span>
        </div>
        <div class="claims-summary">${html}</div>
      </div>
    `;
  }

  // ── 渲染:稅務/年齡/其他提醒 ──
  function renderTips(total, input, insured) {
    const tips = [];

    // E. 稅務節稅(24,000 扣除額)
    if (total > 0) {
      const taxLimit = 24000;
      const usePct = Math.min(100, Math.round(total / taxLimit * 100));
      if (total <= taxLimit) {
        tips.push({
          type: 'info',
          icon: '💰',
          title: '所得稅扣除額提醒',
          text: `目前年繳保費 <b>${fmt(total)}</b> 元 / 24,000 元(${usePct}%),仍在每人列舉扣除額上限內,可全額扣抵。`
        });
      } else {
        const wasted = total - taxLimit;
        tips.push({
          type: 'warn',
          icon: '💰',
          title: '所得稅扣除額已用滿',
          text: `年繳保費已達 <b>${fmt(total)}</b> 元,超過 24,000 元上限部分(${fmt(wasted)} 元)無法列舉扣除。若有子女/配偶有保費,可改用其名義投保。`
        });
      }
    }

    // G. 未滿 15 歲文件提醒
    if (insured.age != null && insured.age < 15) {
      tips.push({
        type: 'warn',
        icon: '👶',
        title: '未滿 15 歲投保須注意',
        text: `依《保險法》第 107 條,被保險人未滿 15 足歲,身故/喪葬保險金最高以 <b>69 萬元</b> 為限(已自動套用);此外,請備齊:<br>① 戶口名簿或戶籍謄本 ② 法定代理人簽名同意 ③ 健康聲明書由法代填寫。`
      });
    }

    // 收入過低/未填提醒
    if (!input.income || input.income <= 0) {
      tips.push({
        type: 'info',
        icon: '📊',
        title: '尚未填寫收入資料',
        text: `填寫上方「需求分析」中的年收入後,系統會自動計算<b>保費佔收入比</b>及<b>壽險、意外缺口</b>,讓建議書更具說服力。`
      });
    }

    if (tips.length === 0) return '';
    return `
      <div style="margin-bottom:6px;">
        <div style="font-size:13px;font-weight:700;color:var(--navy);margin-bottom:8px;">💡 業務員提示</div>
        ${tips.map(t => `
          <div class="tip-row ${t.type}">
            <div class="tip-icon">${t.icon}</div>
            <div class="tip-body">
              <div class="tip-title">${t.title}</div>
              <div class="tip-text">${t.text}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ── 主渲染函式:把所有區塊組合到 #analysisCard ──
  function renderAnalysis() {
    const card = document.getElementById('analysisCard');
    if (!card) return;
    const resultCard = document.getElementById('resultCard');

    // 結果卡都沒顯示就跟著隱藏
    if (!resultCard || resultCard.style.display === 'none') {
      card.style.display = 'none';
      return;
    }

    const rows = collectRowsFromDOM();
    const insured = collectInsuredFromDOM();
    const total = parseInt((document.getElementById('totalAnnual')?.textContent || '0').replace(/,/g, ''), 10) || 0;

    enhState.lastRows = rows;
    enhState.lastTotal = total;

    if (rows.length === 0 || total === 0) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';

    const agg = aggregateCurrentCoverage(rows);
    const rec = computeRecommended(enhState.input, insured);

    let html = '';
    html += renderPremiumIncomeRatio(total, enhState.input);
    html += renderGapAnalysis(agg, rec, enhState.input);
    html += renderClaimsSummary(agg);
    html += renderTips(total, enhState.input, insured);

    document.getElementById('analysisBody').innerHTML = html;
  }

  // ═══════════════════════════════════════════════════════════
  // 區塊 F:險種小標籤(保證/非保證、自然/平準費率)
  //   注入到 #resultTbody 內每列險種名稱旁
  // ═══════════════════════════════════════════════════════════

  // 商品續保 / 費率類型對照(根據備忘錄整理)
  const RIDER_META = {
    'XAB':  { renewal: 'non-guaranteed', rate: 'level',   note: '一年期非保證續保' },
    'XDE':  { renewal: 'non-guaranteed', rate: 'natural', note: '一年期非保證續保' },
    'XHD':  { renewal: 'non-guaranteed', rate: 'natural', note: '一年期非保證續保' },
    'XHO':  { renewal: 'non-guaranteed', rate: 'natural', note: '一年期非保證續保' },
    'XCF':  { renewal: 'non-guaranteed', rate: 'natural', note: '一年期非保證續保(首/續年費率不同)' },
    'XCG':  { renewal: 'non-guaranteed', rate: 'natural', note: '一年期非保證續保' },
    'XTK':  { renewal: 'non-guaranteed', rate: 'natural', note: '一年期非保證續保' },
    'NIR':  { renewal: 'non-guaranteed', rate: 'natural', note: '一年期非保證續保' },
    'XMBN': { renewal: 'non-guaranteed', rate: 'level',   note: '一年期非保證續保' },
    'DCF':  { renewal: 'guaranteed',     rate: 'level',   note: '終身平準保費' },
    'XWA':  { renewal: 'guaranteed',     rate: 'natural', note: '豁免保費附約(自然費率)' },
    'XWB':  { renewal: 'guaranteed',     rate: 'natural', note: '豁免保費附約(自然費率)' }
  };

  function annotateRiderRows() {
    const tbody = document.getElementById('resultTbody');
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (tr.classList.contains('group-header') || tr.classList.contains('group-subtotal')) return;
      const nameTd = tr.querySelector('td:first-child');
      if (!nameTd) return;
      // 避免重複加標籤
      if (nameTd.querySelector('.x-rider-badges')) return;
      const codeMatch = (nameTd.textContent || '').match(/\(([A-Z0-9_]+)\)/);
      if (!codeMatch) return;
      const code = codeMatch[1];
      const meta = RIDER_META[code];
      if (!meta) return;

      const badges = document.createElement('span');
      badges.className = 'x-rider-badges';
      const renewalLabel = meta.renewal === 'guaranteed' ? '保證續保' : '非保證';
      const rateLabel = meta.rate === 'natural' ? '自然費率' : '平準費率';
      badges.innerHTML = `
        <span class="xrb ${meta.renewal}" title="${meta.note}">${renewalLabel}</span>
        <span class="xrb ${meta.rate}" title="${meta.rate === 'natural' ? '保費隨年齡逐年遞增' : '保費繳費期間不變'}">${rateLabel}</span>
      `;
      nameTd.appendChild(badges);
    });
  }

  // ═══════════════════════════════════════════════════════════
  //  初始化與監聽
  // ═══════════════════════════════════════════════════════════

  function injectCards() {
    const personCard = document.getElementById('personCard');
    const resultCard = document.getElementById('resultCard');
    if (!personCard || !resultCard) return false;

    // 1. 需求分析輸入卡片 — 使用者要求拿掉,不再注入
    // (原邏輯保留在 buildNeedsInputCard / bindNeedsInputEvents 函式內,
    //  以後若要恢復取消註解即可)

    // 2. 注入分析結果卡片 — 在 resultCard 之後
    if (!document.getElementById('analysisCard')) {
      const analysis = buildAnalysisCard();
      resultCard.parentNode.insertBefore(analysis, resultCard.nextSibling);
    }
    return true;
  }

  function setupObserver() {
    const totalEl = document.getElementById('totalAnnual');
    if (!totalEl) return;
    const observer = new MutationObserver(() => {
      // 主檔每次 recompute 都會更新 #totalAnnual,所以這就是我們的觸發點
      try {
        annotateRiderRows();
        renderAnalysis();
      } catch (e) {
        console.error('[enhancements] render error:', e);
      }
    });
    observer.observe(totalEl, { childList: true, characterData: true, subtree: true });

    // 也監聽 resultCard 顯示/隱藏(避免 totalAnnual 不變但 card 重新顯示)
    const resultCard = document.getElementById('resultCard');
    if (resultCard) {
      const styleObs = new MutationObserver(() => {
        try {
          annotateRiderRows();
          renderAnalysis();
        } catch (e) {
          console.error('[enhancements] style error:', e);
        }
      });
      styleObs.observe(resultCard, { attributes: true, attributeFilter: ['style'] });
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  Phase 2.2:走勢圖期間滑桿 + 自製 hover tooltip + 型總額移除
  // ═══════════════════════════════════════════════════════════

  function bindChartRangeSlider() {
    const stops = [20, 30, 40, 50, 60];
    console.log('[enhancements] bindChartRangeSlider 啟動');

    function applyRange(idx) {
      const years = stops[idx];
      const valEl = document.getElementById('chartRangeValue');
      if (valEl) valEl.textContent = '未來 ' + years + ' 年';
      const btn = document.querySelector('.chart-range-toggle[data-range="' + years + '"]');
      console.log('[enhancements] applyRange idx=' + idx + ' years=' + years + ' btn=', btn);
      if (!btn) {
        console.warn('[enhancements] 找不到 data-range="' + years + '"按鈕');
        return;
      }
      try {
        btn.click();
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      } catch (e) {
        console.error('[enhancements] click 失敗:', e);
      }
    }

    // ★ 用 document 級別事件委派,即使 slider 後續被 replace 也能接到
    document.addEventListener('input', function(e) {
      if (e.target && e.target.id === 'chartRangeSlider') {
        const idx = parseInt(e.target.value, 10);
        applyRange(idx);
      }
    });

    // 同時直接綁(立即生效,不等委派)
    const slider = document.getElementById('chartRangeSlider');
    if (slider) {
      console.log('[enhancements] slider 元素存在,直接綁 input');
      slider.addEventListener('input', function() {
        applyRange(parseInt(slider.value, 10));
      });

      // 還原上次選擇
      try {
        const saved = parseInt(localStorage.getItem('rexAH_chartRange') || '0', 10);
        if (saved >= 0 && saved <= 4) {
          slider.value = saved;
          const valEl = document.getElementById('chartRangeValue');
          if (valEl) valEl.textContent = '未來 ' + stops[saved] + ' 年';
        }
      } catch (e) {}

      slider.addEventListener('change', function() {
        try { localStorage.setItem('rexAH_chartRange', slider.value); } catch (e) {}
      });
    } else {
      console.warn('[enhancements] 找不到 #chartRangeSlider,只靠 document 委派');
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  自製 hover tooltip - 直接讀 #yearlyFeeGrid 的當年保費,
  //  不依賴主檔 onmousemove (可能被覆寫或快取殘留)
  // ═══════════════════════════════════════════════════════════
  function bindCustomTooltip() {
    const svg = document.getElementById('rateChart');
    const tooltip = document.getElementById('chartTooltip');
    const wrap = svg && svg.parentElement;
    if (!svg || !tooltip || !wrap) {
      setTimeout(bindCustomTooltip, 400);
      return;
    }

    // 已綁過就跳過
    if (svg._enhBound) return;
    svg._enhBound = true;

    // 從 yearlyFeeGrid 解析年齡 -> 保費
    function readYearlyData() {
      const grid = document.getElementById('yearlyFeeGrid');
      if (!grid) return null;
      const cells = grid.querySelectorAll('.yearly-fee-cell');
      const data = [];
      cells.forEach(cell => {
        const ageEl = cell.querySelector('.yf-age');
        const feeEl = cell.querySelector('.yf-fee');
        if (!ageEl || !feeEl) return;
        const age = parseInt((ageEl.textContent || '').replace(/[^0-9]/g, ''), 10);
        const fee = parseInt((feeEl.textContent || '').replace(/[^0-9]/g, ''), 10);
        if (!isNaN(age) && !isNaN(fee)) {
          data.push({ age, fee });
        }
      });
      return data.length > 0 ? data : null;
    }

    function handleMove(e) {
      const W = 1200;
      const rect = svg.getBoundingClientRect();
      const xRel = e.clientX - rect.left;
      const xVB = xRel * (W / rect.width);

      const data = readYearlyData();
      if (!data || data.length === 0) {
        tooltip.classList.remove('show');
        return;
      }

      // 估算 padL/padR (與主檔一致:padL=60, padR=20)
      const padL = 60, padR = 20;
      const innerW = W - padL - padR;
      // 找最近年齡
      let nearestIdx = 0, minDist = Infinity;
      data.forEach((d, i) => {
        const px = padL + (innerW * i / Math.max(1, data.length - 1));
        const dist = Math.abs(px - xVB);
        if (dist < minDist) { minDist = dist; nearestIdx = i; }
      });

      if (xVB < padL - 10 || xVB > W - padR + 10) {
        tooltip.classList.remove('show');
        return;
      }

      const item = data[nearestIdx];
      tooltip.innerHTML = '<div class="tt-age">' + item.age + ' 歲</div>' +
        '<div class="tt-row"><span class="tt-label">當年總保費</span><span class="tt-val">' +
        item.fee.toLocaleString() + ' 元</span></div>';
      tooltip.classList.add('show');

      // 定位
      const wrapRect = wrap.getBoundingClientRect();
      const ttRect = tooltip.getBoundingClientRect();
      const ttW = ttRect.width || 160;
      const ttH = ttRect.height || 60;
      let ttX = (e.clientX - wrapRect.left) + 14;
      let ttY = (e.clientY - wrapRect.top) - 8;
      if (ttX + ttW > wrapRect.width - 5) ttX = (e.clientX - wrapRect.left) - ttW - 14;
      if (ttY + ttH > wrapRect.height - 5) ttY = wrapRect.height - ttH - 5;
      if (ttY < 5) ttY = 5;
      tooltip.style.left = ttX + 'px';
      tooltip.style.top  = ttY + 'px';
    }

    function handleLeave() {
      tooltip.classList.remove('show');
    }

    svg.addEventListener('mousemove', handleMove);
    svg.addEventListener('mouseleave', handleLeave);
  }

  // ═══════════════════════════════════════════════════════════
  //  徹底移除「跨商品累計」徽章及任何 type-total 區塊
  //  (CSS hide 之外,直接從 DOM 移除以避免佔位)
  // ═══════════════════════════════════════════════════════════
  function purgeTypeTotal() {
    document.querySelectorAll('.type-total').forEach(el => el.remove());
    // 同時隱藏累計核保警告區
    const agg = document.getElementById('aggregateCheck');
    if (agg) agg.style.display = 'none';
  }

  function startWhenReady() {
    // 主檔用 const INSURANCE_DB 宣告,不會掛到 window 上,所以只能檢查 AHShared (來自 shared.js)
    // injectCards 內部不依賴 INSURANCE_DB,renderAnalysis 自己有 try/catch 保護
    if (!window.AHShared) {
      console.log('[enhancements] 等待 shared.js (window.AHShared) 載入...');
      setTimeout(startWhenReady, 200);
      return;
    }
    console.log('[enhancements] startWhenReady 通過,開始注入卡片');
    if (!injectCards()) {
      setTimeout(startWhenReady, 200);
      return;
    }
    setupObserver();
    bindChartRangeSlider();
    bindCustomTooltip();
    annotateRiderRows();
    renderAnalysis();
    purgeTypeTotal();

    // 持續監看 benefitsCard,每次重渲染後立即清掉 type-total
    const benefitsCard = document.getElementById('benefitsCard');
    if (benefitsCard) {
      const benefitsObs = new MutationObserver(() => purgeTypeTotal());
      benefitsObs.observe(benefitsCard, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(startWhenReady, 100);
    });
  } else {
    setTimeout(startWhenReady, 100);
  }
})();
