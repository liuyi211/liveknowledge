import neo4j, { Driver } from 'neo4j-driver';

let driver: Driver | null = null;

export function getNeo4jDriver(): Driver {
  if (!driver) {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';
    driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
      encrypted: 'ENCRYPTION_OFF',
    } as any);
  }
  return driver;
}

export async function runQuery(query: string, params: Record<string, any> = {}): Promise<any[]> {
  const session = getNeo4jDriver().session();
  try {
    const result = await session.run(query, params);
    return result.records;
  } finally {
    await session.close();
  }
}

export async function testNeo4jConnection(): Promise<boolean> {
  try {
    await runQuery('RETURN 1 AS ok');
    return true;
  } catch {
    return false;
  }
}
