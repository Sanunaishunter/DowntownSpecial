# 江戶大亂鬥

江戶時代風格的網頁動作遊戲（紅白機像素風），兩人透過 Tailscale 連線合作。

目前內容：一個關卡（街道，5 波敵人，最後首領銀八）、雙人合作、鍵盤與手機觸控。

## 啟動（在當伺服器的電腦上）

需要 [Node.js](https://nodejs.org) 20 以上。Windows / Mac / Linux 步驟相同：

```bash
npm install
npm run build
npm start
```

終端機會印出網址，例如 `http://100.101.102.103:8080/`，那是這台電腦的 Tailscale 位址。

## 跟遠方朋友玩

1. 兩人都安裝 [Tailscale](https://tailscale.com/download) 並登入。朋友不在你的帳號下的話，到 Tailscale 管理頁面把這台電腦「分享」給他（Share），或邀請他加入你的 tailnet。
2. 你先啟動伺服器（上面三行指令），用終端機印出的網址開啟遊戲，按「建立房間」。
3. 把網址列上的連結（結尾是 `#ABC123` 房間代碼）傳給朋友。他用瀏覽器開啟就會自動加入；也可以手動輸入代碼。
4. 手機用同一個網址即可，需先在手機上開啟 Tailscale。

房間最多 2 人，第二位可以隨時中途加入。畫面右上角會顯示延遲。

## 安全設計

- 預設只綁定 `127.0.0.1` 和 Tailscale 網卡（100.64.0.0/10），區域網路與公網都連不到。找不到 Tailscale 時會在終端機警告。
- 想自己指定位址：`HOST=100.x.y.z npm start`（可用逗號分隔多個）。`HOST=0.0.0.0` 會開放所有網卡，不建議。
- 埠號用 `PORT=9000 npm start` 修改，預設 8080。
- 伺服器會檢查 WebSocket 的 Origin、限制封包大小與頻率、限制連線數與房間數；房間代碼是隨機 6 碼。
- 建議用一般使用者帳號執行，不要用管理員／root。若這台電腦上還有其他重要服務，可以考慮用 Docker 隔離。

## 操作

| 動作 | 鍵盤 | 手機 |
| --- | --- | --- |
| 移動 | 方向鍵 / WASD | 左下搖桿 |
| 拳 | J 或 Z | A |
| 腿 | K 或 X | B |
| 跳 | 空白鍵（同時按 A+B） | 「跳」 |
| 跑步 | 左或右連按兩下 | 搖桿左右連點兩下 |

- 武器：靠近時按 A / B 撿起。持武器時 A 揮擊、B 投擲。
- 倒地的敵人：靠近按 A 舉起；舉著時 A 揮敵、B 投擲；在倒地敵人旁按 A+B 踩敵。
- 昇龍拳：剛跳起的瞬間按 A。跑步中按 A / B 為衝撞。
- 兩人之間不會互相傷害。每人 3 條命。

尚未實作：壓敵／椿拳／連毆、握敵迴旋、桶子、推車、對話與首領加盟、商店、地圖與選單等。

## 美術

遊戲讀取 `assets/manifest.json` 裡的角色圖；沒有對應圖或動作時，退回內建的像素角色。目前 `assets/gen/` 是由 AI 出圖轉出的四個角色（主角與三種換色的敵人）。

### AI 出圖 → 遊戲素材

1. 用圖像模型出動作表（3x2 格、純色背景、角色朝右、同一個人），存成 PNG 或 JPG 放進 `art-src/`。
2. 在 `tools/build_sprites.py` 最上方的 `SHEETS` 登記檔名、格數與每格的動作名稱。
3. 執行：

```bash
pip install pillow numpy
python3 tools/build_sprites.py --preview preview.png
```

工具會自動去背、切格、縮成遊戲大小、對齊腳底、限制調色盤，並輸出四個換色角色與 `assets/manifest.json`。`preview.png` 可以快速檢查每一格。

目前已有的動作：待機、走路、跑步、跳、出拳、踢、跳踢、衝撞、昇龍拳、受傷、倒地、起身、舉敵、丟、踩、撿東西、揮棍，以及持棍時的待機／走路／跑步／跳（上半身用持棍姿勢，下半身接走路的腳）。

### 使用自己的圖

在 `assets/` 放圖並寫好 `manifest.json`（格式見 `assets/manifest.example.json`）。每個角色是一張格狀圖：`w`/`h` 是單格大小，`ox`/`oy` 是腳底中心在格內的位置，`anims` 把狀態名對應到格子編號（由左到右、由上到下，從 0 起算）。動作可寫成 `{"frames": [..], "ticks": [..], "loop": true}` 指定每格停留的遊戲刻數（60 刻 = 1 秒），或直接寫格子編號陣列。

- 角色代號：`kunimasa`、`rikigoro`、`zako`、`ginpa`。
- 可用狀態名：`idle walk run jump punch kick airkick dash upper hurt down getup swing throw lift hold held stomp dead pick holdswing`。缺少的狀態會退回 `idle`。
- 重新整理頁面即可，不用重新建置。
- `assets/` 內除了 `manifest.json` 與 `gen/` 以外的檔案不會被 git 上傳；不是自己創作的素材請只供私下使用，不要公開散布。

## 開發

```bash
npm run dev:server   # 遊戲伺服器（8080，自動重啟）
npm run dev:client   # Vite 開發伺服器（5173，代理到 8080）
npm test             # 單元測試 + 伺服器測試 + 機器人通關測試
npm run typecheck
```

結構：`src/shared` 是遊戲規則（固定 60Hz、亂數可重現），伺服器與單人模式共用；`src/server` 是房間與連線；`src/client` 是畫面、輸入與連線。關卡與敵人數值在 `src/shared/stage.ts`、`src/shared/defs.ts`。

連線方式：伺服器執行遊戲並每秒廣播約 30 次狀態，玩家只傳按鍵；朋友那端的畫面會比你晚約「延遲 + 90ms」。若覺得操作黏，下一步可加客戶端預測或回滾網路碼（遊戲規則已設計成可重現，不用大改）。
