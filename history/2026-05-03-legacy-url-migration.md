# 2026-05-03 旧URL/localStorage互換

## 目的

旧 `https://notaboom.github.io/sekigae/` の利用者がURLを変えず、旧localStorageデータを意識せずに5.5相当へ移行できるようにする。

## 変更

- 旧localStorageキー `seat_shuffle_demo_v1` を読み取るマイグレーションを追加。
- 旧形式の `students`、`rows`、`cols`、`blocked`、`fixedMap`、`history`、`current`、`options` を5.5形式へ変換。
- 旧データは名前方式として取り込み、児童IDを維持して履歴と現在配置をつなげる。
- 新キー `sekigae_55_workspace_v1` が存在しない場合だけ旧キーから移行し、旧キーは削除しない。
- `VITE_BASE_PATH` でビルド時のbase pathを切り替えられるようにし、旧repo `notaboom/sekigae` へ `/sekigae/` ベースの成果物を配置できるようにした。

## 検証

- `npm.cmd run verify`: pass
- `npm.cmd run smoke:ui`: pass
- Vitestで旧localStorageサンプルからの移行と、アプリ初回起動時の自動移行を確認。

## 公開手順

1. `sekigae-5.5` を通常どおり `main` へpushする。
2. `$env:VITE_BASE_PATH = '/sekigae/'` でビルドする。
3. 生成された `dist/` を旧repo `notaboom/sekigae` の公開ルートへ配置する。
4. 旧URL `https://notaboom.github.io/sekigae/` で5.5相当の画面と旧データ移行を確認する。

