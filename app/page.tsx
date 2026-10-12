"use client";

import {
  ArrowDownLeft, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronRight, CircleHelp,
  ClipboardList, Clock3, Compass, Home as HouseIcon, LogOut, MapPin, Plus, ReceiptText,
  Settings2, ShieldCheck, Users, Wallet, X, UserRound, Landmark, Copy, Upload, Phone, ChevronLeft,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { TripLoading, MobileTripNav } from "@/components/trip-motion";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Attendance, calculateBalances, Expense, formatBaht, initialTripData, Member,
  PackingItem, ScheduleItem, suggestPayments, TripData, defaultVilla,
} from "@/lib/trip";

type PageKey = "home" | "people" | "money" | "plan" | "profile";
type ModalKey = "expense" | "villa" | "schedule" | "packing" | null;
type SavedTrip = { data: TripData; version: number };
type Account = { id: string; name: string; email?: string; picture?: string };

const navItems: { key: PageKey; label: string; icon: typeof HouseIcon }[] = [
  { key: "home", label: "ภาพรวม", icon: HouseIcon },
  { key: "people", label: "สมาชิก", icon: Users },
  { key: "money", label: "ค่าใช้จ่าย", icon: Wallet },
  { key: "plan", label: "แพลนทริป", icon: ClipboardList },
  { key: "profile", label: "โปรไฟล์", icon: UserRound },
];

function makeId() { return crypto.randomUUID(); }
function today() { return new Date().toISOString().slice(0, 10); }
function memberName(data: TripData, id: string) { return data.members.find((person) => person.id === id)?.name ?? "สมาชิกที่ถูกลบ"; }
function scheduleOwnerNames(data: TripData, item: ScheduleItem) {
  return item.ownerIds?.length ? item.ownerIds.map((id) => data.members.find((member) => member.id === id)?.name).filter(Boolean).join(", ") : item.owner;
}
function formatScheduleDate(date?: string) {
  if (!date) return "ยังไม่ระบุวัน";
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "2-digit" }).format(new Date(`${date}T12:00:00`));
}
function statusText(status: Attendance) { return status === "going" ? "ไปแน่นอน" : status === "not-going" ? "ไม่ไป" : "รอตอบ"; }
function statusClass(status: Attendance) { return status === "going" ? "status-going" : status === "not-going" ? "status-no" : "status-waiting"; }

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="dialog" role="dialog" aria-modal="true" aria-label={title}>
      <div className="dialog-head"><div><p className="eyebrow">อัปเดตทริป</p><h2>{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="ปิด"><X size={19} /></button></div>
      {children}
    </section>
  </div>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function TripLogoMark({ size = 35 }: { size?: number }) {
  return <span className="brand-mark" style={{ width: size, height: size, borderRadius: Math.round(size * 0.32) }} aria-hidden="true">
    <svg className="brand-mark-icon" width={Math.round(size * 0.68)} height={Math.round(size * 0.68)} viewBox="0 0 40 40" fill="none">
      <circle cx="27" cy="12" r="5" fill="#FFB34F" />
      <path d="M7 22.5C11.1 18.6 15.2 18.6 19.3 22.5C23.4 26.4 27.5 26.4 33 21.2" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <path d="M7 29C11.1 25.1 15.2 25.1 19.3 29C23.4 32.9 27.5 32.9 33 27.7" stroke="#A8F0FA" strokeWidth="3" strokeLinecap="round" />
    </svg>
  </span>;
}

function AuthBackdrop({ step }: { step: string }) {
  return <div className="auth-backdrop-art" aria-hidden="true"><div className="auth-orbit orbit-one" /><div className="auth-orbit orbit-two" /><div className="auth-sun" /><div className="auth-wave wave-blue" /><div className="auth-wave wave-cyan" /><div className="auth-wave wave-orange" /><div className="auth-floating-card"><span /><i /><b /></div><span className="auth-step-label">{step}</span></div>;
}

function TripApp() {
  const [account, setAccount] = useState<Account | null>(null);
  const [tripAuthenticated, setTripAuthenticated] = useState(false);
  const [loginCode, setLoginCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [data, setData] = useState<TripData>(initialTripData);
  const [version, setVersion] = useState(0);
  const [activePage, setActivePage] = useState<PageKey>("home");
  const [modal, setModal] = useState<ModalKey>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  const loadTrip = useCallback(async () => {
    const response = await fetch("/api/trip", { cache: "no-store" });
    if (response.status === 401) { setTripAuthenticated(false); return; }
    if (!response.ok) throw new Error("โหลดข้อมูลทริปไม่สำเร็จ");
    const result = await response.json() as SavedTrip;
    setData(result.data);
    setVersion(result.version);
    setTripAuthenticated(true);
  }, []);

  useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get("auth_error");
    if (authError) window.history.replaceState({}, "", window.location.pathname);
    fetch("/api/auth", { cache: "no-store" }).then((response) => response.json() as Promise<{ account: Account | null; tripAuthenticated: boolean }>).then(async (result) => {
      if (authError) {
        const messages: Record<string, string> = {
          google_not_configured: "Google Login ยังตั้งค่าไม่ครบ กรุณาติดต่อผู้จัดทริป",
          google_login_cancelled: "ยกเลิกการเข้าสู่ระบบ Google แล้ว",
          google_email_unverified: "บัญชี Google นี้ยังไม่ยืนยันอีเมล",
          google_login_failed: "เข้าสู่ระบบ Google ไม่สำเร็จ ลองอีกครั้งนะ",
        };
        setError(messages[authError] ?? messages.google_login_failed);
      }
      setAccount(result.account);
      if (result.account && result.tripAuthenticated) await loadTrip();
      else setTripAuthenticated(false);
    }).catch(() => setError("เชื่อมต่อระบบไม่ได้ ลองโหลดหน้าเว็บใหม่อีกครั้ง")).finally(() => setChecking(false));
  }, [loadTrip]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const save = useCallback(async (update: (current: TripData) => TripData, successMessage = "บันทึกแล้ว") => {
    setBusy(true); setError("");
    const next = update(data);
    try {
      const response = await fetch("/api/trip", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ version, data: next }) });
      const result = await response.json() as SavedTrip & { error?: string };
      if (response.status === 409) {
        await loadTrip();
        throw new Error("มีคนบันทึกข้อมูลก่อนหน้าแล้ว โหลดข้อมูลล่าสุดให้แล้ว กรุณาลองแก้ไขอีกครั้ง");
      }
      if (!response.ok) throw new Error(result.error ?? "บันทึกไม่สำเร็จ");
    setData(result.data); setVersion(result.version); setNotice(successMessage); setModal(null); setEditingExpense(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "บันทึกไม่สำเร็จ");
    } finally { setBusy(false); }
  }, [data, version, loadTrip]);

  const enterTrip = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/trip-access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: loginCode }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "รหัสทริปไม่ถูกต้อง");
      await loadTrip(); setLoginCode("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "เข้าใช้ทริปไม่สำเร็จ"); }
    finally { setBusy(false); setChecking(false); }
  };

  const createTripProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/trip/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: nickname.trim() }) });
      const result = await response.json() as SavedTrip & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "บันทึกชื่อเล่นไม่สำเร็จ");
      setData(result.data); setVersion(result.version); setNickname("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "บันทึกชื่อเล่นไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const logout = async () => { await fetch("/api/auth", { method: "DELETE" }); setAccount(null); setTripAuthenticated(false); setActivePage("home"); };
  const balances = useMemo(() => calculateBalances(data), [data]);
  const payments = useMemo(() => suggestPayments(calculateBalances(data, true)), [data]);
  const totalCost = data.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const confirmed = data.members.filter((person) => person.attendance === "going");
  const outstanding = balances.reduce((sum, balance) => sum + Math.max(0, -balance.amount), 0);
  const pageLabel = navItems.find((item) => item.key === activePage)?.label ?? "ภาพรวม";
  const myMember = data.members.find((member) => member.accountId === account?.id);

  const submitProof = async (payment: ReturnType<typeof suggestPayments>[number], file: File) => {
    if (!myMember) return;
    setBusy(true); setError("");
    const repayment = { ...payment, id: makeId(), date: today(), status: "pending" as const };
    const form = new FormData();
    form.set("id", repayment.id); form.set("from", repayment.from); form.set("to", repayment.to);
    form.set("amount", String(repayment.amount)); form.set("file", file);
    try {
      const response = await fetch("/api/payment-proof", { method: "POST", body: form });
      const result = await response.json() as { proofId?: string; error?: string };
      if (!response.ok || !result.proofId) throw new Error(result.error ?? "ส่งสลิปไม่สำเร็จ");
      const next = { ...repayment, proofId: result.proofId };
      const saved = await fetch("/api/trip", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ version, data: { ...data, repayments: [...data.repayments, next] } }) });
      const savedResult = await saved.json() as SavedTrip & { error?: string };
      if (!saved.ok) throw new Error(savedResult.error ?? "บันทึกรายการรอสลิปไม่สำเร็จ กรุณาโหลดหน้าใหม่");
      setData(savedResult.data); setVersion(savedResult.version); setNotice("ส่งสลิปแล้ว รอผู้รับตรวจสอบ");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ส่งสลิปไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  if (checking) return <TripLoading />;
  if (!account) return <main className="login-screen auth-screen"><AuthBackdrop step="บัญชี Google · ขั้นที่ 1 จาก 2" /><section className="login-card auth-card">
    <TripLogoMark size={48} /><p className="eyebrow">TRIP SPACE · CHIANG MAI</p>
    <h1>เข้าทริปกับเพื่อน</h1><p className="login-copy">ล็อกอินด้วย Google เพื่อสร้างโปรไฟล์ของคุณ แล้วใส่รหัสที่เพื่อนส่งให้</p>
    <a className="google-login-button" href="/api/auth/google"><span className="google-g" aria-hidden="true">G</span><span>ไปต่อด้วย Google</span><ChevronRight size={17} /></a>
    {error && <p className="error-note" role="alert">{error}</p>}<p className="login-foot"><ShieldCheck size={15} /> เราใช้ข้อมูลบัญชี Google เพื่อยืนยันชื่อและอีเมลเท่านั้น</p>
  </section><p className="login-caption">บ้านรมณ์ดี 4 พลูวิลล่าเชียงใหม่ · 1–2 พ.ย. 2026</p></main>;
  if (!tripAuthenticated) return <main className="login-screen auth-screen trip-code-screen"><AuthBackdrop step="รหัสทริป · ขั้นที่ 2 จาก 2" /><section className="login-card auth-card">
    <TripLogoMark size={48} /><p className="eyebrow">สวัสดี {account.name} · STEP 2 OF 2</p>
    <h1>รหัสทริปอยู่ไหนนะ?</h1><p className="login-copy">ใส่รหัสที่เพื่อนแชร์ไว้ แล้วเข้าไปดูแพลนกับยอดของกลุ่มได้เลย</p>
    <form onSubmit={enterTrip} className="login-form"><Field label="รหัสทริป"><input autoComplete="one-time-code" autoFocus value={loginCode} onChange={(event) => setLoginCode(event.target.value)} placeholder="กรอกรหัสทริป" required /></Field><button className="button button-primary button-wide" disabled={busy}>{busy ? "กำลังเช็กให้…" : "เข้าไปดูทริป"}<ChevronRight size={17} /></button></form>
    {error && <p className="error-note" role="alert">{error}</p>}<button className="auth-switch" onClick={logout}>ออกจากบัญชี</button><p className="login-foot"><ShieldCheck size={15} /> รหัสทริปช่วยจำกัดการเข้าถึงข้อมูลของกลุ่ม</p>
  </section><p className="login-caption">บ้านรมณ์ดี 4 พลูวิลล่าเชียงใหม่ · 1–2 พ.ย. 2026</p></main>;

  if (!myMember) return <main className="login-screen auth-screen nickname-screen"><AuthBackdrop step="โปรไฟล์สมาชิก · ขั้นที่ 3 จาก 3" /><section className="login-card auth-card">
    <TripLogoMark size={48} /><p className="eyebrow">ยินดีต้อนรับ {account.name}</p>
    <h1>เพื่อนเรียกคุณว่าอะไรดี?</h1><p className="login-copy">ใส่ชื่อเล่นที่อยากให้แสดงในรายชื่อสมาชิกและรายการค่าใช้จ่าย</p>
    <form onSubmit={createTripProfile} className="login-form"><Field label="ชื่อเล่น"><input autoComplete="nickname" autoFocus value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="เช่น อ้วนท่าทราย, สมชาย, สมหญฺฺิง" maxLength={40} required /></Field><button className="button button-primary button-wide" disabled={busy}>{busy ? "กำลังสร้างโปรไฟล์…" : "เข้าไปเจอเพื่อน ๆ"}<ChevronRight size={17} /></button></form>
    {error && <p className="error-note" role="alert">{error}</p>}<button className="auth-switch" onClick={logout}>ออกจากบัญชี</button><p className="login-foot"><ShieldCheck size={15} /> ชื่อนี้จะแสดงให้สมาชิกในทริปเห็น</p>
  </section><p className="login-caption">บ้านรมณ์ดี 4 พลูวิลล่าเชียงใหม่ · 1–2 พ.ย. 2026</p></main>;

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><TripLogoMark size={42} /><div><b>ทริปพลูวิลล่าหรรษา</b><small>CHIANG MAI · 2026</small></div></div>
      <div className="trip-switcher"><span className="trip-thumb"><HouseIcon size={18} /></span><div><small>กำลังวางแผน</small><b>Pool villa trip</b></div><span className="trip-dot" /></div>
      <p className="side-caption">WORKSPACE</p>
      <nav className="side-nav" aria-label="เมนูหลัก">{navItems.map(({ key, label, icon: Icon }) => <button key={key} className={`nav-link ${activePage === key ? "selected" : ""}`} onClick={() => setActivePage(key)}><Icon size={17} /><span>{label}</span>{key === "people" && <small>{data.members.length}</small>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="secure-card"><ShieldCheck size={16} /><span><b>พื้นที่ส่วนตัวของกลุ่ม</b><small>เข้าด้วยรหัสทริป</small></span></div><button className="nav-link logout-link" onClick={logout}><LogOut size={17} /><span>ออกจากทริป</span></button><button className="profile-chip profile-chip-button" onClick={() => setActivePage("profile")}><Avatar name={myMember?.name ?? account.name} index={0} image={myMember?.avatarUrl || myMember?.googleAvatarUrl || account.picture} /><span><b>{myMember?.name ?? account.name}</b><small>{account.email ?? "บัญชี Google"}</small></span><Settings2 size={16} /></button></div>
    </aside>

    <section className="main-column">
      <header className="topbar"><div className="mobile-brand"><TripLogoMark size={32} /><b>ทริปพลูวิลล่าหรรษา</b></div><div className="breadcrumbs"><span>Trip space</span><ChevronRight size={14} /><b>{pageLabel}</b></div><div className="top-actions"><span className="live-pill"><i /> ข้อมูลกลุ่ม</span><button className="avatar avatar-you avatar-button" title="เปิดโปรไฟล์" onClick={() => setActivePage("profile")}>{myMember?.avatarUrl || myMember?.googleAvatarUrl || account.picture ? <Image src={myMember?.avatarUrl || myMember?.googleAvatarUrl || account.picture!} alt={`รูปโปรไฟล์ ${myMember?.name ?? account.name}`} width={44} height={44} unoptimized /> : (myMember?.name ?? account.name).slice(0, 1)}</button></div></header>
      <div className="page-content">
        {activePage === "home" && myMember && <Overview data={data} myMember={myMember} confirmed={confirmed.length} totalCost={totalCost} outstanding={outstanding} payments={payments} onNavigate={setActivePage} onModal={setModal} onPay={() => setActivePage("money")} />}
        {activePage === "people" && <People data={data} balances={balances} accountId={account.id} onStatus={(id, attendance) => save((current) => ({ ...current, members: current.members.map((person) => person.id === id ? { ...person, attendance } : person) }))} />}
        {activePage === "money" && <Money data={data} balances={balances} payments={payments} totalCost={totalCost} ownMemberId={myMember?.id} busy={busy} onSubmitProof={submitProof} onConfirm={(id) => save((current) => ({ ...current, repayments: current.repayments.map((repayment) => repayment.id === id ? { ...repayment, status: "confirmed" } : repayment) }), "ยืนยันการชำระเงินแล้ว")} onAdd={() => { setEditingExpense(null); setModal("expense"); }} onEdit={(expense) => { setEditingExpense(expense); setModal("expense"); }} onDelete={(id) => save((current) => ({ ...current, expenses: current.expenses.filter((expense) => expense.id !== id) }), "ลบรายการแล้ว")} />}
        {activePage === "plan" && <Plan data={data} onModal={setModal} onTogglePacking={(id) => save((current) => ({ ...current, packing: current.packing.map((item) => item.id === id ? { ...item, done: !item.done } : item) }))} onDeletePacking={(id) => save((current) => ({ ...current, packing: current.packing.filter((item) => item.id !== id) }), "ลบรายการแล้ว")} onDeleteSchedule={(id) => save((current) => ({ ...current, schedule: current.schedule.filter((item) => item.id !== id) }), "ลบกำหนดการแล้ว")} />}
        {activePage === "profile" && myMember && <ProfilePage member={myMember} members={data.members} googlePicture={account.picture} busy={busy} onSave={(profile) => save((current) => ({ ...current, members: current.members.map((member) => member.id === myMember.id ? { ...member, ...profile } : member) }), "บันทึกโปรไฟล์แล้ว")} />}
      </div>
      <footer className="page-footer"><span>ทริปบ้านรมณ์ดี · ข้อมูลบันทึกร่วมกัน</span><span>เชียงใหม่ <span className="footer-dot"><Sparkles size={11} aria-hidden="true" /></span> 01—02 พ.ย. 2026</span></footer>
    </section>

    <MobileTripNav items={navItems} activeKey={activePage} onChange={setActivePage} />
    {notice && <div className="toast" role="status"><CheckCircle2 size={17} />{notice}</div>}
    {error && <div className="toast toast-error" role="alert"><CircleHelp size={17} />{error}<button onClick={() => setError("")} aria-label="ปิด"><X size={15} /></button></div>}

    {modal === "expense" && <ExpenseDialog expense={editingExpense} data={data} busy={busy} onClose={() => { setModal(null); setEditingExpense(null); }} onSave={(expense) => save((current) => ({ ...current, expenses: editingExpense ? current.expenses.map((item) => item.id === editingExpense.id ? { ...expense, id: item.id } : item) : [...current.expenses, { ...expense, id: makeId() }] }), editingExpense ? "อัปเดตรายจ่ายแล้ว" : "เพิ่มรายจ่ายแล้ว")} />}
    {modal === "villa" && <VillaDialog villa={data.villa} busy={busy} onClose={() => setModal(null)} onSave={(villa) => save((current) => ({ ...current, villa }), "บันทึกข้อมูลที่พักแล้ว")} />}
    {modal === "schedule" && <ScheduleDialog data={data} busy={busy} onClose={() => setModal(null)} onSave={(item) => save((current) => ({ ...current, schedule: [...current.schedule, { ...item, id: makeId() }].sort((a, b) => `${a.date ?? "9999-12-31"}T${a.time}`.localeCompare(`${b.date ?? "9999-12-31"}T${b.time}`)) }), "เพิ่มกำหนดการแล้ว")} />}
    {modal === "packing" && <PackingDialog data={data} busy={busy} onClose={() => setModal(null)} onSave={(item) => save((current) => ({ ...current, packing: [...current.packing, { ...item, id: makeId(), done: false }] }), "เพิ่มรายการเตรียมของแล้ว")} />}
  </main>;
}

function Overview({ data, myMember, confirmed, totalCost, outstanding, payments, onNavigate, onModal, onPay }: {
  data: TripData; myMember: Member; confirmed: number; totalCost: number; outstanding: number; payments: ReturnType<typeof suggestPayments>;
  onNavigate: (page: PageKey) => void; onModal: (modal: ModalKey) => void; onPay: () => void;
}) {
  return <>
    <div className="page-heading"><div><p className="eyebrow">FRIENDS GETAWAY <span>·</span> CHIANG MAI</p><h1>ทริปเชียงใหม่ <span className="heading-sparkle"><Compass size={22} strokeWidth={2.25} aria-hidden="true" /></span></h1><p className="heading-sub">1–2 พฤศจิกายน · ดูแพลน เพื่อนร่วมทริป และยอดที่ต้องเคลียร์ในที่เดียว</p></div><button className="button button-outline" onClick={() => onNavigate("people")}><Users size={17} /> ดูสมาชิก</button></div>
    <MyNextActions data={data} member={myMember} payments={payments} onNavigate={onNavigate} />
    <div className="trip-banner"><Image className="trip-banner-photo" src="/รูปภาพ บ้านรมดี/595174126_864437849438351_4169433747180167711_n.jpg" alt="สระว่ายน้ำและตัวบ้านรมณ์ดี 4 พลูวิลล่าเชียงใหม่" fill priority sizes="(max-width: 650px) 100vw, 1160px" /><div className="banner-copy"><span className="date-chip"><CalendarDays size={14} /> 1—2 พฤศจิกายน 2026</span><h2>ถึงเวลาพักผ่อน<br />ให้เต็มที่กันแล้ว</h2><p>เชียงใหม่ · ทริปพูลวิลล่ากับเพื่อน</p><div className="banner-bottom"><span><i /> {confirmed} คนยืนยันแล้ว</span><button onClick={() => onNavigate("people")}>ดูสมาชิก <ArrowUpRight size={14} /></button></div></div></div>
    <div className="metric-grid"><Metric label="ยืนยันไปแล้ว" value={`${confirmed} คน`} icon={<Users size={18} />} detail={`${data.members.length} คนในกลุ่ม`} tone="lavender" /><Metric label="ค่าใช้จ่ายรวม" value={formatBaht(totalCost)} icon={<ReceiptText size={18} />} detail={`${data.expenses.length} รายการ`} tone="peach" /><Metric label="ยอดรอเคลียร์" value={formatBaht(outstanding)} icon={<Wallet size={18} />} detail={payments.length ? `${payments.length} รายการคืนเงิน` : "เคลียร์ครบแล้ว"} tone="mint" /></div>
    <div className="overview-grid"><section className="panel member-panel"><div className="panel-head"><div><p className="eyebrow">THE CREW</p><h2>เพื่อนร่วมทริป <span className="count-bubble">{data.members.length}</span></h2></div><button className="text-link" onClick={() => onNavigate("people")}>ดูทั้งหมด <ChevronRight size={15} /></button></div>
      {data.members.length ? <div className="crew-list">{data.members.map((person, index) => <div className="crew-row" key={person.id}><Avatar name={person.name} index={index} image={person.avatarUrl || person.googleAvatarUrl} /><span className="crew-name"><b>{person.name}</b><small>{person.role === "organizer" ? "ผู้จัดทริป" : "สมาชิก"}</small></span><span className={`status-pill ${statusClass(person.attendance)}`}><i />{statusText(person.attendance)}</span></div>)}</div> : <div className="empty-state"><span className="empty-symbol"><Users size={18} /></span><b>ยังไม่มีสมาชิกในทริป</b><p>เพื่อนจะปรากฏที่นี่เมื่อเข้าสู่ระบบและยืนยันรหัสทริป</p></div>}
    </section><VillaCard villa={data.villa} onEdit={() => onModal("villa")} /></div>
    <div className="overview-grid lower-grid"><section className="panel settle-panel"><div className="panel-head"><div><p className="eyebrow">SETTLEMENT</p><h2>เคลียร์เงินกัน</h2></div><button className="round-link" onClick={() => onNavigate("money")} aria-label="ดูบัญชีทริป"><ArrowUpRight size={16} /></button></div>
      {payments.length ? <div className="settle-list">{payments.slice(0, 3).map((payment, index) => <div className="settle-row" key={`${payment.from}-${payment.to}-${index}`}><div className="settle-people"><span className="mini-avatar debtor">{memberName(data, payment.from).slice(0, 1)}</span><ArrowDownLeft size={14} /><span className="mini-avatar creditor">{memberName(data, payment.to).slice(0, 1)}</span><span><b>{memberName(data, payment.from)}</b><small>คืนให้ {memberName(data, payment.to)}</small></span></div><div className="settle-amount"><b>{formatBaht(payment.amount)}</b><button onClick={onPay}>ดูการชำระเงิน</button></div></div>)}</div> : <div className="clear-state"><span><Check size={18} /></span><div><b>ไม่มีรายการค้างชำระ</b><small>เพิ่มค่าใช้จ่ายแล้วระบบจะช่วยคิดยอดให้</small></div></div>}
    </section><section className="panel agenda-panel"><div className="panel-head"><div><p className="eyebrow">UP NEXT</p><h2>แพลนเล็ก ๆ</h2></div><button className="text-link" onClick={() => onNavigate("plan")}>ดูแพลน <ChevronRight size={15} /></button></div>{data.schedule.length ? data.schedule.slice(0, 3).map((item) => <div className="agenda-row" key={item.id}><span className="agenda-time">{item.date ? `${formatScheduleDate(item.date)} · ` : ""}{item.time || "—"}</span><span><b>{item.title}</b><small>{scheduleOwnerNames(data, item) || "ยังไม่มีผู้รับผิดชอบ"}</small></span></div>) : <EmptyState title="ยังไม่มีแพลน" body="เติมช่วงเวลาออกเดินทางหรือกิจกรรมแรกของทริป" action="เพิ่มแพลน" onClick={() => onModal("schedule")} />}</section></div>
  </>;
}

function MyNextActions({ data, member, payments, onNavigate }: { data: TripData; member: Member; payments: ReturnType<typeof suggestPayments>; onNavigate: (page: PageKey) => void }) {
  const due = payments.find((payment) => payment.from === member.id);
  const incoming = data.repayments.find((payment) => payment.status === "pending" && payment.to === member.id);
  const needsPayoutInfo = payments.some((payment) => payment.to === member.id) && (!member.promptPay || !member.qrDataUrl);
  const tasks: { title: string; detail: string; action: string; page: PageKey; tone: string }[] = [];
  if (member.attendance === "pending") tasks.push({ title: "ยืนยันว่าจะไปไหม", detail: "อัปเดตสถานะของคุณให้เพื่อนวางแผนต่อได้", action: "ยืนยันสถานะ", page: "people", tone: "blue" });
  if (due) tasks.push({ title: `โอน ${formatBaht(due.amount)} ให้ ${memberName(data, due.to)}`, detail: "ดู QR หรือบัญชีผู้รับ แล้วแนบสลิปเมื่อโอนแล้ว", action: "ไปที่ยอดชำระ", page: "money", tone: "orange" });
  if (incoming) tasks.push({ title: `ตรวจสลิปจาก ${memberName(data, incoming.from)}`, detail: `${formatBaht(incoming.amount)} · ยืนยันหลังตรวจยอดโอน`, action: "ตรวจสลิป", page: "money", tone: "blue" });
  if (needsPayoutInfo) tasks.push({ title: "เพิ่มช่องทางรับเงิน", detail: "ใส่ PromptPay และ QR เพื่อให้เพื่อนโอนคืนได้สะดวก", action: "เพิ่มข้อมูลรับเงิน", page: "profile", tone: "orange" });
  return <section className="panel my-actions-panel"><div className="panel-head"><div><p className="eyebrow">FOR YOU · {member.name}</p><h2>สิ่งที่ฉันต้องทำ</h2></div><span className="action-count">{tasks.length ? `${tasks.length} รายการ` : "เรียบร้อย"}</span></div>{tasks.length ? <div className="my-action-list">{tasks.map((task, index) => <article className={`my-action-card ${task.tone}`} key={`${task.title}-${index}`}><div><b>{task.title}</b><small>{task.detail}</small></div><button className="button button-outline button-compact" onClick={() => onNavigate(task.page)}>{task.action}<ChevronRight size={14} /></button></article>)}</div> : <div className="action-clear"><CheckCircle2 size={17} /><span><b>ตอนนี้ไม่มีรายการเร่งด่วน</b><small>ข้อมูลทริปและการชำระของคุณเป็นปัจจุบันแล้ว</small></span></div>}</section>;
}

function Metric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: ReactNode; tone: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><span className="metric-label">{label}</span><b className="metric-value">{value}</b><small>{detail}</small></article>;
}

const villaPhotos = [
  "595138134_864437652771704_8260925973019639768_n.jpg",
  "595174126_864437849438351_4169433747180167711_n.jpg",
  "595176624_864437612771708_7255089955945172061_n.jpg",
  "596422687_864437682771701_8766340233538707074_n.jpg",
  "596721790_864437696105033_2729958319940313157_n.jpg",
  "597250547_864437576105045_114331014797271985_n.jpg",
  "597535799_864437636105039_8467510591417846851_n.jpg",
  "597720240_864437656105037_5433266332013351122_n.jpg",
  "597735901_864437686105034_6932277882796716572_n.jpg",
  "837953301_1959109151432754_7185047742706546703_n.jpg",
  "838561218_1659358919086225_5999120922196805286_n.jpg",
  "838939241_1343418201112436_1129752987871581424_n.jpg",
  "839822727_1360864209225703_6168474034708522252_n.jpg",
  "839860858_2074121603465730_3964176145406509590_n.jpg",
  "839932759_28636933845973848_7799429171628284934_n.jpg",
  "840167601_3152933981559218_536721185658047775_n.jpg",
  "840349042_28507029365629773_8219406511990462271_n.jpg",
  "841143151_1354174483236684_3764845297180385260_n.jpg",
].map((name) => `/รูปภาพ%20บ้านรมดี/${name}`);

function VillaCard({ villa, onEdit }: { villa: TripData["villa"]; onEdit: () => void }) {
  const [activePhoto, setActivePhoto] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const mapUrl = villa.mapUrl || defaultVilla.mapUrl;
  const phone = villa.phone || defaultVilla.phone;
  useEffect(() => {
    if (!lightboxOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "ArrowRight") setActivePhoto((current) => (current + 1) % villaPhotos.length);
      if (event.key === "ArrowLeft") setActivePhoto((current) => (current - 1 + villaPhotos.length) % villaPhotos.length);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen]);
  const showPhoto = (index: number) => {
    setActivePhoto(index);
    setLightboxOpen(true);
  };
  const changePhoto = (direction: number) => setActivePhoto((current) => (current + direction + villaPhotos.length) % villaPhotos.length);
  return <><section className="villa-card"><div className="villa-cover"><button type="button" className="villa-cover-view" onClick={() => setLightboxOpen(true)} aria-label="ขยายภาพที่พัก"><Image className="villa-cover-photo" src={villaPhotos[activePhoto]} alt={`ภาพที่พักบ้านรมณ์ดี 4 ${activePhoto + 1}`} fill priority sizes="(max-width: 900px) 100vw, 420px" /></button><span className="villa-kicker"><MapPin size={13} /> STAY IN CHIANG MAI</span><button type="button" className="villa-expand-hint" onClick={() => setLightboxOpen(true)}>แตะเพื่อดูภาพเต็ม</button></div><div className="villa-gallery" aria-label="รูปภาพที่พัก">{villaPhotos.map((photo, index) => <button type="button" className={`villa-thumb ${activePhoto === index ? "active" : ""}`} key={photo} onClick={() => showPhoto(index)} aria-label={`ดูรูปที่พักภาพที่ ${index + 1}`} aria-pressed={activePhoto === index}><Image src={photo} alt="" width={72} height={48} sizes="72px" /></button>)}</div><div className="villa-info"><div><p className="eyebrow">OUR STAY</p><h2>บ้านรมณ์ดี 4 <span>พลูวิลล่าเชียงใหม่</span></h2><p className="villa-sub">Chiang Mai · Pool villa</p></div><button className="icon-button" onClick={onEdit} aria-label="แก้ไขข้อมูลที่พัก"><Settings2 size={17} /></button></div><div className="villa-details"><div><Clock3 size={15} /><span><b>{villa.checkIn || "ยังไม่ระบุ"}</b><small>เช็กอิน</small></span></div><div><Clock3 size={15} /><span><b>{villa.checkOut || "ยังไม่ระบุ"}</b><small>เช็กเอาต์</small></span></div><a href={`tel:${phone.replace(/[^\d+]/g, "")}`}><Phone size={15} /><span><b>{phone}</b><small>เบอร์ติดต่อที่พัก</small></span></a></div><div className="villa-bottom">{villa.address ? <span><MapPin size={14} />{villa.address}</span> : <span className="muted-location"><MapPin size={14} />ตำแหน่งที่พักในเชียงใหม่</span>}<a href={mapUrl} target="_blank" rel="noreferrer">เปิดแผนที่ <ArrowUpRight size={13} /></a></div></section>{lightboxOpen && typeof document !== "undefined" && createPortal(<div className="villa-lightbox" role="dialog" aria-modal="true" aria-label={`ภาพที่พักภาพที่ ${activePhoto + 1} จาก ${villaPhotos.length}`} onClick={() => setLightboxOpen(false)}><button type="button" className="villa-lightbox-close" onClick={() => setLightboxOpen(false)} aria-label="ปิดภาพเต็ม"><X size={22} /></button><button type="button" className="villa-lightbox-nav previous" onClick={(event) => { event.stopPropagation(); changePhoto(-1); }} aria-label="ดูภาพก่อนหน้า"><ChevronLeft size={28} /></button><div className="villa-lightbox-image" onClick={(event) => event.stopPropagation()}><Image src={villaPhotos[activePhoto]} alt={`ภาพที่พักบ้านรมณ์ดี 4 ${activePhoto + 1}`} fill sizes="100vw" priority /></div><button type="button" className="villa-lightbox-nav next" onClick={(event) => { event.stopPropagation(); changePhoto(1); }} aria-label="ดูภาพถัดไป"><ChevronRight size={28} /></button><span className="villa-lightbox-count">{activePhoto + 1} / {villaPhotos.length}</span></div>, document.body)}</>;
}

function People({ data, balances, accountId, onStatus }: { data: TripData; balances: ReturnType<typeof calculateBalances>; accountId: string; onStatus: (id: string, status: Attendance) => void }) {
  const groups: { status: Attendance; label: string; eyebrow: string }[] = [{ status: "going", label: "ไปแน่นอน", eyebrow: "พร้อมไป" }, { status: "pending", label: "รอตอบ", eyebrow: "รอคอนเฟิร์ม" }, { status: "not-going", label: "ไม่ไป", eyebrow: "ครั้งหน้าเจอกัน" }];
  return <><div className="page-heading"><div><p className="eyebrow">THE CREW · {data.members.length} คน</p><h1>เพื่อนร่วมทริป</h1><p className="heading-sub">สมาชิกจะแสดงที่นี่เมื่อเข้าสู่ระบบและยืนยันรหัสทริป</p></div></div>
    <div className="people-summary"><div><b>{data.members.filter((person) => person.attendance === "going").length}</b><span>พร้อมไป</span></div><div><b>{data.members.filter((person) => person.attendance === "pending").length}</b><span>รอตอบ</span></div><div><b>{data.members.filter((person) => person.role === "organizer").length}</b><span>คนจัดทริป</span></div><div className="summary-note"><Users size={17} /><span>แตะสถานะเพื่ออัปเดตคำตอบของคุณได้เลย</span></div></div>
    {!data.members.length ? <section className="panel empty-large"><div className="empty-state"><span className="empty-symbol"><Users size={18} /></span><b>ยังไม่มีสมาชิกในทริป</b><p>สมาชิกจะถูกเพิ่มอัตโนมัติ เมื่อเข้าสู่ระบบด้วย Google และยืนยันรหัสทริป</p></div></section> : groups.map((group) => { const members = data.members.filter((person) => person.attendance === group.status); return members.length ? <section className="panel people-group" key={group.status}><div className="panel-head"><div><p className="eyebrow">{group.eyebrow}</p><h2>{group.label} <span className="count-bubble">{members.length}</span></h2></div></div><div className="member-card-grid">{members.map((person, index) => { const net = balances.find((balance) => balance.memberId === person.id)?.amount ?? 0; const isOwnProfile = person.accountId === accountId; return <article className="member-card" key={person.id}><div className="member-card-head"><Avatar name={person.name} index={index} image={person.avatarUrl || person.googleAvatarUrl} /><span className="member-card-name"><b>{person.name}</b><small>{person.role === "organizer" ? "ผู้จัดทริป" : "สมาชิก"}{isOwnProfile ? " · คุณ" : ""}</small></span>{person.role === "organizer" && <span className="organizer-tag">คนจัดทริป</span>}</div><div className="member-card-balance"><span>ยอดสุทธิ</span><b className={net > 0 ? "positive-money" : net < 0 ? "negative-money" : "muted-money"}>{net ? `${net > 0 ? "+" : "−"}${formatBaht(Math.abs(net))}` : "ยังไม่มี"}</b></div><div className="member-card-actions"><label><span>สถานะ</span><select disabled={!isOwnProfile} className={`status-select ${statusClass(person.attendance)}`} value={person.attendance} aria-label={`สถานะของ ${person.name}`} onChange={(event) => onStatus(person.id, event.target.value as Attendance)}><option value="pending">รอตอบ</option><option value="going">ไปแน่นอน</option><option value="not-going">ไม่ไป</option></select></label></div></article>; })}</div></section> : null; })}
    <div className="info-strip"><ShieldCheck size={16} /><span>ค่าใช้จ่ายส่วนกลางจะหารเฉพาะคนที่ยืนยันว่าไป ปรับผู้ร่วมจ่ายได้ในแต่ละรายการ</span></div>
  </>;
}

function Money({ data, balances, payments, totalCost, ownMemberId, busy, onSubmitProof, onConfirm, onAdd, onEdit, onDelete }: {
  data: TripData; balances: ReturnType<typeof calculateBalances>; payments: ReturnType<typeof suggestPayments>; totalCost: number;
  ownMemberId?: string; busy: boolean; onSubmitProof: (payment: ReturnType<typeof suggestPayments>[number], file: File) => void;
  onConfirm: (id: string) => void; onAdd: () => void; onEdit: (expense: Expense) => void; onDelete: (id: string) => void;
}) {
  const [proofPayment, setProofPayment] = useState<ReturnType<typeof suggestPayments>[number] | null>(null);
  const payers = new Set(data.expenses.map((expense) => expense.paidBy));
  const pending = data.repayments.filter((repayment) => repayment.status === "pending");
  const paid = data.repayments.filter((repayment) => repayment.status !== "pending");
  return <><div className="page-heading"><div><p className="eyebrow">SHARED EXPENSES · {data.expenses.length} รายการ</p><h1>ค่าใช้จ่ายทริป</h1><p className="heading-sub">ดูว่าใครสำรองจ่าย ใครต้องคืน และส่งสลิปให้คนรับตรวจได้ที่นี่</p></div><button className="button button-primary" onClick={onAdd}><Plus size={17} /> เพิ่มค่าใช้จ่าย</button></div>
    <div className="money-summary"><Metric label="ค่าใช้จ่ายรวม" value={formatBaht(totalCost)} icon={<ReceiptText size={18} />} detail="ยอดที่บันทึกทั้งหมด" tone="peach" /><Metric label="รอส่ง/ชำระ" value={formatBaht(payments.reduce((sum, payment) => sum + payment.amount, 0))} icon={<ArrowDownLeft size={18} />} detail={`${payments.length} รายการที่เหลือ`} tone="mint" /><Metric label="คนที่สำรองจ่าย" value={`${payers.size} คน`} icon={<Wallet size={18} />} detail="ผู้จ่ายล่วงหน้า" tone="lavender" /></div>
    <section className="panel settlement-full"><div className="panel-head"><div><p className="eyebrow">SETTLEMENT</p><h2>ใครต้องโอนให้ใคร</h2><p className="panel-sub">ยอดค้าง {formatBaht(balances.reduce((sum, item) => sum + Math.max(0, -item.amount), 0))} · ปิดยอดเมื่อผู้รับตรวจสลิปแล้ว</p></div><span className="auto-tag"><CheckCircle2 size={14} /> ระบบช่วยคิดให้</span></div>{payments.length ? <div className="settlement-table">{payments.map((payment, index) => <div className="settlement-line" key={`${payment.from}-${payment.to}-${index}`}><span className="direction-person"><Avatar name={memberName(data, payment.from)} index={index} image={data.members.find((member) => member.id === payment.from)?.avatarUrl || data.members.find((member) => member.id === payment.from)?.googleAvatarUrl} /><span><small>ลูกหนี้</small><b>{memberName(data, payment.from)}</b></span></span><span className="payment-arrow"><i /><ArrowUpRight size={16} /><i /></span><span className="direction-person"><Avatar name={memberName(data, payment.to)} index={index + 1} image={data.members.find((member) => member.id === payment.to)?.avatarUrl || data.members.find((member) => member.id === payment.to)?.googleAvatarUrl} /><span><small>เจ้าหนี้ · ผู้สำรองจ่าย</small><b>{memberName(data, payment.to)}</b></span></span><b className="payment-total">{formatBaht(payment.amount)}</b>{ownMemberId === payment.from ? <button className="button button-outline button-compact" onClick={() => setProofPayment(payment)} disabled={busy}><Upload size={14} /> ส่งสลิป</button> : <span className="pay-hint">{ownMemberId === payment.to ? "รอผู้จ่ายส่งสลิป" : "ดูช่องทางรับเงินที่โปรไฟล์"}</span>}</div>)}</div> : <div className="clear-state"><span><Check size={18} /></span><div><b>ไม่มีรายการค้างชำระ</b><small>เพิ่มค่าใช้จ่ายแล้วระบบจะช่วยคิดยอดให้</small></div></div>}</section>
    {pending.length > 0 && <section className="panel repayment-panel"><div className="panel-head"><div><p className="eyebrow">NEEDS REVIEW</p><h2>สลิปรอผู้รับยืนยัน <span className="count-bubble">{pending.length}</span></h2></div></div><div className="repayment-list">{pending.map((repayment) => <div key={repayment.id}><span className="paid-check pending-check"><Clock3 size={13} /></span><span><b>{memberName(data, repayment.from)}</b> ส่งเงินให้ <b>{memberName(data, repayment.to)}</b><small>{repayment.date} · รอตรวจหลักฐาน</small></span><strong>{formatBaht(repayment.amount)}</strong><a className="button button-outline button-compact" href={`/api/payment-proof?id=${encodeURIComponent(repayment.id)}`} target="_blank" rel="noreferrer">ดูสลิป</a>{ownMemberId === repayment.to && <button className="button button-primary button-compact" onClick={() => onConfirm(repayment.id)} disabled={busy}><Check size={14} /> ยืนยัน</button>}</div>)}</div></section>}
    {paid.length > 0 && <section className="panel repayment-panel"><div className="panel-head"><div><p className="eyebrow">PAYMENT HISTORY</p><h2>ชำระแล้ว <span className="count-bubble">{paid.length}</span></h2></div></div><div className="repayment-list">{[...paid].reverse().map((repayment) => <div key={repayment.id}><span className="paid-check"><Check size={13} /></span><span><b>{memberName(data, repayment.from)}</b> คืนให้ <b>{memberName(data, repayment.to)}</b><small>{repayment.date}</small></span><strong>{formatBaht(repayment.amount)}</strong></div>)}</div></section>}
    <section className="panel expenses-panel"><div className="panel-head"><div><p className="eyebrow">EXPENSE LOG</p><h2>รายการค่าใช้จ่าย <span className="count-bubble">{data.expenses.length}</span></h2></div></div>{data.expenses.length ? <div className="expense-list">{[...data.expenses].sort((a, b) => b.date.localeCompare(a.date)).map((expense) => <article className="expense-row" key={expense.id}><span className="expense-icon"><ReceiptText size={18} /></span><span className="expense-description"><b>{expense.title}</b><small>{expense.category || "ทั่วไป"} <i>·</i> {expense.date ? new Date(`${expense.date}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "ไม่ระบุวันที่"} <i>·</i> หาร {expense.participantIds.length} คน</small></span><span className="expense-payer"><small>ออกให้ก่อนโดย</small><b>{memberName(data, expense.paidBy)}</b></span><b className="expense-amount">{formatBaht(expense.amount)}</b><span className="expense-actions"><button className="icon-button small-icon" onClick={() => onEdit(expense)} aria-label={`แก้ไข ${expense.title}`}><Settings2 size={15} /></button><button className="icon-button small-icon danger-icon" onClick={() => { if (window.confirm(`ลบรายการ “${expense.title}” ใช่ไหม?`)) onDelete(expense.id); }} aria-label={`ลบ ${expense.title}`}><X size={15} /></button></span></article>)}</div> : <EmptyState title="ยังไม่มีรายการรายจ่าย" body="เพิ่มเงินค่าที่พัก อาหาร หรือของที่ซื้อเข้ากลุ่มได้เลย" action="เพิ่มรายจ่าย" onClick={onAdd} />}</section>
    <section className="balance-footnote"><span className="info-icon"><CircleHelp size={16} /></span><p><b>วิธีคำนวณ</b><br />ยอดแต่ละรายการแบ่งเท่ากันตามรายชื่อผู้ร่วมจ่าย การส่งสลิปจะยังไม่ตัดยอดจนกว่าผู้รับจะตรวจสอบและยืนยันแล้ว ช่องทางรับเงินของสมาชิกอยู่ในหน้าโปรไฟล์</p></section>
    {proofPayment && <ProofDialog payment={proofPayment} payeeName={memberName(data, proofPayment.to)} busy={busy} onClose={() => setProofPayment(null)} onSubmit={(file) => { onSubmitProof(proofPayment, file); setProofPayment(null); }} />}
  </>;
}

function ProofDialog({ payment, payeeName, busy, onClose, onSubmit }: { payment: ReturnType<typeof suggestPayments>[number]; payeeName: string; busy: boolean; onClose: () => void; onSubmit: (file: File) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  return <Dialog title="แนบสลิปโอนเงิน" onClose={onClose}><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); if (file) onSubmit(file); }}><p className="form-note">จ่ายให้ {payeeName} · {formatBaht(payment.amount)} ผู้รับจะเห็นสลิปและกดยืนยันก่อนยอดถูกปิด</p><Field label="รูปสลิป"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const selected = event.target.files?.[0] ?? null; if (selected && (selected.size > 700_000 || !["image/png", "image/jpeg", "image/webp"].includes(selected.type))) { setFile(null); setFileError("เลือกรูป PNG, JPG หรือ WebP ขนาดไม่เกิน 700 KB"); } else { setFile(selected); setFileError(""); } }} required /><small>รองรับ PNG, JPG และ WebP ไม่เกิน 700 KB</small></Field>{fileError && <small className="field-error">{fileError}</small>}{file && <small>เลือกแล้ว: {file.name}</small>}<div className="dialog-actions"><span /><button type="button" className="button button-outline" onClick={onClose}>ยกเลิก</button><button className="button button-primary" disabled={busy || !file}>{busy ? "กำลังส่ง…" : "ส่งสลิปให้ผู้รับ"}</button></div></form></Dialog>;
}

function ProfilePage({ member, members, googlePicture, busy, onSave }: { member: Member; members: Member[]; googlePicture?: string; busy: boolean; onSave: (profile: Partial<Member>) => void }) {
  const [name, setName] = useState(member.name);
  const [avatarUrl, setAvatarUrl] = useState(member.avatarUrl ?? "");
  const [promptPay, setPromptPay] = useState(member.promptPay ?? "");
  const [bankName, setBankName] = useState(member.bankName ?? "");
  const [bankAccountName, setBankAccountName] = useState(member.bankAccountName ?? "");
  const [bankAccountNumber, setBankAccountNumber] = useState(member.bankAccountNumber ?? "");
  const [qrDataUrl, setQrDataUrl] = useState(member.qrDataUrl ?? "");
  const [fileError, setFileError] = useState("");
  const updateQr = (file?: File) => {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 180_000) { setFileError("เลือกรูปภาพขนาดไม่เกิน 180 KB"); return; }
    const reader = new FileReader();
    reader.onload = () => { setQrDataUrl(String(reader.result)); setFileError(""); };
    reader.onerror = () => setFileError("อ่านไฟล์รูปไม่สำเร็จ");
    reader.readAsDataURL(file);
  };
  const updateAvatar = (file?: File) => {
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"].includes(file.type)) || file.size > 180_000) { setFileError("เลือกรูปโปรไฟล์ PNG, JPG หรือ WebP ขนาดไม่เกิน 180 KB"); return; }
    const reader = new FileReader();
    reader.onload = () => { setAvatarUrl(String(reader.result)); setFileError(""); };
    reader.onerror = () => setFileError("อ่านไฟล์รูปไม่สำเร็จ");
    reader.readAsDataURL(file);
  };
  const visibleAvatar = avatarUrl || member.googleAvatarUrl || googlePicture;
  const copy = async (value: string) => { if (value) await navigator.clipboard.writeText(value); };
  return <><div className="page-heading"><div><p className="eyebrow">YOUR IDENTITY · PAYMENT DETAILS</p><h1>โปรไฟล์ของฉัน</h1><p className="heading-sub">ชื่อและช่องทางรับเงินนี้จะแสดงให้สมาชิกในทริปเห็น</p></div></div>
    <section className="panel profile-form-panel"><div className="panel-head"><div><p className="eyebrow">MY PROFILE</p><h2>ข้อมูลที่ใช้ในทริป</h2></div><span className="profile-you-tag"><UserRound size={14} /> โปรไฟล์ของคุณ</span></div><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onSave({ name: name.trim(), avatarUrl, googleAvatarUrl: member.googleAvatarUrl || googlePicture, promptPay: promptPay.trim(), bankName: bankName.trim(), bankAccountName: bankAccountName.trim(), bankAccountNumber: bankAccountNumber.trim(), qrDataUrl }); }}>
      <div className="profile-avatar-editor"><Avatar name={name || member.name} index={0} image={visibleAvatar} /><div><b>รูปโปรไฟล์</b><small>เริ่มต้นจากรูปบัญชี Google เปลี่ยนเป็นรูปของคุณได้</small><span className="button button-outline button-compact avatar-upload-button">เลือกรูปใหม่<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="เลือกรูปโปรไฟล์" onChange={(event) => updateAvatar(event.target.files?.[0])} /></span>{avatarUrl && <button type="button" className="text-link avatar-reset" onClick={() => setAvatarUrl("")}>กลับไปใช้รูป Google</button>}</div></div>
      <Field label="ชื่อที่เพื่อนเห็น"><input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="ชื่อเล่น" required /></Field>
      <div className="field-grid"><Field label="PromptPay (จำเป็น)" hint="ใส่เบอร์หรือเลขประจำตัวที่ผูกพร้อมเพย์"><input value={promptPay} onChange={(event) => setPromptPay(event.target.value)} maxLength={80} placeholder="เช่น เบอร์มือถือ" required /></Field><Field label="ชื่อธนาคาร (ไม่จำเป็น)" hint="กรอกเมื่ออยากให้เพื่อนโอนเข้าบัญชีธนาคาร"><input value={bankName} onChange={(event) => setBankName(event.target.value)} maxLength={100} placeholder="เช่น กสิกรไทย" /></Field></div>
      <div className="field-grid"><Field label="ชื่อบัญชี (ไม่จำเป็น)"><input value={bankAccountName} onChange={(event) => setBankAccountName(event.target.value)} maxLength={100} placeholder="ชื่อตามบัญชีธนาคาร" /></Field><Field label="เลขบัญชี (ไม่จำเป็น)"><input value={bankAccountNumber} onChange={(event) => setBankAccountNumber(event.target.value)} maxLength={50} placeholder="เลขบัญชีรับเงิน" /></Field></div>
      <Field label="QR รับเงิน (จำเป็น)" hint="ใช้ QR พร้อมเพย์หรือ QR รับเงิน · PNG/JPG/WebP ไม่เกิน 180 KB"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => updateQr(event.target.files?.[0])} required={!qrDataUrl} />{qrDataUrl && <div className="qr-preview"><Image src={qrDataUrl} alt="QR รับเงินของฉัน" width={140} height={140} unoptimized /><button type="button" className="button button-outline button-compact" onClick={() => setQrDataUrl("")}>เปลี่ยน QR</button></div>}</Field>
      {fileError && <small className="field-error">{fileError}</small>}<div className="dialog-actions"><span /><button className="button button-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกโปรไฟล์"}</button></div>
    </form></section>
    <section className="panel payment-directory"><div className="panel-head"><div><p className="eyebrow">PAYMENT DIRECTORY</p><h2>ช่องทางรับเงินของสมาชิก</h2><p className="panel-sub">ข้อมูลส่วนนี้สมาชิกที่เข้ารหัสทริปแล้วมองเห็นได้</p></div><Landmark size={18} /></div><div className="payment-profile-list">{members.map((person) => <article className="payment-profile-card" key={person.id}><div className="payment-profile-head"><Avatar name={person.name} index={members.indexOf(person)} image={person.avatarUrl || person.googleAvatarUrl} /><div><b>{person.name}</b><small>{person.accountId ? "สมาชิกที่ยืนยันตัวตนด้วย Google" : "สมาชิกที่เพิ่มในรายชื่อ"}</small></div></div>{person.promptPay && <div className="payment-detail"><span>PromptPay</span><b>{person.promptPay}</b><button className="icon-button small-icon" onClick={() => void copy(person.promptPay!)} aria-label="คัดลอก PromptPay"><Copy size={14} /></button></div>}{person.bankName && <div className="payment-detail"><span>ธนาคาร</span><b>{person.bankName}</b></div>}{person.bankAccountName && <div className="payment-detail"><span>ชื่อบัญชี</span><b>{person.bankAccountName}</b></div>}{person.bankAccountNumber && <div className="payment-detail"><span>เลขบัญชี</span><b>{person.bankAccountNumber}</b><button className="icon-button small-icon" onClick={() => void copy(person.bankAccountNumber!)} aria-label="คัดลอกเลขบัญชี"><Copy size={14} /></button></div>}{person.qrDataUrl && <Image className="payment-qr" src={person.qrDataUrl} alt={`QR รับเงินของ ${person.name}`} width={150} height={150} unoptimized />}{(!person.promptPay || !person.qrDataUrl) && <p className="payment-empty">ยังเพิ่ม PromptPay หรือ QR รับเงินไม่ครบ</p>}</article>)}</div></section>
  </>;
}

function Plan({ data, onModal, onTogglePacking, onDeletePacking, onDeleteSchedule }: { data: TripData; onModal: (modal: ModalKey) => void; onTogglePacking: (id: string) => void; onDeletePacking: (id: string) => void; onDeleteSchedule: (id: string) => void }) {
  const done = data.packing.filter((item) => item.done).length;
  return <><div className="page-heading"><div><p className="eyebrow">ITINERARY · CHECKLIST</p><h1>แพลนของเรา</h1><p className="heading-sub">ช่วยกันเติมกิจกรรมและลิสต์ของที่ต้องเตรียมก่อนออกเดินทาง</p></div></div>
    <div className="plan-grid"><section className="panel plan-section"><div className="panel-head"><div><p className="eyebrow">ITINERARY</p><h2>กำหนดการ</h2></div><button className="button button-outline button-compact" onClick={() => onModal("schedule")}><Plus size={15} /> เพิ่มเวลา</button></div>{data.schedule.length ? <div className="timeline">{data.schedule.map((item, index) => { const owners = scheduleOwnerNames(data, item); return <div className="timeline-item" key={item.id}><span className="timeline-marker">{index === 0 ? <Compass size={14} /> : <span />}</span><span className="timeline-time"><b>{item.time || "—"}</b><small>{formatScheduleDate(item.date)}</small></span><span className="timeline-copy"><b>{item.title}</b><small>{owners ? `คนดูแล: ${owners}` : "ยังไม่ได้มอบหมายคนดูแล"}</small></span><button className="icon-button small-icon danger-icon" onClick={() => onDeleteSchedule(item.id)} aria-label={`ลบ ${item.title}`}><X size={15} /></button></div>; })}</div> : <EmptyState title="ยังไม่มีตารางเวลา" body="เริ่มจากกำหนดเวลาออกเดินทาง หรือเวลาเช็กอิน" action="เพิ่มกำหนดการ" onClick={() => onModal("schedule")} />}</section>
      <section className="panel plan-section packing-section"><div className="panel-head"><div><p className="eyebrow">PACKING LIST</p><h2>เตรียมไปด้วยกัน</h2></div><button className="button button-outline button-compact" onClick={() => onModal("packing")}><Plus size={15} /> เพิ่มของ</button></div>{data.packing.length ? <><div className="packing-progress"><span><i style={{ width: `${data.packing.length ? done / data.packing.length * 100 : 0}%` }} /></span><small>{done}/{data.packing.length} อย่าง</small></div><div className="packing-list">{data.packing.map((item) => { const assignedNames = item.ownerIds?.length ? item.ownerIds.map((id) => data.members.find((member) => member.id === id)?.name).filter(Boolean).join(", ") : item.owner; return <div className={`packing-row ${item.done ? "is-done" : ""}`} key={item.id}><button className="check-button" onClick={() => onTogglePacking(item.id)} aria-label={item.done ? "ยกเลิกทำเสร็จ" : "ทำเครื่องหมายว่าเตรียมแล้ว"}>{item.done && <Check size={13} />}</button><span><b>{item.title}</b><small>{assignedNames || "ยังไม่มีคนรับผิดชอบ"}</small></span><button className="icon-button small-icon danger-icon" onClick={() => onDeletePacking(item.id)} aria-label={`ลบ ${item.title}`}><X size={15} /></button></div>; })}</div></> : <EmptyState title="เพิ่มของที่ต้องเตรียม" body="เช่น ลำโพง ของใช้ส่วนตัว หรือวัตถุดิบทำอาหาร" action="เพิ่มรายการ" onClick={() => onModal("packing")} />}</section></div>
    <VillaCard villa={data.villa} onEdit={() => onModal("villa")} />
  </>;
}

function EmptyState({ title, body, action, onClick }: { title: string; body: string; action: string; onClick: () => void }) { return <div className="empty-state"><span className="empty-symbol"><Compass size={18} /></span><b>{title}</b><p>{body}</p><button className="text-link" onClick={onClick}>{action} <ArrowUpRight size={14} /></button></div>; }
function Avatar({ name, index, image }: { name: string; index: number; image?: string }) { const tones = ["avatar-peach", "avatar-green", "avatar-lilac", "avatar-blue", "avatar-yellow"]; return <span className={`avatar ${tones[index % tones.length]} ${image ? "avatar-photo" : ""}`}>{image ? <Image src={image} alt={`รูปโปรไฟล์ ${name}`} width={44} height={44} unoptimized /> : name.trim().slice(0, 1).toUpperCase()}</span>; }

function ExpenseDialog({ expense, data, busy, onClose, onSave }: { expense: Expense | null; data: TripData; busy: boolean; onClose: () => void; onSave: (value: Omit<Expense, "id">) => void }) {
  const [title, setTitle] = useState(expense?.title ?? ""); const [amount, setAmount] = useState(expense ? (expense.amount / 100).toFixed(2) : ""); const [category, setCategory] = useState(expense?.category ?? "ทั่วไป"); const [paidBy, setPaidBy] = useState(expense?.paidBy ?? data.members.find((member) => member.role === "organizer")?.id ?? data.members[0]?.id ?? ""); const [date, setDate] = useState(expense?.date ?? today());
  const goingIds = data.members.filter((member) => member.attendance === "going").map((member) => member.id);
  const [participantIds, setParticipantIds] = useState<string[]>(expense?.participantIds ?? goingIds);
  const toggle = (id: string) => setParticipantIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  const allSelected = data.members.length > 0 && data.members.every((member) => participantIds.includes(member.id));
  const toggleAll = () => setParticipantIds(allSelected ? [] : data.members.map((member) => member.id));
  return <Dialog title={expense ? "แก้ไขรายการรายจ่าย" : "เพิ่มรายจ่ายใหม่"} onClose={onClose}><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); const satang = Math.round(Number(amount) * 100); if (!Number.isSafeInteger(satang) || satang <= 0 || !participantIds.length) return; onSave({ title: title.trim(), amount: satang, category, paidBy, participantIds, date }); }}><Field label="รายการ"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="เช่น ค่าที่พัก, ซื้อของเข้าบ้าน" maxLength={120} required autoFocus /></Field><div className="field-grid"><Field label="ยอดเงิน"><div className="input-suffix"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /><span>บาท</span></div></Field><Field label="หมวดหมู่"><select value={category} onChange={(event) => setCategory(event.target.value)}>{["ทั่วไป", "ที่พัก", "อาหาร", "เดินทาง", "กิจกรรม", "ของใช้"].map((item) => <option key={item}>{item}</option>)}</select></Field></div><div className="field-grid"><Field label="คนออกเงินให้ก่อน"><select value={paidBy} onChange={(event) => setPaidBy(event.target.value)} required>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field><Field label="วันที่จ่าย"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field></div><div className="field"><span>คนที่ร่วมจ่าย</span><small>เลือกได้ตามจริง ระบบจะแบ่งยอดเท่ากันระหว่างคนที่เลือก</small><div className="participant-options"><button type="button" onClick={toggleAll} className={`participant-option ${allSelected ? "is-selected" : ""}`} aria-pressed={allSelected}><Users size={17} /><span>ทั้งหมด</span>{allSelected && <Check size={14} />}</button>{data.members.map((member, index) => <button type="button" key={member.id} onClick={() => toggle(member.id)} className={`participant-option ${participantIds.includes(member.id) ? "is-selected" : ""}`} aria-pressed={participantIds.includes(member.id)}><Avatar name={member.name} index={index} image={member.avatarUrl || member.googleAvatarUrl} /><span>{member.name}</span>{participantIds.includes(member.id) && <Check size={14} />}</button>)}</div>{!participantIds.length && <small className="field-error">เลือกผู้ร่วมจ่ายอย่างน้อยหนึ่งคน</small>}</div><div className="dialog-actions"><span />{expense && <span className="form-note">แก้รายการแล้วระบบจะคำนวณยอดใหม่</span>}<button type="button" className="button button-outline" onClick={onClose}>ยกเลิก</button><button className="button button-primary" disabled={busy || !data.members.length}>{busy ? "กำลังบันทึก…" : "บันทึกรายจ่าย"}</button></div>{!data.members.length && <p className="form-note">เพิ่มสมาชิกก่อนบันทึกรายจ่าย</p>}</form></Dialog>;
}

function VillaDialog({ villa, busy, onClose, onSave }: { villa: TripData["villa"]; busy: boolean; onClose: () => void; onSave: (villa: TripData["villa"]) => void }) {
  const [value, setValue] = useState({ ...defaultVilla, ...villa, mapUrl: villa.mapUrl || defaultVilla.mapUrl, phone: villa.phone || defaultVilla.phone });
  const update = (key: keyof typeof villa, text: string) => setValue((current) => ({ ...current, [key]: text }));
  return <Dialog title="ข้อมูลที่พัก" onClose={onClose}><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onSave(value); }}><div className="field"><span>ที่พักของเรา</span><div className="locked-villa"><HouseIcon size={17} /><b>บ้านรมณ์ดี 4 พลูวิลล่าเชียงใหม่</b><small>Chiang Mai</small></div></div><Field label="ที่อยู่"><input value={value.address} onChange={(event) => update("address", event.target.value)} placeholder="เลขที่ ถนน ตำบล อำเภอ" maxLength={300} /></Field><Field label="ลิงก์แผนที่"><input type="url" value={value.mapUrl} onChange={(event) => update("mapUrl", event.target.value)} placeholder="https://maps.app.goo.gl/..." maxLength={300} /></Field><div className="field-grid"><Field label="เบอร์ติดต่อ"><input type="tel" value={value.phone} onChange={(event) => update("phone", event.target.value)} placeholder="เบอร์ที่พัก" maxLength={40} /></Field><Field label="เช็กอิน / เช็กเอาต์"><div className="time-fields"><input value={value.checkIn} onChange={(event) => update("checkIn", event.target.value)} placeholder="เช็กอิน" maxLength={40} /><input value={value.checkOut} onChange={(event) => update("checkOut", event.target.value)} placeholder="เช็กเอาต์" maxLength={40} /></div></Field></div><Field label="หมายเหตุ"><textarea value={value.notes} onChange={(event) => update("notes", event.target.value)} placeholder="กติกาที่พัก, เงินประกัน, สิ่งที่ควรรู้…" rows={3} maxLength={1000} /></Field><div className="dialog-actions"><span /><button type="button" className="button button-outline" onClick={onClose}>ยกเลิก</button><button className="button button-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกข้อมูล"}</button></div></form></Dialog>;
}

function ScheduleDialog({ data, busy, onClose, onSave }: { data: TripData; busy: boolean; onClose: () => void; onSave: (item: Omit<ScheduleItem, "id">) => void }) {
  const [title, setTitle] = useState(""); const [date, setDate] = useState(""); const [time, setTime] = useState(""); const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const toggleOwner = (id: string) => setOwnerIds((current) => current.includes(id) ? current.filter((ownerId) => ownerId !== id) : [...current, id]);
  const allSelected = data.members.length > 0 && data.members.every((member) => ownerIds.includes(member.id));
  const toggleAll = () => setOwnerIds(allSelected ? [] : data.members.map((member) => member.id));
  return <Dialog title="เพิ่มกำหนดการ" onClose={onClose}><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onSave({ title: title.trim(), date, time, ownerIds, owner: data.members.filter((member) => ownerIds.includes(member.id)).map((member) => member.name).join(", ") }); }}><Field label="กิจกรรม"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="เช่น ออกเดินทางจากตัวเมือง" maxLength={160} required autoFocus /></Field><div className="field-grid"><Field label="วันที่"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></Field><Field label="เวลา"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></Field></div><div className="field"><span>คนรับผิดชอบ</span><small>เลือกได้มากกว่า 1 คน หรือเลือกทุกคน</small>{data.members.length ? <div className="participant-options"><button type="button" onClick={toggleAll} className={`participant-option ${allSelected ? "is-selected" : ""}`} aria-pressed={allSelected}><Users size={17} /><span>ทุกคน</span>{allSelected && <Check size={14} />}</button>{data.members.map((member, index) => <button type="button" key={member.id} onClick={() => toggleOwner(member.id)} className={`participant-option ${ownerIds.includes(member.id) ? "is-selected" : ""}`} aria-pressed={ownerIds.includes(member.id)}><Avatar name={member.name} index={index} image={member.avatarUrl || member.googleAvatarUrl} /><span>{member.name}</span>{ownerIds.includes(member.id) && <Check size={14} />}</button>)}</div> : <small>เพิ่มสมาชิกเข้าทริปก่อนเลือกผู้รับผิดชอบ</small>}</div><div className="dialog-actions"><span /><button type="button" className="button button-outline" onClick={onClose}>ยกเลิก</button><button className="button button-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "เพิ่มกำหนดการ"}</button></div></form></Dialog>;
}

function PackingDialog({ data, busy, onClose, onSave }: { data: TripData; busy: boolean; onClose: () => void; onSave: (item: Omit<PackingItem, "id" | "done">) => void }) {
  const [title, setTitle] = useState(""); const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const toggleOwner = (id: string) => setOwnerIds((current) => current.includes(id) ? current.filter((ownerId) => ownerId !== id) : [...current, id]);
  return <Dialog title="เพิ่มของที่ต้องเตรียม" onClose={onClose}><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onSave({ title: title.trim(), ownerIds, owner: data.members.filter((member) => ownerIds.includes(member.id)).map((member) => member.name).join(", ") }); }}><Field label="ของที่ต้องเตรียม"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="เช่น ลำโพง, ผ้าเช็ดตัว" maxLength={160} required autoFocus /></Field><div className="field"><span>คนรับผิดชอบ</span><small>เลือกได้มากกว่า 1 คน</small>{data.members.length ? <div className="participant-options">{data.members.map((member, index) => <button type="button" key={member.id} onClick={() => toggleOwner(member.id)} className={`participant-option ${ownerIds.includes(member.id) ? "is-selected" : ""}`} aria-pressed={ownerIds.includes(member.id)}><Avatar name={member.name} index={index} image={member.avatarUrl || member.googleAvatarUrl} /><span>{member.name}</span>{ownerIds.includes(member.id) && <Check size={14} />}</button>)}</div> : <small>เพิ่มสมาชิกเข้าทริปก่อนเลือกผู้รับผิดชอบ</small>}</div><div className="dialog-actions"><span /><button type="button" className="button button-outline" onClick={onClose}>ยกเลิก</button><button className="button button-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "เพิ่มรายการ"}</button></div></form></Dialog>;
}

export default function Home() { return <TripApp />; }
