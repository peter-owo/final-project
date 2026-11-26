# CUBE-MAN 六面迷宮

受經典 Pac-Man 啟發的 3D 網頁遊戲。迷宮分布在立方體六個表面，玩家與鬼魂都能從邊緣走到相鄰面。

目前可玩的網站是由玩家操控小精靈的版本。改為「玩家選三隻鬼魂、切換操控並追捕 AI 小精靈」的新版規劃見 [`ghost_hunt_plan.md`](./ghost_hunt_plan.md)，尚未實作到網站。

## 線上遊玩

直接在瀏覽器開啟 <https://peter-owo.github.io/final-project/> 即可遊玩，不需要安裝遊戲。GitHub Pages 已設為 GitHub Actions 部署；之後每次推送到 `main` 分支都會自動更新網頁。

## 執行

需要 Node.js 20.19 以上版本。

```bash
npm install
npm run dev
```

開啟終端機顯示的本機網址。正式版可用 `npm run build` 產生到 `dist/`；GitHub Pages 專用版本使用 `npm run build:pages`。

## 玩法

- 方向鍵移動；走到表面邊緣的通道會跨到相鄰面。`P` 或 `Esc` 暫停。
- 吃光六個表面的所有豆子與道具獲勝；三條命用完則失敗。
- 黃色圓球讓鬼魂暫時逃跑，這段時間碰到鬼魂可得分。
- 青色六角形提供一次護盾；粉紅三角形暫時加速。
- 紅色鬼魂追蹤玩家；粉紅鬼魂預測前進方向；青色鬼魂偶爾可穿過一格牆。
- 手機可在遊戲畫面滑動來轉向。右側展開圖顯示六面剩餘豆子與目前位置。

## 專案結構

- `src/maze.js`：六面座標、跨面連接、地圖與尋路。
- `src/game.js`：移動、碰撞、道具、鬼魂與勝負規則。
- `src/scene.js`：Three.js 立方體與角色動畫。
- `src/main.js`：操作、音效和介面。
- `src/style.css`：街機風格畫面。

原始企劃見 [`plan.md`](./plan.md)；新版企劃見 [`ghost_hunt_plan.md`](./ghost_hunt_plan.md)。
