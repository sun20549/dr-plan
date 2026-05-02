/* 鼎綸恩宇 共用商品資料庫
 * 使用方法:在 HTML 加入 script 標籤引用 ../products.js(視深度調整)
 * 全域變數:PRODUCTS, detectCurrency()
 * 維護:更新此檔即可同步 /usa2026/ 與 /compare/ 兩處
 */

// ===== 商品資料 =====
const PRODUCTS = {
  "保誠人壽": [
    { name: "享利一生終身壽險(定期給付型)", year: "躉", rate: 3.5, bonus: 800, note: "16~80歲" },
    { name: "享利雙收終身保險113(定期給付型)", year: "3", rate: 15, bonus: 400, note: "0~70歲" },
    { name: "樂利雙收終身保險113(定期給付型)", year: "3", rate: 15, bonus: 400, note: "0~70歲" },
    { name: "鑫滿傳家終身壽險113(定期給付型)", year: "3", rate: 25, bonus: 300, note: "0~70歲" },
    { name: "鑫福安康終身壽險(定期給付型)", year: "3", rate: 18, bonus: 800, note: "0~75歲" },
    { name: "福安滿利終身壽險(113) 3年", year: "3", rate: 15, bonus: 400, note: "0~70歲" },
    { name: "福安滿利終身壽險(113) 6年", year: "6", rate: 25, bonus: 300, note: "0~70歲" },
    { name: "金會旺終身保險(113)", year: "6", rate: 27, bonus: 400, note: "0~70歲" },
    { name: "金世代終身壽險 6年", year: "6", rate: 35, bonus: 300, note: "0~74歲" },
    { name: "金世代終身壽險 10年", year: "10", rate: 50, bonus: 300, note: "0~70歲" },
    { name: "金世代終身壽險 20年", year: "20", rate: 75, bonus: 300, note: "0~65歲" },
    { name: "新美旺傳家外幣終身壽險", year: "躉", rate: 9, bonus: 800, note: "0~80歲" },
    { name: "鑫美傳家外幣終身壽險", year: "3", rate: 30, bonus: 300, note: "0~70歲" },
    { name: "鑫傳家外幣終身壽險", year: "3", rate: 30, bonus: 500, note: "0~77歲" },
    { name: "鑫發達外幣終身壽險 3年", year: "3", rate: 20, bonus: 200 },
    { name: "鑫發達外幣終身壽險 6年", year: "6", rate: 40, bonus: 150 },
    { name: "美滿傳家外幣終身壽險", year: "6", rate: 40, bonus: 400, note: "0~70歲" },
    { name: "六年鑽外幣終身保險", year: "6", rate: 27, bonus: 400, note: "0~74歲" },
    { name: "新美滿相傳外幣終身壽險", year: "6", rate: 46, bonus: 300, note: "0~75歲" },
    { name: "新美康滿利外幣終身壽險 6年", year: "6", rate: 50, bonus: 300, note: "0~74歲" },
    { name: "新美康滿利外幣終身壽險 10年", year: "10", rate: 60, bonus: 300, note: "0~70歲" },
    { name: "鑫傳富外幣終身壽險 8年", year: "8", rate: 60, bonus: 300, note: "0~72歲" },
    { name: "鑫傳富外幣終身壽險 12年", year: "12", rate: 64, bonus: 300, note: "0~68歲" },
    { name: "鑫傳富外幣終身壽險 15年", year: "15", rate: 70, bonus: 300, note: "0~65歲" },
    { name: "鑫彩人生外幣終身壽險 10年", year: "10", rate: 60, bonus: 200, note: "0~70歲" },
    { name: "鑫彩人生外幣終身壽險 20年", year: "20", rate: 80, bonus: 200, note: "0~65歲" },
    { name: "愛得利外幣終身壽險 10年", year: "10", rate: 60, bonus: 400, note: "0~70歲" },
    { name: "愛得利外幣終身壽險 20年", year: "20", rate: 80, bonus: 400, note: "0~60歲" },
    { name: "美年鑽外幣終身保險", year: "12", rate: 50, bonus: 300, note: "0~65歲" },
    { name: "保誠人壽倍感安心終身醫療 10年", year: "10", rate: 40, bonus: 150 },
    { name: "保誠人壽倍感安心終身醫療 15年", year: "15", rate: 72, bonus: 150 },
    { name: "樂齡長青手術醫療 10年", year: "10", rate: 50, bonus: 150 },
    { name: "樂齡長青手術醫療 15年", year: "15", rate: 80, bonus: 150 },
    { name: "樂齡長青手術醫療 20年", year: "20", rate: 35, bonus: 200 },
    { name: "樂齡安康手術醫療 15年", year: "15", rate: 50, bonus: 200 },
    { name: "樂齡安康手術醫療 20年", year: "20", rate: 75, bonus: 200 },
    { name: "富御守護醫療終身健康保險", year: "10", rate: 50, bonus: 150 },
    { name: "富御安康醫療終身保險", year: "10", rate: 50, bonus: 150 },
    { name: "珍心愛護防癌健康保險", year: "12", rate: 32.5, bonus: 150 },
    { name: "誠心防癌2.0健康保險 10年", year: "10", rate: 50, bonus: 150 },
    { name: "誠心防癌2.0健康保險 15年", year: "15", rate: 70, bonus: 150 },
    { name: "誠心防癌2.0健康保險 20年", year: "20", rate: 80, bonus: 150 },
    { name: "照護有術定期健康保險 10年", year: "10", rate: 40, bonus: 150 },
    { name: "照護有術定期健康保險 15年", year: "15", rate: 45, bonus: 150 },
    { name: "照護有術定期健康保險 20年", year: "20", rate: 50, bonus: 150 },
    { name: "保誠人壽一保五享健康保險", year: "20", rate: 77, bonus: 300 },
    { name: "金寶貝終身壽險 3年", year: "3", rate: 15, bonus: 800, note: "115/3/1起計績" },
    { name: "美鑫雙收外幣終身保險 6年", year: "6", rate: 30, bonus: 500 },
    { name: "美鑫雙收外幣終身保險 8年", year: "8", rate: 40, bonus: 400 },
    { name: "美鑫雙收外幣終身保險 10年", year: "10", rate: 45, bonus: 400 },
    { name: "美鑫雙收外幣終身保險 20年", year: "20", rate: 70, bonus: 400 },
    { name: "民富傳家人民幣終身壽險", year: "4", rate: 25, bonus: 1000, note: "115/3/1起計績" },
    { name: "保誠人壽享樂一生終身壽險", year: "躉", rate: 4, bonus: 1300, note: "115/4/1起計績" },
    { name: "保誠人壽鑫滿安康終身壽險", year: "3", rate: 15, bonus: 900, note: "115/4/1起計績" },
    { name: "保誠人壽享扶利終身壽險", year: "6", rate: 35, bonus: 400, note: "115/4/13起計績" }
  ],
  "新光人壽(台新)": [
    { name: "美保金鑽美元終身保險 6年", year: "6", rate: 41, bonus: 300 },
    { name: "美保金鑽美元終身保險 8年", year: "8", rate: 45, bonus: 500 },
    { name: "美保金鑽美元終身保險 10年", year: "10", rate: 50, bonus: 900 },
    { name: "美保金鑽美元終身保險 20年", year: "20", rate: 89, bonus: 900 },
    { name: "美滿豐收美元終身保險 6年", year: "6", rate: 41, bonus: 300 },
    { name: "美滿豐收美元終身保險 10年", year: "10", rate: 50, bonus: 900 },
    { name: "美滿豐收美元終身保險 20年", year: "20", rate: 89, bonus: 900 },
    { name: "鑫好美美元終身壽險 6年", year: "6", rate: 65, bonus: 100 },
    { name: "鑫好美美元終身壽險 7年", year: "7", rate: 75, bonus: 100 },
    { name: "鑫好美美元終身壽險 8年", year: "8", rate: 90, bonus: 200 },
    { name: "美利達美元終身保險 6年", year: "6", rate: 30, bonus: 600 },
    { name: "美利達美元終身保險 8年", year: "8", rate: 40, bonus: 400 },
    { name: "美利達美元終身保險 10年", year: "10", rate: 45, bonus: 600 },
    { name: "美利達美元終身保險 20年", year: "20", rate: 82, bonus: 600 },
    { name: "台鑫旺分紅終身壽險", year: "躉", rate: 4, bonus: 400 },
    { name: "台金旺利率變動型 躉繳", year: "躉", rate: 4, bonus: 400 },
    { name: "台金旺利率變動型 2年", year: "2", rate: 12, bonus: 400 },
    { name: "台金旺利率變動型 3年", year: "3", rate: 20, bonus: 400 },
    { name: "台鑫金讚 躉(0-70歲)", year: "躉", rate: 12, bonus: 500 },
    { name: "台鑫金讚 躉(71-80歲)", year: "躉", rate: 12, bonus: 300 },
    { name: "台鑫金讚 2年", year: "2", rate: 8, bonus: 300 },
    { name: "台鑫金讚 3年(0-70歲)", year: "3", rate: 25, bonus: 500 },
    { name: "台鑫金讚 3年(71-78歲)", year: "3", rate: 25, bonus: 250 },
    { name: "台鑫金讚 4年", year: "4", rate: 15, bonus: 400 },
    { name: "美鴻添富美元分紅 6年", year: "6", rate: 56, bonus: 400 },
    { name: "美鴻添富美元分紅 10年", year: "10", rate: 65, bonus: 400 },
    { name: "吉美傳家美元終身壽險", year: "3", rate: 35, bonus: 400 },
    { name: "台有利還本終身保險", year: "3", rate: 11, bonus: 500, note: "0~69歲" },
    { name: "台享富貴(<300萬)", year: "躉", rate: 3.9, bonus: 400 },
    { name: "台享富貴(≥300萬)", year: "躉", rate: 3.9, bonus: 200 },
    { name: "台新雙盈分紅還本 躉", year: "躉", rate: 3.9, bonus: 600 },
    { name: "台新雙盈分紅還本 2年", year: "2", rate: 12, bonus: 500 },
    { name: "發拉利美元養老保險", year: "躉", rate: 3.5, bonus: 800 },
    { name: "美鴻世代美元分紅 躉(0-70歲)", year: "躉", rate: 4, bonus: 1000 },
    { name: "美鴻世代美元分紅 躉(71-78歲)", year: "躉", rate: 3.5, bonus: 800 },
    { name: "美鴻世代美元分紅 2年(0-70歲)", year: "2", rate: 6, bonus: 700 },
    { name: "美鴻世代美元分紅 2年(71-78歲)", year: "2", rate: 3.8, bonus: 400 },
    { name: "紅利旺分紅保險 躉(0-70歲)", year: "躉", rate: 14.5, bonus: 400 },
    { name: "紅利旺分紅保險 躉(71-74歲)", year: "躉", rate: 13, bonus: 400 },
    { name: "紅利旺分紅保險 躉(75-80歲)", year: "躉", rate: 8, bonus: 700 },
    { name: "紅利旺分紅保險 2年(0-70歲)", year: "2", rate: 28, bonus: 400 },
    { name: "紅利旺分紅保險 2年(71-74歲)", year: "2", rate: 25, bonus: 400 },
    { name: "紅利旺分紅保險 2年(75-88歲)", year: "2", rate: 14, bonus: 800 },
    { name: "美紅勝利美元分紅 2年(0-70歲)", year: "2", rate: 14, bonus: 700 },
    { name: "美紅勝利美元分紅 2年(71-78歲)", year: "2", rate: 10, bonus: 900 },
    { name: "吉享紅分紅終身還本", year: "2", rate: 12, bonus: 500 },
    { name: "美紅鑽美元分紅還本 躉(0-70歲)", year: "躉", rate: 4, bonus: 950 },
    { name: "美紅鑽美元分紅還本 躉(71-80歲)", year: "躉", rate: 1.5, bonus: 2000 },
    { name: "美紅鑽美元分紅還本 2年(0-70歲)", year: "2", rate: 13, bonus: 700 },
    { name: "美紅鑽美元分紅還本 2年(71-80歲)", year: "2", rate: 7.5, bonus: 1200 },
    { name: "美紅旺美元分紅", year: "6", rate: 27, bonus: 300 },
    { name: "美世長紅美元分紅", year: "6", rate: 46, bonus: 200 },
    { name: "美世多美元(0-70歲)", year: "6", rate: 46, bonus: 500 },
    { name: "美世多美元(71-76歲)", year: "6", rate: 48, bonus: 200 },
    { name: "大樂美美元終身保險", year: "6", rate: 32.5, bonus: 200 },
    { name: "美滿傳世美元終身壽險", year: "8", rate: 60, bonus: 500 },
    { name: "臻美福美元 躉", year: "躉", rate: 3.8, bonus: 300 },
    { name: "臻美福美元 2年", year: "2", rate: 7, bonus: 800 },
    { name: "臻美福美元 3年(0-70歲)", year: "3", rate: 28.5, bonus: 600 },
    { name: "臻美福美元 3年(71-77歲)", year: "3", rate: 19.5, bonus: 400 },
    { name: "臻美福美元 6年", year: "6", rate: 46, bonus: 200 },
    { name: "臻美福美元 7年", year: "7", rate: 51, bonus: 300 },
    { name: "多美富美元養老 0-79歲", year: "躉", rate: 4.6, bonus: 700, note: "115/3/1起" },
    { name: "多美富美元養老 80-88歲", year: "躉", rate: 3.1, bonus: 1000, note: "115/3/1起" },
    { name: "溢起健智特定傷病 15年", year: "15", rate: 53, bonus: 400 },
    { name: "溢起健智特定傷病 20年", year: "20", rate: 70, bonus: 350 }
  ],
  "凱基人壽": [
    { name: "金得利(匯款/轉帳)", year: "躉", rate: 4, bonus: 600 },
    { name: "金得利(信用卡)", year: "躉", rate: 2.4, bonus: 1000 },
    { name: "金得利 2年", year: "2", rate: 9, bonus: 600 },
    { name: "美鑽長青外幣終身壽險", year: "8", rate: 65, bonus: 600 },
    { name: "美鑽傳世外幣 6年", year: "6", rate: 58, bonus: 300 },
    { name: "美鑽傳世外幣 8年", year: "8", rate: 78, bonus: 300 },
    { name: "美鑽傳家外幣 5年", year: "5", rate: 55, bonus: 200 },
    { name: "美鑽傳家外幣 6年", year: "6", rate: 58, bonus: 300 },
    { name: "美鑽傳家外幣 8年", year: "8", rate: 78, bonus: 400 },
    { name: "美鑽盈家外幣終身壽險", year: "10", rate: 63, bonus: 600 },
    { name: "美利多倍外幣終身壽險", year: "8", rate: 90, bonus: 200 },
    { name: "美鑽雙新外幣終身壽險", year: "8", rate: 76, bonus: 200, note: "115/4/1起" }
  ],
  "台灣人壽": [
    { name: "美利固美元養老 躉", year: "躉", rate: 4.8, bonus: 200 },
    { name: "美利固美元養老 2年", year: "2", rate: 14, bonus: 100 },
    { name: "幸福美滿美元 躉", year: "躉", rate: 4, bonus: 600 },
    { name: "幸福美滿美元 2年", year: "2", rate: 8, bonus: 300 },
    { name: "富貴傳家美元 2年", year: "2", rate: 25, bonus: 1000 },
    { name: "富貴傳家美元 3年", year: "3", rate: 21, bonus: 900 },
    { name: "美紅富利美元分紅 躉", year: "躉", rate: 25, bonus: 1000 },
    { name: "美紅富利美元分紅 3年", year: "3", rate: 25, bonus: 500 },
    { name: "鑫好傳家利率變動型", year: "6", rate: 51, bonus: 600 },
    { name: "傳富久安美元 6年", year: "6", rate: 40, bonus: 600 },
    { name: "傳富久安美元 10年", year: "10", rate: 46, bonus: 600 },
    { name: "傳富久安美元 20年", year: "20", rate: 90, bonus: 150 },
    { name: "愛分享終身保險", year: "2", rate: 16, bonus: 150 }
  ],
  "富邦人壽": [
    { name: "傳富萬寶龍美元(SY1)", year: "3", rate: 18, bonus: 1000 },
    { name: "傳富萬豪美元(BH1) 3年", year: "3", rate: 16, bonus: 600 },
    { name: "傳富萬豪美元(BH1) 6年", year: "6", rate: 27, bonus: 700 },
    { name: "美年紅旺外幣分紅(PFC) 3年", year: "3", rate: 18, bonus: 900 },
    { name: "美年紅旺外幣分紅(PFC) 6年", year: "6", rate: 36, bonus: 500 },
    { name: "美富優退外幣分紅 2年", year: "2", rate: 17, bonus: 800 },
    { name: "美富優退外幣分紅 6年", year: "6", rate: 34, bonus: 600 },
    { name: "美富優退外幣分紅 8年", year: "8", rate: 44, bonus: 700 },
    { name: "美利大運外幣(FBO) 3年", year: "3", rate: 14, bonus: 900 },
    { name: "美利大運外幣(FBO) 6年", year: "6", rate: 31, bonus: 500 },
    { name: "紅旺年年分紅終身保險", year: "6", rate: 25, bonus: 700 },
    { name: "紅運長樂增額分紅", year: "6", rate: 24, bonus: 700 },
    { name: "活利優退分紅(PALA/B/C) 躉(高)", year: "躉", rate: 14, bonus: 1000 },
    { name: "活利優退分紅(PALA/B/C) 2年(高)", year: "2", rate: 27, bonus: 1000 },
    { name: "活利優退分紅(PALA/B/C) 躉", year: "躉", rate: 13, bonus: 800 },
    { name: "活利優退分紅(PALA/B/C) 2年", year: "2", rate: 26, bonus: 800 },
    { name: "美滿雄福利2(WR1)", year: "躉", rate: 3, bonus: 1800 },
    { name: "美滿美利固美元(BQ1)", year: "躉", rate: 4, bonus: 900 },
    { name: "富貴鑽美利美元(SX1) 2年", year: "2", rate: 10, bonus: 300 },
    { name: "富貴鑽美利美元(SX1) 3年", year: "3", rate: 16, bonus: 300 }
  ],
  "遠雄人壽": [
    { name: "傳富聚鑫(WH1) 6年", year: "6", rate: 32, bonus: 800 },
    { name: "傳富聚鑫(WH1) 7年", year: "7", rate: 42, bonus: 600 },
    { name: "傳富聚鑫(WH1) 12年", year: "12", rate: 66, bonus: 200 },
    { name: "傳富聚鑫(WH1) 20年", year: "20", rate: 86, bonus: 200 },
    { name: "傳富美樂富美元", year: "6", rate: 74, bonus: 150, note: "115/3/1起" },
    { name: "傳富美67美元 6年", year: "6", rate: 70, bonus: 50, note: "115/4/1起" },
    { name: "傳富美67美元 7年", year: "7", rate: 80, bonus: 100, note: "115/4/1起" },
    { name: "美滿唯固利美元養老", year: "躉", rate: 4, bonus: 500 },
    { name: "雄醫靠特定傷病", year: "20", rate: 81, bonus: 600, note: "115/4/1起" }
  ],
  "元大人壽": [
    { name: "美富豐沛外幣保險", year: "躉", rate: 4, bonus: 800 },
    { name: "美富豐盈外幣保險", year: "2", rate: 8.75, bonus: 250 },
    { name: "百富美元 6年", year: "6", rate: 72, bonus: 150 },
    { name: "百富美元 9年", year: "9", rate: 90, bonus: 150 },
    { name: "金好美美元 躉(0-76歲)", year: "躉", rate: 13, bonus: 800 },
    { name: "金好美美元 躉(77-85歲)", year: "躉", rate: 5, bonus: 400 },
    { name: "金好美美元 2年(0-76歲)", year: "2", rate: 26, bonus: 500 },
    { name: "金好美美元 2年(77-80歲)", year: "2", rate: 10, bonus: 400 },
    { name: "元大臻旺美元 躉繳", year: "躉", rate: 4.8, bonus: 400 },
    { name: "元大臻旺美元 2年", year: "2", rate: 14, bonus: 400 },
    { name: "元享年年還本終身保險", year: "3", rate: 12, bonus: 100, note: "2026/4/1起" }
  ],
  "法巴人壽": [
    { name: "鴻運旺旺來終身壽險", year: "6", rate: 27, bonus: 500 },
    { name: "鴻運金喜分紅", year: "2", rate: 12, bonus: 400 },
    { name: "鴻運雙享終身壽險", year: "2", rate: 12, bonus: 400 },
    { name: "美添鴻運外幣分紅", year: "2", rate: 23.5, bonus: 200 },
    { name: "鴻運滿億分紅終身保險", year: "2", rate: 12, bonus: 400 },
    { name: "美吉鴻運外幣分紅", year: "5", rate: 75, bonus: 800, note: "115/4/14起" }
  ],
  "投資型 - 法巴人壽": [
    { name: "金采年華台/外幣變額萬能壽險", year: "躉", rate: 6.3, bonus: 800 },
    { name: "金采年華台/外幣變額年金保險", year: "躉", rate: 6.3, bonus: 800 },
    { name: "鑫滿意足台/外幣變額年金保險", year: "躉", rate: 7, bonus: 600 },
    { name: "鑫滿意足台/外幣變額萬能壽險", year: "躉", rate: 7, bonus: 600 },
    { name: "華利滿載台/外幣變額萬能壽險", year: "躉", rate: 6.2, bonus: 400 },
    { name: "華利滿載台/外幣變額年金保險", year: "躉", rate: 6, bonus: 400 }
  ],
  "投資型 - 新光人壽": [
    { name: "超吉馬利外幣變額萬能壽險", year: "躉", rate: 7, bonus: 500 },
    { name: "超吉馬利變額萬能壽險", year: "躉", rate: 7, bonus: 500 },
    { name: "超吉馬利外幣變額年金保險", year: "躉", rate: 7, bonus: 500 },
    { name: "超吉馬利變額年金保險", year: "躉", rate: 7, bonus: 500 },
    { name: "穩萬利外幣投資連結年金", year: "躉", rate: 3.5, bonus: 1500, note: "2026/4/1起" }
  ],
  "投資型 - 台灣人壽": [
    { name: "臻鑽發發變額年金保險", year: "躉", rate: 7, bonus: 500 },
    { name: "臻鑽發發外幣變額年金保險", year: "躉", rate: 7, bonus: 500 },
    { name: "臻鑽發發變額萬能壽險", year: "躉", rate: 5.3, bonus: 500 },
    { name: "臻鑽發發外幣變額萬能壽險", year: "躉", rate: 7, bonus: 500 },
    { name: "臻鑽旺旺變額萬能壽險", year: "躉", rate: 5.3, bonus: 500 },
    { name: "臻鑽旺旺外幣變額萬能壽險", year: "躉", rate: 7, bonus: 500 },
    { name: "臻鑽旺旺變額年金保險", year: "躉", rate: 6.6, bonus: 500 },
    { name: "臻鑽旺旺外幣變額年金保險", year: "躉", rate: 6.8, bonus: 500 }
  ],
  "投資型 - 元大人壽": [
    { name: "元元豐收變額萬能壽險", year: "躉", rate: 6.5, bonus: 500 },
    { name: "元元豐收變額年金保險", year: "躉", rate: 6.5, bonus: 500 },
    { name: "元元豐收外幣變額萬能壽險", year: "躉", rate: 6.5, bonus: 500 },
    { name: "元元豐收外幣變額年金保險", year: "躉", rate: 6.5, bonus: 500 }
  ],
  "投資型 - 凱基人壽": [
    { name: "世紀贏家外幣變額壽險", year: "躉", rate: 7, bonus: 500 },
    { name: "世紀贏家外幣變額年金保險", year: "躉", rate: 7, bonus: 500 },
    { name: "世紀贏家變額壽險", year: "躉", rate: 7, bonus: 500 },
    { name: "世紀贏家變額年金保險", year: "躉", rate: 7, bonus: 500 },
    { name: "招財進保外幣變額壽險", year: "躉", rate: 6.5, bonus: 500 },
    { name: "招財進保變額壽險", year: "躉", rate: 6.5, bonus: 500 },
    { name: "招財進保變額年金保險", year: "躉", rate: 6.5, bonus: 500 },
    { name: "招財進保外幣變額年金保險", year: "躉", rate: 6.5, bonus: 500 },
    { name: "一生傳富外幣變額壽險", year: "躉", rate: 7, bonus: 500 },
    { name: "一生傳富變額壽險", year: "躉", rate: 7, bonus: 500 },
    { name: "一生傳富變額年金保險", year: "躉", rate: 7, bonus: 500 },
    { name: "一生傳富外幣變額年金保險", year: "躉", rate: 7, bonus: 500 }
  ],
  "投資型 - 保誠人壽": [
    { name: "吉利發發變額萬能壽險", year: "躉", rate: 6.3, bonus: 300 },
    { name: "吉利發發外幣變額萬壽險", year: "躉", rate: 6.3, bonus: 300 },
    { name: "吉利發發變額年金保險", year: "躉", rate: 5.2, bonus: 300 },
    { name: "吉利發發外幣變額年金保險", year: "躉", rate: 5.2, bonus: 300 },
    { name: "10來旺變額萬能壽險", year: "99", rate: 35, bonus: 500, note: "15足-65歲" },
    { name: "10來旺外幣變額萬能壽險", year: "99", rate: 35, bonus: 500, note: "15足-65歲" },
    { name: "富貴大贏家台/外幣變額萬能壽險", year: "躉", rate: 5, bonus: 500 },
    { name: "富貴大贏家台/外幣變額年金保險", year: "躉", rate: 5, bonus: 500 },
    { name: "智富贏家台/外幣變額萬能壽險", year: "躉", rate: 6.5, bonus: 400 },
    { name: "智富贏家台/外幣變額年金保險", year: "躉", rate: 6.5, bonus: 400 }
  ],
  "投資型 - 安聯人壽": [
    { name: "金得益台幣/美元變額萬能壽險", year: "躉", rate: 5.85, bonus: 450 },
    { name: "金得益台幣/美元變額年金保險", year: "躉", rate: 6.25, bonus: 400 }
  ],
  "投資型 - 安達人壽": [
    { name: "新愛家台幣/美元變額萬能壽險", year: "躉", rate: 6.5, bonus: 400 },
    { name: "享保障變額萬能壽險", year: "躉", rate: 35, bonus: 1500 },
    { name: "享保障外幣變額萬能壽險", year: "躉", rate: 35, bonus: 1500 }
  ]
};



function detectCurrency(productName) {
  if (/人民幣/.test(productName)) return { code: 'CNY', symbol: '人民幣', defaultRate: 4.4 };
  if (/美元|外幣/.test(productName)) return { code: 'USD', symbol: '美元', defaultRate: 32.5 };
  return null;
}


// ===== 自動合併「投資型 - XXX」到對應公司 =====
// 例如「投資型 - 凱基人壽」併入「凱基人壽」;若該公司不存在則新建
// 商品名前面會加 [投資型] 標記方便辨識
// 同時把所有公司依中文排序、商品依名稱排序
(function mergeAndSortProducts() {
  const merged = {};
  Object.keys(PRODUCTS).forEach(key => {
    if (key.startsWith('投資型 - ')) {
      const baseCompany = key.replace('投資型 - ', '');
      const tagged = PRODUCTS[key].map(p => ({ ...p, name: `[投資型] ${p.name}` }));
      if (!merged[baseCompany]) merged[baseCompany] = [];
      merged[baseCompany].push(...tagged);
    } else {
      if (!merged[key]) merged[key] = [];
      merged[key].push(...PRODUCTS[key]);
    }
  });
  // 清空原 PRODUCTS 並重新依序填入(中文排序)
  Object.keys(PRODUCTS).forEach(k => delete PRODUCTS[k]);
  const sortedCompanies = Object.keys(merged).sort((a, b) =>
    a.localeCompare(b, 'zh-Hant')
  );
  sortedCompanies.forEach(k => {
    PRODUCTS[k] = merged[k].sort((a, b) =>
      a.name.localeCompare(b.name, 'zh-Hant')
    );
  });
})();

