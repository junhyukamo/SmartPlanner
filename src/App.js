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
// [환경 설정] Firebase 초기화 및 전역 변수
// ==================================================================================
const firebaseConfig = JSON.parse(__firebase_config);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'ai-term-scheduler';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setLogLevel('error');

export default function App() {
  // --------------------------------------------------------------------------------
  // 1. 앱 전역 상태 및 공용 설정
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
  // 4. 시간표 템플릿 생성 (08:00 ~ 24:00, 30분 단위)
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
  // 5. 플래너 핵심 데이터
  // --------------------------------------------------------------------------------
  const [timetable, setTimetable] = useState(generateTimeSlots());
  const [todos, setTodos] = useState([]);
  const [dDay, setDDay] = useState(null);
  const [dDayInput, setDDayInput] = useState({ title: '', date: '' });
  const [memo, setMemo] = useState('');
  const [yearlyPlan, setYearlyPlan] = useState(Array(12).fill(''));
  const [monthlyMemo, setMonthlyMemo] = useState('');
  const [colorRules, setColorRules] = useState([]);
  const [newColorRule, setNewColorRule] = useState({ keyword: '', color: '#bfdbfe' });
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
  // 7. 초기화 및 실시간 동기화
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
        console.error("인증 실패:", error);
        setCriticalError('AUTH_ERROR');
      }

      // 공용 API 키 로드
      const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'global');
      try {
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          setGlobalGeminiKey(configSnap.data().geminiApiKey || '');
        }
      } catch (e) {
        console.error("Config Load Error:", e);
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
      setIsAuthReady(true);
    };
    initApp();
    onAuthStateChanged(auth, setUser);
  }, []);

  // 공용 API 키 실시간 구독
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
          if (data.todos) setTodos(data.todos);
          if (data.dDay) setDDay(data.dDay);
          if (data.memo) setMemo(data.memo);
          if (data.yearlyPlan) setYearlyPlan(data.yearlyPlan);
          if (data.monthlyMemo) setMonthlyMemo(data.monthlyMemo);
          if (data.colorRules) setColorRules(data.colorRules);
        }
      } catch (e) {
        console.error("Data Load Error:", e);
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
        timetable, todos, dDay, memo, yearlyPlan, monthlyMemo, colorRules,
        lastUpdated: new Date().toISOString(),
        studentName: currentDocId,
      }, { merge: true });
    };
    const timeoutId = setTimeout(saveData, 1000);
    return () => clearTimeout(timeoutId);
  }, [timetable, todos, dDay, memo, yearlyPlan, monthlyMemo, colorRules, isAuthReady, user, currentDocId, view, loading]);

  // 선생님 대시보드 데이터 로드
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
  // 8. 핵심 로직: 셀 병합/분할/색상/드래그
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
  useEffect(() => { window.addEventListener('mouseup', handleMouseUp); return () => window.removeEventListener('mouseup', handleMouseUp); }, []);

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
  // 9. AI 조교 로직
  // --------------------------------------------------------------------------------
  const callGeminiAPI = async (systemPrompt, userText) => {
    if (!globalGeminiKey) { setAiFeedback('⚠️ 관리자가 AI 공용 키를 설정해야 합니다.'); return null; }
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${globalGeminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt + '\n' + userText }] }] }),
      });
      const result = await response.json();
      if (result.error) throw new Error(result.error.message);
      return result.candidates?.[0]?.content?.parts?.[0]?.text;
    } catch (error) { setAiFeedback(`❌ AI 오류: ${error.message}`); return null; }
  };

  const handleAiSubmit = async (e) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setIsAiProcessing(true);
    setAiFeedback('명령을 분석하고 처리하는 중입니다...');

    const now = new Date();
    const todayStr = now.toLocaleDateString('ko-KR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    let systemPrompt = `당신은 학생의 학습 플래너 작성을 돕는 "스마트 학습 조교"입니다. 
    사용자의 명령을 분석하여 아래의 지시사항을 엄격히 따르세요.
    [중요 원칙]
    1. 사용자가 명시하지 않은 일정은 절대로 자의적으로 추가하지 마세요.
    2. 오직 시키는 것만 정확하게 데이터 구조로 변환하세요.
    3. 모든 응답은 반드시 순수 JSON 형식으로만 출력하세요.`;

    if (activeTab === 'WEEKLY') {
      systemPrompt += `
      [주간 시간표 모드]
      현재 요일/날짜: ${todayStr}
      입력 가능한 시간 범위: 08:00 ~ 24:00 (30분 단위)
      - 요일 코드: "mon", "tue", "wed", "thu", "fri", "sat", "sun"
      - 출력 JSON 예시: { "type": "UPDATE_TIMETABLE", "updates": [{ "day": "mon", "startTime": "09:00", "endTime": "11:30", "content": "수학 공부" }] }`;
    } else if (activeTab === 'MONTHLY') {
      systemPrompt += `
      [월간 목표 모드]
      사용자가 이번 달에 하고 싶은 일이나 메모를 말하면 "content" 필드에 정리하세요.
      - 출력 JSON 예시: { "type": "UPDATE_MONTHLY", "content": "영어 단어 500개 외우기\\n매일 30분 운동" }`;
    } else if (activeTab === 'YEARLY') {
      systemPrompt += `
      [연간 계획 모드]
      특정 월의 계획을 말하면 해당 월의 인덱스(0~11)와 내용을 추출하세요.
      - 출력 JSON 예시: { "type": "UPDATE_YEARLY", "monthIndex": 2, "content": "중간고사 대비 시작" }`;
    }

    const text = await callGeminiAPI(systemPrompt, `사용자 명령: "${aiPrompt}"`);

    if (text) {
      try {
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
          setAiFeedback('✅ 주간 시간표 업데이트 완료!');
        } else if (res.type === 'UPDATE_MONTHLY' && activeTab === 'MONTHLY') {
          setMonthlyMemo(res.content);
          setAiFeedback('✅ 이달의 목표 업데이트 완료!');
        } else if (res.type === 'UPDATE_YEARLY' && activeTab === 'YEARLY') {
          handleYearlyChange(res.monthIndex, res.content);
          setAiFeedback(`✅ ${res.monthIndex + 1}월 계획 업데이트 완료!`);
        } else {
          setAiFeedback('❓ 현재 탭에 맞는 명령이 아니거나 이해하지 못했습니다.');
        }
      } catch (e) { setAiFeedback('❌ 명령 해석 실패. 더 명확하게 말해주세요.'); }
    }
    setAiPrompt('');
    setIsAiProcessing(false);
    setTimeout(() => { setAiFeedback(''); if (!text) setShowAiModal(false); }, 3000);
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
    } else { setErrorMsg('비밀번호가 일치하지 않습니다.'); }
  };

  const handleLogout = () => setShowLogoutConfirm(true);

  const executeLogout = () => {
    localStorage.removeItem('planner_role');
    localStorage.removeItem('planner_name');
    setView('LANDING');
    setRole('');
    setStudentName('');
    setCurrentDocId(null);
    setShowLogoutConfirm(false);
  };

  const saveGlobalApiKey = async () => {
    const configRef = doc(db, 'artifacts', appId, 'public', 'data', 'config', 'global');
    await setDoc(configRef, { geminiApiKey: globalGeminiKey }, { merge: true });
    setShowKeyModal(false);
  };

  const handleTimetableChange = (id, day, value) => { setTimetable(prev => prev.map(r => r.id === id ? { ...r, [day]: value } : r)); };
  const handleYearlyChange = (idx, val) => { const n = [...yearlyPlan]; n[idx] = val; setYearlyPlan(n); };
  const handleDeleteStudent = (e, id) => { e.stopPropagation(); setStudentToDelete(id); };
  const executeDeleteStudent = async () => { 
    if (!studentToDelete) return; 
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'planners', studentToDelete);
    await deleteDoc(docRef); 
    setStudentToDelete(null); 
  };

  // --------------------------------------------------------------------------------
  // 11. 렌더링
  // --------------------------------------------------------------------------------
  if (criticalError) return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-6 text-slate-800">
      <div className="bg-white p-8 md:p-10 rounded-3xl shadow-2xl max-w-lg text-center border border-red-200">
        <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6"><AlertCircle size={40} /></div>
        <h2 className="text-2xl font-extrabold text-red-700 mb-4">인증 또는 설정 오류</h2>
        <p className="text-slate-600 mb-6 text-sm md:text-base">Firebase 초기화 또는 익명 로그인 설정이 올바르지 않습니다.</p>
        <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-6 py-3 rounded-xl font-bold">다시 시도</button>
      </div>
    </div>
  );

  if (view === 'LOADING') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
      <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
      <div className="text-slate-500 font-medium tracking-widest animate-pulse">데이터 로드 중...</div>
    </div>
  );

  return (
    <div className={`h-screen flex flex-col transition-colors duration-300 overflow-hidden ${darkMode ? 'bg-slate-900 text-slate-100' : 'bg-slate-50 text-slate-800'}`}>
      
      {/* 1. 랜딩 페이지 */}
      {view === 'LANDING' && (
        <div className="flex-1 flex items-center justify-center p-4 animate-fade-in overflow-y-auto">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
            <div className="bg-gradient-to-br from-indigo-600 to-purple-600 p-10 text-center relative">
              <div className="w-20 h-20 bg-white/20 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner"><BookOpen className="w-10 h-10 text-white" /></div>
              <h1 className="text-4xl font-extrabold text-white mb-2 tracking-tight">스마트 플래너</h1>
              <p className="text-indigo-100 font-medium italic">AI 조교와 함께하는 학습 관리</p>
            </div>
            <div className="p-8 space-y-4">
              <button onClick={() => setView('STUDENT_LOGIN')} className="w-full p-5 rounded-2xl border-2 border-slate-100 hover:border-indigo-500 hover:bg-indigo-50 flex items-center gap-5 transition-all group">
                <div className="p-4 bg-indigo-100 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors"><PenTool size={24} /></div>
                <div className="text-left"><div className="font-extrabold text-lg">학생 입장</div><div className="text-sm text-slate-500">본인의 이름으로 시작하세요</div></div>
              </button>
              <button onClick={() => setView('TEACHER_LOGIN')} className="w-full p-5 rounded-2xl border-2 border-slate-100 hover:border-slate-500 hover:bg-slate-50 flex items-center gap-5 transition-all group">
                <div className="p-4 bg-slate-100 text-slate-600 rounded-xl group-hover:bg-slate-700 group-hover:text-white transition-colors"><Users size={24} /></div>
                <div className="text-left"><div className="font-extrabold text-lg text-slate-800">관리자 입장</div><div className="text-sm text-slate-500">학생 현황 및 AI 관리</div></div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. 로그인 화면 */}
      {(view === 'STUDENT_LOGIN' || view === 'TEACHER_LOGIN') && (
        <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
          <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-slate-100 animate-fade-in">
            <button onClick={() => setView('LANDING')} className="text-slate-400 mb-8 flex items-center gap-2 text-sm font-medium hover:text-slate-700"><ChevronLeft className="w-4 h-4" /> 뒤로가기</button>
            <div className="mb-8"><h2 className="text-3xl font-extrabold text-slate-800 mb-2">{view === 'STUDENT_LOGIN' ? '학생 이름 입력' : '관리자 로그인'}</h2><p className="text-slate-500 text-sm">데이터는 실시간으로 연동됩니다.</p></div>
            <form onSubmit={view === 'STUDENT_LOGIN' ? handleStudentLogin : handleTeacherLogin} className="space-y-6">
              <input type={view === 'STUDENT_LOGIN' ? 'text' : 'password'} value={view === 'STUDENT_LOGIN' ? studentName : teacherPassword} onChange={(e) => view === 'STUDENT_LOGIN' ? setStudentName(e.target.value) : setTeacherPassword(e.target.value)} placeholder={view === 'STUDENT_LOGIN' ? '예: 홍길동' : '관리자 비밀번호'} className="w-full p-4 border-2 border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-lg font-medium outline-none text-slate-800" autoFocus />
              {errorMsg && <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2"><AlertCircle size={14}/> {errorMsg}</div>}
              <button type="submit" className={`w-full text-white p-5 rounded-2xl font-extrabold text-lg shadow-lg ${view === 'STUDENT_LOGIN' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-800 hover:bg-slate-900'}`}>{view === 'STUDENT_LOGIN' ? '플래너 시작하기' : '대시보드 접속'}</button>
            </form>
          </div>
        </div>
      )}

      {/* 3. 관리자 대시보드 */}
      {view === 'TEACHER_DASHBOARD' && (
        <div className="flex-1 overflow-y-auto p-4 md:p-8 animate-fade-in">
          <div className="max-w-6xl mx-auto">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-slate-100">
              <div>
                <h1 className="text-3xl font-extrabold flex items-center gap-3 text-slate-800 mb-1"><Users className="text-indigo-600" /> 관리자 대시보드</h1>
                <p className="text-slate-500 font-medium">총 {studentList.length}명의 학생 플래너가 있습니다.</p>
              </div>
              <div className="flex gap-3 mt-4 md:mt-0">
                <button onClick={() => setShowKeyModal(true)} className="flex items-center gap-2 px-5 py-3 bg-indigo-50 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all border border-indigo-200"><Settings size={18}/> AI 공용 키 설정</button>
                <button onClick={handleLogout} className="flex items-center gap-2 px-5 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"><LogOut size={18}/> 로그아웃</button>
              </div>
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {studentList.map(s => (
                <div key={s.id} onClick={() => { setCurrentDocId(String(s.id)); setView('PLANNER'); }} className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-indigo-500 hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between h-40 relative overflow-hidden">
                  <div className="flex justify-between items-start">
                    <span className="text-2xl font-black text-slate-800">{String(s.id)}</span>
                    <button onClick={(e) => handleDeleteStudent(e, String(s.id))} className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={20}/></button>
                  </div>
                  <div className="text-xs text-slate-400 font-medium">최근 업데이트: {s.lastUpdated ? new Date(s.lastUpdated).toLocaleString() : '없음'}</div>
                  <div className="absolute right-[-10px] bottom-[-10px] opacity-10 rotate-12 group-hover:rotate-0 transition-transform text-indigo-200"><BookOpen size={80}/></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. 메인 플래너 화면 */}
      {view === 'PLANNER' && (
        <>
          <header className={`px-4 py-3 shadow-sm sticky top-0 z-30 border-b flex-shrink-0 ${darkMode ? 'bg-slate-800/90 border-slate-700' : 'bg-white/90 border-slate-200'} backdrop-blur-md`}>
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3 w-full md:w-auto">
                {role === 'teacher' && <button onClick={() => setView('TEACHER_DASHBOARD')} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 text-slate-600"><ChevronLeft/></button>}
                <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg"><BookOpen size={20}/></div>
                <div className="font-black text-xl tracking-tighter truncate max-w-[150px] md:max-w-none">{String(currentDocId)} 플래너</div>
              </div>
              <div className="flex items-center gap-2">
                <div className={`flex p-1 rounded-xl shadow-inner ${darkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
                  {['WEEKLY', 'MONTHLY', 'YEARLY'].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`px-4 py-1.5 rounded-lg text-xs md:text-sm font-extrabold transition-all ${activeTab === t ? 'bg-white text-indigo-600 shadow' : 'text-slate-400 hover:text-slate-600'}`}>{t === 'WEEKLY' ? '주간' : t === 'MONTHLY' ? '월간' : '연간'}</button>
                  ))}
                </div>
                <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-xl transition-colors ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>{darkMode ? <Sun className="text-yellow-400" size={20}/> : <Moon className="text-slate-400" size={20}/>}</button>
                <button onClick={handleLogout} className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-colors"><LogOut size={20}/></button>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-2 md:p-6 pb-24 relative">
            {/* 4.1 주간 시간표 */}
            {activeTab === 'WEEKLY' && (
              <div className="h-full flex flex-col space-y-4 animate-fade-in">
                <div className={`flex-1 p-2 md:p-4 rounded-3xl shadow-sm border overflow-hidden flex flex-col ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <div className="flex flex-wrap justify-between items-center gap-2 mb-4 px-2">
                    <div className="flex items-center gap-2">
                      {dDay ? (
                        <div className="flex items-center gap-2 px-3 py-2 bg-rose-500 text-white rounded-2xl font-bold shadow-md animate-pulse text-xs">
                          <Calendar size={14}/> {String(dDay.title)} <button onClick={() => setDDay(null)}><X size={12}/></button>
                        </div>
                      ) : (
                        <div className="flex gap-1">
                          <input type="text" placeholder="D-Day" value={dDayInput.title} onChange={e => setDDayInput({...dDayInput, title: e.target.value})} className="p-1.5 border rounded-lg text-xs outline-none focus:border-indigo-500 w-20 bg-transparent text-slate-600" />
                          <input type="date" value={dDayInput.date} onChange={e => setDDayInput({...dDayInput, date: e.target.value})} className="p-1.5 border rounded-lg text-xs outline-none focus:border-indigo-500 bg-transparent text-slate-600" />
                          <button onClick={() => dDayInput.title && setDDay(dDayInput)} className="bg-slate-800 text-white px-3 rounded-lg font-bold text-xs">설정</button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 md:gap-2">
                      <button onClick={() => setShowColorModal(!showColorModal)} className="flex items-center gap-1 px-2 py-1.5 border rounded-lg hover:bg-slate-50 font-bold text-xs"><Palette size={14}/> 색상</button>
                      <button onClick={mergeCells} className={`px-3 py-1.5 rounded-lg font-bold text-white shadow transition-all text-xs ${selection.day && selection.startId !== selection.endId ? 'bg-indigo-600 scale-100' : 'bg-slate-300 scale-95 cursor-not-allowed'}`}><Merge size={14} className="inline mr-1"/> 병합</button>
                      <button onClick={unmergeCells} className="px-3 py-1.5 border rounded-lg font-bold hover:bg-slate-50 transition-all text-xs"><Split size={14} className="inline mr-1"/> 분할</button>
                      <button onClick={() => setShowResetConfirm(true)} className="px-3 py-1.5 text-red-500 bg-red-50 rounded-lg font-bold hover:bg-red-100 text-xs"><Trash2 size={14} className="inline mr-1"/> 초기화</button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-auto rounded-2xl border shadow-inner max-h-[calc(100vh-280px)] md:max-h-[calc(100vh-240px)]">
                    <table className="w-full text-center border-collapse table-fixed min-w-[700px]">
                      <thead className={`sticky top-0 z-20 ${darkMode ? 'bg-slate-900 text-slate-400' : 'bg-slate-50 text-slate-500 shadow-sm'}`}>
                        <tr>
                          <th className="py-2 w-16 text-[9px] font-black uppercase tracking-widest border-r">Time</th>
                          {['월', '화', '수', '목', '금', '토', '일'].map((day, idx) => (
                            <th key={idx} className={`py-2 font-black border-r text-xs ${idx === 5 ? 'text-blue-500' : idx === 6 ? 'text-red-500' : ''}`}>{day}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {timetable.map(row => (
                          <tr key={row.id}>
                            <td className={`border text-[9px] font-bold py-1 ${darkMode ? 'border-slate-700 bg-slate-900/30' : 'border-slate-100 bg-white text-slate-400'}`}>{String(row.time)}</td>
                            {['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(day => {
                              if (row[`${day}_hidden`]) return null;
                              const span = row[`${day}_span`];
                              const start = Math.min(selection.startId, selection.endId);
                              const end = Math.max(selection.startId, selection.endId);
                              // 시각적 드래그 피드백: 요일이 일치할 때만 하이라이트
                              const isSel = selection.day === day && row.id >= start && row.id <= end;
                              const kwColor = getCellColor(row[day]);
                              
                              return (
                                <td 
                                  key={day} 
                                  rowSpan={span} 
                                  onMouseDown={() => handleMouseDown(day, row.id)} 
                                  onMouseEnter={() => handleMouseEnter(day, row.id)} 
                                  onClick={(e) => {
                                    // 셀 어느 곳을 눌러도 textarea에 포커스
                                    const textarea = e.currentTarget.querySelector('textarea');
                                    if (textarea) textarea.focus();
                                  }}
                                  className={`border relative p-0 cursor-text transition-all duration-150 ${isSel ? 'ring-2 ring-indigo-500 z-10 bg-indigo-500/20' : ''} ${darkMode ? 'border-slate-700 hover:bg-slate-700' : 'border-slate-100 hover:bg-indigo-50/20'}`} 
                                  style={{ backgroundColor: kwColor || 'transparent' }}
                                >
                                  <div className="w-full h-full min-h-[32px] flex flex-col justify-center items-center py-1">
                                    <textarea 
                                      value={String(row[day])} 
                                      onChange={e => handleTimetableChange(row.id, day, e.target.value)} 
                                      className={`w-full bg-transparent resize-none outline-none text-center font-bold text-xs md:text-sm leading-tight align-middle ${darkMode ? 'text-white' : 'text-slate-700'}`} 
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

            {/* 4.2 월간 메모 */}
            {activeTab === 'MONTHLY' && (
              <div className="h-full animate-fade-in flex flex-col">
                <div className={`flex-1 p-6 rounded-3xl border shadow-sm flex flex-col ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                  <h2 className="text-xl font-black mb-4 flex items-center gap-3 text-slate-800"><Sparkles className="text-indigo-500"/> 이달의 학습 목표</h2>
                  <textarea value={String(monthlyMemo)} onChange={e => setMonthlyMemo(e.target.value)} placeholder="이번 달 목표를 작성하세요..." className={`flex-1 w-full p-6 rounded-2xl text-lg font-bold leading-relaxed border-2 focus:border-indigo-500 outline-none shadow-inner ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-100 text-slate-800'}`} />
                </div>
              </div>
            )}

            {/* 4.3 연간 계획 */}
            {activeTab === 'YEARLY' && (
              <div className="animate-fade-in grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-6 h-full overflow-y-auto pr-2 custom-scrollbar">
                {yearlyPlan.map((p, i) => (
                  <div key={i} className={`p-4 rounded-3xl border shadow-sm flex flex-col h-48 md:h-64 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                    <div className="text-lg font-black mb-2 text-indigo-600">{i + 1}월</div>
                    <textarea value={String(p)} onChange={e => handleYearlyChange(i, e.target.value)} placeholder="계획 입력" className={`w-full flex-1 p-3 rounded-xl text-xs md:text-sm font-bold border-0 outline-none resize-none shadow-inner ${darkMode ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-700'}`} />
                  </div>
                ))}
              </div>
            )}
          </main>

          {/* AI 조교 플로팅 UI (정적 디자인 적용) */}
          <div className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-50 flex flex-col items-end">
            {showAiModal ? (
              <div className={`w-[320px] md:w-[450px] rounded-3xl shadow-2xl overflow-hidden border-2 animate-fade-in ${darkMode ? 'bg-slate-800 border-indigo-900' : 'bg-white border-indigo-100'}`}>
                <div className="bg-indigo-600 p-4 text-white flex justify-between items-center">
                  <h3 className="font-black text-sm md:text-lg flex items-center gap-2"><Sparkles size={18}/> AI 학습 조교 ({activeTab === 'WEEKLY' ? '주간' : activeTab === 'MONTHLY' ? '월간' : '연간'})</h3>
                  <button onClick={() => setShowAiModal(false)}><X size={20}/></button>
                </div>
                <div className="p-6">
                  {aiFeedback && <div className="mb-4 p-3 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-black animate-pulse text-center border border-indigo-100">{String(aiFeedback)}</div>}
                  <form onSubmit={handleAiSubmit} className="relative">
                    <input type="text" value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder="명령을 입력하세요..." className={`w-full p-4 pr-12 rounded-2xl border-2 focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none text-sm font-bold shadow-lg transition-all ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-50 border-slate-100 text-slate-800'}`} disabled={isAiProcessing} />
                    <button type="submit" disabled={isAiProcessing || !aiPrompt.trim()} className="absolute right-2 top-2 p-2.5 bg-indigo-600 text-white rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all"><Send size={18}/></button>
                  </form>
                  <p className="mt-3 text-[9px] text-slate-400 text-center font-bold tracking-tight">* 보고 있는 탭의 계획을 업데이트합니다.</p>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAiModal(true)} className="w-16 h-16 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all">
                <Sparkles size={28}/>
              </button>
            )}
          </div>
        </>
      )}

      {/* 5. 모달 그룹 */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl text-slate-800">
            <h3 className="text-2xl font-black mb-4 flex items-center gap-2"><Key className="text-indigo-600"/> 공용 API 키 설정</h3>
            <p className="text-slate-500 text-sm mb-6 font-medium">관리자가 등록한 키를 모든 학생이 공유합니다.</p>
            <input type="password" value={globalGeminiKey} onChange={e => setGlobalGeminiKey(e.target.value)} placeholder="Gemini API Key" className="w-full p-4 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 font-mono text-sm text-slate-800 mb-6 bg-slate-50" />
            <div className="flex gap-3">
              <button onClick={() => setShowKeyModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200">취소</button>
              <button onClick={saveGlobalApiKey} className="flex-1 py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-colors">저장 및 배포</button>
            </div>
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm p-8 rounded-3xl shadow-2xl text-center text-slate-800">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500"><LogOut size={32}/></div>
            <h3 className="text-xl font-black mb-2">로그아웃 하시겠습니까?</h3>
            <p className="text-slate-500 text-sm mb-8 font-medium">데이터는 안전하게 저장되었습니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">취소</button>
              <button onClick={executeLogout} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg">로그아웃</button>
            </div>
          </div>
        </div>
      )}

      {showColorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 animate-fade-in" onClick={() => setShowColorModal(false)}>
          <div className="bg-white w-full max-w-sm p-6 rounded-3xl shadow-2xl text-slate-800" onClick={e => e.stopPropagation()}>
            <h4 className="font-black text-lg mb-4 flex items-center gap-2"><Palette className="text-indigo-500"/> 자동 강조 색상</h4>
            <div className="flex gap-2 mb-4">
              <input type="text" placeholder="예: 수학" value={newColorRule.keyword} onChange={e => setNewColorRule({...newColorRule, keyword: e.target.value})} className="flex-1 p-3 border rounded-xl outline-none font-bold text-slate-800 bg-slate-50" />
              <input type="color" value={newColorRule.color} onChange={e => setNewColorRule({...newColorRule, color: e.target.value})} className="w-12 h-12 rounded-xl p-1 border cursor-pointer bg-white" />
              <button onClick={addColorRule} className="bg-indigo-600 text-white px-4 rounded-xl font-bold hover:bg-indigo-700">추가</button>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2">
              {colorRules.map(r => (
                <div key={r.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="flex items-center gap-3"><div className="w-5 h-5 rounded-full shadow-inner" style={{backgroundColor: r.color}}></div><span className="font-bold text-sm text-slate-700">{String(r.keyword)}</span></div>
                  <button onClick={() => removeColorRule(r.id)} className="text-slate-300 hover:text-red-500 transition-colors"><X size={18}/></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm p-8 rounded-3xl shadow-2xl text-center text-slate-800">
            <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500"><AlertCircle size={36}/></div>
            <h3 className="text-xl font-black mb-2">시간표를 초기화할까요?</h3>
            <p className="text-slate-500 text-sm mb-8 font-medium">내용과 병합된 칸이 모두 삭제됩니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">취소</button>
              <button onClick={executeResetTimetable} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg">초기화 진행</button>
            </div>
          </div>
        </div>
      )}

      {studentToDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-sm p-8 rounded-3xl shadow-2xl text-center text-slate-800">
            <h3 className="text-xl font-black mb-4">[{String(studentToDelete)}] 삭제</h3>
            <p className="text-slate-500 text-sm mb-8">모든 데이터가 영구적으로 삭제됩니다.</p>
            <div className="flex gap-3">
              <button onClick={() => setStudentToDelete(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold">취소</button>
              <button onClick={executeDeleteStudent} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg">영구 삭제</button>
            </div>
          </div>
        </div>
      )}

      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in" onClick={() => setShowHelpModal(false)}>
          <div className="bg-white w-full max-w-md p-8 rounded-3xl shadow-2xl text-slate-800" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-800">학습 플래너 팁</h3>
              <button onClick={() => setShowHelpModal(false)}><X className="text-slate-400"/></button>
            </div>
            <div className="space-y-4 text-slate-600 text-sm font-medium">
              <p>• <strong>드래그 병합</strong>: 셀을 마우스로 드래그하여 선택한 뒤 상단의 [병합] 버튼을 누르면 하나로 합쳐집니다.</p>
              <p>• <strong>자동 저장</strong>: 모든 내용은 1초 뒤에 서버에 자동으로 저장됩니다.</p>
              <p>• <strong>AI 조교</strong>: 오른쪽 하단 아이콘을 눌러 "수요일 10시 수학 공부 넣어줘"라고 말해보세요.</p>
              <p>• <strong>키워드 색상</strong>: [색상] 메뉴에서 특정 단어에 색을 입히면 시간표에 자동으로 강조됩니다.</p>
            </div>
            <button onClick={() => setShowHelpModal(false)} className="w-full mt-8 py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg">확인</button>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out; }
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        textarea { overflow: hidden; }
      `}} />
    </div>
  );
}
