import os
from pathlib import Path

from playwright.sync_api import sync_playwright


output = Path(__file__).resolve().parents[1] / "artifacts"
output.mkdir(exist_ok=True)
base_url = os.environ.get("BASE_URL", "http://127.0.0.1:4173/")
test_username = os.environ.get("TEST_USERNAME")
test_password = os.environ.get("TEST_PASSWORD")
test_display_name = os.environ.get("TEST_DISPLAY_NAME", "Maria")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.set_default_timeout(10000)
    console_errors: list[str] = []
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)

    page.goto(base_url)
    page.wait_for_load_state("networkidle")
    page.screenshot(path=str(output / "login-desktop.png"), full_page=True)
    if page.locator(".demo-entry button").count():
        page.locator(".demo-entry button").click()
    elif test_username and test_password:
        page.locator("#username").fill(test_username)
        page.locator("#password").fill(test_password)
        page.get_by_role("button", name="Entrar", exact=True).click()
    else:
        raise AssertionError("Provide TEST_USERNAME and TEST_PASSWORD for a Supabase-enabled deployment")
    page.wait_for_url("**/#/app")
    page.locator("h1", has_text=f"{test_display_name}.").wait_for()
    page.get_by_role("link", name="Ver jornada").click()
    page.get_by_role("heading", name="Sua jornada").wait_for()
    page.locator(".path-node a").first.click()
    page.wait_for_timeout(2500)
    if not page.locator("h1", has_text="Hello!").count():
        page.screenshot(path=str(output / "lesson-error.png"), full_page=True)
        raise AssertionError(f"Lesson did not open. Body: {page.locator('body').inner_text()[:2000]}; console: {console_errors}")
    page.locator("h1", has_text="Hello!").wait_for()
    page.get_by_role("navigation", name="Navegar entre lições").wait_for()
    page.get_by_role("navigation", name="Navegar pelo conteúdo da lição").wait_for()
    assert page.get_by_text("1 / 12", exact=True).count() == 1
    page.get_by_role("button", name="Próximo", exact=True).click()
    page.get_by_text("2 / 12", exact=True).wait_for()
    page.get_by_role("button", name="Próxima lição").click()
    page.get_by_role("heading", name="Me and My Family").wait_for()
    page.get_by_role("heading", name="Conteúdo em preparação").wait_for()
    assert page.get_by_role("heading", name="Terminou por hoje?").count() == 0
    page.get_by_role("button", name="Lição anterior").click()
    page.locator("h1", has_text="Hello!").wait_for()
    page.screenshot(path=str(output / "lesson-desktop.png"), full_page=True)
    page.get_by_role("link", name="Admin", exact=True).click()
    page.get_by_role("heading", name="Áudio das lições").wait_for()
    page.get_by_role("button", name="Tentar novamente").wait_for()
    page.screenshot(path=str(output / "admin-audio-desktop.png"), full_page=True)

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile.set_default_timeout(10000)
    mobile.goto(base_url)
    mobile.wait_for_load_state("networkidle")
    mobile.screenshot(path=str(output / "login-mobile.png"), full_page=True)
    if mobile.locator(".demo-entry button").count():
        mobile.locator(".demo-entry button").click()
    elif test_username and test_password:
        mobile.locator("#username").fill(test_username)
        mobile.locator("#password").fill(test_password)
        mobile.get_by_role("button", name="Entrar", exact=True).click()
    mobile.wait_for_url("**/#/app")
    mobile.get_by_role("link", name="Ver jornada").click()
    mobile.locator(".path-node a").first.click()
    mobile.locator("h1", has_text="Hello!").wait_for()
    mobile.get_by_role("navigation", name="Navegar pelo conteúdo da lição").wait_for()
    assert mobile.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
    mobile.screenshot(path=str(output / "lesson-mobile.png"), full_page=True)

    if console_errors:
        raise AssertionError(f"Browser console errors: {console_errors}")
    browser.close()
