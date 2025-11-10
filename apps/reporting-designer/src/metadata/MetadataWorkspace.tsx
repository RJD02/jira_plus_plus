import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { IconType } from "react-icons";
import {
  LuEllipsis,
  LuHistory,
  LuNetwork,
  LuRefreshCcw,
  LuSearch,
  LuSquarePlus,
  LuTable,
} from "react-icons/lu";
import { formatDateTime, formatPreviewValue, formatRelativeTime } from "../lib/format";
import { fetchMetadataGraphQL } from "./api";
import {
  METADATA_OVERVIEW_QUERY,
  PREVIEW_METADATA_DATASET_MUTATION,
  REGISTER_METADATA_ENDPOINT_MUTATION,
  TEST_METADATA_ENDPOINT_MUTATION,
  TRIGGER_METADATA_COLLECTION_MUTATION,
} from "./queries";
import type {
  CatalogDataset,
  DatasetPreviewResult,
  MetadataCollectionRunSummary,
  MetadataEndpointSummary,
  MetadataEndpointTemplate,
  MetadataEndpointTemplateField,
  MetadataEndpointTestResult,
} from "./types";
import { parseListInput, previewTableColumns } from "./utils";

type MetadataWorkspaceProps = {
  metadataEndpoint: string | null;
  catalogDatasets: CatalogDataset[];
  selectedDatasetIds: string[];
  toggleDatasetSelection: (datasetId: string) => void;
};

type MetadataSection = "catalog" | "endpoints" | "collections";
type MetadataView = "overview" | "endpoint-register";
type TemplateFamily = "JDBC" | "HTTP" | "STREAM";

type MetadataNavEntry =
  | { id: MetadataSection; type: "section"; label: string; description: string; icon: IconType }
  | { id: "endpoint-register"; type: "page"; label: string; description: string; icon: IconType };

const metadataNavItems: MetadataNavEntry[] = [
  { id: "catalog", type: "section" as const, label: "Catalog", description: "Datasets & schema", icon: LuTable },
  { id: "endpoints", type: "section" as const, label: "Endpoints", description: "Sources & templates", icon: LuNetwork },
  { id: "collections", type: "section" as const, label: "Collections", description: "Run history", icon: LuHistory },
  { id: "endpoint-register", type: "page" as const, label: "Register endpoint", description: "Onboard a new source", icon: LuSquarePlus },
];

const metadataSectionTabs: Array<{ id: MetadataSection; label: string }> = [
  { id: "catalog", label: "Catalog" },
  { id: "endpoints", label: "Endpoints" },
  { id: "collections", label: "Collections" },
];

const templateFamilies: Array<{ id: TemplateFamily; label: string; description: string }> = [
  { id: "JDBC", label: "JDBC sources", description: "Warehouses, data lakes, transactional stores." },
  { id: "HTTP", label: "HTTP APIs", description: "SaaS systems like Jira, Confluence, ServiceNow." },
  { id: "STREAM", label: "Streaming", description: "Kafka, Confluent, and event hubs." },
];

const statusStyles: Record<
  MetadataCollectionRunSummary["status"],
  { badge: string; dot: string }
> = {
  QUEUED: {
    badge: "bg-amber-50 text-amber-700 border border-amber-200",
    dot: "bg-amber-500",
  },
  RUNNING: {
    badge: "bg-sky-50 text-sky-700 border border-sky-200",
    dot: "bg-sky-500 animate-pulse",
  },
  SUCCEEDED: {
    badge: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    dot: "bg-emerald-500",
  },
  FAILED: {
    badge: "bg-rose-50 text-rose-700 border border-rose-200",
    dot: "bg-rose-500",
  },
};

export function MetadataWorkspace({
  metadataEndpoint,
  catalogDatasets,
  selectedDatasetIds,
  toggleDatasetSelection,
}: MetadataWorkspaceProps) {
  const [metadataEndpoints, setMetadataEndpoints] = useState<MetadataEndpointSummary[]>([]);
  const [metadataRuns, setMetadataRuns] = useState<MetadataCollectionRunSummary[]>([]);
  const [metadataTemplates, setMetadataTemplates] = useState<MetadataEndpointTemplate[]>([]);
  const [metadataTemplateValues, setMetadataTemplateValues] = useState<Record<string, string>>({});
  const [metadataTemplateFamily, setMetadataTemplateFamily] = useState<TemplateFamily>("JDBC");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [metadataEndpointName, setMetadataEndpointName] = useState("");
  const [metadataEndpointDescription, setMetadataEndpointDescription] = useState("");
  const [metadataEndpointLabels, setMetadataEndpointLabels] = useState("");
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataRefreshToken, setMetadataRefreshToken] = useState(0);
  const [metadataSection, setMetadataSection] = useState<MetadataSection>("catalog");
  const [metadataView, setMetadataView] = useState<MetadataView>("overview");
  const [metadataCatalogSearch, setMetadataCatalogSearch] = useState("");
  const [metadataCatalogEndpointFilter, setMetadataCatalogEndpointFilter] = useState<string>("all");
  const [metadataCatalogLabelFilter, setMetadataCatalogLabelFilter] = useState<string>("all");
  const [metadataCatalogSelection, setMetadataCatalogSelection] = useState<string | null>(null);
  const [metadataMutationError, setMetadataMutationError] = useState<string | null>(null);
  const [metadataRegistering, setMetadataRegistering] = useState(false);
  const [metadataRunOverrides, setMetadataRunOverrides] = useState<Record<string, string>>({});
  const [metadataTesting, setMetadataTesting] = useState(false);
  const [metadataTestResult, setMetadataTestResult] = useState<MetadataEndpointTestResult | null>(null);
  const [metadataCatalogPreviewRows, setMetadataCatalogPreviewRows] = useState<Record<string, DatasetPreviewResult>>({});
  const [metadataCatalogPreviewErrors, setMetadataCatalogPreviewErrors] = useState<Record<string, string>>({});
  const [metadataCatalogPreviewingId, setMetadataCatalogPreviewingId] = useState<string | null>(null);
  const [metadataEndpointDetailId, setMetadataEndpointDetailId] = useState<string | null>(null);
  const [metadataDatasetDetailId, setMetadataDatasetDetailId] = useState<string | null>(null);
  const [sectionNavCollapsed, setSectionNavCollapsed] = useState(false);

  const metadataEndpointLookup = useMemo(() => {
    const map = new Map<string, MetadataEndpointSummary>();
    metadataEndpoints.forEach((endpoint) => {
      map.set(endpoint.id, endpoint);
      if (endpoint.sourceId) {
        map.set(endpoint.sourceId, endpoint);
      }
    });
    return map;
  }, [metadataEndpoints]);

  const metadataDatasetsByEndpointId = useMemo(() => {
    const map = new Map<string, CatalogDataset[]>();
    catalogDatasets.forEach((dataset) => {
      if (!dataset.sourceEndpointId) {
        return;
      }
      const owner = metadataEndpointLookup.get(dataset.sourceEndpointId);
      if (!owner) {
        return;
      }
      map.set(owner.id, [...(map.get(owner.id) ?? []), dataset]);
    });
    return map;
  }, [catalogDatasets, metadataEndpointLookup]);

  const metadataCatalogFilteredDatasets = useMemo(() => {
    const query = metadataCatalogSearch.trim().toLowerCase();
    return catalogDatasets.filter((dataset) => {
      const owner = dataset.sourceEndpointId ? metadataEndpointLookup.get(dataset.sourceEndpointId) : null;
      const matchesEndpoint =
        metadataCatalogEndpointFilter === "all" ||
        (metadataCatalogEndpointFilter === "unlinked" && !owner) ||
        owner?.id === metadataCatalogEndpointFilter;
      if (!matchesEndpoint) {
        return false;
      }
      const matchesLabel =
        metadataCatalogLabelFilter === "all" ||
        (metadataCatalogLabelFilter === "unlabeled" && !(dataset.labels?.length)) ||
        Boolean(dataset.labels?.includes(metadataCatalogLabelFilter));
      if (!matchesLabel) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        dataset.displayName,
        dataset.description,
        dataset.source,
        owner?.name,
        ...(dataset.labels ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [
    catalogDatasets,
    metadataCatalogEndpointFilter,
    metadataCatalogLabelFilter,
    metadataCatalogSearch,
    metadataEndpointLookup,
  ]);

  const metadataCatalogSelectedDataset = useMemo(() => {
    if (metadataCatalogSelection) {
      const match = catalogDatasets.find((dataset) => dataset.id === metadataCatalogSelection);
      if (match) {
        return match;
      }
    }
    return metadataCatalogFilteredDatasets[0] ?? catalogDatasets[0] ?? null;
  }, [catalogDatasets, metadataCatalogFilteredDatasets, metadataCatalogSelection]);

  useEffect(() => {
    if (!metadataCatalogSelectedDataset) {
      setMetadataCatalogSelection(metadataCatalogFilteredDatasets[0]?.id ?? null);
    }
  }, [metadataCatalogFilteredDatasets, metadataCatalogSelectedDataset]);

  const metadataCatalogLabelOptions = useMemo(() => {
    const labels = new Set<string>();
    catalogDatasets.forEach((dataset) => dataset.labels?.forEach((label) => labels.add(label)));
    return Array.from(labels).sort();
  }, [catalogDatasets]);

  const metadataEndpointDetail = useMemo(
    () => (metadataEndpointDetailId ? metadataEndpoints.find((endpoint) => endpoint.id === metadataEndpointDetailId) ?? null : null),
    [metadataEndpointDetailId, metadataEndpoints],
  );

  const metadataDatasetDetail = useMemo(
    () => (metadataDatasetDetailId ? catalogDatasets.find((dataset) => dataset.id === metadataDatasetDetailId) ?? null : null),
    [catalogDatasets, metadataDatasetDetailId],
  );

  const isFieldVisible = useCallback(
    (field: MetadataEndpointTemplateField) => {
      if (!field.visibleWhen || field.visibleWhen.length === 0) {
        return true;
      }
      return field.visibleWhen.every((rule) => {
        const current = metadataTemplateValues[rule.field] ?? "";
        return rule.values.includes(current);
      });
    },
    [metadataTemplateValues],
  );

  const isFieldRequired = useCallback(
    (field: MetadataEndpointTemplateField) => {
      if (!field.dependsOn) {
        return field.required;
      }
      const dependsValue = metadataTemplateValues[field.dependsOn];
      if (field.dependsValue === null || field.dependsValue === undefined) {
        return field.required && Boolean(dependsValue);
      }
      return field.required && dependsValue === field.dependsValue;
    },
    [metadataTemplateValues],
  );

  const metadataLatestRunByEndpoint = useMemo(() => {
    const map = new Map<string, MetadataCollectionRunSummary>();
    metadataEndpoints.forEach((endpoint) => {
      if (!endpoint.runs.length) {
        return;
      }
      const sorted = [...endpoint.runs].sort(
        (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
      );
      map.set(endpoint.id, sorted[0]);
    });
    return map;
  }, [metadataEndpoints]);

  const metadataTemplatesByFamily = useMemo(() => {
    return metadataTemplates.reduce<Record<TemplateFamily, MetadataEndpointTemplate[]>>(
      (groups, template) => {
        const family = template.family;
        groups[family] = [...(groups[family] ?? []), template];
        return groups;
      },
      { JDBC: [], HTTP: [], STREAM: [] },
    );
  }, [metadataTemplates]);

  const filteredTemplates = metadataTemplatesByFamily[metadataTemplateFamily] ?? [];

  const handleOpenRegistration = useCallback(
    (templateId?: string, familyOverride?: TemplateFamily) => {
      let targetFamily = familyOverride ?? metadataTemplateFamily;
      let nextTemplateId = templateId ?? null;
      if (templateId) {
        const explicitTemplate = metadataTemplates.find((template) => template.id === templateId);
        if (explicitTemplate) {
          targetFamily = explicitTemplate.family;
        }
      }
      if (targetFamily !== metadataTemplateFamily) {
        setMetadataTemplateFamily(targetFamily);
      }
      if (!nextTemplateId) {
        const candidates = metadataTemplatesByFamily[targetFamily] ?? [];
        nextTemplateId = candidates[0]?.id ?? metadataTemplates[0]?.id ?? null;
      }
      if (nextTemplateId) {
        setSelectedTemplateId(nextTemplateId);
      }
      setMetadataView("endpoint-register");
    },
    [metadataTemplateFamily, metadataTemplates, metadataTemplatesByFamily],
  );

  const handleCloseRegistration = useCallback(() => {
    setMetadataView("overview");
    setMetadataMutationError(null);
    setMetadataTestResult(null);
  }, []);
  const selectedTemplate = useMemo(() => {
    if (selectedTemplateId) {
      const match = metadataTemplates.find((template) => template.id === selectedTemplateId);
      if (match) {
        return match;
      }
    }
    return filteredTemplates[0] ?? metadataTemplates[0] ?? null;
  }, [metadataTemplates, selectedTemplateId, filteredTemplates]);

  useEffect(() => {
    if (metadataView !== "endpoint-register") {
      return;
    }
    const familyTemplates = metadataTemplatesByFamily[metadataTemplateFamily] ?? [];
    if (!familyTemplates.length) {
      setSelectedTemplateId((prev) => (prev === null ? prev : null));
      return;
    }
    if (!familyTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(familyTemplates[0].id);
    }
  }, [metadataTemplateFamily, metadataTemplatesByFamily, metadataView, selectedTemplateId]);

  useEffect(() => {
    if (!selectedTemplate) {
      setMetadataTemplateValues((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }
    setMetadataTemplateValues((prev) => {
      const next = selectedTemplate.fields.reduce<Record<string, string>>((acc, field) => {
        acc[field.key] = prev[field.key] ?? "";
        return acc;
      }, {});
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);
      const sameLength = prevKeys.length === nextKeys.length;
      const sameValues = sameLength && nextKeys.every((key) => prev[key] === next[key]);
      return sameValues ? prev : next;
    });
  }, [selectedTemplate]);

  const sortedMetadataRuns = useMemo(() => {
    return [...metadataRuns].sort(
      (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
    );
  }, [metadataRuns]);

  const refreshMetadataWorkspace = useCallback(() => {
    setMetadataRefreshToken((prev) => prev + 1);
  }, []);

  const handleRequirementChange = useCallback((key: string, value: string) => {
    setMetadataTemplateValues((prev) => ({ ...prev, [key]: value }));
    setMetadataTestResult(null);
  }, []);

  const handlePreviewMetadataDataset = useCallback(
    async (datasetId: string, options?: { silent?: boolean; limit?: number }) => {
      if (!datasetId) {
        return;
      }
      if (!metadataEndpoint) {
        setMetadataCatalogPreviewErrors((prev) => ({
          ...prev,
          [datasetId]: "Configure VITE_METADATA_GRAPHQL_ENDPOINT to preview datasets.",
        }));
        return;
      }
      const silent = options?.silent ?? false;
      const limit = options?.limit ?? 20;
      if (!silent) {
        setMetadataCatalogPreviewingId(datasetId);
      }
      setMetadataCatalogPreviewErrors((prev) => ({ ...prev, [datasetId]: "" }));
      try {
        const payload = await fetchMetadataGraphQL<{
          previewMetadataDataset: DatasetPreviewResult | null;
        }>(metadataEndpoint, PREVIEW_METADATA_DATASET_MUTATION, { id: datasetId, limit });
        setMetadataCatalogPreviewRows((prev) => ({
          ...prev,
          [datasetId]: payload.previewMetadataDataset ?? { rows: [] },
        }));
      } catch (error) {
        setMetadataCatalogPreviewErrors((prev) => ({
          ...prev,
          [datasetId]: error instanceof Error ? error.message : String(error),
        }));
      } finally {
        if (!silent) {
          setMetadataCatalogPreviewingId((prev) => (prev === datasetId ? null : prev));
        }
      }
    },
    [metadataEndpoint],
  );

  const handleRegisterMetadataEndpoint = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedTemplate) {
        setMetadataMutationError("Select an endpoint template before registering.");
        return;
      }
      if (!metadataEndpoint) {
        setMetadataMutationError("Configure VITE_METADATA_GRAPHQL_ENDPOINT to register endpoints.");
        return;
      }
      setMetadataRegistering(true);
      setMetadataMutationError(null);
      try {
        const userLabels = parseListInput(metadataEndpointLabels);
        const labels = Array.from(new Set([...(selectedTemplate.defaultLabels ?? []), ...userLabels]));
        const configPayload: Record<string, unknown> = {
          templateId: selectedTemplate.id,
          parameters: metadataTemplateValues,
        };
        await fetchMetadataGraphQL(metadataEndpoint, REGISTER_METADATA_ENDPOINT_MUTATION, {
          input: {
            name: metadataEndpointName.trim() || `${selectedTemplate.title} endpoint`,
            description: metadataEndpointDescription.trim() || selectedTemplate.description || null,
            verb: selectedTemplate.family === "HTTP" ? "GET" : "POST",
            url: null,
            domain: selectedTemplate.domain ?? undefined,
            labels: labels.length ? labels : undefined,
            config: configPayload,
          },
        });
        setMetadataTemplateValues({});
        setMetadataEndpointName("");
        setMetadataEndpointDescription("");
        setMetadataEndpointLabels("");
        setMetadataTestResult(null);
        refreshMetadataWorkspace();
      } catch (error) {
        setMetadataMutationError(error instanceof Error ? error.message : String(error));
      } finally {
        setMetadataRegistering(false);
      }
    },
    [
      metadataEndpoint,
      metadataEndpointDescription,
      metadataEndpointLabels,
      metadataEndpointName,
      metadataTemplateValues,
      refreshMetadataWorkspace,
      selectedTemplate,
    ],
  );

  const handleTestMetadataEndpoint = useCallback(async () => {
    if (!selectedTemplate) {
      setMetadataMutationError("Select an endpoint template before testing.");
      return;
    }
    if (!metadataEndpoint) {
      setMetadataMutationError("Configure VITE_METADATA_GRAPHQL_ENDPOINT to test endpoints.");
      return;
    }
    setMetadataTesting(true);
    setMetadataTestResult(null);
    try {
      const userLabels = parseListInput(metadataEndpointLabels);
      const configPayload: Record<string, unknown> = {
        templateId: selectedTemplate.id,
        parameters: metadataTemplateValues,
      };
      const payload = await fetchMetadataGraphQL<{
        testMetadataEndpoint: MetadataEndpointTestResult;
      }>(metadataEndpoint, TEST_METADATA_ENDPOINT_MUTATION, {
        input: {
          name: metadataEndpointName.trim() || `${selectedTemplate.title} endpoint`,
          description: metadataEndpointDescription.trim() || selectedTemplate.description || null,
          verb: selectedTemplate.family === "HTTP" ? "GET" : "POST",
          url: null,
          domain: selectedTemplate.domain ?? undefined,
          labels: userLabels.length ? userLabels : undefined,
          config: configPayload,
        },
      });
      const result = payload.testMetadataEndpoint;
      setMetadataTestResult(result);
    } catch (error) {
      setMetadataTestResult({
        success: false,
        message: error instanceof Error ? error.message : String(error),
        capabilities: [],
      });
    } finally {
      setMetadataTesting(false);
    }
  }, [
    metadataEndpoint,
    metadataEndpointDescription,
    metadataEndpointLabels,
    metadataEndpointName,
    metadataTemplateValues,
    selectedTemplate,
  ]);

  const handleTriggerMetadataRun = useCallback(
    async (endpointId: string) => {
      if (!metadataEndpoint) {
        setMetadataMutationError("Configure VITE_METADATA_GRAPHQL_ENDPOINT to trigger collections.");
        return;
      }
      setMetadataMutationError(null);
      try {
        const override = metadataRunOverrides[endpointId];
        const schemas = override
          ? override
              .split(",")
              .map((schema) => schema.trim())
              .filter(Boolean)
          : undefined;
        await fetchMetadataGraphQL(metadataEndpoint, TRIGGER_METADATA_COLLECTION_MUTATION, {
          input: {
            endpointId,
            schemas,
          },
        });
        refreshMetadataWorkspace();
      } catch (error) {
        setMetadataMutationError(error instanceof Error ? error.message : String(error));
      }
    },
    [metadataEndpoint, metadataRunOverrides, refreshMetadataWorkspace],
  );

  useEffect(() => {
    if (!selectedTemplate) {
      return;
    }
    setMetadataTemplateValues((prev) => {
      const next: Record<string, string> = {};
      selectedTemplate.fields.forEach((field) => {
        if (prev[field.key] !== undefined) {
          next[field.key] = prev[field.key];
          return;
        }
        if (field.defaultValue !== null && field.defaultValue !== undefined) {
          next[field.key] = field.defaultValue;
          return;
        }
        if (field.valueType === "PORT" && selectedTemplate.defaultPort) {
          next[field.key] = String(selectedTemplate.defaultPort);
          return;
        }
        if (field.valueType === "BOOLEAN") {
          next[field.key] = "false";
          return;
        }
        next[field.key] = "";
      });
      return next;
    });
    setMetadataEndpointName((prev) => {
      if (prev.trim().length > 0) {
        return prev;
      }
      return `${selectedTemplate.title} endpoint`;
    });
    setMetadataEndpointDescription((prev) => {
      if (prev.trim().length > 0 || !selectedTemplate.description) {
        return prev;
      }
      return selectedTemplate.description;
    });
    setMetadataEndpointLabels((prev) => {
      if (prev.trim().length > 0) {
        return prev;
      }
      return (selectedTemplate.defaultLabels ?? []).join(", ");
    });
    setMetadataTestResult(null);
  }, [selectedTemplate]);

  useEffect(() => {
    if (!metadataTemplates.length) {
      return;
    }
    setSelectedTemplateId((prev) => prev ?? metadataTemplates[0].id);
  }, [metadataTemplates]);

  useEffect(() => {
    if (!filteredTemplates.length) {
      return;
    }
    if (!filteredTemplates.some((template) => template.id === selectedTemplateId)) {
      setSelectedTemplateId(filteredTemplates[0].id);
    }
  }, [filteredTemplates, metadataTemplateFamily, selectedTemplateId]);

  useEffect(() => {
    if (!metadataEndpoint) {
      setMetadataError("Configure VITE_METADATA_GRAPHQL_ENDPOINT for metadata workspace access.");
      setMetadataLoading(false);
      return;
    }
    const controller = new AbortController();
    const loadMetadataOverview = async () => {
      setMetadataLoading(true);
      setMetadataError(null);
      try {
        const data = await fetchMetadataGraphQL<{
          metadataEndpoints: MetadataEndpointSummary[];
          metadataCollectionRuns: MetadataCollectionRunSummary[];
          metadataEndpointTemplates: MetadataEndpointTemplate[];
        }>(metadataEndpoint, METADATA_OVERVIEW_QUERY, { runsLimit: 30 }, controller.signal);
        if (controller.signal.aborted) {
          return;
        }
        setMetadataEndpoints(data.metadataEndpoints ?? []);
        setMetadataRuns(data.metadataCollectionRuns ?? []);
        setMetadataTemplates(data.metadataEndpointTemplates ?? []);
      } catch (error) {
        if (!controller.signal.aborted) {
          setMetadataError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!controller.signal.aborted) {
          setMetadataLoading(false);
        }
      }
    };

    void loadMetadataOverview();
    return () => controller.abort();
  }, [metadataEndpoint, metadataRefreshToken]);

  useEffect(() => {
    if (!metadataCatalogSelectedDataset) {
      return;
    }
    const datasetId = metadataCatalogSelectedDataset.id;
    if (metadataCatalogPreviewRows[datasetId]) {
      return;
    }
    if (metadataCatalogPreviewingId && metadataCatalogPreviewingId !== datasetId) {
      return;
    }
    void handlePreviewMetadataDataset(datasetId, { silent: true });
  }, [
    handlePreviewMetadataDataset,
    metadataCatalogPreviewRows,
    metadataCatalogSelectedDataset,
    metadataCatalogPreviewingId,
  ]);

  const renderCatalogSection = () => {
    const endpointFilterOptions = [
      { value: "all", label: "All endpoints" },
      { value: "unlinked", label: "Unlinked datasets" },
      ...metadataEndpoints.map((endpoint) => ({ value: endpoint.id, label: endpoint.name })),
    ];
    const labelFilterOptions = [
      { value: "all", label: "All labels" },
      { value: "unlabeled", label: "Unlabeled" },
      ...metadataCatalogLabelOptions.map((label) => ({ value: label, label })),
    ];
    const activeFilterChips: Array<{ label: string; onClear: () => void }> = [];
    if (metadataCatalogSearch.trim().length > 0) {
      activeFilterChips.push({
        label: `Search · ${metadataCatalogSearch.trim()}`,
        onClear: () => setMetadataCatalogSearch(""),
      });
    }
    if (metadataCatalogEndpointFilter !== "all") {
      const endpointLabel =
        endpointFilterOptions.find((option) => option.value === metadataCatalogEndpointFilter)?.label ?? metadataCatalogEndpointFilter;
      activeFilterChips.push({
        label: `Endpoint · ${endpointLabel}`,
        onClear: () => setMetadataCatalogEndpointFilter("all"),
      });
    }
    if (metadataCatalogLabelFilter !== "all") {
      const labelName =
        labelFilterOptions.find((option) => option.value === metadataCatalogLabelFilter)?.label ?? metadataCatalogLabelFilter;
      activeFilterChips.push({
        label: `Label · ${labelName}`,
        onClear: () => setMetadataCatalogLabelFilter("all"),
      });
    }
    const selectedDatasetPreview = metadataCatalogSelectedDataset
      ? metadataCatalogPreviewRows[metadataCatalogSelectedDataset.id]
      : undefined;
    const selectedDatasetPreviewError = metadataCatalogSelectedDataset
      ? metadataCatalogPreviewErrors[metadataCatalogSelectedDataset.id]
      : undefined;
    const selectedDatasetEndpoint = metadataCatalogSelectedDataset?.sourceEndpointId
      ? metadataEndpointLookup.get(metadataCatalogSelectedDataset.sourceEndpointId) ?? null
      : null;
    const isPreviewingActive =
      Boolean(metadataCatalogSelectedDataset) && metadataCatalogPreviewingId === metadataCatalogSelectedDataset?.id;
    const canPreviewDataset = Boolean(metadataCatalogSelectedDataset?.sourceEndpointId && selectedDatasetEndpoint?.url);
    const previewBlockReason = !canPreviewDataset && metadataCatalogSelectedDataset
      ? "Link this dataset to a registered endpoint before running previews."
      : null;
    const previewRows: Array<Record<string, unknown>> = selectedDatasetPreview?.rows ?? [];
    const previewColumns = previewTableColumns(previewRows);
    return (
      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Datasets</p>
            <p className="text-xs text-slate-500">Search catalog entries ingested from the metadata service.</p>
          </div>
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Filter</p>
              <div className="relative mt-2">
                <LuSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="metadata-catalog-search"
                  value={metadataCatalogSearch}
                  onChange={(event) => setMetadataCatalogSearch(event.target.value)}
                  placeholder="Search name, label, or source"
                  className="w-full rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              {activeFilterChips.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeFilterChips.map((chip) => (
                    <button
                      key={chip.label}
                      type="button"
                      onClick={chip.onClear}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {chip.label}
                      <span aria-hidden="true">×</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setMetadataCatalogSearch("");
                      setMetadataCatalogEndpointFilter("all");
                      setMetadataCatalogLabelFilter("all");
                    }}
                    className="rounded-full border border-transparent px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 hover:text-slate-900 dark:text-slate-300"
                  >
                    Clear all
                  </button>
                </div>
              ) : null}
            </div>
            <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Endpoint</label>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={metadataCatalogEndpointFilter}
                onChange={(event) => setMetadataCatalogEndpointFilter(event.target.value)}
              >
                {endpointFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
              <label className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Label</label>
              <select
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={metadataCatalogLabelFilter}
                onChange={(event) => setMetadataCatalogLabelFilter(event.target.value)}
              >
                {labelFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="scrollbar-thin mt-4 max-h-[calc(100vh-320px)] overflow-y-auto pr-1">
            {metadataCatalogFilteredDatasets.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 dark:border-slate-700">
                No datasets match that query.
              </p>
            ) : (
              metadataCatalogFilteredDatasets.map((dataset) => {
                const isActive = metadataCatalogSelectedDataset?.id === dataset.id;
                const owner = dataset.sourceEndpointId ? metadataEndpointLookup.get(dataset.sourceEndpointId) : null;
                return (
                  <button
                    key={dataset.id}
                    type="button"
                    onClick={() => setMetadataCatalogSelection(dataset.id)}
                    className={`mb-2 flex w-full flex-col rounded-2xl border px-3 py-2 text-left transition ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white shadow dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    }`}
                  >
                    <span className="text-sm font-semibold">{dataset.displayName}</span>
                    <span className="text-[11px] uppercase tracking-[0.3em] text-slate-400">
                      {owner ? `Endpoint · ${owner.name}` : "Unlinked"}
                    </span>
                    <span className="text-[10px] uppercase tracking-[0.3em] text-slate-400">
                      {dataset.labels?.length ? `Labels · ${dataset.labels.slice(0, 3).join(", ")}` : dataset.source ?? dataset.id}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {metadataCatalogSelectedDataset ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xl font-semibold text-slate-900 dark:text-white">{metadataCatalogSelectedDataset.displayName}</p>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{metadataCatalogSelectedDataset.id}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => toggleDatasetSelection(metadataCatalogSelectedDataset.id)}
                    className={`rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                      selectedDatasetIds.includes(metadataCatalogSelectedDataset.id)
                        ? "border-rose-300 text-rose-600 hover:border-rose-400 hover:text-rose-700 dark:border-rose-400/60 dark:text-rose-200"
                        : "border-emerald-300 text-emerald-600 hover:border-emerald-400 hover:text-emerald-700 dark:border-emerald-400/60 dark:text-emerald-200"
                    }`}
                  >
                    {selectedDatasetIds.includes(metadataCatalogSelectedDataset.id) ? "Unscope" : "Scope dataset"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetadataDatasetDetailId(metadataCatalogSelectedDataset.id)}
                    className="rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-200"
                  >
                    View detail
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePreviewMetadataDataset(metadataCatalogSelectedDataset.id)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                      canPreviewDataset
                        ? "border-slate-300 text-slate-600 hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-200"
                        : "border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-600"
                    }`}
                    disabled={!canPreviewDataset || isPreviewingActive}
                  >
                    {isPreviewingActive ? <LuHistory className="h-3 w-3 animate-spin" /> : <LuTable className="h-3 w-3" />}
                    {isPreviewingActive ? "Fetching…" : "Preview dataset"}
                  </button>
                </div>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">{metadataCatalogSelectedDataset.description ?? "No description provided."}</p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                <span>Endpoint · {selectedDatasetEndpoint?.name ?? "Unlinked"}</span>
                {metadataCatalogSelectedDataset.collectedAt ? (
                  <span>Collected {formatDateTime(metadataCatalogSelectedDataset.collectedAt)}</span>
                ) : null}
              </div>
              {metadataCatalogSelectedDataset.labels?.length ? (
                <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  {(metadataCatalogSelectedDataset.labels ?? []).map((label: string) => (
                    <span key={label} className="rounded-full border border-slate-300 px-2 py-0.5 dark:border-slate-600">
                      {label}
                    </span>
                  ))}
                </div>
              ) : null}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Fields</p>
                <div className="mt-3 space-y-2">
                  {metadataCatalogSelectedDataset.fields.map((field) => (
                    <div key={field.name} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{field.name}</p>
                        <span className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{field.type}</span>
                      </div>
                      {field.description ? <p className="text-xs text-slate-500 dark:text-slate-400">{field.description}</p> : null}
                    </div>
                  ))}
                  {metadataCatalogSelectedDataset.fields.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-xs text-slate-500 dark:border-slate-700">
                      No field metadata discovered yet.
                    </p>
                  ) : null}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Preview</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {selectedDatasetPreview?.sampledAt ? (
                    <span className="text-xs text-slate-500">Sampled {formatRelativeTime(selectedDatasetPreview.sampledAt)}</span>
                  ) : previewBlockReason ? (
                    <span className="text-xs text-rose-600 dark:text-rose-300">{previewBlockReason}</span>
                  ) : (
                    <span className="text-xs text-slate-500">Preview pulls 20 live rows per request.</span>
                  )}
                </div>
                {selectedDatasetPreviewError ? (
                  <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-400/60 dark:bg-rose-950/40 dark:text-rose-200">
                    {selectedDatasetPreviewError}
                  </p>
                ) : null}
                {previewRows.length ? (
                  <div className="mt-3 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-700">
                      <thead className="bg-slate-50 text-left font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        <tr>
                          {previewColumns.map((column) => (
                            <th key={column} className="px-3 py-2 uppercase tracking-[0.3em] text-[10px] text-slate-400">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, index) => (
                          <tr key={index} className="border-t border-slate-100 dark:border-slate-800">
                            {previewColumns.map((column) => (
                              <td key={column} className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                {formatPreviewValue((row as Record<string, unknown>)[column])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    {isPreviewingActive ? "Collecting sample rows…" : "No preview sampled yet. Run a preview to inspect live data."}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700">
              Select a dataset on the left to inspect its schema.
            </p>
          )}
        </section>
      </div>
    );
  };

  const renderEndpointRegistrationPage = () => (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(300px,340px),1fr]">
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Select a template</p>
            <p className="text-xs text-slate-500">Choose a family, then pick a specific connector to configure.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {templateFamilies.map((family) => (
              <button
                key={family.id}
                type="button"
                onClick={() => setMetadataTemplateFamily(family.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${
                  metadataTemplateFamily === family.id
                    ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-900"
                    : "border border-slate-300 text-slate-600 hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                {family.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {templateFamilies.find((family) => family.id === metadataTemplateFamily)?.description ?? ""}
          </p>
          <div className="space-y-2">
            {filteredTemplates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700">
                No templates found for this family yet.
              </p>
            ) : (
              filteredTemplates.map((template) => {
                const isActive = selectedTemplate?.id === template.id;
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`w-full rounded-2xl border px-3 py-2 text-left transition ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white shadow dark:border-emerald-400/70 dark:bg-emerald-500/10 dark:text-emerald-100"
                        : "border-slate-200 text-slate-700 hover:border-slate-900 dark:border-slate-700 dark:text-slate-200"
                    }`}
                  >
                    <p className="text-sm font-semibold">{template.title}</p>
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{template.vendor}</p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{template.description}</p>
                  </button>
                );
              })
            )}
          </div>
          {selectedTemplate ? (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Agent briefing</p>
              <p className="whitespace-pre-wrap">{selectedTemplate.agentPrompt ?? "Collect credentials and scope for this endpoint."}</p>
              {selectedTemplate.capabilities.length ? (
                <ul className="list-disc space-y-1 pl-4">
                  {selectedTemplate.capabilities.map((capability) => (
                    <li key={capability.key}>{capability.label}</li>
                  ))}
                </ul>
              ) : null}
              {selectedTemplate.connection?.urlTemplate ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Connection template</p>
                  <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900/90 p-3 font-mono text-[12px] text-emerald-200 dark:bg-slate-950">
                    {selectedTemplate.connection.urlTemplate}
                  </pre>
                </div>
              ) : null}
              {selectedTemplate.probing?.methods && selectedTemplate.probing.methods.length ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500">Version detection</p>
                  <ul className="mt-2 space-y-2">
                    {selectedTemplate.probing.methods.map((method) => (
                      <li key={method.key} className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {method.label} <span className="text-xs uppercase tracking-[0.3em] text-slate-400">({method.strategy})</span>
                        </p>
                        {method.description ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">{method.description}</p>
                        ) : null}
                        {method.requires && method.requires.length ? (
                          <p className="text-[11px] text-slate-500">Requires: {method.requires.join(", ")}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {selectedTemplate.probing.fallbackMessage ? (
                    <p className="mt-2 text-[11px] text-slate-500">{selectedTemplate.probing.fallbackMessage}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {!selectedTemplate ? (
            <p className="text-sm text-slate-500">Select a template to configure connection details.</p>
          ) : (
            <>
              {metadataMutationError ? (
                <p className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/50 dark:bg-rose-950/40 dark:text-rose-200">
                  {metadataMutationError}
                </p>
              ) : null}
              <form className="space-y-4" onSubmit={handleRegisterMetadataEndpoint}>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Endpoint name
                    <input
                      value={metadataEndpointName}
                      onChange={(event) => setMetadataEndpointName(event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                    Labels
                    <input
                      value={metadataEndpointLabels}
                      onChange={(event) => setMetadataEndpointLabels(event.target.value)}
                      placeholder="analytics, postgres, staging"
                      className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </label>
                </div>
                <label className="block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Description
                  <textarea
                    value={metadataEndpointDescription}
                    onChange={(event) => setMetadataEndpointDescription(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    rows={2}
                  />
                </label>
                <div className="space-y-3">
                  {selectedTemplate.fields.map((field) => {
                    if (!isFieldVisible(field)) {
                      return null;
                    }
                    const value = metadataTemplateValues[field.key] ?? field.defaultValue ?? "";
                    const required = isFieldRequired(field);
                    const commonProps = {
                      id: `template-${field.key}`,
                      value,
                      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                        handleRequirementChange(field.key, event.target.value),
                      required,
                      className:
                        "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                    };
                    const inputType =
                      field.valueType === "PASSWORD"
                        ? "password"
                        : field.valueType === "NUMBER" || field.valueType === "PORT"
                          ? "number"
                          : "text";
                    const labelId = `template-${field.key}`;
                    const advancedBadge = field.advanced ? (
                      <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-slate-400 dark:border-slate-600">
                        Advanced
                      </span>
                    ) : null;
                    let control: JSX.Element;
                    if (field.valueType === "LIST") {
                      control = <textarea {...commonProps} placeholder={field.placeholder ?? undefined} rows={2} />;
                    } else if (field.valueType === "ENUM" && field.options) {
                      control = (
                        <select {...commonProps}>
                          <option value="">Select {field.label}</option>
                          {field.options.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      );
                    } else if (field.valueType === "JSON") {
                      control = <textarea {...commonProps} placeholder={field.placeholder ?? undefined} rows={3} />;
                    } else if (field.valueType === "TEXT") {
                      control = <textarea {...commonProps} placeholder={field.placeholder ?? undefined} rows={4} />;
                    } else if (field.valueType === "BOOLEAN") {
                      const checked = (value || "").toLowerCase() === "true";
                      control = (
                        <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40">
                          <input
                            id={labelId}
                            type="checkbox"
                            className="h-4 w-4 accent-slate-900 dark:accent-emerald-500"
                            checked={checked}
                            onChange={(event) => handleRequirementChange(field.key, event.target.checked ? "true" : "false")}
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-200">
                            {checked ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      );
                    } else {
                      control = (
                        <input
                          {...commonProps}
                          type={inputType}
                          placeholder={field.placeholder ?? undefined}
                          autoComplete={field.valueType === "PASSWORD" ? "current-password" : undefined}
                        />
                      );
                    }

                    return (
                      <div key={field.key}>
                        <div className="flex items-center justify-between gap-3">
                          <label
                            htmlFor={labelId}
                            className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500"
                          >
                            {field.label}
                            {!required ? " (optional)" : ""}
                          </label>
                          {advancedBadge}
                        </div>
                        {control}
                        {field.description ? (
                          <p className="mt-1 text-[11px] text-slate-500">{field.description}</p>
                        ) : field.helpText ? (
                          <p className="mt-1 text-[11px] text-slate-500">{field.helpText}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleTestMetadataEndpoint}
                    disabled={metadataRegistering || metadataTesting}
                    className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:border-slate-900 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200"
                  >
                    {metadataTesting ? "Testing…" : "Test connection"}
                  </button>
                  <button
                    type="submit"
                    disabled={metadataRegistering}
                    className="flex-1 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-emerald-500 dark:hover:bg-emerald-400"
                  >
                    {metadataRegistering ? "Registering…" : "Register endpoint"}
                  </button>
                </div>
                {metadataTestResult ? (
                  <div
                    className={`rounded-2xl border px-3 py-3 text-xs ${
                      metadataTestResult.success
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                        : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"
                    }`}
                  >
                    <p className="text-sm font-semibold">
                      {metadataTestResult.message ??
                        (metadataTestResult.success ? "Connection parameters validated." : "Connection test failed.")}
                    </p>
                    {metadataTestResult.detectedVersion ? (
                      <p className="mt-1">Detected version · {metadataTestResult.detectedVersion}</p>
                    ) : null}
                    {metadataTestResult.capabilities && metadataTestResult.capabilities.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {metadataTestResult.capabilities.map((capability) => (
                          <span key={capability} className="rounded-full border border-current px-2 py-0.5 text-[10px] uppercase tracking-[0.3em]">
                            {capability}
                          </span>
                        ))}
                      </div>
                    ) : null}
                    {metadataTestResult.details ? (
                      <pre className="mt-2 max-h-48 overflow-auto rounded-xl bg-white/30 p-2 text-[11px] text-current dark:bg-black/20">
                        {JSON.stringify(metadataTestResult.details, null, 2)}
                      </pre>
                    ) : null}
                  </div>
                ) : null}
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );

  const renderEndpointCardStatus = (run: MetadataCollectionRunSummary | undefined) => {
    if (!run) {
      return (
        <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:border-slate-600">
          No runs
        </span>
      );
    }
    const style = statusStyles[run.status];
    return (
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${style.badge}`}>
        <span className={`h-2 w-2 rounded-full ${style.dot}`} />
        {run.status.toLowerCase()}
        {run.completedAt ? <> · {formatRelativeTime(run.completedAt)}</> : null}
      </span>
    );
  };

  const renderEndpointsSection = () => {
    return (
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Endpoint templates</p>
              <p className="text-xs text-slate-500">
                Launch a registration flow for JDBC, HTTP, or streaming sources without leaving the designer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenRegistration()}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow hover:bg-slate-800 dark:bg-emerald-500 dark:text-slate-900"
            >
              + Register endpoint
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Selecting a family opens the dedicated registration workspace with the right fields, agent brief, and validation.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {templateFamilies.map((family) => {
              const templateCount = metadataTemplatesByFamily[family.id]?.length ?? 0;
              return (
                <button
                  key={family.id}
                  type="button"
                  onClick={() => handleOpenRegistration(undefined, family.id)}
                  className="rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <p className="text-base font-semibold">{family.label}</p>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{templateCount} templates</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{family.description}</p>
                </button>
              );
            })}
          </div>
        </section>
        <section className="space-y-4">
        {metadataEndpoints.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 px-6 py-6 text-sm text-slate-500 dark:border-slate-700">
            No metadata endpoints have been registered yet.
          </p>
        ) : null}
        {metadataEndpoints.map((endpoint) => {
          const latestRun = metadataLatestRunByEndpoint.get(endpoint.id);
          return (
            <article
              key={endpoint.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1">
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">{endpoint.name}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{endpoint.description ?? endpoint.url}</p>
                  {endpoint.detectedVersion ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Detected version · {endpoint.detectedVersion}</p>
                  ) : endpoint.versionHint ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">Version hint · {endpoint.versionHint}</p>
                  ) : null}
                </div>
                {renderEndpointCardStatus(latestRun)}
                <button
                  type="button"
                  onClick={() => setMetadataEndpointDetailId(endpoint.id)}
                  className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 transition hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300"
                >
                  Details
                </button>
              </div>
              <p className="mt-3 break-all text-xs font-mono text-slate-500 dark:text-slate-400">{endpoint.url}</p>
              {endpoint.domain ? (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Domain · {endpoint.domain}</p>
              ) : null}
              {endpoint.labels?.length ? (
                <div className="mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                  {endpoint.labels.map((label) => (
                    <span key={label} className="rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-600">
                      {label}
                    </span>
                  ))}
                </div>
              ) : null}
              {endpoint.capabilities?.length ? (
                <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-400">
                  {endpoint.capabilities.map((capability) => (
                    <span key={capability} className="rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-600">
                      {capability}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                <label className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-500">Schema override</label>
                <input
                  value={metadataRunOverrides[endpoint.id] ?? ""}
                  onChange={(event) =>
                    setMetadataRunOverrides((prev) => ({
                      ...prev,
                      [endpoint.id]: event.target.value,
                    }))
                  }
                  placeholder="public, analytics"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => handleTriggerMetadataRun(endpoint.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-200"
                >
                  <LuSquarePlus className="h-4 w-4" />
                  Trigger collection
                </button>
              </div>
            </article>
          );
        })}
        </section>
      </div>
    );
  };

  const renderCollectionsSection = () => (
    <div className="space-y-4">
      {sortedMetadataRuns.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700">
          No collection runs recorded yet. Trigger a run from the endpoint cards.
        </p>
      ) : (
        sortedMetadataRuns.map((run) => (
          <article
            key={run.id}
            className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          >
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
              <span>{run.status}</span>
              <span>· Requested {formatDateTime(run.requestedAt)}</span>
            </div>
            <p className="mt-1 text-base font-medium text-slate-900 dark:text-white">{run.endpoint?.name ?? "Unknown endpoint"}</p>
            <div className="mt-2 grid gap-1 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-3">
              <span>Started: {run.startedAt ? formatDateTime(run.startedAt) : "—"}</span>
              <span>Completed: {run.completedAt ? formatDateTime(run.completedAt) : "—"}</span>
              <span>Run ID: {run.id}</span>
            </div>
            {run.error ? (
              <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-400/60 dark:bg-rose-950/40 dark:text-rose-200">
                {run.error}
              </p>
            ) : null}
          </article>
        ))
      )}
    </div>
  );

  const renderOverviewContent = () => {
    if (metadataSection === "catalog") {
      return renderCatalogSection();
    }
    if (metadataLoading) {
      return (
        <p className="flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
          <LuHistory className="h-4 w-4 animate-spin" />
          Loading metadata…
        </p>
      );
    }
    if (metadataError) {
      return (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/60 dark:bg-rose-950/40 dark:text-rose-200">
          {metadataError}
        </p>
      );
    }
    switch (metadataSection) {
      case "endpoints":
        return renderEndpointsSection();
      case "collections":
        return renderCollectionsSection();
      default:
        return null;
    }
  };

  const endpointDatasets = metadataEndpointDetail
    ? metadataDatasetsByEndpointId.get(metadataEndpointDetail.id) ?? []
    : [];

  return (
    <>
      <section className="flex flex-1 bg-slate-50 dark:bg-slate-950">
        <aside
          className={`hidden border-r border-slate-200 bg-white/70 py-6 transition-[width] dark:border-slate-800 dark:bg-slate-900/40 lg:flex ${
            sectionNavCollapsed ? "w-16 px-2" : "w-64 px-4"
          }`}
        >
          <div className="flex w-full flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              {!sectionNavCollapsed ? (
                <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-500">Navigation</p>
              ) : null}
              <button
                type="button"
                onClick={() => setSectionNavCollapsed((prev) => !prev)}
                className="rounded-full border border-slate-200 px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-slate-500 dark:border-slate-700 dark:text-slate-300"
              >
                {sectionNavCollapsed ? "›" : "‹"}
              </button>
            </div>
            <div className="space-y-2">
              {metadataNavItems.map((entry) => {
                const Icon = entry.icon;
                const isActive =
                  entry.type === "section"
                    ? metadataView === "overview" && metadataSection === entry.id
                    : metadataView === "endpoint-register";
                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => {
                      if (entry.type === "section") {
                        setMetadataView("overview");
                        setMetadataSection(entry.id);
                      } else {
                        handleOpenRegistration();
                      }
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white shadow dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                        : "border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"
                    }`}
                    title={sectionNavCollapsed ? entry.label : undefined}
                  >
                    <Icon className="h-4 w-4" />
                    {!sectionNavCollapsed ? (
                      <div>
                        <p className="text-sm font-semibold">{entry.label}</p>
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{entry.description}</p>
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
        <div className="flex flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between border-b border-slate-200 px-8 py-6 dark:border-slate-800">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Metadata workspace</p>
            <h2 className="mt-1 text-3xl font-bold text-slate-900 dark:text-white">
              {metadataView === "endpoint-register" ? "Register endpoint" : "Catalog & collections"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300">
              {metadataView === "endpoint-register"
                ? "Onboard a new data source, capture connection requirements, and brief an agent for credential collection."
                : "Inspect datasets powering the designer, review registered endpoints, and monitor recent metadata collection runs without leaving the reporting workspace."}
            </p>
          </div>
          {metadataView === "endpoint-register" ? (
            <button
              type="button"
              onClick={handleCloseRegistration}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300 lg:mt-0"
            >
              ← Back to overview
            </button>
          ) : (
            <button
              type="button"
              onClick={refreshMetadataWorkspace}
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300 lg:mt-0"
            >
              <LuRefreshCcw className="h-4 w-4" /> Refresh
            </button>
          )}
        </header>
        {metadataView === "overview" ? (
          <div className="flex flex-wrap items-center gap-3 px-8 py-4 lg:hidden">
            {metadataSectionTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMetadataSection(tab.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  metadataSection === tab.id
                    ? "bg-slate-900 text-white shadow dark:bg-slate-100 dark:text-slate-900"
                    : "border border-slate-300 text-slate-600 hover:border-slate-900 dark:border-slate-600 dark:text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleOpenRegistration()}
              className="ml-auto rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.3em] text-white shadow hover:bg-slate-800 dark:bg-emerald-500 dark:text-slate-900"
            >
              Register endpoint
            </button>
          </div>
        ) : null}
        <div className="flex-1 overflow-y-auto px-8 pb-8">
          {metadataView === "overview" ? renderOverviewContent() : renderEndpointRegistrationPage()}
        </div>
        </div>
      </section>
      {metadataDatasetDetail ? (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMetadataDatasetDetailId(null)} />
          <section className="relative flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white px-6 py-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Dataset detail</p>
                <p className="text-base font-semibold text-slate-900 dark:text-white">{metadataDatasetDetail.displayName}</p>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{metadataDatasetDetail.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setMetadataDatasetDetailId(null)}
                className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:border-slate-700"
              >
                Close
              </button>
            </div>
            <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto py-4 pr-1 text-sm text-slate-600 dark:text-slate-300">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Description</p>
                <p className="mt-1 text-sm">{metadataDatasetDetail.description ?? "No description provided yet."}</p>
              </div>
              <div className="grid gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2">
                <span>Endpoint · {metadataEndpointLookup.get(metadataDatasetDetail.sourceEndpointId ?? "")?.name ?? "Unlinked"}</span>
                <span>Collected · {metadataDatasetDetail.collectedAt ? formatDateTime(metadataDatasetDetail.collectedAt) : "—"}</span>
                <span>Entity · {metadataDatasetDetail.entity ?? "—"}</span>
                <span>Schema · {metadataDatasetDetail.schema ?? "—"}</span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Fields ({metadataDatasetDetail.fields.length})</p>
                <div className="mt-2 space-y-2">
                  {metadataDatasetDetail.fields.map((field) => (
                    <div key={field.name} className="rounded-2xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{field.name}</span>
                        <span className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{field.type}</span>
                      </div>
                      {field.description ? <p className="text-xs text-slate-500 dark:text-slate-400">{field.description}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
              {metadataCatalogPreviewRows[metadataDatasetDetail.id]?.rows?.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Recent preview</p>
                  <div className="mt-2 max-h-48 overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700">
                    <table className="min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800">
                      <thead className="bg-slate-50 text-left font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                        <tr>
                          {previewTableColumns(metadataCatalogPreviewRows[metadataDatasetDetail.id].rows).map((column) => (
                            <th key={column} className="px-3 py-2 uppercase tracking-[0.3em] text-[10px] text-slate-400">
                              {column}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {metadataCatalogPreviewRows[metadataDatasetDetail.id].rows.map((row, index) => (
                          <tr key={index} className="border-t border-slate-100 dark:border-slate-800">
                            {previewTableColumns(metadataCatalogPreviewRows[metadataDatasetDetail.id].rows).map((column) => (
                              <td key={column} className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                {formatPreviewValue((row as Record<string, unknown>)[column])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
      {metadataEndpointDetail ? (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMetadataEndpointDetailId(null)} />
          <section className="relative flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white px-6 py-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500">Endpoint detail</p>
                <p className="text-sm text-slate-500">{metadataEndpointDetail.description ?? metadataEndpointDetail.url}</p>
              </div>
              <button
                type="button"
                onClick={() => setMetadataEndpointDetailId(null)}
                className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:border-slate-700"
              >
                Close
              </button>
            </div>
            <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto py-4 pr-1 text-sm text-slate-600 dark:text-slate-300">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Connection</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-500 dark:text-slate-400">{metadataEndpointDetail.url}</p>
              </div>
              <div className="grid gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2">
                <span>
                  Detected version · {metadataEndpointDetail.detectedVersion ?? metadataEndpointDetail.versionHint ?? "—"}
                </span>
                <span>Verb · {metadataEndpointDetail.verb}</span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Config payload</p>
                <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-100 p-3 text-[12px] dark:bg-slate-900/40">
                  {JSON.stringify(metadataEndpointDetail.config, null, 2)}
                </pre>
              </div>
              {metadataEndpointDetail.capabilities?.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Capabilities</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-400">
                    {metadataEndpointDetail.capabilities.map((capability) => (
                      <span key={capability} className="rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-700">
                        {capability}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Datasets ({endpointDatasets.length})</p>
                {endpointDatasets.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">No catalog entries linked yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {endpointDatasets.map((dataset) => (
                      <li key={dataset.id} className="rounded-2xl border border-slate-200 px-3 py-2 dark:border-slate-700">
                        <p className="text-sm font-semibold">{dataset.displayName}</p>
                        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{dataset.id}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Recent runs</p>
                {metadataEndpointDetail.runs.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">No runs recorded yet.</p>
                ) : (
                  metadataEndpointDetail.runs.map((run) => (
                    <div key={run.id} className="mt-2 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{run.status}</span>
                        <span>{formatRelativeTime(run.requestedAt)}</span>
                      </div>
                      {run.error ? <p className="mt-1 text-rose-600 dark:text-rose-300">{run.error}</p> : null}
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
