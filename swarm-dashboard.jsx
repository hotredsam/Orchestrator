const { useState, useEffect, useCallback, useRef } = React;

const API = window.__SWARM_API_URL__ || (window.location.port ? window.location.origin : "http://localhost:6969");
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

function RepoReadme({ repoId, Card, C }) {
  const [content, setContent] = useState("");
  const [source, setSource] = useState("");
  useEffect(() => {
    if (repoId) f(`/api/repo-readme?repo_id=${repoId}`).then(r => r.json()).then(d => { setContent(d.content || ""); setSource(d.source || ""); }).catch(() => {});
  }, [repoId]);
  return (
    <details style={{ maxWidth: 680, margin: "0 auto 16px" }}>
      <summary style={{ fontSize: 12, fontWeight: 700, color: C.brown, cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: 1 }}>
        {"\uD83D\uDCC4"} Repo Docs {source ? `(${source})` : ""}
      </summary>
      {content ? (
        <Card bg={C.white} style={{ marginTop: 8, padding: 16 }}>
          <pre style={{ fontSize: 11, lineHeight: 1.5, color: C.darkBrown, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflowY: "auto", fontFamily: "monospace", margin: 0 }}>{content}</pre>
        </Card>
      ) : (
        <div style={{ fontSize: 11, color: C.brown, marginTop: 6, textAlign: "center" }}>No CLAUDE.md or README.md found.</div>
      )}
    </details>
  );
}

function RequestLog() {
  const [entries, setEntries] = useState([]);
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    const url = filter === "error" ? "/api/request-log?limit=50&status=error" : "/api/request-log?limit=50";
    f(url).then(r => r.json()).then(d => setEntries(d.requests || [])).catch(() => {});
  }, [filter]);
  const statusColor = (s) => s >= 500 ? "#E74C3C" : s >= 400 ? "#F7941D" : "#2ECC71";
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {["all", "error"].map(f => (
          <span key={f} onClick={() => setFilter(f)} style={{ cursor: "pointer", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: filter === f ? "#00B4D8" : "#ddd", color: filter === f ? "#fff" : "#333" }}>{f === "all" ? "All" : "Errors Only"}</span>
        ))}
      </div>
      <div style={{ maxHeight: 300, overflowY: "auto", fontSize: 11 }}>
        {entries.map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 8, padding: "3px 6px", borderBottom: "1px solid #eee", fontFamily: "monospace" }}>
            <span style={{ color: "#999", fontSize: 10, minWidth: 55 }}>{e.ts?.slice(11, 19) || ""}</span>
            <span style={{ color: statusColor(e.status), fontWeight: 700, minWidth: 30 }}>{e.status}</span>
            <span style={{ flex: 1 }}>{e.path}</span>
            <span style={{ color: e.latency_ms > 200 ? "#E74C3C" : "#999", minWidth: 55, textAlign: "right" }}>{e.latency_ms}ms</span>
          </div>
        ))}
        {entries.length === 0 && <div style={{ textAlign: "center", padding: 12, color: "#999" }}>No requests logged yet</div>}
      </div>
    </div>
  );
}

function Dashboard() {
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("swarm-dark") === "1");
  const toggleDark = () => { setDarkMode(d => { const v = !d; localStorage.setItem("swarm-dark", v ? "1" : "0"); return v; }); };
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
  const [itemFilter, setItemFilter] = useState("all");
  const [webhooks, setWebhooks] = useState([]);
  const [newWebhook, setNewWebhook] = useState({ url: "", events: "*" });
  const [budgetLimit, setBudgetLimit] = useState(0);
  const [repoSort, setRepoSort] = useState("name");
  const [repoFilter, setRepoFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [memSearch, setMemSearch] = useState("");
  const [toasts, setToasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [apiMetrics, setApiMetrics] = useState(null);
  const [pinnedRepos, setPinnedRepos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("swarm-pinned") || "[]"); } catch { return []; }
  });
  const [uptime, setUptime] = useState("");
  const [sysInfo, setSysInfo] = useState({});
  const [browserNotifs, setBrowserNotifs] = useState(() => localStorage.getItem("swarm-notifs") === "1");
  const [notifPrefs, setNotifPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem("swarm-notif-prefs") || '{"cycles":true,"errors":true,"budget":true,"stale":true}'); }
    catch { return { cycles: true, errors: true, budget: true, stale: true }; }
  });
  const [sourceFilter, setSourceFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [mistakeAnalysis, setMistakeAnalysis] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [trends, setTrends] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [compSort, setCompSort] = useState("name");
  const [agentStats, setAgentStats] = useState(null);
  const [repoNotes, setRepoNotes] = useState([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [globalResults, setGlobalResults] = useState(null);
  const [logLevelFilter, setLogLevelFilter] = useState("all");
  const [logTail, setLogTail] = useState(false);
  const logEndRef = useRef(null);
  const [scrolledPast, setScrolledPast] = useState(false);
  const [costHistory, setCostHistory] = useState([]);
  const [healthScores, setHealthScores] = useState(null);
  const [sparklines, setSparklines] = useState({});
  const [etas, setEtas] = useState({});
  const [heatmap, setHeatmap] = useState(null);
  const [costForecast, setCostForecast] = useState(null);
  const [healthHistory, setHealthHistory] = useState(null);
  const [masterFocus, setMasterFocus] = useState(-1);
  const [compactMaster, setCompactMaster] = useState(() => localStorage.getItem("swarm-compact-master") === "1");
  const [groupByTag, setGroupByTag] = useState(false);
  const [compactItems, setCompactItems] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(() => parseInt(localStorage.getItem("swarm-refresh") || "3000"));
  const [staleItems, setStaleItems] = useState([]);
  const [recentErrors, setRecentErrors] = useState([]);
  const [circuitBreakers, setCircuitBreakers] = useState([]);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [newNote, setNewNote] = useState("");
  const [batchSelected, setBatchSelected] = useState(new Set());
  const mRec = useRef(null);
  const chnk = useRef([]);
  const tmr = useRef(null);
  const sseRef = useRef(null);
  const sseRetries = useRef(0);

  // Toast notification system
  const [toastHistory, setToastHistory] = useState([]);
  const [showToastHistory, setShowToastHistory] = useState(false);
  const showToast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-4), { id, message, type }]);
    setToastHistory(prev => [...prev.slice(-49), { id, message, type, time: new Date().toLocaleTimeString() }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const notify = useCallback((title, body) => {
    if (!browserNotifs) return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    }
  }, [browserNotifs]);

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
      es.addEventListener("watchdog", (e) => {
        try {
          const d = JSON.parse(e.data);
          showToast(`Watchdog restarted ${d.repo_name || "repo"}`, "warning");
          load();
        } catch {}
      });
      es.addEventListener("error_event", (e) => {
        try {
          const d = JSON.parse(e.data);
          showToast(`Error in ${d.repo_name || "repo"}: ${(d.error || "").slice(0, 80)}`, "error");
          notify("Swarm Error", `${d.repo_name || "repo"}: ${(d.error || "").slice(0, 80)}`);
        } catch {}
      });
      es.addEventListener("cycle_complete", (e) => {
        try {
          const d = JSON.parse(e.data);
          showToast(`${d.repo || "Repo"} completed cycle #${d.cycle} (${d.items_done}/${d.items_total} items, ${d.tests_passed} tests)`, "success");
          notify("Cycle Complete", `${d.repo} cycle #${d.cycle}: ${d.items_done}/${d.items_total} items done`);
          load();
        } catch {}
      });
      es.addEventListener("budget_exceeded", (e) => {
        try {
          const d = JSON.parse(e.data);
          showToast(`${d.repo || "Repo"} paused: budget $${d.budget?.toFixed(2)} exceeded ($${d.cost?.toFixed(2)} spent)`, "warning");
          notify("Budget Exceeded", `${d.repo} paused: $${d.cost?.toFixed(2)} spent`);
          load();
        } catch {}
      });
      es.addEventListener("connected", () => { setSseConnected(true); sseRetries.current = 0; });
      es.onerror = () => { setSseConnected(false); es.close(); sseRetries.current++; const delay = Math.min(5000 * sseRetries.current, 30000); setTimeout(connect, delay); };
    };
    connect();
    return () => { if (sseRef.current) sseRef.current.close(); };
  }, []);

  const tabRef = useRef(tab);
  tabRef.current = tab;

  const load = useCallback(async (full = true) => {
    try {
      const repoUrl = repoFilter === "archived" ? "/api/repos?include_archived=1" : "/api/repos";
      const r = await f(repoUrl);
      if (r.ok) { const d = await r.json(); setRepos(d); if (!sr && d.length) setSR(d[0].id); }
      setCon(true);
    } catch(err) { console.warn("Server connection lost:", err.message); setCon(false); setLoading(false); return; }
    if (!sr) { setLoading(false); return; }
    const t = tabRef.current;
    try {
      // Always fetch items + plan (shown in home/master), rest based on active tab
      const fetches = [f(`/api/items?repo_id=${sr}`), f(`/api/plan?repo_id=${sr}`)];
      const keys = ["items", "plan"];
      if (full || t === "home" || t === "logs") { fetches.push(f(`/api/logs?repo_id=${sr}`)); keys.push("logs"); }
      if (full || t === "home") { fetches.push(f(`/api/notes?repo_id=${sr}`)); keys.push("repoNotes"); }
      if (full || t === "agents") {
        fetches.push(f(`/api/agents?repo_id=${sr}`)); keys.push("agents");
        fetches.push(f(`/api/agent-stats?repo_id=${sr}`)); keys.push("agentStats");
      }
      if (full || t === "memory") { fetches.push(f(`/api/memory?repo_id=${sr}`)); keys.push("memory"); }
      if (full || t === "mistakes") {
        fetches.push(f(`/api/mistakes?repo_id=${sr}`)); keys.push("mistakes");
        fetches.push(f(`/api/mistakes/analysis?repo_id=${sr}`)); keys.push("mistakeAnalysis");
      }
      if (full || t === "audio") { fetches.push(f(`/api/audio?repo_id=${sr}`)); keys.push("audio"); }
      if (full || t === "history") { fetches.push(f(`/api/history?repo_id=${sr}`)); keys.push("history"); }
      const results = await Promise.all(fetches);
      const setters = { items: setItems, plan: setPlan, logs: setLogs, agents: setAgents, agentStats: setAgentStats, memory: setMemory, mistakes: setMistakes, mistakeAnalysis: setMistakeAnalysis, audio: setAudio, history: setHistory, repoNotes: setRepoNotes };
      for (let i = 0; i < keys.length; i++) {
        if (results[i].ok) { const d = await results[i].json(); setters[keys[i]](d); }
      }
      // Fetch costs + webhooks + budget
      try { const cr = await f("/api/costs"); if(cr.ok) { const cd = await cr.json(); if(cd.costs) setCosts(cd.costs); } } catch {}
      if (full || t === "settings") {
        try { const wr = await f("/api/webhooks"); if(wr.ok) { const wd = await wr.json(); setWebhooks(wd.webhooks || []); } } catch {}
        try { const br = await f("/api/budget"); if(br.ok) { const bd = await br.json(); setBudgetLimit(bd.budget_limit || 0); } } catch {}
      }
      if (full || t === "metrics") {
        try { const mr = await f("/api/metrics"); if(mr.ok) setApiMetrics(await mr.json()); } catch {}
      }
      if (full || t === "trends") {
        try { const tr = await f(`/api/trends?repo_id=${sr}&days=14`); if(tr.ok) setTrends(await tr.json()); } catch {}
        try { const ch = await f("/api/costs/history?days=30"); if(ch.ok) { const cd = await ch.json(); setCostHistory(cd.history || []); } } catch {}
      }
      if (full || t === "compare") {
        try { const cr = await f("/api/comparison"); if(cr.ok) setComparison(await cr.json()); } catch {}
      }
      try { const sr2 = await f("/api/status"); if(sr2.ok) { const sd = await sr2.json(); setUptime(sd.uptime || ""); setSysInfo({ threads: sd.threads, mem: sd.memory_mb, pid: sd.pid }); } } catch {}
      if (full || t === "home") {
        try { const sl = await f("/api/stale-items?hours=2"); if(sl.ok) { const sd = await sl.json(); setStaleItems(sd.stale_items || []); } } catch {}
        try { const er = await f("/api/errors/recent?limit=5"); if(er.ok) { const ed = await er.json(); setRecentErrors(ed.errors || []); } } catch {}
      }
      if (full || t === "health") {
        try { const cb = await f("/api/circuit-breakers"); if(cb.ok) { const cd = await cb.json(); setCircuitBreakers(cd.circuit_breakers || []); } } catch {}
        try { const hs = await f("/api/health/detailed"); if(hs.ok) setHealthScores(await hs.json()); } catch {}
        try { const sp = await f("/api/sparklines"); if(sp.ok) { const sd = await sp.json(); setSparklines(sd.sparklines || {}); } } catch {}
        try { const et = await f("/api/eta"); if(et.ok) { const ed = await et.json(); setEtas(ed.etas || {}); } } catch {}
        try { const hm = await f("/api/heatmap"); if(hm.ok) setHeatmap(await hm.json()); } catch {}
        try { const cf = await f("/api/cost-forecast"); if(cf.ok) setCostForecast(await cf.json()); } catch {}
        try { const hh = await f("/api/health/history"); if(hh.ok) setHealthHistory(await hh.json()); } catch {}
      }
    } catch(err) { console.warn("Data fetch error:", err.message); }
    setLoading(false);
  }, [sr]);

  useEffect(() => { load(true); const i = setInterval(() => load(false), refreshInterval); return () => clearInterval(i); }, [load, refreshInterval]);

  // Auto-scroll logs when tail mode is on
  useEffect(() => { if (logTail && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [logTail, logs]);

  // Sticky header on scroll
  useEffect(() => {
    const onScroll = () => setScrolledPast(window.scrollY > 180);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Keyboard shortcuts
  const [showHelp, setShowHelp] = useState(false);
  useEffect(() => {
    const handler = (e) => {
      // Ctrl+K command palette works from anywhere
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setShowCommandPalette(prev => !prev); setCmdQuery(""); return; }
      if (e.key === "Escape" && showCommandPalette) { setShowCommandPalette(false); return; }
      // Don't handle when typing in inputs
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
      const TABS_LIST = ["home","master","flow","items","plan","audio","agents","memory","mistakes","logs","history","health","metrics","trends","compare","settings"];
      if (e.key >= "1" && e.key <= "9") { e.preventDefault(); const idx = parseInt(e.key) - 1; if (TABS_LIST[idx]) setTab(TABS_LIST[idx]); }
      if (e.key === "0") { e.preventDefault(); setTab("logs"); }
      if (e.key === "s" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (sr) f(`/api/${repo?.running ? "stop" : "start"}`, { method: "POST", body: JSON.stringify({ repo_id: sr }) }).then(load); }
      if (e.key === "p" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); if (sr && repo?.running) f(`/api/${repo?.paused ? "resume" : "pause"}`, { method: "POST", body: JSON.stringify({ repo_id: sr }) }).then(load); }
      if (e.key === "r" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); load(); }
      if (e.key === "d" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); toggleDark(); }
      if (e.key === "/") { e.preventDefault(); setTab("home"); setTimeout(() => { const el = document.querySelector("input[placeholder*='command']"); if (el) el.focus(); }, 100); }
      if (e.key === "Escape") { setShowHelp(false); setSelectedItems(new Set()); }
      if (e.key === "?") setShowHelp(prev => !prev);
      if (e.key === "f" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setTimeout(() => { const el = document.querySelector("input[placeholder*='Search'],input[placeholder*='search'],input[placeholder*='Filter']"); if (el) el.focus(); }, 50); }
      if (e.key === "c" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setSourceFilter("all"); setPriorityFilter("all"); setItemFilter("all"); setLogSearch(""); setMemSearch(""); setRepoFilter("all"); setSelectedItems(new Set()); }
      if (e.key === "[") { e.preventDefault(); const ci = TABS_LIST.indexOf(tab); if (ci > 0) setTab(TABS_LIST[ci - 1]); }
      if (e.key === "]") { e.preventDefault(); const ci = TABS_LIST.indexOf(tab); if (ci < TABS_LIST.length - 1) setTab(TABS_LIST[ci + 1]); }
      // j/k navigation in master view
      if (tab === "master" && e.key === "j") { e.preventDefault(); setMasterFocus(prev => { const next = Math.min(prev + 1, repos.length - 1); const cards = document.querySelectorAll(".master-card"); if (cards[next]) cards[next].scrollIntoView({ behavior: "smooth", block: "nearest" }); return next; }); }
      if (tab === "master" && e.key === "k") { e.preventDefault(); setMasterFocus(prev => { const next = Math.max(prev - 1, 0); const cards = document.querySelectorAll(".master-card"); if (cards[next]) cards[next].scrollIntoView({ behavior: "smooth", block: "nearest" }); return next; }); }
      if (tab === "master" && e.key === "Enter" && masterFocus >= 0 && masterFocus < repos.length) {
        e.preventDefault(); const r = repos[masterFocus]; if (r) { setSR(r.id); setTab("flow"); }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sr, repo]);

  const repo = repos.find(r => r.id === sr);
  const cs = repo?.state || "idle";
  const si = STATES[cs] || STATES.idle;
  const st = repo?.stats || {};

  const addItem = async () => {
    if (!ni.title || !ni.description || !sr) return;
    await apiAction("/api/items", { method: "POST", body: JSON.stringify({ ...ni, repo_id: sr }) }, "Item added");
    setNI(p => ({ ...p, title: "", description: "" }));
  };
  const deleteItem = async (itemId) => {
    if (!sr) return;
    await apiAction("/api/items/delete", { method: "POST", body: JSON.stringify({ repo_id: sr, item_id: itemId }) }, "Item deleted");
  };
  const clearItems = async (status) => {
    if (!sr) return;
    const label = status || "all";
    if (!confirm(`Clear ${label} items? This cannot be undone.`)) return;
    await apiAction("/api/items/clear", { method: "POST", body: JSON.stringify({ repo_id: sr, ...(status ? { status } : {}) }) }, `${label} items cleared`);
  };
  const dedupeItems = async () => {
    if (!sr) return;
    const r = await f("/api/items/dedupe", { method: "POST", body: JSON.stringify({ repo_id: sr }) });
    if (r.ok) {
      const d = await r.json();
      showToast(`Removed ${d.duplicates_removed} duplicates (${d.remaining} remaining)`, d.duplicates_removed > 0 ? "success" : "info");
      load();
    } else showToast("Dedupe failed", "error");
  };
  const retryItem = async (itemId) => {
    if (!sr) return;
    await apiAction("/api/items/retry", { method: "POST", body: JSON.stringify({ repo_id: sr, item_id: itemId }) }, "Item re-queued");
  };
  const quickStatusChange = async (itemId, newStatus) => {
    if (!sr) return;
    await apiAction("/api/items/update", { method: "POST", body: JSON.stringify({ repo_id: sr, item_id: itemId, status: newStatus }) }, `Item marked ${newStatus}`);
  };
  const togglePin = (repoId) => {
    setPinnedRepos(prev => {
      const next = prev.includes(repoId) ? prev.filter(id => id !== repoId) : [...prev, repoId];
      localStorage.setItem("swarm-pinned", JSON.stringify(next));
      return next;
    });
  };
  const retryAllCompleted = async () => {
    if (!sr) return;
    if (!confirm("Re-queue all completed items back to pending?")) return;
    await apiAction("/api/items/retry", { method: "POST", body: JSON.stringify({ repo_id: sr, status: "completed" }) }, "All completed items re-queued");
  };
  const bulkUpdateItems = async (action, value) => {
    if (!sr || selectedItems.size === 0) return;
    const label = action === "delete" ? "Delete" : `Set ${action.replace("change_", "")} to ${value}`;
    if (!confirm(`${label} for ${selectedItems.size} items?`)) return;
    await apiAction("/api/items/bulk-update", { method: "POST", body: JSON.stringify({ repo_id: sr, item_ids: [...selectedItems], action, value }) }, `${selectedItems.size} items updated`);
    setSelectedItems(new Set());
  };
  const toggleSelectItem = (id) => setSelectedItems(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleSelectAll = () => {
    const visible = items.filter(it => (itemFilter === "all" || it.status === itemFilter) && (sourceFilter === "all" || it.source === sourceFilter) && (priorityFilter === "all" || it.priority === priorityFilter));
    setSelectedItems(prev => prev.size === visible.length ? new Set() : new Set(visible.map(it => it.id)));
  };
  const addRepo = async () => {
    if (!nr.name || !nr.path) return;
    await apiAction("/api/repos", { method: "POST", body: JSON.stringify(nr) }, "Repo registered");
    setNR({ name: "", path: "", github_url: "", branch: "main" });
  };
  const startRepo = async id => { await apiAction("/api/start", { method: "POST", body: JSON.stringify({ repo_id: id }) }, "Repo started"); };
  const stopRepo = async id => { await apiAction("/api/stop", { method: "POST", body: JSON.stringify({ repo_id: id }) }, "Repo stopped"); };
  const startAll = async () => { await apiAction("/api/start", { method: "POST", body: JSON.stringify({ repo_id: "all" }) }, "All repos started"); };
  const stopAll = async () => { await apiAction("/api/stop", { method: "POST", body: JSON.stringify({ repo_id: "all" }) }, "All repos stopped"); };
  const pauseRepo = async id => { await apiAction("/api/pause", { method: "POST", body: JSON.stringify({ repo_id: id }) }, "Repo paused"); };
  const resumeRepo = async id => { await apiAction("/api/resume", { method: "POST", body: JSON.stringify({ repo_id: id }) }, "Repo resumed"); };
  const deleteRepo = async id => { if(confirm("Remove this repo from Swarm Town? (files on disk are kept)")) { await apiAction("/api/repos/delete", { method: "POST", body: JSON.stringify({ repo_id: id }) }, "Repo removed"); } };
  const pushGH = async () => { if(sr) await apiAction("/api/push", { method: "POST", body: JSON.stringify({ repo_id: sr, message: "manual push" }) }, "Push sent"); };

  const exportLogs = () => {
    const repoName = repo?.name || "repo";
    const data = logs.map(l => ({
      time: l.created_at, state: l.state, action: l.action,
      result: l.result, error: l.error, cost: l.cost_usd, duration: l.duration_sec,
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `swarm-logs-${repoName}-${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast(`Exported ${logs.length} log entries`, "success");
  };

  const addNote = async () => {
    if (!sr || !newNote.trim()) return;
    await apiAction("/api/notes", { method: "POST", body: JSON.stringify({ repo_id: sr, action: "add", text: newNote }) }, "Note added");
    setNewNote("");
  };
  const deleteNote = async (key) => {
    if (!sr) return;
    await apiAction("/api/notes", { method: "POST", body: JSON.stringify({ repo_id: sr, action: "delete", key }) }, "Note deleted");
  };
  const searchGlobal = async (query) => {
    if (!query || query.length < 2) { setGlobalResults(null); return; }
    try {
      const r = await f(`/api/search?q=${encodeURIComponent(query)}&scope=all&limit=30`);
      const d = await r.json();
      setGlobalResults(d);
    } catch { setGlobalResults(null); }
  };
  const reorderStep = async (stepId, direction) => {
    if (!sr) return;
    await apiAction("/api/plan/reorder", { method: "POST", body: JSON.stringify({ repo_id: sr, step_id: stepId, direction }) }, `Step moved ${direction}`);
  };
  const importItems = async (jsonText) => {
    if (!sr) return;
    try {
      const items = JSON.parse(jsonText);
      await apiAction("/api/items/import", { method: "POST", body: JSON.stringify({ repo_id: sr, items: Array.isArray(items) ? items : [items] }) }, "Items imported");
    } catch { showToast("Invalid JSON", "error"); }
  };
  const exportComparison = () => {
    if (!comparison?.repos?.length) return;
    const header = "Name,State,Cost,Cost/Item,Items Done,Items Total,Error Rate,Cycles,Actions\n";
    const rows = comparison.repos.map(r => `"${r.name}",${r.state},${r.cost},${r.cost_per_item},${r.items_done},${r.items_total},${r.error_rate}%,${r.cycles},${r.total_actions}`).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `swarm-comparison-${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast(`Exported ${comparison.repos.length} repos to CSV`, "success");
  };
  const scanAll = async () => {
    setScanning(true);
    try {
      const r = await f("/api/health-scan");
      if(r.ok) { setHealthData(await r.json()); showToast("Health scan complete", "success"); }
      else showToast("Health scan failed", "error");
    } catch(e) { showToast(`Scan error: ${e.message}`, "error"); }
    setScanning(false);
  };
  const fixAll = async () => {
    setFixing(true);
    try { await f("/api/fix-all", { method: "POST", body: JSON.stringify({}) }); await scanAll(); showToast("Auto-fix applied", "success"); }
    catch(e) { showToast(`Fix error: ${e.message}`, "error"); }
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
      } else {
        showToast("Chat request failed", "error");
      }
    } catch(e) { showToast(`Chat error: ${e.message}`, "error"); }
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

  // Error-aware API caller for actions
  const apiAction = useCallback(async (url, opts, successMsg) => {
    try {
      const r = await f(url, opts);
      if (r.ok) {
        if (successMsg) showToast(successMsg, "success");
        load();
        return true;
      }
      const d = await r.json().catch(() => ({}));
      showToast(d.error || `Request failed (${r.status})`, "error");
      return false;
    } catch (err) {
      showToast(`Connection error: ${err.message}`, "error");
      return false;
    }
  }, [showToast, load]);

  const C = darkMode ? {
    orange: "#E8850F", teal: "#0097B8", cream: "#1E1E2E", yellow: "#D4A830",
    sky: "#0D1117", sand: "#2D2D3D", red: "#E74C3C", green: "#2ECC71",
    darkBrown: "#C0C0C0", brown: "#999999", white: "#1A1A2E",
    lightOrange: "#3D2B1F", lightTeal: "#1A3040",
  } : {
    orange: "#F7941D", teal: "#00B4D8", cream: "#FFF8E7", yellow: "#FFE066",
    sky: "#87CEEB", sand: "#F4D35E", red: "#E74C3C", green: "#2ECC71",
    darkBrown: "#3D2B1F", brown: "#5D4037", white: "#FFFFFF",
    lightOrange: "#FFD699", lightTeal: "#B2EBF2",
  };

  const Card = ({ children, bg = C.white, style, className, ...p }) => (
    <div className={`hover-card ${className||""}`} style={{ background: bg, border: `3px solid ${C.darkBrown}`, borderRadius: 12, padding: 16, boxShadow: `0 2px 4px rgba(0,0,0,.1), 0 4px 12px rgba(0,0,0,.08), 3px 3px 0 ${darkMode ? '#000' : '#3D2B1F'}`, transition: "transform .2s ease, box-shadow .2s ease", ...style }} {...p}>{children}</div>
  );
  const Inp = ({ style, ...p }) => (
    <input style={{ width: "100%", padding: "10px 14px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, color: C.darkBrown, fontSize: 14, fontFamily: "'Fredoka', sans-serif", boxSizing: "border-box", outline: "none", transition: "border-color .2s, box-shadow .2s", ...style }} {...p} />
  );
  const Btn = ({ children, bg = C.orange, color = C.white, style, ...p }) => (
    <button className="hover-pop" style={{ padding: "12px 24px", background: bg, border: `3px solid ${C.darkBrown}`, borderRadius: 12, color, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: 1.5, boxShadow: `0 2px 4px rgba(0,0,0,.12), 3px 3px 0 ${darkMode ? '#000' : '#3D2B1F'}`, transition: "transform .15s, filter .15s, box-shadow .15s", ...style }}
      onMouseDown={e => e.target.style.transform = "translate(2px,2px) scale(0.97)"}
      onMouseUp={e => e.target.style.transform = ""} onMouseOut={e => e.target.style.transform = ""} {...p}>{children}</button>
  );

  const SectionBg = ({ children, bg, style }) => (
    <div style={{ background: bg, padding: "28px 24px", ...style }}>{children}</div>
  );

  /* Tiny SVG sparkline for inline trend visualization */
  const Sparkline = ({ data = [], width = 60, height = 16, color = C.teal }) => {
    if (!data.length) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const pts = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * width},${height - ((v - min) / range) * (height - 2) - 1}`).join(" ");
    return (
      <svg width={width} height={height} style={{ display: "block" }}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  /* Circular progress ring */
  const ProgressRing = ({ done = 0, total = 1, size = 32, strokeWidth = 3, color = C.teal }) => {
    const pct = total > 0 ? Math.min(done / total, 1) : 0;
    const r = (size - strokeWidth) / 2;
    const circ = 2 * Math.PI * r;
    const offset = circ * (1 - pct);
    return (
      <svg width={size} height={size} style={{ display: "block", transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`${C.darkBrown}15`} strokeWidth={strokeWidth} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s" }} />
      </svg>
    );
  };

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
    { id: "metrics", label: "📊 Metrics" },
    { id: "trends", label: "📈 Trends" },
    { id: "compare", label: "⚖️ Compare" },
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
        @media(max-width:700px){
          .cactus-right{display:none!important}
          select{max-width:130px!important;font-size:11px!important}
          button{min-height:36px}
        }
        @media(max-width:480px){
          h1{font-size:32px!important;letter-spacing:3px!important}
          h2{font-size:24px!important}
          h3{font-size:18px!important}
          .stat-card{min-width:80px!important;padding:8px!important}
          .toast-container{max-width:90vw!important;right:5vw!important}
        }
        @media(max-width:360px){
          h1{font-size:24px!important}
          p{font-size:11px!important}
        }
        @media(max-width:640px){
          .repo-grid{grid-template-columns:1fr!important}
        }
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
        @keyframes toastIn{from{opacity:0;transform:translateX(100%)}to{opacity:1;transform:translateX(0)}}
        @keyframes toastOut{from{opacity:1}to{opacity:0;transform:translateX(100%)}}
        .toast-container{position:fixed;top:80px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none}
        .toast{padding:10px 16px;border-radius:10px;border:2px solid ${C.darkBrown};font-family:'Fredoka',sans-serif;font-size:13px;font-weight:600;color:${C.white};animation:toastIn .3s ease;pointer-events:auto;max-width:320px;box-shadow:0 4px 12px rgba(0,0,0,.2)}
        .toast-success{background:#2ECC71}
        .toast-error{background:#E74C3C}
        .toast-info{background:#00B4D8}
        .toast-warning{background:#F7941D}
        .connection-banner{background:${C.red};color:${C.white};text-align:center;padding:8px 16px;font-size:13px;font-weight:700;font-family:'Fredoka',sans-serif;border-bottom:2px solid ${C.darkBrown};animation:pulse 2s infinite}
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

        {/* Status pill + Dark mode + Global repo selector */}
        <div style={{ position: "absolute", top: 12, right: 16, display: "flex", alignItems: "center", gap: 8, zIndex: 3 }}>
          {repos.length > 0 && <select value={sr||""} onChange={e => setSR(Number(e.target.value))}
            style={{ padding: "5px 10px", background: C.yellow, border: `3px solid ${C.darkBrown}`, borderRadius: 12, fontSize: 13, fontFamily: "'Bangers', cursive", fontWeight: 700, letterSpacing: 1, color: C.darkBrown, outline: "none", cursor: "pointer", maxWidth: 180 }}>
            {[...repos].sort((a, b) => { const pa = pinnedRepos.includes(a.id) ? 0 : 1; const pb = pinnedRepos.includes(b.id) ? 0 : 1; return pa - pb || a.name.localeCompare(b.name); }).map(r => <option key={r.id} value={r.id}>{pinnedRepos.includes(r.id) ? "\uD83D\uDCCC " : ""}{r.name} [{r.state || "idle"}]</option>)}
          </select>}
          {uptime && (
            <div title={`PID: ${sysInfo.pid || "?"} | Threads: ${sysInfo.threads || "?"} | RAM: ${sysInfo.mem || "?"}MB`} style={{ background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: C.darkBrown, cursor: "help" }}>{"\u23F1\uFE0F"} {uptime}{sysInfo.mem ? ` | ${sysInfo.mem}MB` : ""}</div>
          )}
          {Object.keys(costs).length > 0 && (
            <div style={{ background: "#E8F5E9", border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#2E7D32" }}>
              ${Object.values(costs).reduce((a,b) => a+b, 0).toFixed(2)}
            </div>
          )}
          <div title={sseConnected ? "Live updates connected" : "Live updates disconnected — reconnecting..."} style={{ width: 10, height: 10, borderRadius: "50%", background: sseConnected ? "#4CAF50" : "#F44336", border: `2px solid ${C.darkBrown}`, animation: sseConnected ? "none" : "pulse 1.5s infinite" }} />
          <button onClick={() => setShowToastHistory(prev => !prev)} style={{ background: darkMode ? "#2D2D3D" : C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 10px", fontSize: 14, cursor: "pointer", lineHeight: 1, position: "relative" }} title="Notification history">
            {"\uD83D\uDD14"}
            {toastHistory.length > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: C.red, color: C.white, borderRadius: "50%", width: 16, height: 16, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{Math.min(toastHistory.length, 99)}</span>}
          </button>
          <button onClick={toggleDark} style={{ background: darkMode ? "#2D2D3D" : C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 10px", fontSize: 14, cursor: "pointer", lineHeight: 1 }} title="Toggle dark mode">
            {darkMode ? "\uD83C\uDF19" : "\u2600\uFE0F"}
          </button>
          <div style={{ background: connected ? C.green : C.red, border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#FFFFFF", animation: connected ? "none" : "pulse 1s infinite" }}>
            {connected ? "● LIVE" : "● OFFLINE"}
          </div>
        </div>
      </div>

      {/* Toast History Dropdown */}
      {showToastHistory && (
        <div style={{ position: "fixed", top: 60, right: 16, width: 340, maxHeight: 400, overflowY: "auto", zIndex: 200, background: dark ? "#2D2D2D" : C.white, border: `3px solid ${C.darkBrown}`, borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1 }}>Notifications</span>
            <button onClick={() => { setToastHistory([]); setShowToastHistory(false); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.brown, textDecoration: "underline" }}>Clear All</button>
          </div>
          {toastHistory.length === 0 ? (
            <div style={{ textAlign: "center", fontSize: 12, color: C.brown, padding: 20 }}>No notifications yet.</div>
          ) : [...toastHistory].reverse().map((t, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 8px", borderBottom: `1px solid ${C.darkBrown}11`, fontSize: 11 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: t.type === "error" ? C.red : t.type === "warning" ? C.orange : t.type === "success" ? C.green : C.teal }} />
              <span style={{ flex: 1, color: dark ? "#E0E0E0" : C.darkBrown }}>{t.message}</span>
              <span style={{ fontSize: 9, color: C.brown, minWidth: 55 }}>{t.time}</span>
            </div>
          ))}
        </div>
      )}

      {/* ═══ NAV TABS + STICKY REPO BAR ═══ */}
      <div style={{ position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ background: C.orange, display: "flex", overflow: "auto", borderBottom: scrolledPast ? "none" : `3px solid ${C.darkBrown}`, gap: 0 }}>
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
        {scrolledPast && repos.length > 0 && (
          <div style={{ background: dark ? "#1E1E2E" : C.cream, borderBottom: `3px solid ${C.darkBrown}`, padding: "4px 16px", display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontFamily: "'Fredoka', sans-serif" }}>
            <select value={sr||""} onChange={e => setSR(Number(e.target.value))}
              style={{ padding: "3px 8px", background: C.yellow, border: `2px solid ${C.darkBrown}`, borderRadius: 8, fontSize: 11, fontFamily: "'Bangers', cursive", fontWeight: 700, letterSpacing: 1, color: C.darkBrown, outline: "none", cursor: "pointer", maxWidth: 160 }}>
              {[...repos].sort((a, b) => { const pa = pinnedRepos.includes(a.id) ? 0 : 1; const pb = pinnedRepos.includes(b.id) ? 0 : 1; return pa - pb || a.name.localeCompare(b.name); }).map(r => <option key={r.id} value={r.id}>{pinnedRepos.includes(r.id) ? "\uD83D\uDCCC " : ""}{r.name}</option>)}
            </select>
            {(() => { const cr = repos.find(r => r.id === sr); if (!cr) return null; const s = cr.stats || {}; return (<>
              <span style={{ fontWeight: 700, color: STATES[cr.state]?.color || C.brown }}>{cr.state || "idle"}</span>
              <span style={{ color: C.brown }}>Items: {s.items_done||0}/{s.items_total||0}</span>
              <span style={{ color: C.brown }}>Steps: {s.steps_done||0}/{s.steps_total||0}</span>
              {connected && <span style={{ color: C.green, fontWeight: 700 }}>{"\u25CF"} LIVE</span>}
            </>); })()}
          </div>
        )}
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

        {/* Loading skeleton */}
        {loading && repos.length === 0 && (
          <SectionBg bg={`linear-gradient(180deg, ${C.cream} 0%, #F5E6C8 100%)`}>
            <div style={{ textAlign: "center", padding: 60 }}>
              <div style={{ fontSize: 48, marginBottom: 12, animation: "wiggle 2s infinite" }}>{"\uD83C\uDFDC\uFE0F"}</div>
              <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, letterSpacing: 2, marginBottom: 8 }}>Loading Swarm Town...</div>
              <div style={{ fontSize: 13, color: C.brown }}>Connecting to the orchestrator on port 6969</div>
            </div>
          </SectionBg>
        )}

        {/* ── HOME / TOWN SQUARE ── */}
        {tab === "home" && (<>
          {/* START ALL banner */}
          <SectionBg bg={`linear-gradient(180deg, ${C.cream} 0%, #F5E6C8 100%)`}>
            <div style={{ textAlign: "center", marginBottom: 20, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Btn onClick={startAll} bg={C.green} style={{ fontSize: 24, padding: "16px 48px", animation: repos.some(r=>r.running) ? "none" : "wiggle 2s infinite" }}>
                {"\uD83D\uDE80"} START ALL
              </Btn>
              {repos.some(r => r.running) && (
                <Btn onClick={stopAll} bg={C.red} style={{ fontSize: 24, padding: "16px 48px" }}>
                  {"\u23F9\uFE0F"} STOP ALL
                </Btn>
              )}
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
              {[
                { emoji: "\uD83D\uDCE6", label: "Repos", val: repos.length, bg: C.lightOrange },
                { emoji: "\u26A1", label: "Running", val: repos.filter(r=>r.running).length, bg: C.lightTeal },
                { emoji: "\uD83D\uDCCB", label: "Items", val: repos.reduce((s,r)=>(s+(r.stats?.items_total||0)),0), bg: C.yellow },
                { emoji: "\u2705", label: "Done", val: repos.reduce((s,r)=>(s+(r.stats?.items_done||0)),0), bg: C.lightTeal },
                { emoji: "\uD83E\uDD20", label: "Agents", val: repos.reduce((s,r)=>(s+(r.stats?.agents||0)),0), bg: C.lightOrange },
                { emoji: "\uD83D\uDCB0", label: "Total Cost", val: "$" + Object.values(costs).reduce((s,v)=>s+v,0).toFixed(2), bg: C.yellow },
              ].map((s,i) => (
                <div key={i} className="stat-card" style={{ background: `linear-gradient(135deg, ${s.bg} 0%, ${s.bg}ee 100%)`, border: `3px solid ${C.darkBrown}`, borderRadius: 14, padding: "12px 20px", textAlign: "center", boxShadow: "0 2px 4px rgba(0,0,0,.1), 3px 3px 0 #3D2B1F", minWidth: 95, transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" }}>
                  <div style={{ fontSize: 26 }}>{s.emoji}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 32, letterSpacing: 1, lineHeight: 1 }}>{s.val}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.brown, marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
            {/* Overall Progress */}
            {(() => {
              const totalItems = repos.reduce((s, r) => s + (r.stats?.items_total || 0), 0);
              const doneItems = repos.reduce((s, r) => s + (r.stats?.items_done || 0), 0);
              const overallPct = totalItems > 0 ? Math.round(doneItems / totalItems * 100) : 0;
              return totalItems > 0 && (
                <div style={{ maxWidth: 500, margin: "0 auto 16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
                    <span>Overall Swarm Progress</span>
                    <span>{doneItems}/{totalItems} items ({overallPct}%)</span>
                  </div>
                  <div style={{ background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 10, height: 18, overflow: "hidden", position: "relative" }}>
                    <div style={{ height: "100%", borderRadius: 8, background: `linear-gradient(90deg, ${C.green}, ${C.teal})`, width: `${overallPct}%`, transition: "width .5s" }} />
                  </div>
                </div>
              );
            })()}
            {/* Running Repos Strip */}
            {repos.filter(r => r.running).length > 0 && (
              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
                {repos.filter(r => r.running).map(r => {
                  const rst = STATES[r.state] || STATES.idle;
                  return (
                    <div key={r.id} onClick={() => { setSR(r.id); setTab("flow"); }}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: C.white, border: `2px solid ${C.darkBrown}33`, borderRadius: 20, padding: "4px 12px 4px 6px", cursor: "pointer", transition: "transform .15s", fontSize: 12 }}
                      onMouseOver={e => e.currentTarget.style.transform = "scale(1.05)"} onMouseOut={e => e.currentTarget.style.transform = "scale(1)"}>
                      <div style={{ width: 20, height: 20, borderRadius: "50%", background: rst.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, animation: "bounce 2s infinite" }}>{rst.emoji}</div>
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                      <span style={{ color: C.brown, fontSize: 10 }}>{rst.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {/* Activity Heatmap */}
            {heatmap && Object.keys(heatmap.grid || {}).length > 0 && (
              <Card bg={C.white} style={{ maxWidth: 620, margin: "0 auto 12px", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" }}>7-Day Activity Heatmap</div>
                {(() => {
                  const grid = heatmap.grid;
                  const days = [...new Set(Object.keys(grid).map(k => k.split("|")[0]))].sort();
                  const maxVal = Math.max(...Object.values(grid), 1);
                  const hours = Array.from({ length: 24 }, (_, i) => i);
                  return (
                    <div style={{ overflowX: "auto" }}>
                      <div style={{ display: "grid", gridTemplateColumns: `60px repeat(24, 1fr)`, gap: 1, fontSize: 8 }}>
                        <div />
                        {hours.map(h => <div key={h} style={{ textAlign: "center", color: C.brown, fontWeight: 600 }}>{h}</div>)}
                        {days.slice(-7).map(day => (
                          <React.Fragment key={day}>
                            <div style={{ fontSize: 9, color: C.brown, fontWeight: 600, display: "flex", alignItems: "center" }}>{day.slice(5)}</div>
                            {hours.map(h => {
                              const val = grid[`${day}|${h}`] || 0;
                              const intensity = val / maxVal;
                              return (
                                <div key={h} title={`${day} ${h}:00 - ${val} actions`}
                                  style={{ aspectRatio: "1", borderRadius: 2, background: val === 0 ? `${C.darkBrown}08` : `rgba(78, 205, 196, ${0.15 + intensity * 0.85})`, transition: "background 0.3s" }} />
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                      <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 6, fontSize: 9, color: C.brown }}>
                        <span>Less</span>
                        {[0.1, 0.3, 0.5, 0.7, 1].map((v, i) => (
                          <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: `rgba(78, 205, 196, ${0.15 + v * 0.85})` }} />
                        ))}
                        <span>More</span>
                      </div>
                    </div>
                  );
                })()}
              </Card>
            )}

            {/* Cost Forecast */}
            {costForecast && costForecast.total_7d > 0 && (
              <Card bg={C.white} style={{ maxWidth: 620, margin: "0 auto 12px", padding: 14, background: `linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" }}>Cost Forecast (Next 7 Days)</div>
                <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 8 }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 22, color: C.teal }}>${costForecast.total_7d}</div>
                    <div style={{ fontSize: 10, color: C.brown }}>Last 7d</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 22, color: costForecast.trend === "rising" ? C.orange : costForecast.trend === "falling" ? C.green : C.teal }}>
                      {costForecast.trend === "rising" ? "\u2191" : costForecast.trend === "falling" ? "\u2193" : "\u2192"} ${costForecast.forecast_total}
                    </div>
                    <div style={{ fontSize: 10, color: C.brown }}>Forecast 7d</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 22, color: C.brown }}>${costForecast.avg_daily}/day</div>
                    <div style={{ fontSize: 10, color: C.brown }}>Avg Daily</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 40 }}>
                  {[...costForecast.daily_costs, ...costForecast.forecast_7d].map((v, i) => {
                    const all = [...costForecast.daily_costs, ...costForecast.forecast_7d];
                    const max = Math.max(...all, 0.001);
                    const isForecast = i >= costForecast.daily_costs.length;
                    return (
                      <div key={i} style={{ flex: 1, height: `${(v / max) * 36}px`, minHeight: v > 0 ? 3 : 0, background: isForecast ? `${C.orange}88` : C.teal, borderRadius: "2px 2px 0 0", transition: "height 0.3s", opacity: isForecast ? 0.6 : 1 }} title={`$${v}${isForecast ? " (forecast)" : ""}`} />
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.brown, marginTop: 2 }}>
                  <span>Past</span><span>|</span><span>Forecast</span>
                </div>
              </Card>
            )}

            {/* Health History Chart */}
            {healthHistory?.history?.length > 0 && (
              <Card bg={C.white} style={{ maxWidth: 620, margin: "0 auto 12px", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" }}>Health Score Trends</div>
                {(() => {
                  const byRepo = {};
                  healthHistory.history.forEach(h => {
                    if (!byRepo[h.repo_id]) byRepo[h.repo_id] = [];
                    byRepo[h.repo_id].push(h);
                  });
                  const repoIds = Object.keys(byRepo).slice(0, 6);
                  const colors = [C.teal, C.orange, C.green, C.red, "#7E57C2", C.brown];
                  return (
                    <div>
                      <div style={{ height: 60, position: "relative" }}>
                        {repoIds.map((rid, idx) => {
                          const points = byRepo[rid];
                          if (points.length < 2) return null;
                          const pts = points.map((p, i) => `${(i / Math.max(points.length - 1, 1)) * 100}%,${60 - (p.score / 100) * 56}`).join(" ");
                          return (
                            <svg key={rid} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                              <polyline points={pts} fill="none" stroke={colors[idx % colors.length]} strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 4 }}>
                        {repoIds.map((rid, idx) => {
                          const repo = repos.find(r => r.id === parseInt(rid));
                          return (
                            <span key={rid} style={{ fontSize: 9, display: "flex", alignItems: "center", gap: 3 }}>
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors[idx % colors.length], display: "inline-block" }} />
                              {repo?.name || `#${rid}`}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </Card>
            )}

            {/* Stale Items Warning */}
            {staleItems.length > 0 && (
              <Card bg="#FFF3E0" style={{ maxWidth: 620, margin: "0 auto 12px", padding: 12, border: `2px solid ${C.orange}` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 15, letterSpacing: 1, marginBottom: 6, color: C.orange }}>{"\u26A0\uFE0F"} {staleItems.length} Stale Item{staleItems.length > 1 ? "s" : ""} (2h+ in progress)</div>
                {staleItems.slice(0, 5).map((it, i) => (
                  <div key={i} style={{ fontSize: 11, padding: "2px 0", display: "flex", gap: 8 }}>
                    <span style={{ fontWeight: 600, color: C.teal, minWidth: 80 }}>{it.repo_name}</span>
                    <span>{it.title?.slice(0, 50)}</span>
                    <span style={{ color: C.brown, fontSize: 10 }}>since {it.started_at?.slice(11, 19)}</span>
                  </div>
                ))}
              </Card>
            )}
            {/* Circuit Breaker Alert */}
            {circuitBreakers.filter(cb => cb.state !== "closed").length > 0 && (
              <Card bg="#FFEBEE" style={{ maxWidth: 620, margin: "0 auto 12px", padding: 12, border: `2px solid ${C.red}` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 15, letterSpacing: 1, marginBottom: 6, color: C.red }}>{"\u26A1"} {circuitBreakers.filter(cb => cb.state !== "closed").length} Circuit Breaker{circuitBreakers.filter(cb => cb.state !== "closed").length > 1 ? "s" : ""} Tripped</div>
                {circuitBreakers.filter(cb => cb.state !== "closed").map((cb, i) => (
                  <div key={i} style={{ fontSize: 11, padding: "2px 0", display: "flex", gap: 8 }}>
                    <span style={{ fontWeight: 600, color: cb.state === "open" ? C.red : C.orange, minWidth: 80 }}>{cb.repo_name}</span>
                    <span>{cb.state.toUpperCase()} ({cb.failures}/{cb.threshold})</span>
                    {cb.last_failure_ago && <span style={{ color: C.brown, fontSize: 10 }}>{cb.last_failure_ago}s ago</span>}
                  </div>
                ))}
              </Card>
            )}
            {/* Recent Errors */}
            {recentErrors.length > 0 && (
              <Card bg="#FFF3E0" style={{ maxWidth: 620, margin: "0 auto 12px", padding: 12, border: `2px solid ${C.orange}` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 15, letterSpacing: 1, marginBottom: 6, color: C.red }}>{"\uD83D\uDCA5"} Recent Errors ({recentErrors.length})</div>
                {recentErrors.slice(0, 5).map((err, i) => (
                  <div key={i} style={{ fontSize: 11, padding: "3px 0", display: "flex", gap: 8, borderBottom: i < 4 ? `1px solid ${C.darkBrown}11` : "none" }}>
                    <span style={{ fontWeight: 600, color: C.teal, minWidth: 70 }}>{err.repo_name}</span>
                    <span style={{ color: C.red, fontWeight: 600, minWidth: 80 }}>{err.error_type}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.brown }}>{(err.description || "").slice(0, 80)}</span>
                    <span style={{ fontSize: 9, color: C.brown, opacity: 0.6, flexShrink: 0 }}>{err.created_at?.slice(11, 19) || ""}</span>
                  </div>
                ))}
              </Card>
            )}
            {/* Recent Activity Feed */}
            {logs.length > 0 && (
              <Card bg={C.white} style={{ maxWidth: 620, margin: "0 auto", padding: 14 }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, marginBottom: 8 }}>Recent Activity</div>
                {logs.slice(0, 5).map((l, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "4px 0", borderBottom: i < 4 ? `1px solid ${C.darkBrown}11` : "none", fontSize: 12 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: l.error ? C.red : C.green, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, minWidth: 70, color: C.brown }}>{l.state || "—"}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.action || l.result || "—"}</span>
                    <span style={{ fontSize: 10, color: C.brown, opacity: 0.6, flexShrink: 0 }}>{l.created_at?.slice(11, 19) || ""}</span>
                  </div>
                ))}
              </Card>
            )}
            {/* Repo Notes */}
            <details style={{ maxWidth: 620, margin: "10px auto 0" }}>
              <summary style={{ fontSize: 13, fontWeight: 700, color: C.brown, cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: 1 }}>Notes ({repoNotes.length})</summary>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <Inp placeholder="Add a note..." value={newNote} onChange={e => setNewNote(e.target.value)} style={{ flex: 1, fontSize: 12 }} onKeyDown={e => e.key === "Enter" && addNote()} />
                <Btn bg={C.teal} onClick={addNote} style={{ fontSize: 12, padding: "6px 12px" }}>Add</Btn>
              </div>
              {repoNotes.map(n => (
                <div key={n.key} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6, background: C.white, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.darkBrown}22` }}>
                  <span style={{ flex: 1, fontSize: 12, lineHeight: 1.4 }}>{n.value}</span>
                  <span style={{ fontSize: 9, color: C.brown, opacity: 0.6, flexShrink: 0 }}>{n.updated_at?.slice(0, 10)}</span>
                  <button onClick={() => deleteNote(n.key)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.red, opacity: 0.5 }}>{"\u2716"}</button>
                </div>
              ))}
            </details>
          </SectionBg>

          {/* REPO CARDS */}
          <SectionBg bg={`linear-gradient(180deg, ${C.teal} 0%, #009BB8 100%)`} style={{ borderTop: `3px solid ${C.darkBrown}` }}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", color: C.white, textShadow: `2px 2px 0 ${C.darkBrown}`, marginBottom: 12, letterSpacing: 4 }}>
              YOUR REPOS
            </h2>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
              <select value={repoFilter} onChange={e => setRepoFilter(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: `2px solid ${C.darkBrown}`, background: C.cream, fontFamily: "'Fredoka', sans-serif", fontSize: 13, fontWeight: 600 }}>
                <option value="all">All</option>
                <option value="running">Running</option>
                <option value="idle">Idle</option>
                <option value="paused">Paused</option>
                <option value="error">Error</option>
              </select>
              <select value={repoSort} onChange={e => setRepoSort(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: `2px solid ${C.darkBrown}`, background: C.cream, fontFamily: "'Fredoka', sans-serif", fontSize: 13, fontWeight: 600 }}>
                <option value="name">Sort: Name</option>
                <option value="state">Sort: State</option>
                <option value="items">Sort: Items</option>
                <option value="cycles">Sort: Cycles</option>
              </select>
            </div>
            <div className="repo-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {repos.filter(r => {
                if (repoFilter === "all") return true;
                if (repoFilter === "running") return r.running && !r.paused;
                if (repoFilter === "idle") return !r.running;
                if (repoFilter === "paused") return r.paused;
                if (repoFilter === "error") return r.state === "error" || r.state === "credits_exhausted";
                return true;
              }).sort((a, b) => {
                if (repoSort === "name") return (a.name || "").localeCompare(b.name || "");
                if (repoSort === "state") return (a.state || "").localeCompare(b.state || "");
                if (repoSort === "items") return ((b.stats?.items_total || 0) - (a.stats?.items_total || 0));
                if (repoSort === "cycles") return ((b.cycle_count || 0) - (a.cycle_count || 0));
                return 0;
              }).map(r => {
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
                    {/* Error count badge */}
                    {(s.mistakes || 0) > 0 && !r.running && (
                      <div style={{ position: "absolute", top: -1, right: -1, background: C.red, border: `2px solid ${C.darkBrown}`, borderRadius: "0 10px 0 10px", padding: "3px 10px", fontSize: 10, fontWeight: 700, color: C.white, fontFamily: "'Bangers', cursive" }}>{s.mistakes} err</div>
                    )}

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
                      {r.running && (r.paused
                        ? <Btn bg={C.teal} onClick={e => { e.stopPropagation(); resumeRepo(r.id); }} style={{ fontSize: 12, padding: "6px 14px" }}>{"\u25B6"} Resume</Btn>
                        : <Btn bg={C.orange} onClick={e => { e.stopPropagation(); pauseRepo(r.id); }} style={{ fontSize: 12, padding: "6px 14px" }}>{"\u23F8"} Pause</Btn>)}
                      <Btn bg="#888" onClick={e => { e.stopPropagation(); deleteRepo(r.id); }} style={{ fontSize: 11, padding: "5px 10px" }}>{"\u2716"}</Btn>
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
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn onClick={addRepo} bg={C.teal} style={{ fontSize: 13, padding: "7px 16px" }}>Add to Town</Btn>
                  <Btn bg={C.orange} style={{ fontSize: 13, padding: "7px 16px" }} onClick={async () => {
                    if (!nr.github_url) { showToast("Enter a GitHub URL to clone", "error"); return; }
                    showToast("Cloning repository...", "info");
                    const r = await f("/api/repos/clone", { method: "POST", body: JSON.stringify({ url: nr.github_url, name: nr.name || "", branch: nr.branch || "main" }) });
                    if (r.ok) { const d = await r.json(); showToast(d.message || "Cloned!", "success"); setNR({ name: "", path: "", github_url: "", branch: "main" }); load(); }
                    else { const d = await r.json().catch(() => ({})); showToast(d.error || "Clone failed", "error"); }
                  }}>Clone from Git</Btn>
                </div>
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
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 12 }}>Bird's-eye view of every repo in your swarm</p>
            {/* Cross-repo search */}
            <details style={{ maxWidth: 600, margin: "0 auto 12px" }}>
              <summary style={{ fontSize: 13, fontWeight: 700, color: C.brown, cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: 1, textAlign: "center" }}>Cross-Repo Search</summary>
              <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "center" }}>
                <Inp placeholder="Search items, logs, mistakes across all repos..." value={globalSearch}
                  onChange={e => setGlobalSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchGlobal(globalSearch)}
                  style={{ flex: 1, maxWidth: 400, fontSize: 12 }} />
                <Btn bg={C.teal} onClick={() => searchGlobal(globalSearch)} style={{ fontSize: 12, padding: "6px 14px" }}>Search</Btn>
              </div>
              {globalResults && globalResults.total > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, maxHeight: 300, overflowY: "auto" }}>
                  <div style={{ fontWeight: 700, marginBottom: 4, color: C.darkBrown }}>{globalResults.total} results found</div>
                  {globalResults.items?.length > 0 && (<>
                    <div style={{ fontWeight: 700, color: C.orange, fontSize: 11, marginTop: 6 }}>Items ({globalResults.items.length})</div>
                    {globalResults.items.slice(0, 10).map((it, i) => (
                      <div key={i} style={{ padding: "3px 8px", background: C.white, borderRadius: 6, marginBottom: 2, fontSize: 11, display: "flex", gap: 6 }}>
                        <span style={{ fontWeight: 600, color: C.teal, minWidth: 70 }}>{it.repo_name}</span>
                        <span style={{ fontWeight: 600 }}>{it.title}</span>
                        <span style={{ color: C.brown, fontSize: 10 }}>{it.status}</span>
                      </div>
                    ))}
                  </>)}
                  {globalResults.mistakes?.length > 0 && (<>
                    <div style={{ fontWeight: 700, color: C.red, fontSize: 11, marginTop: 6 }}>Mistakes ({globalResults.mistakes.length})</div>
                    {globalResults.mistakes.slice(0, 10).map((mk, i) => (
                      <div key={i} style={{ padding: "3px 8px", background: C.white, borderRadius: 6, marginBottom: 2, fontSize: 11, display: "flex", gap: 6 }}>
                        <span style={{ fontWeight: 600, color: C.teal, minWidth: 70 }}>{mk.repo_name}</span>
                        <span style={{ color: C.red, fontWeight: 600 }}>{mk.error_type}</span>
                        <span style={{ color: C.brown }}>{mk.description?.slice(0, 60)}</span>
                      </div>
                    ))}
                  </>)}
                  {globalResults.logs?.length > 0 && (<>
                    <div style={{ fontWeight: 700, color: C.teal, fontSize: 11, marginTop: 6 }}>Logs ({globalResults.logs.length})</div>
                    {globalResults.logs.slice(0, 10).map((lg, i) => (
                      <div key={i} style={{ padding: "3px 8px", background: C.white, borderRadius: 6, marginBottom: 2, fontSize: 11, display: "flex", gap: 6 }}>
                        <span style={{ fontWeight: 600, color: C.teal, minWidth: 70 }}>{lg.repo_name}</span>
                        <span>{lg.action}</span>
                        <span style={{ color: C.brown }}>{lg.result?.slice(0, 40)}</span>
                      </div>
                    ))}
                  </>)}
                </div>
              )}
              {globalResults && globalResults.total === 0 && (
                <div style={{ textAlign: "center", fontSize: 12, color: C.brown, marginTop: 8 }}>No results found.</div>
              )}
            </details>
            {/* Filter bar */}
            <div style={{ maxWidth: 600, margin: "0 auto 16px", display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
              <Inp placeholder="Search repos..." value={repoFilter === "all" ? "" : (repoFilter.startsWith("q:") ? repoFilter.slice(2) : "")}
                onChange={e => setRepoFilter(e.target.value ? "q:" + e.target.value : "all")}
                style={{ maxWidth: 200, fontSize: 12, padding: "8px 14px" }} />
              {["all", "running", "idle", "pinned", "archived"].map(f => (
                <span key={f} onClick={() => setRepoFilter(f)}
                  style={{ cursor: "pointer", padding: "4px 12px", borderRadius: 12, fontSize: 11, fontWeight: 700,
                    background: repoFilter === f ? C.orange : C.cream, color: repoFilter === f ? C.white : C.brown,
                    border: `2px solid ${repoFilter === f ? C.orange : C.darkBrown}33`, transition: "all .2s" }}>
                  {f === "all" ? "All" : f === "running" ? "Running" : f === "idle" ? "Idle" : f === "pinned" ? "Pinned" : "Archived"}
                </span>
              ))}
              <span style={{ fontSize: 11, color: C.brown }}>{repos.length} repos</span>
              <span onClick={() => { const next = !compactMaster; setCompactMaster(next); localStorage.setItem("swarm-compact-master", next ? "1" : "0"); }}
                style={{ cursor: "pointer", fontSize: 10, padding: "3px 8px", borderRadius: 8, background: compactMaster ? C.teal : C.cream, color: compactMaster ? C.white : C.brown, border: `1px solid ${C.darkBrown}33`, fontWeight: 700, transition: "all .2s" }}
                title="Toggle compact mode">{compactMaster ? "Compact" : "Full"}</span>
              <span onClick={() => setGroupByTag(v => !v)}
                style={{ cursor: "pointer", fontSize: 10, padding: "3px 8px", borderRadius: 8, background: groupByTag ? "#7E57C2" : C.cream, color: groupByTag ? C.white : C.brown, border: `1px solid ${C.darkBrown}33`, fontWeight: 700, transition: "all .2s" }}
                title="Group by tag">Group</span>
              {/* Tag filter chips */}
              {(() => { const allTags = [...new Set(repos.flatMap(r => (r.tags || "").split(",").filter(Boolean)))].sort(); return allTags.length > 0 && (<>
                <span style={{ fontSize: 11, color: C.brown }}>|</span>
                {allTags.map(t => (
                  <span key={t} onClick={() => setRepoFilter("tag:" + t)}
                    style={{ cursor: "pointer", padding: "3px 10px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                      background: repoFilter === "tag:" + t ? "#7E57C2" : "#E8D5F5", color: repoFilter === "tag:" + t ? C.white : "#7E57C2",
                      border: "1px solid #CE93D8", transition: "all .2s" }}>{t}</span>
                ))}
              </>); })()}
            </div>
            {/* Batch action bar */}
            {batchSelected.size > 0 && (
              <div style={{ maxWidth: 700, margin: "0 auto 12px", display: "flex", gap: 8, alignItems: "center", justifyContent: "center", background: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 12, padding: "8px 16px", flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{batchSelected.size} selected</span>
                {[{a: "start", l: "Start", bg: C.green}, {a: "stop", l: "Stop", bg: C.red}, {a: "pause", l: "Pause", bg: C.orange}, {a: "resume", l: "Resume", bg: C.teal}].map(act => (
                  <Btn key={act.a} bg={act.bg} style={{ fontSize: 11, padding: "4px 12px" }} onClick={async () => {
                    await f("/api/repos/batch", { method: "POST", body: JSON.stringify({ repo_ids: [...batchSelected], action: act.a }) });
                    showToast(`${act.l} sent to ${batchSelected.size} repos`, "info"); load(); setBatchSelected(new Set());
                  }}>{act.l}</Btn>
                ))}
                <Btn bg="#999" style={{ fontSize: 11, padding: "4px 12px" }} onClick={() => setBatchSelected(new Set())}>Clear</Btn>
              </div>
            )}
            <div className="repo-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {[...repos].filter(r => {
                if (repoFilter === "running") return r.running;
                if (repoFilter === "idle") return !r.running && !r.archived;
                if (repoFilter === "pinned") return pinnedRepos.includes(r.id);
                if (repoFilter === "archived") return r.archived;
                if (repoFilter.startsWith("tag:")) return (r.tags || "").split(",").includes(repoFilter.slice(4));
                if (repoFilter.startsWith("q:")) return r.name.toLowerCase().includes(repoFilter.slice(2).toLowerCase());
                return true;
              }).sort((a, b) => {
                if (groupByTag) {
                  const ta = (a.tags || "").split(",").filter(Boolean)[0] || "zzz-untagged";
                  const tb = (b.tags || "").split(",").filter(Boolean)[0] || "zzz-untagged";
                  if (ta !== tb) return ta.localeCompare(tb);
                }
                const pa = pinnedRepos.includes(a.id) ? 0 : 1;
                const pb = pinnedRepos.includes(b.id) ? 0 : 1;
                return pa - pb || a.name.localeCompare(b.name);
              }).flatMap((r, _mi, arr) => {
                const elements = [];
                if (groupByTag) {
                  const tag = (r.tags || "").split(",").filter(Boolean)[0] || "untagged";
                  const prevTag = _mi > 0 ? ((arr[_mi-1].tags || "").split(",").filter(Boolean)[0] || "untagged") : null;
                  if (tag !== prevTag) {
                    elements.push(
                      <div key={`group-${tag}`} style={{ gridColumn: "1 / -1", fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, color: "#7E57C2", padding: "8px 0 4px", borderBottom: `2px solid #CE93D8`, marginBottom: 4 }}>
                        {"\uD83C\uDFF7\uFE0F"} {tag} ({arr.filter(x => ((x.tags||"").split(",").filter(Boolean)[0]||"untagged") === tag).length})
                      </div>
                    );
                  }
                }
                return [...elements, r];
              }).map((r, _mi) => {
                if (r.type === "div" || r.$$typeof) return r; // Group header elements pass through
                const rst = STATES[r.state] || STATES.idle;
                const s = r.stats || {};
                const pct = s.steps_total ? Math.round(s.steps_done / s.steps_total * 100) : 0;
                const isFocused = _mi === masterFocus;
                return (
                  <Card key={r.id} className="hover-lift master-card" bg={batchSelected.has(r.id) ? C.yellow : isFocused ? C.lightTeal : C.white} style={{ cursor: "pointer", transition: "transform .2s, box-shadow .2s", outline: isFocused ? `3px solid ${C.teal}` : "none", outlineOffset: -1, background: batchSelected.has(r.id) ? `linear-gradient(135deg, ${C.yellow} 0%, #FFD54F 100%)` : isFocused ? `linear-gradient(135deg, ${C.lightTeal} 0%, #D4F4E8 100%)` : `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}
                    onClick={() => { setSR(r.id); setTab("flow"); }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                      <div style={{ width: 42, height: 42, borderRadius: "50%", background: `linear-gradient(135deg, ${rst.color}, ${rst.color}dd)`, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, animation: r.running ? "bounce 2s cubic-bezier(0.4,0,0.2,1) infinite" : "none", boxShadow: `0 2px 8px ${rst.color}44` }}>
                        {rst.emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, lineHeight: 1.1 }}>{r.name}</div>
                          <button onClick={e => { e.stopPropagation(); togglePin(r.id); }}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, opacity: pinnedRepos.includes(r.id) ? 1 : 0.3, padding: "0 2px" }}
                            title={pinnedRepos.includes(r.id) ? "Unpin" : "Pin to top"}>{"\uD83D\uDCCC"}</button>
                          <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(r.path); showToast("Path copied!", "info"); }}
                            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, opacity: 0.4, padding: "0 4px" }}
                            title={r.path}>{"\uD83D\uDCCB"}</button>
                          <input type="checkbox" checked={batchSelected.has(r.id)} onClick={e => e.stopPropagation()}
                            onChange={e => { e.stopPropagation(); setBatchSelected(prev => { const s = new Set(prev); if (s.has(r.id)) s.delete(r.id); else s.add(r.id); return s; }); }}
                            style={{ width: 16, height: 16, accentColor: C.teal, cursor: "pointer" }} title="Select for batch action" />
                        </div>
                        <div style={{ fontSize: 12, color: C.brown, fontWeight: 500 }}>{rst.label} {r.running ? "-- RUNNING" : ""}</div>
                        {r.last_activity > 0 && <div style={{ fontSize: 9, color: C.brown, opacity: 0.6 }}>
                          {(() => { const ago = Math.floor((Date.now()/1000) - r.last_activity); return ago < 60 ? "just now" : ago < 3600 ? `${Math.floor(ago/60)}m ago` : ago < 86400 ? `${Math.floor(ago/3600)}h ago` : `${Math.floor(ago/86400)}d ago`; })()}
                        </div>}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, color: pct === 100 ? C.green : C.orange, lineHeight: 1 }}>{pct}%</div>
                        <div style={{ fontSize: 9, color: C.brown }}>complete</div>
                        {healthScores?.repos?.[r.id] && (
                          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 14, color: healthScores.repos[r.id].grade === "A" ? C.green : healthScores.repos[r.id].grade === "F" ? C.red : C.orange, marginTop: 2 }}>
                            {healthScores.repos[r.id].grade}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Progress bar with ring */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                      <ProgressRing done={s.items_done||0} total={s.items_total||1} size={28} strokeWidth={3} color={pct === 100 ? C.green : C.teal} />
                      <div style={{ flex: 1, background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 8, height: 14, overflow: "hidden", position: "relative" }}>
                        <div style={{ height: "100%", borderRadius: 6, background: `linear-gradient(90deg, ${C.green}, ${C.teal})`, width: `${pct}%`, transition: "width .5s" }} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: pct === 100 ? C.green : C.teal, minWidth: 28, textAlign: "right" }}>{pct}%</span>
                    </div>
                    {/* Tags */}
                    {!compactMaster && r.tags && (
                      <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
                        {r.tags.split(",").filter(Boolean).map(tag => (
                          <span key={tag} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 10, background: "#E8D5F5", color: "#7E57C2", fontWeight: 700, border: "1px solid #CE93D8" }}>{tag}</span>
                        ))}
                      </div>
                    )}
                    {/* Stats row */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 6 }}>
                      {[
                        { l: "Items", v: `${s.items_done||0}/${s.items_total||0}` },
                        { l: "Steps", v: `${s.steps_done||0}/${s.steps_total||0}` },
                        { l: "Files", v: s.file_count || "-" },
                        { l: "Cycles", v: r.cycle_count||0 },
                        { l: "Cost", v: `$${(costs[r.id] || 0).toFixed(2)}` },
                      ].map((x, i) => (
                        <div key={i} style={{ textAlign: "center", fontSize: 11 }}>
                          <div style={{ fontWeight: 700 }}>{x.v}</div>
                          <div style={{ fontSize: 9, color: C.brown }}>{x.l}</div>
                        </div>
                      ))}
                    </div>
                    {/* Activity sparkline (7-day) */}
                    {!compactMaster && sparklines[r.id]?.length > 1 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <span style={{ fontSize: 9, color: C.brown, minWidth: 42 }}>7d trend</span>
                        <Sparkline data={sparklines[r.id]} width={100} height={14} color={r.running ? C.teal : C.brown} />
                        <span style={{ fontSize: 9, color: C.brown }}>{sparklines[r.id].reduce((a,b) => a+b, 0)} actions</span>
                      </div>
                    )}
                    {/* Quick actions */}
                    {!compactMaster && <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
                      {r.running ? (
                        <>
                          <button onClick={e => { e.stopPropagation(); f("/api/stop", { method: "POST", body: JSON.stringify({ repo_id: r.id }) }).then(load); }}
                            style={{ background: C.red, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive", letterSpacing: 1 }}>{"\u23F9"} Stop</button>
                          <button onClick={e => { e.stopPropagation(); f(`/api/${r.paused ? "resume" : "pause"}`, { method: "POST", body: JSON.stringify({ repo_id: r.id }) }).then(load); }}
                            style={{ background: r.paused ? C.green : C.orange, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive", letterSpacing: 1 }}>{r.paused ? "\u25B6 Resume" : "\u23F8 Pause"}</button>
                        </>
                      ) : (
                        <button onClick={e => { e.stopPropagation(); startRepo(r.id); }}
                          style={{ background: C.green, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive", letterSpacing: 1 }}>{"\u25B6"} Start</button>
                      )}
                      <button onClick={e => { e.stopPropagation(); f("/api/push", { method: "POST", body: JSON.stringify({ repo_id: r.id, message: "manual push" }) }).then(() => showToast(`${r.name} pushed`, "success")); }}
                        style={{ background: C.teal, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive", letterSpacing: 1 }}>{"\uD83D\uDE80"} Push</button>
                      <button onClick={e => { e.stopPropagation(); const title = prompt("Quick add item for " + r.name + ":"); if (title) { f("/api/items", { method: "POST", body: JSON.stringify({ repo_id: r.id, title, type: "feature", priority: "medium" }) }).then(() => { showToast(`Added "${title}" to ${r.name}`, "success"); load(); }); } }}
                        style={{ background: C.yellow, color: C.darkBrown, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive", letterSpacing: 1 }} title="Quick add item">{"\u2795"}</button>
                      <button onClick={e => { e.stopPropagation(); f("/api/repos/archive", { method: "POST", body: JSON.stringify({ repo_id: r.id, archive: !r.archived }) }).then(() => { showToast(`${r.name} ${r.archived ? "unarchived" : "archived"}`, "info"); load(); }); }}
                        style={{ background: "#999", color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive", letterSpacing: 1, opacity: 0.7 }} title={r.archived ? "Unarchive" : "Archive"}>{r.archived ? "\uD83D\uDCE4" : "\uD83D\uDCE6"}</button>
                    </div>}
                  </Card>
                );
              })}
            </div>
            {/* Summary bar */}
            <Card bg={C.white} style={{ maxWidth: 700, margin: "16px auto 0", padding: "10px 20px", background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 12 }}>
                <div style={{ display: "flex", gap: 16 }}>
                  {[
                    { l: "Running", v: repos.filter(r => r.running).length, c: C.green },
                    { l: "Idle", v: repos.filter(r => !r.running && !r.archived).length, c: C.brown },
                    { l: "Total Items", v: repos.reduce((a, r) => a + (r.stats?.items_total || 0), 0), c: C.teal },
                    { l: "Total Cost", v: "$" + Object.values(costs).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0).toFixed(2), c: C.orange },
                  ].map((s, i) => (
                    <span key={i}><span style={{ fontWeight: 700, color: s.c }}>{s.v}</span> <span style={{ color: C.brown, fontSize: 10 }}>{s.l}</span></span>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={async () => {
                    const idle = repos.filter(r => !r.running && !r.archived);
                    if (idle.length === 0) { showToast("No idle repos to start", "info"); return; }
                    await f("/api/repos/batch", { method: "POST", body: JSON.stringify({ repo_ids: idle.map(r => r.id), action: "start" }) });
                    showToast(`Starting ${idle.length} idle repos`, "success"); load();
                  }} style={{ background: C.green, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive" }}>{"\u25B6"} Start All Idle</button>
                  <button onClick={async () => {
                    const running = repos.filter(r => r.running);
                    if (running.length === 0) { showToast("No running repos to stop", "info"); return; }
                    await f("/api/repos/batch", { method: "POST", body: JSON.stringify({ repo_ids: running.map(r => r.id), action: "stop" }) });
                    showToast(`Stopping ${running.length} repos`, "info"); load();
                  }} style={{ background: C.red, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive" }}>{"\u23F9"} Stop All</button>
                </div>
              </div>
            </Card>
            {/* Dependency Graph */}
            <details style={{ maxWidth: 700, margin: "20px auto 0" }}>
              <summary style={{ fontSize: 13, fontWeight: 700, color: C.brown, cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: 1, textAlign: "center" }}>
                {"\uD83D\uDD17"} Repo Dependencies
              </summary>
              <Card bg={C.white} style={{ marginTop: 8, padding: 16 }}>
                <p style={{ fontSize: 11, color: C.brown, marginBottom: 10 }}>
                  Configure which repos depend on others. Deps format: comma-separated repo IDs.
                </p>
                <div style={{ maxHeight: 300, overflowY: "auto" }}>
                  {repos.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "6px 8px", background: C.cream, borderRadius: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: 12, minWidth: 100, fontFamily: "'Bangers', cursive" }}>{r.name}</span>
                      <span style={{ fontSize: 10, color: C.brown, minWidth: 20 }}>#{r.id}</span>
                      <span style={{ fontSize: 10, color: C.brown }}>{"\u2190"} depends on:</span>
                      <input placeholder="e.g. 1,3,5" defaultValue={r.deps || ""} style={{ flex: 1, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.darkBrown}33`, fontSize: 11, background: C.white }}
                        onKeyDown={async e => {
                          if (e.key === "Enter") {
                            await f("/api/repos/deps", { method: "POST", body: JSON.stringify({ repo_id: r.id, deps: e.target.value }) });
                            showToast(`Deps updated for ${r.name}`, "info"); load();
                          }
                        }} />
                    </div>
                  ))}
                </div>
              </Card>
            </details>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 4 }}>
              <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", letterSpacing: 3, textShadow: `2px 2px 0 rgba(61,43,31,0.15)` }}>
                {repo?.name || "Select a Repo"} -- Road Map
              </h2>
              <select value={sr || ""} onChange={e => setSR(parseInt(e.target.value))}
                style={{ padding: "6px 10px", borderRadius: 8, border: `2px solid ${C.darkBrown}`, background: C.cream, fontFamily: "'Fredoka', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                {repos.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
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
              {/* ETA estimate */}
              {etas[sr] && !etas[sr].complete && etas[sr].eta_min !== null && (
                <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: C.brown, background: `${C.cream}88`, borderRadius: 8, padding: "6px 12px" }}>
                  {"\u23F3"} ETA: ~{etas[sr].eta_min < 60 ? `${Math.round(etas[sr].eta_min)}min` : `${(etas[sr].eta_min / 60).toFixed(1)}h`} remaining
                  {etas[sr].est_cost > 0 && <span> ({"\uD83D\uDCB0"} ~${etas[sr].est_cost.toFixed(3)})</span>}
                  <span style={{ opacity: 0.6 }}> — {etas[sr].remaining} of {etas[sr].total} steps left</span>
                </div>
              )}
              {etas[sr]?.complete && (
                <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: C.green, fontWeight: 700 }}>
                  {"\u2705"} All {etas[sr].total} steps complete!
                </div>
              )}
            </Card>

            {/* Error trend mini */}
            {(() => {
              const errLogs = logs.filter(l => l.error);
              const totalLogs = logs.length;
              if (totalLogs === 0) return null;
              const errRate = totalLogs > 0 ? Math.round(errLogs.length / totalLogs * 100) : 0;
              const recentErrors = errLogs.slice(0, 3);
              return errLogs.length > 0 ? (
                <Card bg={C.white} style={{ maxWidth: 680, margin: "0 auto 12px", padding: "10px 16px", background: errRate > 20 ? `linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%)` : `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 14 }}>{errRate > 20 ? "\u26A0\uFE0F" : "\u2139\uFE0F"}</span>
                    <span style={{ fontFamily: "'Bangers', cursive", fontSize: 14, letterSpacing: 1, color: errRate > 20 ? C.red : C.brown }}>{errLogs.length} errors ({errRate}% of {totalLogs} actions)</span>
                  </div>
                  {recentErrors.map((e, i) => (
                    <div key={i} style={{ fontSize: 10, color: C.red, padding: "2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.created_at?.slice(11,19)} {e.action}: {e.error?.slice(0, 80)}
                    </div>
                  ))}
                </Card>
              ) : null;
            })()}

            {/* Action buttons */}
            <div style={{ textAlign: "center", marginBottom: 16, display: "flex", justifyContent: "center", gap: 10 }}>
              {repo && !repo.running && <Btn bg={C.green} onClick={() => startRepo(sr)} style={{ padding: "10px 20px", fontSize: 16 }}>&#9654; Start</Btn>}
              {repo?.running && <Btn bg={C.red} onClick={() => stopRepo(sr)} style={{ padding: "10px 20px", fontSize: 16 }}>&#9209; Stop</Btn>}
              {repo?.running && (repo.paused
                ? <Btn bg={C.teal} onClick={() => resumeRepo(sr)} style={{ padding: "10px 20px", fontSize: 16 }}>&#9654; Resume</Btn>
                : <Btn bg={C.orange} onClick={() => pauseRepo(sr)} style={{ padding: "10px 20px", fontSize: 16 }}>&#9208; Pause</Btn>)}
              <Btn bg={C.teal} onClick={pushGH} style={{ padding: "10px 20px", fontSize: 16 }}>&uarr; Push Git</Btn>
            </div>

            {/* Repo README/CLAUDE.md viewer */}
            <RepoReadme repoId={sr} Card={Card} C={C} />

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

              {/* Recent Activity Timeline */}
              {logs.length > 0 && (
                <Card bg={C.white} style={{ padding: 14, marginBottom: 12, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, color: C.darkBrown }}>Recent Activity</div>
                  <div style={{ position: "relative", paddingLeft: 16 }}>
                    <div style={{ position: "absolute", left: 5, top: 0, bottom: 0, width: 2, background: `${C.darkBrown}22` }} />
                    {logs.slice(0, 5).map((l, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, position: "relative" }}>
                        <div style={{ position: "absolute", left: -12, top: 4, width: 8, height: 8, borderRadius: "50%", background: l.level === "error" ? C.red : l.level === "warning" ? C.orange : C.teal, border: `2px solid ${C.white}` }} />
                        <div style={{ fontSize: 10, color: C.brown, minWidth: 50, fontFamily: "monospace" }}>{l.created_at?.slice(11, 19) || ""}</div>
                        <div style={{ fontSize: 11, flex: 1, lineHeight: 1.3 }}>
                          <span style={{ fontWeight: 600 }}>{l.action}</span>
                          {l.result && <span style={{ color: C.brown }}> — {l.result.slice(0, 60)}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

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
              <details style={{ marginTop: 10 }}>
                <summary style={{ fontSize: 12, color: C.brown, cursor: "pointer", fontWeight: 600 }}>Import items from JSON</summary>
                <textarea id="import-json" placeholder='[{"title":"My feature","type":"feature","priority":"high","description":"Details..."}]'
                  style={{ width: "100%", padding: 10, background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 8, fontSize: 12, fontFamily: "monospace", minHeight: 60, resize: "vertical", marginTop: 6, boxSizing: "border-box" }} />
                <Btn bg={C.teal} onClick={() => { const el = document.getElementById("import-json"); if (el?.value) importItems(el.value); }} style={{ fontSize: 12, padding: "6px 14px", marginTop: 6 }}>Import JSON</Btn>
              </details>
            </Card>
            {items.length > 0 && (
              <div style={{ maxWidth: 620, margin: "0 auto 12px", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <Btn bg={C.teal} onClick={dedupeItems} style={{ fontSize: 12, padding: "8px 14px" }}>{"\uD83E\uDDF9"} Dedupe</Btn>
                <Btn bg={C.orange} onClick={retryAllCompleted} style={{ fontSize: 12, padding: "8px 14px" }}>{"\uD83D\uDD04"} Retry Done</Btn>
                <Btn bg="#A0ADB5" onClick={() => clearItems("completed")} style={{ fontSize: 12, padding: "8px 14px" }}>{"\u2705"} Clear Done</Btn>
                <Btn bg="#7E57C2" onClick={() => apiAction("/api/items/archive", { method: "POST", body: JSON.stringify({ repo_id: sr, days: 7 }) }, "Old items archived")} style={{ fontSize: 12, padding: "8px 14px" }}>{"\uD83D\uDCE6"} Archive 7d+</Btn>
                <Btn bg={C.red} onClick={() => clearItems()} style={{ fontSize: 12, padding: "8px 14px" }}>{"\uD83D\uDDD1\uFE0F"} Clear All</Btn>
                <button onClick={() => setCompactItems(c => !c)} style={{ padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: "'Fredoka', sans-serif", cursor: "pointer", background: compactItems ? C.teal : C.cream, color: compactItems ? C.white : C.brown, border: `2px solid ${C.darkBrown}`, transition: "all 0.15s" }} title="Toggle compact view">{compactItems ? "\u2630 Compact" : "\u2637 Full"}</button>
                <span style={{ fontSize: 12, color: C.brown, alignSelf: "center", fontWeight: 600 }}>
                  {items.filter(i=>i.status==="pending").length} pending / {items.filter(i=>i.status==="completed").length} done / {items.length} total
                </span>
              </div>
            )}
            {items.length > 0 && (
              <div style={{ maxWidth: 620, margin: "0 auto 10px", display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                {["all", "pending", "in_progress", "completed", "archived"].map(f => (
                  <button key={f} onClick={() => setItemFilter(f)} style={{
                    padding: "5px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                    fontFamily: "'Bangers', cursive", letterSpacing: 1, cursor: "pointer",
                    background: itemFilter === f ? C.orange : C.cream,
                    color: itemFilter === f ? C.white : C.darkBrown,
                    border: `2px solid ${C.darkBrown}`, transition: "all 0.15s",
                  }}>{f === "all" ? "All" : f === "in_progress" ? "Active" : f.charAt(0).toUpperCase() + f.slice(1)}</button>
                ))}
                <span style={{ fontSize: 11, color: C.brown, alignSelf: "center" }}>|</span>
                {["all", "manual", "audio", "error_detected"].map(s => (
                  <button key={s} onClick={() => setSourceFilter(s)} style={{
                    padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                    fontFamily: "'Fredoka', sans-serif", cursor: "pointer",
                    background: sourceFilter === s ? C.teal : C.cream,
                    color: sourceFilter === s ? C.white : C.darkBrown,
                    border: `2px solid ${C.darkBrown}`, transition: "all 0.15s",
                  }}>{s === "all" ? "Any Source" : s === "error_detected" ? "Error" : s.charAt(0).toUpperCase() + s.slice(1)}</button>
                ))}
                <span style={{ fontSize: 11, color: C.brown, alignSelf: "center" }}>|</span>
                {["all", "critical", "high", "medium", "low"].map(p => (
                  <button key={p} onClick={() => setPriorityFilter(p)} style={{
                    padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                    fontFamily: "'Fredoka', sans-serif", cursor: "pointer",
                    background: priorityFilter === p ? C.orange : C.cream,
                    color: priorityFilter === p ? C.white : C.darkBrown,
                    border: `2px solid ${C.darkBrown}`, transition: "all 0.15s",
                  }}>{p === "all" ? "Any Priority" : p.charAt(0).toUpperCase() + p.slice(1)}</button>
                ))}
              </div>
            )}
            {selectedItems.size > 0 && (
              <div style={{ maxWidth: 620, margin: "0 auto 10px", display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", background: C.yellow, borderRadius: 10, padding: "8px 12px", border: `2px solid ${C.darkBrown}` }}>
                <span style={{ fontSize: 12, fontWeight: 700, alignSelf: "center" }}>{selectedItems.size} selected:</span>
                <Btn bg={C.teal} onClick={() => bulkUpdateItems("change_priority", "high")} style={{ fontSize: 11, padding: "4px 10px" }}>Priority: High</Btn>
                <Btn bg="#A0ADB5" onClick={() => bulkUpdateItems("change_status", "pending")} style={{ fontSize: 11, padding: "4px 10px" }}>Re-queue</Btn>
                <Btn bg={C.red} onClick={() => bulkUpdateItems("delete")} style={{ fontSize: 11, padding: "4px 10px" }}>Delete</Btn>
                <button onClick={() => setSelectedItems(new Set())} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>{"\u2716"}</button>
              </div>
            )}
            <div style={{ maxWidth: 620, margin: "0 auto" }}>
              {items.length === 0 ? (
                <Card bg={C.white} style={{ textAlign: "center", padding: 40 }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{"\uD83C\uDFDC\uFE0F"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 }}>The board's empty, partner</div>
                  <div style={{ fontSize: 13, color: C.brown }}>Post a bounty above to get the swarm working!</div>
                </Card>
              ) :
                (() => { const vis = items.filter(it => (itemFilter === "all" || it.status === itemFilter) && (sourceFilter === "all" || it.source === sourceFilter) && (priorityFilter === "all" || it.priority === priorityFilter)); return vis.length > 0 && <div style={{ textAlign: "center", marginBottom: 6 }}><button onClick={toggleSelectAll} style={{ fontSize: 11, color: C.brown, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>{selectedItems.size === vis.length ? "Deselect All" : `Select All (${vis.length})`}</button></div>; })()}
                {items.filter(it => (itemFilter === "all" || it.status === itemFilter) && (sourceFilter === "all" || it.source === sourceFilter) && (priorityFilter === "all" || it.priority === priorityFilter)).map((it, idx) => {
                  const prioConfig = {
                    critical: { bg: C.red, icon: "\uD83D\uDD34", label: "CRITICAL", size: 13 },
                    high: { bg: C.orange, icon: "\uD83D\uDFE0", label: "HIGH", size: 12 },
                    medium: { bg: C.teal, icon: "\uD83D\uDD35", label: "MEDIUM", size: 11 },
                    low: { bg: "#A0ADB5", icon: "\u26AA", label: "LOW", size: 11 },
                  }[it.priority] || { bg: "#ccc", icon: "", label: it.priority, size: 11 };
                  if (compactItems) return (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: it.status === "completed" ? C.lightTeal : C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 6, marginBottom: 3, fontSize: 11 }}>
                      <input type="checkbox" checked={selectedItems.has(it.id)} onChange={() => toggleSelectItem(it.id)} style={{ cursor: "pointer", accentColor: C.orange }} />
                      <span style={{ fontSize: 14 }}>{it.type === "issue" ? "\uD83D\uDC1B" : "\uD83C\uDF1F"}</span>
                      <span style={{ fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</span>
                      <span style={{ background: prioConfig.bg, color: C.white, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{prioConfig.label}</span>
                      <span style={{ background: it.status === "completed" ? C.green : it.status === "in_progress" ? C.orange : "#ccc", color: C.white, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 }}>{it.status}</span>
                      {it.status === "pending" && <button onClick={() => quickStatusChange(it.id, "completed")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.green, padding: 0 }}>{"\u2705"}</button>}
                      <button onClick={() => deleteItem(it.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.red, padding: 0 }}>{"\u2716"}</button>
                    </div>
                  );
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
                        <input type="checkbox" checked={selectedItems.has(it.id)} onChange={() => toggleSelectItem(it.id)} style={{ marginTop: 12, cursor: "pointer", accentColor: C.orange, flexShrink: 0 }} />
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: it.type === "issue" ? "#FFE0E0" : "#FFF3CD", border: `2px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
                          {it.type==="issue" ? "\uD83D\uDC1B" : "\uD83C\uDF1F"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: "'Bangers', cursive", fontSize: 17, letterSpacing: 1, marginBottom: 2, lineHeight: 1.2 }}>{it.title}</div>
                          <div style={{ fontSize: 12, color: C.brown, lineHeight: 1.4 }}>{it.description}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          {it.status === "pending" && <button onClick={() => quickStatusChange(it.id, "completed")} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.green, padding: "2px 6px", borderRadius: 6, opacity: 0.6, transition: "opacity 0.2s" }} onMouseOver={e=>e.target.style.opacity=1} onMouseOut={e=>e.target.style.opacity=0.6} title="Mark as completed">{"\u2705"}</button>}
                          {it.status === "completed" && <button onClick={() => retryItem(it.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.orange, padding: "2px 6px", borderRadius: 6, opacity: 0.6, transition: "opacity 0.2s" }} onMouseOver={e=>e.target.style.opacity=1} onMouseOut={e=>e.target.style.opacity=0.6} title="Retry this item">{"\uD83D\uDD04"}</button>}
                          <button onClick={() => deleteItem(it.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.red, padding: "2px 6px", borderRadius: 6, opacity: 0.6, transition: "opacity 0.2s" }} onMouseOver={e=>e.target.style.opacity=1} onMouseOut={e=>e.target.style.opacity=0.6} title="Delete this item">{"\u2716"}</button>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {it.source && it.source !== "manual" && (
                            <span style={{ fontSize: 9, color: C.brown, background: C.lightTeal, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>
                              {it.source === "audio" ? "\uD83C\uDFA4" : it.source === "error_detected" ? "\uD83D\uDC1B" : ""} {it.source}
                            </span>
                          )}
                          {it.created_at && <span style={{ fontSize: 9, color: C.brown, opacity: 0.6 }}>{it.created_at.slice(0, 10)}</span>}
                          <div style={{ background: it.status==="completed" ? C.green : it.status==="in_progress" ? C.orange : "rgba(93,64,55,0.2)", border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "3px 12px", fontSize: 11, fontWeight: 700, color: it.status==="completed" || it.status==="in_progress" ? C.white : C.darkBrown, fontFamily: "'Bangers', cursive", letterSpacing: 1 }}>
                            {it.status === "completed" ? "\u2705 Done" : it.status === "in_progress" ? "\u26A1 In Progress" : "\u23F3 Pending"}
                          </div>
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
            {plan.length > 0 && (() => {
              const done = plan.filter(s => s.status === "completed").length;
              const totalCost = plan.reduce((s, p) => s + (p.cost_usd || 0), 0);
              const totalDur = plan.reduce((s, p) => s + (p.duration_sec || 0), 0);
              const remaining = plan.length - done;
              const avgDur = done > 0 ? totalDur / done : 0;
              const avgCost = done > 0 ? totalCost / done : 0;
              const etaMins = remaining > 0 && avgDur > 0 ? Math.round((remaining * avgDur) / 60) : 0;
              return (
                <div style={{ textAlign: "center", marginBottom: 12, fontSize: 13, color: C.brown, fontWeight: 600 }}>
                  {done}/{plan.length} steps done
                  {totalCost > 0 && <> {"\u00B7"} ${totalCost.toFixed(2)} total cost</>}
                  {totalDur > 0 && <> {"\u00B7"} {Math.round(totalDur/60)}m total time</>}
                  {etaMins > 0 && <> {"\u00B7"} ~{etaMins}m ETA (${(remaining * avgCost).toFixed(2)} est.)</>}
                </div>
              );
            })()}
            <div style={{ maxWidth: 620, margin: "0 auto" }}>
              {plan.length === 0 ? (
                <Card style={{ textAlign: "center", padding: 40, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{"\uD83D\uDDFA\uFE0F"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 }}>No plan drawn up yet</div>
                  <div style={{ fontSize: 13, color: C.brown }}>Add items to the Bounty Board first -- the swarm will draw up a plan!</div>
                </Card>
              ) :
                (() => { const maxCost = Math.max(...plan.map(p => p.cost_usd || 0), 0.001); const completedSteps = plan.filter(p => p.status === "completed" && p.duration_sec > 0); const avgDur = completedSteps.length ? completedSteps.reduce((a, p) => a + p.duration_sec, 0) / completedSteps.length : 0; return plan.map((s,i) => {
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
                          {done && s.model && <span style={{ fontSize: 10, background: `${C.teal}22`, border: `2px solid ${C.teal}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600, color: C.teal }}>{"\uD83E\uDD16"} {s.model.replace("claude-","").replace("-20251001","")}</span>}
                          {done && s.cost_usd > 0 && <span style={{ fontSize: 10, background: C.yellow, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>{"\uD83D\uDCB0"} ${s.cost_usd.toFixed(3)}</span>}
                          {done && s.duration_sec > 0 && <span style={{ fontSize: 10, background: C.lightTeal, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600 }}>{"\u23F1\uFE0F"} {Math.round(s.duration_sec)}s</span>}
                          {done && s.cost_usd > 0 && <div style={{ flex: "1 1 100%", height: 4, background: C.cream, borderRadius: 2, overflow: "hidden", marginTop: 4 }}><div style={{ height: "100%", background: `linear-gradient(90deg, ${C.teal}, ${s.cost_usd/maxCost > 0.7 ? C.orange : C.green})`, width: `${Math.min(100, (s.cost_usd / maxCost) * 100)}%`, borderRadius: 2, transition: "width .3s" }} /></div>}
                          {!done && avgDur > 0 && <span style={{ fontSize: 10, background: `${C.teal}22`, border: `2px solid ${C.teal}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600, color: C.teal }}>{"\u23F3"} ~{avgDur >= 60 ? `${Math.round(avgDur/60)}m` : `${Math.round(avgDur)}s`} est</span>}
                          {!done && (
                            <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                              {i > 0 && <button onClick={() => reorderStep(s.id, "up")} style={{ background: C.cream, border: `1px solid ${C.darkBrown}`, borderRadius: 4, cursor: "pointer", fontSize: 10, padding: "1px 6px" }} title="Move up">{"\u25B2"}</button>}
                              {i < plan.length - 1 && <button onClick={() => reorderStep(s.id, "down")} style={{ background: C.cream, border: `1px solid ${C.darkBrown}`, borderRadius: 4, cursor: "pointer", fontSize: 10, padding: "1px 6px" }} title="Move down">{"\u25BC"}</button>}
                            </span>
                          )}
                        </div>
                      </Card>
                    </div>
                  );
                }); })()}
            </div>
            {/* Step Duration Histogram */}
            {(() => {
              const completed = plan.filter(s => s.status === "completed" && s.duration_sec > 0);
              if (completed.length < 2) return null;
              const durations = completed.map(s => s.duration_sec);
              const maxDur = Math.max(...durations);
              const bucketCount = Math.min(8, completed.length);
              const bucketSize = maxDur / bucketCount;
              const buckets = Array(bucketCount).fill(0);
              durations.forEach(d => { const idx = Math.min(Math.floor(d / bucketSize), bucketCount - 1); buckets[idx]++; });
              const maxBucket = Math.max(...buckets, 1);
              return (
                <Card bg={C.white} style={{ maxWidth: 680, margin: "16px auto 0", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" }}>Step Duration Distribution</div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 60 }}>
                    {buckets.map((count, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: "100%", background: `linear-gradient(180deg, ${C.teal}, ${C.green})`, borderRadius: "4px 4px 0 0", height: `${(count / maxBucket) * 50}px`, transition: "height 0.3s", minHeight: count > 0 ? 4 : 0 }} />
                        <span style={{ fontSize: 8, color: C.brown, marginTop: 2 }}>{Math.round(i * bucketSize)}-{Math.round((i+1) * bucketSize)}s</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ textAlign: "center", fontSize: 10, color: C.brown, marginTop: 4 }}>
                    Avg: {Math.round(durations.reduce((a,b)=>a+b,0)/durations.length)}s | Min: {Math.round(Math.min(...durations))}s | Max: {Math.round(maxDur)}s
                  </div>
                </Card>
              );
            })()}
            {/* Execution Timeline (Gantt-like) */}
            {(() => {
              const completed = plan.filter(s => s.status === "completed" && s.completed_at && s.duration_sec > 0);
              if (completed.length < 2) return null;
              const times = completed.map(s => new Date(s.completed_at + "Z").getTime());
              const durations = completed.map(s => s.duration_sec * 1000);
              const starts = times.map((t, i) => t - durations[i]);
              const minStart = Math.min(...starts);
              const maxEnd = Math.max(...times);
              const range = maxEnd - minStart || 1;
              return (
                <Card bg={C.white} style={{ maxWidth: 680, margin: "16px auto 0", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" }}>Execution Timeline</div>
                  <div style={{ position: "relative" }}>
                    {completed.map((s, i) => {
                      const start = starts[i];
                      const end = times[i];
                      const left = ((start - minStart) / range) * 100;
                      const width = Math.max(((end - start) / range) * 100, 1);
                      return (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: C.brown, minWidth: 20, textAlign: "right" }}>{i+1}</span>
                          <div style={{ flex: 1, height: 12, position: "relative", background: `${C.darkBrown}08`, borderRadius: 4 }}>
                            <div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%", background: `linear-gradient(90deg, ${C.teal}, ${C.green})`, borderRadius: 4, transition: "all 0.3s" }}
                              title={`Step ${i+1}: ${s.description?.slice(0,40)} (${Math.round(s.duration_sec)}s)`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.brown, marginTop: 4 }}>
                    <span>{new Date(minStart).toLocaleTimeString()}</span>
                    <span>{Math.round((maxEnd - minStart) / 60000)}min total span</span>
                    <span>{new Date(maxEnd).toLocaleTimeString()}</span>
                  </div>
                </Card>
              );
            })()}
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
            {/* Agent Performance Stats */}
            {agentStats?.agents?.length > 0 && (
              <Card bg={C.white} style={{ maxWidth: 650, margin: "16px auto 0", padding: 14 }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 10, textAlign: "center" }}>Agent Performance</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.darkBrown}` }}>
                      <th style={{ padding: "6px", textAlign: "left" }}>Type</th>
                      <th style={{ padding: "6px", textAlign: "right" }}>Steps</th>
                      <th style={{ padding: "6px", textAlign: "right" }}>Done</th>
                      <th style={{ padding: "6px", textAlign: "right" }}>Avg Cost</th>
                      <th style={{ padding: "6px", textAlign: "right" }}>Avg Time</th>
                      <th style={{ padding: "6px", textAlign: "right" }}>Tests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentStats.agents.map((a, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.darkBrown}22` }}>
                        <td style={{ padding: "6px", fontWeight: 700 }}>{"\uD83E\uDD20"} {a.agent_type}</td>
                        <td style={{ padding: "6px", textAlign: "right" }}>{a.total_steps}</td>
                        <td style={{ padding: "6px", textAlign: "right", color: C.green, fontWeight: 700 }}>{a.completed}</td>
                        <td style={{ padding: "6px", textAlign: "right" }}>${a.avg_cost}</td>
                        <td style={{ padding: "6px", textAlign: "right" }}>{a.avg_duration}s</td>
                        <td style={{ padding: "6px", textAlign: "right" }}>{a.tests_passed}/{a.total_tests}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </SectionBg>
        )}

        {/* ── MEMORY ── */}
        {tab === "memory" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.lightTeal} 0%, #9DE4ED 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>Agent Memory</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 10 }}>Ruflo memory -- stores plans, execution results, and configs</p>
            <div style={{ textAlign: "center", marginBottom: 10, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              <Btn bg={C.teal} onClick={async () => { await f("/api/memory/seed", { method: "POST", body: JSON.stringify({ repo_id: sr }) }); load(); }} style={{ fontSize: 14, padding: "8px 18px" }}>{"\uD83D\uDD04"} Seed Memory</Btn>
              <Inp placeholder="Search memory..." value={memSearch} onChange={e => setMemSearch(e.target.value)}
                style={{ maxWidth: 280, fontSize: 12, padding: "8px 14px" }} />
            </div>
            <div style={{ maxWidth: 700, margin: "0 auto" }}>
              {memory.length===0 ? (
                <Card style={{ textAlign: "center", padding: 40, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontSize: 36, marginBottom: 8 }}>{"\uD83E\uDDE0"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 }}>Memory banks are empty</div>
                  <div style={{ fontSize: 13, color: C.brown }}>Start a repo to generate plans and build Ruflo memory. Or click "Seed Memory" above.</div>
                </Card>
              ) :
                memory.filter(m => !memSearch || [m.namespace,m.key,m.value].join(" ").toLowerCase().includes(memSearch.toLowerCase())).map(m => (
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
            {mistakeAnalysis && mistakeAnalysis.total > 0 && (
              <div style={{ maxWidth: 620, margin: "0 auto 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                <Card bg={C.white} style={{ padding: 12, textAlign: "center" }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, color: C.red }}>{mistakeAnalysis.total}</div>
                  <div style={{ fontSize: 11, color: C.brown }}>Total Mistakes</div>
                </Card>
                <Card bg={C.white} style={{ padding: 12, textAlign: "center" }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, color: C.green }}>{mistakeAnalysis.resolution_rate}%</div>
                  <div style={{ fontSize: 11, color: C.brown }}>Resolved</div>
                </Card>
                <Card bg={C.white} style={{ padding: 12, textAlign: "center" }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, color: C.orange }}>{mistakeAnalysis.chronic_patterns?.length || 0}</div>
                  <div style={{ fontSize: 11, color: C.brown }}>Chronic (3+)</div>
                </Card>
                <Card bg={C.white} style={{ padding: 12, textAlign: "center" }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, color: C.teal }}>{mistakeAnalysis.top_5?.length || 0}</div>
                  <div style={{ fontSize: 11, color: C.brown }}>Error Types</div>
                </Card>
              </div>
            )}
            {mistakeAnalysis && mistakeAnalysis.top_5?.length > 0 && (
              <div style={{ maxWidth: 620, margin: "0 auto 16px" }}>
                <Card bg={C.white} style={{ padding: 14 }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, marginBottom: 8 }}>Top Error Types</div>
                  {mistakeAnalysis.top_5.map((t, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, minWidth: 24 }}>#{i+1}</span>
                      <div style={{ flex: 1, background: C.cream, borderRadius: 6, height: 20, overflow: "hidden", border: `1px solid ${C.darkBrown}33` }}>
                        <div style={{ height: "100%", background: i === 0 ? C.red : i === 1 ? C.orange : C.teal, width: `${Math.min(100, (t.count / (mistakeAnalysis.top_5[0]?.count || 1)) * 100)}%`, borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.white, whiteSpace: "nowrap" }}>{t.error_type}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, minWidth: 24 }}>{t.count}</span>
                    </div>
                  ))}
                </Card>
              </div>
            )}
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 }}>
              <p style={{ fontSize: 13, color: C.brown }}>Every action, every decision -- all on record</p>
              <div style={{ display: "flex", alignItems: "center", gap: 4, background: C.green, borderRadius: 12, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: C.white }}>
                <span style={{ animation: "rec 1.5s infinite" }}>●</span> LIVE
              </div>
              <span style={{ fontSize: 11, color: C.brown }}>{logs.length} entries</span>
              <button onClick={() => setLogTail(t => !t)} style={{
                padding: "3px 10px", borderRadius: 12, fontSize: 10, fontWeight: 700,
                fontFamily: "'Fredoka', sans-serif", cursor: "pointer",
                background: logTail ? C.orange : C.cream, color: logTail ? C.white : C.brown,
                border: `2px solid ${C.darkBrown}`, transition: "all 0.15s",
              }}>{logTail ? "\u23EC Tail ON" : "\u23EC Tail"}</button>
            </div>
            <div style={{ maxWidth: 800, margin: "0 auto 10px", display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
              <Inp placeholder="Search logs..." value={logSearch} onChange={e => setLogSearch(e.target.value)}
                style={{ maxWidth: 300, fontSize: 12, padding: "8px 14px" }} />
              {["all", "errors", "costly"].map(lf => (
                <button key={lf} onClick={() => setLogLevelFilter(lf)} style={{
                  padding: "4px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                  fontFamily: "'Fredoka', sans-serif", cursor: "pointer",
                  background: logLevelFilter === lf ? (lf === "errors" ? C.red : lf === "costly" ? C.green : C.teal) : C.cream,
                  color: logLevelFilter === lf ? C.white : C.darkBrown,
                  border: `2px solid ${C.darkBrown}`, transition: "all 0.15s",
                }}>{lf === "all" ? "All" : lf === "errors" ? "Errors Only" : "$$ High Cost"}</button>
              ))}
              <Btn onClick={exportLogs} bg={C.teal} style={{ fontSize: 11, padding: "8px 14px" }}>{"\u2B07"} Export</Btn>
            </div>
            {(logSearch || logLevelFilter !== "all") && (() => { const ct = logs.filter(l => {
              if (logSearch && ![l.state,l.action,l.result,l.error].join(" ").toLowerCase().includes(logSearch.toLowerCase())) return false;
              if (logLevelFilter === "errors" && !l.error) return false;
              if (logLevelFilter === "costly" && !(l.cost_usd > 0.01)) return false;
              return true;
            }).length; return (
              <div style={{ textAlign: "center", fontSize: 11, color: C.brown, marginBottom: 6 }}>Showing {ct} of {logs.length} entries</div>
            ); })()}
            <div style={{ maxWidth: 800, margin: "0 auto" }}>
              {logs.length===0 ? (
                <Card style={{ textAlign: "center", padding: 30, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>{"\uD83D\uDCDC"}</div>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 4 }}>No logs on the books yet</div>
                  <div style={{ fontSize: 12, color: C.brown }}>Logs appear as the orchestrator works its magic.</div>
                </Card>
              ) :
                logs.filter(l => {
                  if (logSearch && ![l.state,l.action,l.result,l.error].join(" ").toLowerCase().includes(logSearch.toLowerCase())) return false;
                  if (logLevelFilter === "errors" && !l.error) return false;
                  if (logLevelFilter === "costly" && !(l.cost_usd > 0.01)) return false;
                  return true;
                }).map((l, i) => (
                  <div key={l.id} style={{ display: "flex", gap: 8, padding: "5px 10px", background: i === 0 ? "#FFFDE7" : C.white, border: `2px solid ${i === 0 ? C.orange : C.darkBrown}`, borderRadius: 8, marginBottom: 3, fontSize: 11, boxShadow: i === 0 ? `0 0 8px ${C.orange}44` : "0 1px 3px rgba(0,0,0,.04)", transition: "transform .15s, background .3s, border-color .3s" }}>
                    <span style={{ color: C.brown, minWidth: 90, fontSize: 9 }}>{l.created_at}</span>
                    <span style={{ fontWeight: 700, color: STATES[l.state]?.color || C.brown, minWidth: 75 }}>{l.state}</span>
                    <span style={{ minWidth: 80, fontWeight: 500 }}>{l.action}</span>
                    {l.agent_count>0 && <span style={{ color: C.orange, fontSize: 9, background: C.lightOrange, borderRadius: 4, padding: "0 4px" }}>{"\uD83E\uDD20"}{"\u00D7"}{l.agent_count}</span>}
                    {l.cost_usd > 0 && <span style={{ color: "#2E7D32", fontSize: 9, background: "#E8F5E9", borderRadius: 4, padding: "0 4px" }}>${l.cost_usd.toFixed(3)}</span>}
                    {l.duration_sec>0 && <span style={{ color: C.teal, fontSize: 9, background: C.lightTeal, borderRadius: 4, padding: "0 4px" }}>{l.duration_sec.toFixed(1)}s</span>}
                    {l.error && <span style={{ color: C.red, fontSize: 9 }}>{"\uD83D\uDC80"}{l.error.slice(0,30)}</span>}
                    <span style={{ color: C.brown, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.result?.slice(0,50)}</span>
                  </div>
                ))}
              <div ref={logEndRef} />
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
                                if (res.ok) { const d = await res.json(); showToast(d.ok ? "Rollback complete!" : d.error || "Rollback failed", d.ok ? "success" : "error"); load(); }
                                else showToast("Rollback request failed", "error");
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

            {/* Health Scores Overview */}
            {healthScores && healthScores.repos?.length > 0 && (
              <Card bg={C.white} style={{ maxWidth: 800, margin: "0 auto 16px", padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1 }}>Repo Health Scores</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: healthScores.average_score >= 75 ? C.green : healthScores.average_score >= 50 ? C.orange : C.red }}>
                    Avg: {healthScores.average_score}
                  </span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {healthScores.repos.map(r => {
                    const gc = { A: C.green, B: "#4DB6AC", C: C.orange, D: "#FF7043", F: C.red }[r.grade] || C.brown;
                    return (
                      <div key={r.repo_id} style={{ padding: "4px 10px", borderRadius: 8, border: `2px solid ${gc}`, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }} title={r.issues.join(", ") || "All clear"}>
                        <span style={{ fontWeight: 700, color: gc, fontFamily: "'Bangers', cursive", fontSize: 16 }}>{r.grade}</span>
                        <span>{r.repo}</span>
                        <span style={{ fontSize: 9, color: C.brown }}>{r.score}</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Scan + Fix buttons */}
            <div style={{ textAlign: "center", marginBottom: 24, display: "flex", justifyContent: "center", gap: 14 }}>
              <Btn onClick={scanAll} bg={scanning ? "#999" : C.teal} style={{ fontSize: 18, padding: "14px 32px", opacity: scanning ? 0.7 : 1, pointerEvents: scanning ? "none" : "auto" }}>
                {scanning ? "\u23F3 Scanning..." : "\uD83D\uDD0D SCAN ALL REPOS"}
              </Btn>
              <Btn onClick={fixAll} bg={fixing ? "#999" : C.green} style={{ fontSize: 18, padding: "14px 32px", opacity: fixing ? 0.7 : 1, pointerEvents: fixing ? "none" : "auto" }}>
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

            {/* Circuit Breaker Status */}
            {circuitBreakers.some(cb => cb.state !== "closed") && (
              <Card bg="#FFF3E0" style={{ maxWidth: 800, margin: "0 auto 16px", border: `2px solid ${C.orange}` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 8, color: C.orange }}>{"\u26A1"} Circuit Breakers</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 }}>
                  {circuitBreakers.filter(cb => cb.state !== "closed").map(cb => (
                    <div key={cb.repo_id} style={{ padding: "8px 12px", background: cb.state === "open" ? "#FFEBEE" : "#FFF8E1", borderRadius: 8, border: `2px solid ${cb.state === "open" ? C.red : C.orange}`, fontSize: 11 }}>
                      <div style={{ fontWeight: 700 }}>{cb.repo_name}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                        <span style={{ color: cb.state === "open" ? C.red : C.orange, fontWeight: 700 }}>{cb.state.toUpperCase()}</span>
                        <span>{cb.failures}/{cb.threshold} failures</span>
                        {cb.last_failure_ago && <span style={{ color: C.brown }}>{cb.last_failure_ago}s ago</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {circuitBreakers.length > 0 && circuitBreakers.every(cb => cb.state === "closed") && (
              <div style={{ textAlign: "center", fontSize: 12, color: C.green, fontWeight: 600, marginBottom: 16 }}>{"\u2705"} All circuit breakers closed — everything healthy!</div>
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
        {/* ── METRICS ── */}
        {tab === "metrics" && (
          <SectionBg bg={`linear-gradient(180deg, #E3F2FD 0%, #BBDEFB 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>API Metrics</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 20 }}>Request counts, error rates, and latency stats</p>
            {apiMetrics ? (
              <div style={{ maxWidth: 800, margin: "0 auto" }}>
                {/* Summary cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                  {[
                    { label: "Total Requests", val: apiMetrics.total_requests?.toLocaleString() || "0", icon: "\uD83D\uDCE8", bg: C.lightTeal },
                    { label: "Errors", val: apiMetrics.errors?.toLocaleString() || "0", icon: "\u274C", bg: "#FFEBEE" },
                    { label: "Rate Limited", val: apiMetrics.rate_limited?.toLocaleString() || "0", icon: "\uD83D\uDEA6", bg: C.lightOrange },
                    { label: "Endpoints", val: Object.keys(apiMetrics.top_endpoints || {}).length, icon: "\uD83D\uDD17", bg: C.cream },
                  ].map((s, i) => (
                    <Card key={i} bg={s.bg} style={{ padding: 16, textAlign: "center" }}>
                      <div style={{ fontSize: 24, marginBottom: 4 }}>{s.icon}</div>
                      <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, letterSpacing: 1 }}>{s.val}</div>
                      <div style={{ fontSize: 11, color: C.brown, fontWeight: 600 }}>{s.label}</div>
                    </Card>
                  ))}
                </div>
                {/* Top endpoints */}
                <Card bg={C.white} style={{ marginBottom: 16, padding: 18 }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 }}>{"\uD83C\uDFC6"} Top Endpoints</div>
                  <div style={{ fontSize: 12 }}>
                    {Object.entries(apiMetrics.top_endpoints || {}).sort((a, b) => b[1] - a[1]).map(([ep, count]) => {
                      const lat = apiMetrics.latency?.[ep];
                      return (
                        <div key={ep} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.darkBrown}11` }}>
                          <span style={{ flex: 1, fontWeight: 600, fontFamily: "monospace", fontSize: 11 }}>{ep}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.teal, minWidth: 60, textAlign: "right" }}>{count.toLocaleString()}</span>
                          {lat && <span style={{ fontSize: 10, color: C.brown, background: lat.p95_ms > 200 ? "#FFEBEE" : C.lightTeal, padding: "2px 6px", borderRadius: 4, minWidth: 60, textAlign: "center" }}>p95: {lat.p95_ms}ms</span>}
                          {lat && <span style={{ fontSize: 10, color: C.brown, background: C.cream, padding: "2px 6px", borderRadius: 4, minWidth: 55, textAlign: "center" }}>avg: {lat.avg_ms}ms</span>}
                        </div>
                      );
                    })}
                  </div>
                </Card>
                {/* Latency breakdown */}
                {apiMetrics.latency && Object.keys(apiMetrics.latency).length > 0 && (
                  <Card bg={C.white} style={{ padding: 18 }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 }}>{"\u23F1\uFE0F"} Latency Breakdown</div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr repeat(4, 1fr)", gap: 4, fontSize: 11 }}>
                      <div style={{ fontWeight: 700, padding: "4px 0" }}>Endpoint</div>
                      <div style={{ fontWeight: 700, textAlign: "center" }}>Avg</div>
                      <div style={{ fontWeight: 700, textAlign: "center" }}>P50</div>
                      <div style={{ fontWeight: 700, textAlign: "center" }}>P95</div>
                      <div style={{ fontWeight: 700, textAlign: "center" }}>Max</div>
                      {Object.entries(apiMetrics.latency).sort((a, b) => b[1].p95_ms - a[1].p95_ms).map(([ep, lat]) => (
                        <React.Fragment key={ep}>
                          <div style={{ fontFamily: "monospace", fontSize: 10, padding: "3px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ep}</div>
                          <div style={{ textAlign: "center", padding: "3px 0" }}>{lat.avg_ms}ms</div>
                          <div style={{ textAlign: "center", padding: "3px 0" }}>{lat.p50_ms}ms</div>
                          <div style={{ textAlign: "center", padding: "3px 0", color: lat.p95_ms > 500 ? C.red : lat.p95_ms > 200 ? C.orange : C.green, fontWeight: 700 }}>{lat.p95_ms}ms</div>
                          <div style={{ textAlign: "center", padding: "3px 0", color: lat.max_ms > 1000 ? C.red : C.brown }}>{lat.max_ms}ms</div>
                        </React.Fragment>
                      ))}
                    </div>
                  </Card>
                )}
                {/* Request Log */}
                <details style={{ marginTop: 16 }}>
                  <summary style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, cursor: "pointer", color: C.brown }}>Request Log (last 50)</summary>
                  <RequestLog />
                </details>
              </div>
            ) : (
              <Card style={{ textAlign: "center", padding: 40, maxWidth: 600, margin: "0 auto", background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{"\uD83D\uDCCA"}</div>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1 }}>No metrics data yet</div>
                <div style={{ fontSize: 12, color: C.brown }}>Metrics appear after the API serves some requests.</div>
              </Card>
            )}
          </SectionBg>
        )}

        {/* ── TRENDS ── */}
        {tab === "trends" && (
          <SectionBg bg={`linear-gradient(180deg, #E8F5E9 0%, #C8E6C9 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>Trend Analysis</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 16 }}>Performance trends over the last 14 days</p>
            {trends && trends.summary ? (
              <>
                <div style={{ maxWidth: 620, margin: "0 auto 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
                  <Card bg={C.white} style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, color: C.teal }}>${trends.summary.total_cost}</div>
                    <div style={{ fontSize: 11, color: C.brown }}>Total Cost</div>
                  </Card>
                  <Card bg={C.white} style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, color: C.green }}>{trends.summary.total_items_completed}</div>
                    <div style={{ fontSize: 11, color: C.brown }}>Items Completed</div>
                  </Card>
                  <Card bg={C.white} style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, color: C.orange }}>{trends.summary.total_actions}</div>
                    <div style={{ fontSize: 11, color: C.brown }}>Total Actions</div>
                  </Card>
                  <Card bg={C.white} style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 28, color: trends.summary.error_rate > 20 ? C.red : C.teal }}>{trends.summary.error_rate}%</div>
                    <div style={{ fontSize: 11, color: C.brown }}>Error Rate</div>
                  </Card>
                </div>
                <div style={{ maxWidth: 620, margin: "0 auto 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Card bg={C.white} style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 22, color: C.brown }}>${trends.summary.avg_cost_per_day}</div>
                    <div style={{ fontSize: 11, color: C.brown }}>Avg Cost/Day</div>
                  </Card>
                  <Card bg={C.white} style={{ padding: 12, textAlign: "center" }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 22, color: C.brown }}>{trends.summary.avg_items_per_day}</div>
                    <div style={{ fontSize: 11, color: C.brown }}>Avg Items/Day</div>
                  </Card>
                </div>
                {/* Per-Repo Cost Breakdown */}
                {Object.keys(costs).length > 0 && (
                  <Card bg={C.white} style={{ maxWidth: 620, margin: "0 auto 16px", padding: 14 }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, marginBottom: 10 }}>Cost by Repo</div>
                    {(() => {
                      const totalCost = Object.values(costs).reduce((a, b) => a + b, 0) || 1;
                      const sorted = Object.entries(costs).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0);
                      const barColors = [C.teal, C.orange, C.green, "#7E57C2", C.red, "#795548", "#607D8B", C.yellow];
                      return sorted.map(([rid, cost], i) => {
                        const repo = repos.find(r => r.id === Number(rid));
                        const pct = Math.round(cost / totalCost * 100);
                        return (
                          <div key={rid} style={{ marginBottom: 6 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 }}>
                              <span style={{ fontWeight: 600 }}>{repo?.name || `Repo ${rid}`}</span>
                              <span style={{ color: C.brown }}>${cost.toFixed(3)} ({pct}%)</span>
                            </div>
                            <div style={{ background: C.cream, borderRadius: 6, height: 10, overflow: "hidden", border: `1px solid ${C.darkBrown}33` }}>
                              <div style={{ height: "100%", borderRadius: 5, background: barColors[i % barColors.length], width: `${pct}%`, transition: "width .5s" }} />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </Card>
                )}
                {costHistory.length > 0 && (
                  <Card bg={C.white} style={{ maxWidth: 620, margin: "0 auto 16px", padding: 14 }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, marginBottom: 10 }}>30-Day Cost History</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 80 }}>
                      {(() => {
                        const byDate = {};
                        costHistory.forEach(r => { byDate[r.date] = (byDate[r.date] || 0) + r.cost; });
                        const dates = Object.keys(byDate).sort();
                        const maxC = Math.max(...Object.values(byDate), 0.001);
                        return dates.map((d, i) => {
                          const h = Math.max(3, (byDate[d] / maxC) * 70);
                          return (
                            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" }}>
                              <div style={{ width: "100%", height: h, background: `linear-gradient(180deg, ${C.teal} 0%, #4DB6AC 100%)`, borderRadius: "3px 3px 0 0", minWidth: 4 }} title={`${d}: $${byDate[d].toFixed(3)}`} />
                            </div>
                          );
                        });
                      })()}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 8, color: C.brown, marginTop: 2 }}>
                      {(() => {
                        const dates = [...new Set(costHistory.map(r => r.date))].sort();
                        return dates.length > 0 ? (<><span>{dates[0]?.slice(5)}</span><span>{dates[dates.length - 1]?.slice(5)}</span></>) : null;
                      })()}
                    </div>
                  </Card>
                )}
                {trends.daily?.length > 0 && (
                  <Card bg={C.white} style={{ maxWidth: 620, margin: "0 auto 16px", padding: 14 }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, marginBottom: 10 }}>Daily Breakdown</div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: `2px solid ${C.darkBrown}` }}>
                            <th style={{ padding: "6px 8px", textAlign: "left" }}>Day</th>
                            <th style={{ padding: "6px 8px", textAlign: "right" }}>Actions</th>
                            <th style={{ padding: "6px 8px", textAlign: "right" }}>Items</th>
                            <th style={{ padding: "6px 8px", textAlign: "right" }}>Cost</th>
                            <th style={{ padding: "6px 8px", textAlign: "right" }}>Errors</th>
                            <th style={{ padding: "6px 8px", textAlign: "right" }}>Avg Dur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {trends.daily.map((d, i) => (
                            <tr key={i} style={{ borderBottom: `1px solid ${C.darkBrown}22` }}>
                              <td style={{ padding: "6px 8px", fontWeight: 600 }}>{d.day}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right" }}>{d.actions}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", color: C.green, fontWeight: 700 }}>{d.items_completed}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right" }}>${d.cost}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right", color: d.errors > 0 ? C.red : C.green }}>{d.errors}</td>
                              <td style={{ padding: "6px 8px", textAlign: "right" }}>{d.avg_duration}s</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                )}
                {trends.daily?.length > 0 && (
                  <Card bg={C.white} style={{ maxWidth: 620, margin: "0 auto", padding: 14 }}>
                    <div style={{ fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, marginBottom: 10 }}>Cost Trend</div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 100 }}>
                      {trends.daily.map((d, i) => {
                        const maxCost = Math.max(...trends.daily.map(x => x.cost), 0.001);
                        const h = Math.max(4, (d.cost / maxCost) * 90);
                        return (
                          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            <div style={{ width: "100%", height: h, background: d.errors > 0 ? C.red : C.teal, borderRadius: "4px 4px 0 0", minWidth: 8 }} title={`${d.day}: $${d.cost}`} />
                            <span style={{ fontSize: 8, color: C.brown, transform: "rotate(-45deg)", whiteSpace: "nowrap" }}>{d.day.slice(5)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <Card bg={C.white} style={{ maxWidth: 620, margin: "0 auto", textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{"\uD83D\uDCC8"}</div>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 }}>No trend data yet</div>
                <div style={{ fontSize: 13, color: C.brown }}>Trends appear after the swarm starts executing steps.</div>
              </Card>
            )}
          </SectionBg>
        )}

        {/* ── COMPARE ── */}
        {tab === "compare" && (
          <SectionBg bg={`linear-gradient(180deg, #E3F2FD 0%, #BBDEFB 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>Repo Showdown</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 16 }}>Compare repos side-by-side — find your top performers</p>
            {comparison && comparison.repos?.length > 0 ? (
              <>
                {comparison.total_cost > 0 && (
                  <div style={{ textAlign: "center", marginBottom: 12 }}>
                    <span style={{ fontFamily: "'Bangers', cursive", fontSize: 20, color: C.teal }}>Total Cost: ${comparison.total_cost}</span>
                  </div>
                )}
                <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
                  {[["name","Name"],["cost","Cost"],["items_done","Items"],["error_rate","Errors"],["cycles","Cycles"],["health_score","Health"]].map(([key, label]) => (
                    <button key={key} onClick={() => setCompSort(key)} style={{
                      padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                      fontFamily: "'Fredoka', sans-serif", cursor: "pointer",
                      background: compSort === key ? C.teal : C.cream,
                      color: compSort === key ? C.white : C.darkBrown,
                      border: `2px solid ${C.darkBrown}`, transition: "all 0.15s",
                    }}>Sort: {label}</button>
                  ))}
                  <Btn bg={C.teal} onClick={exportComparison} style={{ fontSize: 11, padding: "4px 12px" }}>{"\u2B07"} CSV</Btn>
                </div>
                <Card bg={C.white} style={{ maxWidth: 720, margin: "0 auto", padding: 14, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: `2px solid ${C.darkBrown}` }}>
                        <th style={{ padding: "8px 6px", textAlign: "left" }}>Repo</th>
                        <th style={{ padding: "8px 6px", textAlign: "center" }}>State</th>
                        <th style={{ padding: "8px 6px", textAlign: "right" }}>Cost</th>
                        <th style={{ padding: "8px 6px", textAlign: "right" }}>$/Item</th>
                        <th style={{ padding: "8px 6px", textAlign: "right" }}>Items</th>
                        <th style={{ padding: "8px 6px", textAlign: "right" }}>Err%</th>
                        <th style={{ padding: "8px 6px", textAlign: "right" }}>Cycles</th>
                        <th style={{ padding: "8px 6px", textAlign: "right" }}>Health</th>
                        <th style={{ padding: "8px 6px", textAlign: "center" }}>Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...comparison.repos].sort((a, b) => {
                        if (compSort === "name") return a.name.localeCompare(b.name);
                        return (b[compSort] || 0) - (a[compSort] || 0);
                      }).map(r => (
                        <tr key={r.id} style={{ borderBottom: `1px solid ${C.darkBrown}22`, cursor: "pointer" }} onClick={() => { setSR(r.id); setTab("home"); }}>
                          <td style={{ padding: "8px 6px", fontWeight: 700 }}>{r.name}</td>
                          <td style={{ padding: "8px 6px", textAlign: "center" }}>
                            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, fontWeight: 700,
                              background: r.state === "idle" ? C.cream : r.state === "credits_exhausted" ? C.red : C.green,
                              color: r.state === "idle" ? C.brown : C.white }}>{r.state}</span>
                          </td>
                          <td style={{ padding: "8px 6px", textAlign: "right" }}>${r.cost}</td>
                          <td style={{ padding: "8px 6px", textAlign: "right", color: r.cost_per_item > 1 ? C.red : C.green }}>${r.cost_per_item}</td>
                          <td style={{ padding: "8px 6px", textAlign: "right" }}>{r.items_done}/{r.items_total}</td>
                          <td style={{ padding: "8px 6px", textAlign: "right", color: r.error_rate > 20 ? C.red : r.error_rate > 10 ? C.orange : C.green, fontWeight: 700 }}>{r.error_rate}%</td>
                          <td style={{ padding: "8px 6px", textAlign: "right" }}>{r.cycles}</td>
                          <td style={{ padding: "8px 6px", textAlign: "right" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                              background: (r.health_score||0) >= 70 ? C.green : (r.health_score||0) >= 40 ? C.orange : C.red,
                              color: C.white }}>{r.health_score || 0}</span>
                          </td>
                          <td style={{ padding: "8px 6px", textAlign: "center" }}>
                            {sparklines[r.id]?.length > 1 ? <Sparkline data={sparklines[r.id]} width={50} height={14} color={C.teal} /> : <span style={{ fontSize: 9, color: C.brown }}>-</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </>
            ) : (
              <Card bg={C.white} style={{ maxWidth: 620, margin: "0 auto", textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 36, marginBottom: 8 }}>{"\u2696\uFE0F"}</div>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 }}>No repos to compare</div>
                <div style={{ fontSize: 13, color: C.brown }}>Register some repos first to see the showdown.</div>
              </Card>
            )}
          </SectionBg>
        )}

        {tab === "settings" && (
          <SectionBg bg={`linear-gradient(180deg, ${C.sand} 0%, #E8C84E 100%)`}>
            <h2 style={{ fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" }}>Ruflo Settings</h2>
            <p style={{ textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 20 }}>Configure your swarm's model routing and optimization</p>
            <div style={{ maxWidth: 700, margin: "0 auto" }}>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 20 }}>
                <Btn bg={C.orange} style={{ fontSize: 17, padding: "14px 28px" }} onClick={async () => {
                  await apiAction("/api/ruflo-optimize", { method: "POST", body: JSON.stringify({ all: true }) }, "All repos optimized");
                }}>{"\uD83D\uDD04"} Re-Optimize All Repos</Btn>
                <Btn bg={C.teal} style={{ fontSize: 17, padding: "14px 28px" }} onClick={async () => {
                  if (!sr) return;
                  await apiAction("/api/ruflo-optimize", { method: "POST", body: JSON.stringify({ repo_id: sr }) }, "Repo optimized");
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
                      const ok = await apiAction("/api/ruflo-optimize", { method: "POST", body: JSON.stringify({ repo_id: sr, item_ids: selOptItems }) }, `${selOptItems.length} item(s) re-queued`);
                      if (ok) setSelOptItems([]);
                    }}>{"\uD83E\uDDE8"} Optimize {selOptItems.length} Selected {selOptItems.length === 1 ? "Item" : "Items"}</Btn>
                    {selOptItems.length > 0 && (
                      <span onClick={() => setSelOptItems([])} style={{ fontSize: 12, color: C.brown, cursor: "pointer", textDecoration: "underline", fontWeight: 600 }}>Clear all</span>
                    )}
                    <span onClick={() => setSelOptItems(items.map(it => it.id))} style={{ fontSize: 12, color: C.brown, cursor: "pointer", textDecoration: "underline", fontWeight: 600, marginLeft: "auto" }}>Select all</span>
                  </div>
                </Card>
              )}
              {/* ── Notifications ── */}
              <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 8, letterSpacing: 1.5 }}>{"\uD83D\uDD14"} Browser Notifications</div>
                <p style={{ fontSize: 12, color: C.brown, marginBottom: 10 }}>Get desktop notifications for cycle completions, errors, and budget alerts.</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <Btn bg={browserNotifs ? C.green : "#999"} style={{ fontSize: 13, padding: "8px 18px" }} onClick={() => {
                    if (!browserNotifs && Notification.permission !== "granted") {
                      Notification.requestPermission().then(p => {
                        if (p === "granted") { setBrowserNotifs(true); localStorage.setItem("swarm-notifs", "1"); showToast("Notifications enabled!", "success"); }
                        else showToast("Notifications blocked by browser", "warning");
                      });
                    } else {
                      const next = !browserNotifs;
                      setBrowserNotifs(next);
                      localStorage.setItem("swarm-notifs", next ? "1" : "0");
                      showToast(next ? "Notifications enabled" : "Notifications disabled", "info");
                    }
                  }}>{browserNotifs ? "\u2705 Enabled" : "\u274C Disabled"}</Btn>
                  <span style={{ fontSize: 11, color: C.brown }}>
                    {typeof Notification !== "undefined" ? `Browser permission: ${Notification.permission}` : "Not supported"}
                  </span>
                </div>
              </Card>

              {/* ── Notification Preferences ── */}
              {browserNotifs && (
                <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)` }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 18, marginBottom: 8, letterSpacing: 1.5 }}>Notification Types</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {[
                      { key: "cycles", label: "Cycle Complete", icon: "\uD83D\uDD04", desc: "When a repo finishes a cycle" },
                      { key: "errors", label: "Errors", icon: "\u26A0\uFE0F", desc: "When errors occur" },
                      { key: "budget", label: "Budget Alerts", icon: "\uD83D\uDCB0", desc: "Cost threshold warnings" },
                      { key: "stale", label: "Stale Items", icon: "\u23F0", desc: "Items stuck too long" },
                    ].map(n => (
                      <label key={n.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: C.white, borderRadius: 8, border: `1.5px solid ${notifPrefs[n.key] ? C.green : C.darkBrown}33`, cursor: "pointer", transition: "border-color 0.2s" }}>
                        <input type="checkbox" checked={notifPrefs[n.key]} onChange={() => {
                          const next = { ...notifPrefs, [n.key]: !notifPrefs[n.key] };
                          setNotifPrefs(next);
                          localStorage.setItem("swarm-notif-prefs", JSON.stringify(next));
                        }} style={{ width: 16, height: 16, accentColor: C.green }} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{n.icon} {n.label}</div>
                          <div style={{ fontSize: 10, color: C.brown }}>{n.desc}</div>
                        </div>
                      </label>
                    ))}
                  </div>
                </Card>
              )}

              {/* ── Refresh Interval ── */}
              <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #E0F7FA 0%, #B2EBF2 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 8, letterSpacing: 1.5 }}>{"\u23F1\uFE0F"} Refresh Interval</div>
                <p style={{ fontSize: 12, color: C.brown, marginBottom: 10 }}>How often the dashboard polls for new data. Lower = more responsive, higher = less load.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ ms: 1000, label: "1s" }, { ms: 3000, label: "3s" }, { ms: 5000, label: "5s" }, { ms: 10000, label: "10s" }, { ms: 30000, label: "30s" }].map(opt => (
                    <Btn key={opt.ms} bg={refreshInterval === opt.ms ? C.teal : "#bbb"} style={{ fontSize: 14, padding: "8px 18px", opacity: refreshInterval === opt.ms ? 1 : 0.7 }} onClick={() => {
                      setRefreshInterval(opt.ms);
                      localStorage.setItem("swarm-refresh", String(opt.ms));
                      showToast(`Refresh interval set to ${opt.label}`, "info");
                    }}>{opt.label}</Btn>
                  ))}
                </div>
                <div style={{ fontSize: 11, color: C.brown, marginTop: 6 }}>Current: every {refreshInterval >= 1000 ? `${refreshInterval / 1000}s` : `${refreshInterval}ms`}</div>
              </Card>

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
              {/* ── Batch Tag Editor ── */}
              <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 4, letterSpacing: 1.5 }}>{"\uD83C\uDFF7\uFE0F"} Batch Tag Wrangler</div>
                <p style={{ fontSize: 12, color: C.brown, marginBottom: 12 }}>Add or remove tags from multiple repos at once.</p>
                {(() => {
                  const allTags = [...new Set(repos.flatMap(r => (r.tags || "").split(",").filter(Boolean)))].sort();
                  return (
                    <div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                        {allTags.map(tag => (
                          <span key={tag} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 10, background: "#E8D5F5", color: "#7E57C2", fontWeight: 700, border: "1px solid #CE93D8" }}>{tag} ({repos.filter(r => (r.tags||"").split(",").includes(tag)).length})</span>
                        ))}
                        {allTags.length === 0 && <span style={{ fontSize: 11, color: C.brown }}>No tags yet</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input id="batch-tag-input" placeholder="Tag name" style={{ padding: "6px 12px", borderRadius: 8, border: `2px solid ${C.darkBrown}`, fontSize: 12, flex: 1, fontFamily: "'Fredoka', sans-serif" }} />
                        <Btn bg={C.green} style={{ fontSize: 12, padding: "6px 14px" }} onClick={async () => {
                          const tag = document.getElementById("batch-tag-input")?.value?.trim();
                          if (!tag) return;
                          const targets = repos.filter(r => !r.archived);
                          let added = 0;
                          for (const r of targets) {
                            const existing = (r.tags || "").split(",").filter(Boolean);
                            if (!existing.includes(tag)) {
                              await f(`/api/repos/tags`, { method: "POST", body: JSON.stringify({ repo_id: r.id, tags: [...existing, tag].join(",") }) });
                              added++;
                            }
                          }
                          showToast(`Added "${tag}" to ${added} repos`, "success"); load();
                        }}>+ Add to All</Btn>
                        <Btn bg={C.red} style={{ fontSize: 12, padding: "6px 14px" }} onClick={async () => {
                          const tag = document.getElementById("batch-tag-input")?.value?.trim();
                          if (!tag) return;
                          let removed = 0;
                          for (const r of repos) {
                            const existing = (r.tags || "").split(",").filter(Boolean);
                            if (existing.includes(tag)) {
                              await f(`/api/repos/tags`, { method: "POST", body: JSON.stringify({ repo_id: r.id, tags: existing.filter(t => t !== tag).join(",") }) });
                              removed++;
                            }
                          }
                          showToast(`Removed "${tag}" from ${removed} repos`, "success"); load();
                        }}>- Remove from All</Btn>
                      </div>
                    </div>
                  );
                })()}
              </Card>

              {/* ── Cost Tracker ── */}
              {Object.keys(costs).length > 0 && (
                <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)` }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 }}>{"\uD83D\uDCB0"} API Cost Tracker</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {repos.map(r => {
                      const cost = costs[r.id] || 0;
                      return (
                        <div key={r.id} style={{ background: C.white, borderRadius: 8, padding: "8px 12px", border: `1.5px solid ${C.darkBrown}33`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: cost > 1 ? C.red : cost > 0.1 ? C.orange : C.green, fontFamily: "'Bangers', cursive", letterSpacing: 0.5 }}>
                            ${cost.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ textAlign: "right", marginTop: 8, fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1 }}>
                    Total: ${Object.values(costs).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0).toFixed(2)}
                  </div>
                </Card>
              )}

              {/* ── Budget Limit ── */}
              <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #FFF8E1 0%, #FFECB3 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 8, letterSpacing: 1.5 }}>{"\uD83D\uDCB8"} Budget Limit</div>
                <p style={{ fontSize: 12, color: C.brown, marginBottom: 10 }}>Set a max API cost. Repos auto-pause when exceeded. Set to 0 for unlimited.</p>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <span style={{ fontSize: 18, fontWeight: 700 }}>$</span>
                  <Inp type="number" min="0" step="0.50" placeholder="0 = unlimited" defaultValue={budgetLimit || ""}
                    style={{ maxWidth: 140, fontSize: 14, padding: "8px 12px" }}
                    onKeyDown={async e => {
                      if (e.key === "Enter") {
                        const val = parseFloat(e.target.value) || 0;
                        const ok = await apiAction("/api/budget", { method: "POST", body: JSON.stringify({ limit: val }) },
                          val > 0 ? `Budget set to $${val.toFixed(2)}` : "Budget limit removed");
                        if (ok) setBudgetLimit(val);
                      }
                    }} />
                  <span style={{ fontSize: 11, color: C.brown }}>Press Enter to save</span>
                </div>
              </Card>

              {/* ── Repo Tags ── */}
              {sr && (
                <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)` }}>
                  <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 8, letterSpacing: 1.5 }}>{"\uD83C\uDFF7\uFE0F"} Repo Tags</div>
                  <p style={{ fontSize: 12, color: C.brown, marginBottom: 10 }}>Comma-separated tags for organizing repos (e.g. "frontend, react, priority").</p>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <Inp placeholder="tag1, tag2, tag3" defaultValue={repo?.tags || ""}
                      style={{ flex: 1, fontSize: 13, padding: "8px 12px" }}
                      onKeyDown={async e => {
                        if (e.key === "Enter") {
                          await apiAction("/api/repos/tags", { method: "POST", body: JSON.stringify({ repo_id: sr, tags: e.target.value }) }, "Tags updated");
                        }
                      }} />
                    <span style={{ fontSize: 11, color: C.brown }}>Press Enter to save</span>
                  </div>
                  {repo?.tags && (
                    <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                      {repo.tags.split(",").filter(Boolean).map(t => (
                        <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#CE93D8", color: C.white, fontWeight: 700 }}>{t.trim()}</span>
                      ))}
                    </div>
                  )}
                </Card>
              )}

              {/* ── API Token ── */}
              <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 8, letterSpacing: 1.5 }}>{"\uD83D\uDD11"} API Token</div>
                <p style={{ fontSize: 12, color: C.brown, marginBottom: 10 }}>Rotate the bearer token if you suspect it's been compromised. All open sessions will need to re-authenticate.</p>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Btn bg={C.red} style={{ fontSize: 14, padding: "10px 20px" }} onClick={async () => {
                    try {
                      const r = await f("/api/token/rotate", { method: "POST" });
                      if (r.ok) {
                        const d = await r.json();
                        __authToken = d.token;
                        showToast("API token rotated. This session updated automatically.", "success");
                      } else { showToast("Failed to rotate token", "error"); }
                    } catch(e) { showToast(`Rotation error: ${e.message}`, "error"); }
                  }}>{"\uD83D\uDD04"} Rotate Token</Btn>
                  <span style={{ fontSize: 11, color: C.brown }}>Current token prefix: {__authToken ? __authToken.slice(0, 8) + "..." : "none"}</span>
                </div>
              </Card>

              {/* ── Export / Import ── */}
              <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 }}>{"\uD83D\uDCBE"} Backup & Restore</div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Btn bg={C.teal} style={{ fontSize: 14, padding: "10px 20px" }} onClick={async () => {
                    try {
                      const r = await f("/api/repos/export");
                      if (r.ok) {
                        const data = await r.json();
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a"); a.href = url; a.download = `swarm-town-backup-${new Date().toISOString().slice(0,10)}.json`;
                        a.click(); URL.revokeObjectURL(url);
                        showToast("Backup exported", "success");
                      }
                    } catch(e) { showToast(`Export error: ${e.message}`, "error"); }
                  }}>{"\uD83D\uDCE5"} Export All Repos</Btn>
                  <Btn bg={C.orange} style={{ fontSize: 14, padding: "10px 20px" }} onClick={() => {
                    const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
                    input.onchange = async (e) => {
                      const file = e.target.files[0]; if (!file) return;
                      const text = await file.text();
                      try {
                        const data = JSON.parse(text);
                        await apiAction("/api/repos/import", { method: "POST", body: JSON.stringify({ repos: data.repos || data }) }, "Repos imported");
                      } catch(err) { showToast(`Import error: ${err.message}`, "error"); }
                    };
                    input.click();
                  }}>{"\uD83D\uDCE4"} Import Repos</Btn>
                </div>
              </Card>

              {/* ── Webhooks ── */}
              <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 }}>{"\uD83D\uDD14"} Webhooks</div>
                <p style={{ fontSize: 12, color: C.brown, marginBottom: 10 }}>Register HTTP callbacks for real-time events (state changes, logs, errors).</p>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <Inp placeholder="Webhook URL (https://...)" value={newWebhook.url} onChange={e => setNewWebhook(p => ({...p, url: e.target.value}))} style={{ flex: 1, minWidth: 200 }} />
                  <select value={newWebhook.events} onChange={e => setNewWebhook(p => ({...p, events: e.target.value}))}
                    style={{ padding: "8px 12px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, fontSize: 12, fontFamily: "'Fredoka',sans-serif", fontWeight: 600 }}>
                    <option value="*">All Events</option>
                    <option value="state_change">State Changes</option>
                    <option value="cycle_complete">Cycle Complete</option>
                    <option value="budget_exceeded">Budget Exceeded</option>
                    <option value="log">Logs</option>
                    <option value="error_event">Errors</option>
                    <option value="watchdog">Watchdog</option>
                  </select>
                  <Btn bg={C.teal} style={{ fontSize: 13, padding: "8px 16px" }} onClick={async () => {
                    if (!newWebhook.url) return;
                    const events = newWebhook.events === "*" ? ["*"] : [newWebhook.events];
                    await apiAction("/api/webhooks", { method: "POST", body: JSON.stringify({ url: newWebhook.url, events }) }, "Webhook registered");
                    setNewWebhook({ url: "", events: "*" });
                  }}>+ Add</Btn>
                </div>
                {webhooks.length > 0 && (
                  <div style={{ border: `2px solid ${C.darkBrown}33`, borderRadius: 10, background: C.white, overflow: "hidden" }}>
                    {webhooks.map(wh => (
                      <div key={wh.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.darkBrown}15` }}>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wh.url}</span>
                        <span style={{ fontSize: 10, color: C.brown, background: C.lightTeal, padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{wh.events.join(", ")}</span>
                        <button onClick={async () => {
                          await apiAction("/api/webhooks/delete", { method: "POST", body: JSON.stringify({ id: wh.id }) }, "Webhook removed");
                        }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.red, padding: "2px 6px" }}>{"\u2716"}</button>
                      </div>
                    ))}
                  </div>
                )}
                {webhooks.length === 0 && <div style={{ fontSize: 12, color: C.brown, textAlign: "center", padding: 10 }}>No webhooks registered</div>}
              </Card>

              {/* ── Dashboard Settings Export/Import ── */}
              <Card bg={C.cream} style={{ marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #E8EAF6 0%, #C5CAE9 100%)` }}>
                <div style={{ fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 8, letterSpacing: 1.5 }}>{"\u2699\uFE0F"} Dashboard Preferences</div>
                <p style={{ fontSize: 12, color: C.brown, marginBottom: 10 }}>Export or import your dashboard settings (dark mode, pinned repos, refresh interval, notifications).</p>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <Btn bg={C.teal} style={{ fontSize: 13, padding: "8px 18px" }} onClick={() => {
                    const prefs = { darkMode, pinnedRepos, refreshInterval, browserNotifs, version: 1 };
                    const blob = new Blob([JSON.stringify(prefs, null, 2)], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = "swarm-dashboard-prefs.json"; a.click(); URL.revokeObjectURL(url);
                    showToast("Preferences exported", "success");
                  }}>{"\uD83D\uDCE5"} Export Prefs</Btn>
                  <Btn bg={C.orange} style={{ fontSize: 13, padding: "8px 18px" }} onClick={() => {
                    const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
                    input.onchange = async (e) => {
                      const file = e.target.files[0]; if (!file) return;
                      try {
                        const p = JSON.parse(await file.text());
                        if (typeof p.darkMode === "boolean") { setDarkMode(p.darkMode); localStorage.setItem("swarm-dark", p.darkMode ? "1" : "0"); }
                        if (Array.isArray(p.pinnedRepos)) { setPinnedRepos(p.pinnedRepos); localStorage.setItem("swarm-pinned", JSON.stringify(p.pinnedRepos)); }
                        if (typeof p.refreshInterval === "number") { setRefreshInterval(p.refreshInterval); localStorage.setItem("swarm-refresh", String(p.refreshInterval)); }
                        if (typeof p.browserNotifs === "boolean") { setBrowserNotifs(p.browserNotifs); localStorage.setItem("swarm-notifs", p.browserNotifs ? "1" : "0"); }
                        showToast("Preferences imported!", "success");
                      } catch(err) { showToast(`Import error: ${err.message}`, "error"); }
                    };
                    input.click();
                  }}>{"\uD83D\uDCE4"} Import Prefs</Btn>
                </div>
              </Card>

              {/* ── Per-Repo Config ── */}
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

      {/* Command Palette (Ctrl+K) */}
      {showCommandPalette && (
        <div onClick={() => setShowCommandPalette(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "15vh" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: dark ? "#2D2D2D" : C.white, border: `3px solid ${C.darkBrown}`, borderRadius: 16, padding: 16, width: "90%", maxWidth: 500, boxShadow: "0 16px 48px rgba(0,0,0,0.3)" }}>
            <input autoFocus placeholder="Type a command... (go items, start, stop, dark, refresh)" value={cmdQuery}
              onChange={e => setCmdQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") { setShowCommandPalette(false); return; }
                if (e.key !== "Enter") return;
                const q = cmdQuery.toLowerCase().trim();
                const TABS_LIST = ["home","master","flow","items","plan","audio","agents","memory","mistakes","logs","history","health","metrics","trends","compare","settings"];
                // Navigate to tab
                const goTab = TABS_LIST.find(t => q === t || q === "go " + t);
                if (goTab) { setTab(goTab); setShowCommandPalette(false); return; }
                // Actions
                if (q === "start" && sr) { f("/api/start", { method: "POST", body: JSON.stringify({ repo_id: sr }) }).then(load); }
                if (q === "stop" && sr) { f("/api/stop", { method: "POST", body: JSON.stringify({ repo_id: sr }) }).then(load); }
                if (q === "dark" || q === "theme") { toggleDark(); }
                if (q === "refresh" || q === "reload") { load(true); }
                if (q.startsWith("search ")) { setTab("master"); setGlobalSearch(q.slice(7)); searchGlobal(q.slice(7)); }
                setShowCommandPalette(false);
              }}
              style={{ width: "100%", padding: "12px 16px", fontSize: 16, border: `2px solid ${C.darkBrown}`, borderRadius: 12, outline: "none", fontFamily: "'Fredoka', sans-serif", background: dark ? "#3D3D3D" : C.cream, color: dark ? "#E0E0E0" : C.darkBrown }} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, fontSize: 11, color: C.brown }}>
              {["home","items","plan","logs","health","settings","start","stop","dark","refresh"].map(cmd => (
                <span key={cmd} onClick={() => { setCmdQuery(cmd); }} style={{ padding: "3px 10px", borderRadius: 8, background: dark ? "#444" : C.cream, cursor: "pointer", border: `1px solid ${C.darkBrown}33` }}>{cmd}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Help Overlay */}
      {showHelp && (
        <div onClick={() => setShowHelp(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.cream, border: `4px solid ${C.darkBrown}`, borderRadius: 16, padding: 28, maxWidth: 420, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.3), 6px 6px 0 #3D2B1F" }}>
            <h3 style={{ fontFamily: "'Bangers', cursive", fontSize: 28, letterSpacing: 2, marginBottom: 16, textAlign: "center", color: C.darkBrown }}>Keyboard Shortcuts</h3>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 14 }}>
              {[
                ["1-9", "Switch to tab 1-9"],
                ["0", "Logs tab"],
                ["S", "Start/Stop selected repo"],
                ["P", "Pause/Resume selected repo"],
                ["R", "Refresh all data"],
                ["D", "Toggle dark mode"],
                ["/", "Focus command center"],
                ["Ctrl+K", "Command palette"],
                ["F", "Focus search/filter input"],
                ["C", "Clear all filters"],
                ["[ / ]", "Previous / Next tab"],
                ["J / K", "Navigate repos in Master view"],
                ["Enter", "Open focused repo (Master view)"],
                ["?", "Toggle this help"],
                ["Esc", "Close overlays / deselect"],
              ].map(([key, desc]) => (
                <React.Fragment key={key}>
                  <kbd style={{ background: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "3px 10px", fontFamily: "'Bangers', cursive", fontSize: 16, textAlign: "center", boxShadow: "2px 2px 0 #3D2B1F" }}>{key}</kbd>
                  <span style={{ display: "flex", alignItems: "center" }}>{desc}</span>
                </React.Fragment>
              ))}
            </div>
            <p style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: C.brown }}>Press ? or Esc to close</p>
          </div>
        </div>
      )}

      {/* ═══ TOAST NOTIFICATIONS ═══ */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>
    </div>
  );
}
