"""storage.py — SQLite-backed counters cho dashboard thống kê.

Không lưu text/nội dung ở đây — chỉ số đếm theo ngày cho từng loại sự kiện,
đúng những gì content.js đã đếm sẵn trong chrome.storage.local (scanned,
toxic, threat, link, revealed). Không có PII.
"""
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Dict, Iterator, Optional

DB_PATH = Path(__file__).resolve().parent / "cybershield_stats.db"

EVENT_TYPES = ("scanned", "toxic", "threat", "link", "revealed")
# loại sự kiện lưu trong DB -> tên field trả về trong response /stats
STATS_FIELDS = {
    "scanned": "scanned",
    "toxic": "toxic",
    "threat": "threat",
    "link": "links",
    "revealed": "revealed",
}


@contextmanager
def _connect() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(str(DB_PATH))
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def _init_db() -> None:
    with _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS event_counts (
                day   TEXT NOT NULL,
                type  TEXT NOT NULL,
                count INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (day, type)
            )
            """
        )


def _parse_day(ts: Optional[str]) -> str:
    if not ts:
        return date.today().isoformat()
    try:
        return datetime.fromisoformat(ts).date().isoformat()
    except ValueError:
        return date.today().isoformat()


def increment_event(event_type: str, count: int = 1, ts: Optional[str] = None) -> None:
    if event_type not in EVENT_TYPES:
        raise ValueError(f"Loại sự kiện không hợp lệ: {event_type}")
    day = _parse_day(ts)
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO event_counts (day, type, count) VALUES (?, ?, ?)
            ON CONFLICT (day, type) DO UPDATE SET count = count + excluded.count
            """,
            (day, event_type, count),
        )


def get_stats(period: str = "day") -> Dict[str, int]:
    """period: "day" (hôm nay) hoặc "week" (7 ngày gần nhất, tính cả hôm nay)."""
    today = date.today()
    start = today - timedelta(days=6) if period == "week" else today
    n_days = (today - start).days + 1
    days = [(start + timedelta(days=i)).isoformat() for i in range(n_days)]

    out = {field: 0 for field in STATS_FIELDS.values()}
    placeholders = ",".join("?" for _ in days)
    with _connect() as conn:
        rows = conn.execute(
            f"SELECT type, SUM(count) FROM event_counts WHERE day IN ({placeholders}) GROUP BY type",
            days,
        ).fetchall()
    for event_type, total in rows:
        field = STATS_FIELDS.get(event_type)
        if field:
            out[field] = int(total)
    return out


_init_db()
