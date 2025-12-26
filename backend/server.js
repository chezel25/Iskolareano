require('dotenv').config({ path: '../.env' });

const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Serve frontend static files so the app can be accessed at http://localhost:5000
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Default route — serve BLUE ORANGE.html as the main landing (avoids opening old index.html)
app.get(['/', '/index.html', '/home', '/homepage.html'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend/static/BLUE ORANGE.html'));
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


// Applicant registration
app.post('/api/register', async (req, res) => {
  const { full_name, email, password } = req.body;

  try {
    const { error } = await supabasePublic.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name,
          role: 'applicant'
        }
      }
    });

    if (error) throw error;

    res.json({ message: 'Registration successful. Verify your email.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// Unified login (applicant + scholar)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } =
      await supabasePublic.auth.signInWithPassword({
        email,
        password
      });

    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from('profiles')
        .select('full_name, role, scholar_id, degree')
        .eq('id', data.user.id)
        .single();

    if (profileError || !profile) {
      return res.status(403).json({
        error: 'Profile not found. Email may not be verified yet.'
      });
    }

    res.json({
      full_name: profile.full_name,
      role: profile.role,
      scholar_id: profile.scholar_id,
      degree: profile.degree
    });

  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});


// Admin login
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } =
      await supabaseAdmin.auth.signInWithPassword({
        email,
        password
      });

    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid admin credentials' });
    }

    res.json({
      message: 'Login successful',
      redirect: '/static/admin-dashboard.html'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Admin creates scholar
app.post('/api/admin/create-scholar', async (req, res) => {
  const { name, email, degree } = req.body;
  const defaultPassword = 'ISKOLAREAN01';

  try {
    const { data, error } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: defaultPassword,
        email_confirm: true,
        user_metadata: {
          full_name: name,
          role: 'scholar',
          degree
        }
      });

    if (error) throw error;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Your Scholar Account',
      text: `Hello ${name},

Your scholar account has been created.

Temporary Password: ${defaultPassword}

Please log in and change your password.`
    });

    res.json({ message: 'Scholar created successfully' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.listen(5000, () => {
  console.log('Server running at http://localhost:5000');
});
