const { useState, useEffect, useCallback, useRef } = React;

const API = "http://localhost:6969";
// Auth token — may be set by Telegram Mini App page or fetched from /api/token
let __authToken = window.__SWARM_API_TOKEN__ || "";
const f = (u, o) => fetch(`${API}${u}`, {
  ...o,
  headers: {
    "Content-Type": "application/json",
    ...(__authToken ? { "Authorization": "Bearer " + __authToken } : {}),
    ...o?.headers,
  },
});

const STATES = {
  idle: { label: "IDLE", emoji: "💤", color: "#4ECDC4", desc: "Chillin' in the desert..." },
  check_audio: { label: "Check Audio", emoji: "👂", color: "#FFB347", desc: "Listening for voice reviews" },
  transcribe_audio: { label: "Transcribing", emoji: "🎙️", color: "#FF6B6B", desc: "Whisper doing its thing" },
  parse_audio_items: { label: "Parsing Audio", emoji: "📋", color: "#FF6B6B", desc: "Extracting todos from voice" },
  check_refactor: { label: "Check Refactor", emoji: "🤔", color: "#FFB347", desc: "Need a cleanup?" },
  do_refactor: { label: "Refactoring", emoji: "🔧", color: "#FF6B6B", desc: "Cleaning up the town" },
  check_new_items: { label: "New Items?", emoji: "📬", color: "#FFB347", desc: "Checking the mailbox" },
  update_plan: { label: "Planning", emoji: "🗺️", color: "#FF6B6B", desc: "Drawing up the roadmap" },
  check_plan_complete: { label: "Plan Done?", emoji: "✅", color: "#FFB347", desc: "Are we there yet?" },
  execute_step: { label: "Building!", emoji: "⚡", color: "#FF6B6B", desc: "Agents hard at work" },
  test_step: { label: "Testing!", emoji: "🧪", color: "#9B59B6", desc: "Making sure it works" },
  check_steps_left: { label: "Steps Left?", emoji: "📊", color: "#FFB347", desc: "How much more?" },
  check_more_items: { label: "More Work?", emoji: "📬", color: "#FFB347", desc: "Anything new come in?" },
  final_optimize: { label: "Optimizing", emoji: "✨", color: "#4ECDC4", desc: "Polish & shine" },
  scan_repo: { label: "Final Scan", emoji: "🔍", color: "#4ECDC4", desc: "One last look around" },
  credits_exhausted: { label: "CREDITS!", emoji: "💳", color: "#E74C3C", desc: "Waiting for credits to refill..." },
  error: { label: "ERROR", emoji: "💥", color: "#E74C3C", desc: "Something broke!" },
};

const FLOW_NODES = [
  { id: "idle", x: 250, y: 18, w: 120, h: 36 },
  { id: "check_audio", x: 250, y: 66, w: 120, h: 36, dec: 1 },
  { id: "transcribe_audio", x: 410, y: 66, w: 120, h: 36 },
  { id: "parse_audio_items", x: 410, y: 114, w: 120, h: 36 },
  { id: "check_refactor", x: 250, y: 114, w: 120, h: 36, dec: 1 },
  { id: "do_refactor", x: 90, y: 114, w: 120, h: 36 },
  { id: "check_new_items", x: 250, y: 162, w: 120, h: 36, dec: 1 },
  { id: "update_plan", x: 410, y: 162, w: 120, h: 36 },
  { id: "check_plan_complete", x: 250, y: 210, w: 120, h: 36, dec: 1 },
  { id: "execute_step", x: 250, y: 258, w: 120, h: 36 },
  { id: "test_step", x: 250, y: 306, w: 120, h: 36 },
  { id: "check_steps_left", x: 250, y: 354, w: 120, h: 36, dec: 1 },
  { id: "check_more_items", x: 90, y: 354, w: 120, h: 36, dec: 1 },
  { id: "final_optimize", x: 90, y: 402, w: 120, h: 36 },
  { id: "scan_repo", x: 90, y: 450, w: 120, h: 36 },
  { id: "credits_exhausted", x: 410, y: 306, w: 120, h: 36 },
];

const FLOW_EDGES = [
  ["idle","check_audio","M310,54 L310,66"],
  ["check_audio","transcribe_audio","M370,84 L410,84","Yes"],
  ["check_audio","check_refactor","M310,102 L310,114","No"],
  ["transcribe_audio","parse_audio_items","M470,102 L470,114"],
  ["parse_audio_items","check_refactor","M410,132 L370,132"],
  ["check_refactor","do_refactor","M250,132 L210,132","No"],
  ["check_refactor","check_new_items","M310,150 L310,162","Yes"],
  ["do_refactor","check_new_items","M150,150 L150,172 L250,172"],
  ["check_new_items","update_plan","M370,180 L410,180","Yes"],
  ["check_new_items","check_plan_complete","M310,198 L310,210","No"],
  ["update_plan","check_plan_complete","M470,198 L470,220 L370,220"],
  ["check_plan_complete","idle","M250,228 L50,228 L50,36 L250,36","Done"],
  ["check_plan_complete","execute_step","M310,246 L310,258","No"],
  ["execute_step","test_step","M310,294 L310,306"],
  ["test_step","check_steps_left","M310,342 L310,354"],
  ["check_steps_left","execute_step","M370,372 L400,372 L400,276 L370,276","Yes"],
  ["check_steps_left","check_more_items","M250,372 L210,372","No"],
  ["check_more_items","update_plan","M150,354 L150,340 L470,340 L470,162","Yes"],
  ["check_more_items","final_optimize","M150,390 L150,402","No"],
  ["final_optimize","scan_repo","M150,438 L150,450"],
  ["scan_repo","idle","M90,468 L50,468 L50,36 L250,36"],
];

function Dashboard() {
  const [tab, setTab] = useState("home");
  const [repos, setRepos] = useState([]);
  const [sr, setSR] = useState(null);
  const [items, setItems] = useState([]);
  const [plan, setPlan] = useState([]);
  const [logs, setLogs] = useState([]);
  const [agents, setAgents] = useState([]);
  const [memory, setMemory] = useState([]);
  const [mistakes, setMistakes] = useState([]);
  const [audio, setAudio] = useState([]);
  const [connected, setCon] = useState(false);
  const [ni, setNI] = useState({ type: "feature", title: "", description: "", priority: "medium" });
  const [nr, setNR] = useState({ name: "", path: "", github_url: "", branch: "main" });
  const [healthData, setHealthData] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [chatMsg, setChatMsg] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [recording, setRec] = useState(false);
  const [recTime, setRecTime] = useState(0);
  const [token, setToken] = useState(__authToken);
  const [history, setHistory] = useState([]);
  const [rollingBack, setRollingBack] = useState(false);
  const [selOptItems, setSelOptItems] = useState([]);
  const [costs, setCosts] = useState({});
  const mRec = useRef(null);
  const chnk = useRef([]);
  const tmr = useRef(null);
  const sseRef = useRef(null);

  // Fetch API token on mount (if not already set by Telegram Mini App embed)
  useEffect(() => {
    if (!__authToken) {
      fetch(`${API}/api/token`)
        .then(r => r.json())
        .then(d => {
          if (d.token) {
            __authToken = d.token;
            setToken(d.token);
          }
        })
        .catch(() => {});
    }
  }, []);

  // SSE — real-time event stream for instant updates
  useEffect(() => {
    const connect = () => {
      if (sseRef.current) sseRef.current.close();
      const es = new EventSource(`${API}/api/events`);
      sseRef.current = es;
      es.addEventListener("state_change", (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.cost) setCosts(prev => ({ ...prev, [d.repo_id]: d.cost }));
          load(); // Refresh data on state change
        } catch {}
      });
      es.addEventListener("log", (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.cost) setCosts(prev => ({ ...prev, [d.repo_id]: (prev[d.repo_id] || 0) + d.cost }));
        } catch {}
      });
      es.onerror = () => { es.close(); setTimeout(connect, 5000); };
    };
    connect();
    return () => { if (sseRef.current) sseRef.current.close(); };
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await f("/api/repos");
      if (r.ok) { const d = await r.json(); setRepos(d); if (!sr && d.length) setSR(d[0].id); }
      setCon(true);
    } catch(err) { console.warn("Server connection lost:", err.message); setCon(false); }
    if (!sr) return;
    try {
      const [a,b,c,d,e,g,h,hi] = await Promise.all([
        f(`/api/items?repo_id=${sr}`), f(`/api/plan?repo_id=${sr}`),
        f(`/api/logs?repo_id=${sr}`), f(`/api/agents?repo_id=${sr}`),
        f(`/api/memory?repo_id=${sr}`), f(`/api/mistakes?repo_id=${sr}`),
        f(`/api/audio?repo_id=${sr}`), f(`/api/history?repo_id=${sr}`),
      ]);
      if(a.ok) setItems(await a.json()); if(b.ok) setPlan(await b.json());
      if(c.ok) setLogs(await c.json()); if(d.ok) setAgents(await d.json());
      if(e.ok) setMemory(await e.json()); if(g.ok) setMistakes(await g.json());
      if(h.ok) setAudio(await h.json()); if(hi.ok) setHistory(await hi.json());
    } catch(err) { console.warn("Data fetch error:", err.message); }
  }, [sr]);

  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, [load]);

  const repo = repos.find(r => r.id === sr);
  const cs = repo?.state || "idle";
  const si = STATES[cs] || STATES.idle;
  const st = repo?.stats || {};

  const addItem = async () => {
    if (!ni.title || !ni.description || !sr) return;
    await f("/api/items", { method: "POST", body: JSON.stringify({ ...ni, repo_id: sr }) });
    setNI(p => ({ ...p, title: "", description: "" })); load();
  };
  const addRepo = async () => {
    if (!nr.name || !nr.path) return;
    await f("/api/repos", { method: "POST", body: JSON.stringify(nr) });
    setNR({ name: "", path: "", github_url: "", branch: "main" }); load();
  };
  const startRepo = async id => { await f("/api/start", { method: "POST", body: JSON.stringify({ repo_id: id }) }); load(); };
  const stopRepo = async id => { await f("/api/stop", { method: "POST", body: JSON.stringify({ repo_id: id }) }); load(); };
  const startAll = async () => { await f("/api/start", { method: "POST", body: JSON.stringify({ repo_id: "all" }) }); load(); };
  const pushGH = async () => { if(sr) await f("/api/push", { method: "POST", body: JSON.stringify({ repo_id: sr, message: "manual push" }) }); };

  const scanAll = async () => {
    setScanning(true);
    try { const r = await f("/api/health-scan"); if(r.ok) setHealthData(await r.json()); } catch {}
    setScanning(false);
  };
  const fixAll = async () => {
    setFixing(true);
    try { await f("/api/fix-all", { method: "POST", body: JSON.stringify({}) }); await scanAll(); } catch {}
    setFixing(false);
  };
  const sendChat = async () => {
    if (!chatMsg.trim()) return;
    const msg = chatMsg.trim();
    setChatHistory(h => [...h, { role: "user", content: msg, time: new Date().toLocaleTimeString() }]);
    setChatMsg(""); setChatLoading(true);
    try {
      const r = await f("/api/chat", { method: "POST", body: JSON.stringify({ message: msg }) });
      if (r.ok) {
        const d = await r.json();
        setChatHistory(h => [...h, { role: "assistant", content: d.message, time: new Date().toLocaleTimeString() }]);
      }
    } catch {}
    setChatLoading(false);
  };

  const startRecording = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const m = new MediaRecorder(s, { mimeType: "audio/webm" });
      chnk.current = [];
      m.ondataavailable = e => { if(e.data.size) chnk.current.push(e.data); };
      m.onstop = async () => {
        s.getTracks().forEach(t => t.stop());
        const b = new Blob(chnk.current, { type: "audio/webm" });
        const rd = new FileReader();
        rd.onload = async () => {
          await f("/api/audio", { method: "POST", body: JSON.stringify({ repo_id: sr, filename: `rec_${sr}_${Date.now()}.webm`, audio_data: rd.result.split(",")[1] }) });
          load();
        };
        rd.readAsDataURL(b);
      };
      m.start(); mRec.current = m; setRec(true); setRecTime(0);
      tmr.current = setInterval(() => setRecTime(t => t+1), 1000);
    } catch(e) { console.error(e); }
  };
  const stopRecording = () => {
    if(mRec.current?.state !== "inactive") mRec.current?.stop();
    setRec(false); clearInterval(tmr.current);
  };
  const uploadAudio = async e => {
    const file = e.target.files[0]; if(!file || !sr) return;
    const rd = new FileReader();
    rd.onload = async () => {
      await f("/api/audio", { method: "POST", body: JSON.stringify({ repo_id: sr, filename: file.name, audio_data: rd.result.split(",")[1] }) });
      load();
    };
    rd.readAsDataURL(file);
  };
  const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  const C = {
    orange: "#F7941D", teal: "#00B4D8", cream: "#FFF8E7", yellow: "#FFE066",
    sky: "#87CEEB", sand: "#F4D35E", red: "#E74C3C", green: "#2ECC71",
    darkBrown: "#3D2B1F", brown: "#5D4037", white: "#FFFFFF",
    lightOrange: "#FFD699", lightTeal: "#B2EBF2",
  };

  const Card = ({ children, bg = C.white, style, className, ...p }) => (
    <div className={`hover-card ${className||""}`} style={{ background: bg, border: `3px solid ${C.darkBrown}`, borderRadius: 12, padding: 16, boxShadow: "0 2px 4px rgba(0,0,0,.1), 0 4px 12px rgba(0,0,0,.08), 3px 3px 0 #3D2B1F", transition: "transform .2s ease, box-shadow .2s ease", ...style }} {...p}>{children}</div>
  );
  const Inp = ({ style, ...p }) => (
    <input style={{ width: "100%", padding: "10px 14px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, color: C.darkBrown, fontSize: 14, fontFamily: "'Fredoka', sans-serif", boxSizing: "border-box", outline: "none", transition: "border-color .2s, box-shadow .2s", ...style }} {...p} />
  );
  const Btn = ({ children, bg = C.orange, color = C.white, style, ...p }) => (
    <button className="hover-pop" style={{ padding: "12px 24px", background: bg, border: `3px solid ${C.darkBrown}`, borderRadius: 12, color, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: 1.5, boxShadow: "0 2px 4px rgba(0,0,0,.12), 3px 3px 0 #3D2B1F", transition: "transform .15s, filter .15s, box-shadow .15s", ...style }}
      onMouseDown={e => e.target.style.transform = "translate(2px,2px) scale(0.97)"}
      onMouseUp={e => e.target.style.transform = ""} onMouseOut={e => e.target.style.transform = ""} {...p}>{children}</button>
  );

  const SectionBg = ({ children, bg, style }) => (
    <div style={{ background: bg, padding: "28px 24px", ...style }}>{children}</div>
  );

  /* Circular health badge component */
  const HealthBadge = ({ score, size = 44 }) => {
    const sc = score >= 80 ? C.green : score >= 50 ? C.orange : C.red;
    const circ = Math.PI * 2 * 16;
    const pct = circ - (circ * score / 100);
    return (
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="16" fill="none" stroke={C.cream} strokeWidth="4" />
          <circle cx="20" cy="20" r="16" fill="none" stroke={sc} strokeWidth="4"
            strokeDasharray={circ} strokeDashoffset={pct}
            strokeLinecap="round" transform="rotate(-90 20 20)"
            style={{ transition: "stroke-dashoffset .6s ease" }} />
          <text x="20" y="22" fill={C.darkBrown} fontSize="9" fontWeight="700" textAnchor="middle" fontFamily="Bangers">{score}%</text>
        </svg>
      </div>
    );
  };

  /* Action type icons for history */
  const ActionIcon = ({ action }) => {
    const icons = {
      git_commit: { icon: "\uD83D\uDCDD", bg: C.teal },
      rollback: { icon: "\u23EA", bg: C.red },
      execute_step: { icon: "\u26A1", bg: C.orange },
      test_step: { icon: "\uD83E\uDDEA", bg: "#9B59B6" },
      update_plan: { icon: "\uD83D\uDDFA\uFE0F", bg: C.teal },
      do_refactor: { icon: "\uD83D\uDD27", bg: "#FF6B6B" },
      scan_repo: { icon: "\uD83D\uDD0D", bg: C.green },
      final_optimize: { icon: "\u2728", bg: "#4ECDC4" },
    };
    const info = icons[action] || { icon: "\uD83D\uDD04", bg: C.brown };
    return (
      <div style={{ width: 36, height: 36, borderRadius: "50%", background: info.bg, border: `2px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, boxShadow: "0 2px 4px rgba(0,0,0,.15)" }}>
        {info.icon}
      </div>
    );
  };

  const TABS = [
    { id: "home", label: "🏠 Town Square" },
    { id: "master", label: "🌐 View All" },
    { id: "flow", label: "🗺️ Road Map" },
    { id: "items", label: "📋 Bounty Board" },
    { id: "plan", label: "⚡ Build Plan" },
    { id: "audio", label: "🎙️ Voice Review" },
    { id: "agents", label: "🤠 The Crew" },
    { id: "memory", label: "🧠 Memory" },
    { id: "mistakes", label: "💀 Mistakes" },
    { id: "logs", label: "📜 Logs" },
    { id: "history", label: "⏪ History" },
    { id: "health", label: "🔍 Health Check" },
    { id: "settings", label: "⚙️ Settings" },
  ];

  return (
    <div style={{ fontFamily: "'Fredoka', 'Comic Sans MS', cursive, sans-serif", background: C.sky, color: C.darkBrown, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bangers&family=Fredoka:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:8px} ::-webkit-scrollbar-thumb{background:${C.orange};border-radius:4px;border:2px solid ${C.darkBrown}}
        ::-webkit-scrollbar-track{background:rgba(0,0,0,.05);border-radius:4px}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}
        @keyframes rec{0%,100%{opacity:1}50%{opacity:.2}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes sway{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(2deg)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
        @keyframes sunPulse{0%,100%{filter:drop-shadow(0 0 8px #FFE066)}50%{filter:drop-shadow(0 0 20px #FFE066)}}
        @keyframes tumble{0%{transform:translateX(-40px) rotate(0)}100%{transform:translateX(calc(100vw + 40px)) rotate(720deg)}}
        @keyframes sparkle{0%,100%{opacity:0;transform:scale(0)}50%{opacity:1;transform:scale(1)}}
        @keyframes cloudDrift{0%{transform:translateX(-200px)}100%{transform:translateX(calc(100vw + 200px))}}
        @keyframes glowPulse{0%,100%{box-shadow:0 0 8px rgba(247,148,29,0.3)}50%{box-shadow:0 0 20px rgba(247,148,29,0.7)}}
        @keyframes tiltIn{from{opacity:0;transform:rotate(-1deg) translateY(8px)}to{opacity:1;transform:rotate(0) translateY(0)}}
        @keyframes nodeGlow{0%,100%{filter:drop-shadow(0 0 4px rgba(247,148,29,0.4))}50%{filter:drop-shadow(0 0 12px rgba(247,148,29,0.8))}}
        textarea,select{font-family:'Fredoka',sans-serif}
        select option{background:${C.cream};color:${C.darkBrown}}
        @media(max-width:700px){.cactus-right{display:none!important}}
        .hover-card:hover{transform:translateY(-2px)!important;box-shadow:0 4px 8px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.1), 4px 4px 0 #3D2B1F!important}
        .hover-lift:hover{transform:translateY(-4px) scale(1.02)!important;box-shadow:0 6px 16px rgba(0,0,0,.12), 6px 6px 0 #3D2B1F!important}
        .hover-glow:hover{box-shadow:0 0 12px rgba(247,148,29,0.4), 0 4px 12px rgba(0,0,0,.08), 4px 4px 0 #3D2B1F!important;transform:translateY(-2px)!important}
        .hover-pop:hover{transform:scale(1.05)!important;filter:brightness(1.1)}
        .nav-tab:hover{background:rgba(255,255,255,0.2)!important}
        .stat-card:hover{transform:translateY(-3px)!important;box-shadow:0 4px 12px rgba(0,0,0,.1), 5px 5px 0 #3D2B1F!important}
        .bounty-poster{animation:tiltIn .3s ease;transition:transform .2s ease,box-shadow .2s ease}
        .bounty-poster:hover{transform:translateY(-3px) rotate(-0.5deg)!important;box-shadow:0 6px 20px rgba(0,0,0,.15), 4px 4px 0 #3D2B1F!important}
        .timeline-entry{position:relative;padding-left:54px;margin-bottom:16px}
        .timeline-entry::before{content:'';position:absolute;left:17px;top:40px;bottom:-16px;width:2px;background:${C.darkBrown};opacity:0.25}
        .timeline-entry:last-child::before{display:none}
        input:focus{border-color:${C.orange}!important;box-shadow:0 0 0 3px rgba(247,148,29,0.2)!important}
        textarea:focus{border-color:${C.orange}!important;box-shadow:0 0 0 3px rgba(247,148,29,0.2)!important}
      `}</style>

      {/* ═══ HEADER — Desert Banner ═══ */}
      <div style={{ background: `linear-gradient(180deg, ${C.orange} 0%, #F4D35E 70%, ${C.sand} 100%)`, padding: "18px 20px 14px", textAlign: "center", borderBottom: `4px solid ${C.darkBrown}`, position: "relative", overflow: "hidden", minHeight: 110 }}>

        {/* Desert hills */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 30, zIndex: 0 }}>
          <svg width="100%" height="30" viewBox="0 0 800 30" preserveAspectRatio="none" style={{ position: "absolute", bottom: 0 }}>
            <path d="M0,25 Q200,5 400,20 Q600,5 800,22 L800,30 L0,30Z" fill="#F4D35E" opacity="0.6" />
          </svg>
        </div>

        {/* Cactus Left — simple saguaro */}
        <div style={{ position: "absolute", bottom: 0, left: "8%", zIndex: 1, animation: "sway 5s ease-in-out infinite", transformOrigin: "bottom center" }}>
          <svg width="40" height="70" viewBox="0 0 40 70">
            <rect x="15" y="8" width="10" height="62" rx="5" fill="#2D8B46" stroke="#1a5c2e" strokeWidth="1.5" />
            <path d="M15,30 Q4,30 4,18" fill="none" stroke="#2D8B46" strokeWidth="8" strokeLinecap="round" />
            <path d="M25,22 Q36,22 36,12" fill="none" stroke="#2D8B46" strokeWidth="7" strokeLinecap="round" />
            <circle cx="20" cy="10" r="5" fill="#2D8B46" stroke="#1a5c2e" strokeWidth="1" />
          </svg>
        </div>

        {/* Cactus Right — only on wide screens */}
        <div className="cactus-right" style={{ position: "absolute", bottom: 0, right: "8%", zIndex: 1, animation: "sway 6s ease-in-out infinite", animationDelay: "1s", transformOrigin: "bottom center" }}>
          <svg width="35" height="60" viewBox="0 0 35 60">
            <rect x="12" y="5" width="10" height="55" rx="5" fill="#228B3E" stroke="#145c27" strokeWidth="1.5" />
            <path d="M12,25 Q2,25 2,15" fill="none" stroke="#228B3E" strokeWidth="7" strokeLinecap="round" />
            <path d="M22,18 Q32,18 32,10" fill="none" stroke="#228B3E" strokeWidth="6" strokeLinecap="round" />
            <circle cx="17" cy="7" r="5" fill="#228B3E" stroke="#145c27" strokeWidth="1" />
          </svg>
        </div>

        {/* Small barrel cactus */}
        <div style={{ position: "absolute", bottom: 2, right: "25%", zIndex: 1, animation: "float 4s ease-in-out infinite" }}>
          <svg width="18" height="22" viewBox="0 0 18 22">
            <ellipse cx="9" cy="13" rx="8" ry="9" fill="#3BA55C" stroke="#1a5c2e" strokeWidth="1" />
            <circle cx="9" cy="5" r="2.5" fill="#FF6B9D" stroke="#c94070" strokeWidth="0.6" />
          </svg>
        </div>

        {/* Title */}
        <div style={{ position: "relative", zIndex: 2 }}>
          <h1 style={{ fontFamily: "'Bangers', cursive", fontSize: 48, letterSpacing: 5, color: C.white, textShadow: `3px 3px 0 ${C.darkBrown}, -1px -1px 0 ${C.darkBrown}, 1px -1px 0 ${C.darkBrown}, -1px 1px 0 ${C.darkBrown}`, margin: 0 }}>
            SWARM TOWN
          </h1>
          <p style={{ fontFamily: "'Bangers', cursive", fontSize: 16, color: C.cream, letterSpacing: 3, textShadow: `1px 1px 0 ${C.darkBrown}`, marginTop: 2 }}>
            AUTONOMOUS MULTI-AGENT ORCHESTRATOR
          </p>
        </div>

        {/* Status pill + Global repo selector */}
        <div style={{ position: "absolute", top: 12, right: 16, display: "flex", alignItems: "center", gap: 8, zIndex: 3 }}>
          {repos.length > 0 && <select value={sr||""} onChange={e => setSR(Number(e.target.value))}
            style={{ padding: "5px 10px", background: C.yellow, border: `3px solid ${C.darkBrown}`, borderRadius: 12, fontSize: 13, fontFamily: "'Bangers', cursive", fontWeight: 700, letterSpacing: 1, color: C.darkBrown, outline: "none", cursor: "pointer", maxWidth: 180 }}>
            {repos.map(r => <option key={r.id} value={r.id}>{r.name} [{r.state || "idle"}]</option>)}
          </select>}
          {Object.keys(costs).length > 0 && (
            <div style={{ background: "#E8F5E9", border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#2E7D32" }}>
              ${Object.values(costs).reduce((a,b) => a+b, 0).toFixed(2)}
            </div>
          )}
          <div style={{ background: connected ? C.green : C.red, border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: C.white, animation: connected ? "none" : "pulse 1s infinite" }}>
            {connected ? "● LIVE" : "● OFFLINE"}
          </div>
        </div>
      </div>

      {/* ═══ NAV TABS ═══ */}
      <div style={{ background: C.orange, display: "flex", overflow: "auto", borderBottom: `3px solid ${C.darkBrown}`, gap: 0 }}>
        {TABS.map(t => (
          <button key={t.id} className={tab !== t.id ? "nav-tab" : ""} onClick={() => setTab(t.id)} style={{
            padding: "10px 16px", background: tab === t.id ? C.cream : "transparent",
            border: "none", borderRight: `2px solid ${C.darkBrown}`,
            borderBottom: tab === t.id ? `3px solid ${C.cream}` : "none",
            color: tab === t.id ? C.darkBrown : C.white, cursor: "pointer",
            fontSize: 13, fontFamily: "'Bangers', cursive", letterSpacing: 1.5,
            whiteSpace: "nowrap", fontWeight: 700, transition: "background 0.2s, transform 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* ═══ CONNECTION BANNER ═══ */}
      {!connected && (
        <div style={{ background: "linear-gradient(90deg, #E74C3C 0%, #C0392B 100%)", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, borderBottom: `3px solid ${C.darkBrown}` }}>
          <span style={{ fontSize: 18, animation: "pulse 1.5s infinite" }}>⚠️</span>
          <span style={{ color: C.white, fontWeight: 700, fontSize: 14, fontFamily: "'Bangers', cursive", letterSpacing: 1 }}>
            Connection lost — retrying every 3 seconds...
          </span>
          <button onClick={load} style={{ background: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers', cursive" }}>
            Retry Now
          </button>
        </div>
      )}

      {/* ═══ CONTENT ═══ */}
      <div style={{ maxHeight: `calc(100vh - ${connected ? 150 : 192}px)`, overflow: "auto" }}>

        {/* ── HOME / TOWN SQUARE ── */}
        {tab === "home" && (<>
          {/* START ALL banner */}
          <SectionBg bg={`linear-gradient(180deg, ${C.cream} 0%, #F5E6C8 100%)`}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <Btn onClick={startAll} bg={C.green} style={{ fontSize: 24, padding: "16px 48px", animation: repos.some(r=>r.running) ? "none" : "wiggle 2s infinite" }}>
                {"\uD83D\uDE80"} START ALL REPOS
              </Btn>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
              {[
                { emoji: "\uD83D\uDCE6", label: "Repos", val: repos.length, bg: C.lightOrange },
                { emoji: "\u26A1", label: "Running", val: repos.filter(r=>r.running).length, bg: C.lightTeal },
                { emoji: "\uD83D\uDCCB", label: "Items", val: repos.reduce((s,r)=>(s+(r.stats?.items_total||0)),0), bg: C.yellow },
                { emoji: "\u2705", label: "Done", val: repos.reduce((s,r)=>(s+(r.stats?.items_done||0)),0), bg: C.lightTeal },
                { emoji: "\uD83E\uDD20", label: "Agents", val: repos.reduce((s,r)=>(s+(r.stats?.agents||0)),0), bg: C.lightOrange },
              ].map((s,i) => (
                <div key={i} className="stat-card" style={{ background: `linear-gradient(135deg, ${s.bg} 0%, ${s.bg}ee 100%)`, border: `3px solid ${C.darkBrown}`, borderRadius: 14, padding: "12px 20px", textAlign: "center", boxShadow: "0 2px 4px rgba(0,0,0,.1), 3px 3px 0 #3D2B1F", minWidth: 95, transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }}>
                  <div style={{ fontSize: 26 }}>{s.emoji}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 32, letterSpacing: 1, lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.brown, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </SectionBg>

          {/* REPO CARDS */}
          <SectionBg bg={`linear-gradient(180deg, ${C.teal} 0%, #009BB8 100%)`} style={{ borderTop: `3px solid ${C.darkBrown}` }}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", color: C.white, textShadow: `2px 2px 0 ${C.darkBrown}`, marginBottom: 20, letterSpacing: 4 }}>
              YOUR REPOS
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {repos.map(r => {
                const rst = STATES[r.state] || STATES.idle;
                const s = r.stats || {};
                const pctSteps = s.steps_total ? Math.round(s.steps_done/s.steps_total*100) : 0;
                const hd = healthData.find(h => h.repo_id === r.id);
                return (
                  <Card key={r.id} bg={sr === r.id ? C.yellow : C.white}
                    className="hover-lift"
                    style={{
                      cursor: "pointer", transition: "transform .2s, box-shadow .2s", position: "relative", overflow: "hidden",
                      backgroundImage: sr === r.id
                        ? `linear-gradient(135deg, ${C.yellow} 0%, #FFD54F 100%)`
                        : `linear-gradient(135deg, #FFFFFF 0%, #FDFAF2 100%)`,
                    }}
                    onClick={() => { setSR(r.id); setTab("flow"); }}>
                    {/* Subtle card texture */}
                    <div style={{ position: "absolute", inset: 0, opacity: 0.025, backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 20.5V18H0v-2h20v-2H0v-2h20v-2H0V8h20V6H0V4h20V2H0V0h22v20h2V0h2v20h2V0h2v20h2V0h2v20h2V0h2v20.5' fill='%233D2B1F' fill-opacity='.4' fill-rule='evenodd'/%3E%3C/svg%3E\")", pointerEvents: "none" }} />

                    {/* Running indicator */}
                    {r.running && <div style={{ position: "absolute", top: -1, right: -1, background: `linear-gradient(135deg, ${C.green}, #27ae60)`, border: `2px solid ${C.darkBrown}`, borderRadius: "0 10px 0 10px", padding: "4px 12px", fontSize: 10, fontWeight: 700, color: C.white, letterSpacing: 1, fontFamily: "'Bangers', cursive" }}>RUNNING</div>}

                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, position: "relative" }}>
                      <div style={{ width: 48, height: 48, borderRadius: "50%", background: `linear-gradient(135deg, ${rst.color}, ${rst.color}dd)`, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, transition: "transform 0.3s ease, background 0.3s ease", animation: r.running ? "bounce 2s cubic-bezier(0.4,0,0.2,1) infinite" : "none", boxShadow: `0 2px 8px ${rst.color}44` }}>
                        {rst.emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 22, letterSpacing: 1.5, lineHeight: 1.1 }}>{r.name}</div>
                        <div style={{ fontSize: 10, color: C.brown, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>{r.path}</div>
                      </div>
                      {/* Circular health badge */}
                      {hd && <HealthBadge score={hd.health_score} />}
                    </div>

                    {/* Stats grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                      {[
                        { l: "Items", v: `${s.items_done||0}/${s.items_total||0}`, bg: C.lightOrange },
                        { l: "Steps", v: `${s.steps_done||0}/${s.steps_total||0}`, bg: C.lightTeal },
                        { l: "Agents", v: s.agents||0, bg: C.yellow },
                        { l: "Cycles", v: r.cycle_count||0, bg: C.cream },
                        { l: "Cost", v: `$${(costs[r.id]||0).toFixed(2)}`, bg: "#E8F5E9" },
                      ].map((x,i) => (
                        <div key={i} style={{ background: x.bg, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 6px", textAlign: "center" }}>
                          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, lineHeight: 1 }}>{x.v}</div>
                          <div style={{ fontSize: 9, color: C.brown, fontWeight: 600 }}>{x.l}</div>
                        </div>
                      ))}
                    </div>

                    {/* Progress bar */}
                    <div style={{ background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 8, height: 16, overflow: "hidden", marginBottom: 10, position: "relative" }}>
                      <div style={{ height: "100%", borderRadius: 6, background: `linear-gradient(90deg, ${C.green}, ${C.teal})`, width: `${pctSteps}%`, transition: "width .5s" }} />
                      {s.steps_total > 0 && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: C.darkBrown, fontFamily: "'Bangers', cursive", letterSpacing: 1 }}>{pctSteps}%</div>}
                    </div>

                    {/* Action buttons + state label */}
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {r.running
                        ? <Btn bg={C.red} onClick={e => { e.stopPropagation(); stopRepo(r.id); }} style={{ fontSize: 12, padding: "6px 14px" }}>{"\u23F9"} Stop</Btn>
                        : <Btn bg={C.green} onClick={e => { e.stopPropagation(); startRepo(r.id); }} style={{ fontSize: 12, padding: "6px 14px" }}>{"\u25B6"} Start</Btn>}
                      <div style={{ fontSize: 12, color: C.brown, display: "flex", alignItems: "center", gap: 4, flex: 1, fontWeight: 500 }}>
                        {rst.emoji} {rst.label}
                      </div>
                    </div>
                  </Card>
                );
              })}

              {/* Add repo card */}
              <Card bg={C.cream} style={{ border: `3px dashed ${C.brown}` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, marginBottom: 8, letterSpacing: 1.5 }}>+ Add New Repo</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
                  <Inp placeholder="Name" value={nr.name} onChange={e => setNR(p=>({...p,name:e.target.value}))} style={{ fontSize: 12, padding: "8px 10px" }} />
                  <Inp placeholder="Path" value={nr.path} onChange={e => setNR(p=>({...p,path:e.target.value}))} style={{ fontSize: 12, padding: "8px 10px" }} />
                  <Inp placeholder="GitHub URL" value={nr.github_url} onChange={e => setNR(p=>({...p,github_url:e.target.value}))} style={{ fontSize: 12, padding: "8px 10px" }} />
                  <Inp placeholder="Branch" value={nr.branch} onChange={e => setNR(p=>({...p,branch:e.target.value}))} style={{ fontSize: 12, padding: "8px 10px" }} />
                </div>
                <Btn onClick={addRepo} bg={C.teal} style={{ fontSize: 13, padding: "7px 16px" }}>Add to Town</Btn>
              </Card>
            </div>
          </SectionBg>

          {/* Recent activity */}
          <SectionBg bg={`linear-gradient(180deg, ${C.yellow} 0%, #F5D94E 100%)`} style={{ borderTop: `3px solid ${C.darkBrown}` }}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 28, textAlign: "center", marginBottom: 14, letterSpacing: 2.5 }}>Recent Activity</h2>
            <div style={{ maxWidth: 700, margin: "0 auto" }}>
              {logs.slice(0, 8).map(l => (
                <div key={l.id} style={{ display: "flex", gap: 8, padding: "6px 12px", background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 10, marginBottom: 5, fontSize: 12, transition: "transform .15s", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                  <span style={{ color: C.brown, fontSize: 10, minWidth: 90 }}>{l.created_at}</span>
                  <span style={{ fontWeight: 700, color: STATES[l.state]?.color || C.brown, minWidth: 80 }}>{l.state}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.action}</span>
                  {l.error && <span style={{ color: C.red, fontSize: 10 }}>{"\u26A0"} {l.error.slice(0,30)}</span>}
                </div>
              ))}
              {logs.length === 0 && (
                <Card style={{ textAlign: "center", padding: 30, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{"\uD83C\uDFDC\uFE0F"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 4 }}>Quiet as a desert breeze</div>
                  <div style={{ fontSize: 12, color: C.brown }}>Start some repos to see activity roll in!</div>
                </Card>
              )}
            </div>
          </SectionBg>
        </>)}

        {/* ── MASTER / VIEW ALL ── */}
        {tab === "master" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.cream} 0%, #F0E2CA 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>All Repos -- Master View</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 20 }}>Bird's-eye view of every repo in your swarm</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {repos.map(r => {
                const rst = STATES[r.state] || STATES.idle;
                const s = r.stats || {};
                const pct = s.steps_total ? Math.round(s.steps_done / s.steps_total * 100) : 0;
                return (
                  <Card key={r.id} className="hover-lift" bg={C.white} style={{ cursor: "pointer", transition: "transform .2s, box-shadow .2s", background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}
                    onClick={() => { setSR(r.id); setTab("flow"); }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                      <div style={{ width: 42, height: 42, borderRadius: "50%", background: `linear-gradient(135deg, ${rst.color}, ${rst.color}dd)`, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, animation: r.running ? "bounce 2s cubic-bezier(0.4,0,0.2,1) infinite" : "none", boxShadow: `0 2px 8px ${rst.color}44` }}>
                        {rst.emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, lineHeight: 1.1 }}>{r.name}</div>
                        <div style={{ fontSize: 12, color: C.brown, fontWeight: 500 }}>{rst.label} {r.running ? "-- RUNNING" : ""}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, color: pct === 100 ? C.green : C.orange, lineHeight: 1 }}>{pct}%</div>
                        <div style={{ fontSize: 9, color: C.brown }}>complete</div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 8, height: 14, overflow: "hidden", marginBottom: 10, position: "relative" }}>
                      <div style={{ height: "100%", borderRadius: 6, background: `linear-gradient(90deg, ${C.green}, ${C.teal})`, width: `${pct}%`, transition: "width .5s" }} />
                    </div>
                    {/* Stats row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[
                        { l: "Items", v: `${s.items_done||0}/${s.items_total||0}` },
                        { l: "Steps", v: `${s.steps_done||0}/${s.steps_total||0}` },
                        { l: "Cycles", v: r.cycle_count||0 },
                      ].map((x, i) => (
                        <div key={i} style={{ textAlign: "center", fontSize: 11 }}>
                          <div style={{ fontWeight: 700 }}>{x.v}</div>
                          <div style={{ fontSize: 9, color: C.brown }}>{x.l}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </SectionBg>
        )}

        {/* ── FLOW / ROAD MAP ── */}
        {tab === "flow" && (() => {
          const stepsDone = st.steps_done || 0;
          const stepsTotal = st.steps_total || 0;
          const itemsPending = items.filter(it => it.status !== "completed").length;
          const nodeColors = {
            action: { color: "#FF6B6B", label: "Action (doing work)" },
            decision: { color: "#FFB347", label: "Decision (checking)" },
            rest: { color: "#4ECDC4", label: "Idle / Optimize" },
            error: { color: "#E74C3C", label: "Error / Blocked" },
          };
          return (
          <SectionBg bg={`linear-gradient(180deg, ${C.cream} 0%, #F5E6C8 50%, #EDD9B3 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 4, letterSpacing: 3, textShadow: `2px 2px 0 rgba(61,43,31,0.15)` }}>
              {repo?.name || "Select a Repo"} -- Road Map
            </h2>
            <p style={{ textAlign: "center", fontSize: 15, color: C.brown, marginBottom: 16 }}>{si.emoji} {si.desc}</p>

            {/* Status Panel */}
            <Card bg={C.white} style={{ maxWidth: 680, margin: "0 auto 16px", padding: "14px 20px", background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: si.color, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, animation: repo?.running ? "bounce 2s cubic-bezier(0.4,0,0.2,1) infinite" : "none", boxShadow: `0 0 12px ${si.color}44` }}>
                    {si.emoji}
                  </div>
                  <div>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 22, letterSpacing: 1.5, lineHeight: 1.1 }}>{si.label}</div>
                    <div style={{ fontSize: 12, color: C.brown }}>{si.desc}</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  {[
                    { label: "Items Pending", val: itemsPending, bg: itemsPending > 0 ? C.orange : C.green },
                    { label: "Steps Done", val: `${stepsDone}/${stepsTotal}`, bg: C.teal },
                    { label: "Cycles", val: repo?.cycle_count || 0, bg: C.brown },
                  ].map((s, i) => (
                    <div key={i} style={{ textAlign: "center" }}>
                      <div style={{ fontFamily: "'Bangers', cursive", fontSize: 24, color: s.bg, lineHeight: 1 }}>{s.val}</div>
                      <div style={{ fontSize: 10, color: C.brown, fontWeight: 600, letterSpacing: 0.5 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            {/* Action buttons */}
            <div style={{ textAlign: "center", marginBottom: 16, display: "flex", justifyContent: "center", gap: 10 }}>
              {repo && !repo.running && <Btn bg={C.green} onClick={() => startRepo(sr)} style={{ padding: "10px 20px", fontSize: 16 }}>&#9654; Start</Btn>}
              {repo?.running && <Btn bg={C.red} onClick={() => stopRepo(sr)} style={{ padding: "10px 20px", fontSize: 16 }}>&#9209; Stop</Btn>}
              <Btn bg={C.teal} onClick={pushGH} style={{ padding: "10px 20px", fontSize: 16 }}>&uarr; Push Git</Btn>
            </div>

            {/* Flowchart */}
            <Card bg="transparent" style={{ maxWidth: 680, margin: "0 auto 16px", padding: 0, border: "none", boxShadow: "none", background: "none" }}>
              <div style={{ background: `linear-gradient(180deg, #F5E0B8 0%, #EDDCBE 40%, #E8D4AE 100%)`, border: `3px solid ${C.darkBrown}`, borderRadius: 12, padding: "20px 16px", boxShadow: "inset 0 2px 8px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.1), 0 4px 12px rgba(0,0,0,.08), 3px 3px 0 #3D2B1F", position: "relative", overflow: "hidden" }}>
                {/* Parchment texture overlay */}
                <div style={{ position: "absolute", inset: 0, opacity: 0.04, backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%233D2B1F' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")", pointerEvents: "none" }} />
                <svg viewBox="0 0 570 500" style={{ width: "100%", position: "relative", zIndex: 1 }}>
                  <defs>
                    <marker id="ah" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><path d="M0,0 L7,2.5 L0,5" fill={C.brown}/></marker>
                    <marker id="ahA" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><path d="M0,0 L7,2.5 L0,5" fill={C.orange}/></marker>
                    <filter id="nodeGlow">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                      <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                    <filter id="activeGlow">
                      <feGaussianBlur stdDeviation="4" result="blur"/>
                      <feFlood floodColor={si.color} floodOpacity="0.5" result="color"/>
                      <feComposite in="color" in2="blur" operator="in" result="shadow"/>
                      <feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>
                  {FLOW_EDGES.map(([from,to,path,label],i) => {
                    const active = from === cs;
                    return (<g key={i}>
                      <path d={path} fill="none" stroke={active ? C.orange : "rgba(93,64,55,0.3)"} strokeWidth={active ? 3 : 1.5} markerEnd={active ? "url(#ahA)" : "url(#ah)"} style={active ? { filter: "drop-shadow(0 0 3px rgba(247,148,29,0.4))" } : {}} />
                      {label && (() => { const pts = path.split(/[ML ]+/).filter(Boolean).map(p=>p.split(",").map(Number)); if(pts.length>=2) return <text x={(pts[0][0]+pts[1][0])/2} y={(pts[0][1]+pts[1][1])/2-5} fill={active ? C.orange : C.brown} fontSize="9" textAnchor="middle" fontFamily="Fredoka" fontWeight="700"><tspan style={{ background: "#F5E0B8" }}>{label}</tspan></text>; })()}
                    </g>);
                  })}
                  {FLOW_NODES.map(n => {
                    const active = n.id === cs;
                    const info = STATES[n.id] || {};
                    const isDecision = !!n.dec;
                    return (<g key={n.id} style={active ? { filter: "url(#activeGlow)" } : {}}>
                      {/* Signpost effect: small post below action nodes */}
                      {!isDecision && <rect x={n.x+n.w/2-3} y={n.y+n.h-2} width={6} height={6} rx={1} fill={active ? info.color : "#D4C5A9"} stroke={active ? C.darkBrown : "#bbb"} strokeWidth={1} />}
                      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={isDecision ? 4 : 10}
                        fill={active ? info.color : "#FAF0D7"}
                        stroke={active ? C.darkBrown : "#C4B896"} strokeWidth={active ? 3 : 1.5}
                        strokeDasharray={isDecision ? "5,3" : undefined} />
                      {/* More prominent glow for active node */}
                      {active && <>
                        <rect x={n.x-3} y={n.y-3} width={n.w+6} height={n.h+6} rx={isDecision?6:13}
                          fill="none" stroke={info.color} strokeWidth={2.5} opacity={.6}>
                          <animate attributeName="opacity" values=".8;.15;.8" dur="1.2s" repeatCount="indefinite"/>
                        </rect>
                        <rect x={n.x-6} y={n.y-6} width={n.w+12} height={n.h+12} rx={isDecision?8:16}
                          fill="none" stroke={info.color} strokeWidth={1.5} opacity={.3}>
                          <animate attributeName="opacity" values=".4;.05;.4" dur="1.8s" repeatCount="indefinite"/>
                        </rect>
                      </>}
                      <text x={n.x+n.w/2} y={n.y+15} fill={active ? C.white : C.brown} fontSize="12" textAnchor="middle" fontFamily="Fredoka">{info.emoji}</text>
                      <text x={n.x+n.w/2} y={n.y+29} fill={active ? C.white : C.darkBrown} fontSize="9" textAnchor="middle" fontFamily="Fredoka" fontWeight={active?"700":"500"}>{info.label}</text>
                    </g>);
                  })}
                </svg>
              </div>
            </Card>

            {/* Legend + Current State Info */}
            <div style={{ maxWidth: 680, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Legend */}
              <Card bg={C.white} style={{ padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, color: C.darkBrown }}>Map Legend</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {Object.entries(nodeColors).map(([key, val]) => (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 18, height: 12, borderRadius: key === "decision" ? 2 : 6, background: val.color, border: `1.5px solid ${C.darkBrown}`, flexShrink: 0, ...(key === "decision" ? { borderStyle: "dashed" } : {}) }} />
                      <span style={{ fontSize: 11, color: C.brown, fontWeight: 500 }}>{val.label}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                    <div style={{ width: 18, height: 12, borderRadius: 6, background: si.color, border: `2px solid ${C.darkBrown}`, flexShrink: 0, boxShadow: `0 0 6px ${si.color}66` }} />
                    <span style={{ fontSize: 11, color: C.brown, fontWeight: 600 }}>Currently Active (glowing)</span>
                  </div>
                </div>
              </Card>

              {/* Current State Detail */}
              <Card bg={C.white} style={{ padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, color: C.darkBrown }}>Current State</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: si.color, border: `2px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{si.emoji}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{si.label}</div>
                    <div style={{ fontSize: 11, color: C.brown }}>{si.desc}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.brown, lineHeight: 1.6 }}>
                  {repo?.running ? (
                    <span style={{ color: C.green, fontWeight: 600 }}>Orchestrator is running -- agents are active and processing.</span>
                  ) : (
                    <span style={{ color: C.orange, fontWeight: 600 }}>Orchestrator is paused. Hit Start to kick things off!</span>
                  )}
                  {stepsTotal > 0 && <div style={{ marginTop: 4 }}>Progress: {stepsDone} of {stepsTotal} steps complete ({stepsTotal > 0 ? Math.round(stepsDone/stepsTotal*100) : 0}%)</div>}
                </div>
              </Card>
            </div>
          </SectionBg>
          );
        })()}

        {/* ── BOUNTY BOARD (Issues + Features) ── */}
        {tab === "items" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.cream} 0%, #F0E2CA 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.12)" }}>Bounty Board</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 16 }}>Post features and issues for the swarm to wrangle</p>
            <Card bg={C.yellow} style={{ maxWidth: 620, margin: "0 auto 20px", background: `linear-gradient(135deg, ${C.yellow} 0%, #FFD54F 100%)` }}>
              <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 }}>Post a Bounty</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <select value={ni.type} onChange={e => setNI(p=>({...p,type:e.target.value}))}
                  style={{ padding: "10px 14px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, fontSize: 13, fontFamily: "'Fredoka',sans-serif", fontWeight: 600, outline: "none", cursor: "pointer" }}>
                  <option value="feature">{"\uD83C\uDF1F"} Feature</option><option value="issue">{"\uD83D\uDC1B"} Issue</option>
                </select>
                <select value={ni.priority} onChange={e => setNI(p=>({...p,priority:e.target.value}))}
                  style={{ padding: "10px 14px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, fontSize: 13, fontFamily: "'Fredoka',sans-serif", fontWeight: 600, outline: "none", cursor: "pointer" }}>
                  {["low","medium","high","critical"].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                </select>
              </div>
              <Inp placeholder="Bounty title..." value={ni.title} onChange={e => setNI(p=>({...p,title:e.target.value}))} style={{ marginBottom: 8 }} />
              <textarea placeholder="Describe the bounty in detail..." value={ni.description} onChange={e => setNI(p=>({...p,description:e.target.value}))}
                style={{ width: "100%", padding: "10px 14px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, color: C.darkBrown, fontSize: 14, fontFamily: "'Fredoka',sans-serif", minHeight: 70, resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
              <Btn onClick={addItem} style={{ fontSize: 16, padding: "12px 28px" }}>Post {ni.type === "issue" ? "\uD83D\uDC1B" : "\uD83C\uDF1F"} Bounty</Btn>
            </Card>
            <div style={{ maxWidth: 620, margin: "0 auto" }}>
              {items.length === 0 ? (
                <Card bg={C.white} style={{ textAlign: "center", padding: 40 }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{"\uD83C\uDFDC\uFE0F"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 }}>The board's empty, partner</div>
                  <div style={{ fontSize: 13, color: C.brown }}>Post a bounty above to get the swarm working!</div>
                </Card>
              ) :
                items.map((it, idx) => {
                  const prioConfig = {
                    critical: { bg: C.red, icon: "\uD83D\uDD34", label: "CRITICAL", size: 13 },
                    high: { bg: C.orange, icon: "\uD83D\uDFE0", label: "HIGH", size: 12 },
                    medium: { bg: C.teal, icon: "\uD83D\uDD35", label: "MEDIUM", size: 11 },
                    low: { bg: "#A0ADB5", icon: "\u26AA", label: "LOW", size: 11 },
                  }[it.priority] || { bg: "#ccc", icon: "", label: it.priority, size: 11 };
                  return (
                    <div key={it.id} className="bounty-poster" style={{
                      background: it.status === "completed"
                        ? `linear-gradient(135deg, ${C.lightTeal} 0%, #D4F4E8 100%)`
                        : `linear-gradient(135deg, #FFF8E7 0%, #F5E6C8 100%)`,
                      border: `3px solid ${C.darkBrown}`,
                      borderRadius: 12,
                      padding: "14px 16px",
                      marginBottom: 10,
                      boxShadow: "0 2px 4px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.06), 3px 3px 0 #3D2B1F",
                      position: "relative",
                      transform: idx % 3 === 1 ? "rotate(0.3deg)" : idx % 3 === 2 ? "rotate(-0.3deg)" : "none",
                    }}>
                      {/* Priority ribbon */}
                      <div style={{ position: "absolute", top: -1, right: 12, background: prioConfig.bg, color: C.white, fontFamily: "'Bangers', cursive", fontSize: prioConfig.size, fontWeight: 700, letterSpacing: 1.5, padding: "4px 12px 6px", borderRadius: "0 0 8px 8px", border: `2px solid ${C.darkBrown}`, borderTop: "none", boxShadow: "0 2px 4px rgba(0,0,0,.15)" }}>
                        {prioConfig.icon} {prioConfig.label}
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, paddingRight: 80 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: it.type === "issue" ? "#FFE0E0" : "#FFF3CD", border: `2px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                          {it.type==="issue" ? "\uD83D\uDC1B" : "\uD83C\uDF1F"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 17, letterSpacing: 1, marginBottom: 2, lineHeight: 1.2 }}>{it.title}</div>
                          <div style={{ fontSize: 12, color: C.brown, lineHeight: 1.4 }}>{it.description}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                        <div style={{ background: it.status==="completed" ? C.green : it.status==="in_progress" ? C.orange : "rgba(93,64,55,0.2)", border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "3px 12px", fontSize: 11, fontWeight: 700, color: it.status==="completed" || it.status==="in_progress" ? C.white : C.darkBrown, fontFamily: "'Bangers', cursive", letterSpacing: 1 }}>
                          {it.status === "completed" ? "\u2705 Done" : it.status === "in_progress" ? "\u26A1 In Progress" : "\u23F3 Pending"}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </SectionBg>
        )}

        {/* ── PLAN ── */}
        {tab === "plan" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.lightTeal} 0%, #9DE4ED 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>Build Plan</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 16 }}>The step-by-step blueprint your swarm is following</p>
            <div style={{ maxWidth: 620, margin: "0 auto" }}>
              {plan.length === 0 ? (
                <Card style={{ textAlign: "center", padding: 40, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{"\uD83D\uDDFA\uFE0F"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 }}>No plan drawn up yet</div>
                  <div style={{ fontSize: 13, color: C.brown }}>Add items to the Bounty Board first -- the swarm will draw up a plan!</div>
                </Card>
              ) :
                plan.map((s,i) => {
                  const done = s.status==="completed";
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 12, marginBottom: 8 }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: 36, height: 36, borderRadius: "50%", background: done ? `linear-gradient(135deg, ${C.green}, #27ae60)` : C.cream, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontFamily: "'Bangers',cursive", flexShrink: 0, color: done ? C.white : C.darkBrown, boxShadow: done ? `0 2px 8px ${C.green}44` : "none" }}>
                          {done ? "\u2713" : i+1}
                        </div>
                        {i < plan.length - 1 && <div style={{ width: 2, flex: 1, background: done ? C.green : `${C.darkBrown}33`, marginTop: 4 }} />}
                      </div>
                      <Card bg={done ? C.lightTeal : C.white} style={{ flex: 1, padding: 12, marginBottom: 0, background: done ? `linear-gradient(135deg, ${C.lightTeal} 0%, #D4F4E8 100%)` : `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                        <div style={{ fontSize: 13, fontWeight: done ? 400 : 600, lineHeight: 1.4 }}>{s.description}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                          {s.agent_type && <span style={{ fontSize: 10, background: C.lightOrange, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>{"\uD83E\uDD20"} {s.agent_type}</span>}
                          {done && <span style={{ fontSize: 10, background: C.green, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>{"\u2705"} Tests: {s.tests_passed}/{s.tests_written}</span>}
                        </div>
                      </Card>
                    </div>
                  );
                })}
            </div>
          </SectionBg>
        )}

        {/* ── AUDIO ── */}
        {tab === "audio" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.cream} 0%, #F0E2CA 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>Voice Review</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 16 }}>Record or upload audio for {repo?.name || "your repo"}. Whisper transcribes, items auto-extracted.</p>
            <Card bg={C.yellow} style={{ maxWidth: 520, margin: "0 auto 20px", textAlign: "center", padding: 20, background: `linear-gradient(135deg, ${C.yellow} 0%, #FFD54F 100%)` }}>
              <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
                {!recording
                  ? <Btn bg={C.red} onClick={startRecording} style={{ fontSize: 16, padding: "12px 24px" }}>{"\uD83D\uDD34"} Record</Btn>
                  : <Btn bg={C.red} onClick={stopRecording} style={{ animation: "wiggle 0.5s infinite", fontSize: 16, padding: "12px 24px" }}>{"\u23F9"} Stop {fmt(recTime)}</Btn>}
                <label>
                  <Btn bg={C.teal} as="span" style={{ fontSize: 16, padding: "12px 24px" }}>{"\uD83D\uDCC1"} Upload File</Btn>
                  <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm" onChange={uploadAudio} style={{ display: "none" }} />
                </label>
              </div>
            </Card>
            <div style={{ maxWidth: 520, margin: "0 auto" }}>
              {audio.length===0 ? (
                <Card style={{ textAlign: "center", padding: 30, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{"\uD83C\uDFA4"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 4 }}>No recordings yet</div>
                  <div style={{ fontSize: 12, color: C.brown }}>Hit Record or Upload to feed audio to the swarm.</div>
                </Card>
              ) :
                audio.map(a => (
                  <Card key={a.id} style={{ marginBottom: 8, padding: 12, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: a.status==="processed" ? C.green : a.status==="transcribed" ? C.orange : C.cream, border: `2px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>{"\uD83C\uDFA4"}</div>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{a.filename?.split("/").pop()}</span>
                      <span style={{ fontSize: 11, background: a.status==="processed"?C.green:a.status==="transcribed"?C.orange:"#ccc", color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 10px", fontWeight: 600 }}>{a.status}</span>
                    </div>
                    {a.transcript && <div style={{ fontSize: 12, color: C.brown, background: C.cream, borderRadius: 8, padding: 8, marginTop: 6, maxHeight: 80, overflow: "auto", lineHeight: 1.4, border: `1px solid ${C.darkBrown}22` }}>{a.transcript.slice(0,300)}</div>}
                  </Card>
                ))}
            </div>
          </SectionBg>
        )}

        {/* ── AGENTS ── */}
        {tab === "agents" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.orange} 0%, #E8851A 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", color: C.white, textShadow: `2px 2px 0 ${C.darkBrown}`, marginBottom: 6, letterSpacing: 3 }}>The Crew</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.cream, marginBottom: 16 }}>Your autonomous agents, saddled up and ready to ride</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, maxWidth: 750, margin: "0 auto" }}>
              {agents.length===0 ? (
                <Card style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>{"\uD83C\uDFDC\uFE0F"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 22, letterSpacing: 1, marginBottom: 4 }}>The crew's on break</div>
                  <div style={{ fontSize: 13, color: C.brown }}>Start a repo to see them ride!</div>
                </Card>
              ) :
                agents.map((a,i) => (
                  <Card key={a.id||i} bg={C.white} style={{ padding: 12, textAlign: "center", background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                    <div style={{ fontSize: 32, animation: "bounce 2s infinite", animationDelay: `${i*0.2}s` }}>{"\uD83E\uDD20"}</div>
                    <div style={{ fontFamily: "'Bangers',cursive", fontSize: 17, letterSpacing: 1, marginTop: 2 }}>{a.agent_type}</div>
                    <div style={{ fontSize: 9, color: C.brown, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.agent_id}</div>
                    {a.task && <div style={{ fontSize: 10, marginTop: 4, background: C.lightOrange, borderRadius: 6, padding: "3px 6px", border: `1px solid ${C.orange}` }}>{a.task?.slice(0,40)}</div>}
                  </Card>
                ))}
            </div>
          </SectionBg>
        )}

        {/* ── MEMORY ── */}
        {tab === "memory" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.lightTeal} 0%, #9DE4ED 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>Agent Memory</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 16 }}>Ruflo memory -- stores plans, execution results, and configs</p>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <Btn bg={C.teal} onClick={async () => { await f("/api/memory/seed", { method: "POST", body: JSON.stringify({ repo_id: sr }) }); load(); }} style={{ fontSize: 15, padding: "10px 20px" }}>{"\uD83D\uDD04"} Seed Memory from Repo State</Btn>
            </div>
            <div style={{ maxWidth: 700, margin: "0 auto" }}>
              {memory.length===0 ? (
                <Card style={{ textAlign: "center", padding: 40, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{"\uD83E\uDDE0"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 }}>Memory banks are empty</div>
                  <div style={{ fontSize: 13, color: C.brown }}>Start a repo to generate plans and build Ruflo memory. Or click "Seed Memory" above.</div>
                </Card>
              ) :
                memory.map(m => (
                  <div key={m.id} className="hover-glow" style={{ display: "flex", gap: 8, padding: "7px 12px", background: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 10, marginBottom: 4, fontSize: 12, transition: "box-shadow 0.2s, transform 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.06)" }}>
                    <span style={{ background: C.orange, color: C.white, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{m.namespace}</span>
                    <span style={{ fontWeight: 700, minWidth: 80 }}>{m.key}</span>
                    <span style={{ color: C.brown, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.value?.slice(0,80)}</span>
                  </div>
                ))}
            </div>
          </SectionBg>
        )}

        {/* ── MISTAKES ── */}
        {tab === "mistakes" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.cream} 0%, #F0E2CA 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>Mistake Graveyard</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 16 }}>Lessons learned -- injected into prompts so agents don't repeat mistakes</p>
            <div style={{ maxWidth: 620, margin: "0 auto" }}>
              {mistakes.length===0 ? (
                <Card style={{ textAlign: "center", padding: 40, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{"\uD83C\uDF1F"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 }}>Clean run, partner!</div>
                  <div style={{ fontSize: 13, color: C.brown }}>No mistakes on the books -- the swarm is riding clean.</div>
                </Card>
              ) :
                mistakes.map(m => (
                  <Card key={m.id} bg={C.white} style={{ marginBottom: 8, padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, #FFF5F5 100%)` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.red, border: `2px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{"\uD83D\uDC80"}</div>
                      <span style={{ background: C.red, color: C.white, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700, border: `2px solid ${C.darkBrown}`, fontFamily: "'Bangers', cursive", letterSpacing: 1 }}>{m.error_type}</span>
                      <span style={{ fontSize: 10, color: C.brown, marginLeft: "auto" }}>{m.created_at}</span>
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 4 }}>{m.description}</div>
                    {m.resolution && <div style={{ fontSize: 12, color: C.green, fontWeight: 600, background: "#E8F8E8", borderRadius: 8, padding: "4px 10px", border: `1px solid ${C.green}33` }}>{"\u2705"} {m.resolution}</div>}
                  </Card>
                ))}
            </div>
          </SectionBg>
        )}

        {/* ── LOGS ── */}
        {tab === "logs" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.yellow} 0%, #F5D94E 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>Town Logs</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 16 }}>Every action, every decision -- all on record</p>
            <div style={{ maxWidth: 800, margin: "0 auto" }}>
              {logs.length===0 ? (
                <Card style={{ textAlign: "center", padding: 30, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{"\uD83D\uDCDC"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 4 }}>No logs on the books yet</div>
                  <div style={{ fontSize: 12, color: C.brown }}>Logs appear as the orchestrator works its magic.</div>
                </Card>
              ) :
                logs.map(l => (
                  <div key={l.id} style={{ display: "flex", gap: 8, padding: "5px 10px", background: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, marginBottom: 3, fontSize: 11, boxShadow: "0 1px 3px rgba(0,0,0,.04)", transition: "transform .15s" }}>
                    <span style={{ color: C.brown, minWidth: 90, fontSize: 9 }}>{l.created_at}</span>
                    <span style={{ fontWeight: 700, color: STATES[l.state]?.color || C.brown, minWidth: 75 }}>{l.state}</span>
                    <span style={{ minWidth: 80, fontWeight: 500 }}>{l.action}</span>
                    {l.agent_count>0 && <span style={{ color: C.orange, fontSize: 9, background: C.lightOrange, borderRadius: 4, padding: "0 4px" }}>{"\uD83E\uDD20"}{"\u00D7"}{l.agent_count}</span>}
                    {l.duration_sec>0 && <span style={{ color: C.teal, fontSize: 9, background: C.lightTeal, borderRadius: 4, padding: "0 4px" }}>{l.duration_sec.toFixed(1)}s</span>}
                    {l.error && <span style={{ color: C.red, fontSize: 9 }}>{"\uD83D\uDC80"}{l.error.slice(0,30)}</span>}
                    <span style={{ color: C.brown, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.result?.slice(0,50)}</span>
                  </div>
                ))}
            </div>
          </SectionBg>
        )}

        {/* ── HISTORY ── */}
        {tab === "history" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.yellow} 0%, #F5D94E 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>Repo History</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 20 }}>A trail of every move your swarm has made</p>
            <div style={{ maxWidth: 700, margin: "0 auto" }}>
              {history.length === 0 ? (
                <Card style={{ textAlign: "center", padding: 40, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{"\uD83D\uDCDC"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 }}>No trail to follow yet</div>
                  <div style={{ fontSize: 13, color: C.brown }}>History is recorded as the orchestrator works through steps.</div>
                </Card>
              ) :
                history.map((h, i) => (
                  <div key={i} className="timeline-entry">
                    {/* Timeline icon */}
                    <div style={{ position: "absolute", left: 0, top: 4 }}>
                      <ActionIcon action={h.action} />
                    </div>
                    <Card className="hover-glow" style={{ padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, lineHeight: 1.2 }}>
                            {h.action?.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          </div>
                          <div style={{ fontSize: 12, color: C.brown, marginTop: 3, lineHeight: 1.4 }}>{h.details}</div>
                          {h.commit_hash && (
                            <code style={{ display: "inline-block", fontSize: 10, background: C.lightTeal, padding: "2px 8px", borderRadius: 6, color: C.teal, fontWeight: 600, marginTop: 4, border: `1px solid ${C.teal}33` }}>
                              {h.commit_hash.slice(0, 8)}
                            </code>
                          )}
                          {h.state_before && h.state_after && (
                            <div style={{ fontSize: 11, marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ background: STATES[h.state_before]?.color || C.brown, color: C.white, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{STATES[h.state_before]?.emoji} {h.state_before}</span>
                              <span style={{ color: C.brown, fontWeight: 700 }}>{"\u2192"}</span>
                              <span style={{ background: STATES[h.state_after]?.color || C.brown, color: C.white, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{STATES[h.state_after]?.emoji} {h.state_after}</span>
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 10, color: C.brown, fontWeight: 500 }}>{h.created_at}</div>
                          {h.commit_hash && h.action === "git_commit" && (
                            <Btn style={{ marginTop: 6, fontSize: 10, padding: "4px 10px", background: C.red, color: C.white }}
                              onClick={async () => {
                                if (!confirm(`Rollback to commit ${h.commit_hash.slice(0, 8)}? This will revert all changes after this commit.`)) return;
                                setRollingBack(true);
                                const res = await f("/api/rollback", { method: "POST", body: JSON.stringify({ repo_id: sr, commit_hash: h.commit_hash }) });
                                setRollingBack(false);
                                if (res.ok) { const d = await res.json(); alert(d.ok ? "Rollback complete!" : d.error || "Rollback failed"); }
                              }}>
                              {rollingBack ? "Rolling back..." : "\u23EA Rollback"}
                            </Btn>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>
                ))}
            </div>
          </SectionBg>
        )}

        {/* ── HEALTH CHECK ── */}
        {tab === "health" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.cream} 0%, #F0E2CA 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>Health Check</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 20 }}>Scan your repos for issues and auto-fix what you can</p>

            {/* Scan + Fix buttons */}
            <div style={{ textAlign: "center", marginBottom: 24, display: "flex", justifyContent: "center", gap: 14 }}>
              <Btn onClick={scanAll} bg={C.teal} style={{ fontSize: 18, padding: "14px 32px" }}>
                {scanning ? "\u23F3 Scanning..." : "\uD83D\uDD0D SCAN ALL REPOS"}
              </Btn>
              <Btn onClick={fixAll} bg={C.green} style={{ fontSize: 18, padding: "14px 32px" }}>
                {fixing ? "\u23F3 Fixing..." : "\uD83D\uDD27 FIX ALL AUTO-FIXABLE"}
              </Btn>
            </div>

            {/* Health Results */}
            {healthData.length > 0 && (
              <div style={{ maxWidth: 800, margin: "0 auto 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: 12 }}>
                  {healthData.map(h => {
                    const scoreColor = h.health_score >= 80 ? C.green : h.health_score >= 50 ? C.orange : C.red;
                    const pt = h.project_type || {};
                    return (
                      <Card key={h.repo_id} bg={C.white}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                          <div style={{ width: 50, height: 50, borderRadius: "50%", background: scoreColor, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontFamily: "'Bangers',cursive", fontSize: 20 }}>
                            {h.health_score}%
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1 }}>{h.repo_name}</div>
                            {pt.type && <div style={{ fontSize: 10, color: C.brown }}>{pt.type} • {pt.file_count} files • {pt.swarm_size} agents • {pt.sparc_mode} mode</div>}
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div style={{ background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 8, height: 12, overflow: "hidden", marginBottom: 8 }}>
                          <div style={{ height: "100%", borderRadius: 6, background: `linear-gradient(90deg, ${scoreColor}, ${C.green})`, width: `${h.health_score}%`, transition: "width .5s" }} />
                        </div>
                        {/* Issues */}
                        {h.issues.length === 0 ? (
                          <div style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✅ All checks passed!</div>
                        ) : h.issues.map((issue, i) => {
                          const sevColor = { critical: C.red, issue: C.orange, warning: "#DAA520" }[issue.severity] || "#ccc";
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 11, borderBottom: `1px solid ${C.cream}` }}>
                              <span style={{ background: sevColor, color: C.white, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700, minWidth: 50, textAlign: "center" }}>{issue.severity}</span>
                              <span style={{ fontWeight: 600 }}>{issue.title}</span>
                              {issue.auto_fixable && <span style={{ fontSize: 9, color: C.teal }}>🔧 auto-fix</span>}
                            </div>
                          );
                        })}
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Chat Interface */}
            <Card bg={C.yellow} style={{ maxWidth: 700, margin: "0 auto" }}>
              <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5, textAlign: "center" }}>💬 Command Center</div>
              <div style={{ fontSize: 11, color: C.brown, marginBottom: 10, padding: "8px 12px", background: C.cream, borderRadius: 10, border: `2px solid ${C.darkBrown}` }}>
                <div style={{ fontWeight: 700, marginBottom: 4, textAlign: "center" }}>Available Commands:</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px" }}>
                  {[
                    ["scan all / scan [repo]", "Run health check on repos"],
                    ["fix all / fix [repo]", "Auto-fix common issues"],
                    ["start all / start [repo]", "Start orchestration"],
                    ["stop all / stop [repo]", "Stop orchestration"],
                    ["push [repo]", "Git push to GitHub"],
                    ["status", "Show all repo statuses"],
                    ["add feature to [repo]: [desc]", "Add a feature item"],
                    ["add issue to [repo]: [desc]", "Add a bug/issue item"],
                    ["add tests to [repo]", "Generate test files"],
                    ["list repos", "Show all registered repos"],
                  ].map(([cmd, desc], i) => (
                    <div key={i} style={{ display: "flex", gap: 4 }}>
                      <code style={{ background: C.lightOrange, borderRadius: 4, padding: "0 4px", fontWeight: 600, fontSize: 10, whiteSpace: "nowrap" }}>{cmd}</code>
                      <span style={{ fontSize: 10, color: C.brown }}>{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Chat History */}
              <div style={{ maxHeight: 250, overflow: "auto", marginBottom: 10, padding: 4 }}>
                {chatHistory.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 6 }}>
                    <div style={{
                      maxWidth: "80%", padding: "8px 12px", borderRadius: 12,
                      background: m.role === "user" ? C.orange : C.white,
                      color: m.role === "user" ? C.white : C.darkBrown,
                      border: `2px solid ${C.darkBrown}`, fontSize: 12,
                    }}>
                      {m.content}
                      <div style={{ fontSize: 9, color: m.role === "user" ? C.cream : C.brown, marginTop: 2 }}>{m.time}</div>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 6 }}>
                    <div style={{ padding: "8px 12px", borderRadius: 12, background: C.white, border: `2px solid ${C.darkBrown}`, fontSize: 12 }}>
                      <span style={{ animation: "pulse 1s infinite" }}>🤔 Thinking...</span>
                    </div>
                  </div>
                )}
              </div>
              {/* Chat Input */}
              <div style={{ display: "flex", gap: 8 }}>
                <Inp value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendChat()}
                  placeholder="Type a command..." style={{ flex: 1 }} />
                <Btn onClick={sendChat} bg={C.teal}>Send</Btn>
              </div>
            </Card>
          </SectionBg>
        )}

        {/* ── SETTINGS ── */}
        {tab === "settings" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.sand} 0%, #E8C84E 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>Ruflo Settings</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 20 }}>Configure your swarm's model routing and optimization</p>
            <div style={{ maxWidth: 700, margin: "0 auto" }}>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 20 }}>
                <Btn bg={C.orange} style={{ fontSize: 17, padding: "14px 28px" }} onClick={async () => {
                  const res = await f("/api/ruflo-optimize", { method: "POST", body: JSON.stringify({ all: true }) });
                  if (res.ok) { const d = await res.json(); alert(`Optimized ${d.optimized} repos!`); load(); }
                }}>{"\uD83D\uDD04"} Re-Optimize All Repos</Btn>
                <Btn bg={C.teal} style={{ fontSize: 17, padding: "14px 28px" }} onClick={async () => {
                  if (!sr) return;
                  const res = await f("/api/ruflo-optimize", { method: "POST", body: JSON.stringify({ repo_id: sr }) });
                  if (res.ok) { const d = await res.json(); alert(`Optimized ${d.optimized} repo(s)!`); load(); }
                }}>{"\u26A1"} Optimize Selected Repo</Btn>
              </div>
              {/* ── Selective Item Optimization ── */}
              {sr && items.length > 0 && (
                <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #FFF8E7 0%, #F5E6C8 100%)` }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 4, letterSpacing: 1.5 }}>{"\uD83C\uDFAF"} Selective Item Roundup</div>
                  <p style={{ fontSize: 12, color: C.brown, marginBottom: 12 }}>Pick specific bounties to re-wrangle. Selected items get reset to pending and re-planned by the swarm.</p>
                  <div style={{ maxHeight: 220, overflowY: "auto", marginBottom: 12, border: `2px solid ${C.darkBrown}33`, borderRadius: 10, background: C.white }}>
                    {items.map(it => {
                      const checked = selOptItems.includes(it.id);
                      const typeIcon = it.type === "issue" ? "\uD83D\uDC1B" : "\uD83C\uDF1F";
                      const statusColor = it.status === "completed" ? C.green : it.status === "in_progress" ? C.orange : "#999";
                      const statusLabel = it.status === "completed" ? "Done" : it.status === "in_progress" ? "Active" : "Pending";
                      return (
                        <label key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                          borderBottom: `1px solid ${C.darkBrown}15`, cursor: "pointer", transition: "background 0.15s",
                          background: checked ? `${C.lightTeal}88` : "transparent" }}
                          onMouseEnter={e => e.currentTarget.style.background = checked ? `${C.lightTeal}aa` : `${C.sand}66`}
                          onMouseLeave={e => e.currentTarget.style.background = checked ? `${C.lightTeal}88` : "transparent"}>
                          <input type="checkbox" checked={checked} onChange={() => {
                            setSelOptItems(prev => checked ? prev.filter(x => x !== it.id) : [...prev, it.id]);
                          }} style={{ width: 18, height: 18, accentColor: C.teal, cursor: "pointer", flexShrink: 0 }} />
                          <span style={{ fontSize: 18, flexShrink: 0 }}>{typeIcon}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                            <div style={{ fontSize: 10, color: C.brown }}>{it.priority} priority</div>
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.white, background: statusColor,
                            padding: "2px 8px", borderRadius: 6, flexShrink: 0, fontFamily: "'Bangers', cursive", letterSpacing: 0.5 }}>{statusLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <Btn bg={selOptItems.length > 0 ? C.orange : "#aaa"} style={{ fontSize: 15, padding: "10px 22px", opacity: selOptItems.length > 0 ? 1 : 0.6, cursor: selOptItems.length > 0 ? "pointer" : "not-allowed" }} onClick={async () => {
                      if (!sr || selOptItems.length === 0) return;
                      const res = await f("/api/ruflo-optimize", { method: "POST", body: JSON.stringify({ repo_id: sr, item_ids: selOptItems }) });
                      if (res.ok) {
                        const d = await res.json();
                        const reQueued = d.results?.[0]?.re_queued_items?.length || 0;
                        alert(`Optimized repo! ${reQueued} item(s) re-queued for the swarm.`);
                        setSelOptItems([]);
                        load();
                      }
                    }}>{"\uD83E\uDDE8"} Optimize {selOptItems.length} Selected {selOptItems.length === 1 ? "Item" : "Items"}</Btn>
                    {selOptItems.length > 0 && (
                      <span onClick={() => setSelOptItems([])} style={{ fontSize: 12, color: C.brown, cursor: "pointer", textDecoration: "underline", fontWeight: 600 }}>Clear all</span>
                    )}
                    <span onClick={() => setSelOptItems(items.map(it => it.id))} style={{ fontSize: 12, color: C.brown, cursor: "pointer", textDecoration: "underline", fontWeight: 600, marginLeft: "auto" }}>Select all</span>
                  </div>
                </Card>
              )}
              <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, ${C.cream} 0%, #FFF3CD 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 }}>Model Routing</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Architecture", model: "Opus", icon: "\uD83C\uDFDB\uFE0F", bg: C.lightOrange },
                    { label: "Coding", model: "Sonnet", icon: "\uD83D\uDCBB", bg: C.lightTeal },
                    { label: "Scanning", model: "Haiku", icon: "\uD83D\uDD0D", bg: "#E8E0F0" },
                  ].map((m, i) => (
                    <div key={i} style={{ background: m.bg, border: `2px solid ${C.darkBrown}`, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontSize: 20, marginBottom: 2 }}>{m.icon}</div>
                      <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1 }}>{m.model}</div>
                      <div style={{ fontSize: 10, color: C.brown, fontWeight: 600 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </Card>
              {repos.map(r => {
                const cfg = r.stats?.ruflo_config || {};
                return (
                  <Card key={r.id} className="hover-lift" style={{ marginBottom: 10, padding: 16, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1 }}>{r.name}</div>
                      <span style={{ fontSize: 12, color: C.teal, background: C.lightTeal, padding: "3px 12px", borderRadius: 8, border: `2px solid ${C.teal}`, fontWeight: 600 }}>
                        {cfg.project_type || "auto-detect"}
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                      {[
                        { label: "Agents", val: cfg.agents || "8", bg: C.lightOrange },
                        { label: "Arch", val: cfg.model_arch || "opus", bg: C.lightTeal },
                        { label: "Code", val: cfg.model_code || "sonnet", bg: C.cream },
                        { label: "Scan", val: cfg.model_scan || "haiku", bg: "#E8E0F0" },
                      ].map((x, i) => (
                        <div key={i} style={{ background: x.bg, borderRadius: 8, padding: "6px 8px", textAlign: "center", border: `1.5px solid ${C.darkBrown}44` }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{x.val}</div>
                          <div style={{ fontSize: 9, color: C.brown, fontWeight: 600 }}>{x.label}</div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </SectionBg>
        )}

      </div>
    </div>
  );
}
