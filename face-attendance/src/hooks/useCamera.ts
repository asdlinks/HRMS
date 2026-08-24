import { useCallback, useEffect, useRef, useState } from 'react';

export interface CameraState {
  ready: boolean;
  error: string | null;
  resolution: { width: number; height: number } | null;
}

// Holds a getUserMedia stream open indefinitely and auto-recovers if the track
// drops (unplugged webcam, OS sleep, another app grabbing the camera). The
// video element is owned by the caller via the returned ref.
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const retryRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const [state, setState] = useState<CameraState>({ ready: false, error: null, resolution: null });

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (stoppedRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings();
      setState({
        ready: true,
        error: null,
        resolution: settings?.width && settings?.height ? { width: settings.width, height: settings.height } : null,
      });

      // Auto-recover: if the track ends, tear down and re-acquire shortly.
      track?.addEventListener('ended', () => {
        setState((s) => ({ ...s, ready: false }));
        stopStream();
        if (!stoppedRef.current) retryRef.current = window.setTimeout(() => void start(), 1500);
      });
    } catch (err) {
      setState({
        ready: false,
        error: (err as Error)?.name === 'NotAllowedError' ? 'Camera permission denied' : 'Camera unavailable',
        resolution: null,
      });
      if (!stoppedRef.current) retryRef.current = window.setTimeout(() => void start(), 3000);
    }
  }, [stopStream]);

  useEffect(() => {
    stoppedRef.current = false;
    void start();
    return () => {
      stoppedRef.current = true;
      if (retryRef.current) window.clearTimeout(retryRef.current);
      stopStream();
    };
  }, [start, stopStream]);

  return { videoRef, ...state };
}
