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

## 2026-05-03 性別初期値

| チェック | 結果 | メモ |
| --- | --- | --- |
| `npm.cmd run verify` | pass | lint、8 tests、40 harness checks、build |
| `npm.cmd run smoke:ui` | pass | 出席番号方式の表示と生成フロー |

## 追加確認観点

- 出席番号方式で自動作成される児童枠の性別が男子になる。
- 名前方式の新規追加フォームの性別初期値が男子になる。

## 2026-05-03 手動入れ替え

| チェック | 結果 | メモ |
| --- | --- | --- |
| `npm.cmd run verify` | pass | lint、9 tests、40 harness checks、build |
| `npm.cmd run smoke:ui` | pass | 生成後に席を選び、別席と入れ替えるフローを確認 |

## 追加確認観点

- 生成後に席を選択すると入れ替え先を選べる。
- 入れ替え後に現在プランと履歴の同一プランが更新される。
- 使用不可席と固定席は入れ替え対象外になる。
- GUIリッチ化前の復元タグ `current-ui-before-rich-gui-20260503` が存在する。

## 2026-05-03 生成画像3リッチGUI

| チェック | 結果 | メモ |
| --- | --- | --- |
| `npm.cmd run verify` | pass | lint、9 tests、40 harness checks、build |
| `npm.cmd run smoke:ui` | pass | 生成、席選択、手動入れ替え、30 tiles、行列select 100 options |
| Playwright screenshot | pass | `rich-gui-desktop-fixed.png` と `rich-gui-mobile-fit.png` で重なりなしを確認 |

## 追加確認観点

- 生成画像3の三列ワークベンチに合わせて、右側に比較サマリーと注意パネルが表示される。
- スマホ幅でも5x6座席表が1画面幅に収まり、下部ステータスバーが内容に重ならない。
- 手動入れ替え欄で選択席、入れ替え先、入れ替えボタンが横幅からはみ出さない。
- リッチGUI前の復元タグ `manual-swap-before-rich-gui-20260503` が存在する。

## 2026-05-03 ALERTS対象席の視覚化

| チェック | 結果 | メモ |
| --- | --- | --- |
| `npm.cmd run verify` | pass | lint、10 tests、40 harness checks、build |
| `npm.cmd run smoke:ui` | pass | 生成、席選択、手動入れ替え、30 tiles、行列select 100 options |
| Playwright alert screenshot | pass | `output/playwright/sekigae-alert-targets.png` で30席の注意バッジ表示を確認 |

## 追加確認観点

- 同じ席、同じ隣接、左右ペア、空席のALERTSから対象座席を復元できる。
- 対象席には `alert-target` と種類別classが付き、座席表上で注意バッジと強調枠が表示される。
- ALERTSパネルには対象席ラベルの抜粋が表示される。
