import UIKit
import Capacitor
import WebKit

/// Cold-start chrome aligned with JS `appearance-boot` / Tauri resolve_boot_dark.
enum AppearanceBoot {
    static let prefsKey = "CapacitorStorage.appearance-boot"
    static let lightChrome = UIColor(red: 1, green: 1, blue: 1, alpha: 1) // #FFFFFF
    static let darkChrome = UIColor(red: 5.0 / 255.0, green: 5.0 / 255.0, blue: 5.0 / 255.0, alpha: 1) // #050505

    struct Payload {
        let dark: Bool
        let appearance: String
    }

    static func read() -> Payload? {
        guard let raw = UserDefaults.standard.string(forKey: prefsKey),
              let data = raw.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let dark = json["dark"] as? Bool
        else { return nil }
        let appearance = (json["appearance"] as? String) ?? "system"
        return Payload(dark: dark, appearance: appearance)
    }

    /// Same contract as JS `resolveBootDark`.
    static func resolveDark(systemDark: Bool = UITraitCollection.current.userInterfaceStyle == .dark) -> Bool {
        guard let boot = read() else { return systemDark }
        if boot.appearance == "light" || boot.appearance == "dark" {
            return boot.dark
        }
        return systemDark
    }

    static func chromeColor(systemDark: Bool = UITraitCollection.current.userInterfaceStyle == .dark) -> UIColor {
        resolveDark(systemDark: systemDark) ? darkChrome : lightChrome
    }

    static func overrideStyle() -> UIUserInterfaceStyle {
        guard let boot = read() else { return .unspecified }
        switch boot.appearance {
        case "light": return .light
        case "dark": return .dark
        default: return .unspecified
        }
    }

    static func apply(to window: UIWindow?) {
        window?.overrideUserInterfaceStyle = overrideStyle()
        window?.backgroundColor = chromeColor()
    }
}

class LexiconBridgeViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        applyBootChrome()
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        applyBootChrome()
    }

    private func applyBootChrome() {
        let style = AppearanceBoot.overrideStyle()
        overrideUserInterfaceStyle = style
        view.overrideUserInterfaceStyle = style
        let color = AppearanceBoot.chromeColor()
        view.backgroundColor = color
        guard let webView = self.webView else { return }
        webView.backgroundColor = color
        webView.scrollView.backgroundColor = color
        webView.isOpaque = true
        if #available(iOS 15.0, *) {
            webView.underPageBackgroundColor = color
        }
    }
}
