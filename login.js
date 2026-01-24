function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value.trim();
  const error = document.getElementById("error");

  error.innerText = "";

  if (!email || !password) {
    error.innerText = "Preencha todos os campos.";
    return;
  }

  if (email === "admin@obramax.com" && password === "123456") {
    window.location.href = "dashboard.html";
  } else {
    error.innerText = "Email ou senha inválidos.";
  }
}
