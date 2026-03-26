package com.universoreal.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Logger;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

public class WorkLocationMonitorService extends Service {
  public static final String ACTION_START_MONITOR = "com.universoreal.app.action.START_WORK_MONITOR";
  public static final String ACTION_STOP_MONITOR = "com.universoreal.app.action.STOP_WORK_MONITOR";
  public static final String ACTION_SYNC_TIMER_STATE = "com.universoreal.app.action.SYNC_WORK_TIMER_STATE";
  public static final String ACTION_TIMER_START_FROM_NOTIFICATION = "com.universoreal.app.action.WORK_TIMER_START_FROM_NOTIFICATION";
  public static final String ACTION_TIMER_SKIP_FROM_NOTIFICATION = "com.universoreal.app.action.WORK_TIMER_SKIP_FROM_NOTIFICATION";
  public static final String ACTION_TIMER_STOP_FROM_NOTIFICATION = "com.universoreal.app.action.WORK_TIMER_STOP_FROM_NOTIFICATION";

  public static final String EXTRA_WORK_LAT = "workLat";
  public static final String EXTRA_WORK_LNG = "workLng";
  public static final String EXTRA_RADIUS_METERS = "radiusMeters";
  public static final String EXTRA_PROMPT_COOLDOWN_MS = "promptCooldownMs";
  public static final String EXTRA_AUTO_STOP_DISTANCE_METERS = "autoStopDistanceMeters";
  public static final String EXTRA_RESET_PROMPT = "resetPrompt";
  public static final String EXTRA_TIMER_RUNNING = "running";
  public static final String EXTRA_TIMER_START_TIME = "startTime";
  public static final String EXTRA_AUTO_START_HOLD = "autoStartHold";

  public static final String PREFS_NAME = "ur_work_location_monitor";
  public static final String KEY_MONITOR_ENABLED = "monitor_enabled";
  public static final String KEY_WORK_LAT = "work_lat";
  public static final String KEY_WORK_LNG = "work_lng";
  public static final String KEY_RADIUS_METERS = "radius_meters";
  public static final String KEY_PROMPT_COOLDOWN_MS = "prompt_cooldown_ms";
  public static final String KEY_LAST_PROMPT_AT = "last_prompt_at";
  public static final String KEY_AUTO_STOP_DISTANCE_METERS = "auto_stop_distance_meters";
  public static final String KEY_LAST_DISTANCE_METERS = "last_distance_meters";
  public static final String KEY_LAST_IS_INSIDE = "last_is_inside";
  public static final String KEY_TIMER_RUNNING = "timer_running";
  public static final String KEY_TIMER_START_MS = "timer_start_ms";
  public static final String KEY_PENDING_START_MS = "pending_start_ms";
  public static final String KEY_PENDING_STOP_MS = "pending_stop_ms";
  public static final String KEY_PENDING_STOP_START_MS = "pending_stop_start_ms";
  public static final String KEY_OUTSIDE_SINCE_MS = "outside_since_ms";
  public static final String KEY_OUTSIDE_CHECK_COUNT = "outside_check_count";
  public static final String KEY_INSIDE_SINCE_MS = "inside_since_ms";
  public static final String KEY_INSIDE_ANCHOR_LAT = "inside_anchor_lat";
  public static final String KEY_INSIDE_ANCHOR_LNG = "inside_anchor_lng";
  public static final String KEY_AUTO_START_HOLD = "auto_start_hold";

  private static final String CHANNEL_MONITOR = "ur_work_monitor";
  private static final String CHANNEL_PROMPT = "ur_work_prompt";
  private static final int FOREGROUND_NOTIFICATION_ID = 94001;
  private static final int START_PROMPT_NOTIFICATION_ID = 94002;
  private static final int TIMER_INFO_NOTIFICATION_ID = 94003;
  private static final long LOCATION_UPDATE_INTERVAL_MS = 30000L;
  private static final long LOCATION_FASTEST_INTERVAL_MS = 12000L;
  private static final int DEFAULT_RADIUS_METERS = 220;
  private static final long DEFAULT_PROMPT_COOLDOWN_MS = 30 * 60 * 1000L;
  private static final int DEFAULT_AUTO_STOP_DISTANCE_METERS = 120;
  private static final int MIN_AUTO_STOP_DISTANCE_METERS = 50;
  private static final int MAX_AUTO_STOP_DISTANCE_METERS = 5000;
  private static final long AUTO_STOP_OUTSIDE_GRACE_MS = 2 * 60 * 1000L;
  private static final int AUTO_STOP_OUTSIDE_MIN_CHECKS = 3;
  private static final long AUTO_START_INSIDE_STAY_MS = 10 * 60 * 1000L;
  private static final int AUTO_START_INSIDE_MAX_DRIFT_METERS = 60;

  private FusedLocationProviderClient fusedLocationClient;
  private LocationCallback locationCallback;
  private Handler timerHandler;
  private Runnable timerTicker;
  private boolean locationUpdatesActive = false;
  private boolean foregroundStarted = false;

  @Override
  public void onCreate() {
    super.onCreate();
    fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
    timerHandler = new Handler(Looper.getMainLooper());
    setupLocationCallback();
    ensureNotificationChannels();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    final String action = intent != null ? intent.getAction() : null;
    try {
      if (ACTION_START_MONITOR.equals(action)) {
        handleStartMonitor(intent);
        return START_STICKY;
      }
      if (ACTION_STOP_MONITOR.equals(action)) {
        handleStopMonitor();
        return START_NOT_STICKY;
      }
      if (ACTION_TIMER_START_FROM_NOTIFICATION.equals(action)) {
        handleTimerStart(System.currentTimeMillis(), true);
        return START_STICKY;
      }
      if (ACTION_TIMER_SKIP_FROM_NOTIFICATION.equals(action)) {
        handleTimerSkip();
        return START_STICKY;
      }
      if (ACTION_TIMER_STOP_FROM_NOTIFICATION.equals(action)) {
        handleTimerStop(System.currentTimeMillis(), true, true);
        return START_STICKY;
      }
      if (ACTION_SYNC_TIMER_STATE.equals(action)) {
        handleSyncTimerState(intent);
        return START_STICKY;
      }
      if (isMonitorEnabled()) {
        ensureForegroundNotification();
        startLocationUpdatesIfNeeded();
        startTimerTickerIfNeeded();
        return START_STICKY;
      }
    } catch (Exception e) {
      Logger.warn("WorkLocationMonitor", "Falha em onStartCommand: " + e.getMessage());
    }
    return START_NOT_STICKY;
  }

  @Override
  public void onDestroy() {
    stopLocationUpdates();
    stopTimerTicker();
    super.onDestroy();
  }

  @Nullable
  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private SharedPreferences prefs() {
    return getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
  }

  private void setupLocationCallback() {
    locationCallback = new LocationCallback() {
      @Override
      public void onLocationResult(LocationResult locationResult) {
        if (locationResult == null) return;
        for (Location location : locationResult.getLocations()) {
          if (location == null) continue;
          evaluateDistance(location.getLatitude(), location.getLongitude());
        }
      }
    };
  }

  private boolean hasLocationPermission() {
    final boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    final boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    return fine || coarse;
  }

  private void handleStartMonitor(Intent intent) {
    final double lat = intent != null ? intent.getDoubleExtra(EXTRA_WORK_LAT, Double.NaN) : Double.NaN;
    final double lng = intent != null ? intent.getDoubleExtra(EXTRA_WORK_LNG, Double.NaN) : Double.NaN;
    final int radius = intent != null ? intent.getIntExtra(EXTRA_RADIUS_METERS, DEFAULT_RADIUS_METERS) : DEFAULT_RADIUS_METERS;
    final long cooldown = intent != null ? intent.getLongExtra(EXTRA_PROMPT_COOLDOWN_MS, DEFAULT_PROMPT_COOLDOWN_MS) : DEFAULT_PROMPT_COOLDOWN_MS;
    final int autoStop = intent != null ? intent.getIntExtra(EXTRA_AUTO_STOP_DISTANCE_METERS, DEFAULT_AUTO_STOP_DISTANCE_METERS) : DEFAULT_AUTO_STOP_DISTANCE_METERS;
    final boolean resetPrompt = intent != null && intent.getBooleanExtra(EXTRA_RESET_PROMPT, false);

    if (!Double.isFinite(lat) || !Double.isFinite(lng)) {
      Logger.warn("WorkLocationMonitor", "Local de trabalho invalido para iniciar monitor.");
      return;
    }

    final SharedPreferences p = prefs();
    final double prevLat = parseStoredDouble(KEY_WORK_LAT, Double.NaN);
    final double prevLng = parseStoredDouble(KEY_WORK_LNG, Double.NaN);
    final boolean locationChangedSignificantly = Double.isFinite(prevLat) && Double.isFinite(prevLng)
      && haversineMeters(prevLat, prevLng, lat, lng) > 25d;
    final boolean shouldResetPrompt = resetPrompt || !Double.isFinite(prevLat) || !Double.isFinite(prevLng) || locationChangedSignificantly;

    SharedPreferences.Editor editor = p.edit()
      .putBoolean(KEY_MONITOR_ENABLED, true)
      .putString(KEY_WORK_LAT, String.valueOf(lat))
      .putString(KEY_WORK_LNG, String.valueOf(lng))
      .putInt(KEY_RADIUS_METERS, Math.max(80, Math.min(5000, radius)))
      .putLong(KEY_PROMPT_COOLDOWN_MS, Math.max(60_000L, cooldown))
      .putInt(KEY_AUTO_STOP_DISTANCE_METERS, Math.max(MIN_AUTO_STOP_DISTANCE_METERS, Math.min(MAX_AUTO_STOP_DISTANCE_METERS, autoStop)))
      .putLong(KEY_OUTSIDE_SINCE_MS, 0L)
      .putInt(KEY_OUTSIDE_CHECK_COUNT, 0)
      .putLong(KEY_INSIDE_SINCE_MS, 0L)
      .remove(KEY_INSIDE_ANCHOR_LAT)
      .remove(KEY_INSIDE_ANCHOR_LNG);
    if (shouldResetPrompt) {
      editor.putLong(KEY_LAST_PROMPT_AT, 0L);
    }
    editor.apply();

    ensureForegroundNotification();
    startLocationUpdatesIfNeeded();
    requestLastKnownLocation();
    startTimerTickerIfNeeded();
  }

  private void handleStopMonitor() {
    prefs().edit()
      .putBoolean(KEY_MONITOR_ENABLED, false)
      .putLong(KEY_INSIDE_SINCE_MS, 0L)
      .remove(KEY_INSIDE_ANCHOR_LAT)
      .remove(KEY_INSIDE_ANCHOR_LNG)
      .apply();
    cancelStartPromptNotification();
    stopLocationUpdates();
    stopTimerTicker();
    final boolean timerRunning = isTimerRunning();
    if (!timerRunning) {
      stopForeground(true);
      foregroundStarted = false;
      stopSelf();
    } else {
      ensureForegroundNotification();
    }
  }

  private void handleSyncTimerState(Intent intent) {
    final boolean running = intent != null && intent.getBooleanExtra(EXTRA_TIMER_RUNNING, false);
    final long startTime = intent != null ? intent.getLongExtra(EXTRA_TIMER_START_TIME, 0L) : 0L;
    final boolean hasAutoStartHold = intent != null && intent.hasExtra(EXTRA_AUTO_START_HOLD);
    final boolean autoStartHold = intent != null && intent.getBooleanExtra(EXTRA_AUTO_START_HOLD, false);
    if (running) {
      final long safeStart = startTime > 0 ? startTime : System.currentTimeMillis();
      prefs().edit()
        .putBoolean(KEY_TIMER_RUNNING, true)
        .putLong(KEY_TIMER_START_MS, safeStart)
        .putBoolean(KEY_AUTO_START_HOLD, false)
        .apply();
      startTimerTickerIfNeeded();
    } else {
      SharedPreferences.Editor editor = prefs().edit()
        .putBoolean(KEY_TIMER_RUNNING, false)
        .putLong(KEY_TIMER_START_MS, 0L)
        .putLong(KEY_OUTSIDE_SINCE_MS, 0L)
        .putInt(KEY_OUTSIDE_CHECK_COUNT, 0)
        .putLong(KEY_INSIDE_SINCE_MS, 0L)
        .remove(KEY_INSIDE_ANCHOR_LAT)
        .remove(KEY_INSIDE_ANCHOR_LNG);
      if (hasAutoStartHold) {
        editor.putBoolean(KEY_AUTO_START_HOLD, autoStartHold);
      }
      editor.apply();
      stopTimerTicker();
    }
    if (isMonitorEnabled() || isTimerRunning()) {
      ensureForegroundNotification();
    } else {
      stopForeground(true);
      foregroundStarted = false;
      stopSelf();
    }
  }

  private void handleTimerStart(long startTimeMs, boolean markPending) {
    final long safeStart = startTimeMs > 0 ? startTimeMs : System.currentTimeMillis();
    if (isTimerRunning()) {
      startTimerTickerIfNeeded();
      ensureForegroundNotification();
      cancelStartPromptNotification();
      return;
    }

    SharedPreferences.Editor editor = prefs().edit()
      .putBoolean(KEY_TIMER_RUNNING, true)
      .putLong(KEY_TIMER_START_MS, safeStart)
      .putBoolean(KEY_AUTO_START_HOLD, false)
      .putLong(KEY_OUTSIDE_SINCE_MS, 0L)
      .putInt(KEY_OUTSIDE_CHECK_COUNT, 0)
      .putLong(KEY_INSIDE_SINCE_MS, 0L)
      .remove(KEY_INSIDE_ANCHOR_LAT)
      .remove(KEY_INSIDE_ANCHOR_LNG);
    if (markPending) {
      editor.putLong(KEY_PENDING_START_MS, safeStart);
    }
    editor.apply();

    cancelStartPromptNotification();
    startTimerTickerIfNeeded();
    ensureForegroundNotification();
    notifyInfo("Ponto iniciado", "O cronometro de trabalho foi iniciado.");
  }

  private void handleTimerSkip() {
    final long now = System.currentTimeMillis();
    prefs().edit().putLong(KEY_LAST_PROMPT_AT, now).apply();
    cancelStartPromptNotification();
  }

  private void handleTimerStop(long stopAtMs, boolean notifyUser, boolean markPending) {
    if (!isTimerRunning()) return;

    final long stopAt = stopAtMs > 0 ? stopAtMs : System.currentTimeMillis();
    final long startAt = prefs().getLong(KEY_TIMER_START_MS, 0L);

    SharedPreferences.Editor editor = prefs().edit()
      .putBoolean(KEY_TIMER_RUNNING, false)
      .putLong(KEY_TIMER_START_MS, 0L)
      .putLong(KEY_OUTSIDE_SINCE_MS, 0L)
      .putInt(KEY_OUTSIDE_CHECK_COUNT, 0)
      .putLong(KEY_INSIDE_SINCE_MS, 0L)
      .remove(KEY_INSIDE_ANCHOR_LAT)
      .remove(KEY_INSIDE_ANCHOR_LNG);

    if (markPending) {
      editor.putLong(KEY_PENDING_STOP_MS, stopAt);
      editor.putLong(KEY_PENDING_STOP_START_MS, startAt);
    }
    editor.apply();

    stopTimerTicker();
    cancelStartPromptNotification();
    ensureForegroundNotification();

    if (notifyUser) {
      notifyInfo(
        "Ponto encerrado automaticamente",
        "Voce saiu da area de trabalho. O cronometro foi encerrado."
      );
    }
  }

  private void startLocationUpdatesIfNeeded() {
    if (locationUpdatesActive) return;
    if (!isMonitorEnabled()) return;
    if (!hasLocationPermission()) return;

    try {
      final LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, LOCATION_UPDATE_INTERVAL_MS)
        .setMinUpdateIntervalMillis(LOCATION_FASTEST_INTERVAL_MS)
        .build();
      fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
      locationUpdatesActive = true;
    } catch (SecurityException sec) {
      Logger.warn("WorkLocationMonitor", "Sem permissao para monitorar localizacao em segundo plano.");
      locationUpdatesActive = false;
    } catch (Exception e) {
      Logger.warn("WorkLocationMonitor", "Falha ao iniciar updates de localizacao: " + e.getMessage());
      locationUpdatesActive = false;
    }
  }

  private void stopLocationUpdates() {
    if (!locationUpdatesActive) return;
    try {
      fusedLocationClient.removeLocationUpdates(locationCallback);
    } catch (Exception ignored) {
    } finally {
      locationUpdatesActive = false;
    }
  }

  private void requestLastKnownLocation() {
    if (!hasLocationPermission()) return;
    try {
      fusedLocationClient.getLastLocation()
        .addOnSuccessListener((location) -> {
          if (location == null) return;
          evaluateDistance(location.getLatitude(), location.getLongitude());
        });
    } catch (Exception ignored) {
    }
  }

  private void evaluateDistance(double currentLat, double currentLng) {
    if (!isMonitorEnabled()) return;
    final double workLat = parseStoredDouble(KEY_WORK_LAT, Double.NaN);
    final double workLng = parseStoredDouble(KEY_WORK_LNG, Double.NaN);
    if (!Double.isFinite(workLat) || !Double.isFinite(workLng)) return;

    final double distance = haversineMeters(currentLat, currentLng, workLat, workLng);
    final int radius = prefs().getInt(KEY_RADIUS_METERS, DEFAULT_RADIUS_METERS);
    final boolean inside = distance <= radius;

    prefs().edit()
      .putFloat(KEY_LAST_DISTANCE_METERS, (float) distance)
      .putBoolean(KEY_LAST_IS_INSIDE, inside)
      .apply();

    if (inside) {
      final long now = System.currentTimeMillis();
      long insideSince = prefs().getLong(KEY_INSIDE_SINCE_MS, 0L);
      double anchorLat = parseStoredDouble(KEY_INSIDE_ANCHOR_LAT, Double.NaN);
      double anchorLng = parseStoredDouble(KEY_INSIDE_ANCHOR_LNG, Double.NaN);

      if (!Double.isFinite(anchorLat) || !Double.isFinite(anchorLng)) {
        anchorLat = currentLat;
        anchorLng = currentLng;
      }
      if (insideSince <= 0L) {
        insideSince = now;
      }

      final double insideDrift = haversineMeters(anchorLat, anchorLng, currentLat, currentLng);
      if (insideDrift > AUTO_START_INSIDE_MAX_DRIFT_METERS) {
        anchorLat = currentLat;
        anchorLng = currentLng;
        insideSince = now;
      }

      prefs().edit()
        .putLong(KEY_OUTSIDE_SINCE_MS, 0L)
        .putInt(KEY_OUTSIDE_CHECK_COUNT, 0)
        .putLong(KEY_INSIDE_SINCE_MS, insideSince)
        .putString(KEY_INSIDE_ANCHOR_LAT, String.valueOf(anchorLat))
        .putString(KEY_INSIDE_ANCHOR_LNG, String.valueOf(anchorLng))
        .apply();

      if (!isTimerRunning()) {
        final boolean autoStartHold = prefs().getBoolean(KEY_AUTO_START_HOLD, false);
        if (autoStartHold) {
          ensureForegroundNotification();
          return;
        }
        final long insideElapsed = Math.max(0L, now - insideSince);
        if (insideElapsed >= AUTO_START_INSIDE_STAY_MS) {
          handleTimerStart(insideSince, true);
        } else {
          final long lastPromptAt = prefs().getLong(KEY_LAST_PROMPT_AT, 0L);
          final long cooldownMs = Math.max(60_000L, prefs().getLong(KEY_PROMPT_COOLDOWN_MS, DEFAULT_PROMPT_COOLDOWN_MS));
          if ((now - lastPromptAt) >= cooldownMs) {
            prefs().edit().putLong(KEY_LAST_PROMPT_AT, now).apply();
            if (canPostPromptNotifications()) {
              showStartPromptNotification(distance);
            }
          }
        }
      }
    } else {
      prefs().edit()
        .putLong(KEY_INSIDE_SINCE_MS, 0L)
        .putBoolean(KEY_AUTO_START_HOLD, false)
        .remove(KEY_INSIDE_ANCHOR_LAT)
        .remove(KEY_INSIDE_ANCHOR_LNG)
        .apply();
      final int autoStopDistance = Math.max(
        MIN_AUTO_STOP_DISTANCE_METERS,
        Math.min(MAX_AUTO_STOP_DISTANCE_METERS, prefs().getInt(KEY_AUTO_STOP_DISTANCE_METERS, DEFAULT_AUTO_STOP_DISTANCE_METERS))
      );
      if (isTimerRunning() && distance > autoStopDistance) {
        final long now = System.currentTimeMillis();
        long outsideSince = prefs().getLong(KEY_OUTSIDE_SINCE_MS, 0L);
        int outsideChecks = prefs().getInt(KEY_OUTSIDE_CHECK_COUNT, 0);
        if (outsideSince <= 0L) outsideSince = now;
        outsideChecks = Math.max(1, outsideChecks + 1);
        final long outsideElapsed = Math.max(0L, now - outsideSince);

        prefs().edit()
          .putLong(KEY_OUTSIDE_SINCE_MS, outsideSince)
          .putInt(KEY_OUTSIDE_CHECK_COUNT, outsideChecks)
          .apply();

        if (outsideChecks >= AUTO_STOP_OUTSIDE_MIN_CHECKS && outsideElapsed >= AUTO_STOP_OUTSIDE_GRACE_MS) {
          handleTimerStop(now, true, true);
        }
      } else {
        prefs().edit()
          .putLong(KEY_OUTSIDE_SINCE_MS, 0L)
          .putInt(KEY_OUTSIDE_CHECK_COUNT, 0)
          .apply();
      }
    }

    ensureForegroundNotification();
  }

  private boolean isMonitorEnabled() {
    return prefs().getBoolean(KEY_MONITOR_ENABLED, false);
  }

  private boolean isTimerRunning() {
    return prefs().getBoolean(KEY_TIMER_RUNNING, false);
  }

  private long getTimerStartMs() {
    return prefs().getLong(KEY_TIMER_START_MS, 0L);
  }

  private double parseStoredDouble(String key, double fallback) {
    final String raw = prefs().getString(key, null);
    if (raw == null) return fallback;
    try {
      return Double.parseDouble(raw);
    } catch (Exception e) {
      return fallback;
    }
  }

  private void ensureNotificationChannels() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    final NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (nm == null) return;

    final NotificationChannel monitor = new NotificationChannel(
      CHANNEL_MONITOR,
      "Trabalho automatico",
      NotificationManager.IMPORTANCE_LOW
    );
    monitor.setDescription("Monitoramento de chegada/saida do trabalho.");
    monitor.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
    nm.createNotificationChannel(monitor);

    final NotificationChannel prompt = new NotificationChannel(
      CHANNEL_PROMPT,
      "Acoes do ponto",
      NotificationManager.IMPORTANCE_HIGH
    );
    prompt.setDescription("Notificacoes para iniciar/parar ponto.");
    prompt.setLockscreenVisibility(android.app.Notification.VISIBILITY_PRIVATE);
    nm.createNotificationChannel(prompt);
  }

  private void ensureForegroundNotification() {
    final NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_MONITOR)
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setContentTitle("Trabalho automatico")
      .setContentText(buildForegroundLine())
      .setStyle(new NotificationCompat.BigTextStyle().bigText(buildForegroundLine()))
      .setContentIntent(buildOpenAppIntent())
      .setOnlyAlertOnce(true)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW);

    if (isTimerRunning()) {
      builder.addAction(
        0,
        "Parar ponto",
        buildServiceActionIntent(ACTION_TIMER_STOP_FROM_NOTIFICATION, 3003)
      );
    }

    try {
      if (!foregroundStarted) {
        startForeground(FOREGROUND_NOTIFICATION_ID, builder.build());
        foregroundStarted = true;
      } else {
        NotificationManagerCompat.from(this).notify(FOREGROUND_NOTIFICATION_ID, builder.build());
      }
    } catch (SecurityException sec) {
      // Android 14+ pode bloquear FGS de localizacao sem estado/permissoes elegiveis.
      // Evita crash do app e desativa monitor quando nao ha permissao.
      foregroundStarted = false;
      Logger.warn("WorkLocationMonitor", "startForeground bloqueado: " + sec.getMessage());
      if (!hasLocationPermission()) {
        prefs().edit().putBoolean(KEY_MONITOR_ENABLED, false).apply();
        stopLocationUpdates();
      }
      try {
        NotificationManagerCompat.from(this).notify(FOREGROUND_NOTIFICATION_ID, builder.build());
      } catch (Exception ignored) {
      }
    } catch (Exception e) {
      foregroundStarted = false;
      Logger.warn("WorkLocationMonitor", "Falha ao atualizar notificacao foreground: " + e.getMessage());
    }
  }

  private String buildForegroundLine() {
    final float distance = prefs().getFloat(KEY_LAST_DISTANCE_METERS, -1f);
    final boolean inside = prefs().getBoolean(KEY_LAST_IS_INSIDE, false);
    if (isTimerRunning()) {
      final long elapsed = Math.max(0L, System.currentTimeMillis() - getTimerStartMs());
      final String elapsedText = formatElapsed(elapsed);
      if (distance >= 0f) {
        return "Ponto em andamento: " + elapsedText + " - Distancia: " + formatDistance(distance) + (inside ? " (no local)" : "");
      }
      return "Ponto em andamento: " + elapsedText;
    }
    if (distance >= 0f) {
      return "Monitorando chegada - Distancia atual: " + formatDistance(distance) + (inside ? " (no local)" : "");
    }
    return "Monitorando chegada ao trabalho em segundo plano.";
  }

  private void showStartPromptNotification(double distanceMeters) {
    final String distanceText = formatDistance((float) distanceMeters);
    final NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_PROMPT)
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setContentTitle("Iniciar ponto de trabalho?")
      .setContentText("Voce esta a " + distanceText + " do trabalho.")
      .setStyle(new NotificationCompat.BigTextStyle().bigText("Voce esta a " + distanceText + " do trabalho. Deseja iniciar o ponto agora?"))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setAutoCancel(false)
      .setOngoing(false)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setContentIntent(buildOpenAppIntent())
      .addAction(0, "Iniciar", buildServiceActionIntent(ACTION_TIMER_START_FROM_NOTIFICATION, 3001))
      .addAction(0, "Agora nao", buildServiceActionIntent(ACTION_TIMER_SKIP_FROM_NOTIFICATION, 3002));

    NotificationManagerCompat.from(this).notify(START_PROMPT_NOTIFICATION_ID, builder.build());
  }

  private boolean canPostPromptNotifications() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
    return ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
  }

  private void notifyInfo(String title, String body) {
    final NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_PROMPT)
      .setSmallIcon(android.R.drawable.ic_popup_reminder)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setAutoCancel(true)
      .setContentIntent(buildOpenAppIntent());

    NotificationManagerCompat.from(this).notify(TIMER_INFO_NOTIFICATION_ID, builder.build());
  }

  private void cancelStartPromptNotification() {
    NotificationManagerCompat.from(this).cancel(START_PROMPT_NOTIFICATION_ID);
  }

  private PendingIntent buildOpenAppIntent() {
    final Intent intent = new Intent(this, MainActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    final int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    return PendingIntent.getActivity(this, 3000, intent, flags);
  }

  private PendingIntent buildServiceActionIntent(String action, int requestCode) {
    final Intent intent = new Intent(this, WorkLocationMonitorService.class);
    intent.setAction(action);
    final int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    return PendingIntent.getService(this, requestCode, intent, flags);
  }

  private void startTimerTickerIfNeeded() {
    if (!isTimerRunning()) {
      stopTimerTicker();
      return;
    }
    if (timerTicker != null) return;
    timerTicker = new Runnable() {
      @Override
      public void run() {
        if (!isTimerRunning()) {
          stopTimerTicker();
          ensureForegroundNotification();
          return;
        }
        ensureForegroundNotification();
        timerHandler.postDelayed(this, 1000L);
      }
    };
    timerHandler.post(timerTicker);
  }

  private void stopTimerTicker() {
    if (timerTicker != null) {
      timerHandler.removeCallbacks(timerTicker);
      timerTicker = null;
    }
  }

  private static double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
    final double rad = Math.PI / 180d;
    final double dLat = (lat2 - lat1) * rad;
    final double dLng = (lng2 - lng1) * rad;
    final double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    final double c = 2d * Math.atan2(Math.sqrt(a), Math.sqrt(1d - a));
    return 6371000d * c;
  }

  private static String formatElapsed(long elapsedMs) {
    final long sec = Math.max(0L, elapsedMs / 1000L);
    final long hh = sec / 3600L;
    final long mm = (sec % 3600L) / 60L;
    final long ss = sec % 60L;
    return String.format("%02d:%02d:%02d", hh, mm, ss);
  }

  private static String formatDistance(float meters) {
    if (meters < 0f) return "--";
    if (meters < 1000f) return Math.round(meters) + " m";
    return String.format(java.util.Locale.US, "%.2f km", (meters / 1000f));
  }
}

