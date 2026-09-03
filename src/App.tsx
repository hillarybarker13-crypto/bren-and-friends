import { useEffect, useMemo, useState } from "react";
import "./styles.css";

type Member = {
  id: string;
  name: string;
  pin: string;
  admin?: boolean;
};

type Assignment = {
  id: string;
  title: string;
  description: string;
  assignedTo: string;
  priority: "Low" | "Medium" | "High";
  dueDate: string;
  completed: boolean;
  createdAt: string;
  completedAt?: string;
};

const MEMBERS: Member[] = [
  { id: "allie", name: "Allie", pin: "1111", admin: true },
  { id: "brendan", name: "Brendan", pin: "2222", admin: true },
  { id: "jacqueline", name: "Jacqueline", pin: "3333" },
  { id: "charlie", name: "Charlie", pin: "4444" },
  { id: "oliver", name: "Oliver", pin: "5555" },
  { id: "jeremiah", name: "Jeremiah", pin: "7777" },
];

const STORAGE_KEY = "work-hub-assignments-v1";

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export default function App() {
  const [currentUser, setCurrentUser] = useState<Member | null>(null);
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<"work" | "assign" | "progress">("work");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState("jacqueline");
  const [priority, setPriority] = useState<Assignment["priority"]>("Medium");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setAssignments(JSON.parse(saved));
      } catch {
        setAssignments([]);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));
  }, [assignments]);

  const myAssignments = useMemo(() => {
    if (!currentUser) return [];
    return assignments
      .filter((a) => a.assignedTo === currentUser.id)
      .sort((a, b) => Number(a.completed) - Number(b.completed));
  }, [assignments, currentUser]);

  const completedCount = myAssignments.filter((a) => a.completed).length;
  const openCount = myAssignments.length - completedCount;

  function login(e: React.FormEvent) {
    e.preventDefault();
    const found = MEMBERS.find((m) => m.pin === pin.trim());
    if (!found) {
      setLoginError("That code is not correct.");
      return;
    }
    setCurrentUser(found);
    setPin("");
    setLoginError("");
    setTab("work");
  }

  function logout() {
    setCurrentUser(null);
    setPin("");
    setTab("work");
  }

  function addAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    const next: Assignment = {
      id: uid(),
      title: title.trim(),
      description: description.trim(),
      assignedTo,
      priority,
      dueDate,
      completed: false,
      createdAt: new Date().toISOString(),
    };

    setAssignments((prev) => [next, ...prev]);
    setTitle("");
    setDescription("");
    setPriority("Medium");
    setDueDate("");
  }

  function toggleComplete(id: string) {
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              completed: !a.completed,
              completedAt: !a.completed ? new Date().toISOString() : undefined,
            }
          : a
      )
    );
  }

  function deleteAssignment(id: string) {
    if (!confirm("Delete this assignment?")) return;
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }

  if (!currentUser) {
    return (
      <main className="loginPage">
        <div className="loginGlow one" />
        <div className="loginGlow two" />
        <section className="loginCard">
          <div className="brandMark">W</div>
          <div className="eyebrow">TEAM WORKSPACE</div>
          <h1>Your work.<br />Nothing else.</h1>
          <p className="loginCopy">Enter your personal code to open your assignments.</p>
          <form onSubmit={login} className="loginForm">
            <label>LOGIN CODE</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
              placeholder="Enter code"
              inputMode="numeric"
              autoFocus
            />
            {loginError && <div className="errorText">{loginError}</div>}
            <button className="primaryButton" type="submit">LOGIN</button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div>
          <div className="sideBrand"><span>WORK</span><strong>HUB</strong></div>
          <div className="userBadge">
            <div className="avatar">{currentUser.name[0]}</div>
            <div><small>Signed in as</small><b>{currentUser.name}</b></div>
          </div>

          <nav>
            <button className={tab === "work" ? "active" : ""} onClick={() => setTab("work")}>My Work</button>
            {currentUser.admin && (
              <button className={tab === "assign" ? "active" : ""} onClick={() => setTab("assign")}>Assign Work</button>
            )}
            <button className={tab === "progress" ? "active" : ""} onClick={() => setTab("progress")}>Progress</button>
          </nav>
        </div>
        <button className="logoutButton" onClick={logout}>Log out</button>
      </aside>

      <main className="content">
        {tab === "work" && (
          <>
            <header className="pageHeader">
              <div><div className="eyebrow">MY WORK</div><h2>Hi, {currentUser.name}.</h2><p>Here is everything assigned to you.</p></div>
              <div className="headerStats"><div><b>{openCount}</b><span>Open</span></div><div><b>{completedCount}</b><span>Done</span></div></div>
            </header>

            {myAssignments.length === 0 ? (
              <section className="emptyState"><div className="checkCircle">✓</div><h3>You’re all caught up.</h3><p>No work has been assigned to you yet.</p></section>
            ) : (
              <section className="taskGrid">
                {myAssignments.map((task) => (
                  <article className={`taskCard ${task.completed ? "done" : ""}`} key={task.id}>
                    <div className="taskTop">
                      <span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span>
                      {task.dueDate && <span className="due">Due {new Date(task.dueDate + "T12:00:00").toLocaleDateString()}</span>}
                    </div>
                    <h3>{task.title}</h3>
                    {task.description && <p>{task.description}</p>}
                    <div className="taskBottom">
                      <button className={task.completed ? "completeButton completed" : "completeButton"} onClick={() => toggleComplete(task.id)}>
                        {task.completed ? "✓ Completed" : "Mark Complete"}
                      </button>
                      {currentUser.admin && <button className="deleteButton" onClick={() => deleteAssignment(task.id)}>Delete</button>}
                    </div>
                  </article>
                ))}
              </section>
            )}
          </>
        )}

        {tab === "assign" && currentUser.admin && (
          <>
            <header className="pageHeader"><div><div className="eyebrow">ADMIN</div><h2>Assign Work</h2><p>Create a job and send it to one person.</p></div></header>
            <section className="assignLayout">
              <form className="assignCard" onSubmit={addAssignment}>
                <div className="field"><label>ASSIGN TO</label><select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>{MEMBERS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
                <div className="field"><label>TASK NAME</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Example: Write episode outline" /></div>
                <div className="field"><label>INSTRUCTIONS</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Add the details they need..." rows={5} /></div>
                <div className="twoFields">
                  <div className="field"><label>PRIORITY</label><select value={priority} onChange={(e) => setPriority(e.target.value as Assignment["priority"])}><option>Low</option><option>Medium</option><option>High</option></select></div>
                  <div className="field"><label>DUE DATE</label><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
                </div>
                <button className="primaryButton" type="submit">ASSIGN WORK</button>
              </form>

              <div className="recentPanel">
                <h3>All Assigned Work</h3>
                {assignments.length === 0 ? <p className="muted">Nothing assigned yet.</p> : assignments.map((a) => {
                  const member = MEMBERS.find(m => m.id === a.assignedTo);
                  return <div className="miniTask" key={a.id}><div><b>{a.title}</b><span>{member?.name} · {a.priority}</span></div><div className={a.completed ? "miniStatus doneStatus" : "miniStatus"}>{a.completed ? "DONE" : "OPEN"}</div></div>
                })}
              </div>
            </section>
          </>
        )}

        {tab === "progress" && (
          <>
            <header className="pageHeader"><div><div className="eyebrow">PROGRESS</div><h2>Work Progress</h2><p>{currentUser.admin ? "See how everyone is doing." : "See your completion progress."}</p></div></header>
            <section className="progressGrid">
              {(currentUser.admin ? MEMBERS : [currentUser]).map((member) => {
                const items = assignments.filter(a => a.assignedTo === member.id);
                const done = items.filter(a => a.completed).length;
                const percent = items.length ? Math.round(done / items.length * 100) : 0;
                return <article className="progressCard" key={member.id}><div className="progressHeading"><div className="avatar small">{member.name[0]}</div><div><h3>{member.name}</h3><p>{done} of {items.length} completed</p></div><strong>{percent}%</strong></div><div className="progressTrack"><div style={{ width: `${percent}%` }} /></div></article>
              })}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
