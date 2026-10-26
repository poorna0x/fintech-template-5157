package com.hydrogenro.technician;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.view.KeyEvent;

/** Pauses music and other players that honor audio focus while location is being requested. */
final class PlaybackPause {

    private static AudioFocusRequest request;
    private static boolean held;

    private PlaybackPause() {}

    static void pause(Context context) {
        AudioManager audio = audio(context);
        if (audio == null || held) return;
        try {
            int result;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
                request = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attrs)
                    .setAcceptsDelayedFocusGain(false)
                    .setOnAudioFocusChangeListener(focus -> { })
                    .build();
                result = audio.requestAudioFocus(request);
            } else {
                result = audio.requestAudioFocus(
                    focus -> { },
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
                );
            }
            held = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
            long now = android.os.SystemClock.uptimeMillis();
            audio.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PAUSE, 0));
            audio.dispatchMediaKeyEvent(new KeyEvent(now, now, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PAUSE, 0));
        } catch (Throwable ignored) {
            /* a player that ignores focus keeps playing */
        }
    }

    static void resume(Context context) {
        if (!held) return;
        AudioManager audio = audio(context);
        held = false;
        if (audio == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && request != null) {
                audio.abandonAudioFocusRequest(request);
            } else {
                audio.abandonAudioFocus(focus -> { });
            }
        } catch (Throwable ignored) {
            /* nothing to resume */
        }
        request = null;
    }

    private static AudioManager audio(Context context) {
        return (AudioManager) context.getApplicationContext().getSystemService(Context.AUDIO_SERVICE);
    }
}
