import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pkg from "pg";

dotenv.config(); // Load .env manually

const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// MIDDLEWARE
app.use(express.json());
app.use(cors());

// Serve frontend
app.use(express.static(path.join(__dirname, 'frontend')));




// UPLOAD FOLDER
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

// ---------------------- DATABASE CONNECTION ----------------------
console.log("Loaded DATABASE_URL:", process.env.DATABASE_URL);

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Neon
});

// TEST DB CONNECTION
pool.query("SELECT NOW()")
    .then(() => console.log("✅ PostgreSQL connected"))
    .catch(err => console.error("❌ PostgreSQL connection error:", err));

// ---------------------- FILE UPLOADS ----------------------
const storage = multer.diskStorage({
    destination: path.join(__dirname, "..", "uploads"),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

// ---------------------- ROUTES ----------------------

// Default route → show homepage2.html
// Homepage
app.use(express.static(path.join(__dirname, '..', 'frontend')));
// ---------------- SCHOLAR REGISTRATION ----------------
app.post("/api/register", async (req, res) => {
    const { name, email, password } = req.body;
    const scholar_id = "S" + Date.now();

    try {
        await pool.query(
            `INSERT INTO scholars (scholar_id, name, email, password)
             VALUES ($1,$2,$3,$4)`,
            [scholar_id, name, email, password]
        );
        res.send({ scholar_id });
    } catch (err) {
        res.status(500).send(err.message);
    }
});

// ---------------- SCHOLAR LOGIN ----------------
app.post("/api/login", async (req, res) => {
    const { scholar_id, password } = req.body;

    try {
        const result = await pool.query(
            `SELECT scholar_id, name, degree, email 
             FROM scholars 
             WHERE scholar_id=$1 AND password=$2`,
            [scholar_id, password]
        );

        if (result.rows.length === 0)
            return res.status(400).json({ error: "Invalid ID or password" });

        res.json(result.rows[0]);

    } catch (err) {
        res.status(500).send("Server error");
    }
});

// ---------------- ADMIN LOGIN ----------------
app.post("/api/admin/login", async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query(
            "SELECT * FROM admin WHERE email=$1 AND password=$2",
            [email, password]
        );

        console.log("Admin login query result:", result.rows);

        if (result.rows.length === 0)
            return res.status(401).json({ error: "Invalid admin credentials" });

        res.json({
            message: "Login successful",
            admin: result.rows[0]
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------- TEST API ----------------
app.get("/api/test", (req, res) => {
    res.send("🟢 Backend is running!");
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () =>
    console.log(`🚀 Server running at http://localhost:${PORT}`)
);
