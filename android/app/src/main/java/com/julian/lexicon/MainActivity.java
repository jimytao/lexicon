package com.julian.lexicon;

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import java.util.concurrent.atomic.AtomicBoolean;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "LexiconBoot";
    private static final long SPLASH_TIMEOUT_MS = 2500L;
    private static final AtomicBoolean keepSplash = new AtomicBoolean(true);

    static void releaseSplash() {
        keepSplash.set(false);
        Log.i(TAG, "splash released");
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppearanceBootPlugin.class);
        LexiconApplication.applyBootNightMode(this);
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(keepSplash::get);
        new Handler(Looper.getMainLooper()).postDelayed(MainActivity::releaseSplash, SPLASH_TIMEOUT_MS);

        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(true);

        int chrome = LexiconApplication.resolveBootChromeColor(this);
        Log.i(TAG, "webview chrome=0x" + Integer.toHexString(chrome));
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.setBackgroundColor(chrome);
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(webView.getSettings(), false);
            } else if (WebViewFeature.isFeatureSupported(WebViewFeature.FORCE_DARK)) {
                WebSettingsCompat.setForceDark(webView.getSettings(), WebSettingsCompat.FORCE_DARK_OFF);
            }
        }
        getWindow().getDecorView().setBackgroundColor(chrome);

        // Enable edge-to-edge layout to allow CSS env(safe-area-insets) to work
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.TRANSPARENT);

        // Fix for Android 10 and below: use adjustPan to avoid the black block bug.
        // Android 11+ handles adjustResize properly with edge-to-edge layouts.
        if (Build.VERSION.SDK_INT <= 29) {
            getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN);
        }
    }
}
