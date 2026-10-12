"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import styles from "./trip-motion.module.css";

export function TripLoading() {
  const id = useId().replace(/:/g, "");
  return <main className={styles.loading} role="status" aria-live="polite" aria-busy="true">
    <div className={styles.loadingContent}>
      <div className={styles.scene} aria-hidden="true">
        <svg viewBox="0 0 340 260" className={styles.poolScene}>
          <defs>
            <linearGradient id={`${id}-water`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a5edfa" /><stop offset=".6" stopColor="#25b9df" /><stop offset="1" stopColor="#087dbd" /></linearGradient>
            <linearGradient id={`${id}-ring`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffbf68" /><stop offset="1" stopColor="#f57c27" /></linearGradient>
            <clipPath id={`${id}-clip`}><ellipse cx="170" cy="178" rx="142" ry="58" /></clipPath>
          </defs>
          <g className={styles.sun}><circle cx="260" cy="48" r="23" fill="#ffe5b8" /><circle cx="260" cy="48" r="14" fill="#ffb14b" /></g>
          <ellipse cx="170" cy="187" rx="145" ry="61" fill="#d4eef5" />
          <ellipse cx="170" cy="178" rx="149" ry="65" fill="white" />
          <ellipse cx="170" cy="178" rx="142" ry="58" fill={`url(#${id}-water)`} />
          <g clipPath={`url(#${id}-clip)`}>
            <g className={styles.waterWaves} fill="none" stroke="white" strokeWidth="2.5" opacity=".5">
              <path d="M-180 158q30-13 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0" />
              <path d="M-160 190q30-13 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0" />
              <path d="M-180 220q30-13 60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0t60 0" />
            </g>
            <ellipse className={styles.ringShadow} cx="165" cy="176" rx="55" ry="16" fill="#02669f" opacity=".18" />
            <ellipse className={styles.ripple} cx="166" cy="174" rx="69" ry="25" fill="none" stroke="white" strokeWidth="2" />
          </g>
          <g className={styles.floatRing}>
            <ellipse cx="166" cy="146" rx="46" ry="31" fill="none" stroke="#dc6a22" strokeWidth="23" />
            <ellipse cx="166" cy="140" rx="46" ry="31" fill="none" stroke={`url(#${id}-ring)`} strokeWidth="23" />
            <ellipse cx="166" cy="140" rx="46" ry="31" fill="none" stroke="#fff8ec" strokeWidth="23" strokeDasharray="25 36" pathLength="244" />
            <ellipse cx="166" cy="139" rx="58" ry="42" fill="none" stroke="#ffffff80" strokeWidth="1.5" />
          </g>
          <circle className={styles.dropOne} cx="92" cy="136" r="4" fill="#44bddd" />
          <circle className={styles.dropTwo} cx="237" cy="153" r="3" fill="#44bddd" />
        </svg>
        <span className={styles.sceneCaption}>CHIANG MAI · GOOD TIMES AHEAD</span>
      </div>
      <h1>ทริปพลูวิลล่าหรรษา</h1>
      <p>กำลังเตรียมพื้นที่ของเพื่อน ๆ<span className={styles.ellipsis} aria-hidden="true"><i>·</i><i>·</i><i>·</i></span></p>
      <span className={styles.loadingTrack} aria-hidden="true"><i /></span>
    </div>
  </main>;
}

export function MobileTripNav<T extends string>({ items, activeKey, onChange }: {
  items: { key: T; label: string; icon: LucideIcon }[];
  activeKey: T;
  onChange: (key: T) => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(360);
  const maskId = useId().replace(/:/g, "");
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(entry.contentRect.width);
    });
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);
  const index = Math.max(0, items.findIndex((item) => item.key === activeKey));
  const center = 24 + (width - 48) * (index + 0.5) / items.length;
  return <nav ref={navRef} className={styles.navigation} aria-label="เมนูมือถือ" style={{ "--active-center": `${center}px`, "--item-count": items.length } as CSSProperties}>
    <svg className={styles.navSurface} width="100%" height="76" aria-hidden="true">
      <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height="76">
        <rect width={width} height="76" rx="20" fill="white" />
        <path className={styles.notch} d="M-34 0 C-27 0 -27 33 0 33 C27 33 27 0 34 0 Z" fill="black" />
      </mask></defs>
      <rect width={width} height="76" fill="white" mask={`url(#${maskId})`} />
    </svg>
    <span className={styles.activeBubble} aria-hidden="true" />
    <div className={styles.navItems}>{items.map(({ key, label, icon: Icon }) => <button key={key} type="button" className={styles.navItem} aria-current={activeKey === key ? "page" : undefined} onClick={() => onChange(key)}>
      <span className={styles.navIcon}><Icon size={22} strokeWidth={1.8} /></span><span className={styles.navLabel}>{label}</span>
    </button>)}</div>
  </nav>;
}
