async function doLogin(e){
  e.preventDefault();
  const username = document.querySelector('#username').value.trim();
  const password = document.querySelector('#password').value.trim();
  try {
    const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) });
    const data = await res.json();
    if(!res.ok){ alert(data.error || 'Login fehlgeschlagen'); return; }
    localStorage.setItem('jwt', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    location.href = '/index.html';
  } catch(err){ alert('Login fehlgeschlagen'); }
}
document.addEventListener('DOMContentLoaded', ()=>{
  document.querySelector('#login-form').addEventListener('submit', doLogin);
});