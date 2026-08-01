import React, { useCallback, useEffect, useRef } from 'react';

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 320;
const TAP_SLOP_PX = 16;
const DOUBLE_TAP_SCALE = 2.5;

type Pt = { x: number; y: number };

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Capacitor WebView + mobile PWA photo zoom.
 * - No react-zoom-pan-pinch (unreliable in APK WebViews)
 * - No +/- controls
 * - Never preventDefault on touch/pointer *start* (Android cancels the gesture)
 * - Window-level move/up so nested dialogs / RemoveScroll can't swallow the stream
 */
export function ZoomableImage({ src, alt = '', className, onError }: ZoomableImageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);

  const scaleRef = useRef(1);
  const xRef = useRef(0);
  const yRef = useRef(0);

  const pointsRef = useRef<Map<number, Pt>>(new Map());
  const pinchDist0Ref = useRef(0);
  const pinchScale0Ref = useRef(1);
  const panOriginRef = useRef<Pt | null>(null);
  const panX0Ref = useRef(0);
  const panY0Ref = useRef(0);
  const movedRef = useRef(false);
  const pinchedRef = useRef(false);
  const lastTapRef = useRef<{ pt: Pt; t: number } | null>(null);
  const activeRef = useRef(false);

  const paint = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.style.transform = `translate3d(${xRef.current}px, ${yRef.current}px, 0) scale(${scaleRef.current})`;
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
    (next: number, focal: Pt) => {
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const ox = rect.width / 2;
      const oy = rect.height / 2;
      const fx = focal.x - rect.left;
      const fy = focal.y - rect.top;
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

  useEffect(() => {
    reset();
    pointsRef.current.clear();
    lastTapRef.current = null;
    pinchedRef.current = false;
    movedRef.current = false;
    activeRef.current = false;
  }, [src, reset]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const syncFromTouches = (touches: TouchList) => {
      pointsRef.current.clear();
      for (let i = 0; i < touches.length; i++) {
        const t = touches[i];
        pointsRef.current.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    };

    const beginPinchOrPan = () => {
      const pts = [...pointsRef.current.values()];
      if (pts.length >= 2) {
        pinchedRef.current = true;
        movedRef.current = true;
        lastTapRef.current = null;
        panOriginRef.current = null;
        pinchDist0Ref.current = dist(pts[0], pts[1]);
        pinchScale0Ref.current = scaleRef.current;
        return;
      }
      if (pts.length === 1) {
        movedRef.current = false;
        panOriginRef.current = pts[0];
        panX0Ref.current = xRef.current;
        panY0Ref.current = yRef.current;
        pinchDist0Ref.current = 0;
      }
    };

    const applyMove = () => {
      const pts = [...pointsRef.current.values()];
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
        } else if (Math.abs(dx) > TAP_SLOP_PX || Math.abs(dy) > TAP_SLOP_PX) {
          movedRef.current = true;
        }
      }
    };

    const endGesture = (endedPt: Pt | null) => {
      const remaining = [...pointsRef.current.values()];
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

      activeRef.current = false;
      pinchDist0Ref.current = 0;
      panOriginRef.current = null;

      if (pinchedRef.current) {
        pinchedRef.current = false;
        lastTapRef.current = null;
        if (scaleRef.current < 1.05) reset();
        return;
      }

      if (movedRef.current || !endedPt) {
        lastTapRef.current = null;
        return;
      }

      const now = Date.now();
      const last = lastTapRef.current;
      if (
        last &&
        now - last.t <= DOUBLE_TAP_MS &&
        Math.abs(endedPt.x - last.pt.x) <= TAP_SLOP_PX * 2 &&
        Math.abs(endedPt.y - last.pt.y) <= TAP_SLOP_PX * 2
      ) {
        lastTapRef.current = null;
        toggleAt(endedPt);
        return;
      }
      lastTapRef.current = { pt: endedPt, t: now };
    };

    /* ---- Touch (primary on Android WebView / iOS) ---- */
    const onTouchStart = (e: TouchEvent) => {
      activeRef.current = true;
      syncFromTouches(e.touches);
      beginPinchOrPan();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!activeRef.current && e.touches.length === 0) return;
      activeRef.current = true;
      syncFromTouches(e.touches);
      // Only block browser scroll/zoom once we are actually zooming or pinching.
      if (e.cancelable && (pointsRef.current.size >= 2 || scaleRef.current > 1.02)) {
        e.preventDefault();
      }
      applyMove();
    };

    const onTouchEnd = (e: TouchEvent) => {
      let ended: Pt | null = null;
      if (e.changedTouches.length > 0) {
        const t = e.changedTouches[0];
        ended = { x: t.clientX, y: t.clientY };
      }
      syncFromTouches(e.touches);
      endGesture(ended);
    };

    /* ---- Pointer (desktop + some PWAs) ---- */
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      // Prefer touch handlers when the browser also fires TouchEvents (avoid double-counting).
      if (e.pointerType === 'touch') return;
      activeRef.current = true;
      pointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      beginPinchOrPan();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (!pointsRef.current.has(e.pointerId)) return;
      pointsRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (e.cancelable && (pointsRef.current.size >= 2 || scaleRef.current > 1.02)) {
        e.preventDefault();
      }
      applyMove();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (!pointsRef.current.has(e.pointerId)) return;
      const ended = pointsRef.current.get(e.pointerId) ?? { x: e.clientX, y: e.clientY };
      pointsRef.current.delete(e.pointerId);
      endGesture(ended);
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
    // Capture on stage so we win against overlays that are pointer-events:none parents.
    stage.addEventListener('touchstart', onTouchStart, opts);
    stage.addEventListener('pointerdown', onPointerDown, opts);
    stage.addEventListener('wheel', onWheel, opts);
    stage.addEventListener('dblclick', onDblClick);
    // Move/up on window so a finger sliding off the image / nested dialogs still update.
    window.addEventListener('touchmove', onTouchMove, opts);
    window.addEventListener('touchend', onTouchEnd, opts);
    window.addEventListener('touchcancel', onTouchEnd, opts);
    window.addEventListener('pointermove', onPointerMove, opts);
    window.addEventListener('pointerup', onPointerUp, opts);
    window.addEventListener('pointercancel', onPointerUp, opts);

    return () => {
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('pointerdown', onPointerDown);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [clamp, paint, reset, setScaleAt, src, toggleAt]);

  return (
    <div
      ref={stageRef}
      className="relative h-full w-full min-h-0 min-w-0 overflow-hidden"
      style={{
        touchAction: 'none',
        overscrollBehavior: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        WebkitTouchCallout: 'none',
        pointerEvents: 'auto',
      }}
    >
      <div
        ref={layerRef}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: 'translate3d(0px, 0px, 0) scale(1)',
          transformOrigin: 'center center',
          willChange: 'transform',
          pointerEvents: 'none',
        }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className={className ?? 'max-h-full max-w-full select-none object-contain'}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            objectFit: 'contain',
            WebkitUserSelect: 'none',
            userSelect: 'none',
            WebkitTouchCallout: 'none',
            pointerEvents: 'none',
          }}
          onError={onError}
        />
      </div>
    </div>
  );
}

export default ZoomableImage;
