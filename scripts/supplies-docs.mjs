// Original vendor documents for the supplies seed (catalogue rev 6).
//
// dc-supplies embeds each document as JPEG page scans in its `PAGES` object.
// Each entry here becomes one PDF in the private `supply-docs` bucket at
// `path`, and quotes.doc_path points at it. Shared by
// build-supplies-seed.mjs (doc_path values) and upload-supply-docs.mjs.
export const SUPPLY_DOCS = {
  lallypakPouch:  { path: 'lallypak/2026-07-01_pouch-quote.pdf',            pages: ['LallyPak_Pouch_Quote_Jul1_2026-1', 'LallyPak_Pouch_Quote_Jul1_2026-2'] },
  powpack:        { path: 'powpack/2026-07-29_est-4674.pdf',                pages: ['PowPack_Quote_4674-1'] },
  sterling:       { path: 'sterling/2026-07-30_quote-8547.pdf',             pages: ['Sterling_Quote_8547-1'] },
  gbMasterCase:   { path: 'green-bay/2026-08-04_pl-30378_master-case.pdf',  pages: ['GB_MasterCase_PriceList_30378-1'] },
  gbSrp8:         { path: 'green-bay/2026-04-14_pl-29843_srp-8ct.pdf',      pages: ['Quote_for_SRP_-_8_CT-1'] },
  pgiSrp:         { path: 'pgi/2026-08-18_srp-horcorr-spec-pgi2604501.pdf', pages: ['PGI_SRP_HorCorr_Spec_PGI2604501-1'] },
  formtight:      { path: 'formtight/2026-08-21_tray-quote.pdf',            pages: ['FormTight_TrayQuote_Aug21-1', 'FormTight_TrayQuote_Aug21-2'] },
  batorySO:       { path: 'batory/2026-10-27_so-1758307.pdf',               pages: ['Batory_SO1758307-1'] },
  batoryPO:       { path: 'batory/2026-10-22_po-sp026-2026.pdf',            pages: ['DC_PO_SP026-1'] },
  gntProforma:    { path: 'gnt/2026-10-22_proforma-sor22-161555.pdf',       pages: ['Exberry_SOR22-161555-1'] },
  mccormickPO:    { path: 'mccormick/2026-10-22_po-sp028-2026.pdf',         pages: ['DC_PO_SP028-1'] },
};
