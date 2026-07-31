"""CloudNest OfficePulse — CRM ヘルプデスク Churn デモ (Databricks Apps エントリポイント)。"""
import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from server.routes import dashboard, accounts, tickets, misc, genie

app = FastAPI(title="CloudNest CRM Help Desk Demo")

app.include_router(dashboard.router, prefix="/api")
app.include_router(accounts.router, prefix="/api")
app.include_router(tickets.router, prefix="/api")
app.include_router(misc.router, prefix="/api")
app.include_router(genie.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def meta():
    from server.config import CATALOG, SCHEMA, SERVING_ENDPOINT, GENIE_SPACE_ID
    return {
        "product": "OfficePulse",
        "vendor": "CloudNest 株式会社",
        "catalog": CATALOG,
        "schema": SCHEMA,
        "model": SERVING_ENDPOINT,
        "genie_enabled": bool(GENIE_SPACE_ID),
    }


# --- 静的フロントエンド配信 ---
_frontend = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.isdir(_frontend):
    _assets = os.path.join(_frontend, "assets")
    if os.path.isdir(_assets):
        app.mount("/assets", StaticFiles(directory=_assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "not found"}, status_code=404)
        index = os.path.join(_frontend, "index.html")
        if os.path.isfile(index):
            return FileResponse(index)
        return JSONResponse({"detail": "frontend not built"}, status_code=404)
