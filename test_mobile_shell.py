"""Smoke checks for the immersive HTML shell; requires only Python stdlib.

Run: python3 -m unittest test_mobile_shell.py
This checks page plumbing, not iPhone viewport/rendering or Scratch gameplay.
"""
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).parent

class MobileShellTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = (ROOT / "index.html").read_text(encoding="utf-8")
        cls.play = (ROOT / "play.html").read_text(encoding="utf-8")
        cls.manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))

    def test_mobile_page_has_viewport_height(self):
        for name, html in [("index", self.index), ("play", self.play)]:
            with self.subTest(name=name):
                self.assertIn("width=device-width", html)
                self.assertIn("viewport-fit=cover", html)
                self.assertIn("100dvh", html)
                self.assertIn("color-scheme:dark", html)

    def test_own_fullscreen_route_not_external_embed_link(self):
        self.assertIn('href="./play.html"', self.index)
        self.assertNotRegex(self.index, r'href="https://turbowarp.org/embed')
        self.assertIn('id="game"', self.play)
        self.assertIn("chain-reaction.sb3", self.play)
        self.assertIn("allowfullscreen", self.play)
        self.assertIn("requestFullscreen", self.play)

    def test_ios_pwa_launch(self):
        self.assertEqual(self.manifest["display"], "standalone")
        self.assertEqual(self.manifest["start_url"], "./play.html")
        self.assertEqual(self.manifest["scope"], "./")
        self.assertIn("apple-mobile-web-app-capable", self.play)
        self.assertIn("На экран Домой", self.play)
        self.assertIn("id=\"help\"", self.play)

    def test_no_claim_that_4_by_3_is_vertical(self):
        self.assertIn("4:3", self.play)
        self.assertIn("9:16", self.play)

if __name__ == "__main__":
    unittest.main()
