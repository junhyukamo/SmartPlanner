/* eslint-disable */
import React, { useState, useEffect, useRef } from 'react';
import {
  Check, Trash2, Plus, Clock, BookOpen, Calendar, X, Users,
  ChevronLeft, LogOut, Sparkles, Send, MousePointer2, Merge, Split,
  Palette, AlertCircle, Key, Settings, ChevronRight, UserPlus, Link as LinkIcon,
  Minus, Printer
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

// 💡 [A/B/C 콤] 스마트 매크로 자동 치환 함수
const processComboText = (text, day) => {
  if (!text) return text;
  const isSat = (day === 'sat' || day === '토요일' || day === '토');
  let newText = text;

  const times = {
    a: isSat ? '(2:20 - 3:50)' : '(5:20 - 6:50)',
    b: isSat ? '(3:55 - 5:25)' : '(6:55 - 8:25)',
    c: isSat ? '(5:30 - 7:00)' : '(8:30 - 10:00)'
  };

  ['a', 'b', 'c'].forEach(type => {
    const regex = new RegExp(`(?:개별지도\\s*)?${type}콤(?:\\s*\\n?\\s*\\([\\d\\s:~-]+\\))?`, 'ig');
    newText = newText.replace(regex, `개별지도 ${type.toUpperCase()}콤\n${times[type]}`);
  });

  return newText;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('LOADING');
  const [role, setRole] = useState('');
  const [studentName, setStudentName] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [dbError, setDbError] = useState(''); 
  const [globalAiKey, setGlobalAiKey] = useState('');
  const [showGlobalKeyInput, setShowGlobalKeyInput] = useState(false);
  const [currentDocId, setCurrentDocId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadedDocId, setLoadedDocId] = useState(null); 
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
  
  const [fontSize, setFontSize] = useState(12);

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printConfig, setPrintConfig] = useState({
    orientation: 'portrait', 
    scope: 'all',            
    colorMode: 'color'       
  });

  const hasNavigated = useRef(false); 

  const navigateTo = (newView, params = {}) => {
    hasNavigated.current = true;
    window.history.pushState({ view: newView, ...params }, '', '');
    setView(newView);
    if (params.docId !== undefined) setCurrentDocId(params.docId);
    if (params.role !== undefined) setRole(params.role);
    if (params.studentName !== undefined) setStudentName(params.studentName);
  };

  const handleSafeBack = (fallbackView) => {
    if (hasNavigated.current) {
      window.history.back();
    } else {
      if (fallbackView === 'TEACHER_DASHBOARD') {
        navigateTo('TEACHER_DASHBOARD', { role: 'teacher', docId: null });
      } else {
        navigateTo('LANDING', { role: '', docId: null, studentName: '' });
      }
    }
  };

  const openStudentPlannerRef = useRef(null);

  useEffect(() => {
    const handlePopState = (e) => {
      setShowColorModal(false); setShowPrintModal(false); setShowResetConfirm(false); setShowLogoutConfirm(false); setShowAiModal(false); setStudentToDelete(null);
      const state = e.state;
      if (state && state.view) {
        if (state.view === 'PLANNER' && state.docId) {
          if (openStudentPlannerRef.current) openStudentPlannerRef.current(state.docId, state.role, state.studentName, true);
        } else {
          setView(state.view);
          if (state.role !== undefined) setRole(state.role);
          if (state.docId !== undefined) setCurrentDocId(state.docId);
          if (state.studentName !== undefined) setStudentName(state.studentName);
          if (state.view === 'TEACHER_DASHBOARD' || state.view === 'LANDING') setCurrentDocId(null);
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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

  const isDragging = useRef(false);
  const [selection, setSelection] = useState({ startDay: null, endDay: null, startId: null, endId: null });
  const [monthlySelection, setMonthlySelection] = useState({ r1: null, c1: null, r2: null, c2: null });
  const isMonthlyDragging = useRef(false);

  const historyRef = useRef({ past: [], future: [] });
  const currentStateRef = useRef({ timetable, termScheduler, yearlyPlan });
  const focusSnapshotRef = useRef(null);
  const historyLoaded = useRef(false);

  const openStudentPlanner = (studentId, newRole, sName = '', skipHistory = false) => {
    let t = 'WEEKLY', d = new Date(2026, 1, 2), fs = 12;
    try {
      const saved = JSON.parse(localStorage.getItem('planner_student_prefs') || '{}');
      if (saved[studentId]) {
        if (saved[studentId].tab) t = saved[studentId].tab;
        if (saved[studentId].fontSize) fs = saved[studentId].fontSize;
        if (saved[studentId].currentDate) {
          const parsedDate = new Date(saved[studentId].currentDate);
          if (!isNaN(parsedDate)) d = parsedDate;
        }
      }
    } catch (e) {}
    
    setActiveTab(t); setCurrentDate(d); setFontSize(fs);
    setEditingCell(null); setSelection({ startDay: null, endDay: null, startId: null, endId: null }); setMonthlySelection({ r1: null, c1: null, r2: null, c2: null });
    historyRef.current = { past: [], future: [] }; historyLoaded.current = false;
    
    setLoadedDocId(null); setCurrentDocId(studentId);
    if (newRole !== undefined) setRole(newRole);
    if (sName !== undefined) setStudentName(sName);

    if (!skipHistory) {
      hasNavigated.current = true;
      window.history.pushState({ view: 'PLANNER', docId: studentId, role: newRole !== undefined ? newRole : role, studentName: sName !== undefined ? sName : studentName }, '', '');
    }
    setView('PLANNER');
  };

  useEffect(() => { openStudentPlannerRef.current = openStudentPlanner; });

  useEffect(() => {
    if (view === 'PLANNER' && currentDocId) {
      try {
        const saved = JSON.parse(localStorage.getItem('planner_student_prefs') || '{}');
        if (!saved[currentDocId]) saved[currentDocId] = {};
        saved[currentDocId].tab = activeTab;
        saved[currentDocId].fontSize = fontSize;
        saved[currentDocId].currentDate = currentDate.toISOString();
        localStorage.setItem('planner_student_prefs', JSON.stringify(saved));
      } catch (e) {}
    }
  }, [activeTab, currentDate, fontSize, currentDocId, view]);

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

  const handleBlur = (e, id, day, isMonthly, subject, dateKey) => {
    if (e && e.target) {
      let formattedText = e.target.value;
      if (!isMonthly && id && day) {
        formattedText = processComboText(e.target.value, day);
        if (formattedText !== e.target.value) {
          setTimetable((prev) => prev.map((row) => row.id === id ? { ...row, [day]: formattedText } : row));
        }
      } else if (isMonthly && subject && dateKey) {
        if (subject === 'TEXTBOOK') {
          // 교재 칸은 onChange에서 실시간 처리됨
        } else if (subject === 'TOP_NOTE') {
          const dObj = allDates.find(d => d.full === dateKey);
          const dayType = dObj && (dObj.isSat || dObj.day === '토' || dObj.day === '일') ? 'sat' : 'mon';
          formattedText = processComboText(e.target.value, dayType);
          setTermScheduler(prev => ({ ...prev, topNotes: { ...prev.topNotes, [dateKey]: formattedText } }));
        } else {
          const dObj = allDates.find(d => d.full === dateKey);
          const dayType = dObj && (dObj.isSat || dObj.day === '토' || dObj.day === '일') ? 'sat' : 'mon';
          formattedText = processComboText(e.target.value, dayType);
          setTermScheduler(prev => ({ ...prev, cells: { ...prev.cells, [`${subject}-${dateKey}`]: formattedText } }));
        }
      }
    }

    if (focusSnapshotRef.current) {
      const currentSnap = JSON.stringify(currentStateRef.current);
      if (focusSnapshotRef.current !== currentSnap) {
        historyRef.current.past.push(focusSnapshotRef.current);
        if (historyRef.current.past.length > 50) historyRef.current.past.shift();
        historyRef.current.future = [];
      }
    }
    focusSnapshotRef.current = null; 
    setEditingCell(null);
  };

  // 💡 [월간 시트 전용] 교재 및 스케줄 칸을 통합한 논리 좌표계 (0~29)
  const getColInfo = (c) => {
    if (c === 0 || c === 15) return { type: 'textbook', block: c === 0 ? 0 : 1 };
    if (c >= 1 && c <= 14) return { type: 'date', dIdx: c - 1 };
    if (c >= 16 && c <= 29) return { type: 'date', dIdx: c - 2 };
    return null;
  };

  useEffect(() => {
    if (activeTab === 'MONTHLY' && monthlySelection.r1 !== null && monthlySelection.r1 === monthlySelection.r2 && monthlySelection.c1 === monthlySelection.c2 && !editingCell) {
      const el = document.getElementById(`monthly-textarea-${monthlySelection.r1}-${monthlySelection.c1}`);
      if (el) el.focus();
    }
  }, [monthlySelection, editingCell, activeTab]);

  // 💡 [월간 시트] 방향키 이동 계산 로직 (교재 칸 0, 15 포함하여 엑셀처럼 완벽 제어)
  const moveFocusMonthly = (rIdx, cIdx, dir) => {
    let nextRIdx = rIdx; let nextCIdx = cIdx;
    
    while (true) {
      if (dir === 'DOWN') { nextRIdx++; } 
      else if (dir === 'UP') { nextRIdx--; } 
      else if (dir === 'RIGHT') { 
        nextCIdx++; 
        if (nextCIdx > 29) { nextCIdx = 0; nextRIdx++; } 
      } 
      else if (dir === 'LEFT') { 
        nextCIdx--; 
        if (nextCIdx < 0) { nextCIdx = 29; nextRIdx--; } 
      }
      
      // 범위를 벗어나면 이동 중지
      if (nextRIdx < 0 || nextRIdx > termScheduler.subjects.length) return;
      
      // 0번째 행(비고란)에는 교재 칸(0, 15)이 없으므로 해당 좌표에 닿으면 건너뛰고 다음 좌표로 진행
      if (nextRIdx === 0 && (nextCIdx === 0 || nextCIdx === 15)) continue;
      
      break;
    }

    setMonthlySelection({ r1: nextRIdx, c1: nextCIdx, r2: nextRIdx, c2: nextCIdx });
    setEditingCell(null);
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

  const getSchedulerDates = () => {
    const days = []; const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
    for (let i = 0; i < 28; i++) {
      const dateObj = new Date(currentDate); dateObj.setDate(currentDate.getDate() + i);
      days.push({ full: `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`, label: `${dateObj.getMonth() + 1}/${dateObj.getDate()}`, day: dayLabels[dateObj.getDay()], isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6, isSat: dateObj.getDay() === 6 });
    }
    return days;
  };
  const allDates = getSchedulerDates();

  const autoResize = (e) => { 
    if (e && e.target) { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }
  };

  useEffect(() => {
    const timer = setTimeout(() => { 
      document.querySelectorAll('textarea.auto-resize').forEach(el => { 
        el.style.height = 'auto'; if (el.scrollHeight > 0) el.style.height = el.scrollHeight + 'px'; 
      }); 
    }, 50);
    return () => clearTimeout(timer);
  }, [activeTab, view, currentDocId, loading, timetable, fontSize, termScheduler, editingCell]);

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
          window.history.replaceState({ view: 'PLANNER', docId: sid, role: 'student', studentName: '' }, '', '');
          openStudentPlanner(sid, 'student', '', true); 
        } 
        else {
          if (localStorage.getItem('planner_role') === 'teacher') localStorage.removeItem('planner_role');
          const savedRole = sessionStorage.getItem('planner_role') || localStorage.getItem('planner_role');
          const savedName = localStorage.getItem('planner_name');

          if (savedRole === 'student' && savedName) { 
            window.history.replaceState({ view: 'PLANNER', docId: savedName, role: 'student', studentName: savedName }, '', '');
            setStudentName(savedName); openStudentPlanner(savedName, 'student', savedName, true); 
          } 
          else if (savedRole === 'teacher') { 
            setRole('teacher'); window.history.replaceState({ view: 'TEACHER_DASHBOARD', role: 'teacher' }, '', ''); setView('TEACHER_DASHBOARD'); 
          } 
          else { 
            window.history.replaceState({ view: 'LANDING' }, '', ''); setView('LANDING'); 
          }
        }
        onSnapshot(doc(db, 'settings', 'global'), (snap) => { if (snap.exists()) setGlobalAiKey(snap.data().aiKey || ''); });
      } catch (error) {
        if (error.code === 'auth/unauthorized-domain') setDbError("Vercel 도메인이 Firebase 인증 허용 목록에 없습니다. 콘솔 [Authentication] -> [Settings] -> [승인된 도메인]에 추가해주세요.");
        else setDbError(`인증 오류: ${error.message}`);
      }
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
          setLoadedDocId(currentDocId); 
        } else { 
          setIsNotFound(true); setLoadedDocId(null); 
        }
        setDbError('');
      } catch (e) {} finally { setLoading(false); }
    }, (error) => {
      setDbError(`[읽기 차단됨] Firebase 보안 규칙(Rules)이 만료되었거나 권한이 없습니다. 콘솔에서 권한을 풀어주세요. (${error.message})`);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user, currentDocId, view]);

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return; }
    if (!user || !currentDocId || view !== 'PLANNER' || loading || isNotFound || loadedDocId !== currentDocId || dbError) return;
    
    const saveData = async () => {
      if (loadedDocId !== currentDocId) return; 
      const isActuallyName = studentName && studentName !== currentDocId;
      try {
        await setDoc(doc(db, 'planners', currentDocId), { timetable, todos, dDay, yearlyPlan, termScheduler, colorRules, lastUpdated: new Date().toISOString(), ...(isActuallyName && { studentName }) }, { merge: true });
      } catch(e) {
        setDbError(`[쓰기 차단됨] Firebase 보안 규칙에 의해 데이터 저장이 차단되었습니다.`);
      }
    };
    const timeoutId = setTimeout(saveData, 1000);
    return () => clearTimeout(timeoutId);
  }, [timetable, todos, dDay, yearlyPlan, termScheduler, colorRules, user, currentDocId, view, loading, studentName, isNotFound, loadedDocId, dbError]);

  useEffect(() => {
    if (!user || view !== 'TEACHER_DASHBOARD') return;
    const unsubscribe = onSnapshot(collection(db, 'planners'), (snapshot) => {
      const students = []; snapshot.forEach((doc) => students.push({ id: doc.id, ...doc.data() }));
      students.sort((a, b) => (a.studentName || "").localeCompare(b.studentName || "", 'ko')); setStudentList(students);
      setDbError('');
    }, (error) => {
      setDbError(`[대시보드 차단됨] Firebase 보안 규칙(Rules) 권한이 없습니다. 콘솔에서 허용으로 변경해주세요. (${error.message})`);
    });
    return () => unsubscribe();
  }, [user, view]);

  // 💡 [월간 시트] 복사/붙여넣기 엑셀 호환성 유지
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
             const colInfo = getColInfo(c);
             if (!colInfo) continue;
             
             let val = '';
             if (r === 0) {
                 if (colInfo.type === 'textbook') val = ''; 
                 else val = termScheduler.topNotes[allDates[colInfo.dIdx].full] || '';
             } else {
                 val = colInfo.type === 'textbook' ? (termScheduler.textbooks[sub] || '') : (termScheduler.cells[`${sub}-${allDates[colInfo.dIdx].full}`] || '');
             }
             
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
              rowCopy.forEach((cellCopy, cIdx) => { 
                const day = DAYS[bounds.minDayIdx + cIdx]; 
                if (day) {
                  const formattedText = processComboText(cellCopy.text, day);
                  newTt[ttRowIdx] = { ...newTt[ttRowIdx], [day]: formattedText, [`${day}_span`]: cellCopy.span, [`${day}_hidden`]: cellCopy.hidden }; 
                }
              });
            });
          } else {
            const rows = parseTSV(pastedText);
            if (rows.length === 1 && rows[0].length === 1 && !isSingleCell) {
              for (let id = bounds.minId; id <= bounds.maxId; id++) { 
                for (let d = bounds.minDayIdx; d <= bounds.maxDayIdx; d++) { 
                  const day = DAYS[d];
                  if (!newTt[id - 1][`${day}_hidden`]) {
                    const formattedText = processComboText(rows[0][0], day);
                    newTt[id - 1] = { ...newTt[id - 1], [day]: formattedText }; 
                  }
                } 
              }
            } else {
              rows.forEach((rowStrArr, i) => {
                const rIdx = startRowIdx + i; if (rIdx > 31) return;
                rowStrArr.forEach((colStr, j) => { 
                  const cIdx = bounds.minDayIdx + j; 
                  if (cIdx < 7 && !newTt[rIdx][`${DAYS[cIdx]}_hidden`]) {
                    const formattedText = processComboText(colStr, DAYS[cIdx]);
                    newTt[rIdx] = { ...newTt[rIdx], [DAYS[cIdx]]: formattedText }; 
                  }
                });
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
          let newCells = { ...prev.cells }; let newTopNotes = { ...prev.topNotes }; let newTextbooks = { ...prev.textbooks };
          if (parsedData && pastedType === 'MONTHLY') {
            parsedData.forEach((rowCopy, rOffset) => {
              const targetRow = mb.minR + rOffset; if (targetRow > prev.subjects.length) return;
              const sub = targetRow === 0 ? null : prev.subjects[targetRow - 1];
              
              for (let cOffset = 0; cOffset < rowCopy.length; cOffset++) {
                 let targetCol = mb.minC + cOffset;
                 if (targetCol > 29) break;
                 const colInfo = getColInfo(targetCol);
                 if (!colInfo) continue;
                 
                 const cellVal = rowCopy[cOffset].text;
                 
                 if (targetRow === 0) {
                   if (colInfo.type === 'date') {
                      const formatted = processComboText(cellVal, allDates[colInfo.dIdx].isSat ? 'sat' : 'mon');
                      newTopNotes[allDates[colInfo.dIdx].full] = formatted;
                   }
                 } else {
                   if (colInfo.type === 'textbook') {
                      newTextbooks[sub] = cellVal;
                   } else {
                      const formatted = processComboText(cellVal, allDates[colInfo.dIdx].isSat ? 'sat' : 'mon');
                      newCells[`${sub}-${allDates[colInfo.dIdx].full}`] = formatted;
                   }
                 }
              }
            });
          } else {
            const rows = parseTSV(pastedText);
            if (rows.length === 1 && rows[0].length === 1 && !isSingleCell) {
              for (let r = mb.minR; r <= mb.maxR; r++) {
                const sub = r === 0 ? null : prev.subjects[r - 1];
                for (let c = mb.minC; c <= mb.maxC; c++) { 
                  const colInfo = getColInfo(c);
                  if (!colInfo) continue;
                  const colStr = rows[0][0];
                  
                  if (r === 0) {
                     if (colInfo.type === 'date') {
                       const formatted = processComboText(colStr, allDates[colInfo.dIdx].isSat ? 'sat' : 'mon');
                       newTopNotes[allDates[colInfo.dIdx].full] = formatted;
                     }
                  } else {
                     if (colInfo.type === 'textbook') {
                       newTextbooks[sub] = colStr;
                     } else {
                       const formatted = processComboText(colStr, allDates[colInfo.dIdx].isSat ? 'sat' : 'mon');
                       newCells[`${sub}-${allDates[colInfo.dIdx].full}`] = formatted;
                     }
                  }
                }
              }
            } else {
              rows.forEach((rowStrArr, i) => {
                const rIdx = mb.minR + i; if (rIdx > prev.subjects.length) return;
                const sub = rIdx === 0 ? null : prev.subjects[rIdx - 1];
                
                for (let j = 0; j < rowStrArr.length; j++) {
                   let targetCol = mb.minC + j;
                   if (targetCol > 29) break;
                   const colInfo = getColInfo(targetCol);
                   if (!colInfo) continue;
                   
                   const colStr = rowStrArr[j];
                   if (rIdx === 0) {
                      if (colInfo.type === 'date') {
                        const formatted = processComboText(colStr, allDates[colInfo.dIdx].isSat ? 'sat' : 'mon');
                        newTopNotes[allDates[colInfo.dIdx].full] = formatted;
                      }
                   } else {
                      if (colInfo.type === 'textbook') {
                        newTextbooks[sub] = colStr;
                      } else {
                        const formatted = processComboText(colStr, allDates[colInfo.dIdx].isSat ? 'sat' : 'mon');
                        newCells[`${sub}-${allDates[colInfo.dIdx].full}`] = formatted;
                      }
                   }
                }
              });
            }
          }
          return { ...prev, cells: newCells, topNotes: newTopNotes, textbooks: newTextbooks };
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
          if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') document.activeElement.value = '';
        } else if (activeTab === 'MONTHLY' && monthlySelection.r1 !== null) {
          const mb = getMonthlyBounds(); if (!mb) return;
          e.preventDefault(); saveToHistory();
          setTermScheduler(prev => {
            let newCells = { ...prev.cells }; let newTopNotes = { ...prev.topNotes }; let newTextbooks = { ...prev.textbooks };
            for (let r = mb.minR; r <= mb.maxR; r++) {
              const sub = r === 0 ? null : prev.subjects[r - 1];
              for (let c = mb.minC; c <= mb.maxC; c++) { 
                const colInfo = getColInfo(c);
                if (!colInfo) continue;
                if (r === 0) {
                  if (colInfo.type === 'date') newTopNotes[allDates[colInfo.dIdx].full] = '';
                } else {
                  if (colInfo.type === 'textbook') newTextbooks[sub] = '';
                  else newCells[`${sub}-${allDates[colInfo.dIdx].full}`] = '';
                }
              }
            }
            return { ...prev, cells: newCells, topNotes: newTopNotes, textbooks: newTextbooks };
          });
        }
      }
    };

    document.addEventListener('copy', handleCopy); document.addEventListener('paste', handlePaste); document.addEventListener('keydown', handleKeyDown);
    return () => { document.removeEventListener('copy', handleCopy); document.removeEventListener('paste', handlePaste); document.removeEventListener('keydown', handleKeyDown); };
  }, [activeTab, view, selection, monthlySelection, timetable, termScheduler, editingCell]); 

  const saveGlobalAiKey = async () => { try { await setDoc(doc(db, 'settings', 'global'), { aiKey: globalAiKey }, { merge: true }); setShowGlobalKeyInput(false); setAiFeedback('✅ 공용 API 키 저장'); setTimeout(() => setAiFeedback(''), 3000); } catch (e) {} };
  const createNewStudentSheet = async () => { const name = prompt("이름을 입력하세요."); if (!name || !name.trim()) return; const newSid = crypto.randomUUID(); setLoading(true); try { await setDoc(doc(db, 'planners', newSid), { studentName: name.trim(), timetable: generateTimeSlots(), todos: [], yearlyPlan: Array(12).fill(''), createdAt: new Date().toISOString() }); setAiFeedback(`✅ 학생 생성됨.`); setTimeout(() => setAiFeedback(''), 3000); } catch (e) {} finally { setLoading(false); } };
  const copyStudentLink = (sid) => { const el = document.createElement('textarea'); el.value = `${window.location.origin}${window.location.pathname}?sid=${sid}`; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); setCopyFeedback(sid); setTimeout(() => setCopyFeedback(null), 2000); };

  const handleMouseDown = (e, day, id) => {
    isDragging.current = true; setMonthlySelection({ r1: null, c1: null, r2: null, c2: null });
    if (e.shiftKey && selection.startDay) { e.preventDefault(); setSelection(prev => ({ ...prev, endDay: day, endId: id })); } 
    else { setSelection(prev => { if (prev.startDay === day && prev.endDay === day && prev.startId === id && prev.endId === id) return prev; return { startDay: day, endDay: day, startId: id, endId: id }; }); }
  };

  const handleMouseEnter = (day, id) => { if (isDragging.current && activeTab === 'WEEKLY') setSelection(prev => ({ ...prev, endDay: day, endId: id })); };

  const handleMonthlyMouseDown = (e, rIdx, cIdx) => {
    if (e.target.type === 'checkbox') return;
    isMonthlyDragging.current = true; setSelection({ startDay: null, endDay: null, startId: null, endId: null });
    if (e.shiftKey && monthlySelection.r1 !== null) { e.preventDefault(); setMonthlySelection(prev => ({ ...prev, r2: rIdx, c2: cIdx })); } 
    else { setMonthlySelection(prev => { if (prev.r1 === rIdx && prev.c1 === cIdx && prev.r2 === rIdx && prev.c2 === cIdx) return prev; return { r1: rIdx, c1: cIdx, r2: rIdx, c2: cIdx }; }); }
  };

  const handleMonthlyMouseEnter = (rIdx, cIdx) => { if (isMonthlyDragging.current && activeTab === 'MONTHLY') setMonthlySelection(prev => ({ ...prev, r2: rIdx, c2: cIdx })); };

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

  const addColorRule = () => { if (!newColorRule.keyword.trim()) return; setColorRules([...colorRules, { ...newColorRule, id: Date.now() }]); setNewColorRule({ ...newColorRule, keyword: '' }); setShowColorModal(false); };
  const removeColorRule = (id) => setColorRules(colorRules.filter((rule) => rule.id !== id));
  const getCellColor = (text) => { if (!text || typeof text !== 'string') return null; const rule = colorRules.find((r) => text.includes(r.keyword)); return rule ? rule.color : null; };

  const handlePrev4Weeks = () => setCurrentDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 28); return d; });
  const handleNext4Weeks = () => setCurrentDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 28); return d; });

  const handleTimetableChange = (id, day, value) => { setTimetable((prev) => prev.map((row) => row.id === id ? { ...row, [day]: value } : row)); };
  const handleTermCellChange = (subject, dateKey, value) => { setTermScheduler(prev => ({ ...prev, cells: { ...prev.cells, [`${subject}-${dateKey}`]: value } })); };
  const handleTermCheckToggle = (subject, dateKey, index) => { saveToHistory(); setTermScheduler(prev => ({ ...prev, checks: { ...prev.checks, [`${subject}-${dateKey}-${index}`]: !prev.checks[`${subject}-${dateKey}-${index}`] } })); };
  const handleTopNoteChange = (dateKey, value) => setTermScheduler(prev => ({ ...prev, topNotes: { ...prev.topNotes, [dateKey]: value } }));
  const handleTermTextbookChange = (subject, value) => setTermScheduler(prev => ({ ...prev, textbooks: { ...prev.textbooks, [subject]: value } }));
  const addSubjectRow = (name) => { if (!name || termScheduler.subjects.includes(name)) return; saveToHistory(); setTermScheduler(prev => ({ ...prev, subjects: [...prev.subjects, name] })); };
  const removeSubjectRow = (name) => { saveToHistory(); setTermScheduler(prev => ({ ...prev, subjects: prev.subjects.filter(s => s !== name) })); };

  // 💡 [AI 조교 지능 100배 향상] 과목 추가 기능 지원 및 교재/일정의 명확한 맥락 분리 적용
  const callGeminiAPI = async (systemPrompt, userText = "", retries = 5) => {
    if (!globalAiKey) { setAiFeedback('⚠️ API 키 없음'); return null; }
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAiKey}`, { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify({ 
            contents: [{ parts: [{ text: systemPrompt + '\n\n[사용자 요청]\n' + userText }] }],
            generationConfig: { responseMimeType: "application/json" } 
          }) 
        });
        const result = await response.json();
        if (result.error) { if (result.error.code === 429 && i < retries - 1) { await new Promise(r => setTimeout(r, Math.pow(2, i) * 2000)); continue; } throw new Error(result.error.message); }
        return result.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (error) { if (i === retries - 1) { setAiFeedback(`❌ 오류 발생: ${error.message}`); return null; } }
    } return null;
  };

  const handleAiSubmit = async (e) => {
    e.preventDefault(); 
    if (!aiPrompt.trim()) return; 
    setIsAiProcessing(true); 
    setAiFeedback('AI 조교가 입력하신 내용을 분석 중입니다... 🤖');
    
    const sysPrompts = { 
      WEEKLY: `당신은 스마트 학습 플래너의 주간 시간표(타임테이블) 관리 AI 조교입니다. 사용자의 입력(자연어)을 분석하여 아래 JSON 포맷으로만 응답하세요. 다른 설명은 금지.
{ "type": "UPDATE_TIMETABLE", "updates": [{ "day": "mon", "startTime": "08:00", "endTime": "10:00", "content": "수학" }] }
[필수 규칙]
1. day: 월요일부터 일요일까지 각각 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun' 으로 작성.
2. startTime, endTime: 반드시 24시간제 "HH:00" 또는 "HH:30" 형식으로 작성. (예: 오전 8시는 "08:00", 오후 2시는 "14:00", 밤 10시는 "22:00")
3. 사용자가 "오전8-10" 혹은 "8시~10시" 라고 하면 startTime은 "08:00", endTime은 "10:00"으로 정확히 분리.
4. "오후 2-4" 라면 startTime "14:00", endTime "16:00" 으로 변환.
5. 종료 시간이 명시되지 않았다면 무조건 시작 시간으로부터 1시간 뒤로 자동 설정.
6. 일정이 여러 개면 updates 배열에 객체를 여러 개 만드세요.`, 

      MONTHLY: `당신은 스마트 월간 스케줄 및 교재 관리 AI 조교입니다. 사용자의 요청을 분석하여 아래 JSON 포맷으로만 응답하세요. 설명 금지.
{
  "type": "UPDATE_TERM_SCHEDULER",
  "new_subjects": ["과목명1", "과목명2"],
  "updates": [
    { "target": "textbook", "subject": "과목명", "content": "교재 이름들 (여러 권이면 줄바꿈\\n으로 구분)" },
    { "target": "cell", "subject": "과목명", "date": "YYYY-MM-DD", "content": "학습 내용" }
  ]
}
[필수 규칙]
1. 사용자가 "국어, 수학 추가해 줘" 등 진도나 교재 언급 없이 단순히 과목만 생성하라는 요청을 하면 new_subjects 배열에 과목명들을 담아 응답하세요.
2. 사용자가 날짜나 분량 언급 없이 "국어 교재 자습서, 평가문제집 추가해 줘" 처럼 단순히 교재명만 나열하면 target을 "textbook"으로 설정하세요. (여러 권일 경우 content에 줄바꿈\\n으로 묶어서 응답)
3. 사용자가 "월~토 자습서 1단원부터 5단원" 처럼 특정 기간/요일에 분량을 나누어 달라고 요청하면 target을 "cell"로 설정하세요. 기간에 속하는 날짜마다 분배하여 각각 객체를 만드세요.
4. 과목명: 기존 등록된 과목 [${termScheduler.subjects.join(', ')}] 중 알맞은 과목을 매칭. 없으면 new_subjects에 포함시키세요.
5. target이 "cell"인 경우 date는 제공된 캘린더 날짜 배열을 참고하여 가장 일치하는 날짜를 YYYY-MM-DD 형식으로 입력하세요.
6. 복합 요청(과목 추가 + 교재 등록 + 일정 배분)을 받으면 new_subjects 배열과 updates 배열에 각각 빠짐없이 반영하세요.`, 

      YEARLY: `당신은 연간 플래너 AI 조교입니다. 아래 JSON 포맷으로만 응답하세요. 설명 금지.
{ "type": "UPDATE_YEARLY", "plans": ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"] }
[필수 규칙]
plans 배열은 무조건 12개의 문자열로 구성. 요청되지 않은 달은 빈 문자열("")로 두세요.` 
    };

    const text = await callGeminiAPI(sysPrompts[activeTab], `명령: "${aiPrompt}"\n(참고용 화면상 캘린더 날짜: ${JSON.stringify(allDates.map(d=>d.full))})`);
    
    if (text) {
      try {
        let cleanedText = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) cleanedText = jsonMatch[0];

        const aiResponse = JSON.parse(cleanedText); 
        saveToHistory();
        
        if (aiResponse.type === 'UPDATE_TIMETABLE' && activeTab === 'WEEKLY') {
          let newTt = [...timetable];
          
          if(aiResponse.updates && Array.isArray(aiResponse.updates)){
            aiResponse.updates.forEach((update) => {
              if(!update.startTime || !update.endTime || !update.day) return;
              const sParts = update.startTime.split(':').map(Number);
              const eParts = update.endTime.split(':').map(Number);
              if(isNaN(sParts[0]) || isNaN(eParts[0])) return;
              
              const sIdx = (sParts[0] - 8) * 2 + (sParts[1] >= 30 ? 1 : 0); 
              let eIdx = (eParts[0] - 8) * 2 + (eParts[1] >= 30 ? 1 : 0) - 1;
              if (eIdx < sIdx) eIdx = sIdx; 
              
              if (sIdx >= 0 && eIdx <= 31 && sIdx <= eIdx) {
                const sId = sIdx + 1, eId = eIdx + 1, sCount = eId - sId + 1;
                const formattedContent = processComboText(update.content, update.day);
                for (let i = 1; i <= 32; i++) {
                  if (i === sId) newTt[i-1] = { ...newTt[i-1], [`${update.day}_span`]: sCount, [`${update.day}_hidden`]: false, [update.day]: formattedContent };
                  else if (i > sId && i <= eId) newTt[i-1] = { ...newTt[i-1], [`${update.day}_span`]: 1, [`${update.day}_hidden`]: true };
                  else if (i < sId && newTt[i-1][`${update.day}_span`] > 1 && i + newTt[i-1][`${update.day}_span`] - 1 >= sId) newTt[i-1] = { ...newTt[i-1], [`${update.day}_span`]: sId - i };
                }
              }
            });
          }
          setTimetable(repairTimetable(newTt)); 
          setAiFeedback('✨ 주간 시간표가 성공적으로 업데이트되었습니다!');
        } 
        else if (aiResponse.type === 'UPDATE_TERM_SCHEDULER' && activeTab === 'MONTHLY') {
          setTermScheduler(prev => {
            let newCells = { ...prev.cells };
            let newTextbooks = { ...prev.textbooks };
            let newSubjects = [...prev.subjects];
            
            if (aiResponse.new_subjects && Array.isArray(aiResponse.new_subjects)) {
              aiResponse.new_subjects.forEach(s => {
                if (s && !newSubjects.includes(s)) newSubjects.push(s);
              });
            }
            
            if (aiResponse.updates && Array.isArray(aiResponse.updates)) {
              aiResponse.updates.forEach(u => {
                if (u.subject && !newSubjects.includes(u.subject)) newSubjects.push(u.subject);
                
                if (u.target === 'textbook' && u.subject && u.content) {
                  const current = newTextbooks[u.subject] || '';
                  newTextbooks[u.subject] = current ? `${current}\n${u.content}` : u.content;
                } 
                else if (u.target === 'cell' && u.subject && u.date) {
                  const dObj = allDates.find(d => d.full === u.date);
                  if (dObj) {
                    const dayType = dObj.isSat || dObj.day === '토' || dObj.day === '일' ? 'sat' : 'mon';
                    const formattedContent = processComboText(u.content, dayType);
                    newCells[`${u.subject}-${u.date}`] = newCells[`${u.subject}-${u.date}`] ? `${newCells[`${u.subject}-${u.date}`]}\n${formattedContent}` : formattedContent; 
                  }
                }
              });
            }
            return { ...prev, cells: newCells, textbooks: newTextbooks, subjects: newSubjects };
          });
          setAiFeedback('✨ 월간 스케줄에 내용이 성공적으로 반영되었습니다!');
        } 
        else if (aiResponse.type === 'UPDATE_YEARLY' && activeTab === 'YEARLY') { 
          const newPlans = [...yearlyPlan];
          if(Array.isArray(aiResponse.plans)){
            aiResponse.plans.forEach((p, i) => { if(p) newPlans[i] = p; });
          }
          setYearlyPlan(newPlans); 
          setAiFeedback('✨ 연간 계획이 성공적으로 반영되었습니다!'); 
        }
      } catch (e) { 
        setAiFeedback('❌ 명령이 너무 복잡하거나 모호합니다. 다시 한 번 적어주세요.'); 
      }
    }
    setAiPrompt(''); setIsAiProcessing(false); setTimeout(() => { if (!text) setShowAiModal(false); setAiFeedback(''); }, 3000);
  };

  const handleTeacherLogin = (e) => { 
    e.preventDefault(); 
    if (teacherPassword === '551000') { 
      sessionStorage.setItem('planner_role', 'teacher'); 
      setTeacherPassword(''); 
      navigateTo('TEACHER_DASHBOARD', { role: 'teacher', docId: null, studentName: '' }); 
    } else {
      setErrorMsg('비밀번호 불일치'); 
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);

  const executeLogout = () => { 
    localStorage.removeItem('planner_role'); 
    localStorage.removeItem('planner_name'); 
    sessionStorage.removeItem('planner_role'); 
    setShowLogoutConfirm(false); 
    hasNavigated.current = false;
    window.history.replaceState({ view: 'LANDING', role: '', docId: null, studentName: '' }, '', window.location.pathname);
    setView('LANDING'); 
    setRole(''); setStudentName(''); setCurrentDocId(null); 
  };

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
  if (isNotFound && view === 'PLANNER') return <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6"><h1 className="text-2xl font-black mb-2">삭제된 플래너입니다.</h1><button onClick={() => handleSafeBack('TEACHER_DASHBOARD')} className="px-8 py-3 bg-slate-800 text-white rounded-xl">확인</button></div>;

  const wBounds = getSelectionBounds(); const isWMulti = wBounds && (wBounds.minId !== wBounds.maxId || wBounds.minDayIdx !== wBounds.maxDayIdx);
  const mb = getMonthlyBounds();

  return (
    <>
      <div className={`print:hidden bg-slate-50 text-slate-800 transition-colors duration-300 ${(view === 'PLANNER' && activeTab === 'WEEKLY') ? 'h-screen h-[100dvh] flex flex-col overflow-hidden' : 'min-h-screen'}`}>
        <div className={`w-full mx-auto ${(view === 'PLANNER' && activeTab === 'WEEKLY') ? 'flex-1 flex flex-col min-h-0' : ''}`}>
          
          {dbError && (
            <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[200] w-full max-w-2xl px-4 animate-fade-in">
              <div className="p-4 bg-red-50 text-red-700 font-bold rounded-2xl border-2 border-red-200 shadow-2xl flex flex-col gap-2">
                <div className="flex items-center gap-3 mb-1">
                  <AlertCircle className="w-6 h-6 flex-shrink-0" />
                  <span className="text-base break-keep">데이터베이스 접근이 차단되었습니다! (데이터는 안전합니다)</span>
                  <button onClick={() => setDbError('')} className="ml-auto p-1 hover:bg-red-100 rounded-lg"><X size={16}/></button>
                </div>
                <div className="text-sm font-medium ml-9 space-y-1">
                  <p>• 원인: {dbError}</p>
                </div>
              </div>
            </div>
          )}

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
                  <button onClick={() => navigateTo('TEACHER_LOGIN')} className="w-full p-5 rounded-2xl border-2 border-slate-100 hover:border-slate-500 hover:bg-slate-50 flex items-center gap-5 group transition-all shadow-sm">
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
                <button onClick={() => handleSafeBack('LANDING')} className="text-slate-400 mb-8 flex items-center gap-2 text-sm font-medium hover:text-slate-700 transition-colors bg-slate-50 px-4 py-2 rounded-lg w-fit"><ChevronLeft className="w-4 h-4" /> 뒤로가기</button>
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
                    <button onClick={() => setShowLogoutConfirm(true)} className="text-slate-500 hover:text-red-600 hover:bg-red-50 px-5 py-3 rounded-xl font-bold flex items-center gap-2 bg-slate-100"><LogOut className="w-5 h-5" /> 로그아웃</button>
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
                
                {studentList.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 text-center">
                    {studentList.map((student) => (
                      <div key={student.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:border-indigo-500 transition-all flex flex-col justify-between h-48 group text-center">
                        <div className="flex justify-between items-start">
                          <div onClick={() => openStudentPlanner(student.id, 'teacher', student.studentName, false)} className="cursor-pointer text-center w-full">
                            <span className="text-xl font-extrabold text-slate-800 block mb-1">{student.studentName || '이름 없음'}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{student.id.substring(0, 13)}...</span>
                          </div>
                          <button onClick={(e) => handleDeleteStudent(e, student.id)} className="text-slate-300 hover:text-red-500 p-2"><Trash2 size={18} /></button>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => copyStudentLink(student.id)} className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${copyFeedback === student.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{copyFeedback === student.id ? <><Check size={14}/> 복사됨</> : <><LinkIcon size={14}/> 링크 복사</>}</button>
                          <button onClick={() => openStudentPlanner(student.id, 'teacher', student.studentName, false)} className="px-4 py-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><ChevronRight size={18}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  !dbError && <div className="text-slate-400 font-bold p-10">등록된 학생이 없습니다.</div>
                )}
              </div>
            </div>
          )}

          {view === 'PLANNER' && (
            <div className="flex flex-col h-full w-full relative">
              <header className="flex-none px-4 py-2 md:py-3 shadow-sm z-30 bg-white border-b border-slate-200 relative">
                <div className="max-w-[98vw] mx-auto flex flex-col md:flex-row justify-between items-center gap-2 md:gap-4">
                  <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
                    <div className="flex items-center gap-3">
                      {role === 'teacher' && <button onClick={() => handleSafeBack('TEACHER_DASHBOARD')} className="p-2 rounded-full hover:bg-slate-100 border border-slate-200"><ChevronLeft className="w-5 h-5" /></button>}
                      <div className="p-2 md:p-2.5 rounded-xl shadow-inner bg-gradient-to-br from-indigo-500 to-indigo-700"><BookOpen className="text-white w-4 h-4 md:w-5 md:h-5" /></div>
                      <div className="font-extrabold text-lg md:text-xl tracking-tight">{studentName} 플래너</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 w-full md:w-auto justify-between md:justify-end">
                    
                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 shadow-inner">
                      <button onClick={() => setFontSize(f => Math.max(8, f - 1))} className="px-2 py-1 md:py-1.5 hover:bg-white hover:shadow-sm rounded text-slate-600 font-black transition-all flex items-center justify-center"><Minus size={12} className="md:w-3.5 md:h-3.5"/></button>
                      <span className="text-[10px] md:text-xs font-black w-5 md:w-6 text-center text-indigo-700 select-none cursor-default">{fontSize}</span>
                      <button onClick={() => setFontSize(f => Math.min(24, f + 1))} className="px-2 py-1 md:py-1.5 hover:bg-white hover:shadow-sm rounded text-slate-600 font-black transition-all flex items-center justify-center"><Plus size={12} className="md:w-3.5 md:h-3.5"/></button>
                    </div>

                    <div className="flex p-1 rounded-xl shadow-inner bg-slate-100 flex-1 md:flex-none justify-center">
                      {['WEEKLY', 'MONTHLY', 'YEARLY'].map((tab) => (
                        <button key={tab} onClick={() => { 
                          setActiveTab(tab); 
                          setEditingCell(null); 
                          setSelection({ startDay: null, endDay: null, startId: null, endId: null }); 
                          setMonthlySelection({ r1: null, c1: null, r2: null, c2: null }); 
                        }} className={`flex-1 md:flex-none px-4 md:px-6 py-1 md:py-2 rounded-lg text-xs md:text-sm font-extrabold transition-all duration-300 ${activeTab === tab ? "bg-white text-indigo-700 shadow-md scale-[1.02]" : "text-slate-400 hover:text-slate-600"}`}>{tab === 'WEEKLY' ? '주간' : tab === 'MONTHLY' ? '월간' : '연간'}</button>
                      ))}
                    </div>
                    {role === 'teacher' && (
                      <div className="hidden md:flex items-center gap-2 border-l pl-2 md:pl-3 ml-1 border-slate-200">
                        <button onClick={() => setShowLogoutConfirm(true)} className="p-2 md:p-2.5 rounded-xl hover:bg-red-50 text-red-500 transition-colors"><LogOut className="w-4 h-4 md:w-5 md:h-5" /></button>
                      </div>
                    )}
                  </div>
                </div>
              </header>

              <main className={`flex-1 min-h-0 w-full mx-auto relative text-center flex flex-col ${activeTab === 'WEEKLY' ? 'p-1 md:p-2' : 'p-2 md:p-6 pb-24'} overflow-y-auto custom-scrollbar`}>
                
                {activeTab === 'WEEKLY' && (
                  <div className="animate-fade-in flex flex-col text-center h-full">
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="p-1 md:p-2 rounded-xl shadow-sm border border-slate-200 bg-white flex flex-col h-full relative z-30">
                        
                        <div className="flex flex-wrap items-center justify-between gap-1 mb-1 md:mb-2 flex-shrink-0 px-1 relative z-40">
                          <div className="flex flex-wrap items-center gap-2">
                            {dDay ? (
                              <div className="flex items-center gap-1.5 md:gap-3 px-3 py-1.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg shadow-sm text-xs text-center">
                                <Calendar className="w-3 h-3" />
                                <span className="font-bold">{dDay.title} ({calculateDDay(dDay.date)})</span>
                                <button onClick={() => setDDay(null)} className="hover:text-red-200 p-0.5"><X className="w-3 h-3" /></button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 p-1 rounded-lg border border-slate-200 bg-slate-50 shadow-inner justify-center">
                                <input type="text" placeholder="D-day 제목" className="w-20 md:w-28 p-1 text-xs rounded outline-none font-medium bg-white border border-slate-100 focus:border-indigo-500 text-center" value={dDayInput.title} onChange={(e) => setDDayInput({ ...dDayInput, title: e.target.value })}/>
                                <input type="date" className="w-24 p-1 text-[10px] md:text-xs rounded outline-none bg-white border border-slate-100 focus:border-indigo-500 text-center" value={dDayInput.date} onChange={(e) => setDDayInput({ ...dDayInput, date: e.target.value })}/>
                                <button onClick={() => { if (dDayInput.title) { setDDay(dDayInput); setDDayInput({ title: '', date: '' }); saveToHistory(); } }} className="px-3 py-1 rounded text-xs font-bold transition-colors shadow-sm bg-slate-800 hover:bg-slate-900 text-white">설정</button>
                              </div>
                            )}
                          </div>
                          
                          <div className="flex flex-wrap items-center justify-end gap-1.5 md:gap-2 ml-auto relative">
                            
                            <button onClick={() => { setPrintConfig(prev => ({ ...prev, scope: 'all' })); setShowPrintModal(true); }} className="flex items-center gap-1 px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                              <Printer className="w-3 h-3" /> <span className="hidden sm:inline">인쇄</span>
                            </button>

                            <button onClick={() => setShowColorModal(!showColorModal)} className={`flex items-center gap-1 px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm border ${showColorModal ? 'bg-indigo-50 border-indigo-200 text-indigo-700 relative z-[60]' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                              <Palette className="w-3 h-3" /> <span className="hidden sm:inline">색상</span>
                            </button>

                            <div className="h-5 w-px mx-0.5 bg-slate-200"></div>

                            {isWMulti ? <button onClick={mergeCells} className="flex items-center gap-1 bg-indigo-600 text-white px-2 md:px-3 py-1 md:py-1.5 rounded-lg shadow-md hover:bg-indigo-700 font-extrabold text-xs"><Merge className="w-3 h-3" /> <span className="hidden sm:inline">병합</span></button> : <div className="flex items-center gap-1 px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs font-medium border border-dashed border-slate-200 text-slate-400 bg-slate-50 select-none"><MousePointer2 className="w-3 h-3" /> <span className="hidden sm:inline">드래그</span></div>}
                            <button onClick={unmergeCells} className="flex items-center gap-1 px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs font-bold shadow-sm transition-colors border border-slate-200 text-slate-700 hover:bg-slate-50"><Split className="w-3 h-3" /> <span className="hidden sm:inline">분할</span></button>
                            <button onClick={() => setShowResetConfirm(true)} className="flex items-center gap-1 px-2 md:px-3 py-1 md:py-1.5 rounded-lg text-xs font-bold transition-colors ml-0 bg-red-50 text-red-600 border border-red-100 hover:bg-red-100"><Trash2 className="w-3 h-3" /> <span className="hidden sm:inline">초기화</span></button>
                          </div>
                        </div>
                        
                        <div className="w-full flex-1 relative select-none rounded-lg border-2 border-slate-200 bg-white shadow-inner text-center overflow-y-auto custom-scrollbar z-10" onMouseLeave={handleMouseUp}>
                          <table className="w-full h-full min-h-full text-center border-collapse table-fixed">
                            <thead className="z-20 shadow-sm border-b-2 border-slate-200 text-slate-800 bg-slate-50 sticky top-0">
                              <tr style={{ height: '30px' }}>
                                <th className={`border-r border-slate-200 uppercase font-black z-20 align-middle transition-colors duration-200 w-10 md:w-14 ${wBounds ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400'}`} style={{ fontSize: `${Math.max(8, fontSize - 2)}px` }}>
                                  <span className="md:hidden">시간</span>
                                  <span className="hidden md:inline">Time</span>
                                </th>
                                {DAYS.map((d, i) => {
                                  const labelsLong = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
                                  const labelsShort = ['월', '화', '수', '목', '금', '토', '일'];
                                  const isColSelected = activeTab === 'WEEKLY' && wBounds && i >= wBounds.minDayIdx && i <= wBounds.maxDayIdx;
                                  let defaultTextColor = (d === 'sat') ? 'text-blue-500' : (d === 'sun') ? 'text-red-500' : 'text-slate-600';
                                  let textColor = isColSelected ? 'text-indigo-700' : defaultTextColor;
                                  let bgColor = isColSelected ? 'bg-indigo-100' : 'bg-transparent';
                                  return (
                                    <th key={d} className={`font-black border-r border-slate-200 z-20 align-middle transition-colors duration-200 py-0 px-0 ${textColor} ${bgColor}`} style={{ fontSize: `${Math.max(9, fontSize - 1)}px` }}>
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
                                  <tr key={row.id} className="group text-center h-[1%]">
                                    <td className={`p-0 border-b border-r border-slate-200 align-middle transition-colors duration-200 select-none ${timeBgClass}`}>
                                      <div className={`flex flex-col items-center justify-center w-full h-full min-h-[28px] ${timeTextClass}`} style={{ fontSize: `${Math.max(8, fontSize - 2)}px` }}>
                                        <span>{row.time}</span>
                                      </div>
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
                                          className={`p-0 relative align-top border-b border-r border-slate-200 transition-colors duration-200 ${isSelected ? 'ring-2 ring-indigo-500 ring-inset z-10' : ''} hover:bg-indigo-50/30 ${isEditingThis ? 'cursor-text' : 'cursor-cell'}`} 
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
                                          <div className="w-full h-full flex flex-col items-center justify-center p-0.5 text-center min-h-[24px] md:min-h-[28px]">
                                            <textarea 
                                              id={`textarea-${row.id}-${day}`}
                                              value={row[day] || ''} 
                                              onChange={(e) => {
                                                handleTimetableChange(row.id, day, e.target.value);
                                                autoResize(e);
                                              }} 
                                              onFocus={handleFocus} 
                                              onBlur={(e) => handleBlur(e, row.id, day, false)}
                                              style={{
                                                caretColor: (!isEditingThis && isActiveThis) ? 'transparent' : 'auto',
                                                cursor: (!isEditingThis && isActiveThis) ? 'default' : 'text',
                                                fontSize: `${fontSize}px`,
                                                lineHeight: '1.3'
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
                                                    e.preventDefault(); saveToHistory(); handleTimetableChange(row.id, day, '');
                                                  } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                                                    e.currentTarget.value = ''; handleTimetableChange(row.id, day, ''); 
                                                    setEditingCell(cellId);
                                                    setSelection({ startDay: day, endDay: day, startId: row.id, endId: row.id });
                                                  }
                                                } else if (isEditingThis) {
                                                  if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
                                                    e.preventDefault(); 
                                                    setEditingCell(null); moveFocus(row.id, dayIdx, 'DOWN');
                                                  } else if (e.key === 'Tab') {
                                                    e.preventDefault(); 
                                                    setEditingCell(null); moveFocus(row.id, dayIdx, e.shiftKey ? 'LEFT' : 'RIGHT');
                                                  } else if (e.key === 'Escape') {
                                                    e.preventDefault(); setEditingCell(null);
                                                    e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length);
                                                  }
                                                }
                                              }} 
                                              className={`w-full p-1 m-0 text-center bg-transparent resize-none outline-none overflow-hidden font-bold align-middle auto-resize ${(isActiveThis && !isEditingThis) ? 'select-none' : ''}`} 
                                              rows={1}
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
                          <button onClick={() => { const name = prompt("추가할 과목명을 입력하세요\n(예: 국어, 수학, 영어)"); if(name) name.split(',').forEach(n => { if (n.trim()) addSubjectRow(n.trim()); }); }} className="flex items-center gap-2 px-3 md:px-5 py-2 md:py-2.5 bg-indigo-600 text-white rounded-xl font-extrabold text-xs md:text-sm hover:bg-indigo-700 shadow-md transition-all text-center"><Plus size={16}/> <span className="hidden sm:inline">과목 추가</span></button>
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
                                  <th className="border border-slate-300 w-[6%] py-2 text-center font-black align-middle" rowSpan={2} style={{ fontSize: `${Math.max(9, fontSize - 1)}px` }}>과목</th>
                                  <th className="border border-slate-300 w-[6%] py-2 text-center font-black align-middle" rowSpan={2} style={{ fontSize: `${Math.max(9, fontSize - 1)}px` }}>교재</th>
                                  {chunk.map((d, i) => {
                                    let textColor = d.isSat ? 'text-blue-500' : d.isWeekend ? 'text-red-500' : 'text-slate-600';
                                    return <th key={i} className={`border border-slate-300 py-1 font-bold text-center align-middle ${textColor}`} style={{ fontSize: `${Math.max(9, fontSize - 1)}px` }}>{d.day}</th>;
                                  })}
                                </tr>
                                <tr className="bg-slate-50 text-center">
                                  {chunk.map((d, i) => {
                                     let textColor = d.isSat ? 'text-blue-500' : d.isWeekend ? 'text-red-500' : 'text-slate-600';
                                     return <th key={i} className={`border border-slate-300 py-1 font-bold text-center align-middle ${textColor}`} style={{ fontSize: `${Math.max(8, fontSize - 2)}px` }}>{d.label}</th>;
                                  })}
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="bg-white text-center">
                                  <td colSpan={2} className="border border-slate-300 text-center font-black bg-slate-50 text-black align-middle py-1" style={{ fontSize: `${Math.max(9, fontSize - 1)}px` }}>비고</td>
                                  {chunk.map((d, i) => {
                                    const cIdx = blockIdx === 0 ? i + 1 : i + 16;
                                    const rIdx = 0;
                                    const isSel = mb && rIdx >= mb.minR && rIdx <= mb.maxR && cIdx >= mb.minC && cIdx <= mb.maxC;
                                    const cellId = `note-${d.full}`;
                                    const isEditingThis = editingCell === cellId;
                                    const isSingleSelection = mb && mb.minR === mb.maxR && mb.minC === mb.maxC;
                                    const isActiveThis = isSingleSelection && monthlySelection.r1 === rIdx && monthlySelection.c1 === cIdx;
                                    const val = termScheduler.topNotes[d.full] || '';

                                    return (
                                      <td key={cellId} 
                                        onMouseDown={(e) => {
                                          if (e.target.type === 'checkbox') return;
                                          if (editingCell !== cellId) setEditingCell(null);
                                          handleMonthlyMouseDown(e, rIdx, cIdx);
                                        }}
                                        onMouseEnter={() => handleMonthlyMouseEnter(rIdx, cIdx)}
                                        onClick={(e) => { 
                                          if (!e.shiftKey && !isEditingThis && e.target.type !== 'checkbox') {
                                            setTimeout(() => { const el = document.getElementById(`monthly-textarea-${rIdx}-${cIdx}`); if (el) el.focus(); }, 0);
                                          }
                                        }}
                                        onDoubleClick={(e) => { if (e.target.type !== 'checkbox') setEditingCell(cellId); }}
                                        className={`border border-slate-300 p-0 align-middle text-center transition-colors relative ${isSel ? 'ring-2 ring-indigo-500 ring-inset z-10 bg-indigo-50/80' : 'hover:bg-slate-50 bg-white'} ${isEditingThis ? 'cursor-text' : 'cursor-cell'}`}
                                      >
                                        <div className="w-full h-full flex flex-col justify-center items-center p-1 text-center min-h-[30px] relative">
                                          <textarea 
                                            id={`monthly-textarea-${rIdx}-${cIdx}`}
                                            value={val} 
                                            onChange={(e) => handleTopNoteChange(d.full, e.target.value)} 
                                            onInput={autoResize} onFocus={handleFocus} onBlur={(e) => handleBlur(e, null, null, true, 'TOP_NOTE', d.full)} rows={1}
                                            onCompositionStart={(e) => {
                                              if (!isEditingThis && isActiveThis) {
                                                e.currentTarget.value = ''; handleTopNoteChange(d.full, '');
                                                setEditingCell(cellId); setMonthlySelection({ r1: rIdx, c1: cIdx, r2: rIdx, c2: cIdx });
                                              }
                                            }}
                                            onKeyDown={(e) => { 
                                              if (e.nativeEvent.isComposing && e.key !== 'Escape') return;
                                              if (!isEditingThis && isActiveThis) {
                                                if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); setEditingCell(cellId); e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length); }
                                                else if (e.key === 'ArrowDown') { e.preventDefault(); moveFocusMonthly(rIdx, cIdx, 'DOWN'); }
                                                else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocusMonthly(rIdx, cIdx, 'UP'); }
                                                else if (e.key === 'ArrowRight') { e.preventDefault(); moveFocusMonthly(rIdx, cIdx, 'RIGHT'); }
                                                else if (e.key === 'ArrowLeft') { e.preventDefault(); moveFocusMonthly(rIdx, cIdx, 'LEFT'); }
                                                else if (e.key === 'Tab') { e.preventDefault(); moveFocusMonthly(rIdx, cIdx, e.shiftKey ? 'LEFT' : 'RIGHT'); }
                                                else if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); setTimeout(() => e.currentTarget.focus(), 0); }
                                                else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); saveToHistory(); handleTopNoteChange(d.full, ''); }
                                                else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.currentTarget.value = ''; handleTopNoteChange(d.full, ''); setEditingCell(cellId); setMonthlySelection({ r1: rIdx, c1: cIdx, r2: rIdx, c2: cIdx }); }
                                              } else if (isEditingThis) {
                                                if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); setEditingCell(null); moveFocusMonthly(rIdx, cIdx, 'DOWN'); }
                                                else if (e.key === 'Tab') { e.preventDefault(); setEditingCell(null); moveFocusMonthly(rIdx, cIdx, e.shiftKey ? 'LEFT' : 'RIGHT'); }
                                                else if (e.key === 'Escape') { e.preventDefault(); setEditingCell(null); e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length); } 
                                              }
                                            }}
                                            style={{
                                              fontSize: `${fontSize}px`, lineHeight: '1.3', opacity: isEditingThis ? 1 : 0,
                                              caretColor: (!isEditingThis && isActiveThis) ? 'transparent' : 'auto',
                                              cursor: (!isEditingThis && isActiveThis) ? 'default' : 'text',
                                              zIndex: isEditingThis ? 20 : 0
                                            }}
                                            className={`absolute inset-0 w-full h-full bg-white resize-none outline-none p-1 text-center font-bold text-slate-800 rounded shadow-sm overflow-hidden align-middle auto-resize ${isActiveThis && !isEditingThis ? 'select-none' : ''}`} 
                                          />
                                          {!isEditingThis && (
                                            <div className="w-full h-full flex flex-col gap-1.5 px-1 py-1 justify-center min-h-[30px] relative z-10 pointer-events-none">
                                              <div style={{ fontSize: `${fontSize}px`, lineHeight: '1.3' }} className="w-full h-full flex items-center justify-center whitespace-pre-wrap font-bold text-slate-800">{val}</div>
                                            </div>
                                          )}
                                        </div>
                                      </td>
                                    )
                                  })}
                                </tr>
                                {termScheduler.subjects.map((sub, sIdx) => {
                                  const rIdx = sIdx + 1;
                                  
                                  // 💡 [수정] 교재(Textbook) 칸 엑셀화 통합 (좌표 0, 15)
                                  const tbCIdx = blockIdx === 0 ? 0 : 15;
                                  const isSelTb = mb && rIdx >= mb.minR && rIdx <= mb.maxR && tbCIdx >= mb.minC && tbCIdx <= mb.maxC;
                                  const cellIdTb = `textbook-${sub}-${blockIdx}`;
                                  const isEditingTb = editingCell === cellIdTb;
                                  const isSingleSelTb = mb && mb.minR === mb.maxR && mb.minC === mb.maxC;
                                  const isActiveTb = isSingleSelTb && monthlySelection.r1 === rIdx && monthlySelection.c1 === tbCIdx;
                                  const tbVal = termScheduler.textbooks[sub] || '';

                                  return (
                                    <tr key={sub} className="text-center align-middle">
                                      <td className="border border-slate-300 px-1 py-1 font-black text-center relative group bg-slate-50/50 align-middle break-keep">
                                        <span style={{ fontSize: `${Math.max(9, fontSize - 1)}px` }}>{sub}</span>
                                        <button onClick={() => removeSubjectRow(sub)} className="absolute right-0.5 top-0.5 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity text-center"><X size={10}/></button>
                                      </td>
                                      
                                      <td key={cellIdTb}
                                        onMouseDown={(e) => {
                                          if (editingCell !== cellIdTb) setEditingCell(null);
                                          handleMonthlyMouseDown(e, rIdx, tbCIdx);
                                        }}
                                        onMouseEnter={() => handleMonthlyMouseEnter(rIdx, tbCIdx)}
                                        onClick={(e) => { 
                                          if (!e.shiftKey && !isEditingTb) {
                                            setTimeout(() => { const el = document.getElementById(`monthly-textarea-${rIdx}-${tbCIdx}`); if (el) el.focus(); }, 0);
                                          }
                                        }}
                                        onDoubleClick={() => setEditingCell(cellIdTb)}
                                        className={`border border-slate-300 p-0 align-middle text-center transition-colors relative ${isSelTb ? 'ring-2 ring-indigo-500 ring-inset z-10 bg-indigo-50/80' : 'hover:bg-slate-50 bg-white'} ${isEditingTb ? 'cursor-text' : 'cursor-cell'}`}
                                      >
                                        <div className="w-full h-full flex flex-col justify-center items-center p-0 text-center min-h-[50px] relative">
                                          <textarea 
                                            id={`monthly-textarea-${rIdx}-${tbCIdx}`}
                                            value={tbVal} 
                                            onChange={(e) => handleTermTextbookChange(sub, e.target.value)} 
                                            onInput={autoResize} onFocus={handleFocus} onBlur={(e) => handleBlur(e, null, null, true, 'TEXTBOOK', sub)} rows={1}
                                            onCompositionStart={(e) => {
                                              if (!isEditingTb && isActiveTb) {
                                                e.currentTarget.value = ''; handleTermTextbookChange(sub, '');
                                                setEditingCell(cellIdTb); setMonthlySelection({ r1: rIdx, c1: tbCIdx, r2: rIdx, c2: tbCIdx });
                                              }
                                            }}
                                            onKeyDown={(e) => { 
                                              if (e.nativeEvent.isComposing && e.key !== 'Escape') return;
                                              if (!isEditingTb && isActiveTb) {
                                                if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); setEditingCell(cellIdTb); e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length); }
                                                else if (e.key === 'ArrowDown') { e.preventDefault(); moveFocusMonthly(rIdx, tbCIdx, 'DOWN'); }
                                                else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocusMonthly(rIdx, tbCIdx, 'UP'); }
                                                else if (e.key === 'ArrowRight') { e.preventDefault(); moveFocusMonthly(rIdx, tbCIdx, 'RIGHT'); }
                                                else if (e.key === 'ArrowLeft') { e.preventDefault(); moveFocusMonthly(rIdx, tbCIdx, 'LEFT'); }
                                                else if (e.key === 'Tab') { e.preventDefault(); moveFocusMonthly(rIdx, tbCIdx, e.shiftKey ? 'LEFT' : 'RIGHT'); }
                                                else if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); setTimeout(() => e.currentTarget.focus(), 0); }
                                                else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); saveToHistory(); handleTermTextbookChange(sub, ''); }
                                                else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.currentTarget.value = ''; handleTermTextbookChange(sub, ''); setEditingCell(cellIdTb); setMonthlySelection({ r1: rIdx, c1: tbCIdx, r2: rIdx, c2: tbCIdx }); }
                                              } else if (isEditingTb) {
                                                if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); setEditingCell(null); moveFocusMonthly(rIdx, tbCIdx, 'DOWN'); }
                                                else if (e.key === 'Tab') { e.preventDefault(); setEditingCell(null); moveFocusMonthly(rIdx, tbCIdx, e.shiftKey ? 'LEFT' : 'RIGHT'); }
                                                else if (e.key === 'Escape') { e.preventDefault(); setEditingCell(null); e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length); } 
                                              }
                                            }}
                                            style={{
                                              fontSize: `${fontSize}px`, lineHeight: '1.3', opacity: isEditingTb ? 1 : 0,
                                              caretColor: (!isEditingTb && isActiveTb) ? 'transparent' : 'auto',
                                              cursor: (!isEditingTb && isActiveTb) ? 'default' : 'text',
                                              zIndex: isEditingTb ? 20 : 0
                                            }}
                                            className={`absolute inset-0 w-full h-full bg-white resize-none outline-none p-1 text-center font-bold text-slate-700 placeholder:text-slate-300 align-middle auto-resize ${isActiveTb && !isEditingTb ? 'select-none' : ''}`} 
                                          />
                                          {!isEditingTb && (
                                            <div className="w-full h-full flex flex-col justify-center px-1 min-h-[40px] relative z-10 pointer-events-none">
                                              {tbVal.trim() === '' ? ( <span className="text-transparent select-none w-full h-full block pointer-events-none" style={{ fontSize: `${fontSize}px` }}>.</span> ) : (
                                                <div style={{ fontSize: `${fontSize}px`, lineHeight: '1.3' }} className="font-bold text-slate-700 text-center w-full break-words whitespace-pre-wrap pointer-events-none">{tbVal}</div>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </td>

                                      {/* 💡 날짜 스케줄 셀 영역 */}
                                      {chunk.map((d, i) => {
                                        const cIdx = blockIdx === 0 ? i + 1 : i + 16;
                                        const val = termScheduler.cells[`${sub}-${d.full}`] || '';
                                        const lines = val.split('\n').filter(l => l.trim() !== '');
                                        const cellId = `${sub}-${d.full}`;
                                        const isEditingThis = editingCell === cellId;
                                        const isSel = mb && rIdx >= mb.minR && rIdx <= mb.maxR && cIdx >= mb.minC && cIdx <= mb.maxC;
                                        const isSingleSelection = mb && mb.minR === mb.maxR && mb.minC === mb.maxC;
                                        const isActiveThis = isSingleSelection && monthlySelection.r1 === rIdx && monthlySelection.c1 === cIdx;

                                        return (
                                          <td key={cellId}
                                            onMouseDown={(e) => {
                                              if (e.target.type === 'checkbox') return;
                                              if (editingCell !== cellId) setEditingCell(null);
                                              handleMonthlyMouseDown(e, rIdx, cIdx);
                                            }}
                                            onMouseEnter={() => handleMonthlyMouseEnter(rIdx, cIdx)}
                                            onClick={(e) => { 
                                              if (!e.shiftKey && !isEditingThis && e.target.type !== 'checkbox') {
                                                setTimeout(() => { const el = document.getElementById(`monthly-textarea-${rIdx}-${cIdx}`); if (el) el.focus(); }, 0);
                                              }
                                            }}
                                            onDoubleClick={(e) => {
                                              if (e.target.type !== 'checkbox') setEditingCell(cellId);
                                            }}
                                            className={`border border-slate-300 p-0 align-middle transition-colors relative text-center ${isSel ? 'ring-2 ring-indigo-500 ring-inset z-10 bg-indigo-50/80' : 'hover:bg-slate-50 bg-white'} ${isEditingThis ? 'cursor-text' : 'cursor-cell'}`}
                                          >
                                            <div className="w-full h-full flex flex-col justify-center items-center p-0 text-center min-h-[50px] relative">
                                              <textarea 
                                                id={`monthly-textarea-${rIdx}-${cIdx}`}
                                                value={val} 
                                                onChange={(e) => handleTermCellChange(sub, d.full, e.target.value)} 
                                                onInput={autoResize} onFocus={handleFocus} onBlur={(e) => handleBlur(e, null, null, true, sub, d.full)} rows={1}
                                                onCompositionStart={(e) => {
                                                  if (!isEditingThis && isActiveThis) {
                                                    e.currentTarget.value = ''; handleTermCellChange(sub, d.full, '');
                                                    setEditingCell(cellId); setMonthlySelection({ r1: rIdx, c1: cIdx, r2: rIdx, c2: cIdx });
                                                  }
                                                }}
                                                onKeyDown={(e) => { 
                                                  if (e.nativeEvent.isComposing && e.key !== 'Escape') return;
                                                  if (!isEditingThis && isActiveThis) {
                                                    if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); setEditingCell(cellId); e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length); }
                                                    else if (e.key === 'ArrowDown') { e.preventDefault(); moveFocusMonthly(rIdx, cIdx, 'DOWN'); }
                                                    else if (e.key === 'ArrowUp') { e.preventDefault(); moveFocusMonthly(rIdx, cIdx, 'UP'); }
                                                    else if (e.key === 'ArrowRight') { e.preventDefault(); moveFocusMonthly(rIdx, cIdx, 'RIGHT'); }
                                                    else if (e.key === 'ArrowLeft') { e.preventDefault(); moveFocusMonthly(rIdx, cIdx, 'LEFT'); }
                                                    else if (e.key === 'Tab') { e.preventDefault(); moveFocusMonthly(rIdx, cIdx, e.shiftKey ? 'LEFT' : 'RIGHT'); }
                                                    else if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); setTimeout(() => e.currentTarget.focus(), 0); }
                                                    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); saveToHistory(); handleTermCellChange(sub, d.full, ''); }
                                                    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.currentTarget.value = ''; handleTermCellChange(sub, d.full, ''); setEditingCell(cellId); setMonthlySelection({ r1: rIdx, c1: cIdx, r2: rIdx, c2: cIdx }); }
                                                  } else if (isEditingThis) {
                                                    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); setEditingCell(null); moveFocusMonthly(rIdx, cIdx, 'DOWN'); }
                                                    else if (e.key === 'Tab') { e.preventDefault(); setEditingCell(null); moveFocusMonthly(rIdx, cIdx, e.shiftKey ? 'LEFT' : 'RIGHT'); }
                                                    else if (e.key === 'Escape') { e.preventDefault(); setEditingCell(null); e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length); } 
                                                  }
                                                }}
                                                style={{
                                                  fontSize: `${fontSize}px`, lineHeight: '1.3', opacity: isEditingThis ? 1 : 0,
                                                  caretColor: (!isEditingThis && isActiveThis) ? 'transparent' : 'auto',
                                                  cursor: (!isEditingThis && isActiveThis) ? 'default' : 'text',
                                                  zIndex: isEditingThis ? 20 : 0
                                                }}
                                                className={`absolute inset-0 w-full h-full bg-white resize-none outline-none p-1 text-center font-bold text-slate-800 rounded shadow-sm overflow-hidden align-middle auto-resize ${isActiveThis && !isEditingThis ? 'select-none' : ''}`} 
                                              />
                                              {!isEditingThis && (
                                                <div className="w-full h-full flex flex-col gap-1.5 px-1 py-1 justify-center min-h-[40px] relative z-10 pointer-events-auto cursor-default">
                                                  {val.trim() === '' ? ( <span className="text-transparent select-none w-full h-full block cursor-default pointer-events-none" style={{ fontSize: `${fontSize}px` }}>.</span> ) : (
                                                    lines.map((line, idx) => (
                                                      <div key={idx} className="flex items-center justify-center gap-1 bg-white/70 rounded px-1 py-1 shadow-sm border border-black/5 mx-auto w-[95%] cursor-default pointer-events-auto">
                                                        <span style={{ fontSize: `${fontSize}px`, lineHeight: '1.3' }} className="font-black text-slate-800 text-center flex-1 break-words whitespace-pre-wrap pointer-events-none">{line}</span>
                                                        <input type="checkbox" checked={termScheduler.checks[`${sub}-${d.full}-${idx}`] || false} 
                                                          onChange={(e) => { e.stopPropagation(); handleTermCheckToggle(sub, d.full, idx); }} 
                                                          onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            setMonthlySelection({ r1: rIdx, c1: cIdx, r2: rIdx, c2: cIdx }); 
                                                            setTimeout(() => { const el = document.getElementById(`monthly-textarea-${rIdx}-${cIdx}`); if (el) el.focus(); }, 0); 
                                                          }} 
                                                          className="w-3 h-3 md:w-4 md:h-4 cursor-pointer accent-indigo-600 flex-shrink-0 relative z-30" 
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
                              <tr className="bg-slate-100 font-black text-slate-800 text-center" style={{ fontSize: `${Math.max(9, fontSize - 1)}px` }}>
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
                                  <tr key={`status-${sub}-${index}`} className="bg-white hover:bg-slate-50 transition-colors text-center" style={{ fontSize: `${Math.max(9, fontSize - 1)}px` }}>
                                    {index === 0 && <td rowSpan={rowData.length} className="border border-slate-200 text-center font-black py-3 bg-slate-50/50 align-middle"><span style={{ fontSize: `${fontSize}px` }}>{sub}</span></td>}
                                    <td className="border border-slate-200 p-2 text-center font-bold text-slate-700 align-middle break-words whitespace-pre-wrap"><span style={{ fontSize: `${fontSize}px` }}>{data.tbName}</span></td>
                                    <td className="border border-slate-200 bg-slate-50/5 text-center font-black px-2 md:px-3 py-2 text-indigo-700 align-middle break-words whitespace-pre-wrap"><span style={{ fontSize: `${fontSize}px` }}>{data.firstData}</span></td>
                                    <td className="border border-slate-200 bg-slate-50/5 text-center font-black px-2 md:px-3 py-2 text-rose-700 align-middle break-words whitespace-pre-wrap"><span style={{ fontSize: `${fontSize}px` }}>{data.lastData}</span></td>
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
                          style={{ fontSize: `${fontSize + 2}px`, lineHeight: '1.4' }}
                          className="w-full p-4 rounded-xl border border-slate-100 outline-none focus:border-indigo-500 transition-all font-bold resize-none text-center overflow-hidden bg-transparent auto-resize" 
                        />
                      </div>
                    ))}
                  </div>
                )}
              </main>

              <div className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-50 flex flex-col items-end text-center print:hidden">
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
            </div>
          )}

          {/* 🖨️ [인쇄 설정 모달창] */}
          {showPrintModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in print:hidden" onClick={() => setShowPrintModal(false)}>
              <div className="w-full max-w-sm rounded-3xl shadow-2xl p-6 bg-white text-left cursor-default" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-black text-xl flex items-center gap-2 text-slate-800"><Printer className="text-indigo-600 w-6 h-6" /> 인쇄 설정</h3>
                  <button onClick={() => setShowPrintModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors"><X size={20}/></button>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-bold text-slate-600 mb-2 block">용지 방향</label>
                    <div className="flex gap-2 text-center">
                      <button onClick={() => setPrintConfig({...printConfig, orientation: 'portrait'})} className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${printConfig.orientation === 'portrait' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>세로</button>
                      <button onClick={() => setPrintConfig({...printConfig, orientation: 'landscape'})} className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${printConfig.orientation === 'landscape' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>가로</button>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-bold text-slate-600 mb-2 block">인쇄 영역</label>
                    <div className="flex gap-2 text-center">
                      <button onClick={() => setPrintConfig({...printConfig, scope: 'all'})} className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${printConfig.scope === 'all' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>전체 시간표</button>
                      <button onClick={() => setPrintConfig({...printConfig, scope: 'selection'})} disabled={!getSelectionBounds() || (getSelectionBounds().minId === getSelectionBounds().maxId && getSelectionBounds().minDayIdx === getSelectionBounds().maxDayIdx)} className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${printConfig.scope === 'selection' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'} disabled:opacity-50 disabled:cursor-not-allowed`}>선택 영역만</button>
                    </div>
                    {(!getSelectionBounds() || (getSelectionBounds().minId === getSelectionBounds().maxId && getSelectionBounds().minDayIdx === getSelectionBounds().maxDayIdx)) && <p className="text-[11px] text-slate-400 mt-2 font-medium break-keep text-center">* 표에서 여러 셀을 드래그하여 영역 지정 시 활성화됨.</p>}
                  </div>

                  <div>
                    <label className="text-sm font-bold text-slate-600 mb-2 block">색상 모드</label>
                    <div className="flex gap-2 text-center">
                      <button onClick={() => setPrintConfig({...printConfig, colorMode: 'color'})} className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${printConfig.colorMode === 'color' ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>컬러</button>
                      <button onClick={() => setPrintConfig({...printConfig, colorMode: 'grayscale'})} className={`flex-1 py-3 rounded-xl font-bold text-sm border-2 transition-all ${printConfig.colorMode === 'grayscale' ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}>흑백</button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-8 text-center">
                  <button onClick={() => setShowPrintModal(false)} className="flex-1 py-4 bg-slate-100 rounded-xl font-bold text-slate-600 hover:bg-slate-200 transition-colors">취소</button>
                  <button onClick={() => { setShowPrintModal(false); setTimeout(() => window.print(), 100); }} className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-black shadow-lg hover:bg-indigo-700 transition-colors">인쇄 시작</button>
                </div>
              </div>
            </div>
          )}

          {/* 🎨 [색상 설정 중앙 모달창] */}
          {showColorModal && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in print:hidden" onClick={() => setShowColorModal(false)}>
              <div className="w-full max-w-sm p-6 rounded-3xl shadow-2xl border border-slate-200 bg-white animate-fade-in text-center cursor-default" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                  <h4 className="font-extrabold text-xl flex items-center justify-center gap-2 text-slate-800"><Palette className="text-indigo-600 w-6 h-6"/> 키워드 색상 지정</h4>
                  <button onClick={() => setShowColorModal(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors"><X size={20}/></button>
                </div>
                
                <div className="flex gap-2 mb-4">
                  <input type="text" placeholder="단어" value={newColorRule.keyword} onChange={(e) => setNewColorRule({ ...newColorRule, keyword: e.target.value })} className="flex-1 p-3 text-sm rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 border border-slate-200 bg-slate-50 text-center" />
                  <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-inner border border-slate-200 flex-shrink-0 cursor-pointer"><input type="color" value={newColorRule.color} onChange={(e) => setNewColorRule({ ...newColorRule, color: e.target.value })} className="absolute top-[-10px] left-[-10px] w-[200%] h-[200%] cursor-pointer border-0 p-0" /></div>
                  <button onClick={addColorRule} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 shadow-md text-sm">추가</button>
                </div>
                
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                  {colorRules.length === 0 && <div className="text-slate-400 font-bold p-4 text-xs">등록된 색상이 없습니다.</div>}
                  {colorRules.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between text-sm p-3 rounded-xl border border-slate-100 bg-slate-50 group hover:border-indigo-200 transition-colors text-center">
                      <div className="flex items-center gap-3 font-bold"><div className="w-5 h-5 rounded-full shadow-inner border border-black/10" style={{ backgroundColor: rule.color }}></div><span>{rule.keyword}</span></div>
                      <button onClick={() => removeColorRule(rule.id)} className="p-1.5 rounded-lg transition-colors opacity-100 md:opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50"><X className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {showResetConfirm && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-center print:hidden" onClick={() => setShowResetConfirm(false)}>
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
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-center print:hidden" onClick={() => setShowLogoutConfirm(false)}>
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
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-center print:hidden" onClick={() => setStudentToDelete(null)}>
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
      </div>

      <div className="hidden print:flex flex-col absolute inset-0 bg-white print-container box-border" style={{ filter: printConfig.colorMode === 'grayscale' ? 'grayscale(100%)' : 'none' }}>
        {view === 'PLANNER' && activeTab === 'WEEKLY' && (() => {
          const getPrintTimetable = () => {
            const bounds = getSelectionBounds();
            const isSelection = printConfig.scope === 'selection' && bounds;
            const pMinDay = isSelection ? bounds.minDayIdx : 0;
            const pMaxDay = isSelection ? bounds.maxDayIdx : 6;
            const pMinId = isSelection ? bounds.minId : 1;
            const pMaxId = isSelection ? bounds.maxId : 32;

            const printDays = DAYS.slice(pMinDay, pMaxDay + 1);
            const printRows = [];

            for (let r = pMinId - 1; r <= pMaxId - 1; r++) {
              const origRow = timetable[r];
              if (!origRow) continue;
              
              const newRow = { id: origRow.id, time: origRow.time };
              
              printDays.forEach((day) => {
                if (r === pMinId - 1 && origRow[`${day}_hidden`]) {
                  let ptr = r - 1; let originText = ''; let originSpan = 1; let found = false;
                  while (ptr >= 0) {
                    if (timetable[ptr] && !timetable[ptr][`${day}_hidden`]) {
                      originText = timetable[ptr][day] || ''; originSpan = timetable[ptr][`${day}_span`] || 1; found = true; break;
                    }
                    ptr--;
                  }
                  if (found) {
                    const overlap = originSpan - (r - ptr); 
                    if (overlap > 0) {
                      newRow[day] = originText; newRow[`${day}_hidden`] = false; newRow[`${day}_span`] = Math.min(overlap, pMaxId - 1 - r + 1);
                    } else { newRow[day] = ''; newRow[`${day}_hidden`] = true; newRow[`${day}_span`] = 1; }
                  } else { newRow[day] = ''; newRow[`${day}_hidden`] = true; newRow[`${day}_span`] = 1; }
                } else if (!origRow[`${day}_hidden`]) {
                  const span = origRow[`${day}_span`] || 1;
                  newRow[day] = origRow[day]; newRow[`${day}_hidden`] = false; newRow[`${day}_span`] = Math.min(span, pMaxId - 1 - r + 1);
                } else { newRow[day] = ''; newRow[`${day}_hidden`] = true; newRow[`${day}_span`] = 1; }
              });
              printRows.push(newRow);
            }
            return { printDays, printRows, pMinDayIdx: pMinDay };
          };

          const { printDays, printRows, pMinDayIdx } = getPrintTimetable();
          const labelsLong = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
          const bStyle = { border: '0.5pt solid #cbd5e1' }; 
          
          return (
            <div className="w-full h-full flex flex-col bg-white overflow-hidden box-border">
              <div className="flex items-center justify-center flex-shrink-0 h-20 sm:h-24 w-full">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight m-0 p-0 leading-none">
                  {studentName ? `${studentName} 주간 시간표` : '주간 시간표'}
                </h1>
              </div>
              <table className="w-full h-full flex-1 border-collapse text-center" style={{ ...bStyle, tableLayout: 'fixed' }}>
                <thead>
                  <tr>
                    <th className="py-0.5 bg-slate-100 font-black text-slate-700 text-[10px] sm:text-xs align-middle" style={{ ...bStyle, width: '45px' }}>시간</th>
                    {printDays.map((day, idx) => (
                      <th key={day} className={`py-0.5 bg-slate-100 font-black text-[10px] sm:text-xs align-middle break-keep ${printConfig.colorMode === 'grayscale' ? 'text-slate-800' : (day==='sat'?'text-blue-600':day==='sun'?'text-red-600':'text-slate-700')}`} style={bStyle}>
                        {labelsLong[pMinDayIdx + idx]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {printRows.map(row => (
                    <tr key={row.id} style={{ height: '1%' }}>
                      <td className="py-0 font-bold text-slate-500 text-[8px] sm:text-[9px] leading-none break-keep align-middle" style={bStyle}>
                        {row.time}
                      </td>
                      {printDays.map(day => {
                        if (row[`${day}_hidden`]) return null;
                        const text = row[day] || '';
                        const span = row[`${day}_span`] || 1;
                        const bgColor = printConfig.colorMode === 'color' ? (getCellColor(text) || 'transparent') : 'transparent';
                        return (
                          <td key={day} rowSpan={span} className="p-0.5 font-bold text-[9px] sm:text-[11px] leading-[1.1] text-slate-800 align-middle overflow-hidden break-all whitespace-pre-wrap" style={{ ...bStyle, backgroundColor: bgColor }}>
                            <div className="w-full h-full flex flex-col items-center justify-center overflow-hidden text-center max-h-full">
                              {text}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; } 
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.4); border-radius: 10px; } 
        .animate-fade-in { animation: fadeIn 0.3s forwards; } 
        @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

        @media print {
          @page {
            size: A4 ${printConfig.orientation};
            margin: 8mm;
          }
          html, body {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important; 
            padding: 0 !important;
            overflow: hidden !important; 
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            background-color: white !important;
          }
          ::-webkit-scrollbar { display: none; }
          .print-container {
            position: absolute !important;
            top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
            width: 100% !important; height: 100% !important;
            max-height: 100% !important;
            box-sizing: border-box !important;
            page-break-after: avoid !important;
            page-break-before: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      ` }} />
    </>
  );
}
