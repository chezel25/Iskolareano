# ISKOLAREALENO - Simple Scholarship Web App

## What is included
- backend/server.js (Node.js + Express + SQLite)
- frontend/*.html (simple static frontend)
- uploads/ folder for uploaded files
- backend/database.db (empty SQLite DB file)
- package.json

## Default admin
- Email: admin@example.com
- Password: admin123

## How to run (locally)
1. Install Node.js (v16+ recommended).
2. Open terminal in project root and run:
   npm install
3. Start the server:
   npm start
4. Open frontend files in your browser:
   - `frontend/index.html` (main landing)
   - `frontend/admin-login.html` (admin dashboard)
   - `frontend/login.html` and `frontend/register.html` (scholar/applicant pages)
Note: The frontend is static files; to use upload/view features open the HTML files in your browser (CORS is allowed) and ensure backend is running at http://localhost:5000

