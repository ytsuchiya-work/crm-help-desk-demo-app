# OfficePulse CRM ヘルプデスク — Churn 可視化デモ

サービス提供会社（SaaS ベンダー）のカスタマーサポート／カスタマーサクセス業務向け
**ヘルプデスク統合 CRM** のデモアプリです。顧客のサービス利用状況・サポート履歴・契約情報を
もとに **チャーン（解約）リスクを可視化**し、**AI が推奨アクションまでレコメンド**する部分を
主役機能として実装しています。Databricks Apps 上で動作します。

> **注意（デモ用の仮想設定）**
> 実在の企業・製品を避けるため、すべて架空の名称を使用しています。
> - SaaS ベンダー: **CloudNest 株式会社**
> - 製品: **OfficePulse**（出社検知・オフィス運用 SaaS。貸出デバイス + アプリで構成）
> - 顧客: 「みなと商事」「関西フードサービス」等の仮想企業 20 社
>
> 実データ（例: WHERE 社 / EXOffice 等）は含まれません。GA4・Zendesk 相当のデータは
> すべて合成データです。

---

## 1. デモの概要

CS/AM チームが日々の運用で使う 1 画面完結の CRM です。主な価値提案:

- **チャーンリスクの可視化**: 利用シグナル（ログイン率・出社検知率・インストール率など）、
  サポート状況（未解決チケット・低 CSAT・解約検討の問い合わせ）、契約情報（自動更新オフ等）を
  0〜100 のリスクスコアに合成し、高/中/低で色分け表示。
- **AI 推奨アクション**: Databricks 基盤モデル（Claude）が、リスクの根拠・主要因・優先度付きの
  推奨アクション・顧客との会話に使えるトークスクリプトを日本語で生成。
- **ヘルプデスク（チケット管理）**: Zendesk 相当の問い合わせを一覧・検索・ステータス更新・返信・
  新規作成。CSAT・一次応答時間などの KPI も表示。
- **自然言語分析（Genie）**: Databricks AI/BI Genie Space に接続し、利用状況やチャーンを
  自然言語で探索（NL → SQL → 結果）。

## 2. 主要画面

| 画面 | 内容 |
|------|------|
| ダッシュボード | 5 大 KPI（ログイン率／登録率／出社検知率／インストール率／アプリ設定良好率）＋週次トレンド＋サマリ |
| チャーンリスク | リスクスコア順の一覧、詳細ドロワーで利用トレンド・契約情報・**AI 推奨アクション** |
| アカウント | 業界・取引ステータス・リスク帯での絞り込み検索、CSV ダウンロード |
| ヘルプデスク | チケット一覧・検索・詳細（対応履歴タイムライン）・ステータス更新・返信・新規作成 |
| スケジュール | メンバー横断の週間ビュー（確定済み／リスク対応レコメンドを色分け） |
| オンボーディング | オンボーディング中アカウントのフェーズ・進捗率 |
| フィードバック | 製品要望の収集・優先度・ステータス管理 |
| Genie | 自然言語でのデータ探索（本物の Genie Space に接続） |

ライトモード・ダークモードの両方で視認性を最適化しています（右上のトグルで切替）。

## 3. 使用データ

すべて `ytcy_azure_east2classic_stable.crm_help_desk_demo`（Unity Catalog）の Delta テーブル。
`data/generate_data.py` で合成・投入します。

| テーブル | 内容 | 元データ相当 |
|----------|------|--------------|
| `accounts` | 顧客マスタ（企業名・業界・プラン・ステータス・ARR・担当 CSM） | CRM |
| `contracts` | 契約情報（契約ID・利用開始日・利用終了日・貸出端末・利用サービス・解約理由） | 契約管理 |
| `usage_metrics` | 週次のプロダクト利用率（login/signup/attendance_detect/install/app_config_ok、DAU 等） | **GA4** |
| `tickets` | サポート問い合わせ（件名・カテゴリ・優先度・ステータス・CSAT・一次応答時間） | **Zendesk** |
| `ticket_events` | チケットの対応履歴（顧客/担当の発言タイムライン） | **Zendesk** |
| `schedule` | CS/AM の週間予定（確定／レコメンド） | 社内 |
| `feedback` | 製品要望・改善提案 | 社内 |
| `churn_history` | 月次のチャーン件数・新規件数・失注 ARR | 社内 |

利用終了日（`end_date`）は利用中の顧客では空欄（NULL）です。

## 4. 使用技術

- **フロントエンド**: React 19 + TypeScript + Vite、React Router、Recharts（チャート）、lucide-react（アイコン）。
  CSS 変数によるライト/ダークテーマ。
- **バックエンド**: FastAPI（Python 3.11+）、`databricks-sdk` に統一
  （SQL Warehouse の Statement Execution / 基盤モデルの serving_endpoints.query / Genie / 認証）。
- **データ基盤**: Unity Catalog（Delta）、Serverless SQL Warehouse（Statement Execution API）。
- **AI**: Databricks Foundation Model `databricks-claude-sonnet-4-5`（推奨アクション生成）、
  AI/BI Genie Space（自然言語 → SQL）。
- **実行環境**: Databricks Apps（pip + `requirements.txt`、`app.yaml` で設定）。

## 5. アーキテクチャ

```
┌──────────────────────────────────────────────────────────────┐
│                      Databricks App                            │
│                                                                │
│  React SPA (frontend/dist)  ──/api/*──►  FastAPI (app.py)      │
│   - Dashboard / Churn / Tickets ...      - routes/*.py         │
│                                          - churn.py (スコア算出)│
│                                          - llm.py  (推奨生成)   │
│                                          - db.py   (SQL 実行)   │
└───────────────┬───────────────┬───────────────┬───────────────┘
                │               │               │
        SQL Warehouse    Foundation Model    Genie Space
        (UC 直読)         (Claude Sonnet)     (NL → SQL)
                │
        Unity Catalog: ytcy_azure_east2classic_stable.crm_help_desk_demo
        (accounts / contracts / usage_metrics / tickets / ...)
```

- **唯一の真実は UC の Delta テーブル**。アプリは SQL Warehouse 経由で直読し、
  チケット/フィードバックの更新も UC に書き戻します。
- **チャーンスコアはルールベース**（`server/churn.py`）で説明可能。その上で LLM が
  根拠と推奨アクションを自然言語化します（ハイブリッド方式）。
- 認証はローカル（CLI プロファイル）と Databricks Apps（サービスプリンシパル）の
  デュアルモード（`server/config.py`）。

## 6. デモの流れ（おすすめシナリオ）

1. **ダッシュボード**で全社の 5 大 KPI と解約リスク件数を俯瞰。前週比の増減を確認。
2. **チャーンリスク**タブへ。リスクスコア順で「関西フードサービス」等の高リスク顧客を確認。
3. 行をクリック → 詳細ドロワーで**利用トレンドの下降**と**契約情報**（貸出端末・利用サービス）を確認。
4. **「推奨アクションを生成」**をクリック → Claude がリスク根拠・優先度付きアクション・
   トークスクリプトを生成（このデモの主役）。
5. **ヘルプデスク**タブで、その顧客の「解約を検討している」チケットや低 CSAT を確認し、
   リスクの裏付けを見せる。
6. **Genie**タブで「解約リスクのアカウントを教えて」等を自然言語で質問 → 自動生成 SQL と結果を提示。

## 7. セットアップ & デプロイ

### 前提
- Databricks CLI（v1.x）で対象ワークスペースに認証済み（プロファイル例: `Azure-ytcy-east2`）
- Serverless SQL Warehouse、`databricks-claude-sonnet-4-5` エンドポイント、Genie Space

デプロイ済みアプリ URL:
`https://crm-help-desk-demo-7405605463330453.13.azure.databricksapps.com`

### 依存関係
デプロイ対象アプリの依存は **`requirements.txt`**（pip 方式）で管理します
（`fastapi` / `uvicorn` / `databricks-sdk==0.41.0` / `pydantic`）。
ローカルのデータ生成スクリプトのみ `databricks-sql-connector` が追加で必要なため
`requirements-dev.txt` を用意しています。

### データ投入
```bash
export DATABRICKS_PROFILE=Azure-ytcy-east2
pip install -r requirements-dev.txt
python data/generate_data.py
```

### ローカル実行
```bash
pip install -r requirements.txt
# バックエンド（フロントの /api をプロキシ）
export DATABRICKS_HOST=https://adb-7405605463330453.13.azuredatabricks.net
export DATABRICKS_TOKEN=$(databricks auth token --host $DATABRICKS_HOST --profile Azure-ytcy-east2 | jq -r .access_token)
uvicorn app:app --port 8000
# フロントエンド（別ターミナル、開発サーバ）
cd frontend && npm install && npm run dev   # http://localhost:5173
```

### 本番ビルド & デプロイ（Git フォルダ経由）
コードは GitHub と Databricks Git フォルダで連携しています。デプロイ手順:
```bash
# 1) フロントをビルドしてコミット（frontend/dist を含める）
cd frontend && npm run build && cd ..
git add -A && git commit -m "..." && git push origin main
# 2) Databricks Git フォルダを最新化（REST: PATCH /api/2.0/repos/<id> {"branch":"main"}）
# 3) Git フォルダのパスからデプロイ
databricks apps deploy crm-help-desk-demo \
  --source-code-path /Workspace/Users/<you>/crm-help-desk-demo-app --profile Azure-ytcy-east2
```

### アプリのリソース付与（サービスプリンシパルに必要）
- **SQL Warehouse**: Can use
- **Serving endpoint** `databricks-claude-sonnet-4-5`: Can query
- **Genie Space**: Can run
- **Unity Catalog**: `crm_help_desk_demo` スキーマに `USE_SCHEMA` / `SELECT` / `MODIFY`、
  カタログに `USE_CATALOG`

## 8. 実装時の注意点（ハマりどころ）

- **CLI プロファイルの曖昧性**: 同一ホストに複数プロファイルがあると SDK の `databricks-cli`
  認証が「複数一致」で失敗する。ローカルではトークンを明示注入（`DATABRICKS_TOKEN`）して回避。
- **Genie Space 作成 API の制約**: `serialized_space`（JSON 文字列）が必須。
  `data_sources.tables` は identifier の**昇順ソート必須**、`config.sample_questions` も
  **id 昇順ソート必須**、`instructions.text_instructions` は**1 要素のみ**（複数は 400）。
- **`databricks apps update` は全置換**: 一部フィールドだけ渡すと `resources` が消えて
  アプリがクラッシュする。update には必ず description + resources のフル JSON を渡す。
- **Apps ビルドは pip 方式を採用**: 社内 pypi proxy が不安定な時、`uv`（pyproject.toml + uv.lock）
  だと特定 wheel（`databricks-sdk`）で `client error (Connect)` が頻発し失敗した。
  `pyproject.toml`/`uv.lock` を外して **`requirements.txt` のみ**にすると pip 方式で解決され、
  同じ proxy 状況でも安定してインストールできた。依存パッケージ数も 55→27 に削減。
- **依存は最小限に**: SQL 接続は `databricks-sql-connector`（pyarrow/pandas 等が巨大）ではなく
  `databricks-sdk` の Statement Execution API を使用。LLM も `openai` ではなく SDK の
  `serving_endpoints.query` を使用。Statement Execution API は**全列を文字列で返す**ため、
  スキーマの型情報で数値/真偽値に復元している（`server/db.py`）。
- **frontend/dist を Git に含める**: 標準の Python `.gitignore` は `dist/` を除外するため、
  デプロイに必要な `frontend/dist` が漏れる。本リポジトリの `.gitignore` は除外していない。
- **SQL Warehouse は Serverless 推奨**: 停止状態でも初回クエリで自動起動する。
- **利用率は 0〜1 の割合**で保存。UI/Genie で % 表示する際は 100 を掛ける。
- **チャーンスコアは説明可能性を優先**しルールベース。閾値は `server/churn.py` で調整可能。
- **Databricks Apps では `DATABRICKS_HOST` がスキームなし**のホスト名で入るため、
  `https://` を補う（`server/config.py`）。

## 9. ディレクトリ構成

```
crm-help-desk-demo-app/
├── app.py                 # FastAPI エントリポイント（API + SPA 配信）
├── app.yaml               # Databricks Apps 設定（env / command）
├── requirements.txt       # デプロイ用 Python 依存（pip）
├── requirements-dev.txt   # ローカルのデータ生成用（+databricks-sql-connector）
├── data/
│   └── generate_data.py   # 合成データ生成 & UC 投入
├── server/
│   ├── config.py          # デュアルモード認証・設定
│   ├── db.py              # SQL Warehouse 直読
│   ├── churn.py           # ルールベースのチャーンスコア
│   ├── llm.py             # 基盤モデル（推奨アクション生成）
│   └── routes/            # dashboard / accounts / tickets / misc / genie
└── frontend/              # React + Vite（dist を本番配信）
    └── src/
        ├── App.tsx        # レイアウト・ルーティング・テーマ
        ├── api.ts         # API クライアント
        ├── components/    # 共通 UI
        └── pages/         # 各画面
```
