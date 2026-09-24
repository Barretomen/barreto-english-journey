import json
import os
import urllib.request
import uuid
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


base_url = os.environ.get("BASE_URL", "http://127.0.0.1:4173/")
supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
service_role = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
output = Path(__file__).resolve().parents[1] / "artifacts"
output.mkdir(exist_ok=True)
suffix = uuid.uuid4().hex
username = f"golden-{suffix[:12]}"
email = f"{username}@login.barretoenglish.app"
password = f"Golden-{uuid.uuid4().hex}-aA1!"


def admin_request(method: str, path: str, body: dict | None = None) -> dict:
    request = urllib.request.Request(
        f"{supabase_url}{path}",
        data=json.dumps(body).encode() if body else None,
        method=method,
        headers={
            "apikey": service_role,
            "Authorization": f"Bearer {service_role}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request) as response:
        raw = response.read()
        return json.loads(raw) if raw else {}


def login(page: Page) -> None:
    page.goto(base_url)
    page.wait_for_load_state("networkidle")
    page.locator("#username").fill(username)
    page.locator("#password").fill(password)
    page.get_by_role("button", name="Entrar", exact=True).click()
    page.wait_for_url("**/#/app")
    page.get_by_role("link", name="Ver jornada").click()
    page.get_by_role("heading", name="Sua jornada").wait_for()
    page.locator(".lesson-row a").first.click()
    page.get_by_role("heading", name="Hello and Goodbye").wait_for()
    page.wait_for_load_state("networkidle")
    while not page.get_by_role("button", name="Anterior", exact=True).is_disabled():
        page.get_by_role("button", name="Anterior", exact=True).click()


def next_step(page: Page) -> None:
    page.get_by_role("button", name="Próximo", exact=True).click()


created = admin_request("POST", "/auth/v1/admin/users", {
    "email": email,
    "password": password,
    "email_confirm": True,
    "user_metadata": {"username": username, "display_name": "Golden browser test"},
})
user_id = created["id"]

try:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        console_errors: list[str] = []
        desktop = browser.new_page(viewport={"width": 1440, "height": 1000})
        desktop.set_default_timeout(20_000)
        desktop.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        login(desktop)
        body_text = desktop.locator("body").inner_text()
        assert "A1 · MÓDULO 1 · AULA 1" in body_text
        assert "Cumprimentar e despedir-se" in body_text
        assert desktop.locator(".can-do-preview li").count() == 3
        assert "NaN" not in body_text and "1001" not in body_text

        next_step(desktop)
        desktop.locator(".lesson-visual img").wait_for()
        desktop.wait_for_function("() => { const image = document.querySelector('.lesson-visual img'); return image && image.complete && image.naturalWidth > 0 }")

        next_step(desktop)
        assert desktop.locator(".vocabulary-item").count() == 8
        assert desktop.get_by_text("Hello!", exact=True).count() >= 1
        assert desktop.get_by_text("Olá!", exact=True).count() >= 1
        assert desktop.locator(".lesson-audio--compact").count() == 16
        assert desktop.get_by_text("Áudio indisponível.", exact=True).count() == 0
        desktop.screenshot(path=str(output / "golden-a1-01-desktop.png"), full_page=True)

        next_step(desktop)
        assert desktop.locator(".exercise-card").count() == 1
        assert desktop.get_by_role("button", name="Ver tradução").count() == 1
        desktop.locator(".option").last.click()
        desktop.get_by_role("button", name="Verificar resposta").click()
        desktop.locator(".feedback").wait_for()
        desktop.get_by_role("button", name="Ver dica").wait_for()
        desktop.get_by_role("button", name="Revelar resposta").click()
        desktop.get_by_text("Resposta de referência:").wait_for()

        next_step(desktop)
        assert "Em inglês, estas saudações são expressões fixas" in desktop.locator("body").inner_text()

        next_step(desktop)
        desktop.locator(".option").first.click()
        desktop.get_by_role("button", name="Verificar resposta").click()
        desktop.locator(".feedback").wait_for()

        next_step(desktop)
        assert desktop.locator(".pronunciation-list section").count() == 2
        assert desktop.locator(".lesson-audio--compact").count() == 2
        assert "_" not in desktop.locator(".pronunciation-list").inner_text()

        next_step(desktop)
        desktop.get_by_label("Sua resposta").fill("Hello")
        desktop.get_by_role("button", name="Verificar resposta").click()
        desktop.locator(".feedback").wait_for()

        next_step(desktop)
        assert "Quem diz “Good morning” primeiro?" in desktop.locator("body").inner_text()
        desktop.get_by_role("button", name="Ver transcrição").click()
        desktop.locator(".transcript").wait_for()
        desktop.get_by_role("button", name="Ver tradução").click()
        assert "Bom dia! Eu sou Sarah" in desktop.locator(".transcript").inner_text()

        next_step(desktop)
        desktop.get_by_text("Verdadeiro", exact=True).click()
        desktop.get_by_role("button", name="Verificar resposta").click()
        desktop.locator(".feedback").wait_for()

        next_step(desktop)
        assert "Diga três saudações em voz alta" in desktop.locator("body").inner_text()

        next_step(desktop)
        assert desktop.locator(".can-do-checklist label").count() == 3
        desktop.locator(".can-do-checklist input").first.check()

        next_step(desktop)
        desktop.get_by_role("heading", name="Pronta para concluir?").wait_for()
        desktop.get_by_role("button", name="Concluir aula").click()
        desktop.get_by_role("link", name="Ir para a próxima lição").wait_for()

        for width in (360, 390, 412):
            mobile = browser.new_page(viewport={"width": width, "height": 844})
            mobile.set_default_timeout(20_000)
            mobile.on("console", lambda message, w=width: console_errors.append(f"{w}px: {message.text}") if message.type == "error" else None)
            login(mobile)
            next_step(mobile)
            next_step(mobile)
            assert mobile.locator(".vocabulary-item").count() == 8
            assert mobile.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")
            mobile.screenshot(path=str(output / f"golden-a1-01-mobile-{width}.png"), full_page=True)
            mobile.close()

        if console_errors:
            raise AssertionError(f"Browser console errors: {console_errors}")
        browser.close()
        print("Golden browser verification passed at desktop and 360/390/412 px.")
finally:
    try:
        admin_request("DELETE", f"/auth/v1/admin/users/{user_id}")
    except Exception:
        print("Warning: temporary browser user cleanup failed.")
