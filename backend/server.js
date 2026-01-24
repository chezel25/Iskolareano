import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import multer from 'multer';
import fs from 'fs';
import pkg from 'pg';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);
const { Pool } = pkg;

// 1️⃣ Load env first
dotenv.config();

// 2️⃣ Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// 3️⃣ Postgres pool
const pool = new Pool({ connectionString: process.env.DB_URL });
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});
// 4️⃣ Email transporter
export const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

transporter.verify((error, success) => {
  if (error) console.log('Email transporter error:', error);
  else console.log('✅ Email transporter ready');
});

// 5️⃣ File paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ SUPABASE_URL or SUPABASE_SERVICE_KEY missing in .env");
  process.exit(1);
}
export async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "No token provided" });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: "Unauthorized" });

  req.user = user; // attach user to request
  next();
}

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
     await supabase.from('applicants').insert({
  id: userId,
  first_name,
  middle_name,
  last_name,
  address,
  email,
  email_verified: false,
  application_status: "requirements_pending" // ✅ DEFAULT
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

    // 2️⃣ Check SCHOLARS table FIRST (higher priority)
    const { data: scholar } = await supabase
      .from('scholars')
      .select('id, status')
      .eq('id', userId)
      .maybeSingle();

    if (scholar) {
      return res.json({
        message: '✅ Login successful',
        role: 'scholar',
        redirect: 'scholar-home.html',
        user: authData.user,
        session: authData.session
      });
    }

    // 3️⃣ Check APPLICANTS table (only if not a scholar)
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

    // 4️⃣ Not found in any table
    return res.status(404).json({ error: 'User role not found' });

  } catch (err) {
    console.error('Login server error:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// ------------------ FORGOT PASSWORD (working) dont change this!!!!!!!------------------
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
// ================================
// EXAM ENDPOINTS - COMPLETE & VERIFIED
// ================================

// ---------------- Get exam-ready applicants ----------------
// Returns applicants with approved requirements
app.get('/api/admin/exam-applicants', async (req, res) => {
  try {
    // Get applicants with approved requirements
    const { data, error } = await supabase
      .from('applicants')
      .select('*')
      .eq('application_status', 'requirements_approved')
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching exam applicants:', err);
    res.status(500).json({ error: 'Failed to fetch exam applicants' });
  }
});

// ---------------- Submit exam grade ----------------
// Submits grade and updates status
app.post('/api/admin/grades', async (req, res) => {
  const { applicant_id, exam_grade } = req.body;

  if (!applicant_id || exam_grade === undefined) {
    return res.status(400).json({ 
      success: false,
      error: 'applicant_id and exam_grade required' 
    });
  }

  const grade = parseFloat(exam_grade);
  if (isNaN(grade) || grade < 0 || grade > 100) {
    return res.status(400).json({ 
      success: false,
      error: 'Grade must be between 0 and 100' 
    });
  }

  try {
    // Determine if passed (>=85% passes)
    const examPassed = grade >= 85;
    
    // Update with new application_status field
    const { error: updateError } = await supabase
      .from('applicants')
      .update({ 
        exam_score: grade,
        exam_passed: examPassed,
        application_status: examPassed ? 'mswd_pending' : 'exam_failed',
        exam_graded_at: new Date().toISOString()
      })
      .eq('id', applicant_id);

    if (updateError) {
      console.error('Applicant update error:', updateError);
      throw updateError;
    }

    res.json({
      success: true,
      message: `Grade ${grade}% submitted. ${examPassed ? 'PASSED' : 'FAILED'}`,
      exam_passed: examPassed,
      exam_score: grade
    });

  } catch (err) {
    console.error('Error submitting grade:', err);
    res.status(500).json({ 
      success: false,
      error: 'Failed to submit grade' 
    });
  }
});

// ---------------- Get all grades ----------------
// Returns all graded applicants
app.get('/api/admin/grades', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('applicants')
      .select('id, first_name, last_name, email, exam_score, exam_passed, exam_graded_at')
      .not('exam_score', 'is', null)
      .order('exam_graded_at', { ascending: false });

    if (error) throw error;
    
    const grades = (data || []).map(a => ({
      applicant_id: a.id,
      full_name: `${a.first_name} ${a.last_name}`,
      email: a.email,
      grade: a.exam_score,
      score: a.exam_score,
      passed: a.exam_passed,
      status: a.exam_passed ? 'passed' : 'failed',
      graded_at: a.exam_graded_at
    }));
    
    res.json(grades);
  } catch (err) {
    console.error('Error fetching grades:', err);
    res.status(500).json({ error: 'Failed to fetch grades' });
  }
});

// ---------------- Dashboard stats for exam admin ----------------
app.get('/api/admin/exam-stats', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('applicants')
      .select('exam_score, exam_passed, application_status')
      .eq('application_status', 'requirements_approved');

    if (error) throw error;

    const total = data.length;
    const graded = data.filter(a => a.exam_score !== null).length;
    const passed = data.filter(a => a.exam_passed === true).length;
    const failed = data.filter(a => a.exam_passed === false).length;
    const pending = total - graded;

    const gradedPercent = total > 0 ? Math.round((graded / total) * 100) : 0;
    const passRate = graded > 0 ? Math.round((passed / graded) * 100) : 0;

    res.json({
      total,
      graded,
      passed,
      failed,
      pending,
      gradedPercent,
      passRate
    });

  } catch (err) {
    console.error('Error fetching exam stats:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ================================
// DATABASE FOR EXAM 
// ================================
/*
applicants table should have:
- id (uuid, primary key)
- first_name (text)
- middle_name (text, nullable)
- last_name (text)
- email (text)
- application_status (text) - values: 'requirements_pending', 'requirements_review', 'requirements_approved', 'exam_pending', 'mswd_pending', 'scholar'
- exam_score (numeric, nullable)
- exam_passed (boolean, nullable)
- exam_graded_at (timestamp, nullable)
- submitted_at (timestamp, nullable)
- created_at (timestamp)
*/
// ---------------- Upload a requirement ----------------

export async function getApplicantIdFromToken(req) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;

    const token = authHeader.split(" ")[1];
    if (!token) return null;

    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    return user.id; // this is the applicant's Supabase auth ID
  } catch (err) {
    console.error("Token verification error:", err);
    return null;
  }
}

// ================================
// Upload requirement
// ================================
const upload = multer({ storage: multer.memoryStorage() });

// =====================
// Upload requirement
// =====================
app.post("/api/requirements/upload", upload.single("file"), async (req, res) => {
  try {
    // 1️⃣ Get the applicant ID from token
    const applicant_id = await getApplicantIdFromToken(req);
    if (!applicant_id) 
      return res.status(401).json({ success: false, error: "Unauthorized" });

    // 2️⃣ Validate input
    const { requirement_type } = req.body;
    const file = req.file;
    if (!requirement_type || !file) 
      return res.status(400).json({ success: false, error: "Missing fields" });

    // 3️⃣ Build file path in bucket
    const bucketName = "applicantsreq";
    const fileName = `${applicant_id}/${Date.now()}-${file.originalname}`;

    // 4️⃣ Upload to storage
    const { data: storageData, error: storageError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, file.buffer, { contentType: file.mimetype });

    if (storageError) 
      return res.status(500).json({ success: false, error: storageError.message });

    // 5️⃣ Get public URL
    const { data: publicUrlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    const fileUrl = publicUrlData.publicUrl;

    // 6️⃣ Insert into DB
    const { data: dbData, error: dbError } = await supabase
      .from("applicant_requirements")
      .insert([{
        applicant_id,
        requirement_type,
        file_name: file.originalname,
        file_path: fileName,
        file_url: fileUrl
      }]);

    if (dbError) 
      return res.status(500).json({ success: false, error: dbError.message });

    // 7️⃣ Return success with file URL
    res.json({ success: true, file_url: fileUrl, dbData });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ================================
// Get uploaded requirements
// ================================
app.get("/api/requirements", async (req, res) => {
  try {
    const applicant_id = await getApplicantIdFromToken(req);
    if (!applicant_id) 
      return res.status(401).json({ success: false, error: "Unauthorized" });

    // Get files
    const { data: files, error: filesError } = await supabase
      .from("applicant_requirements")
      .select("*")
      .eq("applicant_id", applicant_id);

    if (filesError) 
      return res.status(500).json({ success: false, error: filesError.message });

    // Get application status
    const { data: applicant, error: applicantError } = await supabase
      .from("applicants")
      .select("application_status")
      .eq("id", applicant_id)
      .single();

    if (applicantError) 
      return res.status(500).json({ success: false, error: applicantError.message });

    res.json({ 
      success: true, 
      files: files || [],
      application_status: applicant?.application_status || "requirements_pending"
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ================================
// Submit all requirements
// ================================
app.post("/api/requirements/submit", async (req, res) => {
  try {
    const applicant_id = await getApplicantIdFromToken(req);

    if (!applicant_id) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized"
      });
    }

    // Check if all 4 requirements are uploaded
    const { data: files, error: filesError } = await supabase
      .from("applicant_requirements")
      .select("requirement_type")
      .eq("applicant_id", applicant_id);

    if (filesError) {
      return res.status(500).json({
        success: false,
        error: filesError.message
      });
    }

    const requiredTypes = [
      "Barangay Clearance",
      "Certificate of Indigency",
      "Report Card",
      "Birth Certificate"
    ];

    const uploadedTypes = files.map(f => f.requirement_type);
    const missingTypes = requiredTypes.filter(type => !uploadedTypes.includes(type));

    if (missingTypes.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing requirements: ${missingTypes.join(", ")}`
      });
    }

    // ✅ Update status to requirements_review
    const { error: updateError } = await supabase
      .from("applicants")
      .update({
        application_status: "requirements_review",
        submitted_at: new Date().toISOString()
      })
      .eq("id", applicant_id);

    if (updateError) throw updateError;

    res.json({
      success: true,
      application_status: "requirements_review",
      message: "Requirements submitted successfully"
    });

  } catch (err) {
    console.error("Submit requirements error:", err.message);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});


// ================================
// Get application status
// ================================
app.get("/api/application/status", async (req, res) => {
  try {
    const applicant_id = await getApplicantIdFromToken(req);

    if (!applicant_id) {
      return res.status(401).json({ 
        success: false, 
        error: "Unauthorized" 
      });
    }

    const { data, error } = await supabase
      .from("applicants")
      .select("application_status")
      .eq("id", applicant_id)
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Applicant not found"
      });
    }

    res.json({
      success: true,
      application_status: data.application_status || "requirements_pending"
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});


// ================================
// Get applicant profile
// ================================
app.get("/api/applicant/profile", async (req, res) => {
  try {
    const applicant_id = await getApplicantIdFromToken(req);

    if (!applicant_id) {
      return res.status(401).json({ 
        success: false, 
        error: "Unauthorized" 
      });
    }

    // Fetch from applicants table
    const { data, error } = await supabase
      .from("applicants")
      .select("first_name, last_name, email, application_status")
      .eq("id", applicant_id)
      .single();

    if (error) {
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    if (!data) {
      return res.status(404).json({ 
        success: false, 
        error: "Profile not found" 
      });
    }

    res.json({
      success: true,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      application_status: data.application_status
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


// ================================
// Delete a requirement
// ================================
app.delete("/api/requirements/:type", async (req, res) => {
  try {
    const applicant_id = await getApplicantIdFromToken(req);
    if (!applicant_id) 
      return res.status(401).json({ success: false, error: "Unauthorized" });

    const type = req.params.type;

    // 1️⃣ Get the DB row for this file
    const { data: fileRow, error: selectError } = await supabase
      .from("applicant_requirements")
      .select("*")
      .eq("applicant_id", applicant_id)
      .eq("requirement_type", type)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .single();

    if (selectError || !fileRow) 
      return res.status(404).json({ success: false, error: "File not found" });

    const filePath = fileRow.file_path;

    // 2️⃣ Delete from Supabase Storage
    const { error: storageError } = await supabase.storage
      .from("applicantsreq")
      .remove([filePath]);

    if (storageError) 
      return res.status(500).json({ success: false, error: storageError.message });

    // 3️⃣ Delete DB entry
    const { error: deleteError } = await supabase
      .from("applicant_requirements")
      .delete()
      .eq("id", fileRow.id);

    if (deleteError) 
      return res.status(500).json({ success: false, error: deleteError.message });

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ================================
// Get full application data
// ================================
app.get("/api/application", async (req, res) => {
  try {
    const applicant_id = await getApplicantIdFromToken(req);
    if (!applicant_id) 
      return res.status(401).json({ success: false, error: "Unauthorized" });

    const { data: applicant, error: applicantError } = await supabase
      .from("applicants")
      .select("*")
      .eq("id", applicant_id)
      .single();

    if (applicantError || !applicant) 
      return res.status(404).json({ success: false, message: "Applicant not found" });

    const { data: files } = await supabase
      .from("applicant_requirements")
      .select("*")
      .eq("applicant_id", applicant_id);

  let progress = 0;
switch (applicant.application_status) {
  case "requirements_pending":
    progress = 0;
    break;

  case "requirements_review":
    progress = 20;
    break;

  case "requirements_approved":
    progress = 40;
    break;

  case "requirements_failed":
    progress = 20;
    break;

  case "exam_pending":
    progress = 60;
    break;

  case "exam_failed":
    progress = 60;
    break;

  case "mswd_pending":
    progress = 80;
    break;

  case "mswd_failed":
    progress = 80;
    break;

  case "scholar":
    progress = 100;
    break;

  default:
    progress = 0;
}


    res.json({ 
      success: true, 
      first_name: applicant.first_name,
      last_name: applicant.last_name,
      progress, 
      application_status: applicant.application_status,
      files: files || []
    });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ================================
// Admin: Approve requirements
// ================================
app.post("/api/admin/approve-requirements", async (req, res) => {
  try {
    const { applicant_id } = req.body;

    if (!applicant_id) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing applicant_id" 
      });
    }

    const { error } = await supabase
      .from("applicants")
      .update({
        application_status: "requirements_approved"
      })
      .eq("id", applicant_id);

    if (error) throw error;

    res.json({ 
      success: true,
      message: "Requirements approved successfully"
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});
//reject requirements
app.post('/api/admin/mark-not-eligible', async (req, res) => {
  const { applicant_id } = req.body;

  if (!applicant_id) {
    return res.status(400).json({ success: false, error: 'Applicant ID is required' });
  }

  try {
    const { data, error } = await supabase
      .from('applicants')
        .update({ application_status: 'requirements_failed' })
      .eq('id', applicant_id)
      .select(); // returns updated row

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: 'Applicant not found' });
    }

    return res.json({
      success: true,
      message: 'Applicant marked as not eligible',
      applicant: data[0]
    });

  } catch (err) {
    console.error('Error updating applicant status:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ================================
// ADMIN: Get all applicants with file counts
// ================================
app.get("/api/admin/applicants", async (req, res) => {
  try {
    // Get all applicants
    const { data: applicants, error: applicantsError } = await supabase
      .from("applicants")
      .select("*")
      .order("created_at", { ascending: false });

    if (applicantsError) {
      return res.status(500).json({ 
        success: false, 
        error: applicantsError.message 
      });
    }

    // For each applicant, get their file count
    const applicantsWithFiles = await Promise.all(
      applicants.map(async (applicant) => {
        const { data: files, error: filesError } = await supabase
          .from("applicant_requirements")
          .select("id")
          .eq("applicant_id", applicant.id);

        return {
          ...applicant,
          files_count: files ? files.length : 0
        };
      })
    );

    res.json({ 
      success: true, 
      applicants: applicantsWithFiles 
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


// ================================
// ADMIN: Get applicant's files
// ================================
app.get("/api/admin/applicants/:id/files", async (req, res) => {
  try {
    const applicantId = req.params.id;

    // Get all files for this applicant
    const { data: files, error: filesError } = await supabase
      .from("applicant_requirements")
      .select("*")
      .eq("applicant_id", applicantId)
      .order("uploaded_at", { ascending: false });

    if (filesError) {
      return res.status(500).json({ 
        success: false, 
        error: filesError.message 
      });
    }

    res.json({ 
      success: true, 
      files: files || [] 
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


// ================================
// ADMIN: Dashboard Stats
// ================================
app.get("/api/admin/dashboard-stats", async (req, res) => {
  try {
    // Get all applicants
    const { data: applicants, error } = await supabase
      .from("applicants")
      .select("application_status");

    if (error) {
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    // Count by status
  const stats = {
  total: applicants.length,
  requirements_pending: 0,
  requirements_review: 0,
  requirements_approved: 0,
  exam_pending: 0,
  mswd_pending: 0,
  scholar: 0
};


    applicants.forEach(app => {
      const status = app.application_status || 'requirements_pending';
      if (stats.hasOwnProperty(status)) {
        stats[status]++;
      }
    });

    res.json({ 
      success: true, 
      ...stats 
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


// ================================
// ADMIN: Approve Requirements
// ================================
app.post("/api/admin/approve-requirements", async (req, res) => {
  try {
    const { applicant_id } = req.body;

    if (!applicant_id) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing applicant_id" 
      });
    }

    // Update applicant status to requirements_approved
    const { error } = await supabase
      .from("applicants")
      .update({
        application_status: "requirements_approved",
        requirements_approved_at: new Date().toISOString()
      })
      .eq("id", applicant_id);

    if (error) {
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    res.json({ 
      success: true,
      message: "Requirements approved successfully"
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


// ================================
// ADMIN: Reject Requirements (Optional)
// ================================
app.post("/api/admin/reject-requirements", async (req, res) => {
  try {
    const { applicant_id, reason } = req.body;

    if (!applicant_id) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing applicant_id" 
      });
    }

    // Update applicant status back to requirements_pending
    const { error } = await supabase
      .from("applicants")
      .update({
        application_status: "requirements_pending",
        rejection_reason: reason || null,
        rejected_at: new Date().toISOString()
      })
      .eq("id", applicant_id);

    if (error) {
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    res.json({ 
      success: true,
      message: "Requirements rejected"
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


// ================================
// ADMIN: Update Application Status
// ================================
app.post("/api/admin/update-status", async (req, res) => {
  try {
    const { applicant_id, status } = req.body;

    if (!applicant_id || !status) {
      return res.status(400).json({ 
        success: false, 
        error: "Missing applicant_id or status" 
      });
    }

   const validStatuses = [
  'requirements_pending',
  'requirements_review',
  'requirements_approved',
  'requirements_failed',
  'exam_pending',
  'exam_failed',
  'mswd_pending',
  'mswd_failed',
  'scholar'
];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid status" 
      });
    }

    const { error } = await supabase
      .from("applicants")
      .update({
        application_status: status,
        status_updated_at: new Date().toISOString()
      })
      .eq("id", applicant_id);

    if (error) {
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    res.json({ 
      success: true,
      message: `Status updated to ${status}`
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


// ================================
// ADMIN: Get Single Applicant Details
// ================================
app.get("/api/admin/applicants/:id", async (req, res) => {
  try {
    const applicantId = req.params.id;

    // Get applicant details
    const { data: applicant, error: applicantError } = await supabase
      .from("applicants")
      .select("*")
      .eq("id", applicantId)
      .single();

    if (applicantError || !applicant) {
      return res.status(404).json({ 
        success: false, 
        error: "Applicant not found" 
      });
    }

    // Get their files
    const { data: files, error: filesError } = await supabase
      .from("applicant_requirements")
      .select("*")
      .eq("applicant_id", applicantId)
      .order("uploaded_at", { ascending: false });

    res.json({ 
      success: true, 
      applicant: {
        ...applicant,
        files: files || []
      }
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// ================================
// ADMIN DELETE aacount of applicant and covert to scholar
// ================================
// ==================== DELETE APPLICANT ====================
app.delete('/api/admin/delete-applicant', async (req, res) => {
  try {
    const { applicant_id } = req.body;

    if (!applicant_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing applicant_id' 
      });
    }

    // 1️⃣ Check if applicant is already a scholar
    const { data: scholar } = await supabase
      .from('scholars')
      .select('id')
      .eq('applicant_id', applicant_id)
      .maybeSingle();

    if (scholar) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete applicant - already converted to scholar. Delete from scholars table first if needed.' 
      });
    }

    // 2️⃣ Delete uploaded files from applicant_files table
    const { error: filesError } = await supabase
      .from('applicant_files')
      .delete()
      .eq('applicant_id', applicant_id);

    if (filesError) {
      console.error("Files delete error:", filesError);
      // Don't fail if no files existed
    }

    // 3️⃣ Delete from applicants table
    const { error: applicantError } = await supabase
      .from('applicants')
      .delete()
      .eq('id', applicant_id);

    if (applicantError) {
      console.error("Applicant delete error:", applicantError);
      return res.status(500).json({ 
        success: false, 
        error: `Failed to delete applicant: ${applicantError.message}` 
      });
    }

    res.json({ 
      success: true,
      message: 'Applicant record deleted successfully'
    });

  } catch (err) {
    console.error('Error deleting applicant:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});
// ==================== CONVERT TO SCHOLAR ACCOUNT ====================
app.post('/api/admin/convert-scholar', async (req, res) => {
  try {
    const { applicant_id } = req.body;

    if (!applicant_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing applicant_id' 
      });
    }

    // Get approved applicant with status 'scholar'
    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('*')
      .eq('id', applicant_id)
      .eq('application_status', 'scholar')
      .single();

    if (applicantError || !applicant) {
      return res.status(404).json({ 
        success: false, 
        error: 'Applicant not found or not approved as scholar yet' 
      });
    }

    // Check if already a scholar
    const { data: existingScholar } = await supabase
      .from('scholars')
      .select('id')
      .eq('id', applicant.id)
      .maybeSingle();

    if (existingScholar) {
      return res.status(400).json({ 
        success: false, 
        error: 'This applicant already has a scholar account' 
      });
    }

    // 1️⃣ Generate new password
    const newPassword = generateRandomPassword();

    // 2️⃣ Update password in Supabase Auth
    const { error: updatePasswordError } = await supabase.auth.admin.updateUserById(
      applicant_id,
      { password: newPassword }
    );

    if (updatePasswordError) {
      console.error("Password update error:", updatePasswordError);
      return res.status(500).json({ 
        success: false, 
        error: `Failed to update password: ${updatePasswordError.message}` 
      });
    }

    // 3️⃣ Insert into scholars table
    const { error: scholarInsertError } = await supabase
      .from('scholars')
      .insert({
        id: applicant.id,
        first_name: applicant.first_name,
        middle_name: applicant.middle_name,
        last_name: applicant.last_name,
        address: applicant.address,
        email: applicant.email,
        degree: applicant.degree || null,
        applicant_id: applicant_id,
        status: 'active'
      });

    if (scholarInsertError) {
      console.error("Scholar insert error:", scholarInsertError);
      return res.status(400).json({ 
        success: false, 
        error: `Failed to create scholar profile: ${scholarInsertError.message}` 
      });
    }

    // 4️⃣ Update applicant record
    const { error: updateError } = await supabase
      .from('applicants')
      .update({
        scholar_created_at: new Date().toISOString()
      })
      .eq('id', applicant_id);

    if (updateError) {
      console.error("Applicant update error:", updateError);
    }

    // 5️⃣ Get scholar_id
    const { data: scholarData } = await supabase
      .from('scholars')
      .select('scholar_id')
      .eq('id', applicant.id)
      .single();

    const scholarId = scholarData?.scholar_id || 'N/A';

    // 6️⃣ Send email
    try {
      await transporter.sendMail({
        from: `"Iskolar ng Realeno" <${process.env.EMAIL_USER}>`,
        to: applicant.email,
        subject: '🎓 Your Scholar Account is Ready - Updated Password',
        html: `
          <h2>Welcome ${applicant.first_name}!</h2>
          
          <p>Your <strong>Scholar Account</strong> has been successfully created!</p>
          
          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">Your Scholar Information</h3>
            <p><strong>Scholar ID:</strong> ${scholarId}</p>
            <p><strong>Email:</strong> ${applicant.email}</p>
          </div>

          <div style="background: #fee2e2; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc2626;">
            <h3 style="margin-top: 0; color: #dc2626;">🔐 Updated Login Credentials</h3>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${applicant.email}</p>
            <p style="margin: 5px 0;"><strong>New Password:</strong> <code style="background: #fff; padding: 6px 12px; border-radius: 4px; font-size: 16px; font-family: monospace;">${newPassword}</code></p>
            <p style="margin: 15px 0 0 0; font-size: 13px; color: #991b1b;">⚠️ Your password has been changed. Please log in with this new password.</p>
          </div>

          <p><strong>Next Steps:</strong></p>
          <ol>
            <li>Log in to the Scholar Portal using the new password above</li>
            <li>Change your password in account settings</li>
            <li>Complete your scholar profile</li>
            <li>Review scholarship guidelines</li>
          </ol>

          <p style="margin-top: 30px;">Congratulations on becoming an Iskolar ng Realeno!</p>
          
          <p><strong>Iskolar ng Realeno Team</strong></p>
        `
      });
      console.log('✅ Email sent successfully to:', applicant.email);
    } catch (emailErr) {
      console.error('❌ Email sending failed:', emailErr);
    }

    res.json({ 
      success: true,
      message: 'Scholar account created successfully',
      scholar_id: scholarId
    });

  } catch (err) {
    console.error('Error creating scholar:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// Helper function to generate random password (add this if you don't have it)
function generateRandomPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// ================================
// MSWD ENDPOINTS
// ================================

// ---------------- Get MSWD Applicants ----------------
// ================================
// MSWD ENDPOINTS
// ================================

// ---------------- Get MSWD Applicants ----------------
// Returns applicants who passed exam (exam_passed = true)
app.get('/api/admin/mswd-applicants', async (req, res) => {
  try {
    // Get all applicants who passed the exam
    const { data: applicants, error: applicantsError } = await supabase
      .from('applicants')
      .select('*')
      .eq('exam_passed', true)
      .order('exam_graded_at', { ascending: false });

    if (applicantsError) {
      return res.status(500).json({ 
        success: false, 
        error: applicantsError.message 
      });
    }

    // For each applicant, get their file count
    const applicantsWithFiles = await Promise.all(
      applicants.map(async (applicant) => {
        const { data: files, error: filesError } = await supabase
          .from('applicant_requirements')
          .select('id')
          .eq('applicant_id', applicant.id);

        return {
          ...applicant,
          files_count: files ? files.length : 0
        };
      })
    );

    res.json({ 
      success: true, 
      applicants: applicantsWithFiles 
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


// ---------------- MSWD Dashboard Stats ----------------
app.get('/api/admin/mswd-stats', async (req, res) => {
  try {
    // Get all applicants who passed the exam
    const { data: applicants, error } = await supabase
      .from('applicants')
      .select('application_status')
      .eq('exam_passed', true);

    if (error) {
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    // Count by status
    const stats = {
      total: applicants.length,
      exam_pending: 0,
      mswd_pending: 0,
      scholar: 0,
      rejected: 0
    };

    applicants.forEach(app => {
      const status = app.application_status || 'exam_pending';
      if (status === 'exam_pending') stats.exam_pending++;
      else if (status === 'mswd_pending') stats.mswd_pending++;
      else if (status === 'scholar') stats.scholar++;
      else if (status === 'rejected') stats.rejected++;
    });

    res.json({ 
      success: true, 
      ...stats 
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


// ---------------- Get Applicant Files ----------------
app.get('/api/admin/applicants/:applicant_id/files', async (req, res) => {
  try {
    const { applicant_id } = req.params;

    const { data: files, error } = await supabase
      .from('applicant_requirements')
      .select('*')
      .eq('applicant_id', applicant_id)
      .order('uploaded_at', { ascending: false });

    if (error) {
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }

    res.json({ 
      success: true, 
      files: files || [] 
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


// ---------------- MSWD Approve (Make Scholar) ----------------
// ================================
// MSWD APPROVE - COPY TO SCHOLAR TABLE
// ================================
app.post('/api/admin/mswd-approve', async (req, res) => {
  try {
    const { applicant_id, scholarship_reason } = req.body;

    if (!applicant_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing applicant_id' 
      });
    }

    if (!scholarship_reason) {
      return res.status(400).json({ 
        success: false, 
        error: 'Scholarship reason is required' 
      });
    }

    // Get applicant details
    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('*')
      .eq('id', applicant_id)
      .eq('exam_passed', true)
      .single();

    if (applicantError || !applicant) {
      return res.status(404).json({ 
        success: false, 
        error: 'Applicant not found or did not pass exam' 
      });
    }

    // ✅ ONLY UPDATE APPLICANT STATUS (no scholar creation)
    const { error: updateError } = await supabase
      .from('applicants')
      .update({
  application_status: 'scholar',
  scholarship_reason: scholarship_reason,
  mswd_approved_at: new Date().toISOString()
})
.eq('id', applicant_id);

    if (updateError) {
      console.error("Applicant update error:", updateError);
      return res.status(500).json({ 
        success: false, 
        error: updateError.message 
      });
    }

    // 📧 SEND APPROVAL EMAIL (NOT scholar creation email)
    try {
      await transporter.sendMail({
        from: `"Iskolar ng Realeno" <${process.env.EMAIL_USER}>`,
        to: applicant.email,
        subject: '🎉 MSWD Evaluation Approved - Iskolar ng Realeno',
        html: `
          <h2>Congratulations ${applicant.first_name}!</h2>
          
          <p>We are pleased to inform you that your MSWD evaluation has been <strong>approved</strong> for the Iskolar ng Realeno program.</p>

          <h3>You have successfully completed:</h3>
          <ul>
            <li>✅ Requirements Review - Approved</li>
            <li>✅ Examination - Passed (Score: ${applicant.exam_score}%)</li>
            <li>✅ MSWD Evaluation - Approved</li>
          </ul>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0;">⏳ What's Next?</h3>
            <p>Your application is currently being processed for final scholar account creation.</p>
            <p>You will receive another email with your <strong>Scholar ID and Portal access</strong> once your account is activated.</p>
          </div>

          <div style="background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0;"><strong>⚠️ Please Note:</strong></p>
            <p style="margin: 5px 0 0 0;">Do not create a new account. You will use your existing login credentials once your scholar account is activated.</p>
          </div>

          <p style="margin-top: 30px;">Thank you for your patience!</p>
          
          <p><strong>Iskolar ng Realeno Team</strong></p>
        `
      });
    } catch (emailErr) {
      console.error('Email sending failed:', emailErr);
      // Don't fail the request if email fails
    }

    res.json({ 
      success: true,
      message: 'Applicant MSWD approved successfully (pending scholar creation)',
      applicant_status: 'approved'
    });

  } catch (err) {
    console.error('Error in MSWD approval:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});
// ================================
// HELPER: Generate Temporary Password
// ================================

// ---------------- MSWD Reject ----------------
app.post('/api/admin/mswd-reject', async (req, res) => {
  try {
    const { applicant_id } = req.body;

    if (!applicant_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing applicant_id' 
      });
    }

    // Update applicant status to MSWD failed
    const { error: updateError } = await supabase
      .from('applicants')
      .update({
        application_status: 'mswd_failed'
      })
      .eq('id', applicant_id);

    if (updateError) {
      return res.status(500).json({ 
        success: false, 
        error: updateError.message 
      });
    }

    // Get applicant details for email
    const { data: applicant, error: applicantError } = await supabase
      .from('applicants')
      .select('first_name, email')
      .eq('id', applicant_id)
      .single();

    if (applicantError) {
      console.error('Failed to fetch applicant:', applicantError);
    }

    // Optional: Send email notification
    if (applicant) {
      try {
        await transporter.sendMail({
          from: `"Iskolar ng Realeno" <${process.env.EMAIL_USER}>`,
          to: applicant.email,
          subject: 'Scholarship Application Update',
          html: `
            <h2>Dear ${applicant.first_name},</h2>
            <p>Thank you for your interest in the Iskolar ng Realeno scholarship program.</p>
            <p>After careful evaluation, we regret to inform you that you did not pass the final MSWD evaluation stage.</p>
            <p>We encourage you to apply again in future cycles.</p>
            <p><strong>Iskolar ng Realeno Team</strong></p>
          `
        });
      } catch (emailErr) {
        console.error('Email sending failed:', emailErr);
      }
    }

    res.json({ 
      success: true,
      message: 'Applicant marked as MSWD failed'
    });

  } catch (err) {
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});



// ================================
// IMPORTANT: Update the exam grading endpoint
// ================================
// This ensures applicants automatically go to MSWD after passing exam



//------------------------------------------------------------------------//
//                       ALL ENDPOINT WORKING ABOVE 
//------------------------------------------------------------------------//

//profile upload---------------------------------------

// ================================
// Upload Profile Files (Multiple)
// ================================
// ================================
// Upload Scholar Profile Files (Multiple) (ALREADY WORKING)
// ================================

// Helper function to get scholar ID from token
async function getScholarIdFromToken(req) {
  try {
    const authHeader = req.headers['authorization']; // "Bearer <token>"
    if (!authHeader) return null;

    const token = authHeader.split(' ')[1];
    if (!token) return null;

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return null;

    return user.id; // this is your scholar_id
  } catch (err) {
    console.error('getScholarIdFromToken error:', err);
    return null;
  }
}
/* ===============================
   GET SCHOLAR PROFILE
================================ */
app.get("/api/scholar/profile", async (req, res) => {
  try {
    const scholar_id = await getScholarIdFromToken(req);
    if (!scholar_id)
      return res.status(401).json({ success: false, error: "Unauthorized" });

    // Scholar info
    const { data: scholar, error } = await supabase
      .from("scholars")
      .select("first_name, last_name, degree_program, current_semester, profile_pic")
      .eq("id", scholar_id)
      .single();

    if (error)
      return res.status(500).json({ success: false, error: error.message });

    // Uploaded files
    const { data: files, error: fileError } = await supabase
      .from("scholar_profile_files")
      .select("*")
      .eq("scholar_id", scholar_id)
      .order("uploaded_at", { ascending: false });

    if (fileError)
      return res.status(500).json({ success: false, error: fileError.message });

    // Group by semester
    const grouped = {};
    for (const f of files) {
      if (!grouped[f.semester]) grouped[f.semester] = [];
      grouped[f.semester].push(f);
    }

    res.json({
      success: true,
      scholar: {
        name: `${scholar.first_name} ${scholar.last_name}`,
        degree: scholar.degree_program,
        current_semester: scholar.current_semester,
        profile_pic: scholar.profile_pic
      },
      files: grouped
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ===============================
   UPLOAD PROFILE PIC + FILES
================================ */
app.post(
  "/api/scholar/profile/upload",
  upload.fields([
    { name: "profile_pic", maxCount: 1 },
    { name: "files", maxCount: 20 }
  ]),
  async (req, res) => {
    try {
      const scholar_id = await getScholarIdFromToken(req);
      if (!scholar_id)
        return res.status(401).json({ success: false, error: "Unauthorized" });

      const semester = req.body.semester;
      const profilePic = req.files?.profile_pic?.[0];
      const files = req.files?.files || [];

      /* ================= PROFILE PIC ================= */
      if (profilePic) {
        if (!profilePic.mimetype.startsWith("image/"))
          return res.status(400).json({ success: false, error: "Invalid image type" });

        const ext = profilePic.originalname.split(".").pop();
        const picPath = `scholars/${scholar_id}.${ext}`;

        // 1️⃣ Get current profile pic URL from DB
        // 1️⃣ Get old profile pic
const { data: currentData } = await supabase
  .from("scholars")
  .select("profile_pic")
  .eq("id", scholar_id)
  .single();

const oldPicUrl = currentData?.profile_pic;

// 2️⃣ Upload new picture
const { error: picError } = await supabase.storage
  .from("profile-pics")
  .upload(picPath, profilePic.buffer, {
    upsert: true,
    contentType: profilePic.mimetype
  });

if (picError) {
  return res.status(500).json({ success: false, error: picError.message });
}

// 3️⃣ Get public URL
const { data: picData } = supabase.storage
  .from("profile-pics")
  .getPublicUrl(picPath);

const profilePicUrl = picData.publicUrl;

// 4️⃣ Update DB AFTER successful upload
await supabase
  .from("scholars")
  .update({ profile_pic: profilePicUrl })
  .eq("id", scholar_id);


        // 4️⃣ Delete old picture from storage if it exists and is different
        if (oldPicUrl && oldPicUrl !== profilePicUrl) {
          const oldPath = oldPicUrl.split("/storage/v1/object/public/profile-pics/")[1];
          if (oldPath) {
            await supabase.storage.from("profile-pics").remove([oldPath]);
          }
        }
      }

      /* ========= PDF FILES ========= */
      const uploaded = [];

      if (files.length > 0) {
        if (!semester)
          return res.status(400).json({ success: false, error: "Semester required" });

        for (const file of files) {
          const filePath = `${scholar_id}/${semester}/${Date.now()}-${file.originalname}`;

          await supabase.storage
            .from("profiles")
            .upload(filePath, file.buffer, {
              contentType: file.mimetype
            });

          const { data } = supabase.storage
            .from("profiles")
            .getPublicUrl(filePath);

          const { data: row } = await supabase
            .from("scholar_profile_files")
            .insert([{
              scholar_id,
              semester,
              file_name: file.originalname,
              file_path: filePath,
              file_url: data.publicUrl,
              file_size: file.size
            }])
            .select();

          uploaded.push(row[0]);
        }

        await supabase
          .from("scholars")
          .update({ current_semester: semester })
          .eq("id", scholar_id);
      }

      res.json({
        success: true,
        message: "Upload successful",
        files: uploaded
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* ===============================
   DELETE FILE
================================ */
app.delete("/api/scholar/profile/file/:id", async (req, res) => {
  try {
    const scholar_id = await getScholarIdFromToken(req);
    if (!scholar_id)
      return res.status(401).json({ success: false, error: "Unauthorized" });

    const { id } = req.params;

    const { data: file, error } = await supabase
      .from("scholar_profile_files")
      .select("*")
      .eq("id", id)
      .eq("scholar_id", scholar_id)
      .single();

    if (!file)
      return res.status(404).json({ success: false, error: "File not found" });

    await supabase.storage
      .from("profiles")
      .remove([file.file_path]);

    await supabase
      .from("scholar_profile_files")
      .delete()
      .eq("id", id);

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
//---------------------------------FETCH ALL SCHOLARS DATA------------------------------
app.get('/api/admin/scholars', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scholars')
      .select('id, first_name, middle_name, last_name, email, degree, status'); // ✅ ADD status

    if (error) throw error;

    const scholars = data.map(s => ({
      scholar_id: s.id,
      full_name: `${s.first_name} ${s.middle_name || ''} ${s.last_name}`.trim(),
      email: s.email,
      degree: s.degree,
      status: s.status // ✅ PASS TO FRONTEND
    }));

    res.status(200).json(scholars);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/admin/scholars/:id', async (req, res) => {
  const { id } = req.params;
  const { first_name, middle_name, last_name, email, degree, status, address } = req.body;

  try {
    const { data, error } = await supabase
      .from('scholars')
      .update({
        first_name,
        middle_name,
        last_name,
        email,
        degree,
        status,
        address
      })
      .eq('id', id)       // <-- use 'id', NOT 'scholar_id'
      .select()           // return the updated row
      .maybeSingle();     // safe for no rows

    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Scholar not found' });

    res.json({ message: 'Scholar updated successfully', data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// backend: Node.js / Express
// Get a single scholar by ID
app.get('/api/admin/scholars/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('scholars')
      .select('*')
      .eq('id', id)
      .maybeSingle(); // returns null if not found

    if (error) return res.status(400).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Scholar not found' });

    res.json(data); // return raw data for the frontend form
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// List files for a scholar
app.get('/api/admin/scholars/:id/files', async (req, res) => {
  const { id } = req.params;

  try {
    // List files in the 'profiles' bucket under folder with scholar id
    const { data, error } = await supabase
      .storage
      .from('profiles')
      .list(id, { limit: 100, offset: 0 }); // folder = scholar id

    if (error) return res.status(400).json({ error: error.message });

    res.json(data); // each object has { name, id, updated_at, size, etc. }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
// Delete a file for a scholar
app.delete('/api/admin/scholars/:id/files/:fileName', async (req, res) => {
  const { id, fileName } = req.params;

  try {
    const { data, error } = await supabase
      .storage
      .from('profiles')
      .remove([`${id}/${fileName}`]); // path = folder/file

    if (error) return res.status(400).json({ error: error.message });

    res.json({ message: 'File deleted successfully', data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// ---------------- ALL ABOVE WORKING----------------
//------------------------------------------------------------------------//
// Get all graduates
// GET all graduates
app.get('/api/admin/graduates', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scholars')
      .select('id, first_name, middle_name, last_name, email, degree, status');

    if (error) return res.status(400).json({ error: error.message });

    console.log('All scholars fetched:', data); // 🔹 see all rows

    const graduates = data
      .filter(s => s.status === 'graduated')
      .map(s => ({
        scholar_id: s.id,
        full_name: `${s.first_name} ${s.middle_name || ''} ${s.last_name}`.trim(),
        email: s.email,
        degree: s.degree
      }));

    console.log('Graduates:', graduates); // 🔹 check filtered array

    res.json(graduates);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});


// Delete graduate (backend)
// Initialize Supabase Admin (must use Service Role Key)

// Delete graduate (backend)
app.delete('/api/admin/graduates/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // 1️⃣ Get scholar's email from DB
    const { data: scholar, error: scholarErr } = await supabase
      .from('scholars')
      .select('email')
      .eq('id', id)
      .maybeSingle();

    if (scholarErr || !scholar) return res.status(404).json({ error: 'Graduate not found' });

    const email = scholar.email;

    // 2️⃣ Find Auth user by email
    let authUserId = null;
    let page = 1;
    let pageSize = 100;
    let found = false;

    while (!found) {
      const { data: usersData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage: pageSize
      });

      if (listErr) break;

      const user = usersData.users.find(u => u.email === email);
      if (user) {
        authUserId = user.id;
        found = true;
      }

      if (usersData.users.length < pageSize) break; // last page
      page++;
    }

    // 3️⃣ Delete Auth user if found
    if (authUserId) {
      const { error: deleteAuthErr } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
      if (deleteAuthErr) console.warn('Failed to delete auth user:', deleteAuthErr.message);
    }

    // 4️⃣ Delete from scholars table
    const { error: delError } = await supabase
      .from('scholars')
      .delete()
      .eq('id', id);

    if (delError) return res.status(400).json({ error: delError.message });

    res.json({ message: 'Graduate deleted successfully from DB and Auth!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

//------------------------------------------------------------------------//
// ============== ANNOUNCEMENTS ENDPOINTS ==============
// GET - Fetch all announcements
// ================= ANNOUNCEMENTS =================
// GET all announcements
// ----------------- ANNOUNCEMENTS -----------------

// GET all announcements
// GET all announcements
app.get('/api/announcements', async (req, res) => {
  try {
    const { data, error } = await supabase
  .from('announcements')
  .select('*')
  .order('created_at', { ascending: false });

const formattedData = data.map(a => ({
  ...a,
  created_at_ph: dayjs(a.created_at).tz('Asia/Manila').format('MMMM D, YYYY hh:mm A')
}));


    res.json(formattedData); // send formatted data
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// POST create announcement
// POST - Create announcement & send notifications
// Node.js / Express
// POST - Create announcement & send notifications
app.post('/api/admin/announcement', async (req, res) => {
  try {
    const { 
      title, 
      content, 
      recipients,       // e.g., 'all' or 'specific'
      recipient_type,   // optional, can use instead of recipients
      scholar_ids,      // array of specific scholar IDs
      scholar_emails, 
      icon, 
      created_by 
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    // Insert announcement
  const { data: announcement, error: annErr } = await supabase
  .from('announcements')
  .insert({
    title,
    content,
    recipient_type,
    created_by,
    scholar_emails: scholar_emails || null
  })
  .select()
  .single();

    if (annErr) throw annErr;

    let notifications = [];

    if (recipient_type === 'all') {
      // Fetch all scholar IDs
      const { data: allScholars, error: scholarErr } = await supabase
        .from('scholars')
        .select('id');

      if (scholarErr) throw scholarErr;

      notifications = allScholars.map(sch => ({
        announcement_id: announcement.id,
        scholar_id: sch.id,
        title,
        message: content,
        icon: icon || '📢'
      }));
    } else if (scholar_ids && scholar_ids.length > 0) {
      notifications = scholar_ids.map(scholar_id => ({
        announcement_id: announcement.id,
        scholar_id,
        title,
        message: content,
        icon: icon || '📢'
      }));
    }

    // Insert notifications if any
    if (notifications.length > 0) {
      const { error: notifErr } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notifErr) throw notifErr;
    }

    res.json({ message: 'Announcement posted and notifications sent!', announcement });

  } catch (err) {
    console.error('Error creating announcement:', err);
    res.status(500).json({ error: err.message });
  }
});


// DELETE announcement
// DELETE announcement (and related notifications)
app.delete('/api/admin/announcement/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1️⃣ Delete related notifications first
    const { error: notifError } = await supabase
      .from('notifications')
      .delete()
      .eq('announcement_id', id);

    if (notifError) throw notifError;

    // 2️⃣ Delete the announcement itself
    const { error: annError } = await supabase
      .from('announcements')
      .delete()
      .eq('id', id);

    if (annError) throw annError;

    res.json({ message: 'Announcement and related notifications deleted successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete announcement and notifications' });
  }
});


// ================= NOTIFICATIONS =================


// GET /api/scholar/notifications
// Fetch all notifications for the logged-in scholar
app.get('/api/scholar/notifications', async (req, res) => {
  try {
    const scholar_id = await getScholarIdFromToken(req);
    if (!scholar_id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('scholar_id', scholar_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    res.json({ success: true, notifications: data || [] });
  } catch (err) {
    console.error('Error fetching notifications:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/scholar/notifications/mark-read
// Mark all unread notifications as read for the logged-in scholar
app.patch('/api/scholar/notifications/mark-read', async (req, res) => {
  try {
    const scholar_id = await getScholarIdFromToken(req);
    if (!scholar_id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('scholar_id', scholar_id)
      .eq('is_read', false);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/scholar/notifications/:id/read
// Mark a single notification as read
app.patch('/api/scholar/notifications/:id/read', async (req, res) => {
  try {
    const scholar_id = await getScholarIdFromToken(req);
    if (!scholar_id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;

    const { data: notif, error: fetchError } = await supabase
      .from('notifications')
      .select('scholar_id')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    if (notif.scholar_id !== scholar_id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/notifications/create (ADMIN ONLY)
// Create a new notification - typically called by admin
app.post('/api/notifications/create', async (req, res) => {
  try {
    const { scholar_id, title, message, icon } = req.body;

    if (!scholar_id || !title || !message) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert([{
        scholar_id,
        title,
        message,
        icon: icon || '📢',
        is_read: false
      }])
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, notification: data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// DELETE /api/scholar/notifications/:id (Optional)
// Delete a notification
app.delete('/api/scholar/notifications/:id', async (req, res) => {
  try {
    const scholar_id = await getScholarIdFromToken(req);
    if (!scholar_id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const { id } = req.params;

    // Verify ownership
    const { data: notif, error: fetchError } = await supabase
      .from('notifications')
      .select('scholar_id')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;
    
    if (notif.scholar_id !== scholar_id) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    // Delete
    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.json({ 
      success: true, 
      message: 'Notification deleted' 
    });
  } catch (err) {
    console.error('Error deleting notification:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});
//-------ADMIN CREATE------------------
/**
 * CREATE ADMIN / STAFF ACCOUNT
 */// ---------------- CREATE STAFF ----------------
app.post('/api/staff/create', async (req, res) => {
  let { first_name, last_name, email, role } = req.body;

  // ✅ Validate input
  if (!first_name || !last_name || !email || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // ✅ Normalize role (admin === main_admin)
  if (role === 'admin') {
    role = 'main_admin';
  }

  const VALID_ROLES = ['main_admin', 'examiner', 'mswd'];

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const tempPassword = generateTempPassword();

  try {
    // 1️⃣ CREATE AUTH USER
    const { data: authData, error: authError } =
      await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true
      });

    if (authError) {
      console.error('AUTH ERROR:', authError);
      return res.status(400).json({ error: authError.message });
    }

    const authId = authData.user.id;

    // 2️⃣ INSERT INTO ADMINS TABLE
    const { error: insertError } = await supabase
      .from('admins')
      .insert({
        auth_id: authId,
        email,
        role,
        status: role === 'main_admin' ? 'approved' : 'pending'
      });

    if (insertError) {
      console.error('DB ERROR:', insertError);

      // rollback auth user
      await supabase.auth.admin.deleteUser(authId);

      return res.status(400).json({ error: insertError.message });
    }

    // 3️⃣ SEND EMAIL
    await transporter.sendMail({
      from: `"Iskolarealeno" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Admin Account Created',
      text: `Hello ${first_name},

Your ${role.replace('_', ' ')} account has been created.

Email: ${email}
Temporary Password: ${tempPassword}

Please log in and change your password immediately.

Regards,
Iskolarealeno Team`
    });

    // 4️⃣ SUCCESS
    res.json({
      success: true,
      message: 'Admin account created successfully'
    });

  } catch (err) {
    console.error('SERVER ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
//-------------------ADMIN LOGIN-----------------------
app.post('/api/admin/login', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const { data: admin, error } = await supabase
      .from('admins')
      .select('id, email, role')
      .eq('email', email)
      .single();

    if (error || !admin) {
      return res.status(403).json({
        error: 'Access denied. Not an admin account.'
      });
    }

    // ✅ SUCCESS — no approval checks
    res.json({
      success: true,
      role: admin.role,
      user: {
        id: admin.id,
        email: admin.email
      }
    });

  } catch (err) {
    console.error('ADMIN LOGIN ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


//--------------------ADMIN FORGOT/RESET PASSWORD-----------------
// ------------------ ADMIN FORGOT PASSWORD ------------------
app.post('/api/admin/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  try {
    // 1️⃣ Find admin
    const { data: admin, error: findError } = await supabase
      .from('admins')
      .select('id, email')
      .ilike('email', email.trim())
      .single();

    if (findError || !admin) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    // 2️⃣ Generate reset token
    const token = Math.random().toString(36).substring(2, 15);

    // 3️⃣ Save token
    const { error: updateError } = await supabase
      .from('admins')
      .update({ reset_token: token })
      .eq('id', admin.id);

    if (updateError) {
      return res.status(500).json({ error: updateError.message });
    }

    // 4️⃣ Send email
    const resetLink = `${process.env.FRONTEND_URL}/admin_reset-password.html?token=${token}`;

    await transporter.sendMail({
      from: `"Iskolarealeno Admin" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Reset your admin password',
      html: `
        <p>Hello Admin,</p>
        <p>Click the link below to reset your password:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>If you did not request this, ignore this email.</p>
      `
    });

    res.json({ message: '✅ Check your email for the reset link!' });

  } catch (err) {
    console.error('ADMIN FORGOT PASSWORD ERROR:', err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});
// ------------------ ADMIN RESET PASSWORD ------------------
app.post('/api/admin/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Missing token or new password' });
  }

  try {
    // 1️⃣ Find admin by token
    const { data: admin, error } = await supabase
      .from('admins')
      .select('id, auth_id')
      .eq('reset_token', token)
      .single();

    if (error || !admin) {
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    // 2️⃣ Update password in Supabase Auth
    const { error: updateError } =
      await supabase.auth.admin.updateUserById(admin.auth_id, {
        password: newPassword
      });

    if (updateError) throw updateError;

    // 3️⃣ Clear reset token
    await supabase
      .from('admins')
      .update({ reset_token: null })
      .eq('id', admin.id);

    res.json({
      success: true,
      message: 'Password updated successfully'
    });

  } catch (err) {
    console.error('ADMIN RESET PASSWORD ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------- SERVER ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));