"""Serverless SQL Warehouse 経由で Unity Catalog を直読するデータアクセス層。

Databricks SDK の Statement Execution API を用いる（databricks-sql-connector が
pyarrow/pandas/lz4/thrift 等の巨大な依存を引き込み、Apps ビルドの pypi proxy が
不安定だと失敗しやすいため、依存の軽い SDK に統一している）。
"""
from databricks.sdk.service.sql import StatementParameterListItem
from .config import get_workspace_client, WAREHOUSE_ID


def _to_params(params: list | None) -> list | None:
    """位置パラメータ (?) を SDK の名前付き (:p0, :p1 ...) に変換するため、
    呼び出し側の ? を順に置き換える。ここでは値のリストを受け取り、
    :p0.. の StatementParameterListItem を返す。"""
    if not params:
        return None
    items = []
    for i, v in enumerate(params):
        if v is None:
            items.append(StatementParameterListItem(name=f"p{i}", value=None))
        else:
            items.append(StatementParameterListItem(name=f"p{i}", value=str(v)))
    return items


def _qmark_to_named(sql_text: str) -> str:
    """`?` プレースホルダを :p0, :p1 ... に順次置換する。
    文字列リテラル内の ? は本アプリでは使用しない前提。"""
    out = []
    idx = 0
    for ch in sql_text:
        if ch == "?":
            out.append(f":p{idx}")
            idx += 1
        else:
            out.append(ch)
    return "".join(out)


# Statement Execution API は全ての値を文字列で返すため、スキーマの型情報を使って
# Python の型に復元する。
_INT_TYPES = {"INT", "LONG", "SHORT", "BYTE", "INTEGER", "BIGINT", "SMALLINT", "TINYINT"}
_FLOAT_TYPES = {"FLOAT", "DOUBLE", "DECIMAL"}
_BOOL_TYPES = {"BOOLEAN"}


def _coerce(value, type_name: str):
    if value is None:
        return None
    t = (type_name or "").upper()
    try:
        if t in _INT_TYPES:
            return int(value)
        if t in _FLOAT_TYPES:
            return float(value)
        if t in _BOOL_TYPES:
            return str(value).lower() == "true"
    except (ValueError, TypeError):
        return value
    return value


def query(sql_text: str, params: list | None = None) -> list[dict]:
    """SELECT を実行し dict のリストを返す（型はスキーマに従って復元）。"""
    w = get_workspace_client()
    stmt = _qmark_to_named(sql_text) if params else sql_text
    resp = w.statement_execution.execute_statement(
        warehouse_id=WAREHOUSE_ID,
        statement=stmt,
        parameters=_to_params(params),
        wait_timeout="50s",
    )
    # 完了までポーリング（wait_timeout 内に終わらなかった場合）
    resp = _await(w, resp)
    result = resp.result
    schema = resp.manifest.schema if resp.manifest else None
    if not schema or not schema.columns:
        return []
    cols = [c.name for c in schema.columns]
    types = [getattr(c.type_name, "value", str(c.type_name)) if c.type_name else "STRING"
             for c in schema.columns]
    rows = (result.data_array if result and result.data_array else []) or []
    out = []
    for r in rows:
        out.append({cols[i]: _coerce(r[i], types[i]) for i in range(len(cols))})
    return out


def execute(sql_text: str, params: list | None = None) -> None:
    """INSERT/UPDATE/DELETE を実行。"""
    w = get_workspace_client()
    stmt = _qmark_to_named(sql_text) if params else sql_text
    resp = w.statement_execution.execute_statement(
        warehouse_id=WAREHOUSE_ID,
        statement=stmt,
        parameters=_to_params(params),
        wait_timeout="50s",
    )
    _await(w, resp)


def _await(w, resp):
    """ステートメントが終了状態になるまで待つ。"""
    import time
    from databricks.sdk.service.sql import StatementState
    terminal = {StatementState.SUCCEEDED, StatementState.FAILED,
                StatementState.CANCELED, StatementState.CLOSED}
    while resp.status and resp.status.state not in terminal:
        time.sleep(1)
        resp = w.statement_execution.get_statement(resp.statement_id)
    if resp.status and resp.status.state != StatementState.SUCCEEDED:
        err = resp.status.error.message if resp.status.error else "unknown error"
        raise RuntimeError(f"SQL 実行に失敗しました: {err}")
    return resp
