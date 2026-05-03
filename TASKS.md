# TASKS.md

## 完了条件

- [x] 新規Gitリポジトリとして初期化する。
- [x] 旧 `notaboom/sekigae` から機能要件を抽出する。
- [x] Vite + React + TypeScriptで新しい席替えアプリを実装する。
- [x] 名簿、座席レイアウト、使用不可席、固定席、条件付き生成、履歴、CSV/JSON、印刷を提供する。
- [x] AI-DLCハーネス、テスト、docs、historyを配置する。
- [x] GitHub public repository を作成し、GitHub Pagesで公開する。
- [x] 公開後URLをREADMEと履歴に反映する。

## 初期実装タスク

- [x] 目的・前提・完了条件を `docs/PROJECT_PLAN.md` に記録。
- [x] 座席生成ロジックを `src/lib/seating.ts` に分離。
- [x] 旧版の履歴ペナルティ、同席/同隣チェック、固定席、使用不可席を再実装。
- [x] 小学校の先生向けの操作画面を `src/App.tsx` に実装。
- [x] A4印刷、JSON保存/読込、名簿CSV、座席CSVを書き出し可能にする。
- [x] VitestでロジックとUIを検証。
- [x] Playwright UIスモークを `scripts/smoke-ui.mjs` に用意。
- [x] GitHub Pages workflowを追加。

## 改善バックログ

- [ ] 座席ごとの「この児童同士は離す」ルールを追加する。
- [ ] 教室テンプレートを複数保存できるようにする。
- [ ] 生成結果の理由説明を児童名単位で表示する。
- [ ] PDF出力をブラウザ印刷だけでなくファイル生成として追加する。
- [ ] iPad横向きでの座席編集をさらに詰める。
