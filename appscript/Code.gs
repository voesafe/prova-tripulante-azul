// ─────────────────────────────────────────────────────────────────────────────
// Preparatório Azul — SAFE School of Aviation
// Backend via Google Apps Script + Google Sheets
// ─────────────────────────────────────────────────────────────────────────────

const SS_ID = '1iQvLT5xu9Vl9TmB8DYpQme3elOdtwDYtEIedQp1Y_5g';

// ── ENTRY POINTS ─────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const result = route(req);
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

function doGet(e) {
  // Health check / ping
  return jsonResponse({ ok: true, service: 'Preparatorio Azul API' });
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── ROUTER ────────────────────────────────────────────────────────────────────

function route(req) {
  switch (req.action) {

    // Públicas (usadas na tela de login e aluno)
    case 'loginStudent':    return loginStudent(req.email, req.cpf);
    case 'loginAdmin':      return loginAdmin(req.username, req.password);
    case 'getPublicConfig': return getPublicConfig();

    // Aluno autenticado (usa studentId + cpf como auth)
    case 'getStudentData':  return getStudentData(req.studentId, req.cpf);
    case 'saveAttempt':     return saveAttempt(req.studentId, req.cpf, req.attempt);

    // Admin (usa adminPassword como auth)
    case 'adminLoad':       return adminLoad(req.adminPassword);
    case 'adminSave':       return adminSave(req.adminPassword, req.data);

    default: return { ok: false, error: 'Ação desconhecida: ' + req.action };
  }
}

// ── HELPERS DE PLANILHA ───────────────────────────────────────────────────────

function getSheet(name) {
  const ss = SpreadsheetApp.openById(SS_ID);
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// Lê a sheet "KV" como objeto chave → valor
function readKV() {
  const sheet = getSheet('KV');
  const rows = sheet.getDataRange().getValues();
  const obj = {};
  rows.forEach(r => { if (r[0]) obj[String(r[0])] = r[1]; });
  return obj;
}

// Escreve/atualiza uma chave na sheet "KV"
function writeKV(key, value) {
  const sheet = getSheet('KV');
  const rows = sheet.getDataRange().getValues();
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

// ── AUTH ──────────────────────────────────────────────────────────────────────

function getAdminCreds() {
  const kv = readKV();
  return {
    username: kv['adminUsername'] || 'admin',
    password: kv['adminPassword'] || 'safe2024'
  };
}

function checkAdmin(password) {
  return password === getAdminCreds().password;
}

function checkStudent(studentId, cpf) {
  const students = JSON.parse(readKV()['students'] || '[]');
  return students.find(s => s.id === studentId && s.cpf === String(cpf).replace(/\D/g, ''));
}

// ── AÇÕES PÚBLICAS ────────────────────────────────────────────────────────────

function loginStudent(email, cpf) {
  const students = JSON.parse(readKV()['students'] || '[]');
  const cpfClean = String(cpf).replace(/\D/g, '');
  const student = students.find(s =>
    s.email.toLowerCase() === String(email).toLowerCase() && s.cpf === cpfClean
  );
  if (!student) return { ok: false };
  return { ok: true, student: { id: student.id, name: student.name, email: student.email } };
}

function loginAdmin(username, password) {
  const creds = getAdminCreds();
  if (username === creds.username && password === creds.password) return { ok: true };
  return { ok: false };
}

function getPublicConfig() {
  const kv = readKV();
  const examConfigs = JSON.parse(kv['examConfigs'] || 'null') || defaultExamConfigs();
  const settings    = JSON.parse(kv['settings']    || 'null') || defaultSettings();
  return {
    ok: true,
    examConfigs,
    requireFullscreen: settings.requireFullscreen !== false
  };
}

// ── AÇÕES DO ALUNO ────────────────────────────────────────────────────────────

function getStudentData(studentId, cpf) {
  if (!checkStudent(studentId, cpf)) return { ok: false, error: 'Não autorizado' };
  const attempts = JSON.parse(readKV()['attempts'] || '[]');
  const mine = attempts.filter(a => a.studentId === studentId);
  return { ok: true, attempts: mine };
}

function saveAttempt(studentId, cpf, attempt) {
  if (!checkStudent(studentId, cpf)) return { ok: false, error: 'Não autorizado' };
  if (!attempt || attempt.studentId !== studentId) return { ok: false, error: 'Dados inválidos' };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const kv = readKV();
    const attempts = JSON.parse(kv['attempts'] || '[]');
    const idx = attempts.findIndex(a => a.id === attempt.id);
    if (idx >= 0) {
      attempts[idx] = attempt;
    } else {
      attempts.push(attempt);
    }
    writeKV('attempts', JSON.stringify(attempts));
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ── AÇÕES DO ADMIN ────────────────────────────────────────────────────────────

function adminLoad(adminPassword) {
  if (!checkAdmin(adminPassword)) return { ok: false, error: 'Senha incorreta' };
  const kv = readKV();
  return {
    ok: true,
    students:    JSON.parse(kv['students']    || '[]'),
    attempts:    JSON.parse(kv['attempts']    || '[]'),
    presencas:   JSON.parse(kv['presencas']   || '{}'),
    examConfigs: JSON.parse(kv['examConfigs'] || 'null') || defaultExamConfigs(),
    settings:    JSON.parse(kv['settings']    || 'null') || defaultSettings()
  };
}

function adminSave(adminPassword, data) {
  if (!checkAdmin(adminPassword)) return { ok: false, error: 'Senha incorreta' };

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    if (data.students    !== undefined) writeKV('students',    JSON.stringify(data.students));
    if (data.attempts    !== undefined) writeKV('attempts',    JSON.stringify(data.attempts));
    if (data.presencas   !== undefined) writeKV('presencas',   JSON.stringify(data.presencas));
    if (data.examConfigs !== undefined) writeKV('examConfigs', JSON.stringify(data.examConfigs));
    if (data.settings    !== undefined) {
      writeKV('settings', JSON.stringify(data.settings));
      // Mantém credenciais de admin em sync para o loginAdmin funcionar
      if (data.settings.adminUsername) writeKV('adminUsername', data.settings.adminUsername);
      if (data.settings.adminPassword) writeKV('adminPassword', data.settings.adminPassword);
    }
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// ── DEFAULTS ──────────────────────────────────────────────────────────────────

function defaultSettings() {
  return {
    adminUsername: 'admin',
    adminPassword: 'safe2024',
    requireFullscreen: true,
    ciacNome: 'SAFE School of Aviation',
    periodoTreinamento: '',
    dataEmissao: ''
  };
}

function defaultExamConfigs() {
  return [
    { id: 'exam_met',  name: 'Meteorologia Aeronáutica',                         subjectKey: 'meteorologia', enabled: false, timeLimit: 0 },
    { id: 'exam_reg',  name: 'Regulamentos de Tráfego Aéreo',                    subjectKey: 'regulamentos', enabled: false, timeLimit: 0 },
    { id: 'exam_perf', name: 'Performance, Peso, Carregamento e Balanceamento',  subjectKey: 'performance',  enabled: false, timeLimit: 0 }
  ];
}

// ── SETUP (rodar manualmente uma vez) ─────────────────────────────────────────

function setup() {
  getSheet('KV'); // cria a sheet se não existir
  const kv = readKV();
  if (!kv['adminUsername']) writeKV('adminUsername', 'admin');
  if (!kv['adminPassword']) writeKV('adminPassword', 'safe2024');
  if (!kv['students'])      writeKV('students',      '[]');
  if (!kv['attempts'])      writeKV('attempts',      '[]');
  if (!kv['presencas'])     writeKV('presencas',     '{}');
  Logger.log('Setup concluído.');
}
