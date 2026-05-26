import { useState } from 'react';
import UploadPipeline from '../components/UploadPipeline';
import UploadLog from '../components/UploadLog';
import { PARSER_LIST } from '../parsers';

// Day 2 hub for exercising every parser + the upload log. On Day 4 the same
// <UploadPipeline> gets embedded into the per-warehouse Inventory sections;
// this page stays as the all-uploads + history view.
export default function Uploads() {
  const [refreshKey, setRefreshKey] = useState(0);
  const bumpLog = () => setRefreshKey((k) => k + 1);

  return (
    <div>
      <h1 className="text-xl font-bold text-dk mb-1">Uploads</h1>
      <div className="text-[10px] uppercase tracking-wider text-gr mb-4">
        Day 2 — parsers + pipeline
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 mb-6">
        {PARSER_LIST.map((parser) => (
          <UploadPipeline key={parser.type} parser={parser} onComplete={bumpLog} />
        ))}
      </div>

      <UploadLog refreshKey={refreshKey} />
    </div>
  );
}
