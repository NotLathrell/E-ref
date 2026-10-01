"""SQLite storage for accounts, per-user inventory, password-reset codes, the food database,
food categories, the recipe dataset and the system-wide activity log.

Each call opens its own short-lived connection, which keeps it safe under FastAPI's
thread pool. Every inventory query filters on ``user_id``, so one account can never
read or change another's items.
"""

from __future__ import annotations

import json
import sqlite3
import time
from contextlib import closing
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, item_id)
);
CREATE TABLE IF NOT EXISTS reset_codes (
    email TEXT PRIMARY KEY COLLATE NOCASE,
    code_hash TEXT NOT NULL,
    expires_at REAL NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS foods (
    food_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at REAL NOT NULL,
    updated_by INTEGER
);
CREATE TABLE IF NOT EXISTS categories (
    name TEXT PRIMARY KEY COLLATE NOCASE,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL DEFAULT '#B86B4B',
    builtin INTEGER NOT NULL DEFAULT 0,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS recipes (
    recipe_id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at REAL NOT NULL,
    updated_by INTEGER
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at REAL NOT NULL,
    actor_id INTEGER,
    actor_email TEXT,
    actor_name TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    target TEXT,
    detail TEXT,
    ip TEXT
);
CREATE INDEX IF NOT EXISTS activity_at ON activity_log(at);
CREATE INDEX IF NOT EXISTS activity_action ON activity_log(action);
"""

# Account tiers, highest first. Super Admins run the web console; Admins edit the food
# database from the app; Employees use the app.
ROLES = ("super_admin", "admin", "employee")

SEED_DIR = Path(__file__).resolve().parent / "seed"

# The categories the bundled catalog uses. They cannot be renamed or removed, because
# every phone's bundled foods refer to them by name.
BUILTIN_CATEGORIES = (
    ("Produce", "Fruit and vegetables.", "#6F9B72"),
    ("Dairy", "Milk, yogurt, cheese and eggs.", "#D6A85F"),
    ("Meat", "Meat, poultry and fish.", "#C95C54"),
    ("Pantry", "Bread, leftovers and shelf-stable food.", "#B86B4B"),
)

# The oldest entries are dropped past this, so the log cannot grow without bound.
MAX_ACTIVITY_ROWS = 200_000


class Database:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as conn, conn:
            conn.executescript(SCHEMA)
            self._upgrade_users(conn)
            self._seed_categories(conn)
            self._seed_recipes(conn)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
        return conn

    # ------------------------------------------------------------- upgrades
    @staticmethod
    def _upgrade_users(conn: sqlite3.Connection) -> None:
        """Bring an older database's accounts up to the three-tier roles."""
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)")}
        if "role" not in columns:
            # Databases created before roles existed: the oldest account set the install up.
            conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'employee'")
            conn.execute("UPDATE users SET role = 'super_admin' WHERE id = (SELECT MIN(id) FROM users)")
        if "disabled" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0")
        if "last_login_at" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN last_login_at REAL")

        # The two-role scheme called app users 'user'.
        conn.execute("UPDATE users SET role = 'employee' WHERE role NOT IN ('super_admin', 'admin', 'employee')")
        # Someone has to be able to sign in to the web console: the oldest administrator,
        # or the oldest account when there is none.
        if not conn.execute("SELECT 1 FROM users WHERE role = 'super_admin'").fetchone():
            conn.execute(
                "UPDATE users SET role = 'super_admin' WHERE id = COALESCE("
                "(SELECT MIN(id) FROM users WHERE role = 'admin'), (SELECT MIN(id) FROM users))"
            )

    @staticmethod
    def _seed_categories(conn: sqlite3.Connection) -> None:
        now = time.time()
        for name, description, color in BUILTIN_CATEGORIES:
            conn.execute(
                "INSERT INTO categories (name, description, color, builtin, created_at, updated_at) "
                "VALUES (?, ?, ?, 1, ?, ?) ON CONFLICT(name) DO UPDATE SET builtin = 1",
                (name, description, color, now, now),
            )

    @staticmethod
    def _seed_recipes(conn: sqlite3.Connection) -> None:
        """Load the app's bundled recipes once. Later deletions are kept, not re-seeded."""
        if conn.execute("SELECT 1 FROM meta WHERE key = 'recipes_seeded'").fetchone():
            return
        path = SEED_DIR / "recipes.json"
        recipes = json.loads(path.read_text(encoding="utf-8")) if path.exists() else []
        now = time.time()
        for recipe in recipes:
            conn.execute(
                "INSERT OR IGNORE INTO recipes (recipe_id, data, updated_at, updated_by) VALUES (?, ?, ?, NULL)",
                (recipe["id"], json.dumps(recipe, separators=(",", ":")), now),
            )
        conn.execute("INSERT INTO meta (key, value) VALUES ('recipes_seeded', '1')")
        conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('recipes_version', ?)", (repr(now),))

    # ----------------------------------------------------------------- meta
    @staticmethod
    def _bump(conn: sqlite3.Connection, key: str) -> None:
        """Record that a dataset changed. A counter, not MAX(updated_at), so deletions count too."""
        row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
        value = max(time.time(), float(row["value"]) + 0.001) if row else time.time()
        conn.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (key, repr(value)))

    def _version(self, key: str, fallback_sql: str) -> float:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT value FROM meta WHERE key = ?", (key,)).fetchone()
            if row:
                return float(row["value"])
            return float(conn.execute(fallback_sql).fetchone()[0] or 0)

    # ---------------------------------------------------------------- users
    def create_user(self, email: str, name: str, password_hash: str, role: str | None = None) -> int | None:
        """The new user's id, or None if the email is already registered.

        Without a role, the very first account becomes the Super Admin, so a fresh
        install has someone who can sign in to the web console; later ones are Employees.
        """
        try:
            with closing(self._connect()) as conn, conn:
                first = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 0
                cursor = conn.execute(
                    "INSERT INTO users (email, name, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?)",
                    (email, name, password_hash, time.time(), role or ("super_admin" if first else "employee")),
                )
                return int(cursor.lastrowid)
        except sqlite3.IntegrityError:
            return None

    def get_user_by_email(self, email: str) -> dict[str, Any] | None:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return dict(row) if row else None

    def get_user(self, user_id: int) -> dict[str, Any] | None:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return dict(row) if row else None

    def set_password(self, user_id: int, password_hash: str) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))

    def list_users(self) -> list[dict[str, Any]]:
        """Every account with how many items it has saved (no password hashes)."""
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT u.id, u.email, u.name, u.role, u.disabled, u.created_at, u.last_login_at, "
                "(SELECT COUNT(*) FROM inventory i WHERE i.user_id = u.id) AS items "
                "FROM users u ORDER BY u.id"
            ).fetchall()
        return [dict(row) for row in rows]

    def set_role(self, user_id: int, role: str) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))

    def update_user(self, user_id: int, **fields: Any) -> bool:
        """Change name, email, role or disabled. False if the email belongs to someone else."""
        allowed = {k: v for k, v in fields.items() if k in ("name", "email", "role", "disabled")}
        if not allowed:
            return True
        assignments = ", ".join(f"{key} = ?" for key in allowed)
        try:
            with closing(self._connect()) as conn, conn:
                conn.execute(f"UPDATE users SET {assignments} WHERE id = ?", (*allowed.values(), user_id))
            return True
        except sqlite3.IntegrityError:
            return False

    def delete_user(self, user_id: int) -> bool:
        """Remove an account and, through the foreign key, every item it saved."""
        with closing(self._connect()) as conn, conn:
            return conn.execute("DELETE FROM users WHERE id = ?", (user_id,)).rowcount > 0

    def mark_login(self, user_id: int) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (time.time(), user_id))

    def count_role(self, role: str, active_only: bool = False) -> int:
        sql = "SELECT COUNT(*) FROM users WHERE role = ?" + (" AND disabled = 0" if active_only else "")
        with closing(self._connect()) as conn:
            return int(conn.execute(sql, (role,)).fetchone()[0])

    def all_item_foods(self) -> list[str]:
        """The foodId of every saved item, across users, for the admin summary."""
        with closing(self._connect()) as conn:
            rows = conn.execute("SELECT data FROM inventory").fetchall()
        foods = []
        for row in rows:
            try:
                foods.append(str(json.loads(row["data"]).get("foodId", "")))
            except (ValueError, AttributeError):
                continue
        return foods

    # ---------------------------------------------------------------- foods
    def list_foods(self) -> list[dict[str, Any]]:
        with closing(self._connect()) as conn:
            rows = conn.execute("SELECT data FROM foods ORDER BY food_id").fetchall()
        return [json.loads(row["data"]) for row in rows]

    def foods_version(self) -> float:
        """Changes whenever the food database or its categories do; clients use it to know when to refresh."""
        return self._version("foods_version", "SELECT MAX(updated_at) FROM foods")

    def upsert_food(self, food_id: str, food: dict[str, Any], updated_by: int) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute(
                "INSERT INTO foods (food_id, data, updated_at, updated_by) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(food_id) DO UPDATE SET data = excluded.data, "
                "updated_at = excluded.updated_at, updated_by = excluded.updated_by",
                (food_id, json.dumps(food, separators=(",", ":")), time.time(), updated_by),
            )
            self._bump(conn, "foods_version")

    def delete_food(self, food_id: str) -> bool:
        with closing(self._connect()) as conn, conn:
            cursor = conn.execute("DELETE FROM foods WHERE food_id = ?", (food_id,))
            if cursor.rowcount:
                self._bump(conn, "foods_version")
            return cursor.rowcount > 0

    # ----------------------------------------------------------- categories
    def list_categories(self) -> list[dict[str, Any]]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT name, description, color, builtin, created_at, updated_at FROM categories "
                "ORDER BY builtin DESC, rowid"
            ).fetchall()
        return [{**dict(row), "builtin": bool(row["builtin"])} for row in rows]

    def get_category(self, name: str) -> dict[str, Any] | None:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM categories WHERE name = ?", (name,)).fetchone()
        return {**dict(row), "builtin": bool(row["builtin"])} if row else None

    def create_category(self, name: str, description: str, color: str) -> bool:
        now = time.time()
        try:
            with closing(self._connect()) as conn, conn:
                conn.execute(
                    "INSERT INTO categories (name, description, color, builtin, created_at, updated_at) "
                    "VALUES (?, ?, ?, 0, ?, ?)",
                    (name, description, color, now, now),
                )
                self._bump(conn, "foods_version")
            return True
        except sqlite3.IntegrityError:
            return False

    def update_category(self, current: str, name: str, description: str, color: str) -> bool:
        """Edit a category; a rename moves the server's foods to the new name. False on a name clash."""
        try:
            with closing(self._connect()) as conn, conn:
                old = conn.execute("SELECT name FROM categories WHERE name = ?", (current,)).fetchone()
                if not old:
                    return True
                conn.execute(
                    "UPDATE categories SET name = ?, description = ?, color = ?, updated_at = ? WHERE name = ?",
                    (name, description, color, time.time(), current),
                )
                if old["name"] != name:
                    for row in conn.execute("SELECT food_id, data FROM foods").fetchall():
                        food = json.loads(row["data"])
                        if str(food.get("category", "")).lower() == old["name"].lower():
                            food["category"] = name
                            conn.execute(
                                "UPDATE foods SET data = ?, updated_at = ? WHERE food_id = ?",
                                (json.dumps(food, separators=(",", ":")), time.time(), row["food_id"]),
                            )
                self._bump(conn, "foods_version")
            return True
        except sqlite3.IntegrityError:
            return False

    def delete_category(self, name: str) -> bool:
        with closing(self._connect()) as conn, conn:
            cursor = conn.execute("DELETE FROM categories WHERE name = ? AND builtin = 0", (name,))
            if cursor.rowcount:
                self._bump(conn, "foods_version")
            return cursor.rowcount > 0

    # -------------------------------------------------------------- recipes
    def list_recipes(self) -> list[dict[str, Any]]:
        with closing(self._connect()) as conn:
            rows = conn.execute("SELECT data, updated_at FROM recipes").fetchall()
        recipes = [{**json.loads(row["data"]), "updatedAt": row["updated_at"]} for row in rows]
        return sorted(recipes, key=lambda recipe: recipe["name"].lower())

    def recipes_version(self) -> float:
        return self._version("recipes_version", "SELECT MAX(updated_at) FROM recipes")

    def recipe_exists(self, recipe_id: str) -> bool:
        with closing(self._connect()) as conn:
            return conn.execute("SELECT 1 FROM recipes WHERE recipe_id = ?", (recipe_id,)).fetchone() is not None

    def count_recipes(self) -> int:
        with closing(self._connect()) as conn:
            return int(conn.execute("SELECT COUNT(*) FROM recipes").fetchone()[0])

    def upsert_recipe(self, recipe_id: str, recipe: dict[str, Any], updated_by: int) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute(
                "INSERT INTO recipes (recipe_id, data, updated_at, updated_by) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(recipe_id) DO UPDATE SET data = excluded.data, "
                "updated_at = excluded.updated_at, updated_by = excluded.updated_by",
                (recipe_id, json.dumps(recipe, separators=(",", ":")), time.time(), updated_by),
            )
            self._bump(conn, "recipes_version")

    def delete_recipe(self, recipe_id: str) -> bool:
        with closing(self._connect()) as conn, conn:
            cursor = conn.execute("DELETE FROM recipes WHERE recipe_id = ?", (recipe_id,))
            if cursor.rowcount:
                self._bump(conn, "recipes_version")
            return cursor.rowcount > 0

    # --------------------------------------------------------- activity log
    def log(
        self,
        action: str,
        actor: dict[str, Any] | None = None,
        target: str | None = None,
        detail: dict[str, Any] | None = None,
        ip: str | None = None,
        actor_email: str | None = None,
    ) -> None:
        """Append one entry. ``actor_email`` names who tried when there is no account (a failed login)."""
        with closing(self._connect()) as conn, conn:
            conn.execute(
                "INSERT INTO activity_log (at, actor_id, actor_email, actor_name, actor_role, action, target, detail, ip) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    time.time(),
                    actor["id"] if actor else None,
                    actor["email"] if actor else actor_email,
                    actor["name"] if actor else None,
                    actor.get("role") if actor else None,
                    action,
                    target,
                    json.dumps(detail, separators=(",", ":")) if detail else None,
                    ip,
                ),
            )
            conn.execute(
                "DELETE FROM activity_log WHERE id <= (SELECT MAX(id) FROM activity_log) - ?", (MAX_ACTIVITY_ROWS,)
            )

    @staticmethod
    def _activity_filter(
        action: str | None, actor: str | None, query: str | None, since: float | None, until: float | None
    ) -> tuple[str, list[Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if action:
            # "auth" matches every auth.* action; "auth.login" matches only that one.
            clauses.append("(action = ? OR action LIKE ?)")
            params += [action, f"{action}.%"]
        if actor:
            clauses.append("(actor_email LIKE ? OR actor_name LIKE ?)")
            params += [f"%{actor}%"] * 2
        if query:
            clauses.append(
                "(action LIKE ? OR target LIKE ? OR detail LIKE ? OR actor_email LIKE ? OR actor_name LIKE ?)"
            )
            params += [f"%{query}%"] * 5
        if since is not None:
            clauses.append("at >= ?")
            params.append(since)
        if until is not None:
            clauses.append("at < ?")
            params.append(until)
        return (" WHERE " + " AND ".join(clauses)) if clauses else "", params

    def list_activity(
        self,
        action: str | None = None,
        actor: str | None = None,
        query: str | None = None,
        since: float | None = None,
        until: float | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict[str, Any]], int]:
        """One page of entries, newest first, and how many match in total."""
        where, params = self._activity_filter(action, actor, query, since, until)
        with closing(self._connect()) as conn:
            total = int(conn.execute(f"SELECT COUNT(*) FROM activity_log{where}", params).fetchone()[0])
            rows = conn.execute(
                f"SELECT * FROM activity_log{where} ORDER BY id DESC LIMIT ? OFFSET ?", (*params, limit, offset)
            ).fetchall()
        entries = []
        for row in rows:
            entry = dict(row)
            entry["detail"] = json.loads(entry["detail"]) if entry["detail"] else None
            entries.append(entry)
        return entries, total

    def activity_actions(self) -> list[str]:
        with closing(self._connect()) as conn:
            return [row[0] for row in conn.execute("SELECT DISTINCT action FROM activity_log ORDER BY action")]

    def activity_by_day(self, days: int = 14) -> list[dict[str, Any]]:
        """Entries per local calendar day for the last ``days`` days, oldest first, zeros included."""
        today = time.localtime()
        start = time.mktime((today.tm_year, today.tm_mon, today.tm_mday - (days - 1), 0, 0, 0, 0, 0, -1))
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT date(at, 'unixepoch', 'localtime') AS day, COUNT(*) AS n FROM activity_log "
                "WHERE at >= ? GROUP BY day",
                (start,),
            ).fetchall()
        counts = {row["day"]: row["n"] for row in rows}
        result = []
        for offset in range(days):
            day = time.localtime(
                time.mktime((today.tm_year, today.tm_mon, today.tm_mday - (days - 1) + offset, 12, 0, 0, 0, 0, -1))
            )
            key = time.strftime("%Y-%m-%d", day)
            result.append({"day": key, "count": counts.get(key, 0)})
        return result

    # ------------------------------------------------------------ inventory
    def list_items(self, user_id: int) -> list[dict[str, Any]]:
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT data FROM inventory WHERE user_id = ? ORDER BY updated_at DESC", (user_id,)
            ).fetchall()
        return [json.loads(row["data"]) for row in rows]

    def count_items(self, user_id: int) -> int:
        with closing(self._connect()) as conn:
            return int(conn.execute("SELECT COUNT(*) FROM inventory WHERE user_id = ?", (user_id,)).fetchone()[0])

    def upsert_item(self, user_id: int, item_id: str, item: dict[str, Any], updated_at: str) -> dict[str, Any]:
        """Store the item unless a newer version is already saved; returns whichever version wins."""
        with closing(self._connect()) as conn, conn:
            row = conn.execute(
                "SELECT data, updated_at FROM inventory WHERE user_id = ? AND item_id = ?",
                (user_id, item_id),
            ).fetchone()
            if row and row["updated_at"] > updated_at:
                return json.loads(row["data"])
            conn.execute(
                "INSERT INTO inventory (user_id, item_id, data, updated_at) VALUES (?, ?, ?, ?) "
                "ON CONFLICT(user_id, item_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
                (user_id, item_id, json.dumps(item, separators=(",", ":")), updated_at),
            )
        return item

    def item_exists(self, user_id: int, item_id: str) -> bool:
        with closing(self._connect()) as conn:
            return (
                conn.execute(
                    "SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?", (user_id, item_id)
                ).fetchone()
                is not None
            )

    def delete_item(self, user_id: int, item_id: str) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute("DELETE FROM inventory WHERE user_id = ? AND item_id = ?", (user_id, item_id))

    # ---------------------------------------------------------- reset codes
    def save_reset_code(self, email: str, code_hash: str, expires_at: float) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute(
                "INSERT INTO reset_codes (email, code_hash, expires_at, attempts) VALUES (?, ?, ?, 0) "
                "ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, "
                "expires_at = excluded.expires_at, attempts = 0",
                (email, code_hash, expires_at),
            )

    def get_reset_code(self, email: str) -> dict[str, Any] | None:
        with closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM reset_codes WHERE email = ?", (email,)).fetchone()
        return dict(row) if row else None

    def bump_reset_attempts(self, email: str) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute("UPDATE reset_codes SET attempts = attempts + 1 WHERE email = ?", (email,))

    def delete_reset_code(self, email: str) -> None:
        with closing(self._connect()) as conn, conn:
            conn.execute("DELETE FROM reset_codes WHERE email = ?", (email,))
