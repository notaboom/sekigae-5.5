# AI-DLC / Harness Engineering

## 規約

- 児童データは既定でブラウザ内に閉じる。
- 配慮条件は重みづけとして扱い、絶対条件として表示しない。
- 公開前に `.env`、個人データ、検証出力がGitに入っていないことを確認する。
- 旧版から持ち込むのは機能思想だけで、古いCDN/一枚HTML構成は採用しない。

## スキル

- `seating-core`: `src/lib/seating.ts` の純粋関数を優先して修正し、UI変更とロジック変更を分離する。
- `teacher-workbench-ui`: 先生の反復作業を前提に、名簿、教室、生成、履歴、出力の流れを同一画面で維持する。
- `privacy-static-app`: 外部送信を追加する場合は、READMEとPRIVACYに明示し、既定OFFにする。

## フック

- `npm.cmd run verify`: lint、Vitest、ハーネス、buildをまとめて確認する。
- `npm.cmd run smoke:ui`: ローカルViteを起動し、Playwrightで生成ボタン、座席グリッド、スクリーンショットを確認する。
- `scripts/validate-project.mjs`: 運用ファイル、README要件、AI-DLC用語、公開前チェックを検査する。

## エージェント

- `logic-reviewer`: 生成ロジックの公平性、固定席、使用不可席、履歴ペナルティを確認する。
- `teacher-ux-reviewer`: 先生が迷わず操作できるか、印刷とCSV運用が自然かを確認する。
- `publish-safety-reviewer`: public repo公開前に個人情報、不要な出力、環境ファイル、Pages設定を確認する。

## サンドボックス

- アプリは静的配信を基本にし、サーバーサイド保存を前提にしない。
- localStorageのキーは `sekigae_55_workspace_v1`。
- JSON読込はローカルファイルに限定し、外部URLからの読込は実装しない。

## 公開前チェック

- `npm.cmd run verify`
- `npm.cmd run smoke:ui`
- `git status --short`
- `.gitignore` に `.env` と `.env.*` が含まれること
- READMEにGitHub Pages URL、検証結果、localStorage保存の注意があること
