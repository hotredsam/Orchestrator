const { useState, useEffect, useCallback, useRef } = React;

const API = "http://localhost:6969";
const f = (u, o) => fetch(`${API}${u}`, { ...o, headers: { "Content-Type": "application/json", ...o?.headers } });

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
  const mRec = useRef(null);
  const chnk = useRef([]);
  const tmr = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await f("/api/repos");
      if (r.ok) { const d = await r.json(); setRepos(d); if (!sr && d.length) setSR(d[0].id); }
      setCon(true);
    } catch { setCon(false); }
    if (!sr) return;
    try {
      const [a,b,c,d,e,g,h] = await Promise.all([
        f(`/api/items?repo_id=${sr}`), f(`/api/plan?repo_id=${sr}`),
        f(`/api/logs?repo_id=${sr}`), f(`/api/agents?repo_id=${sr}`),
        f(`/api/memory?repo_id=${sr}`), f(`/api/mistakes?repo_id=${sr}`),
        f(`/api/audio?repo_id=${sr}`),
      ]);
      if(a.ok) setItems(await a.json()); if(b.ok) setPlan(await b.json());
      if(c.ok) setLogs(await c.json()); if(d.ok) setAgents(await d.json());
      if(e.ok) setMemory(await e.json()); if(g.ok) setMistakes(await g.json());
      if(h.ok) setAudio(await h.json());
    } catch {}
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
    <div className={className} style={{ background: bg, border: `3px solid ${C.darkBrown}`, borderRadius: 16, padding: 16, boxShadow: "4px 4px 0 #3D2B1F", ...style }} {...p}>{children}</div>
  );
  const Inp = ({ style, ...p }) => (
    <input style={{ width: "100%", padding: "10px 14px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, color: C.darkBrown, fontSize: 14, fontFamily: "'Fredoka', sans-serif", boxSizing: "border-box", outline: "none", ...style }} {...p} />
  );
  const Btn = ({ children, bg = C.orange, color = C.white, style, ...p }) => (
    <button className="hover-pop" style={{ padding: "10px 20px", background: bg, border: `3px solid ${C.darkBrown}`, borderRadius: 12, color, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: 1.5, boxShadow: "3px 3px 0 #3D2B1F", transition: "transform .15s, filter .15s, box-shadow .15s", ...style }}
      onMouseDown={e => e.target.style.transform = "translate(2px,2px) scale(0.97)"}
      onMouseUp={e => e.target.style.transform = ""} onMouseOut={e => e.target.style.transform = ""} {...p}>{children}</button>
  );

  const SectionBg = ({ children, bg, style }) => (
    <div style={{ background: bg, padding: "24px 20px", ...style }}>{children}</div>
  );

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
    { id: "health", label: "🔍 Health Check" },
  ];

  return (
    <div style={{ fontFamily: "'Fredoka', 'Comic Sans MS', cursive, sans-serif", background: C.sky, color: C.darkBrown, minHeight: "100vh" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bangers&family=Fredoka:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:8px} ::-webkit-scrollbar-thumb{background:${C.orange};border-radius:4px;border:2px solid ${C.darkBrown}}
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
        textarea,select{font-family:'Fredoka',sans-serif}
        select option{background:${C.cream};color:${C.darkBrown}}
        @media(max-width:700px){.cactus-right{display:none!important}}
        .hover-lift:hover{transform:translateY(-4px) scale(1.02)!important;box-shadow:6px 6px 0 #3D2B1F!important}
        .hover-glow:hover{box-shadow:0 0 12px rgba(247,148,29,0.4), 4px 4px 0 #3D2B1F!important}
        .hover-pop:hover{transform:scale(1.05)!important;filter:brightness(1.1)}
        .nav-tab:hover{background:rgba(255,255,255,0.2)!important}
        .stat-card:hover{transform:translateY(-3px)!important;box-shadow:5px 5px 0 #3D2B1F!important}
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

      {/* ═══ CONTENT ═══ */}
      <div style={{ maxHeight: "calc(100vh - 150px)", overflow: "auto" }}>

        {/* ── HOME / TOWN SQUARE ── */}
        {tab === "home" && (<>
          {/* START ALL banner */}
          <SectionBg bg={C.cream}>
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <Btn onClick={startAll} bg={C.green} style={{ fontSize: 22, padding: "14px 40px", animation: repos.some(r=>r.running) ? "none" : "wiggle 2s infinite" }}>
                🚀 START ALL REPOS
              </Btn>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              {[
                { emoji: "📦", label: "Repos", val: repos.length, bg: C.lightOrange },
                { emoji: "⚡", label: "Running", val: repos.filter(r=>r.running).length, bg: C.lightTeal },
                { emoji: "📋", label: "Items", val: repos.reduce((s,r)=>(s+(r.stats?.items_total||0)),0), bg: C.yellow },
                { emoji: "✅", label: "Done", val: repos.reduce((s,r)=>(s+(r.stats?.items_done||0)),0), bg: C.lightTeal },
                { emoji: "🤠", label: "Agents", val: repos.reduce((s,r)=>(s+(r.stats?.agents||0)),0), bg: C.lightOrange },
              ].map((s,i) => (
                <div key={i} className="stat-card" style={{ background: s.bg, border: `3px solid ${C.darkBrown}`, borderRadius: 14, padding: "10px 18px", textAlign: "center", boxShadow: "3px 3px 0 #3D2B1F", minWidth: 90, transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }}>
                  <div style={{ fontSize: 24 }}>{s.emoji}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, letterSpacing: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.brown }}>{s.label}</div>
                </div>
              ))}
            </div>
          </SectionBg>

          {/* REPO CARDS — "Meet the Citizens" */}
          <SectionBg bg={C.teal} style={{ borderTop: `3px solid ${C.darkBrown}` }}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 32, textAlign: "center", color: C.white, textShadow: `2px 2px 0 ${C.darkBrown}`, marginBottom: 16, letterSpacing: 3 }}>
              YOUR REPOS
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
              {repos.map(r => {
                const rst = STATES[r.state] || STATES.idle;
                const s = r.stats || {};
                return (
                  <Card key={r.id} bg={sr === r.id ? C.yellow : C.white}
                    className="hover-lift"
                    style={{ cursor: "pointer", transition: "transform .2s, box-shadow .2s", position: "relative", overflow: "hidden" }}
                    onClick={() => { setSR(r.id); setTab("flow"); }}>
                    {/* Running indicator */}
                    {r.running && <div style={{ position: "absolute", top: -2, right: -2, background: C.green, border: `2px solid ${C.darkBrown}`, borderRadius: "0 12px 0 10px", padding: "3px 10px", fontSize: 10, fontWeight: 700, color: C.white }}>RUNNING</div>}

                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: rst.color, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, transition: "transform 0.3s ease, background 0.3s ease", animation: r.running ? "bounce 2s cubic-bezier(0.4,0,0.2,1) infinite" : "none" }}>
                        {rst.emoji}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1.5 }}>{r.name}</div>
                        <div style={{ fontSize: 10, color: C.brown, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.path}</div>
                      </div>
                    </div>

                    {/* Mini stats */}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      {[
                        { l: "Items", v: `${s.items_done||0}/${s.items_total||0}`, bg: C.lightOrange },
                        { l: "Steps", v: `${s.steps_done||0}/${s.steps_total||0}`, bg: C.lightTeal },
                        { l: "Agents", v: s.agents||0, bg: C.yellow },
                        { l: "Cycles", v: r.cycle_count||0, bg: C.cream },
                      ].map((x,i) => (
                        <div key={i} style={{ background: x.bg, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "2px 8px", fontSize: 11, fontWeight: 600 }}>
                          {x.l}: {x.v}
                        </div>
                      ))}
                    </div>

                    {/* Progress bar */}
                    <div style={{ background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 8, height: 14, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 6, background: `linear-gradient(90deg, ${C.green}, ${C.teal})`, width: `${s.steps_total ? (s.steps_done/s.steps_total*100) : 0}%`, transition: "width .5s" }} />
                    </div>

                    {/* Health badge + action buttons */}
                    <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                      {r.running
                        ? <Btn bg={C.red} onClick={e => { e.stopPropagation(); stopRepo(r.id); }} style={{ fontSize: 12, padding: "5px 12px" }}>⏹ Stop</Btn>
                        : <Btn bg={C.green} onClick={e => { e.stopPropagation(); startRepo(r.id); }} style={{ fontSize: 12, padding: "5px 12px" }}>▶ Start</Btn>}
                      <div style={{ fontSize: 11, color: C.brown, display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                        {rst.emoji} {rst.label}
                      </div>
                      {healthData.length > 0 ? (() => {
                        const h = healthData.find(hd => hd.repo_id === r.id);
                        if (!h) return null;
                        const sc = h.health_score >= 80 ? C.green : h.health_score >= 50 ? C.orange : C.red;
                        return <div style={{ background: sc, color: C.white, borderRadius: 8, padding: "2px 8px", fontSize: 10, fontWeight: 700, border: `2px solid ${C.darkBrown}` }}>{h.health_score}%</div>;
                      })() : null}
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
          <SectionBg bg={C.yellow} style={{ borderTop: `3px solid ${C.darkBrown}` }}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 24, textAlign: "center", marginBottom: 12, letterSpacing: 2 }}>📜 Recent Activity</h2>
            <div style={{ maxWidth: 700, margin: "0 auto" }}>
              {logs.slice(0, 8).map(l => (
                <div key={l.id} style={{ display: "flex", gap: 8, padding: "5px 10px", background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 10, marginBottom: 4, fontSize: 12 }}>
                  <span style={{ color: C.brown, fontSize: 10, minWidth: 90 }}>{l.created_at}</span>
                  <span style={{ fontWeight: 700, color: STATES[l.state]?.color || C.brown, minWidth: 80 }}>{l.state}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.action}</span>
                  {l.error && <span style={{ color: C.red, fontSize: 10 }}>⚠ {l.error.slice(0,30)}</span>}
                </div>
              ))}
              {logs.length === 0 && <div style={{ textAlign: "center", padding: 20, color: C.brown }}>No activity yet — start some repos!</div>}
            </div>
          </SectionBg>
        </>)}

        {/* ── MASTER / VIEW ALL ── */}
        {tab === "master" && (
          <SectionBg bg={C.cream}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 28, textAlign: "center", marginBottom: 16, letterSpacing: 2 }}>🌐 All Repos — Master View</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {repos.map(r => {
                const rst = STATES[r.state] || STATES.idle;
                const s = r.stats || {};
                const pct = s.steps_total ? Math.round(s.steps_done / s.steps_total * 100) : 0;
                return (
                  <Card key={r.id} className="hover-lift" bg={C.white} style={{ cursor: "pointer", transition: "transform .2s, box-shadow .2s" }}
                    onClick={() => { setSR(r.id); setTab("flow"); }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: rst.color, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, animation: r.running ? "bounce 2s cubic-bezier(0.4,0,0.2,1) infinite" : "none" }}>
                        {rst.emoji}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1 }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: C.brown }}>{rst.label} {r.running ? "— RUNNING" : ""}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 24, color: pct === 100 ? C.green : C.orange }}>{pct}%</div>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 8, height: 12, overflow: "hidden", marginBottom: 8 }}>
                      <div style={{ height: "100%", borderRadius: 6, background: `linear-gradient(90deg, ${C.green}, ${C.teal})`, width: `${pct}%`, transition: "width .5s" }} />
                    </div>
                    {/* Mini roadmap: show plan steps */}
                    <div style={{ fontSize: 11, color: C.brown }}>
                      Items: {s.items_done||0}/{s.items_total||0} | Steps: {s.steps_done||0}/{s.steps_total||0} | Cycles: {r.cycle_count||0}
                    </div>
                  </Card>
                );
              })}
            </div>
          </SectionBg>
        )}

        {/* ── FLOW / ROAD MAP ── */}
        {tab === "flow" && (
          <SectionBg bg={C.cream}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 28, textAlign: "center", marginBottom: 4, letterSpacing: 2 }}>
              🗺️ {repo?.name || "Select a Repo"} — Road Map
            </h2>
            <p style={{ textAlign: "center", fontSize: 14, color: C.brown, marginBottom: 12 }}>{si.emoji} {si.desc}</p>

            {/* Action buttons */}
            <div style={{ textAlign: "center", marginBottom: 12, display: "flex", justifyContent: "center", gap: 8 }}>
              {repo && !repo.running && <Btn bg={C.green} onClick={() => startRepo(sr)} style={{ padding: "8px 16px" }}>▶ Start</Btn>}
              {repo?.running && <Btn bg={C.red} onClick={() => stopRepo(sr)} style={{ padding: "8px 16px" }}>⏹ Stop</Btn>}
              <Btn bg={C.teal} onClick={pushGH} style={{ padding: "8px 16px" }}>↑ Push Git</Btn>
            </div>

            <Card bg={C.white} style={{ maxWidth: 620, margin: "0 auto" }}>
              <svg viewBox="0 0 570 500" style={{ width: "100%" }}>
                <defs>
                  <marker id="ah" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><path d="M0,0 L7,2.5 L0,5" fill={C.brown}/></marker>
                  <marker id="ahA" markerWidth="7" markerHeight="5" refX="7" refY="2.5" orient="auto"><path d="M0,0 L7,2.5 L0,5" fill={C.orange}/></marker>
                </defs>
                {FLOW_EDGES.map(([from,to,path,label],i) => {
                  const active = from === cs;
                  return (<g key={i}>
                    <path d={path} fill="none" stroke={active ? C.orange : "#ccc"} strokeWidth={active ? 3 : 1.5} markerEnd={active ? "url(#ahA)" : "url(#ah)"} />
                    {label && (() => { const pts = path.split(/[ML ]+/).filter(Boolean).map(p=>p.split(",").map(Number)); if(pts.length>=2) return <text x={(pts[0][0]+pts[1][0])/2} y={(pts[0][1]+pts[1][1])/2-4} fill={C.brown} fontSize="9" textAnchor="middle" fontFamily="Fredoka" fontWeight="600">{label}</text>; })()}
                  </g>);
                })}
                {FLOW_NODES.map(n => {
                  const active = n.id === cs;
                  const info = STATES[n.id] || {};
                  return (<g key={n.id}>
                    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.dec ? 4 : 12}
                      fill={active ? info.color : C.cream}
                      stroke={active ? C.darkBrown : "#bbb"} strokeWidth={active ? 3 : 1.5}
                      strokeDasharray={n.dec ? "5,3" : undefined} />
                    {active && <rect x={n.x-2} y={n.y-2} width={n.w+4} height={n.h+4} rx={n.dec?6:14}
                      fill="none" stroke={info.color} strokeWidth={2} opacity={.5}>
                      <animate attributeName="opacity" values=".7;.2;.7" dur="1.5s" repeatCount="indefinite"/>
                    </rect>}
                    <text x={n.x+n.w/2} y={n.y+15} fill={active ? C.white : C.brown} fontSize="12" textAnchor="middle" fontFamily="Fredoka">{info.emoji}</text>
                    <text x={n.x+n.w/2} y={n.y+29} fill={active ? C.white : C.darkBrown} fontSize="9" textAnchor="middle" fontFamily="Fredoka" fontWeight={active?"700":"500"}>{info.label}</text>
                  </g>);
                })}
              </svg>
            </Card>
          </SectionBg>
        )}

        {/* ── BOUNTY BOARD (Issues + Features) ── */}
        {tab === "items" && (
          <SectionBg bg={C.cream}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 28, textAlign: "center", marginBottom: 12, letterSpacing: 2 }}>📋 Bounty Board</h2>
            <Card bg={C.yellow} style={{ maxWidth: 600, margin: "0 auto 16px" }}>
              <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, marginBottom: 8, letterSpacing: 1 }}>Post a Bounty</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <select value={ni.type} onChange={e => setNI(p=>({...p,type:e.target.value}))}
                  style={{ padding: "8px 12px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, fontSize: 13, fontFamily: "'Fredoka',sans-serif", fontWeight: 600, outline: "none" }}>
                  <option value="feature">🌟 Feature</option><option value="issue">🐛 Issue</option>
                </select>
                <select value={ni.priority} onChange={e => setNI(p=>({...p,priority:e.target.value}))}
                  style={{ padding: "8px 12px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, fontSize: 13, fontFamily: "'Fredoka',sans-serif", fontWeight: 600, outline: "none" }}>
                  {["low","medium","high","critical"].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <Inp placeholder="Title" value={ni.title} onChange={e => setNI(p=>({...p,title:e.target.value}))} style={{ marginBottom: 6 }} />
              <textarea placeholder="Description..." value={ni.description} onChange={e => setNI(p=>({...p,description:e.target.value}))}
                style={{ width: "100%", padding: "10px 14px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, color: C.darkBrown, fontSize: 14, fontFamily: "'Fredoka',sans-serif", minHeight: 60, resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
              <Btn onClick={addItem}>Post {ni.type === "issue" ? "🐛" : "🌟"} Bounty</Btn>
            </Card>
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
              {items.length === 0 ? <Card bg={C.white} style={{ textAlign: "center", padding: 30 }}>No bounties posted yet</Card> :
                items.map(it => (
                  <Card key={it.id} bg={it.status==="completed" ? C.lightTeal : C.white} style={{ marginBottom: 6, padding: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 22 }}>{it.type==="issue" ? "🐛" : "🌟"}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{it.title}</div>
                        <div style={{ fontSize: 11, color: C.brown }}>{it.description}</div>
                      </div>
                      <div style={{ background: {critical:C.red,high:C.orange,medium:C.teal,low:"#ccc"}[it.priority], border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: C.white }}>{it.priority}</div>
                      <div style={{ background: it.status==="completed" ? C.green : it.status==="in_progress" ? C.orange : "#ccc", border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "2px 8px", fontSize: 10, fontWeight: 700, color: C.white }}>{it.status}</div>
                    </div>
                  </Card>
                ))}
            </div>
          </SectionBg>
        )}

        {/* ── PLAN ── */}
        {tab === "plan" && (
          <SectionBg bg={C.lightTeal}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 28, textAlign: "center", marginBottom: 12, letterSpacing: 2 }}>⚡ Build Plan</h2>
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
              {plan.length === 0 ? <Card><div style={{ textAlign: "center", padding: 20 }}>No plan yet — add items first!</div></Card> :
                plan.map((s,i) => {
                  const done = s.status==="completed";
                  return (
                    <div key={s.id} style={{ display: "flex", gap: 10, marginBottom: 4 }}>
                      <div style={{ width: 32, height: 32, borderRadius: "50%", background: done ? C.green : C.cream, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontFamily: "'Bangers',cursive", flexShrink: 0 }}>
                        {done ? "✓" : i+1}
                      </div>
                      <Card bg={done ? C.lightTeal : C.white} style={{ flex: 1, padding: 10, marginBottom: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: done ? 400 : 600 }}>{s.description}</div>
                        <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                          {s.agent_type && <span style={{ fontSize: 10, background: C.lightOrange, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "1px 6px" }}>{s.agent_type}</span>}
                          {done && <span style={{ fontSize: 10, background: C.green, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "1px 6px" }}>✅ {s.tests_passed}/{s.tests_written}</span>}
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
          <SectionBg bg={C.cream}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 28, textAlign: "center", marginBottom: 12, letterSpacing: 2 }}>🎙️ Voice Review — {repo?.name}</h2>
            <Card bg={C.yellow} style={{ maxWidth: 500, margin: "0 auto 16px", textAlign: "center" }}>
              <p style={{ fontSize: 13, color: C.brown, marginBottom: 10 }}>Record or upload. Whisper transcribes. Items auto-extracted.</p>
              <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
                {!recording
                  ? <Btn bg={C.red} onClick={startRecording}>🔴 Record</Btn>
                  : <Btn bg={C.red} onClick={stopRecording} style={{ animation: "wiggle 0.5s infinite" }}>⏹ Stop {fmt(recTime)}</Btn>}
                <label>
                  <Btn bg={C.teal} as="span">📁 Upload File</Btn>
                  <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm" onChange={uploadAudio} style={{ display: "none" }} />
                </label>
              </div>
            </Card>
            <div style={{ maxWidth: 500, margin: "0 auto" }}>
              {audio.length===0 ? <Card style={{ textAlign: "center" }}>No audio yet</Card> :
                audio.map(a => (
                  <Card key={a.id} style={{ marginBottom: 4, padding: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 20 }}>🎤</span>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{a.filename?.split("/").pop()}</span>
                      <span style={{ fontSize: 10, background: a.status==="processed"?C.green:a.status==="transcribed"?C.orange:"#ccc", color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "1px 6px" }}>{a.status}</span>
                    </div>
                    {a.transcript && <div style={{ fontSize: 11, color: C.brown, background: C.cream, borderRadius: 8, padding: 6, marginTop: 4, maxHeight: 60, overflow: "auto" }}>{a.transcript.slice(0,300)}</div>}
                  </Card>
                ))}
            </div>
          </SectionBg>
        )}

        {/* ── AGENTS ── */}
        {tab === "agents" && (
          <SectionBg bg={C.orange}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 28, textAlign: "center", color: C.white, textShadow: `2px 2px 0 ${C.darkBrown}`, marginBottom: 12, letterSpacing: 2 }}>🤠 The Crew — Min 10 Agents</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8, maxWidth: 700, margin: "0 auto" }}>
              {agents.length===0 ? <Card style={{ gridColumn: "1/-1", textAlign: "center" }}>No active agents</Card> :
                agents.map((a,i) => (
                  <Card key={a.id||i} bg={C.white} style={{ padding: 10, textAlign: "center" }}>
                    <div style={{ fontSize: 28, animation: "bounce 2s infinite", animationDelay: `${i*0.2}s` }}>🤠</div>
                    <div style={{ fontFamily: "'Bangers',cursive", fontSize: 16, letterSpacing: 1 }}>{a.agent_type}</div>
                    <div style={{ fontSize: 9, color: C.brown }}>{a.agent_id}</div>
                    {a.task && <div style={{ fontSize: 10, marginTop: 3 }}>{a.task?.slice(0,40)}</div>}
                  </Card>
                ))}
            </div>
          </SectionBg>
        )}

        {/* ── MEMORY ── */}
        {tab === "memory" && (
          <SectionBg bg={C.lightTeal}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 28, textAlign: "center", marginBottom: 12, letterSpacing: 2 }}>🧠 Agent Memory</h2>
            <p style={{ textAlign: "center", fontSize: 12, color: C.brown, marginBottom: 12 }}>Ruflo memory — stores plans, execution results, configs. Populated as repos run through the orchestrator.</p>
            <div style={{ textAlign: "center", marginBottom: 12 }}>
              <Btn bg={C.teal} onClick={async () => { await f("/api/memory/seed", { method: "POST", body: JSON.stringify({ repo_id: sr }) }); load(); }} style={{ fontSize: 12, padding: "6px 14px" }}>🔄 Seed Memory from Repo State</Btn>
            </div>
            <div style={{ maxWidth: 700, margin: "0 auto" }}>
              {memory.length===0 ? <Card style={{ textAlign: "center", padding: 20 }}>
                <div style={{ fontSize: 16, marginBottom: 6 }}>No memory entries yet</div>
                <div style={{ fontSize: 12, color: C.brown }}>Start a repo to generate plans, track executions, and build Ruflo memory. You can also click "Seed Memory" above to populate from current repo state.</div>
              </Card> :
                memory.map(m => (
                  <div key={m.id} className="hover-glow" style={{ display: "flex", gap: 6, padding: "6px 10px", background: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 10, marginBottom: 3, fontSize: 12, transition: "box-shadow 0.2s" }}>
                    <span style={{ background: C.orange, color: C.white, borderRadius: 6, padding: "1px 6px", fontSize: 10, fontWeight: 700 }}>{m.namespace}</span>
                    <span style={{ fontWeight: 700, minWidth: 80 }}>{m.key}</span>
                    <span style={{ color: C.brown, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.value?.slice(0,80)}</span>
                  </div>
                ))}
            </div>
          </SectionBg>
        )}

        {/* ── MISTAKES ── */}
        {tab === "mistakes" && (
          <SectionBg bg={C.cream}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 28, textAlign: "center", marginBottom: 12, letterSpacing: 2 }}>💀 Mistake Graveyard</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 12 }}>Ruflo memory — injected into prompts so agents don't repeat mistakes</p>
            <div style={{ maxWidth: 600, margin: "0 auto" }}>
              {mistakes.length===0 ? <Card style={{ textAlign: "center" }}>No mistakes yet — clean run! 🎉</Card> :
                mistakes.map(m => (
                  <Card key={m.id} bg={C.white} style={{ marginBottom: 4, padding: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <span style={{ background: C.red, color: C.white, borderRadius: 6, padding: "1px 8px", fontSize: 10, fontWeight: 700, border: `2px solid ${C.darkBrown}` }}>{m.error_type}</span>
                      <span style={{ fontSize: 10, color: C.brown }}>{m.created_at}</span>
                    </div>
                    <div style={{ fontSize: 12 }}>{m.description}</div>
                    {m.resolution && <div style={{ fontSize: 11, color: C.green, marginTop: 2, fontWeight: 600 }}>✅ {m.resolution}</div>}
                  </Card>
                ))}
            </div>
          </SectionBg>
        )}

        {/* ── LOGS ── */}
        {tab === "logs" && (
          <SectionBg bg={C.yellow}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 28, textAlign: "center", marginBottom: 12, letterSpacing: 2 }}>📜 Town Logs</h2>
            <div style={{ maxWidth: 800, margin: "0 auto" }}>
              {logs.length===0 ? <Card style={{ textAlign: "center" }}>No logs yet</Card> :
                logs.map(l => (
                  <div key={l.id} style={{ display: "flex", gap: 6, padding: "4px 8px", background: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, marginBottom: 2, fontSize: 11 }}>
                    <span style={{ color: C.brown, minWidth: 90, fontSize: 9 }}>{l.created_at}</span>
                    <span style={{ fontWeight: 700, color: STATES[l.state]?.color || C.brown, minWidth: 75 }}>{l.state}</span>
                    <span style={{ minWidth: 80 }}>{l.action}</span>
                    {l.agent_count>0 && <span style={{ color: C.orange, fontSize: 9 }}>🤠×{l.agent_count}</span>}
                    {l.duration_sec>0 && <span style={{ color: C.teal, fontSize: 9 }}>{l.duration_sec.toFixed(1)}s</span>}
                    {l.error && <span style={{ color: C.red, fontSize: 9 }}>💀{l.error.slice(0,30)}</span>}
                    <span style={{ color: C.brown, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.result?.slice(0,50)}</span>
                  </div>
                ))}
            </div>
          </SectionBg>
        )}

        {/* ── HEALTH CHECK ── */}
        {tab === "health" && (
          <SectionBg bg={C.cream}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 28, textAlign: "center", marginBottom: 16, letterSpacing: 2 }}>🔍 Health Check</h2>

            {/* Scan + Fix buttons */}
            <div style={{ textAlign: "center", marginBottom: 20, display: "flex", justifyContent: "center", gap: 12 }}>
              <Btn onClick={scanAll} bg={C.teal} style={{ fontSize: 18, padding: "12px 30px" }}>
                {scanning ? "⏳ Scanning..." : "🔍 SCAN ALL REPOS"}
              </Btn>
              <Btn onClick={fixAll} bg={C.green} style={{ fontSize: 18, padding: "12px 30px" }}>
                {fixing ? "⏳ Fixing..." : "🔧 FIX ALL AUTO-FIXABLE"}
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

      </div>
    </div>
  );
}
