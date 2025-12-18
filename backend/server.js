require('dotenv').config({ path: '../.env' });

const express = require('express');
const cors = require('cors');
const path = require('path');
const nodemailer = require('nodemailer');
const { createClient } = require('@supabase/supabase-js');

// Public client: login/signup
const supabasePublic = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Admin client: create users, bypass RLS
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
app.use(express.json());
app.use(cors());

// Static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Landing page
app.get(['/', '/index.html', '/home'], (req, res) => {
  res.sendFile(
    path.join(__dirname, '..', 'frontend/static', 'BLUE ORANGE.html')
  );
});

// Applicant registration
app.post('/api/register', async (req, res) => {
  const { full_name, email, password } = req.body;

  try {
    const { data, error } = await supabasePublic.auth.signUp({
      email,
      password,
      options: {
        data: { full_name, role: 'applicant' }
      }
    });

    if (error) throw error;

    res.json({
      message: 'Registration successful',
      user_id: data.user.id
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Unified login (applicant + scholar)
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data: authData, error: authError } =
      await supabasePublic.auth.signInWithPassword({
        email,
        password
      });

    if (authError || !authData.user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Fetch role and profile data
    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from('profiles')
        .select('full_name, role, scholar_id, degree')
        .eq('id', authData.user.id)
        .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({
      message: 'Login successful',
      role: profile.role,
      full_name: profile.full_name,
      scholar_id: profile.scholar_id,
      degree: profile.degree
    });

  } catch {
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

// Admin creates scholar account
app.post('/api/admin/create-scholar', async (req, res) => {
  const { name, email, degree } = req.body;
  const defaultPassword = 'ISKOLREAN01';

  try {
    // Create auth user
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: defaultPassword,
        email_confirm: true
      });

    if (authError) throw authError;

    // Create profile
    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from('profiles')
        .insert({
          id: authData.user.id,
          full_name: name,
          email,
          role: 'scholar',
          degree: degree || null
        })
        .select()
        .single();

    if (profileError) throw profileError;

    // Send credentials email
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

Scholar ID: ${profile.scholar_id}
Temporary Password: ${defaultPassword}

Please log in and change your password immediately.`
    });

    res.json({
      message: 'Scholar created successfully',
      scholar_id: profile.scholar_id
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List scholars (admin)
app.get('/api/admin/scholars', async (req, res) => {
  try {
    const { data, error } =
      await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('role', 'scholar')
        .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(5000, () => {
  console.log('Server running at http://localhost:5000');
});
