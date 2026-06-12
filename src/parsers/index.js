import assemblers from './assemblers';
import production from './production';
import dot from './dot';
import qbo from './qbo';
import netsuite from './netsuite';
import cortinaPO from './cortinaPO';
import walmartOrders from './walmartOrders';
import ingredientMaster from './ingredientMaster';

// Registry keyed by upload_log.upload_type.
export const PARSERS = { walmart_orders: walmartOrders, cortina_po: cortinaPO, netsuite, assemblers, production, dot, qbo, ingredient_master: ingredientMaster };

export function getParser(type) {
  return PARSERS[type] || null;
}

export const PARSER_LIST = Object.values(PARSERS);
