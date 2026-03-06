const API_BASE = "/api";

function showMessage(text, type) {
  const el = document.getElementById("message");
  el.textContent = text;
  el.className = `message ${type}`;
}

function hideMessage() {
  document.getElementById("message").className = "message hidden";
}

async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });

    const data = await res.json();

    if (res.ok) {
      showMessage(`${data.username} logged in!`, "success");
      loadProfile();
    } else {
      showMessage(data.error, "error");
    }
  } catch (e) {
    showMessage("Server connection failed", "error");
  }
}

async function loadProfile() {
  try {
    const res = await fetch(`${API_BASE}/profile`, {
      credentials: "include",
    });

    if (res.ok) {
      const data = await res.json();
      document.getElementById("profile-name").textContent = data.name;
      document.getElementById("profile-email").textContent = data.email;
      document.getElementById("profile-role").textContent = data.role;
      document.getElementById("profile-balance").textContent = data.balance;
      document.getElementById("login-section").classList.add("hidden");
      document.getElementById("profile-section").classList.remove("hidden");
    }
  } catch (e) {
    showMessage("Failed to load profile", "error");
  }
}

async function logout() {
  await fetch(`${API_BASE}/logout`, {
    method: "POST",
    credentials: "include",
  });

  document.getElementById("login-section").classList.remove("hidden");
  document.getElementById("profile-section").classList.add("hidden");
  hideMessage();
}

document.addEventListener("DOMContentLoaded", () => {
  loadProfile();
});
