package com.bearhouse.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private static final int WEB_PERM_REQ = 1001;
    private static final int LOCATION_REQ = 1002;
    private PermissionRequest pendingWebPermission;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;

    private static String osPermFor(String res) {
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) return Manifest.permission.CAMERA;
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) return Manifest.permission.RECORD_AUDIO;
        return null;
    }

    private boolean isTrustedOrigin(Uri origin) {
        if (origin == null) return false;
        String scheme = origin.getScheme();
        String host = origin.getHost();
        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
            if ("localhost".equalsIgnoreCase(host) || "127.0.0.1".equals(host)) {
                return true;
            }
        }
        if (getBridge() != null && getBridge().getServerUrl() != null) {
            Uri serverUri = Uri.parse(getBridge().getServerUrl());
            if (serverUri != null && serverUri.getHost() != null && serverUri.getHost().equalsIgnoreCase(host)) {
                return true;
            }
        }
        return false;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(OnDeviceGenAIPlugin.class);
        super.onCreate(savedInstanceState);
        setupPermissionsForWebView();
    }

    private void setupPermissionsForWebView() {
        WebView webView = getBridge().getWebView();
        webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    if (request == null) return;
                    if (!isTrustedOrigin(request.getOrigin())) {
                        request.deny();
                        return;
                    }

                    List<String> recognizedResources = new ArrayList<>();
                    List<String> missingPermissions = new ArrayList<>();

                    for (String r : request.getResources()) {
                        String perm = osPermFor(r);
                        if (perm == null) continue;
                        recognizedResources.add(r);
                        if (ContextCompat.checkSelfPermission(MainActivity.this, perm)
                                != PackageManager.PERMISSION_GRANTED && !missingPermissions.contains(perm)) {
                            missingPermissions.add(perm);
                        }
                    }

                    if (recognizedResources.isEmpty()) {
                        request.deny();
                        return;
                    }

                    if (missingPermissions.isEmpty()) {
                        request.grant(recognizedResources.toArray(new String[0]));
                        return;
                    }

                    if (pendingWebPermission != null) {
                        pendingWebPermission.deny(); // Prevent hanging orphaned request
                    }
                    pendingWebPermission = request;
                    ActivityCompat.requestPermissions(
                        MainActivity.this,
                        missingPermissions.toArray(new String[0]),
                        WEB_PERM_REQ
                    );
                });
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (request != null && request == pendingWebPermission) {
                    pendingWebPermission = null;
                }
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_COARSE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    if (pendingGeoCallback != null) {
                        pendingGeoCallback.invoke(pendingGeoOrigin, false, false);
                    }
                    pendingGeoOrigin = origin;
                    pendingGeoCallback = callback;
                    ActivityCompat.requestPermissions(
                        MainActivity.this,
                        new String[]{Manifest.permission.ACCESS_COARSE_LOCATION},
                        LOCATION_REQ
                    );
                }
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == WEB_PERM_REQ && pendingWebPermission != null) {
            PermissionRequest req = pendingWebPermission;
            pendingWebPermission = null;

            List<String> granted = new ArrayList<>();
            boolean allGranted = true;

            for (String r : req.getResources()) {
                String perm = osPermFor(r);
                if (perm == null) continue;
                if (ContextCompat.checkSelfPermission(this, perm) == PackageManager.PERMISSION_GRANTED) {
                    granted.add(r);
                } else {
                    allGranted = false;
                }
            }

            if (allGranted && !granted.isEmpty()) {
                req.grant(granted.toArray(new String[0]));
            } else {
                req.deny();
            }
        } else if (requestCode == LOCATION_REQ && pendingGeoCallback != null) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            pendingGeoCallback.invoke(pendingGeoOrigin, granted, false);
            pendingGeoCallback = null;
            pendingGeoOrigin = null;
        }
    }
}
