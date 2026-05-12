/* ============================================================
 *  shared.js — A&H 保險系統共用純計算/分類函式
 *  ============================================================
 *  使用對象:
 *    1. 保險建議書系統 (index.html / 保險建議書系統_v*.html)
 *    2. 險種比較網站 (compare.html)
 *
 *  原則:
 *    - 只放「純函式」(pure functions):輸入 → 輸出,不依賴 state、不操作 DOM
 *    - 不放法令過濾 / 核保檢查 / 渲染函式 — 那些跟建議書流程綁定,留在主檔
 *
 *  載入方式 (兩種環境都能用):
 *    <script src="shared.js"></script>
 *    然後 window.AHShared.classifyItem(...) 等;
 *    或 const { classifyItem, ... } = window.AHShared;
 *
 *  版本:v1.0 (2026-05-11, 從 保險建議書系統_v3_20.html 抽出)
 *  維護:條款邏輯有變動時必須兩邊同步驗證
 * ============================================================ */

(function (global) {
  'use strict';

  /* ──────────────────────────────────────────────────────────
   *  convertProductClaims(product)
   *  把 product.claims 結構轉成 benefitsLib 期待的格式
   *  — 處理 amountUnit 對 ratio calc 的單位換算:
   *      '元'              → 保額已是元, 直接 ratio
   *      '萬元'/'萬'/'10萬' → 保額是萬元 (× 10000) → ratioWan
   *      '百元'            → 保額是「以 100 為單位」→ ratio × 100
   *
   *  輸入:product 物件 (含 .claims.items 與 .amountUnit)
   *  輸出:{ title, items[] } 或 null (claims 結構不存在時)
   * ────────────────────────────────────────────────────────── */
  function convertProductClaims(product) {
    if (!product.claims || !Array.isArray(product.claims.items)) return null;
    const items = product.claims.items.map(it => {
      let calc = it.calc;
      if (calc && calc.type === 'ratio') {
        const unit = product.amountUnit;
        if (unit === '萬元' || unit === '萬' || unit === '10萬') {
          calc = { type: 'ratioWan', ratio: calc.ratio };
        } else if (unit === '百元') {
          calc = { type: 'ratio', ratio: calc.ratio * 100 };
        }
        // 否則保留 (amountUnit='元' 時直接 ratio)
      }
      return { name: it.name, calc, unit: it.unit, note: it.note };
    });
    return { title: product.claims.title || '理賠項目', items };
  }

  /* ──────────────────────────────────────────────────────────
   *  calcBenefitValue(item, product, amount)
   *  計算單項理賠金額
   *  — 依 item.calc.type 不同的計算路徑:
   *      'note'     → 純文字 ({ type:'text', text })
   *      'plan'     → planMap[amount] 直接查表
   *      'unit'     → 單位數 × perUnit
   *      'ratioWan' → 保額 × 10000 × ratio
   *      'ratio'    → 保額(已是元) × ratio
   *
   *  輸入:
   *    item:    benefitsLib 內單一 item 物件
   *    product: 商品物件 (此函式目前未直接用,保留參數兼容性)
   *    amount:  保額 (數字 / 'plan' 模式時為計畫別 key)
   *  輸出:
   *    { type:'num', val:數字 } 或 { type:'text', text:字串 } 或 null
   * ────────────────────────────────────────────────────────── */
  function calcBenefitValue(item, product, amount) {
    const calc = item.calc;
    if (!calc) return null;
    if (calc.type === 'note') {
      return { type: 'text', text: calc.text };
    }
    if (calc.type === 'text') {
      // v1.5: 純文字描述(例如 1HS 的健康促進回饋金 0~10%、防疫保健回饋金 2%)
      return { type: 'text', text: calc.value || calc.text || '' };
    }
    if (calc.type === 'fixed') {
      // v1.5: 不依計劃別/保額的固定金額(例如新光 A2A3 特定醫材補助 5,000)
      return calc.value != null ? { type: 'num', val: calc.value } : null;
    }
    if (calc.type === 'plan') {
      const v = calc.planMap[amount];
      return v != null ? { type: 'num', val: v } : null;
    }
    if (calc.type === 'unit') {
      const numAmount = parseFloat(amount) || 0;
      return { type: 'num', val: numAmount * calc.perUnit };
    }
    if (calc.type === 'ratioWan') {
      const numAmount = parseFloat(amount) || 0;
      return { type: 'num', val: numAmount * 10000 * calc.ratio };
    }
    if (calc.type === 'ratio') {
      const numAmount = parseFloat(amount) || 0;
      return { type: 'num', val: numAmount * calc.ratio };
    }
    return null;
  }

  /* ──────────────────────────────────────────────────────────
   *  classifyItem(item)
   *  把單個給付項目 (item) 歸類到 cls.key (給付類型分類)
   *
   *  輸出:{ key, icon, title }
   *
   *  cls.key 列表(完整見 ARCHITECTURE.md):
   *    waiver / burn / dislocation / transplant / critical /
   *    death / disability / daily / reimburse / surgery / opsurg /
   *    icu_daily / chemo / targeting / reconstruct / opd /
   *    special / elderly / maturity / other
   *
   *  ★ 優先順序很重要:
   *    先判斷豁免/燒燙傷/移植/癌症等特殊類,
   *    再判斷 death/disability,
   *    最後到 daily/reimburse/surgery (一般醫療類)
   * ────────────────────────────────────────────────────────── */
  function classifyItem(it) {
    const name = String(it.name || '');
    const note = String(it.note || '');
    const text = name + ' ' + note;
    if (/豁免/.test(text)) return { key: 'waiver', icon: '🛡️', title: '豁免保費' };
    if (/重大燒燙傷|燒燙傷.*保險金/.test(text)) return { key: 'burn', icon: '🔥', title: '重大燒燙傷' };
    if (/脫臼|骨折/.test(text)) return { key: 'dislocation', icon: '🦴', title: '脫臼 / 骨折定額' };
    if (/移植|器官/.test(text)) return { key: 'transplant', icon: '🌟', title: '重大器官 / 移植' };
    // ★ 含「癌症」或「重大傷病」字眼但同時含「日額/每日/手術/化學/放射」, 不該歸 critical
    //   優先判斷子類型, 才歸 critical 一次金
    const isCancer = /重大傷病|癌症|罹癌|罹患/.test(text);
    if (isCancer) {
      if (/住院.*手術|手術.*醫療/.test(text)) return { key: 'surgery', icon: '⚕️', title: '癌症住院手術' };
      if (/門診.*手術/.test(text)) return { key: 'opsurg', icon: '🚪', title: '癌症門診手術' };
      if (/標靶/.test(text)) return { key: 'targeting', icon: '🎯', title: '癌症標靶治療' };
      if (/化學|放射/.test(text)) return { key: 'chemo', icon: '💉', title: '化學/放射治療' };
      if (/(住院|每日|日額)/.test(text) && !/手術|處置/.test(text)) return { key: 'daily', icon: '🏥', title: '癌症住院日額' };
      if (/義乳/.test(text)) return { key: 'reconstruct', icon: '💗', title: '義乳重建手術' };
      // 純「重大傷病/癌症一次金」歸 critical
      return { key: 'critical', icon: '🎗️', title: '重大傷病 / 癌症' };
    }
    if (/喪葬|身故/.test(text)) return { key: 'death', icon: '🕊️', title: '身故 / 喪葬' };
    if (/失能/.test(text)) return { key: 'disability', icon: '♿', title: '失能保險金' };
    if (/老年.*住院|提前給付/.test(text)) return { key: 'elderly', icon: '🧓', title: '老年 / 提前給付' };
    if (/祝壽|滿期|生存|還本/.test(text)) return { key: 'maturity', icon: '🎂', title: '滿期 / 祝壽 / 生存' };
    if (/加護|燒燙傷.*日額|燒燙傷中心/.test(text) && /日額|每日/.test(text)) return { key: 'icu_daily', icon: '🚨', title: '加護病房 / 燒燙傷日額' };
    if (/(住院|每日|日額).*保險金|住院.*日額/.test(text) && !/手術|處置|門診|實支/.test(text)) return { key: 'daily', icon: '🏥', title: '住院日額' };
    if (/實支|病房費用|住院醫療費用|住院.*醫療.*費/.test(text)) return { key: 'reimburse', icon: '💊', title: '實支實付' };
    if (/門診.*手術/.test(text)) return { key: 'opsurg', icon: '🚪', title: '門診手術' };
    if (/特定處置/.test(text)) return { key: 'special', icon: '⚙️', title: '特定處置' };
    if (/手術/.test(text)) return { key: 'surgery', icon: '⚕️', title: '住院手術' };
    if (/門診/.test(text)) return { key: 'opd', icon: '🏨', title: '門診' };
    return { key: 'other', icon: '📋', title: '其他給付' };
  }

  /* ──────────────────────────────────────────────────────────
   *  categorize5(product)
   *  把商品歸到 4+1 大類 (life/medical/critical/cancer/accident/other)
   *
   *  輸出:{ mainKey, mainTitle, subTitle }
   *
   *  ★ 順序很重要:
   *    1. 豁免類       → other (簡易模式隱藏)
   *    2. 意外/傷害    → accident (優先,避免被「醫療」字眼誤判)
   *    3. 壽險/身故    → life
   *    4. 重大傷病     → critical
   *    5. 癌症療程/一次金 → cancer
   *    6. 實支實付/自負額 → medical 實支實付型
   *    7. 定額醫療/住院日額/手術 (+ HSV/YHA/H2D code) → medical 定額型
   *    8. 兜底         → other
   * ────────────────────────────────────────────────────────── */
  function categorize5(product) {
    const cat = String(product.category || '');
    const code = String(product.code || '');
    const name = String(product.name || '');
    const fullText = cat + ' ' + name;

    // ★ 豁免保費類 — 不顯示在簡易卡 (邏輯上不是給付項目)
    if (/豁免/.test(fullText)) return { mainKey: 'other', mainTitle: '其他', subTitle: null };

    // ★ 意外/傷害類優先判斷 (因為會跟「醫療」「定額」字眼撞)
    if (/意外|傷害|骨折/.test(fullText) || /5DD|R1D|L6D|MRE|XHQ|RHG|TMR|ADG/.test(code)) {
      return { mainKey: 'accident', mainTitle: '意外醫療', subTitle: null };
    }

    // ① 人身/失能保障 (壽險身故/失能 — 此大類只剩「一般身故/失能」)
    if (/壽險|身故/.test(cat)) return { mainKey: 'life', mainTitle: '人身/失能保障', subTitle: null };

    // ② 重大傷病
    if (/重大傷病|重疾/.test(cat) && !/癌症/.test(cat)) return { mainKey: 'critical', mainTitle: '重大傷病', subTitle: null };

    // ③ 癌症 — 拆兩個子組
    if (/癌症療程/.test(cat)) return { mainKey: 'cancer', mainTitle: '癌症險', subTitle: null };
    if (/癌症一次金|癌症/.test(cat)) return { mainKey: 'cancer', mainTitle: '癌症險', subTitle: null };

    // ④ 住院醫療 (實支實付 / 定額)
    if (/實支實付|自負額/.test(cat)) return { mainKey: 'medical', mainTitle: '住院醫療', subTitle: '實支實付型' };
    if (/定額醫療|住院日額|定額|手術/.test(cat) || /HSV|YHA|H2D/.test(code)) return { mainKey: 'medical', mainTitle: '住院醫療', subTitle: '定額型' };

    // 兜底
    return { mainKey: 'other', mainTitle: '其他保障', subTitle: null };
  }

  /* ──────────────────────────────────────────────────────────
   *  匯出 — 全域 window.AHShared 物件
   * ────────────────────────────────────────────────────────── */
  global.AHShared = {
    version: '1.0',
    convertProductClaims,
    calcBenefitValue,
    classifyItem,
    categorize5
  };

})(typeof window !== 'undefined' ? window : globalThis);
