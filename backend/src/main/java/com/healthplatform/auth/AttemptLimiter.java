package com.healthplatform.auth;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** Counts attempts per key in a fixed time window. In memory, which suits a single server. */
@Component
class AttemptLimiter {

    private static final long WINDOW_MS = Duration.ofMinutes(15).toMillis();
    private static final int PURGE_ABOVE_KEYS = 50_000;

    private record Window(long startedAt, int count) {}

    private final Map<String, Window> windows = new ConcurrentHashMap<>();

    boolean isBlocked(String key, int limit) {
        Window window = windows.get(key);
        return window != null && !expired(window, System.currentTimeMillis()) && window.count() >= limit;
    }

    void record(String key) {
        long now = System.currentTimeMillis();
        if (windows.size() > PURGE_ABOVE_KEYS) {
            windows.values().removeIf(w -> expired(w, now));
        }
        windows.compute(key, (k, w) -> w == null || expired(w, now) ? new Window(now, 1) : new Window(w.startedAt(), w.count() + 1));
    }

    private static boolean expired(Window window, long now) {
        return now - window.startedAt() >= WINDOW_MS;
    }
}
