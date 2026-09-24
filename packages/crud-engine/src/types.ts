export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "lookup"
  | "fk"
  | "json"
  | "color"
  | "email";

export interface FieldConfig {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  unique?: boolean;
  readonly?: boolean;
  hiddenInForm?: boolean;
  lookupType?: string;
  fkEntity?: string;
  fkLabel?: string;
  default?: unknown;
  placeholder?: string;
  description?: string;
  min?: number;
  max?: number;
}

export interface EntityConfig {
  key: string;
  table: string;
  title: string;
  titlePlural: string;
  description?: string;
  fields: FieldConfig[];
  listColumns: string[];
  searchFields: string[];
  defaultSort?: { field: string; dir: "asc" | "desc" };
}
