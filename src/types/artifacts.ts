// ============================================================
// Artifact types — the data contracts between pipeline stages
// ============================================================

export interface IdeaArtifact {
  tagline: string;
  features: string[];
  targetUser: string;
  debateSummary: string;
  confidence: number;
  keyInsights: string[];
}

export interface PageSpec {
  name: string;
  route: string;
  description: string;
  components: ComponentSpec[];
}

export interface ComponentSpec {
  name: string;
  type: string;
  props?: Record<string, string>;
  description: string;
}

export interface DataModel {
  entities: Record<string, EntitySpec>;
}

export interface EntitySpec {
  fields: Record<string, { type: string; required: boolean }>;
}

export interface UISpec {
  theme: string;
  primaryColor: string;
  layout: string;
  style: string;
}

export interface BuilderSpec {
  type: string;
  label: string;
  description: string;
  files: string[];
  dependencies: string[];
}

export interface DesignArtifact {
  techStack: string;
  pages: PageSpec[];
  dataModel: DataModel;
  uiSpec: UISpec;
  dependencies: string[];
  builderSpecs: BuilderSpec[];
  projectStructure: Record<string, string>;
}

export interface BuildArtifact {
  repoPath: string;
  fileCount: number;
  buildStatus: "success" | "failure";
  errors?: string[];
}

export interface ReviewArtifact {
  passed: boolean;
  issues: ReviewIssue[];
  fixes: string[];
  testResults: TestResult;
}

export interface ReviewIssue {
  file: string;
  severity: "error" | "warning" | "suggestion";
  message: string;
}

export interface TestResult {
  lintOk: boolean;
  buildOk: boolean;
  featuresComplete: boolean;
}

export interface DeployArtifact {
  url: string;
  readmePath: string;
  summary: string;
  files: string[];
}

export interface PipelineResult {
  idea: IdeaArtifact;
  design: DesignArtifact;
  build: BuildArtifact;
  review: ReviewArtifact;
  deploy: DeployArtifact;
}
