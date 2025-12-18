require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const path = require('path');
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

// -------------------- FRONTEND ROUTES --------------------
app.get(['/', '/index.html', '/home', '/homepage.html'], (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend/static', 'BLUE ORANGE.html'));
});

// -------------------- APPLICANT ROUTES --------------------

// Applicant Registration
app.post('/api/register', async (req, res) => {
  const { full_name, email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name, role: 'applicant' } }
    });

    if (error) throw error;
    res.json({ message: 'Registration successful', user_id: data.user.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Applicant Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error('Invalid credentials');

    // fetch user role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .single();

    if (profileError) throw profileError;

    res.json({ message: 'Login successful', role: profile.role });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// -------------------- ADMIN ROUTES --------------------

// Admin Login
app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw new Error('Invalid admin credentials');

    //skip role check
    res.json({ message: 'Login successful', redirect: '/static/admin-dashboard.html' });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// Get all applicants from Supabase
app.get('/api/admin/applicants', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('full_name, email, degree')
      .eq('role', 'applicant')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------- START SERVER --------------------
app.listen(5000, () => {
  console.log('🚀 Server running at http://localhost:5000');
});
