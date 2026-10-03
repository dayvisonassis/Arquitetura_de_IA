#!/bin/bash
(
  set -euo pipefail

  : "${MYSQL_ROOT_PASSWORD:?MYSQL_ROOT_PASSWORD is required}"
  : "${GATEWAY_DB_PASSWORD:?GATEWAY_DB_PASSWORD is required}"
  : "${WEB_DB_PASSWORD:?WEB_DB_PASSWORD is required}"

  sql_string() {
    printf "'%s'" "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/''/g")"
  }

  MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS \`gateway\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS \`gateway_test\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS \`web\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS \`web_test\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'gateway_app'@'%' IDENTIFIED BY $(sql_string "$GATEWAY_DB_PASSWORD");
GRANT ALL PRIVILEGES ON \`gateway\`.* TO 'gateway_app'@'%';
GRANT ALL PRIVILEGES ON \`gateway_test\`.* TO 'gateway_app'@'%';

CREATE USER IF NOT EXISTS 'web_app'@'%' IDENTIFIED BY $(sql_string "$WEB_DB_PASSWORD");
GRANT ALL PRIVILEGES ON \`web\`.* TO 'web_app'@'%';
GRANT ALL PRIVILEGES ON \`web_test\`.* TO 'web_app'@'%';

FLUSH PRIVILEGES;
SQL
)
