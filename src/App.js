/* eslint-disable */
import React, { useState, useEffect, useRef, useMemo } from 'react';
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

const EMPTY_ARR = [];
const EMPTY_OBJ = {};
const EMPTY_YEARLY = Array(12).fill('');

const safeStr = (v) => (v === null || v === undefined) ? '' : String(v);

const parseTSV = (text) => {
  let rows = [], cols = [], curr = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (inQ && text[i + 1] === '"') { curr += '"'; i++; } else inQ = !inQ; }
    else if (c === '\t' && !inQ) { cols.push(curr); curr = ''; }
    else if ((c === '\n' || c === '\r') && !inQ) { if (c === '\r' && text[i + 1] === '\n') i++; cols.push(curr); rows.push(cols); cols = []; curr = ''; }
    else curr += c;
  }
  if (curr !== '' || cols.length > 0) { cols.push(curr); rows.push(cols); }
  if (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") rows.pop();
  return rows;
};

const generateTimeSlots = () => {
  const slots = []; let id = 1;
  for (let h = 8; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      slots.push({ id: id++, time: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`, mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '', mon_span: 1, mon_hidden: false, tue_span: 1, tue_hidden: false, wed_span: 1, wed_hidden: false, thu_span: 1, thu_hidden: false, fri_span: 1, fri_hidden: false, sat_span: 1, sat_hidden: false, sun_span: 1, sun_hidden: false });
    }
  }
  return slots;
};
const DEFAULT_SLOTS = generateTimeSlots();

const repairTimetable = (tt) => {
  if (!Array.isArray(tt) || tt.length === 0) return JSON.parse(JSON.stringify(DEFAULT_SLOTS));
  let rep = DEFAULT_SLOTS.map((def, i) => {
    const l = tt.find(r => r && r.id === def.id) || tt[i] || {};
    const m = { ...def, ...l, id: def.id, time: def.time };
    DAYS.forEach(d => { m[d] = safeStr(m[d]); m[`${d}_span`] = Number(m[`${d}_span`]) || 1; m[`${d}_hidden`] = Boolean(m[`${d}_hidden`]); });
    return m;
  });
  DAYS.forEach(d => {
    let skip = 0;
    for (let i = 0; i < 32; i++) {
      if (i < skip) { rep[i][`${d}_hidden`] = true; rep[i][`${d}_span`] = 1; } 
      else { rep[i][`${d}_hidden`] = false; let span = rep[i][`${d}_span`]; if (span < 1) span = 1; if (i + span > 32) span = 32 - i; rep[i][`${d}_span`] = span; skip = i + span; }
    }
  });
  return rep;
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

  const [timetable, setTimetable] = useState(DEFAULT_SLOTS);
  const [dDay, setDDay] = useState(null);
  const [dDayInput, setDDayInput] = useState({ title: '', date: '' });
  const [yearlyPlan, setYearlyPlan] = useState(EMPTY_YEARLY);
  const [termScheduler, setTermScheduler] = useState({ cells: {}, status: {}, textbooks: {}, subjects: [], topNotes: {}, checks: {} });
  const [currentDate, setCurrentDate] = useState(new Date(2026, 1, 2)); 
  const [colorRules, setColorRules] = useState([]);
  const [newColorRule, setNewColorRule] = useState({ keyword: '', color: '#bfdbfe' });
  const [studentList, setStudentList] = useState([]);

  const tsSubjects = termScheduler?.subjects || EMPTY_ARR;
  const tsCells = termScheduler?.cells || EMPTY_OBJ;
  const tsTextbooks = termScheduler?.textbooks || EMPTY_OBJ;
  const tsTopNotes = termScheduler?.topNotes || EMPTY_OBJ;
  const tsChecks = termScheduler?.checks || EMPTY_OBJ;
  const safeYearly = Array.isArray(yearlyPlan) && yearlyPlan.length > 0 ? yearlyPlan : EMPTY_YEARLY;
  const safeColors = colorRules || EMPTY_ARR;
  const safeTimetable = Array.isArray(timetable) && timetable.length > 0 ? timetable : DEFAULT_SLOTS;

  const [isDragging, setIsDragging] = useState(false);
  const [selection, setSelection] = useState({ startDay: null, endDay: null, startId: null, endId: null });
  const [monthlySelection, setMonthlySelection] = useState({ r1: null, c1: null, r2: null, c2: null });
  const isMonthlyDragging = useRef(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [originalCellValue, setOriginalCellValue] = useState("");
  const [editingCell, setEditingCell] = useState(null); 

  const historyRef = useRef({ past: [], future: [] });
  const currentStateRef = useRef({ timetable, termScheduler, yearlyPlan });
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
    const prev = JSON.parse(historyRef.current.past.pop());
    setTimetable(prev.timetable || DEFAULT_SLOTS); setTermScheduler(prev.termScheduler || {}); setYearlyPlan(prev.yearlyPlan || EMPTY_YEARLY);
    setIsEditMode(false); setEditingCell(null); setAiFeedback('↩️ 실행 취소'); setTimeout(() => setAiFeedback(''), 1000);
  };

  const handleRedo = () => {
    if (historyRef.current.future.length === 0) return;
    historyRef.current.past.push(JSON.stringify(currentStateRef.current));
    const next = JSON.parse(historyRef.current.future.pop());
    setTimetable(next.timetable || DEFAULT_SLOTS); setTermScheduler(next.termScheduler || {}); setYearlyPlan(next.yearlyPlan || EMPTY_YEARLY);
    setIsEditMode(false); setEditingCell(null); setAiFeedback('↪️ 다시 실행'); setTimeout(() => setAiFeedback(''), 1000);
  };

  const focusSnapshotRef = useRef(null);
  const handleFocus = (e) => {
    if(e && e.target) autoResize(e);
    if (!focusSnapshotRef.current) focusSnapshotRef.current = JSON.stringify(currentStateRef.current);
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
    focusSnapshotRef.current = null; setIsEditMode(false); setEditingCell(null);
  };

  const getSelectionBounds = () => {
    if (!selection.startDay || !selection.endDay || !selection.startId || !selection.endId) return null;
    const d1 = DAYS.indexOf(selection.startDay); const d2 = DAYS.indexOf(selection.endDay);
    return { minDayIdx: Math.min(d1, d2), maxDayIdx: Math.max(d1, d2), minId: Math.min(selection.startId, selection.endId), maxId: Math.max(selection.startId, selection.endId) };
  };

  const getMonthlyBounds = () => {
    if (monthlySelection.r1 === null || monthlySelection.c1 === null) return null;
    return { minR: Math.min(monthlySelection.r1, monthlySelection.r2), maxR: Math.max(monthlySelection.r1, monthlySelection.r2), minC: Math.min(monthlySelection.c1, monthlySelection.c2), maxC: Math.max(monthlySelection.c1, monthlySelection.c2) };
  };

  const moveFocusWeekly = (cId, cDayIdx, rOff, cOff) => {
    let nId = cId; let nDayIdx = cDayIdx + cOff;
    if (nDayIdx < 0) nDayIdx = 0; if (nDayIdx > 6) nDayIdx = 6;
    const nDay = DAYS[nDayIdx];
    if (rOff > 0) { const span = safeTimetable[cId - 1]?.[`${DAYS[cDayIdx]}_span`] || 1; nId += span; while (nId <= 32 && safeTimetable[nId - 1]?.[`${nDay}_hidden`]) nId++; if (nId > 32) return; } 
    else if (rOff < 0) { nId -= 1; while (nId >= 1 && safeTimetable[nId - 1]?.[`${nDay}_hidden`]) nId--; if (nId < 1) return; } 
    else if (cOff !== 0) { while (nId >= 1 && safeTimetable[nId - 1]?.[`${nDay}_hidden`]) nId--; if (nId < 1) nId = 1; }
    setSelection({ startDay: nDay, endDay: nDay, startId: nId, endId: nId }); setEditingCell(`W-${nId}-${nDay}`);
  };

  const moveFocusMonthly = (rIdx, cIdx, rOff, cOff) => {
    let nR = rIdx + rOff; let nC = cIdx + cOff; const maxR = tsSubjects.length;
    if (nR < 0) nR = 0; if (nR > maxR) nR = maxR; if (nC < 0) nC = 0; if (nC > 27) nC = 27;
    setMonthlySelection({ r1: nR, c1: nC, r2: nR, c2: nC });
    setEditingCell(nR === 0 ? `note-${allDates[nC].full}` : `${tsSubjects[nR - 1]}-${allDates[nC].full}`);
  };

  const handleCellKeyDown = (e, tab, rId, cIdx, currentVal) => {
    e.stopPropagation(); const isCtrl = navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? e.metaKey : e.ctrlKey;
    if (isCtrl) return; 

    if (!isEditMode) {
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault(); saveToHistory(); setOriginalCellValue(currentVal); setIsEditMode(true);
        setTimeout(() => { if (e.target && e.target.querySelector('textarea')) { const ta = e.target.querySelector('textarea'); ta.focus(); ta.selectionStart = ta.value.length; ta.selectionEnd = ta.value.length; } }, 10);
      } else if (e.key === 'Tab') { e.preventDefault(); tab === 'WEEKLY' ? moveFocusWeekly(rId, cIdx, 0, e.shiftKey ? -1 : 1) : moveFocusMonthly(rId, cIdx, 0, e.shiftKey ? -1 : 1);
      } else if (e.key === 'ArrowDown') { e.preventDefault(); tab === 'WEEKLY' ? moveFocusWeekly(rId, cIdx, 1, 0) : moveFocusMonthly(rId, cIdx, 1, 0);
      } else if (e.key === 'ArrowUp') { e.preventDefault(); tab === 'WEEKLY' ? moveFocusWeekly(rId, cIdx, -1, 0) : moveFocusMonthly(rId, cIdx, -1, 0);
      } else if (e.key === 'ArrowRight') { e.preventDefault(); tab === 'WEEKLY' ? moveFocusWeekly(rId, cIdx, 0, 1) : moveFocusMonthly(rId, cIdx, 0, 1);
      } else if (e.key === 'ArrowLeft') { e.preventDefault(); tab === 'WEEKLY' ? moveFocusWeekly(rId, cIdx, 0, -1) : moveFocusMonthly(rId, cIdx, 0, -1);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault(); saveToHistory();
        if (tab === 'WEEKLY') {
          const b = getSelectionBounds(); if (!b) return;
          setTimetable(prev => { let nt = [...(Array.isArray(prev)?prev:[])]; for (let id = b.minId; id <= b.maxId; id++) { for (let d = b.minDayIdx; d <= b.maxDayIdx; d++) { if (nt[id-1] && !nt[id-1][`${DAYS[d]}_hidden`]) nt[id-1] = { ...nt[id-1], [DAYS[d]]: '' }; } } return nt; });
        } else if (tab === 'MONTHLY') {
          const mb = getMonthlyBounds(); if (!mb) return;
          setTermScheduler(prev => {
            let nc = { ...(prev.cells||{}) }; let nn = { ...(prev.topNotes||{}) };
            for (let r = mb.minR; r <= mb.maxR; r++) { const sub = r === 0 ? null : (prev.subjects||[])[r - 1]; for (let c = mb.minC; c <= mb.maxC; c++) { const dt = allDates[c].full; if (r === 0) nn[dt] = ''; else nc[`${sub}-${dt}`] = ''; } }
            return { ...prev, cells: nc, topNotes: nn };
          });
        }
      }
    } else {
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
        e.preventDefault(); setIsEditMode(false); document.activeElement?.blur(); tab === 'WEEKLY' ? moveFocusWeekly(rId, cIdx, 1, 0) : moveFocusMonthly(rId, cIdx, 1, 0);
      } else if (e.key === 'Tab') {
        e.preventDefault(); setIsEditMode(false); document.activeElement?.blur(); tab === 'WEEKLY' ? moveFocusWeekly(rId, cIdx, 0, e.shiftKey ? -1 : 1) : moveFocusMonthly(rId, cIdx, 0, e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') {
        e.preventDefault(); setIsEditMode(false); document.activeElement?.blur();
        if (tab === 'WEEKLY') handleTimetableChange(rId, DAYS[cIdx], originalCellValue);
        else if (tab === 'MONTHLY') { if (rId === 0) handleTopNoteChange(allDates[cIdx].full, originalCellValue); else handleTermCellChange(tsSubjects[rId - 1], allDates[cIdx].full, originalCellValue); }
        setTimeout(() => { if (e.target && e.target.parentElement) e.target.parentElement.parentElement.focus(); }, 10);
      }
    }
  };

  const getSchedulerDates = () => {
    const days = []; const dayL = ['일', '월', '화', '수', '목', '금', '토'];
    for (let i = 0; i < 28; i++) {
      const d = new Date(currentDate); d.setDate(currentDate.getDate() + i);
      days.push({ full: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, label: `${d.getMonth() + 1}/${d.getDate()}`, day: dayL[d.getDay()], isWeekend: d.getDay() === 0 || d.getDay() === 6, isSat: d.getDay() === 6 });
    }
    return days;
  };
  const allDates = useMemo(() => getSchedulerDates(), [currentDate]);
  
  const autoResize = (e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; };

  useEffect(() => {
    const timer = setTimeout(() => { document.querySelectorAll('textarea').forEach(el => { el.style.height = 'auto'; if (el.scrollHeight > 0) el.style.height = el.scrollHeight + 'px'; }); }, 100);
    return () => clearTimeout(timer);
  }, [activeTab, view, currentDocId, loading, isEditMode]);

  useEffect(() => {
    const el = document.activeElement; if (el && el.tagName === 'INPUT' && el.type === 'text') return;
    if (activeTab === 'WEEKLY' && selection.startDay) {
       const b = getSelectionBounds();
       if (b) { const t = document.getElementById(`td-W-${b.minId}-${DAYS[b.minDayIdx]}`); if (t && document.activeElement !== t && !isEditMode) { t.focus({ preventScroll: true }); } }
    } else if (activeTab === 'MONTHLY' && monthlySelection.r1 !== null) {
       const mb = getMonthlyBounds();
       if (mb && !isEditMode) { const t = document.getElementById(`td-M-${mb.minR}-${mb.minC}`); if (t && document.activeElement !== t) { t.focus({ preventScroll: true }); } }
    }
  }, [selection, monthlySelection, activeTab, isEditMode]); 

  const historyLoaded = useRef(false);
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth); const p = new URLSearchParams(window.location.search); const sid = p.get('sid');
        if (sid) { setCurrentDocId(sid); setRole('student'); setView('PLANNER'); } 
        else {
          const sRole = localStorage.getItem('planner_role'); const sName = localStorage.getItem('planner_name');
          if (sRole === 'student' && sName) { setRole('student'); setStudentName(sName); setCurrentDocId(sName); setView('PLANNER'); } 
          else if (sRole === 'teacher') { setRole('teacher'); setView('TEACHER_DASHBOARD'); } else setView('LANDING');
        }
        onSnapshot(doc(db, 'settings', 'global'), (s) => { if (s.exists()) setGlobalAiKey(s.data().aiKey || ''); });
      } catch (error) {}
    };
    initAuth(); onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !currentDocId || (view !== 'PLANNER' && view !== 'TEACHER_DASHBOARD')) return;
    setLoading(true);
    const un = onSnapshot(doc(db, 'planners', currentDocId), (s) => {
      try {
        if (s.metadata?.hasPendingWrites) return;
        if (s.exists()) {
          setIsNotFound(false); const d = s.data();
          setTimetable(p => { const nt = Array.isArray(d.timetable) ? repairTimetable(d.timetable) : DEFAULT_SLOTS; return JSON.stringify(p) === JSON.stringify(nt) ? p : nt; });
          setTermScheduler(p => { const ns = { subjects: d.termScheduler?.subjects || [], cells: d.termScheduler?.cells || {}, status: d.termScheduler?.status || {}, textbooks: d.termScheduler?.textbooks || {}, topNotes: d.termScheduler?.topNotes || {}, checks: d.termScheduler?.checks || {} }; return JSON.stringify(p) === JSON.stringify(ns) ? p : ns; });
          setDDay(p => JSON.stringify(p) === JSON.stringify(d.dDay || null) ? p : (d.dDay || null)); 
          setYearlyPlan(p => JSON.stringify(p) === JSON.stringify(d.yearlyPlan || EMPTY_YEARLY) ? p : (d.yearlyPlan || EMPTY_YEARLY)); 
          setColorRules(p => JSON.stringify(p) === JSON.stringify(d.colorRules || []) ? p : (d.colorRules || [])); 
          setStudentName(p => p === (d.studentName || '') ? p : (d.studentName || ''));
          if (!historyLoaded.current) { historyRef.current = { past: [], future: [] }; historyLoaded.current = true; }
        } else setIsNotFound(true);
      } catch (e) {} finally { setLoading(false); }
    });
    return () => un();
  }, [user, currentDocId, view]);

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return; }
    if (!user || !currentDocId || view !== 'PLANNER' || loading || isNotFound) return;
    const save = async () => { const isName = studentName && studentName !== currentDocId; await setDoc(doc(db, 'planners', currentDocId), { timetable: safeTimetable, dDay, yearlyPlan: safeYearly, termScheduler, colorRules: safeColors, lastUpdated: new Date().toISOString(), ...(isName && { studentName }) }, { merge: true }); };
    const tid = setTimeout(save, 1000); return () => clearTimeout(tid);
  }, [safeTimetable, dDay, safeYearly, termScheduler, safeColors, user, currentDocId, view, loading, studentName, isNotFound]);

  useEffect(() => {
    if (!user || view !== 'TEACHER_DASHBOARD') return;
    const un = onSnapshot(collection(db, 'planners'), (s) => { const st = []; s.forEach(d => st.push({ id: d.id, ...d.data() })); st.sort((a, b) => (safeStr(a.studentName)).localeCompare(safeStr(b.studentName), 'ko')); setStudentList(st); });
    return () => un();
  }, [user, view]);

  useEffect(() => {
    const copy = (e) => {
      if (view !== 'PLANNER' || isEditMode) return;
      const tag = document.activeElement?.tagName; if (tag === 'INPUT' || (tag === 'TEXTAREA' && !document.activeElement.id.startsWith('cell-'))) return;
      let tsv = "";
      if (activeTab === 'WEEKLY' && selection.startDay) {
        const b = getSelectionBounds(); if (!b) return; let data = [];
        for (let i = b.minId; i <= b.maxId; i++) {
          const r = safeTimetable[i - 1]; if (!r) continue; let rD = []; let rC = [];
          for (let d = b.minDayIdx; d <= b.maxDayIdx; d++) {
            const day = DAYS[d]; const v = safeStr(r[`${day}_hidden`] ? "" : r[day]);
            rD.push(v.includes('\n') || v.includes('\t') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v); rC.push({ text: safeStr(r[day]), span: r[`${day}_span`] || 1, hidden: r[`${day}_hidden`] || false });
          }
          tsv += rD.join("\t") + (i < b.maxId ? "\n" : ""); data.push(rC);
        }
        e.clipboardData.setData('application/json', JSON.stringify({ tab: 'WEEKLY', data }));
      } else if (activeTab === 'MONTHLY' && monthlySelection.r1 !== null) {
        const mb = getMonthlyBounds(); if (!mb) return; let data = [];
        for (let r = mb.minR; r <= mb.maxR; r++) {
          const sub = r === 0 ? null : tsSubjects[r - 1]; let rD = []; let rC = [];
          for (let c = mb.minC; c <= mb.maxC; c++) {
             const dt = allDates[c].full; const v = safeStr(r === 0 ? tsTopNotes[dt] : tsCells[`${sub}-${dt}`]);
             rD.push(v.includes('\n') || v.includes('\t') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v); rC.push({ text: v });
          }
          tsv += rD.join("\t") + (r < mb.maxR ? "\n" : ""); data.push(rC);
        }
        e.clipboardData.setData('application/json', JSON.stringify({ tab: 'MONTHLY', data }));
      }
      if (tsv) { e.clipboardData.setData('text/plain', tsv); e.preventDefault(); setAiFeedback('✅ 복사 완료'); setTimeout(() => setAiFeedback(''), 1500); }
    };

    const paste = (e) => {
      if (view !== 'PLANNER' || isEditMode) return;
      const tag = document.activeElement?.tagName; if (tag === 'INPUT' || (tag === 'TEXTAREA' && !document.activeElement.id.startsWith('cell-'))) return;
      const t = e.clipboardData?.getData('text/plain') || window.clipboardData?.getData('text/plain');
      const j = e.clipboardData?.getData('application/json') || window.clipboardData?.getData('application/json');
      if (!t && !j) return;
      let pd = null, pt = null; if (j) try { const obj = JSON.parse(j); if (obj.data) { pd = obj.data; pt = obj.tab; } } catch(err) {}

      if (activeTab === 'WEEKLY' && selection.startDay) {
        const b = getSelectionBounds(); if (!b) return; const sC = b.minId === b.maxId && b.minDayIdx === b.maxDayIdx; e.preventDefault(); saveToHistory();
        setTimetable(prev => {
          let nt = [...(Array.isArray(prev)?prev:[])]; const sR = b.minId - 1;
          if (pd && pt === 'WEEKLY') {
            for (let c = 0; c < pd[0].length; c++) { const day = DAYS[b.minDayIdx + c]; if (day) { for (let i = 0; i < sR; i++) { if(!nt[i]) continue; const pS = nt[i][`${day}_span`]; if (pS > 1 && i + pS > sR) nt[i] = { ...nt[i], [`${day}_span`]: sR - i }; } } }
            pd.forEach((rC, rI) => { const ttI = sR + rI; if (ttI <= 31) rC.forEach((cC, cI) => { const day = DAYS[b.minDayIdx + cI]; if (day && nt[ttI]) nt[ttI] = { ...nt[ttI], [day]: safeStr(cC.text), [`${day}_span`]: cC.span, [`${day}_hidden`]: cC.hidden }; }); });
          } else {
            const rows = parseTSV(t);
            if (rows.length === 1 && rows[0].length === 1 && !sC) { for (let i = b.minId; i <= b.maxId; i++) { for (let d = b.minDayIdx; d <= b.maxDayIdx; d++) { if (nt[i-1] && !nt[i-1][`${DAYS[d]}_hidden`]) nt[i-1] = { ...nt[i-1], [DAYS[d]]: safeStr(rows[0][0]) }; } } } 
            else { rows.forEach((rA, i) => { const rI = sR + i; if (rI <= 31) rA.forEach((c, j) => { const cI = b.minDayIdx + j; if (cI < 7 && nt[rI] && !nt[rI][`${DAYS[cI]}_hidden`]) nt[rI] = { ...nt[rI], [DAYS[cI]]: safeStr(c) }; }); }); }
          }
          return repairTimetable(nt);
        });
        setAiFeedback('✅ 붙여넣기 완료'); setTimeout(() => setAiFeedback(''), 1500);
      } else if (activeTab === 'MONTHLY' && monthlySelection.r1 !== null) {
        const mb = getMonthlyBounds(); if (!mb) return; const sC = mb.minR === mb.maxR && mb.minC === mb.maxC; e.preventDefault(); saveToHistory();
        setTermScheduler(prev => {
          let nc = { ...(prev.cells||{}) }; let nn = { ...(prev.topNotes||{}) }; const pSubs = prev.subjects || [];
          if (pd && pt === 'MONTHLY') {
            pd.forEach((rC, rO) => { const tR = mb.minR + rO; if (tR <= pSubs.length) rC.forEach((cC, cO) => { const tC = mb.minC + cO; if (tC < 28) { const d = allDates[tC].full; if (tR === 0) nn[d] = safeStr(cC.text); else nc[`${pSubs[tR - 1]}-${d}`] = safeStr(cC.text); } }); });
          } else {
            const rows = parseTSV(t);
            if (rows.length === 1 && rows[0].length === 1 && !sC) { for (let r = mb.minR; r <= mb.maxR; r++) { const sub = r === 0 ? null : pSubs[r - 1]; for (let c = mb.minC; c <= mb.maxC; c++) { const dt = allDates[c].full; if (r === 0) nn[dt] = safeStr(rows[0][0]); else nc[`${sub}-${dt}`] = safeStr(rows[0][0]); } } } 
            else { rows.forEach((rA, i) => { const rI = mb.minR + i; if (rI <= pSubs.length) { const sub = rI === 0 ? null : pSubs[rI - 1]; rA.forEach((cl, j) => { const cI = mb.minC + j; if (cI < 28) { const dt = allDates[cI].full; if (rI === 0) nn[dt] = safeStr(cl); else nc[`${sub}-${dt}`] = safeStr(cl); } }); } }); }
          }
          return { ...prev, cells: nc, topNotes: nn };
        });
        setAiFeedback('✅ 붙여넣기 완료'); setTimeout(() => setAiFeedback(''), 1500);
      }
    };

    const kDown = (e) => {
      if (view !== 'PLANNER') return; 
      const tag = document.activeElement?.tagName; if (tag === 'INPUT' || (tag === 'TEXTAREA' && !document.activeElement.id.startsWith('cell-'))) return;
      const isC = navigator.platform.toUpperCase().indexOf('MAC') >= 0 ? e.metaKey : e.ctrlKey;
      if (isC && e.key.toLowerCase() === 'z') { if (!isEditMode) { e.preventDefault(); e.shiftKey ? handleRedo() : handleUndo(); } return; }
      if (isC && e.key.toLowerCase() === 'y') { if (!isEditMode) { e.preventDefault(); handleRedo(); } return; }
    };

    document.addEventListener('copy', copy); document.addEventListener('paste', paste); document.addEventListener('keydown', kDown);
    return () => { document.removeEventListener('copy', copy); document.removeEventListener('paste', paste); document.removeEventListener('keydown', kDown); };
  }, [activeTab, view, selection, monthlySelection, safeTimetable, termScheduler, isEditMode, allDates]); 

  const saveGlobalAiKey = async () => { try { await setDoc(doc(db, 'settings', 'global'), { aiKey: globalAiKey }, { merge: true }); setShowGlobalKeyInput(false); setAiFeedback('✅ 키 저장'); setTimeout(() => setAiFeedback(''), 3000); } catch (e) {} };
  const createNewStudentSheet = async () => { const name = prompt("이름을 입력하세요."); if (!name || !name.trim()) return; const newSid = crypto.randomUUID(); setLoading(true); try { await setDoc(doc(db, 'planners', newSid), { studentName: safeStr(name).trim(), timetable: generateTimeSlots(), todos: [], yearlyPlan: Array(12).fill(''), createdAt: new Date().toISOString() }); setAiFeedback(`✅ 학생 생성됨.`); setTimeout(() => setAiFeedback(''), 3000); } catch (e) {} finally { setLoading(false); } };
  const copyStudentLink = (sid) => { const el = document.createElement('textarea'); el.value = `${window.location.origin}${window.location.pathname}?sid=${sid}`; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); setCopyFeedback(sid); setTimeout(() => setCopyFeedback(null), 2000); };

  const handleMouseDown = (e, day, id) => {
    if (e.target.tagName === 'TEXTAREA' && isEditMode) return;
    if (isEditMode) { setIsEditMode(false); setEditingCell(null); }
    setIsDragging(true); setMonthlySelection({ r1: null, c1: null, r2: null, c2: null });
    if (e.currentTarget && e.currentTarget.focus) e.currentTarget.focus();
    if (e.shiftKey && selection.startDay) { e.preventDefault(); setSelection(prev => ({ ...prev, endDay: day, endId: id })); } 
    else { setSelection({ startDay: day, endDay: day, startId: id, endId: id }); setEditingCell(`W-${id}-${day}`); }
  };
  const handleMouseEnter = (day, id) => { if (isDragging && activeTab === 'WEEKLY') setSelection(prev => ({ ...prev, endDay: day, endId: id })); };

  const handleMonthlyMouseDown = (e, rIdx, cIdx) => {
    if ((e.target.tagName === 'TEXTAREA' && isEditMode) || e.target.type === 'checkbox') return;
    if (isEditMode) { setIsEditMode(false); setEditingCell(null); }
    isMonthlyDragging.current = true; setSelection({ startDay: null, endDay: null, startId: null, endId: null });
    if (e.currentTarget && e.currentTarget.focus) e.currentTarget.focus();
    if (e.shiftKey && monthlySelection.r1 !== null) { e.preventDefault(); setMonthlySelection(prev => ({ ...prev, r2: rIdx, c2: cIdx })); } 
    else { setMonthlySelection({ r1: rIdx, c1: cIdx, r2: rIdx, c2: cIdx }); setEditingCell(rIdx === 0 ? `note-${allDates[cIdx].full}` : `${tsSubjects[rIdx - 1]}-${allDates[cIdx].full}`); }
  };
  const handleMonthlyMouseEnter = (rIdx, cIdx) => { if (isMonthlyDragging.current && activeTab === 'MONTHLY') setMonthlySelection(prev => ({ ...prev, r2: rIdx, c2: cIdx })); };
  const handleMouseUp = () => { setIsDragging(false); isMonthlyDragging.current = false; };
  useEffect(() => { window.addEventListener('mouseup', handleMouseUp); return () => window.removeEventListener('mouseup', handleMouseUp); }, []);

  const mergeCells = () => {
    const b = getSelectionBounds(); if (!b) return; const span = b.maxId - b.minId + 1; if (span <= 1) return;
    saveToHistory(); let nt = [...safeTimetable];
    for (let d = b.minDayIdx; d <= b.maxDayIdx; d++) {
      const day = DAYS[d];
      for (let i = 1; i <= 32; i++) {
        if (!nt[i-1]) continue;
        if (i === b.minId) nt[i-1] = { ...nt[i-1], [`${day}_span`]: span, [`${day}_hidden`]: false };
        else if (i > b.minId && i <= b.maxId) nt[i-1] = { ...nt[i-1], [`${day}_span`]: 1, [`${day}_hidden`]: true };
        else if (i < b.minId && nt[i-1][`${day}_span`] > 1 && i + nt[i-1][`${day}_span`] - 1 >= b.minId) nt[i-1] = { ...nt[i-1], [`${day}_span`]: b.minId - i };
      }
    }
    setTimetable(repairTimetable(nt)); setSelection({ startDay: null, endDay: null, startId: null, endId: null });
  };

  const unmergeCells = () => {
    const b = getSelectionBounds(); if (!b) return; saveToHistory(); let nt = [...safeTimetable];
    for (let d = b.minDayIdx; d <= b.maxDayIdx; d++) {
      const day = DAYS[d];
      for (let i = 0; i < 32; i++) { if (nt[i] && !nt[i][`${day}_hidden`] && nt[i].id <= b.maxId && nt[i].id + (nt[i][`${day}_span`]||1) - 1 >= b.minId) { const sp = nt[i][`${day}_span`]||1; for(let j=0; j<sp; j++) if(i+j<32 && nt[i+j]) nt[i+j] = {...nt[i+j], [`${day}_span`]: 1, [`${day}_hidden`]: false }; } }
    }
    setTimetable(repairTimetable(nt)); setSelection({ startDay: null, endDay: null, startId: null, endId: null });
  };

  const executeResetTimetable = () => { saveToHistory(); if (activeTab === 'WEEKLY') setTimetable(generateTimeSlots()); else if (activeTab === 'MONTHLY') setTermScheduler({ subjects: [], cells: {}, status: {}, textbooks: {}, topNotes: {}, checks: {} }); setSelection({ startDay: null, endDay: null, startId: null, endId: null }); setMonthlySelection({ r1: null, c1: null, r2: null, c2: null }); setShowResetConfirm(false); };
  const addColorRule = () => { if (!newColorRule.keyword.trim()) return; setColorRules([...safeColors, { ...newColorRule, id: Date.now() }]); setNewColorRule({ ...newColorRule, keyword: '' }); };
  const removeColorRule = (id) => setColorRules(safeColors.filter((rule) => rule.id !== id));
  const getCellColor = (text) => { if (!text) return null; const r = safeColors.find((r) => r.keyword && safeStr(text).includes(r.keyword)); return r ? r.color : null; };
  const handlePrev4Weeks = () => setCurrentDate(p => { const d = new Date(p); d.setDate(d.getDate() - 28); return d; });
  const handleNext4Weeks = () => setCurrentDate(p => { const d = new Date(p); d.setDate(d.getDate() + 28); return d; });
  const handleTermCellChange = (sub, dt, v) => setTermScheduler(p => ({ ...p, cells: { ...(p.cells||{}), [`${sub}-${dt}`]: safeStr(v) } }));
  const handleTermCheckToggle = (sub, dt, i) => { saveToHistory(); setTermScheduler(p => ({ ...p, checks: { ...(p.checks||{}), [`${sub}-${dt}-${i}`]: !(p.checks||{})[`${sub}-${dt}-${i}`] } })); };
  const handleTopNoteChange = (dt, v) => setTermScheduler(p => ({ ...p, topNotes: { ...(p.topNotes||{}), [dt]: safeStr(v) } }));
  const handleTermTextbookChange = (sub, v) => setTermScheduler(p => ({ ...p, textbooks: { ...(p.textbooks||{}), [sub]: safeStr(v) } }));
  const addSubjectRow = (n) => { if (!n || tsSubjects.includes(safeStr(n))) return; saveToHistory(); setTermScheduler(p => ({ ...p, subjects: [...(p.subjects||[]), safeStr(n)] })); };
  const removeSubjectRow = (n) => { saveToHistory(); setTermScheduler(p => ({ ...p, subjects: (p.subjects||[]).filter(s => s !== n) })); };

  const callGeminiAPI = async (sys, usr, retries = 5) => {
    if (!globalAiKey) { setAiFeedback('⚠️ API 키 없음'); return null; }
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: sys + '\n' + usr }] }] }) });
        const result = await response.json();
        if (result.error) { if (result.error.code === 429 && i < retries - 1) { await new Promise(r => setTimeout(r, Math.pow(2, i) * 2000)); continue; } throw new Error(result.error.message); }
        return result.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (error) { if (i === retries - 1) { setAiFeedback(`❌ 오류`); return null; } }
    } return null;
  };

  const handleAiSubmit = async (e) => {
    e.preventDefault(); if (!aiPrompt.trim()) return; setIsAiProcessing(true); setAiFeedback('AI 조교 처리 중...');
    const sys = { WEEKLY: `주간 플래너 전문가. { "type": "UPDATE_TIMETABLE", "updates": [{ "day": "mon|tue|wed|thu|fri|sat|sun", "startTime": "HH:MM", "endTime": "HH:MM", "content": "내용" }] }`, MONTHLY: `데이터 채우기. 과목: [${tsSubjects.join(', ')}]. { "type": "UPDATE_TERM_SCHEDULER", "cells": [{ "subject": "과목명", "date": "YYYY-MM-DD", "content": "내용" }] }`, YEARLY: `연간 플래너. { "type": "UPDATE_YEARLY", "plans": ["1월", ..., "12월"] }` };
    const txt = await callGeminiAPI(sys[activeTab], `요청: "${aiPrompt}" / 날짜: ${JSON.stringify(allDates.map(d=>d.full))}`);
    if (txt) {
      try {
        const res = JSON.parse(txt.replace(/```json/g, '').replace(/```/g, '').trim()); saveToHistory();
        if (res.type === 'UPDATE_TIMETABLE' && activeTab === 'WEEKLY') {
          let nt = [...safeTimetable];
          res.updates.forEach((u) => {
            const sIdx = ((h, m) => (h - 8) * 2 + (m === 30 ? 1 : 0))(...u.startTime.split(':').map(Number)); const eIdx = ((h, m) => (h - 8) * 2 + (m === 30 ? 1 : 0))(...u.endTime.split(':').map(Number)) - 1;
            if (sIdx >= 0 && eIdx <= 31 && sIdx <= eIdx) {
              const sId = sIdx + 1, eId = eIdx + 1, span = eId - sId + 1;
              for (let i = 1; i <= 32; i++) {
                if (!nt[i-1]) continue;
                if (i === sId) nt[i-1] = { ...nt[i-1], [`${u.day}_span`]: span, [`${u.day}_hidden`]: false, [u.day]: safeStr(u.content) };
                else if (i > sId && i <= eId) nt[i-1] = { ...nt[i-1], [`${u.day}_span`]: 1, [`${u.day}_hidden`]: true };
                else if (i < sId && nt[i-1][`${u.day}_span`] > 1 && i + nt[i-1][`${u.day}_span`] - 1 >= sId) nt[i-1] = { ...nt[i-1], [`${u.day}_span`]: sId - i };
              }
            }
          });
          setTimetable(repairTimetable(nt)); setAiFeedback('✅ 주간 반영 완료!');
        } else if (res.type === 'UPDATE_TERM_SCHEDULER' && activeTab === 'MONTHLY') {
          let nc = { ...tsCells }; res.cells?.forEach(c => { if(tsSubjects.includes(c.subject)) nc[`${c.subject}-${c.date}`] = nc[`${c.subject}-${c.date}`] ? `${nc[`${c.subject}-${c.date}`]}\n${safeStr(c.content)}` : safeStr(c.content); });
          setTermScheduler(p => ({ ...p, cells: nc })); setAiFeedback('✅ 월간 추가 완료!');
        } else if (res.type === 'UPDATE_YEARLY' && activeTab === 'YEARLY') { setYearlyPlan(res.plans); setAiFeedback('✅ 연간 반영 완료!'); }
      } catch (e) { setAiFeedback('❌ 해석 실패.'); }
    }
    setAiPrompt(''); setIsAiProcessing(false); setTimeout(() => { if (!txt) setShowAiModal(false); setAiFeedback(''); }, 3000);
  };

  const handleTeacherLogin = (e) => { e.preventDefault(); if (teacherPassword === '551000') { localStorage.setItem('planner_role', 'teacher'); setRole('teacher'); setView('TEACHER_DASHBOARD'); setTeacherPassword(''); } else setErrorMsg('불일치'); };
  const handleLogout = () => setShowLogoutConfirm(true);
  const executeLogout = () => { localStorage.removeItem('planner_role'); localStorage.removeItem('planner_name'); setView('LANDING'); setRole(''); setStudentName(''); setCurrentDocId(null); setShowLogoutConfirm(false); window.history.replaceState({}, '', window.location.pathname); };
  const handleTimetableChange = (id, day, v) => setTimetable((p) => p.map((r) => r.id === id ? { ...r, [day]: safeStr(v) } : r));
  const handleYearlyChange = (i, v) => { const n = [...safeYearly]; n[i] = safeStr(v); setYearlyPlan(n); };
  const handleDeleteStudent = (e, id) => { e.stopPropagation(); setStudentToDelete(id); };
  const executeDeleteStudent = async () => { if (!studentToDelete) return; try { await deleteDoc(doc(db, 'planners', studentToDelete)); setStudentToDelete(null); } catch (e) {} };

  if (view === 'LOADING') return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50"><div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div></div>;
  if (view === 'PLANNER_DELETED_BLANK') return <div className="min-h-screen bg-slate-50" />;
  if (isNotFound && view === 'PLANNER') return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6"><h1 className="text-2xl font-black mb-2">삭제된 플래너입니다.</h1><button onClick={() => setView('PLANNER_DELETED_BLANK')} className="px-8 py-3 bg-slate-800 text-white rounded-xl">확인</button></div>;

  const wB = getSelectionBounds(); const isWM = wB && (wB.minId !== wB.maxId || wB.minDayIdx !== wB.maxDayIdx);
  const mb = getMonthlyBounds();

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 transition-colors duration-300">
      <div className="w-full mx-auto">
        {view === 'LANDING' && (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-center">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 transform transition-all hover:scale-[1.01]">
              <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-10 text-center relative overflow-hidden"><div className="w-20 h-20 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner"><BookOpen className="w-10 h-10 text-white" /></div><h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">스마트 학습 플래너</h1></div>
              <div className="p-8 space-y-4 bg-white text-center"><button onClick={() => setView('TEACHER_LOGIN')} className="w-full p-5 rounded-2xl border-2 border-slate-100 hover:border-slate-500 hover:bg-slate-50 flex items-center gap-5 group transition-all shadow-sm"><div className="p-4 bg-slate-100 text-slate-600 rounded-xl group-hover:bg-slate-700 group-hover:text-white transition-colors"><Users size={24} /></div><div className="text-left"><div className="font-extrabold text-lg text-slate-800">관리자 로그인</div></div></button></div>
            </div>
          </div>
        )}

        {view === 'TEACHER_LOGIN' && (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 text-center">
            <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
              <button onClick={() => setView('LANDING')} className="text-slate-400 mb-8 flex items-center gap-2 text-sm font-medium hover:text-slate-700 transition-colors bg-slate-50 px-4 py-2 rounded-lg w-fit"><ChevronLeft className="w-4 h-4" /> 뒤로</button>
              <div className="mb-8"><h2 className="text-3xl font-extrabold text-slate-800 mb-2">관리자 로그인</h2></div>
              <form onSubmit={handleTeacherLogin} className="space-y-6">
                <div className="space-y-2 text-center"><input type="password" value={teacherPassword} onChange={(e) => setTeacherPassword(e.target.value)} placeholder="비밀번호" className="w-full p-4 border-2 border-slate-200 rounded-2xl outline-none focus:ring-4 focus:border-indigo-500 transition-all text-lg font-medium text-center" autoFocus /></div>
                {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2 justify-center"><AlertCircle size={16}/> {errorMsg}</div>}
                <button type="submit" className="w-full text-white p-5 rounded-2xl font-extrabold text-lg transition-all shadow-lg bg-slate-800 hover:bg-slate-900">접속</button>
              </form>
            </div>
          </div>
        )}

        {view === 'TEACHER_DASHBOARD' && (
          <div className="min-h-screen bg-slate-50 p-4 md:p-8 text-center">
            <div className="max-w-6xl mx-auto">
              <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100 text-center">
                <div><h1 className="text-3xl font-extrabold flex items-center gap-3 text-slate-800 mb-2"><Users className="text-indigo-600 w-8 h-8" /> 관리자 대시보드</h1><p className="text-slate-500 font-medium text-center">총 {studentList.length}명</p></div>
                <div className="flex flex-wrap gap-3 mt-4 md:mt-0 justify-center">
                  <button onClick={createNewStudentSheet} className="text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"><UserPlus className="w-5 h-5" /> 학생 추가</button>
                  <button onClick={() => setShowGlobalKeyInput(!showGlobalKeyInput)} className="text-white bg-slate-800 hover:bg-slate-900 px-5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg"><Settings className="w-5 h-5" /> AI 키</button>
                  <button onClick={handleLogout} className="text-slate-500 hover:text-red-600 hover:bg-red-50 px-5 py-3 rounded-xl font-bold flex items-center gap-2 bg-slate-100"><LogOut className="w-5 h-5" /> 로그아웃</button>
                </div>
              </header>
              {showGlobalKeyInput && (
                <div className="mb-10 p-8 bg-indigo-50 rounded-3xl border-2 border-indigo-100 animate-fade-in shadow-inner text-center">
                  <h3 className="text-lg font-black text-indigo-900 mb-4 flex items-center justify-center gap-2"><Key className="w-5 h-5"/> AI 공용 API 키</h3>
                  <div className="flex flex-col md:flex-row gap-4 justify-center">
                    <input type="password" value={globalAiKey} onChange={(e) => setGlobalAiKey(e.target.value)} className="flex-1 max-w-lg p-4 rounded-2xl border-2 border-indigo-200 outline-none focus:border-indigo-500 text-lg font-mono text-center" />
                    <button onClick={saveGlobalAiKey} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-extrabold text-lg shadow-lg">저장</button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 text-center">
                {studentList.map((st) => (
                  <div key={st.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:border-indigo-500 transition-all flex flex-col justify-between h-48 group text-center">
                    <div className="flex justify-between items-start">
                      <div onClick={() => { setCurrentDocId(st.id); setView('PLANNER'); setRole('teacher'); }} className="cursor-pointer text-center w-full"><span className="text-xl font-extrabold text-slate-800 block mb-1">{st.studentName || '이름 없음'}</span></div>
                      <button onClick={(e) => handleDeleteStudent(e, st.id)} className="text-slate-300 hover:text-red-500 p-2"><Trash2 size={18} /></button>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => copyStudentLink(st.id)} className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${copyFeedback === st.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{copyFeedback === st.id ? <><Check size={14}/> 복사됨</> : <><LinkIcon size={14}/> 복사</>}</button>
                      <button onClick={() => { setCurrentDocId(st.id); setView('PLANNER'); setRole('teacher'); }} className="px-4 py-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><ChevronRight size={18}/></button>
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
                    <div className="font-extrabold text-xl tracking-tight">{studentName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                  <div className="flex p-1.5 rounded-xl shadow-inner bg-slate-100 flex-1 md:flex-none justify-center">
                    {['WEEKLY', 'MONTHLY', 'YEARLY'].map((tab) => (
                      <button key={tab} onClick={() => { setActiveTab(tab); setSelection({ startDay: null, endDay: null, startId: null, endId: null }); setMonthlySelection({ r1: null, c1: null, r2: null, c2: null }); setIsEditMode(false); setEditingCell(null); }} className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-extrabold transition-all duration-300 ${activeTab === tab ? "bg-white text-indigo-700 shadow-md scale-[1.02]" : "text-slate-400 hover:text-slate-600"}`}>{tab === 'WEEKLY' ? '주간' : tab === 'MONTHLY' ? '월간' : '연간'}</button>
                    ))}
                  </div>
                  {role === 'teacher' && <div className="hidden md:flex items-center gap-2 border-l pl-3 ml-1 border-slate-200"><button onClick={handleLogout} className="p-2.5 rounded-xl hover:bg-red-50 text-red-500 transition-colors"><LogOut className="w-5 h-5" /></button></div>}
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
                              <Calendar className="w-3 h-3 md:w-4 md:h-4" /><span className="font-bold">{dDay.title} ({calculateDDay(dDay.date)})</span>
                              <button onClick={() => setDDay(null)} className="hover:text-red-200 p-0.5"><X className="w-3 h-3 md:w-4 md:h-4" /></button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 md:gap-2 p-1 md:p-1.5 rounded-xl border border-slate-200 bg-slate-50 shadow-inner flex-wrap md:flex-nowrap justify-center">
                              <input type="text" placeholder="D-day" className="w-20 md:w-32 p-1.5 md:p-2.5 text-xs md:text-sm rounded-lg outline-none font-medium bg-white border border-slate-100 focus:border-indigo-500 text-center" value={dDayInput.title} onChange={(e) => setDDayInput({ ...dDayInput, title: e.target.value })}/>
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
                                {safeColors.map((rule) => (
                                  <div key={rule.id} className="flex items-center justify-between text-xs md:text-sm p-2 md:p-3 rounded-xl border border-slate-100 bg-slate-50 group hover:border-indigo-200 transition-colors text-center">
                                    <div className="flex items-center gap-2 md:gap-3 font-bold"><div className="w-4 h-4 md:w-5 md:h-5 rounded-full shadow-inner border border-black/10" style={{ backgroundColor: rule.color }}></div><span>{rule.keyword}</span></div>
                                    <button onClick={() => removeColorRule(rule.id)} className="p-1 md:p-1.5 rounded-lg transition-colors opacity-100 md:opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50"><X className="w-3 h-3 md:w-4 md:h-4" /></button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="h-5 md:h-8 w-px mx-0.5 md:mx-1 bg-slate-200 text-center"></div>
                          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold whitespace-nowrap mr-1 border border-indigo-100"><Sparkles size={12}/> 더블클릭/타이핑 수정, 방향키 호환</div>
                          {isWM ? <button onClick={mergeCells} className="flex items-center gap-1 md:gap-2 bg-indigo-600 text-white px-2 md:px-4 py-1.5 md:py-2 rounded-lg shadow-md hover:bg-indigo-700 font-extrabold"><Merge className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">병합</span></button> : <div className="flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2 rounded-lg font-medium border border-dashed border-slate-200 text-slate-400 bg-slate-50 select-none"><MousePointer2 className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">드래그</span></div>}
                          <button onClick={unmergeCells} className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg font-bold shadow-sm transition-colors border border-slate-200 text-slate-700 hover:bg-slate-50"><Split className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">분할</span></button>
                          <button onClick={() => setShowResetConfirm(true)} className="flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg font-bold transition-colors ml-0 md:ml-1 bg-red-50 text-red-600 hover:bg-red-100"><Trash2 className="w-3 h-3 md:w-4 md:h-4" /> <span className="hidden sm:inline">초기화</span></button>
                        </div>
                      </div>
                      
                      <div className="w-full relative select-none rounded-xl border-2 border-slate-200 bg-white shadow-inner text-center" onMouseLeave={handleMouseUp}>
                        <table className="w-full text-center border-collapse min-w-[320px] md:min-w-full table-fixed outline-none" tabIndex={-1}>
                          <thead className="z-20 shadow-sm border-b-2 border-slate-200 text-slate-800">
                            <tr>
                              <th className="bg-slate-50 py-1 md:py-2 w-10 md:w-16 border-r border-slate-200 uppercase tracking-widest text-[8px] md:text-[10px] font-black text-slate-400 z-20 align-middle">
                                <Clock className="w-3 h-3 mx-auto mb-0.5 opacity-50 hidden md:block"/><span className="md:hidden">시간</span><span className="hidden md:inline">Time</span>
                              </th>
                              {DAYS.map((d, i) => {
                                const lblL = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
                                const lblS = ['월', '화', '수', '목', '금', '토', '일'];
                                const isC = wB && i >= wB.minDayIdx && i <= wB.maxDayIdx;
                                const tc = (d === 'sat') ? 'text-blue-500' : (d === 'sun') ? 'text-red-500' : '';
                                return (
                                  <th key={d} className={`py-1 md:py-2 font-black text-[10px] md:text-xs border-r border-slate-200 z-20 align-middle transition-colors ${isC ? 'bg-indigo-100 text-indigo-800' : `bg-slate-50 ${tc}`}`}>
                                    <span className="hidden md:inline">{lblL[i]}</span><span className="md:hidden">{lblS[i]}</span>
                                  </th>
                                );
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {safeTimetable.map((row) => {
                              if (!row || row.id == null) return null;
                              const isTimeRowSelected = wB && row.id >= wB.minId && row.id <= wB.maxId;
                              return (
                              <tr key={row.id} className="group text-center">
                                <td className={`p-0 w-10 md:w-16 border border-slate-200 align-middle transition-colors select-none ${isTimeRowSelected ? 'bg-indigo-100 text-indigo-800 font-extrabold' : 'bg-slate-50/50 text-slate-400 font-medium'}`}>
                                  <div className="flex flex-col items-center justify-center h-full text-[8px] md:text-[10px]"><span>{row.time}</span></div>
                                </td>
                                {DAYS.map((day) => {
                                  if (row[`${day}_hidden`]) return null;
                                  
                                  const dayIdx = DAYS.indexOf(day); const cellKey = `W-${row.id}-${day}`;
                                  const isSel = wB && row.id >= wB.minId && row.id <= wB.maxId && dayIdx >= wB.minDayIdx && dayIdx <= wB.maxDayIdx;
                                  const isPri = wB && row.id === wB.minId && dayIdx === wB.minDayIdx;
                                  const isEditingLocal = isPri && isEditMode && editingCell === cellKey;
                                  const val = safeStr(row[day]);
                                  const keywordColor = getCellColor(val);
                                  const bgColor = isSel && !isEditingLocal ? 'rgba(224, 231, 255, 0.8)' : (keywordColor || 'transparent');
                                  
                                  return (
                                    <td id={`td-${cellKey}`} key={day} tabIndex={isSel ? -1 : 0}
                                      className={`p-0 relative align-middle border border-slate-200 transition-colors outline-none cursor-cell ${isSel && !isEditingLocal ? 'ring-2 ring-indigo-500 ring-inset z-10' : 'hover:bg-indigo-50/30'}`} 
                                      style={{ backgroundColor: bgColor }} rowSpan={row[`${day}_span`] || 1} 
                                      onMouseDown={(e) => handleMouseDown(e, day, row.id)} onMouseEnter={() => handleMouseEnter(day, row.id)}
                                      onDoubleClick={() => { saveToHistory(); setOriginalCellValue(val); setIsEditMode(true); setEditingCell(cellKey); setTimeout(() => { const el = document.getElementById(`cell-${cellKey}`); if (el) { el.focus(); el.selectionStart = el.value.length; el.selectionEnd = el.value.length; } }, 0); }}
                                      onKeyDown={(e) => handleCellKeyDown(e, 'WEEKLY', row.id, dayIdx, val)}
                                    >
                                      <div className="w-full h-full relative flex items-center justify-center p-0.5 min-h-[24px] md:min-h-[28px] overflow-hidden">
                                        {isPri && (
                                          <textarea id={`cell-${cellKey}`} value={val} 
                                            onChange={(e) => { if (!isEditMode) { saveToHistory(); setOriginalCellValue(val); setIsEditMode(true); setEditingCell(cellKey); } handleTimetableChange(row.id, day, e.target.value); }} 
                                            onInput={autoResize} onFocus={(e) => { if (!isEditMode) e.target.select(); handleFocus(e); }} onBlur={handleBlur}
                                            rows={1} className={`w-full h-full text-center bg-transparent resize-none outline-none overflow-hidden font-bold leading-tight text-[10px] md:text-xs align-middle absolute inset-0 m-0.5 ${isEditingLocal ? 'bg-white shadow-md z-20 focus:ring-2 focus:ring-indigo-500 rounded-sm text-slate-800 pointer-events-auto' : 'opacity-0 pointer-events-none z-0 focus:opacity-0 focus:ring-0 focus:outline-none'}`} 
                                          />
                                        )}
                                        <div className={`w-full h-full whitespace-pre-wrap font-bold text-[10px] md:text-xs text-slate-800 break-words flex items-center justify-center pointer-events-none p-1 select-none ${isEditingLocal ? 'opacity-0' : 'opacity-100'}`}>{val}</div>
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
                        <div className="font-extrabold text-slate-600 text-sm hidden sm:block">{currentDate.getFullYear()}.{String(currentDate.getMonth() + 1).padStart(2, '0')}.{String(currentDate.getDate()).padStart(2, '0')} 기준</div>
                      </div>
                      <div className="flex gap-3 text-center">
                        <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold whitespace-nowrap mr-2 shadow-sm border border-indigo-100"><Sparkles size={12}/> 자동 하이라이트 & 타이핑 지원</div>
                        <button onClick={() => { const name = prompt("추가할 과목명을 입력하세요"); if(name) addSubjectRow(name.trim()); }} className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 bg-indigo-600 text-white rounded-xl font-extrabold text-xs md:text-sm hover:bg-indigo-700 shadow-md transition-all text-center"><Plus size={16}/> <span className="hidden sm:inline">과목 추가</span></button>
                        <button onClick={() => setShowResetConfirm(true)} className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl font-extrabold text-xs md:text-sm hover:bg-red-100 transition-all text-center"><Trash2 size={16}/> <span className="hidden sm:inline">일정 초기화</span></button>
                      </div>
                    </div>

                    {[0, 1].map((blockIdx) => {
                      const cS = blockIdx * 14; const chunk = allDates.slice(cS, cS + 14);
                      return (
                        <div key={blockIdx} className="w-full relative select-none" onMouseLeave={handleMouseUp}>
                          <table className="w-full border-collapse mb-10 text-[9px] md:text-[11px] table-fixed text-center align-middle outline-none" tabIndex={-1}>
                            <thead>
                              <tr className="bg-slate-50 text-center">
                                <th className={`border border-slate-300 w-[6%] py-2 text-center font-black align-middle transition-colors ${mb && mb.minR <= 0 && 0 <= mb.maxR ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-50'}`} rowSpan={2}>과목</th>
                                <th className={`border border-slate-300 w-[6%] py-2 text-center font-black align-middle transition-colors ${mb && mb.minR <= 0 && 0 <= mb.maxR ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-50'}`} rowSpan={2}>교재</th>
                                {chunk.map((d, i) => {
                                  const cIdx = cS + i; const isColSel = mb && cIdx >= mb.minC && cIdx <= mb.maxC;
                                  let tc = isColSel ? 'text-indigo-800' : (d.isSat ? 'text-blue-500' : d.isWeekend ? 'text-red-500' : 'text-slate-600');
                                  return <th key={i} className={`border border-slate-300 py-1 font-bold text-center align-middle transition-colors ${isColSel ? 'bg-indigo-100' : 'bg-slate-50'} ${tc}`}>{d.day}</th>;
                                })}
                              </tr>
                              <tr className="bg-slate-50 text-center">
                                {chunk.map((d, i) => {
                                   const cIdx = cS + i; const isColSel = mb && cIdx >= mb.minC && cIdx <= mb.maxC;
                                   let tc = isColSel ? 'text-indigo-800' : (d.isSat ? 'text-blue-500' : d.isWeekend ? 'text-red-500' : 'text-slate-600');
                                   return <th key={i} className={`border border-slate-300 py-1 font-bold text-center align-middle transition-colors ${isColSel ? 'bg-indigo-100' : 'bg-slate-50'} ${tc}`}>{d.label}</th>;
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="bg-white text-center">
                                <td colSpan={2} className={`border border-slate-300 text-center font-black align-middle py-1 transition-colors ${mb && mb.minR === 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-50 text-black'}`}>비고</td>
                                {chunk.map((d, i) => {
                                  const cIdx = cS + i; const rIdx = 0; const cellKey = `note-${d.full}`;
                                  const isSel = mb && rIdx >= mb.minR && rIdx <= mb.maxR && cIdx >= mb.minC && cIdx <= mb.maxC;
                                  const isPri = mb && rIdx === mb.minR && cIdx === mb.minC;
                                  const isEditingLocal = isPri && isEditMode && editingCell === cellKey; 
                                  const val = safeStr(tsTopNotes[d.full]);
                                  return (
                                    <td id={`td-M-${rIdx}-${cIdx}`} key={cellKey} tabIndex={isSel ? -1 : 0}
                                      onMouseDown={(e) => handleMonthlyMouseDown(e, rIdx, cIdx)} onMouseEnter={() => handleMonthlyMouseEnter(rIdx, cIdx)} 
                                      onDoubleClick={() => { saveToHistory(); setOriginalCellValue(val); setIsEditMode(true); setEditingCell(cellKey); setTimeout(() => { const el = document.getElementById(`cell-${cellKey}`); if (el) { el.focus(); el.selectionStart = el.value.length; el.selectionEnd = el.value.length; } }, 10); }}
                                      onKeyDown={(e) => handleCellKeyDown(e, 'MONTHLY', rIdx, cIdx, val)}
                                      className={`border border-slate-300 p-0 align-middle text-center cursor-cell transition-colors outline-none ${isSel && !isEditingLocal ? 'ring-2 ring-indigo-500 ring-inset z-10 bg-indigo-50/80' : 'hover:bg-slate-50'}`}
                                    >
                                      <div className="w-full h-full relative flex items-center justify-center p-0.5 min-h-[30px] overflow-hidden">
                                        {isPri && (
                                            <textarea id={`cell-${cellKey}`} value={val} 
                                              onChange={(e) => { if (!isEditMode) { saveToHistory(); setOriginalCellValue(val); setIsEditMode(true); setEditingCell(cellKey); } handleTopNoteChange(d.full, e.target.value); }} 
                                              onInput={autoResize} onFocus={(e) => { if (!isEditMode) e.target.select(); handleFocus(e); }} onBlur={handleBlur}
                                              rows={1} className={`w-full h-full bg-transparent resize-none outline-none overflow-hidden font-bold leading-tight align-middle absolute inset-0 m-0.5 ${isEditingLocal ? 'bg-white shadow-md z-20 focus:ring-2 focus:ring-indigo-500 rounded-sm text-slate-800 pointer-events-auto' : 'opacity-0 pointer-events-none z-0 focus:opacity-0 focus:ring-0 focus:outline-none'}`} 
                                            />
                                        )}
                                        <div className={`w-full h-full min-h-[30px] flex items-center justify-center p-1 whitespace-pre-wrap font-bold text-slate-800 pointer-events-none break-words ${isEditingLocal ? 'opacity-0' : 'opacity-100'}`}>{val}</div>
                                      </div>
                                    </td>
                                  )
                                })}
                              </tr>
                              {tsSubjects.map((sub, sIdx) => {
                                const rIdx = sIdx + 1; const isRowSelected = mb && rIdx >= mb.minR && rIdx <= mb.maxR;
                                return (
                                  <tr key={sub} className="text-center align-middle">
                                    <td className={`border border-slate-300 px-1 py-1 font-black text-center relative group align-middle break-keep transition-colors ${isRowSelected ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-50/50'}`}>
                                      {sub} <button onClick={() => removeSubjectRow(sub)} className="absolute right-0.5 top-0.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity text-center"><X size={10}/></button>
                                    </td>
                                    <td className={`border border-slate-300 p-0 align-middle text-center bg-white cursor-cell transition-colors outline-none ${isRowSelected ? 'bg-indigo-100/50' : 'bg-white'}`} onDoubleClick={() => { setEditingCell(`tb-${sub}`); setIsEditMode(true); setTimeout(() => { const el = document.getElementById(`tb-${sub}`); if (el) { el.focus(); el.selectionStart = el.value.length; el.selectionEnd = el.value.length; } }, 10); }}>
                                      <div className="w-full h-full flex items-center justify-center p-1 min-h-[40px] relative">
                                        {editingCell === `tb-${sub}` && isEditMode ? (
                                          <textarea id={`tb-${sub}`} autoFocus value={safeStr(tsTextbooks[sub])} onChange={(e) => handleTermTextbookChange(sub, e.target.value)} onInput={autoResize} onFocus={handleFocus} onBlur={() => {setIsEditMode(false); setEditingCell(null);}} placeholder="입력" rows={1} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); setEditingCell(null); setIsEditMode(false); } }} className="w-full h-full bg-white resize-none outline-none overflow-hidden font-bold text-center text-slate-700 leading-tight align-middle focus:ring-2 focus:ring-indigo-500 shadow-md rounded-sm absolute inset-0 z-20 m-0.5" />
                                        ) : <div className="w-full h-full whitespace-pre-wrap font-bold text-slate-700 pointer-events-none select-none flex items-center justify-center">{safeStr(tsTextbooks[sub])}</div>}
                                      </div>
                                    </td>
                                    {chunk.map((d, i) => {
                                      const cIdx = cS + i; const cellKey = `${sub}-${d.full}`;
                                      const val = safeStr(tsCells[cellKey]); const lines = val.split('\n').filter(l => l.trim() !== '');
                                      const isSel = mb && rIdx >= mb.minR && rIdx <= mb.maxR && cIdx >= mb.minC && cIdx <= mb.maxC;
                                      const isPrimary = mb && rIdx === mb.minR && cIdx === mb.minC;
                                      const isEditingLocal = isPrimary && isEditMode && editingCell === cellKey;
                                      return (
                                        <td id={`td-M-${rIdx}-${cIdx}`} key={cellKey} tabIndex={isSel ? -1 : 0}
                                          onMouseDown={(e) => handleMonthlyMouseDown(e, rIdx, cIdx)} onMouseEnter={() => handleMonthlyMouseEnter(rIdx, cIdx)} 
                                          onDoubleClick={() => { saveToHistory(); setOriginalCellValue(val); setIsEditMode(true); setEditingCell(cellKey); setTimeout(() => { const el = document.getElementById(`cell-${cellKey}`); if (el) { el.focus(); el.selectionStart = el.value.length; el.selectionEnd = el.value.length; } }, 10); }}
                                          onKeyDown={(e) => handleCellKeyDown(e, 'MONTHLY', rIdx, cIdx, val)}
                                          className={`border border-slate-300 p-0 align-middle transition-colors relative text-center outline-none cursor-cell ${isSel && !isEditingLocal ? 'ring-2 ring-indigo-500 ring-inset z-10 bg-indigo-50/80' : 'bg-white hover:bg-slate-50'}`}
                                        >
                                          <div className="w-full h-full flex flex-col justify-center items-center p-0.5 text-center min-h-[50px] relative overflow-hidden">
                                            {isPrimary && (
                                                <textarea id={`cell-${cellKey}`} value={val} 
                                                  onChange={(e) => { if (!isEditMode) { saveToHistory(); setOriginalCellValue(val); setIsEditMode(true); setEditingCell(cellKey); } handleTermCellChange(sub, d.full, e.target.value); }} 
                                                  onFocus={(e) => { if (!isEditMode) e.target.select(); handleFocus(e); }} onBlur={handleBlur}
                                                  rows={1} className={`w-full h-full bg-transparent resize-none outline-none overflow-hidden font-bold leading-tight align-middle absolute inset-0 m-0.5 ${isEditingLocal ? 'bg-white shadow-md z-20 focus:ring-2 focus:ring-indigo-500 rounded-sm text-slate-800 pointer-events-auto' : 'opacity-0 pointer-events-none z-0 focus:opacity-0 focus:ring-0 focus:outline-none'}`} 
                                                />
                                            )}
                                            <div className={`w-full h-full flex flex-col gap-1.5 px-1 justify-center min-h-[40px] select-none ${isEditingLocal ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                                                {val.trim() === '' ? ( <span className="text-transparent block pointer-events-none">.</span> ) : (
                                                    lines.map((line, idx) => (
                                                        <div key={idx} className="flex items-center justify-center gap-1 bg-white/70 rounded px-1 py-1 shadow-sm border border-black/5 mx-auto w-[95%] pointer-events-auto">
                                                            <span className="text-[9px] md:text-[10px] font-black text-slate-800 leading-tight text-center flex-1 break-words whitespace-pre-wrap pointer-events-none">{line}</span>
                                                            <input type="checkbox" checked={tsChecks[`${sub}-${d.full}-${idx}`] || false} 
                                                            onChange={(e) => { e.stopPropagation(); handleTermCheckToggle(sub, d.full, idx); }} 
                                                            onDoubleClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className="w-3 h-3 md:w-4 md:h-4 cursor-pointer accent-indigo-600 flex-shrink-0" />
                                                        </div>
                                                    ))
                                                )}
                                            </div>
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

                    {tsSubjects.length > 0 && (
                      <div className="text-left flex justify-center w-full text-center mt-6">
                        <table className="w-full border-collapse text-[10px] md:text-[11px] shadow-md rounded-2xl overflow-hidden border border-slate-200 text-center table-fixed align-middle">
                          <thead>
                            <tr className="bg-slate-100 font-black text-slate-800 text-center">
                              <th className="border border-slate-200 w-[10%] py-3 md:py-4 align-middle text-center break-keep">과목</th><th className="border border-slate-200 w-[10%] align-middle text-center break-keep">교재</th><th className="border border-slate-200 w-[10%] align-middle text-center break-keep">시작</th><th className="border border-slate-200 w-[10%] align-middle text-center break-keep">목표</th><th className="border border-slate-200 w-[60%] align-middle text-center break-keep">달성도</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tsSubjects.map((sub) => {
                              const tbV = safeStr(tsTextbooks[sub]); const tbNames = Array.from(new Set(tbV.split('\n').map(t => t.trim()).filter(t => t !== ''))); const rData = [];
                              if (tbNames.length === 0) {
                                let fD = "-", lD = "-", tot = 0, chk = 0;
                                allDates.forEach(d => { const v = safeStr(tsCells[`${sub}-${d.full}`]); if (v.trim() !== "") v.split('\n').forEach((l, i) => { if (l.trim() !== "") { if (fD === "-") fD = l.trim(); lD = l.trim(); tot++; if (tsChecks[`${sub}-${d.full}-${i}`]) chk++; } }); });
                                rData.push({ tb: "-", fD, lD, p: tot > 0 ? Math.round((chk / tot) * 100) : 0 });
                              } else {
                                tbNames.forEach((tb) => {
                                  let fD = "-", lD = "-", tot = 0, chk = 0;
                                  allDates.forEach(d => { const v = safeStr(tsCells[`${sub}-${d.full}`]); if (v.trim() !== "") v.split('\n').forEach((l, i) => { if (l.trim() !== "" && l.trim().includes(tb)) { if (fD === "-") fD = l.trim(); lD = l.trim(); tot++; if (tsChecks[`${sub}-${d.full}-${i}`]) chk++; } }); });
                                  rData.push({ tb, fD, lD, p: tot > 0 ? Math.round((chk / tot) * 100) : 0 });
                                });
                              }
                              return rData.map((dt, idx) => (
                                <tr key={`st-${sub}-${idx}`} className="bg-white hover:bg-slate-50 transition-colors text-center">
                                  {idx === 0 && <td rowSpan={rData.length} className="border border-slate-200 text-center font-black py-3 bg-slate-50/50 align-middle">{sub}</td>}
                                  <td className="border border-slate-200 p-2 text-center font-bold text-slate-700 align-middle break-words whitespace-pre-wrap">{dt.tb}</td><td className="border border-slate-200 bg-slate-50/5 text-center font-black px-2 md:px-3 py-2 text-indigo-700 align-middle break-words whitespace-pre-wrap">{dt.fD}</td><td className="border border-slate-200 bg-slate-50/5 text-center font-black px-2 md:px-3 py-2 text-rose-700 align-middle break-words whitespace-pre-wrap">{dt.lD}</td>
                                  <td className="border border-slate-200 p-2 md:p-3 text-center align-middle">
                                    <div className="relative w-full h-5 md:h-6 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200 mx-auto">
                                      <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-300 to-green-200 transition-all duration-700 ease-out" style={{ width: `${dt.p}%` }} />
                                      <span className="absolute inset-y-0 left-0 right-0 flex items-center justify-center text-[9px] md:text-[10px] font-black text-slate-800 drop-shadow-sm">{dt.p}%</span>
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
                  {safeYearly.map((plan, idx) => (
                    <div key={idx} className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md text-center">
                      <h4 className="font-black text-indigo-600 mb-3 text-center text-center">{idx + 1}월 계획</h4>
                      <textarea value={plan || ''} onChange={(e) => handleYearlyChange(idx, e.target.value)} onInput={autoResize} onFocus={handleFocus} onBlur={handleBlur} placeholder={`${idx + 1}월 마일스톤`} className="w-full p-4 rounded-xl border border-slate-100 outline-none focus:border-indigo-500 transition-all text-sm font-bold resize-none text-center overflow-hidden text-center text-center bg-transparent" />
                    </div>
                  ))}
                </div>
              )}
            </main>

            <div className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-50 flex flex-col items-end text-center">
              {showAiModal ? (
                <div className="w-[360px] md:w-[420px] rounded-3xl shadow-2xl overflow-hidden border border-slate-200 bg-white animate-fade-in text-center">
                  <div className="bg-indigo-600 p-5 text-white flex justify-between items-center text-center"><h3 className="font-extrabold text-lg flex items-center justify-center gap-2 w-full text-center"><Sparkles size={20}/> AI 매직 플래너</h3><button onClick={() => setShowAiModal(false)}><X className="w-5 h-5 text-center" /></button></div>
                  <div className="p-6 text-center text-center text-center">
                    {aiFeedback && <div className="mb-6 p-4 rounded-2xl text-center font-bold animate-pulse bg-emerald-50 text-emerald-600 border border-emerald-100 text-xs leading-relaxed text-center">{aiFeedback}</div>}
                    <form onSubmit={handleAiSubmit} className="relative mt-2 text-center text-center text-center">
                      <input type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="학습 명령을 입력하세요..." className="w-full pl-5 pr-14 py-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-indigo-500 transition-all font-bold text-slate-800 text-center text-center text-center" disabled={isAiProcessing} />
                      <button type="submit" disabled={isAiProcessing || !aiPrompt.trim()} className="absolute right-2 top-2 p-3.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-center"><Send size={20} /></button>
                    </form>
                  </div>
                </div>
              ) : <button onClick={() => setShowAiModal(true)} className="flex items-center justify-center w-16 h-16 bg-indigo-600 text-white rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all text-center"><Sparkles className="w-7 h-7 text-center" /></button>}
            </div>
          </>
        )}

        {showResetConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-center" onClick={() => setShowResetConfirm(false)}>
            <div className="w-full max-w-xs rounded-3xl shadow-2xl p-8 text-center bg-white text-center text-center text-center" onClick={(e) => e.stopPropagation()}>
              <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 text-center text-center text-center text-center text-center"><AlertCircle size={32} /></div>
              <h3 className="font-black text-xl mb-2 text-center text-center text-center text-center text-center">데이터 초기화</h3>
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
