import { runQuery } from './neo4j.js';
import type { RetrievalResult } from '../retrieval/vector.js';

export async function localSearch(entities: string[], topK: number): Promise<{ results: RetrievalResult[]; paths: string[] }> {
  const allResults: RetrievalResult[] = [];
  const allPaths: string[] = [];

  for (const entity of entities) {
    // Find neighbors
    const neighborResults = await runQuery(`
      MATCH (c:Concept)
      WHERE c.label CONTAINS $entity
      MATCH (c)-[r:IS_A|PART_OF|PREREQUISITE_OF|RELATED_TO*1..2]-(neighbor:Concept)
      WITH neighbor, min(length(r)) as distance
      ORDER BY distance
      LIMIT $topK
      MATCH (n:Note)-[:COVERS]->(neighbor)
      RETURN n.id as sourceId, n.title as title, neighbor.label as concept, distance
    `, { entity, topK: Math.ceil(topK / entities.length) });

    for (const record of neighborResults) {
      allResults.push({
        id: record.get('sourceId'),
        content: `相关概念：${record.get('concept')}`,
        metadata: { title: record.get('title'), sourceType: 'note', distance: record.get('distance') },
        similarity: 1 / (1 + record.get('distance')),
        sourceId: record.get('sourceId'),
      });
    }

    // Find paths between entities
    if (entities.length > 1) {
      const otherEntities = entities.filter(e => e !== entity);
      for (const other of otherEntities) {
        const paths = await runQuery(`
          MATCH path = shortestPath(
            (a:Concept {label: $entity})-[:IS_A|PART_OF|PREREQUISITE_OF|RELATED_TO*]-(b:Concept {label: $other})
          )
          RETURN [node in nodes(path) | node.label] as pathLabels,
                 [rel in relationships(path) | type(rel)] as relTypes
          LIMIT 3
        `, { entity, other });

        for (const record of paths) {
          const labels: string[] = record.get('pathLabels');
          const types: string[] = record.get('relTypes');
          let pathStr = labels[0];
          for (let i = 0; i < types.length; i++) {
            pathStr += ` → ${types[i]} → ${labels[i + 1]}`;
          }
          allPaths.push(pathStr);
        }
      }
    }
  }

  // Deduplicate by sourceId
  const seen = new Set<string>();
  const deduped = allResults.filter(r => {
    if (seen.has(r.sourceId)) return false;
    seen.add(r.sourceId);
    return true;
  });

  return { results: deduped.slice(0, topK), paths: [...new Set(allPaths)] };
}

export async function globalSearch(_queryEmbedding: number[], topK: number): Promise<RetrievalResult[]> {
  // For MVP: return community concepts
  const communities = await runQuery(`
    MATCH (comm:Community)
    WHERE comm.summary IS NOT NULL
    RETURN comm.id as id, comm.summary as summary
    LIMIT 50
  `);

  const results: RetrievalResult[] = [];

  for (const record of communities) {
    const communityId = record.get('id');
    const concepts = await runQuery(`
      MATCH (comm:Community {id: $communityId})<-[:BELONGS_TO]-(c:Concept)
      MATCH (n:Note)-[:COVERS]->(c)
      RETURN n.id as sourceId, n.title as title, c.label as concept
      LIMIT 10
    `, { communityId });

    for (const conceptRecord of concepts) {
      results.push({
        id: conceptRecord.get('sourceId'),
        content: `社区概念：${conceptRecord.get('concept')}`,
        metadata: { title: conceptRecord.get('title'), sourceType: 'note', communityId },
        similarity: 0.5,
        sourceId: conceptRecord.get('sourceId'),
      });
    }
  }

  return results.slice(0, topK);
}
