-- ════════════════════════════════════════════════════════════════════════════
-- Normalise the attendee spelling: Mark -> Marc
--
-- The late-July L10 notes spelled him "Mark"; the foundation document spells
-- him "Marc", which is correct. Everywhere else in the EOS tables he was
-- already seeded as 'Marc' (three seats, Rock 1, three issues), so the only
-- divergence was the attendees array on the 2026-07-27 meeting.
--
-- Deliberately narrow: array_replace on an exact element match, NOT a text
-- search. The issue titled "Mark Cuban meeting debrief" is a different person
-- whose name really is Mark, and the seeded issue "Marketing" contains the
-- same four letters. A blind replace would corrupt both.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE eos_meetings
   SET attendees = array_replace(attendees, 'Mark', 'Marc')
 WHERE 'Mark' = ANY (attendees);
