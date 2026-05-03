# AGENTS.md

## プロジェクトの目的

小学校の先生が、名簿・教室レイアウト・配慮条件・過去履歴を使って、短時間で説明しやすい席替え案を作れる静的Webアプリを育てる。

## 実装方針

- 推論は英語で行い、回答と運用文書は日本語を基本にする。
- 旧 `notaboom/sekigae` は機能参照に限定し、フレームワークやCDN構成は継承しない。
- UIは `C:\Users\notab\Documents\New project\projects\servicenow-nttsmc-customer-portal` の落ち着いた業務ポータル感を、学校向けの作業台として翻訳する。
- ロジックは `src/lib/seating.ts` に集約し、UIと分離してテスト可能にする。
- 個人情報を扱う可能性があるため、既定ではサーバー送信なし・localStorage保存・JSON/CSVの手元管理とする。

## 運用ルール

- 変更時は `README.md`、`TASKS.md`、`history/`、必要な `docs/` を更新する。
- `.env` と `.env.*` はGit管理しない。公開前に `.gitignore` とハーネスで確認する。
- 実装前に目的・前提・完了条件を `docs/PROJECT_PLAN.md` または `TASKS.md` に反映する。
- 改善点を見つけたら提案だけで終わらせず、`TASKS.md` に記録する。
- 公開前チェックは `npm.cmd run verify` を必須にし、UI変更時は `npm.cmd run smoke:ui` も実行する。

## コマンド

- 依存導入: `npm.cmd install`
- 開発: `npm.cmd run dev`
- 検証: `npm.cmd run verify`
- UIスモーク: `npm.cmd run smoke:ui`
- プレビュー: `npm.cmd run preview`

## GitHub公開

- このプロジェクトはグローバル公開が目的なので、GitHubリポジトリは public とする。
- GitHub Pages は `.github/workflows/pages.yml` で `dist/` を公開する。
- 作業後は差分を確認してからコミットし、`main` を `origin` にpushする。
- 利用者向けURLは旧 `notaboom/sekigae` 側を継続利用するため、機能変更後は `sekigae-5.5` だけで終わらせず、`VITE_BASE_PATH=/sekigae/` でビルドした `dist/` を `D:\claude\projects\sekigae` に反映し、`notaboom/sekigae` の `main` へpushする。
- 再発注意の判定対象は、保存履歴数に関係なく直近3回までを上限にする。
