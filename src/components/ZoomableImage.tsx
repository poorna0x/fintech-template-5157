import React, { useCallback, useEffect, useRef } from 'react';

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 350;
const TAP_MOVE_PX = 14;
const DOUBLE_TAP_SCALE = 2.5;

type Pt = { x: number; y: number };

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Fullscreen photo zoom for Capacitor WebView + mobile browsers.
 * Uses Pointer Events. Avoids holding setPointerCapture during 2-finger pinch —
 * capture on finger 1 can swallow finger 2 on Android WebView.
 */
export function ZoomableImage({ src, alt = '', className, onError }: ZoomableImageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const scaleRef = useRef(1);
  const xRef = useRef(0);
  const yRef = useRef(0);

  const pointersRef = useRef<Map<number, Pt>>(new Map());
  const pinchDist0Ref = useRef(0);
  const pinchScale0Ref = useRef(1);
  const panOriginRef = useRef<Pt | null>(null);
  const panX0Ref = useRef(0);
  const panY0Ref = useRef(0);
  const movedRef = useRef(false);
  const pinchedRef = useRef(false);
  const lastTapRef = useRef<{ pt: Pt; t: number } | null>(null);
  const capturedIdRef = useRef<number | null>(null);

  const paint = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    img.style.transform = `translate(${xRef.current}px, ${yRef.current}px) scale(${scaleRef.current})`;
  }, []);

  const clamp = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const s = scaleRef.current;
    if (s <= 1.02) {
      xRef.current = 0;
      yRef.current = 0;
      return;
    }
    const maxX = (stage.clientWidth * (s - 1)) / 2;
    const maxY = (stage.clientHeight * (s - 1)) / 2;
    xRef.current = Math.min(maxX, Math.max(-maxX, xRef.current));
    yRef.current = Math.min(maxY, Math.max(-maxY, yRef.current));
  }, []);

  const setScaleAt = useCallback(
    (next: number, focalClient: Pt) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const ox = rect.width / 2;
      const oy = rect.height / 2;
      const fx = focalClient.x - rect.left;
      const fy = focalClient.y - rect.top;
      const prev = scaleRef.current;
      if (prev <= 0) return;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next));
      const ratio = scale / prev;
      xRef.current = fx - ox - (fx - ox - xRef.current) * ratio;
      yRef.current = fy - oy - (fy - oy - yRef.current) * ratio;
      scaleRef.current = scale;
      clamp();
      paint();
    },
    [clamp, paint],
  );

  const reset = useCallback(() => {
    scaleRef.current = 1;
    xRef.current = 0;
    yRef.current = 0;
    paint();
  }, [paint]);

  const toggleAt = useCallback(
    (focal: Pt) => {
      if (scaleRef.current > 1.05) reset();
      else setScaleAt(DOUBLE_TAP_SCALE, focal);
    },
    [reset, setScaleAt],
  );

  const releaseCapture = useCallback((stage: HTMLDivElement) => {
    const id = capturedIdRef.current;
    if (id == null) return;
    try {
      if (stage.hasPointerCapture(id)) stage.releasePointerCapture(id);
    } catch {
      /* ignore */
    }
    capturedIdRef.current = null;
  }, []);

  useEffect(() => {
    reset();
    pointersRef.current.clear();
    lastTapRef.current = null;
    pinchedRef.current = false;
    movedRef.current = false;
    capturedIdRef.current = null;
  }, [src, reset]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.cancelable) e.preventDefault();

      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointersRef.current.values()];

      if (pts.length >= 2) {
        // Pinch mode: release any one-finger capture so both fingers stream freely.
        releaseCapture(stage);
        pinchedRef.current = true;
        movedRef.current = true;
        lastTapRef.current = null;
        panOriginRef.current = null;
        pinchDist0Ref.current = dist(pts[0], pts[1]);
        pinchScale0Ref.current = scaleRef.current;
        return;
      }

      // Single finger: capture only while panning/tapping (not during pinch).
      try {
        stage.setPointerCapture(e.pointerId);
        capturedIdRef.current = e.pointerId;
      } catch {
        capturedIdRef.current = null;
      }

      movedRef.current = false;
      panOriginRef.current = { x: e.clientX, y: e.clientY };
      panX0Ref.current = xRef.current;
      panY0Ref.current = yRef.current;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      if (e.cancelable) e.preventDefault();
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const pts = [...pointersRef.current.values()];
      if (pts.length >= 2) {
        pinchedRef.current = true;
        movedRef.current = true;
        const d = dist(pts[0], pts[1]);
        if (pinchDist0Ref.current > 0) {
          setScaleAt(pinchScale0Ref.current * (d / pinchDist0Ref.current), mid(pts[0], pts[1]));
        }
        return;
      }

      if (pts.length === 1 && panOriginRef.current) {
        const cur = pts[0];
        const dx = cur.x - panOriginRef.current.x;
        const dy = cur.y - panOriginRef.current.y;
        if (scaleRef.current > 1.02) {
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true;
          xRef.current = panX0Ref.current + dx;
          yRef.current = panY0Ref.current + dy;
          clamp();
          paint();
        } else if (Math.abs(dx) > TAP_MOVE_PX || Math.abs(dy) > TAP_MOVE_PX) {
          movedRef.current = true;
        }
      }
    };

    const finishPointer = (e: PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      if (e.cancelable) e.preventDefault();

      const ended = pointersRef.current.get(e.pointerId)!;
      pointersRef.current.delete(e.pointerId);

      if (capturedIdRef.current === e.pointerId) {
        releaseCapture(stage);
      }

      const remaining = [...pointersRef.current.values()];
      if (remaining.length >= 2) {
        pinchDist0Ref.current = dist(remaining[0], remaining[1]);
        pinchScale0Ref.current = scaleRef.current;
        panOriginRef.current = null;
        return;
      }

      if (remaining.length === 1) {
        panOriginRef.current = remaining[0];
        panX0Ref.current = xRef.current;
        panY0Ref.current = yRef.current;
        pinchDist0Ref.current = 0;
        return;
      }

      pinchDist0Ref.current = 0;
      panOriginRef.current = null;

      if (pinchedRef.current) {
        pinchedRef.current = false;
        lastTapRef.current = null;
        if (scaleRef.current < 1.05) reset();
        return;
      }

      if (movedRef.current) {
        lastTapRef.current = null;
        return;
      }

      const now = Date.now();
      const last = lastTapRef.current;
      if (
        last &&
        now - last.t <= DOUBLE_TAP_MS &&
        Math.abs(ended.x - last.pt.x) <= TAP_MOVE_PX * 2 &&
        Math.abs(ended.y - last.pt.y) <= TAP_MOVE_PX * 2
      ) {
        lastTapRef.current = null;
        toggleAt(ended);
        return;
      }
      lastTapRef.current = { pt: ended, t: now };
    };

    const onLostCapture = (e: PointerEvent) => {
      // Intentional release for pinch must NOT treat this as finger-up.
      if (capturedIdRef.current === e.pointerId) {
        capturedIdRef.current = null;
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setScaleAt(scaleRef.current * factor, { x: e.clientX, y: e.clientY });
      if (scaleRef.current <= 1.02) reset();
    };

    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      toggleAt({ x: e.clientX, y: e.clientY });
    };

    const opts: AddEventListenerOptions = { passive: false };
    stage.addEventListener('pointerdown', onPointerDown, opts);
    stage.addEventListener('pointermove', onPointerMove, opts);
    stage.addEventListener('pointerup', finishPointer, opts);
    stage.addEventListener('pointercancel', finishPointer, opts);
    stage.addEventListener('lostpointercapture', onLostCapture);
    stage.addEventListener('wheel', onWheel, opts);
    stage.addEventListener('dblclick', onDblClick);

    return () => {
      releaseCapture(stage);
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('pointermove', onPointerMove);
      stage.removeEventListener('pointerup', finishPointer);
      stage.removeEventListener('pointercancel', finishPointer);
      stage.removeEventListener('lostpointercapture', onLostCapture);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('dblclick', onDblClick);
    };
  }, [clamp, paint, releaseCapture, reset, setScaleAt, src, toggleAt]);

  return (
    <div
      ref={stageRef}
      className="relative h-full w-full min-h-0 min-w-0 overflow-hidden"
      style={{
        touchAction: 'none',
        overscrollBehavior: 'none',
        pointerEvents: 'auto',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
      }}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        draggable={false}
        className={className ?? 'select-none'}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          transform: 'translate(0px, 0px) scale(1)',
          transformOrigin: 'center center',
          willChange: 'transform',
          pointerEvents: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
        onError={onError}
      />
    </div>
  );
}

export default ZoomableImage;
