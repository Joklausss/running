/** GitHub-style activity heatmap. Columns = weeks, rows = Mon→Sun. */
export default function Heatmap({ data }: { data: { date: string; km: number }[] }) {
  // chunk the flat day list (starts on a Monday) into week columns of 7
  const weeks: { date: string; km: number }[][] = [];
  for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i + 7));

  const color = (km: number) => {
    if (km <= 0) return '#222632';
    if (km < 3) return 'rgba(0,200,83,0.35)';
    if (km < 6) return 'rgba(0,200,83,0.55)';
    if (km < 10) return 'rgba(0,200,83,0.78)';
    return '#00C853';
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <div className="flex gap-[3px] overflow-x-auto pb-1">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((d) => (
            <div
              key={d.date}
              title={`${d.date} · ${d.km} km`}
              className="w-3 h-3 rounded-[3px]"
              style={{
                background: color(d.km),
                outline: d.date === todayKey ? '1px solid #E8EAED' : 'none',
                outlineOffset: '1px',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
