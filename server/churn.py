"""ルールベースのチャーンスコア算出。

利用シグナル（ログイン率/出社検知率/インストール率/設定良好率のトレンド）と
サポートシグナル（未解決チケット・低CSAT・高優先度・一次応答遅延）、
契約シグナル（自動更新オフ・解約検討チケット）を 0-100 のリスクスコアに合成する。
"""
from statistics import mean


def _trend(series: list[float]) -> float:
    """先頭(古い)→末尾(新しい) の変化量。負なら悪化。"""
    if len(series) < 2:
        return 0.0
    return series[-1] - series[0]


def compute_score(metrics_rows: list[dict], tickets: list[dict], account: dict) -> dict:
    """metrics_rows: usage_metrics の週次行（昇順）。tickets: そのアカウントのチケット。"""
    reasons = []
    risk = 0.0

    if metrics_rows:
        latest = metrics_rows[-1]
        login = latest.get("login_rate", 0) or 0
        detect = latest.get("attendance_detect_rate", 0) or 0
        install = latest.get("install_rate", 0) or 0
        config_ok = latest.get("app_config_ok_rate", 0) or 0

        # 低水準ペナルティ（各 0-12）
        for label, val, w in [("ログイン率", login, 12), ("出社検知率", detect, 12),
                              ("インストール率", install, 8), ("設定良好率", config_ok, 8)]:
            deficit = max(0.0, 0.75 - val)  # 75% を基準
            pts = round(deficit / 0.75 * w, 1)
            risk += pts
            if pts > 3:
                reasons.append(f"{label}が低下({val:.0%})")

        # 下降トレンドペナルティ
        login_tr = _trend([r.get("login_rate", 0) or 0 for r in metrics_rows])
        detect_tr = _trend([r.get("attendance_detect_rate", 0) or 0 for r in metrics_rows])
        if login_tr < -0.05:
            risk += min(12, abs(login_tr) * 80)
            reasons.append(f"ログイン率が下降トレンド({login_tr:+.0%})")
        if detect_tr < -0.05:
            risk += min(8, abs(detect_tr) * 60)
            reasons.append(f"出社検知率が下降トレンド({detect_tr:+.0%})")

    # サポートシグナル
    if tickets:
        open_tickets = [t for t in tickets if t.get("status") in ("new", "open", "pending")]
        urgent = [t for t in tickets if t.get("priority") in ("high", "urgent")]
        csats = [t["csat"] for t in tickets if t.get("csat") is not None]
        churn_intent = [t for t in tickets if t.get("subject") and ("解約" in t["subject"])]
        slow_resp = [t for t in tickets if (t.get("first_response_min") or 0) > 480]

        if len(open_tickets) >= 3:
            risk += 8
            reasons.append(f"未解決チケット{len(open_tickets)}件")
        if len(urgent) >= 3:
            risk += 6
            reasons.append(f"高優先度チケット{len(urgent)}件")
        if csats and mean(csats) < 3.0:
            risk += 10
            reasons.append(f"平均CSATが低い({mean(csats):.1f}/5)")
        if churn_intent:
            risk += 12
            reasons.append("解約検討の問い合わせあり")
        if len(slow_resp) >= 2:
            risk += 5
            reasons.append("一次応答の遅延が複数件")

    # 契約シグナル
    if account.get("auto_renew") is False:
        risk += 6
        reasons.append("自動更新オフ")

    risk = round(min(100.0, risk), 1)
    if risk >= 60:
        band = "高"
    elif risk >= 35:
        band = "中"
    else:
        band = "低"

    return {
        "risk_score": risk,
        "risk_band": band,
        "reasons": reasons[:6],
    }
