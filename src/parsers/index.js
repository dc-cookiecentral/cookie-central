import assemblers from './assemblers';
import dot from './dot';
import qbo from './qbo';
import netsuite from './netsuite';

// Registry keyed by upload_log.upload_type.
export const PARSERS = { netsuite, assemblers, dot, qbo };

export function getParser(type) {
  return PARSERS[type] || null;
}

export const PARSER_LIST = Object.values(PARSERS);
