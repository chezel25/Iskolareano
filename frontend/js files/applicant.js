console.log("✅ admin.js loaded");

// REQUIRED so HTML onclick works
window.loadApplicants = async function () {
  console.log("📄 Loading applicants...");

  const res = await fetch('http://localhost:5000/api/admin/applicants');
  const data = await res.json();

  // Update stats
  document.getElementById('total').innerText = data.stats.total;
  document.getElementById('pending').innerText = data.stats.pending;
  document.getElementById('approved').innerText = data.stats.approved;
  document.getElementById('rejected').innerText = data.stats.rejected;

  let html = `
    <h2>Applicants</h2>
    <table>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
  `;

  data.applicants.forEach(a => {
    html += `
      <tr>
        <td>${a.first_name} ${a.last_name}</td>
        <td>${a.email}</td>
        <td>${a.status}</td>
        <td>
          <button class="approve" onclick="approveApplicant('${a.id}')">Approve</button>
          <button class="reject" onclick="rejectApplicant('${a.id}')">Reject</button>
        </td>
      </tr>
    `;
  });

  html += `</table>`;
  document.getElementById('content').innerHTML = html;
};

window.approveApplicant = async function (id) {
  await fetch(`http://localhost:5000/api/admin/applicant/${id}/approve`, {
    method: 'POST'
  });
  loadApplicants();
};

window.rejectApplicant = async function (id) {
  await fetch(`http://localhost:5000/api/admin/applicant/${id}/reject`, {
    method: 'POST'
  });
  loadApplicants();
};

window.loadScholars = async function () {
  const res = await fetch('http://localhost:5000/api/admin/scholars');
  const data = await res.json();

  let html = `<h2>Scholars</h2><table>
    <tr><th>ID</th><th>Name</th><th>Email</th></tr>`;

  data.forEach(s => {
    html += `
      <tr>
        <td>${s.scholar_id}</td>
        <td>${s.full_name}</td>
        <td>${s.email}</td>
      </tr>`;
  });

  html += `</table>`;
  document.getElementById('content').innerHTML = html;
};
