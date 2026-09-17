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
  const views = ["students", "houses", "programs"];
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
      return `<li class="chip chip-plain">
        <span class="chip-label">${esc(p.name)}</span>
        <span class="chip-meta">${n} student${n === 1 ? "" : "s"}</span>
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

    const opts = programs.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    $("fProgram").innerHTML = `<option value="">Select programme…</option>` + opts;
    $("filterProgram").innerHTML = `<option value="">All programmes</option>` + opts;
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
  function studentMatchesFilters(s, query, houseId, programId) {
    if (houseId && s.houseId !== houseId) return false;
    if (programId && s.programId !== programId) return false;
    if (!query) return true;
    const hay = [s.studentId, s.fullName, s.mobile, s.email].join(" ").toLowerCase();
    return hay.includes(query);
  }

  function renderStudents() {
    const students = Store.getStudents();
    $("countStudents").textContent = students.length;

    const query = $("studentSearch").value.trim().toLowerCase();
    const houseId = $("filterHouse").value;
    const programId = $("filterProgram").value;
    const filtered = students.filter(s => studentMatchesFilters(s, query, houseId, programId));

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
        <td>${esc(s.examType) || "—"}</td>
        <td>${esc(s.gradYear) || "—"}</td>
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
    if (id) {
      Store.updateStudent(id, data);
      toast(`Saved ${data.fullName}`);
    } else {
      Store.addStudent(data);
      toast(`Added ${data.fullName}`);
    }
    closeStudentModal();
    renderAll();
  });

  // ---------- confirm modal ----------
  let confirmCallback = null;
  function confirmAction(title, body, onConfirm) {
    $("confirmTitle").textContent = title;
    $("confirmBody").textContent = body;
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
    const houseId = $("filterHouse").value;
    const programId = $("filterProgram").value;
    return Store.getStudents().filter(s => studentMatchesFilters(s, query, houseId, programId));
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
        <td>${esc(s.examType)}</td>
        <td>${esc(s.gradYear)}</td>
        <td>${esc(s.mobile)}</td>
      </tr>`;
    }).join("");
    $("printArea").innerHTML = `
      <h1>${esc(instituteName)}</h1>
      <h2>Graduate List — printed ${new Date().toLocaleDateString()}</h2>
      <table>
        <thead><tr>
          <th>Student ID</th><th>Full Name</th><th>Sex</th><th>Programme</th>
          <th>House</th><th>Exam Type</th><th>Grad. Year</th><th>Mobile</th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <p class="print-footer">${students.length} student${students.length === 1 ? "" : "s"} listed</p>
    `;
    window.print();
  });

  // ---------- render orchestration ----------
  function renderAll() {
    renderHouses();
    renderPrograms();
    renderStudents();
  }
  renderAll();

  // ---------- PWA service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(err => console.warn("SW registration failed", err));
    });
  }
})();
