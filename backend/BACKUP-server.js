import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

// Setup email transporter
export const transporter = nodemailer.createTransport({
  service: 'gmail', // or your email service
  auth: {
    user: process.env.EMAIL_USER,    // Your email
    pass: process.env.EMAIL_PASS     // Your email password or app password
  }
});

// Optional: verify connection
transporter.verify(function(error, success) {
  if (error) {
    console.log("Email transporter error:", error);
  } else {
    console.log("✅ Email transporter ready");
  }
});





dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'frontend', 'static')));

// Default landing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend/static/index.html'));
});

// Serve reset-password.html at /reset-password.html
app.get('/reset-password.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend/static/reset-password.html'));
});
// ---------------- SUPABASE ----------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
// Test DB connection
(async () => {
  const { data, error } = await supabase.from('scholars').select('*').limit(1);
  if (error) {
    console.error("❌ Postgres connection failed:", error.message);
  } else {
    console.log("✅ Postgres connected, test query success");
  }
})();

// ---------------- LOGIN (APPLICANT OR SCHOLAR) ----------------
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const supabaseAuth = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    const user = data.user;

    // CHECK SCHOLARS
    const { data: scholar } = await supabase
      .from('scholars')
      .select('*')
      .eq('id', user.id)
      .single();

    if (scholar) {
      return res.json({
        role: "scholar",
        user: scholar
      });
    }

    // CHECK APPLICANTS
    const { data: applicant } = await supabase
      .from('applicants')
      .select('*')
      .eq('id', user.id)
      .single();

    if (applicant) {
      return res.json({
        role: "applicant",
        user: applicant
      });
    }

    return res.status(404).json({ error: "Profile not found" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});


// ---------------- SIGN-UP SCHOLAR APPLICANT----------------
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const supabaseAuth = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );

  try {
    // 1️⃣ AUTHENTICATE
    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({ error: error.message });
    }

    // 2️⃣ CHECK SCHOLARS BY EMAIL
    const { data: scholar } = await supabase
      .from('scholars')
      .select('*')
      .eq('email', email)
      .single();

    if (scholar) {
      return res.json({
        role: 'scholar',
        user: scholar
      });
    }

    // 3️⃣ CHECK APPLICANTS BY EMAIL
    const { data: applicant } = await supabase
      .from('applicants')
      .select('*')
      .eq('email', email)
      .single();

    if (applicant) {
      return res.json({
        role: 'applicant',
        user: applicant
      });
    }

    // 4️⃣ NOT FOUND
    return res.status(404).json({
      error: 'No applicant or scholar profile found'
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


// ---------------- FORGOT PASSWORD ----------------
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'http://localhost:5000/reset-password.html' // must match backend
    });

    if (error) throw error;

    res.json({ success: true, message: 'Reset email sent' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- RESET PASSWORD (BACKEND) ----------------
app.post('/api/reset-password', async (req, res) => {
  const { access_token, newPassword } = req.body;

  if (!access_token || !newPassword) {
    return res.status(400).json({ error: 'Missing token or new password' });
  }

  try {
    // Authenticate user with access token
    const { data: userData, error: tokenError } = await supabase.auth.getUser(access_token);
    if (tokenError) throw tokenError;

    const userId = userData.user.id;

    // Update password using admin key
    const { data, error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (error) throw error;

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- SERVE RESET PASSWORD HTML ----------------
app.get('/reset-password.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend/static/reset-password.html'));
});

// ---------------- TEMP PASSWORD GENERATOR ----------------
function generateTempPassword() {
  return 'ISK' + Math.floor(100000 + Math.random() * 900000);
}

// ---------------- CREATE SCHOLAR ----------------
app.post('/api/admin/create-scholar', async (req, res) => {
  const { first_name, middle_name, last_name, address, email, degree } = req.body;
  const tempPassword = generateTempPassword();

  try {
    // 1️⃣ CREATE AUTH USER IN SUPABASE
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true
    });

    if (authError) {
      console.error("Auth error:", authError);
      return res.status(400).json({ error: authError.message });
    }

    console.log("✅ Auth user created:", authData.user.id);

    // 2️⃣ INSERT SCHOLAR PROFILE (scholar_id auto-generated by trigger)
    const { error: insertError } = await supabase
      .from('scholars')
      .insert({
        id: authData.user.id,
        first_name,
        middle_name,
        last_name,
        address,
        email,
        degree
      });

    if (insertError) {
      console.error("Insert error:", insertError);
      return res.status(400).json({ error: insertError.message });
    }

    // 3️⃣ SEND EMAIL WITH TEMP PASSWORD
    await transporter.sendMail({
      from: `"Iskolar ng Realeno" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Scholar Account Created',
      text: `Hello ${first_name},

Your scholar account has been created.

Email: ${email}
Temporary Password: ${tempPassword}

Please log in and change your password immediately.

Regards,
Iskolar ng Realeno Team`
    });

    res.json({
      success: true,
      message: 'Scholar created successfully'
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------------- LOAD PROFILE ----------------

app.post('/api/profile/update', async (req, res) => {
  try {
    const { degree} = req.body; //{ degree, semester } later
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No token' });
    }

    const token = authHeader.replace('Bearer ', '');

    const { data: authData, error: authError } =
      await supabasePublic.auth.getUser(token);

    if (authError || !authData.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const updates = {};
    if (degree) updates.degree = degree;
    // if (semester) updates.semester = semester;

    const { error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', authData.user.id);

    if (error) throw error;

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => {
  console.log('Server running at http://localhost:5000');
});

// ---------------- ANNOUNCEMENTS ----------------
app.post('/api/admin/announcement', async (req, res) => {
  const { title, content } = req.body;

  const { error } = await supabase
    .from('announcements')
    .insert({ title, content });

  if (error) return res.status(500).json(error);
  res.send('Announcement posted');
});

app.get('/api/announcements', async (req, res) => {
  const { data, error } = await supabase
    .from('announcements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json(error);
  res.json(data);
});

// ---------------- SERVER ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
