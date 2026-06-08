export type EntityViewMode =
  | "table"
  | "cards"
  | "kanban"
  | "list"
  | "split"
  | "timeline"
  | "calendar"
  | "tree"
  | "icons";

export type EntityFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | string[]
  | number[]
  | Record<string, unknown>;

export type EntityRecord = {
  id: string;
  title: string;
  subtitle?: string;
  type?: string;
  status?: string;
  description?: string;
  href?: string;
  parentId?: string;
  date?: string;
  start?: string;
  end?: string;
  icon?: string;
  muted?: boolean;
  fields?: Record<string, EntityFieldValue>;
  children?: EntityRecord[];
  raw?: unknown;
};

export type EntityColumn = {
  id: string;
  label: string;
  type?: "text" | "status" | "select" | "number" | "date" | "tags" | "mono";
  width?: string;
  accessor?: string | ((record: EntityRecord) => EntityFieldValue);
  primary?: boolean;
  hidden?: boolean;
  cardHidden?: boolean;
  detailHidden?: boolean;
  sortable?: boolean;
  groupable?: boolean;
};

export type EntityViewDefinition = {
  id: string;
  label: string;
  mode: EntityViewMode;
  groupBy?: string;
  dateField?: string;
  parentField?: string;
};

export type EntityViewAction = {
  id: string;
  label: string;
  variant?: "default" | "secondary" | "destructive";
  href?: (record: EntityRecord) => string;
  visible?: (record: EntityRecord) => boolean;
  run?: (record: EntityRecord) => void | Promise<void>;
};

export type UniversalEntityViewProps = {
  title: string;
  description?: string;
  records?: EntityRecord[];
  columns?: EntityColumn[];
  views?: EntityViewDefinition[];
  defaultViewId?: string;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  refreshLabel?: string;
  onRefresh?: () => void | Promise<void>;
  onSelect?: (record: EntityRecord) => void;
  onOpen?: (record: EntityRecord) => void;
  actions?: EntityViewAction[];
};
