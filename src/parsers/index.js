import assemblers from './assemblers';
import production from './production';
import dot from './dot';
import qbo from './qbo';
import netsuite from './netsuite';
import cortinaPO from './cortinaPO';

// Registry keyed by upload_log.upload_type.
export const PARSERS = { cortina_po: cortinaPO, netsuite, assemblers, production, dot, qbo };

export function getParser(type) {
  return PARSERS[type] || null;
}

export const PARSER_LIST = Object.values(PARSERS);
