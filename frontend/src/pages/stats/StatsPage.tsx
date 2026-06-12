import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, isAuthed, type ActivitySummary } from '../../services/api';
import { SESSION_META } from '../plan/sessionMeta';
import { formatDuration, formatPace } from '../track/trackingMath';
import {
  currentStreak,
  hrTrend,
  paceTrend,
  totals,
  trainingLoad,
  typeDistribution,
  weeklyVolume,
} from './statsMath';
import type { SessionType } from '../../types';

const AXIS = { stroke: '#6B7280', fontSize: 11 };
const TOOLTIP_STYLE = {
  background: '#1A1D27',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  fontSize: 12,
};

function typeColor(t: string): string {
  return t === 'libre' ? '#6B7280' : SESSION_META[t as SessionType]?.color ?? '#6B7280';
}
function typeLabel(t: string): string {
  return t === 'libre' ? 'Course libre' : SESSION_META[t as SessionType]?.label ?? t;
}

export default function StatsPage() {
  const navigate = useNavigate();
  const [acts, setActs] = useState<ActivitySummary[] | null>(null);

  useEffect(() => {
    if (!isAuthed()) {
      navigate('/auth?next=/stats', { replace: true });
      return;
    }
    api.getActivities().then((r) => setActs(r.activities)).catch(() => setActs([]));
  }, [navigate]);

  const stats = useMemo(() => {
    if (!acts) return null;
    return {
      volume: weeklyVolume(acts),
      pace: paceTrend(acts),
      dist: typeDistribution(acts),
      hr: hrTrend(acts),
      streak: currentStreak(acts),
      total: totals(acts),
      load: trainingLoad(acts),
    };
  }, [acts]);

  if (!stats) {
    return <div className="min-h-screen flex items-center justify-center text-muted">Chargement…</div>;
  }

  if (!acts?.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-muted">Aucune course enregistrée — tes statistiques apparaîtront ici.</p>
        <Link to="/track" className="btn-primary">▶︎ Démarrer une course</Link>
        <Link to="/dashboard" className="text-muted text-sm">← Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-6">
      <div className="mx-auto max-w-xl space-y-5">
        <header>
          <Link to="/dashboard" className="text-muted text-sm hover:text-text">← Dashboard</Link>
          <h1 className="text-2xl mt-1">Statistiques</h1>
        </header>

        {/* Form indicators */}
        <div className="grid grid-cols-3 gap-3">
          <Indicator label="Fitness (CTL)" value={String(stats.load.ctl)} />
          <Indicator label="Fatigue (ATL)" value={String(stats.load.atl)} />
          <Indicator
            label="Forme (TSB)"
            value={(stats.load.tsb > 0 ? '+' : '') + stats.load.tsb}
            color={stats.load.tsb >= 0 ? '#00C853' : '#FF6B35'}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Indicator label="Streak" value={`🔥 ${stats.streak}`} />
          <Indicator label="Total" value={`${stats.total.distanceKm.toFixed(0)} km`} />
          <Indicator label="Temps" value={formatDuration(stats.total.durationSec)} />
        </div>

        {/* Weekly volume */}
        <Chart title="Volume hebdomadaire (km)">
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={stats.volume} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" {...AXIS} interval={1} />
              <YAxis {...AXIS} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="km" fill="#00C853" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Chart>

        {/* Pace progression */}
        {stats.pace.length > 1 && (
          <Chart title="Progression de l'allure (min/km · plus bas = plus rapide)">
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={stats.pace} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" {...AXIS} />
                <YAxis {...AXIS} reversed domain={['dataMin - 0.3', 'dataMax + 0.3']} tickFormatter={(v) => formatPace(v * 60)} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${formatPace(v * 60)} /km`, 'Allure']} />
                <Line type="monotone" dataKey="pace" stroke="#FF6B35" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Chart>
        )}

        {/* Type distribution */}
        <Chart title="Répartition des types de séances">
          <div className="flex items-center gap-2">
            <ResponsiveContainer width="50%" height={170}>
              <PieChart>
                <Pie data={stats.dist} dataKey="count" nameKey="type" innerRadius={35} outerRadius={70} paddingAngle={2}>
                  {stats.dist.map((d) => (
                    <Cell key={d.type} fill={typeColor(d.type)} stroke="#0F1117" />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, _n, p: any) => [`${v} séances`, typeLabel(p.payload.type)]} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex-1 space-y-1 text-sm">
              {stats.dist.map((d) => (
                <li key={d.type} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: typeColor(d.type) }} />
                  <span className="flex-1 truncate">{typeLabel(d.type)}</span>
                  <span className="metric text-muted">{d.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </Chart>

        {/* HR trend */}
        {stats.hr.length > 1 && (
          <Chart title="Fréquence cardiaque moyenne (bpm)">
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={stats.hr} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" {...AXIS} />
                <YAxis {...AXIS} domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} bpm`, 'FC moy.']} />
                <Line type="monotone" dataKey="hr" stroke="#EF4444" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </Chart>
        )}

        <Link to="/history" className="btn-ghost w-full">📜 Voir l'historique détaillé</Link>
      </div>
    </div>
  );
}

function Indicator({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card p-3 text-center">
      <p className="metric text-xl font-bold" style={color ? { color } : undefined}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted mt-0.5">{label}</p>
    </div>
  );
}

function Chart({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-muted mb-2">{title}</p>
      {children}
    </div>
  );
}
