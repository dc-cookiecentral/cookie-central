import { useMemo, useState, Fragment } from "react";
import { useDemandFeeds } from "../hooks/useDemandFeeds";
import { walmartWeekOf } from "../parsers/retailLinkSupplyPlan";
import { ComposedChart, Line, Bar, LabelList, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from "recharts";

/* Cookie Central — Walmart Demand Planner
   Ported in from the standalone preview artifact, ENGINE AND DATA UNCHANGED.
   The formulas are specified in `demand-planner-formulas.md` and were
   cross-validated against the Excel workbook on 23 checks; don't "tidy" the
   engine without re-running that comparison.

   DATA SOURCES — the demand side is live, the supply side is not.

   `useDemandFeeds` reads the Retail Link tables (retail_link_pos_weekly,
   retail_link_forecast, retail_link_otif) and supplies pos / forecasts /
   dotService. They are populated by uploading the weekly Walmart exports at
   Uploads → Retail Link; see src/parsers/retailLink.js.

   Each of those series falls back to `SEED` independently when its table is
   missing or empty, so this page renders identically before the migration is
   applied, after it is applied but before the first upload, and after. The
   banner reports which source actually won — do not replace it with a flat
   "live" or "static" claim, because it is genuinely both.

   ⚠️ `production` is still SEED (production_runs holds 5 rows).

   DOT ON-HAND is live from Oct 28 2026: DOT's Inventory Snapshot upload writes
   `dot_on_hand`, one reading per SKU per Walmart week, taken as that week's
   CLOSING stock (`c.dotActual`, so `dotUsed` = the reading). The cascade opens
   each later week from it. Weeks before the first reading, and SKUs with no
   reading, still open from params.dotOpeningAnchor — those stay a model.

   ⚠️ The DOT Order History export we receive is EXCEPTION-FILTERED — every row
   in the sample carried a cut — so it cannot stand in for total depot
   deliveries and does NOT drive the cascade. It is surfaced in the Tracker as
   its own row. See the note at c.dotOut.

   ⚠️ SEED is a STALE snapshot, not a reference answer. Walmart restates POS:
   week 202622 reads 1322 units for PBG in SEED and 2343 in the WK28 export.
   So "the live feed reproduces SEED" is NOT the acceptance test — a live
   number differing from SEED on a restated week is the feed working.

   The paste-and-go Inputs tab was REMOVED on Aug 24 2026 — every feed it
   duplicated now has a real, persisted upload path at /uploads, and keeping a
   second lossy ingest route invited two sources of truth. Tracker edits
   (seasonality multiplier, consensus override) still live in component state
   for the session and are lost on reload. */

const SEED = {"weeks":[{"wk":202605,"start":"2026-02-28"},{"wk":202606,"start":"2026-03-07"},{"wk":202607,"start":"2026-03-14"},{"wk":202608,"start":"2026-03-21"},{"wk":202609,"start":"2026-03-28"},{"wk":202610,"start":"2026-04-04"},{"wk":202611,"start":"2026-04-11"},{"wk":202612,"start":"2026-04-18"},{"wk":202613,"start":"2026-04-25"},{"wk":202614,"start":"2026-05-02"},{"wk":202615,"start":"2026-05-09"},{"wk":202616,"start":"2026-05-16"},{"wk":202617,"start":"2026-05-23"},{"wk":202618,"start":"2026-05-30"},{"wk":202619,"start":"2026-06-06"},{"wk":202620,"start":"2026-06-13"},{"wk":202621,"start":"2026-06-20"},{"wk":202622,"start":"2026-06-27"},{"wk":202623,"start":"2026-07-04"},{"wk":202624,"start":"2026-07-11"},{"wk":202625,"start":"2026-07-18"},{"wk":202626,"start":"2026-07-25"},{"wk":202627,"start":"2026-08-01"},{"wk":202628,"start":"2026-08-08"},{"wk":202629,"start":"2026-08-15"},{"wk":202630,"start":"2026-08-22"},{"wk":202631,"start":"2026-08-29"},{"wk":202632,"start":"2026-09-05"},{"wk":202633,"start":"2026-09-12"},{"wk":202634,"start":"2026-09-19"},{"wk":202635,"start":"2026-09-26"},{"wk":202636,"start":"2026-10-03"},{"wk":202637,"start":"2026-10-10"},{"wk":202638,"start":"2026-10-17"},{"wk":202639,"start":"2026-10-24"},{"wk":202640,"start":"2026-10-31"},{"wk":202641,"start":"2026-11-07"},{"wk":202642,"start":"2026-11-14"},{"wk":202643,"start":"2026-11-21"},{"wk":202644,"start":"2026-11-28"},{"wk":202645,"start":"2026-12-05"},{"wk":202646,"start":"2026-12-12"},{"wk":202647,"start":"2026-12-19"},{"wk":202648,"start":"2026-12-26"},{"wk":202649,"start":"2027-01-02"},{"wk":202650,"start":"2027-01-09"},{"wk":202651,"start":"2027-01-16"},{"wk":202652,"start":"2027-01-23"}],"pos":[{"wk":202543,"sku":"PBG","units":0,"dollars":0.0,"storesSelling":0,"traited":2,"instock":0.0,"oh":0},{"wk":202601,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202602,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202603,"sku":"PBG","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202603,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":3,"instock":0.0,"oh":0},{"wk":202604,"sku":"CCF","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202604,"sku":"PBG","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202604,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":3,"instock":0.0,"oh":0},{"wk":202605,"sku":"PBG","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202605,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":3,"instock":0.0,"oh":0},{"wk":202606,"sku":"PBG","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202606,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":3,"instock":0.0,"oh":0},{"wk":202607,"sku":"PBG","units":0,"dollars":0.0,"storesSelling":0,"traited":2,"instock":0.0,"oh":0},{"wk":202607,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":3,"instock":0.0,"oh":0},{"wk":202608,"sku":"PBG","units":98,"dollars":478.48,"storesSelling":83,"traited":2787,"instock":0.9307,"oh":17488},{"wk":202608,"sku":"WC","units":205,"dollars":1003.62,"storesSelling":153,"traited":2787,"instock":0.9232,"oh":17553},{"wk":202609,"sku":"PBG","units":1772,"dollars":8645.0,"storesSelling":919,"traited":2789,"instock":0.943,"oh":33252},{"wk":202609,"sku":"WC","units":3104,"dollars":15168.16,"storesSelling":1188,"traited":2787,"instock":0.9354,"oh":32813},{"wk":202610,"sku":"PBG","units":3331,"dollars":16275.84,"storesSelling":1523,"traited":2791,"instock":0.9678,"oh":32548},{"wk":202610,"sku":"WC","units":6479,"dollars":31660.01,"storesSelling":1935,"traited":2790,"instock":0.9667,"oh":31511},{"wk":202611,"sku":"PBG","units":3462,"dollars":16824.19,"storesSelling":1651,"traited":2795,"instock":0.985,"oh":33723},{"wk":202611,"sku":"WC","units":6829,"dollars":33267.25,"storesSelling":2169,"traited":2792,"instock":0.9853,"oh":33208},{"wk":202612,"sku":"CCF","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202612,"sku":"PBG","units":3575,"dollars":17389.4,"storesSelling":1716,"traited":2799,"instock":0.985,"oh":33998},{"wk":202612,"sku":"WC","units":7359,"dollars":35868.88,"storesSelling":2288,"traited":2793,"instock":0.9871,"oh":33301},{"wk":202613,"sku":"PBG","units":3256,"dollars":15903.02,"storesSelling":1663,"traited":2802,"instock":0.9839,"oh":31779},{"wk":202613,"sku":"WC","units":6734,"dollars":32902.04,"storesSelling":2288,"traited":2796,"instock":0.9857,"oh":29834},{"wk":202614,"sku":"PBG","units":3172,"dollars":15451.39,"storesSelling":1654,"traited":2802,"instock":0.985,"oh":29814},{"wk":202614,"sku":"WC","units":6603,"dollars":32265.24,"storesSelling":2256,"traited":2797,"instock":0.9868,"oh":27820},{"wk":202615,"sku":"PBG","units":2795,"dollars":13622.27,"storesSelling":1542,"traited":2802,"instock":0.9847,"oh":28231},{"wk":202615,"sku":"WC","units":5980,"dollars":29174.67,"storesSelling":2209,"traited":2797,"instock":0.9864,"oh":27042},{"wk":202616,"sku":"PBG","units":2750,"dollars":13443.54,"storesSelling":1554,"traited":2803,"instock":0.985,"oh":26954},{"wk":202616,"sku":"WC","units":5985,"dollars":29251.19,"storesSelling":2179,"traited":2799,"instock":0.9857,"oh":26889},{"wk":202617,"sku":"CCF","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202617,"sku":"PBG","units":2600,"dollars":12617.78,"storesSelling":1503,"traited":2806,"instock":0.9825,"oh":25921},{"wk":202617,"sku":"WC","units":5833,"dollars":28392.03,"storesSelling":2172,"traited":2801,"instock":0.9839,"oh":26567},{"wk":202618,"sku":"CCF","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202618,"sku":"PBG","units":2745,"dollars":13230.85,"storesSelling":1520,"traited":2806,"instock":0.9808,"oh":24417},{"wk":202618,"sku":"WC","units":6123,"dollars":29643.58,"storesSelling":2233,"traited":2804,"instock":0.9811,"oh":25608},{"wk":202619,"sku":"CCF","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202619,"sku":"PBG","units":2373,"dollars":11540.36,"storesSelling":1379,"traited":2817,"instock":0.9567,"oh":22066},{"wk":202619,"sku":"WC","units":5402,"dollars":26340.2,"storesSelling":2109,"traited":2805,"instock":0.969,"oh":23396},{"wk":202620,"sku":"CCF","units":0,"dollars":0.0,"storesSelling":0,"traited":10,"instock":0.1,"oh":9},{"wk":202620,"sku":"PBG","units":2731,"dollars":10841.44,"storesSelling":1423,"traited":2817,"instock":0.9258,"oh":20048},{"wk":202620,"sku":"WC","units":5928,"dollars":25571.15,"storesSelling":2060,"traited":2807,"instock":0.964,"oh":22127},{"wk":202621,"sku":"CCF","units":216,"dollars":1041.78,"storesSelling":172,"traited":3043,"instock":0.8505,"oh":15911},{"wk":202621,"sku":"PBG","units":3137,"dollars":9419.66,"storesSelling":1374,"traited":2922,"instock":0.6502,"oh":19253},{"wk":202621,"sku":"WC","units":6498,"dollars":23283.78,"storesSelling":2059,"traited":3308,"instock":0.718,"oh":23379},{"wk":202622,"sku":"CCF","units":2471,"dollars":12052.87,"storesSelling":1225,"traited":3045,"instock":0.908,"oh":36701},{"wk":202622,"sku":"PBG","units":1322,"dollars":6463.56,"storesSelling":823,"traited":2923,"instock":0.6124,"oh":16775},{"wk":202622,"sku":"WC","units":4035,"dollars":19713.8,"storesSelling":1616,"traited":3311,"instock":0.6853,"oh":20527},{"wk":202623,"sku":"CCF","units":3742,"dollars":18299.71,"storesSelling":1745,"traited":3047,"instock":0.9196,"oh":38605},{"wk":202623,"sku":"PBG","units":1076,"dollars":5264.68,"storesSelling":735,"traited":2924,"instock":0.5889,"oh":14304},{"wk":202623,"sku":"WC","units":3199,"dollars":15642.29,"storesSelling":1460,"traited":3311,"instock":0.6705,"oh":16958},{"wk":202624,"sku":"CCF","units":4197,"dollars":20531.86,"storesSelling":1957,"traited":3049,"instock":0.9436,"oh":35495},{"wk":202624,"sku":"PBG","units":1333,"dollars":6504.95,"storesSelling":832,"traited":2925,"instock":0.6277,"oh":16700},{"wk":202624,"sku":"WC","units":4146,"dollars":20228.8,"storesSelling":1743,"traited":3313,"instock":0.7371,"oh":21216},{"wk":202625,"sku":"CCF","units":4350,"dollars":21265.47,"storesSelling":2006,"traited":3053,"instock":0.9473,"oh":33100},{"wk":202625,"sku":"PBG","units":1288,"dollars":6293.12,"storesSelling":819,"traited":2929,"instock":0.6234,"oh":16158},{"wk":202625,"sku":"WC","units":4360,"dollars":21254.49,"storesSelling":1801,"traited":3316,"instock":0.7223,"oh":20798},{"wk":202626,"sku":"CCF","units":4140,"dollars":20242.08,"storesSelling":1979,"traited":3056,"instock":0.9705,"oh":33195},{"wk":202626,"sku":"PBG","units":1266,"dollars":6188.28,"storesSelling":826,"traited":2928,"instock":0.6861,"oh":17665},{"wk":202626,"sku":"WC","units":4051,"dollars":19759.05,"storesSelling":1769,"traited":3319,"instock":0.7752,"oh":21667},{"wk":202627,"sku":"CCF","units":4362,"dollars":21311.61,"storesSelling":2068,"traited":3066,"instock":0.9759,"oh":32673},{"wk":202627,"sku":"PBG","units":1482,"dollars":7167.1,"storesSelling":924,"traited":2934,"instock":0.6936,"oh":20104},{"wk":202627,"sku":"WC","units":4975,"dollars":24206.8,"storesSelling":2001,"traited":3324,"instock":0.7906,"oh":24721}],"orders":[{"wk":202607,"sku":"PBG","req":3087,"dlv":2667,"rev":98572.32,"cuts":0},{"wk":202607,"sku":"WC","req":3087,"dlv":2667,"rev":98572.32,"cuts":0},{"wk":202608,"sku":"PBG","req":2581,"dlv":3001,"rev":110916.96,"cuts":0},{"wk":202608,"sku":"WC","req":2540,"dlv":2960,"rev":109401.6,"cuts":0},{"wk":202609,"sku":"PBG","req":968,"dlv":23,"rev":850.08,"cuts":0},{"wk":202609,"sku":"WC","req":945,"dlv":21,"rev":776.16,"cuts":0},{"wk":202610,"sku":"PBG","req":924,"dlv":1785,"rev":65973.6,"cuts":0},{"wk":202610,"sku":"WC","req":1029,"dlv":1890,"rev":69854.4,"cuts":0},{"wk":202611,"sku":"PBG","req":546,"dlv":630,"rev":23284.8,"cuts":0},{"wk":202611,"sku":"WC","req":630,"dlv":693,"rev":25613.28,"cuts":0},{"wk":202612,"sku":"PBG","req":378,"dlv":378,"rev":13970.88,"cuts":0},{"wk":202612,"sku":"WC","req":756,"dlv":735,"rev":27165.6,"cuts":0},{"wk":202613,"sku":"PBG","req":651,"dlv":651,"rev":24060.96,"cuts":0},{"wk":202613,"sku":"WC","req":1071,"dlv":1092,"rev":40360.32,"cuts":0},{"wk":202618,"sku":"PBG","req":84,"dlv":84,"rev":3104.64,"cuts":0},{"wk":202618,"sku":"WC","req":84,"dlv":84,"rev":3104.64,"cuts":0},{"wk":202619,"sku":"CCF","req":588,"dlv":588,"rev":21732.48,"cuts":0},{"wk":202619,"sku":"PBG","req":21,"dlv":0,"rev":0.0,"cuts":7},{"wk":202619,"sku":"WC","req":331,"dlv":268,"rev":9905.28,"cuts":0},{"wk":202620,"sku":"CCF","req":2667,"dlv":2583,"rev":95467.68,"cuts":1},{"wk":202620,"sku":"PBG","req":273,"dlv":252,"rev":9313.92,"cuts":8},{"wk":202620,"sku":"WC","req":1172,"dlv":1214,"rev":44869.44,"cuts":2},{"wk":202621,"sku":"CCF","req":2037,"dlv":2121,"rev":78392.16,"cuts":0},{"wk":202621,"sku":"PBG","req":270,"dlv":312,"rev":11531.52,"cuts":0},{"wk":202621,"sku":"WC","req":3,"dlv":24,"rev":887.04,"cuts":12},{"wk":202622,"sku":"CCF","req":266,"dlv":639,"rev":23617.44,"cuts":13},{"wk":202622,"sku":"PBG","req":0,"dlv":83,"rev":3067.68,"cuts":1},{"wk":202622,"sku":"WC","req":0,"dlv":231,"rev":8537.76,"cuts":1},{"wk":202623,"sku":"CCF","req":1197,"dlv":772,"rev":28533.12,"cuts":35},{"wk":202623,"sku":"PBG","req":565,"dlv":295,"rev":10903.2,"cuts":27},{"wk":202623,"sku":"WC","req":1197,"dlv":756,"rev":27941.76,"cuts":25},{"wk":202624,"sku":"CCF","req":206,"dlv":258,"rev":9535.68,"cuts":21},{"wk":202624,"sku":"PBG","req":85,"dlv":272,"rev":10053.12,"cuts":16},{"wk":202624,"sku":"WC","req":699,"dlv":909,"rev":33596.64,"cuts":22},{"wk":202625,"sku":"CCF","req":231,"dlv":231,"rev":8537.76,"cuts":0},{"wk":202625,"sku":"PBG","req":357,"dlv":357,"rev":13194.72,"cuts":0},{"wk":202625,"sku":"WC","req":294,"dlv":294,"rev":10866.24,"cuts":0},{"wk":202626,"sku":"CCF","req":609,"dlv":609,"rev":22508.64,"cuts":1},{"wk":202626,"sku":"PBG","req":924,"dlv":924,"rev":34151.04,"cuts":0},{"wk":202626,"sku":"WC","req":1176,"dlv":1176,"rev":43464.96,"cuts":0},{"wk":202627,"sku":"CCF","req":336,"dlv":336,"rev":12418.56,"cuts":1},{"wk":202627,"sku":"PBG","req":147,"dlv":147,"rev":5433.12,"cuts":0},{"wk":202627,"sku":"WC","req":630,"dlv":630,"rev":23284.8,"cuts":1},{"wk":202628,"sku":"CCF","req":231,"dlv":126,"rev":4656.96,"cuts":0},{"wk":202628,"sku":"PBG","req":294,"dlv":189,"rev":6985.44,"cuts":0},{"wk":202628,"sku":"WC","req":168,"dlv":126,"rev":4656.96,"cuts":0},{"wk":202629,"sku":"CCF","req":231,"dlv":0,"rev":0.0,"cuts":0},{"wk":202629,"sku":"PBG","req":147,"dlv":0,"rev":0.0,"cuts":0},{"wk":202629,"sku":"WC","req":483,"dlv":0,"rev":0.0,"cuts":0}],"forecasts":[{"snap":202628,"target":202638,"sku":"CCF","units":6713.7,"source":"store"},{"snap":202628,"target":202629,"sku":"CCF","units":5375.9,"source":"store"},{"snap":202628,"target":202639,"sku":"WC","units":7890.9,"source":"store"},{"snap":202628,"target":202631,"sku":"PBG","units":4047.7,"source":"store"},{"snap":202628,"target":202638,"sku":"PBG","units":5044.8,"source":"store"},{"snap":202628,"target":202633,"sku":"PBG","units":4532.2,"source":"store"},{"snap":202628,"target":202634,"sku":"PBG","units":4718.5,"source":"store"},{"snap":202628,"target":202630,"sku":"PBG","units":3086.5,"source":"store"},{"snap":202628,"target":202641,"sku":"CCF","units":6622.5,"source":"store"},{"snap":202628,"target":202634,"sku":"CCF","units":5579.3,"source":"store"},{"snap":202628,"target":202639,"sku":"CCF","units":6747.9,"source":"store"},{"snap":202628,"target":202637,"sku":"PBG","units":5162.4,"source":"store"},{"snap":202628,"target":202636,"sku":"WC","units":7920.1,"source":"store"},{"snap":202628,"target":202637,"sku":"CCF","units":6510.7,"source":"store"},{"snap":202628,"target":202629,"sku":"WC","units":5904.9,"source":"store"},{"snap":202628,"target":202639,"sku":"PBG","units":4827.3,"source":"store"},{"snap":202628,"target":202636,"sku":"PBG","units":5303.8,"source":"store"},{"snap":202628,"target":202633,"sku":"CCF","units":5668.2,"source":"store"},{"snap":202628,"target":202632,"sku":"PBG","units":4451.6,"source":"store"},{"snap":202628,"target":202630,"sku":"CCF","units":5401.4,"source":"store"},{"snap":202628,"target":202640,"sku":"CCF","units":6042.4,"source":"store"},{"snap":202628,"target":202631,"sku":"WC","units":6667.6,"source":"store"},{"snap":202628,"target":202633,"sku":"WC","units":6759.2,"source":"store"},{"snap":202628,"target":202641,"sku":"WC","units":6774.9,"source":"store"},{"snap":202628,"target":202638,"sku":"WC","units":7980.1,"source":"store"},{"snap":202628,"target":202635,"sku":"CCF","units":5860.8,"source":"store"},{"snap":202628,"target":202640,"sku":"WC","units":6855.4,"source":"store"},{"snap":202628,"target":202637,"sku":"WC","units":7938.3,"source":"store"},{"snap":202628,"target":202635,"sku":"PBG","units":4967.8,"source":"store"},{"snap":202628,"target":202636,"sku":"CCF","units":6460.6,"source":"store"},{"snap":202628,"target":202640,"sku":"PBG","units":4058.3,"source":"store"},{"snap":202628,"target":202632,"sku":"WC","units":6688.0,"source":"store"},{"snap":202628,"target":202630,"sku":"WC","units":5778.9,"source":"store"},{"snap":202628,"target":202632,"sku":"CCF","units":5864.6,"source":"store"},{"snap":202628,"target":202635,"sku":"WC","units":7200.2,"source":"store"},{"snap":202628,"target":202641,"sku":"PBG","units":3733.9,"source":"store"},{"snap":202628,"target":202634,"sku":"WC","units":6924.3,"source":"store"},{"snap":202628,"target":202629,"sku":"PBG","units":3139.4,"source":"store"},{"snap":202628,"target":202631,"sku":"CCF","units":5424.8,"source":"store"}],"production":[{"wk":202605,"sku":"WC","cases":3780},{"wk":202606,"sku":"WC","cases":2268},{"wk":202607,"sku":"WC","cases":0},{"wk":202608,"sku":"WC","cases":3024},{"wk":202609,"sku":"WC","cases":756},{"wk":202610,"sku":"WC","cases":756},{"wk":202611,"sku":"WC","cases":756},{"wk":202612,"sku":"WC","cases":0},{"wk":202613,"sku":"WC","cases":0},{"wk":202614,"sku":"WC","cases":0},{"wk":202615,"sku":"WC","cases":0},{"wk":202616,"sku":"WC","cases":0},{"wk":202617,"sku":"WC","cases":756},{"wk":202618,"sku":"WC","cases":756},{"wk":202619,"sku":"WC","cases":0},{"wk":202620,"sku":"WC","cases":0},{"wk":202621,"sku":"WC","cases":756},{"wk":202622,"sku":"WC","cases":756},{"wk":202623,"sku":"WC","cases":0},{"wk":202624,"sku":"WC","cases":1512},{"wk":202625,"sku":"WC","cases":0},{"wk":202626,"sku":"WC","cases":0},{"wk":202605,"sku":"PBG","cases":3780},{"wk":202606,"sku":"PBG","cases":2268},{"wk":202607,"sku":"PBG","cases":0},{"wk":202608,"sku":"PBG","cases":2268},{"wk":202609,"sku":"PBG","cases":756},{"wk":202610,"sku":"PBG","cases":0},{"wk":202611,"sku":"PBG","cases":756},{"wk":202612,"sku":"PBG","cases":0},{"wk":202613,"sku":"PBG","cases":0},{"wk":202614,"sku":"PBG","cases":0},{"wk":202615,"sku":"PBG","cases":0},{"wk":202616,"sku":"PBG","cases":0},{"wk":202617,"sku":"PBG","cases":0},{"wk":202618,"sku":"PBG","cases":0},{"wk":202619,"sku":"PBG","cases":756},{"wk":202620,"sku":"PBG","cases":0},{"wk":202621,"sku":"PBG","cases":0},{"wk":202622,"sku":"PBG","cases":0},{"wk":202623,"sku":"PBG","cases":0},{"wk":202624,"sku":"PBG","cases":1512},{"wk":202625,"sku":"PBG","cases":0},{"wk":202626,"sku":"PBG","cases":0},{"wk":202605,"sku":"CCF","cases":1512},{"wk":202606,"sku":"CCF","cases":756},{"wk":202607,"sku":"CCF","cases":756},{"wk":202608,"sku":"CCF","cases":756},{"wk":202609,"sku":"CCF","cases":0},{"wk":202610,"sku":"CCF","cases":756},{"wk":202611,"sku":"CCF","cases":756},{"wk":202612,"sku":"CCF","cases":0},{"wk":202613,"sku":"CCF","cases":756},{"wk":202614,"sku":"CCF","cases":756},{"wk":202615,"sku":"CCF","cases":756},{"wk":202616,"sku":"CCF","cases":0},{"wk":202617,"sku":"CCF","cases":1512},{"wk":202618,"sku":"CCF","cases":2268},{"wk":202619,"sku":"CCF","cases":756},{"wk":202620,"sku":"CCF","cases":756},{"wk":202621,"sku":"CCF","cases":1512},{"wk":202622,"sku":"CCF","cases":0},{"wk":202623,"sku":"CCF","cases":0},{"wk":202624,"sku":"CCF","cases":0},{"wk":202625,"sku":"CCF","cases":0},{"wk":202626,"sku":"CCF","cases":0}],"dot":[],"params":{"unitsPerCase":12,"dcDohTarget":7,"dotDohTarget":14,"moq":756,"casesPerPallet":189,"gapThreshold":0.15,"l4wWindow":4,"defaultStores":2200,"dotOpeningAnchor":250,"overstockDoh":28},"asOf":"2026-08-13","dotService":[{"wk":202620,"ordered":252,"cut":208,"pos":2},{"wk":202621,"ordered":798,"cut":630,"pos":23},{"wk":202622,"ordered":5334,"cut":5283,"pos":84},{"wk":202623,"ordered":3906,"cut":2587,"pos":63},{"wk":202624,"ordered":2373,"cut":2006,"pos":47},{"wk":202625,"ordered":84,"cut":42,"pos":2}]};

/* ---------------- engine ---------------- */
// Plain-JS mirror of demandEngine.ts — used by the preview artifact and for validation.
const DEFAULT_PARAMS = {
  unitsPerCase: 12, dcDohTarget: 7, dotDohTarget: 14, moq: 756, casesPerPallet: 189,
  gapThreshold: 0.15, l4wWindow: 4, defaultStores: 2200, dotOpeningAnchor: 250,
  overstockDoh: 28,
};
// Per-SKU pack, over DEFAULT_PARAMS. The three frozen doughs are 12 units a
// case (Walmart warehouse pack, Item 360); Black Currant is 10 pouches a case
// and 96 cases a pallet (Item 360 + Caroline, Oct 22 2026). Before this every
// SKU was divided by 12, which understated BC's shopper-side cases by a sixth.
// BC's MOQ is unknown, so it still uses the default.
// The same pack is repeated by Walmart item number in EACHES_PER_CASE
// (parsers/retailLinkSupplyPlan.js, upload summary); change both together.
const SKU_PACK = { BC: { unitsPerCase: 10, casesPerPallet: 96 } };
// Flip to true when `production` reads a real feed instead of SEED. While it is
// false, figures built on production (DOT days on hand, the DOT buffer chip)
// are not shown on the Summary tab, and the freshness strip marks Production
// as not live. See KNOWN_ISSUES §1.
const PRODUCTION_LIVE = false;
const packOf = sku => ({
  unitsPerCase: DEFAULT_PARAMS.unitsPerCase, casesPerPallet: DEFAULT_PARAMS.casesPerPallet, ...(SKU_PACK[sku] || {}),
});
// Walmart weeks run Sat–Fri; the page labels a week by the Sunday after it
// ends (the prototype's convention). Week 202605 starts Sat 2026-02-28 — the
// same anchor as walmartWeekOf.
//
// WEEK LABELS (Caroline, Nov 5 2026): the Walmart week number appears ONCE, in
// the header ("Walmart week 40"). Everywhere else a week is named by its
// calendar date, "wk ending Nov 1" — never W39 or 202639. Use the helpers
// below rather than slicing `wk` so the rule holds in one place.
function weekEndingDate(wk) {
  if (!wk) return null;
  const n = (Math.floor(wk / 100) - 2026) * 52 + (wk % 100) - 5;
  return new Date(Date.UTC(2026, 1, 28 + n * 7 + 8));
}
function weekEndingSunday(wk) {
  const d = weekEndingDate(wk);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : null;
}
// "11/1" — for tight axis and column labels.
const weekEndingNumeric = wk => {
  const d = weekEndingDate(wk);
  return d ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}` : "—";
};
// "wk ending Nov 1" — for prose and tooltips.
const wkEnding = wk => (wk ? "wk ending " + weekEndingSunday(wk) : "—");
// Store counts on the bar labels (Caroline, Oct 29): 2,609 → "2.6K". The hover
// keeps the full ###,### figure.
const abbrK = v => (v == null ? "" : v >= 1000 ? (v / 1000).toFixed(1) + "K" : String(Math.round(v)));
function WeekLabel({ wk }) {
  if (!wk) return <>—</>;
  return <>{weekEndingSunday(wk)}</>;
}
const todayIso = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
};
// "Thu, Nov 5"
const todayLong = () => new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

const ceilTo = (v, moq) => (v <= 0 ? 0 : Math.ceil(v / moq) * moq);

function buildSkuSeries(input, sku) {
  const P = { ...DEFAULT_PARAMS, ...(input.params || {}), ...(SKU_PACK[sku] || {}) };
  const weeks = input.weeks;
  const N = weeks.length;
  const posMap = new Map(input.pos.filter(r => r.sku === sku).map(r => [r.wk, r]));
  const ordMap = new Map(input.orders.filter(r => r.sku === sku).map(r => [r.wk, r]));
  const prodMap = new Map(input.production.filter(r => r.sku === sku).map(r => [r.wk, r.cases]));
  const dotMap = new Map(input.dot.filter(r => r.sku === sku).map(r => [r.wk, r.cases]));
  const ovrMap = new Map((input.overrides || []).filter(r => r.sku === sku).map(r => [r.wk, r]));
  // DOT → Walmart depot deliveries, ACTUAL, per week. Optional: absent for every
  // week before the first DOT Order History upload and for every future week.
  // Since Nov 5 2026 also carries `cut` and `source`: 'consignment' weeks
  // (Consignment Sales History) are complete and exact by item; 'order_history'
  // weeks are cut-orders-only and pro-rata. Still NOT in the cascade — see c.dotOut.
  const dotDlvMap = new Map((input.dotDeliveries || []).filter(r => r.sku === sku).map(r => [r.wk, r]));

  const latestFc = new Map(), lagFc = new Map(), whseFc = new Map();
  const targets = new Set(input.forecasts.filter(f => f.sku === sku).map(f => f.target));
  for (const target of targets) {
    const rows = input.forecasts.filter(f => f.sku === sku && f.target === target);
    const store = rows.filter(r => r.source === 'store');
    const whse = rows.filter(r => r.source === 'warehouse');
    if (store.length) {
      latestFc.set(target, store.reduce((a, b) => (b.snap > a.snap ? b : a)).units);
      const prior = store.filter(r => r.snap < target);
      if (prior.length) lagFc.set(target, prior.reduce((a, b) => (b.snap > a.snap ? b : a)).units);
    }
    if (whse.length) whseFc.set(target, whse.reduce((a, b) => (b.snap > a.snap ? b : a)).units);
  }

  const cells = weeks.map(wk => ({
    wk, traited: null, storesUsed: P.defaultStores, pos: null, dollars: null, instock: null,
    storeOh: null, storeOhDoh: null, trueDemand: null, velocity: null,
    wmtStoreFcst: latestFc.has(wk) ? latestFc.get(wk) : null,
    wmtWhseFcst: whseFc.has(wk) ? whseFc.get(wk) : null,
    wmtLagFcst: lagFc.has(wk) ? lagFc.get(wk) : null,
    mult: ovrMap.get(wk)?.mult ?? 1, internalFcst: null,
    override: ovrMap.get(wk)?.override ?? null, consensus: null, gap: null, mape: null,
    demandCases: 0, req: null, dlv: null, variance: null, fillRate: null, cuts: null,
    revenue: null, dcOpen: 0, dcIn: 0, dcOut: 0, dcClose: 0, dcTgt: 0, dcDoh: 0,
    dotOpen: 0, dotIn: 0, dotOut: 0, dotCloseModel: 0,
    dotDelivered: dotDlvMap.has(wk) ? dotDlvMap.get(wk).delivered : null,
    dotCut: dotDlvMap.has(wk) ? dotDlvMap.get(wk).cut ?? null : null,
    dotSrc: dotDlvMap.has(wk) ? dotDlvMap.get(wk).source ?? null : null,
    dotActual: dotMap.has(wk) ? dotMap.get(wk) : null,
    dotUsed: 0, dotTgt: 0, dotDoh: 0, rec: 0, shifts: 0, plan: 0,
    actual: prodMap.has(wk) ? prodMap.get(wk) : null, prodVariance: null, pallets: 0,
  }));

  let lastActualIdx = -1;
  cells.forEach((c, i) => {
    const p = posMap.get(c.wk);
    if (p) {
      c.traited = p.traited; c.pos = p.units; c.dollars = p.dollars;
      c.instock = p.instock; c.storeOh = p.oh;
      c.trueDemand = p.instock && p.instock > 0 ? p.units / p.instock : p.units;
      if (p.units > 0) lastActualIdx = i;
      if (p.oh != null && p.units > 0) c.storeOhDoh = p.oh / (p.units / 7);
    }
    c.storesUsed = c.traited ?? (i > 0 ? cells[i - 1].storesUsed : P.defaultStores);
    if (c.trueDemand != null && c.storesUsed > 0) c.velocity = c.trueDemand / c.storesUsed;
    const o = ordMap.get(c.wk);
    if (o) {
      c.req = o.req; c.dlv = o.dlv; c.revenue = o.rev; c.cuts = o.cuts;
      c.variance = c.dlv - c.req;
      if (c.req > 0) c.fillRate = c.dlv / c.req;
    }
  });

  // A SKU can be live in the order book and in Walmart's forecast before it has
  // a single week of POS — a pre-launch item being shipped in to fill shelves is
  // exactly that (BC: 22,845 cases ordered, 266k units forecast, no POS and no
  // traited stores yet). `lastActualIdx` is then -1, which would leave the
  // "last 4 weeks" window empty and put the "next 4 weeks" window at the START
  // of the fiscal year — February figures under a label saying next month. Fall
  // back to the newest week ANY sku has POS for, which is what the rest of the
  // page means by "now". Guarded, so a SKU with its own POS is untouched.
  if (lastActualIdx < 0) {
    const newestPosWk = Math.max(0, ...input.pos.filter(p => p.units != null).map(p => p.wk));
    const at = weeks.indexOf(newestPosWk);
    if (at >= 0) lastActualIdx = at;
  }

  let baseVelocity = null;
  if (lastActualIdx >= 0) {
    const vels = cells.slice(Math.max(0, lastActualIdx - (P.l4wWindow - 1)), lastActualIdx + 1)
      .map(c => c.velocity).filter(v => v != null);
    if (vels.length) baseVelocity = vels.reduce((a, b) => a + b, 0) / vels.length;
  }

  cells.forEach((c, i) => {
    if (baseVelocity != null && i > lastActualIdx) {
      c.internalFcst = baseVelocity * c.storesUsed * c.mult;
    }
    c.consensus = c.override ?? c.internalFcst;
    if (c.internalFcst && c.wmtStoreFcst != null) {
      c.gap = (c.wmtStoreFcst - c.internalFcst) / c.internalFcst;
    }
    if (c.pos && c.wmtLagFcst != null) c.mape = Math.abs(c.pos - c.wmtLagFcst) / c.pos;
    const units = c.pos ?? c.consensus ?? 0;
    c.demandCases = units / P.unitsPerCase;
  });

  const demAt = i => cells[Math.min(i, N - 1)].demandCases;
  for (let k = 0; k < N; k++) {
    const c = cells[k];
    c.dcOpen = k === 0 ? 0 : Math.max(0, cells[k - 1].dcClose);
    const dOh = c.storeOh != null
      ? (c.storeOh - (k > 0 ? (cells[k - 1].storeOh ?? 0) : 0)) / P.unitsPerCase : 0;
    c.dcOut = c.demandCases + dOh;
    c.dcTgt = (P.dcDohTarget / 7) * demAt(k + 1);
    c.dotOpen = k === 0 ? P.dotOpeningAnchor : Math.max(0, cells[k - 1].dotUsed);
    // ⚠️ `c.dotDelivered` is deliberately NOT in this chain, though it looks like
    // it belongs. The DOT "Order History" export we receive is filtered to
    // EXCEPTION orders — 0 of 221 rows in the sample had no cut — so its
    // reconciled cases are the deliveries on problem orders only, not the total
    // outbound leg. For weeks 202620–25 it reports 1,949 cases where NetSuite
    // records 11,603. Feeding it here would understate DOT's outflow ~6×,
    // inflate DOT closing stock and suppress the production recommendation that
    // sizes co-bakery runs.
    //
    // If an UNFILTERED Order History ever arrives, this becomes a one-line
    // change to `c.dotDelivered ?? c.dlv ?? ...` — it was written, regression-
    // tested as a no-op on absent data, and then reverted on this evidence.
    // Check first that the export contains orders with zero cuts.
    c.dotOut = c.dlv ?? c.req ?? Math.max(0, c.dcTgt - c.dcOpen + c.dcOut);
    c.dotTgt = (P.dotDohTarget / 7) * demAt(k + 1);
    if (k >= 2) {
      const t = cells[k - 2];
      t.rec = ceilTo(Math.max(0, c.dotTgt - c.dotOpen + c.dotOut), P.moq);
      t.shifts = t.rec === 0 ? 0 : Math.ceil(t.rec / P.moq);
      t.plan = t.shifts * P.moq;
      t.prodVariance = t.actual != null ? t.actual - t.plan : null;
      t.pallets = (t.actual ?? t.plan) / P.casesPerPallet;
    }
    const srcIdx = k < 2 ? k : k - 2;
    c.dotIn = cells[srcIdx].actual ?? cells[srcIdx].plan ?? 0;
    c.dotCloseModel = c.dotOpen + c.dotIn - c.dotOut;
    c.dotUsed = c.dotActual ?? c.dotCloseModel;
    c.dcIn = c.dotOut;
    c.dcClose = c.dcOpen + c.dcIn - c.dcOut;
    c.dcDoh = demAt(k + 1) > 0 ? c.dcClose / (demAt(k + 1) / 7) : 0;
    c.dotDoh = demAt(k + 1) > 0 ? c.dotUsed / (demAt(k + 1) / 7) : 0;
  }
  const last = cells[N - 1];
  for (const t of [cells[N - 2], cells[N - 1]]) {
    t.rec = ceilTo(Math.max(0, last.dotTgt - last.dotOpen + last.dotOut), P.moq);
    t.shifts = t.rec === 0 ? 0 : Math.ceil(t.rec / P.moq);
    t.plan = t.shifts * P.moq;
    t.pallets = (t.actual ?? t.plan) / P.casesPerPallet;
  }
  return { sku, cells, lastActualIdx, baseVelocity };
}

function sopSummary(s, casesPerPallet = 189) {
  const i = s.lastActualIdx;
  const c = i >= 0 ? s.cells[i] : null;
  const win = (from, to) => s.cells.slice(Math.max(0, from), Math.min(s.cells.length, to));
  const avg = xs => { const v = xs.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const sum = xs => xs.reduce((a, b) => a + (b ?? 0), 0);
  const l4 = win(i - 3, i + 1), n4 = win(i + 1, i + 5);
  const reqSum = sum(l4.map(x => x.req)), dlvSum = sum(l4.map(x => x.dlv));
  const wmt = avg(n4.map(x => x.wmtStoreFcst)), int_ = avg(n4.map(x => x.internalFcst));
  return {
    sku: s.sku, latestWk: c ? c.wk : null,
    l4wPos: avg(l4.map(x => x.pos)), l4wTrue: avg(l4.map(x => x.trueDemand)),
    wow: c && i > 0 && s.cells[i - 1].pos ? c.pos / s.cells[i - 1].pos - 1 : null,
    instock: c ? c.instock : null, traited: c ? c.traited : null,
    storeOhDoh: c ? c.storeOhDoh : null,
    n4wWmtFcst: wmt, n4wInternal: int_,
    n4wGap: wmt != null && int_ ? wmt / int_ - 1 : null,
    l4wFill: reqSum > 0 ? dlvSum / reqSum : null, l4wCuts: sum(l4.map(x => x.cuts)),
    openBook: sum(n4.map(x => x.req)),
    dcDoh: c ? c.dcDoh : null, dotUsed: c ? c.dotUsed : null, dotDoh: c ? c.dotDoh : null,
    n4wRec: sum(n4.map(x => x.rec)), n4wRecPallets: sum(n4.map(x => x.rec)) / casesPerPallet,
  };
}




/* ---------------- calendar month bands ---------------- */
// Walmart's 4-5-4 fiscal months were removed on Nov 5 2026 (calendar weeks
// everywhere but the header); see git history for `fiscalOf`.
const QTR_TINT = { 1: "#D9EFE4", 2: "#FADBE0", 3: "#DCE4F2", 4: "#FBEBD8" };
// Calendar months of each week-ending date (Nov 5 2026: the page uses calendar
// weeks, not Walmart's 4-5-4 fiscal months). `quarter` is the calendar quarter
// and only picks the band tint.
const monthBands = cells => {
  const bands = [];
  for (const c of cells) {
    const d = weekEndingDate(c.wk);
    const f = { month: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) + " " + String(d.getUTCFullYear()).slice(2),
                quarter: Math.floor(d.getUTCMonth() / 3) + 1 };
    const last = bands[bands.length - 1];
    if (last && last.month === f.month) last.span++;
    else bands.push({ month: f.month, quarter: f.quarter, span: 1 });
  }
  return bands;
};

/* ---------------- ui helpers ---------------- */
const F = {
  int: v => (v == null ? "—" : Math.round(v).toLocaleString()),
  pct: v => (v == null ? "—" : (v * 100).toFixed(1) + "%"),
  pct0: v => (v == null ? "" : (v * 100).toFixed(0) + "%"),
  spct: v => (v == null ? "—" : (v > 0 ? "+" : "") + (v * 100).toFixed(1) + "%"),
  d1: v => (v == null ? "—" : v.toFixed(1)),
  d2: v => (v == null ? "" : v.toFixed(2)),
  money: v => (v == null ? "" : "$" + Math.round(v).toLocaleString()),
};
// Official Walmart product names, from the Item 360 export (Oct 22 2026),
// without Walmart's trailing marketing copy. They match master_cases.name.
// "bettergoods" is Walmart's private-label brand and is lower-case by design.
// BC is the Black Currant launch: Cortina item 1324 (Cortina line 3888),
// Walmart prime item 686669913, UPC 194346715947.
const SKU_NAMES = {
  WC: "bettergoods Jumbo Cookie Butter-Stuffed White Chocolate Chip Cookie Dough",
  PBG: "bettergoods Jumbo Grape Jelly-Stuffed Peanut Butter Cookie Dough",
  CCF: "bettergoods Jumbo Chocolatey Fudge Stuffed Chocolate Chip Cookies",
  BC: "bettergoods White Chocolate Black Currant Cookies",
};
const gapColor = g => {
  if (g == null) return "#EFE4E9";
  const a = Math.abs(g);
  if (a <= 0.15) return "#9BC49B";
  return a > 0.4 ? (g > 0 ? "#C2185B" : "#8E24AA") : "#E8A33D";
};

// `placeholder` marks a figure whose INPUTS are not real yet. It is not a
// styling nicety: these numbers sit on the same cards, in the same type, as
// figures reconciled against Walmart's own totals, and the realistic failure
// mode for this page is somebody sizing a co-bakery run off one of them. So a
// placeholder is greyed, struck through, and carries the word — it should be
// impossible to read as a measurement at a glance. See ADR-062.
//
// Nov 5 2026: a struck-through number was still a number, and big numbers get
// copied into plans. A placeholder Stat now shows NO value — a dash in a dashed
// box — and `src` says what it is waiting for. The modelled figure is still in
// the Tracker for anyone inspecting the cascade.
function Stat({ label, value, tone, src, placeholder }) {
  const color = tone === "bad" ? "#C2185B" : tone === "warn" ? "#B87514" : "#2D2235";
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider opacity-60">{label}</div>
      {placeholder ? (
        <div className="cc-serif text-xl inline-flex items-baseline gap-2 mt-0.5 px-2 rounded-md"
          style={{ color: "#B0A3AC", border: "1px dashed #D9C9D1" }}
          title="Not shown: this figure is modelled on frozen production data, not measured.">
          —
          <span className="cc-sans text-[11px]" style={{ color: "#8E1039" }}>not yet available</span>
        </div>
      ) : (
        <div className="cc-serif text-xl" style={{ color }}>{value}</div>
      )}
      {src && <div className="text-[11px] mt-0.5" style={{ opacity: placeholder ? 0.85 : 0.55, color: placeholder ? "#8E1039" : undefined }}>{src}</div>}
    </div>
  );
}

// The chart shows SHOPPER demand only — POS and Walmart's forecast — with the
// store base beneath it (Caroline, Oct 29 2026). The DC → DOT and DOT → depot
// supply lines were removed from it; the funnel beside the chart now carries
// where stock sits.
const FLOW_COLORS = { pos: "#2D2235", fcst: "#C2185B", stores: "#D6CAE0", vel: "#6B3F8C" };
function buildFlow(s) {
  const UNITS_PER_CASE = packOf(s.sku).unitsPerCase;
  return s.cells.map((c) => ({
    wl: String(c.wk).slice(4),
    wk: c.wk,
    // Calendar month of the week-ending date, not Walmart's 4-5-4 fiscal month.
    month: weekEndingDate(c.wk).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }),
    pos: c.pos != null ? Math.round(c.pos / UNITS_PER_CASE) : null,
    fcst: c.wmtStoreFcst != null ? Math.round(c.wmtStoreFcst / UNITS_PER_CASE) : null,
    // Store base for the bar panel: Retail Link TRAITED stores (set up to
    // carry the item). Retail Link has no "stores selling" count. Only weeks
    // with POS — forward weeks carry no store count.
    stores: c.pos != null && c.traited ? c.traited : null,
    // Velocity = POS units ÷ traited stores = units/store/week. Identical to
    // Walmart's own "Units per Store per Week (w/zeros)" (checked W32–W38).
    // Not the engine's c.velocity, which uses OOS-adjusted true demand.
    velocity: c.pos != null && c.traited ? c.pos / c.traited : null,
  }));
}

function FlowLegend({ latestWk }) {
  // One entry per line (house convention), so each source reads on its own.
  const item = (color, label, dashed) => (
    <span className="flex items-center gap-1.5">
      <span className="inline-block" style={{ width: 14, height: 0,
        borderTop: dashed ? "2px dashed " + color : "3px solid " + color }} />{label}
    </span>
  );
  return (
    <div className="text-[11px] opacity-80 rounded-xl border px-4 py-2 bg-white"
      style={{ borderColor: "#E5D9DE" }}>
      <div className="font-semibold mb-1">Chain flow, upstream → shopper · all series in cases/week</div>
      <div className="flex flex-col gap-0.5">
        {item(FLOW_COLORS.pos, "POS shopper takeaway · source: Retail Link")}
        {item(FLOW_COLORS.fcst, "Walmart sales forecast · source: Retail Link fcst pull", true)}
        <span className="flex items-center gap-1.5">
          <span className="inline-block rounded-sm" style={{ width: 8, height: 12, background: FLOW_COLORS.stores }} />
          Store base panel: traited stores (bars, left axis) and units/store/week (line, right axis) · source: Retail Link
        </span>
        <span className="flex items-center gap-1.5">
          {/* Was hardcoded "today W28" (Aug 13 snapshot) until Oct 29 2026. */}
          <span className="inline-block" style={{ width: 2, height: 12, background: "#C2185B" }} />
          <span>last week with POS: wk ending <WeekLabel wk={latestWk} /></span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block" style={{ width: 14, height: 10, background: "#FDF6FA", border: "1px solid #E5D9DE" }} />
          shaded = forecast horizon
        </span>
      </div>
      <div className="mt-1 opacity-80">
        <b>1 case = 12 retail units (Black Currant: 10).</b> POS, store on-hand, and the Walmart forecast arrive in units
        (shopper-facing systems) and are charted ÷12 (÷10 for Black Currant).
        Walmart's forecast should trend off POS history; a forecast breaking away from POS is the early warning.
        Traited stores are stores set up to carry the item, not stores that sold it (Retail Link has no
        stores-selling count). Velocity = POS units ÷ traited stores, the same as Walmart's own "Units per Store per Week".
      </div>
    </div>
  );
}

function chainChips(s) {
  const i = s.lastActualIdx;
  if (i < 0) return [];
  const l4 = s.cells.slice(Math.max(0, i - 3), i + 1);
  const UNITS_PER_CASE = packOf(s.sku).unitsPerCase;
  const inSum = l4.reduce((a, c) => a + (c.actual ?? 0), 0);
  const thruSum = l4.reduce((a, c) => a + (c.dlv ?? 0), 0);
  const outSum = Math.round(l4.reduce((a, c) => a + (c.pos ?? 0), 0) / UNITS_PER_CASE);
  const chips = [];
  const link = (label, net, base) => {
    const frac = base > 0 ? net / base : 0;
    let text, bg, fg;
    if (Math.abs(frac) <= 0.15) { text = "balanced"; bg = "#D8EFD8"; fg = "#2C5E3A"; }
    else if (net < 0) {
      text = "draining " + F.int(net) + " cs";
      bg = Math.abs(frac) > 0.5 ? "#F8CBCB" : "#FDE9C8";
      fg = Math.abs(frac) > 0.5 ? "#8E1039" : "#8A5A10";
    } else { text = "building +" + F.int(net) + " cs"; bg = "#DCE4F2"; fg = "#2D3B66"; }
    chips.push({ label, text, bg, fg });
  };
  // `inSum` is production into DOT — still the frozen seed, so the DOT buffer
  // and the "0 cs shipped" alarm were computed from a made-up input (every SKU
  // read "draining" and "0 cs shipped"). They come back with a production feed;
  // until then the chip says what it is waiting for instead of showing a figure.
  if (PRODUCTION_LIVE) {
    link("DOT buffer (in − thru)", inSum - thruSum, outSum);
    if (inSum === 0 && outSum > 0) chips.push({ label: "Production", text: "0 cs shipped", bg: "#F8CBCB", fg: "#8E1039" });
  } else {
    chips.push({ label: "DOT buffer", text: "needs a production feed", bg: "#F4EEF1", fg: "#7A6B75", placeholder: true });
  }
  link("Depot buffer (thru − POS)", thruSum - outSum, outSum);
  return chips;
}

// DOT days on hand from MEASURED inputs only (Nov 5 2026): sellable cases in
// the newest DOT Inventory Snapshot ÷ the last 4 weeks' POS per day. Not the
// engine's c.dotDoh, which models DOT stock forward on frozen production and
// stays a placeholder in the Tracker. Shopper takeaway is the pull DOT
// ultimately has to cover; the date says which snapshot it is.
function dotDaysOnHand(m, f, pack) {
  if (!f.dot || m.l4wPos == null || !(m.l4wPos > 0)) return null;
  const sellable = f.dot.cases - (f.dot.committed ?? 0);
  return sellable / (m.l4wPos / pack / 7);
}

// Shared geometry so the demand panel and the store panel line up exactly:
// same left and right axis widths, same x categories.
const AXIS_L = 46, AXIS_R = 46;
const tickStyle = { fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fill: "#2D2235", opacity: 0.7 };

function FlowCard({ s, m, f, feeds }) {
  const data = buildFlow(s);
  const ticks = data.filter((d, i) => i === 0 || d.month !== data[i - 1].month).map(d => d.wl);
  const todayWl = s.lastActualIdx >= 0 ? data[s.lastActualIdx].wl : null;
  const chips = chainChips(s);
  const UNITS_PER_CASE = packOf(s.sku).unitsPerCase;
  const g = m.n4wGap;
  const gTone = g != null && Math.abs(g) > 0.15 ? (Math.abs(g) > 0.4 ? "#C2185B" : "#B87514") : "#3E8E5A";
  const doh = dotDaysOnHand(m, f, UNITS_PER_CASE);
  const fmtTip = (v, name) => {
    const cs = Math.round(v).toLocaleString() + " cs";
    if (name === "POS" || name === "Walmart fcst") {
      return [cs + " · " + Math.round(v * UNITS_PER_CASE).toLocaleString() + " units", name];
    }
    return [cs, name];
  };
  const wkLabelOf = (wl) => { const d = data.find(x => x.wl === wl); return d ? wkEnding(d.wk) : wl; };
  const tipStyle = { fontSize: 12, fontFamily: "Inter, sans-serif", borderRadius: 10, borderColor: "#E5D9DE" };
  const panelTitle = "text-[11px] uppercase tracking-wider opacity-60";
  return (
    <section className="bg-white rounded-2xl border p-5" style={{ borderColor: "#E5D9DE" }}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
        <span className="text-[11px] tracking-widest uppercase font-semibold" style={{ color: "#C2185B" }}>{s.sku}</span>
        <h2 className="cc-serif text-lg leading-tight">{SKU_NAMES[s.sku]}</h2>
        <span className="text-xs opacity-60">Retail Link data thru {wkEnding(m.latestWk)}</span>
        <span className="ml-auto text-sm" title="Walmart = latest Retail Link store forecast · us = DC internal forecast (trailing-4-wk true velocity × stores)">
          Walmart fcst vs our fcst, next 4 wks: <b style={{ color: gTone }}>{F.spct(g)}</b>
          {g != null && Math.abs(g) > 0.15 && <span className="ml-2 text-[11px] font-medium" style={{ color: "#C2185B" }}>raise with Walmart</span>}
        </span>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <Stat label="POS, last 4 wks (cs/wk)" value={F.int(m.l4wPos / UNITS_PER_CASE)}
            src="Retail Link · store POS" />
          <Stat label="True demand (cs/wk)" value={F.int(m.l4wTrue / UNITS_PER_CASE)}
            src="derived: POS ÷ in-stock %" />
          <Stat label="In-stock" value={F.pct(m.instock)}
            tone={m.instock != null && m.instock < 0.65 ? "bad" : m.instock != null && m.instock < 0.8 ? "warn" : undefined}
            src="Retail Link · share of stores" />
          <Stat label="Fill rate, last 4 wks" value={F.pct(m.l4wFill)}
            src="NetSuite (Cortina) deliveries" />
          <Stat label="DOT days on hand" value={doh == null ? "—" : F.d1(doh)}
            tone={doh != null && doh < 7 ? "bad" : doh != null && doh > 60 ? "warn" : undefined}
            src={f.dot ? "Sellable at DOT " + f.dot.label + " ÷ last-4-wk POS" : "No DOT Inventory Snapshot yet"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] items-stretch">
        {/* Demand and store base, each panel with its OWN y-axis (Nov 5 2026).
            The store bars used to carry two-line text labels and no scale;
            now stores read off a left axis and velocity is a line on a right
            axis, and both panels share the x axis geometry so weeks line up. */}
        <div className="min-w-0 flex flex-col">
          <div className="flex items-baseline justify-between" style={{ paddingLeft: AXIS_L, paddingRight: AXIS_R }}>
            <span className={panelTitle}>Shopper demand · cases / wk</span>
            <span className="flex gap-3 text-[11px] opacity-80">
              <span className="flex items-center gap-1"><span className="inline-block" style={{ width: 14, borderTop: "3px solid " + FLOW_COLORS.pos }} />POS</span>
              <span className="flex items-center gap-1"><span className="inline-block" style={{ width: 14, borderTop: "2px dashed " + FLOW_COLORS.fcst }} />Walmart fcst</span>
            </span>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} syncId={"flow-" + s.sku} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                {todayWl && <ReferenceArea yAxisId="cs" x1={todayWl} x2={data[data.length - 1].wl} fill="#FDF6FA" fillOpacity={0.8} />}
                <XAxis dataKey="wl" ticks={ticks} tickLine={false} axisLine={{ stroke: "#E5D9DE" }} tick={false} height={4} />
                <YAxis yAxisId="cs" width={AXIS_L} tickLine={false} axisLine={false} tick={tickStyle}
                  tickFormatter={(v) => Number(v).toLocaleString("en-US")} />
                {/* Empty right axis: keeps this plot area the same width as the store panel's. */}
                <YAxis yAxisId="pad" orientation="right" width={AXIS_R} tick={false} axisLine={false} tickLine={false} />
                <Tooltip formatter={fmtTip} labelFormatter={wkLabelOf} contentStyle={tipStyle} />
                {todayWl && <ReferenceLine yAxisId="cs" x={todayWl} stroke="#C2185B" strokeWidth={1.5}
                  label={{ value: "today", position: "insideTopLeft", fontSize: 10, fill: "#C2185B" }} />}
                <Line yAxisId="cs" dataKey="pos" name="POS" stroke={FLOW_COLORS.pos} strokeWidth={2.4} dot={false} isAnimationActive={false} />
                <Line yAxisId="cs" dataKey="fcst" name="Walmart fcst" stroke={FLOW_COLORS.fcst} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-baseline justify-between mt-3" style={{ paddingLeft: AXIS_L, paddingRight: AXIS_R }}>
            <span className={panelTitle}>Store base</span>
            <span className="flex gap-3 text-[11px] opacity-80">
              <span className="flex items-center gap-1"><span className="inline-block rounded-sm" style={{ width: 9, height: 9, background: FLOW_COLORS.stores }} />traited stores (left)</span>
              <span className="flex items-center gap-1"><span className="inline-block" style={{ width: 14, borderTop: "2px solid " + FLOW_COLORS.vel }} />units / store / wk (right)</span>
            </span>
          </div>
          <div style={{ height: 130 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} syncId={"flow-" + s.sku} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                {todayWl && <ReferenceArea yAxisId="st" x1={todayWl} x2={data[data.length - 1].wl} fill="#FDF6FA" fillOpacity={0.8} />}
                <XAxis dataKey="wl" ticks={ticks} tickLine={false} axisLine={{ stroke: "#E5D9DE" }} tick={tickStyle}
                  tickFormatter={(wl) => { const d = data.find(x => x.wl === wl); return d ? d.month : wl; }} />
                <YAxis yAxisId="st" width={AXIS_L} tickLine={false} axisLine={false} tick={tickStyle}
                  tickFormatter={abbrK} domain={[0, "auto"]} tickCount={4} />
                <YAxis yAxisId="vel" orientation="right" width={AXIS_R} tickLine={false} axisLine={false}
                  tick={{ ...tickStyle, fill: FLOW_COLORS.vel }} tickFormatter={(v) => Number(v).toFixed(1)}
                  domain={[0, "auto"]} tickCount={4} />
                <Tooltip contentStyle={tipStyle} labelFormatter={wkLabelOf}
                  formatter={(v, name) => name === "Traited stores" ? [F.int(v) + " stores", name] : [Number(v).toFixed(2) + " units/store/wk", name]} />
                {todayWl && <ReferenceLine yAxisId="st" x={todayWl} stroke="#C2185B" strokeWidth={1.5} />}
                <Bar yAxisId="st" dataKey="stores" name="Traited stores" fill={FLOW_COLORS.stores} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                <Line yAxisId="vel" dataKey="velocity" name="Velocity" stroke={FLOW_COLORS.vel} strokeWidth={2} dot={false} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {chips.map((c, i) => (
              <span key={i} className="text-[11px] px-2.5 py-1 rounded-full"
                style={{ background: c.bg, color: c.fg, border: c.placeholder ? "1px dashed #D9C9D1" : undefined }}>
                <b>{c.label}:</b> {c.text}{!c.placeholder && <span className="opacity-70"> / last 4 wks</span>}
              </span>
            ))}
          </div>
        </div>
        <InventoryByWeek s={s} feeds={feeds} />
      </div>
    </section>
  );
}

/* ---------------- inventory by week ---------------- */
// Replaced the single-week "Where every case sits" funnel (Nov 5 2026): the
// same stages, one stacked bar per week on a date axis, so the breakout AND
// its week-to-week change read at once. Shopper takeaway (POS) is a line on
// the same cases scale — it is a flow, not stock, so it is never stacked.
//
// Every segment is a MEASUREMENT for that week or absent:
//   · Sellable at DOT / In transit / Expired — DOT Inventory Snapshot for the
//     week (newest snapshot if two land in one week). Sellable = RG lots −
//     Loaded − Picked; In transit = Loaded + Picked; Expired = EX lots.
//   · At Walmart DCs — Retail Link Curr Whse On Hand ÷ pack.
//   · On store shelves — Retail Link Curr Str On Hand ÷ pack.
// Retail Link's on-hand is current-week only, so history exists only from
// the first upload that carried it and grows one week per upload. Weeks
// without a reading draw no segment rather than a zero; the tooltip says
// "no reading".
const INV_SERIES = [
  { k: "dotSellable", label: "Sellable at DOT", color: "#3E8E5A", src: "DOT Inventory Snapshot" },
  { k: "transit",     label: "In transit to Walmart", color: "#9CCB9F", src: "DOT Inventory Snapshot · Loaded + Picked" },
  { k: "dc",          label: "At Walmart DCs", color: "#E8A33D", src: "Retail Link Curr Whse On Hand" },
  { k: "shelves",     label: "On store shelves", color: "#F3CF8E", src: "Retail Link Curr Str On Hand" },
  { k: "expired",     label: "Expired at DOT (not sellable)", color: "#C2185B", src: "DOT Inventory Snapshot · EX lots" },
];
const INV_WEEKS = 8;

function inventoryHistory(s, feeds) {
  const pack = packOf(s.sku).unitsPerCase;
  const dotByWk = new Map();
  for (const r of (feeds.dotOnHand ?? [])) {
    if (r.sku !== s.sku) continue;
    const prev = dotByWk.get(r.wk);
    if (!prev || r.snapshotDate > prev.snapshotDate) dotByWk.set(r.wk, r);
  }
  const whByWk = new Map();
  for (const p of (feeds.pos ?? [])) if (p.sku === s.sku && p.whOh != null) whByWk.set(p.wk, p.whOh);
  const rows = s.cells.map(c => {
    const d = dotByWk.get(c.wk);
    return {
      wk: c.wk, label: weekEndingNumeric(c.wk),
      dotSellable: d ? d.cases - (d.committed ?? 0) : null,
      transit: d ? (d.committed ?? 0) : null,
      expired: d ? (d.expired ?? 0) : null,
      dotDate: d ? d.snapshotDate : null,
      dc: whByWk.has(c.wk) ? whByWk.get(c.wk) / pack : null,
      shelves: c.storeOh != null && c.storeOh > 0 ? c.storeOh / pack : null,
      sold: c.pos != null ? c.pos / pack : null,
    };
  });
  // Window: the INV_WEEKS weeks ending at the newest week with any stock reading.
  const has = r => INV_SERIES.some(x => x.k !== "expired" && r[x.k] != null);
  let end = -1;
  rows.forEach((r, i) => { if (has(r)) end = i; });
  if (end < 0) return { rows: [], any: false };
  // A week is PARTIAL when some sources reported and others did not — DOT
  // snapshots land mid-week, Retail Link a week behind — so its stack is
  // short by the missing stages and must not read as a drop in stock.
  const win = rows.slice(Math.max(0, end - INV_WEEKS + 1), end + 1).map(r => {
    const hasDot = r.dotSellable != null, hasWm = r.dc != null || r.shelves != null;
    const partial = (hasDot || hasWm) && !(hasDot && hasWm);
    return { ...r, partial, label: r.label + (partial ? "*" : "") };
  });
  return { rows: win, any: true };
}

function InventoryTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const r = payload[0].payload;
  const stock = INV_SERIES.filter(x => x.k !== "expired").reduce((a, x) => a + (r[x.k] ?? 0), 0);
  return (
    <div className="bg-white rounded-lg border px-3 py-2 text-[12px] shadow-sm" style={{ borderColor: "#E5D9DE" }}>
      <div className="font-semibold mb-1">{wkEnding(r.wk)}</div>
      {r.partial && <div className="text-[11px] mb-1" style={{ color: "#8A5A10" }}>Partial week: not every source has reported</div>}
      {INV_SERIES.map(x => (
        <div key={x.k} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: x.color }} />
          <span className="flex-1">{x.label}</span>
          <span className="cc-mono">{r[x.k] == null ? <span className="opacity-50">no reading</span> : F.int(r[x.k])}</span>
        </div>
      ))}
      <div className="flex gap-2 mt-1 pt-1 border-t" style={{ borderColor: "#EFE4E9" }}>
        <span className="flex-1">Stock in the chain</span><span className="cc-mono font-semibold">{F.int(stock)} cs</span>
      </div>
      <div className="flex gap-2">
        <span className="flex-1">Sold to shoppers</span><span className="cc-mono">{r.sold == null ? "—" : F.int(r.sold) + " cs"}</span>
      </div>
      {r.dotDate && <div className="text-[11px] opacity-60 mt-1">DOT snapshot {r.dotDate}</div>}
    </div>
  );
}

function InventoryByWeek({ s, feeds }) {
  const { rows, any } = inventoryHistory(s, feeds);
  // Newest reading of each segment and its change from the reading before.
  const latest = INV_SERIES.map(x => {
    const pts = rows.filter(r => r[x.k] != null);
    const last = pts.at(-1), prev = pts.at(-2);
    const delta = last && prev ? Math.round(last[x.k] - prev[x.k]) : null;
    return { ...x, v: last ? last[x.k] : null, wk: last?.wk, delta: delta === 0 ? 0 : delta };
  });
  return (
    <div className="flex flex-col rounded-xl border p-3 min-w-0" style={{ borderColor: "#EFE4E9", background: "#FBF8F6" }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider opacity-60">Where every case sits, by week</span>
        <span className="text-[11px] opacity-60">cases</span>
      </div>
      {!any ? (
        <div className="text-[12px] opacity-60 py-8 text-center">No inventory readings yet — upload a DOT Inventory Snapshot or Retail Link weekly.</div>
      ) : (
        <>
          <div style={{ height: 200 }} className="mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "#E5D9DE" }} tick={tickStyle} interval={0} />
                <YAxis width={44} tickLine={false} axisLine={false} tick={tickStyle} tickFormatter={abbrK} />
                <Tooltip content={<InventoryTooltip />} cursor={{ fill: "rgba(45,34,53,0.05)" }} />
                {INV_SERIES.map(x => (
                  <Bar key={x.k} dataKey={x.k} name={x.label} stackId="inv" fill={x.color} isAnimationActive={false} maxBarSize={36} />
                ))}
                <Line dataKey="sold" name="Sold to shoppers" stroke="#6B3F8C" strokeWidth={2} dot={{ r: 2.5 }} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            {latest.map(x => (
              <div key={x.k} className="flex items-center gap-2 text-[12px]" title={x.src}>
                <span className="inline-block w-2.5 h-2.5 rounded-sm flex-none" style={{ background: x.color }} />
                <span className="flex-1 truncate">{x.label}</span>
                <span className="cc-mono font-semibold">{x.v == null ? <span className="font-normal opacity-50">no reading</span> : F.int(x.v)}</span>
                <span className="cc-mono text-[11px] w-14 text-right"
                  style={{ color: x.delta == null ? undefined : x.k === "expired" ? (x.delta > 0 ? "#8E1039" : "#245B33") : "#2D2235", opacity: x.delta == null ? 0.4 : 0.8 }}>
                  {x.delta == null ? "—" : x.delta === 0 ? "0" : (x.delta > 0 ? "+" : "") + F.int(x.delta)}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-2 text-[12px]">
              <span className="inline-block flex-none" style={{ width: 10, borderTop: "2px solid #6B3F8C" }} />
              <span className="flex-1">Sold to shoppers (line)</span>
            </div>
          </div>
          <div className="text-[11px] opacity-60 mt-2 leading-snug">
            Right column = change vs the previous reading. Bars are week ending (month/day);
            * = partial week, not every source has reported yet (DOT snapshots land mid-week, Retail Link a week behind).
            On-hand history starts with the first upload that carried it and grows one week per upload;
            weeks with no reading are left empty, not zero.
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- service health ---------------- */
// The two numbers Caroline asked to be front and centre (Aug 24 2026):
// IN-STORE FILL RATE and OTIF. They sit above the S&OP cards because they are
// the two ends of the same chain — OTIF (In Time and In Full) is whether we
// delivered to Walmart complete and to the date; in-store fill is whether it
// then reached the shelf. A problem
// in either one invalidates the demand read below it: suppressed POS from an
// out-of-stock is not weak demand, and the engine's trueDemand correction only
// works if you can see how bad the in-stock actually was.
//
// ── Two aggregation traps, both verified against the exports' own totals ──
//
// OTIF is CASES-weighted: on_time / ordered. Averaging the per-PO percentages
// gives 0.6844 where the file itself says 0.6462, because a 21-case PO and a
// 2,500-case PO would count equally.
//
// In-stock is a SIMPLE MEAN across SKUs — that is what reproduces the Sales
// Summary's own Grand Total row (98.1500% computed vs 98.1467% stated).
// Traited-weighting (98.0967%) and POS-weighting (98.1256%) both drift off it.
//
// ── Grain, stated because it is a real limit ─────────────────────────────
// OTIF has NO item number anywhere in the export — it is per PO, so it can
// only ever be a whole-business weekly number, never per SKU. In-stock is per
// SKU. That asymmetry is why the two sides of this panel are shaped
// differently rather than forced into one table.

// Thresholds mirror the Tracker's, deliberately: the same metric flagged at
// two different cut-offs on one page is a bug, not a nuance. In-stock uses the
// Tracker's in-stock row (< 65% bad, < 80% warn); OTIF uses its service/fill
// row (< 90% bad, < 98% warn). Neither is a Walmart-published target — they
// are this page's display thresholds.
const tone = (v, bad, warn) => (v == null ? undefined : v < bad ? "bad" : v < warn ? "warn" : undefined);
const barColor = (v, bad, warn) =>
  v == null ? "#EFE4E9" : v < bad ? "#C2185B" : v < warn ? "#E8A33D" : "#3E8E5A";

// A compact week-by-week bar strip. Shared by both halves so the two metrics
// read on the same visual scale. Bars are drawn on a 0–100% axis rather than
// scaled to the data: these are service levels, and stretching 92%–98% to fill
// the box would make a good week look like a crisis.
function ServiceBars({ rows, bad, warn, fmt }) {
  if (!rows.length) return <div className="text-[11px] opacity-60">No weekly history yet.</div>;
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: 56 }}>
        {rows.map((r) => (
          <div key={r.wk} className="flex-1 min-w-0 flex flex-col justify-end" style={{ height: 56 }}
            title={wkEnding(r.wk) + ": " + fmt(r.v) + (r.note ? " \u00b7 " + r.note : "")}>
            <div className="w-full rounded-t"
              style={{ height: Math.max(2, (r.v ?? 0) * 56), background: barColor(r.v, bad, warn) }} />
          </div>
        ))}
      </div>
      {/* The value on every bar, not just in a tooltip. A service level is read
          for its exact number as often as for its shape, and a hover target is
          no use in a screenshot or on a phone. One decimal: 98.4 vs 98.8 is a
          real difference at this end of the range, and rounding to whole points
          would collapse them. The % sign is carried once in the axis label
          rather than repeated 14 times, which is what makes the column fit. */}
      <div className="flex gap-1 mt-1">
        {rows.map((r) => (
          <div key={r.wk} className="flex-1 min-w-0 text-center text-[11px] cc-mono font-bold tabular-nums tracking-tighter"
            style={{ color: barColor(r.v, bad, warn) }}>
            {r.v == null ? "—" : (r.v * 100).toFixed(1)}
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {rows.map((r) => (
          <div key={r.wk} className="flex-1 min-w-0 text-center text-[10px] cc-mono opacity-60 tabular-nums tracking-tighter">
            {weekEndingNumeric(r.wk)}
          </div>
        ))}
      </div>
      <div className="text-[11px] opacity-50 mt-0.5">values are %, labels are week ending (month/day)</div>
    </div>
  );
}

// In-store fill rate per week, averaged across SKUs. Shared with the actions
// panel so the two read the same number.
function instockRows(series) {
  // Walmart restates in-stock along with POS, so read it off the series rather
  // than caching a headline number anywhere.
  const instockByWk = new Map();
  for (const s of series) {
    for (const c of s.cells) {
      // Require actual sales in the week. Pre-launch weeks carry instock = 0
      // against a handful of test stores (SEED has traited 1–3 back to 202601,
      // and All Item Detail runs the same way), and averaging those genuine
      // zeros into a shelf-availability headline would read as a catastrophic
      // outage in weeks the product simply was not on sale yet.
      if (c.instock == null || !(c.pos > 0)) continue;
      const a = instockByWk.get(c.wk) || { wk: c.wk, vals: [], bySku: {} };
      a.vals.push(c.instock);
      a.bySku[s.sku] = c.instock;
      instockByWk.set(c.wk, a);
    }
  }
  return [...instockByWk.values()]
    .filter((a) => a.vals.length)
    .sort((a, b) => a.wk - b.wk)
    .map((a) => ({ wk: a.wk, v: a.vals.reduce((x, y) => x + y, 0) / a.vals.length, bySku: a.bySku }))
    .slice(-14);
}

// OTIF per week, from its own feed. Shared with the actions panel.
const otifRowsOf = (otif) => (otif ?? []).filter((r) => r.otif != null).map((r) => ({
  wk: r.wk, v: r.otif, note: F.int(r.unfilled) + " cs unfilled",
})).slice(-14);

function ServiceHealth({ series, otif }) {
  // ── In-store fill rate, from the POS feed ──
  const isRows = instockRows(series);
  const isNow = isRows[isRows.length - 1] ?? null;
  const isPrev = isRows[isRows.length - 2] ?? null;
  // Percentage POINTS, not a percentage change — a move from 98% to 96% is
  // "down 2 points", and calling it "-2.0%" would understate it by 50x.
  const isDelta = isNow && isPrev ? (isNow.v - isPrev.v) * 100 : null;

  // ── OTIF, its own feed ──
  // Separate from the cut-recovery panel below on purpose: OTIF is Walmart
  // measuring us against MABD, cut recovery is what DOT failed to ship. Same
  // shipments, opposite ends, and the weeks do not align — the DOT export is
  // keyed on delivery date, OTIF on Walmart's week.
  const src = otif ?? [];
  const otifRows = otifRowsOf(otif);
  const otifNow = otifRows[otifRows.length - 1] ?? null;
  const otifOrdered = src.reduce((a, r) => a + (r.otif != null ? r.ordered : 0), 0);
  const otifOnTime = src.reduce((a, r) => a + (r.otif != null ? (r.onTime ?? 0) : 0), 0);
  const otifAll = otifOrdered > 0 ? otifOnTime / otifOrdered : null;
  const worst = otifRows.length ? otifRows.reduce((a, b) => (b.v < a.v ? b : a)) : null;

  return (
    <section className="bg-white rounded-2xl border p-5" style={{ borderColor: "#E5D9DE" }}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-4">
        <h2 className="cc-serif text-lg">Service health</h2>
        <span className="text-xs opacity-60">
          In-store fill rate and OTIF (In Time and In Full) — the two ends of the chain.
          Source: Retail Link weekly + OTIF PO details.
        </span>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {/* ── in-store fill rate ── */}
        <div>
          <div className="flex items-baseline gap-3 mb-1">
            <Stat label="In-store fill rate" value={F.pct(isNow?.v)} tone={tone(isNow?.v, 0.65, 0.8)}
              src={isNow ? "Repl in-stock % \u00b7 " + wkEnding(isNow.wk) : "awaiting a Retail Link upload"} />
            {isDelta != null && (
              <span className="text-[11px] px-2 py-0.5 rounded-full"
                style={{ background: isDelta < 0 ? "#FDF6FA" : "#EAF4EC", color: isDelta < 0 ? "#8E1039" : "#245B33" }}>
                {(isDelta > 0 ? "+" : "") + isDelta.toFixed(1)} pts vs prior wk
              </span>
            )}
          </div>
          {isNow && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {series.map((s) => {
                const v = isNow.bySku[s.sku];
                if (v == null) return null;
                return (
                  <span key={s.sku} className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{ background: "#F7F1F4", color: barColor(v, 0.65, 0.8) }}>
                    <b>{s.sku}</b> {F.pct(v)}
                  </span>
                );
              })}
            </div>
          )}
          <ServiceBars rows={isRows} bad={0.65} warn={0.8} fmt={F.pct} />
          <p className="text-[11px] opacity-60 mt-1.5">
            Share of traited stores holding stock, averaged across SKUs. Suppressed POS in a low
            week is corrected into true demand by the engine — it is not lost sales you can plan on.
          </p>
        </div>

        {/* ── OTIF ── */}
        <div>
          <div className="flex items-baseline gap-3 mb-1">
            <Stat label="OTIF — In Time and In Full" value={F.pct(otifNow?.v)} tone={tone(otifNow?.v, 0.9, 0.98)}
              src={otifNow ? "cases in time / cases ordered \u00b7 " + wkEnding(otifNow.wk) : "awaiting an OTIF upload"} />
            {otifAll != null && (
              <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "#F7F1F4", color: "#2D2235" }}>
                {F.pct(otifAll)} across {F.int(otifOrdered)} cs loaded
              </span>
            )}
          </div>
          <ServiceBars rows={otifRows} bad={0.9} warn={0.98} fmt={F.pct} />
          {worst && worst.v < 0.9 && (
            <p className="text-[11px] mt-2 rounded-lg px-3 py-2" style={{ background: "#FDF6FA", color: "#8E1039" }}>
              Worst week loaded is <b>{wkEnding(worst.wk)}</b> at {F.pct(worst.v)} — {worst.note}. OTIF is
              measured per PO against MABD and carries no item number, so it cannot be split by SKU.
            </p>
          )}
          {!otifRows.length && (
            <p className="text-[11px] opacity-60 mt-1.5">
              Upload an "OTIF STORE Performance PO DETAILS" export at Uploads &rarr; Retail Link OTIF.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------------- sources & discrepancies ---------------- */
// Every number on this page comes from a file, a formula, or the frozen seed,
// and until now the page did not say which. That matters most for the forecast:
// there are FOUR different forward numbers in this system and they disagree by
// design, so "the forecast" is ambiguous unless you name which one.
//
// Nothing here is hardcoded prose. Every row states a source or a derivation,
// and every discrepancy is computed from the data actually loaded — a claim
// that stops being true stops being displayed.

// file → sheet → column, or the formula. `derived` rows have no file.
const PROVENANCE = [
  { series: 'pos', field: 'POS units / $', file: 'Dirty Cookie WK#', sheet: 'All Item Detail',
    detail: 'Data Type "POS Qty" / "POS Sales $", per week column' },
  { series: 'pos', field: 'Traited stores', file: 'Dirty Cookie WK#', sheet: 'All Item Detail',
    detail: 'Data Type "Traited Stores"' },
  { series: 'pos', field: 'In-stock %', file: 'Dirty Cookie WK#', sheet: 'All Item Detail',
    detail: 'Data Type "Instock" — but see the note below: the engine is fed POS Qty ÷ POS Qty if Instock instead, so it reproduces Walmart\'s own true demand exactly' },
  { series: 'pos', field: 'Store on-hand', file: 'Dirty Cookie WK#', sheet: 'Sales Summary',
    detail: '"Curr Str On Hand" — CURRENT WEEK ONLY. No weekly on-hand history exists in any export, so backfilled weeks are blank, not zero' },
  { series: 'pos', field: 'True demand', derived: true,
    detail: 'Walmart\'s "POS Qty if Instock" where present; the engine\'s POS ÷ in-stock otherwise' },
  { series: 'pos', field: 'Velocity', derived: true, detail: 'true demand ÷ traited stores' },
  { series: 'forecasts', field: 'Walmart store forecast', file: 'Dirty Cookie WK#', sheet: 'Forecast',
    detail: '"final_forecast_each_quantity" by walmart_calendar_week; snapshot week stamped from the file' },
  { series: 'forecasts', field: 'DC internal forecast', derived: true,
    detail: 'base velocity (mean of last 4 actual weeks) × stores used × seasonality multiplier' },
  { series: 'orders', field: 'PO requested / cuts', file: 'Walmart Report (NetSuite)', sheet: 'Walmart Orders',
    detail: 'quantity by the PO\'s SCHEDULED delivery week; cuts = COUNT of lines carrying a Cut Reason' },
  { series: 'orders', field: 'Delivered / revenue', file: 'Walmart Report (NetSuite)', sheet: 'Walmart Orders',
    detail: 'quantity and Amount by the line\'s ACTUAL delivery week — a different date from the above' },
  { series: 'otif', field: 'OTIF %', file: 'OTIF Store Performance', sheet: 'Receiver',
    detail: 'SUM(Cases On Time) ÷ SUM(Cases Ordered) — cases-weighted, never a mean of per-PO percentages' },
  { series: 'consignment', field: 'DOT shipped / cut by SKU', file: 'DOT Consignment Sales History', sheet: 'Consignment Sales History',
    detail: 'Quantity Ordered vs Quantity Received per DOT order × Walmart item, by Detail Establish Date (ship) week. Grouped per Walmart PO × SKU before the cut is taken, so a PO DOT re-placed and later shipped counts as filled. Every shipment, not just cut ones — supersedes Order History for the weeks it covers' },
  { series: 'dotService', field: 'DOT ordered / cut (older weeks)', file: 'DOT Report (Order History)', sheet: 'Outbound Orders',
    detail: 'by Delivery Date week. Per PO — the export carries no item column, and lists only orders with a cut. Used only for weeks before Consignment Sales History begins' },
  { series: 'production', field: 'Cases produced', derived: false, file: '— none —',
    detail: 'Still the frozen seed. production_runs holds 5 rows' },
  { series: 'dot', field: 'DOT on-hand', derived: false, file: 'DOT Inventory Snapshot', sheet: 'Inventory Summary',
    detail: 'good cases = Total Inventory on RG lots (committed Loaded + Picked included; expired EX lots excluded), by GTIN. One reading per SKU per Walmart week, taken as that week\'s CLOSING stock. Weeks without a reading are modelled from the last one — or from params.dotOpeningAnchor before the first' },
];

function SourceRow({ r, live }) {
  return (
    <tr style={{ borderTop: "1px solid #F1E7EC" }}>
      <td className="py-1.5 pr-3 align-top whitespace-nowrap">
        <span className="text-[11px] px-1.5 py-0.5 rounded"
          style={{ background: live === 'live' ? "#EAF4EC" : live === 'none' ? "#F8CBCB" : "#FDF3D8",
                   color: live === 'live' ? "#245B33" : live === 'none' ? "#8E1039" : "#5C4A1F" }}>
          {live === 'live' ? 'live' : live === 'none' ? 'no source' : 'seed'}
        </span>
      </td>
      <td className="py-1.5 pr-3 align-top font-semibold whitespace-nowrap">{r.field}</td>
      <td className="py-1.5 pr-3 align-top cc-mono text-[11px] whitespace-nowrap">
        {r.derived ? <span style={{ color: "#8E1039" }}>derived</span> : r.file}
      </td>
      <td className="py-1.5 pr-3 align-top cc-mono text-[11px] opacity-70 whitespace-nowrap">{r.sheet ?? "—"}</td>
      <td className="py-1.5 align-top text-[11px] opacity-80">{r.detail}</td>
    </tr>
  );
}

function Sources({ feeds, series }) {
  const src = feeds.sources ?? {};
  const statusOf = (k) => (k === 'production'
    ? 'seed'
    : k === 'dot' || k === 'consignment'          // no seed exists for either
      ? (src[k] === 'live' ? 'live' : 'none')
      : (src[k] === 'live' ? 'live' : 'seed'));

  // ── Forecast comparison: the four forward numbers, side by side ──
  // They are computed differently and SHOULD differ; the spread is the signal.
  const rows = [];
  for (const s of series) {
    for (const c of s.cells) {
      if (c.pos != null) continue;               // forward weeks only
      const detail = (feeds.pos ?? []).find((p) => p.wk === c.wk && p.sku === s.sku);
      const wmtSheet = c.wmtStoreFcst;
      const wmtDetail = detail?._wmtFcstDetail ?? null;
      if (wmtSheet == null && wmtDetail == null && c.internalFcst == null) continue;
      rows.push({ sku: s.sku, wk: c.wk, wmtSheet, wmtDetail, internal: c.internalFcst, consensus: c.consensus });
    }
  }
  const fcstRows = rows.sort((a, b) => a.wk - b.wk || a.sku.localeCompare(b.sku)).slice(0, 36);

  // ── Discrepancies, all computed against what is loaded ──
  const disc = [];
  // 1. live POS vs the frozen seed, week by week
  if (feeds.pos) {
    const seedBy = new Map(SEED.pos.map((p) => [p.wk + "|" + p.sku, p]));
    let n = 0, worst = null;
    for (const p of feeds.pos) {
      const sd = seedBy.get(p.wk + "|" + p.sku);
      if (!sd || sd.units == null || p.units == null || sd.units === 0) continue;
      const rel = Math.abs(p.units - sd.units) / sd.units;
      if (rel > 0.02) { n++; if (!worst || rel > worst.rel) worst = { ...p, seed: sd.units, rel }; }
    }
    disc.push({
      title: "Walmart has restated POS since the seed snapshot",
      body: n === 0
        ? "No week differs from the " + SEED.asOf + " seed by more than 2%."
        : n + " week×SKU cells differ from the " + SEED.asOf + " seed by more than 2%. Largest: " +
          wkEnding(worst.wk) + " " + worst.sku + " — seed " + F.int(worst.seed) + " vs file " + F.int(worst.units) +
          " units (" + (worst.rel * 100).toFixed(0) + "%).",
      note: "The file is the later reading and wins. This is why every feed upserts, and why matching the seed is NOT the acceptance test for POS.",
      tone: n > 0 ? "warn" : "ok",
    });
  }
  // 2. All Item Detail's "Forecast" row is NOT a weekly series and must not be
  //    charted as one. Observed on the WK28 file, item 679640563:
  //      202629 = 5,442.49   202630 = 5,382.55
  //      202631 = 193,305.24  ← the Forecast sheet's GRAND TOTAL for that item
  //      202632 onward = 0
  //    A grand total sitting in a week column, then zeros. An earlier build
  //    reported a "median ratio per SKU" over this column; that statistic was
  //    computed partly over the corrupted cells and has been withdrawn.
  //    Reported as a defect with its evidence, not as a comparison.
  const detailFcst = (feeds.pos ?? []).filter((p) => p._wmtFcstDetail > 0);
  if (detailFcst.length) {
    const max = detailFcst.reduce((a, b) => (b._wmtFcstDetail > a._wmtFcstDetail ? b : a));
    const sheetAt = (feeds.forecasts ?? []).find((f) => f.target === max.wk && f.sku === max.sku);
    disc.push({
      title: "Walmart's second forecast column is malformed — not used",
      body: "All Item Detail carries a \"Forecast\" row, but it is not a weekly series: it holds a " +
        "few real weeks, then a grand total dropped into a week column, then zeros. Largest value loaded is " +
        F.int(max._wmtFcstDetail) + " at " + wkEnding(max.wk) + " for " + max.sku +
        (sheetAt ? " — the Forecast sheet says " + F.int(sheetAt.units) + " for the same week." : "."),
      note: "The planner uses the FORECAST SHEET'S RAW ROWS exclusively — one row per item × week, with a snapshot week, which accuracy scoring needs. This column is ingested but drives nothing and is not charted.",
      tone: "warn",
    });
  }
  // 3. engine-derived true demand vs Walmart's supplied figure
  if (feeds.pos) {
    const withBoth = feeds.pos.filter((p) => p._trueDemandSupplied > 0 && p.units > 0 && p._instockRaw > 0);
    if (withBoth.length) {
      const gaps = withBoth.map((p) => Math.abs(p.units / p._instockRaw - p._trueDemandSupplied) / p._trueDemandSupplied);
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      disc.push({
        title: "True demand: Walmart's figure vs the engine's formula",
        body: "POS ÷ in-stock differs from Walmart's \"POS Qty if Instock\" by " + (mean * 100).toFixed(2) +
          "% on average across " + withBoth.length + " cells.",
        note: "The planner feeds the engine an in-stock % back-solved from Walmart's own figure, so the number you see reproduces Walmart exactly rather than the formula's approximation.",
        tone: "ok",
      });
    }
  }
  // 4. DOT freshness
  if (feeds.dotService?.length) {
    const newest = Math.max(...feeds.dotService.map((r) => r.wk));
    const latestPos = Math.max(0, ...series.flatMap((s) => s.cells.filter((c) => c.pos != null).map((c) => c.wk)));
    disc.push({
      title: "DOT cut recovery is not on the same clock as POS",
      body: "DOT data ends at " + wkEnding(newest) + "; POS runs to " + wkEnding(latestPos) + ".",
      note: "A DOT report arrives weekly, so a gap of two weeks or more means an upload was MISSED, not that none was due. Cut recovery describes the window it covers, not the current one.",
      tone: latestPos - newest >= 2 ? "warn" : "ok",
    });
  }

  return (
    <div className="flex flex-col gap-4 max-w-6xl">
      <section className="bg-white rounded-2xl border p-5" style={{ borderColor: "#E5D9DE" }}>
        <header className="mb-3">
          <h2 className="cc-serif text-lg">Where every number comes from</h2>
          <p className="text-xs opacity-60">
            File → sheet → column, or the formula. "Derived" means this page computes it; nothing in the source files says it.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider opacity-60 text-left">
                <th className="pb-1 pr-3">Status</th><th className="pb-1 pr-3">Figure</th>
                <th className="pb-1 pr-3">File</th><th className="pb-1 pr-3">Sheet</th><th className="pb-1">Column / derivation</th>
              </tr>
            </thead>
            <tbody>
              {PROVENANCE.map((r, i) => <SourceRow key={i} r={r} live={statusOf(r.series)} />)}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-white rounded-2xl border p-5" style={{ borderColor: "#E5D9DE" }}>
        <header className="mb-3">
          <h2 className="cc-serif text-lg">Discrepancies</h2>
          <p className="text-xs opacity-60">
            Computed from the data currently loaded, not asserted. Each one is a place two sources disagree
            and the planner had to choose.
          </p>
        </header>
        {disc.length === 0 && <p className="text-[12px] opacity-60">Nothing to compare yet — upload the weekly exports.</p>}
        <div className="flex flex-col gap-2">
          {disc.map((d, i) => (
            <div key={i} className="rounded-lg px-3 py-2 text-[12px]"
              style={{ background: d.tone === "warn" ? "#FDF3D8" : "#F7F1F4",
                       border: "1px solid " + (d.tone === "warn" ? "#E8D9A8" : "#EFE4E9") }}>
              <div className="font-semibold" style={{ color: d.tone === "warn" ? "#5C4A1F" : "#2D2235" }}>{d.title}</div>
              <div className="mt-0.5">{d.body}</div>
              <div className="mt-1 text-[11px] opacity-70"><b>How the planner resolves it:</b> {d.note}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white rounded-2xl border p-5" style={{ borderColor: "#E5D9DE" }}>
        <header className="mb-3">
          <h2 className="cc-serif text-lg">The forecast, three ways</h2>
          <p className="text-xs opacity-60">
            Forward weeks only. These are computed differently and are SUPPOSED to differ — the spread is
            what tells you which assumption to interrogate. Walmart's second forecast column is deliberately
            absent: it is malformed (see Discrepancies).
          </p>
        </header>
        {fcstRows.length === 0 && <p className="text-[12px] opacity-60">No forward weeks with forecast data yet.</p>}
        {fcstRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] cc-mono">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider opacity-60 text-left cc-sans">
                  <th className="pb-1 pr-3">Wk ending</th><th className="pb-1 pr-3">SKU</th>
                  <th className="pb-1 pr-3 text-right" title="Forecast sheet — carries a snapshot week">WMT (Forecast sheet)</th>
                  <th className="pb-1 pr-3 text-right" title="base velocity × stores × seasonality">DC internal</th>
                  <th className="pb-1 pr-3 text-right">Consensus</th>
                  <th className="pb-1 text-right" title="WMT (Forecast sheet) vs DC internal">Gap</th>
                </tr>
              </thead>
              <tbody>
                {fcstRows.map((r, i) => {
                  const gap = r.wmtSheet != null && r.internal ? r.wmtSheet / r.internal - 1 : null;
                  return (
                    <tr key={i} style={{ borderTop: "1px solid #F1E7EC" }}>
                      <td className="py-1 pr-3">{weekEndingSunday(r.wk)}</td>
                      <td className="py-1 pr-3 font-bold">{r.sku}</td>
                      <td className="py-1 pr-3 text-right">{F.int(r.wmtSheet)}</td>
                      <td className="py-1 pr-3 text-right">{F.int(r.internal)}</td>
                      <td className="py-1 pr-3 text-right">{F.int(r.consensus)}</td>
                      <td className="py-1 text-right font-bold"
                        style={{ color: gap == null ? "#2D2235" : Math.abs(gap) > 0.15 ? "#C2185B" : "#245B33" }}>
                        {gap == null ? "—" : F.spct(gap)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] opacity-60 mt-2">
          A fifth forward number exists and is deliberately NOT in this table: the <b>Supply Plan</b> is Walmart's
          plan for what it will ORDER FROM US, not what shoppers will buy. It is ingested but not wired into the
          engine, and adding it to these would double-count demand.
        </p>
      </section>
    </div>
  );
}

// Sits above the S&OP cards, on the tab people land on. Since Nov 5 2026 the
// two standing caveats are one line each: the headline always shows (still
// not dismissible — it stops being true when `production` gets a real feed,
// not when somebody clicks), the detail opens on click. The full text was two
// long amber paragraphs that pushed every number below the fold.
function Caveat({ title, children }) {
  return (
    <details className="group rounded-lg text-[12px]"
      style={{ background: "#FDF3D8", border: "1px solid #E8D9A8", color: "#5C4A1F" }}>
      <summary className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true">⚠</span>
        <span className="font-semibold flex-1">{title}</span>
        <span className="text-[11px] opacity-70 group-open:hidden">Details</span>
        <span className="text-[11px] opacity-70 hidden group-open:inline">Hide</span>
      </summary>
      <div className="px-3 pb-3 pt-0.5 border-t" style={{ borderColor: "#E8D9A8" }}>{children}</div>
    </details>
  );
}

function PlaceholderNotice() {
  return (
    <Caveat title="Do not plan production from this page yet. The supply side is not live.">
      <div className="mt-1.5">
        Everything on the <b>demand</b> side is live and reconciles to Walmart's own totals — POS,
        in-store fill rate, OTIF, the Walmart forecast, orders and cut recovery.
        The <b>supply</b> side does not: production volumes are a frozen 2026-08-13 snapshot, and
        DOT on-hand is <b>measured only in weeks with a DOT Inventory Snapshot upload</b> — every
        other DOT figure is modelled from that reading. Figures built on those assumptions — the DOT
        buffer, forward days on hand, recommended production — are left blank on this tab and greyed in
        the Tracker. (DOT days on hand on each card is measured: the latest snapshot ÷ recent POS.) Size co-bakery runs the way you did before this page existed.
        {" "}<span className="opacity-70">Detail: docs/DEMAND_PLANNER_KNOWN_ISSUES.md</span>
      </div>
    </Caveat>
  );
}

// Status of the 12 → 8 case-pack change (raised Nov 5 2026). Static on
// purpose: remove or update it when the cutover date, the 8-count GTIN, or the
// Cases / Sell units switch lands. Detail: docs/BUILD_PLAN.md ("Doughs 12 → 8").
function PackChangeNotice() {
  return (
    <Caveat title="Case pack is changing: WC, PBG and CCF go from 12 to 8 per case. This page does not reflect it yet.">
      <ul className="mt-1.5 space-y-0.5 list-disc pl-4">
        <li><b>Today:</b> every case figure is Walmart's sell units ÷ 12 (÷ 10 for Black Currant), and MOQ (756 cs) and pallets (189 cs) assume the 12-count case.</li>
        <li><b>Not changing:</b> the sell unit and the Walmart item numbers. POS, the Walmart forecast and the Supply Plan arrive in sell units and stay correct.</li>
        <li><b>Still unknown:</b> the cutover date, the new case GTIN (not yet issued), and the 8-count MOQ and cases per pallet.</li>
        <li><b>After the cutover</b>, until this page is updated: Walmart demand shown in cases will read about a third low against 8-count orders and production (÷ 12 instead of ÷ 8). Plan the changeover in sell units.</li>
        <li><b>Planned, on hold:</b> a Cases / Sell units switch on this page.</li>
      </ul>
      <div className="mt-1 opacity-70">Detail: docs/BUILD_PLAN.md, "Doughs 12 → 8"</div>
    </Caveat>
  );
}

function UnmappedItemsNotice({ items }) {
  if (!items?.length) return null;
  const cases = items.reduce((a, r) => a + r.cases, 0);
  const value = items.reduce((a, r) => a + r.value, 0);
  // Red, not amber: this is not a caveat about precision, it is volume the
  // page is NOT showing. Every series on it understates the order book by
  // exactly this much until the SKU map learns the item.
  return (
    <div className="rounded-xl px-4 py-3 text-[12px] mb-4"
      style={{ background: "#F8CBCB", border: "1px solid #E2A1A1", color: "#8E1039" }}>
      <div className="font-semibold mb-0.5">
        {F.int(cases)} cases of NetSuite orders ({F.money(value)}) are missing from this page.
      </div>
      <div>
        {items.length === 1 ? "Cortina item" : "Cortina items"}{" "}
        {items.map((r) => r.item).join(", ")} {items.length === 1 ? "is" : "are"} not mapped to a SKU,
        so every line carrying {items.length === 1 ? "it" : "them"} is excluded from orders, fill rate,
        cut counts and the forward cascade — on every SKU card.
        <ul className="mt-1.5 space-y-0.5">
          {items.map((r) => (
            <li key={r.item} className="cc-mono text-[11px]">
              item {r.item} · {F.int(r.cases)} cs · {F.money(r.value)} · {r.lines} lines ·
              {r.firstWk ? ` wks ending ${weekEndingSunday(r.firstWk)}\u2013${weekEndingSunday(r.lastWk)}` : " no ship date"}
              {r.sku ? ` · ${r.sku}` : ""}
            </li>
          ))}
        </ul>
        <div className="mt-1.5">
          Fix: add the item to <span className="cc-mono">CORTINA_ITEM_TO_SKU</span> in{" "}
          <span className="cc-mono">src/hooks/useDemandFeeds.js</span>, with its Walmart prime item
          number in <span className="cc-mono">ITEM_TO_SKU</span> and the short code in{" "}
          <span className="cc-mono">SKU_NAMES</span> here.
        </div>
      </div>
    </div>
  );
}

// Per-SKU inputs for the funnel that the engine does not carry: the newest DOT
// reading and Walmart's warehouse on-hand (both current-week figures).
function funnelInputs(sku, s, feeds) {
  const dots = (feeds.dotOnHand ?? []).filter(r => r.sku === sku);
  const d = dots.length ? dots.reduce((a, r) => (r.wk > a.wk || (r.wk === a.wk && r.snapshotDate > a.snapshotDate) ? r : a)) : null;
  let wh = null;
  for (const p of (feeds.pos ?? [])) if (p.sku === sku && p.whOh != null && (!wh || p.wk > wh.wk)) wh = { units: p.whOh, wk: p.wk };
  const posWks = s.cells.filter(c => c.pos != null).map(c => c.wk);
  return {
    dot: d && { ...d, label: new Date(`${d.snapshotDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) },
    wh,
    rlWk: posWks.length ? Math.max(...posWks) : null,
  };
}

/* ---------------- this week's actions (B2) ---------------- */
// Folded in from the prototype's ActionPanel (Caroline, Nov 2 2026), with every
// flag on a MEASURED figure. The prototype's "DOT cover under 7 days" is left
// out: dotDoh is still a placeholder (KNOWN_ISSUES §1), and a red flag on a
// made-up number reads as a real alarm. It comes back with a production feed.
//
// Text is built as one string per action: React's server render splits
// adjacent expressions with comments, which would hide them from the smoke test.
const ACTION_OWNERS = {
  dot: "Harshita · Cortina/DOT",
  walmart: "Caroline Collins / David · Walmart",
  ops: "Dirty Cookie ops",
};
const EXPIRING_RED_SHARE = 0.3;   // the prototype's threshold, now the amber → red line
const GAP_WARN = 0.15, GAP_BAD = 0.4;
const INSTOCK_BAD = 0.65, OTIF_BAD = 0.9; // Service health's red lines
const STALE_WEEKS = 2;
const CUT_WARN = 0.05, CUT_BAD = 0.15; // share of ordered cases DOT cut, last 4 ship weeks
// Weeks apart, across the fiscal year end (52 weeks; live POS also carries 53).
const wkIndex = wk => (Math.floor(wk / 100) - 2026) * 52 + (wk % 100);
const wkTag = wkEnding;
// The Walmart week three weeks before `wk` (a 4-week window ending at wk).
const s4Back = wk => {
  const i = wkIndex(wk) - 3;
  const y = 2026 + Math.floor((i - 1) / 52);
  return y * 100 + (((i - 1) % 52) + 52) % 52 + 1;
};
const sortSkus = obj => Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

function buildActions({ series, metrics, feeds, todayWk }) {
  const acts = [];
  const add = (tone, who, text, src) => acts.push({ tone, who, text, src });

  // ── DOT stock: the newest reading per SKU ──
  const dots = series.map(s => funnelInputs(s.sku, s, feeds).dot).filter(Boolean);
  const newestDot = dots.length ? dots.reduce((a, d) => (d.wk > a.wk || (d.wk === a.wk && d.snapshotDate > a.snapshotDate) ? d : a)) : null;
  const dotSrc = d => "DOT Inventory Snapshot · " + d.label;

  const expired = Object.fromEntries(dots.map(d => [d.sku, d.expired ?? 0]));
  const expiredTotal = Object.values(expired).reduce((a, b) => a + b, 0);
  if (expiredTotal > 0) add("bad", ACTION_OWNERS.dot,
    "Decide what to do with " + F.int(expiredTotal) + " expired cases at DOT (" +
      sortSkus(expired).map(([k, v]) => k + " " + F.int(v)).join(" · ") + ")",
    dotSrc(newestDot));

  for (const d of dots) {
    if (!(d.expiring60 > 0)) continue;
    const share = d.cases > 0 ? d.expiring60 / d.cases : null;
    const first = d.earliestExpiry
      ? new Date(`${d.earliestExpiry}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
      : null;
    add(share != null && share > EXPIRING_RED_SHARE ? "bad" : "warn", ACTION_OWNERS.dot,
      d.sku + ": " + F.int(d.expiring60) + " good cases expire within 60 days" +
        (share != null ? " (" + F.pct0(share) + " of good stock" + (first ? ", first " + first : "") + ")" : "") +
        " — sell these first",
      dotSrc(d));
  }

  // ── Walmart's forecast vs ours, next 4 weeks ──
  for (const m of metrics) {
    if (m.n4wGap == null || Math.abs(m.n4wGap) <= GAP_WARN) continue;
    add(Math.abs(m.n4wGap) > GAP_BAD ? "bad" : "warn", ACTION_OWNERS.walmart,
      "Challenge the " + m.sku + " forecast: Walmart is " + F.spct(m.n4wGap) + " vs ours, next 4 weeks",
      "Retail Link forecast vs internal · after " + wkTag(m.latestWk));
  }

  // ── DOT cuts, by SKU: last 4 ship weeks of Consignment Sales History ──
  // Measured, item-level (Nov 5 2026). Flags a SKU when DOT shipped less than
  // CUT_WARN of what Walmart ordered; red past CUT_BAD.
  const cs = feeds.consignment ?? [];
  if (cs.length) {
    const newest = Math.max(...cs.map(r => r.wk));
    for (const a of consignmentBySku(cs, s4Back(newest))) {
      const share = a.ordered > 0 ? a.cut / a.ordered : 0;
      if (share <= CUT_WARN) continue;
      add(share > CUT_BAD ? "bad" : "warn", ACTION_OWNERS.dot,
        a.sku + ": DOT cut " + F.int(a.cut) + " of " + F.int(a.ordered) + " cs Walmart ordered (" + F.pct0(share) +
          "), last 4 ship weeks — check supply allocation",
        "DOT Consignment Sales History · " + wkEnding(s4Back(newest)) + " to " + wkEnding(newest));
    }
  }

  // ── Service: red lines only ──
  const isNow = instockRows(series).at(-1);
  if (isNow && isNow.v < INSTOCK_BAD) add("bad", ACTION_OWNERS.walmart,
    "In-store fill rate is " + F.pct(isNow.v) + ", below " + F.pct0(INSTOCK_BAD) + " — shelves are empty in stores carrying the item",
    "Retail Link weekly · " + wkTag(isNow.wk));
  const otifNow = otifRowsOf(feeds.otif).at(-1);
  if (otifNow && otifNow.v < OTIF_BAD) add("bad", ACTION_OWNERS.walmart,
    "OTIF is " + F.pct(otifNow.v) + ", below " + F.pct0(OTIF_BAD) + " (" + otifNow.note + ")",
    "OTIF PO details · " + wkTag(otifNow.wk));

  // ── Stale uploads: the page is only as current as its last file ──
  const lastPosWk = feeds.sources?.pos === "live" ? feeds.asOf : null;
  if (!lastPosWk) add("warn", ACTION_OWNERS.ops,
    "No live Retail Link POS — upload the weekly export at Uploads → Retail Link Weekly", "page is on the " + SEED.asOf + " seed");
  else if (todayWk && wkIndex(todayWk) - wkIndex(lastPosWk) > STALE_WEEKS) add("warn", ACTION_OWNERS.ops,
    "Retail Link POS is " + (wkIndex(todayWk) - wkIndex(lastPosWk)) + " weeks behind — upload the latest weekly export at Uploads → Retail Link Weekly",
    "newest POS week " + wkTag(lastPosWk) + " · today " + wkTag(todayWk));
  if (!newestDot) add("warn", ACTION_OWNERS.ops,
    "No DOT Inventory Snapshot uploaded — upload it at Uploads → DOT Inventory Snapshot", "no DOT on-hand reading");
  else if (todayWk && wkIndex(todayWk) - wkIndex(newestDot.wk) > STALE_WEEKS) add("warn", ACTION_OWNERS.ops,
    "DOT on-hand is " + (wkIndex(todayWk) - wkIndex(newestDot.wk)) + " weeks old — upload the latest Inventory Snapshot at Uploads → DOT Inventory Snapshot",
    dotSrc(newestDot) + " · today " + wkTag(todayWk));

  const order = { bad: 0, warn: 1 };
  return acts.sort((a, b) => order[a.tone] - order[b.tone]);
}

const ACTION_TONE = {
  bad: { bg: "#F8CBCB", fg: "#8E1039" },
  warn: { bg: "#FDE9C8", fg: "#8A5A10" },
  good: { bg: "#D8EFD8", fg: "#2C5E3A" },
};

function ActionPanel({ series, metrics, feeds }) {
  const todayWk = walmartWeekOf(todayIso());
  const acts = buildActions({ series, metrics, feeds, todayWk });
  const shown = acts.length ? acts
    : [{ tone: "good", who: null, text: "No flags this week", src: "checked " + todayLong() }];
  return (
    <section className="bg-white rounded-2xl border p-5" style={{ borderColor: "#E5D9DE" }}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
        <h2 className="cc-serif text-lg">This week’s actions</h2>
        <span className="text-xs opacity-60">
          Flags from measured figures only. DOT days of cover is left out until production has a real feed.
        </span>
      </header>
      <div className="flex flex-col gap-2">
        {shown.map((a, i) => (
          <div key={i} className="flex flex-wrap sm:flex-nowrap items-start gap-x-3 gap-y-1 text-[13px]">
            <span className="flex-none mt-1.5 inline-block w-2 h-2 rounded-full" style={{ background: ACTION_TONE[a.tone].fg }} />
            <div className="flex-1 min-w-0">
              <div>{a.text}</div>
              <div className="text-[11px] opacity-55">{a.src}</div>
            </div>
            {a.who && (
              <span className="flex-none text-[11px] px-2 py-0.5 rounded-full ml-5 sm:ml-0"
                style={{ background: ACTION_TONE[a.tone].bg, color: ACTION_TONE[a.tone].fg }}>{a.who}</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function Summary({ series, metrics, feeds }) {
  return (
    <div className="flex flex-col gap-4">
      <FlowLegend latestWk={Math.max(0, ...metrics.map(m => m.latestWk ?? 0)) || null} />
      {series.map((s, i) => <FlowCard key={s.sku} s={s} m={metrics[i]} f={funnelInputs(s.sku, s, feeds)} feeds={feeds} />)}
    </div>
  );
}

// Per-SKU cut table, from Consignment Sales History (Nov 5 2026) — the first
// DOT feed with an item on every line. Grouped per PO × SKU in the hook, so a
// re-placed order that later shipped counts as filled.
function consignmentBySku(rows, fromWk) {
  const by = new Map();
  for (const r of rows ?? []) {
    if (fromWk && wkIndex(r.wk) < wkIndex(fromWk)) continue;
    const a = by.get(r.sku) || { sku: r.sku, ordered: 0, received: 0, cut: 0, pos: 0, replaced: 0 };
    a.ordered += r.ordered; a.received += r.received; a.cut += r.cut; a.pos += 1;
    if (r.replaced && r.cut === 0) a.replaced += 1;
    by.set(r.sku, a);
  }
  return ["WC", "PBG", "CCF", "BC"].map(k => by.get(k)).filter(Boolean)
    .map(a => ({ ...a, fill: a.ordered > 0 ? a.received / a.ordered : null }));
}

function DotServicePanel({ svc, latestDataWk, consignment }) {
  if (!svc.rows.length) return null;
  const csWeeks = (consignment ?? []).map(r => r.wk);
  const csNewest = csWeeks.length ? Math.max(...csWeeks) : null;
  const csFirst = csWeeks.length ? Math.min(...csWeeks) : null;
  // "Last 4 weeks" = the four newest SHIP weeks in the file.
  const l4From = csNewest ? s4Back(csNewest) : null;
  const skuL4 = consignmentBySku(consignment, l4From);
  const skuAll = consignmentBySku(consignment, null);
  const max = Math.max(...svc.rows.map(r => r.trueOrdered));
  // A DOT report now arrives WEEKLY (Caroline, Aug 24 2026), so this gap is a
  // missed-upload signal rather than an inherent property of the feed — which
  // makes it worth acting on rather than merely noting. Before that was
  // established, the July 2026 file sat weeks behind POS with nothing on screen
  // to say so, and its window happens to be the supply crisis: exactly the data
  // someone would misread as current. Compare against the newest week that has
  // POS and say the gap out loud rather than trusting the reader to notice the
  // axis labels.
  const newestDot = Math.max(...svc.rows.map(r => r.wk));
  const weeksBehind = latestDataWk && newestDot ? latestDataWk - newestDot : 0;
  const stale = weeksBehind >= 2;
  return (
    <section className="bg-white rounded-2xl border p-5 mt-4" style={{ borderColor: "#E5D9DE" }}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
        <h2 className="cc-serif text-lg">DOT service & cut recovery</h2>
        <span className="text-xs opacity-60">
          {csFirst
            ? <>Source: DOT Consignment Sales History from {wkEnding(csFirst)} (every shipment, by item){svc.rows.some(r => r.wk < csFirst) ? "; earlier weeks from DOT Order History (cut orders only)" : ""} · NetSuite requested/delivered.</>
            : <>Source: the DOT "Order History" outbound export + NetSuite requested/delivered · all SKUs.</>}
          {" "}Cut = cases DOT did not ship; the order book Walmart placed is larger than NetSuite records by that amount.
        </span>
        {stale && (
          <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
            style={{ background: "#FDF3D8", color: "#8E1039" }}>
            DOT data ends {wkEnding(newestDot)} — {weeksBehind} weeks behind POS
          </span>
        )}
      </header>
      <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Stat label="Walmart ordered (slice)" value={F.int(svc.ordered) + " cs"} />
          <Stat label="Cut at DOT" value={F.int(svc.cut) + " cs"} tone="bad" />
          <Stat label="Invisible in NetSuite" value={"+" + F.int(svc.recovered) + " cs"} tone="bad" />
          <Stat label="True fill (order book)" value={F.pct(svc.trueFill)} tone={svc.trueFill < 0.9 ? "bad" : undefined} />
        </div>
        <div>
          <div className="flex items-end gap-2" style={{ height: 84 }}>
            {svc.rows.map(r => (
              <div key={r.wk} className="flex flex-col items-center gap-1 flex-1 min-w-0"
                title={wkEnding(r.wk) + ": true order book " + F.int(r.trueOrdered) + " cs · cut " + F.int(r.cut) + " · NS delivered " + F.int(r.nsDlv)}>
                <div className="w-full flex flex-col justify-end rounded-t overflow-hidden" style={{ height: 64 }}>
                  <div style={{ height: (r.cut / max) * 64, background: "#C2185B" }} />
                  <div style={{ height: (Math.max(0, r.trueOrdered - r.cut) / max) * 64, background: "#9BC49B" }} />
                </div>
                <div className="text-[10px] cc-mono opacity-60">{weekEndingNumeric(r.wk)}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-1 text-[11px] opacity-70">
            <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: "#C2185B" }} />cut</span>
            <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: "#9BC49B" }} />filled</span>
            <span className="ml-auto">true order book = NetSuite requested + DOT-recovered cuts</span>
          </div>
        </div>
      </div>
      {stale && (
        <p className="text-[11px] mt-3 rounded-lg px-3 py-2"
          style={{ background: "#FDF3D8", border: "1px solid #E8D9A8", color: "#5C4A1F" }}>
          <b>This panel is not current.</b> The loaded DOT shipment data ends {wkEnding(newestDot)},
          {weeksBehind} weeks behind the POS data above. A DOT report arrives <b>weekly</b>, so this
          means {weeksBehind === 1 ? "an upload is due" : "uploads have been missed"} — not that none
          was available. Cut recovery here describes that window, not today.
          Upload the latest DOT Consignment Sales History at Uploads → card 8.
        </p>
      )}
      {skuAll.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <div className="text-[11px] uppercase tracking-wider opacity-60 mb-1">
            By SKU · Consignment Sales History · cases ordered vs shipped
          </div>
          <table className="w-full text-[12px] cc-mono">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider opacity-60 text-right cc-sans">
                <th className="text-left font-semibold pb-1 pr-3">SKU</th>
                <th className="font-semibold pb-1 pr-3" colSpan={4}>Last 4 ship weeks (from {wkEnding(l4From)})</th>
                <th className="font-semibold pb-1 pl-4" colSpan={3}>All loaded ({wkEnding(csFirst)} – {wkEnding(csNewest)})</th>
              </tr>
              <tr className="text-[11px] opacity-60 text-right cc-sans">
                <th />
                <th className="font-normal pr-3">Ordered</th><th className="font-normal pr-3">Shipped</th>
                <th className="font-normal pr-3">Cut</th><th className="font-normal pr-3">Fill</th>
                <th className="font-normal pl-4 pr-3">Ordered</th><th className="font-normal pr-3">Cut</th><th className="font-normal">Fill</th>
              </tr>
            </thead>
            <tbody>
              {skuAll.map(a => {
                const l = skuL4.find(x => x.sku === a.sku);
                const fillColor = f => (f == null ? undefined : f < 0.9 ? "#C2185B" : f < 0.98 ? "#B87514" : "#245B33");
                return (
                  <tr key={a.sku} style={{ borderTop: "1px solid #F1E7EC" }} className="text-right">
                    <td className="text-left py-1 pr-3 font-bold cc-sans">{a.sku}</td>
                    <td className="pr-3">{l ? F.int(l.ordered) : "—"}</td>
                    <td className="pr-3">{l ? F.int(l.received) : "—"}</td>
                    <td className="pr-3" style={{ color: l?.cut ? "#8E1039" : undefined }}>{l ? F.int(l.cut) : "—"}</td>
                    <td className="pr-3 font-bold" style={{ color: fillColor(l?.fill) }}>{l ? F.pct(l.fill) : "—"}</td>
                    <td className="pl-4 pr-3">{F.int(a.ordered)}</td>
                    <td className="pr-3" style={{ color: a.cut ? "#8E1039" : undefined }}>{F.int(a.cut)}</td>
                    <td className="font-bold" style={{ color: fillColor(a.fill) }}>{F.pct(a.fill)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[11px] opacity-60 mt-1 cc-sans">
            Per Walmart PO × SKU: a PO that DOT cut and later re-shipped on a new DOT order counts as filled
            ({skuAll.reduce((n, a) => n + a.replaced, 0)} such PO{skuAll.reduce((n, a) => n + a.replaced, 0) === 1 ? "" : "s"} in the loaded window).
            Weeks are the ship week (Detail Establish Date).
          </p>
        </div>
      )}
      <p className="text-[11px] mt-3 rounded-lg px-3 py-2" style={{ background: "#FDF6FA", color: "#8E1039" }}>
        The order book Walmart actually placed was <b>{F.int(svc.recovered)} cases</b> larger than
        NetSuite shows for the loaded window — evidence for the supply-allocation conversation, not a
        demand problem.{" "}
        {/* A cut-REASON breakdown lived here as prose ("Restricted Supply — Supplier" on 119 of 136
            fully-cut orders, DOT out-of-stock on only 9). It described the 6/18–7/20 slice
            specifically, and now that this panel reads whatever export was last uploaded it would
            have quietly become a lie. `po_line_items.cut_reason` IS now ingested (ADR-059), so this
            can come back — as a computed breakdown over the loaded window, never as a sentence. */}
        <span className="opacity-70">Cut reasons are ingested per line but not yet summarised here.</span>
      </p>
    </section>
  );
}

/* ---------------- data freshness strip ---------------- */
// Replaced the green "Live Retail Link data through…" paragraph (Nov 5 2026).
// One tile per feed, each saying how far its data runs and how that compares
// with today, laid out on a grid so the dates line up and can be compared at
// a glance. The page is only as current as the last file someone uploaded, so
// staleness is computed from the data, never asserted.
//
// `lag` counts weeks behind the last COMPLETE Walmart week: data through last
// week is current. Thresholds match the actions panel (STALE_WEEKS).
const FRESH_TONE = {
  ok:   { dot: "#3E8E5A", fg: "#245B33" },
  warn: { dot: "#E8A33D", fg: "#8A5A10" },
  bad:  { dot: "#C2185B", fg: "#8E1039" },
};
function freshnessOf({ wk, live, todayWk }) {
  if (!live) return { tone: "bad", text: "not live · seed data" };
  if (!wk) return { tone: "bad", text: "nothing uploaded" };
  const lag = wkIndex(todayWk) - wkIndex(wk) - 1;
  if (lag <= 0) return { tone: "ok", text: "current" };
  if (lag < STALE_WEEKS) return { tone: "ok", text: lag + " wk behind" };
  return { tone: lag >= 8 ? "bad" : "warn", text: lag + " wks behind — upload due" };
}

function DataFreshness({ items }) {
  return (
    <section aria-label="Data freshness" className="px-6 py-3 border-b cc-sans"
      style={{ borderColor: "#E5D9DE", background: "#FFFFFF" }}>
      <div className="text-[11px] uppercase tracking-wider font-semibold opacity-60 mb-2">Data through</div>
      <div className="grid gap-px rounded-lg overflow-hidden grid-cols-2 sm:grid-cols-4 xl:grid-cols-7"
        style={{ background: "#EFE4E9", border: "1px solid #EFE4E9" }}>
        {items.map(it => {
          const t = FRESH_TONE[it.status.tone];
          return (
            <div key={it.label} className="bg-white px-3 py-2" title={it.title}>
              <div className="text-[11px] opacity-60 truncate">{it.label}</div>
              <div className="text-[14px] mt-0.5 whitespace-nowrap">
                {it.prefix && <span className="text-[12px] opacity-60">{it.prefix} </span>}
                <span className="font-semibold">{it.date ?? "—"}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] mt-0.5" style={{ color: t.fg }}>
                <span className="inline-block w-2 h-2 rounded-full flex-none" style={{ background: t.dot }} />
                {it.status.text}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- tracker ---------------- */
const ROWS = [
  { k: "traited", l: "Traited stores", g: c => c.traited, f: "int" },
  { k: "pos", l: "POS actual (units)", g: c => c.pos, f: "int" },
  { k: "instock", l: "In-stock %", g: c => c.instock, f: "pct0",
    flag: c => (c.instock != null && c.instock < 0.65 ? "bad" : c.instock != null && c.instock < 0.8 ? "warn" : null) },
  { k: "true", l: "True demand (OOS-adj)", g: c => c.trueDemand, f: "int" },
  { k: "vel", l: "Velocity (u/store/wk)", g: c => c.velocity, f: "d2" },
  { k: "ohdoh", l: "Store OH DOH", g: c => c.storeOhDoh, f: "d1" },
  { k: "sfc", l: "Walmart store fcst", g: c => c.wmtStoreFcst, f: "int", sec: "Forecast" },
  { k: "internal", l: "DC internal fcst", g: c => c.internalFcst, f: "int" },
  { k: "mult", l: "Seasonality ×", g: c => c.mult, f: "d2", edit: "mult" },
  { k: "ovr", l: "Consensus override", g: c => c.override, f: "int", edit: "override" },
  { k: "cons", l: "Consensus", g: c => c.consensus, f: "int" },
  { k: "gap", l: "WMT vs DC gap", g: c => c.gap, f: "pct0",
    flag: c => (c.gap != null && Math.abs(c.gap) > 0.15 ? "bad" : null) },
  { k: "dem", l: "Demand (cases)", g: c => c.demandCases, f: "int" },
  { k: "req", l: "PO requested (cs)", g: c => c.req, f: "int", sec: "Orders & service" },
  { k: "dlv", l: "Delivered (cs)", g: c => c.dlv, f: "int" },
  { k: "fill", l: "Fill rate", g: c => c.fillRate, f: "pct0",
    flag: c => (c.fillRate != null && c.fillRate < 0.9 ? "bad" : c.fillRate != null && c.fillRate < 0.98 ? "warn" : null) },
  { k: "cuts", l: "Cut-reason lines", g: c => c.cuts, f: "int" },
  { k: "rev", l: "Invoiced revenue", g: c => c.revenue, f: "money" },
  { k: "dcclose", l: "DC closing (cs)", g: c => c.dcClose, f: "int", sec: "Walmart DC" },
  { k: "dcdoh", l: "DC DOH (fwd)", placeholder: true, g: c => c.dcDoh, f: "d1", flag: c => (c.dcDoh > 0 && c.dcDoh < 7 ? "bad" : null) },
  { k: "dotused", l: "DOT closing — used (cs)", placeholder: true, g: c => c.dotUsed, f: "int", sec: "DOT" },
  // Consignment Sales History weeks are every shipment; Order History weeks
  // (before Aug 2026) are cut orders only — italic, with the reason on hover.
  { k: "dotdlv", l: "DOT shipped to Walmart (cs)", g: c => c.dotDelivered, f: "int", partial: c => c.dotSrc === "order_history",
    hint: "DOT Consignment Sales History: cases received against each Walmart PO, by ship week. Italic weeks predate it and come from DOT Order History, which lists only orders that had a cut." },
  { k: "dotcut", l: "DOT cut (cs)", g: c => c.dotCut, f: "int", partial: c => c.dotSrc === "order_history",
    flag: c => (c.dotCut > 0 && c.dotDelivered != null && c.dotCut / (c.dotCut + c.dotDelivered) > 0.1 ? "bad" : c.dotCut > 0 ? "warn" : null),
    hint: "Ordered − received per Walmart PO × SKU. A PO DOT re-placed and later shipped counts as filled, not cut." },
  // A measured reading (DOT Inventory Snapshot, good cases), not a model — so
  // no placeholder flag. Blank in weeks without an upload.
  { k: "dotact", l: "DOT actual OH (feed)", g: c => c.dotActual, f: "int" },
  { k: "dotdoh", l: "DOT DOH (fwd)", placeholder: true, g: c => c.dotDoh, f: "d1",
    flag: c => (c.dotDoh > 0 && c.dotDoh < 7 ? "bad" : c.dotDoh > 28 ? "warn" : null) },
  { k: "rec", l: "Rec production (cs)", placeholder: true, g: c => c.rec, f: "int", sec: "Co-bakery" },
  { k: "plan", l: "Planned output (cs)", placeholder: true, g: c => c.plan, f: "int" },
  { k: "act", l: "Actual shipped to DOT", g: c => c.actual, f: "int", edit: "actual" },
  { k: "pal", l: "Pallets", placeholder: true, g: c => c.pallets, f: "d1" },
];

function Tracker({ series, onEdit }) {
  const [open, setOpen] = useState({ WC: true, PBG: false, CCF: false });
  return (
    <div className="flex flex-col gap-5">
      {series.map(s => (
        <section key={s.sku} className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: "#E5D9DE" }}>
          <button onClick={() => setOpen(o => ({ ...o, [s.sku]: !o[s.sku] }))}
            className="w-full flex items-center gap-3 px-4 py-3 text-left text-white" style={{ background: "#2D2235" }}>
            <span className="text-[11px] tracking-widest uppercase font-semibold" style={{ color: "#ECAFC8" }}>{s.sku}</span>
            <span className="cc-serif">{SKU_NAMES[s.sku]}</span>
            <span className="ml-auto text-xs opacity-70">{open[s.sku] ? "collapse" : "expand"}</span>
          </button>
          {open[s.sku] && (
            <div className="overflow-x-auto cc-scroll">
              <table className="border-collapse text-[11px] cc-mono whitespace-nowrap">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white z-10" />
                    {monthBands(s.cells).map((b, bi) => (
                      <th key={bi} colSpan={b.span}
                        className="cc-sans text-[11px] font-semibold uppercase tracking-wider py-1"
                        style={{ background: QTR_TINT[b.quarter], color: "#2D2235" }}>
                        {b.month}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky left-0 bg-white z-10 text-left cc-sans font-semibold px-3 py-1.5 border-b min-w-[185px]" style={{ borderColor: "#E5D9DE" }}>Week ending →</th>
                    {s.cells.map((c, i) => (
                      <th key={c.wk} className="px-2 py-1.5 border-b font-normal text-right"
                        style={{ borderColor: "#E5D9DE",
                          borderRight: i === s.lastActualIdx ? "2px solid #C2185B" : undefined,
                          background: i > s.lastActualIdx ? "#FDF6FA" : undefined }}>
                        <div className="font-semibold" title={wkEnding(c.wk)}>{weekEndingNumeric(c.wk)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map(row => (
                    <Fragment key={row.k}>
                      {row.sec && (
                        <tr><td colSpan={s.cells.length + 1}
                          className="sticky left-0 cc-sans font-semibold text-[11px] uppercase tracking-wider px-3 py-1"
                          style={{ background: "#EFE4E9" }}>{row.sec}</td></tr>
                      )}
                      <tr>
                        <td className="sticky left-0 bg-white z-10 cc-sans px-3 py-1 border-b"
                          style={{ borderColor: "#F2EAEE", color: row.placeholder ? "#B0A3AC" : undefined }}
                          title={row.placeholder ? "Placeholder — computed from frozen production data; DOT on-hand is measured only in weeks with an Inventory Snapshot upload. Do not plan from this row." : row.hint}>
                          {row.l}
                          {row.placeholder && (
                            <span className="ml-1.5 text-[11px] uppercase tracking-wider px-1 py-0.5 rounded"
                              style={{ background: "#EFE4E9", color: "#8E1039" }}>placeholder</span>
                          )}
                        </td>
                        {s.cells.map((c, i) => {
                          // Flags are suppressed on placeholder rows: colouring a
                          // fabricated number red reads as a genuine alarm.
                          const flag = row.placeholder ? null : (row.flag ? row.flag(c) : null);
                          const future = i > s.lastActualIdx;
                          const editable = row.edit === "actual" ? true : (row.edit ? future : false);
                          return (
                            <td key={c.wk} className="px-2 py-1 text-right border-b"
                              style={{ borderColor: "#F2EAEE",
                                borderRight: i === s.lastActualIdx ? "2px solid #C2185B" : undefined,
                                background: flag === "bad" ? "#F8CBCB" : flag === "warn" ? "#FDE9C8" : future ? "#FDF6FA" : undefined,
                                color: flag === "bad" ? "#8E1039" : flag === "warn" ? "#8A5A10" : undefined,
                                fontWeight: flag === "bad" ? 600 : undefined,
                                ...(row.placeholder ? { color: "#B0A3AC", fontStyle: "italic" } : {}),
                                ...(row.partial && row.partial(c) ? { fontStyle: "italic", opacity: 0.6 } : {}) }}>
                              {editable ? (
                                <input type="number" step={row.edit === "mult" ? "0.05" : "1"}
                                  defaultValue={row.g(c) ?? ""}
                                  onBlur={e => {
                                    const raw = e.target.value.trim();
                                    onEdit(row.edit, c.wk, s.sku, raw === "" ? null : Number(raw));
                                  }}
                                  className="w-14 bg-transparent text-right cc-mono outline-none rounded px-0.5"
                                  style={{ color: "#1D4ED8" }} aria-label={row.l + ", " + wkEnding(c.wk)} />
                              ) : F[row.f](row.g(c))}
                            </td>
                          );
                        })}
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      <p className="text-xs opacity-60 max-w-3xl">
        Units vs cases: rows labeled (units) are shopper-facing feeds; everything in (cs) is cases — 1 case = 12 units (10 for Black Currant), and the Demand row converts exactly once. Pink rule = last week with POS actuals; tinted columns are forecast. Blue cells are
        editable — change a seasonality multiplier or key a consensus override and the whole
        cascade (demand, DC/DOT inventory, production recs) recomputes instantly. <b>Edits are kept for this
        session only and are lost on reload.</b> Columns are weeks, labelled by week-ending date (month/day).
      </p>
    </div>
  );
}

/* ---------------- inputs ---------------- */
/* ---------------- app ---------------- */
export default function DemandPlanner() {
  const [tab, setTab] = useState("summary");
  const [overrides, setOverrides] = useState([]);
  const [prodEdits, setProdEdits] = useState([]);

  // Live Retail Link feeds. Each series independently falls back to SEED when
  // the table is missing (pre-migration) or empty (pre-first-upload), so this
  // page behaves identically at every stage of the rollout.
  const feeds = useDemandFeeds();

  // Read straight from `feeds` (Nov 5 2026). It used to be copied into state
  // by an effect — a leftover from when the rows were pasteable — which left
  // the first render, and every server render, on SEED.
  const dotSvcRows = feeds.dotService ?? SEED.dotService ?? [];

  const input = useMemo(() => {
    // Live where we have it, SEED where we don't. Tracker overrides and
    // seasonality edits sit on top of whichever source won.
    const basePos = feeds.pos ?? SEED.pos;
    const baseFcst = feeds.forecasts ?? SEED.forecasts;
    const baseOrders = feeds.orders ?? SEED.orders;
    // SEED's weeks list is the calendar the whole page is laid out on. Live POS
    // can reach beyond it (the WK28 export carries weeks SEED never had), so
    // extend rather than replace — dropping to only the live weeks would throw
    // away the forward planning horizon the forecast needs.
    const weeks = [...new Set([
      ...SEED.weeks.map(w => w.wk),
      ...basePos.map(p => p.wk),
    ])].sort((a, b) => a - b);
    return {
      weeks,
      pos: basePos,
      orders: baseOrders,
      forecasts: baseFcst,
      production: [...SEED.production.filter(p => !prodEdits.some(e => e.wk === p.wk && e.sku === p.sku)),
        ...prodEdits.filter(e => e.cases != null)],
      // DOT ON-HAND (dot_on_hand, from the DOT Inventory Snapshot upload) — a
      // different feed from the DOT Order History that drives cut recovery. No
      // SEED fallback: before the first upload this is empty and the engine
      // opens the cascade from params.dotOpeningAnchor, as it always has.
      dot: feeds.dotOnHand ?? [],
      // Shown in the Tracker, but NOT used by the cascade — the export is
      // exception-filtered, so it is not the total outbound leg. See the note
      // at c.dotOut below.
      dotDeliveries: feeds.dotDeliveries ?? [],
      overrides,
      params: SEED.params,
    };
  }, [overrides, prodEdits, feeds.pos, feeds.forecasts, feeds.orders, feeds.dotDeliveries, feeds.dotOnHand]);

  // The newest DOT on-hand reading, for the freshness strip. snapshotDate is a bare date:
  // build it at UTC noon so no timezone moves it a day.
  const dotReading = useMemo(() => {
    const rows = feeds.dotOnHand ?? [];
    if (!rows.length) return null;
    const last = rows.reduce((a, r) => (r.wk > a.wk || (r.wk === a.wk && r.snapshotDate > a.snapshotDate) ? r : a));
    const d = new Date(`${last.snapshotDate}T12:00:00Z`);
    return { wk: last.wk, label: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) };
  }, [feeds.dotOnHand]);
  const series = useMemo(() => ["WC", "PBG", "CCF", "BC"].map(s => buildSkuSeries(input, s)), [input]);
  const metrics = useMemo(() => series.map(s => sopSummary(s, packOf(s.sku).casesPerPallet)), [series]);

  // Newest week that actually has POS — the yardstick every other feed's
  // freshness is measured against. MUST stay below `series`: reading it above
  // throws "Cannot access 'series' before initialization" on every render, which
  // blanks the whole page. `const` is hoisted but not initialised, so this
  // compiles, bundles and passes a string-grep of the artifact — it only fails
  // when the component actually runs.
  const latestDataWk = Math.max(0, ...series.flatMap(s => s.cells.filter(c => c.pos != null).map(c => c.wk)));
  const svc = useMemo(() => {
    const nsByWk = new Map();
    // Same source as the engine's `orders` series — reading SEED here while the
    // engine read live data would make "invisible in NetSuite" compare two
    // different order books.
    for (const o of (feeds.orders ?? SEED.orders)) {
      const a = nsByWk.get(o.wk) || { req: 0, dlv: 0 };
      a.req += o.req; a.dlv += o.dlv; nsByWk.set(o.wk, a);
    }
    const rows = [...dotSvcRows].sort((a, b) => a.wk - b.wk).map(r => {
      const ns = nsByWk.get(r.wk) || { req: 0, dlv: 0 };
      const trueOrdered = ns.req + r.cut;
      return { ...r, nsReq: ns.req, nsDlv: ns.dlv, trueOrdered,
        trueFill: trueOrdered > 0 ? ns.dlv / trueOrdered : null };
    });
    const ordered = rows.reduce((a, r) => a + r.ordered, 0);
    const cut = rows.reduce((a, r) => a + r.cut, 0);
    const trueBook = rows.reduce((a, r) => a + r.trueOrdered, 0);
    const dlv = rows.reduce((a, r) => a + r.nsDlv, 0);
    return { rows, ordered, cut, recovered: cut, trueFill: trueBook > 0 ? dlv / trueBook : null };
  }, [dotSvcRows, feeds.orders]);

  // ── Data freshness strip: one tile per feed. Below `series`/`latestDataWk`
  // for the TDZ reason above. Each feed reports its newest week WITH DATA.
  const todayWk = walmartWeekOf(todayIso());
  const freshness = (() => {
    const src = feeds.sources ?? {};
    const maxWk = (rows, pick = () => true) => {
      const w = (rows ?? []).filter(pick).map(r => r.wk);
      return w.length ? Math.max(...w) : null;
    };
    const fcstRows = feeds.forecasts ?? SEED.forecasts;
    const fcstSnap = fcstRows.length ? Math.max(...fcstRows.map(f => f.snap)) : null;
    const item = (label, wk, live, extra = {}) => ({
      label, date: weekEndingSunday(wk), prefix: "wk ending", status: freshnessOf({ wk, live, todayWk }), ...extra,
    });
    return [
      item("Retail Link POS", feeds.asOf ?? (latestDataWk || null), src.pos === "live"),
      item("Walmart forecast", fcstSnap, src.forecasts === "live", { prefix: "pulled wk ending" }),
      item("OTIF", maxWk(feeds.otif, r => r.otif != null), src.otif === "live"),
      // Orders carry future SCHEDULED weeks, so freshness is the newest week
      // with deliveries, not the newest week in the table.
      item("NetSuite deliveries", maxWk(feeds.orders ?? SEED.orders, r => r.dlv > 0), src.orders === "live"),
      dotReading
        ? { label: "DOT on-hand", prefix: "snapshot", date: dotReading.label,
            status: freshnessOf({ wk: dotReading.wk, live: true, todayWk }) }
        : { label: "DOT on-hand", date: null, status: { tone: "bad", text: "no snapshot uploaded" } },
      src.consignment === "live"
        ? item("DOT shipments & cuts", maxWk(feeds.consignment), true,
            { prefix: "shipped wk ending", title: "DOT Consignment Sales History — every shipment to Walmart, by item. Drives cut recovery." })
        : item("DOT shipments & cuts", maxWk(dotSvcRows), src.dotService === "live",
            { title: "DOT Order History (cut orders only) — upload the Consignment Sales History for every shipment" }),
      { label: "Production", prefix: "frozen", date: new Date(`${SEED.asOf}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
        status: PRODUCTION_LIVE ? { tone: "ok", text: "live" } : { tone: "bad", text: "not live · no feed yet" },
        title: "Production is still the " + SEED.asOf + " seed — every supply-side figure built on it is a placeholder" },
    ];
  })();

  const onEdit = (kind, wk, sku, v) => {
    if (kind === "actual") {
      setProdEdits(p => [...p.filter(e => !(e.wk === wk && e.sku === sku)), { wk, sku, cases: v }]);
    } else {
      setOverrides(o => {
        const prev = o.find(e => e.wk === wk && e.sku === sku) || { wk, sku };
        const next = kind === "mult" ? { ...prev, mult: v ?? 1 } : { ...prev, override: v };
        return [...o.filter(e => !(e.wk === wk && e.sku === sku)), next];
      });
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "#FAF5F2", color: "#2D2235" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .cc-serif { font-family: 'Fraunces', Georgia, serif; }
        .cc-sans, body { font-family: 'Inter', system-ui, sans-serif; }
        .cc-mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
        .cc-scroll::-webkit-scrollbar { height: 8px; }
        .cc-scroll::-webkit-scrollbar-thumb { background: #DACBD2; border-radius: 4px; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
        button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid #C2185B; outline-offset: 2px; }
      `}</style>
      {/* Header (Nov 5 2026): title, today, and the ONE place on the page that
          names the Walmart week — every other label is a calendar date. The
          pack chip (1 cs = 12 units…) was removed; the pack lives in the chart
          legend, the Tracker note and the case-pack caveat. */}
      <header className="border-b px-6 pt-4 pb-3 flex flex-wrap items-end gap-x-6 gap-y-3"
        style={{ borderColor: "#E5D9DE", background: "rgba(255,255,255,0.75)" }}>
        <div>
          <div className="text-[11px] tracking-widest uppercase font-semibold" style={{ color: "#C2185B" }}>
            Cookie Central
          </div>
          <h1 className="cc-serif text-2xl leading-tight">Walmart Demand Planner</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] cc-sans">
            <span><span className="opacity-60">Today</span> <b>{todayLong()}</b></span>
            {todayWk && (
              <>
                <span aria-hidden="true" className="opacity-25">|</span>
                <span className="px-2.5 py-0.5 rounded-full font-semibold" style={{ background: "#D9EFE4", color: "#245B33" }}>
                  Walmart week {Number(String(todayWk).slice(4))}
                </span>
                <span className="opacity-60">{wkEnding(todayWk)}</span>
              </>
            )}
          </div>
        </div>
        <nav className="ml-auto flex gap-1 cc-sans" aria-label="Views">
          {["summary", "tracker", "sources"].map(t => (
            <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
              className="px-4 py-2 rounded-full text-sm capitalize"
              style={tab === t ? { background: "#2D2235", color: "#fff" } : {}}>
              {t === "summary" ? "S&OP summary" : t}
            </button>
          ))}
        </nav>
      </header>
      {/* `asOf` and every other date here is the newest week WITH DATA, not the
          time of the fetch: this page is only as current as the last file
          someone uploaded. */}
      <DataFreshness items={freshness} />
      <main className="p-5 cc-sans">
        {tab === "summary" && (
          <>
            <UnmappedItemsNotice items={feeds.unmappedOrderItems} />
            <div className="flex flex-col gap-2 mb-4">
              <PlaceholderNotice />
              <PackChangeNotice />
            </div>
            <ActionPanel series={series} metrics={metrics} feeds={feeds} />
            <div className="mt-4" />
            <ServiceHealth series={series} otif={feeds.otif} />
            <div className="mt-4" />
            <Summary series={series} metrics={metrics} feeds={feeds} />
            <DotServicePanel svc={svc} latestDataWk={latestDataWk} consignment={feeds.consignment} />
          </>
        )}
        {tab === "tracker" && <Tracker series={series} onEdit={onEdit} />}
        {tab === "sources" && <Sources feeds={feeds} series={series} />}
      </main>
    </div>
  );
}
