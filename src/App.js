/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import {
  Check, Trash2, Plus, Clock, BookOpen, Calendar, X, Users,
  ChevronLeft, LogOut, Sparkles, Send, MousePointer2, Merge, Split,
  Palette, AlertCircle, Key, Settings, ChevronRight, UserPlus, Link as LinkIcon
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDyaqBB-JmsCK4kyzU_uA-4CFmQTi45fAo",
  authDomain: "ai-term-scheduler.firebaseapp.com",
  projectId: "ai-term-scheduler",
  storageBucket: "ai-term-scheduler.firebasestorage.app",
  messagingSenderId: "281370426656",
  appId: "1:281370426656:web:94dfa3550edb3db756eb45",
  measurementId: "G-67V0K5F5KL"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const parseTSV = (text) => {
  let rows = [], cols = [], curr = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') { curr += '"'; i++; } else { inQuotes = !inQuotes; }
    } else if (char === '\t' && !inQuotes) { cols.push(curr); curr = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      cols.push(curr); rows.push(cols); cols = []; curr = '';
    } else { curr += char; }
  }
  if (curr !== '' || cols.length > 0) { cols.push(curr); rows.push(cols); }
  if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") rows.pop();
  return rows;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('LOADING');
  const [role, setRole] = useState('');
  const [studentName, setStudentName] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [globalAiKey, setGlobalAiKey] = useState('');
  const [showGlobalKeyInput, setShowGlobalKeyInput] = useState(false);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false); 
  const [activeTab, setActiveTab] = useState('WEEKLY');
  const [showColorModal, setShowColorModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false); 
  const [studentToDelete, setStudentToDelete] = useState(null); 
  const [copyFeedback, setCopyFeedback] = useState(null);
  const [aiFeedback, setAiFeedback] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  const generateTimeSlots = () => {
    const slots = []; let idCounter = 1;
    for (let hour = 8; hour < 24; hour++) {
      for (let min = 0; min < 60; min += 30) {
        slots.push({
          id: idCounter++, time: `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`,
          mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '',
          mon_span: 1, mon_hidden: false, tue_span: 1, tue_hidden: false,
          wed_span: 1, wed_hidden: false, thu_span: 1, thu_hidden: false,
          fri_span: 1, fri_hidden: false, sat_span: 1, sat_hidden: false, sun_span: 1, sun_hidden: false,
        });
      }
    }
    return slots;
  };

  const repairTimetable = (tt) => {
    const defaultSlots = generateTimeSlots();
    if (!Array.isArray(tt) || tt.length === 0) return defaultSlots;
    let repaired = defaultSlots.map((def, idx) => {
      const loaded = tt.find(r => r.id === def.id) || tt[idx] || {};
      const merged = { ...def, ...loaded, id: def.id, time: def.time };
      DAYS.forEach(day => { merged[day] = merged[day] || ''; merged[`${day}_span`] = Number(merged[`${day}_span`]) || 1; merged[`${day}_hidden`] = Boolean(merged[`${day}_hidden`]); });
      return merged;
    });
    DAYS.forEach(day => {
      let skipUntil = 0;
      for (let i = 0; i < 32; i++) {
        if (i < skipUntil) { repaired[i][`${day}_hidden`] = true; repaired[i][`${day}_span`] = 1; } 
        else {
          repaired[i][`${day}_hidden`] = false; let span = repaired[i][`${day}_span`];
          if (span < 1) span = 1; if (i + span > 32) span = 32 - i; 
          repaired[i][`${day}_span`] = span; skipUntil = i + span;
        }
      }
    });
    return repaired;
  };

  const [timetable, setTimetable] = useState(generateTimeSlots());
  const [todos, setTodos] = useState([]);
  const [dDay, setDDay] = useState(null);
  const [dDayInput, setDDayInput] = useState({ title: '', date: '' });
  const [yearlyPlan, setYearlyPlan] = useState(Array(12).fill(''));
  const [termScheduler, setTermScheduler] = useState({ cells: {}, status: {}, textbooks: {}, subjects: [], topNotes: {}, checks: {} });
  const [currentDate, setCurrentDate] = useState(new Date(2026, 1, 2)); 
  const [colorRules, setColorRules] = useState([]);
  const [newColorRule, setNewColorRule] = useState({ keyword: '', color: '#bfdbfe' });
  const [studentList, setStudentList] = useState([]);
  const [editingCell, setEditingCell] = useState(null); 

  // =========================================================================
  // 💡 선택 상태 (주간 / 월간)
  // =========================================================================
  const isDragging = useRef(false);
  const [selection, setSelection] = useState({ startDay: null, endDay: null, startId: null, endId: null });
  const [monthlySelection, setMonthlySelection] = useState({ r1: null, c1: null, r2: null, c2: null });
  const isMonthlyDragging = useRef(false);

  // =========================================================================
  // 💡 Undo / Redo 히스토리 시스템
  // =========================================================================
  const historyRef = useRef({ past: [], future: [] });
  const currentStateRef = useRef({ timetable, termScheduler, yearlyPlan });
  const focusSnapshotRef = useRef(null);
  const historyLoaded = useRef(false);

  // =========================================================================
  // 💡 학생별 탭/날짜 환경설정 저장 (LocalStorage) 및 학생 접속 로직
  // =========================================================================
  const openStudentPlanner = (studentId, newRole) => {
    let t = 'WEEKLY', d = new Date(2026, 1, 2);
    try {
      const saved = JSON.parse(localStorage.getItem('planner_student_prefs') || '{}');
      if (saved[studentId]) {
        if (saved[studentId].tab) t = saved[studentId].tab;
        if (saved[studentId].currentDate) {
          const parsedDate = new Date(saved[studentId].currentDate);
          if (!isNaN(parsedDate)) d = parsedDate;
        }
      }
    } catch (e) {}
    
    setActiveTab(t);
    setCurrentDate(d);
    
    // 학생 변경 시 선택 상태 및 편집 모드, 히스토리(Undo/Redo 꼬임 방지) 모두 리셋
    setEditingCell(null);
    setSelection({ startDay: null, endDay: null, startId: null, endId: null });
    setMonthlySelection({ r1: null, c1: null, r2: null, c2: null });
    historyRef.current = { past: [], future: [] };
    historyLoaded.current = false;
    
    setCurrentDocId(studentId);
    if (newRole) setRole(newRole);
    setView('PLANNER');
  };

  // 활성화된 탭이나 날짜가 변경될 때마다 로컬 스토리지에 캐싱
  useEffect(() => {
    if (view === 'PLANNER' && currentDocId) {
      try {
        const saved = JSON.parse(localStorage.getItem('planner_student_prefs') || '{}');
        if (!saved[currentDocId]) saved[currentDocId] = {};
        saved[currentDocId].tab = activeTab;
        saved[currentDocId].currentDate = currentDate.toISOString();
        localStorage.setItem('planner_student_prefs', JSON.stringify(saved));
      } catch (e) {}
    }
  }, [activeTab, currentDate, currentDocId, view]);

  // =========================================================================

  useEffect(() => { currentStateRef.current = { timetable, termScheduler, yearlyPlan }; }, [timetable, termScheduler, yearlyPlan]);

  const saveToHistory = () => {
    const snap = JSON.stringify(currentStateRef.current);
    if (historyRef.current.past.length > 0 && historyRef.current.past[historyRef.current.past.length - 1] === snap) return;
    historyRef.current.past.push(snap);
    if (historyRef.current.past.length > 50) historyRef.current.past.shift();
    historyRef.current.future = [];
  };

  const handleUndo = () => {
    if (historyRef.current.past.length === 0) return;
    historyRef.current.future.push(JSON.stringify(currentStateRef.current));
    const prevSnap = JSON.parse(historyRef.current.past.pop());
    setTimetable(prevSnap.timetable); setTermScheduler(prevSnap.termScheduler); setYearlyPlan(prevSnap.yearlyPlan);
    setSelection({ startDay: null, endDay: null, startId: null, endId: null }); setMonthlySelection({ r1: null, c1: null, r2: null, c2: null });
    setEditingCell(null); setAiFeedback('↩️ 실행 취소'); setTimeout(() => setAiFeedback(''), 1000);
  };

  const handleRedo = () => {
    if (historyRef.current.future.length === 0) return;
    historyRef.current.past.push(JSON.stringify(currentStateRef.current));
    const nextSnap = JSON.parse(historyRef.current.future.pop());
    setTimetable(nextSnap.timetable); setTermScheduler(nextSnap.termScheduler); setYearlyPlan(nextSnap.yearlyPlan);
    setSelection({ startDay: null, endDay: null, startId: null, endId: null }); setMonthlySelection({ r1: null, c1: null, r2: null, c2: null });
    setEditingCell(null); setAiFeedback('↪️ 다시 실행'); setTimeout(() => setAiFeedback(''), 1000);
  };

  const handleFocus = (e) => {
    if(e && e.target) autoResize(e);
    focusSnapshotRef.current = JSON.stringify(currentStateRef.current);
  };

  const handleBlur = () => {
    if (focusSnapshotRef.current) {
      const currentSnap = JSON.stringify(currentStateRef.current);
      if (focusSnapshotRef.current !== currentSnap) {
        historyRef.current.past.push(focusSnapshotRef.current);
        if (historyRef.current.past.length > 50) historyRef.current.past.shift();
        historyRef.current.future = [];
      }
    }
    focusSnapshotRef.current = null; setEditingCell(null);
  };

  // =========================================================================

  const getSelectionBounds = () => {
    if (!selection.startDay || !selection.endDay || !selection.startId || !selection.endId) return null;
    const d1 = DAYS.indexOf(selection.startDay); const d2 = DAYS.indexOf(selection.endDay);
    return { minDayIdx: Math.min(d1, d2), maxDayIdx: Math.max(d1, d2), minId: Math.min(selection.startId, selection.endId), maxId: Math.max(selection.startId, selection.endId) };
  };

  const getMonthlyBounds = () => {
    if (monthlySelection.r1 === null || monthlySelection.c1 === null) return null;
    return { minR: Math.min(monthlySelection.r1, monthlySelection.r2), maxR: Math.max(monthlySelection.r1, monthlySelection.r2), minC: Math.min(monthlySelection.c1, monthlySelection.c2), maxC: Math.max(monthlySelection.c1, monthlySelection.c2) };
  };

  const getSchedulerDates = () => {
    const days = []; const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
    for (let i = 0; i < 28; i++) {
      const dateObj = new Date(currentDate); dateObj.setDate(currentDate.getDate() + i);
      days.push({ full: `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`, label: `${dateObj.getMonth() + 1}/${dateObj.getDate()}`, day: dayLabels[dateObj.getDay()], isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6, isSat: dateObj.getDay() === 6 });
    }
    return days;
  };
  const allDates = getSchedulerDates();

  const autoResize = (e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; };

  useEffect(() => {
    const timer = setTimeout(() => { document.querySelectorAll('textarea').forEach(el => { el.style.height = 'auto'; if (el.scrollHeight > 0) el.style.height = el.scrollHeight + 'px'; }); }, 100);
    return () => clearTimeout(timer);
  }, [activeTab, view, currentDocId, loading, timetable]);

  const calculateDDay = (targetDate) => {
    if (!targetDate) return '';
    const today = new Date(); today.setHours(0, 0, 0, 0); const target = new Date(targetDate); target.setHours(0, 0, 0, 0);
    const diff = target.getTime() - today.getTime(); const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'D-Day'; return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
        const params = new URLSearchParams(window.location.search); const sid = params.get('sid');
        if (sid) { 
          openStudentPlanner(sid, 'student'); 
        } 
        else {
          const savedRole = localStorage.getItem('planner_role'); const savedName = localStorage.getItem('planner_name');
          if (savedRole === 'student' && savedName) { 
            setStudentName(savedName); 
            openStudentPlanner(savedName, 'student'); 
          } 
          else if (savedRole === 'teacher') { setRole('teacher'); setView('TEACHER_DASHBOARD'); } 
          else { setView('LANDING'); }
        }
        onSnapshot(doc(db, 'settings', 'global'), (snap) => { if (snap.exists()) setGlobalAiKey(snap.data().aiKey || ''); });
      } catch (error) {}
    };
    initAuth(); onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !currentDocId || (view !== 'PLANNER' && view !== 'TEACHER_DASHBOARD')) return;
    setLoading(true);
    const unsubscribe = onSnapshot(doc(db, 'planners', currentDocId), (docSnap) => {
      try {
        if (docSnap.metadata?.hasPendingWrites) return;
        if (docSnap.exists()) {
          setIsNotFound(false); const data = docSnap.data();
          setTimetable(Array.isArray(data.timetable) ? repairTimetable(data.timetable) : generateTimeSlots());
          setTermScheduler({ subjects: [], cells: {}, status: {}, textbooks: {}, topNotes: {}, checks: {}, ...(data.termScheduler || {}) });
          setTodos(data.todos || []); setDDay(data.dDay || null); setYearlyPlan(data.yearlyPlan || Array(12).fill('')); setColorRules(data.colorRules || []); setStudentName(data.studentName || '');
          if (!historyLoaded.current) { historyRef.current = { past: [], future: [] }; historyLoaded.current = true; }
        } else { setIsNotFound(true); }
      } catch (e) {} finally { setLoading(false); }
    });
    return () => unsubscribe();
  }, [user, currentDocId, view]);

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return; }
    if (!user || !currentDocId || view !== 'PLANNER' || loading || isNotFound) return;
    const saveData = async () => {
      const isActuallyName = studentName && studentName !== currentDocId;
      await setDoc(doc(db, 'planners', currentDocId), { timetable, todos, dDay, yearlyPlan, termScheduler, colorRules, lastUpdated: new Date().toISOString(), ...(isActuallyName && { studentName }) }, { merge: true });
    };
    const timeoutId = setTimeout(saveData, 1000);
    return () => clearTimeout(timeoutId);
  }, [timetable, todos, dDay, yearlyPlan, termScheduler, colorRules, user, currentDocId, view, loading, studentName, isNotFound]);

  useEffect(() => {
    if (!user || view !== 'TEACHER_DASHBOARD') return;
    const unsubscribe = onSnapshot(collection(db, 'planners'), (snapshot) => {
      const students = []; snapshot.forEach((doc) => students.push({ id: doc.id, ...doc.data() }));
      students.sort((a, b) => (a.studentName || "").localeCompare(b.studentName || "", 'ko')); setStudentList(students);
    });
    return () => unsubscribe();
  }, [user, view]);

  // =========================================================================
  // 💡 글로벌 단축키 (Copy, Paste, Delete, Undo, Redo)
  // =========================================================================
  useEffect(() => {
    const handleCopy = (e) => {
      if (view !== 'PLANNER') return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT') return;
      if (activeTag === 'TEXTAREA' && editingCell !== null) return;
      if (activeTab === 'YEARLY') return;

      let tsv = "";
      if (activeTab === 'WEEKLY' && selection.startDay) {
        const bounds = getSelectionBounds(); if (!bounds) return;
        let copiedData = [];
        for (let id = bounds.minId; id <= bounds.maxId; id++) {
          const row = timetable[id - 1]; if (!row) continue;
          let rowData = []; let rowCopy = [];
          for (let d = bounds.minDayIdx; d <= bounds.maxDayIdx; d++) {
            const day = DAYS[d]; const val = row[`${day}_hidden`] ? "" : (row[day] || "");
            rowData.push(val.includes('\n') || val.includes('\t') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val);
            rowCopy.push({ text: row[day] || '', span: row[`${day}_span`] || 1, hidden: row[`${day}_hidden`] || false });
          }
          tsv += rowData.join("\t") + (id < bounds.maxId ? "\n" : ""); copiedData.push(rowCopy);
        }
        e.clipboardData.setData('application/json', JSON.stringify({ tab: 'WEEKLY', data: copiedData }));
      } else if (activeTab === 'MONTHLY' && monthlySelection.r1 !== null) {
        const mb = getMonthlyBounds(); if (!mb) return;
        let copiedData = [];
        for (let r = mb.minR; r <= mb.maxR; r++) {
          const sub = r === 0 ? null : termScheduler.subjects[r - 1];
          let rowData = []; let rowCopy = [];
          for (let c = mb.minC; c <= mb.maxC; c++) {
             const date = allDates[c].full; const val = r === 0 ? (termScheduler.topNotes[date] || '') : (termScheduler.cells[`${sub}-${date}`] || '');
             rowData.push(val.includes('\n') || val.includes('\t') || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val);
             rowCopy.push({ text: val });
          }
          tsv += rowData.join("\t") + (r < mb.maxR ? "\n" : ""); copiedData.push(rowCopy);
        }
        e.clipboardData.setData('application/json', JSON.stringify({ tab: 'MONTHLY', data: copiedData }));
      }
      if (tsv) { e.clipboardData.setData('text/plain', tsv); e.preventDefault(); setAiFeedback('✅ 복사 완료'); setTimeout(() => setAiFeedback(''), 1500); }
    };

    const handlePaste = (e) => {
      if (view !== 'PLANNER') return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT') return;
      if (activeTag === 'TEXTAREA' && editingCell !== null) return;
      if (activeTab === 'YEARLY') return;

      const pastedText = e.clipboardData?.getData('text/plain') || window.clipboardData?.getData('text/plain');
      const pastedJsonStr = e.clipboardData?.getData('application/json') || window.clipboardData?.getData('application/json');
      if (!pastedText && !pastedJsonStr) return;

      let parsedData = null; let pastedType = null;
      if (pastedJsonStr) { try { const obj = JSON.parse(pastedJsonStr); if (obj.data) { parsedData = obj.data; pastedType = obj.tab; } } catch(err) {} }

      if (activeTab === 'WEEKLY' && selection.startDay) {
        const bounds = getSelectionBounds(); if (!bounds) return;
        const isSingleCell = bounds.minId === bounds.maxId && bounds.minDayIdx === bounds.maxDayIdx;
        
        e.preventDefault(); saveToHistory();
        setTimetable(prev => {
          let newTt = [...prev]; const startRowIdx = bounds.minId - 1;
          if (parsedData && pastedType === 'WEEKLY') {
            for (let c = 0; c < parsedData[0].length; c++) {
              const day = DAYS[bounds.minDayIdx + c]; if (!day) continue;
              for (let i = 0; i < startRowIdx; i++) { const priorSpan = newTt[i][`${day}_span`]; if (priorSpan > 1 && i + priorSpan > startRowIdx) newTt[i] = { ...newTt[i], [`${day}_span`]: startRowIdx - i }; }
            }
            parsedData.forEach((rowCopy, rIdx) => {
              const ttRowIdx = startRowIdx + rIdx; if (ttRowIdx > 31) return;
              rowCopy.forEach((cellCopy, cIdx) => { const day = DAYS[bounds.minDayIdx + cIdx]; if (day) newTt[ttRowIdx] = { ...newTt[ttRowIdx], [day]: cellCopy.text, [`${day}_span`]: cellCopy.span, [`${day}_hidden`]: cellCopy.hidden }; });
            });
          } else {
            const rows = parseTSV(pastedText);
            if (rows.length === 1 && rows[0].length === 1 && !isSingleCell) {
              for (let id = bounds.minId; id <= bounds.maxId; id++) { for (let d = bounds.minDayIdx; d <= bounds.maxDayIdx; d++) { if (!newTt[id - 1][`${DAYS[d]}_hidden`]) newTt[id - 1] = { ...newTt[id - 1], [DAYS[d]]: rows[0][0] }; } }
            } else {
              rows.forEach((rowStrArr, i) => {
                const rIdx = startRowIdx + i; if (rIdx > 31) return;
                rowStrArr.forEach((colStr, j) => { const cIdx = bounds.minDayIdx + j; if (cIdx < 7 && !newTt[rIdx][`${DAYS[cIdx]}_hidden`]) newTt[rIdx] = { ...newTt[rIdx], [DAYS[cIdx]]: colStr }; });
              });
            }
          }
          return repairTimetable(newTt);
        });
        setAiFeedback('✅ 붙여넣기 완료'); setTimeout(() => setAiFeedback(''), 1500);

      } else if (activeTab === 'MONTHLY' && monthlySelection.r1 !== null) {
        const mb = getMonthlyBounds(); if (!mb) return;
        const isSingleCell = mb.minR === mb.maxR && mb.minC === mb.maxC;
        
        e.preventDefault(); saveToHistory();
        setTermScheduler(prev => {
          let newCells = { ...prev.cells }; let newTopNotes = { ...prev.topNotes };
          if (parsedData && pastedType === 'MONTHLY') {
            parsedData.forEach((rowCopy, rOffset) => {
              const targetRow = mb.minR + rOffset; if (targetRow > prev.subjects.length) return;
              const sub = targetRow === 0 ? null : prev.subjects[targetRow - 1];
              rowCopy.forEach((cellCopy, cOffset) => {
                const targetCol = mb.minC + cOffset; if (targetCol >= 28) return;
                const date = allDates[targetCol].full; if (targetRow === 0) newTopNotes[date] = cellCopy.text; else newCells[`${sub}-${date}`] = cellCopy.text;
              });
            });
          } else {
            const rows = parseTSV(pastedText);
            if (rows.length === 1 && rows[0].length === 1 && !isSingleCell) {
              for (let r = mb.minR; r <= mb.maxR; r++) {
                const sub = r === 0 ? null : prev.subjects[r - 1];
                for (let c = mb.minC; c <= mb.maxC; c++) { const date = allDates[c].full; if (r === 0) newTopNotes[date] = rows[0][0]; else newCells[`${sub}-${date}`] = rows[0][0]; }
              }
            } else {
              rows.forEach((rowStrArr, i) => {
                const rIdx = mb.minR + i; if (rIdx > prev.subjects.length) return;
                const sub = rIdx === 0 ? null : prev.subjects[rIdx - 1];
                rowStrArr.forEach((colStr, j) => {
                  const cIdx = mb.minC + j; if (cIdx >= 28) return;
                  const date = allDates[cIdx].full; if (rIdx === 0) newTopNotes[date] = colStr; else newCells[`${sub}-${date}`] = colStr;
                });
              });
            }
          }
          return { ...prev, cells: newCells, topNotes: newTopNotes };
        });
        setAiFeedback('✅ 붙여넣기 완료'); setTimeout(() => setAiFeedback(''), 1500);
      }
    };

    const handleKeyDown = (e) => {
      if (view !== 'PLANNER') return;
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT') return;
      if (activeTag === 'TEXTAREA' && editingCell !== null) return;
      if (activeTab === 'YEARLY' && activeTag === 'TEXTAREA') return;

      const isCtrl = navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? e.metaKey : e.ctrlKey;

      if (isCtrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? handleRedo() : handleUndo(); return; }
      if (isCtrl && e.key.toLowerCase() === 'y') { e.preventDefault(); handleRedo(); return; }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (activeTab === 'WEEKLY' && selection.startDay) {
          const bounds = getSelectionBounds(); if (!bounds) return;
          e.preventDefault(); saveToHistory();
          setTimetable(prev => {
            let newTt = [...prev];
            for (let id = bounds.minId; id <= bounds.maxId; id++) { for (let d = bounds.minDayIdx; d <= bounds.maxDayIdx; d++) { if (!newTt[id - 1][`${DAYS[d]}_hidden`]) newTt[id - 1] = { ...newTt[id - 1], [DAYS[d]]: '' }; } }
            return newTt;
          });
          if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') {
            document.activeElement.value = '';
          }
        } else if (activeTab === 'MONTHLY' && monthlySelection.r1 !== null) {
          const mb = getMonthlyBounds(); if (!mb) return;
          e.preventDefault(); saveToHistory();
          setTermScheduler(prev => {
            let newCells = { ...prev.cells }; let newTopNotes = { ...prev.topNotes };
            for (let r = mb.minR; r <= mb.maxR; r++) {
              const sub = r === 0 ? null : prev.subjects[r - 1];
              for (let c = mb.minC; c <= mb.maxC; c++) { const date = allDates[c].full; if (r === 0) newTopNotes[date] = ''; else newCells[`${sub}-${date}`] = ''; }
            }
            return { ...prev, cells: newCells, topNotes: newTopNotes };
          });
        }
      }
    };

    document.addEventListener('copy', handleCopy); document.addEventListener('paste', handlePaste); document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('copy', handleCopy); document.removeEventListener('paste', handlePaste); document.removeEventListener('keydown', handleKeyDown); };
  }, [activeTab, view, selection, monthlySelection, timetable, termScheduler, editingCell]); 

  // =========================================================================

  const saveGlobalAiKey = async () => { try { await setDoc(doc(db, 'settings', 'global'), { aiKey: globalAiKey }, { merge: true }); setShowGlobalKeyInput(false); setAiFeedback('✅ 공용 API 키 저장'); setTimeout(() => setAiFeedback(''), 3000); } catch (e) {} };
  const createNewStudentSheet = async () => { const name = prompt("이름을 입력하세요."); if (!name || !name.trim()) return; const newSid = crypto.randomUUID(); setLoading(true); try { await setDoc(doc(db, 'planners', newSid), { studentName: name.trim(), timetable: generateTimeSlots(), todos: [], yearlyPlan: Array(12).fill(''), createdAt: new Date().toISOString() }); setAiFeedback(`✅ 학생 생성됨.`); setTimeout(() => setAiFeedback(''), 3000); } catch (e) {} finally { setLoading(false); } };
  const copyStudentLink = (sid) => { const el = document.createElement('textarea'); el.value = `${window.location.origin}${window.location.pathname}?sid=${sid}`; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); setCopyFeedback(sid); setTimeout(() => setCopyFeedback(null), 2000); };

  const handleMouseDown = (e, day, id) => {
    isDragging.current = true; 
    setMonthlySelection({ r1: null, c1: null, r2: null, c2: null });
    if (e.shiftKey && selection.startDay) { 
      e.preventDefault(); 
      setSelection(prev => ({ ...prev, endDay: day, endId: id })); 
    } else { 
      setSelection(prev => {
        if (prev.startDay === day && prev.endDay === day && prev.startId === id && prev.endId === id) return prev;
        return { startDay: day, endDay: day, startId: id, endId: id };
      });
    }
  };

  const handleMouseEnter = (day, id) => { 
    if (isDragging.current && activeTab === 'WEEKLY') {
      setSelection(prev => ({ ...prev, endDay: day, endId: id })); 
    }
  };

  const handleMonthlyMouseDown = (e, rIdx, cIdx) => {
    if (e.target.type === 'checkbox') return;
    isMonthlyDragging.current = true; setSelection({ startDay: null, endDay: null, startId: null, endId: null });
    if (e.shiftKey && monthlySelection.r1 !== null) { 
      e.preventDefault(); 
      setMonthlySelection(prev => ({ ...prev, r2: rIdx, c2: cIdx })); 
    } else { 
      setMonthlySelection(prev => {
        if (prev.r1 === rIdx && prev.c1 === cIdx && prev.r2 === rIdx && prev.c2 === cIdx) return prev;
        return { r1: rIdx, c1: cIdx, r2: rIdx, c2: cIdx };
      });
    }
  };

  const handleMonthlyMouseEnter = (rIdx, cIdx) => { 
    if (isMonthlyDragging.current && activeTab === 'MONTHLY') setMonthlySelection(prev => ({ ...prev, r2: rIdx, c2: cIdx })); 
  };

  const handleMouseUp = () => { isDragging.current = false; isMonthlyDragging.current = false; };
  useEffect(() => { window.addEventListener('mouseup', handleMouseUp); return () => window.removeEventListener('mouseup', handleMouseUp); }, []);

  const mergeCells = () => {
    const bounds = getSelectionBounds(); if (!bounds) return; const spanCount = bounds.maxId - bounds.minId + 1; if (spanCount <= 1) return;
    saveToHistory(); let newTt = [...timetable];
    for (let d = bounds.minDayIdx; d <= bounds.maxDayIdx; d++) {
      const day = DAYS[d];
      for (let i = 1; i <= 32; i++) {
        if (i === bounds.minId) newTt[i-1] = { ...newTt[i-1], [`${day}_span`]: spanCount, [`${day}_hidden`]: false };
        else if (i > bounds.minId && i <= bounds.maxId) newTt[i-1] = { ...newTt[i-1], [`${day}_span`]: 1, [`${day}_hidden`]: true };
        else if (i < bounds.minId) { const pSpan = newTt[i-1][`${day}_span`]; if (pSpan > 1 && i + pSpan - 1 >= bounds.minId) newTt[i-1] = { ...newTt[i-1], [`${day}_span`]: bounds.minId - i }; }
      }
    }
    setTimetable(repairTimetable(newTt)); setSelection({ startDay: null, endDay: null, startId: null, endId: null });
  };

  const unmergeCells = () => {
    const bounds = getSelectionBounds(); if (!bounds) return; saveToHistory(); let newTt = [...timetable];
    for (let d = bounds.minDayIdx; d <= bounds.maxDayIdx; d++) {
      const day = DAYS[d];
      for (let i = 0; i < 32; i++) {
        const row = newTt[i];
        if (!row[`${day}_hidden`]) {
          const span = row[`${day}_span`] || 1; if (row.id <= bounds.maxId && row.id + span - 1 >= bounds.minId) { for (let j = 0; j < span; j++) { if (i + j < 32) newTt[i + j] = { ...newTt[i + j], [`${day}_span`]: 1, [`${day}_hidden`]: false }; } }
        }
      }
    }
    setTimetable(repairTimetable(newTt)); setSelection({ startDay: null, endDay: null, startId: null, endId: null });
  };

  const executeResetTimetable = () => {
    saveToHistory();
    if (activeTab === 'WEEKLY') setTimetable(generateTimeSlots()); else if (activeTab === 'MONTHLY') setTermScheduler({ subjects: [], cells: {}, status: {}, textbooks: {}, topNotes: {}, checks: {} });
    setSelection({ startDay: null, endDay: null, startId: null, endId: null }); setMonthlySelection({ r1: null, c1: null, r2: null, c2: null }); setShowResetConfirm(false); 
  };

  const addColorRule = () => { if (!newColorRule.keyword.trim()) return; setColorRules([...colorRules, { ...newColorRule, id: Date.now() }]); setNewColorRule({ ...newColorRule, keyword: '' }); };
  const removeColorRule = (id) => setColorRules(colorRules.filter((rule) => rule.id !== id));
  const getCellColor = (text) => { if (!text || typeof text !== 'string') return null; const rule = colorRules.find((r) => text.includes(r.keyword)); return rule ? rule.color : null; };

  const handlePrev4Weeks = () => setCurrentDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 28); return d; });
  const handleNext4Weeks = () => setCurrentDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 28); return d; });

  const handleTermCellChange = (subject, dateKey, value) => setTermScheduler(prev => ({ ...prev, cells: { ...prev.cells, [`${subject}-${dateKey}`]: value } }));
  const handleTermCheckToggle = (subject, dateKey, index) => { saveToHistory(); setTermScheduler(prev => ({ ...prev, checks: { ...prev.checks, [`${subject}-${dateKey}-${index}`]: !prev.checks[`${subject}-${dateKey}-${index}`] } })); };
  const handleTopNoteChange = (dateKey, value) => setTermScheduler(prev => ({ ...prev, topNotes: { ...prev.topNotes, [dateKey]: value } }));
  const handleTermTextbookChange = (subject, value) => setTermScheduler(prev => ({ ...prev, textbooks: { ...prev.textbooks, [subject]: value } }));
  const addSubjectRow = (name) => { if (!name || termScheduler.subjects.includes(name)) return; saveToHistory(); setTermScheduler(prev => ({ ...prev, subjects: [...prev.subjects, name] })); };
  const removeSubjectRow = (name) => { saveToHistory(); setTermScheduler(prev => ({ ...prev, subjects: prev.subjects.filter(s => s !== name) })); };

  const callGeminiAPI = async (systemPrompt, userText = "", retries = 5) => {
    if (!globalAiKey) { setAiFeedback('⚠️ API 키 없음'); return null; }
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt + '\n' + userText }] }] }) });
        const result = await response.json();
        if (result.error) { if (result.error.code === 429 && i < retries - 1) { await new Promise(r => setTimeout(r, Math.pow(2, i) * 2000)); continue; } throw new Error(result.error.message); }
        return result.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (error) { if (i === retries - 1) { setAiFeedback(`❌ 오류`); return null; } }
    } return null;
  };

  const handleAiSubmit = async (e) => {
    e.preventDefault(); if (!aiPrompt.trim()) return; setIsAiProcessing(true); setAiFeedback('AI 조교가 처리 중입니다...');
    const sysPrompts = { WEEKLY: `당신은 플래너 전문가. { "type": "UPDATE_TIMETABLE", "updates": [{ "day": "mon|tue|wed|thu|fri|sat|sun", "startTime": "HH:MM", "endTime": "HH:MM", "content": "내용" }] }`, MONTHLY: `데이터 채우기. 과목: [${termScheduler.subjects.join(', ')}]. { "type": "UPDATE_TERM_SCHEDULER", "cells": [{ "subject": "과목명", "date": "YYYY-MM-DD", "content": "내용" }] }`, YEARLY: `연간 전문가. { "type": "UPDATE_YEARLY", "plans": ["1월", ..., "12월"] }` };
    const text = await callGeminiAPI(sysPrompts[activeTab], `요청: "${aiPrompt}" / 날짜: ${JSON.stringify(allDates.map(d=>d.full))}`);
    if (text) {
      try {
        const aiResponse = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim()); saveToHistory();
        if (aiResponse.type === 'UPDATE_TIMETABLE' && activeTab === 'WEEKLY') {
          let newTt = [...timetable];
          aiResponse.updates.forEach((update) => {
            const sIdx = ((h, m) => (h - 8) * 2 + (m === 30 ? 1 : 0))(...update.startTime.split(':').map(Number)); const eIdx = ((h, m) => (h - 8) * 2 + (m === 30 ? 1 : 0))(...update.endTime.split(':').map(Number)) - 1;
            if (sIdx >= 0 && eIdx <= 31 && sIdx <= eIdx) {
              const sId = sIdx + 1, eId = eIdx + 1, sCount = eId - sId + 1;
              for (let i = 1; i <= 32; i++) {
                if (i === sId) newTt[i-1] = { ...newTt[i-1], [`${update.day}_span`]: sCount, [`${update.day}_hidden`]: false, [update.day]: update.content };
                else if (i > sId && i <= eId) newTt[i-1] = { ...newTt[i-1], [`${update.day}_span`]: 1, [`${update.day}_hidden`]: true };
                else if (i < sId && newTt[i-1][`${update.day}_span`] > 1 && i + newTt[i-1][`${update.day}_span`] - 1 >= sId) newTt[i-1] = { ...newTt[i-1], [`${update.day}_span`]: sId - i };
              }
            }
          });
          setTimetable(repairTimetable(newTt)); setAiFeedback('✅ 주간 반영 완료!');
        } else if (aiResponse.type === 'UPDATE_TERM_SCHEDULER' && activeTab === 'MONTHLY') {
          let newCells = { ...termScheduler.cells };
          aiResponse.cells?.forEach(c => { if(termScheduler.subjects.includes(c.subject)) newCells[`${c.subject}-${c.date}`] = newCells[`${c.subject}-${c.date}`] ? `${newCells[`${c.subject}-${c.date}`]}\n${c.content}` : c.content; });
          setTermScheduler(prev => ({ ...prev, cells: newCells })); setAiFeedback('✅ 월간 추가 완료!');
        } else if (aiResponse.type === 'UPDATE_YEARLY' && activeTab === 'YEARLY') { setYearlyPlan(aiResponse.plans); setAiFeedback('✅ 연간 반영 완료!'); }
      } catch (e) { setAiFeedback('❌ 해석 실패.'); }
    }
    setAiPrompt(''); setIsAiProcessing(false); setTimeout(() => { if (!text) setShowAiModal(false); setAiFeedback(''); }, 3000);
  };

  const handleTeacherLogin = (e) => { e.preventDefault(); if (teacherPassword === '551000') { localStorage.setItem('planner_role', 'teacher'); setRole('teacher'); setView('TEACHER_DASHBOARD'); setTeacherPassword(''); } else setErrorMsg('불일치'); };
  const handleLogout = () => setShowLogoutConfirm(true);
  const executeLogout = () => { localStorage.removeItem('planner_role'); localStorage.removeItem('planner_name'); setView('LANDING'); setRole(''); setStudentName(''); setCurrentDocId(null); setShowLogoutConfirm(false); window.history.replaceState({}, '', window.location.pathname); };
  const handleTimetableChange = (id, day, value) => setTimetable((prev) => prev.map((row) => row.id === id ? { ...row, [day]: value } : row));
  const handleYearlyChange = (index, value) => { const newPlan = [...yearlyPlan]; newPlan[index] = value; setYearlyPlan(newPlan); };
  const handleDeleteStudent = (e, studentId) => { e.stopPropagation(); setStudentToDelete(studentId); };
  
  const executeDeleteStudent = async () => { 
    if (!studentToDelete) return; 
    try { 
      await deleteDoc(doc(db, 'planners', studentToDelete)); 
      try {
        const saved = JSON.parse(localStorage.getItem('planner_student_prefs') || '{}');
        delete saved[studentToDelete];
        localStorage.setItem('planner_student_prefs', JSON.stringify(saved));
      } catch (e) {}
      setStudentToDelete(null); 
    } catch (e) {} 
  };

  if (view === 'LOADING') return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50"><div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div></div>;
  if (view === 'PLANNER_DELETED_BLANK') return <div className="min-h-screen bg-slate-50" />;
  if (isNotFound && view === 'PLANNER') return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6"><h1 className="text-2xl font-black mb-2">삭제된 플래너입니다.</h1><button onClick={() => setView('PLANNER_DELETED_BLANK')} className="px-8 py-3 bg-slate-800 text-white rounded-xl">확인</button></div>;

  const wBounds = getSelectionBounds(); const isWMulti = wBounds && (wBounds.minId !== wBounds.maxId || wBounds.minDayIdx !== wBounds.maxDayIdx);
  const mb = getMonthlyBounds();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 transition-colors duration-300">
      <div className="w-full mx-auto">
        {view === 'LANDING' && (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-center">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 transform transition-all hover:scale-[1.01]">
              <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-10 text-center relative overflow-hidden">
                <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner"><BookOpen className="w-10 h-10 text-white" /></div>
                <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">스마트 학습 플래너</h1>
                <p className="text-indigo-100 font-medium">개별 맞춤형 스케줄 시스템</p>
              </div>
              <div className="p-8 space-y-4 bg-white text-center">
                <p className="text-slate-500 text-sm mb-4">전달받은 고유 링크로 다시 접속해주세요.</p>
                <button onClick={() => setView('TEACHER_LOGIN')} className="w-full p-5 rounded-2xl border-2 border-slate-100 hover:border-slate-500 hover:bg-slate-50 flex items-center gap-5 group transition-all shadow-sm">
                  <div className="p-4 bg-slate-100 text-slate-600 rounded-xl group-hover:bg-slate-700 group-hover:text-white transition-colors"><Users size={24} /></div>
                  <div className="text-left"><div className="font-extrabold text-lg text-slate-800">관리자 로그인</div><div className="text-sm text-slate-500 mt-1">통합 대시보드 관리</div></div>
                </button>
              </div>
            </div>
          </div>
        )}

        {view === 'TEACHER_LOGIN' && (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-center">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
              <button onClick={() => setView('LANDING')} className="text-slate-400 mb-8 flex items-center gap-2 text-sm font-medium hover:text-slate-700 transition-colors bg-slate-50 px-4 py-2 rounded-lg w-fit"><ChevronLeft className="w-4 h-4" /> 뒤로가기</button>
              <div className="mb-8"><h2 className="text-3xl font-extrabold text-slate-800 mb-2">관리자 로그인</h2></div>
              <form onSubmit={handleTeacherLogin} className="space-y-6">
                <div className="space-y-2 text-center">
                  <label className="text-sm font-bold text-slate-700 ml-1">비밀번호</label>
                  <input type="password" value={teacherPassword} onChange={(e) => setTeacherPassword(e.target.value)} placeholder="비밀번호 입력" className="w-full p-4 border-2 border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-lg font-medium text-center" autoFocus />
                </div>
                {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2 justify-center"><AlertCircle size={16}/> {errorMsg}</div>}
                <button type="submit" className="w-full text-white p-5 rounded-2xl font-extrabold text-lg transition-all transform hover:-translate-y-1 shadow-lg bg-slate-800 hover:bg-slate-900">대시보드 접속</button>
              </form>
            </div>
          </div>
        )}

        {view === 'TEACHER_DASHBOARD' && (
          <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-center">
            <div className="max-w-6xl mx-auto">
              <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 text-center">
                <div>
                  <h1 className="text-3xl font-extrabold flex items-center gap-3 text-slate-800 mb-2"><Users className="text-indigo-600 w-8 h-8" /> 관리자 대시보드</h1>
                  <p className="text-slate-500 font-medium text-center">총 {studentList.length}명</p>
                </div>
                <div className="flex flex-wrap gap-3 mt-4 md:mt-0 justify-center">
                  <button onClick={createNewStudentSheet} className="text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"><UserPlus className="w-5 h-5" /> 새 학생 추가</button>
                  <button onClick={() => setShowGlobalKeyInput(!showGlobalKeyInput)} className="text-white bg-slate-800 hover:bg-slate-900 px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"><Settings className="w-5 h-5" /> AI 공용 키 설정</button>
                  <button onClick={handleLogout} className="text-slate-500 hover:text-red-600 hover:bg-red-50 px-5 py-3 rounded-xl font-bold flex items-center gap-2 bg-slate-100"><LogOut className="w-5 h-5" /> 로그아웃</button>
                </div>
              </header>
              {showGlobalKeyInput && (
                <div className="mb-10 p-8 bg-indigo-50 rounded-3xl border-2 border-indigo-100 animate-fade-in shadow-inner text-center">
                  <h3 className="text-lg font-black text-indigo-900 mb-4 flex items-center justify-center gap-2"><Key className="w-5 h-5"/> AI 공용 API 키 설정</h3>
                  <div className="flex flex-col md:flex-row gap-4 justify-center">
                    <input type="password" value={globalAiKey} onChange={(e) => setGlobalAiKey(e.target.value)} placeholder="Gemini API Key" className="flex-1 max-w-lg p-4 rounded-2xl border-2 border-indigo-200 outline-none focus:border-indigo-500 text-lg font-mono text-center" />
                    <button onClick={saveGlobalAiKey} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-extrabold text-lg shadow-lg">저장</button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 text-center">
                {studentList.map((student) => (
                  <div key={student.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:border-indigo-500 transition-all flex flex-col justify-between h-48 group text-center">
                    <div className="flex justify-between items-start">
                      <div onClick={() => openStudentPlanner(student.id, 'teacher')} className="cursor-pointer text-center w-full">
                        <span className="text-xl font-extrabold text-slate-800 block mb-1">{student.studentName || '이름 없음'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{student.id.substring(0, 13)}...</span>
                      </div>
                      <button onClick={(e) => handleDeleteStudent(e, student.id)} className="text-slate-300 hover:text-red-500 p-2"><Trash2 size={18} /></button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => copyStudentLink(student.id)} className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${copyFeedback === student.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{copyFeedback === student.id ? <><Check size={14}/> 복사됨</> : <><LinkIcon size={14}/> 링크 복사</>}</button>
                      <button onClick={() => openStudentPlanner(student.id, 'teacher')} className="px-4 py-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><ChevronRight size={18}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {view === 'PLANNER' && (
          <>
            <header className="px-4 py-3 shadow-sm sticky top-0 z-30 bg-white border-b border-slate-200 backdrop-blur-md">
              <div className="max-w-[98vw] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
                  <div className="flex items-center gap-3">
                    {role === 'teacher' && <button onClick={() => setView('TEACHER_DASHBOARD')} className="p-2 rounded-full hover:bg-slate-100 border border-slate-200"><ChevronLeft className="w-5 h-5" /></button>}
                    <div className="p-2.5 rounded-xl shadow-inner bg-gradient-to-br from-indigo-500 to-indigo-700"><BookOpen className="text-white w-5 h-5" /></div>
                    <div className="font-extrabold text-xl tracking-tight">{studentName} 플래너</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                  <div className="flex p-1.5 rounded-xl shadow-inner bg-slate-100 flex-1 md:flex-none justify-center">
                    {['WEEKLY', 'MONTHLY', 'YEARLY'].map((tab) => (
                      <button key={tab} onClick={() => { 
                        setActiveTab(tab); 
                        setEditingCell(null); 
                        setSelection({ startDay: null, endDay: null, startId: null, endId: null }); 
                        setMonthlySelection({ r1: null, c1: null, r2: null, c2: null }); 
                      }} className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-extrabold transition-all duration-300 ${activeTab === tab ? "bg-white text-indigo-700 shadow-md scale-[1.02]" : "text-slate-400 hover:text-slate-600"}`}>{tab === 'WEEKLY' ? '주간' : tab === 'MONTHLY' ? '월간' : '연간'}</button>
                    ))}
                  </div>
                  {role === 'teacher' && (
                    <div className="hidden md:flex items-center gap-2 border-l pl-3 ml-1 border-slate-200">
                      <button onClick={handleLogout} className="p-2.5 rounded-xl hover:bg-red-50 text-red-500 transition-colors"><LogOut className="w-5 h-5" /></button>
                    </div>
                  )}
                </div>
              </div>
            </header>

            <main className="max-w-full mx-auto p-2 md:p-6 pb-24 relative text-center min-h-screen">
              
              {activeTab === 'WEEKLY' && (
                <div className="animate-fade-in flex flex-col text-center">
                  <div className="space-y-2 md:space-y-4 flex-1 flex flex-col">
                    <div className="p-2 md:p-4 rounded-2xl md:rounded-3xl shadow-sm border border-slate-200 bg-white flex flex-col h-auto">
                      <div className="flex flex-wrap items-center justify-between gap-2 md:gap-4 mb-2 md:mb-4 flex-shrink-0">
                        <div className="flex flex-wrap items-center gap-2 md:gap-4">
                          {dDay ? (
                            <div className="flex items-center gap-1.5 md:gap-3 px-3 md:px-5 py-1.5 md:py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-xl shadow-md text-xs md:text-sm text-center">
                              <Calendar className="w-3 h-3 md:w-4 md:h-4" />
                              <span className="font-bold">{dDay.title} ({calculateDDay(dDay.date)})</span>
                              <button onClick={() => setDDay(null)} className="hover:text-red-200 p-0.5"><X className="w-3 h-3 md:w-4 md:h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 md:gap-2 p-1 md:p-1.5 rounded-xl border border-slate-200 bg-slate-50 shadow-inner flex-wrap md:flex-nowrap justify-center">
                              <input type="text" placeholder="D-day 제목" className="w-20 md:w-32 p-1.5 md:p-2.5 text-xs md:text-sm rounded-lg outline-none font-medium bg-white border border-slate-100 focus:border-indigo-500 text-center" value={dDayInput.title} onChange={(e) => setDDayInput({ ...dDayInput, title: e.target.value })}/>
                              <input type="date" className="w-24 md:w-36 p-1.5 md:p-2.5 text-[10px] md:text-sm rounded-lg outline-none bg-white border border-slate-100 focus:border-indigo-500 text-center" value={dDayInput.date} onChange={(e) => setDDayInput({ ...dDayInput, date: e.target.value })}/>
                              <button onClick={() => { if (dDayInput.title) { setDDay(dDayInput); setDDayInput({ title: '', date: '' }); saveToHistory(); } }} className="px-3 md:px-5 py-1.5 md:py-2.5 rounded-lg text-xs md:text-sm font-bold transition-colors shadow-sm bg-slate-800 hover:bg-slate-900 text-white">설정</button>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-1.5 md:gap-2 text-[10px] md:text-sm ml-auto">
                          <button onClick={() => setShowColorModal(!showColorModal)} className={`flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg font-bold transition-all shadow-sm border ${showColorModal ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}><Palette className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">색상</span></button>
                          {showColorModal && (
                            <div className="absolute right-0 top-14 w-64 md:w-80 p-4 md:p-5 rounded-2xl shadow-2xl border border-slate-200 bg-white z-30 animate-fade-in text-center">
                              <h4 className="font-extrabold mb-3 md:mb-4 text-sm md:text-base flex items-center justify-center gap-2"><Palette className="text-indigo-500 w-4 h-4 md:w-5 md:h-5"/> 키워드 색상 지정</h4>
                              <div className="flex gap-2 mb-3 md:mb-4">
                                <input type="text" placeholder="단어" value={newColorRule.keyword} onChange={(e) => setNewColorRule({ ...newColorRule, keyword: e.target.value })} className="flex-1 p-2 md:p-3 text-xs md:text-sm rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 border border-slate-200 bg-slate-50 text-center" />
                                <div className="relative w-10 h-10 md:w-12 md:h-12 rounded-xl overflow-hidden shadow-inner border border-slate-200 flex-shrink-0 cursor-pointer"><input type="color" value={newColorRule.color} onChange={(e) => setNewColorRule({ ...newColorRule, color: e.target.value })} className="absolute top-[-10px] left-[-10px] w-[200%] h-[200%] cursor-pointer border-0 p-0" /></div>
                                <button onClick={addColorRule} className="bg-indigo-600 text-white px-3 md:px-4 py-1.5 md:py-2 rounded-xl font-bold hover:bg-indigo-700 shadow-md text-xs md:text-sm">추가</button>
                              </div>
                              <div className="space-y-2 max-h-40 md:max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                {colorRules.map((rule) => (
                                  <div key={rule.id} className="flex items-center justify-between text-xs md:text-sm p-2 md:p-3 rounded-xl border border-slate-100 bg-slate-50 group hover:border-indigo-200 transition-colors text-center">
                                    <div className="flex items-center gap-2 md:gap-3 font-bold"><div className="w-4 h-4 md:w-5 md:h-5 rounded-full shadow-inner border border-black/10" style={{ backgroundColor: rule.color }}></div><span>{rule.keyword}</span></div>
                                    <button onClick={() => removeColorRule(rule.id)} className="p-1 md:p-1.5 rounded-lg transition-colors opacity-100 md:opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50"><X className="w-3 h-3 md:w-4 md:h-4" /></button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="h-5 md:h-8 w-px mx-0.5 md:mx-1 bg-slate-200 text-center"></div>

                          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold whitespace-nowrap mr-1">
                            <Sparkles size={12}/> 구글 시트식 에디팅 / 방향키 지원
                          </div>

                          {isWMulti ? <button onClick={mergeCells} className="flex items-center gap-1 md:gap-2 bg-indigo-600 text-white px-2 md:px-4 py-1.5 md:py-2 rounded-lg shadow-md hover:bg-indigo-700 font-extrabold"><Merge className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">병합</span></button> : <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium border border-dashed border-slate-200 text-slate-400 bg-slate-50 select-none"><MousePointer2 className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">드래그</span></div>}
                          <button onClick={unmergeCells} className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg font-bold shadow-sm transition-colors border border-slate-200 text-slate-700 hover:bg-slate-50"><Split className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">분할</span></button>
                          <button onClick={() => setShowResetConfirm(true)} className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg font-bold transition-colors ml-0 md:ml-1 bg-red-50 text-red-600 hover:bg-red-100"><Trash2 className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">초기화</span></button>
                        </div>
                      </div>
                      
                      <div className="w-full relative select-none rounded-xl border-2 border-slate-200 bg-white shadow-inner text-center" onMouseLeave={handleMouseUp}>
                        <table className="w-full text-center border-collapse min-w-[320px] md:min-w-full table-fixed">
                          <thead className="z-20 shadow-sm border-b-2 border-slate-200 text-slate-800">
                            <tr>
                              <th className={`py-1 md:py-2 w-10 md:w-16 border-r border-slate-200 uppercase tracking-widest text-[8px] md:text-[10px] z-20 align-middle transition-colors duration-200 ${wBounds ? 'bg-indigo-100 text-indigo-700 font-black' : 'text-slate-400 font-black bg-slate-50'}`}>
                                <Clock className={`w-3 h-3 mx-auto mb-0.5 hidden md:block transition-opacity duration-200 ${wBounds ? 'opacity-100 text-indigo-700' : 'opacity-50'}`}/>
                                <span className="md:hidden">시간</span>
                                <span className="hidden md:inline">Time</span>
                              </th>
                              {DAYS.map((d, i) => {
                                const labelsLong = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
                                const labelsShort = ['월', '화', '수', '목', '금', '토', '일'];
                                const isColSelected = activeTab === 'WEEKLY' && wBounds && i >= wBounds.minDayIdx && i <= wBounds.maxDayIdx;
                                let defaultTextColor = (d === 'sat') ? 'text-blue-500' : (d === 'sun') ? 'text-red-500' : 'text-slate-600';
                                let textColor = isColSelected ? 'text-indigo-700' : defaultTextColor;
                                let bgColor = isColSelected ? 'bg-indigo-100' : 'bg-slate-50';
                                return (
                                  <th key={d} className={`py-1 md:py-2 font-black text-[10px] md:text-xs border-r border-slate-200 z-20 align-middle transition-colors duration-200 ${textColor} ${bgColor}`}>
                                    <span className="hidden md:inline">{labelsLong[i]}</span>
                                    <span className="md:hidden">{labelsShort[i]}</span>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {timetable.map((row) => {
                              const isRowSelected = activeTab === 'WEEKLY' && wBounds && row.id >= wBounds.minId && row.id <= wBounds.maxId;
                              const timeBgClass = isRowSelected ? "bg-indigo-100/70 shadow-inner border-indigo-200" : "bg-slate-50/50";
                              const timeTextClass = isRowSelected ? "text-indigo-800 font-extrabold" : "text-slate-400 font-medium";
                              return (
                                <tr key={row.id} className="group text-center">
                                  <td className={`p-0 w-10 md:w-16 border border-slate-200 align-middle transition-colors duration-200 select-none ${timeBgClass}`}>
                                    <div className={`flex flex-col items-center justify-center h-full text-[8px] md:text-[10px] ${timeTextClass}`}><span>{row.time}</span></div>
                                  </td>
                                  {DAYS.map((day) => {
                                    if (row[`${day}_hidden`]) return null;
                                    const dayIdx = DAYS.indexOf(day);
                                    
                                    const isSelected = wBounds && row.id >= wBounds.minId && row.id <= wBounds.maxId && dayIdx >= wBounds.minDayIdx && dayIdx <= wBounds.maxDayIdx;
                                    const isSingleSelection = wBounds && wBounds.minId === wBounds.maxId && wBounds.minDayIdx === wBounds.maxDayIdx;
                                    const isActiveThis = isSingleSelection && selection.startId === row.id && selection.startDay === day;
                                    
                                    const cellId = `WEEKLY-${day}-${row.id}`;
                                    const isEditingThis = editingCell === cellId;
                                    
                                    const keywordColor = getCellColor(row[day]);
                                    const bgColor = isSelected ? 'rgba(224, 231, 255, 0.8)' : keywordColor ? keywordColor : 'transparent';
                                    
                                    return (
                                      <td 
                                        key={day} 
                                        className={`p-0 relative align-middle border border-slate-200 transition-all duration-200 ${isSelected ? 'ring-2 ring-indigo-500 ring-inset z-10' : ''} hover:bg-indigo-50/30 ${isEditingThis ? 'cursor-text' : 'cursor-cell'}`} 
                                        style={{ backgroundColor: bgColor }} 
                                        rowSpan={row[`${day}_span`] || 1} 
                                        onMouseDown={(e) => {
                                          if (editingCell !== cellId) setEditingCell(null);
                                          handleMouseDown(e, day, row.id);
                                        }} 
                                        onMouseEnter={() => handleMouseEnter(day, row.id)}
                                        onClick={(e) => { 
                                          if (!e.shiftKey) { 
                                            const area = document.getElementById(`textarea-${row.id}-${day}`); 
                                            if (area && document.activeElement !== area) {
                                              setTimeout(() => area.focus(), 0);
                                            } 
                                          } 
                                        }}
                                        onDoubleClick={() => setEditingCell(cellId)}
                                      >
                                        <div className="w-full h-full flex items-center justify-center p-0 md:p-0.5 text-center min-h-[24px] md:min-h-[28px]">
                                          <textarea 
                                            id={`textarea-${row.id}-${day}`}
                                            value={row[day] || ''} 
                                            onChange={(e) => handleTimetableChange(row.id, day, e.target.value)} 
                                            onInput={autoResize} 
                                            onFocus={handleFocus} 
                                            onBlur={handleBlur}
                                            style={{
                                              caretColor: (!isEditingThis && isActiveThis) ? 'transparent' : 'auto',
                                              cursor: (!isEditingThis && isActiveThis) ? 'default' : 'text'
                                            }}
                                            onCompositionStart={(e) => {
                                              if (!isEditingThis && isActiveThis) {
                                                e.currentTarget.value = '';
                                                handleTimetableChange(row.id, day, '');
                                                setEditingCell(cellId);
                                                setSelection({ startDay: day, endDay: day, startId: row.id, endId: row.id });
                                              }
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.nativeEvent.isComposing && e.key !== 'Escape') return;
                                              
                                              const moveFocus = (rId, dIdx, dir) => {
                                                let nextRId = rId; let nextDIdx = dIdx;
                                                if (dir === 'DOWN') {
                                                   const span = timetable[nextRId - 1][`${DAYS[nextDIdx]}_span`] || 1;
                                                   nextRId += span;
                                                   while(nextRId <= 32 && timetable[nextRId - 1][`${DAYS[nextDIdx]}_hidden`]) nextRId++;
                                                   if (nextRId > 32) return;
                                                } else if (dir === 'UP') {
                                                   nextRId -= 1;
                                                   while(nextRId >= 1 && timetable[nextRId - 1][`${DAYS[nextDIdx]}_hidden`]) nextRId--;
                                                   if (nextRId < 1) return;
                                                } else if (dir === 'RIGHT') {
                                                   nextDIdx += 1;
                                                   if (nextDIdx > 6) { nextDIdx = 0; nextRId += 1; }
                                                   if (nextRId > 32) return;
                                                   while(nextRId >= 1 && timetable[nextRId - 1][`${DAYS[nextDIdx]}_hidden`]) nextRId--;
                                                   if (nextRId < 1) nextRId = 1;
                                                } else if (dir === 'LEFT') {
                                                   nextDIdx -= 1;
                                                   if (nextDIdx < 0) { nextDIdx = 6; nextRId -= 1; }
                                                   if (nextRId < 1) return;
                                                   while(nextRId >= 1 && timetable[nextRId - 1][`${DAYS[nextDIdx]}_hidden`]) nextRId--;
                                                   if (nextRId < 1) nextRId = 1;
                                                }
                                          
                                                const nextDay = DAYS[nextDIdx];
                                                setSelection({ startDay: nextDay, endDay: nextDay, startId: nextRId, endId: nextRId });
                                                setEditingCell(null);
                                                setTimeout(() => {
                                                  const el = document.getElementById(`textarea-${nextRId}-${nextDay}`);
                                                  if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
                                                }, 0);
                                              };
                                          
                                              if (!isEditingThis && isActiveThis) {
                                                if (e.key === 'Enter' || e.key === 'F2') {
                                                  e.preventDefault();
                                                  setEditingCell(cellId);
                                                  e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length);
                                                } else if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(row.id, dayIdx, 'DOWN');
                                                } else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(row.id, dayIdx, 'UP');
                                                } else if (e.key === 'ArrowRight') { e.preventDefault(); moveFocus(row.id, dayIdx, 'RIGHT');
                                                } else if (e.key === 'ArrowLeft') { e.preventDefault(); moveFocus(row.id, dayIdx, 'LEFT');
                                                } else if (e.key === 'Tab') { e.preventDefault(); moveFocus(row.id, dayIdx, e.shiftKey ? 'LEFT' : 'RIGHT');
                                                } else if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); setTimeout(() => e.currentTarget.focus(), 0);
                                                } else if (e.key === 'Delete' || e.key === 'Backspace') { 
                                                  // 글로벌 핸들러에서 데이터를 삭제하도록 패스
                                                } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                                                  e.currentTarget.value = ''; handleTimetableChange(row.id, day, ''); 
                                                  setEditingCell(cellId);
                                                  setSelection({ startDay: day, endDay: day, startId: row.id, endId: row.id });
                                                }
                                              } else if (isEditingThis) {
                                                if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
                                                  e.preventDefault(); setEditingCell(null); moveFocus(row.id, dayIdx, 'DOWN');
                                                } else if (e.key === 'Tab') {
                                                  e.preventDefault(); setEditingCell(null); moveFocus(row.id, dayIdx, e.shiftKey ? 'LEFT' : 'RIGHT');
                                                } else if (e.key === 'Escape') {
                                                  e.preventDefault(); setEditingCell(null);
                                                  e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length);
                                                }
                                              }
                                            }} 
                                            rows={1} className={`w-full h-full text-center bg-transparent resize-none outline-none overflow-hidden font-bold leading-tight focus:ring-1 focus:ring-indigo-400/50 text-[10px] md:text-xs align-middle ${(isActiveThis && !isEditingThis) ? 'select-none' : ''}`} 
                                          />
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'MONTHLY' && (
                <div className="animate-fade-in flex flex-col gap-6 text-center w-full">
                  <div className="p-2 md:p-6 rounded-3xl border border-slate-200 bg-white shadow-sm w-full text-center">
                    <div className="flex items-center justify-between mb-6 px-2 text-center">
                      <div className="flex items-center gap-4 text-center">
                        <div className="flex gap-2 text-center">
                          <button onClick={handlePrev4Weeks} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-center flex items-center justify-center"><ChevronLeft size={20}/></button>
                          <button onClick={handleNext4Weeks} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-center flex items-center justify-center"><ChevronRight size={20}/></button>
                        </div>
                        <div className="font-extrabold text-slate-600 text-sm hidden sm:block">
                          {currentDate.getFullYear()}.{String(currentDate.getMonth() + 1).padStart(2, '0')}.{String(currentDate.getDate()).padStart(2, '0')} 기준
                        </div>
                      </div>
                      <div className="flex gap-3 text-center">
                        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold whitespace-nowrap mr-2 shadow-sm">
                            <Sparkles size={12}/> Shift다중선택 / 복사(C) 붙여넣기(V) / Undo(Z) 호환
                        </div>
                        <button onClick={() => { const name = prompt("추가할 과목명을 입력하세요"); if(name) addSubjectRow(name.trim()); }} className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 bg-indigo-600 text-white rounded-xl font-extrabold text-xs md:text-sm hover:bg-indigo-700 shadow-md transition-all text-center"><Plus size={16}/> <span className="hidden sm:inline">과목 추가</span></button>
                        <button onClick={() => setShowResetConfirm(true)} className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl font-extrabold text-xs md:text-sm hover:bg-red-100 transition-all text-center"><Trash2 size={16}/> <span className="hidden sm:inline">일정 초기화</span></button>
                      </div>
                    </div>

                    {[0, 1].map((blockIdx) => {
                      const chunkStartIndex = blockIdx * 14;
                      const chunk = allDates.slice(chunkStartIndex, chunkStartIndex + 14);
                      return (
                        <div key={blockIdx} className="w-full relative select-none" onMouseLeave={handleMouseUp}>
                          <table className="w-full border-collapse mb-10 text-[9px] md:text-[11px] table-fixed text-center align-middle">
                            <thead>
                              <tr className="bg-slate-50 text-center">
                                <th className="border border-slate-300 w-[6%] py-2 text-center font-black align-middle" rowSpan={2}>과목</th>
                                <th className="border border-slate-300 w-[6%] py-2 text-center font-black align-middle" rowSpan={2}>교재</th>
                                {chunk.map((d, i) => {
                                  let textColor = d.isSat ? 'text-blue-500' : d.isWeekend ? 'text-red-500' : 'text-slate-600';
                                  return <th key={i} className={`border border-slate-300 py-1 font-bold text-center align-middle ${textColor}`}>{d.day}</th>;
                                })}
                              </tr>
                              <tr className="bg-slate-50 text-center">
                                {chunk.map((d, i) => {
                                   let textColor = d.isSat ? 'text-blue-500' : d.isWeekend ? 'text-red-500' : 'text-slate-600';
                                   return <th key={i} className={`border border-slate-300 py-1 font-bold text-center align-middle ${textColor}`}>{d.label}</th>;
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="bg-white text-center">
                                <td colSpan={2} className="border border-slate-300 text-center font-black bg-slate-50 text-black align-middle py-1">비고</td>
                                {chunk.map((d, i) => {
                                  const cIdx = chunkStartIndex + i; const rIdx = 0;
                                  const isSel = mb && rIdx >= mb.minR && rIdx <= mb.maxR && cIdx >= mb.minC && cIdx <= mb.maxC;
                                  const isEditing = editingCell === `note-${d.full}`;
                                  return (
                                    <td key={`note-${d.full}`} 
                                      onMouseDown={(e) => handleMonthlyMouseDown(e, rIdx, cIdx)}
                                      onMouseEnter={() => handleMonthlyMouseEnter(rIdx, cIdx)}
                                      onClick={(e) => { if (!e.shiftKey && !isEditing) setEditingCell(`note-${d.full}`); }}
                                      className={`border border-slate-300 p-0 align-middle text-center cursor-text transition-colors ${isSel ? 'ring-2 ring-indigo-500 ring-inset z-10 bg-indigo-50/80' : 'hover:bg-slate-50'}`}
                                    >
                                      {isEditing ? (
                                        <textarea 
                                          value={termScheduler.topNotes[d.full] || ''} 
                                          onChange={(e) => handleTopNoteChange(d.full, e.target.value)} 
                                          onInput={autoResize} onFocus={handleFocus} onBlur={handleBlur} autoFocus rows={1}
                                          onKeyDown={(e) => { if (e.key === 'Escape') setEditingCell(null); }}
                                          className="w-full h-full min-h-[30px] bg-white resize-none outline-none p-1 text-center font-bold overflow-hidden leading-tight align-middle" 
                                        />
                                      ) : (
                                        <div className="w-full h-full min-h-[30px] flex items-center justify-center p-1 whitespace-pre-wrap font-bold text-slate-800">{termScheduler.topNotes[d.full] || ''}</div>
                                      )}
                                    </td>
                                  )
                                })}
                              </tr>
                              {termScheduler.subjects.map((sub, sIdx) => {
                                const rIdx = sIdx + 1;
                                return (
                                  <tr key={sub} className="text-center align-middle">
                                    <td className="border border-slate-300 px-1 py-1 font-black text-center relative group bg-slate-50/50 align-middle break-keep">
                                      {sub}
                                      <button onClick={() => removeSubjectRow(sub)} className="absolute right-0.5 top-0.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity text-center"><X size={10}/></button>
                                    </td>
                                    <td className="border border-slate-300 p-0 align-middle text-center bg-white cursor-text">
                                      <div className="w-full h-full flex items-center justify-center p-1 min-h-[40px]">
                                        <textarea 
                                          value={termScheduler.textbooks[sub] || ''} 
                                          onChange={(e) => handleTermTextbookChange(sub, e.target.value)} 
                                          onInput={autoResize} onFocus={handleFocus} onBlur={handleBlur} placeholder="입력" rows={1}
                                          onKeyDown={(e) => { if (e.key === 'Escape') e.currentTarget.blur(); }}
                                          className="w-full bg-transparent resize-none outline-none overflow-hidden font-bold text-center text-slate-700 leading-tight align-middle focus:ring-1 focus:ring-indigo-400/50 placeholder:text-slate-300" 
                                        />
                                      </div>
                                    </td>
                                    {chunk.map((d, i) => {
                                      const cIdx = chunkStartIndex + i;
                                      const val = termScheduler.cells[`${sub}-${d.full}`] || '';
                                      const lines = val.split('\n').filter(l => l.trim() !== '');
                                      const isEditing = editingCell === `${sub}-${d.full}`;
                                      const isSel = mb && rIdx >= mb.minR && rIdx <= mb.maxR && cIdx >= mb.minC && cIdx <= mb.maxC;
                                      return (
                                        <td key={`${sub}-${d.full}`}
                                          onMouseDown={(e) => handleMonthlyMouseDown(e, rIdx, cIdx)}
                                          onMouseEnter={() => handleMonthlyMouseEnter(rIdx, cIdx)}
                                          onClick={(e) => { 
                                            if (!e.shiftKey && !isEditing && e.target.type !== 'checkbox') {
                                              setEditingCell(`${sub}-${d.full}`);
                                            }
                                          }}
                                          className={`border border-slate-300 p-0 align-middle transition-colors relative text-center ${isSel ? 'ring-2 ring-indigo-500 ring-inset z-10 bg-indigo-50/80' : 'hover:bg-slate-50 bg-white'}`}
                                        >
                                          <div className="w-full h-full flex flex-col justify-center items-center p-1 text-center min-h-[50px] cursor-text">
                                            {isEditing ? (
                                              <textarea 
                                                autoFocus value={val} 
                                                onChange={(e) => handleTermCellChange(sub, d.full, e.target.value)} 
                                                onInput={autoResize} onFocus={handleFocus} onBlur={handleBlur} rows={1}
                                                onKeyDown={(e) => { if (e.key === 'Escape') setEditingCell(null); }}
                                                className="w-full h-full bg-white resize-none outline-none p-1 text-center font-bold text-slate-800 rounded shadow-sm overflow-hidden min-h-[40px] align-middle leading-tight" 
                                              />
                                            ) : (
                                              <div className="w-full h-full flex flex-col gap-1.5 px-1 justify-center min-h-[40px]">
                                                {val.trim() === '' ? ( <span className="text-transparent select-none w-full h-full block">.</span> ) : (
                                                  lines.map((line, idx) => (
                                                    <div key={idx} className="flex items-center justify-center gap-1 bg-white/70 rounded px-1 py-1 shadow-sm border border-black/5 mx-auto w-[95%]">
                                                      <span className="text-[9px] md:text-[10px] font-black text-slate-800 leading-tight text-center flex-1 break-words whitespace-pre-wrap">{line}</span>
                                                      <input type="checkbox" checked={termScheduler.checks[`${sub}-${d.full}-${idx}`] || false} 
                                                        onChange={(e) => { e.stopPropagation(); handleTermCheckToggle(sub, d.full, idx); }} 
                                                        onClick={(e) => e.stopPropagation()} className="w-3 h-3 md:w-4 md:h-4 cursor-pointer accent-indigo-600 flex-shrink-0" 
                                                      />
                                                    </div>
                                                  ))
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}

                    {termScheduler.subjects.length > 0 && (
                      <div className="text-left flex justify-center w-full text-center mt-6">
                        <table className="w-full border-collapse text-[10px] md:text-[11px] shadow-md rounded-2xl overflow-hidden border border-slate-200 text-center table-fixed align-middle">
                          <thead>
                            <tr className="bg-slate-100 font-black text-slate-800 text-center">
                              <th className="border border-slate-200 w-[10%] py-3 md:py-4 align-middle text-center break-keep">과목</th>
                              <th className="border border-slate-200 w-[10%] align-middle text-center break-keep">교재</th>
                              <th className="border border-slate-200 w-[10%] align-middle text-center break-keep">시작</th>
                              <th className="border border-slate-200 w-[10%] align-middle text-center break-keep">목표</th>
                              <th className="border border-slate-200 w-[60%] align-middle text-center break-keep">달성도</th>
                            </tr>
                          </thead>
                          <tbody>
                            {termScheduler.subjects.map((sub) => {
                              const textbookVal = termScheduler.textbooks[sub] || '';
                              const tbNames = Array.from(new Set(textbookVal.split('\n').map(t => t.trim()).filter(t => t !== '')));
                              const rowData = [];

                              if (tbNames.length === 0) {
                                let firstData = "-"; let lastData = "-"; let totalItems = 0; let checkedItems = 0;
                                allDates.forEach(d => {
                                  const val = termScheduler.cells[`${sub}-${d.full}`] || "";
                                  if (val.trim() !== "") {
                                    val.split('\n').forEach((lineText, idx) => {
                                      if (lineText.trim() !== "") {
                                        if (firstData === "-") firstData = lineText.trim();
                                        lastData = lineText.trim(); totalItems++;
                                        if (termScheduler.checks[`${sub}-${d.full}-${idx}`]) checkedItems++;
                                      }
                                    });
                                  }
                                });
                                rowData.push({ tbName: "-", firstData, lastData, percent: totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0 });
                              } else {
                                tbNames.forEach((tbName) => {
                                  let firstData = "-"; let lastData = "-"; let totalItems = 0; let checkedItems = 0;
                                  allDates.forEach(d => {
                                    const val = termScheduler.cells[`${sub}-${d.full}`] || "";
                                    if (val.trim() !== "") {
                                      val.split('\n').forEach((lineText, idx) => {
                                        if (lineText.trim() !== "" && lineText.trim().includes(tbName)) {
                                          if (firstData === "-") firstData = lineText.trim();
                                          lastData = lineText.trim(); totalItems++;
                                          if (termScheduler.checks[`${sub}-${d.full}-${idx}`]) checkedItems++;
                                        }
                                      });
                                    }
                                  });
                                  rowData.push({ tbName, firstData, lastData, percent: totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0 });
                                });
                              }

                              return rowData.map((data, index) => (
                                <tr key={`status-${sub}-${index}`} className="bg-white hover:bg-slate-50 transition-colors text-center">
                                  {index === 0 && <td rowSpan={rowData.length} className="border border-slate-200 text-center font-black py-3 bg-slate-50/50 align-middle">{sub}</td>}
                                  <td className="border border-slate-200 p-2 text-center font-bold text-slate-700 align-middle break-words whitespace-pre-wrap">{data.tbName}</td>
                                  <td className="border border-slate-200 bg-slate-50/5 text-center font-black px-2 md:px-3 py-2 text-indigo-700 align-middle break-words whitespace-pre-wrap">{data.firstData}</td>
                                  <td className="border border-slate-200 bg-slate-50/5 text-center font-black px-2 md:px-3 py-2 text-rose-700 align-middle break-words whitespace-pre-wrap">{data.lastData}</td>
                                  <td className="border border-slate-200 p-2 md:p-3 text-center align-middle">
                                    <div className="relative w-full h-5 md:h-6 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200 mx-auto">
                                      <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-300 to-green-200 transition-all duration-700 ease-out" style={{ width: `${data.percent}%` }} />
                                      <span className="absolute inset-y-0 left-0 right-0 flex items-center justify-center text-[9px] md:text-[10px] font-black text-slate-800 drop-shadow-sm">{data.percent}%</span>
                                    </div>
                                  </td>
                                </tr>
                              ));
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'YEARLY' && (
                <div className="animate-fade-in grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-center text-center">
                  {yearlyPlan.map((plan, idx) => (
                    <div key={idx} className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md text-center">
                      <h4 className="font-black text-indigo-600 mb-3 text-center text-center">{idx + 1}월 계획</h4>
                      <textarea 
                        value={plan || ''} 
                        onChange={(e) => handleYearlyChange(idx, e.target.value)} 
                        onInput={autoResize} onFocus={handleFocus} onBlur={handleBlur}
                        placeholder={`${idx + 1}월 마일스톤`} 
                        className="w-full p-4 rounded-xl border border-slate-100 outline-none focus:border-indigo-500 transition-all text-sm font-bold resize-none text-center overflow-hidden text-center text-center bg-transparent" 
                      />
                    </div>
                  ))}
                </div>
              )}
            </main>

            <div className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-50 flex flex-col items-end text-center">
              {showAiModal ? (
                <div className="w-[360px] md:w-[420px] rounded-3xl shadow-2xl overflow-hidden border border-slate-200 bg-white animate-fade-in text-center">
                  <div className="bg-indigo-600 p-5 text-white flex justify-between items-center text-center">
                    <h3 className="font-extrabold text-lg flex items-center justify-center gap-2 w-full text-center"><Sparkles size={20}/> AI 매직 플래너</h3>
                    <button onClick={() => setShowAiModal(false)}><X className="w-5 h-5 text-center" /></button>
                  </div>
                  <div className="p-6 text-center text-center text-center">
                    {aiFeedback && <div className="mb-6 p-4 rounded-2xl text-center font-bold animate-pulse bg-emerald-50 text-emerald-600 border border-emerald-100 text-xs leading-relaxed text-center">{aiFeedback}</div>}
                    <form onSubmit={handleAiSubmit} className="relative mt-2 text-center text-center text-center">
                      <input type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="학습 명령을 입력하세요..." className="w-full pl-5 pr-14 py-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-indigo-500 transition-all font-bold text-slate-800 text-center text-center text-center" disabled={isAiProcessing} />
                      <button type="submit" disabled={isAiProcessing || !aiPrompt.trim()} className="absolute right-2 top-2 p-3.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-center"><Send size={20} /></button>
                    </form>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAiModal(true)} className="flex items-center justify-center w-16 h-16 bg-indigo-600 text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all text-center"><Sparkles className="w-7 h-7 text-center" /></button>
              )}
            </div>
          </>
        )}

        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-center" onClick={() => setShowResetConfirm(false)}>
            <div className="w-full max-w-xs rounded-3xl shadow-2xl p-8 text-center bg-white text-center text-center text-center" onClick={(e) => e.stopPropagation()}>
              <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 text-center text-center text-center text-center text-center"><AlertCircle size={32} /></div>
              <h3 className="font-black text-xl mb-2 text-center text-center text-center text-center text-center">데이터 초기화</h3>
              <p className="text-sm mb-8 text-slate-500 font-bold text-center text-center text-center text-center text-center">현재 탭의 데이터를 모두 지울까요?</p>
              <div className="flex gap-3 text-center text-center text-center text-center">
                <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600 text-center text-center text-center text-center text-center">취소</button>
                <button onClick={executeResetTimetable} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black shadow-lg text-center text-center text-center text-center text-center">확인</button>
              </div>
            </div>
          </div>
        )}

        {showLogoutConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-center" onClick={() => setShowLogoutConfirm(false)}>
            <div className="w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center bg-white text-center text-center" onClick={(e) => e.stopPropagation()}>
              <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-4 text-center text-center text-center text-center text-center text-center"><LogOut size={32} /></div>
              <h3 className="font-black text-xl mb-2 text-center text-center text-center text-center text-center text-center text-center">로그아웃</h3>
              <p className="text-sm mb-8 text-slate-500 font-bold text-center text-center text-center text-center text-center text-center text-center text-center">정말 로그아웃 하시겠습니까?</p>
              <div className="flex gap-3 text-center text-center text-center text-center text-center text-center">
                <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600 text-center text-center text-center text-center text-center text-center">취소</button>
                <button onClick={executeLogout} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-100 text-center text-center text-center text-center text-center text-center text-center text-center">로그아웃</button>
              </div>
            </div>
          </div>
        )}

        {studentToDelete && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-center" onClick={() => setStudentToDelete(null)}>
            <div className="w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center bg-white text-center text-center text-center text-center text-center" onClick={(e) => e.stopPropagation()}>
              <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 text-center text-center text-center text-center text-center text-center text-center text-center text-center"><Trash2 size={32} /></div>
              <h3 className="font-black text-xl mb-2 text-center text-center text-center text-center text-center text-center text-center text-center text-center">데이터 삭제</h3>
              <p className="text-sm mb-8 text-slate-500 font-bold text-center text-center text-center text-center text-center text-center text-center text-center text-center">이 시트를 삭제하시겠습니까?</p>
              <div className="flex gap-3 text-center text-center text-center text-center text-center text-center text-center text-center text-center">
                <button onClick={() => setStudentToDelete(null)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600 text-center text-center text-center text-center text-center text-center text-center text-center text-center">취소</button>
                <button onClick={executeDeleteStudent} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black shadow-lg text-center text-center text-center text-center text-center text-center text-center text-center text-center">삭제</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.4); border-radius: 10px; } .animate-fade-in { animation: fadeIn 0.3s forwards; } @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }` }} />
    </div>
  );
}
