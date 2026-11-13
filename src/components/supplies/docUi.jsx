import { useEffect, useState } from 'react';
import { openSupplyDoc, signedUrls } from '../../hooks/useSupplies';
import { isImagePath } from './supplyUi';

// Thumbnails for library documents. The bucket is private, so image previews
// come through short-lived signed URLs, fetched in one call per list.
export function useThumbs(docs) {
  const paths = docs.map((d) => d.doc_path).filter(isImagePath);
  const key = paths.join('|');
  const [urls, setUrls] = useState({});
  useEffect(() => {
    let live = true;
    signedUrls(key ? key.split('|') : []).then((u) => live && setUrls(u));
    return () => { live = false; };
  }, [key]);
  return urls;
}

// Image → the picture; anything else → a 📄 tile with the file type.
// Click opens the original in a new tab.
export function DocThumb({ doc, url, size = 56 }) {
  const ext = (doc.doc_path.split('.').pop() || '').toUpperCase();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); openSupplyDoc(doc.doc_path); }}
      onDoubleClick={(e) => e.stopPropagation()}
      title={`Open ${doc.title}`}
      className="shrink-0 rounded border border-lt bg-bg overflow-hidden flex items-center justify-center hover:border-pk"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt={doc.title} className="w-full h-full object-cover" />
      ) : (
        <span className="text-center leading-tight">
          <span className="block text-[18px]">📄</span>
          <span className="block text-[8px] font-bold text-gr">{ext}</span>
        </span>
      )}
    </button>
  );
}
