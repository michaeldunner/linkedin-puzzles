CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game TEXT NOT NULL,
  puzzle_number INTEGER NOT NULL,
  time_seconds INTEGER,
  guesses INTEGER,
  created_at TEXT NOT NULL
);
