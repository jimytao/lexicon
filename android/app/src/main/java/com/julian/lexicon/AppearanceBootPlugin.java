package com.julian.lexicon;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Runtime bridge so JS can persist UiModeManager night mode when the user
 * changes appearance (not only on next Application.onCreate), and release
 * the keep-on-screen splash once Web chrome is ready.
 */
@CapacitorPlugin(name = "AppearanceBoot")
public class AppearanceBootPlugin extends Plugin {

    @PluginMethod
    public void applyNightMode(PluginCall call) {
        String appearance = call.getString("appearance", "system");
        Boolean darkObj = call.getBoolean("dark");
        LexiconApplication.applyAppearanceMode(getContext(), appearance);
        if (getActivity() instanceof MainActivity) {
            MainActivity mainActivity = (MainActivity) getActivity();
            boolean isDark = darkObj != null ? darkObj : (LexiconApplication.resolveBootChromeColor(getContext()) == 0xFF050505);
            mainActivity.updateNativeWindowChrome(isDark);
        }
        call.resolve();
    }

    @PluginMethod
    public void releaseSplash(PluginCall call) {
        MainActivity.releaseSplash();
        call.resolve();
    }
}
