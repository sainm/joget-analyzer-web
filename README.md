# joget-analyzer-web

Joget DX のアプリケーションパッケージ（`.jwa`）とプラグインソースを**リバース解析**するツールです。プロジェクトディレクトリを指定すると、設計書・影響分析・呼び出し関係図・RAG チャンクを自動生成します。

UI は**日本語**です。

> 事実は解析で · 意味づけは AI で —— 構造的な結論はすべてローカル解析によるもので、外部サービスもデータベースも使いません。

---

## 入力方法

**ローカルプロジェクトのディレクトリを指定**するのが基本です。Joget プロジェクトの標準構成：

```
my-joget-project/
├── pom.xml                               ← Maven 座標
├── src/main/java/...                     ← プラグイン／ユーティリティのソース
├── src/main/resources/properties/*.json  ← コンポーネント設定項目の定義
├── src/main/resources/messages/*.properties
└── APP_XXX-1-2024....jwa                 ← プロジェクト同梱のサンプルアプリ
```

ディレクトリ内を自動判別し、`.jwa` をアプリとして、Maven プロジェクトをプラグインソースとして解析したうえで、**両者を突合**します。

「ファイルをアップロード」から `.jwa` 単体（任意でプラグインソースの zip を添付）を解析することもできます。

## 生成物

| 生成物 | 内容 |
|---|---|
| `app_summary.json` | フォーム / データリスト / メニュー / XPDL プロセス / テーブルモデル / SQL 副作用 / 影響マトリクス |
| `plugin_manifest.json` | プラグインコンポーネント、設定項目定義、クラス呼び出し関係 |
| `correlation.json` | **アプリ設定 ↔ プラグインソースの三者突合** |
| `design_doc.md` | 全 7 章の設計書（2.3 突合章を含む） |
| `rag_chunks.jsonl` | 18 種類のチャンク。そのままベクトル化して投入可能 |

## セットアップ

```bash
npm install
npm start          # http://localhost:3000
```

開発モード（フロントのホットリロード）：

```bash
npm run dev        # Vite dev server（/api は 3000 にプロキシ）
npm start          # 別ターミナルでバックエンドを起動
```

## 画面

| タブ | 内容 |
|---|---|
| 概要 | アプリ情報、フォーム定義、データリスト、メニュー構成 |
| 影響分析 | 読み書き影響マトリクス、テーブル間関連の推定、プロセス SQL 副作用、問題リスト |
| アプリ↔ソース | 設定項目の三者突合、無効設定の警告、コンポーネント別対照、絞り込んだ呼び出し関係図 |
| プラグインとデータソース | プラグイン一覧、設定項目、呼び出し関係、データソース参照、サーバ側の不足分 |
| 可視化 | フロー図 / ER 図 / 読み書き影響図 / メニュー構成図 / 呼び出し関係図 |
| 設計書 | 解析結果から生成した設計書（`.md` ダウンロード可） |
| RAG チャンク | チャンクの閲覧と検索（`.jsonl` ダウンロード可） |

## 設計上の要点

**1. テーブルモデルはフォーム定義を基準にします。** `.jwa` 内の `data/*.json` は、エクスポート時に「データを含める」を選んだ場合にのみ存在します。そのため物理テーブルはフォーム定義から導出します：`tableName` → `app_fd_<tableName>`、フィールド → `c_<fieldId>`（レイアウト要素は除外）。さらに `id / dateCreated / dateModified / createdBy / modifiedBy` の監査列を補います。サンプルデータはサンプル値と件数の補完にのみ使用するため、データをエクスポートしていなくても ER 図が空になることはありません。

**2. 解析範囲を単一プロジェクトに厳密に限定します。**

- ツール自身のディレクトリは決して走査対象にしません。
- `.jwa` は「同一ディレクトリまたは上位ディレクトリ」の Maven ルートとのみ対応付け、下位ディレクトリとは対応付けません。
- ディレクトリ内に独立したプロジェクトが複数ある場合は自動選択せず、明示的な指定を求めます。

目的は**別プロジェクトのファイルを混在させないこと**です。

## 動作確認

`fixtures/` に解析用のサンプルを同梱しています（詳細は `fixtures/README.md`）。

```bash
npm start                                  # 別ターミナルで起動しておく
npm run verify:lang                        # 日本語のみになっているかのゲート
npm run test:ui                            # UI スモークテスト（Playwright）
npm run test:engine                        # 解析エンジン単体
npm run test:mermaid                       # 生成した Mermaid がパースできるか
npm run test:plugin                        # プラグインソースのスキャン
npm run test:correlate                     # アプリ設定 ↔ プラグインソース突合
```

| スクリプト | 内容 | 顧客アプリの `.jwa` が必要か |
|---|---|---|
| `npm run verify:lang` | 簡体字・中国語句読点の残留検査（0 件で合格） | 不要 |
| `npm run test:ui` | UI スモークテスト | 不要 |
| `npm run test:plugin` | プラグインソースのスキャン | 不要 |
| `npm run test:correlate` | アプリ設定 ↔ プラグインソース突合 | 不要 |
| `npm run test:engine` | 解析エンジン単体テスト | **必要** |
| `npm run test:mermaid` | 両フィクスチャの Mermaid 生成 | **必要** |

同梱するのは Apache-2.0 のオープンソース素材（`fixtures/enhanced-json-api-main`）のみで、
顧客アプリの `.jwa` は業務定義そのものなのでコミットしていません。
そのため、クローン直後は「必要」列が**必要**のテストだけが動きません。
`JOGET_PROJECT` で対象を差し替えれば、どのテストも手元のアプリに対して実行できます。

```bash
JOGET_PROJECT=/path/to/your-project npm run test:engine
```

`fixtures/enhanced-json-api-main` を指定すると、参照プラグインクラス 25 件のうち 5 件がソースに命中し、
`autoHandleWorkflowVariable` が 2 箇所で「無効な設定項目」と判定されるはずです。

## 技術スタック

解析は純粋な Node.js（Express + adm-zip + fast-xml-parser）、フロントは React 18 + Vite + Tailwind CSS v4、図は Mermaid をフロント側で描画。**データベースは使用しません** —— 結果は `data/runs/<id>/out/` に出力されます。
