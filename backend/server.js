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

// MIDDLEWARE
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


app.listen(PORT, () => {
  console.log('Server running at http://localhost:${PORT}');
});

