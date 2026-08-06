export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      card: {
        Row: {
          created_at: string
          difficulty: number
          due: string
          id: number
          item_id: number
          lapses: number
          last_review: string | null
          learning_steps: number
          reps: number
          scheduled_days: number
          stability: number
          state: number
          suspended: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          difficulty?: number
          due: string
          id?: never
          item_id: number
          lapses?: number
          last_review?: string | null
          learning_steps?: number
          reps?: number
          scheduled_days?: number
          stability?: number
          state?: number
          suspended?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          difficulty?: number
          due?: string
          id?: never
          item_id?: number
          lapses?: number
          last_review?: string | null
          learning_steps?: number
          reps?: number
          scheduled_days?: number
          stability?: number
          state?: number
          suspended?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      companion_actions: {
        Row: {
          action_kind: string
          approved_by: string | null
          companion_id: string
          concept_ids: number[]
          content: string | null
          created_at: string
          gate_passed: boolean
          gate_reason: string | null
          id: string
          min_concept_mastery: number | null
          model: string | null
          model_version: string | null
          parent_action_id: string | null
          prompt_version: string | null
          target_summary: string | null
          task_kind: string | null
          user_id: string
        }
        Insert: {
          action_kind: string
          approved_by?: string | null
          companion_id: string
          concept_ids?: number[]
          content?: string | null
          created_at?: string
          gate_passed?: boolean
          gate_reason?: string | null
          id?: string
          min_concept_mastery?: number | null
          model?: string | null
          model_version?: string | null
          parent_action_id?: string | null
          prompt_version?: string | null
          target_summary?: string | null
          task_kind?: string | null
          user_id: string
        }
        Update: {
          action_kind?: string
          approved_by?: string | null
          companion_id?: string
          concept_ids?: number[]
          content?: string | null
          created_at?: string
          gate_passed?: boolean
          gate_reason?: string | null
          id?: string
          min_concept_mastery?: number | null
          model?: string | null
          model_version?: string | null
          parent_action_id?: string | null
          prompt_version?: string | null
          target_summary?: string | null
          task_kind?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "companion_actions_companion_id_fkey"
            columns: ["companion_id"]
            isOneToOne: false
            referencedRelation: "companions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companion_actions_parent_action_id_fkey"
            columns: ["parent_action_id"]
            isOneToOne: false
            referencedRelation: "companion_actions"
            referencedColumns: ["id"]
          },
        ]
      }
      companions: {
        Row: {
          capability_synced_at: string | null
          cosmetics: Json
          created_at: string
          id: string
          level: number
          memory: Json
          name: string | null
          species: string | null
          unlocked_capabilities: string[]
          updated_at: string
          user_id: string
          world_slug: string
          xp: number
        }
        Insert: {
          capability_synced_at?: string | null
          cosmetics?: Json
          created_at?: string
          id?: string
          level?: number
          memory?: Json
          name?: string | null
          species?: string | null
          unlocked_capabilities?: string[]
          updated_at?: string
          user_id: string
          world_slug: string
          xp?: number
        }
        Update: {
          capability_synced_at?: string | null
          cosmetics?: Json
          created_at?: string
          id?: string
          level?: number
          memory?: Json
          name?: string | null
          species?: string | null
          unlocked_capabilities?: string[]
          updated_at?: string
          user_id?: string
          world_slug?: string
          xp?: number
        }
        Relationships: [
          {
            foreignKeyName: "companions_world_slug_fkey"
            columns: ["world_slug"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["slug"]
          },
        ]
      }
      concepts: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          frequency_rank: number | null
          id: number
          is_active: boolean
          kind: string
          native_form: string | null
          parent_id: number | null
          slug: string
          tier: string | null
          tier_rank: number | null
          world_slug: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          frequency_rank?: number | null
          id?: never
          is_active?: boolean
          kind: string
          native_form?: string | null
          parent_id?: number | null
          slug: string
          tier?: string | null
          tier_rank?: number | null
          world_slug: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          frequency_rank?: number | null
          id?: never
          is_active?: boolean
          kind?: string
          native_form?: string | null
          parent_id?: number | null
          slug?: string
          tier?: string | null
          tier_rank?: number | null
          world_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepts_world_slug_fkey"
            columns: ["world_slug"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["slug"]
          },
        ]
      }
      daily_puzzle_items: {
        Row: {
          item_id: number
          ordinal: number
          puzzle_id: string
        }
        Insert: {
          item_id: number
          ordinal: number
          puzzle_id: string
        }
        Update: {
          item_id?: number
          ordinal?: number
          puzzle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_puzzle_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_puzzle_items_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "daily_puzzles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_puzzles: {
        Row: {
          closes_at: string
          created_at: string
          id: string
          opens_at: string
          puzzle_date: string
          world_slug: string
        }
        Insert: {
          closes_at: string
          created_at?: string
          id?: string
          opens_at: string
          puzzle_date: string
          world_slug: string
        }
        Update: {
          closes_at?: string
          created_at?: string
          id?: string
          opens_at?: string
          puzzle_date?: string
          world_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_puzzles_world_slug_fkey"
            columns: ["world_slug"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["slug"]
          },
        ]
      }
      daily_results: {
        Row: {
          completed_at: string | null
          correct_count: number
          elapsed_ms: number | null
          id: string
          outcomes: Json | null
          puzzle_id: string
          score: number
          share_grid: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          correct_count?: number
          elapsed_ms?: number | null
          id?: string
          outcomes?: Json | null
          puzzle_id: string
          score?: number
          share_grid?: string | null
          started_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          correct_count?: number
          elapsed_ms?: number | null
          id?: string
          outcomes?: Json | null
          puzzle_id?: string
          score?: number
          share_grid?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_results_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "daily_puzzles"
            referencedColumns: ["id"]
          },
        ]
      }
      fsrs_params: {
        Row: {
          fsrs_version: string
          id: number
          is_active: boolean
          log_loss: number | null
          rmse_bins: number | null
          train_items: number | null
          trained_at: string
          user_id: string | null
          w: number[]
        }
        Insert: {
          fsrs_version: string
          id?: number
          is_active?: boolean
          log_loss?: number | null
          rmse_bins?: number | null
          train_items?: number | null
          trained_at?: string
          user_id?: string | null
          w: number[]
        }
        Update: {
          fsrs_version?: string
          id?: number
          is_active?: boolean
          log_loss?: number | null
          rmse_bins?: number | null
          train_items?: number | null
          trained_at?: string
          user_id?: string | null
          w?: number[]
        }
        Relationships: []
      }
      item_concepts: {
        Row: {
          concept_id: number
          item_id: number
          weight: number
        }
        Insert: {
          concept_id: number
          item_id: number
          weight?: number
        }
        Update: {
          concept_id?: number
          item_id?: number
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "item_concepts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_concepts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      item_presentations: {
        Row: {
          card_id: number | null
          id: number
          is_correct: boolean | null
          is_holdout: boolean
          item_beta_at_presentation: number | null
          item_id: number
          match_id: string | null
          predicted_p: number | null
          presented_at: string
          responded_at: string | null
          response_ms: number | null
          score: number | null
          selection_policy: string
          user_id: string
          user_theta_at_presentation: number | null
        }
        Insert: {
          card_id?: number | null
          id?: never
          is_correct?: boolean | null
          is_holdout: boolean
          item_beta_at_presentation?: number | null
          item_id: number
          match_id?: string | null
          predicted_p?: number | null
          presented_at?: string
          responded_at?: string | null
          response_ms?: number | null
          score?: number | null
          selection_policy: string
          user_id: string
          user_theta_at_presentation?: number | null
        }
        Update: {
          card_id?: number | null
          id?: never
          is_correct?: boolean | null
          is_holdout?: boolean
          item_beta_at_presentation?: number | null
          item_id?: number
          match_id?: string | null
          predicted_p?: number | null
          presented_at?: string
          responded_at?: string | null
          response_ms?: number | null
          score?: number | null
          selection_policy?: string
          user_id?: string
          user_theta_at_presentation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "item_presentations_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_presentations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_presentations_match_fk"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      item_stats: {
        Row: {
          beta: number
          beta_n: number
          correct_count: number
          holdout_correct: number
          holdout_presentations: number
          irt_a: number | null
          irt_b: number | null
          irt_fitted_at: string | null
          item_id: number
          last_calibrated_at: string | null
          presentations: number
          updated_at: string
        }
        Insert: {
          beta?: number
          beta_n?: number
          correct_count?: number
          holdout_correct?: number
          holdout_presentations?: number
          irt_a?: number | null
          irt_b?: number | null
          irt_fitted_at?: string | null
          item_id: number
          last_calibrated_at?: string | null
          presentations?: number
          updated_at?: string
        }
        Update: {
          beta?: number
          beta_n?: number
          correct_count?: number
          holdout_correct?: number
          holdout_presentations?: number
          irt_a?: number | null
          irt_b?: number | null
          irt_fitted_at?: string | null
          item_id?: number
          last_calibrated_at?: string | null
          presentations?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_stats_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          answer: Json | null
          cold_start_beta: number | null
          constraint_text: string | null
          created_at: string
          id: number
          is_active: boolean
          kind: string
          ladder_slug: string | null
          license: string | null
          media_path: string | null
          prompt: Json
          rubric_version: string | null
          source: string | null
          time_limit_ms: number | null
          updated_at: string
          world_slug: string
        }
        Insert: {
          answer?: Json | null
          cold_start_beta?: number | null
          constraint_text?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          kind: string
          ladder_slug?: string | null
          license?: string | null
          media_path?: string | null
          prompt: Json
          rubric_version?: string | null
          source?: string | null
          time_limit_ms?: number | null
          updated_at?: string
          world_slug: string
        }
        Update: {
          answer?: Json | null
          cold_start_beta?: number | null
          constraint_text?: string | null
          created_at?: string
          id?: never
          is_active?: boolean
          kind?: string
          ladder_slug?: string | null
          license?: string | null
          media_path?: string | null
          prompt?: Json
          rubric_version?: string | null
          source?: string | null
          time_limit_ms?: number | null
          updated_at?: string
          world_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_ladder_slug_fkey"
            columns: ["ladder_slug"]
            isOneToOne: false
            referencedRelation: "ladders"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "items_world_slug_fkey"
            columns: ["world_slug"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["slug"]
          },
        ]
      }
      judge_gold_labels: {
        Row: {
          confidence: number | null
          human_verdict: string
          id: string
          is_active: boolean
          labeled_at: string
          labeler_id: string | null
          labeler_kind: string
          match_id: string | null
          notes: string | null
          rubric_text: string
          rubric_version: string
          submission_a_id: string
          submission_b_id: string
        }
        Insert: {
          confidence?: number | null
          human_verdict: string
          id?: string
          is_active?: boolean
          labeled_at?: string
          labeler_id?: string | null
          labeler_kind?: string
          match_id?: string | null
          notes?: string | null
          rubric_text: string
          rubric_version: string
          submission_a_id: string
          submission_b_id: string
        }
        Update: {
          confidence?: number | null
          human_verdict?: string
          id?: string
          is_active?: boolean
          labeled_at?: string
          labeler_id?: string | null
          labeler_kind?: string
          match_id?: string | null
          notes?: string | null
          rubric_text?: string
          rubric_version?: string
          submission_a_id?: string
          submission_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "judge_gold_labels_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_gold_labels_submission_a_id_fkey"
            columns: ["submission_a_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "judge_gold_labels_submission_b_id_fkey"
            columns: ["submission_b_id"]
            isOneToOne: false
            referencedRelation: "submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      judgments: {
        Row: {
          bt_p_seat1_beats_seat2: number | null
          bt_score_seat1: number | null
          bt_score_seat2: number | null
          completion_tokens: number | null
          cost_usd: number | null
          created_at: string
          id: string
          is_current: boolean
          judge_model: string
          judge_model_version: string
          judge_provider: string | null
          judge_temperature: number | null
          latency_ms: number | null
          match_id: string
          order_ab_axis_scores: Json | null
          order_ab_favored_user_id: string | null
          order_ab_raw: Json | null
          order_ab_reasoning: string | null
          order_ab_verdict: string
          order_ba_axis_scores: Json | null
          order_ba_favored_user_id: string | null
          order_ba_raw: Json | null
          order_ba_reasoning: string | null
          order_ba_verdict: string
          outcome_seat1: number | null
          position_disagreement: boolean | null
          prompt_tokens: number | null
          rubric_hash: string | null
          rubric_text: string
          rubric_version: string
          verdict: string
          verdict_summary: string | null
        }
        Insert: {
          bt_p_seat1_beats_seat2?: number | null
          bt_score_seat1?: number | null
          bt_score_seat2?: number | null
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          id?: string
          is_current?: boolean
          judge_model: string
          judge_model_version: string
          judge_provider?: string | null
          judge_temperature?: number | null
          latency_ms?: number | null
          match_id: string
          order_ab_axis_scores?: Json | null
          order_ab_favored_user_id?: string | null
          order_ab_raw?: Json | null
          order_ab_reasoning?: string | null
          order_ab_verdict: string
          order_ba_axis_scores?: Json | null
          order_ba_favored_user_id?: string | null
          order_ba_raw?: Json | null
          order_ba_reasoning?: string | null
          order_ba_verdict: string
          outcome_seat1?: number | null
          position_disagreement?: boolean | null
          prompt_tokens?: number | null
          rubric_hash?: string | null
          rubric_text: string
          rubric_version: string
          verdict: string
          verdict_summary?: string | null
        }
        Update: {
          bt_p_seat1_beats_seat2?: number | null
          bt_score_seat1?: number | null
          bt_score_seat2?: number | null
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          id?: string
          is_current?: boolean
          judge_model?: string
          judge_model_version?: string
          judge_provider?: string | null
          judge_temperature?: number | null
          latency_ms?: number | null
          match_id?: string
          order_ab_axis_scores?: Json | null
          order_ab_favored_user_id?: string | null
          order_ab_raw?: Json | null
          order_ab_reasoning?: string | null
          order_ab_verdict?: string
          order_ba_axis_scores?: Json | null
          order_ba_favored_user_id?: string | null
          order_ba_raw?: Json | null
          order_ba_reasoning?: string | null
          order_ba_verdict?: string
          outcome_seat1?: number | null
          position_disagreement?: boolean | null
          prompt_tokens?: number | null
          rubric_hash?: string | null
          rubric_text?: string
          rubric_version?: string
          verdict?: string
          verdict_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "judgments_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      ladders: {
        Row: {
          created_at: string
          description: string
          display_order: number
          is_rated: boolean
          layer: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          description: string
          display_order: number
          is_rated?: boolean
          layer: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          description?: string
          display_order?: number
          is_rated?: boolean
          layer?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      league_divisions: {
        Row: {
          capacity: number
          created_at: string
          ends_at: string
          id: string
          league_id: string
          season_id: number | null
          starts_at: string
          world_slug: string | null
        }
        Insert: {
          capacity?: number
          created_at?: string
          ends_at: string
          id?: string
          league_id: string
          season_id?: number | null
          starts_at: string
          world_slug?: string | null
        }
        Update: {
          capacity?: number
          created_at?: string
          ends_at?: string
          id?: string
          league_id?: string
          season_id?: number | null
          starts_at?: string
          world_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_divisions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_divisions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_divisions_world_slug_fkey"
            columns: ["world_slug"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["slug"]
          },
        ]
      }
      league_members: {
        Row: {
          division_id: string
          id: string
          joined_at: string
          points: number
          promoted_at: string | null
          promoted_to_division_id: string | null
          rank: number | null
          user_id: string
        }
        Insert: {
          division_id: string
          id?: string
          joined_at?: string
          points?: number
          promoted_at?: string | null
          promoted_to_division_id?: string | null
          rank?: number | null
          user_id: string
        }
        Update: {
          division_id?: string
          id?: string
          joined_at?: string
          points?: number
          promoted_at?: string | null
          promoted_to_division_id?: string | null
          rank?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "league_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_promoted_to_division_id_fkey"
            columns: ["promoted_to_division_id"]
            isOneToOne: false
            referencedRelation: "league_divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          id: string
          name: string
          promote_top_n: number
          slug: string
          tier: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          promote_top_n?: number
          slug: string
          tier: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          promote_top_n?: number
          slug?: string
          tier?: number
        }
        Relationships: []
      }
      match_participants: {
        Row: {
          bot_slug: string | null
          created_at: string
          is_bot: boolean
          match_id: string
          rating_after: number | null
          rating_before: number | null
          rating_delta: number | null
          result: string
          seat: number
          submitted_at: string | null
          theta_after: number | null
          theta_before: number | null
          user_id: string | null
        }
        Insert: {
          bot_slug?: string | null
          created_at?: string
          is_bot?: boolean
          match_id: string
          rating_after?: number | null
          rating_before?: number | null
          rating_delta?: number | null
          result?: string
          seat: number
          submitted_at?: string | null
          theta_after?: number | null
          theta_before?: number | null
          user_id?: string | null
        }
        Update: {
          bot_slug?: string | null
          created_at?: string
          is_bot?: boolean
          match_id?: string
          rating_after?: number | null
          rating_before?: number | null
          rating_delta?: number | null
          result?: string
          seat?: number
          submitted_at?: string | null
          theta_after?: number | null
          theta_before?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "match_participants_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          constraint_text: string | null
          created_at: string
          id: string
          is_rated: boolean
          item_id: number | null
          ladder_slug: string
          prompt_snapshot: Json | null
          resolved_at: string | null
          season_id: number | null
          source: string
          status: string
          time_limit_ms: number | null
          world_slug: string
        }
        Insert: {
          constraint_text?: string | null
          created_at?: string
          id?: string
          is_rated?: boolean
          item_id?: number | null
          ladder_slug: string
          prompt_snapshot?: Json | null
          resolved_at?: string | null
          season_id?: number | null
          source?: string
          status?: string
          time_limit_ms?: number | null
          world_slug: string
        }
        Update: {
          constraint_text?: string | null
          created_at?: string
          id?: string
          is_rated?: boolean
          item_id?: number | null
          ladder_slug?: string
          prompt_snapshot?: Json | null
          resolved_at?: string | null
          season_id?: number | null
          source?: string
          status?: string
          time_limit_ms?: number | null
          world_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_ladder_slug_fkey"
            columns: ["ladder_slug"]
            isOneToOne: false
            referencedRelation: "ladders"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "matches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_world_slug_fkey"
            columns: ["world_slug"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["slug"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          day_cutoff_hour: number
          display_name: string | null
          handle: string | null
          id: string
          is_guest: boolean
          last_active_at: string
          locale: string
          primary_world_slug: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          day_cutoff_hour?: number
          display_name?: string | null
          handle?: string | null
          id: string
          is_guest?: boolean
          last_active_at?: string
          locale?: string
          primary_world_slug?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          day_cutoff_hour?: number
          display_name?: string | null
          handle?: string | null
          id?: string
          is_guest?: boolean
          last_active_at?: string
          locale?: string
          primary_world_slug?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_primary_world_slug_fkey"
            columns: ["primary_world_slug"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["slug"]
          },
        ]
      }
      review_log: {
        Row: {
          card_id: number
          created_at: string
          day_cutoff_hour: number
          difficulty_before: number | null
          due_before: string | null
          elapsed_days: number | null
          fsrs_version: string
          id: number
          is_cram: boolean
          is_manual: boolean
          learning_steps_before: number
          params_id: number | null
          request_retention: number
          review_duration: number
          review_rating: number
          review_state: number
          review_time: string
          scheduled_days_before: number
          stability_before: number | null
          state_before: number
          tz: string
          user_id: string
        }
        Insert: {
          card_id: number
          created_at?: string
          day_cutoff_hour?: number
          difficulty_before?: number | null
          due_before?: string | null
          elapsed_days?: number | null
          fsrs_version?: string
          id?: number
          is_cram?: boolean
          is_manual?: boolean
          learning_steps_before?: number
          params_id?: number | null
          request_retention: number
          review_duration?: number
          review_rating: number
          review_state: number
          review_time: string
          scheduled_days_before?: number
          stability_before?: number | null
          state_before: number
          tz: string
          user_id: string
        }
        Update: {
          card_id?: number
          created_at?: string
          day_cutoff_hour?: number
          difficulty_before?: number | null
          due_before?: string | null
          elapsed_days?: number | null
          fsrs_version?: string
          id?: number
          is_cram?: boolean
          is_manual?: boolean
          learning_steps_before?: number
          params_id?: number | null
          request_retention?: number
          review_duration?: number
          review_rating?: number
          review_state?: number
          review_time?: string
          scheduled_days_before?: number
          stability_before?: number | null
          state_before?: number
          tz?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_log_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "card"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_log_params_id_fkey"
            columns: ["params_id"]
            isOneToOne: false
            referencedRelation: "fsrs_params"
            referencedColumns: ["id"]
          },
        ]
      }
      rivalries: {
        Row: {
          draws: number
          first_match_at: string
          id: string
          last_match_at: string
          matches_played: number | null
          user_a: string
          user_b: string
          wins_a: number
          wins_b: number
          world_slug: string
        }
        Insert: {
          draws?: number
          first_match_at?: string
          id?: string
          last_match_at?: string
          matches_played?: number | null
          user_a: string
          user_b: string
          wins_a?: number
          wins_b?: number
          world_slug: string
        }
        Update: {
          draws?: number
          first_match_at?: string
          id?: string
          last_match_at?: string
          matches_played?: number | null
          user_a?: string
          user_b?: string
          wins_a?: number
          wins_b?: number
          world_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "rivalries_world_slug_fkey"
            columns: ["world_slug"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["slug"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          ends_at: string
          id: number
          name: string
          slug: string
          starts_at: string
          theme: string | null
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: never
          name: string
          slug: string
          starts_at: string
          theme?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: never
          name?: string
          slug?: string
          starts_at?: string
          theme?: string | null
        }
        Relationships: []
      }
      submissions: {
        Row: {
          client_tz: string | null
          content: string | null
          elapsed_ms: number | null
          id: string
          integrity_flags: Json | null
          keystroke_features: Json | null
          match_id: string
          media_path: string | null
          paste_detected: boolean
          seat: number
          selected_option: string | null
          submitted_at: string
          user_id: string | null
        }
        Insert: {
          client_tz?: string | null
          content?: string | null
          elapsed_ms?: number | null
          id?: string
          integrity_flags?: Json | null
          keystroke_features?: Json | null
          match_id: string
          media_path?: string | null
          paste_detected?: boolean
          seat: number
          selected_option?: string | null
          submitted_at?: string
          user_id?: string | null
        }
        Update: {
          client_tz?: string | null
          content?: string | null
          elapsed_ms?: number | null
          id?: string
          integrity_flags?: Json | null
          keystroke_features?: Json | null
          match_id?: string
          media_path?: string | null
          paste_detected?: boolean
          seat?: number
          selected_option?: string | null
          submitted_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submissions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submissions_seat_fk"
            columns: ["match_id", "seat"]
            isOneToOne: true
            referencedRelation: "match_participants"
            referencedColumns: ["match_id", "seat"]
          },
          {
            foreignKeyName: "submissions_seat_user_fk"
            columns: ["match_id", "seat", "user_id"]
            isOneToOne: false
            referencedRelation: "match_participants"
            referencedColumns: ["match_id", "seat", "user_id"]
          },
        ]
      }
      user_concept_mastery: {
        Row: {
          concept_id: number
          correct_count: number
          first_seen_at: string
          last_review_at: string | null
          mastery: number
          mastery_logit: number | null
          observations: number
          updated_at: string
          user_id: string
        }
        Insert: {
          concept_id: number
          correct_count?: number
          first_seen_at?: string
          last_review_at?: string | null
          mastery?: number
          mastery_logit?: number | null
          observations?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          concept_id?: number
          correct_count?: number
          first_seen_at?: string
          last_review_at?: string | null
          mastery?: number
          mastery_logit?: number | null
          observations?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_concept_mastery_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_ratings: {
        Row: {
          created_at: string
          games_played: number
          ladder_slug: string
          last_played_at: string | null
          peak_rating: number | null
          peak_reached_at: string | null
          peak_season_id: number | null
          peak_theta: number
          rating: number | null
          theta: number
          uncertainty: number
          updated_at: string
          user_id: string
          world_slug: string
        }
        Insert: {
          created_at?: string
          games_played?: number
          ladder_slug: string
          last_played_at?: string | null
          peak_rating?: number | null
          peak_reached_at?: string | null
          peak_season_id?: number | null
          peak_theta?: number
          rating?: number | null
          theta?: number
          uncertainty?: number
          updated_at?: string
          user_id: string
          world_slug: string
        }
        Update: {
          created_at?: string
          games_played?: number
          ladder_slug?: string
          last_played_at?: string | null
          peak_rating?: number | null
          peak_reached_at?: string | null
          peak_season_id?: number | null
          peak_theta?: number
          rating?: number | null
          theta?: number
          uncertainty?: number
          updated_at?: string
          user_id?: string
          world_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_ratings_ladder_slug_fkey"
            columns: ["ladder_slug"]
            isOneToOne: false
            referencedRelation: "ladders"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "user_ratings_peak_season_id_fkey"
            columns: ["peak_season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_ratings_world_slug_fkey"
            columns: ["world_slug"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_worlds: {
        Row: {
          joined_at: string
          last_active_at: string
          user_id: string
          world_slug: string
        }
        Insert: {
          joined_at?: string
          last_active_at?: string
          user_id: string
          world_slug: string
        }
        Update: {
          joined_at?: string
          last_active_at?: string
          user_id?: string
          world_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_worlds_world_slug_fkey"
            columns: ["world_slug"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["slug"]
          },
        ]
      }
      worlds: {
        Row: {
          atmos_hex: string
          concept: string
          created_at: string
          deep_hex: string
          display_order: number
          dusk_hex: string
          hue: number
          is_launched: boolean
          mark_hex: string
          name_en: string
          native_name: string
          slug: string
        }
        Insert: {
          atmos_hex: string
          concept: string
          created_at?: string
          deep_hex: string
          display_order: number
          dusk_hex: string
          hue: number
          is_launched?: boolean
          mark_hex: string
          name_en: string
          native_name: string
          slug: string
        }
        Update: {
          atmos_hex?: string
          concept?: string
          created_at?: string
          deep_hex?: string
          display_order?: number
          dusk_hex?: string
          hue?: number
          is_launched?: boolean
          mark_hex?: string
          name_en?: string
          native_name?: string
          slug?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      altitude_band: { Args: { rating: number }; Returns: string }
      delete_stale_anonymous_users: {
        Args: { max_rows?: number; older_than?: string; played_grace?: string }
        Returns: number
      }
      has_own_submission: { Args: { p_match_id: string }; Returns: boolean }
      is_match_participant: { Args: { p_match_id: string }; Returns: boolean }
      owns_match_seat: {
        Args: { p_match_id: string; p_seat: number }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

