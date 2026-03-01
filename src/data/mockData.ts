import { Job, StaffMember, CalendarEvent, HolidayRequest, Remnant, FileAsset, JobStage, Material } from "@/types";

export const mockStaff: StaffMember[] = [
  { staff_id: "S001", full_name: "James Whitfield", email: "james@enclave.co.uk", role: "Admin", department: "Office", employment_type: "Full-time", start_date: "2019-03-01", contracted_hours_per_week: 40, holiday_allowance_days: 28, holiday_balance_days: 14, active: true },
  { staff_id: "S002", full_name: "Laura Chen", email: "laura@enclave.co.uk", role: "Engineer", department: "CNC", employment_type: "Full-time", start_date: "2020-06-15", contracted_hours_per_week: 40, holiday_allowance_days: 25, holiday_balance_days: 12, active: true },
  { staff_id: "S003", full_name: "Tom Bradshaw", email: "tom@enclave.co.uk", role: "Operator", department: "CNC", employment_type: "Full-time", start_date: "2021-01-10", contracted_hours_per_week: 37.5, holiday_allowance_days: 25, holiday_balance_days: 8, active: true },
  { staff_id: "S004", full_name: "Sarah Mitchell", email: "sarah@enclave.co.uk", role: "Supervisor", department: "Assembly", employment_type: "Full-time", start_date: "2018-09-20", contracted_hours_per_week: 40, holiday_allowance_days: 28, holiday_balance_days: 16, active: true },
  { staff_id: "S005", full_name: "Dave Parsons", email: "dave@enclave.co.uk", role: "Operator", department: "Spray", employment_type: "Full-time", start_date: "2022-03-01", contracted_hours_per_week: 37.5, holiday_allowance_days: 25, holiday_balance_days: 20, active: true },
  { staff_id: "S006", full_name: "Emma Hughes", email: "emma@enclave.co.uk", role: "Office", department: "Office", employment_type: "Part-time", start_date: "2023-01-15", contracted_hours_per_week: 20, holiday_allowance_days: 14, holiday_balance_days: 10, active: true },
];

export const mockJobs: Job[] = [
  { job_id: "J2024-001", job_name: "Riverside Kitchen", created_date: "2024-11-01", status: "cutting", parts_count: 42, materials_count: 3, sheets_estimated: 8 },
  { job_id: "J2024-002", job_name: "Maple Lane Bathroom", created_date: "2024-11-05", status: "validated", parts_count: 18, materials_count: 2, sheets_estimated: 4 },
  { job_id: "J2024-003", job_name: "Oak House Study", created_date: "2024-11-08", status: "draft", parts_count: 24, materials_count: 2, sheets_estimated: 5 },
  { job_id: "J2024-004", job_name: "Hillcrest Wardrobes", created_date: "2024-11-10", status: "exported", parts_count: 56, materials_count: 4, sheets_estimated: 12 },
  { job_id: "J2024-005", job_name: "Manor Rd Utility", created_date: "2024-11-12", status: "complete", parts_count: 12, materials_count: 1, sheets_estimated: 2 },
];

export const mockStages: JobStage[] = [
  { stage_id: "ST001", job_id: "J2024-001", stage_name: "CNC", status: "In Progress", assigned_staff_ids: ["S003"], due_date: "2024-11-20", notes: "Running on Fabertec M1" },
  { stage_id: "ST002", job_id: "J2024-001", stage_name: "Edgebanding", status: "Not Started", assigned_staff_ids: [], due_date: "2024-11-22", notes: "" },
  { stage_id: "ST003", job_id: "J2024-001", stage_name: "Assembly", status: "Not Started", assigned_staff_ids: ["S004"], due_date: "2024-11-25", notes: "" },
  { stage_id: "ST004", job_id: "J2024-002", stage_name: "Programming", status: "In Progress", assigned_staff_ids: ["S002"], due_date: "2024-11-18", notes: "DXF files ready" },
  { stage_id: "ST005", job_id: "J2024-004", stage_name: "Spray", status: "Not Started", assigned_staff_ids: ["S005"], due_date: "2024-11-28", notes: "RAL 9010" },
];

export const mockEvents: CalendarEvent[] = [
  { event_id: "E001", title: "Riverside Kitchen - CNC Cut", event_type: "Production", start_datetime: "2024-11-18T08:00", end_datetime: "2024-11-18T17:00", assigned_staff_ids: ["S003"], job_id: "J2024-001", notes: "" },
  { event_id: "E002", title: "Team Meeting", event_type: "Meeting", start_datetime: "2024-11-19T09:00", end_datetime: "2024-11-19T10:00", assigned_staff_ids: ["S001","S002","S004"], notes: "Weekly sync" },
  { event_id: "E003", title: "Dave - Holiday", event_type: "Holiday", start_datetime: "2024-11-25T00:00", end_datetime: "2024-11-29T23:59", assigned_staff_ids: ["S005"], notes: "" },
  { event_id: "E004", title: "Machine Maintenance", event_type: "Maintenance", start_datetime: "2024-11-22T14:00", end_datetime: "2024-11-22T17:00", assigned_staff_ids: ["S002"], notes: "Fabertec M1 scheduled service" },
];

export const mockHolidayRequests: HolidayRequest[] = [
  { request_id: "HR001", staff_id: "S005", staff_name: "Dave Parsons", start_date: "2024-11-25", end_date: "2024-11-29", type: "Holiday", reason: "Family trip", status: "Approved" },
  { request_id: "HR002", staff_id: "S003", staff_name: "Tom Bradshaw", start_date: "2024-12-23", end_date: "2024-12-27", type: "Holiday", reason: "Christmas", status: "Pending" },
  { request_id: "HR003", staff_id: "S002", staff_name: "Laura Chen", start_date: "2024-12-02", end_date: "2024-12-02", type: "Appointment", reason: "Dentist", status: "Pending" },
];

export const mockRemnants: Remnant[] = [
  { remnant_id: "R001", material_code: "WH18", thickness_mm: 18, colour_name: "White", length_mm: 800, width_mm: 600, grain_direction: "length", location: "Rack A3", source_job_id: "J2024-005", status: "available", created_date: "2024-11-14" },
  { remnant_id: "R002", material_code: "OAK18", thickness_mm: 18, colour_name: "Natural Oak", length_mm: 1200, width_mm: 450, grain_direction: "length", location: "Rack B1", source_job_id: "J2024-001", status: "available", created_date: "2024-11-16" },
  { remnant_id: "R003", material_code: "WH18", thickness_mm: 18, colour_name: "White", length_mm: 500, width_mm: 400, grain_direction: "length", location: "Rack A5", source_job_id: "J2024-004", status: "reserved", created_date: "2024-11-15" },
  { remnant_id: "R004", material_code: "ANT25", thickness_mm: 25, colour_name: "Anthracite", length_mm: 900, width_mm: 700, grain_direction: "width", location: "Rack C2", source_job_id: "J2024-003", status: "available", created_date: "2024-11-10" },
];

export const mockFiles: FileAsset[] = [
  { file_id: "F001", title: "CNC Safety Procedures", category: "Safety", version: 3, uploaded_by: "James Whitfield", uploaded_at: "2024-10-01", requires_acknowledgement: true, acknowledged_pct: 67, status: "active" },
  { file_id: "F002", title: "Fabertec M1 Operating Manual", category: "Machine", version: 1, uploaded_by: "Laura Chen", uploaded_at: "2024-08-15", requires_acknowledgement: true, acknowledged_pct: 83, status: "active" },
  { file_id: "F003", title: "Edgebanding SOP", category: "SOP", version: 2, uploaded_by: "Sarah Mitchell", uploaded_at: "2024-09-20", requires_acknowledgement: true, acknowledged_pct: 50, status: "active" },
  { file_id: "F004", title: "Holiday Policy 2024", category: "HR", version: 1, uploaded_by: "Emma Hughes", uploaded_at: "2024-01-05", requires_acknowledgement: false, acknowledged_pct: 100, status: "active" },
  { file_id: "F005", title: "Spray Booth Extraction Guide", category: "Safety", version: 1, uploaded_by: "Dave Parsons", uploaded_at: "2024-07-10", requires_acknowledgement: true, acknowledged_pct: 33, status: "active" },
];

export const mockMaterials: Material[] = [
  { material_code: "WH18", display_name: "White Melamine 18mm", thickness_mm: 18, sheet_length_mm: 2440, sheet_width_mm: 1220, grain_direction: "length", colour_name: "White", cost_per_sheet: 28, active: true },
  { material_code: "OAK18", display_name: "Natural Oak Veneer 18mm", thickness_mm: 18, sheet_length_mm: 2440, sheet_width_mm: 1220, grain_direction: "length", colour_name: "Natural Oak", cost_per_sheet: 65, active: true },
  { material_code: "ANT25", display_name: "Anthracite MDF 25mm", thickness_mm: 25, sheet_length_mm: 2440, sheet_width_mm: 1220, grain_direction: "width", colour_name: "Anthracite", cost_per_sheet: 42, active: true },
  { material_code: "BIR12", display_name: "Birch Ply 12mm", thickness_mm: 12, sheet_length_mm: 2440, sheet_width_mm: 1220, grain_direction: "length", colour_name: "Birch", cost_per_sheet: 38, active: true },
];
