// Thin persistence layer over localStorage. All reads/writes are wrapped in
// try/catch so a full or blocked storage quota degrades to an in-memory
// session instead of crashing the app.

const STORE_KEYS = {
  students: "tracer.students.v1",
  houses: "tracer.houses.v1",
  programs: "tracer.programs.v1",
  settings: "tracer.settings.v1"
};

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error("Storage read failed for", key, e);
    return fallback;
  }
}

function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error("Storage write failed for", key, e);
    return false;
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const Store = {
  init() {
    if (localStorage.getItem(STORE_KEYS.programs) === null) {
      saveJSON(STORE_KEYS.programs, DEFAULT_PROGRAMS.map(name => ({ id: uid(), name })));
    }
    if (localStorage.getItem(STORE_KEYS.houses) === null) {
      saveJSON(STORE_KEYS.houses, []);
    }
    if (localStorage.getItem(STORE_KEYS.students) === null) {
      saveJSON(STORE_KEYS.students, []);
    }
    if (localStorage.getItem(STORE_KEYS.settings) === null) {
      saveJSON(STORE_KEYS.settings, { instituteName: "GTVET Institute", graduationYear: new Date().getFullYear() });
    }
  },

  getStudents() { return loadJSON(STORE_KEYS.students, []); },
  setStudents(list) { return saveJSON(STORE_KEYS.students, list); },

  getHouses() { return loadJSON(STORE_KEYS.houses, []); },
  setHouses(list) { return saveJSON(STORE_KEYS.houses, list); },

  getPrograms() { return loadJSON(STORE_KEYS.programs, []); },
  setPrograms(list) { return saveJSON(STORE_KEYS.programs, list); },

  getSettings() { return loadJSON(STORE_KEYS.settings, { instituteName: "GTVET Institute" }); },
  setSettings(obj) { return saveJSON(STORE_KEYS.settings, obj); },

  addStudent(student) {
    const list = this.getStudents();
    list.unshift({ id: uid(), createdAt: Date.now(), ...student });
    this.setStudents(list);
  },
  updateStudent(id, patch) {
    const list = this.getStudents();
    const idx = list.findIndex(s => s.id === id);
    if (idx !== -1) { list[idx] = { ...list[idx], ...patch }; this.setStudents(list); }
  },
  deleteStudent(id) {
    this.setStudents(this.getStudents().filter(s => s.id !== id));
  },

  addHouse(name, color) {
    const list = this.getHouses();
    if (list.some(h => h.name.toLowerCase() === name.toLowerCase())) return false;
    list.push({ id: uid(), name, color });
    this.setHouses(list);
    return true;
  },
  deleteHouse(id) {
    this.setHouses(this.getHouses().filter(h => h.id !== id));
    // Unassign the house from any student who had it
    const students = this.getStudents().map(s => s.houseId === id ? { ...s, houseId: "" } : s);
    this.setStudents(students);
  },

  addProgram(name) {
    const list = this.getPrograms();
    if (list.some(p => p.name.toLowerCase() === name.toLowerCase())) return false;
    list.push({ id: uid(), name });
    this.setPrograms(list);
    return true;
  },
  deleteProgram(id) {
    this.setPrograms(this.getPrograms().filter(p => p.id !== id));
    const students = this.getStudents().map(s => s.programId === id ? { ...s, programId: "" } : s);
    this.setStudents(students);
  }
};
