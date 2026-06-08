import { writable } from 'svelte/store';

export type HeaderToolbarAction = {
  id: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  danger?: boolean;
  primary?: boolean;
  onClick: () => void | Promise<void>;
};

export type HeaderToolbarPathControl = {
  value: string;
  placeholder: string;
  invalid?: boolean;
  onInput: (value: string) => void;
};

export type HeaderToolbarState = {
  crumbLabel?: string;
  path?: HeaderToolbarPathControl;
  status?: {
    label: string;
    tone?: 'muted' | 'dirty' | 'saving' | 'error';
  };
  actions: HeaderToolbarAction[];
};

export const headerToolbar = writable<HeaderToolbarState | null>(null);
