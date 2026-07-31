"""Serverless SQL Warehouse 経由で Unity Catalog を直読するデータアクセス層。

Databricks SQL Connector を用い、Statement をスレッドセーフに実行する。
接続はリクエストごとに生成/クローズする（Apps の SP トークンは自動更新されるため、
毎回 config.authenticate() で新鮮なトークンを取得する）。
"""
import threading
from contextlib import contextmanager
from databricks import sql as dbsql
from .config import get_token, get_host, WAREHOUSE_ID

_lock = threading.Lock()


@contextmanager
def _connection():
    host = get_host().replace("https://", "")
    token = get_token()
    conn = dbsql.connect(
        server_hostname=host,
        http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
        access_token=token,
    )
    try:
        yield conn
    finally:
        conn.close()


def query(sql_text: str, params: list | None = None) -> list[dict]:
    """SELECT を実行し dict のリストを返す。"""
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql_text, params or None)
            cols = [d[0] for d in cur.description] if cur.description else []
            return [dict(zip(cols, row)) for row in cur.fetchall()]


def execute(sql_text: str, params: list | None = None) -> None:
    """INSERT/UPDATE/DELETE を実行。"""
    with _connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql_text, params or None)
