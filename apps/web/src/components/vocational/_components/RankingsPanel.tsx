import type { Rankings } from "@/services/vocationalReportService";

const CARD = "bg-white rounded-xl shadow-sm border border-gray-100 p-5";

export function RankingsPanel({ rankings }: { rankings: Rankings }) {
  return (
    <div className={CARD}>
      <p className="text-sm font-semibold text-gray-900 mb-4">Interests &amp; preferences</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Top interest areas</p>
          <ol className="space-y-1 list-decimal list-inside">
            {rankings.interests.slice(0, 10).map((i) => (
              <li key={i.value} className="text-sm text-gray-700">{i.value}</li>
            ))}
            {rankings.interests.length === 0 && <li className="text-sm text-gray-400 list-none">No data yet</li>}
          </ol>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Top industries</p>
          <ul className="space-y-1">
            {rankings.industries.slice(0, 10).map((i) => (
              <li key={i.value} className="text-sm text-gray-700">{i.value}</li>
            ))}
            {rankings.industries.length === 0 && <li className="text-sm text-gray-400">No data yet</li>}
          </ul>
          {rankings.workType && (
            <p className="text-sm text-gray-700 mt-3"><span className="font-medium">Preferred work type:</span> {rankings.workType.value}</p>
          )}
        </div>
      </div>
      {rankings.openInsights.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">In their words</p>
          <ul className="space-y-2">
            {rankings.openInsights.map((o, idx) => (
              <li key={idx} className="text-sm text-gray-600 border-l-2 pl-3" style={{ borderColor: "#2E9098" }}>
                <span className="capitalize text-gray-400 text-xs mr-2">{o.group}:</span>{o.text}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default RankingsPanel;
