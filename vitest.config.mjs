import { defineConfig } from 'vitest/config';

// 테스트는 Node 에서 돈다. D1 은 실제 SQLite(node:sqlite) 위에 같은 표면을 얹어 쓴다(test/support/d1.ts).
export default defineConfig({ test: { environment: 'node', include: ['test/**/*.test.ts'] } });
