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

## 2026-05-03 レイアウト/入力修正

| チェック | 結果 | メモ |
| --- | --- | --- |
| `npm.cmd run verify` | pass | lint、6 tests、40 harness checks、build |
| `npm.cmd run smoke:ui` | pass | PC/スマホスクリーンショット、30 tiles、行列select 100 options |

## 追加確認観点

- PC幅で左側の名簿編集行がレール幅を超えない。
- スマホ幅で行/列が数値入力ではなく選択式になる。
- 行/列の最大選択肢が100になる。

## 2026-05-03 出席番号方式

| チェック | 結果 | メモ |
| --- | --- | --- |
| `npm.cmd run verify` | pass | lint、8 tests、40 harness checks、build |
| `npm.cmd run smoke:ui` | pass | デフォルト出席番号方式、30 tiles、行列select 100 options |

## 追加確認観点

- 初期状態が出席番号方式になる。
- 5行×6列の初期教室で1番から30番まで自動作成される。
- 名前方式に切り替えると名前入力とCSV/TSV一括追加が使える。
