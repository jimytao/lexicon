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

        int mode = AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM;
        if ("light".equals(appearance)) {
            mode = AppCompatDelegate.MODE_NIGHT_NO;
        } else if ("dark".equals(appearance)) {
            mode = AppCompatDelegate.MODE_NIGHT_YES;
        }

        // Apply only in-process AppCompatDelegate default night mode during boot.
        // DO NOT call UiModeManager.setApplicationNightMode during Application.onCreate
        // or Activity initialization to prevent Activity destruction/recreation loops.
        AppCompatDelegate.setDefaultNightMode(mode);
        Log.i(TAG, "boot nightMode from prefs appearance=" + appearance + " appCompatMode=" + mode + " raw=" + raw);
    }

    /**
     * Runtime update for API 31+ UiModeManager night mode when the user changes appearance in JS.
     * Only updates OS-level system splash preference for future cold starts if changed,
     * avoiding calls to AppCompatDelegate.setDefaultNightMode which forces Activity recreate at runtime.
     */
    static void applyAppearanceMode(Context context, String appearance) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                UiModeManager uiModeManager = context.getSystemService(UiModeManager.class);
                if (uiModeManager != null) {
                    int targetUiMode = UiModeManager.MODE_NIGHT_AUTO;
                    if ("light".equals(appearance)) {
                        targetUiMode = UiModeManager.MODE_NIGHT_NO;
                    } else if ("dark".equals(appearance)) {
                        targetUiMode = UiModeManager.MODE_NIGHT_YES;
                    }

                    uiModeManager.setApplicationNightMode(targetUiMode);
                    Log.i(TAG, "updated uiModeManager nightMode to " + targetUiMode);
                }
            } catch (Exception e) {
                Log.w(TAG, "failed to update UiModeManager nightMode", e);
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
