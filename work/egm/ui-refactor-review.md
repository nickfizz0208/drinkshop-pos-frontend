# UI 拆分：單輪設計審查

使用 egm-review-loop 的單一 Design Critic，fresh-context reviewer，不遞迴委派。依使用者要求限定一輪初審與最多一次聚焦複查，並非完整五階段 EGM 協定。

審查者確認完整讀取 bundled design_critic persona、feature-spec-standard、ui-refactor-spec.md 與 8 份指定來源。初審已完成。

## design-1-1 · Major · 跨頁入口與彈窗契約

原全域 pending 提示只設定 checkoutOpen，拆入 PosComponent 後，訂單頁可能無法顯示結帳。原 showOrder 直接修改 view 亦可能繞過切頁清理。

處理：PROPOSE FIX，已實作。pending 提示移進 PosComponent；所有跨頁入口走 UiStateService.navigate。OrdersState.showOrder 解除 busy 後再導航。當頁銷毀統一 closeTransient，保留購物車與固定 pending。

驗證：新增實際模板測試檢查訂單頁往返後按繼續確認能打開結帳、重試請求相同；查看新訂單後回點餐不出現舊彈窗。

## 初審其餘範圍

singleton 資料保留、共用 busy、分開付款表單、登入失敗清認證、登出 reset、照片 URL 釋放與列表版本保護，未提出其他 Blocker 或 Major。沒有 Nit。

## 聚焦複查

審查者已完成唯一一次靜態聚焦複查，重新讀取更新規格、導航 service、兩個 feature 的 service／元件／模板與實際模板測試。確認初審 Major 已解決；該範圍沒有未解 Blocker／Major。未執行完整五階段協定，不宣稱多輪收斂。

## 執行驗證

- 改動前：正式建置通過，44 個測試通過；根元件樣式有 18 kB warning。
- 改動後：51 個測試通過，涵蓋原流程與新增的 7 個拆分回歸測試。
- 實際瀏覽器預覽：1280px 桌面與 390px、320px 手機寬度；預覽客製、加入購物車、切換訂單再回點餐、修改杯數皆正常。
- 320px 檢查發現原 body min-width:320px 加上桌面捲軸會造成水平溢位；改為 min-width:0 後，內容寬度與 clientWidth 都是 305px。
- 後端及真實交易未變更；實際付款退款仍由原有自動測試驗證，沒有建立真實訂單。
