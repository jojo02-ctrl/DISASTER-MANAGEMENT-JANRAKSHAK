"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
export default function ConfidenceChart({ data }: { data: { bucket: string; n: number }[] }) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <XAxis dataKey="bucket" tick={{ fill: "#6b6b70", fontSize: 9 }} axisLine={{ stroke: "#1c1c1f" }} tickLine={false} />
          <YAxis tick={{ fill: "#6b6b70", fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#0b0b0c", border: "1px solid #1c1c1f", fontSize: 11 }} />
          <Bar dataKey="n" fill="#ff5a1f" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
