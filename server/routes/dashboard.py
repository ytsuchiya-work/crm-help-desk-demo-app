"""ダッシュボード KPI エンドポイント。"""
from fastapi import APIRouter
from ..db import query
from ..config import fqtn

router = APIRouter()


@router.get("/dashboard/kpis")
def dashboard_kpis():
    # 最新週の 5 大 KPI（ログイン率/登録率/出社検知率/インストール率/設定良好率）
    latest = query(f"""
        SELECT
          round(avg(login_rate)*100, 1)              AS login_rate,
          round(avg(signup_rate)*100, 1)             AS signup_rate,
          round(avg(attendance_detect_rate)*100, 1)  AS attendance_detect_rate,
          round(avg(install_rate)*100, 1)            AS install_rate,
          round(avg(app_config_ok_rate)*100, 1)      AS app_config_ok_rate
        FROM {fqtn('usage_metrics')}
        WHERE week_start = (SELECT max(week_start) FROM {fqtn('usage_metrics')})
    """)
    prev = query(f"""
        SELECT
          round(avg(login_rate)*100, 1)              AS login_rate,
          round(avg(signup_rate)*100, 1)             AS signup_rate,
          round(avg(attendance_detect_rate)*100, 1)  AS attendance_detect_rate,
          round(avg(install_rate)*100, 1)            AS install_rate,
          round(avg(app_config_ok_rate)*100, 1)      AS app_config_ok_rate
        FROM {fqtn('usage_metrics')}
        WHERE week_start = (
          SELECT max(week_start) FROM {fqtn('usage_metrics')}
          WHERE week_start < (SELECT max(week_start) FROM {fqtn('usage_metrics')})
        )
    """)
    counts = query(f"""
        SELECT
          count(*)                                              AS total,
          sum(CASE WHEN status='active' THEN 1 ELSE 0 END)      AS active,
          sum(CASE WHEN status='onboarding' THEN 1 ELSE 0 END)  AS onboarding,
          sum(CASE WHEN status='churn_risk' THEN 1 ELSE 0 END)  AS churn_risk,
          sum(CASE WHEN status='churned' THEN 1 ELSE 0 END)     AS churned,
          sum(CASE WHEN status='prospect' THEN 1 ELSE 0 END)    AS prospect
        FROM {fqtn('accounts')}
    """)
    open_tickets = query(f"""
        SELECT count(*) AS c FROM {fqtn('tickets')}
        WHERE status IN ('new','open','pending')
    """)
    return {
        "kpis": latest[0] if latest else {},
        "kpis_prev": prev[0] if prev else {},
        "counts": counts[0] if counts else {},
        "open_tickets": open_tickets[0]["c"] if open_tickets else 0,
    }


@router.get("/dashboard/kpi-trend")
def kpi_trend():
    """週次 KPI トレンド（全社平均）。"""
    rows = query(f"""
        SELECT
          cast(week_start AS STRING) AS week,
          round(avg(login_rate)*100, 1)              AS login_rate,
          round(avg(signup_rate)*100, 1)             AS signup_rate,
          round(avg(attendance_detect_rate)*100, 1)  AS attendance_detect_rate,
          round(avg(install_rate)*100, 1)            AS install_rate,
          round(avg(app_config_ok_rate)*100, 1)      AS app_config_ok_rate
        FROM {fqtn('usage_metrics')}
        GROUP BY week_start ORDER BY week_start
    """)
    return {"trend": rows}


@router.get("/dashboard/churn-history")
def churn_history():
    rows = query(f"""
        SELECT cast(month AS STRING) AS month, churned_accounts, new_accounts, churned_arr_jpy
        FROM {fqtn('churn_history')} ORDER BY month
    """)
    return {"history": rows}
