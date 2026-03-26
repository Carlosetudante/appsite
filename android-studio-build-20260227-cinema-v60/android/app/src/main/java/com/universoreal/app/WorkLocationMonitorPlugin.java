package com.universoreal.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
  name = "WorkLocationMonitor",
  permissions = {
    @Permission(
      alias = WorkLocationMonitorPlugin.LOCATION_ALIAS,
      strings = {
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.ACCESS_BACKGROUND_LOCATION
      }
    ),
    @Permission(
      alias = WorkLocationMonitorPlugin.NOTIFICATIONS_ALIAS,
      strings = {
        Manifest.permission.POST_NOTIFICATIONS
      }
    )
  }
)
public class WorkLocationMonitorPlugin extends Plugin {
  static final String LOCATION_ALIAS = "location";
  static final String NOTIFICATIONS_ALIAS = "notifications";

  @PluginMethod
  public void checkPermissions(PluginCall call) {
    call.resolve(buildPermissionPayload());
  }

  @PluginMethod
  public void requestPermission(PluginCall call) {
    if (isForegroundLocationGranted() && isNotificationGranted()) {
      call.resolve(buildPermissionPayload());
      return;
    }
    requestAllPermissions(call, "workMonitorPermissionCallback");
  }

  @PluginMethod
  public void requestPermissions(PluginCall call) {
    requestPermission(call);
  }

  @PermissionCallback
  private void workMonitorPermissionCallback(PluginCall call) {
    call.resolve(buildPermissionPayload());
  }

  @PluginMethod
  public void startMonitor(PluginCall call) {
    final double lat = call.getDouble(WorkLocationMonitorService.EXTRA_WORK_LAT, Double.NaN);
    final double lng = call.getDouble(WorkLocationMonitorService.EXTRA_WORK_LNG, Double.NaN);
    final int radius = call.getInt(WorkLocationMonitorService.EXTRA_RADIUS_METERS, 220);
    final long cooldownMs = call.getLong(WorkLocationMonitorService.EXTRA_PROMPT_COOLDOWN_MS, 30L * 60L * 1000L);
    final int autoStopDistance = call.getInt(WorkLocationMonitorService.EXTRA_AUTO_STOP_DISTANCE_METERS, 120);
    final boolean resetPrompt = call.getBoolean(WorkLocationMonitorService.EXTRA_RESET_PROMPT, false);

    if (!Double.isFinite(lat) || !Double.isFinite(lng)) {
      call.reject("Local de trabalho inválido para iniciar monitor.");
      return;
    }
    if (!isForegroundLocationGranted()) {
      call.reject("Permita localização para ativar o modo trabalho automático.");
      return;
    }

    final Context ctx = getContext();
    final Intent intent = new Intent(ctx, WorkLocationMonitorService.class);
    intent.setAction(WorkLocationMonitorService.ACTION_START_MONITOR);
    intent.putExtra(WorkLocationMonitorService.EXTRA_WORK_LAT, lat);
    intent.putExtra(WorkLocationMonitorService.EXTRA_WORK_LNG, lng);
    intent.putExtra(WorkLocationMonitorService.EXTRA_RADIUS_METERS, radius);
    intent.putExtra(WorkLocationMonitorService.EXTRA_PROMPT_COOLDOWN_MS, cooldownMs);
    intent.putExtra(WorkLocationMonitorService.EXTRA_AUTO_STOP_DISTANCE_METERS, autoStopDistance);
    intent.putExtra(WorkLocationMonitorService.EXTRA_RESET_PROMPT, resetPrompt);

    dispatchMonitorServiceIntent(intent, true);

    JSObject out = buildStatusPayload();
    out.put("started", true);
    call.resolve(out);
  }

  @PluginMethod
  public void stopMonitor(PluginCall call) {
    final Context ctx = getContext();
    final Intent intent = new Intent(ctx, WorkLocationMonitorService.class);
    intent.setAction(WorkLocationMonitorService.ACTION_STOP_MONITOR);
    dispatchMonitorServiceIntent(intent, false);

    JSObject out = buildStatusPayload();
    out.put("stopped", true);
    call.resolve(out);
  }

  @PluginMethod
  public void syncTimerState(PluginCall call) {
    final boolean running = call.getBoolean(WorkLocationMonitorService.EXTRA_TIMER_RUNNING, false);
    final long startTime = call.getLong(WorkLocationMonitorService.EXTRA_TIMER_START_TIME, 0L);
    final Boolean autoStartHold = call.getBoolean(WorkLocationMonitorService.EXTRA_AUTO_START_HOLD);

    final Context ctx = getContext();
    final Intent intent = new Intent(ctx, WorkLocationMonitorService.class);
    intent.setAction(WorkLocationMonitorService.ACTION_SYNC_TIMER_STATE);
    intent.putExtra(WorkLocationMonitorService.EXTRA_TIMER_RUNNING, running);
    intent.putExtra(WorkLocationMonitorService.EXTRA_TIMER_START_TIME, startTime);
    if (autoStartHold != null) {
      intent.putExtra(WorkLocationMonitorService.EXTRA_AUTO_START_HOLD, autoStartHold.booleanValue());
    }
    dispatchMonitorServiceIntent(intent, running);

    JSObject out = buildStatusPayload();
    out.put("synced", true);
    call.resolve(out);
  }

  @PluginMethod
  public void getStatus(PluginCall call) {
    call.resolve(buildStatusPayload());
  }

  @PluginMethod
  public void consumePendingActions(PluginCall call) {
    final SharedPreferences prefs = getPrefs();
    final long pendingStart = prefs.getLong(WorkLocationMonitorService.KEY_PENDING_START_MS, 0L);
    final long pendingStop = prefs.getLong(WorkLocationMonitorService.KEY_PENDING_STOP_MS, 0L);
    final long pendingStopStart = prefs.getLong(WorkLocationMonitorService.KEY_PENDING_STOP_START_MS, 0L);

    prefs.edit()
      .putLong(WorkLocationMonitorService.KEY_PENDING_START_MS, 0L)
      .putLong(WorkLocationMonitorService.KEY_PENDING_STOP_MS, 0L)
      .putLong(WorkLocationMonitorService.KEY_PENDING_STOP_START_MS, 0L)
      .apply();

    JSObject out = buildStatusPayload();
    out.put("pendingStartTime", pendingStart);
    out.put("pendingStopTime", pendingStop);
    out.put("pendingStopStartTime", pendingStopStart);
    call.resolve(out);
  }

  private JSObject buildPermissionPayload() {
    JSObject out = new JSObject();
    final boolean fgLocation = isForegroundLocationGranted();
    final boolean bgLocation = isBackgroundLocationGranted();
    // Foreground service de localização já cobre o monitor em segundo plano neste app.
    // Não bloqueamos o recurso quando ACCESS_BACKGROUND_LOCATION não vier explicitamente.
    final boolean locationGranted = fgLocation;
    final boolean notificationsGranted = isNotificationGranted();

    out.put("granted", locationGranted);
    out.put("locationGranted", locationGranted);
    out.put("foregroundLocationGranted", fgLocation);
    out.put("backgroundLocationGranted", bgLocation);
    out.put("notificationsGranted", notificationsGranted);
    out.put("location", locationGranted ? "granted" : "denied");
    out.put("notifications", notificationsGranted ? "granted" : "denied");
    return out;
  }

  private JSObject buildStatusPayload() {
    SharedPreferences prefs = getPrefs();
    JSObject out = new JSObject();
    out.put("monitorEnabled", prefs.getBoolean(WorkLocationMonitorService.KEY_MONITOR_ENABLED, false));
    out.put("timerRunning", prefs.getBoolean(WorkLocationMonitorService.KEY_TIMER_RUNNING, false));
    out.put("timerStartTime", prefs.getLong(WorkLocationMonitorService.KEY_TIMER_START_MS, 0L));
    out.put("autoStartHold", prefs.getBoolean(WorkLocationMonitorService.KEY_AUTO_START_HOLD, false));
    out.put("lastPromptAt", prefs.getLong(WorkLocationMonitorService.KEY_LAST_PROMPT_AT, 0L));
    out.put("lastDistanceMeters", prefs.getFloat(WorkLocationMonitorService.KEY_LAST_DISTANCE_METERS, -1f));
    out.put("lastInside", prefs.getBoolean(WorkLocationMonitorService.KEY_LAST_IS_INSIDE, false));
    out.put("locationPermission", getPermissionState(LOCATION_ALIAS) == PermissionState.GRANTED ? "granted" : "denied");
    out.put("notificationPermission", isNotificationGranted() ? "granted" : "denied");
    return out;
  }

  private SharedPreferences getPrefs() {
    return getContext().getSharedPreferences(WorkLocationMonitorService.PREFS_NAME, Context.MODE_PRIVATE);
  }

  private void dispatchMonitorServiceIntent(Intent intent, boolean requiresForeground) {
    final Context ctx = getContext();
    if (requiresForeground) {
      ContextCompat.startForegroundService(ctx, intent);
      return;
    }
    ctx.startService(intent);
  }

  private boolean isForegroundLocationGranted() {
    Context ctx = getContext();
    boolean fine = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    boolean coarse = ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    return fine || coarse;
  }

  private boolean isBackgroundLocationGranted() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true;
    Context ctx = getContext();
    return ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
  }

  private boolean isNotificationGranted() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
    Context ctx = getContext();
    return ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
  }
}
