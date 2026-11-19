const token = localStorage.getItem('token');
const value = id => document.getElementById(id).value.trim();

document.getElementById('setup-btn').addEventListener('click', async () => {
  if (!token) { window.location.href = 'login.html'; return; }
  const display_name = value('display-name');
  if (!display_name) { alert('Display name is required.'); return; }
  try {
    const response = await fetch(`${window.APP_CONFIG.API_BASE}/user/profile`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ display_name }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Setup failed');

    const preferenceRoot = document.getElementById('setup-preferences');
    await window.APP_PREFERENCES.save(preferenceRoot);

    window.location.href = './home.html';
  } catch (error) { alert(error.message); }
});
