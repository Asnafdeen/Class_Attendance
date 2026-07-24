const STORAGE_KEY = 'attendance-register-data';
const WEEKDAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const WEEKDAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function uid(){ return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function todayStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtDate(str){
  const [y,m,d] = str.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}
function weekdayNameForDate(dateStr){
  const [y,m,d] = dateStr.split('-').map(Number);
  return WEEKDAY_NAMES[new Date(y, m-1, d).getDay()];
}
function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---- data + migration ----
function loadData(){
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); }catch(e){}

  let data = {
    className:'', students:[], subjects:[],
    timetable:{ Monday:[], Tuesday:[], Wednesday:[], Thursday:[], Friday:[] },
    records:{}, schemaVersion:2
  };

  if(raw && raw.schemaVersion === 2){
    data = Object.assign(data, raw);
    WEEKDAYS.forEach(d => { if(!data.timetable[d]) data.timetable[d] = []; });
    if(!data.records) data.records = {};
  } else if(raw){
    // best-effort carryover from an older version; records format changed, so start attendance fresh
    if(typeof raw.className === 'string') data.className = raw.className;
    if(Array.isArray(raw.students)) data.students = raw.students.map(s => ({ id: s.id || uid(), name: s.name || '' })).filter(s => s.name);
    if(Array.isArray(raw.subjects)) data.subjects = raw.subjects.map(s => ({ id: s.id || uid(), name: s.name || '' })).filter(s => s.name);
  }
  return data;
}
function saveData(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

let data = loadData();
let currentDate = todayStr();
let selectedPeriodId = null;

// ---- elements ----
const classNameInput = document.getElementById('className');
const datePicker = document.getElementById('datePicker');
const weekdayLabelEl = document.getElementById('weekdayLabel');
const periodPillsEl = document.getElementById('periodPills');
const sessionAreaEl = document.getElementById('sessionArea');
const subjectOverviewEl = document.getElementById('subjectOverview');
const subjectListEl = document.getElementById('subjectList');
const studentListEl = document.getElementById('studentList');
const timetableEditorEl = document.getElementById('timetableEditor');
const newSubjectInput = document.getElementById('newSubjectName');
const newStudentInput = document.getElementById('newStudentName');

classNameInput.value = data.className || '';
datePicker.value = currentDate;

classNameInput.addEventListener('input', () => { data.className = classNameInput.value; saveData(); });

// ---- tabs ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});
function switchTab(tabId){
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('hidden', p.id !== tabId));
  if(tabId === 'attendanceTab') renderAttendanceTab();
}
function goToSetup(){ switchTab('setupTab'); }

// ---- date nav ----
function setDate(dateStr){
  currentDate = dateStr;
  datePicker.value = dateStr;
  renderAttendanceTab();
}
document.getElementById('prevDay').addEventListener('click', () => {
  const d = new Date(currentDate); d.setDate(d.getDate()-1);
  setDate(d.toISOString().slice(0,10));
});
document.getElementById('nextDay').addEventListener('click', () => {
  const d = new Date(currentDate); d.setDate(d.getDate()+1);
  setDate(d.toISOString().slice(0,10));
});
document.getElementById('jumpToday').addEventListener('click', () => setDate(todayStr()));
datePicker.addEventListener('change', () => setDate(datePicker.value));

// ---- subjects ----
document.getElementById('addSubjectBtn').addEventListener('click', addSubject);
newSubjectInput.addEventListener('keydown', e => { if(e.key === 'Enter') addSubject(); });

function addSubject(){
  const name = newSubjectInput.value.trim();
  if(!name) return;
  data.subjects.push({ id: uid(), name });
  newSubjectInput.value = '';
  saveData();
  renderSubjects(); renderTimetableEditor(); renderAttendanceTab();
}
function removeSubject(id){
  if(!confirm('Delete this subject? Any timetable periods using it will need a new subject assigned. Its past attendance records are kept but will drop out of the overview.')) return;
  data.subjects = data.subjects.filter(s => s.id !== id);
  WEEKDAYS.forEach(day => { data.timetable[day].forEach(p => { if(p.subjectId === id) p.subjectId = null; }); });
  saveData();
  renderSubjects(); renderTimetableEditor(); renderAttendanceTab();
}
function renderSubjects(){
  subjectListEl.innerHTML = data.subjects.length
    ? data.subjects.map(s => `<div class="chip">${escapeHtml(s.name)}<button onclick="removeSubject('${s.id}')" title="Delete subject">✕</button></div>`).join('')
    : '<p class="hint">No subjects yet — add one above.</p>';
}

// ---- students ----
document.getElementById('addStudentBtn').addEventListener('click', addStudent);
newStudentInput.addEventListener('keydown', e => { if(e.key === 'Enter') addStudent(); });

function addStudent(){
  const name = newStudentInput.value.trim();
  if(!name) return;
  data.students.push({ id: uid(), name });
  newStudentInput.value = '';
  saveData();
  renderStudents(); renderAttendanceTab();
}
function removeStudent(id){
  if(!confirm('Remove this student and all their attendance records across every subject?')) return;
  data.students = data.students.filter(s => s.id !== id);
  Object.values(data.records).forEach(byDate => {
    Object.values(byDate).forEach(rec => { delete rec.marks[id]; });
  });
  saveData();
  renderStudents(); renderAttendanceTab();
}
function renderStudents(){
  studentListEl.innerHTML = data.students.length
    ? data.students.map(s => `<div class="chip">${escapeHtml(s.name)}<button onclick="removeStudent('${s.id}')" title="Remove student">✕</button></div>`).join('')
    : '<p class="hint">No students yet — add one above.</p>';
}

// ---- timetable editor ----
function renderTimetableEditor(){
  timetableEditorEl.innerHTML = WEEKDAYS.map(day => {
    const periods = data.timetable[day];
    const rows = periods.map((p, i) => {
      const options = data.subjects.map(s =>
        `<option value="${s.id}" ${p.subjectId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
      ).join('');
      return `
        <div class="period-row">
          <span class="p-tag">Period ${i+1}</span>
          <select onchange="setPeriodSubject('${day}','${p.id}',this.value)">
            <option value="">-- select subject --</option>
            ${options}
          </select>
          <button class="rm-period" onclick="removePeriod('${day}','${p.id}')" title="Remove period">✕</button>
        </div>`;
    }).join('');
    return `
      <div class="day-block">
        <div class="day-block-header">${day}</div>
        ${rows || '<p class="hint" style="padding:10px 14px;">No periods added yet.</p>'}
        <div class="add-period-row"><button onclick="addPeriod('${day}')">+ Add period</button></div>
      </div>`;
  }).join('');
}
function addPeriod(day){
  data.timetable[day].push({ id: uid(), subjectId: null });
  saveData();
  renderTimetableEditor(); renderAttendanceTab();
}
function removePeriod(day, id){
  data.timetable[day] = data.timetable[day].filter(p => p.id !== id);
  saveData();
  renderTimetableEditor(); renderAttendanceTab();
}
function setPeriodSubject(day, id, subjectId){
  const p = data.timetable[day].find(p => p.id === id);
  if(p) p.subjectId = subjectId || null;
  saveData();
  renderTimetableEditor(); renderAttendanceTab();
}

// ---- attendance records ----
function ensureRecord(periodId, date, subjectId){
  if(!data.records[periodId]) data.records[periodId] = {};
  if(!data.records[periodId][date]) data.records[periodId][date] = { subjectId, marks: {} };
  else data.records[periodId][date].subjectId = subjectId;
}
function getRecord(periodId, date){
  return (data.records[periodId] && data.records[periodId][date]) || null;
}
function cycleMark(periodId, studentId){
  const rec = data.records[periodId][currentDate];
  const cur = rec.marks[studentId];
  if(cur === undefined) rec.marks[studentId] = 'P';
  else if(cur === 'P') rec.marks[studentId] = 'A';
  else delete rec.marks[studentId];
  saveData();
  renderAttendanceTab();
}
function subjectPctForStudent(subjectId, studentId){
  let present = 0, total = 0;
  Object.values(data.records).forEach(byDate => {
    Object.values(byDate).forEach(rec => {
      if(rec.subjectId === subjectId && rec.marks[studentId]){
        total++;
        if(rec.marks[studentId] === 'P') present++;
      }
    });
  });
  return total === 0 ? null : Math.round((present/total)*100);
}
function subjectOverallPct(subjectId){
  let present = 0, total = 0;
  Object.values(data.records).forEach(byDate => {
    Object.values(byDate).forEach(rec => {
      if(rec.subjectId === subjectId){
        Object.values(rec.marks).forEach(v => { total++; if(v === 'P') present++; });
      }
    });
  });
  return total === 0 ? null : Math.round((present/total)*100);
}

function selectPeriod(id){ selectedPeriodId = id; renderAttendanceTab(); }

// ---- attendance tab render ----
function renderAttendanceTab(){
  const wd = weekdayNameForDate(currentDate);
  const isWeekday = WEEKDAYS.includes(wd);
  weekdayLabelEl.textContent = `${fmtDate(currentDate)} — ${wd}${isWeekday ? '' : ' (weekend)'}`;

  const periods = isWeekday ? data.timetable[wd] : [];

  if(periods.length === 0){
    periodPillsEl.innerHTML = '';
    sessionAreaEl.innerHTML = `<div class="no-periods">${isWeekday
      ? `No periods set for ${wd} yet.`
      : `No classes scheduled on ${wd}s.`} <a onclick="goToSetup()">Set up your timetable →</a></div>`;
    selectedPeriodId = null;
    renderOverview();
    return;
  }

  if(!selectedPeriodId || !periods.find(p => p.id === selectedPeriodId)){
    selectedPeriodId = periods[0].id;
  }

  periodPillsEl.innerHTML = periods.map((p, i) => {
    const subj = data.subjects.find(s => s.id === p.subjectId);
    const subjName = subj ? subj.name : '— not set —';
    const rec = getRecord(p.id, currentDate);
    const marks = rec ? rec.marks : {};
    const markedCount = Object.keys(marks).length;
    let statusClass = '';
    if(markedCount > 0){
      const vals = Object.values(marks);
      const allP = vals.every(v => v === 'P');
      const allA = vals.every(v => v === 'A');
      statusClass = allP ? 'marked-present' : allA ? 'marked-absent' : 'marked-mixed';
    }
    const statusText = markedCount === 0 ? 'not taken' : `${markedCount}/${data.students.length} marked`;
    return `
      <button class="period-pill ${p.id === selectedPeriodId ? 'selected' : ''} ${statusClass}" onclick="selectPeriod('${p.id}')">
        <span class="p-num">Period ${i+1}</span>
        <span class="p-subj">${escapeHtml(subjName)}</span>
        <span class="p-status">${statusText}</span>
      </button>`;
  }).join('');

  renderSession(periods.find(p => p.id === selectedPeriodId));
  renderOverview();
}

function renderSession(period){
  if(!period){ sessionAreaEl.innerHTML = ''; return; }
  const subj = data.subjects.find(s => s.id === period.subjectId);

  if(!subj){
    sessionAreaEl.innerHTML = `<div class="no-periods">This period has no subject assigned yet. <a onclick="goToSetup()">Set it in Setup →</a></div>`;
    return;
  }
  if(data.students.length === 0){
    sessionAreaEl.innerHTML = `<div class="no-periods">No students yet. <a onclick="goToSetup()">Add students in Setup →</a></div>`;
    return;
  }

  ensureRecord(period.id, currentDate, subj.id);
  const marks = data.records[period.id][currentDate].marks;

  const rosterHtml = data.students.map((s, i) => {
    const status = marks[s.id] || null;
    const pct = subjectPctForStudent(subj.id, s.id);
    const btnClass = status === 'P' ? 'present' : status === 'A' ? 'absent' : '';
    const btnLabel = status === 'P' ? 'Present' : status === 'A' ? 'Absent' : 'Mark';
    return `
      <div class="row">
        <div class="roll">${String(i+1).padStart(2,'0')}</div>
        <div class="name">${escapeHtml(s.name)}</div>
        <div class="pct">${pct === null ? 'no record yet' : `<b>${pct}%</b> in ${escapeHtml(subj.name)}`}</div>
        <div class="row-actions">
          <button class="stamp-btn ${btnClass}" onclick="cycleMark('${period.id}','${s.id}')">${btnLabel}</button>
        </div>
      </div>`;
  }).join('');

  const present = Object.values(marks).filter(v => v === 'P').length;
  const absent = Object.values(marks).filter(v => v === 'A').length;
  const total = data.students.length;
  const marked = present + absent;

  sessionAreaEl.innerHTML = `
    <div class="session-header">
      <span class="subj-name">${escapeHtml(subj.name)}</span>
      <span class="subj-meta">${fmtDate(currentDate)}</span>
    </div>
    <div class="roster">${rosterHtml}</div>
    <div class="summary">
      <div class="cell present"><span class="num">${present}</span><span class="lbl">Present</span></div>
      <div class="cell absent"><span class="num">${absent}</span><span class="lbl">Absent</span></div>
      <div class="cell marked"><span class="num">${marked}/${total}</span><span class="lbl">Marked</span></div>
    </div>`;
}

function renderOverview(){
  if(data.subjects.length === 0){ subjectOverviewEl.innerHTML = ''; return; }
  const rows = data.subjects.map(s => {
    const pct = subjectOverallPct(s.id);
    if(pct === null){
      return `<div class="overview-row"><span class="oname">${escapeHtml(s.name)}</span><span class="obar"></span><span class="opct">—</span></div>`;
    }
    const low = pct < 75;
    return `
      <div class="overview-row ${low ? 'low' : ''}">
        <span class="oname">${escapeHtml(s.name)}</span>
        <span class="obar"><span class="obar-fill" style="width:${pct}%"></span></span>
        <span class="opct ${low ? 'low' : ''}">${pct}%</span>
      </div>`;
  }).join('');
  subjectOverviewEl.innerHTML = `<h3>Subject overview · all students combined</h3>${rows}`;
}

// ---- init ----
renderSubjects();
renderStudents();
renderTimetableEditor();
renderAttendanceTab();
