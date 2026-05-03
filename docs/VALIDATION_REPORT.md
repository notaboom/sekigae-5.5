# Validation Report

## 2026-05-03 初期実装

| チェック | 結果 | メモ |
| --- | --- | --- |
| `npm.cmd run build` | pass | TypeScript build と Vite production build を確認 |
| `npm.cmd run lint` | pass | ESLintエラーなし |
| `npm.cmd run test` | pass | 2 files / 6 tests passed |
| `npm.cmd run harness` | pass | 40 checks passed |
| `npm.cmd run smoke:ui` | pass | 30 seat tiles、生成フロー、コンソールエラーなし |
| GitHub Pages | pass | `https://notaboom.github.io/sekigae-5.5/` が 200 / `席替え 5.5` を返す |

## 検証観点

- 使用不可席に児童が入らない。
- 固定席の児童が生成後も同じ席に残る。
- 席数不足時にエラーを返す。
- 名簿CSV/TSVの新旧形式を読み込める。
- 生成ボタンで座席表と履歴が更新される。
- public repo公開前に `.env` と一時出力がGitに含まれない。
