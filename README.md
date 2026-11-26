# GHOST CUBE 六面鬼魂追捕

受經典 Pac-Man 啟發的 3D 網頁遊戲。玩家從四種鬼魂中選三隻組隊，在立方體六個表面切換位置、使用技能，追捕由 AI 操控的小精靈。

## 線上遊玩

直接在瀏覽器開啟 <https://peter-owo.github.io/final-project/> 即可遊玩，不需要安裝遊戲。GitHub Pages 會在推送到 `main` 後自動更新。

## 執行

需要 Node.js 20.19 以上版本。

```bash
npm install
npm run dev
```

開啟終端機顯示的本機網址。正式版可用 `npm run build` 產生到 `dist/`；GitHub Pages 專用版本使用 `npm run build:pages`。

## 玩法

- 開局前選三隻鬼魂。方向鍵或 WASD 移動，空白鍵切換目前操控的鬼魂，`E` 使用專屬技能，`P` 或 `Esc` 暫停。
- 其他兩隻鬼魂由 AI 繼續巡邏與追逐，切換時會保留各自的位置與技能冷卻。
- 紅色鬼魂衝刺、粉色鬼魂放陷阱、青色鬼魂穿牆、紫色鬼魂感應小精靈位置。每局只能選其中三隻。
- 180 秒內抓到小精靈三次便獲勝。小精靈收集 220 顆豆子與兩個核心後，會嘗試從出口逃脫。
- 小精靈吃到能量球後，會在六秒內反過來追鬼魂。鬼魂失能三秒後重生。
- 手機可在遊戲畫面滑動轉向，並使用畫面上的切換與技能按鈕。

## 專案結構

- `src/maze.js`：六面座標、跨面連接、地圖與尋路。
- `src/ghost-game.js`：選隊、切換、技能、AI 小精靈、碰撞與勝負規則。
- `src/scene.js`：Three.js 立方體與角色動畫。
- `src/ghost-main.js`：操作、選隊、音效和介面。
- `src/style.css`：街機風格畫面。

遊戲規則與開發計畫見 [`ghost_hunt_plan.md`](./ghost_hunt_plan.md)；原始企劃見 [`plan.md`](./plan.md)。
