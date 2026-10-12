"use client";

import {
  ArrowDownLeft, ArrowUpRight, CalendarDays, Check, CheckCircle2, ChevronRight, CircleHelp,
  ClipboardList, Clock3, Compass, Home as HouseIcon, LogOut, MapPin, Plus, ReceiptText,
  Settings2, ShieldCheck, Users, Wallet, X,
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Attendance, calculateBalances, Expense, formatBaht, initialTripData, Member,
  PackingItem, ScheduleItem, suggestPayments, TripData,
} from "@/lib/trip";

type PageKey = "home" | "people" | "money" | "plan";
type ModalKey = "person" | "expense" | "villa" | "schedule" | "packing" | null;
type SavedTrip = { data: TripData; version: number };
type Account = { id: string; name: string; email?: string };

const navItems: { key: PageKey; label: string; icon: typeof HouseIcon }[] = [
  { key: "home", label: "ภาพรวม", icon: HouseIcon },
  { key: "people", label: "สมาชิก", icon: Users },
  { key: "money", label: "บัญชีทริป", icon: Wallet },
  { key: "plan", label: "แพลนทริป", icon: ClipboardList },
];

function makeId() { return crypto.randomUUID(); }
function today() { return new Date().toISOString().slice(0, 10); }
function memberName(data: TripData, id: string) { return data.members.find((person) => person.id === id)?.name ?? "สมาชิกที่ถูกลบ"; }
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

function TripApp() {
  const [account, setAccount] = useState<Account | null>(null);
  const [tripAuthenticated, setTripAuthenticated] = useState(false);
  const [loginCode, setLoginCode] = useState("");
  const [data, setData] = useState<TripData>(initialTripData);
  const [version, setVersion] = useState(0);
  const [activePage, setActivePage] = useState<PageKey>("home");
  const [modal, setModal] = useState<ModalKey>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
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
    if (authError) {
      const messages: Record<string, string> = {
        google_not_configured: "Google Login ยังตั้งค่าไม่ครบ กรุณาติดต่อผู้จัดทริป",
        google_login_cancelled: "ยกเลิกการเข้าสู่ระบบ Google แล้ว",
        google_email_unverified: "บัญชี Google นี้ยังไม่ยืนยันอีเมล",
        google_login_failed: "เข้าสู่ระบบ Google ไม่สำเร็จ ลองอีกครั้งนะ",
      };
      setError(messages[authError] ?? messages.google_login_failed);
      window.history.replaceState({}, "", window.location.pathname);
    }
    fetch("/api/auth", { cache: "no-store" }).then((response) => response.json() as Promise<{ account: Account | null; tripAuthenticated: boolean }>).then(async (result) => {
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
      setData(result.data); setVersion(result.version); setNotice(successMessage); setModal(null); setEditingMember(null); setEditingExpense(null);
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

  const logout = async () => { await fetch("/api/auth", { method: "DELETE" }); setAccount(null); setTripAuthenticated(false); setActivePage("home"); };
  const balances = useMemo(() => calculateBalances(data), [data]);
  const payments = useMemo(() => suggestPayments(balances), [balances]);
  const totalCost = data.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const confirmed = data.members.filter((person) => person.attendance === "going");
  const outstanding = balances.reduce((sum, balance) => sum + Math.max(0, -balance.amount), 0);
  const pageLabel = navItems.find((item) => item.key === activePage)?.label ?? "ภาพรวม";

  if (checking) return <main className="loading-screen"><span className="brand-mark"><Compass size={20} /></span><p>กำลังเปิดทริปของเรา…</p></main>;
  if (!account) return <main className="login-screen"><section className="login-card">
    <span className="brand-mark"><Compass size={20} /></span><p className="eyebrow">TRIP SPACE · CHIANG MAI</p>
    <h1>เข้าสู่ระบบทริป</h1><p className="login-copy">ใช้บัญชี Google เพื่อยืนยันตัวตน แล้วใส่รหัสทริปของกลุ่มในขั้นตอนถัดไป</p>
    <a className="google-login-button" href="/api/auth/google"><span className="google-g" aria-hidden="true">G</span><span>เข้าสู่ระบบด้วย Google</span><ChevronRight size={17} /></a>
    {error && <p className="error-note" role="alert">{error}</p>}<p className="login-foot"><ShieldCheck size={15} /> เราใช้ข้อมูลบัญชี Google เพื่อยืนยันชื่อและอีเมลเท่านั้น</p>
  </section><p className="login-caption">บ้านรมณ์ดี 4 พลูวิลล่าเชียงใหม่ · 1–2 พ.ย. 2026</p></main>;
  if (!tripAuthenticated) return <main className="login-screen"><section className="login-card">
    <span className="brand-mark"><Compass size={20} /></span><p className="eyebrow">สวัสดี {account.name} · STEP 2 OF 2</p>
    <h1>ใส่รหัสทริป</h1><p className="login-copy">บัญชีของคุณพร้อมแล้ว ใส่รหัสที่เพื่อนแชร์ให้เพื่อเปิดข้อมูลทริป</p>
    <form onSubmit={enterTrip} className="login-form"><Field label="รหัสทริป"><input autoComplete="one-time-code" autoFocus value={loginCode} onChange={(event) => setLoginCode(event.target.value)} placeholder="เช่น ABCD-1234" required /></Field><button className="button button-primary button-wide" disabled={busy}>{busy ? "กำลังตรวจสอบ…" : "เข้าไปที่ทริป"}<ChevronRight size={17} /></button></form>
    {error && <p className="error-note" role="alert">{error}</p>}<button className="auth-switch" onClick={logout}>ออกจากบัญชี</button><p className="login-foot"><ShieldCheck size={15} /> รหัสทริปช่วยจำกัดการเข้าถึงข้อมูลของกลุ่ม</p>
  </section><p className="login-caption">บ้านรมณ์ดี 4 พลูวิลล่าเชียงใหม่ · 1–2 พ.ย. 2026</p></main>;

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand-lockup"><span className="brand-mark"><Compass size={19} /></span><div><b>ทริปของเรา</b><small>CHIANG MAI · 2026</small></div></div>
      <div className="trip-switcher"><span className="trip-thumb"><HouseIcon size={18} /></span><div><small>กำลังวางแผน</small><b>Pool villa trip</b></div><span className="trip-dot" /></div>
      <p className="side-caption">WORKSPACE</p>
      <nav className="side-nav" aria-label="เมนูหลัก">{navItems.map(({ key, label, icon: Icon }) => <button key={key} className={`nav-link ${activePage === key ? "selected" : ""}`} onClick={() => setActivePage(key)}><Icon size={17} /><span>{label}</span>{key === "people" && <small>{data.members.length}</small>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="secure-card"><ShieldCheck size={16} /><span><b>พื้นที่ส่วนตัวของกลุ่ม</b><small>เข้าด้วยรหัสทริป</small></span></div><button className="nav-link logout-link" onClick={logout}><LogOut size={17} /><span>ออกจากทริป</span></button><div className="profile-chip"><span className="avatar avatar-you">{account.name.slice(0, 1)}</span><span><b>{account.name}</b><small>{account.email ?? "บัญชี Google"}</small></span><Settings2 size={16} /></div></div>
    </aside>

    <section className="main-column">
      <header className="topbar"><div className="mobile-brand"><span className="brand-mark"><Compass size={17} /></span><b>ทริปของเรา</b></div><div className="breadcrumbs"><span>Trip space</span><ChevronRight size={14} /><b>{pageLabel}</b></div><div className="top-actions"><span className="live-pill"><i /> ข้อมูลกลุ่ม</span><button className="avatar avatar-you avatar-button" title="ออกจากทริป" onClick={logout}>{account.name.slice(0, 1)}</button></div></header>
      <div className="page-content">
        {activePage === "home" && <Overview data={data} confirmed={confirmed.length} totalCost={totalCost} outstanding={outstanding} payments={payments} balances={balances} onNavigate={setActivePage} onModal={setModal} onPay={(payment) => save((current) => ({ ...current, repayments: [...current.repayments, { ...payment, id: makeId(), date: today() }] }), "บันทึกการคืนเงินแล้ว")} />}
        {activePage === "people" && <People data={data} balances={balances} onAdd={() => { setEditingMember(null); setModal("person"); }} onEdit={(person) => { setEditingMember(person); setModal("person"); }} onStatus={(id, attendance) => save((current) => ({ ...current, members: current.members.map((person) => person.id === id ? { ...person, attendance } : person) }))} />}
        {activePage === "money" && <Money data={data} balances={balances} payments={payments} totalCost={totalCost} onAdd={() => { setEditingExpense(null); setModal("expense"); }} onEdit={(expense) => { setEditingExpense(expense); setModal("expense"); }} onPay={(payment) => save((current) => ({ ...current, repayments: [...current.repayments, { ...payment, id: makeId(), date: today() }] }), "บันทึกการคืนเงินแล้ว")} onDelete={(id) => save((current) => ({ ...current, expenses: current.expenses.filter((expense) => expense.id !== id) }), "ลบรายการแล้ว")} />}
        {activePage === "plan" && <Plan data={data} onModal={setModal} onTogglePacking={(id) => save((current) => ({ ...current, packing: current.packing.map((item) => item.id === id ? { ...item, done: !item.done } : item) }))} onDeletePacking={(id) => save((current) => ({ ...current, packing: current.packing.filter((item) => item.id !== id) }), "ลบรายการแล้ว")} onDeleteSchedule={(id) => save((current) => ({ ...current, schedule: current.schedule.filter((item) => item.id !== id) }), "ลบกำหนดการแล้ว")} />}
      </div>
      <footer className="page-footer"><span>ทริปบ้านรมณ์ดี · ข้อมูลบันทึกร่วมกัน</span><span>เชียงใหม่ <span className="footer-dot">✳</span> 01—02 พ.ย. 2026</span></footer>
    </section>

    <nav className="mobile-nav" aria-label="เมนู"><span>{navItems.map(({ key, label, icon: Icon }) => <button key={key} className={activePage === key ? "active" : ""} onClick={() => setActivePage(key)}><Icon size={19} /><small>{label}</small></button>)}</span></nav>
    {notice && <div className="toast" role="status"><CheckCircle2 size={17} />{notice}</div>}
    {error && <div className="toast toast-error" role="alert"><CircleHelp size={17} />{error}<button onClick={() => setError("")} aria-label="ปิด"><X size={15} /></button></div>}

    {modal === "person" && <PersonDialog person={editingMember} busy={busy} data={data} onClose={() => { setModal(null); setEditingMember(null); }} onSave={(person) => save((current) => ({ ...current, members: editingMember ? current.members.map((item) => item.id === editingMember.id ? { ...item, ...person } : item) : [...current.members, { ...person, id: makeId() }] }), editingMember ? "อัปเดตสมาชิกแล้ว" : "เพิ่มสมาชิกแล้ว")} onDelete={editingMember ? () => save((current) => ({ ...current, members: current.members.filter((item) => item.id !== editingMember.id) }), "ลบสมาชิกแล้ว") : undefined} />}
    {modal === "expense" && <ExpenseDialog expense={editingExpense} data={data} busy={busy} onClose={() => { setModal(null); setEditingExpense(null); }} onSave={(expense) => save((current) => ({ ...current, expenses: editingExpense ? current.expenses.map((item) => item.id === editingExpense.id ? { ...expense, id: item.id } : item) : [...current.expenses, { ...expense, id: makeId() }] }), editingExpense ? "อัปเดตรายจ่ายแล้ว" : "เพิ่มรายจ่ายแล้ว")} />}
    {modal === "villa" && <VillaDialog villa={data.villa} busy={busy} onClose={() => setModal(null)} onSave={(villa) => save((current) => ({ ...current, villa }), "บันทึกข้อมูลที่พักแล้ว")} />}
    {modal === "schedule" && <ScheduleDialog data={data} busy={busy} onClose={() => setModal(null)} onSave={(item) => save((current) => ({ ...current, schedule: [...current.schedule, { ...item, id: makeId() }].sort((a, b) => a.time.localeCompare(b.time)) }), "เพิ่มกำหนดการแล้ว")} />}
    {modal === "packing" && <PackingDialog busy={busy} onClose={() => setModal(null)} onSave={(item) => save((current) => ({ ...current, packing: [...current.packing, { ...item, id: makeId(), done: false }] }), "เพิ่มรายการเตรียมของแล้ว")} />}
  </main>;
}

function Overview({ data, confirmed, totalCost, outstanding, payments, balances, onNavigate, onModal, onPay }: {
  data: TripData; confirmed: number; totalCost: number; outstanding: number; balances: ReturnType<typeof calculateBalances>; payments: ReturnType<typeof suggestPayments>;
  onNavigate: (page: PageKey) => void; onModal: (modal: ModalKey) => void; onPay: (payment: ReturnType<typeof suggestPayments>[number]) => void;
}) {
  const going = data.members.filter((person) => person.attendance === "going");
  return <>
    <div className="page-heading"><div><p className="eyebrow">FRIENDS GETAWAY <span>·</span> CHIANG MAI</p><h1>ทริปเชียงใหม่ <span className="heading-sparkle">✳</span></h1><p className="heading-sub">วางแผนวันพักผ่อนของพวกเราให้พร้อมก่อนออกเดินทาง</p></div><button className="button button-primary" onClick={() => onModal("person")}><Plus size={17} /> เพิ่มสมาชิก</button></div>
    <div className="trip-banner"><div className="banner-copy"><span className="date-chip"><CalendarDays size={14} /> 1—2 พฤศจิกายน 2026</span><h2>ถึงเวลาพักผ่อน<br />ให้เต็มที่กันแล้ว</h2><p>เชียงใหม่ · ทริปพูลวิลล่ากับเพื่อน</p><div className="banner-bottom"><span><i /> {confirmed} คนยืนยันแล้ว</span><button onClick={() => onNavigate("people")}>ดูสมาชิก <ArrowUpRight size={14} /></button></div></div><div className="banner-art" aria-hidden="true"><div className="sun-disc"/><div className="mountain mountain-back"/><div className="mountain mountain-front"/><div className="pool-water"/><div className="villa-shape"><span/><i/><b/></div><div className="palm palm-one"><i/><b/></div><div className="palm palm-two"><i/><b/></div><span className="art-label">SLOW DAYS<br /><b>IN CHIANG MAI</b></span></div></div>
    <div className="metric-grid"><Metric label="ยืนยันไปแล้ว" value={`${confirmed} คน`} icon={<Users size={18} />} detail={`${data.members.length} คนในกลุ่ม`} tone="lavender" /><Metric label="ค่าใช้จ่ายรวม" value={formatBaht(totalCost)} icon={<ReceiptText size={18} />} detail={`${data.expenses.length} รายการ`} tone="peach" /><Metric label="ยอดรอเคลียร์" value={formatBaht(outstanding)} icon={<Wallet size={18} />} detail={payments.length ? `${payments.length} รายการคืนเงิน` : "เคลียร์ครบแล้ว"} tone="mint" /></div>
    <div className="overview-grid"><section className="panel member-panel"><div className="panel-head"><div><p className="eyebrow">THE CREW</p><h2>เพื่อนร่วมทริป <span className="count-bubble">{data.members.length}</span></h2></div><button className="text-link" onClick={() => onNavigate("people")}>ดูทั้งหมด <ChevronRight size={15} /></button></div>
      {data.members.length ? <div className="crew-list">{data.members.slice(0, 4).map((person, index) => <div className="crew-row" key={person.id}><Avatar name={person.name} index={index} /><span className="crew-name"><b>{person.name}</b><small>{person.role === "organizer" ? "ผู้จัดทริป" : "สมาชิก"}</small></span><span className={`status-pill ${statusClass(person.attendance)}`}><i />{statusText(person.attendance)}</span></div>)}</div> : <EmptyState title="ยังไม่มีสมาชิกในทริป" body="เพิ่มชื่อเพื่อน แล้วชวนทุกคนเข้ามายืนยันกันได้เลย" action="เพิ่มเพื่อน" onClick={() => onModal("person")} />}
    </section><VillaCard villa={data.villa} onEdit={() => onModal("villa")} /></div>
    <div className="overview-grid lower-grid"><section className="panel settle-panel"><div className="panel-head"><div><p className="eyebrow">SETTLEMENT</p><h2>เคลียร์เงินกัน</h2></div><button className="round-link" onClick={() => onNavigate("money")} aria-label="ดูบัญชีทริป"><ArrowUpRight size={16} /></button></div>
      {payments.length ? <div className="settle-list">{payments.slice(0, 3).map((payment, index) => <div className="settle-row" key={`${payment.from}-${payment.to}-${index}`}><div className="settle-people"><span className="mini-avatar debtor">{memberName(data, payment.from).slice(0, 1)}</span><ArrowDownLeft size={14} /><span className="mini-avatar creditor">{memberName(data, payment.to).slice(0, 1)}</span><span><b>{memberName(data, payment.from)}</b><small>คืนให้ {memberName(data, payment.to)}</small></span></div><div className="settle-amount"><b>{formatBaht(payment.amount)}</b><button onClick={() => onPay(payment)}>ทำเครื่องหมายว่าคืนแล้ว</button></div></div>)}</div> : <div className="clear-state"><span><Check size={18} /></span><div><b>ไม่มีรายการค้างชำระ</b><small>เพิ่มรายจ่ายแล้วระบบจะช่วยคำนวณให้</small></div></div>}
    </section><section className="panel agenda-panel"><div className="panel-head"><div><p className="eyebrow">UP NEXT</p><h2>แพลนเล็ก ๆ</h2></div><button className="text-link" onClick={() => onNavigate("plan")}>ดูแพลน <ChevronRight size={15} /></button></div>{data.schedule.length ? data.schedule.slice(0, 3).map((item) => <div className="agenda-row" key={item.id}><span className="agenda-time">{item.time || "—"}</span><span><b>{item.title}</b><small>{item.owner || "ยังไม่มีผู้รับผิดชอบ"}</small></span></div>) : <EmptyState title="ยังไม่มีแพลน" body="เติมช่วงเวลาออกเดินทางหรือกิจกรรมแรกของทริป" action="เพิ่มแพลน" onClick={() => onModal("schedule")} />}</section></div>
  </>;
}

function Metric({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: ReactNode; tone: string }) {
  return <article className="metric-card"><span className={`metric-icon ${tone}`}>{icon}</span><span className="metric-label">{label}</span><b className="metric-value">{value}</b><small>{detail}</small></article>;
}

function VillaCard({ villa, onEdit }: { villa: TripData["villa"]; onEdit: () => void }) {
  return <section className="villa-card"><div className="villa-cover"><span className="villa-kicker"><MapPin size={13} /> STAY IN CHIANG MAI</span><span className="villa-orb"/><span className="villa-hills hills-back"/><span className="villa-hills hills-front"/><span className="villa-pool"/><span className="villa-building"><i/><i/><i/></span><span className="villa-palm"/></div><div className="villa-info"><div><p className="eyebrow">OUR STAY</p><h2>บ้านรมณ์ดี 4 <span>พลูวิลล่าเชียงใหม่</span></h2><p className="villa-sub">Chiang Mai · Pool villa</p></div><button className="icon-button" onClick={onEdit} aria-label="แก้ไขข้อมูลที่พัก"><Settings2 size={17} /></button></div><div className="villa-details"><div><Clock3 size={15} /><span><b>{villa.checkIn || "ยังไม่ระบุ"}</b><small>เช็กอิน</small></span></div><div><Clock3 size={15} /><span><b>{villa.checkOut || "ยังไม่ระบุ"}</b><small>เช็กเอาต์</small></span></div></div><div className="villa-bottom">{villa.address ? <span><MapPin size={14} />{villa.address}</span> : <span className="muted-location"><MapPin size={14} />เพิ่มที่อยู่หรือพิกัดไว้ที่นี่</span>}{villa.mapUrl ? <a href={villa.mapUrl} target="_blank" rel="noreferrer">เปิดแผนที่ <ArrowUpRight size={13} /></a> : <button onClick={onEdit}>เพิ่มข้อมูลที่พัก <ChevronRight size={14} /></button>}</div></section>;
}

function People({ data, balances, onAdd, onEdit, onStatus }: { data: TripData; balances: ReturnType<typeof calculateBalances>; onAdd: () => void; onEdit: (person: Member) => void; onStatus: (id: string, status: Attendance) => void }) {
  const groups: { status: Attendance; label: string }[] = [{ status: "going", label: "ไปแน่นอน" }, { status: "pending", label: "รอตอบ" }, { status: "not-going", label: "ไม่ไป" }];
  return <><div className="page-heading"><div><p className="eyebrow">THE CREW · {data.members.length} MEMBERS</p><h1>สมาชิกทริป</h1><p className="heading-sub">เช็กชื่อ บทบาท และสถานะของทุกคนก่อนออกเดินทาง</p></div><button className="button button-primary" onClick={onAdd}><Plus size={17} /> เพิ่มสมาชิก</button></div>
    <div className="people-summary"><div><b>{data.members.filter((person) => person.attendance === "going").length}</b><span>ยืนยันไป</span></div><div><b>{data.members.filter((person) => person.attendance === "pending").length}</b><span>รอตอบ</span></div><div><b>{data.members.filter((person) => person.role === "organizer").length}</b><span>ผู้จัดทริป</span></div><div className="summary-note"><Users size={17} /><span>สมาชิกทุกคนแก้ข้อมูลและยืนยันสถานะได้</span></div></div>
    {!data.members.length ? <section className="panel empty-large"><EmptyState title="เริ่มชวนเพื่อนเข้าทริป" body="เพิ่มสมาชิกในกลุ่ม แล้วให้ทุกคนอัปเดตว่าไปหรือไม่ไป" action="เพิ่มสมาชิก" onClick={onAdd} /></section> : groups.map((group) => { const members = data.members.filter((person) => person.attendance === group.status); return members.length ? <section className="panel people-group" key={group.status}><div className="panel-head"><div><p className="eyebrow">{group.status === "going" ? "CONFIRMED" : group.status === "pending" ? "AWAITING" : "NOT JOINING"}</p><h2>{group.label} <span className="count-bubble">{members.length}</span></h2></div></div><div className="people-table"><div className="table-heading"><span>ชื่อสมาชิก</span><span>บทบาท</span><span>สถานะ</span><span>ยอดสุทธิ</span><span /></div>{members.map((person, index) => { const net = balances.find((balance) => balance.memberId === person.id)?.amount ?? 0; return <div className="person-table-row" key={person.id}><span className="person-identity"><Avatar name={person.name} index={index} /><b>{person.name}</b>{person.role === "organizer" && <span className="organizer-tag">ผู้จัดทริป</span>}</span><span className="role-text">{person.role === "organizer" ? "ผู้จัดทริป" : "สมาชิก"}</span><span><select className={`status-select ${statusClass(person.attendance)}`} value={person.attendance} aria-label={`สถานะของ ${person.name}`} onChange={(event) => onStatus(person.id, event.target.value as Attendance)}><option value="pending">รอตอบ</option><option value="going">ไป</option><option value="not-going">ไม่ไป</option></select></span><span className={net > 0 ? "positive-money" : net < 0 ? "negative-money" : "muted-money"}>{net ? `${net > 0 ? "+" : "−"}${formatBaht(Math.abs(net))}` : "—"}</span><button className="icon-button small-icon" aria-label={`แก้ไข ${person.name}`} onClick={() => onEdit(person)}><Settings2 size={16} /></button></div>; })}</div></section> : null; })}
    <div className="info-strip"><ShieldCheck size={16} /><span>สถานะ “ไปแน่นอน” จะถูกนำไปใช้เป็นค่าเริ่มต้นในการหารค่าใช้จ่ายส่วนกลาง</span></div>
  </>;
}

function Money({ data, balances, payments, totalCost, onAdd, onEdit, onPay, onDelete }: { data: TripData; balances: ReturnType<typeof calculateBalances>; payments: ReturnType<typeof suggestPayments>; totalCost: number; onAdd: () => void; onEdit: (expense: Expense) => void; onPay: (payment: ReturnType<typeof suggestPayments>[number]) => void; onDelete: (id: string) => void }) {
  const payers = new Set(data.expenses.map((expense) => expense.paidBy));
  return <><div className="page-heading"><div><p className="eyebrow">SHARED EXPENSES · {data.expenses.length} ITEMS</p><h1>บัญชีทริป</h1><p className="heading-sub">แยกคนสำรองจ่าย คนร่วมจ่าย และยอดที่ต้องคืนให้ชัดเจน</p></div><button className="button button-primary" onClick={onAdd}><Plus size={17} /> เพิ่มรายจ่าย</button></div>
    <div className="money-summary"><Metric label="ค่าใช้จ่ายรวม" value={formatBaht(totalCost)} icon={<ReceiptText size={18} />} detail="ยอดที่บันทึกทั้งหมด" tone="peach" /><Metric label="ยังต้องคืน" value={formatBaht(payments.reduce((sum, payment) => sum + payment.amount, 0))} icon={<ArrowDownLeft size={18} />} detail={`${payments.length} รายการชำระ`} tone="mint" /><Metric label="คนที่สำรองจ่าย" value={`${payers.size} คน`} icon={<Wallet size={18} />} detail="ผู้จ่ายล่วงหน้า" tone="lavender" /></div>
    <section className="panel settlement-full"><div className="panel-head"><div><p className="eyebrow">SETTLEMENT</p><h2>สรุปยอดที่ต้องคืน</h2><p className="panel-sub">ยอดสุทธิคำนวณจากรายจ่ายและการคืนเงินที่บันทึกแล้ว</p></div><span className="auto-tag"><CheckCircle2 size={14} /> คำนวณให้อัตโนมัติ</span></div>{payments.length ? <div className="settlement-table">{payments.map((payment, index) => <div className="settlement-line" key={`${payment.from}-${payment.to}-${index}`}><span className="direction-person"><Avatar name={memberName(data, payment.from)} index={index} /><span><small>ลูกหนี้</small><b>{memberName(data, payment.from)}</b></span></span><span className="payment-arrow"><i/><ArrowUpRight size={16} /><i/></span><span className="direction-person"><Avatar name={memberName(data, payment.to)} index={index + 1} /><span><small>เจ้าหนี้ · ผู้สำรองจ่าย</small><b>{memberName(data, payment.to)}</b></span></span><b className="payment-total">{formatBaht(payment.amount)}</b><button className="button button-outline button-compact" onClick={() => onPay(payment)}><Check size={15} /> คืนเงินแล้ว</button></div>)}</div> : <div className="clear-state"><span><Check size={18} /></span><div><b>ไม่มีรายการค้างชำระ</b><small>ยอดของทุกคนเคลียร์ครบแล้ว</small></div></div>}</section>
    <section className="panel expenses-panel"><div className="panel-head"><div><p className="eyebrow">EXPENSE LOG</p><h2>รายการค่าใช้จ่าย <span className="count-bubble">{data.expenses.length}</span></h2></div></div>{data.expenses.length ? <div className="expense-list">{[...data.expenses].sort((a, b) => b.date.localeCompare(a.date)).map((expense) => <article className="expense-row" key={expense.id}><span className="expense-icon"><ReceiptText size={18} /></span><span className="expense-description"><b>{expense.title}</b><small>{expense.category || "ทั่วไป"} <i>·</i> {expense.date ? new Date(`${expense.date}T00:00:00`).toLocaleDateString("th-TH", { day: "numeric", month: "short" }) : "ไม่ระบุวันที่"} <i>·</i> หาร {expense.participantIds.length} คน</small></span><span className="expense-payer"><small>ออกให้ก่อนโดย</small><b>{memberName(data, expense.paidBy)}</b></span><b className="expense-amount">{formatBaht(expense.amount)}</b><span className="expense-actions"><button className="icon-button small-icon" onClick={() => onEdit(expense)} aria-label={`แก้ไข ${expense.title}`}><Settings2 size={15} /></button><button className="icon-button small-icon danger-icon" onClick={() => { if (window.confirm(`ลบรายการ “${expense.title}” ใช่ไหม?`)) onDelete(expense.id); }} aria-label={`ลบ ${expense.title}`}><X size={15} /></button></span></article>)}</div> : <EmptyState title="ยังไม่มีรายการรายจ่าย" body="เพิ่มเงินค่าที่พัก อาหาร หรือของที่ซื้อเข้ากลุ่มได้เลย" action="เพิ่มรายจ่าย" onClick={onAdd} />}</section>
    {data.repayments.length > 0 && <section className="panel repayment-panel"><div className="panel-head"><div><p className="eyebrow">PAYMENT HISTORY</p><h2>คืนเงินแล้ว <span className="count-bubble">{data.repayments.length}</span></h2></div></div><div className="repayment-list">{[...data.repayments].reverse().map((repayment) => <div key={repayment.id}><span className="paid-check"><Check size={13} /></span><span><b>{memberName(data, repayment.from)}</b> คืนให้ <b>{memberName(data, repayment.to)}</b><small>{repayment.date}</small></span><strong>{formatBaht(repayment.amount)}</strong></div>)}</div></section>}
    <section className="balance-footnote"><span className="info-icon"><CircleHelp size={16} /></span><p><b>วิธีคำนวณ</b><br />ยอดแต่ละรายการแบ่งเท่ากันตามรายชื่อผู้ร่วมจ่าย คนสำรองจ่ายรับยอดคืนตามส่วนที่จ่ายเกินมา สมาชิกที่ยืนยันไปจะถูกเลือกให้อัตโนมัติเมื่อเพิ่มรายการ</p></section>
  </>;
}

function Plan({ data, onModal, onTogglePacking, onDeletePacking, onDeleteSchedule }: { data: TripData; onModal: (modal: ModalKey) => void; onTogglePacking: (id: string) => void; onDeletePacking: (id: string) => void; onDeleteSchedule: (id: string) => void }) {
  const done = data.packing.filter((item) => item.done).length;
  return <><div className="page-heading"><div><p className="eyebrow">ITINERARY · CHECKLIST</p><h1>แพลนทริป</h1><p className="heading-sub">จัดเวลาและแบ่งกันเตรียมของก่อนออกเดินทาง</p></div></div>
    <div className="plan-grid"><section className="panel plan-section"><div className="panel-head"><div><p className="eyebrow">ITINERARY</p><h2>กำหนดการ</h2></div><button className="button button-outline button-compact" onClick={() => onModal("schedule")}><Plus size={15} /> เพิ่มเวลา</button></div>{data.schedule.length ? <div className="timeline">{data.schedule.map((item, index) => <div className="timeline-item" key={item.id}><span className="timeline-marker">{index === 0 ? <Compass size={14} /> : <span/>}</span><span className="timeline-time">{item.time || "—"}</span><span className="timeline-copy"><b>{item.title}</b><small>{item.owner ? `คนดูแล: ${item.owner}` : "ยังไม่ได้มอบหมายคนดูแล"}</small></span><button className="icon-button small-icon danger-icon" onClick={() => onDeleteSchedule(item.id)} aria-label={`ลบ ${item.title}`}><X size={15} /></button></div>)}</div> : <EmptyState title="ยังไม่มีตารางเวลา" body="เริ่มจากกำหนดเวลาออกเดินทาง หรือเวลาเช็กอิน" action="เพิ่มกำหนดการ" onClick={() => onModal("schedule")} />}</section>
    <section className="panel plan-section packing-section"><div className="panel-head"><div><p className="eyebrow">PACKING LIST</p><h2>เตรียมไปด้วยกัน</h2></div><button className="button button-outline button-compact" onClick={() => onModal("packing")}><Plus size={15} /> เพิ่มของ</button></div>{data.packing.length ? <><div className="packing-progress"><span><i style={{ width: `${data.packing.length ? done / data.packing.length * 100 : 0}%` }}/></span><small>{done}/{data.packing.length} อย่าง</small></div><div className="packing-list">{data.packing.map((item) => <div className={`packing-row ${item.done ? "is-done" : ""}`} key={item.id}><button className="check-button" onClick={() => onTogglePacking(item.id)} aria-label={item.done ? "ยกเลิกทำเสร็จ" : "ทำเครื่องหมายว่าเตรียมแล้ว"}>{item.done && <Check size={13} />}</button><span><b>{item.title}</b><small>{item.owner || "ยังไม่มีคนรับผิดชอบ"}</small></span><button className="icon-button small-icon danger-icon" onClick={() => onDeletePacking(item.id)} aria-label={`ลบ ${item.title}`}><X size={15} /></button></div>)}</div></> : <EmptyState title="เพิ่มของที่ต้องเตรียม" body="เช่น ลำโพง ของใช้ส่วนตัว หรือวัตถุดิบทำอาหาร" action="เพิ่มรายการ" onClick={() => onModal("packing")} />}</section></div>
    <VillaCard villa={data.villa} onEdit={() => onModal("villa")} />
  </>;
}

function EmptyState({ title, body, action, onClick }: { title: string; body: string; action: string; onClick: () => void }) { return <div className="empty-state"><span className="empty-symbol"><Compass size={18} /></span><b>{title}</b><p>{body}</p><button className="text-link" onClick={onClick}>{action} <ArrowUpRight size={14} /></button></div>; }
function Avatar({ name, index }: { name: string; index: number }) { const tones = ["avatar-peach", "avatar-green", "avatar-lilac", "avatar-blue", "avatar-yellow"]; return <span className={`avatar ${tones[index % tones.length]}`}>{name.trim().slice(0, 1).toUpperCase()}</span>; }

function PersonDialog({ person, busy, data, onClose, onSave, onDelete }: { person: Member | null; busy: boolean; data: TripData; onClose: () => void; onSave: (value: Omit<Member, "id">) => void; onDelete?: () => void }) {
  const [name, setName] = useState(person?.name ?? ""); const [role, setRole] = useState<Member["role"]>(person?.role ?? "member"); const [attendance, setAttendance] = useState<Attendance>(person?.attendance ?? "pending");
  const hasFinancialHistory = !!person && (data.expenses.some((expense) => expense.paidBy === person.id || expense.participantIds.includes(person.id)) || data.repayments.some((repayment) => repayment.from === person.id || repayment.to === person.id));
  return <Dialog title={person ? "แก้ไขสมาชิก" : "เพิ่มสมาชิกใหม่"} onClose={onClose}><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onSave({ name: name.trim(), role, attendance }); }}><Field label="ชื่อที่ใช้เรียก"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="เช่น มีน" maxLength={80} required autoFocus /></Field><div className="field-grid"><Field label="บทบาท"><select value={role} onChange={(event) => setRole(event.target.value as Member["role"])}><option value="member">สมาชิก</option><option value="organizer">ผู้จัดทริป</option></select></Field><Field label="สถานะการเดินทาง"><select value={attendance} onChange={(event) => setAttendance(event.target.value as Attendance)}><option value="pending">รอตอบ</option><option value="going">ไปแน่นอน</option><option value="not-going">ไม่ไป</option></select></Field></div>{hasFinancialHistory && <p className="form-note">สมาชิกคนนี้มีประวัติค่าใช้จ่ายหรือคืนเงิน จึงลบไม่ได้เพื่อรักษายอดบัญชี</p>}<div className="dialog-actions">{onDelete && <button type="button" className="button button-danger-quiet" disabled={busy || hasFinancialHistory} onClick={onDelete}>ลบสมาชิก</button>}<span/><button type="button" className="button button-outline" onClick={onClose}>ยกเลิก</button><button className="button button-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกสมาชิก"}</button></div></form></Dialog>;
}

function ExpenseDialog({ expense, data, busy, onClose, onSave }: { expense: Expense | null; data: TripData; busy: boolean; onClose: () => void; onSave: (value: Omit<Expense, "id">) => void }) {
  const [title, setTitle] = useState(expense?.title ?? ""); const [amount, setAmount] = useState(expense ? (expense.amount / 100).toFixed(2) : ""); const [category, setCategory] = useState(expense?.category ?? "ทั่วไป"); const [paidBy, setPaidBy] = useState(expense?.paidBy ?? data.members.find((member) => member.role === "organizer")?.id ?? data.members[0]?.id ?? ""); const [date, setDate] = useState(expense?.date ?? today());
  const goingIds = data.members.filter((member) => member.attendance === "going").map((member) => member.id);
  const [participantIds, setParticipantIds] = useState<string[]>(expense?.participantIds ?? goingIds);
  const toggle = (id: string) => setParticipantIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  return <Dialog title={expense ? "แก้ไขรายการรายจ่าย" : "เพิ่มรายจ่ายใหม่"} onClose={onClose}><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); const satang = Math.round(Number(amount) * 100); if (!Number.isSafeInteger(satang) || satang <= 0 || !participantIds.length) return; onSave({ title: title.trim(), amount: satang, category, paidBy, participantIds, date }); }}><Field label="รายการ"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="เช่น ค่าที่พัก, ซื้อของเข้าบ้าน" maxLength={120} required autoFocus /></Field><div className="field-grid"><Field label="ยอดเงิน"><div className="input-suffix"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /><span>บาท</span></div></Field><Field label="หมวดหมู่"><select value={category} onChange={(event) => setCategory(event.target.value)}>{["ทั่วไป", "ที่พัก", "อาหาร", "เดินทาง", "กิจกรรม", "ของใช้"].map((item) => <option key={item}>{item}</option>)}</select></Field></div><div className="field-grid"><Field label="คนออกเงินให้ก่อน"><select value={paidBy} onChange={(event) => setPaidBy(event.target.value)} required>{data.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></Field><Field label="วันที่จ่าย"><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field></div><div className="field"><span>คนที่ร่วมจ่าย</span><small>เลือกได้ตามจริง ระบบจะแบ่งยอดเท่ากันระหว่างคนที่เลือก</small><div className="participant-options">{data.members.map((member, index) => <button type="button" key={member.id} onClick={() => toggle(member.id)} className={`participant-option ${participantIds.includes(member.id) ? "is-selected" : ""}`}><Avatar name={member.name} index={index} /><span>{member.name}</span>{participantIds.includes(member.id) && <Check size={14} />}</button>)}</div>{!participantIds.length && <small className="field-error">เลือกผู้ร่วมจ่ายอย่างน้อยหนึ่งคน</small>}</div><div className="dialog-actions"><span/>{expense && <span className="form-note">แก้รายการแล้วระบบจะคำนวณยอดใหม่</span>}<button type="button" className="button button-outline" onClick={onClose}>ยกเลิก</button><button className="button button-primary" disabled={busy || !data.members.length}>{busy ? "กำลังบันทึก…" : "บันทึกรายจ่าย"}</button></div>{!data.members.length && <p className="form-note">เพิ่มสมาชิกก่อนบันทึกรายจ่าย</p>}</form></Dialog>;
}

function VillaDialog({ villa, busy, onClose, onSave }: { villa: TripData["villa"]; busy: boolean; onClose: () => void; onSave: (villa: TripData["villa"]) => void }) {
  const [value, setValue] = useState(villa);
  const update = (key: keyof typeof villa, text: string) => setValue((current) => ({ ...current, [key]: text }));
  return <Dialog title="ข้อมูลที่พัก" onClose={onClose}><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onSave(value); }}><div className="field"><span>ที่พักของเรา</span><div className="locked-villa"><HouseIcon size={17} /><b>บ้านรมณ์ดี 4 พลูวิลล่าเชียงใหม่</b><small>Chiang Mai</small></div></div><Field label="ที่อยู่"><input value={value.address} onChange={(event) => update("address", event.target.value)} placeholder="เลขที่ ถนน ตำบล อำเภอ" maxLength={300} /></Field><Field label="ลิงก์แผนที่"><input type="url" value={value.mapUrl} onChange={(event) => update("mapUrl", event.target.value)} placeholder="https://maps.app.goo.gl/..." maxLength={300} /></Field><div className="field-grid"><Field label="เบอร์ติดต่อ"><input type="tel" value={value.phone} onChange={(event) => update("phone", event.target.value)} placeholder="เบอร์ที่พัก" maxLength={40} /></Field><Field label="เช็กอิน / เช็กเอาต์"><div className="time-fields"><input value={value.checkIn} onChange={(event) => update("checkIn", event.target.value)} placeholder="เช็กอิน" maxLength={40} /><input value={value.checkOut} onChange={(event) => update("checkOut", event.target.value)} placeholder="เช็กเอาต์" maxLength={40} /></div></Field></div><Field label="หมายเหตุ"><textarea value={value.notes} onChange={(event) => update("notes", event.target.value)} placeholder="กติกาที่พัก, เงินประกัน, สิ่งที่ควรรู้…" rows={3} maxLength={1000} /></Field><div className="dialog-actions"><span/><button type="button" className="button button-outline" onClick={onClose}>ยกเลิก</button><button className="button button-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "บันทึกข้อมูล"}</button></div></form></Dialog>;
}

function ScheduleDialog({ data, busy, onClose, onSave }: { data: TripData; busy: boolean; onClose: () => void; onSave: (item: Omit<ScheduleItem, "id">) => void }) {
  const [title, setTitle] = useState(""); const [time, setTime] = useState(""); const [owner, setOwner] = useState("");
  return <Dialog title="เพิ่มกำหนดการ" onClose={onClose}><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onSave({ title: title.trim(), time, owner }); }}><Field label="กิจกรรม"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="เช่น ออกเดินทางจากตัวเมือง" maxLength={160} required autoFocus /></Field><div className="field-grid"><Field label="เวลา"><input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></Field><Field label="คนรับผิดชอบ"><input list="member-options" value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="ชื่อสมาชิก" /><datalist id="member-options">{data.members.map((member) => <option key={member.id} value={member.name} />)}</datalist></Field></div><div className="dialog-actions"><span/><button type="button" className="button button-outline" onClick={onClose}>ยกเลิก</button><button className="button button-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "เพิ่มกำหนดการ"}</button></div></form></Dialog>;
}

function PackingDialog({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: (item: Omit<PackingItem, "id" | "done">) => void }) {
  const [title, setTitle] = useState(""); const [owner, setOwner] = useState("");
  return <Dialog title="เพิ่มของที่ต้องเตรียม" onClose={onClose}><form className="dialog-form" onSubmit={(event) => { event.preventDefault(); onSave({ title: title.trim(), owner }); }}><Field label="ของที่ต้องเตรียม"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="เช่น ลำโพง, ผ้าเช็ดตัว" maxLength={160} required autoFocus /></Field><Field label="คนรับผิดชอบ"><input value={owner} onChange={(event) => setOwner(event.target.value)} placeholder="ชื่อสมาชิก" maxLength={80} /></Field><div className="dialog-actions"><span/><button type="button" className="button button-outline" onClick={onClose}>ยกเลิก</button><button className="button button-primary" disabled={busy}>{busy ? "กำลังบันทึก…" : "เพิ่มรายการ"}</button></div></form></Dialog>;
}

export default function Home() { return <TripApp />; }
