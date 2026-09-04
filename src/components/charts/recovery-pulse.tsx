"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  date: string;
  risk: number;
  recovered: number;
  expected?: number;
  activity?: number;
};

export function RecoveryPulseChart({ data }: { data: Point[] }) {
  const chartData = data.map((d) => ({
    ...d,
    expected: d.expected ?? d.activity ?? 0,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="risk" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e07a6a" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#e07a6a" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="recovered" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#5dbe8a" stopOpacity={0.4} />
              <stop offset="100%" stopColor="#5dbe8a" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expected" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4a574" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#d4a574" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1e2230" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6b675e", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => String(v).slice(5)}
          />
          <YAxis
            tick={{ fill: "#6b675e", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
            width={72}
          />
          <Tooltip
            contentStyle={{
              background: "#181b24",
              border: "1px solid #2a2e3a",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#9a958a" }}
            formatter={(value, name) => [
              `₹${Number(value).toLocaleString("en-IN")}`,
              name === "risk"
                ? "Revenue at risk"
                : name === "expected"
                  ? "Expected recovery (model)"
                  : "Actual recovered",
            ]}
          />
          <Area
            type="monotone"
            dataKey="risk"
            name="risk"
            stroke="#e07a6a"
            fill="url(#risk)"
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="expected"
            name="expected"
            stroke="#d4a574"
            fill="url(#expected)"
            strokeWidth={1.2}
          />
          <Area
            type="monotone"
            dataKey="recovered"
            name="recovered"
            stroke="#5dbe8a"
            fill="url(#recovered)"
            strokeWidth={1.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
