import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BOOT_CHROME_DARK, BOOT_CHROME_LIGHT } from '../services/appearance'

const root = join(__dirname, '../..')

function read(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('Android splash static gates', () => {
  const dayStyles = 'android/app/src/main/res/values/styles.xml'
  const nightStyles = 'android/app/src/main/res/values-night/styles.xml'
  const dayColors = 'android/app/src/main/res/values/colors.xml'
  const nightColors = 'android/app/src/main/res/values-night/colors.xml'

  it('defines opaque splash / app background colors matching chrome contract', () => {
    expect(existsSync(join(root, dayColors))).toBe(true)
    expect(existsSync(join(root, nightColors))).toBe(true)
    const day = read(dayColors)
    const night = read(nightColors)
    expect(day).toMatch(/splash_background[^>]*>\s*#FFFFFF/i)
    expect(day).toMatch(/app_background[^>]*>\s*#FFFFFF/i)
    expect(night).toMatch(/splash_background[^>]*>\s*#050505/i)
    expect(night).toMatch(/app_background[^>]*>\s*#050505/i)
    expect(BOOT_CHROME_LIGHT).toBe('#FFFFFF')
    expect(BOOT_CHROME_DARK).toBe('#050505')
  })

  it('Launch theme uses SplashScreen attrs and forbids transparent window backgrounds', () => {
    for (const path of [dayStyles, nightStyles]) {
      const src = read(path)
      expect(src).toContain('windowSplashScreenBackground')
      expect(src).toContain('postSplashScreenTheme')
      expect(src).not.toMatch(/windowBackground[^>]*>\s*@android:color\/transparent/)
      expect(src).not.toMatch(/android:background[^>]*>\s*@android:color\/transparent/)
    }
  })

  it('registers LexiconApplication for early night mode', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml')
    expect(manifest).toMatch(/android:name="\.LexiconApplication"/)
  })

  it('MainActivity keeps splash until release + registers AppearanceBoot plugin', () => {
    const main = read('android/app/src/main/java/com/julian/lexicon/MainActivity.java')
    expect(main).toContain('setKeepOnScreenCondition')
    expect(main).toContain('registerPlugin(AppearanceBootPlugin.class)')
    expect(main).toContain('releaseSplash')
    expect(existsSync(join(root, 'android/app/src/main/java/com/julian/lexicon/AppearanceBootPlugin.java'))).toBe(
      true,
    )
    const app = read('android/app/src/main/java/com/julian/lexicon/LexiconApplication.java')
    expect(app).toContain('applyAppearanceMode')
    expect(app).toContain('setApplicationNightMode')
  })
})

describe('iOS splash static gates', () => {
  it('Splash.imageset declares a dark appearance', () => {
    const contents = read('ios/App/App/Assets.xcassets/Splash.imageset/Contents.json')
    expect(contents).toMatch(/"appearances"/)
    expect(contents).toMatch(/dark/)
  })

  it('Main storyboard uses LexiconBridgeViewController', () => {
    const storyboard = read('ios/App/App/Base.lproj/Main.storyboard')
    expect(storyboard).toContain('LexiconBridgeViewController')
  })

  it('registers AppearanceBootPlugin and applies chrome early', () => {
    const vc = read('ios/App/App/LexiconBridgeViewController.swift')
    expect(vc).toContain('registerPluginInstance(AppearanceBootPlugin())')
    expect(vc).toContain('loadView')
    expect(vc).toContain('viewWillAppear')
    expect(existsSync(join(root, 'ios/App/App/AppearanceBootPlugin.swift'))).toBe(true)
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj')
    expect(pbx).toContain('AppearanceBootPlugin.swift')
  })

  it('does not hardcode capacitor backgroundColor (dynamic native wins)', () => {
    const config = read('capacitor.config.ts')
    expect(config).not.toMatch(/backgroundColor\s*:/)
  })
})

describe('Tauri cold-start gates', () => {
  it('sets theme from boot and delays show until frontend (with fallback)', () => {
    const lib = read('src-tauri/src/lib.rs')
    expect(lib).toContain('set_theme')
    expect(lib).toContain('apply_window_theme')
    expect(lib).toMatch(/SHOW_FALLBACK_MS|from_millis\(SHOW_FALLBACK_MS\)/)
    // Must not show immediately in setup before theme — show only in fallback thread / JS.
    expect(lib).toMatch(/Do not show yet|Do not show/)
    const appearance = read('src/services/appearance.ts')
    expect(appearance).toContain('.show()')
  })
})
