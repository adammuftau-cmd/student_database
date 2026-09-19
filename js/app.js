(function () {
  "use strict";

  Store.init();

  // ---------- small DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => (s ?? "").toString().replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));

  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2600);
  }

  // ---------- navigation ----------
  const views = ["dashboard", "students", "houses", "programs"];
  function showView(name) {
    views.forEach(v => {
      $("view-" + v).classList.toggle("is-active", v === name);
    });
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.classList.toggle("is-active", btn.dataset.view === name);
    });
  }
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  // ---------- settings ----------
  const settings = Store.getSettings();
  $("instituteNameInput").value = settings.instituteName || "";
  $("brandName").textContent = settings.instituteName || "GTVET Institute";
  document.title = (settings.instituteName || "GTVET Institute") + " · Graduate Tracer";
  $("instituteNameInput").addEventListener("input", (e) => {
    const name = e.target.value.trim() || "GTVET Institute";
    $("brandName").textContent = name;
    document.title = name + " · Graduate Tracer";
    Store.setSettings({ ...Store.getSettings(), instituteName: e.target.value });
  });

  // ---------- static reference selects ----------
  function fillSelect(select, values, { keepFirst = true } = {}) {
    const startHtml = keepFirst ? select.innerHTML : "";
    select.innerHTML = startHtml + values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  }
  fillSelect($("fExamType"), EXAM_TYPES);
  fillSelect($("fRegion"), REGIONS);
  fillSelect($("fImpairment"), IMPAIRMENT_TYPES);

  // ---------- houses ----------
  let selectedColor = HOUSE_COLORS[0];
  function renderSwatches() {
    $("houseSwatches").innerHTML = HOUSE_COLORS.map(c =>
      `<button type="button" class="swatch${c === selectedColor ? " is-selected" : ""}" data-color="${c}" style="background:${c}" aria-label="Pick color"></button>`
    ).join("");
    $("houseSwatches").querySelectorAll(".swatch").forEach(btn => {
      btn.addEventListener("click", () => { selectedColor = btn.dataset.color; renderSwatches(); });
    });
  }
  renderSwatches();

  function houseById(id) { return Store.getHouses().find(h => h.id === id); }
  function programById(id) { return Store.getPrograms().find(p => p.id === id); }

  function renderHouses() {
    const houses = Store.getHouses();
    const students = Store.getStudents();
    $("countHouses").textContent = houses.length;
    $("housesEmpty").hidden = houses.length > 0;
    $("houseList").innerHTML = houses.map(h => {
      const n = students.filter(s => s.houseId === h.id).length;
      return `<li class="chip" style="--chip-color:${h.color}">
        <span class="chip-dot"></span>
        <span class="chip-label">${esc(h.name)}</span>
        <span class="chip-meta">${n} student${n === 1 ? "" : "s"}</span>
        <button class="chip-delete" data-house-id="${h.id}" type="button" aria-label="Delete house">&times;</button>
      </li>`;
    }).join("");
    $("houseList").querySelectorAll(".chip-delete").forEach(btn => {
      btn.addEventListener("click", () => {
        const h = houseById(btn.dataset.houseId);
        confirmAction(`Delete "${h.name}"?`, "Students in this house will become unassigned. This can't be undone.", () => {
          Store.deleteHouse(h.id);
          renderAll();
          toast(`Deleted ${h.name}`);
        });
      });
    });

    // refresh dependent selects
    const opts = houses.map(h => `<option value="${h.id}">${esc(h.name)}</option>`).join("");
    $("fHouse").innerHTML = `<option value="">— None —</option>` + opts;
    $("filterHouse").innerHTML = `<option value="">All houses</option>` + opts;
  }

  $("houseForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("houseNameInput").value.trim();
    if (!name) return;
    const ok = Store.addHouse(name, selectedColor);
    if (!ok) { toast("That house already exists"); return; }
    $("houseNameInput").value = "";
    renderAll();
    toast(`Added ${name}`);
  });

  // ---------- programs ----------
  function renderPrograms() {
    const programs = Store.getPrograms();
    const students = Store.getStudents();
    $("countPrograms").textContent = programs.length;
    $("programsEmpty").hidden = programs.length > 0;
    $("programList").innerHTML = programs.map(p => {
      const n = students.filter(s => s.programId === p.id).length;
      return `<li class="chip chip-plain" data-program-row="${p.id}">
        <span class="chip-label" data-label>${esc(p.name)}</span>
        <span class="chip-meta">${n} student${n === 1 ? "" : "s"}</span>
        <button class="chip-edit" data-edit-program="${p.id}" type="button" aria-label="Rename programme">✎</button>
        <button class="chip-delete" data-program-id="${p.id}" type="button" aria-label="Delete programme">&times;</button>
      </li>`;
    }).join("");
    $("programList").querySelectorAll(".chip-delete").forEach(btn => {
      btn.addEventListener("click", () => {
        const p = programById(btn.dataset.programId);
        confirmAction(`Delete "${p.name}"?`, "Students on this programme will become unassigned. This can't be undone.", () => {
          Store.deleteProgram(p.id);
          renderAll();
          toast(`Deleted ${p.name}`);
        });
      });
    });
    $("programList").querySelectorAll(".chip-edit").forEach(btn => {
      btn.addEventListener("click", () => startProgramRename(btn.dataset.editProgram));
    });

    const opts = programs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    $("fProgram").innerHTML = `<option value="">Select programme…</option>` + opts;
    $("filterProgram").innerHTML = `<option value="">All programmes</option>` + opts;
  }

  function startProgramRename(id) {
    const row = $("programList").querySelector(`[data-program-row="${id}"]`);
    if (!row) return;
    const p = programById(id);
    const labelEl = row.querySelector("[data-label]");
    const input = document.createElement("input");
    input.type = "text";
    input.value = p.name;
    input.className = "chip-rename-input";
    input.maxLength = 120;
    labelEl.replaceWith(input);
    input.focus();
    input.select();

    let done = false;
    function commit() {
      if (done) return;
      done = true;
      const newName = input.value.trim();
      if (!newName || newName === p.name) { renderAll(); return; }
      const ok = Store.renameProgram(id, newName);
      if (!ok) toast("That programme name already exists");
      else toast("Programme renamed");
      renderAll();
    }
    function cancel() {
      if (done) return;
      done = true;
      renderAll();
    }
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      if (e.key === "Escape") { e.preventDefault(); cancel(); }
    });
    input.addEventListener("blur", commit);
  }

  $("programForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("programNameInput").value.trim();
    if (!name) return;
    const ok = Store.addProgram(name);
    if (!ok) { toast("That programme already exists"); return; }
    $("programNameInput").value = "";
    renderAll();
    toast(`Added ${name}`);
  });

  // ---------- students ----------
  function studentMatchesFilters(s, query, houseId, programId, sex) {
    if (houseId && s.houseId !== houseId) return false;
    if (programId && s.programId !== programId) return false;
    if (sex && (s.sex || "").toLowerCase() !== sex.toLowerCase()) return false;
    if (!query) return true;
    const hay = [s.studentId, s.fullName, s.mobile, s.email].join(" ").toLowerCase();
    return hay.includes(query);
  }

  // ---------- sorting ----------
  let sortState = { key: "fullName", direction: "asc" };

  function getSortValue(s, key) {
    if (key === "programme") { const p = programById(s.programId); return p ? p.name : (s.programOther || ""); }
    if (key === "house") { const h = houseById(s.houseId); return h ? h.name : ""; }
    return s[key] || "";
  }

  function compareValues(a, b, dir) {
    const cmp = a.toString().localeCompare(b.toString(), undefined, { numeric: true, sensitivity: "base" });
    return dir === "asc" ? cmp : -cmp;
  }

  function updateSortHeaders() {
    document.querySelectorAll("#studentsTable th[data-sort]").forEach(th => {
      th.classList.remove("sort-asc", "sort-desc");
      if (th.dataset.sort === sortState.key) th.classList.add(sortState.direction === "asc" ? "sort-asc" : "sort-desc");
    });
  }

  document.querySelectorAll("#studentsTable th[data-sort]").forEach(th => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (sortState.key === key) sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
      else sortState = { key, direction: "asc" };
      renderStudents();
    });
  });

  function renderStudents() {
    const students = Store.getStudents();
    $("countStudents").textContent = students.length;

    const query = $("studentSearch").value.trim().toLowerCase();
    const sex = $("filterSex").value;
    const houseId = $("filterHouse").value;
    const programId = $("filterProgram").value;
    const filtered = students
      .filter(s => studentMatchesFilters(s, query, houseId, programId, sex))
      .sort((a, b) => compareValues(getSortValue(a, sortState.key), getSortValue(b, sortState.key), sortState.direction));

    updateSortHeaders();

    $("studentsEmpty").hidden = students.length > 0;
    $("studentsTbody").innerHTML = filtered.map(s => {
      const house = houseById(s.houseId);
      const program = programById(s.programId);
      const programLabel = program ? program.name : (s.programOther || "—");
      return `<tr>
        <td>${esc(s.studentId) || "—"}</td>
        <td class="cell-strong">${esc(s.fullName)}</td>
        <td>${esc(s.sex) || "—"}</td>
        <td>${esc(programLabel)}</td>
        <td>${house ? `<span class="house-tag" style="--chip-color:${house.color}">${esc(house.name)}</span>` : "—"}</td>
        <td>${esc(s.dob) || "—"}</td>
        <td>${esc(s.boardingStatus) || "—"}</td>
        <td>${esc(s.mobile) || "—"}</td>
        <td class="cell-actions">
          <button class="icon-btn" data-edit="${s.id}" type="button" aria-label="Edit">✎</button>
          <button class="icon-btn icon-btn-danger" data-delete="${s.id}" type="button" aria-label="Delete">🗑</button>
        </td>
      </tr>`;
    }).join("");

    $("studentsTbody").querySelectorAll("[data-edit]").forEach(btn => {
      btn.addEventListener("click", () => openStudentModal(btn.dataset.edit));
    });
    $("studentsTbody").querySelectorAll("[data-delete]").forEach(btn => {
      btn.addEventListener("click", () => {
        const s = students.find(x => x.id === btn.dataset.delete);
        confirmAction(`Delete ${s.fullName}?`, "This removes the graduate's record permanently.", () => {
          Store.deleteStudent(s.id);
          renderAll();
          toast(`Deleted ${s.fullName}`);
        });
      });
    });
  }

  $("studentSearch").addEventListener("input", renderStudents);
  $("filterSex").addEventListener("change", renderStudents);
  $("filterHouse").addEventListener("change", renderStudents);
  $("filterProgram").addEventListener("change", renderStudents);

  // ---------- student modal ----------
  const studentFormFields = [
    "fStudentId", "fFullName", "fSex", "fDob", "fProgram", "fProgramOther",
    "fExamType", "fGradYear", "fHouse", "fMobile", "fEmail", "fSocial",
    "fRegion", "fAddress", "fGps", "fGuardianName", "fGuardianContact",
    "fDisability", "fImpairment"
  ];

  function openStudentModal(editId) {
    $("studentForm").reset();
    $("fDisability").value = "No";
    if (editId) {
      const s = Store.getStudents().find(x => x.id === editId);
      $("studentModalTitle").textContent = "Edit student";
      $("studentId").value = s.id;
      $("fStudentId").value = s.studentId || "";
      $("fFullName").value = s.fullName || "";
      $("fSex").value = s.sex || "";
      $("fDob").value = s.dob || "";
      $("fProgram").value = s.programId || "";
      $("fProgramOther").value = s.programOther || "";
      $("fExamType").value = s.examType || "";
      $("fGradYear").value = s.gradYear || "";
      $("fHouse").value = s.houseId || "";
      $("fBoarding").value = s.boardingStatus || "";
      $("fMobile").value = s.mobile || "";
      $("fEmail").value = s.email || "";
      $("fSocial").value = s.social || "";
      $("fRegion").value = s.region || "";
      $("fAddress").value = s.address || "";
      $("fGps").value = s.gps || "";
      $("fGuardianName").value = s.guardianName || "";
      $("fGuardianContact").value = s.guardianContact || "";
      $("fDisability").value = s.disability || "No";
      $("fImpairment").value = s.impairment || "";
    } else {
      $("studentModalTitle").textContent = "Add student";
      $("studentId").value = "";
      $("fGradYear").value = Store.getSettings().graduationYear || new Date().getFullYear();
    }
    $("studentModalBackdrop").hidden = false;
    $("fFullName").focus();
  }
  function closeStudentModal() { $("studentModalBackdrop").hidden = true; }

  $("btnAddStudent").addEventListener("click", () => openStudentModal(null));
  $("closeStudentModal").addEventListener("click", closeStudentModal);
  $("cancelStudentForm").addEventListener("click", closeStudentModal);
  $("studentModalBackdrop").addEventListener("click", (e) => { if (e.target.id === "studentModalBackdrop") closeStudentModal(); });

  $("studentForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const id = $("studentId").value;
    const data = {
      studentId: $("fStudentId").value.trim(),
      fullName: $("fFullName").value.trim(),
      sex: $("fSex").value,
      dob: $("fDob").value,
      programId: $("fProgram").value,
      programOther: $("fProgramOther").value.trim(),
      examType: $("fExamType").value,
      gradYear: $("fGradYear").value,
      houseId: $("fHouse").value,
      boardingStatus: $("fBoarding").value,
      mobile: $("fMobile").value.trim(),
      email: $("fEmail").value.trim(),
      social: $("fSocial").value.trim(),
      region: $("fRegion").value,
      address: $("fAddress").value.trim(),
      gps: $("fGps").value.trim(),
      guardianName: $("fGuardianName").value.trim(),
      guardianContact: $("fGuardianContact").value.trim(),
      disability: $("fDisability").value,
      impairment: $("fDisability").value === "Yes" ? $("fImpairment").value : ""
    };
    if (!data.fullName) { toast("Full name is required"); return; }

    const dup = Store.findDuplicateStudent(data, id || null);
    if (dup) {
      confirmAction(
        "Possible duplicate",
        `"${dup.fullName}"${dup.studentId ? ` (ID: ${dup.studentId})` : ""} is already in the list. Save this as a separate record anyway?`,
        () => saveStudentRecord(id, data),
        { confirmLabel: "Add anyway", danger: false }
      );
      return;
    }
    saveStudentRecord(id, data);
  });

  function saveStudentRecord(id, data) {
    if (id) {
      Store.updateStudent(id, data);
      toast(`Saved ${data.fullName}`);
    } else {
      Store.addStudent(data);
      toast(`Added ${data.fullName}`);
    }
    closeStudentModal();
    renderAll();
  }

  // ---------- confirm modal ----------
  let confirmCallback = null;
  function confirmAction(title, body, onConfirm, opts = {}) {
    const { confirmLabel = "Delete", danger = true } = opts;
    $("confirmTitle").textContent = title;
    $("confirmBody").textContent = body;
    const okBtn = $("confirmOk");
    okBtn.textContent = confirmLabel;
    okBtn.classList.toggle("btn-danger", danger);
    okBtn.classList.toggle("btn-primary", !danger);
    confirmCallback = onConfirm;
    $("confirmBackdrop").hidden = false;
  }
  $("confirmCancel").addEventListener("click", () => { $("confirmBackdrop").hidden = true; confirmCallback = null; });
  $("confirmOk").addEventListener("click", () => {
    $("confirmBackdrop").hidden = true;
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  });
  $("confirmBackdrop").addEventListener("click", (e) => { if (e.target.id === "confirmBackdrop") { $("confirmBackdrop").hidden = true; confirmCallback = null; } });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!$("studentModalBackdrop").hidden) closeStudentModal();
    if (!$("confirmBackdrop").hidden) { $("confirmBackdrop").hidden = true; confirmCallback = null; }
  });

  // ---------- export / print ----------
  const EXPORT_COLUMNS = [
    ["Student ID", s => s.studentId],
    ["Full Name", s => s.fullName],
    ["Sex", s => s.sex],
    ["Date of Birth", s => s.dob],
    ["Programme", s => (programById(s.programId) || {}).name || s.programOther || ""],
    ["House", s => (houseById(s.houseId) || {}).name || ""],
    ["Day/Boarding Status", s => s.boardingStatus],
    ["Exam Type", s => s.examType],
    ["Graduation Year", s => s.gradYear],
    ["Contact Mobile", s => s.mobile],
    ["Email Address", s => s.email],
    ["Region of Birth", s => s.region],
    ["Residential Address", s => s.address],
    ["GPS Digital Address", s => s.gps],
    ["Parent/Guardian Name", s => s.guardianName],
    ["Parent/Guardian Contact", s => s.guardianContact],
    ["Social Media Handle", s => s.social],
    ["Disability Status", s => s.disability],
    ["Type of Impairment", s => s.impairment]
  ];

  function currentFilteredStudents() {
    const query = $("studentSearch").value.trim().toLowerCase();
    const sex = $("filterSex").value;
    const houseId = $("filterHouse").value;
    const programId = $("filterProgram").value;
    return Store.getStudents()
      .filter(s => studentMatchesFilters(s, query, houseId, programId, sex))
      .sort((a, b) => compareValues(getSortValue(a, sortState.key), getSortValue(b, sortState.key), sortState.direction));
  }

  function exportRows() {
    const students = currentFilteredStudents();
    const headers = EXPORT_COLUMNS.map(c => c[0]);
    const rows = students.map(s => EXPORT_COLUMNS.map(c => c[1](s) ?? ""));
    return { headers, rows };
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  $("btnExportCsv").addEventListener("click", () => {
    const { headers, rows } = exportRows();
    const csvEscape = (v) => {
      const str = String(v ?? "");
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const csv = [headers, ...rows].map(r => r.map(csvEscape).join(",")).join("\r\n");
    downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), "graduate-list.csv");
    toast("CSV downloaded");
  });

  $("btnExportXlsx").addEventListener("click", () => {
    if (typeof XLSX === "undefined") { toast("Excel export needs an internet connection the first time"); return; }
    const { headers, rows } = exportRows();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Graduate List");
    XLSX.writeFile(wb, "graduate-list.xlsx");
    toast("Excel file downloaded");
  });

  $("btnPrint").addEventListener("click", () => {
    const students = currentFilteredStudents();
    const instituteName = Store.getSettings().instituteName || "GTVET Institute";
    const rowsHtml = students.map(s => {
      const house = houseById(s.houseId);
      const program = programById(s.programId);
      return `<tr>
        <td>${esc(s.studentId)}</td>
        <td>${esc(s.fullName)}</td>
        <td>${esc(s.sex)}</td>
        <td>${esc(program ? program.name : s.programOther)}</td>
        <td>${esc(house ? house.name : "")}</td>
        <td>${esc(s.dob)}</td>
        <td>${esc(s.boardingStatus)}</td>
        <td>${esc(s.mobile)}</td>
      </tr>`;
    }).join("");
    $("printArea").innerHTML = `
      <h1>${esc(instituteName)}</h1>
      <h2>Graduate List — printed ${new Date().toLocaleDateString()}</h2>
      <table>
        <thead><tr>
          <th>Student ID</th><th>Full Name</th><th>Sex</th><th>Programme</th>
          <th>House</th><th>Date of Birth</th><th>Residency</th><th>Mobile</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p class="print-footer">${students.length} student${students.length === 1 ? "" : "s"} listed</p>
    `;
    window.print();
  });

  // ---------- dashboard ----------
  function barRow(label, count, max, color) {
    const pct = max > 0 ? Math.round((count / max) * 100) : 0;
    return `<div class="bar-row">
      <span class="bar-label">${esc(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;${color ? `background:${color};` : ""}"></div></div>
      <span class="bar-count">${count}</span>
    </div>`;
  }

  function renderDashboard() {
    const students = Store.getStudents();
    const houses = Store.getHouses();
    const programs = Store.getPrograms();
    const total = students.length;

    const male = students.filter(s => (s.sex || "").toLowerCase() === "male").length;
    const female = students.filter(s => (s.sex || "").toLowerCase() === "female").length;
    const unspecified = total - male - female;

    $("statTotal").textContent = total;
    $("statMale").textContent = male;
    $("statFemale").textContent = female;
    $("statUnspecified").textContent = unspecified;
    $("statMalePct").textContent = total ? Math.round((male / total) * 100) + "%" : "0%";
    $("statFemalePct").textContent = total ? Math.round((female / total) * 100) + "%" : "0%";

    // Houses breakdown
    $("dashHouseEmpty").hidden = houses.length > 0;
    if (houses.length > 0) {
      const houseCounts = houses.map(h => ({
        name: h.name, color: h.color, count: students.filter(s => s.houseId === h.id).length
      })).sort((a, b) => b.count - a.count);
      const unassigned = students.filter(s => !s.houseId).length;
      const max = Math.max(1, ...houseCounts.map(h => h.count), unassigned);
      let html = houseCounts.map(h => barRow(h.name, h.count, max, h.color)).join("");
      if (unassigned > 0) html += barRow("Unassigned", unassigned, max, "#B9B3A4");
      $("dashHouseBars").innerHTML = html;
    } else {
      $("dashHouseBars").innerHTML = "";
    }

    // Top programmes breakdown (top 8 by count)
    $("dashProgramEmpty").hidden = programs.length > 0;
    if (programs.length > 0) {
      const progCounts = programs.map(p => ({
        name: p.name, count: students.filter(s => s.programId === p.id).length
      })).sort((a, b) => b.count - a.count).slice(0, 8);
      const max = Math.max(1, ...progCounts.map(p => p.count));
      $("dashProgramBars").innerHTML = progCounts.map(p => barRow(p.name, p.count, max)).join("");
    } else {
      $("dashProgramBars").innerHTML = "";
    }
  }

  // ---------- Excel import ----------
  const IMPORT_HOUSE_COLOR_CYCLE = (i) => HOUSE_COLORS[i % HOUSE_COLORS.length];

  function normalizeHeader(h) {
    return (h || "").toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // Maps normalized header text -> student field setter
  const IMPORT_FIELD_MAP = {
    studentid: (s, v) => s.studentId = String(v || "").trim(),
    fullname: (s, v) => s.fullName = String(v || "").trim(),
    name: (s, v) => { if (!s.fullName) s.fullName = String(v || "").trim(); },
    sex: (s, v) => s.sex = String(v || "").trim(),
    gender: (s, v) => { if (!s.sex) s.sex = String(v || "").trim(); },
    dateofbirth: (s, v) => s.dob = formatImportDate(v),
    dob: (s, v) => { if (!s.dob) s.dob = formatImportDate(v); },
    programme: (s, v) => s._programName = String(v || "").trim(),
    program: (s, v) => { if (!s._programName) s._programName = String(v || "").trim(); },
    house: (s, v) => s._houseName = String(v || "").trim(),
    dayboardingstatus: (s, v) => s.boardingStatus = String(v || "").trim(),
    boardingstatus: (s, v) => { if (!s.boardingStatus) s.boardingStatus = String(v || "").trim(); },
    examtype: (s, v) => s.examType = String(v || "").trim(),
    graduationyear: (s, v) => s.gradYear = String(v || "").trim(),
    contactmobile: (s, v) => s.mobile = String(v || "").trim(),
    mobile: (s, v) => { if (!s.mobile) s.mobile = String(v || "").trim(); },
    emailaddress: (s, v) => s.email = String(v || "").trim(),
    email: (s, v) => { if (!s.email) s.email = String(v || "").trim(); },
    regionofbirth: (s, v) => s.region = String(v || "").trim(),
    region: (s, v) => { if (!s.region) s.region = String(v || "").trim(); },
    residentialaddress: (s, v) => s.address = String(v || "").trim(),
    gpsdigitaladdress: (s, v) => s.gps = String(v || "").trim(),
    parentguardianname: (s, v) => s.guardianName = String(v || "").trim(),
    parentguardiancontact: (s, v) => s.guardianContact = String(v || "").trim(),
    socialmediahandle: (s, v) => s.social = String(v || "").trim(),
    disabilitystatus: (s, v) => s.disability = String(v || "").trim(),
    typeofimpairment: (s, v) => s.impairment = String(v || "").trim()
  };

  function formatImportDate(v) {
    if (!v) return "";
    if (v instanceof Date && !isNaN(v)) {
      const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return String(v).trim();
  }

  $("btnImportXlsx").addEventListener("click", () => $("importFileInput").click());

  $("importFileInput").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (typeof XLSX === "undefined") { toast("Import needs an internet connection the first time"); e.target.value = ""; return; }

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
        if (rows.length < 2) { toast("No rows found in that file"); return; }

        const headers = rows[0].map(normalizeHeader);
        let imported = 0, skipped = 0, duplicates = 0;
        const existingHouses = Store.getHouses();

        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];
          if (!row || row.every(c => c === "" || c === null || c === undefined)) continue;

          const s = {};
          headers.forEach((h, i) => {
            const setter = IMPORT_FIELD_MAP[h];
            if (setter) setter(s, row[i]);
          });

          if (!s.fullName) { skipped++; continue; }
          if (Store.findDuplicateStudent(s, null)) { duplicates++; continue; }

          s.programId = s._programName ? Store.findOrCreateProgram(s._programName) : "";
          if (s._programName && !s.programId) s.programOther = s._programName;
          s.houseId = s._houseName ? Store.findOrCreateHouse(s._houseName, IMPORT_HOUSE_COLOR_CYCLE) : "";
          delete s._programName;
          delete s._houseName;

          Store.addStudent(s);
          imported++;
        }

        renderAll();
        const parts = [`Imported ${imported} student${imported === 1 ? "" : "s"}`];
        if (duplicates) parts.push(`skipped ${duplicates} already in the list`);
        if (skipped) parts.push(`skipped ${skipped} without a name`);
        toast(parts.join(", "));
      } catch (err) {
        console.error(err);
        toast("Could not read that file — check it's a valid Excel/CSV export");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  });

  // ---------- render orchestration ----------
  function renderAll() {
    renderHouses();
    renderPrograms();
    renderStudents();
    renderDashboard();
  }
  renderAll();

  // ---------- PWA service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(err => console.warn("SW registration failed", err));
    });
  }
})();
