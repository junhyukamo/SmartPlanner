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
  HelpCircle,
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
  // --------------------------------------------------------------------------------
  // 1. 앱 전역 상태 관리
  // --------------------------------------------------------------------------------
  const [user, setUser] = useState(null);
  const [view, setView] = useState('LOADING');
  const [role, setRole] = useState('');
  const [studentName, setStudentName] = useState('');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [criticalError, setCriticalError] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(null);

  // --------------------------------------------------------------------------------
  // 2. 공용 API 키 및 설정 상태
  // --------------------------------------------------------------------------------
  const [globalAiKey, setGlobalAiKey] = useState('');
  const [showGlobalKeyInput, setShowGlobalKeyInput] = useState(false);

  // --------------------------------------------------------------------------------
  // 3. 플래너 데이터 및 탭 상태
  // --------------------------------------------------------------------------------
  const [currentDocId, setCurrentDocId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('WEEKLY');

  // --------------------------------------------------------------------------------
  // 4. UI 및 모달 상태 관리
  // --------------------------------------------------------------------------------
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showColorModal, setShowColorModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false); 
  const [studentToDelete, setStudentToDelete] = useState(null); 
  const [darkMode, setDarkMode] = useState(false);

  // --------------------------------------------------------------------------------
  // 5. 시간표 기본 템플릿 생성 함수
  // --------------------------------------------------------------------------------
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

  // --------------------------------------------------------------------------------
  // 6. 플래너 핵심 데이터 State
  // --------------------------------------------------------------------------------
  const [timetable, setTimetable] = useState(generateTimeSlots());
  const [todos, setTodos] = useState([]);
  const [dDay, setDDay] = useState(null);
  const [dDayInput, setDDayInput] = useState({ title: '', date: '' });
  const [memo, setMemo] = useState('');
  const [yearlyPlan, setYearlyPlan] = useState(Array(12).fill(''));
  const [monthlyMemo, setMonthlyMemo] = useState('');
  const [monthlyEvents, setMonthlyEvents] = useState({});
  const [currentDate, setCurrentDate] = useState(new Date());
  const [colorRules, setColorRules] = useState([]);
  const [newColorRule, setNewColorRule] = useState({ keyword: '', color: '#bfdbfe' });
  const [studentList, setStudentList] = useState([]);

  const [isDragging, setIsDragging] = useState(false);
  const [selection, setSelection] = useState({ day: null, startId: null, endId: null });

  // --------------------------------------------------------------------------------
  // 7. AI 조교 State
  // --------------------------------------------------------------------------------
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');

  // --------------------------------------------------------------------------------
  // 8. 파이어베이스 인증 및 URL 고유 주소 감지 로직
  // --------------------------------------------------------------------------------
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
          return; 
        }

        const globalRef = doc(db, 'settings', 'global');
        onSnapshot(globalRef, (snap) => {
          if (snap.exists()) {
            setGlobalAiKey(snap.data().aiKey || '');
          }
        });

      } catch (error) {
        console.error("로그인 실패:", error);
        setCriticalError('AUTH_CONFIG_MISSING');
      }

      const savedRole = localStorage.getItem('planner_role');
      const savedName = localStorage.getItem('planner_name');

      if (savedRole === 'student' && savedName) {
        setRole('student');
        setStudentName(savedName);
        setCurrentDocId(savedName);
        setView('PLANNER');
      } else if (savedRole === 'teacher') {
        setRole('teacher');
        setView('TEACHER_DASHBOARD');
      } else {
        setView('LANDING');
      }
    };
    initAuth();
    onAuthStateChanged(auth, setUser);
  }, []);

  // --------------------------------------------------------------------------------
  // 9. 플래너 데이터 실시간 동기화 (포인트 1 수정: 이름 보존을 위해 role 조건 제거)
  // --------------------------------------------------------------------------------
  useEffect(() => {
    if (!user || !currentDocId || (view !== 'PLANNER' && view !== 'TEACHER_DASHBOARD')) return;
    setLoading(true);
    const docRef = doc(db, 'planners', currentDocId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      try {
        if (docSnap.metadata?.hasPendingWrites) return;
        if (docSnap.exists()) {
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
          if (data.monthlyEvents) setMonthlyEvents(data.monthlyEvents);
          if (data.colorRules) setColorRules(data.colorRules);
          
          // [포인트 1 수정] 선생님이 보더라도 학생의 실제 이름을 상태에 동기화하여 UUID로 덮어쓰지 않게 함
          if (data.studentName) {
            setStudentName(data.studentName);
          }
        }
      } catch (e) { console.error("데이터 로드 에러:", e); } finally { setLoading(false); }
    });
    return () => unsubscribe();
  }, [user, currentDocId, view]);

  // --------------------------------------------------------------------------------
  // 10. 플래너 데이터 자동 저장 (포인트 1 수정: studentName 저장 로직 강화)
  // --------------------------------------------------------------------------------
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return; }
    if (!user || !currentDocId || view !== 'PLANNER' || loading) return;
    const saveData = async () => {
      const docRef = doc(db, 'planners', currentDocId);
      
      // [포인트 1 수정] studentName이 비어있거나 UUID와 같으면 저장하지 않음 (이름 보존)
      const isActuallyName = studentName && studentName !== currentDocId;

      await setDoc(docRef, {
        timetable, todos, dDay, memo, yearlyPlan, monthlyMemo, monthlyEvents,
        lastUpdated: new Date().toISOString(),
        ...(isActuallyName && { studentName: studentName })
      }, { merge: true });
    };
    const timeoutId = setTimeout(saveData, 1000);
    return () => clearTimeout(timeoutId);
  }, [timetable, todos, dDay, memo, yearlyPlan, monthlyMemo, monthlyEvents, user, currentDocId, view, loading, studentName]);

  // --------------------------------------------------------------------------------
  // 11. 선생님 대시보드 로드
  // --------------------------------------------------------------------------------
  useEffect(() => {
    if (!user || view !== 'TEACHER_DASHBOARD') return;
    const q = collection(db, 'planners');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const students = [];
      snapshot.forEach((doc) => students.push({ id: doc.id, ...doc.data() }));
      students.sort((a, b) => a.id.localeCompare(b.id));
      setStudentList(students);
    });
    return () => unsubscribe();
  }, [user, view]);

  // --------------------------------------------------------------------------------
  // 12. 공용 API 키 업데이트
  // --------------------------------------------------------------------------------
  const saveGlobalAiKey = async () => {
    try {
      const globalRef = doc(db, 'settings', 'global');
      await setDoc(globalRef, { aiKey: globalAiKey }, { merge: true });
      setShowGlobalKeyInput(false);
      setAiFeedback('✅ 공용 API 키가 업데이트되었습니다.');
      setTimeout(() => setAiFeedback(''), 3000);
    } catch (e) { console.error(e); setAiFeedback('❌ 저장 실패'); }
  };

  // --------------------------------------------------------------------------------
  // 13. [핵심 기능] 새로운 학생 시트 생성 (관리자 전용)
  // --------------------------------------------------------------------------------
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
    } catch (e) {
      console.error(e);
      setAiFeedback('❌ 생성 실패');
    } finally {
      setLoading(false);
    }
  };

  const copyStudentLink = (sid) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?sid=${sid}`;
    const el = document.createElement('textarea');
    el.value = shareUrl;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    
    setCopyFeedback(sid);
    setTimeout(() => setCopyFeedback(null), 2000);
  };

  // --------------------------------------------------------------------------------
  // 14. 주간 셀 로직
  // --------------------------------------------------------------------------------
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
    setTimetable(newTimetable);
    setSelection({ day: null, startId: null, endId: null });
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
    setTimetable(newTimetable);
    setSelection({ day: null, startId: null, endId: null });
  };

  const executeResetTimetable = () => {
    setTimetable((prev) => prev.map((row) => {
      const newRow = { ...row };
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach((day) => {
        newRow[day] = ''; newRow[`${day}_span`] = 1; newRow[`${day}_hidden`] = false;
      });
      return newRow;
    }));
    setSelection({ day: null, startId: null, endId: null });
    setShowResetConfirm(false); 
  };

  // --------------------------------------------------------------------------------
  // 15. 색상 및 달력 헬퍼
  // --------------------------------------------------------------------------------
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

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const days = [];
    const lastDate = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= lastDate; i++) days.push(new Date(year, month, i));
    return days;
  };

  const handleMonthlyEventChange = (dateKey, value) => {
    setMonthlyEvents(prev => ({ ...prev, [dateKey]: value }));
  };

  // --------------------------------------------------------------------------------
  // 16. AI 호출
  // --------------------------------------------------------------------------------
  const callGeminiAPI = async (systemPrompt, userText = "") => {
    if (!globalAiKey) { setAiFeedback('⚠️ 공용 API 키가 등록되지 않았습니다 (관리자 문의).'); return null; }
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${globalAiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt + '\n' + userText }] }] }),
        }
      );
      const result = await response.json();
      if (result.error) throw new Error(result.error.message);
      return result.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (error) { setAiFeedback(`❌ AI 오류: ${error.message}`); return null; }
  };

  const handleAiSubmit = async (e) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setIsAiProcessing(true);
    setAiFeedback('AI 조교가 최적의 구성을 생각하고 있습니다...');

    const todayStr = new Date().toLocaleDateString('ko-KR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const curYear = currentDate.getFullYear();
    const curMonth = currentDate.getMonth() + 1;

    const systemPrompts = {
      WEEKLY: `당신은 주간 학습 플래너 전문가입니다. 오늘의 날짜는 ${todayStr}입니다. 
              사용자가 요청한 학습 목표를 08:00~24:00(30분 단위) 일정표에 분배하세요.
              출력은 반드시 다른 설명 없이 유효한 JSON 형식이어야 합니다.
              JSON 구조: { "type": "UPDATE_TIMETABLE", "updates": [{ "day": "mon|tue|wed|thu|fri|sat|sun", "startTime": "HH:MM", "endTime": "HH:MM", "content": "내용" }] }`,
      MONTHLY: `당신은 월간 학습 전략가입니다. 현재 달력의 연도는 ${curYear}년, 월은 ${curMonth}월입니다.
               사용자의 한 달 목표를 분석하여 달력의 특정 날짜들에 적절히 배분하세요.
               JSON 형식으로만 응답하세요.
               JSON 구조: { "type": "UPDATE_MONTHLY_CALENDAR", "memo": "한달 총평 메모", "events": [{ "date": "YYYY-MM-DD", "content": "해당 일의 학습 내용" }] }`,
      YEARLY: `당신은 연간 로드맵 전문가입니다. 사용자의 요청을 1월부터 12월까지의 학습 흐름으로 재구성하세요.
              출력은 반드시 다른 설명 없이 유효한 JSON 형식이어야 합니다.
              JSON 구조: { "type": "UPDATE_YEARLY", "plans": ["1월내용", "2월내용", ..., "12월내용"] } (반드시 12개 요소를 포함할 것)`
    };

    const text = await callGeminiAPI(systemPrompts[activeTab], `사용자 요청: "${aiPrompt}"`);

    if (text) {
      try {
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const aiResponse = JSON.parse(cleanJson);

        if (aiResponse.type === 'UPDATE_TIMETABLE' && activeTab === 'WEEKLY') {
          let newTimetable = [...timetable];
          aiResponse.updates.forEach((update) => {
            const { day, startTime, endTime, content } = update;
            const timeToIndex = (t) => {
              if (t === '24:00') return 32;
              const [h, m] = t.split(':').map(Number);
              return (h - 8) * 2 + (m === 30 ? 1 : 0);
            };
            const startIdx = timeToIndex(startTime);
            const endIdx = timeToIndex(endTime) - 1;
            if (startIdx >= 0 && startIdx <= 31 && endIdx >= startIdx && endIdx <= 31) {
              const spanCount = endIdx - startIdx + 1;
              newTimetable = newTimetable.map((row, idx) => {
                if (idx === startIdx) return { ...row, [`${day}_span`]: spanCount, [`${day}_hidden`]: false, [day]: content };
                else if (idx > startIdx && idx <= endIdx) return { ...row, [`${day}_span`] : 1, [`${day}_hidden`]: true, [day]: '' };
                return row;
              });
            }
          });
          setTimetable(newTimetable);
          setAiFeedback('✅ 주간 시간표 반영 완료!');
        } else if (aiResponse.type === 'UPDATE_MONTHLY_CALENDAR' && activeTab === 'MONTHLY') {
          if (aiResponse.memo) setMonthlyMemo(aiResponse.memo);
          if (Array.isArray(aiResponse.events)) {
            const newEvents = { ...monthlyEvents };
            aiResponse.events.forEach(ev => { newEvents[ev.date] = ev.content; });
            setMonthlyEvents(newEvents);
          }
          setAiFeedback('✅ 월간 달력 일정 반영 완료!');
        } else if (aiResponse.type === 'UPDATE_YEARLY' && activeTab === 'YEARLY') {
          setYearlyPlan(aiResponse.plans);
          setAiFeedback('✅ 연간 로드맵 반영 완료!');
        }
      } catch (e) { setAiFeedback('❌ 데이터 해석 실패.'); }
    }
    setAiPrompt(''); setIsAiProcessing(false);
    setTimeout(() => { if (!text) setShowAiModal(false); setAiFeedback(''); }, 3000);
  };

  // --------------------------------------------------------------------------------
  // 17. 이벤트 핸들러
  // --------------------------------------------------------------------------------
  const handleTeacherLogin = (e) => {
    e.preventDefault();
    if (teacherPassword === '551000') {
      localStorage.setItem('planner_role', 'teacher');
      setRole('teacher'); setView('TEACHER_DASHBOARD'); setTeacherPassword('');
    } else { setErrorMsg('비밀번호가 일치하지 않습니다.'); }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  const executeLogout = () => {
    localStorage.removeItem('planner_role'); localStorage.removeItem('planner_name');
    setView('LANDING'); setRole(''); setStudentName(''); setCurrentDocId(null); setShowLogoutConfirm(false);
    if (window.location.search.includes('sid=')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  };

  const handleTimetableChange = (id, day, value) => {
    setTimetable((prev) => prev.map((row) => row.id === id ? { ...row, [day]: value } : row));
  };
  const handleYearlyChange = (index, value) => {
    const newPlan = [...yearlyPlan]; newPlan[index] = value; setYearlyPlan(newPlan);
  };
  const handleDeleteStudent = (e, studentId) => { e.stopPropagation(); setStudentToDelete(studentId); };
  const executeDeleteStudent = async () => {
    if (!studentToDelete) return;
    try { await deleteDoc(doc(db, 'planners', studentToDelete)); setStudentToDelete(null); } catch (e) { console.error(e); }
  };

  // --------------------------------------------------------------------------------
  // 뷰 렌더링
  // --------------------------------------------------------------------------------
  if (view === 'LOADING') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
        <div className="text-slate-500 font-medium tracking-widest animate-pulse">로딩중...</div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      {view === 'LANDING' && (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 transform transition-all hover:scale-[1.01]">
            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-10 text-center relative overflow-hidden">
              <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner"><BookOpen className="w-10 h-10 text-white" /></div>
              <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">스마트 학습 플래너</h1>
              <p className="text-indigo-100 font-medium">관리자 전용 & 고유 링크 시스템</p>
            </div>
            <div className="p-8 space-y-4 bg-white text-center">
              <p className="text-slate-500 text-sm mb-4">선생님이 전달해준 고유 링크로 접속해주세요.</p>
              <button onClick={() => setView('TEACHER_LOGIN')} className="w-full p-5 rounded-2xl border-2 border-slate-100 hover:border-slate-500 hover:bg-slate-50 flex items-center gap-5 group transition-all shadow-sm">
                <div className="p-4 bg-slate-100 text-slate-600 rounded-xl group-hover:bg-slate-700 group-hover:text-white transition-colors"><Users size={24} /></div>
                <div className="text-left"><div className="font-extrabold text-lg text-slate-800">선생님 관리자 로그인</div><div className="text-sm text-slate-500 mt-1">학생 시트 생성 및 공유 링크 관리</div></div>
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'TEACHER_LOGIN' && (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100">
            <button onClick={() => setView('LANDING')} className="text-slate-400 mb-8 flex items-center gap-2 text-sm font-medium hover:text-slate-700 transition-colors bg-slate-50 px-4 py-2 rounded-lg w-fit"><ChevronLeft className="w-4 h-4" /> 뒤로가기</button>
            <div className="mb-8"><h2 className="text-3xl font-extrabold text-slate-800 mb-2">관리자 로그인</h2><p className="text-slate-500">선생님 비밀번호를 입력해주세요.</p></div>
            <form onSubmit={handleTeacherLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-slate-700 ml-1">비밀번호</label>
                <input type="password" value={teacherPassword} onChange={(e) => setTeacherPassword(e.target.value)} placeholder="비밀번호 입력" className="w-full p-4 border-2 border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-lg font-medium" autoFocus />
              </div>
              {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-2"><AlertCircle size={16}/> {errorMsg}</div>}
              <button type="submit" className="w-full text-white p-5 rounded-2xl font-extrabold text-lg transition-all transform hover:-translate-y-1 shadow-lg bg-slate-800 hover:bg-slate-900 shadow-slate-200">대시보드 접속</button>
            </form>
          </div>
        </div>
      )}

      {view === 'TEACHER_DASHBOARD' && (
        <div className="min-h-screen bg-slate-50 p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100">
              <div>
                <h1 className="text-3xl font-extrabold flex items-center gap-3 text-slate-800 mb-2"><Users className="text-indigo-600 w-8 h-8" /> 관리자 대시보드</h1>
                <p className="text-slate-500 font-medium">총 {studentList.length}명의 개별 플래너가 존재합니다.</p>
              </div>
              <div className="flex flex-wrap gap-3 mt-4 md:mt-0">
                <button onClick={createNewStudentSheet} className="text-white bg-indigo-600 hover:bg-indigo-700 px-5 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg"><UserPlus className="w-5 h-5" /> 새 학생 추가</button>
                <button onClick={() => setShowGlobalKeyInput(!showGlobalKeyInput)} className="text-white bg-slate-800 hover:bg-slate-900 px-5 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 shadow-lg"><Settings className="w-5 h-5" /> AI 공용 키 설정</button>
                <button onClick={handleLogout} className="text-slate-500 hover:text-red-600 hover:bg-red-50 px-5 py-3 rounded-xl font-bold transition-colors flex items-center gap-2 bg-slate-100"><LogOut className="w-5 h-5" /> 로그아웃</button>
              </div>
            </header>

            {aiFeedback && <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-2xl font-bold text-center animate-fade-in">{aiFeedback}</div>}

            {showGlobalKeyInput && (
              <div className="mb-10 p-8 bg-indigo-50 rounded-3xl border-2 border-indigo-100 animate-fade-in shadow-inner">
                <h3 className="text-lg font-black text-indigo-900 mb-4 flex items-center gap-2"><Key className="w-5 h-5"/> AI 공용 API 키 설정</h3>
                <div className="flex flex-col md:flex-row gap-4">
                  <input type="password" value={globalAiKey} onChange={(e) => setGlobalAiKey(e.target.value)} placeholder="Gemini API Key" className="flex-1 p-4 rounded-2xl border-2 border-indigo-200 outline-none focus:border-indigo-500 text-lg font-mono" />
                  <button onClick={saveGlobalAiKey} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-extrabold text-lg shadow-lg">저장</button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {studentList.map((student) => (
                <div key={student.id} className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:border-indigo-500 transition-all flex flex-col justify-between h-48 group">
                  <div className="flex justify-between items-start">
                    <div onClick={() => { setCurrentDocId(student.id); setView('PLANNER'); setRole('teacher'); }} className="cursor-pointer">
                      <span className="text-xl font-extrabold text-slate-800 block mb-1">{student.studentName || '이름 없음'}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{student.id.substring(0, 13)}...</span>
                    </div>
                    <button onClick={(e) => handleDeleteStudent(e, student.id)} className="text-slate-300 hover:text-red-500 p-2"><Trash2 size={18} /></button>
                  </div>
                  
                  <div className="flex gap-2">
                    <button 
                      onClick={() => copyStudentLink(student.id)}
                      className={`flex-1 py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${copyFeedback === student.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {copyFeedback === student.id ? <><Check size={14}/> 복사됨</> : <><LinkIcon size={14}/> 링크 복사</>}
                    </button>
                    <button 
                      onClick={() => { setCurrentDocId(student.id); setView('PLANNER'); setRole('teacher'); }}
                      className="px-4 py-3 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all"
                    >
                      <ChevronRight size={18}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {view === 'PLANNER' && (
        <>
          <header className={`px-4 py-3 shadow-sm sticky top-0 z-30 transition-colors duration-300 border-b ${darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white/90 border-slate-200'} backdrop-blur-md`}>
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
                <div className="flex items-center gap-3">
                  {role === 'teacher' && <button onClick={() => setView('TEACHER_DASHBOARD')} className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-slate-700 bg-slate-800' : 'hover:bg-slate-100 bg-white border border-slate-200'}`}><ChevronLeft className="w-5 h-5" /></button>}
                  <div className={`p-2.5 rounded-xl shadow-inner ${role === 'teacher' ? 'bg-gradient-to-br from-slate-600 to-slate-800' : 'bg-gradient-to-br from-indigo-500 to-indigo-700'}`}><BookOpen className="text-white w-5 h-5" /></div>
                  <div className="font-extrabold text-xl tracking-tight">{studentName} 플래너</div>
                </div>
                <div className="md:hidden flex gap-2"><button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-200'}`}>{darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-slate-500" />}</button></div>
              </div>
              <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                <div className={`flex p-1.5 rounded-xl shadow-inner ${darkMode ? 'bg-slate-800' : 'bg-slate-100'} flex-1 md:flex-none justify-center`}>
                  {['WEEKLY', 'MONTHLY', 'YEARLY'].map((tab) => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 md:flex-none px-6 py-2 rounded-lg text-sm font-extrabold transition-all duration-300 ${activeTab === tab ? darkMode ? 'bg-indigo-600 text-white shadow-lg scale-[1.02]' : 'bg-white text-indigo-700 shadow-md scale-[1.02]' : darkMode ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-200/50'}`}>{tab === 'WEEKLY' ? '주간' : tab === 'MONTHLY' ? '월간' : '연간'}</button>
                  ))}
                </div>
                <div className={`hidden md:flex items-center gap-2 border-l pl-3 ml-1 ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
                  <button onClick={() => setShowHelpModal(true)} className={`p-2.5 rounded-xl transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'}`}><HelpCircle className="w-5 h-5" /></button>
                  <button onClick={() => setDarkMode(!darkMode)} className={`p-2.5 rounded-xl transition-colors ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>{darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-slate-500" />}</button>
                  <button onClick={handleLogout} className={`p-2.5 rounded-xl transition-colors ${darkMode ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-500'}`}><LogOut className="w-5 h-5" /></button>
                </div>
              </div>
            </div>
          </header>

          <main className="max-w-7xl mx-auto p-4 md:p-6 pb-24 h-full relative">
            {activeTab === 'WEEKLY' && (
              <div className="animate-fade-in h-full flex flex-col">
                <div className="space-y-4 flex-1 flex flex-col">
                  <div className={`p-3 md:p-4 rounded-3xl shadow-sm border flex flex-col h-[calc(100vh-140px)] min-h-[500px] ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                    <div className="flex flex-wrap items-center justify-between gap-4 mb-2 flex-shrink-0">
                      <div className="flex items-center gap-4">
                        {dDay ? (
                          <div className="flex items-center gap-3 px-5 py-2.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-2xl shadow-md text-sm"><Calendar size={16} /><span className="font-bold">{dDay.title}</span><button onClick={() => setDDay(null)} className="hover:text-red-200 p-1"><X className="w-4 h-4" /></button></div>
                        ) : (
                          <div className={`flex items-center gap-2 p-1.5 rounded-2xl border shadow-inner ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-slate-50 border-slate-200'}`}><input type="text" placeholder="목표 (예: 중간고사)" className={`w-32 p-2.5 text-sm rounded-xl outline-none font-medium ${darkMode ? 'bg-slate-800 text-white placeholder-slate-500 focus:border-indigo-500 border-transparent' : 'bg-white border-slate-100 focus:border-indigo-500 border'}`} value={dDayInput.title} onChange={(e) => setDDayInput({ ...dDayInput, title: e.target.value })}/><input type="date" className={`w-36 p-2.5 text-sm rounded-xl outline-none ${darkMode ? 'bg-slate-800 text-white border-transparent focus:border-indigo-500' : 'bg-white border-slate-100 focus:border-indigo-500 border'}`} value={dDayInput.date} onChange={(e) => setDDayInput({ ...dDayInput, date: e.target.value })}/><button onClick={() => { if (dDayInput.title) { setDDay(dDayInput); setDDayInput({ title: '', date: '' }); } }} className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm ${darkMode ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-800 hover:bg-slate-900 text-white'}`}>설정</button></div>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 text-sm ml-auto">
                        <div className="relative">
                          <button onClick={() => setShowColorModal(!showColorModal)} className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold transition-all shadow-sm border ${showColorModal ? (darkMode ? 'bg-indigo-900/50 border-indigo-700 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700') : (darkMode ? 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50')}`}><Palette className="w-4 h-4" /> 색상</button>
                          {showColorModal && (
                            <div className={`absolute right-0 top-14 w-80 p-5 rounded-2xl shadow-2xl border z-30 animate-fade-in ${darkMode ? 'bg-slate-800 border-slate-600' : 'bg-white border-slate-200'}`}>
                              <h4 className="font-extrabold mb-4 text-base flex items-center gap-2"><Palette className="text-indigo-500 w-5 h-5"/> 키워드 색상 지정</h4>
                              <div className="flex gap-2 mb-4">
                                <input type="text" placeholder="단어 (예: 수학)" value={newColorRule.keyword} onChange={(e) => setNewColorRule({ ...newColorRule, keyword: e.target.value })} className={`flex-1 p-3 text-sm rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 border ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-200'}`} />
                                <div className={`relative w-12 h-12 rounded-xl overflow-hidden shadow-inner border flex-shrink-0 cursor-pointer ${darkMode ? 'border-slate-600' : 'border-slate-200'}`}><input type="color" value={newColorRule.color} onChange={(e) => setNewColorRule({ ...newColorRule, color: e.target.value })} className="absolute top-[-10px] left-[-10px] w-[200%] h-[200%] cursor-pointer border-0 p-0" /></div>
                                <button onClick={addColorRule} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-indigo-700 shadow-md">추가</button>
                              </div>
                              <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                {colorRules.map((rule) => (
                                  <div key={rule.id} className={`flex items-center justify-between text-sm p-3 rounded-xl border group transition-colors ${darkMode ? 'bg-slate-900/50 border-slate-700 hover:border-indigo-500' : 'bg-slate-50 border-slate-100 hover:border-indigo-200'}`}>
                                    <div className="flex items-center gap-3 font-bold"><div className="w-5 h-5 rounded-full shadow-inner border border-black/10" style={{ backgroundColor: rule.color }}></div><span>{rule.keyword}</span></div>
                                    <button onClick={() => removeColorRule(rule.id)} className={`p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100 ${darkMode ? 'text-slate-400 hover:text-red-400 hover:bg-red-900/30' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}><X className="w-4 h-4" /></button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className={`h-8 w-px mx-1 ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}></div>
                        {selection.day && selection.startId !== selection.endId ? <button onClick={mergeCells} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg shadow-md hover:bg-indigo-700 font-extrabold"><Merge className="w-4 h-4" /> 병합</button> : <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium border border-dashed select-none ${darkMode ? 'bg-slate-900/50 text-slate-500 border-slate-700' : 'bg-slate-50 text-slate-400 border-slate-200'}`}><MousePointer2 className="w-4 h-4" /> 드래그</div>}
                        <button onClick={unmergeCells} className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold shadow-sm transition-colors border ${darkMode ? 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}><Split className="w-4 h-4" /> 분할</button>
                        <button onClick={() => setShowResetConfirm(true)} className={`flex items-center gap-2 px-3 py-2 rounded-lg font-bold transition-colors ml-1 ${darkMode ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}><Trash2 className="w-4 h-4" /> 일정 초기화</button>
                      </div>
                    </div>

                    <div className={`flex-1 relative select-none rounded-xl border-2 shadow-inner overflow-x-auto overflow-y-hidden ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`} onMouseLeave={handleMouseUp}>
                      <table className="w-full h-full text-center text-sm border-collapse min-w-[800px] table-fixed">
                        <thead className={`z-20 shadow-sm ${darkMode ? 'bg-slate-800 border-b-2 border-slate-600 text-slate-200' : 'bg-slate-50 border-b-2 border-slate-200 text-slate-800'}`}>
                          <tr>
                            <th className={`py-2 w-16 border-r uppercase tracking-widest text-[10px] font-black ${darkMode ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400'}`}><Clock className="w-3 h-3 mx-auto mb-0.5 opacity-50"/> Time</th>
                            {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d, i) => {
                              const labels = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일'];
                              let textColor = '';
                              if (d === 'sat') textColor = darkMode ? 'text-blue-400' : 'text-blue-500';
                              else if (d === 'sun') textColor = darkMode ? 'text-red-400' : 'text-red-500';
                              return <th key={d} className={`py-2 font-black text-xs border-r ${darkMode ? 'border-slate-700' : 'border-slate-200'} ${textColor}`}>{labels[i]}</th>;
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {timetable.map((row) => (
                            <tr key={row.id} className="group">
                              <td className={`p-0 w-16 border align-middle transition-colors select-none ${darkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-white'}`}>
                                <div className={`flex flex-col items-center justify-center h-full text-[10px] font-medium ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}><span>{row.time}</span></div>
                              </td>
                              {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => {
                                if (row[`${day}_hidden`]) return null;
                                const span = row[`${day}_span`] || 1;
                                const isSelected = selection.day === day && row.id >= Math.min(selection.startId, selection.endId) && row.id <= Math.max(selection.startId, selection.endId);
                                const keywordColor = getCellColor(row[day]);
                                const bgColor = isSelected ? (darkMode ? 'rgba(99, 102, 241, 0.4)' : 'rgba(224, 231, 255, 0.8)') : keywordColor ? keywordColor : 'transparent';
                                const extraClass = isSelected ? 'ring-2 ring-indigo-500 ring-inset z-10 relative' : '';
                                return (
                                  <td key={day} className={`p-0 relative align-middle border cursor-text transition-all duration-200 ease-in-out ${extraClass} ${darkMode ? 'border-slate-700 hover:bg-slate-700/30' : 'border-slate-200 hover:bg-indigo-50/30'}`} style={{ backgroundColor: bgColor }} rowSpan={span} onMouseDown={() => handleMouseDown(day, row.id)} onMouseEnter={() => handleMouseEnter(day, row.id)} onClick={(e) => { const textarea = e.currentTarget.querySelector('textarea'); if (textarea) textarea.focus(); }}>
                                    <div className="w-full h-full flex flex-col items-center justify-center p-0.5 group">
                                      <textarea value={row[day]} onChange={(e) => handleTimetableChange(row.id, day, e.target.value)} onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }} placeholder={span > 1 ? '일정 입력' : ''} onKeyDown={(e) => { if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } }} rows={1} className={`w-full text-center bg-transparent resize-none outline-none overflow-hidden font-bold leading-tight focus:ring-1 focus:ring-indigo-400/50 transition-shadow ${darkMode ? 'text-slate-100 placeholder-slate-500' : 'text-slate-700 placeholder-slate-300'} ${keywordColor && !darkMode ? 'text-black mix-blend-color-burn' : ''}`} />
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
              <div className="animate-fade-in flex flex-col lg:flex-row gap-6 h-full">
                <div className={`flex-1 p-6 rounded-3xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="flex items-center justify-between mb-8">
                    <h3 className="text-2xl font-black flex items-center gap-3">
                      <Calendar className="text-indigo-600 w-7 h-7" />
                      {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
                    </h3>
                    <div className="flex gap-2">
                      <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))} className={`p-2 rounded-xl border transition-colors ${darkMode ? 'hover:bg-slate-700 border-slate-700' : 'hover:bg-slate-100 border-slate-200'}`}><ChevronLeft size={20}/></button>
                      <button onClick={() => setCurrentDate(new Date())} className={`px-4 py-2 rounded-xl border font-bold text-sm transition-colors ${darkMode ? 'hover:bg-slate-700 border-slate-700' : 'hover:bg-slate-100 border-slate-200'}`}>오늘</button>
                      <button onClick={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))} className={`p-2 rounded-xl border transition-colors ${darkMode ? 'hover:bg-slate-700 border-slate-700' : 'hover:bg-slate-100 border-slate-200'}`}><ChevronRight size={20}/></button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-7 gap-2">
                    {['일', '월', '화', '수', '목', '금', '토'].map((d, i) => (
                      <div key={d} className={`text-center py-2 text-xs font-black uppercase tracking-widest mb-2 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-slate-400'}`}>{d}</div>
                    ))}
                    {getDaysInMonth(currentDate).map((date, idx) => {
                      if (!date) return <div key={`empty-${idx}`} className="aspect-square"></div>;
                      const dateKey = date.toISOString().split('T')[0];
                      const dayOfWeek = date.getDay();
                      const isToday = new Date().toDateString() === date.toDateString();

                      return (
                        <div key={dateKey} className={`aspect-square rounded-2xl border-2 p-2 flex flex-col transition-all group relative ${isToday ? (darkMode ? 'bg-indigo-900/20 border-indigo-500' : 'bg-indigo-50 border-indigo-500') : (darkMode ? 'bg-slate-900/30 border-slate-700/50 hover:border-indigo-400' : 'bg-slate-50 border-slate-100 hover:border-indigo-300')}`}>
                          <div className={`text-sm font-black mb-1 ${dayOfWeek === 0 ? 'text-red-500' : dayOfWeek === 6 ? 'text-blue-500' : darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{date.getDate()}</div>
                          <textarea 
                            value={monthlyEvents[dateKey] || ''} 
                            onChange={(e) => handleMonthlyEventChange(dateKey, e.target.value)}
                            placeholder="..."
                            className={`flex-1 w-full bg-transparent resize-none text-[10px] font-bold leading-tight outline-none custom-scrollbar ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="w-full lg:w-80 flex flex-col gap-6">
                  <div className={`flex-1 p-6 rounded-3xl border shadow-sm ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                    <h4 className="font-black mb-4 flex items-center gap-2 text-indigo-600"><Sparkles size={18}/> 이달의 목표 총평</h4>
                    <textarea value={monthlyMemo} onChange={(e) => setMonthlyMemo(e.target.value)} placeholder="AI의 분석 또는 메모..." className={`w-full h-[calc(100%-40px)] p-4 rounded-2xl border-none outline-none font-bold text-sm leading-relaxed resize-none ${darkMode ? 'bg-slate-900/50 text-slate-300' : 'bg-slate-50 text-slate-700'}`} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'YEARLY' && (
              <div className="animate-fade-in grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {yearlyPlan.map((plan, idx) => (
                  <div key={idx} className={`p-6 rounded-3xl border shadow-sm transition-all hover:shadow-md ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                    <h4 className="font-black text-indigo-600 mb-3">{idx + 1}월 계획</h4>
                    <textarea value={plan} onChange={(e) => handleYearlyChange(idx, e.target.value)} placeholder={`${idx + 1}월의 계획`} className={`w-full h-32 p-4 rounded-xl border outline-none focus:border-indigo-500 transition-all text-sm font-bold resize-none ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-100 text-slate-700'}`} />
                  </div>
                ))}
              </div>
            )}
          </main>

          <div className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-50 flex flex-col items-end">
            {showAiModal ? (
              <div className={`w-[360px] md:w-[420px] rounded-3xl shadow-2xl overflow-hidden border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                <div className="bg-indigo-600 p-5 text-white flex justify-between items-center">
                  <h3 className="font-extrabold text-lg">AI 매직 플래너</h3>
                  <button onClick={() => setShowAiModal(false)}><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6">
                  {aiFeedback && <div className="mb-6 p-4 rounded-2xl text-center font-bold animate-pulse bg-emerald-50 text-emerald-600 border border-emerald-100">{aiFeedback}</div>}
                  <form onSubmit={handleAiSubmit} className="relative mt-2">
                    <input type="text" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="일정을 말해주세요..." className={`w-full pl-5 pr-14 py-4 rounded-2xl border-2 focus:outline-none focus:border-indigo-500 transition-all font-medium ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`} disabled={isAiProcessing} />
                    <button type="submit" disabled={isAiProcessing || !aiPrompt.trim()} className="absolute right-2 top-2 p-3.5 bg-indigo-600 text-white rounded-xl"><Send size={20} /></button>
                  </form>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAiModal(true)} className="flex items-center justify-center w-16 h-16 bg-indigo-600 text-white rounded-full shadow-2xl hover:scale-110 transition-all"><Sparkles className="w-7 h-7" /></button>
            )}
          </div>
        </>
      )}

      {/* 모달들 */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowHelpModal(false)}>
          <div className={`w-full max-w-md rounded-3xl shadow-2xl p-8 relative ${darkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-slate-800'}`} onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowHelpModal(false)} className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100"><X className="w-6 h-6" /></button>
            <h3 className="font-extrabold text-2xl mb-6">스마트 플래너 팁</h3>
            <div className="space-y-4 text-sm leading-relaxed">
              <p>1. <strong>고유 주소</strong>: 선생님이 주신 링크를 즐겨찾기 해두시면 매번 이름 입력 없이 바로 접속됩니다.</p>
              <p>2. <strong>AI 조교</strong>: 오른쪽 하단 반짝이는 버튼을 통해 학습 계획을 자동으로 세울 수 있습니다.</p>
            </div>
            <button onClick={() => setShowHelpModal(false)} className="mt-8 w-full py-4 rounded-xl font-extrabold bg-indigo-600 text-white">확인</button>
          </div>
        </div>
      )}

      {/* [포인트 2 수정] 초기화 확인창 크기 조절 (max-w-xs 적용) */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowResetConfirm(false)}>
          <div className={`w-full max-w-xs rounded-3xl shadow-2xl p-8 text-center ${darkMode ? 'bg-slate-800 text-white border border-slate-700' : 'bg-white text-slate-800'}`} onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4"><AlertCircle size={32} /></div>
            <h3 className="font-extrabold text-xl mb-2">일정 초기화</h3>
            <p className="text-sm mb-8">모든 데이터가 삭제됩니다.<br/>계속하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">취소</button>
              <button onClick={executeResetTimetable} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-extrabold">확인</button>
            </div>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)}>
          <div className={`w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center ${darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-800'}`} onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-4"><LogOut size={32} /></div>
            <h3 className="font-extrabold text-xl mb-2">로그아웃</h3>
            <p className="text-sm mb-8">정말 로그아웃 하시겠습니까?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">취소</button>
              <button onClick={executeLogout} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-extrabold">로그아웃</button>
            </div>
          </div>
        </div>
      )}

      {studentToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setStudentToDelete(null)}>
          <div className={`w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center ${darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-800'}`} onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4"><Trash2 size={32} /></div>
            <h3 className="font-extrabold text-xl mb-2">데이터 삭제</h3>
            <p className="text-sm mb-8">이 시트를 삭제하시겠습니까? (복구 불가능)</p>
            <div className="flex gap-3">
              <button onClick={() => setStudentToDelete(null)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">취소</button>
              <button onClick={executeDeleteStudent} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-extrabold">삭제</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `.custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(99, 102, 241, 0.2); border-radius: 10px; } .animate-fade-in { animation: fadeIn 0.3s forwards; } @keyframes fadeIn { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }` }} />
    </div>
  );
}
