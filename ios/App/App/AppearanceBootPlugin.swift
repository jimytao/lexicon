import Capacitor

@objc(AppearanceBootPlugin)
public class AppearanceBootPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppearanceBootPlugin"
    public let jsName = "AppearanceBoot"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "applyNightMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "releaseSplash", returnType: CAPPluginReturnPromise),
    ]

    @objc func applyNightMode(_ call: CAPPluginCall) {
        let appearance = call.getString("appearance") ?? "system"
        DispatchQueue.main.async {
            // Persist boot so cold start matches; Preferences.set from JS may race.
            if let dark = call.getBool("dark") {
                let payload: [String: Any] = ["dark": dark, "appearance": appearance]
                if let data = try? JSONSerialization.data(withJSONObject: payload),
                   let raw = String(data: data, encoding: .utf8) {
                    UserDefaults.standard.set(raw, forKey: AppearanceBoot.prefsKey)
                }
            }
            AppearanceBoot.apply(to: self.bridge?.webView?.window
                ?? self.bridge?.viewController?.view.window
                ?? UIApplication.shared.connectedScenes
                    .compactMap { ($0 as? UIWindowScene)?.keyWindow }
                    .first)
            if let vc = self.bridge?.viewController as? LexiconBridgeViewController {
                vc.applyBootChromePublic()
            }
            call.resolve()
        }
    }

    @objc func releaseSplash(_ call: CAPPluginCall) {
        // Android keeps splash; iOS Launch is system-owned — no-op.
        call.resolve()
    }
}
