import os
from pathlib import Path

from playwright.sync_api import sync_playwright


output = Path(__file__).resolve().parents[1] / "artifacts"
output.mkdir(exist_ok=True)
base_url = os.environ.get("BASE_URL", "http://127.0.0.1:4173/")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    console_errors: list[str] = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)

    page.goto(base_url)
    page.wait_for_load_state("networkidle")
    page.screenshot(path=str(output / "login-desktop.png"), full_page=True)
    page.locator(".demo-entry button").click()
    page.wait_for_url("**/#/app")
    page.locator("h1", has_text="Maria.").wait_for()
    page.get_by_role("link", name="Ver jornada").click()
    page.get_by_role("heading", name="Sua jornada").wait_for()
    page.get_by_role("link", name="Hello!, current").click()
    page.locator("h1", has_text="Hello!").wait_for()
    page.screenshot(path=str(output / "lesson-desktop.png"), full_page=True)

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile.goto(base_url)
    mobile.wait_for_load_state("networkidle")
    mobile.screenshot(path=str(output / "login-mobile.png"), full_page=True)

    if console_errors:
        raise AssertionError(f"Browser console errors: {console_errors}")
    browser.close()
