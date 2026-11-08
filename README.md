# 青日茶所 · 手搖飲 POS 前端

Angular Standalone 19、SCSS，接目前的 Spring Boot POS API。

## 啟動

```powershell
npm install
npm start
```

開啟 http://localhost:4200 。`proxy.conf.json` 將 `/api` 轉送至 `127.0.0.1:8083`，請先啟動新的 DrinkshopApplication。
現有 Node 24 可以建置本機專案，但不在 Angular 19 的原始官方支援範圍；團隊環境仍需統一相容版本，本次沒有升級套件或修改系統 Node。

## 已完成

- 亮色門市工作台：暖白底、白色卡片、茶綠操作色、深色文字。
- 飲品搜尋／分類、杯型／溫度／冰甜／加料、備註、多杯購物車與修改。
- 根據後端規則反灰、固定冰甜、熱飲自動退選衝突加料。
- 員工登入、現金找零及其他付款方式標記，送單由後端正式計價。
- 訂單查詢、明細、製作狀態、取消明細／整單、已登入員工直接棄單並記錄操作人。
- 損耗照片選檔／拍照入口、預覽、驗證與上傳；照片以授權請求讀取。
- 手機與平板響應式版面，鍵盤可操作的原生 dialog 與焦點控制。

初次開啟是**明確標示的介面預覽**，使用五種虛構飲料，不會建立訂單或扣庫存。
登入後改讀實際菜單與規則；連線失敗不會偷偷改回假資料。

## 測試帳號與安全

員工 `staff`，店長 `manager`。
密碼請在後端本機 `.pos-local.properties` 查看（目前不需 PIN）；不寫入前端原始碼、瀏覽器儲存或 Git。
登入憑證只在記憶體內，重新整理頁面需重新登入。
待確認的送單內容以員工 ID 分開暫存在當前分頁的 sessionStorage，不含登入密碼與 PIN；送單成功即清除。
網路失敗重試會沿用同一 requestId，待確認期間鎖定購物車避免換內容造成重複送單。

## 現階段界線

- 取消以整筆明細為單位，例如同筆兩杯會一起取消；尚未提供拆分單杯。
- 可先接單稍後收款；取消時已付款可不退款、部分退或全退，只有正數退款需要人工退款確認；未付款顯示不需退款。沒有串接支付金流。
- 會員選擇與地址／地圖已接入；菜單編輯、配送計時與配方頁由其他模組後續接入。開班、日結與原料報廢入口見下方「日結與報廢」。
- 手機瀏覽器版面已檢查；相機、作業系統選圖與實際拍攝方向仍需手機實機驗證。
- JPEG／PNG、原檔 5 MB、最多 1200 萬像素，每筆損耗一張；HEIC 需先轉檔。

## 驗證

```powershell
npm run build
npm run test:ci
```

測試驗證登入、預覽不送單、相同規格合併、多杯含加料計價、規則調整、現金不足、送單成功、連線失敗重試與待確認恢復。
樣式在 `src/styles.scss`（共用亮色變數與表單）、`src/app/app.component.scss`（外框）、各 feature 的 SCSS；API 在 `src/app/services/pos-api.service.ts`。
原始 Angular 範本的單元件樣式預算調整為 warning 18 kB／error 22 kB，以容納目前點餐與訂單工作台；總初始載入預算維持不變。

## 畫面分工與共用狀態

`AppComponent` 只管理側邊欄、頂部列、登入／登出、全域訊息，透過 `@switch (ui.view)` 切換畫面。

| 功能 | 元件與樣式 | 狀態與操作 |
| --- | --- | --- |
| 點餐、購物車、客製、結帳、會員選擇入口 | `src/app/features/pos/pos.component.*` | 同目錄 `pos-state.service.ts` |
| 訂單列表、明細、製作、取消退款、補收款、損耗照片 | `src/app/features/orders/orders.component.*` | 同目錄 `orders-state.service.ts` |
| 共用操作鎖、切頁、登入表單與訊息 | `src/app/app.component.*` | `src/app/shared/ui-state.service.ts` |
| 開班、現金對帳、日結與原料報廢、損耗紀錄 | `src/app/features/store-ops/store-ops.component.*` | 同目錄 `store-ops-state.service.ts` |

三個 state service 都是 root singleton；元件直接 inject，不互讀元件變數。切頁會銷毀畫面並關閉當頁彈窗，購物車、會員配送與待確認送單仍保留；登出才清除記憶體資料。同員工的待確認送單仍可依原規則從 sessionStorage 恢復。點餐結帳與訂單補收款各自保存付款欄位。

新增頁面時，在 `UiStateService` 擴充 `WorkspaceView`，並在 AppComponent 新增對應 `@case`。所有切頁入口使用 `ui.navigate()`，有讀取訂單需求時使用 `AppComponent.switchView()`；交易 busy 時不可切頁。門市營運使用 `store` 分支，元件進入時自行讀取資料。

共用的標題、金額列在 `src/app/shared/_workspace.scss`，由各元件 `@use`，維持 Angular 樣式封裝。功能樣式請在對應 feature 修改。維持既有茶綠風格，手機分類可換行、來源選項以兩欄呈現，常用杯數與分類按鈕至少 44px。

設計參考：[UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) 的 Angular feature 分區與共用 service 指引；[Hallmark](https://github.com/Nutlope/hallmark) 的真實操作與手機版面檢查方向；[FreeDesign](https://github.com/AIPMAndy/FreeDesign) 作資源索引。本次沒有引入 UI 框架或更換既有 Angular 19／SCSS。設計與聚焦審查記錄在 `work/egm/`。

後續介面美化使用 Hallmark 的 app screen／polish 檢查流程；從 FreeDesign 收錄的 Lucide 下載本機 SVG sprite，授權在 `public/icons/LICENSE-lucide`。改善文字、表單邊界與鍵盤焦點對比，統一圖示與操作層次。工具僅安裝在本機暫存目錄，沒有加入前端執行依賴。結果與適用限制見 `work/hallmark/polish-report.md`。

## 日結與報廢

選單「日結與報廢」登入後可選營業日，查班次、付款方式淨收款、錢櫃預估及損耗紀錄；未開班顯示底金開班表單，OPEN 顯示清點現金與關班確認，CLOSED 顯示已保存對帳。現金預估只加底金與 CASH 的已收款減退款；非現金、售價及損耗成本不計入錢櫃。預估隨其他工作台變動，正式結算由後端鎖定交易後重算。

關班須勾選確認，差額或缺少完整帳務欄位時須填核對說明；本機有待確認送單時禁止關班。頁面提示未付款／未完成訂單與購物車，關班後該營業日不能接單、收款、取餐、取消或報廢。這些按鈕會操作後端設定的資料庫，不是模擬按鈕。

原料報廢只可登記台北今日且 OPEN 的班次，以庫存的 baseUnit 為單位；先確認原料、數量、原因再送出。後端 `rawWastageEnabled=false` 時停用表單並說明，不能自行執行 009 或開啟 feature flag。成本未建檔顯示未知，不顯示 $0。飲品報廢沿用訂單明細的「報廢／棄單」與照片、退款確認流程，不另建第二套交易邏輯。

原料 API 尚無 requestId，送出前先保存待核對標記；若斷線、逾時、5xx 或重載，須核對送出日至今日的紀錄與實際庫存後才解除再次登記的鎖。最多讀取 31 個日期，超過時保持鎖定並請負責人協助；核對後跨午夜也須重新讀取。後端以實際執行的台北日期記錄，不能回填歷史庫存。

驗收先看入口、日期、帳務顯示與停用條件；關班、扣料等寫入應在隔離測試資料庫操作。此輪驗證使用 HttpTestingController 與 API spies，72 個測試與正式建置通過，沒有對 Aiven 下單、關班、扣料、修改設定或執行 SQL。規格與 EGM 聚焦審查記錄在 `work/egm/store-ops-*.md`。

付款選項為現金、信用卡、LINE Pay；Uber Eats 僅作訂單來源與歷史標記。一般 API 等待上限 15 秒，照片上傳 30 秒；送單逾時會解除忙碌狀態並保留原 requestId，重試不重複建立訂單。

取消／棄單原因可選：配料不足、茶湯不足（茶沒了）、顧客取消、顧客未取餐、點餐／輸入錯誤、製作錯誤、飲品打翻、其他。可只選原因、選擇後補充、或直接手填；其他必須填內容。原因與補充合計最多 255 字，使用原本 reason 欄位保存，不新增資料表。

訂單管理可收取未付款單，收款前禁止完成取餐。明細分列已收款、已退款、淨收款與已製作棄單的原料成本快照；估算含加料杯材，未知成本不當零元。舊單未存成本時顯示未建檔。

訂單明細頂部提供「全部開始製作」「全部製作完成」「整單取餐」，保留下方逐項製作與「此項取餐」。整單取餐須全部保留品項完成且已收款；批次操作使用單次後端交易，不循環呼叫逐項 API。同筆多杯仍一起處理，尚未支援把同筆杯數拆批。

訂單管理預設「待處理」（PENDING／MAKING），另有「待取餐」（DONE）及「當日紀錄」（選定營業日所有訂單）頁籤與筆數。製作完成移到待取餐；全部取餐或整張取消移出工作列表，資料仍留在紀錄。部分取餐／取消依剩餘品項的整單狀態分類。切換營業日會進入完整紀錄；查看剛送出的訂單也直接開啟紀錄。操作後明細若不屬於目前頁籤會清空並提示移往何處。

組員完整啟動說明：[後端 TEAM_QUICKSTART](https://github.com/nickfizz0208/drinkshop-pos-backend/blob/main/docs/TEAM_QUICKSTART.md)。需同時執行前後端並建立各自的本機 MySQL。棄單暫不要求店長帳號或 PIN；由有效登入員工操作，操作人由後端身份決定。
