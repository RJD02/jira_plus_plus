export const METADATA_OVERVIEW_QUERY = `
  query DesignerMetadataOverview($runsLimit: Int) {
    metadataEndpoints {
      id
      sourceId
      name
      description
      verb
      url
      authPolicy
      domain
      labels
      config
      detectedVersion
      versionHint
      capabilities
      deletedAt
      deletionReason
      runs(limit: 5) {
        id
        status
        requestedAt
        startedAt
        completedAt
        error
      }
    }
    metadataCollectionRuns(limit: $runsLimit) {
      id
      status
      requestedAt
      startedAt
      completedAt
      error
      endpoint {
        id
        name
      }
    }
    metadataEndpointTemplates {
      id
      family
      title
      vendor
      description
      domain
      categories
      protocols
      versions
      descriptorVersion
      minVersion
      maxVersion
      defaultPort
      driver
      docsUrl
      agentPrompt
      defaultLabels
      fields {
        key
        label
        required
        valueType
        semantic
        description
        placeholder
        helpText
        options { label value description }
        regex
        min
        max
        defaultValue
        advanced
        sensitive
        dependsOn
        dependsValue
        visibleWhen { field values }
      }
      capabilities { key label description }
      sampleConfig
      connection { urlTemplate defaultVerb }
      probing {
        fallbackMessage
        methods {
          key
          label
          strategy
          statement
          description
          requires
          returnsVersion
          returnsCapabilities
        }
      }
    }
  }
`;

export const REGISTER_METADATA_ENDPOINT_MUTATION = `
  mutation DesignerRegisterMetadataEndpoint($input: MetadataEndpointInput!) {
    registerMetadataEndpoint(input: $input) {
      id
    }
  }
`;

export const TRIGGER_METADATA_COLLECTION_MUTATION = `
  mutation DesignerTriggerMetadataCollection($input: MetadataCollectionRequestInput!) {
    triggerMetadataCollection(input: $input) {
      id
      status
    }
  }
`;

export const TEST_METADATA_ENDPOINT_MUTATION = `
  mutation DesignerTestMetadataEndpoint($input: MetadataEndpointInput!) {
    testMetadataEndpoint(input: $input) {
      success
      message
      detectedVersion
      capabilities
      details
    }
  }
`;

export const DELETE_METADATA_ENDPOINT_MUTATION = `
  mutation DesignerDeleteMetadataEndpoint($id: ID!, $reason: String) {
    deleteMetadataEndpoint(id: $id, reason: $reason) {
      id
      deletedAt
      deletionReason
    }
  }
`;

export const PREVIEW_METADATA_DATASET_MUTATION = `
  mutation DesignerPreviewMetadataDataset($id: ID!, $limit: Int) {
    previewMetadataDataset(id: $id, limit: $limit) {
      sampledAt
      rows
    }
  }
`;
