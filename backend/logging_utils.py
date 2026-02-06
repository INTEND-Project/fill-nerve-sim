import datetime
import json
import logging
import os
from typing import Any, Dict, Optional


class DailyFileHandler(logging.Handler):
    def __init__(self, log_dir: str) -> None:
        super().__init__()
        self.log_dir = log_dir
        self.current_date: Optional[str] = None
        self.stream = None
        os.makedirs(self.log_dir, exist_ok=True)

    def _open_for_date(self, date_str: str) -> None:
        if self.stream:
            try:
                self.stream.close()
            except Exception:
                pass
        path = os.path.join(self.log_dir, f"{date_str}.log")
        self.stream = open(path, "a", encoding="utf-8")
        self.current_date = date_str

    def emit(self, record: logging.LogRecord) -> None:
        try:
            now = datetime.datetime.now().astimezone()
            date_str = now.strftime("%Y-%m-%d")
            if self.stream is None or self.current_date != date_str:
                self._open_for_date(date_str)
            msg = self.format(record)
            self.stream.write(msg + "\n")
            self.stream.flush()
        except Exception:
            self.handleError(record)


_LOGGER: Optional[logging.Logger] = None
_LOG_DIR = os.path.join(os.path.dirname(__file__), "log")


def get_log_dir() -> str:
    return _LOG_DIR


def _get_logger() -> logging.Logger:
    global _LOGGER
    if _LOGGER is not None:
        return _LOGGER
    logger = logging.getLogger("nerve_audit")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    if not logger.handlers:
        handler = DailyFileHandler(_LOG_DIR)
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
    _LOGGER = logger
    return logger


def log_event(event: str, data: Optional[Dict[str, Any]] = None, level: int = logging.INFO) -> None:
    payload = {
        "ts": datetime.datetime.now().astimezone().isoformat(timespec="seconds"),
        "event": event,
        "data": data or {},
    }
    _get_logger().log(level, json.dumps(payload, sort_keys=True))
