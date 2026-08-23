import { useMemo, useState, Fragment } from "react";
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from "recharts";

/* Cookie Central — Walmart Demand Planner
   Ported in from the standalone preview artifact, ENGINE AND DATA UNCHANGED.
   The formulas are specified in `demand-planner-formulas.md` and were
   cross-validated against the Excel workbook on 23 checks; don't "tidy" the
   engine without re-running that comparison.

   ⚠️ The dataset is the embedded `SEED` constant, frozen at SEED.asOf
   (2026-08-13). Nothing here reads Supabase yet, and the feeds it would need
   have no home in the schema: there is no POS / Retail Link / forecast table,
   and `dot_inventory` is empty. Edits, pastes and overrides live in component
   state for the session and are lost on reload — by design for now, but it is
   why the page carries an "as of" banner rather than presenting itself as live.

   Wiring this to Supabase means new tables (weekly POS by SKU, forecast
   snapshots, DOT service) plus an ingest path for the Retail Link pull, and
   mapping the `orders` series onto purchase_orders / po_line_items. That is a
   separate project. */

const SEED = {"weeks":[{"wk":202605,"start":"2026-02-28"},{"wk":202606,"start":"2026-03-07"},{"wk":202607,"start":"2026-03-14"},{"wk":202608,"start":"2026-03-21"},{"wk":202609,"start":"2026-03-28"},{"wk":202610,"start":"2026-04-04"},{"wk":202611,"start":"2026-04-11"},{"wk":202612,"start":"2026-04-18"},{"wk":202613,"start":"2026-04-25"},{"wk":202614,"start":"2026-05-02"},{"wk":202615,"start":"2026-05-09"},{"wk":202616,"start":"2026-05-16"},{"wk":202617,"start":"2026-05-23"},{"wk":202618,"start":"2026-05-30"},{"wk":202619,"start":"2026-06-06"},{"wk":202620,"start":"2026-06-13"},{"wk":202621,"start":"2026-06-20"},{"wk":202622,"start":"2026-06-27"},{"wk":202623,"start":"2026-07-04"},{"wk":202624,"start":"2026-07-11"},{"wk":202625,"start":"2026-07-18"},{"wk":202626,"start":"2026-07-25"},{"wk":202627,"start":"2026-08-01"},{"wk":202628,"start":"2026-08-08"},{"wk":202629,"start":"2026-08-15"},{"wk":202630,"start":"2026-08-22"},{"wk":202631,"start":"2026-08-29"},{"wk":202632,"start":"2026-09-05"},{"wk":202633,"start":"2026-09-12"},{"wk":202634,"start":"2026-09-19"},{"wk":202635,"start":"2026-09-26"},{"wk":202636,"start":"2026-10-03"},{"wk":202637,"start":"2026-10-10"},{"wk":202638,"start":"2026-10-17"},{"wk":202639,"start":"2026-10-24"},{"wk":202640,"start":"2026-10-31"},{"wk":202641,"start":"2026-11-07"},{"wk":202642,"start":"2026-11-14"},{"wk":202643,"start":"2026-11-21"},{"wk":202644,"start":"2026-11-28"},{"wk":202645,"start":"2026-12-05"},{"wk":202646,"start":"2026-12-12"},{"wk":202647,"start":"2026-12-19"},{"wk":202648,"start":"2026-12-26"},{"wk":202649,"start":"2027-01-02"},{"wk":202650,"start":"2027-01-09"},{"wk":202651,"start":"2027-01-16"},{"wk":202652,"start":"2027-01-23"}],"pos":[{"wk":202543,"sku":"PBG","units":0,"dollars":0.0,"storesSelling":0,"traited":2,"instock":0.0,"oh":0},{"wk":202601,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202602,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202603,"sku":"PBG","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202603,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":3,"instock":0.0,"oh":0},{"wk":202604,"sku":"CCF","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202604,"sku":"PBG","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202604,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":3,"instock":0.0,"oh":0},{"wk":202605,"sku":"PBG","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202605,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":3,"instock":0.0,"oh":0},{"wk":202606,"sku":"PBG","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202606,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":3,"instock":0.0,"oh":0},{"wk":202607,"sku":"PBG","units":0,"dollars":0.0,"storesSelling":0,"traited":2,"instock":0.0,"oh":0},{"wk":202607,"sku":"WC","units":0,"dollars":0.0,"storesSelling":0,"traited":3,"instock":0.0,"oh":0},{"wk":202608,"sku":"PBG","units":98,"dollars":478.48,"storesSelling":83,"traited":2787,"instock":0.9307,"oh":17488},{"wk":202608,"sku":"WC","units":205,"dollars":1003.62,"storesSelling":153,"traited":2787,"instock":0.9232,"oh":17553},{"wk":202609,"sku":"PBG","units":1772,"dollars":8645.0,"storesSelling":919,"traited":2789,"instock":0.943,"oh":33252},{"wk":202609,"sku":"WC","units":3104,"dollars":15168.16,"storesSelling":1188,"traited":2787,"instock":0.9354,"oh":32813},{"wk":202610,"sku":"PBG","units":3331,"dollars":16275.84,"storesSelling":1523,"traited":2791,"instock":0.9678,"oh":32548},{"wk":202610,"sku":"WC","units":6479,"dollars":31660.01,"storesSelling":1935,"traited":2790,"instock":0.9667,"oh":31511},{"wk":202611,"sku":"PBG","units":3462,"dollars":16824.19,"storesSelling":1651,"traited":2795,"instock":0.985,"oh":33723},{"wk":202611,"sku":"WC","units":6829,"dollars":33267.25,"storesSelling":2169,"traited":2792,"instock":0.9853,"oh":33208},{"wk":202612,"sku":"CCF","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202612,"sku":"PBG","units":3575,"dollars":17389.4,"storesSelling":1716,"traited":2799,"instock":0.985,"oh":33998},{"wk":202612,"sku":"WC","units":7359,"dollars":35868.88,"storesSelling":2288,"traited":2793,"instock":0.9871,"oh":33301},{"wk":202613,"sku":"PBG","units":3256,"dollars":15903.02,"storesSelling":1663,"traited":2802,"instock":0.9839,"oh":31779},{"wk":202613,"sku":"WC","units":6734,"dollars":32902.04,"storesSelling":2288,"traited":2796,"instock":0.9857,"oh":29834},{"wk":202614,"sku":"PBG","units":3172,"dollars":15451.39,"storesSelling":1654,"traited":2802,"instock":0.985,"oh":29814},{"wk":202614,"sku":"WC","units":6603,"dollars":32265.24,"storesSelling":2256,"traited":2797,"instock":0.9868,"oh":27820},{"wk":202615,"sku":"PBG","units":2795,"dollars":13622.27,"storesSelling":1542,"traited":2802,"instock":0.9847,"oh":28231},{"wk":202615,"sku":"WC","units":5980,"dollars":29174.67,"storesSelling":2209,"traited":2797,"instock":0.9864,"oh":27042},{"wk":202616,"sku":"PBG","units":2750,"dollars":13443.54,"storesSelling":1554,"traited":2803,"instock":0.985,"oh":26954},{"wk":202616,"sku":"WC","units":5985,"dollars":29251.19,"storesSelling":2179,"traited":2799,"instock":0.9857,"oh":26889},{"wk":202617,"sku":"CCF","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202617,"sku":"PBG","units":2600,"dollars":12617.78,"storesSelling":1503,"traited":2806,"instock":0.9825,"oh":25921},{"wk":202617,"sku":"WC","units":5833,"dollars":28392.03,"storesSelling":2172,"traited":2801,"instock":0.9839,"oh":26567},{"wk":202618,"sku":"CCF","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202618,"sku":"PBG","units":2745,"dollars":13230.85,"storesSelling":1520,"traited":2806,"instock":0.9808,"oh":24417},{"wk":202618,"sku":"WC","units":6123,"dollars":29643.58,"storesSelling":2233,"traited":2804,"instock":0.9811,"oh":25608},{"wk":202619,"sku":"CCF","units":0,"dollars":0.0,"storesSelling":0,"traited":1,"instock":0.0,"oh":0},{"wk":202619,"sku":"PBG","units":2373,"dollars":11540.36,"storesSelling":1379,"traited":2817,"instock":0.9567,"oh":22066},{"wk":202619,"sku":"WC","units":5402,"dollars":26340.2,"storesSelling":2109,"traited":2805,"instock":0.969,"oh":23396},{"wk":202620,"sku":"CCF","units":0,"dollars":0.0,"storesSelling":0,"traited":10,"instock":0.1,"oh":9},{"wk":202620,"sku":"PBG","units":2731,"dollars":10841.44,"storesSelling":1423,"traited":2817,"instock":0.9258,"oh":20048},{"wk":202620,"sku":"WC","units":5928,"dollars":25571.15,"storesSelling":2060,"traited":2807,"instock":0.964,"oh":22127},{"wk":202621,"sku":"CCF","units":216,"dollars":1041.78,"storesSelling":172,"traited":3043,"instock":0.8505,"oh":15911},{"wk":202621,"sku":"PBG","units":3137,"dollars":9419.66,"storesSelling":1374,"traited":2922,"instock":0.6502,"oh":19253},{"wk":202621,"sku":"WC","units":6498,"dollars":23283.78,"storesSelling":2059,"traited":3308,"instock":0.718,"oh":23379},{"wk":202622,"sku":"CCF","units":2471,"dollars":12052.87,"storesSelling":1225,"traited":3045,"instock":0.908,"oh":36701},{"wk":202622,"sku":"PBG","units":1322,"dollars":6463.56,"storesSelling":823,"traited":2923,"instock":0.6124,"oh":16775},{"wk":202622,"sku":"WC","units":4035,"dollars":19713.8,"storesSelling":1616,"traited":3311,"instock":0.6853,"oh":20527},{"wk":202623,"sku":"CCF","units":3742,"dollars":18299.71,"storesSelling":1745,"traited":3047,"instock":0.9196,"oh":38605},{"wk":202623,"sku":"PBG","units":1076,"dollars":5264.68,"storesSelling":735,"traited":2924,"instock":0.5889,"oh":14304},{"wk":202623,"sku":"WC","units":3199,"dollars":15642.29,"storesSelling":1460,"traited":3311,"instock":0.6705,"oh":16958},{"wk":202624,"sku":"CCF","units":4197,"dollars":20531.86,"storesSelling":1957,"traited":3049,"instock":0.9436,"oh":35495},{"wk":202624,"sku":"PBG","units":1333,"dollars":6504.95,"storesSelling":832,"traited":2925,"instock":0.6277,"oh":16700},{"wk":202624,"sku":"WC","units":4146,"dollars":20228.8,"storesSelling":1743,"traited":3313,"instock":0.7371,"oh":21216},{"wk":202625,"sku":"CCF","units":4350,"dollars":21265.47,"storesSelling":2006,"traited":3053,"instock":0.9473,"oh":33100},{"wk":202625,"sku":"PBG","units":1288,"dollars":6293.12,"storesSelling":819,"traited":2929,"instock":0.6234,"oh":16158},{"wk":202625,"sku":"WC","units":4360,"dollars":21254.49,"storesSelling":1801,"traited":3316,"instock":0.7223,"oh":20798},{"wk":202626,"sku":"CCF","units":4140,"dollars":20242.08,"storesSelling":1979,"traited":3056,"instock":0.9705,"oh":33195},{"wk":202626,"sku":"PBG","units":1266,"dollars":6188.28,"storesSelling":826,"traited":2928,"instock":0.6861,"oh":17665},{"wk":202626,"sku":"WC","units":4051,"dollars":19759.05,"storesSelling":1769,"traited":3319,"instock":0.7752,"oh":21667},{"wk":202627,"sku":"CCF","units":4362,"dollars":21311.61,"storesSelling":2068,"traited":3066,"instock":0.9759,"oh":32673},{"wk":202627,"sku":"PBG","units":1482,"dollars":7167.1,"storesSelling":924,"traited":2934,"instock":0.6936,"oh":20104},{"wk":202627,"sku":"WC","units":4975,"dollars":24206.8,"storesSelling":2001,"traited":3324,"instock":0.7906,"oh":24721}],"orders":[{"wk":202607,"sku":"PBG","req":3087,"dlv":2667,"rev":98572.32,"cuts":0},{"wk":202607,"sku":"WC","req":3087,"dlv":2667,"rev":98572.32,"cuts":0},{"wk":202608,"sku":"PBG","req":2581,"dlv":3001,"rev":110916.96,"cuts":0},{"wk":202608,"sku":"WC","req":2540,"dlv":2960,"rev":109401.6,"cuts":0},{"wk":202609,"sku":"PBG","req":968,"dlv":23,"rev":850.08,"cuts":0},{"wk":202609,"sku":"WC","req":945,"dlv":21,"rev":776.16,"cuts":0},{"wk":202610,"sku":"PBG","req":924,"dlv":1785,"rev":65973.6,"cuts":0},{"wk":202610,"sku":"WC","req":1029,"dlv":1890,"rev":69854.4,"cuts":0},{"wk":202611,"sku":"PBG","req":546,"dlv":630,"rev":23284.8,"cuts":0},{"wk":202611,"sku":"WC","req":630,"dlv":693,"rev":25613.28,"cuts":0},{"wk":202612,"sku":"PBG","req":378,"dlv":378,"rev":13970.88,"cuts":0},{"wk":202612,"sku":"WC","req":756,"dlv":735,"rev":27165.6,"cuts":0},{"wk":202613,"sku":"PBG","req":651,"dlv":651,"rev":24060.96,"cuts":0},{"wk":202613,"sku":"WC","req":1071,"dlv":1092,"rev":40360.32,"cuts":0},{"wk":202618,"sku":"PBG","req":84,"dlv":84,"rev":3104.64,"cuts":0},{"wk":202618,"sku":"WC","req":84,"dlv":84,"rev":3104.64,"cuts":0},{"wk":202619,"sku":"CCF","req":588,"dlv":588,"rev":21732.48,"cuts":0},{"wk":202619,"sku":"PBG","req":21,"dlv":0,"rev":0.0,"cuts":7},{"wk":202619,"sku":"WC","req":331,"dlv":268,"rev":9905.28,"cuts":0},{"wk":202620,"sku":"CCF","req":2667,"dlv":2583,"rev":95467.68,"cuts":1},{"wk":202620,"sku":"PBG","req":273,"dlv":252,"rev":9313.92,"cuts":8},{"wk":202620,"sku":"WC","req":1172,"dlv":1214,"rev":44869.44,"cuts":2},{"wk":202621,"sku":"CCF","req":2037,"dlv":2121,"rev":78392.16,"cuts":0},{"wk":202621,"sku":"PBG","req":270,"dlv":312,"rev":11531.52,"cuts":0},{"wk":202621,"sku":"WC","req":3,"dlv":24,"rev":887.04,"cuts":12},{"wk":202622,"sku":"CCF","req":266,"dlv":639,"rev":23617.44,"cuts":13},{"wk":202622,"sku":"PBG","req":0,"dlv":83,"rev":3067.68,"cuts":1},{"wk":202622,"sku":"WC","req":0,"dlv":231,"rev":8537.76,"cuts":1},{"wk":202623,"sku":"CCF","req":1197,"dlv":772,"rev":28533.12,"cuts":35},{"wk":202623,"sku":"PBG","req":565,"dlv":295,"rev":10903.2,"cuts":27},{"wk":202623,"sku":"WC","req":1197,"dlv":756,"rev":27941.76,"cuts":25},{"wk":202624,"sku":"CCF","req":206,"dlv":258,"rev":9535.68,"cuts":21},{"wk":202624,"sku":"PBG","req":85,"dlv":272,"rev":10053.12,"cuts":16},{"wk":202624,"sku":"WC","req":699,"dlv":909,"rev":33596.64,"cuts":22},{"wk":202625,"sku":"CCF","req":231,"dlv":231,"rev":8537.76,"cuts":0},{"wk":202625,"sku":"PBG","req":357,"dlv":357,"rev":13194.72,"cuts":0},{"wk":202625,"sku":"WC","req":294,"dlv":294,"rev":10866.24,"cuts":0},{"wk":202626,"sku":"CCF","req":609,"dlv":609,"rev":22508.64,"cuts":1},{"wk":202626,"sku":"PBG","req":924,"dlv":924,"rev":34151.04,"cuts":0},{"wk":202626,"sku":"WC","req":1176,"dlv":1176,"rev":43464.96,"cuts":0},{"wk":202627,"sku":"CCF","req":336,"dlv":336,"rev":12418.56,"cuts":1},{"wk":202627,"sku":"PBG","req":147,"dlv":147,"rev":5433.12,"cuts":0},{"wk":202627,"sku":"WC","req":630,"dlv":630,"rev":23284.8,"cuts":1},{"wk":202628,"sku":"CCF","req":231,"dlv":126,"rev":4656.96,"cuts":0},{"wk":202628,"sku":"PBG","req":294,"dlv":189,"rev":6985.44,"cuts":0},{"wk":202628,"sku":"WC","req":168,"dlv":126,"rev":4656.96,"cuts":0},{"wk":202629,"sku":"CCF","req":231,"dlv":0,"rev":0.0,"cuts":0},{"wk":202629,"sku":"PBG","req":147,"dlv":0,"rev":0.0,"cuts":0},{"wk":202629,"sku":"WC","req":483,"dlv":0,"rev":0.0,"cuts":0}],"forecasts":[{"snap":202628,"target":202638,"sku":"CCF","units":6713.7,"source":"store"},{"snap":202628,"target":202629,"sku":"CCF","units":5375.9,"source":"store"},{"snap":202628,"target":202639,"sku":"WC","units":7890.9,"source":"store"},{"snap":202628,"target":202631,"sku":"PBG","units":4047.7,"source":"store"},{"snap":202628,"target":202638,"sku":"PBG","units":5044.8,"source":"store"},{"snap":202628,"target":202633,"sku":"PBG","units":4532.2,"source":"store"},{"snap":202628,"target":202634,"sku":"PBG","units":4718.5,"source":"store"},{"snap":202628,"target":202630,"sku":"PBG","units":3086.5,"source":"store"},{"snap":202628,"target":202641,"sku":"CCF","units":6622.5,"source":"store"},{"snap":202628,"target":202634,"sku":"CCF","units":5579.3,"source":"store"},{"snap":202628,"target":202639,"sku":"CCF","units":6747.9,"source":"store"},{"snap":202628,"target":202637,"sku":"PBG","units":5162.4,"source":"store"},{"snap":202628,"target":202636,"sku":"WC","units":7920.1,"source":"store"},{"snap":202628,"target":202637,"sku":"CCF","units":6510.7,"source":"store"},{"snap":202628,"target":202629,"sku":"WC","units":5904.9,"source":"store"},{"snap":202628,"target":202639,"sku":"PBG","units":4827.3,"source":"store"},{"snap":202628,"target":202636,"sku":"PBG","units":5303.8,"source":"store"},{"snap":202628,"target":202633,"sku":"CCF","units":5668.2,"source":"store"},{"snap":202628,"target":202632,"sku":"PBG","units":4451.6,"source":"store"},{"snap":202628,"target":202630,"sku":"CCF","units":5401.4,"source":"store"},{"snap":202628,"target":202640,"sku":"CCF","units":6042.4,"source":"store"},{"snap":202628,"target":202631,"sku":"WC","units":6667.6,"source":"store"},{"snap":202628,"target":202633,"sku":"WC","units":6759.2,"source":"store"},{"snap":202628,"target":202641,"sku":"WC","units":6774.9,"source":"store"},{"snap":202628,"target":202638,"sku":"WC","units":7980.1,"source":"store"},{"snap":202628,"target":202635,"sku":"CCF","units":5860.8,"source":"store"},{"snap":202628,"target":202640,"sku":"WC","units":6855.4,"source":"store"},{"snap":202628,"target":202637,"sku":"WC","units":7938.3,"source":"store"},{"snap":202628,"target":202635,"sku":"PBG","units":4967.8,"source":"store"},{"snap":202628,"target":202636,"sku":"CCF","units":6460.6,"source":"store"},{"snap":202628,"target":202640,"sku":"PBG","units":4058.3,"source":"store"},{"snap":202628,"target":202632,"sku":"WC","units":6688.0,"source":"store"},{"snap":202628,"target":202630,"sku":"WC","units":5778.9,"source":"store"},{"snap":202628,"target":202632,"sku":"CCF","units":5864.6,"source":"store"},{"snap":202628,"target":202635,"sku":"WC","units":7200.2,"source":"store"},{"snap":202628,"target":202641,"sku":"PBG","units":3733.9,"source":"store"},{"snap":202628,"target":202634,"sku":"WC","units":6924.3,"source":"store"},{"snap":202628,"target":202629,"sku":"PBG","units":3139.4,"source":"store"},{"snap":202628,"target":202631,"sku":"CCF","units":5424.8,"source":"store"}],"production":[{"wk":202605,"sku":"WC","cases":3780},{"wk":202606,"sku":"WC","cases":2268},{"wk":202607,"sku":"WC","cases":0},{"wk":202608,"sku":"WC","cases":3024},{"wk":202609,"sku":"WC","cases":756},{"wk":202610,"sku":"WC","cases":756},{"wk":202611,"sku":"WC","cases":756},{"wk":202612,"sku":"WC","cases":0},{"wk":202613,"sku":"WC","cases":0},{"wk":202614,"sku":"WC","cases":0},{"wk":202615,"sku":"WC","cases":0},{"wk":202616,"sku":"WC","cases":0},{"wk":202617,"sku":"WC","cases":756},{"wk":202618,"sku":"WC","cases":756},{"wk":202619,"sku":"WC","cases":0},{"wk":202620,"sku":"WC","cases":0},{"wk":202621,"sku":"WC","cases":756},{"wk":202622,"sku":"WC","cases":756},{"wk":202623,"sku":"WC","cases":0},{"wk":202624,"sku":"WC","cases":1512},{"wk":202625,"sku":"WC","cases":0},{"wk":202626,"sku":"WC","cases":0},{"wk":202605,"sku":"PBG","cases":3780},{"wk":202606,"sku":"PBG","cases":2268},{"wk":202607,"sku":"PBG","cases":0},{"wk":202608,"sku":"PBG","cases":2268},{"wk":202609,"sku":"PBG","cases":756},{"wk":202610,"sku":"PBG","cases":0},{"wk":202611,"sku":"PBG","cases":756},{"wk":202612,"sku":"PBG","cases":0},{"wk":202613,"sku":"PBG","cases":0},{"wk":202614,"sku":"PBG","cases":0},{"wk":202615,"sku":"PBG","cases":0},{"wk":202616,"sku":"PBG","cases":0},{"wk":202617,"sku":"PBG","cases":0},{"wk":202618,"sku":"PBG","cases":0},{"wk":202619,"sku":"PBG","cases":756},{"wk":202620,"sku":"PBG","cases":0},{"wk":202621,"sku":"PBG","cases":0},{"wk":202622,"sku":"PBG","cases":0},{"wk":202623,"sku":"PBG","cases":0},{"wk":202624,"sku":"PBG","cases":1512},{"wk":202625,"sku":"PBG","cases":0},{"wk":202626,"sku":"PBG","cases":0},{"wk":202605,"sku":"CCF","cases":1512},{"wk":202606,"sku":"CCF","cases":756},{"wk":202607,"sku":"CCF","cases":756},{"wk":202608,"sku":"CCF","cases":756},{"wk":202609,"sku":"CCF","cases":0},{"wk":202610,"sku":"CCF","cases":756},{"wk":202611,"sku":"CCF","cases":756},{"wk":202612,"sku":"CCF","cases":0},{"wk":202613,"sku":"CCF","cases":756},{"wk":202614,"sku":"CCF","cases":756},{"wk":202615,"sku":"CCF","cases":756},{"wk":202616,"sku":"CCF","cases":0},{"wk":202617,"sku":"CCF","cases":1512},{"wk":202618,"sku":"CCF","cases":2268},{"wk":202619,"sku":"CCF","cases":756},{"wk":202620,"sku":"CCF","cases":756},{"wk":202621,"sku":"CCF","cases":1512},{"wk":202622,"sku":"CCF","cases":0},{"wk":202623,"sku":"CCF","cases":0},{"wk":202624,"sku":"CCF","cases":0},{"wk":202625,"sku":"CCF","cases":0},{"wk":202626,"sku":"CCF","cases":0}],"dot":[],"params":{"unitsPerCase":12,"dcDohTarget":7,"dotDohTarget":14,"moq":756,"casesPerPallet":189,"gapThreshold":0.15,"l4wWindow":4,"defaultStores":2200,"dotOpeningAnchor":250,"overstockDoh":28},"asOf":"2026-08-13","dotService":[{"wk":202620,"ordered":252,"cut":208,"pos":2},{"wk":202621,"ordered":798,"cut":630,"pos":23},{"wk":202622,"ordered":5334,"cut":5283,"pos":84},{"wk":202623,"ordered":3906,"cut":2587,"pos":63},{"wk":202624,"ordered":2373,"cut":2006,"pos":47},{"wk":202625,"ordered":84,"cut":42,"pos":2}]};

/* ---------------- engine ---------------- */
// Plain-JS mirror of demandEngine.ts — used by the preview artifact and for validation.
const DEFAULT_PARAMS = {
  unitsPerCase: 12, dcDohTarget: 7, dotDohTarget: 14, moq: 756, casesPerPallet: 189,
  gapThreshold: 0.15, l4wWindow: 4, defaultStores: 2200, dotOpeningAnchor: 250,
  overstockDoh: 28,
};
const ceilTo = (v, moq) => (v <= 0 ? 0 : Math.ceil(v / moq) * moq);

function buildSkuSeries(input, sku) {
  const P = { ...DEFAULT_PARAMS, ...(input.params || {}) };
  const weeks = input.weeks;
  const N = weeks.length;
  const posMap = new Map(input.pos.filter(r => r.sku === sku).map(r => [r.wk, r]));
  const ordMap = new Map(input.orders.filter(r => r.sku === sku).map(r => [r.wk, r]));
  const prodMap = new Map(input.production.filter(r => r.sku === sku).map(r => [r.wk, r.cases]));
  const dotMap = new Map(input.dot.filter(r => r.sku === sku).map(r => [r.wk, r.cases]));
  const ovrMap = new Map((input.overrides || []).filter(r => r.sku === sku).map(r => [r.wk, r]));

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




/* ---------------- parsers (paste-and-go) ---------------- */
const WM_ITEM_TO_SKU = { "679640563": "WC", "679640564": "PBG", "683581675": "CCF" };
const splitTsv = t => t.replace(/\r/g, "").split("\n").filter(l => l.trim()).map(l => l.split("\t"));
const hIdx = (hdr, ...names) => {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const h = hdr.map(norm);
  for (const n of names) { const i = h.indexOf(norm(n)); if (i >= 0) return i; }
  return -1;
};
const num = v => { const n = parseFloat((v ?? "").replace(/[$,%\s,]/g, "")); return Number.isFinite(n) ? n : 0; };

function parsePos(text) {
  const g = splitTsv(text);
  if (g.length < 2) throw new Error("Nothing to parse yet.");
  const h = g[0];
  const iWk = hIdx(h, "walmart_calendar_week"), iItem = hIdx(h, "walmart_item_number"),
    iU = hIdx(h, "units_per_store_per_week_or_per_day_this_year"),
    iD = hIdx(h, "dollar_per_store_per_week_or_per_day_this_year"),
    iS = hIdx(h, "instock_percentage_this_year"), iOh = hIdx(h, "store_on_hand_quantity_this_year");
  if ([iWk, iItem, iU].some(i => i < 0)) throw new Error("This doesn't look like the Retail Link Pull For Demand Plan export.");
  const acc = new Map();
  for (const r of g.slice(1)) {
    const sku = WM_ITEM_TO_SKU[(r[iItem] || "").trim()]; if (!sku) continue;
    const wk = parseInt(r[iWk], 10); if (!wk) continue;
    const k = wk + "|" + sku;
    let a = acc.get(k);
    if (!a) { a = { wk, sku, units: 0, dollars: 0, storesSelling: 0, traited: 0, stockSum: 0, oh: 0, n: 0 }; acc.set(k, a); }
    const u = num(r[iU]); a.units += u; a.dollars += iD >= 0 ? num(r[iD]) : 0;
    if (u > 0) a.storesSelling++;
    a.traited++; a.stockSum += iS >= 0 ? num(r[iS]) : 0; a.oh += iOh >= 0 ? num(r[iOh]) : 0; a.n++;
  }
  return [...acc.values()].map(a => ({ wk: a.wk, sku: a.sku, units: Math.round(a.units),
    dollars: Math.round(a.dollars * 100) / 100, storesSelling: a.storesSelling, traited: a.traited,
    instock: a.n ? a.stockSum / a.n : null, oh: Math.round(a.oh) }));
}
function parseFcst(text, source) {
  const g = splitTsv(text);
  if (g.length < 2) throw new Error("Nothing to parse yet.");
  const h = g[0];
  const iS = hIdx(h, "fcst_wm_yr_wk_nbr"), iT = hIdx(h, "walmart_calendar_week"),
    iI = hIdx(h, "wm_item_nbr", "walmart_item_number"),
    iQ = hIdx(h, "final_forecast_each_quantity", "forecast_each_quantity");
  if ([iS, iT, iI, iQ].some(i => i < 0)) throw new Error("This doesn't look like a Retail Link demand forecast export.");
  return g.slice(1).map(r => ({ snap: parseInt(r[iS], 10), target: parseInt(r[iT], 10),
    sku: WM_ITEM_TO_SKU[(r[iI] || "").trim()], units: num(r[iQ]), source }))
    .filter(r => r.sku && r.snap && r.target);
}

function parseDotOrders(text) {
  const g = splitTsv(text);
  if (g.length < 2) throw new Error("Nothing to parse yet.");
  const h = g[0];
  const iOrd = hIdx(h, "Ordered Quantity"), iCut = hIdx(h, "Cut Quantity"),
    iDel = hIdx(h, "Delivery Date"), iDot = hIdx(h, "Dot Order Number"),
    iCpo = hIdx(h, "Customer PO Number");
  if ([iOrd, iCut, iDel].some(i => i < 0))
    throw new Error("This doesn't look like the DOT Order History export (need Ordered Quantity, Cut Quantity, Delivery Date).");
  const seen = new Set();
  const byWk = new Map();
  let pos = 0;
  for (const r of g.slice(1)) {
    const id = iDot >= 0 ? r[iDot] : (r[iCpo] || "") + "|" + r[iDel];
    if (seen.has(id)) continue;
    seen.add(id);
    const dt = new Date(r[iDel]);
    if (Number.isNaN(dt.getTime())) continue;
    const days = Math.floor((Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()) - Date.UTC(2026, 0, 31)) / 864e5);
    if (days < 0) continue;
    const wk = 202600 + Math.floor(days / 7) + 1;
    const a = byWk.get(wk) || { wk, ordered: 0, cut: 0, pos: 0 };
    a.ordered += num(r[iOrd]); a.cut += num(r[iCut]); a.pos += 1;
    byWk.set(wk, a); pos += 1;
  }
  if (!pos) throw new Error("No parseable order rows found.");
  return [...byWk.values()];
}

/* ---------------- fiscal calendar (4-5-4, per Walmart calendar) ---------------- */
const FISCAL_CUM = [4, 9, 13, 17, 22, 26, 30, 35, 39, 43, 48, 52];
const FISCAL_MONTHS = ["Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec","Jan"];
const QTR_TINT = { 1: "#D9EFE4", 2: "#FADBE0", 3: "#DCE4F2", 4: "#FBEBD8" }; // matches her calendar
const fiscalOf = wm => {
  const ww = wm % 100;
  const i = FISCAL_CUM.findIndex(c => ww <= c);
  return { month: FISCAL_MONTHS[i], quarter: Math.floor(i / 3) + 1 };
};
const monthBands = cells => {
  const bands = [];
  for (const c of cells) {
    const f = fiscalOf(c.wk);
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
const SKU_NAMES = { WC: "White Chocolate and Cookie Butter", PBG: "PB&J", CCF: "Chocolate Fudge" };
const gapColor = g => {
  if (g == null) return "#EFE4E9";
  const a = Math.abs(g);
  if (a <= 0.15) return "#9BC49B";
  return a > 0.4 ? (g > 0 ? "#C2185B" : "#8E24AA") : "#E8A33D";
};

function Stat({ label, value, tone, src }) {
  const color = tone === "bad" ? "#C2185B" : tone === "warn" ? "#B87514" : "#2D2235";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest opacity-60">{label}</div>
      <div className="cc-serif text-xl" style={{ color }}>{value}</div>
      {src && <div className="text-[9px] opacity-50 mt-0.5">{src}</div>}
    </div>
  );
}

const FLOW_COLORS = { pos: "#2D2235", fcst: "#C2185B", depot: "#E8A33D", dot: "#3E8E5A" };
const UNITS_PER_CASE = 12;

function buildFlow(s) {
  return s.cells.map((c, i) => ({
    wl: String(c.wk).slice(4),
    wk: c.wk,
    month: fiscalOf(c.wk).month,
    dot: c.actual != null ? c.actual : (i > s.lastActualIdx ? c.plan : null),
    depot: c.dlv != null ? c.dlv : (c.req != null && i > s.lastActualIdx ? c.req : null),
    pos: c.pos != null ? Math.round(c.pos / UNITS_PER_CASE) : null,
    fcst: c.wmtStoreFcst != null ? Math.round(c.wmtStoreFcst / UNITS_PER_CASE) : null,
  }));
}

function FlowLegend() {
  const item = (color, label, dashed) => (
    <span className="inline-flex items-center gap-1.5 mr-4">
      <span className="inline-block" style={{ width: 14, height: 0,
        borderTop: dashed ? "2px dashed " + color : "3px solid " + color }} />{label}
    </span>
  );
  return (
    <div className="text-[11px] opacity-80 rounded-xl border px-4 py-2 bg-white"
      style={{ borderColor: "#E5D9DE" }}>
      <div className="flex flex-wrap items-center">
        <span className="font-semibold mr-4">Chain flow, upstream → shopper · all series in cases/week:</span>
        {item(FLOW_COLORS.dot, "DC → DOT · source: production log / NetSuite sales")}
        {item(FLOW_COLORS.depot, "DOT → Walmart depots · source: NetSuite (Cortina) deliveries")}
        {item(FLOW_COLORS.pos, "POS shopper takeaway · source: Retail Link")}
        {item(FLOW_COLORS.fcst, "Walmart sales forecast · source: Retail Link fcst pull", true)}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block" style={{ width: 2, height: 12, background: "#C2185B" }} />today W28 · shaded = forecast horizon
        </span>
      </div>
      <div className="mt-1 opacity-80">
        <b>1 case = 12 retail units.</b> POS, store on-hand, and the Walmart forecast arrive in units
        (shopper-facing systems) and are charted ÷12; NetSuite, DOT, and production are already in cases.
        A healthy chain reads left-to-right in time: DC → DOT leads, depletions follow, POS confirms, and
        Walmart's forecast should trend off POS history — a line breaking away from its neighbors is the early warning.
      </div>
    </div>
  );
}

function chainChips(s) {
  const i = s.lastActualIdx;
  if (i < 0) return [];
  const l4 = s.cells.slice(Math.max(0, i - 3), i + 1);
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
  link("DOT buffer (in − thru)", inSum - thruSum, outSum);
  link("Depot buffer (thru − POS)", thruSum - outSum, outSum);
  if (inSum === 0 && outSum > 0) chips.push({ label: "Production", text: "0 cs shipped L4W", bg: "#F8CBCB", fg: "#8E1039" });
  return chips;
}

function FlowCard({ s, m }) {
  const data = buildFlow(s);
  const ticks = data.filter((d, i) => i === 0 || d.month !== data[i - 1].month).map(d => d.wl);
  const todayWl = s.lastActualIdx >= 0 ? data[s.lastActualIdx].wl : null;
  const chips = chainChips(s);
  const g = m.n4wGap;
  const gTone = g != null && Math.abs(g) > 0.15 ? (Math.abs(g) > 0.4 ? "#C2185B" : "#B87514") : "#3E8E5A";
  const fmtTip = (v, name) => {
    const cs = Math.round(v).toLocaleString() + " cs";
    if (name === "POS" || name === "Walmart fcst") {
      return [cs + " · " + Math.round(v * UNITS_PER_CASE).toLocaleString() + " units", name];
    }
    return [cs, name];
  };
  return (
    <section className="bg-white rounded-2xl border p-5" style={{ borderColor: "#E5D9DE" }}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
        <span className="text-[11px] tracking-widest uppercase font-semibold" style={{ color: "#C2185B" }}>{s.sku}</span>
        <h2 className="cc-serif text-lg leading-tight">{SKU_NAMES[s.sku]}</h2>
        <span className="text-xs opacity-60">Retail Link data thru wk {m.latestWk ?? "\u2014"}</span>
        <span className="ml-auto text-sm" title="Walmart = latest Retail Link store forecast · us = DC internal forecast (trailing-4-wk true velocity × stores)">
          Walmart fcst vs our fcst, next 4 wks: <b style={{ color: gTone }}>{F.spct(g)}</b>
          {g != null && Math.abs(g) > 0.15 && <span className="ml-2 text-[11px] font-medium" style={{ color: "#C2185B" }}>raise with Walmart</span>}
        </span>
      </header>
      <div className="grid gap-4 md:grid-cols-[210px_1fr]">
        <div className="grid grid-cols-2 md:grid-cols-1 gap-3 content-start">
          <Stat label="POS, last 4 wks (cs/wk)" value={F.int(m.l4wPos / UNITS_PER_CASE)}
            src="Retail Link · store POS" />
          <Stat label="True demand (cs/wk)" value={F.int(m.l4wTrue / UNITS_PER_CASE)}
            src="derived: POS ÷ in-stock %" />
          <Stat label="In-stock" value={F.pct(m.instock)}
            tone={m.instock != null && m.instock < 0.65 ? "bad" : m.instock != null && m.instock < 0.8 ? "warn" : undefined}
            src="Retail Link · share of stores" />
          <Stat label="Fill rate, last 4 wks" value={F.pct(m.l4wFill)}
            src="NetSuite (Cortina) deliveries" />
          <Stat label="DOT days on hand" value={F.d1(m.dotDoh)} tone={m.dotDoh > 28 ? "warn" : undefined}
            src="modeled · awaiting DOT on-hand feed" />
        </div>
        <div>
          <div style={{ height: 190 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                {todayWl && (
                  <ReferenceArea x1={todayWl} x2={data[data.length - 1].wl} fill="#FDF6FA" fillOpacity={0.7} />
                )}
                <XAxis dataKey="wl" ticks={ticks} tickLine={false} axisLine={{ stroke: "#E5D9DE" }}
                  tick={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fill: "#2D2235", opacity: 0.7 }}
                  tickFormatter={(wl) => { const d = data.find(x => x.wl === wl); return d ? d.month : wl; }} />
                <YAxis width={42} tickLine={false} axisLine={false}
                  tick={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", fill: "#2D2235", opacity: 0.7 }} />
                <Tooltip formatter={fmtTip}
                  labelFormatter={(wl) => { const d = data.find(x => x.wl === wl); return d ? "W" + wl + " \u00b7 " + d.month + " (wk " + d.wk + ")" : wl; }}
                  contentStyle={{ fontSize: 11, fontFamily: "Inter, sans-serif", borderRadius: 10, borderColor: "#E5D9DE" }} />
                {todayWl && <ReferenceLine x={todayWl} stroke="#C2185B" strokeWidth={2} />}
                <Line dataKey="dot" name="DC \u2192 DOT" stroke={FLOW_COLORS.dot} strokeWidth={1.8} dot={false} connectNulls />
                <Line dataKey="depot" name="DOT \u2192 depots" stroke={FLOW_COLORS.depot} strokeWidth={1.8} dot={false} connectNulls />
                <Line dataKey="pos" name="POS" stroke={FLOW_COLORS.pos} strokeWidth={2.6} dot={false} />
                <Line dataKey="fcst" name="Walmart fcst" stroke={FLOW_COLORS.fcst} strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {chips.map((c, i) => (
              <span key={i} className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: c.bg, color: c.fg }}>
                <b>{c.label}:</b> {c.text} <span className="opacity-70">/ L4W</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Summary({ series, metrics }) {
  return (
    <div className="flex flex-col gap-4">
      <FlowLegend />
      {series.map((s, i) => <FlowCard key={s.sku} s={s} m={metrics[i]} />)}
    </div>
  );
}

function DotServicePanel({ svc }) {
  if (!svc.rows.length) return null;
  const max = Math.max(...svc.rows.map(r => r.trueOrdered));
  return (
    <section className="bg-white rounded-2xl border p-5 mt-4" style={{ borderColor: "#E5D9DE" }}>
      <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mb-3">
        <h2 className="cc-serif text-lg">DOT service & cut recovery</h2>
        <span className="text-xs opacity-60">Source: DOT "Order History" export (exception slice, deliveries 6/18–7/20) + NetSuite cut reasons · all SKUs</span>
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
                title={"Wk " + r.wk + ": true order book " + F.int(r.trueOrdered) + " cs · cut " + F.int(r.cut) + " · NS delivered " + F.int(r.nsDlv)}>
                <div className="w-full flex flex-col justify-end rounded-t overflow-hidden" style={{ height: 64 }}>
                  <div style={{ height: (r.cut / max) * 64, background: "#C2185B" }} />
                  <div style={{ height: (Math.max(0, r.trueOrdered - r.cut) / max) * 64, background: "#9BC49B" }} />
                </div>
                <div className="text-[10px] cc-mono opacity-60">{String(r.wk).slice(4)}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-1 text-[10px] opacity-70">
            <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: "#C2185B" }} />cut</span>
            <span><span className="inline-block w-2 h-2 rounded-sm mr-1" style={{ background: "#9BC49B" }} />filled</span>
            <span className="ml-auto">true order book = NetSuite requested + DOT-recovered cuts</span>
          </div>
        </div>
      </div>
      <p className="text-[11px] mt-3 rounded-lg px-3 py-2" style={{ background: "#FDF6FA", color: "#8E1039" }}>
        NetSuite cut reasons on these POs: "Restricted Supply — Supplier" on 119 of 136 fully-cut
        orders (DOT out-of-stock on only 9). The order book Walmart actually placed was ~{F.int(svc.recovered)} cases
        larger than NetSuite shows for this window — evidence for the supply-allocation conversation, not a demand problem.
      </p>
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
  { k: "dcdoh", l: "DC DOH (fwd)", g: c => c.dcDoh, f: "d1", flag: c => (c.dcDoh > 0 && c.dcDoh < 7 ? "bad" : null) },
  { k: "dotused", l: "DOT closing — used (cs)", g: c => c.dotUsed, f: "int", sec: "DOT" },
  { k: "dotact", l: "DOT actual OH (feed)", g: c => c.dotActual, f: "int" },
  { k: "dotdoh", l: "DOT DOH (fwd)", g: c => c.dotDoh, f: "d1",
    flag: c => (c.dotDoh > 0 && c.dotDoh < 7 ? "bad" : c.dotDoh > 28 ? "warn" : null) },
  { k: "rec", l: "Rec production (cs)", g: c => c.rec, f: "int", sec: "Co-bakery" },
  { k: "plan", l: "Planned output (cs)", g: c => c.plan, f: "int" },
  { k: "act", l: "Actual shipped to DOT", g: c => c.actual, f: "int", edit: "actual" },
  { k: "pal", l: "Pallets", g: c => c.pallets, f: "d1" },
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
                        className="cc-sans text-[10px] font-semibold uppercase tracking-widest py-1"
                        style={{ background: QTR_TINT[b.quarter], color: "#2D2235" }}>
                        {b.month} · Q{b.quarter}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    <th className="sticky left-0 bg-white z-10 text-left cc-sans font-semibold px-3 py-1.5 border-b min-w-[185px]" style={{ borderColor: "#E5D9DE" }}>Week →</th>
                    {s.cells.map((c, i) => (
                      <th key={c.wk} className="px-2 py-1.5 border-b font-normal text-right"
                        style={{ borderColor: "#E5D9DE",
                          borderRight: i === s.lastActualIdx ? "2px solid #C2185B" : undefined,
                          background: i > s.lastActualIdx ? "#FDF6FA" : undefined }}>
                        <div className="font-semibold">{String(c.wk).slice(4)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map(row => (
                    <Fragment key={row.k}>
                      {row.sec && (
                        <tr><td colSpan={s.cells.length + 1}
                          className="sticky left-0 cc-sans font-semibold text-[10px] uppercase tracking-widest px-3 py-1"
                          style={{ background: "#EFE4E9" }}>{row.sec}</td></tr>
                      )}
                      <tr>
                        <td className="sticky left-0 bg-white z-10 cc-sans px-3 py-1 border-b" style={{ borderColor: "#F2EAEE" }}>{row.l}</td>
                        {s.cells.map((c, i) => {
                          const flag = row.flag ? row.flag(c) : null;
                          const future = i > s.lastActualIdx;
                          const editable = row.edit === "actual" ? true : (row.edit ? future : false);
                          return (
                            <td key={c.wk} className="px-2 py-1 text-right border-b"
                              style={{ borderColor: "#F2EAEE",
                                borderRight: i === s.lastActualIdx ? "2px solid #C2185B" : undefined,
                                background: flag === "bad" ? "#F8CBCB" : flag === "warn" ? "#FDE9C8" : future ? "#FDF6FA" : undefined,
                                color: flag === "bad" ? "#8E1039" : flag === "warn" ? "#8A5A10" : undefined,
                                fontWeight: flag === "bad" ? 600 : undefined }}>
                              {editable ? (
                                <input type="number" step={row.edit === "mult" ? "0.05" : "1"}
                                  defaultValue={row.g(c) ?? ""}
                                  onBlur={e => {
                                    const raw = e.target.value.trim();
                                    onEdit(row.edit, c.wk, s.sku, raw === "" ? null : Number(raw));
                                  }}
                                  className="w-14 bg-transparent text-right cc-mono outline-none rounded px-0.5"
                                  style={{ color: "#1D4ED8" }} aria-label={row.l + " week " + c.wk} />
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
        Units vs cases: rows labeled (units) are shopper-facing feeds; everything in (cs) is cases — 1 case = 12 units, and the Demand row converts ÷12 exactly once. Pink rule = last week with POS actuals; tinted columns are forecast. Blue cells are
        editable — change a seasonality multiplier or key a consensus override and the whole
        cascade (demand, DC/DOT inventory, production recs) recomputes instantly.
      </p>
    </div>
  );
}

/* ---------------- inputs ---------------- */
function PasteCard({ step, title, hint, onCommit, parser }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState(false);
  return (
    <section className="bg-white rounded-2xl border p-5 flex flex-col gap-3" style={{ borderColor: "#E5D9DE" }}>
      <header className="flex items-baseline gap-3">
        <span className="cc-serif text-2xl" style={{ color: "#C2185B" }}>{step}</span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="text-xs opacity-60">{hint}</p>
        </div>
      </header>
      <textarea value={text} onChange={e => { setText(e.target.value); setMsg(""); }}
        rows={5} placeholder="Paste the raw export here, header row included…"
        className="w-full rounded-lg border p-3 text-xs cc-mono focus:outline-none"
        style={{ borderColor: "#E5D9DE", background: "#FAF5F2" }} />
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            try {
              const rows = parser(text);
              if (!rows.length) throw new Error("No rows recognized for the bettergoods items.");
              onCommit(rows);
              setErr(false);
              setMsg(rows.length + " rows loaded — every view just recomputed.");
              setText("");
            } catch (e) { setErr(true); setMsg(e.message); }
          }}
          disabled={!text.trim()}
          className="px-4 py-1.5 rounded-full text-white text-sm disabled:opacity-40"
          style={{ background: "#2D2235" }}>
          Parse & load
        </button>
        <span className="text-xs" style={{ color: err ? "#C2185B" : undefined, opacity: err ? 1 : 0.7 }}>{msg}</span>
      </div>
    </section>
  );
}

function Inputs({ addPos, addFcst, addDot, addDotSvc }) {
  const [dot, setDot] = useState({ wk: "", WC: "", PBG: "", CCF: "" });
  const [dotMsg, setDotMsg] = useState("");
  return (
    <div className="grid gap-4 xl:grid-cols-2 max-w-6xl">
      <PasteCard step={1} title="Retail Link POS — weekly pull"
        hint="Paste the raw store-week export for the latest complete week. It aggregates to 3 SKU rows on parse."
        parser={parsePos} onCommit={addPos} />
      <PasteCard step={2} title="Store demand forecast — append"
        hint="Paste the weekly forecast pull. Snapshots append; history powers drift and MAPE."
        parser={t => parseFcst(t, "store")} onCommit={addFcst} />
      <PasteCard step={3} title="Warehouse demand forecast — append"
        hint="Same schema, its own source bucket. Ready for the first pull."
        parser={t => parseFcst(t, "warehouse")} onCommit={addFcst} />
      <PasteCard step={4} title="DOT order history — cut recovery"
        hint="Paste the DOT 'Order History' outbound export (the cuts/exception slice). Recovers Walmart order volume that NetSuite can't see and updates the service panel."
        parser={parseDotOrders} onCommit={addDotSvc} />
      <section className="bg-white rounded-2xl border p-5" style={{ borderColor: "#E5D9DE" }}>
        <header className="flex items-baseline gap-3 mb-3">
          <span className="cc-serif text-2xl" style={{ color: "#C2185B" }}>5</span>
          <div>
            <h2 className="font-semibold">DOT on-hand — weekly snapshot</h2>
            <p className="text-xs opacity-60">From Harshita's report. The tracker anchors its DOT model to these.</p>
          </div>
        </header>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs flex flex-col gap-1">WM week
            <input value={dot.wk} onChange={e => setDot(d => ({ ...d, wk: e.target.value }))}
              placeholder="202628" className="rounded-lg border px-2 py-1.5 w-24" style={{ borderColor: "#E5D9DE" }} />
          </label>
          {["WC", "PBG", "CCF"].map(s => (
            <label key={s} className="text-xs flex flex-col gap-1">{s} cases
              <input type="number" value={dot[s]} onChange={e => setDot(d => ({ ...d, [s]: e.target.value }))}
                className="rounded-lg border px-2 py-1.5 w-24" style={{ borderColor: "#E5D9DE" }} />
            </label>
          ))}
          <button onClick={() => {
            const wk = parseInt(dot.wk, 10);
            if (!wk) { setDotMsg("Enter the WM week first."); return; }
            const rows = ["WC", "PBG", "CCF"].filter(s => dot[s] !== "").map(s => ({ wk, sku: s, cases: Number(dot[s]) }));
            if (!rows.length) { setDotMsg("Enter at least one on-hand figure."); return; }
            addDot(rows);
            setDotMsg("Saved — DOT rows now anchor to actuals for wk " + wk + ".");
          }} className="px-4 py-1.5 rounded-full text-white text-sm" style={{ background: "#C2185B" }}>
            Save on-hand
          </button>
          <span className="text-xs opacity-70">{dotMsg}</span>
        </div>
      </section>
      <p className="text-xs opacity-60 xl:col-span-2">
        NetSuite orders use the replace-the-batch flow in Cookie Central (full cumulative
        export, atomic swap) — omitted from this preview since the current 8/13 batch is
        already loaded. In the live module every card commits to Supabase with role-gated RLS.
      </p>
    </div>
  );
}

/* ---------------- app ---------------- */
export default function DemandPlanner() {
  const [tab, setTab] = useState("summary");
  const [extraPos, setExtraPos] = useState([]);
  const [extraFcst, setExtraFcst] = useState([]);
  const [dotRows, setDotRows] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [prodEdits, setProdEdits] = useState([]);
  const [dotSvcRows, setDotSvcRows] = useState(SEED.dotService || []);

  const input = useMemo(() => ({
    weeks: SEED.weeks.map(w => w.wk),
    pos: [...SEED.pos.filter(p => !extraPos.some(e => e.wk === p.wk && e.sku === p.sku)), ...extraPos],
    orders: SEED.orders,
    forecasts: [...SEED.forecasts, ...extraFcst],
    production: [...SEED.production.filter(p => !prodEdits.some(e => e.wk === p.wk && e.sku === p.sku)),
      ...prodEdits.filter(e => e.cases != null)],
    dot: dotRows,
    overrides,
    params: SEED.params,
  }), [extraPos, extraFcst, dotRows, overrides, prodEdits]);

  const series = useMemo(() => ["WC", "PBG", "CCF"].map(s => buildSkuSeries(input, s)), [input]);
  const metrics = useMemo(() => series.map(s => sopSummary(s)), [series]);
  const svc = useMemo(() => {
    const nsByWk = new Map();
    for (const o of SEED.orders) {
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
  }, [dotSvcRows]);

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
      <header className="border-b px-6 py-4 flex flex-wrap items-center gap-4"
        style={{ borderColor: "#E5D9DE", background: "rgba(255,255,255,0.75)" }}>
        <div>
          <div className="text-[11px] tracking-widest uppercase font-semibold" style={{ color: "#C2185B" }}>
            Cookie Central
          </div>
          <h1 className="cc-serif text-2xl leading-tight">Walmart Demand Planner</h1>
        </div>
        <div className="text-xs opacity-60">
          <span className="px-2 py-0.5 rounded-full mr-2 font-semibold" style={{ background: "#D9EFE4", color: "#2D2235" }}>
            Today · WM Week 28
          </span>
          <span className="px-2 py-0.5 rounded-full mr-2 cc-mono" style={{ background: "#EFE4E9", color: "#2D2235" }}>
            1 cs = 12 units · 21 cs/layer · 189 cs/pallet
          </span>
          data thru wk 202627 (8/1–8/7) · NetSuite batch 8/13
        </div>
        <nav className="ml-auto flex gap-1 cc-sans" aria-label="Views">
          {["summary", "tracker", "inputs"].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2 rounded-full text-sm capitalize"
              style={tab === t ? { background: "#2D2235", color: "#fff" } : {}}>
              {t === "summary" ? "S&OP summary" : t}
            </button>
          ))}
        </nav>
      </header>
      {/* The page looks live — real SKUs, real weeks, editable cells — so it has
          to say plainly that it is not. Reads SEED.asOf rather than a hardcoded
          date, so refreshing the seed updates the banner with it. */}
      <div className="px-6 py-2 text-[12px] cc-sans flex flex-wrap gap-x-2 gap-y-1 items-baseline"
        style={{ background: "#FDF3D8", borderBottom: "1px solid #E8D9A8", color: "#5C4A1F" }}>
        <span className="font-semibold">Static snapshot — data frozen at {SEED.asOf}.</span>
        <span>Not yet connected to Supabase; edits, pastes and overrides live in the page for this session and are lost on reload.</span>
      </div>
      <main className="p-5 cc-sans">
        {tab === "summary" && (<><Summary series={series} metrics={metrics} /><DotServicePanel svc={svc} /></>)}
        {tab === "tracker" && <Tracker series={series} onEdit={onEdit} />}
        {tab === "inputs" && (
          <Inputs
            addPos={rows => setExtraPos(p => [...p, ...rows])}
            addFcst={rows => setExtraFcst(p => [...p, ...rows])}
            addDot={rows => setDotRows(p => [...p.filter(e => !rows.some(r => r.wk === e.wk && r.sku === e.sku)), ...rows])}
            addDotSvc={rows => setDotSvcRows(p => [...p.filter(e => !rows.some(r => r.wk === e.wk)), ...rows])}
          />
        )}
      </main>
    </div>
  );
}
