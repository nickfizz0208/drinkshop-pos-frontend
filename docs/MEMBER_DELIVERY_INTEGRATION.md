# 會員與外送整合

使用分支 `codex/member-delivery-integration`，搭配後端的同名分支。

已整合組員 delivery_build（13665ee）的會員選擇與 HERE 地圖，並修正：

- 庫存不足後保留會員、地址、距離及電話外送來源，修正購物車後可重新送單。
- 登出時關閉會員選擇視窗。
- 成功建單後清除這一單的會員／配送資訊；斷線重試沿用原 requestId。

`src/app/member-delivery-integration.spec.ts` 包含上述回歸測試。執行 `npm run test:ci` 與 `npm run build` 驗證；地圖服務在測試中不呼叫真實 HERE。

實際地圖操作需後端 HERE 金鑰及會員表 geo_source 欄位，請和資料庫負責人確認；不要自行修改 Aiven。後端完整整合與測試說明見同名 docs/MEMBER_DELIVERY_INTEGRATION.md。
