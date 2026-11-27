CREATE TABLE users (
  id BIGINT PRIMARY KEY,
  email VARCHAR(120) NOT NULL UNIQUE
);

CREATE TABLE posts (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  title VARCHAR(200) DEFAULT 'Untitled',
  CONSTRAINT posts_user_fk
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX posts_user_idx ON posts (user_id);
