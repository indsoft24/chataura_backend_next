-- Greedy / Lucky 77: a round where any pick hit is a win, even if the payout only returned the bet.
UPDATE game_history SET result = 'win' WHERE game IN ('greedy', 'lucky77') AND payout > 0 AND result <> 'win';
