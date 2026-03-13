import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("family_tree.db");
db.pragma('foreign_keys = ON');

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS persons (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    nickname TEXT,
    gender TEXT,
    birth_date TEXT,
    birth_time TEXT,
    birth_place TEXT,
    current_location TEXT,
    profession TEXT,
    education TEXT,
    bio TEXT,
    photo_url TEXT,
    custom_fields TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS relationships (
    id TEXT PRIMARY KEY,
    person1_id TEXT NOT NULL,
    person2_id TEXT NOT NULL,
    type TEXT NOT NULL,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (person1_id) REFERENCES persons(id) ON DELETE CASCADE,
    FOREIGN KEY (person2_id) REFERENCES persons(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL,
    date TEXT NOT NULL,
    topic TEXT,
    content TEXT,
    follow_up_reminder TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (person_id) REFERENCES persons(id) ON DELETE CASCADE
  );
`);

// Migrations for existing databases
try {
  db.prepare("SELECT nickname FROM persons LIMIT 1").get();
} catch (e) {
  console.log("Adding nickname column...");
  db.exec("ALTER TABLE persons ADD COLUMN nickname TEXT;");
}

try {
  db.prepare("SELECT birth_time FROM persons LIMIT 1").get();
} catch (e) {
  console.log("Adding birth_time column...");
  db.exec("ALTER TABLE persons ADD COLUMN birth_time TEXT;");
}

try {
  db.prepare("SELECT custom_fields FROM persons LIMIT 1").get();
} catch (e) {
  console.log("Adding custom_fields column...");
  db.exec("ALTER TABLE persons ADD COLUMN custom_fields TEXT;");
}

// Seed data if empty
const personCount = db.prepare("SELECT COUNT(*) as count FROM persons").get() as { count: number };
if (personCount.count === 0) {
  console.log("Seeding initial data...");
  db.prepare(`INSERT INTO persons (id, full_name, gender, profession, bio, photo_url) VALUES (?, ?, ?, ?, ?, ?)`).run('1', 'John Smith', 'Male', 'Architect', 'The patriarch of the family.', 'https://picsum.photos/seed/john/200/200');
  db.prepare(`INSERT INTO persons (id, full_name, gender, profession, bio, photo_url) VALUES (?, ?, ?, ?, ?, ?)`).run('2', 'Jane Smith', 'Female', 'Doctor', 'The matriarch of the family.', 'https://picsum.photos/seed/jane/200/200');
  db.prepare(`INSERT INTO persons (id, full_name, gender, profession, bio, photo_url) VALUES (?, ?, ?, ?, ?, ?)`).run('3', 'Robert Smith', 'Male', 'Engineer', 'The eldest son.', 'https://picsum.photos/seed/robert/200/200');
  
  db.prepare(`INSERT INTO relationships (id, person1_id, person2_id, type) VALUES (?, ?, ?, ?)`).run('r1', '1', '2', 'SPOUSE_OF');
  db.prepare(`INSERT INTO relationships (id, person1_id, person2_id, type) VALUES (?, ?, ?, ?)`).run('r2', '1', '3', 'PARENT_OF');
  db.prepare(`INSERT INTO relationships (id, person1_id, person2_id, type) VALUES (?, ?, ?, ?)`).run('r3', '2', '3', 'PARENT_OF');
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  
  // Persons
  app.get("/api/persons", (req, res) => {
    try {
      const persons = db.prepare("SELECT * FROM persons ORDER BY full_name ASC").all();
      res.json(persons);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch persons" });
    }
  });

  app.post("/api/persons", (req, res) => {
    try {
      const { id, full_name, nickname, gender, birth_date, birth_time, birth_place, current_location, profession, education, bio, photo_url, custom_fields } = req.body;
      const stmt = db.prepare(`
        INSERT INTO persons (id, full_name, nickname, gender, birth_date, birth_time, birth_place, current_location, profession, education, bio, photo_url, custom_fields)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, full_name, nickname, gender, birth_date, birth_time, birth_place, current_location, profession, education, bio, photo_url, custom_fields);
      res.status(201).json({ id });
    } catch (error) {
      console.error("Error creating person:", error);
      res.status(500).json({ error: "Failed to create person" });
    }
  });

  app.put("/api/persons/:id", (req, res) => {
    try {
      const { full_name, nickname, gender, birth_date, birth_time, birth_place, current_location, profession, education, bio, photo_url, custom_fields } = req.body;
      const stmt = db.prepare(`
        UPDATE persons SET 
          full_name = ?, nickname = ?, gender = ?, birth_date = ?, birth_time = ?, birth_place = ?, 
          current_location = ?, profession = ?, education = ?, bio = ?, photo_url = ?, custom_fields = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      stmt.run(full_name, nickname, gender, birth_date, birth_time, birth_place, current_location, profession, education, bio, photo_url, custom_fields, req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating person:", error);
      res.status(500).json({ error: "Failed to update person" });
    }
  });

  app.delete("/api/persons/:id", (req, res) => {
    const { id } = req.params;
    console.log(`[SERVER] Attempting to delete person: ${id}`);
    try {
      const result = db.prepare("DELETE FROM persons WHERE id = ?").run(id);
      console.log(`[SERVER] Deleted ${result.changes} person(s)`);
      if (result.changes === 0) {
        return res.status(404).json({ error: "Person not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[SERVER] Delete person error:", error);
      res.status(500).json({ error: "Failed to delete person" });
    }
  });

  // Relationships
  app.get("/api/relationships", (req, res) => {
    try {
      const relationships = db.prepare("SELECT * FROM relationships").all();
      res.json(relationships);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch relationships" });
    }
  });

  app.post("/api/relationships", (req, res) => {
    try {
      const { id, person1_id, person2_id, type, metadata } = req.body;
      const stmt = db.prepare(`
        INSERT INTO relationships (id, person1_id, person2_id, type, metadata)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmt.run(id, person1_id, person2_id, type, metadata);
      res.status(201).json({ id });
    } catch (error) {
      console.error("Error creating relationship:", error);
      res.status(500).json({ error: "Failed to create relationship" });
    }
  });

  app.delete("/api/relationships/:id", (req, res) => {
    const { id } = req.params;
    console.log(`[SERVER] Attempting to delete relationship: ${id}`);
    try {
      const result = db.prepare("DELETE FROM relationships WHERE id = ?").run(id);
      console.log(`[SERVER] Deleted ${result.changes} relationship(s)`);
      if (result.changes === 0) {
        return res.status(404).json({ error: "Relationship not found" });
      }
      res.json({ success: true });
    } catch (error) {
      console.error("[SERVER] Delete relationship error:", error);
      res.status(500).json({ error: "Failed to delete relationship" });
    }
  });

  // Notes
  app.get("/api/notes", (req, res) => {
    try {
      const notes = db.prepare("SELECT * FROM notes ORDER BY date DESC").all();
      res.json(notes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch all notes" });
    }
  });

  app.get("/api/persons/:personId/notes", (req, res) => {
    try {
      const notes = db.prepare("SELECT * FROM notes WHERE person_id = ? ORDER BY date DESC").all(req.params.personId);
      res.json(notes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch notes" });
    }
  });

  app.post("/api/notes", (req, res) => {
    try {
      const { id, person_id, date, topic, content, follow_up_reminder } = req.body;
      const stmt = db.prepare(`
        INSERT INTO notes (id, person_id, date, topic, content, follow_up_reminder)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, person_id, date, topic, content, follow_up_reminder);
      res.status(201).json({ id });
    } catch (error) {
      res.status(500).json({ error: "Failed to create note" });
    }
  });

  app.delete("/api/notes/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM notes WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete note" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
