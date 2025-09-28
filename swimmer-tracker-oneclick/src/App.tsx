import React, { useEffect, useMemo, useState, useTransition } from "react";
import { createClient } from "@supabase/supabase-js";
import { motion } from "framer-motion";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

/**
 * Swimmer Tracker – Multi-user (Supabase) • Mobile-first React
 * - Auth: Email magic link + Google/Apple OAuth
 * - Cloud Postgres with Row-Level Security
 * - Competition results + Personal Bests view
 * - Debounced search, pagination, optimistic UI, validation
 * - CSV import/export (chunked)
 *
 * Requirements:
 *  - VITE_SUPABASE_URL
 *  - VITE_SUPABASE_ANON_KEY
 *
 * Run the SQL in supabase/schema.sql on your Supabase project before using.
 */

// ---------- Supabase client ----------
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

// ---------- Types ----------
type Workout = {
  id?: string;
  user_id?: string;
  date: string;            // YYYY-MM-DD
  distance_m: number;      // meters
  duration_min: number;    // minutes
  stroke: "Free" | "Back" | "Breast" | "Fly" | "IM" | "Drill";
  rpe?: number;            // 1-10
  notes?: string;
};

type Competition = {
  id?: string;
  user_id?: string;
  date: string;            // YYYY-MM-DD
  meet: string;
  distance_m: number;
  stroke: "Free" | "Back" | "Breast" | "Fly" | "IM";
  time_sec: number;        // total seconds
  location?: string;
  notes?: string;
};

type PB = {
  user_id: string;
  stroke: string;
  distance_m: number;
  time_sec: number;
  date: string;
  meet: string;
};

const emptyWorkout: Workout = {
  date: new Date().toISOString().slice(0, 10),
  distance_m: 0,
  duration_min: 0,
  stroke: "Free",
  rpe: 5,
  notes: "",
};

const emptyComp: Competition = {
  date: new Date().toISOString().slice(0, 10),
  meet: "",
  distance_m: 50,
  stroke: "Free",
  time_sec: 40,
  location: "",
  notes: "",
};

// ---------- Utils ----------
function formatNumber(n: number) {
  return new Intl.NumberFormat().format(n);
}
function pacePer100(distance_m: number, duration_min: number) {
  if (!distance_m || !duration_min) return 0;
  return (duration_min * 100) / (distance_m / 100); // min/100m
}
function minutesToMMSS(min: number) {
  if (!isFinite(min) || min <= 0) return "-";
  const totalSec = Math.round(min * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function secToTime(sec: number) {
  if (!isFinite(sec) || sec <= 0) return "-";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 100);
  return `${m}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}
function timeToSec(t: string) {
  // Accepts MM:SS.xx or M:SS or SS.xx
  const parts = t.split(":");
  if (parts.length === 1) return Number(parts[0]);
  const m = Number(parts[0]);
  const s = Number(parts[1]);
  return m * 60 + s;
}

// ---------- Smaller UI components ----------
function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-4 bg-white shadow">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="col-span-1">
      <label className="text-xs text-gray-600">{label}</label>
      {children}
    </div>
  );
}
function EmailSignIn({ onSubmit }: { onSubmit: (email: string) => void }) {
  const [email, setEmail] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(email); }} className="grid gap-2">
      <input type="email" placeholder="you@example.com" value={email}
             onChange={(e) => setEmail(e.target.value)} required
             className="w-full px-3 py-2 rounded-xl border bg-white" />
      <button type="submit" className="px-3 py-2 rounded-xl bg-blue-600 text-white">Send magic link</button>
    </form>
  );
}

// CSV Import helper
function CSVImport({ onRows }: { onRows: (rows: any[]) => void }) {
  function parseCSV(text: string): any[] {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    const out: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      out.push({
        date: cols[idx("date")]?.trim(),
        distance_m: cols[idx("distance_m")] || cols[idx("distance")] || 0,
        duration_min: cols[idx("duration_min")] || cols[idx("duration")] || 0,
        stroke: cols[idx("stroke")]?.trim() || "Free",
        rpe: cols[idx("rpe")] || null,
        notes: cols[idx("notes")]?.trim() || "",
      });
    }
    return out;
  }
  return (
    <label className="px-3 py-2 rounded-xl bg-gray-100 border cursor-pointer text-sm">
      Import CSV
      <input
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            const text = String(r.result || "");
            const data = parseCSV(text);
            if (!data.length) alert("No rows found. Ensure your CSV has a header row.");
            else onRows(data);
          };
          r.readAsText(f);
          e.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function exportCSV(rows: Workout[]) {
  const header = ["date", "distance_m", "duration_min", "stroke", "rpe", "notes"];
  const body = rows.map((r) =>
    [r.date, r.distance_m, r.duration_min, r.stroke, r.rpe ?? "", (r.notes ?? "").replaceAll(",", " ")].join(",")
  );
  const csv = [header.join(","), ...body].join("\n");
  const el = document.createElement("a");
  el.setAttribute("href", "data:text/csv;charset=utf-8," + encodeURIComponent(csv));
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(":", "-");
  el.setAttribute("download", `swims_${stamp}.csv`);
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
}

// ---------- Main App ----------
export default function App() {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [rows, setRows] = useState<Workout[]>([]);
  const [comps, setComps] = useState<Competition[]>([]);
  const [pbs, setPBs] = useState<PB[]>([]);

  const [draft, setDraft] = useState<Workout>({ ...emptyWorkout });
  const [cdraft, setCDraft] = useState<Competition>({ ...emptyComp });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [ceditingId, setCEditingId] = useState<string | null>(null);

  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();

  // Auth listener
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // Fetch data on login
  useEffect(() => {
    if (!session?.user) return;
    void fetchAll();
  }, [session]);

  async function fetchAll() {
    setLoading(true);
    try {
      const [{ data: w, error: ew }, { data: c, error: ec }, { data: p, error: ep }] = await Promise.all([
        supabase.from("workouts").select("*").order("date", { ascending: false }).limit(500),
        supabase.from("competitions").select("*").order("date", { ascending: false }).limit(500),
        supabase.from("personal_bests").select("*"),
      ]);
      if (ew) throw ew;
      if (ec) throw ec;
      if (ep) throw ep;
      setRows((w ?? []) as any);
      setComps((c ?? []) as any);
      setPBs((p ?? []) as any);
    } catch (e: any) {
      alert(e.message || "Error loading data");
    } finally {
      setLoading(false);
    }
  }

  // Debounce search → query
  useEffect(() => {
    const t = setTimeout(() => startTransition(() => setQuery(search)), 250);
    return () => clearTimeout(t);
  }, [search]);

  // KPIs
  const totals = useMemo(() => {
    const totalDistance = rows.reduce((s, r) => s + (r.distance_m || 0), 0);
    const totalSessions = rows.length;
    const paces = rows.map((r) => pacePer100(r.distance_m, r.duration_min)).filter((p) => p > 0);
    const avgPace100 = paces.length ? paces.reduce((s, p) => s + p, 0) / paces.length : 0;
    return { totalDistance, totalSessions, avgPace100 };
  }, [rows]);

  // Weekly distance chart
  const weeklyChart = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const d = new Date(r.date + "T00:00:00");
      const day = (d.getDay() + 6) % 7; // Mon=0
      const monday = new Date(d);
      monday.setDate(d.getDate() - day);
      const key = monday.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + (r.distance_m || 0));
    }
    return Array.from(map.entries())
      .map(([weekStart, dist]) => ({ weekStart, dist }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }, [rows]);

  // Filtered & paginated rows
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pageSize = 50;
    const base = !q
      ? rows
      : rows.filter(
          (r) =>
            r.date.includes(q) ||
            String(r.distance_m).includes(q) ||
            String(r.duration_min).includes(q) ||
            (r.stroke || "").toLowerCase().includes(q) ||
            (r.notes || "").toLowerCase().includes(q)
        );
    const start = page * pageSize;
    return base.slice(start, start + pageSize);
  }, [rows, query, page]);

  // CRUD: Workouts (optimistic)
  async function saveWorkout(e: React.FormEvent) {
    e.preventDefault();
    const clean: Workout = {
      ...draft,
      distance_m: Math.max(0, Number(draft.distance_m) || 0),
      duration_min: Math.max(0, Number(draft.duration_min) || 0),
      rpe: draft.rpe ? Math.min(10, Math.max(1, Number(draft.rpe))) : undefined,
      stroke: draft.stroke,
    };
    if (!session?.user) return alert("Please sign in first.");

    if (editingId) {
      const idx = rows.findIndex((r) => r.id === editingId);
      const prev = rows[idx];
      const updated = { ...clean, id: editingId } as any;
      setRows((r) => r.map((x) => (x.id === editingId ? updated : x)));
      const { error } = await supabase.from("workouts").update(updated).eq("id", editingId);
      if (error) {
        alert(error.message);
        setRows((r) => r.map((x) => (x.id === editingId ? prev : x)));
      }
    } else {
      const optimistic = { ...clean, id: (crypto as any).randomUUID?.() || String(Math.random()) } as any;
      setRows((r) => [optimistic, ...r]);
      const { data, error } = await supabase
        .from("workouts")
        .insert({ ...clean, user_id: session.user.id })
        .select()
        .single();
      if (error) {
        alert(error.message);
        setRows((r) => r.filter((x) => x.id !== optimistic.id));
      } else {
        setRows((r) => r.map((x) => (x.id === optimistic.id ? (data as any) : x)));
      }
    }
    setEditingId(null);
    setDraft({ ...emptyWorkout });
  }

  function editWorkout(id: string) {
    const r = rows.find((x) => x.id === id);
    if (r) {
      setEditingId(id);
      setDraft({ ...r });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  async function deleteWorkout(id: string) {
    if (!confirm("Delete this session?")) return;
    const prev = rows;
    setRows((r) => r.filter((x) => x.id !== id));
    const { error } = await supabase.from("workouts").delete().eq("id", id);
    if (error) {
      alert(error.message);
      setRows(prev);
    }
  }

  // CRUD: Competitions (optimistic) + PB refresh
  async function saveCompetition(e: React.FormEvent) {
    e.preventDefault();
    const clean: Competition = {
      ...cdraft,
      distance_m: Math.max(25, Number(cdraft.distance_m) || 50),
      time_sec: Math.max(1, Number(cdraft.time_sec) || 40),
    };
    if (!session?.user) return alert("Please sign in first.");

    if (ceditingId) {
      const idx = comps.findIndex((r) => r.id === ceditingId);
      const prev = comps[idx];
      const updated = { ...clean, id: ceditingId } as any;
      setComps((r) => r.map((x) => (x.id === ceditingId ? updated : x)));
      const { error } = await supabase.from("competitions").update(updated).eq("id", ceditingId);
      if (error) {
        alert(error.message);
        setComps((r) => r.map((x) => (x.id === ceditingId ? prev : x)));
      }
    } else {
      const optimistic = { ...clean, id: (crypto as any).randomUUID?.() || String(Math.random()) } as any;
      setComps((r) => [optimistic, ...r]);
      const { data, error } = await supabase
        .from("competitions")
        .insert({ ...clean, user_id: session.user.id })
        .select()
        .single();
      if (error) {
        alert(error.message);
        setComps((r) => r.filter((x) => x.id !== optimistic.id));
      } else {
        setComps((r) => r.map((x) => (x.id === optimistic.id ? (data as any) : x)));
      }
    }
    setCEditingId(null);
    setCDraft({ ...emptyComp });
    setTimeout(() => refreshPBs(), 250);
  }

  function editCompetition(id: string) {
    const r = comps.find((x) => x.id === id);
    if (r) {
      setCEditingId(id);
      setCDraft({ ...r });
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }
  async function deleteCompetition(id: string) {
    if (!confirm("Delete this result?")) return;
    const prev = comps;
    setComps((r) => r.filter((x) => x.id !== id));
    const { error } = await supabase.from("competitions").delete().eq("id", id);
    if (error) {
      alert(error.message);
      setComps(prev);
    }
    setTimeout(() => refreshPBs(), 250);
  }
  async function refreshPBs() {
    const { data, error } = await supabase.from("personal_bests").select("*");
    if (!error) setPBs((data ?? []) as any);
  }

  // Auth actions
  async function signInWithEmail(email: string) {
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) alert(error.message);
    else alert("Check your email for a login link.");
  }
  async function signInProvider(p: "google" | "apple") {
    const { error } = await supabase.auth.signInWithOAuth({ provider: p });
    if (error) alert(error.message);
  }
  async function signOut() {
    await supabase.auth.signOut();
    setRows([]);
    setComps([]);
    setPBs([]);
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-600">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 text-gray-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow p-6">
          <h1 className="text-2xl font-bold mb-2">Swimmer Tracker</h1>
          <p className="text-gray-600 mb-4">Sign in to keep your data synced and private.</p>
          <EmailSignIn onSubmit={signInWithEmail} />
          <div className="my-3 h-px bg-gray-200" />
          <div className="flex gap-2">
            <button onClick={() => signInProvider("google")} className="px-3 py-2 rounded-xl border flex-1">
              Continue with Google
            </button>
            <button onClick={() => signInProvider("apple")} className="px-3 py-2 rounded-xl border flex-1">
              Apple
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated UI
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-bold">
            Swimmer Tracker
          </motion.h1>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden sm:inline text-gray-600">{session.user.email}</span>
            <button onClick={signOut} className="px-3 py-2 rounded-xl border">
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-24">
        {/* KPIs */}
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
          <KPI label="Total Distance" value={`${formatNumber(totals.totalDistance)} m`} />
          <KPI label="Sessions" value={formatNumber(totals.totalSessions)} />
          <KPI label="Avg Pace /100m" value={minutesToMMSS(totals.avgPace100)} />
        </section>

        {/* Weekly Chart */}
        <section className="rounded-2xl p-4 bg-white shadow mt-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Weekly Distance</h2>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={weeklyChart} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="weekStart" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="dist" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Personal Bests */}
        <section className="rounded-2xl p-4 bg-white shadow mt-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold">Personal Bests</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Stroke</th>
                  <th className="p-2">Distance</th>
                  <th className="p-2">Best Time</th>
                  <th className="p-2">Meet</th>
                  <th className="p-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {pbs.map((p) => (
                  <tr key={`${p.stroke}-${p.distance_m}`} className="border-b last:border-0">
                    <td className="p-2">{p.stroke}</td>
                    <td className="p-2">{p.distance_m} m</td>
                    <td className="p-2 font-medium">{secToTime(Number(p.time_sec))}</td>
                    <td className="p-2">{p.meet}</td>
                    <td className="p-2">{p.date}</td>
                  </tr>
                ))}
                {!pbs.length && (
                  <tr>
                    <td className="p-2 text-gray-500" colSpan={5}>
                      Add competition results to see PBs.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Forms */}
        <section className="grid md:grid-cols-2 gap-4 mt-4">
          {/* Training form */}
          <div className="rounded-2xl p-4 bg-white shadow">
            <h2 className="text-lg font-semibold mb-3">{editingId ? "Edit Session" : "Add Session"}</h2>
            <form onSubmit={saveWorkout} className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft((v) => ({ ...v, date: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                />
              </Field>
              <Field label="Stroke">
                <select
                  value={draft.stroke}
                  onChange={(e) => setDraft((v) => ({ ...v, stroke: e.target.value as Workout["stroke"] }))}
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                >
                  <option>Free</option>
                  <option>Back</option>
                  <option>Breast</option>
                  <option>Fly</option>
                  <option>IM</option>
                  <option>Drill</option>
                </select>
              </Field>
              <Field label="Distance (m)">
                <input
                  type="number"
                  inputMode="numeric"
                  value={draft.distance_m}
                  onChange={(e) => setDraft((v) => ({ ...v, distance_m: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                />
              </Field>
              <Field label="Duration (min)">
                <input
                  type="number"
                  inputMode="numeric"
                  value={draft.duration_min}
                  onChange={(e) => setDraft((v) => ({ ...v, duration_min: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                />
              </Field>
              <Field label="RPE (1-10)">
                <input
                  type="number"
                  min={1}
                  max={10}
                  inputMode="numeric"
                  value={draft.rpe ?? 5}
                  onChange={(e) => setDraft((v) => ({ ...v, rpe: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                />
              </Field>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Notes</label>
                <input
                  type="text"
                  value={draft.notes}
                  onChange={(e) => setDraft((v) => ({ ...v, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                  placeholder="Main set, drills, etc."
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white">
                  {editingId ? "Save Changes" : "Add Session"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setDraft({ ...emptyWorkout });
                    }}
                    className="px-3 py-2 rounded-xl border"
                  >
                    Cancel
                  </button>
                )}
                <div className="ml-auto text-sm text-gray-600">
                  Pace/100m: <span className="font-semibold">{minutesToMMSS(pacePer100(draft.distance_m, draft.duration_min))}</span>
                </div>
              </div>
            </form>
          </div>

          {/* Competition form */}
          <div className="rounded-2xl p-4 bg-white shadow">
            <h2 className="text-lg font-semibold mb-3">{ceditingId ? "Edit Competition" : "Add Competition"}</h2>
            <form onSubmit={saveCompetition} className="grid grid-cols-2 gap-3">
              <Field label="Date">
                <input
                  type="date"
                  value={cdraft.date}
                  onChange={(e) => setCDraft((v) => ({ ...v, date: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                />
              </Field>
              <Field label="Meet">
                <input
                  type="text"
                  value={cdraft.meet}
                  onChange={(e) => setCDraft((v) => ({ ...v, meet: e.target.value }))}
                  required
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                />
              </Field>
              <Field label="Stroke">
                <select
                  value={cdraft.stroke}
                  onChange={(e) => setCDraft((v) => ({ ...v, stroke: e.target.value as Competition["stroke"] }))}
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                >
                  <option>Free</option>
                  <option>Back</option>
                  <option>Breast</option>
                  <option>Fly</option>
                  <option>IM</option>
                </select>
              </Field>
              <Field label="Distance (m)">
                <input
                  type="number"
                  inputMode="numeric"
                  value={cdraft.distance_m}
                  onChange={(e) => setCDraft((v) => ({ ...v, distance_m: Number(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                />
              </Field>
              <Field label="Time (MM:SS.xx)">
                <input
                  type="text"
                  value={secToTime(cdraft.time_sec)}
                  onChange={(e) => setCDraft((v) => ({ ...v, time_sec: timeToSec(e.target.value) }))}
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                />
              </Field>
              <Field label="Location">
                <input
                  type="text"
                  value={cdraft.location}
                  onChange={(e) => setCDraft((v) => ({ ...v, location: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                />
              </Field>
              <div className="col-span-2">
                <label className="text-xs text-gray-600">Notes</label>
                <input
                  type="text"
                  value={cdraft.notes}
                  onChange={(e) => setCDraft((v) => ({ ...v, notes: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border bg-white"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <button type="submit" className="px-4 py-2 rounded-xl bg-blue-600 text-white">
                  {ceditingId ? "Save Changes" : "Add Result"}
                </button>
                {ceditingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setCEditingId(null);
                      setCDraft({ ...emptyComp });
                    }}
                    className="px-3 py-2 rounded-xl border"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>
        </section>

        {/* Search */}
        <section className="rounded-2xl p-4 bg-white shadow mt-4">
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search date, stroke, notes…"
              className="flex-1 px-3 py-2 rounded-xl border bg-white"
            />
            <button
              onClick={() => {
                setSearch("");
                setQuery("");
              }}
              className="px-3 py-2 rounded-xl border"
            >
              Clear
            </button>
          </div>
        </section>

        {/* Training table */}
        <section className="rounded-2xl p-2 sm:p-4 bg-white shadow mt-4">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Date</th>
                  <th className="p-2">Stroke</th>
                  <th className="p-2">Distance (m)</th>
                  <th className="p-2">Duration (min)</th>
                  <th className="p-2">Pace /100m</th>
                  <th className="p-2">RPE</th>
                  <th className="p-2">Notes</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-2 whitespace-nowrap">{r.date}</td>
                    <td className="p-2 whitespace-nowrap">{r.stroke}</td>
                    <td className="p-2 whitespace-nowrap">{formatNumber(r.distance_m)}</td>
                    <td className="p-2 whitespace-nowrap">{r.duration_min}</td>
                    <td className="p-2 whitespace-nowrap">
                      {minutesToMMSS(pacePer100(r.distance_m, r.duration_min))}
                    </td>
                    <td className="p-2 whitespace-nowrap">{r.rpe ?? "-"}</td>
                    <td className="p-2">{r.notes}</td>
                    <td className="p-2 whitespace-nowrap text-right">
                      <button onClick={() => editWorkout(r.id!)} className="px-2 py-1 rounded-lg border mr-1">
                        Edit
                      </button>
                      <button onClick={() => deleteWorkout(r.id!)} className="px-2 py-1 rounded-lg border">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td className="text-center text-gray-500 py-8" colSpan={8}>
                      No sessions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {/* Pagination */}
            <div className="flex items-center justify-between p-2 text-sm text-gray-600">
              <button
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="px-3 py-2 rounded-xl border disabled:opacity-50"
              >
                Prev
              </button>
              <div className="opacity-70">Page {page + 1}</div>
              <button onClick={() => setPage((p) => p + 1)} className="px-3 py-2 rounded-xl border">
                Next
              </button>
            </div>
          </div>
        </section>

        {/* Competitions table */}
        <section className="rounded-2xl p-2 sm:p-4 bg-white shadow mt-4">
          <h2 className="text-lg font-semibold px-2">Competitions</h2>
          <div className="overflow-x-auto mt-2">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Date</th>
                  <th className="p-2">Meet</th>
                  <th className="p-2">Stroke</th>
                  <th className="p-2">Distance</th>
                  <th className="p-2">Time</th>
                  <th className="p-2">Location</th>
                  <th className="p-2">Notes</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {comps.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="p-2 whitespace-nowrap">{r.date}</td>
                    <td className="p-2 whitespace-nowrap">{r.meet}</td>
                    <td className="p-2 whitespace-nowrap">{r.stroke}</td>
                    <td className="p-2 whitespace-nowrap">{r.distance_m} m</td>
                    <td className="p-2 whitespace-nowrap font-medium">{secToTime(Number(r.time_sec))}</td>
                    <td className="p-2 whitespace-nowrap">{r.location}</td>
                    <td className="p-2">{r.notes}</td>
                    <td className="p-2 whitespace-nowrap text-right">
                      <button onClick={() => editCompetition(r.id!)} className="px-2 py-1 rounded-lg border mr-1">
                        Edit
                      </button>
                      <button onClick={() => deleteCompetition(r.id!)} className="px-2 py-1 rounded-lg border">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!comps.length && (
                  <tr>
                    <td className="text-center text-gray-500 py-8" colSpan={8}>
                      No competition results yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Import/Export */}
        <section className="rounded-2xl p-4 bg-white shadow mt-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CSVImport
              onRows={async (rows) => {
                if (!session?.user) return alert("Please sign in first.");
                // Bulk insert with validation; chunk to avoid freezes
                const cleaned = rows.map((r) => ({
                  date: r.date ?? new Date().toISOString().slice(0, 10),
                  distance_m: Math.max(0, Number(r.distance_m) || 0),
                  duration_min: Math.max(0, Number(r.duration_min) || 0),
                  stroke: ["Free", "Back", "Breast", "Fly", "IM", "Drill"].includes(String(r.stroke)) ? r.stroke : "Free",
                  rpe: r.rpe ? Math.min(10, Math.max(1, Number(r.rpe))) : null,
                  notes: r.notes ?? null,
                  user_id: session.user.id,
                }));
                for (let i = 0; i < cleaned.length; i += 500) {
                  const { error } = await supabase.from("workouts").insert(cleaned.slice(i, i + 500));
                  if (error) {
                    alert(error.message);
                    break;
                  }
                }
                await fetchAll();
              }}
            />
            <button onClick={() => exportCSV(rows)} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-sm">
              Export CSV
            </button>
          </div>
        </section>

        <footer className="text-center text-xs text-gray-500 mt-8 mb-10">
          Tip: Add this page to your phone's Home Screen for an app-like experience.
        </footer>
      </main>
    </div>
  );
}
