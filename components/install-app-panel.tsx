"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, Laptop, Share, Smartphone } from "lucide-react";
import type { InstallPromptEvent } from "@/components/pwa-registration";

type InstallPlatform = "ios" | "android" | "mac" | "desktop";

function detectPlatform(): InstallPlatform {
  if (typeof navigator === "undefined") return "desktop";
  const userAgent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "mac";
  return "desktop";
}

export function InstallAppPanel() {
  const [prompt, setPrompt] = useState<InstallPromptEvent>();
  const [installed, setInstalled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const [platform] = useState<InstallPlatform>(() => detectPlatform());

  useEffect(() => {
    const updatePrompt = () => setPrompt(window.__tripInstallPrompt);
    const markInstalled = () => { setInstalled(true); setPrompt(undefined); setShowSteps(false); };
    const updateStatus = (event: Event) => setInstalled(Boolean((event as CustomEvent<{ installed: boolean }>).detail.installed));
    window.addEventListener("trip-install-available", updatePrompt);
    window.addEventListener("trip-app-installed", markInstalled);
    window.addEventListener("trip-app-status", updateStatus);
    window.dispatchEvent(new Event("trip-install-query"));
    window.dispatchEvent(new Event("trip-status-query"));
    return () => {
      window.removeEventListener("trip-install-available", updatePrompt);
      window.removeEventListener("trip-app-installed", markInstalled);
      window.removeEventListener("trip-app-status", updateStatus);
    };
  }, []);

  const install = async () => {
    // Read the global too: the install event can arrive between render and click.
    const availablePrompt = prompt ?? window.__tripInstallPrompt;
    if (!availablePrompt) {
      setShowSteps((value) => !value);
      return;
    }
    try {
      await availablePrompt.prompt();
      const choice = await availablePrompt.userChoice;
      setPrompt(undefined);
      if (choice.outcome === "accepted") setInstalled(true);
      else setShowSteps(true);
    } catch {
      setShowSteps(true);
    }
  };

  return <section className="panel pwa-install-panel">
    <div className="pwa-install-icon"><Smartphone size={21} /></div>
    <div className="pwa-install-copy">
      <p className="eyebrow">KEEP THE TRIP CLOSE</p>
      <h2>{installed ? "เพิ่มแอปไว้บนหน้าจอแล้ว" : "เพิ่มแอปไว้บนหน้าจอ"}</h2>
      <p>{installed ? "เปิดแอปทริปจากหน้าจอหลักได้เลย" : "ติดตั้งไว้เปิดใช้งานได้สะดวก เหมือนแอปในมือถือหรือคอมพิวเตอร์"}</p>
    </div>
    {installed ? <span className="pwa-installed"><CheckCircle2 size={16} /> ติดตั้งแล้ว</span> :
      <button className="button button-primary pwa-install-button" onClick={() => void install()} aria-expanded={showSteps}>
        {prompt ? <Download size={16} /> : platform === "desktop" || platform === "mac" ? <Laptop size={16} /> : <Smartphone size={16} />}
        {prompt ? "ติดตั้งแอป" : "ติดตั้ง / ดูวิธี"}
      </button>}
    {showSteps && !installed && <div className="pwa-install-steps">
      {platform === "ios" ? <><b><Share size={15} /> เพิ่มบน iPhone / iPad</b><ol><li>เปิดเว็บไซต์นี้ด้วย Safari</li><li>แตะปุ่มแชร์ <Share size={13} /> ที่แถบด้านล่าง</li><li>เลือก “เพิ่มไปยังหน้าจอโฮม” แล้วแตะ “เพิ่ม”</li></ol></> :
        platform === "android" ? <><b><Smartphone size={15} /> เพิ่มบน Android</b><ol><li>ใช้ Chrome แล้วแตะ “ติดตั้งแอป” บนปุ่มนี้ หากมีหน้าต่างติดตั้งให้ยืนยัน</li><li>ถ้าไม่มีหน้าต่าง ให้แตะเมนู ⋮ มุมขวาบน</li><li>เลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”</li></ol></> :
          platform === "mac" ? <><b><Laptop size={15} /> เพิ่มบน Mac</b><ol><li>แนะนำให้เปิดเว็บไซต์นี้ด้วย Chrome หรือ Microsoft Edge แล้วกดปุ่มติดตั้ง</li><li>หากใช้ Safari ให้เลือกเมนู File &gt; Add to Dock</li></ol></> :
            <><b><Laptop size={15} /> เพิ่มบนคอมพิวเตอร์</b><ol><li>เปิดเว็บไซต์นี้ด้วย Google Chrome หรือ Microsoft Edge</li><li>กดปุ่มติดตั้งนี้เพื่อเปิดหน้าต่างยืนยันการติดตั้ง</li><li>หากไม่มีหน้าต่าง ให้คลิกไอคอนติดตั้งที่แถบที่อยู่ หรือเปิดเมนู ⋮ &gt; “ติดตั้งแอป”</li></ol></>}
    </div>}
  </section>;
}
