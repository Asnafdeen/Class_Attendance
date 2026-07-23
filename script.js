const STORAGE_KEY = 'attendance-register-data';

function loadData(){
  let data = { className:'', students: [], subjects: [], currentSubjectId: null, records: {} };
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw) data = Object.assign(data, JSON.parse(raw));
  }catch(e){}

  // --- migrate old single-subject data (records keyed by date only) ---
  const looksOld = data.records && Object.keys(data.records).length &&
    Object.values(data.records).some(v => v && typeof v === 'object' &&
      Object.values(v).some(x => x === 'P' || x === 'A'));
  if(looksOld && (!data.subjects || data.subjects.length === 0)){
    const generalId = uid();
    data.subjects = [{ id: generalId, name: 'General' }];
    data.records = { [generalId]: data.records };
    data.currentSubjectId = generalId;
  }

  if(!data.subjects) data.subjects = [];
  if(!data.records) data.records = {};

  if(data.subjects.length === 0){
    const id = uid();
    data.subjects.push({ id, name: 'General' });
    data.records[id] = {};
    data.currentSubjectId = id;
  }
  if(!data.currentSubjectId || !data.subjects.find(s => s.id === data.currentSubjectId)){
    data.currentSubjectId = data.subjects[0].id;
  }
  data.subjects.forEach(s => { if(!data.records[s.id]) data.records[s.id] = {}; });

  return data;
}
function saveData(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

let data = loadData();
let currentDate = todayStr();

function todayStr(){
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function fmtDate(str){
  const [y,m,d] = str.split('-').map(Number);
  const dt = new Date(y, m-1, d);
  return dt.toLocaleDateString('en-US', { weekday:'short', month:'short', day:'numeric', year:'numeric' });
}

function uid(){ return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ---- elements ----
const rosterEl = document.getElementById('roster');
const summaryEl = document.getElementById('summary');
const datePicker = document.getElementById('datePicker');
const classNameInput = document.getElementById('className');
const newStudentInput = document.getElementById('newStudentName');
const subjectSelect = document.getElementById('subjectSelect');
const newSubjectInput = document.getElementById('newSubjectName');

classNameInput.value = data.className || '';
datePicker.value = currentDate;

classNameInput.addEventListener('input', () => {
  data.className = classNameInput.value;
  saveData();
});

// ---- subjects ----
function currentRecordsForSubject(){
  if(!data.records[data.currentSubjectId]) data.records[data.currentSubjectId] = {};
  return data.records[data.currentSubjectId];
}

function renderSubjects(){
  subjectSelect.innerHTML = data.subjects.map(s =>
    `<option value="${s.id}" ${s.id === data.currentSubjectId ? 'selected' : ''}>${escapeHtml(s.name)}</option>`
  ).join('');
}

subjectSelect.addEventListener('change', () => {
  data.currentSubjectId = subjectSelect.value;
  saveData();
  render();
});

document.getElementById('addSubjectBtn').addEventListener('click', addSubject);
newSubjectInput.addEventListener('keydown', e => { if(e.key === 'Enter') addSubject(); });

function addSubject(){
  const name = newSubjectInput.value.trim();
  if(!name) return;
  const id = uid();
  data.subjects.push({ id, name });
  data.records[id] = {};
  data.currentSubjectId = id;
  newSubjectInput.value = '';
  saveData();
  render();
}

document.getElementById('delSubjectBtn').addEventListener('click', () => {
  if(data.subjects.length <= 1){
    alert("You need at least one subject.");
    return;
  }
  const subj = data.subjects.find(s => s.id === data.currentSubjectId);
  if(!confirm(`Delete "${subj.name}" and all its attendance records?`)) return;
  data.subjects = data.subjects.filter(s => s.id !== data.currentSubjectId);
  delete data.records[data.currentSubjectId];
  data.currentSubjectId = data.subjects[0].id;
  saveData();
  render();
});

// ---- students ----
document.getElementById('addStudentBtn').addEventListener('click', addStudent);
newStudentInput.addEventListener('keydown', e => { if(e.key === 'Enter') addStudent(); });

function addStudent(){
  const name = newStudentInput.value.trim();
  if(!name) return;
  data.students.push({ id: uid(), name });
  newStudentInput.value = '';
  saveData();
  render();
}

function removeStudent(id){
  if(!confirm('Remove this student and their attendance history across all subjects?')) return;
  data.students = data.students.filter(s => s.id !== id);
  Object.keys(data.records).forEach(subjId => {
    Object.keys(data.records[subjId]).forEach(date => { delete data.records[subjId][date][id]; });
  });
  saveData();
  render();
}

function cycleStatus(id){
  const rec = currentRecordsForSubject();
  if(!rec[currentDate]) rec[currentDate] = {};
  const cur = rec[currentDate][id];
  if(cur === undefined) rec[currentDate][id] = 'P';
  else if(cur === 'P') rec[currentDate][id] = 'A';
  else delete rec[currentDate][id];
  saveData();
  render();
}

function statusOf(id, date){
  const rec = currentRecordsForSubject();
  return (rec[date] && rec[date][id]) || null;
}

function attendancePct(id){
  const rec = currentRecordsForSubject();
  let present = 0, total = 0;
  Object.values(rec).forEach(dayRec => {
    if(dayRec[id] === 'P'){ present++; total++; }
    else if(dayRec[id] === 'A'){ total++; }
  });
  if(total === 0) return null;
  return Math.round((present/total)*100);
}

// ---- date nav ----
function setDate(dateStr){
  currentDate = dateStr;
  datePicker.value = dateStr;
  render();
}

document.getElementById('prevDay').addEventListener('click', () => {
  const d = new Date(currentDate);
  d.setDate(d.getDate()-1);
  setDate(d.toISOString().slice(0,10));
});
document.getElementById('nextDay').addEventListener('click', () => {
  const d = new Date(currentDate);
  d.setDate(d.getDate()+1);
  setDate(d.toISOString().slice(0,10));
});
document.getElementById('jumpToday').addEventListener('click', () => setDate(todayStr()));
datePicker.addEventListener('change', () => setDate(datePicker.value));

// ---- render ----
function render(){
  renderSubjects();

  if(data.students.length === 0){
    rosterEl.innerHTML = '<div class="empty">No students yet — add your first name above.</div>';
  } else {
    rosterEl.innerHTML = data.students.map((s, i) => {
      const status = statusOf(s.id, currentDate);
      const pct = attendancePct(s.id);
      const btnClass = status === 'P' ? 'present' : status === 'A' ? 'absent' : '';
      const btnLabel = status === 'P' ? 'Present' : status === 'A' ? 'Absent' : 'Mark';
      return `
        <div class="row">
          <div class="roll">${String(i+1).padStart(2,'0')}</div>
          <div class="name">${escapeHtml(s.name)}</div>
          <div class="pct">${pct === null ? 'no record yet' : '<b>'+pct+'%</b> in this subject'}</div>
          <div class="row-actions">
            <button class="stamp-btn ${btnClass}" onclick="cycleStatus('${s.id}')">${btnLabel}</button>
            <button class="del-btn" onclick="removeStudent('${s.id}')" title="Remove student">✕</button>
          </div>
        </div>`;
    }).join('');
  }

  // summary for current date + subject
  const rec = currentRecordsForSubject()[currentDate] || {};
  const total = data.students.length;
  const present = data.students.filter(s => rec[s.id] === 'P').length;
  const absent = data.students.filter(s => rec[s.id] === 'A').length;
  const marked = present + absent;
  const subj = data.subjects.find(s => s.id === data.currentSubjectId);

  summaryEl.innerHTML = `
    <div class="cell present"><span class="num">${present}</span><span class="lbl">Present</span></div>
    <div class="cell absent"><span class="num">${absent}</span><span class="lbl">Absent</span></div>
    <div class="cell marked"><span class="num">${marked}/${total}</span><span class="lbl">Marked · ${escapeHtml(subj ? subj.name : '')} · ${fmtDate(currentDate)}</span></div>
  `;
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

render();