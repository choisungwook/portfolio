# /// script
# requires-python = ">=3.12"
# dependencies = ["playwright==1.55.0"]
# ///
"""raw CDP 실습과 같은 작업을 Playwright로 한다. 같은 Chrome에 connect_over_cdp로 붙는다."""

from playwright.sync_api import Page, sync_playwright

CDP_HTTP = "http://127.0.0.1:9222"
PAGE_URL = "http://127.0.0.1:8000/index.html"
SCREENSHOT_PATH = "playwright-screenshot.png"


def run_task(page: Page) -> None:
  """이동 → 역할 기반 클릭 → 값 확인 → 접근성 스냅샷 → 스크린샷."""
  page.goto(PAGE_URL)
  page.get_by_role("button", name="카운트 증가").click()
  print(f"count after click: {page.locator('#count').text_content()}")
  print(f"aria snapshot:\n{page.locator('body').aria_snapshot()}")
  page.screenshot(path=SCREENSHOT_PATH)
  print(f"screenshot: {SCREENSHOT_PATH}")


def main() -> None:
  """이미 떠 있는 Chrome에 CDP로 붙어 기존 탭을 재사용한다. 브라우저를 직접 띄우지 않는다."""
  with sync_playwright() as playwright:
    browser = playwright.chromium.connect_over_cdp(CDP_HTTP)
    page = browser.contexts[0].pages[0]
    run_task(page)


if __name__ == "__main__":
  main()
