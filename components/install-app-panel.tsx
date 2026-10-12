"use client";

import { useEffect, useState } from "react";
import { Download, Smartphone, Share, PlusSquare, CheckCircle2 } from "lucide-react";
import type { InstallPromptEvent } from "@/components/pwa-registration";

export function InstallAppPanel() {
  const [prompt, setPrompt] = useState<InstallPromptEvent>();
  const [installed, setInstalled] = useState(false);
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    const updatePrompt = () => setPrompt(window.__tripInstallPrompt);
    const markInstalled = () => { setInstalled(true); setPrompt(undefined); };
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
    if (!prompt) {
      setShowSteps((value) => !value);
      return;
    }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    setPrompt(undefined);
    if (choice.outcome === "accepted") setInstalled(true);
  };

  const isApple = typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

  return <section className="panel pwa-install-panel">
    <div className="pwa-install-icon"><Smartphone size={21} /></div>
    <div className="pwa-install-copy">
      <p className="eyebrow">KEEP THE TRIP CLOSE</p>
      <h2>{installed ? "เพิ่มแอปไว้บนหน้าจอแล้ว" : "เพิ่มแอปไว้บนหน้าจอ"}</h2>
      <p>{installed ? "เปิดแอปทริปจากหน้าจอหลักได้เลย" : "เปิดแอปทริปได้สะดวก เหมือนแอปในมือถือ"}</p>
    </div>
    {installed ? <span className="pwa-installed"><CheckCircle2 size={16} /> ติดตั้งแล้ว</span> :
      <button className="button button-primary pwa-install-button" onClick={() => void install()} aria-expanded={showSteps}>
        {prompt ? <Download size={16} /> : <Smartphone size={16} />}
        {prompt ? "ติดตั้งแอป" : "วิธีเพิ่มแอป"}
      </button>}
    {showSteps && !installed && <div className="pwa-install-steps">
      {isApple ? <><b><Share size={15} /> เพิ่มบน iPhone / iPad</b><ol><li>เปิดเว็บไซต์นี้ด้วย Safari</li><li>แตะปุ่มแชร์ <Share size={13} /> ที่แถบด้านล่าง</li><li>เลือก “เพิ่มไปยังหน้าจอโฮม” แล้วแตะ “เพิ่ม”</li></ol></> : <><b><PlusSquare size={15} /> เพิ่มบน Android</b><ol><li>เปิดเว็บไซต์นี้ด้วย Chrome</li><li>แตะเมนู ⋮ มุมขวาบน</li><li>เลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”</li></ol></>}
    </div>}
  </section>;
}
