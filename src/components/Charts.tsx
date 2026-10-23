"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ReferenceLine, CartesianGrid } from "recharts";
const tip = { background: "#0b0b0c", border: "1px solid #1c1c1f", fontSize: 11 };
const ax = { fill: "#6b6b70", fontSize: 10 };
export function CandidateChart({ data }: { data: { candidate: string; [task: string]: number | string }[]; }) {
  const tasks = Object.keys(data[0] ?? {}).filter((k) => k !== "candidate");
  const colors = ["#ff5a1f", "#e8e8ea", "#8a8a90", "#4a4a50"];
  return (
    <div className="h-64"><ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#151517" vertical={false} />
        <XAxis dataKey="candidate" tick={ax} axisLine={{ stroke: "#1c1c1f" }} tickLine={false} />
        <YAxis domain={[0, 1]} tick={ax} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={tip} />
        <Legend wrapperStyle={{ fontSize: 10 }} />
        {tasks.map((t, i) => <Bar key={t} dataKey={t} fill={colors[i % colors.length]} radius={[2, 2, 0, 0]} />)}
      </BarChart></ResponsiveContainer></div>
  );
}
export function ReliabilityChart({ data }: { data: { avg_confidence: number; accuracy: number; count: number }[] }) {
  const pts = data.map((d) => ({ x: +d.avg_confidence.toFixed(2), acc: +d.accuracy.toFixed(3), count: d.count }));
  return (
    <div className="h-52"><ResponsiveContainer width="100%" height="100%">
      <LineChart data={pts} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="#151517" />
        <XAxis dataKey="x" type="number" domain={[0, 1]} tick={ax} axisLine={{ stroke: "#1c1c1f" }} tickLine={false} />
        <YAxis domain={[0, 1]} tick={ax} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tip} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#3a3a40" strokeDasharray="3 3" />
        <Line type="monotone" dataKey="acc" stroke="#ff5a1f" dot={{ r: 3, fill: "#ff5a1f" }} name="accuracy" />
      </LineChart></ResponsiveContainer></div>
  );
}
export function ConfusionMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  const max = Math.max(1, ...matrix.flat());
  return (
    <div className="overflow-auto"><table className="mono text-[10px]">
      <thead><tr><th className="p-1 text-left text-[var(--muted)] font-normal">true ↓ / pred →</th>{labels.map((l) => <th key={l} className="p-1 text-[var(--muted)] font-normal max-w-[70px] truncate" title={l}>{l.slice(0, 10)}</th>)}</tr></thead>
      <tbody>{matrix.map((row, i) => (<tr key={i}><td className="p-1 text-[var(--muted)] whitespace-nowrap" title={labels[i]}>{labels[i].slice(0, 18)}</td>{row.map((v, j) => (<td key={j} className="p-1 text-center" style={{ background: `rgba(255,90,31,${(v / max) * 0.85})`, color: v / max > 0.5 ? "#000" : "#e8e8ea", border: i === j ? "1px solid rgba(255,255,255,0.25)" : "1px solid #151517" }}>{v}</td>))}</tr>))}</tbody>
    </table></div>
  );
}
