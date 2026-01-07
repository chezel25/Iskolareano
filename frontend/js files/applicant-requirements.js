const user = JSON.parse(localStorage.getItem("user"));

if (!user) {
  alert("Please login first");
  location.href = "login.html";
}

function goBack() {
  location.href = "applicant.html";
}

async function submitRequirements() {
  const grades = document.getElementById("grades").files[0];
  const indigency = document.getElementById("indigency").files[0];
  const form = document.getElementById("application_form").files[0];

  if (!grades || !indigency || !form) {
    alert("Please upload all required documents.");
    return;
  }

  const formData = new FormData();
  formData.append("email", user.email);
  formData.append("grades", grades);
  formData.append("indigency", indigency);
  formData.append("application_form", form);

  document.getElementById("submitBtn").disabled = true;
  document.getElementById("statusText").innerText = "Uploading...";

  const res = await fetch(
    "http://localhost:5000/api/applicant/upload-requirements",
    {
      method: "POST",
      body: formData
    }
  );

  const data = await res.json();

  if (res.ok) {
    document.getElementById("statusText").innerText =
      "✅ Requirements submitted successfully!";
  } else {
    document.getElementById("statusText").innerText =
      "❌ Upload failed: " + data.error;
    document.getElementById("submitBtn").disabled = false;
  }
}
