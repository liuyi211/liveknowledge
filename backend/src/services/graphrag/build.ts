import { runQuery } from './neo4j.js';
import { extractEntitiesAndRelations } from './extract.js';
import type { ExtractionResult } from './extract.js';

export async function buildGraphForNote(
  noteId: string,
  noteTitle: string,
  content: string,
  model: string,
  userId: string
): Promise<void> {
  // Step 1: Clear old data for this note
  await runQuery(`
    MATCH (n:Note {id: $noteId})-[c:COVERS]->(concept:Concept)
    WITH concept, count(c) as coverCount
    WHERE coverCount = 1
    DETACH DELETE concept
  `, { noteId });

  await runQuery(`
    MATCH (n:Note {id: $noteId})
    DETACH DELETE n
  `, { noteId });

  // Step 2: Extract entities and relations
  const extracted = await extractEntitiesAndRelations(content, model, userId);

  // Step 3: Write to Neo4j
  await writeToNeo4j(noteId, noteTitle, extracted);
}

async function writeToNeo4j(noteId: string, noteTitle: string, extracted: ExtractionResult): Promise<void> {
  // Create note node
  await runQuery(`
    MERGE (n:Note {id: $noteId})
    SET n.title = $title
  `, { noteId, title: noteTitle });

  // Create concepts
  for (const entity of extracted.entities) {
    await runQuery(`
      MERGE (c:Concept {label: $label})
      SET c.description = $description, c.type = $type
      WITH c
      MATCH (n:Note {id: $noteId})
      MERGE (n)-[:COVERS]->(c)
    `, { label: entity.name, description: entity.description, type: entity.type, noteId });
  }

  // Create relations
  for (const relation of extracted.relations) {
    try {
      await runQuery(`
        MATCH (a:Concept {label: $source}), (b:Concept {label: $target})
        MERGE (a)-[r:${relation.type}]->(b)
        SET r.description = $description
      `, { source: relation.source, target: relation.target, description: relation.description });
    } catch {
      // Relation may fail if source/target not found, skip
    }
  }
}

export async function discoverCommunities(): Promise<void> {
  try {
    // Clear old communities
    await runQuery(`
      MATCH (c:Concept)-[b:BELONGS_TO]->(comm:Community)
      DELETE b
    `);
    await runQuery(`MATCH (c:Community) DELETE c`);

    // Run Louvain algorithm via GDS
    await runQuery(`
      CALL gds.graph.exists('concept-graph') YIELD exists
      WITH exists WHERE exists
      CALL gds.graph.drop('concept-graph') YIELD graphName
      RETURN graphName
    `);

    await runQuery(`
      CALL gds.graph.project('concept-graph', 'Concept', {
        IS_A: {orientation: 'UNDIRECTED'},
        PART_OF: {orientation: 'UNDIRECTED'},
        RELATED_TO: {orientation: 'UNDIRECTED'},
        PREREQUISITE_OF: {orientation: 'UNDIRECTED'}
      })
      YIELD graphName
      RETURN graphName
    `);

    await runQuery(`
      CALL gds.louvain.stream('concept-graph')
      YIELD nodeId, communityId
      WITH gds.util.asNode(nodeId) AS concept, communityId
      MERGE (comm:Community {id: toString(communityId)})
      MERGE (concept)-[:BELONGS_TO]->(comm)
    `);

    await runQuery(`
      CALL gds.graph.drop('concept-graph') YIELD graphName
      RETURN graphName
    `);
  } catch (err) {
    console.warn('图谱社区发现失败：', err);
  }
}

export async function generateCommunitySummaries(model: string, userId: string): Promise<void> {
  try {
    const communities = await runQuery(`
      MATCH (comm:Community)<-[:BELONGS_TO]-(c:Concept)
      RETURN comm.id as communityId, collect(c.label) as concepts
    `);

    for (const record of communities) {
      const communityId = record.get('communityId');
      const conceptList: string[] = record.get('concepts');

      if (conceptList.length < 2) continue;

      const summary = await generateSummary(conceptList, model, userId);

      await runQuery(`
        MATCH (comm:Community {id: $communityId})
        SET comm.summary = $summary
      `, { communityId, summary: summary.slice(0, 500) });
    }
  } catch (err) {
    console.warn('社区摘要生成失败：', err);
  }
}

async function generateSummary(concepts: string[], model: string, userId: string): Promise<string> {
  const { chat } = await import('../ai-provider.js');
  const logger: any = { info: () => {}, error: console.error, warn: console.warn, debug: () => {}, trace: () => {}, fatal: console.error, child: () => logger, silent: () => {} };

  const prompt = `以下是一组相关概念，请用 100-200 字总结这个知识社区的主题：

概念列表：${concepts.join('、')}

请用中文输出摘要。`;

  try {
    const response = await chat(userId, {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 300,
    }, logger);
    return response.content;
  } catch {
    return `包含 ${concepts.slice(0, 5).join('、')} 等概念的知识社区`;
  }
}
