async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!email || !password) {
    alert("Please enter email and password.");
    return;
  }

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error);
      return;
    }

    // Store auth token
    localStorage.setItem("access_token", data.access_token);
    localStorage.setItem("role", data.role);

    window.location.href = "homepage2.html";

  } catch (err) {
    console.error(err);
    alert("Server error. Try again.");
  }
}
