package com.musicplayer.app;

import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import org.json.JSONObject;

@CapacitorPlugin(name = "CorsPlugin")
public class CorsPlugin extends Plugin {
    private static final String TAG = "CorsPlugin";

    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        String method = call.getString("method", "GET");
        JSObject headers = call.getObject("headers", new JSObject());
        String body = call.getString("data");

        if (url == null) {
            call.reject("URL is required");
            return;
        }

        new Thread(() -> {
            try {
                URL requestUrl = new URL(url);
                HttpURLConnection connection = (HttpURLConnection) requestUrl.openConnection();
                connection.setRequestMethod(method);
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(15000);
                connection.setInstanceFollowRedirects(true);

                // Set default User-Agent if not provided
                if (!headers.has("User-Agent")) {
                    connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
                }

                // Set custom headers
                Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    connection.setRequestProperty(key, headers.getString(key));
                }

                // Set body for POST/PUT
                if (body != null && (method.equalsIgnoreCase("POST") || method.equalsIgnoreCase("PUT"))) {
                    connection.setDoOutput(true);
                    byte[] input = body.getBytes(StandardCharsets.UTF_8);
                    connection.setRequestProperty("Content-Length", String.valueOf(input.length));
                    try (OutputStream os = connection.getOutputStream()) {
                        os.write(input, 0, input.length);
                    }
                }

                int status = connection.getResponseCode();
                BufferedReader reader;
                if (status >= 200 && status < 300) {
                    reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
                } else {
                    reader = new BufferedReader(new InputStreamReader(connection.getErrorStream(), StandardCharsets.UTF_8));
                }

                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    response.append(line);
                }
                reader.close();

                JSObject result = new JSObject();
                result.put("status", status);
                result.put("data", response.toString());
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "Request failed: " + e.getMessage(), e);
                call.reject("Request failed: " + e.getMessage());
            }
        }).start();
    }
}
