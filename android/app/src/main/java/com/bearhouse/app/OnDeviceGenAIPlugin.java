package com.bearhouse.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.genai.common.FeatureStatus;
import com.google.mlkit.genai.prompt.Candidate;
import com.google.mlkit.genai.prompt.Generation;
import com.google.mlkit.genai.prompt.GenerateContentRequest;
import com.google.mlkit.genai.prompt.GenerateContentResponse;
import com.google.mlkit.genai.prompt.ImagePart;
import com.google.mlkit.genai.prompt.TextPart;
import com.google.mlkit.genai.prompt.java.GenerativeModelFutures;
import com.google.common.util.concurrent.FutureCallback;
import com.google.common.util.concurrent.Futures;

import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "OnDeviceGenAI")
public class OnDeviceGenAIPlugin extends Plugin {

    private final Executor executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void checkAvailability(PluginCall call) {
        if (Build.VERSION.SDK_INT < 26) {
            JSObject result = new JSObject();
            result.put("status", "unavailable");
            call.resolve(result);
            return;
        }
        try {
            GenerativeModelFutures model = GenerativeModelFutures.from(Generation.INSTANCE.getClient());
            Futures.addCallback(model.checkStatus(), new FutureCallback<Integer>() {
                @Override
                public void onSuccess(Integer status) {
                    JSObject result = new JSObject();
                    result.put("status", statusToString(status));
                    call.resolve(result);
                }

                @Override
                public void onFailure(Throwable t) {
                    JSObject result = new JSObject();
                    result.put("status", "unavailable");
                    call.resolve(result);
                }
            }, executor);
        } catch (Exception e) {
            JSObject result = new JSObject();
            result.put("status", "unavailable");
            call.resolve(result);
        }
    }

    @PluginMethod
    public void analyzeImage(PluginCall call) {
        String base64Jpeg = call.getString("base64Jpeg");
        String prompt = call.getString("prompt");
        if (base64Jpeg == null || prompt == null) {
            call.reject("base64Jpeg and prompt are required");
            return;
        }
        if (Build.VERSION.SDK_INT < 26) {
            call.reject("on-device GenAI requires Android 8.0 (API 26) or higher");
            return;
        }

        try {
            byte[] bytes = Base64.decode(base64Jpeg, Base64.DEFAULT);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) {
                call.reject("could not decode image");
                return;
            }

            GenerativeModelFutures model = GenerativeModelFutures.from(Generation.INSTANCE.getClient());
            GenerateContentRequest request = new GenerateContentRequest.Builder(
                    new ImagePart(bitmap),
                    new TextPart(prompt)
            ).build();

            Futures.addCallback(model.generateContent(request), new FutureCallback<GenerateContentResponse>() {
                @Override
                public void onSuccess(GenerateContentResponse response) {
                    List<Candidate> candidates = response.getCandidates();
                    if (candidates.isEmpty()) {
                        call.reject("no candidates in response");
                        return;
                    }
                    JSObject result = new JSObject();
                    result.put("text", candidates.get(0).getText());
                    call.resolve(result);
                }

                @Override
                public void onFailure(Throwable t) {
                    call.reject("inference failed: " + t.getMessage());
                }
            }, executor);
        } catch (Exception e) {
            call.reject("analyzeImage failed: " + e.getMessage());
        }
    }

    private static String statusToString(int status) {
        if (status == FeatureStatus.AVAILABLE) return "available";
        if (status == FeatureStatus.DOWNLOADABLE) return "downloadable";
        if (status == FeatureStatus.DOWNLOADING) return "downloading";
        return "unavailable";
    }
}
