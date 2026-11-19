-- The Greedy / Lucky 77 engine tick asks for "the oldest round that is not completed". With ~200k completed
-- rows the planner walked the whole table on every tick (about 100 ms each, all day). These partial indexes
-- hold only the open round, so the lookup touches one row.
CREATE INDEX IF NOT EXISTS "greedy_rounds_open_idx" ON "greedy_rounds" ("id") WHERE "phase" <> 'completed';
CREATE INDEX IF NOT EXISTS "lucky77_rounds_open_idx" ON "lucky77_rounds" ("id") WHERE "phase" <> 'completed';
