/* ============================================================
 *  保險建議書系統 - 主程式 v2
 * ============================================================ */

const App = (() => {

  const state = {
    activeCompany: null,
    selections: {},   // { companyId: { main: {code,period,amount}, riders: [...] } }
    db: null,
    showProposer: false,   // 預設不顯示要保人
    lastAge: null,    // 最近一次 recompute 時的保險年齡(用於商品列表顯示超齡警告)
    lastJob: 1,       // 最近一次的職業等級(核保用)
    // ── 責任曲線調整 ──
    curve: {
      enabled: false,           // 是否啟用
      preset: 'lifestage',      // 預設選取「人生階段型」(視覺 active,實際要 enabled 才生效)
      startAge: 60,             // 從幾歲開始調
      period: 5,                // 每幾年調一次
      step: 25,                 // 每次降幾 %
      floor: 50,                // 最低保留 %
      products: {}              // { 'quanqiu_XHD': true, 'quanqiu_NIR': true, ... }
    },
    // ── 要保人豁免保費附約(全球人壽 XWA/XWB)──
    // XWA(A 型):要保人 ≠ 被保險人時可用(需有要保人欄位開啟)
    // XWB(B 型):要保人 = 被保險人時可用(目前我們的場景以 XWA 為主)
    // 保額計算:其他險種年繳保費總和(不含 XWA/XWB 本身),最高 200 萬
    // 保費計算:保額(萬) × 該年齡性別費率(元/萬)
    waiver: {
      enabled: false,           // 是否啟用豁免
      productCode: 'XWA',       // 'XWA' | 'XWB' (依要保人/被保險人關係自動判斷)
      ratePerWan: null,         // 每萬元保額對應的年繳費率;null = 用內建預估表
      manualRate: false,        // true = 使用者手動填寫費率(rate per wan)
      manualPremium: 0          // 若使用者選「直接填寫年繳金額」,優先使用這個
    }
  };

  const $ = sel => document.querySelector(sel);
  const $$ = sel => document.querySelectorAll(sel);

  const fmt = n => (typeof n === 'number' && isFinite(n)) ? Math.round(n).toLocaleString() : n;

  /** 計算保險年齡(超過半年進1)
   *  - 完整年數 + 若距下次生日 < 183 天則 +1
   *  - 例:0/5/2 出生,5/2 計算 → 0 歲(不算半歲)
   *  - 例:0/5/2 出生,11/3 計算 → 0+1=1 歲(已過半年)
   */
  function calcInsuranceAge(birthDate, refDate) {
    if (!birthDate || !refDate) return '';
    const b = new Date(birthDate + 'T00:00:00');
    const r = new Date(refDate + 'T00:00:00');
    if (isNaN(b) || isNaN(r)) return '';
    let age = r.getFullYear() - b.getFullYear();
    const monthDiff = r.getMonth() - b.getMonth();
    const dayDiff = r.getDate() - b.getDate();
    // 還未過今年生日
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age--;
    // 計算距「下次生日」的天數
    const nextBirthday = new Date(b);
    nextBirthday.setFullYear(r.getFullYear());
    if (nextBirthday <= r) {
      // 今年生日已過(或就是今天) → 下次生日是明年
      nextBirthday.setFullYear(r.getFullYear() + 1);
    }
    const daysToNext = (nextBirthday - r) / (1000 * 60 * 60 * 24);
    if (daysToNext < 183) age++;
    return age < 0 ? 0 : age;
  }

  function adToRoc(adDate) {
    const d = new Date(adDate);
    if (isNaN(d)) return '';
    return `${d.getFullYear() - 1911}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  }

  /** 從費率表取年齡費率(若該年齡缺,使用最接近的) */
  function getRateForAge(rateMap, age) {
    if (!rateMap) return 0;
    if (rateMap[age] !== undefined) return rateMap[age];
    const ages = Object.keys(rateMap).map(Number).sort((a, b) => a - b);
    if (ages.length === 0) return 0;
    if (age < ages[0]) return rateMap[ages[0]];
    if (age > ages[ages.length - 1]) return rateMap[ages[ages.length - 1]];
    let nearest = ages[0];
    for (const a of ages) if (a <= age) nearest = a;
    return rateMap[nearest];
  }

  /** 檢查保險年齡是否在商品的可投保範圍內 */
  function isAgeEligible(product, age) {
    if (age == null || isNaN(age)) return true; // 年齡未填,不擋
    const minAge = product.minAge ?? 0;
    const maxAge = product.maxAge ?? 99;
    return age >= minAge && age <= maxAge;
  }
  function getAgeLimitText(product) {
    const minAge = product.minAge ?? 0;
    const maxAge = product.maxAge ?? 99;
    return `${minAge}~${maxAge} 歲`;
  }

  /** 全方位核保檢查 — 回傳所有違規項目陣列(空陣列 = 全部 OK) */
  function underwriteCheck(product, age, jobLevel, period, amount) {
    const issues = [];
    if (age == null || isNaN(age)) return issues;

    // 0) rateAgeBasis="proposer" 商品(如宏泰 WRA / WRB):
    //    必須有要保人資料,且要保人不能是被保險人本人
    //    這類商品的年齡/性別檢查改用要保人,所以下面 1) 之後的檢查都用要保人年齡
    let checkAge = age;
    let checkJob = jobLevel;
    if (product.rateAgeBasis === 'proposer') {
      const proposer = state.showProposer ? getCurrentProposer() : null;
      if (!proposer || proposer.age == null) {
        issues.push({
          type: 'proposer_required',
          severity: 'block',
          msg: `本附約須有要保人資料,請於「投保人員資料」開啟「輸入要保人資料」並填入要保人年齡/性別`
        });
        return issues;  // 沒要保人,後面檢查無意義
      }
      // 開了「輸入要保人資料」即視為要保人與被保險人為不同人
      // (實際身分由業務員投保時確認;系統不再依年齡性別判斷)
      // 改用要保人年齡作後續檢查
      checkAge = proposer.age;
      checkJob = proposer.job || 1;
    }

    // 1) 投保年齡檢查
    const minAge = product.minAge ?? 0;
    const maxAge = product.maxAge ?? 99;
    if (checkAge < minAge || checkAge > maxAge) {
      const who = product.rateAgeBasis === 'proposer' ? '要保人' : '被保險人';
      issues.push({
        type: 'age',
        severity: 'block',
        msg: `投保年齡限 ${minAge}~${maxAge} 歲,${who} ${checkAge} 歲不符`
      });
    }

    // 1a) 主約依繳費年期不同的年齡限制(如 DCF 30 年期 0-45 歲)
    if (product.ageByPeriod && period && product.ageByPeriod[period]) {
      const [pMin, pMax] = product.ageByPeriod[period];
      if (checkAge < pMin || checkAge > pMax) {
        const who = product.rateAgeBasis === 'proposer' ? '要保人' : '被保險人';
        issues.push({
          type: 'age_period',
          severity: 'block',
          msg: `${period} 投保年齡限 ${pMin}~${pMax} 歲,${who} ${checkAge} 歲不符`
        });
      }
    }

    // 2) 保額檢查(最低/最高)
    if (amount != null && amount !== '') {
      const numAmt = parseFloat(amount);
      if (!isNaN(numAmt)) {
        // 最低保額
        if (product.minAmount != null && numAmt < product.minAmount) {
          issues.push({
            type: 'amount_min',
            severity: 'warn',
            msg: `保額不得低於 ${product.minAmount}${product.amountUnit || ''}(目前 ${numAmt})`
          });
        }
        // 最高保額(自身)
        if (product.maxAmount != null && numAmt > product.maxAmount) {
          issues.push({
            type: 'amount_max',
            severity: 'block',
            msg: `本商品保額上限 ${product.maxAmount}${product.amountUnit || ''}(目前 ${numAmt} 已超過)`
          });
        }
        // 依年齡的保額上限(如 XAB)
        if (product.amountByAge) {
          const slot = product.amountByAge.find(s => age >= s.ageMin && age <= s.ageMax);
          if (slot && numAmt > slot.max) {
            issues.push({
              type: 'amount_age',
              severity: 'block',
              msg: `${age} 歲 ${slot.ageMin}-${slot.ageMax} 歲區間保額上限 ${slot.max}${product.amountUnit || ''}(目前 ${numAmt})`
            });
          }
        }
        // 依職業等級的保額上限(如 XAB)
        if (product.maxByJobLevel && jobLevel != null) {
          const jobMax = product.maxByJobLevel[String(jobLevel)];
          if (jobMax != null && numAmt > jobMax) {
            issues.push({
              type: 'amount_job',
              severity: 'block',
              msg: `職業 ${jobLevel} 級保額上限 ${jobMax}${product.amountUnit || ''}(目前 ${numAmt})`
            });
          }
        }
        // 體檢通知:由累計檢查器(aggregateUnderwriteCheck)處理,此處不檢查單一商品
      }
    }

    return issues;
  }

  /** 累計核保檢查 — 檢查多個商品加總後是否超過業界上限
   *  目前實作:
   *  1. 醫療附約日額累計上限(XHD/NIR 等)
   *     - 未滿 15 歲:8,000 元/日
   *     - 15 歲(含)以上:10,000 元/日
   *  2. 重大傷病類體檢通知(DCF + XDE 等 majorIllness 群組)
   *     - 16~55 歲:累計 ≥ 201 萬須體檢
   *     - 56 歲以上:累計 ≥ 101 萬須體檢
   *     - 15 歲以下:原則免體檢
   */
  function aggregateUnderwriteCheck(selections, db, age) {
    const issues = [];
    if (age == null) return issues;

    // === 1) 醫療附約日額累計 ===
    let medicalDailyTotal = 0;
    const medicalProducts = [];
    Object.entries(selections).forEach(([cid, sel]) => {
      const c = db.companies.find(co => co.id === cid);
      if (!c) return;
      // 主約
      if (sel.main) {
        const p = c.mainProducts.find(p => p.code === sel.main.code);
        if (p && p.medicalCategory === 'medicalDaily' && p.dailyByPlan) {
          const daily = p.dailyByPlan[sel.main.amount];
          if (daily) {
            medicalDailyTotal += daily;
            medicalProducts.push(`${p.code}(${sel.main.amount}=${daily}元)`);
          }
        }
      }
      // 附約
      sel.riders.forEach(r => {
        const p = c.riderProducts.find(p => p.code === r.code);
        if (p && p.medicalCategory === 'medicalDaily' && p.dailyByPlan) {
          const daily = p.dailyByPlan[r.amount];
          if (daily) {
            medicalDailyTotal += daily;
            medicalProducts.push(`${p.code}(${r.amount}=${daily}元)`);
          }
        }
      });
    });

    if (medicalDailyTotal > 0) {
      // 未滿 15 歲 8000、15+ 歲 10000
      const ageLimit = age < 15 ? 8000 : 10000;
      const ageGroup = age < 15 ? '未滿 15 歲' : '15 歲以上';
      if (medicalDailyTotal > ageLimit) {
        issues.push({
          type: 'aggregate_medical_daily',
          severity: 'block',
          msg: `🚫 醫療日額累計 ${medicalDailyTotal.toLocaleString()} 元/日,超過 ${ageGroup}限額 ${ageLimit.toLocaleString()} 元/日`,
          detail: `已選商品:${medicalProducts.join('、')}`
        });
      } else if (medicalDailyTotal > ageLimit * 0.8) {
        issues.push({
          type: 'aggregate_medical_daily_warn',
          severity: 'warn',
          msg: `⚠️ 醫療日額累計 ${medicalDailyTotal.toLocaleString()} 元/日(${ageGroup}上限 ${ageLimit.toLocaleString()} 元/日)`,
          detail: `已選商品:${medicalProducts.join('、')}`
        });
      }
    }

    // === 2) 重大傷病類體檢累計檢查(DCF + XDE 等 majorIllness 群組) ===
    let majorIllnessTotal = 0;
    const majorIllnessProducts = [];
    Object.entries(selections).forEach(([cid, sel]) => {
      const c = db.companies.find(co => co.id === cid);
      if (!c) return;
      const collect = (sel_item, productList) => {
        if (!sel_item) return;
        const p = productList.find(p => p.code === sel_item.code);
        if (p && p.medicalExamGroup === 'majorIllness') {
          const amt = parseFloat(sel_item.amount) || 0;
          if (amt > 0) {
            majorIllnessTotal += amt;
            majorIllnessProducts.push(`${p.code} ${amt}萬`);
          }
        }
      };
      if (sel.main) collect(sel.main, c.mainProducts);
      sel.riders.forEach(r => collect(r, c.riderProducts));
    });

    if (majorIllnessTotal > 0) {
      // 體檢規則(依官方 DCF/XDE 投保規則第 144-145、166-167 頁)
      let needExam = false;
      let examLevel = '';
      let examItems = '';

      if (age < 16) {
        // 15 歲以下原則免體檢
        if (majorIllnessTotal >= 201) {
          // 雖然原則免體檢,但保額很高仍提醒
          issues.push({
            type: 'major_illness_minor',
            severity: 'warn',
            msg: `ℹ️ 未滿 16 歲累計重大傷病保額 ${majorIllnessTotal} 萬元(${majorIllnessProducts.join('+')}),原則免體檢但須提供兒童健康手冊影本`,
            detail: '官方規則:15 歲以下原則免體檢,核保員視風險評估可要求補件'
          });
        }
      } else if (age >= 16 && age <= 55) {
        // 16~55 歲:201 萬以上須體檢
        if (majorIllnessTotal >= 301) {
          needExam = true;
          examLevel = '301 萬以上';
          examItems = '普通體檢、尿液常規檢查、血液生化檢查、靜止心電圖檢查';
        } else if (majorIllnessTotal >= 201) {
          needExam = true;
          examLevel = '201~300 萬';
          examItems = '普通體檢、尿液常規檢查、血液生化檢查、靜止心電圖檢查';
        }
      } else {
        // 56 歲以上:101 萬以上須體檢
        if (majorIllnessTotal >= 301) {
          needExam = true;
          examLevel = '301 萬以上';
          examItems = '普通體檢、尿液常規檢查、血液生化檢查、靜止心電圖檢查、胸部 X 光檢查';
        } else if (majorIllnessTotal >= 201) {
          needExam = true;
          examLevel = '201~300 萬';
          examItems = '普通體檢、尿液常規檢查、血液生化檢查、靜止心電圖檢查';
        } else if (majorIllnessTotal >= 101) {
          needExam = true;
          examLevel = '101~200 萬';
          examItems = '普通體檢、尿液常規檢查、血液生化檢查、靜止心電圖檢查';
        }
      }

      if (needExam) {
        issues.push({
          type: 'major_illness_exam',
          severity: 'warn',
          msg: `🩺 重大傷病類累計保額 ${majorIllnessTotal} 萬元(${age} 歲 ${examLevel}),須安排體檢`,
          detail: `已選商品:${majorIllnessProducts.join('、')}|體檢項目:${examItems}`
        });
      } else if (majorIllnessTotal > 0 && age >= 16) {
        // 沒到體檢門檻,但顯示累計值供參考
        const nextThreshold = age >= 56 ? 101 : 201;
        if (majorIllnessTotal >= nextThreshold * 0.8) {
          issues.push({
            type: 'major_illness_approaching',
            severity: 'warn',
            msg: `ℹ️ 重大傷病類累計保額 ${majorIllnessTotal} 萬元,接近${age >= 56 ? '56歲以上' : '16-55歲'}體檢門檻 ${nextThreshold} 萬元`,
            detail: `已選商品:${majorIllnessProducts.join('、')}`
          });
        }
      }
    }

    return issues;
  }

  /** 是否有 block 等級的違規 */
  function hasBlockingIssue(product, age, jobLevel, period, amount) {
    return underwriteCheck(product, age, jobLevel, period, amount).some(i => i.severity === 'block');
  }

  /** 計算單一商品保費(統一單位費率制) */
  function calcProductFee(product, gender, age, period, amount, isFirstYear = true, jobLevel = 1, skipUnderwriteCheck = false) {
    if (!product || !period || amount === '' || amount == null) return 0;

    // ★ rateAgeBasis === 'proposer':費率改用要保人年齡/性別(宏泰 WRA/WRB 等豁免附約)
    //   若要保人未填寫,則無法計算(回傳 0)
    let useGender = gender;
    let useAge = age;
    if (product.rateAgeBasis === 'proposer') {
      const proposer = getCurrentProposer();
      if (!proposer || proposer.age == null) return 0;
      useGender = proposer.gender;
      useAge = proposer.age;
      jobLevel = proposer.job || 1;
    }

    // ★ 核保檢查:有 block 等級違規 → 不能投保(費率 = 0)
    // skipUnderwriteCheck = true:走勢圖場景下計算「續保」費率,跳過投保上限檢查
    if (!skipUnderwriteCheck && useAge != null && hasBlockingIssue(product, useAge, jobLevel, period, amount)) return 0;

    let ratesRoot = product.rates;
    if (product.rateMode === 'perUnit_firstYearDiff') {
      ratesRoot = isFirstYear ? product.firstYearRates : product.renewalRates;
    }
    if (!ratesRoot || !ratesRoot[period]) return 0;

    const genderTable = ratesRoot[period][useGender];
    if (!genderTable) return 0;

    if (product.rateMode === 'plan') {
      const planTable = genderTable[amount];
      if (!planTable) return 0;
      return getRateForAge(planTable, useAge);
    } else if (product.rateMode === 'fixedAmount') {
      const amtKey = String(amount);
      const amtTable = genderTable[amtKey];
      if (!amtTable) return 0;
      return getRateForAge(amtTable, useAge);
    } else {
      // perUnit / perUnit_firstYearDiff
      const baseRate = getRateForAge(genderTable, useAge);
      const numAmount = parseFloat(amount) || 0;
      // ★ 若 amountUnit === '元'(如宏泰 WRA/WRB):費率是「元/萬」,保額是「元」,要除 10000
      if (product.amountUnit === '元') {
        return Math.round(baseRate * numAmount / 10000);
      }
      return Math.round(baseRate * numAmount);
    }
  }

  /** 取得當前要保人/被保險人資料 */
  function getCurrentInsured() {
    return {
      name: $('#insured-name').value || '',
      gender: $('#insured-gender').value,
      birth: $('#insured-birth').value,
      age: $('#insured-age').value === '' ? null : parseInt($('#insured-age').value),
      job: parseInt($('#insured-job').value) || 1
    };
  }
  function getCurrentProposer() {
    if (!state.showProposer) return null;
    return {
      name: $('#proposer-name').value || '',
      gender: $('#proposer-gender').value,
      birth: $('#proposer-birth').value,
      age: $('#proposer-age').value === '' ? null : parseInt($('#proposer-age').value),
      job: parseInt($('#proposer-job').value) || 1
    };
  }

  /** 是否有可計算的被保險人(有效年齡即可,不一定需要出生日期) */
  function hasValidInsured() {
    const ins = getCurrentInsured();
    return ins.age !== null && !isNaN(ins.age) && ins.age >= 0;
  }

  // ── 渲染:公司分頁 ──
  function renderCompanyTabs() {
    const wrap = $('#companyTabs');
    wrap.innerHTML = '';
    state.db.companies.forEach(c => {
      const btn = document.createElement('button');
      btn.className = 'company-tab' + (c.id === state.activeCompany ? ' active' : '');
      // 若有 logoUrl 用圖片;否則用 logoText 或商品名首字
      let iconHtml;
      if (c.logoUrl) {
        iconHtml = `<span class="ct-icon has-logo"><img src="${c.logoUrl}" alt="${c.shortName}" onerror="this.parentElement.classList.remove('has-logo'); this.parentElement.innerHTML='${c.logoText || c.shortName.charAt(0)}';"></span>`;
      } else {
        iconHtml = `<span class="ct-icon">${c.logoText || c.shortName.charAt(0)}</span>`;
      }
      btn.innerHTML = `${iconHtml}<span>${c.name}</span>`;
      btn.onclick = () => {
        state.activeCompany = c.id;
        renderCompanyTabs();
        renderProductSection();
        updateWaiverSectionVisibility();
      };
      wrap.appendChild(btn);
    });
    // 初次渲染時也決定 XWA 區塊是否顯示
    updateWaiverSectionVisibility();
  }

  /** XWA 豁免區塊只在「全球人壽」分頁顯示(XWA 是全球的商品)*/
  function updateWaiverSectionVisibility() {
    const sect = document.getElementById('waiverSection');
    if (!sect) return;
    sect.style.display = (state.activeCompany === 'quanqiu') ? '' : 'none';
  }

  // ── 渲染:商品列表 ──
  function renderProductSection() {
    const c = state.db.companies.find(x => x.id === state.activeCompany);
    const wrap = $('#productSection');
    if (!c) {
      wrap.innerHTML = `<div class="empty-hint">請先選擇公司,或點選「+ 新增公司」</div>`;
      return;
    }

    if (!state.selections[c.id]) state.selections[c.id] = { main: null, riders: [] };
    const sel = state.selections[c.id];

    const ins = getCurrentInsured();
    const validInsured = hasValidInsured();
    const age = validInsured ? ins.age : 0;
    state.lastAge = validInsured ? age : null;  // 給 renderProductRow 判斷超齡用
    state.lastJob = ins.job || 1;               // 職業等級給核保檢查用

    let html = '<div class="product-section">';

    // 提示:尚未輸入被保險人
    if (!validInsured) {
      html += `<div class="notice-text" style="margin-bottom:14px;">
        ⚠️ 請先於上方填入「被保險人」的出生日期,費率才會依保險年齡自動帶出。
      </div>`;
    }

    // ★ 未成年(0~14 歲)被保險人,提醒要勾要保人(因為未成年無行為能力,不能自投保)
    if (validInsured && age <= 14 && !state.showProposer) {
      html += `<div class="notice-text" style="margin-bottom:14px; background:#fff8e6; border-color:#ffd591; color:#a0570a;">
        ⚠️ 被保險人 ${age} 歲為未成年,法律上不能自行投保。建議於上方開啟「<b>輸入要保人資料</b>」並填寫要保人(通常為父母)資料。
      </div>`;
    }

    // 主約
    html += `<div class="product-group">
      <div class="product-group-header">
        <div class="product-group-title-wrap">
          <button class="select-all-btn no-print" onclick="App.toggleAllMain('${c.id}')">
            ${sel.main ? '☐ 取消選擇' : '☑ 全部清空'}
          </button>
          <div class="product-group-title">主約 (請選擇一項)</div>
        </div>
      </div>`;
    html += `<div class="product-list">`;
    c.mainProducts.forEach(p => {
      const isSelected = sel.main && sel.main.code === p.code;
      const selPeriod = isSelected ? sel.main.period : (p.defaultPeriod || p.periodOptions[0]);
      const selAmount = isSelected ? sel.main.amount : p.defaultAmount;
      const fee = (isSelected && validInsured) ? calcProductFee(p, ins.gender, age, selPeriod, selAmount, true, ins.job) : 0;
      html += renderProductRow('main', c.id, p, isSelected, selPeriod, selAmount, fee, validInsured);
    });
    html += `</div></div>`;

    // 附約
    const allRiderSelected = c.riderProducts.length > 0 && c.riderProducts.every(p => sel.riders.find(r => r.code === p.code));
    html += `<div class="product-group">
      <div class="product-group-header">
        <div class="product-group-title-wrap">
          <button class="select-all-btn no-print" onclick="App.toggleAllRiders('${c.id}')">
            ${allRiderSelected ? '☐ 全部取消' : '☑ 全部選取'}
          </button>
          <div class="product-group-title rider">附約 (可複選)</div>
        </div>
      </div>`;
    html += `<div class="product-list">`;
    // ★ WRA / WRB 二擇一:
    //   - 沒開「輸入要保人」→ 只顯示 WRB(乙型,被保人=要保人時用)
    //   - 開了「輸入要保人」→ 只顯示 WRA(甲型,被保人≠要保人時用)
    // 同時也清掉「不該選」的那一張(避免使用者切換要保人開關後,舊的選擇還留著)
    const ridersToShow = c.riderProducts.filter(p => {
      if (p.code === 'WRA') return state.showProposer;          // 有要保人才顯示 WRA
      if (p.code === 'WRB') return !state.showProposer;         // 沒要保人才顯示 WRB
      return true;
    });
    // 順手把不該存在的選擇清掉
    if (state.showProposer) {
      sel.riders = sel.riders.filter(r => r.code !== 'WRB');
    } else {
      sel.riders = sel.riders.filter(r => r.code !== 'WRA');
    }
    ridersToShow.forEach(p => {
      const r = sel.riders.find(r => r.code === p.code);
      const isSelected = !!r;
      const selPeriod = isSelected ? r.period : (p.defaultPeriod || p.periodOptions[0]);
      const selAmount = isSelected ? r.amount : p.defaultAmount;
      const fee = (isSelected && validInsured) ? calcProductFee(p, ins.gender, age, selPeriod, selAmount, true, ins.job) : 0;
      html += renderProductRow('rider', c.id, p, isSelected, selPeriod, selAmount, fee, validInsured);
    });
    html += `</div></div>`;

    html += `</div>`;
    wrap.innerHTML = html;

    bindProductEvents();
    // ★ 確保每次重繪都同步 XWA 區塊的顯示狀態(只在全球分頁顯示)
    updateWaiverSectionVisibility();
  }

  function renderProductRow(type, cid, p, isSelected, selPeriod, selAmount, fee, validInsured) {
    const inputName = type === 'main' ? `main_${cid}` : '';
    const inputType = type === 'main' ? 'radio' : 'checkbox';

    // 期別:多項用下拉,單項用文字(置中對齊)
    const periodSel = p.periodOptions.length > 1
      ? `<select class="prod-period" data-type="${type}" data-cid="${cid}" data-code="${p.code}">
          ${p.periodOptions.map(opt => `<option value="${opt}" ${opt === selPeriod ? 'selected' : ''}>${opt}</option>`).join('')}
         </select>`
      : `<span class="period-label">${p.periodOptions[0]}</span>`;

    // 保額/計畫(獨立欄位)+ 單位(獨立欄位)
    let amountInput = '';
    let amountUnit = p.amountUnit || '';
    if (p.autoFillFromCompanyTotal) {
      // ★ WRA / WRB:保額自動帶入同公司其他商品年繳保費總和(唯讀)
      // 即時計算當前同公司商品保費合計(僅顯示用,實際計算在 recompute)
      let liveTotal = 0;
      if (validInsured) {
        const ins = getCurrentInsured();
        const sel = state.selections[cid];
        if (sel) {
          const company = state.db.companies.find(x => x.id === cid);
          if (sel.main && company) {
            const mp = company.mainProducts.find(mp => mp.code === sel.main.code);
            if (mp) liveTotal += calcProductFee(mp, ins.gender, ins.age, sel.main.period, sel.main.amount);
          }
          if (sel.riders && company) {
            sel.riders.forEach(r => {
              const rp = company.riderProducts.find(rp => rp.code === r.code);
              if (rp && !rp.autoFillFromCompanyTotal) {
                liveTotal += calcProductFee(rp, ins.gender, ins.age, r.period, r.amount);
              }
            });
          }
        }
      }
      amountInput = `<input type="number" class="prod-amount-input prod-amount-auto"
                     data-type="${type}" data-cid="${cid}" data-code="${p.code}"
                     value="${liveTotal}" readonly disabled
                     style="background:#f3f4f6; color:#666; cursor:not-allowed;"
                     title="自動帶入同公司其他商品年繳保費總和">`;
    } else if (p.amountMode === 'plan') {
      // 計畫下拉:value 保留「計劃一」(對應費率 key),顯示時去掉「計劃」字樣
      // 例如「計劃一」→ 顯示「一」,「計劃4A」→ 顯示「4A」,「HI-30」→ 顯示「HI-30」
      const planLabel = (s) => String(s).replace(/^計劃/, '');
      amountInput = `<select class="prod-amount" data-type="${type}" data-cid="${cid}" data-code="${p.code}">
        ${p.amountSuggestions.map(opt => `<option value="${opt}" ${opt === selAmount ? 'selected' : ''}>${planLabel(opt)}</option>`).join('')}
      </select>`;
      amountUnit = '計畫';
    } else if (p.amountMode === 'fixedAmount') {
      // 固定保額下拉
      amountInput = `<select class="prod-amount" data-type="${type}" data-cid="${cid}" data-code="${p.code}">
        ${p.amountSuggestions.map(opt => `<option value="${opt}" ${String(opt) === String(selAmount) ? 'selected' : ''}>${Number(opt).toLocaleString()}</option>`).join('')}
      </select>`;
    } else if (p.allowFreeInput) {
      // 數字保額自由輸入
      const listId = `dl-${cid}-${p.code}`;
      amountInput = `<input type="number" class="prod-amount-input" list="${listId}"
                     data-type="${type}" data-cid="${cid}" data-code="${p.code}"
                     value="${selAmount}" min="0" step="1">
                     <datalist id="${listId}">${p.amountSuggestions.map(o => `<option value="${o}">`).join('')}</datalist>`;
    } else {
      amountInput = `<select class="prod-amount" data-type="${type}" data-cid="${cid}" data-code="${p.code}">
        ${p.amountSuggestions.map(opt => `<option value="${opt}" ${String(opt) === String(selAmount) ? 'selected' : ''}>${opt}</option>`).join('')}
      </select>`;
    }

    // 連結圖示:優先用商品自己的 links,空字串時用公司的 linkTemplate(把 {code} 換成商品代碼)
    const company = state.db.companies.find(x => x.id === cid);
    const tmpl = company?.linkTemplate || {};
    const resolveLink = (key) => {
      const own = p.links?.[key];
      if (own) return own;
      const t = tmpl[key];
      if (!t) return '';
      // 模板未填(包含 YOUR_GITHUB_USERNAME 預留字)就視為未設定
      if (t.includes('YOUR_GITHUB_USERNAME')) return '';
      return t.replace(/\{code\}/g, p.code);
    };
    const linkBtn = (label, url, key) => {
      const dis = !url ? 'disabled' : '';
      // 用 data-tip 自製 tooltip,只顯示「商品代碼 + 標籤」(例如 "DCF · DM"),不洩漏網址
      const tip = url ? `${p.code} · ${label}` : `${p.code} · ${label} (尚未設定)`;
      return `<a class="pl-btn pl-${key} ${dis}" href="${url || '#'}" target="_blank" rel="noopener" data-tip="${tip}">${label}</a>`;
    };
    const links = `<div class="product-links">
      ${linkBtn('DM', resolveLink('dm'), 'dm')}
      ${linkBtn('條款', resolveLink('clause'), 'clause')}
      ${linkBtn('費率', resolveLink('rate'), 'rate')}
    </div>`;

    // 核保檢查:取得所有違規項目
    const insJob = state.lastJob ?? 1;
    const issues = validInsured && state.lastAge != null
      ? underwriteCheck(p, state.lastAge, insJob, selPeriod, selAmount)
      : [];
    const blocked = issues.some(i => i.severity === 'block');
    const ineligible = blocked;

    const feeDisplay = !validInsured
      ? '<span class="fee-pending">待輸入</span>'
      : ineligible
        ? `<span class="fee-ineligible" title="不符投保規則">不符規則</span>`
        : (isSelected ? `${fmt(fee)}<span class="product-fee-unit"> 元</span>` : '—');

    // 違規警告列(block 紅、warn 黃)
    let warnRows = '';
    if (issues.length > 0) {
      issues.forEach(i => {
        const cls = i.severity === 'block' ? 'uw-block' : 'uw-warn';
        const icon = i.severity === 'block' ? '🚫' : '⚠️';
        warnRows += `<div class="uw-row ${cls}">${icon} ${i.msg}</div>`;
      });
    }

    return `
    <div class="product-item ${isSelected ? 'selected' : ''} ${ineligible ? 'ineligible' : ''}">
      <input type="${inputType}" class="product-${inputType === 'radio' ? 'radio' : 'checkbox'} prod-toggle"
             ${inputName ? `name="${inputName}"` : ''}
             data-type="${type}" data-cid="${cid}" data-code="${p.code}"
             ${isSelected ? 'checked' : ''}
             ${ineligible ? 'disabled' : ''}>
      <div class="product-name">
        <div class="pn-main">${p.name}</div>
        <div>
          <span class="pn-code">${p.code}</span>
          ${p.category ? `<span class="pn-cat">${p.category}</span>` : ''}
          <span class="pn-age">投保 ${getAgeLimitText(p)}</span>
        </div>
      </div>
      <div class="product-period">${periodSel}</div>
      <div class="product-amount">${amountInput}</div>
      <div class="product-amount-unit">${p.autoFillFromCompanyTotal ? `${amountUnit}<small style="display:block;font-size:10px;color:#888;line-height:1;margin-top:2px;">自動帶入</small>` : amountUnit}</div>
      <div class="product-fee ${!isSelected || !validInsured || ineligible ? 'disabled' : ''}">${feeDisplay}</div>
      ${links}
      <button class="icon-btn no-print" onclick="App.openProductEditModal('${cid}','${type}','${p.code}')" title="編輯">✏️</button>
      ${warnRows ? `<div class="uw-warns" style="grid-column: 1 / -1;">${warnRows}</div>` : ''}
    </div>`;
  }

  function bindProductEvents() {
    // 勾選
    $$('.prod-toggle').forEach(el => {
      el.onchange = (e) => {
        const cid = e.target.dataset.cid;
        const code = e.target.dataset.code;
        const type = e.target.dataset.type;
        toggleProduct(cid, code, type, e.target.checked);
      };
    });
    // 期別
    $$('.prod-period').forEach(el => {
      el.onchange = (e) => updateProductField(e.target.dataset.cid, e.target.dataset.code, e.target.dataset.type, 'period', e.target.value);
    });
    // 保額(下拉)
    $$('.prod-amount').forEach(el => {
      el.onchange = (e) => {
        const v = e.target.value;
        const numVal = isNaN(parseFloat(v)) ? v : parseFloat(v);
        updateProductField(e.target.dataset.cid, e.target.dataset.code, e.target.dataset.type, 'amount', numVal);
      };
    });
    // 保額(自由輸入,使用 input 不立即重繪以保留焦點,改用 change 與 blur)
    $$('.prod-amount-input').forEach(el => {
      el.oninput = (e) => {
        const v = e.target.value;
        const numVal = isNaN(parseFloat(v)) ? v : parseFloat(v);
        updateProductFieldQuiet(e.target.dataset.cid, e.target.dataset.code, e.target.dataset.type, 'amount', numVal);
        recompute(false);  // 不重繪商品列表,只更新試算結果
        // 同時更新該行的 fee 顯示
        const row = e.target.closest('.product-item');
        if (row) {
          const ins = getCurrentInsured();
          if (hasValidInsured()) {
            const c = state.db.companies.find(c => c.id === e.target.dataset.cid);
            const list = e.target.dataset.type === 'main' ? c.mainProducts : c.riderProducts;
            const p = list.find(p => p.code === e.target.dataset.code);
            const sel = state.selections[c.id];
            const target = e.target.dataset.type === 'main' ? sel.main : sel.riders.find(r => r.code === e.target.dataset.code);
            if (target) {
              const fee = calcProductFee(p, ins.gender, ins.age, target.period, target.amount, true, ins.job);
              const feeEl = row.querySelector('.product-fee');
              if (feeEl) feeEl.innerHTML = `${fmt(fee)}<span class="product-fee-unit">元</span>`;
            }
          }
        }
        // ★ 同步更新「同公司自動帶入」商品(WRA / WRB)的 amount 顯示和 fee
        syncAutoFillRows(e.target.dataset.cid);
      };
      // ★ blur 或 change 時觸發完整重繪,讓警告列(超齡/超保額/體檢通知)即時顯示
      const fullUpdate = (e) => {
        const v = e.target.value;
        const numVal = isNaN(parseFloat(v)) ? v : parseFloat(v);
        updateProductField(e.target.dataset.cid, e.target.dataset.code, e.target.dataset.type, 'amount', numVal);
      };
      el.onblur = fullUpdate;
      el.onchange = fullUpdate;
    });
  }

  /** 同步「自動帶入保額」商品(WRA / WRB)的保額欄位與保費顯示
   *  在使用者修改其他商品(主約/附約)的保額時呼叫,讓 WRA/WRB 即時反映
   */
  function syncAutoFillRows(cid) {
    if (!hasValidInsured()) return;
    const ins = getCurrentInsured();
    const c = state.db.companies.find(x => x.id === cid);
    if (!c) return;
    const sel = state.selections[cid];
    if (!sel) return;

    // 計算同公司「非自動帶入」商品的當下年繳保費總和
    let total = 0;
    if (sel.main) {
      const mp = c.mainProducts.find(mp => mp.code === sel.main.code);
      if (mp) total += calcProductFee(mp, ins.gender, ins.age, sel.main.period, sel.main.amount);
    }
    sel.riders.forEach(r => {
      const rp = c.riderProducts.find(rp => rp.code === r.code);
      if (rp && !rp.autoFillFromCompanyTotal) {
        total += calcProductFee(rp, ins.gender, ins.age, r.period, r.amount);
      }
    });

    // 更新所有 autoFillFromCompanyTotal 的商品行
    c.riderProducts.forEach(p => {
      if (!p.autoFillFromCompanyTotal) return;
      // 同步 selections 內的 amount
      const r = sel.riders.find(rr => rr.code === p.code);
      if (r) r.amount = total;
      // 找對應 DOM 行,更新欄位顯示
      const inputEl = document.querySelector(`.prod-amount-input[data-cid="${cid}"][data-code="${p.code}"]`);
      if (inputEl) inputEl.value = total;
      // 更新保費(只有勾選的才需要更新)
      if (r) {
        const fee = calcProductFee(p, ins.gender, ins.age, r.period, total);
        const row = inputEl?.closest('.product-item');
        const feeEl = row?.querySelector('.product-fee');
        if (feeEl && row.classList.contains('selected')) {
          feeEl.innerHTML = `${fmt(fee)}<span class="product-fee-unit">元</span>`;
        }
      }
    });
  }

  function toggleProduct(cid, code, type, checked) {
    const c = state.db.companies.find(c => c.id === cid);
    if (!state.selections[cid]) state.selections[cid] = { main: null, riders: [] };
    const sel = state.selections[cid];
    if (type === 'main') {
      if (checked) {
        const p = c.mainProducts.find(p => p.code === code);
        sel.main = { code, period: p.defaultPeriod || p.periodOptions[0], amount: p.defaultAmount };
      } else {
        sel.main = null;
      }
    } else {
      if (checked) {
        const p = c.riderProducts.find(p => p.code === code);
        sel.riders.push({ code, period: p.defaultPeriod || p.periodOptions[0], amount: p.defaultAmount });
      } else {
        sel.riders = sel.riders.filter(r => r.code !== code);
      }
    }
    renderProductSection();
    recompute();
  }

  function updateProductField(cid, code, type, field, value) {
    if (!state.selections[cid]) state.selections[cid] = { main: null, riders: [] };
    const sel = state.selections[cid];
    let target = null;
    if (type === 'main') {
      // 若還沒選,自動選
      if (!sel.main || sel.main.code !== code) {
        toggleProduct(cid, code, type, true);
        return;
      }
      target = sel.main;
    } else {
      target = sel.riders.find(r => r.code === code);
      if (!target) {
        toggleProduct(cid, code, type, true);
        return;
      }
    }
    target[field] = value;
    renderProductSection();
    recompute();
  }

  function updateProductFieldQuiet(cid, code, type, field, value) {
    // 只更新資料,不重繪
    if (!state.selections[cid]) state.selections[cid] = { main: null, riders: [] };
    const sel = state.selections[cid];
    let target = null;
    if (type === 'main') {
      if (!sel.main || sel.main.code !== code) return;
      target = sel.main;
    } else {
      target = sel.riders.find(r => r.code === code);
    }
    if (target) target[field] = value;
  }

  function toggleAllMain(cid) {
    const sel = state.selections[cid];
    if (!sel) return;
    sel.main = null;
    renderProductSection();
    recompute();
  }
  function toggleAllRiders(cid) {
    const c = state.db.companies.find(c => c.id === cid);
    const sel = state.selections[cid];
    if (!sel) return;
    // 只考慮符合年齡資格的商品(超齡的不能投保)
    const age = state.lastAge;
    // ★ WRA/WRB 二擇一:有要保人才能選 WRA;沒要保人才能選 WRB
    const eligibleRiders = c.riderProducts.filter(p => {
      if (!isAgeEligible(p, age)) return false;
      if (p.code === 'WRA') return state.showProposer;
      if (p.code === 'WRB') return !state.showProposer;
      return true;
    });
    const allSelected = eligibleRiders.length > 0 && eligibleRiders.every(p => sel.riders.find(r => r.code === p.code));
    if (allSelected) {
      sel.riders = [];
    } else {
      sel.riders = eligibleRiders.map(p => ({
        code: p.code,
        period: p.defaultPeriod || p.periodOptions[0],
        amount: p.defaultAmount
      }));
    }
    renderProductSection();
    recompute();
  }

  // ── 試算結果 ──
  /** 把當前 selections 轉為 rows 陣列(供曲線重繪走勢圖用) */
  function collectRows() {
    if (!hasValidInsured()) return null;
    const ins = getCurrentInsured();
    const rows = [];
    state.db.companies.forEach(c => {
      const sel = state.selections[c.id];
      if (!sel) return;
      if (sel.main) {
        const p = c.mainProducts.find(p => p.code === sel.main.code);
        if (p) {
          const fee = calcProductFee(p, ins.gender, ins.age, sel.main.period, sel.main.amount);
          rows.push({ company: c.shortName, companyId: c.id, type: '主約', product: p, period: sel.main.period, amount: sel.main.amount, fee, startAge: ins.age });
        }
      }
      sel.riders.forEach(r => {
        const p = c.riderProducts.find(p => p.code === r.code);
        if (p) {
          const fee = calcProductFee(p, ins.gender, ins.age, r.period, r.amount);
          rows.push({ company: c.shortName, companyId: c.id, type: '附約', product: p, period: r.period, amount: r.amount, fee, startAge: ins.age });
        }
      });
    });
    return rows;
  }

  // ════════════════════════════════════════════════════════════
  // 要保人豁免保費附約 — 計算與 UI
  // ════════════════════════════════════════════════════════════

  /** 取得「主約」row(用於比率制計算的基底)
   *  若有多個主約 → 取保費最高那一張(實務上豁免費率以最大主約為基)
   */
  function getPrimaryMainRow(rows) {
    const mains = rows.filter(r => r.type === '主約');
    if (mains.length === 0) return null;
    return mains.reduce((max, r) => (r.fee > max.fee ? r : max), mains[0]);
  }

  // ════════════════════════════════════════════════════════════════════════
  // 全球人壽 XWA / XWB 豁免保費 — 完整精算公式(逐附約計算)
  // 公式來源:全球人壽官方試算表(2026/04/13 版)反推
  //
  // 單張險種 XWA 豁免年繳 = ROUND(
  //   ROUND(G × P × Q / 100000, 2) × 主約繳別係數,
  //   0
  // )
  //
  // 變數定義:
  //   G = 該險種年繳保費(含高保額,不含繳法折讓)
  //   P = XWA 費率(查 XWA{age}{M|F} 表,index 為「該險種剩餘繳費年期」)
  //   Q = NPV 比值(平準費率 → 1.0,自然費率 → > 1)
  //
  // Q 公式(備忘錄筆誤已修正:XWv^(n-1) → XWv^n):
  //   Q = ROUND(
  //     (0.5 × D₁ × XWv^0.5 + NPV(0.01, D₂..D₁₂₀)) /
  //     (0.5 × D₁ × XWv^0.5 + D₁ × (1 - XWv^n) / (0.01 × XWv) × XWv),
  //     5
  //   )
  //   D₁..D₁₂₀ = 該險種逐年單位表定保費(超過實際繳費年期 → 0)
  //   XWv = 0.99009900990099(預定折現因子,= 1/1.01)
  //
  // 最終總 XWA 豁免年繳 = 所有險種(主約+附約)的單張 XWA 加總
  // ════════════════════════════════════════════════════════════════════════

  const XWA_CONSTANTS = {
    XWv: 0.99009900990099,
    PREDICT_RATE: 0.01,
    MIN_AGE: 20,
    MAX_AGE: 69,
    MAX_RENEW_AGE: 74,
    MIN_COVERAGE: 10000,
    MAX_COVERAGE: 2000000,
    PAYMENT_FACTOR: { '年繳': 1, '半年繳': 0.52, '季繳': 0.262, '月繳': 0.088 }
  };

  /** 從費率表中查 value;若該 age 沒有,取最接近(對等於小於該年齡的最大 key) */
  function pickRateByAge(rateMap, age) {
    if (!rateMap) return 0;
    if (rateMap[String(age)] != null) return rateMap[String(age)];
    // 找最接近的較小年齡(費率表用「投保年齡」當分組 key)
    const ages = Object.keys(rateMap).map(Number).sort((a, b) => a - b);
    let pick = ages[0];
    for (const k of ages) {
      if (k <= age) pick = k;
      else break;
    }
    return rateMap[String(pick)] || 0;
  }

  /** 計算單張險種的「逐年單位表定保費序列」與 P, Q
   *  輸入:row(含 product, period, amount, fee, startAge), insGender, insAge, n_pay(該險種剩餘繳費年期)
   *  輸出:{ G, P, Q, isLevelRate, fallback, debugInfo }
   *
   *  G = 該險種年繳保費(用 row.fee 直接代;這是已含保額的金額)
   *  P = XWA 費率(從 XWA{proposerAge}{M|F} 表查,index = n_pay)
   *  Q = NPV 比(平準費率 = 1.0)
   */
  function computeRiderXwaParts(row, proposerAge, proposerGender, n_pay) {
    if (typeof WAIVER_PREM_DB === 'undefined') {
      return { G: row.fee, P: 0, Q: 1, isLevelRate: true, fallback: true, reason: 'WAIVER_PREM_DB 未載入' };
    }
    const db = WAIVER_PREM_DB;
    const code = row.product.code;
    const insGender = row._insGender || 'M';
    const insAge = row.startAge != null ? row.startAge : 0;

    // ── 步驟 1:查 P(XWA 費率)── //
    const xwaKey = `${state.waiver.productCode || 'XWA'}${proposerAge}${proposerGender}`;
    const xwaRow = db[xwaKey];
    let P = 0;
    if (xwaRow) {
      let lookupN = n_pay;
      const allKeys = Object.keys(xwaRow).map(Number);
      const maxKey = Math.max.apply(null, allKeys);
      if (lookupN > maxKey) lookupN = maxKey;
      P = xwaRow[String(lookupN)] || 0;
    }

    // ── 步驟 2:取得「該險種逐年單位表定保費」序列 D₁..D₁₂₀ ── //
    const isLevel = row.product.rateType === 'level';
    const G = row.fee;

    // 解析 row 對應的 DB key(主表 + 續年表,若有)
    const dbKeyInfo = resolveWaiverDbKey(row, insGender);
    if (!dbKeyInfo || !dbKeyInfo.primary) {
      // 沒有費率資料 → fallback: Q=1
      return {
        G, P, Q: 1, isLevelRate: false,
        fallback: true,
        reason: `${code} 缺費率資料,Q 退化為 1.0`
      };
    }

    const ratesMap = db[dbKeyInfo.primary];
    const ratesMap2 = dbKeyInfo.secondary ? db[dbKeyInfo.secondary] : null;
    if (!ratesMap) {
      return {
        G, P, Q: 1, isLevelRate: false,
        fallback: true,
        reason: `${code} 對應 key (${dbKeyInfo.primary}) 不存在`
      };
    }

    // 平準費率 → Q=1,不需要算 NPV
    if (isLevel) {
      return { G, P, Q: 1, isLevelRate: true, fallback: false };
    }

    // 自然費率 → 算 D 序列 + Q
    const D_seq = buildDseq(ratesMap, ratesMap2, insAge, n_pay, false);
    const Q = computeQ(D_seq, n_pay);
    return { G, P, Q, isLevelRate: false, fallback: false };
  }

  /** 把 row 對應到 WAIVER_PREM_DB 的 key
   *  回傳 { primary, secondary }:
   *    primary = 主表(首年/平準) key
   *    secondary = 續年費率 key(僅 XCF / XHC 等首/續分開的商品有)
   *  覆蓋:DCF / XDE / XHD / NIR / XHO / XCF / XAB / XCG / XTK / XMBN
   */
  function resolveWaiverDbKey(row, insGender) {
    const code = row.product.code;
    const G = insGender;
    const period = row.period || '';
    const periodNumMatch = period.match(/(\d+)/);
    const periodNum = periodNumMatch ? periodNumMatch[1] : '';
    const amount = row.amount;

    // 主約 DCF / DCE
    if (code === 'DCF' || code === 'DCE') {
      return { primary: `${code}${periodNum}${G}`, secondary: null };
    }
    // XDE 重大傷病一年期
    if (code === 'XDE') return { primary: `XDE${G}`, secondary: null };

    // XHD 計畫制(計劃一/二/三/四 → 01/02/03/04)
    if (code === 'XHD') {
      const planMap = { '計劃一': '01', '計劃二': '02', '計劃三': '03', '計劃四': '04' };
      const p = planMap[amount] || '01';
      return { primary: `XHD${p}${G}00`, secondary: null };
    }

    // NIR 健康附約(JSON 按年期分:5/10/20/30/40,但 1 年期附約用 5 為預設)
    if (code === 'NIR') {
      return { primary: `NIR05${G}`, secondary: null };
    }

    // XHO 自負額計畫:計劃 1A / 2A / 3A / 4A / 1B / 2B / 3B / 1C / 2C
    if (code === 'XHO') {
      const m = (amount || '').match(/(\d[A-C])/);
      if (m) return { primary: `XHO${m[1]}${G}`, secondary: null };
      return { primary: null, secondary: null };
    }

    // XCF 癌症一次金 — 首/續年雙費率
    if (code === 'XCF') {
      return { primary: `XCF${G}`, secondary: `XCF${G}2` };
    }

    // XCG 防癌療程 — 首/續年雙費率
    if (code === 'XCG') {
      return { primary: `XCG${G}`, secondary: `XCG${G}2` };
    }

    // XTK 守護童心定期壽險(自然費率,單表)
    if (code === 'XTK') {
      return { primary: `XTK${G}`, secondary: null };
    }

    // XMBN 新傷害醫療(平準費率,依職業等級 + 保額萬倍)
    if (code === 'XMBN') {
      const job = row._jobLevel || 1;
      return { primary: `XMBN${job}`, secondary: null };
    }

    // XAB 意外失能(依職業等級)
    if (code === 'XAB') {
      // 從 row 拿職業等級;若沒有,用預設(被保險人職業)
      const job = row._jobLevel || 1;
      return { primary: `XAB${job}`, secondary: null };
    }

    // 沒有費率資料的商品
    return { primary: null, secondary: null };
  }

  /** 建立 D₁..D₁₂₀ 序列:Dᵢ = 該險種第 i 年單位表定保費(超過繳費年期 = 0)
   *  ratesMap:WAIVER_PREM_DB[dbKey] 的 「投保年齡 → 費率」對照(首年/平準用)
   *  ratesMap2:續年費率(僅 XCF/XHC 有,首年用 ratesMap,第 2 年起用此表)
   *  insAge:該險種投保時的被保險人年齡(= row.startAge)
   *  n_pay:該險種剩餘繳費年期
   *  isLevel:平準費率 → 整段都填 D1;自然費率 → 逐年用不同年齡查表
   *
   *  ★ 邊界:填到 D[n_pay+1](共 n_pay+1 個非零值),這是 Excel 試算表的計算習慣
   *    讓平準費率 Q 嚴格 = 1.0000
   */
  function buildDseq(ratesMap, ratesMap2, insAge, n_pay, isLevel) {
    const seq = new Array(120).fill(0);
    if (!ratesMap) return seq;
    const D1 = pickRateByAge(ratesMap, insAge);
    const fillCount = Math.min(n_pay + 1, 120);
    for (let i = 0; i < fillCount; i++) {
      if (isLevel) {
        seq[i] = D1;
      } else if (i === 0) {
        seq[i] = D1;
      } else if (ratesMap2) {
        seq[i] = pickRateByAge(ratesMap2, insAge + i);
      } else {
        seq[i] = pickRateByAge(ratesMap, insAge + i);
      }
    }
    return seq;
  }

  /** 計算 Q(NPV 比)— 修正版 */
  function computeQ(D_seq, n_pay) {
    const XWv = XWA_CONSTANTS.XWv;
    const D1 = D_seq[0] || 0;
    if (D1 === 0 || n_pay <= 0) return 1;

    // NPV(0.01, D₂..D₁₂₀) = Σ D[i] / 1.01^i, i = 1..119
    let npv = 0;
    for (let i = 1; i < 120; i++) {
      npv += D_seq[i] / Math.pow(1.01, i);
    }

    const halfWv = Math.pow(XWv, 0.5);
    const num = 0.5 * D1 * halfWv + npv;
    const denom = 0.5 * D1 * halfWv + D1 * (1 - Math.pow(XWv, n_pay)) / (0.01 * XWv) * XWv;

    if (denom === 0) return 1;
    return Math.round((num / denom) * 100000) / 100000;
  }

  /** 推算「該險種剩餘繳費年期 n_pay」
   *  - 主約 DCF:periodOptions 內含「30年期」 → n_pay 從 row.period 取數字,若 0 歲投保 30 年期 → 30
   *  - 自然費率附約(XHD/XHO/XCF/XDE/NIR/XAB/...):每年一年期,但「累計可繳到 maxAgeContinuous」
   *    n_pay = maxAgeContinuous - startAge(若有 maxAgeContinuous)
   *  - 預設:不超過 30
   */
  function getRiderRemainingPayYears(row) {
    const product = row.product;
    const startAge = row.startAge != null ? row.startAge : 0;

    // 1. 主約 DCF / DCE:從 period 字串抓數字
    if (row.type === '主約' && row.period) {
      const m = row.period.match(/(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
    // 2. 附約:看 maxAgeContinuous
    if (product.maxAgeContinuous != null) {
      return Math.max(1, product.maxAgeContinuous - startAge);
    }
    // 3. 1 年期附約預設 1(實際情況 Q 會接近 1)
    return 1;
  }

  /** 全方案 XWA 豁免保費計算(逐附約累加)
   *  輸入:rows(已排除 isWaiver 的清單)
   *  輸出:{ totalFee, breakdown, hasFallback, fallbackCodes }
   */
  function computeWaiverFeeFull(rows, proposerAge, proposerGender, insGender, insJob, paymentMode) {
    const baseRows = rows.filter(r => !r.isWaiver);
    const breakdown = [];
    let total = 0;
    const fallbackCodes = [];
    const paymentFactor = XWA_CONSTANTS.PAYMENT_FACTOR[paymentMode || '年繳'] || 1;

    for (const row of baseRows) {
      // 注入被保險人性別 / 職業給 resolveWaiverDbKey 用
      row._insGender = insGender;
      row._jobLevel = insJob || 1;
      const n_pay = getRiderRemainingPayYears(row);
      const parts = computeRiderXwaParts(row, proposerAge, proposerGender, n_pay);

      const inner = Math.round(parts.G * parts.P * parts.Q / 100000 * 100) / 100;
      const riderFee = Math.round(inner * paymentFactor);

      total += riderFee;
      breakdown.push({
        code: row.product.code,
        name: row.product.shortName || row.product.name,
        type: row.type,
        G: parts.G,
        P: parts.P,
        Q: parts.Q,
        n_pay,
        fee: riderFee,
        fallback: parts.fallback || false,
        isLevelRate: parts.isLevelRate
      });
      if (parts.fallback) fallbackCodes.push(row.product.code);
    }

    return { totalFee: total, breakdown, hasFallback: fallbackCodes.length > 0, fallbackCodes };
  }

  /** 計算豁免保費(主入口)
   *  支援三種模式:
   *    auto         → 用完整公式逐附約計算
   *    manual_rate  → 使用者手動填費率(每萬元)
   *    manual_premium → 使用者直接填年繳保費
   */
  function computeWaiverFee(rows) {
    if (!state.waiver.enabled) return null;

    let warning = null;
    let fee = 0;
    let coverage = 0;
    let coverageWan = 0;
    let ratePerWan = 0;
    let mode = 'auto';
    let breakdown = null;
    let fallbackCodes = [];

    // 計算保額 = 其他險種年繳保費總和(不含 XWA 本身)
    const baseRows = rows.filter(r => !r.isWaiver);
    coverage = baseRows.reduce((sum, r) => sum + r.fee, 0);
    if (coverage < XWA_CONSTANTS.MIN_COVERAGE) coverage = XWA_CONSTANTS.MIN_COVERAGE;
    if (coverage > XWA_CONSTANTS.MAX_COVERAGE) {
      warning = '⚠️ 累積保額已達 200 萬上限(超過部分不計入豁免保額)';
      coverage = XWA_CONSTANTS.MAX_COVERAGE;
    }
    coverageWan = coverage / 10000;

    // 取得要保人(豁免的「被保險人」是要保人本人)
    const proposer = getCurrentProposer();
    const ins = getCurrentInsured();
    const insGender = ins.gender || 'M';

    if (!state.showProposer || !proposer || proposer.age === null) {
      warning = warning || '⚠️ 啟用 XWA 需先在「投保人員資料」開啟「輸入要保人資料」並填入要保人年齡/性別';
    } else if (proposer.age < XWA_CONSTANTS.MIN_AGE || proposer.age > XWA_CONSTANTS.MAX_AGE) {
      warning = `⚠️ 要保人年齡 ${proposer.age} 歲不在 XWA 投保範圍(20~69 歲),實際請洽核保`;
    } else if (proposer.job > 4) {
      warning = `⚠️ 要保人職業 ${proposer.job} 級超過 XWA 承保範圍(限 1-4 級),實際請洽核保`;
    }

    // 計算保費
    if (state.waiver.manualPremium > 0) {
      // 模式 1:使用者直接填年繳保費 — 完全覆寫
      fee = state.waiver.manualPremium;
      mode = 'manual_premium';
      ratePerWan = coverageWan > 0 ? Math.round(fee / coverageWan) : 0;
    } else if (state.waiver.ratePerWan && state.waiver.ratePerWan > 0) {
      // 模式 2:使用者手動填費率(元/萬)
      ratePerWan = parseFloat(state.waiver.ratePerWan);
      fee = Math.round(coverageWan * ratePerWan);
      mode = 'manual_rate';
    } else if (proposer && proposer.age >= XWA_CONSTANTS.MIN_AGE && proposer.age <= XWA_CONSTANTS.MAX_RENEW_AGE) {
      // 模式 3:用完整公式逐附約計算
      const proposerGender = proposer.gender || 'M';
      const result = computeWaiverFeeFull(rows, proposer.age, proposerGender, insGender, ins.job || 1, '年繳');
      fee = result.totalFee;
      breakdown = result.breakdown;
      fallbackCodes = result.fallbackCodes;
      ratePerWan = coverageWan > 0 ? Math.round(fee / coverageWan) : 0;
      mode = 'auto';

      if (result.hasFallback) {
        const codeNames = Array.from(new Set(fallbackCodes)).join('、');
        const fbWarn = `⚠️ ${codeNames} 缺費率原始資料,該附約以 Q=1 估算(可能略低於建議書值)`;
        warning = warning ? warning + '\n' + fbWarn : fbWarn;
      }
    }

    // 商品結構(模擬 row 用)
    const company = baseRows[0] ? baseRows[0].company : '全球人壽';
    const companyId = baseRows[0] ? baseRows[0].companyId : '';
    const productCode = state.waiver.productCode || 'XWA';
    const productName = productCode === 'XWB'
      ? '臻鑫久久豁免保險費保險附約(B型)'
      : '臻鑫久久豁免保險費保險附約(A型)';
    const product = {
      code: productCode,
      name: productName,
      shortName: `豁免保費 ${productCode}`,
      category: '豁免保費附約',
      rateType: 'natural',
      isWaiver: true
    };

    return {
      fee, coverage, coverageWan, ratePerWan, mode,
      company, companyId, product,
      period: '一年期',
      amount: `${coverageWan.toLocaleString()} 萬`,
      warning,
      breakdown,         // 逐附約明細(auto 模式才有)
      fallbackCodes
    };
  }

  /** 渲染豁免區塊 UI — body 顯示/隱藏、警告、計算結果 */
  function renderWaiverUI(rows, info) {
    const body = $('#waiverBody');
    if (!body) return;
    body.style.display = state.waiver.enabled ? '' : 'none';
    if (!state.waiver.enabled) return;

    // 警告訊息(可多行,用 innerHTML 換行)
    const warnEl = $('#waiverWarning');
    if (info && info.warning) {
      warnEl.innerHTML = String(info.warning).split('\n').map(s =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      ).join('<br>');
      warnEl.style.display = '';
    } else {
      warnEl.style.display = 'none';
    }

    // 結果顯示
    const resultEl = $('#waiverResult');
    if (info && info.fee > 0) {
      const modeText = {
        'auto': '<span class="waiver-mode-tag">完整精算公式</span>',
        'manual_rate': '<span class="waiver-mode-tag">手動填寫費率</span>',
        'manual_premium': '<span class="waiver-mode-tag">直接指定年繳</span>'
      }[info.mode] || '';

      // 逐附約明細(僅 auto 模式有 breakdown)
      let breakdownHtml = '';
      if (info.mode === 'auto' && Array.isArray(info.breakdown) && info.breakdown.length > 0) {
        const rowsHtml = info.breakdown.map(b => {
          const rateTypeTag = b.isLevelRate
            ? '<span style="color:#888">平準</span>'
            : '<span style="color:#0a7">自然</span>';
          const fbTag = b.fallback
            ? '<span style="color:#c70" title="缺費率資料,Q=1 估算"> ⚠</span>'
            : '';
          return `<tr>
            <td>${b.type}</td>
            <td><b>${b.code}</b> ${b.name}${fbTag}</td>
            <td style="text-align:right">${fmt(Math.round(b.G))}</td>
            <td style="text-align:right">${b.P}</td>
            <td style="text-align:right">${b.Q.toFixed(4)}</td>
            <td style="text-align:right">${rateTypeTag}</td>
            <td style="text-align:right"><b>${fmt(b.fee)}</b></td>
          </tr>`;
        }).join('');
        breakdownHtml = `
          <details class="waiver-breakdown" style="margin-top:8px">
            <summary style="cursor:pointer; user-select:none; font-size:13px; color:#555">
              🔍 展開逐附約計算明細(${info.breakdown.length} 張險種)
            </summary>
            <div style="margin-top:8px; overflow-x:auto">
              <table style="width:100%; font-size:12px; border-collapse:collapse">
                <thead>
                  <tr style="background:#f5f5f5">
                    <th style="padding:4px 6px; text-align:left">類型</th>
                    <th style="padding:4px 6px; text-align:left">商品</th>
                    <th style="padding:4px 6px; text-align:right">G(年繳)</th>
                    <th style="padding:4px 6px; text-align:right">P(費率)</th>
                    <th style="padding:4px 6px; text-align:right">Q(NPV比)</th>
                    <th style="padding:4px 6px; text-align:right">類型</th>
                    <th style="padding:4px 6px; text-align:right">XWA 年繳</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
              <div style="margin-top:6px; font-size:11px; color:#888">
                公式:單張 XWA = ROUND(ROUND(G × P × Q / 100000, 2) × 主約繳別係數, 0)
              </div>
            </div>
          </details>`;
      }

      resultEl.innerHTML = `
        ${modeText}
        <div class="waiver-result-line">
          📦 <b>保額</b>:${fmt(info.coverage)} 元(= 其他險種年繳合計,約 ${info.coverageWan.toLocaleString()} 萬)
        </div>
        <div class="waiver-result-line">
          💰 <b>等效費率</b>:每萬元年繳 ${fmt(info.ratePerWan)} 元
        </div>
        <div class="waiver-result-final">
          🛡️ <b>豁免保費年繳:${fmt(info.fee)} 元</b>(已加入總保費)
        </div>
        ${breakdownHtml}
      `;
      resultEl.style.display = '';
    } else if (info) {
      resultEl.innerHTML = `🛡️ 請先填入要保人年齡 / 性別,並選擇至少一張險種`;
      resultEl.style.display = '';
    }
  }

  /** 綁定豁免區塊事件(只綁一次)*/
  function bindWaiverEvents() {
    const enabledEl = $('#waiverEnabled');
    if (!enabledEl) return;

    enabledEl.checked = state.waiver.enabled;
    enabledEl.onchange = (e) => {
      state.waiver.enabled = e.target.checked;
      recompute();
    };

    $('#waiverManualRate').oninput = (e) => {
      const v = parseFloat(e.target.value);
      state.waiver.ratePerWan = (isNaN(v) || v <= 0) ? null : v;
      recompute();
    };
    $('#waiverManualPremium').oninput = (e) => {
      const v = parseInt(e.target.value);
      state.waiver.manualPremium = (isNaN(v) || v < 0) ? 0 : v;
      recompute();
    };
  }

  function recompute(updateChart = true) {
    if (!hasValidInsured()) {
      $('#resultCard').style.display = 'none';
      $('#chartCard').style.display = 'none';
      $('#benefitsCard').style.display = 'none';
      $('#adviceArea').innerHTML = '';
      return;
    }
    const ins = getCurrentInsured();
    const rows = [];
    let total = 0;

    state.db.companies.forEach(c => {
      const sel = state.selections[c.id];
      if (!sel) return;
      if (sel.main) {
        const p = c.mainProducts.find(p => p.code === sel.main.code);
        if (p) {
          const fee = calcProductFee(p, ins.gender, ins.age, sel.main.period, sel.main.amount);
          rows.push({ company: c.shortName, companyId: c.id, type: '主約', product: p, period: sel.main.period, amount: sel.main.amount, fee, startAge: ins.age });
          total += fee;
        }
      }
      // 第一遍:先處理「非自動帶入」的附約,計算其保費
      const autoFillRiders = [];
      sel.riders.forEach(r => {
        const p = c.riderProducts.find(p => p.code === r.code);
        if (!p) return;
        if (p.autoFillFromCompanyTotal) {
          // 暫存,稍後算完同公司其他商品總和再處理
          autoFillRiders.push({ r, p });
          return;
        }
        const fee = calcProductFee(p, ins.gender, ins.age, r.period, r.amount);
        rows.push({ company: c.shortName, companyId: c.id, type: '附約', product: p, period: r.period, amount: r.amount, fee, startAge: ins.age });
        total += fee;
      });

      // 第二遍:處理 autoFillFromCompanyTotal 商品(WRA / WRB)
      // 保額 = 同公司其他商品(主約+附約)年繳保費總和(單位:元)
      if (autoFillRiders.length > 0) {
        const sameCompanyTotal = rows
          .filter(row => row.companyId === c.id)
          .reduce((sum, row) => sum + (row.fee || 0), 0);
        autoFillRiders.forEach(({ r, p }) => {
          // 自動覆寫保額(單位:元)
          r.amount = sameCompanyTotal;
          const fee = calcProductFee(p, ins.gender, ins.age, r.period, sameCompanyTotal);
          rows.push({ company: c.shortName, companyId: c.id, type: '附約', product: p, period: r.period, amount: sameCompanyTotal, fee, startAge: ins.age });
          total += fee;
        });
      }
    });

    // ── 豁免保費附約(若啟用,以 row 形式加入)──
    const waiverInfo = computeWaiverFee(rows);
    if (waiverInfo && waiverInfo.fee > 0) {
      const proposer = getCurrentProposer();
      rows.push({
        company: waiverInfo.company,
        companyId: waiverInfo.companyId,
        type: '附約',
        product: waiverInfo.product,
        period: waiverInfo.period,
        amount: waiverInfo.amount,
        fee: waiverInfo.fee,
        startAge: ins.age,                          // 走勢圖跟著被保險人年齡走
        isWaiver: true,
        // ── 豁免特殊資料:用於走勢圖逐年計算 ──
        waiverProposerAge: proposer ? proposer.age : null,
        waiverProposerGender: proposer ? proposer.gender : 'M',
        waiverCoverage: waiverInfo.coverage,
        waiverManualOverride: state.waiver.manualPremium > 0 || state.waiver.ratePerWan != null
      });
      total += waiverInfo.fee;
    }
    // 更新豁免 UI 顯示(放在 push 之後,讓 UI 顯示最新計算結果)
    renderWaiverUI(rows, waiverInfo);

    if (rows.length === 0) {
      $('#resultCard').style.display = 'none';
      $('#chartCard').style.display = 'none';
      $('#benefitsCard').style.display = 'none';
      $('#adviceArea').innerHTML = '';
      return;
    }
    $('#resultCard').style.display = '';
    $('#chartCard').style.display = '';

    // 表格
    const tbody = $('#resultTbody');
    tbody.innerHTML = rows.map(r => {
      let amtNum, amtUnit;
      if (r.isWaiver) {
        // 豁免保費附約:期別欄顯示「同主約」,金額欄顯示計算依據
        amtNum = String(r.amount);
        amtUnit = '';
      } else if (r.product.amountMode === 'plan') {
        amtNum = String(r.amount).replace(/^計劃/, '');  // 「計劃一」→ 「一」
        amtUnit = '計畫';
      } else if (r.product.amountMode === 'fixedAmount') {
        amtNum = Number(r.amount).toLocaleString();
        amtUnit = r.product.amountUnit || '';
      } else {
        amtNum = Number(r.amount).toLocaleString();
        amtUnit = r.product.amountUnit || '';
      }
      return `<tr class="${r.type === '主約' ? 'main-row' : ''}${r.isWaiver ? ' waiver-row' : ''}">
        <td>${r.product.name}<span style="font-size:11px;color:var(--gray);margin-left:6px;">(${r.product.code})</span></td>
        <td class="center">${r.period}</td>
        <td class="amt-num">${amtNum}</td>
        <td class="amt-unit">${amtUnit}</td>
        <td>${ins.name || '被保險人'}</td>
        <td class="center"><span class="tag ${r.type === '主約' ? 'tag-warn' : ''}">${r.type}</span></td>
        <td class="fee">${fmt(r.fee)} 元</td>
      </tr>`;
    }).join('');

    $('#totalAnnual').textContent = fmt(total);

    // 分期繳:逐商品計算再加總(與保險公司實際計算方式一致)
    let halfTotal = 0, quarterTotal = 0, monthlyTotal = 0;
    rows.forEach(r => {
      halfTotal += Math.round(r.fee * 0.520);
      quarterTotal += Math.round(r.fee * 0.262);
      monthlyTotal += Math.round(r.fee * 0.088);
    });
    $('#totalHalf').textContent = fmt(halfTotal);
    $('#totalQuarter').textContent = fmt(quarterTotal);
    $('#totalMonthly').textContent = fmt(monthlyTotal);
    $('#footerTotal').textContent = fmt(total) + ' 元';

    if (updateChart) drawChart(rows, ins);
    renderBenefits(rows);
    renderAdvice(rows);

    // 累計核保檢查(醫療日額累計上限等)
    renderAggregateUnderwriteCheck(ins);

    // 責任曲線:更新商品勾選清單與預覽
    renderCurveCard(ins);
  }

  /** 顯示累計核保檢查結果(渲染到 #resultCard 上方的提示區) */
  function renderAggregateUnderwriteCheck(ins) {
    const issues = aggregateUnderwriteCheck(state.selections, state.db, ins.age);
    const wrap = $('#aggregateCheck');
    if (!wrap) return;
    if (issues.length === 0) {
      wrap.innerHTML = '';
      wrap.style.display = 'none';
      return;
    }
    wrap.style.display = '';
    wrap.innerHTML = issues.map(i => {
      const cls = i.severity === 'block' ? 'agg-block' : 'agg-warn';
      return `<div class="agg-row ${cls}">
        <div class="agg-msg">${i.msg}</div>
        ${i.detail ? `<div class="agg-detail">${i.detail}</div>` : ''}
      </div>`;
    }).join('');
  }

  // ──────── 責任曲線:UI 渲染與事件 ────────

  function renderCurveCard(ins) {
    const card = $('#curveCard');
    if (!card) return;
    // 沒有選任何商品 → 隱藏
    const products = getAllSelectedProducts();
    if (products.length === 0 || !ins || ins.age == null) {
      card.style.display = 'none';
      return;
    }
    card.style.display = '';

    // 商品分兩組:自然費率(逐年漲) vs 平準費率(不變)
    const natural = products.filter(p => p.rateType === 'natural');
    const level = products.filter(p => p.rateType === 'level');

    const renderGroup = (groupProducts, groupKey, groupLabel, groupIcon, groupDesc) => {
      if (groupProducts.length === 0) return '';
      const allChecked = groupProducts.every(p => state.curve.products[p.key]);
      const items = groupProducts.map(p => {
        const checked = !!state.curve.products[p.key];
        return `<label class="curve-product-item ${checked ? 'checked' : ''}">
          <input type="checkbox" data-curve-product="${p.key}" ${checked ? 'checked' : ''}>
          <span class="cpi-name">${p.name}</span>
          <span class="cpi-code">${p.code} · ${p.type}</span>
        </label>`;
      }).join('');
      return `<div class="curve-product-group">
        <div class="curve-group-header">
          <button class="curve-group-toggle" data-group-toggle="${groupKey}" type="button">
            ${allChecked ? '☑ 取消全選' : '☐ 全部選取'}
          </button>
          <span class="curve-group-label">${groupIcon} ${groupLabel}</span>
          <span class="curve-group-desc">${groupDesc}</span>
        </div>
        <div class="curve-products-list">${items}</div>
      </div>`;
    };

    const list = $('#curveProductsList');
    list.innerHTML =
      renderGroup(natural, 'natural', '自然費率', '📈',
        '逐年隨年齡上漲 — 責任曲線效益最大') +
      renderGroup(level, 'level', '平準費率', '🎯',
        '投保時鎖定不變 — 責任曲線效益較小,主約/意外險建議不調');

    // 綁定勾選事件
    list.querySelectorAll('input[data-curve-product]').forEach(cb => {
      cb.onchange = (e) => {
        const key = e.target.dataset.curveProduct;
        if (e.target.checked) {
          state.curve.products[key] = true;
        } else {
          delete state.curve.products[key];
        }
        e.target.closest('.curve-product-item').classList.toggle('checked', e.target.checked);
        // 更新所屬群組的全選按鈕標籤
        updateGroupToggleLabels();
        renderCurvePreview(ins);
        if (state.curve.enabled) {
          const rows = collectRows();
          if (rows) {
            drawChart(rows, ins);
            renderBenefits(rows);
          }
        }
      };
    });

    // 群組全選按鈕
    list.querySelectorAll('[data-group-toggle]').forEach(btn => {
      btn.onclick = () => {
        const groupKey = btn.dataset.groupToggle;
        const targetGroup = groupKey === 'natural' ? natural : level;
        const allChecked = targetGroup.every(p => state.curve.products[p.key]);
        targetGroup.forEach(p => {
          if (allChecked) {
            delete state.curve.products[p.key];
          } else {
            state.curve.products[p.key] = true;
          }
        });
        // 更新該群組所有 checkbox + label 樣式
        targetGroup.forEach(p => {
          const cb = list.querySelector(`input[data-curve-product="${p.key}"]`);
          if (cb) {
            cb.checked = !allChecked;
            cb.closest('.curve-product-item').classList.toggle('checked', !allChecked);
          }
        });
        updateGroupToggleLabels();
        renderCurvePreview(ins);
        if (state.curve.enabled) {
          const rows = collectRows();
          if (rows) {
            drawChart(rows, ins);
            renderBenefits(rows);
          }
        }
      };
    });

    function updateGroupToggleLabels() {
      [['natural', natural], ['level', level]].forEach(([key, grp]) => {
        const btn = list.querySelector(`[data-group-toggle="${key}"]`);
        if (btn) {
          const allChecked = grp.length > 0 && grp.every(p => state.curve.products[p.key]);
          btn.textContent = allChecked ? '☑ 取消全選' : '☐ 全部選取';
        }
      });
    }

    // 開關狀態
    const sw = $('#curveEnabled');
    sw.checked = state.curve.enabled;
    $('#curveLabel').textContent = state.curve.enabled ? '已啟用' : '未啟用';
    $('#curveBody').style.display = state.curve.enabled ? '' : 'none';

    // 同步輸入框
    $('#curveStartAge').value = state.curve.startAge;
    $('#curvePeriod').value = state.curve.period;
    $('#curveStep').value = state.curve.step;
    $('#curveFloor').value = state.curve.floor;

    // 智慧推薦按鈕的 active 狀態
    document.querySelectorAll('.curve-preset').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.preset === state.curve.preset);
    });

    // 推薦說明區塊
    const descEl = $('#curvePresetDesc');
    if (descEl) {
      if (state.curve.preset && state.curve.preset !== 'custom') {
        const presets = calculatePresets(ins.age);
        const p = presets[state.curve.preset];
        if (p) {
          descEl.style.display = '';
          descEl.innerHTML = `
            <div class="cpd-title">${p.title} · ${ins.age} 歲投保推薦</div>
            <div class="cpd-quote">"${p.story}"</div>
          `;
        } else {
          descEl.style.display = 'none';
        }
      } else {
        descEl.style.display = 'none';
      }
    }

    // 預覽
    renderCurvePreview(ins);
  }

  /** 渲染預覽:時間軸顯示各年齡的調整比例 */
  function renderCurvePreview(ins) {
    const wrap = $('#curvePreview');
    if (!wrap) return;
    const checkedKeys = Object.keys(state.curve.products);
    if (checkedKeys.length === 0) {
      wrap.innerHTML = `<div class="curve-preview-title" style="color:#999;">⚠️ 請先勾選要調整的商品,系統才會套用責任曲線。</div>`;
      return;
    }

    const { startAge, period, step, floor } = state.curve;
    const insAge = ins.age || 0;
    const showAges = [];

    // 列出投保年齡 → 起調 → 起調後每個 period
    showAges.push(insAge);
    if (startAge > insAge) showAges.push(startAge);
    let curAge = startAge + period;
    while (curAge <= insAge + 30 && curAge <= 100) {
      showAges.push(curAge);
      curAge += period;
    }

    // 用第一個勾選的商品看比例範例
    const firstKey = checkedKeys[0];
    const product = getAllSelectedProducts().find(p => p.key === firstKey);
    let stepHtml = '';
    showAges.forEach(age => {
      let percent;
      if (age < startAge) percent = 100;
      else {
        const stepsApplied = Math.floor((age - startAge) / period) + 1;
        percent = Math.max(floor, 100 - stepsApplied * step);
      }
      const isFloor = percent === floor && age >= startAge + period;
      stepHtml += `<div class="ct-step ${isFloor ? 'floor' : ''}">
        <div class="ct-age">${age} 歲起</div>
        <div class="ct-pct">${percent}%</div>
        <div class="ct-detail">${age === insAge ? '投保時' : isFloor ? '已達下限' : '保額調降'}</div>
      </div>`;
    });

    wrap.innerHTML = `
      <div class="curve-preview-title">📊 調整時間軸(套用 ${checkedKeys.length} 個商品)</div>
      <div class="curve-timeline">${stepHtml}</div>
      <div style="font-size:11px;color:var(--gray);margin-top:6px;">
        💡 計畫制商品(XHD/NIR/XHO)會按下一階跳;數字保額會按 % 計算。
      </div>
    `;
  }

  /** 綁定責任曲線的開關 + 輸入事件(只需綁一次) */
  function bindCurveEvents() {
    const sw = $('#curveEnabled');
    if (sw && !sw._curveBound) {
      sw._curveBound = true;
      sw.onchange = () => {
        state.curve.enabled = sw.checked;
        $('#curveLabel').textContent = sw.checked ? '已啟用' : '未啟用';
        $('#curveBody').style.display = sw.checked ? '' : 'none';
        // 啟用時,若 preset 是 lifestage 但參數還沒套用,就套用一次
        if (sw.checked && state.curve.preset === 'lifestage') {
          applyPreset('lifestage');
        } else {
          recompute();
        }
      };
    }
    // 智慧推薦按鈕
    document.querySelectorAll('.curve-preset').forEach(btn => {
      if (btn._curveBound) return;
      btn._curveBound = true;
      btn.onclick = () => {
        applyPreset(btn.dataset.preset);
      };
    });
    // 4 個輸入框
    [['curveStartAge', 'startAge'], ['curvePeriod', 'period'], ['curveStep', 'step'], ['curveFloor', 'floor']].forEach(([id, key]) => {
      const el = $('#' + id);
      if (el && !el._curveBound) {
        el._curveBound = true;
        el.oninput = () => {
          const v = parseInt(el.value);
          if (!isNaN(v)) {
            state.curve[key] = v;
            // 手動改參數時自動切到「自訂」模式
            state.curve.preset = 'custom';
            const ins = getCurrentInsured();
            renderCurvePreview(ins);
            // 重新標記 active preset
            document.querySelectorAll('.curve-preset').forEach(btn => {
              btn.classList.toggle('active', btn.dataset.preset === 'custom');
            });
            // 隱藏 preset 說明
            const descEl = $('#curvePresetDesc');
            if (descEl) descEl.style.display = 'none';

            if (state.curve.enabled) {
              const rows = collectRows();
              if (rows && ins) {
                drawChart(rows, ins);
                renderBenefits(rows);
              }
            }
          }
        };
      }
    });
  }

  // ──────── /責任曲線 UI ────────


  // ── 走勢圖 ──
  let chartMode = 'total';
  let chartYears = 30;  // 預設未來 30 年,可切換到 60
  let inflationEnabled = false;
  let inflationRate = 2.0;  // 預設 2%(央行政策目標 + 接近近 10 年實際)

  /** 計算某商品在某年齡的保費(考慮主約期滿、續年費率) */
  // ──────── 責任曲線:核心邏輯 ────────

  /** 計畫制商品的下一階對應(計劃四 → 三 → 二 → 一) */
  const PLAN_DOWNGRADE = {
    "計劃四": "計劃三", "計劃三": "計劃二", "計劃二": "計劃一", "計劃一": null,
    "計劃4A": "計劃3A", "計劃3A": "計劃2A", "計劃2A": "計劃1A", "計劃1A": null,
    "計劃3B": "計劃2B", "計劃2B": "計劃1B", "計劃1B": null,
    "計劃2C": "計劃1C", "計劃1C": null,
    "HI-30": "HI-20", "HI-40": "HI-30", "HI-20": "HI-10", "HI-10": "HI-05", "HI-05": null
  };

  /** 計算某商品在某年齡時的「調整後保額」
   *  返回 { amount, label, percent } — amount 是新保額,label 是顯示文字,percent 是相對原值的比例
   */
  function applyCurveToAmount(originalAmount, age, productKey) {
    if (!state.curve.enabled || !state.curve.products[productKey]) {
      return { amount: originalAmount, label: String(originalAmount), percent: 100 };
    }
    const { startAge, period, step, floor } = state.curve;
    if (age < startAge) {
      return { amount: originalAmount, label: String(originalAmount), percent: 100 };
    }

    // 計算「已經調幾次」
    const stepsApplied = Math.floor((age - startAge) / period) + 1;
    let percent = Math.max(floor, 100 - stepsApplied * step);

    // 數字保額:按 % 計算
    if (typeof originalAmount === 'number') {
      // 為避免太破碎,四捨五入到合理單位
      let newAmt;
      if (originalAmount >= 100) {
        newAmt = Math.round(originalAmount * percent / 100 / 10) * 10; // 10萬為單位
      } else if (originalAmount >= 10) {
        newAmt = Math.round(originalAmount * percent / 100); // 1萬為單位
      } else {
        newAmt = Math.round(originalAmount * percent / 100 * 10) / 10; // 0.1 為單位
      }
      // 至少保留 1
      newAmt = Math.max(1, newAmt);
      return { amount: newAmt, label: String(newAmt), percent };
    }

    // 計畫制商品:按下一階跳
    if (typeof originalAmount === 'string') {
      let current = originalAmount;
      // 每經過一個調整週期,降一階
      for (let i = 0; i < stepsApplied; i++) {
        const next = PLAN_DOWNGRADE[current];
        if (!next) break; // 已到最低階
        current = next;
      }
      // 計算實際 percent (以階級數為基準,僅顯示用)
      return { amount: current, label: current.replace(/^計劃/, ''), percent };
    }

    return { amount: originalAmount, label: String(originalAmount), percent: 100 };
  }

  /** 取得商品的全域唯一 key */
  function getProductKey(companyId, code) {
    return `${companyId}_${code}`;
  }

  // ──────── 智慧推薦 ────────

  /** 依被保險人年齡計算 3 種推薦的設定 */
  function calculatePresets(insuredAge) {
    const age = insuredAge != null ? insuredAge : 35;

    // 人生階段型:45 歲起(若投保時已超過 45,則從投保當年開始)
    // 每 1 年降 5%,最低保留 20%
    const lifeStartAge = Math.max(45, age);

    return {
      lifestage: {
        startAge: lifeStartAge,
        period: 1,
        step: 5,
        floor: 20,
        title: '👥 人生階段型',
        story: getLifeStageStory(age, lifeStartAge)
      }
    };
  }

  function getLifeStageStory(age, startAge) {
    if (age < 15) {
      return `子女規劃:目前 ${age} 歲,未來在 ${startAge} 歲起每年降 5%(階段性遞減,最低保留 20%)。趁年輕費率低時投保,責任高峰過後可逐漸降低保額,將預算釋出給自己的家庭。`;
    } else if (age < 31) {
      return `年輕族群:${age} 歲投保,從 ${startAge} 歲起每年降 5%。年輕時保額充足保護工作收入,中年後責任曲線開始遞減,老年保留 20% 作為基本保障。`;
    } else if (age < 45) {
      return `中年規劃:${age} 歲投保,${startAge} 歲起進入「責任曲線遞減期」,每年保額降 5%,大約 60 歲時降到 25%、65 歲後保留 20% 為核心保障。配合退休時程同步降低,有效控制老年保費負擔。`;
    } else if (age < 66) {
      return `${age} 歲已超過 45 歲責任高峰,從投保當年(${startAge} 歲)起即每年降 5%,直到保留 20% 為止。曲線從一開始就採用遞減模式,專注控制中老年保費。`;
    } else {
      return `${age} 歲已過主要責任期,從投保當年起每年降 5%,迅速調降至 20% 下限。建議搭配高自負額方案,以最低成本維持核心保障。`;
    }
  }

  /** 套用 preset 到 state.curve */
  function applyPreset(presetName) {
    const ins = getCurrentInsured();
    if (!ins) return;
    const presets = calculatePresets(ins.age);
    const p = presets[presetName];
    if (!p) {
      // custom 不改設定,只切換 preset 標記
      state.curve.preset = 'custom';
      renderCurveCard(ins);
      return;
    }
    state.curve.preset = presetName;
    state.curve.startAge = p.startAge;
    state.curve.period = p.period;
    state.curve.step = p.step;
    state.curve.floor = p.floor;
    // 並啟用曲線
    state.curve.enabled = true;
    // 自動勾選所有「自然費率」商品(平準費率調整效益小,不自動勾)
    const allProducts = getAllSelectedProducts();
    state.curve.products = {};
    allProducts.forEach(p => {
      if (p.rateType === 'natural') {
        state.curve.products[p.key] = true;
      }
    });

    renderCurveCard(ins);
    // 重繪走勢圖 + 理賠卡
    const rows = collectRows();
    if (rows) {
      drawChart(rows, ins);
      renderBenefits(rows);
    }
  }

  // ──────── /智慧推薦 ────────

  /** 列出所有已勾選商品(供責任曲線勾選介面用) */
  function getAllSelectedProducts() {
    const result = [];
    Object.entries(state.selections).forEach(([cid, sel]) => {
      const c = state.db.companies.find(co => co.id === cid);
      if (!c) return;
      if (sel.main) {
        const p = c.mainProducts.find(p => p.code === sel.main.code);
        if (p) result.push({
          cid, code: p.code, name: p.shortName || p.name,
          type: '主約', key: getProductKey(cid, p.code),
          rateType: p.rateType || 'natural'
        });
      }
      sel.riders.forEach(r => {
        const p = c.riderProducts.find(p => p.code === r.code);
        if (p) result.push({
          cid, code: p.code, name: p.shortName || p.name,
          type: '附約', key: getProductKey(cid, p.code),
          rateType: p.rateType || 'natural'
        });
      });
    });
    return result;
  }

  /** 取得某商品在曲線下的「里程碑」陣列(用於理賠卡片時間軸顯示)
   *  返回 [{ age, percent, amount, label }, ...] — 包括投保時 + 每個調整節點
   */
  function getCurveMilestones(row, insured) {
    if (!insured || insured.age == null) return [];
    const productKey = getProductKey(row.companyId, row.product.code);
    if (!state.curve.enabled || !state.curve.products[productKey]) {
      return [{ age: insured.age, percent: 100, amount: row.amount, label: formatAmountLabel(row.amount, row.product) }];
    }

    const { startAge, period, floor } = state.curve;
    const insAge = insured.age;
    const result = [];
    // 投保時
    result.push({ age: insAge, percent: 100, amount: row.amount, label: formatAmountLabel(row.amount, row.product) });

    // 起調點
    if (startAge > insAge) {
      const adj = applyCurveToAmount(row.amount, startAge, productKey);
      // 起調點若已是 100%(沒套用)就跳過
      if (adj.percent < 100) {
        result.push({ age: startAge, percent: adj.percent, amount: adj.amount, label: formatAmountLabel(adj.amount, row.product) });
      }
    }

    // 後續每個 period 節點(直到走勢圖區間結束)
    let curAge = Math.max(startAge, insAge) + period;
    let lastLabel = result[result.length - 1].label;
    while (curAge <= insAge + 30 && curAge <= 100) {
      const adj = applyCurveToAmount(row.amount, curAge, productKey);
      const newLabel = formatAmountLabel(adj.amount, row.product);
      // 只在 amount 真的改變時加(計畫制可能到下限就不變)
      if (newLabel !== lastLabel) {
        result.push({ age: curAge, percent: adj.percent, amount: adj.amount, label: newLabel });
        lastLabel = newLabel;
      }
      curAge += period;
    }
    return result;
  }

  /** 格式化保額標籤(供時間軸顯示) */
  function formatAmountLabel(amount, product) {
    if (typeof amount === 'string') {
      return amount.replace(/^計劃/, '計畫 ');
    }
    if (product.amountUnit === '元') {
      return `${Number(amount).toLocaleString()} 元`;
    }
    return `${amount} ${product.amountUnit || '萬'}`;
  }

  // ──────── /責任曲線 ────────

  function calcRowFeeAtAge(row, age, gender) {
    const startAge = row.startAge;
    const yearsSinceStart = age - startAge;

    // ── 豁免保費附約特殊處理(全球 XWA 自然費率) ──
    // - 費率以「要保人(=XWA 被保險人)當下年齡」查表
    // - 保額以「該年其他險種年繳保費總和」決定 — 為簡化,以投保時保額為準
    // - 要保人超過 74 歲(XWA 續保上限)→ 費率為 0
    if (row.isWaiver) {
      if (yearsSinceStart < 0) return 0;
      // 若使用者手動覆寫,逐年都用同樣保費(不重算,因為使用者已自訂)
      if (row.waiverManualOverride) {
        if (yearsSinceStart >= 30) return 0;        // 給個合理上限
        return row.fee;
      }
      // 自然費率:要保人當下年齡 = 投保時 + 流逝年
      const proposerAgeNow = (row.waiverProposerAge || 35) + yearsSinceStart;
      if (proposerAgeNow > 74) return 0;             // 續保上限

      // 走勢圖估算:用 WAIVER_PREM_DB 查當下要保人年齡的 P 值
      //   (取 30 期費率當代表;走勢圖求趨勢不求精確)
      //   等效費率 ≈ P × Q_avg(投保時整段方案的平均 Q)
      // 簡化:直接用「投保時 fee × 該年/投保年的 P 比值」當逐年費率
      let ratePerWan = 0;
      if (typeof WAIVER_PREM_DB !== 'undefined') {
        const productCode = row.product.code || 'XWA';
        const gender = row.waiverProposerGender || 'M';
        const xwaKey = `${productCode}${proposerAgeNow}${gender}`;
        const xwaTab = WAIVER_PREM_DB[xwaKey];
        if (xwaTab) {
          // 用 30 期當代表(常見繳費年期),除 100000 還原成「元/萬」
          const P30 = xwaTab['30'] || 0;
          ratePerWan = Math.round(P30 / 10);  // P 單位是 元/100000,轉成元/萬 = P/10
        }
      }
      // 沒查到 → 用投保時的 fee/coverageWan 做為「投保年費率」回填
      if (ratePerWan === 0) {
        const baseCoverageWan = (row.waiverCoverage || 0) / 10000;
        if (baseCoverageWan > 0) ratePerWan = Math.round((row.fee || 0) / baseCoverageWan);
      }
      const coverageWan = (row.waiverCoverage || 0) / 10000;
      return Math.round(coverageWan * ratePerWan);
    }

    if (row.type === '主約') {
      // 主約:期滿後不繳費(以期數判斷,如 20年期 = 繳到 startAge + 19 歲)
      const periodMatch = (row.period || '').match(/^(\d+)/);
      if (periodMatch) {
        const years = parseInt(periodMatch[1]);
        if (yearsSinceStart >= years) return 0; // 期滿
      }
      // 主約終身險:每年保費相同(以投保時年齡為準)
      const productKey = getProductKey(row.companyId || 'unknown', row.product.code);
      const adjusted = applyCurveToAmount(row.amount, age, productKey);
      return calcProductFee(row.product, gender, startAge, row.period, adjusted.amount, true);
    } else {
      // ★ 附約:超過續保上限 → 費率為 0(已過商品保障期間)
      if (row.product.maxAgeContinuous != null && age > row.product.maxAgeContinuous) {
        return 0;
      }
      // 附約:依當下年齡重算,首年/續年區別
      const isFirstYear = (yearsSinceStart === 0);
      const productKey = getProductKey(row.companyId || 'unknown', row.product.code);
      const adjusted = applyCurveToAmount(row.amount, age, productKey);
      // ★ 續保場景(yearsSinceStart > 0)跳過投保上限核保檢查
      //   只要費率表查得到該年齡 → 視為可續保
      const skipCheck = yearsSinceStart > 0;
      return calcProductFee(row.product, gender, age, row.period, adjusted.amount, isFirstYear, 1, skipCheck);
    }
  }

  function drawChart(rows, insured) {
    // 主圖:依當前模式繪製到 #rateChart
    drawChartTo(rows, insured, chartMode, '#rateChart', true);
    // 列印額外圖:固定模式 byCompany / byProduct,繪製到隱藏 SVG
    drawChartTo(rows, insured, 'byCompany', '#rateChartByCompany', false);
    drawChartTo(rows, insured, 'byProduct', '#rateChartByProduct', false);
  }

  function drawChartTo(rows, insured, theMode, svgSelector, enableHover) {
    const svg = document.querySelector(svgSelector);
    if (!svg) return;
    const W = 1200, H = 320;
    const padL = 50, padR = 14, padT = 28, padB = 40;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    const ageStart = insured.age;
    // 上限 80 歲(81 歲後所有商品都期滿,圖會變空)
    const MAX_AGE = 80;
    const requestedEnd = ageStart + (chartYears - 1);
    const ageEnd = Math.min(requestedEnd, MAX_AGE);
    const ages = [];
    for (let a = ageStart; a <= ageEnd; a++) ages.push(a);

    // 系列
    let series = [];
    // 取出當前主題色
    const accentColor = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#3D8FCC';
    // 工具:暫時關閉曲線計算「原方案費用」
    function calcWithoutCurve(fn) {
      const saved = state.curve.enabled;
      state.curve.enabled = false;
      try { return fn(); } finally { state.curve.enabled = saved; }
    }

    if (theMode === 'total') {
      series.push({
        name: '名目保費',
        color: accentColor,
        data: ages.map(age => rows.reduce((s, r) => s + calcRowFeeAtAge(r, age, insured.gender), 0))
      });
      // 若曲線啟用,加上原方案虛線(對比用)
      if (state.curve.enabled) {
        const origData = calcWithoutCurve(() =>
          ages.map(age => rows.reduce((s, r) => s + calcRowFeeAtAge(r, age, insured.gender), 0))
        );
        // 只有當原方案 vs 調整後有差異時才加(避免空線)
        const hasDiff = origData.some((v, i) => Math.abs(v - series[0].data[i]) > 1);
        if (hasDiff) {
          series.push({
            name: '原方案(未調整)',
            color: '#bbb',
            dashed: true,
            data: origData
          });
        }
      }
      // 若通膨換算啟用,加上「實質保費(現值)」線
      if (inflationEnabled && inflationRate > 0) {
        const r = inflationRate / 100;
        const realData = series[0].data.map((nominalFee, i) => {
          const yearsFromNow = ages[i] - insured.age;
          if (yearsFromNow <= 0) return nominalFee;
          // 現值 = 未來值 / (1 + r)^年數
          return Math.round(nominalFee / Math.pow(1 + r, yearsFromNow));
        });
        series.push({
          name: `實質保費(以 ${inflationRate}% 通膨折回現值)`,
          color: '#28a745',
          dashed: false,
          dotted: true,  // 點線(區隔虛線)
          data: realData
        });
      }
    } else if (theMode === 'byCompany') {
      const palette = [accentColor, '#1A6B72', '#0D2A3A', '#E8A020', '#28a745'];
      const grouped = {};
      rows.forEach(r => {
        if (!grouped[r.company]) grouped[r.company] = [];
        grouped[r.company].push(r);
      });
      let i = 0;
      Object.entries(grouped).forEach(([name, rs]) => {
        series.push({
          name,
          color: palette[i++ % palette.length],
          data: ages.map(age => rs.reduce((s, r) => s + calcRowFeeAtAge(r, age, insured.gender), 0))
        });
      });
    } else if (theMode === 'byProduct') {
      const palette = [accentColor, '#1A6B72', '#0D2A3A', '#E8A020', '#28a745', '#6f42c1', '#dc3545', '#fd7e14', '#20c997', '#0066b3'];
      rows.forEach((r, i) => {
        series.push({
          name: r.product.code,
          color: palette[i % palette.length],
          data: ages.map(age => calcRowFeeAtAge(r, age, insured.gender))
        });
      });
    }

    // ── 計算 Y 軸範圍(自動縮放) ──
    let max = 0, min = Infinity;
    series.forEach(s => s.data.forEach(v => {
      if (v > max) max = v;
      if (v < min) min = v;
    }));
    if (max === 0) max = 1000;
    if (!isFinite(min)) min = 0;
    const range = max - min;
    let yMax, yMin;
    if (range < max * 0.05) {
      yMax = max * 1.15;
      yMin = Math.max(0, min - max * 0.15);
    } else {
      yMax = max + range * 0.15;
      yMin = Math.max(0, min - range * 0.1);
    }
    // 智慧步長:把範圍切成 5~6 等分,每等分取 nice 數字
    const niceStep = (rangeVal) => {
      const targetTicks = 6;
      const rough = rangeVal / targetTicks;
      const exp = Math.pow(10, Math.floor(Math.log10(rough)));
      const n = rough / exp;
      let step;
      if (n < 1.5) step = 1 * exp;
      else if (n < 3) step = 2 * exp;
      else if (n < 7) step = 5 * exp;
      else step = 10 * exp;
      return step;
    };
    const step = niceStep(yMax - yMin);
    yMax = Math.ceil(yMax / step) * step;
    yMin = Math.floor(yMin / step) * step;
    if (yMin < 0) yMin = 0;
    // 限制刻度數量在 4~7 之間
    let lines = Math.round((yMax - yMin) / step);
    if (lines > 7) {
      const step2 = step * 2;
      yMax = Math.ceil(yMax / step2) * step2;
      yMin = Math.floor(yMin / step2) * step2;
      if (yMin < 0) yMin = 0;
      lines = Math.round((yMax - yMin) / step2);
    }
    const finalStep = (yMax - yMin) / lines;

    let svgHTML = '';

    // Y 軸格線
    for (let i = 0; i <= lines; i++) {
      const v = yMin + finalStep * i;
      const y = padT + innerH - (innerH * (v - yMin) / (yMax - yMin));
      svgHTML += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
      svgHTML += `<text x="${padL - 6}" y="${y + 4}" font-size="10" fill="#999" text-anchor="end">${Math.round(v).toLocaleString()}</text>`;
    }

    // X 軸標籤:每 5 年 + 起點與終點
    ages.forEach((age, i) => {
      const x = padL + (innerW * i / Math.max(1, ages.length - 1));
      const yearsSinceStart = age - ageStart;
      if (yearsSinceStart % 5 === 0 || i === 0 || i === ages.length - 1) {
        svgHTML += `<line x1="${x}" y1="${padT + innerH}" x2="${x}" y2="${padT + innerH + 4}" stroke="#999" stroke-width="1"/>`;
        svgHTML += `<text x="${x}" y="${padT + innerH + 18}" font-size="10" fill="#666" text-anchor="middle">${age}歲</text>`;
      }
    });
    svgHTML += `<text x="${W / 2}" y="${H - 4}" font-size="11" fill="#666" text-anchor="middle">被保險人年齡 (投保後 ${ageEnd - ageStart + 1} 年)</text>`;
    // 左上角放單位(取代垂直旋轉的「年保費(元)」,避免跟 Y 軸數字重疊)
    svgHTML += `<text x="${padL - 6}" y="${padT - 8}" font-size="10" fill="#999" text-anchor="end">(元)</text>`;

    // 折線
    series.forEach(s => {
      const points = s.data.map((v, i) => {
        const x = padL + (innerW * i / Math.max(1, s.data.length - 1));
        const y = padT + innerH - (innerH * (v - yMin) / (yMax - yMin));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      let dashAttr = '';
      if (s.dashed) dashAttr = ' stroke-dasharray="6,4"';
      else if (s.dotted) dashAttr = ' stroke-dasharray="2,3"';
      svgHTML += `<polyline fill="none" stroke="${s.color}" stroke-width="${s.dashed ? 1.5 : 2}" points="${points}" stroke-linejoin="round"${dashAttr}/>`;
      // 圓點:起點 + 每 5 年 + 終點(虛線不畫圓點,避免雜亂)
      if (!s.dashed && !s.dotted) {
        s.data.forEach((v, i) => {
          const yearsSinceStart = ages[i] - ageStart;
          if (yearsSinceStart % 5 === 0 || i === s.data.length - 1) {
            const x = padL + (innerW * i / Math.max(1, s.data.length - 1));
            const y = padT + innerH - (innerH * (v - yMin) / (yMax - yMin));
            svgHTML += `<circle cx="${x}" cy="${y}" r="3" fill="${s.color}"/>`;
          }
        });
      }
    });

    // 圖例
    let legX = padL;
    const legY = padT - 8;
    series.forEach(s => {
      svgHTML += `<rect x="${legX}" y="${legY - 8}" width="10" height="10" fill="${s.color}" rx="2"/>`;
      svgHTML += `<text x="${legX + 14}" y="${legY + 2}" font-size="11" fill="#333" font-weight="600">${s.name}</text>`;
      legX += 14 + (s.name.length * 13) + 16;
    });

    svg.innerHTML = svgHTML;

    // ── Hover Tooltip(僅主圖啟用) ──
    if (enableHover) {
    const tooltip = $('#chartTooltip');
    const wrapEl = svg.parentElement;

    const handleMove = (e) => {
      const rect = svg.getBoundingClientRect();
      const xRel = e.clientX - rect.left;
      // 還原成 viewBox 座標
      const xVB = xRel * (W / rect.width);
      // 找最近的年齡
      let nearestIdx = 0;
      let minDist = Infinity;
      ages.forEach((age, i) => {
        const px = padL + (innerW * i / Math.max(1, ages.length - 1));
        const d = Math.abs(px - xVB);
        if (d < minDist) { minDist = d; nearestIdx = i; }
      });
      // 在 hover 範圍外 → 隱藏
      if (xVB < padL - 10 || xVB > W - padR + 10) {
        tooltip.classList.remove('show');
        const oldLine = svg.querySelector('.chart-hover-line');
        if (oldLine) oldLine.remove();
        return;
      }
      const age = ages[nearestIdx];
      // 動態繪製垂直虛線
      let oldLine = svg.querySelector('.chart-hover-line');
      if (oldLine) oldLine.remove();
      const lineX = padL + (innerW * nearestIdx / Math.max(1, ages.length - 1));
      const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      lineEl.setAttribute('class', 'chart-hover-line');
      lineEl.setAttribute('x1', lineX);
      lineEl.setAttribute('x2', lineX);
      lineEl.setAttribute('y1', padT);
      lineEl.setAttribute('y2', padT + innerH);
      svg.appendChild(lineEl);

      // 組 tooltip 內容
      const yearsSinceStart = age - ageStart;
      const totalAtAge = series.reduce((s, sr) => s + sr.data[nearestIdx], 0);
      let html = `<div class="tt-age">${age} 歲(投保第 ${yearsSinceStart + 1} 年)</div>`;
      if (theMode === 'total') {
        html += `<div class="tt-row"><span class="tt-label"><span class="tt-dot" style="background:${series[0].color}"></span>${series[0].name}</span><span class="tt-val">${Math.round(series[0].data[nearestIdx]).toLocaleString()} 元</span></div>`;
      } else {
        series.forEach(s => {
          html += `<div class="tt-row"><span class="tt-label"><span class="tt-dot" style="background:${s.color}"></span>${s.name}</span><span class="tt-val">${Math.round(s.data[nearestIdx]).toLocaleString()} 元</span></div>`;
        });
        if (series.length > 1) {
          html += `<div class="tt-row" style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.2);"><span class="tt-label">合計</span><span class="tt-val" style="color:#fff;">${Math.round(totalAtAge).toLocaleString()} 元</span></div>`;
        }
      }
      tooltip.innerHTML = html;
      tooltip.classList.add('show');

      // 定位:相對於 .chart-svg-wrap,先測量實際大小再放
      const wrapRect = wrapEl.getBoundingClientRect();
      const ttRect = tooltip.getBoundingClientRect();
      const ttW = ttRect.width || 200;
      const ttH = ttRect.height || 100;
      let ttX = (e.clientX - wrapRect.left) + 14;
      let ttY = (e.clientY - wrapRect.top) - 8;
      // 防超出右邊
      if (ttX + ttW > wrapRect.width - 5) {
        ttX = (e.clientX - wrapRect.left) - ttW - 14;
      }
      // 防超出下邊
      if (ttY + ttH > wrapRect.height - 5) {
        ttY = wrapRect.height - ttH - 5;
      }
      // 防超出上邊
      if (ttY < 5) ttY = 5;
      tooltip.style.left = ttX + 'px';
      tooltip.style.top = ttY + 'px';
    };
    svg.onmousemove = handleMove;
    svg.onmouseleave = () => {
      tooltip.classList.remove('show');
      const oldLine = svg.querySelector('.chart-hover-line');
      if (oldLine) oldLine.remove();
    };
    }  // end if (enableHover)

    // ── 年度保費明細表(僅主圖才繪,避免重複) ──
    if (enableHover) {
      renderYearlyTable(rows, insured, ages);
      $$('.chart-toggle').forEach(b => {
        b.onclick = () => {
          chartMode = b.dataset.mode;
          $$('.chart-toggle').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          recompute();
        };
      });
      // 期間切換(30 / 60 年)
      $$('.chart-range-toggle').forEach(b => {
        b.onclick = () => {
          chartYears = parseInt(b.dataset.range);
          $$('.chart-range-toggle').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          recompute();
        };
      });
      // 通膨換算開關
      const infSw = $('#inflationEnabled');
      if (infSw && !infSw._infBound) {
        infSw._infBound = true;
        infSw.onchange = () => {
          inflationEnabled = infSw.checked;
          $('#inflationRateBox').style.display = infSw.checked ? '' : 'none';
          recompute();
        };
      }
      const infRate = $('#inflationRate');
      if (infRate && !infRate._infBound) {
        infRate._infBound = true;
        infRate.oninput = () => {
          const v = parseFloat(infRate.value);
          if (!isNaN(v) && v >= 0 && v <= 10) {
            inflationRate = v;
            // 手動輸入 → 取消所有 preset active(除非剛好等於某 preset)
            $$('.inflation-preset').forEach(b => {
              const presetRate = parseFloat(b.dataset.rate);
              b.classList.toggle('active', Math.abs(presetRate - v) < 0.01);
            });
            if (inflationEnabled) recompute();
          }
        };
      }
      // 通膨 preset 按鈕
      $$('.inflation-preset').forEach(b => {
        if (b._infBound) return;
        b._infBound = true;
        b.onclick = () => {
          const rate = parseFloat(b.dataset.rate);
          inflationRate = rate;
          if (infRate) infRate.value = rate;
          $$('.inflation-preset').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          // 自動啟用通膨換算
          if (!inflationEnabled) {
            inflationEnabled = true;
            if (infSw) infSw.checked = true;
            $('#inflationRateBox').style.display = '';
          }
          recompute();
        };
      });
    }
  }

  // ── 各年度保費明細表 ──
  function renderYearlyTable(rows, insured, ages) {
    const grid = $('#yearlyFeeGrid');
    if (!grid) return;
    let html = '';
    const r = inflationEnabled ? (inflationRate / 100) : 0;
    ages.forEach((age) => {
      const total = rows.reduce((s, r) => s + calcRowFeeAtAge(r, age, insured.gender), 0);
      const cls = total === 0 ? 'yearly-fee-cell zero' : 'yearly-fee-cell';
      let realHtml = '';
      let titleAttr = '';
      if (inflationEnabled && r > 0 && total > 0) {
        const yearsFromNow = age - insured.age;
        const realValue = yearsFromNow > 0
          ? Math.round(total / Math.pow(1 + r, yearsFromNow))
          : total;
        realHtml = `<div class="yf-real">≈ ${realValue.toLocaleString()} <span class="yf-real-tag">現值</span></div>`;
        titleAttr = ` title="名目 ${total.toLocaleString()} 元 → 現值 ${realValue.toLocaleString()} 元(以 ${inflationRate}% 通膨折回)"`;
      }
      html += `<div class="${cls}"${titleAttr}>
        <div class="yf-age">${age}歲</div>
        <span class="yf-fee">${Math.round(total).toLocaleString()}</span>
        ${realHtml}
      </div>`;
    });
    grid.innerHTML = html;
  }

  // ── 理賠項目卡片 ──
  /** 把 product.claims 結構轉成 benefitsLib 期待的格式 */
  function convertProductClaims(product) {
    if (!product.claims || !Array.isArray(product.claims.items)) return null;
    const items = product.claims.items.map(it => {
      // it.calc.type 可能是: 'ratio'(乘以保額元數)、'ratioWan'(乘以保額萬)、
      //                     'plan'(計畫對應金額)、'unit'(單位 × perUnit)、'note'(純文字)
      // 大部分宏泰商品保額單位是「萬元」(amountUnit='萬元'),理賠金額計算時要乘 10000
      // 但 WRA/WRB 保額已是「元」(amountUnit='元'),不再乘 10000
      // 為了讓 calcBenefitValue 正確,我們把「ratio」根據商品 amountUnit 自動分流:
      //   amountUnit === '元'  → 保留 ratio(直接乘元)
      //   amountUnit === '萬元' → 改成 ratioWan(乘 10000 後再乘 ratio)
      let calc = it.calc;
      if (calc && calc.type === 'ratio') {
        if (product.amountUnit === '萬元' || product.amountUnit === '萬') {
          // 保額是萬,改用 ratioWan
          calc = { type: 'ratioWan', ratio: calc.ratio };
        }
        // 否則保留(amountUnit='元' 時直接 ratio)
      }
      return { name: it.name, calc, unit: it.unit, note: it.note };
    });
    return { title: product.claims.title || '理賠項目', items };
  }

  /** 計算單項理賠金額 */
  function calcBenefitValue(item, product, amount) {
    const calc = item.calc;
    if (!calc) return null;
    if (calc.type === 'note') {
      return { type: 'text', text: calc.text };
    }
    if (calc.type === 'plan') {
      // 計畫別:planMap[amount] 直接是金額
      const v = calc.planMap[amount];
      return v != null ? { type: 'num', val: v } : null;
    }
    if (calc.type === 'unit') {
      // 單位數 × perUnit
      const numAmount = parseFloat(amount) || 0;
      return { type: 'num', val: numAmount * calc.perUnit };
    }
    if (calc.type === 'ratioWan') {
      // (保額×10000) × ratio
      const numAmount = parseFloat(amount) || 0;
      return { type: 'num', val: numAmount * 10000 * calc.ratio };
    }
    if (calc.type === 'ratio') {
      // 保額(已是元) × ratio
      const numAmount = parseFloat(amount) || 0;
      return { type: 'num', val: numAmount * calc.ratio };
    }
    return null;
  }

  function renderBenefits(rows) {
    const wrap = $('#benefitsCard');
    const sec = $('#benefitsSection');
    if (!wrap || !sec) return;
    if (rows.length === 0) { wrap.style.display = 'none'; return; }
    const lib = state.db.benefitsLib || {};

    let html = '';
    rows.forEach(r => {
      // 豁免保費附約:獨立卡片設計
      if (r.isWaiver) {
        html += `<div class="benefit-card waiver">
          <div class="benefit-card-header">
            <div class="benefit-card-icon">🛡️</div>
            <div>
              <div class="benefit-card-title">${r.product.name}<span class="bc-code">${r.product.code}</span></div>
              <div class="benefit-card-meta">${r.type} ‧ ${r.period} ‧ <strong>年繳 ${r.fee.toLocaleString()} 元</strong></div>
            </div>
          </div>
          <div class="benefit-card-body" style="font-size:12px;line-height:1.7;">
            <b style="color:var(--orange-dark);">觸發條件:</b>要保人(繳費者)發生身故、完全失能或罹患重大傷病<br>
            <b style="color:var(--orange-dark);">理賠效果:</b>後續保費由保險公司代繳,被保險人原有保障持續有效至期滿<br>
            <span style="color:var(--gray);font-size:11px;">※ 實際豁免條件以各商品條款為準</span>
          </div>
        </div>`;
        return;
      }
      const benefitData = lib[r.product.code] || convertProductClaims(r.product);
      if (!benefitData) {
        // 沒有理賠資料的商品仍顯示基本卡
        html += `<div class="benefit-card ${r.type === '主約' ? 'main' : ''}">
          <div class="benefit-card-header">
            <div class="benefit-card-icon">📄</div>
            <div>
              <div class="benefit-card-title">${r.product.name}<span class="bc-code">${r.product.code}</span></div>
              <div class="benefit-card-meta">${r.type} ‧ ${r.period} ‧ <strong>年繳 ${r.fee.toLocaleString()} 元</strong></div>
            </div>
          </div>
          <div class="benefit-card-body" style="color:var(--gray);font-size:12px;">
            理賠項目資料尚未建立,請參閱條款。
          </div>
        </div>`;
        return;
      }

      // 保額顯示
      let amtStr;
      if (r.product.amountMode === 'plan') {
        // 「計劃一」→「計畫 一」,「HI-30」→「計畫 HI-30」
        amtStr = '計畫 ' + String(r.amount).replace(/^計劃/, '');
      } else if (r.product.amountMode === 'fixedAmount') {
        amtStr = `${Number(r.amount).toLocaleString()} ${r.product.amountUnit}`;
      } else {
        amtStr = `${Number(r.amount).toLocaleString()} ${r.product.amountUnit}`;
      }

      html += `<div class="benefit-card ${r.type === '主約' ? 'main' : ''}">
        <div class="benefit-card-header">
          <div class="benefit-card-icon">${benefitData.icon || '📄'}</div>
          <div style="flex:1;">
            <div class="benefit-card-title">${benefitData.title}<span class="bc-code">${r.product.code}</span></div>
            <div class="benefit-card-meta">${r.type} ‧ ${r.period} ‧ ${amtStr} ‧ <strong>年繳 ${r.fee.toLocaleString()} 元</strong></div>
          </div>
        </div>`;

      // 責任曲線啟用 + 此商品被勾選時,顯示未來保額時間軸
      const productKey = getProductKey(r.companyId, r.product.code);
      if (state.curve.enabled && state.curve.products[productKey]) {
        const ins = getCurrentInsured();
        const milestones = getCurveMilestones(r, ins);
        if (milestones.length > 1) {
          html += `<div class="benefit-curve-timeline">
            <div class="bct-title">📉 責任曲線調整後保額(逐年)</div>
            <div class="bct-steps">
              ${milestones.map((m, i) => `
                <div class="bct-step ${m.percent < 100 ? 'adjusted' : ''} ${m.percent === state.curve.floor && i > 0 ? 'floor' : ''}">
                  <div class="bcts-age">${m.age} 歲起</div>
                  <div class="bcts-amt">${m.label}</div>
                  <div class="bcts-pct">${m.percent}%</div>
                </div>
              `).join('')}
            </div>
          </div>`;
        }
      }

      html += `<div class="benefit-card-body">`;

      if (benefitData.highlights && benefitData.highlights.length > 0) {
        html += `<div class="benefit-highlights">${benefitData.highlights.map(h => `<span class="bh-item">${h}</span>`).join('')}</div>`;
      }

      html += `<div class="benefit-list">`;
      benefitData.items.forEach(item => {
        const result = calcBenefitValue(item, r.product, r.amount);
        const starHtml = item.star ? '<span class="bi-star">★</span>' : '';
        const noteHtml = item.note ? `<span class="bi-note">${item.note}</span>` : '';
        let valueCell = '', unitCell = '', extraClass = '';
        if (!result) {
          valueCell = `<span class="bi-value-note">—</span>`;
          extraClass = 'text-only';
        } else if (result.type === 'text') {
          valueCell = `<span class="bi-value-note">${result.text}</span>`;
          extraClass = 'text-only';
        } else {
          valueCell = `<span class="bi-value">${Math.round(result.val).toLocaleString()}</span>`;
          unitCell = item.unit || '';
        }
        html += `<div class="benefit-item ${item.star ? 'starred' : ''} ${extraClass}">
          <div class="bi-name">${starHtml}${item.name}${noteHtml}</div>
          <div class="bi-value-cell">${valueCell}</div>
          ${extraClass === 'text-only' ? '' : `<div class="bi-unit-cell">${unitCell}</div>`}
        </div>`;
      });
      html += `</div></div></div>`;
    });

    sec.innerHTML = html;
    wrap.style.display = '';
  }

  // ── 建議文字 ──
  function renderAdvice(rows) {
    const wrap = $('#adviceArea');
    const scenario = $('#scenarioSelect').value;
    if (!scenario || rows.length === 0) { wrap.innerHTML = ''; return; }
    const data = state.db.scenarios[scenario];
    if (!data) { wrap.innerHTML = ''; return; }

    let html = `<div class="card"><div class="card-header orange">
      <span><span class="header-icon">💡</span>規劃說明</span>
    </div>
    <div class="card-body">
      <div class="advice-section">
        <div class="advice-title">${data.title}</div>
        <div class="advice-summary">➡️ ${data.summary}</div>`;

    data.sections.forEach(sec => {
      html += `<div class="advice-block">
        <div class="advice-block-title">${sec.icon} ${sec.title}</div>
        <ul>${sec.points.map(p => `<li>${p}</li>`).join('')}</ul>
      </div>`;
    });

    const codes = rows.map(r => r.product.code);
    if (data.productHighlights) {
      const highlights = [];
      Object.entries(data.productHighlights).forEach(([keyCombo, text]) => {
        const keys = keyCombo.split('+');
        if (keys.every(k => codes.includes(k))) highlights.push({ combo: keyCombo, text });
      });
      if (highlights.length > 0) {
        html += `<div class="advice-block">
          <div class="advice-block-title">🎯 您所選商品的特色說明</div>
          ${highlights.map(h => {
            let box = `<div class="advice-highlight-box">${h.text}`;
            // XHD + XHO 組合特別加上「雜費保障結構圖」
            if (h.combo === 'XHD+XHO') {
              box += renderXhdXhoMiscChart(rows);
            }
            box += `</div>`;
            return box;
          }).join('')}
        </div>`;
      }
    }

    if (data.conclusion) {
      html += `<div class="advice-conclusion">
        <div class="ac-title">📌 總結</div>
        ${data.conclusion}
      </div>`;
    }

    html += `</div></div></div>`;
    wrap.innerHTML = html;
  }

  // ── XHD + XHO 雜費保障結構圖解(動態版) ──
  // 根據客戶實際選擇的 XHD / XHO 計畫別,動態計算覆蓋範圍與賠付金額
  function renderXhdXhoMiscChart(rows) {
    // ── 1. 建立查表(以萬元為單位) ──
    // XHD 雜費限額(計劃一~五)
    const xhdLimitMap = {
      '計劃一': 10, '計劃二': 20, '計劃三': 30, '計劃四': 40, '計劃五': 50
    };
    // XHO 雜費限額 + 自負額(根據 PDF 附表一)
    const xhoMap = {
      '計劃1A': { limit: 10, deductible: 10 },
      '計劃2A': { limit: 20, deductible: 10 },
      '計劃3A': { limit: 30, deductible: 10 },
      '計劃4A': { limit: 40, deductible: 10 },
      '計劃1B': { limit: 10, deductible: 20 },
      '計劃2B': { limit: 20, deductible: 20 },
      '計劃3B': { limit: 30, deductible: 20 },
      '計劃1C': { limit: 10, deductible: 30 },
      '計劃2C': { limit: 20, deductible: 30 }
    };

    // ── 2. 從 rows 找出 XHD 跟 XHO 各自選的計畫 ──
    const xhdRow = rows.find(r => r.product.code === 'XHD');
    const xhoRow = rows.find(r => r.product.code === 'XHO');
    if (!xhdRow || !xhoRow) return '';  // 沒同時選就不畫

    const xhdPlan = xhdRow.amount;       // 例如「計劃一」
    const xhoPlan = xhoRow.amount;       // 例如「計劃4A」

    const D = xhdLimitMap[xhdPlan];                  // XHD 限額(萬)
    const xho = xhoMap[xhoPlan];
    if (D === undefined || !xho) return '';          // 計畫名不在表內就放棄

    const O = xho.limit;                             // XHO 限額(萬)
    const N = xho.deductible;                        // XHO 自負(萬)
    const xhoPay = Math.max(0, O - N);               // XHO 實付最高(萬)
    const totalPay = D + xhoPay;                     // 合計實付理賠(萬)

    // ── 3. 判斷情境(D ≥ N 完美銜接 / D < N 有缺口) ──
    const isPerfect = (D >= N);                      // XHD 是否能完整補 XHO 自負額
    const gap = isPerfect ? 0 : (N - D);             // 缺口(萬)

    // ── 4. 配置 SVG 刻度 ──
    // X 軸總長 680px,刻度 0 ~ O 萬(以 XHO 限額為終點)
    const x0 = 20, xMax = 700;
    const totalWidth = xMax - x0;
    const scale = totalWidth / O;                    // 每萬元對應幾 px
    const xAt = (wan) => x0 + wan * scale;

    // 刻度節點:每 10 萬一格(若 O=10 則只標 0/10)
    const ticks = [];
    for (let v = 0; v <= O; v += 10) ticks.push(v);

    // ── 5. 視覺顏色 ──
    const xhdColor = '#0F8C8F';
    const xhoColor = '#F05A28';
    const gapColor = '#999';
    const navy = '#0E2A47';
    const gold = '#D4A24C';

    // ── 6. 組裝 SVG ──
    let svgInner = '';

    // 標題列
    svgInner += `<text x="20" y="24" font-size="13" font-weight="700" fill="${navy}">雜費金額(萬元)</text>`;

    // 刻度線 + 數字
    svgInner += `<g font-size="11" fill="#666" text-anchor="middle">`;
    svgInner += `<line x1="${x0}" y1="42" x2="${xMax}" y2="42" stroke="#999" stroke-width="1"/>`;
    ticks.forEach(v => {
      const x = xAt(v);
      const label = (v === 0) ? '0' : (v + '萬');
      svgInner += `<text x="${x}" y="58">${label}</text>`;
      svgInner += `<line x1="${x}" y1="38" x2="${x}" y2="46" stroke="#666" stroke-width="1.5"/>`;
    });
    svgInner += `</g>`;

    // 主體堆疊條
    if (isPerfect) {
      // 情境 A:XHD 完整補 XHO 自負(D ≥ N)
      // XHD 區段 0~D,XHO 區段 N~O(視覺上接續)
      // 視覺處理:XHD 區段位置 0~D,XHO 區段位置 D~O(接續排列;雖然金額上 XHD 蓋掉 N 那段,實務說明照常)
      const xhdW = xAt(D) - x0;
      const xhoStartX = xAt(D);                      // XHD 末端 = XHO 起點
      const xhoW = xAt(O) - xhoStartX;
      const xhdMidX = x0 + xhdW / 2;
      const xhoMidX = xhoStartX + xhoW / 2;

      // XHD 條
      svgInner += `<rect x="${x0}" y="78" width="${xhdW}" height="56" fill="${xhdColor}" rx="4"/>`;
      svgInner += `<text x="${xhdMidX}" y="105" text-anchor="middle" font-size="13" font-weight="700" fill="white">XHD ${xhdPlan}</text>`;
      svgInner += `<text x="${xhdMidX}" y="123" text-anchor="middle" font-size="11" fill="white">上限 ${D} 萬實支實付</text>`;

      // XHO 條
      svgInner += `<rect x="${xhoStartX}" y="78" width="${xhoW}" height="56" fill="${xhoColor}" rx="4"/>`;
      svgInner += `<text x="${xhoMidX}" y="105" text-anchor="middle" font-size="13" font-weight="700" fill="white">XHO ${xhoPlan}</text>`;
      svgInner += `<text x="${xhoMidX}" y="123" text-anchor="middle" font-size="11" fill="white">上限 ${xhoPay} 萬實支實付(自負由 XHD 代墊)</text>`;

      // 大括號:合計理賠 totalPay
      const midX = (x0 + xMax) / 2;
      svgInner += `<path d="M ${x0} 148 L ${x0} 156 L ${midX} 156 L ${midX} 164 L ${midX} 156 L ${xMax} 156 L ${xMax} 148" stroke="${navy}" stroke-width="2" fill="none"/>`;
      svgInner += `<rect x="${midX - 70}" y="160" width="140" height="22" fill="${navy}" rx="11"/>`;
      svgInner += `<text x="${midX}" y="175" text-anchor="middle" font-size="12" font-weight="700" fill="${gold}">合計理賠 ${totalPay} 萬</text>`;

      // 賠付金額標示
      svgInner += `<g font-size="11">`;
      svgInner += `<line x1="${xhdMidX}" y1="200" x2="${xhdMidX}" y2="215" stroke="${xhdColor}" stroke-width="1.5"/>`;
      svgInner += `<text x="${xhdMidX}" y="232" text-anchor="middle" fill="${xhdColor}" font-weight="700">XHD 賠 ${D} 萬</text>`;
      svgInner += `<line x1="${xhoMidX}" y1="200" x2="${xhoMidX}" y2="215" stroke="${xhoColor}" stroke-width="1.5"/>`;
      svgInner += `<text x="${xhoMidX}" y="232" text-anchor="middle" fill="${xhoColor}" font-weight="700">XHO 賠 ${xhoPay} 萬(${O} 萬限額 - ${N} 萬自負)</text>`;
      svgInner += `</g>`;
    } else {
      // 情境 B:XHD 不夠補 XHO 自負(D < N) → 中間有缺口要客戶自付
      // XHD 0~D,缺口 D~N(灰色),XHO N~O
      const xhdW = xAt(D) - x0;
      const gapStartX = xAt(D);
      const gapW = xAt(N) - gapStartX;
      const xhoStartX = xAt(N);
      const xhoW = xAt(O) - xhoStartX;
      const xhdMidX = x0 + xhdW / 2;
      const gapMidX = gapStartX + gapW / 2;
      const xhoMidX = xhoStartX + xhoW / 2;

      svgInner += `<rect x="${x0}" y="78" width="${xhdW}" height="56" fill="${xhdColor}" rx="4"/>`;
      svgInner += `<text x="${xhdMidX}" y="108" text-anchor="middle" font-size="12" font-weight="700" fill="white">XHD ${xhdPlan}</text>`;
      svgInner += `<text x="${xhdMidX}" y="123" text-anchor="middle" font-size="10" fill="white">上限 ${D} 萬實支</text>`;

      svgInner += `<rect x="${gapStartX}" y="78" width="${gapW}" height="56" fill="${gapColor}" rx="4"/>`;
      svgInner += `<text x="${gapMidX}" y="108" text-anchor="middle" font-size="12" font-weight="700" fill="white">缺口</text>`;
      svgInner += `<text x="${gapMidX}" y="123" text-anchor="middle" font-size="10" fill="white">客戶自付 ${gap} 萬</text>`;

      svgInner += `<rect x="${xhoStartX}" y="78" width="${xhoW}" height="56" fill="${xhoColor}" rx="4"/>`;
      svgInner += `<text x="${xhoMidX}" y="108" text-anchor="middle" font-size="12" font-weight="700" fill="white">XHO ${xhoPlan}</text>`;
      svgInner += `<text x="${xhoMidX}" y="123" text-anchor="middle" font-size="10" fill="white">上限 ${xhoPay} 萬實支</text>`;

      // 警示:此搭配有缺口
      const midX = (x0 + xMax) / 2;
      svgInner += `<rect x="${midX - 110}" y="155" width="220" height="22" fill="#D04618" rx="11"/>`;
      svgInner += `<text x="${midX}" y="170" text-anchor="middle" font-size="12" font-weight="700" fill="white">⚠️ 此搭配中間有 ${gap} 萬缺口</text>`;

      svgInner += `<g font-size="11">`;
      svgInner += `<line x1="${xhdMidX}" y1="200" x2="${xhdMidX}" y2="215" stroke="${xhdColor}" stroke-width="1.5"/>`;
      svgInner += `<text x="${xhdMidX}" y="232" text-anchor="middle" fill="${xhdColor}" font-weight="700">XHD 賠 ${D} 萬</text>`;
      svgInner += `<line x1="${xhoMidX}" y1="200" x2="${xhoMidX}" y2="215" stroke="${xhoColor}" stroke-width="1.5"/>`;
      svgInner += `<text x="${xhoMidX}" y="232" text-anchor="middle" fill="${xhoColor}" font-weight="700">XHO 賠 ${xhoPay} 萬</text>`;
      svgInner += `</g>`;
    }

    // 底部總理賠
    svgInner += `<rect x="${x0}" y="248" width="${xMax - x0}" height="26" fill="${navy}" rx="4"/>`;
    const bottomMsg = isPerfect
      ? `💰 合計實付理賠 ${totalPay} 萬 ‧ 客戶幾乎零負擔`
      : `💰 合計實付理賠 ${totalPay} 萬(中間缺口需自付 ${gap} 萬)`;
    svgInner += `<text x="${(x0 + xMax) / 2}" y="266" text-anchor="middle" font-size="13" font-weight="900" fill="${gold}">${bottomMsg}</text>`;

    // ── 7. 底部說明文字 ──
    let noteHTML;
    if (isPerfect) {
      noteHTML = `
        ※ <b>XHD ${xhdPlan}</b>:住院實支實付,雜費限額 ${D} 萬、無自負額 <br>
        ※ <b>XHO ${xhoPlan}</b>:自負額住院實支實付,雜費限額 ${O} 萬、自負 ${N} 萬;XHD 賠的 ${D} 萬正好補上 XHO 的自負額,XHO 實際可賠付上限 ${xhoPay} 萬 <br>
        ※ 兩者皆為「實支實付」型保險,需檢附醫療費用收據申請理賠;雜費收據在 ${O} 萬內可幾乎全數抵充,合計實付理賠最高 <b>${totalPay} 萬</b>
      `;
    } else {
      noteHTML = `
        ※ <b>XHD ${xhdPlan}</b>:住院實支實付,雜費限額 ${D} 萬、無自負額 <br>
        ※ <b>XHO ${xhoPlan}</b>:自負額住院實支實付,雜費限額 ${O} 萬、自負 ${N} 萬 <br>
        ※ ⚠️ <b>此搭配並非最佳組合</b>:XHO 自負額 ${N} 萬 大於 XHD 限額 ${D} 萬,中間有 ${gap} 萬缺口需客戶自付。建議調整 XHO 計畫別,選用「自負額為 10 萬」的計畫(1A/2A/3A/4A)以完整銜接 XHD 計畫一
      `;
    }

    return `
      <div class="misc-chart-wrap">
        <div class="misc-chart-title">📊 圖解:住院雜費保障結構</div>
        <div class="misc-chart-sub">客戶實際選擇:XHD ${xhdPlan} + XHO ${xhoPlan}</div>
        <svg viewBox="0 0 720 280" xmlns="http://www.w3.org/2000/svg" class="misc-chart-svg" preserveAspectRatio="xMidYMid meet">
          ${svgInner}
        </svg>
        <div class="misc-chart-note">${noteHTML}</div>
      </div>
    `;
  }

  // ── 三欄日期輸入處理 ──
  /**
   * 年份判斷規則(簡化版):
   * - 4 位數 → 西元年(如 2026 → 2026, 1990 → 1990)
   * - 1~3 位數 → 民國年(如 115 → 2026, 89 → 2000, 5 → 1916)
   */
  function expandYear(yyStr) {
    const s = String(yyStr).trim();
    const yy = parseInt(s, 10);
    if (isNaN(yy) || yy < 0) return null;
    // 4 位視為西元年
    if (s.length === 4) {
      if (yy >= 1900 && yy <= 2100) return yy;
      return null;
    }
    // 1~3 位視為民國年
    if (s.length >= 1 && s.length <= 3) {
      const ad = 1911 + yy;
      if (ad >= 1912 && ad <= 2110) return ad;
      return null;
    }
    return null;
  }

  function getDateTrio(role) {
    const wrap = document.querySelector(`.date-trio[data-role="${role}"]`);
    if (!wrap) return { y: '', m: '', d: '' };
    return {
      y: wrap.querySelector('.dt-year').value,
      m: wrap.querySelector('.dt-month').value,
      d: wrap.querySelector('.dt-day').value
    };
  }

  function setDateTrio(role, isoDate) {
    const wrap = document.querySelector(`.date-trio[data-role="${role}"]`);
    if (!wrap) return;
    if (!isoDate) {
      wrap.querySelector('.dt-year').value = '';
      wrap.querySelector('.dt-month').value = '';
      wrap.querySelector('.dt-day').value = '';
      $('#' + role + '-birth').value = '';
      return;
    }
    const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return;
    wrap.querySelector('.dt-year').value = m[1];
    wrap.querySelector('.dt-month').value = m[2];
    wrap.querySelector('.dt-day').value = m[3];
    $('#' + role + '-birth').value = isoDate;
  }

  /** 嘗試組合三欄為合法 ISO 日期,若不完整或不合法回傳 null */
  function composeDate(y, m, d) {
    const fullY = expandYear(y);
    const mm = parseInt(m, 10);
    const dd = parseInt(d, 10);
    if (fullY === null || isNaN(mm) || isNaN(dd)) return null;
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    // 校驗合法性(避免 2/30)
    const test = new Date(fullY, mm - 1, dd);
    if (test.getFullYear() !== fullY || test.getMonth() !== mm - 1 || test.getDate() !== dd) return null;
    return `${fullY}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  /** 依被保險人年齡決定情境模板
   *  - 0 歲      → 新生兒
   *  - 1~9 歲    → 兒童
   *  - 10~19 歲  → 青少年
   *  - 20 歲以上 → 成人
   *  使用者若手動改選其他選項(包括「不套用」),會被 state.userPickedScenario 標記;
   *  之後年齡變動仍會強制覆寫(因為情境跟年齡綁定,改年齡就應重新套)。
   */
  function pickScenarioByAge(age) {
    if (age === null || age === undefined || isNaN(age)) return null;
    if (age === 0) return '新生兒';
    if (age >= 1 && age <= 9) return '兒童';
    if (age >= 10 && age <= 19) return '青少年';
    if (age >= 20) return '成人';
    return null;
  }

  function autoApplyScenario() {
    const ageStr = $('#insured-age').value;
    if (ageStr === '') return;                            // 沒輸入年齡不動作
    const age = parseInt(ageStr);
    if (isNaN(age)) return;
    const sel = $('#scenarioSelect');
    if (!sel) return;
    const target = pickScenarioByAge(age);
    if (!target) return;
    // 確認 db 內有對應情境再套(避免將來移除某情境時出錯)
    if (state.db && state.db.scenarios && state.db.scenarios[target]) {
      sel.value = target;
    } else {
      sel.value = '';   // 沒對應情境就清空
    }
  }

  function bindDateTrio(role) {
    const wrap = document.querySelector(`.date-trio[data-role="${role}"]`);
    if (!wrap) return;
    const yEl = wrap.querySelector('.dt-year');
    const mEl = wrap.querySelector('.dt-month');
    const dEl = wrap.querySelector('.dt-day');

    // 只允許數字輸入
    [yEl, mEl, dEl].forEach(el => {
      el.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/[^0-9]/g, '');
      });
    });

    // 自動跳到下一欄
    // - 西元年:輸入 4 位後自動跳
    // - 民國年(1~3 位):需使用者手動 Tab 或失焦才跳
    yEl.addEventListener('input', (e) => {
      [yEl, mEl, dEl].forEach(el => el.classList.remove('invalid'));
      if (e.target.value.length === 4) mEl.focus();
      tryUpdate();
    });
    mEl.addEventListener('input', (e) => {
      [yEl, mEl, dEl].forEach(el => el.classList.remove('invalid'));
      if (e.target.value.length === 2) {
        const v = parseInt(e.target.value, 10);
        if (v >= 1 && v <= 12) dEl.focus();
      }
      tryUpdate();
    });
    dEl.addEventListener('input', () => {
      [yEl, mEl, dEl].forEach(el => el.classList.remove('invalid'));
      tryUpdate();
    });

    // 失焦時:1~3 位轉民國,4 位視為西元
    yEl.addEventListener('blur', () => {
      const v = yEl.value;
      if (!v) return;
      const full = expandYear(v);
      if (full !== null) {
        yEl.value = String(full);
        tryUpdate();
      } else {
        yEl.classList.add('invalid');
      }
    });
    mEl.addEventListener('blur', () => {
      if (mEl.value.length === 1) mEl.value = '0' + mEl.value;
    });
    dEl.addEventListener('blur', () => {
      if (dEl.value.length === 1) dEl.value = '0' + dEl.value;
      tryUpdate();
    });

    // backspace 在空欄位時跳到前一欄
    mEl.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && mEl.value === '') yEl.focus();
    });
    dEl.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && dEl.value === '') mEl.focus();
    });

    function tryUpdate() {
      const trio = getDateTrio(role);
      const iso = composeDate(trio.y, trio.m, trio.d);
      if (iso) {
        $('#' + role + '-birth').value = iso;
        const refDate = $('#proposalDate').value || new Date().toISOString().substr(0, 10);
        const age = calcInsuranceAge(iso, refDate);
        $('#' + role + '-age').value = age;
        // 被保險人變動 → 同步給要保人(若關係為「本人」)
        if (role === 'insured') {
          syncIfSelf();
          autoApplyScenario();
        }
        renderProductSection();
        recompute();
      } else {
        // 還沒填完整,先清空年齡與隱藏值
        $('#' + role + '-birth').value = '';
        $('#' + role + '-age').value = '';
        // 但若三欄都填完整卻不合法,標紅
        if (trio.y && trio.m && trio.d &&
            (trio.y.length >= 1) && trio.m.length >= 1 && trio.d.length >= 1) {
          [yEl, mEl, dEl].forEach(el => {
            if (el.value) el.classList.add('invalid');
          });
        }
        renderProductSection();
        recompute();
      }
    }
  }

  // ── 表單事件 ──
  /** 依被保險人性別更新整體主題色 */
  function updateThemeByGender() {
    const insGender = $('#insured-gender').value || 'M';
    document.body.setAttribute('data-gender', insGender);
  }

  function bindFormEvents() {
    // 性別切換
    $$('.gender-toggle').forEach(g => {
      const targetId = g.dataset.target;
      g.querySelectorAll('button').forEach(b => {
        b.onclick = () => {
          g.querySelectorAll('button').forEach(x => x.classList.remove('active'));
          b.classList.add('active');
          $('#' + targetId).value = b.dataset.val;
          // 主題色:以「被保險人」性別為主
          updateThemeByGender();
          syncIfSelf();
          renderProductSection();
          recompute();
          // 觸發費率閃動,提供視覺反饋
          setTimeout(() => {
            $$('.product-fee').forEach(el => {
              el.classList.remove('flash');
              void el.offsetWidth; // 強制 reflow
              el.classList.add('flash');
            });
          }, 50);
        };
      });
    });

    // 出生日期(三欄式)
    ['proposer', 'insured'].forEach(role => {
      bindDateTrio(role);
      $('#' + role + '-job').onchange = () => { syncIfSelf(); recompute(); };
      $('#' + role + '-name').oninput = () => { syncIfSelf(); recompute(); };
      // 年齡可直接輸入(會把出生日期清空)
      $('#' + role + '-age').addEventListener('input', (e) => {
        // 清空生日三欄(因為年齡與生日衝突,以年齡為準)
        const wrap = document.querySelector(`.date-trio[data-role="${role}"]`);
        if (wrap) {
          wrap.querySelector('.dt-year').value = '';
          wrap.querySelector('.dt-month').value = '';
          wrap.querySelector('.dt-day').value = '';
          [...wrap.querySelectorAll('input')].forEach(el => el.classList.remove('invalid'));
        }
        $('#' + role + '-birth').value = '';
        // 被保險人年齡變動 → 同步給要保人(若關係為「本人」)
        if (role === 'insured') {
          syncIfSelf();
          autoApplyScenario();
        }
        renderProductSection();
        recompute();
      });
    });

    $('#proposalDate').onchange = () => {
      ['proposer', 'insured'].forEach(role => {
        const b = $('#' + role + '-birth').value;
        if (b) $('#' + role + '-age').value = calcInsuranceAge(b, $('#proposalDate').value);
      });
      const d = new Date($('#proposalDate').value);
      $('#todayDate').textContent = isNaN(d) ? '' : `規劃日期 ${adToRoc(d)}`;
      autoApplyScenario();
      renderProductSection();
      recompute();
    };

    // 關係下拉
    $('#relation-select').onchange = (e) => {
      syncIfSelf();
    };

    // 顯示要保人 toggle
    $('#showProposerToggle').onchange = (e) => {
      state.showProposer = e.target.checked;
      $('#proposerCard').style.display = state.showProposer ? '' : 'none';
      $('#relationLabel').textContent = state.showProposer ? '要保人(為被保險人之)' : '';
      $('#relationWrap').style.display = state.showProposer ? '' : 'none';
      if (state.showProposer) {
        // 預設關係:本人 → 從「被保險人」同步到「要保人」
        syncIfSelf();
      }
      // 要保人切換會影響 rateAgeBasis="proposer" 的商品(WRA/WRB),需要重繪與重算
      renderProductSection();
      recompute();
    };

    $('#payMode').onchange = () => recompute();
    $('#scenarioSelect').onchange = () => recompute();

    // 預設今天
    const today = new Date().toISOString().substr(0, 10);
    $('#proposalDate').value = today;
    $('#todayDate').textContent = `規劃日期 ${adToRoc(new Date())}`;
  }

  /** 若關係為「本人」,將要保人資料同步至被保險人 */
  /** 「本人」關係 → 把被保險人資料同步到要保人(被保險人是主) */
  function syncIfSelf() {
    if (!state.showProposer) return;
    if ($('#relation-select').value !== '本人') return;
    $('#proposer-name').value = $('#insured-name').value;
    $('#proposer-gender').value = $('#insured-gender').value;
    // 同步日期(三欄 + hidden)
    const insuredBirth = $('#insured-birth').value;
    setDateTrio('proposer', insuredBirth);
    $('#proposer-age').value = $('#insured-age').value;
    $('#proposer-job').value = $('#insured-job').value;
    const g = $('.gender-toggle[data-target="proposer-gender"]');
    if (g) {
      g.querySelectorAll('button').forEach(b => {
        b.classList.toggle('active', b.dataset.val === $('#insured-gender').value);
      });
    }
  }

  // ── 公司新增 ──
  function openCompanyAddModal() {
    $('#newCompanyShort').value = '';
    $('#newCompanyName').value = '';
    $('#newCompanyId').value = '';
    $('#newCompanyWeb').value = '';
    openModal('modalCompany');
  }
  function saveNewCompany() {
    const id = $('#newCompanyId').value.trim();
    const name = $('#newCompanyName').value.trim();
    const shortName = $('#newCompanyShort').value.trim();
    if (!id || !name || !shortName) { alert('請填寫公司代碼、全名、簡稱'); return; }
    if (state.db.companies.find(c => c.id === id)) { alert('代碼已存在'); return; }
    state.db.companies.push({
      id, name, shortName,
      logoText: shortName.charAt(0),
      website: $('#newCompanyWeb').value.trim(),
      mainProducts: [],
      riderProducts: []
    });
    state.activeCompany = id;
    state.selections[id] = { main: null, riders: [] };
    closeModal('modalCompany');
    renderCompanyTabs();
    renderProductSection();
  }

  // ── 商品編輯 ──
  let editContext = null;
  function openProductEditModal(cid, type, code) {
    const c = state.db.companies.find(c => c.id === cid);
    const list = type === 'main' ? c.mainProducts : c.riderProducts;
    const p = list.find(p => p.code === code);
    if (!p) return;
    editContext = { cid, type, code, isNew: false };
    $('#modalProductTitle').textContent = `編輯:${p.name}`;
    $('#productEditBody').innerHTML = renderProductEditForm(p);
    openModal('modalProduct');
  }
  function openProductAddModal(cid, type) {
    editContext = { cid, type, code: null, isNew: true };
    $('#modalProductTitle').textContent = `新增${type === 'main' ? '主約' : '附約'}`;
    const blank = {
      code: '', name: '', shortName: '', category: '',
      periodOptions: ['1年期'], defaultPeriod: '1年期',
      amountMode: 'wan', amountUnit: '萬元',
      amountSuggestions: [10, 20, 50, 100], defaultAmount: 10,
      allowFreeInput: true,
      rateMode: 'perUnit',
      rates: { '1年期': { 'M': {}, 'F': {} } },
      links: { dm: '', clause: '', rate: '' }
    };
    $('#productEditBody').innerHTML = renderProductEditForm(blank);
    openModal('modalProduct');
  }
  function renderProductEditForm(p) {
    const ratesJSON = JSON.stringify(p.rates || {}, null, 2);
    const firstYearJSON = JSON.stringify(p.firstYearRates || {}, null, 2);
    const renewalJSON = JSON.stringify(p.renewalRates || {}, null, 2);
    return `
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">商品代碼</label>
        <input type="text" class="form-control" id="ed-code" value="${p.code || ''}" ${editContext.isNew ? '' : 'readonly'}>
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">商品名稱</label>
        <input type="text" class="form-control" id="ed-name" value="${p.name || ''}" placeholder="不含公司名前綴">
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">簡稱</label>
        <input type="text" class="form-control" id="ed-shortName" value="${p.shortName || ''}">
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">分類標籤</label>
        <input type="text" class="form-control" id="ed-category" value="${p.category || ''}" placeholder="例:癌症一次金">
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">說明</label>
        <input type="text" class="form-control" id="ed-description" value="${p.description || ''}">
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">期別選項</label>
        <input type="text" class="form-control" id="ed-periodOptions" value="${(p.periodOptions || []).join(',')}" placeholder="逗號分隔,例:1年期 或 20年期,30年期">
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">保額模式</label>
        <select class="form-control" id="ed-amountMode">
          <option value="wan" ${p.amountMode === 'wan' ? 'selected' : ''}>金額(自由輸入)</option>
          <option value="unit" ${p.amountMode === 'unit' ? 'selected' : ''}>單位(自由輸入)</option>
          <option value="plan" ${p.amountMode === 'plan' ? 'selected' : ''}>計畫別(下拉)</option>
          <option value="fixedAmount" ${p.amountMode === 'fixedAmount' ? 'selected' : ''}>固定保額(下拉)</option>
        </select>
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">單位</label>
        <input type="text" class="form-control" id="ed-amountUnit" value="${p.amountUnit || ''}" placeholder="例:萬元、計劃、單位、元">
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">保額/計畫選項</label>
        <input type="text" class="form-control" id="ed-amountSuggestions" value="${(p.amountSuggestions || []).join(',')}" placeholder="逗號分隔">
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">預設保額</label>
        <input type="text" class="form-control" id="ed-defaultAmount" value="${p.defaultAmount || ''}">
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">費率模式</label>
        <select class="form-control" id="ed-rateMode">
          <option value="perUnit" ${p.rateMode === 'perUnit' ? 'selected' : ''}>perUnit (per 1 萬/單位)</option>
          <option value="perUnit_firstYearDiff" ${p.rateMode === 'perUnit_firstYearDiff' ? 'selected' : ''}>perUnit + 首/續年不同</option>
          <option value="plan" ${p.rateMode === 'plan' ? 'selected' : ''}>plan (依計畫)</option>
          <option value="fixedAmount" ${p.rateMode === 'fixedAmount' ? 'selected' : ''}>fixedAmount (依保額)</option>
        </select>
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">DM 連結</label>
        <input type="text" class="form-control" id="ed-link-dm" value="${p.links?.dm || ''}" placeholder="https://...">
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">條款連結</label>
        <input type="text" class="form-control" id="ed-link-clause" value="${p.links?.clause || ''}" placeholder="https://...">
      </div>
      <div class="form-row" style="grid-template-columns:100px 1fr;gap:10px;margin-bottom:10px;">
        <label class="form-label">費率表連結</label>
        <input type="text" class="form-control" id="ed-link-rate" value="${p.links?.rate || ''}" placeholder="https://...">
      </div>
      <hr style="margin:14px 0;">
      <div style="font-size:12px;font-weight:700;color:var(--teal);margin-bottom:6px;">費率資料 (JSON 格式)</div>
      <div style="font-size:11px;color:var(--gray);margin-bottom:8px;">
        perUnit: <code>{"期別":{"M/F":{"年齡":費率}}}</code><br>
        plan: <code>{"期別":{"M/F":{"計畫":{"年齡":費率}}}}</code>
      </div>
      <textarea class="form-control" id="ed-rates" style="min-height:100px;font-family:monospace;font-size:11px;">${ratesJSON}</textarea>
      <div style="font-size:11px;color:var(--gray);margin:8px 0 4px;">首年費率(僅 firstYearDiff 模式)</div>
      <textarea class="form-control" id="ed-firstYearRates" style="min-height:80px;font-family:monospace;font-size:11px;">${firstYearJSON}</textarea>
      <div style="font-size:11px;color:var(--gray);margin:8px 0 4px;">續年費率(僅 firstYearDiff 模式)</div>
      <textarea class="form-control" id="ed-renewalRates" style="min-height:80px;font-family:monospace;font-size:11px;">${renewalJSON}</textarea>
      ${!editContext.isNew ? `<div style="text-align:right;margin-top:14px;"><button class="btn btn-danger" onclick="App.deleteProduct()">🗑️ 刪除此商品</button></div>` : ''}
    `;
  }
  function saveProductEdit() {
    const v = (id) => $('#' + id).value.trim();
    const code = v('ed-code');
    if (!code) { alert('請輸入商品代碼'); return; }

    let rates = {}, firstYearRates = {}, renewalRates = {};
    try { rates = JSON.parse(v('ed-rates') || '{}'); } catch (e) { alert('費率 JSON 格式錯誤'); return; }
    try { firstYearRates = JSON.parse(v('ed-firstYearRates') || '{}'); } catch (e) { alert('首年費率 JSON 格式錯誤'); return; }
    try { renewalRates = JSON.parse(v('ed-renewalRates') || '{}'); } catch (e) { alert('續年費率 JSON 格式錯誤'); return; }

    const amountMode = v('ed-amountMode');
    const obj = {
      code, name: v('ed-name'), shortName: v('ed-shortName'),
      category: v('ed-category'), description: v('ed-description'),
      periodOptions: v('ed-periodOptions').split(',').map(x => x.trim()).filter(Boolean),
      amountMode, amountUnit: v('ed-amountUnit'),
      amountSuggestions: v('ed-amountSuggestions').split(',').map(x => {
        const t = x.trim(); const n = parseFloat(t); return isNaN(n) ? t : n;
      }).filter(x => x !== '' && x !== undefined),
      defaultAmount: (() => { const t = v('ed-defaultAmount'); const n = parseFloat(t); return isNaN(n) ? t : n; })(),
      defaultPeriod: v('ed-periodOptions').split(',')[0].trim(),
      allowFreeInput: amountMode === 'wan' || amountMode === 'unit',
      rateMode: v('ed-rateMode'),
      rates,
      firstYearRates,
      renewalRates,
      links: { dm: v('ed-link-dm'), clause: v('ed-link-clause'), rate: v('ed-link-rate') }
    };

    const c = state.db.companies.find(c => c.id === editContext.cid);
    const list = editContext.type === 'main' ? c.mainProducts : c.riderProducts;
    if (editContext.isNew) {
      if (list.find(p => p.code === code)) { alert('商品代碼已存在'); return; }
      list.push(obj);
    } else {
      const idx = list.findIndex(p => p.code === editContext.code);
      list[idx] = obj;
    }
    closeModal('modalProduct');
    renderProductSection();
    recompute();
  }
  function deleteProduct() {
    if (!confirm('確定要刪除此商品?此動作無法復原。')) return;
    const c = state.db.companies.find(c => c.id === editContext.cid);
    if (editContext.type === 'main') {
      c.mainProducts = c.mainProducts.filter(p => p.code !== editContext.code);
    } else {
      c.riderProducts = c.riderProducts.filter(p => p.code !== editContext.code);
    }
    closeModal('modalProduct');
    renderProductSection();
    recompute();
  }

  // ── Modal ──
  function openModal(id) { $('#' + id).classList.add('show'); }
  function closeModal(id) { $('#' + id).classList.remove('show'); }

  // ── PDF 輸出 ──

  /** 下載 PDF — 改用瀏覽器列印對話框(使用者選「儲存為 PDF」)
   *  優勢:列印效果與「列印」按鈕完全一致,且不需外部 JS 庫
   *  檔名:鼎綸恩宇 - 保險建議書系統 - 被保險人姓名 - YYYYMMDD.pdf
   *  ※ 瀏覽器會把 document.title 當成預設檔名
   */
  function exportPDF() {
    // 必須有試算結果才能下載
    const resultCard = $('#resultCard');
    if (!resultCard || resultCard.style.display === 'none') {
      alert('請先完成保單規劃(輸入被保險人並勾選商品),才能下載 PDF。');
      return;
    }

    // ── 組檔名(瀏覽器會把 document.title 當儲存檔名) ──
    const ins = getCurrentInsured();
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const insName = (ins.name || '被保險人').replace(/[\\/:*?"<>|]/g, '');
    const filename = `鼎綸恩宇 - 保險建議書系統 - ${insName} - ${dateStr}`;

    // ── 暫存原 title,改成預期檔名 ──
    const oldTitle = document.title;
    document.title = filename;

    // ── 提示一下使用者 ──
    // 第一次點時提示,後續不再提示(用 sessionStorage 紀錄)
    if (!sessionStorage.getItem('pdf-tip-shown')) {
      sessionStorage.setItem('pdf-tip-shown', '1');
      // 改用 setTimeout 確保提示框先關才開列印對話框
      setTimeout(() => {
        alert('💡 PDF 下載小提示\n\n即將開啟列印對話框,請選擇:\n「目的地 / 印表機」→「另存為 PDF」\n\n檔名已自動設定:\n' + filename + '.pdf');
        triggerPrint();
      }, 0);
    } else {
      triggerPrint();
    }

    function triggerPrint() {
      // 觸發列印
      window.print();
      // 列印對話框關閉後還原 title
      // 不同瀏覽器 print() 行為不同,用 setTimeout 確保對話框關閉
      setTimeout(() => {
        document.title = oldTitle;
      }, 1000);
    }
  }

  // ── 初始化 ──
  function init() {
    state.db = INSURANCE_DB;
    state.activeCompany = state.db.companies[0]?.id || null;

    // 預設不顯示要保人
    state.showProposer = false;
    $('#proposerCard').style.display = 'none';
    $('#relationWrap').style.display = 'none';
    $('#relationLabel').textContent = '要保人(為被保險人之)';

    // 預設主題色(男生)
    document.body.setAttribute('data-gender', 'M');

    bindFormEvents();
    bindCurveEvents();
    bindWaiverEvents();
    renderCompanyTabs();
    renderProductSection();
  }

  /** 複製試算結果到剪貼簿(純文字,可貼到 LINE / 郵件給客戶)*/
  function copySummaryToClipboard() {
    const ins = getCurrentInsured();
    if (!hasValidInsured()) {
      alert('請先填入被保險人資料');
      return;
    }
    // 收集當前 rows
    const rows = [];
    state.db.companies.forEach(c => {
      const sel = state.selections[c.id];
      if (!sel) return;
      if (sel.main) {
        const p = c.mainProducts.find(p => p.code === sel.main.code);
        if (p) {
          const fee = calcProductFee(p, ins.gender, ins.age, sel.main.period, sel.main.amount);
          rows.push({ company: c.shortName, product: p, period: sel.main.period, amount: sel.main.amount, fee, type: '主約' });
        }
      }
      sel.riders.forEach(r => {
        const p = c.riderProducts.find(p => p.code === r.code);
        if (!p) return;
        let amt = r.amount;
        if (p.autoFillFromCompanyTotal) {
          // 重新計算自動帶入金額
          let total = 0;
          if (sel.main) {
            const mp = c.mainProducts.find(mp => mp.code === sel.main.code);
            if (mp) total += calcProductFee(mp, ins.gender, ins.age, sel.main.period, sel.main.amount);
          }
          sel.riders.forEach(rr => {
            const rp = c.riderProducts.find(rp => rp.code === rr.code);
            if (rp && !rp.autoFillFromCompanyTotal) total += calcProductFee(rp, ins.gender, ins.age, rr.period, rr.amount);
          });
          amt = total;
        }
        const fee = calcProductFee(p, ins.gender, ins.age, r.period, amt);
        rows.push({ company: c.shortName, product: p, period: r.period, amount: amt, fee, type: '附約' });
      });
    });
    if (rows.length === 0) {
      alert('尚未選擇任何商品');
      return;
    }
    let total = 0;
    rows.forEach(r => total += r.fee);
    // 組純文字
    const lines = [];
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('保險建議書(試算)');
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push(`被保險人:${ins.name || '(姓名)'} ${ins.gender === 'M' ? '男' : '女'} ${ins.age} 歲`);
    if (state.showProposer) {
      const pp = getCurrentProposer();
      if (pp && pp.age != null) {
        lines.push(`要保人:${pp.name || '(姓名)'} ${pp.gender === 'M' ? '男' : '女'} ${pp.age} 歲`);
      }
    }
    lines.push('');
    rows.forEach(r => {
      let amtStr = '';
      if (r.product.amountMode === 'plan') amtStr = String(r.amount).replace(/^計劃/, '') + ' 計畫';
      else if (r.product.amountUnit === '元') amtStr = Number(r.amount).toLocaleString() + ' 元';
      else amtStr = Number(r.amount).toLocaleString() + ' ' + (r.product.amountUnit || '');
      lines.push(`【${r.product.code}】${r.product.name}`);
      lines.push(`  ${r.period} / ${amtStr} → 年繳 ${fmt(r.fee)} 元`);
    });
    lines.push('');
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    let halfTotal = 0, quarterTotal = 0, monthlyTotal = 0;
    rows.forEach(r => {
      halfTotal += Math.round(r.fee * 0.520);
      quarterTotal += Math.round(r.fee * 0.262);
      monthlyTotal += Math.round(r.fee * 0.088);
    });
    lines.push(`年繳:${fmt(total)} 元`);
    lines.push(`半年繳:${fmt(halfTotal)} 元`);
    lines.push(`季  繳:${fmt(quarterTotal)} 元`);
    lines.push(`月  繳:${fmt(monthlyTotal)} 元`);
    lines.push('━━━━━━━━━━━━━━━━━━━━');
    lines.push('※ 此為試算金額,實際保費以保險公司核定為準');

    const text = lines.join('\n');
    // 嘗試使用新版 Clipboard API,失敗則 fallback 到 textarea
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showCopyToast('已複製到剪貼簿');
      }, () => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showCopyToast('已複製到剪貼簿');
    } catch (e) {
      alert('複製失敗,請手動選取複製');
    }
    document.body.removeChild(ta);
  }

  function showCopyToast(msg) {
    const btn = document.getElementById('copySummaryBtn');
    if (!btn) { alert(msg); return; }
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ ' + msg;
    btn.style.background = 'rgba(46,204,113,0.85)';
    setTimeout(() => {
      btn.innerHTML = orig;
      btn.style.background = 'rgba(255,255,255,0.2)';
    }, 1800);
  }

  return {
    init,
    exportPDF,
    openCompanyAddModal, saveNewCompany,
    openProductEditModal, openProductAddModal, saveProductEdit, deleteProduct,
    closeModal, openModal,
    toggleAllMain, toggleAllRiders,
    copySummaryToClipboard
  };

})();

document.addEventListener('DOMContentLoaded', App.init);
