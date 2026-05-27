-- Cookie Central — link raw_material_lots to their originating order
--
-- Lot numbers are born at landing, when a raw-material order is received. A
-- single order can land as multiple lots (e.g. 100 lb flour = 80 lb lot A +
-- 20 lb lot B), so raw_material_orders → raw_material_lots is 1:many. This FK
-- ties each landed lot back to its order, carrying cost/distributor/brand
-- provenance for the cost rollup and traceability chain.

ALTER TABLE raw_material_lots
  ADD COLUMN raw_material_order_id uuid REFERENCES raw_material_orders(id);

CREATE INDEX idx_raw_material_lots_order ON raw_material_lots(raw_material_order_id);
