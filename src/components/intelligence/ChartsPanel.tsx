"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type ChartData = {
  salesByMonth: Array<{ month: string; sales: number }>;
  salesBySalesman: Array<{ name: string; sales: number; target: number }>;
  salesByProduct: Array<{ name: string; sales: number }>;
  targetVsActual: Array<{ name: string; target: number; actual: number }>;
  visitsVsSales: Array<{ month: string; visits: number; sales: number }>;
  samplesVsConversion: Array<{ name: string; value: number }>;
  funnel: Array<{ stage: string; value: number }>;
  ranking: Array<{ name: string; achievement: number; sales: number }>;
};

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      <div className="h-56 w-full">{children}</div>
    </section>
  );
}

export function ChartsPanel({ data }: { data: ChartData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 print:hidden">
      <Card title="Sales by Month">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.salesByMonth}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="sales" stroke="#0f766e" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Sales by Salesman">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.salesBySalesman.slice(0, 8)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="sales" fill="#0f766e" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Sales by Product">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.salesByProduct.slice(0, 8)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="sales" fill="#b45309" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Target vs Actual">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.targetVsActual.slice(0, 8)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} height={50} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="target" fill="#a8a29e" />
            <Bar dataKey="actual" fill="#0f766e" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Visits vs Sales">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.visitsVsSales}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="visits" stroke="#0369a1" />
            <Line type="monotone" dataKey="sales" stroke="#0f766e" />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Party Development Funnel">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.funnel} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="stage" width={90} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" fill="#b45309" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Samples vs Conversion">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.samplesVsConversion}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" fill="#0369a1" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Salesman Ranking (Achievement %)">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.ranking.slice(0, 8)}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} height={50} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="achievement" fill="#0f766e" />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
