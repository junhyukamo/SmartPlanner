import React, { useState, useEffect, useRef } from 'react';
import {
  Check,
  Trash2,
  Plus,
  Clock,
  BookOpen,
  Sun,
  Moon,
  Calendar,
  X,
  PenTool,
  Users,
  LogIn,
  ChevronLeft,
  LogOut,
  Layout,
  Sparkles,
  Send,
  MousePointer2,
  Wand2,
  ListTodo,
  Merge,
  Split,
  Palette,
  AlertCircle,
  Key,
  Settings,
  ChevronRight,
  Copy,
  UserPlus,
  Link as LinkIcon
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  collection,
  deleteDoc,
  query,
  where
} from 'firebase/firestore';

// ==================================================================================
// Firebase 설정
// ==================================================================================
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

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('LOADING');
  const [role, setRole] = useState('');
  const [studentName, setStudentName] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [criticalError, setCriticalError] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(null);
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

  const generateTimeSlots = () => {
    const slots = [];
    let idCounter = 1;
    for (let hour = 8; hour < 24; hour++) {
      for (let min = 0; min < 60; min += 30) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
        slots.push({
          id: idCounter++,
          time: timeStr,
          mon: '', tue: '', wed: '', thu: '', fri: '', sat: '', sun: '',
          mon_span: 1, mon_hidden: false,
          tue_span: 1, tue_hidden: false,
          wed_span: 1, wed_hidden: false,
          thu_span: 1, thu_hidden: false,
          fri_span: 1, fri_hidden: false,
          sat_span: 1, sat_hidden: false,
          sun_span: 1, sun_hidden: false,
        });
      }
    }
    return slots;
  };

  const [timetable, setTimetable] = useState(generateTimeSlots());
  const [todos, setTodos] = useState([]);
  const [dDay, setDDay] = useState(null);
  const [dDayInput, setDDayInput] = useState({ title: '', date: '' });
  const [memo, setMemo] = useState('');
  const [yearlyPlan, setYearlyPlan] = useState(Array(12).fill(''));
  const [monthlyMemo, setMonthlyMemo] = useState('');
  const [termScheduler, setTermScheduler] = useState({ 
    cells: {}, 
    status: {}, 
    textbooks: {}, 
    subjects: [], 
    topNotes: {},
    checks: {} 
  });
  
  const [currentDate, setCurrentDate] = useState(new Date(2026, 1, 1)); 
  const [colorRules, setColorRules] = useState([]);
  const [newColorRule, setNewColorRule] = useState({ keyword: '', color: '#bfdbfe' });
  const [studentList, setStudentList] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [selection, setSelection] = useState({ day: null, startId: null, endId: null });
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');
  const [editingCell, setEditingCell] = useState(null); 

  const autoResize = (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  const calculateDDay = (targetDate) => {
    if (!targetDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(targetDate);
    target.setHours(0, 0, 0, 0);
    const diff = target.getTime() - today.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'D-Day';
    return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
        const params = new URLSearchParams(window.location.search);
        const sid = params.get('sid');
        
        if (sid) {
          setCurrentDocId(sid); 
          setRole('student'); 
          setView('PLANNER'); 
        } else {
          const savedRole = localStorage.getItem('planner_role');
          const savedName = localStorage.getItem('planner_name');
          if (savedRole === 'student' && savedName) {
            setRole('student'); setStudentName(savedName); setCurrentDocId(savedName); setView('PLANNER');
          } else if (savedRole === 'teacher') {
            setRole('teacher'); setView('TEACHER_DASHBOARD');
          } else {
            setView('LANDING');
          }
        }

        const globalRef = doc(db, 'settings', 'global');
        onSnapshot(globalRef, (snap) => {
          if (snap.exists()) setGlobalAiKey(snap.data().aiKey || '');
        });
      } catch (error) {
        console.error("로그인 실패:", error);
        setCriticalError('AUTH_CONFIG_MISSING');
      }
    };
    initAuth();
    onAuthStateChanged(auth, setUser);
  }, []);

  useEffect(() => {
    if (!user || !currentDocId || (view !== 'PLANNER' && view !== 'TEACHER_DASHBOARD')) return;
    setLoading(true);
    const docRef = doc(db, 'planners', currentDocId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      try {
        if (docSnap.metadata?.hasPendingWrites) return;
        if (docSnap.exists()) {
          setIsNotFound(false); 
          const data = docSnap.data();
          if (Array.isArray(data.timetable)) {
            const patchedTimetable = data.timetable.map((row) => ({
              mon_span: 1, mon_hidden: false, tue_span: 1, tue_hidden: false,
              wed_span: 1, wed_hidden: false, thu_span: 1, thu_hidden: false,
              fri_span: 1, fri_hidden: false, sat_span: 1, sat_hidden: false,
              sun_span: 1, sun_hidden: false, ...row,
            }));
            setTimetable(patchedTimetable);
          } else { setTimetable(generateTimeSlots()); }
          if (data.todos) setTodos(data.todos);
          if (data.dDay) setDDay(data.dDay);
          if (data.memo) setMemo(data.memo);
          if (data.yearlyPlan) setYearlyPlan(data.yearlyPlan);
          if (data.monthlyMemo) setMonthlyMemo(data.monthlyMemo);
          if (data.termScheduler) setTermScheduler({
            subjects: [], cells: {}, status: {}, textbooks: {}, topNotes: {}, checks: {},
            ...data.termScheduler
          });
          if (data.colorRules) setColorRules(data.colorRules);
          if (data.studentName) setStudentName(data.studentName);
        } else {
          setIsNotFound(true);
        }
      } catch (e) { console.error("데이터 로드 에러:", e); } finally { setLoading(false); }
    });
    return () => unsubscribe();
  }, [user, currentDocId, view]);

  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return; }
    if (!user || !currentDocId || view !== 'PLANNER' || loading || isNotFound) return;
    const saveData = async () => {
      const docRef = doc(db, 'planners', currentDocId);
      const isActuallyName = studentName && studentName !== currentDocId;
      await setDoc(docRef, {
        timetable, todos, dDay, memo, yearlyPlan, monthlyMemo, termScheduler,
        lastUpdated: new Date().toISOString(),
        ...(isActuallyName && { studentName: studentName })
      }, { merge: true });
    };
    const timeoutId = setTimeout(saveData, 1000);
    return () => clearTimeout(timeoutId);
  }, [timetable, todos, dDay, memo, yearlyPlan, monthlyMemo, termScheduler, user, currentDocId, view, loading, studentName, isNotFound]);

  useEffect(() => {
    if (!user || view !== 'TEACHER_DASHBOARD') return;
    const q = collection(db, 'planners');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const students = [];
      snapshot.forEach((doc) => students.push({ id: doc.id, ...doc.data() }));
      students.sort((a, b) => (a.studentName || "").localeCompare(b.studentName || "", 'ko'));
      setStudentList(students);
    });
    return () => unsubscribe();
  }, [user, view]);

  const saveGlobalAiKey = async () => {
    try {
      const globalRef = doc(db, 'settings', 'global');
      await setDoc(globalRef, { aiKey: globalAiKey }, { merge: true });
      setShowGlobalKeyInput(false);
      setAiFeedback('✅ 공용 API 키가 업데이트되었습니다.');
      setTimeout(() => setAiFeedback(''), 3000);
    } catch (e) { console.error(e); setAiFeedback('❌ 저장 실패'); }
  };

  const createNewStudentSheet = async () => {
    const name = prompt("생성할 학생의 이름을 입력하세요.");
    if (!name || !name.trim()) return;
    const newSid = crypto.randomUUID();
    setLoading(true);
    try {
      const docRef = doc(db, 'planners', newSid);
      await setDoc(docRef, {
        studentName: name.trim(),
        timetable: generateTimeSlots(),
        todos: [],
        yearlyPlan: Array(12).fill(''),
        createdAt: new Date().toISOString()
      });
      setAiFeedback(`✅ '${name}' 학생의 시트가 생성되었습니다.`);
      setTimeout(() => setAiFeedback(''), 3000);
    } catch (e) { console.error(e); setAiFeedback('❌ 생성 실패'); } finally { setLoading(false); }
  };

  const copyStudentLink = (sid) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?sid=${sid}`;
    const el = document.createElement('textarea');
    el.value = shareUrl; document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
    setCopyFeedback(sid); setTimeout(() => setCopyFeedback(null), 2000);
  };

  const handleMouseDown = (day, id) => { setIsDragging(true); setSelection({ day, startId: id, endId: id }); };
  const handleMouseEnter = (day, id) => { if (isDragging && selection.day === day) setSelection((prev) => ({ ...prev, endId: id })); };
  const handleMouseUp = () => setIsDragging(false);
  useEffect(() => { window.addEventListener('mouseup', handleMouseUp); return () => window.removeEventListener('mouseup', handleMouseUp); }, []);

  const mergeCells = () => {
    if (!selection.day || !selection.startId || !selection.endId) return;
    const start = Math.min(selection.startId, selection.endId);
    const end = Math.max(selection.startId, selection.endId);
    const spanCount = end - start + 1;
    if (spanCount <= 1) return;
    const newTimetable = timetable.map((row) => {
      if (row.id === start) return { ...row, [`${selection.day}_span`]: spanCount, [`${selection.day}_hidden`]: false };
      else if (row.id > start && row.id <= end) return { ...row, [`${selection.day}_span`]: 1, [`${selection.day}_hidden`]: true, [selection.day]: '' };
      return row;
    });
    setTimetable(newTimetable); setSelection({ day: null, startId: null, endId: null });
  };

  const unmergeCells = () => {
    if (!selection.day || !selection.startId) return;
    const targetRow = timetable.find((r) => r.id === selection.startId);
    if (!targetRow || (targetRow[`${selection.day}_span`] || 1) <= 1) return;
    const span = targetRow[`${selection.day}_span`];
    const newTimetable = timetable.map((row) => {
      if (row.id >= selection.startId && row.id < selection.startId + span) return { ...row, [`${selection.day}_span`]: 1, [`${selection.day}_hidden`]: false };
      return row;
    });
    setTimetable(newTimetable); setSelection({ day: null, startId: null, endId: null });
  };

  const executeResetTimetable = () => {
    if (activeTab === 'WEEKLY') {
      setTimetable((prev) => prev.map((row) => {
        const newRow = { ...row };
        ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach((day) => {
          newRow[day] = ''; newRow[`${day}_span`] = 1; newRow[`${day}_hidden`] = false;
        });
        return newRow;
      }));
    } else if (activeTab === 'MONTHLY') {
      setTermScheduler({ subjects: [], cells: {}, status: {}, textbooks: {}, topNotes: {}, checks: {} });
    }
    setSelection({ day: null, startId: null, endId: null });
    setShowResetConfirm(false); 
  };

  const addColorRule = () => {
    if (!newColorRule.keyword.trim()) return;
    setColorRules([...colorRules, { ...newColorRule, id: Date.now() }]);
    setNewColorRule({ ...newColorRule, keyword: '' });
  };
  const removeColorRule = (id) => setColorRules(colorRules.filter((rule) => rule.id !== id));
  
  const getCellColor = (text) => {
    if (!text || typeof text !== 'string') return null;
    const rule = colorRules.find((r) => text.includes(r.keyword));
    return rule ? rule.color : null;
  };

  const getSchedulerDates = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    let startDate;
    if (year === 2026 && month === 1) {
      startDate = new Date(2026, 1, 2);
    } else {
      const firstDayOfMonth = new Date(year, month, 1);
      let offset = firstDayOfMonth.getDay(); 
      if (offset === 0) offset = 7; 
      startDate = new Date(firstDayOfMonth);
      startDate.setDate(firstDayOfMonth.getDate() - (offset - 1));
    }
    const days = [];
    const dayLabels = ['일', '월', '화', '수', '목', '금', '토'];
    for (let i = 0; i < 28; i++) {
      const dateObj = new Date(startDate);
      dateObj.setDate(startDate.getDate() + i);
      days.push({
        full: `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`,
        label: `${dateObj.getMonth() + 1}/${dateObj.getDate()}`,
        day: dayLabels[dateObj.getDay()],
        isWeekend: dateObj.getDay() === 0 || dateObj.getDay() === 6,
        isSat: dateObj.getDay() === 6
      });
    }
    return days;
  };

  const handleTermCellChange = (subject, dateKey, value) => {
    setTermScheduler(prev => ({
      ...prev,
      cells: { ...prev.cells, [`${subject}-${dateKey}`]: value }
    }));
  };

  const handleTermCheckToggle = (subject, dateKey, index) => {
    const key = `${subject}-${dateKey}-${index}`;
    setTermScheduler(prev => ({
      ...prev,
      checks: { ...prev.checks, [key]: !prev.checks[key] }
    }));
  };

  const handleTopNoteChange = (dateKey, value) => {
    setTermScheduler(prev => ({
      ...prev,
      topNotes: { ...prev.topNotes, [dateKey]: value }
    }));
  };

  const handleTermTextbookChange = (subject, value) => {
    setTermScheduler(prev => ({
      ...prev,
      textbooks: { ...prev.textbooks, [subject]: value }
    }));
  };

  const addSubjectRow = (name) => {
    if (!name || termScheduler.subjects.includes(name)) return;
    setTermScheduler(prev => ({
      ...prev,
      subjects: [...prev.subjects, name]
    }));
  };

  const removeSubjectRow = (name) => {
    setTermScheduler(prev => ({
      ...prev,
      subjects: prev.subjects.filter(s => s !== name)
    }));
  };

  const callGeminiAPI = async (systemPrompt, userText = "", retries = 5) => {
    if (!globalAiKey) { setAiFeedback('⚠️ 공용 API 키가 등록되지 않았습니다 (관리자 문의).'); return null; }
    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAiKey}`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt + '\n' + userText }] }] }) }
        );
        const result = await response.json();
        if (result.error) {
          if (result.error.code === 429) {
            if (i < retries - 1) {
              const delay = Math.pow(2, i) * 2000;
              setAiFeedback(`⚠️ 사용량 초과. ${delay/1000}초 후 자동 재시도... (${i + 1}/${retries})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              continue;
            }
            throw new Error("AI 사용 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.");
          }
          throw new Error(result.error.message);
        }
        return result.candidates?.[0]?.content?.parts?.[0]?.text;
      } catch (error) {
        if (i === retries - 1) {
          setAiFeedback(`❌ AI 오류: ${error.message}`);
          return null;
        }
      }
    }
    return null;
  };

  const handleAiSubmit = async (e) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setIsAiProcessing(true);
    setAiFeedback('AI 조교가 요청을 처리 중입니다...');
    const schedulerDates = getSchedulerDates().map(d => d.full);
    const systemPrompts = {
      WEEKLY: `당신은 주간 학습 플래너 전문가입니다. 사용자의 요청을 08:00~24:00 일정표에 분배하세요. JSON 형식으로만 응답하세요. 구조: { "type": "UPDATE_TIMETABLE", "updates": [{ "day": "mon|tue|wed|thu|fri|sat|sun", "startTime": "HH:MM", "endTime": "HH:MM", "content": "내용" }] }`,
      MONTHLY: `당신은 '팀 스케줄러' 데이터 채우기 전문가입니다. 
               중요: 현재 등록된 과목 리스트: [${termScheduler.subjects.join(', ')}]. 
               사용자가 특정 과목의 학습 계획을 말하면 해당 과목의 행을 찾아 날짜별로 내용을 채우세요.
               절대 기존 데이터를 지우지 말고, 새롭게 추가되는 형식으로 응답하세요.
               항목이 여러 개라면 줄바꿈(\\n)으로 구분하여 작성하세요. 각 줄은 자동으로 체크박스가 생성됩니다.
               JSON 구조: { "type": "UPDATE_TERM_SCHEDULER", "cells": [{ "subject": "과목명", "date": "YYYY-MM-DD", "content": "추가될내용" }] }`,
      YEARLY: `당신은 연간 로드맵 전문가입니다. 1월부터 12월까지 학습 흐름을 구성하세요. JSON 형식으로만 응답하세요. 구조: { "type": "UPDATE_YEARLY", "plans": ["1월내용", ..., "12월내용"] }`
    };
    const text = await callGeminiAPI(systemPrompts[activeTab], `사용자 요청: "${aiPrompt}" / 현재 사용 가능한 날짜 리스트: ${JSON.stringify(schedulerDates)}`);
    if (text) {
      try {
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const aiResponse = JSON.parse(cleanJson);
        if (aiResponse.type === 'UPDATE_TIMETABLE' && activeTab === 'WEEKLY') {
          let newTimetable = [...timetable];
          aiResponse.updates.forEach((update) => {
            const timeToIndex = (t) => { const [h, m] = t.split(':').map(Number); return (h - 8) * 2 + (m === 30 ? 1 : 0); };
            const startIdx = timeToIndex(update.startTime);
            const endIdx = timeToIndex(update.endTime) - 1;
            if (startIdx >= 0 && endIdx <= 31) {
              newTimetable = newTimetable.map((row, idx) => {
                if (idx === startIdx) return { ...row, [`${update.day}_span`]: endIdx - startIdx + 1, [`${update.day}_hidden`]: false, [update.day]: update.content };
                else if (idx > startIdx && idx <= endIdx) return { ...row, [`${update.day}_hidden`]: true, [update.day]: '' };
                return row;
              });
            }
          });
          setTimetable(newTimetable); setAiFeedback('✅ 주간 시간표 반영 완료!');
        } else if (aiResponse.type === 'UPDATE_TERM_SCHEDULER' && activeTab === 'MONTHLY') {
          const newCells = { ...termScheduler.cells };
          aiResponse.cells?.forEach(c => { 
            if(termScheduler.subjects.includes(c.subject)) {
              const existing = termScheduler.cells[`${c.subject}-${c.date}`] || "";
              newCells[`${c.subject}-${c.date}`] = existing ? `${existing}\n${c.content}` : c.content;
            }
          });
          setTermScheduler(prev => ({ ...prev, cells: newCells }));
          setAiFeedback('✅ 월간 데이터 추가 완료!');
        } else if (aiResponse.type === 'UPDATE_YEARLY' && activeTab === 'YEARLY') {
          setYearlyPlan(aiResponse.plans); setAiFeedback('✅ 연간 로드맵 반영 완료!');
        }
      } catch (e) { setAiFeedback('❌ 데이터 해석 실패.'); }
    }
    setAiPrompt(''); setIsAiProcessing(false);
    setTimeout(() => { if (!text) setShowAiModal(false); setAiFeedback(''); }, 3000);
  };

  const handleTeacherLogin = (e) => {
    e.preventDefault();
    if (teacherPassword === '551000') {
      localStorage.setItem('planner_role', 'teacher'); setRole('teacher'); setView('TEACHER_DASHBOARD'); setTeacherPassword('');
    } else { setErrorMsg('비밀번호가 일치하지 않습니다.'); }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  const executeLogout = () => {
    localStorage.removeItem('planner_role'); localStorage.removeItem('planner_name');
    setView('LANDING'); setRole(''); setStudentName(''); setCurrentDocId(null); setShowLogoutConfirm(false);
    if (window.location.search.includes('sid=')) window.history.replaceState({}, '', window.location.pathname);
  };

  const handleTimetableChange = (id, day, value) => setTimetable((prev) => prev.map((row) => row.id === id ? { ...row, [day]: value } : row));
  const handleYearlyChange = (index, value) => { const newPlan = [...yearlyPlan]; newPlan[index] = value; setYearlyPlan(newPlan); };
  const handleDeleteStudent = (e, studentId) => { e.stopPropagation(); setStudentToDelete(studentId); };
  const executeDeleteStudent = async () => { if (!studentToDelete) return; try { await deleteDoc(doc(db, 'planners', studentToDelete)); setStudentToDelete(null); } catch (e) { console.error(e); } };

  if (view === 'LOADING') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
      <div className="text-slate-500 font-medium tracking-widest animate-pulse">로딩중...</div>
    </div>
  );

  if (view === 'PLANNER_DELETED_BLANK') return <div className="min-h-screen bg-slate-50" />;
  if (isNotFound && view === 'PLANNER') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      <div className="w-20 h-20 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-6"><AlertCircle size={40} /></div>
      <h1 className="text-2xl font-black text-slate-800 mb-2">삭제된 플래너입니다.</h1>
      <p className="text-slate-500 mb-8 text-center font-bold">해당 플래너는 더 이상 존재하지 않거나 관리자에 의해 삭제되었습니다.</p>
      <button onClick={() => setView('PLANNER_DELETED_BLANK')} className="px-8 py-3 bg-slate-800 text-white rounded-xl font-bold shadow-lg">확인</button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 transition-colors duration-300">
      
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
            <div className="mb-8"><h2 className="text-3xl font-extrabold text-slate-800 mb-2">관리자 로그인</h2><p className="text-slate-500">비밀번호를 입력하세요.</p></div>
            <form onSubmit={handleTeacherLogin} className="space-y-6">
              <div className="space-y-2 text-center">
                <label className="text-sm font-bold text-slate-700 ml-1">비밀번호</label>
                <input type="password" value={teacherPassword} onChange={(e) => setTeacherPassword(e.target.value)} placeholder="비밀번호 입력" className="w-full p-4 border-2 border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-lg font-medium text-center" autoFocus />
              </div>
              {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2 justify-center"><AlertCircle size={16}/> {errorMsg}</div>}
              <button type="submit" className="w-full text-white p-5 rounded-2xl font-extrabold text-lg transition-all transform hover:-translate-y-1 shadow-lg bg-slate-800 hover:bg-slate-900 shadow-slate-200">대시보드 접속</button>
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
                <p className="text-slate-500 font-medium text-center">총 {studentList.length}명의 시트가 있습니다.</p>
              </div>
              <div className="flex flex-wrap gap-3 mt-4 md:mt-0 justify-center">
                <button onClick={createNewStudentSheet} className="text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg"><UserPlus className="w-5 h-5" /> 새 학생 추가</button>
                <button onClick={() => setShowGlobalKeyInput(!showGlobalKeyInput)} className="text-white bg-slate-800 hover:bg-slate-900 px-5 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg"><Settings className="w-5 h-5" /> AI 공용 키 설정</button>
                <button onClick={handleLogout} className="text-slate-500 hover:text-red-600 hover:bg-red-50 px-5 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 bg-slate-100"><LogOut className="w-5 h-5" /> 로그아웃</button>
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
                    <div onClick={() => { setCurrentDocId(student.id); setView('PLANNER'); setRole('teacher'); }} className="cursor-pointer text-center w-full">
                      <span className="text-xl font-extrabold text-slate-800 block mb-1">{student.studentName || '이름 없음'}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{student.id.substring(0, 13)}...</span>
                    </div>
                    <button onClick={(e) => handleDeleteStudent(e, student.id)} className="text-slate-300 hover:text-red-500 p-2"><Trash2 size={18} /></button>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => copyStudentLink(student.id)} className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${copyFeedback === student.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{copyFeedback === student.id ? <><Check size={14}/> 복사됨</> : <><LinkIcon size={14}/> 링크 복사</>}</button>
                    <button onClick={() => { setCurrentDocId(student.id); setView('PLANNER'); setRole('teacher'); }} className="px-4 py-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"><ChevronRight size={18}/></button>
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
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-extrabold transition-all duration-300 ${activeTab === tab ? "bg-white text-indigo-700 shadow-md scale-[1.02]" : "text-slate-400 hover:text-slate-600"}`}>{tab === 'WEEKLY' ? '주간' : tab === 'MONTHLY' ? '월간' : '연간'}</button>
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

          <main className="max-w-[98vw] mx-auto p-4 md:p-6 pb-24 h-full relative text-center">
            {activeTab === 'WEEKLY' && (
              <div className="animate-fade-in h-full flex flex-col text-center">
                <div className="space-y-4 flex-1 flex flex-col">
                  <div className="p-3 md:p-4 rounded-3xl shadow-sm border border-slate-200 bg-white flex flex-col h-[calc(100vh-140px)] min-h-[500px]">
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-2 flex-shrink-0">
                      <div className="flex items-center gap-4">
                        {dDay ? (
                          <div className="flex items-center gap-3 px-5 py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-2xl shadow-md text-sm text-center">
                            <Calendar size={16} />
                            <span className="font-bold">{dDay.title} ({calculateDDay(dDay.date)})</span>
                            <button onClick={() => setDDay(null)} className="hover:text-red-200 p-1"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 p-1.5 rounded-2xl border border-slate-200 bg-slate-50 shadow-inner">
                            <input type="text" placeholder="D-day 제목" className="w-32 p-2.5 text-sm rounded-xl outline-none font-medium bg-white border border-slate-100 focus:border-indigo-500 text-center" value={dDayInput.title} onChange={(e) => setDDayInput({ ...dDayInput, title: e.target.value })}/>
                            <input type="date" className="w-36 p-2.5 text-sm rounded-xl outline-none bg-white border border-slate-100 focus:border-indigo-500 text-center" value={dDayInput.date} onChange={(e) => setDDayInput({ ...dDayInput, date: e.target.value })}/>
                            <button onClick={() => { if (dDayInput.title) { setDDay(dDayInput); setDDayInput({ title: '', date: '' }); } }} className="px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm bg-slate-800 hover:bg-slate-900 text-white">설정</button>
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 text-sm ml-auto">
                        <button onClick={() => setShowColorModal(!showColorModal)} className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold transition-all shadow-sm border ${showColorModal ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}><Palette className="w-4 h-4" /> 색상</button>
                        {showColorModal && (
                          <div className="absolute right-0 top-14 w-80 p-5 rounded-2xl shadow-2xl border border-slate-200 bg-white z-30 animate-fade-in text-center">
                            <h4 className="font-extrabold mb-4 text-base flex items-center justify-center gap-2"><Palette className="text-indigo-500 w-5 h-5"/> 키워드 색상 지정</h4>
                            <div className="flex gap-2 mb-4">
                              <input type="text" placeholder="단어" value={newColorRule.keyword} onChange={(e) => setNewColorRule({ ...newColorRule, keyword: e.target.value })} className="flex-1 p-3 text-sm rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 border border-slate-200 bg-slate-50 text-center" />
                              <div className="relative w-12 h-12 rounded-xl overflow-hidden shadow-inner border border-slate-200 flex-shrink-0 cursor-pointer"><input type="color" value={newColorRule.color} onChange={(e) => setNewColorRule({ ...newColorRule, color: e.target.value })} className="absolute top-[-10px] left-[-10px] w-[200%] h-[200%] cursor-pointer border-0 p-0" /></div>
                              <button onClick={addColorRule} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 shadow-md">추가</button>
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                              {colorRules.map((rule) => (
                                <div key={rule.id} className="flex items-center justify-between text-sm p-3 rounded-xl border border-slate-100 bg-slate-50 group hover:border-indigo-200 transition-colors text-center">
                                  <div className="flex items-center gap-3 font-bold"><div className="w-5 h-5 rounded-full shadow-inner border border-black/10" style={{ backgroundColor: rule.color }}></div><span>{rule.keyword}</span></div>
                                  <button onClick={() => removeColorRule(rule.id)} className="p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 hover:bg-red-50"><X className="w-4 h-4" /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="h-8 w-px mx-1 bg-slate-200 text-center"></div>
                        {selection.day && selection.startId !== selection.endId ? <button onClick={mergeCells} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-indigo-700 font-extrabold"><Merge className="w-4 h-4" /> 병합</button> : <div className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium border border-dashed border-slate-200 text-slate-400 bg-slate-50 select-none"><MousePointer2 className="w-4 h-4" /> 드래그</div>}
                        <button onClick={unmergeCells} className="flex items-center gap-2 px-3 py-2 rounded-lg font-bold shadow-sm transition-colors border border-slate-200 text-slate-700 hover:bg-slate-50"><Split className="w-4 h-4" /> 분할</button>
                        <button onClick={() => setShowResetConfirm(true)} className="flex items-center gap-2 px-3 py-2 rounded-lg font-bold transition-colors ml-1 bg-red-50 text-red-600 hover:bg-red-100"><Trash2 className="w-4 h-4" /> 일정 초기화</button>
                      </div>
                    </div>
                    <div className="flex-1 relative select-none rounded-xl border-2 border-slate-200 bg-white shadow-inner overflow-x-auto overflow-y-hidden text-center" onMouseLeave={handleMouseUp}>
                      <table className="w-full h-full text-center text-sm border-collapse min-w-[800px] table-fixed text-center">
                        <thead className="z-20 shadow-sm bg-slate-50 border-b-2 border-slate-200 text-slate-800 text-center">
                          <tr>
                            <th className="py-2 w-16 border-r border-slate-200 uppercase tracking-widest text-[10px] font-black text-slate-400 text-center"><Clock className="w-3 h-3 mx-auto mb-0.5 opacity-50"/> Time</th>
                            {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d, i) => {
                              const labels = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
                              let textColor = (d === 'sat') ? 'text-blue-500' : (d === 'sun') ? 'text-red-500' : '';
                              return <th key={d} className={`py-2 font-black text-xs border-r border-slate-200 ${textColor} text-center`}>{labels[i]}</th>;
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {timetable.map((row) => (
                            <tr key={row.id} className="group text-center">
                              <td className="p-0 w-16 border border-slate-200 align-middle bg-white transition-colors select-none text-center">
                                <div className="flex flex-col items-center justify-center h-full text-[10px] font-medium text-slate-400 text-center"><span>{row.time}</span></div>
                              </td>
                              {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => {
                                if (row[`${day}_hidden`]) return null;
                                const isSelected = selection.day === day && row.id >= Math.min(selection.startId, selection.endId) && row.id <= Math.max(selection.startId, selection.endId);
                                const keywordColor = getCellColor(row[day]);
                                const bgColor = isSelected ? 'rgba(224, 231, 255, 0.8)' : keywordColor ? keywordColor : 'transparent';
                                return (
                                  <td key={day} className={`p-0 relative align-middle border border-slate-200 cursor-text transition-all duration-200 ${isSelected ? 'ring-2 ring-indigo-500 ring-inset z-10' : ''} hover:bg-indigo-50/30 text-center`} style={{ backgroundColor: bgColor }} rowSpan={row[`${day}_span`] || 1} onMouseDown={() => handleMouseDown(day, row.id)} onMouseEnter={() => handleMouseEnter(day, row.id)}>
                                    <div 
                                      className="w-full h-full flex items-center justify-center p-0.5 text-center cursor-text"
                                      onClick={(e) => {
                                        const txt = e.currentTarget.querySelector('textarea');
                                        if (txt) txt.focus();
                                      }}
                                    >
                                      <textarea 
                                        value={row[day]} 
                                        onChange={(e) => handleTimetableChange(row.id, day, e.target.value)} 
                                        onInput={autoResize} 
                                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }} 
                                        rows={1} 
                                        className="w-full text-center bg-transparent resize-none outline-none overflow-hidden font-bold leading-tight focus:ring-1 focus:ring-indigo-400/50 text-center" 
                                      />
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'MONTHLY' && (
              <div className="animate-fade-in flex flex-col gap-6 overflow-x-auto text-center">
                <div className="p-6 rounded-3xl border border-slate-200 bg-white shadow-sm min-w-[2200px] text-center">
                  <div className="flex items-center justify-between mb-6 px-2 text-center">
                    <div className="flex gap-2 text-center">
                      <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-center"><ChevronLeft size={20}/></button>
                      <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors text-center"><ChevronRight size={20}/></button>
                    </div>
                    <div className="flex gap-3 text-center">
                      <button onClick={() => {
                        const name = prompt("추가할 과목명을 입력하세요");
                        if(name) addSubjectRow(name.trim());
                      }} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-extrabold text-sm hover:bg-indigo-700 shadow-md transition-all text-center"><Plus size={18}/> 과목 추가</button>
                      <button onClick={() => setShowResetConfirm(true)} className="flex items-center gap-2 px-5 py-2.5 bg-red-50 text-red-600 border border-red-100 rounded-xl font-extrabold text-sm hover:bg-red-100 transition-all text-center"><Trash2 size={18}/> 일정 초기화</button>
                    </div>
                  </div>

                  {[0, 1].map((blockIdx) => {
                    const allDates = getSchedulerDates();
                    const chunkSize = 14;
                    const chunk = allDates.slice(blockIdx * chunkSize, (blockIdx + 1) * chunkSize);
                    return (
                      <table key={blockIdx} className="w-full border-collapse mb-10 text-[11px] table-fixed text-center">
                        <thead>
                          <tr className="bg-slate-50 text-center">
                            <th className="border border-slate-300 w-32 py-2 text-center font-black" rowSpan={2}>과목</th>
                            {chunk.map((d, i) => {
                              let textColor = d.isSat ? 'text-blue-500' : d.isWeekend ? 'text-red-500' : 'text-slate-600';
                              return <th key={i} className={`border border-slate-300 py-1 font-bold text-center ${textColor}`}>{d.day}</th>;
                            })}
                          </tr>
                          <tr className="bg-slate-50 text-center">
                            {chunk.map((d, i) => {
                               let textColor = d.isSat ? 'text-blue-500' : d.isWeekend ? 'text-red-500' : 'text-slate-600';
                               return <th key={i} className={`border border-slate-300 py-1 font-bold text-center ${textColor}`}>{d.label}</th>;
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-white h-8 text-center">
                            <td className="border border-slate-300 text-center font-black bg-slate-50 text-black text-center">비고</td>
                            {chunk.map((d) => (
                              <td key={`note-${d.full}`} className="border border-slate-300 p-0 align-middle h-8 text-center">
                                <textarea 
                                  value={termScheduler.topNotes[d.full] || ''} 
                                  onChange={(e) => handleTopNoteChange(d.full, e.target.value)} 
                                  rows={1}
                                  className="w-full h-full bg-transparent resize-none outline-none px-2 py-1 text-center font-bold overflow-hidden leading-tight text-center" 
                                />
                              </td>
                            ))}
                          </tr>
                          {termScheduler.subjects.map((sub) => (
                            <tr key={sub} className="text-center">
                              <td className="border border-slate-300 px-2 py-1 font-black text-center relative group bg-slate-50/50 text-center">
                                {sub}
                                <button onClick={() => removeSubjectRow(sub)} className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity text-center"><X size={12}/></button>
                              </td>
                              {chunk.map((d) => {
                                const val = termScheduler.cells[`${sub}-${d.full}`] || '';
                                const bg = getCellColor(val);
                                const lines = val.split('\n').filter(l => l.trim() !== '');
                                return (
                                  <td key={`${sub}-${d.full}`} className="border border-slate-300 p-0 align-middle transition-colors relative min-h-[60px] text-center" style={{ backgroundColor: bg }}>
                                    <div className="relative h-full w-full flex flex-col justify-center items-center py-2 text-center">
                                      <textarea 
                                        value={val} 
                                        onChange={(e) => handleTermCellChange(sub, d.full, e.target.value)} 
                                        onInput={autoResize} 
                                        onFocus={() => setEditingCell(`${sub}-${d.full}`)}
                                        onBlur={() => setEditingCell(null)}
                                        className={`absolute inset-0 w-full h-full bg-transparent resize-none outline-none p-2 text-center font-bold z-20 transition-colors
                                          ${editingCell === `${sub}-${d.full}` ? 'text-slate-800 bg-white/90' : 'text-transparent caret-transparent'} text-center`} 
                                      />
                                      {editingCell !== `${sub}-${d.full}` && lines.length > 0 && (
                                        <div className="relative z-10 flex flex-col gap-1.5 w-full px-1.5 text-center">
                                          {lines.map((line, idx) => (
                                            <div key={idx} className="flex items-center justify-center gap-2 bg-white/70 rounded-lg px-2.5 py-1.5 shadow-sm border border-black/5 mx-1 text-center">
                                              <span className="text-[9px] font-black text-slate-800 leading-tight text-center flex-1">{line}</span>
                                              <input 
                                                type="checkbox" 
                                                checked={termScheduler.checks[`${sub}-${d.full}-${idx}`] || false} 
                                                onChange={(e) => { e.stopPropagation(); handleTermCheckToggle(sub, d.full, idx); }} 
                                                className="w-4 h-4 cursor-pointer accent-indigo-600 flex-shrink-0 text-center" 
                                              />
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })}

                  {termScheduler.subjects.length > 0 && (
                    <div className="text-left flex justify-start w-full text-center">
                    <table className="w-full border-collapse text-[11px] max-w-7xl shadow-md rounded-2xl overflow-hidden border border-slate-200 text-left text-center">
                      <thead>
                        <tr className="bg-slate-100 font-black text-slate-800 text-center">
                          <th className="border border-slate-200 w-32 py-4 text-center">과목</th>
                          <th className="border border-slate-200 w-64 text-center">교재</th>
                          <th className="border border-slate-200 w-64 text-center">시작</th>
                          <th className="border border-slate-200 w-64 text-center">목표</th>
                          <th className="border border-slate-200 w-80 text-center">달성도</th>
                        </tr>
                      </thead>
                      <tbody>
                        {termScheduler.subjects.map((sub) => {
                          const allDates = getSchedulerDates();
                          let firstData = "-";
                          let lastData = "-";
                          let totalItems = 0;
                          let checkedItems = 0;
                          for (let i = 0; i < allDates.length; i++) {
                            const val = termScheduler.cells[`${sub}-${allDates[i].full}`] || "";
                            if (val.trim() !== "") {
                              const lines = val.split('\n').filter(l => l.trim() !== '');
                              if (firstData === "-") firstData = lines[0];
                              lastData = lines[lines.length - 1];
                              totalItems += lines.length;
                              lines.forEach((_, idx) => {
                                if (termScheduler.checks[`${sub}-${allDates[i].full}-${idx}`]) checkedItems++;
                              });
                            }
                          }
                          const percent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;
                          return (
                            <tr key={`status-${sub}`} className="bg-white hover:bg-slate-50 transition-colors text-center">
                              <td className="border border-slate-200 text-center font-black py-3 bg-slate-50/50 text-center">{sub}</td>
                              <td className="border border-slate-200 p-0 text-center"><input value={termScheduler.textbooks[sub] || ''} onChange={(e) => handleTermTextbookChange(sub, e.target.value)} className="w-full h-full p-2 outline-none font-black text-center bg-transparent text-center" placeholder="학습 교재" /></td>
                              <td className="border border-slate-200 bg-slate-50/5 text-center font-black px-4 py-2 truncate max-w-[200px] text-indigo-700 text-center">{firstData}</td>
                              <td className="border border-slate-200 bg-slate-50/5 text-center font-black px-4 py-2 truncate max-w-[200px] text-rose-700 text-center">{lastData}</td>
                              <td className="border border-slate-200 p-4 text-center">
                                <div className="relative w-full h-8 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200 text-center">
                                  <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-green-300 to-green-200 transition-all duration-700 ease-out" style={{ width: `${percent}%` }} />
                                  <span className="absolute left-4 inset-y-0 flex items-center text-[10px] font-black text-slate-700 drop-shadow-sm text-center">{percent}%</span>
                                </div>
                              </td>
                            </tr>
                          );
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
                    <h4 className="font-black text-indigo-600 mb-3 text-center">{idx + 1}월 계획</h4>
                    <textarea value={plan} style={{ backgroundColor: getCellColor(plan) }} onChange={(e) => handleYearlyChange(idx, e.target.value)} onInput={autoResize} placeholder={`${idx + 1}월 마일스톤`} className="w-full p-4 rounded-xl border border-slate-100 outline-none focus:border-indigo-500 transition-all text-sm font-bold resize-none text-center overflow-hidden text-center" />
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
                <div className="p-6 text-center text-center">
                  {aiFeedback && <div className="mb-6 p-4 rounded-2xl text-center font-bold animate-pulse bg-emerald-50 text-emerald-600 border border-emerald-100 text-xs leading-relaxed text-center">{aiFeedback}</div>}
                  <form onSubmit={handleAiSubmit} className="relative mt-2 text-center text-center">
                    <input type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="학습 명령을 입력하세요..." className="w-full pl-5 pr-14 py-4 rounded-2xl border-2 border-slate-200 focus:outline-none focus:border-indigo-500 transition-all font-bold text-slate-800 text-center text-center" disabled={isAiProcessing} />
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
          <div className="w-full max-w-xs rounded-3xl shadow-2xl p-8 text-center bg-white text-center text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 text-center text-center text-center text-center"><AlertCircle size={32} /></div>
            <h3 className="font-black text-xl mb-2 text-center text-center text-center text-center">데이터 초기화</h3>
            <p className="text-sm mb-8 text-slate-500 font-bold text-center text-center text-center text-center">현재 탭의 데이터를 모두 지울까요?</p>
            <div className="flex gap-3 text-center text-center text-center">
              <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600 text-center text-center text-center text-center">취소</button>
              <button onClick={executeResetTimetable} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black shadow-lg text-center text-center text-center text-center">확인</button>
            </div>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-center" onClick={() => setShowLogoutConfirm(false)}>
          <div className="w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center bg-white text-center text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-4 text-center text-center text-center text-center text-center"><LogOut size={32} /></div>
            <h3 className="font-black text-xl mb-2 text-center text-center text-center text-center text-center text-center">로그아웃</h3>
            <p className="text-sm mb-8 text-slate-500 font-bold text-center text-center text-center text-center text-center">정말 로그아웃 하시겠습니까?</p>
            <div className="flex gap-3 text-center text-center text-center text-center text-center">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600 text-center text-center text-center text-center text-center">취소</button>
              <button onClick={executeLogout} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black shadow-lg shadow-indigo-100 text-center text-center text-center text-center text-center text-center text-center">로그아웃</button>
            </div>
          </div>
        </div>
      )}

      {studentToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-center" onClick={() => setStudentToDelete(null)}>
          <div className="w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center bg-white text-center text-center text-center text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4 text-center text-center text-center text-center text-center text-center text-center text-center text-center"><Trash2 size={32} /></div>
            <h3 className="font-black text-xl mb-2 text-center text-center text-center text-center text-center text-center text-center text-center text-center">데이터 삭제</h3>
            <p className="text-sm mb-8 text-slate-500 font-bold text-center text-center text-center text-center text-center text-center text-center text-center text-center">이 시트를 삭제하시겠습니까?</p>
            <div className="flex gap-3 text-center text-center text-center text-center text-center text-center text-center text-center">
              <button onClick={() => setStudentToDelete(null)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600 text-center text-center text-center text-center text-center text-center text-center text-center">취소</button>
              <button onClick={executeDeleteStudent} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-black shadow-lg text-center text-center text-center text-center text-center text-center text-center text-center text-center">삭제</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.2); border-radius: 10px; } .animate-fade-in { animation: fadeIn 0.3s forwards; } @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }` }} />
    </div>
  );
}
