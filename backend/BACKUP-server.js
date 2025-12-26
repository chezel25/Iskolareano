require('dotenv').config({ path: '../.env' });
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.get(['/', '/index.html', '/home', '/homepage.html'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend/static', 'BLUE ORANGE.html'));
});

// -------------------- DATABASE SETUP --------------------

const dbFile = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbFile);

db.serialize(() => {

  db.run(`CREATE TABLE IF NOT EXISTS scholars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scholar_id TEXT UNIQUE,
    name TEXT,
    email TEXT,
    password TEXT,
    degree TEXT,
    photo TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT,
    course TEXT,
    requirements TEXT,
    file TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scholar_id TEXT,
    semester TEXT,
    grade_file TEXT,
    journal TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admin (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    password TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    content TEXT,
    date TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS graduates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    degree TEXT,
    year TEXT,
    message TEXT,
    photo TEXT
  )`);

  // Insert default admin
  db.get(`SELECT * FROM admin WHERE email='admin@example.com'`, (err, row) => {
    if (!row) {
      db.run(`INSERT INTO admin (email, password) VALUES ('admin@example.com', 'admin123')`);
      console.log('✔ Default admin created: admin@example.com / admin123');
    }
  });
});


// -------------------- FILE UPLOAD SETUP --------------------

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({ storage });


// -------------------- SCHOLAR ROUTES --------------------

// Register new scholar
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  const scholar_id = "S" + Date.now();

  db.run(
    `INSERT INTO scholars (scholar_id, name, email, password) VALUES (?, ?, ?, ?)`,
    [scholar_id, name, email, password],
    err => {
      if (err) return res.status(500).send(err.message);
      res.send({ scholar_id });
    }
  );
});

// Scholar Login
app.post('/api/login', (req, res) => {
  const { scholar_id, password } = req.body;

  db.get(
    `SELECT scholar_id, name, degree, email FROM scholars WHERE scholar_id=? AND password=?`,
    [scholar_id, password],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Server error" });
      if (!row) return res.status(400).json({ error: "Invalid ID or password" });

      res.json(row);
    }
  );
});

// Apply for scholarship (applicant)
app.post('/api/apply', upload.single('file'), (req, res) => {
  const { name, email, course, requirements } = req.body;
  const file = req.file ? req.file.filename : null;

  db.run(
    `INSERT INTO applications (name, email, course, requirements, file) VALUES (?, ?, ?, ?, ?)`,
    [name, email, course, requirements, file],
    err => err ? res.status(500).send(err.message) : res.send("Application submitted")
  );
});

// Update scholar degree
app.post('/api/profile', (req, res) => {
  const { scholar_id, degree } = req.body;

  db.run(
    `UPDATE scholars SET degree=? WHERE scholar_id=?`,
    [degree, scholar_id],
    err => {
      if (err) return res.status(500).send(err.message);
      res.send("Profile updated");
    }
  );
});

// Upload grades + journal
app.post('/api/upload', upload.single('grade_file'), (req, res) => {
  const { scholar_id, semester, journal } = req.body;
  const filename = req.file ? req.file.filename : null;

  db.run(
    `INSERT INTO grades (scholar_id, semester, grade_file, journal) VALUES (?, ?, ?, ?)`,
    [scholar_id, semester, filename, journal],
    err => err ? res.status(500).send(err.message) : res.send("Grade uploaded")
  );
});


// -------------------- ADMIN ROUTES --------------------

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;

  db.get(
    `SELECT * FROM admin WHERE email=? AND password=?`,
    [email, password],
    (err, row) => {
      if (err) return res.status(500).send(err.message);
      if (!row) return res.status(401).send("Invalid admin credentials");

      res.send({ message: "Login successful" });
    }
  );
});

// Get all applicants
app.get('/api/admin/applicants', (req, res) => {
  db.all(`SELECT * FROM applications ORDER BY id DESC`, [], (err, rows) =>
    err ? res.status(500).send(err.message) : res.send(rows)
  );
});

// Get all scholars + journal
app.get('/api/admin/scholars', (req, res) => {
  db.all(
    `SELECT s.name, s.scholar_id, s.degree, g.semester, g.grade_file, g.journal
     FROM scholars s LEFT JOIN grades g ON s.scholar_id = g.scholar_id
     ORDER BY s.name`,
    [],
    (err, rows) => err ? res.status(500).send(err.message) : res.send(rows)
  );
});


// -------------------- ANNOUNCEMENTS --------------------

app.post('/api/admin/announcement', (req, res) => {
  const { title, content } = req.body;
  const date = new Date().toLocaleString();

  db.run(
    `INSERT INTO announcements (title, content, date) VALUES (?, ?, ?)`,
    [title, content, date],
    err => err ? res.status(500).send(err.message) : res.send("Announcement posted")
  );
});

app.get('/api/announcements', (req, res) => {
  db.all(
    `SELECT * FROM announcements ORDER BY id DESC`,
    [],
    (err, rows) => err ? res.status(500).send(err.message) : res.send(rows)
  );
});

app.delete('/api/admin/announcement/:id', (req, res) => {
  db.run(
    `DELETE FROM announcements WHERE id=?`,
    [req.params.id],
    err => err ? res.status(500).send(err.message) : res.send("Announcement deleted")
  );
});


// -------------------- GRADUATES --------------------

app.post('/api/admin/graduate', upload.single('photo'), (req, res) => {
  const { name, degree, year, message } = req.body;
  const photo = req.file ? req.file.filename : null;

  db.run(
    `INSERT INTO graduates (name, degree, year, message, photo) VALUES (?, ?, ?, ?, ?)`,
    [name, degree, year, message, photo],
    err => err ? res.status(500).send(err.message) : res.send("Graduate added")
  );
});

app.get('/api/graduates', (req, res) => {
  db.all(
    `SELECT * FROM graduates ORDER BY id DESC`,
    [],
    (err, rows) => err ? res.status(500).send(err.message) : res.send(rows)
  );
});

app.delete('/api/admin/graduate/:id', (req, res) => {
  db.run(
    `DELETE FROM graduates WHERE id=?`,
    [req.params.id],
    err => err ? res.status(500).send(err.message) : res.send("Graduate removed")
  );
});


// -------------------- SCHOLAR CREATED BY ADMIN --------------------

app.post('/api/admin/create-scholar', (req, res) => {
  const { scholar_id, name, email, password, degree } = req.body;

  db.run(
    `INSERT INTO scholars (scholar_id, name, email, password, degree) VALUES (?, ?, ?, ?, ?)`,
    [scholar_id, name, email, password, degree],
    err => err ? res.status(500).send(err.message) : res.send("Scholar account created")
  );
});


// -------------------- PASSWORD RESET --------------------

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'your-email@gmail.com',
    pass: 'your-email-password'
  }
});

app.post('/api/reset-password', (req, res) => {
  const { email, newPassword } = req.body;

  db.get(`SELECT * FROM scholars WHERE email=?`, [email], (err, row) => {
    if (!row) return res.status(404).send('Email not found');

    db.run(`UPDATE scholars SET password=? WHERE email=?`, [newPassword, email], err => {
      if (err) return res.status(500).send(err.message);

      const mailOptions = {
        from: 'your-email@gmail.com',
        to: email,
        subject: 'Password Reset - ISKOLAREALENO',
        text: `Your password has been reset.\nNew Password: ${newPassword}`
      };

      transporter.sendMail(mailOptions, (error) => {
        if (error) return res.status(500).send(error.message);
        res.send('Password reset successfully. Check your email.');
      });
    });
  });
});
// test route
app.get('/api/supabase-test', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).send(err.message);
  }
});
// -------------------- START SERVER --------------------

app.listen(5000, () =>
  console.log("🚀 Server running at http://localhost:5000")
);
