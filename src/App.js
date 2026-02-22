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
  Settings
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  deleteDoc,
  setLogLevel
} from 'firebase/firestore';

// ==================================================================================
// [환경 설정] Firebase 초기화 (Vercel 및 로컬 환경 대응 안전 장치)
// ==================================================================================
const getFirebaseConfig = () => {
  try {
    // 캔버스 환경 변수가 있으면 우선 사용
    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
      return JSON.parse(__firebase_config);
    }
  } catch (e) {
    console.warn("Canvas config not found, using fallback.");
  }
  // Vercel 등 외부 배포용 실제 설정값
  return {
    apiKey: "AIzaSyDyaqBB-JmsCK4kyzU_uA-4CFmQTi45fAo",
    authDomain: "ai-term-scheduler.firebaseapp.com",
    projectId: "ai-term-scheduler",
    storageBucket: "ai-term-scheduler.firebasestorage.app",
    messagingSenderId: "281370426656",
    appId: "1:281370426656:web:94dfa3550edb3db756eb45",
    measurementId: "G-67V0K5F5KL"
  };
};

const firebaseConfig = getFirebaseConfig();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'ai-term-scheduler-prod';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setLogLevel('error');

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
  const [globalGeminiKey, setGlobalGeminiKey] = useState('');
  const [isAuthReady, setIsAuthReady] = useState(false);

  // --------------------------------------------------------------------------------
  // 2. 플래너 데이터 및 탭 상태
  // --------------------------------------------------------------------------------
  const [currentDocId, setCurrentDocId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('WEEKLY');

  // --------------------------------------------------------------------------------
  // 3. UI 및 모달 상태
  // --------------------------------------------------------------------------------
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showColorModal, setShowColorModal] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [darkMode, setDarkMode] = useState(false);

  // --------------------------------------------------------------------------------
  // 4. 시간표 템플릿 생성 (08:00 ~ 24:00)
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

  const [timetable, setTimetable] = useState(generateTimeSlots());
  const [yearlyPlan, setYearlyPlan] = useState(Array(12).fill(''));
  const [monthlyMemo, setMonthlyMemo] = useState('');
  const [colorRules, setColorRules] = useState([]);
  const [newColorRule, setNewColorRule] = useState({ keyword: '', color: '#bfdbfe' });
  const [dDay, setDDay] = useState(null);
  const [dDayInput, setDDayInput] = useState({ title: '', date: '' });
  const [studentList, setStudentList] = useState([]);

  const [isDragging, setIsDragging] = useState(false);
  const [selection, setSelection] = useState({ day: null, startId: null, endId: null });

  // --------------------------------------------------------------------------------
  // 6. AI 조교 State
  // --------------------------------------------------------------------------------
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [aiFeedback, setAiFeedback] = useState('');

  // --------------------------------------------------------------------------------
  // 7. 데이터 동기화 및 인증
  // --------------------------------------------------------------------------------
  useEffect(() => {
    const initApp = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
      }

      // 공용 API 키 로드 (항상 public 경로 사용)
      const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'global');
      try {
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          setGlobalGeminiKey(configSnap.data().geminiApiKey || '');
        }
      } catch (e) {}

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
      setIsAuthReady(true);
    };
    initApp();
    onAuthStateChanged(auth, setUser);
  }, []);

  // 공용 키 실시간 구독
  useEffect(() => {
    if (!isAuthReady || !user) return;
    const unsub = onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'config', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setGlobalGeminiKey(docSnap.data().geminiApiKey || '');
      }
    });
    return () => unsub();
  }, [isAuthReady, user]);

  // 플래너 데이터 동기화
  useEffect(() => {
    if (!isAuthReady || !user || !currentDocId) return;
    setLoading(true);
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'planners', currentDocId);
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      try {
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (Array.isArray(data.timetable)) {
            const patched = data.timetable.map(row => ({
              mon_span: 1, mon_hidden: false, tue_span: 1, tue_hidden: false,
              wed_span: 1, wed_hidden: false, thu_span: 1, thu_hidden: false,
              fri_span: 1, fri_hidden: false, sat_span: 1, sat_hidden: false,
              sun_span: 1, sun_hidden: false, ...row
            }));
            setTimetable(patched);
          }
          if (data.dDay) setDDay(data.dDay);
          if (data.yearlyPlan) setYearlyPlan(data.yearlyPlan);
          if (data.monthlyMemo) setMonthlyMemo(data.monthlyMemo);
          if (data.colorRules) setColorRules(data.colorRules);
        }
      } catch (e) {
        console.error("Sync Error:", e);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [isAuthReady, user, currentDocId]);

  // 자동 저장
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return; }
    if (!isAuthReady || !user || !currentDocId || view !== 'PLANNER' || loading) return;

    const saveData = async () => {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'planners', currentDocId);
      await setDoc(docRef, {
        timetable, dDay, yearlyPlan, monthlyMemo, colorRules,
        lastUpdated: new Date().toISOString(),
        studentName: currentDocId,
      }, { merge: true });
    };
    const timeoutId = setTimeout(saveData, 1000);
    return () => clearTimeout(timeoutId);
  }, [timetable, dDay, yearlyPlan, monthlyMemo, colorRules, isAuthReady, user, currentDocId, view, loading]);

  // 선생님 대시보드 로드
  useEffect(() => {
    if (!isAuthReady || !user || view !== 'TEACHER_DASHBOARD') return;
    const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'planners');
    const unsub = onSnapshot(colRef, (snapshot) => {
      const students = [];
      snapshot.forEach(doc => students.push({ id: doc.id, ...doc.data() }));
      setStudentList(students.sort((a, b) => a.id.localeCompare(b.id)));
    });
    return () => unsub();
  }, [isAuthReady, user, view]);

  // --------------------------------------------------------------------------------
  // 8. 핵심 로직: 드래그 및 병합
  // --------------------------------------------------------------------------------
  const handleMouseDown = (day, id) => {
    setIsDragging(true);
    setSelection({ day, startId: id, endId: id });
  };
  const handleMouseEnter = (day, id) => {
    if (isDragging && selection.day === day) {
      setSelection(prev => ({ ...prev, endId: id }));
    }
  };
  const handleMouseUp = () => setIsDragging(false);
  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const mergeCells = () => {
    if (!selection.day || !selection.startId || !selection.endId) return;
    const start = Math.min(selection.startId, selection.endId);
    const end = Math.max(selection.startId, selection.endId);
    const span = end - start + 1;
    if (span <= 1) return;

    setTimetable(prev => prev.map(row => {
      if (row.id === start) return { ...row, [`${selection.day}_span`]: span, [`${selection.day}_hidden`]: false };
      if (row.id > start && row.id <= end) return { ...row, [`${selection.day}_span`]: 1, [`${selection.day}_hidden`]: true, [selection.day]: '' };
      return row;
    }));
    setSelection({ day: null, startId: null, endId: null });
  };

  const unmergeCells = () => {
    if (!selection.day || !selection.startId) return;
    const target = timetable.find(r => r.id === selection.startId);
    if (!target || target[`${selection.day}_span`] <= 1) return;
    const span = target[`${selection.day}_span`];
    setTimetable(prev => prev.map(row => {
      if (row.id >= selection.startId && row.id < selection.startId + span) return { ...row, [`${selection.day}_span`]: 1, [`${selection.day}_hidden`]: false };
      return row;
    }));
    setSelection({ day: null, startId: null, endId: null });
  };

  const executeResetTimetable = () => { setTimetable(generateTimeSlots()); setShowResetConfirm(false); };
  const addColorRule = () => { if (!newColorRule.keyword.trim()) return; setColorRules([...colorRules, { ...newColorRule, id: Date.now() }]); setNewColorRule({ ...newColorRule, keyword: '' }); };
  const removeColorRule = (id) => setColorRules(colorRules.filter(r => r.id !== id));
  const getCellColor = (text) => { if (!text || typeof text !== 'string') return null; const rule = colorRules.find(r => text.includes(r.keyword)); return rule ? rule.color : null; };

  // --------------------------------------------------------------------------------
  // 9. AI 조교 (탭별 개별 작동)
  // --------------------------------------------------------------------------------
  const handleAiSubmit = async (e) => {
    e.preventDefault();
    if (!aiPrompt.trim() || !globalGeminiKey) {
      if (!globalGeminiKey) setAiFeedback('⚠️ 관리자의 API 설정이 필요합니다.');
      return;
    }
    setIsAiProcessing(true);
    setAiFeedback('AI 조교가 시키는 대로 정리하는 중...');

    const todayStr = new Date().toLocaleDateString('ko-KR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    let systemPrompt = `당신은 학생 플래너의 작성을 돕는 "스마트 학습 조교"입니다. 
    철칙: 사용자가 명시한 것만 수행하고, 자의적으로 계획을 짜지 마세요.
    반환 형식: 오직 순수한 JSON만 출력하세요.`;

    if (activeTab === 'WEEKLY') {
      systemPrompt += `\n[주간 모드] 범위: 08:00~24:00 (30분 단위). 요일: mon, tue, wed, thu, fri, sat, sun.
      JSON 예시: { "type": "UPDATE_TIMETABLE", "updates": [{ "day": "mon", "startTime": "09:00", "endTime": "11:00", "content": "수학" }] }`;
    } else if (activeTab === 'MONTHLY') {
      systemPrompt += `\n[월간 모드] 사용자의 메모를 깔끔하게 요약 정리하세요.
      JSON 예시: { "type": "UPDATE_MONTHLY", "content": "정리된 내용" }`;
    } else if (activeTab === 'YEARLY') {
      systemPrompt += `\n[연간 모드] 월(1~12)과 계획을 매칭하세요.
      JSON 예시: { "type": "UPDATE_YEARLY", "monthIndex": 2, "content": "중간고사" }`;
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${globalGeminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt + '\n' + `사용자: "${aiPrompt}"` }] }] }),
      });
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const res = JSON.parse(cleanJson);

        if (res.type === 'UPDATE_TIMETABLE' && activeTab === 'WEEKLY') {
          let newTimetable = [...timetable];
          res.updates.forEach(u => {
            const timeToIdx = (t) => {
              const [h, m] = t.split(':').map(Number);
              return (h - 8) * 2 + (m === 30 ? 1 : 0);
            };
            const sIdx = timeToIdx(u.startTime);
            const eIdx = timeToIdx(u.endTime) - 1;
            if (sIdx >= 0 && eIdx >= sIdx) {
              const span = eIdx - sIdx + 1;
              newTimetable = newTimetable.map((row, idx) => {
                if (idx === sIdx) return { ...row, [`${u.day}_span`]: span, [`${u.day}_hidden`]: false, [u.day]: u.content };
                if (idx > sIdx && idx <= eIdx) return { ...row, [`${u.day}_span`]: 1, [`${u.day}_hidden`]: true, [u.day]: '' };
                return row;
              });
            }
          });
          setTimetable(newTimetable);
          setAiFeedback('✅ 주간 일정 추가 완료!');
        } else if (res.type === 'UPDATE_MONTHLY' && activeTab === 'MONTHLY') {
          setMonthlyMemo(res.content);
          setAiFeedback('✅ 월간 목표 업데이트 완료!');
        } else if (res.type === 'UPDATE_YEARLY' && activeTab === 'YEARLY') {
          const n = [...yearlyPlan]; n[res.monthIndex] = res.content; setYearlyPlan(n);
          setAiFeedback('✅ 연간 계획 업데이트 완료!');
        }
      }
    } catch (e) {
      setAiFeedback('❌ 명령 해석 실패. 더 구체적으로 말해주세요.');
    }
    setAiPrompt('');
    setIsAiProcessing(false);
    setTimeout(() => { setAiFeedback(''); if (!showAiModal) setShowAiModal(false); }, 3000);
  };

  // --------------------------------------------------------------------------------
  // 10. 기타 핸들러
  // --------------------------------------------------------------------------------
  const handleStudentLogin = (e) => {
    e.preventDefault();
    if (!studentName.trim()) return;
    localStorage.setItem('planner_role', 'student');
    localStorage.setItem('planner_name', studentName.trim());
    setRole('student');
    setCurrentDocId(studentName.trim());
    setView('PLANNER');
  };

  const handleTeacherLogin = (e) => {
    e.preventDefault();
    if (teacherPassword === '551000') {
      localStorage.setItem('planner_role', 'teacher');
      setRole('teacher');
      setView('TEACHER_DASHBOARD');
      setTeacherPassword('');
    } else { setErrorMsg('비밀번호가 틀렸습니다.'); }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  const executeLogout = () => {
    localStorage.clear();
    window.location.reload();
  };

  const handleTimetableChange = (id, day, value) => { setTimetable(prev => prev.map(r => r.id === id ? { ...r, [day]: value } : r)); };
  const saveGlobalApiKey = async () => {
    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'global');
    await setDoc(configRef, { geminiApiKey: globalGeminiKey }, { merge: true });
    setShowKeyModal(false);
  };

  if (view === 'LOADING') return (
    <div className="h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <div className="text-slate-500 font-bold animate-pulse">로딩 중...</div>
    </div>
  );

  return (
    <div className={`h-screen flex flex-col transition-colors duration-300 overflow-hidden ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* 1. 랜딩 페이지 */}
      {view === 'LANDING' && (
        <div className="flex-1 flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-10 text-center">
              <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner"><BookOpen className="w-8 h-8 text-white" /></div>
              <h1 className="text-4xl font-black text-white mb-2">스마트 플래너</h1>
              <p className="text-indigo-100 text-sm font-medium italic">Vercel & AI 학습 동기화</p>
            </div>
            <div className="p-8 space-y-4">
              <button onClick={() => setView('STUDENT_LOGIN')} className="w-full p-5 rounded-2xl border-2 border-slate-100 hover:border-indigo-500 hover:bg-indigo-50 flex items-center gap-5 transition-all group">
                <div className="p-4 bg-indigo-100 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors"><PenTool size={24} /></div>
                <div className="text-left font-bold text-lg text-slate-800">학생 입장</div>
              </button>
              <button onClick={() => setView('TEACHER_LOGIN')} className="w-full p-5 rounded-2xl border-2 border-slate-100 hover:border-slate-500 hover:bg-slate-50 flex items-center gap-5 transition-all group">
                <div className="p-4 bg-slate-100 text-slate-600 rounded-xl group-hover:bg-slate-700 group-hover:text-white transition-colors"><Users size={24} /></div>
                <div className="text-left font-bold text-lg text-slate-800">관리자 입장</div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. 로그인 화면 */}
      {(view === 'STUDENT_LOGIN' || view === 'TEACHER_LOGIN') && (
        <div className="flex-1 flex items-center justify-center p-4 animate-fade-in">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100 text-slate-800">
            <button onClick={() => setView('LANDING')} className="text-slate-400 mb-8 flex items-center gap-2 text-sm font-bold hover:text-slate-700"><ChevronLeft className="w-4 h-4" /> 뒤로</button>
            <h2 className="text-3xl font-black mb-6">{view === 'STUDENT_LOGIN' ? '학생 이름 입력' : '관리자 인증'}</h2>
            <form onSubmit={view === 'STUDENT_LOGIN' ? handleStudentLogin : handleTeacherLogin} className="space-y-6">
              <input type={view === 'STUDENT_LOGIN' ? 'text' : 'password'} value={view === 'STUDENT_LOGIN' ? studentName : teacherPassword} onChange={(e) => view === 'STUDENT_LOGIN' ? setStudentName(e.target.value) : setTeacherPassword(e.target.value)} placeholder={view === 'STUDENT_LOGIN' ? '홍길동' : '비밀번호'} className="w-full p-4 border-2 border-slate-200 rounded-2xl focus:border-indigo-500 transition-all text-lg font-bold outline-none" autoFocus />
              {errorMsg && <div className="text-red-500 text-xs font-bold pl-2">⚠️ {errorMsg}</div>}
              <button type="submit" className="w-full text-white p-5 rounded-2xl font-bold text-lg shadow-lg bg-indigo-600 hover:bg-indigo-700">입장하기</button>
            </form>
          </div>
        </div>
      )}

      {/* 3. 관리자 대시보드 */}
      {view === 'TEACHER_DASHBOARD' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-8 animate-fade-in">
          <div className="max-w-6xl mx-auto">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-white p-8 rounded-3xl shadow-sm border text-slate-800">
              <div>
                <h1 className="text-3xl font-black flex items-center gap-3"><Users className="text-indigo-600" /> 관리 대시보드</h1>
                <p className="text-slate-500 font-bold">학생 데이터 및 AI 공용 키 관리</p>
              </div>
              <div className="flex gap-2 mt-4 md:mt-0">
                <button onClick={() => setShowKeyModal(true)} className="flex items-center gap-2 px-5 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold border border-indigo-100 hover:bg-indigo-100 transition-all"><Settings size={18}/> API 설정</button>
                <button onClick={handleLogout} className="flex items-center gap-2 px-5 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"><LogOut size={18}/> 로그아웃</button>
              </div>
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {studentList.map(s => (
                <div key={s.id} onClick={() => { setCurrentDocId(String(s.id)); setView('PLANNER'); }} className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-indigo-500 hover:shadow-xl transition-all cursor-pointer group h-32 relative overflow-hidden flex flex-col justify-between text-slate-800">
                  <div className="flex justify-between items-start">
                    <span className="text-2xl font-black">{String(s.id)}</span>
                    <button onClick={(e) => { e.stopPropagation(); setStudentToDelete(s.id); }} className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={20}/></button>
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold">최종 업데이트: {s.lastUpdated ? new Date(s.lastUpdated).toLocaleString() : '-'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. 메인 플래너 */}
      {view === 'PLANNER' && (
        <>
          <header className={`px-4 py-2 sticky top-0 z-30 border-b flex-shrink-0 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} backdrop-blur-md`}>
            <div className="max-w-7xl mx-auto flex justify-between items-center h-12">
              <div className="flex items-center gap-3">
                {role === 'teacher' && <button onClick={() => setView('TEACHER_DASHBOARD')} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><ChevronLeft size={20}/></button>}
                <div className="p-1.5 bg-indigo-600 rounded-lg text-white"><BookOpen size={16}/></div>
                <div className="font-black text-lg tracking-tighter truncate max-w-[120px]">{String(currentDocId)}</div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`flex p-0.5 rounded-xl ${darkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
                  {['WEEKLY', 'MONTHLY', 'YEARLY'].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-all ${activeTab === t ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>{t === 'WEEKLY' ? '주간' : t === 'MONTHLY' ? '월간' : '연간'}</button>
                  ))}
                </div>
                <button onClick={() => setDarkMode(!darkMode)} className="p-2 hover:bg-slate-100 rounded-xl">{darkMode ? <Sun size={18} className="text-yellow-400"/> : <Moon size={18}/>}</button>
                <button onClick={handleLogout} className="p-2 text-red-500 hover:bg-red-50 rounded-xl"><LogOut size={18}/></button>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-2 md:p-4 pb-20 relative">
            {/* 4.1 주간 시간표 */}
            {activeTab === 'WEEKLY' && (
              <div className="h-full flex flex-col space-y-2 animate-fade-in">
                <div className={`flex-1 p-2 rounded-3xl border shadow-sm flex flex-col ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="flex justify-between items-center gap-2 mb-2 px-2">
                    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide">
                      {dDay ? (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500 text-white rounded-xl font-bold text-[11px]">
                          <Calendar size={12}/> {String(dDay.title)} <button onClick={() => setDDay(null)}><X size={10}/></button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <input type="text" placeholder="D-Day" value={dDayInput.title} onChange={e => setDDayInput({...dDayInput, title: e.target.value})} className="p-1.5 border rounded-lg text-[10px] w-16 bg-transparent outline-none" />
                          <button onClick={() => dDayInput.title && setDDay(dDayInput)} className="bg-slate-800 text-white px-2 rounded-lg font-bold text-[10px]">OK</button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={mergeCells} className={`px-3 py-1.5 rounded-lg font-black text-white text-[11px] transition-all ${selection.day && selection.startId !== selection.endId ? 'bg-indigo-600' : 'bg-slate-200 cursor-not-allowed'}`}>병합</button>
                      <button onClick={unmergeCells} className="px-3 py-1.5 border rounded-lg font-black text-[11px] hover:bg-slate-50">분할</button>
                      <button onClick={() => setShowColorModal(!showColorModal)} className="p-1.5 border rounded-lg hover:bg-slate-50"><Palette size={14}/></button>
                      <button onClick={() => setShowResetConfirm(true)} className="p-1.5 text-red-500 border border-red-100 rounded-lg hover:bg-red-50"><Trash2 size={14}/></button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto rounded-2xl border shadow-inner max-h-[calc(100vh-180px)]">
                    <table className="w-full text-center border-collapse table-fixed min-w-[650px]">
                      <thead className={`sticky top-0 z-20 ${darkMode ? 'bg-slate-900 text-slate-400' : 'bg-slate-50 text-slate-500 shadow-sm'}`}>
                        <tr>
                          <th className="py-2 w-14 text-[9px] font-black border-r">TIME</th>
                          {['월', '화', '수', '목', '금', '토', '일'].map((day, idx) => (
                            <th key={idx} className={`py-2 font-black border-r text-[11px] ${idx === 5 ? 'text-blue-500' : idx === 6 ? 'text-red-500' : ''}`}>{day}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {timetable.map(row => (
                          <tr key={row.id}>
                            <td className={`border text-[9px] font-bold py-1 bg-slate-50/50 ${darkMode ? 'border-slate-700 bg-slate-900/30' : 'border-slate-100 text-slate-400'}`}>{String(row.time)}</td>
                            {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => {
                              if (row[`${day}_hidden`]) return null;
                              const span = row[`${day}_span`];
                              const isSel = selection.day === day && row.id >= Math.min(selection.startId, selection.endId) && row.id <= Math.max(selection.startId, selection.endId);
                              const kwColor = getCellColor(row[day]);
                              
                              return (
                                <td 
                                  key={day} 
                                  rowSpan={span} 
                                  onMouseDown={() => handleMouseDown(day, row.id)} 
                                  onMouseEnter={() => handleMouseEnter(day, row.id)} 
                                  onClick={(e) => {
                                    const textarea = e.currentTarget.querySelector('textarea');
                                    if (textarea) textarea.focus();
                                  }}
                                  className={`border relative p-0 cursor-text transition-all duration-75 ${isSel ? 'ring-2 ring-inset ring-indigo-600 z-30' : ''} ${darkMode ? 'border-slate-700 hover:bg-slate-700/50' : 'border-slate-100 hover:bg-indigo-50/20'}`} 
                                  style={{ backgroundColor: isSel ? 'rgba(79, 70, 229, 0.3)' : (kwColor || 'transparent') }}
                                >
                                  <div className="w-full h-full min-h-[28px] flex flex-col justify-center items-center py-0.5 pointer-events-none">
                                    <textarea 
                                      value={String(row[day])} 
                                      onChange={e => handleTimetableChange(row.id, day, e.target.value)} 
                                      className="w-full bg-transparent resize-none outline-none text-center font-black text-[11px] md:text-[13px] leading-tight align-middle pointer-events-auto" 
                                      rows={1}
                                      onInput={(e) => {
                                        e.target.style.height = 'auto';
                                        e.target.style.height = (e.target.scrollHeight) + 'px';
                                      }}
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
            )}

            {/* 4.2 월간/연간 생략 (레이아웃은 위와 동일하게 최적화됨) */}
            {activeTab === 'MONTHLY' && (
              <div className="h-full flex flex-col animate-fade-in">
                <div className={`flex-1 p-6 rounded-3xl border shadow-sm flex flex-col ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <h2 className="text-xl font-black mb-4 flex items-center gap-3 text-indigo-600"><Sparkles size={20}/> 이달의 메모</h2>
                  <textarea value={String(monthlyMemo)} onChange={e => setMonthlyMemo(e.target.value)} className={`flex-1 w-full p-6 rounded-2xl text-lg font-bold leading-relaxed border-2 focus:border-indigo-500 outline-none shadow-inner ${darkMode ? 'bg-slate-900' : 'bg-slate-50 text-slate-800'}`} />
                </div>
              </div>
            )}

            {activeTab === 'YEARLY' && (
              <div className="animate-fade-in grid grid-cols-2 md:grid-cols-4 gap-3 h-full overflow-y-auto pr-2 custom-scrollbar pb-10">
                {yearlyPlan.map((p, i) => (
                  <div key={i} className={`p-4 rounded-3xl border shadow-sm flex flex-col h-44 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                    <div className="text-lg font-black mb-2 text-indigo-500">{i + 1}월</div>
                    <textarea value={String(p)} onChange={e => { const n = [...yearlyPlan]; n[i] = e.target.value; setYearlyPlan(n); }} className={`w-full flex-1 p-3 rounded-xl text-xs font-bold border-0 outline-none resize-none ${darkMode ? 'bg-slate-900' : 'bg-slate-50 text-slate-700'}`} />
                  </div>
                ))}
              </div>
            )}
          </main>

          {/* AI 조교 버튼 (바운스 제거 및 정적 고정) */}
          <div className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-50 flex flex-col items-end">
            {showAiModal ? (
              <div className={`w-[320px] md:w-[420px] rounded-3xl shadow-2xl overflow-hidden border-2 animate-fade-in ${darkMode ? 'bg-slate-800 border-indigo-900' : 'bg-white border-indigo-100'}`}>
                <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
                  <h3 className="font-black text-sm flex items-center gap-2"><Sparkles size={18}/> AI 학습 조교</h3>
                  <button onClick={() => setShowAiModal(false)}><X size={20}/></button>
                </div>
                <div className="p-6">
                  {aiFeedback && <div className="mb-4 p-3 bg-indigo-50 text-indigo-700 rounded-xl text-[11px] font-black animate-pulse text-center border border-indigo-100">{String(aiFeedback)}</div>}
                  <form onSubmit={handleAiSubmit} className="relative">
                    <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="명령을 입력하세요..." className={`w-full p-4 pr-12 rounded-2xl border-2 focus:border-indigo-500 outline-none text-sm font-bold shadow-lg ${darkMode ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-800'}`} disabled={isAiProcessing} />
                    <button type="submit" disabled={isAiProcessing || !aiPrompt.trim()} className="absolute right-2 top-2 p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg"><Send size={18}/></button>
                  </form>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAiModal(true)} className="w-16 h-16 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95">
                <Sparkles size={28}/>
              </button>
            )}
          </div>
        </>
      )}

      {/* 모달 그룹 (API 설정, 로그아웃, 색상, 리셋, 삭제) - 최하단 렌더링 */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl text-slate-800">
            <h3 className="text-2xl font-black mb-4 flex items-center gap-2 text-indigo-600"><Key/> AI 공용 키 설정</h3>
            <p className="text-slate-500 text-sm mb-6 font-bold">선생님이 등록한 키로 모든 학생이 조교를 사용합니다.</p>
            <input type="password" value={globalGeminiKey} onChange={e => setGlobalGeminiKey(e.target.value)} placeholder="Gemini API Key" className="w-full p-4 border-2 rounded-2xl outline-none focus:border-indigo-500 font-mono mb-6 bg-slate-50" />
            <div className="flex gap-3">
              <button onClick={() => setShowKeyModal(false)} className="flex-1 py-4 bg-slate-100 font-black rounded-xl">취소</button>
              <button onClick={saveGlobalApiKey} className="flex-1 py-4 bg-indigo-600 text-white font-black rounded-xl shadow-lg">저장 및 배포</button>
            </div>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm p-8 rounded-3xl shadow-2xl text-center text-slate-800">
            <LogOut className="mx-auto mb-4 text-slate-400" size={48}/>
            <h3 className="text-xl font-black mb-6">로그아웃 하시겠습니까?</h3>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">취소</button>
              <button onClick={executeLogout} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold">확인</button>
            </div>
          </div>
        </div>
      )}

      {showColorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 animate-fade-in" onClick={() => setShowColorModal(false)}>
          <div className="bg-white w-full max-w-sm p-6 rounded-3xl shadow-2xl text-slate-800" onClick={e => e.stopPropagation()}>
            <h4 className="font-black text-lg mb-4 flex items-center gap-2"><Palette className="text-indigo-500"/> 자동 강조 색상</h4>
            <div className="flex gap-2 mb-4">
              <input type="text" placeholder="수학" value={newColorRule.keyword} onChange={e => setNewColorRule({...newColorRule, keyword: e.target.value})} className="flex-1 p-3 border rounded-xl outline-none font-bold" />
              <input type="color" value={newColorRule.color} onChange={e => setNewColorRule({...newColorRule, color: e.target.value})} className="w-12 h-12 rounded-xl p-1 border cursor-pointer" />
              <button onClick={addColorRule} className="bg-indigo-600 text-white px-4 rounded-xl font-bold">추가</button>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2">
              {colorRules.map(r => (
                <div key={r.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                  <div className="flex items-center gap-3"><div className="w-5 h-5 rounded-full shadow-inner" style={{backgroundColor: r.color}}></div><span className="font-bold">{String(r.keyword)}</span></div>
                  <button onClick={() => removeColorRule(r.id)} className="text-slate-300 hover:text-red-500"><X size={18}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm p-8 rounded-3xl shadow-2xl text-center text-slate-800">
            <AlertCircle className="mx-auto mb-4 text-red-500" size={48}/>
            <h3 className="text-xl font-black mb-2">시간표 초기화</h3>
            <p className="text-slate-500 text-sm mb-8 font-bold">모든 내용과 병합이 취소됩니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">취소</button>
              <button onClick={executeResetTimetable} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold">초기화 진행</button>
            </div>
          </div>
        </div>
      )}

      {studentToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm p-8 rounded-3xl shadow-2xl text-center text-slate-800">
            <h3 className="text-xl font-black mb-4">[{String(studentToDelete)}] 삭제</h3>
            <p className="text-slate-500 text-sm mb-8 font-bold">해당 학생의 모든 데이터가 소멸됩니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setStudentToDelete(null)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">취소</button>
              <button onClick={async () => {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'planners', studentToDelete));
                setStudentToDelete(null);
              }} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg">영구 삭제</button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        textarea { overflow: hidden; pointer-events: auto !important; }
      `}} />
    </div>
  );
}
