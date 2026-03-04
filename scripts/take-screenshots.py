"""Take screenshots of each dashboard tab using Playwright."""
import time
from playwright.sync_api import sync_playwright

URL = "http://localhost:6969"
OUT = "docs/screenshots"

TABS = [
    ("home", "home"),
    ("master", "view-all"),
    ("flow", "flow"),
    ("items", "bounty-board"),
    ("plan", "plan"),
    ("audio", "audio"),
    ("agents", "agents"),
    ("memory", "memory"),
    ("mistakes", "mistakes"),
    ("logs", "logs"),
    ("history", "history"),
    ("health", "health"),
    ("settings", "settings"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # First load + fetch token
    page.goto(URL, wait_until="networkidle")
    # Wait for React to render and data to load
    time.sleep(4)

    # Fetch and set auth token
    token = page.evaluate("""() => {
        return fetch('http://localhost:6969/api/token')
            .then(r => r.json())
            .then(d => d.token);
    }""")
    page.evaluate(f"() => {{ window.__authToken = '{token}'; __authToken = '{token}'; }}")
    time.sleep(1)

    for tab_id, filename in TABS:
        print(f"Capturing {tab_id} -> {filename}.png")
        # Click the tab by finding element with matching text
        # Tabs use data-tab or we click by text
        try:
            # Try clicking the tab via its id in the tab bar
            page.evaluate(f"""() => {{
                const tabs = document.querySelectorAll('[style*="cursor: pointer"]');
                for (const t of tabs) {{
                    const text = t.textContent.toLowerCase();
                    const tabMap = {{
                        'home': 'town square',
                        'master': 'view all',
                        'flow': 'road map',
                        'items': 'bounty board',
                        'plan': 'build plan',
                        'audio': 'voice review',
                        'agents': 'the crew',
                        'memory': 'memory',
                        'mistakes': 'mistakes',
                        'logs': 'logs',
                        'history': 'history',
                        'health': 'health check',
                        'settings': 'settings',
                    }};
                    if (text.includes(tabMap['{tab_id}'] || '{tab_id}')) {{
                        t.click();
                        return true;
                    }}
                }}
                return false;
            }}""")
        except Exception as e:
            print(f"  Tab click via evaluate failed: {e}")
            # Fallback: try text-based click
            try:
                tab_texts = {
                    "home": "Town Square",
                    "master": "View All",
                    "flow": "Road Map",
                    "items": "Bounty Board",
                    "plan": "Build Plan",
                    "audio": "Voice Review",
                    "agents": "The Crew",
                    "memory": "Memory",
                    "mistakes": "Mistakes",
                    "logs": "Logs",
                    "history": "History",
                    "health": "Health Check",
                    "settings": "Settings",
                }
                page.get_by_text(tab_texts[tab_id]).first.click()
            except Exception as e2:
                print(f"  Fallback click failed: {e2}")

        time.sleep(2)  # Wait for tab content to load
        page.screenshot(path=f"{OUT}/{filename}.png", full_page=False)
        print(f"  Saved {filename}.png")

    browser.close()
    print("Done! All screenshots captured.")
