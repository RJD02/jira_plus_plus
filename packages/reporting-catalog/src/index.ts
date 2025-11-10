export interface CatalogDatasetField {
  name: string;
  type: string;
  description?: string;
}

export interface CatalogDataset {
  id: string;
  displayName: string;
  description?: string;
  fields: CatalogDatasetField[];
  source?: string;
}

export interface CatalogProvider {
  listDatasets(): Promise<CatalogDataset[]>;
  getDataset(id: string): Promise<CatalogDataset | null>;
}

export class FileCatalogProvider implements CatalogProvider {
  constructor(private readonly manifest: CatalogDataset[]) {}

  async listDatasets(): Promise<CatalogDataset[]> {
    return this.manifest;
  }

  async getDataset(id: string): Promise<CatalogDataset | null> {
    return this.manifest.find((dataset) => dataset.id === id) ?? null;
  }
}
