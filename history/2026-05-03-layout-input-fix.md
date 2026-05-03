# 2026-05-03 レイアウト/入力修正

## 背景

- PCから開いた際に左側の名簿レイアウトが崩れて見える。
- スマホで行/列を変更する際、数値入力の最低値1が邪魔になり、5を入力するのに一度15にしてから1を削るような操作になっていた。

## 実施内容

- 行/列入力を `input type="number"` から1〜100の `select` に変更。
- 教室サイズの内部上限を12から100に変更。
- 左側名簿の編集行を、名前+削除の行と、性別/視力/身長の属性行に分割。
- PC幅で名簿行が左レール幅を超えないCSSに修正。
- UIスモークに、行列selectが100 optionsを持つ確認とスマホスクリーンショットを追加。

## 検証

- `npm.cmd run verify`: pass
- `npm.cmd run smoke:ui`: pass
- PCスクリーンショット: `output/playwright/sekigae-home.png`
- スマホスクリーンショット: `output/playwright/sekigae-mobile.png`

## 次

- 公開デプロイ後にGitHub Pagesで実機確認する。
