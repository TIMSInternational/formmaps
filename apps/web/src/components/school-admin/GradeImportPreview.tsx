import React from "react";

interface Props {
  rows: any[];
  limit?: number;
}

export default function GradeImportPreview({ rows, limit = 10 }: Props) {
  if (!rows || rows.length === 0) return null;

  const keys = Object.keys(rows[0]);

  return (
    <div className="overflow-x-auto max-h-64 border rounded">
      <table className="w-full text-sm table-auto">
        <thead className="bg-gray-50">
          <tr>
            {keys.slice(0, 8).map((col) => (
              <th key={col} className="p-2 text-left font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, limit).map((r, idx) => (
            <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              {Object.values(r).slice(0, 8).map((v, j) => (
                <td key={j} className="p-2 text-xs text-gray-700">{String(v)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
