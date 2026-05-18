export interface ProgressStep {
  key: string;
  label: string;
  description: string;
}

export interface ProgressLog {
  step: string;
  status: 'started' | 'completed' | 'failed';
  timestamp: string;
  detail?: Record<string, unknown>;
  duration_ms?: number;
}

export type TaskOverallStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface TaskProgressState {
  status: string;
  logs: ProgressLog[];
  error: string | null;
  overallStatus: TaskOverallStatus;
}

export const INDEX_STEPS: ProgressStep[] = [
  {
    key: 'chunk',
    label: '文档切分',
    description: '按标题层级和语义边界将文档切分为知识片段',
  },
  {
    key: 'embed',
    label: '向量化',
    description: '调用 Embedding 模型将知识片段转换为向量',
  },
  {
    key: 'store',
    label: '存储索引',
    description: '将向量存入数据库，建立可检索的索引',
  },
];

export const GRAPH_SYNC_STEPS: ProgressStep[] = [
  {
    key: 'extract',
    label: '实体提取',
    description: '从内容中识别概念、实体及其关系',
  },
  {
    key: 'write',
    label: '写入图谱',
    description: '将实体和关系写入 Neo4j 知识图谱',
  },
  {
    key: 'community_discover',
    label: '社区发现',
    description: '使用 Louvain 算法发现知识社区结构',
  },
  {
    key: 'summarize',
    label: '社区摘要',
    description: '为每个知识社区生成语义摘要',
  },
];

export const EXTRACTION_STEPS: ProgressStep[] = [
  {
    key: 'preprocess',
    label: '预处理',
    description: '清洗、去噪、格式标准化',
  },
  {
    key: 'extract',
    label: '实体提取',
    description: '识别文本中的概念和关系',
  },
  {
    key: 'generate',
    label: '生成产物',
    description: '生成笔记摘要和闪卡',
  },
];
