// Load current profile info when page loads
document.addEventListener('DOMContentLoaded', loadProfile);

async function loadProfile() {
  try {
    const token = localStorage.getItem('access_token'); // optional if using token
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};

    const res = await fetch('http://localhost:5000/api/me', { headers });
    if (!res.ok) throw new Error('Failed to fetch profile');

    const profile = await res.json();

    // Fill the input fields
    document.getElementById('degree').value = profile.degree || '';
    if(document.getElementById('semester')) {
      document.getElementById('semester').value = profile.semester || '';
    }

  } catch (err) {
    console.error(err);
    alert('Could not load profile. Please login first.');
  }
}

// Update profile when button is clicked
async function updateProfile() {
  const degree = document.getElementById('degree').value;
  const semester = document.getElementById('semester') ? document.getElementById('semester').value : '';

  const scholar = JSON.parse(localStorage.getItem('scholar') || '{}');
  if (!scholar.scholar_id) {
    alert('Not logged in.');
    return;
  }

  try {
    const formData = new FormData();
    formData.append('scholar_id', scholar.scholar_id);
    if(degree) formData.append('degree', degree);
    if(semester) formData.append('semester', semester);

    const res = await fetch('http://localhost:5000/api/profile/update', {
      method: 'POST',
      body: formData
    });

    const text = await res.text();
    alert(text);

  } catch (err) {
    console.error(err);
    alert('Profile update failed. Try again.');
  }
}
