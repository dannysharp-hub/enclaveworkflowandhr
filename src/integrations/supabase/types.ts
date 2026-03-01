export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      calendar_events: {
        Row: {
          assigned_staff_ids: string[] | null
          created_at: string
          end_datetime: string
          event_type: string
          id: string
          job_id: string | null
          notes: string | null
          start_datetime: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_staff_ids?: string[] | null
          created_at?: string
          end_datetime: string
          event_type: string
          id?: string
          job_id?: string | null
          notes?: string | null
          start_datetime: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_staff_ids?: string[] | null
          created_at?: string
          end_datetime?: string
          event_type?: string
          id?: string
          job_id?: string | null
          notes?: string | null
          start_datetime?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      file_assets: {
        Row: {
          acknowledgement_type: string | null
          category: string
          created_at: string
          department_visibility:
            | Database["public"]["Enums"]["app_department"][]
            | null
          file_reference: string | null
          id: string
          mandatory_for_departments:
            | Database["public"]["Enums"]["app_department"][]
            | null
          mandatory_for_roles: Database["public"]["Enums"]["app_role"][] | null
          requires_acknowledgement: boolean
          role_visibility: Database["public"]["Enums"]["app_role"][] | null
          status: string
          title: string
          updated_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          acknowledgement_type?: string | null
          category?: string
          created_at?: string
          department_visibility?:
            | Database["public"]["Enums"]["app_department"][]
            | null
          file_reference?: string | null
          id?: string
          mandatory_for_departments?:
            | Database["public"]["Enums"]["app_department"][]
            | null
          mandatory_for_roles?: Database["public"]["Enums"]["app_role"][] | null
          requires_acknowledgement?: boolean
          role_visibility?: Database["public"]["Enums"]["app_role"][] | null
          status?: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          acknowledgement_type?: string | null
          category?: string
          created_at?: string
          department_visibility?:
            | Database["public"]["Enums"]["app_department"][]
            | null
          file_reference?: string | null
          id?: string
          mandatory_for_departments?:
            | Database["public"]["Enums"]["app_department"][]
            | null
          mandatory_for_roles?: Database["public"]["Enums"]["app_role"][] | null
          requires_acknowledgement?: boolean
          role_visibility?: Database["public"]["Enums"]["app_role"][] | null
          status?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: []
      }
      file_read_receipts: {
        Row: {
          acknowledged: boolean
          acknowledged_at: string | null
          file_id: string
          file_version_at_read: number
          first_opened_at: string
          id: string
          last_opened_at: string
          open_count: number
          staff_id: string
        }
        Insert: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          file_id: string
          file_version_at_read?: number
          first_opened_at?: string
          id?: string
          last_opened_at?: string
          open_count?: number
          staff_id: string
        }
        Update: {
          acknowledged?: boolean
          acknowledged_at?: string | null
          file_id?: string
          file_version_at_read?: number
          first_opened_at?: string
          id?: string
          last_opened_at?: string
          open_count?: number
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_read_receipts_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      holiday_requests: {
        Row: {
          approver_staff_id: string | null
          created_at: string
          decision_notes: string | null
          end_date: string
          id: string
          reason: string | null
          staff_id: string
          start_date: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          approver_staff_id?: string | null
          created_at?: string
          decision_notes?: string | null
          end_date: string
          id?: string
          reason?: string | null
          staff_id: string
          start_date: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          approver_staff_id?: string | null
          created_at?: string
          decision_notes?: string | null
          end_date?: string
          id?: string
          reason?: string | null
          staff_id?: string
          start_date?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      job_stages: {
        Row: {
          assigned_staff_ids: string[] | null
          created_at: string
          due_date: string | null
          id: string
          job_id: string
          notes: string | null
          stage_name: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_staff_ids?: string[] | null
          created_at?: string
          due_date?: string | null
          id?: string
          job_id: string
          notes?: string | null
          stage_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_staff_ids?: string[] | null
          created_at?: string
          due_date?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          stage_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_stages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          allow_remnants: boolean
          created_at: string
          created_by: string | null
          created_date: string
          id: string
          job_id: string
          job_name: string
          margin_mm: number
          materials_count: number
          parts_count: number
          sheet_length_mm: number
          sheet_width_mm: number
          sheets_estimated: number
          spacing_mm: number
          status: string
          updated_at: string
        }
        Insert: {
          allow_remnants?: boolean
          created_at?: string
          created_by?: string | null
          created_date?: string
          id?: string
          job_id: string
          job_name: string
          margin_mm?: number
          materials_count?: number
          parts_count?: number
          sheet_length_mm?: number
          sheet_width_mm?: number
          sheets_estimated?: number
          spacing_mm?: number
          status?: string
          updated_at?: string
        }
        Update: {
          allow_remnants?: boolean
          created_at?: string
          created_by?: string | null
          created_date?: string
          id?: string
          job_id?: string
          job_name?: string
          margin_mm?: number
          materials_count?: number
          parts_count?: number
          sheet_length_mm?: number
          sheet_width_mm?: number
          sheets_estimated?: number
          spacing_mm?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      materials: {
        Row: {
          active: boolean
          colour_name: string
          cost_per_sheet: number | null
          created_at: string
          display_name: string
          grain_direction: string
          id: string
          material_code: string
          sheet_length_mm: number
          sheet_width_mm: number
          thickness_mm: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          colour_name: string
          cost_per_sheet?: number | null
          created_at?: string
          display_name: string
          grain_direction?: string
          id?: string
          material_code: string
          sheet_length_mm?: number
          sheet_width_mm?: number
          thickness_mm: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          colour_name?: string
          cost_per_sheet?: number | null
          created_at?: string
          display_name?: string
          grain_direction?: string
          id?: string
          material_code?: string
          sheet_length_mm?: number
          sheet_width_mm?: number
          thickness_mm?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      parts: {
        Row: {
          created_at: string
          dxf_file_reference: string | null
          grain_axis: string | null
          grain_required: boolean
          id: string
          job_id: string
          length_mm: number
          material_code: string | null
          part_id: string
          product_code: string
          quantity: number
          rotation_allowed: string | null
          updated_at: string
          validation_status: string | null
          width_mm: number
        }
        Insert: {
          created_at?: string
          dxf_file_reference?: string | null
          grain_axis?: string | null
          grain_required?: boolean
          id?: string
          job_id: string
          length_mm: number
          material_code?: string | null
          part_id: string
          product_code: string
          quantity?: number
          rotation_allowed?: string | null
          updated_at?: string
          validation_status?: string | null
          width_mm: number
        }
        Update: {
          created_at?: string
          dxf_file_reference?: string | null
          grain_axis?: string | null
          grain_required?: boolean
          id?: string
          job_id?: string
          length_mm?: number
          material_code?: string | null
          part_id?: string
          product_code?: string
          quantity?: number
          rotation_allowed?: string | null
          updated_at?: string
          validation_status?: string | null
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "parts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parts_material_code_fkey"
            columns: ["material_code"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["material_code"]
          },
        ]
      }
      product_mappings: {
        Row: {
          created_at: string
          default_grain_axis: string | null
          default_grain_required: boolean
          default_label_template_id: string | null
          default_rotation_allowed: string | null
          default_toolpath_template_id: string | null
          id: string
          material_code: string
          product_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_grain_axis?: string | null
          default_grain_required?: boolean
          default_label_template_id?: string | null
          default_rotation_allowed?: string | null
          default_toolpath_template_id?: string | null
          id?: string
          material_code: string
          product_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_grain_axis?: string | null
          default_grain_required?: boolean
          default_label_template_id?: string | null
          default_rotation_allowed?: string | null
          default_toolpath_template_id?: string | null
          id?: string
          material_code?: string
          product_code?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_mappings_default_toolpath_template_id_fkey"
            columns: ["default_toolpath_template_id"]
            isOneToOne: false
            referencedRelation: "toolpath_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_mappings_material_code_fkey"
            columns: ["material_code"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["material_code"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          contracted_hours_per_week: number
          created_at: string
          department: Database["public"]["Enums"]["app_department"]
          email: string
          employment_type: string
          full_name: string
          holiday_allowance_days: number
          holiday_balance_days: number
          id: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          contracted_hours_per_week?: number
          created_at?: string
          department?: Database["public"]["Enums"]["app_department"]
          email: string
          employment_type?: string
          full_name: string
          holiday_allowance_days?: number
          holiday_balance_days?: number
          id?: string
          start_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          contracted_hours_per_week?: number
          created_at?: string
          department?: Database["public"]["Enums"]["app_department"]
          email?: string
          employment_type?: string
          full_name?: string
          holiday_allowance_days?: number
          holiday_balance_days?: number
          id?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      remnants: {
        Row: {
          colour_name: string
          created_at: string
          created_date: string
          grain_direction: string
          id: string
          length_mm: number
          location: string
          material_code: string
          source_job_id: string | null
          status: string
          thickness_mm: number
          updated_at: string
          width_mm: number
        }
        Insert: {
          colour_name: string
          created_at?: string
          created_date?: string
          grain_direction?: string
          id?: string
          length_mm: number
          location?: string
          material_code: string
          source_job_id?: string | null
          status?: string
          thickness_mm: number
          updated_at?: string
          width_mm: number
        }
        Update: {
          colour_name?: string
          created_at?: string
          created_date?: string
          grain_direction?: string
          id?: string
          length_mm?: number
          location?: string
          material_code?: string
          source_job_id?: string | null
          status?: string
          thickness_mm?: number
          updated_at?: string
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "remnants_material_code_fkey"
            columns: ["material_code"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["material_code"]
          },
          {
            foreignKeyName: "remnants_source_job_id_fkey"
            columns: ["source_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          completed_date: string | null
          created_at: string
          due_date: string
          id: string
          notes: string | null
          outcome: string | null
          review_type: string
          reviewer_id: string | null
          staff_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_date?: string | null
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          outcome?: string | null
          review_type?: string
          reviewer_id?: string | null
          staff_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_date?: string | null
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          outcome?: string | null
          review_type?: string
          reviewer_id?: string | null
          staff_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      skills: {
        Row: {
          active: boolean
          category: string
          created_at: string
          default_expiry_period_months: number | null
          description: string | null
          id: string
          name: string
          requires_certification: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          default_expiry_period_months?: number | null
          description?: string | null
          id?: string
          name: string
          requires_certification?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          default_expiry_period_months?: number | null
          description?: string | null
          id?: string
          name?: string
          requires_certification?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      staff_skills: {
        Row: {
          assigned_by: string | null
          certification_expiry_date: string | null
          created_at: string
          id: string
          level: string
          notes: string | null
          skill_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          certification_expiry_date?: string | null
          created_at?: string
          id?: string
          level?: string
          notes?: string | null
          skill_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          certification_expiry_date?: string | null
          created_at?: string
          id?: string
          level?: string
          notes?: string | null
          skill_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_skill_requirements: {
        Row: {
          created_at: string
          id: string
          mandatory: boolean
          minimum_level: string
          skill_id: string
          stage_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mandatory?: boolean
          minimum_level?: string
          skill_id: string
          stage_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mandatory?: boolean
          minimum_level?: string
          skill_id?: string
          stage_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_skill_requirements_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      toolpath_templates: {
        Row: {
          active: boolean
          created_at: string
          file_reference: string | null
          id: string
          material_code: string | null
          name: string
          thickness_mm: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          file_reference?: string | null
          id?: string
          material_code?: string | null
          name: string
          thickness_mm?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          file_reference?: string | null
          id?: string
          material_code?: string | null
          name?: string
          thickness_mm?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "toolpath_templates_material_code_fkey"
            columns: ["material_code"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["material_code"]
          },
        ]
      }
      training_records: {
        Row: {
          completed_date: string
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          linked_document_id: string | null
          notes: string | null
          staff_id: string
          title: string
          trainer_name: string | null
          training_type: string
          updated_at: string
        }
        Insert: {
          completed_date?: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          linked_document_id?: string | null
          notes?: string | null
          staff_id: string
          title: string
          trainer_name?: string | null
          training_type?: string
          updated_at?: string
        }
        Update: {
          completed_date?: string
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          linked_document_id?: string | null
          notes?: string | null
          staff_id?: string
          title?: string
          trainer_name?: string | null
          training_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_records_linked_document_id_fkey"
            columns: ["linked_document_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_staff_stage_authorisation: {
        Args: { _staff_id: string; _stage_name: string }
        Returns: {
          authorised: boolean
          missing_skills: Json
        }[]
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_department: "CNC" | "Assembly" | "Spray" | "Install" | "Office"
      app_role:
        | "admin"
        | "engineer"
        | "supervisor"
        | "operator"
        | "office"
        | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_department: ["CNC", "Assembly", "Spray", "Install", "Office"],
      app_role: [
        "admin",
        "engineer",
        "supervisor",
        "operator",
        "office",
        "viewer",
      ],
    },
  },
} as const
