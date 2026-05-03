# 席替え 5.5

小学校の先生向けに、名簿、教室レイアウト、配慮条件、過去履歴を使って席替え案を作る静的Webアプリです。

- 公開URL: https://notaboom.github.io/sekigae-5.5/
- 旧版参考: https://github.com/notaboom/sekigae
- 保存方式: ブラウザの `localStorage`
- 公開方式: GitHub Pages

## 主な機能

- 名簿の追加、編集、CSV/TSV貼り付け、名簿CSV書き出し
- 教室の行列変更、使用不可席、固定席
- 視力配慮、身長配慮、過去と同じ席/隣の回避、任意の男女ペア配慮
- 生成履歴、過去と同じ左右ペアの表示
- JSON保存/読込、座席CSV、A4印刷
- public GitHub Pagesで使える静的配信

## セットアップ

```powershell
npm.cmd install
npm.cmd run dev
```

開発サーバーはViteの表示URLを開きます。公開前の本番相当確認は次を使います。

```powershell
npm.cmd run verify
npm.cmd run smoke:ui
npm.cmd run preview
```

## 検証

| コマンド | 内容 |
| --- | --- |
| `npm.cmd run lint` | ESLint |
| `npm.cmd run test` | Vitest |
| `npm.cmd run harness` | AI-DLC運用ファイルと公開前チェック |
| `npm.cmd run build` | TypeScript + Vite build |
| `npm.cmd run smoke:ui` | Playwrightで生成フローを確認 |
| `npm.cmd run verify` | lint、test、harness、build |

最新結果は `docs/VALIDATION_REPORT.md` に記録します。

## データ扱い

児童名や配慮メモはブラウザ内の `localStorage` に保存されます。GitHub Pages版でも、アプリから外部サーバーへ児童データを送信しません。共有端末では作業後にJSON保存やリセット、ブラウザデータ削除を行ってください。

詳しくは `docs/PRIVACY.md` を参照してください。

## 運用ファイル

- `AGENTS.md`: Codex向けプロジェクト運用ルール
- `CLAUDE.md`: 開発支援エージェント向け作業規約
- `TASKS.md`: 完了条件、進行中タスク、改善バックログ
- `docs/PROJECT_PLAN.md`: 目的、前提、完了条件、判断理由
- `docs/AI_DLC.md`: ハーネス、規約、スキル、フック、エージェント
- `history/`: 変更履歴

## 公開

`main` にpushすると `.github/workflows/pages.yml` が `npm run verify` とVite buildを実行し、`dist/` をGitHub Pagesへデプロイします。
