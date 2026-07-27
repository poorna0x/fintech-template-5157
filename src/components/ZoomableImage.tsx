import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  TransformWrapper,
  TransformComponent,
  type ReactZoomPanPinchContentRef,
  type ReactZoomPanPinchRef,
} from 'react-zoom-pan-pinch';

interface ZoomableImageProps {
  src: string;
  alt?: string;
  className?: string;
  onError?: (e: React.SyntheticEvent<HTMLImageElement>) => void;
}

/** Wider than the library’s hardcoded 200ms — easier to hit on phones. */
const DOUBLE_TAP_MS = 380;
const TAP_MOVE_PX = 14;
const ZOOM_SCALE = 2.5;

type TapPoint = { x: number; y: number; t: number };

/**
 * Pinch / double-tap / wheel zoom for photo viewers.
 * Custom double-tap (library window is a hard-coded 200ms).
 * Panning disabled at 1× so the first tap isn’t eaten by a tiny drag.
 */
export function ZoomableImage({ src, alt = '', className, onError }: ZoomableImageProps) {
  const apiRef = useRef<ReactZoomPanPinchContentRef | null>(null);
  const [scale, setScale] = useState(1);
  const lastTapRef = useRef<TapPoint | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const multiTouchRef = useRef(false);

  useEffect(() => {
    setScale(1);
    lastTapRef.current = null;
    touchStartRef.current = null;
    multiTouchRef.current = false;
  }, [src]);

  const handleInit = useCallback((ref: ReactZoomPanPinchRef) => {
    apiRef.current = ref;
    // Wait for layout + image decode so center isn't computed against 0×0 on iOS
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          ref.centerView(1, 0);
          setScale(1);
        } catch {
          /* ignore if unmounted */
        }
      });
    });
  }, []);

  const zoomToggleAt = useCallback((clientX: number, clientY: number) => {
    const ref = apiRef.current;
    if (!ref) return;

    if (ref.state.scale > 1.05) {
      ref.resetTransform(200, 'easeOut');
      return;
    }

    const wrapper = ref.instance.wrapperComponent;
    if (!wrapper) {
      ref.centerView(ZOOM_SCALE, 200, 'easeOut');
      return;
    }

    const rect = wrapper.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const { scale: currentScale, positionX, positionY } = ref.state;
    const newPosX = x - ((x - positionX) / currentScale) * ZOOM_SCALE;
    const newPosY = y - ((y - positionY) / currentScale) * ZOOM_SCALE;
    ref.setTransform(newPosX, newPosY, ZOOM_SCALE, 200, 'easeOut');
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      multiTouchRef.current = true;
      touchStartRef.current = null;
      lastTapRef.current = null;
      return;
    }
    multiTouchRef.current = false;
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (multiTouchRef.current || e.touches.length > 0) {
        multiTouchRef.current = e.touches.length > 1;
        return;
      }

      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;

      const touch = e.changedTouches[0];
      if (!touch) return;

      const dx = Math.abs(touch.clientX - start.x);
      const dy = Math.abs(touch.clientY - start.y);
      if (dx > TAP_MOVE_PX || dy > TAP_MOVE_PX) {
        lastTapRef.current = null;
        return;
      }

      const now = Date.now();
      const last = lastTapRef.current;
      if (
        last &&
        now - last.t <= DOUBLE_TAP_MS &&
        Math.abs(touch.clientX - last.x) <= TAP_MOVE_PX * 2 &&
        Math.abs(touch.clientY - last.y) <= TAP_MOVE_PX * 2
      ) {
        lastTapRef.current = null;
        e.preventDefault();
        zoomToggleAt(touch.clientX, touch.clientY);
        return;
      }

      lastTapRef.current = { x: touch.clientX, y: touch.clientY, t: now };
    },
    [zoomToggleAt],
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      zoomToggleAt(e.clientX, e.clientY);
    },
    [zoomToggleAt],
  );

  return (
    <div
      className="h-full w-full min-h-0 min-w-0"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={handleDoubleClick}
    >
      <TransformWrapper
        key={src}
        initialScale={1}
        minScale={1}
        maxScale={5}
        centerOnInit={false}
        onInit={handleInit}
        onTransform={(_ref, state) => setScale(state.scale)}
        doubleClick={{ disabled: true }}
        wheel={{ step: 0.12 }}
        pinch={{ step: 8 }}
        panning={{ disabled: scale <= 1.05, velocityDisabled: true }}
        limitToBounds
        disablePadding
        autoAlignment={{ disabled: true }}
        velocityAnimation={{ disabled: true }}
      >
        <TransformComponent
          wrapperClass="!h-full !w-full !max-h-full !max-w-full overflow-hidden"
          contentClass="!flex !h-full !w-full !max-h-full !max-w-full items-center justify-center"
          wrapperStyle={{
            width: '100%',
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
            cursor: scale > 1.05 ? 'grab' : 'default',
            touchAction: 'none',
          }}
          contentStyle={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            className={className ?? 'max-h-full max-w-full select-none object-contain'}
            onError={onError}
          />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

export default ZoomableImage;
