"""Take screenshots of every dashboard tab for the README."""
import os
import time
from playwright.sync_api import sync_playwright

URL = "http://localhost:6969"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "docs", "screenshots")
os.makedirs(OUT, exist_ok=True)

# Tab indices and names (matching the dashboard's tab order)
TABS = [
    (0, "home"),
    (1, "flow"),
    (2, "bounty-board"),
    (3, "plan"),
    (4, "audio"),
    (5, "agents"),
    (6, "memory"),
    (7, "mistakes"),
    (8, "logs"),
]

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900})

        # Load dashboard
        page.goto(URL, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(3000)

        for idx, name in TABS:
            # Click the tab
            if idx > 0:
                # Find tab buttons by their position
                tabs = page.locator("div[style*='cursor: pointer'][style*='padding']")
                count = tabs.count()
                if idx < count:
                    tabs.nth(idx).click()
                    page.wait_for_timeout(1500)

            path = os.path.join(OUT, f"{name}.png")
            page.screenshot(path=path)
            print(f"  Saved: {name}.png")

        browser.close()
        print(f"\nAll screenshots saved to {OUT}")

if __name__ == "__main__":
    main()
