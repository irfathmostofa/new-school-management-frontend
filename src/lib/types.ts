export type Permission = { module: string; resource: string; action: string };

export type RoleSummary = {
  id: number;
  code: string;
  name: string;
  campus_id: number | null;
  campus_name: string | null;
  valid_from: string;
  valid_to: string | null;
};

export type SessionUser = {
  id: number;
  email: string;
  first_name: string;
  last_name: string | null;
  display_name: string;
  profile_type: string;
  profile_label: string;
  status: string;
  status_label: string;
  is_super_admin: boolean;
  last_login_at: string | null;
  roles: RoleSummary[];
  permissions: Permission[];
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export type UserRow = {
  id: number;
  email: string;
  first_name: string;
  last_name: string | null;
  profile_type: string;
  profile_label: string;
  status: string;
  status_label: string;
  roles: string | null;
  last_login_at: string | null;
  created_at: string;
};

export type RoleRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_system: number;
  status: string;
  status_label: string;
  user_count: number;
  permission_count: number;
  created_at: string;
};

export type Lookup = { id: number; code: string; label: string; sort_order: number; is_final: number };
