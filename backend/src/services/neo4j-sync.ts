import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { conceptRelations, concepts, noteConcepts, notes } from '../db/schema.js';
import { runQuery, testNeo4jConnection } from './graphrag/neo4j.js';

const RELATION_TYPES = new Set([
  'IS_A',
  'PART_OF',
  'PREREQUISITE_OF',
  'RELATED_TO',
  'DERIVES_FROM',
  'CONTRASTS_WITH',
]);

function safeRelationType(type: string): string {
  const normalized = type.toUpperCase();
  return RELATION_TYPES.has(normalized) ? normalized : 'RELATED_TO';
}

export async function syncUserGraphToNeo4j(userId: string) {
  const available = await testNeo4jConnection();
  if (!available) {
    return {
      available: false,
      syncedConcepts: 0,
      syncedRelations: 0,
      syncedNotes: 0,
      message: 'Neo4j is not reachable',
    };
  }

  const conceptRows = await db.select().from(concepts).where(eq(concepts.userId, userId));
  const relationRows = await db.select().from(conceptRelations).where(eq(conceptRelations.userId, userId));
  const noteRows = await db.select({
    noteId: notes.id,
    title: notes.title,
    conceptId: noteConcepts.conceptId,
  })
    .from(noteConcepts)
    .innerJoin(notes, eq(notes.id, noteConcepts.noteId))
    .where(eq(noteConcepts.userId, userId));

  await runQuery(`
    MATCH (n)
    WHERE n.userId = $userId
    DETACH DELETE n
  `, { userId });

  for (const concept of conceptRows) {
    await runQuery(`
      MERGE (c:Concept {id: $id})
      SET c.userId = $userId,
          c.label = $label,
          c.description = $description,
          c.domain = $domain,
          c.confidence = $confidence
    `, {
      id: concept.id,
      userId,
      label: concept.label,
      description: concept.description,
      domain: concept.domain,
      confidence: concept.confidence,
    });
  }

  const noteMap = new Map(noteRows.map(row => [row.noteId, row.title]));
  for (const [noteId, title] of noteMap.entries()) {
    await runQuery(`
      MERGE (n:Note {id: $id})
      SET n.userId = $userId,
          n.title = $title
    `, { id: noteId, userId, title });
  }

  for (const row of noteRows) {
    await runQuery(`
      MATCH (n:Note {id: $noteId, userId: $userId})
      MATCH (c:Concept {id: $conceptId, userId: $userId})
      MERGE (n)-[:COVERS]->(c)
    `, { userId, noteId: row.noteId, conceptId: row.conceptId });
  }

  for (const relation of relationRows) {
    const relationType = safeRelationType(relation.relationType);
    await runQuery(`
      MATCH (source:Concept {id: $sourceId, userId: $userId})
      MATCH (target:Concept {id: $targetId, userId: $userId})
      MERGE (source)-[r:${relationType}]->(target)
      SET r.id = $id,
          r.weight = $weight,
          r.evidence = $evidence,
          r.confidence = $confidence
    `, {
      userId,
      id: relation.id,
      sourceId: relation.sourceConceptId,
      targetId: relation.targetConceptId,
      weight: relation.weight,
      evidence: relation.evidence,
      confidence: relation.confidence,
    });
  }

  return {
    available: true,
    syncedConcepts: conceptRows.length,
    syncedRelations: relationRows.length,
    syncedNotes: noteMap.size,
    message: 'Neo4j sync completed',
  };
}
