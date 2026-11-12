"""Real-browser smoke test. Install requirements-dev.txt before running."""

import os
import subprocess
import sys
import time
import unittest
from pathlib import Path
from urllib.request import urlopen

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

ROOT = Path(__file__).resolve().parents[1]
BASE = "http://127.0.0.1:8765"


class CockpitBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = subprocess.Popen([sys.executable, "server.py"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(40):
            try:
                if urlopen(BASE + "/health", timeout=0.3).status == 200:
                    break
            except OSError:
                time.sleep(0.15)
        else:
            raise RuntimeError("Local cockpit server did not start")
        options = webdriver.ChromeOptions()
        options.add_argument("--headless=new")
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1440,1000")
        if os.getenv("CHROME_BINARY"):
            options.binary_location = os.environ["CHROME_BINARY"]
        cls.browser = webdriver.Chrome(options=options)

    @classmethod
    def tearDownClass(cls):
        cls.browser.quit()
        cls.server.terminate()
        cls.server.wait(timeout=5)

    def test_visible_cockpit_and_reproducible_failure(self):
        browser = self.browser
        browser.get(BASE)
        wait = WebDriverWait(browser, 12)
        wait.until(EC.text_to_be_present_in_element((By.ID, "projection-value"), "Android Auto"))
        self.assertIn("BMW M4", browser.find_element(By.CSS_SELECTOR, ".intro-row h2").text)
        self.assertEqual(browser.find_element(By.ID, "speed-value").text, "0")
        artifacts = ROOT / "artifacts"
        artifacts.mkdir(exist_ok=True)
        browser.save_screenshot(str(artifacts / "cockpit.png"))

        browser.find_element(By.CSS_SELECTOR, '[data-tab="validation"]').click()
        browser.find_element(By.CSS_SELECTOR, ".fault-option").click()
        browser.find_element(By.ID, "run-button").click()
        wait.until(EC.text_to_be_present_in_element((By.CSS_SELECTOR, "#run-banner strong"), "Defect detected"))
        self.assertIn("FAIL", browser.find_element(By.ID, "test-steps").text)
        self.assertIn("2/3 checks passed", browser.find_element(By.ID, "result-summary").text)
        browser.save_screenshot(str(artifacts / "failure-report.png"))


if __name__ == "__main__":
    unittest.main()
