export interface ConfirmationField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date';
  placeholder?: string;
  required: boolean;
  defaultValue?: string;
  behavior?: string; // e.g. "Auto-filled" or "Manual input"
}

export interface ConfirmationTemplate {
  id: string;
  name: string;
  code: string;
  active: boolean;
  fields: ConfirmationField[];
}
