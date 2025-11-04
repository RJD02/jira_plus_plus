import { z } from "zod";

export function compileJsonSchema(schema) {
  if (!schema || typeof schema !== "object") {
    throw new Error("Invalid JSON schema definition");
  }
  switch (schema.type) {
    case "string": {
      let validator = z.string();
      if (typeof schema.minLength === "number") {
        validator = validator.min(schema.minLength);
      }
      if (typeof schema.maxLength === "number") {
        validator = validator.max(schema.maxLength);
      }
      if (schema.format === "email") {
        validator = validator.email();
      }
      if (schema.format === "uuid") {
        validator = validator.uuid();
      }
      if (schema.enum) {
        const enumValues = schema.enum.filter((value) => typeof value === "string");
        validator = validator.refine((value) => enumValues.includes(value), {
          message: `Must be one of: ${enumValues.join(", ")}`,
        });
      }
      return validator;
    }
    case "number":
    case "integer": {
      let validator = schema.type === "integer" ? z.number().int() : z.number();
      return validator;
    }
    case "boolean":
      return z.boolean();
    case "array": {
      if (!schema.items) {
        throw new Error("Array schema must define an 'items' property");
      }
      let validator = z.array(compileJsonSchema(schema.items));
      if (typeof schema.minItems === "number") {
        validator = validator.min(schema.minItems);
      }
      if (typeof schema.maxItems === "number") {
        validator = validator.max(schema.maxItems);
      }
      return validator;
    }
    case "object":
    case undefined: {
      const properties = schema.properties ?? {};
      const shape = {};
      const required = new Set(schema.required ?? []);

      for (const [key, value] of Object.entries(properties)) {
        const compiled = compileJsonSchema(value);
        shape[key] = required.has(key) ? compiled : compiled.optional();
      }

      let validator = z.object(shape);
      if (schema.additionalProperties === true || schema.additionalProperties === undefined) {
        validator = validator.catchall(z.any());
      } else if (typeof schema.additionalProperties === "object") {
        validator = validator.catchall(compileJsonSchema(schema.additionalProperties));
      } else {
        validator = validator.strict();
      }
      return validator;
    }
    default:
      throw new Error(`Unsupported JSON schema type: ${schema.type}`);
  }
}
