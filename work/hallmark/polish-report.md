# 茶綠 POS 介面美化

## 採用方式

Hallmark 2.0 的 app screen／polish 流程；保留已有版型、元件分工與交易邏輯。FreeDesign 是資源索引，本次從它收錄的 Lucide 選用官方 SVG，沒有裝整套 UI 框架。圖示及授權位於 `public/icons/`，由 `shared/icon.component.ts` 共用。

延續上一輪已授權且未提交的元件拆分，沒有代替使用者 commit 或 stash。美化前的精確原始碼另存 `.hallmark/source-before/`；工具輸出與截圖不納入 Git。

## 改動

- 加深小字與功能文字，修正焦點環及表單邊界對比。
- 拿掉頁面標題上方重複的英文標語，保留功能、名稱、價格與控制項。
- 導覽、搜尋、加入飲品、空購物車等改用一致的 Lucide 線條圖示。
- 商品名稱與價格加強層次；縮短桌面插圖區，減少掃讀與捲動負擔。
- 購物車加上清楚分隔、總額數字採等寬數字；手機保留換行與至少 44px 的常用操作目標。
- 裝飾分隔文字由中點改斜線、移除黏在文字上的箭頭；獨立 SVG 箭頭仍用於結帳。

## 驗證與限制

- 正式建置及既有 51 個測試通過；未修改測試來配合新樣式。
- Hallmark render tier 檢查實際 Angular URL，涵蓋 320、375、414、768、1024、1280、1440、1920px；結果 0 FAIL、1 REFLEX、0 WARN。
- REFLEX 39b 已採用具體豁免：整張商品卡可點，天然高於一般工具列按鈕，縮成 32–52px 會破壞既有 POS 操作。
- 直接掃 Angular 原始模板時，工具會把 `{{ }}`、`@if`、`[src]` 與元件 SCSS 當未套樣式的靜態 HTML，產生缺圖、換行、焦點等誤報。這部分不宣稱全源碼 0 FAIL；實際頁面檢查與 Angular 建置／測試分別驗證。
- source inventory 保留 1/1 links、17/17 fields、6/6 figures；18 個 heading 中只有訂單建立標題的中點改斜線，已在 CSS stamp 記錄。
- 真實瀏覽器操作確認手機客製彈窗、加入購物車、切訂單頁再回點餐皆正常；375px 視窗含捲軸時 clientWidth 與內容寬度同為 360px。

## 獨立完成審查

fresh-context Hallmark finish reviewer 已讀指定 review-finish 與 gates，查看真正頁面的 1440px 前後全頁和 375px 手機截圖；結論 `ship`，沒有本輪必須修正的實質發現。

舊版插圖區較高、飲品較舒展；新版的取捨是提高掃讀密度。審查確認價格、導覽、搜尋及總額更清楚，手機沒有文字重疊或截斷。保留現在的商品／訂單主次、茶綠配色及控制項邊界。

## 本機比較

前後比較：`.hallmark/compare.html`。真實頁面截圖在 `.hallmark/before/` 與 `.hallmark/shots/`，檔名以 `127.0.0.1-4300` 開頭。不要使用原始模板名稱的截圖作為 Angular 成果。

來源：https://github.com/Nutlope/hallmark 、https://github.com/AIPMAndy/FreeDesign 、https://github.com/lucide-icons/lucide 。
