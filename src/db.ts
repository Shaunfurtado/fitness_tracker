import { Database } from "bun:sqlite";

const db = new Database("fitness_tracker.sqlite");

db.run(`
    CREATE TABLE IF NOT EXISTS fitness_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        image1 TEXT,
        image2 TEXT,
        image3 TEXT,
        image4 TEXT
    );
`);

export default db;
