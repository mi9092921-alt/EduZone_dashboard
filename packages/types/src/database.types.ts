export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          slug: string;
          name: string;
          plan: string;
          status: string;
          region_id: string;
          data_residency: string;
          max_users: number;
          max_courses: number;
          max_storage_bytes: number;
          metadata: Json;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          plan?: string;
          status?: string;
          region_id?: string;
          data_residency?: string;
          max_users?: number;
          max_courses?: number;
          max_storage_bytes?: number;
          metadata?: Json;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          plan?: string;
          status?: string;
          region_id?: string;
          data_residency?: string;
          max_users?: number;
          max_courses?: number;
          max_storage_bytes?: number;
          metadata?: Json;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      users: {
        Row: {
          id: string;
          tenant_id: string;
          email: string | null;
          phone: string | null;
          first_name: string | null;
          last_name: string | null;
          avatar_url: string | null;
          timezone: string | null;
          locale: string | null;
          primary_role: string;
          account_status: string;
          lock_reason: string | null;
          locked_at: string | null;
          locked_by: string | null;
          suspension_until: string | null;
          token_version: number;
          warning_count: number;
          login_count: number;
          region_id: string;
          last_login: string | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          email_hash: string | null;
        };
        Insert: {
          id: string;
          tenant_id: string;
          email?: string | null;
          phone?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          avatar_url?: string | null;
          timezone?: string | null;
          locale?: string | null;
          primary_role?: string;
          account_status?: string;
          lock_reason?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          suspension_until?: string | null;
          token_version?: number;
          warning_count?: number;
          login_count?: number;
          region_id?: string;
          last_login?: string | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          email?: string | null;
          phone?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          avatar_url?: string | null;
          timezone?: string | null;
          locale?: string | null;
          primary_role?: string;
          account_status?: string;
          lock_reason?: string | null;
          locked_at?: string | null;
          locked_by?: string | null;
          suspension_until?: string | null;
          token_version?: number;
          warning_count?: number;
          login_count?: number;
          region_id?: string;
          last_login?: string | null;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      courses: {
        Row: {
          id: string;
          tenant_id: string;
          title: string;
          description: string | null;
          status: string;
          total_lessons: number;
          is_featured: boolean;
          thumbnail_url: string | null;
          slug: string | null;
          teacher_id: string | null;
          category: string | null;
          level: string;
          price: number;
          is_free: boolean;
          region_id: string;
          language: string;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          title: string;
          description?: string | null;
          status?: string;
          total_lessons?: number;
          is_featured?: boolean;
          thumbnail_url?: string | null;
          slug?: string | null;
          teacher_id?: string | null;
          category?: string | null;
          level?: string;
          price?: number;
          region_id?: string;
          language?: string;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          title?: string;
          description?: string | null;
          status?: string;
          total_lessons?: number;
          is_featured?: boolean;
          thumbnail_url?: string | null;
          slug?: string | null;
          teacher_id?: string | null;
          category?: string | null;
          level?: string;
          price?: number;
          region_id?: string;
          language?: string;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      sections: {
        Row: {
          id: string;
          course_id: string;
          tenant_id: string;
          title: string;
          description: string | null;
          order_index: number;
          is_published: boolean;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          course_id: string;
          tenant_id: string;
          title: string;
          description?: string | null;
          order_index?: number;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          course_id?: string;
          tenant_id?: string;
          title?: string;
          description?: string | null;
          order_index?: number;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      lessons: {
        Row: {
          id: string;
          section_id: string;
          course_id: string;
          tenant_id: string;
          title: string;
          order_index: number;
          is_published: boolean;
          is_preview: boolean;
          duration_sec: number | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          section_id: string;
          course_id: string;
          tenant_id: string;
          title: string;
          order_index?: number;
          is_published?: boolean;
          is_preview?: boolean;
          duration_sec?: number | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          section_id?: string;
          course_id?: string;
          tenant_id?: string;
          title?: string;
          order_index?: number;
          is_published?: boolean;
          is_preview?: boolean;
          duration_sec?: number | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      lesson_contents: {
        Row: {
          lesson_id: string;
          course_id: string;
          section_id: string;
          tenant_id: string;
          video_path: string;
          provider: string;
          duration_sec: number | null;
          captions_path: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          lesson_id: string;
          course_id: string;
          section_id: string;
          tenant_id: string;
          video_path: string;
          provider: string;
          duration_sec?: number | null;
          captions_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          lesson_id?: string;
          course_id?: string;
          section_id?: string;
          tenant_id?: string;
          video_path?: string;
          provider?: string;
          duration_sec?: number | null;
          captions_path?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      enrollments: {
        Row: {
          id: string;
          user_id: string;
          course_id: string;
          tenant_id: string;
          enrolled_at: string;
          enrolled_by: string | null;
          expires_at: string | null;
          status: string;
          progress_pct: number;
          completed_at: string | null;
          total_lessons: number;
          completed_lessons: number;
          last_watched_at: string | null;
          revoked_at: string | null;
          revoked_by: string | null;
          revoke_reason: string | null;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          course_id: string;
          tenant_id: string;
          enrolled_at?: string;
          enrolled_by?: string | null;
          expires_at?: string | null;
          status?: string;
          progress_pct?: number;
          completed_at?: string | null;
          total_lessons?: number;
          completed_lessons?: number;
          last_watched_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoke_reason?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          course_id?: string;
          tenant_id?: string;
          enrolled_at?: string;
          enrolled_by?: string | null;
          expires_at?: string | null;
          status?: string;
          progress_pct?: number;
          completed_at?: string | null;
          total_lessons?: number;
          completed_lessons?: number;
          last_watched_at?: string | null;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoke_reason?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };
      warnings: {
        Row: {
          id: string;
          user_id: string;
          tenant_id: string;
          issued_by: string | null;
          reason: string;
          severity: number;
          is_acknowledged: boolean;
          acknowledged_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          tenant_id: string;
          issued_by?: string | null;
          reason: string;
          severity?: number;
          is_acknowledged?: boolean;
          acknowledged_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          tenant_id?: string;
          issued_by?: string | null;
          reason?: string;
          severity?: number;
          is_acknowledged?: boolean;
          acknowledged_at?: string | null;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          tenant_id: string;
          title: string;
          body: string;
          region_id: string | null;
          target_audience: string;
          target_permission: string | null;
          deleted_at: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          title: string;
          body: string;
          region_id?: string | null;
          target_audience?: string;
          target_permission?: string | null;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          title?: string;
          body?: string;
          region_id?: string | null;
          target_audience?: string;
          target_permission?: string | null;
          deleted_at?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_notifications: {
        Row: {
          id: string;
          user_id: string;
          notification_id: string;
          tenant_id: string;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          notification_id: string;
          tenant_id: string;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          notification_id?: string;
          tenant_id?: string;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
        };
      };
      settings_kv: {
        Row: {
          key: string;
          value: Json;
          category: string;
          description: string | null;
          is_public: boolean;
          version: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          key: string;
          value: Json;
          category?: string;
          description?: string | null;
          is_public?: boolean;
          version?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          key?: string;
          value?: Json;
          category?: string;
          description?: string | null;
          is_public?: boolean;
          version?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
      };
      activity_logs: {
        Row: {
          id: string;
          seq: number;
          user_id: string | null;
          tenant_id: string;
          activity_type: string;
          details: Json;
          ip_address: string | null;
          device_id: string | null;
          risk_level: string;
          prev_hash: string | null;
          entry_hash: string;
          created_at: string;
        };
        Insert: {
          id: string;
          seq: number;
          user_id?: string | null;
          tenant_id: string;
          activity_type: string;
          details?: Json;
          ip_address?: string | null;
          device_id?: string | null;
          risk_level?: string;
          prev_hash?: string | null;
          entry_hash: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          seq?: number;
          user_id?: string | null;
          tenant_id?: string;
          activity_type?: string;
          details?: Json;
          ip_address?: string | null;
          device_id?: string | null;
          risk_level?: string;
          prev_hash?: string | null;
          entry_hash?: string;
          created_at?: string;
        };
      };
    };
    Views: {
      vw_course_stats: {
        Row: {
          course_id: string;
          tenant_id: string;
          enrolled_count: number;
          completed_count: number;
          avg_progress: number;
          total_views: number;
        };
      };
    };
    Functions: {
      get_users_paginated: {
        Args: {
          p_search?: string;
          p_tenant_id?: string;
          p_primary_role?: string;
          p_account_status?: string;
          p_region_id?: string;
          p_warning_count_gte?: number;
          p_last_login_from?: string;
          p_last_login_to?: string;
          p_page?: number;
          p_page_size?: number;
          _request_id?: string;
        };
        Returns: Json;
      };
      control_user_account: {
        Args: {
          p_user_id: string;
          p_action: string;
          p_reason?: string;
          p_suspend_hours?: number;
        };
        Returns: Json;
      };
      send_notification: {
        Args: {
          p_title: string;
          p_body: string;
          p_target_audience?: string;
          p_target_permission?: string;
          p_target_user_ids?: string[];
        };
        Returns: string;
      };
      admin_get_jobs: {
        Args: {
          p_page?: number;
          p_page_size?: number;
          p_status?: string;
          p_job_type?: string;
          p_date_from?: string;
        };
        Returns: {
          id: string;
          job_type: string;
          payload: Json;
          status: string;
          priority: number;
          attempts: number;
          max_attempts: number;
          run_at: string;
          locked_by: string;
          locked_at: string;
          lock_expires_at: string;
          started_at: string;
          completed_at: string;
          error_msg: string;
          created_at: string;
          full_count: number;
        }[];
      };
      get_dashboard_stats: {
        Args: {
          p_tenant_id?: string;
        };
        Returns: Json;
      };
      get_system_health: {
        Args: {};
        Returns: Json;
      };
    };
  };
  internal: {
    Tables: {
      job_queue: {
        Row: {
          id: string;
          tenant_id: string | null;
          job_type: string;
          payload: Json;
          payload_hash: string;
          status: string;
          priority: number;
          attempts: number;
          max_attempts: number;
          locked_by_worker_id: string | null;
          locked_at: string | null;
          lock_expires_at: string | null;
          next_retry_at: string | null;
          run_at: string;
          started_at: string | null;
          finished_at: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          job_type: string;
          payload?: Json;
          status?: string;
          priority?: number;
          attempts?: number;
          max_attempts?: number;
          locked_by_worker_id?: string | null;
          locked_at?: string | null;
          lock_expires_at?: string | null;
          next_retry_at?: string | null;
          run_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          job_type?: string;
          payload?: Json;
          status?: string;
          priority?: number;
          attempts?: number;
          max_attempts?: number;
          locked_by_worker_id?: string | null;
          locked_at?: string | null;
          lock_expires_at?: string | null;
          next_retry_at?: string | null;
          run_at?: string;
          started_at?: string | null;
          finished_at?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}
