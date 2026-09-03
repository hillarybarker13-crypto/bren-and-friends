import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  Activity,
  ArrowLeft,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleAlert,
  ClipboardList,
  Clock3,
  Cloud,
  CloudOff,
  Copy,
  Edit3,
  FolderKanban,
  Home,
  Inbox,
  Link as LinkIcon,
  ListChecks,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  Users,
  X,
  Zap,
} from "lucide-react";
import { db } from "./firebase";
import "./styles.css";

type Member = { id: string; name: string; pin: string; admin?: boolean };
type Priority = "Low" | "Medium" | "High" | "Urgent";
type Status = "Not Started" | "In Progress" | "Blocked" | "Completed";
type ChecklistItem = { id: string; text: string; done: boolean };
type Comment = { id: string; author: string; text: string; createdAt: number };
type ActivityEntry = { id: string; actor: string; text: string; createdAt: number };
type Assignment = {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  assignedBy: string;
  priority: Priority;
  status: Status;
  dueDate: string;
  category?: string;
  project?: string;
  referenceUrl?: string;
  checklist?: ChecklistItem[];
  comments?: Comment[];
  activity?: ActivityEntry[];
  starred?: boolean;
  archived?: boolean;
  completed: boolean;
  createdAt?: any;
  completedAt?: any;
  updatedAt?: any;
};

type Screen = "home" | "work" | "assign" | "team" | "calendar" | "projects" | "inbox" | "profile" | "task";
type WorkFilter = "All" | "Open" | "Due Soon" | "Overdue" | "Completed" | "Starred";

type EditDraft = Pick<Assignment, "title" | "description" | "assignedTo" | "priority" | "dueDate" | "category" | "project" | "referenceUrl">;

const MEMBERS: Member[] = [
  { id: "allie", name: "Allie", pin: "1111", admin: true },
  { id: "brendan", name: "Brendan", pin: "2222", admin: true },
  { id: "jacqueline", name: "Jacqueline", pin: "3333" },
  { id: "charlie", name: "Charlie", pin: "4444" },
  { id: "oliver", name: "Oliver", pin: "5555" },
  { id: "jeremiah", name: "Jeremiah", pin: "7777" },
];

const COLLECTION = "workHubAssignments";
const SESSION_KEY = "work-hub-user";
const DRAFT_KEY = "work-hub-assignment-draft";
const priorityRank: Record<Priority, number> = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

const memberName = (id: string) => MEMBERS.find(m => m.id === id)?.name ?? "Unknown";
const todayString = () => new Date().toISOString().slice(0, 10);
const fmtDate = (date?: string) => !date ? "No due date" : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: new Date(`${date}T12:00:00`).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
const isOverdue = (t: Assignment) => !!t.dueDate && !t.completed && new Date(`${t.dueDate}T23:59:59`).getTime() < Date.now();
const isDueSoon = (t: Assignment) => {
  if (!t.dueDate || t.completed || isOverdue(t)) return false;
  const diff = new Date(`${t.dueDate}T23:59:59`).getTime() - Date.now();
  return diff <= 3 * 24 * 60 * 60 * 1000;
};
const timestampMs = (value: any) => {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
};
const safeHref = (value?: string) => {
  if (!value) return "";
  try {
    const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch { return ""; }
};
const newActivity = (actor: string, text: string): ActivityEntry => ({ id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, actor, text, createdAt: Date.now() });

export default function App() {
  const [currentUser, setCurrentUser] = useState<Member | null>(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    return MEMBERS.find(m => m.id === saved) ?? null;
  });
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [screen, setScreen] = useState<Screen>("home");
  const [previousScreen, setPreviousScreen] = useState<Screen>("work");
  const [menuOpen, setMenuOpen] = useState(false);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [cloudState, setCloudState] = useState<"connecting" | "online" | "error">("connecting");
  const [cloudError, setCloudError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<WorkFilter>("All");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);

  const savedDraft = (() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}"); } catch { return {}; }
  })();
  const [title, setTitle] = useState(savedDraft.title || "");
  const [description, setDescription] = useState(savedDraft.description || "");
  const [assignedTo, setAssignedTo] = useState(savedDraft.assignedTo || "jacqueline");
  const [priority, setPriority] = useState<Priority>(savedDraft.priority || "Medium");
  const [dueDate, setDueDate] = useState(savedDraft.dueDate || "");
  const [category, setCategory] = useState(savedDraft.category || "");
  const [project, setProject] = useState(savedDraft.project || "");
  const [referenceUrl, setReferenceUrl] = useState(savedDraft.referenceUrl || "");
  const [checklistDraft, setChecklistDraft] = useState(savedDraft.checklistDraft || "");

  useEffect(() => {
    if (!currentUser) return;
    setCloudState("connecting");
    const ref = collection(db, COLLECTION);
    const q = currentUser.admin ? query(ref) : query(ref, where("assignedTo", "==", currentUser.id));
    return onSnapshot(q, snapshot => {
      const rows = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Assignment));
      setAssignments(rows);
      setCloudState("online");
      setCloudError("");
    }, error => {
      console.error(error);
      setCloudState("error");
      setCloudError("Work Hub could not sync. The Firebase Firestore rules may need attention.");
    });
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.admin) return;
    const draft = { title, description, assignedTo, priority, dueDate, category, project, referenceUrl, checklistDraft };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [currentUser, title, description, assignedTo, priority, dueDate, category, project, referenceUrl, checklistDraft]);

  const myAssignments = useMemo(() => {
    if (!currentUser) return [];
    return assignments.filter(a => a.assignedTo === currentUser.id && !a.archived).sort((a, b) => {
      if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
      if (isOverdue(a) !== isOverdue(b)) return Number(isOverdue(b)) - Number(isOverdue(a));
      const priorityDiff = priorityRank[a.priority || "Medium"] - priorityRank[b.priority || "Medium"];
      if (priorityDiff !== 0) return priorityDiff;
      return (a.dueDate || "9999").localeCompare(b.dueDate || "9999");
    });
  }, [assignments, currentUser]);

  const filteredWork = useMemo(() => myAssignments.filter(t => {
    const haystack = `${t.title} ${t.description || ""} ${t.category || ""} ${t.project || ""}`.toLowerCase();
    if (search && !haystack.includes(search.toLowerCase())) return false;
    if (filter === "Open" && t.completed) return false;
    if (filter === "Due Soon" && !isDueSoon(t)) return false;
    if (filter === "Overdue" && !isOverdue(t)) return false;
    if (filter === "Completed" && !t.completed) return false;
    if (filter === "Starred" && !t.starred) return false;
    return true;
  }), [myAssignments, search, filter]);

  const selectedTask = assignments.find(a => a.id === selectedTaskId) ?? null;
  const openCount = myAssignments.filter(t => !t.completed).length;
  const completedCount = myAssignments.filter(t => t.completed).length;
  const overdueCount = myAssignments.filter(isOverdue).length;
  const dueSoonCount = myAssignments.filter(isDueSoon).length;
  const completionRate = myAssignments.length ? Math.round((completedCount / myAssignments.length) * 100) : 0;

  const projects = useMemo(() => {
    const map = new Map<string, Assignment[]>();
    myAssignments.forEach(task => {
      const key = task.project?.trim() || "No project";
      map.set(key, [...(map.get(key) || []), task]);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [myAssignments]);

  const calendarItems = useMemo(() => myAssignments.filter(t => t.dueDate).sort((a,b) => a.dueDate.localeCompare(b.dueDate)), [myAssignments]);
  const inboxItems = useMemo(() => myAssignments.filter(t => !t.completed && (isOverdue(t) || isDueSoon(t) || timestampMs(t.createdAt) > Date.now() - 7*24*60*60*1000)).slice(0, 30), [myAssignments]);

  function flash(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  function login(e: FormEvent) {
    e.preventDefault();
    const found = MEMBERS.find(m => m.pin === pin.trim());
    if (!found) return setLoginError("That code is not correct.");
    localStorage.setItem(SESSION_KEY, found.id);
    setCurrentUser(found);
    setPin(""); setLoginError(""); setScreen("home");
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null); setAssignments([]); setScreen("home"); setMenuOpen(false);
  }

  function navigate(next: Screen) {
    setScreen(next); setMenuOpen(false); setEditMode(false);
  }

  function openTask(id: string) {
    setPreviousScreen(screen === "task" ? "work" : screen);
    setSelectedTaskId(id);
    setEditMode(false);
    setScreen("task");
  }

  async function updateTask(id: string, patch: Record<string, any>, success?: string, activityText?: string) {
    if (!currentUser) return;
    try {
      const payload: Record<string, any> = { ...patch, updatedAt: serverTimestamp() };
      if (activityText) payload.activity = arrayUnion(newActivity(currentUser.id, activityText));
      await updateDoc(doc(db, COLLECTION, id), payload);
      if (success) flash(success);
    } catch (error) {
      console.error(error); setCloudState("error"); flash("Could not save that change.");
    }
  }

  function clearAssignmentForm() {
    setTitle(""); setDescription(""); setPriority("Medium"); setDueDate(""); setCategory(""); setProject(""); setReferenceUrl(""); setChecklistDraft("");
    localStorage.removeItem(DRAFT_KEY);
  }

  async function createAssignment(e: FormEvent) {
    e.preventDefault();
    if (!currentUser?.admin || !title.trim() || saving) return;
    setSaving(true);
    const checklist: ChecklistItem[] = String(checklistDraft).split("\n").map((x: string) => x.trim()).filter(Boolean).map((text: string, i: number) => ({ id: `${Date.now()}-${i}`, text, done: false }));
    try {
      await addDoc(collection(db, COLLECTION), {
        title: title.trim(), description: description.trim(), assignedTo, assignedBy: currentUser.id,
        priority, status: "Not Started", dueDate, category: category.trim(), project: project.trim(),
        referenceUrl: referenceUrl.trim(), checklist, comments: [], starred: false, archived: false, completed: false,
        activity: [newActivity(currentUser.id, `Assigned this work to ${memberName(assignedTo)}.`)],
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      clearAssignmentForm();
      flash(`Assigned to ${memberName(assignedTo)}.`);
      setScreen("team");
    } catch (error) {
      console.error(error); setCloudState("error"); flash("Assignment could not be saved.");
    } finally { setSaving(false); }
  }

  async function setStatus(task: Assignment, status: Status) {
    await updateTask(task.id, {
      status,
      completed: status === "Completed",
      completedAt: status === "Completed" ? serverTimestamp() : null,
    }, status === "Completed" ? "Nice work — completed!" : `Status changed to ${status}.`, `Changed status to ${status}.`);
  }

  async function toggleChecklist(task: Assignment, itemId: string) {
    const checklist = (task.checklist || []).map(item => item.id === itemId ? { ...item, done: !item.done } : item);
    await updateTask(task.id, { checklist });
  }

  async function addComment(e: FormEvent, task: Assignment) {
    e.preventDefault();
    if (!currentUser || !comment.trim()) return;
    const newComment: Comment = { id: crypto.randomUUID?.() || `${Date.now()}`, author: currentUser.id, text: comment.trim(), createdAt: Date.now() };
    setComment("");
    try {
      await updateDoc(doc(db, COLLECTION, task.id), {
        comments: arrayUnion(newComment),
        activity: arrayUnion(newActivity(currentUser.id, "Added a note.")),
        updatedAt: serverTimestamp(),
      });
      flash("Note added.");
    } catch { flash("Could not add note."); }
  }

  async function deleteTask(task: Assignment) {
    if (!currentUser?.admin || !confirm(`Delete “${task.title}”?`)) return;
    try { await deleteDoc(doc(db, COLLECTION, task.id)); setScreen("team"); flash("Assignment deleted."); }
    catch { flash("Could not delete assignment."); }
  }

  async function duplicateTask(task: Assignment) {
    if (!currentUser?.admin) return;
    try {
      await addDoc(collection(db, COLLECTION), {
        title: `${task.title} (copy)`, description: task.description || "", assignedTo: task.assignedTo, assignedBy: currentUser.id,
        priority: task.priority || "Medium", status: "Not Started", dueDate: task.dueDate || "", category: task.category || "", project: task.project || "", referenceUrl: task.referenceUrl || "",
        checklist: (task.checklist || []).map((i, index) => ({ id: `${Date.now()}-${index}`, text: i.text, done: false })), comments: [], starred: false, archived: false, completed: false,
        activity: [newActivity(currentUser.id, `Duplicated from “${task.title}”.`)], createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      flash("Assignment duplicated.");
    } catch { flash("Could not duplicate assignment."); }
  }

  function beginEdit(task: Assignment) {
    setEditDraft({ title: task.title, description: task.description || "", assignedTo: task.assignedTo, priority: task.priority || "Medium", dueDate: task.dueDate || "", category: task.category || "", project: task.project || "", referenceUrl: task.referenceUrl || "" });
    setEditMode(true);
  }

  async function saveEdit(e: FormEvent, task: Assignment) {
    e.preventDefault();
    if (!editDraft?.title.trim()) return;
    await updateTask(task.id, { ...editDraft, title: editDraft.title.trim(), description: editDraft.description.trim(), category: editDraft.category?.trim(), project: editDraft.project?.trim(), referenceUrl: editDraft.referenceUrl?.trim() }, "Assignment updated.", "Updated assignment details.");
    setEditMode(false);
  }

  if (!currentUser) return (
    <main className="loginPage">
      <div className="loginGlow one"/><div className="loginGlow two"/>
      <section className="loginCard">
        <div className="loginLogo"><ClipboardList size={25}/></div>
        <div className="eyebrow">WORK HUB</div>
        <h1>Sign in to<br/>your workspace.</h1>
        <p>One simple place for your assignments, deadlines, notes, and progress.</p>
        <form onSubmit={login} className="loginForm">
          <label>PERSONAL CODE</label>
          <input value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" placeholder="Enter your code" autoFocus />
          {loginError && <div className="errorText"><CircleAlert size={14}/>{loginError}</div>}
          <button className="primaryButton">LOGIN</button>
        </form>
        <div className="cloudPill"><Cloud size={14}/> Live cloud workspace</div>
      </section>
    </main>
  );

  const Header = ({ title: heading, back = false }: { title: string; back?: boolean }) => (
    <header className="topBar">
      <button className="iconButton" onClick={() => back ? setScreen(previousScreen) : setMenuOpen(true)}>{back ? <ArrowLeft/> : <Menu/>}</button>
      <div className="topTitle"><span>WORK HUB</span><strong>{heading}</strong></div>
      <div className={`syncDot ${cloudState}`} title={cloudState}/>
    </header>
  );

  const TaskRow = ({ task, showPerson = false }: { task: Assignment; showPerson?: boolean }) => (
    <button className={`taskRow ${task.completed ? "done" : ""}`} onClick={() => openTask(task.id)}>
      <div className={`statusIcon ${task.completed ? "complete" : isOverdue(task) ? "late" : ""}`}>{task.completed ? <Check size={17}/> : <Circle size={17}/>}</div>
      <div className="taskRowBody">
        <div className="taskRowTitle"><strong>{task.title}</strong>{task.starred && <Star size={13} fill="currentColor"/>}</div>
        <div className="taskMeta">{showPerson && <><span>{memberName(task.assignedTo)}</span><span>•</span></>}<span className={`priorityText ${task.priority?.toLowerCase()}`}>{task.priority || "Medium"}</span><span>•</span><span className={isOverdue(task) ? "overdueText" : ""}>{isOverdue(task) ? "Overdue · " : ""}{fmtDate(task.dueDate)}</span></div>
      </div>
      <ChevronRight size={17} className="chevron"/>
    </button>
  );

  const DrawerButton = ({ to, icon, children }: { to: Screen; icon: React.ReactNode; children: React.ReactNode }) => <button onClick={() => navigate(to)}>{icon}{children}</button>;

  return (
    <div className="mobileApp">
      {toast && <div className="toast">{toast}</div>}
      {menuOpen && <><div className="scrim" onClick={() => setMenuOpen(false)}/><aside className="drawer">
        <div className="drawerTop"><div className="avatar large">{currentUser.name[0]}</div><div><b>{currentUser.name}</b><span>{currentUser.admin ? "Administrator" : "Team Member"}</span></div><button className="iconButton" onClick={() => setMenuOpen(false)}><X/></button></div>
        <div className="drawerNav">
          <DrawerButton to="home" icon={<Home/>}>Home</DrawerButton>
          <DrawerButton to="work" icon={<ClipboardList/>}>My Work</DrawerButton>
          <DrawerButton to="calendar" icon={<CalendarDays/>}>Deadlines</DrawerButton>
          <DrawerButton to="projects" icon={<FolderKanban/>}>Projects</DrawerButton>
          <DrawerButton to="inbox" icon={<Inbox/>}>Updates</DrawerButton>
          {currentUser.admin && <DrawerButton to="assign" icon={<Plus/>}>Assign Work</DrawerButton>}
          {currentUser.admin && <DrawerButton to="team" icon={<Users/>}>Team & Progress</DrawerButton>}
          <DrawerButton to="profile" icon={<Settings/>}>Profile & Settings</DrawerButton>
        </div>
        <div className="drawerFooter"><div className={`connection ${cloudState}`}>{cloudState === "online" ? <Cloud/> : <CloudOff/>}<span>{cloudState === "online" ? "Firebase synced" : cloudState === "connecting" ? "Connecting…" : "Sync issue"}</span></div><button className="logout" onClick={logout}><LogOut/>Log out</button></div>
      </aside></>}

      {screen === "home" && <><Header title={`Hi, ${currentUser.name}`}/><main className="page homePage">
        <section className="heroCard"><div><span className="eyebrow">TODAY</span><h2>{openCount === 0 ? "You're all caught up." : `${openCount} ${openCount === 1 ? "task" : "tasks"} to move forward.`}</h2><p>{overdueCount ? `${overdueCount} overdue — start there.` : dueSoonCount ? `${dueSoonCount} due soon.` : "Nothing urgent right now."}</p></div><div className="ring" style={{"--progress": `${completionRate * 3.6}deg`} as any}><span>{completionRate}%</span></div></section>
        <section className="quickGrid"><button onClick={() => {setFilter("Open");setScreen("work")}}><ClipboardList/><b>{openCount}</b><span>Open</span></button><button onClick={() => {setFilter("Due Soon");setScreen("work")}}><Clock3/><b>{dueSoonCount}</b><span>Due soon</span></button><button onClick={() => {setFilter("Completed");setScreen("work")}}><CheckCircle2/><b>{completedCount}</b><span>Done</span></button></section>
        <section className="sectionBlock"><div className="sectionHead"><div><span className="eyebrow">UP NEXT</span><h3>Priority work</h3></div><button onClick={() => setScreen("work")}>See all</button></div><div className="listCard">{myAssignments.filter(t => !t.completed).slice(0, 3).map(t => <TaskRow key={t.id} task={t}/>)}{!openCount && <div className="miniEmpty"><Sparkles/><b>Nothing waiting</b><span>New work will appear here automatically.</span></div>}</div></section>
        <section className="quietLinks"><button onClick={()=>setScreen("calendar")}><CalendarDays/><span>Deadlines</span><ChevronRight/></button><button onClick={()=>setScreen("projects")}><FolderKanban/><span>Projects</span><ChevronRight/></button><button onClick={()=>setScreen("inbox")}><Inbox/><span>Updates</span><ChevronRight/></button></section>
        {currentUser.admin && <section className="adminShortcut"><div><span className="eyebrow">ADMIN</span><h3>Need to assign something?</h3><p>Create work, set a deadline, add a checklist, and it appears on their device.</p></div><button className="primaryButton compact" onClick={() => setScreen("assign")}><Plus/>Assign work</button></section>}
      </main></>}

      {screen === "work" && <><Header title="My Work"/><main className="page"><div className="pageIntro"><div><span className="eyebrow">ASSIGNMENTS</span><h2>My Work</h2></div><div className="countPill">{filteredWork.length}</div></div><div className="searchBox"><Search/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search my work"/></div><div className="filterStrip">{(["All","Open","Due Soon","Overdue","Completed","Starred"] as WorkFilter[]).map(f => <button key={f} className={filter===f?"active":""} onClick={() => setFilter(f)}>{f}</button>)}</div><div className="listCard workList">{filteredWork.map(t => <TaskRow key={t.id} task={t}/>)}{!filteredWork.length && <div className="miniEmpty"><Search/><b>No work here</b><span>Try another filter or search.</span></div>}</div></main></>}

      {screen === "calendar" && <><Header title="Deadlines"/><main className="page"><div className="pageIntro"><div><span className="eyebrow">SCHEDULE</span><h2>Deadlines</h2><p>A clean date-ordered view of your work.</p></div></div><div className="timeline">{calendarItems.map(t=><button className="timelineItem" key={t.id} onClick={()=>openTask(t.id)}><div className={`dateTile ${isOverdue(t)?"late":""}`}><b>{new Date(`${t.dueDate}T12:00:00`).toLocaleDateString(undefined,{day:"2-digit"})}</b><span>{new Date(`${t.dueDate}T12:00:00`).toLocaleDateString(undefined,{month:"short"})}</span></div><div><b>{t.title}</b><span>{t.completed?"Completed":isOverdue(t)?"Overdue":isDueSoon(t)?"Due soon":t.status}</span></div><ChevronRight/></button>)}{!calendarItems.length&&<div className="miniEmpty"><CalendarDays/><b>No deadlines</b><span>Assignments with due dates will show here.</span></div>}</div></main></>}

      {screen === "projects" && <><Header title="Projects"/><main className="page"><div className="pageIntro"><div><span className="eyebrow">ORGANIZE</span><h2>Projects</h2><p>Work grouped without adding clutter to your main list.</p></div></div><div className="projectStack">{projects.map(([name,tasks])=>{const done=tasks.filter(t=>t.completed).length;const pct=tasks.length?Math.round(done/tasks.length*100):0;return <details className="projectCard" key={name}><summary><div className="projectIcon"><FolderKanban/></div><div><b>{name}</b><span>{tasks.length-done} open · {pct}% complete</span></div><ChevronRight/></summary><div className="projectBody"><div className="progressTrack"><div style={{width:`${pct}%`}}/></div>{tasks.map(t=><TaskRow key={t.id} task={t}/>)}</div></details>})}{!projects.length&&<div className="miniEmpty"><FolderKanban/><b>No projects yet</b><span>Add a project name while assigning work.</span></div>}</div></main></>}

      {screen === "inbox" && <><Header title="Updates"/><main className="page"><div className="pageIntro"><div><span className="eyebrow">INBOX</span><h2>Updates</h2><p>Only things that may need your attention.</p></div><div className="countPill">{inboxItems.length}</div></div><div className="updateStack">{inboxItems.map(t=><button className="updateCard" key={t.id} onClick={()=>openTask(t.id)}><div className={`updateIcon ${isOverdue(t)?"late":isDueSoon(t)?"soon":"new"}`}>{isOverdue(t)?<CircleAlert/>:isDueSoon(t)?<Clock3/>:<Bell/>}</div><div><b>{t.title}</b><span>{isOverdue(t)?`Overdue · ${fmtDate(t.dueDate)}`:isDueSoon(t)?`Due soon · ${fmtDate(t.dueDate)}`:"Recently assigned"}</span></div><ChevronRight/></button>)}{!inboxItems.length&&<div className="miniEmpty"><CheckCircle2/><b>You're clear</b><span>No urgent updates right now.</span></div>}</div></main></>}

      {screen === "assign" && currentUser.admin && <><Header title="Assign Work"/><main className="page"><div className="pageIntro"><div><span className="eyebrow">ADMIN</span><h2>New assignment</h2><p>Your draft saves automatically on this device.</p></div></div><form onSubmit={createAssignment} className="formCard"><div className="field"><label>ASSIGN TO</label><select value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>{MEMBERS.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</select></div><div className="field"><label>TITLE *</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs to be done?" required/></div><div className="field"><label>INSTRUCTIONS</label><textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Add instructions or expectations…"/></div><div className="twoCol"><div className="field"><label>PRIORITY</label><select value={priority} onChange={e => setPriority(e.target.value as Priority)}><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select></div><div className="field"><label>DUE DATE</label><input type="date" min={todayString()} value={dueDate} onChange={e => setDueDate(e.target.value)}/></div></div><details className="advanced"><summary><Plus size={15}/>More options</summary><div className="advancedBody"><div className="twoCol"><div className="field"><label>CATEGORY</label><input value={category} onChange={e=>setCategory(e.target.value)} placeholder="Writing, Editing…"/></div><div className="field"><label>PROJECT</label><input value={project} onChange={e=>setProject(e.target.value)} placeholder="Optional project"/></div></div><div className="field"><label>REFERENCE LINK</label><input value={referenceUrl} onChange={e=>setReferenceUrl(e.target.value)} placeholder="https://…" inputMode="url"/></div><div className="field"><label>CHECKLIST <span>one item per line</span></label><textarea value={checklistDraft} onChange={e=>setChecklistDraft(e.target.value)} rows={5} placeholder={'First step\nSecond step\nFinal check'}/></div></div></details><div className="formActions"><button type="button" className="secondaryButton" onClick={clearAssignmentForm}><RotateCcw/>Clear</button><button className="primaryButton grow" disabled={saving}>{saving ? "SAVING…" : "ASSIGN WORK"}</button></div></form></main></>}

      {screen === "team" && currentUser.admin && <><Header title="Team"/><main className="page"><div className="pageIntro"><div><span className="eyebrow">ADMIN</span><h2>Team & Progress</h2><p>Tap a person to see how their workload is moving.</p></div></div><div className="memberStack">{MEMBERS.map(m => {const mine = assignments.filter(a=>a.assignedTo===m.id&&!a.archived), done = mine.filter(a=>a.completed).length, late = mine.filter(isOverdue).length;const percent = mine.length ? Math.round(done/mine.length*100) : 0;return <details className="memberCard" key={m.id}><summary><div className="avatar">{m.name[0]}</div><div className="memberMain"><b>{m.name}</b><span>{mine.length-done} open{late ? ` · ${late} overdue` : ""}</span></div><strong>{percent}%</strong><ChevronRight className="expandArrow"/></summary><div className="memberDetails"><div className="progressTrack"><div style={{width:`${percent}%`}}/></div>{mine.length ? mine.sort((a,b)=>Number(a.completed)-Number(b.completed)).map(t=><TaskRow key={t.id} task={t}/>) : <div className="miniEmpty small"><span>No assignments yet.</span></div>}<button className="secondaryButton" onClick={() => {setAssignedTo(m.id);setScreen("assign")}}><Plus/>Assign to {m.name}</button></div></details>})}</div></main></>}

      {screen === "task" && selectedTask && <><Header title="Assignment" back/><main className="page taskDetail">
        <div className="taskDetailHead"><div className="badges"><span className={`badge ${selectedTask.priority?.toLowerCase()}`}>{selectedTask.priority}</span>{selectedTask.category && <span className="badge neutral">{selectedTask.category}</span>}</div><h2>{selectedTask.title}</h2><p>{currentUser.admin?`Assigned to ${memberName(selectedTask.assignedTo)}`:`Assigned by ${memberName(selectedTask.assignedBy)}`}</p></div>
        <div className="detailActionRow"><button className={selectedTask.starred?"starred":""} onClick={() => updateTask(selectedTask.id,{starred:!selectedTask.starred},selectedTask.starred?"Removed star.":"Starred.")}><Star fill={selectedTask.starred?"currentColor":"none"}/><span>{selectedTask.starred?"Starred":"Star"}</span></button><button><CalendarDays/><span>{fmtDate(selectedTask.dueDate)}</span></button>{safeHref(selectedTask.referenceUrl) && <a href={safeHref(selectedTask.referenceUrl)} target="_blank" rel="noreferrer"><LinkIcon/><span>Open link</span></a>}{currentUser.admin&&<button onClick={()=>beginEdit(selectedTask)}><Edit3/><span>Edit</span></button>}{currentUser.admin&&<button onClick={()=>duplicateTask(selectedTask)}><Copy/><span>Duplicate</span></button>}</div>
        {editMode && editDraft && <form className="detailCard editCard" onSubmit={e=>saveEdit(e,selectedTask)}><div className="detailCardHead"><div><div className="detailLabel">ADMIN</div><b>Edit assignment</b></div><button type="button" className="miniIconButton" onClick={()=>setEditMode(false)}><X/></button></div><div className="field"><label>TITLE</label><input value={editDraft.title} onChange={e=>setEditDraft({...editDraft,title:e.target.value})}/></div><div className="field"><label>ASSIGN TO</label><select value={editDraft.assignedTo} onChange={e=>setEditDraft({...editDraft,assignedTo:e.target.value})}>{MEMBERS.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></div><div className="field"><label>INSTRUCTIONS</label><textarea rows={4} value={editDraft.description} onChange={e=>setEditDraft({...editDraft,description:e.target.value})}/></div><div className="twoCol"><div className="field"><label>PRIORITY</label><select value={editDraft.priority} onChange={e=>setEditDraft({...editDraft,priority:e.target.value as Priority})}><option>Low</option><option>Medium</option><option>High</option><option>Urgent</option></select></div><div className="field"><label>DUE DATE</label><input type="date" value={editDraft.dueDate} onChange={e=>setEditDraft({...editDraft,dueDate:e.target.value})}/></div></div><div className="twoCol"><div className="field"><label>CATEGORY</label><input value={editDraft.category||""} onChange={e=>setEditDraft({...editDraft,category:e.target.value})}/></div><div className="field"><label>PROJECT</label><input value={editDraft.project||""} onChange={e=>setEditDraft({...editDraft,project:e.target.value})}/></div></div><div className="field"><label>REFERENCE LINK</label><input value={editDraft.referenceUrl||""} onChange={e=>setEditDraft({...editDraft,referenceUrl:e.target.value})}/></div><button className="primaryButton full">SAVE CHANGES</button></form>}
        <section className="detailCard"><div className="detailLabel">STATUS</div><div className="statusChooser">{(["Not Started","In Progress","Blocked","Completed"] as Status[]).map(s=><button key={s} className={selectedTask.status===s || (selectedTask.completed && s==="Completed") ? "active":""} onClick={()=>setStatus(selectedTask,s)}>{s}</button>)}</div></section>
        {selectedTask.description && <section className="detailCard"><div className="detailLabel">INSTRUCTIONS</div><p className="instructions">{selectedTask.description}</p></section>}
        {selectedTask.project && <section className="infoLine"><Zap/><div><span>Project</span><b>{selectedTask.project}</b></div></section>}
        {!!selectedTask.checklist?.length && <section className="detailCard"><div className="detailCardHead"><div><div className="detailLabel">CHECKLIST</div><b>{selectedTask.checklist.filter(i=>i.done).length}/{selectedTask.checklist.length} complete</b></div><ListChecks/></div><div className="checklist">{selectedTask.checklist.map(item=><button key={item.id} className={item.done?"done":""} onClick={()=>toggleChecklist(selectedTask,item.id)}>{item.done?<CheckCircle2/>:<Circle/>}<span>{item.text}</span></button>)}</div></section>}
        <section className="detailCard"><div className="detailCardHead"><div><div className="detailLabel">NOTES</div><b>Conversation</b></div><MessageCircle/></div><div className="comments">{(selectedTask.comments||[]).map(c=><div className="commentItem" key={c.id}><div className="avatar tiny">{memberName(c.author)[0]}</div><div><div><b>{memberName(c.author)}</b><span>{new Date(c.createdAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</span></div><p>{c.text}</p></div></div>)}{!(selectedTask.comments||[]).length && <p className="muted center">No notes yet.</p>}</div><form className="commentForm" onSubmit={e=>addComment(e,selectedTask)}><input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Add a note…"/><button disabled={!comment.trim()}><ChevronRight/></button></form></section>
        {!!selectedTask.activity?.length && <details className="detailCard activityCard"><summary><div><div className="detailLabel">HISTORY</div><b>Activity</b></div><Activity/></summary><div className="activityList">{[...selectedTask.activity].sort((a,b)=>b.createdAt-a.createdAt).map(a=><div key={a.id}><span className="activityDot"/><p><b>{memberName(a.actor)}</b> {a.text}</p><time>{new Date(a.createdAt).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</time></div>)}</div></details>}
        {currentUser.admin && <div className="adminDangerZone"><button className="secondaryButton full" onClick={()=>updateTask(selectedTask.id,{archived:!selectedTask.archived},selectedTask.archived?"Restored from archive.":"Archived.",selectedTask.archived?"Restored this assignment.":"Archived this assignment.")}>{selectedTask.archived?"Restore assignment":"Archive assignment"}</button><button className="dangerButton" onClick={()=>deleteTask(selectedTask)}><Trash2/>Delete assignment</button></div>}
      </main></>}

      {screen === "profile" && <><Header title="Profile"/><main className="page"><section className="profileHero"><div className="avatar profileAvatar">{currentUser.name[0]}</div><h2>{currentUser.name}</h2><p>{currentUser.admin?"Administrator":"Team Member"}</p></section><section className="settingsCard"><div className="settingRow"><Cloud/><div><b>Cloud sync</b><span>{cloudState === "online" ? "Live and connected" : "Needs attention"}</span></div><span className={`statusPill ${cloudState}`}>{cloudState}</span></div><div className="settingRow"><Bell/><div><b>Live updates</b><span>Changes appear automatically while the app is open</span></div></div><div className="settingRow"><UserRound/><div><b>Remember this device</b><span>Your workspace stays signed in until you log out</span></div></div></section>{cloudError && <div className="warningBox"><CircleAlert/><div><b>Sync issue</b><p>{cloudError}</p></div></div>}<button className="secondaryButton full" onClick={logout}><LogOut/>Log out</button></main></>}

      {screen !== "task" && <nav className="bottomNav"><button className={screen==="home"?"active":""} onClick={()=>setScreen("home")}><Home/><span>Home</span></button><button className={screen==="work"?"active":""} onClick={()=>setScreen("work")}><ClipboardList/><span>Work</span></button>{currentUser.admin && <button className="fabWrap" onClick={()=>setScreen("assign")}><span className="fab"><Plus/></span><span>Assign</span></button>}{currentUser.admin ? <button className={screen==="team"?"active":""} onClick={()=>setScreen("team")}><Users/><span>Team</span></button> : <button className={screen==="inbox"?"active":""} onClick={()=>setScreen("inbox")}><Inbox/><span>Updates</span></button>}<button className={screen==="profile"?"active":""} onClick={()=>setScreen("profile")}><UserRound/><span>Profile</span></button></nav>}
    </div>
  );
}
