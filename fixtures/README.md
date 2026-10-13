# fixtures/ — 解析の動作確認用サンプル

本ツールを手元で試すための解析対象です。**解析対象であって、ツールの一部ではありません。**
`lib/project.js` の「ツール自身のディレクトリは解析しない」制約には `fixtures/` のみ例外を設けています。

## 収録内容

| パス | 内容 | ライセンス / 扱い |
|---|---|---|
| `enhanced-json-api-main/` | Joget マーケットプレイスプラグイン `org.joget.marketplace:enhanced-json-api` のソース（`pom.xml` + `src/main/java` + `properties/*.json` + `messages/*.properties`）と、同梱のサンプルアプリ `.jwa` | **Apache License 2.0**（`LICENSE` を同梱）。コミット対象 |
| `rfq/APP_RFQ-1-20260131145603.jwa` | 業務アプリ「RFQ Management」のエクスポートパッケージ。多テーブル・承認プロセス・SQL 副作用を含む重い検証用 | 顧客資産。**`.gitignore` でコミット対象外**。手元にのみ配置 |

## 使い方

「ローカルプロジェクト」で次のいずれかを指定します（画面の「参照」から辿れます）。

```
fixtures/enhanced-json-api-main        # プラグインソース + アプリ → 突合まで通しで動く
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

## 注意

`APP_*.jwa` を解析すると、その隣に同名の展開ディレクトリが生成されます（`*.jwa` を除いた名前）。
これは解析時の一時成果物で、`.gitignore` で除外しています。
