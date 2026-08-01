import React, { useEffect, useRef } from 'react';

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

const MIN = 1;
const MAX = 4;
const DOUBLE_MS = 400;
const DOUBLE_SCALE = 2.5;
const TAP_SLOP = 12;

type Pt = { x: number; y: number };

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mid(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Mobile photo zoom (APK WebView + PWA).
 *
 * Requires PhotoViewer to unlock the viewport (user-scalable) while open —
 * with maximum-scale=1 Android often never delivers pinch to JS.
 *
 * Uses TouchEvents only for fingers (Pointer touch is ignored to avoid
 * double-firing). Mouse uses pointer/mouse for desktop.
 */
export function ZoomableImage({ src, alt = '', className, onError }: ZoomableImageProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const scale = useRef(1);
  const tx = useRef(0);
  const ty = useRef(0);

  const fingers = useRef<Map<number, Pt>>(new Map());
  const pinch0 = useRef(0);
  const pinchScale0 = useRef(1);
  const pan0 = useRef<Pt | null>(null);
  const panTx0 = useRef(0);
  const panTy0 = useRef(0);
  const moved = useRef(false);
  const pinched = useRef(false);
  const lastTap = useRef<{ pt: Pt; t: number } | null>(null);
  const tracking = useRef(false);

  useEffect(() => {
    scale.current = 1;
    tx.current = 0;
    ty.current = 0;
    fingers.current.clear();
    lastTap.current = null;
    pinched.current = false;
    moved.current = false;
    tracking.current = false;
    const img = imgRef.current;
    if (img) img.style.transform = 'translate3d(0px,0px,0) scale(1)';
  }, [src]);

  useEffect(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img) return;

    const paint = () => {
      img.style.transform = `translate3d(${tx.current}px,${ty.current}px,0) scale(${scale.current})`;
    };

    const clamp = () => {
      const s = scale.current;
      if (s <= 1.02) {
        tx.current = 0;
        ty.current = 0;
        return;
      }
      const maxX = (stage.clientWidth * (s - 1)) / 2;
      const maxY = (stage.clientHeight * (s - 1)) / 2;
      tx.current = Math.min(maxX, Math.max(-maxX, tx.current));
      ty.current = Math.min(maxY, Math.max(-maxY, ty.current));
    };

    const setScaleAt = (next: number, focal: Pt) => {
      const rect = stage.getBoundingClientRect();
      const ox = rect.width / 2;
      const oy = rect.height / 2;
      const fx = focal.x - rect.left;
      const fy = focal.y - rect.top;
      const prev = scale.current;
      if (prev <= 0) return;
      const s = Math.min(MAX, Math.max(MIN, next));
      const ratio = s / prev;
      tx.current = fx - ox - (fx - ox - tx.current) * ratio;
      ty.current = fy - oy - (fy - oy - ty.current) * ratio;
      scale.current = s;
      clamp();
      paint();
    };

    const reset = () => {
      scale.current = 1;
      tx.current = 0;
      ty.current = 0;
      paint();
    };

    const toggleAt = (focal: Pt) => {
      if (scale.current > 1.05) reset();
      else setScaleAt(DOUBLE_SCALE, focal);
    };

    const readTouches = (list: TouchList) => {
      fingers.current.clear();
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        fingers.current.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
    };

    const armGesture = () => {
      const pts = [...fingers.current.values()];
      if (pts.length >= 2) {
        pinched.current = true;
        moved.current = true;
        lastTap.current = null;
        pan0.current = null;
        pinch0.current = dist(pts[0], pts[1]);
        pinchScale0.current = scale.current;
        return;
      }
      if (pts.length === 1) {
        moved.current = false;
        pan0.current = pts[0];
        panTx0.current = tx.current;
        panTy0.current = ty.current;
        pinch0.current = 0;
      }
    };

    const moveGesture = () => {
      const pts = [...fingers.current.values()];
      if (pts.length >= 2) {
        pinched.current = true;
        moved.current = true;
        const d = dist(pts[0], pts[1]);
        if (pinch0.current > 0) {
          setScaleAt(pinchScale0.current * (d / pinch0.current), mid(pts[0], pts[1]));
        }
        return;
      }
      if (pts.length === 1 && pan0.current && scale.current > 1.02) {
        const cur = pts[0];
        const dx = cur.x - pan0.current.x;
        const dy = cur.y - pan0.current.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved.current = true;
        tx.current = panTx0.current + dx;
        ty.current = panTy0.current + dy;
        clamp();
        paint();
      } else if (pts.length === 1 && pan0.current) {
        const cur = pts[0];
        if (
          Math.abs(cur.x - pan0.current.x) > TAP_SLOP ||
          Math.abs(cur.y - pan0.current.y) > TAP_SLOP
        ) {
          moved.current = true;
        }
      }
    };

    const finishGesture = (ended: Pt | null) => {
      const pts = [...fingers.current.values()];
      if (pts.length >= 2) {
        pinch0.current = dist(pts[0], pts[1]);
        pinchScale0.current = scale.current;
        pan0.current = null;
        return;
      }
      if (pts.length === 1) {
        pan0.current = pts[0];
        panTx0.current = tx.current;
        panTy0.current = ty.current;
        pinch0.current = 0;
        return;
      }

      tracking.current = false;
      pinch0.current = 0;
      pan0.current = null;

      if (pinched.current) {
        pinched.current = false;
        lastTap.current = null;
        if (scale.current < 1.05) reset();
        return;
      }

      if (moved.current || !ended) {
        lastTap.current = null;
        return;
      }

      const now = Date.now();
      const prev = lastTap.current;
      if (
        prev &&
        now - prev.t <= DOUBLE_MS &&
        Math.abs(ended.x - prev.pt.x) <= TAP_SLOP * 2 &&
        Math.abs(ended.y - prev.pt.y) <= TAP_SLOP * 2
      ) {
        lastTap.current = null;
        toggleAt(ended);
        return;
      }
      lastTap.current = { pt: ended, t: now };
    };

    const onTouchStart = (e: TouchEvent) => {
      tracking.current = true;
      readTouches(e.touches);
      armGesture();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking.current) return;
      // Block page zoom / scroll while we own the gesture (viewport is unlocked in viewer).
      if (e.cancelable) e.preventDefault();
      readTouches(e.touches);
      moveGesture();
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking.current && e.touches.length === 0 && fingers.current.size === 0) return;
      const t = e.changedTouches[0];
      const ended = t ? { x: t.clientX, y: t.clientY } : null;
      readTouches(e.touches);
      finishGesture(ended);
    };

    // Desktop: mouse drag-pan when zoomed + wheel + double-click
    let mouseDown: Pt | null = null;
    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      mouseDown = { x: e.clientX, y: e.clientY };
      moved.current = false;
      pan0.current = mouseDown;
      panTx0.current = tx.current;
      panTy0.current = ty.current;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDown || !pan0.current) return;
      if (scale.current <= 1.02) return;
      const dx = e.clientX - pan0.current.x;
      const dy = e.clientY - pan0.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved.current = true;
      tx.current = panTx0.current + dx;
      ty.current = panTy0.current + dy;
      clamp();
      paint();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (!mouseDown) return;
      const ended = { x: e.clientX, y: e.clientY };
      const wasMoved = moved.current;
      mouseDown = null;
      pan0.current = null;
      if (wasMoved) {
        lastTap.current = null;
        return;
      }
      const now = Date.now();
      const prev = lastTap.current;
      if (
        prev &&
        now - prev.t <= DOUBLE_MS &&
        Math.abs(ended.x - prev.pt.x) <= TAP_SLOP * 2 &&
        Math.abs(ended.y - prev.pt.y) <= TAP_SLOP * 2
      ) {
        lastTap.current = null;
        toggleAt(ended);
        return;
      }
      lastTap.current = { pt: ended, t: now };
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScaleAt(scale.current * (e.deltaY > 0 ? 0.9 : 1.1), { x: e.clientX, y: e.clientY });
      if (scale.current <= 1.02) reset();
    };
    const onDblClick = (e: MouseEvent) => {
      e.preventDefault();
      toggleAt({ x: e.clientX, y: e.clientY });
    };

    const opts: AddEventListenerOptions = { passive: false };
    stage.addEventListener('touchstart', onTouchStart, opts);
    stage.addEventListener('touchmove', onTouchMove, opts);
    stage.addEventListener('touchend', onTouchEnd, opts);
    stage.addEventListener('touchcancel', onTouchEnd, opts);
    stage.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    stage.addEventListener('wheel', onWheel, opts);
    stage.addEventListener('dblclick', onDblClick);

    return () => {
      stage.removeEventListener('touchstart', onTouchStart);
      stage.removeEventListener('touchmove', onTouchMove);
      stage.removeEventListener('touchend', onTouchEnd);
      stage.removeEventListener('touchcancel', onTouchEnd);
      stage.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      stage.removeEventListener('wheel', onWheel);
      stage.removeEventListener('dblclick', onDblClick);
    };
  }, [src]);

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
          transform: 'translate3d(0px,0px,0) scale(1)',
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
