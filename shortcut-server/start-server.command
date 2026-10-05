#!/bin/sh
# Double-click in Finder (macOS) or run from a terminal (Linux) to start the
# Shalielie Shortcut Server. Close the window or press Ctrl+C to stop it.
cd "$(dirname "$0")/.." || exit 1
if command -v uv >/dev/null 2>&1; then
    exec uv run --quiet --group server python shortcut-server/server.py "$@"
elif [ -x .venv/bin/python ]; then
    exec .venv/bin/python shortcut-server/server.py "$@"
else
    exec python3 shortcut-server/server.py "$@"
fi
