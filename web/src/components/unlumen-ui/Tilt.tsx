// Adapted from Unlumen UI's Tilt primitive, by Léo.
// Source and license: docs/ui-component-sources.md. Not for standalone redistribution.
import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { LazyMotion, m, useMotionTemplate, useMotionValue, useSpring, useTransform } from 'motion/react';
import { useReducedMotion } from '../../lib/useReducedMotion.ts';

// The animation features live in an async chunk. Loading starts with this module, so it is
// usually ready before cards mount; until it is, cards skip the entrance and render at opacity 1.
let featuresReady = false;
const featuresPromise = import('./motion-features.ts').then(r => { featuresReady = true; return r.domAnimation; });
featuresPromise.catch(() => {}); // Without features the cards stay static and visible.

export function Tilt({ children, className = '', rotationFactor = 4, entranceDelay = 0 }: { children: ReactNode; className?: string; rotationFactor?: number; entranceDelay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [entered, setEntered] = useState(false);
  const [delay, setDelay] = useState(0);
  // Decided once per mount: a card that was already shown never hides again for an entrance.
  const [canEnter] = useState(() => featuresReady && typeof IntersectionObserver !== 'undefined');
  const animateEntrance = !reduced && canEnter;
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const xSpring = useSpring(x, { stiffness: 260, damping: 28 });
  const ySpring = useSpring(y, { stiffness: 260, damping: 28 });
  const rotateX = useTransform(ySpring, [-0.5, 0.5], [-rotationFactor, rotationFactor]);
  const rotateY = useTransform(xSpring, [-0.5, 0.5], [rotationFactor, -rotationFactor]);
  const transform = useMotionTemplate`perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

  useEffect(() => {
    if (reduced) { x.jump(0); y.jump(0); xSpring.jump(0); ySpring.jump(0); }
  }, [reduced, x, y, xSpring, ySpring]);

  function reset() { x.set(0); y.set(0); }
  function move(e: PointerEvent<HTMLDivElement>) {
    if (reduced || e.pointerType !== 'mouse' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    // Measure the stationary outer wrapper, avoiding feedback from the rotating surface.
    const rect = ref.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    x.set(Math.max(-0.5, Math.min(0.5, (e.clientX - rect.left) / rect.width - 0.5)));
    y.set(Math.max(-0.5, Math.min(0.5, (e.clientY - rect.top) / rect.height - 0.5)));
  }

  return (
    <LazyMotion strict features={() => featuresPromise}>
    <m.div
      ref={ref}
      className={`tilt-frame ${className}`}
      initial={false}
      animate={animateEntrance && !entered ? { opacity: 0, y: 24, scale: 0.98 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: animateEntrance ? 0.48 : 0, delay: animateEntrance ? delay : 0, ease: [0.2, 0.7, 0.2, 1] }}
      onViewportEnter={animateEntrance ? () => { setDelay(entranceDelay); setEntered(true); } : undefined}
      viewport={animateEntrance ? { once: true, amount: 0.12 } : undefined}
      onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset}
      onFocusCapture={() => { setDelay(0); setEntered(true); reset(); }}
    >
      <m.div className="h-full" style={{ transform: reduced ? 'none' : transform }}>{children}</m.div>
    </m.div>
    </LazyMotion>
  );
}
