package com.julian.lexicon;

import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(true);
        
        // Fix for Android 10 and below: use adjustPan to avoid the black block bug.
        // Android 11+ handles adjustResize properly with edge-to-edge layouts.
        if (Build.VERSION.SDK_INT <= 29) {
            getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN);
        }
    }
}
