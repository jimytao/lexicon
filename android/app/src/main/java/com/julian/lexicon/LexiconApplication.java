package com.julian.lexicon;

import android.app.Application;
import android.app.UiModeManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.os.Build;
import android.util.Log;
import androidx.appcompat.app.AppCompatDelegate;
import org.json.JSONObject;

/**
 * Apply persisted appearance before any Activity/splash inflate so
 * values / values-night splash colors match App appearance.
 *
 * Also expose {@link #applyAppearanceMode} so JS can update UiModeManager
 * immediately when the user changes appearance (system splash reads the
 * persisted app night mode on the *next* cold start).
 */
public class LexiconApplication extends Application {
    private static final String TAG = "LexiconBoot";
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
        String appearance = "system";
        if (raw != null) {
            try {
                JSONObject boot = new JSONObject(raw);
                appearance = boot.optString("appearance", "system");
            } catch (Exception ignored) {
                // Corrupt boot → follow system.
            }
        }
        applyAppearanceMode(context, appearance);
        Log.i(TAG, "boot nightMode from prefs appearance=" + appearance + " raw=" + raw);
    }

    /**
     * Persist application night mode for splash matching (API 31+) and
     * AppCompatDelegate for older APIs / in-process resources.
     */
    static void applyAppearanceMode(Context context, String appearance) {
        int mode = AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM;
        Integer api31Forced = null;
        if ("light".equals(appearance)) {
            mode = AppCompatDelegate.MODE_NIGHT_NO;
            api31Forced = UiModeManager.MODE_NIGHT_NO;
        } else if ("dark".equals(appearance)) {
            mode = AppCompatDelegate.MODE_NIGHT_YES;
            api31Forced = UiModeManager.MODE_NIGHT_YES;
        }

        AppCompatDelegate.setDefaultNightMode(mode);
        // API 31+: persist app night mode so the *next* system splash matches.
        // Forced light/dark → NO/YES; system → AUTO (clears a prior forced mode).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            UiModeManager uiModeManager = context.getSystemService(UiModeManager.class);
            if (uiModeManager != null) {
                int uiMode = api31Forced != null ? api31Forced : UiModeManager.MODE_NIGHT_AUTO;
                uiModeManager.setApplicationNightMode(uiMode);
            }
        }
        Log.i(TAG, "applyAppearanceMode appearance=" + appearance + " appCompatMode=" + mode);
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
