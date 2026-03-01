export type StaffRole = "Admin" | "Engineer" | "Supervisor" | "Operator" | "Office" | "Viewer";
export type Department = "CNC" | "Assembly" | "Spray" | "Install" | "Office";
export type JobStatus = "draft" | "validated" | "exported" | "cutting" | "complete";
export type StageStatus = "Not Started" | "In Progress" | "Blocked" | "Done";
export type StageName = "Design" | "Programming" | "CNC" | "Edgebanding" | "Assembly" | "Spray" | "Install";
export type EventType = "Production" | "Install" | "Meeting" | "Holiday" | "Sick" | "Training" | "Maintenance";
export type HolidayStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";
export type HolidayType = "Holiday" | "Sick" | "Unpaid" | "Appointment";
export type RemnantStatus = "available" | "reserved" | "used" | "discarded";
export type FileCategory = "SOP" | "Safety" | "Machine" | "HR" | "JobPack" | "Template" | "Other";

export interface StaffMember {
  staff_id: string;
  full_name: string;
  email: string;
  role: StaffRole;
  department: Department;
  employment_type: string;
  start_date: string;
  contracted_hours_per_week: number;
  holiday_allowance_days: number;
  holiday_balance_days: number;
  active: boolean;
}

export interface Job {
  job_id: string;
  job_name: string;
  created_date: string;
  status: JobStatus;
  parts_count: number;
  materials_count: number;
  sheets_estimated: number;
}

export interface JobStage {
  stage_id: string;
  job_id: string;
  stage_name: StageName;
  status: StageStatus;
  assigned_staff_ids: string[];
  due_date: string;
  notes: string;
}

export interface CalendarEvent {
  event_id: string;
  title: string;
  event_type: EventType;
  start_datetime: string;
  end_datetime: string;
  assigned_staff_ids: string[];
  job_id?: string;
  notes: string;
}

export interface HolidayRequest {
  request_id: string;
  staff_id: string;
  staff_name: string;
  start_date: string;
  end_date: string;
  type: HolidayType;
  reason: string;
  status: HolidayStatus;
}

export interface Material {
  material_code: string;
  display_name: string;
  thickness_mm: number;
  sheet_length_mm: number;
  sheet_width_mm: number;
  grain_direction: "length" | "width";
  colour_name: string;
  cost_per_sheet?: number;
  active: boolean;
}

export interface Remnant {
  remnant_id: string;
  material_code: string;
  thickness_mm: number;
  colour_name: string;
  length_mm: number;
  width_mm: number;
  grain_direction: "length" | "width";
  location: string;
  source_job_id: string;
  status: RemnantStatus;
  created_date: string;
}

export interface FileAsset {
  file_id: string;
  title: string;
  category: FileCategory;
  version: number;
  uploaded_by: string;
  uploaded_at: string;
  requires_acknowledgement: boolean;
  acknowledged_pct: number;
  status: "active" | "archived";
}
