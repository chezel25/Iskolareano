// homepage2.js
document.addEventListener('DOMContentLoaded', () => {
  loadAnnouncements();
  loadGraduates();
  loadProfile(); // load profile on page load
});

// Toggle profile panel
function toggleProfile() {
  const panel = document.getElementById('profile-panel');
  panel.classList.toggle('active');
  if (panel.classList.contains('active')) loadProfile();
}

// Fetch announcements
async function loadAnnouncements() {
  try {
    const res = await fetch('http://localhost:5000/api/announcements');
    const data = await res.json();
    const el = document.getElementById('announcements');
    if (!data || data.length === 0) return el.innerHTML = "<p>No announcements yet.</p>";
    let html = "<ul>";
    data.forEach(a => html += `<li><b>${a.title}</b> (${a.date})<br>${a.content}</li><hr>`);
    html += "</ul>";
    el.innerHTML = html;
  } catch(err) { console.error(err); }
}

// Fetch graduates
async function loadGraduates() {
  try {
    const res = await fetch('http://localhost:5000/api/graduates');
    const data = await res.json();
    const el = document.getElementById('graduates');
    if (!data || data.length === 0) return el.innerHTML = "<p>No graduates yet.</p>";
    let html = "";
    data.forEach(g => {
      html += `<div class="graduate-card">
        <img src="http://localhost:5000/uploads/${g.photo}" class="grad-photo"><br>
        <b>${g.name}</b><br><small>${g.degree} (${g.year})</small><br><i>"${g.message}"</i>
      </div>`;
    });
    el.innerHTML = html;
  } catch(err) { console.error(err); }
}

// Load scholar profile
console.log("TOKEN FROM LOCALSTORAGE:", localStorage.getItem('access_token'));
console.log("PROFILE STATUS:", res.status);
async function loadProfile() {
  const token = localStorage.getItem('access_token');
  if (!token) return;

  const res = await fetch('/api/me', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!res.ok) {
    console.error('PROFILE FAILED', res.status);
    return;
  }

  const data = await res.json();

  document.getElementById('scholar-name').textContent = data.full_name || '';
  document.getElementById('scholar-degree').textContent = data.degree || '';
}



// Update profile
async function updateProfile() {
  const token = localStorage.getItem('access_token');
  if (!token) return alert('Not logged in');

  const degree = document.getElementById('degree').value;
  const semester = document.getElementById('semester').value;

  const res = await fetch('http://localhost:5000/api/profile/update', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ degree, semester })
  });

  const result = await res.json();
  document.getElementById('profile-msg').textContent = result.message;
  loadProfile();
}