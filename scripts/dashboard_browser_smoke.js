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

(async () => {
  const args = parseArgs(process.argv);
  const url = args.url || 'http://127.0.0.1:6969/';
  const screenshotPath = args.screenshot || path.join(process.cwd(), 'output', 'playwright', 'swarm-dashboard-smoke.png');
  const browserModule = loadPlaywright();
  const chromium = browserModule.chromium;
  const edgePath = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const launchOptions = {
    headless: true,
    args: ['--disable-gpu', '--no-first-run', '--no-default-browser-check'],
  };
  if (fs.existsSync(edgePath)) {
    launchOptions.executablePath = edgePath;
  }

  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  const events = [];

  page.on('console', msg => {
    const text = msg.text();
    events.push(`console:${msg.type()}:${text}`);
  });
  page.on('pageerror', err => {
    events.push(`pageerror:${err.message}`);
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      events.push(`response:${response.status()}:${response.url()}`);
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  const bodyText = await page.locator('body').innerText();
  const failures = events.filter(line =>
    line.includes('Dashboard crash:') ||
    line.startsWith('pageerror:') ||
    line.includes('Swarm Town Hit a Cactus!') ||
    line.includes('TypeError: Cannot read properties of undefined')
  );

  const result = {
    title: await page.title(),
    url,
    screenshotPath,
    failures,
    events,
    bodySnippet: bodyText.slice(0, 800),
  };

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (failures.length > 0) process.exit(1);
})().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
