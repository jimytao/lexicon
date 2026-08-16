import time
import os
from playwright.sync_api import sync_playwright

def main():
    out_dir = os.path.join(os.getcwd(), "docs", "images")
    os.makedirs(out_dir, exist_ok=True)
    
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=True, channel="chrome")
        except Exception:
            browser = p.chromium.launch(headless=True, channel="msedge")
            
        context = browser.new_context(viewport={"width": 1280, "height": 850}, device_scale_factor=2)
        page = context.new_page()
        
        print("Navigating to http://127.0.0.1:3000...")
        page.goto("http://127.0.0.1:3000")
        page.wait_for_timeout(3000) # Ensure Oxford DB WASM is warm
        
        # 1. Home screen
        page.screenshot(path=os.path.join(out_dir, "01_home_screen.png"))
        print("Saved 01_home_screen.png")
        
        # 2. Instant lookup with real word
        search_input = page.locator("textarea").first
        if search_input.is_visible():
            search_input.focus()
            search_input.fill("ephemeral")
            page.wait_for_timeout(1000)
            
            # Click suggestion item or press ArrowDown then Enter
            page.keyboard.press("ArrowDown")
            page.keyboard.press("Enter")
            page.wait_for_timeout(3000)
            
            page.screenshot(path=os.path.join(out_dir, "02_instant_lookup.png"))
            print("Saved 02_instant_lookup.png")
        
        # 3. Pure Core Mode
        core_btn = page.locator("button:has-text('Pure Core')").first
        if core_btn.is_visible():
            core_btn.click()
            page.wait_for_timeout(2000)
            page.screenshot(path=os.path.join(out_dir, "05_pure_core_mode.png"))
            print("Saved 05_pure_core_mode.png")

        # 4. AI Lookup Mode
        ai_btn = page.locator("button:has-text('AI Lookup')").first
        if ai_btn.is_visible():
            ai_btn.click()
            page.wait_for_timeout(2000)
            page.screenshot(path=os.path.join(out_dir, "06_ai_lookup_mode.png"))
            print("Saved 06_ai_lookup_mode.png")

        # 5. Image Translate Tab
        translate_button = page.locator("button:has-text('Image'), button:has-text('图片'), button:has-text('翻译')").first
        if translate_button.is_visible():
            translate_button.click()
            page.wait_for_timeout(1500)
            page.screenshot(path=os.path.join(out_dir, "04_image_translate_tab.png"))
            print("Saved 04_image_translate_tab.png")

        # 6. Settings Tab
        settings_button = page.locator("button:has-text('Settings'), button:has-text('设置')").first
        if settings_button.is_visible():
            settings_button.click()
            page.wait_for_timeout(1500)
            page.screenshot(path=os.path.join(out_dir, "03_settings_tab.png"))
            print("Saved 03_settings_tab.png")

        browser.close()
        print("All real screenshots captured successfully!")

if __name__ == "__main__":
    main()
