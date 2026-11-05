# 門市營運：日結與報廢畫面

## 目的
新增 StoreOpsComponent，沿用已拆分的 Angular／SCSS 茶綠工作台與 @switch。選單增加「日結與報廢」。讓員工開班、查日結、清點現金關班、登記原料報廢與查看損耗紀錄。飲品報廢沿用現有訂單取消／棄單流程（製作後轉 WASTED、不回補、不再扣料），在營運頁提供清楚的訂單管理入口；避免重做另一套退款規則。

## API 與資料
只串既有後端，不變更 schema、不執行 009、不切換原料損耗 feature flag、不部署或重新啟動目前後端。
- GET /api/daily-shifts/{date}：404 是該營業日未開班，其他錯誤不可當成未開班。
- POST /api/daily-shifts/open：businessDate、pettyCash、rolesJson 固定 []，不傳 staffId。
- POST /api/daily-shifts/close：businessDate、countedCash、diffReason，不傳 staffId。
- GET /api/orders?date：提供預估對帳。現金淨收 = CASH 訂單 paid_amount 減 refunded_amount（不得使用 received_cash、不得再扣損耗）。缺少帳務欄位時不顯示推測的應有現金。實際結算以 close 回應為準。
- GET /api/wastages/daily-summary?date：分開飲品杯數、原料紀錄、成本完整性及 rawWastageEnabled。null 成本顯示未建檔，停用原料功能不代表零損耗。
- GET /api/inventories：原料名稱、baseUnit、bookQty、unitCost。
- POST /api/wastages/raw-material：inventoryId、wastageQty、reason，不傳 staffId 或 date（後端永遠記台北今日）。只有選定日期為台北今日、OPEN、rawWastageEnabled=true 才能登記。

## 狀態與操作
StoreOpsStateService 為 root singleton，直接 inject PosApiService、UiStateService、PosStateService（只讀本機 cart/pending 以提示關班風險）。不讀其他元件。所有寫入共用 ui.busy。切頁／變日期／登出清除或使讀取版本失效，較晚回應不得復活舊資料。新頁登入後讀取；登出 reset。查詢失敗清除舊日期資料與確認表單，禁止用陳舊資料寫入。

OPEN 對帳顯示「預估，送出時後端重算」，付款方式淨收款分列；銷售金額含尚未收款品項，與收款分開。CLOSED 顯示班次保存的現金與付款彙總，不用當前前端重算覆蓋。現金差額使用整數分計算；有差額原因必填，金額最多兩位小數。確認關班前提示關班後不能接單／改單／報廢、顯示未完成與未付款訂單數、本機購物車數；本機 pending 存在時禁止關班。員工勾選清點與後果確認後才能提交。

原料損耗先填原料、實際數量／單位、原因，顯示將扣庫存的確認彈窗，點確認才 POST；數量大於零、最多兩位小數且不超過已查庫存，後端再檢查。不要求店長或 PIN，與現有 authenticated API 相符。503／409 顯示原後端原因並重新讀狀態，不自動重送。

原料 POST 目前沒有 requestId。送出前必須成功將員工、原料、數量、原因、送出時間及台北送出日的待核對標記存至 sessionStorage，存失敗則不 POST。只有明確成功或明確未寫入的拒絕清除。斷線／逾時／5xx 不可盲目重送：停用再次登記；重新讀紀錄由員工確認有沒有記錄，明確選擇「已核對紀錄」才解除；不自動判斷相似紀錄就是同筆。pending 依登入員工隔離，切頁／登出保留儲存標記，登入後恢復。提交當刻再驗台北日期，若確認窗跨日則作廢並重新載入；既有後端以實際執行日為準，跨日不明結果須成功查詢送出日至今日的每個日期，最多 31 天；區間過長或回應日期缺漏保持鎖定，由負責人協助。解除前再次檢查核對日期完整且沒有跨午夜。開關班回應不明時重新 GET 班次，未確認前不自動再 POST。

## 共用資料庫邊界
已讀後端 database/README.md、docs/CLOSING_WASTAGE_FIX.md、TEAM_QUICKSTART.md 與共用資料庫規範段落：禁止以測試名義寫 Aiven、禁止改共用表或紀錄、不索取密碼、不執行009。驗證使用 HttpTestingController／spy 與隔離測試資料，實際瀏覽器不送關班、報廢或測試訂單。只讀公開 API 文件確認正在執行的後端契約。

## 替代方案
改後端新增日結預覽與報廢 idempotency：較完整但超出此次已有 API 接畫面的範圍；採既有訂單列表預估，清楚標示與後端最終對帳，原料不明結果採人工核對。把全部功能寫回 AppComponent 會重新引入多人改同檔問題，不採用。營運頁另做飲品退款表單會重複既有訂單交易邏輯，不採用。

## 驗證
API HttpTestingController 驗證路徑、日期、Body 無 staffId；金額分離、404/503、CLOSED、未知成本、差額原因、pending 阻擋、並行寫入 busy、過時查詢、登出清除、原料結果不明不重送、成功後查詢失敗不誤報寫入失敗。真實模板測試選單、表單確認與停用條件。完整前端測試／正式建置；以測試替身驗證 POST，不對真實門市關班或扣庫存。實際瀏覽器驗證未登入入口與手機排版。
