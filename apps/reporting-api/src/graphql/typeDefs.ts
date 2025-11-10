import { gql } from "graphql-tag";

export const typeDefs = gql`
  scalar DateTime

  type Health {
    status: String!
    version: String!
  }

  type ReportDefinition {
    id: ID!
    slug: String!
    name: String!
    description: String
    type: String!
    personaTags: [String!]!
    createdAt: DateTime!
    updatedAt: DateTime!
    currentVersion: ReportVersion
    versions: [ReportVersion!]!
  }

  type ReportVersion {
    id: ID!
    status: String!
    queryTemplate: String
    defaultFilters: JSON
    notes: String
    createdAt: DateTime!
    publishedAt: DateTime
    tenantId: String!
  }

  type ReportRun {
    id: ID!
    reportVersionId: ID!
    tenantId: String!
    status: String!
    executedAt: DateTime!
    durationMs: Int!
    cacheHit: Boolean!
    filterHash: String
    filtersUsed: JSON
    payload: JSON
    error: String
    workflowId: String
    temporalRunId: String
  }

  type CatalogDatasetField {
    name: String!
    type: String!
    description: String
  }

  type CatalogDataset {
    id: ID!
    displayName: String!
    description: String
    source: String
    fields: [CatalogDatasetField!]!
  }

  type DashboardTile {
    id: ID!
    reportDefinitionId: ID!
    reportVersionId: ID
    position: JSON
    size: JSON
    tileOverrides: JSON
  }

  type DashboardVersion {
    id: ID!
    status: String!
    layout: JSON!
    publishedAt: DateTime
    createdAt: DateTime!
    tiles: [DashboardTile!]!
  }

  type ReportDashboard {
    id: ID!
    slug: String!
    name: String!
    description: String
    personaTags: [String!]!
    createdAt: DateTime!
    updatedAt: DateTime!
    currentVersion: DashboardVersion
    versions: [DashboardVersion!]!
  }

  input CreateReportDashboardInput {
    slug: String
    name: String!
    description: String
    personaTags: [String!]
  }

  input CreateDashboardVersionInput {
    dashboardId: ID!
    layout: JSON!
    status: String
  }

  input AddDashboardTileInput {
    dashboardVersionId: ID!
    reportDefinitionId: ID!
    reportVersionId: ID
    position: JSON
    size: JSON
    tileOverrides: JSON
  }

  input RunReportVersionInput {
    reportVersionId: ID!
    filters: JSON
  }

  input ReportRunFilterInput {
    status: String
    reportVersionId: ID
  }

  type AgentSuggestion {
    id: ID!
    title: String!
    summary: String!
    query: String!
    filters: JSON
    datasetId: ID
    persona: String
  }

  type AgentMessage {
    id: ID!
    role: String!
    content: String!
    suggestions: [AgentSuggestion!]
    createdAt: DateTime!
  }

  type AgentConversation {
    id: ID!
    persona: String
    status: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    lastMessageAt: DateTime
  }

  type AgentConversationDetail {
    conversation: AgentConversation!
    messages: [AgentMessage!]!
  }

  type AgentDesignPayload {
    reflectionId: ID!
    suggestions: [AgentSuggestion!]!
  }

  input AgentDesignInput {
    prompt: String!
    datasetIds: [ID!]
    persona: String
    conversationId: ID!
  }

  input StartAgentConversationInput {
    persona: String
  }

  scalar JSON

  type Query {
    health: Health!
    reportDefinitions: [ReportDefinition!]!
    reportDefinition(id: ID!): ReportDefinition
    reportDefinitionBySlug(slug: String!): ReportDefinition
    reportVersions(definitionId: ID!): [ReportVersion!]!
    reportDashboards: [ReportDashboard!]!
    reportDashboard(id: ID!): ReportDashboard
    dashboardVersion(id: ID!): DashboardVersion
    reportRuns(filter: ReportRunFilterInput): [ReportRun!]!
    catalogDatasets: [CatalogDataset!]!
    catalogDataset(id: ID!): CatalogDataset
    agentConversations: [AgentConversation!]!
    agentConversation(id: ID!): AgentConversationDetail
  }

  input CreateReportDefinitionInput {
    slug: String
    name: String!
    description: String
    type: String
    personaTags: [String!]
    scopePolicy: JSON
    filterSchema: JSON
    visualisationConfig: JSON
  }

  input CreateReportVersionInput {
    definitionId: ID!
    status: String
    queryTemplate: String
    defaultFilters: JSON
    notes: String
  }

  type Mutation {
    createReportDefinition(input: CreateReportDefinitionInput!): ReportDefinition!
    createReportVersion(input: CreateReportVersionInput!): ReportVersion!
    publishReportVersion(id: ID!): ReportDefinition!
    createReportDashboard(input: CreateReportDashboardInput!): ReportDashboard!
    createDashboardVersion(input: CreateDashboardVersionInput!): DashboardVersion!
    addDashboardTile(input: AddDashboardTileInput!): DashboardTile!
    publishDashboardVersion(id: ID!): ReportDashboard!
    runReportVersion(input: RunReportVersionInput!): ReportRun!
    agentDesign(input: AgentDesignInput!): AgentDesignPayload!
    startAgentConversation(input: StartAgentConversationInput): AgentDesignPayload!
  }
`;
