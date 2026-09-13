"""Cho phép import trực tiếp các module trong backend/ (predictor, server, storage, model)
vì các file đó dùng import kiểu "flat" (`import storage`, `from predictor import ...`)
thay vì import package tương đối.
"""
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture(autouse=True, scope="session")
def _isolate_stats_db(tmp_path_factory):
    """Không để test ghi đè lên backend/cybershield_stats.db thật."""
    import storage
    storage.DB_PATH = tmp_path_factory.mktemp("db") / "test_stats.db"
    storage._init_db()
    yield
