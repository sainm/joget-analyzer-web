# fixtures/ — 解析の動作確認用サンプル

本ツールを手元で試すための解析対象です。**解析対象であって、ツールの一部ではありません。**
`lib/project.js` の「ツール自身のディレクトリは解析しない」制約には `fixtures/` のみ例外を設けています。

## 収録内容

| パス | 内容 | ライセンス / 扱い |
|---|---|---|
| `enhanced-json-api-main/` | Joget マーケットプレイスプラグイン `org.joget.marketplace:enhanced-json-api` のソース（`pom.xml` + `src/main/java` + `properties/*.json` + `messages/*.properties`）と、同梱のサンプルアプリ `.jwa` | **Apache License 2.0**（`LICENSE` を同梱）。コミット対象 |
| `form-data-archive-tool/APP_FormDataArchiveToolSampleApp-7-20260116134435.jwa` | [jogetoss/form-data-archive-tool](https://github.com/jogetoss/form-data-archive-tool) の同梱サンプルアプリ。4 つのフォームが `section1` / `section2` という同じ項目ID を使い回す | **Apache License 2.0**（`LICENSE` を同梱）。コミット対象 |
| `jwt-sso-webservice/APP_jwtsso-1-20260604152808.jwa` | [jogetoss/jwt-sso-webservice](https://github.com/jogetoss/jwt-sso-webservice) の同梱サンプルアプリ。1 つのフォームの中に同じ項目ID（`public_key`）が 2 回定義されている。XPDL・SQL 副作用あり、`data/*.json` なし | **Apache License 2.0**（`LICENSE` を同梱）。コミット対象 |
| `rfq/APP_RFQ-1-20260131145603.jwa` | 業務アプリ「RFQ Management」のエクスポートパッケージ。多テーブル・承認プロセス・SQL 副作用を含む重い検証用 | 顧客資産。**`.gitignore` でコミット対象外**。手元にのみ配置 |

## 使い方

「ローカルプロジェクト」で次のいずれかを指定します（画面の「参照」から辿れます）。

```
fixtures/enhanced-json-api-main        # プラグインソース + アプリ → 突合まで通しで動く
fixtures/form-data-archive-tool        # .jwa 単体（突合なしの経路）
fixtures/jwt-sso-webservice            # .jwa 単体 + XPDL + SQL 副作用
fixtures/rfq                           # アプリ単体（手元に .jwa を置いた場合）
```

`fixtures/` を指定すると、独立したプロジェクトが複数あるため候補の選択を求められます
（他プロジェクトのファイルを混ぜないための仕様です）。

## 期待される結果

`enhanced-json-api-main` を指定した場合：

- 参照プラグインクラス **25** 件 → うち **5** 件がソースに命中、**20** 件がプラットフォーム標準、**0** 件がソース未提供
- **`autoHandleWorkflowVariable` が 2 箇所で「無効な設定項目」**と判定される
  （アプリは設定しているが、プラグインの properties 定義にも Java ソースにも存在しない）

この 25 という数字は、アナライザとは独立に次で確認できます。

```bash
unzip -p fixtures/enhanced-json-api-main/APP_EnhancedJSONAPISampleApp-1-20241101165150.jwa appDefinition.xml \
  | grep -o 'org\.joget\.[A-Za-z0-9_.$]*' | sort -u | wc -l
# => 25
```

`form-data-archive-tool` を指定した場合（プラグインソース無し＝突合なしの経路）：

- オブジェクト **158** 件（テーブル **4** / カラム **82** / フォーム **4** / フォーム項目 **32** / データリスト **4** /
  メニュー **5** / プロセス **1** / ノード **1** / プラグイン **25**）
- 未確認 **56** 件（定義欠落 **2** / 規約導出 **30** / ソース未提供 **24**）
- 静的チェックは **STRUCT 26** 件のみ。SQL は定義に無く、突合できないため CFG-DECL と REF-CLASS は未計測

**この素材を外せない理由**：4 つのフォームが `section1` / `section2` という同じ項目ID を使い回します。
項目の同一性を「項目ID だけ」で決めていると、別フォームの同名項目が 1 つに潰れ、一覧の行数が
総件数より増え（158 件のはずが 160 行）、`byKey` から引けないオブジェクトが生まれます
（詳細を開けない・関連が片側になる）。`test-object-model.mjs` の
「オブジェクトの key が一意」「byKey から全オブジェクトを引ける」と、`test-ui.mjs` の
「一覧の行数が件数表示と一致する（二重描画が無い）」がこの素材で初めて効きます。

`jwt-sso-webservice` を指定した場合（XPDL と SQL 副作用あり、`data/*.json` なし）：

- オブジェクト **132** 件（テーブル **3** / カラム **38** / フォーム **4** / フォーム項目 **34** / データリスト **2** /
  メニュー **6** / プロセス **1** / ノード **6** / SQL **1** / プラグイン **37**）
- 未確認 **66** 件（定義欠落 **3** / 規約導出 **26** / ソース未提供 **37**）
- SQL は **1** 件（`UPDATE app_fd_jwtsso_signup SET c_password=… WHERE c_username=…`）で、列まで読み取り済み。
  データモデル外のテーブルを参照する SQL は 0 件

**この素材を外せない理由**：フォーム `client` の中に項目ID `public_key` が 2 回定義されています。
「フォームID + 項目ID」を鍵にしても、フォームの中で ID が一意とは限りません。
2 つを区別する情報は定義側に無いため、モデルは 1 つにまとめ、まとめた事実を
静的チェック（STRUCT）の注記として残します。`test-object-model.mjs` の
「オブジェクトの key が一意」が、`form-data-archive-tool`（フォームをまたぐ同名）とは
別の形の衝突として、この素材で初めて効きます。

`rfq` を指定した場合（手元に .jwa があるとき）：

- テーブル **7** 件 / カラム **213** 件 / フォーム **8** 件
- プロセス **1** 件（承認フロー、ノード **5** 個）
- 参照プラグインクラス **50** 件（すべてプラットフォーム標準。ソース未提供のため突合はできない）
- SQL のうち **6** 件は `app_fd_` 済みの物理テーブル名を返す。命名規約の付与が二重になると
  `app_fd_app_fd_*` という実在しないテーブルを指すため、統合オブジェクトモデルの検査で検出する

`rfq` 自体は `.gitignore` 済みなので、clone 直後はこの検査が回りません。
自分の案件の `.jwa` を同じ場所に置いてください（自動検出されます）。

## テストから使う

```bash
npm run test:all   # fixtures/ 以下の解析対象をすべて自動検出して回す
```

対象を追加すれば、次回から検査対象になります。
実行できなかった対象はスキップとして一覧に出ます（門が黙って緑にはなりません）。

## 注意

`APP_*.jwa` を解析すると、その隣に同名の展開ディレクトリが生成されます（`*.jwa` を除いた名前）。
これは解析時の一時成果物で、`.gitignore` で除外しています。
