import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import multer from 'multer';
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
// ---------------- APPROVE REQUIREMENTS (TASK 2) JIA CHECKING----------------
// Sets requirements_approved = true so they appear in exam admin
app.post('/api/admin/applicants/:id/approve-requirements', async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('applicants')
      .update({ requirements_approved: true })
      .eq('id', id);

    if (error) throw error;

    res.json({ success: true, message: 'Requirements approved. Applicant can now take the exam.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to approve requirements' });
  }
});


// All scholars
app.get('/api/admin/scholars', async (req, res) => {
  try {
    const { data, error } = await supabase.from('scholars').select('*');
    if (error) return res.status(500).json({ error: error.message });

    // Return empty array if no data, otherwise map the data
    const scholars = (data || []).map(s => ({
      scholar_id: s.scholar_id || s.id,
      full_name: `${s.first_name || ''} ${s.middle_name || ''} ${s.last_name || ''}`.trim(),
      email: s.email,
      degree: s.degree,
      status: s.status
    }));
    
    res.json(scholars);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
// ---------------- EXAM GRADES (TASK 2) JIA (CHECKING)----------------

// Get applicants ready for exam (requirements_approved = true)
app.get('/api/admin/exam-applicants', async (req, res) => {
  try {
    // Get applicants with approved requirements who can take exam
    const { data, error } = await supabase
      .from('applicants')
      .select('*')
      .eq('requirements_approved', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Filter out those who already have exam scores (unless you want to allow re-grading)
    const examReady = (data || []).filter(a => 
      a.exam_score === null || a.exam_score === undefined
    );
    
    res.json(data || []); // Return all approved applicants, frontend will handle display
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch exam applicants' });
  }
});

// Submit exam grade for an applicant
app.post('/api/admin/grades', async (req, res) => {
  const { applicant_id, exam_grade } = req.body;

  if (!applicant_id || exam_grade === undefined) {
    return res.status(400).json({ error: 'applicant_id and exam_grade required' });
  }

  const grade = parseFloat(exam_grade);
  if (isNaN(grade) || grade < 0 || grade > 100) {
    return res.status(400).json({ error: 'Grade must be between 0 and 100' });
  }

  try {
    // Determine if passed based on grade (>=85% passes)
    const examPassed = grade >= 85;
    const newStatus = examPassed ? 'passed' : 'failed';

    // Update applicant with exam_score and exam_passed in applicants table
    const { error: updateError } = await supabase
      .from('applicants')
      .update({ 
        exam_score: grade,
        exam_passed: examPassed,
        status: newStatus
      })
      .eq('id', applicant_id);

    if (updateError) {
      console.error('Applicant update error:', updateError);
      throw updateError;
    }

    res.json({
      success: true,
      message: `Grade ${grade}% submitted. Status: ${newStatus}`,
      exam_status: newStatus,
      exam_passed: examPassed
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit grade' });
  }
});

// Get grades for display - returns applicants with their exam scores
app.get('/api/admin/grades', async (req, res) => {
  try {
    // Get all applicants who have exam scores
    const { data, error } = await supabase
      .from('applicants')
      .select('id, first_name, last_name, email, exam_score, exam_passed')
      .not('exam_score', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw error;
    
    // Transform to match expected format
    const grades = (data || []).map(a => ({
      applicant_id: a.id,
      grade: a.exam_score,
      score: a.exam_score,
      status: a.exam_passed ? 'passed' : 'failed',
      result: a.exam_passed ? 'passed' : 'failed'
    }));
    
    res.json(grades);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch grades' });
  }
});

// Get applicant progress/status
app.get('/api/applicant/:id/progress', async (req, res) => {
  const { id } = req.params;

  try {
    // Get applicant data (all columns including exam_score, exam_passed)
    const { data: applicant, error: appError } = await supabase
      .from('applicants')
      .select('*')
      .eq('id', id)
      .single();

    if (appError) throw appError;
    if (!applicant) return res.status(404).json({ error: 'Applicant not found' });

    // Use exam_score and exam_passed from applicants table directly
    const examGrade = applicant.exam_score;
    const examPassed = applicant.exam_passed;

    // Calculate progress percentage based on actual columns
    let progress = 0;
    let currentStep = 'requirements';

    // Step 1: Requirements
    if (applicant.requirements_approved) {
      progress = 25;
      currentStep = 'exam';
    }
    
    // Step 2: Exam
    if (examGrade !== null && examPassed === true) {
      progress = 50;
      currentStep = 'mswd';
    }
    
    // Step 3: Scholar status
    if (applicant.status === 'scholar') {
      progress = 100;
      currentStep = 'complete';
    }
    
    // Failed state
    if (applicant.status === 'failed' || examPassed === false) {
      currentStep = 'failed';
    }

    res.json({
      applicant: applicant,
      progress,
      currentStep,
      steps: {
        requirements: applicant.requirements_approved ? 'approved' : 'pending',
        exam: examPassed === true ? 'passed' : (examPassed === false ? 'failed' : 'pending'),
        exam_grade: examGrade,
        mswd: applicant.status === 'passed' || applicant.status === 'scholar' ? 'approved' : 'pending',
        scholar: applicant.status === 'scholar' ? 'approved' : 'pending'
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

/**
 * Create application (call after signup)
 */
// Multer setup for file uploads


// ---------------- Upload a requirement ----------------


// ================================
// Helper to get applicant_id from JWT
// ================================
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

// Upload
const { data: storageData, error: storageError } = await supabase.storage
  .from(bucketName)
  .upload(fileName, file.buffer, { contentType: file.mimetype });

if (storageError) return res.status(500).json({ success: false, error: storageError.message });

// ✅ Correct public URL
const { data: publicUrlData } = supabase.storage
  .from(bucketName)
  .getPublicUrl(fileName);  // ONLY the path: applicant_id/timestamp-name.png

const fileUrl = publicUrlData.publicUrl;
    // 6️⃣ Insert into DB
    const { data: dbData, error: dbError } = await supabase
      .from("applicant_requirements")
      .insert([{
        applicant_id,
        requirement_type,
        file_name: file.originalname,  // original filename
        file_path: fileName,           // path in bucket
        file_url: fileUrl               // public URL
      }]);
    if (dbError) return res.status(500).json({ success: false, error: dbError.message });

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
    if (!applicant_id) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { data, error } = await supabase
      .from("applicant_requirements")
      .select("*")
      .eq("applicant_id", applicant_id);

    if (error) return res.status(500).json({ success: false, error: error.message });

    res.json({ success: true, files: data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ================================
// Delete a requirement
// ================================

app.delete("/api/requirements/:type", async (req, res) => {
  try {
    const applicant_id = await getApplicantIdFromToken(req);
    if (!applicant_id) return res.status(401).json({ success: false, error: "Unauthorized" });

    const type = req.params.type;

    // 1️⃣ Get the DB row for this file
    const { data: fileRow, error: selectError } = await supabase
      .from("applicant_requirements")
      .select("*")
      .eq("applicant_id", applicant_id)
      .eq("requirement_type", type)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .single(); // pick the most recent if duplicates exist

    if (selectError || !fileRow) return res.status(404).json({ success: false, error: "File not found in DB" });

    const filePath = fileRow.file_path;

    // 2️⃣ Delete from Supabase Storage
    const { error: storageError } = await supabase.storage
      .from("applicantsreq")
      .remove([filePath]);

    if (storageError) return res.status(500).json({ success: false, error: storageError.message });

    // 3️⃣ Delete DB entry
    const { error: deleteError } = await supabase
      .from("applicant_requirements")
      .delete()
      .eq("id", fileRow.id);

    if (deleteError) return res.status(500).json({ success: false, error: deleteError.message });

    res.json({ success: true });

  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ================================
// Get applicant progress
// ================================
app.get("/api/application", async (req, res) => {
  try {
    const applicant_id = await getApplicantIdFromToken(req);
    if (!applicant_id) return res.status(401).json({ success: false, error: "Unauthorized" });

    const { data: applicant, error: applicantError } = await supabase
      .from("applicants")
      .select("*")
      .eq("id", applicant_id)
      .single();

    if (applicantError || !applicant) return res.status(404).json({ success: false, message: "Applicant not found" });

    const { data: files } = await supabase
      .from("applicant_requirements")
      .select("*")
      .eq("applicant_id", applicant_id);

    let progress = 0;
    switch (applicant.status) {
      case "requirements_review": progress = 25; break;
      case "exam_pending": progress = 50; break;
      case "mswd_pending": progress = 75; break;
      case "scholar": progress = 100; break;
    }

    res.json({ success: true, first_name: applicant.first_name, progress, status: applicant.status, files });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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