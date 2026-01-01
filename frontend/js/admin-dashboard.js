document.getElementById('viewApplicants').onclick = loadApplicants;
document.getElementById('viewScholars').onclick = loadScholars;
document.getElementById('viewAnnouncements').onclick = showAnnouncements;
document.getElementById('viewGraduates').onclick = showGraduates;
document.getElementById('createScholar').onclick = showCreateScholarForm;

async function loadApplicants() {
  const res = await fetch('/api/admin/view-applicants');
  const data = await res.json();

  let html = `
    <h3>Applicants</h3>
    <table border="1">
      <tr>
        <th>Full Name</th>
        <th>Email</th>
        <th>Degree</th>
      </tr>
  `;

  data.forEach(a => {
    html += `
      <tr>
        <td>${a.full_name}</td>
        <td>${a.email}</td>
        <td>${a.degree || '-'}</td>
      </tr>
    `;
  });

  html += '</table>';
  document.getElementById('content').innerHTML = html;
}

async function loadScholars() {
  const res = await fetch('/api/admin/view-scholars');
  const data = await res.json();

  let html = `
    <h3>Scholars</h3>
    <table border="1">
      <tr>
        <th>Scholar ID</th>
        <th>Full Name</th>
        <th>Email</th>
        <th>Degree</th>
      </tr>
  `;

  data.forEach(s => {
    html += `
      <tr>
        <td>${s.scholar_id || '-'}</td>
        <td>${s.full_name}</td>
        <td>${s.email}</td>
        <td>${s.degree || '-'}</td>
      </tr>
    `;
  });

  html += '</table>';
  document.getElementById('content').innerHTML = html;
}

function showCreateScholarForm() {
  document.getElementById('content').innerHTML = `
    <h3>Create Scholar</h3>
    <input id="new_name" placeholder="Full Name"><br>
    <input id="new_email" placeholder="Email"><br>
    <input id="new_degree" placeholder="Degree"><br>
    <button onclick="createScholar()">Create</button>
  `;
}

async function createScholar() {
  const res = await fetch('/api/admin/create-scholar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: new_name.value,
      email: new_email.value,
      degree: new_degree.value
    })
  });

  const data = await res.json();
  alert(data.message || data.error);
}
