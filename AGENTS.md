# dax5 ZMK設定開発ガイド

## ビルド手順

ビルドコマンドは `nix develop --command` 経由で実行する。対話型シェルに入る必要はない。

```bash
# 初回セットアップ（westワークスペース初期化）
nix develop --command just setup

# 全ターゲットビルド
nix develop --command just build

# 特定ターゲットのみビルド
nix develop --command just build-target dax5_R
nix develop --command just build-target dax5_L

# ビルド成果物の削除
nix develop --command just clean

# 完全クリーンアップ（.west/, modules/ 等を含むワークスペース再構築用）
nix develop --command just pristine
```

ビルド成果物は `build/` に出力される:
- `build/dax5_R.uf2` - 右手側（トラックボール + ZMK Studio）
- `build/dax5_L.uf2` - 左手側
- `build/settings_reset.uf2` - 設定リセット用

## 書き込み

右手側（central）は daxial の `pnpm flash <uf2>` で、bootloader キーを押さずに書き込める。キーボードが報告する名前と UF2 のファイル名の先頭が一致しないと何も送らない。再起動だけなら `pnpm flash --restart --keyboard dax5`。どちらも、書き込み済みのファームウェアに `dax_system`（`CONFIG_ZMK_DAX_SYSTEM_RPC`）が入っていることが前提で、シリアルポートを他のプログラムが掴んでいないこと。左手側は Studio を持たないので、従来どおり bootloader に入れて UF2 をコピーする。

## テスト（シミュレーター）

`tests/` に、ZMK の native_sim で動かすテストがある。模擬のキー入力とポインター入力を流し、出てくる HID レポートを期待値（`keycode_events.snapshot`）と比べる。

```bash
just test                       # 全部
just test tests/combos          # 1 件
ZMK_TESTS_AUTO_ACCEPT=1 just test tests/combos   # 期待値を書き換える（差分は必ず目で見る）
ZMK_TESTS_RESYNC=1 just test    # west update のあと
```

| テスト | 確かめていること |
|---|---|
| `esc-lang2` | 親指キーの tap が ESC → LANG2 を出し、hold がレイヤーを切り替える（実行時マクロの既定値がスロット 0 に入る） |
| `combos` | 実行時 combo の既定値が発火する。`layers` に無いレイヤーが最上位のときは発火しない |
| `trackball-pointer` / `-fixed` | `tb_pointer` の出力が、置き換え前の `zip_xy_transform (XY_SWAP \| Y_INVERT)` と同じ |
| `gestures` | `config/gestures.dtsi` の組が、保持しているレイヤーに応じて切り替わる（Gesture → 戻る、MacGesture → Spotlight、何も保持しない → カーソル移動） |
| `trackball-scroll` / `-fixed` | Scroll レイヤーの出力が、置き換え前の固定の処理と同じ（端数の持ち越しを含む） |

- Docker が要る。ワークスペースを Docker のボリューム（`dax5-zmk-tests`）に写してから実行する。Zephyr と `modules/` は初回だけ写す
- `-fixed` の 2 件は比較の基準で、対になるテストと期待値が同じであることに意味がある
- 模擬キー入力（`ZMK_MOCK_PRESS(row, col, ms)`）の `ms` は「次のイベントまでの間隔」。最初のイベントの前にも同じ時間だけ待つ

## ディレクトリ構造

- `module/` - 空の CMakeLists.txt / Kconfig。west が Zephyr を `./zephyr` に取得するため、明示しないとこの repo の Zephyr モジュール定義が Zephyr 本体の `zephyr/CMakeLists.txt` を拾ってしまう
- `tests/` - native_sim のテストと実行スクリプト
- dax 系で共有する自作モジュール（マウスジェスチャー、OS レイヤー、トラックボールの CPI 設定、実行時 combo）は別 repo [`wadackel/zmk-dax-modules`](https://github.com/wadackel/zmk-dax-modules) にあり、`config/west.yml` から SHA で参照する
- `boards/shields/dax5/` - Shield定義（dtsi, overlay, conf, Kconfig）
- `config/` - キーマップ（`dax5.keymap`）、`west.yml`、ZMK Studio用 JSON
- `tools/tester/` - キーマップテスターWebアプリ（Vite + HonoX）
- `docs/` - 詳細な学びのドキュメント

## ハードウェア仕様

### Split キーボードアーキテクチャ

- `dax5_R`（右手）が **central**。キーマップ・レイヤー管理・トラックボールを担当
- `dax5_L`（左手）が **peripheral**。エンコーダ入力のみ、レイヤー関連の設定は不要
- keymap に関わる設定は `dax5_R.conf` のみに記述する

### マトリクス構成

- 計 **44 キー**（左 23 + 右 21）。XIAO のピンマップは Row0..3 = D0..D3、Col0..6 = D4,D5,D6,P0.15,P0.19,P1.01,P0.09
- `default_transform.map` の row 分布: **R0=12 / R1=12 / R2=14 / R3=6**
- 左の thumb (R3) は C3..C6 の 4 key、右の thumb (R3) は C7..C8 の 2 key（trackball が右 thumb 領域を占有）
- 内側外列（LC6 = SW22 / RC7 = SW1）は R2 のみに存在し、R0/R1 には C6/C7 スロットが無い
- dax4 (48 key, R3=12) からの差分: 右 thumb を大きく縮小（-6）、R2 に外側 c6 (L SW22) と c7 (R SW1) を追加（+2）、R0/R1 は据置

### PAW3222 トラックボール

dax5 は PAW3222 (PixArt) を採用する。PMW3610 とは異なり、ドライバ自体は orientation / invert / scroll-layers のような Kconfig を持たず、raw `INPUT_REL_X` / `INPUT_REL_Y` のみを発行する。挙動チューニングは ZMK の input-processor チェーンで行う (`boards/shields/dax5/dax5_R.overlay`)。

#### 構成の全体像

`trackball_listener` (`zmk,input-listener`) の input-processors チェーン:

- **base chain**: `<&tb_pointer>, <&dax_gestures>`
  - `tb_pointer` が物理方向 → ユーザ視点方向への補正と倍率を担う（実行時に調整できる。定義は `trackball_processors.dtsi`）
  - `dax_gestures` がマウスジェスチャーを判定する（定義は `config/gestures.dtsi`、モジュールは `zmk-dax-modules`）
- **scroll_override** (Scroll レイヤー = 5): `<&tb_pointer>, <&zip_xy_to_scroll_mapper>, <&tb_scroll>`
  - `zip_xy_to_scroll_mapper` が X→HWHEEL, Y→WHEEL に変換する
  - `tb_scroll` が向きの反転と粗さ（既定 1/64、分母が大きいほどゆっくり）を担う

`tb_pointer` は反転を「入替の前の軸」で判定する。`xy-swap-enabled; x-invert;` が、以前の `zip_xy_transform (XY_SWAP | Y_INVERT)` と同じ結果になる。Scroll レイヤーのチェーンでも先頭にいるので、その倍率はスクロールにも掛かる。

#### マウスジェスチャー

base chain に `dax,input-processor-gesture` を 1 つだけ置き、どのジェスチャーの組を使うかはアクティブなレイヤーで選ぶ（`config/gestures.dtsi`）。

| 組 | 有効になる条件 | 内容 |
|---|---|---|
| `browse` | Gesture レイヤー（8）を保持 | 左右 → 戻る・進む、上下 → 先頭・末尾 |
| `mac` | MacGesture レイヤー（7）を保持 | 上下左右 → デスクトップ表示、Mission Control、App Exposé、Spotlight |

- 組が有効な間、カーソルは止まる（`suppress-movement`）
- Gesture レイヤーと MacGesture レイヤーは、キーを 1 つも変えない。ジェスチャーを有効にする目印としてだけ存在する。Mouse レイヤーの `&mo 8` / `&mo 7` で保持する
- ジェスチャー 1 つにつき behavior は 1 つ

#### Transform flag の意味

`<&zip_xy_transform FLAGS>` の `FLAGS` は `<dt-bindings/zmk/input_transform.h>` のビット OR:

- `INPUT_TRANSFORM_XY_SWAP` — X と Y を入れ替え
- `INPUT_TRANSFORM_X_INVERT` — X 軸反転
- `INPUT_TRANSFORM_Y_INVERT` — Y 軸反転

`zip_scroll_transform` も同じビットを使う (`INPUT_REL_WHEEL` / `INPUT_REL_HWHEEL` に対して効く)。

PMW3610 の `CONFIG_PMW3610_ORIENTATION_180` + `CONFIG_PMW3610_INVERT_X` + `CONFIG_PMW3610_INVERT_Y` の net 効果は `x = -raw_x, y = raw_y` で、PAW3222 で再現するなら `<&zip_xy_transform (INPUT_TRANSFORM_X_INVERT)>` 相当 (実機調整必須)。

#### CPI / 感度

CPI は DTS の `res-cpi` プロパティで設定 (`res-cpi = <1000>` で PMW3610_CPI=1000 相当)。範囲は driver の `RES_MIN=608` 〜 `RES_MAX=4826` (`zmk-driver-paw3222/src/paw3222.c` の `RES_STEP * 16..127`)。

### ロータリーエンコーダ
- **型番**: EC11
- **steps**: 80 (1回転あたりのパルス数)
- **デテント数**: 24 (1回転あたりのクリック数)

## ZMKロータリーエンコーダ設定の絶対ルール

### ⚠️ 重大な制約

#### 1. `tap-ms`は16ms以上必須

```c
// config/dax5.keymap
dax_enc_scroll: dax_enc_scroll {
  compatible = "dax,behavior-encoder";
  tap-ms = <20>;  // ✅ OK: 16ms以上
  // tap-ms = <10>;  // ❌ NG: スクロールが一切動かなくなる
  // tap-ms を書かない  // ❌ NG: binding の既定値は 5
};
```

dax のエンコーダー behavior は `&kp` を割り当てたもの（`dax_enc_vol` / `dax_enc_bri`）も含め、すべて `tap-ms = <20>` にする。daxial は割当を変えるとき、その方向の今の tap を引き継ぐので、既定 5 のままのレイヤーに後から `&msc` を割り当てると無反応になる。

**理由:**
- `&msc`（スクロール）の内部イベント周期は**16ms**
- `tap-ms < 16ms`だと押している間に**1回もイベントが出ずゼロ**になる
- 結果として**スクロールが完全に無反応**になる

**症状:**
- エンコーダ自体は動作する（音量調整などは反応する）
- スクロールだけが一切反応しない
- ビルドエラーは出ない（実行時の問題）

### 2. `triggers-per-rotation`は`steps`の整数約数から選ぶ

```dts
// boards/shields/dax5/dax5.dtsi
sensors: sensors {
  triggers-per-rotation = <40>;  // steps(80)の約数 = 2 pulses/trigger
};
```

**理由:**
- ZMK sensor は `steps ÷ triggers-per-rotation` の pulses を貯めて 1 回発火する（アキュムレータ方式）
- **非整数比だと休止からの最初の1デテントで閾値未満になり空振りする**
- 例: `24` に合わせると `80÷24=3.33 pulses/trigger`。EC11 の 1 デテントは物理的に 3〜4 pulses ぶれるので、最初のデテントが 3 pulses しか出ない場合 3.33 に届かず**初動が空振り**
- 整数比なら 1 pulse ぶれでも閾値到達が確実になる

**80 steps 環境での選択肢:**
- `40` → 2 pulses/trigger（**推奨**: 初動が半デテントで即発火、体感が最も軽い）
- `20` → 4 pulses/trigger（1 デテントで 1 発火弱、初動 1 デテントは空振りしやすい）
- `24`（=デテント数）→ 3.33 pulses/trigger、**非整数比のため初動空振りが起きる**（過去の推奨だが劣る）

**トレードオフ:**
- `40` は 1 デテントで 1.67 発火 → 速い回転でオーバースクロールしやすい
  - 相殺策として `SCRL_VAL` を下げる（デテント数一致設定の 170 相当 → 120 に）
- 1 デテント= 1 発火の見た目より、**「休止からの空振りゼロ」を優先した方が体感が明確に良い**

**誤解しやすいポイント:**
- 「デテント数に合わせる」は初動空振り問題を無視した簡略化ルール。整数比を優先する方が実運用で優れる
- 小さくすれば敏感になると思いがち（実際は逆で、1 発火に必要な pulses が増える）

### 3. スクロール速度は`SCRL_VAL`で調整

```c
// config/dax5.keymap
#define ZMK_POINTING_DEFAULT_SCRL_VAL 120
```

**理由:**
- 反応性は`triggers-per-rotation`で決まる
- スクロール量は`SCRL_VAL`で決まる
- **役割を分けて調整する**

**macOS環境の注意:**
- 60だと小さすぎてmacOSが認識しない
- 120以上が安全圏

**調整目安（triggers-per-rotation=40 前提）:**
- 速い→140-160、遅い→100
- `triggers-per-rotation` を 24 や 20 に変える場合、1 回転あたりの発火数が減るぶん `SCRL_VAL` を比例で上げる（40+120 で total 4800 が基準）

完全な動作設定は `config/dax5.keymap` と `boards/shields/dax5/dax5.dtsi` を参照。

## トラブルシューティング

### ZMK で OS を自動検出できるか？

**できない。** ZMK 本体に OS 自動検出機能は存在しない（main 系でも同じ）。USB HID descriptor 分析（QMK の `os_detection`）も
BLE GATT 経由の OS 識別も未実装。BLE profile ベースのマッピングが唯一の手段。

dax5 はこの仕組みを使っていない。使うなら `zmk-dax-modules` の `CONFIG_ZMK_OS_LAYER=y` と
`CONFIG_ZMK_OS_LAYER_PROFILE_N=<layer>` を `dax5_R.conf` に加え、keymap に対応するオーバーレイレイヤーを足す（dax6 が実例）。

### ZMK 本体は cormoran fork（main 系）

`config/west.yml` の `zmk` は upstream ではなく `cormoran/zmk` の `main+custom-studio-protocol` を SHA で固定している。ZMK main（Zephyr 4.1）に custom Studio RPC を足したもので、設定アプリ daxial が使う実行時設定のモジュールはこの RPC に載る。構成は dax6 と同じで、判断根拠は dax6 側の ADR-0012 にある。

- ボード名は `xiao_ble//zmk`（v0.3 系の `seeeduino_xiao_ble` から変わった）
- `zmk` を更新するときは、`zmk-dax-modules` の `src/combo/combo_engine.c` を新しい `app/src/combo.c` と比べる。combo の判定は `1fc72aaf` の `combo.c` の写し
- 外部モジュールはすべて SHA で固定する。`revision: main` や tag の直当ては、将来の更新で壊れるので使わない
- v0.3 系へ戻すなら `zmk-rgbled-widget` は `a3510c9d`（`seeeduino_xiao_ble` に対応する最後の版）

### Nix のビルド環境で詰まりやすい点

- **SDK は 0.17.0 に固定している。** Zephyr 4.1 が想定する版で、zephyr-nix の `sdk-0_17`（0.17.4）は同梱の picolibc のロック型が変わっており `locks.c` がコンパイルできない
- **`nixpkgs` は更新しない。** 新しい nixpkgs は `python310` を持たず、zephyr-nix の評価が darwin で失敗する。`nix flake update` は `zephyr` と `zephyr-nix` だけを対象にする
- **nanopb の生成には protobuf と grpcio-tools が要る。** Zephyr 4.1 の requirements に含まれないので `pythonEnv` に足している

### zmk-driver-paw3222

PAW3222 ドライバは raw `INPUT_REL_X` / `INPUT_REL_Y` のみ発行する設計のため、orientation /
invert / scroll-layers は **driver Kconfig ではなく ZMK input-processor** で実装する。
詳細は上の「PAW3222 トラックボール」節を参照。

### スクロールが一切反応しない

**チェック項目:**
1. `tap-ms`が16ms以上か？
   - → 20msに設定
2. `SCRL_VAL`が大きすぎないか？
   - → macOSでは120以上推奨
3. ファームウェアは左右両方フラッシュしたか？
   - → 両方フラッシュ必須

### ゆっくり回転すると反応しない

**原因:**
- `triggers-per-rotation`が小さすぎる
- → デテント数（24）に設定

### 速く回転するとバースト的にスクロール

**原因:**
- `tap-ms`が長すぎる（100msなど）
- → 20msに設定

## 実行時設定（daxial）

`dax5_R` に設定アプリ [daxial](https://wadackel.github.io/daxial/) から USB で接続すると、再ビルドなしで設定を変えられる。左右とも USB でつなぐとポートが 2 つ出るが、応答するのは右手側（central）だけ。

| 機能 | 仕組み（custom subsystem の識別子） |
|---|---|
| キー割当・レイヤー名 | 公式 ZMK Studio の RPC |
| エンコーダーの回転割当（レイヤー別・方向別） | `zmk-dax-modules` の `src/encoder/`（`dax_encoder`、値は `dax_settings` 経由） |
| トラックボールの向き・倍率、Scroll レイヤーの向き・粗さ | `zmk-dax-modules` の `src/pointer/`（`dax_pointer`、値は `dax_settings` 経由） |
| combo | `zmk-dax-modules` の `src/combo/`（`dax_combo`） |
| マクロ | `zmk-dax-modules` の `src/macro/`（`dax_macro`） |
| マウスジェスチャー | `zmk-dax-modules`（`dax_gesture`、値は `dax_settings` 経由） |
| PAW3222 の CPI | `zmk-dax-modules`（`dax_trackball`、値は `dax_settings` 経由） |

- **keymap / overlay に書いた値は既定値で、アプリで保存した値が優先される。** 既定値を書き換えてフラッシュしても、保存済みの項目には反映されない。既定値に戻すにはアプリの reset か `settings_reset.uf2`（BLE のボンドも消える）
- 設定の置き場は `zmk-dax-modules` の保存層（Zephyr の settings の `dax/<owner>/<key>`）。どの編集も Save まで RAM にあり、Discard で戻る
- cormoran の `zmk-feature-custom-settings`、`zmk-module-runtime-input-processor`、`zmk-behavior-runtime-sensor-rotate`、`zmk-feature-runtime-macro` で保存した値は引き継いでいない。flash に残るが読まれない
- combo は `config/dax5.keymap` の `runtime_combo_defaults`（`dax,runtime-combo-defaults`）に書く。`zmk,combos` のノードは無い
  - 判定は ZMK の `src/combo.c` の写しで、`zmk,combos` と同じに振る舞う。hold-tap の後、keymap の前でキーを受け取る。判断根拠は dax6 側の ADR-0015
  - cormoran の `zmk-feature-runtime-combo` で保存した combo は引き継いでいない。flash に残るが読まれない
- マクロは `&dax_macro <slot>` で、`zmk,behavior-macro` のノードは無い。`esc_lang2` は `config/dax5.keymap` の `runtime_macro_defaults`（`dax,runtime-macro-defaults`）にある既定値で、`&esc_lang2_with_layer 3 0` の `0` が `esc_lang2` の `slot`
- **マクロのスロットは固定。** 既定値は `slot` で置き場所が決まり、アプリで名前を変えてもスロットは変わらない。既定値を足すときは空いている番号を `slot` に書く
- **起動時に出る Studio の通知は、合計 256 バイトまでしか溜められない**（`CONFIG_ZMK_STUDIO_RPC_TX_BUF_SIZE`）。満杯になるとキー入力ごとキーボードが止まる。マクロとジェスチャーの既定値は通知を出さない
- 全レイヤーの `sensor-bindings` は zmk-dax-modules の `dax,behavior-encoder`（`dax_enc_scroll` / `dax_enc_scroll_rev` / `dax_enc_hscroll` / `dax_enc_vol` / `dax_enc_bri`）を指す。`dax_enc_*` 以外にしたレイヤーはアプリから編集できない。割当はセンサー × layer id × 方向ごとで、Reset も含め Save まで RAM にある
- 実行時に変えられないもの: エンコーダーの `triggers-per-rotation`、hold-tap のタイミング

## 現在のレイヤー構成

| 番号 | 名前 | 説明 |
|------|------|------|
| 0 | default_layer | デフォルト |
| 1 | Symbol | 記号 |
| 2 | Num | 数字 |
| 3 | Function | ファンクション・矢印 |
| 4 | Mouse | マウスボタン |
| 5 | Scroll | スクロールモード |
| 6 | Device | BLE設定 |
| 7 | MacGesture | macOS用マウスジェスチャの目印 (Mouse layerから保持) |
| 8 | Gesture | 通常のマウスジェスチャの目印 (Mouse layerから保持) |

## CI / デプロイ

### ファームウェアビルド
- `.github/workflows/build.yml` - push/PR/手動トリガーで実行
- ZMK の reusable workflow（`zmkfirmware/zmk/.github/workflows/build-user-config.yml` を upstream main の SHA で固定）を使用。workflow 自体は upstream のものだが、ビルドする ZMK は `config/west.yml` が指す cormoran fork
- ビルド対象は `build.yaml` で定義（`build.yml` と混同しないこと）

### テスター (tools/tester)
- `.github/workflows/deploy-tester.yml` - main ブランチへのプッシュで自動デプロイ（手動トリガーも可）
- URL: `https://wadackel.github.io/zmk-config-dax5/`
- node/pnpm バージョンは `.mise.toml` で管理（source of truth）
- `tools/tester/package.json` の `packageManager` は corepack 互換のため同期して更新すること

### ローカル keymap editor (`just editor` で起動)
- `just editor` で `tools/tester` の dev server を起動: editor は `/`、tester は `/tester`
- `pnpm dev` 時のみ `/api/keymap*` エンドポイントが有効。production GitHub Pages build は editor を含まず `/` = tester に切替（`routes/index.tsx` 内の `import.meta.env.DEV` 分岐）
- `config/dax5.keymap` を **byte-preserving patch writer** 方式で直接編集。bindings / combos / macros / behaviors / sensor-bindings / mouse-gesture ブロックを GUI で編集可能
- Save 時に diff preview + lint 結果ダイアログ → Confirm で atomic write + mtime check
- 詳細は [tools/tester/README.md](./tools/tester/README.md) と [tools/tester/app/lib/keymap-dt/README.md](./tools/tester/app/lib/keymap-dt/README.md)

## 参考ドキュメント

- [詳細な学び](./docs/encoder-tuning-learnings.md) - 試行錯誤の過程と深い理解
- [ZMK Documentation](https://zmk.dev/)
