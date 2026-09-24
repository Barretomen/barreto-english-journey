import os
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


output = Path(__file__).resolve().parents[1] / "artifacts"
output.mkdir(exist_ok=True)
base_url = os.environ.get("BASE_URL", "http://127.0.0.1:4173/")
test_username = os.environ.get("TEST_USERNAME")
test_password = os.environ.get("TEST_PASSWORD")
test_display_name = os.environ.get("TEST_DISPLAY_NAME", "Joao")
if not test_username or not test_password:
    raise AssertionError("Provide TEST_USERNAME and TEST_PASSWORD")


def login(page: Page) -> None:
    page.goto(base_url)
    page.wait_for_load_state("networkidle")
    page.locator("#username").fill(test_username)
    page.locator("#password").fill(test_password)
    page.get_by_role("button", name="Entrar", exact=True).click()
    try:
        page.wait_for_url("**/#/app")
    except Exception as reason:
        raise AssertionError(f"Login did not navigate. URL={page.url}; message={page.locator('.form-message').inner_text()}; body={page.locator('body').inner_text()[:1000]}") from reason
    page.locator(".dashboard-heading h1", has_text=test_display_name).wait_for()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    console_errors: list[str] = []
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.set_default_timeout(15000)
    page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
    login(page)
    page.screenshot(path=str(output / "dashboard-desktop.png"), full_page=True)

    page.get_by_role("link", name="Ver jornada").click()
    page.get_by_role("heading", name="Sua jornada").wait_for()
    assert page.get_by_role("tab").count() == 6
    assert page.locator(".journey-module").count() == 8
    assert page.locator(".lesson-row").count() == 6
    page.screenshot(path=str(output / "journey-desktop.png"), full_page=True)
    page.locator(".lesson-row a").first.click()
    page.get_by_role("heading", name="Hello and Goodbye").wait_for()
    page.get_by_role("navigation", name="Navegar entre lições").wait_for()
    page.get_by_role("navigation", name="Navegar pelo conteúdo da lição").wait_for()
    while not page.get_by_role("button", name="Anterior", exact=True).is_disabled():
        page.get_by_role("button", name="Anterior", exact=True).click()
    page.get_by_role("button", name="Próximo", exact=True).click()
    page.locator(".lesson-visual img").wait_for()
    page.wait_for_function("() => { const image = document.querySelector('.lesson-visual img'); return image && image.complete && image.naturalWidth > 0 };")
    page.screenshot(path=str(output / "lesson-visual-desktop.png"), full_page=True)

    page.get_by_role("link", name="Revisão", exact=True).click()
    page.get_by_role("heading", name="Clínicas de gramática").wait_for()
    assert page.locator(".clinic-card").count() == 41
    page.locator(".clinic-toggle").first.click()
    page.locator(".clinic-exercise").first.wait_for()
    page.screenshot(path=str(output / "review-desktop.png"), full_page=True)

    page.get_by_role("link", name="Admin", exact=True).click()
    page.get_by_role("heading", name="Áudio das lições").wait_for()
    page.get_by_role("button", name="Gerar nível").wait_for()
    page.get_by_role("button", name="Gerar módulo").wait_for()
    assert page.locator(".audio-lesson-row").count() > 0
    page.screenshot(path=str(output / "admin-desktop.png"), full_page=True)

    for width in (360, 390, 412):
        mobile = browser.new_page(viewport={"width": width, "height": 844})
        mobile.set_default_timeout(15000)
        mobile.on("console", lambda message: console_errors.append(f"{width}px: {message.text}") if message.type == "error" else None)
        login(mobile)
        mobile.get_by_role("link", name="Jornada", exact=True).last.click()
        mobile.get_by_role("heading", name="Sua jornada").wait_for()
        assert mobile.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
        mobile.locator(".lesson-row a").first.click()
        mobile.get_by_role("heading", name="Hello and Goodbye").wait_for()
        assert mobile.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
        mobile.screenshot(path=str(output / f"lesson-mobile-{width}.png"), full_page=True)
        mobile.close()

    if console_errors:
        raise AssertionError(f"Browser console errors: {console_errors}")
    print("Browser verification passed at desktop and 360/390/412 px.")
    browser.close()
