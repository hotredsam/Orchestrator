(() => {
  const { useState, useEffect, useCallback, useRef, useMemo } = React;
  class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false, error: null, errorInfo: null };
    }
    static getDerivedStateFromError(error) {
      return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
      this.setState({ errorInfo });
      console.error("Dashboard crash:", error, errorInfo);
    }
    render() {
      if (this.state.hasError) {
        return React.createElement(
          "div",
          { style: { padding: 40, textAlign: "center", fontFamily: "'Fredoka', sans-serif", background: "#FFF3E0", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" } },
          React.createElement("div", { style: { fontSize: 64, marginBottom: 16 } }, "\u{1F920}"),
          React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 32, letterSpacing: 2, marginBottom: 8 } }, "Swarm Town Hit a Cactus!"),
          React.createElement("p", { style: { fontSize: 14, color: "#5D4037", marginBottom: 16, maxWidth: 500 } }, "Something went wrong rendering the dashboard. This is usually caused by a temporary data issue."),
          React.createElement("pre", { style: { fontSize: 11, color: "#D32F2F", background: "#FFEBEE", padding: 12, borderRadius: 8, maxWidth: 600, overflow: "auto", marginBottom: 16, textAlign: "left" } }, String(this.state.error)),
          React.createElement("button", { onClick: () => {
            this.setState({ hasError: false, error: null, errorInfo: null });
          }, style: { background: "#4ECDC4", color: "#fff", border: "3px solid #3D2B1F", borderRadius: 12, padding: "12px 32px", fontSize: 18, fontFamily: "'Bangers', cursive", letterSpacing: 2, cursor: "pointer", boxShadow: "3px 3px 0 #3D2B1F" } }, "\u{1F504} Try Again"),
          React.createElement("button", { onClick: () => {
            localStorage.clear();
            window.location.reload();
          }, style: { background: "#FF6B6B", color: "#fff", border: "3px solid #3D2B1F", borderRadius: 12, padding: "12px 32px", fontSize: 18, fontFamily: "'Bangers', cursive", letterSpacing: 2, cursor: "pointer", boxShadow: "3px 3px 0 #3D2B1F", marginLeft: 12 } }, "\u{1F5D1} Reset & Reload")
        );
      }
      return this.props.children;
    }
  }
  function useDebounce(value, delay = 250) {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
      const t = setTimeout(() => setDebounced(value), delay);
      return () => clearTimeout(t);
    }, [value, delay]);
    return debounced;
  }
  const API = window.__SWARM_API_URL__ || (window.location.port ? window.location.origin : "http://localhost:6969");
  let __authToken = window.__SWARM_API_TOKEN__ || "";
  const f = (u, o) => fetch(`${API}${u}`, {
    ...o,
    headers: {
      "Content-Type": "application/json",
      ...__authToken ? { "Authorization": "Bearer " + __authToken } : {},
      ...o?.headers
    }
  });
  const asArray = (value) => Array.isArray(value) ? value : [];
  const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const asNullableObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const endpointPath = (url) => {
    try {
      return new URL(url, API).pathname;
    } catch {
      return (url || "").split("?")[0];
    }
  };
  const makeSessionId = () => {
    try {
      if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    } catch {
    }
    return `swarm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };
  const isRepoManaged = (repo) => Boolean(repo && (repo.managed ?? repo.running));
  const isRepoBusy = (repo) => Boolean(repo && (repo.busy ?? repo.running));
  const STATES = {
    idle: { label: "IDLE", emoji: "\u{1F4A4}", color: "#4ECDC4", desc: "Chillin' in the desert..." },
    check_audio: { label: "Check Audio", emoji: "\u{1F442}", color: "#FFB347", desc: "Listening for voice reviews" },
    transcribe_audio: { label: "Transcribing", emoji: "\u{1F399}\uFE0F", color: "#FF6B6B", desc: "Whisper doing its thing" },
    parse_audio_items: { label: "Parsing Audio", emoji: "\u{1F4CB}", color: "#FF6B6B", desc: "Extracting todos from voice" },
    check_refactor: { label: "Check Refactor", emoji: "\u{1F914}", color: "#FFB347", desc: "Need a cleanup?" },
    do_refactor: { label: "Refactoring", emoji: "\u{1F527}", color: "#FF6B6B", desc: "Cleaning up the town" },
    check_new_items: { label: "New Items?", emoji: "\u{1F4EC}", color: "#FFB347", desc: "Checking the mailbox" },
    update_plan: { label: "Planning", emoji: "\u{1F5FA}\uFE0F", color: "#FF6B6B", desc: "Drawing up the roadmap" },
    check_plan_complete: { label: "Plan Done?", emoji: "\u2705", color: "#FFB347", desc: "Are we there yet?" },
    execute_step: { label: "Building!", emoji: "\u26A1", color: "#FF6B6B", desc: "Agents hard at work" },
    test_step: { label: "Testing!", emoji: "\u{1F9EA}", color: "#9B59B6", desc: "Making sure it works" },
    check_steps_left: { label: "Steps Left?", emoji: "\u{1F4CA}", color: "#FFB347", desc: "How much more?" },
    check_more_items: { label: "More Work?", emoji: "\u{1F4EC}", color: "#FFB347", desc: "Anything new come in?" },
    final_optimize: { label: "Optimizing", emoji: "\u2728", color: "#4ECDC4", desc: "Polish & shine" },
    scan_repo: { label: "Final Scan", emoji: "\u{1F50D}", color: "#4ECDC4", desc: "One last look around" },
    credits_exhausted: { label: "CREDITS!", emoji: "\u{1F4B3}", color: "#E74C3C", desc: "Waiting for credits to refill..." },
    error: { label: "ERROR", emoji: "\u{1F4A5}", color: "#E74C3C", desc: "Something broke!" }
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
    { id: "credits_exhausted", x: 410, y: 306, w: 120, h: 36 }
  ];
  const FLOW_EDGES = [
    ["idle", "check_audio", "M310,54 L310,66"],
    ["check_audio", "transcribe_audio", "M370,84 L410,84", "Yes"],
    ["check_audio", "check_refactor", "M310,102 L310,114", "No"],
    ["transcribe_audio", "parse_audio_items", "M470,102 L470,114"],
    ["parse_audio_items", "check_refactor", "M410,132 L370,132"],
    ["check_refactor", "do_refactor", "M250,132 L210,132", "No"],
    ["check_refactor", "check_new_items", "M310,150 L310,162", "Yes"],
    ["do_refactor", "check_new_items", "M150,150 L150,172 L250,172"],
    ["check_new_items", "update_plan", "M370,180 L410,180", "Yes"],
    ["check_new_items", "check_plan_complete", "M310,198 L310,210", "No"],
    ["update_plan", "check_plan_complete", "M470,198 L470,220 L370,220"],
    ["check_plan_complete", "idle", "M250,228 L50,228 L50,36 L250,36", "Done"],
    ["check_plan_complete", "execute_step", "M310,246 L310,258", "No"],
    ["execute_step", "test_step", "M310,294 L310,306"],
    ["test_step", "check_steps_left", "M310,342 L310,354"],
    ["check_steps_left", "execute_step", "M370,372 L400,372 L400,276 L370,276", "Yes"],
    ["check_steps_left", "check_more_items", "M250,372 L210,372", "No"],
    ["check_more_items", "update_plan", "M150,354 L150,340 L470,340 L470,162", "Yes"],
    ["check_more_items", "final_optimize", "M150,390 L150,402", "No"],
    ["final_optimize", "scan_repo", "M150,438 L150,450"],
    ["scan_repo", "idle", "M90,468 L50,468 L50,36 L250,36"]
  ];
  function RepoReadme({ repoId, Card, C }) {
    const [content, setContent] = useState("");
    const [source, setSource] = useState("");
    useEffect(() => {
      if (repoId) f(`/api/repo-readme?repo_id=${repoId}`).then((r) => r.json()).then((d) => {
        const data = asObject(d);
        setContent(data.content || "");
        setSource(data.source || "");
      }).catch(() => {
      });
    }, [repoId]);
    return /* @__PURE__ */ React.createElement("details", { style: { maxWidth: 680, margin: "0 auto 16px" } }, /* @__PURE__ */ React.createElement("summary", { style: { fontSize: 12, fontWeight: 700, color: C.brown, cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: 1 } }, "\u{1F4C4}", " Repo Docs ", source ? `(${source})` : ""), content ? /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { marginTop: 8, padding: 16 } }, /* @__PURE__ */ React.createElement("pre", { style: { fontSize: 11, lineHeight: 1.5, color: C.darkBrown, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflowY: "auto", fontFamily: "monospace", margin: 0 } }, content)) : /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown, marginTop: 6, textAlign: "center" } }, "No CLAUDE.md or README.md found."));
  }
  function RequestLog() {
    const [entries, setEntries] = useState([]);
    const [filter, setFilter] = useState("all");
    useEffect(() => {
      const url = filter === "error" ? "/api/request-log?limit=50&status=error" : "/api/request-log?limit=50";
      f(url).then((r) => r.json()).then((d) => setEntries(d.requests || [])).catch(() => {
      });
    }, [filter]);
    const statusColor = (s) => s >= 500 ? "#E74C3C" : s >= 400 ? "#F7941D" : "#2ECC71";
    return /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 8 } }, ["all", "error"].map((f2) => /* @__PURE__ */ React.createElement("span", { key: f2, onClick: () => setFilter(f2), style: { cursor: "pointer", padding: "3px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, background: filter === f2 ? "#00B4D8" : "#ddd", color: filter === f2 ? "#fff" : "#333" } }, f2 === "all" ? "All" : "Errors Only"))), /* @__PURE__ */ React.createElement("div", { style: { maxHeight: 300, overflowY: "auto", fontSize: 11 } }, entries.map((e, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 8, padding: "3px 6px", borderBottom: "1px solid #eee", fontFamily: "monospace" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "#999", fontSize: 10, minWidth: 55 } }, e.ts?.slice(11, 19) || ""), /* @__PURE__ */ React.createElement("span", { style: { color: statusColor(e.status), fontWeight: 700, minWidth: 30 } }, e.status), /* @__PURE__ */ React.createElement("span", { style: { flex: 1 } }, e.path), /* @__PURE__ */ React.createElement("span", { style: { color: e.latency_ms > 200 ? "#E74C3C" : "#999", minWidth: 55, textAlign: "right" } }, e.latency_ms, "ms"))), entries.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: 12, color: "#999" } }, "No requests logged yet")));
  }
  function Dashboard() {
    const [darkMode, setDarkMode] = useState(() => localStorage.getItem("swarm-dark") === "1");
    const toggleDark = () => {
      setDarkMode((d) => {
        const v = !d;
        localStorage.setItem("swarm-dark", v ? "1" : "0");
        return v;
      });
    };
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
    const [lastRefresh, setLastRefresh] = useState(null);
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
    const [itemFilter, setItemFilter] = useState(() => localStorage.getItem("swarm-item-filter") || "all");
    const [webhooks, setWebhooks] = useState([]);
    const [newWebhook, setNewWebhook] = useState({ url: "", events: "*" });
    const [budgetLimit, setBudgetLimit] = useState(0);
    const [repoSort, setRepoSort] = useState(() => localStorage.getItem("swarm-repo-sort") || "name");
    const [repoFilter, setRepoFilter] = useState("all");
    const [logSearch, setLogSearch] = useState("");
    const [memSearch, setMemSearch] = useState("");
    const [mistakeSearch, setMistakeSearch] = useState("");
    const [toasts, setToasts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [apiMetrics, setApiMetrics] = useState(null);
    const [pinnedRepos, setPinnedRepos] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("swarm-pinned") || "[]");
      } catch {
        return [];
      }
    });
    const [uptime, setUptime] = useState("");
    const [sysInfo, setSysInfo] = useState({});
    const [browserNotifs, setBrowserNotifs] = useState(() => localStorage.getItem("swarm-notifs") === "1");
    const [notifPrefs, setNotifPrefs] = useState(() => {
      try {
        return JSON.parse(localStorage.getItem("swarm-notif-prefs") || '{"cycles":true,"errors":true,"budget":true,"stale":true}');
      } catch {
        return { cycles: true, errors: true, budget: true, stale: true };
      }
    });
    const [sourceFilter, setSourceFilter] = useState("all");
    const [priorityFilter, setPriorityFilter] = useState("all");
    const [mistakeAnalysis, setMistakeAnalysis] = useState(null);
    const [selectedItems, setSelectedItems] = useState(/* @__PURE__ */ new Set());
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
    const [compactRepos, setCompactRepos] = useState(false);
    const [groupByType, setGroupByType] = useState(false);
    const [sseConnected, setSseConnected] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(() => parseInt(localStorage.getItem("swarm-refresh") || "15000"));
    const [staleItems, setStaleItems] = useState([]);
    const [recentErrors, setRecentErrors] = useState([]);
    const [circuitBreakers, setCircuitBreakers] = useState([]);
    const [showCommandPalette, setShowCommandPalette] = useState(false);
    const [cmdQuery, setCmdQuery] = useState("");
    const [newNote, setNewNote] = useState("");
    const [batchSelected, setBatchSelected] = useState(/* @__PURE__ */ new Set());
    const [editingItem, setEditingItem] = useState(null);
    const [planSearch, setPlanSearch] = useState("");
    const [planCollapsed, setPlanCollapsed] = useState(false);
    const [planDurFilter, setPlanDurFilter] = useState(0);
    const [confirmDialog, setConfirmDialog] = useState(null);
    const [expandedLog, setExpandedLog] = useState(null);
    const [histFilter, setHistFilter] = useState("all");
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [claudeSessions, setClaudeSessions] = useState([]);
    const mRec = useRef(null);
    const chnk = useRef([]);
    const tmr = useRef(null);
    const sseRef = useRef(null);
    const missingApiRef = useRef(/* @__PURE__ */ new Set());
    const sseRetries = useRef(0);
    const sessionIdRef = useRef(sessionStorage.getItem("swarm-dashboard-session") || makeSessionId());
    const loadStateRef = useRef({ inFlight: false, pending: false, pendingFull: false });
    const [sessionReady, setSessionReady] = useState(false);
    const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== "hidden");
    useEffect(() => {
      sessionStorage.setItem("swarm-dashboard-session", sessionIdRef.current);
    }, []);
    const [toastHistory, setToastHistory] = useState([]);
    const [tabPulse, setTabPulse] = useState({});
    const prevBadges = useRef({});
    const [showToastHistory, setShowToastHistory] = useState(false);
    const [expandedCards, setExpandedCards] = useState(/* @__PURE__ */ new Set());
    const showToast = useCallback((message, type = "info") => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
      setToastHistory((prev) => [...prev.slice(-49), { id, message, type, time: (/* @__PURE__ */ new Date()).toLocaleTimeString() }]);
      setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4e3);
    }, []);
    const dLogSearch = useDebounce(logSearch, 200);
    const dMemSearch = useDebounce(memSearch, 200);
    const dMistakeSearch = useDebounce(mistakeSearch, 200);
    const filteredMistakes = useMemo(() => {
      if (!dMistakeSearch) return mistakes;
      const q = dMistakeSearch.toLowerCase();
      return mistakes.filter((m) => [m.error_type, m.description, m.resolution].join(" ").toLowerCase().includes(q));
    }, [mistakes, dMistakeSearch]);
    const filteredLogs = useMemo(() => {
      if (!dLogSearch && logLevelFilter === "all") return logs;
      return logs.filter((l) => {
        if (dLogSearch && ![l.state, l.action, l.result, l.error].join(" ").toLowerCase().includes(dLogSearch.toLowerCase())) return false;
        if (logLevelFilter === "errors" && !l.error) return false;
        if (logLevelFilter === "costly" && !(l.cost_usd > 0.01)) return false;
        if (logLevelFilter === "opus" && !(l.model && l.model.toLowerCase().includes("opus"))) return false;
        if (logLevelFilter === "sonnet" && !(l.model && l.model.toLowerCase().includes("sonnet"))) return false;
        if (logLevelFilter === "haiku" && !(l.model && l.model.toLowerCase().includes("haiku"))) return false;
        return true;
      });
    }, [logs, dLogSearch, logLevelFilter]);
    const filteredMemory = useMemo(() => {
      if (!dMemSearch) return memory;
      return memory.filter((m) => [m.namespace, m.key, m.value].join(" ").toLowerCase().includes(dMemSearch.toLowerCase()));
    }, [memory, dMemSearch]);
    const filteredItems = useMemo(() => {
      return items.filter(
        (it) => (itemFilter === "all" || it.status === itemFilter) && (sourceFilter === "all" || it.source === sourceFilter) && (priorityFilter === "all" || it.priority === priorityFilter)
      );
    }, [items, itemFilter, sourceFilter, priorityFilter]);
    const [logPageSize, setLogPageSize] = useState(100);
    useEffect(() => setLogPageSize(100), [dLogSearch, logLevelFilter]);
    const visibleLogs = useMemo(() => filteredLogs.slice(0, logPageSize), [filteredLogs, logPageSize]);
    const repoStats = useMemo(() => {
      const totalDone = repos.reduce((s, r) => s + (r.stats?.items_done || 0), 0);
      const totalItems = repos.reduce((s, r) => s + (r.stats?.items_total || 0), 0);
      const totalAgents = repos.reduce((s, r) => s + (r.stats?.agents || 0), 0);
      const totalErrors = repos.reduce((s, r) => s + (r.stats?.mistakes || 0), 0);
      const overallPct = totalItems > 0 ? Math.round(totalDone / totalItems * 100) : 0;
      const managed = repos.filter((r) => isRepoManaged(r)).length;
      const busy = repos.filter((r) => isRepoBusy(r)).length;
      const paused = repos.filter((r) => r.paused).length;
      return {
        total: repos.length,
        managed,
        running: busy,
        busy,
        paused,
        idle: repos.filter((r) => !isRepoBusy(r) && !r.paused).length,
        totalCost: Object.values(costs).reduce((a, b) => a + (b || 0), 0),
        errorState: repos.filter((r) => r.state === "error" || r.state === "credits_exhausted").length,
        totalDone,
        totalItems,
        totalAgents,
        totalErrors,
        overallPct
      };
    }, [repos, costs]);
    const runningRepos = useMemo(() => repos.filter((r) => isRepoBusy(r)), [repos]);
    const sortedRepos = useMemo(
      () => [...repos].sort((a, b) => {
        const pa = pinnedRepos.includes(a.id) ? 0 : 1;
        const pb = pinnedRepos.includes(b.id) ? 0 : 1;
        return pa - pb || a.name.localeCompare(b.name);
      }),
      [repos, pinnedRepos]
    );
    const itemStats = useMemo(() => {
      const pending = items.filter((i) => i.status === "pending");
      const done = items.filter((i) => i.status === "completed");
      return { pending: pending.length, done: done.length, total: items.length, completePct: items.length > 0 ? Math.round(done.length / items.length * 100) : 0 };
    }, [items]);
    const planStats = useMemo(() => {
      const done = plan.filter((s) => s.status === "completed").length;
      const inProg = plan.filter((s) => s.status === "in_progress").length;
      return { done, inProgress: inProg, total: plan.length, pct: plan.length > 0 ? Math.round(done / plan.length * 100) : 0 };
    }, [plan]);
    const tabBadges = useMemo(() => ({
      home: repoStats.running,
      items: itemStats.pending,
      mistakes: mistakes.length,
      logs: logs.filter((l) => l.error).length,
      plan: planStats.inProgress
    }), [repoStats.running, itemStats.pending, planStats.inProgress, mistakes, logs]);
    const totalCost = repoStats.totalCost;
    const notify = useCallback((title, body) => {
      if (!browserNotifs) return;
      if (Notification.permission === "granted") {
        new Notification(title, { body, icon: "/favicon.ico" });
      }
    }, [browserNotifs]);
    const apiToken = token || __authToken;
    const rateLimitedUntilRef = useRef(0);
    const isOptionalEndpointAvailable = useCallback((url) => !missingApiRef.current.has(endpointPath(url)), []);
    const fetchOptional = useCallback(async (url, options) => {
      const key = endpointPath(url);
      if (missingApiRef.current.has(key)) return null;
      if (Date.now() < rateLimitedUntilRef.current) return null;
      try {
        const response = await f(url, options);
        if (response.status === 404) {
          missingApiRef.current.add(key);
          return null;
        }
        if (response.status === 429) {
          rateLimitedUntilRef.current = Date.now() + 1e4;
          return null;
        }
        return response.ok ? response : null;
      } catch {
        return null;
      }
    }, []);
    const postSession = useCallback(async (route, payload = {}) => {
      if (!apiToken) return false;
      try {
        const sessionRoute = route === "/api/app/session/close" ? `${route}?token=${encodeURIComponent(apiToken)}` : route;
        const response = await f(sessionRoute, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiToken}` },
          body: JSON.stringify({
            session_id: sessionIdRef.current,
            path: window.location.pathname,
            visible: document.visibilityState !== "hidden",
            ...payload
          }),
          keepalive: route === "/api/app/session/close"
        });
        return response.ok;
      } catch {
        return false;
      }
    }, [apiToken]);
    useEffect(() => {
      localStorage.setItem("swarm-item-filter", itemFilter);
    }, [itemFilter]);
    useEffect(() => {
      localStorage.setItem("swarm-repo-sort", repoSort);
    }, [repoSort]);
    useEffect(() => {
      if (!__authToken) {
        fetch(`${API}/api/token`).then((r) => r.json()).then((d) => {
          if (d.token) {
            __authToken = d.token;
            setToken(d.token);
          }
        }).catch(() => {
        });
      }
    }, []);
    useEffect(() => {
      if (!apiToken) return void 0;
      let alive = true;
      const heartbeat = () => postSession("/api/app/session/heartbeat");
      postSession("/api/app/session/open").then((ok) => {
        if (alive) setSessionReady(ok);
      });
      const hb = setInterval(heartbeat, 1e4);
      const onVisibility = () => {
        const visible = document.visibilityState !== "hidden";
        setPageVisible(visible);
        if (visible) {
          postSession("/api/app/session/heartbeat", { visible: true });
        }
      };
      const onPageHide = () => {
        postSession("/api/app/session/close");
      };
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("pagehide", onPageHide);
      window.addEventListener("beforeunload", onPageHide);
      return () => {
        alive = false;
        clearInterval(hb);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("beforeunload", onPageHide);
        postSession("/api/app/session/close");
        setSessionReady(false);
      };
    }, [apiToken, postSession]);
    useEffect(() => {
      if (!apiToken) return void 0;
      const connect = () => {
        if (sseRef.current) sseRef.current.close();
        const es = new EventSource(`${API}/api/events?token=${encodeURIComponent(apiToken)}`);
        sseRef.current = es;
        es.addEventListener("state_change", (e) => {
          try {
            const d = JSON.parse(e.data);
            if (d.cost) setCosts((prev) => ({ ...prev, [d.repo_id]: d.cost }));
            load(false);
          } catch {
          }
        });
        es.addEventListener("log", (e) => {
          try {
            const d = JSON.parse(e.data);
            if (d.cost) setCosts((prev) => ({ ...prev, [d.repo_id]: (prev[d.repo_id] || 0) + d.cost }));
          } catch {
          }
        });
        es.addEventListener("watchdog", (e) => {
          try {
            const d = JSON.parse(e.data);
            showToast(`Watchdog restarted ${d.repo_name || "repo"}`, "warning");
            load(false);
          } catch {
          }
        });
        es.addEventListener("error_event", (e) => {
          try {
            const d = JSON.parse(e.data);
            showToast(`Error in ${d.repo_name || "repo"}: ${(d.error || "").slice(0, 80)}`, "error");
            notify("Swarm Error", `${d.repo_name || "repo"}: ${(d.error || "").slice(0, 80)}`);
          } catch {
          }
        });
        es.addEventListener("cycle_complete", (e) => {
          try {
            const d = JSON.parse(e.data);
            showToast(`${d.repo || "Repo"} completed cycle #${d.cycle} (${d.items_done}/${d.items_total} items, ${d.tests_passed} tests)`, "success");
            notify("Cycle Complete", `${d.repo} cycle #${d.cycle}: ${d.items_done}/${d.items_total} items done`);
            load(false);
          } catch {
          }
        });
        es.addEventListener("budget_exceeded", (e) => {
          try {
            const d = JSON.parse(e.data);
            showToast(`${d.repo || "Repo"} paused: budget $${d.budget?.toFixed(2)} exceeded ($${d.cost?.toFixed(2)} spent)`, "warning");
            notify("Budget Exceeded", `${d.repo} paused: $${d.cost?.toFixed(2)} spent`);
            load(false);
          } catch {
          }
        });
        es.addEventListener("dashboard_presence", (e) => {
          try {
            const d = JSON.parse(e.data);
            if (!d.active) showToast("Dashboard session ended. Repo work stopped.", "info");
          } catch {
          }
        });
        es.addEventListener("connected", () => {
          setSseConnected(true);
          sseRetries.current = 0;
        });
        es.onerror = () => {
          setSseConnected(false);
          es.close();
          sseRetries.current++;
          const delay = Math.min(5e3 * sseRetries.current, 3e4);
          setTimeout(connect, delay);
        };
      };
      connect();
      return () => {
        if (sseRef.current) sseRef.current.close();
      };
    }, [apiToken, sessionReady, notify]);
    const tabRef = useRef(tab);
    tabRef.current = tab;
    const load = useCallback(async (full = true) => {
      if (!apiToken || !sessionReady) return;
      if (!pageVisible && !full) return;
      if (Date.now() < rateLimitedUntilRef.current) return;
      if (loadStateRef.current.inFlight) {
        loadStateRef.current.pending = true;
        loadStateRef.current.pendingFull = loadStateRef.current.pendingFull || full;
        return;
      }
      loadStateRef.current.inFlight = true;
      setLoading(true);
      let selectedRepoId = sr;
      try {
        try {
          const repoUrl = repoFilter === "archived" ? "/api/repos?include_archived=1" : "/api/repos";
          const r = await f(repoUrl);
          if (r.status === 429) {
            rateLimitedUntilRef.current = Date.now() + 1e4;
            return;
          }
          if (r.ok) {
            const d = asArray(await r.json()).map((repoRow) => ({
              ...repoRow,
              managed: Boolean(repoRow.managed ?? repoRow.running),
              busy: Boolean(repoRow.busy ?? repoRow.running)
            }));
            setRepos(d);
            if (!selectedRepoId && d.length) {
              selectedRepoId = d[0].id;
              setSR(d[0].id);
            }
          }
          setCon(true);
        } catch (err) {
          console.warn("Server connection lost:", err.message);
          setCon(false);
          return;
        }
        if (!selectedRepoId) return;
        const t = tabRef.current;
        const fetches = [f(`/api/items?repo_id=${selectedRepoId}`), f(`/api/plan?repo_id=${selectedRepoId}`)];
        const keys = ["items", "plan"];
        if (full || t === "home" || t === "logs") {
          fetches.push(f(`/api/logs?repo_id=${selectedRepoId}`));
          keys.push("logs");
        }
        if ((full || t === "home") && isOptionalEndpointAvailable("/api/notes")) {
          fetches.push(f(`/api/notes?repo_id=${selectedRepoId}`));
          keys.push("repoNotes");
        }
        if (full || t === "agents") {
          fetches.push(f(`/api/agents?repo_id=${selectedRepoId}`));
          keys.push("agents");
          fetches.push(f(`/api/agent-stats?repo_id=${selectedRepoId}`));
          keys.push("agentStats");
        }
        if (full || t === "memory") {
          fetches.push(f(`/api/memory?repo_id=${selectedRepoId}`));
          keys.push("memory");
        }
        if (full || t === "mistakes") {
          fetches.push(f(`/api/mistakes?repo_id=${selectedRepoId}`));
          keys.push("mistakes");
          fetches.push(f(`/api/mistakes/analysis?repo_id=${selectedRepoId}`));
          keys.push("mistakeAnalysis");
        }
        if (full || t === "audio") {
          fetches.push(f(`/api/audio?repo_id=${selectedRepoId}`));
          keys.push("audio");
        }
        if (full || t === "history") {
          fetches.push(f(`/api/history?repo_id=${selectedRepoId}`));
          keys.push("history");
        }
        const results = await Promise.all(fetches);
        const setters = { items: setItems, plan: setPlan, logs: setLogs, agents: setAgents, agentStats: setAgentStats, memory: setMemory, mistakes: setMistakes, mistakeAnalysis: setMistakeAnalysis, audio: setAudio, history: setHistory, repoNotes: setRepoNotes };
        const collectionKeys = /* @__PURE__ */ new Set(["items", "plan", "logs", "agents", "memory", "mistakes", "audio", "history", "repoNotes"]);
        const nullableObjectKeys = /* @__PURE__ */ new Set(["agentStats", "mistakeAnalysis"]);
        for (let i = 0; i < keys.length; i++) {
          if (results[i].ok) {
            const key = keys[i];
            const d = await results[i].json();
            if (collectionKeys.has(key)) setters[key](asArray(d));
            else if (nullableObjectKeys.has(key)) setters[key](asNullableObject(d));
            else setters[key](d);
          }
        }
        try {
          const cr = await fetchOptional("/api/costs");
          if (cr) {
            const cd = asObject(await cr.json());
            if (cd.costs) setCosts(asObject(cd.costs));
          }
        } catch {
        }
        try {
          const cs2 = await fetchOptional("/api/claude-sessions");
          if (cs2) {
            const cd2 = asObject(await cs2.json());
            setClaudeSessions(asArray(cd2.sessions));
          }
        } catch {
        }
        if (full || t === "settings") {
          try {
            const wr = await fetchOptional("/api/webhooks");
            if (wr) {
              const wd = asObject(await wr.json());
              setWebhooks(asArray(wd.webhooks));
            }
          } catch {
          }
          try {
            const br = await fetchOptional("/api/budget");
            if (br) {
              const bd = asObject(await br.json());
              setBudgetLimit(bd.budget_limit || 0);
            }
          } catch {
          }
        }
        if (full || t === "metrics") {
          try {
            const mr = await fetchOptional("/api/metrics");
            if (mr) setApiMetrics(await mr.json());
          } catch {
          }
        }
        if (full || t === "trends") {
          try {
            const tr = await fetchOptional(`/api/trends?repo_id=${selectedRepoId}&days=14`);
            if (tr) setTrends(asNullableObject(await tr.json()));
          } catch {
          }
          try {
            const ch = await fetchOptional("/api/costs/history?days=30");
            if (ch) {
              const cd = asObject(await ch.json());
              setCostHistory(asArray(cd.history));
            }
          } catch {
          }
        }
        if (full || t === "compare") {
          try {
            const cr = await fetchOptional("/api/comparison");
            if (cr) setComparison(asNullableObject(await cr.json()));
          } catch {
          }
        }
        try {
          const sr2 = await fetchOptional("/api/status");
          if (sr2) {
            const sd = asObject(await sr2.json());
            setUptime(sd.uptime || "");
            setSysInfo({ threads: sd.threads, mem: sd.memory_mb, pid: sd.pid });
          }
        } catch {
        }
        if (full || t === "home") {
          try {
            const sl = await fetchOptional("/api/stale-items?hours=2");
            if (sl) {
              const sd = asObject(await sl.json());
              setStaleItems(asArray(sd.stale_items));
            }
          } catch {
          }
          try {
            const er = await fetchOptional("/api/errors/recent?limit=5");
            if (er) {
              const ed = asObject(await er.json());
              setRecentErrors(asArray(ed.errors));
            }
          } catch {
          }
        }
        if (full || t === "health") {
          try {
            const cb = await fetchOptional("/api/circuit-breakers");
            if (cb) {
              const cd = asObject(await cb.json());
              setCircuitBreakers(asArray(cd.circuit_breakers));
            }
          } catch {
          }
          try {
            const hs = await fetchOptional("/api/health/detailed");
            if (hs) setHealthScores(asNullableObject(await hs.json()));
          } catch {
          }
          try {
            const sp = await fetchOptional("/api/sparklines");
            if (sp) {
              const sd = asObject(await sp.json());
              setSparklines(asObject(sd.sparklines));
            }
          } catch {
          }
          try {
            const et = await fetchOptional("/api/eta");
            if (et) {
              const ed = asObject(await et.json());
              setEtas(asObject(ed.etas));
            }
          } catch {
          }
          try {
            const hm = await fetchOptional("/api/heatmap");
            if (hm) setHeatmap(asNullableObject(await hm.json()));
          } catch {
          }
          try {
            const cf = await fetchOptional("/api/cost-forecast");
            if (cf) setCostForecast(asNullableObject(await cf.json()));
          } catch {
          }
          try {
            const hh = await fetchOptional("/api/health/history");
            if (hh) setHealthHistory(asNullableObject(await hh.json()));
          } catch {
          }
        }
      } catch (err) {
        console.warn("Data fetch error:", err.message);
      } finally {
        setLoading(false);
        setLastRefresh(Date.now());
        loadStateRef.current.inFlight = false;
        if (loadStateRef.current.pending) {
          const nextFull = loadStateRef.current.pendingFull;
          loadStateRef.current.pending = false;
          loadStateRef.current.pendingFull = false;
          setTimeout(() => load(nextFull), 250);
        }
      }
    }, [apiToken, fetchOptional, isOptionalEndpointAvailable, pageVisible, repoFilter, sessionReady, sr]);
    useEffect(() => {
      if (!apiToken || !sessionReady) return void 0;
      load(true);
      const i = setInterval(() => {
        if (document.visibilityState === "visible") load(false);
      }, refreshInterval);
      return () => clearInterval(i);
    }, [apiToken, load, refreshInterval, sessionReady]);
    useEffect(() => {
      if (logTail && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }, [logTail, logs]);
    useEffect(() => {
      const onScroll = () => setScrolledPast(window.scrollY > 180);
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }, []);
    useEffect(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, [tab]);
    const [showHelp, setShowHelp] = useState(false);
    useEffect(() => {
      const handler = (e) => {
        if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          setShowCommandPalette((prev) => !prev);
          setCmdQuery("");
          return;
        }
        if (e.key === "Escape" && showCommandPalette) {
          setShowCommandPalette(false);
          return;
        }
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT") return;
        const TABS_LIST = ["home", "master", "flow", "items", "plan", "audio", "agents", "memory", "mistakes", "logs", "history", "health", "metrics", "trends", "compare", "settings"];
        if (e.key >= "1" && e.key <= "9") {
          e.preventDefault();
          const idx = parseInt(e.key) - 1;
          if (TABS_LIST[idx]) setTab(TABS_LIST[idx]);
        }
        if (e.key === "0") {
          e.preventDefault();
          setTab("logs");
        }
        if (e.key === "s" && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (sr) f(`/api/${isRepoManaged(repo) ? "stop" : "start"}`, { method: "POST", body: JSON.stringify({ repo_id: sr }) }).then(() => load(true));
        }
        if (e.key === "p" && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (sr && isRepoManaged(repo)) f(`/api/${repo?.paused ? "resume" : "pause"}`, { method: "POST", body: JSON.stringify({ repo_id: sr }) }).then(() => load(true));
        }
        if (e.key === "r" && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          load();
        }
        if (e.key === "d" && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          toggleDark();
        }
        if (e.key === "/") {
          e.preventDefault();
          setTab("home");
          setTimeout(() => {
            const el = document.querySelector("input[placeholder*='command']");
            if (el) el.focus();
          }, 100);
        }
        if (e.key === "Escape") {
          setShowHelp(false);
          setSelectedItems(/* @__PURE__ */ new Set());
          setConfirmDialog(null);
        }
        if (e.key === "?") setShowHelp((prev) => !prev);
        if (e.key === "f" && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
          e.preventDefault();
          setTimeout(() => {
            const el = document.querySelector("input[placeholder*='Search'],input[placeholder*='search'],input[placeholder*='Filter']");
            if (el) el.focus();
          }, 50);
        }
        if (e.key === "F" && e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          const cycle = ["all", "running", "idle", "paused", "error"];
          const ci = cycle.indexOf(repoFilter);
          setRepoFilter(cycle[(ci + 1) % cycle.length]);
        }
        if (e.key === "n" && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setTab("items");
          setTimeout(() => {
            const el = document.querySelector("input[placeholder*='Bounty title']");
            if (el) el.focus();
          }, 100);
        }
        if (e.key === "i" && e.altKey) {
          e.preventDefault();
          setShowQuickAdd(true);
        }
        if (e.key === "c" && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          setSourceFilter("all");
          setPriorityFilter("all");
          setItemFilter("all");
          setLogSearch("");
          setMemSearch("");
          setRepoFilter("all");
          setSelectedItems(/* @__PURE__ */ new Set());
        }
        if (e.key === "[") {
          e.preventDefault();
          const ci = TABS_LIST.indexOf(tab);
          if (ci > 0) setTab(TABS_LIST[ci - 1]);
        }
        if (e.key === "]") {
          e.preventDefault();
          const ci = TABS_LIST.indexOf(tab);
          if (ci < TABS_LIST.length - 1) setTab(TABS_LIST[ci + 1]);
        }
        if (tab === "master" && e.key === "j") {
          e.preventDefault();
          setMasterFocus((prev) => {
            const next = Math.min(prev + 1, repos.length - 1);
            const cards = document.querySelectorAll(".master-card");
            if (cards[next]) cards[next].scrollIntoView({ behavior: "smooth", block: "nearest" });
            return next;
          });
        }
        if (tab === "master" && e.key === "k") {
          e.preventDefault();
          setMasterFocus((prev) => {
            const next = Math.max(prev - 1, 0);
            const cards = document.querySelectorAll(".master-card");
            if (cards[next]) cards[next].scrollIntoView({ behavior: "smooth", block: "nearest" });
            return next;
          });
        }
        if (tab === "master" && e.key === "Enter" && masterFocus >= 0 && masterFocus < repos.length) {
          e.preventDefault();
          const r = repos[masterFocus];
          if (r) {
            setSR(r.id);
            setTab("flow");
          }
        }
      };
      window.addEventListener("keydown", handler);
      return () => window.removeEventListener("keydown", handler);
    }, [sr, repos, showCommandPalette, tab, repoFilter, masterFocus]);
    const repo = repos.find((r) => r.id === sr);
    const cs = repo?.state || "idle";
    const si = STATES[cs] || STATES.idle;
    const st = repo?.stats || {};
    const addItem = async () => {
      if (!ni.title || !ni.description || !sr) return;
      await apiAction("/api/items", { method: "POST", body: JSON.stringify({ ...ni, repo_id: sr }) }, "Item added");
      setNI((p) => ({ ...p, title: "", description: "" }));
    };
    const deleteItem = async (itemId) => {
      if (!sr) return;
      await apiAction("/api/items/delete", { method: "POST", body: JSON.stringify({ repo_id: sr, item_id: itemId }) }, "Item deleted");
    };
    const clearItems = (status) => {
      if (!sr) return;
      const label = status || "all";
      setConfirmDialog({ message: `Clear ${label} items? This cannot be undone.`, onConfirm: () => {
        apiAction("/api/items/clear", { method: "POST", body: JSON.stringify({ repo_id: sr, ...status ? { status } : {} }) }, `${label} items cleared`);
      } });
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
    const saveItemEdit = async () => {
      if (!sr || !editingItem) return;
      await apiAction("/api/items/update", { method: "POST", body: JSON.stringify({ repo_id: sr, item_id: editingItem.id, title: editingItem.title, priority: editingItem.priority }) }, "Item updated");
      setEditingItem(null);
    };
    const togglePin = (repoId) => {
      setPinnedRepos((prev) => {
        const next = prev.includes(repoId) ? prev.filter((id) => id !== repoId) : [...prev, repoId];
        localStorage.setItem("swarm-pinned", JSON.stringify(next));
        return next;
      });
    };
    const retryAllCompleted = () => {
      if (!sr) return;
      setConfirmDialog({ message: "Re-queue all completed items back to pending?", onConfirm: () => {
        apiAction("/api/items/retry", { method: "POST", body: JSON.stringify({ repo_id: sr, status: "completed" }) }, "All completed items re-queued");
      } });
    };
    const bulkUpdateItems = (action, value) => {
      if (!sr || selectedItems.size === 0) return;
      const label = action === "delete" ? "Delete" : `Set ${action.replace("change_", "")} to ${value}`;
      setConfirmDialog({ message: `${label} for ${selectedItems.size} items?`, onConfirm: () => {
        apiAction("/api/items/bulk-update", { method: "POST", body: JSON.stringify({ repo_id: sr, item_ids: [...selectedItems], action, value }) }, `${selectedItems.size} items updated`);
        setSelectedItems(/* @__PURE__ */ new Set());
      } });
    };
    const toggleSelectItem = (id) => setSelectedItems((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
    const toggleSelectAll = () => {
      setSelectedItems((prev) => prev.size === filteredItems.length ? /* @__PURE__ */ new Set() : new Set(filteredItems.map((it) => it.id)));
    };
    const addRepo = async () => {
      if (!nr.name || !nr.path) return;
      await apiAction("/api/repos", { method: "POST", body: JSON.stringify(nr) }, "Repo registered");
      setNR({ name: "", path: "", github_url: "", branch: "main" });
    };
    const startRepo = async (id) => {
      await apiAction("/api/start", { method: "POST", body: JSON.stringify({ repo_id: id }) }, "Repo started");
    };
    const stopRepo = async (id) => {
      await apiAction("/api/stop", { method: "POST", body: JSON.stringify({ repo_id: id }) }, "Repo stopped");
    };
    const startAll = async () => {
      await apiAction("/api/start", { method: "POST", body: JSON.stringify({ repo_id: "all" }) }, "All repos started");
    };
    const stopAll = async () => {
      await apiAction("/api/stop", { method: "POST", body: JSON.stringify({ repo_id: "all" }) }, "All repos stopped");
    };
    const pauseRepo = async (id) => {
      await apiAction("/api/pause", { method: "POST", body: JSON.stringify({ repo_id: id }) }, "Repo paused");
    };
    const resumeRepo = async (id) => {
      await apiAction("/api/resume", { method: "POST", body: JSON.stringify({ repo_id: id }) }, "Repo resumed");
    };
    const deleteRepo = (id) => {
      setConfirmDialog({ message: "Remove this repo from Swarm Town? (files on disk are kept)", onConfirm: () => apiAction("/api/repos/delete", { method: "POST", body: JSON.stringify({ repo_id: id }) }, "Repo removed") });
    };
    const pushGH = async () => {
      if (sr) await apiAction("/api/push", { method: "POST", body: JSON.stringify({ repo_id: sr, message: "manual push" }) }, "Push sent");
    };
    const exportLogs = () => {
      const repoName = repo?.name || "repo";
      const data = logs.map((l) => ({
        time: l.created_at,
        state: l.state,
        action: l.action,
        result: l.result,
        error: l.error,
        cost: l.cost_usd,
        duration: l.duration_sec
      }));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `swarm-logs-${repoName}-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
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
      if (!query || query.length < 2) {
        setGlobalResults(null);
        return;
      }
      try {
        const r = await f(`/api/search?q=${encodeURIComponent(query)}&scope=all&limit=30`);
        const d = await r.json();
        setGlobalResults(d);
      } catch {
        setGlobalResults(null);
      }
    };
    const reorderStep = async (stepId, direction) => {
      if (!sr) return;
      await apiAction("/api/plan/reorder", { method: "POST", body: JSON.stringify({ repo_id: sr, step_id: stepId, direction }) }, `Step moved ${direction}`);
    };
    const resetStep = (stepId) => {
      if (!sr) return;
      setConfirmDialog({ message: "Reset this step to pending? It will be re-executed next cycle.", onConfirm: () => {
        apiAction("/api/plan/reset-step", { method: "POST", body: JSON.stringify({ repo_id: sr, step_id: stepId }) }, "Step reset to pending");
      } });
    };
    const importItems = async (jsonText) => {
      if (!sr) return;
      try {
        const items2 = JSON.parse(jsonText);
        await apiAction("/api/items/import", { method: "POST", body: JSON.stringify({ repo_id: sr, items: Array.isArray(items2) ? items2 : [items2] }) }, "Items imported");
      } catch {
        showToast("Invalid JSON", "error");
      }
    };
    const exportComparison = () => {
      if (!comparison?.repos?.length) return;
      const header = "Name,State,Cost,Cost/Item,Items Done,Items Total,Error Rate,Cycles,Actions\n";
      const rows = comparison.repos.map((r) => `"${r.name}",${r.state},${r.cost},${r.cost_per_item},${r.items_done},${r.items_total},${r.error_rate}%,${r.cycles},${r.total_actions}`).join("\n");
      const blob = new Blob([header + rows], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `swarm-comparison-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${comparison.repos.length} repos to CSV`, "success");
    };
    const scanAll = async () => {
      setScanning(true);
      try {
        const r = await f("/api/health-scan");
        if (r.ok) {
          setHealthData(await r.json());
          showToast("Health scan complete", "success");
        } else showToast("Health scan failed", "error");
      } catch (e) {
        showToast(`Scan error: ${e.message}`, "error");
      }
      setScanning(false);
    };
    const fixAll = async () => {
      setFixing(true);
      try {
        await f("/api/fix-all", { method: "POST", body: JSON.stringify({}) });
        await scanAll();
        showToast("Auto-fix applied", "success");
      } catch (e) {
        showToast(`Fix error: ${e.message}`, "error");
      }
      setFixing(false);
    };
    const sendChat = async () => {
      if (!chatMsg.trim()) return;
      const msg = chatMsg.trim();
      setChatHistory((h) => [...h, { role: "user", content: msg, time: (/* @__PURE__ */ new Date()).toLocaleTimeString() }]);
      setChatMsg("");
      setChatLoading(true);
      try {
        const r = await f("/api/chat", { method: "POST", body: JSON.stringify({ message: msg }) });
        if (r.ok) {
          const d = await r.json();
          setChatHistory((h) => [...h, { role: "assistant", content: d.message, time: (/* @__PURE__ */ new Date()).toLocaleTimeString() }]);
        } else {
          showToast("Chat request failed", "error");
        }
      } catch (e) {
        showToast(`Chat error: ${e.message}`, "error");
      }
      setChatLoading(false);
    };
    const startRecording = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        const m = new MediaRecorder(s, { mimeType: "audio/webm" });
        chnk.current = [];
        m.ondataavailable = (e) => {
          if (e.data.size) chnk.current.push(e.data);
        };
        m.onstop = async () => {
          s.getTracks().forEach((t) => t.stop());
          const b = new Blob(chnk.current, { type: "audio/webm" });
          const rd = new FileReader();
          rd.onload = async () => {
            await f("/api/audio", { method: "POST", body: JSON.stringify({ repo_id: sr, filename: `rec_${sr}_${Date.now()}.webm`, audio_data: rd.result.split(",")[1] }) });
            load();
          };
          rd.readAsDataURL(b);
        };
        m.start();
        mRec.current = m;
        setRec(true);
        setRecTime(0);
        tmr.current = setInterval(() => setRecTime((t) => t + 1), 1e3);
      } catch (e) {
        console.error(e);
      }
    };
    const stopRecording = () => {
      if (mRec.current?.state !== "inactive") mRec.current?.stop();
      setRec(false);
      clearInterval(tmr.current);
    };
    const uploadAudio = async (e) => {
      const file = e.target.files[0];
      if (!file || !sr) return;
      const rd = new FileReader();
      rd.onload = async () => {
        await f("/api/audio", { method: "POST", body: JSON.stringify({ repo_id: sr, filename: file.name, audio_data: rd.result.split(",")[1] }) });
        load();
      };
      rd.readAsDataURL(file);
    };
    const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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
    const C = useMemo(() => darkMode ? {
      orange: "#E8850F",
      teal: "#0097B8",
      cream: "#1E1E2E",
      yellow: "#D4A830",
      sky: "#0D1117",
      sand: "#2D2D3D",
      red: "#E74C3C",
      green: "#2ECC71",
      darkBrown: "#C0C0C0",
      brown: "#999999",
      white: "#1A1A2E",
      lightOrange: "#3D2B1F",
      lightTeal: "#1A3040"
    } : {
      orange: "#F7941D",
      teal: "#00B4D8",
      cream: "#FFF8E7",
      yellow: "#FFE066",
      sky: "#87CEEB",
      sand: "#F4D35E",
      red: "#E74C3C",
      green: "#2ECC71",
      darkBrown: "#3D2B1F",
      brown: "#5D4037",
      white: "#FFFFFF",
      lightOrange: "#FFD699",
      lightTeal: "#B2EBF2"
    }, [darkMode]);
    const Card = ({ children, bg = C.white, style, className, ...p }) => /* @__PURE__ */ React.createElement("div", { className: `hover-card ${className || ""}`, style: { background: bg, border: `3px solid ${C.darkBrown}`, borderRadius: 12, padding: 16, boxShadow: `0 2px 4px rgba(0,0,0,.1), 0 4px 12px rgba(0,0,0,.08), 3px 3px 0 ${darkMode ? "#000" : "#3D2B1F"}`, transition: "transform .2s ease, box-shadow .2s ease", ...style }, ...p }, children);
    const Inp = ({ style, ...p }) => /* @__PURE__ */ React.createElement("input", { style: { width: "100%", padding: "10px 14px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, color: C.darkBrown, fontSize: 14, fontFamily: "'Fredoka', sans-serif", boxSizing: "border-box", outline: "none", transition: "border-color .2s, box-shadow .2s", ...style }, ...p });
    const Btn = ({ children, bg = C.orange, color = C.white, style, ...p }) => /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "hover-pop",
        style: { padding: "12px 24px", background: bg, border: `3px solid ${C.darkBrown}`, borderRadius: 12, color, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: 1.5, boxShadow: `0 2px 4px rgba(0,0,0,.12), 3px 3px 0 ${darkMode ? "#000" : "#3D2B1F"}`, transition: "transform .15s, filter .15s, box-shadow .15s", ...style },
        onMouseDown: (e) => e.target.style.transform = "translate(2px,2px) scale(0.97)",
        onMouseUp: (e) => e.target.style.transform = "",
        onMouseOut: (e) => e.target.style.transform = "",
        ...p
      },
      children
    );
    const SectionBg = ({ children, bg, style }) => /* @__PURE__ */ React.createElement("div", { style: { background: bg, padding: "28px 24px", ...style } }, children);
    const Sparkline = ({ data = [], width = 60, height = 16, color = C.teal }) => {
      if (!data.length) return null;
      const max = Math.max(...data, 1);
      const min = Math.min(...data, 0);
      const range = max - min || 1;
      const pts = data.map((v, i) => `${i / Math.max(data.length - 1, 1) * width},${height - (v - min) / range * (height - 2) - 1}`).join(" ");
      return /* @__PURE__ */ React.createElement("svg", { width, height, style: { display: "block" } }, /* @__PURE__ */ React.createElement("polyline", { points: pts, fill: "none", stroke: color, strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }));
    };
    const ProgressRing = ({ done = 0, total = 1, size = 32, strokeWidth = 3, color = C.teal }) => {
      const pct = total > 0 ? Math.min(done / total, 1) : 0;
      const r = (size - strokeWidth) / 2;
      const circ = 2 * Math.PI * r;
      const offset = circ * (1 - pct);
      return /* @__PURE__ */ React.createElement("svg", { width: size, height: size, style: { display: "block", transform: "rotate(-90deg)" } }, /* @__PURE__ */ React.createElement("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: `${C.darkBrown}15`, strokeWidth }), /* @__PURE__ */ React.createElement("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: color, strokeWidth, strokeDasharray: circ, strokeDashoffset: offset, strokeLinecap: "round", style: { transition: "stroke-dashoffset 0.5s" } }));
    };
    const HealthBadge = ({ score, size = 44 }) => {
      const sc = score >= 80 ? C.green : score >= 50 ? C.orange : C.red;
      const circ = Math.PI * 2 * 16;
      const pct = circ - circ * score / 100;
      return /* @__PURE__ */ React.createElement("div", { style: { position: "relative", width: size, height: size, flexShrink: 0 } }, /* @__PURE__ */ React.createElement("svg", { width: size, height: size, viewBox: "0 0 40 40" }, /* @__PURE__ */ React.createElement("circle", { cx: "20", cy: "20", r: "16", fill: "none", stroke: C.cream, strokeWidth: "4" }), /* @__PURE__ */ React.createElement(
        "circle",
        {
          cx: "20",
          cy: "20",
          r: "16",
          fill: "none",
          stroke: sc,
          strokeWidth: "4",
          strokeDasharray: circ,
          strokeDashoffset: pct,
          strokeLinecap: "round",
          transform: "rotate(-90 20 20)",
          style: { transition: "stroke-dashoffset .6s ease" }
        }
      ), /* @__PURE__ */ React.createElement("text", { x: "20", y: "22", fill: C.darkBrown, fontSize: "9", fontWeight: "700", textAnchor: "middle", fontFamily: "Bangers" }, score, "%")));
    };
    const ActionIcon = ({ action }) => {
      const icons = {
        git_commit: { icon: "\u{1F4DD}", bg: C.teal },
        rollback: { icon: "\u23EA", bg: C.red },
        execute_step: { icon: "\u26A1", bg: C.orange },
        test_step: { icon: "\u{1F9EA}", bg: "#9B59B6" },
        update_plan: { icon: "\u{1F5FA}\uFE0F", bg: C.teal },
        do_refactor: { icon: "\u{1F527}", bg: "#FF6B6B" },
        scan_repo: { icon: "\u{1F50D}", bg: C.green },
        final_optimize: { icon: "\u2728", bg: "#4ECDC4" }
      };
      const info = icons[action] || { icon: "\u{1F504}", bg: C.brown };
      return /* @__PURE__ */ React.createElement("div", { style: { width: 36, height: 36, borderRadius: "50%", background: info.bg, border: `2px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, boxShadow: "0 2px 4px rgba(0,0,0,.15)" } }, info.icon);
    };
    const TABS = [
      { id: "home", label: "\u{1F3E0} Town Square" },
      { id: "master", label: "\u{1F310} View All" },
      { id: "flow", label: "\u{1F5FA}\uFE0F Road Map" },
      { id: "items", label: "\u{1F4CB} Bounty Board" },
      { id: "plan", label: "\u26A1 Build Plan" },
      { id: "audio", label: "\u{1F399}\uFE0F Voice Review" },
      { id: "agents", label: "\u{1F920} The Crew" },
      { id: "memory", label: "\u{1F9E0} Memory" },
      { id: "mistakes", label: "\u{1F480} Mistakes" },
      { id: "logs", label: "\u{1F4DC} Logs" },
      { id: "history", label: "\u23EA History" },
      { id: "health", label: "\u{1F50D} Health Check" },
      { id: "metrics", label: "\u{1F4CA} Metrics" },
      { id: "trends", label: "\u{1F4C8} Trends" },
      { id: "compare", label: "\u2696\uFE0F Compare" },
      { id: "settings", label: "\u2699\uFE0F Settings" }
    ];
    return /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Fredoka', 'Comic Sans MS', cursive, sans-serif", background: C.sky, color: C.darkBrown, minHeight: "100vh" } }, /* @__PURE__ */ React.createElement("style", null, `
        @import url('https://fonts.googleapis.com/css2?family=Bangers&family=Fredoka:wght@400;500;600;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:8px} ::-webkit-scrollbar-thumb{background:${C.orange};border-radius:4px;border:2px solid ${C.darkBrown}}
        ::-webkit-scrollbar-track{background:rgba(0,0,0,.05);border-radius:4px}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
        @keyframes wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}
        @keyframes pulse-error{0%,100%{box-shadow:0 0 0 0 rgba(231,76,60,0.7)}50%{box-shadow:0 0 0 8px rgba(231,76,60,0)}}
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
        @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
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
        ${darkMode ? `
          body{background:#0D1117;color:#C0C0C0}
          ::selection{background:#E8850F44;color:#fff}
          ::-webkit-scrollbar{width:8px;height:8px}
          ::-webkit-scrollbar-track{background:#1A1A2E}
          ::-webkit-scrollbar-thumb{background:#3D3D5C;border-radius:4px}
          ::-webkit-scrollbar-thumb:hover{background:#555}
          select{background:#1E1E2E!important;color:#C0C0C0!important}
          option{background:#1E1E2E;color:#C0C0C0}
          table tr:hover{background:#1E1E2E44!important}
        ` : ""}
      `), /* @__PURE__ */ React.createElement("div", { style: { background: `linear-gradient(180deg, ${C.orange} 0%, #F4D35E 70%, ${C.sand} 100%)`, padding: "18px 20px 14px", textAlign: "center", borderBottom: `4px solid ${C.darkBrown}`, position: "relative", overflow: "hidden", minHeight: 110 } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", bottom: 0, left: 0, right: 0, height: 30, zIndex: 0 } }, /* @__PURE__ */ React.createElement("svg", { width: "100%", height: "30", viewBox: "0 0 800 30", preserveAspectRatio: "none", style: { position: "absolute", bottom: 0 } }, /* @__PURE__ */ React.createElement("path", { d: "M0,25 Q200,5 400,20 Q600,5 800,22 L800,30 L0,30Z", fill: "#F4D35E", opacity: "0.6" }))), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", bottom: 0, left: "8%", zIndex: 1, animation: "sway 5s ease-in-out infinite", transformOrigin: "bottom center" } }, /* @__PURE__ */ React.createElement("svg", { width: "40", height: "70", viewBox: "0 0 40 70" }, /* @__PURE__ */ React.createElement("rect", { x: "15", y: "8", width: "10", height: "62", rx: "5", fill: "#2D8B46", stroke: "#1a5c2e", strokeWidth: "1.5" }), /* @__PURE__ */ React.createElement("path", { d: "M15,30 Q4,30 4,18", fill: "none", stroke: "#2D8B46", strokeWidth: "8", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M25,22 Q36,22 36,12", fill: "none", stroke: "#2D8B46", strokeWidth: "7", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "20", cy: "10", r: "5", fill: "#2D8B46", stroke: "#1a5c2e", strokeWidth: "1" }))), /* @__PURE__ */ React.createElement("div", { className: "cactus-right", style: { position: "absolute", bottom: 0, right: "8%", zIndex: 1, animation: "sway 6s ease-in-out infinite", animationDelay: "1s", transformOrigin: "bottom center" } }, /* @__PURE__ */ React.createElement("svg", { width: "35", height: "60", viewBox: "0 0 35 60" }, /* @__PURE__ */ React.createElement("rect", { x: "12", y: "5", width: "10", height: "55", rx: "5", fill: "#228B3E", stroke: "#145c27", strokeWidth: "1.5" }), /* @__PURE__ */ React.createElement("path", { d: "M12,25 Q2,25 2,15", fill: "none", stroke: "#228B3E", strokeWidth: "7", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("path", { d: "M22,18 Q32,18 32,10", fill: "none", stroke: "#228B3E", strokeWidth: "6", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "17", cy: "7", r: "5", fill: "#228B3E", stroke: "#145c27", strokeWidth: "1" }))), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", bottom: 2, right: "25%", zIndex: 1, animation: "float 4s ease-in-out infinite" } }, /* @__PURE__ */ React.createElement("svg", { width: "18", height: "22", viewBox: "0 0 18 22" }, /* @__PURE__ */ React.createElement("ellipse", { cx: "9", cy: "13", rx: "8", ry: "9", fill: "#3BA55C", stroke: "#1a5c2e", strokeWidth: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "5", r: "2.5", fill: "#FF6B9D", stroke: "#c94070", strokeWidth: "0.6" }))), /* @__PURE__ */ React.createElement("div", { style: { position: "relative", zIndex: 2 } }, /* @__PURE__ */ React.createElement("h1", { style: { fontFamily: "'Bangers', cursive", fontSize: 48, letterSpacing: 5, color: C.white, textShadow: `3px 3px 0 ${C.darkBrown}, -1px -1px 0 ${C.darkBrown}, 1px -1px 0 ${C.darkBrown}, -1px 1px 0 ${C.darkBrown}`, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 } }, "SWARM TOWN", claudeSessions.length > 0 && /* @__PURE__ */ React.createElement("span", { title: `${claudeSessions.length} active Claude session${claudeSessions.length > 1 ? "s" : ""}`, style: { display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(46,204,113,0.2)", border: "2px solid #2ECC71", borderRadius: 20, padding: "2px 10px", fontSize: 14, fontFamily: "'Fredoka', sans-serif", letterSpacing: 0, color: "#2ECC71", verticalAlign: "middle" } }, /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", background: "#2ECC71", display: "inline-block", animation: "pulse 1.5s infinite" } }), claudeSessions.length)), /* @__PURE__ */ React.createElement("p", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, color: C.cream, letterSpacing: 3, textShadow: `1px 1px 0 ${C.darkBrown}`, marginTop: 2 } }, "AUTONOMOUS MULTI-AGENT ORCHESTRATOR")), /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: 12, right: 16, display: "flex", alignItems: "center", gap: 8, zIndex: 3 } }, repos.length > 0 && /* @__PURE__ */ React.createElement(
      "select",
      {
        value: sr || "",
        onChange: (e) => setSR(Number(e.target.value)),
        style: { padding: "5px 10px", background: C.yellow, border: `3px solid ${C.darkBrown}`, borderRadius: 12, fontSize: 13, fontFamily: "'Bangers', cursive", fontWeight: 700, letterSpacing: 1, color: C.darkBrown, outline: "none", cursor: "pointer", maxWidth: 180 }
      },
      sortedRepos.map((r) => /* @__PURE__ */ React.createElement("option", { key: r.id, value: r.id }, pinnedRepos.includes(r.id) ? "\u{1F4CC} " : "", r.name, " [", r.state || "idle", "]"))
    ), uptime && /* @__PURE__ */ React.createElement("div", { title: `PID: ${sysInfo.pid || "?"} | Threads: ${sysInfo.threads || "?"} | RAM: ${sysInfo.mem || "?"}MB`, style: { background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: C.darkBrown, cursor: "help" } }, "\u23F1\uFE0F", " ", uptime, sysInfo.mem ? ` | ${sysInfo.mem}MB` : ""), repoStats.totalItems > 0 && /* @__PURE__ */ React.createElement("div", { style: { background: "#E3F2FD", border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#1565C0" } }, repoStats.totalDone, "/", repoStats.totalItems, " items"), totalCost > 0 && /* @__PURE__ */ React.createElement("div", { style: { background: "#E8F5E9", border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: "#2E7D32" } }, "$", totalCost.toFixed(2)), logs.length > 0 && tabBadges.logs > 0 && (() => {
      const errRate = Math.round(tabBadges.logs / logs.length * 100);
      return /* @__PURE__ */ React.createElement("div", { title: `${tabBadges.logs} errors in ${logs.length} logs`, style: { background: errRate > 10 ? "#FFEBEE" : "#FFF3E0", border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: errRate > 10 ? C.red : C.orange } }, errRate, "% err");
    })(), /* @__PURE__ */ React.createElement("div", { title: sseConnected ? "Live updates connected" : "Live updates disconnected \u2014 reconnecting...", style: { width: 10, height: 10, borderRadius: "50%", background: sseConnected ? "#4CAF50" : "#F44336", border: `2px solid ${C.darkBrown}`, animation: sseConnected ? "none" : "pulse 1.5s infinite" } }), /* @__PURE__ */ React.createElement("button", { onClick: () => setShowToastHistory((prev) => !prev), "aria-label": "Toggle notification history", style: { background: darkMode ? "#2D2D3D" : C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 10px", fontSize: 14, cursor: "pointer", lineHeight: 1, position: "relative" }, title: "Notification history" }, "\u{1F514}", toastHistory.length > 0 && /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", top: -4, right: -4, background: C.red, color: C.white, borderRadius: "50%", width: 16, height: 16, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 } }, Math.min(toastHistory.length, 99))), /* @__PURE__ */ React.createElement("button", { onClick: toggleDark, "aria-label": darkMode ? "Switch to light mode" : "Switch to dark mode", "aria-pressed": darkMode, style: { background: darkMode ? "#2D2D3D" : C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 10px", fontSize: 14, cursor: "pointer", lineHeight: 1 }, title: "Toggle dark mode" }, darkMode ? "\u{1F319}" : "\u2600\uFE0F"), /* @__PURE__ */ React.createElement("div", { role: "status", "aria-live": "polite", "aria-label": connected ? "Server connected" : "Server disconnected", style: { background: connected ? C.green : C.red, border: `2px solid ${C.darkBrown}`, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700, color: "#FFFFFF", animation: connected ? "none" : "pulse 1s infinite" } }, connected ? "\u25CF LIVE" : "\u25CF OFFLINE"))), showToastHistory && /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", top: 60, right: 16, width: 340, maxHeight: 400, overflowY: "auto", zIndex: 200, background: darkMode ? "#2D2D2D" : C.white, border: `3px solid ${C.darkBrown}`, borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.2)", padding: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1 } }, "Notifications"), /* @__PURE__ */ React.createElement("button", { onClick: () => {
      setToastHistory([]);
      setShowToastHistory(false);
    }, style: { background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.brown, textDecoration: "underline" } }, "Clear All")), toastHistory.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", fontSize: 12, color: C.brown, padding: 20 } }, "No notifications yet.") : [...toastHistory].reverse().map((t, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 8, alignItems: "center", padding: "5px 8px", borderBottom: `1px solid ${C.darkBrown}11`, fontSize: 11 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: t.type === "error" ? C.red : t.type === "warning" ? C.orange : t.type === "success" ? C.green : C.teal } }), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, color: darkMode ? "#E0E0E0" : C.darkBrown } }, t.message), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown, minWidth: 55 } }, t.time)))), /* @__PURE__ */ React.createElement("div", { style: { position: "sticky", top: 0, zIndex: 100 } }, /* @__PURE__ */ React.createElement("div", { role: "tablist", "aria-label": "Dashboard sections", style: { background: C.orange, display: "flex", overflow: "auto", borderBottom: scrolledPast ? "none" : `3px solid ${C.darkBrown}`, gap: 0 } }, TABS.map((t) => {
      const badge = tabBadges[t.id] || 0;
      const badgeBg = t.id === "mistakes" || t.id === "logs" ? C.red : t.id === "plan" ? C.orange : C.teal;
      const prev = prevBadges.current[t.id] || 0;
      const pulse = badge > prev && tab !== t.id;
      if (badge !== prev) {
        prevBadges.current[t.id] = badge;
        if (pulse) {
          setTabPulse((p) => ({ ...p, [t.id]: Date.now() }));
        }
      }
      const showPulse = tabPulse[t.id] && Date.now() - tabPulse[t.id] < 8e3 && tab !== t.id;
      return /* @__PURE__ */ React.createElement("button", { key: t.id, role: "tab", "aria-selected": tab === t.id, "aria-label": `${t.label} tab${badge > 0 ? ` (${badge})` : ""}`, className: tab !== t.id ? "nav-tab" : "", onClick: () => {
        setTab(t.id);
        setBatchSelected(/* @__PURE__ */ new Set());
        setTabPulse((p) => {
          const n = { ...p };
          delete n[t.id];
          return n;
        });
      }, style: {
        padding: "10px 16px",
        background: tab === t.id ? C.cream : "transparent",
        border: "none",
        borderRight: `2px solid ${C.darkBrown}`,
        borderBottom: tab === t.id ? `3px solid ${C.cream}` : "none",
        color: tab === t.id ? C.darkBrown : C.white,
        cursor: "pointer",
        fontSize: 13,
        fontFamily: "'Bangers', cursive",
        letterSpacing: 1.5,
        whiteSpace: "nowrap",
        fontWeight: 700,
        transition: "background 0.2s, transform 0.15s",
        position: "relative"
      } }, t.label, badge > 0 && /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", top: 2, right: 4, background: badgeBg, color: "#fff", borderRadius: "50%", width: 16, height: 16, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontFamily: "'Fredoka', sans-serif", border: `1px solid ${C.darkBrown}` } }, badge > 99 ? "99" : badge), showPulse && /* @__PURE__ */ React.createElement("span", { style: { position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", width: 6, height: 6, borderRadius: "50%", background: C.green, animation: "pulse 1s infinite" } }));
    })), scrolledPast && repos.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { background: darkMode ? "#1E1E2E" : C.cream, borderBottom: `3px solid ${C.darkBrown}`, padding: "4px 16px", display: "flex", alignItems: "center", gap: 10, fontSize: 11, fontFamily: "'Fredoka', sans-serif" } }, /* @__PURE__ */ React.createElement(
      "select",
      {
        value: sr || "",
        onChange: (e) => setSR(Number(e.target.value)),
        style: { padding: "3px 8px", background: C.yellow, border: `2px solid ${C.darkBrown}`, borderRadius: 8, fontSize: 11, fontFamily: "'Bangers', cursive", fontWeight: 700, letterSpacing: 1, color: C.darkBrown, outline: "none", cursor: "pointer", maxWidth: 160 }
      },
      sortedRepos.map((r) => /* @__PURE__ */ React.createElement("option", { key: r.id, value: r.id }, pinnedRepos.includes(r.id) ? "\u{1F4CC} " : "", r.name))
    ), (() => {
      const cr = repos.find((r) => r.id === sr);
      if (!cr) return null;
      const s = cr.stats || {};
      return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: STATES[cr.state]?.color || C.brown } }, cr.state || "idle"), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown } }, "Items: ", s.items_done || 0, "/", s.items_total || 0), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown } }, "Steps: ", s.steps_done || 0, "/", s.steps_total || 0), costs[sr] > 0 && /* @__PURE__ */ React.createElement("span", { style: { color: C.brown } }, "$", costs[sr]?.toFixed(2)), isRepoManaged(cr) ? /* @__PURE__ */ React.createElement("button", { onClick: () => stopRepo(cr.id), "aria-label": `Stop ${cr.name}`, style: { background: C.red, color: C.white, border: `1px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 8px", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers', cursive" } }, "\u23F9") : /* @__PURE__ */ React.createElement("button", { onClick: () => startRepo(cr.id), "aria-label": `Start ${cr.name}`, style: { background: C.green, color: C.white, border: `1px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 8px", fontSize: 9, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers', cursive" } }, "\u25B6"), connected && /* @__PURE__ */ React.createElement("span", { style: { color: C.green, fontWeight: 700 } }, "\u25CF", " LIVE"), sseConnected && /* @__PURE__ */ React.createElement("span", { style: { color: C.teal, fontSize: 9, fontWeight: 600 } }, "SSE"), lastRefresh && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 8, color: C.brown, opacity: 0.7 } }, Math.floor((Date.now() - lastRefresh) / 1e3) < 10 ? "just now" : Math.floor((Date.now() - lastRefresh) / 1e3) + "s ago"), repos.length > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 8, padding: "1px 5px", borderRadius: 6, background: repoStats.running > 0 ? `${C.green}22` : `${C.brown}11`, color: repoStats.running > 0 ? C.green : C.brown, fontWeight: 700 } }, repoStats.running, "/", repos.length, " running"), totalCost > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 8, padding: "1px 5px", borderRadius: 6, background: totalCost > 5 ? "#FFEBEE" : totalCost > 1 ? `${C.orange}22` : `${C.green}22`, color: totalCost > 5 ? C.red : totalCost > 1 ? C.orange : C.green, fontWeight: 700 } }, "\u{1F4B0}", " $", totalCost.toFixed(2)), healthScores?.average_score != null && (() => {
        const s2 = healthScores.average_score;
        const hc = s2 >= 80 ? C.green : s2 >= 60 ? C.orange : C.red;
        return /* @__PURE__ */ React.createElement("span", { title: `System health: ${s2}%`, style: { width: 8, height: 8, borderRadius: "50%", background: hc, display: "inline-block", animation: s2 < 60 ? "pulse 1.5s infinite" : "none", boxShadow: `0 0 4px ${hc}` } });
      })(), repoStats.totalItems > 0 && /* @__PURE__ */ React.createElement("div", { style: { flex: 1, maxWidth: 80, height: 5, background: `${C.darkBrown}22`, borderRadius: 3, overflow: "hidden" }, title: `${repoStats.totalDone}/${repoStats.totalItems} items (${repoStats.overallPct}%)` }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", background: `linear-gradient(90deg, ${C.green}, ${C.teal})`, width: `${repoStats.overallPct}%`, borderRadius: 3, transition: "width .5s" } })));
    })())), !connected && /* @__PURE__ */ React.createElement("div", { style: { background: "linear-gradient(90deg, #E74C3C 0%, #C0392B 100%)", padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, borderBottom: `3px solid ${C.darkBrown}` } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18, animation: "pulse 1.5s infinite" } }, "\u26A0\uFE0F"), /* @__PURE__ */ React.createElement("span", { style: { color: C.white, fontWeight: 700, fontSize: 14, fontFamily: "'Bangers', cursive", letterSpacing: 1 } }, "Connection lost \u2014 retrying every 3 seconds..."), /* @__PURE__ */ React.createElement("button", { onClick: load, style: { background: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers', cursive" } }, "Retry Now")), /* @__PURE__ */ React.createElement("div", { style: { maxHeight: `calc(100vh - ${connected ? 150 : 192}px)`, overflow: "auto" } }, loading && repos.length === 0 && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.cream} 0%, #F5E6C8 100%)` }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: 60 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 48, marginBottom: 12, animation: "wiggle 2s infinite" } }, "\u{1F3DC}\uFE0F"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, letterSpacing: 2, marginBottom: 8 } }, "Loading Swarm Town..."), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: C.brown } }, "Connecting to the orchestrator on port 6969"))), tab === "home" && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.cream} 0%, #F5E6C8 100%)` }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 20, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(Btn, { onClick: startAll, bg: C.green, "aria-label": "Start all repo orchestrators", style: { fontSize: 24, padding: "16px 48px", animation: repoStats.running > 0 ? "none" : "wiggle 2s infinite" } }, "\u{1F680}", " START ALL"), repoStats.running > 0 && /* @__PURE__ */ React.createElement(Btn, { onClick: stopAll, bg: C.red, "aria-label": "Stop all repo orchestrators", style: { fontSize: 24, padding: "16px 48px" } }, "\u23F9\uFE0F", " STOP ALL")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", marginBottom: 24 } }, [
      { emoji: "\u{1F4E6}", label: "Repos", val: repoStats.total, bg: C.lightOrange },
      { emoji: "\u26A1", label: "Running", val: repoStats.running, bg: C.lightTeal },
      { emoji: "\u{1F4CB}", label: "Items", val: repoStats.totalItems, bg: C.yellow },
      { emoji: "\u2705", label: "Done", val: repoStats.totalDone, bg: C.lightTeal },
      { emoji: "\u{1F920}", label: "Agents", val: repoStats.totalAgents, bg: C.lightOrange },
      { emoji: "\u{1F4CA}", label: "Complete", val: repoStats.overallPct + "%", bg: C.lightTeal },
      { emoji: "\u{1F4B0}", label: "Total Cost", val: "$" + repoStats.totalCost.toFixed(2), bg: C.yellow }
    ].map((s, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "stat-card", style: { background: `linear-gradient(135deg, ${s.bg} 0%, ${s.bg}ee 100%)`, border: `3px solid ${C.darkBrown}`, borderRadius: 14, padding: "12px 20px", textAlign: "center", boxShadow: "0 2px 4px rgba(0,0,0,.1), 3px 3px 0 #3D2B1F", minWidth: 95, transition: "transform 0.2s, box-shadow 0.2s", cursor: "default" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 26 } }, s.emoji), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 32, letterSpacing: 1, lineHeight: 1 } }, s.val), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: C.brown, marginTop: 2 } }, s.label), typeof s.val === "number" && (() => {
      try {
        const k = `stat_prev_${s.label}`;
        const prev = parseInt(localStorage.getItem(k) || "0");
        localStorage.setItem(k, String(s.val));
        const diff = s.val - prev;
        if (prev > 0 && diff !== 0) return /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: diff > 0 ? C.green : C.red, marginTop: 1 } }, diff > 0 ? "+" : "", diff);
      } catch (e) {
      }
      return null;
    })()))), costHistory.length > 1 && /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 500, margin: "0 auto 12px", display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown, fontWeight: 600, minWidth: 55 } }, "30d Costs"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, display: "flex", alignItems: "flex-end", gap: 1, height: 24 } }, (() => {
      const last30 = costHistory.slice(-30);
      const cmax = Math.max(...last30.map((x) => x.cost || 0), 0.01);
      return last30.map((d, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { flex: 1, height: `${(d.cost || 0) / cmax * 22}px`, minHeight: d.cost > 0 ? 2 : 0, background: `linear-gradient(180deg, ${C.teal}, ${C.green})`, borderRadius: "2px 2px 0 0", transition: "height 0.3s" }, title: `${d.date}: $${d.cost}` }));
    })()), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown, fontWeight: 700 } }, "$", repoStats.totalCost.toFixed(2))), repoStats.totalItems > 0 && /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 500, margin: "0 auto 16px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 700, marginBottom: 4 } }, /* @__PURE__ */ React.createElement("span", null, "Overall Swarm Progress"), /* @__PURE__ */ React.createElement("span", null, repoStats.totalDone, "/", repoStats.totalItems, " items (", repoStats.overallPct, "%)")), /* @__PURE__ */ React.createElement("div", { style: { background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 10, height: 18, overflow: "hidden", position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", borderRadius: 8, background: `linear-gradient(90deg, ${C.green}, ${C.teal})`, width: `${repoStats.overallPct}%`, transition: "width .5s" } }))), runningRepos.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 } }, runningRepos.map((r) => {
      const rst = STATES[r.state] || STATES.idle;
      const done = r.stats?.items_done || 0;
      const total = r.stats?.items_total || 0;
      const pct = total > 0 ? Math.round(done / total * 100) : 0;
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: r.id,
          onClick: () => {
            setSR(r.id);
            setTab("flow");
          },
          style: { display: "flex", alignItems: "center", gap: 6, background: C.white, border: `2px solid ${C.darkBrown}33`, borderRadius: 20, padding: "4px 12px 4px 6px", cursor: "pointer", transition: "transform .15s", fontSize: 12 },
          onMouseOver: (e) => e.currentTarget.style.transform = "scale(1.05)",
          onMouseOut: (e) => e.currentTarget.style.transform = "scale(1)"
        },
        /* @__PURE__ */ React.createElement("div", { style: { width: 20, height: 20, borderRadius: "50%", background: rst.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, animation: "bounce 2s infinite" } }, rst.emoji),
        /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600 } }, r.name),
        /* @__PURE__ */ React.createElement("div", { style: { width: 32, height: 6, borderRadius: 3, background: `${C.darkBrown}22`, overflow: "hidden" }, title: `${done}/${total} (${pct}%)` }, /* @__PURE__ */ React.createElement("div", { style: { width: `${pct}%`, height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${C.green}, ${C.teal})`, transition: "width .5s" } })),
        /* @__PURE__ */ React.createElement("span", { style: { color: C.brown, fontSize: 10 } }, rst.label)
      );
    })), (() => {
      const cycleRepos = repos.filter((r) => (r.cycle_count || 0) > 0);
      if (cycleRepos.length === 0) return null;
      const totalCycles = cycleRepos.reduce((s, r) => s + (r.cycle_count || 0), 0);
      const totalDone = cycleRepos.reduce((s, r) => s + (r.stats?.items_done || 0), 0);
      const avgItemsPerCycle = totalCycles > 0 ? (totalDone / totalCycles).toFixed(1) : 0;
      const avgCostPerCycle = totalCycles > 0 ? (repoStats.totalCost / totalCycles).toFixed(3) : 0;
      return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginBottom: 12 } }, [
        { label: "Total Cycles", val: totalCycles, icon: "\u{1F504}" },
        { label: "Avg Items/Cycle", val: avgItemsPerCycle, icon: "\u{1F4E6}" },
        { label: "Avg $/Cycle", val: "$" + avgCostPerCycle, icon: "\u{1F4B0}" }
      ].map((m, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { background: C.white, border: `2px solid ${C.darkBrown}22`, borderRadius: 10, padding: "6px 14px", textAlign: "center", fontSize: 11, minWidth: 90 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 16 } }, m.icon), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1 } }, m.val), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: C.brown, fontWeight: 600 } }, m.label))));
    })(), heatmap && Object.keys(heatmap.grid || {}).length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto 12px", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" } }, "7-Day Activity Heatmap"), (() => {
      const grid = heatmap.grid;
      const days = [...new Set(Object.keys(grid).map((k) => k.split("|")[0]))].sort();
      const maxVal = Math.max(...Object.values(grid), 1);
      const hours = Array.from({ length: 24 }, (_, i) => i);
      return /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: `60px repeat(24, 1fr)`, gap: 1, fontSize: 8 } }, /* @__PURE__ */ React.createElement("div", null), hours.map((h) => /* @__PURE__ */ React.createElement("div", { key: h, style: { textAlign: "center", color: C.brown, fontWeight: 600 } }, h)), days.slice(-7).map((day) => /* @__PURE__ */ React.createElement(React.Fragment, { key: day }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: C.brown, fontWeight: 600, display: "flex", alignItems: "center" } }, day.slice(5)), hours.map((h) => {
        const val = grid[`${day}|${h}`] || 0;
        const intensity = val / maxVal;
        return /* @__PURE__ */ React.createElement(
          "div",
          {
            key: h,
            title: `${day} ${h}:00 - ${val} actions`,
            style: { aspectRatio: "1", borderRadius: 2, background: val === 0 ? `${C.darkBrown}08` : `rgba(78, 205, 196, ${0.15 + intensity * 0.85})`, transition: "background 0.3s" }
          }
        );
      })))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 8, marginTop: 6, fontSize: 9, color: C.brown } }, /* @__PURE__ */ React.createElement("span", null, "Less"), [0.1, 0.3, 0.5, 0.7, 1].map((v, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { width: 10, height: 10, borderRadius: 2, background: `rgba(78, 205, 196, ${0.15 + v * 0.85})` } })), /* @__PURE__ */ React.createElement("span", null, "More")));
    })()), costForecast && costForecast.total_7d > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto 12px", padding: 14, background: `linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" } }, "Cost Forecast (Next 7 Days)"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 16, marginBottom: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 22, color: C.teal } }, "$", costForecast.total_7d), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown } }, "Last 7d")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 22, color: costForecast.trend === "rising" ? C.orange : costForecast.trend === "falling" ? C.green : C.teal } }, costForecast.trend === "rising" ? "\u2191" : costForecast.trend === "falling" ? "\u2193" : "\u2192", " $", costForecast.forecast_total), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown } }, "Forecast 7d")), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 22, color: C.brown } }, "$", costForecast.avg_daily, "/day"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown } }, "Avg Daily"))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-end", gap: 1, height: 40 } }, [...costForecast.daily_costs, ...costForecast.forecast_7d].map((v, i) => {
      const all = [...costForecast.daily_costs, ...costForecast.forecast_7d];
      const max = Math.max(...all, 1e-3);
      const isForecast = i >= costForecast.daily_costs.length;
      return /* @__PURE__ */ React.createElement("div", { key: i, style: { flex: 1, height: `${v / max * 36}px`, minHeight: v > 0 ? 3 : 0, background: isForecast ? `${C.orange}88` : C.teal, borderRadius: "2px 2px 0 0", transition: "height 0.3s", opacity: isForecast ? 0.6 : 1 }, title: `$${v}${isForecast ? " (forecast)" : ""}` });
    })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 9, color: C.brown, marginTop: 2 } }, /* @__PURE__ */ React.createElement("span", null, "Past"), /* @__PURE__ */ React.createElement("span", null, "|"), /* @__PURE__ */ React.createElement("span", null, "Forecast"))), healthHistory?.history?.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto 12px", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" } }, "Health Score Trends"), (() => {
      const byRepo = {};
      healthHistory.history.forEach((h) => {
        if (!byRepo[h.repo_id]) byRepo[h.repo_id] = [];
        byRepo[h.repo_id].push(h);
      });
      const repoIds = Object.keys(byRepo).slice(0, 6);
      const colors = [C.teal, C.orange, C.green, C.red, "#7E57C2", C.brown];
      return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { height: 60, position: "relative" } }, repoIds.map((rid, idx) => {
        const points = byRepo[rid];
        if (points.length < 2) return null;
        const pts = points.map((p, i) => `${i / Math.max(points.length - 1, 1) * 100}%,${60 - p.score / 100 * 56}`).join(" ");
        return /* @__PURE__ */ React.createElement("svg", { key: rid, style: { position: "absolute", inset: 0, width: "100%", height: "100%" } }, /* @__PURE__ */ React.createElement("polyline", { points: pts, fill: "none", stroke: colors[idx % colors.length], strokeWidth: "1.5", strokeLinecap: "round" }));
      })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap", marginTop: 4 } }, repoIds.map((rid, idx) => {
        const repo2 = repos.find((r) => r.id === parseInt(rid));
        return /* @__PURE__ */ React.createElement("span", { key: rid, style: { fontSize: 9, display: "flex", alignItems: "center", gap: 3 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", background: colors[idx % colors.length], display: "inline-block" } }), repo2?.name || `#${rid}`);
      })));
    })()), staleItems.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: "#FFF3E0", style: { maxWidth: 620, margin: "0 auto 12px", padding: 12, border: `2px solid ${C.orange}` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 15, letterSpacing: 1, marginBottom: 6, color: C.orange } }, "\u26A0\uFE0F", " ", staleItems.length, " Stale Item", staleItems.length > 1 ? "s" : "", " (2h+ in progress)"), staleItems.slice(0, 5).map((it, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { fontSize: 11, padding: "2px 0", display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600, color: C.teal, minWidth: 80 } }, it.repo_name), /* @__PURE__ */ React.createElement("span", null, it.title?.slice(0, 50)), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown, fontSize: 10 } }, "since ", it.started_at?.slice(11, 19))))), (() => {
      const tripped = circuitBreakers.filter((cb) => cb.state !== "closed");
      return tripped.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: "#FFEBEE", style: { maxWidth: 620, margin: "0 auto 12px", padding: 12, border: `2px solid ${C.red}` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 15, letterSpacing: 1, marginBottom: 6, color: C.red } }, "\u26A1", " ", tripped.length, " Circuit Breaker", tripped.length > 1 ? "s" : "", " Tripped"), tripped.map((cb, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { fontSize: 11, padding: "2px 0", display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600, color: cb.state === "open" ? C.red : C.orange, minWidth: 80 } }, cb.repo_name), /* @__PURE__ */ React.createElement("span", null, cb.state.toUpperCase(), " (", cb.failures, "/", cb.threshold, ")"), cb.last_failure_ago && /* @__PURE__ */ React.createElement("span", { style: { color: C.brown, fontSize: 10 } }, cb.last_failure_ago, "s ago"))));
    })(), recentErrors.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: "#FFF3E0", style: { maxWidth: 620, margin: "0 auto 12px", padding: 12, border: `2px solid ${C.orange}` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 15, letterSpacing: 1, marginBottom: 6, color: C.red } }, "\u{1F4A5}", " Recent Errors (", recentErrors.length, ")"), recentErrors.slice(0, 5).map((err, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { fontSize: 11, padding: "3px 0", display: "flex", gap: 8, borderBottom: i < 4 ? `1px solid ${C.darkBrown}11` : "none" } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600, color: C.teal, minWidth: 70 } }, err.repo_name), /* @__PURE__ */ React.createElement("span", { style: { color: C.red, fontWeight: 600, minWidth: 80 } }, err.error_type), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: C.brown } }, (err.description || "").slice(0, 80)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown, opacity: 0.6, flexShrink: 0 } }, err.created_at?.slice(11, 19) || "")))), logs.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto", padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, marginBottom: 8 } }, "Recent Activity"), logs.slice(0, 5).map((l, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 8, alignItems: "center", padding: "4px 0", borderBottom: i < 4 ? `1px solid ${C.darkBrown}11` : "none", fontSize: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 6, height: 6, borderRadius: "50%", background: l.error ? C.red : C.green, flexShrink: 0 } }), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600, minWidth: 70, color: C.brown } }, l.state || "\u2014"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, l.action || l.result || "\u2014"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown, opacity: 0.6, flexShrink: 0 } }, l.created_at?.slice(11, 19) || "")))), /* @__PURE__ */ React.createElement("details", { style: { maxWidth: 620, margin: "10px auto 0" } }, /* @__PURE__ */ React.createElement("summary", { style: { fontSize: 13, fontWeight: 700, color: C.brown, cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: 1 } }, "Notes (", repoNotes.length, ")"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 8 } }, /* @__PURE__ */ React.createElement(Inp, { placeholder: "Add a note...", value: newNote, onChange: (e) => setNewNote(e.target.value), style: { flex: 1, fontSize: 12 }, onKeyDown: (e) => e.key === "Enter" && addNote() }), /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, onClick: addNote, style: { fontSize: 12, padding: "6px 12px" } }, "Add")), repoNotes.map((n) => /* @__PURE__ */ React.createElement("div", { key: n.key, style: { display: "flex", gap: 6, alignItems: "flex-start", marginTop: 6, background: C.white, borderRadius: 8, padding: "8px 10px", border: `1px solid ${C.darkBrown}22` } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 12, lineHeight: 1.4 } }, n.value), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown, opacity: 0.6, flexShrink: 0 } }, n.updated_at?.slice(0, 10)), /* @__PURE__ */ React.createElement("button", { onClick: () => deleteNote(n.key), style: { background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.red, opacity: 0.5 } }, "\u2716"))))), /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.teal} 0%, #009BB8 100%)`, style: { borderTop: `3px solid ${C.darkBrown}` } }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", color: C.white, textShadow: `2px 2px 0 ${C.darkBrown}`, marginBottom: 12, letterSpacing: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 } }, "YOUR REPOS", repoStats.totalErrors > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, background: C.red, color: C.white, padding: "2px 10px", borderRadius: 12, border: `2px solid ${C.darkBrown}`, fontFamily: "'Fredoka', sans-serif", verticalAlign: "middle" } }, repoStats.totalErrors, " errors")), (() => {
      const errored = repos.filter((r) => r.state === "error" || r.state === "credits_exhausted").length;
      return /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 12, color: C.cream, marginBottom: 10, fontWeight: 600, letterSpacing: 1 } }, repos.length, " total", repoStats.running > 0 ? ` \xB7 ${repoStats.running} running` : "", repoStats.idle > 0 ? ` \xB7 ${repoStats.idle} idle` : "", repoStats.paused > 0 ? ` \xB7 ${repoStats.paused} paused` : "", errored > 0 ? ` \xB7 ${errored} error` : "", repoStats.totalErrors > 0 ? ` \xB7 ${repoStats.totalErrors} mistakes` : "", totalCost > 0 ? ` \xB7 $${totalCost.toFixed(2)}` : "");
    })(), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("select", { value: repoFilter, onChange: (e) => setRepoFilter(e.target.value), style: { padding: "6px 10px", borderRadius: 8, border: `2px solid ${C.darkBrown}`, background: C.cream, fontFamily: "'Fredoka', sans-serif", fontSize: 13, fontWeight: 600 } }, /* @__PURE__ */ React.createElement("option", { value: "all" }, "All (", repoStats.total, ")"), /* @__PURE__ */ React.createElement("option", { value: "running" }, "Running (", repoStats.running - repoStats.paused, ")"), /* @__PURE__ */ React.createElement("option", { value: "idle" }, "Idle (", repoStats.idle, ")"), /* @__PURE__ */ React.createElement("option", { value: "paused" }, "Paused (", repoStats.paused, ")"), /* @__PURE__ */ React.createElement("option", { value: "error" }, "Error (", repoStats.errorState, ")")), /* @__PURE__ */ React.createElement("select", { value: repoSort, onChange: (e) => setRepoSort(e.target.value), style: { padding: "6px 10px", borderRadius: 8, border: `2px solid ${C.darkBrown}`, background: C.cream, fontFamily: "'Fredoka', sans-serif", fontSize: 13, fontWeight: 600 } }, /* @__PURE__ */ React.createElement("option", { value: "name" }, "Sort: Name"), /* @__PURE__ */ React.createElement("option", { value: "state" }, "Sort: State"), /* @__PURE__ */ React.createElement("option", { value: "items" }, "Sort: Items"), /* @__PURE__ */ React.createElement("option", { value: "cycles" }, "Sort: Cycles"), /* @__PURE__ */ React.createElement("option", { value: "cost" }, "Sort: Cost"), /* @__PURE__ */ React.createElement("option", { value: "errors" }, "Sort: Errors"), /* @__PURE__ */ React.createElement("option", { value: "health" }, "Sort: Health"), /* @__PURE__ */ React.createElement("option", { value: "activity" }, "Sort: Activity")), /* @__PURE__ */ React.createElement("button", { onClick: () => setCompactRepos((c) => !c), style: { padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: "'Fredoka', sans-serif", cursor: "pointer", background: compactRepos ? C.teal : C.cream, color: compactRepos ? C.white : C.brown, border: `2px solid ${C.darkBrown}`, transition: "all 0.15s" }, title: "Toggle compact repo cards" }, compactRepos ? "\u2630 Compact" : "\u2637 Full"), expandedCards.size > 0 && /* @__PURE__ */ React.createElement("button", { onClick: () => setExpandedCards(/* @__PURE__ */ new Set()), style: { padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: "'Fredoka', sans-serif", cursor: "pointer", background: C.red, color: C.white, border: `2px solid ${C.darkBrown}`, transition: "all 0.15s" }, title: "Collapse all expanded cards" }, "\u2716", " Collapse ", expandedCards.size), pinnedRepos.length > 0 && /* @__PURE__ */ React.createElement("button", { onClick: () => {
      setPinnedRepos([]);
      localStorage.setItem("swarm-pinned", "[]");
    }, style: { padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: "'Fredoka', sans-serif", cursor: "pointer", background: C.orange, color: C.white, border: `2px solid ${C.darkBrown}`, transition: "all 0.15s" }, title: "Unpin all repos" }, "\u{1F4CC}", " Unpin ", pinnedRepos.length)), /* @__PURE__ */ React.createElement("div", { className: "repo-grid", style: { display: "grid", gridTemplateColumns: compactRepos ? "repeat(auto-fill, minmax(180px, 1fr))" : "repeat(auto-fill, minmax(280px, 1fr))", gap: compactRepos ? 8 : 16 } }, repos.filter((r) => {
      if (repoFilter === "all") return true;
      if (repoFilter === "running") return isRepoBusy(r) && !r.paused;
      if (repoFilter === "idle") return !isRepoBusy(r) && !r.paused;
      if (repoFilter === "paused") return r.paused;
      if (repoFilter === "error") return r.state === "error" || r.state === "credits_exhausted";
      return true;
    }).sort((a, b) => {
      const pa = pinnedRepos.includes(a.id) ? 0 : 1;
      const pb = pinnedRepos.includes(b.id) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      if (repoSort === "name") return (a.name || "").localeCompare(b.name || "");
      if (repoSort === "state") return (a.state || "").localeCompare(b.state || "");
      if (repoSort === "items") return (b.stats?.items_total || 0) - (a.stats?.items_total || 0);
      if (repoSort === "cycles") return (b.cycle_count || 0) - (a.cycle_count || 0);
      if (repoSort === "cost") return (costs[b.id] || 0) - (costs[a.id] || 0);
      if (repoSort === "errors") return (b.stats?.mistakes || 0) - (a.stats?.mistakes || 0);
      if (repoSort === "health") {
        const ha = (a.stats?.items_done || 0) / Math.max(a.stats?.items_total || 1, 1) * 80 + (1 - (a.stats?.mistakes || 0) / Math.max(a.stats?.items_total || 1, 1)) * 20;
        const hb = (b.stats?.items_done || 0) / Math.max(b.stats?.items_total || 1, 1) * 80 + (1 - (b.stats?.mistakes || 0) / Math.max(b.stats?.items_total || 1, 1)) * 20;
        return hb - ha;
      }
      if (repoSort === "activity") return (b.last_activity || 0) - (a.last_activity || 0);
      return 0;
    }).map((r) => {
      const rst = STATES[r.state] || STATES.idle;
      const s = r.stats || {};
      const pctSteps = s.steps_total ? Math.round(s.steps_done / s.steps_total * 100) : 0;
      const hd = healthData.find((h) => h.repo_id === r.id);
      return /* @__PURE__ */ React.createElement(
        Card,
        {
          key: r.id,
          bg: sr === r.id ? C.yellow : C.white,
          className: "hover-lift",
          style: {
            cursor: "pointer",
            transition: "transform .2s, box-shadow .2s",
            position: "relative",
            overflow: "hidden",
            backgroundImage: sr === r.id ? `linear-gradient(135deg, ${C.yellow} 0%, #FFD54F 100%)` : `linear-gradient(135deg, #FFFFFF 0%, #FDFAF2 100%)`,
            borderLeft: isRepoBusy(r) ? `4px solid ${C.green}` : r.state === "error" ? `4px solid ${C.red}` : void 0,
            boxShadow: isRepoBusy(r) ? `inset 4px 0 12px -4px ${C.green}44` : void 0
          },
          title: `${r.name} | ${r.state} | Items: ${s.items_done || 0}/${s.items_total || 0} | Steps: ${s.steps_done || 0}/${s.steps_total || 0} | Errors: ${s.mistakes || 0} | Cycles: ${r.cycle_count || 0} | Cost: $${(costs[r.id] || 0).toFixed(2)} | Branch: ${r.branch || "main"}`,
          onClick: () => {
            setSR(r.id);
            setTab("flow");
          },
          onDoubleClick: (e) => {
            e.stopPropagation();
            setExpandedCards((prev) => {
              const n = new Set(prev);
              n.has(r.id) ? n.delete(r.id) : n.add(r.id);
              return n;
            });
          },
          onContextMenu: (e) => {
            e.preventDefault();
            const info = `${r.name} | ${r.state} | ${s.items_done || 0}/${s.items_total || 0} items | $${(costs[r.id] || 0).toFixed(2)}`;
            navigator.clipboard?.writeText(info).then(() => showToast(`Copied: ${r.name}`, "success")).catch(() => {
            });
          }
        },
        /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", inset: 0, opacity: 0.025, backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 20.5V18H0v-2h20v-2H0v-2h20v-2H0V8h20V6H0V4h20V2H0V0h22v20h2V0h2v20h2V0h2v20h2V0h2v20h2V0h2v20.5' fill='%233D2B1F' fill-opacity='.4' fill-rule='evenodd'/%3E%3C/svg%3E")`, pointerEvents: "none" } }),
        pinnedRepos.includes(r.id) && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: -1, left: -1, fontSize: 14, padding: "2px 6px" }, title: "Pinned" }, "\u{1F4CC}"),
        isRepoBusy(r) && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: -1, right: -1, background: `linear-gradient(135deg, ${C.green}, #27ae60)`, border: `2px solid ${C.darkBrown}`, borderRadius: "0 10px 0 10px", padding: "4px 12px", fontSize: 10, fontWeight: 700, color: C.white, letterSpacing: 1, fontFamily: "'Bangers', cursive" } }, "RUNNING"),
        (s.mistakes || 0) > 0 && !isRepoBusy(r) && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: -1, right: -1, background: C.red, border: `2px solid ${C.darkBrown}`, borderRadius: "0 10px 0 10px", padding: "3px 10px", fontSize: 10, fontWeight: 700, color: C.white, fontFamily: "'Bangers', cursive" } }, s.mistakes, " err"),
        /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10, position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 48, height: 48, borderRadius: "50%", background: `linear-gradient(135deg, ${rst.color}, ${rst.color}dd)`, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, transition: "transform 0.3s ease, background 0.3s ease", animation: isRepoBusy(r) ? "bounce 2s cubic-bezier(0.4,0,0.2,1) infinite" : "none", boxShadow: `0 2px 8px ${rst.color}44` } }, rst.emoji), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 22, letterSpacing: 1.5, lineHeight: 1.1, display: "flex", alignItems: "center", gap: 6 } }, r.name, r.last_activity > 0 && Date.now() / 1e3 - r.last_activity < 300 && /* @__PURE__ */ React.createElement("span", { style: { display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: C.green, animation: "pulse 1.2s infinite", flexShrink: 0 }, title: "Active in last 5 min" })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 } }, r.path), r.last_activity > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: C.brown, opacity: 0.5, marginTop: 1, display: "flex", alignItems: "center", gap: 4 } }, (() => {
          const ago = Math.floor(Date.now() / 1e3 - r.last_activity);
          return ago < 60 ? "active just now" : ago < 3600 ? `active ${Math.floor(ago / 60)}m ago` : ago < 86400 ? `active ${Math.floor(ago / 3600)}h ago` : `active ${Math.floor(ago / 86400)}d ago`;
        })(), (() => {
          const ago = Math.floor(Date.now() / 1e3 - r.last_activity);
          if (isRepoBusy(r) && ago > 3600) {
            const h = Math.floor(ago / 3600);
            return /* @__PURE__ */ React.createElement("span", { style: { fontSize: 8, padding: "1px 5px", borderRadius: 6, background: h > 4 ? "#FFEBEE" : `${C.orange}22`, color: h > 4 ? C.red : C.orange, fontWeight: 700 } }, "\u23F3", " stuck ", h, "h");
          }
          return null;
        })())), (s.items_total || 0) > 0 && /* @__PURE__ */ React.createElement(ProgressRing, { done: s.items_done || 0, total: s.items_total, size: 28, strokeWidth: 3, color: (s.items_done || 0) === s.items_total ? C.green : C.teal }), hd && /* @__PURE__ */ React.createElement(HealthBadge, { score: hd.health_score })),
        /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 6, marginBottom: 10 } }, [
          { l: "Items", v: `${s.items_done || 0}/${s.items_total || 0}`, bg: C.lightOrange },
          { l: "Steps", v: `${s.steps_done || 0}/${s.steps_total || 0}`, bg: C.lightTeal },
          { l: "Agents", v: s.agents || 0, bg: C.yellow },
          { l: "Cycles", v: r.cycle_count || 0, bg: C.cream },
          { l: "Cost", v: (() => {
            const c = costs[r.id] || 0;
            try {
              const k = `cr_${r.id}`;
              const h = JSON.parse(localStorage.getItem(k) || "[]");
              const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 13);
              if (!h.length || h[h.length - 1].t !== now) h.push({ t: now, v: c });
              else h[h.length - 1].v = c;
              if (h.length > 24) h.splice(0, h.length - 24);
              localStorage.setItem(k, JSON.stringify(h));
              if (h.length >= 2) {
                const d = h[h.length - 1].v - h[h.length - 2].v;
                return `$${c.toFixed(2)}${d > 0.01 ? "\u2197" : d < -0.01 ? "\u2198" : ""}`;
              }
            } catch (e) {
            }
            return `$${c.toFixed(2)}`;
          })(), bg: "#E8F5E9" },
          ...r.created_at && (s.items_done || 0) > 0 ? [{ l: "Vel", v: `${((s.items_done || 0) / Math.max(1, (Date.now() - new Date(r.created_at).getTime()) / 864e5)).toFixed(1)}/d`, bg: "#E3F2FD" }] : [],
          ...(() => {
            const pend = (s.items_total || 0) - (s.items_done || 0);
            const urg = Math.min(99, pend * 3 + (s.mistakes || 0) * 5);
            return urg > 0 ? [{ l: "Urg", v: urg, bg: urg > 50 ? "#FFEBEE" : urg > 20 ? "#FFF3E0" : "#E8F5E9" }] : [];
          })()
        ].map((x, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { background: x.bg, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 6px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, lineHeight: 1 } }, x.v), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: C.brown, fontWeight: 600 } }, x.l)))),
        /* @__PURE__ */ React.createElement("div", { style: { background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 8, height: 16, overflow: "hidden", marginBottom: 10, position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", borderRadius: 6, background: `linear-gradient(90deg, ${C.green}, ${C.teal})`, width: `${pctSteps}%`, transition: "width .5s" } }), s.steps_total > 0 && /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: C.darkBrown, fontFamily: "'Bangers', cursive", letterSpacing: 1 } }, pctSteps, "%")),
        (() => {
          try {
            const k = `act_${r.id}`;
            const now = Date.now();
            const h = JSON.parse(localStorage.getItem(k) || "[]").filter((e) => now - e.t < 864e5);
            h.push({ t: now, d: s.items_done || 0, e: s.mistakes || 0, run: isRepoBusy(r) ? 1 : 0 });
            if (h.length > 48) h.splice(0, h.length - 48);
            localStorage.setItem(k, JSON.stringify(h));
            if (h.length < 4) return null;
            const maxD = Math.max(1, ...h.map((x, i) => i > 0 ? Math.abs(x.d - h[i - 1].d) + Math.abs(x.e - h[i - 1].e) : 0));
            return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 1, alignItems: "end", height: 10, marginBottom: 6 } }, h.slice(-24).map((x, i, a) => {
              const delta = i > 0 ? Math.abs(x.d - a[i - 1].d) + Math.abs(x.e - a[i - 1].e) : 0;
              const intensity = Math.min(1, delta / maxD);
              const c = x.run ? C.green : C.brown;
              return /* @__PURE__ */ React.createElement("div", { key: i, style: { width: 3, height: Math.max(2, intensity * 10), borderRadius: 1, background: c, opacity: 0.3 + intensity * 0.7 } });
            }));
          } catch (e) {
            return null;
          }
        })(),
        (s.items_done || 0) > 0 && (() => {
          try {
            const k = `mom_${r.id}`;
            const h = JSON.parse(localStorage.getItem(k) || "[]");
            const d = s.items_done || 0;
            const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 13);
            if (!h.length || h[h.length - 1].t !== now) h.push({ t: now, v: d });
            else h[h.length - 1].v = d;
            if (h.length > 8) h.splice(0, h.length - 8);
            localStorage.setItem(k, JSON.stringify(h));
            if (h.length >= 3) {
              const r1 = h[h.length - 1].v - h[h.length - 2].v;
              const r2 = h[h.length - 2].v - h[h.length - 3].v;
              const accel = r1 - r2;
              if (accel > 0) return /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.green, fontWeight: 700 } }, "\u{1F680}", " Accelerating");
              if (accel < 0) return /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.orange, fontWeight: 700 } }, "\u{1F4C9}", " Decelerating");
              return /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown, fontWeight: 700, opacity: 0.5 } }, "\u2192", " Steady");
            }
          } catch (e) {
          }
          return null;
        })(),
        (r.state === "error" || r.state === "credits_exhausted") && r.last_error && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.red, padding: "4px 8px", background: `${C.red}11`, borderRadius: 6, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, title: r.last_error }, "\u{1F4A5}", " ", r.last_error.slice(0, 60)),
        sparklines[r.id]?.length > 1 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 6 } }, /* @__PURE__ */ React.createElement(Sparkline, { data: sparklines[r.id], width: 80, height: 12, color: C.teal }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown, fontWeight: 600 } }, sparklines[r.id].length, "d activity")),
        (() => {
          try {
            const k = `hs_${r.id}`;
            const h = JSON.parse(localStorage.getItem(k) || "[]");
            const done = s.items_done || 0;
            const total = s.items_total || 1;
            const errs = s.mistakes || 0;
            const score = Math.max(0, Math.min(100, Math.round(done / total * 80 + (1 - errs / Math.max(1, total)) * 20)));
            const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 13);
            if (!h.length || h[h.length - 1].t !== now) h.push({ t: now, v: score });
            else h[h.length - 1].v = score;
            if (h.length > 24) h.splice(0, h.length - 24);
            localStorage.setItem(k, JSON.stringify(h));
            if (h.length < 3) return null;
            const vals = h.map((x) => x.v);
            const mn = Math.min(...vals);
            const mx = Math.max(...vals, mn + 1);
            const pts = vals.map((v, i) => `${i / (vals.length - 1) * 60},${20 - (v - mn) / (mx - mn) * 18}`).join(" ");
            const lastC = score >= 70 ? C.green : score >= 40 ? C.orange : C.red;
            return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 } }, /* @__PURE__ */ React.createElement("svg", { width: 60, height: 20, viewBox: "0 0 60 20" }, /* @__PURE__ */ React.createElement("polyline", { points: pts, fill: "none", stroke: lastC, strokeWidth: "1.5" })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: lastC, fontWeight: 700 } }, score, "hp"));
          } catch (e) {
            return null;
          }
        })(),
        (s.mistakes || 0) > 0 && (s.items_total || 0) > 0 && (() => {
          const errPct = Math.min(100, Math.round((s.mistakes || 0) / (s.items_total || 1) * 100));
          const c = errPct > 30 ? C.red : errPct > 10 ? C.orange : C.teal;
          return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: c, fontWeight: 700, minWidth: 36 } }, errPct, "% err"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, height: 4, background: `${C.darkBrown}11`, borderRadius: 2, overflow: "hidden", maxWidth: 80 } }, /* @__PURE__ */ React.createElement("div", { style: { width: `${errPct}%`, height: "100%", background: c, borderRadius: 2 } })));
        })(),
        r.last_state_change && (() => {
          const ago = Math.floor(Date.now() / 1e3 - r.last_state_change);
          if (ago > 86400 * 7) return null;
          const label = ago < 60 ? "just now" : ago < 3600 ? `${Math.floor(ago / 60)}m ago` : ago < 86400 ? `${Math.floor(ago / 3600)}h ago` : `${Math.floor(ago / 86400)}d ago`;
          const rst2 = STATES[r.state] || STATES.idle;
          return /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: rst2.color, fontWeight: 600, opacity: Math.max(0.3, 1 - ago / 86400), marginBottom: 4 } }, "State changed ", label);
        })(),
        expandedCards.has(r.id) && /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 0", borderTop: `1px dashed ${C.darkBrown}22`, marginTop: 4, fontSize: 11, color: C.brown } }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 } }, /* @__PURE__ */ React.createElement("span", null, "Branch: ", /* @__PURE__ */ React.createElement("strong", null, r.branch || "main")), /* @__PURE__ */ React.createElement("span", null, "ID: ", /* @__PURE__ */ React.createElement("strong", null, "#", r.id)), /* @__PURE__ */ React.createElement("span", null, "Path: ", /* @__PURE__ */ React.createElement("code", { style: { fontSize: 9 } }, r.path?.slice(-30) || "?")), /* @__PURE__ */ React.createElement("span", null, "Tags: ", r.tags || "none"), /* @__PURE__ */ React.createElement("span", null, "Steps: ", s.steps_done || 0, "/", s.steps_total || 0), /* @__PURE__ */ React.createElement("span", null, "Cycles: ", s.cycles || 0), /* @__PURE__ */ React.createElement("span", null, "Cost: ", /* @__PURE__ */ React.createElement("strong", { style: { color: (costs[r.id] || 0) > 1 ? C.red : (costs[r.id] || 0) > 0.3 ? C.orange : C.green } }, "$", (costs[r.id] || 0).toFixed(4))), /* @__PURE__ */ React.createElement("span", null, "$/item: ", /* @__PURE__ */ React.createElement("strong", { style: { color: (() => {
          const c = costs[r.id] || 0;
          const d = s.items_done || 0;
          if (!d) return C.brown;
          const cpi = c / d;
          return cpi > 0.5 ? C.red : cpi > 0.1 ? C.orange : C.green;
        })() } }, (s.items_done || 0) > 0 ? `$${((costs[r.id] || 0) / (s.items_done || 1)).toFixed(4)}` : "n/a"))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: C.brown, opacity: 0.6, marginTop: 4 } }, "Double-click to collapse")),
        /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } }, isRepoManaged(r) ? /* @__PURE__ */ React.createElement(Btn, { bg: C.red, onClick: (e) => {
          e.stopPropagation();
          stopRepo(r.id);
        }, style: { fontSize: 12, padding: "6px 14px" } }, "\u23F9", " Stop") : /* @__PURE__ */ React.createElement(Btn, { bg: C.green, onClick: (e) => {
          e.stopPropagation();
          startRepo(r.id);
        }, style: { fontSize: 12, padding: "6px 14px" } }, "\u25B6", " Start"), isRepoManaged(r) && (r.paused ? /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, onClick: (e) => {
          e.stopPropagation();
          resumeRepo(r.id);
        }, style: { fontSize: 12, padding: "6px 14px" } }, "\u25B6", " Resume") : /* @__PURE__ */ React.createElement(Btn, { bg: C.orange, onClick: (e) => {
          e.stopPropagation();
          pauseRepo(r.id);
        }, style: { fontSize: 12, padding: "6px 14px" } }, "\u23F8", " Pause")), /* @__PURE__ */ React.createElement(Btn, { bg: "#888", onClick: (e) => {
          e.stopPropagation();
          deleteRepo(r.id);
        }, style: { fontSize: 11, padding: "5px 10px" } }, "\u2716"), /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
          e.stopPropagation();
          togglePin(r.id);
        }, style: { background: "none", border: "none", cursor: "pointer", fontSize: 16, opacity: pinnedRepos.includes(r.id) ? 1 : 0.3, padding: "2px" }, title: pinnedRepos.includes(r.id) ? "Unpin" : "Pin to top" }, "\u{1F4CC}"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.brown, display: "flex", alignItems: "center", gap: 4, flex: 1, fontWeight: 500 } }, rst.emoji, " ", rst.label))
      );
    }), /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { border: `3px dashed ${C.brown}` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, marginBottom: 8, letterSpacing: 1.5 } }, "+ Add New Repo"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 } }, /* @__PURE__ */ React.createElement(Inp, { placeholder: "Name", value: nr.name, onChange: (e) => setNR((p) => ({ ...p, name: e.target.value })), style: { fontSize: 12, padding: "8px 10px" } }), /* @__PURE__ */ React.createElement(Inp, { placeholder: "Path", value: nr.path, onChange: (e) => setNR((p) => ({ ...p, path: e.target.value })), style: { fontSize: 12, padding: "8px 10px" } }), /* @__PURE__ */ React.createElement(Inp, { placeholder: "GitHub URL", value: nr.github_url, onChange: (e) => setNR((p) => ({ ...p, github_url: e.target.value })), style: { fontSize: 12, padding: "8px 10px" } }), /* @__PURE__ */ React.createElement(Inp, { placeholder: "Branch", value: nr.branch, onChange: (e) => setNR((p) => ({ ...p, branch: e.target.value })), style: { fontSize: 12, padding: "8px 10px" } })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement(Btn, { onClick: addRepo, bg: C.teal, style: { fontSize: 13, padding: "7px 16px" } }, "Add to Town"), /* @__PURE__ */ React.createElement(Btn, { bg: C.orange, style: { fontSize: 13, padding: "7px 16px" }, onClick: async () => {
      if (!nr.github_url) {
        showToast("Enter a GitHub URL to clone", "error");
        return;
      }
      showToast("Cloning repository...", "info");
      const r = await f("/api/repos/clone", { method: "POST", body: JSON.stringify({ url: nr.github_url, name: nr.name || "", branch: nr.branch || "main" }) });
      if (r.ok) {
        const d = await r.json();
        showToast(d.message || "Cloned!", "success");
        setNR({ name: "", path: "", github_url: "", branch: "main" });
        load();
      } else {
        const d = await r.json().catch(() => ({}));
        showToast(d.error || "Clone failed", "error");
      }
    } }, "Clone from Git"))))), /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.yellow} 0%, #F5D94E 100%)`, style: { borderTop: `3px solid ${C.darkBrown}` } }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, textAlign: "center", marginBottom: 14, letterSpacing: 2.5 } }, "Recent Activity"), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 700, margin: "0 auto" } }, logs.slice(0, 8).map((l) => /* @__PURE__ */ React.createElement("div", { key: l.id, style: { display: "flex", gap: 8, padding: "6px 12px", background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 10, marginBottom: 5, fontSize: 12, transition: "transform .15s", boxShadow: "0 1px 3px rgba(0,0,0,.06)" } }, /* @__PURE__ */ React.createElement("span", { style: { color: C.brown, fontSize: 10, minWidth: 90 } }, l.created_at), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: STATES[l.state]?.color || C.brown, minWidth: 80 } }, l.state), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, l.action), l.error && /* @__PURE__ */ React.createElement("span", { style: { color: C.red, fontSize: 10 } }, "\u26A0", " ", l.error.slice(0, 30)))), logs.length === 0 && /* @__PURE__ */ React.createElement(Card, { style: { textAlign: "center", padding: 30, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 32, marginBottom: 6 } }, "\u{1F3DC}\uFE0F"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 4 } }, "Quiet as a desert breeze"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.brown } }, "Start some repos to see activity roll in!"))))), tab === "master" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.cream} 0%, #F0E2CA 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" } }, "All Repos -- Master View"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 12 } }, "Bird's-eye view of every repo in your swarm"), /* @__PURE__ */ React.createElement("details", { style: { maxWidth: 600, margin: "0 auto 12px" } }, /* @__PURE__ */ React.createElement("summary", { style: { fontSize: 13, fontWeight: 700, color: C.brown, cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: 1, textAlign: "center" } }, "Cross-Repo Search"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 8, justifyContent: "center", position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, maxWidth: 400, position: "relative" } }, /* @__PURE__ */ React.createElement(
      Inp,
      {
        placeholder: "Search items, logs, mistakes across all repos...",
        value: globalSearch,
        onChange: (e) => setGlobalSearch(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter") {
            const hist = JSON.parse(localStorage.getItem("swarm_search_hist") || "[]");
            const q = globalSearch.trim();
            if (q && !hist.includes(q)) {
              hist.unshift(q);
              if (hist.length > 8) hist.pop();
              localStorage.setItem("swarm_search_hist", JSON.stringify(hist));
            }
            searchGlobal(globalSearch);
          }
        },
        onFocus: (e) => {
          const dd = e.target.parentElement.querySelector(".search-hist");
          if (dd) dd.style.display = "block";
        },
        onBlur: () => setTimeout(() => {
          document.querySelectorAll(".search-hist").forEach((el) => el.style.display = "none");
        }, 200),
        style: { width: "100%", fontSize: 12 }
      }
    ), (() => {
      try {
        const hist = JSON.parse(localStorage.getItem("swarm_search_hist") || "[]");
        if (hist.length === 0) return null;
        return /* @__PURE__ */ React.createElement("div", { className: "search-hist", style: { display: "none", position: "absolute", top: "100%", left: 0, right: 0, background: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, marginTop: 2, zIndex: 50, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" } }, hist.map((q, i) => /* @__PURE__ */ React.createElement("div", { key: i, onMouseDown: () => {
          setGlobalSearch(q);
          searchGlobal(q);
        }, style: { padding: "6px 10px", fontSize: 11, cursor: "pointer", borderBottom: i < hist.length - 1 ? `1px solid ${C.darkBrown}11` : "none", color: C.brown } }, "\u{1F50D}", " ", q)));
      } catch (e) {
        return null;
      }
    })()), /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, onClick: () => {
      const hist = JSON.parse(localStorage.getItem("swarm_search_hist") || "[]");
      const q = globalSearch.trim();
      if (q && !hist.includes(q)) {
        hist.unshift(q);
        if (hist.length > 8) hist.pop();
        localStorage.setItem("swarm_search_hist", JSON.stringify(hist));
      }
      searchGlobal(globalSearch);
    }, style: { fontSize: 12, padding: "6px 14px" } }, "Search")), globalResults && globalResults.total > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 10, fontSize: 12, maxHeight: 300, overflowY: "auto" } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, marginBottom: 4, color: C.darkBrown } }, globalResults.total, " results found"), globalResults.items?.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: C.orange, fontSize: 11, marginTop: 6 } }, "Items (", globalResults.items.length, ")"), globalResults.items.slice(0, 10).map((it, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { padding: "3px 8px", background: C.white, borderRadius: 6, marginBottom: 2, fontSize: 11, display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600, color: C.teal, minWidth: 70 } }, it.repo_name), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600 } }, it.title), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown, fontSize: 10 } }, it.status)))), globalResults.mistakes?.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: C.red, fontSize: 11, marginTop: 6 } }, "Mistakes (", globalResults.mistakes.length, ")"), globalResults.mistakes.slice(0, 10).map((mk, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { padding: "3px 8px", background: C.white, borderRadius: 6, marginBottom: 2, fontSize: 11, display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600, color: C.teal, minWidth: 70 } }, mk.repo_name), /* @__PURE__ */ React.createElement("span", { style: { color: C.red, fontWeight: 600 } }, mk.error_type), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown } }, mk.description?.slice(0, 60))))), globalResults.logs?.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, color: C.teal, fontSize: 11, marginTop: 6 } }, "Logs (", globalResults.logs.length, ")"), globalResults.logs.slice(0, 10).map((lg, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { padding: "3px 8px", background: C.white, borderRadius: 6, marginBottom: 2, fontSize: 11, display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600, color: C.teal, minWidth: 70 } }, lg.repo_name), /* @__PURE__ */ React.createElement("span", null, lg.action), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown } }, lg.result?.slice(0, 40)))))), globalResults && globalResults.total === 0 && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", fontSize: 12, color: C.brown, marginTop: 8 } }, "No results found.")), !localStorage.getItem("wave250_dismissed") && /* @__PURE__ */ React.createElement(Card, { bg: "linear-gradient(135deg, #E040FB, #7C4DFF, #448AFF)", style: { maxWidth: 600, margin: "0 auto 12px", padding: "12px 16px", textAlign: "center", border: `3px solid ${C.darkBrown}`, position: "relative" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
      localStorage.setItem("wave250_dismissed", "1");
      load();
    }, style: { position: "absolute", top: 4, right: 8, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#fff8" } }, "x"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 22, letterSpacing: 2, color: "#fff", textShadow: "2px 2px 4px rgba(0,0,0,0.3)" } }, "\u{1F30A}", " Wave 250 Milestone! ", "\u{1F680}"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "#fff", opacity: 0.9, marginTop: 4 } }, "100 bot commands ", "\u2022", " 14 SQLite indexes ", "\u2022", " Error Boundary ", "\u2022", " Deep memoization"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "#fff", opacity: 0.7, marginTop: 2 } }, "750+ improvements ", "\u2022", " Never white-screens again ", "\u2022", " 60% faster renders")), repos.length > 0 && (() => {
      const completionRate = repoStats.overallPct;
      const errRate = Math.round(repoStats.totalErrors / Math.max(1, repoStats.totalItems || 1) * 100);
      const sysScore = Math.max(0, Math.min(100, completionRate - errRate + (repoStats.running > 0 ? 10 : 0)));
      const color = sysScore >= 70 ? C.green : sysScore >= 40 ? C.orange : C.red;
      return /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 600, margin: "0 auto 12px", display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: `${color}11`, borderRadius: 10, border: `1px solid ${color}33` } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color, minWidth: 40 } }, sysScore, "hp"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, height: 6, background: `${C.darkBrown}11`, borderRadius: 3, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { width: `${sysScore}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.5s" } })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown } }, repoStats.running, "/", repos.length, " active"), (() => {
        try {
          const k = "sys_cost_trend";
          const h = JSON.parse(localStorage.getItem(k) || "[]");
          const now = (/* @__PURE__ */ new Date()).toISOString().slice(0, 13);
          if (!h.length || h[h.length - 1].t !== now) h.push({ t: now, v: totalCost });
          else h[h.length - 1].v = totalCost;
          if (h.length > 12) h.splice(0, h.length - 12);
          localStorage.setItem(k, JSON.stringify(h));
          if (h.length >= 2) {
            const d = h[h.length - 1].v - h[h.length - 2].v;
            const arrow = d > 0.01 ? "\u2197" : d < -0.01 ? "\u2198" : "";
            return /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: d > 0 ? C.red : C.green, fontWeight: 700 } }, "$", totalCost.toFixed(2), arrow);
          }
          return /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown } }, "$", totalCost.toFixed(2));
        } catch (e) {
          return null;
        }
      })());
    })(), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 600, margin: "0 auto 16px", display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(
      Inp,
      {
        placeholder: "Search repos...",
        value: repoFilter === "all" ? "" : repoFilter.startsWith("q:") ? repoFilter.slice(2) : "",
        onChange: (e) => setRepoFilter(e.target.value ? "q:" + e.target.value : "all"),
        style: { maxWidth: 200, fontSize: 12, padding: "8px 14px" }
      }
    ), ["all", "running", "idle", "pinned", "archived"].map((f2) => /* @__PURE__ */ React.createElement(
      "span",
      {
        key: f2,
        onClick: () => setRepoFilter(f2),
        style: {
          cursor: "pointer",
          padding: "4px 12px",
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 700,
          background: repoFilter === f2 ? C.orange : C.cream,
          color: repoFilter === f2 ? C.white : C.brown,
          border: `2px solid ${repoFilter === f2 ? C.orange : C.darkBrown}33`,
          transition: "all .2s"
        }
      },
      f2 === "all" ? "All" : f2 === "running" ? "Running" : f2 === "idle" ? "Idle" : f2 === "pinned" ? "Pinned" : "Archived"
    )), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown } }, repos.length, " repos"), /* @__PURE__ */ React.createElement(
      "span",
      {
        onClick: () => {
          const next = !compactMaster;
          setCompactMaster(next);
          localStorage.setItem("swarm-compact-master", next ? "1" : "0");
        },
        style: { cursor: "pointer", fontSize: 10, padding: "3px 8px", borderRadius: 8, background: compactMaster ? C.teal : C.cream, color: compactMaster ? C.white : C.brown, border: `1px solid ${C.darkBrown}33`, fontWeight: 700, transition: "all .2s" },
        title: "Toggle compact mode"
      },
      compactMaster ? "Compact" : "Full"
    ), /* @__PURE__ */ React.createElement(
      "span",
      {
        onClick: () => setGroupByTag((v) => !v),
        style: { cursor: "pointer", fontSize: 10, padding: "3px 8px", borderRadius: 8, background: groupByTag ? "#7E57C2" : C.cream, color: groupByTag ? C.white : C.brown, border: `1px solid ${C.darkBrown}33`, fontWeight: 700, transition: "all .2s" },
        title: "Group by tag"
      },
      "Group"
    ), (() => {
      const allTags = [...new Set(repos.flatMap((r) => (r.tags || "").split(",").filter(Boolean)))].sort();
      return allTags.length > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown } }, "|"), allTags.map((t) => /* @__PURE__ */ React.createElement(
        "span",
        {
          key: t,
          onClick: () => setRepoFilter("tag:" + t),
          style: {
            cursor: "pointer",
            padding: "3px 10px",
            borderRadius: 10,
            fontSize: 10,
            fontWeight: 700,
            background: repoFilter === "tag:" + t ? "#7E57C2" : "#E8D5F5",
            color: repoFilter === "tag:" + t ? C.white : "#7E57C2",
            border: "1px solid #CE93D8",
            transition: "all .2s"
          }
        },
        t
      )));
    })()), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 600, margin: "0 auto 8px", display: "flex", justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement("button", { onClick: () => {
      const visible = repos.filter((r) => {
        if (repoFilter === "running") return isRepoBusy(r);
        if (repoFilter === "idle") return !isRepoBusy(r) && !r.paused && !r.archived;
        if (repoFilter === "pinned") return pinnedRepos.includes(r.id);
        if (repoFilter === "archived") return r.archived;
        if (repoFilter.startsWith("tag:")) return (r.tags || "").split(",").includes(repoFilter.slice(4));
        if (repoFilter.startsWith("q:")) return r.name.toLowerCase().includes(repoFilter.slice(2).toLowerCase());
        return true;
      });
      const allSelected = visible.every((r) => batchSelected.has(r.id));
      if (allSelected) {
        setBatchSelected(/* @__PURE__ */ new Set());
      } else {
        setBatchSelected(new Set(visible.map((r) => r.id)));
      }
    }, style: { fontSize: 11, color: C.brown, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontFamily: "'Fredoka', sans-serif" } }, (() => {
      const visible = repos.filter((r) => {
        if (repoFilter === "running") return isRepoBusy(r);
        if (repoFilter === "idle") return !isRepoBusy(r) && !r.paused && !r.archived;
        if (repoFilter === "pinned") return pinnedRepos.includes(r.id);
        if (repoFilter === "archived") return r.archived;
        if (repoFilter.startsWith("tag:")) return (r.tags || "").split(",").includes(repoFilter.slice(4));
        if (repoFilter.startsWith("q:")) return r.name.toLowerCase().includes(repoFilter.slice(2).toLowerCase());
        return true;
      });
      return visible.length > 0 && visible.every((r) => batchSelected.has(r.id)) ? "Deselect All" : `Select All (${visible.length})`;
    })())), /* @__PURE__ */ React.createElement("div", { className: "repo-grid", style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 } }, [...repos].filter((r) => {
      if (repoFilter === "running") return isRepoBusy(r);
      if (repoFilter === "idle") return !isRepoBusy(r) && !r.paused && !r.archived;
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
        const prevTag = _mi > 0 ? (arr[_mi - 1].tags || "").split(",").filter(Boolean)[0] || "untagged" : null;
        if (tag !== prevTag) {
          elements.push(
            /* @__PURE__ */ React.createElement("div", { key: `group-${tag}`, style: { gridColumn: "1 / -1", fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, color: "#7E57C2", padding: "8px 0 4px", borderBottom: `2px solid #CE93D8`, marginBottom: 4 } }, "\u{1F3F7}\uFE0F", " ", tag, " (", arr.filter((x) => ((x.tags || "").split(",").filter(Boolean)[0] || "untagged") === tag).length, ")")
          );
        }
      }
      return [...elements, r];
    }).map((r, _mi) => {
      if (r.type === "div" || r.$$typeof) return r;
      const rst = STATES[r.state] || STATES.idle;
      const s = r.stats || {};
      const pct = s.steps_total ? Math.round(s.steps_done / s.steps_total * 100) : 0;
      const isFocused = _mi === masterFocus;
      return /* @__PURE__ */ React.createElement(
        Card,
        {
          key: r.id,
          className: "hover-lift master-card",
          bg: batchSelected.has(r.id) ? C.yellow : isFocused ? C.lightTeal : C.white,
          style: { cursor: "pointer", transition: "transform .2s, box-shadow .2s", outline: isFocused ? `3px solid ${C.teal}` : "none", outlineOffset: -1, background: batchSelected.has(r.id) ? `linear-gradient(135deg, ${C.yellow} 0%, #FFD54F 100%)` : isFocused ? `linear-gradient(135deg, ${C.lightTeal} 0%, #D4F4E8 100%)` : `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` },
          onClick: () => {
            setSR(r.id);
            setTab("flow");
          }
        },
        /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, marginBottom: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 42, height: 42, borderRadius: "50%", background: `linear-gradient(135deg, ${rst.color}, ${rst.color}dd)`, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, animation: isRepoBusy(r) ? "bounce 2s cubic-bezier(0.4,0,0.2,1) infinite" : r.state === "error" ? "pulse-error 1.5s ease-in-out infinite" : "none", boxShadow: r.state === "error" ? `0 0 12px ${C.red}88` : `0 2px 8px ${rst.color}44` } }, rst.emoji), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, lineHeight: 1.1 } }, r.name), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              togglePin(r.id);
            },
            style: { background: "none", border: "none", cursor: "pointer", fontSize: 14, opacity: pinnedRepos.includes(r.id) ? 1 : 0.3, padding: "0 2px" },
            title: pinnedRepos.includes(r.id) ? "Unpin" : "Pin to top"
          },
          "\u{1F4CC}"
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(r.path);
              showToast("Path copied!", "info");
            },
            style: { background: "none", border: "none", cursor: "pointer", fontSize: 12, opacity: 0.4, padding: "0 4px" },
            title: r.path
          },
          "\u{1F4CB}"
        ), /* @__PURE__ */ React.createElement(
          "input",
          {
            type: "checkbox",
            checked: batchSelected.has(r.id),
            onClick: (e) => e.stopPropagation(),
            onChange: (e) => {
              e.stopPropagation();
              setBatchSelected((prev) => {
                const s2 = new Set(prev);
                if (s2.has(r.id)) s2.delete(r.id);
                else s2.add(r.id);
                return s2;
              });
            },
            style: { width: 16, height: 16, accentColor: C.teal, cursor: "pointer" },
            title: "Select for batch action"
          }
        )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, fontSize: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { color: C.brown, fontWeight: 500 } }, rst.label, " ", isRepoBusy(r) ? "-- RUNNING" : isRepoManaged(r) ? "-- READY" : ""), isRepoBusy(r) && (() => {
          const stateOrder = ["idle", "check_audio", "check_refactor", "check_new_items", "update_plan", "execute_step", "test_step", "check_steps_left", "final_optimize", "scan_repo"];
          const idx = stateOrder.indexOf(r.state || "idle");
          return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 2 } }, stateOrder.map((_, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { width: 4, height: 4, borderRadius: "50%", background: i <= idx ? rst.color : `${C.darkBrown}22`, transition: "background 0.3s" } })));
        })()), r.last_activity > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: C.brown, opacity: 0.6 } }, (() => {
          const ago = Math.floor(Date.now() / 1e3 - r.last_activity);
          return ago < 60 ? "just now" : ago < 3600 ? `${Math.floor(ago / 60)}m ago` : ago < 86400 ? `${Math.floor(ago / 3600)}h ago` : `${Math.floor(ago / 86400)}d ago`;
        })())), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, color: pct === 100 ? C.green : C.orange, lineHeight: 1 } }, pct, "%"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: C.brown } }, "complete"), healthScores?.repos?.[r.id] && (() => {
          const g = healthScores.repos[r.id].grade;
          const gc = g === "A" ? C.green : g === "B" ? C.teal : g === "C" ? C.orange : g === "D" ? "#E65100" : C.red;
          return /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 13, color: C.white, background: gc, borderRadius: 6, padding: "1px 8px", marginTop: 2, border: `2px solid ${C.darkBrown}`, letterSpacing: 1 }, title: `Health: ${healthScores.repos[r.id].score}/100` }, g);
        })())),
        /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 10 } }, /* @__PURE__ */ React.createElement(ProgressRing, { done: s.items_done || 0, total: s.items_total || 1, size: 28, strokeWidth: 3, color: pct === 100 ? C.green : C.teal }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 8, height: 14, overflow: "hidden", position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", borderRadius: 6, background: `linear-gradient(90deg, ${C.green}, ${C.teal})`, width: `${pct}%`, transition: "width .5s" } })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: pct === 100 ? C.green : C.teal, minWidth: 28, textAlign: "right" } }, pct, "%")),
        /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 6 } }, !isRepoManaged(r) ? /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
          e.stopPropagation();
          apiAction("/api/start", { method: "POST", body: JSON.stringify({ repo_id: r.id }) }, `${r.name} started`);
        }, style: { fontSize: 10, padding: "3px 10px", borderRadius: 8, background: C.green, color: C.white, border: `2px solid ${C.darkBrown}`, cursor: "pointer", fontWeight: 700, fontFamily: "'Fredoka',sans-serif" } }, "\u25B6\uFE0F", " Start") : /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
          e.stopPropagation();
          apiAction("/api/stop", { method: "POST", body: JSON.stringify({ repo_id: r.id }) }, `${r.name} stopped`);
        }, style: { fontSize: 10, padding: "3px 10px", borderRadius: 8, background: C.red, color: C.white, border: `2px solid ${C.darkBrown}`, cursor: "pointer", fontWeight: 700, fontFamily: "'Fredoka',sans-serif" } }, "\u23F9\uFE0F", " Stop"), isRepoManaged(r) && (r.paused ? /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
          e.stopPropagation();
          apiAction("/api/resume", { method: "POST", body: JSON.stringify({ repo_id: r.id }) }, `${r.name} resumed`);
        }, style: { fontSize: 10, padding: "3px 10px", borderRadius: 8, background: C.teal, color: C.white, border: `2px solid ${C.darkBrown}`, cursor: "pointer", fontWeight: 700, fontFamily: "'Fredoka',sans-serif" } }, "\u25B6\uFE0F", " Resume") : /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
          e.stopPropagation();
          apiAction("/api/pause", { method: "POST", body: JSON.stringify({ repo_id: r.id }) }, `${r.name} paused`);
        }, style: { fontSize: 10, padding: "3px 10px", borderRadius: 8, background: C.orange, color: C.white, border: `2px solid ${C.darkBrown}`, cursor: "pointer", fontWeight: 700, fontFamily: "'Fredoka',sans-serif" } }, "\u23F8\uFE0F", " Pause"))),
        !compactMaster && r.tags && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" } }, r.tags.split(",").filter(Boolean).map((tag) => /* @__PURE__ */ React.createElement("span", { key: tag, style: { fontSize: 9, padding: "2px 8px", borderRadius: 10, background: "#E8D5F5", color: "#7E57C2", fontWeight: 700, border: "1px solid #CE93D8" } }, tag))),
        /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 6 } }, [
          { l: "Items", v: `${s.items_done || 0}/${s.items_total || 0}`, pending: (s.items_total || 0) - (s.items_done || 0) },
          { l: "Steps", v: `${s.steps_done || 0}/${s.steps_total || 0}` },
          { l: "Files", v: s.file_count || "-" },
          { l: "Cycles", v: r.cycle_count || 0 },
          { l: "Cost", v: `$${(costs[r.id] || 0).toFixed(2)}` }
        ].map((x, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { textAlign: "center", fontSize: 11 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700 } }, x.v, x.pending > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 8, padding: "1px 4px", borderRadius: 6, background: C.orange, color: C.white, marginLeft: 3, fontWeight: 700 } }, x.pending)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: C.brown } }, x.l)))),
        !compactMaster && sparklines[r.id]?.length > 1 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown, minWidth: 42 } }, "7d trend"), /* @__PURE__ */ React.createElement(Sparkline, { data: sparklines[r.id], width: 100, height: 14, color: isRepoBusy(r) ? C.teal : C.brown }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown } }, sparklines[r.id].reduce((a, b) => a + b, 0), " actions")),
        !compactMaster && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" } }, isRepoManaged(r) ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              f("/api/stop", { method: "POST", body: JSON.stringify({ repo_id: r.id }) }).then(load);
            },
            style: { background: C.red, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive", letterSpacing: 1 }
          },
          "\u23F9",
          " Stop"
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              f(`/api/${r.paused ? "resume" : "pause"}`, { method: "POST", body: JSON.stringify({ repo_id: r.id }) }).then(load);
            },
            style: { background: r.paused ? C.green : C.orange, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive", letterSpacing: 1 }
          },
          r.paused ? "\u25B6 Resume" : "\u23F8 Pause"
        )) : /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              startRepo(r.id);
            },
            style: { background: C.green, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive", letterSpacing: 1 }
          },
          "\u25B6",
          " Start"
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              f("/api/push", { method: "POST", body: JSON.stringify({ repo_id: r.id, message: "manual push" }) }).then(() => showToast(`${r.name} pushed`, "success"));
            },
            style: { background: C.teal, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive", letterSpacing: 1 }
          },
          "\u{1F680}",
          " Push"
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              const title = prompt("Quick add item for " + r.name + ":");
              if (title) {
                f("/api/items", { method: "POST", body: JSON.stringify({ repo_id: r.id, title, type: "feature", priority: "medium" }) }).then(() => {
                  showToast(`Added "${title}" to ${r.name}`, "success");
                  load();
                });
              }
            },
            style: { background: C.yellow, color: C.darkBrown, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive", letterSpacing: 1 },
            title: "Quick add item"
          },
          "\u2795"
        ), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: (e) => {
              e.stopPropagation();
              f("/api/repos/archive", { method: "POST", body: JSON.stringify({ repo_id: r.id, archive: !r.archived }) }).then(() => {
                showToast(`${r.name} ${r.archived ? "unarchived" : "archived"}`, "info");
                load();
              });
            },
            style: { background: "#999", color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive", letterSpacing: 1, opacity: 0.7 },
            title: r.archived ? "Unarchive" : "Archive"
          },
          r.archived ? "\u{1F4E4}" : "\u{1F4E6}"
        ))
      );
    })), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 700, margin: "16px auto 0", padding: "10px 20px", background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 16 } }, [
      { l: "Running", v: repoStats.running, c: C.green },
      { l: "Idle", v: repoStats.idle, c: C.brown },
      { l: "Total Items", v: repoStats.totalItems, c: C.teal },
      { l: "Total Cost", v: "$" + repoStats.totalCost.toFixed(2), c: C.orange }
    ].map((s, i) => /* @__PURE__ */ React.createElement("span", { key: i }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: s.c } }, s.v), " ", /* @__PURE__ */ React.createElement("span", { style: { color: C.brown, fontSize: 10 } }, s.l)))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6 } }, /* @__PURE__ */ React.createElement("button", { onClick: async () => {
      const idle = repos.filter((r) => !isRepoManaged(r) && !r.archived);
      if (idle.length === 0) {
        showToast("No idle repos to start", "info");
        return;
      }
      await f("/api/repos/batch", { method: "POST", body: JSON.stringify({ repo_ids: idle.map((r) => r.id), action: "start" }) });
      showToast(`Starting ${idle.length} idle repos`, "success");
      load();
    }, style: { background: C.green, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive" } }, "\u25B6", " Start All Idle"), /* @__PURE__ */ React.createElement("button", { onClick: async () => {
      if (runningRepos.length === 0) {
        showToast("No running repos to stop", "info");
        return;
      }
      await f("/api/repos/batch", { method: "POST", body: JSON.stringify({ repo_ids: runningRepos.map((r) => r.id), action: "stop" }) });
      showToast(`Stopping ${runningRepos.length} repos`, "info");
      load();
    }, style: { background: C.red, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive" } }, "\u23F9", " Stop All"), /* @__PURE__ */ React.createElement("button", { onClick: async () => {
      const running = repos.filter((r) => isRepoManaged(r) && !r.paused);
      if (running.length === 0) {
        showToast("No running repos to pause", "info");
        return;
      }
      for (const r of running) await f("/api/pause", { method: "POST", body: JSON.stringify({ repo_id: r.id }) });
      showToast(`Paused ${running.length} repos`, "info");
      load();
    }, style: { background: C.orange, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive" } }, "\u23F8", " Pause All"), /* @__PURE__ */ React.createElement("button", { onClick: async () => {
      const paused = repos.filter((r) => isRepoManaged(r) && r.paused);
      if (paused.length === 0) {
        showToast("No paused repos to resume", "info");
        return;
      }
      for (const r of paused) await f("/api/resume", { method: "POST", body: JSON.stringify({ repo_id: r.id }) });
      showToast(`Resumed ${paused.length} repos`, "success");
      load();
    }, style: { background: C.teal, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "4px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Bangers',cursive" } }, "\u25B6", " Resume All")))), (() => {
      const ranked = repos.filter((r) => (r.stats?.cost || 0) > 0 && (r.stats?.items_done || 0) > 0).map((r) => ({ name: r.name, cost: r.stats.cost, done: r.stats.items_done, cpi: r.stats.cost / r.stats.items_done })).sort((a, b) => a.cpi - b.cpi);
      if (ranked.length < 2) return null;
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 700, margin: "16px auto 0", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" } }, "\u{1F4B0}", " Cost Efficiency Ranking"), ranked.slice(0, 8).map((r, i) => /* @__PURE__ */ React.createElement("div", { key: r.name, style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: i < ranked.length - 1 ? `1px solid ${C.darkBrown}11` : "none" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 700, minWidth: 22, color: i === 0 ? C.green : i < 3 ? C.teal : C.brown } }, i === 0 ? "\u{1F947}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : `${i + 1}.`), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 12, fontWeight: 600 } }, r.name), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: r.cpi < 0.1 ? C.green : r.cpi < 0.5 ? C.orange : C.red } }, "$", r.cpi.toFixed(3), "/item"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown } }, r.done, " done"))));
    })(), (() => {
      const alerts = [];
      repos.forEach((r) => {
        const done = r.stats?.items_done || 0;
        const errs = r.stats?.mistakes || 0;
        if (done > 0 && errs / done > 0.5) alerts.push({ icon: "\u{1F6D1}", msg: `${r.name}: ${Math.round(errs / done * 100)}% error rate`, lvl: "red" });
      });
      if (budgetLimit > 0) {
        const pct = totalCost / budgetLimit * 100;
        if (pct > 85) alerts.push({ icon: "\u{1F4B8}", msg: `Budget ${pct.toFixed(0)}% consumed ($${totalCost.toFixed(2)}/$${budgetLimit.toFixed(2)})`, lvl: pct > 95 ? "red" : "orange" });
      }
      const staleRepos = repos.filter((r) => isRepoBusy(r) && r.stats?.items_done === 0 && (r.stats?.items_total || 0) > 0);
      staleRepos.forEach((r) => alerts.push({ icon: "\u23F3", msg: `${r.name}: running but 0 completions`, lvl: "orange" }));
      if (alerts.length === 0) return null;
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 700, margin: "16px auto 0", padding: 14, borderLeft: `4px solid ${C.red}` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" } }, "\u{1F6A8}", " Risk Alerts (", alerts.length, ")"), alerts.slice(0, 6).map((a, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 12, color: a.lvl === "red" ? C.red : C.orange } }, /* @__PURE__ */ React.createElement("span", null, a.icon), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600 } }, a.msg))));
    })(), (() => {
      const anomalies = [];
      repos.forEach((r) => {
        const s = r.stats || {};
        const done = s.items_done || 0;
        const total = s.items_total || 0;
        const errs = s.mistakes || 0;
        const cost = costs[r.id] || 0;
        try {
          const k = `anom_${r.id}`;
          const hist = JSON.parse(localStorage.getItem(k) || "[]");
          const now = Date.now();
          const h = hist.filter((e) => now - e.t < 7 * 864e5);
          h.push({ t: now, d: done, e: errs, c: cost });
          if (h.length > 168) h.splice(0, h.length - 168);
          localStorage.setItem(k, JSON.stringify(h));
          if (h.length >= 6) {
            const base = h.slice(0, -3);
            const avgC = base.reduce((s2, x) => s2 + x.c, 0) / base.length;
            const avgE = base.reduce((s2, x) => s2 + x.e, 0) / base.length;
            if (avgC > 0 && cost > avgC * 2) anomalies.push({ repo: r.name, msg: `Cost spike $${cost.toFixed(2)} (2x avg $${avgC.toFixed(2)})`, lvl: "red" });
            if (avgE > 0 && errs > avgE * 1.8) anomalies.push({ repo: r.name, msg: `Error spike ${errs} (baseline ~${Math.round(avgE)})`, lvl: "orange" });
          }
        } catch (e) {
        }
      });
      const dismissed = JSON.parse(localStorage.getItem("anom_dismiss") || "{}");
      const filtered = anomalies.filter((a) => !dismissed[a.repo + a.msg]);
      if (filtered.length === 0) return null;
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 700, margin: "12px auto 0", padding: 14, borderLeft: `4px solid ${C.orange}` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 15, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" } }, "\u26A0\uFE0F", " Anomalies (", filtered.length, ")"), filtered.slice(0, 5).map((a, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, padding: "3px 0", fontSize: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { color: a.lvl === "red" ? C.red : C.orange, fontWeight: 700 } }, a.repo, ":"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, color: C.brown } }, a.msg), /* @__PURE__ */ React.createElement("button", { onClick: () => {
        const d = JSON.parse(localStorage.getItem("anom_dismiss") || "{}");
        d[a.repo + a.msg] = Date.now();
        localStorage.setItem("anom_dismiss", JSON.stringify(d));
        load();
      }, style: { background: "none", border: "none", fontSize: 10, cursor: "pointer", color: C.brown } }, "dismiss"))));
    })(), repos.length >= 4 && (() => {
      const scored = repos.filter((r) => (r.stats?.items_total || 0) > 0).map((r) => {
        const s = r.stats || {};
        const rate = (s.items_done || 0) / Math.max(1, s.items_total || 1) * 100;
        const errPenalty = (s.mistakes || 0) / Math.max(1, s.items_total) * 50;
        return { name: r.name, score: Math.round(rate - errPenalty), done: s.items_done || 0, total: s.items_total || 0, running: isRepoBusy(r) };
      }).sort((a, b) => b.score - a.score);
      if (scored.length < 2) return null;
      const top = scored.slice(0, 3);
      const bottom = scored.slice(-3).reverse();
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 700, margin: "12px auto 0", padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 15, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" } }, "\u{1F3C5}", " Performers"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: C.green, marginBottom: 4 } }, "Top"), top.map((r, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { fontSize: 11, display: "flex", justifyContent: "space-between", padding: "2px 0" } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600 } }, ["\u{1F947}", "\u{1F948}", "\u{1F949}"][i], " ", r.name), /* @__PURE__ */ React.createElement("span", { style: { color: C.green, fontWeight: 700 } }, r.score, "%")))), /* @__PURE__ */ React.createElement("div", { style: { width: 1, background: `${C.darkBrown}22` } }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, fontWeight: 700, color: C.red, marginBottom: 4 } }, "Needs Help"), bottom.map((r, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { fontSize: 11, display: "flex", justifyContent: "space-between", padding: "2px 0" } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600 } }, r.name), /* @__PURE__ */ React.createElement("span", { style: { color: C.red, fontWeight: 700 } }, r.score, "%"))))));
    })(), /* @__PURE__ */ React.createElement("details", { style: { maxWidth: 700, margin: "20px auto 0" } }, /* @__PURE__ */ React.createElement("summary", { style: { fontSize: 13, fontWeight: 700, color: C.brown, cursor: "pointer", fontFamily: "'Bangers', cursive", letterSpacing: 1, textAlign: "center" } }, "\u{1F517}", " Repo Dependencies"), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { marginTop: 8, padding: 16 } }, /* @__PURE__ */ React.createElement("p", { style: { fontSize: 11, color: C.brown, marginBottom: 10 } }, "Configure which repos depend on others. Deps format: comma-separated repo IDs."), /* @__PURE__ */ React.createElement("div", { style: { maxHeight: 300, overflowY: "auto" } }, repos.map((r) => /* @__PURE__ */ React.createElement("div", { key: r.id, style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6, padding: "6px 8px", background: C.cream, borderRadius: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, fontSize: 12, minWidth: 100, fontFamily: "'Bangers', cursive" } }, r.name), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown, minWidth: 20 } }, "#", r.id), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown } }, "\u2190", " depends on:"), /* @__PURE__ */ React.createElement(
      "input",
      {
        placeholder: "e.g. 1,3,5",
        defaultValue: r.deps || "",
        style: { flex: 1, padding: "4px 8px", borderRadius: 6, border: `1px solid ${C.darkBrown}33`, fontSize: 11, background: C.white },
        onKeyDown: async (e) => {
          if (e.key === "Enter") {
            await f("/api/repos/deps", { method: "POST", body: JSON.stringify({ repo_id: r.id, deps: e.target.value }) });
            showToast(`Deps updated for ${r.name}`, "info");
            load();
          }
        }
      }
    )))))), batchSelected.size > 0 && /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 1e3, background: darkMode ? `linear-gradient(180deg, #2D2D3D 0%, #1a1a2e 100%)` : `linear-gradient(180deg, ${C.darkBrown} 0%, #1E120A 100%)`, borderTop: `3px solid ${C.orange}`, padding: "10px 20px", display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap", animation: "slideUp 0.25s ease-out", boxShadow: "0 -4px 20px rgba(0,0,0,0.3)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, fontWeight: 700, color: C.white, fontFamily: "'Bangers', cursive", letterSpacing: 1.5 } }, "\u2611\uFE0F", " ", batchSelected.size, " repos selected"), /* @__PURE__ */ React.createElement(Btn, { bg: C.green, style: { fontSize: 12, padding: "6px 16px" }, onClick: async () => {
      await f("/api/repos/batch", { method: "POST", body: JSON.stringify({ repo_ids: [...batchSelected], action: "start" }) });
      showToast(`Start sent to ${batchSelected.size} repos`, "success");
      load();
      setBatchSelected(/* @__PURE__ */ new Set());
    } }, "\u25B6\uFE0F", " Start Selected"), /* @__PURE__ */ React.createElement(Btn, { bg: C.red, style: { fontSize: 12, padding: "6px 16px" }, onClick: async () => {
      await f("/api/repos/batch", { method: "POST", body: JSON.stringify({ repo_ids: [...batchSelected], action: "stop" }) });
      showToast(`Stop sent to ${batchSelected.size} repos`, "info");
      load();
      setBatchSelected(/* @__PURE__ */ new Set());
    } }, "\u23F9\uFE0F", " Stop Selected"), /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, style: { fontSize: 12, padding: "6px 16px" }, onClick: async () => {
      for (const rid of batchSelected) {
        await f("/api/push", { method: "POST", body: JSON.stringify({ repo_id: rid, message: "batch push" }) });
      }
      showToast(`Push sent to ${batchSelected.size} repos`, "success");
      setBatchSelected(/* @__PURE__ */ new Set());
    } }, "\u{1F680}", " Push Selected"), /* @__PURE__ */ React.createElement(Btn, { bg: "#888", style: { fontSize: 12, padding: "6px 16px" }, onClick: () => setBatchSelected(/* @__PURE__ */ new Set()) }, "Clear"))), tab === "flow" && (() => {
      const stepsDone = st.steps_done || 0;
      const stepsTotal = st.steps_total || 0;
      const itemsPending = items.filter((it) => it.status !== "completed").length;
      const nodeColors = {
        action: { color: "#FF6B6B", label: "Action (doing work)" },
        decision: { color: "#FFB347", label: "Decision (checking)" },
        rest: { color: "#4ECDC4", label: "Idle / Optimize" },
        error: { color: "#E74C3C", label: "Error / Blocked" }
      };
      return /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.cream} 0%, #F5E6C8 50%, #EDD9B3 100%)` }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 4 } }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", letterSpacing: 3, textShadow: `2px 2px 0 rgba(61,43,31,0.15)` } }, repo?.name || "Select a Repo", " -- Road Map"), /* @__PURE__ */ React.createElement(
        "select",
        {
          value: sr || "",
          onChange: (e) => setSR(parseInt(e.target.value)),
          style: { padding: "6px 10px", borderRadius: 8, border: `2px solid ${C.darkBrown}`, background: C.cream, fontFamily: "'Fredoka', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" }
        },
        repos.map((r) => /* @__PURE__ */ React.createElement("option", { key: r.id, value: r.id }, r.name))
      ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4 } }, isRepoManaged(repo) ? /* @__PURE__ */ React.createElement(Btn, { bg: C.red, onClick: () => stopRepo(repo.id), style: { fontSize: 11, padding: "5px 12px" } }, "\u23F9", " Stop") : /* @__PURE__ */ React.createElement(Btn, { bg: C.green, onClick: () => startRepo(repo.id), style: { fontSize: 11, padding: "5px 12px" } }, "\u25B6", " Start"), isRepoManaged(repo) && (repo.paused ? /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, onClick: () => resumeRepo(repo.id), style: { fontSize: 11, padding: "5px 12px" } }, "\u25B6", " Resume") : /* @__PURE__ */ React.createElement(Btn, { bg: C.orange, onClick: () => pauseRepo(repo.id), style: { fontSize: 11, padding: "5px 12px" } }, "\u23F8", " Pause")))), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 15, color: C.brown, marginBottom: 16 } }, si.emoji, " ", si.desc), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 680, margin: "0 auto 16px", padding: "14px 20px", background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 48, height: 48, borderRadius: "50%", background: si.color, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, animation: isRepoBusy(repo) ? "bounce 2s cubic-bezier(0.4,0,0.2,1) infinite" : "none", boxShadow: `0 0 12px ${si.color}44` } }, si.emoji), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 22, letterSpacing: 1.5, lineHeight: 1.1 } }, si.label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.brown } }, si.desc))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 16, alignItems: "center" } }, [
        { label: "Items Pending", val: itemsPending, bg: itemsPending > 0 ? C.orange : C.green },
        { label: "Steps Done", val: `${stepsDone}/${stepsTotal}`, bg: C.teal },
        { label: "Cycles", val: repo?.cycle_count || 0, bg: C.brown },
        ...(() => {
          const cp = plan.filter((s) => s.status === "completed" && s.tests_written > 0);
          if (cp.length === 0) return [];
          const passed = cp.reduce((a, s) => a + (s.tests_passed || 0), 0);
          const written = cp.reduce((a, s) => a + (s.tests_written || 0), 0);
          const rate = written > 0 ? Math.round(passed / written * 100) : 0;
          return [{ label: "Test Pass", val: `${rate}%`, bg: rate >= 80 ? C.green : rate >= 50 ? C.orange : C.red }];
        })()
      ].map((s, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 24, color: s.bg, lineHeight: 1 } }, s.val), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown, fontWeight: 600, letterSpacing: 0.5 } }, s.label))))), etas[sr] && !etas[sr].complete && etas[sr].eta_min !== null && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginTop: 8, fontSize: 12, color: C.brown, background: `${C.cream}88`, borderRadius: 8, padding: "6px 12px" } }, "\u23F3", " ETA: ~", etas[sr].eta_min < 60 ? `${Math.round(etas[sr].eta_min)}min` : `${(etas[sr].eta_min / 60).toFixed(1)}h`, " remaining", etas[sr].est_cost > 0 && /* @__PURE__ */ React.createElement("span", null, " (", "\u{1F4B0}", " ~$", etas[sr].est_cost.toFixed(3), ")"), /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.6 } }, " \u2014 ", etas[sr].remaining, " of ", etas[sr].total, " steps left")), etas[sr]?.complete && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginTop: 8, fontSize: 12, color: C.green, fontWeight: 700 } }, "\u2705", " All ", etas[sr].total, " steps complete!"), (() => {
        const active = items.find((it) => it.status === "in_progress");
        return active && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, padding: "6px 12px", background: `${C.orange}15`, borderRadius: 8, border: `1px solid ${C.orange}33`, display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, animation: "pulse 1.5s infinite" } }, "\u26A1"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.orange, fontWeight: 700, letterSpacing: 0.5 } }, "WORKING ON"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, active.title)), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", background: C.orange, color: C.white, borderRadius: 6, fontWeight: 700 } }, active.type));
      })(), (() => {
        const lastErr = mistakes.length > 0 ? mistakes[0] : null;
        return lastErr && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, padding: "6px 12px", background: "#FFEBEE", borderRadius: 8, border: `1px solid ${C.red}33`, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }, onClick: () => setTab("mistakes") }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14 } }, "\u{1F480}"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.red, fontWeight: 700, letterSpacing: 0.5 } }, "LAST ERROR"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, "[", lastErr.error_type, "] ", lastErr.description?.slice(0, 60))), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown } }, "\u279C", " details"));
      })()), (() => {
        const errLogs = logs.filter((l) => l.error);
        const totalLogs = logs.length;
        if (totalLogs === 0) return null;
        const errRate = totalLogs > 0 ? Math.round(errLogs.length / totalLogs * 100) : 0;
        const recentErrors2 = errLogs.slice(0, 3);
        return errLogs.length > 0 ? /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 680, margin: "0 auto 12px", padding: "10px 16px", background: errRate > 20 ? `linear-gradient(135deg, #FFEBEE 0%, #FFCDD2 100%)` : `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14 } }, errRate > 20 ? "\u26A0\uFE0F" : "\u2139\uFE0F"), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Bangers', cursive", fontSize: 14, letterSpacing: 1, color: errRate > 20 ? C.red : C.brown } }, errLogs.length, " errors (", errRate, "% of ", totalLogs, " actions)")), recentErrors2.map((e, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { fontSize: 10, color: C.red, padding: "2px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, e.created_at?.slice(11, 19), " ", e.action, ": ", e.error?.slice(0, 80))), errRate > 10 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 6, padding: "6px 10px", background: `${C.cream}88`, borderRadius: 6, fontSize: 10, color: C.brown } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700 } }, "\u{1F4A1}", " Suggestions:"), errLogs.some((e) => (e.error || "").toLowerCase().includes("credit")) && /* @__PURE__ */ React.createElement("span", null, " Check API credits."), errLogs.some((e) => (e.error || "").toLowerCase().includes("timeout")) && /* @__PURE__ */ React.createElement("span", null, " Increase timeout or reduce step complexity."), errLogs.some((e) => (e.error || "").toLowerCase().includes("rate")) && /* @__PURE__ */ React.createElement("span", null, " Reduce concurrent agents or add delays."), errRate > 30 && /* @__PURE__ */ React.createElement("span", null, " Error rate is high \u2014 consider pausing and reviewing the plan."), errRate <= 30 && errRate > 10 && /* @__PURE__ */ React.createElement("span", null, " Monitor closely \u2014 errors may be transient."))) : null;
      })(), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 16, display: "flex", justifyContent: "center", gap: 10 } }, repo && !isRepoManaged(repo) && /* @__PURE__ */ React.createElement(Btn, { bg: C.green, onClick: () => startRepo(sr), style: { padding: "10px 20px", fontSize: 16 } }, "\u25B6 Start"), isRepoManaged(repo) && /* @__PURE__ */ React.createElement(Btn, { bg: C.red, onClick: () => stopRepo(sr), style: { padding: "10px 20px", fontSize: 16 } }, "\u23F9 Stop"), isRepoManaged(repo) && (repo.paused ? /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, onClick: () => resumeRepo(sr), style: { padding: "10px 20px", fontSize: 16 } }, "\u25B6 Resume") : /* @__PURE__ */ React.createElement(Btn, { bg: C.orange, onClick: () => pauseRepo(sr), style: { padding: "10px 20px", fontSize: 16 } }, "\u23F8 Pause")), /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, onClick: pushGH, style: { padding: "10px 20px", fontSize: 16 } }, "\u2191 Push Git")), /* @__PURE__ */ React.createElement(RepoReadme, { repoId: sr, Card, C }), /* @__PURE__ */ React.createElement(Card, { bg: "transparent", style: { maxWidth: 680, margin: "0 auto 16px", padding: 0, border: "none", boxShadow: "none", background: "none" } }, /* @__PURE__ */ React.createElement("div", { style: { background: `linear-gradient(180deg, #F5E0B8 0%, #EDDCBE 40%, #E8D4AE 100%)`, border: `3px solid ${C.darkBrown}`, borderRadius: 12, padding: "20px 16px", boxShadow: "inset 0 2px 8px rgba(0,0,0,.08), 0 2px 4px rgba(0,0,0,.1), 0 4px 12px rgba(0,0,0,.08), 3px 3px 0 #3D2B1F", position: "relative", overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", inset: 0, opacity: 0.04, backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%233D2B1F' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`, pointerEvents: "none" } }), /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 570 500", style: { width: "100%", position: "relative", zIndex: 1 } }, /* @__PURE__ */ React.createElement("defs", null, /* @__PURE__ */ React.createElement("marker", { id: "ah", markerWidth: "7", markerHeight: "5", refX: "7", refY: "2.5", orient: "auto" }, /* @__PURE__ */ React.createElement("path", { d: "M0,0 L7,2.5 L0,5", fill: C.brown })), /* @__PURE__ */ React.createElement("marker", { id: "ahA", markerWidth: "7", markerHeight: "5", refX: "7", refY: "2.5", orient: "auto" }, /* @__PURE__ */ React.createElement("path", { d: "M0,0 L7,2.5 L0,5", fill: C.orange })), /* @__PURE__ */ React.createElement("filter", { id: "nodeGlow" }, /* @__PURE__ */ React.createElement("feGaussianBlur", { stdDeviation: "3", result: "coloredBlur" }), /* @__PURE__ */ React.createElement("feMerge", null, /* @__PURE__ */ React.createElement("feMergeNode", { in: "coloredBlur" }), /* @__PURE__ */ React.createElement("feMergeNode", { in: "SourceGraphic" }))), /* @__PURE__ */ React.createElement("filter", { id: "activeGlow" }, /* @__PURE__ */ React.createElement("feGaussianBlur", { stdDeviation: "4", result: "blur" }), /* @__PURE__ */ React.createElement("feFlood", { floodColor: si.color, floodOpacity: "0.5", result: "color" }), /* @__PURE__ */ React.createElement("feComposite", { in: "color", in2: "blur", operator: "in", result: "shadow" }), /* @__PURE__ */ React.createElement("feMerge", null, /* @__PURE__ */ React.createElement("feMergeNode", { in: "shadow" }), /* @__PURE__ */ React.createElement("feMergeNode", { in: "SourceGraphic" })))), FLOW_EDGES.map(([from, to, path, label], i) => {
        const active = from === cs;
        return /* @__PURE__ */ React.createElement("g", { key: i }, /* @__PURE__ */ React.createElement("path", { d: path, fill: "none", stroke: active ? C.orange : "rgba(93,64,55,0.3)", strokeWidth: active ? 3 : 1.5, markerEnd: active ? "url(#ahA)" : "url(#ah)", style: active ? { filter: "drop-shadow(0 0 3px rgba(247,148,29,0.4))" } : {} }), label && (() => {
          const pts = path.split(/[ML ]+/).filter(Boolean).map((p) => p.split(",").map(Number));
          if (pts.length >= 2) return /* @__PURE__ */ React.createElement("text", { x: (pts[0][0] + pts[1][0]) / 2, y: (pts[0][1] + pts[1][1]) / 2 - 5, fill: active ? C.orange : C.brown, fontSize: "9", textAnchor: "middle", fontFamily: "Fredoka", fontWeight: "700" }, /* @__PURE__ */ React.createElement("tspan", { style: { background: "#F5E0B8" } }, label));
        })());
      }), FLOW_NODES.map((n) => {
        const active = n.id === cs;
        const info = STATES[n.id] || {};
        const isDecision = !!n.dec;
        return /* @__PURE__ */ React.createElement("g", { key: n.id, style: active ? { filter: "url(#activeGlow)" } : {} }, !isDecision && /* @__PURE__ */ React.createElement("rect", { x: n.x + n.w / 2 - 3, y: n.y + n.h - 2, width: 6, height: 6, rx: 1, fill: active ? info.color : "#D4C5A9", stroke: active ? C.darkBrown : "#bbb", strokeWidth: 1 }), /* @__PURE__ */ React.createElement(
          "rect",
          {
            x: n.x,
            y: n.y,
            width: n.w,
            height: n.h,
            rx: isDecision ? 4 : 10,
            fill: active ? info.color : "#FAF0D7",
            stroke: active ? C.darkBrown : "#C4B896",
            strokeWidth: active ? 3 : 1.5,
            strokeDasharray: isDecision ? "5,3" : void 0
          }
        ), active && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(
          "rect",
          {
            x: n.x - 3,
            y: n.y - 3,
            width: n.w + 6,
            height: n.h + 6,
            rx: isDecision ? 6 : 13,
            fill: "none",
            stroke: info.color,
            strokeWidth: 2.5,
            opacity: 0.6
          },
          /* @__PURE__ */ React.createElement("animate", { attributeName: "opacity", values: ".8;.15;.8", dur: "1.2s", repeatCount: "indefinite" })
        ), /* @__PURE__ */ React.createElement(
          "rect",
          {
            x: n.x - 6,
            y: n.y - 6,
            width: n.w + 12,
            height: n.h + 12,
            rx: isDecision ? 8 : 16,
            fill: "none",
            stroke: info.color,
            strokeWidth: 1.5,
            opacity: 0.3
          },
          /* @__PURE__ */ React.createElement("animate", { attributeName: "opacity", values: ".4;.05;.4", dur: "1.8s", repeatCount: "indefinite" })
        )), /* @__PURE__ */ React.createElement("text", { x: n.x + n.w / 2, y: n.y + 15, fill: active ? C.white : C.brown, fontSize: "12", textAnchor: "middle", fontFamily: "Fredoka" }, info.emoji), /* @__PURE__ */ React.createElement("text", { x: n.x + n.w / 2, y: n.y + 29, fill: active ? C.white : C.darkBrown, fontSize: "9", textAnchor: "middle", fontFamily: "Fredoka", fontWeight: active ? "700" : "500" }, info.label));
      })))), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 680, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } }, /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, color: C.darkBrown } }, "Map Legend"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } }, Object.entries(nodeColors).map(([key, val]) => /* @__PURE__ */ React.createElement("div", { key, style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 18, height: 12, borderRadius: key === "decision" ? 2 : 6, background: val.color, border: `1.5px solid ${C.darkBrown}`, flexShrink: 0, ...key === "decision" ? { borderStyle: "dashed" } : {} } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown, fontWeight: 500 } }, val.label))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 2 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 18, height: 12, borderRadius: 6, background: si.color, border: `2px solid ${C.darkBrown}`, flexShrink: 0, boxShadow: `0 0 6px ${si.color}66` } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown, fontWeight: 600 } }, "Currently Active (glowing)")))), logs.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 14, marginBottom: 12, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, color: C.darkBrown } }, "Recent Activity"), /* @__PURE__ */ React.createElement("div", { style: { position: "relative", paddingLeft: 16 } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: 5, top: 0, bottom: 0, width: 2, background: `${C.darkBrown}22` } }), logs.slice(0, 5).map((l, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 8, marginBottom: 6, position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: -12, top: 4, width: 8, height: 8, borderRadius: "50%", background: l.level === "error" ? C.red : l.level === "warning" ? C.orange : C.teal, border: `2px solid ${C.white}` } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown, minWidth: 50, fontFamily: "monospace" } }, l.created_at?.slice(11, 19) || ""), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, flex: 1, lineHeight: 1.3 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600 } }, l.action), l.result && /* @__PURE__ */ React.createElement("span", { style: { color: C.brown } }, " \u2014 ", l.result.slice(0, 60))))))), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, color: C.darkBrown } }, "Current State"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 32, height: 32, borderRadius: "50%", background: si.color, border: `2px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 } }, si.emoji), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: 14 } }, si.label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown } }, si.desc))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown, lineHeight: 1.6 } }, isRepoBusy(repo) ? /* @__PURE__ */ React.createElement("span", { style: { color: C.green, fontWeight: 600 } }, "Orchestrator is running -- agents are active and processing.") : /* @__PURE__ */ React.createElement("span", { style: { color: C.orange, fontWeight: 600 } }, isRepoManaged(repo) ? "Orchestrator is ready but idle. Stop it or let it pick up new work." : "Orchestrator is stopped. Hit Start to kick things off!"), stepsTotal > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 4 } }, "Progress: ", stepsDone, " of ", stepsTotal, " steps complete (", stepsTotal > 0 ? Math.round(stepsDone / stepsTotal * 100) : 0, "%)")))));
    })(), tab === "items" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.cream} 0%, #F0E2CA 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.12)" } }, "Bounty Board"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 8 } }, "Post features and issues for the swarm to wrangle"), staleItems.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, background: "#FFF3E0", border: `2px solid ${C.orange}`, borderRadius: 12, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: C.orange } }, "\u26A0\uFE0F", " ", staleItems.length, " stale item", staleItems.length !== 1 ? "s" : "", " stuck in progress")), items.filter((i) => i.depends_on).length > 0 && (() => {
      const withDeps = items.filter((i) => i.depends_on);
      const blocked = withDeps.filter((d) => !items.some((i) => (i.title || "").toLowerCase() === (d.depends_on || "").toLowerCase() && i.status === "completed"));
      const unblocked = withDeps.length - blocked.length;
      return /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 6, background: "#E0F2F1", border: `1px solid ${C.teal}`, borderRadius: 10, padding: "3px 12px", fontSize: 10, fontWeight: 700, color: C.teal } }, "\u{1F517}", " ", withDeps.length, " dependencies: ", blocked.length > 0 && /* @__PURE__ */ React.createElement("span", { style: { color: C.red } }, blocked.length, " blocked"), blocked.length > 0 && unblocked > 0 && " / ", unblocked > 0 && /* @__PURE__ */ React.createElement("span", { style: { color: C.green } }, unblocked, " clear")));
    })(), (itemFilter !== "all" || sourceFilter !== "all" || priorityFilter !== "all") && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("span", { onClick: () => {
      setSourceFilter("all");
      setPriorityFilter("all");
      setItemFilter("all");
    }, style: { display: "inline-flex", alignItems: "center", gap: 4, background: "#E3F2FD", border: `1px solid ${C.teal}`, borderRadius: 10, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: C.teal, cursor: "pointer" } }, "\u{1F50D}", " Filters active \u2014 click or press C to clear")), /* @__PURE__ */ React.createElement(Card, { bg: C.yellow, style: { maxWidth: 620, margin: "0 auto 20px", background: `linear-gradient(135deg, ${C.yellow} 0%, #FFD54F 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 } }, "Post a Bounty"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10 } }, /* @__PURE__ */ React.createElement(
      "select",
      {
        value: ni.type,
        onChange: (e) => setNI((p) => ({ ...p, type: e.target.value })),
        style: { padding: "10px 14px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, fontSize: 13, fontFamily: "'Fredoka',sans-serif", fontWeight: 600, outline: "none", cursor: "pointer" }
      },
      /* @__PURE__ */ React.createElement("option", { value: "feature" }, "\u{1F31F}", " Feature"),
      /* @__PURE__ */ React.createElement("option", { value: "issue" }, "\u{1F41B}", " Issue")
    ), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: ni.priority,
        onChange: (e) => setNI((p) => ({ ...p, priority: e.target.value })),
        style: { padding: "10px 14px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, fontSize: 13, fontFamily: "'Fredoka',sans-serif", fontWeight: 600, outline: "none", cursor: "pointer" }
      },
      ["low", "medium", "high", "critical"].map((p) => /* @__PURE__ */ React.createElement("option", { key: p, value: p }, p.charAt(0).toUpperCase() + p.slice(1)))
    )), /* @__PURE__ */ React.createElement(Inp, { placeholder: "Bounty title...", value: ni.title, onChange: (e) => setNI((p) => ({ ...p, title: e.target.value })), style: { marginBottom: 8 } }), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        placeholder: "Describe the bounty in detail...",
        value: ni.description,
        onChange: (e) => setNI((p) => ({ ...p, description: e.target.value })),
        style: { width: "100%", padding: "10px 14px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, color: C.darkBrown, fontSize: 14, fontFamily: "'Fredoka',sans-serif", minHeight: 70, resize: "vertical", outline: "none", boxSizing: "border-box", marginBottom: 10 }
      }
    ), /* @__PURE__ */ React.createElement(Btn, { onClick: addItem, style: { fontSize: 16, padding: "12px 28px" } }, "Post ", ni.type === "issue" ? "\u{1F41B}" : "\u{1F31F}", " Bounty"), /* @__PURE__ */ React.createElement("details", { style: { marginTop: 10 } }, /* @__PURE__ */ React.createElement("summary", { style: { fontSize: 12, color: C.brown, cursor: "pointer", fontWeight: 600 } }, "Import items from JSON"), /* @__PURE__ */ React.createElement(
      "textarea",
      {
        id: "import-json",
        placeholder: '[{"title":"My feature","type":"feature","priority":"high","description":"Details..."}]',
        style: { width: "100%", padding: 10, background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 8, fontSize: 12, fontFamily: "monospace", minHeight: 60, resize: "vertical", marginTop: 6, boxSizing: "border-box" }
      }
    ), /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, onClick: () => {
      const el = document.getElementById("import-json");
      if (el?.value) importItems(el.value);
    }, style: { fontSize: 12, padding: "6px 14px", marginTop: 6 } }, "Import JSON"))), items.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto 12px", display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" } }, /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, onClick: dedupeItems, style: { fontSize: 12, padding: "8px 14px" } }, "\u{1F9F9}", " Dedupe"), /* @__PURE__ */ React.createElement(Btn, { bg: C.orange, onClick: retryAllCompleted, style: { fontSize: 12, padding: "8px 14px" } }, "\u{1F504}", " Retry Done"), /* @__PURE__ */ React.createElement(Btn, { bg: "#A0ADB5", onClick: () => clearItems("completed"), style: { fontSize: 12, padding: "8px 14px" } }, "\u2705", " Clear Done"), /* @__PURE__ */ React.createElement(Btn, { bg: "#7E57C2", onClick: () => apiAction("/api/items/archive", { method: "POST", body: JSON.stringify({ repo_id: sr, days: 7 }) }, "Old items archived"), style: { fontSize: 12, padding: "8px 14px" } }, "\u{1F4E6}", " Archive 7d+"), /* @__PURE__ */ React.createElement(Btn, { bg: C.red, onClick: () => clearItems(), style: { fontSize: 12, padding: "8px 14px" } }, "\u{1F5D1}\uFE0F", " Clear All"), /* @__PURE__ */ React.createElement(Btn, { bg: "#5D6D7E", onClick: () => {
      const data = items.map((it) => ({ title: it.title, type: it.type, priority: it.priority, status: it.status, description: it.description, source: it.source, depends_on: it.depends_on, created_at: it.created_at }));
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `swarm-items-${repo?.name || "repo"}-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${items.length} items to JSON`, "success");
    }, style: { fontSize: 12, padding: "8px 14px" } }, "\u{1F4E5}", " Export"), /* @__PURE__ */ React.createElement(Btn, { bg: "#2E7D32", onClick: () => {
      const header = "title,type,priority,status,source,created_at";
      const csvEsc = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
      const rows = items.map((it) => [it.title, it.type, it.priority, it.status, it.source, it.created_at].map(csvEsc).join(","));
      const csv = [header, ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `swarm-items-${repo?.name || "repo"}-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Exported ${items.length} items to CSV`, "success");
    }, style: { fontSize: 12, padding: "8px 14px" } }, "\u{1F4C8}", " CSV"), /* @__PURE__ */ React.createElement("button", { onClick: () => setCompactItems((c) => !c), style: { padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: "'Fredoka', sans-serif", cursor: "pointer", background: compactItems ? C.teal : C.cream, color: compactItems ? C.white : C.brown, border: `2px solid ${C.darkBrown}`, transition: "all 0.15s" }, title: "Toggle compact view" }, compactItems ? "\u2630 Compact" : "\u2637 Full"), /* @__PURE__ */ React.createElement("button", { onClick: () => setGroupByType((g) => !g), style: { padding: "6px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700, fontFamily: "'Fredoka', sans-serif", cursor: "pointer", background: groupByType ? "#7E57C2" : C.cream, color: groupByType ? C.white : C.brown, border: `2px solid ${C.darkBrown}`, transition: "all 0.15s" }, title: "Group by type" }, groupByType ? "\u{1F3F7} Grouped" : "\u{1F3F7} Group"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: C.brown, alignSelf: "center", fontWeight: 600 } }, itemStats.pending, " pending / ", itemStats.done, " done / ", itemStats.total, " total"), items.filter((i) => i.status === "pending" && i.created_at).length > 0 && (() => {
      const pending = items.filter((i) => i.status === "pending" && i.created_at);
      const now = Date.now();
      const fresh = pending.filter((i) => now - new Date(i.created_at).getTime() < 864e5).length;
      const mid = pending.filter((i) => {
        const d = (now - new Date(i.created_at).getTime()) / 864e5;
        return d >= 1 && d <= 7;
      }).length;
      const stale = pending.filter((i) => now - new Date(i.created_at).getTime() > 7 * 864e5).length;
      return /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 600, background: C.cream, color: C.brown, border: `1px solid ${C.darkBrown}22` } }, "\u{1F4C5}", " ", fresh > 0 ? `${fresh} new` : "", fresh > 0 && (mid > 0 || stale > 0) ? " \xB7 " : "", mid > 0 ? `${mid} this week` : "", mid > 0 && stale > 0 ? " \xB7 " : "", stale > 0 ? /* @__PURE__ */ React.createElement("span", { style: { color: C.red } }, stale, " stale") : "");
    })(), itemStats.total > 0 && (() => {
      const rate = itemStats.completePct;
      return /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: rate >= 75 ? "#E8F5E9" : rate >= 40 ? C.lightOrange : "#FFEBEE", color: rate >= 75 ? C.green : rate >= 40 ? C.orange : C.red, border: `1px solid ${rate >= 75 ? C.green : rate >= 40 ? C.orange : C.red}44` } }, rate, "% complete");
    })(), items.filter((i) => i.status === "pending" && i.created_at).length > 0 && (() => {
      const pendingWithAge = items.filter((i) => i.status === "pending" && i.created_at);
      const now = Date.now();
      const ages = pendingWithAge.map((i) => (now - new Date(i.created_at).getTime()) / 864e5);
      const avgAge = Math.round(ages.reduce((s, a) => s + a, 0) / ages.length);
      const oldPct = Math.round(ages.filter((a) => a > 7).length / ages.length * 100);
      return /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, fontWeight: 700, background: avgAge > 14 ? "#FFEBEE" : avgAge > 7 ? C.lightOrange : "#E8F5E9", color: avgAge > 14 ? C.red : avgAge > 7 ? C.orange : C.green, border: `1px solid ${avgAge > 14 ? C.red : avgAge > 7 ? C.orange : C.green}44` } }, "\u23F3", " Avg ", avgAge, "d", oldPct > 30 ? ` (${oldPct}% old)` : "");
    })(), (() => {
      const doneI = items.filter((i) => i.status === "completed" && i.completed_at);
      if (doneI.length < 2 || itemStats.pending === 0) return null;
      const pendI = itemStats.pending;
      const dts = doneI.map((i) => new Date(i.completed_at).getTime()).sort();
      const vel = doneI.length / Math.max(1, (dts[dts.length - 1] - dts[0]) / 864e5);
      const eta = Math.ceil(pendI / vel);
      return eta > 0 ? /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, background: C.lightTeal, color: C.teal, padding: "2px 8px", borderRadius: 10, fontWeight: 700, border: `1px solid ${C.teal}44` } }, "\u{1F4C5}", " ~", eta, "d ETA") : null;
    })()), items.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto 10px", padding: "8px 14px", background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, color: C.brown } }, "Priority:"), [
      { p: "critical", c: C.red, icon: "\u{1F525}" },
      { p: "high", c: C.orange, icon: "\u26A1" },
      { p: "medium", c: C.teal, icon: "\u25CF" },
      { p: "low", c: "#999", icon: "\u25CB" }
    ].map(({ p, c, icon }) => {
      const count = items.filter((i) => i.priority === p).length;
      if (count === 0) return null;
      return /* @__PURE__ */ React.createElement("span", { key: p, style: { fontSize: 11, display: "flex", alignItems: "center", gap: 3 } }, /* @__PURE__ */ React.createElement("span", null, icon), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: c } }, count), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown } }, p));
    }), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, height: 6, background: C.cream, borderRadius: 3, overflow: "hidden", display: "flex" } }, ["critical", "high", "medium", "low"].map((p) => {
      const count = items.filter((i) => i.priority === p).length;
      const pct = items.length > 0 ? count / items.length * 100 : 0;
      const colors = { critical: C.red, high: C.orange, medium: C.teal, low: "#999" };
      return pct > 0 ? /* @__PURE__ */ React.createElement("div", { key: p, style: { width: `${pct}%`, height: "100%", background: colors[p], transition: "width 0.3s" } }) : null;
    })))), (() => {
      const doneItems = items.filter((i) => i.status === "completed" && i.completed_at);
      if (doneItems.length < 2) return null;
      const dates = doneItems.map((i) => new Date(i.completed_at).getTime()).sort();
      const spanDays = Math.max(1, (dates[dates.length - 1] - dates[0]) / 864e5);
      const velocity = (doneItems.length / spanDays).toFixed(1);
      const pendCount = itemStats.pending;
      const etaDays = velocity > 0 && pendCount > 0 ? Math.ceil(pendCount / velocity) : 0;
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto 8px", padding: "6px 14px", background: `linear-gradient(135deg, #E0F7FA 0%, #B2EBF2 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12, fontSize: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: C.teal } }, "\u{1F680}", " ", velocity, "/day"), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown } }, "velocity"), costs[sr] > 0 && doneItems.length > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, background: costs[sr] / doneItems.length < 0.1 ? "#E8F5E9" : costs[sr] / doneItems.length < 0.5 ? C.lightOrange : "#FFEBEE", color: costs[sr] / doneItems.length < 0.1 ? C.green : costs[sr] / doneItems.length < 0.5 ? C.orange : C.red, padding: "1px 6px", borderRadius: 6, fontWeight: 700 } }, "$", (costs[sr] / doneItems.length).toFixed(3), "/item"), etaDays > 0 && /* @__PURE__ */ React.createElement("span", { style: { color: C.brown, fontSize: 11 } }, "\xB7", " ~", etaDays, "d to clear ", pendCount, " pending"), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontSize: 10, color: C.brown, opacity: 0.6 } }, doneItems.length, " completed over ", Math.round(spanDays), "d")));
    })(), (() => {
      const blocked = items.filter((i) => i.depends_on && i.status === "pending" && !items.some((x) => (x.title || "").toLowerCase() === (i.depends_on || "").toLowerCase() && x.status === "completed"));
      if (blocked.length === 0) return null;
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto 8px", padding: "8px 14px", borderLeft: `4px solid ${C.orange}`, background: `linear-gradient(135deg, ${C.white} 0%, #FFF3E0 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 700, color: C.orange, marginBottom: 4 } }, "\u{1F517}", " ", blocked.length, " Blocked Item", blocked.length !== 1 ? "s" : ""), blocked.slice(0, 3).map((it, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { fontSize: 11, padding: "2px 0", color: C.brown } }, "\u2022", " ", /* @__PURE__ */ React.createElement("strong", null, (it.title || "?").slice(0, 35)), " ", /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.7 } }, "\u2192", ' needs "', (it.depends_on || "").slice(0, 25), '"'))), blocked.length > 3 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown, opacity: 0.6 } }, "...+", blocked.length - 3, " more"));
    })(), items.filter((i) => i.status === "pending" && i.created_at).length > 2 && (() => {
      const now = Date.now();
      const buckets = [{ l: "<1d", max: 1, c: C.green }, { l: "1-3d", max: 3, c: C.teal }, { l: "3-7d", max: 7, c: C.orange }, { l: "7+d", max: Infinity, c: C.red }];
      const counts = buckets.map(() => 0);
      items.filter((i) => i.status === "pending" && i.created_at).forEach((i) => {
        const d = (now - new Date(i.created_at).getTime()) / 864e5;
        let prev = 0;
        for (let b = 0; b < buckets.length; b++) {
          if (d >= prev && (d < buckets[b].max || buckets[b].max === Infinity)) {
            counts[b]++;
            break;
          }
          prev = buckets[b].max;
        }
      });
      const mx = Math.max(...counts, 1);
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto 8px", padding: "8px 14px" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, fontWeight: 700, color: C.brown, marginBottom: 6 } }, "\u{1F4CA}", " Pending Age Distribution"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-end", gap: 6, height: 40 } }, buckets.map((b, i) => /* @__PURE__ */ React.createElement("div", { key: b.l, style: { flex: 1, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { background: b.c, height: Math.max(4, Math.round(counts[i] / mx * 32)), borderRadius: "4px 4px 0 0", margin: "0 auto", width: "80%", transition: "height 0.3s" } }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, fontWeight: 700, color: b.c, marginTop: 2 } }, counts[i]), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 8, color: C.brown } }, b.l)))));
    })(), sr && items.length > 0 && (() => {
      const key = `item_trend_${sr}`;
      const done = itemStats.done;
      try {
        const hist = JSON.parse(localStorage.getItem(key) || "[]");
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        if (!hist.length || hist[hist.length - 1].d !== today) hist.push({ d: today, v: done });
        else hist[hist.length - 1].v = done;
        if (hist.length > 14) hist.splice(0, hist.length - 14);
        localStorage.setItem(key, JSON.stringify(hist));
        if (hist.length >= 2) {
          const max = Math.max(...hist.map((h) => h.v), 1);
          return /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto 6px", display: "flex", alignItems: "flex-end", gap: 2, height: 20, padding: "0 14px" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown, marginRight: 4 } }, "\u{1F4C8}"), hist.map((h, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { flex: 1, background: `linear-gradient(to top, ${C.teal}, ${C.green})`, borderRadius: "2px 2px 0 0", height: `${Math.max(2, Math.round(h.v / max * 18))}px`, opacity: i === hist.length - 1 ? 1 : 0.5 }, title: `${h.d}: ${h.v} done` })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown, marginLeft: 4 } }, done));
        }
      } catch (e) {
      }
      return null;
    })(), items.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto 10px", display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" } }, ["all", "pending", "in_progress", "completed", "archived"].map((f2) => /* @__PURE__ */ React.createElement("button", { key: f2, onClick: () => setItemFilter(f2), style: {
      padding: "5px 14px",
      borderRadius: 8,
      fontSize: 12,
      fontWeight: 700,
      fontFamily: "'Bangers', cursive",
      letterSpacing: 1,
      cursor: "pointer",
      background: itemFilter === f2 ? C.orange : C.cream,
      color: itemFilter === f2 ? C.white : C.darkBrown,
      border: `2px solid ${C.darkBrown}`,
      transition: "all 0.15s"
    } }, f2 === "all" ? "All" : f2 === "in_progress" ? "Active" : f2.charAt(0).toUpperCase() + f2.slice(1))), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown, alignSelf: "center" } }, "|"), ["all", "manual", "audio", "error_detected"].map((s) => /* @__PURE__ */ React.createElement("button", { key: s, onClick: () => setSourceFilter(s), style: {
      padding: "4px 10px",
      borderRadius: 8,
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "'Fredoka', sans-serif",
      cursor: "pointer",
      background: sourceFilter === s ? C.teal : C.cream,
      color: sourceFilter === s ? C.white : C.darkBrown,
      border: `2px solid ${C.darkBrown}`,
      transition: "all 0.15s"
    } }, s === "all" ? "Any Source" : s === "error_detected" ? "Error" : s.charAt(0).toUpperCase() + s.slice(1))), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown, alignSelf: "center" } }, "|"), ["all", "critical", "high", "medium", "low"].map((p) => /* @__PURE__ */ React.createElement("button", { key: p, onClick: () => setPriorityFilter(p), style: {
      padding: "4px 10px",
      borderRadius: 8,
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "'Fredoka', sans-serif",
      cursor: "pointer",
      background: priorityFilter === p ? C.orange : C.cream,
      color: priorityFilter === p ? C.white : C.darkBrown,
      border: `2px solid ${C.darkBrown}`,
      transition: "all 0.15s"
    } }, p === "all" ? "Any Priority" : p.charAt(0).toUpperCase() + p.slice(1)))), selectedItems.size > 0 && /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto 10px", display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", background: C.yellow, borderRadius: 10, padding: "8px 12px", border: `2px solid ${C.darkBrown}` } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 700, alignSelf: "center" } }, selectedItems.size, " selected:"), /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, onClick: () => bulkUpdateItems("change_priority", "high"), style: { fontSize: 11, padding: "4px 10px" } }, "Priority: High"), /* @__PURE__ */ React.createElement(Btn, { bg: "#A0ADB5", onClick: () => bulkUpdateItems("change_status", "pending"), style: { fontSize: 11, padding: "4px 10px" } }, "Re-queue"), /* @__PURE__ */ React.createElement(Btn, { bg: C.red, onClick: () => bulkUpdateItems("delete"), style: { fontSize: 11, padding: "4px 10px" } }, "Delete"), /* @__PURE__ */ React.createElement("button", { onClick: () => setSelectedItems(/* @__PURE__ */ new Set()), style: { background: "none", border: "none", cursor: "pointer", fontSize: 14 } }, "\u2716")), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto" } }, items.length === 0 ? /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { textAlign: "center", padding: 40 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 36, marginBottom: 8 } }, "\u{1F3DC}\uFE0F"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 } }, "The board's empty, partner"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: C.brown } }, "Post a bounty above to get the swarm working!")) : (() => {
      return filteredItems.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 6 } }, /* @__PURE__ */ React.createElement("button", { onClick: toggleSelectAll, style: { fontSize: 11, color: C.brown, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" } }, selectedItems.size === filteredItems.length ? "Deselect All" : `Select All (${filteredItems.length})`));
    })(), (groupByType ? [...filteredItems].sort((a, b) => (a.type || "feature").localeCompare(b.type || "feature")) : filteredItems).map((it, idx, arr) => {
      const typeEmojis = { issue: "\u{1F41B}", feature: "\u2728", bug: "\u{1F41B}", task: "\u{1F4CB}", enhancement: "\u{1F680}" };
      const groupHeader = groupByType && (idx === 0 || (arr[idx - 1].type || "feature") !== (it.type || "feature")) ? /* @__PURE__ */ React.createElement("div", { key: `gh-${it.type}`, style: { fontSize: 13, fontWeight: 700, fontFamily: "'Bangers', cursive", letterSpacing: 1, color: C.brown, padding: "8px 0 4px", borderBottom: `2px solid ${C.darkBrown}22`, marginBottom: 4 } }, typeEmojis[it.type] || "\u{1F4CB}", " ", (it.type || "feature").toUpperCase(), " (", arr.filter((x) => (x.type || "feature") === (it.type || "feature")).length, ")") : null;
      const prioConfig = {
        critical: { bg: C.red, icon: "\u{1F534}", label: "CRITICAL", size: 13 },
        high: { bg: C.orange, icon: "\u{1F7E0}", label: "HIGH", size: 12 },
        medium: { bg: C.teal, icon: "\u{1F535}", label: "MEDIUM", size: 11 },
        low: { bg: "#A0ADB5", icon: "\u26AA", label: "LOW", size: 11 }
      }[it.priority] || { bg: "#ccc", icon: "", label: it.priority, size: 11 };
      if (compactItems) return /* @__PURE__ */ React.createElement(React.Fragment, { key: it.id }, groupHeader, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: it.status === "completed" ? C.lightTeal : C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 6, marginBottom: 3, fontSize: 11 } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: selectedItems.has(it.id), onChange: () => toggleSelectItem(it.id), style: { cursor: "pointer", accentColor: C.orange } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14 } }, it.type === "issue" ? "\u{1F41B}" : "\u{1F31F}"), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, it.title), /* @__PURE__ */ React.createElement("span", { style: { background: prioConfig.bg, color: C.white, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 } }, prioConfig.label), /* @__PURE__ */ React.createElement("span", { style: { background: it.status === "completed" ? C.green : it.status === "in_progress" ? C.orange : "#ccc", color: C.white, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700 } }, it.status), it.status === "pending" && /* @__PURE__ */ React.createElement("button", { onClick: () => quickStatusChange(it.id, "completed"), style: { background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.green, padding: 0 } }, "\u2705"), /* @__PURE__ */ React.createElement("button", { onClick: () => deleteItem(it.id), style: { background: "none", border: "none", cursor: "pointer", fontSize: 12, color: C.red, padding: 0 } }, "\u2716")));
      return /* @__PURE__ */ React.createElement(React.Fragment, { key: it.id }, groupHeader, /* @__PURE__ */ React.createElement("div", { className: "bounty-poster", style: {
        background: it.status === "completed" ? `linear-gradient(135deg, ${C.lightTeal} 0%, #D4F4E8 100%)` : `linear-gradient(135deg, #FFF8E7 0%, #F5E6C8 100%)`,
        border: `3px solid ${C.darkBrown}`,
        borderLeft: `5px solid ${prioConfig.bg}`,
        borderRadius: 12,
        padding: "14px 16px",
        marginBottom: 10,
        boxShadow: "0 2px 4px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.06), 3px 3px 0 #3D2B1F",
        position: "relative",
        transform: idx % 3 === 1 ? "rotate(0.3deg)" : idx % 3 === 2 ? "rotate(-0.3deg)" : "none"
      } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: -1, right: 12, background: prioConfig.bg, color: C.white, fontFamily: "'Bangers', cursive", fontSize: prioConfig.size, fontWeight: 700, letterSpacing: 1.5, padding: "4px 12px 6px", borderRadius: "0 0 8px 8px", border: `2px solid ${C.darkBrown}`, borderTop: "none", boxShadow: "0 2px 4px rgba(0,0,0,.15)" } }, prioConfig.icon, " ", prioConfig.label), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-start", gap: 10, paddingRight: 80 } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: selectedItems.has(it.id), onChange: () => toggleSelectItem(it.id), style: { marginTop: 12, cursor: "pointer", accentColor: C.orange, flexShrink: 0 } }), /* @__PURE__ */ React.createElement("div", { style: { width: 40, height: 40, borderRadius: 10, background: it.type === "issue" ? "#FFE0E0" : "#FFF3CD", border: `2px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 } }, it.type === "issue" ? "\u{1F41B}" : "\u{1F31F}"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, editingItem?.id === it.id ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 4 } }, /* @__PURE__ */ React.createElement(
        "input",
        {
          value: editingItem.title,
          onChange: (e) => setEditingItem((prev) => ({ ...prev, title: e.target.value })),
          style: { fontFamily: "'Bangers', cursive", fontSize: 15, letterSpacing: 1, padding: "4px 8px", border: `2px solid ${C.teal}`, borderRadius: 6, background: C.white, width: "100%", boxSizing: "border-box" },
          onKeyDown: (e) => {
            if (e.key === "Enter") saveItemEdit();
            if (e.key === "Escape") setEditingItem(null);
          },
          autoFocus: true
        }
      ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4 } }, /* @__PURE__ */ React.createElement(
        "select",
        {
          value: editingItem.priority,
          onChange: (e) => setEditingItem((prev) => ({ ...prev, priority: e.target.value })),
          style: { fontSize: 11, padding: "2px 6px", borderRadius: 4, border: `1px solid ${C.darkBrown}` }
        },
        ["critical", "high", "medium", "low"].map((p) => /* @__PURE__ */ React.createElement("option", { key: p, value: p }, p))
      ), /* @__PURE__ */ React.createElement("button", { onClick: saveItemEdit, style: { fontSize: 10, padding: "2px 10px", background: C.green, color: C.white, border: `1px solid ${C.darkBrown}`, borderRadius: 4, cursor: "pointer", fontWeight: 700 } }, "Save"), /* @__PURE__ */ React.createElement("button", { onClick: () => setEditingItem(null), style: { fontSize: 10, padding: "2px 8px", background: C.cream, border: `1px solid ${C.darkBrown}`, borderRadius: 4, cursor: "pointer" } }, "Cancel"))) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 17, letterSpacing: 1, marginBottom: 2, lineHeight: 1.2 } }, it.title), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.brown, lineHeight: 1.4 } }, it.description)))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4 } }, it.status === "pending" && /* @__PURE__ */ React.createElement("button", { onClick: () => quickStatusChange(it.id, "completed"), style: { background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.green, padding: "2px 6px", borderRadius: 6, opacity: 0.6, transition: "opacity 0.2s" }, onMouseOver: (e) => e.target.style.opacity = 1, onMouseOut: (e) => e.target.style.opacity = 0.6, title: "Mark as completed" }, "\u2705"), it.status === "completed" && /* @__PURE__ */ React.createElement("button", { onClick: () => retryItem(it.id), style: { background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.orange, padding: "2px 6px", borderRadius: 6, opacity: 0.6, transition: "opacity 0.2s" }, onMouseOver: (e) => e.target.style.opacity = 1, onMouseOut: (e) => e.target.style.opacity = 0.6, title: "Retry this item" }, "\u{1F504}"), /* @__PURE__ */ React.createElement("button", { onClick: () => setEditingItem({ id: it.id, title: it.title, priority: it.priority }), style: { background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.teal, padding: "2px 6px", borderRadius: 6, opacity: 0.6, transition: "opacity 0.2s" }, onMouseOver: (e) => e.target.style.opacity = 1, onMouseOut: (e) => e.target.style.opacity = 0.6, title: "Edit item" }, "\u270F\uFE0F"), /* @__PURE__ */ React.createElement("button", { onClick: () => deleteItem(it.id), style: { background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.red, padding: "2px 6px", borderRadius: 6, opacity: 0.6, transition: "opacity 0.2s" }, onMouseOver: (e) => e.target.style.opacity = 1, onMouseOut: (e) => e.target.style.opacity = 0.6, title: "Delete this item" }, "\u2716")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, it.source && it.source !== "manual" && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown, background: C.lightTeal, padding: "2px 6px", borderRadius: 4, fontWeight: 600 } }, it.source === "audio" ? "\u{1F3A4}" : it.source === "error_detected" ? "\u{1F41B}" : "", " ", it.source), it.depends_on && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: "#7E57C2", background: "#E8D5F5", padding: "2px 6px", borderRadius: 4, fontWeight: 600 } }, "\u{1F517}", " dep: ", it.depends_on), it.status === "pending" && (() => {
        const done = items.filter((i) => i.status === "completed" && i.completed_at && i.created_at);
        if (done.length < 2) return null;
        const avgMs = done.reduce((s, i) => s + (new Date(i.completed_at) - new Date(i.created_at)), 0) / done.length;
        const hrs = Math.round(avgMs / 36e5);
        return hrs > 0 ? /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.orange, background: C.lightOrange, padding: "2px 6px", borderRadius: 4, fontWeight: 600 } }, "\u23F1\uFE0F", " ~", hrs < 24 ? `${hrs}h` : `${Math.round(hrs / 24)}d`) : null;
      })(), it.created_at && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown, opacity: 0.6 } }, it.created_at.slice(0, 10), it.status === "pending" && (() => {
        const days = Math.floor((Date.now() - new Date(it.created_at).getTime()) / 864e5);
        return days > 7 ? /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 3, color: C.red, fontWeight: 700 } }, "\u23F3", days, "d") : days >= 1 ? /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 3, color: C.orange } }, days, "d") : null;
      })()), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right" } }, /* @__PURE__ */ React.createElement("div", { style: { background: it.status === "completed" ? C.green : it.status === "in_progress" ? C.orange : "rgba(93,64,55,0.2)", border: `2px solid ${C.darkBrown}`, borderRadius: 8, padding: "3px 12px", fontSize: 11, fontWeight: 700, color: it.status === "completed" || it.status === "in_progress" ? C.white : C.darkBrown, fontFamily: "'Bangers', cursive", letterSpacing: 1 } }, it.status === "completed" ? "\u2705 Done" : it.status === "in_progress" ? "\u26A1 In Progress" : "\u23F3 Pending"), it.status === "pending" && it.created_at && (() => {
        const d = Math.floor((Date.now() - new Date(it.created_at).getTime()) / 864e5);
        const pct = Math.min(100, d * 7);
        const c = d > 14 ? C.red : d > 7 ? C.orange : C.teal;
        return /* @__PURE__ */ React.createElement("div", { style: { width: 60, height: 3, background: `${c}33`, borderRadius: 2, marginTop: 3, marginLeft: "auto" } }, /* @__PURE__ */ React.createElement("div", { style: { width: `${pct}%`, height: "100%", background: c, borderRadius: 2, transition: "width 0.3s" } }));
      })())))));
    }))), tab === "plan" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.lightTeal} 0%, #9DE4ED 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" } }, "Build Plan"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 16 } }, "The step-by-step blueprint your swarm is following"), plan.length > 0 && (() => {
      const done = planStats.done;
      const totalCost2 = plan.reduce((s, p) => s + (p.cost_usd || 0), 0);
      const totalDur = plan.reduce((s, p) => s + (p.duration_sec || 0), 0);
      const remaining = plan.length - done;
      const avgDur = done > 0 ? totalDur / done : 0;
      const avgCost = done > 0 ? totalCost2 / done : 0;
      const etaMins = remaining > 0 && avgDur > 0 ? Math.round(remaining * avgDur / 60) : 0;
      return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 12 } }, /* @__PURE__ */ React.createElement(ProgressRing, { done, total: plan.length, size: 48, strokeWidth: 4, color: done === plan.length ? C.green : C.teal }), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: C.brown, fontWeight: 600 } }, done, "/", plan.length, " steps done", totalCost2 > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, " ", "\xB7", " $", totalCost2.toFixed(2), " total cost"), totalDur > 0 && /* @__PURE__ */ React.createElement(React.Fragment, null, " ", "\xB7", " ", Math.round(totalDur / 60), "m total time"), (() => {
        const tp = plan.reduce((a, s) => a + (s.tests_passed || 0), 0);
        const tw = plan.reduce((a, s) => a + (s.tests_written || 0), 0);
        return tw > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, " ", "\xB7", " ", tp, "/", tw, " tests passed") : null;
      })(), etaMins > 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, marginTop: 2 } }, "\u23F3", " ~", etaMins, "m ETA ($", (remaining * avgCost).toFixed(2), " est.)")));
    })(), planStats.inProgress > 0 && (() => {
      const stale = plan.filter((s) => s.status === "in_progress" && s.started_at && Date.now() - new Date(s.started_at).getTime() > 36e5);
      if (stale.length === 0) return null;
      return /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 10 } }, /* @__PURE__ */ React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: 4, background: "#FFEBEE", border: `2px solid ${C.red}`, borderRadius: 12, padding: "4px 12px", fontSize: 11, fontWeight: 700, color: C.red } }, "\u26A0\uFE0F", " ", stale.length, " step", stale.length !== 1 ? "s" : "", " stuck in progress for 1+ hour"));
    })(), plan.length > 3 && /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto 10px", display: "flex", justifyContent: "center", gap: 6 } }, /* @__PURE__ */ React.createElement(
      Inp,
      {
        placeholder: "Search plan steps...",
        value: planSearch,
        onChange: (e) => setPlanSearch(e.target.value),
        style: { maxWidth: 320, fontSize: 12, padding: "6px 12px" }
      }
    ), /* @__PURE__ */ React.createElement("button", { onClick: () => setPlanCollapsed((c) => !c), style: { padding: "4px 10px", borderRadius: 8, fontSize: 10, fontWeight: 700, fontFamily: "'Fredoka', sans-serif", cursor: "pointer", background: planCollapsed ? C.teal : C.cream, color: planCollapsed ? C.white : C.brown, border: `2px solid ${C.darkBrown}`, transition: "all 0.15s", whiteSpace: "nowrap" } }, planCollapsed ? "Expand All" : "Collapse"), [{ l: "All", v: 0 }, { l: ">30s", v: 30 }, { l: ">60s", v: 60 }, { l: ">120s", v: 120 }].map((f2) => /* @__PURE__ */ React.createElement("button", { key: f2.v, onClick: () => setPlanDurFilter(f2.v), style: { padding: "4px 8px", borderRadius: 8, fontSize: 9, fontWeight: 700, fontFamily: "'Fredoka', sans-serif", cursor: "pointer", background: planDurFilter === f2.v ? C.orange : C.cream, color: planDurFilter === f2.v ? C.white : C.brown, border: `2px solid ${C.darkBrown}`, transition: "all 0.15s", whiteSpace: "nowrap" } }, f2.l))), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto" } }, plan.length === 0 ? /* @__PURE__ */ React.createElement(Card, { style: { textAlign: "center", padding: 40, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 36, marginBottom: 8 } }, "\u{1F5FA}\uFE0F"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 } }, "No plan drawn up yet"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: C.brown } }, "Add items to the Bounty Board first -- the swarm will draw up a plan!")) : (() => {
      const maxCost = Math.max(...plan.map((p) => p.cost_usd || 0), 1e-3);
      const completedSteps = plan.filter((p) => p.status === "completed" && p.duration_sec > 0);
      const avgDur = completedSteps.length ? completedSteps.reduce((a, p) => a + p.duration_sec, 0) / completedSteps.length : 0;
      const firstPendingId = plan.find((s) => s.status !== "completed")?.id;
      const searchedPlan = (planSearch ? plan.filter((s) => (s.description || "").toLowerCase().includes(planSearch.toLowerCase())) : plan).filter((s) => planDurFilter <= 0 || (s.duration_sec || 0) >= planDurFilter);
      return searchedPlan.map((s, i) => {
        const done = s.status === "completed";
        const isNextStep = s.id === firstPendingId;
        return /* @__PURE__ */ React.createElement("div", { key: s.id, ref: isNextStep ? (el) => {
          if (el && tab === "plan") setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
        } : void 0, style: { display: "flex", gap: 12, marginBottom: 8, outline: isNextStep ? `2px solid ${C.orange}44` : "none", borderRadius: 8 } }, !done && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", justifyContent: "center", opacity: 0.3, cursor: "grab", userSelect: "none", fontSize: 14, letterSpacing: 2, color: C.darkBrown, lineHeight: 1 }, title: "Drag to reorder" }, "\u2807"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { width: 36, height: 36, borderRadius: "50%", background: done ? `linear-gradient(135deg, ${C.green}, #27ae60)` : C.cream, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontFamily: "'Bangers',cursive", flexShrink: 0, color: done ? C.white : C.darkBrown, boxShadow: done ? `0 2px 8px ${C.green}44` : "none" } }, done ? "\u2713" : s.step_order || i + 1), i < searchedPlan.length - 1 && /* @__PURE__ */ React.createElement("div", { style: { width: 2, flex: 1, background: done ? C.green : `${C.darkBrown}33`, marginTop: 4 } })), /* @__PURE__ */ React.createElement(Card, { bg: done ? C.lightTeal : C.white, style: { flex: 1, padding: 12, marginBottom: 0, background: isNextStep ? `linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)` : done ? `linear-gradient(135deg, ${C.lightTeal} 0%, #D4F4E8 100%)` : `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, s.description?.length > 120 && !planCollapsed ? /* @__PURE__ */ React.createElement("details", null, /* @__PURE__ */ React.createElement("summary", { style: { fontSize: 13, fontWeight: done ? 400 : 600, lineHeight: 1.4, cursor: "pointer" } }, s.description.slice(0, 120), "..."), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.brown, lineHeight: 1.4, marginTop: 4 } }, s.description)) : /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: done ? 400 : 600, lineHeight: 1.4 } }, planCollapsed && s.description?.length > 80 ? s.description.slice(0, 80) + "..." : s.description), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" } }, s.agent_type && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, background: C.lightOrange, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600 } }, "\u{1F920}", " ", s.agent_type), done && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, background: C.green, color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600 } }, "\u2705", " Tests: ", s.tests_passed, "/", s.tests_written), done && s.model && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, background: `${C.teal}22`, border: `2px solid ${C.teal}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600, color: C.teal } }, "\u{1F916}", " ", s.model.replace("claude-", "").replace("-20251001", "")), done && s.cost_usd > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, background: C.yellow, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600 } }, "\u{1F4B0}", " $", s.cost_usd.toFixed(3)), done && s.duration_sec > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, background: C.lightTeal, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600 } }, "\u23F1\uFE0F", " ", Math.round(s.duration_sec), "s"), done && /* @__PURE__ */ React.createElement("button", { onClick: () => resetStep(s.id), style: { fontSize: 9, background: C.cream, border: `1px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontWeight: 600, opacity: 0.6 }, title: "Reset step to pending for re-execution" }, "\u{1F504}", " Retry"), done && s.cost_usd > 0 && /* @__PURE__ */ React.createElement("div", { style: { flex: "1 1 100%", height: 4, background: C.cream, borderRadius: 2, overflow: "hidden", marginTop: 4 } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", background: `linear-gradient(90deg, ${C.teal}, ${s.cost_usd / maxCost > 0.7 ? C.orange : C.green})`, width: `${Math.min(100, s.cost_usd / maxCost * 100)}%`, borderRadius: 2, transition: "width .3s" } })), !done && avgDur > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, background: `${C.teal}22`, border: `2px solid ${C.teal}`, borderRadius: 6, padding: "2px 8px", fontWeight: 600, color: C.teal } }, "\u23F3", " ~", avgDur >= 60 ? `${Math.round(avgDur / 60)}m` : `${Math.round(avgDur)}s`, " est"), !done && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", display: "flex", gap: 2 } }, i > 0 && /* @__PURE__ */ React.createElement("button", { onClick: () => reorderStep(s.id, "up"), style: { background: C.cream, border: `1px solid ${C.darkBrown}`, borderRadius: 4, cursor: "pointer", fontSize: 10, padding: "1px 6px" }, title: "Move up" }, "\u25B2"), i < plan.length - 1 && /* @__PURE__ */ React.createElement("button", { onClick: () => reorderStep(s.id, "down"), style: { background: C.cream, border: `1px solid ${C.darkBrown}`, borderRadius: 4, cursor: "pointer", fontSize: 10, padding: "1px 6px" }, title: "Move down" }, "\u25BC")))));
      });
    })()), (() => {
      const models = {};
      plan.filter((s) => s.status === "completed" && s.model).forEach((s) => {
        const m = s.model.replace("claude-", "").replace("-20251001", "").replace("-20250514", "");
        models[m] = (models[m] || 0) + 1;
      });
      const entries = Object.entries(models).sort((a, b) => b[1] - a[1]);
      if (entries.length < 2) return null;
      const total = entries.reduce((s, e) => s + e[1], 0);
      return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginTop: 8, marginBottom: 4 } }, entries.map(([m, c]) => /* @__PURE__ */ React.createElement("span", { key: m, style: { fontSize: 10, padding: "2px 8px", borderRadius: 8, background: `${C.teal}22`, border: `1px solid ${C.teal}44`, fontWeight: 600, color: C.teal } }, "\u{1F916}", " ", m, ": ", c, " (", Math.round(c / total * 100), "%)")));
    })(), (() => {
      const completed = plan.filter((s) => s.status === "completed" && s.duration_sec > 0);
      if (completed.length < 2) return null;
      const durations = completed.map((s) => s.duration_sec);
      const maxDur = Math.max(...durations);
      const bucketCount = Math.min(8, completed.length);
      const bucketSize = maxDur / bucketCount;
      const buckets = Array(bucketCount).fill(0);
      durations.forEach((d) => {
        const idx = Math.min(Math.floor(d / bucketSize), bucketCount - 1);
        buckets[idx]++;
      });
      const maxBucket = Math.max(...buckets, 1);
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 680, margin: "16px auto 0", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" } }, "Step Duration Distribution"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-end", gap: 2, height: 60 } }, buckets.map((count, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { width: "100%", background: `linear-gradient(180deg, ${C.teal}, ${C.green})`, borderRadius: "4px 4px 0 0", height: `${count / maxBucket * 50}px`, transition: "height 0.3s", minHeight: count > 0 ? 4 : 0 } }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 8, color: C.brown, marginTop: 2 } }, Math.round(i * bucketSize), "-", Math.round((i + 1) * bucketSize), "s")))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", fontSize: 10, color: C.brown, marginTop: 4 } }, "Avg: ", Math.round(durations.reduce((a, b) => a + b, 0) / durations.length), "s | Min: ", Math.round(Math.min(...durations)), "s | Max: ", Math.round(maxDur), "s"));
    })(), (() => {
      const withCost = plan.filter((s) => s.agent_type && s.cost_usd > 0);
      if (withCost.length < 2) return null;
      const costByAgent = {};
      withCost.forEach((s) => {
        costByAgent[s.agent_type] = (costByAgent[s.agent_type] || 0) + s.cost_usd;
      });
      const agents2 = Object.entries(costByAgent).sort((a, b) => b[1] - a[1]);
      const totalCost2 = agents2.reduce((s, a) => s + a[1], 0);
      const agentColors = [C.teal, C.orange, C.green, "#7E57C2", C.red, "#FF8F00"];
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 680, margin: "16px auto 0", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" } }, "Cost by Agent Type"), agents2.map(([agent, cost], i) => {
        const pct = Math.round(cost / totalCost2 * 100);
        return /* @__PURE__ */ React.createElement("div", { key: agent, style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, minWidth: 80, color: C.darkBrown } }, agent), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, height: 12, background: `${C.darkBrown}08`, borderRadius: 6, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", background: agentColors[i % agentColors.length], width: `${pct}%`, borderRadius: 6, transition: "width 0.3s" } })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown, minWidth: 60, textAlign: "right" } }, "$", cost.toFixed(3), " (", pct, "%)"));
      }), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", fontSize: 10, color: C.brown, marginTop: 4 } }, "Total: $", totalCost2.toFixed(3), " across ", agents2.length, " agent types"));
    })(), (() => {
      const completed = plan.filter((s) => s.status === "completed" && s.completed_at && s.duration_sec > 0);
      if (completed.length < 2) return null;
      const times = completed.map((s) => (/* @__PURE__ */ new Date(s.completed_at + "Z")).getTime());
      const durations = completed.map((s) => s.duration_sec * 1e3);
      const starts = times.map((t, i) => t - durations[i]);
      const minStart = Math.min(...starts);
      const maxEnd = Math.max(...times);
      const range = maxEnd - minStart || 1;
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 680, margin: "16px auto 0", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" } }, "Execution Timeline"), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, completed.map((s, i) => {
        const start = starts[i];
        const end = times[i];
        const left = (start - minStart) / range * 100;
        const width = Math.max((end - start) / range * 100, 1);
        return /* @__PURE__ */ React.createElement("div", { key: s.id, style: { display: "flex", alignItems: "center", gap: 4, marginBottom: 3 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown, minWidth: 20, textAlign: "right" } }, i + 1), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, height: 12, position: "relative", background: `${C.darkBrown}08`, borderRadius: 4 } }, /* @__PURE__ */ React.createElement(
          "div",
          {
            style: { position: "absolute", left: `${left}%`, width: `${width}%`, height: "100%", background: `linear-gradient(90deg, ${C.teal}, ${C.green})`, borderRadius: 4, transition: "all 0.3s" },
            title: `Step ${i + 1}: ${s.description?.slice(0, 40)} (${Math.round(s.duration_sec)}s)`
          }
        )));
      })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 9, color: C.brown, marginTop: 4 } }, /* @__PURE__ */ React.createElement("span", null, new Date(minStart).toLocaleTimeString()), /* @__PURE__ */ React.createElement("span", null, Math.round((maxEnd - minStart) / 6e4), "min total span"), /* @__PURE__ */ React.createElement("span", null, new Date(maxEnd).toLocaleTimeString())));
    })(), (() => {
      const costed = plan.filter((s) => s.status === "completed" && s.cost_usd > 0);
      if (costed.length < 2) return null;
      const totalCost2 = costed.reduce((a, s) => a + s.cost_usd, 0);
      const colors = [C.teal, C.orange, C.green, C.red, "#7E57C2", C.yellow, "#FF6B6B", "#4ECDC4", "#45B7D1", C.brown];
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 680, margin: "16px auto 0", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1.5, marginBottom: 8, textAlign: "center" } }, "Cost Breakdown ($", totalCost2.toFixed(3), " total)"), /* @__PURE__ */ React.createElement("div", { style: { position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", height: 20, borderRadius: 10, overflow: "hidden", border: `2px solid ${C.darkBrown}` } }, costed.map((s, i) => /* @__PURE__ */ React.createElement(
        "div",
        {
          key: s.id,
          style: { width: `${s.cost_usd / totalCost2 * 100}%`, height: "100%", background: colors[i % colors.length], transition: "width 0.3s" },
          title: `Step ${s.step_order}: $${s.cost_usd.toFixed(3)} (${Math.round(s.cost_usd / totalCost2 * 100)}%)`
        }
      ))), budgetLimit > 0 && (() => {
        const budgetPct = Math.min(budgetLimit / (totalCost2 * 1.5) * 100, 100);
        const overBudget = totalCost2 > budgetLimit;
        return /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: `${budgetPct}%`, top: -4, bottom: -4, width: 2, background: overBudget ? C.red : C.green, zIndex: 2 } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: -14, left: -16, fontSize: 8, fontWeight: 700, color: overBudget ? C.red : C.green, whiteSpace: "nowrap" } }, "$", budgetLimit, " limit"));
      })()), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, justifyContent: "center" } }, costed.slice(0, 8).map((s, i) => /* @__PURE__ */ React.createElement("span", { key: s.id, style: { fontSize: 9, display: "flex", alignItems: "center", gap: 3 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: 2, background: colors[i % colors.length], display: "inline-block" } }), "Step ", s.step_order, ": $", s.cost_usd.toFixed(3)))));
    })()), tab === "audio" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.cream} 0%, #F0E2CA 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" } }, "Voice Review"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 16 } }, "Record or upload audio for ", repo?.name || "your repo", ". Whisper transcribes, items auto-extracted."), /* @__PURE__ */ React.createElement(Card, { bg: C.yellow, style: { maxWidth: 520, margin: "0 auto 20px", textAlign: "center", padding: 20, background: `linear-gradient(135deg, ${C.yellow} 0%, #FFD54F 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 12 } }, !recording ? /* @__PURE__ */ React.createElement(Btn, { bg: C.red, onClick: startRecording, style: { fontSize: 16, padding: "12px 24px" } }, "\u{1F534}", " Record") : /* @__PURE__ */ React.createElement(Btn, { bg: C.red, onClick: stopRecording, style: { animation: "wiggle 0.5s infinite", fontSize: 16, padding: "12px 24px" } }, "\u23F9", " Stop ", fmt(recTime)), /* @__PURE__ */ React.createElement("label", null, /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, as: "span", style: { fontSize: 16, padding: "12px 24px" } }, "\u{1F4C1}", " Upload File"), /* @__PURE__ */ React.createElement("input", { type: "file", accept: "audio/*,.mp3,.wav,.m4a,.ogg,.webm", onChange: uploadAudio, style: { display: "none" } })))), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 520, margin: "0 auto" } }, audio.length === 0 ? /* @__PURE__ */ React.createElement(Card, { style: { textAlign: "center", padding: 30, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 32, marginBottom: 6 } }, "\u{1F3A4}"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 4 } }, "No recordings yet"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.brown } }, "Hit Record or Upload to feed audio to the swarm.")) : audio.map((a) => /* @__PURE__ */ React.createElement(Card, { key: a.id, style: { marginBottom: 8, padding: 12, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 36, height: 36, borderRadius: "50%", background: a.status === "processed" ? C.green : a.status === "transcribed" ? C.orange : C.cream, border: `2px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 } }, "\u{1F3A4}"), /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 13, fontWeight: 600 } }, a.filename?.split("/").pop()), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, background: a.status === "processed" ? C.green : a.status === "transcribed" ? C.orange : "#ccc", color: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 10px", fontWeight: 600 } }, a.status)), a.transcript && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.brown, background: C.cream, borderRadius: 8, padding: 8, marginTop: 6, maxHeight: 80, overflow: "auto", lineHeight: 1.4, border: `1px solid ${C.darkBrown}22` } }, a.transcript.slice(0, 300)))))), tab === "agents" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.orange} 0%, #E8851A 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", color: C.white, textShadow: `2px 2px 0 ${C.darkBrown}`, marginBottom: 6, letterSpacing: 3 } }, "The Crew"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.cream, marginBottom: 16 } }, "Your autonomous agents, saddled up and ready to ride"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10, maxWidth: 750, margin: "0 auto" } }, agents.length === 0 ? /* @__PURE__ */ React.createElement(Card, { style: { gridColumn: "1/-1", textAlign: "center", padding: 40, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 40, marginBottom: 8 } }, "\u{1F3DC}\uFE0F"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 22, letterSpacing: 1, marginBottom: 4 } }, "The crew's on break"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: C.brown } }, "Start a repo to see them ride!")) : agents.map((a, i) => /* @__PURE__ */ React.createElement(Card, { key: a.id || i, bg: C.white, style: { padding: 12, textAlign: "center", background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)`, position: "relative" } }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", top: 4, right: 6, fontSize: 8, fontWeight: 700, padding: "1px 6px", borderRadius: 8, background: a.task ? C.green : "#aaa", color: C.white } }, a.task ? "WORKING" : "IDLE"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 32, animation: a.task ? "bounce 2s infinite" : "none", animationDelay: `${i * 0.2}s` } }, "\u{1F920}"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers',cursive", fontSize: 17, letterSpacing: 1, marginTop: 2 } }, a.agent_type), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: C.brown, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, a.agent_id), a.task && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, marginTop: 4, background: C.lightOrange, borderRadius: 6, padding: "3px 6px", border: `1px solid ${C.orange}` } }, a.task?.slice(0, 40))))), plan.filter((s) => s.model).length > 0 && (() => {
      const modelCounts = {};
      plan.forEach((s) => {
        if (s.model) modelCounts[s.model] = (modelCounts[s.model] || 0) + 1;
      });
      const models = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]);
      const total = models.reduce((s, m) => s + m[1], 0);
      const modelColors = [C.teal, C.orange, C.green, "#7E57C2", C.red, C.brown];
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 650, margin: "16px auto 0", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 10, textAlign: "center" } }, "Model Distribution"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 8 } }, models.map(([model, count], i) => /* @__PURE__ */ React.createElement("div", { key: model, style: { width: `${count / total * 100}%`, background: modelColors[i % modelColors.length], transition: "width 0.3s" }, title: `${model}: ${count} steps (${Math.round(count / total * 100)}%)` }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" } }, models.map(([model, count], i) => /* @__PURE__ */ React.createElement("span", { key: model, style: { fontSize: 10, display: "flex", alignItems: "center", gap: 3 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: 2, background: modelColors[i % modelColors.length], display: "inline-block" } }), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600 } }, model.replace("claude-", "").replace("-20251001", "")), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown } }, "(", count, ")")))));
    })(), agentStats?.agents?.length > 1 && (() => {
      const sorted = [...agentStats.agents].sort((a, b) => b.completed - a.completed);
      const medals = ["\u{1F947}", "\u{1F948}", "\u{1F949}"];
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 650, margin: "16px auto 0", padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, #FFF8E7 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 10, textAlign: "center" } }, "Agent Leaderboard"), sorted.slice(0, 5).map((a, i) => {
        const maxCompleted = sorted[0].completed || 1;
        return /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18, minWidth: 28, textAlign: "center" } }, medals[i] || `#${i + 1}`), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 700, minWidth: 80 } }, a.agent_type), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, height: 16, background: `${C.darkBrown}08`, borderRadius: 8, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", background: `linear-gradient(90deg, ${i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : C.teal}, ${i === 0 ? "#FFA000" : i === 1 ? "#A0A0A0" : C.green})`, width: `${a.completed / maxCompleted * 100}%`, borderRadius: 8, transition: "width 0.3s" } })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, fontWeight: 700, minWidth: 30, color: C.brown } }, a.completed));
      }));
    })(), agentStats?.agents?.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 650, margin: "16px auto 0", padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 10, textAlign: "center" } }, "Agent Performance"), /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: `2px solid ${C.darkBrown}` } }, /* @__PURE__ */ React.createElement("th", { style: { padding: "6px", textAlign: "left" } }, "Type"), /* @__PURE__ */ React.createElement("th", { style: { padding: "6px", textAlign: "right" } }, "Steps"), /* @__PURE__ */ React.createElement("th", { style: { padding: "6px", textAlign: "right" } }, "Done"), /* @__PURE__ */ React.createElement("th", { style: { padding: "6px", textAlign: "right" } }, "Avg Cost"), /* @__PURE__ */ React.createElement("th", { style: { padding: "6px", textAlign: "right" } }, "Avg Time"), /* @__PURE__ */ React.createElement("th", { style: { padding: "6px", textAlign: "right" } }, "Tests"))), /* @__PURE__ */ React.createElement("tbody", null, agentStats.agents.map((a, i) => /* @__PURE__ */ React.createElement("tr", { key: i, style: { borderBottom: `1px solid ${C.darkBrown}22` } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "6px", fontWeight: 700 } }, "\u{1F920}", " ", a.agent_type), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px", textAlign: "right" } }, a.total_steps), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px", textAlign: "right", color: C.green, fontWeight: 700 } }, a.completed), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px", textAlign: "right" } }, "$", a.avg_cost), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px", textAlign: "right" } }, a.avg_duration, "s"), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px", textAlign: "right" } }, a.tests_passed, "/", a.total_tests))))))), tab === "memory" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.lightTeal} 0%, #9DE4ED 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" } }, "Agent Memory"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 10 } }, "Ruflo memory -- stores plans, execution results, and configs"), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 10, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, onClick: async () => {
      await f("/api/memory/seed", { method: "POST", body: JSON.stringify({ repo_id: sr }) });
      load();
    }, style: { fontSize: 14, padding: "8px 18px" } }, "\u{1F504}", " Seed Memory"), /* @__PURE__ */ React.createElement(
      Inp,
      {
        placeholder: "Search memory...",
        value: memSearch,
        onChange: (e) => setMemSearch(e.target.value),
        style: { maxWidth: 280, fontSize: 12, padding: "8px 14px" }
      }
    ), dMemSearch && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown, alignSelf: "center" } }, filteredMemory.length, "/", memory.length, " matched")), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 700, margin: "0 auto" } }, memory.length === 0 ? /* @__PURE__ */ React.createElement(Card, { style: { textAlign: "center", padding: 40, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 36, marginBottom: 8 } }, "\u{1F9E0}"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 } }, "Memory banks are empty"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: C.brown } }, 'Start a repo to generate plans and build Ruflo memory. Or click "Seed Memory" above.')) : filteredMemory.map((m) => /* @__PURE__ */ React.createElement("div", { key: m.id, className: "hover-glow", style: { display: "flex", gap: 8, padding: "7px 12px", background: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 10, marginBottom: 4, fontSize: 12, transition: "box-shadow 0.2s, transform 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,.06)" } }, /* @__PURE__ */ React.createElement("span", { style: { background: C.orange, color: C.white, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 700, flexShrink: 0 } }, m.namespace), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, minWidth: 80 } }, m.key), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, m.value?.slice(0, 80)))))), tab === "mistakes" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.cream} 0%, #F0E2CA 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" } }, "Mistake Graveyard"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 10 } }, "Lessons learned -- injected into prompts so agents don't repeat mistakes"), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto 12px", display: "flex", justifyContent: "center", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement(
      Inp,
      {
        placeholder: "Search mistakes...",
        value: mistakeSearch,
        onChange: (e) => setMistakeSearch(e.target.value),
        style: { maxWidth: 300, fontSize: 12, padding: "8px 14px" }
      }
    ), dMistakeSearch && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown } }, filteredMistakes.length, "/", mistakes.length, " matched")), mistakeAnalysis && mistakeAnalysis.total > 0 && /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 } }, /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 12, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, color: C.red } }, mistakeAnalysis.total), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown } }, "Total Mistakes")), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 12, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, color: C.green } }, mistakeAnalysis.resolution_rate, "%"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown } }, "Resolved")), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 12, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, color: C.orange } }, mistakeAnalysis.chronic_patterns?.length || 0), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown } }, "Chronic (3+)")), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 12, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, color: C.teal } }, mistakeAnalysis.top_5?.length || 0), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown } }, "Error Types"))), mistakeAnalysis && mistakeAnalysis.top_5?.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto 16px" } }, /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, marginBottom: 8 } }, "Top Error Types"), mistakeAnalysis.top_5.map((t, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 700, minWidth: 24 } }, "#", i + 1), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, background: C.cream, borderRadius: 6, height: 20, overflow: "hidden", border: `1px solid ${C.darkBrown}33` } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", background: i === 0 ? C.red : i === 1 ? C.orange : C.teal, width: `${Math.min(100, t.count / (mistakeAnalysis.top_5[0]?.count || 1) * 100)}%`, borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 700, color: C.white, whiteSpace: "nowrap" } }, t.error_type))), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 700, minWidth: 24 } }, t.count))))), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto" } }, filteredMistakes.length === 0 ? /* @__PURE__ */ React.createElement(Card, { style: { textAlign: "center", padding: 40, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 36, marginBottom: 8 } }, "\u{1F31F}"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 } }, dMistakeSearch ? "No matches" : "Clean run, partner!"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: C.brown } }, dMistakeSearch ? `No mistakes matching "${dMistakeSearch}"` : "No mistakes on the books -- the swarm is riding clean.")) : filteredMistakes.map((m) => /* @__PURE__ */ React.createElement(Card, { key: m.id, bg: C.white, style: { marginBottom: 8, padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, #FFF5F5 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 28, height: 28, borderRadius: "50%", background: C.red, border: `2px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 } }, "\u{1F480}"), /* @__PURE__ */ React.createElement("span", { style: { background: C.red, color: C.white, borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700, border: `2px solid ${C.darkBrown}`, fontFamily: "'Bangers', cursive", letterSpacing: 1 } }, m.error_type), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown, marginLeft: "auto" } }, m.created_at)), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, lineHeight: 1.5, marginBottom: 4 } }, m.description), m.resolution && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.green, fontWeight: 600, background: "#E8F8E8", borderRadius: 8, padding: "4px 10px", border: `1px solid ${C.green}33` } }, "\u2705", " ", m.resolution))))), tab === "logs" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.yellow} 0%, #F5D94E 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" } }, "Town Logs"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 10 } }, /* @__PURE__ */ React.createElement("p", { style: { fontSize: 13, color: C.brown } }, "Every action, every decision -- all on record"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 4, background: C.green, borderRadius: 12, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: C.white } }, /* @__PURE__ */ React.createElement("span", { style: { animation: "rec 1.5s infinite" } }, "\u25CF"), " LIVE"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown } }, logs.length, " entries"), /* @__PURE__ */ React.createElement("button", { onClick: () => setLogTail((t) => !t), style: {
      padding: "3px 10px",
      borderRadius: 12,
      fontSize: 10,
      fontWeight: 700,
      fontFamily: "'Fredoka', sans-serif",
      cursor: "pointer",
      background: logTail ? C.orange : C.cream,
      color: logTail ? C.white : C.brown,
      border: `2px solid ${C.darkBrown}`,
      transition: "all 0.15s"
    } }, logTail ? "\u23EC Tail ON" : "\u23EC Tail")), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 800, margin: "0 auto 10px", display: "flex", justifyContent: "center", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement(
      Inp,
      {
        placeholder: "Search logs...",
        value: logSearch,
        onChange: (e) => setLogSearch(e.target.value),
        style: { maxWidth: 300, fontSize: 12, padding: "8px 14px" }
      }
    ), ["all", "errors", "costly", "opus", "sonnet", "haiku"].map((lf) => /* @__PURE__ */ React.createElement("button", { key: lf, onClick: () => setLogLevelFilter(lf), style: {
      padding: "4px 10px",
      borderRadius: 8,
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "'Fredoka', sans-serif",
      cursor: "pointer",
      background: logLevelFilter === lf ? lf === "errors" ? C.red : lf === "costly" ? C.green : lf === "opus" ? "#9B59B6" : lf === "sonnet" ? C.teal : lf === "haiku" ? C.orange : C.teal : C.cream,
      color: logLevelFilter === lf ? C.white : C.darkBrown,
      border: `2px solid ${C.darkBrown}`,
      transition: "all 0.15s"
    } }, lf === "all" ? "All" : lf === "errors" ? "Errors" : lf === "costly" ? "$$" : lf.charAt(0).toUpperCase() + lf.slice(1))), /* @__PURE__ */ React.createElement(Btn, { onClick: exportLogs, bg: C.teal, style: { fontSize: 11, padding: "8px 14px" } }, "\u2B07", " Export")), logs.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", fontSize: 11, color: C.brown, marginBottom: 6 } }, dLogSearch || logLevelFilter !== "all" ? `Showing ${Math.min(visibleLogs.length, filteredLogs.length)} of ${filteredLogs.length} matched (${logs.length} total)` : `${logs.length} entries`, (() => {
      const recent = logs.filter((l) => l.created_at).slice(0, 20);
      if (recent.length < 2) return null;
      const ts = recent.map((l) => new Date(l.created_at).getTime()).filter((t) => !isNaN(t));
      if (ts.length < 2) return null;
      const spanMin = (ts[0] - ts[ts.length - 1]) / 6e4;
      if (spanMin <= 0) return null;
      const rate = (ts.length / spanMin).toFixed(1);
      return /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 8, background: parseFloat(rate) > 5 ? C.lightTeal : C.lightOrange, color: parseFloat(rate) > 5 ? C.teal : C.orange, padding: "1px 8px", borderRadius: 8, fontWeight: 700, fontSize: 10 } }, "\u26A1", " ", rate, "/min");
    })()), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 800, margin: "0 auto" } }, logs.length === 0 ? /* @__PURE__ */ React.createElement(Card, { style: { textAlign: "center", padding: 30, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 32, marginBottom: 6 } }, isRepoBusy(repo) ? "\u2699\uFE0F" : "\u{1F4DC}"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 4 } }, isRepoBusy(repo) ? "Waiting for first log..." : "No logs on the books yet"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.brown } }, isRepoBusy(repo) ? "Logs will appear once the repo starts executing steps." : sr ? "Start this repo to begin logging activity." : "Select and start a repo to see logs here."), isRepoBusy(repo) && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 8, fontSize: 20, animation: "spin 2s linear infinite" } }, "\u2699\uFE0F")) : visibleLogs.map((l, i) => /* @__PURE__ */ React.createElement("div", { key: l.id }, /* @__PURE__ */ React.createElement("div", { onClick: () => setExpandedLog(expandedLog === l.id ? null : l.id), style: { display: "flex", gap: 8, padding: "5px 10px", background: i === 0 ? "#FFFDE7" : expandedLog === l.id ? `${C.lightTeal}66` : C.white, border: `2px solid ${i === 0 ? C.orange : expandedLog === l.id ? C.teal : C.darkBrown}`, borderRadius: expandedLog === l.id ? "8px 8px 0 0" : 8, marginBottom: expandedLog === l.id ? 0 : 3, fontSize: 11, boxShadow: i === 0 ? `0 0 8px ${C.orange}44` : "0 1px 3px rgba(0,0,0,.04)", cursor: "pointer", transition: "background .15s" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, minWidth: 14, textAlign: "center" } }, l.error ? "\u{1F534}" : l.cost_usd > 0.5 ? "\u{1F7E1}" : l.state === "completed" ? "\u{1F7E2}" : "\u26AA"), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown, minWidth: 90, fontSize: 9 } }, l.created_at), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: STATES[l.state]?.color || C.brown, minWidth: 75 } }, l.state), /* @__PURE__ */ React.createElement("span", { style: { minWidth: 80, fontWeight: 500 } }, l.action), l.agent_count > 0 && /* @__PURE__ */ React.createElement("span", { style: { color: C.orange, fontSize: 9, background: C.lightOrange, borderRadius: 4, padding: "0 4px" } }, "\u{1F920}", "\xD7", l.agent_count), l.cost_usd > 0 && /* @__PURE__ */ React.createElement("span", { style: { color: "#2E7D32", fontSize: 9, background: "#E8F5E9", borderRadius: 4, padding: "0 4px" } }, "$", l.cost_usd.toFixed(3)), l.duration_sec > 0 && /* @__PURE__ */ React.createElement("span", { style: { color: C.teal, fontSize: 9, background: C.lightTeal, borderRadius: 4, padding: "0 4px" } }, l.duration_sec.toFixed(1), "s"), l.error && /* @__PURE__ */ React.createElement("span", { style: { color: C.red, fontSize: 9 } }, "\u{1F480}", l.error.slice(0, 30)), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, l.result?.slice(0, 50))), expandedLog === l.id && /* @__PURE__ */ React.createElement("div", { style: { background: C.cream, border: `2px solid ${C.teal}`, borderTop: "none", borderRadius: "0 0 8px 8px", padding: "8px 12px", marginBottom: 3, fontSize: 11 } }, l.result && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: C.teal } }, "Result:"), " ", /* @__PURE__ */ React.createElement("span", { style: { color: C.darkBrown } }, l.result.length > 200 ? /* @__PURE__ */ React.createElement(React.Fragment, null, l.result.slice(0, 200), /* @__PURE__ */ React.createElement("span", { onClick: (e) => {
      e.stopPropagation();
      e.currentTarget.parentElement.textContent = l.result;
    }, style: { color: C.teal, cursor: "pointer", fontWeight: 600 } }, " ...Show more")) : l.result)), l.error && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: C.red } }, "Error:"), " ", /* @__PURE__ */ React.createElement("span", { style: { color: C.red } }, l.error.length > 200 ? /* @__PURE__ */ React.createElement(React.Fragment, null, l.error.slice(0, 200), /* @__PURE__ */ React.createElement("span", { onClick: (e) => {
      e.stopPropagation();
      e.currentTarget.parentElement.textContent = l.error;
    }, style: { color: C.orange, cursor: "pointer", fontWeight: 600 } }, " ...Show more")) : l.error)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap", color: C.brown, fontSize: 10, alignItems: "center" } }, l.model && /* @__PURE__ */ React.createElement("span", null, "Model: ", l.model), l.tokens_in > 0 && /* @__PURE__ */ React.createElement("span", null, "Tokens in: ", l.tokens_in), l.tokens_out > 0 && /* @__PURE__ */ React.createElement("span", null, "Tokens out: ", l.tokens_out), l.agent_count > 0 && /* @__PURE__ */ React.createElement("span", null, "Agents: ", l.agent_count), l.cost_usd > 0 && /* @__PURE__ */ React.createElement("span", null, "Cost: $", l.cost_usd.toFixed(4)), l.duration_sec > 0 && /* @__PURE__ */ React.createElement("span", null, "Duration: ", l.duration_sec.toFixed(2), "s"), /* @__PURE__ */ React.createElement("button", { onClick: (e) => {
      e.stopPropagation();
      const txt = [l.created_at, l.state, l.action, l.result, l.error, l.model ? `model:${l.model}` : "", l.cost_usd > 0 ? `cost:$${l.cost_usd}` : ""].filter(Boolean).join(" | ");
      navigator.clipboard.writeText(txt);
      showToast("Copied to clipboard", "success");
    }, style: { marginLeft: "auto", background: C.white, border: `1px solid ${C.darkBrown}33`, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 9, fontWeight: 600, color: C.teal } }, "Copy"))))), filteredLogs.length > logPageSize && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", margin: "8px 0" } }, /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, onClick: () => setLogPageSize((p) => p + 100), style: { fontSize: 11, padding: "6px 16px" } }, "Show more (", filteredLogs.length - logPageSize, " remaining)")), /* @__PURE__ */ React.createElement("div", { ref: logEndRef }))), tab === "history" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.yellow} 0%, #F5D94E 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" } }, "Repo History"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 12 } }, "A trail of every move your swarm has made"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap", marginBottom: 16 } }, ["all", "git_commit", "state_change", "execute_step", "test_step"].map((f2) => /* @__PURE__ */ React.createElement(
      "span",
      {
        key: f2,
        onClick: () => setHistFilter(f2),
        style: {
          cursor: "pointer",
          padding: "4px 12px",
          borderRadius: 12,
          fontSize: 11,
          fontWeight: 700,
          background: histFilter === f2 ? C.orange : C.cream,
          color: histFilter === f2 ? C.white : C.brown,
          border: `2px solid ${histFilter === f2 ? C.orange : C.darkBrown}33`,
          transition: "all .2s"
        }
      },
      f2 === "all" ? "All" : f2 === "git_commit" ? "Commits" : f2 === "state_change" ? "States" : f2 === "execute_step" ? "Execute" : "Tests"
    )), history.length > 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown, alignSelf: "center" } }, histFilter === "all" ? history.length : history.filter((h) => h.action === histFilter).length, " entries")), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 700, margin: "0 auto" } }, history.length === 0 ? /* @__PURE__ */ React.createElement(Card, { style: { textAlign: "center", padding: 40, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 36, marginBottom: 8 } }, "\u{1F4DC}"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 } }, "No trail to follow yet"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: C.brown } }, "History is recorded as the orchestrator works through steps.")) : history.filter((h) => histFilter === "all" || h.action === histFilter).map((h, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "timeline-entry" }, /* @__PURE__ */ React.createElement("div", { style: { position: "absolute", left: 0, top: 4 } }, /* @__PURE__ */ React.createElement(ActionIcon, { action: h.action })), /* @__PURE__ */ React.createElement(Card, { className: "hover-glow", style: { padding: 14, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 } }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, lineHeight: 1.2 } }, h.action?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.brown, marginTop: 3, lineHeight: 1.4 } }, h.details), h.commit_hash && /* @__PURE__ */ React.createElement("code", { style: { display: "inline-block", fontSize: 10, background: C.lightTeal, padding: "2px 8px", borderRadius: 6, color: C.teal, fontWeight: 600, marginTop: 4, border: `1px solid ${C.teal}33` } }, h.commit_hash.slice(0, 8)), h.state_before && h.state_after && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, marginTop: 6, display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { background: STATES[h.state_before]?.color || C.brown, color: C.white, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600 } }, STATES[h.state_before]?.emoji, " ", h.state_before), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown, fontWeight: 700 } }, "\u2192"), /* @__PURE__ */ React.createElement("span", { style: { background: STATES[h.state_after]?.color || C.brown, color: C.white, borderRadius: 6, padding: "2px 8px", fontSize: 10, fontWeight: 600 } }, STATES[h.state_after]?.emoji, " ", h.state_after))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right", flexShrink: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown, fontWeight: 500 } }, h.created_at), h.commit_hash && h.action === "git_commit" && /* @__PURE__ */ React.createElement(
      Btn,
      {
        style: { marginTop: 6, fontSize: 10, padding: "4px 10px", background: C.red, color: C.white },
        onClick: () => {
          const hash = h.commit_hash;
          setConfirmDialog({ message: `Rollback to commit ${hash.slice(0, 8)}? This will revert all changes after this commit.`, onConfirm: async () => {
            setRollingBack(true);
            const res = await f("/api/rollback", { method: "POST", body: JSON.stringify({ repo_id: sr, commit_hash: hash }) });
            setRollingBack(false);
            if (res.ok) {
              const d = await res.json();
              showToast(d.ok ? "Rollback complete!" : d.error || "Rollback failed", d.ok ? "success" : "error");
              load();
            } else showToast("Rollback request failed", "error");
          } });
        }
      },
      rollingBack ? "Rolling back..." : "\u23EA Rollback"
    )))))))), tab === "health" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.cream} 0%, #F0E2CA 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" } }, "Health Check"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 20 } }, "Scan your repos for issues and auto-fix what you can"), healthScores && healthScores.repos?.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 800, margin: "0 auto 16px", padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1 } }, "Repo Health Scores"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, fontWeight: 700, color: healthScores.average_score >= 75 ? C.green : healthScores.average_score >= 50 ? C.orange : C.red } }, "Avg: ", healthScores.average_score)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: 6 } }, healthScores.repos.map((r) => {
      const gc = { A: C.green, B: "#4DB6AC", C: C.orange, D: "#FF7043", F: C.red }[r.grade] || C.brown;
      return /* @__PURE__ */ React.createElement("div", { key: r.repo_id, style: { padding: "4px 10px", borderRadius: 8, border: `2px solid ${gc}`, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }, title: r.issues.join(", ") || "All clear" }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 700, color: gc, fontFamily: "'Bangers', cursive", fontSize: 16 } }, r.grade), /* @__PURE__ */ React.createElement("span", null, r.repo), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown } }, r.score));
    }))), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: scanning || fixing ? 8 : 24, display: "flex", justifyContent: "center", gap: 14 } }, /* @__PURE__ */ React.createElement(Btn, { onClick: scanAll, bg: scanning ? "#999" : C.teal, style: { fontSize: 18, padding: "14px 32px", opacity: scanning ? 0.7 : 1, pointerEvents: scanning ? "none" : "auto" } }, scanning ? "\u23F3 Scanning..." : "\u{1F50D} SCAN ALL REPOS"), /* @__PURE__ */ React.createElement(Btn, { onClick: fixAll, bg: fixing ? "#999" : C.green, style: { fontSize: 18, padding: "14px 32px", opacity: fixing ? 0.7 : 1, pointerEvents: fixing ? "none" : "auto" } }, fixing ? "\u23F3 Fixing..." : "\u{1F527} FIX ALL AUTO-FIXABLE")), (scanning || fixing) && /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 400, margin: "0 auto 20px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 10, height: 12, overflow: "hidden", marginBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", borderRadius: 8, background: `linear-gradient(90deg, ${scanning ? C.teal : C.green}, ${C.orange})`, width: healthData.length > 0 ? `${Math.min(100, Math.round(healthData.length / Math.max(repos.length, 1) * 100))}%` : "15%", transition: "width .5s", animation: healthData.length === 0 ? "pulse 1.5s infinite" : "none" } })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown, fontWeight: 600 } }, scanning ? "\u{1F50D}" : "\u{1F527}", " ", healthData.length > 0 ? `${healthData.length}/${repos.length} repos processed` : "Starting scan...")), healthData.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 800, margin: "0 auto 20px" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))", gap: 12 } }, healthData.map((h) => {
      const scoreColor = h.health_score >= 80 ? C.green : h.health_score >= 50 ? C.orange : C.red;
      const pt = h.project_type || {};
      return /* @__PURE__ */ React.createElement(Card, { key: h.repo_id, bg: C.white }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { width: 50, height: 50, borderRadius: "50%", background: scoreColor, border: `3px solid ${C.darkBrown}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.white, fontFamily: "'Bangers',cursive", fontSize: 20 } }, h.health_score, "%"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1 } }, h.repo_name), pt.type && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown } }, pt.type, " \u2022 ", pt.file_count, " files \u2022 ", pt.swarm_size, " agents \u2022 ", pt.sparc_mode, " mode"))), /* @__PURE__ */ React.createElement("div", { style: { background: C.cream, border: `2px solid ${C.darkBrown}`, borderRadius: 8, height: 12, overflow: "hidden", marginBottom: 8 } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", borderRadius: 6, background: `linear-gradient(90deg, ${scoreColor}, ${C.green})`, width: `${h.health_score}%`, transition: "width .5s" } })), h.issues.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.green, fontWeight: 600 } }, "\u2705 All checks passed!") : h.issues.map((issue, i) => {
        const sevColor = { critical: C.red, issue: C.orange, warning: "#DAA520" }[issue.severity] || "#ccc";
        return /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 11, borderBottom: `1px solid ${C.cream}` } }, /* @__PURE__ */ React.createElement("span", { style: { background: sevColor, color: C.white, borderRadius: 4, padding: "1px 6px", fontSize: 9, fontWeight: 700, minWidth: 50, textAlign: "center" } }, issue.severity), /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600 } }, issue.title), issue.auto_fixable && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.teal } }, "\u{1F527} auto-fix"));
      }));
    }))), circuitBreakers.some((cb) => cb.state !== "closed") && /* @__PURE__ */ React.createElement(Card, { bg: "#FFF3E0", style: { maxWidth: 800, margin: "0 auto 16px", border: `2px solid ${C.orange}` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, marginBottom: 8, color: C.orange } }, "\u26A1", " Circuit Breakers"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 8 } }, circuitBreakers.filter((cb) => cb.state !== "closed").map((cb) => /* @__PURE__ */ React.createElement("div", { key: cb.repo_id, style: { padding: "8px 12px", background: cb.state === "open" ? "#FFEBEE" : "#FFF8E1", borderRadius: 8, border: `2px solid ${cb.state === "open" ? C.red : C.orange}`, fontSize: 11 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700 } }, cb.repo_name), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 4 } }, /* @__PURE__ */ React.createElement("span", { style: { color: cb.state === "open" ? C.red : C.orange, fontWeight: 700 } }, cb.state.toUpperCase()), /* @__PURE__ */ React.createElement("span", null, cb.failures, "/", cb.threshold, " failures"), cb.last_failure_ago && /* @__PURE__ */ React.createElement("span", { style: { color: C.brown } }, cb.last_failure_ago, "s ago")))))), circuitBreakers.length > 0 && circuitBreakers.every((cb) => cb.state === "closed") && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", fontSize: 12, color: C.green, fontWeight: 600, marginBottom: 16 } }, "\u2705", " All circuit breakers closed \u2014 everything healthy!"), /* @__PURE__ */ React.createElement(Card, { bg: C.yellow, style: { maxWidth: 700, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5, textAlign: "center" } }, "\u{1F4AC} Command Center"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown, marginBottom: 10, padding: "8px 12px", background: C.cream, borderRadius: 10, border: `2px solid ${C.darkBrown}` } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, marginBottom: 4, textAlign: "center" } }, "Available Commands:"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 12px" } }, [
      ["scan all / scan [repo]", "Run health check on repos"],
      ["fix all / fix [repo]", "Auto-fix common issues"],
      ["start all / start [repo]", "Start orchestration"],
      ["stop all / stop [repo]", "Stop orchestration"],
      ["push [repo]", "Git push to GitHub"],
      ["status", "Show all repo statuses"],
      ["add feature to [repo]: [desc]", "Add a feature item"],
      ["add issue to [repo]: [desc]", "Add a bug/issue item"],
      ["add tests to [repo]", "Generate test files"],
      ["list repos", "Show all registered repos"]
    ].map(([cmd, desc], i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 4 } }, /* @__PURE__ */ React.createElement("code", { style: { background: C.lightOrange, borderRadius: 4, padding: "0 4px", fontWeight: 600, fontSize: 10, whiteSpace: "nowrap" } }, cmd), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown } }, desc))))), /* @__PURE__ */ React.createElement("div", { style: { maxHeight: 250, overflow: "auto", marginBottom: 10, padding: 4 } }, chatHistory.map((m, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { style: {
      maxWidth: "80%",
      padding: "8px 12px",
      borderRadius: 12,
      background: m.role === "user" ? C.orange : C.white,
      color: m.role === "user" ? C.white : C.darkBrown,
      border: `2px solid ${C.darkBrown}`,
      fontSize: 12
    } }, m.content, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: m.role === "user" ? C.cream : C.brown, marginTop: 2 } }, m.time)))), chatLoading && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-start", marginBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 12px", borderRadius: 12, background: C.white, border: `2px solid ${C.darkBrown}`, fontSize: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { animation: "pulse 1s infinite" } }, "\u{1F914} Thinking...")))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, /* @__PURE__ */ React.createElement(
      Inp,
      {
        value: chatMsg,
        onChange: (e) => setChatMsg(e.target.value),
        onKeyDown: (e) => e.key === "Enter" && sendChat(),
        placeholder: "Type a command...",
        style: { flex: 1 }
      }
    ), /* @__PURE__ */ React.createElement(Btn, { onClick: sendChat, bg: C.teal }, "Send")))), tab === "metrics" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, #E3F2FD 0%, #BBDEFB 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" } }, "API Metrics"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 20 } }, "Request counts, error rates, and latency stats"), apiMetrics ? /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 800, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 } }, [
      { label: "Total Requests", val: apiMetrics.total_requests?.toLocaleString() || "0", icon: "\u{1F4E8}", bg: C.lightTeal },
      { label: "Errors", val: apiMetrics.errors?.toLocaleString() || "0", icon: "\u274C", bg: "#FFEBEE" },
      { label: "Rate Limited", val: apiMetrics.rate_limited?.toLocaleString() || "0", icon: "\u{1F6A6}", bg: C.lightOrange },
      { label: "Endpoints", val: Object.keys(apiMetrics.top_endpoints || {}).length, icon: "\u{1F517}", bg: C.cream },
      { label: "Error Rate", val: apiMetrics.total_requests > 0 ? `${((apiMetrics.errors || 0) / apiMetrics.total_requests * 100).toFixed(1)}%` : "0%", icon: "\u{1F4C9}", bg: (apiMetrics.errors || 0) / Math.max(1, apiMetrics.total_requests) > 0.05 ? "#FFEBEE" : "#E8F5E9" },
      { label: "Active Agents", val: repoStats.totalAgents, icon: "\u{1F920}", bg: "#E8F5E9" }
    ].map((s, i) => /* @__PURE__ */ React.createElement(Card, { key: i, bg: s.bg, style: { padding: 16, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 24, marginBottom: 4 } }, s.icon), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, letterSpacing: 1 } }, s.val), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown, fontWeight: 600 } }, s.label)))), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { marginBottom: 16, padding: 18 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 } }, "\u{1F3C6}", " Top Endpoints"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12 } }, Object.entries(apiMetrics.top_endpoints || {}).sort((a, b) => b[1] - a[1]).map(([ep, count]) => {
      const lat = apiMetrics.latency?.[ep];
      return /* @__PURE__ */ React.createElement("div", { key: ep, style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.darkBrown}11` } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontWeight: 600, fontFamily: "monospace", fontSize: 11 } }, ep), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, fontWeight: 700, color: C.teal, minWidth: 60, textAlign: "right" } }, count.toLocaleString()), lat && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown, background: lat.p95_ms > 200 ? "#FFEBEE" : C.lightTeal, padding: "2px 6px", borderRadius: 4, minWidth: 60, textAlign: "center" } }, "p95: ", lat.p95_ms, "ms"), lat && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown, background: C.cream, padding: "2px 6px", borderRadius: 4, minWidth: 55, textAlign: "center" } }, "avg: ", lat.avg_ms, "ms"));
    }))), apiMetrics.latency && Object.keys(apiMetrics.latency).length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 18 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 } }, "\u23F1\uFE0F", " Latency Breakdown"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "2fr repeat(5, 1fr)", gap: 4, fontSize: 11 } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, padding: "4px 0" } }, "Endpoint"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, textAlign: "center" } }, "Avg"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, textAlign: "center" } }, "P50"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, textAlign: "center" } }, "P95"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, textAlign: "center" } }, "Max"), /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, textAlign: "center" }, title: "P95/P50 ratio - higher means more variable" }, "Spiky"), Object.entries(apiMetrics.latency).sort((a, b) => b[1].p95_ms - a[1].p95_ms).map(([ep, lat]) => {
      const spikeRatio = lat.p50_ms > 0 ? lat.p95_ms / lat.p50_ms : 1;
      const spikeColor = spikeRatio > 3 ? C.red : spikeRatio > 2 ? C.orange : C.green;
      return /* @__PURE__ */ React.createElement(React.Fragment, { key: ep }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "monospace", fontSize: 10, padding: "3px 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, ep), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "3px 0" } }, lat.avg_ms, "ms"), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "3px 0" } }, lat.p50_ms, "ms"), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "3px 0", color: lat.p95_ms > 500 ? C.red : lat.p95_ms > 200 ? C.orange : C.green, fontWeight: 700 } }, lat.p95_ms, "ms"), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "3px 0", color: lat.max_ms > 1e3 ? C.red : C.brown } }, lat.max_ms, "ms"), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", padding: "3px 0", color: spikeColor, fontWeight: 700, fontSize: 10 } }, spikeRatio > 3 ? "\u{1F4C8}" : spikeRatio > 2 ? "\u26A0\uFE0F" : "\u2705", " ", spikeRatio.toFixed(1), "x"), /* @__PURE__ */ React.createElement("div", { style: { gridColumn: "1 / -1", height: 6, background: C.cream, borderRadius: 3, overflow: "hidden", margin: "0 0 4px" } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${C.green}, ${lat.p95_ms > 500 ? C.red : lat.p95_ms > 200 ? C.orange : C.teal})`, width: `${Math.min(100, Math.round(lat.p95_ms / 10))}%`, transition: "width 0.3s" } })));
    }))), /* @__PURE__ */ React.createElement("details", { style: { marginTop: 16 } }, /* @__PURE__ */ React.createElement("summary", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1, cursor: "pointer", color: C.brown } }, "Request Log (last 50)"), /* @__PURE__ */ React.createElement(RequestLog, null))) : /* @__PURE__ */ React.createElement(Card, { style: { textAlign: "center", padding: 40, maxWidth: 600, margin: "0 auto", background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 36, marginBottom: 8 } }, "\u{1F4CA}"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1 } }, "No metrics data yet"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.brown } }, "Metrics appear after the API serves some requests."))), tab === "trends" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, #E8F5E9 0%, #C8E6C9 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" } }, "Trend Analysis"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 16 } }, "Performance trends over the last 14 days"), trends && trends.summary ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 } }, /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 12, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, color: C.teal } }, "$", trends.summary.total_cost), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown } }, "Total Cost")), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 12, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, color: C.green } }, trends.summary.total_items_completed), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown } }, "Items Completed")), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 12, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, color: C.orange } }, trends.summary.total_actions), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown } }, "Total Actions")), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 12, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, color: trends.summary.error_rate > 20 ? C.red : C.teal } }, trends.summary.error_rate, "%"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown } }, "Error Rate"))), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 620, margin: "0 auto 16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } }, /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 12, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 22, color: C.brown } }, "$", trends.summary.avg_cost_per_day), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown } }, "Avg Cost/Day")), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { padding: 12, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 22, color: C.brown } }, trends.summary.avg_items_per_day), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown } }, "Avg Items/Day"))), Object.keys(costs).length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto 16px", padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, marginBottom: 10 } }, "Cost by Repo"), (() => {
      const totalCost2 = repoStats.totalCost || 1;
      const sorted = Object.entries(costs).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0);
      const barColors = [C.teal, C.orange, C.green, "#7E57C2", C.red, "#795548", "#607D8B", C.yellow];
      return sorted.map(([rid, cost], i) => {
        const repo2 = repos.find((r) => r.id === Number(rid));
        const pct = Math.round(cost / totalCost2 * 100);
        return /* @__PURE__ */ React.createElement("div", { key: rid, style: { marginBottom: 6 } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 2 } }, /* @__PURE__ */ React.createElement("span", { style: { fontWeight: 600 } }, repo2?.name || `Repo ${rid}`), /* @__PURE__ */ React.createElement("span", { style: { color: C.brown } }, "$", cost.toFixed(3), " (", pct, "%)")), /* @__PURE__ */ React.createElement("div", { style: { background: C.cream, borderRadius: 6, height: 10, overflow: "hidden", border: `1px solid ${C.darkBrown}33` } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", borderRadius: 5, background: barColors[i % barColors.length], width: `${pct}%`, transition: "width .5s" } })));
      });
    })()), costHistory.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto 16px", padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, marginBottom: 10 } }, "30-Day Cost History"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-end", gap: 1, height: 80 } }, (() => {
      const byDate = {};
      costHistory.forEach((r) => {
        byDate[r.date] = (byDate[r.date] || 0) + r.cost;
      });
      const dates = Object.keys(byDate).sort();
      const maxC = Math.max(...Object.values(byDate), 1e-3);
      return dates.map((d, i) => {
        const h = Math.max(3, byDate[d] / maxC * 70);
        return /* @__PURE__ */ React.createElement("div", { key: i, style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: h, background: `linear-gradient(180deg, ${C.teal} 0%, #4DB6AC 100%)`, borderRadius: "3px 3px 0 0", minWidth: 4 }, title: `${d}: $${byDate[d].toFixed(3)}` }));
      });
    })()), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 8, color: C.brown, marginTop: 2 } }, (() => {
      const dates = [...new Set(costHistory.map((r) => r.date))].sort();
      return dates.length > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("span", null, dates[0]?.slice(5)), /* @__PURE__ */ React.createElement("span", null, dates[dates.length - 1]?.slice(5))) : null;
    })())), costHistory.length >= 3 && (() => {
      const recent = costHistory.slice(-7);
      const avgDaily = recent.reduce((s, d) => s + (d.cost || 0), 0) / recent.length;
      const projected7 = (avgDaily * 7).toFixed(2);
      const projected30 = (avgDaily * 30).toFixed(2);
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto 12px", padding: 12, background: `linear-gradient(135deg, ${C.white}, #E3F2FD)` } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-around", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown, fontWeight: 600 } }, "Avg/Day"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20 } }, "$", avgDaily.toFixed(3))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown, fontWeight: 600 } }, "7-Day Forecast"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, color: C.teal } }, "$", projected7)), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown, fontWeight: 600 } }, "30-Day Forecast"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, color: C.orange } }, "$", projected30))));
    })(), trends.daily?.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto 16px", padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, marginBottom: 10 } }, "Daily Breakdown"), /* @__PURE__ */ React.createElement("div", { style: { overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: `2px solid ${C.darkBrown}` } }, /* @__PURE__ */ React.createElement("th", { style: { padding: "6px 8px", textAlign: "left" } }, "Day"), /* @__PURE__ */ React.createElement("th", { style: { padding: "6px 8px", textAlign: "right" } }, "Actions"), /* @__PURE__ */ React.createElement("th", { style: { padding: "6px 8px", textAlign: "right" } }, "Items"), /* @__PURE__ */ React.createElement("th", { style: { padding: "6px 8px", textAlign: "right" } }, "Cost"), /* @__PURE__ */ React.createElement("th", { style: { padding: "6px 8px", textAlign: "right" } }, "Errors"), /* @__PURE__ */ React.createElement("th", { style: { padding: "6px 8px", textAlign: "right" } }, "Avg Dur"))), /* @__PURE__ */ React.createElement("tbody", null, trends.daily.map((d, i) => /* @__PURE__ */ React.createElement("tr", { key: i, style: { borderBottom: `1px solid ${C.darkBrown}22` } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 8px", fontWeight: 600 } }, d.day), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 8px", textAlign: "right" } }, d.actions), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 8px", textAlign: "right", color: C.green, fontWeight: 700 } }, d.items_completed), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 8px", textAlign: "right" } }, "$", d.cost), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 8px", textAlign: "right", color: d.errors > 0 ? C.red : C.green } }, d.errors), /* @__PURE__ */ React.createElement("td", { style: { padding: "6px 8px", textAlign: "right" } }, d.avg_duration, "s"))))))), trends.daily?.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto", padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, marginBottom: 10 } }, "Cost Trend"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "flex-end", gap: 2, height: 100 } }, trends.daily.map((d, i) => {
      const maxCost = Math.max(...trends.daily.map((x) => x.cost), 1e-3);
      const h = Math.max(4, d.cost / maxCost * 90);
      return /* @__PURE__ */ React.createElement("div", { key: i, style: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 } }, /* @__PURE__ */ React.createElement("div", { style: { width: "100%", height: h, background: d.errors > 0 ? C.red : C.teal, borderRadius: "4px 4px 0 0", minWidth: 8 }, title: `${d.day}: $${d.cost}` }), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 8, color: C.brown, transform: "rotate(-45deg)", whiteSpace: "nowrap" } }, d.day.slice(5)));
    })))) : /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto", textAlign: "center", padding: 40 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 36, marginBottom: 8 } }, "\u{1F4C8}"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 } }, "No trend data yet"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: C.brown } }, "Trends appear after the swarm starts executing steps."))), tab === "compare" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, #E3F2FD 0%, #BBDEFB 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" } }, "Repo Showdown"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 16 } }, "Compare repos side-by-side \u2014 find your top performers"), comparison && comparison.repos?.length > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, comparison.total_cost > 0 && /* @__PURE__ */ React.createElement("div", { style: { textAlign: "center", marginBottom: 12 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, color: C.teal } }, "Total Cost: $", comparison.total_cost)), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" } }, [["name", "Name"], ["cost", "Cost"], ["items_done", "Items"], ["error_rate", "Errors"], ["cycles", "Cycles"], ["health_score", "Health"], ["efficiency", "$/Item"]].map(([key, label]) => /* @__PURE__ */ React.createElement("button", { key, onClick: () => setCompSort(key), style: {
      padding: "4px 12px",
      borderRadius: 8,
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "'Fredoka', sans-serif",
      cursor: "pointer",
      background: compSort === key ? C.teal : C.cream,
      color: compSort === key ? C.white : C.darkBrown,
      border: `2px solid ${C.darkBrown}`,
      transition: "all 0.15s"
    } }, "Sort: ", label)), /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, onClick: exportComparison, style: { fontSize: 11, padding: "4px 12px" } }, "\u2B07", " CSV")), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 720, margin: "0 auto 12px", padding: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 14, letterSpacing: 1, marginBottom: 8, textAlign: "center" } }, compSort === "cost" ? "Cost" : compSort === "items_done" ? "Items Done" : compSort === "error_rate" ? "Error Rate" : compSort === "cycles" ? "Cycles" : compSort === "health_score" ? "Health" : "Cost", " Comparison"), (() => {
      const metric = compSort === "name" ? "cost" : compSort === "efficiency" ? "efficiency" : compSort;
      const reposWithEff = comparison.repos.map((r) => ({ ...r, efficiency: r.items_done > 0 ? parseFloat((r.cost / r.items_done).toFixed(4)) : 0 }));
      const sorted = [...reposWithEff].sort((a, b) => metric === "efficiency" ? (a[metric] || 0) - (b[metric] || 0) : (b[metric] || 0) - (a[metric] || 0));
      const maxV = Math.max(...sorted.map((r) => r[metric] || 0), 1e-3);
      const barColor = metric === "error_rate" ? C.red : metric === "cost" ? C.orange : metric === "health_score" ? C.green : metric === "efficiency" ? "#7E57C2" : C.teal;
      return sorted.slice(0, 10).map((r) => /* @__PURE__ */ React.createElement("div", { key: r.id, style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 3 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 600, minWidth: 80, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.name), /* @__PURE__ */ React.createElement("div", { style: { flex: 1, height: 14, background: `${C.darkBrown}08`, borderRadius: 4, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("div", { style: { height: "100%", width: `${(r[metric] || 0) / maxV * 100}%`, background: `linear-gradient(90deg, ${barColor}88, ${barColor})`, borderRadius: 4, transition: "width 0.3s" } })), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, fontWeight: 700, minWidth: 50, color: barColor } }, metric === "cost" || metric === "efficiency" ? `$${r[metric]}` : metric === "error_rate" ? `${r[metric]}%` : r[metric] || 0)));
    })()), comparison.repos.length >= 2 && (() => {
      const top5 = [...comparison.repos].sort((a, b) => (b.items_done || 0) - (a.items_done || 0)).slice(0, 5);
      const axes = ["items_done", "cycles", "health_score", "total_actions"];
      const axisLabels = ["Items", "Cycles", "Health", "Actions"];
      const maxes = axes.map((a) => Math.max(...top5.map((r) => r[a] || 0), 1));
      const cx = 140, cy = 120, rr = 80, n = axes.length;
      const colors = [C.teal, C.orange, C.green, "#9C27B0", C.red];
      const angleOf = (i) => Math.PI * 2 * i / n - Math.PI / 2;
      return /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 720, margin: "0 auto 12px", padding: 14, textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 14, letterSpacing: 1, marginBottom: 4 } }, "Repo Radar (Top 5)"), /* @__PURE__ */ React.createElement("svg", { viewBox: "0 0 280 240", style: { width: "100%", maxWidth: 320, display: "inline-block" } }, [0.25, 0.5, 0.75, 1].map((s) => /* @__PURE__ */ React.createElement("polygon", { key: s, points: axes.map((_, i) => `${cx + rr * s * Math.cos(angleOf(i))},${cy + rr * s * Math.sin(angleOf(i))}`).join(" "), fill: "none", stroke: `${C.darkBrown}15`, strokeWidth: 1 })), axes.map((_, i) => /* @__PURE__ */ React.createElement("g", { key: i }, /* @__PURE__ */ React.createElement("line", { x1: cx, y1: cy, x2: cx + rr * Math.cos(angleOf(i)), y2: cy + rr * Math.sin(angleOf(i)), stroke: `${C.darkBrown}22`, strokeWidth: 1 }), /* @__PURE__ */ React.createElement("text", { x: cx + (rr + 14) * Math.cos(angleOf(i)), y: cy + (rr + 14) * Math.sin(angleOf(i)), fill: C.brown, fontSize: "8", textAnchor: "middle", dominantBaseline: "middle" }, axisLabels[i]))), top5.map((repo2, ri) => {
        const pts = axes.map((a, i) => {
          const v = (repo2[a] || 0) / maxes[i];
          return `${cx + rr * v * Math.cos(angleOf(i))},${cy + rr * v * Math.sin(angleOf(i))}`;
        }).join(" ");
        return /* @__PURE__ */ React.createElement("polygon", { key: repo2.id, points: pts, fill: `${colors[ri]}22`, stroke: colors[ri], strokeWidth: 1.5 });
      })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", marginTop: 4 } }, top5.map((r, i) => /* @__PURE__ */ React.createElement("span", { key: r.id, style: { fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", gap: 3 } }, /* @__PURE__ */ React.createElement("span", { style: { width: 8, height: 8, borderRadius: "50%", background: colors[i], display: "inline-block" } }), " ", r.name))));
    })(), /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 720, margin: "0 auto", padding: 14, overflowX: "auto" } }, /* @__PURE__ */ React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } }, /* @__PURE__ */ React.createElement("thead", null, /* @__PURE__ */ React.createElement("tr", { style: { borderBottom: `2px solid ${C.darkBrown}` } }, /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 6px", textAlign: "left" } }, "Repo"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 6px", textAlign: "center" } }, "State"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 6px", textAlign: "right" } }, "Cost"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 6px", textAlign: "right" } }, "$/Item"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 6px", textAlign: "right" } }, "Items"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 6px", textAlign: "right" } }, "Err%"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 6px", textAlign: "right" } }, "Cycles"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 6px", textAlign: "right" } }, "Health"), /* @__PURE__ */ React.createElement("th", { style: { padding: "8px 6px", textAlign: "center" } }, "Trend"))), /* @__PURE__ */ React.createElement("tbody", null, [...comparison.repos].sort((a, b) => {
      if (compSort === "name") return a.name.localeCompare(b.name);
      return (b[compSort] || 0) - (a[compSort] || 0);
    }).map((r) => /* @__PURE__ */ React.createElement("tr", { key: r.id, style: { borderBottom: `1px solid ${C.darkBrown}22`, cursor: "pointer" }, onClick: () => {
      setSR(r.id);
      setTab("home");
    } }, /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 6px", fontWeight: 700 } }, r.name), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 6px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("span", { style: {
      fontSize: 10,
      padding: "2px 8px",
      borderRadius: 6,
      fontWeight: 700,
      background: r.state === "idle" ? C.cream : r.state === "credits_exhausted" ? C.red : C.green,
      color: r.state === "idle" ? C.brown : C.white
    } }, r.state)), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 6px", textAlign: "right" } }, "$", r.cost), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 6px", textAlign: "right", color: r.cost_per_item > 1 ? C.red : C.green } }, "$", r.cost_per_item), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 6px", textAlign: "right" } }, r.items_done, "/", r.items_total), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 6px", textAlign: "right", color: r.error_rate > 20 ? C.red : r.error_rate > 10 ? C.orange : C.green, fontWeight: 700 } }, r.error_rate, "%"), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 6px", textAlign: "right" } }, r.cycles), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 6px", textAlign: "right" } }, /* @__PURE__ */ React.createElement("span", { style: {
      fontSize: 11,
      fontWeight: 700,
      padding: "2px 8px",
      borderRadius: 6,
      background: (r.health_score || 0) >= 70 ? C.green : (r.health_score || 0) >= 40 ? C.orange : C.red,
      color: C.white
    } }, r.health_score || 0)), /* @__PURE__ */ React.createElement("td", { style: { padding: "8px 6px", textAlign: "center" } }, sparklines[r.id]?.length > 1 ? /* @__PURE__ */ React.createElement(Sparkline, { data: sparklines[r.id], width: 50, height: 14, color: C.teal }) : /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: C.brown } }, "-")))))))) : /* @__PURE__ */ React.createElement(Card, { bg: C.white, style: { maxWidth: 620, margin: "0 auto", textAlign: "center", padding: 40 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 36, marginBottom: 8 } }, "\u2696\uFE0F"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 4 } }, "No repos to compare"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, color: C.brown } }, "Register some repos first to see the showdown."))), tab === "settings" && /* @__PURE__ */ React.createElement(SectionBg, { bg: `linear-gradient(180deg, ${C.sand} 0%, #E8C84E 100%)` }, /* @__PURE__ */ React.createElement("h2", { style: { fontFamily: "'Bangers', cursive", fontSize: 36, textAlign: "center", marginBottom: 6, letterSpacing: 3, textShadow: "2px 2px 0 rgba(61,43,31,0.1)" } }, "Ruflo Settings"), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", fontSize: 13, color: C.brown, marginBottom: 20 } }, "Configure your swarm's model routing and optimization"), /* @__PURE__ */ React.createElement("div", { style: { maxWidth: 700, margin: "0 auto" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, justifyContent: "center", marginBottom: 20 } }, /* @__PURE__ */ React.createElement(Btn, { bg: C.orange, style: { fontSize: 17, padding: "14px 28px" }, onClick: async () => {
      await apiAction("/api/ruflo-optimize", { method: "POST", body: JSON.stringify({ all: true }) }, "All repos optimized");
    } }, "\u{1F504}", " Re-Optimize All Repos"), /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, style: { fontSize: 17, padding: "14px 28px" }, onClick: async () => {
      if (!sr) return;
      await apiAction("/api/ruflo-optimize", { method: "POST", body: JSON.stringify({ repo_id: sr }) }, "Repo optimized");
    } }, "\u26A1", " Optimize Selected Repo")), sr && items.length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #FFF8E7 0%, #F5E6C8 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 4, letterSpacing: 1.5 } }, "\u{1F3AF}", " Selective Item Roundup"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: C.brown, marginBottom: 12 } }, "Pick specific bounties to re-wrangle. Selected items get reset to pending and re-planned by the swarm."), /* @__PURE__ */ React.createElement("div", { style: { maxHeight: 220, overflowY: "auto", marginBottom: 12, border: `2px solid ${C.darkBrown}33`, borderRadius: 10, background: C.white } }, items.map((it) => {
      const checked = selOptItems.includes(it.id);
      const typeIcon = it.type === "issue" ? "\u{1F41B}" : "\u{1F31F}";
      const statusColor = it.status === "completed" ? C.green : it.status === "in_progress" ? C.orange : "#999";
      const statusLabel = it.status === "completed" ? "Done" : it.status === "in_progress" ? "Active" : "Pending";
      return /* @__PURE__ */ React.createElement(
        "label",
        {
          key: it.id,
          style: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            borderBottom: `1px solid ${C.darkBrown}15`,
            cursor: "pointer",
            transition: "background 0.15s",
            background: checked ? `${C.lightTeal}88` : "transparent"
          },
          onMouseEnter: (e) => e.currentTarget.style.background = checked ? `${C.lightTeal}aa` : `${C.sand}66`,
          onMouseLeave: (e) => e.currentTarget.style.background = checked ? `${C.lightTeal}88` : "transparent"
        },
        /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked, onChange: () => {
          setSelOptItems((prev) => checked ? prev.filter((x) => x !== it.id) : [...prev, it.id]);
        }, style: { width: 18, height: 18, accentColor: C.teal, cursor: "pointer", flexShrink: 0 } }),
        /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18, flexShrink: 0 } }, typeIcon),
        /* @__PURE__ */ React.createElement("div", { style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 13, fontWeight: 600, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, it.title), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown } }, it.priority, " priority")),
        /* @__PURE__ */ React.createElement("span", { style: {
          fontSize: 10,
          fontWeight: 700,
          color: C.white,
          background: statusColor,
          padding: "2px 8px",
          borderRadius: 6,
          flexShrink: 0,
          fontFamily: "'Bangers', cursive",
          letterSpacing: 0.5
        } }, statusLabel)
      );
    })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement(Btn, { bg: selOptItems.length > 0 ? C.orange : "#aaa", style: { fontSize: 15, padding: "10px 22px", opacity: selOptItems.length > 0 ? 1 : 0.6, cursor: selOptItems.length > 0 ? "pointer" : "not-allowed" }, onClick: async () => {
      if (!sr || selOptItems.length === 0) return;
      const ok = await apiAction("/api/ruflo-optimize", { method: "POST", body: JSON.stringify({ repo_id: sr, item_ids: selOptItems }) }, `${selOptItems.length} item(s) re-queued`);
      if (ok) setSelOptItems([]);
    } }, "\u{1F9E8}", " Optimize ", selOptItems.length, " Selected ", selOptItems.length === 1 ? "Item" : "Items"), selOptItems.length > 0 && /* @__PURE__ */ React.createElement("span", { onClick: () => setSelOptItems([]), style: { fontSize: 12, color: C.brown, cursor: "pointer", textDecoration: "underline", fontWeight: 600 } }, "Clear all"), /* @__PURE__ */ React.createElement("span", { onClick: () => setSelOptItems(items.map((it) => it.id)), style: { fontSize: 12, color: C.brown, cursor: "pointer", textDecoration: "underline", fontWeight: 600, marginLeft: "auto" } }, "Select all"))), /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 8, letterSpacing: 1.5 } }, "\u{1F514}", " Browser Notifications"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: C.brown, marginBottom: 10 } }, "Get desktop notifications for cycle completions, errors, and budget alerts."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 12 } }, /* @__PURE__ */ React.createElement(Btn, { bg: browserNotifs ? C.green : "#999", style: { fontSize: 13, padding: "8px 18px" }, onClick: () => {
      if (!browserNotifs && Notification.permission !== "granted") {
        Notification.requestPermission().then((p) => {
          if (p === "granted") {
            setBrowserNotifs(true);
            localStorage.setItem("swarm-notifs", "1");
            showToast("Notifications enabled!", "success");
          } else showToast("Notifications blocked by browser", "warning");
        });
      } else {
        const next = !browserNotifs;
        setBrowserNotifs(next);
        localStorage.setItem("swarm-notifs", next ? "1" : "0");
        showToast(next ? "Notifications enabled" : "Notifications disabled", "info");
      }
    } }, browserNotifs ? "\u2705 Enabled" : "\u274C Disabled"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown } }, typeof Notification !== "undefined" ? `Browser permission: ${Notification.permission}` : "Not supported"))), browserNotifs && /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, marginBottom: 8, letterSpacing: 1.5 } }, "Notification Types"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } }, [
      { key: "cycles", label: "Cycle Complete", icon: "\u{1F504}", desc: "When a repo finishes a cycle" },
      { key: "errors", label: "Errors", icon: "\u26A0\uFE0F", desc: "When errors occur" },
      { key: "budget", label: "Budget Alerts", icon: "\u{1F4B0}", desc: "Cost threshold warnings" },
      { key: "stale", label: "Stale Items", icon: "\u23F0", desc: "Items stuck too long" }
    ].map((n) => /* @__PURE__ */ React.createElement("label", { key: n.key, style: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: C.white, borderRadius: 8, border: `1.5px solid ${notifPrefs[n.key] ? C.green : C.darkBrown}33`, cursor: "pointer", transition: "border-color 0.2s" } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: notifPrefs[n.key], onChange: () => {
      const next = { ...notifPrefs, [n.key]: !notifPrefs[n.key] };
      setNotifPrefs(next);
      localStorage.setItem("swarm-notif-prefs", JSON.stringify(next));
    }, style: { width: 16, height: 16, accentColor: C.green } }), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, fontWeight: 700 } }, n.icon, " ", n.label), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown } }, n.desc)))))), /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #E0F7FA 0%, #B2EBF2 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 8, letterSpacing: 1.5 } }, "\u23F1\uFE0F", " Refresh Interval"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: C.brown, marginBottom: 10 } }, "How often the dashboard polls for new data. Lower = more responsive, higher = less load."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8 } }, [{ ms: 1e3, label: "1s" }, { ms: 3e3, label: "3s" }, { ms: 5e3, label: "5s" }, { ms: 1e4, label: "10s" }, { ms: 3e4, label: "30s" }].map((opt) => /* @__PURE__ */ React.createElement(Btn, { key: opt.ms, bg: refreshInterval === opt.ms ? C.teal : "#bbb", style: { fontSize: 14, padding: "8px 18px", opacity: refreshInterval === opt.ms ? 1 : 0.7 }, onClick: () => {
      setRefreshInterval(opt.ms);
      localStorage.setItem("swarm-refresh", String(opt.ms));
      showToast(`Refresh interval set to ${opt.label}`, "info");
    } }, opt.label))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: C.brown, marginTop: 6 } }, "Current: every ", refreshInterval >= 1e3 ? `${refreshInterval / 1e3}s` : `${refreshInterval}ms`)), /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, ${C.cream} 0%, #FFF3CD 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 } }, "Model Routing"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 } }, [
      { label: "Architecture", model: "Opus", icon: "\u{1F3DB}\uFE0F", bg: C.lightOrange },
      { label: "Coding", model: "Sonnet", icon: "\u{1F4BB}", bg: C.lightTeal },
      { label: "Scanning", model: "Haiku", icon: "\u{1F50D}", bg: "#E8E0F0" }
    ].map((m, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { background: m.bg, border: `2px solid ${C.darkBrown}`, borderRadius: 10, padding: "10px 12px", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 20, marginBottom: 2 } }, m.icon), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1 } }, m.model), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: C.brown, fontWeight: 600 } }, m.label))))), /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 4, letterSpacing: 1.5 } }, "\u{1F3F7}\uFE0F", " Batch Tag Wrangler"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: C.brown, marginBottom: 12 } }, "Add or remove tags from multiple repos at once."), (() => {
      const allTags = [...new Set(repos.flatMap((r) => (r.tags || "").split(",").filter(Boolean)))].sort();
      return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" } }, allTags.map((tag) => /* @__PURE__ */ React.createElement("span", { key: tag, style: { fontSize: 10, padding: "3px 10px", borderRadius: 10, background: "#E8D5F5", color: "#7E57C2", fontWeight: 700, border: "1px solid #CE93D8" } }, tag, " (", repos.filter((r) => (r.tags || "").split(",").includes(tag)).length, ")")), allTags.length === 0 && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown } }, "No tags yet")), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center" } }, /* @__PURE__ */ React.createElement("input", { id: "batch-tag-input", placeholder: "Tag name", style: { padding: "6px 12px", borderRadius: 8, border: `2px solid ${C.darkBrown}`, fontSize: 12, flex: 1, fontFamily: "'Fredoka', sans-serif" } }), /* @__PURE__ */ React.createElement(Btn, { bg: C.green, style: { fontSize: 12, padding: "6px 14px" }, onClick: async () => {
        const tag = document.getElementById("batch-tag-input")?.value?.trim();
        if (!tag) return;
        const targets = repos.filter((r) => !r.archived);
        let added = 0;
        for (const r of targets) {
          const existing = (r.tags || "").split(",").filter(Boolean);
          if (!existing.includes(tag)) {
            await f(`/api/repos/tags`, { method: "POST", body: JSON.stringify({ repo_id: r.id, tags: [...existing, tag].join(",") }) });
            added++;
          }
        }
        showToast(`Added "${tag}" to ${added} repos`, "success");
        load();
      } }, "+ Add to All"), /* @__PURE__ */ React.createElement(Btn, { bg: C.red, style: { fontSize: 12, padding: "6px 14px" }, onClick: async () => {
        const tag = document.getElementById("batch-tag-input")?.value?.trim();
        if (!tag) return;
        let removed = 0;
        for (const r of repos) {
          const existing = (r.tags || "").split(",").filter(Boolean);
          if (existing.includes(tag)) {
            await f(`/api/repos/tags`, { method: "POST", body: JSON.stringify({ repo_id: r.id, tags: existing.filter((t) => t !== tag).join(",") }) });
            removed++;
          }
        }
        showToast(`Removed "${tag}" from ${removed} repos`, "success");
        load();
      } }, "- Remove from All")));
    })()), Object.keys(costs).length > 0 && /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #E8F5E9 0%, #C8E6C9 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 } }, "\u{1F4B0}", " API Cost Tracker"), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } }, repos.map((r) => {
      const cost = costs[r.id] || 0;
      return /* @__PURE__ */ React.createElement("div", { key: r.id, style: { background: C.white, borderRadius: 8, padding: "8px 12px", border: `1.5px solid ${C.darkBrown}33`, display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, r.name), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14, fontWeight: 700, color: cost > 1 ? C.red : cost > 0.1 ? C.orange : C.green, fontFamily: "'Bangers', cursive", letterSpacing: 0.5 } }, "$", cost.toFixed(2)));
    })), /* @__PURE__ */ React.createElement("div", { style: { textAlign: "right", marginTop: 8, fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1 } }, "Total: $", repoStats.totalCost.toFixed(2))), /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #FFF8E1 0%, #FFECB3 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 8, letterSpacing: 1.5 } }, "\u{1F4B8}", " Budget Limit"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: C.brown, marginBottom: 10 } }, "Set a max API cost. Repos auto-pause when exceeded. Set to 0 for unlimited."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 18, fontWeight: 700 } }, "$"), /* @__PURE__ */ React.createElement(
      Inp,
      {
        type: "number",
        min: "0",
        step: "0.50",
        placeholder: "0 = unlimited",
        defaultValue: budgetLimit || "",
        style: { maxWidth: 140, fontSize: 14, padding: "8px 12px" },
        onKeyDown: async (e) => {
          if (e.key === "Enter") {
            const val = parseFloat(e.target.value) || 0;
            const ok = await apiAction(
              "/api/budget",
              { method: "POST", body: JSON.stringify({ limit: val }) },
              val > 0 ? `Budget set to $${val.toFixed(2)}` : "Budget limit removed"
            );
            if (ok) setBudgetLimit(val);
          }
        }
      }
    ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown } }, "Press Enter to save"))), sr && /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #F3E5F5 0%, #E1BEE7 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 8, letterSpacing: 1.5 } }, "\u{1F3F7}\uFE0F", " Repo Tags"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: C.brown, marginBottom: 10 } }, 'Comma-separated tags for organizing repos (e.g. "frontend, react, priority").'), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center" } }, /* @__PURE__ */ React.createElement(
      Inp,
      {
        placeholder: "tag1, tag2, tag3",
        defaultValue: repo?.tags || "",
        style: { flex: 1, fontSize: 13, padding: "8px 12px" },
        onKeyDown: async (e) => {
          if (e.key === "Enter") {
            await apiAction("/api/repos/tags", { method: "POST", body: JSON.stringify({ repo_id: sr, tags: e.target.value }) }, "Tags updated");
          }
        }
      }
    ), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown } }, "Press Enter to save")), repo?.tags && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" } }, repo.tags.split(",").filter(Boolean).map((t) => /* @__PURE__ */ React.createElement("span", { key: t, style: { fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#CE93D8", color: C.white, fontWeight: 700 } }, t.trim())))), /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #FCE4EC 0%, #F8BBD0 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 8, letterSpacing: 1.5 } }, "\u{1F511}", " API Token"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: C.brown, marginBottom: 10 } }, "Rotate the bearer token if you suspect it's been compromised. All open sessions will need to re-authenticate."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, style: { fontSize: 14, padding: "10px 20px" }, onClick: () => {
      if (!__authToken) {
        showToast("No token available", "warning");
        return;
      }
      navigator.clipboard.writeText(__authToken).then(() => showToast("Token copied to clipboard!", "success")).catch(() => showToast("Copy failed", "error"));
    } }, "\u{1F4CB}", " Copy Token"), /* @__PURE__ */ React.createElement(Btn, { bg: C.red, style: { fontSize: 14, padding: "10px 20px" }, onClick: async () => {
      try {
        const r = await f("/api/token/rotate", { method: "POST" });
        if (r.ok) {
          const d = await r.json();
          __authToken = d.token;
          showToast("API token rotated. This session updated automatically.", "success");
        } else {
          showToast("Failed to rotate token", "error");
        }
      } catch (e) {
        showToast(`Rotation error: ${e.message}`, "error");
      }
    } }, "\u{1F504}", " Rotate Token"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown } }, "Current token prefix: ", __authToken ? __authToken.slice(0, 8) + "..." : "none"))), /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #E8EAF6 0%, #C5CAE9 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 8, letterSpacing: 1.5 } }, "\u2699\uFE0F", " Dashboard Preferences"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: C.brown, marginBottom: 10 } }, "Export or import your personal dashboard settings (dark mode, pinned repos, filters, notifications)."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 10 } }, /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, style: { fontSize: 13, padding: "8px 16px" }, onClick: () => {
      const prefs = { darkMode, pinnedRepos, itemFilter, repoSort, repoFilter, refreshInterval, browserNotifs, notifPrefs, compactItems };
      const blob = new Blob([JSON.stringify(prefs, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "swarm-dashboard-prefs.json";
      a.click();
      URL.revokeObjectURL(url);
      showToast("Preferences exported", "success");
    } }, "\u{1F4E5}", " Export Prefs"), /* @__PURE__ */ React.createElement(Btn, { bg: C.orange, style: { fontSize: 13, padding: "8px 16px" }, onClick: () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async (ev) => {
        try {
          const text = await ev.target.files[0].text();
          const p = JSON.parse(text);
          if (p.darkMode !== void 0) {
            setDarkMode(p.darkMode);
            localStorage.setItem("swarm-dark", p.darkMode ? "1" : "0");
          }
          if (p.pinnedRepos) {
            setPinnedRepos(p.pinnedRepos);
            localStorage.setItem("swarm-pinned", JSON.stringify(p.pinnedRepos));
          }
          if (p.itemFilter) {
            setItemFilter(p.itemFilter);
            localStorage.setItem("swarm-item-filter", p.itemFilter);
          }
          if (p.repoSort) {
            setRepoSort(p.repoSort);
            localStorage.setItem("swarm-repo-sort", p.repoSort);
          }
          if (p.refreshInterval) {
            setRefreshInterval(p.refreshInterval);
            localStorage.setItem("swarm-refresh", String(p.refreshInterval));
          }
          if (p.notifPrefs) {
            setNotifPrefs(p.notifPrefs);
            localStorage.setItem("swarm-notif-prefs", JSON.stringify(p.notifPrefs));
          }
          showToast("Preferences imported!", "success");
        } catch (e) {
          showToast("Invalid preferences file", "error");
        }
      };
      input.click();
    } }, "\u{1F4E4}", " Import Prefs"))), /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 } }, "\u{1F4BE}", " Backup & Restore"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, style: { fontSize: 14, padding: "10px 20px" }, onClick: async () => {
      try {
        const r = await f("/api/repos/export");
        if (r.ok) {
          const data = await r.json();
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `swarm-town-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
          a.click();
          URL.revokeObjectURL(url);
          showToast("Backup exported", "success");
        }
      } catch (e) {
        showToast(`Export error: ${e.message}`, "error");
      }
    } }, "\u{1F4E5}", " Export All Repos"), /* @__PURE__ */ React.createElement(Btn, { bg: C.orange, style: { fontSize: 14, padding: "10px 20px" }, onClick: () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json";
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const text = await file.text();
        try {
          const data = JSON.parse(text);
          await apiAction("/api/repos/import", { method: "POST", body: JSON.stringify({ repos: data.repos || data }) }, "Repos imported");
        } catch (err) {
          showToast(`Import error: ${err.message}`, "error");
        }
      };
      input.click();
    } }, "\u{1F4E4}", " Import Repos"))), /* @__PURE__ */ React.createElement(Card, { bg: C.cream, style: { marginBottom: 16, padding: 18, background: `linear-gradient(135deg, #FFF3E0 0%, #FFE0B2 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, marginBottom: 10, letterSpacing: 1.5 } }, "\u{1F514}", " Webhooks"), /* @__PURE__ */ React.createElement("p", { style: { fontSize: 12, color: C.brown, marginBottom: 10 } }, "Register HTTP callbacks for real-time events (state changes, logs, errors)."), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(Inp, { placeholder: "Webhook URL (https://...)", value: newWebhook.url, onChange: (e) => setNewWebhook((p) => ({ ...p, url: e.target.value })), style: { flex: 1, minWidth: 200 } }), /* @__PURE__ */ React.createElement(
      "select",
      {
        value: newWebhook.events,
        onChange: (e) => setNewWebhook((p) => ({ ...p, events: e.target.value })),
        style: { padding: "8px 12px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, fontSize: 12, fontFamily: "'Fredoka',sans-serif", fontWeight: 600 }
      },
      /* @__PURE__ */ React.createElement("option", { value: "*" }, "All Events"),
      /* @__PURE__ */ React.createElement("option", { value: "state_change" }, "State Changes"),
      /* @__PURE__ */ React.createElement("option", { value: "cycle_complete" }, "Cycle Complete"),
      /* @__PURE__ */ React.createElement("option", { value: "budget_exceeded" }, "Budget Exceeded"),
      /* @__PURE__ */ React.createElement("option", { value: "log" }, "Logs"),
      /* @__PURE__ */ React.createElement("option", { value: "error_event" }, "Errors"),
      /* @__PURE__ */ React.createElement("option", { value: "watchdog" }, "Watchdog")
    ), /* @__PURE__ */ React.createElement(Btn, { bg: C.teal, style: { fontSize: 13, padding: "8px 16px" }, onClick: async () => {
      if (!newWebhook.url) return;
      const events = newWebhook.events === "*" ? ["*"] : [newWebhook.events];
      await apiAction("/api/webhooks", { method: "POST", body: JSON.stringify({ url: newWebhook.url, events }) }, "Webhook registered");
      setNewWebhook({ url: "", events: "*" });
    } }, "+ Add")), webhooks.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { border: `2px solid ${C.darkBrown}33`, borderRadius: 10, background: C.white, overflow: "hidden" } }, webhooks.map((wh) => /* @__PURE__ */ React.createElement("div", { key: wh.id, style: { display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: `1px solid ${C.darkBrown}15` } }, /* @__PURE__ */ React.createElement("span", { style: { flex: 1, fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, wh.url), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: C.brown, background: C.lightTeal, padding: "2px 8px", borderRadius: 6, fontWeight: 600 } }, wh.events.join(", ")), /* @__PURE__ */ React.createElement("button", { onClick: async () => {
      await apiAction("/api/webhooks/delete", { method: "POST", body: JSON.stringify({ id: wh.id }) }, "Webhook removed");
    }, style: { background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.red, padding: "2px 6px" } }, "\u2716")))), webhooks.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { fontSize: 12, color: C.brown, textAlign: "center", padding: 10 } }, "No webhooks registered")), repos.map((r) => {
      const cfg = r.stats?.ruflo_config || {};
      return /* @__PURE__ */ React.createElement(Card, { key: r.id, className: "hover-lift", style: { marginBottom: 10, padding: 16, background: `linear-gradient(135deg, ${C.white} 0%, ${C.cream} 100%)` } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 18, letterSpacing: 1 } }, r.name), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 12, color: C.teal, background: C.lightTeal, padding: "3px 12px", borderRadius: 8, border: `2px solid ${C.teal}`, fontWeight: 600 } }, cfg.project_type || "auto-detect")), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 } }, [
        { label: "Agents", val: cfg.agents || "8", bg: C.lightOrange },
        { label: "Arch", val: cfg.model_arch || "opus", bg: C.lightTeal },
        { label: "Code", val: cfg.model_code || "sonnet", bg: C.cream },
        { label: "Scan", val: cfg.model_scan || "haiku", bg: "#E8E0F0" }
      ].map((x, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { background: x.bg, borderRadius: 8, padding: "6px 8px", textAlign: "center", border: `1.5px solid ${C.darkBrown}44` } }, /* @__PURE__ */ React.createElement("div", { style: { fontWeight: 700, fontSize: 13 } }, x.val), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: C.brown, fontWeight: 600 } }, x.label)))));
    })))), showCommandPalette && /* @__PURE__ */ React.createElement("div", { onClick: () => setShowCommandPalette(false), style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "15vh" } }, /* @__PURE__ */ React.createElement("div", { onClick: (e) => e.stopPropagation(), style: { background: darkMode ? "#2D2D2D" : C.white, border: `3px solid ${C.darkBrown}`, borderRadius: 16, padding: 16, width: "90%", maxWidth: 500, boxShadow: "0 16px 48px rgba(0,0,0,0.3)" } }, /* @__PURE__ */ React.createElement(
      "input",
      {
        autoFocus: true,
        placeholder: "Type a command... (go items, start, stop, dark, refresh)",
        value: cmdQuery,
        onChange: (e) => setCmdQuery(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Escape") {
            setShowCommandPalette(false);
            return;
          }
          if (e.key !== "Enter") return;
          const q = cmdQuery.toLowerCase().trim();
          const TABS_LIST = ["home", "master", "flow", "items", "plan", "audio", "agents", "memory", "mistakes", "logs", "history", "health", "metrics", "trends", "compare", "settings"];
          const goTab = TABS_LIST.find((t) => q === t || q === "go " + t);
          if (goTab) {
            setTab(goTab);
            setShowCommandPalette(false);
            return;
          }
          if (q === "start" && sr) {
            f("/api/start", { method: "POST", body: JSON.stringify({ repo_id: sr }) }).then(load);
          }
          if (q === "stop" && sr) {
            f("/api/stop", { method: "POST", body: JSON.stringify({ repo_id: sr }) }).then(load);
          }
          if (q === "start all") {
            startAll();
          }
          if (q === "stop all") {
            stopAll();
          }
          if (q === "pause" && sr) {
            pauseRepo(sr);
          }
          if (q === "resume" && sr) {
            resumeRepo(sr);
          }
          if (q === "dark" || q === "theme") {
            toggleDark();
          }
          if (q === "refresh" || q === "reload") {
            load(true);
          }
          if (q === "export items" && sr) {
            const data = items.map((it) => ({ title: it.title, type: it.type, priority: it.priority, status: it.status }));
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "items.json";
            a.click();
            URL.revokeObjectURL(url);
          }
          if (q === "export logs") {
            exportLogs();
          }
          if (q === "health") {
            setTab("health");
            scanHealth();
          }
          if (q === "help" || q === "?") {
            setShowHelp(true);
          }
          if (q.startsWith("search ")) {
            setTab("master");
            setGlobalSearch(q.slice(7));
            searchGlobal(q.slice(7));
          }
          setShowCommandPalette(false);
        },
        style: { width: "100%", padding: "12px 16px", fontSize: 16, border: `2px solid ${C.darkBrown}`, borderRadius: 12, outline: "none", fontFamily: "'Fredoka', sans-serif", background: darkMode ? "#3D3D3D" : C.cream, color: darkMode ? "#E0E0E0" : C.darkBrown }
      }
    ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10, fontSize: 11, color: C.brown } }, ["home", "items", "plan", "logs", "health", "settings", "start", "stop", "pause", "start all", "stop all", "dark", "refresh", "export items", "export logs", "help"].map((cmd) => /* @__PURE__ */ React.createElement("span", { key: cmd, onClick: () => {
      setCmdQuery(cmd);
    }, style: { padding: "3px 10px", borderRadius: 8, background: darkMode ? "#444" : C.cream, cursor: "pointer", border: `1px solid ${C.darkBrown}33` } }, cmd))))), showQuickAdd && /* @__PURE__ */ React.createElement("div", { onClick: () => setShowQuickAdd(false), style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("div", { onClick: (e) => e.stopPropagation(), style: { background: C.cream, border: `4px solid ${C.darkBrown}`, borderRadius: 16, padding: 24, maxWidth: 380, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 22, marginBottom: 12, letterSpacing: 1.5 } }, "\u26A1", " Quick Add Item"), /* @__PURE__ */ React.createElement(Inp, { id: "quick-add-title", placeholder: "Item title...", style: { marginBottom: 8, fontSize: 14 }, onKeyDown: async (e) => {
      if (e.key === "Enter" && sr) {
        const title = e.target.value.trim();
        if (!title) return;
        const prio = document.getElementById("quick-add-prio")?.value || "medium";
        await f("/api/items", { method: "POST", body: JSON.stringify({ repo_id: sr, title, type: "feature", priority: prio }) });
        showToast(`Added: ${title}`, "success");
        setShowQuickAdd(false);
        load();
      }
      if (e.key === "Escape") setShowQuickAdd(false);
    } }), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement("select", { id: "quick-add-prio", defaultValue: "medium", style: { padding: "8px 12px", background: C.cream, border: `3px solid ${C.darkBrown}`, borderRadius: 10, fontSize: 12, fontFamily: "'Fredoka',sans-serif", fontWeight: 600 } }, ["low", "medium", "high", "critical"].map((p) => /* @__PURE__ */ React.createElement("option", { key: p, value: p }, p))), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 11, color: C.brown } }, "Press Enter to add", !sr && " (select a repo first)")))), /* @__PURE__ */ React.createElement("div", { style: { position: "fixed", bottom: 0, left: 0, right: 0, background: darkMode ? "#1E1E2E" : C.darkBrown, color: C.white, display: "flex", justifyContent: "center", gap: 16, padding: "3px 12px", fontSize: 9, fontFamily: "'Fredoka', sans-serif", zIndex: 50, opacity: 0.9 } }, /* @__PURE__ */ React.createElement("span", null, repos.length, " repos"), /* @__PURE__ */ React.createElement("span", null, repoStats.running > 0 ? /* @__PURE__ */ React.createElement(React.Fragment, null, repoStats.running, " running ", /* @__PURE__ */ React.createElement("span", { style: { display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: C.green, animation: "pulse 1.5s infinite", verticalAlign: "middle" } })) : "0 running"), /* @__PURE__ */ React.createElement("span", null, repoStats.totalDone, "/", repoStats.totalItems, " items"), /* @__PURE__ */ React.createElement("span", { style: { color: totalCost > 5 ? "#FF6B6B" : totalCost > 1 ? "#FFD93D" : "#6BCB77", fontWeight: 700 } }, "$", totalCost.toFixed(2)), /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.6, display: "flex", alignItems: "center", gap: 4 } }, lastRefresh ? `${Math.floor((Date.now() - lastRefresh) / 1e3)}s` : "", /* @__PURE__ */ React.createElement("span", { style: { display: "inline-block", width: 24, height: 3, borderRadius: 2, background: `${C.white}33`, overflow: "hidden" } }, /* @__PURE__ */ React.createElement("span", { style: { display: "block", height: "100%", borderRadius: 2, background: C.green, width: `${Math.min(100, Math.max(0, lastRefresh ? (Date.now() - lastRefresh) / refreshInterval * 100 : 0))}%`, transition: "width 1s linear" } })))), showHelp && /* @__PURE__ */ React.createElement("div", { onClick: () => setShowHelp(false), style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("div", { onClick: (e) => e.stopPropagation(), style: { background: C.cream, border: `4px solid ${C.darkBrown}`, borderRadius: 16, padding: 28, maxWidth: 480, width: "90%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.3), 6px 6px 0 #3D2B1F" } }, /* @__PURE__ */ React.createElement("h3", { style: { fontFamily: "'Bangers', cursive", fontSize: 28, letterSpacing: 2, marginBottom: 16, textAlign: "center", color: C.darkBrown } }, "\u2328\uFE0F", " Keyboard Shortcuts"), [
      { title: "\u{1F9ED} Navigation", shortcuts: [
        ["1-9", "Switch to tab 1-9"],
        ["0", "Logs tab"],
        ["[ / ]", "Previous / Next tab"],
        ["J / K", "Navigate repos (Master view)"],
        ["Enter", "Open focused repo (Master view)"]
      ] },
      { title: "\u26A1 Actions", shortcuts: [
        ["R", "Refresh all data"],
        ["S", "Start / Stop selected repo"],
        ["P", "Pause / Resume selected repo"],
        ["D", "Toggle dark mode"],
        ["N", "New bounty (focus item title)"],
        ["Alt+I", "Quick-add item modal"],
        ["/", "Focus command center"],
        ["Ctrl+K", "Command palette"]
      ] },
      { title: "\u{1F50D} Filters", shortcuts: [
        ["F", "Focus search / filter input"],
        ["Shift+F", "Cycle repo filter (all/running/idle/paused/error)"],
        ["C", "Clear all filters & selections"]
      ] },
      { title: "\u{1F4A1} General", shortcuts: [
        ["?", "Toggle this help"],
        ["Esc", "Close overlays / deselect"]
      ] }
    ].map((section) => /* @__PURE__ */ React.createElement("div", { key: section.title, style: { marginBottom: 14 } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 16, letterSpacing: 1, color: C.brown, marginBottom: 6, borderBottom: `2px solid ${C.darkBrown}22`, paddingBottom: 4 } }, section.title), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 14px", fontSize: 13 } }, section.shortcuts.map(([key, desc]) => /* @__PURE__ */ React.createElement(React.Fragment, { key }, /* @__PURE__ */ React.createElement("kbd", { style: { background: C.white, border: `2px solid ${C.darkBrown}`, borderRadius: 6, padding: "2px 8px", fontFamily: "'Bangers', cursive", fontSize: 14, textAlign: "center", boxShadow: `2px 2px 0 ${darkMode ? "#000" : "#3D2B1F"}`, whiteSpace: "nowrap" } }, key), /* @__PURE__ */ React.createElement("span", { style: { display: "flex", alignItems: "center", color: C.darkBrown } }, desc)))))), /* @__PURE__ */ React.createElement("p", { style: { textAlign: "center", marginTop: 12, fontSize: 11, color: C.brown } }, "Press ? or Esc to close"))), confirmDialog && /* @__PURE__ */ React.createElement("div", { onClick: () => setConfirmDialog(null), style: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1e4, display: "flex", alignItems: "center", justifyContent: "center" } }, /* @__PURE__ */ React.createElement("div", { onClick: (e) => e.stopPropagation(), style: { background: C.cream, border: `4px solid ${C.darkBrown}`, borderRadius: 16, padding: 24, maxWidth: 360, width: "90%", boxShadow: "0 8px 32px rgba(0,0,0,0.3), 6px 6px 0 #3D2B1F", textAlign: "center" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 36, marginBottom: 8 } }, "\u26A0\uFE0F"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "'Bangers', cursive", fontSize: 20, letterSpacing: 1, marginBottom: 12, color: C.darkBrown } }, confirmDialog.message), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 12, justifyContent: "center" } }, /* @__PURE__ */ React.createElement(Btn, { bg: C.red, onClick: () => {
      confirmDialog.onConfirm();
      setConfirmDialog(null);
    }, style: { fontSize: 14, padding: "10px 24px" } }, "Confirm"), /* @__PURE__ */ React.createElement(Btn, { bg: "#888", onClick: () => setConfirmDialog(null), style: { fontSize: 14, padding: "10px 24px" } }, "Cancel")))), /* @__PURE__ */ React.createElement("div", { className: "toast-container" }, toasts.map((t) => /* @__PURE__ */ React.createElement("div", { key: t.id, className: `toast toast-${t.type}` }, t.message))));
  }
  function App() {
    return React.createElement(ErrorBoundary, null, React.createElement(Dashboard));
  }
  if (typeof document !== "undefined") {
    const rootEl = document.getElementById("root");
    if (rootEl) {
      const root = ReactDOM.createRoot(rootEl);
      root.render(React.createElement(App));
    }
  }
})();
