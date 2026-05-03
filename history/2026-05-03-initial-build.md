# 2026-05-03 初期ビルド

## 実施内容

- 新規Gitリポジトリを初期化。
- Vite + React + TypeScriptで小学校向け席替えアプリを作成。
- 旧 `notaboom/sekigae` から、固定席、使用不可席、履歴ペナルティ、視力/身長配慮、CSV/JSON、localStorage運用の機能を抽出。
- 座席生成ロジックを `src/lib/seating.ts` に分離。
- 先生向けワークベンチUI、名簿編集、CSV/TSV貼り付け、JSON保存/読込、座席CSV、A4印刷、履歴表示を実装。
- `AGENTS.md`、`CLAUDE.md`、`TASKS.md`、`docs/`、`scripts/`、テストを追加。

## 判断

- 旧版の一枚HTML/CDN/Babel構成は採用せず、依存管理と検証ができる構成にした。
- 児童情報を扱うため、既定では外部送信なしの静的Webアプリにした。
- グローバル公開前提のため、GitHub Pages workflowを追加した。

## 検証

- `npm.cmd run build`: pass
- `npm.cmd run verify`: pass
- `npm.cmd run smoke:ui`: pass
- GitHub Actions Pages deploy: pass
- 公開URL: https://notaboom.github.io/sekigae-5.5/

## 次

- 改善バックログから、座席ごとの「離す」ルールやPDF出力を追加する。
