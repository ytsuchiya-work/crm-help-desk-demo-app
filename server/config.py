"""環境検出とワークスペース認証（ローカル / Databricks Apps 両対応）。"""
import os
from functools import lru_cache
from databricks.sdk import WorkspaceClient

# Databricks Apps ランタイム上では DATABRICKS_APP_NAME が自動設定される
IS_DATABRICKS_APP = bool(os.environ.get("DATABRICKS_APP_NAME"))

# --- 設定（app.yaml / ローカル env から注入）---
CATALOG = os.environ.get("CRM_CATALOG", "ytcy_azure_east2classic_stable")
SCHEMA = os.environ.get("CRM_SCHEMA", "crm_help_desk_demo")
WAREHOUSE_ID = os.environ.get("DATABRICKS_WAREHOUSE_ID", "9c8fac7a0b250221")
SERVING_ENDPOINT = os.environ.get("SERVING_ENDPOINT", "databricks-claude-sonnet-4-5")
GENIE_SPACE_ID = os.environ.get("GENIE_SPACE_ID", "")
# ローカル実行時のプロファイル
LOCAL_PROFILE = os.environ.get("DATABRICKS_CONFIG_PROFILE") or os.environ.get("DATABRICKS_PROFILE", "Azure-ytcy-east2")


@lru_cache(maxsize=1)
def get_workspace_client() -> WorkspaceClient:
    if IS_DATABRICKS_APP:
        return WorkspaceClient()
    return WorkspaceClient(profile=LOCAL_PROFILE)


def get_token() -> str:
    """OAuth/PAT トークンを取得（SQL Connector / REST 用）。"""
    w = get_workspace_client()
    auth = w.config.authenticate()
    return auth["Authorization"].replace("Bearer ", "")


def get_host() -> str:
    """https:// 付きのワークスペースホストを返す。"""
    if IS_DATABRICKS_APP:
        host = os.environ.get("DATABRICKS_HOST", "")
        if host and not host.startswith("http"):
            host = f"https://{host}"
        return host
    return get_workspace_client().config.host


def fqtn(table: str) -> str:
    """完全修飾テーブル名。"""
    return f"{CATALOG}.{SCHEMA}.{table}"
