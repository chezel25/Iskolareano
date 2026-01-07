import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

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

// ✅ SERVE STATIC FILES
// Serve static files from the "frontend" folder
app.use(express.static(path.join(__dirname, 'frontend')));

// API routes
app.post('/api/login', async (req, res) => {
});
app.get('/api/verify-email', async (req, res) => {
});

// Default landing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend/static/index.html'));
});

// Serve reset-password.html at /reset-password.html
app.get('/reset-password.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend/static/reset-password.html'));
});
// ---------------- SUPABASE ----------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_URL or SUPABASE_SERVICE_KEY missing in .env");
  process.exit(1);
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Test DB connection
async function testDB() {
  const { data, error } = await supabase.from('scholars').select('*').limit(1);
  if (error) {
    console.error("❌ Postgres connection failed:", error.message);
  } else {
    console.log("✅ Postgres connected, test query success");
  }
}
testDB();


// Test DB connection
(async () => {
  const { data, error } = await supabase.from('scholars').select('*').limit(1);
  if (error) {
    console.error("❌ Postgres connection failed:", error.message);
  } else {
    console.log("✅ Postgres connected, test query success");
  }
})();

// ------------------- SIGNUP FOR APPLICANT (working) dont change this!!!!!!! -------------------
app.post('/api/signup', async (req, res) => {
  const { first_name, middle_name, last_name, address, email, password } = req.body;
  if (!first_name || !last_name || !email || !password)
    return res.status(400).json({ error: 'Please fill all required fields' });

  try {
    // 1️⃣ Create user sa Supabase Auth (Admin API)
    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        email_confirm: true, // Option B: custom verification
        user_metadata: { first_name, middle_name, last_name, address }
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: data?.message || JSON.stringify(data) });

    const userId = data.id;

    // 2️⃣ Insert sa applicants table
    const { error: insertError } = await supabase
      .from('applicants')
      .insert({
        id: userId,
        first_name,
        middle_name,
        last_name,
        address,
        email,
        email_verified: false
      });
    if (insertError) return res.status(500).json({ error: insertError.message });

    // 3️⃣ Generate verification token
    const token = Math.random().toString(36).substring(2, 15);
    await supabase.from('applicants').update({ verify_token: token }).eq('id', userId);

    // 4️⃣ Send verification email
    const verifyLink = `${process.env.FRONTEND_URL}/verify.html?token=${token}`;
    await transporter.sendMail({
      from: `"Iskolar ng Realeno" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify your email',
      html: `<p>Hello ${first_name},</p>
             <p>Click below to verify your email:</p>
             <a href="${verifyLink}">${verifyLink}</a>
             <p>Thank you!</p>`
    });

    res.json({ message: 'Signup successful! Check your email to verify your account.' });

  } catch (err) {
    console.error('Signup server error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ------------------- VERIFY EMAIL(working) dont change this!!!!!!!  -------------------
app.get('/api/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send('Invalid token');

  try {
    // Hanapin applicant gamit token
    const { data: applicant, error } = await supabase
      .from('applicants')
      .select('*')
      .eq('verify_token', token)
      .single();

    if (error || !applicant) return res.status(400).send('❌ Verification failed: Token not found');

    // Update table
    await supabase.from('applicants')
      .update({ email_verified: true, verify_token: null })
      .eq('id', applicant.id);

    res.send('✅ Email verified! You can now login using the same password you set at signup.');

  } catch (err) {
    console.error('Verify email server error:', err);
    res.status(500).send('Server error');
  }
});

// ------------------- LOGIN (working) dont change this!!!!!!!  -------------------
// Backend login endpoint
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  try {
    // 1️⃣ Login via Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) return res.status(401).json({ error: authError.message });

    const userId = authData.user.id;

    // 2️⃣ Check applicants table for email_verified
    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('email_verified')
      .eq('id', userId)
      .single();

    if (applicantError || !applicant) return res.status(404).json({ error: 'User not found in applicants table' });

    if (!applicant.email_verified) return res.status(403).json({ error: '❌ Please verify your email first' });

    // ✅ Success
    res.json({
      message: '✅ Login successful',
      user: authData.user,
      session: authData.session
    });

  } catch (err) {
    console.error('Login server error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
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



// ---------------- ADMIN DASHBOARD STATS (AKI)----------------

app.get('/api/admin/dashboard-stats', async (req, res) => {
  try {
    // Helper function to get count safely
    const getCount = async (status) => {
      const query = supabase
        .from('applicants') // <- your table name
        .select('*', { count: 'exact', head: true });
      if (status) query.eq('status', status);

      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0; // default to 0 if null
    };

    const total = await getCount();
    const passed = await getCount('passed');
    const failed = await getCount('failed');
    const pending = await getCount('pending');

    const passRate = total === 0 ? 0 : ((passed / total) * 100).toFixed(1);

    res.json({
      totalParticipants: total,
      passed,
      failed,
      pending,
      passRate
    });

  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
});
// ---------------- GET ALL APPLICATIONS (AKI)----------------
app.get('/api/admin/applicants', async (req, res) => {
  const { data, error } = await supabase
    .from('applicants')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

// ---------------- APPROVE APPLICATION (AKI)----------------
app.post('/api/admin/applicants/:id/approve', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('applicants')
    .update({ status: 'passed' })
    .eq('id', id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, message: 'Application approved' });
});
// ---------------- REJECT APPLICATION (AKI)----------------
app.post('/api/admin/applicants/:id/reject', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('applicants')
    .update({ status: 'failed' })
    .eq('id', id);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true, message: 'Application rejected' });
});


// All scholars
app.get('/api/admin/scholars', async (req, res) => {
  try {
    const { data, error } = await supabase.from('scholars').select('*').not('status', 'eq', 'pending');
    if (error) return res.status(500).json({ error: error.message });

    res.json(data.map(s => ({
      scholar_id: s.scholar_id,
      full_name: `${s.first_name} ${s.middle_name || ''} ${s.last_name}`,
      email: s.email,
      degree: s.degree,
      status: s.status
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
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
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));