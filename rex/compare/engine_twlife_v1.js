/**
 * ============================================================
 *  engine_twlife_v1.js
 * ============================================================
 *  儲蓄險分析系統 — twlife_v1 引擎獨立檔
 *
 *  從 rex/compare/index_slim.html 抽出的程式碼,可獨立使用或
 *  作為新對話/新專案的引用。
 *
 *  適用商品(2026-05 截止 39 個):
 *    - 新光人壽 19 個(TBA / P2A / WZA / P3A / JZA / SMD / SX /
 *                     MLXT / XH / XT / XN / ZM / FLW / YK /
 *                     20UISD / 20UISE / 20ULSN 等)
 *    - 全球人壽 6 個(FYW / FVW / FKD / FBW / FDW / F8W)
 *    - 富邦人壽 5 個(FBM / FBP / FAZ / FBO / PFA)
 *    - 台壽 5 個(NUIW4703 / 5203 / 6502 / 6602 / 7302)
 *    - 友邦 2 個(UED / UWHL)
 *    - 安達 1 個(RPISWLB)
 *    - 遠雄 2 個(BU1 / SP1)
 *
 *  資料結構需求(JSON schema):
 *    db.meta.base_sa        // 基準保額(必)
 *    db.meta.base_premium   // 基準保費(必)
 *    db.meta.base_age       // 基準試算年齡(必)
 *    db.meta.base_sex       // 基準試算性別 'M' / 'F'(必)
 *    db.meta.discount       // 高保額/轉帳折扣率,例 0.01 = 1%(可選)
 *    db.meta.schedule_includes_dividend  // 預設 true,UED/UWHL 等純保證商品為 false(可選)
 *    db.schedule[]          // 逐年表(必),每筆需有:
 *       y, age, cum_prem, cv_basic, cv_total, death_benefit
 *
 *  外部依賴:
 *    window.INSURANCE_DBS   // 由 manifest 載入的商品 JSON 資料庫
 *    productMeta            // PRODUCTS 註冊裡的商品 metadata
 *      (使用欄位:plan_code, currency, unit_size, min_sa, max_sa,
 *                min_sa_under15, max_sa_under15, discount)
 *
 *  ⚠️ 不適用:
 *    - prudential_v1 / prudential_v2(分紅商品)
 *    - kgi_rv_v1(凱基紅利系列)
 *    - taishin_v1(舊新光分紅引擎)
 *
 * ============================================================
 */


// ─────────────────────────────────────────────────────────────
//  Helper:取得商品資料庫
// ─────────────────────────────────────────────────────────────
function getDB(planCode) {
  const db = window.INSURANCE_DBS[planCode];
  if (!db) throw new Error(`商品 ${planCode} 尚未載入,請先 await loadProductDB('${planCode}')`);
  return db;
}


// ─────────────────────────────────────────────────────────────
//  Helper:套用投保限額(min_sa / max_sa / unit_size 進位)
// ─────────────────────────────────────────────────────────────
function applyInsuranceLimits(rawSA, productMeta, age) {
  const unit = productMeta.unit_size || 1000;
  // 進位(向上取整到 unit 倍數,因為要「超出一點預算」而不是不足)
  let sa = Math.ceil(rawSA / unit) * unit;
  // 套用 min/max(依年齡分段)
  let minSA, maxSA;
  if (age <= 15 && productMeta.min_sa_under15 != null) {
    minSA = productMeta.min_sa_under15;
    maxSA = productMeta.max_sa_under15;
  } else {
    minSA = productMeta.min_sa || unit;
    maxSA = productMeta.max_sa || Infinity;
  }
  if (sa < minSA) sa = minSA;
  if (sa > maxSA) sa = maxSA;
  return sa;
}


// ─────────────────────────────────────────────────────────────
//  ★ 核心引擎:逐年精算試算
//  邏輯:由 schedule 等比例縮放(ratio = sumAssured / base_sa)
// ─────────────────────────────────────────────────────────────
function actuarialCalc_twlife(plan, sex, age, sumAssured, period) {
  const db = getDB(plan);
  if (!db || !db.schedule) return null;
  const baseSA = db.meta.base_sa;
  const ratio = sumAssured / baseSA;

  // 逐年資料按比例縮放;每年實繳 = (cum_prem 增量) × ratio
  // 改動原因:全球人壽 FYW/FVW/FKD/FBW 在 period 內每年保費隨年齡遞減(高保費級距折扣)
  //          對台壽 / 凱基 / 全球 FDW/F8W (cum_prem 線性遞增) 結果不變
  let prevCum = 0;
  const schedule = db.schedule.map(r => {
    const cumScaled = Math.round(r.cum_prem * ratio);
    const yearlyPrem = cumScaled - prevCum;
    prevCum = cumScaled;
    return {
      y: r.y,
      age: age + r.y - 1,
      prem: r.y <= period ? yearlyPrem : 0,
      cum_prem: cumScaled,
      surr_pure: +(r.cv_basic * ratio).toFixed(2),
      surr_total: +(r.cv_total * ratio).toFixed(2),
      death_pure: Math.round(r.death_benefit * ratio),
      death_total: +(r.death_benefit * ratio).toFixed(2),
    };
  });

  // annual_premium_real 改用 Y1 實繳(對齊 STEP3 比較表 Y1 數字)
  const annualPremiumReal = schedule[0]?.prem ?? Math.round(db.meta.base_premium * ratio);
  const annualPremiumOrig = db.meta.discount
    ? Math.round(annualPremiumReal / (1 - db.meta.discount))
    : annualPremiumReal;

  // 是否完全等於基準(同年齡同性別)→ exact
  const isExact = sex === db.meta.base_sex && age === db.meta.base_age;

  return {
    sum_assured: sumAssured,
    annual_premium_orig: annualPremiumOrig,
    annual_premium_real: annualPremiumReal,
    schedule,
    is_exact: isExact,
    is_estimated: !isExact,  // 標記為估算
    base_age: db.meta.base_age,
    base_sex: db.meta.base_sex,
    // 路徑 C:若 schedule 不含紅利累積(預設視為已含),帶 warning 給 UI
    // 用法:result.dividend_warning 為非空字串時,UI 在比較表那一列加灰色註記
    dividend_warning: db.meta.schedule_includes_dividend === false
      ? '⚠ 顯示為純保證(預定利率)數字,實際領回會更高(含宣告利率紅利累積)'
      : null,
  };
}


// ─────────────────────────────────────────────────────────────
//  ★ 預算反推保額
//  邏輯:ratio = budget / base_premium → sa = base_sa × ratio
// ─────────────────────────────────────────────────────────────
function calcSumAssuredFromBudget_twlife(plan, sex, age, budgetReal, productMeta) {
  const db = getDB(plan);
  if (!db) return null;
  // 比例 = 預算 / 基準保費,保額 = 基準保額 × 比例
  const ratio = budgetReal / db.meta.base_premium;
  const rawSA = db.meta.base_sa * ratio;
  return applyInsuranceLimits(rawSA, productMeta, age);
}


// ─────────────────────────────────────────────────────────────
//  使用範例(在主流程的 calcProductForUser 裡是這樣呼叫)
// ─────────────────────────────────────────────────────────────
/*
  if (engine === 'twlife_v1') {
    sumAssured = calcSumAssuredFromBudget_twlife(plan, sex, age, budget, productMeta);
    if (!sumAssured) return null;
    result = actuarialCalc_twlife(plan, sex, age, sumAssured, user.period);
  }

  // result 結構:
  //   {
  //     sum_assured: 100000,           // 反推出的保額
  //     annual_premium_orig: 4080,     // 折扣前年保費
  //     annual_premium_real: 4040,     // 折扣後年保費(STEP3 顯示用)
  //     schedule: [                    // 逐年精算結果
  //       { y, age, prem, cum_prem, surr_pure, surr_total, death_pure, death_total },
  //       ...
  //     ],
  //     is_exact: false,               // 是否完全等於基準試算
  //     is_estimated: true,            // 是否為估算結果
  //     base_age: 35,
  //     base_sex: 'M',
  //     dividend_warning: null,        // 純保證商品才有警告字串
  //   }
*/


// ─────────────────────────────────────────────────────────────
//  匯出(若需在 Node / module bundler 環境使用)
// ─────────────────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getDB,
    applyInsuranceLimits,
    actuarialCalc_twlife,
    calcSumAssuredFromBudget_twlife,
  };
}
