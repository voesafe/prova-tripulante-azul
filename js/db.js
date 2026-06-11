// db.js — Camada de dados (localStorage) — Preparatório Azul SAFE

const DB = {
  KEYS: {
    SETTINGS:  'prova_settings',
    STUDENTS:  'prova_students',
    CONFIGS:   'prova_exam_configs',
    ATTEMPTS:  'prova_attempts',
    PRESENCAS: 'prova_presencas',
    INIT:      'prova_initialized'
  },

  init() {
    if (!localStorage.getItem(this.KEYS.INIT)) this._setDefaults();
  },

  _setDefaults() {
    this.set(this.KEYS.SETTINGS, {
      adminUsername: 'admin',
      adminPassword: 'safe2024',
      requireFullscreen: true,
      ciacNome: 'SAFE School of Aviation',
      periodoTreinamento: '',
      dataEmissao: ''
    });
    this.set(this.KEYS.STUDENTS, []);
    this.set(this.KEYS.CONFIGS, [
      { id: 'exam_met',  name: 'Meteorologia Aeronáutica',                           subjectKey: 'meteorologia', enabled: false, timeLimit: 0 },
      { id: 'exam_reg',  name: 'Regulamentos de Tráfego Aéreo',                      subjectKey: 'regulamentos', enabled: false, timeLimit: 0 },
      { id: 'exam_perf', name: 'Performance, Peso, Carregamento e Balanceamento',     subjectKey: 'performance',  enabled: false, timeLimit: 0 }
    ]);
    this.set(this.KEYS.ATTEMPTS, []);
    this.set(this.KEYS.PRESENCAS, {});
    localStorage.setItem(this.KEYS.INIT, 'true');
  },

  resetData() {
    Object.values(this.KEYS).forEach(k => localStorage.removeItem(k));
    this._setDefaults();
  },

  get(key)       { try { return JSON.parse(localStorage.getItem(key)); } catch(e) { return null; } },
  set(key, val)  { localStorage.setItem(key, JSON.stringify(val)); },

  // ── AUTH ──────────────────────────────────────────────────────────────
  checkAuth()    { try { return JSON.parse(sessionStorage.getItem('prova_auth')); } catch(e) { return null; } },
  setAuth(auth)  { sessionStorage.setItem('prova_auth', JSON.stringify(auth)); },
  clearAuth()    { sessionStorage.removeItem('prova_auth'); },

  loginStudent(email, cpf) {
    const cpfClean = cpf.replace(/\D/g, '');
    const student = (this.get(this.KEYS.STUDENTS) || []).find(s =>
      s.email.toLowerCase() === email.toLowerCase() && s.cpf === cpfClean
    );
    if (!student) return null;
    const auth = { type: 'student', id: student.id, name: student.name, email: student.email, cpf: cpfClean };
    this.setAuth(auth);
    return auth;
  },

  loginAdmin(username, password) {
    const s = this.get(this.KEYS.SETTINGS);
    if (s.adminUsername === username && s.adminPassword === password) {
      const auth = { type: 'admin', name: 'Administrador', adminPassword: password };
      this.setAuth(auth);
      return auth;
    }
    return null;
  },

  // ── STUDENTS ──────────────────────────────────────────────────────────
  getStudents()     { return this.get(this.KEYS.STUDENTS) || []; },
  getStudentById(id){ return this.getStudents().find(s => s.id === id) || null; },

  addStudent(name, email, cpf, codigoAnac = '') {
    const students = this.getStudents();
    const cpfClean = cpf.replace(/\D/g, '');
    if (students.find(s => s.email.toLowerCase() === email.toLowerCase()))
      throw new Error('E-mail já cadastrado');
    if (cpfClean.length !== 11)
      throw new Error('CPF inválido (11 dígitos)');
    const student = {
      id: 'std_' + Date.now(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      cpf: cpfClean,
      codigoAnac: codigoAnac.trim(),
      createdAt: new Date().toISOString()
    };
    students.push(student);
    this.set(this.KEYS.STUDENTS, students);
    this._pushAdminFields({ students });
    return student;
  },

  updateStudent(id, fields) {
    const students = this.getStudents();
    const idx = students.findIndex(s => s.id === id);
    if (idx < 0) throw new Error('Aluno não encontrado');
    if (fields.cpf) fields.cpf = fields.cpf.replace(/\D/g, '');
    students[idx] = { ...students[idx], ...fields };
    this.set(this.KEYS.STUDENTS, students);
    this._pushAdminFields({ students });
    return students[idx];
  },

  deleteStudent(id) {
    const students = this.getStudents().filter(s => s.id !== id);
    this.set(this.KEYS.STUDENTS, students);
    this._pushAdminFields({ students });
  },

  // CSV: nome,email,cpf,codigoAnac (anac opcional)
  importStudentsCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const results = { success: 0, errors: [] };
    lines.forEach((line, i) => {
      if (i === 0 && /nome|name/i.test(line)) return;
      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 3) { results.errors.push(`Linha ${i+1}: formato inválido`); return; }
      try {
        this.addStudent(parts[0], parts[1], parts[2], parts[3] || '');
        results.success++;
      } catch(e) {
        results.errors.push(`Linha ${i+1}: ${e.message}`);
      }
    });
    if (results.success > 0) this._pushAdminFields({ students: this.getStudents() });
    return results;
  },

  // ── EXAM CONFIGS ──────────────────────────────────────────────────────
  getExamConfigs()   { return this.get(this.KEYS.CONFIGS) || []; },
  getExamConfig(id)  { return this.getExamConfigs().find(e => e.id === id) || null; },

  updateExamConfig(id, fields) {
    const configs = this.getExamConfigs();
    const idx = configs.findIndex(e => e.id === id);
    if (idx < 0) throw new Error('Prova não encontrada');
    configs[idx] = { ...configs[idx], ...fields };
    this.set(this.KEYS.CONFIGS, configs);
    this._pushAdminFields({ examConfigs: configs });
    return configs[idx];
  },

  // ── QUESTIONS ─────────────────────────────────────────────────────────
  // Returns all 20 questions in shuffled order (same bank, different order per student)
  getShuffledQuestions(subjectKey) {
    const bank = QUESTION_BANKS[subjectKey];
    if (!bank) return [];
    return this._shuffle([...bank.questions]);
  },

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // ── ATTEMPTS ──────────────────────────────────────────────────────────
  getAttempts()               { return this.get(this.KEYS.ATTEMPTS) || []; },
  getStudentAttempts(sid)     { return this.getAttempts().filter(a => a.studentId === sid); },

  // Returns the single attempt for this student+exam, or null
  getAttempt(studentId, subjectKey) {
    return this.getAttempts().find(a => a.studentId === studentId && a.subjectKey === subjectKey) || null;
  },

  // True only if no attempt exists at all (not even in_progress)
  canStartExam(studentId, subjectKey) {
    return !this.getAttempt(studentId, subjectKey);
  },

  createAttempt(studentId, examId, subjectKey, questions) {
    if (!this.canStartExam(studentId, subjectKey))
      throw new Error('Esta prova já foi realizada');
    const attempt = {
      id: 'att_' + Date.now(),
      studentId,
      examId,
      subjectKey,
      questions: questions.map(q => ({ id: q.id, text: q.text, options: q.options, correct: q.correct })),
      answers: {},
      status: 'in_progress',
      startedAt: new Date().toISOString(),
      finishedAt: null,
      score: null,
      correctAnswers: null,
      totalQuestions: questions.length,
      invalidationReason: null
    };
    const all = this.getAttempts();
    all.push(attempt);
    this.set(this.KEYS.ATTEMPTS, all);
    return attempt;
  },

  saveAttemptProgress(attemptId, answers) {
    const all = this.getAttempts();
    const idx = all.findIndex(a => a.id === attemptId);
    if (idx < 0) return;
    all[idx].answers = answers;
    this.set(this.KEYS.ATTEMPTS, all);
  },

  finishAttempt(attemptId, answers) {
    const all = this.getAttempts();
    const idx = all.findIndex(a => a.id === attemptId);
    if (idx < 0) throw new Error('Tentativa não encontrada');
    const att = all[idx];
    att.answers = answers;
    att.status = 'completed';
    att.finishedAt = new Date().toISOString();
    let correct = 0;
    att.questions.forEach(q => { if (answers[q.id] !== undefined && answers[q.id] === q.correct) correct++; });
    att.correctAnswers = correct;
    att.score = parseFloat(((correct / att.totalQuestions) * 10).toFixed(2));
    this.set(this.KEYS.ATTEMPTS, all);
    this._pushAttempt(all[idx]);
    return all[idx];
  },

  invalidateAttempt(attemptId, reason) {
    const all = this.getAttempts();
    const idx = all.findIndex(a => a.id === attemptId);
    if (idx < 0) return;
    all[idx].status = 'invalidated';
    all[idx].finishedAt = new Date().toISOString();
    all[idx].invalidationReason = reason;
    all[idx].score = 0;
    all[idx].correctAnswers = 0;
    this.set(this.KEYS.ATTEMPTS, all);
    this._pushAttempt(all[idx]);
    return all[idx];
  },

  resetStudentAttempt(studentId, subjectKey) {
    const all = this.getAttempts().filter(a => !(a.studentId === studentId && a.subjectKey === subjectKey));
    this.set(this.KEYS.ATTEMPTS, all);
    this._pushAdminFields({ attempts: all });
  },

  // ── PRESENÇAS ─────────────────────────────────────────────────────────
  getAllPresencas()  { return this.get(this.KEYS.PRESENCAS) || {}; },

  getPresencas(studentId) {
    return (this.getAllPresencas())[studentId] || {
      meteorologia: { participacao: null, nota: null },
      regulamentos: { participacao: null, nota: null },
      performance:  { participacao: null, nota: null },
      gsi:          { participacao: null, nota: null }
    };
  },

  setPresencas(studentId, data) {
    const all = this.getAllPresencas();
    all[studentId] = data;
    this.set(this.KEYS.PRESENCAS, all);
    this._pushAdminFields({ presencas: all });
  },

  // ── SETTINGS ──────────────────────────────────────────────────────────
  getSettings()          { return this.get(this.KEYS.SETTINGS) || {}; },
  updateSettings(fields) {
    const updated = { ...this.getSettings(), ...fields };
    this.set(this.KEYS.SETTINGS, updated);
    this._pushAdminFields({ settings: updated });
  },

  // ── REPORT DATA ───────────────────────────────────────────────────────
  // Returns complete report data for a student (used for PDF generation)
  getStudentReport(studentId) {
    const student = this.getStudentById(studentId);
    if (!student) return null;
    const settings = this.getSettings();
    const presencas = this.getPresencas(studentId);
    const attempts = this.getStudentAttempts(studentId);

    const subjects = [
      { key: 'regulamentos', label: 'Regulamentos de Tráfego Aéreo',                    examSubject: 'regulamentos' },
      { key: 'performance',  label: 'Performance, Peso, Carregamento e Balanceamento',   examSubject: 'performance' },
      { key: 'meteorologia', label: 'Meteorologia',                                      examSubject: 'meteorologia' },
      { key: 'gsi',          label: 'Gerenciamento de Situações Inesperadas',            examSubject: null }
    ];

    const rows = subjects.map(s => {
      const att = attempts.find(a => a.subjectKey === s.examSubject && a.status === 'completed');
      const nota = att ? att.score : (presencas[s.key]?.nota ?? null);
      const participacao = presencas[s.key]?.participacao ?? null;
      return { label: s.label, nota, participacao, obs: presencas[s.key]?.obs || '' };
    });

    const notasValidas = rows.filter(r => r.nota !== null).map(r => r.nota);
    const partValidas  = rows.filter(r => r.participacao !== null).map(r => r.participacao);
    const mediaNotas   = notasValidas.length ? (notasValidas.reduce((a,b) => a+b, 0) / notasValidas.length) : null;
    const mediaPart    = partValidas.length  ? (partValidas.reduce((a,b) => a+b, 0)  / partValidas.length)  : null;

    return {
      student,
      settings,
      rows,
      mediaNotas,
      mediaPart
    };
  },

  // ── API SYNC ──────────────────────────────────────────────────────────
  _apiReady() {
    return typeof API !== 'undefined' && API.URL !== 'APPS_SCRIPT_URL_AQUI';
  },

  // Fetches all admin data from API into localStorage
  async syncFromAPI(adminPassword) {
    if (!this._apiReady()) return false;
    try {
      const res = await API.adminLoad(adminPassword);
      if (!res.ok) return false;
      if (res.students)    this.set(this.KEYS.STUDENTS, res.students);
      if (res.attempts)    this.set(this.KEYS.ATTEMPTS, res.attempts);
      if (res.presencas)   this.set(this.KEYS.PRESENCAS, res.presencas);
      if (res.examConfigs) this.set(this.KEYS.CONFIGS, res.examConfigs);
      if (res.settings)    this.set(this.KEYS.SETTINGS, res.settings);
      localStorage.setItem(this.KEYS.INIT, 'true');
      return true;
    } catch(e) { console.warn('[Sync] Offline:', e.message); return false; }
  },

  // Fetches this student's attempts + public config from API
  async syncStudentFromAPI(studentId, cpf) {
    if (!this._apiReady()) return;
    try {
      const [dataRes, cfgRes] = await Promise.all([
        API.getStudentData(studentId, cpf),
        API.getPublicConfig()
      ]);
      if (dataRes.ok && dataRes.attempts) {
        const all = this.getAttempts().filter(a => a.studentId !== studentId);
        dataRes.attempts.forEach(a => all.push(a));
        this.set(this.KEYS.ATTEMPTS, all);
      }
      if (cfgRes.ok && cfgRes.examConfigs) {
        this.set(this.KEYS.CONFIGS, cfgRes.examConfigs);
      }
    } catch(e) { console.warn('[Sync] Offline:', e.message); }
  },

  // Pushes specific admin data fields to API (fire-and-forget)
  _pushAdminFields(fields) {
    if (!this._apiReady()) return;
    const auth = this.checkAuth();
    const pw = auth?.adminPassword;
    if (!pw) return;
    API.adminSave(pw, fields).catch(e => console.warn('[Push] Falhou:', e.message));
  },

  // Pushes a single attempt to API from the student page (fire-and-forget)
  _pushAttempt(attempt) {
    if (!this._apiReady()) return;
    const auth = this.checkAuth();
    if (!auth?.id || !auth?.cpf) return;
    API.saveAttempt(auth.id, auth.cpf, attempt).catch(e => console.warn('[Push attempt] Falhou:', e.message));
  }
};
