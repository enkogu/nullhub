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
  /** Page-specific controls (instance selector, filters) merged into the header band before the built-in view switcher. */
  headerControls?: import("svelte").Snippet;
  /** Page-specific actions (e.g. "+ New") merged into the header band before Refresh. */
  headerActions?: import("svelte").Snippet;
  /** When embedded inside another page that already renders a PageHeader: hide the title/subtitle and show only a slim view/search/sort toolbar. */
  hideHeader?: boolean;
  records?: EntityRecord[];
  columns?: EntityColumn[];
  views?: EntityViewDefinition[];
  defaultViewId?: string;
  loading?: boolean;
  error?: unknown;
  emptyTitle?: string;
  emptyDescription?: string;
  refreshLabel?: string;
  onRefresh?: () => void | Promise<void>;
  onSelect?: (record: EntityRecord) => void;
  onOpen?: (record: EntityRecord) => void;
  actions?: EntityViewAction[];
};
