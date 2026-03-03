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
      ai_proposal_actions: {
        Row: {
          acted_by_staff_id: string | null
          action_type: string
          created_at: string
          edited_payload_json: Json | null
          id: string
          proposal_id: string
          tenant_id: string
        }
        Insert: {
          acted_by_staff_id?: string | null
          action_type: string
          created_at?: string
          edited_payload_json?: Json | null
          id?: string
          proposal_id: string
          tenant_id: string
        }
        Update: {
          acted_by_staff_id?: string | null
          action_type?: string
          created_at?: string
          edited_payload_json?: Json | null
          id?: string
          proposal_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_proposal_actions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "ai_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_proposal_actions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_proposal_metrics: {
        Row: {
          avg_confidence: number
          id: string
          last_updated_at: string
          proposal_type: string
          tenant_id: string
          total_applied_success: number
          total_approved: number
          total_proposed: number
          total_rejected: number
        }
        Insert: {
          avg_confidence?: number
          id?: string
          last_updated_at?: string
          proposal_type: string
          tenant_id: string
          total_applied_success?: number
          total_approved?: number
          total_proposed?: number
          total_rejected?: number
        }
        Update: {
          avg_confidence?: number
          id?: string
          last_updated_at?: string
          proposal_type?: string
          tenant_id?: string
          total_applied_success?: number
          total_approved?: number
          total_proposed?: number
          total_rejected?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_proposal_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_proposals: {
        Row: {
          auto_apply_allowed: boolean
          confidence_score: number
          created_at: string
          created_by: string
          description: string
          expires_at: string | null
          id: string
          impact_summary_json: Json
          job_id: string | null
          proposal_type: string
          reasoning_json: Json
          requires_role: string
          risk_level: string
          scope_type: string
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          auto_apply_allowed?: boolean
          confidence_score?: number
          created_at?: string
          created_by?: string
          description?: string
          expires_at?: string | null
          id?: string
          impact_summary_json?: Json
          job_id?: string | null
          proposal_type?: string
          reasoning_json?: Json
          requires_role?: string
          risk_level?: string
          scope_type?: string
          status?: string
          tenant_id: string
          title: string
        }
        Update: {
          auto_apply_allowed?: boolean
          confidence_score?: number
          created_at?: string
          created_by?: string
          description?: string
          expires_at?: string | null
          id?: string
          impact_summary_json?: Json
          job_id?: string | null
          proposal_type?: string
          reasoning_json?: Json
          requires_role?: string
          risk_level?: string
          scope_type?: string
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_proposals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_proposals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      calendar_sync_audit: {
        Row: {
          action: string
          actor_staff_id: string | null
          app_event_id: string | null
          created_at: string
          google_event_id: string | null
          id: string
          payload_after_json: Json | null
          payload_before_json: Json | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_staff_id?: string | null
          app_event_id?: string | null
          created_at?: string
          google_event_id?: string | null
          id?: string
          payload_after_json?: Json | null
          payload_before_json?: Json | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_staff_id?: string | null
          app_event_id?: string | null
          created_at?: string
          google_event_id?: string | null
          id?: string
          payload_after_json?: Json | null
          payload_before_json?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_links: {
        Row: {
          app_event_id: string
          checksum: string | null
          created_at: string
          direction_last_sync: string | null
          error_message: string | null
          google_calendar_id: string
          google_etag: string | null
          google_event_id: string | null
          id: string
          last_sync_attempt_at: string | null
          last_synced_at: string | null
          sync_status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          app_event_id: string
          checksum?: string | null
          created_at?: string
          direction_last_sync?: string | null
          error_message?: string | null
          google_calendar_id: string
          google_etag?: string | null
          google_event_id?: string | null
          id?: string
          last_sync_attempt_at?: string | null
          last_synced_at?: string | null
          sync_status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          app_event_id?: string
          checksum?: string | null
          created_at?: string
          direction_last_sync?: string | null
          error_message?: string | null
          google_calendar_id?: string
          google_etag?: string | null
          google_event_id?: string | null
          id?: string
          last_sync_attempt_at?: string | null
          last_synced_at?: string | null
          sync_status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_sync_queue: {
        Row: {
          action: string
          app_event_id: string | null
          attempts: number
          created_at: string
          google_calendar_id: string | null
          google_event_id: string | null
          id: string
          last_error: string | null
          max_attempts: number
          priority: string
          run_after: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action: string
          app_event_id?: string | null
          attempts?: number
          created_at?: string
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          priority?: string
          run_after?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          app_event_id?: string | null
          attempts?: number
          created_at?: string
          google_calendar_id?: string | null
          google_event_id?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          priority?: string
          run_after?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_sync_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      capacity_simulations: {
        Row: {
          capacity_impact_json: Json
          cashflow_impact: number
          created_at: string
          created_by: string | null
          delivery_date_prediction: string | null
          estimated_margin_percent: number
          id: string
          job_description: string | null
          job_type: string | null
          planned_assembly_hours: number
          planned_cnc_hours: number
          planned_install_hours: number
          planned_spray_hours: number
          quote_value: number
          risk_assessment: string
          sheet_count: number
          simulation_name: string
          target_end_date: string | null
          target_start_date: string | null
          tenant_id: string
        }
        Insert: {
          capacity_impact_json?: Json
          cashflow_impact?: number
          created_at?: string
          created_by?: string | null
          delivery_date_prediction?: string | null
          estimated_margin_percent?: number
          id?: string
          job_description?: string | null
          job_type?: string | null
          planned_assembly_hours?: number
          planned_cnc_hours?: number
          planned_install_hours?: number
          planned_spray_hours?: number
          quote_value?: number
          risk_assessment?: string
          sheet_count?: number
          simulation_name?: string
          target_end_date?: string | null
          target_start_date?: string | null
          tenant_id?: string
        }
        Update: {
          capacity_impact_json?: Json
          cashflow_impact?: number
          created_at?: string
          created_by?: string | null
          delivery_date_prediction?: string | null
          estimated_margin_percent?: number
          id?: string
          job_description?: string | null
          job_type?: string | null
          planned_assembly_hours?: number
          planned_cnc_hours?: number
          planned_install_hours?: number
          planned_spray_hours?: number
          quote_value?: number
          risk_assessment?: string
          sheet_count?: number
          simulation_name?: string
          target_end_date?: string | null
          target_start_date?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capacity_simulations_tenant_id_fkey"
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
      client_access_tokens: {
        Row: {
          client_user_id: string
          created_at: string
          expires_at: string
          id: string
          job_id: string | null
          revoked: boolean
          tenant_id: string
          token: string
        }
        Insert: {
          client_user_id: string
          created_at?: string
          expires_at?: string
          id?: string
          job_id?: string | null
          revoked?: boolean
          tenant_id: string
          token?: string
        }
        Update: {
          client_user_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          job_id?: string | null
          revoked?: boolean
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_access_tokens_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "client_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_tokens_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_access_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_activity_log: {
        Row: {
          action: string
          client_user_id: string
          created_at: string
          id: string
          job_id: string | null
          metadata: Json | null
          tenant_id: string
        }
        Insert: {
          action: string
          client_user_id: string
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          tenant_id: string
        }
        Update: {
          action?: string
          client_user_id?: string
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_activity_log_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "client_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_activity_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_job_documents: {
        Row: {
          file_asset_id: string
          id: string
          job_id: string
          shared_at: string
          shared_by: string | null
          tenant_id: string
          visible_to_client: boolean
        }
        Insert: {
          file_asset_id: string
          id?: string
          job_id: string
          shared_at?: string
          shared_by?: string | null
          tenant_id: string
          visible_to_client?: boolean
        }
        Update: {
          file_asset_id?: string
          id?: string
          job_id?: string
          shared_at?: string
          shared_by?: string | null
          tenant_id?: string
          visible_to_client?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "client_job_documents_file_asset_id_fkey"
            columns: ["file_asset_id"]
            isOneToOne: false
            referencedRelation: "file_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_job_documents_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_job_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_settings: {
        Row: {
          allow_remote_signoff: boolean
          allow_snag_submission: boolean
          created_at: string
          enable_client_portal: boolean
          id: string
          portal_branding: Json
          show_financial_info: boolean
          show_production_readiness: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allow_remote_signoff?: boolean
          allow_snag_submission?: boolean
          created_at?: string
          enable_client_portal?: boolean
          id?: string
          portal_branding?: Json
          show_financial_info?: boolean
          show_production_readiness?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allow_remote_signoff?: boolean
          allow_snag_submission?: boolean
          created_at?: string
          enable_client_portal?: boolean
          id?: string
          portal_branding?: Json
          show_financial_info?: boolean
          show_production_readiness?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          active: boolean
          client_role: string
          created_at: string
          customer_id: string
          email: string
          id: string
          name: string
          phone: string | null
          portal_access_enabled: boolean
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          client_role?: string
          created_at?: string
          customer_id: string
          email: string
          id?: string
          name: string
          phone?: string | null
          portal_access_enabled?: boolean
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          client_role?: string
          created_at?: string
          customer_id?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          portal_access_enabled?: boolean
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_users_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clock_anomalies: {
        Row: {
          anomaly_type: string
          created_at: string
          detected_at: string
          id: string
          notes: string | null
          resolution_type: string | null
          resolved: boolean
          resolved_at: string | null
          resolved_clock_out: string | null
          staff_id: string
          tenant_id: string
          time_entry_id: string
        }
        Insert: {
          anomaly_type?: string
          created_at?: string
          detected_at?: string
          id?: string
          notes?: string | null
          resolution_type?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_clock_out?: string | null
          staff_id: string
          tenant_id: string
          time_entry_id: string
        }
        Update: {
          anomaly_type?: string
          created_at?: string
          detected_at?: string
          id?: string
          notes?: string | null
          resolution_type?: string | null
          resolved?: boolean
          resolved_at?: string | null
          resolved_clock_out?: string | null
          staff_id?: string
          tenant_id?: string
          time_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clock_anomalies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clock_anomalies_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
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
      drift_reasons: {
        Row: {
          created_at: string
          id: string
          job_id: string
          logged_at: string
          logged_by: string | null
          notes: string | null
          reason_category: string
          stage_name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          logged_at?: string
          logged_by?: string | null
          notes?: string | null
          reason_category?: string
          stage_name: string
          tenant_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          logged_at?: string
          logged_by?: string | null
          notes?: string | null
          reason_category?: string
          stage_name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drift_reasons_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drift_reasons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      drift_settings: {
        Row: {
          created_at: string
          critical_threshold_percent: number
          id: string
          minimum_margin_threshold_percent: number
          tenant_id: string
          updated_at: string
          use_drift_adjustment_in_quoting: boolean
          warning_threshold_percent: number
        }
        Insert: {
          created_at?: string
          critical_threshold_percent?: number
          id?: string
          minimum_margin_threshold_percent?: number
          tenant_id: string
          updated_at?: string
          use_drift_adjustment_in_quoting?: boolean
          warning_threshold_percent?: number
        }
        Update: {
          created_at?: string
          critical_threshold_percent?: number
          id?: string
          minimum_margin_threshold_percent?: number
          tenant_id?: string
          updated_at?: string
          use_drift_adjustment_in_quoting?: boolean
          warning_threshold_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "drift_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_file_index: {
        Row: {
          checksum: string | null
          created_at: string
          detected_stage: string
          detected_type: string
          drive_created_time: string | null
          drive_file_id: string
          drive_modified_time: string | null
          drive_parent_folder_id: string | null
          drive_web_view_link: string | null
          file_name: string
          file_size_bytes: number | null
          id: string
          job_id: string
          last_seen_at: string
          mime_type: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          detected_stage?: string
          detected_type?: string
          drive_created_time?: string | null
          drive_file_id: string
          drive_modified_time?: string | null
          drive_parent_folder_id?: string | null
          drive_web_view_link?: string | null
          file_name: string
          file_size_bytes?: number | null
          id?: string
          job_id: string
          last_seen_at?: string
          mime_type?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          checksum?: string | null
          created_at?: string
          detected_stage?: string
          detected_type?: string
          drive_created_time?: string | null
          drive_file_id?: string
          drive_modified_time?: string | null
          drive_parent_folder_id?: string | null
          drive_web_view_link?: string | null
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          job_id?: string
          last_seen_at?: string
          mime_type?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drive_file_index_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drive_file_index_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_sync_audit: {
        Row: {
          action: string
          actor_staff_id: string | null
          created_at: string
          drive_file_id: string | null
          drive_folder_id: string | null
          id: string
          job_id: string | null
          payload_after_json: Json | null
          payload_before_json: Json | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_staff_id?: string | null
          created_at?: string
          drive_file_id?: string | null
          drive_folder_id?: string | null
          id?: string
          job_id?: string | null
          payload_after_json?: Json | null
          payload_before_json?: Json | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_staff_id?: string | null
          created_at?: string
          drive_file_id?: string | null
          drive_folder_id?: string | null
          id?: string
          job_id?: string | null
          payload_after_json?: Json | null
          payload_before_json?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drive_sync_audit_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drive_sync_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_sync_queue: {
        Row: {
          action: string
          attempts: number
          created_at: string
          drive_file_id: string | null
          drive_folder_id: string | null
          id: string
          job_id: string | null
          last_error: string | null
          max_attempts: number
          payload_json: Json | null
          priority: string
          run_after: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          action: string
          attempts?: number
          created_at?: string
          drive_file_id?: string | null
          drive_folder_id?: string | null
          id?: string
          job_id?: string | null
          last_error?: string | null
          max_attempts?: number
          payload_json?: Json | null
          priority?: string
          run_after?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          action?: string
          attempts?: number
          created_at?: string
          drive_file_id?: string | null
          drive_folder_id?: string | null
          id?: string
          job_id?: string | null
          last_error?: string | null
          max_attempts?: number
          payload_json?: Json | null
          priority?: string
          run_after?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drive_sync_queue_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drive_sync_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dxf_extraction_log: {
        Row: {
          bbox_confidence: string | null
          bbox_height_mm: number | null
          bbox_width_mm: number | null
          created_at: string | null
          dxf_file_reference: string | null
          entity_id: string
          entity_type: string
          extracted_at: string | null
          extracted_by: string | null
          id: string
          manual_override_exists: boolean | null
          notes: string | null
          polygon_confidence: string | null
          polygon_extracted: boolean | null
          previous_bbox_height_mm: number | null
          previous_bbox_width_mm: number | null
          tenant_id: string
        }
        Insert: {
          bbox_confidence?: string | null
          bbox_height_mm?: number | null
          bbox_width_mm?: number | null
          created_at?: string | null
          dxf_file_reference?: string | null
          entity_id: string
          entity_type: string
          extracted_at?: string | null
          extracted_by?: string | null
          id?: string
          manual_override_exists?: boolean | null
          notes?: string | null
          polygon_confidence?: string | null
          polygon_extracted?: boolean | null
          previous_bbox_height_mm?: number | null
          previous_bbox_width_mm?: number | null
          tenant_id: string
        }
        Update: {
          bbox_confidence?: string | null
          bbox_height_mm?: number | null
          bbox_width_mm?: number | null
          created_at?: string | null
          dxf_file_reference?: string | null
          entity_id?: string
          entity_type?: string
          extracted_at?: string | null
          extracted_by?: string | null
          id?: string
          manual_override_exists?: boolean | null
          notes?: string | null
          polygon_confidence?: string | null
          polygon_extracted?: boolean | null
          previous_bbox_height_mm?: number | null
          previous_bbox_width_mm?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dxf_extraction_log_tenant_id_fkey"
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
      google_calendar_mappings: {
        Row: {
          created_at: string
          enabled: boolean
          event_type: string
          google_calendar_id: string
          google_calendar_name: string
          id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          event_type: string
          google_calendar_id: string
          google_calendar_name?: string
          id?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          event_type?: string
          google_calendar_id?: string
          google_calendar_name?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      google_drive_integration_settings: {
        Row: {
          auto_attach_dxfs: boolean
          auto_create_jobs_from_folders: boolean
          auto_index_files: boolean
          auto_upload_exports: boolean
          created_at: string
          detect_cost_sheets: boolean
          detect_dxfs: boolean
          detect_photos: boolean
          export_subfolder_cnc: string
          export_subfolder_exports: string
          export_subfolder_labels: string
          export_subfolder_nesting: string
          folder_name_pattern: string
          google_user_email: string | null
          google_user_id: string | null
          granted_scopes: Json | null
          include_subfolders: boolean
          is_connected: boolean
          job_number_parse_regex: string
          last_error_message: string | null
          last_sync_at: string | null
          polling_interval_minutes: number
          projects_root_folder_id: string | null
          projects_root_folder_name: string | null
          status: string
          sync_mode: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          auto_attach_dxfs?: boolean
          auto_create_jobs_from_folders?: boolean
          auto_index_files?: boolean
          auto_upload_exports?: boolean
          created_at?: string
          detect_cost_sheets?: boolean
          detect_dxfs?: boolean
          detect_photos?: boolean
          export_subfolder_cnc?: string
          export_subfolder_exports?: string
          export_subfolder_labels?: string
          export_subfolder_nesting?: string
          folder_name_pattern?: string
          google_user_email?: string | null
          google_user_id?: string | null
          granted_scopes?: Json | null
          include_subfolders?: boolean
          is_connected?: boolean
          job_number_parse_regex?: string
          last_error_message?: string | null
          last_sync_at?: string | null
          polling_interval_minutes?: number
          projects_root_folder_id?: string | null
          projects_root_folder_name?: string | null
          status?: string
          sync_mode?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          auto_attach_dxfs?: boolean
          auto_create_jobs_from_folders?: boolean
          auto_index_files?: boolean
          auto_upload_exports?: boolean
          created_at?: string
          detect_cost_sheets?: boolean
          detect_dxfs?: boolean
          detect_photos?: boolean
          export_subfolder_cnc?: string
          export_subfolder_exports?: string
          export_subfolder_labels?: string
          export_subfolder_nesting?: string
          folder_name_pattern?: string
          google_user_email?: string | null
          google_user_id?: string | null
          granted_scopes?: Json | null
          include_subfolders?: boolean
          is_connected?: boolean
          job_number_parse_regex?: string
          last_error_message?: string | null
          last_sync_at?: string | null
          polling_interval_minutes?: number
          projects_root_folder_id?: string | null
          projects_root_folder_name?: string | null
          status?: string
          sync_mode?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_drive_integration_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      google_integration_settings: {
        Row: {
          conflict_policy: string
          created_at: string
          default_timezone: string
          google_user_email: string | null
          google_user_id: string | null
          granted_scopes: Json | null
          is_connected: boolean
          last_error_message: string | null
          last_health_check_at: string | null
          status: string
          sync_mode: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          conflict_policy?: string
          created_at?: string
          default_timezone?: string
          google_user_email?: string | null
          google_user_id?: string | null
          granted_scopes?: Json | null
          is_connected?: boolean
          last_error_message?: string | null
          last_health_check_at?: string | null
          status?: string
          sync_mode?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          conflict_policy?: string
          created_at?: string
          default_timezone?: string
          google_user_email?: string | null
          google_user_id?: string | null
          granted_scopes?: Json | null
          is_connected?: boolean
          last_error_message?: string | null
          last_health_check_at?: string | null
          status?: string
          sync_mode?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_integration_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_tokens: {
        Row: {
          access_token_encrypted: string
          created_at: string
          expires_at: string
          id: string
          refresh_token_encrypted: string
          tenant_id: string
          token_version: number
          updated_at: string
        }
        Insert: {
          access_token_encrypted: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token_encrypted: string
          tenant_id: string
          token_version?: number
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token_encrypted?: string
          tenant_id?: string
          token_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_oauth_tokens_tenant_id_fkey"
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
      job_drift_status: {
        Row: {
          assembly_variance_percent: number
          cnc_variance_hours: number
          cnc_variance_percent: number
          created_at: string
          drift_status: string
          id: string
          install_variance_percent: number
          job_id: string
          last_evaluated_at: string
          primary_overrun_stage: string | null
          spray_variance_percent: number
          tenant_id: string
          total_variance_percent: number
        }
        Insert: {
          assembly_variance_percent?: number
          cnc_variance_hours?: number
          cnc_variance_percent?: number
          created_at?: string
          drift_status?: string
          id?: string
          install_variance_percent?: number
          job_id: string
          last_evaluated_at?: string
          primary_overrun_stage?: string | null
          spray_variance_percent?: number
          tenant_id?: string
          total_variance_percent?: number
        }
        Update: {
          assembly_variance_percent?: number
          cnc_variance_hours?: number
          cnc_variance_percent?: number
          created_at?: string
          drift_status?: string
          id?: string
          install_variance_percent?: number
          job_id?: string
          last_evaluated_at?: string
          primary_overrun_stage?: string | null
          spray_variance_percent?: number
          tenant_id?: string
          total_variance_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_drift_status_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_drift_status_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_drive_links: {
        Row: {
          created_at: string
          drive_folder_id: string
          drive_folder_name: string
          drive_folder_url: string | null
          drive_path_cache: string | null
          id: string
          job_id: string
          last_indexed_at: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          drive_folder_id: string
          drive_folder_name?: string
          drive_folder_url?: string | null
          drive_path_cache?: string | null
          id?: string
          job_id: string
          last_indexed_at?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          drive_folder_id?: string
          drive_folder_name?: string
          drive_folder_url?: string | null
          drive_path_cache?: string | null
          id?: string
          job_id?: string
          last_indexed_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_drive_links_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_drive_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_edgeband_batch_items: {
        Row: {
          batch_id: string
          created_at: string
          id: string
          instance_index: number
          notes: string | null
          part_id: string
          tenant_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          id?: string
          instance_index?: number
          notes?: string | null
          part_id: string
          tenant_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          id?: string
          instance_index?: number
          notes?: string | null
          part_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_edgeband_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "job_edgeband_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_edgeband_batch_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_edgeband_batches: {
        Row: {
          batch_name: string
          colour_name: string | null
          count_parts: number
          created_at: string
          front_edge_direction: string | null
          group_id: string | null
          id: string
          job_id: string
          tape_code_primary: string
          tenant_id: string
          thickness_mm: number | null
          updated_at: string
        }
        Insert: {
          batch_name: string
          colour_name?: string | null
          count_parts?: number
          created_at?: string
          front_edge_direction?: string | null
          group_id?: string | null
          id?: string
          job_id: string
          tape_code_primary?: string
          tenant_id: string
          thickness_mm?: number | null
          updated_at?: string
        }
        Update: {
          batch_name?: string
          colour_name?: string | null
          count_parts?: number
          created_at?: string
          front_edge_direction?: string | null
          group_id?: string | null
          id?: string
          job_id?: string
          tape_code_primary?: string
          tenant_id?: string
          thickness_mm?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_edgeband_batches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "job_nesting_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_edgeband_batches_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_edgeband_batches_tenant_id_fkey"
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
      job_nesting_groups: {
        Row: {
          algorithm_pool: Json
          allow_mirror: boolean
          allow_mix_remnant_and_full_sheets: boolean
          allow_rotate_90: boolean
          allow_rotation_90: boolean
          colour_name: string | null
          created_at: string
          grain_direction: string | null
          group_label: string
          id: string
          job_id: string
          keep_parts_together: boolean | null
          locked: boolean
          margin_mm: number
          material_code: string | null
          nest_method: string | null
          nesting_engine: string
          optimisation_runs: number
          optimisation_seed: string | null
          optimisation_time_limit_seconds: number
          prioritise_grain_parts: boolean | null
          remnant_first: boolean
          remnant_max_count_to_try: number
          remnant_min_utilisation_percent: number
          sheet_length_mm: number
          sheet_width_mm: number
          sort_strategy: string
          spacing_mm: number
          tenant_id: string
          thickness_mm: number | null
          toolpath_template_id: string | null
          updated_at: string
        }
        Insert: {
          algorithm_pool?: Json
          allow_mirror?: boolean
          allow_mix_remnant_and_full_sheets?: boolean
          allow_rotate_90?: boolean
          allow_rotation_90?: boolean
          colour_name?: string | null
          created_at?: string
          grain_direction?: string | null
          group_label: string
          id?: string
          job_id: string
          keep_parts_together?: boolean | null
          locked?: boolean
          margin_mm?: number
          material_code?: string | null
          nest_method?: string | null
          nesting_engine?: string
          optimisation_runs?: number
          optimisation_seed?: string | null
          optimisation_time_limit_seconds?: number
          prioritise_grain_parts?: boolean | null
          remnant_first?: boolean
          remnant_max_count_to_try?: number
          remnant_min_utilisation_percent?: number
          sheet_length_mm?: number
          sheet_width_mm?: number
          sort_strategy?: string
          spacing_mm?: number
          tenant_id: string
          thickness_mm?: number | null
          toolpath_template_id?: string | null
          updated_at?: string
        }
        Update: {
          algorithm_pool?: Json
          allow_mirror?: boolean
          allow_mix_remnant_and_full_sheets?: boolean
          allow_rotate_90?: boolean
          allow_rotation_90?: boolean
          colour_name?: string | null
          created_at?: string
          grain_direction?: string | null
          group_label?: string
          id?: string
          job_id?: string
          keep_parts_together?: boolean | null
          locked?: boolean
          margin_mm?: number
          material_code?: string | null
          nest_method?: string | null
          nesting_engine?: string
          optimisation_runs?: number
          optimisation_seed?: string | null
          optimisation_time_limit_seconds?: number
          prioritise_grain_parts?: boolean | null
          remnant_first?: boolean
          remnant_max_count_to_try?: number
          remnant_min_utilisation_percent?: number
          sheet_length_mm?: number
          sheet_width_mm?: number
          sort_strategy?: string
          spacing_mm?: number
          tenant_id?: string
          thickness_mm?: number | null
          toolpath_template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_nesting_groups_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_nesting_groups_material_code_fkey"
            columns: ["material_code"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["material_code"]
          },
          {
            foreignKeyName: "job_nesting_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_nesting_groups_toolpath_template_id_fkey"
            columns: ["toolpath_template_id"]
            isOneToOne: false
            referencedRelation: "toolpath_templates"
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
      job_performance_snapshots: {
        Row: {
          assembly_hours: number
          cnc_hours: number
          completed_at: string
          created_at: string
          external_cost: number
          gross_profit: number
          id: string
          install_hours: number
          job_id: string
          job_type: string
          labour_cost: number
          margin_percent: number
          material_cost: number
          sheets_scrapped: number
          sheets_used: number
          tenant_id: string
          total_labour_hours: number
          total_machine_hours: number
          total_revenue_ex_vat: number
        }
        Insert: {
          assembly_hours?: number
          cnc_hours?: number
          completed_at?: string
          created_at?: string
          external_cost?: number
          gross_profit?: number
          id?: string
          install_hours?: number
          job_id: string
          job_type?: string
          labour_cost?: number
          margin_percent?: number
          material_cost?: number
          sheets_scrapped?: number
          sheets_used?: number
          tenant_id: string
          total_labour_hours?: number
          total_machine_hours?: number
          total_revenue_ex_vat?: number
        }
        Update: {
          assembly_hours?: number
          cnc_hours?: number
          completed_at?: string
          created_at?: string
          external_cost?: number
          gross_profit?: number
          id?: string
          install_hours?: number
          job_id?: string
          job_type?: string
          labour_cost?: number
          margin_percent?: number
          material_cost?: number
          sheets_scrapped?: number
          sheets_used?: number
          tenant_id?: string
          total_labour_hours?: number
          total_machine_hours?: number
          total_revenue_ex_vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_performance_snapshots_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_performance_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sheet_layouts: {
        Row: {
          algorithm_used: string
          created_at: string
          created_by: string | null
          grain_direction: string
          group_id: string
          id: string
          job_id: string
          margin_mm: number
          sheet_id: string | null
          sheet_length_mm: number
          sheet_number: number
          sheet_width_mm: number
          spacing_mm: number
          tenant_id: string
          utilisation_percent: number
          waste_area_mm2: number
        }
        Insert: {
          algorithm_used?: string
          created_at?: string
          created_by?: string | null
          grain_direction?: string
          group_id: string
          id?: string
          job_id: string
          margin_mm?: number
          sheet_id?: string | null
          sheet_length_mm: number
          sheet_number: number
          sheet_width_mm: number
          spacing_mm?: number
          tenant_id: string
          utilisation_percent?: number
          waste_area_mm2?: number
        }
        Update: {
          algorithm_used?: string
          created_at?: string
          created_by?: string | null
          grain_direction?: string
          group_id?: string
          id?: string
          job_id?: string
          margin_mm?: number
          sheet_id?: string | null
          sheet_length_mm?: number
          sheet_number?: number
          sheet_width_mm?: number
          spacing_mm?: number
          tenant_id?: string
          utilisation_percent?: number
          waste_area_mm2?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_sheet_layouts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "job_nesting_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheet_layouts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheet_layouts_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "job_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheet_layouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sheet_parts: {
        Row: {
          bounding_box_ok: boolean
          created_at: string
          grain_locked: boolean
          height_mm: number
          id: string
          layout_id: string
          library_part_id: string | null
          part_id: string
          qty_instance_index: number
          rotation_deg: number
          sheet_id: string | null
          source_dxf_ref: string | null
          tenant_id: string
          width_mm: number
          x_mm: number
          y_mm: number
        }
        Insert: {
          bounding_box_ok?: boolean
          created_at?: string
          grain_locked?: boolean
          height_mm: number
          id?: string
          layout_id: string
          library_part_id?: string | null
          part_id: string
          qty_instance_index?: number
          rotation_deg?: number
          sheet_id?: string | null
          source_dxf_ref?: string | null
          tenant_id: string
          width_mm: number
          x_mm?: number
          y_mm?: number
        }
        Update: {
          bounding_box_ok?: boolean
          created_at?: string
          grain_locked?: boolean
          height_mm?: number
          id?: string
          layout_id?: string
          library_part_id?: string | null
          part_id?: string
          qty_instance_index?: number
          rotation_deg?: number
          sheet_id?: string | null
          source_dxf_ref?: string | null
          tenant_id?: string
          width_mm?: number
          x_mm?: number
          y_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_sheet_parts_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "job_sheet_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheet_parts_library_part_id_fkey"
            columns: ["library_part_id"]
            isOneToOne: false
            referencedRelation: "part_library"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheet_parts_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "job_sheets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheet_parts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_sheets: {
        Row: {
          created_at: string
          cut_at: string | null
          cut_by: string | null
          id: string
          job_id: string
          material_code: string | null
          nesting_group_id: string | null
          notes: string | null
          qr_payload: string | null
          sheet_length_mm: number
          sheet_number: number
          sheet_width_mm: number
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cut_at?: string | null
          cut_by?: string | null
          id?: string
          job_id: string
          material_code?: string | null
          nesting_group_id?: string | null
          notes?: string | null
          qr_payload?: string | null
          sheet_length_mm?: number
          sheet_number?: number
          sheet_width_mm?: number
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cut_at?: string | null
          cut_by?: string | null
          id?: string
          job_id?: string
          material_code?: string | null
          nesting_group_id?: string | null
          notes?: string | null
          qr_payload?: string | null
          sheet_length_mm?: number
          sheet_number?: number
          sheet_width_mm?: number
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_sheets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheets_material_code_fkey"
            columns: ["material_code"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["material_code"]
          },
          {
            foreignKeyName: "job_sheets_nesting_group_id_fkey"
            columns: ["nesting_group_id"]
            isOneToOne: false
            referencedRelation: "job_nesting_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_sheets_tenant_id_fkey"
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
      job_time_actuals: {
        Row: {
          actual_assembly_hours: number
          actual_cnc_hours: number
          actual_install_hours: number
          actual_spray_hours: number
          actual_total_hours: number
          created_at: string
          id: string
          job_id: string
          last_updated: string
          tenant_id: string
        }
        Insert: {
          actual_assembly_hours?: number
          actual_cnc_hours?: number
          actual_install_hours?: number
          actual_spray_hours?: number
          actual_total_hours?: number
          created_at?: string
          id?: string
          job_id: string
          last_updated?: string
          tenant_id?: string
        }
        Update: {
          actual_assembly_hours?: number
          actual_cnc_hours?: number
          actual_install_hours?: number
          actual_spray_hours?: number
          actual_total_hours?: number
          created_at?: string
          id?: string
          job_id?: string
          last_updated?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_time_actuals_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_time_actuals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      job_time_plans: {
        Row: {
          based_on_baseline: boolean
          created_at: string
          id: string
          job_id: string
          plan_created_at: string
          planned_assembly_hours: number
          planned_cnc_hours: number
          planned_install_hours: number
          planned_machine_hours: number
          planned_spray_hours: number
          planned_total_hours: number
          tenant_id: string
        }
        Insert: {
          based_on_baseline?: boolean
          created_at?: string
          id?: string
          job_id: string
          plan_created_at?: string
          planned_assembly_hours?: number
          planned_cnc_hours?: number
          planned_install_hours?: number
          planned_machine_hours?: number
          planned_spray_hours?: number
          planned_total_hours?: number
          tenant_id?: string
        }
        Update: {
          based_on_baseline?: boolean
          created_at?: string
          id?: string
          job_id?: string
          plan_created_at?: string
          planned_assembly_hours?: number
          planned_cnc_hours?: number
          planned_install_hours?: number
          planned_machine_hours?: number
          planned_spray_hours?: number
          planned_total_hours?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_time_plans_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: true
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_time_plans_tenant_id_fkey"
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
          customer_id: string | null
          due_date: string | null
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
          customer_id?: string | null
          due_date?: string | null
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
          customer_id?: string | null
          due_date?: string | null
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
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
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
      material_cost_history: {
        Row: {
          cost_per_sheet: number
          created_at: string
          currency: string
          effective_date: string
          id: string
          material_product_id: string
          supplier_name: string | null
          tenant_id: string
        }
        Insert: {
          cost_per_sheet: number
          created_at?: string
          currency?: string
          effective_date?: string
          id?: string
          material_product_id: string
          supplier_name?: string | null
          tenant_id: string
        }
        Update: {
          cost_per_sheet?: number
          created_at?: string
          currency?: string
          effective_date?: string
          id?: string
          material_product_id?: string
          supplier_name?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_cost_history_material_product_id_fkey"
            columns: ["material_product_id"]
            isOneToOne: false
            referencedRelation: "material_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_cost_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      material_products: {
        Row: {
          active: boolean
          brand: string | null
          colour_name: string | null
          cost_per_sheet: number
          created_at: string
          currency: string
          grain_default: string | null
          id: string
          material_code: string
          material_type_id: string | null
          notes: string | null
          rotation_allowed_90_default: boolean
          sheet_length_mm: number
          sheet_width_mm: number
          tenant_id: string
          thickness_mm: number
          updated_at: string
          waste_factor_percent: number
        }
        Insert: {
          active?: boolean
          brand?: string | null
          colour_name?: string | null
          cost_per_sheet: number
          created_at?: string
          currency?: string
          grain_default?: string | null
          id?: string
          material_code: string
          material_type_id?: string | null
          notes?: string | null
          rotation_allowed_90_default?: boolean
          sheet_length_mm?: number
          sheet_width_mm?: number
          tenant_id: string
          thickness_mm: number
          updated_at?: string
          waste_factor_percent?: number
        }
        Update: {
          active?: boolean
          brand?: string | null
          colour_name?: string | null
          cost_per_sheet?: number
          created_at?: string
          currency?: string
          grain_default?: string | null
          id?: string
          material_code?: string
          material_type_id?: string | null
          notes?: string | null
          rotation_allowed_90_default?: boolean
          sheet_length_mm?: number
          sheet_width_mm?: number
          tenant_id?: string
          thickness_mm?: number
          updated_at?: string
          waste_factor_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "material_products_material_type_id_fkey"
            columns: ["material_type_id"]
            isOneToOne: false
            referencedRelation: "material_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      material_types: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_types_tenant_id_fkey"
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
      nesting_runs: {
        Row: {
          algorithm_variant: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          group_id: string
          id: string
          job_id: string
          min_sheet_utilisation_percent: number
          output_summary_json: Json | null
          parameters_json: Json | null
          remnant_area_used_mm2: number
          result_hash: string | null
          run_index: number
          selected: boolean
          sheet_count: number
          started_at: string
          status: string
          tenant_id: string
          utilisation_percent: number
        }
        Insert: {
          algorithm_variant?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          group_id: string
          id?: string
          job_id: string
          min_sheet_utilisation_percent?: number
          output_summary_json?: Json | null
          parameters_json?: Json | null
          remnant_area_used_mm2?: number
          result_hash?: string | null
          run_index?: number
          selected?: boolean
          sheet_count?: number
          started_at?: string
          status?: string
          tenant_id: string
          utilisation_percent?: number
        }
        Update: {
          algorithm_variant?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          group_id?: string
          id?: string
          job_id?: string
          min_sheet_utilisation_percent?: number
          output_summary_json?: Json | null
          parameters_json?: Json | null
          remnant_area_used_mm2?: number
          result_hash?: string | null
          run_index?: number
          selected?: boolean
          sheet_count?: number
          started_at?: string
          status?: string
          tenant_id?: string
          utilisation_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "nesting_runs_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "job_nesting_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nesting_runs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nesting_runs_tenant_id_fkey"
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
      part_library: {
        Row: {
          active: boolean
          bbox_confidence: string | null
          bbox_extracted_at: string | null
          bbox_height_mm: number | null
          bbox_source: string | null
          bbox_width_mm: number | null
          clearance_mm: number
          created_at: string
          created_by: string | null
          description: string | null
          dxf_file_reference: string | null
          dxf_outline_layer_name: string | null
          edge_profile_json: Json | null
          extraction_notes: string | null
          face_orientation: string | null
          front_edge_designation: string | null
          grain_axis: string | null
          grain_required: boolean
          id: string
          kerf_mm: number
          length_mm: number
          material_code: string | null
          outer_polygon_points_json: Json | null
          outer_shape_type: string
          outline_layer_name_used: string | null
          part_code: string
          polygon_confidence: string | null
          polygon_extracted_at: string | null
          polygon_source: string | null
          product_code: string | null
          rotation_allowed: string | null
          tags: string[] | null
          tenant_id: string
          thickness_mm: number | null
          updated_at: string
          version: number
          width_mm: number
        }
        Insert: {
          active?: boolean
          bbox_confidence?: string | null
          bbox_extracted_at?: string | null
          bbox_height_mm?: number | null
          bbox_source?: string | null
          bbox_width_mm?: number | null
          clearance_mm?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          dxf_file_reference?: string | null
          dxf_outline_layer_name?: string | null
          edge_profile_json?: Json | null
          extraction_notes?: string | null
          face_orientation?: string | null
          front_edge_designation?: string | null
          grain_axis?: string | null
          grain_required?: boolean
          id?: string
          kerf_mm?: number
          length_mm?: number
          material_code?: string | null
          outer_polygon_points_json?: Json | null
          outer_shape_type?: string
          outline_layer_name_used?: string | null
          part_code: string
          polygon_confidence?: string | null
          polygon_extracted_at?: string | null
          polygon_source?: string | null
          product_code?: string | null
          rotation_allowed?: string | null
          tags?: string[] | null
          tenant_id: string
          thickness_mm?: number | null
          updated_at?: string
          version?: number
          width_mm?: number
        }
        Update: {
          active?: boolean
          bbox_confidence?: string | null
          bbox_extracted_at?: string | null
          bbox_height_mm?: number | null
          bbox_source?: string | null
          bbox_width_mm?: number | null
          clearance_mm?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          dxf_file_reference?: string | null
          dxf_outline_layer_name?: string | null
          edge_profile_json?: Json | null
          extraction_notes?: string | null
          face_orientation?: string | null
          front_edge_designation?: string | null
          grain_axis?: string | null
          grain_required?: boolean
          id?: string
          kerf_mm?: number
          length_mm?: number
          material_code?: string | null
          outer_polygon_points_json?: Json | null
          outer_shape_type?: string
          outline_layer_name_used?: string | null
          part_code?: string
          polygon_confidence?: string | null
          polygon_extracted_at?: string | null
          polygon_source?: string | null
          product_code?: string | null
          rotation_allowed?: string | null
          tags?: string[] | null
          tenant_id?: string
          thickness_mm?: number | null
          updated_at?: string
          version?: number
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "part_library_material_code_fkey"
            columns: ["material_code"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["material_code"]
          },
          {
            foreignKeyName: "part_library_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          bbox_confidence: string | null
          bbox_extracted_at: string | null
          bbox_height_mm: number | null
          bbox_source: string | null
          bbox_width_mm: number | null
          colour_name: string | null
          created_at: string
          dxf_file_reference: string | null
          extraction_notes: string | null
          grain_axis: string | null
          grain_required: boolean
          id: string
          job_id: string
          length_mm: number
          library_part_id: string | null
          material_code: string | null
          outer_polygon_points_json: Json | null
          outer_shape_type: string | null
          outline_layer_name_used: string | null
          part_id: string
          polygon_confidence: string | null
          polygon_source: string | null
          product_code: string
          quantity: number
          rotation_allowed: string | null
          tenant_id: string
          thickness_mm: number | null
          updated_at: string
          validation_status: string | null
          width_mm: number
        }
        Insert: {
          bbox_confidence?: string | null
          bbox_extracted_at?: string | null
          bbox_height_mm?: number | null
          bbox_source?: string | null
          bbox_width_mm?: number | null
          colour_name?: string | null
          created_at?: string
          dxf_file_reference?: string | null
          extraction_notes?: string | null
          grain_axis?: string | null
          grain_required?: boolean
          id?: string
          job_id: string
          length_mm: number
          library_part_id?: string | null
          material_code?: string | null
          outer_polygon_points_json?: Json | null
          outer_shape_type?: string | null
          outline_layer_name_used?: string | null
          part_id: string
          polygon_confidence?: string | null
          polygon_source?: string | null
          product_code: string
          quantity?: number
          rotation_allowed?: string | null
          tenant_id?: string
          thickness_mm?: number | null
          updated_at?: string
          validation_status?: string | null
          width_mm: number
        }
        Update: {
          bbox_confidence?: string | null
          bbox_extracted_at?: string | null
          bbox_height_mm?: number | null
          bbox_source?: string | null
          bbox_width_mm?: number | null
          colour_name?: string | null
          created_at?: string
          dxf_file_reference?: string | null
          extraction_notes?: string | null
          grain_axis?: string | null
          grain_required?: boolean
          id?: string
          job_id?: string
          length_mm?: number
          library_part_id?: string | null
          material_code?: string | null
          outer_polygon_points_json?: Json | null
          outer_shape_type?: string | null
          outline_layer_name_used?: string | null
          part_id?: string
          polygon_confidence?: string | null
          polygon_source?: string | null
          product_code?: string
          quantity?: number
          rotation_allowed?: string | null
          tenant_id?: string
          thickness_mm?: number | null
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
            foreignKeyName: "parts_library_part_id_fkey"
            columns: ["library_part_id"]
            isOneToOne: false
            referencedRelation: "part_library"
            referencedColumns: ["id"]
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
      payroll_settings: {
        Row: {
          created_at: string
          enable_productivity_kpis: boolean
          enable_staff_pay_estimate: boolean
          id: string
          include_overtime_in_estimate: boolean
          overtime_multiplier: number
          pay_currency: string
          pay_frequency: string
          rounding_rule: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enable_productivity_kpis?: boolean
          enable_staff_pay_estimate?: boolean
          id?: string
          include_overtime_in_estimate?: boolean
          overtime_multiplier?: number
          pay_currency?: string
          pay_frequency?: string
          rounding_rule?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enable_productivity_kpis?: boolean
          enable_staff_pay_estimate?: boolean
          id?: string
          include_overtime_in_estimate?: boolean
          overtime_multiplier?: number
          pay_currency?: string
          pay_frequency?: string
          rounding_rule?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      po_delivery_events: {
        Row: {
          created_at: string
          created_by_name: string
          created_by_type: string
          event_date: string
          event_type: string
          id: string
          notes: string | null
          po_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by_name: string
          created_by_type?: string
          event_date?: string
          event_type?: string
          id?: string
          notes?: string | null
          po_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by_name?: string
          created_by_type?: string
          event_date?: string
          event_type?: string
          id?: string
          notes?: string | null
          po_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "po_delivery_events_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "po_delivery_events_tenant_id_fkey"
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
      production_schedule: {
        Row: {
          actual_hours: number
          assigned_staff_ids: string[] | null
          created_at: string
          id: string
          job_id: string
          notes: string | null
          planned_hours: number
          scheduled_date: string
          sort_order: number
          stage_name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actual_hours?: number
          assigned_staff_ids?: string[] | null
          created_at?: string
          id?: string
          job_id: string
          notes?: string | null
          planned_hours?: number
          scheduled_date: string
          sort_order?: number
          stage_name: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          actual_hours?: number
          assigned_staff_ids?: string[] | null
          created_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          planned_hours?: number
          scheduled_date?: string
          sort_order?: number
          stage_name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_schedule_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_schedule_tenant_id_fkey"
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
          annual_salary: number | null
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
          hourly_rate: number | null
          id: string
          ni_number: string | null
          passport_number: string | null
          pay_type: string
          start_date: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          annual_salary?: number | null
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
          hourly_rate?: number | null
          id?: string
          ni_number?: string | null
          passport_number?: string | null
          pay_type?: string
          start_date?: string
          tenant_id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          annual_salary?: number | null
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
          hourly_rate?: number | null
          id?: string
          ni_number?: string | null
          passport_number?: string | null
          pay_type?: string
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
      purchase_order_items: {
        Row: {
          created_at: string
          description: string
          id: string
          job_cost_category: string
          po_id: string
          quantity: number
          received_quantity: number
          status: string
          tenant_id: string
          total_ex_vat: number
          unit_cost_ex_vat: number
          updated_at: string
          vat_rate: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          job_cost_category?: string
          po_id: string
          quantity?: number
          received_quantity?: number
          status?: string
          tenant_id: string
          total_ex_vat?: number
          unit_cost_ex_vat?: number
          updated_at?: string
          vat_rate?: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          job_cost_category?: string
          po_id?: string
          quantity?: number
          received_quantity?: number
          status?: string
          tenant_id?: string
          total_ex_vat?: number
          unit_cost_ex_vat?: number
          updated_at?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          confirmed_delivery_date: string | null
          created_at: string
          created_by_staff_id: string | null
          delivery_address: string | null
          delivery_note_reference: string | null
          expected_delivery_date: string | null
          id: string
          job_id: string | null
          linked_bill_id: string | null
          notes: string | null
          order_date: string
          po_number: string
          status: string
          supplier_id: string
          tenant_id: string
          total_ex_vat: number
          total_inc_vat: number
          tracking_reference: string | null
          updated_at: string
          vat_amount: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          confirmed_delivery_date?: string | null
          created_at?: string
          created_by_staff_id?: string | null
          delivery_address?: string | null
          delivery_note_reference?: string | null
          expected_delivery_date?: string | null
          id?: string
          job_id?: string | null
          linked_bill_id?: string | null
          notes?: string | null
          order_date?: string
          po_number: string
          status?: string
          supplier_id: string
          tenant_id: string
          total_ex_vat?: number
          total_inc_vat?: number
          tracking_reference?: string | null
          updated_at?: string
          vat_amount?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          confirmed_delivery_date?: string | null
          created_at?: string
          created_by_staff_id?: string | null
          delivery_address?: string | null
          delivery_note_reference?: string | null
          expected_delivery_date?: string | null
          id?: string
          job_id?: string | null
          linked_bill_id?: string | null
          notes?: string | null
          order_date?: string
          po_number?: string
          status?: string
          supplier_id?: string
          tenant_id?: string
          total_ex_vat?: number
          total_inc_vat?: number
          tracking_reference?: string | null
          updated_at?: string
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_linked_bill_id_fkey"
            columns: ["linked_bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchasing_settings: {
        Row: {
          approver_role: string | null
          auto_approve_under_amount: boolean | null
          created_at: string
          default_delivery_address: string | null
          id: string
          po_number_next_seq: number | null
          po_number_prefix: string | null
          require_po_approval_over_amount: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approver_role?: string | null
          auto_approve_under_amount?: boolean | null
          created_at?: string
          default_delivery_address?: string | null
          id?: string
          po_number_next_seq?: number | null
          po_number_prefix?: string | null
          require_po_approval_over_amount?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approver_role?: string | null
          auto_approve_under_amount?: boolean | null
          created_at?: string
          default_delivery_address?: string | null
          id?: string
          po_number_next_seq?: number | null
          po_number_prefix?: string | null
          require_po_approval_over_amount?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchasing_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_line_items: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          markup_percent: number
          quantity: number
          quote_id: string
          sort_order: number
          tenant_id: string
          total: number | null
          unit_cost: number
        }
        Insert: {
          category?: string
          created_at?: string
          description: string
          id?: string
          markup_percent?: number
          quantity?: number
          quote_id: string
          sort_order?: number
          tenant_id: string
          total?: number | null
          unit_cost?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          markup_percent?: number
          quantity?: number
          quote_id?: string
          sort_order?: number
          tenant_id?: string
          total?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "smart_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_notes: {
        Row: {
          author_name: string
          created_at: string
          id: string
          note: string
          quote_id: string
          tenant_id: string
        }
        Insert: {
          author_name: string
          created_at?: string
          id?: string
          note: string
          quote_id: string
          tenant_id: string
        }
        Update: {
          author_name?: string
          created_at?: string
          id?: string
          note?: string
          quote_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_notes_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "smart_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_templates: {
        Row: {
          active: boolean
          base_labour_markup_percent: number
          base_material_markup_percent: number
          base_overhead_percent: number
          created_at: string
          hourly_rate: number
          id: string
          job_type: string
          name: string
          target_margin_percent: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          base_labour_markup_percent?: number
          base_material_markup_percent?: number
          base_overhead_percent?: number
          created_at?: string
          hourly_rate?: number
          id?: string
          job_type?: string
          name: string
          target_margin_percent?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          base_labour_markup_percent?: number
          base_material_markup_percent?: number
          base_overhead_percent?: number
          created_at?: string
          hourly_rate?: number
          id?: string
          job_type?: string
          name?: string
          target_margin_percent?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string | null
          id: string
          quote_id: string
          snapshot_json: Json
          tenant_id: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          quote_id: string
          snapshot_json?: Json
          tenant_id: string
          version_number?: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          quote_id?: string
          snapshot_json?: Json
          tenant_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_versions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "smart_quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_versions_tenant_id_fkey"
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
      smart_quotes: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          assembly_complexity: string
          converted_job_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          drift_adjusted_value: number | null
          drift_adjustment_percent: number | null
          estimated_cnc_sheets: number
          estimated_install_days: number
          estimated_sheets: number
          external_estimate: number
          historical_confidence: number | null
          id: string
          job_type: string
          labour_estimate: number
          margin_sensitivity: Json
          material_estimate: number
          notes_count: number | null
          overhead_estimate: number
          special_factors: Json
          status: string
          suggested_deposit: number
          suggested_quote_value: number
          target_margin_percent: number
          template_id: string | null
          tenant_id: string
          title: string
          updated_at: string
          use_historical_data: boolean
          version_count: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          assembly_complexity?: string
          converted_job_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          drift_adjusted_value?: number | null
          drift_adjustment_percent?: number | null
          estimated_cnc_sheets?: number
          estimated_install_days?: number
          estimated_sheets?: number
          external_estimate?: number
          historical_confidence?: number | null
          id?: string
          job_type?: string
          labour_estimate?: number
          margin_sensitivity?: Json
          material_estimate?: number
          notes_count?: number | null
          overhead_estimate?: number
          special_factors?: Json
          status?: string
          suggested_deposit?: number
          suggested_quote_value?: number
          target_margin_percent?: number
          template_id?: string | null
          tenant_id: string
          title: string
          updated_at?: string
          use_historical_data?: boolean
          version_count?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          assembly_complexity?: string
          converted_job_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          drift_adjusted_value?: number | null
          drift_adjustment_percent?: number | null
          estimated_cnc_sheets?: number
          estimated_install_days?: number
          estimated_sheets?: number
          external_estimate?: number
          historical_confidence?: number | null
          id?: string
          job_type?: string
          labour_estimate?: number
          margin_sensitivity?: Json
          material_estimate?: number
          notes_count?: number | null
          overhead_estimate?: number
          special_factors?: Json
          status?: string
          suggested_deposit?: number
          suggested_quote_value?: number
          target_margin_percent?: number
          template_id?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
          use_historical_data?: boolean
          version_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_quotes_converted_job_id_fkey"
            columns: ["converted_job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_quotes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_quotes_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "quote_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_quotes_tenant_id_fkey"
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
      staff_pay_profiles: {
        Row: {
          created_at: string
          hourly_rate: number | null
          id: string
          overtime_eligible: boolean
          pay_type: string
          salary_monthly: number | null
          staff_id: string
          tax_handling_note: string
          tenant_id: string
          updated_at: string
          visible_to_staff: boolean
        }
        Insert: {
          created_at?: string
          hourly_rate?: number | null
          id?: string
          overtime_eligible?: boolean
          pay_type?: string
          salary_monthly?: number | null
          staff_id: string
          tax_handling_note?: string
          tenant_id: string
          updated_at?: string
          visible_to_staff?: boolean
        }
        Update: {
          created_at?: string
          hourly_rate?: number | null
          id?: string
          overtime_eligible?: boolean
          pay_type?: string
          salary_monthly?: number | null
          staff_id?: string
          tax_handling_note?: string
          tenant_id?: string
          updated_at?: string
          visible_to_staff?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "staff_pay_profiles_tenant_id_fkey"
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
      stage_capacity_config: {
        Row: {
          active: boolean
          created_at: string
          daily_available_hours: number
          id: string
          max_concurrent_jobs: number
          notes: string | null
          stage_name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          daily_available_hours?: number
          id?: string
          max_concurrent_jobs?: number
          notes?: string | null
          stage_name: string
          tenant_id?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          daily_available_hours?: number
          id?: string
          max_concurrent_jobs?: number
          notes?: string | null
          stage_name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_capacity_config_tenant_id_fkey"
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
      stage_time_baselines: {
        Row: {
          avg_hours: number
          avg_hours_per_sheet: number | null
          avg_hours_per_unit: number | null
          confidence_score: number
          created_at: string
          id: string
          job_type: string
          last_updated: string
          sample_size: number
          stage_name: string
          tenant_id: string
        }
        Insert: {
          avg_hours?: number
          avg_hours_per_sheet?: number | null
          avg_hours_per_unit?: number | null
          confidence_score?: number
          created_at?: string
          id?: string
          job_type?: string
          last_updated?: string
          sample_size?: number
          stage_name: string
          tenant_id: string
        }
        Update: {
          avg_hours?: number
          avg_hours_per_sheet?: number | null
          avg_hours_per_unit?: number | null
          confidence_score?: number
          created_at?: string
          id?: string
          job_type?: string
          last_updated?: string
          sample_size?: number
          stage_name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_time_baselines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_access_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          po_id: string | null
          revoked: boolean
          supplier_id: string
          supplier_user_id: string
          tenant_id: string
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          po_id?: string | null
          revoked?: boolean
          supplier_id: string
          supplier_user_id: string
          tenant_id: string
          token?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          po_id?: string | null
          revoked?: boolean
          supplier_id?: string
          supplier_user_id?: string
          tenant_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_access_tokens_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_access_tokens_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_access_tokens_supplier_user_id_fkey"
            columns: ["supplier_user_id"]
            isOneToOne: false
            referencedRelation: "supplier_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_access_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_activity_log: {
        Row: {
          action: string
          created_at: string
          id: string
          metadata: Json | null
          po_id: string | null
          supplier_user_id: string
          tenant_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          metadata?: Json | null
          po_id?: string | null
          supplier_user_id: string
          tenant_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          po_id?: string | null
          supplier_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_activity_log_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_activity_log_supplier_user_id_fkey"
            columns: ["supplier_user_id"]
            isOneToOne: false
            referencedRelation: "supplier_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_activity_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_performance: {
        Row: {
          average_delivery_delay_days: number
          average_order_value: number
          discrepancy_rate_percent: number
          id: string
          last_calculated_at: string
          on_time_delivery_percent: number
          supplier_id: string
          tenant_id: string
          total_pos: number
        }
        Insert: {
          average_delivery_delay_days?: number
          average_order_value?: number
          discrepancy_rate_percent?: number
          id?: string
          last_calculated_at?: string
          on_time_delivery_percent?: number
          supplier_id: string
          tenant_id: string
          total_pos?: number
        }
        Update: {
          average_delivery_delay_days?: number
          average_order_value?: number
          discrepancy_rate_percent?: number
          id?: string
          last_calculated_at?: string
          on_time_delivery_percent?: number
          supplier_id?: string
          tenant_id?: string
          total_pos?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_performance_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_performance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_po_documents: {
        Row: {
          created_at: string
          file_name: string
          file_reference: string | null
          file_size_bytes: number | null
          id: string
          notes: string | null
          po_id: string
          tenant_id: string
          uploaded_by_name: string
          uploaded_by_type: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_reference?: string | null
          file_size_bytes?: number | null
          id?: string
          notes?: string | null
          po_id: string
          tenant_id: string
          uploaded_by_name: string
          uploaded_by_type?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_reference?: string | null
          file_size_bytes?: number | null
          id?: string
          notes?: string | null
          po_id?: string
          tenant_id?: string
          uploaded_by_name?: string
          uploaded_by_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_po_documents_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_po_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_po_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          po_id: string
          sender_id: string
          sender_name: string
          sender_type: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          po_id: string
          sender_id: string
          sender_name: string
          sender_type?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          po_id?: string
          sender_id?: string
          sender_name?: string
          sender_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_po_messages_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_po_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_users: {
        Row: {
          active: boolean
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          portal_access_enabled: boolean
          supplier_id: string
          supplier_role: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          portal_access_enabled?: boolean
          supplier_id: string
          supplier_role?: string
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          portal_access_enabled?: boolean
          supplier_id?: string
          supplier_role?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_users_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_users_tenant_id_fkey"
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
          dxf_units_default: string | null
          id: string
          outline_layer_preference: string | null
          subscription_status: string
          tenant_name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          branding?: Json
          created_at?: string
          default_units?: string
          dxf_units_default?: string | null
          id?: string
          outline_layer_preference?: string | null
          subscription_status?: string
          tenant_name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          branding?: Json
          created_at?: string
          default_units?: string
          dxf_units_default?: string | null
          id?: string
          outline_layer_preference?: string | null
          subscription_status?: string
          tenant_name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      time_entries: {
        Row: {
          approved: boolean
          approved_by: string | null
          break_minutes: number
          clock_in: string
          clock_out: string | null
          created_at: string
          id: string
          notes: string | null
          staff_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved?: boolean
          approved_by?: string | null
          break_minutes?: number
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          staff_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved?: boolean
          approved_by?: string | null
          break_minutes?: number
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          staff_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
        | "production"
        | "installer"
        | "finance"
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
        "production",
        "installer",
        "finance",
      ],
    },
  },
} as const
