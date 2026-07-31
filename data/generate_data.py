"""
CRM ヘルプデスク Churn デモ — 合成データ生成 & Unity Catalog 投入スクリプト

想定シナリオ（すべて仮想の名称）:
  自社（SaaS 提供元）: CloudNest 株式会社
  製品: OfficePulse — 出社検知・オフィス運用 SaaS（貸出デバイス + アプリで構成）
  顧客: 仮想の日本企業 20 社

データソース（実データの代替として合成）:
  - GA4 由来のプロダクト利用イベント（ログイン/登録/出社検知/インストール/設定）
  - Zendesk 由来の問い合わせチケットと対応履歴
  - 契約情報（契約ID / 利用開始日 / 利用終了日 / 貸出端末 / 利用サービス / 解約理由）

投入先: ytcy_azure_east2classic_stable.crm_help_desk_demo

使い方:
  export DATABRICKS_PROFILE=Azure-ytcy-east2
  python data/generate_data.py
"""
import os
import random
import datetime as dt
from databricks import sql
from databricks.sdk import WorkspaceClient

CATALOG = "ytcy_azure_east2classic_stable"
SCHEMA = "crm_help_desk_demo"
WAREHOUSE_ID = "9c8fac7a0b250221"
PROFILE = os.environ.get("DATABRICKS_PROFILE", "Azure-ytcy-east2")

random.seed(20260731)
TODAY = dt.date(2026, 7, 31)

# ---------------------------------------------------------------------------
# マスターデータ（仮想の名称）
# ---------------------------------------------------------------------------
INDUSTRIES = ["IT・Web", "製造", "小売", "金融", "医療・福祉", "人材", "教育", "物流", "外食", "建設", "エネルギー", "コンサル"]
PLANS = ["Starter", "Standard", "Premium", "Enterprise"]
CSMS = ["佐藤 美咲", "田中 健一", "鈴木 彩子", "高橋 大輔", "伊藤 直樹"]
DEVICE_MODELS = ["OfficePulse Sensor G2", "OfficePulse Sensor G3", "OfficePulse Gateway", "OfficePulse Beacon Lite"]
SERVICE_CATALOG = ["出社検知", "座席管理", "入退室ログ", "利用分析ダッシュボード", "Slack連携", "API連携", "モバイルアプリ", "SSO/SAML"]
CHURN_REASONS = [
    "価格が高い", "他社ツールへ移行", "利用が定着しなかった", "社内体制変更",
    "オフィス縮小・リモート移行", "サポート対応への不満", "機能不足", "予算削減",
]

# 20 社の仮想顧客。status: active / onboarding / churn_risk / prospect / churned
COMPANIES = [
    # name,                industry,    plan,        status,       csm,           started_months_ago, ended(None or months_ago)
    ("みなと商事株式会社",        "商社・卸",   "Enterprise", "active",      "佐藤 美咲",   28,  None),
    ("北山製造ホールディングス",  "製造",      "Enterprise", "active",      "佐藤 美咲",   34,  None),
    ("さくら医療グループ",        "医療・福祉", "Enterprise", "active",      "佐藤 美咲",   22,  None),
    ("глобキャンセル除去",        "IT・Web",   "Premium",    "active",      "田中 健一",   16,  None),  # placeholder, replaced below
    ("フロンティア物流株式会社",  "物流",      "Standard",   "active",      "鈴木 彩子",   19,  None),
    ("東海リテールシステムズ",    "小売",      "Standard",   "active",      "鈴木 彩子",   14,  None),
    ("グリーンエナジー株式会社",  "エネルギー", "Premium",    "churn_risk",  "高橋 大輔",   26,  None),
    ("関西フードサービス株式会社","外食",      "Standard",   "churn_risk",  "高橋 大輔",   18,  None),
    ("大和建設株式会社",          "建設",      "Premium",    "active",      "田中 健一",   21,  None),
    ("スカイIT ソリューションズ","IT・Web",   "Enterprise", "active",      "佐藤 美咲",   30,  None),
    ("ひかり教育サービス",        "教育",      "Standard",   "onboarding",  "田中 健一",   2,   None),
    ("ノースフィナンシャル株式会社","金融",     "Enterprise", "active",      "佐藤 美咲",   24,  None),
    ("まるみ食品工業",            "製造",      "Standard",   "churn_risk",  "高橋 大輔",   20,  None),
    ("アクティブ人材サービス",    "人材",      "Premium",    "active",      "鈴木 彩子",   17,  None),
    ("湘南リゾートホテルズ",      "外食",      "Standard",   "onboarding",  "鈴木 彩子",   1,   None),
    ("セントラル商店",            "小売",      "Starter",    "prospect",    "田中 健一",   0,   None),
    ("いろは印刷株式会社",        "製造",      "Starter",    "prospect",    "高橋 大輔",   0,   None),
    ("東雲メディカルクリニック",  "医療・福祉", "Standard",   "active",      "佐藤 美咲",   12,  None),
    ("ゆにおん運輸株式会社",      "物流",      "Standard",   "churned",     "鈴木 彩子",   30,  4),
    ("みらいエデュケーション",    "教育",      "Starter",    "churned",     "田中 健一",   22,  2),
]
# 4 番目のプレースホルダを差し替え
COMPANIES[3] = ("テックブリッジ株式会社", "IT・Web", "Premium", "active", "田中 健一", 16, None)


def months_ago(n):
    if n is None:
        return None
    return TODAY - dt.timedelta(days=int(n * 30.4))


# ---------------------------------------------------------------------------
# 生成
# ---------------------------------------------------------------------------
def gen_accounts_contracts():
    accounts, contracts = [], []
    for i, (name, ind, plan, status, csm, sm, em) in enumerate(COMPANIES, start=1):
        acct_id = f"ACC-{1000 + i}"
        start = months_ago(sm) if sm else None
        end = months_ago(em) if em else None
        seats = {"Starter": 30, "Standard": 120, "Premium": 400, "Enterprise": 1500}[plan] + random.randint(-10, 60)
        arr = {"Starter": 60, "Standard": 240, "Premium": 900, "Enterprise": 3600}[plan] * 1000 + random.randint(0, 20) * 10000
        accounts.append({
            "account_id": acct_id, "company_name": name, "industry": ind, "plan": plan,
            "status": status, "csm_owner": csm, "seats": seats, "arr_jpy": arr,
            "region": random.choice(["東京", "大阪", "名古屋", "福岡", "札幌", "横浜"]),
            "created_at": (start or TODAY).isoformat(),
        })
        # 契約（prospect は契約なし）
        if status != "prospect":
            n_services = {"Starter": 2, "Standard": 4, "Premium": 6, "Enterprise": 8}[plan]
            services = random.sample(SERVICE_CATALOG, min(n_services, len(SERVICE_CATALOG)))
            n_devices = max(1, seats // 60)
            devices = random.sample(DEVICE_MODELS, k=random.randint(1, len(DEVICE_MODELS)))
            contracts.append({
                "contract_id": f"CT-{20260000 + i}", "account_id": acct_id,
                "plan": plan, "start_date": start.isoformat() if start else None,
                "end_date": end.isoformat() if end else None,
                "loaned_devices": ", ".join(f"{d}×{random.randint(2, max(2, n_devices))}" for d in devices),
                "used_services": ", ".join(services),
                "churn_reason": random.choice(CHURN_REASONS) if status == "churned" else None,
                "mrr_jpy": arr // 12,
                "auto_renew": status not in ("churned", "churn_risk"),
            })
    return accounts, contracts


def gen_usage_metrics(accounts):
    """GA4 由来の週次利用メトリクス（直近 12 週）。
    各アカウントに 5 つの主要 KPI 系列を持たせる:
      login_rate, signup_rate, attendance_detect_rate, install_rate, app_config_ok_rate
    churn_risk / churned は右肩下がり、active は高位安定、onboarding は立ち上がり途中。
    """
    rows = []
    for a in accounts:
        if a["status"] == "prospect":
            continue
        base = {
            "active": (0.82, 0.90, 0.85, 0.93, 0.88),
            "onboarding": (0.45, 0.55, 0.35, 0.60, 0.40),
            "churn_risk": (0.55, 0.60, 0.45, 0.70, 0.50),
            "churned": (0.30, 0.35, 0.20, 0.45, 0.28),
        }[a["status"]]
        for w in range(12, 0, -1):
            week_start = TODAY - dt.timedelta(days=w * 7)
            # トレンド係数
            if a["status"] == "churn_risk":
                trend = -0.02 * (12 - w)
            elif a["status"] == "churned":
                trend = -0.03 * (12 - w)
            elif a["status"] == "onboarding":
                trend = +0.03 * (12 - w)
            else:
                trend = +0.002 * (12 - w)
            def clamp(x):
                return round(min(0.99, max(0.05, x + trend + random.uniform(-0.03, 0.03))), 4)
            dau = int(a["seats"] * clamp(base[0]))
            rows.append({
                "account_id": a["account_id"],
                "week_start": week_start.isoformat(),
                "login_rate": clamp(base[0]),
                "signup_rate": clamp(base[1]),
                "attendance_detect_rate": clamp(base[2]),
                "install_rate": clamp(base[3]),
                "app_config_ok_rate": clamp(base[4]),
                "dau": dau,
                "sessions": dau * random.randint(2, 5),
                "avg_session_min": round(random.uniform(3.5, 18.0), 1),
            })
    return rows


ZENDESK_SUBJECTS = [
    ("出社検知が反映されない", "技術", "high"),
    ("センサーがオフラインになる", "技術", "urgent"),
    ("管理画面にログインできない", "アカウント", "high"),
    ("CSVエクスポートの項目を増やしたい", "要望", "low"),
    ("請求金額について確認したい", "請求", "normal"),
    ("モバイルアプリが起動しない", "技術", "high"),
    ("SSO 設定の手順を教えてほしい", "設定", "normal"),
    ("座席管理の使い方がわからない", "使い方", "low"),
    ("APIのレスポンスが遅い", "技術", "high"),
    ("解約を検討している", "解約", "urgent"),
    ("追加ライセンスを購入したい", "営業", "normal"),
    ("ダッシュボードの数値がおかしい", "技術", "high"),
    ("Slack通知が届かない", "設定", "normal"),
    ("利用開始のオンボーディング相談", "オンボーディング", "normal"),
    ("端末の返却方法について", "その他", "low"),
]
TICKET_STATUS = ["new", "open", "pending", "solved", "closed"]
AGENTS = ["山本 拓也", "中村 玲奈", "小林 翔", "加藤 さゆり", "渡辺 健"]


def gen_tickets(accounts):
    tickets, events = [], []
    tid = 5000
    for a in accounts:
        if a["status"] == "prospect":
            continue
        # チャーンリスク/解約は多め・満足度低め
        n = {"active": random.randint(1, 4), "onboarding": random.randint(3, 6),
             "churn_risk": random.randint(5, 9), "churned": random.randint(4, 7)}[a["status"]]
        for _ in range(n):
            tid += 1
            subj, cat, pri = random.choice(ZENDESK_SUBJECTS)
            created = dt.datetime.combine(TODAY, dt.time(9, 0)) - dt.timedelta(
                days=random.randint(1, 80), hours=random.randint(0, 23), minutes=random.randint(0, 59))
            if a["status"] in ("churn_risk", "churned") and random.random() < 0.5:
                pri = random.choice(["high", "urgent"])
            status = random.choices(TICKET_STATUS, weights=[2, 3, 2, 5, 4])[0]
            first_resp_min = random.choice([15, 30, 45, 60, 120, 240, 480])
            if a["status"] in ("churn_risk", "churned"):
                first_resp_min = random.choice([120, 240, 480, 720, 1440])
            resolved = status in ("solved", "closed")
            csat = None
            if resolved:
                csat = random.choices([1, 2, 3, 4, 5],
                    weights=([4, 3, 2, 1, 1] if a["status"] in ("churn_risk", "churned") else [1, 1, 2, 4, 6]))[0]
            agent = random.choice(AGENTS)
            tickets.append({
                "ticket_id": f"ZD-{tid}", "account_id": a["account_id"],
                "subject": subj, "category": cat, "priority": pri, "status": status,
                "channel": random.choice(["email", "chat", "phone", "web_form"]),
                "assignee": agent,
                "created_at": created.isoformat(sep=" ", timespec="seconds"),
                "updated_at": (created + dt.timedelta(hours=random.randint(1, 72))).isoformat(sep=" ", timespec="seconds"),
                "first_response_min": first_resp_min,
                "resolution_hours": round(random.uniform(1, 96), 1) if resolved else None,
                "csat": csat,
                "description": f"{a['company_name']} より「{subj}」に関する問い合わせ。",
            })
            # 対応履歴イベント（2〜5 件）
            steps = random.randint(2, 5)
            t = created
            authors = ["customer", "agent"]
            for s in range(steps):
                t = t + dt.timedelta(hours=random.randint(1, 20))
                who = "customer" if s == 0 else random.choice(authors)
                events.append({
                    "ticket_id": f"ZD-{tid}", "account_id": a["account_id"],
                    "event_at": t.isoformat(sep=" ", timespec="seconds"),
                    "author_type": who,
                    "author": a["company_name"] + " 担当者" if who == "customer" else agent,
                    "body": {
                        "customer": f"{subj}の件、まだ解決していません。状況を確認いただけますか。",
                        "agent": "ご連絡ありがとうございます。状況を確認し折り返しご案内します。",
                    }[who],
                })
    return tickets, events


def gen_schedule(accounts, tickets):
    """スケジュール生成。レコメンド(リスク対応)予定は、その顧客の高優先度/解約系
    チケットに紐づけて ticket_id を持たせる（UI でどの問い合わせ起点かを辿れるように）。"""
    # 顧客ごとに紐付け候補チケット（高優先度・未解決・解約系を優先）
    from collections import defaultdict
    tks = defaultdict(list)
    for t in tickets:
        tks[t["account_id"]].append(t)

    def pick_ticket(account_id):
        cands = tks.get(account_id, [])
        if not cands:
            return None
        # 解約検討 > 高優先度未解決 > その他 の優先度で選ぶ
        churn = [t for t in cands if "解約" in (t.get("subject") or "")]
        urgent_open = [t for t in cands if t.get("priority") in ("high", "urgent")
                       and t.get("status") in ("new", "open", "pending")]
        pool = churn or urgent_open or cands
        return random.choice(pool)["ticket_id"]

    rows = []
    sid = 0
    week_days = [dt.date(2026, 7, 27) + dt.timedelta(days=i) for i in range(5)]
    for a in accounts:
        if a["status"] in ("prospect",):
            continue
        is_risk = a["status"] in ("churn_risk", "churned")
        # リスク顧客は必ず 1〜2 件のレコメンド予定を持たせる（デモ映えのため）
        n = random.randint(1, 2) if is_risk else random.randint(0, 2)
        for j in range(n):
            sid += 1
            d = random.choice(week_days)
            # リスク顧客は最低1件をレコメンドにする
            kind = "recommended" if (is_risk and (j == 0 or random.random() > 0.4)) else "confirmed"
            titles_active = ["定例フォローアップ", "利用状況レビュー", "拡大提案", "契約更新相談"]
            titles_risk = ["解約リスクヒアリング", "契約更新交渉", "利用改善提案", "エグゼクティブ訪問"]
            title = random.choice(titles_risk if is_risk else titles_active)
            # レコメンドは問い合わせに紐づける
            ticket_id = pick_ticket(a["account_id"]) if kind == "recommended" else None
            rows.append({
                "schedule_id": f"SC-{100 + sid}", "account_id": a["account_id"],
                "owner": a["csm_owner"], "date": d.isoformat(),
                "title": f"{a['company_name']} {title}",
                "kind": kind,
                "ticket_id": ticket_id,
                "start_time": random.choice(["10:00", "11:00", "13:00", "14:00", "15:30", "16:00"]),
                "duration_min": random.choice([30, 45, 60]),
            })
    return rows


def gen_genie_history():
    """Genie チャット履歴（デモ用の初期履歴 2 件）。セッションを跨いで残ることを示す。"""
    base = dt.datetime.combine(TODAY, dt.time(9, 0))
    return [
        {
            "history_id": "GH-1", "conversation_id": "seed-conv-1",
            "role": "user", "content": "解約リスクが高いアカウントを教えて",
            "query": None, "created_at": (base - dt.timedelta(days=1, hours=2)).isoformat(sep=" ", timespec="seconds"),
        },
        {
            "history_id": "GH-2", "conversation_id": "seed-conv-1",
            "role": "bot", "content": "解約リスク(churn_risk)のアカウントは3件あります: グリーンエナジー株式会社、関西フードサービス株式会社、まるみ食品工業。",
            "query": "SELECT company_name FROM accounts WHERE status = 'churn_risk'",
            "created_at": (base - dt.timedelta(days=1, hours=2)).isoformat(sep=" ", timespec="seconds"),
        },
    ]


def gen_feedback():
    items = [
        ("CSVエクスポート項目のカスタマイズ", "CSVエクスポート時に出力項目を選択できるようにしてほしい。", "低", "完了"),
        ("出社検知の判定感度を調整したい", "フロアごとに検知感度をチューニングしたい。", "高", "対応中"),
        ("ダッシュボードの日本語カラム対応", "一部の指標名が英語のままで分かりにくい。", "中", "未対応"),
        ("モバイルアプリのウィジェット対応", "ホーム画面ウィジェットで出社状況を確認したい。", "中", "未対応"),
        ("Slack通知のテンプレート機能", "よく使う通知文をテンプレート化したい。", "低", "未対応"),
        ("APIレート制限の緩和", "大量データ連携時にレート制限に達する。", "高", "対応中"),
    ]
    rows = []
    for i, (title, body, pri, status) in enumerate(items, start=1):
        rows.append({
            "feedback_id": f"FB-{200 + i}", "title": title, "detail": body,
            "priority": pri, "status": status,
            "created_at": (TODAY - dt.timedelta(days=random.randint(1, 20))).isoformat(),
            "submitted_by": random.choice(CSMS),
        })
    return rows


def gen_churn_history():
    """過去 24 ヶ月の月次チャーン件数（トレンド表示用）。"""
    rows = []
    for m in range(24, -1, -1):
        month = (TODAY.replace(day=1) - dt.timedelta(days=m * 30)).replace(day=1)
        rows.append({
            "month": month.isoformat(),
            "churned_accounts": random.randint(0, 3),
            "new_accounts": random.randint(1, 5),
            "churned_arr_jpy": random.randint(0, 3) * 1200000,
        })
    return rows


# ---------------------------------------------------------------------------
# DDL / DML
# ---------------------------------------------------------------------------
def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def insert_rows(cur, table, rows):
    if not rows:
        return
    cols = list(rows[0].keys())
    # バッチ INSERT（500 行ずつ）
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        values = ",\n".join("(" + ", ".join(q(r[c]) for c in cols) + ")" for r in chunk)
        cur.execute(f"INSERT INTO {CATALOG}.{SCHEMA}.{table} ({', '.join(cols)}) VALUES {values}")
    print(f"  inserted {len(rows)} rows -> {table}")


def get_token_and_host():
    """新 CLI (v1.x) から明示的にトークンを取得する。
    同一ホストに複数プロファイルがあると SDK の profile 解決が失敗するため、
    CLI を直接叩いて回避する。"""
    import subprocess, json
    dbx = os.environ.get("DBX_CLI", "/opt/homebrew/bin/databricks")
    host = os.environ.get("DBX_HOST", "https://adb-7405605463330453.13.azuredatabricks.net")
    out = subprocess.run([dbx, "auth", "token", "--host", host, "--profile", PROFILE],
                         capture_output=True, text=True, check=True).stdout
    token = json.loads(out)["access_token"]
    return token, host.replace("https://", "")


def main():
    token, hostname = get_token_and_host()
    http_path = f"/sql/1.0/warehouses/{WAREHOUSE_ID}"

    accounts, contracts = gen_accounts_contracts()
    usage = gen_usage_metrics(accounts)
    tickets, events = gen_tickets(accounts)
    schedule = gen_schedule(accounts, tickets)
    feedback = gen_feedback()
    churn_hist = gen_churn_history()
    genie_history = gen_genie_history()

    print(f"generated: accounts={len(accounts)} contracts={len(contracts)} usage={len(usage)} "
          f"tickets={len(tickets)} events={len(events)} schedule={len(schedule)} "
          f"feedback={len(feedback)} churn_hist={len(churn_hist)} genie_history={len(genie_history)}")

    ddl = {
        "accounts": """(
            account_id STRING, company_name STRING, industry STRING, plan STRING,
            status STRING, csm_owner STRING, seats INT, arr_jpy BIGINT,
            region STRING, created_at DATE
        )""",
        "contracts": """(
            contract_id STRING, account_id STRING, plan STRING,
            start_date DATE, end_date DATE, loaned_devices STRING, used_services STRING,
            churn_reason STRING, mrr_jpy BIGINT, auto_renew BOOLEAN
        )""",
        "usage_metrics": """(
            account_id STRING, week_start DATE, login_rate DOUBLE, signup_rate DOUBLE,
            attendance_detect_rate DOUBLE, install_rate DOUBLE, app_config_ok_rate DOUBLE,
            dau INT, sessions INT, avg_session_min DOUBLE
        )""",
        "tickets": """(
            ticket_id STRING, account_id STRING, subject STRING, category STRING,
            priority STRING, status STRING, channel STRING, assignee STRING,
            created_at TIMESTAMP, updated_at TIMESTAMP, first_response_min INT,
            resolution_hours DOUBLE, csat INT, description STRING
        )""",
        "ticket_events": """(
            ticket_id STRING, account_id STRING, event_at TIMESTAMP,
            author_type STRING, author STRING, body STRING
        )""",
        "schedule": """(
            schedule_id STRING, account_id STRING, owner STRING, date DATE,
            title STRING, kind STRING, ticket_id STRING, start_time STRING, duration_min INT
        )""",
        "feedback": """(
            feedback_id STRING, title STRING, detail STRING, priority STRING,
            status STRING, created_at DATE, submitted_by STRING
        )""",
        "churn_history": """(
            month DATE, churned_accounts INT, new_accounts INT, churned_arr_jpy BIGINT
        )""",
        "genie_history": """(
            history_id STRING, conversation_id STRING, role STRING, content STRING,
            query STRING, created_at TIMESTAMP
        )""",
    }

    data_map = {
        "accounts": accounts, "contracts": contracts, "usage_metrics": usage,
        "tickets": tickets, "ticket_events": events, "schedule": schedule,
        "feedback": feedback, "churn_history": churn_hist, "genie_history": genie_history,
    }

    with sql.connect(server_hostname=hostname, http_path=http_path, access_token=token) as conn:
        with conn.cursor() as cur:
            cur.execute(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")
            for table, schema_ddl in ddl.items():
                print(f"creating {table} ...")
                cur.execute(f"DROP TABLE IF EXISTS {CATALOG}.{SCHEMA}.{table}")
                cur.execute(f"CREATE TABLE {CATALOG}.{SCHEMA}.{table} {schema_ddl} USING DELTA")
                insert_rows(cur, table, data_map[table])
    print("DONE.")


if __name__ == "__main__":
    main()
