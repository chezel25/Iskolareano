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

// ===============================
// AUTH MIDDLEWARE
// ===============================

// Require logged-in staff
function requireStaff(req, res, next) {
  const role = req.headers['x-role'];

  if (!role) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  req.role = role;
  next();
}

// Require admin only
function requireAdmin(req, res, next) {
  if (req.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}


// ✅ SERVE STATIC FILES
// Serve static frontend files
app.use(express.static(path.join(__dirname, '..', 'frontend', 'static')));

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

// ------------------- ADMIN LOGIN -------------------

// STAFF SIGNUP
app.post('/api/staff/signup', async (req, res) => {
  const { first_name, last_name, email, role } = req.body;

  if (!first_name || !last_name || !email || !role)
    return res.status(400).json({ error: 'Missing fields' });

  if (!['mswd','examiner','staff'].includes(role))
    return res.status(400).json({ error: 'Invalid role' });

  const tempPassword = generateTempPassword();

  const { data: authData, error } =
    await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true
    });

  if (error) return res.status(400).json({ error: error.message });

  await supabase.from('staff_accounts').insert({
    auth_id: authData.user.id,
    first_name,
    last_name,
    email,
    role,
    status: 'pending'
  });

  await transporter.sendMail({
    to: email,
    subject: 'Staff Request Received',
    text: `Your request is pending admin approval.`
  });

  res.json({ success: true });
});

// ===============================
// STAFF APPROVAL (ADMIN ONLY)
// ===============================

// get pending staff (ADMIN ONLY)
app.get('/api/staff/pending', requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('staff_accounts')
    .select('*')
    .eq('status', 'pending');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});


// approve staff (ADMIN ONLY)
app.post('/api/staff/:id/approve', requireAdmin, async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('staff_accounts')
    .update({ status: 'active' })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });
});


// reject staff (ADMIN ONLY)
app.post('/api/staff/:id/reject', requireAdmin, async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('staff_accounts')
    .update({ status: 'disabled' })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ success: true });
});


// ---------------- STAFF LOGIN (replaces admin table) ----------------
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      return res.status(401).json({ error: authError.message });
    }

    const userId = authData.user.id;

    const { data: staff, error: staffError } = await supabase
      .from('staff_accounts')
      .select('role, status')
      .eq('auth_id', userId)
      .single();

    if (staffError || !staff) {
      return res.status(403).json({ error: 'Unauthorized account' });
    }

    if (staff.status !== 'active') {
      return res.status(403).json({ error: 'Account disabled' });
    }

    return res.json({
      role: staff.role,
      redirect: 'admin-dashboard.html'
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    // 1️⃣ Supabase Auth login
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      return res.status(401).json({ error: authError.message });
    }

    const userId = authData.user.id;

    // 2️⃣ Check APPLICANTS table
    const { data: applicant } = await supabase
      .from('applicants')
      .select('email_verified')
      .eq('id', userId)
      .maybeSingle();

    if (applicant) {
      if (!applicant.email_verified) {
        return res.status(403).json({ error: '❌ Please verify your email first' });
      }

      return res.json({
        message: '✅ Login successful',
        role: 'applicant',
        redirect: 'applicant.html',
        user: authData.user,
        session: authData.session
      });
    }

    // 3️⃣ Check SCHOLARS table
    const { data: scholar } = await supabase
      .from('scholars')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (scholar) {
      return res.json({
        message: '✅ Login successful',
        role: 'scholar',
        redirect: 'homepage2.html',
        user: authData.user,
        session: authData.session
      });
    }



    
    // 4️⃣ Not found in any table
    return res.status(404).json({ error: 'User role not found' });

  } catch (err) {
    console.error('Login server error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});


// ------------------ FORGOT PASSWORD (working) dont change this!!!!!!!------------------

// ------------------- ADMIN FORGOT PASSWORD -------------------
app.post('/api/admin/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    // 1️⃣ Check if email belongs to admin
    const { data: admin, error } = await supabase
      .from('admins')
      .select('auth_id')
      .eq('email', email)
      .single();

    if (error || !admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // 2️⃣ Send reset email via Supabase
    const { error: resetError } =
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.FRONTEND_URL}/admin-reset-password.html`
      });

    if (resetError) throw resetError;

    res.json({ message: 'Password reset email sent' });

  } catch (err) {
    console.error('Admin forgot password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    // 1️⃣ Find applicant
    const { data: user, error: findError } = await supabase
      .from('applicants')
      .select('id,email,first_name')
      .ilike('email', email.trim()) // case-insensitive
      .single();

    if (findError || !user) return res.status(404).json({ error: 'User not found' });

    const userId = user.id;

    // 2️⃣ Generate reset token
    const token = Math.random().toString(36).substring(2, 15);

    // 3️⃣ Save token in table
    const { error: updateError } = await supabase
      .from('applicants')
      .update({ reset_token: token })
      .eq('id', userId);

    if (updateError) return res.status(500).json({ error: updateError.message });

    // 4️⃣ Send email with reset link
    const resetLink = `${process.env.FRONTEND_URL}/reset-password.html?token=${token}`;
    await transporter.sendMail({
      from: `"Iskolar ng Realeno" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Reset your password',
      html: `<p>Hello ${user.first_name},</p>
             <p>Click the link below to reset your password:</p>
             <a href="${resetLink}">${resetLink}</a>
             <p>If you didn’t request this, ignore this email.</p>`
    });

    res.json({ message: '✅ Check your email for the reset link!' });

  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});


// --- Reset password using token ---
app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Missing token or new password' });

  try {
    // Find user by token
    const { data: user, error } = await supabase
      .from('applicants')
      .select('id,email')
      .eq('reset_token', token)
      .single();

    if (error || !user) return res.status(404).json({ error: 'Invalid token' });

    // Update password in Supabase Auth using admin key
    const { data: updatedUser, error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword
    });

    if (updateError) throw updateError;

    // Clear token
    await supabase.from('applicants').update({ reset_token: null }).eq('id', user.id);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// ---------------- RESET PASSWORD (working) dont change this!!!!!!!----------------

// ------------------- ADMIN RESET PASSWORD -------------------
app.post('/api/admin/reset-password', async (req, res) => {
  const { access_token, newPassword } = req.body;

  if (!access_token || !newPassword) {
    return res.status(400).json({ error: 'Missing token or password' });
  }

  try {
    // 1️⃣ Validate token
    const { data: userData, error: tokenError } =
      await supabase.auth.getUser(access_token);

    if (tokenError) throw tokenError;

    // 2️⃣ Update password
    const { error } =
      await supabase.auth.admin.updateUserById(userData.user.id, {
        password: newPassword
      });

    if (error) throw error;

    res.json({ success: true, message: 'Password updated' });

  } catch (err) {
    console.error('Admin reset password error:', err);
    res.status(500).json({ error: err.message });
  }
});

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

app.get('/reset-password.html', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend/static/reset-password.html'));
});

// ---------------- TEMP PASSWORD GENERATOR ----------------
function generateTempPassword() {
  return 'ISK' + Math.floor(100000 + Math.random() * 900000);
}

// ---------------- CREATE STAFF ACCOUNT ----------------
app.post('/api/staff/create', async (req, res) => {
  const { first_name, last_name, email, role } = req.body;

  if (!first_name || !last_name || !email || !role) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  if (!['mswd', 'examiner', 'staff'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const tempPassword = generateTempPassword();

  try {
    // 1️⃣ Create Auth user
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true
      });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    // 2️⃣ Insert into staff_accounts table
    const { error: insertError } = await supabase
      .from('staff_accounts')
      .insert({
        auth_id: authData.user.id,
        first_name,
        last_name,
        email,
        role
      });

    if (insertError) {
      return res.status(400).json({ error: insertError.message });
    }

    // 3️⃣ Send email
    await transporter.sendMail({
      from: `"Iskolar ng Realeno" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Staff Account Created',
      text: `Hello ${first_name},

Your staff account has been created.

Role: ${role.toUpperCase()}
Email: ${email}
Temporary Password: ${tempPassword}

Please log in and change your password immediately.
`
    });

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// -------- LIST STAFF --------
app.get('/api/staff', async (req, res) => {
  const { data, error } = await supabase
    .from('staff_accounts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// -------- DISABLE STAFF --------
app.post('/api/staff/:id/disable', async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from('staff_accounts')
    .update({ status: 'disabled' })
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});


// ---------------- CREATE SCHOLAR (working) dont change this!!!!!!!----------------
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

// Staff self-signup (public)
app.post('/api/staff/request', async (req, res) => {
  const { first_name, last_name, email, role } = req.body;

  if (!first_name || !last_name || !email || !role) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  if (!['mswd','examiner','staff'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const { error } = await supabase
    .from('staff_requests')
    .insert({ first_name, last_name, email, role });

  if (error) return res.status(400).json({ error: error.message });

  res.json({ success: true });
});

// Admin: view pending staff requests
app.get('/api/staff/requests', requireStaff, requireAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from('staff_requests')
    .select('*')
    .eq('status', 'pending');

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/api/staff/requests/:id/approve', requireStaff, requireAdmin, async (req, res) => {
  const { id } = req.params;

  const { data: reqData, error } = await supabase
    .from('staff_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !reqData) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const tempPassword = 'ISK' + Math.floor(100000 + Math.random() * 900000);

  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email: reqData.email,
      password: tempPassword,
      email_confirm: true
    });

  if (authError) return res.status(400).json({ error: authError.message });

  await supabase.from('staff_accounts').insert({
    auth_id: authData.user.id,
    first_name: reqData.first_name,
    last_name: reqData.last_name,
    email: reqData.email,
    role: reqData.role,
    status: 'active'
  });

  await supabase
    .from('staff_requests')
    .update({ status: 'approved' })
    .eq('id', id);

  await transporter.sendMail({
    to: reqData.email,
    from: `"Iskolar ng Realeno" <${process.env.EMAIL_USER}>`,
    subject: 'Staff Account Approved',
    text: `Approved.\nEmail: ${reqData.email}\nTemp Password: ${tempPassword}`
  });

  res.json({ success: true });
});

app.post('/api/staff/requests/:id/reject', requireStaff, requireAdmin, async (req, res) => {
  await supabase
    .from('staff_requests')
    .update({ status: 'rejected' })
    .eq('id', req.params.id);

  res.json({ success: true });
});



// ---------------- SERVER ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));