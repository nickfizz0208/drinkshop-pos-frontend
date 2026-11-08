# POS 畫面拆分規格

## 目的與範圍
目前 AppComponent 同時承擔外框、登入、點餐、訂單、退款與照片。拆成 PosComponent 與 OrdersComponent，各自擁有 HTML、TS、SCSS。AppComponent 只保留外框、登入、全域訊息與切頁；以 @switch 切換。現有會員與地圖元件繼續使用。不新增尚未完成的門市營運頁、不更動後端 API、價格、付款、退款與庫存規則。

## 狀態與介面
- UiStateService 為 root singleton：view、preview、busy、全域訊息、登入表單與 openLogin。共用 busy 阻止跨畫面並行交易。
- PosStateService 為 root singleton：菜單、規則、搜尋、購物車、客製、會員配送、結帳與固定 pending request。切頁銷毀 PosComponent 不銷毀資料。
- OrdersStateService 為 root singleton：日期、篩選、列表、選取明細、取消退款、補收款、損耗照片；保留 orderLoad 版本號保護。
- 畫面直接 inject 對應 state 與 ui。業務操作集中於各自 state，元件負責呈現，不讀另一個元件。PosState 可以透過 OrdersState 的公開讀取方法顯示剛建立的訂單；OrdersState 不依賴 PosState。
- AppComponent 的 login 協調載入菜單與規則、恢復同員工 pending、視目前畫面讀取訂單。logout 協調兩個 state 的 reset；只保留 sessionStorage 中原本可重試的請求，不保存密碼。
- 收款表單分開保存：點餐 checkout 的 payment/received 與訂單 collect 的 payment/received 不共用，避免兩者互相覆寫。
- 所有跨頁入口使用 UiStateService.navigate，先檢查 busy、清除錯誤再設定 view；切頁時由離開元件的 ngOnDestroy 關閉臨時彈窗。AppComponent.switchView 額外讀取訂單列表。OrdersState.showOrder 成功後先解除 busy，再呼叫 navigate；showLastOrder 委派此流程。
- pending 提示跟結帳彈窗一起放在 PosComponent，訂單頁不提供無法開啟結帳的提示入口。回點餐頁才顯示「繼續確認」。

## 失敗情境與生命週期
保留既有網路失敗、逾時與 5xx 使用相同 requestId 重試的行為，明確拒絕仍可修正購物車。登入失敗仍清除 API 認證。切頁時關閉當頁臨時彈窗與錯誤，保留購物車、pending 與已選會員配送。busy 時拒絕切頁。登出清除兩個 state 的敏感資料、彈窗與照片 URL；OrdersComponent 銷毀時釋放照片 URL，並阻止尚在解碼的照片重新建立預覽。列表延遲回應不得在 reset 後寫入。

## 樣式與參考
維持亮色茶綠方向。依 DOM 所屬拆分 SCSS，跨畫面的標題、金額列與收款卡放共用 partial。保留 Angular 樣式封裝，不使用 ::ng-deep 或全域洩漏補救。手機不能出現橫向溢位，互動目標至少 44px；針對這些問題做有限調整。Hallmark、UI UX Pro Max 與 FreeDesign 僅作介面參考，不更換 Angular/SCSS 或引入與需求無關的 UI 框架。

## 替代方案
只拆 HTML 並傳入整個 AppComponent：仍耦合根元件，不採用。把所有原始內容搬到單一 service：只是轉移維護瓶頸，不採用。引入 Router 與新狀態管理套件：此階段不需要網址導航與額外依賴，使用 @switch 和 root services 即可。

## 驗證
先執行現有 build 與測試作基準，再移轉原有流程測試至對應 service，保留付款退款與 pending 斷線回歸。加入真實模板切頁測試：購物車、會員配送及 pending 保留；busy 無法切頁；訂單分頁與按鈕呼叫對應 service；登出關閉彈窗清除狀態；回點餐後繼續確認可開結帳且重用 requestId；查看剛建立訂單後返回不復活舊彈窗。檢查桌面與手機預覽、客製、購物車與未登入訂單頁。不以審查結果代替測試。
