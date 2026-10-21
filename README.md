# DeepSeek Harness — Browser Examples

DeepSeek-V4.1-Flash-1017 と DeepSeek Harness で制作した、ブラウザで動く4つのサンプルです。生成後に操作を確認し、公開に向けた改善を行っています。

**[デモを開く](https://hama-jp.github.io/deepseek-harness-browser-examples/)**

| サンプル | 内容 | デモ |
|---|---|---|
| Neon Velocity | ネオンのピンボール。左右のフリッパー、バンパー、ターゲット、得点倍率、3球制、合成サウンド | [遊ぶ](https://hama-jp.github.io/deepseek-harness-browser-examples/apps/pinball/) |
| Aquascape | 魚と水草が動くThree.jsの水槽。餌やりと一時停止 | [開く](https://hama-jp.github.io/deepseek-harness-browser-examples/apps/aquarium/) |
| Sakura Pagoda | 桜と池を備えた五重塔のボクセルアート。視点操作、昼夜切り替え、一時停止 | [開く](https://hama-jp.github.io/deepseek-harness-browser-examples/apps/pagoda/) |
| Lattice | 数式、セル参照、書式、範囲コピー、元に戻す操作、JSON/CSV入出力を備える簡易表計算 | [開く](https://hama-jp.github.io/deepseek-harness-browser-examples/apps/spreadsheet/) |

## ローカルで使う

各 `apps/*/index.html` はライブラリや音を含む単独のHTMLです。ファイルを保存してChromeで開けます。実行時のCDN、アカウント、APIキー、サーバーは不要です。3Dの2作品はWebGLを使用します。

ピンボールは **Z / ←** と **X / →** でフリッパーを操作し、**Spaceを押して離す**と発射します。**P / Esc** は一時停止、**M** はミュート、**R** は再スタートです。スマートフォンでは画面下のボタンを使います。音は最初の操作後に開始します。

Latticeは簡易表計算のデモです。Excelの全機能やXLSXには対応していません。ブラウザ内の保存に加えて、残したい表はJSONとしてダウンロードしてください。CSVはセルの値を受け渡す形式で、書式を含む完全な保存にはJSONを使います。

数式を `=` から入力すると、セルのクリックや矢印キーで参照先を選べます。ドラッグまたは **Shift＋矢印** で範囲を選び、**Enter** で確定、**Esc** で取り消します。**F2** または数式バー横の **Point / Caret** ボタンで、参照選択と文字カーソルの移動を切り替えられます。数式バーとセル内編集の両方で使えます。サンプルの表は右上の「…」から読み込めます。

Aquascapeは鑑賞・操作を楽しむ3Dシーンです。魚や水草の生物学的な再現や水質の予測を目的としたものではありません。

## 制作とレビュー

2台のDGX Spark上のDeepSeek-V4.1-Flash-1017（EXL3 EAQ v1、2.9 bpw）を、DeepSeek Harness 0.2.1-rc.2から使用しました。推論はHigh、コンテキストは262,144トークンです。課題の実装とモデル自身によるブラウザ確認はHarness内で行い、呼び出し側が別のブラウザで検収しました。

最初の課題文は [prompts/](prompts/) にあります。表計算・水槽・五重塔は初回に2時間の上限を設定しました。ピンボールは制作中に依頼者から時間より完成度を優先する指示があり、途中のレビュー指摘もモデルに渡しています。公開版は改善を含む作品集です。モデル同士を比較するベンチマークとしては扱っていません。

| 初回制作 | 経過時間 | 経過 |
|---|---:|---|
| 五重塔 | 90分53秒 | 運用上の中断から2回再開。中断時間を含み、初回の2時間枠内で終了 |
| アクアリウム | 81分35秒 | モデルが終了 |
| 表計算 | 78分46秒 | モデルが終了 |
| ピンボール | 109分05秒 | 制作中の追加指示と独立レビューのフィードバックを含み、モデルが終了 |

五重塔は途中で出力上限を32,768から131,072トークンに変更しました。後続の課題は131,072から開始しています。既存3作品の公開用修正は、原本から始めた別のHarness実行で、60分29秒で終了しました。試用で報告された表計算の参照色残りも、この修正に含みます。公開ページ・検証・梱包は呼び出し側が担当しています。

詳しい条件と公開版のハッシュは [制作条件](docs/conditions.json)、確認した操作と限界は [検証記録](docs/verification.md) にまとめています。

## ファイル構成

- `apps/` — 公開する単独HTML。3D作品には編集用ソースとビルド手順も同梱。
- `images/` — 公開版を実際にブラウザで表示したスクリーンショット。
- `prompts/` — 元の課題文と改善指示。
- `docs/` — 制作条件と検証記録。
- `licenses/` — 同梱ライブラリのライセンス。

表計算とピンボールはHTMLを直接編集できます。水槽は `apps/aquarium` で `npm ci`、`node build.mjs`、五重塔は `apps/pagoda` で `python3 build.py` によりHTMLを再生成できます。ビルド済みHTMLの利用にNode.jsやPythonは不要です。

サードパーティーの著作権表示は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
