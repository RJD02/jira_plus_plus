import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yaml from "js-yaml";
import { z } from "zod";
import { compileJsonSchema } from "../utils/schema.js";

const SkillManifestSchema = z.object({
  id: z.string().min(1),
  goal: z.string().min(1),
  version: z.union([z.string().min(1), z.number()]).transform((value) => String(value)),
  model: z.object({
    provider: z.enum(["openai", "anthropic", "ollama"]),
    name: z.string().min(1),
    temperature: z.number().min(0).max(2).optional(),
    topP: z.number().min(0).max(1).optional(),
  }),
  template: z.string().min(1),
  inputSchema: z.record(z.any()),
  outputSchema: z.record(z.any()),
  cache: z
    .object({
      enabled: z.boolean().default(false),
      ttlSeconds: z.number().int().positive().default(900),
    })
    .default({ enabled: false, ttlSeconds: 900 }),
  metadata: z.record(z.any()).optional(),
});

export class SkillRegistry {
  constructor(logger) {
    this.logger = logger;
    this.skills = new Map();
    this.registryRoot = null;
  }

  async loadFromDirectory(directory) {
    const resolved = path.resolve(directory);
    this.registryRoot = resolved;
    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const manifests = [];

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".yaml") && !entry.name.endsWith(".yml")) continue;

      const filePath = path.join(resolved, entry.name);
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = SkillManifestSchema.parse(yaml.load(raw));

      manifests.push({
        manifest: parsed,
        templateHash: hashTemplate(parsed.template),
        inputParser: compileJsonSchema(parsed.inputSchema),
        outputParser: compileJsonSchema(parsed.outputSchema),
      });
    }

    this.skills.clear();
    for (const compiled of manifests) {
      const { id } = compiled.manifest;
      if (this.skills.has(id)) {
        this.logger?.warn?.("Duplicate skill ID detected, overriding previous definition", { skillId: id });
      }
      this.skills.set(id, compiled);
    }

    this.logger?.info?.("Skill registry loaded", { count: this.skills.size, directory: resolved });
  }

  listSkills() {
    return Array.from(this.skills.values()).map((entry) => entry.manifest);
  }

  getCompiledSkill(skillId) {
    const definition = this.skills.get(skillId);
    if (!definition) {
      throw new Error(`Skill ${skillId} not found in registry`);
    }
    return definition;
  }

  overrideSkillModel(skillId, overrides) {
    const entry = this.skills.get(skillId);
    if (!entry) {
      this.logger?.warn?.("Attempted to override unknown skill", { skillId });
      return;
    }
    entry.manifest.model = {
      ...entry.manifest.model,
      ...overrides,
    };
    this.logger?.info?.("Skill model overrides applied", {
      skillId,
      provider: entry.manifest.model.provider,
      model: entry.manifest.model.name,
    });
  }

  async reload() {
    if (!this.registryRoot) {
      throw new Error("Skill registry root not configured. Call loadFromDirectory first.");
    }
    await this.loadFromDirectory(this.registryRoot);
  }
}

function hashTemplate(template) {
  return crypto.createHash("sha256").update(template).digest("hex");
}
