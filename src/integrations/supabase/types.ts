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
      bills: {
        Row: {
          amount_ex_vat: number
          amount_paid: number
          bill_reference: string
          category: string
          created_at: string
          due_date: string
          external_id: string | null
          external_system: string | null
          id: string
          issue_date: string
          job_id: string | null
          last_synced_at: string | null
          notes: string | null
          pandle_export_batch_id: string | null
          pandle_exported: boolean
          pandle_exported_at: string | null
          payment_date: string | null
          status: string
          supplier_id: string
          sync_status: string
          tenant_id: string
          updated_at: string
          vat_amount: number
        }
        Insert: {
          amount_ex_vat?: number
          amount_paid?: number
          bill_reference: string
          category?: string
          created_at?: string
          due_date: string
          external_id?: string | null
          external_system?: string | null
          id?: string
          issue_date?: string
          job_id?: string | null
          last_synced_at?: string | null
          notes?: string | null
          pandle_export_batch_id?: string | null
          pandle_exported?: boolean
          pandle_exported_at?: string | null
          payment_date?: string | null
          status?: string
          supplier_id: string
          sync_status?: string
          tenant_id?: string
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          amount_ex_vat?: number
          amount_paid?: number
          bill_reference?: string
          category?: string
          created_at?: string
          due_date?: string
          external_id?: string | null
          external_system?: string | null
          id?: string
          issue_date?: string
          job_id?: string | null
          last_synced_at?: string | null
          notes?: string | null
          pandle_export_batch_id?: string | null
          pandle_exported?: boolean
          pandle_exported_at?: string | null
          payment_date?: string | null
          status?: string
          supplier_id?: string
          sync_status?: string
          tenant_id?: string
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "bills_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_pandle_export_batch_id_fkey"
            columns: ["pandle_export_batch_id"]
            isOneToOne: false
            referencedRelation: "export_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "calendar_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_adjustments: {
        Row: {
          active: boolean
          amount: number
          created_at: string
          description: string
          end_date: string | null
          event_date: string
          event_type: string
          id: string
          recurring: string
          scenario_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          created_at?: string
          description?: string
          end_date?: string | null
          event_date: string
          event_type?: string
          id?: string
          recurring?: string
          scenario_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          created_at?: string
          description?: string
          end_date?: string | null
          event_date?: string
          event_type?: string
          id?: string
          recurring?: string
          scenario_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_adjustments_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "cashflow_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_adjustments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_events: {
        Row: {
          amount: number
          confidence: string
          counterparty_name: string | null
          description: string
          event_date: string
          event_type: string
          generated_at: string
          id: string
          job_id: string | null
          scenario_id: string
          source_id: string | null
          source_type: string
          tenant_id: string
        }
        Insert: {
          amount?: number
          confidence?: string
          counterparty_name?: string | null
          description?: string
          event_date: string
          event_type: string
          generated_at?: string
          id?: string
          job_id?: string | null
          scenario_id: string
          source_id?: string | null
          source_type: string
          tenant_id: string
        }
        Update: {
          amount?: number
          confidence?: string
          counterparty_name?: string | null
          description?: string
          event_date?: string
          event_type?: string
          generated_at?: string
          id?: string
          job_id?: string | null
          scenario_id?: string
          source_id?: string | null
          source_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_events_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "cashflow_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_rules: {
        Row: {
          active: boolean
          applies_to: string
          created_at: string
          id: string
          match_value: string | null
          offset_days: number
          probability_percent: number | null
          rule_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_to?: string
          created_at?: string
          id?: string
          match_value?: string | null
          offset_days?: number
          probability_percent?: number | null
          rule_type?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_to?: string
          created_at?: string
          id?: string
          match_value?: string | null
          offset_days?: number
          probability_percent?: number | null
          rule_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_scenarios: {
        Row: {
          active: boolean
          assumptions_json: Json
          created_at: string
          created_by_staff_id: string | null
          id: string
          is_default: boolean
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          assumptions_json?: Json
          created_at?: string
          created_by_staff_id?: string | null
          id?: string
          is_default?: boolean
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          assumptions_json?: Json
          created_at?: string
          created_by_staff_id?: string | null
          id?: string
          is_default?: boolean
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_scenarios_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      cashflow_settings: {
        Row: {
          alert_horizon_days: number
          auto_calculate_opening: boolean
          created_at: string
          default_pay_cycle: string
          default_scenario_id: string | null
          id: string
          minimum_cash_buffer_amount: number
          opening_balance: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          alert_horizon_days?: number
          auto_calculate_opening?: boolean
          created_at?: string
          default_pay_cycle?: string
          default_scenario_id?: string | null
          id?: string
          minimum_cash_buffer_amount?: number
          opening_balance?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          alert_horizon_days?: number
          auto_calculate_opening?: boolean
          created_at?: string
          default_pay_cycle?: string
          default_scenario_id?: string | null
          id?: string
          minimum_cash_buffer_amount?: number
          opening_balance?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashflow_settings_default_scenario_id_fkey"
            columns: ["default_scenario_id"]
            isOneToOne: false
            referencedRelation: "cashflow_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashflow_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          billing_address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          billing_address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          billing_address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      department_config: {
        Row: {
          active: boolean
          coverage_warning_mode: string
          created_at: string
          id: string
          maximum_staff_off_per_day: number
          minimum_staff_required_per_day: number
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          coverage_warning_mode?: string
          created_at?: string
          id?: string
          maximum_staff_off_per_day?: number
          minimum_staff_required_per_day?: number
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          coverage_warning_mode?: string
          created_at?: string
          id?: string
          maximum_staff_off_per_day?: number
          minimum_staff_required_per_day?: number
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      export_batches: {
        Row: {
          created_at: string
          created_by: string | null
          date_range_end: string | null
          date_range_start: string | null
          export_type: string
          export_types: string[]
          id: string
          record_count: number
          status_filter: string | null
          tenant_id: string
          total_value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          export_type: string
          export_types?: string[]
          id?: string
          record_count?: number
          status_filter?: string | null
          tenant_id: string
          total_value?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_range_end?: string | null
          date_range_start?: string | null
          export_type?: string
          export_types?: string[]
          id?: string
          record_count?: number
          status_filter?: string | null
          tenant_id?: string
          total_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "export_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_read_receipts_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_read_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_audit_log: {
        Row: {
          changed_at: string
          changed_by: string
          entity_id: string
          entity_type: string
          field_changed: string
          id: string
          new_value: string | null
          old_value: string | null
          tenant_id: string
        }
        Insert: {
          changed_at?: string
          changed_by: string
          entity_id: string
          entity_type: string
          field_changed: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          tenant_id?: string
        }
        Update: {
          changed_at?: string
          changed_by?: string
          entity_id?: string
          entity_type?: string
          field_changed?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holiday_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      install_signoffs: {
        Row: {
          created_at: string
          customer_email: string | null
          customer_name: string
          follow_up_required: boolean
          geo_location: Json | null
          id: string
          job_id: string
          notes: string | null
          photos: string[] | null
          signature_image_reference: string | null
          signed_at: string
          signed_by_name: string
          signed_by_role: string
          snapshot_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_email?: string | null
          customer_name: string
          follow_up_required?: boolean
          geo_location?: Json | null
          id?: string
          job_id: string
          notes?: string | null
          photos?: string[] | null
          signature_image_reference?: string | null
          signed_at?: string
          signed_by_name: string
          signed_by_role?: string
          snapshot_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_email?: string | null
          customer_name?: string
          follow_up_required?: boolean
          geo_location?: Json | null
          id?: string
          job_id?: string
          notes?: string | null
          photos?: string[] | null
          signature_image_reference?: string | null
          signed_at?: string
          signed_by_name?: string
          signed_by_role?: string
          snapshot_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "install_signoffs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "install_signoffs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "job_card_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "install_signoffs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_ex_vat: number
          amount_paid: number
          created_at: string
          created_by_staff_id: string | null
          customer_id: string
          due_date: string
          external_id: string | null
          external_system: string | null
          id: string
          invoice_number: string
          issue_date: string
          job_id: string | null
          last_synced_at: string | null
          pandle_export_batch_id: string | null
          pandle_exported: boolean
          pandle_exported_at: string | null
          payment_method: string | null
          payment_received_date: string | null
          reference: string | null
          status: string
          sync_status: string
          tenant_id: string
          updated_at: string
          vat_amount: number
        }
        Insert: {
          amount_ex_vat?: number
          amount_paid?: number
          created_at?: string
          created_by_staff_id?: string | null
          customer_id: string
          due_date: string
          external_id?: string | null
          external_system?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          job_id?: string | null
          last_synced_at?: string | null
          pandle_export_batch_id?: string | null
          pandle_exported?: boolean
          pandle_exported_at?: string | null
          payment_method?: string | null
          payment_received_date?: string | null
          reference?: string | null
          status?: string
          sync_status?: string
          tenant_id?: string
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          amount_ex_vat?: number
          amount_paid?: number
          created_at?: string
          created_by_staff_id?: string | null
          customer_id?: string
          due_date?: string
          external_id?: string | null
          external_system?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          job_id?: string | null
          last_synced_at?: string | null
          pandle_export_batch_id?: string | null
          pandle_exported?: boolean
          pandle_exported_at?: string | null
          payment_method?: string | null
          payment_received_date?: string | null
          reference?: string | null
          status?: string
          sync_status?: string
          tenant_id?: string
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_pandle_export_batch_id_fkey"
            columns: ["pandle_export_batch_id"]
            isOneToOne: false
            referencedRelation: "export_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_card_signoffs: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          role_at_signing: string | null
          signed_at: string
          signed_by: string
          snapshot_id: string
          stage_name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          role_at_signing?: string | null
          signed_at?: string
          signed_by: string
          snapshot_id: string
          stage_name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          role_at_signing?: string | null
          signed_at?: string
          signed_by?: string
          snapshot_id?: string
          stage_name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_card_signoffs_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "job_card_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_signoffs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_card_snapshots: {
        Row: {
          change_summary: string | null
          created_at: string
          id: string
          issued_at: string | null
          issued_by: string | null
          job_id: string
          snapshot_data: Json
          status: string
          superseded_at: string | null
          superseded_by: string | null
          template_id: string | null
          tenant_id: string
          version: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          job_id: string
          snapshot_data?: Json
          status?: string
          superseded_at?: string | null
          superseded_by?: string | null
          template_id?: string | null
          tenant_id: string
          version?: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          job_id?: string
          snapshot_data?: Json
          status?: string
          superseded_at?: string | null
          superseded_by?: string | null
          template_id?: string | null
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_card_snapshots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_snapshots_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "job_card_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_card_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_card_templates: {
        Row: {
          active: boolean
          created_at: string
          department: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          template_config: Json
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          department?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          template_config?: Json
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          department?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          template_config?: Json
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_card_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_checklist_items: {
        Row: {
          active: boolean
          check_type: string
          created_at: string
          description: string | null
          id: string
          label: string
          mandatory: boolean
          sort_order: number
          template_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          check_type?: string
          created_at?: string
          description?: string | null
          id?: string
          label: string
          mandatory?: boolean
          sort_order?: number
          template_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          check_type?: string
          created_at?: string
          description?: string | null
          id?: string
          label?: string
          mandatory?: boolean
          sort_order?: number
          template_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "job_card_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_checklist_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_checklist_results: {
        Row: {
          checked: boolean
          checked_at: string | null
          checked_by: string | null
          checklist_item_id: string
          created_at: string
          id: string
          notes: string | null
          snapshot_id: string
          tenant_id: string
          updated_at: string
          value: string | null
        }
        Insert: {
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          checklist_item_id: string
          created_at?: string
          id?: string
          notes?: string | null
          snapshot_id: string
          tenant_id: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          checked?: boolean
          checked_at?: string | null
          checked_by?: string | null
          checklist_item_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          snapshot_id?: string
          tenant_id?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_checklist_results_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "job_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_checklist_results_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "job_card_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_checklist_results_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_financials: {
        Row: {
          created_at: string
          customer_id: string | null
          deposit_received: number
          deposit_required: number
          expected_invoice_date: string | null
          expected_payment_date: string | null
          id: string
          job_id: string
          labour_cost_override: number | null
          material_cost_override: number | null
          notes: string | null
          overhead_allocation_override: number | null
          quote_value_ex_vat: number
          revenue_status: string
          tenant_id: string
          updated_at: string
          vat_rate: number
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          deposit_received?: number
          deposit_required?: number
          expected_invoice_date?: string | null
          expected_payment_date?: string | null
          id?: string
          job_id: string
          labour_cost_override?: number | null
          material_cost_override?: number | null
          notes?: string | null
          overhead_allocation_override?: number | null
          quote_value_ex_vat?: number
          revenue_status?: string
          tenant_id?: string
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          deposit_received?: number
          deposit_required?: number
          expected_invoice_date?: string | null
          expected_payment_date?: string | null
          id?: string
          job_id?: string
          labour_cost_override?: number | null
          material_cost_override?: number | null
          notes?: string | null
          overhead_allocation_override?: number | null
          quote_value_ex_vat?: number
          revenue_status?: string
          tenant_id?: string
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_financials_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_financials_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_financials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_issues: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          description: string | null
          id: string
          job_id: string
          photos: string[] | null
          reported_at: string
          reported_by: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          snapshot_id: string | null
          stage_name: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          job_id: string
          photos?: string[] | null
          reported_at?: string
          reported_by: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          snapshot_id?: string | null
          stage_name?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          job_id?: string
          photos?: string[] | null
          reported_at?: string
          reported_by?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          snapshot_id?: string | null
          stage_name?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_issues_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_issues_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "job_card_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_issues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_payment_schedules: {
        Row: {
          amount: number
          created_at: string
          expected_date: string
          id: string
          job_id: string
          milestone: string
          notes: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          expected_date: string
          id?: string
          job_id: string
          milestone?: string
          notes?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expected_date?: string
          id?: string
          job_id?: string
          milestone?: string
          notes?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_payment_schedules_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_payment_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "job_stages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      machine_config: {
        Row: {
          active: boolean
          created_at: string
          default_available_hours_per_day: number
          department: string
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          default_available_hours_per_day?: number
          department?: string
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          default_available_hours_per_day?: number
          department?: string
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "machine_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          thickness_mm?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "materials_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      nominal_mappings: {
        Row: {
          created_at: string
          id: string
          internal_category: string
          mapping_type: string
          pandle_nominal_code: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          internal_category: string
          mapping_type?: string
          pandle_nominal_code: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          internal_category?: string
          mapping_type?: string
          pandle_nominal_code?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nominal_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      overheads: {
        Row: {
          active: boolean
          amount: number
          autopopulate_future: boolean
          category: string
          created_at: string
          frequency: string
          id: string
          name: string
          next_due_date: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number
          autopopulate_future?: boolean
          category?: string
          created_at?: string
          frequency?: string
          id?: string
          name: string
          next_due_date?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          autopopulate_future?: boolean
          category?: string
          created_at?: string
          frequency?: string
          id?: string
          name?: string
          next_due_date?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "overheads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pandle_settings: {
        Row: {
          auto_mark_exported: boolean
          connector_enabled: boolean
          created_at: string
          default_purchase_nominal_code: string
          default_sales_nominal_code: string
          default_vat_code_purchases: string
          default_vat_code_sales: string
          export_currency: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_mark_exported?: boolean
          connector_enabled?: boolean
          created_at?: string
          default_purchase_nominal_code?: string
          default_sales_nominal_code?: string
          default_vat_code_purchases?: string
          default_vat_code_sales?: string
          export_currency?: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_mark_exported?: boolean
          connector_enabled?: boolean
          created_at?: string
          default_purchase_nominal_code?: string
          default_sales_nominal_code?: string
          default_vat_code_purchases?: string
          default_vat_code_sales?: string
          export_currency?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pandle_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "parts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "product_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_readiness_status: {
        Row: {
          assembly_ready: boolean
          blockers: Json
          cnc_ready: boolean
          created_at: string
          edge_ready: boolean
          id: string
          install_ready: boolean
          issues_open_count: number
          job_id: string
          last_calculated_at: string
          materials_ready: boolean
          overdue_dependency_count: number
          readiness_score: number
          readiness_status: string
          spray_ready: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assembly_ready?: boolean
          blockers?: Json
          cnc_ready?: boolean
          created_at?: string
          edge_ready?: boolean
          id?: string
          install_ready?: boolean
          issues_open_count?: number
          job_id: string
          last_calculated_at?: string
          materials_ready?: boolean
          overdue_dependency_count?: number
          readiness_score?: number
          readiness_status?: string
          spray_ready?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assembly_ready?: boolean
          blockers?: Json
          cnc_ready?: boolean
          created_at?: string
          edge_ready?: boolean
          id?: string
          install_ready?: boolean
          issues_open_count?: number
          job_id?: string
          last_calculated_at?: string
          materials_ready?: boolean
          overdue_dependency_count?: number
          readiness_score?: number
          readiness_status?: string
          spray_ready?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_readiness_status_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_readiness_status_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_name: string | null
          bank_sort_code: string | null
          contracted_hours_per_week: number
          created_at: string
          department: Database["public"]["Enums"]["app_department"]
          email: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          employment_type: string
          full_name: string
          holiday_allowance_days: number
          holiday_balance_days: number
          id: string
          ni_number: string | null
          passport_number: string | null
          start_date: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bank_sort_code?: string | null
          contracted_hours_per_week?: number
          created_at?: string
          department?: Database["public"]["Enums"]["app_department"]
          email: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employment_type?: string
          full_name: string
          holiday_allowance_days?: number
          holiday_balance_days?: number
          id?: string
          ni_number?: string | null
          passport_number?: string | null
          start_date?: string
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_name?: string | null
          bank_sort_code?: string | null
          contracted_hours_per_week?: number
          created_at?: string
          department?: Database["public"]["Enums"]["app_department"]
          email?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          employment_type?: string
          full_name?: string
          holiday_allowance_days?: number
          holiday_balance_days?: number
          id?: string
          ni_number?: string | null
          passport_number?: string | null
          start_date?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "remnants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "skills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_documents: {
        Row: {
          category: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          staff_id: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          staff_id: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          staff_id?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          staff_id: string
          tenant_id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          staff_id: string
          tenant_id?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          staff_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "staff_skills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_config: {
        Row: {
          active: boolean
          created_at: string
          id: string
          order_index: number
          required_skills: string[] | null
          stage_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          order_index?: number
          required_skills?: string[] | null
          stage_name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          order_index?: number
          required_skills?: string[] | null
          stage_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          mandatory?: boolean
          minimum_level?: string
          skill_id: string
          stage_name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          mandatory?: boolean
          minimum_level?: string
          skill_id?: string
          stage_name?: string
          tenant_id?: string
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
          {
            foreignKeyName: "stage_skill_requirements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          flag_name: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          flag_name: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          flag_name?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_feature_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          branding: Json
          created_at: string
          default_units: string
          id: string
          subscription_status: string
          tenant_name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          default_units?: string
          id?: string
          subscription_status?: string
          tenant_name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          created_at?: string
          default_units?: string
          id?: string
          subscription_status?: string
          tenant_name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      toolpath_templates: {
        Row: {
          active: boolean
          created_at: string
          file_reference: string | null
          id: string
          material_code: string | null
          name: string
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "toolpath_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id?: string
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
          {
            foreignKeyName: "training_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_mappings: {
        Row: {
          created_at: string
          id: string
          internal_vat_rate: number
          pandle_vat_code: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          internal_vat_rate: number
          pandle_vat_code: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          internal_vat_rate?: number
          pandle_vat_code?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vat_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wage_plans: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          period_end: string
          period_start: string
          tenant_id: string
          total_wages_actual: number | null
          total_wages_expected: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          tenant_id?: string
          total_wages_actual?: number | null
          total_wages_expected?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          tenant_id?: string
          total_wages_actual?: number | null
          total_wages_expected?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wage_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_tenant: { Args: { _tenant_id: string }; Returns: boolean }
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
