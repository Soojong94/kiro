import { Pool } from "pg";

// 단일 커넥션 풀. 서버/인제스트 워커 모두 이 파일을 import.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export { pool };
