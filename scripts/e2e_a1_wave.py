import json
import os
import time
import urllib.parse
import urllib.request
import uuid

from playwright.sync_api import Page, sync_playwright


base_url = os.environ.get("BASE_URL", "http://127.0.0.1:4173/")
supabase_url = os.environ["SUPABASE_URL"].rstrip("/")
service_role = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
suffix = uuid.uuid4().hex
username = f"a1-wave-{suffix[:12]}"
email = f"{username}@login.barretoenglish.app"
password = f"A1wave-{uuid.uuid4().hex}-aA1!"
targets = ("A1-01", "A1-24", "A1-25", "A1-48")


def admin_request(method: str, path: str, body: dict | None = None):
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
    page.locator("main").wait_for()
    page.wait_for_timeout(500)


def open_lesson(page: Page, lesson: dict) -> None:
    target = f"{base_url.rstrip('/')}/#/lesson/{lesson['id']}"
    for _ in range(3):
        page.goto(target)
        try:
            page.locator(".lesson-hero h1").wait_for(timeout=10_000)
            assert page.locator(".lesson-hero h1").inner_text() == lesson["title"]
            return
        except Exception:
            page.wait_for_timeout(300)
    raise AssertionError(f"Could not open {lesson['external_id']} at {page.url}: {page.locator('body').inner_text()[:1000]}")


def assert_no_horizontal_overflow(page: Page, label: str) -> None:
    result = page.evaluate("""() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      offenders: [...document.querySelectorAll('body *')]
        .map((element) => ({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          left: element.getBoundingClientRect().left,
          right: element.getBoundingClientRect().right,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        }))
        .filter((item) => item.right > document.documentElement.clientWidth + 1 || item.left < -1)
        .slice(0, 8)
    })""")
    assert result["scrollWidth"] <= result["clientWidth"], f"{label}: horizontal overflow {result}"


created = admin_request("POST", "/auth/v1/admin/users", {
    "email": email,
    "password": password,
    "email_confirm": True,
    "user_metadata": {"username": username, "display_name": "A1 Wave browser test"},
})
user_id = created["id"]

try:
    for _ in range(20):
        admin_request("PATCH", f"/rest/v1/profiles?id=eq.{user_id}", {"role": "admin"})
        profiles = admin_request("GET", f"/rest/v1/profiles?select=role&id=eq.{user_id}")
        if profiles and profiles[0].get("role") == "admin":
            break
        time.sleep(0.25)
    else:
        raise AssertionError("Temporary browser profile was not promoted to admin.")
    query_ids = ",".join(targets)
    lessons = admin_request("GET", f"/rest/v1/lessons?select=id,external_id,title&external_id=in.{urllib.parse.quote(f'({query_ids})')}")
    by_external_id = {lesson["external_id"]: lesson for lesson in lessons}
    assert set(by_external_id) == set(targets)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        console_errors: list[str] = []
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(20_000)
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        login(page)

        for external_id in targets:
            lesson = by_external_id[external_id]
            open_lesson(page, lesson)
            page.wait_for_load_state("networkidle")
            expected_steps = 11 if external_id in ("A1-24", "A1-48") else 12
            if page.locator(".lesson-stepper > span").count() == 0:
                raise AssertionError(f"{external_id}: lesson stepper missing at {page.url}: {page.locator('body').inner_text()[:1200]}")
            assert page.locator(".lesson-stepper > span").inner_text() == f"1 / {expected_steps}"
            assert page.get_by_role("button", name="Anterior", exact=True).is_disabled()

            visited = 0
            while not page.get_by_role("button", name="Próximo", exact=True).is_disabled():
                visited += 1
                body = page.locator("body").inner_text()
                assert "Conteúdo em preparação" not in body
                assert "Áudio ainda não preparado." not in body
                assert "Este áudio precisa ser revisado." not in body
                assert "can_do_pt" not in body and "prompt_translation" not in body
                assert "NaN" not in body and "1001" not in body
                assert_no_horizontal_overflow(page, f"desktop {external_id}")
                translation = page.get_by_role("button", name="Ver tradução", exact=True)
                if translation.count():
                    translation.first.click()
                    page.get_by_role("button", name="Ocultar tradução", exact=True).first.wait_for()
                page.get_by_role("button", name="Próximo", exact=True).click()
                page.wait_for_timeout(80)
            assert visited == expected_steps
            assert page.locator(".lesson-stepper > span").inner_text() == "Final"
            page.get_by_role("button", name="Anterior", exact=True).click()
            assert page.locator(".lesson-stepper > span").inner_text() == f"{expected_steps} / {expected_steps}"

        page.goto(f"{base_url.rstrip('/')}/#/admin")
        page.get_by_role("heading", name="Diagnóstico do conteúdo", exact=True).wait_for()
        diagnostics_text = page.locator(".admin-diagnostics").inner_text()
        assert "1.0-curriculum-master" in diagnostics_text
        assert "360 / 360" in diagnostics_text
        assert "401 / 401" in diagnostics_text
        assert "2.0-specialized-sections" in diagnostics_text
        for clear_problem in ("Blocos vazios", "Traduções ausentes no A1", "Visuais ausentes", "Texto TTS inválido"):
            problem = page.locator(".diagnostic-problems span", has_text=clear_problem)
            value = problem.locator("strong").inner_text()
            assert value == "0", f"{clear_problem} reported {value}: {diagnostics_text}"

        for width in (360, 390, 412):
            mobile = browser.new_page(viewport={"width": width, "height": 844})
            mobile.set_default_timeout(20_000)
            mobile.on("console", lambda message, w=width: console_errors.append(f"{w}px: {message.text}") if message.type == "error" else None)
            login(mobile)
            for external_id in ("A1-24", "A1-48"):
                lesson = by_external_id[external_id]
                open_lesson(mobile, lesson)
                assert_no_horizontal_overflow(mobile, f"{width}px {external_id} first step")
                mobile.get_by_role("button", name="Próximo", exact=True).click()
                assert_no_horizontal_overflow(mobile, f"{width}px {external_id} second step")
            mobile.close()

        if console_errors:
            raise AssertionError(f"Browser console errors: {console_errors}")
        browser.close()
        print("A1 Wave browser verification passed for A1-01/A1-24/A1-25/A1-48 at desktop and 360/390/412 px.")
finally:
    try:
        admin_request("DELETE", f"/auth/v1/admin/users/{user_id}")
    except Exception:
        print("Warning: temporary A1 Wave browser user cleanup failed.")
