const fs = require('fs');
const path = require('path');

function loadPlaywright() {
  const candidates = [
    path.join(__dirname, '..', 'output', 'playwright-runner', 'node_modules', 'playwright-core'),
    path.join(__dirname, '..', 'node_modules', 'playwright'),
    'playwright',
  ];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (_) {}
  }
  throw new Error('Playwright is not available. Install playwright or keep output/playwright-runner intact.');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key.startsWith('--')) {
      args[key.slice(2)] = next && !next.startsWith('--') ? next : 'true';
      if (next && !next.startsWith('--')) i += 1;
    }
  }
  return args;
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

async function apiJson(baseUrl, route, opts = {}) {
  const res = await fetch(`${baseUrl}${route}`, opts);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    data = text;
  }
  return { status: res.status, ok: res.ok, data, text };
}

async function getToken(baseUrl) {
  const tokenRes = await apiJson(baseUrl, '/api/token');
  if (!tokenRes.ok || !tokenRes.data || !tokenRes.data.token) {
    throw new Error(`Unable to load API token: ${tokenRes.status} ${tokenRes.text}`);
  }
  return tokenRes.data.token;
}

async function authedJson(baseUrl, token, route, opts = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    ...(opts.headers || {}),
  };
  return apiJson(baseUrl, route, {
    method: opts.method || 'GET',
    headers,
    body: opts.body,
  });
}

async function waitFor(fn, timeoutMs, label) {
  const started = Date.now();
  let lastValue = null;
  while (Date.now() - started < timeoutMs) {
    lastValue = await fn();
    if (lastValue) return lastValue;
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

(async () => {
  const args = parseArgs(process.argv);
  const baseUrl = (args.url || 'http://127.0.0.1:6969').replace(/\/$/, '');
  const repoId = Number(args.repoId || args['repo-id']);
  const repoName = args.repoName || args['repo-name'] || 'swarm-town-smoke-repo';
  const ttlSec = Number(args.ttl || 20);
  const outDir = path.join(process.cwd(), 'output', 'playwright');
  const browserModule = loadPlaywright();
  const chromium = browserModule.chromium;
  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const launchOptions = {
    headless: true,
    args: ['--disable-gpu', '--no-first-run', '--no-default-browser-check'],
  };
  if (fs.existsSync(edgePath)) launchOptions.executablePath = edgePath;
  fs.mkdirSync(outDir, { recursive: true });

  if (!Number.isFinite(repoId)) {
    throw new Error('--repo-id is required');
  }

  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const events = [];

  page.on('console', msg => {
    events.push(`console:${msg.type()}:${msg.text()}`);
  });
  page.on('pageerror', err => {
    events.push(`pageerror:${err.message}`);
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      events.push(`response:${response.status()}:${response.url()}`);
    }
  });

  const token = await getToken(baseUrl);

  const startWithoutSession = await authedJson(baseUrl, token, '/api/start', {
    method: 'POST',
    body: JSON.stringify({ repo_id: repoId }),
  });

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(6000);

  await waitFor(async () => {
    const status = await apiJson(baseUrl, '/api/status');
    return status.ok && status.data && status.data.dashboard_sessions > 0 ? status.data : null;
  }, 20000, 'dashboard session registration');

  await page.screenshot({ path: path.join(outDir, 'dashboard-lifecycle-open.png'), fullPage: true });

  const startWithSession = await authedJson(baseUrl, token, '/api/start', {
    method: 'POST',
    body: JSON.stringify({ repo_id: repoId }),
  });
  if (!startWithSession.ok || !startWithSession.data || !startWithSession.data.ok) {
    throw new Error(`Unable to start repo ${repoId}: ${startWithSession.status} ${JSON.stringify(startWithSession.data)}`);
  }

  const managedSnapshot = await waitFor(async () => {
    const reposRes = await authedJson(baseUrl, token, '/api/repos');
    if (!reposRes.ok || !Array.isArray(reposRes.data)) return null;
    const repos = reposRes.data;
    const active = repos.filter(repo => repo.managed || repo.busy);
    const target = repos.find(repo => repo.id === repoId);
    if (!target || !target.managed) return null;
    if (active.length !== 1 || active[0].id !== repoId) return null;
    return { repos, target };
  }, 30000, `repo ${repoId} to be the only managed repo`);

  await page.waitForTimeout(12000);
  await page.screenshot({ path: path.join(outDir, 'dashboard-lifecycle-running.png'), fullPage: true });

  const requestLogWhileOpen = await authedJson(baseUrl, token, '/api/request-log?limit=200');

  await page.close({ runBeforeUnload: true });
  await context.close();
  await browser.close();

  const stoppedSnapshot = await waitFor(async () => {
    const status = await apiJson(baseUrl, '/api/status');
    if (!status.ok || !status.data) return null;
    if (status.data.dashboard_sessions !== 0) return null;
    const reposRes = await authedJson(baseUrl, token, '/api/repos');
    if (!reposRes.ok || !Array.isArray(reposRes.data)) return null;
    const active = reposRes.data.filter(repo => repo.managed || repo.busy);
    return active.length === 0 ? { status: status.data, repos: reposRes.data } : null;
  }, Math.max(30000, (ttlSec + 10) * 1000), 'all repo work to stop after dashboard close');

  let settledStatus = stoppedSnapshot.status;
  try {
    settledStatus = await waitFor(async () => {
      const status = await apiJson(baseUrl, '/api/status');
      if (!status.ok || !status.data) return null;
      return status.data.dashboard_sessions === 0 && status.data.repos_managed === 0 && status.data.repos_running === 0 && status.data.sse_clients === 0
        ? status.data
        : null;
    }, 10000, 'SSE clients to drain after dashboard close');
  } catch (_) {}

  const requestLogAfterClose = await authedJson(baseUrl, token, '/api/request-log?limit=200');

  const failures = events.filter(line =>
    line.startsWith('pageerror:') ||
    line.includes('Dashboard crash:') ||
    line.includes('Swarm Town Hit a Cactus!') ||
    line.includes('TypeError: Cannot read properties of undefined') ||
    line.includes('response:429:') ||
    line.includes('response:401:') ||
    line.includes('response:404:')
  );
  const babelWarnings = events.filter(line => line.includes('You are using the in-browser Babel transformer'));
  const request429sWhileOpen = (requestLogWhileOpen.data && requestLogWhileOpen.data.requests || []).filter(row => row.status === 429);
  const request429sAfterClose = (requestLogAfterClose.data && requestLogAfterClose.data.requests || []).filter(row => row.status === 429);

  const result = {
    repoId,
    repoName,
    startWithoutSession: startWithoutSession.data,
    startWithSession: startWithSession.data,
    managedRepo: {
      id: managedSnapshot.target.id,
      name: managedSnapshot.target.name,
      managed: managedSnapshot.target.managed,
      busy: managedSnapshot.target.busy,
      state: managedSnapshot.target.state,
    },
    dashboardClosedStatus: settledStatus,
    request429sWhileOpen,
    request429sAfterClose,
    failures,
    babelWarnings,
    events,
  };

  console.log(JSON.stringify(result, null, 2));

  if (failures.length > 0 || request429sWhileOpen.length > 0 || request429sAfterClose.length > 0) {
    process.exit(1);
  }
})().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
