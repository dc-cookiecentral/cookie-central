// Generic placeholder used by Day 1 routes. Replaced with real pages in
// Days 2-6 (Product Orders, Payments, Inventory, etc.).
export default function PageStub({ title, day, scope }) {
  return (
    <div>
      <h1 className="text-xl font-bold text-dk mb-1">{title}</h1>
      <div className="text-[10px] uppercase tracking-wider text-gr mb-4">
        Day {day} — not built yet
      </div>
      <div className="bg-cd border border-lt rounded-xl p-6 text-sm text-md max-w-xl">
        {scope}
      </div>
    </div>
  );
}
