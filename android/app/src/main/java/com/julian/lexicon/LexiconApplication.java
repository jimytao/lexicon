package com.julian.lexicon;

import android.app.Application;
import android.app.UiModeManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Build;
import androidx.appcompat.app.AppCompatDelegate;
import org.json.JSONObject;

/**
 * Apply persisted appearance before any Activity/splash inflate so
 * values / values-night splash colors match App appearance.
 */
public class LexiconApplication extends Application {
    private static final String PREFS_GROUP = "CapacitorStorage";
    private static final String BOOT_KEY = "appearance-boot";

    @Override
    public void onCreate() {
        super.onCreate();
        applyBootNightMode(this);
    }

    static void applyBootNightMode(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_GROUP, MODE_PRIVATE);
        String raw = prefs.getString(BOOT_KEY, null);
        int mode = AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM;
        Integer api31Forced = null;

        if (raw != null) {
            try {
                JSONObject boot = new JSONObject(raw);
                String appearance = boot.optString("appearance", "system");
                if ("light".equals(appearance)) {
                    mode = AppCompatDelegate.MODE_NIGHT_NO;
                    api31Forced = UiModeManager.MODE_NIGHT_NO;
                } else if ("dark".equals(appearance)) {
                    mode = AppCompatDelegate.MODE_NIGHT_YES;
                    api31Forced = UiModeManager.MODE_NIGHT_YES;
                }
            } catch (Exception ignored) {
                // Corrupt boot → follow system.
            }
        }

        AppCompatDelegate.setDefaultNightMode(mode);
        // Only force via UiModeManager for light/dark so system splash matches;
        // leave system appearance to the OS (do not use MODE_NIGHT_AUTO — that is time-based).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && api31Forced != null) {
            UiModeManager uiModeManager = context.getSystemService(UiModeManager.class);
            if (uiModeManager != null) {
                uiModeManager.setApplicationNightMode(api31Forced);
            }
        }
    }

    /** Resolve chrome color from boot + current configuration (matches JS resolveBootDark). */
    static int resolveBootChromeColor(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_GROUP, MODE_PRIVATE);
        String raw = prefs.getString(BOOT_KEY, null);
        boolean systemDark =
            (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK)
                == Configuration.UI_MODE_NIGHT_YES;
        boolean dark = systemDark;
        if (raw != null) {
            try {
                JSONObject boot = new JSONObject(raw);
                String appearance = boot.optString("appearance", "system");
                if ("light".equals(appearance) || "dark".equals(appearance)) {
                    dark = boot.optBoolean("dark", appearance.equals("dark"));
                }
            } catch (Exception ignored) {
                // follow systemDark
            }
        }
        // #FFFFFF / #050505
        return dark ? 0xFF050505 : 0xFFFFFFFF;
    }
}
