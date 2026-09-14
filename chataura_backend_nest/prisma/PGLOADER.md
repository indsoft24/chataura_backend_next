# MySQL → PostgreSQL data migration (run later, not in Phase 1)
#
# Prerequisites:
# - Laravel MySQL dump / live DB reachable
# - Postgres from docker-compose healthy
#
# Example:
#   docker run --rm --network host dimitri/pgloader:latest \
#     pgloader \
#       --cast "type tinyint to boolean using tinyint-to-boolean" \
#       --cast "type datetime to timestamptz" \
#       mysql://root:rootpass@localhost:3306/indsoft24_chataura \
#       postgresql://chataura_user:chataura_dev@localhost:5432/chataura_db
#
# After import, reset sequences:
#   SELECT setval(pg_get_serial_sequence('users','id'), COALESCE((SELECT MAX(id) FROM users), 1));
