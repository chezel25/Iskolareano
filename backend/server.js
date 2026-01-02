require('dotenv').config();

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
// Paths
app.use(express.static(path.join(__dirname, '..', 'frontend')));
// Uploads
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.get(['/', '/index.html', '/home'], (req, res) => {
  res.sendFile(
    path.join(__dirname, '..', 'frontend/static', 'BLUE ORANGE.html')
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
        access_token: data.session.access_token,
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
      access_token: session.access_token,
      role: profile.role
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

// View Applicants
app.get('/api/admin/view-applicants', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, degree')
      .eq('role', 'applicant')
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// View Scholar
app.get('/api/admin/view-scholars', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, scholar_id, degree')
      .eq('role', 'scholar');

    if (error) throw error;

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Token login
app.get('/api/me', async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  const token = authHeader.replace('Bearer ', '');

  const { data: authData, error: authError } =
    await supabasePublic.auth.getUser(token);

  if (authError || !authData?.user) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const { data: profile, error: profileError } =
    await supabaseAdmin
      .from('profiles')
      .select('full_name, degree')
      .eq('id', authData.user.id)
      .single();

  if (profileError) {
    return res.status(500).json({ error: profileError.message });
  }

  res.json(profile);
});

// Updates Profile
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