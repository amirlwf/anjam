#!/usr/bin/env python3
"""Parse a .sql file with the real PostgreSQL parser (libpg_query via pglast)
and report the first syntax error with a line number + snippet."""
import io
import sys

from pglast import parse_sql
from pglast.parser import ParseError

path = sys.argv[1] if len(sys.argv) > 1 else "supabase/schema.sql"
sql = io.open(path, encoding="utf-8").read()

try:
    parse_sql(sql)
    print("PARSE_OK")
except ParseError as e:
    import re
    m = re.search(r"index (\d+)", str(e))
    pos = int(m.group(1)) if m else None
    line = sql[: pos].count("\n") + 1 if pos is not None else "?"
    start = sql.rfind("\n", 0, pos) + 1 if pos is not None else 0
    end = sql.find("\n", pos) if pos is not None else -1
    badline = sql[start:end if end != -1 else len(sql)]
    print(f"PARSE_ERROR line {line}: {e}")
    print(f"BAD_LINE: {badline}")
