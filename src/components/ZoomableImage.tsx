import React, { useCallback, useEffect, useRef } from 'react';

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_MS = 400;
const TAP_MOVE_PX = 18;
const DOUBLE_TAP_SCALE = 2.5;

type Point = { x: number; y: number };

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function touchPoint(t: Touch): Point {
  return { x: t.clientX, y: t.clientY };
}

/**
 * Photo zoom owned by native touch listeners (no react-zoom-pan-pinch).
 * Capacitor Android WebView: touch-action:none + non-passive preventDefault
 * so pinch / double-tap / pan always work.
 */
export function ZoomableImage({ src, alt = '', className, onError }: ZoomableImageProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const scaleRef = useRef(1);
  const xRef = useRef(0);
  const yRef = useRef(0);

  const pointersRef = useRef<Map<number, Point>>(new Map());
  const pinchStartDistRef = useRef(0);
  const pinchStartScaleRef = useRef(1);
  const panOriginRef = useRef<Point | null>(null);
  const panStartXRef = useRef(0);
  const panStartYRef = useRef(0);
  const movedRef = useRef(false);
  const pinchedRef = useRef(false);
  const lastTapRef = useRef<{ point: Point; t: number } | null>(null);

  const applyTransform = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    img.style.transform = `translate(${xRef.current}px, ${yRef.current}px) scale(${scaleRef.current})`;
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.style.cursor = scaleRef.current > 1.02 ? 'grab' : 'default';
    }
  }, []);

  const clampTranslation = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const scale = scaleRef.current;
    if (scale <= 1.02) {
      xRef.current = 0;
      yRef.current = 0;
      return;
    }

    // Image box fills the viewport (object-fit: contain); overflow grows with scale.
    const maxX = (viewport.clientWidth * (scale - 1)) / 2;
    const maxY = (viewport.clientHeight * (scale - 1)) / 2;
    xRef.current = Math.min(maxX, Math.max(-maxX, xRef.current));
    yRef.current = Math.min(maxY, Math.max(-maxY, yRef.current));
  }, []);

  const setScaleAt = useCallback(
    (nextScale: number, focalClient: Point) => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const rect = viewport.getBoundingClientRect();
      const ox = rect.width / 2;
      const oy = rect.height / 2;
      const fx = focalClient.x - rect.left;
      const fy = focalClient.y - rect.top;

      const prev = scaleRef.current;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
      if (prev <= 0) return;

      // Keep the focal point fixed under the finger while scaling (origin: center).
      const ratio = scale / prev;
      xRef.current = fx - ox - (fx - ox - xRef.current) * ratio;
      yRef.current = fy - oy - (fy - oy - yRef.current) * ratio;
      scaleRef.current = scale;
      clampTranslation();
      applyTransform();
    },
    [applyTransform, clampTranslation],
  );

  const resetView = useCallback(() => {
    scaleRef.current = 1;
    xRef.current = 0;
    yRef.current = 0;
    applyTransform();
  }, [applyTransform]);

  const toggleZoomAt = useCallback(
    (focal: Point) => {
      if (scaleRef.current > 1.05) {
        resetView();
        return;
      }
      setScaleAt(DOUBLE_TAP_SCALE, focal);
    },
    [resetView, setScaleAt],
  );

  useEffect(() => {
    resetView();
    pointersRef.current.clear();
    lastTapRef.current = null;
    pinchedRef.current = false;
  }, [src, resetView]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onTouchStart = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        pointersRef.current.set(t.identifier, touchPoint(t));
      }

      const pts = [...pointersRef.current.values()];
      if (pts.length >= 2) {
        pinchedRef.current = true;
        movedRef.current = true;
        lastTapRef.current = null;
        panOriginRef.current = null;
        pinchStartDistRef.current = distance(pts[0], pts[1]);
        pinchStartScaleRef.current = scaleRef.current;
        return;
      }

      if (pts.length === 1) {
        movedRef.current = false;
        panOriginRef.current = pts[0];
        panStartXRef.current = xRef.current;
        panStartYRef.current = yRef.current;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();

      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (pointersRef.current.has(t.identifier)) {
          pointersRef.current.set(t.identifier, touchPoint(t));
        }
      }

      const pts = [...pointersRef.current.values()];
      if (pts.length >= 2) {
        pinchedRef.current = true;
        movedRef.current = true;
        const dist = distance(pts[0], pts[1]);
        if (pinchStartDistRef.current > 0) {
          const next = pinchStartScaleRef.current * (dist / pinchStartDistRef.current);
          setScaleAt(next, midpoint(pts[0], pts[1]));
        }
        return;
      }

      if (pts.length === 1 && panOriginRef.current) {
        const cur = pts[0];
        const dx = cur.x - panOriginRef.current.x;
        const dy = cur.y - panOriginRef.current.y;

        if (scaleRef.current > 1.02) {
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true;
          xRef.current = panStartXRef.current + dx;
          yRef.current = panStartYRef.current + dy;
          clampTranslation();
          applyTransform();
        } else if (Math.abs(dx) > TAP_MOVE_PX || Math.abs(dy) > TAP_MOVE_PX) {
          movedRef.current = true;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault();

      const ended: Point[] = [];
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        const prev = pointersRef.current.get(t.identifier);
        ended.push(prev ?? touchPoint(t));
        pointersRef.current.delete(t.identifier);
      }

      const remaining = [...pointersRef.current.values()];
      if (remaining.length >= 2) {
        pinchStartDistRef.current = distance(remaining[0], remaining[1]);
        pinchStartScaleRef.current = scaleRef.current;
        panOriginRef.current = null;
        return;
      }

      if (remaining.length === 1) {
        panOriginRef.current = remaining[0];
        panStartXRef.current = xRef.current;
        panStartYRef.current = yRef.current;
        pinchStartDistRef.current = 0;
        return;
      }

      pinchStartDistRef.current = 0;
      panOriginRef.current = null;

      if (pinchedRef.current) {
        pinchedRef.current = false;
        lastTapRef.current = null;
        if (scaleRef.current < 1.05) resetView();
        return;
      }

      if (movedRef.current || ended.length === 0) {
        lastTapRef.current = null;
        return;
      }

      const point = ended[0];
      const now = Date.now();
      const last = lastTapRef.current;
      if (
        last &&
        now - last.t <= DOUBLE_TAP_MS &&
        Math.abs(point.x - last.point.x) <= TAP_MOVE_PX * 2 &&
        Math.abs(point.y - last.point.y) <= TAP_MOVE_PX * 2
      ) {
        lastTapRef.current = null;
        toggleZoomAt(point);
        return;
      }

      lastTapRef.current = { point, t: now };
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.12 : 0.12;
      setScaleAt(scaleRef.current * (1 + delta), { x: e.clientX, y: e.clientY });
      if (scaleRef.current <= 1.02) resetView();
    };

    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      toggleZoomAt({ x: e.clientX, y: e.clientY });
    };

    const opts: AddEventListenerOptions = { passive: false };
    viewport.addEventListener('touchstart', onTouchStart, opts);
    viewport.addEventListener('touchmove', onTouchMove, opts);
    viewport.addEventListener('touchend', onTouchEnd, opts);
    viewport.addEventListener('touchcancel', onTouchEnd, opts);
    viewport.addEventListener('wheel', onWheel, opts);
    viewport.addEventListener('dblclick', onDblClick);

    return () => {
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('touchmove', onTouchMove);
      viewport.removeEventListener('touchend', onTouchEnd);
      viewport.removeEventListener('touchcancel', onTouchEnd);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('dblclick', onDblClick);
    };
  }, [applyTransform, clampTranslation, resetView, setScaleAt, src, toggleZoomAt]);

  return (
    <div
      ref={viewportRef}
      className="relative h-full w-full min-h-0 min-w-0 overflow-hidden"
      style={{
        touchAction: 'none',
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
        className={className ?? 'select-none object-contain'}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          transform: 'translate(0px, 0px) scale(1)',
          transformOrigin: 'center center',
          willChange: 'transform',
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          WebkitTouchCallout: 'none',
          // Touches hit the viewport; image must not capture/steal them.
          pointerEvents: 'none',
        }}
        onError={onError}
      />
    </div>
  );
}

export default ZoomableImage;
