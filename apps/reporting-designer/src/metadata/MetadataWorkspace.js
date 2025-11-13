import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LuHistory, LuNetwork, LuRefreshCcw, LuSearch, LuSquarePlus, LuTable, } from "react-icons/lu";
import { formatDateTime, formatPreviewValue, formatRelativeTime } from "../lib/format";
import { fetchMetadataGraphQL } from "./api";
import { ENDPOINT_DATASETS_QUERY, METADATA_OVERVIEW_QUERY, PREVIEW_METADATA_DATASET_MUTATION, REGISTER_METADATA_ENDPOINT_MUTATION, UPDATE_METADATA_ENDPOINT_MUTATION, DELETE_METADATA_ENDPOINT_MUTATION, TEST_METADATA_ENDPOINT_MUTATION, TRIGGER_METADATA_COLLECTION_MUTATION, } from "./queries";
import { parseListInput, previewTableColumns } from "./utils";
const metadataNavItems = [
    { id: "catalog", type: "section", label: "Catalog", description: "Datasets & schema", icon: LuTable },
    { id: "endpoints", type: "section", label: "Endpoints", description: "Sources & templates", icon: LuNetwork },
    { id: "collections", type: "section", label: "Collections", description: "Run history", icon: LuHistory },
];
const metadataSectionTabs = [
    { id: "catalog", label: "Catalog" },
    { id: "endpoints", label: "Endpoints" },
    { id: "collections", label: "Collections" },
];
const templateFamilies = [
    { id: "JDBC", label: "JDBC sources", description: "Warehouses, data lakes, transactional stores." },
    { id: "HTTP", label: "HTTP APIs", description: "SaaS systems like Jira, Confluence, ServiceNow." },
    { id: "STREAM", label: "Streaming", description: "Kafka, Confluent, and event hubs." },
];
function extractTemplateIdFromConfig(config) {
    if (!config || typeof config !== "object") {
        return null;
    }
    const templateId = config.templateId;
    return typeof templateId === "string" ? templateId : null;
}
function parseTemplateParametersFromConfig(config) {
    if (!config || typeof config !== "object") {
        return {};
    }
    const parameters = config.parameters;
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
        return {};
    }
    return Object.fromEntries(Object.entries(parameters).map(([key, value]) => [key, value === undefined || value === null ? "" : String(value)]));
}
function buildTemplateValuesForTemplate(template, parameters) {
    if (!template) {
        return {};
    }
    return template.fields.reduce((acc, field) => {
        acc[field.key] = parameters[field.key] ?? "";
        return acc;
    }, {});
}
function serializeTemplateConfigSignature(templateId, values) {
    const sortedParameters = Object.entries(values)
        .map(([key, value]) => [key, value ?? ""])
        .sort(([a], [b]) => a.localeCompare(b));
    return JSON.stringify({ templateId, parameters: sortedParameters });
}
const statusStyles = {
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
    SKIPPED: {
        badge: "bg-slate-50 text-slate-700 border border-slate-200",
        dot: "bg-slate-500",
    },
};
export function MetadataWorkspace({ metadataEndpoint, catalogDatasets, selectedDatasetIds, toggleDatasetSelection, authToken, projectSlug, userRole, }) {
    const [metadataEndpoints, setMetadataEndpoints] = useState([]);
    const [metadataRuns, setMetadataRuns] = useState([]);
    const [metadataTemplates, setMetadataTemplates] = useState([]);
    const [metadataTemplateValues, setMetadataTemplateValues] = useState({});
    const [metadataTemplateFamily, setMetadataTemplateFamily] = useState("JDBC");
    const [selectedTemplateId, setSelectedTemplateId] = useState(null);
    const [metadataFormMode, setMetadataFormMode] = useState("register");
    const [metadataEditingEndpointId, setMetadataEditingEndpointId] = useState(null);
    const [metadataInitialConfigSignature, setMetadataInitialConfigSignature] = useState(null);
    const [metadataLastTestConfigSignature, setMetadataLastTestConfigSignature] = useState(null);
    const [metadataEndpointName, setMetadataEndpointName] = useState("");
    const [metadataEndpointDescription, setMetadataEndpointDescription] = useState("");
    const [metadataEndpointLabels, setMetadataEndpointLabels] = useState("");
    const [metadataLoading, setMetadataLoading] = useState(false);
    const [metadataError, setMetadataError] = useState(null);
    const [metadataRefreshToken, setMetadataRefreshToken] = useState(0);
    const [metadataSection, setMetadataSection] = useState("catalog");
    const [metadataView, setMetadataView] = useState("overview");
    const [metadataCatalogSearch, setMetadataCatalogSearch] = useState("");
    const [metadataCatalogEndpointFilter, setMetadataCatalogEndpointFilter] = useState("all");
    const [metadataCatalogLabelFilter, setMetadataCatalogLabelFilter] = useState("all");
    const [metadataCatalogSelection, setMetadataCatalogSelection] = useState(null);
    const [metadataMutationError, setMetadataMutationError] = useState(null);
    const [metadataRegistering, setMetadataRegistering] = useState(false);
    const [metadataRunOverrides, setMetadataRunOverrides] = useState({});
    const [metadataTesting, setMetadataTesting] = useState(false);
    const [metadataTestResult, setMetadataTestResult] = useState(null);
    const [metadataDeletingEndpointId, setMetadataDeletingEndpointId] = useState(null);
    const [metadataCatalogPreviewRows, setMetadataCatalogPreviewRows] = useState({});
    const [metadataCatalogPreviewErrors, setMetadataCatalogPreviewErrors] = useState({});
    const [metadataCatalogPreviewingId, setMetadataCatalogPreviewingId] = useState(null);
    const [metadataEndpointDetailId, setMetadataEndpointDetailId] = useState(null);
    const [metadataDatasetDetailId, setMetadataDatasetDetailId] = useState(null);
    const [sectionNavCollapsed, setSectionNavCollapsed] = useState(false);
    const [endpointDatasetRecords, setEndpointDatasetRecords] = useState({});
    const [endpointDatasetErrors, setEndpointDatasetErrors] = useState({});
    const [endpointDatasetLoading, setEndpointDatasetLoading] = useState({});
    const metadataRole = useMemo(() => {
        if (userRole === "ADMIN") {
            return "admin";
        }
        if (userRole === "MANAGER") {
            return "editor";
        }
        return "viewer";
    }, [userRole]);
    const canModifyEndpoints = metadataRole !== "viewer";
    const canDeleteEndpoints = metadataRole === "admin";
    const metadataEditingEndpoint = useMemo(() => (metadataEditingEndpointId ? metadataEndpoints.find((endpoint) => endpoint.id === metadataEditingEndpointId) ?? null : null), [metadataEditingEndpointId, metadataEndpoints]);
    const metadataEndpointLookup = useMemo(() => {
        const map = new Map();
        metadataEndpoints.forEach((endpoint) => {
            map.set(endpoint.id, endpoint);
            if (endpoint.sourceId) {
                map.set(endpoint.sourceId, endpoint);
            }
        });
        return map;
    }, [metadataEndpoints]);
    const metadataCatalogFilteredDatasets = useMemo(() => {
        const query = metadataCatalogSearch.trim().toLowerCase();
        return catalogDatasets.filter((dataset) => {
            const owner = dataset.sourceEndpointId ? metadataEndpointLookup.get(dataset.sourceEndpointId) : null;
            const matchesEndpoint = metadataCatalogEndpointFilter === "all" ||
                (metadataCatalogEndpointFilter === "unlinked" && !owner) ||
                owner?.id === metadataCatalogEndpointFilter;
            if (!matchesEndpoint) {
                return false;
            }
            const matchesLabel = metadataCatalogLabelFilter === "all" ||
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
        const labels = new Set();
        catalogDatasets.forEach((dataset) => dataset.labels?.forEach((label) => labels.add(label)));
        return Array.from(labels).sort();
    }, [catalogDatasets]);
    const metadataEndpointDetail = useMemo(() => (metadataEndpointDetailId ? metadataEndpoints.find((endpoint) => endpoint.id === metadataEndpointDetailId) ?? null : null), [metadataEndpointDetailId, metadataEndpoints]);
    const metadataDatasetDetail = useMemo(() => (metadataDatasetDetailId ? catalogDatasets.find((dataset) => dataset.id === metadataDatasetDetailId) ?? null : null), [catalogDatasets, metadataDatasetDetailId]);
    const isFieldVisible = useCallback((field) => {
        if (!field.visibleWhen || field.visibleWhen.length === 0) {
            return true;
        }
        return field.visibleWhen.every((rule) => {
            const current = metadataTemplateValues[rule.field] ?? "";
            return rule.values.includes(current);
        });
    }, [metadataTemplateValues]);
    const isFieldRequired = useCallback((field) => {
        if (!field.dependsOn) {
            return field.required;
        }
        const dependsValue = metadataTemplateValues[field.dependsOn];
        if (field.dependsValue === null || field.dependsValue === undefined) {
            return field.required && Boolean(dependsValue);
        }
        return field.required && dependsValue === field.dependsValue;
    }, [metadataTemplateValues]);
    const metadataLatestRunByEndpoint = useMemo(() => {
        const map = new Map();
        metadataEndpoints.forEach((endpoint) => {
            if (!endpoint.runs.length) {
                return;
            }
            const sorted = [...endpoint.runs].sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
            map.set(endpoint.id, sorted[0]);
        });
        return map;
    }, [metadataEndpoints]);
    const metadataTemplatesByFamily = useMemo(() => {
        return metadataTemplates.reduce((groups, template) => {
            const family = template.family;
            groups[family] = [...(groups[family] ?? []), template];
            return groups;
        }, { JDBC: [], HTTP: [], STREAM: [] });
    }, [metadataTemplates]);
    const filteredTemplates = metadataTemplatesByFamily[metadataTemplateFamily] ?? [];
    const handleOpenRegistration = useCallback((templateId, familyOverride) => {
        setMetadataFormMode("register");
        setMetadataEditingEndpointId(null);
        setMetadataInitialConfigSignature(null);
        setMetadataLastTestConfigSignature(null);
        setMetadataEndpointName("");
        setMetadataEndpointDescription("");
        setMetadataEndpointLabels("");
        setMetadataTemplateValues({});
        setMetadataTestResult(null);
        setMetadataMutationError(null);
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
    }, [metadataTemplateFamily, metadataTemplates, metadataTemplatesByFamily]);
    const handleOpenEndpointEdit = useCallback((endpoint) => {
        const templateIdFromConfig = extractTemplateIdFromConfig(endpoint.config);
        let resolvedTemplate = templateIdFromConfig
            ? metadataTemplates.find((template) => template.id === templateIdFromConfig) ?? null
            : null;
        if (!resolvedTemplate) {
            resolvedTemplate = metadataTemplates[0] ?? null;
        }
        if (resolvedTemplate) {
            if (resolvedTemplate.family !== metadataTemplateFamily) {
                setMetadataTemplateFamily(resolvedTemplate.family);
            }
            setSelectedTemplateId(resolvedTemplate.id);
            const initialValues = buildTemplateValuesForTemplate(resolvedTemplate, parseTemplateParametersFromConfig(endpoint.config ?? undefined));
            setMetadataTemplateValues(initialValues);
            const signature = serializeTemplateConfigSignature(resolvedTemplate.id, initialValues);
            setMetadataInitialConfigSignature(signature);
            setMetadataLastTestConfigSignature(signature);
        }
        else {
            setMetadataTemplateValues({});
            setMetadataInitialConfigSignature(null);
            setMetadataLastTestConfigSignature(null);
        }
        setMetadataFormMode("edit");
        setMetadataEditingEndpointId(endpoint.id);
        setMetadataEndpointName(endpoint.name);
        setMetadataEndpointDescription(endpoint.description ?? "");
        setMetadataEndpointLabels((endpoint.labels ?? []).join(", "));
        setMetadataMutationError(null);
        setMetadataTestResult(null);
        setMetadataView("endpoint-register");
        setMetadataEndpointDetailId(null);
    }, [metadataTemplateFamily, metadataTemplates]);
    const handleCloseRegistration = useCallback(() => {
        setMetadataView("overview");
        setMetadataMutationError(null);
        setMetadataTestResult(null);
        setMetadataFormMode("register");
        setMetadataEditingEndpointId(null);
        setMetadataInitialConfigSignature(null);
        setMetadataLastTestConfigSignature(null);
    }, []);
    const handleCloseEndpointDetail = useCallback(() => {
        setMetadataEndpointDetailId(null);
        setMetadataMutationError(null);
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
    const currentTemplateId = selectedTemplate?.id ?? null;
    const isEditingEndpoint = metadataFormMode === "edit" && Boolean(metadataEditingEndpointId);
    const currentConfigSignature = useMemo(() => serializeTemplateConfigSignature(currentTemplateId, metadataTemplateValues), [currentTemplateId, metadataTemplateValues]);
    const connectionChangedFromInitial = isEditingEndpoint && metadataInitialConfigSignature !== currentConfigSignature;
    const requiresRetest = isEditingEndpoint && connectionChangedFromInitial && metadataLastTestConfigSignature !== currentConfigSignature;
    const formTitle = metadataFormMode === "edit" ? "Edit endpoint" : "Register endpoint";
    const submitButtonLabel = metadataFormMode === "edit"
        ? metadataRegistering
            ? "Saving…"
            : "Save changes"
        : metadataRegistering
            ? "Registering…"
            : "Register endpoint";
    const submitDisabled = !canModifyEndpoints ||
        metadataRegistering ||
        (metadataFormMode === "edit" ? requiresRetest : !metadataTestResult?.ok);
    const showRetestWarning = metadataFormMode === "edit" && requiresRetest;
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
            const next = selectedTemplate.fields.reduce((acc, field) => {
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
        return [...metadataRuns].sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
    }, [metadataRuns]);
    const refreshMetadataWorkspace = useCallback(() => {
        setMetadataRefreshToken((prev) => prev + 1);
    }, []);
    const handleRequirementChange = useCallback((key, value) => {
        setMetadataTemplateValues((prev) => ({ ...prev, [key]: value }));
        setMetadataTestResult(null);
    }, []);
    const handlePreviewMetadataDataset = useCallback(async (datasetId, options) => {
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
        if (!authToken) {
            setMetadataCatalogPreviewErrors((prev) => ({
                ...prev,
                [datasetId]: "Sign in to preview datasets.",
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
            const payload = await fetchMetadataGraphQL(metadataEndpoint, PREVIEW_METADATA_DATASET_MUTATION, { id: datasetId, limit }, undefined, { token: authToken });
            setMetadataCatalogPreviewRows((prev) => ({
                ...prev,
                [datasetId]: payload.previewMetadataDataset ?? { rows: [] },
            }));
        }
        catch (error) {
            setMetadataCatalogPreviewErrors((prev) => ({
                ...prev,
                [datasetId]: error instanceof Error ? error.message : String(error),
            }));
        }
        finally {
            if (!silent) {
                setMetadataCatalogPreviewingId((prev) => (prev === datasetId ? null : prev));
            }
        }
    }, [authToken, metadataEndpoint]);
    const handleSubmitMetadataEndpoint = useCallback(async (event) => {
        event.preventDefault();
        if (!selectedTemplate) {
            setMetadataMutationError("Select an endpoint template before continuing.");
            return;
        }
        if (!metadataEndpoint) {
            setMetadataMutationError("Configure VITE_METADATA_GRAPHQL_ENDPOINT to manage endpoints.");
            return;
        }
        if (!canModifyEndpoints) {
            setMetadataMutationError("You do not have permission to modify endpoints.");
            return;
        }
        setMetadataRegistering(true);
        setMetadataMutationError(null);
        try {
            const userLabels = parseListInput(metadataEndpointLabels);
            const labels = metadataFormMode === "register"
                ? Array.from(new Set([...(selectedTemplate.defaultLabels ?? []), ...userLabels]))
                : userLabels;
            const configPayload = {
                templateId: selectedTemplate.id,
                parameters: metadataTemplateValues,
            };
            if (metadataFormMode === "edit" && metadataEditingEndpointId) {
                await fetchMetadataGraphQL(metadataEndpoint, UPDATE_METADATA_ENDPOINT_MUTATION, {
                    id: metadataEditingEndpointId,
                    patch: {
                        name: metadataEndpointName.trim() || `${selectedTemplate.title} endpoint`,
                        description: metadataEndpointDescription.trim() || null,
                        labels,
                        config: configPayload,
                    },
                }, undefined, { token: authToken ?? undefined });
                refreshMetadataWorkspace();
                handleCloseRegistration();
            }
            else {
                await fetchMetadataGraphQL(metadataEndpoint, REGISTER_METADATA_ENDPOINT_MUTATION, {
                    input: {
                        projectSlug: projectSlug ?? undefined,
                        name: metadataEndpointName.trim() || `${selectedTemplate.title} endpoint`,
                        description: metadataEndpointDescription.trim() || selectedTemplate.description || null,
                        verb: selectedTemplate.family === "HTTP" ? "GET" : "POST",
                        url: null,
                        domain: selectedTemplate.domain ?? undefined,
                        labels: labels.length ? labels : undefined,
                        config: configPayload,
                        capabilities: selectedTemplate.capabilities?.map((capability) => capability.key) ?? undefined,
                    },
                }, undefined, { token: authToken ?? undefined });
                setMetadataTemplateValues({});
                setMetadataEndpointName("");
                setMetadataEndpointDescription("");
                setMetadataEndpointLabels("");
                setMetadataTestResult(null);
                refreshMetadataWorkspace();
            }
        }
        catch (error) {
            setMetadataMutationError(error instanceof Error ? error.message : String(error));
        }
        finally {
            setMetadataRegistering(false);
        }
    }, [
        authToken,
        canModifyEndpoints,
        handleCloseRegistration,
        metadataEditingEndpointId,
        metadataEndpoint,
        metadataEndpointDescription,
        metadataEndpointLabels,
        metadataEndpointName,
        metadataFormMode,
        metadataTemplateValues,
        projectSlug,
        refreshMetadataWorkspace,
        selectedTemplate,
    ]);
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
            const payload = await fetchMetadataGraphQL(metadataEndpoint, TEST_METADATA_ENDPOINT_MUTATION, {
                input: {
                    templateId: selectedTemplate.id,
                    type: selectedTemplate.family.toLowerCase(),
                    connection: metadataTemplateValues,
                    capabilities: selectedTemplate.capabilities?.map((capability) => capability.key),
                },
            }, undefined, { token: authToken ?? undefined });
            const result = payload.testEndpoint;
            setMetadataTestResult(result);
            if (result.ok) {
                setMetadataLastTestConfigSignature(serializeTemplateConfigSignature(selectedTemplate.id, metadataTemplateValues));
            }
        }
        catch (error) {
            setMetadataTestResult({
                ok: false,
                diagnostics: [
                    {
                        level: "ERROR",
                        code: "E_CONN_TEST_FAILED",
                        message: error instanceof Error ? error.message : String(error),
                    },
                ],
            });
        }
        finally {
            setMetadataTesting(false);
        }
    }, [authToken, metadataEndpoint, metadataEndpointDescription, metadataEndpointLabels, metadataEndpointName, metadataTemplateValues, selectedTemplate]);
    const handleTriggerMetadataRun = useCallback(async (endpointId) => {
        if (!metadataEndpoint) {
            setMetadataMutationError("Configure VITE_METADATA_GRAPHQL_ENDPOINT to trigger collections.");
            return;
        }
        if (!canModifyEndpoints) {
            setMetadataMutationError("You do not have permission to trigger collections.");
            return;
        }
        const targetEndpoint = metadataEndpoints.find((endpoint) => endpoint.id === endpointId);
        const declaredCapabilities = targetEndpoint?.capabilities ?? [];
        const supportsMetadataCapability = declaredCapabilities.length === 0 || declaredCapabilities.includes("metadata");
        if (!supportsMetadataCapability) {
            setMetadataMutationError(`Cannot trigger collection. ${targetEndpoint?.name ?? "This endpoint"} is missing the "metadata" capability.`);
            return;
        }
        setMetadataMutationError(null);
        try {
            const override = metadataRunOverrides[endpointId];
            const schemaOverride = override
                ? override
                    .split(",")
                    .map((schema) => schema.trim())
                    .filter(Boolean)
                : undefined;
            await fetchMetadataGraphQL(metadataEndpoint, TRIGGER_METADATA_COLLECTION_MUTATION, {
                endpointId,
                schemaOverride,
            }, undefined, { token: authToken ?? undefined });
            refreshMetadataWorkspace();
        }
        catch (error) {
            setMetadataMutationError(error instanceof Error ? error.message : String(error));
        }
    }, [authToken, metadataEndpoint, metadataEndpoints, metadataRunOverrides, refreshMetadataWorkspace]);
    const handleDeleteMetadataEndpoint = useCallback(async (endpoint) => {
        if (!canDeleteEndpoints) {
            setMetadataMutationError("You do not have permission to delete endpoints.");
            return;
        }
        if (!metadataEndpoint) {
            setMetadataMutationError("Configure VITE_METADATA_GRAPHQL_ENDPOINT to delete endpoints.");
            return;
        }
        if (typeof window !== "undefined") {
            const confirmDelete = window.confirm(`Delete “${endpoint.name}”? Metadata collections and their datasets will no longer receive updates.`);
            if (!confirmDelete) {
                return;
            }
        }
        setMetadataDeletingEndpointId(endpoint.id);
        setMetadataMutationError(null);
        try {
            await fetchMetadataGraphQL(metadataEndpoint, DELETE_METADATA_ENDPOINT_MUTATION, { id: endpoint.id }, undefined, { token: authToken ?? undefined });
            if (metadataEditingEndpointId === endpoint.id) {
                handleCloseRegistration();
            }
            if (metadataEndpointDetailId === endpoint.id) {
                setMetadataEndpointDetailId(null);
            }
            refreshMetadataWorkspace();
        }
        catch (error) {
            setMetadataMutationError(error instanceof Error ? error.message : String(error));
        }
        finally {
            setMetadataDeletingEndpointId((prev) => (prev === endpoint.id ? null : prev));
        }
    }, [
        authToken,
        canDeleteEndpoints,
        handleCloseRegistration,
        metadataEditingEndpointId,
        metadataEndpoint,
        metadataEndpointDetailId,
        refreshMetadataWorkspace,
    ]);
    const loadEndpointDatasets = useCallback(async (endpointId, options) => {
        if (!metadataEndpoint || !authToken) {
            return;
        }
        if (!options?.force && endpointDatasetRecords[endpointId]) {
            return;
        }
        setEndpointDatasetLoading((prev) => ({ ...prev, [endpointId]: true }));
        try {
            const payload = await fetchMetadataGraphQL(metadataEndpoint, ENDPOINT_DATASETS_QUERY, { endpointId }, undefined, { token: authToken });
            setEndpointDatasetRecords((prev) => ({ ...prev, [endpointId]: payload.endpointDatasets ?? [] }));
            setEndpointDatasetErrors((prev) => {
                const next = { ...prev };
                delete next[endpointId];
                return next;
            });
        }
        catch (error) {
            setEndpointDatasetErrors((prev) => ({
                ...prev,
                [endpointId]: error instanceof Error ? error.message : String(error),
            }));
        }
        finally {
            setEndpointDatasetLoading((prev) => ({ ...prev, [endpointId]: false }));
        }
    }, [authToken, endpointDatasetRecords, metadataEndpoint]);
    useEffect(() => {
        if (!selectedTemplate) {
            return;
        }
        setMetadataTemplateValues((prev) => {
            const next = {};
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
        if (!metadataEndpointDetailId) {
            return;
        }
        if (endpointDatasetRecords[metadataEndpointDetailId]) {
            return;
        }
        void loadEndpointDatasets(metadataEndpointDetailId);
    }, [metadataEndpointDetailId, endpointDatasetRecords, loadEndpointDatasets]);
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
        if (!authToken) {
            setMetadataLoading(true);
            setMetadataError(null);
            return;
        }
        const controller = new AbortController();
        const loadMetadataOverview = async () => {
            setMetadataLoading(true);
            setMetadataError(null);
            try {
                const data = await fetchMetadataGraphQL(metadataEndpoint, METADATA_OVERVIEW_QUERY, { projectSlug: projectSlug ?? undefined, runsLimit: 30 }, controller.signal, {
                    token: authToken ?? undefined,
                });
                if (controller.signal.aborted) {
                    return;
                }
                setMetadataEndpoints(data.endpoints ?? []);
                setMetadataRuns(data.metadataCollectionRuns ?? []);
                setMetadataTemplates(data.endpointTemplates ?? []);
            }
            catch (error) {
                if (!controller.signal.aborted) {
                    setMetadataError(error instanceof Error ? error.message : String(error));
                }
            }
            finally {
                if (!controller.signal.aborted) {
                    setMetadataLoading(false);
                }
            }
        };
        void loadMetadataOverview();
        return () => controller.abort();
    }, [authToken, metadataEndpoint, metadataRefreshToken]);
    useEffect(() => {
        if (!metadataCatalogSelectedDataset || !authToken) {
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
        authToken,
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
        const activeFilterChips = [];
        if (metadataCatalogSearch.trim().length > 0) {
            activeFilterChips.push({
                label: `Search · ${metadataCatalogSearch.trim()}`,
                onClear: () => setMetadataCatalogSearch(""),
            });
        }
        if (metadataCatalogEndpointFilter !== "all") {
            const endpointLabel = endpointFilterOptions.find((option) => option.value === metadataCatalogEndpointFilter)?.label ?? metadataCatalogEndpointFilter;
            activeFilterChips.push({
                label: `Endpoint · ${endpointLabel}`,
                onClear: () => setMetadataCatalogEndpointFilter("all"),
            });
        }
        if (metadataCatalogLabelFilter !== "all") {
            const labelName = labelFilterOptions.find((option) => option.value === metadataCatalogLabelFilter)?.label ?? metadataCatalogLabelFilter;
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
        const endpointPreviewCapabilities = selectedDatasetEndpoint?.capabilities ?? [];
        const declaresPreviewCapabilities = endpointPreviewCapabilities.length > 0;
        const endpointSupportsPreview = !declaresPreviewCapabilities || endpointPreviewCapabilities.includes("preview");
        const previewCapabilityReason = selectedDatasetEndpoint && declaresPreviewCapabilities && !endpointSupportsPreview
            ? `Dataset previews disabled: ${selectedDatasetEndpoint.name} is missing the "preview" capability.`
            : null;
        const isPreviewingActive = Boolean(metadataCatalogSelectedDataset) && metadataCatalogPreviewingId === metadataCatalogSelectedDataset?.id;
        const hasLinkedEndpoint = Boolean(metadataCatalogSelectedDataset?.sourceEndpointId && selectedDatasetEndpoint?.url);
        const previewBlockReason = previewCapabilityReason ??
            (!hasLinkedEndpoint && metadataCatalogSelectedDataset
                ? "Link this dataset to a registered endpoint before running previews."
                : null);
        const canPreviewDataset = Boolean(metadataCatalogSelectedDataset) && !previewBlockReason;
        const previewRows = selectedDatasetPreview?.rows ?? [];
        const previewColumns = previewTableColumns(previewRows);
        return (_jsxs("div", { className: "grid gap-6 lg:grid-cols-[320px,1fr]", children: [_jsxs("section", { className: "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900", "data-testid": "metadata-dataset-detail", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Datasets" }), _jsx("p", { className: "text-xs text-slate-500", children: "Search catalog entries ingested from the metadata service." })] }), _jsxs("div", { className: "mt-4 space-y-4", children: [_jsxs("div", { className: "rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300", children: [_jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Filter" }), _jsxs("div", { className: "relative mt-2", children: [_jsx(LuSearch, { className: "pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" }), _jsx("input", { id: "metadata-catalog-search", value: metadataCatalogSearch, onChange: (event) => setMetadataCatalogSearch(event.target.value), placeholder: "Search name, label, or source", className: "w-full rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" })] }), activeFilterChips.length ? (_jsxs("div", { className: "mt-3 flex flex-wrap gap-2", children: [activeFilterChips.map((chip) => (_jsxs("button", { type: "button", onClick: chip.onClear, className: "inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200", children: [chip.label, _jsx("span", { "aria-hidden": "true", children: "\u00D7" })] }, chip.label))), _jsx("button", { type: "button", onClick: () => {
                                                        setMetadataCatalogSearch("");
                                                        setMetadataCatalogEndpointFilter("all");
                                                        setMetadataCatalogLabelFilter("all");
                                                    }, className: "rounded-full border border-transparent px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 hover:text-slate-900 dark:text-slate-300", children: "Clear all" })] })) : null] }), _jsxs("div", { className: "space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700", children: [_jsx("label", { className: "text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Endpoint" }), _jsx("select", { className: "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100", value: metadataCatalogEndpointFilter, onChange: (event) => setMetadataCatalogEndpointFilter(event.target.value), children: endpointFilterOptions.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] }), _jsxs("div", { className: "space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700", children: [_jsx("label", { className: "text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Label" }), _jsx("select", { className: "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100", value: metadataCatalogLabelFilter, onChange: (event) => setMetadataCatalogLabelFilter(event.target.value), children: labelFilterOptions.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value))) })] })] }), _jsx("div", { className: "scrollbar-thin mt-4 max-h-[calc(100vh-320px)] overflow-y-auto pr-1", children: metadataCatalogFilteredDatasets.length === 0 ? (_jsx("p", { className: "rounded-xl border border-dashed border-slate-300 px-3 py-4 text-xs text-slate-500 dark:border-slate-700", "data-testid": "metadata-catalog-empty", children: "No datasets match that query." })) : (metadataCatalogFilteredDatasets.map((dataset) => {
                                const isActive = metadataCatalogSelectedDataset?.id === dataset.id;
                                const owner = dataset.sourceEndpointId ? metadataEndpointLookup.get(dataset.sourceEndpointId) : null;
                                return (_jsxs("button", { type: "button", onClick: () => setMetadataCatalogSelection(dataset.id), "data-testid": "metadata-catalog-card", className: `mb-2 flex w-full flex-col rounded-2xl border px-3 py-2 text-left transition ${isActive
                                        ? "border-slate-900 bg-slate-900 text-white shadow dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                        : "border-slate-200 bg-white text-slate-700 hover:border-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`, children: [_jsx("span", { className: "text-sm font-semibold", children: dataset.displayName }), _jsx("span", { className: "text-[11px] uppercase tracking-[0.3em] text-slate-400", children: owner ? `Endpoint · ${owner.name}` : "Unlinked" }), _jsx("span", { className: "text-[10px] uppercase tracking-[0.3em] text-slate-400", children: dataset.labels?.length ? `Labels · ${dataset.labels.slice(0, 3).join(", ")}` : dataset.source ?? dataset.id })] }, dataset.id));
                            })) })] }), _jsx("section", { className: "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900", children: metadataCatalogSelectedDataset ? (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xl font-semibold text-slate-900 dark:text-white", children: metadataCatalogSelectedDataset.displayName }), _jsx("p", { className: "text-xs uppercase tracking-[0.3em] text-slate-500", children: metadataCatalogSelectedDataset.id })] }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("button", { type: "button", onClick: () => toggleDatasetSelection(metadataCatalogSelectedDataset.id), className: `rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] transition ${selectedDatasetIds.includes(metadataCatalogSelectedDataset.id)
                                                    ? "border-rose-300 text-rose-600 hover:border-rose-400 hover:text-rose-700 dark:border-rose-400/60 dark:text-rose-200"
                                                    : "border-emerald-300 text-emerald-600 hover:border-emerald-400 hover:text-emerald-700 dark:border-emerald-400/60 dark:text-emerald-200"}`, children: selectedDatasetIds.includes(metadataCatalogSelectedDataset.id) ? "Unscope" : "Scope dataset" }), _jsx("button", { type: "button", onClick: () => setMetadataDatasetDetailId(metadataCatalogSelectedDataset.id), className: "rounded-full border border-slate-300 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-200", children: "View detail" }), _jsxs("button", { type: "button", onClick: () => handlePreviewMetadataDataset(metadataCatalogSelectedDataset.id), className: `inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] transition ${canPreviewDataset
                                                    ? "border-slate-300 text-slate-600 hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-200"
                                                    : "border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-600"}`, disabled: !canPreviewDataset || isPreviewingActive, "data-testid": "metadata-preview-button", children: [isPreviewingActive ? _jsx(LuHistory, { className: "h-3 w-3 animate-spin" }) : _jsx(LuTable, { className: "h-3 w-3" }), isPreviewingActive ? "Fetching…" : "Preview dataset"] })] })] }), _jsx("p", { className: "text-sm text-slate-600 dark:text-slate-300", children: metadataCatalogSelectedDataset.description ?? "No description provided." }), _jsxs("div", { className: "flex flex-wrap items-center gap-3 text-xs text-slate-500", children: [_jsxs("span", { children: ["Endpoint \u00B7 ", selectedDatasetEndpoint?.name ?? "Unlinked"] }), metadataCatalogSelectedDataset.collectedAt ? (_jsxs("span", { children: ["Collected ", formatDateTime(metadataCatalogSelectedDataset.collectedAt)] })) : null] }), metadataCatalogSelectedDataset.labels?.length ? (_jsx("div", { className: "flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500", children: (metadataCatalogSelectedDataset.labels ?? []).map((label) => (_jsx("span", { className: "rounded-full border border-slate-300 px-2 py-0.5 dark:border-slate-600", children: label }, label))) })) : null, _jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Fields" }), _jsxs("div", { className: "mt-3 space-y-2", children: [metadataCatalogSelectedDataset.fields.map((field) => (_jsxs("div", { className: "rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("p", { className: "font-medium text-slate-900 dark:text-slate-100", children: field.name }), _jsx("span", { className: "text-[11px] uppercase tracking-[0.3em] text-slate-400", children: field.type })] }), field.description ? _jsx("p", { className: "text-xs text-slate-500 dark:text-slate-400", children: field.description }) : null] }, field.name))), metadataCatalogSelectedDataset.fields.length === 0 ? (_jsx("p", { className: "rounded-xl border border-dashed border-slate-300 px-4 py-4 text-xs text-slate-500 dark:border-slate-700", children: "No field metadata discovered yet." })) : null] })] }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Preview" }), _jsx("div", { className: "mt-2 flex flex-wrap items-center gap-3", children: selectedDatasetPreview?.sampledAt ? (_jsxs("span", { className: "text-xs text-slate-500", children: ["Sampled ", formatRelativeTime(selectedDatasetPreview.sampledAt)] })) : previewBlockReason ? (_jsx("span", { className: "text-xs text-rose-600 dark:text-rose-300", children: previewBlockReason })) : (_jsx("span", { className: "text-xs text-slate-500", children: "Preview pulls 20 live rows per request." })) }), selectedDatasetPreviewError ? (_jsx("p", { className: "mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-400/60 dark:bg-rose-950/40 dark:text-rose-200", children: selectedDatasetPreviewError })) : null, previewRows.length ? (_jsx("div", { className: "mt-3 max-h-64 overflow-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900", "data-testid": "metadata-preview-table", children: _jsxs("table", { className: "min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-700", children: [_jsx("thead", { className: "bg-slate-50 text-left font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300", children: _jsx("tr", { children: previewColumns.map((column) => (_jsx("th", { className: "px-3 py-2 uppercase tracking-[0.3em] text-[10px] text-slate-400", children: column }, column))) }) }), _jsx("tbody", { children: previewRows.map((row, index) => (_jsx("tr", { className: "border-t border-slate-100 dark:border-slate-800", children: previewColumns.map((column) => (_jsx("td", { className: "px-3 py-2 text-slate-700 dark:text-slate-200", children: formatPreviewValue(row[column]) }, column))) }, index))) })] }) })) : (_jsx("p", { className: "mt-2 text-xs text-slate-500", "data-testid": "metadata-preview-empty", children: isPreviewingActive ? "Collecting sample rows…" : "No preview sampled yet. Run a preview to inspect live data." }))] })] })) : (_jsx("p", { className: "rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700", "data-testid": "metadata-dataset-empty", children: "Select a dataset on the left to inspect its schema." })) })] }));
    };
    const renderEndpointRegistrationPage = () => (_jsx("div", { className: "space-y-6", "data-testid": "metadata-register-form", children: _jsxs("div", { className: "grid gap-6 lg:grid-cols-[minmax(300px,340px),1fr]", children: [_jsxs("section", { className: "space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Select a template" }), _jsx("p", { className: "text-xs text-slate-500", children: "Choose a family, then pick a specific connector to configure." })] }), _jsx("div", { className: "flex flex-wrap gap-2", children: templateFamilies.map((family) => (_jsx("button", { type: "button", onClick: () => setMetadataTemplateFamily(family.id), className: `rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${metadataTemplateFamily === family.id
                                    ? "bg-slate-900 text-white dark:bg-emerald-500 dark:text-slate-900"
                                    : "border border-slate-300 text-slate-600 hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300"}`, children: family.label }, family.id))) }), _jsx("p", { className: "text-xs text-slate-500", children: templateFamilies.find((family) => family.id === metadataTemplateFamily)?.description ?? "" }), _jsx("div", { className: "space-y-2", children: filteredTemplates.length === 0 ? (_jsx("p", { className: "rounded-xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700", children: "No templates found for this family yet." })) : (filteredTemplates.map((template) => {
                                const isActive = selectedTemplate?.id === template.id;
                                return (_jsxs("button", { type: "button", onClick: () => setSelectedTemplateId(template.id), className: `w-full rounded-2xl border px-3 py-2 text-left transition ${isActive
                                        ? "border-slate-900 bg-slate-900 text-white shadow dark:border-emerald-400/70 dark:bg-emerald-500/10 dark:text-emerald-100"
                                        : "border-slate-200 text-slate-700 hover:border-slate-900 dark:border-slate-700 dark:text-slate-200"}`, children: [_jsx("p", { className: "text-sm font-semibold", children: template.title }), _jsx("p", { className: "text-[11px] uppercase tracking-[0.3em] text-slate-400", children: template.vendor }), _jsx("p", { className: "mt-1 text-xs text-slate-500 dark:text-slate-400", children: template.description })] }, template.id));
                            })) }), selectedTemplate ? (_jsxs("div", { className: "space-y-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300", children: [_jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Agent briefing" }), _jsx("p", { className: "whitespace-pre-wrap", children: selectedTemplate.agentPrompt ?? "Collect credentials and scope for this endpoint." }), selectedTemplate.capabilities.length ? (_jsx("ul", { className: "list-disc space-y-1 pl-4", children: selectedTemplate.capabilities.map((capability) => (_jsx("li", { children: capability.label }, capability.key))) })) : null, selectedTemplate.connection?.urlTemplate ? (_jsxs("div", { children: [_jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Connection template" }), _jsx("pre", { className: "mt-2 overflow-x-auto rounded-xl bg-slate-900/90 p-3 font-mono text-[12px] text-emerald-200 dark:bg-slate-950", children: selectedTemplate.connection.urlTemplate })] })) : null, selectedTemplate.probing?.methods && selectedTemplate.probing.methods.length ? (_jsxs("div", { children: [_jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Version detection" }), _jsx("ul", { className: "mt-2 space-y-2", children: selectedTemplate.probing.methods.map((method) => (_jsxs("li", { className: "rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800", children: [_jsxs("p", { className: "text-sm font-semibold text-slate-900 dark:text-slate-100", children: [method.label, " ", _jsxs("span", { className: "text-xs uppercase tracking-[0.3em] text-slate-400", children: ["(", method.strategy, ")"] })] }), method.description ? (_jsx("p", { className: "text-xs text-slate-500 dark:text-slate-400", children: method.description })) : null, method.requires && method.requires.length ? (_jsxs("p", { className: "text-[11px] text-slate-500", children: ["Requires: ", method.requires.join(", ")] })) : null] }, method.key))) }), selectedTemplate.probing.fallbackMessage ? (_jsx("p", { className: "mt-2 text-[11px] text-slate-500", children: selectedTemplate.probing.fallbackMessage })) : null] })) : null] })) : null] }), _jsx("section", { className: "space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900", children: !selectedTemplate ? (_jsx("p", { className: "text-sm text-slate-500", children: "Select a template to configure connection details." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "space-y-1", children: [_jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500", children: formTitle }), _jsx("p", { className: "text-sm text-slate-500", children: metadataFormMode === "edit"
                                            ? "Update the endpoint details and re-test the connection whenever credentials change."
                                            : "Select a template, provide connection parameters, and register the endpoint after a passing test." })] }), metadataMutationError ? (_jsx("p", { className: "rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/50 dark:bg-rose-950/40 dark:text-rose-200", children: metadataMutationError })) : null, _jsxs("form", { className: "space-y-4", onSubmit: handleSubmitMetadataEndpoint, children: [_jsxs("div", { className: "grid gap-3 md:grid-cols-2", children: [_jsxs("label", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: ["Endpoint name", _jsx("input", { value: metadataEndpointName, onChange: (event) => setMetadataEndpointName(event.target.value), className: "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" })] }), _jsxs("label", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: ["Labels", _jsx("input", { value: metadataEndpointLabels, onChange: (event) => setMetadataEndpointLabels(event.target.value), placeholder: "analytics, postgres, staging", className: "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" })] })] }), _jsxs("label", { className: "block text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: ["Description", _jsx("textarea", { value: metadataEndpointDescription, onChange: (event) => setMetadataEndpointDescription(event.target.value), className: "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100", rows: 2 })] }), _jsx("div", { className: "space-y-3", children: selectedTemplate.fields.map((field) => {
                                            if (!isFieldVisible(field)) {
                                                return null;
                                            }
                                            const value = metadataTemplateValues[field.key] ?? field.defaultValue ?? "";
                                            const required = isFieldRequired(field);
                                            const commonProps = {
                                                id: `template-${field.key}`,
                                                value,
                                                onChange: (event) => handleRequirementChange(field.key, event.target.value),
                                                required,
                                                className: "mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
                                            };
                                            const inputType = field.valueType === "PASSWORD"
                                                ? "password"
                                                : field.valueType === "NUMBER" || field.valueType === "PORT"
                                                    ? "number"
                                                    : "text";
                                            const labelId = `template-${field.key}`;
                                            const advancedBadge = field.advanced ? (_jsx("span", { className: "rounded-full border border-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-[0.3em] text-slate-400 dark:border-slate-600", children: "Advanced" })) : null;
                                            let control;
                                            if (field.valueType === "LIST") {
                                                control = _jsx("textarea", { ...commonProps, placeholder: field.placeholder ?? undefined, rows: 2 });
                                            }
                                            else if (field.valueType === "ENUM" && field.options) {
                                                control = (_jsxs("select", { ...commonProps, children: [_jsxs("option", { value: "", children: ["Select ", field.label] }), field.options.map((option) => (_jsx("option", { value: option.value, children: option.label }, option.value)))] }));
                                            }
                                            else if (field.valueType === "JSON") {
                                                control = _jsx("textarea", { ...commonProps, placeholder: field.placeholder ?? undefined, rows: 3 });
                                            }
                                            else if (field.valueType === "TEXT") {
                                                control = _jsx("textarea", { ...commonProps, placeholder: field.placeholder ?? undefined, rows: 4 });
                                            }
                                            else if (field.valueType === "BOOLEAN") {
                                                const checked = (value || "").toLowerCase() === "true";
                                                control = (_jsxs("div", { className: "mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40", children: [_jsx("input", { id: labelId, type: "checkbox", className: "h-4 w-4 accent-slate-900 dark:accent-emerald-500", checked: checked, onChange: (event) => handleRequirementChange(field.key, event.target.checked ? "true" : "false") }), _jsx("span", { className: "text-sm text-slate-700 dark:text-slate-200", children: checked ? "Enabled" : "Disabled" })] }));
                                            }
                                            else {
                                                control = (_jsx("input", { ...commonProps, type: inputType, placeholder: field.placeholder ?? undefined, autoComplete: field.valueType === "PASSWORD" ? "current-password" : undefined }));
                                            }
                                            return (_jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("label", { htmlFor: labelId, className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: [field.label, !required ? " (optional)" : ""] }), advancedBadge] }), control, field.description ? (_jsx("p", { className: "mt-1 text-[11px] text-slate-500", children: field.description })) : field.helpText ? (_jsx("p", { className: "mt-1 text-[11px] text-slate-500", children: field.helpText })) : null] }, field.key));
                                        }) }), _jsxs("div", { className: "flex flex-wrap gap-3", children: [_jsx("button", { type: "button", onClick: handleTestMetadataEndpoint, disabled: !canModifyEndpoints || metadataRegistering || metadataTesting, className: "flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-slate-600 transition hover:border-slate-900 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-200", children: metadataTesting ? "Testing…" : "Test connection" }), _jsx("button", { type: "submit", disabled: submitDisabled, className: "flex-1 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 dark:bg-emerald-500 dark:hover:bg-emerald-400", children: submitButtonLabel })] }), showRetestWarning ? (_jsx("p", { className: "text-xs text-amber-600", children: "Connection parameters changed. Re-run \u201CTest connection\u201D before saving." })) : null, !canModifyEndpoints ? (_jsx("p", { className: "text-xs text-slate-500", children: "Viewer access cannot register endpoints." })) : null, metadataTestResult ? (_jsxs("div", { "data-testid": "metadata-test-result", className: `rounded-2xl border px-3 py-3 text-xs ${metadataTestResult.ok
                                            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
                                            : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200"}`, children: [_jsx("p", { className: "text-sm font-semibold", children: metadataTestResult.ok ? "Connection parameters validated." : "Connection test reported issues." }), metadataTestResult.diagnostics.map((diagnostic, index) => (_jsxs("div", { className: "mt-2", children: [_jsxs("p", { className: "text-xs font-semibold uppercase tracking-[0.3em]", children: [diagnostic.code, " \u00B7 ", diagnostic.level] }), _jsx("p", { className: "text-sm", children: diagnostic.message }), diagnostic.hint ? _jsx("p", { className: "text-[11px] text-slate-700", children: diagnostic.hint }) : null] }, `${diagnostic.code}-${index}`)))] })) : null] })] })) })] }) }));
    const renderEndpointCardStatus = (run) => {
        if (!run) {
            return (_jsx("span", { className: "inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 dark:border-slate-600", children: "No runs" }));
        }
        const style = statusStyles[run.status];
        return (_jsxs("span", { className: `inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] ${style.badge}`, title: run.error ?? undefined, children: [_jsx("span", { className: `h-2 w-2 rounded-full ${style.dot}` }), run.status.toLowerCase(), run.completedAt ? _jsxs(_Fragment, { children: [" \u00B7 ", formatRelativeTime(run.completedAt)] }) : null] }));
    };
    const renderEndpointsSection = () => {
        return (_jsxs("div", { className: "space-y-6", children: [_jsxs("section", { className: "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900", children: [_jsxs("div", { className: "flex flex-wrap items-start justify-between gap-3", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Endpoint templates" }), _jsx("p", { className: "text-xs text-slate-500", children: "Launch a registration flow for JDBC, HTTP, or streaming sources without leaving the designer." })] }), _jsx("button", { type: "button", onClick: () => handleOpenRegistration(), className: "rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white shadow hover:bg-slate-800 dark:bg-emerald-500 dark:text-slate-900", children: "+ Register endpoint" })] }), _jsx("p", { className: "mt-3 text-xs text-slate-500", children: "Selecting a family opens the dedicated registration workspace with the right fields, agent brief, and validation." }), _jsx("div", { className: "mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3", children: templateFamilies.map((family) => {
                                const templateCount = metadataTemplatesByFamily[family.id]?.length ?? 0;
                                return (_jsxs("button", { type: "button", onClick: () => handleOpenRegistration(undefined, family.id), className: "rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200", children: [_jsx("p", { className: "text-base font-semibold", children: family.label }), _jsxs("p", { className: "text-xs uppercase tracking-[0.3em] text-slate-400", children: [templateCount, " templates"] }), _jsx("p", { className: "mt-2 text-xs text-slate-500 dark:text-slate-400", children: family.description })] }, family.id));
                            }) })] }), _jsxs("section", { className: "space-y-4", children: [metadataEndpoints.length === 0 ? (_jsx("p", { className: "rounded-2xl border border-dashed border-slate-300 px-6 py-6 text-sm text-slate-500 dark:border-slate-700", "data-testid": "metadata-endpoint-empty", children: "No metadata endpoints have been registered yet." })) : null, metadataEndpoints.map((endpoint) => {
                            const latestRun = metadataLatestRunByEndpoint.get(endpoint.id);
                            const declaredCapabilities = endpoint.capabilities ?? [];
                            const hasDeclaredCapabilities = declaredCapabilities.length > 0;
                            const supportsMetadataCapability = !hasDeclaredCapabilities || declaredCapabilities.includes("metadata");
                            const supportsPreviewCapability = !hasDeclaredCapabilities || declaredCapabilities.includes("preview");
                            const collectionBlockedReason = hasDeclaredCapabilities && !supportsMetadataCapability
                                ? "Metadata collections disabled: this endpoint is missing the \"metadata\" capability."
                                : null;
                            const previewBlockedReason = hasDeclaredCapabilities && !supportsPreviewCapability
                                ? "Dataset previews disabled: this endpoint is missing the \"preview\" capability."
                                : null;
                            return (_jsxs("article", { "data-testid": "metadata-endpoint-card", className: "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsxs("div", { className: "flex-1", children: [_jsx("p", { className: "text-lg font-semibold text-slate-900 dark:text-slate-50", children: endpoint.name }), _jsx("p", { className: "text-sm text-slate-600 dark:text-slate-300", children: endpoint.description ?? endpoint.url }), endpoint.detectedVersion ? (_jsxs("p", { className: "text-xs text-slate-500 dark:text-slate-400", children: ["Detected version \u00B7 ", endpoint.detectedVersion] })) : endpoint.versionHint ? (_jsxs("p", { className: "text-xs text-slate-500 dark:text-slate-400", children: ["Version hint \u00B7 ", endpoint.versionHint] })) : null] }), renderEndpointCardStatus(latestRun), _jsx("button", { type: "button", onClick: () => setMetadataEndpointDetailId(endpoint.id), className: "rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-500 transition hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300", children: "Details" })] }), latestRun?.status === "SKIPPED" ? (_jsx("p", { className: "mt-2 text-xs text-amber-600 dark:text-amber-300", "data-testid": "metadata-endpoint-skip", children: latestRun.error ?? "Collection skipped due to missing capability." })) : null, _jsx("p", { className: "mt-3 break-all text-xs font-mono text-slate-500 dark:text-slate-400", children: endpoint.url }), endpoint.domain ? (_jsxs("p", { className: "mt-1 text-xs text-slate-500 dark:text-slate-400", children: ["Domain \u00B7 ", endpoint.domain] })) : null, endpoint.labels?.length ? (_jsx("div", { className: "mt-3 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500", children: endpoint.labels.map((label) => (_jsx("span", { className: "rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-600", children: label }, label))) })) : null, endpoint.capabilities?.length ? (_jsx("div", { className: "mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-400", children: endpoint.capabilities.map((capability) => (_jsx("span", { className: "rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-600", children: capability }, capability))) })) : null, collectionBlockedReason ? (_jsx("div", { className: "mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100", children: collectionBlockedReason })) : null, previewBlockedReason ? (_jsx("div", { className: "mt-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/10 dark:text-sky-100", children: previewBlockedReason })) : null, _jsxs("div", { className: "mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300", children: [_jsx("label", { className: "text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-500", children: "Schema override" }), _jsx("input", { value: metadataRunOverrides[endpoint.id] ?? "", onChange: (event) => setMetadataRunOverrides((prev) => ({
                                                    ...prev,
                                                    [endpoint.id]: event.target.value,
                                                })), placeholder: "public, analytics", className: "w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100" }), _jsxs("button", { type: "button", onClick: () => handleTriggerMetadataRun(endpoint.id), className: `inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.3em] transition ${supportsMetadataCapability
                                                    ? "border-slate-300 text-slate-600 hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-200"
                                                    : "border-slate-200 text-slate-400 dark:border-slate-700 dark:text-slate-600"}`, disabled: !supportsMetadataCapability, title: collectionBlockedReason ?? undefined, children: [_jsx(LuSquarePlus, { className: "h-4 w-4" }), "Trigger collection"] })] })] }, endpoint.id));
                        })] })] }));
    };
    const renderCollectionsSection = () => (_jsx("div", { className: "space-y-4", "data-testid": "metadata-collections-panel", children: sortedMetadataRuns.length === 0 ? (_jsx("p", { className: "rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-500 dark:border-slate-700", "data-testid": "metadata-collections-empty", children: "No collection runs recorded yet. Trigger a run from the endpoint cards." })) : (sortedMetadataRuns.map((run) => (_jsxs("article", { className: "rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400", children: [_jsx("span", { children: run.status }), _jsxs("span", { children: ["\u00B7 Requested ", formatDateTime(run.requestedAt)] })] }), _jsx("p", { className: "mt-1 text-base font-medium text-slate-900 dark:text-white", children: run.endpoint?.name ?? "Unknown endpoint" }), _jsxs("div", { className: "mt-2 grid gap-1 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-3", children: [_jsxs("span", { children: ["Started: ", run.startedAt ? formatDateTime(run.startedAt) : "—"] }), _jsxs("span", { children: ["Completed: ", run.completedAt ? formatDateTime(run.completedAt) : "—"] }), _jsxs("span", { children: ["Run ID: ", run.id] })] }), run.error ? (_jsx("p", { className: "mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-400/60 dark:bg-rose-950/40 dark:text-rose-200", children: run.error })) : null] }, run.id)))) }));
    const renderOverviewContent = () => {
        if (metadataSection === "catalog") {
            return renderCatalogSection();
        }
        if (metadataLoading) {
            return (_jsxs("p", { className: "flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300", children: [_jsx(LuHistory, { className: "h-4 w-4 animate-spin" }), "Loading metadata\u2026"] }));
        }
        if (metadataError) {
            return (_jsx("p", { className: "rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/60 dark:bg-rose-950/40 dark:text-rose-200", children: metadataError }));
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
    const endpointDatasets = metadataEndpointDetail ? endpointDatasetRecords[metadataEndpointDetail.id] ?? [] : [];
    const endpointDatasetsError = metadataEndpointDetail ? endpointDatasetErrors[metadataEndpointDetail.id] ?? null : null;
    const isEndpointDatasetsLoading = metadataEndpointDetail
        ? Boolean(endpointDatasetLoading[metadataEndpointDetail.id])
        : false;
    const detailHasRunningRun = metadataEndpointDetail?.runs.some((run) => run.status === "RUNNING") ?? false;
    const showDetailMutationError = metadataView === "overview" && Boolean(metadataMutationError);
    return (_jsxs(_Fragment, { children: [_jsxs("section", { className: "flex flex-1 bg-slate-50 dark:bg-slate-950", children: [_jsx("aside", { className: `hidden border-r border-slate-200 bg-white/80 py-5 transition-[width] dark:border-slate-800 dark:bg-slate-900/40 lg:flex ${sectionNavCollapsed ? "w-14 px-1.5" : "w-56 px-3.5"}`, children: _jsxs("div", { className: "flex w-full flex-col gap-5", children: [_jsxs("div", { className: "flex items-center justify-between px-1.5", children: [!sectionNavCollapsed && (_jsx("p", { className: "text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Navigation" })), _jsx("button", { type: "button", onClick: () => setSectionNavCollapsed((prev) => !prev), className: "inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 transition hover:border-slate-900 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300", children: sectionNavCollapsed ? "›" : "‹" })] }), _jsx("div", { className: "space-y-1.5", children: metadataNavItems.map((entry) => {
                                        const Icon = entry.icon;
                                        const isActive = metadataView === "overview" && metadataSection === entry.id;
                                        return (_jsxs("button", { type: "button", onClick: () => {
                                                setMetadataView("overview");
                                                setMetadataSection(entry.id);
                                            }, className: `group flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${isActive
                                                ? "border-slate-900 bg-slate-900 text-white shadow-sm dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900"
                                                : "border-slate-200 text-slate-600 hover:border-slate-900 hover:text-slate-900 dark:border-slate-700 dark:text-slate-200"}`, title: sectionNavCollapsed ? entry.label : undefined, children: [_jsx(Icon, { className: "h-4 w-4 shrink-0" }), !sectionNavCollapsed ? (_jsxs("div", { className: "min-w-0", children: [_jsx("p", { className: "truncate text-sm font-semibold", children: entry.label }), _jsx("p", { className: "text-[10px] uppercase tracking-[0.25em] text-slate-400", children: entry.description })] })) : null] }, entry.id));
                                    }) })] }) }), _jsxs("div", { className: "flex flex-1 flex-col", children: [_jsxs("header", { className: "flex flex-wrap items-center justify-between border-b border-slate-200 px-8 py-6 dark:border-slate-800", children: [_jsxs("div", { children: [_jsx("p", { className: "text-sm font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Metadata workspace" }), _jsx("h2", { className: "mt-1 text-3xl font-bold text-slate-900 dark:text-white", children: metadataView === "endpoint-register" ? "Register endpoint" : "Catalog & collections" }), _jsx("p", { className: "mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300", children: metadataView === "endpoint-register"
                                                    ? "Onboard a new data source, capture connection requirements, and brief an agent for credential collection."
                                                    : "Inspect datasets powering the designer, review registered endpoints, and monitor recent metadata collection runs without leaving the reporting workspace." })] }), metadataView === "endpoint-register" ? (_jsx("button", { type: "button", onClick: handleCloseRegistration, className: "mt-4 inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300 lg:mt-0", children: "\u2190 Back to overview" })) : (_jsxs("div", { className: "mt-4 flex flex-wrap items-center gap-2 lg:mt-0", children: [_jsxs("button", { type: "button", onClick: refreshMetadataWorkspace, className: "inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm text-slate-600 transition hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300", children: [_jsx(LuRefreshCcw, { className: "h-4 w-4" }), " Refresh"] }), _jsxs("button", { type: "button", onClick: () => handleOpenRegistration(), className: "inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-white shadow transition hover:bg-slate-800 dark:bg-emerald-500 dark:text-slate-900", "data-testid": "metadata-register-open", children: [_jsx(LuSquarePlus, { className: "h-4 w-4" }), " Register endpoint"] })] }))] }), metadataView === "overview" ? (_jsxs("div", { className: "flex flex-wrap items-center gap-3 px-8 py-4 lg:hidden", children: [metadataSectionTabs.map((tab) => (_jsx("button", { type: "button", onClick: () => setMetadataSection(tab.id), className: `rounded-full px-4 py-1.5 text-sm font-semibold transition ${metadataSection === tab.id
                                            ? "bg-slate-900 text-white shadow dark:bg-slate-100 dark:text-slate-900"
                                            : "border border-slate-300 text-slate-600 hover:border-slate-900 dark:border-slate-600 dark:text-slate-300"}`, children: tab.label }, tab.id))), _jsx("button", { type: "button", onClick: () => handleOpenRegistration(), className: "ml-auto rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.3em] text-white shadow hover:bg-slate-800 dark:bg-emerald-500 dark:text-slate-900", "data-testid": "metadata-register-open", children: "Register endpoint" })] })) : null, _jsx("div", { className: "flex-1 overflow-y-auto px-8 pb-8", children: metadataView === "overview" ? renderOverviewContent() : renderEndpointRegistrationPage() })] })] }), metadataDatasetDetail ? (_jsxs("div", { className: "fixed inset-0 z-40 flex justify-end", children: [_jsx("div", { className: "absolute inset-0 bg-slate-900/40", onClick: () => setMetadataDatasetDetailId(null) }), _jsxs("section", { className: "relative flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white px-6 py-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950", "data-testid": "metadata-dataset-detail-drawer", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500", children: "Dataset detail" }), _jsx("p", { className: "text-base font-semibold text-slate-900 dark:text-white", children: metadataDatasetDetail.displayName }), _jsx("p", { className: "text-xs uppercase tracking-[0.3em] text-slate-500", children: metadataDatasetDetail.id })] }), _jsx("button", { type: "button", onClick: () => setMetadataDatasetDetailId(null), className: "rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:border-slate-700", children: "Close" })] }), _jsxs("div", { className: "scrollbar-thin flex-1 space-y-4 overflow-y-auto py-4 pr-1 text-sm text-slate-600 dark:text-slate-300", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Description" }), _jsx("p", { className: "mt-1 text-sm", children: metadataDatasetDetail.description ?? "No description provided yet." })] }), _jsxs("div", { className: "grid gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2", children: [_jsxs("span", { children: ["Endpoint \u00B7 ", metadataEndpointLookup.get(metadataDatasetDetail.sourceEndpointId ?? "")?.name ?? "Unlinked"] }), _jsxs("span", { children: ["Collected \u00B7 ", metadataDatasetDetail.collectedAt ? formatDateTime(metadataDatasetDetail.collectedAt) : "—"] }), _jsxs("span", { children: ["Entity \u00B7 ", metadataDatasetDetail.entity ?? "—"] }), _jsxs("span", { children: ["Schema \u00B7 ", metadataDatasetDetail.schema ?? "—"] })] }), _jsxs("div", { children: [_jsxs("p", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: ["Fields (", metadataDatasetDetail.fields.length, ")"] }), _jsx("div", { className: "mt-2 space-y-2", children: metadataDatasetDetail.fields.map((field) => (_jsxs("div", { className: "rounded-2xl border border-slate-200 px-3 py-2 dark:border-slate-700", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "font-medium text-slate-900 dark:text-slate-100", children: field.name }), _jsx("span", { className: "text-[11px] uppercase tracking-[0.3em] text-slate-400", children: field.type })] }), field.description ? _jsx("p", { className: "text-xs text-slate-500 dark:text-slate-400", children: field.description }) : null] }, field.name))) })] }), metadataCatalogPreviewRows[metadataDatasetDetail.id]?.rows?.length ? (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Recent preview" }), _jsx("div", { className: "mt-2 max-h-48 overflow-auto rounded-2xl border border-slate-200 dark:border-slate-700", children: _jsxs("table", { className: "min-w-full divide-y divide-slate-200 text-xs dark:divide-slate-800", children: [_jsx("thead", { className: "bg-slate-50 text-left font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300", children: _jsx("tr", { children: previewTableColumns(metadataCatalogPreviewRows[metadataDatasetDetail.id].rows).map((column) => (_jsx("th", { className: "px-3 py-2 uppercase tracking-[0.3em] text-[10px] text-slate-400", children: column }, column))) }) }), _jsx("tbody", { children: metadataCatalogPreviewRows[metadataDatasetDetail.id].rows.map((row, index) => (_jsx("tr", { className: "border-t border-slate-100 dark:border-slate-800", children: previewTableColumns(metadataCatalogPreviewRows[metadataDatasetDetail.id].rows).map((column) => (_jsx("td", { className: "px-3 py-2 text-slate-700 dark:text-slate-200", children: formatPreviewValue(row[column]) }, column))) }, index))) })] }) })] })) : null] })] })] })) : null, metadataEndpointDetail ? (_jsxs("div", { className: "fixed inset-0 z-40 flex justify-end", children: [_jsx("div", { className: "absolute inset-0 bg-slate-900/40", onClick: handleCloseEndpointDetail }), _jsxs("section", { className: "relative flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white px-6 py-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950", "data-testid": "metadata-endpoint-detail", children: [_jsxs("div", { className: "flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800", children: [_jsxs("div", { children: [_jsx("p", { className: "text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-500", children: "Endpoint detail" }), _jsx("p", { className: "text-base font-semibold text-slate-900 dark:text-white", children: metadataEndpointDetail.name }), _jsx("p", { className: "text-xs uppercase tracking-[0.3em] text-slate-500", children: metadataEndpointDetail.id })] }), _jsxs("div", { className: "flex items-center gap-2", children: [canModifyEndpoints ? (_jsx("button", { type: "button", onClick: () => handleOpenEndpointEdit(metadataEndpointDetail), className: "rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-600 transition hover:border-slate-900 hover:text-slate-900 dark:border-slate-600 dark:text-slate-300", children: "Edit" })) : null, canDeleteEndpoints ? (_jsx("button", { type: "button", onClick: () => handleDeleteMetadataEndpoint(metadataEndpointDetail), disabled: metadataDeletingEndpointId === metadataEndpointDetail.id || detailHasRunningRun, title: detailHasRunningRun
                                                    ? "Cannot delete while a collection is running."
                                                    : undefined, className: "rounded-full border border-rose-200 px-3 py-1 text-sm text-rose-600 transition hover:border-rose-500 hover:text-rose-800 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-500/40 dark:text-rose-200", children: metadataDeletingEndpointId === metadataEndpointDetail.id ? "Deleting…" : "Delete" })) : null, _jsx("button", { type: "button", onClick: handleCloseEndpointDetail, className: "rounded-full border border-slate-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.25em] text-slate-500 dark:border-slate-700", children: "Close" })] })] }), showDetailMutationError ? (_jsx("p", { className: "mt-3 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-500/50 dark:bg-rose-950/40 dark:text-rose-200", children: metadataMutationError })) : null, _jsxs("div", { className: "scrollbar-thin flex-1 space-y-4 overflow-y-auto py-4 pr-1 text-sm text-slate-600 dark:text-slate-300", children: [_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Description" }), _jsx("p", { className: "mt-1 text-sm", children: metadataEndpointDetail.description ?? "No description provided yet." })] }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Connection" }), _jsx("p", { className: "mt-1 break-all font-mono text-xs text-slate-500 dark:text-slate-400", children: metadataEndpointDetail.url })] }), _jsxs("div", { className: "grid gap-2 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-2", children: [_jsxs("span", { children: ["Detected version \u00B7 ", metadataEndpointDetail.detectedVersion ?? metadataEndpointDetail.versionHint ?? "—"] }), _jsxs("span", { children: ["Verb \u00B7 ", metadataEndpointDetail.verb] })] }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Config payload" }), _jsx("pre", { className: "mt-2 overflow-x-auto rounded-xl bg-slate-100 p-3 text-[12px] dark:bg-slate-900/40", children: JSON.stringify(metadataEndpointDetail.config, null, 2) })] }), metadataEndpointDetail.capabilities?.length ? (_jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Capabilities" }), _jsx("div", { className: "mt-2 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.3em] text-slate-400", children: metadataEndpointDetail.capabilities.map((capability) => (_jsx("span", { className: "rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-700", children: capability }, capability))) })] })) : null, _jsxs("div", { children: [_jsxs("div", { className: "flex items-center justify-between gap-3", children: [_jsxs("p", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: ["Datasets (", endpointDatasets.length, ")"] }), _jsxs("button", { type: "button", onClick: () => metadataEndpointDetail?.id && loadEndpointDatasets(metadataEndpointDetail.id, { force: true }), className: "inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-500 transition hover:border-slate-900 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300", disabled: isEndpointDatasetsLoading, children: [_jsx(LuRefreshCcw, { className: "h-3 w-3" }), "Refresh"] })] }), endpointDatasetsError ? (_jsx("p", { className: "mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200", children: endpointDatasetsError })) : isEndpointDatasetsLoading ? (_jsx("p", { className: "mt-2 text-xs text-slate-500", children: "Loading datasets\u2026" })) : endpointDatasets.length === 0 ? (_jsxs("p", { className: "mt-2 text-xs text-slate-500", children: ["No catalog entries linked yet. Tag catalog records with ", _jsxs("code", { children: ["endpoint:", metadataEndpointDetail.id] }), " once collections complete."] })) : (_jsx("ul", { className: "mt-2 space-y-2", children: endpointDatasets.map((dataset) => {
                                                    const datasetPayload = dataset.payload?.dataset ?? {};
                                                    const displayName = datasetPayload.displayName ?? dataset.id;
                                                    const description = datasetPayload.description ?? "No description provided.";
                                                    return (_jsxs("li", { className: "rounded-2xl border border-slate-200 px-3 py-2 dark:border-slate-700", children: [_jsx("p", { className: "text-sm font-semibold text-slate-900 dark:text-white", children: displayName }), _jsx("p", { className: "text-xs text-slate-500", children: description }), _jsxs("div", { className: "mt-2 text-[11px] uppercase tracking-[0.3em] text-slate-400", children: ["Updated \u00B7 ", formatDateTime(dataset.updatedAt)] })] }, dataset.id));
                                                }) }))] }), _jsxs("div", { children: [_jsx("p", { className: "text-xs font-semibold uppercase tracking-[0.3em] text-slate-500", children: "Recent runs" }), metadataEndpointDetail.runs.length === 0 ? (_jsx("p", { className: "mt-2 text-xs text-slate-500", children: "No runs recorded yet." })) : (metadataEndpointDetail.runs.map((run) => (_jsxs("div", { className: "mt-2 rounded-xl border border-slate-200 px-3 py-2 text-xs dark:border-slate-700", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("span", { className: "font-semibold", children: run.status }), _jsx("span", { children: formatRelativeTime(run.requestedAt) })] }), run.error ? _jsx("p", { className: "mt-1 text-rose-600 dark:text-rose-300", children: run.error }) : null] }, run.id))))] })] })] })] })) : null] }));
}
