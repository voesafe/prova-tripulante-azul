// ─────────────────────────────────────────────────────────────────────────────
// API wrapper — Google Apps Script backend
// ─────────────────────────────────────────────────────────────────────────────

const API = (() => {

  const URL = 'https://script.google.com/macros/s/AKfycby3Q6sjM2qxbMbu5j3-cBcLM4B1KAgNwK2PzZe6ccIp2YVGpwxuDCFTKaYRPylglvv-/exec';

  async function call(data) {
    const res = await fetch(URL, {
      method: 'POST',
      // text/plain evita CORS preflight
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // ── Públicas ────────────────────────────────────────────────────────────────

  function loginStudent(email, cpf) {
    return call({ action: 'loginStudent', email, cpf });
  }

  function loginAdmin(username, password) {
    return call({ action: 'loginAdmin', username, password });
  }

  function getPublicConfig() {
    return call({ action: 'getPublicConfig' });
  }

  // ── Aluno ───────────────────────────────────────────────────────────────────

  function getStudentData(studentId, cpf) {
    return call({ action: 'getStudentData', studentId, cpf });
  }

  function saveAttempt(studentId, cpf, attempt) {
    return call({ action: 'saveAttempt', studentId, cpf, attempt });
  }

  // ── Admin ───────────────────────────────────────────────────────────────────

  function adminLoad(adminPassword) {
    return call({ action: 'adminLoad', adminPassword });
  }

  function adminSave(adminPassword, data) {
    return call({ action: 'adminSave', adminPassword, data });
  }

  return { URL, call, loginStudent, loginAdmin, getPublicConfig, getStudentData, saveAttempt, adminLoad, adminSave };
})();
